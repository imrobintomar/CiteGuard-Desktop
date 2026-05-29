import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Citation } from "./chatStore";

export interface LibraryCitation extends Citation {
  savedAt: number;
  tags: string[];
  notes: string;
  retractionCheckedAt?: number;
  retractionAlerted?: boolean;
}

interface LibraryState {
  items: LibraryCitation[];
  save: (c: Citation) => void;
  remove: (id: string) => void;
  updateNotes: (id: string, notes: string) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  markRetractionChecked: (id: string, alerted: boolean) => void;
  hasSaved: (doi?: string, title?: string) => boolean;
}

export const useCitationLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],

      save: (c) => {
        // Avoid duplicates by DOI or title
        const existing = get().items.find(
          (i) => (c.doi && i.doi === c.doi) || (c.title && i.title === c.title)
        );
        if (existing) return;
        const item: LibraryCitation = { ...c, id: uuidv4(), savedAt: Date.now(), tags: [], notes: "" };
        set((s) => ({ items: [item, ...s.items] }));
      },

      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      updateNotes: (id, notes) =>
        set((s) => ({ items: s.items.map((i) => i.id === id ? { ...i, notes } : i) })),

      addTag: (id, tag) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id && !i.tags.includes(tag) ? { ...i, tags: [...i.tags, tag] } : i
          ),
        })),

      removeTag: (id, tag) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, tags: i.tags.filter((t) => t !== tag) } : i
          ),
        })),

      markRetractionChecked: (id, alerted) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, retractionCheckedAt: Date.now(), retractionAlerted: alerted } : i
          ),
        })),

      hasSaved: (doi, title) =>
        get().items.some((i) => (doi && i.doi === doi) || (title && i.title === title)),
    }),
    { name: "cg-citation-library" }
  )
);
