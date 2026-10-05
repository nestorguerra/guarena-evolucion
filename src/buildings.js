// Extrudes Catastro building parts into textured Extremaduran houses: facades, party walls, hip/tile/flat roofs.
import * as THREE from 'three';
import { FACADE_STYLES, FACADE_LAYERS_PER_STYLE, ROOF_BASE, BAY_W, FLOOR_H } from './textures.js';
import { ringArea, orientedRect, hash1, mulberry32, pointInRing, ringCentroid, ringBounds, polyNearest } from './util.js';
import { PolyIndex } from './collision.js';
// (the look — anime / real / diorama — as LOOK: STYLE here is the façade styles' layers)
import { STYLE as LOOK } from './style.js';
import { planPart, holeRect, recessDepth, styleHasHoles, CT } from './facades.js';

const STYLE = Object.fromEntries(FACADE_STYLES.map((s, i) => [s, i * FACADE_LAYERS_PER_STYLE]));
const ROOF = { teja: ROOF_BASE + 0, azotea: ROOF_BASE + 1, chapa: ROOF_BASE + 2, uralita: ROOF_BASE + 3 };
const SHOP_KINDS = /^(shop:|amenity:(bar|cafe|bank|pharmacy|restaurant|fast_food|pub|post_office|driving_school|dentist|clinic|library|casino)|office:|craft:)/;

const NORECT = [0, 0, 0, 0];
class Chunk {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.tex = []; this.tint = []; this.idx = []; this.rect = []; this.wall = [];
    this.edge = LOOK.plastilina ? [] : null; // (claymation: where each wall runs to its corners, to round them in the shader)
  }
  get vcount() { return this.pos.length / 3; }
  // a-b bottom, c-d top; ks: optional per-vertex tint multipliers (baked occlusion)
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, u0, v0, u1, v1, tex, tint, rect = NORECT, wallH = 0, ks = null, edge = null, nrm = null) {
    const i = this.vcount;
    // nrm: [na, nb] the normals at the a/d and b/c sides (a wall bending round a rounded corner shades smoothly)
    // edge: [s at a/d, s at b/c, code] — s the distance along the wall from its first corner, code its length plus which
    // of its two ends are corners to round (1e4: the first, 2e4: the second)
    if (this.edge) { if (edge) this.edge.push(edge[0], edge[2], edge[1], edge[2], edge[1], edge[2], edge[0], edge[2]); else this.edge.push(0, 0, 0, 0, 0, 0, 0, 0); }
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let k = 0; k < 4; k++) {
      const m = ks ? ks[k] : 1;
      if (nrm) { const q = k === 1 || k === 2 ? nrm[1] : nrm[0]; this.nor.push(q[0], q[1], q[2]); } else this.nor.push(nx, ny, nz);
      this.tex.push(tex[0], tex[1], tex[2], tex[3]); this.tint.push(tint[0] * m, tint[1] * m, tint[2] * m);
      this.rect.push(rect[0], rect[1], rect[2], rect[3]); this.wall.push(wallH);
    }
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    // orient triangles so their geometric normal agrees with the requested one
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    if (gx * nx + gy * ny + gz * nz >= 0) this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    else this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  }
  tri(a, b, c, n, uva, uvb, uvc, tex, tint) {
    const i = this.vcount;
    if (this.edge) this.edge.push(0, 0, 0, 0, 0, 0);
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) { this.nor.push(n[0], n[1], n[2]); this.tex.push(tex[0], tex[1], tex[2], tex[3]); this.tint.push(tint[0], tint[1], tint[2]); this.rect.push(0, 0, 0, 0); this.wall.push(0); }
    this.uv.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) this.idx.push(i, i + 1, i + 2);
    else this.idx.push(i, i + 2, i + 1);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTex', new THREE.Float32BufferAttribute(this.tex, 4));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    const r8 = new Uint8Array(this.rect.length);
    for (let i = 0; i < r8.length; i++) r8[i] = Math.round(Math.min(1, Math.max(0, this.rect[i])) * 255);
    g.setAttribute('aRect', new THREE.BufferAttribute(r8, 4, true));
    g.setAttribute('aWallH', new THREE.Float32BufferAttribute(this.wall, 1));
    if (this.edge) g.setAttribute('aEdge', new THREE.Float32BufferAttribute(this.edge, 2));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const WHITES = [[1, 1, 1], [0.99, 0.985, 0.97], [0.985, 0.98, 0.99], [1, 0.975, 0.94], [0.97, 0.965, 0.95]];
const COLORS = [[0.97, 0.9, 0.76], [0.95, 0.84, 0.6], [0.95, 0.78, 0.66], [0.9, 0.74, 0.52], [0.97, 0.92, 0.68], [0.86, 0.9, 0.8], [0.84, 0.89, 0.92], [0.96, 0.87, 0.8]];
// the diorama's (src/diorama.js): whitewash that is ivory and cream, never blue-white; the coloured houses in the warm
// earths of the spec (cream, light ochre, pale terracotta, straw)
const WHITES_D = [[1, 1, 1], [1, 0.985, 0.96], [0.985, 0.97, 0.94], [1, 0.98, 0.95], [0.97, 0.955, 0.93]];
const COLORS_D = [[0.89, 0.82, 0.71], [0.94, 0.9, 0.8], [0.93, 0.8, 0.58], [0.9, 0.74, 0.63], [0.93, 0.87, 0.69], [0.96, 0.88, 0.66], [0.97, 0.94, 0.88], [0.95, 0.83, 0.72]];

