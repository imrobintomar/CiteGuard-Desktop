use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

use crate::ollama::types::{ChatRequest, Message, Tool, ToolFunction};
use crate::AppState;

#[cfg(debug_assertions)]
fn dbg(msg: &str) {
    eprintln!("[CG] {msg}");
}

#[cfg(not(debug_assertions))]
fn dbg(_msg: &str) {}

#[derive(Debug, Deserialize)]
pub struct SendMessageArgs {
    pub conversation_id: String,
    pub messages: Vec<UiMessage>,
    pub model: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct UiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct SendMessageResult {
    pub success: bool,
    pub error: Option<String>,
}

/// Main command: send a message, run the tool-call loop, stream tokens to frontend.
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    args: SendMessageArgs,
) -> Result<SendMessageResult, String> {
    dbg(&format!("send_message: model={} msgs={} conv_id={}",
        args.model, args.messages.len(), args.conversation_id));
    match run_chat_loop(&app, &state, args).await {
        Ok(_) => Ok(SendMessageResult { success: true, error: None }),
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit("chat-error", serde_json::json!({ "error": &msg }));
            Ok(SendMessageResult { success: false, error: Some(msg) })
        }
    }
}

async fn run_chat_loop(
    app: &AppHandle,
    state: &AppState,
    args: SendMessageArgs,
) -> Result<()> {
    let mcp = state.mcp.lock().await;
    let mcp_ref = mcp.as_ref();

    // Convert UI messages to Ollama messages
    let mut messages: Vec<Message> = args.messages.iter().map(|m| Message {
        role: m.role.clone(),
        content: m.content.clone(),
        tool_calls: None,
        tool_call_id: None,
    }).collect();

    // Build tool definitions from MCP tool schemas
    let tools: Option<Vec<Tool>> = mcp_ref.map(|m| {
        m.tools.iter().map(|t| Tool {
            r#type: "function".into(),
            function: ToolFunction {
                name: t.name.clone(),
                description: t.description.clone().unwrap_or_default(),
                parameters: t.input_schema.clone(),
            },
        }).collect()
    });

    let client = state.ollama.client();
    let conv_id = args.conversation_id.clone();

    dbg(&format!("run_chat_loop started, MCP available: {}, model: {}, msg_count: {}",
        mcp_ref.is_some(), args.model, args.messages.len()));
    if let Some(m) = mcp_ref {
        dbg(&format!("MCP tools available: {}", m.tools.iter().map(|t| t.name.as_str()).collect::<Vec<_>>().join(", ")));
    }

    // Warn when the conversation is approaching Qwen3:14b's 32K context limit.
    // Rough estimate: 4 chars ≈ 1 token; warn at 28K tokens to leave headroom.
    let total_chars: usize = messages.iter().map(|m| m.content.len()).sum();
    let estimated_tokens = total_chars / 4;
    if estimated_tokens > 28_000 {
        warn!("Context near limit: ~{estimated_tokens} tokens estimated — model may truncate");
        let _ = app.emit("chat-warning", serde_json::json!({
            "message": format!(
                "Your manuscript is very large (~{} tokens estimated). The model may not be able to verify all references in one pass. Consider splitting it into sections.",
                estimated_tokens
            )
        }));
    }

    // Tool-call loop — max 12 rounds (large manuscripts may have 100+ references requiring many verify_reference calls)
    for round in 0..12 {
        dbg(&format!("Round {round}: calling stream_chat with {} messages", messages.len()));
        let request = ChatRequest {
            model: args.model.clone(),
            messages: messages.clone(),
            stream: true,
            tools: tools.clone(),
            // think:true — Qwen3 emits <think>…</think> tokens then the actual response.
            // With think:false Ollama strips thinking internally; the model sometimes
            // exhausts its budget then emits zero response tokens (silent failure).
            // Our Rust streaming code already filters <think> blocks from the UI.
            options: Some(serde_json::json!({ "temperature": 0.1, "think": true })),
            keep_alive: Some("1h".into()), // keep model in VRAM for 1 hour
        };

        let tool_calls = client.stream_chat(app, request, conv_id.clone()).await?;
        dbg(&format!("Round {round}: stream_chat returned, tool_calls={}", tool_calls.as_ref().map(|v| v.len()).unwrap_or(0)));

        match tool_calls {
            None => {
                dbg("No tool calls — done");
                info!("Chat complete after {} tool rounds", round);
                break;
            }
            Some(_calls) if mcp_ref.is_none() => {
                // No MCP available, can't execute tools
                dbg("Tool calls requested but MCP unavailable");
                let _ = app.emit("chat-error", serde_json::json!({
                    "error": "Model requested tool use but MCP is not available"
                }));
                break;
            }
            Some(calls) => {
                let mcp = mcp_ref.unwrap();
                dbg(&format!("Round {round}: executing {} tool call(s): {}",
                    calls.len(),
                    calls.iter().map(|c| c.function.name.as_str()).collect::<Vec<_>>().join(", ")));

                // Add assistant message with tool_calls
                messages.push(Message {
                    role: "assistant".into(),
                    content: String::new(),
                    tool_calls: Some(calls.clone()),
                    tool_call_id: None,
                });

                // Execute each tool call and append results
                for tc in &calls {
                    let args_value: Value = tc.function.arguments.clone();
                    dbg(&format!("Calling tool: {} args={}", tc.function.name, args_value));

                    // Emit event so UI shows the tool being called
                    let _ = app.emit("tool-call-start", serde_json::json!({
                        "conversation_id": conv_id,
                        "tool_name": &tc.function.name,
                        "tool_call_id": &tc.id,
                        "args": &args_value,
                    }));

                    let result = mcp.call_tool(&tc.function.name, args_value).await
                        .unwrap_or_else(|e| { dbg(&format!("Tool {} error: {e}", tc.function.name)); format!("{{\"error\": \"{e}\"}}") });

                    dbg(&format!("Tool {} result len: {}", tc.function.name, result.len()));

                    let _ = app.emit("tool-call-done", serde_json::json!({
                        "conversation_id": conv_id,
                        "tool_name": &tc.function.name,
                        "tool_call_id": &tc.id,
                        "result": &result,
                    }));

                    messages.push(Message {
                        role: "tool".into(),
                        content: result,
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                    });
                }
            }
        }
    }
    dbg("run_chat_loop finished");

    Ok(())
}

/// Direct MCP tool call — used by retraction-alert background checks.
#[tauri::command]
pub async fn call_mcp_tool(
    state: State<'_, AppState>,
    tool_name: String,
    args: serde_json::Value,
) -> Result<String, String> {
    let mcp_guard = state.mcp.lock().await;
    let mcp = mcp_guard.as_ref().ok_or("MCP not available")?;
    mcp.call_tool(&tool_name, args).await.map_err(|e| e.to_string())
}
