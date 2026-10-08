#!/usr/bin/env python3
"""Build the game map (map.json) for Guareña from OpenStreetMap + Catastro INSPIRE data.

Inputs:  data/guarena.osm            (OSM API extract)
         data/cat/b_*.gml, p_*.gml   (Catastro buildings / building parts, EPSG:4326)
Output:  data/map.json               (local metric coordinates, decimetre integers)

World frame: x = east, z = south (north is -z), metres, origin at LAT0/LON0.
"""
import glob, json, math, re, sys, os
import xml.etree.ElementTree as ET
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

# Origin: Plaza de España / Ayuntamiento area
LAT0, LON0 = 38.8596, -6.1025
R = 6378137.0
KX = math.cos(math.radians(LAT0)) * R * math.pi / 180.0
KZ = R * math.pi / 180.0

# Playable bounds (lat/lon) -> metres
B_LAT0, B_LAT1 = 38.8465, 38.8695
B_LON0, B_LON1 = -6.1195, -6.0745


def proj(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


BX0, BZ1 = proj(B_LAT0, B_LON0)
BX1, BZ0 = proj(B_LAT1, B_LON1)


def in_bounds(x, z, m=0.0):
    return BX0 - m <= x <= BX1 + m and BZ0 - m <= z <= BZ1 + m

# ---------------------------------------------------------------- geometry utils

def area2(ring):
    a = 0.0
    n = len(ring)
    for i in range(n):
        x0, z0 = ring[i]
        x1, z1 = ring[(i + 1) % n]
        a += x0 * z1 - x1 * z0
    return a * 0.5


def dedupe_ring(ring, eps=0.05):
    out = []
    for p in ring:
        if not out or abs(p[0] - out[-1][0]) > eps or abs(p[1] - out[-1][1]) > eps:
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) <= eps and abs(out[0][1] - out[-1][1]) <= eps:
        out.pop()
    return out


def simplify_ring(ring, dist=0.18, ang=0.06):
    """Remove nearly collinear vertices (keeps footprints crisp but light)."""
    pts = dedupe_ring(ring)
    changed = True
    while changed and len(pts) > 3:
        changed = False
        i = 0
        while i < len(pts) and len(pts) > 3:
            a = pts[i - 1]; b = pts[i]; c = pts[(i + 1) % len(pts)]
            abx, abz = b[0] - a[0], b[1] - a[1]
            acx, acz = c[0] - a[0], c[1] - a[1]
            lac = math.hypot(acx, acz)
            lab = math.hypot(abx, abz)
            lbc = math.hypot(c[0] - b[0], c[1] - b[1])
            if lac < 1e-6:
                pts.pop(i); changed = True; continue
            d = abs(abx * acz - abz * acx) / lac
            if d < dist or lab < 0.12 or lbc < 0.12:
                pts.pop(i); changed = True; continue
            i += 1
    return pts


def centroid(ring):
    a = 0; cx = 0; cz = 0
    n = len(ring)
    for i in range(n):
        x0, z0 = ring[i]; x1, z1 = ring[(i + 1) % n]
        c = x0 * z1 - x1 * z0
        a += c; cx += (x0 + x1) * c; cz += (z0 + z1) * c
    if abs(a) < 1e-9:
        return (sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n)
    return (cx / (3 * a), cz / (3 * a))


def q(v):
    return int(round(v * 10))


def flat(ring):
    o = []
    for x, z in ring:
        o.append(q(x)); o.append(q(z))
    return o

# ---------------------------------------------------------------- Catastro

NS = {
    'gml': 'http://www.opengis.net/gml/3.2',
    'bu-ext2d': 'http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0',
    'bu-core2d': 'http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0',
}
GML = '{http://www.opengis.net/gml/3.2}'
EXT = '{http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0}'


def parse_poslist(txt):
    v = txt.split()
    pts = []
    for i in range(0, len(v) - 1, 2):
        lat = float(v[i]); lon = float(v[i + 1])
        pts.append(proj(lat, lon))
    return pts


def polygons_of(el):
    """Return list of (outer, [holes]) from a feature element."""
    polys = []
    for patch in el.iter(GML + 'PolygonPatch'):
        outer = None; holes = []
        ext = patch.find(GML + 'exterior')
        if ext is not None:
            pl = ext.find('.//' + GML + 'posList')
            if pl is not None and pl.text:
                outer = parse_poslist(pl.text)
        for it in patch.findall(GML + 'interior'):
            pl = it.find('.//' + GML + 'posList')
            if pl is not None and pl.text:
                holes.append(parse_poslist(pl.text))
        if outer:
            polys.append((outer, holes))
    return polys


