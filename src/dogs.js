// Dogs out for a walk with their owners: a mongrel, a podenco, a little terrier… on the lead, trotting ahead,
// stopping to sniff a corner (and tugging the owner along), wagging at you, barking if you run at them.
import * as THREE from 'three';
import { STYLE } from './style.js';
import { SM } from './plastilina.js';

const COATS = [0x8a5a2e, 0xd8b27a, 0x2a2622, 0xf2eee6, 0x6a6a6a, 0xa8743a, 0x3a2a1e];
const BREEDS = [
  { name: 'podenco', s: 1.0, leg: 0.36, body: [0.62, 0.2, 0.2], head: 0.12, snout: 0.12, ears: 'up', tail: 0.3 },
  { name: 'mestizo', s: 0.9, leg: 0.3, body: [0.55, 0.22, 0.22], head: 0.12, snout: 0.09, ears: 'down', tail: 0.26 },
  { name: 'terrier', s: 0.62, leg: 0.2, body: [0.42, 0.2, 0.19], head: 0.11, snout: 0.07, ears: 'up', tail: 0.14 },
  { name: 'mastín', s: 1.25, leg: 0.42, body: [0.74, 0.3, 0.3], head: 0.16, snout: 0.11, ears: 'down', tail: 0.3 },
];
const geo = {};
const G = (k, make) => geo[k] || (geo[k] = make());

export function makeDog(rnd = Math.random) {
  const br = BREEDS[Math.floor(rnd() * BREEDS.length)];
  const coat = new THREE.MeshStandardMaterial({ color: COATS[Math.floor(rnd() * COATS.length)], roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.6 });
  const collar = new THREE.MeshStandardMaterial({ color: [0xc8202a, 0x2a6ab8, 0x2a8a3a, 0xe8b82a][Math.floor(rnd() * 4)], roughness: 0.5 });
  const root = new THREE.Group();
  const s = br.s;
  const [bl, bh, bw] = br.body;
  const legH = br.leg;
  const body = new THREE.Mesh(G('body', () => new THREE.CapsuleGeometry(0.5, 1, 4, 10).rotateX(Math.PI / 2)), coat);
  body.scale.set(bw, bh, bl * 0.5);
  body.position.y = legH + bh * 0.45;
  root.add(body);
  const neck = new THREE.Group(); neck.position.set(0, legH + bh * 0.7, bl * 0.42); root.add(neck);
  const head = new THREE.Mesh(G('head', () => new THREE.SphereGeometry(1, 12, 10)), coat);
  head.scale.set(br.head * 0.9, br.head, br.head * 1.05); head.position.set(0, 0.08 * s, 0.05 * s); neck.add(head);
  const snout = new THREE.Mesh(G('snout', () => new THREE.BoxGeometry(1, 1, 1)), coat);
  snout.scale.set(br.head * 0.75, br.head * 0.6, br.snout); snout.position.set(0, 0.05 * s, 0.05 * s + br.head * 0.9 + br.snout * 0.4); neck.add(snout);
  const nose = new THREE.Mesh(G('nose', () => new THREE.SphereGeometry(1, 8, 6)), dark);
  nose.scale.setScalar(0.022 * s); nose.position.set(0, snout.position.y + br.head * 0.22, snout.position.z + br.snout * 0.5); neck.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(G('ear', () => new THREE.ConeGeometry(1, 2, 6)), coat);
    ear.scale.set(0.035 * s, 0.05 * s, 0.02 * s);
    if (br.ears === 'up') ear.position.set(sx * br.head * 0.55, 0.08 * s + br.head * 0.95, 0.03 * s);
    else { ear.position.set(sx * br.head * 0.85, 0.08 * s + br.head * 0.35, 0.02 * s); ear.rotation.z = sx * 2.6; }
    neck.add(ear);
    const eye = new THREE.Mesh(G('eye', () => new THREE.SphereGeometry(1, 6, 5)), dark);
    eye.scale.setScalar(0.014 * s); eye.position.set(sx * br.head * 0.42, 0.08 * s + br.head * 0.25, 0.05 * s + br.head * 0.85); neck.add(eye);
  }
  const col = new THREE.Mesh(G('collar', () => new THREE.TorusGeometry(1, 0.2, 6, 14)), collar);
  col.scale.setScalar(br.head * 0.72); col.position.set(0, -0.02 * s, -0.03 * s); neck.add(col);
  const legs = [];
  for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = new THREE.Group();
    hip.position.set(lx * bw * 0.32, legH + 0.02, lz * bl * 0.34);
    const leg = new THREE.Mesh(G('leg', () => new THREE.CylinderGeometry(0.5, 0.42, 1, 7).translate(0, -0.5, 0)), coat);
    leg.scale.set(0.07 * s, legH, 0.07 * s);
    hip.add(leg);
    root.add(hip);
    legs.push({ hip, ph: lx * lz > 0 ? 0 : Math.PI });
  }
  const tailP = new THREE.Group(); tailP.position.set(0, legH + bh * 0.7, -bl * 0.46); root.add(tailP);
  const tail = new THREE.Mesh(G('tail', () => new THREE.CylinderGeometry(0.3, 0.5, 1, 6).translate(0, 0.5, 0)), coat);
  tail.scale.set(0.05 * s, br.tail, 0.05 * s); tail.rotation.x = -0.9; tailP.add(tail);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // the lead
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const lead = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
  lead.frustumCulled = false;
  return { root, neck, legs, tailP, lead, breed: br, x: 0, z: 0, h: 0, speed: 0, ph: 0, sniffT: 0, barkT: 0, wag: 0, collarY: legH + bh * 0.75 };
}

