#!/usr/bin/env bash
# Builds CiteGuard MCP into a single standalone JS bundle (no node_modules at runtime).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_SRC="/media/drprabudh/m4/CiteGuardMCP"
MCP_DEST="$ROOT/mcp"
BUN="$ROOT/src-tauri/binaries/bun"

if [[ ! -d "$MCP_SRC" ]]; then
  echo "ERROR: CiteGuard MCP source not found at: $MCP_SRC"
  exit 1
fi

if [[ ! -x "$BUN" ]]; then
  echo "ERROR: Bun not found at $BUN — run fetch-binaries.sh first"
  exit 1
fi

echo "→ Installing MCP dependencies..."
cd "$MCP_SRC"
npm install --silent

echo "→ Bundling MCP into standalone file with bun build..."
mkdir -p "$MCP_DEST/dist"
# Mark optional xsschema peer deps as external — they're not used by CiteGuard (Zod is used instead)
"$BUN" build "$MCP_SRC/src/index.ts" \
  --outfile "$MCP_DEST/dist/index.js" \
  --target=bun \
  --sourcemap=none \
  --external="@valibot/to-json-schema" \
  --external="sury" \
  --external="effect" \
  --external="@ark/schema" \
  --external="@ark/util"

echo "✓ MCP bundled:"
ls -lh "$MCP_DEST/dist/"