function chooseStyle(b, rnd) {
  const y = b.year || 1960;
  if (b.use === 1 || b.use === 2) return 'nave';
  const r = rnd();
  if (b.floors >= 3 && y >= 1965) return r < 0.5 ? 'ladrillo' : r < 0.75 ? 'moderna' : 'color';
  if (y >= 2005) return r < 0.35 ? 'moderna' : r < 0.7 ? 'renovada' : r < 0.9 ? 'color' : 'ladrillo';
  if (y >= 1970) return r < 0.28 ? 'ladrillo' : r < 0.58 ? 'renovada' : r < 0.8 ? 'color' : r < 0.9 ? 'trad_verde' : 'trad_ocre';
  return r < 0.36 ? 'trad_verde' : r < 0.64 ? 'trad_ocre' : r < 0.86 ? 'renovada' : 'color';
}

// inset a CCW ring by d (inward). Returns flat array or null if degenerate.
function insetRing(r, d) {
  const n = r.length / 2;
  const out = new Array(r.length);
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    const ax = r[p * 2], az = r[p * 2 + 1], bx = r[i * 2], bz = r[i * 2 + 1], cx = r[q * 2], cz = r[q * 2 + 1];
    let d1x = bx - ax, d1z = bz - az, l1 = Math.hypot(d1x, d1z);
    let d2x = cx - bx, d2z = cz - bz, l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-4 || l2 < 1e-4) return null;
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    // inward normals for CCW: (-dz, dx)
    const n1x = -d1z, n1z = d1x, n2x = -d2z, n2z = d2x;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-4) return null;
    mx /= ml; mz /= ml;
    const cosH = mx * n1x + mz * n1z;
    if (cosH < 0.3) return null; // too sharp
    const k = d / cosH;
    out[i * 2] = bx + mx * k; out[i * 2 + 1] = bz + mz * k;
  }
  // validity: same orientation, all inside, edges not flipped
  if (ringArea(out) <= 0.5) return null;
  for (let i = 0; i < n; i++) {
    if (!pointInRing(out[i * 2], out[i * 2 + 1], r)) return null;
    const q = (i + 1) % n;
    const ox = r[q * 2] - r[i * 2], oz = r[q * 2 + 1] - r[i * 2 + 1];
    const ix = out[q * 2] - out[i * 2], iz = out[q * 2 + 1] - out[i * 2 + 1];
    if (ox * ix + oz * iz <= 0) return null;
  }
  return out;
}

// drop near-duplicate and nearly collinear vertices (cadastral outlines are full of them)
function simplifyRing(r) {
  let pts = [];
  for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]);
  for (let pass = 0; pass < 3; pass++) {
    const out = [];
    const n = pts.length;
    if (n <= 4) break;
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
      const abx = b[0] - a[0], abz = b[1] - a[1], bcx = c[0] - b[0], bcz = c[1] - b[1];
      const lab = Math.hypot(abx, abz), lbc = Math.hypot(bcx, bcz);
      if (lab < 0.25) continue;
      const cross = Math.abs(abx * bcz - abz * bcx) / (lab * lbc + 1e-9);
      if (cross < 0.06 && abx * bcx + abz * bcz > 0) continue; // almost straight: skip the middle vertex
      out.push(b);
    }
    if (out.length < 3 || out.length === n) { if (out.length >= 3) pts = out; break; }
    pts = out;
  }
  const res = [];
  for (const q of pts) res.push(q[0], q[1]);
  return ringArea(res) > 0 ? res : r;
}

function outsetRing(r, d) {
  const n = r.length / 2;
  const out = new Array(r.length);
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let d1x = r[i * 2] - r[p * 2], d1z = r[i * 2 + 1] - r[p * 2 + 1];
    let d2x = r[q * 2] - r[i * 2], d2z = r[q * 2 + 1] - r[i * 2 + 1];
    const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1;
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    let mx = d1z + d2z, mz = -d1x - d2x; // outward normals sum
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const cosH = Math.max(0.4, mx * d1z + mz * -d1x);
    out[i * 2] = r[i * 2] + (mx * d) / cosH;
    out[i * 2 + 1] = r[i * 2 + 1] + (mz * d) / cosH;
  }
  return out;
}

// claymation: an outline with its convex corners rounded — each replaced by a short arc (a quadratic curve with the
// corner as its control point), ~0.32 m round; nrm: the curve's own outward normal at its points (NaN elsewhere), so
// the bend shades smooth and meets the straight walls with their own normal
function roundRing(r, R = 0.32, seg = 4) {
  const n = r.length / 2, pts = [], nrm = [];
  for (let i = 0; i < n; i++) {
    const h = (i - 1 + n) % n, j = (i + 1) % n;
    const px = r[i * 2], pz = r[i * 2 + 1];
    const ax = r[h * 2] - px, az = r[h * 2 + 1] - pz, bx = r[j * 2] - px, bz = r[j * 2 + 1] - pz;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    const cr = la > 1e-6 && lb > 1e-6 ? (-ax * bz + az * bx) / (la * lb) : 0; // (> 0: a convex corner)
    if (la < 0.5 || lb < 0.5 || cr < 0.35) { pts.push(px, pz); nrm.push(NaN, NaN); continue; }
    const theta = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb))));
    const t = Math.min(R / Math.tan(theta / 2), la * 0.35, lb * 0.35);
    const p0x = px + (ax / la) * t, p0z = pz + (az / la) * t, p1x = px + (bx / lb) * t, p1z = pz + (bz / lb) * t;
    for (let k = 0; k <= seg; k++) {
      const s = k / seg, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
      pts.push(a * p0x + b * px + c * p1x, a * p0z + b * pz + c * p1z);
      const tx = 2 * (1 - s) * (px - p0x) + 2 * s * (p1x - px), tz = 2 * (1 - s) * (pz - p0z) + 2 * s * (p1z - pz), tl = Math.hypot(tx, tz) || 1;
      nrm.push(tz / tl, -tx / tl); // (outward, as the walls': (dz, -dx))
    }
  }
  return { pts, nrm };
}

