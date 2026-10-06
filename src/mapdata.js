// Decodes the compact map (OSM + Catastro) into runtime structures: road graph, building data, areas, POIs.
import { polyCum, polySample, polyNearest, ringArea, ringCentroid, clamp } from './util.js';
import { StaticCollider, PolyIndex } from './collision.js';

const DRIVE_CLASSES = new Set(['primary', 'primary_link', 'secondary', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'track']);
const WALK_ONLY = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway']);

const dec = (arr) => {
  const f = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) f[i] = arr[i] / 10;
  return f;
};

export class MapData {
  constructor(raw) {
    this.raw = raw;
    this.names = raw.names;
    const [x0, z0, x1, z1] = raw.bounds.map((v) => v / 10);
    this.bounds = { x0, z0, x1, z1 };
    this.decodeGraph();
    this.decodeBuildings();
    this.flagBlockedEdges();
    this.clearStreets();
    this.areas = raw.areas.map((a) => ({ kind: a.k, ring: dec(a.p), holes: a.h ? a.h.map(dec) : null, name: a.n >= 0 ? this.names[a.n] : '', sport: a.s || '' }));
    this.lines = raw.lines.map((l) => ({ kind: l.k, pts: dec(l.p), name: l.n >= 0 ? this.names[l.n] : '' }));
    this.pois = raw.pois.map((p) => ({ kind: p.k, x: p.x / 10, z: p.z / 10, name: p.n !== undefined && p.n >= 0 ? this.names[p.n] : '' }));
    this.buildAreaIndex();
  }

