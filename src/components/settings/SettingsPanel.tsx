import { useEffect, useState } from "react";
import { Settings, Save, Bot } from "lucide-react";
import { bridge, type AppSettings } from "../../lib/tauri-bridge";
import { useModelStore } from "../../stores/modelStore";
import { useModelManager } from "../../hooks/useModelManager";

const MODELS = [
  { id: "qwen2.5:72b",  label: "Qwen 2.5 72B  (~43 GB)" },
  { id: "llama3.3:70b", label: "Llama 3.3 70B (~43 GB)" },
  { id: "qwen2.5:14b",  label: "Qwen 2.5 14B  (~9 GB)"  },
  { id: "qwen2.5:7b",   label: "Qwen 2.5 7B   (~5 GB)"  },
];

interface Props { onClose: () => void }

export function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const { setActiveModel } = useModelStore();
  const { models } = useModelManager();

  useEffect(() => {
    bridge.getSettings().then(setSettings);
  }, []);

  const save = async () => {
    if (!settings) return;
    await bridge.saveSettings(settings);
    setActiveModel(settings.active_model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <div className="p-6 text-cs-sky text-sm">Loading…</div>;

  const downloadedModels = models.filter((m) => m.downloaded).map((m) => m.name);

  return (
    <div className="flex flex-col h-full bg-cs-surface border-l border-cs-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cs-border">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-cs-sky" />
          <span className="text-sm font-semibold text-cs-text">Settings</span>
        </div>
        <button onClick={onClose} className="text-cs-steel hover:text-white text-xs transition">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Bot size={14} className="text-cs-sky" />
            <h3 className="text-xs font-semibold text-cs-sky uppercase tracking-wider">AI Model</h3>
          </div>
          <label className="text-xs text-cs-sky">Active Model</label>
          <select
            value={settings.active_model}
            onChange={(e) => setSettings((s) => s ? { ...s, active_model: e.target.value } : s)}
            className="w-full mt-1 bg-cs-card border border-cs-border rounded-lg px-3 py-2 text-sm text-cs-text focus:outline-none focus:border-cs-cobalt transition"
          >
            {MODELS.map((m) => (
              <option
                key={m.id}
                value={m.id}
                disabled={!downloadedModels.includes(m.id) && downloadedModels.length > 0}
              >
                {m.label}{!downloadedModels.includes(m.id) && downloadedModels.length > 0 ? " (not downloaded)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-cs-border">
        <button
          onClick={save}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cs-cobalt hover:bg-cs-cobaltHi text-sm font-medium transition"
        >
          <Save size={14} />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
