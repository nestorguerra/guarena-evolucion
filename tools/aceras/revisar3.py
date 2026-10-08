# The final review: every street with its kerbs as the game lays them (src/kerbs.js — exported from the running game
# with tools/solidezlab.js exportKerbs() to .cache/aceras/kerbs_runtime.json), drawn on the orthophoto (PNOA, IGN,
# CC BY 4.0), the whole of each street. Each street unrolled along the game's own line, 60 m a row (left to right, its
# + side at the top), 10 cm a pixel: the game's kerbs dotted in yellow (blue: the side of a street that has its
# pavement on the other, or the edge of a single platform), the houses' fronts as the game has them in magenta, a tick
# every 10 m. Rows packed two columns a sheet.
#   python3 tools/aceras/revisar3.py [--vuelo 2019] [--medidas | --regla] [ids…]   → .snaps/aceras/rv_NNN.jpg, .cache/aceras/indice_rv.json
#   python3 tools/aceras/revisar3.py --cerca ID S [m]        → .snaps/aceras/cerca_ID_S.jpg (north up, the four flights)
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from pnoa import Mosaic, REPO, FLIGHTS
from tira import strip, STEP

SRC = os.path.join(REPO, '.cache/aceras/kerbs_runtime.json')
SNAPS = os.path.join(REPO, '.snaps/aceras')
ROW, COLH = 60.0, 1560
PREFIX = sys.argv[sys.argv.index('--nombre') + 1] if '--nombre' in sys.argv else 'rv'


def length(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


def on_line(pts):
    cum = [0.0]
    for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    def f(s):
        k = 1
        while k < len(cum) - 1 and cum[k] < s: k += 1
        t = (s - cum[k - 1]) / max(1e-9, cum[k] - cum[k - 1]); dx, dz = pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]; dl = math.hypot(dx, dz) or 1
        return pts[k - 1][0] + dx * t, pts[k - 1][1] + dz * t, -dz / dl, dx / dl
    return f


def rows_of(e, Ms):
    """each 60 m of the street, in every flight of Ms, stacked"""
    per = [rows_one(e, M, fl) for fl, M in Ms]
    out = []
    for group in zip(*per):
        W = max(im.width for im in group); H = sum(im.height for im in group) + 2 * (len(group) - 1)
        S = Image.new('RGB', (W, H), (40, 40, 40)); y = 0
        for im in group: S.paste(im, (0, y)); y += im.height + 2
        out.append(S)
    return out


