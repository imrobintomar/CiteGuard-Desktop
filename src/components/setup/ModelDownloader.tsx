import { Download, CheckCircle2, Loader2, HardDrive, Cpu } from "lucide-react";
import { useModelManager } from "../../hooks/useModelManager";

const MODEL = {
  id: "qwen3:14b",
  name: "Qwen3 14B",
  desc: "Optimized for citation verification — fast, accurate, runs on 12+ GB VRAM.",
  size: "~9 GB",
  vram: "12 GB",
};

interface Props { onComplete: () => void }

export function ModelDownloader({ onComplete }: Props) {
  const { models, pulling, downloadModel } = useModelManager();

  const isDone = models.some((m) => m.downloaded && m.name === MODEL.id);
  const pull   = pulling[MODEL.id];
  const isPulling = !!pull;

  const start = async () => {
    try { await downloadModel(MODEL.id); } catch { /* progress events handle errors */ }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300">
        CiteGuard uses a local AI model for citation analysis. The model is stored on
        your device and never sends data to the cloud.
      </p>

      {/* Single model card */}
      <div className={`p-4 rounded-xl border ${
        isDone ? "border-green-600 bg-green-950/20" : "border-blue-500 bg-blue-950/30"
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-gray-100">{MODEL.name}</span>
          <span className="text-xs bg-blue-600 px-1.5 py-0.5 rounded text-white">Recommended</span>
          {isDone && <CheckCircle2 size={14} className="text-green-400" />}
        </div>
        <p className="text-xs text-gray-400 mb-2">{MODEL.desc}</p>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><HardDrive size={11} />{MODEL.size}</span>
          <span className="flex items-center gap-1"><Cpu size={11} />{MODEL.vram} VRAM</span>
        </div>

        {isPulling && pull && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{pull.status}</span>
              <span>{pull.percent}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${pull.percent}%` }}
              />
            </div>
            {pull.totalBytes && (
              <p className="text-xs text-gray-500 mt-1">
                {fmt(pull.doneBytes ?? 0)} / {fmt(pull.totalBytes)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-1">
        {isDone ? (
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-medium transition"
          >
            <CheckCircle2 size={15} /> Continue to CiteGuard
          </button>
        ) : (
          <button
            onClick={start}
            disabled={isPulling}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition"
          >
            {isPulling
              ? <><Loader2 size={15} className="animate-spin" /> Downloading…</>
              : <><Download size={15} /> Download model (~9 GB)</>}
          </button>
        )}
      </div>
    </div>
  );
}

function fmt(bytes: number): string {
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}
