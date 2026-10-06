// Ragdolls: someone knocked down goes limp and falls as a body, not as a plank. The body is a set of particles joined
// by sticks and moved by Verlet integration (after T. Jakobsen's «Advanced Character Physics», the Hitman ragdolls):
// the pelvis, the chest and the head are rigid blocks, the limbs hang off them with joint limits (knees and elbows
// only bend one way, the spine and the neck only so far), and it all falls under gravity onto the floor and against
// the walls, sliding to a stop. For a moment after the blow there is still some muscle in it — the arms go out to break
// the fall, the chin tucks in (the idea behind the active ragdolls of Euphoria) — then it goes limp. The pose is read
// back onto the character's bones every frame.
import * as THREE from 'three';
import { clamp, smoothstep } from './util.js';

// particles
const PELV = 0, HIPL = 1, HIPR = 2, KNEEL = 3, KNEER = 4, ANKL = 5, ANKR = 6, TOEL = 7, TOER = 8, CHEST = 9, NECK = 10,
  HEAD = 11, SHL = 12, SHR = 13, ELBL = 14, ELBR = 15, WRL = 16, WRR = 17, HANDL = 18, HANDR = 19, PELVF = 20, CHESTF = 21, HEADF = 22;
const N = 23;
// collision radius (m, for a 1.78 m body; 0 = no collision) and mass
const RAD = [0.11, 0.07, 0.07, 0.055, 0.055, 0.045, 0.045, 0.03, 0.03, 0.13, 0.06, 0.1, 0.065, 0.065, 0.045, 0.045, 0.035, 0.035, 0.03, 0.03, 0, 0, 0];
const MASS = [12, 6, 6, 4, 4, 2, 2, 0.6, 0.6, 14, 3, 5, 3, 3, 2, 2, 1, 1, 0.5, 0.5, 1, 1, 1];
// the ones that bump into walls
const WALLS = [PELV, CHEST, HEAD, KNEEL, KNEER, ANKL, ANKR, ELBL, ELBR, WRL, WRR];
const H = 1 / 60; // simulation step

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _qh = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qk = new THREE.Quaternion(), _qn = new THREE.Quaternion();
const _I = new THREE.Quaternion(), _AX = new THREE.Vector3(1, 0, 0);
const _pc = { x: 0, z: 0 };

