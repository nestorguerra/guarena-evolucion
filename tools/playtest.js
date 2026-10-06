// Dev-only automated play test: drives, walks, fights and gets chased, reporting anomalies.
// Load in the dev page:  const T = await import('/tools/playtest.js'); await T.run('drive', 120);
import { followRoute, turnSpeed } from '/src/traffic.js';

const g = () => window.game;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// a yield that background tabs do not throttle (their timers are clamped to a second)
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

export async function setup() {
  const G = g();
  if (G.state !== 'play') {
    document.getElementById('bPlay').click();
    await wait(600);
    if (!document.getElementById('select').hidden) document.getElementById('bStart').click();
    await wait(600);
  }
  // bot input: shadow the Input getters with our own values
  const inp = G.input;
  const bot = (window.bot = window.bot || {});
  const defaults = { moveX: 0, moveY: 0, throttle: 0, brakeIn: 0, steer: 0, handbrake: false, sprint: false, jump: false, enter: false, attack: false, horn: false,
    aim: false, fire: false, firePressed: false, interact: false, weaponNext: false, weaponPrev: false, weaponDigit: 0, reload: false, siren: false, crouch: false };
  for (const k in defaults) if (!(k in bot)) bot[k] = defaults[k];
  const ONESHOT = new Set(['enter', 'jump', 'attack', 'firePressed', 'interact', 'weaponNext', 'weaponPrev', 'weaponDigit', 'reload', 'siren', 'crouch']);
  for (const k of Object.keys(bot)) {
    Object.defineProperty(inp, k, { configurable: true, get: () => { const v = bot[k]; if (ONESHOT.has(k)) bot[k] = k === 'weaponDigit' ? 0 : false; return v; } });
  }
  return bot;
}

// frame stepping with timing
export async function sim(sec, onFrame) {
  const G = g();
  const n = Math.round(sec * 60);
  const times = [];
  for (let i = 0; i < n; i++) {
    // the hidden test pane fires visibilitychange → auto-pause; keep playing
    if (G.state === 'paused') { G.state = 'play'; document.getElementById('pause').hidden = true; }
    const t0 = performance.now();
    try { G.frame(1 / 60); } catch (e) { report.errors.push(String(e.stack || e).slice(0, 400)); }
    times.push(performance.now() - t0);
    if (onFrame) onFrame(i / 60);
    if (i % 30 === 0) { check(); await yieldNow(); }
  }
  report.frames.push(...times);
}

export const report = { errors: [], frames: [], issues: {}, samples: {}, notes: [] };
function issue(kind, detail) {
  const r = report.issues[kind] || (report.issues[kind] = { n: 0, ex: [] });
  r.n++;
  if (r.ex.length < 4) r.ex.push(detail);
}
const bad = (x) => !Number.isFinite(x);

const track = new Map();
function stuckTimer(key, moving, dt = 0.5) {
  const t = (track.get(key) || 0);
  const nt = moving ? 0 : t + dt;
  track.set(key, nt);
  return nt;
}

