// Street fronts the Catastro leaves open where the town has houses (a parcel with no building recorded in it, or one
// too new for the data) — players who live there noticed: «en mi calle hay un espacio que no existe». A run of a
// street's facade line in town with no building for 6–28 m, with buildings at both ends, that is not a square, a park,
// a car park, a school yard, a pitch… nor where a side street or a path comes in, gets a house: its front on the
// neighbours' facade line, as deep as the plot allows (5–11 m), as tall as the neighbours. They are ordinary buildings
// from then on (doors, windows, roofs, collisions, an inside like any neighbour's).
import { ringCentroid, ringArea, polyNearest } from './util.js';

const OPEN = /^(leisure:(park|pitch|playground|sports_centre|swimming_pool|garden)|amenity:(school|college|kindergarten|parking|marketplace|clinic|hospital)|place:square|highway:pedestrian|landuse:(cemetery|grass|village_green|orchard|forest|military|construction|brownfield)|natural:|man_made:)/;

function crossing(r) {
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = r[i * 2], az = r[i * 2 + 1], bx = r[((i + 1) % n) * 2], bz = r[((i + 1) % n) * 2 + 1];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const cx = r[j * 2], cz = r[j * 2 + 1], dx = r[((j + 1) % n) * 2], dz = r[((j + 1) % n) * 2 + 1];
      const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
      const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  }
  return false;
}
function pip(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}

