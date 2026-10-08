// Player controller (on foot & driving, entering/exiting & carjacking, melee) and the third-person camera rig.
import * as THREE from 'three';
import { STYLE } from './style.js';
import { SM } from './plastilina.js';
import { clamp, lerp, damp, dampAngle, wrapAngle, smoothstep, polyNearest, polySample } from './util.js';
import { springCharacter, springAngle, springDamper } from './springs.js';
import { PERK, setPerk, applyFitness } from './perks.js';

const WALK = 1.7, JOG = 3.6, SPRINT = 6.4, CROUCH = 1.15;
// on foot you walk at everybody's pace; keep going for RUN_AFTER seconds and you break into a run; Shift sprints
const PACE = 1.45, RUN_AFTER = 7;

export class Player {
  constructor(game, character) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.health = 100;
    this.armor = 0;
    this.money = 0;
    this.vehicle = null;
    this.mode = 'foot';
    this.grounded = true;
    this.punchCd = 0; this.punchSide = 0;
    this.stamina = 1;
    this.enter = null;  // entering state
    this.hurtT = 0;
    this.knock = null;
    this.setCharacter(character);
  }
  setCharacter(ch) {
    if (this.char) { this.game.scene.remove(this.char.object); this.char.dispose(); }
    this.char = ch;
    if (STYLE.plastilina) SM.remove(ch.object); // (claymation: not a puppet held between poses — as fluid as the camera that follows it)
    this.applyPerks();
    this.game.scene.add(ch.object);
    ch.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  // the character's edge, and what the gym has added
  applyPerks() {
    const ch = this.char;
    setPerk(ch && ch.desc && (ch.desc.perk || ch.desc.id));
    applyFitness(this.game.save && this.game.save.fitness);
  }
  spawnAt(x, z, heading = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.char.object.visible = true;
    this.char.setBase(null);
    this.char.standUp();
    this.char.object.rotation.set(0, heading, 0);
    this.mode = 'foot';
    this.vehicle = null;
    this.knock = null;
    this.crouch = false; this.seat = null;
    if (this.hideIn) { this.hideIn = null; document.body.classList.remove('hiding-cont'); }
  }

  update(dt, input, camYaw) {
    const g = this.game;
    this.punchCd -= dt;
    this.hurtT -= dt;
    if (this.mode === 'dead' || this.mode === 'busted') { this.char.update(dt, 0, {}); this.syncChar(); return; }
    if (this.mode === 'car') return this.updateCar(dt, input);
    if (this.mode === 'entering') return this.updateEntering(dt);
    if (this.mode === 'passenger') return this.updatePassenger(dt, input);
    if (this.mode === 'hidden') return this.updateHidden(dt, input);
    if (this.mode === 'sit') return this.updateSit(dt, input);
    if (this.mode === 'swim') return this.updateSwim(dt, input, camYaw);
    if (this.knock) return this.updateKnock(dt);
    // safety net: never stay trapped inside a building (bad save, glitchy push…)
    this.wallT = (this.wallT || 0) + dt;
    if (this.wallT > 0.5) {
      this.wallT = 0;
      if (g.map.buildingAt(this.pos.x, this.pos.z)) {
        this.insideN = (this.insideN || 0) + 1;
        if (this.insideN >= 2) { this.insideN = 0; const q = g.map.nearestEdge(this.pos.x, this.pos.z, 120, (e) => e.walk && !e.blocked); if (q) { this.pos.x = q.x; this.pos.z = q.z; this.vel.set(0, 0, 0); } }
      } else this.insideN = 0;
    }
    // ---------------- on foot
    // crouching (C): slow, quiet and hard to spot. Sprinting or jumping stands you up.
    if (input.crouch) { this.crouch = !this.crouch; g.hud.notify(this.crouch ? `${g.gx('Agachado', 'Agachada')}: vas en sigilo (${g.input.keyText('C', 10, 'Agacharse')} para levantarte)` : 'De pie', 'info', 1.6); }
    if (this.crouch && ((input.sprint && Math.hypot(input.moveX, input.moveY) > 0.1) || input.jump)) this.crouch = false;
    const mx = input.moveX, my = input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    const aiming = g.weapons && g.weapons.aiming;
    const strafe = aiming || g.cam.fp; // first person: the body always faces where you look
    let target = 0;
    let moveYaw = this.heading;
    if (strafe) this.heading = dampAngle(this.heading, camYaw, g.cam.fp ? 40 : 22, dt); // face where the crosshair points
    // how long you have kept walking (a moment's let-go to change keys does not count): after RUN_AFTER s, a run
    if (mag > 0.5 && !aiming && !this.crouch && !this.carry) { this.holdT = (this.holdT || 0) + dt; this.letT = 0; }
    else { this.letT = (this.letT || 0) + dt; if (this.letT > 0.3 || aiming || this.crouch) this.holdT = 0; }
    if (mag > 0.05) {
      // camera-relative direction: forward = camera yaw, right = (-cos, sin)
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const rx = -fz, rz = fx;
      const dx = fx * my + rx * mx, dz = fz * my + rz * mx;
      let want = Math.atan2(dx, dz);
      if (!strafe && !g.interior && this.grounded) want = this.alongStreet(want);
      moveYaw = want;
      this.turnRate = strafe ? 0 : wrapAngle(want - this.heading);
      if (!strafe && !this.char.isHero) this.heading = dampAngle(this.heading, want, 12 * PERK.turn, dt); // (the hero turns on its springs)
      const sprint = input.sprint && this.stamina > 0.05 && !aiming && !this.crouch && !this.carry;
      const pace = lerp(PACE, JOG * PERK.run, smoothstep(RUN_AFTER, RUN_AFTER + 0.9, this.holdT || 0));
      target = this.crouch ? CROUCH * Math.max(0.4, mag) : aiming ? WALK * 1.25 * Math.max(0.5, mag) : sprint ? SPRINT * PERK.run * Math.max(0.6, mag) : mag < 0.5 ? PACE * 0.8 : pace * mag;
      if (this.carry) target = Math.min(target, 2.4); // a box or a tray in the hands
      if (sprint) this.stamina = Math.max(0, this.stamina - dt * 0.12 * PERK.stamina); else this.stamina = Math.min(1, this.stamina + dt * 0.2 * PERK.regen);
    } else { this.turnRate = 0; this.stamina = Math.min(1, this.stamina + dt * 0.3 * PERK.regen); }
    let ns;
    const hero = !!this.char.isHero, mm = hero ? this.heroSprings(dt, target, moveYaw, mag > 0.05, strafe, camYaw) : null;
    if (hero) this.leanUpdate(dt, strafe);
    if (hero) ns = Math.hypot(this.vel.x, this.vel.z);
    else {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      ns = damp(hs, target, this.grounded ? 10 * PERK.turn : 1.5, dt);
      const vy = strafe ? moveYaw : this.heading; // strafe while aiming / in first person
      this.vel.x = Math.sin(vy) * ns;
      this.vel.z = Math.cos(vy) * ns;
    }
    // how far you can be heard (metres): the police and people inside houses notice you within it
    this.noise = !this.grounded ? 6 : this.crouch ? (ns > 0.3 ? 1.2 : 0.4) : ns > 4.2 ? 13 : ns > 2.2 ? 7 : ns > 0.3 ? 3.5 : 0.8;
    // jump & gravity
    if (this.grounded && input.jump) { this.vel.y = 4.6 * Math.sqrt(PERK.jump); this.grounded = false; g.audio.sfx('jump'); }
    // short steps (a slow frame must not jump a wall), and never through one: a step — or a push out of a tight
    // corner, like the gap between a shower tray and the wall — that would cross a wall is undone
    {
      const col = g.map.collider;
      const n = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.1));
      for (let k = 0; k < n; k++) {
        const ox = this.pos.x, oz = this.pos.z;
        this.pos.x += (this.vel.x * dt) / n;
        this.pos.z += (this.vel.z * dt) / n;
        this.collide();
        if (col.crosses && col.crosses(ox, oz, this.pos.x, this.pos.z)) { this.pos.x = ox; this.pos.z = oz; }
      }
    }
    // floor under the feet: street level outside; inside a two-storey house the stairs and the upper floor
    const gy = g.interior && g.interior.floorY ? g.interior.floorY(this.pos.x, this.pos.z, this.pos.y) : 0;
    if (!this.grounded) {
      this.vel.y -= 13 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= gy) { this.pos.y = gy; this.grounded = true; if (this.vel.y < -3) g.audio.sfx('land'); this.vel.y = 0; }
    } else if (gy < this.pos.y - 0.4) { this.grounded = false; this.vel.y = 0; } // stepped off an edge
    else this.pos.y = gy;
    // footsteps: the hero's on the very frame each foot lands (the capture says when), a little puff of dust kicked up
    // by a sprinting foot — so what is heard and seen keeps the stride's own beat; others' by distance
    const mpl = hero && this.char.mp;
    if (mpl) {
      const fs = this._fs || (this._fs = { L: mpl.contactL, R: mpl.contactR });
      for (const sd of ['L', 'R']) {
        const c = sd === 'L' ? mpl.contactL : mpl.contactR;
        if (c && !fs[sd] && this.grounded && ns > 0.8) {
          g.audio.sfx('footstep', { vol: this.crouch ? 0.08 : ns > 5 ? 0.6 : ns > 2.5 ? 0.42 : 0.3 });
          if (ns > 4.4 && !g.interior) this.footDust(sd, ns);
        }
        fs[sd] = c;
      }
    } else if (this.grounded && ns > 1) {
      this.stepAcc = (this.stepAcc || 0) + ns * dt;
      const stride = ns > 5 ? 1.5 : ns > 3 ? 1.1 : 0.75;
      if (this.stepAcc > stride) { this.stepAcc = 0; g.audio.sfx('footstep', { vol: this.crouch ? 0.08 : ns > 5 ? 0.6 : 0.35 }); }
    }
    // weapons (fists, bat, guns) — not while a stall's menu is open: its number keys and B would draw a gun or
    // throw a punch at the stallholder
    const menu = (g.mercadillo && g.mercadillo.menu) || (g.homeSafe && g.homeSafe.menu.open) || (g.decor && g.decor.placing) || (g.fishing && g.fishing.active);
    if (menu) { /* the menu has the keys */ } else if (g.weapons) g.weapons.update(dt, input, this); else if (input.attack && this.punchCd <= 0) this.punch();
    // enter vehicle
    if (input.enter && !menu) this.tryEnter();
    const bare = !g.weapons || (g.weapons.cur === 'punos' && !g.weapons.aiming); // idle fidgets only with empty hands
    const moveDir = this.moveDir = strafe && ns > 0.2 ? wrapAngle(moveYaw - this.heading) : 0; // aiming: sidesteps and walking backwards
    const sw = g.hud.subWho, talking = !!sw && (sw === 'Tú' || sw === (this.char.desc && this.char.desc.name));
    // standing and saying a line: the hands talk too
    if (talking && ns < 0.3 && !this.char.base && (!g.weapons || g.weapons.cur === 'punos')) { this.char.setBase('talk'); this.talkBase = true; }
    else if (this.talkBase && (!talking || ns >= 0.3)) { if (this.char.base === 'talk') this.char.setBase(null); this.talkBase = false; }
    this.char.update(dt, ns, { grounded: this.grounded, vy: this.vel.y, turn: this.turnRate, fidget: bare && !g.cam.fp && !this.crouch && !talking, crouch: this.crouch, moveDir, talking, mm });
    if (g.weapons) g.weapons.postPose(this, dt); // gun in both hands (after the body is posed)
    this.syncChar();
  }

  // the hero's movement (Daniel Holden's spring character): the velocity chases the one the stick asks for and the
  // facing chases the way it points, both critically damped, so the body arcs round a turn, slows through a reversal
  // and pivots, and its motion capture is matched to where these springs say it will be (the trajectory)
  heroSprings(dt, target, moveYaw, moving, strafe, camYaw) {
    const s = this.spr || (this.spr = { x: [0, 0], v: [this.vel.x, this.vel.z], a: [0, 0], yaw: { x: this.heading, v: 0 }, goal: [0, 0] });
    if (Math.abs(s.v[0] - this.vel.x) + Math.abs(s.v[1] - this.vel.z) > 0.5) { s.v[0] = this.vel.x; s.v[1] = this.vel.z; s.a[0] = s.a[1] = 0; } // (pushed, stopped by a wall…)
    const sp = moving ? target : 0;
    s.goal[0] = Math.sin(moveYaw) * sp; s.goal[1] = Math.cos(moveYaw) * sp;
    const hl = this.grounded ? (sp > 4.5 ? 0.32 : 0.22) / Math.sqrt(PERK.turn) : 1.2; // (a sprint takes longer to build and to brake)
    s.x[0] = s.x[1] = 0;
    springCharacter(s.x, s.v, s.a, s.goal, hl, dt);
    this.vel.x = s.v[0]; this.vel.z = s.v[1];
    // facing: where the stick points while it is held (the crosshair when aiming); a stop keeps the last one
    const want = strafe ? camYaw : moving ? moveYaw : s.yaw.x;
    s.yaw.x = this.heading;
    springAngle(s.yaw, want, strafe ? 0.06 : 0.14 / PERK.turn, dt);
    this.heading = s.yaw.x;
    // all of it in the character's own frame (side +x = its left, forward +z) for the motion matching
    const h = this.heading, c = Math.cos(h), sn = Math.sin(h);
    const loc = (wx, wz, out) => { out[0] = wx * c - wz * sn; out[1] = wx * sn + wz * c; return out; };
    const m = this.mmOpts || (this.mmOpts = { vel: [0, 0], goal: [0, 0], acc: [0, 0], turn: 0, yawVel: 0, halfLife: 0.22, turnHalfLife: 0.14 });
    loc(s.v[0], s.v[1], m.vel); loc(s.goal[0], s.goal[1], m.goal); loc(s.a[0], s.a[1], m.acc);
    m.turn = wrapAngle(want - h); m.yawVel = s.yaw.v; m.halfLife = hl; m.turnHalfLife = strafe ? 0.06 : 0.14;
    return m;
  }

  // a sprinting foot kicks up a little dust where it lands (in the claymation, a pinch of cotton wool)
  footDust(sd, ns) {
    const g = this.game, B = this.char.bones, toe = B && B['toe' + sd];
    if (!toe || !g.effects || !g.effects.smoke) return;
    const w = toe.getWorldPosition(this._dw || (this._dw = new THREE.Vector3())), k = Math.min(1, (ns - 4.4) / 2);
    for (let i = 0; i < 3; i++) {
      g.effects.smoke.emit(w.x + (Math.random() - 0.5) * 0.12, 0.06, w.z + (Math.random() - 0.5) * 0.12,
        (Math.random() - 0.5) * 0.7 - this.vel.x * 0.06, 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * 0.7 - this.vel.z * 0.06,
        0.45 + Math.random() * 0.25, 0.12, 0.42 + 0.2 * k, 0.78, 0.72, 0.62, 0.3 + 0.15 * k);
    }
  }

  // The hero leans into what it does, as a runner does (and as the best-animated game characters are made to: a body
  // that runs round a corner bolt upright reads as weightless): into a turn by the pull of the turn, forwards as it
  // speeds up and in a sprint, back as it brakes. Worked out from the same springs that move it, softened by springs
  // of its own so it never snaps; the whole body tilts at the feet (syncChar), the head keeps level (hero.steadyHead).
  leanUpdate(dt, strafe) {
    const L = this.lean || (this.lean = { p: { x: 0, v: 0 }, r: { x: 0, v: 0 } }), s = this.spr;
    let pt = 0, rt = 0;
    if (s && this.mode === 'foot' && this.grounded && !this.knock) {
      const h = this.heading, sp = Math.hypot(this.vel.x, this.vel.z);
      const af = s.a[0] * Math.sin(h) + s.a[1] * Math.cos(h); // (speeding up along the way it faces)
      // (braking: back while there is speed to shed, upright again as it dies away)
      pt = clamp((0.5 * af * (af < 0 ? smoothstep(0.4, 3, sp) : 1)) / 9.81 + 0.08 * smoothstep(3.6, 6.4, sp), -0.09, 0.2);
      rt = clamp(-0.5 * Math.atan((sp * (s.yaw.v || 0)) / 9.81), -0.22, 0.22); // (a turn's pull: speed × turn rate)
      if (strafe || this.crouch || this.carry) { pt *= 0.3; rt *= 0.3; }
    }
    springDamper(L.p, pt, 0.12, dt); springDamper(L.r, rt, 0.1, dt);
  }

  // walking a street, the way you go settles on the street's own direction (a diagonal or a curving one too), unless
  // you clearly mean another way: within ~40° of it you follow it, the nearer the more; crossing it stays yours
  alongStreet(want) {
    const map = this.game.map;
    if (!map.edgesNear) return want;
    const x = this.pos.x, z = this.pos.z, t = this._st || (this._st = {});
    let best = null, bs = -1e9;
    for (const id of map.edgesNear(x, z, 10)) {
      const e = map.edges[id];
      if (!(e.walk || e.drive) || e.blocked || e.len < 4) continue;
      const q = polyNearest(e.pts, e.cum, x, z);
      const reach = Math.max(e.facade || 0, (e.w || 3) / 2 + (e.sw || 0) + 1.2); // its carriageway and pavements
      if (q.d > reach) continue;
      polySample(e.pts, e.cum, q.s, t);
      const ty = Math.atan2(t.dx, t.dz);
      let d = Math.abs(wrapAngle(ty - want)), back = false;
      if (d > Math.PI / 2) { d = Math.PI - d; back = true; }    // either way along it
      const sc = Math.cos(d) - q.d / (reach * 5);
      if (d < 0.72 && sc > bs) { bs = sc; best = { yaw: back ? ty + Math.PI : ty, d }; }
    }
    if (!best) return want;
    return want + smoothstep(0.72, 0.28, best.d) * wrapAngle(best.yaw - want);
  }

  syncChar() {
    const ch = this.char, o = ch.object;
    // a ragdoll places the body itself: the player is wherever its hips are
    if (ch.rag) { ch.ragPos(this.pos); this.pos.y = ch.rag.floorY; return; }
    o.position.copy(this.pos);
    // (the hero's lean, at the feet: turned first to its heading, then tilted about its own right and forward axes)
    const L = ch.isHero && this.mode === 'foot' && this.lean ? this.lean : null;
    if (L) { o.rotation.order = 'YXZ'; o.rotation.set(L.p.x, this.heading, L.r.x); ch.leanP = L.p.x; ch.leanR = L.r.x; }
    else { o.rotation.set(0, this.heading, 0); if (ch.isHero) ch.leanP = ch.leanR = 0; }
    // swimming: the body in the water up to the shoulders (a little higher when stretched out in the crawl)
    if (this.mode === 'swim' && this.swim) o.position.y = this.swim.pool.y - (1.36 - 0.22 * smoothstep(0.12, 0.8, this.swim.sp)) * ((ch.isHero ? 1 : ch.scale) || 1);
    if (ch.afterMove) ch.afterMove(); // (the hero's feet locked to the ground, now that the body is where it goes)
  }
  // the floor and the walls a falling body meets (indoors too)
  ragEnv() {
    const g = this.game;
    return this._re || (this._re = { floor: (x, z, y) => (g.interior && g.interior.floorY ? g.interior.floorY(x, z, y) : 0), collide: (p, r) => g.map.collider.resolveCircle(p, r), crosses: (ax, az, bx, bz) => g.map.collider.crosses && g.map.collider.crosses(ax, az, bx, bz) });
  }

  collide() {
    const g = this.game;
    const r = g.map.collider.resolveCircle(this.pos, 0.34);
    // vehicles as boxes
    for (const v of g.fleet.vehicles) {
      const dx = this.pos.x - v.x, dz = this.pos.z - v.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lf = dx * fx + dz * fz, ll = dx * -fz + dz * fx;
      const ex = v.hl + 0.3, ez = v.hw + 0.3;
      if (Math.abs(lf) < ex && Math.abs(ll) < ez) {
        // hit by moving car?
        const rel = Math.hypot(v.vx - this.vel.x, v.vz - this.vel.z);
        if (v.vel > 4.5 && rel > 4 && !this.knock && v !== this.vehicle) { this.knockDown(v.vx * 0.7, v.vz * 0.7, Math.min(60, v.vel * 3.2)); g.onPlayerHitByCar && g.onPlayerHitByCar(v); return; }
        const px = ex - Math.abs(lf), pz = ez - Math.abs(ll);
        if (px < pz) { const s = Math.sign(lf) * px; this.pos.x += fx * s; this.pos.z += fz * s; }
        else { const s = Math.sign(ll) * pz; this.pos.x += -fz * s; this.pos.z += fx * s; }
      }
    }
    // keep inside the playable area (not inside a house: interiors live far outside the town)
    if (!g.interior) {
      const b = g.map.bounds;
      this.pos.x = clamp(this.pos.x, b.x0 + 20, b.x1 - 20);
      this.pos.z = clamp(this.pos.z, b.z0 + 20, b.z1 - 20);
    }
  }

  punch() {
    const g = this.game;
    this.punchCd = 0.42;
    this.punchSide ^= 1;
    this.char.play(this.punchSide ? 'punch' : 'punch2', 0.42);
    g.audio.sfx('punch');
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rs = g.interior && g.interiors.life && g.interiors.life.hitTest(this.pos.x + fx * 0.9, this.pos.z + fz * 0.9, 0.9);
    if (rs) { setTimeout(() => g.audio.sfx('punch_hit'), 120); g.interiors.life.damage(rs, 30, fx * 3, fz * 3, 'fist'); return; }
    const hit = g.peds.hitTest(this.pos.x + fx * 0.9, this.pos.z + fz * 0.9, 0.9, this);
    if (hit) {
      setTimeout(() => g.audio.sfx('punch_hit', { x: hit.x, z: hit.z }), 120);
      g.peds.punched(hit, fx, fz, this);
    } else {
      const cop = g.police && g.police.hitTest(this.pos.x + fx * 0.9, this.pos.z + fz * 0.9, 0.9);
      if (cop) { setTimeout(() => g.audio.sfx('punch_hit'), 120); g.police.punched(cop, fx, fz); }
    }
  }

  knockDown(vx, vz, dmg) {
    if (this.mode === 'entering') { this.mode = 'foot'; this.enter = null; }
    const sp = Math.hypot(vx, vz);
    this.knock = { t: 0, down: 0, thud: false };
    this.damage(dmg);
    // limp and thrown (a ragdoll): a car sweeps the legs out, anything else knocks the top half back
    this.char.object.updateMatrixWorld(true);
    this.char.ragdoll(sp > 5 ? { vel: [vx * 0.9, 1.8 + sp * 0.12, vz * 0.9], legs: 0.5, up: -0.2, tone: 0.6, env: this.ragEnv(), dead: this.health <= 0 }
      : { vel: [vx, 1.0, vz], up: 0.7, legs: -0.3, tone: 0.8, env: this.ragEnv(), dead: this.health <= 0 });
    this.game.audio.sfx(this.char.desc.gender === 'f' ? 'yelp_f' : 'yelp_m');
    this.game.cam.shake(0.5);
  }
  updateKnock(dt) {
    const k = this.knock, ch = this.char;
    k.t += dt;
    ch.update(dt, 0, {});
    if (ch.rag) {
      const rag = ch.rag;
      if (rag.landed && !k.thud) { k.thud = true; this.game.audio.sfx('land'); }
      // lying still a moment (or a few seconds on), and up again, from the back or the front
      if (rag.sleeping || k.t > 2.2) k.down += dt;
      if (k.down > 0.5 && this.mode === 'foot' && this.health > 0) {
        const up = ch.getUp();
        if (up) { this.pos.set(up.x, rag.floorY, up.z); this.heading = up.heading; }
      }
    } else if (!ch.gettingUp) this.knock = null;
    this.syncChar();
  }

  damage(d) {
    if (this.mode === 'dead') return;
    d *= PERK.hurt;
    // the vest soaks up most of it while it lasts
    if (this.armor > 0) { const a = Math.min(this.armor, d * 0.7); this.armor -= a; d -= a; }
    this.health = Math.max(0, this.health - d);
    this.hurtT = 0.6;
    this.game.hud && this.game.hud.flashDamage();
    if (this.health <= 0) this.game.onPlayerDeath();
  }

  // ---------------- vehicles
  tryEnter() {
    const g = this.game;
    const col = g.map.collider;
    // multiplayer: next to a friend's car you get in as the passenger
    if (g.net && g.net.active) { const rc = g.net.rideCandidate(this.pos.x, this.pos.z); if (rc) { this.boardRide(rc); return; } }
    let best = null, bd = 4.2;
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    for (const v of g.fleet.vehicles) {
      if (v.dead || v.remote) continue;
      const dx = v.x - this.pos.x, dz = v.z - this.pos.z, dist = Math.hypot(dx, dz);
      // the nearest one, and the one you are facing (a bicycle against the wall beats the car behind you)
      const d = dist - v.hw - ((dx * hx + dz * hz) / (dist || 1)) * 0.6;
      if (d >= bd) continue;
      // must be reachable: no wall between us and the car
      if (col.raycast(this.pos.x, this.pos.z, v.x, v.z, 1.0, 1.0) < 0.98) continue;
      bd = d; best = v;
    }
    if (!best) return;
    const v = best;
    const info = g.fleet.renderer.info(v.model);
    // door side: driver = local +x (left side of car)
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lx = fz, lz = -fx; // left vector = -right
    const dp = info.door;
    const doorX = v.x + lx * dp.x + fx * dp.z, doorZ = v.z + lz * dp.x + fz * dp.z;
    this.enter = { v, t: 0, doorX, doorZ, carjack: !!v.ai && v.ai.mode === 'traffic', cop: v.spec.livery === 'local' || v.spec.livery === 'gc', locked: !v.ai && v.locked && !v.opened };
    this.mode = 'entering';
    if (this.enter.carjack) { v.ai.hold = 2.5; } // the driver brakes while we pull the door
    else if (this.enter.locked) { g.audio.sfx(v.spec.twoWheel ? 'ui_click' : PERK.lockpick ? 'door_open' : 'car_break_in', { x: v.x, z: v.z }); }
  }
  updateEntering(dt) {
    const e = this.enter;
    const v = e.v;
    const g = this.game;
    e.t += dt;
    // walk to the door
    const dx = e.doorX - this.pos.x, dz = e.doorZ - this.pos.z;
    const d = Math.hypot(dx, dz);
    let sp = 0;
    // could not reach the door (blocked by a wall or another car): give up
    if (!e.atDoor && e.t > 2.4 && d > 1.3) { this.mode = 'foot'; this.enter = null; this.char.update(dt, 0, {}); this.syncChar(); return; }
    if (d > 0.3 && e.t < 2.4 && !e.atDoor) {
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 14, dt);
      sp = Math.min(JOG, d * 5);
      this.pos.x += (dx / d) * sp * dt; this.pos.z += (dz / d) * sp * dt;
      this.collide();
    } else {
      if (!e.atDoor) {
        e.atDoor = e.t;
        this.heading = v.heading;
        if (e.carjack && v.ai) g.onCarjack(v);
        if (e.locked && !PERK.lockpick) { this.char.play('punch', 0.5); }
        else if (!v.spec.twoWheel) { this.char.play('enter', 0.5); g.audio.sfx('door_open', { x: v.x, z: v.z }); }
      }
      const wait = e.locked ? (PERK.lockpick ? 0.6 : 1.3) : PERK.lockpick ? 0.3 : 0.45; // the mechanic opens it with a wire, no glass broken
      if (e.t - e.atDoor > wait) {
        if (e.locked) {
          v.opened = true;
          if (!PERK.lockpick && Math.random() < 0.55) { g.audio.sfx('alarm', { x: v.x, z: v.z }); g.police.crime('breakin', v.x, v.z); }
        }
        this.getIn(v);
        return;
      }
    }
    if (v.vel > 3 || v.dead || v.removed || (v.driver && v.driver !== 'player' && !e.carjack)) { this.mode = 'foot'; this.enter = null; }
    this.char.update(dt, sp, {});
    this.syncChar();
  }
  getIn(v) {
    const g = this.game;
    this.vehicle = v;
    this.mode = 'car';
    this.enter = null;
    v.driver = 'player';
    v.sleeping = false;
    v.parked = false;
    v.keep = true;
    // which parked car it was: every town parks the same cars, so friends can draw this very one
    if (v.spot) v.fromSpot = g.fleet.spots.indexOf(v.spot);
    else if (v.fromSpot === undefined) v.fromSpot = -1;
    if (v.spot) { v.spot.taken = true; v.spot.vehicle = null; v.spot = null; }
    if (v.ai) g.traffic.release(v);
    this.char.object.visible = !!v.spec.twoWheel;
    if (v.spec.twoWheel) this.char.setBase(v.spec.shape === 'bici' ? 'bici' : 'moto');
    if (g.weapons) { g.weapons.aiming = false; g.weapons.syncModel(this.char); }
    if (!v.spec.twoWheel) g.audio.sfx('door_close', { x: v.x, z: v.z });
    g.onEnterVehicle(v);
  }
  exitVehicle(force = false) {
    const g = this.game;
    const v = this.vehicle;
    if (!v) return;
    const info = g.fleet.renderer.info(v.model);
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lx = fz, lz = -fx;
    let side = 1;
    const tryPos = (s) => {
      const x = v.x + lx * (v.hw + 0.6) * s + fx * info.door.z, z = v.z + lz * (v.hw + 0.6) * s + fz * info.door.z;
      return { x, z, ok: !g.map.buildingAt(x, z) && g.map.collider.raycast(v.x, v.z, x, z, 1, 1) > 0.98 };
    };
    let p = tryPos(1);
    if (!p.ok) { p = tryPos(-1); side = -1; }
    if (!p.ok) { p = { x: v.x - fx * (v.hl + 0.8), z: v.z - fz * (v.hl + 0.8) }; }
    const bail = !force && v.vel > 5;
    v.driver = null;
    v.throttle = 0; v.brake = bail ? 0 : 1; v.steerIn = 0; v.handbrake = bail ? 0 : 1;
    v.siren = false;
    this.vehicle = null;
    this.mode = 'foot';
    this.char.object.visible = true;
    this.pos.set(p.x, 0, p.z);
    this.heading = v.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.char.setBase(null);
    this.char.object.rotation.order = 'XYZ'; this.char.object.rotation.set(0, this.heading, 0);
    if (!v.spec.twoWheel) g.audio.sfx('door_open', { x: v.x, z: v.z });
    g.onExitVehicle(v);
    if (bail) { v.coastT = 3.5; this.knockDown(v.vx * 0.5 + lx * 2 * side, v.vz * 0.5 + lz * 2 * side, Math.min(20, v.vel * 1.2)); }
  }
  // ---------------- sitting (terraces, benches, the neighbours' chairs, sofas at home)
  sitOn(s) {
    const g = this.game;
    if (g.weapons) { g.weapons.aiming = false; if (g.weapons.cur !== 'punos') { this.holstered = g.weapons.cur; g.weapons.select('punos'); } g.weapons.syncModel && g.weapons.syncModel(this.char); }
    this.mode = 'sit'; this.seat = s; this.crouch = false;
    this.standPos = { x: this.pos.x, z: this.pos.z };
    this.pos.set(s.x, s.y || this.pos.y, s.z); this.vel.set(0, 0, 0);
    this.heading = s.h;
    this.char.setBase(s.kind === 'banco' ? 'sit' : 'sitTalk');
    this.syncChar();
  }
  standUp() {
    const s = this.seat, g = this.game;
    this.mode = 'foot'; this.seat = null;
    this.char.setBase(null);
    if (this.holstered && g.weapons) { g.weapons.select(this.holstered); this.holstered = null; }
    if (s) {
      // step forward off the seat (or back where you were)
      const fx = Math.sin(s.h), fz = Math.cos(s.h);
      const x = s.x + fx * 0.6, z = s.z + fz * 0.6;
      if (this.game.map.collider.raycast(s.x, s.z, x, z, 0.5, 0.5) > 0.95 && !this.game.map.buildingAt(x, z)) this.pos.set(x, this.pos.y, z);
      else if (this.standPos) this.pos.set(this.standPos.x, this.pos.y, this.standPos.z);
    }
    this.syncChar();
  }
  updateSit(dt, input) {
    const g = this.game, s = this.seat;
    this.vel.set(0, 0, 0);
    this.noise = 0.3;
    this.stamina = Math.min(1, this.stamina + dt * 0.35 * PERK.regen);
    if (s) { this.pos.set(s.x, s.y || this.pos.y, s.z); this.heading = s.h; }
    // walking off (move keys / stick) stands you up, unless you are choosing from the menu
    if (!(g.seats && g.seats.menuOpen) && Math.hypot(input.moveX, input.moveY) > 0.6) { g.seats ? g.seats.standUp() : this.standUp(); return; }
    this.char.update(dt, 0, { fidget: false });
    this.syncChar();
  }
  // ---------------- swimming in the municipal pool: in the water up to the shoulders, inside its walls. You swim the
  // way you face (a swimmer turns, it does not side-step); Mayús swims faster and tires; out by a ladder or the edge
  startSwim(pool, x, z, dive = false) {
    const g = this.game;
    if (g.weapons) { g.weapons.aiming = false; if (g.weapons.cur !== 'punos') { g.weapons.select('punos'); if (g.weapons.syncModel) g.weapons.syncModel(this.char); } }
    this.mode = 'swim'; this.swim = { pool, t: 0, stroke: 0, sp: dive ? 1.2 : 0 };
    this.crouch = false; this.vel.set(0, 0, 0); this.pos.set(x, 0, z);
    // facing along the water, away from the nearer end
    const lx = (x - pool.cx) * pool.ux + (z - pool.cz) * pool.uz, sgn = lx > 0 ? -1 : 1;
    this.heading = Math.atan2(pool.ux * sgn, pool.uz * sgn);
    this.char.setBase('swim');
    g.audio.sfx('splash', { x, z, vol: dive ? 1 : 0.7 });
    g.hint('swim', `<b>Nadando</b>: ${g.input.device === 'touch' ? 'el joystick te lleva' : 'muévete como andando'}; ${g.input.device === 'touch' ? '' : '<kbd>Mayús</kbd> nada más rápido (cansa); '}para salir, ve a una escalera o al borde.`, 7);
    this.syncChar();
  }
  leaveSwim(x, z) {
    const g = this.game;
    this.mode = 'foot'; this.swim = null;
    this.char.setBase(null);
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0);
    this.wetT = 40; // (dripping for a while)
    const n = Math.min(100, this.health + 20) - this.health; this.health += n;
    g.audio.sfx('splash', { x, z, vol: 0.35 });
    g.hud.notify(`Sales chorreando${n > 0 ? ` · +${Math.round(n)} de salud` : ''}. ¡Qué gusto con este calor!`, 'ok', 3);
    this.syncChar();
  }
  updateSwim(dt, input, camYaw) {
    const g = this.game, s = this.swim, P = s.pool;
    const mx = input.moveX, my = input.moveY, mag = Math.min(1, Math.hypot(mx, my));
    let want = this.heading, target = 0;
    const fast = input.sprint && this.stamina > 0.05 && mag > 0.05;
    if (mag > 0.05) {
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;
      want = Math.atan2(fx * my + rx * mx, fz * my + rz * mx);
      target = mag * (fast ? 1.75 : 1.05) * Math.max(0.35, Math.cos(wrapAngle(want - this.heading))); // (turning first, then off)
    }
    if (fast) this.stamina = Math.max(0, this.stamina - dt * 0.16 * PERK.stamina);
    else this.stamina = Math.min(1, this.stamina + dt * 0.12 * PERK.regen);
    this.heading = dampAngle(this.heading, want, 2.6 * PERK.turn, dt);
    s.sp = damp(s.sp, target, target > s.sp ? 1.6 : 2.4, dt);
    let x = this.pos.x + Math.sin(this.heading) * s.sp * dt, z = this.pos.z + Math.cos(this.heading) * s.sp * dt;
    // the walls of the pool
    const dx = x - P.cx, dz = z - P.cz, ex = P.hl - 0.45, ez = P.hd - 0.45;
    let lx = dx * P.ux + dz * P.uz, lz = -dx * P.uz + dz * P.ux;
    if (Math.abs(lx) > ex || Math.abs(lz) > ez) s.sp *= Math.exp(-6 * dt);
    lx = clamp(lx, -ex, ex); lz = clamp(lz, -ez, ez);
    x = P.cx + lx * P.ux - lz * P.uz; z = P.cz + lx * P.uz + lz * P.ux;
    this.vel.set((x - this.pos.x) / Math.max(dt, 1e-3), 0, (z - this.pos.z) / Math.max(dt, 1e-3));
    this.pos.set(x, 0, z);
    this.noise = 0.2;
    // every stroke a splash
    s.t += dt; s.stroke += dt * (0.5 + s.sp * 0.9);
    if (s.sp > 0.3 && s.stroke > 1) { s.stroke = 0; g.audio.sfx('splash', { x, z, vol: 0.12 + 0.1 * Math.min(1, s.sp), pitch: 1.2 + Math.random() * 0.3 }); }
    this.char.swimSpeed = s.sp;
    this.char.update(dt, 0, { fidget: false, grounded: false, turn: 0 });
    this.syncChar();
  }
  // where a swimmer can climb out: a ladder near, or the edge of the water
  swimExit() {
    const s = this.swim;
    if (!s) return null;
    const P = s.pool, lad = P.ladders.find((q) => Math.hypot(q.wx - this.pos.x, q.wz - this.pos.z) < 1.7);
    if (lad) return { label: 'Salir por la escalera', x: lad.x, z: lad.z };
    const dx = this.pos.x - P.cx, dz = this.pos.z - P.cz, lx = dx * P.ux + dz * P.uz, lz = -dx * P.uz + dz * P.ux;
    const gx = P.hl - Math.abs(lx), gz = P.hd - Math.abs(lz);
    if (Math.min(gx, gz) > 0.75) return null;
    // out over the side nearest you, onto the deck
    let ox = lx, oz = lz;
    if (gx < gz) ox = Math.sign(lx) * (P.hl + P.cw + 0.9); else oz = Math.sign(lz) * (P.hd + P.cw + 0.9);
    return { label: 'Salir por el borde', x: P.cx + ox * P.ux - oz * P.uz, z: P.cz + ox * P.uz + oz * P.ux };
  }
  // ---------------- hiding in a rubbish container (the police cannot see you; they may open it)
  hideInContainer(c) {
    const g = this.game;
    if (g.weapons) { g.weapons.aiming = false; g.weapons.syncModel && g.weapons.syncModel(this.char); }
    g.police.onHide('cont', c); // did anyone see you get in?
    this.mode = 'hidden'; this.hideIn = c; this.crouch = false;
    this.outPos = { x: this.pos.x, z: this.pos.z };
    this.pos.set(c.x, 0, c.z); this.vel.set(0, 0, 0);
    this.char.object.visible = false;
    g.cam.peekYaw = Math.atan2(this.outPos.x - c.x, this.outPos.z - c.z) + Math.PI; // looking out the side you got in
    g.audio.sfx('lid', { x: c.x, z: c.z });
    document.body.classList.add('hiding-cont');
    g.hud.notify('Te escondes en el contenedor. Nadie te ve… si no te han visto entrar.', 'info', 3);
  }
  // forced: an officer opened the lid and pulls you out
  leaveContainer(forced = false) {
    const g = this.game, c = this.hideIn;
    if (!c) return;
    this.hideIn = null; this.mode = 'foot';
    document.body.classList.remove('hiding-cont');
    // step out where you got in (or the first free spot around it)
    let best = this.outPos && Math.hypot(this.outPos.x - c.x, this.outPos.z - c.z) < 2.5 ? this.outPos : null;
    if (!best || g.map.buildingAt(best.x, best.z)) {
      for (let k = 0; k < 8 && !best; k++) {
        const a = (k / 8) * Math.PI * 2, x = c.x + Math.sin(a) * 1.35, z = c.z + Math.cos(a) * 1.35;
        if (!g.map.buildingAt(x, z) && g.map.collider.raycast(c.x, c.z, x, z, 0.5, 0.5) > 0.9) best = { x, z };
      }
    }
    best = best || { x: c.x + 1.3, z: c.z };
    this.pos.set(best.x, 0, best.z); this.vel.set(0, 0, 0);
    this.heading = Math.atan2(best.x - c.x, best.z - c.z);
    this.char.object.visible = !g.cam.fp;
    g.audio.sfx('lid', { x: c.x, z: c.z, pitch: 1.1 });
    this.syncChar();
    if (forced) this.knockDown(Math.sin(this.heading) * 2, Math.cos(this.heading) * 2, 0);
  }
  updateHidden(dt, input) {
    const c = this.hideIn;
    if (!c || c.broken) { this.leaveContainer(); return; } // knocked over by a car: out you go
    this.vel.set(0, 0, 0);
    this.noise = 0;
    this.stamina = Math.min(1, this.stamina + dt * 0.3 * PERK.regen);
    this.char.object.visible = false;
    this.char.update(dt, 0, {});
  }
  // ---------------- riding with a friend (multiplayer): sat on the right, the driver steers
  boardRide(rc) {
    const g = this.game;
    this.ride = rc; this.mode = 'passenger';
    this.vel.set(0, 0, 0);
    this.char.object.visible = false;
    if (g.weapons) { g.weapons.aiming = false; g.weapons.syncModel(this.char); }
    g.audio.sfx('door_close', { x: rc.v.x, z: rc.v.z });
    g.hud.notify(`Vas de copiloto con ${rc.name}. ${g.input.keyText('F', 3, 'Bajar')} para bajarte.`, 'ok', 4);
  }
  updatePassenger(dt, input) {
    const r = this.ride, v = r && r.v;
    if (!v || v.removed || !v.remote) { this.leaveRide(); return; }
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    this.pos.set(v.x - fz * 0.38, 0, v.z + fx * 0.38);
    this.heading = v.heading;
    this.char.object.visible = false;
    if (input.enter && v.vel < 14) { this.leaveRide(); return; }
    this.char.update(dt, 0, {});
    this.syncChar();
  }
  leaveRide() {
    const g = this.game, v = this.ride && this.ride.v;
    this.ride = null; this.mode = 'foot';
    this.char.object.visible = !g.cam.fp;
    this.char.setBase(null);
    this.vel.set(0, 0, 0);
    if (v && !v.removed) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      let x = v.x - fz * (v.hw + 0.6), z = v.z + fx * (v.hw + 0.6);
      if (g.map.buildingAt(x, z) || g.map.collider.raycast(v.x, v.z, x, z, 1, 1) < 0.98) { x = v.x + fz * (v.hw + 0.6); z = v.z - fx * (v.hw + 0.6); }
      this.pos.set(x, 0, z);
      this.heading = v.heading - Math.PI / 2;
      g.audio.sfx('door_open', { x: v.x, z: v.z });
    }
    this.syncChar();
  }
  // on a motorbike or a bicycle: sat on the seat, leaning with it, pedalling
  rideBike(v, dt) {
    const g = this.game, info = g.fleet.renderer.info(v.model), o = this.char.object, s = this.char.scale || 1;
    const bici = v.spec.shape === 'bici';
    // the seat in the world, from the bike's own lean and heading (same Euler order as its matrix)
    const sy = info.seat.y - (bici ? 0.64 : 0.5) * s, sz = info.seat.z;
    const r = v.roll, pt = v.pitch, h = v.heading;
    const x1 = -sy * Math.sin(r), y1 = sy * Math.cos(r);
    const y2 = y1 * Math.cos(pt) - sz * Math.sin(pt), z2 = y1 * Math.sin(pt) + sz * Math.cos(pt);
    o.visible = !g.cam.fp;
    o.rotation.order = 'YXZ';
    o.rotation.set(pt, h, r);
    o.position.set(v.x + x1 * Math.cos(h) + z2 * Math.sin(h), (v.y || 0) + 0.02 + y2, v.z - x1 * Math.sin(h) + z2 * Math.cos(h));
    this.char.pedal = (this.char.pedal || 0) + (Math.max(0, v.speed) / (v.spec.wr || 0.34)) * dt * 0.42;
    this.char.update(dt, 0, { fidget: false });
  }
  updateCar(dt, input) {
    const v = this.vehicle;
    const g = this.game;
    if (!v || v.removed) { this.mode = 'foot'; this.vehicle = null; this.char.object.visible = true; return; }
    v.throttle = input.throttle;
    v.brake = input.brakeIn;
    v.steerIn = input.steer;
    v.handbrake = input.handbrake ? 1 : 0;
    this.pos.set(v.x, 0, v.z);
    this.heading = v.heading;
    if (input.enter && v.vel < 14) this.exitVehicle();
    if (v.dead && v.fire > 0.5 && this.vehicle) { this.exitVehicle(); this.damage(15); }
    if (input.lights) v.lightsOn = !v.lightsOn;
    if (input.siren && (v.spec.livery === 'local' || v.spec.livery === 'gc')) v.siren = !v.siren;
  }
}

