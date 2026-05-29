import { create } from "zustand";
import {
  type UserSession,
  type UserProfile,
  loadSession,
  isTokenExpired,
  refreshSession,
  clearSession,
  ensureUserProfile,
  checkEmailVerified,
} from "../lib/firebase";

interface AuthState {
  session: UserSession | null;
  profile: UserProfile | null;
  loading: boolean;

  setSession: (session: UserSession | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (v: boolean) => void;
}

// Returns a fresh session, refreshing the token if expired.
export async function getFreshSession(): Promise<UserSession | null> {
  const { session, setSession } = useAuthStore.getState();
  if (!session) return null;
  if (!isTokenExpired(session)) return session;
  try {
    const refreshed = await refreshSession(session);
    setSession(refreshed);
    return refreshed;
  } catch {
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
    await clearSession();
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
}));

// Called once from main.tsx before React renders.
// loadSession() handles both hot sessions (Rust AppState) and cold-start
// restore (refresh token from localStorage → new idToken stored in AppState).
export async function initAuth(): Promise<void> {
  const store = useAuthStore.getState();

  try {
    let session = await loadSession();

    if (session) {
      try {
        if (isTokenExpired(session)) {
          session = await refreshSession(session);
        }
        // Re-check email_verified — refresh endpoint always returns false for this field
        const verified = await checkEmailVerified(session).catch(() => session!.emailVerified);
        session = { ...session, emailVerified: verified };
        store.setSession(session);
        const profile = await ensureUserProfile(session);
        useAuthStore.getState().setProfile(profile);
      } catch {
        await clearSession();
        useAuthStore.getState().setSession(null);
      }
    }
  } catch (err) {
    console.error("[CiteGuard] initAuth error:", err);
  } finally {
    // Always unblock the UI — a loading screen that never resolves is worse than
    // showing the auth screen after an unexpected error.
    store.setLoading(false);
  }

  window.addEventListener("cg:logout", () => {
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
  });
}
