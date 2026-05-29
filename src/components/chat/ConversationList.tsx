import { useState } from "react";
import { MessageSquare, Trash2, PlusCircle, Shield, Search, X } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";

export function ConversationList() {
  const { conversations, activeId, setActive, newConversation, deleteConversation } = useChatStore();
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? conversations.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q))
        );
      })
    : conversations;

  return (
    <div className="flex flex-col h-full bg-cs-surface border-r border-cs-border w-56 shrink-0">
      {/* Branded header */}
      <div className="px-3 pt-3 pb-2 border-b border-cs-border bg-cobalt-glow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-white opacity-90" />
            <span className="text-xs font-bold text-white tracking-widest uppercase">Chats</span>
          </div>
          <button
            onClick={() => { const id = newConversation(); setActive(id); }}
            className="p-1 rounded hover:bg-white/20 text-white/70 hover:text-white transition"
            title="New chat (Cmd+N)"
          >
            <PlusCircle size={14} />
          </button>
        </div>

        {/* Search box */}
        <div className="mt-2 flex items-center gap-1.5 bg-white/10 rounded-lg px-2 py-1.5">
          <Search size={11} className="text-white/60 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-xs text-white placeholder-white/50 focus:outline-none min-w-0"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-white/50 hover:text-white transition">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5 px-1">
        {filtered.length === 0 && (
          <p className="text-xs text-cs-steel text-center mt-8 px-2">
            {query ? "No matches" : "No conversations yet"}
          </p>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`group flex items-center gap-2 px-2.5 py-2 cursor-pointer rounded-lg my-0.5 transition-all ${
              c.id === activeId
                ? "bg-cs-cobalt text-white shadow-lg shadow-cs-cobalt/30"
                : "hover:bg-cs-card text-cs-text2 hover:text-white"
            }`}
          >
            <MessageSquare size={12} className="shrink-0 opacity-70" />
            <span className="text-xs truncate flex-1">{c.title || "New Chat"}</span>
            <button
              onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
