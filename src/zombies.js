// Zombies mode: the town at dusk, no neighbours, no traffic, no police — only the dead walking out of the streets.
// Waves of shamblers (and runners later on) home in on the player; guns, bat, fists and cars all work on them.
// Every wave is bigger and worse than the one before (waveTuning): more of them, faster, more of them running, harder
// bites, shorter pauses between lunges, less stopped by a bullet. And from the second wave on, giants: three times a
// person, slow and terribly strong — the ground shakes at every stride, from a distance they charge, and close up they
// raise both fists and bring them down, a slam that knocks you flat or crushes the car you hide in.
// Each one moves in its own way: a limp and a dragged foot, a lurching step, head jerks; they lunge to grab and bite,
// some climb up off the ground, the badly hurt crawl. They growl, gurgle, shriek and scrape their feet, and when they
// die they go down hard: knees buckle and they fold, head shots drop them stiff as a plank, shotgun blasts and cars
// throw them, the bat spins them round.
import * as THREE from 'three';
import { randomDesc, pedDesc } from './characters.js';
import { mulberry32, clamp } from './util.js';
const type2vol = (t) => (t === 'blast' ? 1.2 : t === 'plank' ? 1.1 : 0.9); // how hard a body hits the ground

const GROANS = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ease = (t) => t * t * (3 - 2 * t);
const HALF_PI = Math.PI / 2;
export const GIANT = 3; // the giant's size: three times a person

// How hard wave w (1, 2, 3…) pushes. Wave 1 is as it always was; from there every wave brings more of them, and worse.
export function waveTuning(w) {
  const a = Math.max(0, w - 1);
  return {
    count: 4 + 4 * w + w * w,                    // the dead that come out: 9, 16, 25, 36, 49, 64, 81…
    giants: w < 2 ? 0 : w < 5 ? 1 : w < 8 ? 2 : 3,
    cap: 1 + Math.min(0.8, 0.06 * a),            // how many walk at once (× what the quality allows)
    every: Math.max(0.12, 0.35 - 0.025 * a),     // s between two coming out
    near: Math.max(14, 22 - 1.2 * a),            // how close to you they can come out (m)
    hp: 60 + 8 * w + 3 * a * a,                  // 68, 79, 96, 119, 148…
    walk: Math.min(2.2, 1 + 0.12 * a),           // the walkers' pace ×
    runners: w < 2 ? 0 : Math.min(0.7, 0.12 + 0.09 * (w - 2)), // the share that run
    run: Math.min(1.35, 1 + 0.04 * a),           // the runners' pace ×
    frenzy: Math.min(0.9, 0.12 * a),             // a walker's burst when it is on you (× pace, within 9 m)
    reach: Math.min(1, 0.1 * a),                 // they lunge from further off (m)
    rate: 1 + 0.15 * a,                          // and more often (÷ the pause between lunges)
    bite: 1 + 0.12 * a,                          // and bite harder
    stun: 1 / (1 + 0.25 * a),                    // a hit stops them for less
    turn: 1 + 0.1 * a,                           // they turn after you quicker
    giantHp: 400 + 150 * w,                      // a giant: 700 at the second wave (twenty pistol shots, nine to the head)
    giantHit: 28 + 3 * w,                        // its slam
  };
}

function zombieDesc(rnd) {
  const d = randomDesc(rnd);
  d.zombie = true;
  d.skinColor = ['#9aa58a', '#8e9a80', '#a3a08a', '#85917c', '#b0a898', '#7f8a78'][Math.floor(rnd() * 6)];
  d.eyes = '#e8e2c8';
  d.elderly = false;
  return d;
}
// the giant: a big, heavy man — always the same body (built once, kept in the characters' cache) — in rags of
// sombre colours, three times the size of anyone (GIANT)
function giantDesc(rnd) {
  const d = pedDesc('m', 'adulto', mulberry32(31337));
  Object.assign(d, { zombie: true, build: 1.3, belly: 1.25, muscle: 1.5, height: 1.05, hairStyle: 'rapado', topStyle: 'tshirt', bottomStyle: 'jeans', bag: false, eyes: '#f0e6b8' });
  for (const k of ['hat', 'glasses', 'earrings', 'watch', 'beardStyle']) delete d[k];
  d.skinColor = ['#86907a', '#7c8872', '#8f8a78'][Math.floor(rnd() * 3)];
  d.top = ['#4a3f33', '#3a3d36', '#5a4c3c', '#2f3540'][Math.floor(rnd() * 4)]; d.topPattern = 'lisa';
  d.bottom = ['#2a3040', '#3a3a30', '#2c2a28'][Math.floor(rnd() * 3)];
  return d;
}

