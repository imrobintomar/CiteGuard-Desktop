import { User, Bot, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../../stores/chatStore";
import { ToolCallCard } from "./ToolCallCard";
import { VerificationBadge } from "../citations/VerificationBadge";

interface Props { message: ChatMessage }

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white ${
        isUser
          ? "bg-cobalt-glow shadow-md shadow-cs-cobalt/40"
          : "bg-cs-card border border-cs-border"
      }`}>
        {isUser ? <User size={15} /> : <Bot size={15} className="text-cs-sky" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Tool calls */}
        {(message.toolCalls?.length ?? 0) > 0 && (
          <div className="w-full space-y-1">
            {message.toolCalls!.map((tc) => <ToolCallCard key={tc.id} record={tc} />)}
          </div>
        )}

        {/* Message text */}
        {(message.content || message.streaming) && (
          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-cobalt-glow text-white rounded-tr-sm shadow-md shadow-cs-cobalt/30"
              : "bg-cs-card text-cs-text rounded-tl-sm border border-cs-border"
          }`}>
            {isUser ? (
              <span className="whitespace-pre-wrap">{message.content}</span>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-1 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold text-white mt-3 mb-1 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-cs-sky mt-2 mb-0.5 first:mt-0">{children}</h3>,
                  p:  ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                  em: ({ children }) => <em className="italic text-cs-steel">{children}</em>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 ml-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 ml-1">{children}</ol>,
                  li: ({ children }) => <li className="text-cs-text">{children}</li>,
                  code: ({ children }) => <code className="bg-cs-base px-1 py-0.5 rounded text-xs font-mono text-cs-sky">{children}</code>,
                  pre: ({ children }) => <pre className="bg-cs-base p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
                  hr:  () => <hr className="border-cs-border my-2" />,
                  a:   ({ href, children }) => <a href={href} className="text-cs-sky underline hover:text-white" target="_blank" rel="noreferrer">{children}</a>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
            {message.streaming && (
              <Loader2 size={13} className="inline ml-1.5 animate-spin text-cs-sky" />
            )}
          </div>
        )}

        {/* Citation badges */}
        {(message.citations?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.citations!.map((c) => (
              <VerificationBadge key={c.id} citation={c} compact />
            ))}
          </div>
        )}

        {message.error && (
          <p className="text-xs text-red-400 mt-1">{message.error}</p>
        )}
      </div>
    </div>
  );
}
