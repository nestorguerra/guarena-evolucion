// Real openings in the facades. The building walls get true holes with plaster reveals and a painted "fill" at the back
// (what distant houses show); around the camera the fill turns into glass and these details are streamed in, in small
// chunks: window frames, roller shutters, iron grilles (flat or "de buche"), wooden shutters, sills with geranium pots,
// balconies with railings and laundry, panelled doors, strip curtains, garage doors with their "vado" plate, shop fronts
// with metal shutter boxes, fascias and striped awnings, downpipes, split AC units and cornices.
import * as THREE from 'three';
import { BAY_W, FLOOR_H, STYLE_DEF } from './textures.js';
import { mulberry32, clamp } from './util.js';
// (the look — plastilina / real — as LOOK: STYLE here is the façades' styles)
import { STYLE as LOOK } from './style.js';
import { CardGeo, potPlant, groundPlant, GROUND_KINDS } from './trees.js';

// facade cell types = painted layer index inside a style
export const CT = { WIN_G: 0, DOOR: 1, GARAGE: 2, WIN_U: 3, BALC: 4, BLANK_G: 5, BLANK_U: 6, SHOP: 7 };

// hole of each opening in the canonical 3.2 x 3.1 m cell (metres, from the bottom-left), matching the painted layers
const HOLE = {
  win: [1.01, 0.93, 2.19, 2.34], winBigG: [0.51, 0.58, 2.69, 2.59], winBigU: [0.51, 0.48, 2.69, 2.59],
  door: [0.98, 0, 2.22, 2.32], doorModern: [0.98, 0, 2.22, 2.42],
  garage: [0.31, 0, 2.89, 2.6],
  balc: [1.06, 0.12, 2.14, 2.3], balcBig: [0.26, 0.08, 2.94, 2.64],
  shop: [0.17, 0.1, 3.03, 2.55],
};
export const styleHasHoles = (style) => style !== 'nave';

// normalized hole rectangle [x0, y0, x1, y1] of a cell, or null when that cell has no real opening
export function holeRect(type, style, upper) {
  if (!styleHasHoles(style)) return null;
  const big = !!STYLE_DEF[style].big;
  let h = null;
  if (type === CT.WIN_G || type === CT.WIN_U) h = big ? (upper ? HOLE.winBigU : HOLE.winBigG) : HOLE.win;
  else if (type === CT.DOOR) h = STYLE_DEF[style].door === 'modern' ? HOLE.doorModern : HOLE.door;
  else if (type === CT.GARAGE) h = HOLE.garage;
  else if (type === CT.BALC) h = big ? HOLE.balcBig : HOLE.balc;
  else if (type === CT.SHOP) h = HOLE.shop;
  if (!h) return null;
  return [h[0] / BAY_W, h[1] / FLOOR_H, h[2] / BAY_W, h[3] / FLOOR_H];
}

// wall thickness shown by the reveal (old whitewashed houses have thick walls)
const DEPTH = { trad_verde: 0.27, trad_ocre: 0.27, piedra: 0.3, renovada: 0.2, color: 0.21, ladrillo: 0.16, moderna: 0.14 };
export function recessDepth(style, type, seed) {
  if (type === CT.GARAGE) return 0.11;
  if (type === CT.SHOP) return 0.15;
  return (DEPTH[style] || 0.2) + (seed - 0.5) * 0.05;
}

const BALC_P = { trad_verde: 0.14, trad_ocre: 0.14, piedra: 0.1, renovada: 0.3, color: 0.34, ladrillo: 0.45, moderna: 0.42 };
const GARAGE_P = { trad_verde: 0.05, trad_ocre: 0.05, piedra: 0.03, renovada: 0.12, color: 0.1, ladrillo: 0.16, moderna: 0.18 };

// Decide what every complete cell of a part's street facades holds: one front door per house (two on long frontages),
// balconies mostly above the door, some garages, shop fronts on commercial ground floors.
// runs: [{ ax, az, dx, dz, L, uTot, t0, t1, exposed }] — sets run.cells (Map b*64+f -> type)
export function planPart(part, info, runs, H, forcedDoors) {
  const nF = Math.floor(H / FLOOR_H + 0.02);
  const rnd = mulberry32(((part.id + 17) * 2654435761) >>> 0);
  const ground = [];
  let bestRun = null;
  for (const r of runs) {
    r.cells = new Map();
    if (!r.exposed || r.mf || r.uTot < 1 || nF < 1) continue; // (measured walls: their own openings, fachadas.js)
    const u0 = r.uTot * r.t0, u1 = r.uTot * r.t1;
    r.b0 = Math.ceil(u0 - 1e-4); r.b1 = Math.floor(u1 + 1e-4);
    const len = (r.b1 - r.b0) * (r.L / r.uTot);
    if (r.b1 > r.b0 && (!bestRun || len > bestRun.len)) bestRun = { r, len };
    for (let b = r.b0; b < r.b1; b++) ground.push({ r, b });
  }
  if (!ground.length) return;
  const style = info.style;
  const set = (r, b, f, t) => r.cells.set(b * 64 + f, t);
  if (style === 'nave') {
    for (const g of ground) { const h = rnd(); set(g.r, g.b, 0, h < 0.2 ? CT.DOOR : h < 0.31 ? CT.GARAGE : CT.WIN_G); }
    for (const g of ground) for (let f = 1; f < nF; f++) set(g.r, g.b, f, CT.WIN_U);
    return;
  }
  const cellCenter = (g) => {
    const t = (g.b + 0.5) / g.r.uTot;
    return [g.r.ax + g.r.dx * t, g.r.az + g.r.dz * t];
  };
  if (info.shop) {
    for (const g of ground) set(g.r, g.b, 0, CT.SHOP);
  } else {
    const doors = new Set();
    if (forcedDoors) {
      for (const fp of forcedDoors) {
        let best = null, bd = 3.2;
        for (const g of ground) { const c = cellCenter(g); const d = Math.hypot(c[0] - fp.x, c[1] - fp.z); if (d < bd) { bd = d; best = g; } }
        if (best) doors.add(best);
      }
    }
    const width = ground.reduce((s, g) => s + g.r.L / g.r.uTot, 0);
    let want = Math.max(1, Math.round(width / 14)) - doors.size;
    if (want > 0) {
      // prefer the main (longest) facade, near its middle, with a little randomness
      const br = bestRun.r;
      const mid = (br.b0 + br.b1) / 2;
      const cand = ground.filter((g) => !doors.has(g)).map((g) => ({ g, s: (g.r === br ? 0 : 4) + Math.abs(g.b + 0.5 - mid) * 0.9 + rnd() * 1.6 }));
      cand.sort((a, b) => a.s - b.s);
      for (const c of cand) {
        if (want <= 0) break;
        if ([...doors].some((d) => d.r === c.g.r && Math.abs(d.b - c.g.b) < 2)) continue;
        doors.add(c.g); want--;
      }
    }
    const gp = GARAGE_P[style] ?? 0.1;
    for (const g of ground) {
      if (doors.has(g)) { set(g.r, g.b, 0, CT.DOOR); continue; }
      const h = rnd();
      const bw = g.r.L / g.r.uTot;
      set(g.r, g.b, 0, h < gp && bw > 2.6 ? CT.GARAGE : h > 0.95 ? CT.BLANK_G : CT.WIN_G);
    }
  }
  const bp = BALC_P[style] ?? 0.25;
  for (const g of ground) {
    for (let f = 1; f < nF; f++) {
      const below = g.r.cells.get(g.b * 64 + f - 1);
      const h = rnd();
      const t = (below === CT.DOOR && h < 0.55) || (below === CT.BALC && h < 0.6) || (below !== CT.DOOR && h < bp) ? CT.BALC : h > 0.96 ? CT.BLANK_U : CT.WIN_U;
      set(g.r, g.b, f, t);
    }
  }
}

// ------------------------------------------------------------------ geometry builder (cell-local frame)
// local x along the wall (from the cell's left edge), y up (from the floor base), z out of the wall
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();

export const PAT = { NONE: 0, SLATS: 1, RIBS: 2, LOUVER: 3, STRIPES: 4, SHUTTER: 5, GRANITE: 6, WOOD: 7, TILEEND: 8, STRIPS: 9, BRICK: 10, SLABS: 11, REEDS: 12 };
const ALL = 63, NOBACK = 31;

