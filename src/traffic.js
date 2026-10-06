// AI traffic: cars follow the real street graph of Guareña (respecting one-way streets), keep their lane,
// slow for curves and junctions, stop at STOP signs and give way, crawl past people in narrow streets, follow the car
// ahead and react to the player. Every car is going somewhere: it plans a route (A*) to a destination across town
// instead of turning at random. Also shared route helpers.
import { TRAFFIC_MIX, MODELS } from './vehicles.js';
import { polySample, polyNearest, clamp, wrapAngle } from './util.js';

// lane geometry: parked cars take 2.2 m on their side, lanes share what is left
function laneGeom(e) {
  if (e._lg) return e._lg;
  const ps = e.parkSide || 0;
  const avail = e.w - (ps === 2 ? 4.4 : ps ? 2.2 : 0);
  const shift = ps === 1 ? -1.1 : ps === -1 ? 1.1 : 0; // along the edge's right vector
  const off = aiOneway(e) ? 0 : Math.max(0.6, Math.min(avail / 4 + 0.12, avail / 2 - 1.0));
  return (e._lg = { shift, off });
}
// narrow two-way streets behave as one-way for AI traffic (a -> b) to avoid head-on deadlocks
export function aiOneway(e) { return e.oneway || (e.w < 4.7 ? 1 : 0); }
export function aiCanDrive(map, e, from) {
  if (!e.drive || e.blocked) return false;
  const ow = aiOneway(e);
  if (!ow) return true;
  const fwd = e.a === from;
  return ow === 1 ? fwd : !fwd;
}

// point on the lane of edge e travelling in dir at distance s from the start (in travel direction)
export function lanePoint(map, e, dir, s, out = {}, offMul = 1) {
  const sp = dir > 0 ? s : e.len - s;
  polySample(e.pts, e.cum, clamp(sp, 0, e.len), out);
  const lg = laneGeom(e);
  // lateral position measured along the edge's own right vector (-dz, dx)
  const lat = lg.shift + dir * lg.off * offMul;
  out.x += -out.dz * lat; out.z += out.dx * lat;
  out.dx *= dir; out.dz *= dir;
  return out;
}

export function endNode(e, dir) { return dir > 0 ? e.b : e.a; }

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
    const turn = Math.abs(wrapAngle(Math.atan2(st.dx, st.dz) - Math.atan2(endDir.dx, endDir.dz)));
    let w = turn < 0.5 ? 3 : turn < 1.9 ? 1.2 : 0.4;
    if (ne.cls === 'service') w *= 0.25;
    if (ne.cls === 'primary' || ne.cls === 'tertiary') w *= 1.4;
    cands.push({ edge: ne, dir: nd, w, turn });
  }
  if (!cands.length) {
    // dead end: U-turn if allowed
    if (!aiOneway(e)) return { edge: e, dir: -dir, w: 1, turn: Math.PI };
    return null;
  }
  let tot = cands.reduce((a, c) => a + c.w, 0), r = rnd() * tot;
  for (const c of cands) { r -= c.w; if (r <= 0) return c; }
  return cands[cands.length - 1];
}

