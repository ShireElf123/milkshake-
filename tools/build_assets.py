#!/usr/bin/env python3
"""Rebuild the per-flavour hero images from the two masters.

    pip install pillow numpy scipy
    python3 tools/build_assets.py

Inputs  (tools/masters/)
    glass.webp   one strawberry-pink shake in a clear glass, already cut out (RGBA)
    scene.webp   one tone-on-tone pink splash backdrop

Outputs (assets/img/)
    shakes/<flavour>.webp   the glass, recoloured        (transparent background)
    scenes/<flavour>.webp   the backdrop, recoloured
    og.jpg                  1200x630 social share image

To add a flavour: add one line to FLAVOURS below, run this script, then add the
matching entries in assets/js/data.js.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from colorlib import recolor  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, 'tools', 'masters')
OUT = os.path.join(ROOT, 'assets', 'img')

GLASS_SRC = '#c57671'   # median colour of the shake in masters/glass.webp
SCENE_SRC = '#e7999b'   # median colour of masters/scene.webp
GLASS_STRETCH = 1.10    # the master glass is a touch slim; widen it slightly

# flavour: scene = mid tone of the backdrop, shake = mid tone of the drink;
# ink and word are the headline colour and text used on og.jpg (first flavour only)
FLAVOURS = {
    'grape':      dict(scene='#a968b6', shake='#ad79cc', ink='#fbd9ff', word='Grapeline'),
    'orange':     dict(scene='#ee9438', shake='#f4ad58', ink='#fff6d6', word='Orangeous'),
    'kiwi':       dict(scene='#86a23b', shake='#a8c260', ink='#f0ffd2', word='Kiwiful'),
    'strawberry': dict(scene='#e5868a', shake='#ea8c97', ink='#fff0ea', word='Berrylove'),
    'chocolate':  dict(scene='#6a3f29', shake='#86583f', ink='#fff1de', word='Cocoloco'),
}


def load(name):
    im = Image.open(os.path.join(MASTERS, name))
    return np.asarray(im).astype(np.float64) / 255.0


def to_img(arr):
    mode = 'RGBA' if arr.shape[-1] == 4 else 'RGB'
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), mode)


def build():
    glass = load('glass.webp')
    scene = load('scene.webp')[..., :3]
    for sub in ('shakes', 'scenes'):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    for name, f in FLAVOURS.items():
        g = np.dstack([recolor(glass[..., :3], GLASS_SRC, f['shake']), glass[..., 3]])
        gi = to_img(g)
        gi = gi.resize((round(gi.width * GLASS_STRETCH), gi.height), Image.LANCZOS)
        gi.save(os.path.join(OUT, 'shakes', name + '.webp'), 'WEBP', quality=88, method=6, alpha_quality=92)

        si = to_img(recolor(scene, SCENE_SRC, f['scene']))
        si.save(os.path.join(OUT, 'scenes', name + '.webp'), 'WEBP', quality=82, method=6)
        print(f'{name:11s} shake {gi.size}  scene {si.size}')

    first = next(iter(FLAVOURS))   # the share image shows the first flavour in the list
    og(to_img(recolor(scene, SCENE_SRC, FLAVOURS[first]['scene'])),
       Image.open(os.path.join(OUT, 'shakes', first + '.webp')), FLAVOURS[first])


def og(scene, glass, f, size=(1200, 630)):
    """Social share card: backdrop + headline word + glass."""
    W, H = size
    scale = max(W / scene.width, H / scene.height)
    bg = scene.resize((round(scene.width * scale), round(scene.height * scale)), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, bg.height - H, (bg.width - W) // 2 + W, bg.height)).convert('RGBA')
    font_file = os.path.join(ROOT, 'assets', 'fonts', 'suez-one-latin-400-normal.woff2')
    try:
        probe = ImageFont.truetype(font_file, 1000)
        em = sum(probe.getlength(c) for c in f['word']) / 1000 - 0.03 * (len(f['word']) - 1)
        fs = W * 1.0 / em
        font = ImageFont.truetype(font_file, int(fs))
        d = ImageDraw.Draw(bg)
        x, base = (W - em * fs) / 2, H * 0.47 + 0.337 * fs
        for c in f['word']:
            d.text((x, base), c, font=font, fill=f['ink'], anchor='ls')
            x += font.getlength(c) - 0.03 * fs
    except OSError:
        print('og: headline font not found, skipping the word')
    gh = int(H * 0.86)
    g = glass.resize((round(glass.width * gh / glass.height), gh), Image.LANCZOS)
    bg.alpha_composite(g, ((W - g.width) // 2, int(H * 0.52 - gh / 2)))
    bg.convert('RGB').save(os.path.join(OUT, 'og.jpg'), 'JPEG', quality=84, optimize=True, progressive=True)
    print('og.jpg', size)


if __name__ == '__main__':
    build()
