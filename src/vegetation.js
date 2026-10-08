// Where each tree of Guareña grows, and which: the countryside of the Vegas Altas (olive groves in their planting
// grid, vines on wires, peach and plum orchards near the town, holm oaks scattered over the pastures, poplars,
// oleanders and reeds along the streams, pines and eucalyptus round the reservoir, eucalyptus lining some roads) and
// the town (one species along a whole street, trees kept clear of doors, bitter oranges round the squares, mixed
// parks with palms and hedges, cypresses in the cemetery, fruit trees and palms in the yards inside the blocks).
import { mulberry32, hash1, hash2, pointInRing, ringArea, ringBounds, polySample } from './util.js';

// a little colour of its own for each tree (brighter or darker, a touch warmer or cooler)
function tintOf(rnd, k = 1) { const b = 1 + (rnd() - 0.5) * 0.2 * k, h = (rnd() - 0.5) * 0.1 * k; return [b * (1 + h), b, b * (1 - h * 0.6)]; }
// how much room each species keeps round it (m)
const ROOM = { olivo: 3.2, encina: 5, platano: 5.5, naranjo: 2.2, limonero: 2.2, morera: 3.2, pino: 6, eucalipto: 4, chopo: 2.6, higuera: 3, frutal: 2.4, adelfa: 1.4, cipres: 1.4, palmera: 4, washingtonia: 2.4, seto: 1, vid: 1, canas: 0.8 };

