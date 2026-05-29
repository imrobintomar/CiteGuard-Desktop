import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Send, PlusCircle, Trash2, Paperclip, Loader2, X } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";
import { useChat } from "../../hooks/useChat";
import { MessageBubble } from "./MessageBubble";
import { extractTextFromFile, buildVerificationPrompt, getSupportedFileType } from "../../lib/file-processor";

export function ChatWindow() {
  const [input, setInput] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileAttached, setFileAttached] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const filePromptRef = useRef<string | null>(null); // stores extracted prompt without bloating textarea
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sendMessage, isStreaming } = useChat();
  const { activeConversation, newConversation, setActive, clearConversation } = useChatStore();
  const { activeModel, ollamaReady } = useModelStore();
  const conv = activeConversation();

  // Derive the name of any currently-running tool call
  const runningTool = conv?.messages
    .flatMap((m) => m.toolCalls ?? [])
    .find((tc) => tc.status === "running")?.toolName ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length, conv?.messages[conv.messages.length - 1]?.content]);

  const clearFile = () => {
    setFileAttached(null);
    setFileError(null);
    filePromptRef.current = null;
  };

  const submit = async () => {
    // Use extracted file prompt if present; append any extra user text
    const filePrompt = filePromptRef.current;
    const userText = input.trim();
    const text = filePrompt
      ? userText ? `${filePrompt}\n\nAdditional instruction: ${userText}` : filePrompt
      : userText;

    if (!text || isStreaming) return;
    setInput("");
    clearFile();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(text);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!getSupportedFileType(file)) {
      setFileError("Unsupported file type. Please upload a PDF, Word (.docx), or Excel (.xlsx/.xls) file.");
      return;
    }

    const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 50 MB.`);
      return;
    }

    setFileLoading(true);
    setFileError(null);
    clearFile();
    try {
      const text = await extractTextFromFile(file);
      const prompt = buildVerificationPrompt(file.name, text);
      // Store in ref — never put large text into textarea state
      filePromptRef.current = prompt;
      setFileAttached(file.name);
    } catch (err) {
      console.error("File extraction error:", err);
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) submit(); }
  };

  const onInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const disabled = !ollamaReady || isStreaming;
  const canSend = !disabled && (!!input.trim() || !!filePromptRef.current);

  return (
    <div className="flex flex-col h-full bg-cs-base">
      {/* Top bar — cobalt-accented */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-cs-cobalt/60 bg-cs-surface">
        <div className="flex items-center gap-2">
          <span className="text-xs text-cs-sky font-mono bg-cs-hover px-2.5 py-1 rounded-md border border-cs-border font-semibold">
            {activeModel}
          </span>
          {!ollamaReady && (
            <span className="text-xs text-yellow-400 animate-pulse flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Starting Ollama…
            </span>
          )}
          {isStreaming && !runningTool && (
            <span className="text-xs text-cs-sky animate-pulse flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Thinking…
            </span>
          )}
          {runningTool && (
            <span className="text-xs text-cs-sky flex items-center gap-1">
              <Loader2 size={11} className="animate-spin text-cs-cobalt" />
              <span className="text-cs-cobaltHi font-medium">
                {TOOL_STATUS[runningTool] ?? runningTool}…
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { const id = newConversation(); setActive(id); }}
            className="p-1.5 rounded-lg hover:bg-cs-hover text-cs-sky hover:text-white transition"
            title="New chat"
          >
            <PlusCircle size={16} />
          </button>
          {conv && (
            <button
              onClick={() => clearConversation(conv.id)}
              className="p-1.5 rounded-lg hover:bg-cs-hover text-cs-sky hover:text-red-400 transition"
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!conv || conv.messages.length === 0 ? (
          <EmptyState />
        ) : (
          conv.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-cs-border bg-cs-surface">
        {fileError && (
          <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            <X size={12} className="shrink-0" />
            <span className="flex-1">{fileError}</span>
            <button onClick={() => setFileError(null)} className="hover:text-white transition shrink-0">
              <X size={12} />
            </button>
          </div>
        )}
        {fileAttached && (
          <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-cs-cobalt/20 border border-cs-cobalt/50 rounded-lg text-xs text-cs-sky">
            <Paperclip size={12} className="text-cs-cobalt shrink-0" />
            <span className="flex-1 truncate font-medium">{fileAttached}</span>
            <span className="text-cs-steel text-xs shrink-0">ready · press Send to verify</span>
            <button onClick={clearFile} className="hover:text-white transition shrink-0 ml-1">
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 bg-cs-card rounded-xl px-3 py-2.5 border border-cs-border focus-within:border-cs-cobalt focus-within:shadow-lg focus-within:shadow-cs-cobalt/20 transition-all">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.xls"
            onChange={onFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || fileLoading}
            title="Attach PDF, Word, or Excel file"
            className="p-1 rounded text-cs-steel hover:text-cs-sky disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          >
            {fileLoading ? <Loader2 size={16} className="animate-spin text-cs-sky" /> : <Paperclip size={16} />}
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => { if (e.target.value.length <= 100_000) setInput(e.target.value); }}
            onKeyDown={onKeyDown}
            onInput={onInput}
            disabled={disabled}
            placeholder={ollamaReady ? "Ask about a paper, paste a citation, or attach a file…" : "Waiting for Ollama to start…"}
            className="flex-1 bg-transparent resize-none text-sm text-cs-text placeholder-cs-steel focus:outline-none min-h-[24px] max-h-[200px]"
          />
          <button
            onClick={submit}
            disabled={!canSend}
            className="p-1.5 rounded-lg bg-cs-cobalt hover:bg-cs-cobaltHi disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 shadow-md shadow-cs-cobalt/30"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-cs-dim mt-1.5 text-center">
          Enter to send · Shift+Enter for newline · PDF / Word / Excel supported
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-cobalt-glow flex items-center justify-center shadow-xl shadow-cs-cobalt/40">
        <span className="text-3xl">🛡️</span>
      </div>
      <div>
        <h2 className="text-xl font-bold text-cs-text tracking-tight">CiteGuard</h2>
        <p className="text-cs-sky text-sm mt-1">Powered by {"{model}"}</p>
      </div>
      <p className="text-cs-steel text-sm max-w-sm leading-relaxed">
        Hallucination-resistant citation verification. Every reference checked against
        Crossref, PubMed, Semantic Scholar, OpenAlex, and arXiv.
      </p>
      <div className="grid grid-cols-2 gap-2 mt-2 w-full max-w-sm">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="text-xs text-left px-3 py-2.5 rounded-xl bg-cs-card hover:bg-cs-hover text-cs-text2 hover:text-white transition border border-cs-border hover:border-cs-cobalt/60">
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

const TOOL_STATUS: Record<string, string> = {
  verify_reference:       "Verifying reference",
  repair_reference:       "Repairing citation",
  detect_hallucination:   "Checking for hallucinations",
  format_citation:        "Formatting citation",
  find_published_version: "Finding published version",
  check_retraction_status:"Checking retraction status",
};

const EXAMPLES = [
  "Verify: 10.1038/s41586-021-03819-2",
  "Is this paper retracted? PMID 12345678",
  "Format this citation in APA style",
  "Check these 3 references for hallucinations",
];
