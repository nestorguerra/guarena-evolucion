// The hero's movement from motion capture, by motion matching (Simon Clavet, «Motion Matching and The Road to Next-Gen
// Animation», GDC 2016; Daniel Holden et al., «Learned Motion Matching», 2020): a database of captured frames of a
// real person walking, running, starting, stopping and turning. Several times a second the frame is chosen whose
// situation is most like the player's — where the feet are and how they move, how the hips move, and where the body
// will be over the next second (predicted from the stick with the same springs that steer the character) — and the
// animation carries on from there; the jump to it is hidden by inertialization (see springs.js).
//
// Data: assets/hero/moves.bin.gz ('HMV1', made by tools/mocaplab.js from the capture files): per frame the local
// rotation of each bone (a rotation vector, int16), the root's motion (forward/side speed, turn rate), the hips'
// height and offset from the root, and which feet are on the ground.
import * as THREE from 'three';
import { Inertializer, vecToQuat, predictPos, predictAngle } from './springs.js';

export function parseMoves(buf) {
  const dv = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength);
  let o = 0;
  const u8 = () => dv.getUint8(o++), u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; }, u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const str = () => { const n = u8(); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8()); return s; };
  const magic = String.fromCharCode(u8(), u8(), u8(), u8());
  if (magic !== 'HMV3') throw new Error('not a hero motion file: ' + magic);
  const fps = u16(), nB = u16(), nF = u32();
  const bones = []; for (let i = 0; i < nB; i++) bones.push(str());
  const clips = []; for (let i = 0, n = u16(); i < n; i++) clips.push({ name: str(), start: u32(), count: u32(), loop: !!u8(), tag: u8() });
  const rs = f32(), ps = f32(), vs = f32();
  // int16 values in two byte planes (low, then high), delta-coded along each take
  const planes = (n) => { const a = new Int16Array(n), u = new Uint8Array(dv.buffer, dv.byteOffset + o, n * 2); for (let i = 0; i < n; i++) a[i] = (u[i] | (u[n + i] << 8)) << 16 >> 16; o += n * 2; return a; };
  const rot = planes(nF * nB * 3), root = planes(nF * 6), contact = new Uint8Array(nF);
  for (let i = 0; i < nF; i++) contact[i] = u8();
  const undelta = (a, w) => { for (const c of clips) for (let i = 1; i < c.count; i++) { const f = c.start + i; for (let k = 0; k < w; k++) a[f * w + k] += a[(f - 1) * w + k]; } };
  undelta(rot, nB * 3); undelta(root, 6);
  return { fps, bones, frames: nF, clips, rot, root, contact, rs, ps, vs };
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// The decoded database: quaternions per frame and bone, the root's motion, and the matching features
export class MotionDB {
  // rig: { names: [bone names in the character], parent: {name: parentName}, rest: {name: Vector3 offset} }
  constructor(raw, rig) {
    this.raw = raw;
    this.fps = raw.fps; this.dt = 1 / raw.fps; this.n = raw.frames; this.bones = raw.bones; this.nb = raw.bones.length;
    const nb = this.nb, n = this.n;
    // rotations
    this.q = new Float32Array(n * nb * 4);
    for (let f = 0; f < n; f++) for (let b = 0; b < nb; b++) {
      const k = (f * nb + b) * 3;
      _v.set(raw.rot[k], raw.rot[k + 1], raw.rot[k + 2]).multiplyScalar(raw.rs);
      vecToQuat(_v, _q);
      this.q.set([_q.x, _q.y, _q.z, _q.w], (f * nb + b) * 4);
    }
    // root motion (root frame: on the ground under the hips, facing the way the body faces): forward and sideways
    // speed, turn rate; the hips' position in the root frame
    this.vel = new Float32Array(n * 2); this.yawRate = new Float32Array(n); this.hips = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      const r = f * 6;
      this.vel[f * 2] = raw.root[r] * raw.vs; this.vel[f * 2 + 1] = raw.root[r + 1] * raw.vs; this.yawRate[f] = raw.root[r + 2] * raw.vs;
      this.hips[f * 3] = raw.root[r + 3] * raw.ps; this.hips[f * 3 + 1] = raw.root[r + 4] * raw.ps; this.hips[f * 3 + 2] = raw.root[r + 5] * raw.ps;
    }
    this.contact = raw.contact;
    // which frames can be jumped to (a second of future must follow inside the same clip), and each frame's clip
    this.clipOf = new Int16Array(n); this.ok = new Uint8Array(n);
    raw.clips.forEach((c, ci) => {
      for (let i = 0; i < c.count; i++) {
        const f = c.start + i;
        this.clipOf[f] = ci;
        this.ok[f] = c.loop || i + Math.round(this.fps * 1.0) < c.count ? 1 : 0;
      }
    });
    this.rig = rig;
    this.bi = Object.fromEntries(this.bones.map((b, i) => [b, i]));
    // the fastest the captures go (a quicker body asks for it, and plays it a little faster)
    this.vmax = 0; for (let f = 0; f < n; f++) this.vmax = Math.max(this.vmax, Math.hypot(this.vel[f * 2], this.vel[f * 2 + 1]));
    this.features();
  }
  // frame f + k within its clip (wrapping round a loop, held at the end otherwise)
  step(f, k) {
    const c = this.raw.clips[this.clipOf[f]];
    let i = f - c.start + k;
    if (c.loop) i = ((i % c.count) + c.count) % c.count; else i = Math.max(0, Math.min(c.count - 1, i));
    return c.start + i;
  }
  // forward kinematics of a frame in the root frame: positions of the named bones (Vector3s)
  fk(f, names, out) {
    const nb = this.nb, rig = this.rig, W = this._W || (this._W = {}), WQ = this._WQ || (this._WQ = {});
    for (const b of rig.order) {
      const i = this.bi[b];
      const lq = WQ[b] || (WQ[b] = new THREE.Quaternion()), lp = W[b] || (W[b] = new THREE.Vector3());
      if (i !== undefined) _q.fromArray(this.q, (f * nb + i) * 4); else _q.identity();
      const p = rig.parent[b];
      if (!p) { lq.identity(); lp.set(0, 0, 0); } // (the root: on the ground under the hips, facing ahead)
      else if (b === 'hips') { lp.set(this.hips[f * 3], this.hips[f * 3 + 1], this.hips[f * 3 + 2]); lq.copy(_q); }
      else { lp.copy(rig.rest[b]).applyQuaternion(WQ[p]).add(W[p]); lq.copy(WQ[p]).multiply(_q); }
    }
    names.forEach((nm, k) => out[k].copy(W[nm]));
    return out;
  }
  // matching features per frame: both feet (position, velocity), the hips' velocity, and the trajectory 1/3, 2/3
  // and 1 s ahead (position and facing), all in the root frame
  features() {
    const n = this.n, D = 27, F = (this.F = new Float32Array(n * D)), dt = this.dt;
    const names = ['footL', 'footR', 'hips'], A = names.map(() => new THREE.Vector3()), B = names.map(() => new THREE.Vector3());
    const fut = [Math.round(this.fps / 3), Math.round((2 * this.fps) / 3), Math.round(this.fps)];
    for (let f = 0; f < n; f++) {
      this.fk(f, names, A);
      const g = this.step(f, 1);
      this.fk(g, names, B);
      // the next frame's positions are in the next root frame: bring them back through the root's own motion
      const yaw = this.yawRate[f] * dt, c = Math.cos(yaw), s = Math.sin(yaw), mx = this.vel[f * 2 + 1] * dt, mz = this.vel[f * 2] * dt;
      let k = f * D;
      for (let j = 0; j < 2; j++) { F[k++] = A[j].x; F[k++] = A[j].y; F[k++] = A[j].z; }
      for (let j = 0; j < 3; j++) {
        const bx = B[j].x * c + B[j].z * s + mx, bz = -B[j].x * s + B[j].z * c + mz;
        F[k++] = (bx - A[j].x) / dt; F[k++] = (B[j].y - A[j].y) / dt; F[k++] = (bz - A[j].z) / dt;
      }
      // integrate the root forward: positions (side, forward) and facings (sin, cos) 1/3, 2/3 and 1 s ahead
      let px = 0, pz = 0, h = 0, ff = f, done = 0;
      for (let t = 1; t <= fut[2]; t++) {
        const vx = this.vel[ff * 2 + 1], vz = this.vel[ff * 2];
        px += (vx * Math.cos(h) + vz * Math.sin(h)) * dt; pz += (-vx * Math.sin(h) + vz * Math.cos(h)) * dt; h += this.yawRate[ff] * dt;
        ff = this.step(ff, 1);
        if (t === fut[done]) {
          F[f * D + 15 + done * 2] = px; F[f * D + 16 + done * 2] = pz;
          F[f * D + 21 + done * 2] = Math.sin(h); F[f * D + 22 + done * 2] = Math.cos(h);
          done++;
        }
      }
    }
    // normalise each group by its spread, then weight the groups
    this.D = D;
    const groups = [[0, 6, 0.75], [6, 15, 1.0], [15, 21, 1.0], [21, 27, 1.5]];
    this.mean = new Float32Array(D); this.scale = new Float32Array(D);
    for (let d = 0; d < D; d++) { let m = 0; for (let f = 0; f < n; f++) m += F[f * D + d]; this.mean[d] = m / n; }
    for (const [a, b, w] of groups) {
      let v = 0;
      for (let d = a; d < b; d++) for (let f = 0; f < n; f++) { const x = F[f * D + d] - this.mean[d]; v += x * x; }
      const sd = Math.sqrt(v / (n * (b - a))) || 1;
      for (let d = a; d < b; d++) this.scale[d] = w / sd;
    }
    for (let f = 0; f < n; f++) for (let d = 0; d < D; d++) F[f * D + d] = (F[f * D + d] - this.mean[d]) * this.scale[d];
  }
  // the best frame for a query (normalised in place), skipping frames that cannot be jumped to
  search(query, tags = null) {
    const D = this.D, F = this.F, n = this.n, clips = this.raw.clips;
    let best = -1, bc = Infinity;
    for (let f = 0; f < n; f++) {
      if (!this.ok[f]) continue;
      if (tags && !tags.includes(clips[this.clipOf[f]].tag)) continue;
      let c = 0;
      const k = f * D;
      for (let d = 0; d < D && c < bc; d++) { const x = F[k + d] - query[d]; c += x * x; }
      if (c < bc) { bc = c; best = f; }
    }
    return { frame: best, cost: bc };
  }
  cost(f, query) { const D = this.D, k = f * D; let c = 0; for (let d = 0; d < D; d++) { const x = this.F[k + d] - query[d]; c += x * x; } return c; }
}

