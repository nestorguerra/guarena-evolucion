// A solid town: the Catastro's houses welded into rows. Neighbouring footprints in the cadastre rarely touch exactly — a
// cut of a few centimetres, the map's 10 cm grid, a front pulled back from a street — and the game hid both party walls
// of two houses closer than 30 cm: through the crack between them you saw the sky, or the inside of the houses. Here
//  - weldParts: every corner within a hand's breadth (0.35 m) of a corner of another footprint becomes one shared corner,
//    and every corner lying against another footprint's wall is put on that wall and added to it as a corner too, so two
//    walls side by side become one and the same line (and the house builder hides both, with nothing between them);
//  - fillCracks: every crack left between two facing walls, up to 1.3 m wide (measured every 25 cm, as auditGaps does),
//    is filled with a piece of wall as tall as the lower of the two houses, from one wall exactly to the other, so the
//    row of fronts runs on without a gap and nobody walks into it.
// The footprints are the Catastro's, a few centimetres moved at most; every building, part and courtyard keeps its shape.
import { ringArea, ringCentroid, pointInRing } from './util.js';
import { PolyIndex } from './collision.js';

// ------------------------------------------------------------------ welding
// map.parts / map.buildings rings (and their courtyards) welded in place. opts:
//   tol: how near two corners (or a corner and a wall) are welded (m)
//   wideTol: the same for the footprints the game makes up (wide(ring owner) true: houses filling a gap, infill)
//   fixed(owner): footprints that must not move (the landmarks, already built from theirs)
// Returns stats, and map.sharedCorner(x, z): is that corner shared with another part (not to be rounded).
export function weldParts(map, { tol = 0.35, wideTol = 0.5, fixed = () => false, wide = () => false } = {}) {
  const rings = []; // { owner, key, kind, fixed, wide, orig: number[], nodes: number[] }
  const add = (owner, kind) => {
    const isFixed = !!fixed(owner, kind), isWide = !!wide(owner, kind);
    rings.push({ owner, key: 'ring', kind, fixed: isFixed, wide: isWide, orig: Array.from(owner.ring) });
    if (owner.holes) owner.holes.forEach((h, i) => rings.push({ owner, key: i, kind, fixed: isFixed, wide: isWide, orig: Array.from(h) }));
  };
  for (const p of map.parts) add(p, 'p');
  for (const b of map.buildings) add(b, 'b');
  // ---- the corners, each its own node to begin with
  const VX = [], VZ = [], VR = [];
  rings.forEach((R, ri) => { for (let i = 0; i < R.orig.length; i += 2) { VX.push(R.orig[i]); VZ.push(R.orig[i + 1]); VR.push(ri); } });
  const NV = VX.length;
  const cellOf = (x, z, c) => Math.floor(x / c) * 73856093 ^ Math.floor(z / c) * 19349663;
  const vgrid = new Map();
  for (let v = 0; v < NV; v++) { const k = cellOf(VX[v], VZ[v], tol); let a = vgrid.get(k); if (!a) vgrid.set(k, (a = [])); a.push(v); }
  const near = (x, z, r, c, grid, fn) => {
    const gx = Math.floor(x / c), gz = Math.floor(z / c), n = Math.ceil(r / c);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const a = grid.get((gx + i) * 73856093 ^ (gz + j) * 19349663);
      if (a) for (const q of a) fn(q);
    }
  };
  // nodes: x, z, fixed, wide (all members wide)
  const NX = [], NZ = [], NF = [], NW = [];
  const nodeOf = new Int32Array(NV).fill(-1);
  for (let v = 0; v < NV; v++) {
    if (nodeOf[v] >= 0) continue;
    const cand = [];
    near(VX[v], VZ[v], tol, tol, vgrid, (q) => {
      if (q === v || nodeOf[q] >= 0) return;
      const d = Math.hypot(VX[q] - VX[v], VZ[q] - VZ[v]);
      if (d <= tol) cand.push([d, q]);
    });
    cand.sort((a, b) => a[0] - b[0]);
    const members = [v], used = new Set([VR[v]]);
    for (const [, q] of cand) { if (used.has(VR[q])) continue; used.add(VR[q]); members.push(q); }
    let fx = null, sx = 0, sz = 0, allWide = true;
    for (const q of members) {
      const R = rings[VR[q]];
      if (R.fixed && !fx) fx = [VX[q], VZ[q]];
      if (!R.wide) allWide = false;
      sx += VX[q]; sz += VZ[q];
    }
    const id = NX.length;
    NX.push(fx ? fx[0] : sx / members.length); NZ.push(fx ? fx[1] : sz / members.length); NF.push(fx ? 1 : 0); NW.push(allWide ? 1 : 0);
    for (const q of members) nodeOf[q] = id;
  }
  rings.forEach((R) => { R.nodes = []; });
  for (let v = 0; v < NV; v++) rings[VR[v]].nodes.push(nodeOf[v]);
  // (a ring that now visits the same node twice in a row loses the repeat; a needle — the outline going out and straight
  // back, or a corner on the same spot as the last — loses its tip)
  const tidy = (R) => {
    const out = [];
    for (const n of R.nodes) if (out[out.length - 1] !== n) out.push(n);
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    for (let k = 0, guard = 0; k < out.length && out.length > 3 && guard < 4 * out.length + 16; k++, guard++) {
      const a = out[(k - 1 + out.length) % out.length], b = out[k], c = out[(k + 1) % out.length];
      if (a === c) { out.splice(k, 1); out.splice(k % out.length, 1); k = -1; continue; }
      const ex = NX[b] - NX[a], ez = NZ[b] - NZ[a], fx = NX[c] - NX[b], fz = NZ[c] - NZ[b], le = Math.hypot(ex, ez), lf = Math.hypot(fx, fz);
      if (le < 1e-3 || lf < 1e-3 || (ex * fx + ez * fz) / (le * lf) < -0.995) { out.splice(k, 1); k = Math.max(-1, k - 2); }
    }
    R.nodes = out;
  };
  rings.forEach(tidy);
  // ---- corners against walls: put on the wall and added to it (T-junctions), a few passes
  let tees = 0, merges = 0;
  for (let pass = 0; pass < 3; pass++) {
    // the walls now, in a grid
    const W = []; // [ringIdx, k (edge from nodes[k] to nodes[k+1])]
    const egrid = new Map(), ec = 4;
    rings.forEach((R, ri) => {
      const n = R.nodes.length;
      for (let k = 0; k < n; k++) {
        const a = R.nodes[k], b = R.nodes[(k + 1) % n];
        const x0 = Math.min(NX[a], NX[b]) - wideTol, x1 = Math.max(NX[a], NX[b]) + wideTol, z0 = Math.min(NZ[a], NZ[b]) - wideTol, z1 = Math.max(NZ[a], NZ[b]) + wideTol;
        const wi = W.length / 2;
        W.push(ri, k);
        for (let gx = Math.floor(x0 / ec); gx <= Math.floor(x1 / ec); gx++) for (let gz = Math.floor(z0 / ec); gz <= Math.floor(z1 / ec); gz++) {
          const key = gx * 73856093 ^ gz * 19349663;
          let l = egrid.get(key); if (!l) egrid.set(key, (l = [])); l.push(wi);
        }
      }
    });
    // which rings each node is on
    const ringsOf = new Map();
    rings.forEach((R, ri) => { for (const n of R.nodes) { let s = ringsOf.get(n); if (!s) ringsOf.set(n, (s = new Set())); s.add(ri); } });
    const ins = new Map(); // ringIdx → [{k, t, node}]
    const moved = new Set(), dead = new Set();
    let changed = 0;
    for (const [n, onRings] of ringsOf) {
      if (dead.has(n) || moved.has(n)) continue;
      const nx = NX[n], nz = NZ[n];
      const myWide = NW[n] === 1;
      let best = null;
      const l = egrid.get(Math.floor(nx / ec) * 73856093 ^ Math.floor(nz / ec) * 19349663);
      if (!l) continue;
      for (const wi of l) {
        const ri = W[wi * 2], k = W[wi * 2 + 1];
        if (onRings.has(ri)) continue;
        const R = rings[ri], m = R.nodes.length, a = R.nodes[k], b = R.nodes[(k + 1) % m];
        if (a === n || b === n) continue;
        // tolerance: the made-up footprints reach further onto the real ones (never the other way)
        const lim = myWide && !R.wide ? wideTol : tol;
        const ax = NX[a], az = NZ[a], dx = NX[b] - ax, dz = NZ[b] - az, L2 = dx * dx + dz * dz;
        if (L2 < 1e-6) continue;
        const t = ((nx - ax) * dx + (nz - az) * dz) / L2;
        if (t < -0.02 || t > 1.02) continue;
        const tc = Math.max(0, Math.min(1, t)), px = ax + dx * tc, pz = az + dz * tc, d = Math.hypot(nx - px, nz - pz);
        if (d > lim || (best && d >= best.d)) continue;
        best = { d, ri, k, t: tc, px, pz, a, b, L: Math.sqrt(L2) };
      }
      if (!best) continue;
      const endA = best.t * best.L < 0.02, endB = (1 - best.t) * best.L < 0.02;
      if (endA || endB) {
        // it meets that wall at a corner of it: one node (unless the two are already on one ring)
        const m = endA ? best.a : best.b;
        const mr = ringsOf.get(m);
        let clash = false;
        for (const r of onRings) if (mr && mr.has(r)) { clash = true; break; }
        if (clash || dead.has(m)) continue;
        // n takes m's place everywhere (it moves to m, unless n is the one that must not move)
        for (const r of mr || []) { const R = rings[r]; R.nodes = R.nodes.map((q) => (q === m ? n : q)); onRings.add(r); }
        if (!NF[n]) { NX[n] = NX[m]; NZ[n] = NZ[m]; }
        NF[n] = NF[n] || NF[m];
        moved.add(n); dead.add(m);
        merges++; changed++;
        continue;
      }
      if (best.d < 1e-3 && ins.has(best.ri) && ins.get(best.ri).some((q) => q.node === n)) continue;
      if (!NF[n]) { NX[n] = best.px; NZ[n] = best.pz; }
      let a = ins.get(best.ri); if (!a) ins.set(best.ri, (a = []));
      a.push({ k: best.k, t: best.t, node: n });
      moved.add(n);
      tees++; changed++;
    }
    for (const [ri, list] of ins) {
      const R = rings[ri], out = [];
      list.sort((p, q) => p.k - q.k || p.t - q.t);
      let li = 0;
      for (let k = 0; k < R.nodes.length; k++) {
        out.push(R.nodes[k]);
        while (li < list.length && list[li].k === k) { if (!out.includes(list[li].node)) out.push(list[li].node); li++; }
      }
      R.nodes = out;
    }
    rings.forEach(tidy);
    if (!changed) break;
  }
  // ---- what is left a few millimetres apart (two corners the first pass put in different clusters, at the edge of
  // its reach): one corner, wherever no footprint holds both
  {
    const snap = 0.02, grid = new Map(), live = new Set();
    rings.forEach((R) => { for (const n of R.nodes) live.add(n); });
    const ringsOf = new Map();
    rings.forEach((R, ri) => { for (const n of R.nodes) { let s2 = ringsOf.get(n); if (!s2) ringsOf.set(n, (s2 = new Set())); s2.add(ri); } });
    for (const n of live) { const k = Math.floor(NX[n] / snap) * 73856093 ^ Math.floor(NZ[n] / snap) * 19349663; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(n); }
    const to = new Map();
    const find = (n) => { while (to.has(n)) n = to.get(n); return n; };
    for (const n of live) {
      if (to.has(n)) continue;
      near(NX[n], NZ[n], snap, snap, grid, (m) => {
        if (m === n || to.has(m) || to.has(n)) return;
        if (Math.hypot(NX[m] - NX[n], NZ[m] - NZ[n]) > snap) return;
        const rn = ringsOf.get(n), rm = ringsOf.get(m);
        for (const r of rm) if (rn.has(r)) return; // (both on one footprint: not merged)
        to.set(m, n);
        for (const r of rm) rn.add(r);
        if (NF[m] && !NF[n]) { NX[n] = NX[m]; NZ[n] = NZ[m]; NF[n] = 1; }
        merges++;
      });
    }
    if (to.size) { rings.forEach((R) => { R.nodes = R.nodes.map(find); }); rings.forEach(tidy); }
  }
  // ---- written back; a footprint the welding spoilt (flipped, collapsed, crossed) keeps its own shape
  let reverted = 0;
  const crosses = (arr) => {
    const n = arr.length / 2;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      const ax = arr[i * 2], az = arr[i * 2 + 1], bx = arr[((i + 1) % n) * 2], bz = arr[((i + 1) % n) * 2 + 1];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const cx = arr[j * 2], cz = arr[j * 2 + 1], dx = arr[((j + 1) % n) * 2], dz = arr[((j + 1) % n) * 2 + 1];
        const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
        const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
        if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
      }
    }
    return false;
  };
  const shared = new Map(); // node → number of part rings on it
  for (const R of rings) {
    const arr = [];
    for (const n of R.nodes) arr.push(NX[n], NZ[n]);
    const a0 = ringArea(R.orig), a1 = arr.length >= 6 ? ringArea(arr) : 0;
    const bad = arr.length < 6 || Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < Math.abs(a0) * 0.6 - 0.3 || crosses(arr);
    const out = bad ? R.orig : arr;
    if (bad) { reverted++; R.nodes = null; }
    const f32 = new Float32Array(out);
    if (R.key === 'ring') R.owner.ring = f32; else R.owner.holes[R.key] = f32;
    if (!bad && R.kind === 'p') for (const n of new Set(R.nodes)) shared.set(n, (shared.get(n) || 0) + 1);
  }
  for (const p of map.parts) { p.c = ringCentroid(p.ring); p.area = Math.abs(ringArea(p.ring)); }
  for (const b of map.buildings) b.c = ringCentroid(b.ring);
  // the corners shared by two parts or more (a party wall's ends): never rounded by the claymation
  const keys = new Set();
  const key = (x, z) => Math.round(x * 200) + ':' + Math.round(z * 200);
  for (const [n, c] of shared) if (c > 1) keys.add(key(Math.fround(NX[n]), Math.fround(NZ[n]))); // (as the rings store them)
  map.sharedCorner = (x, z) => keys.has(key(x, z));
  map.sharedKeys = keys; map.sharedKey = key; // (for the pieces of wall added after: fillCracks)
  map.reindexBuildings();
  return { rings: rings.length, nodes: NX.length, corners: NV, tees, merges, reverted, shared: keys.size };
}

