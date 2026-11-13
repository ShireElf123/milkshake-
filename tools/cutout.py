#!/usr/bin/env python3
"""Turn a picture into a trimmed, transparent WEBP for the site.

    pip install pillow numpy scipy

    # a photo of fruit on a flat blue (or green) backdrop -> cut-out
    python3 tools/cutout.py mango.png assets/img/fruit/mango.webp --key b

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
    ap.add_argument('--size', type=int, default=560, help='longest side of the result in pixels')
    ap.add_argument('--gamma', type=float, default=1.0, help='above 1 darkens the mid tones')
    ap.add_argument('--contrast', type=float, default=1.0)
    ap.add_argument('--quality', type=int, default=88)
    args = ap.parse_args()

    if args.key:
        rgba = key_image(args.src, key=args.key, solid=not args.glassy, core_px=5, spill=args.spill)
        img = to_image(rgba).crop(bbox(rgba))
    else:
        img = Image.open(args.src).convert('RGBA')
        img = img.crop(img.getbbox())

    if args.gamma != 1.0 or args.contrast != 1.0:
        a = np.asarray(img).astype(np.float64) / 255.0
        rgb = a[..., :3] ** args.gamma
        rgb = (rgb - 0.5) * args.contrast + 0.5
        a[..., :3] = np.clip(rgb, 0, 1)
        img = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA')

    scale = args.size / max(img.size)
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    img.save(args.dst, quality=args.quality, method=6)
    print(args.dst, img.size)


if __name__ == '__main__':
    main()
