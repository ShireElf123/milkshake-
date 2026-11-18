#!/usr/bin/env python3
"""Build the hero images of every flavour from the masters.

    pip install pillow numpy scipy
    python3 tools/build_assets.py

Inputs  (tools/masters/)
    glass-<flavour>.webp   the shake in its glass, cut out (RGBA); used as photographed
    served-<flavour>.webp  optional second photo: the same glass served with cream and a straw,
                           cut out with the same crop as the glass so the two line up
    scene-<flavour>.webp   the backdrop; its overall tone is nudged to the flavour's scene colour
    glass.webp, scene.webp generic strawberry-pink masters: a flavour without a picture of
                           its own gets these, recoloured

Outputs (assets/img/)
    shakes/<flavour>.webp   the glass                    (transparent background)
    scenes/<flavour>.webp   the backdrop
    scenes/<flavour>-flow.webp  a mask of the liquid in that backdrop, for the
                           moving-liquid layer (assets/js/liquid.js)
    served/<flavour>.webp   the served photo, plus <flavour>-thumb.webp for small spots
    og.jpg                  1200x630 social share image  (first flavour in the list)

To add a flavour: add one line to FLAVOURS below, optionally add its own masters
(see tools/cutout.py for cutting out a glass), run this script, then add the
matching entries in assets/js/data.js (set `served: true` there only if the
flavour has a served photo).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from colorlib import recolor  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, 'tools', 'masters')
OUT = os.path.join(ROOT, 'assets', 'img')

GLASS_SRC = '#c57671'   # median colour of the shake in masters/glass.webp
SCENE_SRC = '#e7999b'   # median colour of masters/scene.webp
GLASS_CANVAS = 610      # every glass is centred on a canvas this wide, so all flavours line up
GLASS_STRETCH = 1.06    # the glass is a touch slim; widen it slightly
THUMB_HEIGHT = 320      # served/<flavour>-thumb.webp

# flavour: scene = mid tone of the backdrop, shake = mid tone of the drink (generic master only);
# ink and word are the headline colour and text used on og.jpg (first flavour only)
FLAVOURS = {
    'grape':      dict(scene='#a968b6', shake='#ad79cc', ink='#fbd9ff', word='Grapeline'),
    'orange':     dict(scene='#ee9438', shake='#f4ad58', ink='#fff6d6', word='Orangeous'),
    'kiwi':       dict(scene='#86a23b', shake='#a8c260', ink='#f0ffd2', word='Kiwitastic'),
    'strawberry': dict(scene='#e5868a', shake='#ea8c97', ink='#fff0ea', word='Berrylove'),
    'chocolate':  dict(scene='#6a3f29', shake='#86583f', ink='#fff1de', word='Cocoloco'),
}


def load(name):
    """A master as a float array, or None if there is no such file."""
    path = os.path.join(MASTERS, name)
    if not os.path.exists(path):
        return None
    return np.asarray(Image.open(path)).astype(np.float64) / 255.0


def to_img(arr):
    mode = 'RGBA' if arr.shape[-1] == 4 else 'RGB'
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), mode)


def median_hex(rgb):
    r, g, b = (np.median(rgb.reshape(-1, 3), axis=0) * 255 + 0.5).astype(int)
    return f'#{r:02x}{g:02x}{b:02x}'


def on_canvas(img):
    """Centre a cut-out on the common canvas and widen it like every other glass."""
    if img.width < GLASS_CANVAS:
        wide = Image.new('RGBA', (GLASS_CANVAS, img.height), (0, 0, 0, 0))
        wide.paste(img, ((GLASS_CANVAS - img.width) // 2, 0))
        img = wide
    return img.resize((round(img.width * GLASS_STRETCH), img.height), Image.LANCZOS)


def glass_image(name, f, generic):
    own = load(f'glass-{name}.webp')
    if own is None:
        own = np.dstack([recolor(generic[..., :3], GLASS_SRC, f['shake']), generic[..., 3]])
    return on_canvas(to_img(own))


def served_image(name):
    """The served photo, framed exactly like the glass; None if the flavour has none."""
    own = load(f'served-{name}.webp')
    return None if own is None else on_canvas(to_img(own))


def scene_image(name, f, generic):
    own = load(f'scene-{name}.webp')
    if own is None:
        return to_img(recolor(generic, SCENE_SRC, f['scene']))
    own = own[..., :3]
    return to_img(recolor(own, median_hex(own), f['scene'], hue_keep=1.0))


def flow_mask(scene, path):
    """Where in the backdrop is liquid? Colour and texture find the pool that touches
    the bottom of the picture; everything below its horizon becomes the mask, so the
    WebGL layer only ever draws over liquid."""
    a = np.asarray(scene.convert('RGB')).astype(np.float32) / 255.0
    H, W, _ = a.shape
    top = np.median(a[int(H * 0.06):int(H * 0.14)], axis=0)
    pad = np.pad(top, ((25, 25), (0, 0)), mode='edge')
    wall = np.stack([np.convolve(pad[:, c], np.ones(51) / 51, mode='valid') for c in range(3)], axis=1)
    dist = np.sqrt(((a - wall[None, :, :]) ** 2).sum(-1))
    lum = a @ [0.299, 0.587, 0.114]
    gy, gx = np.gradient(lum)
    tex = ndimage.uniform_filter(np.hypot(gx, gy), size=9)
    liq = (dist > 0.10) | (lum > np.median(lum[:int(H * 0.2)]) + 0.22) | (tex > 0.012)
    liq = ndimage.binary_closing(liq, np.ones((9, 9)), border_value=1)
    lab, n = ndimage.label(liq)
    sizes = ndimage.sum(liq, lab, index=range(1, n + 1))
    keep = [t for t in np.unique(lab[-3, :]) if t > 0 and sizes[t - 1] > H * W * 0.01]
    pool = np.isin(lab, keep)
    horizon = np.full(W, H, dtype=np.int32)
    cols = np.where(pool.any(0))[0]
    horizon[cols] = np.argmax(pool[:, cols], axis=0)
    hsm = np.convolve(np.pad(horizon, 20, mode='edge'), np.ones(41) / 41, mode='valid')
    rows = np.arange(H)[:, None]
    mask = np.clip((rows - (hsm[None, :] - H * 0.004)) / (H * 0.012), 0, 1).astype(np.float32)
    m = Image.fromarray((mask * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(2))
    m.save(path, 'WEBP', quality=88, method=6)


def build():
    glass = load('glass.webp')
    scene = load('scene.webp')[..., :3]
    for sub in ('shakes', 'scenes', 'served'):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    made = {}
    for name, f in FLAVOURS.items():
        gi = glass_image(name, f, glass)
        gi.save(os.path.join(OUT, 'shakes', name + '.webp'), 'WEBP', quality=88, method=6, alpha_quality=92)
        si = scene_image(name, f, scene)
        si.save(os.path.join(OUT, 'scenes', name + '.webp'), 'WEBP', quality=82, method=6)
        flow_mask(si, os.path.join(OUT, 'scenes', name + '-flow.webp'))
        made[name] = (si, gi)
        sv = served_image(name)
        if sv is not None:
            sv.save(os.path.join(OUT, 'served', name + '.webp'), 'WEBP', quality=88, method=6, alpha_quality=92)
            small = sv.resize((round(sv.width * THUMB_HEIGHT / sv.height), THUMB_HEIGHT), Image.LANCZOS)
            small.save(os.path.join(OUT, 'served', name + '-thumb.webp'), 'WEBP', quality=86, method=6, alpha_quality=92)
        print(f'{name:11s} shake {gi.size}  scene {si.size}  served {sv.size if sv is not None else "none"}')

    first = next(iter(FLAVOURS))   # the share image shows the first flavour in the list
    og(made[first][0], made[first][1], FLAVOURS[first])


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
