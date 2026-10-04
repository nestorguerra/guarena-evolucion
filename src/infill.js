// Street fronts the Catastro leaves open where the town has houses (a parcel with no building recorded in it, or one
// too new for the data) — players who live there noticed: «en mi calle hay un espacio que no existe». A run of a
// street's facade line in town with no building for 6–28 m, with buildings at both ends, that is not a square, a park,
// a car park, a school yard, a pitch… nor where a side street or a path comes in, gets a house: its front on the
// neighbours' facade line, as deep as the plot allows (5–11 m), as tall as the neighbours. They are ordinary buildings
// from then on (doors, windows, roofs, collisions, an inside like any neighbour's).
import { ringCentroid, ringArea, polyNearest } from './util.js';

const OPEN = /^(leisure:(park|pitch|playground|sports_centre|swimming_pool|garden)|amenity:(school|college|kindergarten|parking|marketplace|clinic|hospital)|place:square|highway:pedestrian|landuse:(cemetery|grass|village_green|orchard|forest|military|construction|brownfield)|natural:|man_made:)/;

function pip(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}

export function infillGaps(map, { claims = () => false } = {}) {
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
        if (n < 6 || n > 28) { i = j; continue; }
        const F = (S[i - 1].fd + S[j].fd) / 2;
        // as deep as the plot allows, up to 11 m (the next building behind, another street)
        const run = S.slice(i, j), D = [];
        for (const q of run) {
          let d = 11;
          for (let o = F + 0.5; o <= F + 11; o += 0.5) {
            const x = q.x + q.nx * o, z = q.z + q.nz * o;
            if (map.buildingAt(x, z) || isOpen(x, z) || claims(x, z)) { d = o - F - 0.4; break; }
            if (roadAt(x, z, ei, 0.6)) { d = o - F - 2; break; }
          }
          D.push(d);
        }
        const depth = Math.min(...D);
        if (depth < 5) { i = j; continue; }
        // the house: its front on the neighbours' line, every 2 m along (the street may bend), the back as deep as the
        // shallowest point allows
        const front = [], back = [];
        for (let k = 0; k < run.length; k += 2) { const q = run[k]; front.push([q.x + q.nx * F, q.z + q.nz * F]); back.push([q.x + q.nx * (F + depth), q.z + q.nz * (F + depth)]); }
        const last = run[run.length - 1];
        front.push([last.x + last.nx * F, last.z + last.nz * F]); back.push([last.x + last.nx * (F + depth), last.z + last.nz * (F + depth)]);
        const ring = [];
        for (const p of front) ring.push(p[0], p[1]);
        for (let k = back.length - 1; k >= 0; k--) ring.push(back[k][0], back[k][1]);
        if (ringArea(ring) < 0) { const r2 = []; for (let k = ring.length - 2; k >= 0; k -= 2) r2.push(ring[k], ring[k + 1]); ring.length = 0; ring.push(...r2); }
        // as tall as the neighbours
        const nb = [map.buildingAt(S[i - 1].x + S[i - 1].nx * (S[i - 1].fd + 0.6), S[i - 1].z + S[i - 1].nz * (S[i - 1].fd + 0.6)), map.buildingAt(S[j].x + S[j].nx * (S[j].fd + 0.6), S[j].z + S[j].nz * (S[j].fd + 0.6))].filter(Boolean);
        const floors = Math.max(1, Math.min(3, Math.round(nb.reduce((a, b) => a + (b.floors || 1), 0) / Math.max(1, nb.length))));
        const c = ringCentroid(ring), area = Math.abs(ringArea(ring));
        if (area < 0.7 * n * depth || area > 1.3 * n * depth) { i = j; continue; } // (a tight bend folds the strip: no house)
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
