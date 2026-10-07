// Fachadas medidas: houses modelled one by one from photographs of their street, as they are — every door, window,
// balcony, garage and shop front where it is and of its size, each band of paint and each plinth, the mouldings and
// cornices, the grilles, shutters, railings, steps, numbers, mailboxes, lamps and cables. A street's data (malfeitos.js)
// gives every front in metres: along its wall from its left end as seen from the street (u) and up from the pavement
// (y). This module finds those walls among the Catastro footprints, cuts the real holes into them where the openings
// are (buildings.js hands it the wall runs: emitMeasuredRun) and builds the 3D details around the camera
// (FacadeDetails.addBuild: buildMeasuredDetails), in both looks.
import { CT, PAT, frameRect, persiana, flowerPot, awning, acUnit, laundry } from './facades.js';
import { FACADE_STYLES, FACADE_LAYERS_PER_STYLE } from './textures.js';
import { STYLE as LOOK } from './style.js';
import { clamp, mulberry32, ringArea, ringCentroid } from './util.js';

const LAYER = Object.fromEntries(FACADE_STYLES.map((s, i) => [s, i * FACADE_LAYERS_PER_STYLE]));
// what a wall is made of → the painted layer it starts from (white for paint: its colour is then the tint)
const MAT = {
  cal: { style: 'color', seed: 0.55 },        // smooth lime plaster or paint
  rugoso: { style: 'trad_verde', seed: 0.12 }, // rough render (the rough plaster scan)
  ladrillo: { style: 'ladrillo', seed: 0.5 },  // brick
  piedra: { style: 'piedra', seed: 0.5 },      // granite ashlar
};
const NORECT = [0, 0, 0, 0];

// ------------------------------------------------------------------ colour
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
// a colour as seen (sRGB hex) → linear light (the walls' tint multiplies the linear texture)
export function lin(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [s2l(((v >> 16) & 255) / 255), s2l(((v >> 8) & 255) / 255), s2l((v & 255) / 255)];
}
const toBytes = (l, k = 1) => [clamp(Math.round(l[0] * k * 255), 0, 255), clamp(Math.round(l[1] * k * 255), 0, 255), clamp(Math.round(l[2] * k * 255), 0, 255)];
// the 3D details' vertex colours: the trim material reads them as linear light
export const vc = (hex, k = 1) => toBytes(lin(hex), k);
// paint on masonry (surrounds, bands, cornices, balcony slabs): in the claymation the walls' shader warms and deepens
// every wall colour by how light it is (materials.js, CLAY); the details made of the same paint take the same, so a
// surround and the band of wall it frames stay one colour
function clayWall(l) {
  const lum = l[0] * 0.2126 + l[1] * 0.7152 + l[2] * 0.0722;
  const t = clamp((lum - 0.35) / 0.35, 0, 1), s = t * t * (3 - 2 * t);
  return [l[0] * (0.93 + (0.6 - 0.93) * s), l[1] * (0.83 + (0.49 - 0.83) * s), l[2] * (0.72 + (0.47 - 0.72) * s)];
}
export const paintC = (hex, k = 1) => toBytes(LOOK.plastilina ? clayWall(lin(hex)) : lin(hex), k);

// ------------------------------------------------------------------ data → the town's walls
// street: { name, houses }. A house is measured along its street: side 'E' or 'W' of the street (as the street runs from
// its first node), s0..s1 its frontage in metres along the street's centreline from that node, and every x in its data
// in metres from its left end as seen from the street (the end at s0 on the east side, at s1 on the west side). The
// Catastro's walls along the street are found here (every part's wall facing the street, the frontmost) and each house
// is laid on the walls under its frontage — a house's front may span two Catastro buildings, or share one
const XK = new Set(['x', 'x0', 'x1']);
function mapX(o, f) {
  if (Array.isArray(o)) return o.map((v) => mapX(v, f));
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (XK.has(k) && typeof v === 'number') r[k] = f(v);
    else if (k === 'pts') r[k] = v.map(([x, y]) => [f(x), y]);
    else if (k === 'posts') r[k] = v.map(f);
    else if (k === 'list') r[k] = v.map((q) => [f(q[0]), ...q.slice(1)]);
    else r[k] = mapX(v, f);
  }
  return r;
}
// the x extent of everything in a house's data (its features may reach past its frontage: a neighbour's overhang)
function extentOf(o, acc = [Infinity, -Infinity]) {
  if (Array.isArray(o)) { for (const v of o) extentOf(v, acc); return acc; }
  if (!o || typeof o !== 'object') return acc;
  for (const [k, v] of Object.entries(o)) {
    if (XK.has(k) && typeof v === 'number') { acc[0] = Math.min(acc[0], v); acc[1] = Math.max(acc[1], v); }
    else if (k === 'pts') for (const [x] of v) { acc[0] = Math.min(acc[0], x); acc[1] = Math.max(acc[1], x); }
    else if (typeof v === 'object') extentOf(v, acc);
  }
  return acc;
}
const centreX = (q) => (typeof q.x === 'number' ? q.x : typeof q.x0 === 'number' && typeof q.x1 === 'number' ? (q.x0 + q.x1) / 2 : q.pts ? q.pts.reduce((a, p) => a + p[0], 0) / q.pts.length : null);