class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; this.i = []; this.nv = 0; }
  frame(ox, oy, oz, tx, tz, nx, nz) { this.o = [ox, oy, oz, tx, tz, nx, nz]; }
  v(x, y, z, a, b, c, col, pat) {
    const o = this.o;
    this.p.push(o[0] + o[3] * x + o[5] * z, o[1] + y, o[2] + o[4] * x + o[6] * z);
    this.n.push(o[3] * a + o[5] * c, b, o[4] * a + o[6] * c);
    this.c.push(col[0], col[1], col[2]);
    this.a.push(pat);
    return this.nv++;
  }
  // triangle wound so that its world-space face agrees with the vertex normals
  tri(i, j, k) {
    const P = this.p, N = this.n;
    const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2];
    const e1x = P[j * 3] - ax, e1y = P[j * 3 + 1] - ay, e1z = P[j * 3 + 2] - az;
    const e2x = P[k * 3] - ax, e2y = P[k * 3 + 1] - ay, e2z = P[k * 3 + 2] - az;
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    const nx = N[i * 3] + N[j * 3] + N[k * 3], ny = N[i * 3 + 1] + N[j * 3 + 1] + N[k * 3 + 1], nz = N[i * 3 + 2] + N[j * 3 + 2] + N[k * 3 + 2];
    if (gx * nx + gy * ny + gz * nz >= 0) this.i.push(i, j, k); else this.i.push(i, k, j);
  }
  quad(P0, P1, P2, P3, a, b, c, col, pat = 0) {
    const i = this.v(P0[0], P0[1], P0[2], a, b, c, col, pat);
    this.v(P1[0], P1[1], P1[2], a, b, c, col, pat);
    this.v(P2[0], P2[1], P2[2], a, b, c, col, pat);
    this.v(P3[0], P3[1], P3[2], a, b, c, col, pat);
    this.tri(i, i + 1, i + 2); this.tri(i, i + 2, i + 3);
  }
  box(x0, y0, z0, x1, y1, z1, col, pat = 0, faces = NOBACK) {
    if (LOOK.plastilina) return this.clayBox(x0, y0, z0, x1, y1, z1, col, pat, faces);
    if (faces & 1) this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 1, 0, 0, col, pat);
    if (faces & 2) this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], -1, 0, 0, col, pat);
    if (faces & 4) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 0, 1, 0, col, pat);
    if (faces & 8) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], 0, -1, 0, col, pat);
    if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, col, pat);
    if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, col, pat);
  }
  // claymation: the same box as a soft slab of clay — each corner's normal leans out along its diagonal, so the light
  // turns round every edge as round a rounded one (no extra triangles; the outline stays the same)
  clayBox(x0, y0, z0, x1, y1, z1, col, pat, faces) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const k = 0.62 * Math.min(1, Math.max(0.2, 0.9 / Math.max(x1 - x0, y1 - y0, z1 - z0))); // (small things the softest)
    const q = (P, fn) => { // a corner's normal: the face's, leaning towards the corner
      const ox = Math.sign(P[0] - cx), oy = Math.sign(P[1] - cy), oz = Math.sign(P[2] - cz);
      const nx = fn[0] + ox * k * (1 - Math.abs(fn[0])), ny = fn[1] + oy * k * (1 - Math.abs(fn[1])), nz = fn[2] + oz * k * (1 - Math.abs(fn[2]));
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    };
    const face = (P0, P1, P2, P3, fn) => {
      const i = this.nv;
      for (const P of [P0, P1, P2, P3]) { const n = q(P, fn); this.v(P[0], P[1], P[2], n[0], n[1], n[2], col, pat); }
      this.tri(i, i + 1, i + 2); this.tri(i, i + 2, i + 3);
    };
    if (faces & 1) face([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
    if (faces & 2) face([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]);
    if (faces & 4) face([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    if (faces & 8) face([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]);
    if (faces & 16) face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (faces & 32) face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  }
  // square-section bar between two local points
  bar(A, B, s, col, pat = 0) {
    if (LOOK.plastilina) s *= 1.6; // (claymation: iron bars as rolls of black clay, fat as in the user's pictures)
    let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    const up = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let px = dy * up[2] - dz * up[1], py = dz * up[0] - dx * up[2], pz = dx * up[1] - dy * up[0];
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const qx = py * dz - pz * dy, qy = pz * dx - px * dz, qz = px * dy - py * dx;
    const h = s / 2;
    const C = [[px + qx, py + qy, pz + qz], [-px + qx, -py + qy, -pz + qz], [-px - qx, -py - qy, -pz - qz], [px - qx, py - qy, pz - qz]];
    const NN = [[qx, qy, qz], [-px, -py, -pz], [-qx, -qy, -qz], [px, py, pz]];
    let skip = -1, mz = -0.5;
    for (let k = 0; k < 4; k++) if (NN[k][2] < mz) { mz = NN[k][2]; skip = k; }
    for (let k = 0; k < 4; k++) {
      if (k === skip) continue; // face turned to the wall: never seen
      const c0 = C[k], c1 = C[(k + 1) % 4], nn = NN[k];
      if (LOOK.plastilina) { // a round roll: each corner's normal its own diagonal, so it shades as a cylinder
        const i = this.nv, n0 = [c0[0] / Math.SQRT2, c0[1] / Math.SQRT2, c0[2] / Math.SQRT2], n1 = [c1[0] / Math.SQRT2, c1[1] / Math.SQRT2, c1[2] / Math.SQRT2];
        this.v(A[0] + c0[0] * h, A[1] + c0[1] * h, A[2] + c0[2] * h, n0[0], n0[1], n0[2], col, pat);
        this.v(A[0] + c1[0] * h, A[1] + c1[1] * h, A[2] + c1[2] * h, n1[0], n1[1], n1[2], col, pat);
        this.v(B[0] + c1[0] * h, B[1] + c1[1] * h, B[2] + c1[2] * h, n1[0], n1[1], n1[2], col, pat);
        this.v(B[0] + c0[0] * h, B[1] + c0[1] * h, B[2] + c0[2] * h, n0[0], n0[1], n0[2], col, pat);
        this.tri(i, i + 1, i + 2); this.tri(i, i + 2, i + 3);
        continue;
      }
      this.quad([A[0] + c0[0] * h, A[1] + c0[1] * h, A[2] + c0[2] * h], [A[0] + c1[0] * h, A[1] + c1[1] * h, A[2] + c1[2] * h],
        [B[0] + c1[0] * h, B[1] + c1[1] * h, B[2] + c1[2] * h], [B[0] + c0[0] * h, B[1] + c0[1] * h, B[2] + c0[2] * h], nn[0], nn[1], nn[2], col, pat);
    }
  }
  // vertical (local y) truncated cone with smooth normals
  cyl(cx, cz, y0, y1, r0, r1, sides, col, capTop = false, pat = 0) {
    const i0 = this.nv;
    const sl = (r0 - r1) / Math.max(1e-3, y1 - y0);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, sl);
      this.v(cx + ca * r0, y0, cz + sa * r0, ca / nl, sl / nl, sa / nl, col, pat);
      this.v(cx + ca * r1, y1, cz + sa * r1, ca / nl, sl / nl, sa / nl, col, pat);
    }
    for (let k = 0; k < sides; k++) { const a = i0 + k * 2; this.tri(a, a + 2, a + 3); this.tri(a, a + 3, a + 1); }
    if (capTop) {
      const c = this.v(cx, y1, cz, 0, 1, 0, col, pat);
      const j0 = this.nv;
      for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2; this.v(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, col, pat); }
      for (let k = 0; k < sides; k++) this.tri(c, j0 + k, j0 + ((k + 1) % sides));
    }
  }
  // lumpy foliage (icosahedron) with some flower-coloured vertices
  blob(cx, cy, cz, rx, ry, rz, col, rnd, flowers = null, nFl = 0) {
    const i0 = this.nv;
    const V = ICO.v;
    for (let k = 0; k < 12; k++) {
      const s = 1 + (rnd() - 0.5) * 0.4;
      const c = flowers && k < nFl + 1 && V[k][1] > -0.3 ? flowers : col;
      this.v(cx + V[k][0] * rx * s, cy + V[k][1] * ry * s, cz + V[k][2] * rz * s, V[k][0], V[k][1], V[k][2], c, 0);
    }
    for (const f of ICO.f) this.tri(i0 + f[0], i0 + f[1], i0 + f[2]);
  }
  // append a static prop (vertex-coloured BufferGeometry) placed in world space: rotation about Y, scale, tint
  prop(geo, x, y, z, ry, s, sy, tint) {
    const P = geo.attributes.position, Nn = geo.attributes.normal, Cc = geo.attributes.color;
    const c = Math.cos(ry), sn = Math.sin(ry);
    const i0 = this.nv;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i) * s, py = P.getY(i) * sy, pz = P.getZ(i) * s;
      this.p.push(x + px * c + pz * sn, y + py, z - px * sn + pz * c);
      const nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i);
      this.n.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
      const r = Cc ? Cc.getX(i) : 1, g = Cc ? Cc.getY(i) : 1, b = Cc ? Cc.getZ(i) : 1;
      this.c.push(clamp(Math.round(r * tr * 255), 0, 255), clamp(Math.round(g * tg * 255), 0, 255), clamp(Math.round(b * tb * 255), 0, 255));
      this.a.push(0);
    }
    if (geo.index) { const ix = geo.index.array; for (let k = 0; k < ix.length; k++) this.i.push(i0 + ix[k]); }
    else for (let k = 0; k < P.count; k++) this.i.push(i0 + k);
    this.nv += P.count;
  }
  build(material) {
    if (!this.nv) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    const n8 = new Int8Array(this.n.length);
    for (let i = 0; i < this.n.length; i += 3) {
      const x = this.n[i], y = this.n[i + 1], z = this.n[i + 2], l = Math.hypot(x, y, z) || 1;
      n8[i] = Math.round((x / l) * 127); n8[i + 1] = Math.round((y / l) * 127); n8[i + 2] = Math.round((z / l) * 127);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n8, 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.c), 3, true));
    g.setAttribute('aPat', new THREE.BufferAttribute(new Uint8Array(this.a), 1, false));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    m.receiveShadow = true;
    return m;
  }
}

