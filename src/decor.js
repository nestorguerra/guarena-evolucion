// The things you buy for your house, as 3D models (the same ones the shops have on display), and decorating: carry
// one from the inventory, point where it goes (the floor, a table, a wall), turn it and leave it there. What you
// place is kept in the save, stands in the way like any furniture, and can be picked up again or switched on.
import * as THREE from 'three';
import { pictureTexture, rugTexture } from './housekit.js';
import { ITEMS, lc } from './items.js';

const M = {};
const mat = (key, make) => M[key] || (M[key] = make());
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, ...o });
const WOOD = () => mat('wood', () => std(0x7a4e2c, { roughness: 0.6 }));
const DARK = () => mat('dark', () => std(0x3a2616, { roughness: 0.55 }));
const PALE = () => mat('pale', () => std(0xc8a47a, { roughness: 0.6 }));
const IRON = () => mat('iron', () => std(0x2a2a2c, { roughness: 0.45, metalness: 0.6 }));
const WHITE = () => mat('white', () => std(0xf0eee8, { roughness: 0.45 }));
const TERRA = () => mat('terra', () => std(0xb5552e, { roughness: 0.85 }));
const LEAF = () => mat('leaf', () => std(0x3f7a35, { roughness: 0.85 }));
const LEAF2 = () => mat('leaf2', () => std(0x5a9a40, { roughness: 0.85 }));
const GLOW = () => mat('glow', () => std(0xfff2dc, { emissive: 0xffd8a0, emissiveIntensity: 0.9, roughness: 0.9, side: THREE.DoubleSide }));

function box(g, m, w, h, d, x, y, z, ry = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; }
function cyl(g, m, rt, rb, h, x, y, z, seg = 14) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; }
function ball(g, m, r, x, y, z, seg = 10) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FABRIC = [0x6a7f9a, 0x8a3a3a, 0x3a5a4a, 0xc8a060, 0x5a4a6a, 0x9a6a4a];