export function infillGaps(map, { claims = () => false, why = null } = {}) {
  const no = (e, i, j, reason) => { if (why) why.push({ street: e.name || '', id: e.id, s0: i, s1: j, reason }); };
  const open = map.areas.filter((a) => OPEN.test(a.kind)).map((a) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < a.ring.length; i += 2) { x0 = Math.min(x0, a.ring[i]); x1 = Math.max(x1, a.ring[i]); z0 = Math.min(z0, a.ring[i + 1]); z1 = Math.max(z1, a.ring[i + 1]); }
    return { ring: a.ring, x0, z0, x1, z1 };
  });
  const isOpen = (x, z) => open.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1 && pip(x, z, a.ring));
  // another street or path here (within its own width and a margin)?
  const roadAt = (x, z, skip, m) => {
    for (const id of map.edgesNear(x, z, 4)) {
      const ee = map.edges[id];
      if (id === skip || !(ee.walk || ee.drive)) continue;
      if (polyNearest(ee.pts, ee.cum, x, z).d < ee.w / 2 + m) return true;
    }
    return false;
  };
  // does a street's carriageway (its line, and its half width either side) come into this outline?
  const overStreet = (ring) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]); }
    const t = {};
    for (const id of map.edgesNear((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 8)) {
      const ee = map.edges[id];
      if (!(ee.walk || ee.drive) || ee.dirt || ee.cls === 'track') continue;
      for (let s = 0; s <= ee.len; s += 0.5) {
        map.sample(ee, s, t);
        if (t.x < x0 - 8 || t.x > x1 + 8 || t.z < z0 - 8 || t.z > z1 + 8) continue;
        const hw = Math.min(ee.w / 2, 2.0);
        for (const o of [0, hw, -hw]) if (pip(t.x - t.dz * o, t.z + t.dx * o, ring)) return true;
      }
    }
    return false;
  };
  const tmp = {};
  const added = [];
  map.edges.forEach((e, ei) => {
    if (!(e.walk || e.drive) || e.dirt || e.cls === 'track' || e.cls === 'footway' || e.cls === 'service' || e.len < 14) return;
    const mid = map.sample(e, e.len / 2, {});
    if (!map.inTown(mid.x, mid.z)) return;
    const k0 = e.w / 2 + 0.4;
    for (const side of [-1, 1]) {
      // per metre along the street: how far out the facade stands (null: none within 7.5 m)
      const S = [];
      for (let s = 1; s < e.len - 1; s += 1) {
        map.sample(e, s, tmp);
        const nx = -tmp.dz * side, nz = tmp.dx * side;
        let fd = null;
        for (let o = k0; o <= k0 + 7.5; o += 0.5) if (map.buildingAt(tmp.x + nx * o, tmp.z + nz * o)) { fd = o; break; }
        const qx = tmp.x + nx * (k0 + 3), qz = tmp.z + nz * (k0 + 3);
        const blocked = isOpen(qx, qz) || claims(qx, qz) || roadAt(qx, qz, ei, 1.5);
        S.push({ s, x: tmp.x, z: tmp.z, nx, nz, fd, blocked });
      }
      // runs of open facade with a building at each end
      for (let i = 1; i < S.length - 1; i++) {
        if (S[i].fd !== null || S[i].blocked || S[i - 1].fd === null) continue;
        let j = i;
        while (j < S.length && S[j].fd === null && !S[j].blocked) j++;
        if (j >= S.length || S[j].fd === null) { i = j; continue; } // (open at one end: a corner, the edge of town)
        const n = j - i;
        if (n < 4 || n > 28) { no(e, S[i].s, S[j - 1].s, 'n ' + n); i = j; continue; }
        // (the neighbours' fronts to the centimetre: the samples step half a metre out)
        const fdOf = (q) => { let a = q.fd - 0.5, b = q.fd; for (let it = 0; it < 7; it++) { const m = (a + b) / 2; if (map.buildingAt(q.x + q.nx * m, q.z + q.nz * m)) b = m; else a = m; } return b; };
        const fA = fdOf(S[i - 1]), fB = fdOf(S[j]);
        if (Math.abs(fA - fB) > 4.5) { no(e, S[i].s, S[j - 1].s, 'fronts ' + fA.toFixed(1) + '/' + fB.toFixed(1)); i = j; continue; } // (one of the two is a house far back: not a gap in a row)
        const F = (fA + fB) / 2;
        const P = (sv, d) => { map.sample(e, Math.max(0.05, Math.min(e.len - 0.05, sv)), tmp); return [tmp.x - tmp.dz * side * d, tmp.z + tmp.dx * side * d]; };
        const solidAtP = (x, z) => !!map.buildingAt(x, z);
        // the neighbours' corners on the front line, to the centimetre (along the street)
        const endOn = (sIn, sOut) => { let a = sIn, b = sOut; const [ax, az] = P(a, F + 0.05); if (!solidAtP(ax, az)) return sOut; for (let it = 0; it < 12; it++) { const m = (a + b) / 2, [x, z] = P(m, F + 0.05); if (solidAtP(x, z)) a = m; else b = m; } return b; };
        const s0 = endOn(Math.max(0.05, S[i - 1].s - 1.5), S[i].s + 0.4), s1 = endOn(Math.min(e.len - 0.05, S[j].s + 1.5), S[j - 1].s - 0.4);
        const FA = P(s0, F), FB = P(s1, F);
        const ux0 = FB[0] - FA[0], uz0 = FB[1] - FA[1], chord = Math.hypot(ux0, uz0);
        if (chord < 3.5) { no(e, S[i].s, S[j - 1].s, 'narrow ' + chord.toFixed(1)); i = j; continue; }
        // the plot's own square frame: u along the gap's front (A → B), v straight in, away from the street (a street
        // that bends in front of it does not fold the house)
        const ux = ux0 / chord, uz = uz0 / chord;
        let vx = -uz, vz = ux;
        { map.sample(e, (s0 + s1) / 2, tmp); if (vx * -tmp.dz * side + vz * tmp.dx * side < 0) { vx = -vx; vz = -vz; } }
        const L = (u, v) => [FA[0] + ux * u + vx * v, FA[1] + uz * u + vz * v];
        // as deep as the plot allows, up to 11 m (the next building behind, another street)
        const D = [];
        const uA = Math.min(1, chord / 2), uB = Math.max(chord / 2, chord - 1); // (clear of the neighbours' party walls)
        for (let u = uA; u <= uB + 1e-6; u += Math.max(0.5, Math.min(1, (uB - uA) / 2 || 1))) {
          let d = 11;
          for (let o = 0.5; o <= 11; o += 0.5) {
            const [x, z] = L(u, o);
            if (map.buildingAt(x, z) || isOpen(x, z) || claims(x, z)) { d = o - 0.4; break; }
            if (roadAt(x, z, ei, 0.6)) { d = o - 2; break; }
          }
          D.push([d, u]);
        }
        let [depth, uMin] = D.reduce((m, q) => (q[0] < m[0] ? q : m), [99, 0]);
        if (depth < 5) { no(e, S[i].s, S[j - 1].s, 'depth ' + depth.toFixed(1)); i = j; continue; }
        // (the shallowest point to the centimetre: the house behind, touched)
        { let a = depth, b = depth + 0.5; const [bx, bz] = L(uMin, b); if (map.buildingAt(bx, bz)) { for (let it = 0; it < 7; it++) { const m = (a + b) / 2, [x, z] = L(uMin, m); if (map.buildingAt(x, z)) b = m; else a = m; } depth = a - 0.01; } }
        // the house: its front along the street (every 2 m: it may bend), the back square behind it as deep as the
        // shallowest point allows, each side wall laid along its neighbour's party wall, traced every metre and a half
        // back (solidez.js then welds them into one wall)
        const trace = (uIn, uOut) => { // [u, v] down the neighbour's side, from the front back
          const out = [];
          let last = null;
          for (let v = 0.05; ; ) {
            let a = uIn, b = uOut;
            const [ax, az] = L(a, v), [bx, bz] = L(b, v);
            if (solidAtP(ax, az) && !solidAtP(bx, bz)) { for (let it = 0; it < 10; it++) { const m = (a + b) / 2, [x, z] = L(m, v); if (solidAtP(x, z)) a = m; else b = m; } last = b; }
            else if (last == null) last = uOut;
            out.push([last, Math.min(v, depth)]);
            if (v >= depth - 0.06) break;
            v = Math.min(depth - 0.05, v + 1.5);
          }
          out.push([out[out.length - 1][0], depth]);
          return out;
        };
        const tA = trace(-1.5, 0.4), tB = trace(chord + 1.5, chord - 0.4);
        const outline = (traced) => {
          const ring = [];
          // front (A → B) along the street
          const nF = Math.max(1, Math.round((s1 - s0) / 2));
          for (let k = 0; k <= nF; k++) { const [x, z] = P(s0 + ((s1 - s0) * k) / nF, F); ring.push(x, z); }
          // B's side, front → back; the back, B → A; A's side, back → front
          const B = traced ? tB : [[chord, 0.05], [chord, depth]], A = traced ? tA : [[0, 0.05], [0, depth]];
          for (const q of B) { const [x, z] = L(q[0], q[1]); ring.push(x, z); }
          for (let k = A.length - 1; k >= 0; k--) { const [x, z] = L(A[k][0], A[k][1]); ring.push(x, z); }
          if (ringArea(ring) < 0) { const r2 = []; for (let k = ring.length - 2; k >= 0; k -= 2) r2.push(ring[k], ring[k + 1]); ring.length = 0; ring.push(...r2); }
          return ring;
        };
        let ring = outline(true);
        const want = chord * depth;
        if (crossing(ring) || Math.abs(ringArea(ring)) < 0.7 * want || Math.abs(ringArea(ring)) > 1.4 * want) ring = outline(false);
        if (crossing(ring)) { no(e, S[i].s, S[j - 1].s, 'crossing'); i = j; continue; }
        // (never over a street: no street's or path's carriageway within its outline — a street that bends round
        // behind the plot, another one across its back)
        if (overStreet(ring)) { no(e, S[i].s, S[j - 1].s, 'street'); i = j; continue; }
        // as tall as the neighbours
        const nb = [map.buildingAt(S[i - 1].x + S[i - 1].nx * (S[i - 1].fd + 0.6), S[i - 1].z + S[i - 1].nz * (S[i - 1].fd + 0.6)), map.buildingAt(S[j].x + S[j].nx * (S[j].fd + 0.6), S[j].z + S[j].nz * (S[j].fd + 0.6))].filter(Boolean);
        const floors = Math.max(1, Math.min(3, Math.round(nb.reduce((a, b) => a + (b.floors || 1), 0) / Math.max(1, nb.length))));
        const c = ringCentroid(ring), area = Math.abs(ringArea(ring));
        if (area < 0.6 * want || area > 1.5 * want) { no(e, S[i].s, S[j - 1].s, 'area'); i = j; continue; } // (a tight bend folds the strip: no house)
        const b = { id: map.buildings.length, ring, holes: null, use: 0, year: 1975, floors, area, c, height: 0, infill: true };
        map.buildings.push(b);
        map.parts.push({ id: map.parts.length, ring, holes: null, floors, b: b.id, c, area });
        map.bIndex.add(ring, b);
        added.push({ id: b.id, street: e.name || '', len: n, depth: +depth.toFixed(1), floors });
        i = j;
      }
    }
  });
  return added;
}