function triangulate(ring, holes) {
  const toV = (r) => { const a = []; for (let i = 0; i < r.length; i += 2) a.push(new THREE.Vector2(r[i], r[i + 1])); return a; };
  const contour = toV(ring);
  const hs = holes ? holes.map(toV) : [];
  const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
  const all = contour.concat(...hs);
  return { faces, pts: all };
}

// facade: { holes: bool, forcedDoors: [{x, z}], openings: [], runs: [] } — real openings + records for the 3D details
export function buildBuildings(map, { chunkSize = 220, skipPart = null, onBuilding = null, overrides = null, facade = null } = {}) {
  const chunks = new Map();
  const chunkOf = (x, z) => {
    const k = Math.floor(x / chunkSize) + ':' + Math.floor(z / chunkSize);
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = new Chunk()));
    return c;
  };
  const ao = []; // ground AO strips: x,z pairs of quads
  // ---- per-building attributes
  const shopPoi = map.pois.filter((p) => SHOP_KINDS.test(p.kind));
  const bInfo = map.buildings.map((b) => {
    const rnd = mulberry32((b.id * 2654435761) >>> 0);
    const style = chooseStyle(b, rnd);
    let tint;
    const D = LOOK.diorama, CO = D ? COLORS_D : COLORS, WH = D ? WHITES_D : WHITES;
    if (style === 'color') tint = CO[Math.floor(rnd() * CO.length)];
    else if (style === 'ladrillo' || style === 'piedra') tint = [1, 1, 1];
    else if (style === 'nave') tint = rnd() < 0.5 ? [1, 1, 1] : [0.95, 0.93, 0.88];
    else tint = WH[Math.floor(rnd() * WH.length)];
    const rt = 0.85 + rnd() * 0.25;
    // (the diorama's roofs: fired clay, terracotta)
    const roofTint = D ? [rt * 0.98, rt * (0.84 + rnd() * 0.06), rt * (0.76 + rnd() * 0.08)] : [rt, rt * (0.95 + rnd() * 0.08), rt * (0.9 + rnd() * 0.12)];
    const info = { style, tint, roofTint, seed: rnd(), shop: b.use === 4 ? 1 : 0, rnd, pitch: 0.42 + rnd() * 0.16, minFloors: 0 };
    const ov = overrides && overrides.get(b.id);
    if (ov) Object.assign(info, ov);
    return info;
  });
  for (const p of shopPoi) {
    const b = map.buildingAt(p.x, p.z) || nearestBuilding(map, p.x, p.z, 6);
    if (b && !bInfo[b.id].noShop) bInfo[b.id].shop = 1; // (a public building with its own front: no shop fronts)
  }
  // ---- part heights
  const partIndex = new PolyIndex(map.bounds.x0 - 400, map.bounds.z0 - 400, map.bounds.x1 + 400, map.bounds.z1 + 400, 16);
  const parts = [];
  for (const p of map.parts) {
    if (skipPart && skipPart(p)) continue;
    const bi = p.b >= 0 ? bInfo[p.b] : null;
    let H = Math.max(p.floors, bi ? bi.minFloors : 0) * FLOOR_H;
    if (bi && bi.style === 'nave') {
      const big = Math.sqrt(p.area);
      H = Math.max(H, 4.2 + Math.min(4, big * 0.12) + (hash1(p.id) - 0.5));
    }
    const part = { ...p, H, info: bi || { style: 'renovada', tint: [1, 1, 1], roofTint: [1, 1, 1], seed: hash1(p.id), shop: 0, rnd: mulberry32(p.id), pitch: 0.5 } };
    part.pi = partIndex.add(p.ring, part);
    parts.push(part);
  }
  // collisions: what stands is what is drawn — each part to its own height. A building's Catastro outline can be larger
  // than its parts (a petrol station's canopy, a porch, a yard registered with it): walls nobody can see stop nobody
  const bH = new Float32Array(map.buildings.length);
  for (const p of parts) if (p.b >= 0) bH[p.b] = Math.max(bH[p.b], p.H + 1.5);
  const kept = new Uint8Array(map.buildings.length);
  for (const b of map.buildings) {
    if (onBuilding && onBuilding(b) === false) continue;
    kept[b.id] = 1;
    b.height = bH[b.id] || b.floors * FLOOR_H;
  }
  for (const p of parts) {
    if (p.b >= 0 && !kept[p.b]) continue;
    map.collider.addRing(p.ring, p.H + 1.5, p.b);
    if (p.holes) for (const h of p.holes) map.collider.addRing(h, p.H + 1.5, p.b);
  }
  map.useDrawnParts(parts.filter((p) => p.b < 0 || kept[p.b]));

  // does a facade run look onto a street or a square? (backyards and inner courtyards keep the light painted facade)
  const squares = map.areas.filter((a) => ['place:square', 'highway:pedestrian', 'amenity:marketplace', 'leisure:park'].includes(a.kind)).map((a) => ({ ring: a.ring, bb: ringBounds(a.ring) }));
  const streetFacing = (run) => {
    const tm = (run.t0 + run.t1) / 2;
    const mx = run.ax + run.dx * tm, mz = run.az + run.dz * tm;
    for (const off of [2.2, 5.5, 9.5]) {
      const px = mx + run.nx * off, pz = mz + run.nz * off;
      if (off > 3 && map.buildingAt(px, pz)) return false;
      for (const id of map.edgesNear(px, pz, 4)) {
        const e = map.edges[id];
        if (!(e.walk || e.drive) || e.cls === 'track' || e.dirt) continue;
        if (polyNearest(e.pts, e.cum, px, pz).d < 2.5 + e.w / 2) return true;
      }
      for (const sq of squares) if (px > sq.bb[0] && px < sq.bb[2] && pz > sq.bb[1] && pz < sq.bb[3] && pointInRing(px, pz, sq.ring)) return true;
    }
    return false;
  };
  let tris = 0;
  for (const p of parts) {
    const info = p.info;
    const c = chunkOf(p.c[0], p.c[1]);
    const H = p.H;
    const rings = [p.ring].concat(p.holes || []);
    // (claymation: the walls follow the outline with its corners rounded, as a clay model's — the roof keeps the true
    // outline, its eaves cover the difference; what stops you, the colliders, too)
    const smooths = LOOK.plastilina ? [] : null;
    if (smooths) for (let ri = 0; ri < rings.length; ri++) { const rr = roundRing(rings[ri]); rings[ri] = rr.pts; smooths[ri] = rr.nrm; }
    // ---------------- walls
    // Each edge is sampled every ~0.5 m: the neighbour part behind it (if any) hides the wall only up to its own
    // height and only where it really is, so partly covered party walls no longer leave see-through gaps.
    const runs = [];
    for (let ri = 0; ri < rings.length; ri++) {
      const r = rings[ri];
      const n = r.length / 2;
      // (claymation) the ring's convex corners — the building's own corners, rounded like a clay model's
      const convex = LOOK.plastilina ? new Uint8Array(n) : null;
      if (convex) for (let i = 0; i < n; i++) {
        const h = (i - 1 + n) % n, j = (i + 1) % n;
        const e0x = r[i * 2] - r[h * 2], e0z = r[i * 2 + 1] - r[h * 2 + 1], e1x = r[j * 2] - r[i * 2], e1z = r[j * 2 + 1] - r[i * 2 + 1];
        const l0 = Math.hypot(e0x, e0z), l1 = Math.hypot(e1x, e1z);
        convex[i] = l0 > 0.05 && l1 > 0.05 && (e0x * e1z - e0z * e1x) / (l0 * l1) > 0.85 ? 1 : 0; // (a sharp corner left: the shader rounds it)
      }
      // (claymation) the normal at each vertex of a rounded corner: its curve's own (NaN where the outline is straight)
      const vN = smooths ? smooths[ri] : null;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
        const dx = bx - ax, dz = bz - az;
        const L = Math.hypot(dx, dz);
        if (L < 0.05) continue;
        const nx = dz / L, nz = -dx / L; // outward
        const uTot = L < 1.8 ? 0.3 : Math.max(1, Math.round(L / BAY_W));
        const K = Math.max(1, Math.min(64, Math.ceil(L / 0.5)));
        let runStart = 0, runC = -1;
        const cover = (k) => {
          const t = (k + 0.5) / K;
          const nb = partIndex.find(ax + dx * t + nx * 0.3, az + dz * t + nz * 0.3);
          if (!nb || nb.data === p) return 0;
          const nh = nb.data.H;
          return nh >= H - 0.05 ? H : Math.round(nh * 10) / 10;
        };
        const emit = (k0, k1, cy) => {
          if (cy >= H - 0.05) return; // fully hidden behind a taller neighbour
          const t0 = k0 / K, t1 = k1 / K;
          const run = { ax, az, dx, dz, L, nx, nz, uTot, t0, t1, cy, ri, exposed: cy === 0 };
          if (convex) run.code = L + (t0 < 1e-6 && convex[i] ? 1e4 : 0) + (t1 > 1 - 1e-6 && convex[j] ? 2e4 : 0);
          if (vN) { // the normals at the run's two ends (smoothed where the outline bends round a corner)
            const sA = isNaN(vN[i * 2]) ? [nx, nz] : [vN[i * 2], vN[i * 2 + 1]], sB = isNaN(vN[j * 2]) ? [nx, nz] : [vN[j * 2], vN[j * 2 + 1]];
            const at = (t) => { const x = sA[0] + (sB[0] - sA[0]) * t, z = sA[1] + (sB[1] - sA[1]) * t, l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
            run.nrmAt = at;
          }
          if (run.exposed) { run.street = streetFacing(run); run.exposed = run.street; run.back = !run.street; }
          runs.push(run);
          if (cy === 0 && ri === 0 && (t1 - t0) * L > 1) ao.push(ax + dx * t0, az + dz * t0, ax + dx * t1, az + dz * t1, nx, nz);
        };
        for (let k = 0; k < K; k++) {
          const cv = cover(k);
          if (k === 0) { runC = cv; continue; }
          if (Math.abs(cv - runC) > 0.05) { emit(runStart, k, runC); runStart = k; runC = cv; }
        }
        emit(runStart, K, runC);
      }
    }
    planPart(p, info, runs, H, facade && facade.forcedDoors);
    for (const run of runs) tris += emitRun(c, run, p, info, H, facade);
    // ---------------- roof
    tris += buildRoof(c, p, info, H);
    // runs for the 3D extras (downpipes, cornices)
    if (facade && facade.runs && info.style !== 'nave') {
      for (const run of runs) {
        if (!run.exposed || run.ri !== 0 || (run.t1 - run.t0) * run.L < 1.5) continue;
        const shopEnds = !!info.shop;
        facade.runs.push({
          ax: run.ax + run.dx * run.t0, az: run.az + run.dz * run.t0, bx: run.ax + run.dx * run.t1, bz: run.az + run.dz * run.t1,
          nx: run.nx, nz: run.nz, H, pitched: p.roofKind === 'hip' || p.roofKind === 'lip', shopEnds,
          style: info.style, tint: info.tint, bid: p.b, pid: p.id, seed: info.seed,
        });
      }
    }
  }
  const meshes = [];
  for (const [k, ch] of chunks) {
    if (!ch.vcount) continue;
    meshes.push(ch.geometry());
  }
  return { geometries: meshes, ao, parts, tris };
}

