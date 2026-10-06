// The merendero of the Pantano de San Roque (where OpenStreetMap marks the barbecue area, on the east shore): wooden
// picnic tables with their benches, stone rings for a fire and two brick barbecues. At weekends (and summer evenings)
// people from Guareña come out: families round the tables, somebody grilling, kids running about, a fire going at
// dusk. You can sit at any table.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomDesc } from './characters.js';
import { mulberry32 } from './util.js';

const BBQ_OSM = { x: 2054, z: 1130 }; // amenity=bbq (OSM way 179784519)

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 96, 4, 32, 80, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,190,70,0.95)'); g.addColorStop(0.6, 'rgba(230,90,20,0.55)'); g.addColorStop(1, 'rgba(120,20,0,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(32, 4); x.quadraticCurveTo(58, 70, 50, 108); x.quadraticCurveTo(32, 126, 14, 108); x.quadraticCurveTo(6, 70, 32, 4); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Merendero {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.tables = []; this.fires = []; this.people = []; this.active = false;
    this.flameMat = new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    this.light = new THREE.PointLight(0xff9a4a, 0, 14, 1.6);
    this.root.add(this.light);
  }

  build() {
    const g = this.game, map = g.map, R = g.world.reservoir;
    if (!R) return;
    // the shore point nearest to the barbecue area: the tables go between the water's edge and the barbecues
    let best = null, bd = Infinity;
    for (const p of R.shore) { const d = Math.hypot(p[0] - BBQ_OSM.x, p[1] - BBQ_OSM.z); if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    const ax = BBQ_OSM.x - best[0], az = BBQ_OSM.z - best[1], al = Math.hypot(ax, az) || 1;
    const ux = ax / al, uz = az / al;          // away from the water
    const vx = -uz, vz = ux;                   // along the shore
    const cx = best[0] + ux * Math.min(al * 0.55, 28), cz = best[1] + uz * Math.min(al * 0.55, 28);
    this.center = { x: cx, z: cz };
    const rnd = mulberry32(1906);
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x8e877c, roughness: 0.95 });
    const brick = new THREE.MeshStandardMaterial({ color: 0xa8563a, roughness: 0.9 });
    const ash = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 });
    const W = [], S = [], B = [], A = [], I = [];
    const box = (arr, w, h, d, x, y, z, ry) => { const q = new THREE.BoxGeometry(w, h, d); q.rotateY(ry); q.translate(x, y, z); arr.push(q); };
    const free = (x, z) => R.sdf(x, z) > 6 && !map.buildingAt(x, z);
    const seats = g.seats ? g.seats.seats : [];
    // six picnic tables in two rows, along the shore
    for (let i = 0; i < 6; i++) {
      const along = (i % 3 - 1) * 7 + (rnd() - 0.5) * 1.5, out = (i < 3 ? 0 : 6) + (rnd() - 0.5) * 1.2;
      const x = cx + vx * along + ux * out, z = cz + vz * along + uz * out;
      if (!free(x, z)) continue;
      const ry = Math.atan2(vx, vz) + (rnd() - 0.5) * 0.3; // long side along the shore
      const fx = Math.sin(ry), fz = Math.cos(ry), rx = -fz, rz = fx;
      box(W, 0.8, 0.05, 1.9, x, 0.74, z, ry);
      for (const s of [-1, 1]) {
        box(W, 0.3, 0.05, 1.9, x + rx * s * 0.72, 0.44, z + rz * s * 0.72, ry);
        for (const e of [-0.75, 0.75]) box(W, 0.06, 0.74, 0.06, x + rx * s * 0.3 + fx * e, 0.37, z + rz * s * 0.3 + fz * e, ry);
        for (const e of [-0.4, 0.4]) seats.push({ kind: 'banco', x: x + rx * s * 0.74 + fx * e, z: z + rz * s * 0.74 + fz * e, h: Math.atan2(-rx * s, -rz * s), picnic: true });
      }
      g.map.collider.addCircle(x, z, 0.55, 0.8, -4);
      this.tables.push({ x, z, ry, rx, rz, fx, fz });
    }
    // fire rings between the tables and the water, two brick barbecues on the land side
    for (let i = 0; i < 3; i++) {
      const x = cx + vx * ((i - 1) * 9) - ux * 5, z = cz + vz * ((i - 1) * 9) - uz * 5;
      if (!free(x, z) && R.sdf(x, z) < 3) continue;
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const q = new THREE.DodecahedronGeometry(0.16 + rnd() * 0.05); q.translate(x + Math.cos(a) * 0.55, 0.1, z + Math.sin(a) * 0.55); S.push(q); }
      const d = new THREE.CircleGeometry(0.45, 16); d.rotateX(-Math.PI / 2); d.translate(x, 0.02, z); A.push(d);
      for (let k = 0; k < 3; k++) box(W, 0.08, 0.08, 0.7, x, 0.08, z, k * 1.1);
      const fl = new THREE.Group();
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.95), this.flameMat); m.rotation.y = (k / 3) * Math.PI; m.position.y = 0.48; fl.add(m); }
      fl.position.set(x, 0, z); fl.visible = false;
      this.root.add(fl);
      this.fires.push({ x, z, fl, lit: false });
      g.map.collider.addCircle(x, z, 0.7, 0.4, -4);
    }
    for (const s of [-1, 1]) {
      const x = cx + vx * s * 12 + ux * 11, z = cz + vz * s * 12 + uz * 11;
      if (!free(x, z)) continue;
      const ry = Math.atan2(ux, uz);
      box(B, 1.3, 0.85, 0.8, x, 0.425, z, ry); box(B, 1.3, 0.6, 0.12, x - ux * 0.36, 1.15, z - uz * 0.36, ry);
      box(I, 1.1, 0.02, 0.6, x, 0.88, z, ry);
      this.fires.push({ x, z: z, bbq: true, fl: null, lit: false, y: 0.9 });
      g.map.collider.addCircle(x, z, 0.8, 1, -4);
    }
    const add = (arr, mat) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr.map((q) => (q.index ? q.toNonIndexed() : q))), mat); m.castShadow = true; m.receiveShadow = true; this.root.add(m); };
    add(W, wood); add(S, stone); add(B, brick); add(A, ash); add(I, iron);
    g.hud.setBlip('merendero', { x: cx, z: cz, label: 'M', color: '#6fbf5a', name: 'Merendero del pantano', edge: false, small: true });
  }

  // at the weekend from late morning to night, and on summer evenings, people come out here
  busy() {
    const s = this.game.sky, wd = ((s.day || 0) + 5) % 7, h = s.hour;
    if (wd >= 5) return h >= 11 && h < 23 ? 1 : 0;
    return h >= 19 && h < 22.5 ? 0.35 : 0;
  }

  update(dt) {
    const g = this.game, p = g.player, c = this.center;
    if (!c) return;
    const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
    const want = this.busy();
    const night = g.sky.night || 0;
    // the crowd appears when you come near (before you can make them out) and goes when you leave or it gets late
    if (this.active) { this.people = this.people.filter((q) => g.peds.list.includes(q)); if (!this.people.length) this.active = false; }
    if (!this.active && want > 0 && d < 105 && d > 55 && !g.interior) this.spawnCrowd(want);
    if (this.active && (d > 200 || want === 0)) this.clearCrowd();
    // fires: lit at dusk while people are here
    let nearFire = null, nd = 70;
    const litNow = this.active && night > 0.25;
    for (const f of this.fires) {
      if (f.lit !== litNow) { f.lit = litNow; if (f.fl) f.fl.visible = litNow; }
      if (f.lit && f.fl) {
        const t = g.time * 7 + f.x;
        f.fl.scale.set(1 + Math.sin(t) * 0.08, 1 + Math.sin(t * 1.7) * 0.14 + Math.sin(t * 3.1) * 0.06, 1);
        f.fl.rotation.y += dt * 0.6;
        const fd = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
        if (fd < nd) { nd = fd; nearFire = f; }
      }
    }
    if (nearFire) { this.light.position.set(nearFire.x, 0.9, nearFire.z); this.light.intensity = 4 * (0.8 + Math.sin(g.time * 13) * 0.12 + Math.sin(g.time * 29) * 0.08); }
    else this.light.intensity = 0;
    // sounds of an outing
    if (this.active && d < 60) {
      this.chatT = (this.chatT || 3) - dt;
      if (this.chatT <= 0) {
        this.chatT = 4 + Math.random() * 6;
        const q = this.people[Math.floor(Math.random() * this.people.length)];
        if (q && q.state !== 'flee') g.peds.say(q, pick(['¡Pásame el pan!', '¿Quién ha traído el carbón?', '¡Niño, no te acerques al agua!', 'Qué bien se está aquí, coile.', '¡La panceta ya está!', '¿Otra cerveza?', 'Mañana otra vez a currar…', '¡Mira qué puesta de sol!']));
      }
    }
  }

  spawnCrowd(k) {
    const g = this.game, P = g.peds, rnd = mulberry32(Math.floor(g.time) + 7);
    this.active = true;
    const nT = Math.max(1, Math.round(this.tables.length * k * (0.6 + rnd() * 0.4)));
    for (let i = 0; i < nT; i++) {
      const t = this.tables[i];
      if (!t) break;
      const n = 2 + Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) {
        const side = j % 2 ? 1 : -1, e = (Math.floor(j / 2) - 0.5) * 0.8;
        const x = t.x + t.rx * side * 0.74 + t.fx * e, z = t.z + t.rz * side * 0.74 + t.fz * e;
        const ped = P.spawnAt(x, z, randomDesc(rnd));
        ped.fixed = true; ped.state = 'sit'; ped.heading = Math.atan2(-t.rx * side, -t.rz * side);
        ped.char.setBase('sitTalk'); ped.merendero = true;
        this.people.push(ped);
      }
    }
    // somebody at the barbecue, kids running round
    for (const f of this.fires.filter((q) => q.bbq)) {
      if (rnd() > k) continue;
      const ped = P.spawnAt(f.x + 0.9, f.z + 0.3, randomDesc(rnd));
      ped.fixed = true; ped.state = 'idle'; ped.idleT = 1e9; ped.heading = Math.atan2(f.x - ped.x, f.z - ped.z);
      ped.char.setBase('talk'); ped.merendero = true;
      this.people.push(ped);
    }
    for (let i = 0; i < Math.round(3 * k); i++) {
      const d = randomDesc(rnd); d.height = 0.7; d.elderly = false;
      const t = this.tables[Math.floor(rnd() * this.tables.length)];
      if (!t) break;
      const ped = P.spawnAt(t.x + (rnd() - 0.5) * 8, t.z + (rnd() - 0.5) * 8, d);
      ped.fixed = true; ped.state = 'flee'; ped.fear = 0.3; ped.threat = { x: t.x, z: t.z }; ped.merendero = true; ped.play = true; // they run about
      this.people.push(ped);
    }
  }
  clearCrowd() {
    const P = this.game.peds;
    for (const ped of this.people) { const i = P.list.indexOf(ped); if (i >= 0) P.despawn(ped, i); }
    this.people = [];
    this.active = false;
  }
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
