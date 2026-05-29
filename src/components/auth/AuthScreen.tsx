import { useState } from "react";
import { ShieldCheck, Mail, Lock, Chrome, ArrowRight, Loader2 } from "lucide-react";
import { signInEmail, signUpEmail, sendVerificationEmail, ensureUserProfile } from "../../lib/firebase";
import { useAuthStore } from "../../stores/authStore";

type Mode = "login" | "signup";

export function AuthScreen() {
  const [mode, setMode]         = useState<Mode>("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);

  const { setSession, setProfile } = useAuthStore();

  const wrap = async (fn: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await fn(); }
    catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(friendlyError(msg));
    } finally { setBusy(false); }
  };

  const handleEmailAuth = () => wrap(async () => {
    const session = mode === "login"
      ? await signInEmail(email, password)
      : await signUpEmail(email, password);

    // New sign-ups: send verification email before granting access
    if (mode === "signup" && !session.emailVerified) {
      await sendVerificationEmail(session); // will throw and show error if it fails
    }

    // Only load profile if email is already verified (sign-in of existing user)
    if (session.emailVerified) {
      const profile = await ensureUserProfile(session);
      setProfile(profile);
    }

    setSession(session);
  });

  const handleGoogle = () => wrap(async () => {
    setError("Google sign-in coming soon. Please use email/password.");
    throw new Error("not-implemented");
  });

  return (
    <div className="min-h-screen bg-cs-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-cs-accent flex items-center justify-center mb-3 shadow-lg">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CiteGuard</h1>
          <p className="text-cs-steel text-sm mt-1">Scholarly reference verification</p>
        </div>

        {/* Card */}
        <div className="bg-cs-surface rounded-2xl p-6 border border-cs-hover shadow-xl">

          {/* Mode tabs */}
          <div className="flex rounded-lg overflow-hidden mb-5 bg-cs-base">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2 text-sm font-medium transition ${
                  mode === m ? "bg-cs-accent text-white" : "text-cs-steel hover:text-white"
                }`}
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* Email + Password fields */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-3 text-cs-steel" />
              <input
                type="email" placeholder="Email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-cs-base border border-cs-hover rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-cs-steel outline-none focus:border-cs-accent"
              />
            </div>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-3 text-cs-steel" />
              <input
                type="password" placeholder="Password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
                className="w-full bg-cs-base border border-cs-hover rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-cs-steel outline-none focus:border-cs-accent"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

          {/* Primary button */}
          <button onClick={handleEmailAuth} disabled={busy || !email || !password}
            className="w-full bg-cs-accent hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition mb-3">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-cs-hover" />
            <span className="text-cs-steel text-xs">or continue with</span>
            <div className="flex-1 h-px bg-cs-hover" />
          </div>

          {/* Google button */}
          <button onClick={handleGoogle} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-cs-hover hover:bg-cs-hover text-sm text-white transition disabled:opacity-50">
            <Chrome size={15} className="text-red-400" /> Continue with Google
          </button>
        </div>

        <p className="text-center text-cs-steel text-xs mt-4">
          Free tier: 20 verifications/day · No credit card required
        </p>
      </div>
    </div>
  );
}

function friendlyError(msg: string): string {
  if (msg.includes("invalid-credential") || msg.includes("user-not-found") || msg.includes("wrong-password"))
    return "Invalid email or password.";
  if (msg.includes("email-already-in-use"))
    return "An account with this email already exists. Sign in instead.";
  if (msg.includes("weak-password"))
    return "Password must be at least 6 characters.";
  if (msg.includes("invalid-email"))
    return "Please enter a valid email address.";
  if (msg.includes("network-request-failed"))
    return "Network error. Check your internet connection.";
  if (msg.includes("not-implemented"))
    return "";
  return msg;
}
