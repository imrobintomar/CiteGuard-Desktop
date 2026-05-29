#!/usr/bin/env bash
# Downloads runtime binaries into src-tauri/binaries/
# - Bun: always downloaded (needed to run the MCP server)
# - Ollama: skipped if already installed system-wide; downloaded otherwise
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"

mkdir -p "$BIN_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "→ Platform: $OS / $ARCH"

# ── Bun ──────────────────────────────────────────────────────────────────────
BUN_VERSION="1.2.14"
if [[ "$OS" == "Linux" ]]; then
  BUN_TARGET="bun-linux-x64"
elif [[ "$OS" == "Darwin" && "$ARCH" == "arm64" ]]; then
  BUN_TARGET="bun-darwin-aarch64"
elif [[ "$OS" == "Darwin" ]]; then
  BUN_TARGET="bun-darwin-x64"
fi

BUN_URL="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${BUN_TARGET}.zip"
echo "→ Downloading Bun $BUN_VERSION..."
curl -fsSL "$BUN_URL" -o /tmp/bun.zip
unzip -p /tmp/bun.zip "${BUN_TARGET}/bun" > "$BIN_DIR/bun"
chmod +x "$BIN_DIR/bun"
rm /tmp/bun.zip
echo "   Bun: $("$BIN_DIR/bun" --version)"

# ── Ollama ────────────────────────────────────────────────────────────────────
# Use system Ollama if available; only download if not installed.
SYSTEM_OLLAMA=""
for candidate in /usr/local/bin/ollama /usr/bin/ollama "$HOME/.local/bin/ollama"; do
  if [[ -x "$candidate" ]]; then
    SYSTEM_OLLAMA="$candidate"
    break
  fi
done

if [[ -n "$SYSTEM_OLLAMA" ]]; then
  echo "→ Using system Ollama at $SYSTEM_OLLAMA ($("$SYSTEM_OLLAMA" --version 2>&1 | head -1))"
  # Symlink into binaries/ so Tauri can optionally bundle it
  ln -sf "$SYSTEM_OLLAMA" "$BIN_DIR/ollama" 2>/dev/null || cp "$SYSTEM_OLLAMA" "$BIN_DIR/ollama"
else
  echo "→ Ollama not found system-wide — downloading latest release..."
  OLLAMA_VERSION=$(curl -fsSL "https://api.github.com/repos/ollama/ollama/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
  echo "   Version: $OLLAMA_VERSION"

  if [[ "$OS" == "Linux" ]]; then
    # Newer Ollama releases ship as tar.zst containing bin/ollama
    OLLAMA_URL="https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-amd64.tar.zst"
    curl -fsSL "$OLLAMA_URL" -o /tmp/ollama.tar.zst
    mkdir -p /tmp/ollama-extract
    tar -I zstd -xf /tmp/ollama.tar.zst -C /tmp/ollama-extract
    cp /tmp/ollama-extract/bin/ollama "$BIN_DIR/ollama"
    rm -rf /tmp/ollama.tar.zst /tmp/ollama-extract
  elif [[ "$OS" == "Darwin" ]]; then
    OLLAMA_URL="https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin.tgz"
    curl -fsSL "$OLLAMA_URL" -o /tmp/ollama.tgz
    tar -xzf /tmp/ollama.tgz -C /tmp/ollama-extract bin/ollama
    cp /tmp/ollama-extract/bin/ollama "$BIN_DIR/ollama"
    rm -rf /tmp/ollama.tgz /tmp/ollama-extract
  fi
  chmod +x "$BIN_DIR/ollama"
  echo "   Ollama: $("$BIN_DIR/ollama" --version 2>&1 | head -1)"
fi

echo "✓ Binaries ready in $BIN_DIR"
ls -lh "$BIN_DIR"
