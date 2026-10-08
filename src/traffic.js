// AI traffic of Guareña, driving by the Reglamento General de Circulación: every car, motorbike and bicycle is going
// somewhere (a route planned with A* across town, one-way streets respected), never above the legal limit of the
// street it is on (art. 50: 20 km/h on single-platform streets, 30 in town, 50 on the travesías signed at the town
// entries, 90 on the roads outside), at a safe distance from whoever is ahead, slowing for bends. At the junctions
// they obey the STOP (a full stop at the line) and the give-way signs, give way to the right where there are no signs
// (art. 57), let the oncoming traffic by before turning left, and never stop inside a junction (art. 59); at the zebra
// crossings they give way to whoever is on them or waiting at the kerb, and turning into a street, to whoever is
// crossing it (art. 65); they crawl past people in the narrow streets and keep a metre and a half from a bicycle.
// They pull away and brake gently, as one drives in a town where everybody knows everybody. Bicycles and motorbikes
// carry their riders (neighbours of the town, see census.js). Also the route helpers shared with the police.
import { TRAFFIC_MIX, MODELS } from './vehicles.js';
import { randomDesc } from './characters.js';
import { polySample, polyNearest, clamp, wrapAngle } from './util.js';
import { kerbAt } from './kerbs.js';

const KMH = 3.6;
// lane geometry: parked cars take 2.2 m on their side, lanes share what is left
function laneGeom(e) {
  if (e._lg) return e._lg;
  const ps = e.parkSide || 0;
  const avail = e.w - (ps === 2 ? 4.4 : ps ? 2.2 : 0);
  const shift = ps === 1 ? -1.1 : ps === -1 ? 1.1 : 0; // along the edge's right vector
  const off = aiOneway(e) ? 0 : Math.max(0.6, Math.min(avail / 4 + 0.12, avail / 2 - 1.0));
  return (e._lg = { shift, off, avail });
}
// narrow two-way streets behave as one-way for AI traffic (a -> b) to avoid head-on deadlocks
export function aiOneway(e) { return e.oneway || (e.w < 4.7 ? 1 : 0); }
export function aiCanDrive(map, e, from) {
  if (!e.drive || e.blocked || e.closed) return false; // (closed: the stretch of the mercadillo on market mornings)
  const ow = aiOneway(e);
  if (!ow) return true;
  const fwd = e.a === from;
  return ow === 1 ? fwd : !fwd;
}

// the legal limit of a street (m/s): Reglamento General de Circulación, art. 50 (as from 2021)
export function legalLimit(map, e) {
  if (e._lim) return e._lim;
  const n = e.pts.length;
  const town = map.inTown(e.pts[0], e.pts[1]) || map.inTown(e.pts[n - 2], e.pts[n - 1]);
  let k;
  if (e.dirt || e.cls === 'track') k = 30;
  else if (!town) k = e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary' ? 90 : 50;
  else if (e.cls === 'living_street' || (e.kerb && e.kerb.regime === 2) || (e.w < 5.5 && (e.sw || 0) < 0.4)) k = 20; // single platform: no kerb to speak of (kerbs.js)
  else if (e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary') k = 50; // the travesía (signed at the town entries)
  else k = 30;
  return (e._lim = k / KMH);
}

// point on the lane of edge e travelling in dir at distance s from the start (in travel direction). offMul moves it
// across the lane (1: the lane's middle; a bicycle rides further right)
export function lanePoint(map, e, dir, s, out = {}, offMul = 1, extra = 0) {
  const sp = dir > 0 ? s : e.len - s;
  polySample(e.pts, e.cum, clamp(sp, 0, e.len), out);
  const lg = laneGeom(e);
  // lateral position measured along the edge's own right vector (-dz, dx)
  let lat = lg.shift + dir * (lg.off * offMul + extra);
  if (extra) lat = clamp(lat, -e.w / 2 + 0.6, e.w / 2 - 0.6); // (a bicycle keeps clear of the kerb)
  if (e.kerb) { // (the kerbs as laid along the houses, kerbs.js: the lanes moved and narrowed with the carriageway there)
    const kp = kerbAt(e, sp, 1), km = kerbAt(e, sp, -1), hw = e.w / 2;
    lat = (kp - km) / 2 + lat * Math.min(1.25, (kp + km) / 2 / Math.max(0.5, hw));
  }
  out.x += -out.dz * lat; out.z += out.dx * lat;
  out.dx *= dir; out.dz *= dir;
  return out;
}

export function endNode(e, dir) { return dir > 0 ? e.b : e.a; }
// the direction a street leaves node n in (unit vector)
function awayFrom(e, n) {
  const p = e.pts, k = p.length, at = e.a === n;
  const dx = at ? p[2] - p[0] : p[k - 4] - p[k - 2], dz = at ? p[3] - p[1] : p[k - 3] - p[k - 1], l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}

// choose the next edge at the end node (prefers straight on)
export function chooseNext(map, e, dir, rnd = Math.random, allowTrack = false) {
  const n = endNode(e, dir);
  const node = map.nodes[n];
  const endDir = lanePoint(map, e, dir, e.len - 0.1, {});
  const cands = [];
  for (const id of node.edges) {
    if (id === e.id) continue;
    const ne = map.edges[id];
    if (!ne.drive || ne.len < 1) continue;
    if (!allowTrack && (ne.cls === 'track' || ne.dirt) && !(e.cls === 'track' || e.dirt)) continue;
    if (!aiCanDrive(map, ne, n)) continue;
    const nd = ne.a === n ? 1 : -1;
    const st = lanePoint(map, ne, nd, 0.5, {});
    const turnS = wrapAngle(Math.atan2(st.dx, st.dz) - Math.atan2(endDir.dx, endDir.dz));
    const turn = Math.abs(turnS);
    let w = turn < 0.5 ? 3 : turn < 1.9 ? 1.2 : 0.4;
    if (turn > 1.95 && Math.min(e.w, ne.w) < 6.2) w *= 0.08; // (a hairpin into a narrow street: only if there is nothing else)
    if (ne.cls === 'service') w *= 0.25;
    if (ne.cls === 'primary' || ne.cls === 'tertiary') w *= 1.4;
    cands.push({ edge: ne, dir: nd, w, turn, turnS });
  }
  if (!cands.length) {
    // dead end: U-turn if allowed
    if (!aiOneway(e)) return { edge: e, dir: -dir, w: 1, turn: Math.PI, turnS: Math.PI };
    return null;
  }
  let tot = cands.reduce((a, c) => a + c.w, 0), r = rnd() * tot;
  for (const c of cands) { r -= c.w; if (r <= 0) return c; }
  return cands[cands.length - 1];
}

// Steering / speed controller shared by traffic, police and racers
export function driveToward(v, tx, tz, targetSpeed, dt) {
  steerToward(v, tx, tz);
  const err = targetSpeed - v.speed;
  if (err > 0) { v.throttle = clamp(err * 0.45 + 0.1, 0, 1); v.brake = 0; }
  else { v.throttle = 0; v.brake = clamp(-err * 0.3, 0, 1); }
  if (targetSpeed <= 0.05 && Math.abs(v.speed) < 0.4) { v.throttle = 0; v.brake = 1; }
  v.handbrake = 0;
}
function steerToward(v, tx, tz) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const rx = -fz, rz = fx;
  const dx = tx - v.x, dz = tz - v.z;
  const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
  const L2 = Math.max(4, dx * dx + dz * dz);
  const kappa = (2 * lr) / L2;
  const delta = Math.atan(kappa * v.spec.wb);
  const maxSteer = v.spec.steer / (1 + Math.abs(v.speed) * 0.055);
  let steer = clamp(delta / maxSteer, -1, 1);
  // target behind us: full lock towards its side (turn around)
  if (lf < 0) steer = lr >= 0 ? 1 : -1;
  else if (lf < Math.abs(lr) * 0.5) steer = clamp(steer * 2, -1, 1);
  v.steerIn = steer;
}
// the careful driver's pedals: the acceleration wanted to reach the target speed in about a second, within what is
// comfortable (pulling away ~1.5 m/s², braking ~2.5 m/s²; much harder only when something comes up)
function pedals(v, tsp, hard) {
  const ai = v.ai, sp = v.speed;
  let a = (tsp - sp) / 0.9;
  a = clamp(a, hard ? -8.5 : -Math.min(2.6, ai.bComf * 1.3), ai.aComf); // (an emergency stop only in an emergency; the brake on top of the drag)
  if (a >= 0) {
    const k = clamp(sp / v.spec.top, 0, 1);
    v.throttle = clamp(a / (v.spec.accel * 1.25 * Math.max(0.12, 1 - k * k)) + 0.015, 0, 1);
    v.brake = 0;
  } else { v.throttle = 0; v.brake = clamp(-a / 13, 0, 1); }
  if (tsp <= 0.05 && Math.abs(sp) < 0.45) { v.throttle = 0; v.brake = 1; }
  v.handbrake = 0;
}
// the fastest one can follow whoever is ahead and still stop behind them if they brake (a safe time headway T and
// the comfortable deceleration b; s0 the gap kept when stopped)
function safeSpeed(gap, vLead, T, b, s0) {
  const g = gap - s0 + (vLead * vLead) / (2 * b);
  if (g <= 0) return 0;
  return Math.max(0, b * (-T + Math.sqrt(T * T + (2 * g) / b)));
}

