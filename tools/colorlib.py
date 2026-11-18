"""OKLab / OKLCH helpers and a flavour re-colouring transform (numpy)."""
import numpy as np


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def rgb_to_oklab(rgb):
    lin = srgb_to_linear(rgb)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return np.stack([L, A, B], axis=-1)


def oklab_to_rgb(lab):
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return linear_to_srgb(np.stack([r, g, b], axis=-1))


def to_lch(rgb):
    lab = rgb_to_oklab(rgb)
    C = np.hypot(lab[..., 1], lab[..., 2])
    h = np.arctan2(lab[..., 2], lab[..., 1])
    return lab[..., 0], C, h


def from_lch(L, C, h):
    return oklab_to_rgb(np.stack([L, C * np.cos(h), C * np.sin(h)], axis=-1))


def hex_rgb(hx):
    hx = hx.lstrip('#')
    return np.array([int(hx[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0


def recolor(rgb, src_hex, dst_hex, chroma_boost=1.0, hue_keep=0.35, contrast=1.0):
    """Shift an image from one colour family to another.

    Every pixel keeps its relative shading: the hue is rotated so `src` lands on
    `dst`, chroma is scaled by the dst/src ratio, and lightness goes through a
    gamma curve that maps src lightness onto dst lightness while leaving black
    and white (glass highlights) untouched.

    hue_keep   how much of the original hue *variation* around src survives
    contrast   >1 steepens the lightness curve around the dst lightness
    """
    Ls, Cs, hs = to_lch(hex_rgb(src_hex))
    Lt, Ct, ht = to_lch(hex_rgb(dst_hex))
    L, C, h = to_lch(rgb)
    dh = np.angle(np.exp(1j * (h - hs)))          # wrapped hue offset from src
    h2 = ht + dh * hue_keep
    C2 = C * (Ct / max(Cs, 1e-6)) * chroma_boost
    g = np.log(Lt) / np.log(Ls)
    L2 = np.power(np.clip(L, 1e-6, 1), g)
    if contrast != 1.0:
        L2 = np.clip(Lt + (L2 - Lt) * contrast, 0, 1)
    # keep saturated colours inside the sRGB gamut by easing chroma near the extremes
    C2 = C2 * np.clip(np.minimum(L2, 1 - L2) * 6, 0, 1) ** 0.35
    return np.clip(from_lch(L2, C2, h2), 0, 1)