// called twice per simulated second
export function check() {
  const G = g();
  const map = G.map;
  const p = G.player;
  if (bad(p.pos.x) || bad(p.pos.z)) issue('player_nan', p.mode);
  if (!p.vehicle && map.buildingAt(p.pos.x, p.pos.z)) issue('player_in_building', `${p.mode} ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`);
  for (const v of G.fleet.vehicles) {
    if (bad(v.x) || bad(v.z) || bad(v.heading)) { issue('vehicle_nan', v.model); continue; }
    if (map.buildingAt(v.x, v.z)) issue('vehicle_in_building', `${v.model} ai=${!!v.ai} drv=${v.driver} ${v.x.toFixed(1)},${v.z.toFixed(1)}`);
    if (v.ai && v.ai.mode === 'traffic') {
      const s = stuckTimer('v' + v.id, v.vel > 0.6);
      if (s > 12 && s < 12.6) issue('traffic_stuck_12s', `${v.model} ${v.x.toFixed(0)},${v.z.toFixed(0)}`);
    }
  }
  for (const u of G.police.units) {
    const s = stuckTimer('u' + u.v.id, u.v.vel > 1 || u.state === 'leave');
    if (s > 8 && s < 8.6) issue('police_stuck_8s', `${u.v.x.toFixed(0)},${u.v.z.toFixed(0)}`);
  }
  for (const ped of G.peds.list) {
    if (bad(ped.x) || bad(ped.z)) { issue('ped_nan', ped.state); continue; }
    if (map.buildingAt(ped.x, ped.z) && ped.state !== 'fly') issue('ped_in_building', `${ped.state} ${ped.x.toFixed(1)},${ped.z.toFixed(1)}`);
    if (ped.state === 'walk') {
      const key = ped.__id || (ped.__id = 'p' + Math.random().toString(36).slice(2));
      const moved = Math.hypot(ped.x - (ped._lx ?? ped.x + 1), ped.z - (ped._lz ?? ped.z + 1)) > 0.2;
      ped._lx = ped.x; ped._lz = ped.z;
      const s = stuckTimer(key, moved);
      if (s > 6 && s < 6.6) issue('ped_stuck_walking', `${ped.x.toFixed(0)},${ped.z.toFixed(0)}`);
    }
    if (ped.char && !ped.char.ready && ped.t > 5) issue('ped_char_not_ready', ped.char.key);
  }
  for (const o of G.police.officers) {
    if (bad(o.x) || bad(o.z)) issue('officer_nan', o.state);
    if (map.buildingAt(o.x, o.z)) issue('officer_in_building', `${o.x.toFixed(1)},${o.z.toFixed(1)}`);
  }
  report.samples.peds = G.peds.list.length;
  report.samples.vehicles = G.fleet.vehicles.length;
  report.samples.live = G.chars.live.size;
}

export function stats() {
  const f = report.frames.slice().sort((a, b) => a - b);
  const q = (p) => (f.length ? f[Math.min(f.length - 1, Math.floor(p * f.length))].toFixed(2) : '-');
  return { notes: report.notes.slice(-16), frames: f.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over25: f.filter((x) => x > 25).length, errors: report.errors.slice(0, 5), issues: report.issues, samples: report.samples };
}
export function reset() { report.errors = []; report.frames = []; report.issues = {}; track.clear(); }

// ------------------------------------------------------------ scenarios
// drive the nearest car along random routes across town
export async function drive(sec = 90) {
  const G = g();
  const bot = await setup();
  const p = G.player;
  if (!p.vehicle) {
    G.fleet.streamParked(p.pos.x, p.pos.z);
    const vs = G.fleet.vehicles.filter((v) => !v.driver && !v.ai && !v.ctrl && !v.dead).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
    p.getIn(vs[0]);
  }
  const edges = G.map.edges.filter((e) => e.drive && !e.blocked && e.len > 20 && G.map.inTown(e.pts[0], e.pts[1]));
  const st = { path: null, seg: 0 };
  let dest = null, stuck = 0, legs = 0, arrived = 0, revT = 0, revSteer = 0, reversals = 0;
  const newDest = () => {
    const e = edges[Math.floor(Math.random() * edges.length)];
    dest = { x: e.pts[0], z: e.pts[1] };
    const v = p.vehicle;
    st.path = G.map.routeFrom(v.x, v.z, v.heading, dest.x, dest.z, {});
    st.seg = 0; legs++;
  };
  newDest();
  const out = {};
  await sim(sec, () => {
    const v = p.vehicle;
    if (!v) return;
    const f = followRoute(st, v.x, v.z, v.heading, Math.abs(v.speed), out);
    const tsp = turnSpeed(f.turn, v.spec.top * 0.8);
    // steer like the traffic AI, but through the player's controls
    const dx = f.x - v.x, dz = f.z - v.z;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lf = dx * fx + dz * fz, lr = dx * -fz + dz * fx;
    let steer = Math.max(-1, Math.min(1, Math.atan2(lr, Math.max(0.1, lf)) * 1.6));
    if (lf < 0) steer = lr >= 0 ? 1 : -1;
    bot.steer = steer;
    const want = tsp, sp = v.speed;
    bot.throttle = sp < want ? 1 : 0;
    bot.brakeIn = sp > want + 2 ? 1 : 0;
    if (revT > 0) { revT -= 1 / 60; bot.throttle = 0; bot.brakeIn = 1; bot.steer = revSteer; return; }
    if (v.vel < 0.8) stuck += 1 / 60; else stuck = 0;
    if (stuck > 1.5) { stuck = 0; revT = 1.8; revSteer = -steer || 1; reversals++; }
    if (f.done || Math.hypot(v.x - dest.x, v.z - dest.z) < 12) { arrived++; newDest(); }
  });
  bot.throttle = 0; bot.brakeIn = 1; bot.steer = 0;
  return { legs, arrived, reversals, ...stats() };
}

