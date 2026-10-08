# A street «unrolled»: the orthophoto along a street's centreline, straightened — down the picture the way the street
# runs (10 cm a row), across it the offset from the centreline (10 cm a column, + side on the right, as build_map's
# rays). Pillow's MESH transform does it in pieces of street, so a bending street comes out straight.
#   from tira import strip;  img, meta = strip(M, pts, half=12)
import math
from PIL import Image
from pnoa import RES

STEP = 0.10   # metres a pixel in the strip, along and across


def resample(pts, step):
    """the polyline as points every `step` m: [(s, x, z, nx, nz)] with its (+ side) normal (-dz, dx), smoothed"""
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    L = cum[-1]
    out, k, s = [], 1, 0.0
    while s <= L + 1e-9:
        while k < len(cum) - 1 and cum[k] < s: k += 1
        t = (s - cum[k - 1]) / max(1e-9, cum[k] - cum[k - 1])
        x = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t
        z = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t
        out.append([s, x, z])
        s += step
    # normals from a centred difference over ±1.5 m (a smooth bend, no folds)
    n = len(out)
    w = max(1, int(round(1.5 / step)))
    for i in range(n):
        a, b = out[max(0, i - w)], out[min(n - 1, i + w)]
        dx, dz = b[1] - a[1], b[2] - a[2]
        dl = math.hypot(dx, dz) or 1.0
        out[i] += [-dz / dl, dx / dl]
    return out, L


def strip(M, pts, half=12.0, s0=0.0, s1=None):
    """the straightened photograph of the street from s0 to s1, ±half metres across → (image, meta)"""
    samp, L = resample(pts, STEP)
    s1 = L if s1 is None else min(L, s1)
    samp = [q for q in samp if s0 - 1e-9 <= q[0] <= s1 + 1e-9]
    if len(samp) < 3:
        return None, None
    # the photograph round it
    xs = [q[1] + q[3] * o for q in samp for o in (-half, half)]
    zs = [q[2] + q[4] * o for q in samp for o in (-half, half)]
    x0, z0, x1, z1 = min(xs) - 2, min(zs) - 2, max(xs) + 2, max(zs) + 2
    src, px = M.region(x0, z0, x1, z1)
    W = int(round(2 * half / STEP)) + 1
    mesh = []
    CH = 10  # rows a piece
    for i in range(0, len(samp) - 1, CH):
        a, b = samp[i], samp[min(len(samp) - 1, i + CH)]
        ya, yb = i, min(len(samp) - 1, i + CH)
        # source corners: upper left (− side, a), lower left (− side, b), lower right (+ side, b), upper right (+ side, a)
        ul = px(a[1] - a[3] * half, a[2] - a[4] * half)
        ll = px(b[1] - b[3] * half, b[2] - b[4] * half)
        lr = px(b[1] + b[3] * half, b[2] + b[4] * half)
        ur = px(a[1] + a[3] * half, a[2] + a[4] * half)
        mesh.append(((0, ya, W, yb), (ul[0], ul[1], ll[0], ll[1], lr[0], lr[1], ur[0], ur[1])))
    H = len(samp)
    img = src.transform((W, H), Image.MESH, mesh, resample=Image.BILINEAR)
    meta = dict(half=half, step=STEP, s0=samp[0][0], rows=H, cols=W, samp=samp)
    return img, meta
