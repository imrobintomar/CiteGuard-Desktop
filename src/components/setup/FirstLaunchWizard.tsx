import { useEffect } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { ModelDownloader } from "./ModelDownloader";
import { bridge } from "../../lib/tauri-bridge";

type Step = "welcome" | "download";

interface Props { onComplete: () => void }

import { useState } from "react";

export function FirstLaunchWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    // Start Ollama in the background immediately
    bridge.startOllama().catch(() => {});
  }, []);

  const finish = async () => {
    await bridge.markSetupComplete();
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-purple-900 px-6 py-5 flex items-center gap-3">
          <ShieldCheck size={32} className="text-blue-300" />
          <div>
            <h1 className="text-lg font-bold text-white">Welcome to CiteGuard</h1>
            <p className="text-sm text-blue-200">Hallucination-resistant citation verification</p>
          </div>
        </div>

        <div className="px-6 py-6">
          {step === "welcome" && <WelcomeStep onNext={() => setStep("download")} />}
          {step === "download" && (
            <div>
              <h2 className="text-base font-semibold text-gray-100 mb-3">Download AI Model</h2>
              <ModelDownloader onComplete={finish} />
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div className="px-6 pb-4 flex items-center gap-2">
          {(["welcome", "download"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full flex-1 transition-all ${
                s === step ? "bg-blue-500"
                  : i < ["welcome", "download"].indexOf(step) ? "bg-green-600"
                  : "bg-gray-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300 leading-relaxed">
        CiteGuard verifies academic citations in real time using{" "}
        <strong className="text-white">Crossref, PubMed, Semantic Scholar, OpenAlex,</strong> and{" "}
        <strong className="text-white">arXiv</strong> — without ever generating fake references.
      </p>
      <ul className="space-y-2">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-400">
            <CheckCircle2 size={14} className="text-green-400 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onNext}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition"
      >
        Get Started
      </button>
    </div>
  );
}

const FEATURES = [
  "Runs 100% locally — no cloud, no data sent anywhere",
  "Powered by local AI — works completely offline",
  "Detects hallucinated citations automatically",
  "Checks retraction status via Crossref & PubMed",
  "Formats citations in APA, MLA, BibTeX, and more",
];