// ------------------------------------------------------------------ camera rig
export class CameraRig {
  constructor(game, camera) {
    this.game = game;
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = -0.18;
    this.dist = 4.6;
    this.carYawOff = 0;
    this.lastLook = 0;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.shakeAmt = 0;
    this.fov = 62;
    this.cinematic = null; // {from, to, look, t, dur}
    this.sens = 1;
    this.fp = false;      // first person
    this.fpPref = null;   // the player's choice inside houses / horror (null = default: first person)
    this.bobT = 0;
  }
  setFirstPerson(on) {
    this.fp = !!on;
    const ch = this.game.player && this.game.player.char;
    if (ch) ch.object.visible = !this.fp;
    if (this.fp) { this.fov = 72; }
  }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  update(dt, input) {
    const g = this.game;
    const p = g.player;
    const [ldx, ldy] = input.look();
    const s = 0.0026 * this.sens;
    if (this.cinematic) return this.updateCinematic(dt);
    // looking through the rifle scope
    const W = g.weapons;
    if (W && W.scoped) {
      if (p.vehicle || p.mode !== 'foot') W.unscope();
      else { this.scopeHid = true; return this.updateScope(dt, ldx, ldy, s); }
    }
    if (this.scopeHid) { this.scopeHid = false; if (p.char && !this.fp) p.char.object.visible = true; this.fov = 50; }
    if (p.mode === 'hidden' && p.hideIn) return this.updatePeek(dt, ldx, ldy, s);
    const rideV = p.mode === 'passenger' && p.ride ? p.ride.v : null;
    // inside the car (driver or passenger): the cabin view
    const inV = (p.mode === 'car' && p.vehicle) || rideV;
    // on two wheels or a tractor there is no cabin: the rider always shows, and first person is the rider's own eyes
    const open = inV && (inV.spec.twoWheel || inV.spec.shape === 'tractor');
    if (open && p.char && !p.char.object.visible) p.char.object.visible = true; // (first person on foot hides the body)
    if (open && this.carFP) return this.updateRideFP(dt, inV, ldx, ldy, s);
    const cabin = inV && this.carFP && !inV.spec.twoWheel && inV.spec.shape !== 'tractor';
    if (!cabin && this.game.carInterior && this.game.carInterior.v) this.game.carInterior.set(null);
    if (cabin) return this.updateCarFP(dt, inV, rideV ? -1 : 1, ldx, ldy, s);
    if (this.fp && !p.vehicle && !rideV && p.mode !== 'dead') return this.updateFirstPerson(dt, ldx, ldy, s);
    if (input.mouse.wheel && p.vehicle) this.dist = clamp(this.dist + input.mouse.wheel * 0.6, 2.4, 9);
    const col = g.map.collider;
    let tx, ty, tz, dist, fovT = 62;
    if ((p.mode === 'car' && p.vehicle) || rideV) {
      const v = p.vehicle || rideV;
      if (Math.abs(ldx) + Math.abs(ldy) > 0.5) { this.carYawOff -= ldx * s; this.pitch = clamp(this.pitch - ldy * s, -0.9, 0.35); this.lastLook = 0; }
      this.lastLook += dt;
      if (this.lastLook > 1.4) { this.carYawOff = damp(this.carYawOff, 0, 2.5, dt); this.pitch = damp(this.pitch, -0.16, 2, dt); }
      const back = input.lookBack ? Math.PI : 0;
      const velHeading = v.vel > 3 && v.speed < -1 ? v.heading + Math.PI : v.heading;
      const desired = velHeading + this.carYawOff + back + Math.PI;
      this.yaw = dampAngle(this.yaw, desired, back ? 30 : 4.5, dt);
      const L = v.spec.L;
      dist = L * 0.95 + 3.2 + Math.min(2.5, v.vel * 0.05);
      tx = v.x; ty = v.spec.H * 0.75 + 0.9; tz = v.z;
      fovT = 62 + clamp((v.vel - 12) * 0.22, 0, 6); // (a little wider at speed: more distorts what is ahead)
      this.tgtS = null;
      if (STYLE.plastilina) { dist += 1.6; fovT -= 8; } // (claymation: the set from a little further and higher)
    } else {
      const aim = g.weapons && g.weapons.aiming && !p.knock;
      const sk = aim ? 0.65 : 1; // finer mouse while aiming
      // the turn the mouse (or the stick) asks for, as a rate eased in and out over a few hundredths of a second: the
      // camera starts and stops turning smoothly instead of in steps (the same angle in the end)
      const lv = this.lookV || (this.lookV = { y: { x: 0, v: 0 }, p: { x: 0, v: 0 } }), idt = 1 / Math.max(dt, 1e-3);
      springDamper(lv.y, -ldx * s * sk * idt, aim ? 0.02 : 0.035, dt); springDamper(lv.p, -ldy * s * sk * idt, aim ? 0.02 : 0.035, dt);
      this.yaw += lv.y.x * dt;
      this.pitch = clamp(this.pitch + lv.p.x * dt, -1.1, 0.55);
      if (p.knock) { tx = p.pos.x; ty = 0.9; tz = p.pos.z; }
      else { tx = p.pos.x; ty = p.pos.y + (p.mode === 'swim' ? 0.55 : p.mode === 'sit' ? 1.15 : p.crouch ? 1.05 : 1.55); tz = p.pos.z; }
      // (claymation: the miniature street seen from above and further back through a longer lens, the puppet small in
      // the middle of its set — the user's reference pictures)
      const clay = STYLE.plastilina && !aim;
      if (clay && !p.knock && p.mode !== 'swim' && p.mode !== 'sit') ty += 0.2;
      this.footDist = damp(this.footDist ?? this.dist, aim ? 2.2 : clay ? this.dist * 1.25 : this.dist, 9, dt);
      dist = this.footDist;
      if (aim) fovT = 50; else if (clay) fovT = 50;
      // shoulder offset to the right (more while aiming)
      const rx = -Math.cos(this.yaw + Math.PI), rz = Math.sin(this.yaw + Math.PI);
      const so = aim ? 0.6 : 0.35;
      tx += rx * so; tz += rz * so;
      // gentle auto-follow when running and not looking: it eases in with the speed and a moment after the mouse lets
      // go, and never swings the camera round when you run towards it
      const spd = Math.hypot(p.vel.x, p.vel.z);
      this.lookT = Math.abs(ldx) + Math.abs(ldy) > 0.5 ? 0 : (this.lookT || 0) + dt;
      const behind = Math.abs(wrapAngle(p.heading + Math.PI - this.yaw));
      const wF = aim ? 0 : smoothstep(2.4, 5, spd) * smoothstep(0.6, 1.4, this.lookT) * smoothstep(2.1, 1.4, behind);
      if (wF > 0.001) this.yaw = dampAngle(this.yaw, p.heading + Math.PI, 1.1 * wF, dt);
      // a sprint opens the lens a little: the street rushes by
      if (!aim) fovT += 5 * smoothstep(4.6, 6.2, spd);
      // (fluid follow) the point looked at chases the player on a critically damped spring, a little ahead along the
      // way you run: starts, stops and turns cushioned, never a jolt (aiming: tight, no lead)
      const ts = this.tgtS || (this.tgtS = { x: { x: tx, v: 0 }, y: { x: ty, v: 0 }, z: { x: tz, v: 0 } });
      if (Math.hypot(ts.x.x - tx, ts.z.x - tz) > 6 || Math.abs(ts.y.x - ty) > 3) { ts.x.x = tx; ts.y.x = ty; ts.z.x = tz; ts.x.v = ts.y.v = ts.z.v = 0; } // (a jump cut: no glide)
      const lead = aim || p.knock ? 0 : 0.2, hl = aim ? 0.04 : 0.11;
      // (the shoulder and the lead never put the point inside a wall — running along a façade they would, and every
      // ray from in there is blocked: the camera would dive onto the back of your head)
      // (nor near one: the point is a ball 0.32 m round, as the player is — the camera behind it needs that room)
      const outOfWalls = (x, z) => {
        const t = col.sweepCircle(p.pos.x, p.pos.z, x, z, ty, ty, 0.32);
        if (t >= 1) return [x, z];
        const k = Math.max(0, t - 0.01);
        return [p.pos.x + (x - p.pos.x) * k, p.pos.z + (z - p.pos.z) * k];
      };
      const [gx, gz] = outOfWalls(tx + clamp(p.vel.x * lead, -1.3, 1.3), tz + clamp(p.vel.z * lead, -1.3, 1.3));
      springDamper(ts.x, gx, hl, dt);
      springDamper(ts.z, gz, hl, dt);
      springDamper(ts.y, ty, aim ? 0.04 : 0.14, dt);
      [tx, tz] = outOfWalls(ts.x.x, ts.z.x); ty = ts.y.x;
    }
    this.fov = damp(this.fov, fovT, fovT < 55 ? 9 : 3, dt);
    // camera position on a sphere behind the target (yaw points from target to camera)
    const pe = STYLE.plastilina && !(g.weapons && g.weapons.aiming) && !(p.mode === 'car' || rideV) ? clamp(this.pitch + 0.06, -1.2, 0.5) : this.pitch; // (claymation: a street-level look along the set, as in the user's pictures)
    const cp = Math.cos(pe);
    let cx = tx + Math.sin(this.yaw) * cp * dist, cz = tz + Math.cos(this.yaw) * cp * dist, cy = ty - Math.sin(pe) * dist;
    const inn = g.interior;
    cy = Math.max((inn && inn.floorY ? inn.floorY(tx, tz, p.pos.y) : 0) + 0.35, cy);
    if (inn && inn.ceilY) cy = Math.min(cy, inn.ceilY(tx, tz, p.pos.y) - 0.18);
    // collision. The camera is a ball 0.45 m round, pushed out from the point it looks at: it stops where it would
    // touch a wall (or a roof: the walls stand as high as the ridges), so neither the camera nor the edge of its view —
    // the near plane, 0.43 m from it at most — is ever inside a house. Running along a façade, the camera first slides
    // sideways, off the wall (as a camera operator would step aside), gliding there; only what that cannot clear pulls
    // it in — at once (never through a wall), and back out softly.
    const ROOM = 0.45;
    const probe = (px, pz, py) => col.sweepCircle(tx, tz, px, pz, ty, py, ROOM);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw); // (sideways, across the view)
    let shiftGoal = 0;
    if (!inV && probe(cx, cz, cy) < 0.98) {
      const pref = this.lastShift || 1;
      for (const k of [0.7, 1.4, 2.1]) {
        if (probe(cx + lx * k * pref, cz + lz * k * pref, cy) >= 0.98) { shiftGoal = k * pref; break; }
        if (probe(cx - lx * k * pref, cz - lz * k * pref, cy) >= 0.98) { shiftGoal = -k * pref; break; }
      }
      if (shiftGoal) this.lastShift = Math.sign(shiftGoal);
    }
    const ss = this.shiftS || (this.shiftS = { x: 0, v: 0 });
    springDamper(ss, shiftGoal, shiftGoal ? 0.16 : 0.45, dt);
    if (Math.abs(ss.x) > 1e-3) { cx += lx * ss.x; cz += lz * ss.x; }
    const t = probe(cx, cz, cy);
    // (never quite onto the point looked at: the camera keeps its direction — with the head against a wall it looks
    // away from the wall, from just behind the eyes)
    const kMin = 0.12 / Math.max(0.5, Math.hypot(cx - tx, cy - ty, cz - tz)); // (12 cm: the point is 0.3 m off any wall)
    const kT = t < 1 ? Math.max(kMin, t - 0.01) : 1, ks = this.pullS || (this.pullS = { x: 1, v: 0 });
    if (kT < ks.x) { ks.x = kT; ks.v = 0; } else springDamper(ks, kT, 0.32, dt);
    if (ks.x < 0.999) { const k = ks.x; cx = tx + (cx - tx) * k; cz = tz + (cz - tz) * k; cy = ty + (cy - ty) * k; }
    // and the corners of the view: with the player's head against a wall the ball may stand nearer that wall than its
    // own size — never so near that the picture's edge looks into the house
    for (let k = 0; k < 8 && Math.hypot(cx - tx, cz - tz) > 0.12 && !this.nearClear(col, tx, ty, tz, cx, cy, cz); k++) { cx = tx + (cx - tx) * 0.8; cz = tz + (cz - tz) * 0.8; cy = ty + (cy - ty) * 0.8; }
    // so close that the camera is in the player's head (backed into a corner): the body is not drawn meanwhile
    const close = Math.hypot(cx - tx, cy - ty, cz - tz), ch = p.char;
    if (ch && !this.fp && !inV && p.mode !== 'dead') {
      if (!this.hidClose && close < 0.5) this.hidClose = true;
      else if (this.hidClose && close > 0.7) { this.hidClose = false; ch.object.visible = true; }
      if (this.hidClose) ch.object.visible = false; // (every frame: the characters' own update shows it again)
    } else if (this.hidClose) { this.hidClose = false; if (ch && !this.fp && !inV) ch.object.visible = true; }
    this.target.set(tx, ty, tz);
    this.pos.set(cx, cy, cz);
    // shake
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.12;
      this.pos.x += (Math.random() - 0.5) * a; this.pos.y += (Math.random() - 0.5) * a; this.pos.z += (Math.random() - 0.5) * a;
      this.shakeAmt *= Math.exp(-5 * dt);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
  // the near plane's four corners, seen from the point looked at: none of them past a wall
  nearClear(col, tx, ty, tz, cx, cy, cz) {
    const c = this.camera, n = c.near, hh = n * Math.tan((this.fov * Math.PI) / 360), hw = hh * (c.aspect || 1.6);
    let fx = tx - cx, fy = ty - cy, fz = tz - cz;
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-3) return true;
    fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx; // (right: forward × up)
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy; // (up: right × forward)
    for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
      const qx = cx + fx * n + rx * hw * a + ux * hh * b, qy = cy + fy * n + uy * hh * b, qz = cz + fz * n + rz * hw * a;
      if (col.raycast(tx, tz, qx, qz, ty, qy) < 1) return false;
    }
    return true;
  }
  updateFirstPerson(dt, ldx, ldy, s) {
    const p = this.game.player;
    this.yaw -= ldx * s * 0.9;
    this.pitch = clamp(this.pitch - ldy * s * 0.9, -1.35, 1.3);
    const fy = this.yaw + Math.PI;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    this.bobT += dt * (1.2 + sp * 1.6);
    const bob = Math.sin(this.bobT * 2) * 0.028 * Math.min(1, sp / 3);
    const sway = Math.cos(this.bobT) * 0.018 * Math.min(1, sp / 3);
    const scale = (p.char && p.char.scale) || 1;
    const hidden = p.hidden; // inside a wardrobe
    const eyeY = p.pos.y + (hidden ? 1.3 : (p.crouch ? 1.02 : 1.56) * scale) + bob;
    const rx = -Math.cos(fy), rz = Math.sin(fy);
    const ex = p.pos.x + Math.sin(fy) * 0.12 + rx * sway, ez = p.pos.z + Math.cos(fy) * 0.12 + rz * sway;
    const cp = Math.cos(this.pitch);
    this.pos.set(ex, eyeY, ez);
    this.target.set(ex + Math.sin(fy) * cp, eyeY + Math.sin(this.pitch), ez + Math.cos(fy) * cp);
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.06;
      this.target.x += (Math.random() - 0.5) * a; this.target.y += (Math.random() - 0.5) * a; this.target.z += (Math.random() - 0.5) * a;
      this.shakeAmt *= Math.exp(-5 * dt);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    if (p.char) p.char.object.visible = false;
    this.fov = damp(this.fov, this.fovOverride || 72, 6, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
  // sat in the car: eyes where your head is, looking round the cabin (and out of the windows)
  updateCarFP(dt, v, side, ldx, ldy, s) {
    const g = this.game, info = g.fleet.renderer.info(v.model);
    const CI = g.carInterior;
    if (CI) { CI.set(v); CI.update(); }
    this.fpYaw = clamp((this.fpYaw || 0) - ldx * s * 0.8, -2.3, 2.3);
    this.fpPitch = clamp((this.fpPitch || 0) - ldy * s * 0.8, -0.8, 0.6);
    if (Math.abs(ldx) + Math.abs(ldy) < 0.5) { this.fpIdle = (this.fpIdle || 0) + dt; if (this.fpIdle > 2) { this.fpYaw = damp(this.fpYaw, 0, 1.5, dt); this.fpPitch = damp(this.fpPitch, -0.05, 1.5, dt); } } else this.fpIdle = 0;
    // eyes a hand below the headlining even in the small old cars (never looking at the roof)
    const lx = side * 0.38, ly = Math.min(info.seat.y + 0.78, (info.cabin ? info.cabin.H : v.spec.H) - 0.3), lz = info.seat.z - 0.05;
    const r = v.roll || 0, pt = v.pitch || 0, h = v.heading;
    const x1 = lx * Math.cos(r) - ly * Math.sin(r), y1 = lx * Math.sin(r) + ly * Math.cos(r);
    const y2 = y1 * Math.cos(pt) - lz * Math.sin(pt), z2 = y1 * Math.sin(pt) + lz * Math.cos(pt);
    const ex = v.x + x1 * Math.cos(h) + z2 * Math.sin(h), ez = v.z - x1 * Math.sin(h) + z2 * Math.cos(h), ey = (v.y || 0) + 0.02 + y2;
    const yaw = h + this.fpYaw, cp = Math.cos(this.fpPitch);
    this.pos.set(ex, ey, ez);
    this.target.set(ex + Math.sin(yaw) * cp, ey + Math.sin(this.fpPitch), ez + Math.cos(yaw) * cp);
    if (this.shakeAmt > 0.001) { const a = this.shakeAmt * 0.04; this.target.x += (Math.random() - 0.5) * a; this.target.y += (Math.random() - 0.5) * a; this.shakeAmt *= Math.exp(-5 * dt); }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.fov = damp(this.fov, 70, 6, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    this.yaw = yaw + Math.PI; // so leaving the car keeps the direction you were looking
  }
  // riding (bike, motorbike, tractor): the eyes just in front of the rider's face — the near plane keeps the head out
  // of sight — the handlebars and the hands below, looking round with the mouse and back ahead when you let go
  updateRideFP(dt, v, ldx, ldy, s) {
    const ch = this.game.player.char;
    this.fpYaw = clamp((this.fpYaw || 0) - ldx * s * 0.8, -2.0, 2.0);
    this.fpPitch = clamp((this.fpPitch || 0) - ldy * s * 0.8, -0.9, 0.6);
    if (Math.abs(ldx) + Math.abs(ldy) < 0.5) { this.fpIdle = (this.fpIdle || 0) + dt; if (this.fpIdle > 2) { this.fpYaw = damp(this.fpYaw, 0, 1.5, dt); this.fpPitch = damp(this.fpPitch, -0.3, 1.5, dt); } } else this.fpIdle = 0;
    const h = v.heading, fx = Math.sin(h), fz = Math.cos(h), e = this._eye || (this._eye = new THREE.Vector3());
    const head = ch && ch.bones && ch.bones.head;
    if (head) head.getWorldPosition(e); else e.set(v.x, (v.y || 0) + (v.spec.shape === 'tractor' ? 2.3 : 1.55), v.z);
    const ex = e.x + fx * 0.16, ey = e.y + 0.08, ez = e.z + fz * 0.16;
    const yaw = h + this.fpYaw, cp = Math.cos(this.fpPitch);
    this.pos.set(ex, ey, ez);
    this.target.set(ex + Math.sin(yaw) * cp, ey + Math.sin(this.fpPitch), ez + Math.cos(yaw) * cp);
    if (this.shakeAmt > 0.001) { const a = this.shakeAmt * 0.04; this.target.x += (Math.random() - 0.5) * a; this.target.y += (Math.random() - 0.5) * a; this.shakeAmt *= Math.exp(-5 * dt); }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.fov = damp(this.fov, 74, 6, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    this.yaw = yaw + Math.PI;
  }
  // inside a container: eyes at the gap under the lid, looking round slowly
  updatePeek(dt, ldx, ldy, s) {
    const p = this.game.player, c = p.hideIn;
    if (this.peekYaw !== undefined) { this.yaw = this.peekYaw - Math.PI; this.pitch = -0.08; this.peekYaw = undefined; }
    this.yaw -= ldx * s * 0.6;
    this.pitch = clamp(this.pitch - ldy * s * 0.6, -0.35, 0.25);
    const fy = this.yaw + Math.PI;
    const ex = c.x + Math.sin(fy) * 0.45, ez = c.z + Math.cos(fy) * 0.45, ey = 1.3 + Math.sin(this.game.time * 0.9) * 0.004;
    const cp = Math.cos(this.pitch);
    this.pos.set(ex, ey, ez);
    this.target.set(ex + Math.sin(fy) * cp, ey + Math.sin(this.pitch), ez + Math.cos(fy) * cp);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.fov = damp(this.fov, 58, 6, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
  // rifle scope: eye position, strong zoom, very fine mouse, slow breathing sway
  updateScope(dt, ldx, ldy, s) {
    const p = this.game.player;
    const k = 0.26;
    this.yaw -= ldx * s * k;
    this.pitch = clamp(this.pitch - ldy * s * k, -1.1, 0.9);
    this.scopeT = (this.scopeT || 0) + dt;
    const sw = Math.sin(this.scopeT * 1.25) * 0.0024 + Math.sin(this.scopeT * 3.1) * 0.0006;
    const sw2 = Math.sin(this.scopeT * 0.83 + 1.3) * 0.0019;
    const fy = this.yaw + Math.PI;
    const eyeY = p.pos.y + 1.5 * ((p.char && p.char.scale) || 1);
    const ex = p.pos.x + Math.sin(fy) * 0.15, ez = p.pos.z + Math.cos(fy) * 0.15;
    const cp = Math.cos(this.pitch + sw);
    this.pos.set(ex, eyeY, ez);
    this.target.set(ex + Math.sin(fy + sw2) * cp, eyeY + Math.sin(this.pitch + sw), ez + Math.cos(fy + sw2) * cp);
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.05;
      this.target.y += this.shakeAmt * 0.04; this.target.x += (Math.random() - 0.5) * a * 0.3;
      this.shakeAmt *= Math.exp(-4 * dt);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    if (p.char) p.char.object.visible = false;
    this.fov = damp(this.fov, 12.5, 12, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
  // camera looks along yaw direction: forward vector used for relative movement
  get forwardYaw() { return this.yaw + Math.PI; }

  startCinematic(from, look, dur = 4, to = null) {
    this.cinematic = { from: from.clone(), to: (to || from).clone(), look: look.clone(), t: 0, dur };
  }
  updateCinematic(dt) {
    const c = this.cinematic;
    c.t += dt;
    const u = clamp(c.t / c.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    this.camera.position.lerpVectors(c.from, c.to, e);
    this.camera.lookAt(c.look);
    if (this.camera.fov !== 50) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
  }
  endCinematic() { this.cinematic = null; this.fov = 62; }
}
