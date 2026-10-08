// What makes the ground believable, consistently by zone:
//  · a "zone map" of the town (distance to the street, age of the neighbourhood, closeness to green / countryside)
//    that the ground shader and every placement below read, so the old centre is more worn than the new estates and
//    weeds grow where the town meets the fields;
//  · relief the flat ground can't fake: tree pits (alcorques) with lifted slabs around the roots, loose / lifted and
//    broken sidewalk tiles, the little water channels (canaletas) of the downpipes crossing the pavement;
//  · vegetation invading the pavement: grass tufts and moss along the wall bases and kerbs, wild yellow flowers
//    (jaramagos), dry grass and scrub in the yards and empty lots, weeds in the crumbling edges of back streets.
import * as THREE from 'three';
import { GroundBuilder } from './ground.js';
import { GROUND } from './textures.js';
import { mulberry32, polySample, clamp } from './util.js';

// ------------------------------------------------------------------ zone map
function ageOf(y) {
  if (!y || y <= 0) return 0.55;
  if (y < 1950) return 1.0;
  if (y < 1970) return 0.8;
  if (y < 1990) return 0.55;
  if (y < 2005) return 0.33;
  return 0.15;
}
// scanline fill of a flat ring into a grid (cells whose centre is inside)
function fillRing(ring, g, cb) {
  const n = ring.length / 2;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < n; i++) { zmin = Math.min(zmin, ring[i * 2 + 1]); zmax = Math.max(zmax, ring[i * 2 + 1]); }
  const j0 = Math.max(0, Math.floor((zmin - g.z0) / g.res)), j1 = Math.min(g.nz - 1, Math.ceil((zmax - g.z0) / g.res));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = g.z0 + (j + 0.5) * g.res;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const za = ring[i * 2 + 1], zb = ring[k * 2 + 1];
      if ((za <= z && zb > z) || (zb <= z && za > z)) xs.push(ring[i * 2] + ((z - za) / (zb - za)) * (ring[k * 2] - ring[i * 2]));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - g.x0) / g.res - 0.5)), i1 = Math.min(g.nx - 1, Math.floor((xs[q + 1] - g.x0) / g.res - 0.5));
      for (let i = i0; i <= i1; i++) cb(j * g.nx + i);
    }
  }
}
// two-pass chamfer distance transform (in cells) of a grid where seeds are 0
function chamfer(d, nx, nz) {
  const D = Math.SQRT2;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 1);
    if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + D); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + D); }
    d[k] = v;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + 1);
    if (j < nz - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + D); if (i > 0) v = Math.min(v, d[k + nx - 1] + D); }
    d[k] = v;
  }
}
function boxBlur(a, nx, nz, r) {
  const tmp = new Float32Array(a.length);
  for (let j = 0; j < nz; j++) {
    let acc = 0;
    const row = j * nx;
    for (let i = -r; i <= r; i++) acc += a[row + clamp(i, 0, nx - 1)];
    for (let i = 0; i < nx; i++) {
      tmp[row + i] = acc / (2 * r + 1);
      acc += a[row + Math.min(nx - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < nx; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += tmp[clamp(j, 0, nz - 1) * nx + i];
    for (let j = 0; j < nz; j++) {
      a[j * nx + i] = acc / (2 * r + 1);
      acc += tmp[Math.min(nz - 1, j + r + 1) * nx + i] - tmp[Math.max(0, j - r) * nx + i];
    }
  }
}

export function buildGroundField(map, facadeRuns = []) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const a of map.urban) for (let i = 0; i < a.ring.length; i += 2) { x0 = Math.min(x0, a.ring[i]); x1 = Math.max(x1, a.ring[i]); z0 = Math.min(z0, a.ring[i + 1]); z1 = Math.max(z1, a.ring[i + 1]); }
  if (!isFinite(x0)) { x0 = -500; z0 = -500; x1 = 500; z1 = 500; }
  x0 -= 90; z0 -= 90; x1 += 90; z1 += 90;
  const res = Math.max(1.2, Math.max(x1 - x0, z1 - z0) / 1536);
  const nx = Math.ceil((x1 - x0) / res), nz = Math.ceil((z1 - z0) / res);
  const g = { x0, z0, res, nx, nz };
  const N = nx * nz;
  // distance to the nearest street surface
  const road = new Float32Array(N).fill(1e6);
  for (const e of map.edges) {
    if (!(e.walk || e.drive) || e.blocked) continue;
    const hw = e.w / 2 + 0.1;
    const p = e.pts;
    for (let s = 0; s + 3 < p.length; s += 2) {
      const ax = p[s], az = p[s + 1], bx = p[s + 2], bz = p[s + 3];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + hw - x0) / res));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - hw - z0) / res)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + hw - z0) / res));
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= hw) road[j * nx + i] = 0;
      }
    }
  }
  chamfer(road, nx, nz);
  for (let k = 0; k < N; k++) road[k] *= res;
  // age of the neighbourhood from the Catastro construction years
  const sum = new Float32Array(N), wgt = new Float32Array(N);
  for (const b of map.buildings) {
    const i = Math.floor((b.c[0] - x0) / res), j = Math.floor((b.c[1] - z0) / res);
    if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
    const w = Math.sqrt(Math.max(10, b.area || 50));
    sum[j * nx + i] += ageOf(b.year) * w; wgt[j * nx + i] += w;
  }
  const R = Math.max(2, Math.round(24 / res));
  boxBlur(sum, nx, nz, R); boxBlur(wgt, nx, nz, R); boxBlur(sum, nx, nz, R); boxBlur(wgt, nx, nz, R);
  const age = new Float32Array(N);
  for (let k = 0; k < N; k++) age[k] = wgt[k] > 1e-4 ? clamp(sum[k] / wgt[k], 0, 1) : 0.45;
  // closeness to greenery: parks, gardens, orchards and the countryside outside the urban area
  const green = new Float32Array(N).fill(0);
  for (const a of map.urban) fillRing(a.ring, g, (k) => { green[k] = 1; });
  for (let k = 0; k < N; k++) green[k] = green[k] ? 1e6 : 0;
  for (const a of map.areas) {
    if (!['leisure:park', 'landuse:grass', 'landuse:village_green', 'landuse:forest', 'landuse:orchard', 'natural:heath'].includes(a.kind)) continue;
    fillRing(a.ring, g, (k) => { green[k] = 0; });
  }
  chamfer(green, nx, nz);
  for (let k = 0; k < N; k++) green[k] = 1 - clamp((green[k] * res) / 80, 0, 1);
  // distance to the street facades (what stands in front of a house is always paved, even far from the carriageway)
  const fac = new Float32Array(N).fill(1e6);
  for (const r of facadeRuns) {
    const L = Math.hypot(r.bx - r.ax, r.bz - r.az);
    for (let s = 0; s <= L; s += res * 0.5) {
      const x = r.ax + ((r.bx - r.ax) * s) / (L || 1) + r.nx * 0.3, z = r.az + ((r.bz - r.az) * s) / (L || 1) + r.nz * 0.3;
      const i = Math.floor((x - x0) / res), j = Math.floor((z - z0) / res);
      if (i >= 0 && j >= 0 && i < nx && j < nz) fac[j * nx + i] = 0;
    }
  }
  chamfer(fac, nx, nz);
  // pack
  const data = new Uint8Array(N * 4);
  for (let k = 0; k < N; k++) {
    data[k * 4] = Math.min(255, Math.round(road[k] * 12.75));
    data[k * 4 + 1] = Math.round(age[k] * 255);
    data[k * 4 + 2] = Math.round(green[k] * 255);
    data[k * 4 + 3] = Math.min(255, Math.round(fac[k] * res * 12.75));
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;
  const at = (arr, x, z) => {
    const i = clamp(Math.floor((x - x0) / res), 0, nx - 1), j = clamp(Math.floor((z - z0) / res), 0, nz - 1);
    return arr[j * nx + i];
  };
  return {
    tex, x0, z0, w: nx * res, h: nz * res, res, nx, nz,
    road: (x, z) => at(road, x, z), age: (x, z) => at(age, x, z), green: (x, z) => at(green, x, z), facade: (x, z) => at(fac, x, z) * res,
  };
}

