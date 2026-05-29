use anyhow::{Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use std::io::Write;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tracing::warn;

use super::types::*;

fn dbg(msg: &str) {
    eprintln!("[CG] {msg}");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open("/tmp/cg-debug.log") {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        let _ = writeln!(f, "[{ts}] ollama: {msg}");
    }
}

pub const BASE_URL: &str = "http://127.0.0.1:11435";

pub struct OllamaClient {
    http: Client,
}

impl OllamaClient {
    pub fn new() -> Self {
        Self {
            http: Client::builder()
                .timeout(Duration::from_secs(600)) // 10 min — local LLMs are slow
                .build()
                .expect("HTTP client"),
        }
    }

    /// Check if the bundled Ollama instance is reachable.
    pub async fn is_alive(&self) -> bool {
        self.http
            .get(format!("{BASE_URL}/api/tags"))
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Stream a chat completion; emits "chat-token" and "chat-done" Tauri events.
    pub async fn stream_chat(
        &self,
        app: &AppHandle,
        request: ChatRequest,
        conversation_id: String,
    ) -> Result<Option<Vec<ToolCall>>> {
        let resp = self
            .http
            .post(format!("{BASE_URL}/api/chat"))
            .json(&request)
            .send()
            .await
            .context("Ollama chat request")?;

        if !resp.status().is_success() {
            let msg = resp.text().await.unwrap_or_default();
            anyhow::bail!("Ollama error: {msg}");
        }

        dbg(&format!("stream_chat: HTTP {}, starting stream", resp.status()));
        let mut stream = resp.bytes_stream();
        let mut pending_tool_calls: Vec<ToolCall> = Vec::new();
        let mut content_buffer = String::new();
        let mut in_thinking_block = false; // suppress <think>…</think> from Qwen3
        let mut done_emitted = false;
        let mut line_buf = String::new(); // handles JSON objects split across TCP chunks
        let mut chunk_count = 0usize;
        let mut line_count = 0usize;

        'stream: while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("stream read")?;
            chunk_count += 1;
            let text = std::str::from_utf8(&chunk).unwrap_or_default();
            line_buf.push_str(text);
            if chunk_count <= 3 || chunk_count % 50 == 0 {
                dbg(&format!("chunk #{chunk_count} len={}", chunk.len()));
            }

            // Process every complete NDJSON line
            while let Some(pos) = line_buf.find('\n') {
                let line = line_buf[..pos].trim().to_string();
                line_buf = line_buf[pos + 1..].to_string();

                if line.is_empty() { continue; }
                line_count += 1;

                match serde_json::from_str::<ChatChunk>(&line) {
                    Ok(parsed) => {
                        if line_count <= 3 || parsed.done {
                            dbg(&format!("line #{line_count}: done={} tool_calls={} content_len={}",
                                parsed.done,
                                parsed.message.as_ref().and_then(|m| m.tool_calls.as_ref()).map(|t| t.len()).unwrap_or(0),
                                parsed.message.as_ref().and_then(|m| m.content.as_ref()).map(|c| c.len()).unwrap_or(0)
                            ));
                        }
                        if let Some(msg) = &parsed.message {
                            if let Some(tc) = &msg.tool_calls {
                                pending_tool_calls.extend(tc.clone());
                            }
                            if let Some(token) = &msg.content {
                                if !token.is_empty() {
                                    // Filter Qwen3 thinking tokens: suppress <think>…</think> blocks
                                    if token.contains("<think>") { in_thinking_block = true; }
                                    if token.contains("</think>") { in_thinking_block = false; }
                                    if !in_thinking_block && !token.contains("<think>") {
                                        // Strip any residual </think> tag before emitting
                                        let visible = token.replace("</think>", "").trim_start_matches('\n').to_string();
                                        if !visible.is_empty() {
                                            content_buffer.push_str(&visible);
                                            let _ = app.emit("chat-token", serde_json::json!({
                                                "conversation_id": conversation_id,
                                                "token": visible,
                                            }));
                                        }
                                    }
                                }
                            }
                        }
                        if parsed.done {
                            let _ = app.emit("chat-done", serde_json::json!({
                                "conversation_id": conversation_id,
                                "has_tool_calls": !pending_tool_calls.is_empty(),
                            }));
                            done_emitted = true;
                            break 'stream; // exit both loops immediately — don't wait for connection close
                        }
                    }
                    Err(e) => {
                        dbg(&format!("PARSE ERROR: {} | line={}", e, &line[..line.len().min(300)]));
                    }
                }
            }
        }

        dbg(&format!("stream ended: chunks={chunk_count} lines={line_count} done_emitted={done_emitted} tool_calls={}", pending_tool_calls.len()));
        // Safety net: if stream ended without a done:true line, unblock the frontend
        if !done_emitted {
            warn!("Stream ended without done:true — emitting chat-done as fallback");
            dbg("WARNING: no done:true received — using fallback");
            let _ = app.emit("chat-done", serde_json::json!({
                "conversation_id": conversation_id,
                "has_tool_calls": !pending_tool_calls.is_empty(),
            }));
        }

        // Detect silent failure: model completed with no content and no tool calls.
        // This happens with Qwen3 when think:false causes it to exhaust its thinking
        // budget then emit nothing. Surface a visible error rather than an empty bubble.
        if content_buffer.is_empty() && pending_tool_calls.is_empty() {
            warn!("Model returned no content and no tool calls — emitting fallback token");
            let _ = app.emit("chat-token", serde_json::json!({
                "conversation_id": conversation_id,
                "token": "I wasn't able to process this request (the model returned no output). Please try sending the message again, or try rephrasing it.",
            }));
        }

        if !pending_tool_calls.is_empty() {
            Ok(Some(pending_tool_calls))
        } else {
            Ok(None)
        }
    }

    /// Evict every currently-loaded model from VRAM before warming up a new one.
    /// This prevents a large model from being blocked by a previously-pinned smaller model.
    pub async fn evict_all_models(&self) {
        let Ok(resp) = self.http.get(format!("{BASE_URL}/api/ps")).send().await else { return };
        let Ok(body) = resp.json::<serde_json::Value>().await else { return };
        if let Some(models) = body["models"].as_array() {
            for m in models {
                if let Some(name) = m["name"].as_str() {
                    dbg(&format!("evicting {} from VRAM", name));
                    let _ = self.http
                        .post(format!("{BASE_URL}/api/chat"))
                        .json(&serde_json::json!({ "model": name, "messages": [], "keep_alive": 0 }))
                        .timeout(Duration::from_secs(10))
                        .send()
                        .await;
                }
            }
        }
    }

    /// Silently load `model` into VRAM with keep_alive=1h so the first real
    /// request is instant. Fires-and-forgets any error.
    pub async fn warmup(&self, model: &str) {
        self.evict_all_models().await; // clear VRAM before loading new model
        let body = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "hi"}],
            "stream": false,
            "keep_alive": "1h"
        });
        let _ = self.http
            .post(format!("{BASE_URL}/api/chat"))
            .json(&body)
            .timeout(Duration::from_secs(300)) // 32B may take ~2 min to load
            .send()
            .await;
    }

    pub async fn list_models(&self) -> Result<Vec<OllamaModel>> {
        let resp: ListModelsResponse = self
            .http
            .get(format!("{BASE_URL}/api/tags"))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.models)
    }

    /// Pull a model with streaming progress events.
    pub async fn pull_model(&self, app: &AppHandle, model_name: &str) -> Result<()> {
        let resp = self
            .http
            .post(format!("{BASE_URL}/api/pull"))
            .json(&serde_json::json!({ "name": model_name, "stream": true }))
            .timeout(Duration::from_secs(7200)) // 2 hours for large models
            .send()
            .await
            .context("pull request")?;

        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = std::str::from_utf8(&chunk).unwrap_or_default();
            for line in text.lines() {
                if line.trim().is_empty() { continue; }
                if let Ok(progress) = serde_json::from_str::<PullProgress>(line) {
                    let pct = if let (Some(total), Some(done)) = (progress.total, progress.completed) {
                        if total > 0 { (done as f64 / total as f64 * 100.0) as u8 } else { 0 }
                    } else { 0 };
                    let _ = app.emit("model-pull-progress", serde_json::json!({
                        "model": model_name,
                        "status": progress.status,
                        "percent": pct,
                        "total_bytes": progress.total,
                        "done_bytes": progress.completed,
                    }));
                }
            }
        }
        Ok(())
    }

    pub async fn delete_model(&self, model_name: &str) -> Result<()> {
        self.http
            .delete(format!("{BASE_URL}/api/delete"))
            .json(&serde_json::json!({ "name": model_name }))
            .send()
            .await?;
        Ok(())
    }
}