// walk on foot towards random points; checks for getting stuck in geometry
export async function walk(sec = 60) {
  const G = g();
  const bot = await setup();
  const p = G.player;
  if (p.vehicle) { bot.enter = true; await sim(1); }
  const pts = G.map.edges.filter((e) => e.walk && !e.blocked && G.map.inTown(e.pts[0], e.pts[1]));
  let tgt = null, blocked = 0, stuckEvents = 0, lx = p.pos.x, lz = p.pos.z;
  const pick = () => { const e = pts[Math.floor(Math.random() * pts.length)]; tgt = { x: e.pts[0], z: e.pts[1] }; };
  pick();
  await sim(sec, (t) => {
    const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3 || blocked > 3) { if (blocked > 3) stuckEvents++; blocked = 0; pick(); return; }
    // convert the world direction to camera-relative stick input
    const yaw = G.cam.forwardYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    bot.moveY = (dx * fx + dz * fz) / d; bot.moveX = (dx * rx + dz * rz) / d;
    bot.sprint = d > 20;
    const moved = Math.hypot(p.pos.x - lx, p.pos.z - lz);
    lx = p.pos.x; lz = p.pos.z;
    if (moved < 0.02) blocked += 1 / 60; else blocked = Math.max(0, blocked - 1 / 120);
  });
  bot.moveX = bot.moveY = 0; bot.sprint = false;
  return { stuckEvents, ...stats() };
}

// start trouble and drive away from the police
export async function chase(sec = 90) {
  const G = g();
  await setup();
  G.police.crime('policia', G.player.pos.x, G.player.pos.z);
  G.police.crime('explosion', G.player.pos.x, G.player.pos.z);
  const r = await drive(sec);
  return { wanted: G.police.wanted, units: G.police.units.length, officers: G.police.officers.length, state: G.state, ...r };
}

// brawl: punch every pedestrian in reach, then run people over
export async function brawl(sec = 40) {
  const G = g();
  const bot = await setup();
  const p = G.player;
  let punches = 0;
  await sim(sec, (t) => {
    const peds = G.peds.list.filter((x) => x.state !== 'lie' && x.state !== 'fly');
    let best = null, bd = 60;
    for (const x of peds) { const d = Math.hypot(x.x - p.pos.x, x.z - p.pos.z); if (d < bd) { bd = d; best = x; } }
    if (!best) { bot.moveY = 0; return; }
    const dx = best.x - p.pos.x, dz = best.z - p.pos.z, d = Math.hypot(dx, dz);
    const yaw = G.cam.forwardYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    if (d > 1.1) { bot.moveY = (dx * fx + dz * fz) / d; bot.moveX = (dx * rx + dz * rz) / d; bot.sprint = true; }
    else { bot.moveX = bot.moveY = 0; p.heading = Math.atan2(dx, dz); if (Math.random() < 0.2) { bot.attack = true; bot.firePressed = true; punches++; } }
  });
  bot.moveX = bot.moveY = 0; bot.sprint = false;
  return { punches, wanted: G.police.wanted, ...stats() };
}