// ------------------------------------------------------------------ relief on the ground
// world-aligned 30 cm sidewalk tile (same grid as the acera texture), lifted along one edge
function liftedTile(B, i, j, lift, dir, sunk = false) {
  const t = 0.3, x0 = i * t, z0 = j * t, x1 = x0 + t, z1 = z0 + t;
  const s = 2.4;
  const base = 0.006;
  // corner heights (dir picks the raised side); a sunken tile tilts down instead
  const up = sunk ? -0.004 : lift;
  const hs = [[base, base, base + up, base + up], [base + up, base, base, base + up], [base + up, base + up, base, base], [base, base + up, base + up, base]][dir];
  const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const tile = [1.02, 1.0, 0.98];
  const i0 = B.n;
  for (let k = 0; k < 4; k++) B.vert(P[k][0], hs[k], P[k][1], P[k][0] / s, P[k][1] / s, GROUND.acera, tile);
  B.tri(i0, i0 + 1, i0 + 2); B.tri(i0, i0 + 2, i0 + 3);
  if (sunk) return;
  // the exposed edge and the two side wedges (dark: the gap and the earth under the tile)
  const dark = [0.32, 0.28, 0.23];
  for (let k = 0; k < 4; k++) {
    const a = k, b = (k + 1) % 4;
    if (hs[a] <= base + 1e-4 && hs[b] <= base + 1e-4) continue;
    const j0 = B.n;
    B.vert(P[a][0], 0.004, P[a][1], P[a][0] / 3, P[a][1] / 3, GROUND.tierra, dark);
    B.vert(P[b][0], 0.004, P[b][1], P[b][0] / 3, P[b][1] / 3, GROUND.tierra, dark);
    B.vert(P[b][0], hs[b], P[b][1], P[b][0] / 3, P[b][1] / 3 + 0.01, GROUND.tierra, dark);
    B.vert(P[a][0], hs[a], P[a][1], P[a][0] / 3, P[a][1] / 3 + 0.01, GROUND.tierra, dark);
    B.idx.push(j0, j0 + 1, j0 + 2, j0, j0 + 2, j0 + 3, j0, j0 + 2, j0 + 1, j0, j0 + 3, j0 + 2);
  }
}
// a broken / missing tile: earth and cement showing through
function brokenTile(B, i, j) {
  const t = 0.3, x0 = i * t, z0 = j * t;
  const r = mulberry32((i * 73856093) ^ (j * 19349663));
  const i0 = B.n;
  const col = r() < 0.5 ? [0.62, 0.55, 0.45] : [0.5, 0.47, 0.42];
  const P = [[x0 + 0.01, z0 + 0.01], [x0 + t - 0.01, z0 + 0.01], [x0 + t - 0.01, z0 + t - 0.01], [x0 + 0.01, z0 + t - 0.01]];
  for (const [x, z] of P) B.vert(x, 0.007, z, x / 3, z / 3, GROUND.tierra, col);
  B.tri(i0, i0 + 1, i0 + 2); B.tri(i0, i0 + 2, i0 + 3);
}
// square tree pit: earth inside, a thin kerb-stone frame
function treePit(B, x, z, ux, uz, half) {
  const vx = -uz, vz = ux;
  const Q = (a, b, e = 0) => [x + ux * a + vx * b, z + uz * a + vz * b];
  const earth = [0.72, 0.62, 0.5];
  const i0 = B.n;
  for (const [a, b] of [[-half, -half], [half, -half], [half, half], [-half, half]]) { const [px, pz] = Q(a, b); B.vert(px, 0.009, pz, px / 3, pz / 3, GROUND.tierra, earth); }
  B.tri(i0, i0 + 1, i0 + 2); B.tri(i0, i0 + 2, i0 + 3);
  const w = 0.07, stone = [1.12, 1.1, 1.05];
  for (const [a0, b0, a1, b1] of [[-half - w, -half - w, half + w, -half], [-half - w, half, half + w, half + w], [-half - w, -half, -half, half], [half, -half, half + w, half]]) {
    const j0 = B.n;
    for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) { const [px, pz] = Q(a, b); B.vert(px, 0.013, pz, px / 6, pz / 6, GROUND.hormigon, stone); }
    B.tri(j0, j0 + 1, j0 + 2); B.tri(j0, j0 + 2, j0 + 3);
  }
}
// concrete channel from a downpipe to the kerb (canaleta)
function channel(B, x, z, ux, uz, len) {
  const vx = -uz, vz = ux, w = 0.075;
  const col = [0.82, 0.8, 0.76];
  const i0 = B.n;
  for (const [a, b] of [[0, -w], [len, -w], [len, w], [0, w]]) { const px = x + ux * a + vx * b, pz = z + uz * a + vz * b; B.vert(px, 0.008, pz, px / 6, pz / 6, GROUND.hormigon, col); }
  B.tri(i0, i0 + 1, i0 + 2); B.tri(i0, i0 + 2, i0 + 3);
  // the wet dark groove down the middle
  const j0 = B.n, g = 0.025, wet = [0.45, 0.43, 0.4];
  for (const [a, b] of [[0, -g], [len, -g], [len, g], [0, g]]) { const px = x + ux * a + vx * b, pz = z + uz * a + vz * b; B.vert(px, 0.0095, pz, px / 6, pz / 6, GROUND.hormigon, wet); }
  B.tri(j0, j0 + 1, j0 + 2); B.tri(j0, j0 + 2, j0 + 3);
}