// ------------------------------------------------------------------ palettes
export const hexC = (h, k = 1) => { const v = parseInt(h.slice(1), 16); return [clamp(Math.round(((v >> 16) & 255) * k), 0, 255), clamp(Math.round(((v >> 8) & 255) * k), 0, 255), clamp(Math.round((v & 255) * k), 0, 255)]; };
const mul = (c, k) => [clamp(Math.round(c[0] * k), 0, 255), clamp(Math.round(c[1] * k), 0, 255), clamp(Math.round(c[2] * k), 0, 255)];
const pickR = (rnd, a) => a[Math.floor(rnd() * a.length) % a.length];
export const C = {
  iron: hexC('#1c1c1e'), ironGreen: hexC('#2f3b30'), ironWhite: hexC('#eeede7'), ironBrown: hexC('#4d3322'),
  alu: hexC('#b9bbb8'), aluWhite: hexC('#eeeeea'), aluBronze: hexC('#5a4636'), anth: hexC('#2c2e31'),
  marble: hexC('#ece6da'), terracotta: hexC('#b36a45'), granite: hexC('#cfc6b4'), graniteDk: hexC('#9e978a'), step: hexC('#d9d2c2'),
  pot: hexC('#b5552e'), potBlue: hexC('#2f64a8'), potWhite: hexC('#e9e6de'), potGreen: hexC('#3f6e4a'), soil: hexC('#3b2b1f'), leaf: hexC('#3f7a35'), leaf2: hexC('#2f6a2c'),
  red: hexC('#d8263a'), pink: hexC('#e8487a'), whiteFl: hexC('#f4f1ea'), purple: hexC('#8a4fa8'),
  glassDk: hexC('#27323c'), brass: hexC('#b08d3c'), metal: hexC('#8e9295'), metalDk: hexC('#6d7175'), pipe: hexC('#9fa3a6'),
  ac: hexC('#ecece8'), acDk: hexC('#3a3c3e'), plate: hexC('#f4f6f8'), tileBlue: hexC('#2f5aa0'), vadoRed: hexC('#c8202a'), vadoBlue: hexC('#2d56a8'),
  meter: hexC('#c9c9c2'), slabUnder: hexC('#cfc9bd'),
  sandstone: hexC('#d6c3a0'), sandSill: hexC('#e2d4b6'), // the claymation's warm stone
};
const RECERCADO = ['#d9a441', '#c9b27a', '#8d97a3', '#4f6fa8', '#b8793f'];
const RECERCADO_CLAY = ['#cfae78', '#c49a62', '#b8793f', '#d8c39a', '#c9b27a']; // the claymation's: warm ochres and sand
const CURTAINS = ['#2f7a45', '#b8342c', '#d8b23a', '#3e5f9a', '#6b4a2e', '#e8e4d8'];
const AWNING = ['#1d6e3e', '#b02a2a', '#1f4f8a', '#c77a12', '#6b4a2e', '#2a2a2a'];
const FASCIA = ['#1f3b5a', '#7a1f1f', '#23472c', '#3b3b3b', '#8a5a1c', '#5a2d5f', '#e8e4dc'];
const LAUNDRY = ['#f2f2ee', '#e2574c', '#4a7fc0', '#f2c230', '#7fbf6a', '#f08aa8', '#ffffff', '#8a6ad0'];

// per-building choices (consistent for all openings of a house)
const bsCache = new Map();
function buildingStyle(o) {
  const key = o.bid >= 0 ? 'b' + o.bid : 'p' + o.pid;
  let bs = bsCache.get(key);
  if (bs) return bs;
  const r = mulberry32(((o.bid + 7) * 374761393 + 911) >>> 0);
  const S = STYLE_DEF[o.style];
  const trad = o.style === 'trad_verde' || o.style === 'trad_ocre';
  const wallC = S.wall && S.wall[0] === '#' ? hexC(S.wall) : hexC('#f2efe8');
  const tint = o.tint || [1, 1, 1];
  bs = {
    trad, style: o.style, big: !!S.big,
    wall: [clamp(Math.round(wallC[0] * tint[0]), 0, 255), clamp(Math.round(wallC[1] * tint[1]), 0, 255), clamp(Math.round(wallC[2] * tint[2]), 0, 255)],
    frame: hexC(S.frame), wood: hexC(S.wood), pers: hexC(S.persiana), doorCol: hexC(S.doorCol), garage: hexC(S.garage),
    doorKind: S.door,
  };
  // renovated carpentry: white or bronze aluminium on many old houses too
  const fr = r();
  if (!bs.big && fr < (trad ? 0.22 : 0.3)) { bs.frame = fr < 0.12 ? C.aluWhite : C.aluBronze; bs.alu = true; }
  if (o.style === 'renovada' || o.style === 'ladrillo') bs.alu = true;
  bs.rejaCol = trad || o.style === 'piedra' ? (r() < 0.72 ? C.iron : r() < 0.5 ? C.ironWhite : C.ironGreen) : (r() < 0.8 ? C.iron : C.ironWhite);
  bs.reja = !!S.reja && r() < 0.85;
  // (claymation: as in the user's pictures, the old houses' windows behind fat black grilles, pots on every other sill)
  if (LOOK.plastilina && (trad || o.style === 'piedra' || o.style === 'color' || o.style === 'renovada')) { bs.reja = r() < 0.92; bs.rejaCol = r() < 0.88 ? C.iron : bs.rejaCol; }
  bs.buche = (trad || o.style === 'piedra') && r() < 0.3;
  bs.sill = o.style === 'piedra' ? C.granite : o.style === 'ladrillo' ? hexC('#9b9a95') : o.style === 'moderna' ? hexC('#c9c9c6') : trad && r() < 0.3 ? C.terracotta : C.marble;
  bs.sillPat = o.style === 'piedra' || o.style === 'ladrillo' ? PAT.GRANITE : 0;
  // (claymation: wide, proud door surrounds of warm sandstone on most old houses)
  const PL = LOOK.plastilina;
  bs.surround = o.style === 'piedra' || ((trad || o.style === 'renovada' || (PL && o.style === 'color')) && r() < (PL ? 0.8 : 0.55));
  bs.stone = PL && o.style !== 'piedra' ? C.sandstone : C.granite;
  if (PL && bs.sill === C.marble) bs.sill = C.sandSill;
  bs.recercado = !bs.surround && (trad || o.style === 'color') && r() < 0.35 ? hexC(pickR(r, PL ? RECERCADO_CLAY : RECERCADO)) : null;
  bs.pots = (trad || o.style === 'renovada' || o.style === 'color' || o.style === 'piedra') ? (LOOK.plastilina ? 0.88 : 0.45) : (LOOK.plastilina ? 0.6 : 0.12); // (claymation: geraniums on most sills, as in the user's pictures)
  bs.shutters = trad || o.style === 'piedra';
  bs.curtain = hexC(pickR(r, CURTAINS));
  bs.pipe = r() < 0.6 ? C.pipe : r() < 0.5 ? hexC('#e8e8e4') : hexC('#a65a3a');
  if (LOOK.plastilina) bs.pipe = hexC('#8e9092'); // (claymation: grey clay downpipes, as in the user's pictures)
  bs.awning = hexC(pickR(r, AWNING));
  bs.fascia = hexC(pickR(r, FASCIA));
  bs.ac = !trad && o.style !== 'piedra' ? 0.22 : 0.06;
  bs.cornice = o.style === 'renovada' || o.style === 'color' || o.style === 'ladrillo';
  const pv = r();
  if (pv < 0.2) bs.pers = hexC('#f1efe9'); else if (pv < 0.3) bs.pers = hexC('#8a8d90'); else if (pv < 0.36) bs.pers = hexC('#6b4a2e');
  bsCache.set(key, bs);
  return bs;
}