// One wall run: party walls are a single blank quad; street facades are split in cells (bay x floor) with the layer
// chosen by planPart. Cells holding a door, window, balcony, garage or shop get a real hole when facade.holes is on.
function emitRun(c, run, p, info, H, facade) {
  const { ax, az, dx, dz, nx, nz, uTot, t0, t1, cy } = run;
  const sBase = STYLE[info.style];
  if (!run.exposed) {
    // party walls: blank (kind 2); backyard / courtyard facades: painted cells picked in the shader (kind 3), one quad
    const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
    c.quad(x0, cy, z0, x1, cy, z1, x1, H, z1, x0, H, z0, nx, 0, nz, uTot * t0, cy / FLOOR_H, uTot * t1, H / FLOOR_H, [sBase, run.back ? 3 : 2, info.seed, 0], info.tint, NORECT, H, null, run.code ? [t0 * run.L, t1 * run.L, run.code] : null, run.nrmAt ? [run.nrmAt(t0), run.nrmAt(t1)] : null);
    return 2;
  }
  const u0 = uTot * t0, u1 = uTot * t1;
  const nF = Math.floor(H / FLOOR_H + 0.02);
  const holes = !!(facade && facade.holes && styleHasHoles(info.style));
  const at = (u) => [ax + dx * (u / uTot), az + dz * (u / uTot)];
  let tris = 0;
  // every piece overlaps its neighbours by 4 mm: the texture mapping is continuous, so the overlap is invisible,
  // and it seals the T-junction cracks that otherwise sparkle around the holes
  const eu = 0.004 * uTot / run.L, ev = 0.004 / FLOOR_H;
  const piece = (ua, ub, ya, yb, layer, rect) => {
    ua -= eu; ub += eu; ya = Math.max(0, ya - ev * FLOOR_H); yb += ev * FLOOR_H;
    const [x0, z0] = at(ua), [x1, z1] = at(ub);
    c.quad(x0, ya, z0, x1, ya, z1, x1, yb, z1, x0, yb, z0, nx, 0, nz, ua, ya / FLOOR_H, ub, yb / FLOOR_H, [layer, 0, info.seed, 0], info.tint, rect, H, null, run.code ? [(ua / uTot) * run.L, (ub / uTot) * run.L, run.code] : null, run.nrmAt ? [run.nrmAt(ua / uTot), run.nrmAt(ub / uTot)] : null);
    tris += 2;
  };
  for (let b = Math.floor(u0 + 1e-6); b < u1 - 1e-6; b++) {
    const ua = Math.max(u0, b), ub = Math.min(u1, b + 1);
    if (ub - ua < 1e-4) continue;
    const complete = uTot >= 1 && ua - b < 1e-4 && b + 1 - ub < 1e-4;
    for (let f = 0; f < nF; f++) {
      const ya = f * FLOOR_H, yb = ya + FLOOR_H;
      const plain = sBase + (f === 0 ? CT.BLANK_G : CT.BLANK_U);
      const type = complete && run.cells ? run.cells.get(b * 64 + f) : undefined;
      if (type === undefined || type === CT.BLANK_G || type === CT.BLANK_U) { piece(ua, ub, ya, yb, plain, NORECT); continue; }
      const rect = holeRect(type, info.style, f > 0);
      // ground-floor doors, garages and shop fronts are recorded whatever the quality (street props, neighbours, markers)
      if (f === 0 && facade && facade.ground && (type === CT.DOOR || type === CT.GARAGE || type === CT.SHOP) && info.style !== 'nave') {
        const bw = run.L / uTot;
        const rr = rect || [0.3, 0, 0.7, 0.74];
        const [wx, wz] = at(b + (rr[0] + rr[2]) / 2);
        facade.ground.push({ x: wx, z: wz, nx, nz, r: ((rr[2] - rr[0]) * bw) / 2 + 0.35, type, bid: p.b, style: info.style });
      }
      if (!holes || !rect) { piece(ua, ub, ya, yb, sBase + type, rect || NORECT); continue; }
      tris += emitHoleCell(c, run, at, piece, b, f, type, rect, p, info, sBase, H, nF, facade);
    }
    if (H - nF * FLOOR_H > 0.02) piece(ua, ub, nF * FLOOR_H, H, sBase + CT.BLANK_U, NORECT);
  }
  return tris;
}

