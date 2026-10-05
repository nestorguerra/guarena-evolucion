// Hand-modelled landmarks of Guareña placed on their real Catastro footprints:
// Iglesia de Santa María (tower 32 m), Ayuntamiento (Plaza de España), Iglesia de San Gregorio, Ermita de San Isidro,
// gas station, cooperative tanks, stadium La Noria, Guardia Civil, Centro de Salud, entry signs, plaza furniture.
import * as THREE from 'three';
import { stoneCanvas, flagCanvas, signAtlas, textCanvas, radialCanvas } from './textures.js';
import { orientedRect, ringArea, ringCentroid, pointInRing, polySample, hash1, mulberry32, clamp } from './util.js';
import { shared, makeNightGlowMaterial } from './materials.js';
import { makeFurnitureGeometries } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { westPortal, southPortal, northPortal } from './churchdoors.js';
import { fountain, plazaDetails, updateWater, cultura, mercadoFront, corbacho, pabellonFront, entranceLetters, meridaRoad, avenida } from './townplus.js';
import { buildSchools } from './schools.js';
import { buildPools } from './pools.js';
import { STYLE } from './style.js';

const toLocal = (lat, lon, origin) => {
  const R = 6378137, KX = Math.cos((origin[0] * Math.PI) / 180) * R * Math.PI / 180, KZ = R * Math.PI / 180;
  return [(lon - origin[1]) * KX, -(lat - origin[0]) * KZ];
};

const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
function mergeGeos(list) {
  const clean = list.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k);
    return q;
  });
  return mergeGeometries(clean, false);
}