// Shops the map is missing that players know: the kebab and the gym in the calle de Don Juan Durán. A ground floor on
// the street (a building of shop size, not one a landmark has taken) gets the shop's map point, just inside its front;
// the shop system makes the door and the inside (src/shops.js: SHOP_TYPES.kebab, .gimnasio). The map's own kebab
// point (OpenStreetMap has it a street away) moves there.
export function placeStreetShops(map, { claims = () => false } = {}) {
  const front = (name, frac, side) => {
    const es = map.edges.filter((e) => e.name === name);
    if (!es.length) return null;
    const e = es.reduce((a, b) => (b.len > a.len ? b : a)), q = {};
    for (let k = 0; k < 16; k++) {
      const f = frac + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.03;
      if (f < 0.08 || f > 0.92) continue;
      map.sample(e, e.len * f, q);
      const nx = -q.dz * side, nz = q.dx * side;
      for (let o = e.w / 2 + 0.5; o < e.w / 2 + 6; o += 0.25) {
        const x = q.x + nx * o, z = q.z + nz * o, b = map.buildingAt(x, z);
        if (!b) continue;
        if (b.area < 40 || b.area > 700 || claims(x, z) || b.shopTaken) break;
        b.shopTaken = true;
        return { x: x + nx * 1.5, z: z + nz * 1.5 };
      }
    }
    return null;
  };
  const out = [];
  const kb = front('Calle de Don Juan Durán', 0.42, 1);
  if (kb) {
    const own = map.pois.findIndex((p) => p.kind === 'amenity:fast_food' && /ke[bv]ab/i.test(p.name || ''));
    const name = own >= 0 ? map.pois[own].name : 'Kebab';
    if (own >= 0) map.pois.splice(own, 1);
    map.pois.push({ kind: 'amenity:fast_food', name, title: name, shopType: 'kebab', x: kb.x, z: kb.z });
    out.push({ kebab: [kb.x, kb.z] });
  }
  const gy = front('Calle de Don Juan Durán', 0.66, -1) || front('Calle de Don Juan Durán', 0.7, 1);
  if (gy) { map.pois.push({ kind: 'leisure:fitness_centre', name: 'Gimnasio', title: 'Gimnasio', shopType: 'gimnasio', x: gy.x, z: gy.z }); out.push({ gym: [gy.x, gy.z] }); }
  return out;
}
