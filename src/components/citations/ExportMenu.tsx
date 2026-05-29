import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileSpreadsheet, BookOpen, Printer } from "lucide-react";
import type { Citation, Conversation } from "../../stores/chatStore";
import { exportCsv, exportBibtex, exportRis, exportHtmlReport } from "../../lib/export-report";

interface Props {
  citations: Citation[];
  conv?: Conversation;
}

export function ExportMenu({ citations, conv }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (citations.length === 0) return null;

  const title = conv?.title ?? "CiteGuard Report";
  const slug = title.toLowerCase().replace(/\s+/g, "-").slice(0, 30);

  const options = [
    {
      label: "CSV Spreadsheet",
      icon: FileSpreadsheet,
      action: () => exportCsv(citations, `${slug}.csv`),
    },
    {
      label: "BibTeX (.bib)",
      icon: BookOpen,
      action: () => exportBibtex(citations, `${slug}.bib`),
    },
    {
      label: "RIS / Zotero / Mendeley",
      icon: FileText,
      action: () => exportRis(citations, `${slug}.ris`),
    },
    {
      label: "Print / PDF Report",
      icon: Printer,
      action: () => exportHtmlReport(citations, title),
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cs-hover hover:bg-cs-card border border-cs-border text-xs text-cs-sky hover:text-white transition"
        title="Export verification report"
      >
        <Download size={13} />
        Export
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-cs-surface border border-cs-border rounded-xl shadow-xl z-50 overflow-hidden">
          {options.map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              onClick={() => { action(); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-cs-text2 hover:bg-cs-hover hover:text-white transition text-left"
            >
              <Icon size={13} className="text-cs-sky shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