// The player of the database for one character: keeps the frame playing, searches now and then, blends through
// inertialization, and hands out the pose (local quaternions per DB bone, hips position in the root frame) and which
// feet are planted. ctrl: { speed (m/s), dir (desired velocity, character frame: [side, forward]), turn (rad the
// facing still has to turn), halfLife (velocity spring), turnHalfLife }
export class MotionPlayer {
  constructor(db) {
    this.db = db;
    this.frame = db.raw.clips[0].start; this.ft = 0; this.searchT = 0;
    this.pose = Array.from({ length: db.nb }, () => new THREE.Quaternion());
    this.hips = new THREE.Vector3();
    this.inert = new Inertializer(db.nb);
    this.query = new Float32Array(db.D);
    this.names = ['footL', 'footR', 'hips'];
    this._A = this.names.map(() => new THREE.Vector3());
    this.rate = 1;
    this.contactL = false; this.contactR = false;
  }
  buildQuery(ctrl) {
    const db = this.db, D = db.D, Q = this.query, f = this.frame;
    // the pose part: from the frame playing (its own features, not normalised yet)
    for (let d = 0; d < 15; d++) Q[d] = db.F[f * D + d] / db.scale[d] + db.mean[d];
    // the trajectory part: where the springs will take the character in 1/3, 2/3, 1 s (character frame)
    const ts = [1 / 3, 2 / 3, 1], out = this._po || (this._po = [0, 0]);
    const sp = Math.max(Math.hypot(ctrl.vel[0], ctrl.vel[1]), Math.hypot(ctrl.goal[0], ctrl.goal[1])), kv = sp > db.vmax * 0.97 ? (db.vmax * 0.97) / sp : 1;
    const x = [0, 0], v = [ctrl.vel[0] * kv, ctrl.vel[1] * kv], a = [ctrl.acc[0] * kv, ctrl.acc[1] * kv], vg = [ctrl.goal[0] * kv, ctrl.goal[1] * kv];
    for (let i = 0; i < 3; i++) {
      predictPos(out, x, v, a, vg, ctrl.halfLife, ts[i]);
      Q[15 + i * 2] = out[0]; Q[16 + i * 2] = out[1];
      const h = predictAngle(0, ctrl.yawVel, ctrl.turn, ctrl.turnHalfLife, ts[i]);
      Q[21 + i * 2] = Math.sin(h); Q[22 + i * 2] = Math.cos(h);
    }
    for (let d = 0; d < D; d++) Q[d] = (Q[d] - db.mean[d]) * db.scale[d];
    return Q;
  }
  update(dt, ctrl) {
    const db = this.db;
    this.searchT -= dt;
    this.dwell = (this.dwell || 0) + dt;
    let jumped = false;
    // (a take running out — less than a second of it left — must hand over now: it cannot go on)
    const ending = !db.ok[this.frame];
    // what is asked: when it changes (a new direction, speeding up, stopping), a new take may be looked for at once;
    // while it holds steady, the take playing is kept at least a few strides' worth — a steady run settles into its
    // own cycle instead of hopping between takes ten times a second (each hop a small hitch however well blended)
    const gx = ctrl.goal[0], gz = ctrl.goal[1], pg = this._goal || (this._goal = [gx, gz]);
    const change = Math.hypot(gx - pg[0], gz - pg[1]) > 0.6 || Math.abs(ctrl.turn) > 0.5;
    if (change) { pg[0] = gx; pg[1] = gz; }
    const settled = !change && this.dwell < 0.45;
    if ((this.searchT <= 0 && !settled) || ctrl.force || ending) {
      this.searchT = 0.1;
      const q = this.buildQuery(ctrl);
      // standing still (nothing asked, hardly moving): the standing and the turning-on-the-spot takes only — the ends
      // of the stops would otherwise be found again and again
      const still = Math.hypot(ctrl.goal[0], ctrl.goal[1]) < 0.05 && Math.hypot(ctrl.vel[0], ctrl.vel[1]) < 0.12;
      const tags = still ? (Math.abs(ctrl.turn) > 0.35 ? [2] : [1, 2]) : null;
      const curTag = db.raw.clips[db.clipOf[this.frame]].tag;
      const cur = ending || (tags && !tags.includes(curTag)) ? Infinity : db.cost(this.frame, q);
      const r = db.search(q, tags);
      // switch only if clearly better, and not to (nearly) the same moment of the same clip
      const same = db.clipOf[r.frame] === db.clipOf[this.frame] && !db.raw.clips[db.clipOf[r.frame]].loop;
      if (r.frame >= 0 && r.cost < cur * (change ? 0.9 : 0.8) - 0.02 && !(same && r.frame - this.frame < 20 && r.frame - this.frame > -20)) {
        this.frame = r.frame; this.ft = 0; jumped = true; this.dwell = 0;
      }
    }
    // play on (at a rate that keeps the stride matched to the body's speed, within reason: a sprint quicker than the
    // fastest capture plays it up to a quarter faster)
    { const fv = this.frame, va = Math.hypot(db.vel[fv * 2], db.vel[fv * 2 + 1]), vs = Math.hypot(ctrl.vel[0], ctrl.vel[1]);
      const want = va > 0.6 && vs > 0.6 ? Math.min(1.3, Math.max(0.85, vs > va ? Math.pow(vs / va, 0.55) : vs / va)) : 1; // (faster than the capture: part quicker steps, part longer ones — afterMove's stride warping)
      this.rate += (want - this.rate) * Math.min(1, dt * 6); }
    this.ft += dt * db.fps * this.rate;
    while (this.ft >= 1) { this.ft -= 1; this.frame = db.step(this.frame, 1); }
    const f0 = this.frame, f1 = db.step(f0, 1), t = this.ft, nb = db.nb;
    for (let b = 0; b < nb; b++) {
      _q.fromArray(db.q, (f0 * nb + b) * 4); _q2.fromArray(db.q, (f1 * nb + b) * 4);
      this.pose[b].copy(_q).slerp(_q2, t);
    }
    this.hips.set(db.hips[f0 * 3], db.hips[f0 * 3 + 1], db.hips[f0 * 3 + 2]).lerp(_v.set(db.hips[f1 * 3], db.hips[f1 * 3 + 1], db.hips[f1 * 3 + 2]), t);
    if (jumped) this.inert.transition(this.pose, this.hips, dt);
    this.inert.apply(this.pose, this.hips, dt);
    const c = db.contact[t < 0.5 ? f0 : f1];
    this.contactL = !!(c & 1); this.contactR = !!(c & 2);
    // the root's own motion this frame (for the display root that follows the animation)
    this.rootVel = [db.vel[f0 * 2 + 1], db.vel[f0 * 2]]; this.rootYawRate = db.yawRate[f0];
    return this.pose;
  }
}
