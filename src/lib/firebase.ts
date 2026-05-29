import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserSession {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
  emailVerified: boolean;
}

export interface UserProfile {
  email: string;
  tier: "free" | "lifetime";
  verificationsToday: number;
  lastVerificationDate: string;
  totalVerifications: number;
}

export const FREE_DAILY_LIMIT = 20;

const DEV_EMAILS = new Set(["aiimsgenomics@gmail.com"]);

// ── Session persistence ───────────────────────────────────────────────────────

const SESSION_KEY = "cg_session";

export function saveSession(session: UserSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function isTokenExpired(session: UserSession): boolean {
  return Date.now() / 1000 >= session.expiresAt - 60; // 60 s buffer
}

// ── Auth commands (all go through Rust/reqwest, not WebKit fetch) ─────────────

export async function signUpEmail(email: string, password: string): Promise<UserSession> {
  const session = await invoke<UserSession>("firebase_sign_up", { email, password });
  saveSession(session);
  return session;
}

export async function signInEmail(email: string, password: string): Promise<UserSession> {
  const session = await invoke<UserSession>("firebase_sign_in", { email, password });
  saveSession(session);
  return session;
}

export async function refreshSession(session: UserSession): Promise<UserSession> {
  const refreshed = await invoke<UserSession>("firebase_refresh_token", {
    refreshToken: session.refreshToken,
  });
  // Refresh endpoint doesn't return email or emailVerified — preserve both from old session
  const updated: UserSession = {
    ...refreshed,
    email: refreshed.email || session.email,
    emailVerified: refreshed.emailVerified || session.emailVerified,
  };
  saveSession(updated);
  return updated;
}

export function logOut(): void {
  clearSession();
  // Signal auth state change to the store
  window.dispatchEvent(new Event("cg:logout"));
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

export async function ensureUserProfile(session: UserSession): Promise<UserProfile> {
  const profile = await invoke<UserProfile>("firestore_ensure_profile", {
    uid: session.uid,
    email: session.email,
    idToken: session.idToken,
  });
  return profile;
}

export async function getUserProfile(session: UserSession): Promise<UserProfile | null> {
  return invoke<UserProfile | null>("firestore_get_profile", {
    uid: session.uid,
    idToken: session.idToken,
  });
}

export async function canVerify(session: UserSession): Promise<{ allowed: boolean; remaining: number }> {
  if (DEV_EMAILS.has(session.email)) return { allowed: true, remaining: Infinity };
  const profile = await getUserProfile(session);
  // If Firestore is unavailable, fail open — don't block the user on a network error
  if (!profile) return { allowed: true, remaining: FREE_DAILY_LIMIT };
  if (profile.tier === "lifetime") return { allowed: true, remaining: Infinity };

  const today = new Date().toISOString().split("T")[0];
  const count = profile.lastVerificationDate === today ? profile.verificationsToday : 0;
  const remaining = Math.max(0, FREE_DAILY_LIMIT - count);
  return { allowed: remaining > 0, remaining };
}

export async function upgradeToLifetime(session: UserSession): Promise<UserProfile> {
  return invoke<UserProfile>("firestore_upgrade_to_lifetime", {
    uid: session.uid,
    idToken: session.idToken,
  });
}

export async function refreshProfile(session: UserSession): Promise<UserProfile | null> {
  return getUserProfile(session);
}

export async function recordVerification(session: UserSession): Promise<void> {
  await invoke("firestore_record_verification", {
    uid: session.uid,
    idToken: session.idToken,
  });
}

export async function sendVerificationEmail(session: UserSession): Promise<void> {
  await invoke("firebase_send_verification", { idToken: session.idToken });
}

export async function checkEmailVerified(session: UserSession): Promise<boolean> {
  return invoke<boolean>("firebase_check_verified", { idToken: session.idToken });
}