def rows_one(e, M, flight):
    pts, L = e['pts'], length(e['pts'])
    Kmax = max(max(e['p']), max(e['m']))
    half = min(14.0, max(Kmax + 4.0, 8.0 if e.get('blocked') else 0))
    out = []
    for a in range(int(math.ceil(L / ROW))):
        s0, s1 = a * ROW, min(L, a * ROW + ROW)
        if s1 - s0 < 2: continue
        img, meta = strip(M, pts, half=half, s0=s0, s1=s1)
        if img is None: continue
        img = img.transpose(Image.Transpose.ROTATE_90)   # (the street left to right; + side at the top)
        d = ImageDraw.Draw(img)
        X = lambda s: (s - meta['s0']) / STEP
        Yo = lambda o: (half - o) / STEP
        for side, K, F, NO in ((1, e['p'], e['fp'], e.get('np') or e['p']), (-1, e['m'], e['fm'], e.get('nm') or e['m'])):
            design = e['regime'] == 2 or (e['regime'] == 1 and e['side'] != side)
            col = (110, 150, 255) if design else (255, 230, 0)
            for i in range(len(K)):
                s = i * e['st']
                if s < s0 - 0.01 or s > s1 + 0.01: continue
                x, y = X(s), Yo(side * K[i])
                if i % 2 == 0: d.line([(x - 2, y), (x + 2, y)], fill=col, width=2)   # (dotted: the photograph's edge shows between)
                if i % 4 == 1 and abs(NO[i] - K[i]) > 0.05: yn = Yo(side * NO[i]); d.line([(x - 1, yn), (x + 1, yn)], fill=(255, 255, 255), width=1)   # (the photographs' kerb, where the pavement was widened)
                if F[i] is not None and i % 2 == 1: d.point([(x, Yo(side * F[i])), (x + 1, Yo(side * F[i]))], fill=(255, 0, 255))
        for m in range(int(s0 // 10) * 10, int(s1) + 1, 10):
            if m >= s0: d.line([(X(m), img.height - 7), (X(m), img.height)], fill=(255, 255, 255), width=1)
        # (a scale across on the left: a tick a metre from the line, the numbers every 2)
        for m in range(-int(half), int(half) + 1):
            y = Yo(m)
            W0 = img.width
            d.line([(0, y), (5 if m % 5 else 10, y)], fill=(255, 255, 255) if m else (255, 80, 80), width=1)
            d.line([(W0 - (5 if m % 5 else 10), y), (W0, y)], fill=(255, 255, 255) if m else (255, 80, 80), width=1)
            if m % 2 == 0 and m: d.text((12, y - 6), str(m), fill=(255, 255, 255)); d.text((W0 - 24, y - 6), str(m), fill=(255, 255, 255))
        kind = 'CERRADA (la línea bajo las casas)' if e.get('blocked') else ['dos aceras', f"una acera ({'+' if e['side'] > 0 else '-'})", 'plataforma única'][e['regime']]
        lab = f"{e['id']} {(e['name'] or '(sin nombre)')[:30]}  {int(s0)}-{int(s1)} m  w {e['w']} {'medida' if e['measured'] else 'regla'}  {kind}  [{flight}]"
        d.rectangle([0, 0, 6 + 6 * len(lab), 12], fill=(0, 0, 0)); d.text((3, 0), lab, fill=(255, 230, 140))
        out.append(img)
    return out


def sheets(E, flight):
    M = [(fl, Mosaic(fl)) for fl in flight.split(',')]
    os.makedirs(SNAPS, exist_ok=True)
    st = {'cols': [], 'cur': [], 'h': 0, 'n': 0, 'ids': []}
    index = {}
    def flush_sheet():
        if st['cur']: st['cols'].append(st['cur']); st['cur'], st['h'] = [], 0
        if not st['cols']: return
        st['n'] += 1
        n, cols = st['n'], st['cols']
        W = 2 * 610 + 10
        H = max(sum(im.height + 3 for im in c) for c in cols) + 16
        S = Image.new('RGB', (W, H), (12, 12, 12))
        d = ImageDraw.Draw(S); d.text((4, 2), f'rv {n:03d} ({flight}): ' + ', '.join(map(str, st['ids']))[:180], fill=(255, 255, 255))
        for ci, c in enumerate(cols):
            y = 16
            for im in c: S.paste(im, (ci * 620, y)); y += im.height + 3
        S.save(os.path.join(SNAPS, f'{PREFIX}_{n:03d}.jpg'), quality=86)
        index[n] = st['ids']
        st['cols'], st['ids'] = [], []
    for e in E:
        for im in rows_of(e, M):
            if st['h'] + im.height + 3 > COLH:
                st['cols'].append(st['cur']); st['cur'], st['h'] = [], 0
                if len(st['cols']) == 2: flush_sheet()
            st['cur'].append(im); st['h'] += im.height + 3
            if e['id'] not in st['ids']: st['ids'].append(e['id'])
    flush_sheet()
    json.dump(index, open(os.path.join(REPO, f'.cache/aceras/indice_{PREFIX}.json'), 'w'))
    return st['n']


def cerca(eid, s, size=40.0):
    """north up, the four flights, size m round the street's point at s: its kerbs and every street's about it"""
    E = json.load(open(SRC))
    me = next(e for e in E if e['id'] == eid)
    cx, cz, _, _ = on_line(me['pts'])(s)
    tiles = []
    for fl in FLIGHTS:
        img, px = Mosaic(fl).region(cx - size / 2, cz - size / 2, cx + size / 2, cz + size / 2)
        Z = 2; img = img.resize((img.width * Z, img.height * Z))
        d = ImageDraw.Draw(img)
        P = lambda x, z: (px(x, z)[0] * Z, px(x, z)[1] * Z)
        for e in E:
            if min(abs(q[0] - cx) + abs(q[1] - cz) for q in e['pts']) > size * 3: continue
            f = on_line(e['pts'])
            for side, K, F in ((1, e['p'], e['fp']), (-1, e['m'], e['fm'])):
                design = e['regime'] == 2 or (e['regime'] == 1 and e['side'] != side)
                for i in range(0, len(K), 1):
                    x, z, nx, nz = f(i * e['st'])
                    if abs(x - cx) > size or abs(z - cz) > size: continue
                    a = P(x + nx * side * K[i], z + nz * side * K[i])
                    if i % 2 == 0: d.ellipse([a[0] - 2, a[1] - 2, a[0] + 2, a[1] + 2], fill=(110, 150, 255) if design else (255, 230, 0))
                    if F[i] is not None and i % 2 == 1:
                        b = P(x + nx * side * F[i], z + nz * side * F[i]); d.point([b], fill=(255, 0, 255))
        d.text((4, 4), f'{fl}  {eid} @ {s:.0f} m  ({size:.0f} m)', fill=(255, 255, 255))
        tiles.append(img)
    W, H = tiles[0].size
    S = Image.new('RGB', (2 * W + 6, 2 * H + 6))
    for i, t in enumerate(tiles): S.paste(t, ((i % 2) * (W + 6), (i // 2) * (H + 6)))
    fn = os.path.join(SNAPS, f'cerca_{eid}_{int(s)}.jpg')
    S.save(fn, quality=88)
    return fn


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--cerca':
        print(cerca(int(a[1]), float(a[2]), float(a[3]) if len(a) > 3 else 40.0)); sys.exit()
    flight = a[a.index('--vuelo') + 1] if '--vuelo' in a else '2019,ma'
    ids = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or a[i - 1] not in ('--vuelo', '--nombre'))]
    E = json.load(open(SRC))
    if ids: E = [e for e in E if str(e['id']) in ids]
    if '--medidas' in a: E = [e for e in E if e['measured']]
    if '--regla' in a: E = [e for e in E if not e['measured']]
    E.sort(key=lambda e: ((e['name'] or '~').lower(), e['id']))
    print(sheets(E, flight), 'sheets', len(E), 'streets')