export function resolveMeasured(map, street) {
  const warn = [];
  // ---- the street's centreline, its edges chained from its first node
  const E = map.edges.filter((e) => e.name === street.name && e.len > 0.5);
  const byNode = new Map();
  for (const e of E) for (const n of [e.a, e.b]) { if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push(e); }
  let start = E[0] && E[0].a;
  for (const e of E) if ((byNode.get(e.a) || []).length === 1 && e === E.find((q) => q.a === e.a || q.b === e.a)) { start = e.a; break; }
  if (street.start != null) start = street.start;
  const pts = []; const used = new Set(); let node = start;
  for (;;) {
    const e = (byNode.get(node) || []).find((q) => !used.has(q));
    if (!e) break;
    used.add(e);
    const p = e.pts, n = p.length / 2, fwd = e.a === node;
    for (let k = 0; k < n; k++) { const i = fwd ? k : n - 1 - k; if (pts.length && k === 0) continue; pts.push(p[i * 2], p[i * 2 + 1]); }
    node = fwd ? e.b : e.a;
  }
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  const total = cum[cum.length - 1];
  const where = (x, z) => { // s along the street, distance from it, side (E: right of the way it runs)
    let best = null;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], az = pts[i + 1], dx = pts[i + 2] - ax, dz = pts[i + 3] - az, L = Math.hypot(dx, dz) || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (L * L), 0, 1), px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, s: cum[i / 2] + t * L, lat: ((x - px) * dz - (z - pz) * dx) / L, tx: dx / L, tz: dz / L, px, pz };
    }
    return best;
  };
  // ---- the walls along it: every part's wall facing the street, parallel to it, 0.5-8 m from its middle line
  const findWalls = () => {
  const walls = [];
  for (const p of map.parts) {
    const r = p.ring, n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.8) continue;
      const q = where((ax + bx) / 2, (az + bz) / 2);
      if (!q || q.d < 0.5 || q.d > 8 || q.s < -3 || q.s > total + 3) continue;
      let tx = (bx - ax) / L, tz = (bz - az) / L;
      if (Math.abs(tx * q.tx + tz * q.tz) < 0.8) continue;
      // the wall's outward normal (buildings.js: (dz, -dx) on the rings) must face the street's middle
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, cx = q.px - mx, cz = q.pz - mz, cl = Math.hypot(cx, cz) || 1;
      const ox = tz, oz = -tx;
      if ((ox * cx + oz * cz) / cl < 0.6) continue;
      const side = q.lat > 0 ? 'E' : 'W';
      const sa0 = where(ax, az).s, sb0 = where(bx, bz).s;
      // a: the left end seen from the street, so that the outward normal is (-tz, tx): the ring's edge reversed
      [ax, az, bx, bz] = [bx, bz, ax, az]; tx = -tx; tz = -tz;
      const sa = where(ax, az).s, sb = where(bx, bz).s;
      walls.push({ p, bid: p.b, pid: p.id, side, ax, az, bx, bz, L, tx, tz, nx: -tz, nz: tx, sa, sb, smin: Math.min(sa0, sb0), smax: Math.max(sa0, sb0), d: q.d });
    }
  }
  // the frontmost: a wall mostly behind a nearer one (by more than 0.8 m) is not a street front
  return walls.filter((w) => !walls.some((o) => o !== w && o.side === w.side && o.d < w.d - 0.8 && Math.min(o.smax, w.smax) - Math.max(o.smin, w.smin) > 0.5 * (w.smax - w.smin)));
  };
  let front = findWalls();
  // ---- the gaps the Catastro leaves where the pictures show a house (a parcel recorded empty): a building is put there,
  // its front on the line between the two neighbours' corners, its parts one behind the other as given (d0..d1 metres
  // back from the front, each with its height), never deeper than the plot (the next building behind)
  const parts = new Map();
  for (const g of street.gaps || []) {
    const near = (s0, end) => { // the corner of a front wall of that side at s (end: the wall ends there, or starts)
      let best = null;
      for (const w of front) {
        if (w.side !== g.side) continue;
        for (const [x, z, s] of [[w.ax, w.az, w.sa], [w.bx, w.bz, w.sb]]) {
          const d = Math.abs(s - s0);
          if (d < 1.2 && (!best || d < best.d)) best = { x, z, d };
        }
      }
      return best;
    };
    const A = near(g.s0), B = near(g.s1);
    if (!A || !B) { warn.push(`hueco ${g.s0}-${g.s1}: sin vecinos`); continue; }
    const fx = B.x - A.x, fz = B.z - A.z, fl = Math.hypot(fx, fz) || 1;
    // inward: away from the street's middle line
    const mid = where((A.x + B.x) / 2, (A.z + B.z) / 2);
    let ix = -fz / fl, iz = fx / fl;
    if (ix * (mid.px - (A.x + B.x) / 2) + iz * (mid.pz - (A.z + B.z) / 2) > 0) { ix = -ix; iz = -iz; }
    let dmax = Math.max(...g.parts.map((q) => q.d1));
    for (let d = 0.6; d <= dmax; d += 0.3) { // (as deep as the plot: stop before the next building)
      const x = (A.x + B.x) / 2 + ix * d, z = (A.z + B.z) / 2 + iz * d;
      if (map.buildingAt(x, z)) { dmax = d - 0.3; break; }
    }
    const quad = (d0, d1) => {
      const r = [A.x + ix * d0, A.z + iz * d0, B.x + ix * d0, B.z + iz * d0, B.x + ix * d1, B.z + iz * d1, A.x + ix * d1, A.z + iz * d1];
      if (ringArea(r) < 0) return [r[6], r[7], r[4], r[5], r[2], r[3], r[0], r[1]];
      return r;
    };
    const ring = quad(0, dmax), floors = Math.max(...g.parts.map((q) => Math.round((q.H || 3.1) / 3.1)));
    const b = { id: map.buildings.length, ring, holes: null, use: 0, year: 1970, floors, area: Math.abs(ringArea(ring)), c: ringCentroid(ring), height: 0, infill: true, measuredGap: true };
    map.buildings.push(b);
    map.bIndex.add(ring, b);
    for (const q of g.parts) {
      const d0 = Math.min(q.d0, dmax - 0.5), d1 = Math.min(q.d1, dmax);
      if (d1 - d0 < 0.5) continue;
      const r = quad(d0, d1), id = map.parts.length;
      map.parts.push({ id, ring: r, holes: null, floors: Math.max(1, Math.round((q.H || 3.1) / 3.1)), b: b.id, c: ringCentroid(r), area: Math.abs(ringArea(r)) });
      parts.set(id, { H: q.H || 3.1, roof: q.roof || 'flat', parapet: q.parapet ?? 0 });
    }
  }
  if (street.gaps && street.gaps.length) front = findWalls();
  // ---- the houses laid on them: per wall, one front's data in its own metres (u from its a)
  // (the street's own lanterns replace the town's only once its houses carry them)
  const fronts = [], byB = new Map(), lampEdges = new Set(street.houses.some((h) => (h.extra || []).some((e) => e.k === 'lamp')) ? [street.name] : []);
  for (const w of front) {
    const k = w.L / Math.max(0.01, Math.abs(w.sb - w.sa));
    const toU = w.side === 'E' ? (h) => (x) => (x + h.s0 - w.sa) * k : (h) => (x) => (w.sa - h.s1 + x) * k;
    const xr = (h, u) => (w.side === 'E' ? u / k + w.sa - h.s0 : u / k - w.sa + h.s1); // (a wall u → the house's x)
    const spec = { wall: null, paint: [], relief: [], open: [], extra: [], top: { rails: [], balusters: [], posts: [] }, H: 0 };
    let bestCover = 0, base = [], own = [];
    for (const h of street.houses) {
      if (h.side !== w.side) continue;
      const [e0, e1] = extentOf([h.paint, h.relief, h.open, h.extra, h.top]);
      const hs0 = h.side === 'E' ? h.s0 + Math.min(0, e0) : h.s1 - Math.max(h.s1 - h.s0, e1), hs1 = h.side === 'E' ? h.s0 + Math.max(h.s1 - h.s0, e1) : h.s1 - Math.min(0, e0);
      if (Math.min(hs1, w.smax) - Math.max(hs0, w.smin) <= 0.02) continue;
      const f = toU(h), cover = Math.min(h.s1, w.smax) - Math.max(h.s0, w.smin);
      if (cover > bestCover) { bestCover = cover; spec.wall = h.wall; spec.mat = h.mat; spec.mult = h.mult; spec.side = h.sideCol || h.wall; spec.house = h; }
      if (cover > 0.02) {
        base.push({ x0: f(0), x1: f(h.s1 - h.s0), y0: -1, y1: 99, col: h.wall, mat: h.mat, mult: h.mult });
        // (the wall's own height: the house's, or the one of its steps that holds the wall's middle)
        const mid = xr(h, w.L / 2), st = (h.heights || []).find((q) => mid >= q.x0 && mid <= q.x1);
        const HH = st ? st.H : h.H || 0;
        if (cover >= bestCover - 1e-6) { spec.H = HH; spec.roof = st ? st.roof || h.roof : h.roof; spec.parapet = st ? st.parapet ?? h.parapet : h.parapet; }
      }
      own.push(...mapX(h.paint || [], f));
      // every other feature goes to the wall its middle stands on; an opening is also cut into every wall it crosses
      // (a garage straddling two houses), its door and grille built once, on the wall of its middle
      const mine = (q) => { const c = centreX(q); if (c == null) return cover > 0.02; const u = f(c); return u >= -0.01 && u <= w.L + 0.01; };
      for (const key of ['relief', 'extra']) for (const q of h[key] || []) if (mine(q)) spec[key].push(mapX(q, f));
      for (const q of h.open || []) {
        const own = mine(q), u0 = f(q.x0), u1 = f(q.x1);
        if (own) spec.open.push(mapX(q, f));
        else if (Math.max(u0, u1) > 0.02 && Math.min(u0, u1) < w.L - 0.02) spec.open.push({ ...mapX(q, f), ghost: true });
      }
      if (h.top) {
        const T = mapX(h.top, f);
        if (T.coping && mine(h.top.coping)) spec.top.coping = T.coping;
        for (const key of ['rails', 'balusters', 'posts']) (T[key] || []).forEach((q, i) => { if (mine(h.top[key][i])) spec.top[key].push(q); });
        if (T.pergola && mine(h.top.pergola)) spec.top.pergola = T.pergola;
      }
      void xr;
    }
    if (!spec.wall) continue;
    spec.paint = [...base, ...own];
    const F = { spec, bid: w.bid, pid: w.pid, ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, L: w.L, tx: w.tx, tz: w.tz, nx: w.nx, nz: w.nz, H: spec.H, side: w.side, sa: w.sa, sb: w.sb };
    fronts.push(F);
    if (!byB.has(w.bid)) byB.set(w.bid, []);
    byB.get(w.bid).push(F);
    if (spec.H) { const prev = parts.get(w.pid); if (!prev || spec.H > prev.H) parts.set(w.pid, { H: spec.H, roof: spec.roof || 'flat', parapet: spec.parapet ?? 0 }); }
  }
  // parts given by a point (the back of a house, a terrace): their height and roof
  for (const h of street.houses) for (const pp of h.parts || []) {
    const [x, z] = pp.at;
    for (const p of map.parts) {
      const r = p.ring;
      let ins = false;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
      }
      if (ins) { parts.set(p.id, pp); break; }
    }
  }
  return { fronts, byB, parts, lampEdges, warn, walls: front, where };
}

// does a wall run of a part (buildings.js) lie on a measured front? → { F, ua, ub } (the front's u at the run's ends)
export function matchRun(list, run) {
  if (!list) return null;
  const x0 = run.ax + run.dx * run.t0, z0 = run.az + run.dz * run.t0, x1 = run.ax + run.dx * run.t1, z1 = run.az + run.dz * run.t1;
  for (const F of list) {
    if (run.nx * F.nx + run.nz * F.nz < 0.97) continue;
    const off = (q, w) => (q - F.ax) * F.nx + (w - F.az) * F.nz; // distance in front of the front's line
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (Math.abs(off(mx, mz)) > 0.45) continue;
    const ua = (x0 - F.ax) * F.tx + (z0 - F.az) * F.tz, ub = (x1 - F.ax) * F.tx + (z1 - F.az) * F.tz;
    if (Math.max(ua, ub) < 0.05 || Math.min(ua, ub) > F.L - 0.05) continue;
    return { F, ua, ub };
  }
  return null;
}

