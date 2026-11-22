#!/usr/bin/env python3
"""Generate the Store POS icons (web + Android mipmaps) from one drawing."""
import os
import glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAL = (15, 118, 110, 255)
TEAL_DARK = (11, 93, 86, 255)
WHITE = (255, 255, 255, 255)
AMBER = (245, 179, 66, 255)


def find_font():
    candidates = [
        os.path.expanduser('~/tools/fonts/NotoSans-Bold.ttf'),
        os.path.expanduser('~/tools/fonts/DejaVuSans-Bold.ttf'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    hits = glob.glob('/usr/share/fonts/**/*Bold*.ttf', recursive=True)
    return hits[0] if hits else None


FONT = find_font()
print('font:', FONT)


def draw_icon(size, radius_ratio=0.22, glyph_ratio=0.58, maskable=False):
    """Teal rounded square with a white peso sign and an amber shelf line."""
    scale = 4  # supersample for smooth edges
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        d.rectangle([0, 0, s, s], fill=TEAL)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=TEAL)
        # soft dark corner accent
        d.rounded_rectangle([0, int(s * 0.72), s - 1, s - 1],
                            radius=int(s * radius_ratio), fill=TEAL_DARK)
        d.rectangle([0, int(s * 0.72), s - 1, int(s * 0.86)], fill=TEAL)

    # peso sign
    if FONT:
        font = ImageFont.truetype(FONT, int(s * glyph_ratio))
        glyph = '\u20b1'  # ₱
        bbox = d.textbbox((0, 0), glyph, font=font)
        gw, gh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (s - gw) / 2 - bbox[0]
        y = (s - gh) / 2 - bbox[1] - int(s * 0.02)
        d.text((x, y), glyph, font=font, fill=WHITE)
    else:
        # fallback: block "P" with bars
        d.rectangle([s * 0.3, s * 0.22, s * 0.42, s * 0.78], fill=WHITE)
        d.rectangle([s * 0.3, s * 0.22, s * 0.66, s * 0.34], fill=WHITE)
        d.rectangle([s * 0.3, s * 0.46, s * 0.62, s * 0.55], fill=WHITE)

    # shelf / register line
    bar_w = int(s * 0.44)
    bar_h = max(2, int(s * 0.045))
    d.rounded_rectangle([(s - bar_w) / 2, int(s * 0.79), (s + bar_w) / 2, int(s * 0.79) + bar_h],
                        radius=bar_h / 2, fill=AMBER)

    return img.resize((size, size), Image.LANCZOS)


def save(img, rel):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG', optimize=True)
    print('wrote', rel, img.size)


save(draw_icon(512), 'www/icons/icon-512.png')
save(draw_icon(192), 'www/icons/icon-192.png')
save(draw_icon(180), 'www/icons/apple-touch-icon.png')
save(draw_icon(512, maskable=True, glyph_ratio=0.5), 'www/icons/icon-maskable-512.png')

# Android launcher icons
for folder, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    save(draw_icon(px), 'android/res/mipmap-%s/ic_launcher.png' % folder)

# 512 px store listing / play assets
save(draw_icon(1024), 'dist/icon-1024.png')