// wall around the hole, four plaster reveals with baked occlusion and the painted fill at the back
function emitHoleCell(c, run, at, piece, b, f, type, rect, p, info, sBase, H, nF, facade) {
  const { nx, nz, L, uTot } = run;
  const bw = L / uTot;
  const [rx0, ry0, rx1, ry1] = rect;
  const ya = f * FLOOR_H, yb = ya + FLOOR_H;
  const plain = sBase + (f === 0 ? CT.BLANK_G : CT.BLANK_U);
  const D = recessDepth(info.style, type, info.seed);
  const uL = b + rx0, uR = b + rx1;
  const yL = ya + ry0 * FLOOR_H, yT = ya + ry1 * FLOOR_H;
  piece(b, uL, ya, yb, plain, rect);
  piece(uR, b + 1, ya, yb, plain, rect);
  if (ry0 > 0.001) piece(uL, uR, ya, yL, plain, rect);
  piece(uL, uR, yT, yb, plain, rect);
  const T = info.tint;
  const [xl, zl] = at(uL), [xr, zr] = at(uR);
  const ix = -nx * D, iz = -nz * D;
  const tx = run.dx / L, tz = run.dz / L;
  const texP = [plain, 0, info.seed, 0];
  const dU = D / bw, dV = D / FLOOR_H;
  // jambs
  c.quad(xl, yL, zl, xl + ix, yL, zl + iz, xl + ix, yT, zl + iz, xl, yT, zl, tx, 0, tz, uL, yL / FLOOR_H, uL + dU, yT / FLOOR_H, texP, T, rect, H, [0.97, 0.7, 0.7, 0.97]);
  c.quad(xr, yL, zr, xr + ix, yL, zr + iz, xr + ix, yT, zr + iz, xr, yT, zr, -tx, 0, -tz, uR, yL / FLOOR_H, uR + dU, yT / FLOOR_H, texP, T, rect, H, [0.97, 0.7, 0.7, 0.97]);
  // lintel soffit
  c.quad(xl, yT, zl, xr, yT, zr, xr + ix, yT, zr + iz, xl + ix, yT, zl + iz, 0, -1, 0, uL, yT / FLOOR_H, uR, yT / FLOOR_H + dV, texP, T, rect, H, [0.86, 0.86, 0.6, 0.6]);
  // sill / threshold
  const yS = ry0 > 0.001 ? yL : 0.012;
  c.quad(xl, yS, zl, xr, yS, zr, xr + ix, yS, zr + iz, xl + ix, yS, zl + iz, 0, 1, 0, uL, yS / FLOOR_H, uR, yS / FLOOR_H + dV, texP, T, rect, H, [1, 1, 0.78, 0.78]);
  // painted fill (what far houses show; near the camera the material turns it into glass / a dark hall)
  c.quad(xl + ix, yL, zl + iz, xr + ix, yL, zr + iz, xr + ix, yT, zr + iz, xl + ix, yT, zl + iz, nx, 0, nz, uL, f + ry0, uR, f + ry1, [sBase + type, 0, info.seed, 2], T, rect, H);
  if (facade.openings) {
    const [ox, oz] = at(b);
    facade.openings.push({
      ox, oz, oy: ya, tx, tz, nx, nz, bw, b, f, type, style: info.style,
      x0: rx0 * bw, y0: ry0 * FLOOR_H, x1: rx1 * bw, y1: ry1 * FLOOR_H, D,
      seed: info.seed, tint: T, pid: p.id, bid: p.b, H, floors: nF,
    });
  }
  return 18;
}