// ------------------------------------------------------------------ the wall: real holes where the openings are
// Each opening gets its own «cell» (3.2 × 3.1 m, the size the building shader assumes) so the shader's touches work
// round it as round any window of the town: the wall curling into the opening in the claymation, the grime washed
// down from the sill, a room behind the glass, its light at night.
const HOLE_KINDS = { win: CT.WIN_U, balc: CT.WIN_U, door: CT.DOOR, gar: CT.GARAGE, gate: CT.DOOR, shop: CT.SHOP, hueco: CT.DOOR };
function zonesOf(S) {
  const base = { col: S.wall, mat: S.mat || 'cal', mult: S.mult };
  const z = [];
  for (const q of S.paint || []) {
    if (q.notch) { // a panel with its corners cut: two crossing rectangles
      z.push({ x0: q.x0 + q.notch, x1: q.x1 - q.notch, y0: q.y0, y1: q.y1, col: q.col, mat: q.mat || base.mat });
      z.push({ x0: q.x0, x1: q.x1, y0: q.y0 + q.notch, y1: q.y1 - q.notch, col: q.col, mat: q.mat || base.mat });
    } else z.push({ x0: q.x0, x1: q.x1, y0: q.y0, y1: q.y1, col: q.col, mat: q.mat || base.mat, mult: q.mult });
  }
  const key = (q) => q.col + '|' + q.mat + '|' + (q.mult || '');
  const all = [base, ...z];
  const cache = new Map();
  for (const q of all) {
    const k = key(q);
    if (!cache.has(k)) {
      const M = MAT[q.mat] || MAT.cal;
      // (paint: its colour is the tint; brick and stone keep their own, a multiplier can warm or cool them)
      cache.set(k, { layer: LAYER[M.style] + CT.BLANK_U, seed: M.seed, tint: q.mat === 'ladrillo' || q.mat === 'piedra' ? (q.mult || [1, 1, 1]) : lin(q.col), id: cache.size });
    }
    q.Z = cache.get(k);
  }
  return { base, z, at(x, y) { for (let i = z.length - 1; i >= 0; i--) { const q = z[i]; if (x >= q.x0 - 1e-4 && x <= q.x1 + 1e-4 && y >= q.y0 - 1e-4 && y <= q.y1 + 1e-4) return q.Z; } return base.Z; } };
}
// the openings' holes for the wall: rectangles (arched tops: rise) with their cell
function holesOf(S) {
  if (S._holes) return S._holes;
  const out = [];
  let k = 0;
  for (const o of S.open || []) {
    if (o.k === 'niche') continue; // (ghost: an opening of the next wall crossing into this one — its hole only)
    const h = { o, x0: o.x0, x1: o.x1, y0: o.y0 || 0, y1: o.y1, depth: o.d ?? (o.k === 'gar' ? 0.12 : o.k === 'shop' ? 0.15 : 0.22), arch: o.arch || 0, fill: HOLE_KINDS[o.k] ?? CT.WIN_U };
    const hh = h.y1 - h.y0;
    const mb = h.y0 < 0.05 ? 0 : clamp(3.1 - hh - 0.2, 0, 0.9);
    h.cx0 = (h.x0 + h.x1) / 2 - 1.6; h.cy0 = h.y0 - mb;
    h.rect = [clamp((h.x0 - h.cx0) / 3.2, 0, 1), clamp((h.y0 - h.cy0) / 3.1, 0, 1), clamp((h.x1 - h.cx0) / 3.2, 0, 1), clamp((h.y1 - h.cy0) / 3.1, 0, 1)];
    h.ix0 = Math.max(h.cx0, h.x0 - 0.2); h.ix1 = Math.min(h.cx0 + 3.2, h.x1 + 0.2);
    h.iy0 = Math.max(h.cy0, h.y0 - mb); h.iy1 = Math.min(h.cy0 + 3.1, h.y1 + 0.2);
    h.K = 3 + k * 2; // (its own «bay» for the shader's hashes)
    out.push(h); k++;
  }
  S._holes = out;
  return out;
}
const archPts = (h, n = 10) => {
  const w = h.x1 - h.x0, r = Math.min(h.arch, w / 2), R = (w * w / 4 + r * r) / (2 * r), xm = (h.x0 + h.x1) / 2, yc = h.y1 - R, phi = Math.asin(clamp(w / 2 / R, -1, 1));
  const pts = [];
  for (let i = 0; i <= n; i++) { const th = -phi + (2 * phi * i) / n; pts.push([xm + R * Math.sin(th), yc + R * Math.cos(th), th]); }
  return { pts, ys: h.y1 - r, xm };
};

// One measured wall run: the wall around the holes (split where the paint changes and round each opening's cell), the
// reveals of each hole, its fill at the back (glass, a dark hall) and the records of its doors for the street's life.
export function emitMeasuredRun(c, run, p, info, H, facade) {
  const { F, ua, ub } = run.mf, S = F.spec;
  const { ax, az, dx, dz, L, nx, nz, t0, t1 } = run;
  const yLo = run.cy, yHi = H;
  const U0 = Math.max(0, Math.min(ua, ub)), U1 = Math.min(F.L, Math.max(ua, ub));
  if (U1 - U0 < 0.02) return 0;
  const tOf = (u) => t0 + ((u - ua) / (ub - ua)) * (t1 - t0);
  const at = (u) => { const t = tOf(u); return [ax + dx * t, az + dz * t]; };
  const nAt = run.nrmAt ? (u) => run.nrmAt(clamp(tOf(u), 0, 1)) : null;
  const edge = run.code ? (u0, u1) => [clamp(tOf(u0), 0, 1) * L, clamp(tOf(u1), 0, 1) * L, run.code] : () => null;
  const sg = ub > ua ? 1 : -1, tux = (dx / L) * sg, tuz = (dz / L) * sg; // (world direction of growing u)
  const Z = zonesOf(S);
  // (the openings on this run, clipped to it — one may cross into the next house — and above what a neighbour covers)
  const holes = holesOf(S).filter((h) => h.x1 > U0 + 0.02 && h.x0 < U1 - 0.02 && h.y0 >= yLo - 0.01 && h.y1 <= yHi + 0.01)
    .map((h) => (h.x0 >= U0 - 0.01 && h.x1 <= U1 + 0.01 ? h : { ...h, x0: Math.max(h.x0, U0), x1: Math.min(h.x1, U1), cutL: h.x0 < U0 - 0.01, cutR: h.x1 > U1 + 0.01, arch: 0 }));
  // ---- the grid of breaks
  const xs = [U0, U1], ys = [yLo, yHi];
  const addX = (v) => { if (v > U0 + 1e-3 && v < U1 - 1e-3) xs.push(v); };
  const addY = (v) => { if (v > yLo + 1e-3 && v < yHi - 1e-3) ys.push(v); };
  for (const h of holes) { addX(h.x0); addX(h.x1); addX(h.ix0); addX(h.ix1); addY(h.y0); addY(h.y1); addY(h.iy0); addY(h.iy1); if (h.arch) addY(h.y1 - Math.min(h.arch, (h.x1 - h.x0) / 2)); }
  for (const q of Z.z) { addX(q.x0); addX(q.x1); addY(q.y0); addY(q.y1); }
  // (where two openings' cells overlap, the wall between them is split half and half)
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    const a = holes[i], b = holes[j];
    if (a.x1 <= b.x0) addX((a.x1 + b.x0) / 2); else if (b.x1 <= a.x0) addX((b.x1 + a.x0) / 2);
    if (a.y1 <= b.y0) addY((a.y1 + b.y0) / 2); else if (b.y1 <= a.y0) addY((b.y1 + a.y0) / 2);
  }
  const uniq = (a) => { a.sort((p, q) => p - q); const o = []; for (const v of a) if (!o.length || v - o[o.length - 1] > 2e-3) o.push(v); return o; };
  const X = uniq(xs), Y = uniq(ys);
  const inHole = (x, y) => holes.find((h) => x > h.x0 && x < h.x1 && y > h.y0 && y < h.y1 && !(h.arch && y > h.y1 - Math.min(h.arch, (h.x1 - h.x0) / 2)));
  const inArchBox = (x, y) => holes.find((h) => h.arch && x > h.x0 && x < h.x1 && y > h.y1 - Math.min(h.arch, (h.x1 - h.x0) / 2) && y < h.y1);
  const owner = (x, y) => {
    let best = null, bd = Infinity;
    for (const h of holes) {
      if (x < h.ix0 || x > h.ix1 || y < h.iy0 || y > h.iy1) continue;
      const ddx = Math.max(h.x0 - x, 0, x - h.x1), ddy = Math.max(h.y0 - y, 0, y - h.y1), d = ddx * ddx + ddy * ddy;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  };
  const E = 0.004; // (each piece overlaps its neighbours by 4 mm: no sparkling cracks at the T-junctions)
  let tris = 0;
  const uvOf = (h, x, y) => (h ? [(x - h.cx0) / 3.2 + h.K, 1 + (y - h.cy0) / 3.1] : [x / 3.2, 1 + y / 3.1]);
  const quadWall = (x0, x1, y0, y1, zq, h, ks = null) => {
    const xa = Math.max(U0, x0 - E), xb = Math.min(U1, x1 + E), ya = Math.max(yLo, y0 - E), yb = Math.min(yHi, y1 + E);
    const [px0, pz0] = at(xa), [px1, pz1] = at(xb);
    const [u0, v0] = uvOf(h, xa, ya), [u1, v1] = uvOf(h, xb, yb);
    c.quad(px0, ya, pz0, px1, ya, pz1, px1, yb, pz1, px0, yb, pz0, nx, 0, nz, u0, v0, u1, v1, [zq.layer, 0, zq.seed, 0], zq.tint, h ? h.rect : NORECT, H, ks, edge(xa, xb), nAt ? [nAt(xa), nAt(xb)] : null);
    tris += 2;
  };
  for (let j = 0; j < Y.length - 1; j++) {
    const y0 = Y[j], y1 = Y[j + 1], ym = (y0 + y1) / 2;
    let run0 = -1, key = null, own = null, zq = null;
    const flush = (i) => { if (run0 >= 0) quadWall(X[run0], X[i], y0, y1, zq, own); run0 = -1; key = null; };
    for (let i = 0; i < X.length - 1; i++) {
      const x0 = X[i], x1 = X[i + 1], xm = (x0 + x1) / 2;
      if (inHole(xm, ym) || inArchBox(xm, ym)) { flush(i); continue; }
      const q = Z.at(xm, ym), o = owner(xm, ym), k = q.id + ':' + (o ? o.K : -1);
      if (k !== key) { flush(i); run0 = i; key = k; own = o; zq = q; }
    }
    flush(X.length - 1);
  }
  // ---- each hole: reveals, the arched top's spandrels and soffit, the fill at the back
  for (const h of holes) {
    const D = h.depth, ix = -nx * D, iz = -nz * D;
    const yB = Math.max(h.y0, yLo), rise = h.arch ? Math.min(h.arch, (h.x1 - h.x0) / 2) : 0, ys = h.y1 - rise;
    const zR = h.o.rev ? { ...Z.at(h.x0 - 0.01, (yB + ys) / 2), tint: lin(h.o.rev) } : Z.at(h.x0 - 0.01, (yB + ys) / 2);
    const tex = [zR.layer, 0, zR.seed, 0];
    const [xl, zl] = at(h.x0), [xr, zr] = at(h.x1);
    const ul = (h.x0 - h.cx0) / 3.2 + h.K, ur = (h.x1 - h.cx0) / 3.2 + h.K, dU = D / 3.2, dV = D / 3.1;
    const vy = (y) => 1 + (y - h.cy0) / 3.1;
    // jambs (their faces look into the opening)
    if (!h.cutL) { c.quad(xl, yB, zl, xl + ix, yB, zl + iz, xl + ix, ys, zl + iz, xl, ys, zl, tux, 0, tuz, ul, vy(yB), ul + dU, vy(ys), tex, zR.tint, h.rect, H, [0.97, 0.7, 0.7, 0.97]); tris += 2; }
    if (!h.cutR) { c.quad(xr, yB, zr, xr + ix, yB, zr + iz, xr + ix, ys, zr + iz, xr, ys, zr, -tux, 0, -tuz, ur, vy(yB), ur + dU, vy(ys), tex, zR.tint, h.rect, H, [0.97, 0.7, 0.7, 0.97]); tris += 2; }
    if (!rise) {
      c.quad(xl, ys, zl, xr, ys, zr, xr + ix, ys, zr + iz, xl + ix, ys, zl + iz, 0, -1, 0, ul, vy(ys), ur, vy(ys) + dV, tex, zR.tint, h.rect, H, [0.86, 0.86, 0.6, 0.6]);
      tris += 2;
    } else {
      // the arch: spandrels in the wall plane (fans from the opening's top corners) and its curved soffit
      const { pts, xm } = archPts(h);
      const zq = Z.at(h.x0 + 0.01, h.y1 - 0.01);
      for (let i = 0; i < pts.length - 1; i++) {
        const [xa, ya] = pts[i], [xb, yb] = pts[i + 1];
        const cxr = (xa + xb) / 2 < xm ? h.x0 : h.x1;
        const [pax, paz] = at(xa), [pbx, pbz] = at(xb), [pcx, pcz] = at(cxr);
        const [ua0, va0] = uvOf(h, xa, ya), [ub0, vb0] = uvOf(h, xb, yb), [uc0, vc0] = uvOf(h, cxr, h.y1);
        // (a triangle: a quad with two corners at the opening's top corner)
        c.quad(pax, ya, paz, pbx, yb, pbz, pcx, h.y1 + E, pcz, pcx, h.y1 + E, pcz, nx, 0, nz, ua0, va0, ub0, vb0, [zq.layer, 0, zq.seed, 0], zq.tint, h.rect, H);
        void uc0; void vc0;
        // soffit
        const thm = (pts[i][2] + pts[i + 1][2]) / 2, sx = -Math.sin(thm), sy = -Math.cos(thm);
        c.quad(pax, ya, paz, pbx, yb, pbz, pbx + ix, yb, pbz + iz, pax + ix, ya, paz + iz, tux * sx, sy, tuz * sx, ua0, va0, ub0, vb0 + dV, tex, zR.tint, h.rect, H, [0.86, 0.86, 0.6, 0.6]);
        tris += 4;
      }
    }
    // sill / threshold
    if (h.y0 > yLo - 1e-3) {
      const yS = h.y0 > 0.02 ? h.y0 : 0.012;
      c.quad(xl, yS, zl, xr, yS, zr, xr + ix, yS, zr + iz, xl + ix, yS, zl + iz, 0, 1, 0, ul, vy(yS), ur, vy(yS) + dV, tex, zR.tint, h.rect, H, [1, 1, 0.78, 0.78]);
      tris += 2;
    }
    // fill at the back: glass with a room behind it, or the dark hall behind a door (always the close-up look)
    const ftex = [LAYER.color + h.fill, 0, 0.37 + (h.K % 7) * 0.08, 3];
    c.quad(xl + ix, yB, zl + iz, xr + ix, yB, zr + iz, xr + ix, ys, zr + iz, xl + ix, ys, zl + iz, nx, 0, nz, ul, vy(yB), ur, vy(ys), ftex, [1, 1, 1], h.rect, H);
    tris += 2;
    if (rise) {
      const { pts, xm } = archPts(h);
      const [mx0, mz0] = at(xm);
      for (let i = 0; i < pts.length - 1; i++) {
        const [xa, ya] = pts[i], [xb, yb] = pts[i + 1];
        const [pax, paz] = at(xa), [pbx, pbz] = at(xb);
        c.quad(mx0 + ix, ys, mz0 + iz, mx0 + ix, ys, mz0 + iz, pbx + ix, yb, pbz + iz, pax + ix, ya, paz + iz, nx, 0, nz, (xm - h.cx0) / 3.2 + h.K, vy(ys), (xb - h.cx0) / 3.2 + h.K, vy(yb), ftex, [1, 1, 1], h.rect, H);
        tris += 2;
      }
    }
    // the street's life: doors, garages and shop fronts on the ground floor
    if (facade && facade.ground && !h.o.ghost && h.y0 < 0.3 && (h.o.k === 'door' || h.o.k === 'gar' || h.o.k === 'shop' || h.o.k === 'gate')) {
      const [cx, cz] = at((h.x0 + h.x1) / 2);
      facade.ground.push({ x: cx, z: cz, nx, nz, r: (h.x1 - h.x0) / 2 + 0.35, type: h.o.k === 'gar' ? CT.GARAGE : h.o.k === 'shop' ? CT.SHOP : CT.DOOR, bid: p.b, style: 'measured', measured: true });
    }
  }
  return tris;
}

