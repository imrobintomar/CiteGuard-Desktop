/**
 * Thin wrapper around @tauri-apps/plugin-store.
 * All chat conversations are stored in a single JSON file:
 *   <app-data>/citeguard-store.json
 *
 * The store is lazy-loaded once and reused for the session.
 */
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Conversation } from "../stores/chatStore";

const STORE_FILE = "citeguard-store.json";
const KEY = "conversations";
const SCHEMA_VERSION = 2; // increment when Conversation shape changes incompatibly

let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) _store = await load(STORE_FILE, { defaults: {}, autoSave: true });
  return _store;
}

interface PersistedStore {
  version: number;
  conversations: Conversation[];
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const store = await getStore();
    const raw = await store.get<PersistedStore | Conversation[]>(KEY);
    if (!raw) return [];
    // Handle legacy format (plain array without version)
    if (Array.isArray(raw)) return raw;
    if (raw.version !== SCHEMA_VERSION) {
      console.warn(`[CiteGuard] Store version mismatch (got ${raw.version}, expected ${SCHEMA_VERSION}). Clearing.`);
      return [];
    }
    return raw.conversations;
  } catch {
    return [];
  }
}

export async function saveConversations(convs: Conversation[]): Promise<void> {
  try {
    const store = await getStore();
    const sanitized = convs.slice(0, 200).map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({ ...m, streaming: false })),
    }));
    await store.set(KEY, { version: SCHEMA_VERSION, conversations: sanitized } satisfies PersistedStore);
  } catch (e) {
    console.error("[CiteGuard] Failed to persist conversations:", e);
  }
}
