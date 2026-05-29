#!/usr/bin/env python3
"""Convert CiteGuardIcon.jpg to all icon formats required by Tauri."""
from PIL import Image
import os, sys

src = os.path.join(os.path.dirname(__file__), '../src-tauri/icons/CiteGuardIcon.jpg')
out = os.path.join(os.path.dirname(__file__), '../src-tauri/icons')

img = Image.open(src).convert('RGBA')
print(f"Source: {img.size} {img.mode}")

# PNG icons
for size, name in [(32, '32x32.png'), (128, '128x128.png'), (256, 'icon.png')]:
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, name), 'PNG')
    print(f"  ✓ {name}")

# ICO (Windows) — multiple sizes embedded
ico_sizes = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
ico_images = [img.resize(s, Image.LANCZOS) for s in ico_sizes]
ico_images[0].save(
    os.path.join(out, 'icon.ico'),
    format='ICO',
    sizes=ico_sizes,
    append_images=ico_images[1:]
)
print("  ✓ icon.ico")

# ICNS (macOS)
try:
    img.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, 'icon.icns'), format='ICNS')
    print("  ✓ icon.icns")
except Exception as e:
    print(f"  ! icon.icns skipped ({e}) — stub kept")

print("Icons ready.")
