# The kerbs placed by hand where the review of the photographs (revisar3.py) finds the game's off: a few points a side,
# read off the review sheet's scale — metres along the street from its start, and metres out from its line — and kept
# as the game's coordinates (data/bordillos.json), so they stay where they are on the ground whatever moves the line.
# The game lays the kerb through them (src/kerbs.js; straight between two, level past the first and the last), and
# still brings it in wherever the houses leave less than a metre to walk on.
#   python3 tools/aceras/puntos.py ID +|- S:OFF [S:OFF …] [--nota "…"] [--centrar]   (the street's game index, as on the
#     sheets; --centrar: OpenStreetMap's line is off the street — under the houses —: it is put between these kerbs)
#   python3 tools/aceras/puntos.py --archivo FILE                         (many: one a line, as above; # comments)
#   python3 tools/aceras/puntos.py --borrar ID [+|-]
#   python3 tools/aceras/puntos.py --lista
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnoa import REPO

SRC = os.path.join(REPO, '.cache/aceras/kerbs_runtime.json')
KEYS = os.path.join(REPO, '.cache/aceras/edge_keys.json')
OUT = os.path.join(REPO, 'data/bordillos.json')


def load():
    if os.path.exists(OUT): return json.load(open(OUT, encoding='utf-8'))
    return {'fuente': 'Bordillos colocados a mano sobre las ortofotos del PNOA (cedido por © Instituto Geográfico Nacional, CC BY 4.0) en la revisión de cada calle (tools/aceras/revisar3.py, tools/aceras/puntos.py): solo coordenadas.', 'calles': {}}


def save(D):
    with open(OUT, 'w', encoding='utf-8') as f: json.dump(D, f, ensure_ascii=False, indent=1, sort_keys=True)


def on_line(pts):
    cum = [0.0]
    for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    def f(s):
        k = 1
        while k < len(cum) - 1 and cum[k] < s: k += 1
        t = (s - cum[k - 1]) / max(1e-9, cum[k] - cum[k - 1]); dx, dz = pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]; dl = math.hypot(dx, dz) or 1
        return pts[k - 1][0] + dx * t, pts[k - 1][1] + dz * t, -dz / dl, dx / dl
    return f, cum[-1]


def put(D, E, K, a):
    """one street side: ID +|- S:OFF …"""
    eid, sd = int(a[0]), ('p' if a[1] == '+' else 'm')
    e, key = E[eid], K[eid]
    f, L = on_line(e['pts'])
    sign = 1 if sd == 'p' else -1
    pts = []
    for tok in a[2:]:
        s, off = (float(v) for v in tok.split(':'))
        s = max(0.0, min(L, s))
        x, z, nx, nz = f(s)
        pts.append([round(x + nx * sign * off, 2), round(z + nz * sign * off, 2), round(s, 1), off])
    rec = D['calles'].setdefault(key, {'n': e['name']})
    rec[sd] = sorted(pts, key=lambda q: q[2])
    return eid, key, sd, pts


if __name__ == '__main__':
    a = sys.argv[1:]
    D = load()
    if a and a[0] == '--archivo':   # (a list of them, one a line: ID +|- S:OFF …; # for comments)
        E = {e['id']: e for e in json.load(open(SRC))}
        K = json.load(open(KEYS))
        n = 0
        for line in open(a[1], encoding='utf-8'):
            line = line.split('#')[0].split()
            if not line: continue
            c = '--centrar' in line
            eid, key, sd, pts = put(D, E, K, [x for x in line if x != '--centrar']); n += 1
            if c: D['calles'][key]['centrar'] = True
        save(D); print(n, 'sides placed'); sys.exit()
    if a and a[0] == '--lista':
        for k, v in sorted(D['calles'].items()): print(k, v.get('n'), {sd: len(v.get(sd, [])) for sd in ('p', 'm')}, v.get('nota', ''))
        sys.exit()
    E = {e['id']: e for e in json.load(open(SRC))}
    K = json.load(open(KEYS))
    if a and a[0] == '--borrar':
        eid = int(a[1]); key = K[eid]; rec = D['calles'].get(key)
        if rec:
            for sd in (['p' if a[2] == '+' else 'm'] if len(a) > 2 else ['p', 'm']): rec.pop(sd, None)
            if not rec.get('p') and not rec.get('m'): D['calles'].pop(key)
        save(D); print('borrado', eid, key); sys.exit()
    nota = a[a.index('--nota') + 1] if '--nota' in a else None
    if nota: a = a[:a.index('--nota')]
    centrar = '--centrar' in a
    if centrar: a = [x for x in a if x != '--centrar']
    eid, key, sd, pts = put(D, E, K, a)
    if nota: D['calles'][key]['nota'] = nota
    if centrar: D['calles'][key]['centrar'] = True
    save(D)
    print(eid, key, sd, pts)