function nearestBuilding(map, x, z, r) {
  let best = null, bd = r;
  for (const b of map.buildings) {
    const d = Math.hypot(b.c[0] - x, b.c[1] - z);
    if (d < bd + 12) {
      // distance to ring edges
      const ring = b.ring;
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length;
        const ex = ring[j] - ring[i], ez = ring[j + 1] - ring[i + 1];
        const l2 = ex * ex + ez * ez || 1;
        let t = ((x - ring[i]) * ex + (z - ring[i + 1]) * ez) / l2;
        t = Math.max(0, Math.min(1, t));
        const dd = Math.hypot(x - ring[i] - ex * t, z - ring[i + 1] - ez * t);
        if (dd < bd) { bd = dd; best = b; }
      }
    }
  }
  return best;
}

function buildRoof(c, p, info, H) {
  const rnd = info.rnd;
  const nave = info.style === 'nave';
  const r = p.ring;
  const area = p.area;
  const ob = orientedRect(r);
  const fill = ob ? area / (4 * ob.hw * ob.hd) : 0;
  const flatTop = (p.floors >= 3 && info.style !== 'color' && rnd() < 0.8) || (p.holes && p.holes.length);
  const tint = info.roofTint;
  let tris = 0;
  if (!flatTop && ob && fill > (nave ? 0.9 : 0.92) && Math.min(ob.hw, ob.hd) > 1.0 && Math.max(ob.hw, ob.hd) < 40 && r.length / 2 <= 10) {
    // ---- hip / gable roof over oriented rectangle
    let { cx, cz, ang, hw, hd } = ob;
    let ux = Math.cos(ang), uz = Math.sin(ang);
    if (hd > hw) { const t = hw; hw = hd; hd = t; const tx = ux; ux = -uz; uz = tx; }
    const vx = -uz, vz = ux;
    const e = nave ? 0.15 : 0.24;
    const A = hw + e, B = hd + e;
    const tanP = nave ? 0.2 : info.pitch;
    const rh = Math.min(B * tanP, nave ? 1.6 : 3.2);
    const gable = nave || (A > B * 2.2 && rnd() < 0.5);
    const rl = gable ? A : Math.max(0, A - B);
    const y = H - 0.02;
    const P = (a, b, yy) => [cx + ux * a + vx * b, yy, cz + uz * a + vz * b];
    const c1 = P(-A, -B, y), c2 = P(A, -B, y), c3 = P(A, B, y), c4 = P(-A, B, y);
    const r1 = P(-rl, 0, y + rh), r2 = P(rl, 0, y + rh);
    p.roofKind = 'hip';
    const layer = nave ? (rnd() < 0.55 ? ROOF.chapa : ROOF.uralita) : ROOF.teja;
    const tex = [layer, 1, info.seed, 0];
    const S = 3.2; // metres per roof texture tile
    const slope = Math.hypot(B, rh);
    // long side (-v): normal
    const nL = norm([-vx * rh, B, -vz * rh]);
    c.tri(c1, c2, r2, nL, [-A / S, 0], [A / S, 0], [rl / S, slope / S], tex, tint);
    c.tri(c1, r2, r1, nL, [-A / S, 0], [rl / S, slope / S], [-rl / S, slope / S], tex, tint);
    const nR = norm([vx * rh, B, vz * rh]);
    c.tri(c3, c4, r1, nR, [-A / S, 0], [A / S, 0], [rl / S, slope / S], tex, tint);
    c.tri(c3, r1, r2, nR, [-A / S, 0], [rl / S, slope / S], [-rl / S, slope / S], tex, tint);
    tris += 4;
    if (!gable) {
      const eL = Math.hypot(A - rl, rh);
      const nE = norm([ux * rh, A - rl, uz * rh]);
      c.tri(c2, c3, r2, nE, [-B / S, 0], [B / S, 0], [0, eL / S], tex, tint);
      const nW = norm([-ux * rh, A - rl, -uz * rh]);
      c.tri(c4, c1, r1, nW, [-B / S, 0], [B / S, 0], [0, eL / S], tex, tint);
      tris += 2;
    } else {
      // gable end walls (triangles) with plain wall texture
      const tp = [STYLE[info.style], 2, info.seed, 0];
      const g1 = P(A - e, -B + e, y), g2 = P(A - e, B - e, y), g3 = P(A - e, 0, y + rh - e * tanP);
      c.tri(g1, g2, g3, [ux, 0, uz], [0, H / FLOOR_H], [1, H / FLOOR_H], [0.5, (H + rh) / FLOOR_H], tp, info.tint);
      const g4 = P(-A + e, B - e, y), g5 = P(-A + e, -B + e, y), g6 = P(-A + e, 0, y + rh - e * tanP);
      c.tri(g4, g5, g6, [-ux, 0, -uz], [0, H / FLOOR_H], [1, H / FLOOR_H], [0.5, (H + rh) / FLOOR_H], tp, info.tint);
      tris += 2;
    }
    // soffits (underside of the overhang), so eaves don't look paper-thin from the street
    const w1 = P(-A + e, -B + e, y), w2 = P(A - e, -B + e, y), w3 = P(A - e, B - e, y), w4 = P(-A + e, B - e, y);
    const st = [STYLE[info.style], 2, info.seed, 0];
    const soff = (a, b, wa, wb) => { c.quad(wa[0], wa[1], wa[2], wb[0], wb[1], wb[2], b[0], b[1], b[2], a[0], a[1], a[2], 0, -1, 0, 0, 0.5, 1, 0.6, st, info.tint); tris += 2; };
    soff(c1, c2, w1, w2); soff(c2, c3, w2, w3); soff(c3, c4, w3, w4); soff(c4, c1, w4, w1);
    // the front row of tiles seen from the street (tile ends along every eave; gables get it on the long sides)
    const tileEdge = (a, b) => {
      const ex = b[0] - a[0], ez = b[2] - a[2], L = Math.hypot(ex, ez) || 1;
      const nx = ez / L, nz = -ex / L;
      c.quad(a[0], a[1] - 0.075, a[2], b[0], b[1] - 0.075, b[2], b[0], b[1] + 0.03, b[2], a[0], a[1] + 0.03, a[2], nx, 0, nz, 0, 0, L / S, 0.035, tex, tint);
      tris += 2;
    };
    const outward = (a, b) => { const ex = b[0] - a[0], ez = b[2] - a[2]; const mx = (a[0] + b[0]) / 2 - cx, mz = (a[2] + b[2]) / 2 - cz; return ez * mx - ex * mz > 0 ? [a, b] : [b, a]; };
    for (const [a, b] of gable ? [[c1, c2], [c3, c4]] : [[c1, c2], [c2, c3], [c3, c4], [c4, c1]]) { const [p0, p1] = outward(a, b); tileEdge(p0, p1); }
    // chimney (chimenea) on a share of the houses, rising from one slope
    if (!nave && rnd() < 0.42 && B > 2) {
      const ca = (rnd() - 0.5) * rl * 1.4, cb = -B * (0.35 + rnd() * 0.25);
      const base = P(ca, cb, 0);
      const yRoof = y + rh * (1 - Math.abs(cb) / B);
      tris += chimney(c, base[0], base[2], ux, uz, yRoof - 0.4, yRoof + 0.9 + rnd() * 0.5, info);
    }
    return tris;
  }
  // ---- irregular: tiled lip around the perimeter + terrace, or plain flat roof with parapet
  let lipD = 0, inner = null;
  let rr0 = r;
  if (!flatTop && !nave && !(p.holes && p.holes.length)) {
    rr0 = simplifyRing(r);
    for (const d of [Math.min(3.4, Math.sqrt(area) * 0.32), 2.3, 1.5, 0.9, 0.6]) {
      inner = insetRing(rr0, d);
      if (inner) { lipD = d; break; }
    }
  }
  if (inner) {
    p.roofKind = 'lip';
    const outer = outsetRing(rr0, 0.2);
    const n = rr0.length / 2;
    const rise = lipD * info.pitch;
    const tex = [ROOF.teja, 1, info.seed, 0];
    const S = 2.6;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = outer[i * 2], az = outer[i * 2 + 1], bx = outer[j * 2], bz = outer[j * 2 + 1];
      const cx = inner[j * 2], cz = inner[j * 2 + 1], dx = inner[i * 2], dz = inner[i * 2 + 1];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez) || 1;
      const nx = ez / L, nz = -ex / L;
      const nn = norm([nx * rise, lipD, nz * rise]);
      c.quad(ax, H, az, bx, H, bz, cx, H + rise, cz, dx, H + rise, dz, nn[0], nn[1], nn[2], 0, 0, L / S, Math.hypot(lipD, rise) / S, tex, tint);
      c.quad(ax, H - 0.075, az, bx, H - 0.075, bz, bx, H + 0.02, bz, ax, H + 0.02, az, nx, 0, nz, 0, 0, L / S, 0.035, tex, tint);
      tris += 4;
    }
    tris += flatCap(c, inner, null, H + rise, ROOF.azotea, info, tint);
    return tris;
  }
  // flat roof with parapet
  p.roofKind = 'flat';
  const parH = nave ? 0.35 : 0.8;
  const tp = [STYLE[info.style], 2, info.seed, 0];
  const rings = [r].concat(p.holes || []);
  for (const rr of rings) {
    const n = rr.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = rr[i * 2], az = rr[i * 2 + 1], bx = rr[j * 2], bz = rr[j * 2 + 1];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez);
      if (L < 0.05) continue;
      const nx = ez / L, nz = -ex / L;
      c.quad(ax, H, az, bx, H, bz, bx, H + parH, bz, ax, H + parH, az, nx, 0, nz, 0, H / FLOOR_H, L / BAY_W, (H + parH) / FLOOR_H, tp, info.tint);
      // inner face
      c.quad(bx, H, bz, ax, H, az, ax, H + parH, az, bx, H + parH, bz, -nx, 0, -nz, 0, H / FLOOR_H, L / BAY_W, (H + parH) / FLOOR_H, tp, info.tint);
      // coping on top (albardilla): a slab slightly wider than the wall with a small drip on the street side
      const yc = H + parH, o1 = 0.045, o2 = 0.2, cap = [info.tint[0] * 0.9, info.tint[1] * 0.9, info.tint[2] * 0.88];
      const gx = (ex / L) * 0.02, gz = (ez / L) * 0.02;
      c.quad(ax + nx * o1 - gx, yc + 0.04, az + nz * o1 - gz, bx + nx * o1 + gx, yc + 0.04, bz + nz * o1 + gz, bx - nx * o2 + gx, yc + 0.04, bz - nz * o2 + gz, ax - nx * o2 - gx, yc + 0.04, az - nz * o2 - gz, 0, 1, 0, 0, yc / FLOOR_H, L / BAY_W, yc / FLOOR_H + 0.05, tp, cap);
      c.quad(ax + nx * o1 - gx, yc - 0.03, az + nz * o1 - gz, bx + nx * o1 + gx, yc - 0.03, bz + nz * o1 + gz, bx + nx * o1 + gx, yc + 0.04, bz + nz * o1 + gz, ax + nx * o1 - gx, yc + 0.04, az + nz * o1 - gz, nx, 0, nz, 0, yc / FLOOR_H, L / BAY_W, yc / FLOOR_H + 0.02, tp, cap);
      c.quad(bx - nx * o2 + gx, yc - 0.01, bz - nz * o2 + gz, ax - nx * o2 - gx, yc - 0.01, az - nz * o2 - gz, ax - nx * o2 - gx, yc + 0.04, az - nz * o2 - gz, bx - nx * o2 + gx, yc + 0.04, bz - nz * o2 + gz, -nx, 0, -nz, 0, yc / FLOOR_H, L / BAY_W, yc / FLOOR_H + 0.02, tp, cap);
      tris += 10;
    }
  }
  tris += flatCap(c, r, p.holes, H + 0.02, nave ? ROOF.chapa : ROOF.azotea, info, tint);
  return tris;
}

