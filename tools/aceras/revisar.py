# Review sheets: each street's four unrolled photographs (2025, 2022, 2019, 2016), 40 m of it, at 10 cm a pixel, with a
# tick every metre across (long ones every 5 m, the centreline white), the facades (magenta + side, cyan − side), the
# kerb each flight suggests (orange) and the one taken (yellow, thick). Two streets a sheet.
#   python3 tools/aceras/revisar.py [KEY…]  → .snaps/aceras/rev_NN.jpg
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from pnoa import Mosaic, REPO, FLIGHTS
from tira import strip, STEP

HALF = 13.0
MED = os.path.join(REPO, '.cache/aceras/medidas.json')
EDGES = os.path.join(REPO, '.cache/aceras/edges.json')
SNAPS = os.path.join(REPO, '.snaps/aceras')


def panel(e, m, mos, length=30.0, W=200):
    pts = e['pts']
    L = m['L']
    mid = L / 2
    s0, s1 = max(0, mid - length / 2), min(L, mid + length / 2)
    tiles = []
    for fl in FLIGHTS:
        img, meta = strip(mos[fl], pts, half=HALF, s0=s0, s1=s1)
        d = ImageDraw.Draw(img)
        cx = HALF / STEP
        for k in range(-int(HALF), int(HALF) + 1):
            x = (HALF + k) / STEP
            d.line([(x, 0), (x, 8 if k % 2 else 22)], fill=(255, 255, 0) if k else (255, 255, 255), width=2)
            d.line([(x, img.height - (8 if k % 2 else 22)), (x, img.height)], fill=(255, 255, 0) if k else (255, 255, 255), width=2)
        d.line([(cx, 20), (cx, img.height - 20)], fill=(255, 255, 255), width=1)
        for side, sign, col in (('p', 1, (255, 0, 255)), ('m', -1, (0, 255, 255))):
            r = m['flights'][fl].get(side)
            if r:
                x = (HALF + sign * r['F']) / STEP
                for y in range(0, img.height, 12): d.line([(x, y), (x, y + 6)], fill=col, width=2)
                x = (HALF + sign * r['k']) / STEP
                for y in range(30, img.height - 30, 10): d.line([(x, y), (x, y + 5)], fill=(255, 140, 0), width=2)
            c = (m.get('final') or m['choice']).get(side)
            if c:
                x = (HALF + sign * c['k']) / STEP
                d.line([(x, 40), (x, img.height - 40)], fill=(255, 255, 0), width=2)
        d.rectangle([0, 24, 44, 40], fill=(0, 0, 0)); d.text((3, 26), fl, fill=(255, 255, 255))
        tiles.append(img.resize((W, int(img.height * W / img.width))))
    return tiles


if __name__ == '__main__':
    M = json.load(open(MED))
    E = {e['key']: e for e in json.load(open(EDGES))}
    keys = sys.argv[1:] or list(M.keys())
    mos = {fl: Mosaic(fl) for fl in FLIGHTS}
    os.makedirs(SNAPS, exist_ok=True)
    blocks = []
    n = 0
    index = {}
    def flush():
        # four streets a sheet, two by two
        global blocks, n
        if not blocks: return
        bw = max(sum(t.width for t in b[0]) + 6 * len(b[0]) for b in blocks)
        bh = max(max(t.height for t in b[0]) + 30 for b in blocks)
        S = Image.new('RGB', (2 * bw + 24, 2 * bh + 8), (20, 20, 20))
        d = ImageDraw.Draw(S)
        for i, (tiles, lab) in enumerate(blocks):
            ox, oy = (i % 2) * (bw + 24), (i // 2) * (bh + 8)
            d.text((ox + 4, oy + 4), lab, fill=(255, 230, 140))
            x = ox
            for t in tiles:
                S.paste(t, (x, oy + 26)); x += t.width + 6
        n += 1
        S.save(os.path.join(SNAPS, f'rev_{n:02d}.jpg'), quality=88)
        blocks = []
    for k in keys:
        m = M.get(k)
        if not m or k not in E: continue
        c = m.get('final') or m['choice']
        p, q = c.get('p'), c.get('m')
        num = len(index) + 1
        index[num] = k
        f = lambda v: '?' if v is None else v
        lab = (f"#{num} {m['name'][:26]}  {m['L']:.0f} m   +{f(p and p['k'])}/{f(p and p['F'])} v{f(p and p['votes'])}"
               f"   -{f(q and q['k'])}/{f(q and q['F'])} v{f(q and q['votes'])}")
        blocks.append((panel(E[k], m, mos), lab))
        if len(blocks) == 4: flush()
    flush()
    json.dump(index, open(os.path.join(REPO, '.cache/aceras/indice.json'), 'w'))
    print(n, 'sheets')