export class Zombies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.active = false;
    this.rnd = mulberry32(666);
    this.hud = document.getElementById('zhud');
  }

  start() {
    const g = this.game;
    this.stop(true);
    this.active = true;
    g.zombies = this;
    this.wave = 0; this.kills = 0; this.toSpawn = 0; this.spawnT = 0; this.breakT = 6; this.alive = 0; this.ambT = 4;
    this.T = waveTuning(1); this.giantsLeft = 0; this.giantKills = 0; this.spawned = 0; this.giantAt = 0; this.giantT = 0;
    g.chars.prebuild([giantDesc(this.rnd)], 9); // (the giant's body, made while the first wave is fought)
    g.sky.hour = 19.35;
    g.police.clear();
    g.peds.clear();
    for (const v of [...g.traffic.cars]) g.fleet.remove(v);
    g.traffic.cars.length = 0;
    const W = g.weapons;
    W.give('pistola', 72); W.give('bate', 0); W.select('pistola');
    g.player.health = 100; g.player.armor = 50;
    if (this.hud) this.hud.hidden = false;
    this.boss = document.getElementById('zboss');
    document.body.classList.add('zmode');
    g.audio.loadSamples(GROANS.concat(['breath']));
    g.hud.banner('ZOMBIS EN GUAREÑA', 'Sobrevive a las oleadas', 'dead', 3.5);
    g.hud.objectiveText('Aguanta. <b>La primera oleada</b> está a punto de llegar.');
    setTimeout(() => this.active && g.hud.help((g.input.device === 'touch' ? '<b>Disparar</b> apunta solo' : (g.input.device === 'pad' ? 'Mantén ' + g.input.key('', 6) : 'Mantén el <b>botón derecho</b>') + ' para apuntar; los <b>tiros a la cabeza</b> los tumban en seco') + '. Cada zombi abatido da 10 €: gasta el dinero en la <b style="color:#ff8a70">armería</b>. Puedes atropellarlos con un coche.', 9), 2500);
  }

  stop(quiet = false) {
    const g = this.game;
    for (const z of this.list) { g.scene.remove(z.char.object); z.char.dispose(); }
    this.list = [];
    this.active = false;
    if (g.zombies === this) g.zombies = null;
    if (this.hud) this.hud.hidden = true;
    if (this.boss) this.boss.hidden = true;
    document.body.classList.remove('zmode');
    if (!quiet) { g.hud.objectiveText(null); }
  }

  // ---------------------------------------------------------------- spawning
  spawnPoint(dMin = 22, dMax = 80) {
    const g = this.game, p = g.player.pos;
    if (!this._near || this.game.time - this._nearT > 2) {
      this._nearT = this.game.time;
      this._near = g.map.edges.filter((e) => e.walk && !e.blocked && e.len > 4 && e.pts.some((v, i) => (i % 2 === 0 ? Math.abs(v - p.x) < 85 : Math.abs(v - p.z) < 85)) && Math.hypot(e.pts[0] - p.x, e.pts[1] - p.z) < 160);
    }
    const edges = this._near.length ? this._near : g.peds.walkEdges;
    for (let a = 0; a < 25; a++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const pt = g.peds.sidePoint(e, 2 + Math.random() * Math.max(1, e.len - 4), Math.random() < 0.5 ? 1 : -1, {});
      const d = Math.hypot(pt.x - p.x, pt.z - p.z);
      if (d < dMin || d > dMax || g.map.buildingAt(pt.x, pt.z)) continue;
      if (d < 45 && g.traffic.inView(pt.x, pt.z, d) && g.map.collider.raycast(p.x, p.z, pt.x, pt.z, 1.6, 1.6) > 0.98) continue;
      return pt;
    }
    return null;
  }
  spawn(giant = false) {
    const g = this.game, T = this.T;
    const pt = giant ? this.spawnPoint(38, 90) : this.spawnPoint(T.near, 80);
    if (!pt) return false;
    const ch = g.chars.create(giant ? giantDesc(this.rnd) : zombieDesc(this.rnd));
    g.scene.add(ch.object);
    ch.object.rotation.order = 'YXZ';
    if (giant) return this.addGiant(ch, pt);
    const runner = Math.random() < T.runners;
    const crawler = !runner && this.wave >= 2 && Math.random() < 0.1;
    const rise = !runner && !crawler && Math.random() < 0.35;
    const z = {
      char: ch, x: pt.x, z: pt.z, y: 0, heading: Math.random() * Math.PI * 2, vx: 0, vz: 0, vy: 0, speed: 0,
      state: crawler ? 'crawl' : rise ? 'rise' : 'walk', alive: true, low: crawler, riseT: 0, S: 1, R: 0.3,
      hp: T.hp, maxSpeed: runner ? (3.4 + Math.random() * 0.8) * T.run : crawler ? 0.45 + Math.random() * 0.2 : (0.8 + Math.random() * 0.6) * T.walk,
      attackCd: 0, groanT: 2 + Math.random() * 6, deadT: 0, runner, animAcc: 0,
      // gait: limping side and how bad it is, lurch, head tics
      limp: Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6) : 0,
      lurch: 0.3 + Math.random() * 0.7, ticT: 1 + Math.random() * 5, tic: 0, ticDir: 1, hitT: 0, hitX: 0, stepPh: 0, seed: Math.random() * 100,
    };
    ch.setBase(z.state === 'walk' || z.state === 'rise' ? (runner ? null : 'zombie') : null);
    ch.object.position.set(z.x, 0, z.z);
    this.list.push(z);
    return true;
  }
  // a giant comes down the street: three times the size (its levels of detail as for someone three times nearer),
  // facing you, with a roar
  addGiant(ch, pt) {
    const g = this.game, T = this.T, pp = g.player.pos;
    ch.object.scale.setScalar(GIANT);
    ch.lodScale = 1 / GIANT;
    const z = {
      char: ch, x: pt.x, z: pt.z, y: 0, heading: Math.atan2(pp.x - pt.x, pp.z - pt.z), vx: 0, vz: 0, vy: 0, speed: 0,
      state: 'walk', alive: true, low: false, riseT: 0, giant: true, S: GIANT, R: 0.9,
      hp: T.giantHp, hp0: T.giantHp, maxSpeed: 1.25 + 0.05 * this.wave, attackCd: 2.5, chargeCd: 5 + Math.random() * 3,
      groanT: 2, deadT: 0, runner: false, animAcc: 0, limp: 0, lurch: 0.5, ticT: 9, tic: 0, ticDir: 1, hitT: 0, hitX: 0,
      stepPh: 0, step: 0, seed: Math.random() * 100, rage: false, carT: 0,
    };
    ch.setBase(null);
    ch.object.position.set(z.x, 0, z.z);
    this.list.push(z);
    g.audio.sfx('z_growl', { x: z.x, z: z.z, vol: 1.8, pitch: 0.42 });
    g.audio.sample(pick(GROANS), { x: z.x, z: z.z, vol: 1.6, pitch: 0.5 });
    g.hud.banner('¡UN ZOMBI GIGANTE!', 'El triple de grande: apunta a la cabeza y que no te alcance', 'dead', 3);
    return true;
  }

  // ---------------------------------------------------------------- damage (weapons.js / vehicles call these)
  hitTest(x, z, r) {
    let best = null, bd = Infinity;
    for (const zz of this.list) {
      if (!zz.alive) continue;
      const d = Math.hypot(zz.x - x, zz.z - z) - (zz.R - 0.3); // (a giant's body is a lot wider)
      if (d < r && d < bd) { bd = d; best = zz; }
    }
    return best;
  }
  // kind: 'bullet' | 'head' | 'blast' (shotgun) | 'rifle' | 'melee' | 'car'
  damage(z, dmg, kx = 0, kz = 0, kind = 'bullet') {
    const g = this.game;
    if (!z.alive) return;
    if (z.giant) { this.damageGiant(z, dmg, kx, kz, kind); return; }
    z.hp -= dmg;
    z.char.play('hit', 0.3);
    z.vx += kx * 0.25; z.vz += kz * 0.25;
    // the hit snaps the torso away from the shot
    const f = Math.sin(z.heading), fzz = Math.cos(z.heading), kl = Math.hypot(kx, kz) || 1;
    z.hitT = 0.32; z.hitX = -(kx * f + kz * fzz) / kl; z.hitSide = (kx * -fzz + kz * f) / kl;
    if (Math.random() < 0.35) g.audio.sample(pick(GROANS), { x: z.x, z: z.z, vol: 0.8, pitch: 0.9 + Math.random() * 0.25 });
    if (z.hp <= 0) { this.kill(z, kx, kz, kind); return; }
    // badly hurt walkers sometimes go down and keep coming on their hands
    if (z.state === 'walk' && z.hp < 25 && !z.runner && Math.random() < 0.3 && kind !== 'car') { this.fallToCrawl(z); return; }
    if (kind !== 'bullet' || Math.random() < 0.25) z.stun = 0.5 * this.T.stun;
  }
  // a giant: bullets do not stop it — only a shotgun blast now and then, a rifle to the head or a car makes it stagger;
  // half dead, it goes into a rage
  damageGiant(z, dmg, kx, kz, kind) {
    const g = this.game;
    z.hp -= dmg;
    const f = Math.sin(z.heading), fzz = Math.cos(z.heading), kl = Math.hypot(kx, kz) || 1;
    z.hitT = 0.3; z.hitX = -(kx * f + kz * fzz) / kl;
    if (Math.random() < 0.25) g.audio.sample(pick(GROANS), { x: z.x, z: z.z, vol: 1.2, pitch: 0.5 + Math.random() * 0.1 });
    if (z.hp <= 0) { this.kill(z, kx, kz, kind); return; }
    if (!z.rage && z.hp < z.hp0 * 0.5) {
      z.rage = true;
      g.audio.sfx('z_shriek', { x: z.x, z: z.z, vol: 1.6, pitch: 0.4 });
      g.hud.notify('¡El gigante se enfurece!', 'veh', 2.5);
    }
    if (z.state !== 'slam' && (kind === 'car' || (kind === 'blast' && Math.random() < 0.08) || (kind === 'head' && dmg > 150))) { z.state = 'stagger'; z.staggerT = kind === 'car' ? 0.8 : 0.5; }
  }
  fallToCrawl(z) {
    z.state = 'crawl'; z.low = true; z.maxSpeed = 0.5; z.crawlIn = 0; z.char.setBase(null);
    this.game.audio.sfx('z_fall', { x: z.x, z: z.z, vol: 0.8 });
  }
  kill(z, kx, kz, kind) {
    const g = this.game;
    z.alive = false;
    z.state = 'dying';
    z.char.setBase(null);
    if (z.giant) {
      // it comes down like a tree, slowly and then all at once: forwards at your feet, or back, stiff, from a head shot
      const kl = Math.hypot(kx, kz), along = kl > 0.01 ? (kx * Math.sin(z.heading) + kz * Math.cos(z.heading)) / kl : -1;
      z.die = { type: kind === 'head' ? 'plank' : 'crumple', dir: kind === 'head' ? (along > 0 ? 1 : -1) : 1, t: 0, landed: false, pitch: 0, roll: 0, yaw0: z.heading, spin: 0, side: Math.random() < 0.5 ? 1 : -1, arms: Math.random() };
      z.vx = z.vz = 0;
      z.char.cullSphere(true);
      g.audio.sfx('z_growl', { x: z.x, z: z.z, vol: 1.8, pitch: 0.35 });
      this.kills++; this.giantKills++;
      const prize = 150 + 50 * this.wave;
      g.player.money += prize;
      g.hud.notify(`¡Has tumbado al zombi gigante! +${prize} €`, 'gold', 4);
      return;
    }
    const kl = Math.hypot(kx, kz);
    const f = Math.sin(z.heading), fzz = Math.cos(z.heading);
    // which way it goes: away from the hit (usually backwards, since they face you); some fold forwards
    const along = kl > 0.01 ? (kx * f + kz * fzz) / kl : -1;
    const type = z.low ? 'flat' : kind === 'head' ? 'plank' : kind === 'blast' || kind === 'car' || (kind === 'rifle' && Math.random() < 0.6) ? 'blast' : kind === 'melee' ? 'spin' : 'crumple';
    let dir = along > 0.2 ? 1 : along < -0.2 ? -1 : (Math.random() < 0.5 ? 1 : -1);
    if (type === 'crumple' && Math.random() < 0.35) dir = 1; // knees go and it folds forward, at your feet
    z.die = {
      type, dir, t: 0, landed: false, pitch: 0, roll: 0, yaw0: z.heading,
      spin: type === 'spin' ? (Math.random() < 0.5 ? 1 : -1) * (2.4 + Math.random()) : type === 'blast' ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 0.6,
      side: Math.random() < 0.5 ? 1 : -1, arms: Math.random(),
    };
    if (type === 'blast') { const s = kind === 'car' ? 0.55 : 0.35; z.vx = kx * s; z.vz = kz * s; z.vy = 2.2 + kl * 0.12; }
    else { z.vx = kx * 0.08; z.vz = kz * 0.08; z.vy = 0; }
    // the body goes down limp (a ragdoll): thrown by a blast or a car, straight over from a head shot, spun round by a
    // blow, or the knees going first
    const col = g.map.collider;
    this.ragEnv = this.ragEnv || { floor: () => 0, collide: (p, r) => col.resolveCircle(p, r), crosses: (ax, az, bx, bz) => col.crosses && col.crosses(ax, az, bx, bz) };
    const ro = type === 'blast' ? { vel: [z.vx, z.vy * 0.8, z.vz], legs: kind === 'car' ? 0.5 : 0, up: 0.3 }
      : type === 'plank' ? { vel: [kx * 0.1, 0, kz * 0.1], up: 1.3 }
      : type === 'spin' ? { vel: [kx * 0.12, 0.3, kz * 0.12], up: 0.9 }
      : type === 'flat' ? { vel: [0, 0, 0] }
      : { buckle: 1, vel: [kx * 0.06, 0, kz * 0.06], up: 0.4 };
    z.char.object.updateMatrixWorld(true);
    z.char.ragdoll({ env: this.ragEnv, tone: 0.05, dead: true, ...ro });
    if (type === 'plank') {
      g.effects.blood(z.x, 1.62, z.z, kl > 0.01 ? kx / kl : 0, kl > 0.01 ? kz / kl : 0);
      g.effects.blood(z.x, 1.6, z.z, kl > 0.01 ? kx / kl : 0, kl > 0.01 ? kz / kl : 0);
      g.audio.sfx('z_splat', { x: z.x, z: z.z });
    } else if (Math.random() < 0.6) g.audio.sfx('z_gurgle', { x: z.x, z: z.z, vol: 0.9 });
    this.kills++;
    g.player.money += 10;
    if (this.kills % 10 === 0) g.hud.notify(`${this.kills} zombis abatidos`, 'gold', 2);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.active) return;
    const g = this.game, p = g.player, pp = p.pos;
    const col = g.map.collider;
    // waves
    const T = this.T;
    this.alive = this.list.filter((z) => z.alive).length;
    if (this.toSpawn <= 0 && this.giantsLeft <= 0 && this.alive === 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.nextWave();
      else if (this.wave > 0 && !this.supplied) this.dropSupplies();
    }
    if (this.toSpawn > 0) {
      this.spawnT -= dt;
      const cap = Math.round((g.q.peds >= 30 ? 26 : g.q.peds >= 22 ? 20 : 14) * T.cap);
      if (this.spawnT <= 0 && this.alive < cap) { if (this.spawn()) { this.toSpawn--; this.spawned++; } this.spawnT = T.every; }
    }
    // the giants: once the wave has got going (four in ten out), one at a time
    if (this.giantsLeft > 0 && this.spawned >= this.giantAt) {
      this.giantT -= dt;
      if (this.giantT <= 0) { if (this.spawn(true)) { this.giantsLeft--; this.giantT = 12; } else this.giantT = 1; }
    }
    // a moan somewhere in the dark now and then
    this.ambT -= dt;
    if (this.ambT <= 0 && this.alive > 0) {
      this.ambT = 5 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2;
      g.audio.sfx('z_growl', { x: pp.x + Math.cos(a) * 30, z: pp.z + Math.sin(a) * 30, vol: 0.6, pitch: 0.85 + Math.random() * 0.3 });
    }
    const cam = g.camera.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      const dx = pp.x - z.x, dz = pp.z - z.z, d = Math.hypot(dx, dz) || 1;
      if (z.state === 'dying') this.stepDeath(z, dt, col);
      else if (z.state === 'dead') {
        z.deadT += dt;
        if (z.deadT > 25 || d > 120) { g.scene.remove(z.char.object); z.char.dispose(); this.list.splice(i, 1); continue; }
      } else if (z.state === 'rise') {
        z.riseT += dt;
        z.heading = Math.atan2(dx, dz);
        if (z.riseT > 1.9) { z.state = 'walk'; }
        if (z.riseT < 0.05) g.audio.sfx('z_growl', { x: z.x, z: z.z, vol: 0.8, pitch: 0.8 });
      } else if (z.giant) this.stepGiant(z, dt, d, dx, dz, col);
      else this.stepAlive(z, dt, d, dx, dz, col);
      // render (a giant is seen from much further)
      const cd = Math.hypot(z.x - cam.x, z.z - cam.z);
      z.char.object.visible = cd < (z.giant ? 220 : 120);
      z.animAcc += dt;
      const o = z.char.object;
      if (cd < (z.giant ? 150 : 50) || z.animAcc > 0.1) {
        // (a giant's legs are three times as long: its stride is a person's at a third of its speed)
        const walkSp = z.state === 'walk' || z.state === 'lunge' || z.state === 'charge' ? z.speed * (z.runner ? 1 : 1.4) / z.S : 0;
        const posed = z.char.update(z.animAcc, walkSp, {});
        if (posed !== false && !z.char.rag) { if (z.giant && z.alive) this.poseGiant(z); else this.pose(z, z.animAcc, d); }
        z.animAcc = 0;
      }
      if (z.state === 'walk' || z.state === 'lunge' || z.state === 'rise' || (z.giant && z.alive)) { o.position.set(z.x, z.y || 0, z.z); o.rotation.set(z.rootPitch || 0, z.heading, z.rootRoll || 0); }
      else if (z.state === 'crawl') { o.position.set(z.x, z.y || 0, z.z); o.rotation.set(1.45, z.heading, 0); }
    }
    // HUD: the wave, and the giant's strength while one is about
    if (this.hud) {
      const txt = `Oleada ${this.wave} · Zombis ${this.alive + Math.max(0, this.toSpawn) + this.giantsLeft} · Bajas ${this.kills}`;
      if (txt !== this._txt) { this._txt = txt; this.hud.textContent = txt; }
    }
    if (this.boss) {
      const gs = this.list.filter((z) => z.giant && z.alive);
      const show = gs.length > 0;
      if (show !== !this.boss.hidden) this.boss.hidden = !show;
      if (show) {
        const z = gs.reduce((a, b) => (b.hp / b.hp0 < a.hp / a.hp0 ? b : a));
        const w = Math.max(0, Math.round((z.hp / z.hp0) * 1000) / 10) + '%', label = (gs.length > 1 ? `Zombis gigantes ×${gs.length}` : 'Zombi gigante') + (z.rage ? ' · furioso' : '');
        if (this._bw !== w) { this._bw = w; this.boss.querySelector('s').style.width = w; }
        if (this._bl !== label) { this._bl = label; this.boss.querySelector('b').textContent = label; this.boss.classList.toggle('rage', z.rage); }
      }
    }
  }

  stepAlive(z, dt, d, dx, dz, col) {
    const g = this.game, p = g.player, pp = p.pos, T = this.T;
    z.stun = Math.max(0, (z.stun || 0) - dt);
    z.attackCd -= dt;
    z.hitT = Math.max(0, z.hitT - dt);
    const crawl = z.state === 'crawl';
    if (crawl) z.crawlIn = Math.min(1, (z.crawlIn ?? 1) + dt * 2);
    // lunge: a burst forward with the arms out; bite if it connects, stumble if not
    if (z.state === 'lunge') {
      z.lungeT -= dt;
      if (z.lungeT <= 0) {
        z.state = 'walk';
        if (d < 1.35 && !p.vehicle && p.mode === 'foot') this.bite(z);
        else { z.stun = 0.6; g.audio.sfx('z_drag', { x: z.x, z: z.z, vol: 0.7 }); }
      }
    } else if (!crawl && !z.stun && z.attackCd <= 0 && d < (z.runner ? 3.2 : 2.3) + T.reach && d > 0.9 && !p.vehicle && p.mode === 'foot') {
      z.state = 'lunge'; z.lungeT = z.runner ? 0.3 : 0.42; z.attackCd = (1.4 + Math.random() * 0.6) / T.rate;
      g.audio.sfx(z.runner ? 'z_shriek' : 'z_growl', { x: z.x, z: z.z, vol: 1, pitch: 0.9 + Math.random() * 0.25 });
    } else if (crawl && d < 1.05 && z.attackCd <= 0 && !p.vehicle && p.mode === 'foot') {
      z.attackCd = (1.6 + Math.random() * 0.6) / T.rate; this.bite(z, 0.7);
    }
    // gait: limpers surge on the good leg and hang on the bad one; tics
    z.stepPh = z.char.phase || 0;
    const surge = z.runner ? 1 : 1 - z.lurch * 0.55 + z.lurch * 0.9 * Math.max(0, Math.sin(z.stepPh + (z.limp > 0 ? 0 : Math.PI)));
    let want = z.stun > 0 ? 0 : d < 1.0 ? 0 : z.maxSpeed * surge;
    // (in the later waves the walkers put on a burst when they are nearly on you)
    if (!z.runner && !crawl && d < 9) want *= 1 + T.frenzy * (1 - d / 9);
    if (z.state === 'lunge') want = (z.runner ? 6 : 4.2) * Math.min(1.3, T.run);
    z.speed += (want - z.speed) * Math.min(1, dt * (z.state === 'lunge' ? 10 : 3));
    // foot drag on the bad leg
    if (z.limp && !crawl && z.speed > 0.3) {
      const s = Math.sin(z.stepPh + (z.limp > 0 ? Math.PI : 0));
      if (s > 0.95 && !z.dragged) { z.dragged = true; if (d < 25) g.audio.sfx('z_drag', { x: z.x, z: z.z, vol: 0.35 + Math.abs(z.limp) * 0.3 }); }
      else if (s < 0) z.dragged = false;
    }
    let mx = dx / d, mz = dz / d;
    for (const o of this.list) {
      if (o === z || !o.alive) continue;
      const ox = z.x - o.x, oz = z.z - o.z, od = Math.hypot(ox, oz), rr = o.R + 0.5; // (out of a giant's way)
      if (od > 0.01 && od < rr) { mx += (ox / od) * (rr - od) * 1.5; mz += (oz / od) * (rr - od) * 1.5; }
    }
    const ml = Math.hypot(mx, mz) || 1;
    const pos = this._p || (this._p = { x: 0, z: 0 });
    pos.x = z.x + (mx / ml) * z.speed * dt + z.vx * dt; pos.z = z.z + (mz / ml) * z.speed * dt + z.vz * dt;
    z.vx *= Math.exp(-4 * dt); z.vz *= Math.exp(-4 * dt);
    col.resolveCircle(pos, crawl ? 0.35 : 0.3);
    z.x = pos.x; z.z = pos.z;
    // turn towards the player (the dead don't pivot instantly), swaying on the limp
    const target = Math.atan2(dx, dz);
    let dh = target - z.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    z.heading += dh * Math.min(1, dt * (z.state === 'lunge' ? 10 : z.runner ? 6 : 3.5) * T.turn);
    z.ticT -= dt;
    if (z.ticT <= 0) { z.ticT = 2 + Math.random() * 6; z.tic = 0.25; z.ticDir = Math.random() < 0.5 ? -1 : 1; }
    z.tic = Math.max(0, z.tic - dt);
    // cars plough through them
    for (const v of g.fleet.vehicles) {
      if (Math.abs(v.x - z.x) > 4 || Math.abs(v.z - z.z) > 4 || v.vel < 3.5) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lx = (z.x - v.x) * fx + (z.z - v.z) * fz, lz = (z.x - v.x) * -fz + (z.z - v.z) * fx;
      if (Math.abs(lx) < v.hl + 0.3 && Math.abs(lz) < v.hw + 0.3) {
        this.damage(z, v.vel * 12, v.vx * 1.2, v.vz * 1.2, 'car');
        v.vx *= 0.93; v.vz *= 0.93; v.health -= 6;
        g.audio.sfx('punch_hit', { x: z.x, z: z.z, vol: 1.2 });
        g.audio.sfx('z_fall', { x: z.x, z: z.z, vol: 1 });
        if (!z.alive) break;
      }
    }
    // voice: groans (recorded) mixed with growls and gurgles (synth); runners shriek
    z.groanT -= dt;
    if (z.alive && z.groanT <= 0 && d < 40) {
      z.groanT = 3 + Math.random() * 7;
      const r = Math.random(), pitch = 0.85 + Math.random() * 0.3;
      if (z.runner && r < 0.35) g.audio.sfx('z_shriek', { x: z.x, z: z.z, vol: 0.8, pitch });
      else if (r < 0.55) g.audio.sample(pick(GROANS), { x: z.x, z: z.z, vol: 0.7, pitch });
      else if (r < 0.85) g.audio.sfx('z_growl', { x: z.x, z: z.z, vol: 0.8, pitch });
      else g.audio.sfx('z_gurgle', { x: z.x, z: z.z, vol: 0.7, pitch });
    }
  }
  bite(z, k = 1) {
    const g = this.game, p = g.player, pp = p.pos;
    z.char.play('punch', 0.45);
    p.damage((7 + Math.random() * 7 + this.wave * 0.5) * k * this.T.bite);
    g.audio.sfx('z_bite', { x: pp.x, z: pp.z, vol: 1 });
    g.audio.sample(pick(GROANS), { x: z.x, z: z.z, vol: 1 });
    g.effects.blood(pp.x, 1.2, pp.z, (pp.x - z.x), (pp.z - z.z));
    g.cam.shake(0.3);
  }

  // ---------------------------------------------------------------- the giant
  // It stomps after you, turning slowly (you can dodge round it); from a distance it charges, roaring; close up it raises
  // both fists and brings them down two metres in front of it — knocked flat if you are there, and a car there is
  // crushed and thrown. Cars that hit it stop dead. Every stride shakes the ground near it.
  stepGiant(z, dt, d, dx, dz, col) {
    const g = this.game, p = g.player, v = p.vehicle, rage = z.rage ? 1.35 : 1;
    z.attackCd -= dt; z.chargeCd -= dt; z.carT = Math.max(0, z.carT - dt); z.hitT = Math.max(0, z.hitT - dt);
    if (z.state === 'stagger') { z.staggerT -= dt; if (z.staggerT <= 0) z.state = 'walk'; }
    else if (z.state === 'slam') {
      z.slamT += dt;
      if (!z.slammed && z.slamT >= 0.8) { z.slammed = true; this.slam(z); }
      if (z.slamT >= 1.45) { z.state = 'walk'; z.attackCd = Math.max(1.4, 2.8 - 0.1 * this.wave) / rage; }
    } else if (z.state === 'charge') {
      z.chargeT -= dt;
      if (z.chargeT <= 0 || d < 6) { z.state = 'walk'; z.chargeCd = 7 + Math.random() * 4; }
    }
    if ((z.state === 'walk' || z.state === 'charge') && (p.mode === 'foot' || v)) {
      if (z.attackCd <= 0 && d < 4.8) {
        z.state = 'slam'; z.slamT = 0; z.slammed = false;
        g.audio.sfx('z_growl', { x: z.x, z: z.z, vol: 1.6, pitch: 0.38 + Math.random() * 0.08 });
      } else if (z.state === 'walk' && z.chargeCd <= 0 && d > 12 && d < 45) {
        z.state = 'charge'; z.chargeT = 2.5 + Math.random() * 1.5;
        g.audio.sfx('z_shriek', { x: z.x, z: z.z, vol: 1.5, pitch: 0.42 });
      }
    }
    const want = z.state === 'charge' ? 3.6 * rage : z.state === 'walk' && d > 3.2 ? z.maxSpeed * rage : 0;
    z.speed += (want - z.speed) * Math.min(1, dt * 1.6);
    // it goes where it faces, and turns after you slowly — slower still with its fists up
    const target = Math.atan2(dx, dz);
    let dh = target - z.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const turn = z.state === 'slam' ? (z.slamT < 0.6 ? 0.9 : 0) : z.state === 'charge' ? 0.8 : z.state === 'stagger' ? 0 : 1.5 * rage;
    z.heading += clamp(dh, -turn * dt, turn * dt);
    const pos = this._p || (this._p = { x: 0, z: 0 });
    pos.x = z.x + Math.sin(z.heading) * z.speed * dt + z.vx * dt; pos.z = z.z + Math.cos(z.heading) * z.speed * dt + z.vz * dt;
    z.vx *= Math.exp(-3 * dt); z.vz *= Math.exp(-3 * dt);
    col.resolveCircle(pos, z.R);
    z.x = pos.x; z.z = pos.z;
    // a stride: the thud, the ground shaking, dust off the foot
    const st = Math.floor((z.char.phase || 0) / Math.PI);
    if (st !== z.step) { z.step = st; if (z.speed > 0.4) this.stomp(z, d, z.state === 'charge' ? 1 : 0.7); }
    // cars: they stop dead against it (and hurt it, and it staggers)
    for (const c of g.fleet.vehicles) {
      if (z.carT > 0 || Math.abs(c.x - z.x) > 6 || Math.abs(c.z - z.z) > 6 || c.vel < 2.5) continue;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const lx = (z.x - c.x) * fx + (z.z - c.z) * fz, lz = (z.x - c.x) * -fz + (z.z - c.z) * fx;
      if (Math.abs(lx) < c.hl + z.R && Math.abs(lz) < c.hw + z.R) {
        z.carT = 0.8;
        const sp = c.vel;
        this.damage(z, sp * 6, c.vx, c.vz, 'car');
        c.vx *= -0.25; c.vz *= -0.25; c.health -= 12 + sp * 3;
        g.audio.sfx('crash_small', { x: z.x, z: z.z, vol: 1.3 });
        g.audio.sfx('z_fall', { x: z.x, z: z.z, vol: 1.2, pitch: 0.6 });
        if (c === v) g.cam.shake(0.6);
      }
    }
    // voice: deep groans and roars, heard from far off
    z.groanT -= dt;
    if (z.groanT <= 0 && d < 70) {
      z.groanT = 3 + Math.random() * 4;
      const pitch = 0.4 + Math.random() * 0.12;
      if (Math.random() < 0.5) g.audio.sample(pick(GROANS), { x: z.x, z: z.z, vol: 1.4, pitch });
      else g.audio.sfx('z_growl', { x: z.x, z: z.z, vol: 1.4, pitch });
    }
  }
  // a giant's stride: the ground shakes under you if you are near (k: how hard it comes down)
  stomp(z, d, k) {
    const g = this.game;
    g.audio.sfx('z_fall', { x: z.x, z: z.z, vol: 0.55 + 0.5 * k, pitch: 0.5 + Math.random() * 0.1 });
    if (d < 32) g.cam.shake(0.16 * k * (1 - d / 32));
    for (let i = 0; i < 3; i++) g.effects.smoke.emit(z.x + (Math.random() - 0.5) * 1.6, 0.1, z.z + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.5, 0.3, (Math.random() - 0.5) * 1.5, 1.1, 0.5, 2.2, 0.6, 0.55, 0.48, 0.3 * k);
  }
  // the fists come down two metres in front of it: on foot within 2.7 m of there, you are knocked flat; a car within
  // 3.6 m is crushed and thrown
  slam(z) {
    const g = this.game, p = g.player, v = p.vehicle;
    const hx = z.x + Math.sin(z.heading) * 2.2, hz = z.z + Math.cos(z.heading) * 2.2;
    const px = v ? v.x : p.pos.x, pz = v ? v.z : p.pos.z;
    const hd = Math.hypot(px - hx, pz - hz), d = Math.hypot(px - z.x, pz - z.z) || 1;
    const nx = (px - z.x) / d, nz = (pz - z.z) / d;
    this.stomp(z, d, 1.8);
    g.audio.sfx('punch_hit', { x: hx, z: hz, vol: 1.5 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.effects.smoke.emit(hx + Math.cos(a) * 0.6, 0.15, hz + Math.sin(a) * 0.6, Math.cos(a) * 3, 0.5, Math.sin(a) * 3, 1.3, 0.6, 2.6, 0.62, 0.56, 0.48, 0.45); }
    if (v && hd < 3.6) {
      v.health -= 70 + 12 * this.wave;
      v.vx += nx * 9; v.vz += nz * 9;
      g.audio.sfx('crash_small', { x: px, z: pz, vol: 1.5 });
      g.cam.shake(0.9);
    } else if (!v && p.mode === 'foot' && hd < 2.7) {
      p.knockDown(nx * 7, nz * 7, this.T.giantHit * (z.rage ? 1.25 : 1));
      g.effects.blood(p.pos.x, 1.1, p.pos.z, nx, nz);
      g.audio.sfx('z_bite', { x: p.pos.x, z: p.pos.z, vol: 0.8 });
    }
  }

  // falling: knees buckle, the body tips over the feet (accelerating), bounces and settles; blasts fly first
  stepDeath(z, dt, col) {
    const g = this.game, D = z.die;
    D.t += dt;
    if (z.char.rag) {
      // the ragdoll has it: follow the body; the thud when it hits the ground; still, and it is over
      const rag = z.char.rag, rp = z.char.ragPos(this._rp || (this._rp = new THREE.Vector3()));
      z.x = rp.x; z.z = rp.z; z.y = 0;
      if (rag.landed && !D.landed) { D.landed = true; D.tl = D.t; this.land(z, type2vol(D.type)); }
      if (rag.sleeping || D.t > 4) { z.state = 'dead'; z.deadT = 0; }
      return;
    }
    if (D.type === 'blast' && !D.landed) {
      z.vy -= 13 * dt;
      const nx = z.x + z.vx * dt, nz = z.z + z.vz * dt;
      if (col.raycast(z.x, z.z, nx, nz, 0.9, 0.9) < 1) { z.vx *= -0.25; z.vz *= -0.25; } else { z.x = nx; z.z = nz; }
      z.y = Math.max(0, (z.y || 0) + z.vy * dt);
      D.pitch = Math.max(-HALF_PI * 1.05, Math.min(HALF_PI * 1.05, D.pitch + D.dir * dt * 5.5));
      z.heading += D.spin * dt;
      if (z.y <= 0 && z.vy < 0 && D.t > 0.12) { D.landed = true; D.tl = D.t; this.land(z, 1.2); }
    } else {
      // time to tip: the crumple waits for the knees; the plank goes at once; slide a little after landing
      const sl = Math.sqrt(z.S || 1); // (a giant three times as tall takes √3 as long to come down)
      const t0 = (D.type === 'crumple' ? 0.28 : D.type === 'spin' ? 0.12 : 0.02) * sl, dur = (D.type === 'plank' ? 0.62 : 0.55) * sl;
      const u = clamp((D.t - t0) / dur, 0, 1);
      const target = D.type === 'flat' ? 1.28 : D.dir * HALF_PI;
      if (!D.landed) {
        D.pitch = D.type === 'flat' ? 1.28 : target * u * u; // gravity: accelerating fall
        if (D.type === 'spin') z.heading += D.spin * dt * (1 - u * 0.6);
        if (u >= 1) { D.landed = true; D.tl = D.t; this.land(z, (D.type === 'plank' ? 1.1 : 0.9) * (z.giant ? 1.6 : 1)); }
      }
      z.x += z.vx * dt; z.z += z.vz * dt; z.vx *= Math.exp(-5 * dt); z.vz *= Math.exp(-5 * dt);
    }
    if (D.landed) {
      // bounce: a quick rebound of the tilt and a settle
      const k = D.t - D.tl;
      const base = D.type === 'flat' ? 1.28 : Math.sign(D.pitch || D.dir) * HALF_PI;
      D.pitch = base - Math.sign(base) * Math.max(0, Math.sin(Math.min(1, k / 0.22) * Math.PI)) * 0.14 * Math.exp(-k * 4);
      z.y = 0;
      z.vx *= Math.exp(-6 * dt); z.vz *= Math.exp(-6 * dt);
      z.x += z.vx * dt; z.z += z.vz * dt;
      if (k > 0.9) { z.state = 'dead'; z.deadT = 0; }
    }
    // lying bodies sit on the torso's thickness; buckled knees lower the body while it is still upright
    const lie = Math.min(1, Math.abs(D.pitch) / HALF_PI);
    const o = z.char.object;
    let yK = 0;
    const S = z.S || 1;
    if (D.type === 'crumple') yK = -0.27 * S * ease(clamp(D.t / (0.28 * Math.sqrt(S)), 0, 1)) * (1 - lie);
    o.rotation.set(D.pitch, z.heading, D.type === 'blast' ? D.spin * 0.08 * lie : D.side * 0.1 * lie);
    o.position.set(z.x, (z.y || 0) + yK + lie * 0.13 * S, z.z);
  }
  land(z, k) {
    const g = this.game, S = z.S || 1;
    g.audio.sfx('z_fall', { x: z.x, z: z.z, vol: k, pitch: S > 1 ? 0.5 : 1 });
    for (let i = 0; i < 5 * S; i++) g.effects.smoke.emit(z.x + (Math.random() - 0.5) * 0.8 * S, 0.1, z.z + (Math.random() - 0.5) * 0.8 * S, (Math.random() - 0.5) * 1.2 * S, 0.3, (Math.random() - 0.5) * 1.2 * S, 0.9, 0.3 * S, 1.2 * S, 0.55, 0.5, 0.42, 0.35);
    g.effects.pool(z.x + Math.sin(z.heading) * z.die.dir * 0.8 * S, z.z + Math.cos(z.heading) * z.die.dir * 0.8 * S, 0.65 * S);
    if (S > 1) { const p = g.player.pos, d = Math.hypot(p.x - z.x, p.z - z.z); if (d < 40) g.cam.shake(0.7 * (1 - d / 40)); }
  }

  // ---------------------------------------------------------------- procedural body language (after char.update)
  pose(z, dt, dist) {
    const B = z.char.bones;
    if (!B.hips) return;
    const t = (performance.now() / 1000) + z.seed;
    const add = (n, x = 0, y = 0, zz = 0) => { const b = B[n]; if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += zz; } };
    const set = (n, x = 0, y = 0, zz = 0) => { const b = B[n]; if (b) b.rotation.set(x, y, zz); };
    z.rootPitch = 0; z.rootRoll = 0;
    if (z.state === 'walk' || z.state === 'lunge') {
      const ph = z.char.phase || 0, L = z.limp, aL = Math.abs(L);
      if (z.runner) {
        // frantic: bent forward, arms flailing out of rhythm
        add('spine', 0.35); add('chest', 0.15); add('neck', -0.25); add('head', -0.15 + Math.sin(t * 9) * 0.08);
        add('armL', Math.sin(ph * 1.3 + 1) * 0.5 - 0.4, 0, 0.25 + Math.sin(t * 7) * 0.2); add('armR', Math.sin(ph * 1.1) * 0.5 - 0.6, 0, -0.3 - Math.sin(t * 6) * 0.2);
        add('foreL', -0.6); add('foreR', -0.8);
      } else {
        // limp: the bad knee stays stiff and the foot drags, the hip drops, the trunk sways over the good leg
        const bad = L > 0 ? 'L' : 'R', good = L > 0 ? 'R' : 'L';
        if (aL > 0) {
          const s = Math.sin(ph + (L > 0 ? 0 : Math.PI));
          add('shin' + bad, -0.35 * aL * Math.max(0, Math.cos(ph)));
          add('thigh' + bad, 0.12 * aL);
          add('foot' + bad, 0.25 * aL);
          add('hips', 0, 0, 0.08 * aL * s * Math.sign(L));
          add('spine', 0.05, 0, -0.12 * aL * s * Math.sign(L));
          add('shin' + good, 0.08 * aL);
        }
        add('spine', 0.12 * z.lurch); add('chest', 0.05);
        // head lolls; tics snap it sideways
        add('neck', 0.15 + Math.sin(t * 1.3) * 0.08, Math.sin(t * 0.7) * 0.2, 0.2 * Math.sin(t * 0.9));
        if (z.tic > 0) { add('head', 0, 0.9 * z.ticDir * Math.sin((z.tic / 0.25) * Math.PI), 0.5 * z.ticDir); add('armR', -0.3 * Math.sin((z.tic / 0.25) * Math.PI)); }
      }
      if (z.state === 'lunge') { set('armL', -2.0, 0, -0.2); set('armR', -2.05, 0, 0.2); set('foreL', -0.15); set('foreR', -0.15); add('spine', 0.35); add('head', -0.3); }
      if (z.hitT > 0) {
        const k = Math.sin((z.hitT / 0.32) * Math.PI);
        add('spine', -0.35 * k * z.hitX); add('chest', -0.25 * k * z.hitX, 0, 0.3 * k * (z.hitSide || 0)); add('head', -0.5 * k * z.hitX);
        z.rootPitch = -0.08 * k * z.hitX;
      }
    } else if (z.state === 'rise') {
      // climbing up off the ground: lying on the back → sitting → kneeling → standing
      const u = clamp(z.riseT / 1.9, 0, 1);
      const sit = ease(clamp(u / 0.4, 0, 1)), kneel = ease(clamp((u - 0.35) / 0.35, 0, 1)), stand = ease(clamp((u - 0.68) / 0.32, 0, 1));
      z.rootPitch = -HALF_PI * (1 - sit) + 0.25 * sit * (1 - stand);
      set('thighL', -1.4 * (sit - stand) - 0.2 * kneel * (1 - stand)); set('thighR', -1.5 * (sit - stand));
      set('shinL', 1.6 * (sit - stand * 0.9)); set('shinR', 1.5 * (sit - stand * 0.9));
      set('spine', 0.6 * sit * (1 - stand)); set('chest', 0.2 * sit * (1 - stand));
      set('armL', -0.6 - 0.8 * (1 - kneel) + Math.sin(t * 5) * 0.2, 0, 0.3); set('armR', -0.5 - 1.2 * kneel * (1 - stand), 0, -0.3);
      set('foreL', -0.4); set('foreR', -0.6);
      set('head', -0.4 * (1 - sit) + 0.3 * Math.sin(t * 3) * (1 - stand), 0.3 * Math.sin(t * 1.7), 0);
      z.y = 0.13 * (1 - sit) - 0.25 * kneel * (1 - stand);
    } else if (z.state === 'crawl') {
      // dragging itself on its hands, legs trailing, head up and looking at you
      const ph = t * (2.2 + z.speed * 3);
      const k = z.crawlIn ?? 1;
      // one hand reaches ahead while the other pulls under the chest
      set('armL', -2.25 + Math.sin(ph) * 0.65, 0, 0.3); set('armR', -2.25 - Math.sin(ph) * 0.65, 0, -0.3);
      set('foreL', -0.3 - Math.max(0, -Math.sin(ph)) * 0.9); set('foreR', -0.3 - Math.max(0, Math.sin(ph)) * 0.9);
      set('thighL', 0.05 + Math.sin(ph) * 0.05); set('thighR', 0.1); set('shinL', 0.25); set('shinR', 0.4 + Math.sin(ph * 0.5) * 0.1);
      set('spine', -0.15); set('chest', -0.1, Math.sin(ph) * 0.12, 0); set('neck', -0.55); set('head', -0.45, Math.sin(t * 1.3) * 0.2, 0);
      z.y = 0.17 * k;
    } else if (z.state === 'dying' || z.state === 'dead') {
      const D = z.die, u = clamp(D.t / 0.9, 0, 1), lie = Math.min(1, Math.abs(D.pitch) / HALF_PI);
      const fwd = D.pitch > 0;
      const sl = Math.sqrt(z.S || 1);
      if (D.type === 'crumple' && D.t < 0.4 * sl && !D.landed) {
        // the knees go first
        const k = ease(clamp(D.t / (0.28 * sl), 0, 1));
        set('thighL', -0.9 * k); set('thighR', -0.75 * k); set('shinL', 1.5 * k); set('shinR', 1.3 * k);
        set('spine', 0.35 * k); set('head', 0.4 * k, 0.3 * D.side * k, 0);
        set('armL', 0.1, 0, 0.3 * k); set('armR', 0.1, 0, -0.3 * k);
        return;
      }
      if (D.type === 'plank') {
        // stiff: straight legs, arms limp and trailing, head lolled
        set('thighL', 0); set('thighR', 0); set('shinL', 0.05); set('shinR', 0.05);
        set('armL', fwd ? -2.5 * lie : 0.12 * lie, 0, 0.2 + (fwd ? 0.3 : 1.1) * lie); set('armR', fwd ? -2.3 * lie : 0.1 * lie, 0, -0.2 - (fwd ? 0.35 : 1.2) * lie);
        set('head', fwd ? -0.3 * lie : 0.35 * lie, 0.9 * D.side * lie, 0);
      } else {
        // flail on the way down, then sprawl: arms out, one knee bent, head turned
        const fl = (1 - lie) * Math.sin(D.t * 14);
        set('armL', (fwd ? -2.5 : 0.15) * lie + fl * 0.6 - (1 - lie) * 1.0, 0, 0.4 + (fwd ? 0.2 : 0.95) * lie * (D.arms > 0.5 ? 1 : 0.5));
        set('armR', (fwd ? -2.2 : 0.12) * lie - fl * 0.6 - (1 - lie) * 0.8, 0, -0.4 - (fwd ? 0.25 : 0.95) * lie * (D.arms > 0.5 ? 0.5 : 1));
        set('foreL', -0.4 - 0.5 * lie); set('foreR', -0.3 - 0.7 * lie);
        set('thighL', -0.5 * lie * (D.side > 0 ? 1 : 0.2) - (1 - lie) * 0.5); set('thighR', -0.5 * lie * (D.side > 0 ? 0.2 : 1) - (1 - lie) * 0.4);
        set('shinL', 0.9 * lie * (D.side > 0 ? 1 : 0.3) + (1 - lie) * 0.8); set('shinR', 0.9 * lie * (D.side > 0 ? 0.3 : 1) + (1 - lie) * 0.7);
        set('spine', (fwd ? 0.1 : -0.15) * lie + (1 - lie) * 0.3); set('chest', 0, 0.2 * D.side * lie, 0);
        set('head', (fwd ? -0.2 : 0.2) * lie, 1.0 * D.side * lie, 0);
      }
      if (D.type === 'flat') { set('armL', -2.6, 0, 0.5); set('armR', -2.2, 0, -0.6); set('head', 0.2, 0.9 * D.side, 0); }
      set('neck', 0);
    }
  }

  // the giant's body language: a heavy, rolling gait — hunched, the head low and forward, the long arms swinging;
  // charging, arms out in front; the slam: both fists high over the head, leaning back, and down with the whole body
  poseGiant(z) {
    const B = z.char.bones;
    if (!B.hips) return;
    const t = (performance.now() / 1000) + z.seed;
    const add = (n, x = 0, y = 0, zz = 0) => { const b = B[n]; if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += zz; } };
    const set = (n, x = 0, y = 0, zz = 0) => { const b = B[n]; if (b) b.rotation.set(x, y, zz); };
    z.rootPitch = 0; z.rootRoll = 0; z.y = 0;
    const ph = z.char.phase || 0;
    if (z.state === 'slam') {
      const u = z.slamT, up = ease(clamp(u / 0.7, 0, 1)), down = ease(clamp((u - 0.72) / 0.1, 0, 1)), back = ease(clamp((u - 1.0) / 0.45, 0, 1));
      const hi = up * (1 - down), lo = down * (1 - back);
      set('armL', -2.95 * hi - 1.1 * lo, 0, 0.3 * hi + 0.15); set('armR', -2.95 * hi - 1.1 * lo, 0, -0.3 * hi - 0.15);
      set('foreL', -0.6 * hi - 0.2 * lo); set('foreR', -0.6 * hi - 0.2 * lo);
      add('spine', -0.3 * hi + 0.8 * lo); add('chest', -0.15 * hi + 0.25 * lo); add('head', -0.35 * hi + 0.25 * lo);
      add('thighL', -0.5 * lo); add('thighR', -0.5 * lo); add('shinL', 0.8 * lo); add('shinR', 0.8 * lo);
      z.y = -0.12 * lo * z.S;
      return;
    }
    add('spine', 0.3); add('chest', 0.12); add('neck', 0.2); add('head', -0.12 + Math.sin(t * 0.9) * 0.06, Math.sin(t * 0.5) * 0.15, 0);
    add('hips', 0, 0, Math.sin(ph) * 0.06);
    if (z.state === 'charge') {
      add('spine', 0.25);
      set('armL', -1.55 + Math.sin(ph) * 0.3, 0, 0.25); set('armR', -1.45 - Math.sin(ph) * 0.3, 0, -0.25); set('foreL', -0.3); set('foreR', -0.4);
    } else {
      add('armL', Math.sin(ph) * 0.35 - 0.1, 0, 0.2); add('armR', -Math.sin(ph) * 0.35 - 0.1, 0, -0.2); add('foreL', -0.25); add('foreR', -0.3);
    }
    if (z.state === 'stagger') { const k = Math.sin(clamp(z.staggerT / 0.8, 0, 1) * Math.PI); add('spine', -0.45 * k); add('head', -0.45 * k); z.rootPitch = -0.07 * k; }
    if (z.hitT > 0) { const k = Math.sin((z.hitT / 0.3) * Math.PI); add('chest', -0.12 * k * z.hitX); add('head', -0.2 * k * z.hitX); }
  }

  nextWave() {
    const g = this.game;
    this.wave++;
    const T = this.T = waveTuning(this.wave);
    this.toSpawn = T.count;
    this.spawned = 0; this.giantsLeft = T.giants; this.giantAt = Math.round(T.count * 0.4); this.giantT = 0;
    this.breakT = 12;
    this.supplied = false;
    const sub = this.wave === 1 ? 'Vienen por todas las calles' : T.giants > 1 ? `Más, más rápidos… y ${T.giants} gigantes` : T.giants ? (this.wave === 2 ? 'Más y más rápidos. Y algo enorme se acerca' : 'Más, más rápidos y con un gigante') : 'Más y más rápidos';
    g.hud.banner(`OLEADA ${this.wave}`, sub, 'dead', 2.5);
    g.hud.objectiveText(`Sobrevive a la <b>oleada ${this.wave}</b>.`);
    g.audio.sample('z4', { vol: 1.2, ui: true });
  }
  dropSupplies() {
    const g = this.game, p = g.player.pos;
    this.supplied = true;
    const q = g.map.nearestEdge(p.x + 6, p.z + 6, 40, (e) => e.walk && !e.blocked);
    if (!q) return;
    const r = Math.random(), id = r < 0.55 ? 'pistola' : r < 0.85 ? 'escopeta' : 'rifle';
    g.pickups.weapon(q.x, q.z, id, { pistola: 36, escopeta: 12, rifle: 10 }[id], { ttl: 60 });
    const q2 = g.map.nearestEdge(p.x - 6, p.z - 4, 40, (e) => e.walk && !e.blocked);
    if (q2) g.pickups.add('health', q2.x, q2.z, { ttl: 60 });
    g.hud.notify(`¡Oleada ${this.wave} superada! Han caído suministros cerca (+${this.wave * 25} €).`, 'gold', 4);
    g.player.money += this.wave * 25;
    g.hud.objectiveText('Descansa y recoge suministros. <b>La siguiente oleada</b> llega pronto.');
  }
}
