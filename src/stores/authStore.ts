import { create } from "zustand";
import {
  type UserSession,
  type UserProfile,
  loadSession,
  isTokenExpired,
  refreshSession,
  clearSession,
  ensureUserProfile,
} from "../lib/firebase";

interface AuthState {
  session: UserSession | null;
  profile: UserProfile | null;
  loading: boolean;

  setSession: (session: UserSession | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (v: boolean) => void;
}

// Returns a fresh session, refreshing the token if it has expired.
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
    clearSession();
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,

  setSession: (session) => set({ session }),
  setProfile:  (profile)  => set({ profile }),
  setLoading:  (loading)  => set({ loading }),
}));

// Called once from main.tsx before React renders
export async function initAuth(): Promise<void> {
  const store = useAuthStore.getState();

  let session = loadSession();

  if (session) {
    try {
      if (isTokenExpired(session)) {
        session = await refreshSession(session);
      }
      store.setSession(session);
      const profile = await ensureUserProfile(session);
      useAuthStore.getState().setProfile(profile);
    } catch {
      // Token invalid / refresh failed — force re-login
      clearSession();
      useAuthStore.getState().setSession(null);
    }
  }

  store.setLoading(false);

  // Listen for explicit logout events
  window.addEventListener("cg:logout", () => {
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
  });
}
