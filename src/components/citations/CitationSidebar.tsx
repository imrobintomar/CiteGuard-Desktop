import { useState } from "react";
import { useChatStore, type Citation } from "../../stores/chatStore";
import { VerificationBadge } from "./VerificationBadge";
import { ExportMenu } from "./ExportMenu";
import { ShieldCheck, ExternalLink, Copy, Check, BookmarkPlus } from "lucide-react";
import { useCitationLibrary } from "../../stores/citationLibraryStore";

export function CitationSidebar() {
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === s.activeId));
  const { save: saveToLibrary } = useCitationLibrary();

  const citations: Citation[] = conv?.messages.flatMap((m) => m.citations ?? []) ?? [];
  const unique = dedup(citations);

  const verified = unique.filter((c) => c.status === "VERIFIED" || c.status === "LIKELY_VALID");
  const problems = unique.filter((c) => ["HALLUCINATED", "RETRACTED", "PARTIALLY_CORRECT"].includes(c.status));
  const other    = unique.filter((c) => !["VERIFIED","LIKELY_VALID","HALLUCINATED","RETRACTED","PARTIALLY_CORRECT"].includes(c.status));

  return (
    <div className="flex flex-col h-full bg-cs-surface border-l border-cs-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cs-border bg-cobalt-glow flex items-center gap-2">
        <ShieldCheck size={15} className="text-white opacity-90" />
        <span className="text-sm font-bold text-white tracking-wide">Citations</span>
        {unique.length > 0 && (
          <span className="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-semibold">
            {unique.length}
          </span>
        )}
      </div>

      {/* Export toolbar */}
      {unique.length > 0 && (
        <div className="px-3 py-2 border-b border-cs-border flex items-center justify-between gap-2">
          <span className="text-xs text-cs-steel">{unique.length} reference{unique.length !== 1 ? "s" : ""}</span>
          <ExportMenu citations={unique} conv={conv} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {unique.length === 0 && (
          <div className="flex flex-col items-center pt-10 gap-3">
            <ShieldCheck size={28} className="text-cs-border" />
            <p className="text-xs text-cs-steel text-center leading-relaxed">
              Verified citations will appear here as you chat.
            </p>
          </div>
        )}

        {problems.length > 0 && (
          <Section title="⚠ Issues" items={problems} onSave={saveToLibrary} />
        )}
        {verified.length > 0 && (
          <Section title="✓ Verified" items={verified} onSave={saveToLibrary} />
        )}
        {other.length > 0 && (
          <Section title="Other" items={other} onSave={saveToLibrary} />
        )}
      </div>

      {/* Stats footer */}
      {unique.length > 0 && (
        <div className="px-3 py-2 border-t border-cs-border text-xs text-cs-steel flex justify-between">
          <span className="text-green-400">{verified.length} valid</span>
          <span className={problems.length > 0 ? "text-red-400" : ""}>{problems.length} issues</span>
          <span>{other.length} other</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, items, onSave }: { title: string; items: Citation[]; onSave: (c: Citation) => void }) {
  return (
    <div>
      <p className="text-xs font-bold text-cs-sky uppercase tracking-widest mb-2">{title}</p>
      <div className="space-y-2">
        {items.map((c) => (
          <CitationRow key={c.id} citation={c} onSave={onSave} />
        ))}
      </div>
    </div>
  );
}

function CitationRow({ citation: c, onSave }: { citation: Citation; onSave: (c: Citation) => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copyApa = () => {
    const parts: string[] = [];
    if (c.authors?.length) parts.push(c.authors.join(", "));
    if (c.year) parts.push(`(${c.year})`);
    if (c.title) parts.push(c.title);
    if (c.journal) parts.push(`*${c.journal}*`);
    if (c.doi) parts.push(`https://doi.org/${c.doi}`);
    navigator.clipboard.writeText(parts.join(". ")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    onSave(c);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="group">
      <VerificationBadge citation={c} />
      <div className="flex items-center gap-2 mt-1 ml-1">
        {c.doi && (
          <a
            href={`https://doi.org/${c.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-cs-sky hover:text-white transition"
          >
            <ExternalLink size={10} /> Open
          </a>
        )}
        <button
          onClick={copyApa}
          className="inline-flex items-center gap-1 text-xs text-cs-steel hover:text-cs-sky transition"
          title="Copy APA citation"
        >
          {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1 text-xs text-cs-steel hover:text-cs-sky transition"
          title="Save to library"
        >
          {saved ? <Check size={10} className="text-green-400" /> : <BookmarkPlus size={10} />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}

function dedup(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = c.doi ?? c.title ?? c.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