// Steering / speed controller shared by traffic, police and racers
export function driveToward(v, tx, tz, targetSpeed, dt) {
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
  const err = targetSpeed - v.speed;
  if (err > 0) { v.throttle = clamp(err * 0.45 + 0.1, 0, 1); v.brake = 0; }
  else { v.throttle = 0; v.brake = clamp(-err * 0.3, 0, 1); }
  if (targetSpeed <= 0.05 && Math.abs(v.speed) < 0.4) { v.throttle = 0; v.brake = 1; }
  v.handbrake = 0;
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

export class Traffic {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.fleet = game.fleet;
    this.cars = [];
    this.spawnT = 0;
    this.tmp = {}; this.tmp2 = {};
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
  }
  // a route from where the car is heading to somewhere 250 m – 1.6 km away, by the AI's own rules
  planRoute(v) {
    const ai = v.ai, map = this.map;
    const from = endNode(ai.edge, ai.dir);
    const can = (e, cur) => aiCanDrive(map, e, cur);
    const avoid = (e) => e.blocked || e.dirt || e.cls === 'track' || e.cls === 'service';
    for (let k = 0; k < 6; k++) {
      const dn = this.destNodes[Math.floor(Math.random() * this.destNodes.length)];
      const n = map.nodes[dn];
      const d = Math.hypot(n.x - v.x, n.z - v.z);
      if (d < 250 || d > 1600) continue;
      const path = map.findPath(from, dn, { can, avoid, weight: (e) => (e.w < 5.6 ? 3.2 : e.w < 7 ? 1.7 : e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary' ? 0.75 : 1) });
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
        const turn = Math.abs(wrapAngle(Math.atan2(sd.dx, sd.dz) - Math.atan2(endDir.dx, endDir.dz)));
        return { edge: st.edge, dir: st.dir, turn, fromRoute: true };
      }
      if (!this.planRoute(v)) break;
    }
    return chooseNext(map, e, ai.dir);
  }

  targetCount() {
    const h = this.game.sky.hour;
    const base = this.game.q.traffic || 18;
    const f = h < 6 ? 0.25 : h < 8 ? 0.5 : h < 22 ? 1 : 0.55;
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
      if (v.removed || !v.ai || v.driver === 'player') { this.cars.splice(i, 1); continue; }
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      const tries = v.ai.tries || 0;
      const chased = v.ai.suspect && d < 360; // a suspect being chased by the player's patrol is never culled
      if (!chased && (d > 300 || (tries > 4 && d > 45) || (tries >= 2 && (d > 30 || !this.inView(v.x, v.z, d))) || (v.dead && d > 120))) {
        this.fleet.remove(v);
        this.cars.splice(i, 1);
        continue;
      }
      if (v.dead) { v.throttle = 0; v.brake = 0.5; continue; }
      this.drive(v, dt);
    }
  }

  // rough "is it on screen" test (camera cone, no occlusion)
  inView(x, z, d) {
    const cam = this.game.camera, cp = cam.position;
    const dx = x - cp.x, dz = z - cp.z, l = Math.hypot(dx, dz) || 1;
    const fy = this.game.cam.forwardYaw;
    return l < 140 && (dx * Math.sin(fy) + dz * Math.cos(fy)) / l > 0.35;
  }

  trySpawn(p) {
    const cam = this.game.camera;
    const fwdx = Math.sin(this.game.cam.yaw), fwdz = Math.cos(this.game.cam.yaw);
    for (let attempt = 0; attempt < 8; attempt++) {
      const e = this.driveEdges[Math.floor(Math.random() * this.driveEdges.length)];
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
      const model = TRAFFIC_MIX[Math.floor(Math.random() * TRAFFIC_MIX.length)];
      const v = this.fleet.spawn(model, lp.x, lp.z, Math.atan2(lp.dx, lp.dz), null, { sleeping: false });
      if (!v) return;
      const sp = e.speed * 0.6;
      v.vx = lp.dx * sp; v.vz = lp.dz * sp;
      v.locked = false;
      if (model === 'taxi') v.taxiFree = Math.random() < 0.6;
      v.ai = { mode: 'traffic', edge: e, dir, s: dir > 0 ? s : e.len - s, next: null, speedMul: 0.76 + Math.random() * 0.18, waitT: 0, stuckT: 0, fixT: 0 }; // (calm drivers: nobody tears through the town)
      this.planRoute(v);
      this.cars.push(v);
      return;
    }
  }

  // follow lanes along the graph
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
    if (!ai.next && remaining < 30) ai.next = this.nextFor(v);
    if (remaining <= 0.5) {
      if (!ai.next) { ai.stuckT = 99; return; }
      ai.s = Math.max(0, -remaining);
      if (ai.next.fromRoute) ai.ri++;
      ai.edge = ai.next.edge; ai.dir = ai.next.dir; ai.next = null;
      ai.stopped = null; ai.stopT = 0; ai.yieldT = 0;
      e = ai.edge;
    }
    // lookahead target
    const spd = Math.max(3, Math.abs(v.speed));
    const look = clamp(spd * 0.6, 3.4, 14);
    const target = this.pointAhead(v, look, this.tmp2, ai.bypassT > 0 ? -0.6 : 1);
    // speed planning
    let tsp = e.speed * ai.speedMul;
    const rem = e.len - ai.s;
    const node = map.nodes[endNode(e, ai.dir)];
    if (ai.next) {
      const turn = ai.next.turn || 0;
      const narrow = ai.next.edge.w < 6 || e.w < 6;
      const vt = (turn > 2.4 ? 2.2 : turn > 1.2 ? (narrow ? 3.2 : 4.2) : turn > 0.6 ? (narrow ? 5 : 6.5) : tsp) * (ai.suspect ? 1.3 : 1);
      const dist = Math.max(0, rem - node.radius);
      tsp = Math.min(tsp, Math.sqrt(vt * vt + 2 * 3.2 * dist));
    }
    // STOP: a full stop at the line, then go when the junction is clear. Give way: slow, and wait if it is busy
    const rule = !ai.suspect && map.stops ? map.stops.get(e.id + ':' + node.id) : null;
    if (rule && rem < node.radius + 10) {
      if (rule === 'stop' && ai.stopped !== node.id) {
        const sd = Math.max(0, rem - node.radius - 2.4);
        tsp = Math.min(tsp, sd < 0.6 ? 0 : Math.sqrt(2 * 2.6 * sd));
        if (Math.abs(v.speed) < 0.5 && sd < 3) { ai.stopT = (ai.stopT || 0) + dt; if (ai.stopT > 1.1) { ai.stopped = node.id; ai.stopT = 0; } }
      } else if (rule === 'ceda') tsp = Math.min(tsp, 5.5);
      if ((rule === 'ceda' || ai.stopped === node.id) && this.junctionBusy(node, v)) { ai.yieldT = (ai.yieldT || 0) + dt; if (ai.yieldT < 7) tsp = 0; }
    }
    // people in a narrow street (or right by the kerb): crawl past them
    const pn = this.pedNear(v, e.w < 7.5 ? 2.2 : 1.1, 14);
    if (pn < 14) tsp = Math.min(tsp, e.w < 7.5 ? 2.2 + pn * 0.35 : 4 + pn * 0.6);
    // junction yielding; narrow junctions of the old town are taken one car at a time
    if (ai.ghostT > 0) ai.ghostT -= dt;
    if (!ai.suspect && node.degree >= 3 && rem < node.radius + 8) {
      if (node.narrow === undefined) node.narrow = node.radius < 7 || node.edges.some((id) => map.edges[id].w < 6.5);
      if (node.narrow) {
        const h = node.holder, now = this.game.time;
        const gone = !h || h.removed || !h.ai || h.dead || now - node.holdT > 7 || Math.hypot(h.x - node.x, h.z - node.z) > node.radius + 9;
        if (gone || h === v) { if (h !== v) { node.holder = v; node.holdT = now; } ai.waitT = 0; }
        else if (ai.waitT < 6) { tsp = 0; ai.waitT += dt; }
        else { ai.ghostT = 3.5; ai.waitT = 0; node.holder = v; node.holdT = now; }
      } else if (rem > node.radius - 1) {
        const busy = this.junctionBusy(node, v);
        if (busy && ai.waitT < 4.5) { tsp = 0; ai.waitT += dt; }
        else if (!busy) ai.waitT = 0;
      }
    } else if (rem > node.radius + 8) ai.waitT = 0;
    // obstacles ahead (vehicles, player, pedestrians); go around stopped obstacles after a while
    const gap = this.gapAhead(v, ai.bypassT > 0 ? ai.bypassOf : null, ai.ghostT > 0);
    if (gap < 40) tsp = Math.min(tsp, Math.max(0, (gap - 3) * 0.85));
    if (gap < 8 && Math.abs(v.speed) < 0.6 && this._blocker && this._blocker.vel < 0.5) {
      ai.blockT = (ai.blockT || 0) + dt;
      if (ai.blockT > (ai.suspect ? 1 : 6)) { ai.bypassT = 6; ai.bypassOf = this._blocker; ai.blockT = 0; }
    } else ai.blockT = 0;
    if (ai.bypassT > 0) ai.bypassT -= dt;
    if (ai.panic) { tsp *= 1.2; ai.panic -= dt; if (ai.panic <= 0) ai.panic = 0; }
    driveToward(v, target.x, target.z, tsp, dt);
    // stuck detection: every few seconds back up with opposite lock, then try again
    if (Math.abs(v.speed) < 0.5 && tsp > 2) ai.stuckT += dt; else if (!ai.revT) ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
    if (ai.stuckT > 3.5 && !ai.revT) {
      ai.tries = (ai.tries || 0) + 1; ai.stuckT = 0;
      if (this.gapBehind(v) > 3.5) { ai.revT = 1.4; ai.revSteer = -Math.sign(v.steerIn || 1); }
      if (ai.tries >= 3) ai.ghostT = 4; // squeeze past (AI cars only)
    }
    // a jam that nobody is looking at: the car simply goes home
    if (Math.abs(v.speed) < 0.5) ai.jamT = (ai.jamT || 0) + dt; else ai.jamT = 0;
    if (ai.jamT > 9 && !ai.suspect) {
      const pl = this.game.player.pos, d = Math.hypot(v.x - pl.x, v.z - pl.z);
      if (d > 35 && !this.inView(v.x, v.z, d)) { ai.jamT = 0; ai.tries = 9; }
    }
    if (Math.abs(v.speed) > 4) ai.tries = 0;
    if (ai.revT > 0) {
      ai.revT -= dt;
      v.throttle = 0; v.brake = 1; v.steerIn = ai.revSteer;
      if (ai.revT <= 0) ai.revT = 0;
    }
  }

  pointAhead(v, dist, out, offMul = 1) {
    const ai = v.ai;
    const e = ai.edge;
    let s = ai.s + dist;
    if (s <= e.len) return lanePoint(this.map, e, ai.dir, s, out, offMul);
    if (!ai.next) ai.next = this.nextFor(v);
    if (!ai.next) return lanePoint(this.map, e, ai.dir, e.len, out, offMul);
    s -= e.len;
    return lanePoint(this.map, ai.next.edge, ai.next.dir, Math.min(s, ai.next.edge.len), out, offMul);
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

  junctionBusy(node, me) {
    const R = node.radius + 2.5;
    for (const o of this.fleet.vehicles) {
      if (o === me || o.sleeping) continue;
      const d = Math.hypot(o.x - node.x, o.z - node.z);
      if (d < R && o.vel > 0.5) {
        // only yield if the other is not just behind us
        const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
        const rel = (o.x - me.x) * fx + (o.z - me.z) * fz;
        if (rel > -1) return true;
      }
    }
    return false;
  }

  gapAhead(v, ignore = null, ghost = false) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const rx = -fz, rz = fx;
    let best = 99;
    this._blocker = null;
    const check = (x, z, hl, w, who) => {
      const dx = x - v.x, dz = z - v.z;
      const lf = dx * fx + dz * fz;
      if (lf < 0 || lf > 40) return;
      const lr = dx * rx + dz * rz;
      if (Math.abs(lr) > w + v.hw + 0.25) return;
      const g = lf - v.hl - hl;
      if (g < best) { best = g; this._blocker = who; }
    };
    for (const o of this.fleet.vehicles) {
      if (o === v || o === ignore) continue;
      if (ghost && o.ai) continue;
      if (Math.abs(o.x - v.x) > 40 || Math.abs(o.z - v.z) > 40) continue;
      check(o.x, o.z, o.hl * 0.8, o.hw, o);
    }
    const pl = this.game.player;
    if (!pl.vehicle) check(pl.pos.x, pl.pos.z, 0.3, 0.4);
    const peds = this.game.peds;
    if (peds) for (const ped of peds.list) {
      if (ped.state === 'lie' || ped.inCar) continue;
      if (Math.abs(ped.x - v.x) > 25 || Math.abs(ped.z - v.z) > 25) continue;
      check(ped.x, ped.z, 0.3, 0.35);
    }
    return best;
  }

  // player stole v: give the driver back to the pedestrian system
  release(v) {
    const i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
    v.ai = null;
  }
}