// small whitewashed chimney with a tiled cap
function chimney(c, x, z, ux, uz, y0, y1, info) {
  const w = 0.32, vx = -uz, vz = ux;
  const tex = [STYLE[info.style], 2, info.seed, 0];
  const P = (a, b) => [x + ux * a + vx * b, z + uz * a + vz * b];
  const q = [P(-w, -w), P(w, -w), P(w, w), P(-w, w)];
  let t = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez);
    const nx = ez / L, nz = -ex / L;
    c.quad(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1], nx, 0, nz, 0, y0 / FLOOR_H, 0.25, y1 / FLOOR_H, tex, info.tint);
    t += 2;
  }
  // cap slab
  const cw = w + 0.08, capT = [ROOF.teja, 1, info.seed, 0];
  const k = [P(-cw, -cw), P(cw, -cw), P(cw, cw), P(-cw, cw)];
  c.quad(k[0][0], y1 + 0.12, k[0][1], k[1][0], y1 + 0.12, k[1][1], k[2][0], y1 + 0.12, k[2][1], k[3][0], y1 + 0.12, k[3][1], 0, 1, 0, 0, 0, 0.3, 0.3, capT, info.roofTint);
  for (let i = 0; i < 4; i++) {
    const a = k[i], b = k[(i + 1) % 4];
    const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez);
    c.quad(a[0], y1, a[1], b[0], y1, b[1], b[0], y1 + 0.12, b[1], a[0], y1 + 0.12, a[1], ez / L, 0, -ex / L, 0, 0, 0.3, 0.05, capT, info.roofTint);
  }
  return t + 10;
}

