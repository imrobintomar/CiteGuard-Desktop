import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, FileText, AlertOctagon, Globe } from "lucide-react";
import type { Citation, VerificationStatus } from "../../stores/chatStore";

const STATUS_CONFIG: Record<VerificationStatus, {
  label: string; icon: React.FC<{ size?: number; className?: string }>;
  bg: string; text: string; border: string;
}> = {
  VERIFIED:          { label: "Verified",      icon: CheckCircle2,  bg: "bg-green-950",       text: "text-green-400",  border: "border-green-800" },
  LIKELY_VALID:      { label: "Likely Valid",   icon: CheckCircle2,  bg: "bg-green-950",       text: "text-green-500",  border: "border-green-900" },
  PARTIALLY_CORRECT: { label: "Partial",        icon: AlertTriangle, bg: "bg-yellow-950",      text: "text-yellow-400", border: "border-yellow-800" },
  UNVERIFIABLE:      { label: "Unverifiable",   icon: HelpCircle,    bg: "bg-cs-card",         text: "text-cs-steel",   border: "border-cs-border" },
  HALLUCINATED:      { label: "Hallucinated",   icon: XCircle,       bg: "bg-red-950",         text: "text-red-400",    border: "border-red-800" },
  RETRACTED:         { label: "Retracted",      icon: AlertOctagon,  bg: "bg-orange-950",      text: "text-orange-400", border: "border-orange-800" },
  PREPRINT:          { label: "Preprint",        icon: FileText,      bg: "bg-cs-navy/60",      text: "text-cs-sky",     border: "border-cs-cobalt/60" },
  WEB_RESOURCE:      { label: "Web Resource",    icon: Globe,         bg: "bg-blue-950/40",     text: "text-blue-400",   border: "border-blue-800/60" },
};

interface Props { citation: Citation; compact?: boolean; onClick?: () => void }

export function VerificationBadge({ citation, compact, onClick }: Props) {
  const cfg = STATUS_CONFIG[citation.status];
  const Icon = cfg.icon;
  const hideConfidence = citation.status === "WEB_RESOURCE";
  const pct = (!hideConfidence && citation.confidence !== undefined) ? Math.round(citation.confidence * 100) : null;

  if (compact) {
    return (
      <span
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer ${cfg.bg} ${cfg.text} ${cfg.border}`}
      >
        <Icon size={11} />
        {cfg.label}
        {pct !== null && <span className="opacity-70">{pct}%</span>}
      </span>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 cursor-pointer hover:opacity-90 transition ${cfg.bg} ${cfg.border}`}
    >
      <div className={`flex items-center gap-2 text-sm font-medium ${cfg.text}`}>
        <Icon size={15} />
        <span>{cfg.label}</span>
        {pct !== null && <span className="ml-auto text-xs opacity-70">{pct}% confidence</span>}
      </div>
      {citation.title && (
        <p className="text-xs text-cs-text2 mt-1 truncate">{citation.title}</p>
      )}
      {citation.doi && (
        <p className="text-xs text-cs-steel font-mono mt-0.5 truncate">{citation.doi}</p>
      )}
    </div>
  );
}