// ------------------------------------------------------------------ element builders
export function frameRect(G, x0, y0, x1, y1, zb, zf, fw, col, mullion = false, bottomW = fw) {
  G.box(x0, y0, zb, x0 + fw, y1, zf, col);
  G.box(x1 - fw, y0, zb, x1, y1, zf, col);
  G.box(x0 + fw, y1 - fw, zb, x1 - fw, y1, zf, col);
  G.box(x0 + fw, y0, zb, x1 - fw, y0 + bottomW, zf, col);
  if (mullion) { const m = (x0 + x1) / 2; G.box(m - fw * 0.55, y0 + bottomW, zb, m + fw * 0.55, y1 - fw, zf - 0.008, col); }
}

export function persiana(G, x0, y0, x1, y1, z, level, col, guideCol) {
  const yb = y1 - (y1 - y0) * level;
  if (level > 0.02) G.quad([x0, yb, z], [x1, yb, z], [x1, y1, z], [x0, y1, z], 0, 0, 1, col, PAT.SLATS);
  const yr = Math.min(yb, y1 - 0.03);
  G.box(x0, yr - 0.03, z - 0.012, x1, yr, z + 0.014, mul(col, 0.82));
  G.box(x0 - 0.024, y0, z - 0.016, x0, y1, z + 0.016, guideCol);
  G.box(x1, y0, z - 0.016, x1 + 0.024, y1, z + 0.016, guideCol);
}

function persianaLevel(rnd) {
  const r = rnd();
  return r < 0.16 ? 0 : r < 0.6 ? 0.12 + rnd() * 0.45 : r < 0.84 ? 0.6 + rnd() * 0.32 : 1;
}

// the plants' cards of the chunk being built (see FacadeDetails.build); the pots go into the solid geometry
let CUR_P = null;
// a clay pot: tapered, with its rolled rim and the soil inside
export function potBody(G, x, y, z, r, h, col) {
  G.cyl(x, z, y, y + h, r * 0.74, r, 9, col);
  G.cyl(x, z, y + h - r * 0.24, y + h + r * 0.04, r * 1.1, r * 1.1, 9, mul(col, 0.9));
  G.cyl(x, z, y + h - r * 0.1, y + h - r * 0.1, r * 1.0, r * 1.0, 9, C.soil, true);
}
export function flowerPot(G, x, y, z, r, rnd, hanging = false) {
  const pr = rnd();
  const pc = pr < 0.72 ? C.pot : pr < 0.86 ? C.potBlue : pr < 0.95 ? C.potWhite : C.potGreen;
  if (CUR_P) { // geraniums above all, trailing ivy geraniums on the railings, a spider plant, an aspidistra
    const h = r * 1.6;
    potBody(G, x, y, z, r, h, pc);
    const kind = hanging ? (rnd() < 0.75 ? 'gitanilla' : 'geranio') : pickR(rnd, ['geranio', 'geranio', 'geranio', 'geranio', 'cinta', 'aspidistra', 'gitanilla', 'mata']);
    potPlant(CUR_P, kind, x, y + h - r * 0.1, z, r, rnd);
    return;
  }
  G.cyl(x, z, y, y + r * 1.7, r * 0.75, r, 7, pc);
  const fl = pickR(rnd, [C.red, C.red, C.pink, C.whiteFl, C.purple]);
  const leaf = rnd() < 0.5 ? C.leaf : C.leaf2;
  if (hanging) {
    G.blob(x, y + r * 1.2, z + r * 0.4, r * 1.7, r * 2.0, r * 1.5, leaf, rnd, fl, 5);
  } else {
    G.blob(x, y + r * 2.25, z, r * 1.55, r * 1.2, r * 1.45, leaf, rnd, fl, 4);
    // a couple of crisp flower heads on top
    for (let k = 0; k < 2; k++) {
      const a = rnd() * Math.PI * 2, fx = x + Math.cos(a) * r * 0.8, fz = z + Math.sin(a) * r * 0.6, fy = y + r * 3.1 + rnd() * r * 0.3;
      G.box(fx - 0.018, fy - 0.018, fz - 0.018, fx + 0.018, fy + 0.018, fz + 0.018, fl, 0, 31);
    }
  }
}

function reja(G, x0, y0, x1, y1, z, col, buche, rnd) {
  const s = 0.016;
  const bulge = buche ? 0.17 : 0;
  const ym = buche ? y0 + (y1 - y0) * 0.55 : y0;
  const zb = z + bulge;
  // outer frame
  G.bar([x0, y1, z], [x1, y1, z], s, col);
  G.bar([x0, y1 - 0.13, z], [x1, y1 - 0.13, z], s * 0.8, col);
  G.bar([x0, y0, zb], [x1, y0, zb], s, col);
  if (buche) { G.bar([x0, ym, z], [x1, ym, z], s * 0.8, col); G.bar([x0, y0 + (ym - y0) * 0.5, z + bulge * 0.55], [x1, y0 + (ym - y0) * 0.5, z + bulge * 0.55], s * 0.8, col); }
  else G.bar([x0, (y0 + y1) * 0.5, z], [x1, (y0 + y1) * 0.5, z], s * 0.8, col);
  const n = Math.max(3, Math.round((x1 - x0) / 0.11));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const ss = i === 0 || i === n ? s : s * 0.8;
    G.bar([x, y1 + 0.008, z], [x, ym, z], ss, col);
    if (buche) G.bar([x, ym, z], [x, y0 - 0.008, zb], ss, col);
    else G.bar([x, ym, z], [x, y0 - 0.008, z], ss, col);
  }
  // anchors into the wall
  for (const x of [x0 + 0.02, x1 - 0.02]) {
    G.bar([x, y1 - 0.04, 0], [x, y1 - 0.04, z], s * 0.9, col);
    G.bar([x, y0 + 0.05, 0], [x, y0 + 0.05, buche ? zb * 0.9 : z], s * 0.9, col);
  }
}

export function awning(G, x0, x1, yTop, zTop, drop, out, col, withArms = true) {
  const yF = yTop - drop, zF = zTop + out;
  const L = Math.hypot(drop, out);
  const ny = out / L, nz = drop / L;
  G.quad([x0, yTop, zTop], [x1, yTop, zTop], [x1, yF, zF], [x0, yF, zF], 0, ny, nz, col, PAT.STRIPES);
  G.quad([x0, yTop - 0.004, zTop], [x0, yF - 0.004, zF], [x1, yF - 0.004, zF], [x1, yTop - 0.004, zTop], 0, -ny, -nz, mul(col, 0.62), PAT.STRIPES);
  // valance (faldón) with both faces
  const vh = 0.22;
  G.quad([x0, yF, zF], [x1, yF, zF], [x1, yF - vh, zF], [x0, yF - vh, zF], 0, 0, 1, col, PAT.STRIPES);
  G.quad([x1, yF, zF - 0.004], [x0, yF, zF - 0.004], [x0, yF - vh, zF - 0.004], [x1, yF - vh, zF - 0.004], 0, 0, -1, mul(col, 0.6), PAT.STRIPES);
  if (withArms) for (const x of [x0 + 0.06, x1 - 0.06]) G.bar([x, yTop - drop * 0.7, 0.02], [x, yF + 0.01, zF - 0.02], 0.02, C.metalDk);
}

