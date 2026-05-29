import { useState, useEffect } from "react";
import { BookOpen, Trash2, X, FileText, Download, ExternalLink, Copy, Check } from "lucide-react";
import { useCitationLibrary, type LibraryCitation } from "../../stores/citationLibraryStore";
import { exportBibtex, exportRis, exportCsv } from "../../lib/export-report";
import { VerificationBadge } from "../citations/VerificationBadge";

export function CitationLibraryPanel({ onClose }: { onClose: () => void }) {
  const { items, remove, updateNotes, addTag, removeTag } = useCitationLibrary();
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      i.title?.toLowerCase().includes(q) ||
      i.doi?.toLowerCase().includes(q) ||
      i.journal?.toLowerCase().includes(q) ||
      i.authors?.some((a) => a.toLowerCase().includes(q));
    const matchTag = !activeTag || i.tags.includes(activeTag);
    return matchSearch && matchTag;
  });

  return (
    <div className="flex flex-col h-full bg-cs-surface border-l border-cs-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cs-border bg-cobalt-glow flex items-center gap-2">
        <BookOpen size={15} className="text-white opacity-90" />
        <span className="text-sm font-bold text-white tracking-wide">My Library</span>
        <span className="ml-auto text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-semibold">
          {items.length}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/20 text-white transition">
          <X size={14} />
        </button>
      </div>

      {/* Search + export */}
      <div className="px-3 py-2 border-b border-cs-border space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search library…"
          className="w-full px-2.5 py-1.5 rounded-lg bg-cs-card border border-cs-border text-xs text-cs-text placeholder-cs-steel focus:outline-none focus:border-cs-cobalt"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTag(activeTag === t ? null : t)}
                className={`text-xs px-2 py-0.5 rounded-full border transition ${
                  activeTag === t
                    ? "bg-cs-cobalt border-cs-cobalt text-white"
                    : "border-cs-border text-cs-steel hover:text-cs-sky"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={() => exportBibtex(items, "my-library.bib")}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-cs-hover text-cs-sky hover:text-white border border-cs-border transition"
            >
              <Download size={11} /> BibTeX
            </button>
            <button
              onClick={() => exportRis(items, "my-library.ris")}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-cs-hover text-cs-sky hover:text-white border border-cs-border transition"
            >
              <FileText size={11} /> RIS
            </button>
            <button
              onClick={() => exportCsv(items, "my-library.csv")}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-cs-hover text-cs-sky hover:text-white border border-cs-border transition"
            >
              <FileText size={11} /> CSV
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center pt-10 gap-3">
            <BookOpen size={28} className="text-cs-border" />
            <p className="text-xs text-cs-steel text-center leading-relaxed">
              {items.length === 0
                ? "Save verified citations here to build your library."
                : "No citations match your search."}
            </p>
          </div>
        )}
        {filtered.map((item) => (
          <LibraryCard
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onRemove={() => remove(item.id)}
            onUpdateNotes={(n) => updateNotes(item.id, n)}
            onAddTag={(t) => addTag(item.id, t)}
            onRemoveTag={(t) => removeTag(item.id, t)}
          />
        ))}
      </div>
    </div>
  );
}

function LibraryCard({
  item, expanded, onToggle, onRemove, onUpdateNotes, onAddTag, onRemoveTag,
}: {
  item: LibraryCitation;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdateNotes: (n: string) => void;
  onAddTag: (t: string) => void;
  onRemoveTag: (t: string) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState(item.notes);

  useEffect(() => { setNotes(item.notes); }, [item.notes]);

  const copyApa = () => {
    const parts: string[] = [];
    if (item.authors?.length) parts.push(item.authors.join(", "));
    if (item.year) parts.push(`(${item.year})`);
    if (item.title) parts.push(item.title);
    if (item.journal) parts.push(item.journal);
    if (item.doi) parts.push(`https://doi.org/${item.doi}`);
    navigator.clipboard.writeText(parts.join(". ")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const submitTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      onAddTag(tagInput.trim());
      setTagInput("");
    }
  };

  return (
    <div className={`rounded-xl border transition-all ${
      item.isRetracted
        ? "border-orange-600/60 bg-orange-950/20"
        : "border-cs-border bg-cs-card"
    }`}>
      <button className="w-full text-left px-3 py-2.5" onClick={onToggle}>
        <div className="flex items-start gap-2">
          <VerificationBadge citation={item} compact />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-cs-text font-medium leading-snug line-clamp-2">
              {item.title ?? item.doi ?? "Unknown reference"}
            </p>
            {item.year && (
              <p className="text-xs text-cs-steel mt-0.5">{item.year}</p>
            )}
          </div>
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.tags.map((t) => (
              <span key={t} className="text-xs bg-cs-cobalt/20 text-cs-sky px-1.5 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-cs-border pt-2">
          {/* Actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            {item.doi && (
              <a
                href={`https://doi.org/${item.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-cs-sky hover:text-white transition"
              >
                <ExternalLink size={10} /> Open DOI
              </a>
            )}
            <button onClick={copyApa} className="flex items-center gap-1 text-xs text-cs-steel hover:text-cs-sky transition">
              {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
              {copied ? "Copied" : "Copy APA"}
            </button>
            <button onClick={onRemove} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition ml-auto">
              <Trash2 size={10} /> Remove
            </button>
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs text-cs-steel mb-1">Tags</p>
            <div className="flex flex-wrap gap-1 mb-1">
              {item.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs bg-cs-cobalt/20 text-cs-sky px-1.5 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => onRemoveTag(t)} className="hover:text-red-400 transition">
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={submitTag}
              placeholder="Add tag, press Enter"
              className="w-full px-2 py-1 rounded bg-cs-base border border-cs-border text-xs text-cs-text placeholder-cs-steel focus:outline-none focus:border-cs-cobalt"
            />
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs text-cs-steel mb-1">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => onUpdateNotes(notes)}
              placeholder="Add your notes…"
              rows={2}
              className="w-full px-2 py-1 rounded bg-cs-base border border-cs-border text-xs text-cs-text placeholder-cs-steel focus:outline-none focus:border-cs-cobalt resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
