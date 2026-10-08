// Ground surfaces: countryside field patchwork, OSM land use areas, roads (asphalt / dirt), sidewalks, curbs, markings.
import * as THREE from 'three';
import { GROUND, GROUND_SCALE } from './textures.js';
import { offsetPolyline, mulberry32, hash1, hash2, ringArea, pointInRing, polySample, clamp, orientedRect } from './util.js';
import { STYLE } from './style.js';
const KW = () => (STYLE.plastilina ? 0.42 : 0.28); // the kerb's width (claymation: fat blocks, as in the user's pictures)

// Parking lots (like the one by Santa María): rows of 2.5 x 5 m bays along the lot's long side, 6 m aisles between
// back-to-back rows. Computed once; the painted lines and the parked cars both use them.
export function parkingBays(map) {
  if (map.parkBays) return map.parkBays;
  const bays = [];
  for (const a of map.areas) {
    if (a.kind !== 'amenity:parking' || !map.inTown(a.ring[0], a.ring[1])) continue;
    const R = orientedRect(a.ring);
    if (!R || R.hw < 3 || R.hd < 3) continue;
    // long axis u (along the rows), short axis v (across)
    let ang = R.ang, hu = R.hw, hv = R.hd;
    if (hv > hu) { ang += Math.PI / 2; const t = hu; hu = hv; hv = t; }
    const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    // some lots are drawn over the street itself: no bays (nor parked cars) on a street's travel lanes
    const inside = (x, z) => pointInRing(x, z, a.ring) && !map.buildingAt(x, z) && !map.roadAt(x, z, 0.2, true);
    // rows: a single row against each long edge, doubles in the middle, 6 m aisles
    const rows = [];
    let v = -hv + 2.6;
    let facing = 1; // +1: nose towards +v
    while (v < hv - 2.4) { rows.push({ v, facing }); v += facing > 0 ? 5.2 : 11.2; facing = -facing; }
    for (const row of rows) {
      for (let u = -hu + 1.4; u < hu - 1.2; u += 2.5) {
        const cx = R.cx + ux * u + vx * row.v, cz = R.cz + uz * u + vz * row.v;
        const corners = [[-1.2, -2.4], [1.2, -2.4], [1.2, 2.4], [-1.2, 2.4]].map(([a2, b2]) => [cx + ux * a2 + vx * b2, cz + uz * a2 + vz * b2]);
        if (!corners.every(([x, z]) => inside(x, z))) continue;
        bays.push({ x: cx, z: cz, heading: Math.atan2(vx * row.facing, vz * row.facing), ux, uz, vx, vz, lot: a });
      }
    }
    // a lot drawn over the street itself (a paved strip along it, like the one by Santa María): parallel bays along
    // that street, just off its carriageway, facing the way the traffic on that side goes
    if (bays.filter((b) => b.lot === a).length < 3) {
      const t = {};
      for (const id of map.edgesNear(R.cx, R.cz, hu + 4)) {
        const e = map.edges[id];
        if (!e.drive || e.blocked || e.len < 8) continue;
        for (const side of [1, -1]) {
          const off = e.w / 2 + 1.15;
          for (let s = 2.5; s < e.len - 2.5; s += 0.5) {
            polySample(e.pts, e.cum, s, t);
            const bx = -t.dz * side, bz = t.dx * side; // across, towards the kerb
            const cx = t.x + bx * off, cz = t.z + bz * off;
            const fx = t.dx * side, fz = t.dz * side;  // along the street
            const corners = [[-0.95, -2.2], [0.95, -2.2], [0.95, 2.2], [-0.95, 2.2]].map(([a2, b2]) => [cx + bx * a2 + fx * b2, cz + bz * a2 + fz * b2]);
            if (!corners.every(([x, z]) => inside(x, z)) || bays.some((q) => Math.hypot(q.x - cx, q.z - cz) < 5.2)) continue;
            bays.push({ x: cx, z: cz, heading: Math.atan2(fx, fz), ux: bx, uz: bz, vx: fx, vz: fz, lot: a, parallel: true });
          }
        }
      }
    }
  }
  map.parkBays = bays;
  return bays;
}

