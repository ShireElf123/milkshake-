"""Chroma-key matting helpers (numpy + PIL).

key_image(): turns an RGB image shot on a flat chroma backdrop into RGBA with a
soft matte and un-mixed (despilled) foreground colours.
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi


def load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float64) / 255.0


def _dominance(img, ch):
    """How much channel `ch` exceeds the larger of the two other channels."""
    others = [c for c in range(3) if c != ch]
    return img[..., ch] - np.maximum(img[..., others[0]], img[..., others[1]])


def _fit_backdrop(img, mask, order=2):
    """Least-squares 2D polynomial fit of the backdrop colour (handles vignettes)."""
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x = (xx / (w - 1)) * 2 - 1
    y = (yy / (h - 1)) * 2 - 1
    terms = [np.ones_like(x)]
    for i in range(1, order + 1):
        for j in range(i + 1):
            terms.append((x ** (i - j)) * (y ** j))
    A = np.stack([t[mask] for t in terms], axis=1)
    out = np.zeros_like(img)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, img[..., c][mask], rcond=None)
        out[..., c] = sum(k * t for k, t in zip(coef, terms))
    return np.clip(out, 0, 1)


def key_image(path, key="g", lo=0.10, hi=0.92, solid=False, core_px=6, despeckle=14, halo_px=12, spill=1.0, spill_tint=None, verbose=True):
    """Return float RGBA array (h, w, 4) in 0..1.

    key        'g' or 'b' - which chroma channel the backdrop uses
    lo / hi    matte black/white points (tolerance for backdrop noise / spill)
    solid      True for opaque subjects (fruit): the interior is forced opaque
    core_px    how far inside the silhouette the forced-opaque core starts
    despeckle  remove isolated matte islands smaller than this many pixels
    halo_px    faint (<15%) matte values further than this from the subject are dropped
    spill      despill limit: key channel <= spill * max(other two channels)
    spill_tint a stricter limit for clearly coloured pixels only: neutral ones (white
               reflections, grey glass) keep `spill`; None = same as spill
    """
    img = load_rgb(path)
    ch = {"r": 0, "g": 1, "b": 2}[key]
    dom = _dominance(img, ch)

    # 1) rough backdrop mask from the image border statistics
    border = np.concatenate([dom[:12].ravel(), dom[-12:].ravel(), dom[:, :12].ravel(), dom[:, -12:].ravel()])
    d_ref = np.median(border)
    rough_bg = dom > d_ref * 0.8
    rough_bg = ndi.binary_erosion(rough_bg, iterations=4)

    # 2) smooth per-pixel backdrop model K(x, y)
    K = _fit_backdrop(img, rough_bg)
    dK = np.maximum(_dominance(K, ch), 1e-3)
    if verbose:
        print(f"  backdrop median dominance {d_ref:.3f}; K centre {np.round(K[K.shape[0]//2, K.shape[1]//2]*255)}"
              f" corner {np.round(K[0,0]*255)}")

    # 3) difference matte
    a = 1.0 - np.clip(dom / dK, 0, 1)
    a = np.clip((a - lo) / (hi - lo), 0, 1)

    # 4) drop tiny floating specks of matte noise
    if despeckle:
        lab, n = ndi.label(a > 0.15)
        if n:
            sizes = ndi.sum(np.ones_like(a), lab, index=np.arange(1, n + 1))
            small = np.isin(lab, np.where(sizes < despeckle)[0] + 1)
            a[small] = 0
    # faint matte values only survive close to something clearly visible
    support = ndi.binary_dilation(a > 0.15, iterations=halo_px)
    a = np.where(support, a, 0.0)

    # 5) opaque subjects: everything well inside the silhouette is solid
    if solid:
        fg = a > 0.5
        # close pin-holes caused by backdrop reflections, but leave real see-through
        # gaps (e.g. between a stem and a leaf) open: those have a matte near zero
        holes = ndi.binary_fill_holes(fg) & ~fg
        lab, n = ndi.label(holes)
        if n:
            mean_a = ndi.mean(a, lab, index=np.arange(1, n + 1))
            fg = fg | np.isin(lab, np.where(mean_a > 0.25)[0] + 1)
        core = ndi.binary_erosion(fg, iterations=core_px)
        a = np.where(core, 1.0, a)
        # also kill stray semi-transparent haze far from the subject
        near = ndi.binary_dilation(fg, iterations=3)
        a = np.where(near, a, 0.0)

    # 6) un-mix the foreground colour: C = a*F + (1-a)*K  ->  F = (C - (1-a)K) / a
    aa = np.maximum(a, 1e-3)[..., None]
    F = (img - (1 - aa) * K) / aa
    F = np.clip(F, 0, 1)
    # residual despill: the key channel may never exceed the other two
    others = [c for c in range(3) if c != ch]
    lim = np.maximum(F[..., others[0]], F[..., others[1]])
    limit = spill
    if spill_tint is not None:
        top = F.max(axis=-1)
        saturation = (top - F.min(axis=-1)) / np.maximum(top, 1e-6)
        limit = spill + (spill_tint - spill) * np.clip(saturation * 3, 0, 1)
    F[..., ch] = np.minimum(F[..., ch], lim * limit)

    return np.dstack([F, a])


def to_image(rgba):
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def bbox(rgba, thresh=0.02, pad=6):
    a = rgba[..., 3] > thresh
    ys, xs = np.where(a)
    h, w = a.shape
    return max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, w), min(ys.max() + pad + 1, h)


def over(rgba_img, bg_rgb):
    """Composite a PIL RGBA image over a flat colour (for previews)."""
    bg = Image.new("RGBA", rgba_img.size, tuple(bg_rgb) + (255,))
    bg.alpha_composite(rgba_img)
    return bg.convert("RGB")


def checker(w, h, s=24, c1=(60, 60, 60), c2=(110, 110, 110)):
    yy, xx = np.mgrid[0:h, 0:w]
    m = ((xx // s) + (yy // s)) % 2
    arr = np.where(m[..., None] == 0, np.array(c1, dtype=np.uint8), np.array(c2, dtype=np.uint8)).astype(np.uint8)
    return Image.fromarray(arr, "RGB")
