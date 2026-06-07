#!/usr/bin/env python3
"""
generate_placeholder_icon.py
─────────────────────────────
Generates a 1024×1024 placeholder icon for Who Wants to Be Smart?

Usage:
    # With Pillow installed (best output):
    pip install Pillow
    python3 scripts/generate_placeholder_icon.py

    # Without Pillow — writes an SVG you can export to PNG:
    python3 scripts/generate_placeholder_icon.py --svg

Output:
    assets/icon/icon.png   (or icon.svg if --svg)

After dropping a real icon.png in assets/icon/, run:
    flutter pub run flutter_launcher_icons

App store requirements:
    • 1024×1024 px
    • PNG, RGB or RGBA
    • No rounded corners (the OS applies them)
    • For iOS: no alpha channel (flutter_launcher_icons handles this)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# ── colour palette (matches AppTheme) ────────────────────────────────────────
BG_DARK  = (10,   10,  46)   # #0A0A2E
BG_CARD  = (22,   21,  90)   # #16155A
GOLD     = (255, 215,   0)   # #FFD700
WHITE    = (255, 255, 255)


# ── SVG fallback (no Pillow) ──────────────────────────────────────────────────

SVG_TEMPLATE = """\
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="60%">
      <stop offset="0%"   stop-color="#1F1D7A"/>
      <stop offset="100%" stop-color="#0A0A2E"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#FFD700" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#FFD700" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" fill="url(#bg)"/>

  <!-- Glow halo -->
  <circle cx="512" cy="490" r="340" fill="url(#glow)"/>

  <!-- Gold star emoji simulation using polygon -->
  <polygon
    points="512,180 575,390 800,390 620,510 685,720 512,600 339,720 404,510 224,390 449,390"
    fill="#FFD700"
    stroke="#B8970A"
    stroke-width="6"
  />

  <!-- App title text -->
  <text
    x="512" y="820"
    font-family="Arial Rounded MT Bold, Arial, sans-serif"
    font-size="80"
    font-weight="bold"
    fill="#FFD700"
    text-anchor="middle"
    letter-spacing="-2"
  >WWTBS?</text>

  <!-- Sub-label -->
  <text
    x="512" y="900"
    font-family="Arial, sans-serif"
    font-size="42"
    fill="rgba(255,255,255,0.55)"
    text-anchor="middle"
  >Who Wants to Be Smart?</text>
</svg>
"""


def write_svg(out_path: Path) -> None:
    out_path.write_text(SVG_TEMPLATE, encoding='utf-8')
    print(f'✅  SVG written to {out_path}')
    print()
    print('Next steps:')
    print('  1. Open the SVG in a browser or Inkscape.')
    print('  2. Export as PNG at 1024×1024 px.')
    print(f'  3. Save to {out_path.with_suffix(".png")}')
    print('  4. Run:  flutter pub run flutter_launcher_icons')


# ── Pillow version ────────────────────────────────────────────────────────────

def write_png(out_path: Path) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
    except ImportError:
        print('❌  Pillow is not installed.')
        print('   Run:  pip install Pillow')
        print('   Or use --svg to generate an SVG instead.')
        sys.exit(1)

    size  = 1024
    star_y_offset = -30   # shift star slightly up to make room for text

    img  = Image.new('RGBA', (size, size), color=(0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── Background circle (will be clipped by OS) ─────────────────────────
    draw.rectangle([0, 0, size, size], fill=BG_DARK)

    # ── Soft inner glow ────────────────────────────────────────────────────
    # Drawn as a series of translucent circles with decreasing alpha.
    cx, cy = size // 2, size // 2 + star_y_offset
    for r in range(320, 0, -20):
        alpha = max(0, int(60 * (1 - r / 320)))
        overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=(*GOLD, alpha),
        )
        img = Image.alpha_composite(img, overlay)
        draw = ImageDraw.Draw(img)

    # ── Star polygon ───────────────────────────────────────────────────────
    def star_points(
        cx: int, cy: int, outer: int, inner: int, num_points: int = 5
    ) -> list[tuple[float, float]]:
        import math
        pts = []
        for i in range(num_points * 2):
            angle = math.pi / num_points * i - math.pi / 2
            r = outer if i % 2 == 0 else inner
            pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
        return pts

    pts = star_points(cx, cy, outer=290, inner=120)
    draw.polygon(pts, fill=GOLD, outline=(184, 151, 10))

    # ── App name text ──────────────────────────────────────────────────────
    font_size_title = 82
    font_size_sub   = 38

    def load_font(size: int):
        # Try common bold rounded fonts, fall back to default.
        candidates = [
            '/System/Library/Fonts/Rounded/SF-Pro-Rounded-Bold.otf',
            '/System/Library/Fonts/Arial Rounded MT Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        ]
        for path in candidates:
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    continue
        return ImageFont.load_default()

    font_title = load_font(font_size_title)
    font_sub   = load_font(font_size_sub)

    # Title
    title_text = 'WWTBS?'
    bbox = draw.textbbox((0, 0), title_text, font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(
        ((size - tw) // 2, 780),
        title_text,
        fill=GOLD,
        font=font_title,
    )

    # Subtitle
    sub_text = 'Who Wants to Be Smart?'
    bbox2 = draw.textbbox((0, 0), sub_text, font=font_sub)
    sw = bbox2[2] - bbox2[0]
    draw.text(
        ((size - sw) // 2, 876),
        sub_text,
        fill=(*WHITE, 140),
        font=font_sub,
    )

    # Flatten to RGB for PNG (iOS requires no alpha channel).
    bg = Image.new('RGB', (size, size), BG_DARK)
    bg.paste(img, mask=img.split()[3])
    bg.save(str(out_path), 'PNG', optimize=True)

    print(f'✅  Icon written to {out_path}  ({out_path.stat().st_size // 1024} KB)')
    print()
    print('Next steps:')
    print('  1. Review the icon in assets/icon/icon.png')
    print('  2. Replace with your final artwork when ready.')
    print('  3. Run:  flutter pub run flutter_launcher_icons')


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Generate a placeholder app icon for Who Wants to Be Smart?'
    )
    parser.add_argument(
        '--svg', action='store_true',
        help='Write an SVG file instead of PNG (no Pillow required)',
    )
    args = parser.parse_args()

    # Locate assets/icon/ relative to this script (scripts/ → project root).
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    icon_dir = project_root / 'assets' / 'icon'
    icon_dir.mkdir(parents=True, exist_ok=True)

    if args.svg:
        write_svg(icon_dir / 'icon.svg')
    else:
        write_png(icon_dir / 'icon.png')


if __name__ == '__main__':
    main()