export function laundry(G, x0, x1, yTop, z, rnd) {
  let x = x0 + 0.05;
  while (x < x1 - 0.35) {
    const w = 0.3 + rnd() * 0.45;
    if (x + w > x1 - 0.05) break;
    const h = 0.35 + rnd() * 0.4;
    const col = hexC(pickR(rnd, LAUNDRY));
    G.box(x, yTop - h, z + 0.018, x + w, yTop + 0.012, z + 0.03, col, 0, 31);
    G.box(x, yTop - 0.12, z - 0.03, x + w, yTop + 0.012, z - 0.018, mul(col, 0.9), 0, 31);
    x += w + 0.08 + rnd() * 0.3;
    if (rnd() < 0.3) break;
  }
}

export function acUnit(G, x0, y0, rnd) {
  const w = 0.78, h = 0.52, d = 0.27;
  G.box(x0, y0, 0.03, x0 + w, y0 + h, 0.03 + d, C.ac);
  // fan grille (dark disc) and side vents
  G.cyl(x0 + w * 0.36, 0.03 + d + 0.004, y0 + h * 0.5 - 0.001, y0 + h * 0.5 + 0.001, 0.19, 0.19, 10, C.acDk);
  G.box(x0 + w * 0.36 - 0.19, y0 + h * 0.5 - 0.19, 0.03 + d, x0 + w * 0.36 + 0.19, y0 + h * 0.5 + 0.19, 0.03 + d + 0.006, C.acDk, 0, 16);
  G.box(x0 + w * 0.7, y0 + 0.08, 0.03 + d, x0 + w * 0.94, y0 + h - 0.08, 0.03 + d + 0.004, mul(C.ac, 0.85), PAT.LOUVER, 16);
  // brackets and condensate pipe
  G.box(x0 + 0.06, y0 - 0.05, 0, x0 + 0.1, y0, 0.3, C.metalDk);
  G.box(x0 + w - 0.1, y0 - 0.05, 0, x0 + w - 0.06, y0, 0.3, C.metalDk);
  G.bar([x0 + w - 0.12, y0 - 0.02, 0.04], [x0 + w - 0.12, y0 - 0.02 - 0.6 - rnd() * 0.5, 0.04], 0.018, C.acDk);
}

function buildWindow(G, F, o, bs, rnd, upper) {
  const X0 = o.x0, X1 = o.x1, Y0 = o.y0, Y1 = o.y1, D = o.D;
  const W = X1 - X0;
  const zb = -D + 0.004, zf = -D + 0.065;
  const fc = bs.frame;
  frameRect(G, X0, Y0, X1, Y1, zb, zf, 0.055, fc, W > 0.75, 0.07);
  // roller shutter in its guides, in front of the glass
  const zP = -D + 0.095;
  persiana(G, X0 + 0.024, Y0 + 0.07, X1 - 0.024, Y1, zP, persianaLevel(rnd), bs.pers, bs.alu ? C.alu : fc);
  // sill
  G.box(X0 - 0.05, Y0 - 0.034, -D + 0.07, X1 + 0.05, Y0 + 0.004, 0.044, bs.sill, bs.sillPat);
  const hasReja = bs.reja && (!upper ? rnd() < (LOOK.plastilina ? 0.93 : 0.78) : rnd() < 0.1);
  // pots on the sill (between the shutter and the grille / wall face)
  if (rnd() < bs.pots) {
    const n = W > 0.95 ? 3 : 2;
    const zPot = Math.min(-0.02, (zP + 0.03 + 0.03) / 2);
    const rr = clamp((0.03 - zP) * 0.3, 0.045, 0.068);
    for (let k = 0; k < n; k++) flowerPot(F, X0 + (W * (k + 0.5)) / n, Y0 + 0.004, zPot, rr, rnd, false);
  }
  if (hasReja) {
    reja(G, X0 - 0.065, Y0 - 0.06, X1 + 0.065, Y1 + 0.07, 0.075, bs.rejaCol, bs.buche && !upper, rnd);
  } else if (upper && bs.shutters && rnd() < 0.62 && X0 - W / 2 > 0.04) {
    // wooden shutters (contraventanas) folded open against the wall
    const w = W / 2;
    G.box(X0 - w - 0.018, Y0, 0.004, X0 - 0.018, Y1, 0.034, bs.wood, PAT.LOUVER);
    G.box(X1 + 0.018, Y0, 0.004, X1 + w + 0.018, Y1, 0.034, bs.wood, PAT.LOUVER);
    for (const x of [X0 - 0.02, X1 + 0.02]) for (const y of [Y0 + 0.25, Y1 - 0.25]) G.box(x - 0.012, y - 0.02, 0, x + 0.012, y + 0.02, 0.04, C.iron);
  }
  // painted surround (recercado) typical of the whitewashed villages
  if (bs.recercado) {
    const b = 0.13, z = 0.003;
    G.box(X0 - b, Y0 - 0.04, 0, X0, Y1 + b, z, bs.recercado, 0, 16);
    G.box(X1, Y0 - 0.04, 0, X1 + b, Y1 + b, z, bs.recercado, 0, 16);
    G.box(X0, Y1, 0, X1, Y1 + b, z, bs.recercado, 0, 16);
  }
  // split AC unit beside some upper windows
  if (upper && rnd() < bs.ac) {
    if (o.bw - X1 > 0.98) acUnit(G, X1 + 0.12, Y1 - 0.62, rnd);
    else if (X0 > 0.98) acUnit(G, X0 - 0.9, Y1 - 0.62, rnd);
  }
}

function buildBalcony(G, F, o, bs, rnd) {
  const X0 = o.x0, X1 = o.x1, Y0 = o.y0, Y1 = o.y1, D = o.D;
  const W = X1 - X0;
  const zb = -D + 0.004, zf = -D + 0.065;
  frameRect(G, X0, Y0, X1, Y1, zb, zf, 0.055, bs.frame, W > 0.7, 0.06);
  if (!bs.big) persiana(G, X0 + 0.024, Y0 + 0.06, X1 - 0.024, Y1, -D + 0.095, persianaLevel(rnd), bs.pers, bs.alu ? C.alu : bs.frame);
  // slab
  const xa = Math.max(0.05, X0 - (bs.big ? 0.1 : 0.34)), xb = Math.min(o.bw - 0.05, X1 + (bs.big ? 0.1 : 0.34));
  const zo = bs.big ? 0.75 : 0.5;
  G.box(xa, Y0 - 0.15, -D + 0.07, xb, Y0 + 0.004, zo, bs.big ? hexC('#d8d6d0') : mul(bs.wall, 0.95));
  G.box(xa - 0.02, Y0 - 0.19, 0, xb + 0.02, Y0 - 0.15, zo + 0.02, mul(bs.wall, 0.86), 0, 31);
  // railing
  const rT = Y0 + 1.0, rB = Y0 + 0.07, zr = zo - 0.035, xl = xa + 0.035, xr = xb - 0.035;
  const col = bs.rejaCol;
  if (bs.big) {
    G.box(xl, rB, zr - 0.008, xr, rT, zr + 0.008, hexC('#34414c'), 0, ALL);
    G.box(xl - 0.01, rT, zr - 0.02, xr + 0.01, rT + 0.035, zr + 0.02, C.alu, 0, ALL);
  } else {
    G.box(xl, rT - 0.035, zr - 0.02, xr, rT, zr + 0.02, col, 0, ALL);
    G.box(xl - 0.02, rT - 0.035, 0, xl + 0.02, rT, zr, col, 0, ALL);
    G.box(xr - 0.02, rT - 0.035, 0, xr + 0.02, rT, zr, col, 0, ALL);
    G.bar([xl, rB, zr], [xr, rB, zr], 0.018, col);
    G.bar([xl, rB, 0.02], [xl, rB, zr], 0.018, col);
    G.bar([xr, rB, 0.02], [xr, rB, zr], 0.018, col);
    const n = Math.max(4, Math.round((xr - xl) / 0.11));
    for (let i = 0; i <= n; i++) { const x = xl + ((xr - xl) * i) / n; G.bar([x, rB - 0.07, zr], [x, rT - 0.035, zr], 0.014, col); }
    const ns = Math.max(2, Math.round(zr / 0.11));
    for (let i = 1; i < ns; i++) { const z = (zr * i) / ns; G.bar([xl, rB - 0.07, z], [xl, rT - 0.035, z], 0.014, col); G.bar([xr, rB - 0.07, z], [xr, rT - 0.035, z], 0.014, col); }
  }
  // hanging geraniums, laundry, an awning now and then
  if (!bs.big && rnd() < 0.45) {
    const n = (xr - xl) > 1.3 ? 3 : 2;
    for (let k = 0; k < n; k++) flowerPot(F, xl + 0.15 + ((xr - xl - 0.3) * k) / Math.max(1, n - 1), rT - 0.2, zr + 0.09, 0.07, rnd, true);
  } else if (rnd() < 0.2) laundry(F, xl, xr, rT, zr, rnd);
  if (rnd() < 0.12) awning(G, X0 - 0.2, X1 + 0.2, Y1 + 0.22, 0.02, 0.5, 0.75, bs.awning);
}