// Follow a polyline route: progress by projection, lookahead target and the sharpest turn ahead.
export function followRoute(st, x, z, heading, speed, out = {}) {
  const P = st.path;
  const N = P.length / 2;
  if (N < 2) { out.x = P[0]; out.z = P[1]; out.turn = 0; out.done = true; return out; }
  let seg = st.seg || 0, bd = Infinity, bs = seg, bt = 0;
  for (let i = seg; i < Math.min(N - 1, seg + 12); i++) {
    const ax = P[i * 2], az = P[i * 2 + 1], bx = P[i * 2 + 2], bz = P[i * 2 + 3];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < bd) { bd = d; bs = i; bt = t; }
  }
  st.seg = bs; st.off = bd;
  const walk = (dist) => {
    let i = bs;
    let px = P[i * 2] + (P[i * 2 + 2] - P[i * 2]) * bt, pz = P[i * 2 + 1] + (P[i * 2 + 3] - P[i * 2 + 1]) * bt;
    let left = dist;
    while (left > 0 && i < N - 1) {
      const nx = P[i * 2 + 2], nz = P[i * 2 + 3], L = Math.hypot(nx - px, nz - pz);
      if (L >= left) { px += (nx - px) * (left / L); pz += (nz - pz) * (left / L); left = 0; }
      else { left -= L; px = nx; pz = nz; i++; }
    }
    return [px, pz, left > 0];
  };
  const [tx, tz] = walk(clamp(speed * 0.55, 4.5, 16));
  const [x1, z1] = walk(5), [x2, z2, end] = walk(clamp(speed * 1.6, 12, 45));
  const h1 = Math.atan2(x1 - x, z1 - z), h2 = Math.atan2(x2 - x1, z2 - z1);
  const d1 = Math.abs(wrapAngle(h1 - heading)), d2 = Math.abs(wrapAngle(h2 - heading));
  out.x = tx; out.z = tz; out.turn = Math.max(d1 * 0.7, d2); out.done = end && Math.hypot(P[N * 2 - 2] - x, P[N * 2 - 1] - z) < 8;
  return out;
}
export function turnSpeed(turn, top) {
  return turn > 1.3 ? 6.5 : turn > 0.8 ? 9.5 : turn > 0.45 ? 14 : turn > 0.22 ? 20 : top;
}

