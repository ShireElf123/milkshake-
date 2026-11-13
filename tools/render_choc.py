"""Tiny numpy SDF ray-marcher that renders chocolate-bar chunks with alpha.

No image model involved: the chocolate pieces are procedural 3D renders
(bevelled squares on a slab, soft-box lighting, ambient occlusion).
usage: python3 render_choc.py <out.png> <cols> <rows> <rx> <ry> <rz> [size]
"""
import sys
import numpy as np
from PIL import Image

CELL = 1.0        # pitch of one chocolate square
SLAB = 0.15       # half thickness of the base slab
PIP_H = 0.17      # height of the raised square above the slab
PIP_IN = 0.085    # gap between a raised square and the cell edge (half groove)
PIP_BEV = 0.15    # how far the top face is inset from the base of the square


def rot(rx, ry, rz):
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def smax(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.maximum(a, b) + h * h * k * 0.25


def smin(a, b, k):
    return -smax(-a, -b, k)


def hash3(i, j, k):
    n = np.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
    return n - np.floor(n)


def vnoise(p):
    i = np.floor(p); f = p - i; u = f * f * (3 - 2 * f)
    x, y, z = i[..., 0], i[..., 1], i[..., 2]
    def c(dx, dy, dz): return hash3(x + dx, y + dy, z + dz)
    ux, uy, uz = u[..., 0], u[..., 1], u[..., 2]
    x00 = c(0, 0, 0) * (1 - ux) + c(1, 0, 0) * ux
    x10 = c(0, 1, 0) * (1 - ux) + c(1, 1, 0) * ux
    x01 = c(0, 0, 1) * (1 - ux) + c(1, 0, 1) * ux
    x11 = c(0, 1, 1) * (1 - ux) + c(1, 1, 1) * ux
    return (x00 * (1 - uy) + x10 * uy) * (1 - uz) + (x01 * (1 - uy) + x11 * uy) * uz


def fbm(p):
    return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.25 + vnoise(p * 4.1) * 0.125 + vnoise(p * 8.3) * 0.0625


def make_scene(cols, rows):
    hx, hz = cols * CELL / 2, rows * CELL / 2
    n_side = np.array([PIP_H, PIP_BEV]); n_side = n_side / np.linalg.norm(n_side)
    wb = CELL / 2 - PIP_IN

    def sdf(p):
        x, y, z = p[..., 0], p[..., 1], p[..., 2]
        # base slab (rounded box) with rough, snapped ends
        rough = (fbm(p * 5.0) - 0.47) * 0.16
        end_x = np.clip((np.abs(x) - (hx - 0.16)) / 0.16, 0, 1)
        end_z = np.clip((np.abs(z) - (hz - 0.16)) / 0.16, 0, 1)
        q = np.stack([np.abs(x) - (hx - 0.035 - 0.03) + rough * end_x,
                      np.abs(y) - (SLAB - 0.03),
                      np.abs(z) - (hz - 0.035 - 0.03) + rough * end_z * 0.6], axis=-1)
        slab = np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(axis=-1), 0) - 0.03
        # raised bevelled squares: fold space into one cell
        fx = np.abs(((x + hx) % CELL) - CELL / 2)
        fz = np.abs(((z + hz) % CELL) - CELL / 2)
        yy = y - SLAB
        dxp = (fx - wb) * n_side[0] + yy * n_side[1]
        dzp = (fz - wb) * n_side[0] + yy * n_side[1]
        pip = smax(smax(dxp, dzp, 0.07), yy - PIP_H, 0.05)
        pip = np.maximum(pip, np.maximum(np.abs(x) - hx, np.abs(z) - hz))   # stay inside the bar
        pip = np.maximum(pip, -y)                                             # no underside
        return smin(slab, pip, 0.035)

    return sdf


def normal(sdf, p, e=0.0015):
    dx = np.array([e, 0, 0]); dy = np.array([0, e, 0]); dz = np.array([0, 0, e])
    n = np.stack([sdf(p + dx) - sdf(p - dx), sdf(p + dy) - sdf(p - dy), sdf(p + dz) - sdf(p - dz)], axis=-1)
    return n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)


