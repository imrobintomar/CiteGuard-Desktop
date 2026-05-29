import { useState } from "react";
import { MailCheck, RefreshCw, LogOut, Loader2 } from "lucide-react";
import { sendVerificationEmail, checkEmailVerified, logOut } from "../../lib/firebase";
import { useAuthStore } from "../../stores/authStore";
import { ensureUserProfile } from "../../lib/firebase";

export function VerifyEmailScreen() {
  const { session, setSession, setProfile } = useAuthStore();
  const [busy, setBusy]   = useState(false);
  const [info, setInfo]   = useState("");
  const [error, setError] = useState("");

  if (!session) return null;

  const resend = async () => {
    setInfo(""); setError(""); setBusy(true);
    try {
      await sendVerificationEmail(session);
      setInfo("Verification email sent! Check your inbox.");
    } catch {
      setError("Failed to send email. Try again.");
    } finally { setBusy(false); }
  };

  const checkVerified = async () => {
    setInfo(""); setError(""); setBusy(true);
    try {
      const verified = await checkEmailVerified(session);
      if (verified) {
        const updated = { ...session, emailVerified: true };
        setSession(updated);
        // save updated session
        localStorage.setItem("cg_session", JSON.stringify(updated));
        const profile = await ensureUserProfile(updated);
        setProfile(profile);
      } else {
        setError("Email not verified yet. Click the link in your inbox first.");
      }
    } catch {
      setError("Could not check verification status. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-cs-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-cs-accent flex items-center justify-center mb-3 shadow-lg">
            <MailCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Verify your email</h1>
          <p className="text-cs-steel text-sm mt-1 text-center">
            We sent a verification link to
          </p>
          <p className="text-white text-sm font-medium mt-0.5">{session.email}</p>
        </div>

        {/* Card */}
        <div className="bg-cs-surface rounded-2xl p-6 border border-cs-hover shadow-xl space-y-3">
          <p className="text-cs-steel text-xs text-center mb-2">
            Open the email and click the link, then come back here.
          </p>

          {info  && <p className="text-green-400 text-xs text-center">{info}</p>}
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          {/* I've verified */}
          <button
            onClick={checkVerified}
            disabled={busy}
            className="w-full bg-cs-accent hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <MailCheck size={15} />}
            I've verified my email
          </button>

          {/* Resend */}
          <button
            onClick={resend}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-cs-hover hover:bg-cs-hover text-sm text-cs-steel hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw size={14} /> Resend verification email
          </button>

          {/* Sign out */}
          <button
            onClick={logOut}
            className="w-full flex items-center justify-center gap-1 text-xs text-cs-steel hover:text-white transition pt-1"
          >
            <LogOut size={12} /> Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