function buildDoor(G, F, o, bs, rnd) {
  const X0 = o.x0, X1 = o.x1, Y1 = o.y1, D = o.D;
  const W = X1 - X0;
  const stepH = 0.13;
  G.box(X0 - 0.15, 0, -D, X1 + 0.15, stepH, 0.3, bs.style === 'piedra' || bs.surround ? bs.stone : C.step, bs.surround ? PAT.GRANITE : 0);
  if (bs.surround) {
    const b = LOOK.plastilina ? 0.22 : 0.16, z = LOOK.plastilina ? 0.05 : 0.026;
    G.box(X0 - b, stepH, 0, X0, Y1, z, bs.stone, PAT.GRANITE, 31);
    G.box(X1, stepH, 0, X1 + b, Y1, z, bs.stone, PAT.GRANITE, 31);
    G.box(X0 - b, Y1, 0, X1 + b, Y1 + b, z + 0.01, bs.stone, PAT.GRANITE, 31);
  } else if (bs.recercado) {
    const b = 0.13, z = 0.003;
    G.box(X0 - b, stepH, 0, X0, Y1 + b, z, bs.recercado, 0, 16);
    G.box(X1, stepH, 0, X1 + b, Y1 + b, z, bs.recercado, 0, 16);
    G.box(X0, Y1, 0, X1, Y1 + b, z, bs.recercado, 0, 16);
  }
  const zb = -D + 0.004, zf = -D + 0.07;
  const marco = bs.doorKind === 'wood' ? mul(bs.doorCol, 0.8) : bs.doorKind === 'modern' ? C.anth : C.alu;
  G.box(X0, stepH, zb, X0 + 0.06, Y1, zf, marco);
  G.box(X1 - 0.06, stepH, zb, X1, Y1, zf, marco);
  G.box(X0 + 0.06, Y1 - 0.06, zb, X1 - 0.06, Y1, zf, marco);
  const lx0 = X0 + 0.06, lx1 = X1 - 0.06, ly0 = stepH, ly1 = Y1 - 0.06;
  const zl = -D + 0.02, zlf = -D + 0.058;
  const r = rnd();
  if ((bs.trad || bs.style === 'color') && r < 0.24) {
    // door open behind a strip curtain (cortina de tiras): the summer look of every village street
    const zc = -D + 0.11;
    G.quad([lx0 + 0.01, ly0 + 0.02, zc], [lx1 - 0.01, ly0 + 0.02, zc], [lx1 - 0.01, ly1 - 0.03, zc], [lx0 + 0.01, ly1 - 0.03, zc], 0, 0, 1, bs.curtain, PAT.STRIPS);
    G.box(lx0 - 0.01, ly1 - 0.05, zc - 0.012, lx1 + 0.01, ly1 - 0.025, zc + 0.012, C.metalDk, 0, ALL);
  } else if (bs.trad && r < 0.31) {
    // "persiana alicantina" (wooden slat blind) half rolled up
    const zc = -D + 0.11, lvl = 0.45 + rnd() * 0.35;
    const yb = ly1 - (ly1 - ly0) * lvl;
    G.quad([lx0, yb, zc], [lx1, yb, zc], [lx1, ly1 - 0.12, zc], [lx0, ly1 - 0.12, zc], 0, 0, 1, bs.wood, PAT.SLATS);
    G.box(lx0 - 0.02, ly1 - 0.16, zc - 0.07, lx1 + 0.02, ly1 - 0.04, zc + 0.05, mul(bs.wood, 0.85), PAT.SLATS, ALL);
  } else if (bs.doorKind === 'wood') {
    const dc = bs.doorCol;
    G.box(lx0, ly0, zl, lx1, ly1, zlf, dc, PAT.WOOD, 16);
    const mx = (lx0 + lx1) / 2;
    G.box(mx - 0.008, ly0, zlf, mx + 0.008, ly1, zlf + 0.004, mul(dc, 0.45), 0, 16);
    const two = W > 0.95;
    const leaves = two ? [[lx0, mx], [mx, lx1]] : [[lx0, lx1]];
    for (const [a, b] of leaves) {
      const pw = b - a;
      for (const [c, d] of [[ly0 + 0.18, ly0 + 0.95], [ly0 + 1.08, ly1 - 0.42]]) {
        G.box(a + pw * 0.14, c, zlf, b - pw * 0.14, d, zlf + 0.016, mul(dc, 1.08), PAT.WOOD);
      }
      // small glazed "postigo" with a bar
      const gy0 = ly1 - 0.36, gy1 = ly1 - 0.08;
      G.box(a + pw * 0.2, gy0, zlf, b - pw * 0.2, gy1, zlf + 0.004, C.glassDk, 0, 16);
      G.bar([(a + b) / 2, gy0, zlf + 0.012], [(a + b) / 2, gy1, zlf + 0.012], 0.012, C.iron);
    }
    // brass knocker / knob
    F.box(mx - 0.09, 1.12, zlf, mx - 0.05, 1.2, zlf + 0.03, C.brass, 0, ALL);
    F.box(mx + 0.05, 1.12, zlf, mx + 0.09, 1.2, zlf + 0.03, C.brass, 0, ALL);
  } else if (bs.doorKind === 'modern') {
    G.box(lx0, ly0, zl, lx1, ly1, zlf, C.anth, 0, 16);
    G.box(lx0 + 0.08, ly0 + 0.1, zlf, lx0 + 0.3, ly1 - 0.1, zlf + 0.003, C.glassDk, 0, 16);
    G.box(lx1 - 0.14, 0.9, zlf, lx1 - 0.11, 1.6, zlf + 0.05, hexC('#c9ccce'), 0, ALL);
  } else {
    // aluminium door with glazed upper half and bars
    G.box(lx0, ly0, zl, lx1, ly1, zlf, bs.doorCol, 0, 16);
    G.box(lx0 + 0.1, ly0 + 0.85, zlf, lx1 - 0.1, ly1 - 0.1, zlf + 0.003, C.glassDk, 0, 16);
    for (let x = lx0 + 0.2; x < lx1 - 0.12; x += 0.12) G.bar([x, ly0 + 0.85, zlf + 0.012], [x, ly1 - 0.1, zlf + 0.012], 0.014, C.iron);
    G.box(lx0 + 0.05, 1.05, zlf, lx0 + 0.09, 1.2, zlf + 0.03, C.alu, 0, ALL);
  }
  // house number tile (azulejo) and, on some houses, the electricity meter box
  if (o.bw - X1 > 0.42) {
    const x = X1 + (bs.surround ? 0.26 : 0.18);
    F.box(x, Y1 - 0.34, 0, x + 0.18, Y1 - 0.19, 0.012, C.plate, 0, 31);
    F.box(x + 0.02, Y1 - 0.32, 0.012, x + 0.16, Y1 - 0.21, 0.015, C.tileBlue, 0, 16);
    if (rnd() < 0.22) G.box(x, 0.75, 0, x + 0.36, 1.2, 0.1, C.meter);
  }
}