def load_catastro():
    buildings = {}
    parts = {}
    for fn in sorted(glob.glob(os.path.join(DATA, 'cat', 'b_*.gml'))):
        try:
            tree = ET.parse(fn)
        except ET.ParseError as e:
            print('parse error', fn, e); continue
        for b in tree.getroot().iter(EXT + 'Building'):
            bid = b.get(GML + 'id', '').replace('ES.SDGC.BU.', '')
            if bid in buildings:
                continue
            use = b.findtext(EXT + 'currentUse') or ''
            polys = polygons_of(b)
            year = None
            beg = b.find('.//{http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0}beginning')
            if beg is not None and beg.text:
                try: year = int(beg.text[:4])
                except ValueError: pass
            dw = b.findtext(EXT + 'numberOfDwellings')
            area = None
            for v in b.iter(EXT + 'value'):
                try: area = float(v.text)
                except (TypeError, ValueError): pass
            buildings[bid] = dict(use=use, polys=polys, year=year, dwell=int(dw) if dw and dw.isdigit() else 0, gfa=area)
    for fn in sorted(glob.glob(os.path.join(DATA, 'cat', 'p_*.gml'))):
        try:
            tree = ET.parse(fn)
        except ET.ParseError as e:
            print('parse error', fn, e); continue
        for p in tree.getroot().iter(EXT + 'BuildingPart'):
            pid = p.get(GML + 'id', '').replace('ES.SDGC.BU.', '')
            if pid in parts:
                continue
            fl = p.findtext(EXT + 'numberOfFloorsAboveGround')
            try: fl = int(fl)
            except (TypeError, ValueError): fl = 1
            parts[pid] = dict(floors=fl, polys=polygons_of(p))
    return buildings, parts

# ---------------------------------------------------------------- OSM

DRIVE = {
    'primary': (8.0, 2.0), 'primary_link': (5.5, 0.0), 'secondary': (7.5, 2.0), 'tertiary': (7.0, 1.8),
    'tertiary_link': (5.0, 0.0), 'unclassified': (5.5, 1.2), 'residential': (5.5, 1.3),
    'living_street': (4.6, 0.9), 'service': (4.0, 0.0), 'track': (3.4, 0.0),
}
WALK = {'pedestrian': (6.0, 0.0), 'footway': (2.2, 0.0), 'path': (1.6, 0.0), 'steps': (2.0, 0.0), 'cycleway': (2.2, 0.0)}
CLASS_CODE = {k: i for i, k in enumerate(['primary', 'primary_link', 'secondary', 'tertiary', 'tertiary_link', 'unclassified',
                                          'residential', 'living_street', 'service', 'track', 'pedestrian', 'footway', 'path', 'steps', 'cycleway'])}


def load_osm():
    root = ET.parse(os.path.join(DATA, 'guarena.osm')).getroot()
    nodes = {}; ntags = {}
    for n in root.iter('node'):
        nid = n.get('id')
        nodes[nid] = proj(float(n.get('lat')), float(n.get('lon')))
        tg = {t.get('k'): t.get('v') for t in n.findall('tag')}
        if tg: ntags[nid] = tg
    ways = {}
    for w in root.iter('way'):
        tg = {t.get('k'): t.get('v') for t in w.findall('tag')}
        ways[w.get('id')] = (tg, [nd.get('ref') for nd in w.findall('nd')])
    rels = []
    for r in root.iter('relation'):
        tg = {t.get('k'): t.get('v') for t in r.findall('tag')}
        mem = [(m.get('type'), m.get('ref'), m.get('role')) for m in r.findall('member')]
        rels.append((r.get('id'), tg, mem))
    return nodes, ntags, ways, rels

# ---------------------------------------------------------------- spatial grid for building edges

class SegGrid:
    def __init__(self, cell=8.0):
        self.cell = cell
        self.cells = defaultdict(list)
        self.segs = []

    def add_ring(self, ring, tag=None):
        n = len(ring)
        for i in range(n):
            a = ring[i]; b = ring[(i + 1) % n]
            idx = len(self.segs)
            self.segs.append((a[0], a[1], b[0], b[1], tag))
            x0 = int(math.floor(min(a[0], b[0]) / self.cell)); x1 = int(math.floor(max(a[0], b[0]) / self.cell))
            z0 = int(math.floor(min(a[1], b[1]) / self.cell)); z1 = int(math.floor(max(a[1], b[1]) / self.cell))
            for cx in range(x0, x1 + 1):
                for cz in range(z0, z1 + 1):
                    self.cells[(cx, cz)].append(idx)

    def ray(self, px, pz, dx, dz, maxd):
        """Distance along ray to the nearest segment (or None)."""
        ex, ez = px + dx * maxd, pz + dz * maxd
        x0 = int(math.floor(min(px, ex) / self.cell)); x1 = int(math.floor(max(px, ex) / self.cell))
        z0 = int(math.floor(min(pz, ez) / self.cell)); z1 = int(math.floor(max(pz, ez) / self.cell))
        best = None; seen = set()
        for cx in range(x0, x1 + 1):
            for cz in range(z0, z1 + 1):
                for si in self.cells.get((cx, cz), ()):
                    if si in seen: continue
                    seen.add(si)
                    ax, az, bx, bz, _ = self.segs[si]
                    sx, sz = bx - ax, bz - az
                    den = dx * sz - dz * sx
                    if abs(den) < 1e-9: continue
                    t = ((ax - px) * sz - (az - pz) * sx) / den
                    u = ((ax - px) * dz - (az - pz) * dx) / den
                    if 0 <= u <= 1 and 0 < t <= maxd and (best is None or t < best):
                        best = t
        return best


