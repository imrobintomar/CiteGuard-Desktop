import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { saveConversations } from "../lib/persistence";

export type VerificationStatus =
  | "VERIFIED" | "LIKELY_VALID" | "PARTIALLY_CORRECT"
  | "UNVERIFIABLE" | "HALLUCINATED" | "RETRACTED" | "PREPRINT" | "WEB_RESOURCE";

export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: unknown;
  result?: string;
  status: "running" | "done" | "error";
  startedAt: number;
  doneAt?: number;
}

export interface Citation {
  id: string;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  status: VerificationStatus;
  confidence?: number;
  isRetracted?: boolean;
  rawResult?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCallRecord[];
  citations?: Citation[];
  streaming?: boolean;
  error?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  isStreaming: boolean;

  // Actions
  newConversation: () => string;
  setActive: (id: string) => void;
  appendToken: (convId: string, token: string) => void;
  finalizeAssistant: (convId: string) => void;
  addUserMessage: (convId: string, content: string) => void;
  startAssistantMessage: (convId: string) => void;
  addToolCall: (convId: string, record: ToolCallRecord) => void;
  updateToolCall: (convId: string, toolCallId: string, update: Partial<ToolCallRecord>) => void;
  extractCitations: (convId: string, toolCallId: string, resultJson: string) => void;
  setStreaming: (v: boolean) => void;
  clearConversation: (convId: string) => void;
  deleteConversation: (convId: string) => void;
  activeConversation: () => Conversation | undefined;
  hydrate: (convs: Conversation[]) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  isStreaming: false,

  newConversation: () => {
    const id = uuidv4();
    const conv: Conversation = {
      id, title: "New Chat",
      messages: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: id }));
    return id;
  },

  setActive: (id) => set({ activeId: id }),

  addUserMessage: (convId, content) => {
    const msg: ChatMessage = { id: uuidv4(), role: "user", content, createdAt: Date.now() };
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== convId ? c : { ...c, messages: [...c.messages, msg], updatedAt: Date.now() }
      ),
    }));
  },

  startAssistantMessage: (convId) => {
    const msg: ChatMessage = { id: uuidv4(), role: "assistant", content: "", streaming: true, toolCalls: [], citations: [], createdAt: Date.now() };
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== convId ? c : { ...c, messages: [...c.messages, msg], updatedAt: Date.now() }
      ),
      isStreaming: true,
    }));
  },

  appendToken: (convId, token) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant") {
          msgs[msgs.length - 1] = { ...last, content: last.content + token };
        }
        return { ...c, messages: msgs };
      }),
    }));
  },

  finalizeAssistant: (convId) => {
    set((s) => {
      const next = s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const msgs = c.messages.map((m) =>
          m.role === "assistant" && m.streaming ? { ...m, streaming: false } : m
        );
        // Auto-title from first user message
        const firstUser = msgs.find((m) => m.role === "user");
        const title = firstUser ? firstUser.content.slice(0, 40) : "Chat";
        return { ...c, messages: msgs, title, updatedAt: Date.now() };
      });
      saveConversations(next); // persist after every completed response
      return { conversations: next, isStreaming: false };
    });
  },

  addToolCall: (convId, record) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant") {
          msgs[msgs.length - 1] = { ...last, toolCalls: [...(last.toolCalls ?? []), record] };
        }
        return { ...c, messages: msgs };
      }),
    }));
  },

  updateToolCall: (convId, toolCallId, update) => {
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const msgs = c.messages.map((m) => {
          if (m.role !== "assistant") return m;
          return { ...m, toolCalls: m.toolCalls?.map((tc) => tc.id === toolCallId ? { ...tc, ...update } : tc) };
        });
        return { ...c, messages: msgs };
      }),
    }));
  },

  extractCitations: (convId, _toolCallId, resultJson) => {
    try {
      const result = JSON.parse(resultJson);
      // Handle verify_reference and detect_hallucination results
      const refs: Citation[] = [];

      if (result.status && result.verifiedReference) {
        // Single verify_reference result
        refs.push({
          id: uuidv4(),
          doi: result.verifiedReference?.doi,
          title: result.verifiedReference?.title,
          year: result.verifiedReference?.year,
          journal: result.verifiedReference?.journal,
          status: result.status as VerificationStatus,
          confidence: result.confidence,
          isRetracted: result.isRetracted,
          rawResult: resultJson,
        });
      } else if (result.results && Array.isArray(result.results)) {
        // Batch detect_hallucination results
        for (const r of result.results) {
          refs.push({
            id: uuidv4(),
            title: r.verifiedTitle,
            doi: r.verifiedDoi,
            status: r.status as VerificationStatus,
            confidence: r.confidence,
            isRetracted: r.isRetracted,
            rawResult: JSON.stringify(r),
          });
        }
      }

      if (refs.length === 0) return;

      set((s) => ({
        conversations: s.conversations.map((c) => {
          if (c.id !== convId) return c;
          const msgs = c.messages.map((m) => {
            if (m.role !== "assistant") return m;
            return { ...m, citations: [...(m.citations ?? []), ...refs] };
          });
          return { ...c, messages: msgs };
        }),
      }));
    } catch (e) { console.error("[CiteGuard] extractCitations parse error:", e); }
  },

  setStreaming: (v) => set({ isStreaming: v }),

  clearConversation: (convId) => {
    set((s) => {
      const next = s.conversations.map((c) =>
        c.id !== convId ? c : { ...c, messages: [], updatedAt: Date.now() }
      );
      saveConversations(next);
      return { conversations: next };
    });
  },

  deleteConversation: (convId) => {
    set((s) => {
      const next = s.conversations.filter((c) => c.id !== convId);
      const activeId = s.activeId === convId ? (next[0]?.id ?? null) : s.activeId;
      saveConversations(next);
      return { conversations: next, activeId };
    });
  },

  activeConversation: () => {
    const s = get();
    return s.conversations.find((c) => c.id === s.activeId);
  },

  hydrate: (convs) => {
    set({ conversations: convs, activeId: convs[0]?.id ?? null });
  },
}));
