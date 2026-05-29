#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── MCP JSON-RPC 2.0 types ────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: &'static str,
    pub id: u64,
    pub method: String,
    pub params: Value,
}

impl JsonRpcRequest {
    pub fn new(id: u64, method: impl Into<String>, params: Value) -> Self {
        Self { jsonrpc: "2.0", id, method: method.into(), params }
    }
}

#[derive(Debug, Deserialize)]
pub struct JsonRpcResponse {
    pub id: Option<u64>,
    pub result: Option<Value>,
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
}

// MCP initialize response
#[derive(Debug, Deserialize)]
pub struct InitializeResult {
    pub protocol_version: Option<String>,
    pub capabilities: Option<Value>,
}

// MCP tool definition (returned by tools/list)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

#[derive(Debug, Deserialize)]
pub struct ListToolsResult {
    pub tools: Vec<McpTool>,
}

// MCP tool call result
#[derive(Debug, Deserialize)]
pub struct CallToolResult {
    pub content: Vec<ToolContent>,
    #[serde(rename = "isError")]
    pub is_error: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ToolContent {
    pub r#type: String,
    pub text: Option<String>,
}
