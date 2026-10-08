# Review sheets, close up: each street 24 m of it, in two flights (2019, the darkest asphalt; 2025, the latest), at
# 5 cm a pixel, with a line every metre across (red every 5 m, the numbers the metres from the street's line as
# OpenStreetMap draws it), the Catastro's facades (magenta +, cyan −) and the kerbs taken (yellow). Four streets a
# sheet, numbered: corrections are read off the grid.
#   python3 tools/aceras/revisar2.py → .snaps/aceras/r2_NN.jpg, .cache/aceras/indice_r2.json
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from pnoa import Mosaic, REPO
from tira import strip, STEP

HALF = 10.0
Z = 2   # (zoom: 5 cm a pixel)
A = json.load(open(os.path.join(REPO, 'data/aceras.json')))['calles']
E = {e['key']: e for e in json.load(open(os.path.join(REPO, '.cache/aceras/edges.json')))}
FL = ['2019', 'ma']
mos = {fl: Mosaic(fl) for fl in FL}


def panel(k):
    e, a = E[k], A[k]
    pts = e['pts']
    L = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
    half = max(HALF, min(14.0, max(a.get('fp') or 0, a.get('fm') or 0, a['p'], a['m']) + 1.5))
    tiles = []
    for fl in FL:
        img, meta = strip(mos[fl], pts, half=half, s0=max(0, L / 2 - 12), s1=min(L, L / 2 + 12))
        img = img.resize((img.width * Z, img.height * Z))
        d = ImageDraw.Draw(img)
        for m in range(-int(half), int(half) + 1):
            x = (half + m) / STEP * Z
            d.line([(x, 0), (x, img.height)], fill=(255, 40, 40) if m % 5 == 0 else (255, 255, 0), width=1)
            d.text((x + 2, 2), str(m), fill=(255, 255, 0))
        for F, col in ((a.get('fp'), (255, 0, 255)), (-(a.get('fm') or 0) if a.get('fm') else None, (0, 255, 255))):
            if F is None: continue
            x = (half + F) / STEP * Z
            for y in range(14, img.height, 16): d.line([(x, y), (x, y + 8)], fill=col, width=2)
        for kk in (a['p'], -a['m']):
            x = (half + kk) / STEP * Z
            d.line([(x, 30), (x, img.height - 4)], fill=(255, 255, 0), width=3)
        d.rectangle([0, img.height - 16, 44, img.height], fill=(0, 0, 0)); d.text((3, img.height - 14), fl, fill=(255, 255, 255))
        tiles.append(img)
    return tiles


if __name__ == '__main__':
    keys = sys.argv[1:] or sorted(A.keys(), key=lambda k: (A[k]['n'], k))
    os.makedirs(os.path.join(REPO, '.snaps/aceras'), exist_ok=True)
    index, blocks, n = {}, [], 0
    def flush():
        global blocks, n
        if not blocks: return
        bw = max(sum(t.width for t in b[0]) + 6 for b in blocks); bh = max(max(t.height for t in b[0]) + 22 for b in blocks)
        S = Image.new('RGB', (2 * bw + 16, 2 * bh + 6), (15, 15, 15))
        d = ImageDraw.Draw(S)
        for i, (tiles, lab) in enumerate(blocks):
            ox, oy = (i % 2) * (bw + 16), (i // 2) * (bh + 6)
            d.text((ox + 4, oy + 4), lab, fill=(255, 230, 140))
            x = ox
            for t in tiles: S.paste(t, (x, oy + 20)); x += t.width + 6
        n += 1
        S.save(os.path.join(REPO, '.snaps/aceras', f'r2_{n:02d}.jpg'), quality=88)
        blocks = []
    for k in keys:
        if k not in A or k not in E: continue
        a = A[k]
        num = len(index) + 1
        index[num] = k
        lab = f"#{num} {a['n'][:28]}  +{a['p']} (facade {a.get('fp')})   -{a['m']} (facade {a.get('fm')})   [{a['src']}]"
        blocks.append((panel(k), lab))
        if len(blocks) == 4: flush()
    flush()
    json.dump(index, open(os.path.join(REPO, '.cache/aceras/indice_r2.json'), 'w'))
    print(n, 'sheets', len(index), 'streets')
