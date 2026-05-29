import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "chrome105", minify: !process.env.TAURI_DEBUG, sourcemap: !!process.env.TAURI_DEBUG },
  optimizeDeps: { exclude: ["pdfjs-dist"] },
  worker: { format: "es" },
});