// sidewalk band next to an edge: from the kerb to the facades
function sidewalkBand(e) {
  const hw = e.w / 2;
  const sw = e.sw > 0.3 ? e.sw : e.facade > e.w + 1 ? Math.min(2.5, (e.facade - e.w) / 2) : 0;
  return { a: hw + 0.32, b: hw + Math.max(0.5, sw) - 0.05 };
}

export function buildGroundRelief(world, map, field) {
  const B = new GroundBuilder();
  const weedSpots = [];
  const tilesUsed = new Set();
  const key = (i, j) => i * 65536 + j;
  const onPavement = (x, z) => !map.buildingAt(x, z) && !map.buildingAt(x + 0.3, z + 0.3) && field.road(x, z) > 0.2;
  let lifted = 0, broken = 0, pits = 0, chans = 0;
  // tree pits along the avenues, with the roots lifting the slabs around them
  for (const t of world.streetTrees || []) {
    const r = mulberry32(Math.floor(t.x * 131 + t.z * 71) >>> 0);
    treePit(B, t.x, t.z, t.dx, t.dz, 0.5);
    pits++;
    weedSpots.push({ x: t.x, z: t.z, r: 0.42, n: 1 + Math.floor(r() * 3), kind: 'pit' });
    const age = field.age(t.x, t.z);
    if (r() < 0.35 + age * 0.45) {
      const n = 1 + Math.floor(r() * 4);
      const ang = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const d = 0.75 + k * 0.3 + r() * 0.2;
        const x = t.x + Math.cos(ang) * d, z = t.z + Math.sin(ang) * d;
        const i = Math.floor(x / 0.3), j = Math.floor(z / 0.3);
        if (tilesUsed.has(key(i, j)) || !onPavement(i * 0.3 + 0.15, j * 0.3 + 0.15)) continue;
        tilesUsed.add(key(i, j));
        const dir = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? (Math.cos(ang) > 0 ? 1 : 3) : (Math.sin(ang) > 0 ? 0 : 2);
        liftedTile(B, i, j, 0.012 + r() * 0.03 * (1 - k * 0.2), (dir + 2) % 4);
        lifted++;
      }
    }
  }
  // downpipes pour onto the pavement through a small concrete channel down to the kerb (same choice as facades.js)
  for (const run of world.facadeRuns || []) {
    const dx = run.bx - run.ax, dz = run.bz - run.az, L = Math.hypot(dx, dz);
    if (L < 1.5 || !run.pitched) continue;
    const rnd = mulberry32(((run.pid + 11) * 2246822519 + Math.round(run.ax * 10)) >>> 0);
    if (!(rnd() < 0.5)) continue;
    const ends = rnd() < 0.5 ? [0.13] : rnd() < 0.5 ? [L - 0.13] : [0.13, L - 0.13];
    for (const a of ends) {
      if (run.shopEnds) continue;
      const px = run.ax + (dx / L) * a + run.nx * 0.18, pz = run.az + (dz / L) * a + run.nz * 0.18;
      const q = map.nearestEdge(px, pz, 12, (e) => e.drive && e.sw > 0.3);
      if (!q) continue;
      const tq = polySample(q.edge.pts, q.edge.cum, q.s, {}), sq = (px - tq.x) * -tq.dz + (pz - tq.z) * tq.dx >= 0 ? 1 : -1;
      const len = q.d - map.kerbAt(q.edge, q.s, sq) - 0.3; // (to the kerb as laid, kerbs.js)
      if (len < 0.4 || len > 3.5) continue;
      // keep clear of tree pits and of the lifted tiles
      let blocked = false;
      for (const t of world.streetTrees || []) {
        if (Math.abs(t.x - px) > len + 1.5 || Math.abs(t.z - pz) > len + 1.5) continue;
        const rx = t.x - px, rz = t.z - pz;
        const along = rx * run.nx + rz * run.nz, perp = Math.abs(rx * -run.nz + rz * run.nx);
        if (along > -0.8 && along < len + 0.8 && perp < 0.9) { blocked = true; break; }
      }
      if (blocked) continue;
      for (let a2 = 0; a2 <= len; a2 += 0.3) tilesUsed.add(key(Math.floor((px + run.nx * a2) / 0.3), Math.floor((pz + run.nz * a2) / 0.3)));
      channel(B, px, pz, run.nx, run.nz, len);
      chans++;
    }
  }
  // loose, lifted, sunken and broken tiles along the sidewalks — far more in the old centre
  const tmp = {};
  for (const e of map.edges) {
    if (!e.drive || e.dirt || e.blocked || !map.inTown(e.pts[0], e.pts[1])) continue;
    const band = sidewalkBand(e);
    if (band.b - band.a < 0.3) continue;
    const r = mulberry32((e.id * 2246822519 + 7) >>> 0);
    for (let s = 3; s < e.len - 3; s += 3.5 + r() * 4) {
      polySample(e.pts, e.cum, s, tmp);
      const age = field.age(tmp.x, tmp.z);
      if (r() > 0.05 + age * 0.22) continue;
      const side = r() < 0.5 ? 1 : -1;
      // (on the pavement as laid along the houses, kerbs.js: from its kerb to the wall)
      const kb = map.kerbAt(e, s, side), pv = map.pavementAt(e, s, side), u = r();
      if (pv != null && pv < 0.7) continue;
      const a = kb + 0.32, b = pv != null ? kb + pv - 0.05 : kb + band.b - band.a + 0.32;
      if (b - a < 0.3) continue;
      const off = a + u * (b - a);
      const x = tmp.x - tmp.dz * off * side, z = tmp.z + tmp.dx * off * side;
      const i = Math.floor(x / 0.3), j = Math.floor(z / 0.3);
      if (tilesUsed.has(key(i, j)) || !onPavement(i * 0.3 + 0.15, j * 0.3 + 0.15)) continue;
      tilesUsed.add(key(i, j));
      const k = r();
      if (k < 0.5) { liftedTile(B, i, j, 0.008 + r() * 0.022, Math.floor(r() * 4)); lifted++; }
      else if (k < 0.68) { liftedTile(B, i, j, 0, 0, true); lifted++; }
      else { brokenTile(B, i, j); broken++; weedSpots.push({ x: i * 0.3 + 0.15, z: j * 0.3 + 0.15, r: 0.1, n: r() < 0.6 ? 1 : 0, kind: 'tile' }); }
      // a neighbour tile often goes too
      if (r() < 0.35) {
        const di = r() < 0.5 ? 1 : 0, dj = 1 - di;
        const i2 = i + di, j2 = j + dj;
        if (!tilesUsed.has(key(i2, j2)) && onPavement(i2 * 0.3 + 0.15, j2 * 0.3 + 0.15)) { tilesUsed.add(key(i2, j2)); liftedTile(B, i2, j2, 0.006 + r() * 0.015, Math.floor(r() * 4)); lifted++; }
      }
    }
  }
  world.groundReliefStats = { lifted, broken, pits, chans };
  return { geom: B.geometry(), weedSpots };
}

