// A kit for the public interiors of Guareña (the town hall, the theatre, the market, the sports hall, the workshop, San
// Gregorio): on top of the HouseBuilder, the pieces they share — floors and ceilings, stairs (with the floor height
// they give), tables and chairs, benches, counters, posters and notice boards, flags, chandeliers, plants, closed
// doors, windows onto the street — and a second storey's collider. Coordinates: x across, z from the street front (0)
// inwards, y up; origin at the middle of the front wall.
import * as THREE from 'three';
import { HouseBuilder, INTERIOR_ORIGIN, boxGeo, planeGeo, std, texMat, glassMat } from './housekit.js';
import { StaticCollider } from './collision.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagCanvas, textCanvas } from './textures.js';
import { mulberry32 } from './util.js';

const TEXC = new Map();
export function canvasTexture(key, w, h, draw) {
  if (TEXC.has(key)) return TEXC.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  TEXC.set(key, t);
  return t;
}
export function textTexture(key, txt, o) { if (TEXC.has(key)) return TEXC.get(key); const t = new THREE.CanvasTexture(textCanvas(txt, o)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; TEXC.set(key, t); return t; }

export class Kit {
  constructor(origin = INTERIOR_ORIGIN, seed = 1) {
    this.B = new HouseBuilder(origin.x, origin.z, false);
    this.ox = origin.x; this.oz = origin.z;
    this.r = mulberry32(seed);
    this.segs1 = null;     // a second storey's walls (see upstairs())
    this.ramps = [];       // stairs: [x0, z0, x1, z1, y0, y1, axis 'z'|'x', dir]
    this.F2 = 0;
    const B = this.B;
    this.m = {
      wood: B.mat('k_wood', () => texMat('dark_wood', 0xffffff, 0.6)),
      pale: B.mat('k_pale', () => texMat('dark_wood', 0xf0d4b0, 0.6)),
      metal: B.mat('k_metal', () => std(0x9aa0a4, { roughness: 0.35, metalness: 0.7 })),
      iron: B.mat('k_iron', () => std(0x26282a, { roughness: 0.55, metalness: 0.5 })),
      brass: B.mat('k_brass', () => std(0xc8a050, { roughness: 0.3, metalness: 0.85, emissive: 0x2a1a06, emissiveIntensity: 0.2 })),
      white: B.mat('k_white', () => std(0xf2f2ee, { roughness: 0.5 })),
      dark: B.mat('k_dark', () => std(0x1a1a1c, { roughness: 0.5 })),
      red: B.mat('k_red', () => std(0x8a1a22, { roughness: 0.9 })),
      green: B.mat('k_green', () => std(0x2e6a3a, { roughness: 0.7 })),
      granite: B.mat('k_granite', () => texMat('granite_wall', 0xe8e2d6, 0.85)),
      plant: B.mat('k_plant', () => std(0x3f7a35, { roughness: 0.85 })),
      pot: B.mat('k_pot', () => std(0xa85a34, { roughness: 0.9 })),
      paper: B.mat('k_paper', () => std(0xf4f0e4, { roughness: 0.9 })),
      cork: B.mat('k_cork', () => std(0xb08a5a, { roughness: 1 })),
    };
  }
  add(key, g, x = 0, y = 0, z = 0, ry = 0) {
    if (!g) return;
    if (!g.index) g = mergeVertices(g);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    this.B.add(key, g, x, y, z, ry);
  }
  mat(key, make) { return this.B.mat(key, make); }
  box(key, w, h, d, x, y, z, ry = 0, tex = 1) { this.add(key, boxGeo(w, h, d, tex), x, y + h / 2, z, ry); }
  solid(key, w, h, d, x, y, z, ry = 0, tex = 1) { this.box(key, w, h, d, x, y, z, ry, tex); this.foot(w, d, x, z, ry, h, y); }
  // collider footprint, on the storey of y
  foot(w, d, x, z, ry = 0, h = 1, y = 0) {
    const segs = y > 1.5 && this.segs1 ? this.segs1 : this.B.segs;
    const c = Math.cos(ry), s = Math.sin(ry), P = (a, b) => [this.ox + x + a * c + b * s, this.oz + z - a * s + b * c];
    const q = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; segs.push([a[0], a[1], b[0], b[1], h]); }
  }
  floor(key, x0, z0, x1, z1, y = 0, tex = 1.2) { this.add(key, planeGeo(x1 - x0, z1 - z0, tex).rotateX(-Math.PI / 2), (x0 + x1) / 2, y + 0.005, (z0 + z1) / 2); }
  ceiling(key, x0, z0, x1, z1, y, tex = 2) { this.add(key, planeGeo(x1 - x0, z1 - z0, tex).rotateX(Math.PI / 2), (x0 + x1) / 2, y, (z0 + z1) / 2); }
  // a wall (holes: [from, to, bottom, top] along it); on the second storey when y0 ≥ the upper floor
  wall(key, ax, az, bx, bz, h, holes = [], y0 = 0) {
    const B = this.B;
    if (y0 > 1.5 && this.segs1) { const keep = B.segs; B.segs = this.segs1; B.wall(key, ax, az, bx, bz, h, holes, y0, true); B.segs = keep; }
    else B.wall(key, ax, az, bx, bz, h, holes, y0, true);
  }
  // a second storey at height F2: its walls collide only up there
  upstairs(F2) { this.F2 = F2; this.segs1 = []; }
  // a straight flight of stairs over a box, rising along +z (dir 1) or -z (dir -1), from y0 to y1
  stairs(key, x0, x1, z0, z1, y0, y1, dir = 1, rail = true) {
    const n = Math.max(3, Math.round((y1 - y0) / 0.175)), L = z1 - z0, tread = L / n, rise = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const zz = dir > 0 ? z0 + i * tread : z1 - (i + 1) * tread;
      this.add(key, boxGeo(x1 - x0, rise * (i + 1), tread, 1), (x0 + x1) / 2, y0 + (rise * (i + 1)) / 2, zz + tread / 2);
    }
    this.ramps.push([x0, z0, x1, z1, y0, y1, dir]);
    if (rail) for (const xx of [x0 + 0.05, x1 - 0.05]) {
      const len = Math.hypot(L, y1 - y0), ang = Math.atan2(y1 - y0, L) * dir;
      const g = boxGeo(0.05, 0.05, len, 1); g.rotateX(-ang); this.add(this.m.wood, g, xx, (y0 + y1) / 2 + 0.95, (z0 + z1) / 2);
      for (let k = 0; k <= 8; k++) { const t = k / 8, zz = z0 + t * L, yy = dir > 0 ? y0 + t * (y1 - y0) : y1 - t * (y1 - y0); this.add(this.m.iron, boxGeo(0.025, 0.95, 0.025, 1), xx, yy + 0.475, zz); }
    }
    // the sides of the flight collide on the ground floor (you go up it, not through its sides)
    const segs = this.B.segs, ox = this.ox, oz = this.oz;
    segs.push([ox + x0, oz + z0, ox + x0, oz + z1, 1.2], [ox + x1, oz + z0, ox + x1, oz + z1, 1.2]);
  }
  floorAt(lx, lz, y) {
    for (const [x0, z0, x1, z1, y0, y1, dir] of this.ramps) {
      if (lx > x0 - 0.02 && lx < x1 + 0.02 && lz > z0 && lz < z1) { const t = (lz - z0) / (z1 - z0); return dir > 0 ? y0 + t * (y1 - y0) : y1 - t * (y1 - y0); }
    }
    return this.F2 && y > this.F2 * 0.5 ? this.F2 : 0;
  }
  // furniture
  table(x, z, w, d, h = 0.76, key = this.m.wood, ry = 0, cloth = null) {
    const c = Math.cos(ry), s = Math.sin(ry), y0 = this.yAt;
    this.add(cloth || key, boxGeo(w, 0.05, d, 1), x, y0 + h - 0.025, z, ry);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = a * (w / 2 - 0.06), lz = b * (d / 2 - 0.06); this.add(key, boxGeo(0.05, h - 0.05, 0.05, 1), x + lx * c + lz * s, y0 + (h - 0.05) / 2, z - lx * s + lz * c); }
    this.foot(w, d, x, z, ry, 0.8, y0);
  }
  chair(x, z, ry, key = this.m.wood, seatKey = null, tall = false) {
    const y0 = this.yAt, c = Math.cos(ry), s = Math.sin(ry), W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    this.add(seatKey || key, boxGeo(0.44, 0.05, 0.42, 1), x, y0 + 0.46, z, ry);
    const [bx, bz] = W(0, -0.2); this.add(seatKey || key, boxGeo(0.44, tall ? 0.85 : 0.45, 0.05, 1), bx, y0 + (tall ? 0.92 : 0.72), bz, ry);
    for (const [a, b] of [[-0.19, -0.18], [0.19, -0.18], [0.19, 0.18], [-0.19, 0.18]]) { const [px, pz] = W(a, b); this.add(key, boxGeo(0.04, 0.46, 0.04, 1), px, y0 + 0.23, pz); }
  }
  bench(x, z, ry, len = 2, key = this.m.wood) {
    const y0 = this.yAt, c = Math.cos(ry), s = Math.sin(ry), W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    this.add(key, boxGeo(len, 0.05, 0.42, 1), x, y0 + 0.45, z, ry);
    const [bx, bz] = W(0, -0.2); this.add(key, boxGeo(len, 0.4, 0.05, 1), bx, y0 + 0.72, bz, ry);
    for (const a of [-len / 2 + 0.1, len / 2 - 0.1]) { const [px, pz] = W(a, 0); this.add(key, boxGeo(0.06, 0.45, 0.4, 1), px, y0 + 0.225, pz, ry); }
    this.foot(len, 0.5, x, z, ry, 0.6, y0);
  }
  plant(x, z, s = 1) { const y0 = this.yAt; this.add(this.m.pot, new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.4 * s, 12), x, y0 + 0.2 * s, z); for (let i = 0; i < 7; i++) { const a = i * 0.9, h = (0.5 + (i % 3) * 0.15) * s; const lf = new THREE.SphereGeometry(0.16 * s, 7, 5); lf.scale(0.7, 1.4, 0.7); this.add(this.m.plant, lf, x + Math.cos(a) * 0.1 * s, y0 + 0.4 * s + h * 0.5, z + Math.sin(a) * 0.1 * s); } this.foot(0.45 * s, 0.45 * s, x, z, 0, 0.8, y0); }
  // a picture or poster on a wall: tex a THREE texture; the plane faces along ry (0: +z)
  picture(tex, x, y, z, ry, w, h, frame = this.m.wood) {
    const m = new THREE.Mesh(planeGeo(w, h, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    { const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w, uv.getY(i) / h); }
    this.B.extraMesh(m, x, y, z, ry);
    if (frame) { const c = Math.cos(ry), s = Math.sin(ry); for (const [fw, fh, fx, fy] of [[w + 0.08, 0.04, 0, h / 2 + 0.02], [w + 0.08, 0.04, 0, -h / 2 - 0.02], [0.04, h, w / 2 + 0.02, 0], [0.04, h, -w / 2 - 0.02, 0]]) this.add(frame, boxGeo(fw, fh, 0.03, 1), x + fx * c - 0.01 * s, y + fy, z - fx * s - 0.01 * c, ry); }
    return m;
  }
  flag(x, z, kind) {
    const y0 = this.yAt;
    this.add(this.m.brass, new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8), x, y0 + 1.25, z);
    this.add(this.m.brass, new THREE.SphereGeometry(0.05, 8, 6), x, y0 + 2.53, z);
    this.add(this.m.brass, new THREE.CylinderGeometry(0.18, 0.22, 0.06, 12), x, y0 + 0.03, z);
    const fg = new THREE.PlaneGeometry(0.9, 1.35, 6, 8); fg.translate(0.45, 0, 0);
    const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const px = p.getX(i); p.setZ(i, Math.sin(px * 5) * 0.05 * px); p.setX(i, px * 0.55); } fg.computeVertexNormals(); fg.rotateZ(-Math.PI / 2 + 0.05); // (hung down from the pole, in folds)
    const t = new THREE.CanvasTexture(flagCanvas(kind)); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }));
    this.B.extraMesh(m, x + 0.03, y0 + 2.4, z, 0);
    this.foot(0.4, 0.4, x, z, 0, 1, y0);
  }
  chandelier(x, y, z, r = 0.7, n = 8) {
    this.add(this.m.brass, new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), x, y + 0.4, z);
    this.add(this.m.brass, new THREE.SphereGeometry(0.12, 10, 8), x, y, z);
    const ring = new THREE.TorusGeometry(r, 0.02, 4, 24); ring.rotateX(Math.PI / 2); this.add(this.m.brass, ring, x, y - 0.05, z);
    const bulb = this.mat('k_bulb', () => std(0xfff4d8, { emissive: 0xffe0a8, emissiveIntensity: 1.6, roughness: 0.3 }));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.add(bulb, new THREE.SphereGeometry(0.05, 8, 6), x + Math.cos(a) * r, y + 0.04, z + Math.sin(a) * r); }
    this.lamp(x, y - 0.3, z, 0xffe2b0, 6, 11);
  }
  lamp(x, y, z, color = 0xffe2b0, intensity = 6, dist = 10) { const l = new THREE.PointLight(color, intensity, dist, 1.6); l.position.set(this.ox + x, y, this.oz + z); l.userData.base = intensity; this.B.lights.push(l); return l; }
  // a door that stays shut (an office, the storeroom), with its frame
  shutDoor(x, z, ry, w = 0.95, h = 2.15, key = this.m.wood) {
    const y0 = this.yAt, c = Math.cos(ry), s = Math.sin(ry);
    this.add(key, boxGeo(w, h, 0.05, 1), x, y0 + h / 2, z, ry);
    for (const fx of [-w / 2 - 0.04, w / 2 + 0.04]) this.add(this.m.white, boxGeo(0.07, h + 0.05, 0.07, 1), x + fx * c, y0 + (h + 0.05) / 2, z - fx * s, ry);
    this.add(this.m.white, boxGeo(w + 0.15, 0.07, 0.07, 1), x, y0 + h + 0.04, z, ry);
    this.add(this.m.brass, new THREE.SphereGeometry(0.03, 8, 6), x + (w / 2 - 0.1) * c + 0.04 * s, y0 + 1.0, z - (w / 2 - 0.1) * s + 0.04 * c);
  }
  // a window onto the street (the real town shows in it): glass, a frame, its view box
  window(x, z, ry, w, h, y0, side = 'f') {
    const B = this.B;
    const m = new THREE.Mesh(planeGeo(w, h, 1), glassMat()); B.extraMesh(m, x, y0 + h / 2, z, ry);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [fw, fh, fx, fy] of [[w + 0.12, 0.06, 0, h + 0.03], [w + 0.12, 0.08, 0, -0.04], [0.06, h, w / 2 + 0.03, h / 2], [0.06, h, -w / 2 - 0.03, h / 2], [0.04, h, 0, h / 2]]) this.add(this.m.white, boxGeo(fw, fh, 0.08, 1), x + fx * c, y0 + fy, z - fx * s, ry);
    const ax = x - (w / 2) * c, az = z + (w / 2) * s, bx = x + (w / 2) * c, bz = z - (w / 2) * s;
    B.view(side, Math.min(ax, bx) - 0.12 * Math.abs(s), y0, Math.min(az, bz) - 0.12 * Math.abs(c), Math.max(ax, bx) + 0.12 * Math.abs(s), y0 + h, Math.max(az, bz) + 0.12 * Math.abs(c));
  }
  // done: the house the Interiors expect, with the second storey's collider and the floor's heights
  finish(extra = {}) {
    const B = this.B, ox = this.ox, oz = this.oz;
    const out = B.finish();
    if (this.segs1) {
      for (const s of this.segs1) s[4] += this.F2;
      const xs = this.segs1.flatMap((s) => [s[0], s[2]]), zs = this.segs1.flatMap((s) => [s[1], s[3]]);
      const col1 = new StaticCollider(Math.min(...xs) - 10, Math.min(...zs) - 10, Math.max(...xs) + 10, Math.max(...zs) + 10, 2);
      for (const s of this.segs1) col1.addSegment(s[0], s[1], s[2], s[3], s[4]);
      col1.build();
      out.levels = [out.collider, col1]; out.level = 0; out.split = this.F2 * 0.5;
    }
    if (this.ramps.length || this.F2) out.floorY = (x, z, y) => this.floorAt(x - ox, z - oz, y);
    out.origin = { x: ox, z: oz };
    return Object.assign(out, extra);
  }
  get yAt() { return this._y || 0; }
  set yAt(v) { this._y = v; }
}