// ------------------------------------------------------------------ the 3D details of a front
// (local frame: x along the front from its left end, y up from the pavement, z out to the street)
const rndOf = (s) => mulberry32((s * 2654435761) >>> 0);
function bx(G, x0, y0, z0, x1, y1, z1, col, pat = 0, faces = 31) { if (x1 - x0 > 1e-4 && y1 - y0 > 1e-4 && z1 - z0 > 1e-4) G.box(x0, y0, z0, x1, y1, z1, col, pat, faces); }
function ring(G, cx, cy, z, r, s, col, n = 9, a0 = 0, a1 = Math.PI * 2) {
  let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, qx = cx + Math.cos(a) * r, qy = cy + Math.sin(a) * r;
    G.bar([px, py, z], [qx, qy, z], s, col);
    px = qx; py = qy;
  }
}
// a turned baluster of iron: the bar with its knops
function ironBaluster(G, x, ya, yb, z, s, col, knops) {
  G.bar([x, ya, z], [x, yb, z], s, col);
  for (const f of knops) {
    const y = ya + (yb - ya) * f, k = s * 1.5;
    if (LOOK.plastilina) G.cyl(x, z, y - 0.035, y + 0.035, k * 1.6, k * 1.6, 8, col, true);
    else { G.cyl(x, z, y - 0.032, y, k * 0.7, k * 1.25, 7, col); G.cyl(x, z, y, y + 0.032, k * 1.25, k * 0.7, 7, col); }
  }
}
// a window grille (reja) on the face of the wall: R { col, gap, hz: [fractions], collars: [fractions], scrolls:
// [[f0, f1]] bands of rings, s, z, buche }
function grille(G, R, x0, y0, x1, y1) {
  const col = vc(R.col || '#222224'), s = R.s || 0.017, z = R.z ?? 0.07, bu = R.buche || 0;
  const zb = z + bu, ym = bu ? y0 + (y1 - y0) * 0.55 : y0;
  G.bar([x0, y1, z], [x1, y1, z], s * 1.15, col);
  G.bar([x0, y0, zb], [x1, y0, zb], s * 1.15, col);
  for (const f of R.hz || [0.5]) { const y = y0 + (y1 - y0) * f; G.bar([x0, y, y < ym ? z + bu * ((ym - y) / Math.max(1e-3, ym - y0)) : z], [x1, y, y < ym ? z + bu * ((ym - y) / Math.max(1e-3, ym - y0)) : z], s * 0.95, col); }
  const n = Math.max(2, Math.round((x1 - x0) / (R.gap || 0.115)));
  const xsb = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    xsb.push(x);
    const ss = i === 0 || i === n ? s * 1.15 : s * 0.9;
    if (bu) { G.bar([x, y1 + 0.01, z], [x, ym, z], ss, col); G.bar([x, ym, z], [x, y0 - 0.01, zb], ss, col); }
    else G.bar([x, y1 + 0.01, z], [x, y0 - 0.01, z], ss, col);
    if (i > 0 && i < n) for (const f of R.collars || []) {
      const y = y0 + (y1 - y0) * f, k = s * 1.4;
      bx(G, x - k, y - 0.03, z - k, x + k, y + 0.03, z + k, col, 0, 63);
    }
  }
  for (const [fa, fb] of R.scrolls || []) {
    const ya = y0 + (y1 - y0) * fa, yb = y0 + (y1 - y0) * fb, r = Math.min((x1 - x0) / n, yb - ya) * 0.36;
    G.bar([x0, ya, z], [x1, ya, z], s * 0.9, col); G.bar([x0, yb, z], [x1, yb, z], s * 0.9, col);
    for (let i = 0; i < xsb.length - 1; i++) { const cx = (xsb[i] + xsb[i + 1]) / 2; ring(G, cx, (ya + yb) / 2 + r * 0.45, z, r, s * 0.7, col, 8); ring(G, cx, (ya + yb) / 2 - r * 0.45, z, r, s * 0.7, col, 8); }
  }
  // anchors into the wall
  for (const x of [x0 + 0.02, x1 - 0.02]) { G.bar([x, y1 - 0.05, 0], [x, y1 - 0.05, z], s, col); G.bar([x, y0 + 0.06, 0], [x, y0 + 0.06, zb * 0.95], s, col); }
}
// a balcony's railing: front from xa to xb at z = zr, returns to the wall at both ends. R { kind: 'bars' | 'ornate'
// | 'panel' | 'plain', h, col, gap, panel, panelH }
function railing(G, R, xa, xb, yb, zr) {
  const col = vc(R.col || '#202022'), h = R.h || 1.0, s = 0.02, yT = yb + h, kind = R.kind || 'bars';
  // handrail (a flat bar) along the front and down both sides to the wall
  bx(G, xa - 0.012, yT - 0.035, zr - 0.024, xb + 0.012, yT + 0.004, zr + 0.024, col, 0, 63);
  bx(G, xa - 0.012, yT - 0.035, 0, xa + 0.024, yT + 0.004, zr, col, 0, 63);
  bx(G, xb - 0.024, yT - 0.035, 0, xb + 0.012, yT + 0.004, zr, col, 0, 63);
  const yB = yb + 0.05;
  G.bar([xa, yB, zr], [xb, yB, zr], s, col); G.bar([xa, yB, 0.02], [xa, yB, zr], s, col); G.bar([xb, yB, 0.02], [xb, yB, zr], s, col);
  const knops = kind === 'ornate' ? [0.42, 0.66] : [];
  const fr = kind === 'ornate' ? 0.2 : 0; // (a frieze of scrolls low on the railing)
  const yF = yB + fr;
  if (fr) {
    G.bar([xa, yF, zr], [xb, yF, zr], s * 0.9, col);
    G.bar([xa, yF, 0.02], [xa, yF, zr], s * 0.9, col); G.bar([xb, yF, 0.02], [xb, yF, zr], s * 0.9, col);
  }
  if (kind === 'panel') { // a sheet of steel along the bottom, bars above it
    const pc = vc(R.panel || '#2b3040'), ph = R.panelH || 0.45;
    bx(G, xa, yb + 0.02, zr - 0.012, xb, yb + ph, zr + 0.006, pc, 0, 63);
    bx(G, xa - 0.006, yb + 0.02, 0, xa + 0.006, yb + ph, zr, pc, 0, 63);
    bx(G, xb - 0.006, yb + 0.02, 0, xb + 0.006, yb + ph, zr, pc, 0, 63);
  }
  if (kind === 'lamas') { // a railing of flat white slats (aluminium)
    const n = Math.max(4, Math.round((xb - xa) / 0.1)), sw = 0.05;
    for (let i = 0; i <= n; i++) { const x = xa + ((xb - xa) * i) / n; bx(G, x - sw / 2, yB - 0.04, zr - 0.012, x + sw / 2, yT - 0.035, zr + 0.012, col, 0, 63); }
    const ns = Math.max(2, Math.round(zr / 0.1));
    for (const x of [xa, xb]) for (let i = 1; i < ns; i++) { const z = (zr * i) / ns; bx(G, x - 0.012, yB - 0.04, z - sw / 2, x + 0.012, yT - 0.035, z + sw / 2, col, 0, 63); }
    return;
  }
  if (kind === 'tubos') { // a railing of round steel tubes run along the front (three or four) on a few posts
    const n = R.tubes || 4;
    for (let k = 1; k <= n; k++) { const y = yb + ((h - 0.04) * k) / n; G.bar([xa, y, zr], [xb, y, zr], 0.045, col); G.bar([xa, y, 0.02], [xa, y, zr], 0.045, col); G.bar([xb, y, 0.02], [xb, y, zr], 0.045, col); }
    const np = Math.max(1, Math.round((xb - xa) / 1.5));
    for (let i = 0; i <= np; i++) { const x = xa + ((xb - xa) * i) / np; G.bar([x, yb, zr], [x, yT, zr], 0.05, col); }
    return;
  }
  if (kind === 'canizo') { // bars with a reed screen tied on the inside of the front and the sides
    const sc = vc(R.screen || '#c9b48a'), ys0 = yb + 0.03, ys1 = yT - 0.02;
    bx(G, xa + 0.01, ys0, zr - 0.035, xb - 0.01, ys1, zr - 0.022, sc, PAT.REEDS, 63);
    bx(G, xa + 0.022, ys0, 0.02, xa + 0.035, ys1, zr - 0.03, sc, PAT.REEDS, 63);
    bx(G, xb - 0.035, ys0, 0.02, xb - 0.022, ys1, zr - 0.03, sc, PAT.REEDS, 63);
  }
  const gap = R.gap || 0.12;
  const front = Math.max(3, Math.round((xb - xa) / gap));
  for (let i = 0; i <= front; i++) {
    const x = xa + ((xb - xa) * i) / front;
    const y0 = kind === 'panel' ? yb + (R.panelH || 0.45) : yB - 0.04;
    if (kind === 'ornate') ironBaluster(G, x, yF, yT - 0.035, zr, s * 0.8, col, knops);
    else G.bar([x, y0, zr], [x, yT - 0.035, zr], s * 0.75, col);
    if (fr && i < front) { // C-scrolls in pairs between the balusters
      const cx = x + (xb - xa) / front / 2, r = Math.min((xb - xa) / front, fr) * 0.3;
      ring(G, cx, yB + fr * 0.5, zr, r, s * 0.55, col, 8);
      G.bar([cx, yB, zr], [cx, yB + fr * 0.5 - r, zr], s * 0.5, col);
    }
  }
  const side = Math.max(2, Math.round(zr / gap));
  for (const x of [xa, xb]) for (let i = 1; i < side; i++) {
    const z = (zr * i) / side, y0 = kind === 'panel' ? yb + (R.panelH || 0.45) : yB - 0.04;
    if (kind === 'ornate') ironBaluster(G, x, yF, yT - 0.035, z, s * 0.8, col, knops);
    else G.bar([x, y0, z], [x, yT - 0.035, z], s * 0.75, col);
  }
}
// a moulded slab (balconies, sills): a deck with a rounded lip and a cavetto under it, in the wall's paint
function slab(G, x0, x1, y, t, out, col, mould = true) {
  bx(G, x0, y - t * 0.55, 0, x1, y, out, col, 0, 31);
  if (mould) {
    bx(G, x0 - 0.02, y - t * 0.34, 0, x1 + 0.02, y - t * 0.08, out + 0.025, col, 0, 31);
    bx(G, x0 + 0.04, y - t, 0, x1 - 0.04, y - t * 0.55, out - 0.08, col, 0, 31);
    bx(G, x0 + 0.08, y - t - 0.04, 0, x1 - 0.08, y - t, out - 0.16, col, 0, 31);
  }
}
// a surround (recercado) round an opening: bands up both sides and a lintel band across the top with its «ears»
function surround(G, o, Sr) {
  const w = Sr.w ?? 0.18, top = Sr.top ?? w, ears = Sr.ears || 0, d = Sr.d ?? 0.012, col = paintC(Sr.col), pat = Sr.stone ? PAT.GRANITE : 0;
  const y0 = Sr.y0 ?? (o.y0 || 0), y1 = o.y1;
  bx(G, o.x0 - w, y0, 0, o.x0, y1, d, col, pat);
  bx(G, o.x1, y0, 0, o.x1 + w, y1, d, col, pat);
  bx(G, o.x0 - w - ears, y1, 0, o.x1 + w + ears, y1 + top, d, col, pat);
  if (Sr.bottom) bx(G, o.x0 - w, y0 - Sr.bottom, 0, o.x1 + w, y0, d, col, pat);
  if (Sr.key) bx(G, (o.x0 + o.x1) / 2 - Sr.key / 2, y1 - 0.02, 0, (o.x0 + o.x1) / 2 + Sr.key / 2, y1 + top + 0.04, d + 0.01, col, pat);
}
// house numbers: digits drawn with strokes of raised metal or ceramic
const DIG = {
  0: [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]], 1: [[0.55, 0, 0.55, 1], [0.55, 1, 0.25, 0.78]],
  2: [[0, 1, 1, 1], [1, 1, 1, 0.5], [1, 0.5, 0, 0.5], [0, 0.5, 0, 0], [0, 0, 1, 0]], 3: [[0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0], [0.2, 0.5, 1, 0.5]],
  4: [[0, 1, 0, 0.45], [0, 0.45, 1, 0.45], [0.8, 1, 0.8, 0]], 5: [[1, 1, 0, 1], [0, 1, 0, 0.5], [0, 0.5, 1, 0.5], [1, 0.5, 1, 0], [1, 0, 0, 0]],
  6: [[1, 1, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 1, 0.5], [1, 0.5, 0, 0.5]], 7: [[0, 1, 1, 1], [1, 1, 0.35, 0]],
  8: [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0], [0, 0.5, 1, 0.5]], 9: [[1, 0.5, 0, 0.5], [0, 0.5, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0], [1, 0, 0, 0]],
};
function digits(G, txt, x, y, h, col, z = 0.004, t = 0.006) {
  const w = h * 0.55, gap = h * 0.22, st = h * 0.13;
  let cx = x - ((w + gap) * txt.length - gap) / 2;
  for (const ch of txt) {
    for (const [a, b, c2, d2] of DIG[ch] || []) {
      const x0 = cx + Math.min(a, c2) * w, x1 = cx + Math.max(a, c2) * w, y0 = y + Math.min(b, d2) * h, y1 = y + Math.max(b, d2) * h;
      if (Math.abs(a - c2) > 1e-3 && Math.abs(b - d2) > 1e-3) G.bar([cx + a * w, y + b * h, z + t / 2], [cx + c2 * w, y + d2 * h, z + t / 2], st, col);
      else bx(G, x0 - st / 2, y0 - st / 2, z, x1 + st / 2, y1 + st / 2, z + t, col, 0, 31);
    }
    cx += w + gap;
  }
}

