// Weapons: fists, bat, pistol, SMG, pump shotgun and a scoped hunting rifle. Hold right mouse (or LT) to aim over the
// shoulder (through the scope with the rifle), fire with left click; without aiming (and on touch screens) shots
// auto-aim at whoever is in front. Hitscan against people, police, cars and walls, with tracers, muzzle flash,
// ejected brass, impacts and reloads. The guns are detailed models held with both hands (see gunrig.js).
import * as THREE from 'three';
import { clamp } from './util.js';
import { buildGun } from './gunmodels.js';
import { GunRig } from './gunrig.js';
import { PERK } from './perks.js';

export const WEAPONS = {
  punos: { id: 'punos', name: 'Puños', melee: true, dmg: 24, range: 1.3, rate: 0.42, knock: 4 },
  bate: { id: 'bate', name: 'Bate de béisbol', melee: true, dmg: 55, range: 1.75, rate: 0.62, knock: 8, price: 40 },
  pistola: { id: 'pistola', name: 'Pistola', clip: 12, dmg: 36, range: 75, rate: 0.23, spread: 0.01, reload: 1.3, price: 250, ammoPrice: 40, ammoPack: 36, sfx: 'shot_pistol', kick: 0.55 },
  subfusil: { id: 'subfusil', name: 'Subfusil', clip: 30, dmg: 18, range: 60, rate: 0.085, spread: 0.035, reload: 1.7, price: 650, ammoPrice: 60, ammoPack: 90, sfx: 'shot_smg', auto: true, kick: 0.2 },
  escopeta: { id: 'escopeta', name: 'Escopeta de corredera', clip: 6, dmg: 14, pellets: 8, range: 34, rate: 0.85, spread: 0.08, reload: 2.1, price: 450, ammoPrice: 50, ammoPack: 18, sfx: 'shot_shotgun', knock: 6, kick: 1.1, cycle: 'pump' },
  rifle: { id: 'rifle', name: 'Rifle de caza', clip: 5, dmg: 95, range: 170, rate: 1.1, spread: 0.0015, hipSpread: 0.045, reload: 2.6, price: 900, ammoPrice: 60, ammoPack: 15, sfx: 'shot_rifle', knock: 8, kick: 1.25, cycle: 'bolt', scope: true },
};
export const ORDER = ['punos', 'bate', 'pistola', 'subfusil', 'escopeta', 'rifle'];

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Weapons {
  constructor(game) {
    this.game = game;
    this.inv = { punos: { clip: 0, ammo: 0 } };
    this.cur = 'punos';
    this.cd = 0;
    this.reloadT = 0;
    this.aiming = false;
    this.models = {};
    this.heldOn = null;
    this.rig = new GunRig();
    this.cycleT = 9; // time since the last shot (drives slide / pump / bolt)
    this.scoped = false;
    this.scopeEl = document.getElementById('scope');
    this.hitT = 0;
    this.tracers = new Tracers(game.scene);
    this.lastShotT = -99;
  }
  get def() { return WEAPONS[this.cur]; }
  get slot() { return this.inv[this.cur]; }
  has(id) { return !!this.inv[id]; }
  give(id, ammo = 0) {
    const d = WEAPONS[id];
    if (!this.inv[id]) this.inv[id] = { clip: d.clip ? Math.min(d.clip, ammo) : 0, ammo: d.clip ? Math.max(0, ammo - d.clip) : 0 };
    else if (d.clip) this.inv[id].ammo += ammo;
    if (d.clip && this.inv[id].clip === 0 && this.inv[id].ammo > 0) { const n = Math.min(d.clip, this.inv[id].ammo); this.inv[id].clip = n; this.inv[id].ammo -= n; }
  }
  select(id) {
    if (!this.inv[id] || id === this.cur) return;
    this.cur = id; this.reloadT = 0; this.cd = Math.max(this.cd, 0.25);
    this.game.audio.sfx('ui_click');
    this.game.hud.weapon && this.game.hud.weapon(true);
  }
  cycle(dir) {
    const owned = ORDER.filter((id) => this.inv[id]);
    const i = owned.indexOf(this.cur);
    this.select(owned[(i + dir + owned.length) % owned.length]);
  }
  toJSON() { return { inv: this.inv, cur: this.cur }; }
  // arrested: the Guardia Civil keeps everything but your fists
  confiscate() {
    const had = Object.keys(this.inv).some((id) => id !== 'punos');
    this.inv = { punos: { clip: 0, ammo: 0 } };
    this.cur = 'punos'; this.reloadT = 0; this.aiming = false;
    if (this.game.hud.weapon) this.game.hud.weapon();
    return had;
  }
  load(s) {
    if (!s || !s.inv) return;
    this.inv = { punos: { clip: 0, ammo: 0 }, ...s.inv };
    this.cur = this.inv[s.cur] ? s.cur : 'punos';
  }

  model(id) {
    let m = this.models[id];
    if (m) return m;
    m = this.models[id] = buildGun(id);
    if (WEAPONS[id].melee) {
      // bat: the handle runs through the fist, barrel angled forward and down (hand frame: fingers -y, thumb +z)
      m.position.set(0.02, -0.072, 0);
      m.rotation.x = 0.64;
    } else {
      m.matrixAutoUpdate = false; // placed every frame by the rig, in the character's frame
      const u = m.userData;
      if (u.slide) u.slide0 = u.slide.position.z;
      if (u.pump) u.pump0 = u.pump.position.z;
      if (u.bolt) u.bolt0 = u.bolt.position.z;
    }
    return m;
  }
  // keep the right weapon model in the character's hands
  syncModel(ch) {
    const p = this.game.player;
    const want = p.vehicle || p.knock || p.mode !== 'foot' ? null : this.cur;
    if (this.heldOn === ch && this.heldId === want) return;
    for (const id in this.models) if (this.models[id].parent) this.models[id].parent.remove(this.models[id]);
    this.heldOn = ch; this.heldId = want;
    if (!want || want === 'punos' || !ch) return;
    const m = this.model(want);
    if (WEAPONS[want].melee) { if (ch.bones.handR) ch.bones.handR.add(m); }
    else ch.object.add(m);
    this.rig.ready = 0;
  }
  held() { const m = this.heldId && this.models[this.heldId]; return m && m.parent ? m : null; }

  // after the character is posed: gun placement, both hands on it, moving parts
  postPose(p, dt) {
    const g = this.game, m = this.held();
    if (!m || WEAPONS[this.heldId].melee || !p.char) return;
    const d = this.def;
    const raised = this.aiming || g.time - this.lastShotT < (d.cycle === 'bolt' ? 1.4 : 1.0);
    const rl = this.reloadT > 0 ? 1 - this.reloadT / d.reload : 0;
    this.rig.update(dt, p.char, m, raised && !(this.reloadT > 0), g.cam.pitch, { reload: rl });
    this.animateParts(m, d);
  }
  animateParts(m, d) {
    const u = m.userData, t = this.cycleT;
    if (u.slide) {
      // blowback: back in 35 ms, home in 70 ms; locked open on an empty magazine
      const locked = this.slot && this.slot.clip === 0 && this.reloadT <= 0;
      const k = locked ? 1 : t < 0.035 ? t / 0.035 : Math.max(0, 1 - (t - 0.035) / 0.07);
      u.slide.position.z = u.slide0 - 0.028 * k;
    }
    if (u.pump) {
      const x = (t - 0.3) / 0.32;
      u.pump.position.z = u.pump0 - (x > 0 && x < 1 ? 0.085 * Math.sin(x * Math.PI) : 0);
    }
    if (u.bolt) {
      // lift the handle, draw back, push home, turn down
      const ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const lift = ph(0.22, 0.32) - ph(0.66, 0.76), back = ph(0.32, 0.47) - ph(0.5, 0.64);
      u.bolt.rotation.z = -1.05 * lift;
      u.bolt.position.z = u.bolt0 - 0.075 * back;
    }
  }
  // brass out of the ejection port (the shotgun's shell comes out with the pump, the rifle's with the bolt)
  eject(delay = 0) {
    const g = this.game, m = this.held();
    if (!m || !m.userData.eject) return;
    const id = this.cur;
    setTimeout(() => {
      if (this.held() !== m) return;
      let pos, dir;
      if (g.cam.fp) {
        // first person: out of the right side of the view, from where the gun is drawn
        const cam = g.camera;
        pos = new THREE.Vector3(0.14, -0.1, -0.35).applyMatrix4(cam.matrixWorld);
        dir = new THREE.Vector3(1, 0.8, 0.2).transformDirection(cam.matrixWorld);
      } else {
        m.updateWorldMatrix(true, false);
        pos = m.localToWorld(m.userData.eject.clone());
        dir = new THREE.Vector3(-1, 0.75, -0.25).transformDirection(m.matrixWorld);
      }
      const s = 1.8 + Math.random() * 1.2;
      g.effects.casing(id, pos, dir.x * s, dir.y * s + 1, dir.z * s);
    }, delay * 1000);
  }

  // on-foot update (called by the player every frame)
  update(dt, input, p) {
    const g = this.game;
    this.cd -= dt;
    this.hitT -= dt;
    this.cycleT += dt;
    // switching: wheel / digits / Q / RB
    if (input.weaponNext) this.cycle(1);
    if (input.weaponPrev) this.cycle(-1);
    const dig = input.weaponDigit;
    if (dig) this.select(ORDER[dig - 1]);
    const d = this.def, s = this.slot;
    // reload
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { const n = Math.min(d.clip - s.clip, s.ammo); s.clip += n; s.ammo -= n; g.hud.weapon(); }
    } else if (d.clip && ((input.reload && s.clip < d.clip && s.ammo > 0) || (s.clip === 0 && s.ammo > 0))) {
      this.reloadT = d.reload; g.audio.sfx('reload'); g.hud.weapon();
    }
    this.aiming = !!input.aim && !d.melee && !p.knock;
    const trigger = d.auto ? input.fire : input.firePressed;
    if (trigger && this.cd <= 0) {
      if (d.melee) { this.cd = d.rate; this.melee(p, d); }
      else if (this.reloadT > 0) { /* busy */ }
      else if (s.clip <= 0) { if (input.firePressed) g.audio.sfx('empty'); this.cd = 0.3; }
      else { this.cd = d.rate; s.clip--; this.shoot(p, d); g.hud.weapon(); }
    }
    // guns are held by the rig (postPose); the old one-handed aim pose is not used any more
    const ch = p.char;
    if (ch.base === 'aim') ch.setBase(null);
    this.syncModel(ch);
    // rifle: aiming looks through the scope
    const scoped = !!(this.aiming && d.scope && this.reloadT <= 0 && !g.input.isTouch);
    if (scoped !== this.scoped) {
      this.scoped = scoped;
      if (this.scopeEl) this.scopeEl.hidden = !scoped;
      document.body.classList.toggle('scoped', scoped);
      if (scoped) g.audio.sfx('ui_click', { vol: 0.4 });
    }
  }
  unscope() {
    if (!this.scoped) return;
    this.scoped = false;
    if (this.scopeEl) this.scopeEl.hidden = true;
    document.body.classList.remove('scoped');
  }

  // ------------------------------------------------------------ melee (fists / bat)
  melee(p, d) {
    const g = this.game;
    d = { ...d, dmg: d.dmg * PERK.melee, knock: d.knock * Math.sqrt(PERK.melee) }; // Manu hits much harder
    p.punchSide ^= 1;
    p.char.play(d.id === 'bate' ? 'bat' : p.punchSide ? 'punch' : 'punch2', d.id === 'bate' ? 0.6 : 0.42);
    if (g.net) g.net.punch(p.punchSide, d.id === 'bate');
    g.audio.sfx(d.id === 'bate' ? 'bat_swing' : 'punch');
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const hx = p.pos.x + fx * d.range * 0.7, hz = p.pos.z + fz * d.range * 0.7;
    const snd = d.id === 'bate' ? 'bat_hit' : 'punch_hit';
    const zh = g.zombies && g.zombies.hitTest(hx, hz, d.range * 0.8);
    if (zh) {
      setTimeout(() => g.audio.sfx(snd, { x: zh.x, z: zh.z }), 110);
      g.zombies.damage(zh, d.dmg * (d.id === 'bate' ? 1.3 : 1) * (0.85 + Math.random() * 0.3), fx * d.knock, fz * d.knock, 'melee');
      g.effects.blood(zh.x, 1.3, zh.z, fx, fz);
      this.hitT = 0.2;
      return;
    }
    const rs = g.interior && g.interiors.life && g.interiors.life.hitTest(hx, hz, d.range * 0.75);
    if (rs) {
      setTimeout(() => g.audio.sfx(snd), 110);
      g.interiors.life.damage(rs, d.dmg * (0.85 + Math.random() * 0.3), fx * d.knock, fz * d.knock, d.id === 'bate' ? 'bat' : 'fist');
      this.hitT = 0.2;
      return;
    }
    const hit = g.peds.hitTest(hx, hz, d.range * 0.75, p);
    if (hit) {
      setTimeout(() => g.audio.sfx(snd, { x: hit.x, z: hit.z }), 110);
      g.peds.damage(hit, d.dmg * (0.85 + Math.random() * 0.3), fx * d.knock, fz * d.knock, 'player', d.id === 'bate' ? 'bat' : 'fist');
      this.hitT = 0.2;
      return;
    }
    const cop = g.police.hitTest(hx, hz, d.range * 0.75);
    if (cop) { setTimeout(() => g.audio.sfx(snd), 110); g.police.damageOfficer(cop, d.dmg, fx * d.knock, fz * d.knock); this.hitT = 0.2; return; }
    // smacking cars with the bat dents them
    if (d.id === 'bate') {
      const v = g.fleet.nearest(hx, hz, 2.6);
      if (v) { if (!v.remote) v.health -= 18; v.sleeping = false; g.audio.sfx('bin_hit', { x: v.x, z: v.z }); g.effects.sparks(hx, 0.8, hz, 4); if (v.driver !== 'player') g.police.crime('vandalismo', v.x, v.z); }
    }
  }

  // ------------------------------------------------------------ guns
  // direction of fire: camera ray when aiming, otherwise auto-aim at the best target in front of the player
  aimRay(p, d) {
    const g = this.game;
    const cam = g.camera;
    // gun in the right hand: forward (sin h, cos h), right (-cos h, sin h)
    const muzzle = { x: p.pos.x + Math.sin(p.heading) * 0.5 - Math.cos(p.heading) * 0.2, y: 1.38 * p.char.scale, z: p.pos.z + Math.cos(p.heading) * 0.5 + Math.sin(p.heading) * 0.2 };
    if (this.aiming && !g.input.isTouch) {
      cam.getWorldDirection(_d);
      // start beyond the player so we never shoot our own shoulder
      _v.copy(cam.position);
      const toP = (p.pos.x - _v.x) * _d.x + (p.pos.y + 1.4 - _v.y) * _d.y + (p.pos.z - _v.z) * _d.z;
      _v.addScaledVector(_d, Math.max(0, toP + 0.5));
      // light aim assist: a near miss (within ~3.5°) is pulled onto the body
      const t = this.assist(p, _v, _d, d.range);
      if (t) { const dx = t.x - _v.x, dy = t.y - _v.y, dz = t.z - _v.z, l = Math.hypot(dx, dy, dz) || 1; return { ox: _v.x, oy: _v.y, oz: _v.z, dx: dx / l, dy: dy / l, dz: dz / l, muzzle }; }
      return { ox: _v.x, oy: _v.y, oz: _v.z, dx: _d.x, dy: _d.y, dz: _d.z, muzzle };
    }
    const t = this.autoTarget(p, d);
    let dx, dy, dz;
    if (t) {
      dx = t.x - muzzle.x; dy = t.y - muzzle.y; dz = t.z - muzzle.z;
      p.heading = Math.atan2(t.x - p.pos.x, t.z - p.pos.z);
    } else {
      // no target: straight along the camera's horizontal forward (what the player is looking at)
      const yaw = g.cam.forwardYaw;
      dx = Math.sin(yaw); dz = Math.cos(yaw); dy = 0;
      p.heading = yaw;
    }
    const l = Math.hypot(dx, dy, dz) || 1;
    return { ox: muzzle.x, oy: muzzle.y, oz: muzzle.z, dx: dx / l, dy: dy / l, dz: dz / l, muzzle };
  }
  assist(p, o, dir, range) {
    const g = this.game;
    let best = null, ba = 0.07;
    const test = (x, z, y0, y1, rad = 0.3) => {
      const cy = (y0 + y1) / 2;
      const vx = x - o.x, vy = cy - o.y, vz = z - o.z;
      const along = vx * dir.x + vy * dir.y + vz * dir.z;
      if (along < 1 || along > range) return;
      const px = vx - dir.x * along, py = vy - dir.y * along, pz = vz - dir.z * along;
      // the plain ray already hits the body: keep it (head shots stay possible)
      const ry = o.y + dir.y * along;
      if (Math.hypot(px, pz) < rad && ry > y0 && ry < y1 + 0.1) return 'hit';
      const ang = Math.hypot(px, py, pz) / along;
      if (ang < ba && g.map.collider.raycast(p.pos.x, p.pos.z, x, z, 1.3, 1.1) > 0.97) { ba = ang; best = { x, y: cy, z }; }
    };
    for (const o2 of g.police.officers) if (o2.state !== 'ko' && o2.state !== 'dead' && test(o2.x, o2.z, 0.9, 1.6) === 'hit') return null;
    if (g.zombies) for (const zz of g.zombies.list) if (zz.alive && !zz.low && test(zz.x, zz.z, 0.9 * zz.S, 1.6 * zz.S, zz.R) === 'hit') return null; // (S, R: a giant's size)
    for (const ped of g.peds.list) {
      if (ped.state === 'dead' || ped.state === 'fly' || ped.state === 'lie') continue;
      const top = (ped.state === 'sit' ? 1.3 : 1.7) * ped.char.scale;
      if (test(ped.x, ped.z, top * 0.5, top * 0.9) === 'hit') return null;
    }
    return best;
  }
  autoTarget(p, d) {
    const g = this.game;
    const yaw = g.input.isTouch ? p.heading : g.cam.forwardYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bs = -Infinity;
    const col = g.map.collider;
    const consider = (x, z, y, pri) => {
      const dx = x - p.pos.x, dz = z - p.pos.z, dd = Math.hypot(dx, dz);
      if (dd > d.range * 0.9 || dd < 0.5) return;
      const cosA = (dx * fx + dz * fz) / dd;
      if (cosA < 0.82) return;
      if (col.raycast(p.pos.x, p.pos.z, x, z, 1.3, 1.1) < 0.97) return;
      const sc = cosA * 2 - dd / d.range + pri;
      if (sc > bs) { bs = sc; best = { x, y, z }; }
    };
    if (g.zombies) for (const zz of g.zombies.list) if (zz.alive) consider(zz.x, zz.z, (zz.low ? 0.3 : zz.state === 'rise' ? 0.8 : 1.45) * zz.S, 2);
    for (const o of g.police.officers) if (o.state !== 'ko' && o.state !== 'dead') consider(o.x, o.z, 1.25, g.police.wanted > 0 ? 1 : 0);
    for (const ped of g.peds.list) if (ped.state !== 'dead' && ped.state !== 'fly') consider(ped.x, ped.z, ped.state === 'lie' ? 0.25 : ped.state === 'sit' ? 0.8 : 1.25, ped.state === 'fight' ? 1.2 : 0);
    if (g.interior && g.interiors.life) for (const o of g.interiors.life.people) if (o.state !== 'dead' && Math.abs(o.y - p.pos.y) < 1.2) consider(o.x, o.z, o.y + (o.state === 'ko' || o.state === 'sleep' ? 0.3 : 1.25), o.kind === 'cop' || o.state === 'fight' ? 1.2 : 0);
    return best;
  }

  shoot(p, d) {
    const g = this.game;
    this.lastShotT = g.time;
    this.cycleT = 0;
    const r = this.aimRay(p, d);
    // tracers and the flash start at the real muzzle of the model in the hands
    const m = this.held();
    if (m && m.userData.muzzle && !g.cam.fp && !this.scoped) {
      m.updateWorldMatrix(true, false);
      const mp = m.localToWorld(m.userData.muzzle.clone());
      r.muzzle = { x: mp.x, y: mp.y, z: mp.z };
    }
    this.rig.shot(d.kick || 0.4);
    if (g.viewModel) g.viewModel.shot();
    const s = this.slot;
    if (d.cycle === 'pump') { if (s.clip > 0) this.eject(0.42); }
    else if (d.cycle === 'bolt') { if (s.clip > 0) this.eject(0.45); }
    else this.eject(0.01);
    const n = d.pellets || 1;
    let anyHit = false, end0 = null;
    for (let k = 0; k < n; k++) {
      const sp = this.aiming ? d.spread * 0.6 : (d.hipSpread || d.spread * 1.2);
      let dx = r.dx + (Math.random() - 0.5) * sp * 2, dy = r.dy + (Math.random() - 0.5) * sp * 1.4, dz = r.dz + (Math.random() - 0.5) * sp * 2;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const h = this.trace(r.ox, r.oy, r.oz, dx, dy, dz, d.range);
      const ex = r.ox + dx * h.t, ey = r.oy + dy * h.t, ez = r.oz + dz * h.t;
      if (k < 3) this.tracers.add(r.muzzle.x, r.muzzle.y, r.muzzle.z, ex, ey, ez);
      if (!k) end0 = { x: ex, y: ey, z: ez };
      if (this.applyHit(h, d, dx, dz, ex, ey, ez)) anyHit = true;
    }
    if (anyHit) this.hitT = 0.15;
    if (g.net && end0) g.net.shot(d.id, r.muzzle, end0); // friends see and hear it
    // muzzle flash, sound, recoil, and the whole street hears it
    g.effects.muzzle(r.muzzle.x, r.muzzle.y, r.muzzle.z, r.dx, r.dz);
    if (!this.scoped) g.effects.muzzleStar(r.muzzle.x, r.muzzle.y, r.muzzle.z, r.dx, r.dy, r.dz, { pistola: 0.55, subfusil: 0.7, escopeta: 1.25, rifle: 1.05 }[d.id] || 0.7);
    g.audio.sfx(d.sfx, { vol: 1 });
    g.cam.shake(d.pellets ? 0.25 : d.auto ? 0.05 : d.scope ? (this.scoped ? 0.35 : 0.2) : 0.1);
    if (g.mode === 'zombis') return;
    if (g.interior) { if (g.mode === 'normal') g.interiors.onCrime('disparo', {}); return; } // the whole street hears it
    g.peds.scare(p.pos.x, p.pos.z, 48, p.pos, true);
    const witness = g.peds.list.some((x) => x.state !== 'dead' && Math.hypot(x.x - p.pos.x, x.z - p.pos.z) < 45) || g.police.copsNear(p.pos.x, p.pos.z, 80);
    if (witness && g.time - (this.crimeT || -9) > 1.5) { this.crimeT = g.time; g.police.crime('disparo', p.pos.x, p.pos.z); }
  }

  // nearest thing hit along a ray: walls, people, police, cars
  trace(ox, oy, oz, dx, dy, dz, range) {
    const g = this.game;
    let best = { t: range, kind: 'none' };
    const ex = ox + dx * range, ez = oz + dz * range, ey = oy + dy * range;
    const tw = g.map.collider.raycast(ox, oz, ex, ez, oy, ey);
    if (tw < 1) best = { t: tw * range, kind: 'wall' };
    if (oy + dy * best.t < 0 && dy < 0) { const tg = -oy / dy; if (tg < best.t) best = { t: tg, kind: 'ground' }; }
    const hd = Math.hypot(dx, dz) || 1e-6;
    const testCyl = (x, z, r, y0, y1, obj, kind) => {
      // closest approach of the horizontal ray projection
      const px = x - ox, pz = z - oz;
      const along = (px * dx + pz * dz) / (hd * hd);
      if (along <= 0) return;
      const cx = ox + dx * along - x, cz = oz + dz * along - z;
      const miss = Math.hypot(cx, cz);
      if (miss > r) return;
      const back = Math.sqrt(r * r - miss * miss) / hd;
      const t = along - back;
      if (t < 0 || t >= best.t) return;
      const y = oy + dy * t;
      if (y < y0 || y > y1) return;
      best = { t, kind, obj, y };
    };
    for (const ped of g.peds.list) {
      if (ped.state === 'dead' && Math.random() < 0.5) continue;
      const lying = ped.state === 'lie' || ped.state === 'dead';
      testCyl(ped.x, ped.z, lying ? 0.55 : 0.34, 0, lying ? 0.45 : ped.state === 'sit' ? 1.35 : 1.8 * ped.char.scale, ped, 'ped');
    }
    for (const o of g.police.officers) testCyl(o.x, o.z, o.state === 'ko' || o.state === 'dead' ? 0.55 : 0.36, 0, o.state === 'ko' || o.state === 'dead' ? 0.45 : 1.85, o, 'cop');
    if (g.interior && g.interiors.life) for (const o of g.interiors.life.people) { const down = o.state === 'ko' || o.state === 'dead' || o.state === 'sleep'; testCyl(o.x, o.z, down ? 0.55 : 0.34, o.y, o.y + (down ? 0.6 : o.state === 'sit' ? 1.3 : 1.8), o, 'resident'); }
    if (g.zombies) for (const zz of g.zombies.list) { const down = !zz.alive || zz.low || zz.state === 'rise', S = zz.S; testCyl(zz.x, zz.z, (down ? 0.5 : 0.36) * S, 0, (down ? 0.45 : 1.75) * S, zz, 'zombie'); }
    for (const v of g.fleet.vehicles) {
      if (Math.abs(v.x - ox) > range + 5 || Math.abs(v.z - oz) > range + 5 || v.driver === 'player') continue;
      // slab test in the car's frame
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lox = (ox - v.x) * fx + (oz - v.z) * fz, loz = (ox - v.x) * -fz + (oz - v.z) * fx;
      const ldx = dx * fx + dz * fz, ldz = dx * -fz + dz * fx;
      let t0 = 0, t1 = best.t;
      for (const [o, dd, h] of [[lox, ldx, v.hl], [loz, ldz, v.hw]]) {
        if (Math.abs(dd) < 1e-6) { if (Math.abs(o) > h) { t0 = 1; t1 = 0; } continue; }
        let a = (-h - o) / dd, b = (h - o) / dd;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
      if (t0 < t1 && t0 < best.t) {
        const y = oy + dy * t0;
        if (y > 0 && y < v.spec.H + 0.1) best = { t: t0, kind: 'car', obj: v, y };
      }
    }
    return best;
  }

  applyHit(h, d, dx, dz, x, y, z) {
    const g = this.game;
    const fx = g.effects;
    if (h.kind === 'ped') {
      const head = h.y > 1.5 * h.obj.char.scale;
      g.peds.damage(h.obj, d.dmg * (head ? 2.2 : 1), dx * (d.knock || 3), dz * (d.knock || 3), 'player', 'bullet');
      fx.blood(x, y, z, dx, dz);
      g.audio.sfx('bullet_flesh', { x, z });
      return true;
    }
    if (h.kind === 'zombie') {
      const head = h.y > 1.45 * h.obj.S && h.obj.alive && !h.obj.low;
      g.zombies.damage(h.obj, d.dmg * (head ? 2.4 : 1), dx * (d.knock || 3), dz * (d.knock || 3), head ? 'head' : d.pellets ? 'blast' : d.id === 'rifle' ? 'rifle' : 'bullet');
      fx.blood(x, y, z, dx, dz);
      g.audio.sfx('bullet_flesh', { x, z });
      if (head) this.hitT = 0.3;
      return true;
    }
    if (h.kind === 'resident') {
      g.interiors.life.damage(h.obj, d.dmg * (h.y - h.obj.y > 1.5 ? 2 : 1), dx * (d.knock || 3), dz * (d.knock || 3), 'bullet');
      fx.blood(x, y, z, dx, dz);
      g.audio.sfx('bullet_flesh', { x, z });
      return true;
    }
    if (h.kind === 'cop') {
      g.police.damageOfficer(h.obj, d.dmg * (h.y > 1.5 ? 2 : 1), dx * (d.knock || 3), dz * (d.knock || 3));
      fx.blood(x, y, z, dx, dz);
      g.audio.sfx('bullet_flesh', { x, z });
      return true;
    }
    if (h.kind === 'car') {
      const v = h.obj;
      if (!v.remote) v.health -= d.dmg * 0.9; // a friend's car (multiplayer) takes its damage in its own game
      v.sleeping = false;
      fx.sparks(x, y, z, 5);
      g.audio.sfx('bullet_metal', { x, z });
      if (v.ai && v.ai.mode === 'traffic') v.ai.panic = 6;
      if (v.police) g.police.crime('policia', v.x, v.z);
      return true;
    }
    if (h.kind === 'wall' || h.kind === 'ground') {
      fx.impact(x, Math.max(0.05, y), z);
      if (Math.random() < 0.5) g.audio.sfx('ricochet', { x, z });
    }
    return false;
  }
}

// short-lived bright line segments for bullets
class Tracers {
  constructor(scene, cap = 48) {
    this.cap = cap; this.i = 0;
    this.pos = new Float32Array(cap * 6);
    this.life = new Float32Array(cap);
    this.col = new Float32Array(cap * 8);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(g, m);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
    scene.add(this.lines);
  }
  add(x0, y0, z0, x1, y1, z1) {
    const k = this.i++ % this.cap;
    // draw only the far part of the path, like a streak of light
    const fx = x0 + (x1 - x0) * 0.15, fy = y0 + (y1 - y0) * 0.15, fz = z0 + (z1 - z0) * 0.15;
    this.pos.set([fx, fy, fz, x1, y1, z1], k * 6);
    this.life[k] = 0.07;
  }
  update(dt) {
    for (let k = 0; k < this.cap; k++) {
      this.life[k] = Math.max(0, this.life[k] - dt);
      const a = clamp(this.life[k] / 0.07, 0, 1);
      this.col.set([1, 0.85, 0.55, a * 0.9, 1, 0.95, 0.8, a * 0.5], k * 8);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
}