# the streets whose carriageway and pavements are measured on the orthophoto (tools/aceras)
DRIVE_MEASURE = ('primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'primary_link', 'tertiary_link')


def edge_key(e):
    # (an edge of the graph by its way and its two end nodes in OpenStreetMap: the same whatever else changes)
    return f"{e['wid']}:{e['osm'][0]}:{e['osm'][-1]}"


def point_in_ring(x, z, ring):
    ins = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, zi = ring[i]; xj, zj = ring[j]
        if ((zi > z) != (zj > z)) and (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi):
            ins = not ins
        j = i
    return ins

# ---------------------------------------------------------------- main build

def main():
    buildings, parts = load_catastro()
    print('catastro buildings', len(buildings), 'parts', len(parts))
    nodes, ntags, ways, rels = load_osm()
    print('osm nodes', len(nodes), 'ways', len(ways))

    names = []
    name_idx = {}

    def nm(s):
        if not s: return -1
        if s not in name_idx:
            name_idx[s] = len(names); names.append(s)
        return name_idx[s]

    USE = {'1_residential': 0, '2_agriculture': 1, '3_industrial': 2, '4_1_office': 3, '4_2_retail': 4, '4_3_publicServices': 5}

    # ---- buildings (outer footprints for collision) and parts (3D volumes)
    grid = SegGrid(8.0)
    bl_out = []   # building outlines
    bid_index = {}
    for bid, b in buildings.items():
        for outer, holes in b['polys']:
            ring = simplify_ring(outer, 0.12, 0)
            if len(ring) < 3: continue
            a = area2(ring)
            if abs(a) < 4.0: continue
            if a < 0: ring.reverse()           # CCW in (x,z) math sense
            c = centroid(ring)
            if not in_bounds(c[0], c[1]): continue
            hs = []
            for h in holes:
                hr = simplify_ring(h, 0.12, 0)
                if len(hr) >= 3 and abs(area2(hr)) > 2.0:
                    if area2(hr) > 0: hr.reverse()
                    hs.append(hr)
            if bid not in bid_index:
                bid_index[bid] = len(bl_out)
            grid.add_ring(ring, len(bl_out))
            for hr in hs: grid.add_ring(hr, len(bl_out))
            bl_out.append(dict(id=bid, ring=ring, holes=hs, use=USE.get(b['use'], 0), year=b['year'] or 0,
                               dw=b['dwell'], gfa=b['gfa'] or 0, area=abs(a), floors=1))
    print('outlines', len(bl_out))

    part_out = []
    for pid, p in parts.items():
        if p['floors'] <= 0: continue
        bid = pid.split('_part')[0]
        bi = bid_index.get(bid, -1)
        for outer, holes in p['polys']:
            ring = simplify_ring(outer)
            if len(ring) < 3: continue
            a = area2(ring)
            if abs(a) < 1.5: continue
            if a < 0: ring.reverse()
            c = centroid(ring)
            if not in_bounds(c[0], c[1]): continue
            hs = []
            for h in holes:
                hr = simplify_ring(h)
                if len(hr) >= 3 and abs(area2(hr)) > 1.0:
                    if area2(hr) > 0: hr.reverse()
                    hs.append(hr)
            part_out.append(dict(ring=ring, holes=hs, floors=p['floors'], b=bi, area=abs(a)))
            if bi >= 0:
                bl_out[bi]['floors'] = max(bl_out[bi]['floors'], p['floors'])
    print('parts kept', len(part_out), Counter(min(p['floors'], 9) for p in part_out))

    # ---- road graph
    use_count = Counter()
    hw_ways = []
    for wid, (tg, nds) in ways.items():
        hw = tg.get('highway')
        if hw in DRIVE or hw in WALK:
            if tg.get('area') == 'yes' and hw == 'pedestrian':
                continue
            if tg.get('access') in ('private', 'no') and hw in ('service', 'track'):
                continue
            nds = [n for n in nds if n in nodes]
            if len(nds) < 2: continue
            hw_ways.append((wid, tg, nds))
            for i, n in enumerate(nds):
                use_count[n] += 2 if (i == 0 or i == len(nds) - 1) else 1
    gnode_of = {}
    gnodes = []

    def gnode(nid):
        if nid not in gnode_of:
            gnode_of[nid] = len(gnodes); gnodes.append(nodes[nid])
        return gnode_of[nid]

    edges = []
    for wid, tg, nds in hw_ways:
        hw = tg['highway']
        w, sw = DRIVE.get(hw) or WALK.get(hw)
        if tg.get('width'):
            try: w = float(tg['width'].replace(',', '.').split()[0])
            except ValueError: pass
        ow = 0
        o = tg.get('oneway', '')
        if o in ('yes', '1', 'true'): ow = 1
        elif o == '-1': ow = -1
        if tg.get('junction') == 'roundabout': ow = 1
        name = tg.get('name') or tg.get('ref') or ''
        surface = tg.get('surface', '')
        dirt = 1 if (hw == 'track' or surface in ('unpaved', 'gravel', 'dirt', 'ground', 'compacted', 'fine_gravel', 'sand', 'grass')) else 0
        start = 0
        for i in range(1, len(nds)):
            n = nds[i]
            if i == len(nds) - 1 or use_count[n] > 1:
                seg = nds[start:i + 1]
                pts = [nodes[k] for k in seg]
                # drop edges completely outside bounds
                if any(in_bounds(p[0], p[1], 150) for p in pts):
                    edges.append(dict(a=gnode(seg[0]), b=gnode(seg[-1]), pts=pts, cls=hw, w=w, sw=sw, ow=ow,
                                      name=name, dirt=dirt, ref=tg.get('ref', ''), wid=wid, osm=seg))
                start = i
    print('graph nodes', len(gnodes), 'edges', len(edges))

    # ---- measure facade-to-facade width & centre offset on urban streets
    shifts = []
    measured = 0
    for e in edges:
        if e['cls'] not in ('primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'service', 'primary_link', 'tertiary_link'):
            continue
        pts = e['pts']
        # cumulative length
        L = 0.0; cum = [0.0]
        for i in range(1, len(pts)):
            L += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.append(L)
        if L < 4: continue
        samples = []
        s = min(5.0, L * 0.3)
        while s <= L - min(5.0, L * 0.3) + 1e-6:
            # locate
            k = 1
            while k < len(cum) - 1 and cum[k] < s: k += 1
            t = (s - cum[k - 1]) / max(1e-6, cum[k] - cum[k - 1])
            px = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t
            pz = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t
            dx = pts[k][0] - pts[k - 1][0]; dz = pts[k][1] - pts[k - 1][1]
            dl = math.hypot(dx, dz) or 1
            dx /= dl; dz /= dl
            nx, nz = -dz, dx
            left = grid.ray(px, pz, nx, nz, 22.0)
            right = grid.ray(px, pz, -nx, -nz, 22.0)
            samples.append((left, right))
            e.setdefault('prof', []).append((round(s, 2), left, right))
            s += 3.0
        both = [(l, r) for l, r in samples if l is not None and r is not None and l + r < 30]
        e['samples'] = len(samples)
        if len(both) >= max(2, len(samples) * 0.4):
            Ds = sorted(l + r for l, r in both)
            Ss = sorted((l - r) * 0.5 for l, r in both)
            D = Ds[len(Ds) // 3]            # lower third: narrowest typical section
            S = Ss[len(Ss) // 2]
            e['facade'] = D
            e['shift'] = max(-3.0, min(3.0, S))
            measured += 1
            shifts.append(abs(S))
        else:
            # one side open: at least keep clear of the nearer side
            ones = [l for l, r in samples if l is not None] + [r for l, r in samples if r is not None]
            e['facade'] = None
            e['shift'] = 0.0
    shifts.sort()
    if shifts:
        print('measured', measured, 'median |shift|', shifts[len(shifts) // 2], 'p90', shifts[int(len(shifts) * 0.9)])
    # (tools/aceras: the streets as OpenStreetMap draws them, before they are moved, with their facades either side)
    if '--edges' in sys.argv:
        fn = sys.argv[sys.argv.index('--edges') + 1]
        dump = [dict(key=edge_key(e), name=e['name'], cls=e['cls'], dirt=e['dirt'], pts=[[round(x, 2), round(z, 2)] for x, z in e['pts']],
                     facade=e.get('facade'), shift=e.get('shift', 0.0), w=e['w'], sw=e['sw'], prof=e.get('prof', []))
                for e in edges if not e['dirt'] and e['cls'] in DRIVE_MEASURE]
        with open(fn, 'w', encoding='utf-8') as f:
            json.dump(dump, f, ensure_ascii=False)
        print('edges for tools/aceras', fn, len(dump))
        return

    # the kerbs measured on the orthophotos (tools/aceras: PNOA, IGN, CC BY 4.0), where there are: the carriageway from
    # kerb to kerb, the street's line put in its middle, and the pavement either side what is left to the houses
    acer = {}
    fa = os.path.join(DATA, 'aceras.json')
    if os.path.exists(fa):
        acer = json.load(open(fa, encoding='utf-8'))['calles']
    n_acer = 0
    for e in edges:
        a = acer.get(edge_key(e)) if 'osm' in e else None
        if not a or e['dirt']:
            continue
        kp, km = a['p'], a['m']
        # (the kerb is measured to a decimetre or two: where the street's houses stand nearer than it all along —
        # more than one sample in twelve — it comes in to them, half a metre at most; a single house jutting out is a
        # real narrowing and stays one)
        prof = e.get('prof') or []
        def fit(k, vals):
            v = sorted(x for x in vals if x is not None and x < 21)
            if len(v) < 4:
                return k
            near = sum(1 for x in v if x < k + 0.1) / len(v)
            if near <= 1 / 12:
                return k
            p8 = v[max(0, int(len(v) / 12))]
            return max(k - 0.5, min(k, p8 - 0.1), 1.2)
        kp, km = fit(kp, [q[1] for q in prof]), fit(km, [q[2] for q in prof])
        # and a pavement to walk on: where the photograph shows one narrower than a person needs (0.9 m) and the
        # carriageway has room to spare (3.4 m one way, 5 m both), the kerb comes in for it — half a metre at most, so
        # the street stays as the photograph has it; a lane too narrow for both stays a single platform
        def medf(vals):
            v = sorted(x for x in vals if x is not None and x < 21)
            return v[len(v) // 2] if len(v) >= 3 else None
        Fp, Fm = medf(q[1] for q in prof), medf(q[2] for q in prof)
        wmin = 3.4 if e['ow'] else 5.0
        for _ in range(2):
            for side in ('p', 'm'):
                F, k = (Fp, kp) if side == 'p' else (Fm, km)
                if F is None or F - k >= 0.9 or F - k < -0.2:
                    continue
                room = (kp + km) - wmin
                give = min(0.5, 0.9 - (F - k), max(0.0, room))
                if give <= 0.02:
                    continue
                if side == 'p': kp -= give
                else: km -= give
        e['w'] = round(kp + km, 2)
        e['shift'] = (kp - km) * 0.5
        e['measured'] = True
        def med(vals):
            v = sorted(x for x in vals if x is not None)
            return v[len(v) // 2] if v else None
        fp, fm = med(p[1] for p in prof), med(p[2] for p in prof)
        e['swp'] = max(0.0, fp - kp) if fp is not None and fp < 21 else None
        e['swm'] = max(0.0, fm - km) if fm is not None and fm < 21 else None
        ws = [x for x in (e['swp'], e['swm']) if x is not None]
        e['sw'] = round(min(ws), 2) if ws else 0.0
        n_acer += 1
    if acer:
        print('pavements measured', n_acer, 'of', len(acer))

    # widths from facade distance
    for e in edges:
        D = e.get('facade')
        if D and not e.get('measured'):
            if e['cls'] in WALK:
                e['w'] = max(2.0, min(D - 0.6, 14.0)); e['sw'] = 0.0
            else:
                if D < 5.6:
                    sw = 0.45
                else:
                    sw = max(0.8, min(3.2, D * 0.14))
                w = D - 2 * sw
                w = max(3.6, min(w, 16.0))
                e['w'] = round(w, 1); e['sw'] = round(sw, 1)

    # the street's line follows its houses: every 3 m it is put where the carriageway, as wide as it is, leaves each
    # pavement its width (measured, or the town's rule) from that side's houses — a street that bends between its
    # houses keeps its pavements along them, instead of one widening and the other vanishing as a straight line from
    # OpenStreetMap drifts across it. Smoothed over a few metres (a doorway set back, a gap between houses do not move
    # it), never more than 2.5 m from where the whole street's measurement puts it.
    def follow(e):
        prof = e.get('prof') or []
        if len(prof) < 3 or not e.get('facade') or e.get('centrar'):   # (a line put between its kerbs by hand: as it is)
            return None
        w = e['w']
        ls = sorted(q[1] for q in prof if q[1] is not None and q[1] < 21)
        rs = sorted(q[2] for q in prof if q[2] is not None and q[2] < 21)
        ml = ls[len(ls) // 2] if ls else None
        mr = rs[len(rs) // 2] if rs else None
        if e.get('measured'):
            Pp = max(0.0, (e['swp'] if e.get('swp') is not None else e['sw']))
            Pm = max(0.0, (e['swm'] if e.get('swm') is not None else e['sw']))
        else:
            Pp = Pm = max(0.0, e['sw'])
        c0 = e.get('shift', 0.0) or 0.0
        cs = []
        for sv, l, r in prof:
            if l is not None and (l > 14 or (ml is not None and l > ml + 3.5)): l = None
            if r is not None and (r > 14 or (mr is not None and r > mr + 3.5)): r = None
            c = None
            if l is not None and r is not None:
                avail = l + r - w
                if avail >= 0:
                    tot = Pp + Pm
                    pp = avail * (Pp / tot if tot > 0.01 else 0.5)
                    c = l - pp - w / 2
                else:
                    c = (l - r) / 2
            elif l is not None:
                c = l - Pp - w / 2
            elif r is not None:
                c = -r + Pm + w / 2
            cs.append([sv, c])
        known = [i for i, q in enumerate(cs) if q[1] is not None]
        if len(known) < max(2, len(cs) // 3):
            return None
        for i, q in enumerate(cs):  # (the gaps between known points filled in straight)
            if q[1] is not None: continue
            a = max([k for k in known if k < i], default=None); b = min([k for k in known if k > i], default=None)
            if a is None: q[1] = cs[b][1]
            elif b is None: q[1] = cs[a][1]
            else: q[1] = cs[a][1] + (cs[b][1] - cs[a][1]) * (i - a) / (b - a)
        v = [q[1] for q in cs]
        n = len(v)
        med = [sorted(v[max(0, i - 2):i + 3])[len(v[max(0, i - 2):i + 3]) // 2] for i in range(n)]
        avg = [sum(med[max(0, i - 2):i + 3]) / len(med[max(0, i - 2):i + 3]) for i in range(n)]
        avg = [max(c0 - 2.5, min(c0 + 2.5, c)) for c in avg]
        # the new line: the old one's points every 3 m, each moved across by its c (the normal over ±1.5 m)
        pts = e['pts']
        cum = [0.0]
        for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        L = cum[-1]
        def at(sv):
            sv = max(0.0, min(L, sv))
            k = 1
            while k < len(cum) - 1 and cum[k] < sv: k += 1
            t = (sv - cum[k - 1]) / max(1e-9, cum[k] - cum[k - 1])
            return (pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t)
        def nrm(sv):
            a, b = at(sv - 1.5), at(sv + 1.5)
            dx, dz = b[0] - a[0], b[1] - a[1]
            dl = math.hypot(dx, dz) or 1
            return (-dz / dl, dx / dl)
        out = []
        n0 = nrm(0.0); nL = nrm(L)
        ca, cb = avg[0], avg[-1]
        out.append((pts[0][0] + n0[0] * ca, pts[0][1] + n0[1] * ca))
        for (sv, _), c in zip(cs, avg):
            p0, nn = at(sv), nrm(sv)
            out.append((p0[0] + nn[0] * c, p0[1] + nn[1] * c))
        out.append((pts[-1][0] + nL[0] * cb, pts[-1][1] + nL[1] * cb))
        # (the pavements as they come out: their typical width, for the game)
        pl = [l - (c + w / 2) for (sv, l, r), c in zip(prof, avg) if l is not None and l < 14]
        pr = [r - (w / 2 - c) for (sv, l, r), c in zip(prof, avg) if r is not None and r < 14]
        return out, (n0[0] * ca, n0[1] * ca), (nL[0] * cb, nL[1] * cb), pl, pr

    # the streets whose OpenStreetMap line runs under the houses (the review put their kerbs where the photographs show
    # the street: data/bordillos.json, «centrar»): the line moved into the middle between those kerbs
    fb0 = os.path.join(DATA, 'bordillos.json')
    bord0 = json.load(open(fb0, encoding='utf-8'))['calles'] if os.path.exists(fb0) else {}
    def signed_at(pts, P, sign):
        # (each kerb point's offset from the line, out on the kerb's own side, and where along it)
        cum = [0.0]
        for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        out = []
        for x, z in P:
            best = None
            for i in range(1, len(pts)):
                ax, az, bx, bz = pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]
                dx, dz = bx - ax, bz - az; l2 = dx * dx + dz * dz or 1e-9
                t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / l2))
                px, pz = ax + dx * t, az + dz * t
                d = math.hypot(x - px, z - pz)
                if best is None or d < best[0]:
                    l = math.sqrt(l2); o = ((x - px) * -dz + (z - pz) * dx) / l
                    best = (d, cum[i - 1] + t * l, o * sign)
            out.append((best[1], best[2]))
        return sorted(out)
    def interp(q, s):
        if s <= q[0][0]: return q[0][1]
        for i in range(1, len(q)):
            if s <= q[i][0]: return q[i - 1][1] + (q[i][1] - q[i - 1][1]) * (s - q[i - 1][0]) / max(1e-6, q[i][0] - q[i - 1][0])
        return q[-1][1]
    n_centre = 0
    for e in edges:
        bp = bord0.get(edge_key(e)) if 'osm' in e else None
        if not bp or not bp.get('centrar') or not bp.get('p') or not bp.get('m'): continue
        qp = signed_at(e['pts'], [v[:2] for v in bp['p']], 1)
        qm = signed_at(e['pts'], [v[:2] for v in bp['m']], -1)
        L = sum(math.hypot(e['pts'][i][0] - e['pts'][i - 1][0], e['pts'][i][1] - e['pts'][i - 1][1]) for i in range(1, len(e['pts'])))
        # (the middle between the two kerbs every 3 m, smoothed over 9 m: the line follows the street as it bends)
        cs = [(sv, (interp(qp, sv) - interp(qm, sv)) / 2) for sv in [k * 3.0 for k in range(int(L / 3) + 1)] + [L]]
        sm = []
        for i in range(len(cs)):
            w = [c for (sv, c) in cs[max(0, i - 1):i + 2]]
            sm.append((cs[i][0], sum(w) / len(w)))
        e['centre'] = sm
        d = sorted(c for _, c in sm)
        e['shift'] = d[len(d) // 2] or 1e-3
        e['centrar'] = True
        n_centre += 1
    if bord0: print('streets put back between their kerbs', n_centre)

    # recentre polylines between facades (node shifts averaged over incident edges)
    node_shift = defaultdict(list)
    n_follow = 0
    for e in edges:
        r = follow(e) if e['cls'] not in WALK else None
        if r:
            out, sa, sb, pl, pr = r
            node_shift[e['a']].append(sa); node_shift[e['b']].append(sb)
            e['pts'] = out
            e['follow'] = True
            med = lambda v: sorted(v)[len(v) // 2] if v else None
            if e.get('measured'):
                if pl: e['swp'] = max(0.0, med(pl))
                if pr: e['swm'] = max(0.0, med(pr))
            n_follow += 1
            continue
        S = e.get('shift', 0.0)
        if not e.get('centrar') and (not S or abs(S) < (0.05 if e.get('measured') else 0.25)): continue
        if e.get('centrar'):
            # (a line put back between its kerbs: every 3 m into their middle, bending to its junctions over the last 6 m
            # — the junctions, where other streets meet, stay where they are)
            pts = e['pts']
            cum = [0.0]
            for i in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
            L = cum[-1]
            n = max(2, int(math.ceil(L / 3.0)))
            out = []
            for k in range(n + 1):
                sv = L * k / n
                j = 1
                while j < len(cum) - 1 and cum[j] < sv: j += 1
                t = (sv - cum[j - 1]) / max(1e-9, cum[j] - cum[j - 1])
                dx, dz = pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]; dl = math.hypot(dx, dz) or 1
                tap = max(0.0, min(1.0, sv / 6.0, (L - sv) / 6.0))
                C = e['centre']
                c = C[-1][1]
                for qi in range(1, len(C)):
                    if sv <= C[qi][0]: c = C[qi - 1][1] + (C[qi][1] - C[qi - 1][1]) * (sv - C[qi - 1][0]) / max(1e-6, C[qi][0] - C[qi - 1][0]); break
                x, z = pts[j - 1][0] + dx * t, pts[j - 1][1] + dz * t
                out.append((x - dz / dl * c * tap, z + dx / dl * c * tap))
            e['pts'] = out
            continue
        pts = e['pts']
        newpts = []
        for i, p in enumerate(pts):
            a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
            dx, dz = b[0] - a[0], b[1] - a[1]
            dl = math.hypot(dx, dz) or 1
            nx, nz = -dz / dl, dx / dl
            if i == 0: node_shift[e['a']].append((nx * S, nz * S))
            elif i == len(pts) - 1: node_shift[e['b']].append((nx * S, nz * S))
            newpts.append((p[0] + nx * S, p[1] + nz * S))
        e['pts'] = newpts
    print('streets following their houses', n_follow)
    new_nodes = list(gnodes)
    for ni, lst in node_shift.items():
        sx = sum(v[0] for v in lst) / len(lst); sz = sum(v[1] for v in lst) / len(lst)
        new_nodes[ni] = (gnodes[ni][0] + sx, gnodes[ni][1] + sz)
    # snap endpoints to (moved) node positions for continuity
    for e in edges:
        pa = new_nodes[e['a']]; pb = new_nodes[e['b']]
        pts = list(e['pts'])
        pts[0] = pa; pts[-1] = pb
        e['pts'] = pts
    gnodes = new_nodes

    # the streets whose kerbs the review placed point by point (data/bordillos.json): their carriageway as wide as those
    # points make it, typically (traffic, parking, the junctions go by it; the kerbs themselves by the points)
    fb = os.path.join(DATA, 'bordillos.json')
    bord = json.load(open(fb, encoding='utf-8'))['calles'] if os.path.exists(fb) else {}
    def offsets(pts, P, sign):
        out = []
        for x, z in P:
            best = None
            for i in range(1, len(pts)):
                ax, az, bx, bz = pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]
                dx, dz = bx - ax, bz - az; l2 = dx * dx + dz * dz or 1e-9
                t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / l2))
                px, pz = ax + dx * t, az + dz * t
                d = math.hypot(x - px, z - pz)
                sd = 1 if (x - px) * -dz + (z - pz) * dx >= 0 else -1
                if best is None or d < best[0]: best = (d, sd)
            if best and best[1] == sign: out.append(best[0])
        return sorted(out)
    n_bord = 0
    for e in edges:
        bp = bord.get(edge_key(e)) if 'osm' in e else None
        if not bp: continue
        hp = offsets(e['pts'], [q[:2] for q in bp.get('p', [])], 1)
        hm = offsets(e['pts'], [q[:2] for q in bp.get('m', [])], -1)
        a = hp[len(hp) // 2] if hp else e['w'] / 2
        b = hm[len(hm) // 2] if hm else e['w'] / 2
        e['w'] = round(a + b, 1)
        n_bord += 1
    if bord: print('streets with their kerbs placed by hand', n_bord)

    # ---- areas
    AREA_KEYS = [('landuse', None), ('leisure', None), ('amenity', ('parking', 'school', 'college', 'marketplace', 'clinic', 'kindergarten')),
                 ('natural', ('water', 'heath', 'wood', 'scrub', 'grassland')), ('man_made', ('works', 'storage_tank', 'wastewater_plant')),
                 ('place', ('square',)), ('highway', ('pedestrian',))]
    areas = []

    def add_area(kind, ring, holes, name, extra=None):
        ring = dedupe_ring(ring)
        if len(ring) < 3: return
        a = area2(ring)
        if abs(a) < 3: return
        if a < 0: ring = ring[::-1]
        hs = []
        for h in holes:
            h = dedupe_ring(h)
            if len(h) >= 3:
                if area2(h) > 0: h = h[::-1]
                hs.append(h)
        c = centroid(ring)
        if not in_bounds(c[0], c[1], 400): return
        d = dict(k=kind, p=flat(ring), n=nm(name))
        if hs: d['h'] = [flat(h) for h in hs]
        if extra: d.update(extra)
        areas.append(d)

    for wid, (tg, nds) in ways.items():
        if len(nds) < 4 or nds[0] != nds[-1]:
            continue
        for key, allowed in AREA_KEYS:
            v = tg.get(key)
            if v and (allowed is None or v in allowed):
                if key == 'highway' and tg.get('area') != 'yes':
                    continue
                pts = [nodes[n] for n in nds if n in nodes]
                extra = {}
                if tg.get('sport'): extra['s'] = tg['sport']
                add_area(key + ':' + v, pts, [], tg.get('name', ''), extra)
                break
    # multipolygons
    def join_rings(members):
        segs = [list(m) for m in members if len(m) >= 2]
        rings = []
        while segs:
            cur = segs.pop(0)
            changed = True
            while cur[0] != cur[-1] and changed:
                changed = False
                for i, s in enumerate(segs):
                    if s[0] == cur[-1]: cur += s[1:]; segs.pop(i); changed = True; break
                    if s[-1] == cur[-1]: cur += s[::-1][1:]; segs.pop(i); changed = True; break
            if cur[0] == cur[-1] and len(cur) >= 4:
                rings.append(cur)
        return rings
    for rid, tg, mem in rels:
        if tg.get('type') != 'multipolygon': continue
        key = None
        for k, allowed in AREA_KEYS:
            if tg.get(k) and (allowed is None or tg[k] in allowed): key = k; break
        if not key: continue
        outers = [ways[ref][1] for t, ref, role in mem if t == 'way' and ref in ways and role == 'outer']
        inners = [ways[ref][1] for t, ref, role in mem if t == 'way' and ref in ways and role == 'inner']
        orings = join_rings(outers); irings = join_rings(inners)
        for o in orings:
            op = [nodes[n] for n in o if n in nodes]
            holes = []
            for ir in irings:
                ip = [nodes[n] for n in ir if n in nodes]
                if ip and point_in_ring(ip[0][0], ip[0][1], op): holes.append(ip)
            add_area(key + ':' + tg[key], op, holes, tg.get('name', ''))
    print('areas', len(areas), Counter(a['k'] for a in areas).most_common(40))

    # ---- waterways & power lines & barriers
    lines = []
    for wid, (tg, nds) in ways.items():
        k = None
        if tg.get('waterway') in ('stream', 'river', 'canal', 'ditch', 'drain'): k = 'water:' + tg['waterway']
        elif tg.get('power') in ('line', 'minor_line'): k = 'power:' + tg['power']
        elif tg.get('barrier') in ('wall', 'fence', 'hedge', 'retaining_wall'): k = 'barrier:' + tg['barrier']
        elif tg.get('railway'): k = 'rail:' + tg['railway']
        if not k: continue
        pts = [nodes[n] for n in nds if n in nodes]
        if len(pts) < 2: continue
        if not any(in_bounds(p[0], p[1], 300) for p in pts): continue
        lines.append(dict(k=k, p=flat(pts), n=nm(tg.get('name', ''))))
    print('lines', Counter(l['k'] for l in lines))

    # ---- POIs
    pois = []
    POI_KEYS = ('amenity', 'shop', 'tourism', 'office', 'craft', 'leisure', 'man_made', 'historic', 'emergency')
    for nid, tg in ntags.items():
        x, z = nodes[nid]
        if not in_bounds(x, z, 300): continue
        if tg.get('power') == 'pole':
            pois.append(dict(k='power:pole', x=q(x), z=q(z))); continue
        if tg.get('natural') == 'tree':
            pois.append(dict(k='natural:tree', x=q(x), z=q(z))); continue
        if tg.get('highway') in ('crossing', 'stop', 'give_way', 'traffic_signals'):
            pois.append(dict(k='highway:' + tg['highway'], x=q(x), z=q(z))); continue
        if tg.get('place') in ('locality',):
            pois.append(dict(k='place:locality', x=q(x), z=q(z), n=nm(tg.get('name', '')))); continue
        for key in POI_KEYS:
            if tg.get(key):
                pois.append(dict(k=key + ':' + tg[key], x=q(x), z=q(z), n=nm(tg.get('name', ''))))
                break
    for wid, (tg, nds) in ways.items():
        if 'highway' in tg: continue
        for key in ('amenity', 'shop', 'tourism', 'office', 'man_made', 'leisure', 'building'):
            if tg.get(key) and tg.get('name'):
                pts = [nodes[n] for n in nds if n in nodes]
                if len(pts) < 3: break
                c = centroid(dedupe_ring(pts)) if len(dedupe_ring(pts)) >= 3 else pts[0]
                if in_bounds(c[0], c[1], 300):
                    pois.append(dict(k=key + ':' + tg[key], x=q(c[0]), z=q(c[1]), n=nm(tg['name'])))
                break
    print('pois', len(pois))

    # ---- output
    # the kerbs the review of the photographs placed point by point (tools/aceras/puntos.py → data/bordillos.json): the
    # game lays them through those points (src/kerbs.js)
    fb = os.path.join(DATA, 'bordillos.json')
    bord = json.load(open(fb, encoding='utf-8'))['calles'] if os.path.exists(fb) else {}
    def edge_out(e):
        o = dict(a=e['a'], b=e['b'], p=flat(e['pts']), c=CLASS_CODE[e['cls']], w=q(e['w']), sw=q(e['sw']), o=e['ow'],
                 n=nm(e['name']), d=e['dirt'], f=q(e['facade']) if e.get('facade') else 0)
        bp = bord.get(edge_key(e)) if 'osm' in e else None
        if bp:
            o['kb'] = {sd: flat([tuple(v[:2]) for v in bp[sd]]) for sd in ('p', 'm') if bp.get(sd)}
        if e.get('measured'):
            # (measured: the pavement on each side, + along (−dz, dx) of the way a → b, − the other)
            o['m'] = 1
            if e.get('swp') is not None: o['sp'] = q(e['swp'])
            if e.get('swm') is not None: o['sm'] = q(e['swm'])
        return o
    out = dict(
        origin=[LAT0, LON0],
        bounds=[q(BX0), q(BZ0), q(BX1), q(BZ1)],
        names=names,
        nodes=flat(gnodes),
        edges=[edge_out(e) for e in edges],
        classes=list(CLASS_CODE.keys()),
        buildings=[dict(p=flat(b['ring']), h=[flat(h) for h in b['holes']] if b['holes'] else None, u=b['use'], y=b['year'],
                        f=b['floors'], a=round(b['area'])) for b in bl_out],
        parts=[dict(p=flat(p['ring']), h=[flat(h) for h in p['holes']] if p['holes'] else None, f=p['floors'], b=p['b']) for p in part_out],
        areas=areas,
        lines=lines,
        pois=pois,
    )
    for b in out['buildings']:
        if b['h'] is None: del b['h']
    for p in out['parts']:
        if p['h'] is None: del p['h']
    fn = os.path.join(DATA, 'map.json')
    with open(fn, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    # (for tools/aceras: which street of the game, by its index, is which in OpenStreetMap)
    os.makedirs(os.path.join(ROOT, '.cache', 'aceras'), exist_ok=True)
    with open(os.path.join(ROOT, '.cache', 'aceras', 'edge_keys.json'), 'w') as f:
        json.dump([edge_key(e) if 'osm' in e else None for e in edges], f)
    print('wrote', fn, os.path.getsize(fn) // 1024, 'KB')
    print('bounds m', BX0, BZ0, BX1, BZ1)


if __name__ == '__main__':
    main()