// a door's leaf (or two) in its opening: kinds 'clavos' (planks studded with nails), 'cuarterones' (panelled), 'alu'
// (aluminium with glass and bars), 'cristal', 'tablas', 'chapa' (sheet steel), 'porton' (a carriage gate)
function doorLeaf(G, F, o, Lf) {
  const D = o.d ?? 0.22, x0 = o.x0, x1 = o.x1, y0 = (o.y0 || 0) + (Lf.sill ?? 0.02), y1 = o.y1;
  const col = vc(Lf.col || '#4a3222'), dark = vc(Lf.col || '#4a3222', 0.45);
  const zb = -D + 0.03, zf = -D + 0.075;
  const fw = Lf.frame ?? 0.07;
  const fc = Lf.frameCol ? vc(Lf.frameCol) : vc(Lf.col || '#4a3222', 0.8);
  // frame
  bx(G, x0, y0, zb, x0 + fw, y1, zf, fc); bx(G, x1 - fw, y0, zb, x1, y1, zf, fc); bx(G, x0 + fw, y1 - fw, zb, x1 - fw, y1, zf, fc);
  const lx0 = x0 + fw, lx1 = x1 - fw, ly0 = y0, ly1 = y1 - fw - (Lf.transom || 0);
  if (Lf.transom) { // a fanlight over the door
    bx(G, lx0, ly1, zb, lx1, ly1 + 0.05, zf, fc);
    bx(G, lx0, ly1 + 0.05, -D + 0.035, lx1, y1 - fw, -D + 0.04, vc('#26313a'), 0, 16);
    if (Lf.transomBars) for (let x = lx0 + 0.1; x < lx1 - 0.05; x += 0.1) G.bar([x, ly1 + 0.05, -D + 0.06], [x, y1 - fw, -D + 0.06], 0.012, vc('#202022'));
  }
  const n = Lf.n || 1, mx = (lx0 + lx1) / 2;
  const kind = Lf.kind || 'clavos';
  bx(G, lx0, ly0, -D + 0.02, lx1, ly1, -D + 0.06, col, kind === 'alu' || kind === 'chapa' ? 0 : PAT.WOOD, 16);
  if (n === 2) bx(G, mx - 0.006, ly0, -D + 0.06, mx + 0.006, ly1, -D + 0.064, dark, 0, 16);
  const zl = -D + 0.06;
  if (kind === 'clavos' || kind === 'tablas' || kind === 'porton') {
    // planks: grooves every 12-15 cm; nails in rows (the studded doors of the old houses)
    const pw = Lf.plank || 0.13;
    for (let x = lx0 + pw; x < lx1 - 0.03; x += pw) bx(G, x - 0.004, ly0, zl, x + 0.004, ly1, zl + 0.002, dark, 0, 16);
    if (kind !== 'tablas') {
      const rows = Math.max(4, Math.round((ly1 - ly0) / 0.2)), cols = Math.max(2, Math.round((lx1 - lx0) / (n === 2 ? 0.16 : 0.18)));
      const nc = vc(Lf.nails || '#2a2420');
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const x = lx0 + ((lx1 - lx0) * (k + 0.5)) / cols, y = ly0 + 0.12 + ((ly1 - ly0 - 0.2) * r) / (rows - 1);
        F.box(x - 0.011, y - 0.011, zl, x + 0.011, y + 0.011, zl + 0.014, nc, 0, 31);
      }
      // cross ledges (peinazos) marked by a row of nails above and below
    }
  } else if (kind === 'cuarterones') {
    const leaves = n === 2 ? [[lx0, mx], [mx, lx1]] : [[lx0, lx1]];
    const rowsY = Lf.panels || [[0.15, 0.45], [0.52, 0.8], [0.86, 0.96]];
    for (const [a, b] of leaves) {
      const pw = b - a;
      for (const [fa, fb] of rowsY) {
        const ya = ly0 + (ly1 - ly0) * fa, yb = ly0 + (ly1 - ly0) * fb;
        bx(G, a + pw * 0.15, ya, zl, b - pw * 0.15, yb, zl + 0.018, vc(Lf.col || '#4a3222', 1.12), PAT.WOOD, 31);
      }
    }
  } else if (kind === 'alu') {
    const gc = vc('#26313a');
    const leaves = n === 2 ? [[lx0, mx], [mx, lx1]] : [[lx0, lx1]];
    for (const [a, b] of leaves) {
      bx(G, a + 0.08, ly0 + 0.9, zl, b - 0.08, ly1 - 0.1, zl + 0.003, gc, 0, 16);
      for (let x = a + 0.17; x < b - 0.1; x += 0.11) G.bar([x, ly0 + 0.9, zl + 0.012], [x, ly1 - 0.1, zl + 0.012], 0.014, vc('#1d1d1f'));
    }
  } else if (kind === 'cristal') {
    bx(G, lx0 + 0.05, ly0 + 0.08, zl, lx1 - 0.05, ly1 - 0.08, zl + 0.003, vc('#2a3540'), 0, 16);
  } else if (kind === 'chapa') {
    for (let y = ly0 + 0.25; y < ly1 - 0.1; y += 0.25) bx(G, lx0, y - 0.006, zl, lx1, y + 0.006, zl + 0.004, dark, 0, 16);
  }
  if (Lf.knocker !== false && kind !== 'chapa') {
    const kc = vc(Lf.metal || '#8a7440');
    F.box(mx - (n === 2 ? 0.1 : -0.0) - 0.02, 1.0, zl, mx - (n === 2 ? 0.1 : -0.0) + 0.02, 1.12, zl + 0.03, kc, 0, 63);
    if (n === 1) F.box(lx1 - 0.12, 0.98, zl, lx1 - 0.08, 1.06, zl + 0.04, kc, 0, 63);
  }
}
function garageLeaf(G, o, Lf) {
  const D = o.d ?? 0.12, col = vc(Lf.col || '#e8e6e0'), kind = Lf.kind || 'roller';
  const x0 = o.x0, x1 = o.x1, y1 = o.y1;
  if (kind === 'roller') { // a rolled shutter of aluminium slats
    bx(G, x0, 0.01, -D + 0.02, x1, y1, -D + 0.05, col, PAT.SLATS, 16);
    bx(G, x0 - 0.03, 0.01, -D + 0.01, x0 + 0.01, y1, -D + 0.06, vc(Lf.guide || '#b7b7b2'), 0, 31);
    bx(G, x1 - 0.01, 0.01, -D + 0.01, x1 + 0.03, y1, -D + 0.06, vc(Lf.guide || '#b7b7b2'), 0, 31);
  } else if (kind === 'sectional') { // horizontal panels
    bx(G, x0, 0.01, -D + 0.02, x1, y1, -D + 0.05, col, 0, 16);
    for (let y = 0.5; y < y1 - 0.1; y += 0.5) bx(G, x0, y - 0.008, -D + 0.05, x1, y + 0.008, -D + 0.054, vc(Lf.col || '#e8e6e0', 0.82), 0, 16);
  } else if (kind === 'basculante') { // a tilting door of steel with vertical ribs
    bx(G, x0, 0.01, -D + 0.02, x1, y1, -D + 0.05, col, PAT.RIBS, 16);
  } else if (kind === 'tijera') { // a folding grille gate (cancela de tijera)
    folding(G, x0, 0.02, x1, y1, -D + 0.05, vc(Lf.col || '#c9c4b0'));
  }
}
// a folding lattice gate: vertical bars and the diagonal links between them
function folding(G, x0, y0, x1, y1, z, col) {
  const n = Math.max(3, Math.round((x1 - x0) / 0.13));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    G.bar([x, y0, z], [x, y1, z], 0.022, col);
    if (i < n) {
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      for (let y = y0 + 0.1; y < y1 - 0.25; y += 0.32) { G.bar([x, y, z + 0.012], [xb, y + 0.16, z + 0.012], 0.012, col); G.bar([x, y + 0.16, z + 0.018], [xb, y, z + 0.018], 0.012, col); }
    }
  }
  G.bar([x0, y1 - 0.03, z], [x1, y1 - 0.03, z], 0.03, col);
  G.bar([x0, y0 + 0.02, z], [x1, y0 + 0.02, z], 0.03, col);
}

