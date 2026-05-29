use anyhow::{Context, Result};
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use tracing::{debug, info, warn};

use super::protocol::*;

/// Manages a single MCP subprocess communicating over stdio (JSON-RPC 2.0).
pub struct McpClient {
    stdin: Arc<Mutex<ChildStdin>>,
    stdout: Arc<Mutex<BufReader<ChildStdout>>>,
    process: Child,
    id_counter: AtomicU64,
    pub tools: Vec<McpTool>,
}

impl McpClient {
    /// Spawn the MCP subprocess and perform the MCP handshake.
    /// `mcp_dir` is the working directory (must contain node_modules/).
    pub async fn spawn(bun_bin: &PathBuf, mcp_script: &PathBuf, mcp_dir: &PathBuf) -> Result<Self> {
        info!("Spawning MCP: {} {}", bun_bin.display(), mcp_script.display());

        let mut cmd = Command::new(bun_bin);
        cmd.arg("run")
            .arg(mcp_script)
            .current_dir(mcp_dir)
            .env("NODE_ENV", "production")
            .env("MAILTO", option_env!("MAILTO").unwrap_or(""))
            .env("RATE_LIMIT_PUBMED_RPS", "10")
            .env("RATE_LIMIT_SEMANTIC_SCHOLAR_RPS", "1");

        if let Some(k) = option_env!("NCBI_API_KEY") { cmd.env("NCBI_API_KEY", k); }
        if let Some(k) = option_env!("SEMANTIC_SCHOLAR_API_KEY") { cmd.env("SEMANTIC_SCHOLAR_API_KEY", k); }

        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("failed to spawn MCP subprocess")?;

        let stdin = child.stdin.take().context("no stdin")?;
        let stdout = child.stdout.take().context("no stdout")?;

        let mut client = Self {
            stdin: Arc::new(Mutex::new(stdin)),
            stdout: Arc::new(Mutex::new(BufReader::new(stdout))),
            process: child,
            id_counter: AtomicU64::new(1),
            tools: Vec::new(),
        };

        client.initialize().await?;
        client.tools = client.list_tools().await?;
        info!("MCP ready with {} tools", client.tools.len());

        Ok(client)
    }

    async fn send(&self, req: &JsonRpcRequest) -> Result<JsonRpcResponse> {
        let mut line = serde_json::to_string(req)?;
        line.push('\n');

        {
            let mut stdin = self.stdin.lock().await;
            stdin.write_all(line.as_bytes()).await?;
            stdin.flush().await?;
        }

        let mut response_line = String::new();
        // 20s timeout — MCP server fans out to multiple APIs concurrently; 20s is sufficient
        // for even slow academic APIs without blocking the serialized stdout channel too long
        timeout(Duration::from_secs(20), async {
            self.stdout.lock().await.read_line(&mut response_line).await
        })
        .await
        .map_err(|_| anyhow::anyhow!("MCP tool call timed out after 20s"))?
        .context("MCP read_line failed")?;

        debug!("MCP response: {}", response_line.trim());
        let resp: JsonRpcResponse = serde_json::from_str(response_line.trim())?;
        Ok(resp)
    }

    async fn initialize(&self) -> Result<()> {
        let req = JsonRpcRequest::new(
            self.next_id(),
            "initialize",
            serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "citeguard-desktop", "version": "1.0.0" }
            }),
        );
        let resp = self.send(&req).await?;
        if let Some(err) = resp.error {
            anyhow::bail!("MCP init error: {}", err.message);
        }
        // Send initialized notification
        let notif = serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/initialized", "params": {} });
        let mut line = serde_json::to_string(&notif)?;
        line.push('\n');
        self.stdin.lock().await.write_all(line.as_bytes()).await?;
        Ok(())
    }

    async fn list_tools(&self) -> Result<Vec<McpTool>> {
        let req = JsonRpcRequest::new(self.next_id(), "tools/list", serde_json::json!({}));
        let resp = self.send(&req).await?;
        let result = resp.result.context("no result from tools/list")?;
        let list: ListToolsResult = serde_json::from_value(result)?;
        Ok(list.tools)
    }

    /// Execute a single tool and return the text result.
    pub async fn call_tool(&self, tool_name: &str, arguments: Value) -> Result<String> {
        info!("MCP calling tool: {} args={}", tool_name, arguments);
        let req = JsonRpcRequest::new(
            self.next_id(),
            "tools/call",
            serde_json::json!({ "name": tool_name, "arguments": arguments }),
        );
        let resp = self.send(&req).await.map_err(|e| {
            warn!("MCP tool '{}' failed: {}", tool_name, e);
            e
        })?;
        info!("MCP tool '{}' returned", tool_name);

        if let Some(err) = resp.error {
            return Ok(format!("{{\"error\": \"{}\"}}", err.message));
        }

        let result: CallToolResult = serde_json::from_value(resp.result.unwrap_or_default())?;
        let text = result.content.into_iter()
            .filter_map(|c| c.text)
            .collect::<Vec<_>>()
            .join("");
        Ok(text)
    }

    /// Cheap liveness check: sends tools/list with a 5-second cap.
    /// Safe to call only when no other send() is in flight (i.e. while holding the mcp Mutex).
    pub async fn ping(&self) -> bool {
        let req = JsonRpcRequest::new(self.next_id(), "tools/list", serde_json::json!({}));
        timeout(Duration::from_secs(5), self.send(&req))
            .await
            .is_ok_and(|r| r.is_ok())
    }

    /// Kill the subprocess and reap it, preventing zombie processes.
    /// Must be called before replacing a dead McpClient with a fresh one.
    pub async fn shutdown(mut self) {
        let _ = self.process.kill().await;
        let _ = self.process.wait().await;
    }

    fn next_id(&self) -> u64 {
        self.id_counter.fetch_add(1, Ordering::SeqCst)
    }
}