// steer the player's car along a route to a moving target (the HUD objective by default)
function carBot(G, bot, target) {
  const st = { path: null, seg: 0 }, out = {};
  let stuck = 0, revT = 0, revSteer = 0, reT = 0, last = null;
  return (dt) => {
    const v = G.player.vehicle;
    if (!v) return;
    const t = target();
    if (!t) { bot.throttle = 0; bot.brakeIn = 1; return; }
    reT -= dt;
    if (!st.path || reT <= 0 || !last || Math.hypot(t.x - last.x, t.z - last.z) > 15) {
      st.path = G.map.routeFrom(v.x, v.z, v.heading, t.x, t.z, {}); st.seg = 0; reT = 2.5; last = { x: t.x, z: t.z };
    }
    const d = Math.hypot(t.x - v.x, t.z - v.z);
    const f = followRoute(st, v.x, v.z, v.heading, Math.abs(v.speed), out);
    let tx = f.x, tz = f.z;
    if (f.done || d < 18) { tx = t.x; tz = t.z; }
    const dx = tx - v.x, dz = tz - v.z;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lf = dx * fx + dz * fz, lr = dx * -fz + dz * fx;
    let steer = Math.max(-1, Math.min(1, Math.atan2(lr, Math.max(0.1, lf)) * 1.6));
    if (lf < 0) steer = lr >= 0 ? 1 : -1;
    bot.steer = steer;
    let want = turnSpeed(f.turn, v.spec.top * 0.8);
    if (t.stop) want = Math.min(want, Math.max(0, (d - t.stop) * 0.6));
    const sp = v.speed;
    bot.throttle = sp < want ? 1 : 0;
    bot.brakeIn = sp > want + 1.5 ? 1 : 0;
    if (revT > 0) { revT -= dt; bot.throttle = 0; bot.brakeIn = 1; bot.steer = revSteer; return; }
    if (v.vel < 0.8 && want > 2) stuck += dt; else stuck = 0;
    if (stuck > 1.5) { stuck = 0; revT = 1.8; revSteer = -steer || 1; }
  };
}

// taxi shift: get in a taxi, start the shift and do fares by following the GPS
export async function taxi(sec = 180) {
  const G = g();
  const bot = await setup();
  const p = G.player;
  if (p.vehicle) { bot.enter = true; await sim(1); }
  let v = G.fleet.vehicles.find((x) => x.spec.livery === 'taxi' && !x.ai && !x.dead);
  if (!v) { const s = G.fleet.freeSpotNear(p.pos.x, p.pos.z, 'taxi'); v = G.fleet.spawn('taxi', s.x, s.z, s.heading, '#f4f4f0', { sleeping: false }); }
  p.getIn(v);
  await sim(0.5);
  bot.interact = true;
  await sim(0.5);
  const A = G.activities;
  const steer = carBot(G, bot, () => {
    const T = A.taxi; if (!T) return null;
    if (T.stage === 'seek') return { x: T.pickup.rx, z: T.pickup.rz, stop: 3 };
    if (T.stage === 'board') return { x: v.x, z: v.z, stop: 99 };
    if (T.stage === 'ride') return { x: T.dest.x, z: T.dest.z, stop: 5 };
    return null;
  });
  const log = [];
  let stage = '';
  await sim(sec, () => { steer(1 / 60); const T = A.taxi; const s = T ? T.stage : 'off'; if (s !== stage) { stage = s; log.push(`${G.time.toFixed(0)}s ${s}${T && T.dest && s === 'ride' ? ' → ' + T.dest.name : ''}`); } });
  const T = A.taxi;
  return { fares: T ? T.fares : -1, earned: T ? T.earned : -1, money: p.money, log: log.slice(-14), ...stats() };
}

