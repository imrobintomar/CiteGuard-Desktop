import { CheckCircle, Loader2, AlertCircle, Wrench } from "lucide-react";
import type { ToolCallRecord } from "../../stores/chatStore";

const TOOL_LABELS: Record<string, string> = {
  verify_reference:       "Verifying reference",
  repair_reference:       "Repairing citation",
  detect_hallucination:   "Detecting hallucinations",
  format_citation:        "Formatting citation",
  find_published_version: "Finding published version",
  check_retraction_status:"Checking retraction status",
};

interface Props { record: ToolCallRecord }

export function ToolCallCard({ record }: Props) {
  const label = TOOL_LABELS[record.toolName] ?? record.toolName;
  const elapsed = record.doneAt
    ? `${((record.doneAt - record.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="flex items-start gap-2 my-1 px-3 py-2 rounded-lg bg-cs-card/60 border border-cs-border text-sm">
      <Wrench size={14} className="mt-0.5 text-cs-sky shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-cs-sky font-medium">{label}</span>
        {record.status === "running" && (
          <Loader2 size={13} className="inline ml-2 animate-spin text-cs-steel" />
        )}
        {record.status === "done" && (
          <CheckCircle size={13} className="inline ml-2 text-green-400" />
        )}
        {record.status === "error" && (
          <AlertCircle size={13} className="inline ml-2 text-red-400" />
        )}
        {elapsed && <span className="text-cs-steel ml-2 text-xs">{elapsed}</span>}
      </div>
    </div>
  );
}