export class Dogs {
  constructor(game) { this.game = game; this.list = []; }
  attach(ped) {
    const d = makeDog();
    d.x = ped.x + 1; d.z = ped.z; d.owner = ped;
    this.game.scene.add(d.root);
    this.game.scene.add(d.lead);
    if (STYLE.plastilina) SM.add(d.root); // (claymation: posed 12 times a second, like its owner)
    ped.dog = d;
    this.list.push(d);
    return d;
  }
  detach(ped) {
    const d = ped.dog;
    if (!d) return;
    this.game.scene.remove(d.root); this.game.scene.remove(d.lead);
    SM.remove(d.root);
    d.lead.geometry.dispose();
    this.list.splice(this.list.indexOf(d), 1);
    ped.dog = null;
  }
  update(dt) {
    const g = this.game, pl = g.player;
    for (const d of this.list) {
      const o = d.owner;
      if (!o) continue;
      // the owner is on the ground (or gone running): the dog stays by them barking, the lead dropped
      if (o.state === 'fly' || o.state === 'lie' || o.state === 'dead') {
        d.lead.visible = false;
        d.barkT -= dt;
        if (d.barkT <= 0) { d.barkT = 1.2 + Math.random(); this.game.audio.sfx('bark', { x: d.x, z: d.z }); }
        d.neck.rotation.x = -0.2; d.tailP.rotation.z = 0;
        for (const L of d.legs) L.hip.rotation.x = 0;
        continue;
      }
      d.lead.visible = true;
      // where it wants to be: a little ahead and to one side of the owner, unless it stopped to sniff
      const oh = o.heading || 0;
      const want = { x: o.x + Math.sin(oh) * 1.1 + Math.cos(oh) * 0.55, z: o.z + Math.cos(oh) * 1.1 - Math.sin(oh) * 0.55 };
      d.sniffT -= dt;
      if (d.sniffT < -6 - Math.random() * 6 && o.state === 'walk') d.sniffT = 1.6 + Math.random() * 1.8;
      const sniffing = d.sniffT > 0;
      let tx = want.x, tz = want.z;
      if (sniffing) { tx = d.x; tz = d.z; }
      // the lead is 1.8 m: it cannot be further than that from the owner
      const lx = d.x - o.x, lz = d.z - o.z, ll = Math.hypot(lx, lz);
      if (ll > 1.8) { d.x = o.x + (lx / ll) * 1.8; d.z = o.z + (lz / ll) * 1.8; }
      const dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz);
      const sp = dd > 0.25 ? Math.min(3.8, dd * 2.2 + (o.speed || 0) * 0.6) : 0;
      d.speed += (sp - d.speed) * Math.min(1, dt * 6);
      if (dd > 0.05) d.h += (((Math.atan2(dx, dz) - d.h + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
      d.x += Math.sin(d.h) * d.speed * dt; d.z += Math.cos(d.h) * d.speed * dt;
      const pos = { x: d.x, z: d.z };
      g.map.collider.resolveCircle(pos, 0.2);
      d.x = pos.x; d.z = pos.z;
      // the player: running close gets barked at, standing close gets a wagging tail
      const dp = Math.hypot(pl.pos.x - d.x, pl.pos.z - d.z);
      const plSp = Math.hypot(pl.vel.x, pl.vel.z);
      d.barkT -= dt;
      if (dp < 5 && plSp > 4 && d.barkT <= 0 && !pl.vehicle) { d.barkT = 2.5 + Math.random() * 2; g.audio.sfx('bark', { x: d.x, z: d.z }); }
      d.wag = dp < 4 && !pl.vehicle ? 1 : d.speed > 0.5 ? 0.5 : 0.25;
      // pose
      d.ph += dt * (4 + d.speed * 4.2);
      const A = Math.min(0.7, d.speed * 0.28);
      for (const L of d.legs) L.hip.rotation.x = Math.sin(d.ph + L.ph) * A;
      d.neck.rotation.x = sniffing ? 0.75 + Math.sin(g.time * 9) * 0.05 : Math.sin(d.ph * 2) * 0.04 * Math.min(1, d.speed);
      d.neck.rotation.y = sniffing ? Math.sin(g.time * 2.3) * 0.4 : 0;
      d.tailP.rotation.z = Math.sin(g.time * (8 + d.wag * 10)) * 0.5 * d.wag;
      d.root.position.set(d.x, Math.abs(Math.sin(d.ph)) * 0.012 * Math.min(1, d.speed), d.z);
      d.root.rotation.y = d.h;
      // the lead from the owner's hand to the collar
      const pa = d.lead.geometry.attributes.position;
      const hx = o.x + Math.cos(oh) * 0.28, hz = o.z - Math.sin(oh) * 0.28;
      pa.setXYZ(0, hx, (o.y || 0) + 0.85, hz);
      pa.setXYZ(1, d.x + Math.sin(d.h) * d.breed.body[0] * 0.45, d.collarY, d.z + Math.cos(d.h) * d.breed.body[0] * 0.45);
      pa.needsUpdate = true;
    }
  }
}
