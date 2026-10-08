# The pavements of Guareña measured on the orthophotos (PNOA, IGN, CC BY 4.0): for every street of the town, where its
# kerbs are — how much of it is carriageway and how much pavement, either side, between the houses.
#
# Each street is «unrolled» (tira.py) in each of the four flights (2025, 2022, 2019, 2016). On each side, the flight
# where that pavement is best seen is chosen: sunlit, and not hidden by the roofs (a photograph is not a true ortho:
# the eaves lean over the street, towards a different side in every flight). There the kerb is the line, parallel to
# the street, where the grey of the carriageway gives way to the lighter pavement, the same in most of the street's
# length (a parked car or a shadow covers it only here and there): the step in brightness outwards, summed down the
# street, has its peak there. Where no flight shows it, the street's other side (most streets have the same pavement
# both sides) or the town's rule fills in, and the sheets say so.
#   python3 tools/aceras/medir.py              → .cache/aceras/medidas.json + .snaps/aceras/hoja_NN.jpg
#   python3 tools/aceras/medir.py --solo KEY…  (some streets only)
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter
from pnoa import Mosaic, REPO, FLIGHTS
from tira import strip, STEP

EDGES = os.path.join(REPO, '.cache/aceras/edges.json')
OUT = os.path.join(REPO, '.cache/aceras/medidas.json')
SNAPS = os.path.join(REPO, '.snaps/aceras')
HALF = 13.0
MIN_ROAD = 1.4     # the kerb no nearer the centreline than this (half the narrowest carriageway)
CARS = '--sin-coches' not in sys.argv   # (the parking-lane rule; off: the measurements the first review saw)
if not CARS:
    OUT = OUT.replace('medidas.json', 'medidas_sin_coches.json')


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def facade_at(prof, idx):
    """the facade's distance on each side, row by row (interpolated between build_map's samples every 3 m)"""
    def interp(s):
        best = None
        for k in range(len(prof) - 1):
            s0, s1 = prof[k][0], prof[k + 1][0]
            if s0 <= s <= s1:
                a, b = prof[k][idx], prof[k + 1][idx]
                if a is None or b is None:
                    return a if b is None else b
                t = (s - s0) / max(1e-6, s1 - s0)
                return a + (b - a) * t
        if prof and s < prof[0][0]: return prof[0][idx]
        if prof and s > prof[-1][0]: return prof[-1][idx]
        return None
    return interp