// Generic ground mesh builder (positions on y plane, aGnd = (u, v, layer), aTint, aLoc)
// aLoc = local frame of roads & curbs: (distance along, offset across, half width, damage + 4 * seed) — zero elsewhere
const NOLOC = [0, 0, 0, 0];
export class GroundBuilder {
  constructor() { this.pos = []; this.gnd = []; this.tint = []; this.idx = []; this.loc = []; this.nrm = null; }
  get n() { return this.pos.length / 3; }
  vert(x, y, z, u, v, layer, t, loc = NOLOC, nrm = null) {
    if (nrm && !this.nrm) { this.nrm = []; for (let i = 0; i < this.n; i++) this.nrm.push(0, 1, 0); } // (normals of their own from the first vertex that has one)
    if (this.nrm) this.nrm.push(nrm ? nrm[0] : 0, nrm ? nrm[1] : 1, nrm ? nrm[2] : 0);
    this.pos.push(x, y, z);
    this.gnd.push(u, v, layer);
    this.tint.push(t[0], t[1], t[2]);
    this.loc.push(loc[0], loc[1], loc[2], loc[3]);
    return this.n - 1;
  }
  // road strip in its own frame (left = +hw, right = -hw) with world-space texture UVs (hw a number, or each side's own
  // half width at every point: hw and hwR, arrays — a carriageway laid kerb to kerb along its houses, kerbs.js)
  roadStrip(left, right, cum, hw, y, layer, tint, w, hwR = null) {
    const n = left.length / 2;
    const s = GROUND_SCALE[layer] || 5;
    const i0 = this.n;
    for (let i = 0; i < n; i++) {
      const hl = hwR ? hw[i] : hw, hr = hwR ? hwR[i] : hw;
      this.vert(left[i * 2], y, left[i * 2 + 1], left[i * 2] / s, left[i * 2 + 1] / s, layer, tint, [cum[i], hl, hl, w]);
      this.vert(right[i * 2], y, right[i * 2 + 1], right[i * 2] / s, right[i * 2 + 1] / s, layer, tint, [cum[i], -hr, hr, w]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.tri(a, b, d); this.tri(a, d, c);
    }
  }
  // curb strip: inner edge on the road side (across 0) to the outer edge (across 0.28); flags per point (ramps)
  curbStrip(inner, outer, along, flags, y, layer, tint) {
    if (STYLE.plastilina) return this.curbRoll(inner, outer, along, flags, y, layer, tint);
    const n = inner.length / 2;
    const s = GROUND_SCALE[layer] || 5;
    const i0 = this.n;
    for (let i = 0; i < n; i++) {
      this.vert(inner[i * 2], y, inner[i * 2 + 1], inner[i * 2] / s, inner[i * 2 + 1] / s, layer, tint, [along[i], 0, KW(), flags[i]]);
      this.vert(outer[i * 2], y, outer[i * 2 + 1], outer[i * 2] / s, outer[i * 2 + 1] / s, layer, tint, [along[i], KW(), KW(), flags[i]]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.tri(a, b, d); this.tri(a, d, c);
    }
  }
  // claymation: the kerb as a rounded roll of clay 7 cm high (lower in front of garages and crossings), its own normals;
  // flags + 8 tell the material it is real (no painted face). A hand's width of sinking for the feet that cross it.
  curbRoll(inner, outer, along, flags, y, layer, tint) {
    const n = inner.length / 2, s = GROUND_SCALE[layer] || 5, W = KW();
    const T = [0, 0.016, 0.04, 0.08, W - 0.08, W - 0.04, W - 0.016, W], F = [0, 0.55, 0.86, 1, 1, 0.86, 0.55, 0], m = T.length;
    const i0 = this.n;
    for (let i = 0; i < n; i++) {
      const ix = inner[i * 2], iz = inner[i * 2 + 1], ox = outer[i * 2], oz = outer[i * 2 + 1];
      const ax = (ox - ix) / W, az = (oz - iz) / W; // (across, per metre)
      const H = 0.075 * (1 - 0.8 * clamp(flags[i], 0, 1));
      for (let k = 0; k < m; k++) {
        const t = T[k], h = F[k] * H, x = ix + ax * t, z = iz + az * t;
        const k0 = Math.max(0, k - 1), k1 = Math.min(m - 1, k + 1), dh = ((F[k1] - F[k0]) * H) / Math.max(1e-4, T[k1] - T[k0]);
        const al = Math.hypot(ax, az) || 1, nx = (-dh * ax) / al, nz = (-dh * az) / al, nl = Math.hypot(nx, 1, nz);
        this.vert(x, y + h, z, x / s, z / s, layer, tint, [along[i], t, W, flags[i] + 8], [nx / nl, 1 / nl, nz / nl]);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < m - 1; k++) {
      const a = i0 + i * m + k, b = a + 1, c = a + m, d = c + 1;
      this.tri(a, b, d); this.tri(a, d, c);
    }
  }
  // polygon (flat ring + holes) with world-space UVs (optionally rotated)
  polygon(ring, holes, y, layer, tint, ang = 0) {
    const toV = (r) => { const a = []; for (let i = 0; i < r.length; i += 2) a.push(new THREE.Vector2(r[i], r[i + 1])); return a; };
    const c = toV(ring);
    const hs = holes ? holes.map(toV) : [];
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(c, hs); } catch (e) { return; }
    const pts = c.concat(...hs);
    const s = GROUND_SCALE[layer] || 5;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const i0 = this.n;
    for (const p of pts) this.vert(p.x, y, p.y, (p.x * ca + p.y * sa) / s, (-p.x * sa + p.y * ca) / s, layer, tint);
    for (const f of faces) this.tri(i0 + f[0], i0 + f[1], i0 + f[2]);
  }
  tri(a, b, c) {
    // ensure upward facing
    const P = this.pos;
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
    const cy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (cy >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  quadStrip(left, right, y, layer, tint, worldUV = true, uAlong = null, vScale = 1) {
    const n = left.length / 2;
    const s = GROUND_SCALE[layer] || 5;
    const i0 = this.n;
    for (let i = 0; i < n; i++) {
      if (worldUV) {
        this.vert(left[i * 2], y, left[i * 2 + 1], left[i * 2] / s, left[i * 2 + 1] / s, layer, tint);
        this.vert(right[i * 2], y, right[i * 2 + 1], right[i * 2] / s, right[i * 2 + 1] / s, layer, tint);
      } else {
        this.vert(left[i * 2], y, left[i * 2 + 1], uAlong[i], 0, layer, tint);
        this.vert(right[i * 2], y, right[i * 2 + 1], uAlong[i], vScale, layer, tint);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.tri(a, b, d); this.tri(a, d, c);
    }
  }
  disc(x, z, r, y, layer, tint, seg = 18) {
    const s = GROUND_SCALE[layer] || 5;
    const c = this.vert(x, y, z, x / s, z / s, layer, tint);
    const first = this.n;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      this.vert(px, y, pz, px / s, pz / s, layer, tint);
    }
    for (let i = 0; i < seg; i++) this.tri(c, first + i, first + ((i + 1) % seg));
  }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    const nrm = this.nrm ? Float32Array.from(this.nrm) : new Float32Array(this.pos.length);
    if (!this.nrm) for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aGnd', new THREE.Float32BufferAttribute(this.gnd, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('aLoc', new THREE.Float32BufferAttribute(this.loc, 4));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const W = [1, 1, 1];

// Land use → ground layer + tint + render level
function areaStyle(a) {
  const k = a.kind;
  const area = Math.abs(ringArea(a.ring));
  switch (k) {
    case 'landuse:residential': return { layer: GROUND.acera, tint: [1, 1, 1], level: 1 };
    case 'landuse:industrial': return { layer: GROUND.hormigon, tint: [0.98, 0.96, 0.92], level: 1 };
    case 'landuse:orchard': return { layer: GROUND.olivar, tint: [1, 1, 1], level: 1, olive: true };
    case 'landuse:forest': return { layer: GROUND.hierbaseca, tint: [0.85, 0.85, 0.75], level: 1, forest: true };
    case 'landuse:cemetery': return { layer: GROUND.grava, tint: [1, 1, 1], level: 2 };
    case 'landuse:military': return { layer: GROUND.hormigon, tint: [1, 1, 1], level: 2 };
    case 'landuse:grass': case 'landuse:village_green': return { layer: GROUND.cesped, tint: [1, 1, 1], level: 2 };
    case 'natural:heath': return { layer: GROUND.hierbaseca, tint: [0.9, 0.9, 0.8], level: 1 };
    case 'leisure:park': return area > 1500 ? { layer: GROUND.cesped, tint: [0.95, 1, 0.92], level: 2, park: true } : { layer: GROUND.albero, tint: [1, 1, 1], level: 2, park: true };
    case 'leisure:playground': return { layer: GROUND.albero, tint: [1, 0.9, 0.85], level: 3 };
    case 'leisure:pitch': {
      if (a.sport === 'soccer') return { layer: GROUND.pista, tint: [1, 1, 1], level: 3, pitch: 'soccer' };
      if (a.sport === 'tennis') return { layer: GROUND.hormigon, tint: [0.55, 0.75, 0.62], level: 3, pitch: 'tennis' };
      if (a.sport === 'basketball') return { layer: GROUND.hormigon, tint: [0.6, 0.68, 0.85], level: 3, pitch: 'basket' };
      return { layer: GROUND.hormigon, tint: [0.8, 0.55, 0.48], level: 3 };
    }
    case 'leisure:sports_centre': return { layer: GROUND.hormigon, tint: [1, 1, 1], level: 2 };
    case 'leisure:swimming_pool': return { water: 'pool', level: 4 };
    case 'natural:water': return { water: 'lake', level: 4 };
    case 'amenity:parking': return { layer: GROUND.asphalt2, tint: [1.05, 1.05, 1.05], level: 3, parking: true };
    case 'amenity:school': case 'amenity:college': case 'amenity:kindergarten': return { layer: GROUND.hormigon, tint: [1, 0.97, 0.92], level: 2 };
    case 'amenity:marketplace': case 'place:square': case 'highway:pedestrian': return { layer: GROUND.plaza, tint: [1, 1, 1], level: 3 };
    case 'amenity:clinic': return { layer: GROUND.acera, tint: [1, 1, 1], level: 2 };
    case 'man_made:works': return { layer: GROUND.hormigon, tint: [0.95, 0.92, 0.85], level: 2 };
    case 'man_made:storage_tank': return null;
    default: return { layer: GROUND.hierbaseca, tint: [1, 1, 1], level: 1 };
  }
}

// Countryside parcels (procedural patchwork outside the town), returns {parcels:[{ring, type, ang}]}
function makeParcels(map, rnd) {
  const { x0, z0, x1, z1 } = map.bounds;
  const pad = 700;
  const parcels = [];
  const ang = -0.34; // dominant field orientation of the Vegas
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const types = ['rastrojo', 'rastrojo', 'rastrojo', 'arado', 'arado', 'cultivo', 'cultivo', 'olivar', 'olivar', 'hierbaseca', 'vina'];
  // split rectangles in rotated frame
  const X0 = x0 - pad, X1 = x1 + pad, Z0 = z0 - pad, Z1 = z1 + pad;
  // bounding in rotated coords
  const corners = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]].map(([x, z]) => [x * ca + z * sa, -x * sa + z * ca]);
  const U0 = Math.min(...corners.map((c) => c[0])), U1 = Math.max(...corners.map((c) => c[0]));
  const V0 = Math.min(...corners.map((c) => c[1])), V1 = Math.max(...corners.map((c) => c[1]));
  const stack = [[U0, V0, U1, V1, 0]];
  const leaves = [];
  while (stack.length) {
    const [a, b, c, d, depth] = stack.pop();
    const w = c - a, h = d - b;
    if ((w < 240 && h < 240 && rnd() < 0.55) || (w < 90 || h < 90)) { leaves.push([a, b, c, d]); continue; }
    if (w > h) { const s = a + w * (0.35 + rnd() * 0.3); stack.push([a, b, s, d, depth + 1], [s, b, c, d, depth + 1]); }
    else { const s = b + h * (0.35 + rnd() * 0.3); stack.push([a, b, c, s, depth + 1], [a, s, c, d, depth + 1]); }
  }
  const back = (u, v) => [u * ca - v * sa, u * sa + v * ca];
  for (const [a, b, c, d] of leaves) {
    const g = 3; // small gap between parcels (lindes)
    const ring = [...back(a + g, b + g), ...back(c - g, b + g), ...back(c - g, d - g), ...back(a + g, d - g)];
    const cx = (ring[0] + ring[4]) / 2, cz = (ring[1] + ring[5]) / 2;
    if (cx < X0 || cx > X1 || cz < Z0 || cz > Z1) continue;
    if (map.inTown(cx, cz)) continue;
    // skip parcels overlapping the town edge
    let touches = false;
    for (let i = 0; i < 8; i += 2) if (map.inTown(ring[i], ring[i + 1])) touches = true;
    if (touches) continue;
    const t = types[Math.floor(hash2(Math.floor(cx), Math.floor(cz)) * types.length)];
    parcels.push({ ring, type: t, ang: ang + (hash1(Math.floor(cx * 7)) < 0.5 ? 0 : Math.PI / 2), cx, cz });
  }
  return parcels;
}

// garage exits (vados) and zebra crossings lower the kerb: points within their frontage get a ramp flag
// (1 = lowered kerb, 2 = lowered and painted yellow)
function makeRamps(map, opts) {
  const list = [];
  for (const g of opts.garages || []) list.push({ x: g.x, z: g.z, tx: -g.nz, tz: g.nx, nx: g.nx, nz: g.nz, hw: g.r - 0.15, reach: 9, flag: hash1(Math.floor(g.x * 3 + g.z * 7)) < 0.5 ? 2 : 1 });
  for (const p of map.pois) {
    if (p.kind !== 'highway:crossing') continue;
    list.push({ x: p.x, z: p.z, round: true, hw: 2.4, flag: 1 });
  }
  const cell = 12, grid = new Map();
  for (const r of list) {
    const k = Math.floor(r.x / cell) + ':' + Math.floor(r.z / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(r);
  }
  return { grid, cell };
}
function curbRamp(x, z, ramps) {
  if (!ramps) return 0;
  const { grid, cell } = ramps;
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let best = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = grid.get((cx + i) + ':' + (cz + j));
    if (!a) continue;
    for (const r of a) {
      if (r.round) { if (Math.hypot(x - r.x, z - r.z) < r.hw) best = Math.max(best, r.flag); continue; }
      const dx = x - r.x, dz = z - r.z;
      const along = dx * r.tx + dz * r.tz, out = dx * r.nx + dz * r.nz;
      if (out > 0 && out < r.reach && Math.abs(along) < r.hw) best = Math.max(best, r.flag);
    }
  }
  return best;
}

export function buildGround(map, materials, opts = {}) {
  const rnd = mulberry32(4242);
  const ramps = makeRamps(map, opts);
  const levels = [0, 1, 2, 3, 4, 5, 6].map(() => new GroundBuilder());
  const water = [];
  const olivePlots = [];  // rings to plant olive trees in
  const vinePlots = [];
  const forestPlots = [];
  const parkPlots = [];
  const parkingPlots = [];
  const pitches = [];

  // ---- countryside patchwork (level 0)
  const parcels = makeParcels(map, rnd);
  const T = { rastrojo: GROUND.rastrojo, arado: GROUND.arado, cultivo: GROUND.cultivo, olivar: GROUND.olivar, hierbaseca: GROUND.hierbaseca, vina: GROUND.arado };
  for (const p of parcels) {
    const tint = p.type === 'vina' ? [1.05, 0.95, 0.85] : [0.94 + hash1(p.cx | 0) * 0.12, 0.94 + hash1(p.cz | 0) * 0.1, 0.94 + hash1((p.cx + p.cz) | 0) * 0.08];
    levels[0].polygon(p.ring, null, 0, T[p.type], tint, p.ang);
    if (p.type === 'olivar') olivePlots.push({ ring: p.ring, ang: p.ang, spacing: 9 });
    if (p.type === 'vina') vinePlots.push({ ring: p.ring, ang: p.ang });
  }
  // ---- OSM areas
  for (const a of map.areas) {
    const st = areaStyle(a);
    if (!st) continue;
    if (st.water) { water.push({ ...a, water: st.water }); continue; }
    levels[st.level].polygon(a.ring, a.holes, 0, st.layer, st.tint, 0);
    if (st.olive) olivePlots.push({ ring: a.ring, ang: 0.2, spacing: 8 });
    if (st.forest) forestPlots.push(a);
    if (st.park) parkPlots.push(a);
    if (st.parking) parkingPlots.push(a);
    if (st.pitch) pitches.push({ a, kind: st.pitch });
  }
  // ---- roads (level 5 asphalt, level 4 dirt / paths) + junction discs
  const asphalt = levels[5], dirt = levels[4];
  const curbs = new GroundBuilder();
  const nodeLayer = new Map(), tmpG = {};
  for (const e of map.edges) {
    if (e.len < 0.3) continue;
    let layer, B = asphalt, tint = W;
    if (e.dirt) { layer = GROUND.tierra; B = dirt; }
    else if (e.cls === 'primary' || e.cls === 'primary_link' || e.cls === 'secondary') layer = GROUND.asphalt2;
    else if (e.cls === 'pedestrian') { layer = GROUND.plaza; B = levels[4]; }
    else if (e.cls === 'footway' || e.cls === 'cycleway' || e.cls === 'steps') { layer = GROUND.acera; B = levels[3]; }
    else if (e.cls === 'path') { layer = GROUND.tierra; B = dirt; tint = [1.05, 1.02, 0.98]; }
    else layer = GROUND.asphalt;
    // (claymation: the streets round the church cobbled, as the square in the user's third picture)
    if (opts.cobbles && layer <= GROUND.asphalt2 && !e.dirt) {
      const [cx, cz, cr] = opts.cobbles, m = Math.floor(e.pts.length / 4) * 2;
      if (Math.hypot(e.pts[m] - cx, e.pts[m + 1] - cz) < cr) { layer = GROUND.adoquin; e.cobbled = true; }
    }
    const hw = e.w / 2, kb = e.kerb;
    let L, R, cum = e.cum;
    if (kb && B === asphalt) {
      // (the carriageway kerb to kerb as laid along the houses, kerbs.js: a point every metre)
      L = new Float32Array(kb.n * 2); R = new Float32Array(kb.n * 2); cum = new Float32Array(kb.n);
      for (let i = 0; i < kb.n; i++) {
        polySample(e.pts, e.cum, i * kb.st, tmpG);
        L[i * 2] = tmpG.x - tmpG.dz * kb.p[i]; L[i * 2 + 1] = tmpG.z + tmpG.dx * kb.p[i];
        R[i * 2] = tmpG.x + tmpG.dz * kb.m[i]; R[i * 2 + 1] = tmpG.z - tmpG.dx * kb.m[i];
        cum[i] = i * kb.st;
      }
    } else { L = offsetPolyline(e.pts, hw); R = offsetPolyline(e.pts, -hw); }
    if (B === asphalt) {
      // how worn this street is: main roads are resurfaced, old back streets are not
      // (the town has resurfaced its streets lately: the wear is light; Calle Derecha and the streets round the
      // swimming pool are freshly done)
      const base = e.cls === 'primary' || e.cls === 'primary_link' ? 0.06 : e.cls === 'secondary' ? 0.12 : e.cls === 'tertiary' ? 0.2 : e.cls === 'service' ? 0.4 : 0.3;
      const fresh = /^(Calle Derecha|Calle Puerta del Sol|Avenida de la Constitución|Carretera de Guareña a Oliva de Mérida)$/.test(e.name || '') || Math.hypot(e.pts[0] + 560, e.pts[1] - 215) < 170;
      const dmg = fresh ? 0.03 : clamp(base + (hash1(e.id * 7 + 3) - 0.5) * 0.2, 0.02, 0.8);
      // overlapping strips of the same layer used to flicker (z-fighting) where streets meet: a few millimetres of
      // height by importance (the main road on top) and the junction discs above them all
      const zy = e.cls === 'primary' || e.cls === 'primary_link' || e.cls === 'secondary' ? 0.005 : e.cls === 'tertiary' ? 0.0035 : e.cls === 'service' ? 0 : 0.002;
      if (kb) B.roadStrip(L, R, cum, kb.p, zy, layer, tint, dmg + 4 * (e.id % 997), kb.m);
      else B.roadStrip(L, R, e.cum, hw, zy, layer, tint, dmg + 4 * (e.id % 997));
    } else if (B === dirt && layer === GROUND.tierra) {
      // dirt tracks keep their frame too: wheel ruts, the grass hump between them, edges eaten by the verge
      B.roadStrip(L, R, e.cum, hw, 0, layer, tint, 0.5 + 4 * (e.id % 997));
    } else B.quadStrip(L, R, 0, layer, tint);
    for (const nid of [e.a, e.b]) {
      const prev = nodeLayer.get(nid);
      const rank = B === asphalt ? 3 : B === dirt ? 1 : 2;
      if (!prev || prev.rank < rank || (prev.rank === rank && prev.r < hw)) nodeLayer.set(nid, { B, layer, tint, rank, r: Math.max(hw, prev ? prev.r : 0) });
      else prev.r = Math.max(prev.r, hw * (prev.rank === rank ? 1 : 0.8));
    }
    // curbs (flat, shaded as granite kerbs in the material), lowered in front of garages and at zebra crossings
    // (a street measured on the orthophotos has its kerbs side by side: none where the houses stand at the carriageway)
    const kerbSide = (side) => (e.measured ? ((side > 0 ? e.swP : e.swM) ?? 1) >= 0.15 : e.sw > 0);
    if (kb && !e.dirt && !e.walkOnly) {
      // (laid along the houses, kerbs.js: a kerb wherever there is a pavement — none on the side of a street that has
      // its pavement on the other, none on a single platform — at the kerb as laid)
      for (const side of [1, -1]) {
        if (kb.regime === 2 || (kb.regime === 1 && kb.side !== side)) continue;
        const K = side > 0 ? kb.p : kb.m, Fh = side > 0 ? kb.fp : kb.fm, open = kerbSide(side);
        const has = (i) => (Fh[i] === Fh[i] ? Fh[i] - K[i] >= 0.15 : open);
        for (let i = 0; i < kb.n; ) {
          if (!has(i)) { i++; continue; }
          let j = i;
          while (j + 1 < kb.n && has(j + 1)) j++;
          const m = j - i + 1;
          if (m >= 2) {
            const inner = new Float32Array(m * 2), outer = new Float32Array(m * 2), along = new Float32Array(m), flags = new Float32Array(m);
            for (let k = 0; k < m; k++) {
              polySample(e.pts, e.cum, (i + k) * kb.st, tmpG);
              const nx = -tmpG.dz * side, nz = tmpG.dx * side, a = K[i + k];
              inner[k * 2] = tmpG.x + nx * a; inner[k * 2 + 1] = tmpG.z + nz * a;
              outer[k * 2] = tmpG.x + nx * (a + KW()); outer[k * 2 + 1] = tmpG.z + nz * (a + KW());
              along[k] = (i + k) * kb.st; flags[k] = curbRamp(inner[k * 2], inner[k * 2 + 1], ramps);
            }
            trimStrip(inner, outer, e, map, (a, b, idx) => curbs.curbStrip(a, b, idx.map((k) => along[k]), idx.map((k) => flags[k]), 0, GROUND.bordillo, [1, 1, 1]));
          }
          i = j + 1;
        }
      }
    } else if (!e.dirt && !e.walkOnly && (kerbSide(1) || kerbSide(-1))) {
      const dp = densify(e.pts, 1.2);
      const cum = [0];
      for (let i = 2; i < dp.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(dp[i] - dp[i - 2], dp[i + 1] - dp[i - 1]));
      for (const side of [1, -1]) {
        if (!kerbSide(side)) continue;
        const inner = offsetPolyline(dp, side * hw), outer = offsetPolyline(dp, side * (hw + KW()));
        const flags = new Float32Array(inner.length / 2);
        for (let i = 0; i < flags.length; i++) flags[i] = curbRamp(inner[i * 2], inner[i * 2 + 1], ramps);
        trimStrip(inner, outer, e, map, (a, b, idx) => curbs.curbStrip(a, b, idx.map((k) => cum[k]), idx.map((k) => flags[k]), 0, GROUND.bordillo, [1, 1, 1]));
      }
    }
  }
  for (const [nid, info] of nodeLayer) {
    const n = map.nodes[nid];
    info.B.disc(n.x, n.z, info.r, 0.009, info.layer, info.tint);
  }
  const geoms = levels.map((b) => b.geometry());
  return { geoms, curbs: curbs.geometry(), water, olivePlots, vinePlots, forestPlots, parkPlots, parkingPlots, pitches, parcels };
}

// Remove strip parts that fall inside junction areas (so curbs stop at crossings)
function trimStrip(a, b, e, map, emit) {
  const n = a.length / 2;
  const na = map.nodes[e.a], nb = map.nodes[e.b];
  const ra = na.degree > 1 ? na.radius + 1.2 : 0, rb = nb.degree > 1 ? nb.radius + 1.2 : 0;
  let cur = null;
  const flush = () => { if (cur && cur.a.length >= 4) emit(new Float32Array(cur.a), new Float32Array(cur.b), cur.i); cur = null; };
  for (let i = 0; i < n; i++) {
    const cx = (a[i * 2] + b[i * 2]) / 2, cz = (a[i * 2 + 1] + b[i * 2 + 1]) / 2;
    const ok = Math.hypot(cx - na.x, cz - na.z) > ra && Math.hypot(cx - nb.x, cz - nb.z) > rb;
    if (ok) {
      if (!cur) cur = { a: [], b: [], i: [] };
      cur.a.push(a[i * 2], a[i * 2 + 1]); cur.b.push(b[i * 2], b[i * 2 + 1]); cur.i.push(i);
    } else flush();
  }
  flush();
}

// Densify polyline so trimming works on long straight segments
export function densify(p, step = 3) {
  const out = [p[0], p[1]];
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 1; j <= k; j++) out.push(ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k);
  }
  return new Float32Array(out);
}

// Road markings (dashed centre lines, zebra crossings, stop lines) — uv into markings atlas rows
export function buildMarkings(map) {
  const pos = [], uv = [], idx = [];
  const addQuad = (p0, p1, p2, p3, u0, v0, u1, v1) => {
    const i = pos.length / 3;
    pos.push(p0[0], 0, p0[1], p1[0], 0, p1[1], p2[0], 0, p2[1], p3[0], 0, p3[1]);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const cy = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
    if (cy >= 0) idx.push(i, i + 1, i + 2, i, i + 2, i + 3); else idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  const tmp = {};
  // centre lines
  for (const e of map.edges) {
    if (e.dirt || e.oneway || e.walkOnly || e.cobbled) continue;
    if (!['primary', 'secondary', 'tertiary', 'unclassified', 'primary_link'].includes(e.cls)) continue;
    if (e.w < 5.8) continue;
    const na = map.nodes[e.a], nb = map.nodes[e.b];
    const s0 = na.degree > 1 ? na.radius + 5 : 1, s1 = e.len - (nb.degree > 1 ? nb.radius + 5 : 1);
    const dash = 4.5; // one texture repeat = dash + gap = 9 m
    for (let s = s0; s < s1 - 1; s += 2) {
      const a = polySample(e.pts, e.cum, s, {}), b = polySample(e.pts, e.cum, Math.min(s + 2, s1), {});
      const hw = STYLE.plastilina ? 0.11 : 0.08; // (claymation: a fat roll of white clay)
      const nxa = -a.dz * hw, nza = a.dx * hw, nxb = -b.dz * hw, nzb = b.dx * hw;
      const u0 = (s - s0) / (dash * 2), u1 = (Math.min(s + 2, s1) - s0) / (dash * 2);
      addQuad([a.x + nxa, a.z + nza], [b.x + nxb, b.z + nzb], [b.x - nxb, b.z - nzb], [a.x - nxa, a.z - nza], u0, 0.845, u1, 0.905);
    }
  }
  // (claymation: on the wide streets a continuous roll of white clay a parking lane in from each kerb, as in the user's
  // second picture)
  if (STYLE.plastilina) for (const e of map.edges) {
    if (e.dirt || e.walkOnly || e.cobbled || !e.drive || e.w < 6.8) continue;
    const na = map.nodes[e.a], nb = map.nodes[e.b];
    const s0 = na.degree > 1 ? na.radius + 3 : 1, s1 = e.len - (nb.degree > 1 ? nb.radius + 3 : 1);
    const kb = e.kerb;
    for (const side of [-1, 1]) {
      if (kb && (kb.regime === 2 || (kb.regime === 1 && kb.side !== side))) continue; // (no kerb that side: no parking lane)
      for (let s = s0; s < s1 - 0.5; s += 2) {
        const s2 = Math.min(s + 2, s1);
        // (from the kerb as laid, kerbs.js; not where the carriageway narrows under 6.8 m)
        if (kb && (map.kerbAt(e, s, 1) + map.kerbAt(e, s, -1) < 6.8 || map.kerbAt(e, s2, 1) + map.kerbAt(e, s2, -1) < 6.8)) continue;
        const oa = side * (map.kerbAt(e, s, side) - 1.95), ob = side * (map.kerbAt(e, s2, side) - 1.95);
        const a = polySample(e.pts, e.cum, s, {}), b = polySample(e.pts, e.cum, s2, {}), hw = 0.13;
        const ax = a.x - a.dz * oa, az = a.z + a.dx * oa, bx = b.x - b.dz * ob, bz = b.z + b.dx * ob;
        addQuad([ax - a.dz * hw, az + a.dx * hw], [bx - b.dz * hw, bz + b.dx * hw], [bx + b.dz * hw, bz - b.dx * hw], [ax + a.dz * hw, az - a.dx * hw], 0.02, 0.6, 0.98, 0.65);
      }
    }
  }
  // zebra crossings at OSM crossing nodes
  for (const p of map.pois) {
    if (p.kind !== 'highway:crossing') continue;
    const q = map.nearestEdge(p.x, p.z, 6, (e) => e.drive);
    if (!q) continue;
    const e = q.edge;
    const d = polySample(e.pts, e.cum, q.s, tmp);
    const hp = map.kerbAt(e, q.s, 1) - 0.2, hm = map.kerbAt(e, q.s, -1) - 0.2, depth = 1.8; // (kerb to kerb, as laid)
    const tx = d.dx, tz = d.dz, nx = -tz, nz = tx;
    const c = [q.x, q.z];
    const P = (a, b) => [c[0] + tx * a + nx * b, c[1] + tz * a + nz * b];
    // u along the road width (stripes repeat every 1.0 m => atlas 4 stripes per 256px)
    const reps = (hp + hm) / 2.2;
    addQuad(P(-depth, -hm), P(-depth, hp), P(depth, hp), P(depth, -hm), 0, 0.27, reps, 0.48);
  }
  // parking bays: the white lines between the spaces and across the back of each row
  for (const b of parkingBays(map)) {
    const line = (a0, b0, a1, b1, w = 0.06) => {
      const P = (a2, b2) => [b.x + b.ux * a2 + b.vx * b2, b.z + b.uz * a2 + b.vz * b2];
      const dx = a1 - a0, db = b1 - b0, L = Math.hypot(dx, db) || 1, nx = (-db / L) * w, nb = (dx / L) * w;
      addQuad(P(a0 + nx, b0 + nb), P(a1 + nx, b1 + nb), P(a1 - nx, b1 - nb), P(a0 - nx, b0 - nb), 0.02, 0.6, 0.98, 0.65); // the solid-line row of the atlas
    };
    line(-1.25, -2.4, -1.25, 2.4); line(1.25, -2.4, 1.25, 2.4); // sides
    const back = Math.sin(b.heading) * b.vx + Math.cos(b.heading) * b.vz > 0 ? 2.4 : -2.4;
    line(-1.25, back, 1.25, back);
  }
  // stop lines
  for (const p of map.pois) {
    if (p.kind !== 'highway:stop') continue;
    const q = map.nearestEdge(p.x, p.z, 8, (e) => e.drive);
    if (!q) continue;
    const e = q.edge;
    const d = polySample(e.pts, e.cum, q.s, tmp);
    const na = map.nodes[e.a], nb = map.nodes[e.b];
    // direction toward nearest junction
    const toB = Math.hypot(nb.x - q.x, nb.z - q.z) < Math.hypot(na.x - q.x, na.z - q.z);
    const tx = toB ? d.dx : -d.dx, tz = toB ? d.dz : -d.dz, nx = -tz, nz = tx;
    // (the kerbs as laid, kerbs.js: on the right of the way in, and on its left)
    const kr = map.kerbAt(e, q.s, toB ? -1 : 1), kl = map.kerbAt(e, q.s, toB ? 1 : -1);
    const off = e.oneway ? (kl - kr) / 2 : -kr / 2;
    const c = [q.x + nx * off, q.z + nz * off];
    const P = (a, b) => [c[0] + tx * a + nx * b, c[1] + tz * a + nz * b];
    const lw = e.oneway ? (kl + kr) / 2 : kr / 2;
    addQuad(P(-2.6, -lw), P(-2.6, lw), P(0, lw), P(0, -lw), 1, 0.0, 0, 0.25);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
