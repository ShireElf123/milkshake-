#!/usr/bin/env python3
"""Turn a picture into a transparent WEBP for the site.

    pip install pillow numpy scipy

    # a photo of fruit on a flat blue (or green) backdrop -> trimmed cut-out
    python3 tools/cutout.py mango.png assets/img/fruit/mango.webp --key b

    # a glass on a flat backdrop -> master for build_assets.py (keeps the glass see-through)
    python3 tools/cutout.py glass.png tools/masters/glass-mango.webp --key g --glassy \
        --crop 119,73,729,1189 --size 0 --lossless

    # the same glass served with cream and a straw -> second product photo (same crop, so both line up)
    python3 tools/cutout.py served.png tools/masters/served-mango.webp --key g --glassy \
        --crop 119,73,729,1189 --size 0 --lossless

    # a picture that is already transparent: just trim, resize and adjust the tone
    python3 tools/cutout.py piece.png assets/img/fruit/piece.webp --gamma 1.2 --contrast 1.1

The backdrop should be an even, saturated blue or green that does not appear in
the subject (use blue for green fruit and the other way round).
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keylib import bbox, key_image, to_image  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--key', choices=['g', 'b'], help='backdrop colour to remove; leave out if the picture is already transparent')
    ap.add_argument('--glassy', action='store_true', help='see-through subject (glass, liquid): keep soft transparency inside it')
    ap.add_argument('--spill', type=float, default=1.0, help='raise to ~1.15 to keep blue/purple tones in the subject (grapes)')
    ap.add_argument('--spill-tint', type=float, help='stricter limit for coloured areas, e.g. 0.75, to remove a backdrop tint that shows through liquid or glass')
    ap.add_argument('--crop', help='x0,y0,x1,y1: cut this box out of the source instead of trimming to the subject')
    ap.add_argument('--erase', action='append', default=[], metavar='X0,Y0,X1,Y1', help='clear this box of the source (a stray shadow on the backdrop, say); can be given more than once')
    ap.add_argument('--lossless', action='store_true', help='save without compression loss (for masters)')
    ap.add_argument('--size', type=int, default=560, help='longest side of the result in pixels; 0 keeps the size')
    ap.add_argument('--gamma', type=float, default=1.0, help='above 1 darkens the mid tones')
    ap.add_argument('--contrast', type=float, default=1.0)
    ap.add_argument('--quality', type=int, default=88)
    args = ap.parse_args()

    if args.key:
        rgba = key_image(args.src, key=args.key, solid=not args.glassy, core_px=5, spill=args.spill, spill_tint=args.spill_tint)
        img = to_image(rgba)
        box = bbox(rgba)
    else:
        img = Image.open(args.src).convert('RGBA')
        box = img.getbbox()
    if args.erase:
        px = np.array(img)
        for spec in args.erase:
            x0, y0, x1, y1 = (int(v) for v in spec.split(','))
            px[y0:y1, x0:x1, 3] = 0
        img = Image.fromarray(px, 'RGBA')
        if not args.crop:
            box = img.getbbox()
    img = img.crop(tuple(int(v) for v in args.crop.split(',')) if args.crop else box)

    if args.gamma != 1.0 or args.contrast != 1.0:
        a = np.asarray(img).astype(np.float64) / 255.0
        rgb = a[..., :3] ** args.gamma
        rgb = (rgb - 0.5) * args.contrast + 0.5
        a[..., :3] = np.clip(rgb, 0, 1)
        img = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA')

    scale = args.size / max(img.size) if args.size else 1
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    img.save(args.dst, quality=args.quality, method=6, lossless=args.lossless)
    print(args.dst, img.size)


if __name__ == '__main__':
    main()