def side_profile(px, W, H, s0, sign, fac, half):
    """one side of one flight: per offset o (0..half), what the rows say — [(o, med Y, q1 Y, warm, step)], rows used"""
    cols = int(round(half / STEP))
    stats = []
    rows = []
    for y in range(0, H, 2):
        F = fac(s0 + y * STEP)
        if F is None or F > half - 0.3 or F < MIN_ROAD + 0.3:
            continue
        rows.append((y, F))
    if len(rows) < 15:
        return None, rows
    for c in range(cols):
        o = c * STEP
        Ys, Q, warm, steps = [], [], 0, []
        for y, F in rows:
            if o > F - 0.1:   # (past the facade)
                continue
            xi = int(round((half + sign * o) / STEP))
            xo = int(round((half + sign * (o + 0.2)) / STEP))
            xn = int(round((half + sign * (o - 0.2)) / STEP))
            if not (0 <= xo < W and 0 <= xn < W):
                continue
            p = px[xi, y]
            Y = lum(p)
            Ys.append(Y)
            if p[0] - p[2] > 34: warm += 1
            # the step outwards: brighter beyond (in log terms, so a shadowed pavement counts as much as a sunlit one)
            yo, yn = lum(px[xo, y]), lum(px[xn, y])
            steps.append(math.log((yo + 8) / (yn + 8)))
        if len(Ys) < 10:
            stats.append(None)
            continue
        Ys.sort(); steps.sort()
        n = len(Ys)
        stats.append(dict(o=o, med=Ys[n // 2], q1=Ys[n // 4], q3=Ys[3 * n // 4], warm=warm / n,
                          step=sum(max(0.0, v) for v in steps) / n, med_step=steps[n // 2], n=n))
    return stats, rows


def kerb_on(stats, Fmed):
    """the kerb on one side from its profile: (offset, strength, sunlit, hidden)"""
    if not stats:
        return None
    lo, hi = MIN_ROAD, Fmed - 0.3
    best = None
    for st in stats:
        if st is None or st['o'] < lo or st['o'] > hi:
            continue
        sc = st['med_step'] * 0.6 + st['step'] * 0.4
        # (a town pavement is rarely wider than 3 m: a step further from the house is more likely a shadow's edge)
        wide = Fmed - st['o'] - 3.0
        if wide > 0: sc *= max(0.35, 1 - wide * 0.25)
        if best is None or sc > best[1]:
            best = (st['o'] + 0.1, sc)   # (the step is centred between o-0.2 and o+0.2: the kerb's face 0.1 out)
    # parked cars: the step from the road to a car's side is as sharp as a kerb's, and a row of cars makes it run down
    # the street like one. A parking lane is the band where every row differs (cars of every colour, gaps of asphalt):
    # if such a band lies just outside the step, the kerb is at its outer end
    iqr = {round(st['o'], 1): st['q3'] - st['q1'] for st in stats if st is not None}
    col = {round(st['o'], 1): st for st in stats if st is not None}
    def band(a, b, f=lambda o: iqr.get(round(o, 1))):
        v = [f(o) for o in [a + i * STEP for i in range(int(round((b - a) / STEP)) + 1)]]
        v = [x for x in v if x is not None]
        return sum(v) / len(v) if v else None
    if best is not None and CARS:
        k0 = best[0]
        car, lane, walk = band(k0 + 0.2, k0 + 1.5), band(k0 - 1.3, k0 - 0.2), band(Fmed - 0.6, Fmed - 0.2)
        # (cars: light bodies far above the road's grey in a good share of the rows — not the roofs leaning over, warm,
        # nor shadows, dark)
        hi = band(k0 + 0.2, k0 + 1.5, lambda o: col[round(o, 1)]['q3'] if round(o, 1) in col else None)
        road = band(k0 - 1.3, k0 - 0.2, lambda o: col[round(o, 1)]['med'] if round(o, 1) in col else None)
        warmb = band(k0 + 0.2, k0 + 1.5, lambda o: col[round(o, 1)]['warm'] if round(o, 1) in col else None)
        if (car and lane and walk and hi and road and Fmed - k0 > 1.6 and car > 1.6 * lane and car > 1.4 * walk and car > 18
                and hi - road > 30 and (warmb or 0) < 0.3):
            lim = (car + walk) / 2
            o = k0 + 1.2
            while o < Fmed - 0.3 and iqr.get(round(o, 1), 0) > lim:
                o += STEP
            best = (round(o, 2), best[1], k0)
    # the pavement zone (the last 1.2 m before the facade): sunlit? hidden by roofs?
    zone = [st for st in stats if st is not None and Fmed - 1.3 <= st['o'] <= Fmed - 0.2]
    if not zone or best is None:
        return None
    bright = sorted(z['med'] for z in zone)[len(zone) // 2]
    warm = sum(z['warm'] for z in zone) / len(zone)
    out = dict(k=round(best[0], 2), strength=round(best[1], 3), bright=round(bright, 1), warm=round(warm, 2))
    if len(best) > 2: out['cars'] = best[2]   # (the step at the cars' side, moved out past them)
    return out


def kerb_rows(px, W, H, s0, sign, fac, half):
    """the kerb found row by row: in every row the steps outwards (darker to lighter: the carriageway's grey to the
    pavement, a shadow to the sun, the road to a parked car...), weighted by how sharp; summed down the street they
    pile up where a line runs along it. Shadows' edges wander (the houses are not all as tall), the cars' inner
    edges pile up too but further in: the kerb is the outermost pile worth the name. → dict or None"""
    bins = {}
    used = 0
    Fs = []
    for y in range(0, H, 2):
        F = fac(s0 + y * STEP)
        if F is None or F > half - 0.4 or F < MIN_ROAD + 0.4:
            continue
        Fs.append(F)
        prof = []
        for c in range(0, int(round(F / STEP))):
            o = c * STEP
            xi = int(round((half + sign * o) / STEP))
            if not (0 <= xi < W): break
            p = px[xi, y]
            prof.append(lum(p))
        if len(prof) < int(MIN_ROAD / STEP) + 6:
            continue
        # (a light box blur of 3)
        sm = [sum(prof[max(0, i - 1):i + 2]) / len(prof[max(0, i - 1):i + 2]) for i in range(len(prof))]
        hi_ = max(sm); lo_ = min(sm)
        rng = hi_ - lo_
        if rng < 25:
            continue
        used += 1
        steps = []
        for i in range(3, len(sm) - 3):
            o = i * STEP
            if o < MIN_ROAD or o > F - 0.15: continue
            d = sm[i + 2] - sm[i - 2]
            if d > 0.2 * rng and d >= sm[i + 1] - sm[i - 3] and d >= sm[i + 3] - sm[i - 1]:
                steps.append((o, d / rng))
        for o, w in steps:
            b = int(round(o / STEP))
            bins[b] = bins.get(b, 0.0) + w
    if used < 12 or not bins:
        return None
    # piles: smoothed over ±0.15 m
    keys = range(min(bins) - 2, max(bins) + 3)
    pile = {b: sum(bins.get(b + j, 0) * (1.0 if j == 0 else 0.6 if abs(j) == 1 else 0.25) for j in range(-2, 3)) for b in keys}
    peaks = [b for b in keys if pile[b] > 0 and pile[b] >= pile.get(b - 1, 0) and pile[b] > pile.get(b + 1, 0)]
    if not peaks:
        return None
    top = max(pile[b] for b in peaks)
    good = [b for b in peaks if pile[b] >= 0.35 * top]
    kb = max(good)   # (the outermost)
    Fs.sort()
    return dict(k=round(kb * STEP + 0.05, 2), mass=round(pile[kb] / used, 3), top=round(top / used, 3), rows=used, F=round(Fs[len(Fs) // 2], 2), Fp10=round(Fs[len(Fs) // 10], 2))


def measure(e, mos):
    pts = e['pts']
    L = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
    if L < 8 or not e['prof']:
        return None
    s0, s1 = min(4.0, L * 0.2), max(L - 4.0, L * 0.8)   # (the junctions left out)
    facP, facM = facade_at(e['prof'], 1), facade_at(e['prof'], 2)
    fl_out = {}
    strips = {}
    for fl in FLIGHTS:
        img, meta = strip(mos[fl], pts, half=HALF, s0=s0, s1=s1)
        if img is None:
            return None
        strips[fl] = (img, meta)
        px = img.load()
        W, H = img.size
        res = {}
        for sign, fac, name in ((1, facP, 'p'), (-1, facM, 'm')):
            stats, rows = side_profile(px, W, H, meta['s0'], sign, fac, HALF)
            if not stats:
                res[name] = None
                continue
            Fs = sorted(F for _, F in rows)
            Fmed = Fs[len(Fs) // 2]
            k = kerb_on(stats, Fmed)
            if k:
                k['F'] = round(Fmed, 2); k['Fp10'] = round(Fs[len(Fs) // 10], 2); k['rows'] = len(rows)
                rk = kerb_rows(px, W, H, meta['s0'], sign, fac, HALF)
                if rk:
                    k['kr'] = rk['k']; k['mass'] = rk['mass']   # (row by row: kept for the sheets, not voted)
            res[name] = k
        fl_out[fl] = res
    return dict(L=round(L, 1), flights=fl_out), strips


def choose(m):
    """per side, the kerb the flights agree on: each flight votes for its kerb with the weight of how well it sees
    that pavement (sunlit, not under the roofs) and how clear its step is; the place with most votes within ±0.3 m wins"""
    out = {}
    for side in ('p', 'm'):
        cands = []
        for fl, r in m['flights'].items():
            k = r.get(side)
            if not k:
                continue
            vis = (1 - min(1, k['warm'] * 2.5)) * min(1, max(0.15, (k['bright'] - 60) / 80))
            cands.append((max(1e-3, vis * k['strength']), fl, k))
        if not cands:
            out[side] = None
            continue
        best = None
        # (the square root: two flights that agree outweigh one that sees very sharply)
        for w, fl, k in cands:
            sup = sum(math.sqrt(w2) * math.exp(-((k['k'] - k2['k']) / 0.35) ** 2) for w2, _, k2 in cands)
            if best is None or sup > best[0]:
                best = (sup, k['k'])
        near = [(w, fl, k) for w, fl, k in cands if abs(k['k'] - best[1]) <= 0.35]
        kk = sum(w * k['k'] for w, _, k in near) / sum(w for w, _, _ in near)
        tot = sum(w for w, _, _ in cands)
        top = max(near, key=lambda q: q[0])
        out[side] = dict(k=round(kk, 2), F=top[2]['F'], Fp10=top[2]['Fp10'], flight=top[1], votes=len(near),
                         share=round(sum(w for w, _, _ in near) / tot, 2), score=round(best[0], 3))
    return out


def sheet_rows(e, m, ch, strips, W=150):
    """the edge's four unrolled photographs, 40 m of them, with the facades and the kerbs found"""
    tiles = []
    for fl in FLIGHTS:
        img, meta = strips[fl]
        H = img.height
        y0 = max(0, H // 2 - 200); y1 = min(H, y0 + 400)
        im = img.crop((0, y0, img.width, y1)).copy()
        d = ImageDraw.Draw(im)
        cx = HALF / STEP
        d.line([(cx, 0), (cx, im.height)], fill=(255, 255, 255), width=1)
        for k in range(-int(HALF), int(HALF) + 1):   # (a tick a metre)
            x = (HALF + k) / STEP
            d.line([(x, 0), (x, 6 if k % 5 else 14)], fill=(255, 255, 0))
        for side, sign, col in (('p', 1, (255, 0, 255)), ('m', -1, (0, 255, 255))):
            r = m['flights'][fl].get(side)
            if r:
                x = (HALF + sign * r['F']) / STEP
                d.line([(x, 0), (x, im.height)], fill=col, width=1)
                x = (HALF + sign * r['k']) / STEP
                d.line([(x, 20), (x, im.height - 20)], fill=(255, 140, 0), width=1)
            c = ch.get(side)
            if c and c['flight'] == fl:
                x = (HALF + sign * c['k']) / STEP
                d.line([(x, 0), (x, im.height)], fill=(255, 255, 0), width=3)
        im = im.resize((W, int(im.height * W / im.width)))
        tiles.append(im)
    return tiles


if __name__ == '__main__':
    E = json.load(open(EDGES))
    only = sys.argv[sys.argv.index('--solo') + 1:] if '--solo' in sys.argv else None
    mos = {fl: Mosaic(fl) for fl in FLIGHTS}
    os.makedirs(SNAPS, exist_ok=True)
    res = json.load(open(OUT)) if os.path.exists(OUT) and only else {}
    sheet, n_sheet, labels = [], 0, []
    todo = [e for e in E if (not only or e['key'] in only) and e['prof'] and e.get('facade')]
    print('streets', len(todo), flush=True)

    def flush():
        global sheet, n_sheet, labels
        if not sheet: return
        W = sum(4 * t[0].width + 30 for t in sheet)
        H = max(t[0].height for t in sheet) + 40
        S = Image.new('RGB', (W, H), (25, 25, 25))
        d = ImageDraw.Draw(S)
        x = 0
        for tiles, lab in zip(sheet, labels):
            for i, t in enumerate(tiles):
                S.paste(t, (x + i * t.width, 40))
            d.text((x + 2, 2), lab[0], fill=(255, 255, 255)); d.text((x + 2, 16), lab[1], fill=(255, 220, 120))
            x += 4 * tiles[0].width + 30
        n_sheet += 1
        S.save(os.path.join(SNAPS, f'hoja_{n_sheet:02d}.jpg'), quality=85)
        sheet, labels = [], []

    for i, e in enumerate(todo):
        r = measure(e, mos)
        if not r:
            continue
        m, strips = r
        ch = choose(m)
        res[e['key']] = dict(name=e['name'], cls=e['cls'], L=m['L'], flights=m['flights'], choice=ch, facade=e['facade'], shift=e['shift'])
        p, q = ch.get('p'), ch.get('m')
        lab = (f"{len(res)} {e['name'][:22]} {e['key'][-10:]}", f"+{p['k'] if p else '?'}/{p['F'] if p else '?'} -{q['k'] if q else '?'}/{q['F'] if q else '?'}")
        sheet.append(sheet_rows(e, m, ch, strips)); labels.append(lab)
        if len(sheet) == 6: flush()
        if i % 10 == 9: print(i + 1, 'measured', flush=True)
    flush()
    json.dump(res, open(OUT, 'w'), ensure_ascii=False, indent=0)
    print('wrote', OUT, len(res))