// police patrol: get in a patrol car and chase suspects
export async function patrol(sec = 180) {
  const G = g();
  const bot = await setup();
  const p = G.player;
  if (p.vehicle) { bot.enter = true; await sim(1); }
  G.police.clear();
  let v = G.fleet.vehicles.find((x) => x.spec.livery === 'local' && !x.ai && !x.dead && !x.police);
  if (!v) { const s = G.fleet.freeSpotNear(p.pos.x, p.pos.z, 'policia'); v = G.fleet.spawn('policia', s.x, s.z, s.heading, '#f4f4f0', { sleeping: false }); }
  p.getIn(v);
  await sim(0.5);
  bot.interact = true;
  await sim(0.5);
  const A = G.activities;
  const steer = carBot(G, bot, () => { const P = A.patrol; return P && P.suspect ? { x: P.suspect.x, z: P.suspect.z } : null; });
  const log = [];
  let cur = null;
  await sim(sec, () => { steer(1 / 60); const P = A.patrol; const s = P && P.suspect; if (s !== cur) { cur = s; log.push(`${G.time.toFixed(0)}s ${s ? 'suspect ' + s.spec.name : 'none'} caught=${P ? P.caught : '-'}`); } });
  const P = A.patrol;
  return { caught: P ? P.caught : -1, earned: P ? P.earned : -1, log: log.slice(-14), wanted: G.police.wanted, ...stats() };
}

// gunfight: all the guns, shooting at whoever is around, reloading and switching
export async function gunfight(sec = 40) {
  const G = g();
  const bot = await setup();
  const p = G.player;
  if (p.vehicle) { bot.enter = true; await sim(1); }
  const W = G.weapons;
  W.give('pistola', 60); W.give('subfusil', 120); W.give('escopeta', 30); W.give('bate', 0);
  let shots = 0, kills = 0, switches = 0;
  const used = {};
  const died = () => G.peds.list.filter((x) => x.state === 'dead').length;
  const k0 = died();
  let t = 0;
  await sim(sec, (tt) => {
    t += 1 / 60;
    if (Math.floor(t * 0.2) !== Math.floor((t - 1 / 60) * 0.2)) { bot.weaponNext = true; switches++; }
    const peds = G.peds.list.filter((x) => x.state !== 'dead' && x.state !== 'fly');
    let best = null, bd = 90;
    for (const x of peds) { const d = Math.hypot(x.x - p.pos.x, x.z - p.pos.z); if (d < bd) { bd = d; best = x; } }
    if (!best) { bot.moveY = 0; bot.fire = false; return; }
    used[W.cur] = (used[W.cur] || 0) + 1;
    const dx = best.x - p.pos.x, dz = best.z - p.pos.z, d = Math.hypot(dx, dz);
    const yaw = G.cam.forwardYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const range = W.def.melee ? 1.2 : 12;
    if (d > range) { bot.moveY = (dx * fx + dz * fz) / d; bot.moveX = (dx * rx + dz * rz) / d; bot.sprint = true; bot.fire = false; }
    else {
      bot.moveX = bot.moveY = 0; bot.sprint = false;
      G.cam.yaw = Math.atan2(dx, dz) + Math.PI; // look at the target: auto-aim picks it
      if (W.def.auto) bot.fire = true; else if (Math.random() < 0.15) { bot.firePressed = true; bot.attack = true; shots++; }
    }
  });
  bot.fire = false; bot.moveX = bot.moveY = 0; bot.sprint = false;
  return { shots, switches, used, kills: died() - k0, wanted: G.police.wanted, hp: Math.round(p.health), inv: W.toJSON(), officers: G.police.officers.length, ...stats() };
}

// capture HUD notifications / banners into report.notes
function tapNotes(G) {
  if (G.hud.__tapped) return;
  G.hud.__tapped = true;
  const n = G.hud.notify.bind(G.hud), bn = G.hud.banner.bind(G.hud);
  G.hud.notify = (t, k, d) => { report.notes.push(`${G.time.toFixed(0)}s ${t}`); return n(t, k, d); };
  G.hud.banner = (t, s2, k, d) => { report.notes.push(`${G.time.toFixed(0)}s [${t}] ${s2 || ''}`); return bn(t, s2, k, d); };
}