function windowLeaf(G, F, o, rnd) {
  const D = o.d ?? 0.22, X0 = o.x0, X1 = o.x1, Y0 = o.y0, Y1 = o.y1 - (o.arch ? Math.min(o.arch, (X1 - X0) / 2) : 0);
  const fr = o.frame || {}, fc = vc(fr.col || '#f1f0ec');
  const zb = -D + 0.004, zf = -D + 0.065;
  const leaves = fr.leaves ?? (X1 - X0 > 0.75 ? 2 : 1);
  frameRect(G, X0, Y0, X1, Y1, zb, zf, fr.w || 0.055, fc, leaves === 2, 0.07);
  if (leaves === 3) { for (const f of [1 / 3, 2 / 3]) { const m = X0 + (X1 - X0) * f; bx(G, m - 0.03, Y0 + 0.07, zb, m + 0.03, Y1 - 0.055, zf - 0.008, fc); } }
  if (fr.transom) bx(G, X0 + 0.05, Y1 - fr.transom - 0.03, zb, X1 - 0.05, Y1 - fr.transom + 0.03, zf, fc);
  const Pz = o.pers;
  if (Pz) {
    const lvl = Pz.lvl ?? 0.5;
    persiana(G, X0 + 0.024, Y0 + 0.07, X1 - 0.024, Y1, -D + 0.095, lvl, vc(Pz.col || '#f1efe8'), vc(Pz.guide || fr.col || '#d8d8d4'));
    if (Pz.box) bx(G, X0 - 0.03, Y1, -D + 0.02, X1 + 0.03, Y1 + Pz.box, 0.02, vc(Pz.boxCol || Pz.col || '#f1efe8'), 0, 31);
  }
  if (o.shutters) { // wooden shutters (contraventanas), open against the wall or closed
    const sc = vc(o.shutters.col || '#5a3a24'), w = (X1 - X0) / 2;
    if (o.shutters.open === false) bx(G, X0 + 0.02, Y0 + 0.02, -D + 0.1, X1 - 0.02, Y1 - 0.02, -D + 0.13, sc, PAT.LOUVER, 31);
    else { bx(G, X0 - w - 0.018, Y0, 0.004, X0 - 0.018, Y1, 0.034, sc, PAT.LOUVER); bx(G, X1 + 0.018, Y0, 0.004, X1 + w + 0.018, Y1, 0.034, sc, PAT.LOUVER); }
  }
  if (o.curtain) bx(G, X0 + 0.06, Y0 + 0.08, -D + 0.02, X1 - 0.06, Y1 - 0.06, -D + 0.025, vc(o.curtain), 0, 16);
}