def render(cols, rows, rx, ry, rz, size=640, ss=2, albedo=(0.150, 0.052, 0.022)):
    sdf = make_scene(cols, rows)
    R = rot(rx, ry, rz); Rinv = R.T
    N = size * ss
    extent = max(cols, rows) * CELL * 0.5 + 0.55
    cam_dist = 7.0
    fov = 2 * np.arctan(extent * 1.18 / cam_dist)
    ys, xs = np.mgrid[0:N, 0:N]
    u = ((xs + 0.5) / N * 2 - 1) * np.tan(fov / 2)
    v = (1 - (ys + 0.5) / N * 2) * np.tan(fov / 2)
    rd = np.stack([u, v, -np.ones_like(u)], axis=-1); rd /= np.linalg.norm(rd, axis=-1, keepdims=True)
    ro = np.array([0, 0, cam_dist])
    # work in object space
    rd_o = (rd.reshape(-1, 3) @ Rinv.T)
    ro_o = Rinv @ ro
    t = np.full(rd_o.shape[0], cam_dist - extent * 1.8)
    alive = np.ones(rd_o.shape[0], dtype=bool); hit = np.zeros_like(alive)
    for _ in range(110):
        idx = np.where(alive)[0]
        if idx.size == 0: break
        d = sdf(ro_o + rd_o[idx] * t[idx, None])
        t[idx] += d * 0.9
        done = d < 0.0012
        hit[idx[done]] = True
        alive[idx[done | (t[idx] > cam_dist + extent * 1.8)]] = False
    hi = np.where(hit)[0]
    p = ro_o + rd_o[hi] * t[hi, None]
    n = normal(sdf, p)
    vdir = -rd_o[hi]
    # --- lighting (directions given in camera space, converted to object space)
    def L(v3): v3 = np.array(v3, float); v3 /= np.linalg.norm(v3); return Rinv @ v3
    key, fill, rim, top = L([-0.55, 0.75, 0.6]), L([0.8, 0.15, 0.55]), L([0.35, 0.45, -0.85]), L([0, 1, 0.15])
    def shadow(lightdir, k=9.0):
        res = np.ones(p.shape[0]); tt = np.full(p.shape[0], 0.03)
        for _ in range(26):
            d = sdf(p + n * 0.004 + lightdir * tt[:, None])
            res = np.minimum(res, np.clip(k * d / tt, 0, 1)); tt += np.clip(d, 0.02, 0.2)
        return res
    ao = np.ones(p.shape[0])
    for i, dist in enumerate([0.03, 0.07, 0.13, 0.22]):
        ao -= (dist - sdf(p + n * dist)).clip(0) * (1.9 / (i + 1.4))
    ao = ao.clip(0.15, 1)
    sh = shadow(key) * 0.8 + 0.2
    alb = np.array(albedo) * (0.9 + 0.2 * fbm(p * 3.0)[:, None])          # gentle tonal variation
    micro = (fbm(p * 55.0) - 0.47)[:, None]                                 # fine surface grain
    def diff(l): return np.clip(n @ l, 0, 1)[:, None]
    def spec(l, power):
        h = l + vdir; h /= np.linalg.norm(h, axis=-1, keepdims=True)
        return np.clip((n * h).sum(-1), 0, 1)[:, None] ** power
    fres = (1 - np.clip((n * vdir).sum(-1), 0, 1))[:, None] ** 4
    col = alb * (diff(key) * sh[:, None] * 1.35 * np.array([1.0, 0.96, 0.9])
                 + diff(fill) * 0.30 * np.array([0.92, 0.9, 1.0])
                 + diff(top) * 0.18
                 + 0.15)
    col *= (0.45 + 0.55 * ao[:, None])
    gloss = (spec(key, 90) * 0.55 * sh[:, None] + spec(key, 10) * 0.06 + spec(fill, 50) * 0.05
             + spec(rim, 16) * 0.16 + fres * 0.09) * (1 + micro * 0.55)
    col = col + gloss * np.array([1.0, 0.88, 0.76])
    col = col / (1 + col * 0.35)                                             # soft highlight shoulder
    col = np.clip(col, 0, 1) ** (1 / 2.2)
    img = np.zeros((N * N, 4)); img[hi, :3] = col; img[hi, 3] = 1
    img = img.reshape(N, N, 4)
    img[..., :3] *= img[..., 3:4]                                           # premultiply for a clean downsample
    small = img.reshape(size, ss, size, ss, 4).mean(axis=(1, 3))
    a = small[..., 3:4]
    small[..., :3] = np.where(a > 1e-6, small[..., :3] / np.maximum(a, 1e-6), 0)
    return Image.fromarray((np.clip(small, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    out, cols, rows = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    rx, ry, rz = (np.radians(float(v)) for v in sys.argv[4:7])
    size = int(sys.argv[7]) if len(sys.argv) > 7 else 640
    im = render(cols, rows, rx, ry, rz, size=size)
    im = im.crop(im.getbbox())
    im.save(out); print(out, im.size)