// stealth: get two stars, run off, crouch and hide in a container out of sight (or in plain view: they come and open it)
export async function stealth(sec = 60, inView = false) {
  const G = g();
  const bot = await setup();
  const p = G.player, P = G.police;
  if (p.vehicle) p.exitVehicle();
  if (p.hideIn) p.leaveContainer();
  P.clear();
  await sim(1);
  P.crime('policia', p.pos.x, p.pos.z); P.crime('policia', p.pos.x, p.pos.z);
  const log = [];
  let hid = false, found = false, maxUnits = 0, maxOff = 0;
  const conts = P.conts.filter((c) => !c.broken);
  await sim(sec, (t) => {
    maxUnits = Math.max(maxUnits, P.units.length); maxOff = Math.max(maxOff, P.officers.length);
    if (inView && !hid && t > 3 && !P.officers.length && P.units.length) P.deploy(P.units[0]);
    if (!hid && (inView ? P.officers.length > 0 && t > 3 : t > 2)) {
      // the container nearest to an officer (in view) or nearest to us (out of sight)
      const ref = inView && P.officers[0] ? P.officers[0] : { x: p.pos.x, z: p.pos.z };
      let c = null, bd = Infinity;
      for (const k of conts) { const d = Math.hypot(k.x - ref.x, k.z - ref.z) + (inView ? 0 : 0); if (d < bd && (!inView || d > 4)) { bd = d; c = k; } }
      if (inView && P.officers[0]) { const o = P.officers[0]; p.pos.set(c.x + 1, 0, c.z); o.x = c.x + 6; o.z = c.z; o.heading = Math.atan2(c.x - o.x, c.z - o.z); }
      else if (!inView) { p.pos.set(c.x + 1, 0, c.z); P.lastCrimeT = -99; for (const u of P.units) { u.v.x += 300; } for (const o of P.officers) { o.x += 300; } }
      P.lookT = 0; P.seenNow = P.observe(true);
      p.hideInContainer(c); hid = true;
      log.push(`${t.toFixed(1)}s hid (seen: ${!!P.hideSpot}) wanted ${P.wanted}`);
    }
    if (hid && !found && p.mode === 'foot' && !p.hideIn) { found = true; log.push(`${t.toFixed(1)}s pulled out, wanted ${P.wanted}`); }
    if (Math.round(t * 60) % 300 === 0) log.push(`${t.toFixed(1)}s state ${P.state} wanted ${P.wanted} lostT ${P.lostT.toFixed(1)} search ${P.searchT.toFixed(1)}/${P.searchDuration} units ${P.units.length} off ${P.officers.length} modes ${P.officers.map((o) => o.mode).join(',')}`);
  });
  return { wanted: G.police.wanted, hid, found, maxUnits, maxOff, log, notes: report.notes.slice(-14), errors: report.errors.slice(0, 3) };
}

// witnesses: a quiet takedown (nobody looking), then a punch in front of someone (they phone the police)
export async function witness(sec = 30) {
  const G = g();
  await setup();
  const p = G.player, P = G.police, PD = G.peds;
  if (p.vehicle) p.exitVehicle();
  if (p.hideIn) p.leaveContainer();
  P.clear();
  G.sky.hour = 11;
  const walkers = () => PD.list.filter((x) => x.state === 'walk' && !x.fixed);
  for (let k = 0; k < 10 && walkers().length < 4; k++) await sim(1);
  const log = [];
  // 1) takedown from behind, others far away
  let A = walkers()[0];
  if (!A) return { err: 'no peds' };
  for (const o of PD.list) if (o !== A && Math.hypot(o.x - A.x, o.z - A.z) < 40) { o.x += 200; } // clear the street
  p.pos.set(A.x - Math.sin(A.heading) * 1.1, 0, A.z - Math.cos(A.heading) * 1.1); p.crouch = true;
  log.push('canTakedown ' + PD.canTakedown(A));
  PD.takedown(A);
  await sim(3);
  log.push(`after takedown: calls ${P.calls.size} wanted ${P.wanted} A ${A.state}`);
  // 2) punch someone in front of a witness
  p.crouch = false;
  const ws = walkers().filter((x) => x !== A);
  const B = ws[0], C = ws[1];
  if (!B || !C) return { log, err: 'not enough peds' };
  const cp = PD.sidePoint(B.edge, B.s + 7 * B.dir, B.side, {});
  C.x = cp.x; C.z = cp.z; C.heading = Math.atan2(B.x - C.x, B.z - C.z); C.state = 'idle'; C.idleT = 30;
  p.pos.set(B.x - Math.sin(B.heading) * 1.1, 0, B.z - Math.cos(B.heading) * 1.1);
  log.push(`witness LOS ${G.map.collider.raycast(C.x, C.z, p.pos.x, p.pos.z, 1.6, 1.2).toFixed(2)} d ${Math.hypot(C.x - p.pos.x, C.z - p.pos.z).toFixed(1)} list ${PD.witnesses({ victim: B }).length}`);
  PD.damage(B, 12, -1, 0, 'player', 'fist');
  log.push(`punch: calls ${P.calls.size} (${[...P.calls].map((c) => c === C ? 'witness' : c === B ? 'victim' : 'other').join(',')}) state ${P.state}`);
  let reported = -1;
  await sim(sec, (t) => { if (reported < 0 && P.wanted > 0) { reported = t; log.push(`${t.toFixed(1)}s wanted ${P.wanted} state ${P.state} lkp ${P.lkp.x.toFixed(0)},${P.lkp.z.toFixed(0)}`); } });
  log.push(`end: wanted ${P.wanted} calls ${P.calls.size} inv ${!!P.inv} units ${P.units.length} off ${P.officers.length} A ${A.state} found ${!!A.found}`);
  return { log, notes: report.notes.slice(-10), errors: report.errors.slice(0, 3) };
}

