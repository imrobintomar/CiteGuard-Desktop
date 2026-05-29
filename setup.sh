#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CiteGuard Desktop — One-shot setup script
# Installs all dependencies and builds the app.
#
# Ubuntu/Debian:  ./setup.sh
# macOS:          ./setup.sh
# Windows:        use setup.ps1 (see README)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS="$(uname -s)"

echo "╔══════════════════════════════════════╗"
echo "║   CiteGuard Desktop — Setup          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. System dependencies ────────────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
  echo "→ Installing system libraries (requires sudo)..."
  sudo apt-get update -qq
  sudo apt-get install -y \
    build-essential curl wget file \
    libwebkit2gtk-4.1-dev \
    libssl-dev libgtk-3-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf
fi

# ── 2. Rust ───────────────────────────────────────────────────────────────────
if ! command -v rustc &>/dev/null; then
  echo "→ Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  source "$HOME/.cargo/env"
else
  echo "✓ Rust $(rustc --version)"
fi

# ── 3. Node dependencies ──────────────────────────────────────────────────────
echo "→ Installing npm dependencies..."
cd "$ROOT"
npm install

# ── 4. Bundled binaries (Ollama + Bun) ───────────────────────────────────────
echo "→ Fetching bundled binaries..."
bash "$ROOT/scripts/fetch-binaries.sh"

# ── 5. Bundle CiteGuard MCP ───────────────────────────────────────────────────
echo "→ Bundling CiteGuard MCP..."
bash "$ROOT/scripts/bundle-mcp.sh"

# ── 6. Generate placeholder icons (replace with real icons before release) ───
echo "→ Generating placeholder app icons..."
ICON_DIR="$ROOT/src-tauri/icons"
if ! command -v convert &>/dev/null; then
  echo "   (ImageMagick not found — creating minimal PNGs with Python)"
  python3 - <<'PY'
import struct, zlib, os
def make_png(size, path):
    w = h = size
    raw = b'\x00' + bytes([30, 30, 30] * w) * h  # dark gray
    compressed = zlib.compress(raw)
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))
os.makedirs('src-tauri/icons', exist_ok=True)
make_png(32,  'src-tauri/icons/32x32.png')
make_png(128, 'src-tauri/icons/128x128.png')
make_png(256, 'src-tauri/icons/icon.png')
print('   Icons created.')
PY
fi
# Create minimal .ico and .icns stubs
touch "$ICON_DIR/icon.ico" 2>/dev/null || true
touch "$ICON_DIR/icon.icns" 2>/dev/null || true

# ── 7. Build ──────────────────────────────────────────────────────────────────
echo ""
echo "→ Building CiteGuard Desktop..."
source "$HOME/.cargo/env" 2>/dev/null || true
npm run tauri build

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Build complete!                    ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Installers:"
find "$ROOT/src-tauri/target/release/bundle" \
  -name "*.deb" -o -name "*.AppImage" -o -name "*.dmg" -o -name "*.msi" \
  2>/dev/null | sed 's/^/  /'