function buildGarage(G, F, o, bs, rnd) {
  const X0 = o.x0, X1 = o.x1, Y1 = o.y1, D = o.D;
  const gc = rnd() < 0.3 ? pickR(rnd, [hexC('#f0efeb'), hexC('#6b3f22'), hexC('#3f5f36'), hexC('#8e9295'), hexC('#2f4f6a')]) : bs.garage;
  G.box(X0, 0.01, -D + 0.012, X1, Y1, -D + 0.045, gc, PAT.RIBS, 16);
  G.box(X0 - 0.05, Y1, 0, X1 + 0.05, Y1 + 0.1, 0.02, mul(bs.wall, 0.93), 0, 31);
  G.box((X0 + X1) / 2 - 0.035, 1.0, -D + 0.045, (X0 + X1) / 2 + 0.035, 1.12, -D + 0.07, C.metalDk, 0, ALL);
  // "vado permanente" plate
  const x = o.bw - X1 > 0.4 ? X1 + 0.08 : X0 > 0.4 ? X0 - 0.34 : -1;
  if (x >= 0) {
    G.box(x, 1.7, 0, x + 0.26, 2.02, 0.01, C.plate, 0, 31);
    G.box(x + 0.02, 1.72, 0.01, x + 0.24, 2.0, 0.013, C.vadoRed, 0, 16);
    G.box(x + 0.05, 1.75, 0.013, x + 0.21, 1.97, 0.016, C.vadoBlue, 0, 16);
    G.box(x + 0.05, 1.845, 0.016, x + 0.21, 1.875, 0.018, C.vadoRed, 0, 16);
  }
}

function buildShop(G, F, o, bs, rnd) {
  const X0 = o.x0, X1 = o.x1, Y0 = o.y0, Y1 = o.y1, D = o.D;
  const fc = bs.big || rnd() < 0.5 ? C.anth : C.alu;
  const zb = -D + 0.004, zf = -D + 0.07;
  frameRect(G, X0, Y0, X1, Y1, zb, zf, 0.06, fc, false, 0.08);
  // door mullion + transom
  const md = X0 + (X1 - X0) * (0.55 + rnd() * 0.15);
  G.box(md - 0.03, Y0, zb, md + 0.03, Y1, zf, fc);
  if (Y1 > 2.3) G.box(X0, Y1 - 0.42, zb, X1, Y1 - 0.36, zf, fc);
  // metal shutter box above the opening
  G.box(X0 - 0.03, Y1, 0, X1 + 0.03, Y1 + 0.3, 0.17, C.metal, PAT.SHUTTER, 31);
  // fascia (sign band)
  if (o.f === 0 && o.H > 2.95) G.box(0.06, Y1 + 0.32, 0, o.bw - 0.06, Math.min(3.06, o.H - 0.02), 0.06, bs.fascia, 0, 31);
  if (rnd() < 0.55) awning(G, X0, X1, Y1 - 0.01, 0.17, 0.4, 0.95, bs.awning);
}

// per-run extras: downpipes at the corners, cornice moulding under the eaves
function buildRun(G, r, bs, rnd) {
  const dx = r.bx - r.ax, dz = r.bz - r.az, L = Math.hypot(dx, dz);
  if (L < 1.5 || r.measured) return; // (a measured front has its own downpipes and cornices)
  const tx = dx / L, tz = dz / L;
  G.frame(r.ax, 0, r.az, tx, tz, r.nx, r.nz);
  const H = r.H;
  if (r.pitched && rnd() < 0.5) {
    const ends = rnd() < 0.5 ? [0.13] : rnd() < 0.5 ? [L - 0.13] : [0.13, L - 0.13];
    for (const x of ends) {
      const y0 = r.shopEnds ? 2.95 : 0.05;
      G.cyl(x, 0.075, y0 + 0.18, H - 0.2, 0.043, 0.043, 7, bs.pipe);
      G.bar([x, H - 0.2, 0.075], [x, H - 0.06, 0.24], 0.07, bs.pipe);
      if (!r.shopEnds) G.bar([x, 0.24, 0.075], [x, 0.05, 0.2], 0.08, bs.pipe);
      for (let y = y0 + 0.8; y < H - 0.5; y += 1.6) G.box(x - 0.055, y, 0, x + 0.055, y + 0.035, 0.12, mul(bs.pipe, 0.8), 0, 31);
    }
  }
  if (bs.cornice && r.pitched) {
    G.box(-0.06, H - 0.17, 0, L + 0.06, H - 0.08, 0.05, mul(bs.wall, 0.97));
    G.box(-0.1, H - 0.08, 0, L + 0.1, H - 0.005, 0.1, bs.wall);
  }
}

function buildOpening(G, F, o) {
  const bs = buildingStyle(o);
  const rnd = mulberry32(((o.pid + 3) * 73856093 ^ (o.b * 19349663) ^ (o.f * 83492791)) >>> 0);
  G.frame(o.ox, o.oy, o.oz, o.tx, o.tz, o.nx, o.nz);
  F.frame(o.ox, o.oy, o.oz, o.tx, o.tz, o.nx, o.nz);
  if (CUR_P) CUR_P.frame(o.ox, o.oy, o.oz, o.tx, o.tz, o.nx, o.nz);
  switch (o.type) {
    case CT.WIN_G: buildWindow(G, F, o, bs, rnd, false); break;
    case CT.WIN_U: buildWindow(G, F, o, bs, rnd, true); break;
    case CT.BALC: buildBalcony(G, F, o, bs, rnd); break;
    case CT.DOOR: buildDoor(G, F, o, bs, rnd); break;
    case CT.GARAGE: buildGarage(G, F, o, bs, rnd); break;
    case CT.SHOP: buildShop(G, F, o, bs, rnd); break;
    default: break;
  }
}

// a pot standing on the ground (world space): 'macetaGeranio', 'macetaGitanilla', 'macetaAspidistra', 'maceton'
export function groundPot(G, P, kind, x, y, z, s, rnd) {
  if (kind === 'maceton') { // the town's square concrete planter with a clipped shrub
    const h = 0.5 * s, w = 0.45 * s;
    G.box(x - w, y, z - w, x + w, y + h, z + w, hexC('#b9b3a6'), 0, 1 | 2 | 4 | 16 | 32);
    G.box(x - w * 0.9, y + h - 0.02, z - w * 0.9, x + w * 0.9, y + h - 0.01, z + w * 0.9, C.soil, 0, 4);
    if (P) { potPlant(P, 'mata', x, y + h - 0.02, z, 0.32 * s, rnd); potPlant(P, 'geranio', x + w * 0.5, y + h - 0.02, z - w * 0.4, 0.16 * s, rnd); }
    return;
  }
  const r = (kind === 'macetaGitanilla' ? 0.13 : kind === 'macetaAspidistra' ? 0.17 : 0.16) * s, h = r * 1.6;
  const pr = rnd(), pc = pr < 0.75 ? C.pot : pr < 0.88 ? C.potWhite : C.potBlue;
  potBody(G, x, y, z, r, h, pc);
  if (P) potPlant(P, kind === 'macetaGitanilla' ? 'gitanilla' : kind === 'macetaAspidistra' ? (rnd() < 0.5 ? 'aspidistra' : 'cinta') : (rnd() < 0.25 ? 'geranioAlto' : 'geranio'), x, y + h - r * 0.1, z, r, rnd);
}