// ram parked cars over and over: none of the others may shoot off (max speed of cars nobody drives)
export async function bump(n = 6) {
  const G = g();
  const bot = await setup();
  const p = G.player, F = G.fleet;
  if (p.hideIn) p.leaveContainer();
  const log = [];
  let worst = 0, worstW = 0;
  for (let k = 0; k < n; k++) {
    const parked = F.vehicles.filter((v) => !v.driver && !v.ai && !v.police && !v.dead && v.sleeping && v.spot);
    const t = parked[Math.floor(Math.random() * parked.length)];
    if (!t) break;
    if (p.vehicle) p.exitVehicle();
    await sim(0.3);
    // a car of ours 14 m behind the parked one, pointing at it
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    let mine = F.vehicles.find((v) => v.__bumper && !v.dead && !v.removed);
    if (!mine) { mine = F.spawn('veton', t.x - fx * 14, t.z - fz * 14, t.heading, '#c33', { sleeping: false }); if (!mine) { log.push('no spawn'); continue; } mine.__bumper = true; }
    mine.x = t.x - fx * 14; mine.z = t.z - fz * 14; mine.heading = t.heading; mine.vx = mine.vz = mine.w = 0; mine.health = 1000; mine.locked = false;
    p.pos.set(mine.x, 0, mine.z);
    p.getIn ? p.getIn(mine) : (p.vehicle = mine, p.mode = 'car', mine.driver = 'player');
    const near = F.vehicles.filter((v) => v !== mine && Math.hypot(v.x - t.x, v.z - t.z) < 25);
    bot.throttle = 1; bot.steer = 0;
    await sim(3.2, () => {
      for (const v of near) if (!v.driver && !v.ai) { worst = Math.max(worst, v.vel); worstW = Math.max(worstW, Math.abs(v.w || 0)); }
    });
    bot.throttle = 0; bot.brakeIn = 1;
    await sim(2.5, () => { for (const v of near) if (!v.driver && !v.ai) { worst = Math.max(worst, v.vel); worstW = Math.max(worstW, Math.abs(v.w || 0)); } });
    bot.brakeIn = 0;
    const moving = near.filter((v) => !v.driver && !v.ai && v.vel > 0.5).length;
    log.push(`hit ${k}: target moved ${Math.hypot(t.x - (t.spot ? t.spot.x : t.x), t.z - (t.spot ? t.spot.z : t.z)).toFixed(1)} m, still rolling ${moving}`);
  }
  if (p.vehicle) p.exitVehicle();
  return { worstSpeed: +worst.toFixed(1), worstSpin: +worstW.toFixed(2), log, errors: report.errors.slice(0, 3) };
}

export async function run(name, sec) {
  reset();
  report.notes = [];
  tapNotes(g());
  const fn = { drive, walk, chase, brawl, taxi, patrol, gunfight, stealth, witness, bump }[name];
  return fn(sec);
}