function opening(G, F, P, o, rnd) {
  const D = o.d ?? (o.k === 'gar' ? 0.12 : o.k === 'shop' ? 0.15 : 0.22);
  if (o.surr) surround(G, o, o.surr);
  if (o.sill) { const s = o.sill; bx(G, o.x0 - (s.w ?? 0.05), o.y0 - (s.h ?? 0.04), -D + 0.07, o.x1 + (s.w ?? 0.05), o.y0 + 0.004, s.d ?? 0.05, s.paint ? paintC(s.col) : vc(s.col || '#e9e3d6'), s.stone ? PAT.GRANITE : 0); }
  switch (o.k) {
    case 'win': windowLeaf(G, F, o, rnd); break;
    case 'balc': windowLeaf(G, F, { ...o, frame: { leaves: 2, ...(o.frame || {}) } }, rnd); break;
    case 'door': case 'gate': doorLeaf(G, F, o, o.leaf || {}); break;
    case 'gar': garageLeaf(G, o, o.leaf || {}); break;
    case 'shop': {
      const fc = vc((o.frame && o.frame.col) || '#2c2e31');
      const zb = -D + 0.004, zf = -D + 0.07;
      frameRect(G, o.x0, o.y0 || 0, o.x1, o.y1, zb, zf, 0.06, fc, false, 0.08);
      for (const m of o.mullions || []) bx(G, m - 0.03, o.y0 || 0, zb, m + 0.03, o.y1, zf, fc);
      if (o.transom) bx(G, o.x0, o.transom - 0.03, zb, o.x1, o.transom + 0.03, zf, fc);
      if (o.gate) folding(G, o.x0 + 0.03, 0.03, o.x1 - 0.03, o.y1 - 0.03, 0.03, vc(o.gate.col || '#cfcab8'));
      break;
    }
    default: break;
  }
  if (o.reja) grille(G, o.reja, o.reja.x0 ?? o.x0 - 0.06, o.reja.y0 ?? o.y0 - 0.05, o.reja.x1 ?? o.x1 + 0.06, o.reja.y1 ?? o.y1 + 0.06);
  if (o.slab) slab(G, o.slab.x0, o.slab.x1, o.slab.y ?? o.y0, o.slab.t ?? 0.18, o.slab.out ?? 0.5, paintC(o.slab.col || '#e9dcb8'), o.slab.mould !== false);
  if (o.rail) railing(G, o.rail, (o.slab ? o.slab.x0 : o.x0 - 0.3) + 0.03, (o.slab ? o.slab.x1 : o.x1 + 0.3) - 0.03, o.slab ? o.slab.y ?? o.y0 : o.y0, (o.slab ? o.slab.out ?? 0.5 : 0.45) - 0.035);
  if (o.steps) for (const s of o.steps) bx(G, s.x0 ?? o.x0 - 0.1, s.y0 ?? 0, -D, s.x1 ?? o.x1 + 0.1, s.y1, s.out ?? 0.3, vc(s.col || '#b9b6ae'), s.stone === false ? 0 : PAT.GRANITE, 31);
  if (o.num) digits(F, o.num.text, o.num.x ?? (o.x0 + o.x1) / 2, o.num.y, o.num.h || 0.12, vc(o.num.col || '#f2f1ec'), o.num.z ?? 0.014);
  if (o.awning) { const a = o.awning; awning(G, a.x0 ?? o.x0 - 0.15, a.x1 ?? o.x1 + 0.15, a.y ?? o.y1 + 0.2, a.z ?? 0.04, a.drop ?? 0.5, a.out ?? 0.8, vc(a.col || '#1d6e3e')); }
  if (o.pots) for (const q of o.pots) flowerPot(F, q.x, q.y, q.z ?? 0.12, q.r || 0.07, rnd, !!q.hang);
  if (o.laundry) laundry(F, o.x0, o.x1, o.laundry, 0.4, rnd);
}

// a rectangle less some holes → the rectangles that are left (rows of cells merged along x)
function rectMinus(x0, x1, y0, y1, holes) {
  const cut = (v, a, b) => v > a + 1e-4 && v < b - 1e-4;
  const xs = [x0, x1], ys = [y0, y1];
  for (const h of holes) { if (cut(h[0], x0, x1)) xs.push(h[0]); if (cut(h[2], x0, x1)) xs.push(h[2]); if (cut(h[1], y0, y1)) ys.push(h[1]); if (cut(h[3], y0, y1)) ys.push(h[3]); }
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const ym = (ys[j] + ys[j + 1]) / 2;
    let start = -1;
    for (let i = 0; i < xs.length; i++) {
      const inside = i < xs.length - 1 && (() => { const xm = (xs[i] + xs[i + 1]) / 2; return !holes.some((h) => xm > h[0] && xm < h[2] && ym > h[1] && ym < h[3]); })();
      if (inside && start < 0) start = i;
      if (!inside && start >= 0) { if (xs[i] - xs[start] > 1e-3) out.push([xs[start], ys[j], xs[i], ys[j + 1]]); start = -1; }
    }
  }
  return out;
}
const openRects = (S, grow = 0) => (S.open || []).map((o) => [o.x0 - grow, (o.y0 || 0) - grow, o.x1 + grow, o.y1 + grow]);

// a body standing out from the wall (a cantilevered floor of brick, a bay): its front at z = d with its openings,
// its sides, its soffit and its top. skin: only a facing laid on the wall (brick of a colour of its own), holes
// 'auto': round the openings of the front
function volume(G, r, S) {
  const col = r.pat === 'BRICK' ? vc(r.col || '#a4583c') : paintC(r.col || '#efe8da'), pat = r.pat ? PAT[r.pat] : 0, d = r.d, t = r.skin ? d : r.t ?? 0.12;
  const holes = r.holes === 'auto'
    ? (S.open || []).filter((o) => o.x1 > r.x0 && o.x0 < r.x1 && o.y1 > r.y0 && (o.y0 || 0) < r.y1).map((o) => [o.x0, o.y0 || 0, o.x1, o.y1])
    : (r.holes || []).map((h) => h.slice(0, 4));
  for (const [a, b, c2, e] of rectMinus(r.x0, r.x1, r.y0, r.y1, holes)) bx(G, a, b, d - t, c2, e, d, col, pat, 31);
  for (const h of holes) { // the openings' reveals through the front
    const rc = h[4] ? paintC(h[4]) : col, rp = h[4] ? 0 : pat;
    bx(G, h[0] - 0.005, h[1], d - t, h[0] + 0.02, h[3], d - 0.002, rc, rp, 2 | 16); bx(G, h[2] - 0.02, h[1], d - t, h[2] + 0.005, h[3], d - 0.002, rc, rp, 1 | 16);
    bx(G, h[0], h[3] - 0.02, d - t, h[2], h[3] + 0.005, d - 0.002, rc, rp, 8 | 16); bx(G, h[0], h[1] - 0.005, d - t, h[2], h[1] + 0.02, d - 0.002, rc, rp, 4 | 16);
  }
  if (r.skin) return;
  if (r.sides !== false) { bx(G, r.x0, r.y0, 0, r.x0 + t, r.y1, d - t, col, pat, 2 | 4 | 8); bx(G, r.x1 - t, r.y0, 0, r.x1, r.y1, d - t, col, pat, 1 | 4 | 8); }
  bx(G, r.x0, r.y0, 0, r.x1, r.y0 + t, d - t, r.soffit ? paintC(r.soffit) : col, r.soffit ? 0 : pat, 8);
  if (r.top !== false) bx(G, r.x0, r.y1 - t, 0, r.x1, r.y1, d - t, col, pat, 4);
}

function relief(G, r, S) {
  const col = paintC(r.col || '#e6d3a8');
  switch (r.k) {
    case 'vol': volume(G, r, S); break;
    case 'cornice': { // a moulded cornice: layers [h, out] from the bottom up
      let y = r.y;
      for (const [h, d] of r.prof || [[0.08, 0.05], [0.1, 0.12], [0.08, 0.2]]) { bx(G, r.x0 - (r.wrap0 ? d : 0), y, 0, r.x1 + (r.wrap1 ? d : 0), y + h, d, col, 0, r.ends === false ? 31 & ~3 : 31); y += h; }
      break;
    }
    case 'stone': // stone cladding (polished granite slabs with their joints), round the openings
      for (const [a, b, c2, e] of rectMinus(r.x0, r.x1, r.y0, r.y1, r.cut === false ? [] : openRects(S))) bx(G, a, b, 0, c2, e, r.d ?? 0.03, vc(r.col || '#a8a19a'), PAT.SLABS, 31);
      break;
    case 'tiles': { // a plinth of glazed tiles
      const s = r.tile || 0.2;
      for (let y = r.y0; y < r.y1 - 1e-3; y += s) for (let x = r.x0; x < r.x1 - 1e-3; x += s) bx(G, x + 0.002, y + 0.002, 0, Math.min(r.x1, x + s) - 0.002, Math.min(r.y1, y + s) - 0.002, r.d ?? 0.012, vc(((Math.round(x / s) + Math.round(y / s)) & 1) && r.col2 ? r.col2 : r.col), 0, 31);
      break;
    }
    default: // band, pilaster, box: a block of the wall's paint standing proud
      bx(G, r.x0, r.y0, r.z0 || 0, r.x1, r.y1, r.d ?? 0.02, r.metal ? vc(r.col) : col, r.pat ? PAT[r.pat] : 0, r.faces ?? 31);
  }
}

