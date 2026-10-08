# How far across each older flight lies from the latest one (2025), street by street: the four photographs of a
# street unrolled along the same line, their columns' median brightness (the carriageway, the pavements, the houses
# make a profile across the street), and the shift (±3 m, 5 cm steps) that best lays each flight's profile — and its
# steps (the kerbs, the house fronts) — on the 2025 one. The Catastro is drawn on the IGN's orthophotos: the latest
# flight is taken as the reference. → .cache/aceras/alineacion.json {key: {flight: dx m (+ toward the + side)}}
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnoa import Mosaic, REPO, FLIGHTS
from tira import strip, STEP

HALF = 13.0


def profile(img):
    px = img.load(); W, H = img.size
    out = []
    for x in range(W):
        v = sorted(0.299 * px[x, y][0] + 0.587 * px[x, y][1] + 0.114 * px[x, y][2] for y in range(0, H, 2))
        out.append(v[len(v) // 2])
    # its steps (a 3-column difference), normalised: the edges matter, not each flight's exposure
    d = [out[min(W - 1, i + 2)] - out[max(0, i - 2)] for i in range(W)]
    m = sum(d) / len(d); s = math.sqrt(sum((x - m) ** 2 for x in d) / len(d)) or 1
    return [(x - m) / s for x in d]


def best_shift(ref, other, rng=30, lo=None, hi=None):
    # (only the street's own ground, between the houses: the roofs lean a different way in every flight)
    W = len(ref)
    lo = max(rng, lo if lo is not None else 0); hi = min(W - rng, hi if hi is not None else W)
    best = None
    for k in range(-rng, rng + 1):
        acc = n = 0
        for i in range(lo, hi):
            acc += ref[i] * other[i + k]; n += 1
        c = acc / max(1, n)
        if best is None or c > best[1]:
            best = (k, c)
    return best


if __name__ == '__main__':
    E = json.load(open(os.path.join(REPO, '.cache/aceras/edges.json')))
    mos = {fl: Mosaic(fl) for fl in FLIGHTS}
    out = {}
    stats = {fl: [] for fl in FLIGHTS[1:]}
    todo = [e for e in E if e['prof'] and e.get('facade')]
    for n, e in enumerate(todo):
        pts = e['pts']
        L = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
        if L < 8: continue
        s0, s1 = min(4.0, L * 0.2), max(L - 4.0, L * 0.8)
        prof = {}
        for fl in FLIGHTS:
            img, meta = strip(mos[fl], pts, half=HALF, s0=s0, s1=s1)
            if img is None: break
            prof[fl] = profile(img)
        if len(prof) < len(FLIGHTS): continue
        r = {}
        fl_ = sorted(q[1] for q in e['prof'] if q[1] is not None and q[1] < 21); fr_ = sorted(q[2] for q in e['prof'] if q[2] is not None and q[2] < 21)
        Fp = fl_[len(fl_) // 10] if fl_ else HALF; Fm = fr_[len(fr_) // 10] if fr_ else HALF
        lo, hi = int(round((HALF - Fm + 0.3) / STEP)), int(round((HALF + Fp - 0.3) / STEP))
        if hi - lo < 30: continue
        for fl in FLIGHTS[1:]:
            k, c = best_shift(prof['ma'], prof[fl], 25, lo, hi)
            # (the other flight's features at column i + k match the latest's at i: it lies k columns to the + side)
            r[fl] = [round(k * STEP, 2), round(c, 3)]
            if c > 0.25: stats[fl].append(k * STEP)
        out[e['key']] = r
        if n % 25 == 24: print(n + 1, 'streets', flush=True)
    json.dump(out, open(os.path.join(REPO, '.cache/aceras/alineacion.json'), 'w'))
    for fl, v in stats.items():
        v.sort()
        if v: print(fl, 'n', len(v), 'median', round(v[len(v) // 2], 2), 'p10', round(v[len(v) // 10], 2), 'p90', round(v[9 * len(v) // 10], 2), '|>0.5|', sum(1 for x in v if abs(x) > 0.5))