// ------------------------------------------------------------------ vegetation invading the pavement
// the wild plants of a town of the Vegas Altas in late spring: grass, pellitory and mallow at the foot of the walls,
// rosettes in the joints of the kerb, daisies in the tree pits, and in the yards and empty lots golden wild oats,
// yellow wild mustard, poppies, thistles and broom. Grown on the trees' leaf cards (trees.js groundPlant) inside the
// streamed detail chunks, one draw call per chunk, only close to the camera.
export function placeGroundLife(world, map, field, weedSpots) {
  const fd = world.facades;
  const rnd = mulberry32(31337);
  const put = (k, x, z, s) => { fd.addPlant(k, x, 0, z, s, (rnd() * 4294967296) >>> 0); n++; };
  let n = 0;
  const zone = (x, z) => clamp(0.25 + field.age(x, z) * 0.55 + field.green(x, z) * 0.6, 0, 1.4);
  // squares, pedestrian streets and the market are swept every morning; parks, schools and pitches are looked after;
  // empty lots and the industrial estate are left to themselves
  const KEPT = { 'place:square': 0.2, 'highway:pedestrian': 0.2, 'amenity:marketplace': 0.25, 'leisure:park': 0.5, 'landuse:village_green': 0.5, 'amenity:school': 0.5, 'amenity:college': 0.5, 'amenity:clinic': 0.4, 'landuse:cemetery': 0.6 };
  const care = (x, z) => { const a = map.areaAt(x, z); return a ? KEPT[a.kind] ?? 1 : 1; };
  const LOT = (k) => k === undefined || k === 'landuse:residential' || k === 'landuse:grass' || k === 'landuse:industrial' || k === 'man_made:works' || k === 'landuse:military';
  // what grows where
  const pick = (where, x, z) => {
    const g = field.green(x, z), r = rnd();
    if (where === 'wall') {
      if (r < 0.1 + g * 0.08) return 'malva';
      if (r < 0.17 + g * 0.14) return 'jaramago';
      if (r < 0.29 + g * 0.14) return 'roseta';
      if (r < 0.35 + g * 0.16) return 'margarita';
      if (r < 0.47 + g * 0.1) return 'hierbaSeca';
      if (r < 0.57 + g * 0.1) return 'hierbaAlta';
      return 'hierba';
    }
    if (where === 'kerb') return r < 0.42 ? 'roseta' : r < 0.82 ? 'hierba' : 'hierbaSeca';
    if (where === 'pit') return r < 0.3 ? 'hierba' : r < 0.5 ? 'margarita' : r < 0.66 ? 'malva' : r < 0.8 ? 'roseta' : r < 0.9 ? 'hierbaAlta' : 'amapola';
    // yards, empty lots, the verges at the edge of town
    if (r < 0.3) return 'avena';
    if (r < 0.48) return 'hierbaSeca';
    if (r < 0.58 + g * 0.05) return 'jaramago';
    if (r < 0.65 + g * 0.03) return 'cardo';
    if (r < 0.71) return 'malva';
    if (r < 0.76 + g * 0.06) return 'amapola';
    if (r < 0.8 + g * 0.08) return 'margarita';
    return 'hierbaAlta';
  };
  const size = (k) => (k === 'matorral' ? 0.7 + rnd() * 0.7 : k === 'roseta' ? 0.7 + rnd() * 0.6 : 0.75 + rnd() * 0.55);
  // poppies, daisies and mustard never grow alone: a few more round the first
  const clump = (k, x, z, r, m) => { for (let c = 0; c < m; c++) { const a = rnd() * 6.28, d = r * Math.sqrt(rnd()), cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d; if (!map.buildingAt(cx, cz)) put(k, cx, cz, size(k)); } };
  // 1) along the wall bases (where the pavement meets the facades)
  const ao = world.aoLines || [];
  for (let k = 0; k < ao.length; k += 6) {
    const ax = ao[k], az = ao[k + 1], bx = ao[k + 2], bz = ao[k + 3], nx = ao[k + 4], nz = ao[k + 5];
    const L = Math.hypot(bx - ax, bz - az);
    if (!map.inTown(ax, az)) continue;
    const zf = zone((ax + bx) / 2, (az + bz) / 2) * care((ax + bx) / 2, (az + bz) / 2);
    const gr = field.green((ax + bx) / 2, (az + bz) / 2);
    const tx = (bx - ax) / L, tz = (bz - az) / L;
    for (let s = 0.2; s < L - 0.2; s += 0.45) {
      if (rnd() > 0.045 * zf) continue;
      const t = s / L, off = 0.05 + rnd() * 0.1;
      const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
      const kind = pick('wall', x, z);
      put(kind, x, z, size(kind) * 0.85);
      // a weed at the foot of a wall is rarely alone: its neighbours follow the joint
      if (rnd() < 0.45) { const d = (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.2); put('hierba', x + tx * d, z + tz * d, 0.6 + rnd() * 0.5); }
      if (kind === 'margarita' || kind === 'jaramago') clump(kind, x + nx * 0.1, z + nz * 0.1, 0.3, 1 + Math.floor(rnd() * 2));
      // near parks and the edge of town the verge takes over: scrub and tall weeds spilling onto the pavement
      if (gr > 0.45 && rnd() < gr * 0.35) {
        const cn = 2 + Math.floor(rnd() * 4);
        for (let c = 0; c < cn; c++) {
          const o2 = 0.1 + rnd() * 0.6, a2 = (rnd() - 0.5) * 1.2;
          const x3 = x + nx * o2 + tx * a2, z3 = z + nz * o2 + tz * a2;
          const r2 = rnd(), k2 = r2 < 0.2 ? 'matorral' : r2 < 0.45 ? 'avena' : r2 < 0.62 ? 'jaramago' : r2 < 0.74 ? 'malva' : r2 < 0.84 ? 'cardo' : 'hierbaAlta';
          put(k2, x3, z3, size(k2) * (k2 === 'matorral' ? 0.7 : 1));
        }
      }
    }
  }
  // 2) the joint between kerb and pavement, and the crumbling edges of back streets without kerbs
  const tmp = {};
  for (const e of map.edges) {
    if (!e.drive || e.dirt || e.blocked || !map.inTown(e.pts[0], e.pts[1])) continue;
    const kerb = e.sw > 0 && !e.walkOnly;
    const hw = e.w / 2;
    for (let s = 1; s < e.len - 1; s += 0.9) {
      polySample(e.pts, e.cum, s, tmp);
      const zf = zone(tmp.x, tmp.z);
      if (rnd() > (kerb ? 0.02 : 0.035) * zf) continue;
      const side = rnd() < 0.5 ? 1 : -1;
      const kh = map.kerbAt(e, s, side), kp = map.pavementAt(e, s, side); // (the kerb as laid, kerbs.js: none where no pavement)
      const kk = kerb && !(e.kerb && kp != null && kp < 0.15) && !(e.kerb && (e.kerb.regime === 2 || (e.kerb.regime === 1 && e.kerb.side !== side)));
      const off = kk ? kh + 0.3 + rnd() * 0.04 : kh - 0.04 - rnd() * 0.08;
      const x = tmp.x - tmp.dz * off * side, z = tmp.z + tmp.dx * off * side;
      if (map.buildingAt(x, z)) continue;
      put(kk ? pick('kerb', x, z) : pick(rnd() < 0.5 ? 'kerb' : 'wall', x, z), x, z, 0.6 + rnd() * 0.45);
    }
  }
  // 3) tree pits and broken tiles
  for (const w of weedSpots) {
    for (let i = 0; i < w.n; i++) {
      const a = rnd() * 6.28, r = rnd() * w.r;
      const x = w.x + Math.cos(a) * r, z = w.z + Math.sin(a) * r;
      if (w.kind === 'pit') put(pick('pit', x, z), x, z, 0.6 + rnd() * 0.45);
      else put(rnd() < 0.55 ? 'hierba' : 'roseta', x, z, 0.5 + rnd() * 0.4);
    }
  }
  // 4) yards, empty lots and the edge of town: patches of dry grass, wild flowers and scrub away from the streets
  const x0 = field.x0, z0 = field.z0;
  const tries = Math.round((field.w * field.h) / 90);
  for (let i = 0; i < tries; i++) {
    const x = x0 + rnd() * field.w, z = z0 + rnd() * field.h;
    const rd = field.road(x, z);
    if (rd < 6.5 || rd > 60 || field.facade(x, z) < 4) continue;
    if (!map.inTown(x, z) || map.buildingAt(x, z)) continue;
    const ar = map.areaAt(x, z);
    if (!LOT(ar && ar.kind)) continue;
    const g = field.green(x, z), zf = zone(x, z) * (ar && ar.kind === 'landuse:industrial' ? 1.5 : 1);
    if (rnd() > 0.35 * zf) continue;
    // a patch of one thing with a few others through it, rather than a lonely tuft
    const main = rnd() < 0.08 + g * 0.1 ? 'matorral' : pick('lot', x, z);
    const cn = 3 + Math.floor(rnd() * 6);
    for (let c = 0; c < cn; c++) {
      const cx = x + (rnd() - 0.5) * 2, cz = z + (rnd() - 0.5) * 2;
      if (map.buildingAt(cx, cz)) continue;
      const k = c === 0 || rnd() < 0.55 ? main : pick('lot', cx, cz);
      put(k, cx, cz, size(k));
    }
  }
  world.groundLifeStats = { weeds: n };
  return n;
}