function extra(G, F, P, e, rnd) {
  switch (e.k) {
    case 'mailbox': { const c0 = vc(e.col || '#1e1f20'); bx(F, e.x - (e.w || 0.26) / 2, e.y, 0, e.x + (e.w || 0.26) / 2, e.y + (e.h || 0.32), e.d || 0.1, c0, 0, 31); bx(F, e.x - 0.08, e.y + (e.h || 0.32) * 0.62, e.d || 0.1, e.x + 0.08, e.y + (e.h || 0.32) * 0.7, (e.d || 0.1) + 0.006, vc('#111'), 0, 16); break; }
    case 'intercom': bx(F, e.x - 0.06, e.y, 0, e.x + 0.06, e.y + 0.16, 0.025, vc(e.col || '#c8c8c4'), 0, 31); bx(F, e.x - 0.04, e.y + 0.03, 0.025, e.x + 0.04, e.y + 0.09, 0.03, vc('#5a5a58'), 0, 16); break;
    case 'plate': bx(F, e.x - e.w / 2, e.y, 0, e.x + e.w / 2, e.y + e.h, e.d || 0.01, vc(e.col || '#efeee9'), 0, 31); break;
    case 'box': bx(G, e.x0, e.y0, e.z0 || 0, e.x1, e.y1, e.d || 0.1, vc(e.col || '#c9c9c2'), e.pat ? PAT[e.pat] : 0, 31); break;
    case 'pipe': { // a downpipe from the eaves to the ground
      const pc = vc(e.col || '#9a9da0'), z = e.z || 0.07;
      G.cyl(e.x, z, e.y0 ?? 0.05, e.y1, e.r || 0.043, e.r || 0.043, 8, pc);
      for (let y = (e.y0 ?? 0.05) + 0.7; y < e.y1 - 0.3; y += 1.5) bx(G, e.x - 0.055, y, 0, e.x + 0.055, y + 0.03, z + 0.05, pc, 0, 31);
      break;
    }
    case 'cable': { // the bundles of black cables pinned along the fronts
      const cc = vc(e.col || '#151516'), pts = e.pts, s = e.s || 0.016, z = e.z ?? 0.03;
      for (let i = 0; i < pts.length - 1; i++) {
        // a little sag between the clips
        const [xa, ya] = pts[i], [xb, yb] = pts[i + 1], len = Math.hypot(xb - xa, yb - ya), segs = Math.max(1, Math.round(len / 0.5));
        for (let k = 0; k < segs; k++) {
          const f0 = k / segs, f1 = (k + 1) / segs, sag = e.sag ?? 0.03;
          const y0 = ya + (yb - ya) * f0 - Math.sin(Math.PI * f0) * sag * Math.min(1, len / 3), y1 = ya + (yb - ya) * f1 - Math.sin(Math.PI * f1) * sag * Math.min(1, len / 3);
          G.bar([xa + (xb - xa) * f0, y0, z], [xa + (xb - xa) * f1, y1, z], s, cc);
        }
      }
      break;
    }
    case 'ac': acUnit(G, e.x - 0.39, e.y, rnd); break;
    case 'toldo': awning(G, e.x0, e.x1, e.y, e.z ?? 0.04, e.drop ?? 0.6, e.out ?? 1.0, vc(e.col || '#1d6e3e'), e.arms !== false); break;
    case 'lamp': break; // (the lanterns are the street's lamps: world.js lights them)
    case 'camera': bx(F, e.x - 0.04, e.y - 0.03, 0, e.x + 0.04, e.y + 0.03, 0.09, vc('#141414'), 0, 31); break;
    case 'number': digits(F, e.text, e.x, e.y, e.h || 0.12, vc(e.col || '#f2f1ec'), e.z ?? 0.004); break;
    case 'pots': for (const q of e.list) flowerPot(F, q[0], q[1], q[2] ?? 0.15, q[3] || 0.09, rnd, !!q[4]); break;
    case 'meter': bx(G, e.x - (e.w || 0.4) / 2, e.y, 0, e.x + (e.w || 0.4) / 2, e.y + (e.h || 0.5), e.d || 0.12, vc(e.col || '#cfcfc8'), 0, 31); break;
    default: break;
  }
}

// the top of a front: parapets with their coping, railings on the terraces, a pergola
function topOf(G, F, T) {
  if (T.coping) { const c0 = T.coping; bx(G, c0.x0, c0.y, -(c0.back ?? 0.25), c0.x1, c0.y + (c0.h || 0.06), c0.d ?? 0.05, paintC(c0.col || '#ece6da'), 0, 31); }
  for (const R of T.rails || []) railing(G, R, R.x0, R.x1, R.y, R.z ?? -0.15);
  for (const B of T.balusters || []) { // a balustrade of white balusters on a terrace
    const col = paintC(B.col || '#f1efe9'), n = Math.max(2, Math.round((B.x1 - B.x0) / (B.gap || 0.16)));
    bx(G, B.x0, B.y, (B.z ?? 0) - 0.12, B.x1, B.y + 0.08, (B.z ?? 0) + 0.06, col, 0, 31);
    bx(G, B.x0, B.y + B.h - 0.1, (B.z ?? 0) - 0.14, B.x1, B.y + B.h, (B.z ?? 0) + 0.08, col, 0, 31);
    for (let i = 0; i < n; i++) { const x = B.x0 + ((B.x1 - B.x0) * (i + 0.5)) / n; G.cyl(x, B.z ?? -0.03, B.y + 0.08, B.y + B.h - 0.1, 0.045, 0.06, 8, col); }
  }
  for (const Pp of T.posts || []) bx(G, Pp.x - (Pp.w || 0.3) / 2, Pp.y0, (Pp.z ?? 0) - (Pp.w || 0.3) / 2, Pp.x + (Pp.w || 0.3) / 2, Pp.y1, (Pp.z ?? 0) + (Pp.w || 0.3) / 2, paintC(Pp.col || '#f1efe9'), 0, 63);
  if (T.pergola) { // posts and a roof of corrugated sheet on its rafters
    const g = T.pergola, pc = vc(g.col || '#f0efea');
    for (const x of g.posts) G.cyl(x, g.z ?? 0, g.y0, g.y1, 0.04, 0.04, 8, pc);
    bx(G, g.x0, g.y1 - 0.08, (g.z ?? 0) - 0.05, g.x1, g.y1, (g.z ?? 0) + 0.05, pc, 0, 63);
    for (let x = g.x0; x <= g.x1 + 1e-3; x += g.rafter || 1.0) bx(G, x - 0.03, g.y1, (g.z ?? 0) - g.depth, x + 0.03, g.y1 + 0.08, (g.z ?? 0) + 0.1, pc, 0, 63);
    // the sheet, sloping back
    G.quad([g.x0, g.y1 + 0.08, (g.z ?? 0) + 0.12], [g.x1, g.y1 + 0.08, (g.z ?? 0) + 0.12], [g.x1, g.y1 + 0.08 + (g.rise || 0.3), (g.z ?? 0) - g.depth], [g.x0, g.y1 + 0.08 + (g.rise || 0.3), (g.z ?? 0) - g.depth], 0, 1, 0, vc(g.sheet || '#cfd2d4'), PAT.RIBS);
    G.quad([g.x0, g.y1 + 0.075, (g.z ?? 0) + 0.12], [g.x0, g.y1 + 0.075 + (g.rise || 0.3), (g.z ?? 0) - g.depth], [g.x1, g.y1 + 0.075 + (g.rise || 0.3), (g.z ?? 0) - g.depth], [g.x1, g.y1 + 0.075, (g.z ?? 0) + 0.12], 0, -1, 0, vc(g.sheet || '#cfd2d4', 0.7), PAT.RIBS);
  }
}

// everything of one front, into the streamed chunk (FacadeDetails.addBuild hands G solid, F fine, P plant cards)
export function buildMeasuredDetails(G, F, P, M) {
  const S = M.spec, rnd = rndOf((M.bid + 1) * 97 + Math.round(M.ax * 10));
  for (const g of [G, F]) g.frame(M.ax, 0, M.az, M.tx, M.tz, M.nx, M.nz);
  if (P) P.frame(M.ax, 0, M.az, M.tx, M.tz, M.nx, M.nz);
  for (const r of S.relief || []) relief(G, r, S);
  for (const o of S.open || []) if (!o.ghost) opening(G, F, P, o, rnd);
  for (const e of S.extra || []) extra(G, F, P, e, rnd);
  if (S.top) topOf(G, F, S.top);
  for (const g of [G, F]) g.frame(0, 0, 0, 1, 0, 0, 1);
  if (P) P.world();
}

// the wall lanterns of the measured fronts, in the town's frame: [{ x, y, z, ang }] for world.js
export function measuredLamps(R) {
  const out = [];
  for (const M of R.fronts) for (const e of M.spec.extra || []) {
    if (e.k !== 'lamp') continue;
    out.push({ x: M.ax + M.tx * e.x + M.nx * 0.012, y: e.y, z: M.az + M.tz * e.x + M.nz * 0.012, ang: Math.atan2(M.nx, M.nz), nx: M.nx, nz: M.nz });
  }
  return out;
}
