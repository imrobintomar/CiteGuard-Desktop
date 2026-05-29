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

// ── Session persistence ───────────────────────────────────────────────────────
// idToken lives only in Rust AppState (cleared on restart — short-lived anyway).
// refreshToken + uid + email are persisted to localStorage so sessions survive
// restarts without storing the live bearer token on disk.

const UID_KEY = "cg_uid";
const EMAIL_KEY = "cg_email";
const REFRESH_KEY = "cg_rt";

function persistIdentity(session: UserSession): void {
  localStorage.setItem(UID_KEY, session.uid);
  localStorage.setItem(EMAIL_KEY, session.email);
  // refresh tokens rotate on use and are revocable server-side; safe to persist
  if (session.refreshToken) localStorage.setItem(REFRESH_KEY, session.refreshToken);
}

export function loadIdentity(): { uid: string; email: string } | null {
  const uid = localStorage.getItem(UID_KEY);
  const email = localStorage.getItem(EMAIL_KEY);
  return uid && email ? { uid, email } : null;
}

export function clearIdentity(): void {
  localStorage.removeItem(UID_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/** Store a full session in Rust AppState (idToken never hits localStorage). */
async function persistSession(session: UserSession): Promise<void> {
  await invoke("store_session", { session });
  persistIdentity(session);
}

/**
 * Retrieve the active session. Checks Rust AppState first; on cold start
 * (AppState empty), falls back to refreshing from the persisted refresh token.
 */
export async function loadSession(): Promise<UserSession | null> {
  const inMemory = await invoke<UserSession | null>("get_stored_session");
  if (inMemory) return inMemory;

  // Cold start: try to restore from the persisted refresh token
  const rt = localStorage.getItem(REFRESH_KEY);
  if (!rt) return null;
  try {
    const refreshed = await invoke<UserSession>("firebase_refresh_token", { refreshToken: rt });
    const uid = localStorage.getItem(UID_KEY) ?? "";
    const email = localStorage.getItem(EMAIL_KEY) ?? "";
    const session: UserSession = {
      ...refreshed,
      uid: refreshed.uid || uid,
      email: refreshed.email || email,
      emailVerified: refreshed.emailVerified,
    };
    await invoke("store_session", { session });
    persistIdentity(session);
    return session;
  } catch {
    // Refresh token expired or revoked — user must sign in again
    clearIdentity();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await invoke("clear_stored_session");
  clearIdentity();
}

export function isTokenExpired(session: UserSession): boolean {
  return Date.now() / 1000 >= session.expiresAt - 60;
}

// ── Auth commands (all go through Rust/reqwest, not WebKit fetch) ─────────────

export async function signUpEmail(email: string, password: string): Promise<UserSession> {
  const session = await invoke<UserSession>("firebase_sign_up", { email, password });
  await persistSession(session);
  return session;
}

export async function signInEmail(email: string, password: string): Promise<UserSession> {
  const session = await invoke<UserSession>("firebase_sign_in", { email, password });
  await persistSession(session);
  return session;
}

export async function refreshSession(session: UserSession): Promise<UserSession> {
  const refreshed = await invoke<UserSession>("firebase_refresh_token", {
    refreshToken: session.refreshToken,
  });
  const updated: UserSession = {
    ...refreshed,
    email: refreshed.email || session.email,
    emailVerified: refreshed.emailVerified || session.emailVerified,
  };
  await persistSession(updated);
  return updated;
}

export async function logOut(): Promise<void> {
  await clearSession();
  window.dispatchEvent(new Event("cg:logout"));
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

export async function ensureUserProfile(session: UserSession): Promise<UserProfile> {
  return invoke<UserProfile>("firestore_ensure_profile", {
    uid: session.uid,
    email: session.email,
    idToken: session.idToken,
  });
}

export async function getUserProfile(session: UserSession): Promise<UserProfile | null> {
  return invoke<UserProfile | null>("firestore_get_profile", {
    uid: session.uid,
    idToken: session.idToken,
  });
}

export async function canVerify(
  session: UserSession
): Promise<{ allowed: boolean; remaining: number; error?: string }> {
  let profile: UserProfile | null;
  try {
    profile = await getUserProfile(session);
    if (!profile) {
      // First-time user — no Firestore document yet. Create it and allow.
      profile = await ensureUserProfile(session);
    }
  } catch {
    // Firestore unreachable — fail CLOSED. Never grant access on outage.
    return { allowed: false, remaining: 0, error: "SERVICE_UNAVAILABLE" };
  }
  if (!profile) {
    return { allowed: false, remaining: 0, error: "SERVICE_UNAVAILABLE" };
  }
  if (profile.tier === "lifetime") return { allowed: true, remaining: Infinity };

  const today = new Date().toISOString().split("T")[0];
  const count = profile.lastVerificationDate === today ? profile.verificationsToday : 0;
  const remaining = Math.max(0, FREE_DAILY_LIMIT - count);
  return { allowed: remaining > 0, remaining };
}

export async function recordVerification(session: UserSession): Promise<void> {
  await invoke("firestore_record_verification", {
    uid: session.uid,
    idToken: session.idToken,
  });
}

export async function refreshProfile(session: UserSession): Promise<UserProfile | null> {
  return getUserProfile(session);
}

export async function sendVerificationEmail(session: UserSession): Promise<void> {
  await invoke("firebase_send_verification", { idToken: session.idToken });
}

export async function checkEmailVerified(session: UserSession): Promise<boolean> {
  return invoke<boolean>("firebase_check_verified", { idToken: session.idToken });
}