// ------------------------------------------------------------------ streaming manager
const CHUNK = 56;
const MAX_BUILT = 150; // (chunks kept built at most)
export class FacadeDetails {
  constructor(openings, runs, root, material, { near = 110, fine = 55, shadowDist = 60 } = {}) {
    this.root = root; this.mat = material; this.near = near; this.fine = fine; this.shadowDist = shadowDist;
    const chunks = new Map();
    const get = (x, z) => {
      const k = Math.floor(x / CHUNK) + ':' + Math.floor(z / CHUNK);
      let c = chunks.get(k);
      if (!c) chunks.set(k, (c = { ops: [], runs: [], x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, mesh: null, fineMesh: null, d: 1e9 }));
      return c;
    };
    const grow = (c, x, z, m) => { c.x0 = Math.min(c.x0, x - m); c.z0 = Math.min(c.z0, z - m); c.x1 = Math.max(c.x1, x + m); c.z1 = Math.max(c.z1, z + m); };
    for (const o of openings) {
      const cx = o.ox + o.tx * (o.x0 + o.x1) * 0.5, cz = o.oz + o.tz * (o.x0 + o.x1) * 0.5;
      const c = get(cx, cz);
      c.ops.push(o);
      grow(c, cx, cz, o.bw * 0.5 + 1.2);
    }
    for (const r of runs) {
      const c = get((r.ax + r.bx) / 2, (r.az + r.bz) / 2);
      c.runs.push(r);
      grow(c, r.ax, r.az, 0.5); grow(c, r.bx, r.bz, 0.5);
    }
    this.chunks = chunks; this.get = get; this.grow = grow;
    this.list = [...chunks.values()];
    this.count = openings.length;
    this.nProps = 0;
  }
  // something built into the chunk at (x, z) when it is streamed in: fn(G, F, P) in world space (G solid, F fine, P plants)
  addBuild(x, z, r, fn) {
    const n0 = this.chunks.size;
    const c = this.get(x, z);
    (c.fns || (c.fns = [])).push(fn);
    this.grow(c, x, z, r);
    if (this.chunks.size !== n0) this.list.push(c);
  }
  // a wild plant of the ground (trees.js GROUND_KINDS), grown on the leaf cards when its chunk is streamed in
  addPlant(kind, x, y, z, s, seed) {
    const n0 = this.chunks.size;
    const c = this.get(x, z);
    (c.plants || (c.plants = [])).push(GROUND_KINDS.indexOf(kind), x, y, z, s, seed);
    this.grow(c, x, z, s);
    if (this.chunks.size !== n0) this.list.push(c);
    this.nPlants = (this.nPlants || 0) + 1;
  }
  // static street props merged into the same streamed chunks (one draw call per chunk for everything near the camera)
  addProp(geo, x, y, z, ry = 0, s = 1, sy = s, tint = null, fine = false) {
    const n0 = this.chunks.size;
    const c = this.get(x, z);
    if (!c.props) c.props = [];
    c.props.push(geo, x, y, z, ry, s, sy, tint, fine);
    this.grow(c, x, z, (geo.boundingSphere ? geo.boundingSphere.radius : 1) * s);
    if (this.chunks.size !== n0) this.list.push(c);
    this.nProps++;
  }
  // Streamed a little every frame. A chunk used to be built all at once when the camera came within 30 m of where it
  // shows — 15 to 80 ms, a stutter each time a street came into view —, and every chunk within 60 m in the same frame;
  // and it was thrown away 90 m past that, to be built again on the way back. Now the chunks are started 60 m ahead,
  // nearest first, and built a few openings at a time (a generator: steps()) within a few milliseconds a frame — more
  // only for one already in view (a teleport, a respawn) —; a chunk half built is taken up again where it was left.
  // Built ones are kept until they are 220 m past (and only the farthest go when there are very many): coming back
  // down a street finds it ready.
  update(cx, cz, budgetMs = 2.5) {
    const t0 = performance.now();
    const near = this.near, ahead = near + 60, keep = near + 220;
    let best = null, built = 0;
    for (const ch of this.list) {
      const dx = Math.max(ch.x0 - cx, 0, cx - ch.x1), dz = Math.max(ch.z0 - cz, 0, cz - ch.z1);
      const d = Math.hypot(dx, dz);
      ch.d = d;
      if (ch.built) {
        built++;
        if (ch.mesh) { ch.mesh.visible = d < near + 6; ch.mesh.castShadow = d < this.shadowDist; }
        if (ch.fineMesh) { ch.fineMesh.visible = d < this.fine; ch.fineMesh.castShadow = d < this.shadowDist * 0.6; }
        if (ch.plantMesh) { ch.plantMesh.visible = d < this.fine * 1.25; ch.plantMesh.castShadow = d < this.shadowDist * 0.5; }
        if (d > keep) { this.drop(ch); built--; }
      } else if (d < ahead && (!best || d < best.d)) best = ch;
    }
    if (built > MAX_BUILT) { // (a long drive round town: the farthest let go)
      const far = this.list.filter((ch) => ch.built && ch.d > ahead).sort((a, b) => b.d - a.d);
      for (let k = 0; k < far.length && built > MAX_BUILT; k++, built--) this.drop(far[k]);
    }
    if (!best) return;
    const budget = best.d < near * 0.3 ? 10 : best.d < near ? 5 : budgetMs;
    while (best) {
      const gen = best.gen || (best.gen = this.steps(best));
      while (!gen.next().done) if (performance.now() - t0 > budget) return;
      best.gen = null;
      if (performance.now() - t0 > budget) return;
      best = null; // (the next nearest, if there is time left)
      for (const ch of this.list) if (!ch.built && ch.d < ahead && (!best || ch.d < best.d)) best = ch;
    }
  }
  build(ch) { const gen = ch.gen || this.steps(ch); while (!gen.next().done); ch.gen = null; }
  // the chunk's building, step by step (each a few openings, runs or props): yields between them, done when its
  // meshes are in the scene. (CUR_P, the plants' geometry of the opening being built, is this chunk's while it runs)
  *steps(ch) {
    const G = new Geo(), F = new Geo(), P = this.plantMat ? new CardGeo() : null;
    const STEP = 8;
    CUR_P = P;
    for (let k = 0; k < ch.ops.length; k++) {
      buildOpening(G, F, ch.ops[k]);
      if (k % STEP === STEP - 1) { CUR_P = null; yield; CUR_P = P; }
    }
    if (ch.fns) { G.frame(0, 0, 0, 1, 0, 0, 1); F.frame(0, 0, 0, 1, 0, 0, 1); if (P) P.world(); for (const fn of ch.fns) { fn(G, F, P); CUR_P = null; yield; CUR_P = P; } }
    if (ch.plants && P) {
      P.world();
      const pl = ch.plants;
      for (let k = 0; k < pl.length; k += 6) {
        groundPlant(P, GROUND_KINDS[pl[k]], pl[k + 1], pl[k + 2], pl[k + 3], pl[k + 4], mulberry32(pl[k + 5]));
        if ((k / 6) % STEP === STEP - 1) { CUR_P = null; yield; CUR_P = P; }
      }
    }
    CUR_P = null;
    for (let k = 0; k < ch.runs.length; k++) {
      const r = ch.runs[k];
      buildRun(G, r, buildingStyle(r), mulberry32(((r.pid + 11) * 2246822519 + Math.round(r.ax * 10)) >>> 0));
      if (k % STEP === STEP - 1) yield;
    }
    if (ch.props) {
      const pr = ch.props;
      for (let k = 0; k < pr.length; k += 9) {
        (pr[k + 8] ? F : G).prop(pr[k], pr[k + 1], pr[k + 2], pr[k + 3], pr[k + 4], pr[k + 5], pr[k + 6], pr[k + 7]);
        if ((k / 9) % (STEP * 2) === STEP * 2 - 1) yield;
      }
    }
    yield;
    const mesh = G.build(this.mat); yield; // (the geometries made one by one too: a big chunk's take a few ms each)
    const fine = F.build(this.mat); yield;
    ch.built = true;
    ch.mesh = mesh;
    ch.fineMesh = fine;
    ch.plantMesh = P ? P.build(this.plantMat, this.plantDepth) : null;
    if (ch.mesh) { ch.mesh.visible = ch.d < this.near + 6; ch.mesh.castShadow = ch.d < this.shadowDist; this.root.add(ch.mesh); }
    if (ch.fineMesh) { ch.fineMesh.visible = ch.d < this.fine; this.root.add(ch.fineMesh); }
    if (ch.plantMesh) { ch.plantMesh.visible = ch.d < this.fine * 1.25; this.root.add(ch.plantMesh); }
  }
  drop(ch) {
    for (const k of ['mesh', 'fineMesh', 'plantMesh']) {
      const m = ch[k];
      if (!m) continue;
      this.root.remove(m);
      m.geometry.dispose();
      ch[k] = null;
    }
    ch.built = false;
    ch.gen = null;
  }
  stats() {
    let meshes = 0, tris = 0, fine = 0;
    for (const ch of this.list) {
      if (ch.mesh) { meshes++; tris += ch.mesh.geometry.index.count / 3; }
      if (ch.fineMesh) { meshes++; fine += ch.fineMesh.geometry.index.count / 3; }
    }
    return { chunks: this.list.length, meshes, tris, fine, openings: this.count };
  }
}
