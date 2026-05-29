import { useState } from "react";
import { Crown, X, Zap, Check, ExternalLink, AlertCircle } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { bridge } from "../../lib/tauri-bridge";
import type { UserSession } from "../../lib/firebase";

// Set your Razorpay Payment Link URL from https://dashboard.razorpay.com/app/payment-links
const RAZORPAY_PAYMENT_LINK = "https://rzp.io/l/citeguard-lifetime";

const FEATURES = [
  "Unlimited citation verifications",
  "All current & future features",
  "Local AI — no data sent to cloud",
  "Export: BibTeX, RIS, CSV",
  "Citation library with tags & notes",
  "Retraction alerts",
  "Priority support",
];

type Step = "offer" | "verify" | "done" | "error";

export function UpgradeModal({
  onClose,
  onUpgraded,
  session,
}: {
  onClose: () => void;
  onUpgraded: () => Promise<void>;
  session: UserSession;
}) {
  const [step, setStep] = useState<Step>("offer");
  const [paymentId, setPaymentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const openPayment = () => {
    shellOpen(RAZORPAY_PAYMENT_LINK);
    setStep("verify");
  };

  const activate = async () => {
    const pid = paymentId.trim();
    if (!pid) {
      setError("Enter the payment ID from your Razorpay receipt email.");
      return;
    }
    if (!pid.startsWith("pay_")) {
      setError('Payment ID should start with "pay_" — check your receipt email.');
      return;
    }
    setError("");
    setLoading(true);
    try {
      const updated = await bridge.razorpayVerifyPayment(pid, session.uid, session.idToken);
      await onUpgraded();
      void updated;
      setStep("done");
    } catch (e) {
      setError(String(e));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[420px] bg-cs-surface border border-cs-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-yellow-600/30 to-amber-500/10 px-6 pt-6 pb-4 border-b border-cs-border">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded hover:bg-white/10 text-cs-steel hover:text-white transition"
          >
            <X size={15} />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-yellow-500/20">
              <Crown size={20} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">CiteGuard Lifetime</p>
              <p className="text-xs text-cs-steel">One-time purchase · yours forever</p>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl font-extrabold text-white">₹2,999</span>
            <span className="text-cs-steel text-sm line-through">₹5,999</span>
            <span className="ml-1 text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-semibold">
              Early access
            </span>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 py-4 border-b border-cs-border">
          <ul className="grid grid-cols-1 gap-1.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-cs-text">
                <Check size={12} className="text-green-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA area */}
        <div className="px-6 py-5 space-y-3">

          {step === "offer" && (
            <>
              <button
                onClick={openPayment}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm transition"
              >
                <Zap size={14} />
                Pay with Razorpay
                <ExternalLink size={12} className="ml-1 opacity-70" />
              </button>
              <p className="text-center text-xs text-cs-steel">
                Secure checkout via Razorpay · UPI, cards, net banking accepted
              </p>
            </>
          )}

          {step === "verify" && (
            <>
              <div className="bg-cs-card border border-cs-border rounded-lg px-3 py-2.5 text-xs text-cs-text space-y-1">
                <p className="font-semibold text-cs-sky">After payment:</p>
                <p>1. Check your email for a Razorpay receipt</p>
                <p>2. Copy the <span className="font-mono text-yellow-400">pay_XXXXXXXX</span> Payment ID</p>
                <p>3. Paste it below and click Activate</p>
              </div>

              <input
                type="text"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                placeholder="pay_XXXXXXXXXXXXXXXX"
                className="w-full px-3 py-2 rounded-lg bg-cs-base border border-cs-border text-xs text-cs-text placeholder-cs-steel focus:outline-none focus:border-cs-cobalt font-mono tracking-wide text-center"
                onKeyDown={(e) => e.key === "Enter" && activate()}
              />

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                onClick={activate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm transition"
              >
                <Crown size={14} />
                {loading ? "Verifying…" : "Activate Lifetime"}
              </button>

              <button
                onClick={openPayment}
                className="w-full text-xs text-cs-sky hover:text-white transition text-center"
              >
                Open payment page again ↗
              </button>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-3 rounded-full bg-green-500/20">
                <Check size={24} className="text-green-400" />
              </div>
              <p className="text-sm font-bold text-white">Welcome to Lifetime!</p>
              <p className="text-xs text-cs-steel text-center">
                Unlimited verifications unlocked. Thank you for your support.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2 rounded-xl bg-cs-cobalt hover:bg-blue-600 text-white text-sm font-semibold transition"
              >
                Start verifying
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-3 rounded-full bg-red-500/20">
                <AlertCircle size={24} className="text-red-400" />
              </div>
              <p className="text-sm font-bold text-red-400">Activation failed</p>
              <p className="text-xs text-cs-steel text-center">{error}</p>
              <button
                onClick={() => { setStep("verify"); setError(""); }}
                className="px-6 py-2 rounded-xl bg-cs-hover hover:bg-cs-card text-white text-sm transition"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
