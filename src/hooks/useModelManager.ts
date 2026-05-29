import { useEffect } from "react";
import { bridge, onPullProgress, type GpuInfo } from "../lib/tauri-bridge";
import { useModelStore } from "../stores/modelStore";

export function useModelManager() {
  const store = useModelStore();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    onPullProgress((e) => {
      store.setPullProgress(e.model, {
        percent: e.percent,
        status: e.status,
        totalBytes: e.total_bytes,
        doneBytes: e.done_bytes,
      });
      if (e.status === "success") {
        store.clearPull(e.model);
        refresh();
      }
    }).then((fn) => { unsub = fn; });

    // Detect GPU and auto-select best model on first launch
    bridge.detectGpu().then((gpu: GpuInfo) => {
      store.setGpuInfo(gpu);
      // Only auto-select if user hasn't manually changed the model
      const current = useModelStore.getState().activeModel;
      if (current === "qwen3:14b") { // still on the default
        store.setActiveModel(gpu.recommended_model);
      }
    }).catch(() => { /* no GPU tools available, keep default */ });

    refresh();
    return () => { unsub?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    try {
      const [models, ollamaOk] = await Promise.all([
        bridge.listModels(),
        bridge.checkOllama(),
      ]);
      store.setModels(models);
      store.setOllamaReady(ollamaOk);
    } catch { /* Ollama not yet started */ }
  };

  const downloadModel = async (name: string) => {
    store.setPullProgress(name, { percent: 0, status: "starting" });
    try {
      await bridge.pullModel(name);
    } catch (e) {
      store.clearPull(name);
      throw e;
    }
  };

  return { models: store.models, pulling: store.pulling, downloadModel, refresh };
}