// every model: front towards +z, standing on y = 0 (wall pieces: back on z = 0, centred at y = 0)
// returns { obj, w, d, h } (footprint for the collider)
export function decorModel(id, seed = 1) {
  const g = new THREE.Group();
  const r = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const fab = () => mat('fab' + (seed % FABRIC.length), () => std(FABRIC[seed % FABRIC.length], { roughness: 0.95 }));
  let w = 0.5, d = 0.5, h = 1;
  switch (id) {
    case 'planta': {
      cyl(g, TERRA(), 0.2, 0.15, 0.36, 0, 0.18, 0);
      for (let i = 0; i < 7; i++) { const a = i * 0.9, l = 0.35 + r(i) * 0.25; const lf = ball(g, i % 2 ? LEAF() : LEAF2(), 0.16, Math.sin(a) * l * 0.5, 0.55 + r(i + 9) * 0.5, Math.cos(a) * l * 0.5, 8); lf.scale.set(1.3, 0.5, 0.8); lf.rotation.y = a; }
      w = d = 0.45; h = 1.1; break;
    }
    case 'geranios': {
      box(g, TERRA(), 0.7, 0.22, 0.24, 0, 0.11, 0);
      for (let i = 0; i < 9; i++) ball(g, LEAF(), 0.09, -0.3 + i * 0.075, 0.28, (r(i) - 0.5) * 0.1, 7);
      const red = mat('gera', () => std(0xd8263a, { roughness: 0.7 }));
      for (let i = 0; i < 12; i++) ball(g, red, 0.045, -0.3 + r(i + 3) * 0.6, 0.36 + r(i + 5) * 0.08, (r(i + 7) - 0.5) * 0.14, 6);
      w = 0.7; d = 0.26; h = 0.45; break;
    }
    case 'flores': {
      cyl(g, mat('vase', () => std(0x2a5a8a, { roughness: 0.3 })), 0.06, 0.08, 0.26, 0, 0.13, 0);
      const cols = [0xf4f0e6, 0xe8456a, 0xf2d230, 0xd8263a];
      for (let i = 0; i < 7; i++) { const a = i * 0.9; cyl(g, LEAF(), 0.006, 0.006, 0.3, Math.sin(a) * 0.04, 0.36, Math.cos(a) * 0.04, 4); ball(g, mat('fl' + (i % 4), () => std(cols[i % 4], { roughness: 0.7 })), 0.045, Math.sin(a) * 0.08, 0.5 + r(i) * 0.06, Math.cos(a) * 0.08, 7); }
      w = d = 0.2; h = 0.56; break;
    }
    case 'cactus': {
      cyl(g, TERRA(), 0.08, 0.06, 0.12, 0, 0.06, 0);
      cyl(g, LEAF(), 0.05, 0.055, 0.26, 0, 0.25, 0, 10); cyl(g, LEAF(), 0.028, 0.03, 0.1, 0.06, 0.28, 0, 8).rotation.z = -0.9;
      w = d = 0.18; h = 0.4; break;
    }
    case 'lampara': {
      cyl(g, IRON(), 0.16, 0.18, 0.03, 0, 0.015, 0); cyl(g, IRON(), 0.012, 0.012, 1.45, 0, 0.74, 0, 6);
      const sh = cyl(g, GLOW(), 0.14, 0.24, 0.26, 0, 1.52, 0, 16); sh.userData.lamp = true;
      w = d = 0.4; h = 1.65; break;
    }
    case 'lamparita': {
      cyl(g, mat('cer', () => std(0xd8c0a0, { roughness: 0.4 })), 0.06, 0.08, 0.2, 0, 0.1, 0);
      const sh = cyl(g, GLOW(), 0.08, 0.13, 0.14, 0, 0.27, 0, 14); sh.userData.lamp = true;
      w = d = 0.26; h = 0.34; break;
    }
    case 'alfombra': {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2).rotateX(-Math.PI / 2), mat('rug' + (seed % 3), () => new THREE.MeshStandardMaterial({ map: rugTexture(seed % 3 + 5), roughness: 1 })));
      rug.position.y = 0.012; rug.receiveShadow = true; g.add(rug);
      w = 1.8; d = 1.2; h = 0.02; break;
    }
    case 'cuadro': {
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.46), mat('pic' + (seed % 4), () => new THREE.MeshStandardMaterial({ map: pictureTexture('paisaje', 40 + seed % 4), roughness: 0.6 })));
      pic.position.z = 0.025; g.add(pic);
      box(g, DARK(), 0.72, 0.52, 0.03, 0, 0, 0.01);
      w = 0.72; d = 0.05; h = 0.52; break;
    }
    case 'espejo': {
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.76), mat('mirror', () => new THREE.MeshStandardMaterial({ color: 0xd8dee4, roughness: 0.04, metalness: 1 })));
      mir.position.z = 0.026; g.add(mir);
      box(g, PALE(), 0.54, 0.84, 0.03, 0, 0, 0.01);
      w = 0.54; d = 0.05; h = 0.84; break;
    }
    case 'reloj': {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), mat('clockF', () => new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (x) => { x.fillStyle = '#f6f2e6'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.fillStyle = '#222'; x.font = 'bold 15px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; x.fillText(String(i), 64 + Math.sin(a) * 48, 64 - Math.cos(a) * 48); } }), roughness: 0.5 })));
      face.position.z = 0.03; g.add(face);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.018, 8, 28), DARK()); rim.position.z = 0.03; g.add(rim);
      const hh = box(g, IRON(), 0.012, 0.09, 0.005, 0, 0.04, 0.035); hh.userData.hand = 'h';
      const mh = box(g, IRON(), 0.008, 0.13, 0.005, 0, 0.06, 0.037); mh.userData.hand = 'm';
      w = 0.38; d = 0.05; h = 0.38; break;
    }
    case 'poster': {
      const t = mat('poster', () => new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(128, 180, (x) => { x.fillStyle = '#e8b93a'; x.fillRect(0, 0, 128, 180); x.fillStyle = '#b8302a'; x.fillRect(0, 118, 128, 62); x.fillStyle = '#1a1a1a'; x.font = 'bold 17px sans-serif'; x.textAlign = 'center'; x.fillText('FERIA Y', 64, 30); x.fillText('FIESTAS', 64, 50); x.font = 'bold 13px sans-serif'; x.fillText('SAN GREGORIO', 64, 74); x.fillStyle = '#fbfaf6'; x.font = 'bold 18px sans-serif'; x.fillText('GUAREÑA', 64, 150); }) }));
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), t); pl.position.z = 0.01; g.add(pl);
      w = 0.5; d = 0.02; h = 0.7; break;
    }
    case 'sillon': {
      const f = fab();
      box(g, f, 0.78, 0.42, 0.78, 0, 0.21, 0); box(g, f, 0.78, 0.7, 0.18, 0, 0.77, -0.3); // seat, tall back
      for (const s of [-1, 1]) { box(g, f, 0.14, 0.26, 0.7, s * 0.34, 0.55, 0.02); box(g, f, 0.12, 0.3, 0.14, s * 0.33, 1.0, -0.26); } // arms, wings
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cyl(g, DARK(), 0.025, 0.02, 0.08, a * 0.33, 0.0, b * 0.33, 6);
      w = 0.8; d = 0.8; h = 1.12; break;
    }
    case 'sofa': {
      const f = fab();
      box(g, f, 2.0, 0.42, 0.86, 0, 0.21, 0); box(g, f, 2.0, 0.44, 0.2, 0, 0.64, -0.33);
      for (const s of [-1, 1]) box(g, f, 0.18, 0.26, 0.84, s * 0.91, 0.55, 0);
      const cu = mat('cush', () => std(0xe8dcc0, { roughness: 0.95 }));
      for (const x of [-0.55, 0, 0.55]) box(g, cu, 0.5, 0.1, 0.6, x, 0.47, 0.06);
      w = 2.0; d = 0.88; h = 0.86; break;
    }
    case 'mesa': {
      box(g, WOOD(), 1.4, 0.05, 0.8, 0, 0.75, 0);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, WOOD(), 0.06, 0.73, 0.06, a * 0.64, 0.365, b * 0.34);
      for (const s of [-1, 1]) { // two chairs tucked in
        const cz = s * 0.55;
        box(g, DARK(), 0.42, 0.04, 0.42, 0, 0.45, cz);
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, DARK(), 0.035, 0.45, 0.035, a * 0.18, 0.225, cz + b * 0.18);
        box(g, DARK(), 0.42, 0.42, 0.03, 0, 0.68, cz + s * 0.2);
      }
      w = 1.4; d = 1.5; h = 0.9; break;
    }
    case 'mesita': {
      box(g, PALE(), 0.9, 0.04, 0.5, 0, 0.42, 0); box(g, PALE(), 0.84, 0.03, 0.44, 0, 0.12, 0);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, PALE(), 0.04, 0.42, 0.04, a * 0.42, 0.21, b * 0.22);
      w = 0.9; d = 0.5; h = 0.45; break;
    }
    case 'estanteria': {
      box(g, WOOD(), 1.0, 1.8, 0.03, 0, 0.9, -0.15);
      for (const s of [-1, 1]) box(g, WOOD(), 0.03, 1.8, 0.32, s * 0.485, 0.9, 0);
      const bc = [0x8a2a2a, 0x2a4a6a, 0xc8a060, 0x3a5a3a, 0xe8dcc0, 0x6a3a6a];
      for (let k = 0; k < 5; k++) {
        const y = 0.02 + k * 0.42;
        box(g, WOOD(), 1.0, 0.03, 0.32, 0, y, 0);
        if (k < 4) { let x = -0.44; while (x < 0.42) { const bw = 0.03 + r(x * 30 + k) * 0.04, bh = 0.24 + r(x * 17 + k) * 0.1; box(g, mat('bk' + ((x * 97 + k) & 7) % 6, () => std(bc[Math.floor(Math.random() * bc.length)], { roughness: 0.8 })), bw, bh, 0.2, x + bw / 2, y + 0.015 + bh / 2, 0.02); x += bw + 0.004; } }
      }
      w = 1.0; d = 0.34; h = 1.8; break;
    }
    case 'tele': {
      box(g, DARK(), 1.2, 0.45, 0.4, 0, 0.225, 0);
      box(g, mat('tvb', () => std(0x111114, { roughness: 0.3 })), 1.0, 0.6, 0.05, 0, 0.8, -0.05);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.54), new THREE.MeshStandardMaterial({ color: 0x0a0c10, emissive: 0x6a8aa8, emissiveIntensity: 0, roughness: 0.2 }));
      scr.position.set(0, 0.8, -0.02); scr.userData.screen = true; g.add(scr);
      box(g, mat('tvb', () => std(0x111114, { roughness: 0.3 })), 0.3, 0.03, 0.18, 0, 0.465, -0.05);
      w = 1.2; d = 0.42; h = 1.1; break;
    }
    case 'radio': {
      box(g, WOOD(), 0.36, 0.24, 0.16, 0, 0.12, 0);
      box(g, mat('grill', () => std(0xd8c8a0, { roughness: 0.9 })), 0.2, 0.14, 0.01, -0.06, 0.13, 0.081);
      for (const x of [0.1, 0.14]) cyl(g, IRON(), 0.02, 0.02, 0.02, x, 0.1, 0.085, 10).rotation.x = Math.PI / 2;
      w = 0.36; d = 0.16; h = 0.24; break;
    }
    case 'ventilador': {
      cyl(g, WHITE(), 0.16, 0.18, 0.04, 0, 0.02, 0); cyl(g, WHITE(), 0.02, 0.02, 1.0, 0, 0.52, 0, 8);
      const head = new THREE.Group(); head.position.set(0, 1.08, 0.04); g.add(head);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 6, 26), WHITE()); head.add(cage);
      const bl = new THREE.Group(); head.add(bl); bl.userData.spin = true;
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.01), mat('blade', () => std(0x9ab8d0, { roughness: 0.4 }))); b.position.set(Math.sin(i * 2.09) * 0.09, Math.cos(i * 2.09) * 0.09, 0); b.rotation.z = -i * 2.09; bl.add(b); }
      w = d = 0.42; h = 1.3; break;
    }
    case 'puff': {
      const o = cyl(g, fab(), 0.26, 0.26, 0.38, 0, 0.19, 0, 18);
      o.scale.set(1, 1, 1);
      w = d = 0.52; h = 0.4; break;
    }
    case 'cojines': {
      for (let i = 0; i < 3; i++) { const c = box(g, mat('cj' + i, () => std([0xc8a060, 0x8a3a3a, 0x3a5a7a][i], { roughness: 0.95 })), 0.36, 0.36, 0.1, (i - 1) * 0.3, 0.18, 0, (i - 1) * 0.2); c.rotation.x = -0.25; }
      w = 0.9; d = 0.3; h = 0.36; break;
    }
    default: { box(g, WOOD(), 0.4, 0.4, 0.4, 0, 0.2, 0); }
  }
  g.userData.decor = id;
  return { obj: g, w, d, h };
}

