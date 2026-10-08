# The game's kerbs drawn on the orthophoto: before (red, the town's rule) and now (yellow, measured), the Catastro's
# houses in white — the check that the carriageway and the pavements sit where they are on the ground.
#   python3 tools/aceras/encima.py x z [size] [flight] [name]  → .snaps/aceras/encima_<name>.jpg
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from pnoa import Mosaic, REPO, RES

def offset(p, d):
    out = []
    n = len(p)
    for i in range(n):
        a, b = p[max(0, i - 1)], p[min(n - 1, i + 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1
        out.append((p[i][0] - dz / L * d, p[i][1] + dx / L * d))
    return out

def kerbs(mapjson, box):
    x0, z0, x1, z1 = box
    out = []
    for e in mapjson['edges']:
        cls = mapjson['classes'][e['c']]
        if cls in ('footway', 'path', 'steps', 'cycleway', 'track') or e['d']: continue
        p = [(e['p'][i] / 10, e['p'][i + 1] / 10) for i in range(0, len(e['p']), 2)]
        if max(x for x, _ in p) < x0 or min(x for x, _ in p) > x1 or max(z for _, z in p) < z0 or min(z for _, z in p) > z1: continue
        hw = e['w'] / 20
        out.append((offset(p, hw), offset(p, -hw), p))
    return out

def draw(x, z, size=50, flight='2019', name=None, scale=2):
    box = (x - size / 2, z - size / 2, x + size / 2, z + size / 2)
    img, px = Mosaic(flight).region(*box)
    img = img.resize((img.width * scale, img.height * scale))
    d = ImageDraw.Draw(img)
    P = lambda q: (px(*q)[0] * scale, px(*q)[1] * scale)
    now = json.load(open(os.path.join(REPO, 'data/map.json')))
    before = json.load(open(os.path.join(REPO, '.cache/aceras/map_antes.json')))
    for prt in now['parts']:
        r = [(prt['p'][i] / 10, prt['p'][i + 1] / 10) for i in range(0, len(prt['p']), 2)]
        if max(a for a, _ in r) < box[0] or min(a for a, _ in r) > box[2] or max(b for _, b in r) < box[1] or min(b for _, b in r) > box[3]: continue
        d.line([P(q) for q in r + r[:1]], fill=(255, 255, 255), width=1)
    for col, M, wd in (((255, 60, 60), before, 2), ((255, 230, 0), now, 3)):
        for L, R, c in kerbs(M, box):
            d.line([P(q) for q in L], fill=col, width=wd)
            d.line([P(q) for q in R], fill=col, width=wd)
    name = name or f'{int(x)}_{int(z)}'
    os.makedirs(os.path.join(REPO, '.snaps/aceras'), exist_ok=True)
    fn = os.path.join(REPO, '.snaps/aceras', f'encima_{name}.jpg')
    img.save(fn, quality=88)
    return fn

if __name__ == '__main__':
    a = sys.argv[1:]
    print(draw(float(a[0]), float(a[1]), float(a[2]) if len(a) > 2 else 50, a[3] if len(a) > 3 else '2019', a[4] if len(a) > 4 else None))
