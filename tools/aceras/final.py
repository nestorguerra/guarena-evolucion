# The measurements the game uses: data/aceras.json, one entry per street of the graph (by its way and end nodes in
# OpenStreetMap): where its kerbs are, either side of the street as OpenStreetMap draws it, and how far its houses are.
#   - what the flights agree on (medir.py), as reviewed on the sheets (revisar.py): the doubtful ones (a single flight,
#     an odd width) one by one, the others in samples;
#   - the corrections made on the sheets (correcciones.json: a kerb moved, or «skip»: the town's rule there).
# Only numbers: nothing of the photographs goes into the game.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pnoa import REPO

C = os.path.join(REPO, '.cache/aceras')
def load(name, alt=None):
    fn = os.path.join(C, name)
    if os.path.exists(fn): return json.load(open(fn))
    return json.load(open(os.path.join(C, alt))) if alt else None
# (medir.py --sin-coches → medidas_sin_coches.json: what the review of the doubtful ones saw; medir.py → medidas.json,
# with the parking-lane rule)
seen = load('medidas_sin_coches.json', 'medidas.json')
cars = load('medidas_coches.json', 'medidas.json')
fixes = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'correcciones.json')))


def is_doubtful(m):
    # a single flight's vote, a pavement wider than 3 m or almost none, a carriageway under 3 m or over 11 m
    c = m['choice']; p, q = c.get('p'), c.get('m')
    if not p or not q: return True
    for k in (p, q):
        if k['votes'] <= 1 or k['F'] - k['k'] > 3.0 or k['F'] - k['k'] < 0.15: return True
    return not (3.0 <= p['k'] + q['k'] <= 11)


doubtful = set(load('dudosos.json') or [k for k, m in seen.items() if is_doubtful(m)])

out, skipped, kinds = {}, 0, {'auto': 0, 'revisado': 0, 'corregido': 0}
for k, m in seen.items():
    fx = fixes.get(k, {}).get('fix')
    if fx == 'skip':
        skipped += 1
        continue
    base = (m if k in doubtful or fx else cars.get(k, m))['choice']
    sides = {}
    for sd in ('p', 'm'):
        c = base.get(sd)
        kerb = fx.get(sd) if fx and sd in fx else (c['k'] if c else None)
        sides[sd] = (kerb, c['F'] if c else None, c['votes'] if c else 0)
    if sides['p'][0] is None or sides['m'][0] is None:
        skipped += 1
        continue
    src = 'corregido' if fx else 'revisado' if k in doubtful else 'auto'
    kinds[src] += 1
    out[k] = dict(n=m['name'], p=round(sides['p'][0], 2), m=round(sides['m'][0], 2),
                  fp=sides['p'][1] and round(sides['p'][1], 2), fm=sides['m'][1] and round(sides['m'][1], 2),
                  v=min(sides['p'][2], sides['m'][2]), src=src)
fn = os.path.join(REPO, 'data', 'aceras.json')
with open(fn, 'w', encoding='utf-8') as f:
    json.dump(dict(fuente='PNOA cedido por © Instituto Geográfico Nacional (vuelos 2016, 2019, 2022 y 2025), medido con tools/aceras',
                   calles=out), f, ensure_ascii=False, indent=0, sort_keys=True)
print('wrote', fn, len(out), 'streets', kinds, 'skipped', skipped)
