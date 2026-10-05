// Fleet: owns every vehicle in the world (parked, traffic, police, player), streams parked cars around the player,
// runs physics sub-steps, static & vehicle-vehicle collisions, damage, lights and rendering updates.
import * as THREE from 'three';
import { Vehicle, VehicleRenderer, MODELS, PARKED_MIX, makeTmp, obbContact, resolvePair } from './vehicles.js';
import { polySample, hash1, hash2, clamp, mulberry32 } from './util.js';
import { parkingBays } from './ground.js';
import { PERK } from './perks.js';
import { STYLE } from './style.js';
import { SM } from './plastilina.js';

export class Fleet {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.renderer = new VehicleRenderer(game.scene, game.q.carCapacity || 120);
    this.vehicles = [];     // active (in renderer)
    this.spots = [];        // parked spots (data)
    this.tmp = makeTmp();
    this.box = {}; this.box2 = {}; this.contact = {}; this.pc = {};
    this.surfT = 0;
    this.buildParking();
  }

  // ------------------------------------------------------------ parked cars along streets
  buildParking() {
    const map = this.map;
    const rnd = mulberry32(2024);
    const tmp = {};
    for (const e of map.edges) {
      if (!e.drive || e.blocked || e.dirt || e.cls === 'service' || e.cls === 'track' || e.cls === 'living_street') continue;
      if (!map.inTown(e.pts[0], e.pts[1])) continue;
      const w = e.w;
      if (w < 7.0) continue;
      const sides = w >= 10.2 ? [1, -1] : [e.oneway ? -1 : (hash1(e.id) < 0.5 ? 1 : -1)];
      e.parkSide = sides.length === 2 ? 2 : sides[0];
      const na = map.nodes[e.a], nb = map.nodes[e.b];
      const s0 = na.degree > 1 ? na.radius + 9 : 4, s1 = e.len - (nb.degree > 1 ? nb.radius + 9 : 4);
      for (const side of sides) {
        let s = s0 + rnd() * 3;
        while (s < s1 - 4) {
          if (rnd() < 0.72) {
            polySample(e.pts, e.cum, s, tmp);
            const off = w / 2 - 1.05;
            // right side of the edge direction: right = (-dz, dx)
            const x = tmp.x + -tmp.dz * off * side, z = tmp.z + tmp.dx * off * side;
            const heading = Math.atan2(tmp.dx, tmp.dz) + (side > 0 ? 0 : Math.PI);
            const model = PARKED_MIX[Math.floor(rnd() * PARKED_MIX.length)];
            const spec = MODELS[model];
            if (!map.buildingAt(x, z) && !this.nearCrossing(x, z) && !this.nearBins(x, z) && this.boxFree(x, z, heading, spec)) {
              this.spots.push({ x, z, heading, model, color: spec.colors[Math.floor(rnd() * spec.colors.length)], vehicle: null, taken: false, edge: e.id });
            }
          }
          s += 5.6 + rnd() * 1.2;
        }
      }
    }
    // motorbikes at the kerb and bicycles against the walls (placed with the street life): rideable
    for (const t of (this.game.world && this.game.world.twoWheelSpots) || []) this.spots.push({ x: t.x, z: t.z, heading: t.heading, model: t.model, color: typeof t.color === 'number' ? '#' + t.color.toString(16).padStart(6, '0') : t.color, vehicle: null, taken: false, twoWheel: true });
    // vehicles placed by the landmarks (the new tractors on Agrícola Corbacho's forecourt)
    for (const t of (this.game.world && this.game.world.landmarks && this.game.world.landmarks.vehicleSpots) || []) if (MODELS[t.model]) this.spots.push({ x: t.x, z: t.z, heading: t.heading, model: t.model, color: t.color, vehicle: null, taken: false, display: true });
    // parking lots: cars in their painted bays, nose in (about three in four taken)
    for (const b of parkingBays(map)) {
      if (rnd() > 0.74) continue;
      const model = PARKED_MIX[Math.floor(rnd() * PARKED_MIX.length)];
      const spec = MODELS[model];
      if (spec.L > 4.9 || spec.W > 2.1) continue;
      this.spots.push({ x: b.x, z: b.z, heading: b.heading + (!b.parallel && rnd() < 0.2 ? Math.PI : 0), model, color: spec.colors[Math.floor(rnd() * spec.colors.length)], vehicle: null, taken: false, bay: true });
    }
  }
  // is an oriented car box free of walls/props?
  boxFree(x, z, heading, spec, margin = 0.05) {
    const b = { x, z, ux: Math.sin(heading), uz: Math.cos(heading), hl: spec.L / 2 + margin, hw: spec.W / 2 + margin };
    const c = this.map.collider.boxContact(b, this.contact || (this.contact = {}));
    return !c.hit;
  }
  // find a drivable, free placement near (x,z): tries lane positions along nearby roads
  freeSpotNear(x, z, model) {
    const spec = MODELS[model];
    const map = this.map;
    const q = map.nearestEdge(x, z, 80, (e) => e.drive && !e.blocked && !e.dirt) || map.nearestEdge(x, z, 200, (e) => e.drive && !e.blocked);
    if (!q) return { x, z, heading: 0 };
    const e = q.edge;
    const tmp = {};
    for (let k = 0; k < 40; k++) {
      const ds = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5;
      const s = q.s + ds;
      if (s < 1 || s > e.len - 1) continue;
      map.sample(e, s, tmp);
      const heading = Math.atan2(tmp.dx, tmp.dz);
      for (const off of [e.w / 2 - spec.W / 2 - 0.25, 0, -(e.w / 2 - spec.W / 2 - 0.25)]) {
        const px = tmp.x - tmp.dz * off, pz = tmp.z + tmp.dx * off;
        if (this.boxFree(px, pz, heading, spec, 0.15) && !this.nearest(px, pz, spec.L)) return { x: px, z: pz, heading };
      }
    }
    map.sample(e, q.s, tmp);
    return { x: tmp.x, z: tmp.z, heading: Math.atan2(tmp.dx, tmp.dz) };
  }
  // the rubbish containers take their own space in the parking lane
  nearBins(x, z) {
    if (!this._bins) this._bins = ((this.game.world && this.game.world.breakables) || []).filter((b) => b.kind === 'cont');
    return this._bins.some((b) => Math.abs(b.x - x) < 4 && Math.abs(b.z - z) < 4 && Math.hypot(b.x - x, b.z - z) < 4);
  }
  nearCrossing(x, z) {
    if (!this._cross) this._cross = this.map.pois.filter((p) => p.kind === 'highway:crossing');
    return this._cross.some((p) => Math.abs(p.x - x) < 6 && Math.abs(p.z - z) < 6 && Math.hypot(p.x - x, p.z - z) < 6);
  }

  // ------------------------------------------------------------ lifecycle
  spawn(model, x, z, heading, color, opts = {}) {
    const v = new Vehicle(model, x, z, heading, color);
    if (!this.renderer.alloc(v)) return null;
    Object.assign(v, opts);
    v.sleeping = opts.sleeping ?? false;
    this.vehicles.push(v);
    v.writeMatrix(this.renderer, this.tmp);
    return v;
  }
  remove(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
    this.renderer.free(v);
    if (v.spot) { v.spot.vehicle = null; if (v.moved) v.spot.taken = true; }
    v.removed = true;
  }

  streamParked(px, pz) {
    const R_IN = this.game.q.parkRadius || 200, R_OUT = R_IN + 50;
    for (const s of this.spots) {
      if (s.taken) continue;
      const d = Math.abs(s.x - px) + Math.abs(s.z - pz);
      if (!s.vehicle && d < R_IN) {
        const v = this.spawn(s.model, s.x, s.z, s.heading, s.color, { sleeping: true });
        if (v) { v.spot = s; v.parked = true; s.vehicle = v; }
      } else if (s.vehicle && d > R_OUT && s.vehicle.driver === null && !s.vehicle.keep) {
        const v = s.vehicle;
        if (Math.hypot(v.x - s.x, v.z - s.z) > 1.5 || v.dead) { s.taken = true; v.spot = null; } // moved: leave where it is
        else this.remove(v);
      }
    }
    // free abandoned moved vehicles far away
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.driver || v.keep || v.spot || v.ai) continue;
      if (Math.abs(v.x - px) + Math.abs(v.z - pz) > R_OUT + 60) this.remove(v);
    }
  }

  surfaceAt(x, z) {
    const b = this.map.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) { // (out past the map: the road to Mérida, or the fields)
      for (const r of (this.game.world && this.game.world.landmarks && this.game.world.landmarks.extraRoads) || []) if (r.on(x, z)) return { dirt: false, edge: null, onRoad: true };
    }
    const q = this.map.nearestEdge(x, z, 20);
    if (q && q.d < q.edge.w / 2 + 0.5) return { dirt: q.edge.dirt, edge: q.edge, onRoad: true };
    return { dirt: !this.map.inTown(x, z), edge: q ? q.edge : null, onRoad: false };
  }

  // ------------------------------------------------------------ simulation
  update(dt, night) {
    const col = this.map.collider;
    const vs = this.vehicles;
    const sub = dt > 1 / 45 ? 3 : 2;
    const h = dt / sub;
    this.surfT -= dt;
    const refreshSurf = this.surfT <= 0;
    if (refreshSurf) this.surfT = 0.3;
    for (const v of vs) {
      if (v.sleeping) continue;
      if (refreshSurf || !v.surf) v.surf = this.surfaceAt(v.x, v.z);
    }
    for (let k = 0; k < sub; k++) {
      for (const v of vs) {
        if (v.sleeping || v.remote) continue; // a friend's car (multiplayer) is placed by the network
        v.step(h, v.surf || { dirt: false });
        // static collisions
        const c = col.boxContact(v.box(this.box), this.contact);
        if (c.hit) {
          if (c.circle >= 0 && this.game.props && this.game.props.hitCircle(c.circle, v)) continue;
          const imp = v.resolveStatic(c);
          this.onImpact(v, imp, c.px, c.pz, null);
        }
      }
      // vehicle-vehicle
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i];
        for (let j = i + 1; j < vs.length; j++) {
          const b = vs[j];
          if (a.sleeping && b.sleeping) continue;
          const dx = a.x - b.x, dz = a.z - b.z;
          const rr = a.hl + b.hl;
          if (dx * dx + dz * dz > rr * rr) continue;
          const c = obbContact(a.box(this.box), b.box(this.box2), this.pc);
          if (!c) continue;
          // AI cars squeezing out of a jam pass through other AI cars; stay ghosted until clear
          if (a.ai && b.ai && (a.ai.ghostT > 0 || b.ai.ghostT > 0)) {
            if (a.ai.ghostT > 0) a.ai.ghostT = Math.max(a.ai.ghostT, 0.4);
            if (b.ai.ghostT > 0) b.ai.ghostT = Math.max(b.ai.ghostT, 0.4);
            continue;
          }
          if (c.depth > 0.3) c.depth = 0.3; // resolve deep overlaps over several sub-steps (never punch through walls)
          if (a.sleeping) a.sleeping = false;
          if (b.sleeping) b.sleeping = false;
          const imp = resolvePair(a, b, c);
          this.onImpact(a, imp, c.px, c.pz, b);
          this.onImpact(b, imp, c.px, c.pz, a);
        }
      }
    }
    // settle sleeping cars that stopped
    for (const v of vs) {
      const free = !v.driver && !v.ai && !v.ctrl;
      if (!v.sleeping && free && v.vel < 0.05 && Math.abs(v.w) < 0.02) {
        v.idleT = (v.idleT || 0) + dt;
        if (v.idleT > 1.5) { v.sleeping = true; v.vx = v.vz = v.w = 0; }
      } else v.idleT = 0;
      if (v.coastT > 0) v.coastT -= dt; // someone jumped out while it was moving: it rolls on for a moment
      v.parkBrake = free && !(v.coastT > 0);
      if (!v.sleeping && free) { v.throttle = 0; v.brake = 0; v.steerIn = 0; }
      if (v.ctrl && v.sleeping) v.sleeping = false;
      if (v.spot && (Math.abs(v.x - v.spot.x) > 1.2 || Math.abs(v.z - v.spot.z) > 1.2)) v.moved = true;
    }
    // damage over time / fire / explosion
    for (const v of vs) {
      if (v.health < 180 && !v.dead) {
        v.fire += dt;
        if (v.health <= 0 || v.fire > 6) this.explode(v);
      }
    }
    // lights & matrices
    const rend = this.renderer;
    for (const v of vs) {
      if (v.sleeping && v._written) continue;
      v.writeMatrix(rend, this.tmp);
      v._written = true;
      const front = v.dead ? 0 : (night > 0.5 && (v.driver || v.ai)) ? 1 : 0;
      let rear = v.dead ? 0 : (night > 0.5 && (v.driver || v.ai)) ? 0.35 : 0;
      if (!v.dead && v.brake > 0.1 && v.speed > 0.5 && (v.driver || v.ai)) rear = 1;
      let extra = 0;
      if (v.siren) { v.sirenT += dt; extra = Math.sin(v.sirenT * 18) > 0 ? 1 : -1; }
      else if (v.spec.livery === 'taxi') extra = v.taxiFree ? 1 : 0;
      else if (v.spec.shape === 'tractor' && (v.driver || v.ai)) extra = Math.sin(performance.now() * 0.008) > 0 ? 1 : 0;
      const key = front * 100 + rear * 10 + extra;
      if (key !== v._lightKey || v.siren) { rend.setLights(v, front, rear, extra); v._lightKey = key; }
    }
    // (claymation: the cars go pose by pose — only the one you drive keeps up with the camera between poses)
    if (STYLE.plastilina && SM.on && !SM.tick) rend.flushOnly(this.game.cine ? null : this.game.player && this.game.player.vehicle); // («Película»: your car on twos too)
    else rend.flush();
  }

  onImpact(v, imp, px, pz, other) {
    if (imp < 1.5 || v.remote) return;
    const now = this.game.time * 1000;
    const dmg = Math.max(0, imp - 3) * (v.spec.shape === 'tractor' ? 4 : 11) * (v.driver === 'player' ? PERK.carHurt : 1); // Rocío's cars take less
    if (dmg > 0) v.health -= dmg;
    v.bump = clamp(imp * 0.02, 0, 0.12) * (Math.random() < 0.5 ? -1 : 1);
    if (now - v.lastHit > 180) {
      v.lastHit = now;
      this.game.onVehicleImpact && this.game.onVehicleImpact(v, imp, px, pz, other);
    }
    // a hard knock on two wheels throws the rider off
    if (v.spec.twoWheel && v.driver === 'player' && imp > 6) { const p = this.game.player; p.exitVehicle(true); p.knockDown(v.vx * 0.6, v.vz * 0.6, Math.min(35, imp * 2.5)); }
  }

  explode(v) {
    if (v.dead) return;
    v.dead = true;
    v.health = 0;
    v.color = '#1b1a19';
    this.renderer.setColor(v, v.color);
    v.throttle = 0;
    this.game.onExplosion && this.game.onExplosion(v.x, v.z, v);
  }

  nearest(x, z, maxD, filter) {
    let best = null, bd = maxD;
    for (const v of this.vehicles) {
      if (filter && !filter(v)) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
}

function pip(x, z, r) {
  let ins = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