function flatCap(c, ring, holes, y, layer, info, tint) {
  let t;
  try { t = triangulate(ring, holes); } catch (e) { return 0; }
  const tex = [layer, 1, info.seed, 0];
  const S = 3;
  const i0 = c.vcount;
  for (const v of t.pts) {
    c.pos.push(v.x, y, v.y);
    c.nor.push(0, 1, 0);
    c.uv.push(v.x / S, v.y / S);
    c.tex.push(tex[0], tex[1], tex[2], tex[3]);
    c.tint.push(tint[0], tint[1], tint[2]);
    c.rect.push(0, 0, 0, 0);
    c.wall.push(0);
    if (c.edge) c.edge.push(0, 0);
  }
  for (const f of t.faces) {
    const a = t.pts[f[0]], b = t.pts[f[1]], d = t.pts[f[2]];
    // y-component of (b-a)x(d-a) with (x,z) mapped from 2D (x,y): -( (b.x-a.x)*(d.y-a.y) - (b.y-a.y)*(d.x-a.x) )
    const cy = -((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x));
    if (cy >= 0) c.idx.push(i0 + f[0], i0 + f[1], i0 + f[2]);
    else c.idx.push(i0 + f[0], i0 + f[2], i0 + f[1]);
  }
  return t.faces.length;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// Ground contact shadow strips along facades (baked AO look)
export function buildAOGeometry(ao, width = 1.3) {
  const n = ao.length / 6;
  const pos = new Float32Array(n * 4 * 3);
  const alpha = new Float32Array(n * 4);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const ax = ao[i * 6], az = ao[i * 6 + 1], bx = ao[i * 6 + 2], bz = ao[i * 6 + 3], nx = ao[i * 6 + 4], nz = ao[i * 6 + 5];
    const o = i * 12;
    pos.set([ax, 0.03, az, bx, 0.03, bz, bx + nx * width, 0.03, bz + nz * width, ax + nx * width, 0.03, az + nz * width], o);
    alpha.set([0.42, 0.42, 0, 0], i * 4);
    idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
