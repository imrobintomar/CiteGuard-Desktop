import { create } from "zustand";
import { type ModelInfo, type GpuInfo } from "../lib/tauri-bridge";

interface PullState { percent: number; status: string; totalBytes?: number; doneBytes?: number }

interface ModelState {
  models: ModelInfo[];
  activeModel: string;
  availableModels: string[];
  ollamaReady: boolean;
  pulling: Record<string, PullState>;
  gpuInfo: GpuInfo | null;

  setModels: (m: ModelInfo[]) => void;
  setActiveModel: (name: string) => void;
  setAvailableModels: (names: string[]) => void;
  setOllamaReady: (v: boolean) => void;
  setPullProgress: (model: string, state: PullState) => void;
  clearPull: (model: string) => void;
  setGpuInfo: (info: GpuInfo) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  activeModel: "qwen3:14b",
  availableModels: [],
  ollamaReady: false,
  pulling: {},
  gpuInfo: null,

  setModels: (models) => set({ models }),
  setActiveModel: (activeModel) => set({ activeModel }),
  setAvailableModels: (availableModels) => set({ availableModels }),
  setOllamaReady: (ollamaReady) => set({ ollamaReady }),
  setPullProgress: (model, state) =>
    set((s) => ({ pulling: { ...s.pulling, [model]: state } })),
  clearPull: (model) =>
    set((s) => {
      const { [model]: _, ...rest } = s.pulling;
      return { pulling: rest };
    }),
  setGpuInfo: (gpuInfo) => set({ gpuInfo }),
}));