export function plantTown(world, G, F, q) {
  const map = world.map, rnd = mulberry32(1234), field = world.groundField;
  const counts = {};
  const doors = world.facadeGround || [];
  // (a coarse grid of doors and garages, so no street tree stands in front of one)
  const doorGrid = new Map();
  for (const o of doors) { const k = Math.floor(o.x / 8) + ':' + Math.floor(o.z / 8); let a = doorGrid.get(k); if (!a) doorGrid.set(k, (a = [])); a.push(o); }
  const nearDoor = (x, z, r) => {
    const i = Math.floor(x / 8), j = Math.floor(z / 8);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of doorGrid.get((i + a) + ':' + (j + b)) || []) if (Math.hypot(o.x - x, o.z - z) < r + (o.w || 1) * 0.5) return true;
    return false;
  };
  const roadClear = (x, z, pad) => { const e = map.nearestEdge(x, z, 14); return !(e && e.d < e.edge.w / 2 + pad); };
  const free = (x, z, pad = 1.5) => !map.buildingAt(x, z) && roadClear(x, z, pad);
  // everything planted so far, in a grid, so trees keep their distance from each other (and from what is there)
  const taken = new Map();
  const tk = (x, z) => Math.floor(x / 6) + ':' + Math.floor(z / 6);
  const roomy = (x, z, r) => {
    const i = Math.floor(x / 6), j = Math.floor(z / 6), n = Math.ceil((r + 6) / 6);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (const t of taken.get((i + a) + ':' + (j + b)) || []) if (Math.hypot(t[0] - x, t[1] - z) < Math.min(r, t[2]) + Math.max(r, t[2]) * 0.55) return false;
    return true;
  };
  const cap = q.trees || 6500;
  const put = (name, x, z, o = {}) => {
    const r = (ROOM[name] || 2) * (o.s || 1);
    if (o.check !== false && !roomy(x, z, r)) return null;
    const it = F.add(name, x, z, { rnd, ...o });
    if (!it) return null;
    let a = taken.get(tk(x, z)); if (!a) taken.set(tk(x, z), (a = [])); a.push([x, z, r]);
    counts[name] = (counts[name] || 0) + 1;
    return it;
  };
  const trunk = { olivo: 0.3, encina: 0.4, platano: 0.35, naranjo: 0.15, limonero: 0.15, morera: 0.25, pino: 0.35, eucalipto: 0.35, chopo: 0.25, higuera: 0.2, frutal: 0.12, adelfa: 0.5, cipres: 0.3, palmera: 0.45, washingtonia: 0.25, seto: 0, vid: 0, canas: 0 };
  const T = (name, x, z, o = {}) => put(name, x, z, { trunk: trunk[name] ?? 0.3, tint: tintOf(rnd, o.tk ?? 1), ...o });
  const cx0 = -150, cz0 = 0; // (the centre of the town, roughly)
  const dCentre = (x, z) => Math.hypot(x - cx0, z - cz0);

  // ---------------- the town first (what the player sees from the street), then the countryside out to the cap
  // plaza orange trees and other hand-placed trees from the landmarks module
  for (const t of world.extraTrees || []) if (free(t.x, t.z, 0.8)) T(t.kind === 'arbusto' ? 'adelfa' : t.kind, t.x, t.z, { s: t.s || 1, check: false });
  // street trees: one species (and one age) along a whole street, evenly spaced on the pavement, clear of doors
  world.streetTrees = world.streetTrees || [];
  const streetSpecies = (e) => {
    const h = hash1((e.name ? [...e.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) : e.id) * 0.618);
    if (e.cls === 'primary' || e.cls === 'secondary') return h < 0.65 ? 'platano' : 'morera';
    return h < 0.5 ? 'naranjo' : h < 0.78 ? 'morera' : 'platano';
  };
  for (const e of map.edges) {
    if (!e.drive || e.dirt || e.facade < 13 || e.len < 20) continue;
    if (!['primary', 'tertiary', 'residential', 'unclassified', 'secondary'].includes(e.cls)) continue;
    const sp = streetSpecies(e), step = sp === 'naranjo' ? 6.5 : sp === 'morera' ? 7.5 : 9;
    const size = (sp === 'platano' ? (e.cls === 'primary' ? 0.85 : 0.7) : 0.9) * (0.92 + hash1(e.id * 1.7) * 0.16); // (the street's trees are all of an age)
    const stint = tintOf(mulberry32(e.id + 7), 0.6);
    for (let s = step * 0.6; s < e.len - step * 0.6; s += step) {
      for (const side of [1, -1]) {
        // (a tree in its pit only where the pavement there leaves room to walk past it: 1.8 m or more)
        const pav = map.pavementAt(e, s, side);
        if (pav != null && pav < 1.8) continue;
        const off = map.kerbAt(e, s, side) + (pav != null ? Math.min(1.1, Math.max(0.7, pav * 0.38)) : Math.max(0.9, e.sw * 0.55)); // (from the kerb as laid, kerbs.js)
        const p = polySample(e.pts, e.cum, s, {});
        const x = p.x - p.dz * off * side, z = p.z + p.dx * off * side;
        if (!free(x, z, 0.6) || nearDoor(x, z, 1.2)) continue;
        if (hash2(Math.floor(x), Math.floor(z)) < 0.1) continue; // (a gap here and there: one died, one was never planted)
        const t = T(sp, x, z, { s: size * (0.95 + rnd() * 0.1), tint: stint.map((v) => v * (0.96 + rnd() * 0.08)) });
        if (t) world.streetTrees.push({ x, z, dx: p.dx, dz: p.dz });
      }
    }
  }
  // squares and pedestrian areas: bitter oranges in a ring a few metres in from the edge, palms at the corners
  for (const a of map.areas.filter((a) => a.kind === 'place:square' || a.kind === 'highway:pedestrian' || a.kind === 'amenity:marketplace')) {
    const r = a.ring, area = Math.abs(ringArea(r));
    if (area < 150) continue;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length, L = Math.hypot(r[j] - r[i], r[j + 1] - r[i + 1]);
      const ux = (r[j] - r[i]) / (L || 1), uz = (r[j + 1] - r[i + 1]) / (L || 1);
      const inward = ringArea(r) > 0 ? 1 : -1;
      for (let s = 3; s < L - 3; s += 6) {
        const x = r[i] + ux * s - uz * 3 * inward, z = r[i + 1] + uz * s + ux * 3 * inward;
        if (!pointInRing(x, z, r) || !free(x, z, 0.8)) continue;
        if (T('naranjo', x, z, { s: 0.95 + rnd() * 0.1, tk: 0.6 })) world.streetTrees.push({ x, z, dx: ux, dz: uz });
      }
      if (area > 900 && rnd() < 0.5) { const x = r[i] - uz * 4 * inward + ux * 4, z = r[i + 1] + ux * 4 * inward + uz * 4; if (pointInRing(x, z, r) && free(x, z, 1)) T('palmera', x, z, { s: 0.9 + rnd() * 0.2 }); }
    }
  }
  // parks: big shade trees kept apart, palms, oranges; oleanders and clipped hedges round the edge
  for (const a of G.parkPlots) {
    const [x0, z0, x1, z1] = ringBounds(a.ring), area = Math.abs(ringArea(a.ring));
    const small = area < 1500;
    const n = Math.min(220, Math.max(3, area / (small ? 60 : 85)));
    for (let i = 0; i < n * 3 && (counts._park = (counts._park || 0)) < 99999; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!pointInRing(x, z, a.ring) || !free(x, z, 1.5)) continue;
      const r = rnd();
      const sp = small ? (r < 0.5 ? 'naranjo' : r < 0.7 ? 'palmera' : r < 0.85 ? 'morera' : 'adelfa')
        : (r < 0.26 ? 'platano' : r < 0.44 ? 'pino' : r < 0.56 ? 'morera' : r < 0.66 ? 'naranjo' : r < 0.74 ? 'palmera' : r < 0.78 ? 'washingtonia' : r < 0.84 ? 'cipres' : r < 0.9 ? 'encina' : 'adelfa');
      T(sp, x, z, { s: 0.85 + rnd() * 0.3 });
    }
    // the hedge round a park's edge (with its gaps where the paths come in)
    const rg = a.ring;
    if (area > 600) for (let i = 0; i < rg.length; i += 2) {
      const j = (i + 2) % rg.length, L = Math.hypot(rg[j] - rg[i], rg[j + 1] - rg[i + 1]);
      if (L < 6) continue;
      const ux = (rg[j] - rg[i]) / L, uz = (rg[j + 1] - rg[i + 1]) / L, inward = ringArea(rg) > 0 ? 1 : -1, rot = Math.atan2(-uz, ux);
      for (let s = 1.2; s < L - 1.2; s += 2.05) {
        if (hash1(Math.floor(s / 8) + i * 13 + a.ring.length) < 0.18) continue; // (a gap: a path comes in)
        const x = rg[i] + ux * s - uz * 1.1 * inward, z = rg[i + 1] + uz * s + ux * 1.1 * inward;
        if (!pointInRing(x, z, rg) || !free(x, z, 0.5)) continue;
        put('seto', x, z, { rot, s: 1, sy: 0.9 + rnd() * 0.2, trunk: 0, check: false, tint: tintOf(rnd, 0.5) });
      }
    }
  }
  // schools, sports grounds and car parks: a row of shade trees round their edge
  for (const a of map.areas.filter((a) => a.kind === 'amenity:school' || a.kind === 'leisure:sports_centre' || a.kind === 'amenity:parking' || a.kind === 'amenity:college')) {
    const r = a.ring, sp = a.kind === 'amenity:parking' ? (hash1(r.length) < 0.5 ? 'morera' : 'platano') : (hash1(r.length * 3) < 0.5 ? 'pino' : 'platano');
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length, L = Math.hypot(r[j] - r[i], r[j + 1] - r[i + 1]);
      const ux = (r[j] - r[i]) / (L || 1), uz = (r[j + 1] - r[i + 1]) / (L || 1), inward = ringArea(r) > 0 ? 1 : -1;
      for (let s = 4; s < L - 4; s += 9) {
        const x = r[i] + ux * s - uz * 2.5 * inward, z = r[i + 1] + uz * s + ux * 2.5 * inward;
        if (pointInRing(x, z, r) && free(x, z, 1.5)) T(sp, x, z, { s: sp === 'platano' ? 0.75 : 0.9 });
      }
    }
  }
  // the cemetery: cypresses along its walls and down its middle
  for (const a of map.areas.filter((a) => a.kind === 'landuse:cemetery')) {
    const r = a.ring;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length, L = Math.hypot(r[j] - r[i], r[j + 1] - r[i + 1]);
      for (let s = 3; s < L - 3; s += 6.5) {
        const t = s / L, x = r[i] + (r[j] - r[i]) * t, z = r[i + 1] + (r[j + 1] - r[i + 1]) * t;
        const cx = x + (-(r[j + 1] - r[i + 1]) / L) * -2.5, cz = z + ((r[j] - r[i]) / L) * -2.5;
        if (free(cx, cz, 1)) T('cipres', cx, cz, { s: 0.9 + rnd() * 0.25, tk: 0.5 });
      }
    }
    const [x0, z0, x1, z1] = ringBounds(r), mx = (x0 + x1) / 2;
    for (let z = z0 + 6; z < z1 - 6; z += 7) for (const dx of [-3, 3]) if (pointInRing(mx + dx, z, r) && free(mx + dx, z, 1)) T('cipres', mx + dx, z, { s: 0.85 + rnd() * 0.3, tk: 0.5 });
  }
  // yards inside the blocks (corrales): lemons and oranges, a fig, a palm, a peach, now and then a cypress or an olive
  if (field) {
    const urb = map.urban;
    for (const u of urb) {
      const [x0, z0, x1, z1] = ringBounds(u.ring);
      const n = Math.min(9000, Math.abs(ringArea(u.ring)) / 150);
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        // (off the street, and back from the facades: a yard tree grows behind the house, against the back walls)
        if (!pointInRing(x, z, u.ring) || map.buildingAt(x, z) || field.road(x, z) < 5.5 || field.facade(x, z) < 2.5) continue;
        const ar = map.areaAt(x, z);
        if (ar && ar.kind !== 'landuse:residential') continue;
        if (map.buildingAt(x + 1.3, z) || map.buildingAt(x - 1.3, z) || map.buildingAt(x, z + 1.3) || map.buildingAt(x, z - 1.3)) continue; // (room for a crown)
        const r = rnd();
        const sp = r < 0.22 ? 'limonero' : r < 0.4 ? 'naranjo' : r < 0.56 ? 'higuera' : r < 0.66 ? 'palmera' : r < 0.74 ? 'frutal' : r < 0.8 ? 'olivo' : r < 0.85 ? 'washingtonia' : r < 0.9 ? 'cipres' : r < 0.95 ? 'morera' : 'vid';
        T(sp, x, z, { s: 0.7 + rnd() * 0.4 });
      }
    }
  }

  // ---------------- the countryside
  // the reservoir: reeds in the shallows, holm oaks and eucalyptus on its banks, pines and eucalyptus in its woods
  if (world.reservoir) {
    for (const [x, z, rr, s] of world.reservoir.reeds) put('canas', x, z, { rot: rr, s, trunk: 0, check: false, tint: tintOf(rnd, 0.6) });
    for (const t of world.reservoir.trees) if (free(t.x, t.z, 2)) T(t.kind, t.x, t.z, { s: t.s });
  }
  for (const a of G.forestPlots) {
    const [x0, z0, x1, z1] = ringBounds(a.ring), area = Math.abs(ringArea(a.ring));
    const n = Math.min(1100, area / 70);
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!pointInRing(x, z, a.ring) || !free(x, z, 2)) continue;
      const r = rnd();
      T(r < 0.62 ? 'pino' : r < 0.9 ? 'eucalipto' : 'encina', x, z, { s: 0.75 + rnd() * 0.45, lean: 0.06 });
    }
  }
  // streams: reeds in clumps, oleanders, poplars in lines, a eucalyptus now and then
  for (const l of world.streams || []) {
    const p = l.pts;
    for (let i = 0; i < p.length - 2; i += 2) {
      const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]), ux = (p[i + 2] - p[i]) / (L || 1), uz = (p[i + 3] - p[i + 1]) / (L || 1);
      for (let s = 0; s < L; s += 5) {
        const t = s / L, bx = p[i] + (p[i + 2] - p[i]) * t, bz = p[i + 1] + (p[i + 3] - p[i + 1]) * t;
        for (const side of [-1, 1]) {
          const r = rnd(), d = 1.5 + rnd() * 3.5, x = bx - uz * d * side, z = bz + ux * d * side;
          if (!free(x, z, 1)) continue;
          if (r < 0.45) put('canas', x, z, { s: 0.8 + rnd() * 0.5, trunk: 0, tint: tintOf(rnd, 0.7) });
          else if (r < 0.6) T('adelfa', x, z, { s: 0.8 + rnd() * 0.4 });
          else if (r < 0.7) T('chopo', x + (rnd() - 0.5), z, { s: 0.8 + rnd() * 0.3 });
          else if (r < 0.73) T('eucalipto', x, z, { s: 0.85 + rnd() * 0.3 });
        }
      }
    }
  }
  // country roads: some lined with eucalyptus (planted long ago, in a row, one side), others with the odd fig or pine
  for (const e of map.edges) {
    if (!e.drive || e.cls !== 'tertiary' || map.inTown(e.pts[0], e.pts[1])) continue;
    const h = hash1(e.id * 3);
    if (h < 0.45) continue;
    const off = e.w / 2 + 4, side = h < 0.75 ? 1 : -1;
    for (let s = 10; s < e.len - 10; s += 15) {
      const p = polySample(e.pts, e.cum, s, {});
      const x = p.x - p.dz * off * side, z = p.z + p.dx * off * side;
      if (free(x, z, 3) && !map.inTown(x, z)) T('eucalipto', x, z, { s: 0.9 + rnd() * 0.2 });
    }
  }
  // the fields, nearest the town first: olive groves on their planting grid (a young one here and there), vines on
  // wires, stone-fruit orchards in the irrigated land, holm oaks scattered over the dry pasture
  const parcels = (G.parcels || []).slice().sort((a, b) => dCentre(a.cx, a.cz) - dCentre(b.cx, b.cz));
  const plantGrid = (ring, ang, sx, sz, fn) => {
    const [x0, z0, x1, z1] = ringBounds(ring), cxp = (x0 + x1) / 2, czp = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let u = -R; u <= R; u += sx) for (let v = -R; v <= R; v += sz) {
      const x = cxp + u * ca - v * sa, z = czp + u * sa + v * ca;
      if (pointInRing(x, z, ring)) fn(x, z);
    }
  };
  let total = 0; // (the fields' own budget: olives first, then orchards and holm oaks)
  const olives = G.olivePlots.slice().sort((a, b) => { const ca = ringBounds(a.ring), cb = ringBounds(b.ring); return dCentre((ca[0] + ca[2]) / 2, (ca[1] + ca[3]) / 2) - dCentre((cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2); });
  const oliveCap = cap * 0.8;
  for (const p of olives) {
    if (total >= oliveCap) break;
    const young = hash1(p.ring.length * 7 + Math.floor(p.ring[0])) < 0.2, sp = p.spacing || 8;
    const age = young ? 0.55 : 0.9;
    plantGrid(p.ring, p.ang, sp, sp, (x, z) => {
      if (total >= oliveCap || rnd() < 0.05 || !free(x, z, 2.5)) return; // (the odd gap where one died)
      if (T('olivo', x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, { s: age * (0.85 + rnd() * 0.35), lean: 0.08, check: false })) total++;
    });
  }
  let vines = 0;
  for (const p of G.vinePlots) {
    const [x0, z0, x1, z1] = ringBounds(p.ring);
    if (dCentre((x0 + x1) / 2, (z0 + z1) / 2) > 1600 || vines > 3200) continue;
    plantGrid(p.ring, p.ang, 2.2, 2.8, (x, z) => {
      if (vines > 3200 || !free(x, z, 1.5)) return;
      if (put('vid', x, z, { rot: -p.ang, s: 1, sy: 0.9 + rnd() * 0.2, trunk: 0, check: false, tint: tintOf(rnd, 0.6) })) vines++;
    });
  }
  let fruit = 0, oaks = 0;
  total = 0; // (orchards and holm oaks: a budget of their own)
  const cap2 = cap * 0.35;
  for (const p of parcels) {
    if (total >= cap2) break;
    const d = dCentre(p.cx, p.cz), h = hash1(Math.floor(p.cx * 3.1) + Math.floor(p.cz * 1.7));
    if (p.type === 'cultivo' && d < 1500 && h < 0.3 && fruit < 1800) {
      plantGrid(p.ring, p.ang, 5, 4, (x, z) => { if (fruit < 1800 && total < cap2 && free(x, z, 2) && T('frutal', x, z, { s: 0.85 + rnd() * 0.25, check: false })) { fruit++; total++; } });
    } else if (p.type === 'hierbaseca' && d > 550 && oaks < 1200) {
      const [x0, z0, x1, z1] = ringBounds(p.ring), n = Math.abs(ringArea(p.ring)) / 1400;
      for (let i = 0; i < n; i++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (pointInRing(x, z, p.ring) && free(x, z, 3) && T('encina', x, z, { s: 0.7 + rnd() * 0.5 })) { oaks++; total++; } }
    } else if (h > 0.97 && d > 400) { // a lone fig or holm oak by the edge of a field
      const x = p.cx + (rnd() - 0.5) * 20, z = p.cz + (rnd() - 0.5) * 20;
      if (free(x, z, 3)) { T(rnd() < 0.5 ? 'higuera' : 'encina', x, z, { s: 0.8 + rnd() * 0.3 }); total++; }
    }
  }
  return counts;
}