function canvasTex(c, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Extrude a ring into walls with world-scaled UVs (tile metres) + optional flat roof
function extrudeRing(ring, y0, y1, tile = 3, withTop = false, edgeFn = null) {
  const pos = [], uv = [], nor = [], idx = [];
  const n = ring.length / 2;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2], az = ring[i * 2 + 1], bx = ring[j * 2], bz = ring[j * 2 + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    const nx = (bz - az) / L, nz = -(bx - ax) / L;
    const ef = edgeFn && edgeFn(i, ax, az, bx, bz);
    if (ef === 'skip') { acc += L; continue; }
    if (ef && ef.length) { // arched doorways through this wall: the wall as a shape with holes
      // (the doorways as notches in the outline, not holes: they stand on the ground)
      const sh = new THREE.Shape(); sh.moveTo(0, y0);
      for (const o of ef.slice().sort((p, q) => p.s - q.s)) { const r = o.w / 2; sh.lineTo(o.s - r, y0); sh.lineTo(o.s - r, y0 + o.spring); sh.absarc(o.s, y0 + o.spring, r, Math.PI, 0, true); sh.lineTo(o.s + r, y0); }
      sh.lineTo(L, y0); sh.lineTo(L, y1); sh.lineTo(0, y1); sh.closePath();
      const sg = new THREE.ShapeGeometry(sh, 16), sp = sg.attributes.position, si = sg.index.array, k = pos.length / 3;
      for (let q = 0; q < sp.count; q++) { const u = sp.getX(q), v = sp.getY(q); pos.push(ax + ((bx - ax) * u) / L, v, az + ((bz - az) * u) / L); nor.push(nx, 0, nz); uv.push((acc + u) / tile, v / tile); }
      // (the shape lies in the edge's plane; wind its faces to look out along the normal)
      for (let q = 0; q < si.length; q += 3) idx.push(k + si[q], k + si[q + 2], k + si[q + 1]);
      acc += L;
      continue;
    }
    const k = pos.length / 3;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    for (let q = 0; q < 4; q++) nor.push(nx, 0, nz);
    uv.push(acc / tile, y0 / tile, (acc + L) / tile, y0 / tile, (acc + L) / tile, y1 / tile, acc / tile, y1 / tile);
    idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    acc += L;
  }
  if (withTop) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(ring[i * 2], ring[i * 2 + 1]));
    const faces = THREE.ShapeUtils.triangulateShape(pts, []);
    const k = pos.length / 3;
    for (const p of pts) { pos.push(p.x, y1, p.y); nor.push(0, 1, 0); uv.push(p.x / tile, p.y / tile); }
    for (const f of faces) idx.push(k + f[0], k + f[2], k + f[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Box with UVs scaled in metres
function sbox(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, p = g.attributes.position, nm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(nm.getX(i)), ay = Math.abs(nm.getY(i));
    const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2, z = p.getZ(i) + d / 2;
    if (ax > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ay > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}

// Gable roof prism along local x: length L, width W, rise H
function gableRoof(L, W, H, over = 0.4, tile = 2.6) {
  const x0 = -L / 2 - over, x1 = L / 2 + over, z0 = -W / 2 - over, z1 = W / 2 + over;
  const slope = Math.hypot(W / 2 + over, H);
  const pos = [x0, 0, z0, x1, 0, z0, x1, H, 0, x0, H, 0, x1, 0, z1, x0, 0, z1, x0, H, 0, x1, H, 0];
  const uv = [0, 0, (x1 - x0) / tile, 0, (x1 - x0) / tile, slope / tile, 0, slope / tile, 0, 0, (x1 - x0) / tile, 0, (x1 - x0) / tile, slope / tile, 0, slope / tile];
  const idx = [0, 3, 2, 0, 2, 1, 4, 7, 6, 4, 6, 5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// triangular gable-end wall (in local XY plane, facing +z)
function gableEnd(W, H, tile = 3) {
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(0, H); s.closePath();
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  return g;
}
// round arch frame (half torus-ish ring) in XY plane
function archRing(r, thick, depth, seg = 12) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r + thick, 0, Math.PI, false);
  s.lineTo(-r, 0);
  s.absarc(0, 0, r, Math.PI, 0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -depth / 2);
  return g;
}
// dark arched opening panel
function archPanel(w, h, seg = 12) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, seg);
}

export function buildLandmarks(world, map) {
  return new Landmarks(world, map);
}

class Landmarks {
  constructor(world, map) {
    this.world = world;
    this.map = map;
    this.root = new THREE.Group();
    this.root.name = 'landmarks';
    world.root.add(this.root);
    this.claimed = [];       // rings whose generic parts must be skipped
    this.claimedB = new Set();
    this.colliders = [];     // rings for collision
    this.animated = [];
    this.flags = [];
    this.poi = {};           // named positions for gameplay
    this.overrides = new Map();
    const q = world.q;
    // materials
    const bumps = {};
    const tex = (kind, seed) => { const cv = stoneCanvas(kind, q.texSize >= 512 ? 512 : 256, seed); if (cv.bump) bumps[kind] = canvasTex(cv.bump, true, false); return canvasTex(cv, true); };
    this.mat = {
      mamp: new THREE.MeshStandardMaterial({ map: tex('mamposteria', 11), roughness: 0.95 }),
      sillar: new THREE.MeshStandardMaterial({ map: tex('sillar', 12), roughness: 0.9 }),
      teja: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      cal: new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.95 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 1 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.1, metalness: 0.3 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.6 }),
      bronze: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.35, metalness: 0.85 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.7 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }),
      green: new THREE.MeshStandardMaterial({ color: 0x1f7a3d, roughness: 0.6 }),
      red: new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.6 }),
    };
    // roof tile texture from facade array would need the array; draw a small canvas instead
    this.mat.teja.map = canvasTex(this.tileCanvas(), true);
    // (claymation: the church, the town hall and the rest worked by hand like the houses: their marks deeper and in the colour)
    if (STYLE.plastilina) for (const k of ['mamp', 'sillar', 'teja', 'cal', 'white']) this.mat[k].defines = { CLAY_RELIEF: '2.3', CLAY_TONE: '2.4', CLAY_SET: '0', CLAY_TILE: '2.4', CLAY_AMP: '0.012', CLAY_CAV: '0.22' };
    // (claymation: the church's stones swell from their bed — the relief painted with them, textures.js clayStones)
    if (bumps.mamposteria) { this.mat.mamp.bumpMap = bumps.mamposteria; this.mat.mamp.bumpScale = 5; }
    if (bumps.sillar) { this.mat.sillar.bumpMap = bumps.sillar; this.mat.sillar.bumpScale = 4; }
    this.signs = signAtlas();
    this.signTex = canvasTex(this.signs.canvas);
    this.build();
  }

  tileCanvas() {
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const rnd = mulberry32(5);
    x.fillStyle = '#8f452a'; x.fillRect(0, 0, S, S);
    const cols = 10, rows = 5, cw = S / cols, rh = S / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const v = 0.8 + rnd() * 0.3;
      const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
      const conv = i % 2 === 0;
      g.addColorStop(0, `rgb(${120 * v | 0},${58 * v | 0},${36 * v | 0})`);
      g.addColorStop(0.5, `rgb(${(conv ? 190 : 150) * v | 0},${(conv ? 95 : 72) * v | 0},${(conv ? 58 : 45) * v | 0})`);
      g.addColorStop(1, `rgb(${120 * v | 0},${58 * v | 0},${36 * v | 0})`);
      x.fillStyle = g;
      x.fillRect(i * cw, j * rh + (i % 2) * rh * 0.5, cw, rh);
      x.fillStyle = 'rgba(30,10,5,0.35)';
      x.fillRect(i * cw, j * rh + (i % 2) * rh * 0.5 + rh - 3, cw, 3);
    }
    return c;
  }

  // ---------------------------------------------------------------- helpers
  add(geo, mat, x, y, z, ry = 0, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
  frame(cx, cz, ux, uz) {
    // local frame: +x along u, +z along v = (-uz, ux) rotated; returns group positioned & rotated
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = Math.atan2(ux, uz) - Math.PI / 2; // local +x -> u
    this.root.add(g);
    g.updateMatrixWorld(true);
    return g;
  }
  put(group, geo, mat, x, y, z, ry = 0, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast; m.receiveShadow = true;
    group.add(m);
    return m;
  }
  building(x, z) { return this.map.buildingAt(x, z); }
  claim(b) {
    if (!b) return;
    this.claimed.push(b.ring);
    this.claimedB.add(b.id);
    this.colliders.push({ ring: b.ring, h: 30 });
  }
  claims(x, z) {
    for (const r of this.claimed) if (pointInRing(x, z, r)) return true;
    return false;
  }
  claimsBuilding(b) { return this.claimedB.has(b.id); }
  addColliders(map) {
    for (const c of this.colliders) map.collider.addRing(c.ring, c.h, -10);
    for (const c of this.circleColliders || []) map.collider.addCircle(c[0], c[1], c[2], c[3], -11);
    for (const s of this.segColliders || []) map.collider.addSegment(s[0], s[1], s[2], s[3], s[4], -11);
  }
  signQuad(name, w, h) {
    const [cx, cy] = this.signs.cells[name];
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    const C = this.signs.cols, R = this.signs.rows;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (cx + uv.getX(i)) / C, 1 - (cy + 1 - uv.getY(i)) / R);
    }
    return g;
  }
  get signMat() {
    if (!this._signMat) this._signMat = new THREE.MeshStandardMaterial({ map: this.signTex, roughness: 0.5, side: THREE.DoubleSide });
    return this._signMat;
  }
  circle(x, z, r, h) { (this.circleColliders || (this.circleColliders = [])).push([x, z, r, h]); }
  seg(ax, az, bx, bz, h) { (this.segColliders || (this.segColliders = [])).push([ax, az, bx, bz, h]); }

  build() {
    const o = this.map.raw.origin;
    this.church(toLocal(38.8601623, -6.104399, o));
    this.ayuntamiento(toLocal(38.85952, -6.10286, o));
    this.sanGregorio(toLocal(38.8593944, -6.0999634, o));
    this.ermita(toLocal(38.8484523, -6.0775261, o));
    this.mercado(toLocal(38.85949, -6.10063, o));
    this.plaza();
    fountain(this); plazaDetails(this);
    cultura(this);
    buildPools(this);
    corbacho(this);
    pabellonFront(this);
    avenida(this);
    entranceLetters(this);
    meridaRoad(this);
    this.gasStation();
    this.tanks();
    this.stadium();
    this.services();
    buildSchools(this); // (src/schools.js: fences, gates, flags and yards of the schools)
    // traffic signs and the town entry boards now come from signs.js (built with the street furniture)
    this.terraces();
    this.plazaTrees();
  }

  // ================================================================ traffic signs from OSM (stop / give way) + one-way streets
  streetSigns() {
    const map = this.map;
    const boards = [], posts = [];
    const tmp = {};
    const place = (name, x, z, faceAng, h = 2.25, size = 0.72) => {
      if (map.buildingAt(x, z)) return;
      const post = new THREE.CylinderGeometry(0.035, 0.035, h, 6);
      post.translate(x, h / 2, z);
      posts.push(post);
      const q = this.signQuad(name, size, size);
      q.rotateY(faceAng);
      q.translate(x + Math.sin(faceAng) * 0.05, h - size / 2 + 0.05, z + Math.cos(faceAng) * 0.05);
      boards.push(q);
      this.circle(x, z, 0.12, 2.5);
    };
    // stop / give way nodes
    for (const p of map.pois) {
      if (p.kind !== 'highway:stop' && p.kind !== 'highway:give_way') continue;
      const q = map.nearestEdge(p.x, p.z, 10, (e) => e.drive);
      if (!q) continue;
      const e = q.edge, d = map.sample(e, q.s, tmp);
      const na = map.nodes[e.a], nb = map.nodes[e.b];
      const toB = Math.hypot(nb.x - q.x, nb.z - q.z) < Math.hypot(na.x - q.x, na.z - q.z);
      const fx = toB ? d.dx : -d.dx, fz = toB ? d.dz : -d.dz; // driver direction
      const rx = -fz, rz = fx;
      const off = e.w / 2 + 0.6;
      place(p.kind === 'highway:stop' ? 'stop' : 'ceda', q.x + rx * off, q.z + rz * off, Math.atan2(-fx, -fz));
    }
    // one-way streets in town: "sentido obligatorio" at the entry, "dirección prohibida" at the exit
    for (const e of map.edges) {
      if (!e.drive || !e.oneway || e.len < 25 || !map.inTown(e.pts[0], e.pts[1])) continue;
      const fwd = e.oneway === 1;
      const sEntry = fwd ? 3 : e.len - 3, sExit = fwd ? e.len - 3 : 3;
      const dirSign = fwd ? 1 : -1;
      let d = map.sample(e, sEntry, {});
      let fx = d.dx * dirSign, fz = d.dz * dirSign;
      const off = e.w / 2 + 0.35;
      place('sentido', d.x + -fz * off, d.z + fx * off, Math.atan2(-fx, -fz), 2.4, 0.6);
      d = map.sample(e, sExit, {});
      fx = d.dx * dirSign; fz = d.dz * dirSign;
      // facing drivers that would enter against the flow (they travel -f): board faces +f
      place('prohibido', d.x + fz * off, d.z - fx * off, Math.atan2(fx, fz), 2.4, 0.6);
    }
    if (boards.length) {
      const bm = new THREE.Mesh(mergeGeos(boards), this.signMat); bm.castShadow = true; this.root.add(bm);
      const pm = new THREE.Mesh(mergeGeos(posts), this.mat.steel); pm.castShadow = true; this.root.add(pm);
    }
  }

  // ================================================================ bar terraces (mesas, sillas y sombrillas)
  terraces() {
    const map = this.map;
    const bars = map.pois.filter((p) => /amenity:(bar|cafe|pub|restaurant|ice_cream)/.test(p.kind) && map.inTown(p.x, p.z));
    const tables = [], chairs = [], umbrellas = [], poles = [];
    const rnd = mulberry32(31);
    const cols = [0xf2efe6, 0xc8202a, 0x1f6b3a, 0x2659a6, 0xe6b422];
    const umbrellaMats = cols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
    const byColor = umbrellaMats.map(() => []);
    for (const b of bars) {
      // walk from the bar towards the nearest street/plaza to find open ground
      const q = map.nearestEdge(b.x, b.z, 30, (e) => !e.dirt);
      if (!q) continue;
      const dx = q.x - b.x, dz = q.z - b.z, L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;
      const ed = map.sample(q.edge, q.s, {});
      const plazaNear = map.areas.some((a) => (a.kind === 'highway:pedestrian' || a.kind === 'place:square' || a.kind === 'leisure:park') && pointInRing(q.x, q.z, a.ring));
      const wide = q.edge.cls === 'pedestrian' || q.edge.walkOnly || plazaNear || q.edge.sw >= 1.8;
      if (!wide) continue;
      const color = Math.floor(rnd() * cols.length);
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const along = (k - (n - 1) / 2) * 2.6;
        const base = q.edge.walkOnly || plazaNear ? L * 0.5 : Math.max(0.2, L - q.edge.w / 2 - 1.4);
        const x = b.x + ux * base + ed.dx * along, z = b.z + uz * base + ed.dz * along;
        if (map.buildingAt(x, z)) continue;
        const nq = map.nearestEdge(x, z, 12, (e) => e.drive);
        if (nq && nq.d < nq.edge.w / 2 + 0.4 && !nq.edge.walkOnly) continue;
        tables.push([x, z]);
        for (let c = 0; c < 3; c++) {
          const a = (c / 3) * Math.PI * 2 + rnd();
          chairs.push([x + Math.cos(a) * 0.62, z + Math.sin(a) * 0.62, -a + Math.PI / 2]);
        }
        byColor[color].push([x, z]);
        this.circle(x, z, 0.45, 1);
      }
    }
    if (!tables.length) return;
    const mk = (geo, mat, list, rotIdx = -1) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((p, i) => { qq.setFromAxisAngle(up, rotIdx >= 0 ? p[rotIdx] : 0); m.compose(new THREE.Vector3(p[0], 0, p[1]), qq, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m); });
      im.castShadow = true; im.receiveShadow = true;
      this.root.add(im);
      return im;
    };
    const table = mergeGeos([new THREE.CylinderGeometry(0.38, 0.38, 0.03, 16).translate(0, 0.74, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.74, 6).translate(0, 0.37, 0), new THREE.CylinderGeometry(0.25, 0.25, 0.03, 12).translate(0, 0.015, 0)]);
    const chair = mergeGeos([new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.45, 0), new THREE.BoxGeometry(0.42, 0.42, 0.04).translate(0, 0.68, -0.2), ...[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([a, b]) => new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5).translate(a, 0.225, b))]);
    mk(table, this.mat.steel, tables);
    mk(chair, new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.4, metalness: 0.6 }), chairs, 2);
    const canopy = new THREE.ConeGeometry(1.35, 0.45, 8, 1, true); canopy.translate(0, 2.35, 0);
    const pole = new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6); pole.translate(0, 1.2, 0);
    byColor.forEach((list, i) => { if (list.length) mk(canopy, umbrellaMats[i], list); });
    mk(pole, this.mat.white, tables);
  }

  // ================================================================ orange trees around the plazas
  plazaTrees() {
    const extra = this.world.extraTrees || (this.world.extraTrees = []);
    for (const a of this.map.areas) {
      if (!(a.kind === 'highway:pedestrian' || a.kind === 'place:square' || a.kind === 'amenity:marketplace')) continue;
      const r = a.ring;
      const n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 8) continue;
        const ix = -(bz - az) / L, iz = (bx - ax) / L; // inward for CCW rings
        for (let s = 4; s < L - 3; s += 9) {
          const x = ax + ((bx - ax) * s) / L + ix * 2.2, z = az + ((bz - az) * s) / L + iz * 2.2;
          if (!pointInRing(x, z, r) || this.map.buildingAt(x, z)) continue;
          extra.push({ kind: 'naranjo', x, z, s: 1 });
        }
      }
    }
  }

  // ================================================================ Iglesia de Santa María
  church([x, z]) {
    const b = this.building(x, z);
    if (!b) return;
    this.claim(b);
    const ob = orientedRect(b.ring);
    let ux = Math.cos(ob.ang), uz = Math.sin(ob.ang);
    let L = ob.hw, W = ob.hd;
    if (W > L) { [L, W] = [W, L]; [ux, uz] = [-uz, ux]; }
    if (ux < 0) { ux = -ux; uz = -uz; } // u points east (towards the apse)
    const vx = -uz, vz = ux;             // v perpendicular; make it point south (+z)
    const south = vz > 0 ? 1 : -1;
    const g = this.frame(ob.cx, ob.cz, ux, uz);
    // in frame: local x along u (east), local z along ±v
    const M = this.mat;
    // base annexes: extrude real footprint (chapels, sacristy)
    const ringLocal = [];
    const ang = -(Math.atan2(ux, uz) - Math.PI / 2);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < b.ring.length; i += 2) {
      const dx = b.ring[i] - ob.cx, dz = b.ring[i + 1] - ob.cz;
      ringLocal.push(dx * ca + dz * sa, -dx * sa + dz * ca);
    }
    // where a line across the footprint meets its outline (local frame): along z at a given x, or along x at a given z
    const cross = (axis, at, pick) => {
      let best = null;
      for (let i = 0, n = ringLocal.length / 2; i < n; i++) {
        const j = (i + 1) % n, ax = ringLocal[i * 2], az = ringLocal[i * 2 + 1], bx = ringLocal[j * 2], bz = ringLocal[j * 2 + 1];
        const [pa, pb, qa, qb] = axis === 'x' ? [az, bz, ax, bx] : [ax, bx, az, bz];
        if ((pa - at) * (pb - at) > 0 || pa === pb) continue;
        const v = qa + ((qb - qa) * (at - pa)) / (pb - pa);
        if (best === null || pick(v, best.v)) best = { v, i };
      }
      return best;
    };
    const nw = Math.min(W * 0.52, 9.5);
    // the foot of the church stands where the Catastro's outline is (the portal must not be walled up behind it)
    const xw = cross('x', 0, (v, b2) => v < b2);
    const x0 = clamp(xw ? xw.v - 0.05 : -L + 1.2, -L + 0.1, -L + 2.4), xa = L - nw - 1.5; // nave from west facade to apse start
    const naveLen = xa - x0;
    // the side doors in the third bay, on the outline: the Mediodía (south) one onto its atrium, the Gospel one shut
    const xs = x0 + 2.5 + (2.5 * (naveLen - 5)) / 4; // (the middle of the third bay, between its buttresses)
    const sHit = cross('z', xs, (v, b2) => (south > 0 ? v > b2 : v < b2)), nHit = cross('z', xs, (v, b2) => (south > 0 ? v < b2 : v > b2));
    const doorEdges = new Map();
    for (const [hit, wDoor, sp2] of [[sHit, 2.3, 3.3], [nHit, 2.2, 3.2]]) {
      if (!hit) continue;
      const i = hit.i, n = ringLocal.length / 2, j = (i + 1) % n;
      const ax = ringLocal[i * 2], az = ringLocal[i * 2 + 1], bx = ringLocal[j * 2], bz = ringLocal[j * 2 + 1];
      const sAlong = Math.hypot(xs - ax, hit.v - az);
      if (sAlong > wDoor && Math.hypot(bx - ax, bz - az) - sAlong > wDoor) {
        (doorEdges.get(i) || doorEdges.set(i, []).get(i)).push({ s: sAlong, w: wDoor, spring: sp2 });
        const ex = bx - ax, ez = bz - az, el = Math.hypot(ex, ez), side = Math.sign(hit.v) || 1;
        let nx = ez / el, nz = -ex / el; if (Math.sign(nz) !== side) { nx = -nx; nz = -nz; }
        hit.ok = true; hit.nx = nx; hit.nz = nz;
      }
    }
    const annex = extrudeRing(ringLocal, 0, 8.5, 3.2, true, (i, ax, az, bx, bz) => {
      // the bit of outline right behind the west front: the front stands over it
      if (Math.abs((ax + bx) / 2 - x0) < 0.6 && Math.abs(ax - bx) < 0.8 && Math.abs(az - bz) > 1 && Math.max(Math.abs(az), Math.abs(bz)) < nw + 0.5) return 'skip';
      return doorEdges.get(i) || null;
    });
    this.put(g, annex, M.mamp, 0, 0, 0);
    // nave
    const H = 19;
    const nave = sbox(naveLen, H, nw * 2, 3.2);
    { const ix = Array.from(nave.index.array); ix.splice(6, 6); nave.setIndex(ix); } // (the -x face: drawn below, with its door)
    this.put(g, nave, M.mamp, x0 + naveLen / 2, H / 2, 0);
    {
      const R = 1.3, SP = 3.7, sh = new THREE.Shape();
      sh.moveTo(-nw, 0); sh.lineTo(-R, 0); sh.lineTo(-R, SP); sh.absarc(0, SP, R, Math.PI, 0, true); sh.lineTo(R, 0); sh.lineTo(nw, 0); sh.lineTo(nw, H); sh.lineTo(-nw, H); sh.closePath();
      const wf = new THREE.ShapeGeometry(sh, 16), pp = wf.attributes.position, wu = wf.attributes.uv;
      for (let i = 0; i < pp.count; i++) wu.setXY(i, (nw - pp.getX(i)) / 3.2, pp.getY(i) / 3.2);
      wf.rotateY(-Math.PI / 2);
      this.put(g, wf, M.mamp, x0, 0, 0);
    }
    // apse: half polygon
    const apse = new THREE.CylinderGeometry(nw, nw, H - 1, 7, 1, false, 0, Math.PI);
    const au = apse.attributes.uv; for (let i = 0; i < au.count; i++) au.setXY(i, au.getX(i) * 12, au.getY(i) * (H - 1) / 3.2);
    const am = this.put(g, apse, M.mamp, xa, (H - 1) / 2, 0);
    am.rotation.y = 0;
    // apse roof (half cone)
    const aroof = new THREE.ConeGeometry(nw + 0.4, 4.5, 7, 1, true, 0, Math.PI);
    this.put(g, aroof, M.teja, xa, H - 1 + 2.25, 0);
    // nave roof
    const roof = gableRoof(naveLen, nw * 2, 5.2, 0.5);
    this.put(g, roof, M.teja, x0 + naveLen / 2, H, 0);
    // east gable end
    const ge = gableEnd(nw * 2, 5.2);
    this.put(g, ge, M.mamp, xa + 0.02, H, 0, Math.PI / 2);
    // buttresses (granite ashlar) — 5 per side
    for (let k = 0; k <= 4; k++) {
      const bx = x0 + 2.5 + (k * (naveLen - 5)) / 4;
      for (const s of [-1, 1]) {
        const bt = sbox(1.8, H - 2.5, 2.2, 1.6);
        this.put(g, bt, M.sillar, bx, (H - 2.5) / 2, s * (nw + 1.05));
        const cap = sbox(1.8, 1.2, 2.2, 1.6);
        const cm = this.put(g, cap, M.sillar, bx, H - 2.2, s * (nw + 0.7));
        cm.rotation.x = s * -0.5;
      }
      // tall window per bay
      if (k < 4) {
        const wx = x0 + 2.5 + ((k + 0.5) * (naveLen - 5)) / 4;
        for (const s of [-1, 1]) {
          const wp = archPanel(1.5, 5.2);
          const wm = this.put(g, wp, M.glass, wx, 10.5, s * (nw + 0.03), s > 0 ? 0 : Math.PI, false);
          const fr = archRing(0.75, 0.25, 0.3);
          this.put(g, fr, M.sillar, wx, 10.5 + 5.2 - 0.75, s * (nw + 0.1), s > 0 ? 0 : Math.PI, false);
        }
      }
    }
    // corner quoins (ashlar strips) on the west facade
    for (const s of [-1, 1]) this.put(g, sbox(1.2, H, 1.2, 1.6), M.sillar, x0 + 0.5, H / 2, s * (nw - 0.5));
    // west facade: the main portal (its door really opens: churchdoors.js) and the great oculus over it
    const wP = westPortal(M.sillar);
    wP.group.position.set(x0, 0, 0); wP.group.rotation.y = -Math.PI / 2; g.add(wP.group);
    {
      const og = new THREE.Group(); og.position.set(x0 - 0.02, 12.5, 0); og.rotation.y = -Math.PI / 2; g.add(og);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(1.56, 40), M.glass); gl.position.z = 0.02; og.add(gl);
      const parts = [];
      for (const [r, t, zz] of [[1.62, 0.15, 0.08], [1.85, 0.12, 0.16], [2.04, 0.1, 0.09], [0.42, 0.07, 0.08]]) parts.push(new THREE.TorusGeometry(r, t, 8, 44).translate(0, 0, zz));
      for (let i = 0; i < 16; i++) { const sp = new THREE.BoxGeometry(0.07, 1.16, 0.08); sp.translate(0, 0.42 + 0.58, 0.06); sp.rotateZ((i / 16) * Math.PI * 2); parts.push(sp); } // a wheel of granite spokes
      for (let i = 0; i < 16; i++) { const a2 = ((i + 0.5) / 16) * Math.PI * 2, ar = new THREE.TorusGeometry(0.2, 0.035, 5, 10, Math.PI); ar.rotateZ(a2 - Math.PI / 2); ar.translate(Math.cos(a2) * 1.32, Math.sin(a2) * 1.32, 0.06); parts.push(ar); }
      const om = new THREE.Mesh(mergeGeos(parts), M.sillar); om.castShadow = true; og.add(om);
    }
    const wge = gableEnd(nw * 2, 5.2);
    this.put(g, wge, M.mamp, x0 - 0.02, H, 0, -Math.PI / 2);
    // the side portals, on the outline in the third bay: the Mediodía (open: its leaf stands ajar by day), the Gospel one
    const sideP = (hit, make) => {
      if (!hit || !hit.ok) return null;
      const P = make(M.sillar, { room: Math.abs(hit.v) - nw }); // (behind the door, as far as the nave's wall)
      P.group.position.set(xs, 0, hit.v); P.group.rotation.y = Math.atan2(hit.nx, hit.nz);
      g.add(P.group);
      return P;
    };
    const sP = sideP(sHit, southPortal), nP = sideP(nHit, northPortal);
    // tower at the foot, right of the main door (south-west)
    const tw = 8.4, TH = 32;
    const tx = x0 + tw / 2 - 0.4, tz = south * (nw + tw / 2 - 0.2);
    const stages = [[0, 13, M.mamp], [13, 20.5, M.mamp], [20.5, 27, M.sillar], [27, 30.5, M.sillar]];
    stages.forEach(([a, bH, mat], i) => {
      const w = tw - i * 0.5;
      this.put(g, sbox(w, bH - a, w, 3.2), mat, tx, (a + bH) / 2, tz);
      // cornice between stages
      this.put(g, sbox(w + 0.5, 0.45, w + 0.5, 1.6), M.sillar, tx, bH, tz);
    });
    // corner quoins stage 1-2
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(g, sbox(0.9, 20.5, 0.9, 1.6), M.sillar, tx + sx * (tw / 2 - 0.35), 10.25, tz + sz * (tw / 2 - 0.35));
    // belfry openings (bells) stage 3 on all sides
    const bellY = 22.2;
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const w = tw - 2 * 0.5;
      for (const off of [-1.5, 1.5]) {
        const op = new THREE.Mesh(archPanel(1.6, 3.6), M.dark);
        const d = w / 2 + 0.02;
        op.position.set(tx + Math.sin(a) * d + Math.cos(a) * off, bellY, tz + Math.cos(a) * d - Math.sin(a) * off);
        op.rotation.y = a;
        g.add(op);
        if (side % 2 === 0) {
          const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.0, 12, 1, true), M.bronze);
          bell.position.set(tx + Math.sin(a) * (d - 0.8) + Math.cos(a) * off, bellY + 2.4, tz + Math.cos(a) * (d - 0.8) - Math.sin(a) * off);
          g.add(bell);
          this.animated.push({ kind: 'bell', mesh: bell, phase: off });
        }
      }
      // upper stage small openings
      const op2 = new THREE.Mesh(archPanel(1.2, 2.2), M.dark);
      const d2 = (tw - 1.5) / 2 + 0.02;
      op2.position.set(tx + Math.sin(a) * d2, 28, tz + Math.cos(a) * d2);
      op2.rotation.y = a;
      g.add(op2);
    }
    // dome + lantern + cross
    const dome = new THREE.SphereGeometry(3.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.put(g, dome, M.teja, tx, 30.7, tz);
    this.put(g, new THREE.CylinderGeometry(0.6, 0.7, 1.6, 8), M.sillar, tx, 34.2, tz);
    this.put(g, new THREE.SphereGeometry(0.45, 10, 6), M.sillar, tx, 35.3, tz);
    this.put(g, sbox(0.12, 2.0, 0.12), M.iron, tx, 36.6, tz);
    this.put(g, sbox(0.9, 0.12, 0.12), M.iron, tx, 37.0, tz);
    // pinnacles on the tower corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.put(g, new THREE.ConeGeometry(0.35, 1.6, 6), M.sillar, tx + sx * (tw / 2 - 1.1), 31.4, tz + sz * (tw / 2 - 1.1));
    }
    // stork nests on the tower cornice & nave ridge
    const F = makeFurnitureGeometries();
    const nestMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.put(g, F.nido, nestMat, tx + 2.2, 30.72, tz - 2.2);
    this.put(g, F.nido, nestMat, xa - 2, H + 5.1, 0);
    const towerWorld = new THREE.Vector3(tx, 0, tz).applyMatrix4(g.matrixWorld);
    this.poi.churchTower = { x: towerWorld.x, z: towerWorld.z, top: 31 };
    const doorWorld = new THREE.Vector3(x0 - 6, 0, 0).applyMatrix4(g.matrixWorld);
    this.poi.churchDoor = { x: doorWorld.x, z: doorWorld.z };
    // the doors (the inside: church.js): the main one at the foot and the Mediodía one go in; the Gospel one is shut. For
    // each: its threshold on the facade (thr), the way out to the street (nx, nz), where to stand (x, z: a step out), a
    // point inside (f), its leaves (door)
    const toW = (lx, lz) => { const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld); return { x: v.x, z: v.z }; };
    const dirW = (dx, dz) => { const a2 = toW(0, 0), b2 = toW(dx, dz); return { x: b2.x - a2.x, z: b2.z - a2.z }; };
    this.poi.churchPortal = toW(x0 + 0.4, 0);
    const doorPoi = (P, lx, lz, nlx, nlz) => {
      const thr = toW(lx, lz), n = dirW(nlx, nlz);
      return { x: thr.x + n.x * 1.1, z: thr.z + n.z * 1.1, f: toW(lx - nlx * 0.8, lz - nlz * 0.8), thr, nx: n.x, nz: n.z, door: P.door, half: P.w / 2 };
    };
    this.poi.churchWest = doorPoi(wP, x0, 0, -1, 0);
    if (sP) this.poi.churchSouth = doorPoi(sP, xs, sHit.v, sHit.nx, sHit.nz);
    if (nP) this.poi.churchNorth = doorPoi(nP, xs, nHit.v, nHit.nx, nHit.nz);
    // the portals' pedestals stand out into the street: you walk round them
    for (const [P, lx, lz] of [[wP, x0, 0], [sP, xs, sHit && sHit.v], [nP, xs, nHit && nHit.v]]) {
      if (!P) continue;
      const ry = P.group.rotation.y, c = Math.cos(ry), s2 = Math.sin(ry);
      for (const [px, pz, pr] of P.posts) { const q = toW(lx + px * c + pz * s2, lz - px * s2 + pz * c); this.circle(q.x, q.z, pr, 3); }
    }
    this.churchDoors = [wP.door, sP && sP.door, nP && nP.door].filter(Boolean);
    this.storkSpots = [new THREE.Vector3(tx + 2.2, 31.2, tz - 2.2).applyMatrix4(g.matrixWorld), new THREE.Vector3(xa - 2, H + 5.6, 0).applyMatrix4(g.matrixWorld)];
    // collider: full footprint is already claimed
  }

  // ================================================================ Ayuntamiento (Plaza de España 1)
  ayuntamiento([x, z]) {
    const b = this.building(x, z) || this.building(x, z + 5);
    if (!b) return;
    this.claim(b);
    const M = this.mat;
    // facade edge: the one facing the plaza (south)
    const plaza = this.map.areas.find((a) => a.name === 'Plaza de España');
    const pc = plaza ? ringCentroid(plaza.ring) : [x, z + 30];
    this.poi.plaza = { x: pc[0], z: pc[1] };
    const r = b.ring;
    let best = null;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const ax = r[i], az = r[i + 1], bx = r[j], bz = r[j + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 8) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const toP = (pc[0] - mx) * nx + (pc[1] - mz) * nz;
      const score = toP / Math.hypot(pc[0] - mx, pc[1] - mz) + L * 0.01;
      if (!best || score > best.score) best = { score, ax, az, bx, bz, L, nx, nz, mx, mz };
    }
    const Hb = 11.5;
    // body: real footprint in granite ashlar
    const body = extrudeRing(r, 0, Hb, 2.4, true);
    this.add(body, M.sillar, 0, 0, 0);
    if (!best) return;
    const { L, nx, nz, mx, mz } = best;
    const ux = (best.bx - best.ax) / L, uz = (best.bz - best.az) / L;
    const f = new THREE.Group();
    f.position.set(mx + nx * 0.02, 0, mz + nz * 0.02);
    f.rotation.y = Math.atan2(nx, nz); // local +z = outward normal, local +x = ? (right)
    this.root.add(f);
    const FW = Math.min(L - 1, 16);
    // ground floor arcade: 3 round arches between double Tuscan pilasters
    const aw = 3.1, ah = 5.0;
    for (let k = -1; k <= 1; k++) {
      const cx = k * (aw + 1.3);
      const pnl = new THREE.Mesh(archPanel(aw, ah), M.dark); pnl.position.set(cx, 0, 0.02); f.add(pnl);
      const ring = new THREE.Mesh(archRing(aw / 2, 0.35, 0.5), M.sillar); ring.position.set(cx, ah - aw / 2, 0.25); f.add(ring);
    }
    for (let k = -2; k <= 1; k++) {
      const px = (k + 0.5) * (aw + 1.3);
      for (const d of [-0.32, 0.32]) {
        const pil = new THREE.Mesh(sbox(0.42, 5.6, 0.45, 1.2), M.sillar); pil.position.set(px + d, 2.8, 0.25); f.add(pil);
      }
    }
    f.add(at(new THREE.Mesh(sbox(FW, 0.6, 0.7, 1.6), M.sillar), 0, 5.9, 0.3));
    // upper floor: 5 openings, central 3 with a balcony
    for (let k = -2; k <= 2; k++) {
      const cx = k * 2.9;
      const op = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.6), M.glass); op.position.set(cx, 7.9, 0.03); f.add(op);
      const fr = new THREE.Mesh(sbox(1.8, 0.35, 0.3, 1), M.sillar); fr.position.set(cx, 9.4, 0.15); f.add(fr);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.5), M.wood);
      for (const s of [-1, 1]) { const m = sh.clone(); m.position.set(cx + s * 0.99, 7.9, 0.04); f.add(m); }
    }
    const balc = new THREE.Mesh(sbox(8.6, 0.25, 1.1, 1), M.sillar); balc.position.set(0, 6.55, 0.55); f.add(balc);
    for (let i = 0; i <= 43; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), M.iron); bar.position.set(-4.3 + i * 0.2, 7.15, 1.05); f.add(bar);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.06, 0.06), M.iron); rail.position.set(0, 7.65, 1.05); f.add(rail);
    // cornice + parapet with stone balls
    f.add(at(new THREE.Mesh(sbox(FW + 0.8, 0.7, 1.2, 1.6), M.sillar), 0, Hb - 0.2, 0.35));
    for (let i = 0; i < 9; i++) {
      const px = -FW / 2 + 0.5 + (i * (FW - 1)) / 8;
      f.add(at(new THREE.Mesh(sbox(0.5, 0.9, 0.5, 1), M.sillar), px, Hb + 0.6, 0.3));
      f.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.sillar), px, Hb + 1.35, 0.3));
    }
    // pediment with coat of arms
    const pedG = gableEnd(7.0, 1.9, 1.6);
    f.add(at(new THREE.Mesh(pedG, M.sillar), 0, Hb + 0.15, 0.95));
    const arms = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: canvasTex(stoneCanvas('escudo', 256)), transparent: true, roughness: 0.6 }));
    arms.position.set(0, Hb + 0.85, 0.98); f.add(arms);
    // bell-gable (espadaña) with clock
    const esp = new THREE.Mesh(sbox(3.2, 3.6, 0.6, 1.6), M.sillar); esp.position.set(0, Hb + 3.4, -0.2); f.add(esp);
    const hole = new THREE.Mesh(archPanel(1.3, 1.9), M.dark); hole.position.set(0, Hb + 3.1, 0.12); f.add(hole);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 0.6, 10, 1, true), M.bronze); bell.position.set(0, Hb + 4.1, -0.2); f.add(bell);
    const topC = new THREE.Mesh(gableEnd(3.2, 1.0, 1.6), M.sillar); topC.position.set(0, Hb + 5.2, 0.11); f.add(topC);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshStandardMaterial({ map: canvasTex(stoneCanvas('reloj', 256)), roughness: 0.4 }));
    clock.position.set(0, Hb + 1.95, 1.0); f.add(clock);
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.02), M.iron); hh.geometry.translate(0, 0.2, 0); hh.position.set(0, Hb + 1.95, 1.03); f.add(hh);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.68, 0.02), M.iron); mh.geometry.translate(0, 0.32, 0); mh.position.set(0, Hb + 1.95, 1.04); f.add(mh);
    this.animated.push({ kind: 'clock', hh, mh });
    // flags on the balcony: Spain, Extremadura, EU
    ['es', 'ex', 'eu'].forEach((k, i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), M.iron);
      pole.position.set(-1.6 + i * 1.6, 8.5, 1.3); pole.rotation.x = 0.6; f.add(pole);
      const fg = new THREE.PlaneGeometry(1.35, 0.9, 12, 4);
      fg.translate(0.675, -0.45, 0);
      const fm = new THREE.MeshStandardMaterial({ map: canvasTex(flagCanvas(k)), side: THREE.DoubleSide, roughness: 0.8 });
      const flag = new THREE.Mesh(fg, fm);
      flag.position.set(-1.6 + i * 1.6, 9.45, 1.95); f.add(flag);
      this.flags.push({ mesh: flag, base: fg.attributes.position.array.slice(), phase: i });
    });
    // sign
    const s = new THREE.Mesh(this.signQuad('ayto', 1.4, 1.4), this.signMat); s.position.set(-FW / 2 + 1.5, 3.4, 0.05); f.add(s);
    this.poi.ayto = { x: mx + nx * 4, z: mz + nz * 4, nx, nz };
    // in under the arcade by the middle arch (venues.js: the hall, the stairs, the Salón de Plenos)
    (this.poi.venues || (this.poi.venues = [])).push({ kind: 'ayto', name: 'Ayuntamiento de Guareña', sub: 'Casa Consistorial · Plaza de España', x: mx + nx * 1.3, z: mz + nz * 1.3, fx: mx - nx * 3, fz: mz - nz * 3, seed: 9 });
  }

  // ================================================================ Iglesia de San Gregorio (Plaza de San Gregorio)
  sanGregorio([x, z]) {
    const b = this.building(x, z);
    if (!b) return;
    this.claim(b);
    const small = this.building(238.9, 29.4);
    if (small && small !== b) this.claim(small);
    const M = this.mat;
    const ob = orientedRect(b.ring);
    let ux = Math.cos(ob.ang), uz = Math.sin(ob.ang), L = ob.hw, W = ob.hd;
    if (W > L) { [L, W] = [W, L]; [ux, uz] = [-uz, ux]; }
    if (ux < 0) { ux = -ux; uz = -uz; }
    const g = this.frame(ob.cx, ob.cz, ux, uz);
    const H = 8.8;
    this.put(g, sbox(L * 2, H, W * 2, 3), M.cal, 0, H / 2, 0);
    // granite plinth & corners
    this.put(g, sbox(L * 2 + 0.1, 1.0, W * 2 + 0.1, 1.6), M.sillar, 0, 0.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(g, sbox(0.7, H, 0.7, 1.6), M.sillar, sx * (L - 0.3), H / 2, sz * (W - 0.3));
    this.put(g, gableRoof(L * 2, W * 2, 3.2, 0.35), M.teja, 0, H, 0);
    this.put(g, gableEnd(W * 2, 3.2), M.cal, L + 0.02, H, 0, Math.PI / 2);
    // west facade (towards the plaza): bell-gable with baroque scrolls + portal
    const fx = -L - 0.02;
    this.put(g, gableEnd(W * 2, 3.2), M.cal, fx, H, 0, -Math.PI / 2);
    const esp = this.put(g, sbox(0.7, 4.2, 4.2, 1.6), M.sillar, fx + 0.3, H + 3.3, 0);
    for (const s of [-1, 1]) {
      const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.22, 6, 12, Math.PI), M.sillar);
      scroll.position.set(fx + 0.3, H + 1.9, s * 2.5); scroll.rotation.y = Math.PI / 2; scroll.rotation.z = s > 0 ? 0 : Math.PI;
      g.add(scroll);
    }
    const eh = new THREE.Mesh(archPanel(1.4, 2.2), M.dark); eh.position.set(fx - 0.07, H + 2.2, 0); eh.rotation.y = -Math.PI / 2; g.add(eh);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 0.7, 10, 1, true), M.bronze); bell.position.set(fx + 0.3, H + 3.4, 0); g.add(bell);
    this.put(g, new THREE.SphereGeometry(0.3, 8, 6), M.sillar, fx + 0.3, H + 5.7, 0);
    this.put(g, sbox(0.08, 1.1, 0.08), M.iron, fx + 0.3, H + 6.4, 0);
    this.put(g, sbox(0.08, 0.08, 0.6), M.iron, fx + 0.3, H + 6.6, 0);
    // porch: three arches on granite columns
    const porch = new THREE.Group();
    porch.position.set(fx - 3.2, 0, 0);
    porch.rotation.y = -Math.PI / 2;
    g.add(porch);
    for (let k = -1; k <= 1; k++) {
      const ar = new THREE.Mesh(archRing(1.35, 0.3, 0.5), M.sillar); ar.position.set(k * 3.1, 3.4, 0); porch.add(ar);
    }
    for (let k = -2; k <= 1; k++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 3.4, 12), M.sillar); col.position.set((k + 0.5) * 3.1, 1.7, 0); porch.add(col);
    }
    const pb = new THREE.Mesh(sbox(10, 1.1, 0.55, 1.6), M.cal); pb.position.set(0, 5.35, 0); porch.add(pb);
    const pr = new THREE.Mesh(sbox(10.2, 0.2, 3.6, 2.6), M.teja); pr.position.set(0, 6.0, -1.6); pr.rotation.x = 0.28; porch.add(pr);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.2), M.wood); door.position.set(fx - 0.04, 2.1, 0); door.rotation.y = -Math.PI / 2; g.add(door);
    // lantern dome over the east part
    this.put(g, new THREE.CylinderGeometry(3.0, 3.0, 2.4, 8), M.cal, L * 0.45, H + 2.2, 0);
    this.put(g, new THREE.SphereGeometry(3.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.teja, L * 0.45, H + 3.4, 0);
    this.put(g, new THREE.CylinderGeometry(0.7, 0.7, 1.4, 8), M.cal, L * 0.45, H + 6.8, 0);
    this.put(g, new THREE.ConeGeometry(0.9, 0.9, 8), M.teja, L * 0.45, H + 7.9, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1), M.glass);
      w.position.set(L * 0.45 + Math.cos(a) * 3.02, H + 2.2, Math.sin(a) * 3.02); w.rotation.y = -a + Math.PI / 2; g.add(w);
    }
    // columns collide
    for (let k = -2; k <= 1; k++) {
      const p = new THREE.Vector3(fx - 3.2, 0, (k + 0.5) * 3.1).applyMatrix4(g.matrixWorld);
      this.circle(p.x, p.z, 0.3, 4);
    }
    const front = new THREE.Vector3(fx - 8, 0, 0).applyMatrix4(g.matrixWorld);
    this.poi.sanGregorio = { x: front.x, z: front.z };
    // in by the west door, under the porch (venues.js: the nave, the dome, the retablo of San Gregorio)
    { g.updateMatrixWorld(true); const out = new THREE.Vector3(fx - 1.0, 0, 0).applyMatrix4(g.matrixWorld), inn = new THREE.Vector3(fx + 3, 0, 0).applyMatrix4(g.matrixWorld), l = Math.hypot(out.x - inn.x, out.z - inn.z) || 1;
      (this.poi.venues || (this.poi.venues = [])).push({ kind: 'sangregorio', name: 'Iglesia de San Gregorio', sub: 'Plaza de San Gregorio', x: out.x, z: out.z, fx: inn.x, fz: inn.z, seed: 13, nx: (out.x - inn.x) / l, nz: (out.z - inn.z) / l }); }
    // bust of Juan Durán Palomares facing the church + Tarteso centre totem
    this.poi.bustDuran = { x: front.x - 1, z: front.z, face: Math.atan2(ob.cx - front.x, ob.cz - front.z) };
    const totem = new THREE.Group();
    const tt = new THREE.Mesh(sbox(1.2, 2.4, 0.25, 1), new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.6 }));
    tt.position.y = 1.2; totem.add(tt);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), new THREE.MeshStandardMaterial({ map: canvasTex(this.tartesoCanvas()), roughness: 0.6 }));
    label.position.set(0, 1.3, 0.13); totem.add(label);
    const tp = new THREE.Vector3(fx - 6, 0, W + 2.5).applyMatrix4(g.matrixWorld);
    totem.position.set(tp.x, 0, tp.z);
    totem.rotation.y = Math.atan2(-ux, -uz);
    this.root.add(totem);
    this.circle(tp.x, tp.z, 0.6, 2.4);
  }
  tartesoCanvas() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 470;
    const x = c.getContext('2d');
    x.fillStyle = '#2b2a28'; x.fillRect(0, 0, 256, 470);
    x.fillStyle = '#c9a44c'; x.fillRect(20, 20, 216, 6);
    x.font = 'bold 30px Georgia, serif'; x.textAlign = 'center';
    x.fillText('TARTESO', 128, 80);
    x.font = '18px Arial'; x.fillStyle = '#e8e2d0';
    ['Centro de', 'Interpretación', 'de la cultura', 'tartésica', '', 'El Turuñuelo', 'Guareña'].forEach((t, i) => x.fillText(t, 128, 130 + i * 30));
    // stylised face (Turuñuelo busts)
    x.strokeStyle = '#c9a44c'; x.lineWidth = 4;
    x.beginPath(); x.ellipse(128, 390, 34, 44, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(114, 382, 5, 0, 7); x.arc(142, 382, 5, 0, 7); x.fill();
    return c;
  }

  // ================================================================ Ermita de San Isidro (Pantano de San Roque)
  ermita([x, z]) {
    const b = this.building(x, z);
    if (!b) return;
    this.claim(b);
    const M = this.mat;
    const ob = orientedRect(b.ring);
    let ux = Math.cos(ob.ang), uz = Math.sin(ob.ang), L = ob.hw, W = ob.hd;
    if (W > L) { [L, W] = [W, L]; [ux, uz] = [-uz, ux]; }
    const g = this.frame(ob.cx, ob.cz, ux, uz);
    const nw = W * 0.55, H = 6.5;
    // raised forecourt with steps
    this.put(g, sbox(L * 2 + 2, 0.8, W * 2 + 2, 2), M.sillar, 0, 0.4, 0);
    for (let s = 0; s < 4; s++) this.put(g, sbox(0.35, 0.2 * (s + 1), 5, 1), M.sillar, -L - 1.2 - (3 - s) * 0.35, 0.1 * (s + 1), 0);
    this.put(g, sbox(L * 2 - 1, H, nw * 2, 3), M.cal, 0, 0.8 + H / 2, 0);
    this.put(g, gableRoof(L * 2 - 1, nw * 2, 2.6, 0.4), M.teja, 0, 0.8 + H, 0);
    this.put(g, gableEnd(nw * 2, 2.6), M.cal, L - 0.48, 0.8 + H, 0, Math.PI / 2);
    this.put(g, gableEnd(nw * 2, 2.6), M.cal, -L + 0.48, 0.8 + H, 0, -Math.PI / 2);
    // arcaded side porches (portales)
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const px = -L + 2 + (k * (L * 2 - 4)) / 4;
        this.put(g, sbox(0.45, 3.2, 0.45, 1), M.cal, px, 0.8 + 1.6, s * (nw + 2.4));
      }
      const pr = this.put(g, sbox(L * 2 - 2, 0.2, 2.9, 2.6), M.teja, 0, 0.8 + 3.6, s * (nw + 1.3));
      pr.rotation.x = s * 0.25;
    }
    // bell-gable with three openings and one bell
    const fx = -L + 0.45;
    this.put(g, sbox(0.6, 3.4, 4.4, 1.6), M.cal, fx, 0.8 + H + 2.2, 0);
    for (let k = -1; k <= 1; k++) {
      const op = new THREE.Mesh(archPanel(0.9, 1.5), M.dark);
      op.position.set(fx - 0.32, 0.8 + H + 1.3 + (k === 0 ? 0.9 : 0), k * 1.3);
      op.rotation.y = -Math.PI / 2; g.add(op);
    }
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.55, 10, 1, true), M.bronze); bell.position.set(fx, 0.8 + H + 2.7, 0); g.add(bell);
    const door = new THREE.Mesh(archPanel(1.8, 3.2), M.wood); door.position.set(fx - 0.33, 0.8, 0); door.rotation.y = -Math.PI / 2; g.add(door);
    this.put(g, sbox(0.1, 1.2, 0.1), M.iron, fx, 0.8 + H + 4.5, 0);
    this.put(g, sbox(0.1, 0.1, 0.7), M.iron, fx, 0.8 + H + 4.8, 0);
    const front = new THREE.Vector3(-L - 6, 0, 0).applyMatrix4(g.matrixWorld);
    this.poi.ermita = { x: front.x, z: front.z };
  }

  // ================================================================ Mercado de Abastos (1924-25): sign + tweak
  mercado([x, z]) {
    const b = this.building(x, z);
    if (!b) return;
    this.overrides.set(b.id, { style: 'color', tint: [0.96, 0.86, 0.66], minFloors: 2 });
    const c = ringCentroid(b.ring);
    this.poi.mercado = { x: c[0], z: c[1] };
    mercadoFront(this, c[0], c[1]);
  }

  // ================================================================ Plaza de España: cast-iron lamps, benches, trees
  plaza() {
    const plaza = this.map.areas.find((a) => a.name === 'Plaza de España');
    if (!plaza) return;
    const r = plaza.ring;
    const [cx, cz] = ringCentroid(r);
    const M = this.mat;
    // fernandina lamp: 4 arms
    const lampG = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 4.2, 10), M.iron); post.position.y = 2.1; lampG.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 10), M.iron); base.position.y = 0.45; lampG.add(base);
    const heads = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), M.iron); arm.position.set(Math.cos(a) * 0.45, 4.1, Math.sin(a) * 0.45); arm.rotation.y = -a; lampG.add(arm);
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.5, 6), makeNightGlowMaterial(0xfff0cc, { dayLevel: 0.85, nightLevel: 2.4 }));
      lan.position.set(Math.cos(a) * 0.9, 4.25, Math.sin(a) * 0.9); lampG.add(lan);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 6), M.iron); cap.position.set(Math.cos(a) * 0.9, 4.6, Math.sin(a) * 0.9); lampG.add(cap);
      heads.push([Math.cos(a) * 0.9, 4.25, Math.sin(a) * 0.9]);
    }
    lampG.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    const spots = [];
    const [x0, z0, x1, z1] = [Math.min(...r.filter((_, i) => i % 2 === 0)), Math.min(...r.filter((_, i) => i % 2)), Math.max(...r.filter((_, i) => i % 2 === 0)), Math.max(...r.filter((_, i) => i % 2))];
    for (let gx = x0 + 6; gx < x1 - 4; gx += 12) for (let gz = z0 + 6; gz < z1 - 4; gz += 12) {
      if (pointInRing(gx, gz, r) && !this.map.buildingAt(gx, gz) && !this.map.roadAt(gx, gz, 1.5)) spots.push([gx, gz]);
    }
    const fu = this.map.pois.find((q) => q.kind === 'amenity:fountain' && pointInRing(q.x, q.z, r)); // (not by the fountain)
    for (const [lx, lz] of spots.filter(([sx, sz]) => !fu || Math.hypot(sx - fu.x, sz - fu.z) > 8).slice(0, 8)) {
      const l = lampG.clone(); l.position.set(lx, 0, lz); this.root.add(l);
      this.circle(lx, lz, 0.35, 4);
      for (const h of heads) this.world.lampPoints.push(lx + h[0], h[1], lz + h[2]);
    }
    this.poi.plaza = { x: cx, z: cz };
  }

  // ================================================================ Gas station (Sangar, Ctra. de Don Benito)
  gasStation() {
    const p = this.map.pois.find((p) => p.kind === 'amenity:fuel' && /Sangar/.test(p.name));
    if (!p) return;
    const q = this.map.nearestEdge(p.x, p.z, 40, (e) => e.drive && e.cls === 'primary');
    if (!q) return;
    const d = this.map.sample(q.edge, q.s, {});
    let nx = -d.dz, nz = d.dx;
    if ((p.x - q.x) * nx + (p.z - q.z) * nz < 0) { nx = -nx; nz = -nz; }
    const off = q.edge.w / 2 + 7;
    const cx = q.x + nx * off, cz = q.z + nz * off;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = Math.atan2(d.dx, d.dz);
    this.root.add(g);
    g.updateMatrixWorld(true);
    const M = this.mat;
    const canopy = new THREE.Mesh(sbox(8, 0.8, 16, 2), M.white); canopy.position.y = 5.2; g.add(canopy);
    const band = new THREE.Mesh(sbox(8.1, 0.35, 16.1, 2), new THREE.MeshStandardMaterial({ color: 0xd4202c, roughness: 0.5 })); band.position.y = 4.95; g.add(band);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 15.8), makeNightGlowMaterial(0xfaf6ea, { dayLevel: 0.9, nightLevel: 1.8 }));
    under.rotation.x = Math.PI / 2; under.position.y = 4.79; g.add(under);
    for (const sx of [-2, 2]) for (const sz of [-5, 5]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.8, 0.35), M.white); c.position.set(sx, 2.4, sz); g.add(c);
      const w = g.localToWorld(new THREE.Vector3(sx, 0, sz));
      this.circle(w.x, w.z, 0.3, 5);
    }
    for (const sz of [-5, 5]) {
      const pump = new THREE.Mesh(sbox(0.7, 1.8, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.4 })); pump.position.set(0, 0.9, sz); g.add(pump);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), makeNightGlowMaterial(0x6fd0ff, { dayLevel: 0.6, nightLevel: 1.6 })); scr.position.set(0.36, 1.4, sz); scr.rotation.y = Math.PI / 2; g.add(scr);
      const w = g.localToWorld(new THREE.Vector3(0, 0, sz));
      this.circle(w.x, w.z, 0.7, 2);
    }
    const tot = new THREE.Mesh(sbox(0.5, 6, 1.8, 1), new THREE.MeshStandardMaterial({ color: 0xd4202c, roughness: 0.5 })); tot.position.set(-6, 3, 9); g.add(tot);
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: canvasTex(textCanvas('GASOLINERA', { w: 512, h: 512, bg: '#d4202c', fg: '#ffffff', font: 'bold 70px Arial' })) }));
    tl.position.set(-5.74, 4.8, 9); tl.rotation.y = Math.PI / 2; g.add(tl);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.poi.gasolinera = { x: cx, z: cz };
  }

  // ================================================================ Cooperativa del Campo San Pedro (tanks)
  tanks() {
    for (const a of this.map.areas) {
      if (a.kind !== 'man_made:storage_tank') continue;
      const [cx, cz] = ringCentroid(a.ring);
      let r = 0;
      for (let i = 0; i < a.ring.length; i += 2) r = Math.max(r, Math.hypot(a.ring[i] - cx, a.ring[i + 1] - cz));
      r = Math.min(r, 8);
      const h = 9 + r * 0.6;
      this.add(new THREE.CylinderGeometry(r, r, h, 24), this.mat.steel, cx, h / 2, cz);
      this.add(new THREE.ConeGeometry(r * 1.02, r * 0.35, 24), this.mat.steel, cx, h + r * 0.17, cz);
      this.circle(cx, cz, r, h);
    }
    const coop = this.map.areas.find((a) => /Cooperativa/.test(a.name));
    if (coop) { const [cx, cz] = ringCentroid(coop.ring); this.poi.cooperativa = { x: cx, z: cz }; }
  }

  // ================================================================ Estadio Municipal "La Noria": floodlights + stand
  stadium() {
    const pitches = this.map.areas.filter((a) => a.kind === 'leisure:pitch' && a.sport === 'soccer');
    let best = null;
    for (const a of pitches) { const ar = Math.abs(ringArea(a.ring)); if (!best || ar > best.ar) best = { a, ar }; }
    if (!best) return;
    const ob = orientedRect(best.a.ring);
    let ux = Math.cos(ob.ang), uz = Math.sin(ob.ang), L = ob.hw, W = ob.hd;
    if (W > L) { [L, W] = [W, L]; [ux, uz] = [-uz, ux]; }
    const g = this.frame(ob.cx, ob.cz, ux, uz);
    const M = this.mat;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.put(g, new THREE.CylinderGeometry(0.2, 0.35, 22, 8), M.steel, sx * (L + 3), 11, sz * (W + 3));
      const head = this.put(g, sbox(2.4, 1.4, 0.4, 1), M.steel, sx * (L + 3), 22, sz * (W + 3));
      head.lookAt(g.localToWorld(new THREE.Vector3(0, 0, 0)));
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), makeNightGlowMaterial(0xffffff, { dayLevel: 0.7, nightLevel: 3 }));
      lamp.position.set(sx * (L + 2.7), 22, sz * (W + 2.7)); lamp.lookAt(g.localToWorld(new THREE.Vector3(0, 0, 0)));
      g.add(lamp);
    }
    // stand (grada) along one side
    for (let s = 0; s < 6; s++) this.put(g, sbox(L * 1.4, 0.45, 0.8, 1), M.white, 0, 0.225 + s * 0.45, W + 2 + s * 0.8);
    const roof = this.put(g, sbox(L * 1.45, 0.2, 5.6, 2), new THREE.MeshStandardMaterial({ color: 0x1f5aa0, roughness: 0.5 }), 0, 6.4, W + 4.2);
    roof.rotation.x = -0.08;
    for (let k = 0; k < 5; k++) this.put(g, new THREE.CylinderGeometry(0.1, 0.1, 6.4, 6), M.steel, -L * 0.7 + k * (L * 0.35), 3.2, W + 6.8);
    // goals
    for (const sx of [-1, 1]) {
      this.put(g, sbox(0.12, 2.44, 0.12), M.white, sx * (L - 0.5), 1.22, -3.66);
      this.put(g, sbox(0.12, 2.44, 0.12), M.white, sx * (L - 0.5), 1.22, 3.66);
      this.put(g, sbox(0.12, 0.12, 7.44), M.white, sx * (L - 0.5), 2.44, 0);
    }
    // field lines
    const lm = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 });
    const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lm); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); g.add(m); };
    line(L * 2 - 2, 0.12, 0, -W + 1); line(L * 2 - 2, 0.12, 0, W - 1); line(0.12, W * 2 - 2, -L + 1, 0); line(0.12, W * 2 - 2, L - 1, 0); line(0.12, W * 2 - 2, 0, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.9, 9.05, 40), lm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    this.poi.estadio = { x: ob.cx, z: ob.cz };
  }

  // ================================================================ services: Guardia Civil, Centro de Salud, Correos
  services() {
    const gc = this.map.areas.find((a) => a.kind === 'landuse:military');
    if (gc) {
      const [cx, cz] = ringCentroid(gc.ring);
      this.poi.guardia = { x: cx, z: cz };
      this.flagPole(cx, cz, 'es');
      this.signTotem(cx + 3, cz, 'GUARDIA CIVIL', '#1f5a2e', '#ffffff');
    }
    const cs = this.map.areas.find((a) => a.kind === 'amenity:clinic');
    if (cs) {
      const [cx, cz] = ringCentroid(cs.ring);
      this.poi.salud = { x: cx, z: cz };
      this.signTotem(cx, cz, 'CENTRO DE SALUD', '#1a7a46', '#ffffff');
    }
  }
  flagPole(x, z, kind) {
    const pole = this.add(new THREE.CylinderGeometry(0.06, 0.08, 9, 8), this.mat.steel, x, 4.5, z);
    const fg = new THREE.PlaneGeometry(2.2, 1.4, 14, 5);
    fg.translate(1.1, -0.7, 0);
    const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: canvasTex(flagCanvas(kind)), side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(x, 8.9, z);
    flag.castShadow = true;
    this.root.add(flag);
    this.flags.push({ mesh: flag, base: fg.attributes.position.array.slice(), phase: x });
    this.circle(x, z, 0.2, 9);
  }
  signTotem(x, z, txt, bg, fg) {
    // free spot nearby (outside buildings)
    let px = x, pz = z;
    for (let k = 0; k < 30 && this.map.buildingAt(px, pz); k++) { px = x + Math.cos(k) * (2 + k); pz = z + Math.sin(k) * (2 + k); }
    const g = new THREE.Group();
    const post = new THREE.Mesh(sbox(0.25, 2.8, 0.25), this.mat.steel); post.position.y = 1.4; g.add(post);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.8), new THREE.MeshStandardMaterial({ map: canvasTex(textCanvas(txt, { w: 700, h: 200, bg, fg, font: 'bold 64px Arial' })), side: THREE.DoubleSide, roughness: 0.5 }));
    board.position.y = 2.6; g.add(board);
    g.position.set(px, 0, pz);
    const q = this.map.nearestEdge(px, pz, 60, (e) => e.drive);
    if (q) g.rotation.y = Math.atan2(q.x - px, q.z - pz);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.root.add(g);
    this.circle(px, pz, 0.3, 3);
  }

  // ================================================================ town entry signs on main roads
  entrySigns() {
    const map = this.map;
    const geo = this.signQuad('entrada', 1.6, 1.6);
    const done = [];
    for (const e of map.edges) {
      if (!e.drive || !['primary', 'tertiary', 'secondary', 'unclassified'].includes(e.cls)) continue;
      const aIn = map.inTown(e.pts[0], e.pts[1]);
      const n = e.pts.length / 2;
      const bIn = map.inTown(e.pts[n * 2 - 2], e.pts[n * 2 - 1]);
      if (aIn === bIn) continue;
      // find crossing point along the edge
      let s0 = 0, s1 = e.len;
      for (let it = 0; it < 18; it++) {
        const sm = (s0 + s1) / 2;
        const p = map.sample(e, sm, {});
        if (map.inTown(p.x, p.z) === aIn) s0 = sm; else s1 = sm;
      }
      const s = aIn ? Math.min(e.len, s0 + 6) : Math.max(0, s0 - 6);
      const p = map.sample(e, s, {});
      if (done.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 120)) continue;
      done.push([p.x, p.z]);
      // incoming direction (towards town): right side of incoming driver
      const dirIn = aIn ? -1 : 1;
      const fx = p.dx * dirIn, fz = p.dz * dirIn;
      const rx = -fz, rz = fx; // right of driver = (-fz, fx)
      const off = e.w / 2 + 1.2;
      const x = p.x + rx * off, z = p.z + rz * off;
      const grp = new THREE.Group();
      for (const s2 of [-0.55, 0.55]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), this.mat.steel);
        post.position.set(s2, 1.3, 0); grp.add(post);
      }
      const board = new THREE.Mesh(geo, this.signMat); board.position.set(0, 2.3, 0.03); grp.add(board);
      grp.position.set(x, 0, z);
      grp.rotation.y = Math.atan2(-fx, -fz); // face the incoming driver
      grp.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.root.add(grp);
      this.circle(x, z, 0.4, 3);
    }
  }

  // called after vegetation; statues need the character module (set by game)
  finish() {}

  update(dt, night) {
    const t = shared.uTime.value;
    updateWater(this, dt, night);
    // floodlights on the stone monuments at night (Santa María's walls and tower glow warm)
    for (const k of ['mamp', 'sillar']) {
      const m = this.mat[k];
      if (!m.emissiveMap && m.map) { m.emissiveMap = m.map; m.emissive.setRGB(1, 0.8, 0.56); m.needsUpdate = true; }
      m.emissiveIntensity = night * 0.34;
    }
    // (and the church doors in the same floodlight)
    for (const d of this.churchDoors || []) {
      const m = d.mats.outer;
      if (!m.emissiveMap && m.map) { m.emissiveMap = m.map; m.emissive.setRGB(1, 0.8, 0.56); m.needsUpdate = true; }
      m.emissiveIntensity = night * 0.3;
    }
    for (const f of this.flags) {
      const p = f.mesh.geometry.attributes.position;
      const b = f.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];
        p.setZ(i, b[i * 3 + 2] + Math.sin(x * 3 - t * 5 + f.phase) * 0.12 * x);
      }
      p.needsUpdate = true;
    }
    for (const a of this.animated) {
      if (a.kind === 'clock' && this.hour !== undefined) {
        const h = this.hour % 12, m = (this.hour % 1) * 60;
        a.hh.rotation.z = -(h / 12) * Math.PI * 2;
        a.mh.rotation.z = -(m / 60) * Math.PI * 2;
      } else if (a.kind === 'bell') {
        a.mesh.rotation.x = this.bellSwing ? Math.sin(t * 3 + a.phase) * 0.5 * this.bellSwing : 0;
      }
    }
    if (this.bellSwing) this.bellSwing = Math.max(0, this.bellSwing - dt * 0.2);
  }
}
