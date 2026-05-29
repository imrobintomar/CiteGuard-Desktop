import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Types mirroring Rust structs ──────────────────────────────────────────────

export interface ModelInfo {
  name: string;
  downloaded: boolean;
  size_bytes?: number;
}

export interface GpuInfo {
  total_vram_mb: number;
  gpu_names: string[];
  recommended_model: string;
}

export interface AppSettings {
  active_model: string;
  setup_complete: boolean;
  theme: string;
}

export interface UiMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
}

export interface SendMessageArgs {
  conversation_id: string;
  messages: UiMessage[];
  model: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export const bridge = {
  sendMessage: (args: SendMessageArgs) =>
    invoke<{ success: boolean; error?: string }>("send_message", { args }),

  listModels: () => invoke<ModelInfo[]>("list_models"),
  pullModel:  (model_name: string) => invoke<void>("pull_model", { model_name }),
  checkOllama: () => invoke<boolean>("check_ollama_status"),
  startOllama: () => invoke<void>("start_ollama"),
  detectGpu:   () => invoke<GpuInfo>("detect_gpu"),

  getSettings:       () => invoke<AppSettings>("get_settings"),
  saveSettings:      (settings: AppSettings) => invoke<void>("save_settings", { settings }),
  markSetupComplete: () => invoke<void>("mark_setup_complete"),

  callMcpTool: (toolName: string, args: Record<string, unknown>) =>
    invoke<string>("call_mcp_tool", { tool_name: toolName, args }),

  razorpayVerifyPayment: (paymentId: string, uid: string, idToken: string) =>
    invoke<import("./firebase").UserProfile>("razorpay_verify_payment", {
      paymentId,
      uid,
      idToken,
    }),
};

// ── Event listeners ───────────────────────────────────────────────────────────

export interface ChatTokenEvent  { conversation_id: string; token: string }
export interface ChatDoneEvent   { conversation_id: string; has_tool_calls: boolean }
export interface ToolCallStart   { conversation_id: string; tool_name: string; tool_call_id: string; args: unknown }
export interface ToolCallDone    { conversation_id: string; tool_name: string; tool_call_id: string; result: string }
export interface PullProgressEvent { model: string; status: string; percent: number; total_bytes?: number; done_bytes?: number }

export const onChatToken      = (cb: (e: ChatTokenEvent)    => void): Promise<UnlistenFn> => listen("chat-token",           (e) => cb(e.payload as ChatTokenEvent));
export const onChatDone       = (cb: (e: ChatDoneEvent)      => void): Promise<UnlistenFn> => listen("chat-done",            (e) => cb(e.payload as ChatDoneEvent));
export const onToolCallStart  = (cb: (e: ToolCallStart)      => void): Promise<UnlistenFn> => listen("tool-call-start",      (e) => cb(e.payload as ToolCallStart));
export const onToolCallDone   = (cb: (e: ToolCallDone)       => void): Promise<UnlistenFn> => listen("tool-call-done",       (e) => cb(e.payload as ToolCallDone));
export const onPullProgress   = (cb: (e: PullProgressEvent)  => void): Promise<UnlistenFn> => listen("model-pull-progress",  (e) => cb(e.payload as PullProgressEvent));
export const onChatError      = (cb: (e: { error: string })  => void): Promise<UnlistenFn> => listen("chat-error",           (e) => cb(e.payload as { error: string }));