// ---------------------------------------------------------------- decorating your house
const _ray = new THREE.Raycaster(), _n = new THREE.Vector3(), _c = new THREE.Vector2(0, 0);

export class Decorator {
  constructor(game) {
    this.g = game;
    this.placing = null;   // { id, entry, ghost, ry, ok, at }
    this.items = [];       // placed in the house we are in: { rec, obj, box }
    this.house = null;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x7ee08a, transparent: true, opacity: 0.45, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.45, depthWrite: false });
    this.lookT = 0;
    this.looked = null;
  }
  get list() { const s = this.g.save; return s.homeDecor || (s.homeDecor = []); }

  // stepping into your house: everything you put there, where you left it
  enter(h) {
    this.house = h; this.items = [];
    const lv = h.levels || [h.collider];
    this.baseSegs = lv.map((c) => Array.from(c.segs));
    for (const rec of this.list) this.spawn(rec);
    this.rebuild();
  }
  leave() { this.cancel(); this.house = null; this.items = []; this.looked = null; }
  spawn(rec) {
    const h = this.house, m = decorModel(rec.id, rec.seed || 1);
    m.obj.position.set(h.origin.x + rec.x, rec.y, h.origin.z + rec.z);
    m.obj.rotation.y = rec.ry || 0;
    h.group.add(m.obj);
    const it = { rec, obj: m.obj, m };
    this.items.push(it);
    if (rec.on) this.switchOn(it, true);
    return it;
  }
  // the walls of each storey, plus the footprint of every piece standing on its floor
  rebuild() {
    const h = this.house;
    if (!h) return;
    const lv = h.levels || [h.collider];
    lv.forEach((col, i) => {
      const segs = this.baseSegs[i].slice();
      for (const it of this.items) {
        const d = ITEMS[it.rec.id];
        if (!d || d.place !== 'floor' || d.flat || (it.rec.lv || 0) !== i) continue;
        const { w, d: dd } = it.m, ry = it.rec.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
        const P = (a, b) => [it.obj.position.x + a * c + b * s, it.obj.position.z - a * s + b * c];
        const q = [P(-w / 2, -dd / 2), P(w / 2, -dd / 2), P(w / 2, dd / 2), P(-w / 2, dd / 2)];
        for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; segs.push(a[0], a[1], b[0], b[1], Math.max(0.5, it.m.h), -1); }
      }
      col._segs = segs;
      col.buildSegments();
    });
  }

  // ---------------------------------------------------------------- placing
  begin(entry) {
    const g = this.g, d = ITEMS[entry.id];
    if (!this.house || !d) return;
    this.cancel();
    const m = decorModel(entry.id, (this.list.length * 7 + 3) % 97);
    m.obj.traverse((o) => { if (o.isMesh) { o.userData.mat0 = o.material; o.material = this.ghostMat; o.castShadow = false; } });
    this.house.group.add(m.obj);
    this.placing = { id: entry.id, entry, m, ghost: m.obj, ry: g.player.heading + Math.PI, ok: null, seed: (this.list.length * 7 + 3) % 97 };
    if (g.weapons) g.weapons.select('punos');
  }
  cancel() {
    const P = this.placing;
    if (!P) return;
    if (P.ghost.parent) P.ghost.parent.remove(P.ghost);
    this.placing = null;
  }
  // where the camera points, inside the house (skipping the ghost itself)
  pick(maxD = 5) {
    const g = this.g, h = this.house;
    _ray.setFromCamera(_c, g.camera);
    _ray.far = maxD + (g.cam.fp ? 0 : 4);
    const hits = _ray.intersectObject(h.group, true);
    for (const x of hits) {
      if (this.placing && isChild(x.object, this.placing.ghost)) continue;
      if (x.object.isSprite || !x.face) continue;
      return x;
    }
    return null;
  }
  update(dt, input) {
    const g = this.g, P = this.placing, p = g.player;
    if (!this.house) return;
    // spinning fans, the clock telling the time
    for (const it of this.items) {
      if (it.rec.on && it.rec.id === 'ventilador') it.obj.traverse((o) => { if (o.userData.spin) o.rotation.z += dt * 18; });
      if (it.rec.id === 'reloj') it.obj.traverse((o) => { if (o.userData.hand) { const hr = g.sky.hour; o.rotation.z = -(o.userData.hand === 'h' ? (hr % 12) / 12 : hr % 1) * Math.PI * 2; } });
    }
    if (!P) {
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookT = 0.15; this.looked = this.lookAt(); }
      // F (Y on the pad): back to the inventory
      if (this.looked && this.switchable(this.looked) && input.enter) this.pickUp(this.looked);
      return;
    }
    const d = ITEMS[P.id];
    // rotate: wheel / Q-X / LB-RB / the touch weapon button
    const rot = (input.mouse.wheel || 0) + (input.hit('KeyQ') ? -1 : 0) + (input.hit('KeyX') ? 1 : 0) + (input.gpPressed(4) ? -1 : 0) + (input.gpPressed(5) ? 1 : 0) + (input.touch.pressed.has('weapon') ? 1 : 0);
    if (rot) P.ry += rot * (Math.PI / 8);
    const hit = this.pick(5);
    let ok = false;
    const floorY = this.floorY();
    if (hit) {
      _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      const pt = hit.point;
      if (d.place === 'wall') {
        if (Math.abs(_n.y) < 0.3) {
          const y = Math.min(floorY + 2.3, Math.max(floorY + 0.9, pt.y));
          P.ghost.position.set(pt.x + _n.x * 0.005, y, pt.z + _n.z * 0.005);
          P.ghost.rotation.y = Math.atan2(_n.x, _n.z);
          ok = true;
        }
      } else if (_n.y > 0.7) {
        const onFloor = Math.abs(pt.y - floorY) < 0.12;
        if (d.place === 'top' || onFloor) {
          P.ghost.position.set(pt.x, onFloor ? floorY : pt.y, pt.z);
          P.ghost.rotation.y = P.ry;
          ok = onFloor && d.place === 'floor' && !d.flat ? this.fits(P, pt.x, pt.z) : true;
          if (Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z) < (d.place === 'floor' && !d.flat ? Math.max(P.m.w, P.m.d) * 0.5 + 0.3 : 0.2)) ok = false; // not on your own feet
        }
      }
      P.ghost.visible = true;
    } else P.ghost.visible = false;
    if (ok !== P.ok) { P.ok = ok; P.ghost.traverse((o) => { if (o.isMesh) o.material = ok ? this.ghostMat : this.badMat; }); }
    const place = input.interact || input.mouse.leftPressed || input.gpPressed(0);
    if (input.hit('Escape') || input.mouse.rightPressed || input.gpPressed(1) || input.touch.pressed.has('enter')) { this.cancel(); g.hud.notify('Lo dejas en el inventario.', 'info', 2); return 'cancel'; }
    if (place) {
      // the key is spent here (not also on whatever is next to it)
      input.pressed.delete('KeyE'); input.mouse.leftPressed = false;
      this.tryPlace();
    }
  }
  tryPlace() {
    const g = this.g, P = this.placing;
    if (!P) return;
    const d = ITEMS[P.id];
    if (!P.ok || !P.ghost.visible) { g.audio.sfx('ui_back', { vol: 0.5 }); g.hud.notify(d.place === 'wall' ? 'Apunta a una pared.' : d.place === 'top' ? 'Apunta a una mesa, una estantería o el suelo.' : 'Ahí no cabe: busca un hueco libre en el suelo.', 'info', 2); return; }
    this.commit();
  }
  // the storey you are on
  floorY() { const h = this.house, p = this.g.player; return h.levels && p.pos.y > h.split ? (h.floorY ? h.floorY(h.origin.x - 99, h.origin.z - 99, 99) : 3.1) : 0; }
  fits(P, x, z) {
    const h = this.house, col = h.levels ? h.levels[this.g.player.pos.y > h.split ? 1 : 0] : h.collider;
    const r = Math.min(P.m.w, P.m.d) * 0.5 * 0.85;
    const pos = { x, z };
    col.resolveCircle(pos, r);
    if (Math.hypot(pos.x - x, pos.z - z) > 0.02) return false;
    // the far corners too (a long sofa): no wall across it
    const c = Math.cos(P.ry), s = Math.sin(P.ry), hw = P.m.w / 2 - 0.05, hd = P.m.d / 2 - 0.05;
    for (const [a, b] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) if (col.crosses && col.crosses(x, z, x + a * c + b * s, z - a * s + b * c, 0.3)) return false;
    return x > h.bounds.x0 + 0.1 && x < h.bounds.x1 - 0.1 && z > h.bounds.z0 + 0.1 && z < h.bounds.z1 - 0.1;
  }
  commit() {
    const g = this.g, P = this.placing, h = this.house;
    const o = P.ghost;
    const rec = { id: P.id, x: +(o.position.x - h.origin.x).toFixed(3), y: +o.position.y.toFixed(3), z: +(o.position.z - h.origin.z).toFixed(3), ry: +o.rotation.y.toFixed(3), lv: o.position.y > (h.split || 99) ? 1 : 0, seed: P.seed };
    this.cancel();
    if (!g.inv.take(rec.id)) return;
    this.list.push(rec);
    this.spawn(rec);
    this.rebuild();
    g.persist();
    g.audio.sfx('pickup', { vol: 0.6 });
    g.hud.notify(`${ITEMS[rec.id].name}: en su sitio.`, 'ok', 2);
  }

  // ---------------------------------------------------------------- the pieces already in the house
  lookAt() {
    if (!this.items.length) return null;
    const hit = this.pick(3);
    if (!hit) return null;
    for (const it of this.items) if (isChild(hit.object, it.obj)) return it;
    return null;
  }
  pickUp(it) {
    const g = this.g;
    const i = this.list.indexOf(it.rec);
    if (i >= 0) this.list.splice(i, 1);
    if (it.obj.parent) it.obj.parent.remove(it.obj);
    this.items.splice(this.items.indexOf(it), 1);
    this.looked = null;
    g.inv.add(it.rec.id);
    this.rebuild();
    g.persist();
    g.audio.sfx('pickup', { vol: 0.5 });
    g.hud.notify(`${ITEMS[it.rec.id].name}: al inventario.`, 'info', 2);
  }
  switchable(it) { return ['tele', 'lampara', 'lamparita', 'ventilador', 'radio'].includes(it.rec.id); }
  switchOn(it, on = !it.rec.on) {
    const g = this.g;
    it.rec.on = on;
    it.obj.traverse((o) => {
      if (o.userData.lamp && o.material) { if (!o.userData.own) { o.material = o.material.clone(); o.userData.own = true; } o.material.emissiveIntensity = on ? 0.9 : 0.05; }
      if (o.userData.screen) o.material.emissiveIntensity = on ? 0.85 : 0;
    });
    if (it.rec.id === 'radio' && g.fm) { if (on) { g.fm.play('phone'); g.fm.show(); } else g.fm.stop(); }
    g.persist();
  }
  option() {
    const g = this.g, it = this.looked;
    if (this.placing || !it || !this.house) return null;
    const d = ITEMS[it.rec.id];
    if (this.switchable(it)) return { label: `${it.rec.on ? 'Apagar' : 'Encender'}: ${lc(d.name)} <small>· ${g.input.keyText('F', 3, 'Subir')}: recogerlo</small>`, run: () => this.switchOn(it) };
    return { label: `Recoger: ${lc(d.name)}`, run: () => this.pickUp(it) };
  }
}

function isChild(o, root) { for (let x = o; x; x = x.parent) if (x === root) return true; return false; }