// what is on the roads: cars mostly; a motorbike or a bicycle now and then (more bicycles by day, none at night)
function pickModel(h) {
  const r = Math.random();
  const night = h < 7 || h > 22;
  if (r < 0.075) return 'moto';
  if (!night && r < (h > 7.5 && h < 20.5 ? 0.16 : 0.11)) return 'bici';
  return TRAFFIC_MIX[Math.floor(Math.random() * TRAFFIC_MIX.length)];
}
// how each one drives (a careful town: nobody goes over the limit; some go well under it)
function driverOf(model) {
  const r = Math.random(), bici = model === 'bici', moto = model === 'moto';
  return {
    care: bici ? 1 : 0.84 + r * 0.14,                    // of the legal limit
    bikePace: 3.8 + Math.random() * 2.2,                 // a cyclist's own pace (14–22 km/h)
    T: moto ? 1.3 + r * 0.4 : 1.45 + Math.random() * 0.6, // safe time headway (s)
    aComf: bici ? 0.9 : moto ? 1.9 : 1.2 + Math.random() * 0.6,
    bComf: bici ? 1.9 : 1.7 + Math.random() * 0.6,          // the deceleration they plan for (m/s²): early and gentle
  };
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.fleet = game.fleet;
    this.cars = [];
    this.spawnT = 0;
    this.tmp = {}; this.tmp2 = {}; this.tmp3 = {};
    this.driveEdges = this.map.edges.filter((e) => e.drive && !e.blocked && !e.dirt && e.cls !== 'track' && e.cls !== 'service' && e.len > 12 && e.w >= 5.6);
    // where people drive to: junctions on real streets (main roads count double: the way out of town, the centre)
    const ok = (e) => e.drive && !e.blocked && !e.dirt && e.cls !== 'track' && e.cls !== 'service';
    this.destNodes = [];
    for (const n of this.map.nodes) {
      const es = n.edges.map((id) => this.map.edges[id]).filter(ok);
      if (!es.length) continue;
      this.destNodes.push(n.id);
      if (es.some((e) => e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary')) this.destNodes.push(n.id);
    }
    this.stats = { yieldRight: 0, stopFull: 0 };
  }
  // the zebra crossings along each street: where along it (s from its start) and half its width
  zebrasOn(e) {
    const map = this.map;
    if (!map._zebraByEdge) {
      map._zebraByEdge = new Map();
      for (const p of map.pois) {
        if (p.kind !== 'highway:crossing') continue;
        const q = map.nearestEdge(p.x, p.z, 8, (x) => x.drive);
        if (!q) continue;
        const L = map._zebraByEdge.get(q.edge.id) || [];
        L.push({ s: q.s, x: q.x, z: q.z, hw: q.edge.w / 2, key: q.edge.id + ':' + Math.round(q.s) });
        map._zebraByEdge.set(q.edge.id, L);
      }
    }
    return map._zebraByEdge.get(e.id) || null;
  }
  // a route from where the car is heading to somewhere 250 m – 1.6 km away, by the AI's own rules
  planRoute(v) {
    const ai = v.ai, map = this.map;
    const from = endNode(ai.edge, ai.dir);
    const can = (e, cur) => aiCanDrive(map, e, cur);
    const avoid = (e) => e.blocked || e.dirt || e.cls === 'track' || e.cls === 'service';
    // nobody plans a hairpin into the narrow streets of the old town: no car gets round one without scraping the corner
    const turnCost = (ein, e, n) => {
      if (ein === e) return 0;
      const a = awayFrom(ein, n), b = awayFrom(e, n), c = a.x * b.x + a.z * b.z; // (c > 0.35: a turn of more than 110°)
      const narrow = Math.min(ein.w, e.w);
      return c > 0.35 && narrow < 6.2 ? (c > 0.6 && narrow < 5.2 ? Infinity : 80) : 0;
    };
    for (let k = 0; k < 6; k++) {
      const dn = this.destNodes[Math.floor(Math.random() * this.destNodes.length)];
      const n = map.nodes[dn];
      const d = Math.hypot(n.x - v.x, n.z - v.z);
      if (d < 250 || d > 1600) continue;
      const path = map.findPath(from, dn, { can, avoid, turnCost, startEdge: ai.edge, weight: (e) => (e.w < 5.6 ? 3.2 : e.w < 7 ? 1.7 : e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary' ? 0.75 : 1) });
      if (path && path.length) { ai.route = path; ai.ri = 0; return true; }
    }
    ai.route = null;
    return false;
  }
  // the next edge: the planned route if it fits, else pick one (and plan again)
  nextFor(v) {
    const ai = v.ai, map = this.map, e = ai.edge;
    const n = endNode(e, ai.dir);
    for (let attempt = 0; attempt < 2; attempt++) {
      const st = ai.route && ai.route[ai.ri];
      if (st && (st.dir > 0 ? st.edge.a : st.edge.b) === n && aiCanDrive(map, st.edge, n)) {
        const endDir = lanePoint(map, e, ai.dir, e.len - 0.1, {});
        const sd = lanePoint(map, st.edge, st.dir, 0.5, {});
        const turnS = wrapAngle(Math.atan2(sd.dx, sd.dz) - Math.atan2(endDir.dx, endDir.dz));
        return { edge: st.edge, dir: st.dir, turn: Math.abs(turnS), turnS, fromRoute: true };
      }
      if (!this.planRoute(v)) break;
    }
    return chooseNext(map, e, ai.dir);
  }

  targetCount() {
    const h = this.game.sky.hour;
    const base = this.game.q.traffic || 18;
    // the town's day: the morning rush out to the fields and the factories, the quiet siesta, home in the evening
    const f = h < 6 ? 0.2 : h < 7 ? 0.45 : h < 9.5 ? 1.15 : h < 14 ? 1 : h < 15.5 ? 1.1 : h < 17 ? 0.6 : h < 21 ? 1 : h < 23 ? 0.6 : 0.35;
    return Math.round(base * f);
  }

  update(dt) {
    const p = this.game.player.pos;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.4;
      if (this.cars.length < this.targetCount()) this.trySpawn(p);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v.removed || !v.ai || v.driver === 'player') { this.dropRider(v); this.cars.splice(i, 1); continue; }
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      const tries = v.ai.tries || 0;
      const chased = v.ai.suspect && d < 360; // a suspect being chased by the player's patrol is never culled
      if (!chased && (d > 300 || (tries > 4 && d > 45) || (tries >= 2 && (d > 30 || !this.inView(v.x, v.z, d))) || (v.dead && d > 120))) {
        this.dropRider(v);
        this.fleet.remove(v);
        this.cars.splice(i, 1);
        continue;
      }
      if (v.dead) { v.throttle = 0; v.brake = 0.5; continue; }
      this.drive(v, dt);
    }
  }
  // after the physics step: the riders sit on their bikes where the bikes now are
  afterPhysics(dt) {
    for (const v of this.cars) if (v.rider) this.placeRider(v, dt);
  }

  // rough "is it on screen" test (camera cone, no occlusion)
  inView(x, z, d) {
    const cam = this.game.camera, cp = cam.position;
    const dx = x - cp.x, dz = z - cp.z, l = Math.hypot(dx, dz) || 1;
    const fy = this.game.cam.forwardYaw;
    return l < 140 && (dx * Math.sin(fy) + dz * Math.cos(fy)) / l > 0.35;
  }

  trySpawn(p) {
    const fwdx = Math.sin(this.game.cam.yaw), fwdz = Math.cos(this.game.cam.yaw);
    const model = pickModel(this.game.sky.hour);
    for (let attempt = 0; attempt < 8; attempt++) {
      const e = this.driveEdges[Math.floor(Math.random() * this.driveEdges.length)];
      if (e.closed) continue;
      const s = Math.random() * e.len;
      const ow = aiOneway(e);
      const dir = ow === -1 ? -1 : ow === 1 ? 1 : Math.random() < 0.5 ? 1 : -1;
      const lp = lanePoint(this.map, e, dir, dir > 0 ? s : e.len - s, this.tmp);
      const dx = lp.x - p.x, dz = lp.z - p.z, d = Math.hypot(dx, dz);
      if (d < 80 || d > 240) continue;
      if (!this.fleet.boxFree(lp.x, lp.z, Math.atan2(lp.dx, lp.dz), MODELS.lusitano, 0.1)) continue;
      // avoid spawning in view when close
      const dot = (dx * fwdx + dz * fwdz) / d;
      if (d < 150 && dot > 0.2) {
        const t = this.map.collider.raycast(p.x, p.z, lp.x, lp.z, 2, 2);
        if (t > 0.98) continue;
      }
      if (this.fleet.nearest(lp.x, lp.z, 12)) continue;
      const v = this.fleet.spawn(model, lp.x, lp.z, Math.atan2(lp.dx, lp.dz), null, { sleeping: false });
      if (!v) return;
      const sp = Math.min(e.speed * 0.6, legalLimit(this.map, e) * 0.7);
      v.vx = lp.dx * sp; v.vz = lp.dz * sp;
      v.locked = false;
      if (model === 'taxi') v.taxiFree = Math.random() < 0.6;
      v.ai = { mode: 'traffic', edge: e, dir, s: dir > 0 ? s : e.len - s, next: null, speedMul: 1, waitT: 0, stuckT: 0, fixT: 0, ...driverOf(model) };
      this.planRoute(v);
      this.cars.push(v);
      if (v.spec.twoWheel) this.addRider(v);
      return;
    }
  }

  // ------------------------------------------------------------ riders of the bicycles and motorbikes
  addRider(v) {
    const g = this.game, bici = v.spec.shape === 'bici';
    const who = g.census && g.census.riderFor ? g.census.riderFor(bici ? 'bici' : 'moto', v.x, v.z, g.sky.hour) : null;
    let desc = who ? g.census.descOf(who) : randomDesc(Math.random);
    // on a motorbike, the helmet on (art. 118: compulsory); the same person, otherwise as they go about the town
    if (!bici) desc = { ...desc, hat: 'casco', hatColor: ['#f2f2ee', '#1d1f24', '#b8302a', '#9aa0a6', '#2f5fa8'][Math.floor(Math.random() * 5)] };
    const ch = g.chars.create(desc);
    g.scene.add(ch.object);
    ch.setBase(bici ? 'bici' : 'moto');
    ch.object.rotation.order = 'YXZ';
    v.rider = { char: ch, who };
    this.placeRider(v, 0);
  }
  placeRider(v, dt) {
    const R = v.rider, ch = R.char, info = this.fleet.renderer.info(v.model), bici = v.spec.shape === 'bici', sc = ch.scale || 1;
    const sy = info.seat.y - (bici ? 0.64 : 0.5) * sc, sz = info.seat.z, r = v.roll, pt = v.pitch, hh = v.heading;
    const y1 = sy * Math.cos(r), x1 = -sy * Math.sin(r), y2 = y1 * Math.cos(pt) - sz * Math.sin(pt), z2 = y1 * Math.sin(pt) + sz * Math.cos(pt);
    ch.object.rotation.set(pt, hh, r);
    ch.object.position.set(v.x + x1 * Math.cos(hh) + z2 * Math.sin(hh), 0.02 + y2, v.z - x1 * Math.sin(hh) + z2 * Math.cos(hh));
    ch.pedal = (ch.pedal || 0) + (Math.max(0, v.speed) / (v.spec.wr || 0.34)) * dt * 0.42;
    ch.steer = v.steer || 0;
    if (dt > 0) ch.update(dt, 0, { fidget: false });
  }
  dropRider(v) {
    const R = v && v.rider;
    if (!R) return;
    v.rider = null;
    this.game.scene.remove(R.char.object);
    R.char.dispose();
  }
  // a rider knocked off (a crash): the person goes to the pedestrians, on the ground
  throwRider(v, vx, vz) {
    const R = v.rider, peds = this.game.peds;
    if (!R || !peds) return null;
    const o = R.char.object.position;
    this.dropRider(v);
    const ped = peds.spawnAt(o.x, o.z, R.char.desc, R.who);
    peds.knock(ped, vx * 0.8, vz * 0.8, null);
    return ped;
  }

  // ------------------------------------------------------------ the driving
  drive(v, dt) {
    const ai = v.ai;
    const map = this.map;
    if (ai.hold > 0) { ai.hold -= dt; v.throttle = 0; v.brake = 1; v.steerIn = 0; v.handbrake = 0; return; }
    let e = ai.edge;
    // advance along current edge using velocity projected on lane direction
    const lp = lanePoint(map, e, ai.dir, ai.s, this.tmp);
    const along = v.vx * lp.dx + v.vz * lp.dz;
    ai.s += Math.max(0, along) * dt;
    ai.fixT -= dt;
    if (ai.fixT <= 0) {
      ai.fixT = 0.6;
      const q = polyNearest(e.pts, e.cum, v.x, v.z);
      const sTrue = ai.dir > 0 ? q.s : e.len - q.s;
      if (Math.abs(sTrue - ai.s) < 12) ai.s = sTrue;
      // lost the lane (pushed away / crashed): re-acquire the nearest drivable lane
      if (q.d > e.w / 2 + 3.5) {
        const nq = map.nearestEdge(v.x, v.z, 30, (x) => x.drive && !x.blocked && !x.dirt);
        if (nq) {
          const d = map.sample(nq.edge, nq.s, {});
          let dir = (Math.sin(v.heading) * d.dx + Math.cos(v.heading) * d.dz) >= 0 ? 1 : -1;
          const ow = aiOneway(nq.edge);
          if (ow) dir = ow;
          ai.edge = nq.edge; ai.dir = dir; ai.s = dir > 0 ? nq.s : nq.edge.len - nq.s; ai.next = null;
          e = ai.edge;
        }
      }
    }
    const remaining = e.len - ai.s;
    if (!ai.next && remaining < 40) ai.next = this.nextFor(v);
    if (remaining <= 0.5) {
      if (!ai.next) { ai.stuckT = 99; return; }
      ai.s = Math.max(0, -remaining);
      if (ai.next.fromRoute) ai.ri++;
      ai.inTurnS = ai.next.turnS || 0; // (the corner just turned: a sharp right into a narrow street, back to the lane slowly)
      ai.edge = ai.next.edge; ai.dir = ai.next.dir; ai.next = null;
      ai.stopped = null; ai.stopT = 0; ai.yieldT = 0; ai.waitStart = 0;
      e = ai.edge;
    }
    const bici = v.spec.shape === 'bici', tw = !!v.spec.twoWheel;
    // where to steer: along the lane (a bicycle near the right-hand edge; to overtake a stopped car, the other side).
    // Into a tight corner of the old town the eyes stay closer, so the car swings round it instead of cutting it
    const spd = Math.max(3, Math.abs(v.speed));
    const rem0 = e.len - ai.s, node0 = map.nodes[endNode(e, ai.dir)];
    const tight = ai.next && (ai.next.turn || 0) > 0.9 && (node0.radius < 7 || e.w < 6.5 || ai.next.edge.w < 6.5) && rem0 < node0.radius + 9;
    const look = tight ? clamp(spd * 0.42, 2.4, 6) : clamp(spd * 0.6, 3.4, 14);
    // a sharp right into (or out of) a narrow street: round it nearer the middle, clear of the corner of the houses —
    // as a driver does who knows those corners (the rear wheels cut inside the front ones)
    const wide = !tw && ((tight && (ai.next.turnS || 0) < -0.9) || (ai.s < 8 && e.w < 6.5 && (ai.inTurnS || 0) < -0.9));
    const target = this.pointAhead(v, look, this.tmp2, ai.bypassT > 0 ? -0.6 : wide ? 0.3 : 1, bici ? 0.95 : tw ? 0.25 : 0);
    // and never aimed at a wall: a house that juts out into the street pushes the line away from it
    if (!tw) { const P = this.tmp4 || (this.tmp4 = { x: 0, z: 0 }); P.x = target.x; P.z = target.z; if (map.collider.resolveCircle(P, v.hw + 0.25).hit) { target.x = P.x; target.z = P.z; } }
    // (a dead end with nobody looking: the car simply goes — there is no room to turn round in these streets)
    if (ai.next && ai.next.edge === e && rem0 < 25 && !tw && !ai.suspect) { const pl = this.game.player.pos, dp = Math.hypot(v.x - pl.x, v.z - pl.z); if (dp > 40 && !this.inView(v.x, v.z, dp)) ai.tries = 9; }
    // ---------------- how fast
    const rem = e.len - ai.s;
    const node = map.nodes[endNode(e, ai.dir)];
    const lim = legalLimit(map, e);
    let tsp;
    if (ai.suspect) tsp = e.speed * ai.speedMul;                       // (running from the police: no rules)
    else if (bici) tsp = Math.min(ai.bikePace, lim);
    else tsp = Math.min(lim * ai.care, e.w < 5.2 ? lim * 0.9 : lim);
    let stopAt = Infinity, hard = false; // the nearest point where the car must be stopped
    const stopFor = (d) => { if (d < stopAt) stopAt = d; };
    // the bend at the end of this street
    if (ai.next) {
      const turn = ai.next.turn || 0;
      const narrow = ai.next.edge.w < 6 || e.w < 6;
      const vt = (turn > 2.4 ? 2.0 : turn > 1.2 ? (narrow ? 2.6 : 3.8) : turn > 0.6 ? (narrow ? 4.2 : 5.8) : tsp) * (ai.suspect ? 1.3 : 1);
      const dist = Math.max(0, rem - node.radius);
      tsp = Math.min(tsp, Math.sqrt(vt * vt + 2 * 2.4 * dist));
      // the next street's own limit, from its start
      if (!ai.suspect) tsp = Math.min(tsp, Math.sqrt(Math.pow(legalLimit(map, ai.next.edge), 2) + 2 * 2.2 * dist));
    }
    if (!ai.suspect) {
      // STOP: a full stop at the line. Then (and at a give-way sign, and where there are no signs) the junction rules
      const rule = map.stops ? map.stops.get(e.id + ':' + node.id) : null;
      const toMouth = rem - node.radius - 1.2;
      if (node.degree >= 3 && rem < node.radius + 30) {
        if (rule === 'stop' && ai.stopped !== node.id) {
          stopFor(toMouth - 1.2);
          if (Math.abs(v.speed) < 0.3 && toMouth < 4) { ai.stopT = (ai.stopT || 0) + dt; if (ai.stopT > 1.2) { ai.stopped = node.id; ai.stopT = 0; this.stats.stopFull++; } }
        } else if (rem < node.radius + 16) {
          const y = this.mustYield(v, node, e, rule, dt);
          if (y) stopFor(toMouth - (rule === 'stop' ? 1.2 : 0));
          else if (rule === 'ceda') tsp = Math.min(tsp, Math.sqrt(4 * 4 + 2 * 2.2 * Math.max(0, toMouth)));
          // a narrow junction of the old town: one car at a time
          if (!y && this.narrowBusy(node, v, dt)) stopFor(toMouth);
        }
        // never into a junction where there is no room to come out the other side (art. 59)
        if (ai.next && rem > node.radius - 1 && this.exitBlocked(v, ai.next)) stopFor(toMouth);
        // turning into a street: whoever is crossing its mouth goes first (art. 65)
        if (ai.next && rem < node.radius + 12 && this.pedAtMouth(ai.next.edge, ai.next.dir, v)) stopFor(toMouth);
      } else if (rem > node.radius + 30) ai.waitT = 0;
      // zebra crossings ahead (on this street, and at the start of the next): whoever is on one or waiting at its
      // kerb crosses first; and nobody stops on top of one
      this.zebraAhead(v, e, ai.dir, ai.s, stopFor);
      if (ai.next && rem < 30) this.zebraAhead(v, ai.next.edge, ai.next.dir, -rem, stopFor);
    }
    // brake gently to the stop point (hard, only if it came up too close for that)
    if (stopAt < 70) {
      const d = Math.max(0, stopAt);
      const vs = Math.sqrt(2 * ai.bComf * Math.max(0, d - 0.25));
      if (v.speed > 1 && v.speed * v.speed / (2 * Math.max(0.3, d)) > 3.1) hard = true;
      tsp = Math.min(tsp, d < 0.4 ? 0 : vs);
    }
    // people in a narrow street (or right by the kerb): crawl past them
    const pn = this.pedNear(v, e.w < 7.5 ? 2.2 : 1.1, 14);
    if (pn < 14) tsp = Math.min(tsp, e.w < 7.5 ? 2.0 + pn * 0.3 : 3.5 + pn * 0.5);
    // the car, bike or person ahead: at a safe distance, matching their speed
    if (ai.ghostT > 0) ai.ghostT -= dt;
    const gap = this.gapAhead(v, ai.bypassT > 0 ? ai.bypassOf : null, ai.ghostT > 0);
    if (gap < 60) {
      const B = this._blocker, vl = B ? Math.max(0, B.vel !== undefined ? B.vel * Math.max(0, this._blockerAlong) : B.speed || 0) : 0;
      const s0 = B && B.isPed ? 2.6 : tw ? 1.6 : 2.2;
      const vSafe = ai.suspect ? Math.max(0, (gap - 3) * 0.85) : safeSpeed(gap, vl, ai.T, ai.bComf, s0);
      if (vSafe < tsp) { tsp = vSafe; if (gap < s0 + 1 && v.speed > 2) hard = true; }
      // behind a bicycle with no room to keep 1.5 m from it: follow it patiently
    }
    // stuck behind something stopped: go round it after a while (only parked or broken-down cars, never at a junction)
    if (gap < 8 && Math.abs(v.speed) < 0.6 && this._blocker && !this._blocker.isPed && (this._blocker.vel || 0) < 0.5 && stopAt > 12) {
      ai.blockT = (ai.blockT || 0) + dt;
      if (ai.blockT > (ai.suspect ? 1 : 7) && !(this._blocker.ai && this._blocker.ai.mode === 'traffic' && rem < node.radius + 20)) { ai.bypassT = 6; ai.bypassOf = this._blocker; ai.blockT = 0; }
    } else ai.blockT = 0;
    if (ai.bypassT > 0) ai.bypassT -= dt;
    if (ai.panic) { tsp *= 1.2; ai.panic -= dt; if (ai.panic <= 0) ai.panic = 0; }
    steerToward(v, target.x, target.z);
    if (ai.suspect) driveToward(v, target.x, target.z, tsp, dt); else pedals(v, tsp, hard);
    ai.tsp = tsp;
    // stuck detection: every few seconds back up with opposite lock, then try again
    if (Math.abs(v.speed) < 0.5 && tsp > 2) ai.stuckT += dt; else if (!ai.revT) ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
    if (ai.stuckT > 3.5 && !ai.revT) {
      ai.tries = (ai.tries || 0) + 1; ai.stuckT = 0;
      const bx = -Math.sin(v.heading), bz = -Math.cos(v.heading);
      const wallBehind = this.map.collider.raycast(v.x, v.z, v.x + bx * (v.hl + 2.5), v.z + bz * (v.hl + 2.5), 1, 1) < 0.98;
      if (this.gapBehind(v) > 3.5 && !wallBehind && this.rearClear(v, 5)) { ai.revT = 1.4; ai.revSteer = -Math.sign(v.steerIn || 1); }
      if (ai.tries >= 3) ai.ghostT = 4; // squeeze past (AI cars only)
    }
    // a jam that nobody is looking at: the car simply goes home
    if (Math.abs(v.speed) < 0.5) ai.jamT = (ai.jamT || 0) + dt; else ai.jamT = 0;
    if (ai.jamT > 14 && !ai.suspect) {
      const pl = this.game.player.pos, d = Math.hypot(v.x - pl.x, v.z - pl.z);
      if (d > 35 && !this.inView(v.x, v.z, d)) { ai.jamT = 0; ai.tries = 9; }
    }
    if (Math.abs(v.speed) > 4) ai.tries = 0;
    if (ai.revT > 0 && !this.rearClear(v, 2.5)) ai.revT = 0; // (someone came up behind: stop backing)
    if (ai.revT > 0) {
      ai.revT -= dt;
      v.throttle = 0; v.brake = 1; v.steerIn = ai.revSteer;
      if (ai.revT <= 0) ai.revT = 0;
    }
  }

  // nothing within r of the car's back (a car from a side street, a person): only then does it back up
  rearClear(v, r) {
    const bx = v.x - Math.sin(v.heading) * (v.hl + 1.2), bz = v.z - Math.cos(v.heading) * (v.hl + 1.2);
    for (const o of this.fleet.vehicles) if (o !== v && Math.abs(o.x - bx) < r + 3 && Math.abs(o.z - bz) < r + 3 && Math.hypot(o.x - bx, o.z - bz) < r + o.hl) return false;
    const peds = this.game.peds;
    if (peds) for (const p of peds.list) if (Math.abs(p.x - bx) < r && Math.abs(p.z - bz) < r && Math.hypot(p.x - bx, p.z - bz) < r) return false;
    const pl = this.game.player.pos;
    return Math.hypot(pl.x - bx, pl.z - bz) > r;
  }

  // ------------------------------------------------------------ the rules of the junction
  // which way something comes into this junction from, and how soon (s); null if it is not coming
  approachOf(o, node) {
    const dx = node.x - o.x, dz = node.z - o.z, d = Math.hypot(dx, dz);
    if (d > 45) return null;
    const sp = Math.max(0, o.vel !== undefined ? o.vel : Math.abs(o.speed || 0));
    if (o.ai && o.ai.edge) {
      const e = o.ai.edge, n = endNode(e, o.ai.dir);
      if (n !== node.id) return null;
      const rem = e.len - o.ai.s - node.radius;
      if (rem < -1.5 || rem > 40) return null;
      return { t: Math.max(0, rem) / Math.max(sp, 0.4), d: rem, sp, edge: e, waiting: sp < 0.4 };
    }
    // the player, the police, a friend: heading for the junction and close
    const fx = Math.sin(o.heading), fz = Math.cos(o.heading);
    if ((dx * fx + dz * fz) / (d || 1) < 0.7 || sp < 1.2) return null;
    return { t: Math.max(0, d - node.radius) / sp, d: d - node.radius, sp, edge: null, waiting: false };
  }
  // must v let someone else go first at this junction?
  mustYield(v, node, e, rule, dt) {
    const ai = v.ai, map = this.map;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
    const myT = Math.max(0, e.len - ai.s - node.radius) / Math.max(0.5, v.speed);
    const leftTurn = ai.next && (ai.next.turnS || 0) > 0.5;   // (heading angle grows to the left: +x is east, +z south)
    let yieldTo = null;
    for (const o of this.fleet.vehicles) {
      if (o === v || o.sleeping || o.dead) continue;
      if (Math.abs(o.x - node.x) > 46 || Math.abs(o.z - node.z) > 46) continue;
      // already inside the junction and moving: wait for it to clear
      const dn = Math.hypot(o.x - node.x, o.z - node.z);
      if (dn < node.radius + 0.8) {
        const rel = (o.x - v.x) * fx + (o.z - v.z) * fz;
        if (o.vel > 0.6 && rel > -1) { yieldTo = o; break; }
        continue;
      }
      const a = this.approachOf(o, node);
      if (!a || a.t > 4.5) continue;
      if (a.edge === e) continue; // (behind us on the same street)
      const oRule = a.edge && map.stops ? map.stops.get(a.edge.id + ':' + node.id) : null;
      const ox = o.x - node.x, oz = o.z - node.z, ol = Math.hypot(ox, oz) || 1;
      const side = (ox * rx + oz * rz) / ol;      // +1: from our right
      const ahead = (ox * fx + oz * fz) / ol;     // +1: from in front (oncoming)
      let give = false;
      if (o.driver === 'player' || !o.ai) give = a.t < 3; // (whoever we cannot read: let them go)
      else if (rule && !oRule) give = a.t < 4 + (rule === 'stop' ? 0.5 : 0);   // a sign for us, none for them
      else if (!rule && oRule) give = a.t < 1.2 && a.sp > 3;                // they should stop; unless they plainly are not
      else if (side > 0.45) give = a.t < 4;                                  // from the right: theirs (art. 57)
      else if (leftTurn && ahead > 0.6) give = a.t < 3.5;                    // turning left across them: theirs
      else give = a.t < 0.9 && a.sp > 3 && myT > 0.6;                        // (someone who will not stop anyway)
      // two waiting for each other (everyone came from someone's right): the one who has waited longest goes
      if (give && a.waiting && o.ai && ai.waitStart && o.ai.waitStart && ai.waitStart < o.ai.waitStart - 0.4) give = false;
      if (give) { yieldTo = o; break; }
    }
    if (yieldTo) {
      if (!ai.waitStart) ai.waitStart = this.game.time;
      ai.yieldT = (ai.yieldT || 0) + dt;
      if (yieldTo.ai && Math.abs(yieldTo.speed) < 0.3 && ai.yieldT > 7) return false; // (it is not coming: go)
      if (v.speed < 0.5 && side(yieldTo) > 0.45) this.stats.yieldRight += dt;
      return true;
    }
    ai.yieldT = 0;
    return false;
    function side(o) { return ((o.x - node.x) * rx + (o.z - node.z) * rz) / (Math.hypot(o.x - node.x, o.z - node.z) || 1); }
  }
  // the narrow junctions of the old town are taken one car at a time
  narrowBusy(node, v, dt) {
    const map = this.map, ai = v.ai;
    if (node.narrow === undefined) node.narrow = node.radius < 7 || node.edges.some((id) => map.edges[id].w < 6.5);
    if (!node.narrow) return false;
    const h = node.holder, now = this.game.time;
    const gone = !h || h.removed || !h.ai || h.dead || now - node.holdT > 7 || Math.hypot(h.x - node.x, h.z - node.z) > node.radius + 9;
    if (gone || h === v) { if (h !== v) { node.holder = v; node.holdT = now; } ai.waitT = 0; return false; }
    if (ai.waitT < 6) { ai.waitT += dt; return true; }
    ai.ghostT = 3.5; ai.waitT = 0; node.holder = v; node.holdT = now;
    return false;
  }
  // the street we are going into: is its first stretch full (a car stopped in it close to the junction)?
  exitBlocked(v, next) {
    const map = this.map, e = next.edge;
    const p = lanePoint(map, e, next.dir, 0, this.tmp3);
    for (const o of this.fleet.vehicles) {
      if (o === v || !o.ai || o.ai.edge !== e || o.ai.dir !== next.dir) continue;
      if (o.vel > 1.5) continue;
      if (o.ai.s - o.hl < v.hl * 2 + 2.5 && Math.hypot(o.x - p.x, o.z - p.z) < 14) return true;
    }
    return false;
  }
  // someone crossing (or about to step onto) the first metres of a street, where it meets the junction
  pedAtMouth(e, dir, v) {
    const peds = this.game.peds;
    if (!peds) return false;
    const map = this.map, c = lanePoint(map, e, dir, 0, this.tmp3, 0);
    const hw = e.w / 2;
    for (const q of peds.list) {
      if (q.state !== 'cross' || !q.cross || q.cross.phase !== 'go' || q.edge !== e) continue;
      if (Math.abs(q.x - c.x) > 12 || Math.abs(q.z - c.z) > 12) continue;
      const dx = q.x - c.x, dz = q.z - c.z, along = dx * c.dx + dz * c.dz, lat = Math.abs(-dx * c.dz + dz * c.dx);
      if (along > -1 && along < 9 && lat < hw + 0.5) return true;
    }
    return false;
  }
  // zebra crossings on edge e (travelled in dir) ahead of position s along it (negative: the street after this one)
  zebraAhead(v, e, dir, s, stopFor) {
    const Z = this.zebrasOn(e);
    if (!Z) return;
    const peds = this.game.peds, map = this.map;
    for (const z of Z) {
      const sz = dir > 0 ? z.s : e.len - z.s;
      const dAhead = sz - s - v.hl;           // from the front bumper to the stripes' middle
      if (dAhead < -1.5 || dAhead > 45) continue;
      let busy = false;
      if (peds) {
        const t = map.sample(e, z.s, this.tmp3);
        for (const q of peds.list) {
          if (q.state === 'dead' || q.state === 'lie' || q.state === 'fly' || q.state === 'sit' || q.inCar) continue;
          const dx = q.x - z.x, dz = q.z - z.z;
          if (Math.abs(dx) > 10 || Math.abs(dz) > 10) continue;
          const along = Math.abs(dx * t.dx + dz * t.dz), lat = Math.abs(-dx * t.dz + dz * t.dx);
          if (along < 2.3 && lat < z.hw + 0.3) { busy = true; break; }                     // on the stripes
          const waits = (q.state === 'cross' && q.cross && q.cross.zebra === z.key && q.cross.phase !== 'go') || (q.state === 'kerb' && q.kerb && q.kerb.zebra === z.key);
          if (waits && Math.hypot(dx, dz) < z.hw + 3) { busy = true; break; } // waiting at the kerb
        }
        const pl = this.game.player;
        if (!busy && !pl.vehicle && pl.mode === 'foot') {
          const dx = pl.pos.x - z.x, dz = pl.pos.z - z.z;
          if (Math.abs(dx * t.dx + dz * t.dz) < 2.3 && Math.abs(-dx * t.dz + dz * t.dx) < z.hw + 0.3) busy = true;
        }
      }
      if (busy) { stopFor(dAhead - 2.4); continue; }
      // no stopping on the stripes: if the queue ahead ends just past the crossing, wait before it
      if (dAhead > 0 && dAhead < 20 && this._queueEndsNear(v, e, dir, sz)) stopFor(dAhead - 2.4);
    }
  }
  _queueEndsNear(v, e, dir, sz) {
    for (const o of this.fleet.vehicles) {
      if (o === v || !o.ai || o.ai.edge !== e || o.ai.dir !== dir || o.vel > 1.2) continue;
      const rear = o.ai.s - o.hl;
      if (rear > sz - 1 && rear < sz + v.hl * 2 + 2) return true;
    }
    return false;
  }

  pointAhead(v, dist, out, offMul = 1, extra = 0) {
    const ai = v.ai;
    const e = ai.edge;
    let s = ai.s + dist;
    if (s <= e.len) return lanePoint(this.map, e, ai.dir, s, out, offMul, extra);
    if (!ai.next) ai.next = this.nextFor(v);
    if (!ai.next) return lanePoint(this.map, e, ai.dir, e.len, out, offMul, extra);
    s -= e.len;
    return lanePoint(this.map, ai.next.edge, ai.next.dir, Math.min(s, ai.next.edge.len), out, offMul, extra);
  }

  // free space behind the car (another car, the player): 99 if nothing within 12 m
  gapBehind(v) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let best = 99;
    for (const o of this.fleet.vehicles) {
      if (o === v || Math.abs(o.x - v.x) > 14 || Math.abs(o.z - v.z) > 14) continue;
      const dx = o.x - v.x, dz = o.z - v.z, lb = -(dx * fx + dz * fz), lr = Math.abs(-dx * fz + dz * fx);
      if (lb < 0 || lb > 12 || lr > v.hw + o.hw + 0.3) continue;
      best = Math.min(best, lb - v.hl - o.hl);
    }
    return best;
  }
  // distance ahead to the nearest pedestrian within `side` metres of the car's path (99 if none)
  pedNear(v, side, range) {
    const peds = this.game.peds;
    if (!peds) return 99;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let best = 99;
    for (const p of peds.list) {
      if (p.state === 'dead' || p.inCar) continue;
      const dx = p.x - v.x, dz = p.z - v.z;
      if (Math.abs(dx) > range + 3 || Math.abs(dz) > range + 3) continue;
      const lf = dx * fx + dz * fz;
      if (lf < 0 || lf > range) continue;
      const lr = Math.abs(-dx * fz + dz * fx);
      if (lr > v.hw + side) continue;
      best = Math.min(best, lf - v.hl);
    }
    const pl = this.game.player;
    if (!pl.vehicle) {
      const dx = pl.pos.x - v.x, dz = pl.pos.z - v.z, lf = dx * fx + dz * fz, lr = Math.abs(-dx * fz + dz * fx);
      if (lf > 0 && lf < range && lr < v.hw + side) best = Math.min(best, lf - v.hl);
    }
    return best;
  }

  // the gap to whatever is ahead in our path (99 if nothing within 40 m). _blocker: what it is; _blockerAlong: how much
  // of its speed goes our way. People walking into our path are seen where they will be in a second
  gapAhead(v, ignore = null, ghost = false) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const rx = -fz, rz = fx;
    let best = 99;
    this._blocker = null; this._blockerAlong = 1;
    const check = (x, z, hl, w, who, along = 1) => {
      const dx = x - v.x, dz = z - v.z;
      const lf = dx * fx + dz * fz;
      if (lf < 0 || lf > 40) return;
      const lr = dx * rx + dz * rz;
      if (Math.abs(lr) > w + v.hw + 0.25) return;
      const g = lf - v.hl - hl;
      if (g < best) { best = g; this._blocker = who; this._blockerAlong = along; }
    };
    const e = v.ai && v.ai.edge;
    for (const o of this.fleet.vehicles) {
      if (o === v || o === ignore) continue;
      if (ghost && o.ai) continue;
      if (Math.abs(o.x - v.x) > 40 || Math.abs(o.z - v.z) > 40) continue;
      // a car parked in its bay along this street is not in the way, however the street bends
      if (e && !o.ai && !o.driver && Math.abs(o.vel || 0) < 0.3 && this.offLane(v, e, o)) continue;
      const of = Math.sin(o.heading) * fx + Math.cos(o.heading) * fz;
      // a bicycle ahead: the lateral room it is owed (art. 85: 1.5 m)
      check(o.x, o.z, o.hl * 0.8, o.hw + (o.spec.shape === 'bici' && !v.spec.twoWheel ? 1.2 : 0), o, of);
    }
    const pl = this.game.player;
    if (!pl.vehicle) check(pl.pos.x, pl.pos.z, 0.3, 0.4, { isPed: true, vel: 0 });
    const peds = this.game.peds;
    if (peds) for (const ped of peds.list) {
      if (ped.state === 'lie' || ped.inCar) continue;
      if (Math.abs(ped.x - v.x) > 25 || Math.abs(ped.z - v.z) > 25) continue;
      const P = ped._asObstacle || (ped._asObstacle = { isPed: true, vel: 0 });
      check(ped.x, ped.z, 0.3, 0.35, P);
      // walking across: where they will be in a second
      if (ped.speed > 0.4 && (ped.state === 'cross' || ped.state === 'walk' || ped.state === 'flee')) {
        const px = ped.x + Math.sin(ped.heading) * ped.speed * 1.1, pz = ped.z + Math.cos(ped.heading) * ped.speed * 1.1;
        check(px, pz, 0.3, 0.35, P);
      }
    }
    return best;
  }

  // is vehicle o (on street e) clear of the lane v drives in?
  offLane(v, e, o) {
    const q = polyNearest(e.pts, e.cum, o.x, o.z);
    if (q.d > e.w / 2 + 2) return false; // (not along this street: round the corner, judge by eye)
    const t = polySample(e.pts, e.cum, q.s, this.tmp5 || (this.tmp5 = {}));
    const lat = (o.x - t.x) * -t.dz + (o.z - t.z) * t.dx, lg = laneGeom(e);
    const laneLat = lg.shift + v.ai.dir * lg.off;
    return Math.abs(lat - laneLat) > o.hw + v.hw + 0.2;
  }
  // player stole v: give the driver back to the pedestrian system
  release(v) {
    const i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
    v.ai = null;
    this.dropRider(v);
  }
}
