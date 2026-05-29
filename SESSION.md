# CiteGuard Desktop — Session Continuity

## To resume this session in Claude Code

Open VS Code in `/media/drprabudh/m4/CiteGuardDesktop`, then start Claude Code and paste:

> "Continue building CiteGuard Desktop. Read SESSION.md for full context."

---

## Project Overview

Two sibling projects:

| Path | What |
|------|------|
| `/media/drprabudh/m4/CiteGuardMCP` | TypeScript MCP server (complete, 57/57 tests pass) |
| `/media/drprabudh/m4/CiteGuardDesktop` | Tauri 2.0 desktop app (this repo) |

---

## Current App Status ✅

The app is **fully functional and running**. Confirmed working:

```
INFO: Ollama: /usr/local/bin/ollama ✓
INFO: MCP ready with 6 tools ✓
INFO: Ollama already running ✓
Vite HMR updated all frontend components ✓
```

Run with:
```bash
cd /media/drprabudh/m4/CiteGuardDesktop
npm run tauri dev
```

---

## Architecture

```
Frontend (React + Vite + Tailwind)
  └── Tauri IPC bridge (tauri-bridge.ts)
        └── Rust backend (src-tauri/)
              ├── Ollama client  →  http://127.0.0.1:11435  (system Ollama)
              └── MCP client     →  bun run dist/index.js   (stdio JSON-RPC)
                    └── CiteGuardMCP  (6 tools: verify_citation, search_pubmed, etc.)
```

### API Keys (hardcoded in Rust — NOT exposed to users)

Located in `src-tauri/src/mcp/client.rs`:

```
SEMANTIC_SCHOLAR_API_KEY = s2k-LmpWXbiV3pL6KTvD2ajyKpbIccT8nj93waeMEhEM
NCBI_API_KEY             = 6cb899287cda30b3c1be427996b8823a3408
MAILTO                   = aiimsgenomics@gmail.com
```

---

## Last Thing Implemented (file input feature)

### What was added

**`src/lib/file-processor.ts`** — Text extraction from uploaded files:
- PDF via `pdfjs-dist`
- Word (.docx) via `mammoth`
- Excel (.xlsx/.xls) via `xlsx` (SheetJS)

**`src/components/chat/ChatWindow.tsx`** — UI changes:
- Paperclip button opens native file picker (PDF / Word / Excel)
- Spinner while parsing
- Blue attachment badge with filename shown above input
- Auto-fills textarea with extraction prompt

### Pending: npm install

The three new packages were added to `package.json` but **`npm install` has not been run yet**.

Run this before starting the app:

```bash
cd /media/drprabudh/m4/CiteGuardDesktop
npm install
npm run tauri dev
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | App state, binary discovery, MCP + Ollama init |
| `src-tauri/src/mcp/client.rs` | MCP stdio subprocess manager, API keys |
| `src-tauri/src/ollama/client.rs` | Ollama HTTP client (port 11435, 600s timeout) |
| `src-tauri/src/commands/settings.rs` | Settings struct (active_model, theme) |
| `src/lib/tauri-bridge.ts` | TypeScript ↔ Rust IPC types and calls |
| `src/lib/file-processor.ts` | PDF / Word / Excel text extraction |
| `src/components/chat/ChatWindow.tsx` | Main chat UI + file attachment |
| `src/components/settings/SettingsPanel.tsx` | Model selector (no API key fields) |
| `scripts/bundle-mcp.sh` | Builds MCP server bundle with bun |
| `scripts/fetch-binaries.sh` | Symlinks system Ollama + downloads bun |
| `vite.config.ts` | Vite config (pdfjs optimizeDeps excluded) |
| `tauri.conf.json` | Tauri capabilities, resources, window config |

---

## Known Gotchas

- **Ollama port**: Uses `11435` (not default 11434) — set in Ollama env
- **MCP SDK version**: Pinned to `1.12.1` via `overrides` in `CiteGuardMCP/package.json` (1.29.0 breaks completions)
- **`npm install` not `npm ci`** in `scripts/bundle-mcp.sh` — overrides require regenerating lock file
- **`store: {}`** must NOT be in `tauri.conf.json` plugins — causes "invalid type: map, expected unit" crash
- **Bundled Ollama stub**: Uses `is_executable()` check (non-zero size + execute bit) to avoid using empty placeholder
- **pdfjs worker**: Configured via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href` + `optimizeDeps: { exclude: ['pdfjs-dist'] }` in vite.config.ts

---

## Remaining Work

1. **Test file input end-to-end** — attach a PDF with references, confirm tool-call loop fires and badges appear
2. **Final packaging** — `npm run tauri build` → produces `.deb` + `.AppImage`
3. **Optional**: Citations sidebar with per-reference verification badges

---

## Stack Versions

- Tauri 2.5 / Rust edition 2021
- React 19 + Vite 6 + TypeScript 5.8
- Tailwind 3.4 + lucide-react
- Zustand 5 (state) + tauri-plugin-store 2.2 (persistence)
- Ollama (system install at `/usr/local/bin/ollama`)
- Bun (bundled in `src-tauri/binaries/bun`)
- FastMCP 2.2.4 + MCP SDK 1.12.1