// ------------------------------------------------------------------ cracks
// What is left between the houses, found as the audit finds it: along every wall, every 25 cm, straight out — is there a
// wall of another house (or of this one: a notch) across within 1.3 m, at less than 37° to this one? Each run of such
// samples along a wall (a wall as the welding left it: its straight stretches taken together, however many corners the
// neighbours put in it), 10 cm long at least, becomes a piece of wall filling the crack from this wall to that one — its
// far side follows the other wall sample by sample, its ends are found to the centimetre (where the crack opens, or on
// the wall that closes it) —, unless a street or a path runs through it or it touches a landmark. As tall as the lower
// house, flat-topped, without doors (buildings.js). The pieces go in as they are made, so the same crack seen from its other wall is
// closed already; a second pass looks again around the new pieces (the slivers between two of them, or beside one).
// Returns the parts added.
export function fillCracks(map, { maxGap = 1.3, minGap = 0.00002, step = 0.25, maxAngle = 37, minRun = 0.1, passes = 3, claims = () => false, skip = () => false, why = null, only = null, trace = null } = {}) {
  const cosMin = Math.cos((maxAngle * Math.PI) / 180), OFF = 0.000002, cosChain = Math.cos((20 * Math.PI) / 180);
  const { x0, z0, x1, z1 } = map.bounds, pIx = new PolyIndex(x0 - 400, z0 - 400, x1 + 400, z1 + 400, 16);
  // every wall, in a grid of 2 m cells: [ax, az, bx, bz, part]
  const cell = 2, grid = new Map(), ck = (gx, gz) => gx * 73856093 ^ gz * 19349663;
  const addRing = (part, r) => {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
      if (ax === bx && az === bz) continue;
      const w = [ax, az, bx, bz, part];
      for (let gx = Math.floor(Math.min(ax, bx) / cell); gx <= Math.floor(Math.max(ax, bx) / cell); gx++)
        for (let gz = Math.floor(Math.min(az, bz) / cell); gz <= Math.floor(Math.max(az, bz) / cell); gz++) {
          const k = ck(gx, gz); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(w);
        }
    }
  };
  const addPart = (part) => { pIx.add(part.ring, part); addRing(part, part.ring); for (const h of part.holes || []) addRing(part, h); };
  for (const p of map.parts) addPart(p);
  const solidOf = (q, x, z) => pointInRing(x, z, q.ring) && !(q.holes && q.holes.some((h) => pointInRing(x, z, h)));
  // (per stretch of wall: the parts about it, gathered once)
  let LP = [];
  const gather = (bx0, bz0, bx1, bz1, not) => {
    LP = []; pIx.query(bx0 - 0.01, bz0 - 0.01, bx1 + 0.01, bz1 + 0.01, LP);
    LP = LP.filter((c) => c.data !== not);
  };
  const insideOther = (x, z) => {
    for (const c of LP) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && solidOf(c.data, x, z)) return c.data;
    return null;
  };
  // the ray from (sx, sz) along (nx, nz): the first wall within maxGap → { t, q, hx, hz, cos, w: that wall } (cos: of
  // its angle to the wall the ray leaves, ux/uz)
  const cast = (sx, sz, nx, nz, ux, uz) => {
    let best = maxGap, hit = null;
    const ex = sx + nx * maxGap, ez = sz + nz * maxGap;
    for (let gx = Math.floor(Math.min(sx, ex) / cell); gx <= Math.floor(Math.max(sx, ex) / cell); gx++)
      for (let gz = Math.floor(Math.min(sz, ez) / cell); gz <= Math.floor(Math.max(sz, ez) / cell); gz++) {
        const l = grid.get(ck(gx, gz));
        if (l) for (const w of l) {
          const cx = w[0], cz = w[1], fx = w[2] - cx, fz = w[3] - cz, den = nx * fz - nz * fx;
          if (den > -1e-12 && den < 1e-12) continue;
          const t = ((cx - sx) * fz - (cz - sz) * fx) / den;
          if (!(t > 1e-7 && t < best)) continue;
          const u = ((cx - sx) * nz - (cz - sz) * nx) / den;
          if (u >= -1e-6 && u <= 1 + 1e-6) { best = t; hit = w; }
        }
      }
    if (!hit) return null;
    const fx = hit[2] - hit[0], fz = hit[3] - hit[1];
    return { t: best, q: hit[4], hx: sx + nx * best, hz: sz + nz * best, cos: Math.abs(ux * fx + uz * fz) / (Math.hypot(fx, fz) || 1), w: hit };
  };
  const pathThrough = (ring) => {
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { bx0 = Math.min(bx0, ring[i]); bx1 = Math.max(bx1, ring[i]); bz0 = Math.min(bz0, ring[i + 1]); bz1 = Math.max(bz1, ring[i + 1]); }
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, rr = Math.max(bx1 - bx0, bz1 - bz0) / 2 + 1;
    for (const id of map.edgesNear(cx, cz, rr)) {
      const e = map.edges[id];
      if (!(e.walk || e.drive)) continue;
      const p = e.pts;
      for (let k = 0; k + 3 < p.length; k += 2) if (segCrossesRing(p[k], p[k + 1], p[k + 2], p[k + 3], ring) || pointInRing(p[k], p[k + 1], ring)) return true;
      if (pointInRing(p[p.length - 2], p[p.length - 1], ring)) return true;
    }
    return false;
  };
  const lineX = (ax, az, bx, bz, cx, cz, dx, dz) => { // where line a→b meets line c→d (t along a→b), or null
    const ex = bx - ax, ez = bz - az, fx = dx - cx, fz = dz - cz, den = ex * fz - ez * fx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((cx - ax) * fz - (cz - az) * fx) / den;
    return [ax + ex * t, az + ez * t];
  };
  const no = (x, z, a, b, reason) => { if (why) why.push({ x: +x.toFixed(2), z: +z.toFixed(2), a, b, reason }); };
  const added = [];
  // one stretch of wall: its edges (indices into ring r), the samples along it, the runs, the pieces
  const doChain = (p, r, edges) => {
    const n = r.length / 2;
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (const i of edges) for (const v of [i, (i + 1) % n]) { bx0 = Math.min(bx0, r[v * 2]); bx1 = Math.max(bx1, r[v * 2]); bz0 = Math.min(bz0, r[v * 2 + 1]); bz1 = Math.max(bz1, r[v * 2 + 1]); }
    gather(bx0, bz0, bx1, bz1, p);
    // the edges laid end to end: s0 (arc length at its start), and its frame
    const E = [];
    let sAcc = 0;
    for (const i of edges) {
      const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], dx = r[j * 2] - ax, dz = r[j * 2 + 1] - az, L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const ux = dx / L, uz = dz / L;
      let nx = uz, nz = -ux;
      const mx = ax + dx / 2, mz = az + dz / 2, sOut = solidOf(p, mx + nx * 0.005, mz + nz * 0.005), sIn = solidOf(p, mx - nx * 0.005, mz - nz * 0.005);
      if (sOut && !sIn) { nx = -nx; nz = -nz; }
      else if (sOut === sIn && ringArea(r) * (r === p.ring ? 1 : -1) < 0) { nx = -nx; nz = -nz; }
      E.push({ i, ax, az, dx, dz, L, ux, uz, nx, nz, s0: sAcc });
      sAcc += L;
    }
    if (!E.length) return;
    const total = sAcc;
    const pointAt = (s) => { // on the wall at arc length s: [x, z, edge]
      let e = E[0];
      for (const f of E) { if (s >= f.s0 - 1e-9) e = f; else break; }
      const t = Math.max(0, Math.min(1, (s - e.s0) / e.L));
      return [e.ax + e.dx * t, e.az + e.dz * t, e];
    };
    const rayAt = (s) => {
      const [x, z, e] = pointAt(s);
      return cast(x + e.nx * OFF, z + e.nz * OFF, e.nx, e.nz, e.ux, e.uz);
    };
    // the samples
    const S = [];
    for (const e of E) {
      const K = Math.max(1, Math.round(e.L / step)), h = e.L / K / 2;
      for (let k = 0; k < K; k++) {
        const s = e.s0 + (2 * k + 1) * h, t = (2 * k + 1) / (2 * K), px = e.ax + e.dx * t, pz = e.az + e.dz * t, sx = px + e.nx * OFF, sz = pz + e.nz * OFF;
        let smp = null;
        if (!insideOther(sx, sz)) {
          const c = cast(sx, sz, e.nx, e.nz, e.ux, e.uz);
          if (c && c.cos >= cosMin && c.t + OFF >= minGap) smp = { s, h, w: c.t + OFF, q: c.q, hx: c.hx, hz: c.hz, wall: c.w };
        }
        S.push(smp || { s, h, q: null });
      }
    }
    if (trace) trace(p, edges, total, S);
    // the runs
    for (let k = 0; k < S.length; ) {
      if (!S[k].q) { k++; continue; }
      let m = k;
      while (m + 1 < S.length && S[m + 1].q === S[k].q && Math.abs(S[m + 1].w - S[m].w) <= 0.3) m++;
      const k0 = k, k1 = m, A = S[k0], B = S[k1], q = A.q;
      k = m + 1;
      const sA0 = k0 === 0 ? 0 : A.s - A.h, sB0 = k1 === S.length - 1 ? total : B.s + B.h;
      if (sB0 - sA0 < minRun - 1e-6) continue;
      if (skip(q)) { no(A.hx, A.hz, p.id, q.id, 'skip'); continue; }
      // an end: the crack still there at s (the other wall, as far) — or closed there by a wall across it (the
      // piece's end then lies along that wall) — or found where it ends, between the last sample and s
      const endOf = (ref, s) => {
        const c = rayAt(s);
        if (c && c.cos >= cosMin && Math.abs(c.t + OFF - ref.w) <= 0.3) { const P = pointAt(s); return { near: [P[0], P[1]], far: [c.hx, c.hz], s }; }
        if (c && c.cos < cosMin && c.t <= ref.w + 0.3) {
          const bw = c.w, fw = ref.wall, P = pointAt(s), e = P[2];
          const Xn = lineX(e.ax, e.az, e.ax + e.dx, e.az + e.dz, bw[0], bw[1], bw[2], bw[3]);
          const Xf = lineX(fw[0], fw[1], fw[2], fw[3], bw[0], bw[1], bw[2], bw[3]);
          if (Xn && Xf && Math.hypot(Xn[0] - P[0], Xn[1] - P[1]) < 0.06 && Math.hypot(Xf[0] - ref.hx, Xf[1] - ref.hz) < Math.abs(s - ref.s) + ref.w + 0.3)
            return { near: [P[0], P[1]], far: Xf, s };
        }
        // (bisection: from the sample, which has the crack, towards s, which has not)
        let lo = ref.s, hi = s, got = null;
        for (let it = 0; it < 6; it++) {
          const mid = (lo + hi) / 2, cm = rayAt(mid);
          if (cm && cm.cos >= cosMin && Math.abs(cm.t + OFF - ref.w) <= 0.3) { lo = mid; got = cm; } else hi = mid;
        }
        const P = pointAt(lo);
        return got ? { near: [P[0], P[1]], far: [got.hx, got.hz], s: lo } : { near: [P[0], P[1]], far: [ref.hx, ref.hz], s: ref.s };
      };
      const eA = endOf(A, sA0), eB = endOf(B, sB0);
      if (eB.s - eA.s < minRun * 0.5) continue;
      // near side: along this wall, with its corners between; far side: back along the other wall
      const ring = [eA.near[0], eA.near[1]];
      for (const e of E) if (e.s0 > eA.s + 1e-4 && e.s0 < eB.s - 1e-4) ring.push(e.ax, e.az);
      ring.push(eB.near[0], eB.near[1]);
      // (the far side exactly on the other wall: where two samples hit two walls of it, the corner between them too)
      const far = [eB.far];
      let prevWall = null;
      for (let kk = k1; kk >= k0; kk--) {
        const sm = S[kk];
        if (!(sm.s > eA.s && sm.s < eB.s)) continue;
        if (prevWall && prevWall !== sm.wall) {
          const a = prevWall, b = sm.wall;
          for (const [vx, vz] of [[a[0], a[1]], [a[2], a[3]]]) if ((vx === b[0] && vz === b[1]) || (vx === b[2] && vz === b[3])) { far.push([vx, vz]); break; }
        }
        far.push([sm.hx, sm.hz]);
        prevWall = sm.wall;
      }
      far.push(eA.far);
      const keep = [far[0]];
      for (let kk = 1; kk < far.length - 1; kk++) {
        const a = keep[keep.length - 1], b = far[kk + 1], c = far[kk], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-4) continue;
        if (l > 1e-6 && Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / l < 1e-4) continue;
        keep.push(c);
      }
      keep.push(far[far.length - 1]);
      for (const v of keep) ring.push(v[0], v[1]);
      let rr = ring;
      if (ringArea(rr) < 0) { const r2 = []; for (let kk = rr.length - 2; kk >= 0; kk -= 2) r2.push(rr[kk], rr[kk + 1]); rr = r2; }
      const area = Math.abs(ringArea(rr)), c = ringCentroid(rr);
      if (area < 1e-7) continue;
      if (selfCrosses(rr)) { no(c[0], c[1], p.id, q.id, 'cross'); continue; }
      if (claims(c[0], c[1])) { no(c[0], c[1], p.id, q.id, 'claims'); continue; }
      if (pathThrough(rr)) { no(c[0], c[1], p.id, q.id, 'path'); continue; }
      const fa = p.floors || 1, fb = q.floors || 1, owner = p.b >= 0 ? p : q;
      const part = { id: map.parts.length, ring: new Float32Array(rr), holes: null, floors: Math.min(fa, fb), b: owner.b, c, area, filler: true, between: [p.id, q.id] };
      map.parts.push(part);
      addPart(part);
      added.push(part);
    }
  };
  // a ring's straight stretches: edges joined where the wall bends less than 20°, from a real corner
  const chainsOf = (r) => {
    const n = r.length / 2, bend = new Array(n);
    for (let i = 0; i < n; i++) {
      const h = (i - 1 + n) % n, j = (i + 1) % n;
      const e0x = r[i * 2] - r[h * 2], e0z = r[i * 2 + 1] - r[h * 2 + 1], e1x = r[j * 2] - r[i * 2], e1z = r[j * 2 + 1] - r[i * 2 + 1];
      bend[i] = (e0x * e1x + e0z * e1z) / ((Math.hypot(e0x, e0z) * Math.hypot(e1x, e1z)) || 1) < cosChain;
    }
    let s0 = bend.indexOf(true);
    if (s0 < 0) s0 = 0;
    const out = [];
    let cur = [];
    for (let k = 0; k < n; k++) {
      const i = (s0 + k) % n;
      if (k > 0 && bend[i]) { out.push(cur); cur = []; }
      cur.push(i);
    }
    if (cur.length) out.push(cur);
    return out;
  };
  let todo = only ? [...only].map((id) => map.parts[id]).filter(Boolean) : map.parts.slice();
  for (let pass = 0; pass < passes && todo.length; pass++) {
    const before = added.length;
    for (const p of todo) {
      if (skip(p)) continue;
      for (const r of [p.ring, ...(p.holes || [])]) if (r.length >= 6) for (const ch of chainsOf(r)) doChain(p, r, ch);
    }
    // next pass: the new pieces and what stands about them
    const fresh = added.slice(before), next = new Set();
    for (const f of fresh) {
      next.add(f);
      const c = [];
      let fx0 = Infinity, fz0 = Infinity, fx1 = -Infinity, fz1 = -Infinity;
      for (let i = 0; i < f.ring.length; i += 2) { fx0 = Math.min(fx0, f.ring[i]); fx1 = Math.max(fx1, f.ring[i]); fz0 = Math.min(fz0, f.ring[i + 1]); fz1 = Math.max(fz1, f.ring[i + 1]); }
      pIx.query(fx0 - 1.5, fz0 - 1.5, fx1 + 1.5, fz1 + 1.5, c);
      for (const q of c) next.add(q.data);
    }
    todo = [...next];
  }
  // the corners of the houses a piece meets (to 3 cm): shared, never rounded by the claymation — the piece runs on square
  if (map.sharedKeys) {
    const keys = map.sharedKeys, key = map.sharedKey, c = [];
    for (const f of added) {
      const fr = f.ring;
      let fx0 = Infinity, fz0 = Infinity, fx1 = -Infinity, fz1 = -Infinity;
      for (let i = 0; i < fr.length; i += 2) { fx0 = Math.min(fx0, fr[i]); fx1 = Math.max(fx1, fr[i]); fz0 = Math.min(fz0, fr[i + 1]); fz1 = Math.max(fz1, fr[i + 1]); }
      c.length = 0; pIx.query(fx0 - 0.03, fz0 - 0.03, fx1 + 0.03, fz1 + 0.03, c);
      for (const q of c) for (const r of [q.data.ring, ...(q.data.holes || [])]) for (let i = 0; i < r.length; i += 2)
        for (let k = 0; k < fr.length; k += 2) if (Math.abs(r[i] - fr[k]) <= 0.03 && Math.abs(r[i + 1] - fr[k + 1]) <= 0.03) { keys.add(key(r[i], r[i + 1])); keys.add(key(fr[k], fr[k + 1])); }
    }
  }
  return added;
}
function selfCrosses(arr) {
  const n = arr.length / 2;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const ax = arr[i * 2], az = arr[i * 2 + 1], bx = arr[((i + 1) % n) * 2], bz = arr[((i + 1) % n) * 2 + 1];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const cx = arr[j * 2], cz = arr[j * 2 + 1], dx = arr[((j + 1) % n) * 2], dz = arr[((j + 1) % n) * 2 + 1];
      const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
      const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
      if (((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))) return true;
    }
  }
  return false;
}