  // ---------------------------------------------------------------- road graph
  decodeGraph() {
    const raw = this.raw;
    const nn = raw.nodes.length / 2;
    this.nodes = [];
    for (let i = 0; i < nn; i++) this.nodes.push({ id: i, x: raw.nodes[i * 2] / 10, z: raw.nodes[i * 2 + 1] / 10, edges: [], radius: 0 });
    this.edges = raw.edges.map((e, i) => {
      const pts = dec(e.p);
      const cum = polyCum(pts);
      const cls = raw.classes[e.c];
      const ed = {
        id: i, a: e.a, b: e.b, pts, cum, len: cum[cum.length - 1], cls,
        w: e.w / 10, sw: e.sw / 10, oneway: e.o, name: e.n >= 0 ? this.names[e.n] : '', dirt: !!e.d, facade: e.f / 10,
        drive: DRIVE_CLASSES.has(cls), walk: true, walkOnly: WALK_ONLY.has(cls),
      };
      ed.speed = { primary: 12.5, secondary: 12, tertiary: 11, primary_link: 8.5, tertiary_link: 8.5, unclassified: 9, residential: 7.5, living_street: 5, service: 5, track: 7 }[cls] || 6; // (town speeds: 30–45 km/h)
      if (ed.w < 5.2 && ed.speed > 6.5) ed.speed = 6.5;
      return ed;
    });
    for (const e of this.edges) {
      if (e.len < 0.5) continue;
      this.nodes[e.a].edges.push(e.id);
      if (e.b !== e.a) this.nodes[e.b].edges.push(e.id);
    }
    for (const n of this.nodes) {
      let r = 0;
      for (const ei of n.edges) r = Math.max(r, this.edges[ei].w * 0.5);
      n.radius = r;
      n.degree = n.edges.length;
    }
    // edge spatial grid (for nearest-edge queries)
    const { x0, z0, x1, z1 } = this.bounds;
    this.eg = { x0: x0 - 300, z0: z0 - 300, cell: 25 };
    this.eg.nx = Math.ceil((x1 - x0 + 600) / 25) + 1;
    this.eg.nz = Math.ceil((z1 - z0 + 600) / 25) + 1;
    this.eg.cells = new Map();
    for (const e of this.edges) {
      const p = e.pts;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        const pad = e.w * 0.5 + 2;
        const cx0 = this.egc(Math.min(ax, bx) - pad, 'x'), cx1 = this.egc(Math.max(ax, bx) + pad, 'x');
        const cz0 = this.egc(Math.min(az, bz) - pad, 'z'), cz1 = this.egc(Math.max(az, bz) + pad, 'z');
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
          const k = cz * 10000 + cx;
          let a = this.eg.cells.get(k);
          if (!a) this.eg.cells.set(k, (a = []));
          if (a[a.length - 1] !== e.id) a.push(e.id);
        }
      }
    }
  }
  egc(v, ax) {
    const g = this.eg;
    return clamp(Math.floor((v - (ax === 'x' ? g.x0 : g.z0)) / g.cell), 0, (ax === 'x' ? g.nx : g.nz) - 1);
  }
  edgesNear(x, z, r = 0) {
    const g = this.eg;
    const out = new Set();
    const cx0 = this.egc(x - r, 'x'), cx1 = this.egc(x + r, 'x'), cz0 = this.egc(z - r, 'z'), cz1 = this.egc(z + r, 'z');
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const a = g.cells.get(cz * 10000 + cx);
      if (a) for (const id of a) out.add(id);
    }
    return out;
  }
  // nearest edge (optionally filtered) within radius r
  nearestEdge(x, z, r = 40, filter = null) {
    let best = null;
    for (const id of this.edgesNear(x, z, r)) {
      const e = this.edges[id];
      if (filter && !filter(e)) continue;
      const q = polyNearest(e.pts, e.cum, x, z);
      if (q.d <= r && (!best || q.d < best.d)) best = { edge: e, s: q.s, d: q.d, x: q.x, z: q.z };
    }
    if (!best && r < 400) return this.nearestEdge(x, z, r * 3, filter);
    return best;
  }
  sample(e, s, out = {}) { return polySample(e.pts, e.cum, s, out); }
  // the drivable street whose carriageway covers (x, z), or null. pad widens every carriageway (a kerb margin);
  // core leaves out the 2.2 m parking lane of wide streets (the travel lanes only); except skips one edge
  roadAt(x, z, pad = 0, core = false, except = null) {
    let best = null, bd = 0;
    for (const id of this.edgesNear(x, z, 0)) {
      const e = this.edges[id];
      if (!e.drive || e.blocked || e === except || e.len < 0.5) continue;
      const half = e.w / 2 - (core && e.w >= 7 && !e.dirt ? 2.2 : 0) + pad;
      const d = polyNearest(e.pts, e.cum, x, z).d - half;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // A few Catastro footprints poke across an OSM street's centreline (a corner or a whole side a metre or two out):
  // cars and walkers met a wall in the middle of the street. Pull those vertices back to leave a 2 m lane each side
  // of the centreline (only there: facades inside a street's nominal width are normal in the old town).
  clearStreets() {
    const CLEAR = 2.0;
    const fix = (ring, e) => {
      let moved = 0;
      const side = this._sideOf.get(ring);
      for (let i = 0; i < ring.length; i += 2) {
        const q = polyNearest(e.pts, e.cum, ring[i], ring[i + 1]);
        if (q.d > 4 || q.s < 0.3 || q.s > e.len - 0.3) continue;
        const t = polySample(e.pts, e.cum, q.s, {});
        const nx = -t.dz * side, nz = t.dx * side;
        // lateral position on the building's own side (negative: across the centreline)
        if ((ring[i] - q.x) * nx + (ring[i + 1] - q.z) * nz >= CLEAR - 0.1) continue;
        ring[i] = q.x + nx * CLEAR; ring[i + 1] = q.z + nz * CLEAR;
        moved++;
      }
      return moved;
    };
    this._sideOf = new Map();
    const tmp = {};
    this.streetFixes = [];
    for (const e of this.edges) {
      if (!e.drive || e.blocked || e.len < 2) continue;
      const hit = new Set();
      for (let s = 0.4; s < e.len - 0.4; s += 0.5) {
        polySample(e.pts, e.cum, s, tmp);
        for (const off of [-1.2, 0, 1.2]) {
          const b = this.buildingAt(tmp.x - tmp.dz * off, tmp.z + tmp.dx * off);
          if (b) hit.add(b);
        }
      }
      for (const b of hit) {
        // which side of the street the building stands on: where most of its outline is
        let acc = 0;
        for (let i = 0; i < b.ring.length; i += 2) {
          const q = polyNearest(e.pts, e.cum, b.ring[i], b.ring[i + 1]);
          const t = polySample(e.pts, e.cum, q.s, tmp);
          acc += (b.ring[i] - q.x) * -t.dz + (b.ring[i + 1] - q.z) * t.dx;
        }
        const side = acc >= 0 ? 1 : -1;
        const rings = [b.ring, ...(b.holes || [])];
        for (const p of this.parts) if (p.b === b.id) rings.push(p.ring, ...(p.holes || []));
        let n = 0;
        for (const r of rings) { this._sideOf.set(r, side); n += fix(r, e); }
        if (n) { b.c = ringCentroid(b.ring); this.streetFixes.push({ edge: e.id, b: b.id, n }); }
      }
    }
    this._sideOf = null;
  }
  // a few OSM streets run under Catastro buildings (data mismatch): nobody drives or walks those
  flagBlockedEdges() {
    const tmp = {};
    for (const e of this.edges) {
      if (!e.drive && !e.walk) continue;
      let inside = 0, n = 0;
      for (let s = 1; s < e.len - 1; s += 1.5, n++) { polySample(e.pts, e.cum, s, tmp); if (this.buildingAt(tmp.x, tmp.z)) inside++; }
      if (inside >= 6 && inside / Math.max(1, n) > 0.2) e.blocked = true;
    }
  }
  otherEnd(e, node) { return e.a === node ? e.b : e.a; }
  // can a car travel along edge e leaving node `from`?
  canDrive(e, from) {
    if (!e.drive || e.blocked) return false;
    if (e.oneway === 0) return true;
    const forward = e.a === from;
    return e.oneway === 1 ? forward : !forward;
  }

  // A* over drivable graph. Returns array of {edge, dir} or null.
  findPath(fromNode, toNode, opts = {}) {
    if (fromNode === toNode) return [];
    const N = this.nodes.length;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const cameDir = new Int8Array(N);
    const closed = new Uint8Array(N);
    const tgt = this.nodes[toNode];
    const h = (i) => Math.hypot(this.nodes[i].x - tgt.x, this.nodes[i].z - tgt.z);
    const open = [fromNode];
    g[fromNode] = 0; f[fromNode] = h(fromNode);
    const ignoreOneway = !!opts.ignoreOneway;
    const can = opts.can || ((e, cur) => this.canDrive(e, cur));
    const avoid = opts.avoid || null;
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (cur === toNode) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      for (const ei of this.nodes[cur].edges) {
        const e = this.edges[ei];
        if (!e.drive) continue;
        if (!ignoreOneway && !can(e, cur)) continue;
        if (avoid && avoid(e)) continue;
        const nxt = this.otherEnd(e, cur);
        const w = (e.cls === 'track' ? 1.8 : e.cls === 'service' ? 1.4 : e.cls === 'primary' ? 0.8 : 1) * (opts.weight ? opts.weight(e) : 1);
        const ein = came[cur] >= 0 ? this.edges[came[cur]] : cur === fromNode ? opts.startEdge : null; // (the street they come in by)
        const tc = opts.turnCost && ein ? opts.turnCost(ein, e, cur) : 0; // (metres more for the turn)
        if (tc === Infinity) continue;
        const ng = g[cur] + e.len * w + tc;
        if (ng < g[nxt]) {
          g[nxt] = ng; f[nxt] = ng + h(nxt); came[nxt] = ei; cameDir[nxt] = e.a === cur ? 1 : -1;
          open.push(nxt);
        }
      }
    }
    if (came[toNode] < 0) return null;
    const path = [];
    let n = toNode;
    let guard = 0;
    while (n !== fromNode && guard++ < 5000) {
      const ei = came[n];
      if (ei < 0) return null;
      const e = this.edges[ei];
      path.push({ edge: e, dir: cameDir[n] });
      n = cameDir[n] === 1 ? e.a : e.b;
    }
    return path.reverse();
  }
  // Road-following route from a position/heading to a target: partial current edge + A* + partial last edge.
  routeFrom(x, z, heading, tx, tz, opts = {}) {
    const a = this.nearestEdge(x, z, 80, (e) => e.drive && !e.blocked);
    const b = this.nearestEdge(tx, tz, 150, (e) => e.drive && !e.blocked);
    if (!a || !b) return [x, z, tx, tz];
    const ad = polySample(a.edge.pts, a.edge.cum, a.s, {});
    const fwd = heading === null ? true : Math.sin(heading) * ad.dx + Math.cos(heading) * ad.dz >= 0;
    const out = [x, z];
    const partial = (e, s, towardB, fromPoint) => {
      // points of e between arc-length s and the end node (towardB) or start node
      const p = e.pts, c = e.cum, n = c.length;
      const pts = [];
      if (towardB) { for (let i = 0; i < n; i++) if (c[i] > s) pts.push(p[i * 2], p[i * 2 + 1]); }
      else { for (let i = n - 1; i >= 0; i--) if (c[i] < s) pts.push(p[i * 2], p[i * 2 + 1]); }
      return pts;
    };
    if (a.edge === b.edge && ((fwd && b.s >= a.s) || (!fwd && b.s <= a.s))) {
      const p = a.edge.pts, c = a.edge.cum;
      for (let i = 0; i < c.length; i++) {
        const k = fwd ? i : c.length - 1 - i;
        if ((fwd && c[k] > a.s && c[k] < b.s) || (!fwd && c[k] < a.s && c[k] > b.s)) out.push(p[k * 2], p[k * 2 + 1]);
      }
      out.push(b.x, b.z, tx, tz);
      return out;
    }
    out.push(...partial(a.edge, a.s, fwd));
    const na = fwd ? a.edge.b : a.edge.a;
    const nb = b.s < b.edge.len / 2 ? b.edge.a : b.edge.b;
    const path = this.findPath(na, nb, opts);
    if (path) out.push(...this.pathPolyline(path));
    // last edge: from node nb to the projection of the target
    {
      const e = b.edge, p = e.pts, c = e.cum, n = c.length;
      if (nb === e.a) { for (let i = 0; i < n; i++) if (c[i] > 0 && c[i] < b.s) out.push(p[i * 2], p[i * 2 + 1]); }
      else { for (let i = n - 1; i >= 0; i--) if (c[i] < e.len && c[i] > b.s) out.push(p[i * 2], p[i * 2 + 1]); }
    }
    out.push(b.x, b.z, tx, tz);
    return out;
  }
  // Flat polyline [x,z,...] for a path starting from a point on an edge
  pathPolyline(path) {
    const out = [];
    for (const { edge, dir } of path) {
      const p = edge.pts;
      const n = p.length / 2;
      for (let k = 0; k < n; k++) {
        const i = dir === 1 ? k : n - 1 - k;
        out.push(p[i * 2], p[i * 2 + 1]);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- buildings
  decodeBuildings() {
    const raw = this.raw;
    const { x0, z0, x1, z1 } = this.bounds;
    this.buildings = raw.buildings.map((b, i) => {
      const ring = dec(b.p);
      return { id: i, ring, holes: b.h ? b.h.map(dec) : null, use: b.u, year: b.y, floors: b.f, area: b.a, c: ringCentroid(ring), height: 0 };
    });
    this.parts = raw.parts.map((p, i) => {
      const ring = dec(p.p);
      return { id: i, ring, holes: p.h ? p.h.map(dec) : null, floors: p.f, b: p.b, c: ringCentroid(ring), area: Math.abs(ringArea(ring)) };
    });
    this.collider = new StaticCollider(x0 - 400, z0 - 400, x1 + 400, z1 + 400, 8);
    this.bIndex = new PolyIndex(x0 - 400, z0 - 400, x1 + 400, z1 + 400, 16);
    for (const b of this.buildings) this.bIndex.add(b.ring, b);
  }
  buildingAt(x, z) { const p = this.bIndex.find(x, z); return p ? p.data : null; }
  // once the town is built, "inside a building" means inside what is drawn of it (its parts), not its whole outline
  useDrawnParts(parts) {
    const { x0, z0, x1, z1 } = this.bounds;
    const ix = new PolyIndex(x0 - 400, z0 - 400, x1 + 400, z1 + 400, 16);
    for (const p of parts) if (p.b >= 0) ix.add(p.ring, this.buildings[p.b]);
    this.bIndex = ix;
  }

  // ---------------------------------------------------------------- areas
  buildAreaIndex() {
    const { x0, z0, x1, z1 } = this.bounds;
    this.aIndex = new PolyIndex(x0 - 500, z0 - 500, x1 + 500, z1 + 500, 32);
    // smaller areas first so that lookups return the most specific one
    const sorted = [...this.areas].sort((a, b) => Math.abs(ringArea(a.ring)) - Math.abs(ringArea(b.ring)));
    for (const a of sorted) this.aIndex.add(a.ring, a);
    this.urban = this.areas.filter((a) => a.kind === 'landuse:residential');
  }
  areaAt(x, z) { const p = this.aIndex.find(x, z); return p ? p.data : null; }
  inTown(x, z) {
    for (const a of this.urban) {
      const r = a.ring;
      // cheap bbox reject is inside PolyIndex; here small list
      if (pipFlat(x, z, r)) return true;
    }
    return false;
  }
  poiNamed(re) { return this.pois.find((p) => re.test(p.name)); }
}

function pipFlat(x, z, r) {
  let ins = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