export class Ragdoll {
  // o: vel [x, y, z] given to the whole body (m/s); legs: extra for the feet and knees (swept out by a car), up: extra
  // for the chest and head (a blow high up); hit: { i: particle, v: [x, y, z] } a push on one part; buckle: the knees
  // give way (someone shot or fainting); tone: muscle at first (0 limp … 1); env: { floor(x, z, y), collide(p, r) }
  constructor(ch, o = {}) {
    this.ch = ch;
    this.env = o.env || null;
    this.t = 0; this.acc = 0; this.still = 0; this.sleeping = false; this.landed = false;
    this.tone0 = o.tone ?? 0.6;
    const S = ch.scale, B = ch.bones;
    this.S = S;
    ch.object.updateMatrixWorld(true);
    const p = (this.p = new Float32Array(N * 3)), old = (this.o = new Float32Array(N * 3));
    this.r = new Float32Array(N); this.w = new Float32Array(N); this.gnd = new Uint8Array(N);
    const put = (i, bone, off) => {
      bone.getWorldPosition(_v);
      if (off) { bone.getWorldQuaternion(_q); _v.add(_a.set(off[0] * S, off[1] * S, off[2] * S).applyQuaternion(_q)); }
      p[i * 3] = _v.x; p[i * 3 + 1] = _v.y; p[i * 3 + 2] = _v.z;
    };
    put(PELV, B.hips); put(HIPL, B.thighL); put(HIPR, B.thighR); put(KNEEL, B.shinL); put(KNEER, B.shinR);
    put(ANKL, B.footL); put(ANKR, B.footR); put(TOEL, B.toeL, [0, 0, 0.06]); put(TOER, B.toeR, [0, 0, 0.06]);
    put(CHEST, B.chest); put(NECK, B.neck); put(HEAD, B.head, [0, 0.1, 0]);
    put(SHL, B.armL); put(SHR, B.armR); put(ELBL, B.foreL); put(ELBR, B.foreR); put(WRL, B.handL); put(WRR, B.handR);
    put(HANDL, B.fingL); put(HANDR, B.fingR);
    // (the ghosts ahead of each block are straight ahead of it at rest, so a block standing straight reads as unturned)
    put(PELVF, B.hips, [0, 0, 0.13]); put(CHESTF, B.chest, [0, 0, 0.13]); put(HEADF, B.head, [0, 0.1, 0.12]);
    for (let i = 0; i < N; i++) { this.r[i] = RAD[i] * S; this.w[i] = 1 / MASS[i]; }
    // velocities: Verlet keeps them as the step from the old position
    const vel = o.vel || [0, 0, 0], legs = o.legs || 0, up = o.up || 0;
    for (let i = 0; i < N; i++) {
      const k = i === KNEEL || i === KNEER ? 1 + legs * 0.7 : i === ANKL || i === ANKR || i === TOEL || i === TOER ? 1 + legs : i === CHEST || i === CHESTF || i === NECK || i === SHL || i === SHR ? 1 + up * 0.7 : i === HEAD || i === HEADF ? 1 + up : 1;
      old[i * 3] = p[i * 3] - vel[0] * k * H; old[i * 3 + 1] = p[i * 3 + 1] - vel[1] * H; old[i * 3 + 2] = p[i * 3 + 2] - vel[2] * k * H;
    }
    if (o.hit) this.push(o.hit.i, o.hit.v[0], o.hit.v[1], o.hit.v[2]);
    if (o.buckle) {
      // the knees give way forwards and the hips drop; the top half goes over one way or another (forwards most
      // often, back, or to a side) instead of staying balanced upright on the knees
      ch.bones.hips.getWorldQuaternion(_q); _v.set(0, 0, 1).applyQuaternion(_q); _a.set(1, 0, 0).applyQuaternion(_q);
      for (const i of [KNEEL, KNEER]) { old[i * 3] -= _v.x * 0.6 * o.buckle * H; old[i * 3 + 2] -= _v.z * 0.6 * o.buckle * H; }
      for (const i of [PELV, HIPL, HIPR, PELVF]) old[i * 3 + 1] += 0.45 * o.buckle * H;
      const r = Math.random(), f = r < 0.4 ? 1 : r < 0.75 ? -0.9 : 0.25, sd = r < 0.4 ? (Math.random() - 0.5) * 0.8 : r < 0.75 ? (Math.random() - 0.5) * 0.6 : (Math.random() < 0.5 ? -1 : 1);
      const tx = (_v.x * f + _a.x * sd) * 1.7 * o.buckle, tz = (_v.z * f + _a.z * sd) * 1.7 * o.buckle;
      this.slip = 0.5; // (the feet slide out as it goes)
      for (const i of [CHEST, NECK, HEAD, SHL, SHR, CHESTF, HEADF]) { old[i * 3] -= tx * H; old[i * 3 + 2] -= tz * H; }
    }
    // sticks, rigid blocks and joint limits: [a, b, min, max]
    const C = (this.c = []);
    const dist = (a, b) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
    const stick = (a, b) => { const d = dist(a, b); C.push(a, b, d, d); };
    const range = (a, b, mn, mx) => C.push(a, b, mn, mx);
    const block = (list) => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) stick(list[i], list[j]); };
    const R = ch.rest, L1 = R.shinL.length(), L2 = R.footL.length(), A1 = R.foreL.length(), A2 = R.handL.length();
    const sp = R.spine.length() + R.chest.length();
    block([PELV, HIPL, HIPR, PELVF]);
    block([CHEST, NECK, SHL, SHR, CHESTF]);
    block([NECK, HEAD, HEADF]);
    // the spine bends and twists only so far
    range(PELV, CHEST, sp * 0.86, sp * 1.01);
    range(PELVF, CHESTF, 0.74 * sp, 1.12 * dist(PELVF, CHESTF));
    const s0 = dist(HIPL, SHL), s1 = dist(HIPR, SHR);
    range(HIPL, SHL, s0 * 0.78, s0 * 1.1); range(HIPR, SHR, s1 * 0.78, s1 * 1.1);
    range(HIPL, SHR, dist(HIPL, SHR) * 0.85, dist(HIPL, SHR) * 1.1); range(HIPR, SHL, dist(HIPR, SHL) * 0.85, dist(HIPR, SHL) * 1.1);
    // the neck
    const hc = dist(CHEST, HEAD);
    range(CHEST, HEAD, hc * 0.84, hc * 1.03); range(CHESTF, HEADF, dist(CHESTF, HEADF) * 0.6, dist(CHESTF, HEADF) * 1.25);
    range(SHL, HEAD, dist(SHL, HEAD) * 0.8, dist(SHL, HEAD) * 1.2); range(SHR, HEAD, dist(SHR, HEAD) * 0.8, dist(SHR, HEAD) * 1.2);
    // legs: thigh, shin, foot; how far the knee and the ankle fold; the hip can't fold the thigh into the belly
    for (const [hp, kn, an, to] of [[HIPL, KNEEL, ANKL, TOEL], [HIPR, KNEER, ANKR, TOER]]) {
      range(hp, kn, L1, L1); range(kn, an, L2, L2); stick(an, to);
      range(hp, an, (L1 + L2) * 0.42, L1 + L2);
      const ft = dist(an, to), kt = Math.hypot(L2, ft);
      range(kn, to, kt * 0.72, kt * 1.08);
      range(CHEST, kn, 0.45 * S, 10); range(PELVF, kn, 0.1 * S, 10); // (the thigh folds up only so far)
    }
    range(KNEEL, KNEER, 0.1 * S, 10); range(ANKL, ANKR, 0.09 * S, 10); range(TOEL, TOER, 0.07 * S, 10);
    // arms: upper arm, forearm, hand; how far the elbow and the wrist fold; they stay out of the chest
    for (const [sh, el, wr, hd] of [[SHL, ELBL, WRL, HANDL], [SHR, ELBR, WRR, HANDR]]) {
      range(sh, el, A1, A1); range(el, wr, A2, A2); stick(wr, hd);
      range(sh, wr, (A1 + A2) * 0.3, A1 + A2);
      const hl = dist(wr, hd);
      range(el, hd, (A2 + hl) * 0.8, A2 + hl);
      range(el, CHEST, 0.14 * S, 10); range(wr, CHEST, 0.13 * S, 10); range(wr, PELV, 0.1 * S, 10); range(wr, HEAD, 0.1 * S, 10);
    }
    this.nc = C.length / 4;
    this.legL = L1 + L2;
    this.cf = new Float32Array(C);
    this.yaw = ch.object.rotation.y;
    this.floorY = 0;
  }
  // a push on one part (a shot into a body, a kick), m/s
  push(i, vx, vy, vz) {
    const o = this.o;
    o[i * 3] -= vx * H; o[i * 3 + 1] -= vy * H; o[i * 3 + 2] -= vz * H;
    this.sleeping = false; this.still = 0; this.posed = false;
    if (this.landed) this.landT = this.t; // (settles again from here)
  }
  pelvis(out) { const p = this.p; return out.set(p[0], p[1], p[2]); }
  // lying on the back (the chest faces up)?
  faceUp() {
    const p = this.p;
    _x.set(p[SHL * 3] - p[SHR * 3], p[SHL * 3 + 1] - p[SHR * 3 + 1], p[SHL * 3 + 2] - p[SHR * 3 + 2]);
    _z.set(p[CHESTF * 3] - p[CHEST * 3], p[CHESTF * 3 + 1] - p[CHEST * 3 + 1], p[CHESTF * 3 + 2] - p[CHEST * 3 + 2]);
    return _z.y > 0;
  }
  // the direction the head is from the hips, on the ground (x, z), and where the body lies
  headDir() { const p = this.p; const dx = p[NECK * 3] - p[0], dz = p[NECK * 3 + 2] - p[2], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }

  step(dt) {
    if (this.sleeping) return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= H && n < 8) { this.acc -= H; this.sub(); n++; }
    if (n === 8) this.acc = 0;
  }
  sub() {
    const p = this.p, o = this.o, w = this.w, r = this.r, env = this.env, S = this.S;
    this.t += H;
    // 1. integrate: keep going as it was, air drag (much more once it lies on the ground), gravity
    const g = -9.8 * H * H, damp = this.landed && this.t - this.landT > 0.4 ? 0.95 : 0.995;
    let moved = 0;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      for (let a = 0; a < 3; a++) {
        const x = p[k + a], v = (x - o[k + a]) * damp;
        o[k + a] = x; p[k + a] = x + v + (a === 1 ? g : 0);
        moved = Math.max(moved, Math.abs(v));
      }
    }
    // 2. muscle for a moment: the arms go out to break the fall, the chin tucks in (fading, and gone once down)
    const tone = this.tone0 * (1 - smoothstep(0.35, 1.1, this.t)) * (this.landed ? 0.25 : 1);
    if (tone > 0.01) {
      _a.set(p[CHEST * 3] - o[CHEST * 3], 0, p[CHEST * 3 + 2] - o[CHEST * 3 + 2]);
      if (_a.lengthSq() < 1e-6) _a.set(p[CHEST * 3] - p[0], 0, p[CHEST * 3 + 2] - p[2]);
      _a.normalize();
      _x.set(p[SHL * 3] - p[SHR * 3], 0, p[SHL * 3 + 2] - p[SHR * 3 + 2]).normalize();
      for (const [wr, sd] of [[WRL, 1], [WRR, -1]]) {
        const tx = p[CHEST * 3] + _a.x * 0.32 * S + _x.x * sd * 0.2 * S, ty = p[CHEST * 3 + 1] - 0.3 * S, tz = p[CHEST * 3 + 2] + _a.z * 0.32 * S + _x.z * sd * 0.2 * S;
        const k = wr * 3, f = 0.1 * tone;
        p[k] += (tx - p[k]) * f; p[k + 1] += (ty - p[k + 1]) * f; p[k + 2] += (tz - p[k + 2]) * f;
      }
      // the head held up off the chest
      _b.set(p[NECK * 3] - p[CHEST * 3], p[NECK * 3 + 1] - p[CHEST * 3 + 1], p[NECK * 3 + 2] - p[CHEST * 3 + 2]).normalize();
      const k = HEAD * 3, f = 0.08 * tone;
      p[k] += (p[NECK * 3] + _b.x * 0.17 * S - p[k]) * f; p[k + 1] += (p[NECK * 3 + 1] + _b.y * 0.17 * S - p[k + 1]) * f; p[k + 2] += (p[NECK * 3 + 2] + _b.z * 0.17 * S - p[k + 2]) * f;
    }
    // 3. constraints, joint hinges, the floor and the walls, a few rounds
    const C = this.cf, nc = this.nc;
    const fy = env && env.floor ? env.floor(p[0], p[2], p[1]) : 0;
    this.floorY = fy;
    for (let it = 0; it < 8; it++) {
      for (let c = 0; c < nc; c++) {
        const a = C[c * 4] * 3, b = C[c * 4 + 1] * 3, mn = C[c * 4 + 2], mx = C[c * 4 + 3];
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let tg;
        if (d < mn) tg = mn; else if (d > mx) tg = mx; else continue;
        const wa = w[a / 3], wb = w[b / 3], f = (d - tg) / ((d || 1e-6) * (wa + wb));
        p[a] += dx * f * wa; p[a + 1] += dy * f * wa; p[a + 2] += dz * f * wa;
        p[b] -= dx * f * wb; p[b + 1] -= dy * f * wb; p[b + 2] -= dz * f * wb;
      }
      if (it % 2 === 1) { this.hinge(HIPL, KNEEL, ANKL, 1); this.hinge(HIPR, KNEER, ANKR, 1); this.hinge(SHL, ELBL, WRL, -1); this.hinge(SHR, ELBR, WRR, -1); }
      for (let i = 0; i < N; i++) {
        if (!r[i]) continue;
        const k = i * 3, y0 = fy + r[i];
        if (p[k + 1] < y0) { p[k + 1] = y0; this.gnd[i] = 1; }
      }
    }
    if (env && env.collide) for (const i of WALLS) {
      const k = i * 3;
      if (p[k + 1] - fy > 2.4) continue;
      // (a fast body must not go through a thin wall in one step: back to where it was, stopped against it)
      if (env.crosses && env.crosses(o[k], o[k + 2], p[k], p[k + 2])) { p[k] = o[k]; p[k + 2] = o[k + 2]; }
      _pc.x = p[k]; _pc.z = p[k + 2];
      env.collide(_pc, r[i] + 0.05 * S);
      const ddx = _pc.x - p[k], ddz = _pc.z - p[k + 2];
      if (ddx || ddz) { p[k] = _pc.x; p[k + 2] = _pc.z; o[k] += ddx * 0.6; o[k + 2] += ddz * 0.6; }
    }
    // 4. friction on the ground (it slides to a stop), and hardly any bounce
    let down = 0;
    for (let i = 0; i < N; i++) {
      if (!this.gnd[i]) continue;
      const k = i * 3;
      if (p[k + 1] > fy + r[i] + 0.01) { this.gnd[i] = 0; continue; }
      const fr = this.slip && this.t < this.slip && (i === ANKL || i === ANKR || i === TOEL || i === TOER) ? 0.04 : 0.3;
      o[k] += (p[k] - o[k]) * fr; o[k + 2] += (p[k + 2] - o[k + 2]) * fr; o[k + 1] += (p[k + 1] - o[k + 1]) * 0.7;
      if (i === PELV || i === CHEST || i === HEAD) down++;
    }
    if (down && !this.landed) { this.landed = true; this.landT = this.t; }
    // settling on the ground a limp leg slowly unfolds (a body doesn't stay sitting on its heels)
    if (this.landed && this.t - this.landT < 1.6) {
      const L = this.legL;
      for (const [hp, an] of [[HIPL, ANKL], [HIPR, ANKR]]) {
        const a = hp * 3, b = an * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        if (d > L * 0.8) continue;
        const f = ((L * 0.8 - d) / d) * 0.04;
        p[b] += dx * f; p[b + 1] += dy * f * 0.3; p[b + 2] += dz * f;
      }
    }
    // 5. asleep once it has lain still a moment (or a good while after it came down, whatever is still twitching)
    if (moved < 0.0015 && this.t > 0.6) { if (++this.still > 45) this.sleeping = true; } else this.still = 0;
    if (this.landed && this.t - this.landT > 4) this.sleeping = true;
  }
  // a knee or an elbow bent the wrong way is folded back the right way (the middle joint mirrored across the limb)
  hinge(a, m, b, sgn) {
    const p = this.p, o = this.o;
    const blk = sgn > 0 ? [HIPL, HIPR] : [SHL, SHR];
    _x.set(p[blk[0] * 3] - p[blk[1] * 3], p[blk[0] * 3 + 1] - p[blk[1] * 3 + 1], p[blk[0] * 3 + 2] - p[blk[1] * 3 + 2]);
    _a.set(p[m * 3] - p[a * 3], p[m * 3 + 1] - p[a * 3 + 1], p[m * 3 + 2] - p[a * 3 + 2]);
    _b.set(p[b * 3] - p[m * 3], p[b * 3 + 1] - p[m * 3 + 1], p[b * 3 + 2] - p[m * 3 + 2]);
    _c.crossVectors(_a, _b);
    // only a clear case, and not with the limb out to the side (then either way is a bend it can make)
    const cl = _c.length(), la = _a.length() || 1e-6, xl = _x.length() || 1e-6;
    if (cl < 0.15 * la * _b.length() || Math.abs(_a.dot(_x)) > 0.7 * la * xl || _c.dot(_x) * sgn > -0.25 * cl * xl) return;
    // mirror m across the line a–b
    _b.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    const l2 = _b.lengthSq() || 1e-6, t = _a.dot(_b) / l2;
    for (let k = 0; k < 3; k++) {
      const q = p[a * 3 + k] + _b.getComponent(k) * t, nm = 2 * q - p[m * 3 + k];
      o[m * 3 + k] += nm - p[m * 3 + k]; p[m * 3 + k] = nm;
    }
  }

  // the pose onto the bones: the object sits on the floor under the pelvis, facing as it did when it fell
  pose() {
    const ch = this.ch, B = ch.bones, p = this.p, obj = ch.object;
    obj.position.set(p[0], this.floorY, p[2]);
    obj.rotation.set(0, this.yaw, 0);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // particle i in the object's frame
    const L = (i, out) => { const k = i * 3, x = p[k] - p[0], z = p[k + 2] - p[2]; return out.set(x * cy - z * sy, p[k + 1] - this.floorY, x * sy + z * cy); };
    const frame = (xa, za, out) => { // right-handed basis from an x axis and a forward hint
      _x.copy(xa).normalize(); const dp = za.dot(_x); _z.copy(za).addScaledVector(_x, -dp).normalize(); _y.crossVectors(_z, _x);
      _m.makeBasis(_x, _y, _z); return out.setFromRotationMatrix(_m);
    };
    const T = this._tmp || (this._tmp = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3()));
    const A = T[0], Bv = T[1], Cv = T[2], D = T[3];
    // pelvis
    L(HIPL, A); L(HIPR, Bv); L(PELV, Cv); L(PELVF, D);
    frame(A.sub(Bv), D.sub(Cv), _qh);
    B.hips.position.copy(Cv); B.hips.quaternion.copy(_qh);
    // chest (split over the spine and the chest bones)
    L(SHL, A); L(SHR, Bv); L(CHEST, Cv); L(CHESTF, D);
    frame(A.sub(Bv), D.sub(Cv), _qc);
    _q.copy(_qh).invert().multiply(_qc);
    _qs.copy(_I).slerp(_q, 0.5); B.spine.quaternion.copy(_qs);
    B.chest.quaternion.copy(_qs).invert().multiply(_q);
    B.clavL.quaternion.identity(); B.clavR.quaternion.identity();
    // head (split over the neck and the head)
    L(NECK, A); L(HEAD, Bv); L(HEADF, D);
    _y.copy(Bv).sub(A).normalize(); _z.copy(D).sub(Bv); _z.addScaledVector(_y, -_z.dot(_y)).normalize(); _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z); _qn.setFromRotationMatrix(_m);
    _q.copy(_qc).invert().multiply(_qn);
    _qa.copy(_I).slerp(_q, 0.45); B.neck.quaternion.copy(_qa);
    B.head.quaternion.copy(_qa).invert().multiply(_q);
    // limbs: the upper bone from the joint positions (its hinge across the bend), the lower one bent about it
    this.limb(B.thighL, B.shinL, HIPL, KNEEL, ANKL, _qh, 1, L);
    this.limb(B.thighR, B.shinR, HIPR, KNEER, ANKR, _qh, 1, L);
    this.limb(B.armL, B.foreL, SHL, ELBL, WRL, _qc, -1, L);
    this.limb(B.armR, B.foreR, SHR, ELBR, WRR, _qc, -1, L);
    // feet from the toes, hands hanging limp
    this.foot(B.footL, ANKL, TOEL, L); this.foot(B.footR, ANKR, TOER, L);
    B.handL.rotation.set(0.35, 0, 0.1); B.handR.rotation.set(0.35, 0, -0.1);
    B.toeL.rotation.set(0, 0, 0); B.toeR.rotation.set(0, 0, 0);
    B.root.rotation.set(0, 0, 0); B.root.position.set(0, 0, 0);
  }
  // the world orientation of each limb bone is kept for the next one down (thigh → shin → foot)
  limb(up, lo, a, m, b, parentQ, sgn, L) {
    const T = this._tmp, J = L(a, T[0]), K = L(m, T[1]), E = L(b, T[2]);
    const d = T[4].copy(K).sub(J).normalize(), f = T[5].copy(E).sub(K).normalize();
    // hinge axis: across the bend (knees fold back, elbows forward); nearly straight, the parent's side axis
    _c.crossVectors(d, f).multiplyScalar(sgn);
    const bend = _c.length();
    _x.set(1, 0, 0).applyQuaternion(parentQ); _x.addScaledVector(d, -_x.dot(d)).normalize();
    if (bend > 1e-4) { _c.normalize(); if (_c.dot(_x) < 0 && bend < 0.25) _c.negate(); _x.lerp(_c, clamp(bend / 0.25, 0, 1)).normalize(); }
    _y.copy(d).negate(); _z.crossVectors(_x, _y).normalize(); _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z); _qk.setFromRotationMatrix(_m);
    up.quaternion.copy(parentQ).invert().multiply(_qk);
    const ang = Math.acos(clamp(d.dot(f), -1, 1));
    lo.quaternion.setFromAxisAngle(_AX, ang * sgn);
    const lw = this._lw || (this._lw = new Map());
    if (!lw.has(lo)) lw.set(lo, new THREE.Quaternion());
    lw.get(lo).copy(_qk).multiply(lo.quaternion); // the lower bone's orientation, for the foot
  }
  foot(bone, a, t, L) {
    const shinW = this._lw && this._lw.get(bone.parent);
    if (!shinW) return;
    const A = L(a, this._tmp[0]), T = L(t, this._tmp[1]);
    const f = T.sub(A).normalize().applyQuaternion(_q.copy(shinW).invert());
    const rest = this.ch.rest.toeL, r0 = Math.atan2(-(rest.y) , rest.z + 0.06 * this.S);
    bone.rotation.set(clamp(Math.atan2(-f.y, f.z) - r0, -0.9, 1.2), 0, 0);
  }
}