function segCrossesRing(ax, az, bx, bz, r) {
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, cx = r[i * 2], cz = r[i * 2 + 1], dx = r[j * 2], dz = r[j * 2 + 1];
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return false;
}

// ------------------------------------------------------------------ the audit
// The narrow gaps along the town's walls, measured: from every wall, every 25 cm, straight out — how far to the next
// house (up to maxW)? A wall touching another (or inside it) has none; one with a house 2 cm – 1.5 m in front of it
// faces a crack or a slot you would see through. Returns the metres of wall per width, and the worst places.
// seeOff: how near a neighbour must be for the house builder to hide a wall (buildings.js COVER_OFF): a crack is seen
// through only where both its walls are hidden — its sides nearer each other than that — and its metres are counted
// apart (seeThrough), as are the inner corners where two walls meet at more than 37° (not a crack).
export function auditGaps(map, { maxW = 1.5, step = 0.25, parts = map.parts, inTown = true, detail = null, seeOff = 0.0002, skip = null } = {}) {
  const PR = 0.0001; // (the probe: a tenth of a millimetre off the wall)
  const { x0, z0, x1, z1 } = map.bounds, ix = new PolyIndex(x0 - 400, z0 - 400, x1 + 400, z1 + 400, 16);
  for (const p of parts) ix.add(p.ring, p);
  const inside = (x, z, not) => { // in a part (not in its courtyards)
    const c = []; ix.query(x - 1e-3, z - 1e-3, x + 1e-3, z + 1e-3, c);
    for (const q of c) { const d = q.data; if (d === not) continue; if (pointInRing(x, z, d.ring) && !(d.holes && d.holes.some((h) => pointInRing(x, z, h)))) return d; }
    return null;
  };
  const bins = [0.002, 0.02, 0.1, 0.3, 0.6, 1.0, 1.3, 1.5], metres = new Array(bins.length).fill(0), cracks = new Array(bins.length).fill(0);
  const worst = [];
  let touching = 0, open = 0, seeThrough = 0, corners = 0, landmark = 0;
  const cand = [];
  for (const p of parts) {
    if (inTown && !map.inTown(p.c[0], p.c[1])) continue;
    if (skip && skip(p)) continue; // (a landmark's own outline: its model is drawn instead)
    for (const r of [p.ring, ...(p.holes || [])]) {
      const n = r.length / 2, hole = r !== p.ring;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], dx = r[j * 2] - ax, dz = r[j * 2 + 1] - az, L = Math.hypot(dx, dz);
        if (L < 0.1) continue;
        let nx = dz / L, nz = -dx / L;
        // (outward: away from the part's solid)
        const mx = ax + dx / 2, mz = az + dz / 2;
        const solid = (x, z) => pointInRing(x, z, p.ring) && !(p.holes && p.holes.some((h) => pointInRing(x, z, h)));
        if (solid(mx + nx * 0.01, mz + nz * 0.01)) { nx = -nx; nz = -nz; }
        void hole;
        const K = Math.max(1, Math.round(L / step));
        for (let k = 0; k < K; k++) {
          const t = (k + 0.5) / K, sx = ax + dx * t + nx * PR, sz = az + dz * t + nz * PR;
          if (t * L < 0.06 || (1 - t) * L < 0.06) continue; // (the corners themselves)
          if (inside(sx, sz, p)) { touching += L / K; continue; }
          // the ray out: the first wall of any part it meets
          const ex = sx + nx * maxW, ez = sz + nz * maxW;
          cand.length = 0; ix.query(Math.min(sx, ex), Math.min(sz, ez), Math.max(sx, ex), Math.max(sz, ez), cand);
          let best = maxW, hit = null, hdx = 0, hdz = 0;
          for (const q of cand) {
            const d = q.data;
            for (const rr of [d.ring, ...(d.holes || [])]) {
              const m = rr.length / 2;
              for (let a = 0; a < m; a++) {
                const b = (a + 1) % m, cx = rr[a * 2], cz = rr[a * 2 + 1], fx = rr[b * 2] - cx, fz = rr[b * 2 + 1] - cz;
                const den = nx * fz - nz * fx;
                if (Math.abs(den) < 1e-12) continue;
                const tt = ((cx - sx) * fz - (cz - sz) * fx) / den, u = ((cx - sx) * nz - (cz - sz) * nx) / den;
                if (tt > 1e-6 && tt < best && u >= 0 && u <= 1) { best = tt; hit = d; hdx = fx; hdz = fz; }
              }
            }
          }
          if (!hit) { open += L / K; continue; }
          const w = best + PR;
          if (skip && skip(hit) && w < maxW) { landmark += L / K; continue; } // (facing a landmark: its model, not that outline)
          const bi = bins.findIndex((b) => w < b);
          if (bi < 0) { open += L / K; continue; }
          metres[bi] += L / K;
          // (the kind: the two walls nearly parallel — a slot —, at a small angle — a wedge from a corner they share — or
          // at a large one: an inner corner, which is no crack)
          const hl = Math.hypot(hdx, hdz) || 1, cosA = Math.abs((dx * hdx + dz * hdz) / (L * hl));
          if (cosA < 0.8) corners += L / K;
          else {
            cracks[bi] += L / K;
            if (w < seeOff) seeThrough += L / K; // (both sides hidden: seen through)
          }
          if (detail) detail.push({ w, len: L / K, x: sx + nx * w / 2, z: sz + nz * w / 2, a: p.id, b: hit.id, self: hit === p, par: cosA > 0.978, cosA });
          if (w >= 0.005 && w < 0.6) worst.push({ w: +w.toFixed(3), x: +(sx + nx * w / 2).toFixed(1), z: +(sz + nz * w / 2).toFixed(1), a: p.id, b: hit.id, self: hit === p });
        }
      }
    }
  }
  // the worst places: one per 3 m
  const keep = [];
  for (const q of worst.sort((p, q) => p.w - q.w)) if (!keep.some((k) => Math.abs(k.x - q.x) < 3 && Math.abs(k.z - q.z) < 3)) keep.push(q);
  const table = {}, ctable = {};
  bins.forEach((b, i) => { table[`<${b}`] = +metres[i].toFixed(1); ctable[`<${b}`] = +cracks[i].toFixed(1); });
  return { metres: table, cracks: ctable, seeThrough: +seeThrough.toFixed(1), innerCorners: Math.round(corners), landmark: Math.round(landmark), touching: Math.round(touching), open: Math.round(open), places: keep.length, worst: keep.slice(0, 40), all: keep };
}
