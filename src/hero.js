// The hero: a character built and moved the way current games do it, on top of everything a Character already knows
// (sitting, driving, fighting, talking, the ragdoll and getting up, the face).
//
// Body: the MakeHuman base mesh (CC0) below the head, with real anatomy — hands with three bones a finger, feet,
// collarbones, a four-bone spine — skinned with MakeHuman's own weights (assets/hero/body.bin.gz, tools/hero_import.py);
// the MakeHuman head the game already builds sits on it vertex for vertex (the same base mesh: no seam).
// Movement: motion capture of real people (CMU Graphics Lab Motion Capture Database: walks, runs, starts, stops, turns
// and turns on the spot, retargeted by tools/mocaplab.js into assets/hero/moves.bin.gz) played by motion matching
// (heromotion.js) with inertialized transitions (springs.js); the procedural poses of the old character are layered
// on per body part (aiming or a punch in the arms while the legs keep walking), the head and eyes look where they
// look, the fingers curl, and the feet are locked to the ground while the capture has them down.
import * as THREE from 'three';
import { Character, palette, PUPPET } from './characters.js';
import { STYLE } from './style.js';
import { STEADY_BOIL } from './plastilina.js';
import { parseHero } from './herodata.js';
import { parseMoves, MotionDB, MotionPlayer } from './heromotion.js';
import { loadAssetBytes } from './assets.js';
import { dressHero } from './herowear.js';
import { solveTwoBone } from './heroik.js';
import { springDamper } from './springs.js';
import { clamp, lerp, smoothstep } from './util.js';

let HD = null, HDP = null;
async function gunzip(path) {
  const gz = await loadAssetBytes(path);
  if (!gz || typeof DecompressionStream === 'undefined') return null;
  return new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
// the hero's data, once (null if it cannot be had: the old character is used instead)
export function loadHero() {
  if (!HDP) HDP = (async () => {
    try {
      const [b, m] = await Promise.all([gunzip('hero/body.bin.gz'), gunzip('hero/moves.bin.gz')]);
      if (!b || !m) return null;
      HD = { body: parseHero(b), moves: parseMoves(m), db: null };
      // the matching features worked out now, while the town loads (not on the first frame of play)
      await new Promise((r) => setTimeout(r, 0));
      HD.db = new MotionDB(HD.moves, bodyRig(HD.body));
      return HD;
    } catch (e) { console.warn('hero data unavailable', e); return null; }
  })();
  return HDP;
}
// the skeleton the motion database is played on (the body's bones: order, parents, rest offsets)
function bodyRig(body) {
  const order = [], parent = {}, rest = {};
  for (const b of body.bones) { order.push(b.name); parent[b.name] = b.parentName; rest[b.name] = new THREE.Vector3(...b.off); }
  return { order, parent, rest };
}

// the old character's face and hand bones, kept for the procedural code (the face's are skinned by the head build;
// the hand ones only steer the real fingers)
const HEADKIDS = [['jaw', [0, 0.05, -0.005]], ['eyeL', [0.032, 0.075, 0.075]], ['eyeR', [-0.032, 0.075, 0.075]], ['lidL', [0.032, 0.075, 0.075]], ['lidR', [-0.032, 0.075, 0.075]],
  ['browL', [0.03, 0.097, 0.085]], ['browR', [-0.03, 0.097, 0.085]], ['mouthL', [0.0245, 0.0068, 0.095]], ['mouthR', [-0.0245, 0.0068, 0.095]]];
// the bones the capture moves, by body part (for layering)
const ARMS = ['clavL', 'clavR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
const HEADB = ['neck', 'head'];
// actions done with the arms only (the legs go on with the capture)
const ARM_ACTIONS = new Set(['jab', 'cross', 'hookL', 'upper', 'bat', 'push', 'wave', 'shrug', 'point', 'knock', 'cheer', 'clap', 'throw', 'wipe', 'enter']);
const FULL_BASES = new Set(['sit', 'drive', 'lie', 'sitTalk', 'sitFan', 'moto', 'bici', 'dance', 'swim']);

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();
const _e = new THREE.Euler(), _qw = new THREE.Quaternion(), _qpw = new THREE.Quaternion(), _qro = new THREE.Quaternion();
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3(), _h = new THREE.Vector3(), _k = new THREE.Vector3(), _a = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0), _Z = new THREE.Vector3(0, 0, 1), _q0 = new THREE.Quaternion();
const _wa = new THREE.Vector3(), _wb = new THREE.Vector3();
// foot locking (m above the ground under the body): the ball of the foot lifting off (above this it is not held), and
// the lowest the ball and the ankle may go
const TOE_LIFT = 0.06, TOE_MIN = 0.012, ANKLE_MIN = 0.055;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _tq = new THREE.Quaternion(), _tw = new THREE.Quaternion(), _tp = new THREE.Quaternion();
// a bone turned by ang about an axis given in the world (its children with it)
function turnBone(b, axis, ang) {
  if (!b || !b.parent) return;
  _tw.setFromAxisAngle(axis, ang);
  b.parent.getWorldQuaternion(_tp);
  // the new local turn: P⁻¹ · W · P · L
  _tq.copy(_tp).invert().multiply(_tw).multiply(_tp).multiply(b.quaternion);
  b.quaternion.copy(_tq);
}
const _qt = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qu = new THREE.Quaternion(), _ql = new THREE.Quaternion();

export class Hero extends Character {
  get isHero() { return true; }
  // the head-only build the worker makes (the MakeHuman head for the hero's own build and face), at the body's scale
  makeSpec(desc, factory) {
    // (real proportions: the body's own height and head; the haircut the hero wears, not the preset's stylized fringe)
    this.desc = desc = { ...desc, height: 1, headScale: 1, hairStyle: desc.heroHair || desc.hairStyle, fringe: undefined, hem: undefined };
    const s = factory.spec(desc);
    const B = HD.body, m = s.mh;
    m.g = +B.g.toFixed(2); m.age = 24; m.eth = [0, 0, 1]; m.wt = +B.wt.toFixed(2); m.mu = +B.mu.toFixed(2);
    Object.assign(s, { headOnly: true, mhA: [0, 0, 0], S: 1, hk: 1, top: 'hero', bottom: 'hero', bag: false, glasses: null, hat: null, cane: false, watch: false, earrings: false, socks: false });
    s.key = 'hero2|' + [m.g, m.age, m.wt, m.mu, m.seed, m.brow, m.lash, m.hair || '', (m.face || []).join(',')].join('|') + (s.clay ? '|clay' : '');
    return s;
  }
  // the hero's skeleton (body bones from the data, then the old face and hand bones)
  rigBones() {
    const B = HD.body.bones, out = [];
    for (const b of B) out.push({ name: b.name, parent: b.parentName, off: b.off.slice() });
    for (const [n, o] of HEADKIDS) out.push({ name: n, parent: 'head', off: o.slice() });
    const off = (n) => B.find((b) => b.name === n).off.slice();
    for (const sd of ['L', 'R']) {
      out.push({ name: 'fing' + sd, parent: 'hand' + sd, off: off('idx1' + sd) }, { name: 'fing2' + sd, parent: 'fing' + sd, off: off('idx2' + sd) });
      out.push({ name: 'thumb' + sd, parent: 'hand' + sd, off: off('thb1' + sd) }, { name: 'thumb2' + sd, parent: 'thumb' + sd, off: off('thb2' + sd) });
    }
    out.push({ name: 'hair1', parent: 'head', off: [0, 0.165, -0.1] }, { name: 'hair2', parent: 'hair1', off: [0, -0.13, -0.02] });
    out.push({ name: 'pack', parent: 'chest', off: [0, 0.33, -0.1] }); // (the backpack hangs and swings from it, at the shoulders)
    return out;
  }
  attach(shape) {
    if (this.disposed) return;
    this.shape = shape;
    const H = HD.body, B = this.bones, names = this.boneList.map((b) => b.name), bi = Object.fromEntries(names.map((n, i) => [n, i]));
    // the face bones where the head build put them (round its own eyeballs)
    const wb = Object.fromEntries(shape.bones.map((b) => [b.name, b]));
    for (const [n] of HEADKIDS) if (wb[n]) { B[n].position.fromArray(wb[n].off); this.rest[n].copy(B[n].position); }
    // bind pose: the body bones as modelled (their bind rotations), the rest straight
    const bindQ = {}; for (const b of H.bones) bindQ[b.name] = b.q;
    const tmp = new THREE.Object3D(), objs = {};
    for (const b of this.boneList) {
      const o = new THREE.Object3D(); o.position.copy(this.rest[b.name] || b.position);
      if (bindQ[b.name]) o.quaternion.fromArray(bindQ[b.name]);
      (b.parent && objs[b.parent.name] ? objs[b.parent.name] : tmp).add(o);
      objs[b.name] = o;
    }
    tmp.updateMatrixWorld(true);
    const inverses = this.boneList.map((b) => objs[b.name].matrixWorld.clone().invert());
    this.skeleton = new THREE.Skeleton(this.boneList, inverses);
    // the head as the worker built it, moved from its head bone to ours
    const wHead = new THREE.Vector3();
    { let n = 'head'; while (n) { const b = wb[n]; wHead.add(_v.fromArray(b.off)); n = b.parent; } }
    const hHead = new THREE.Vector3(); objs.head.getWorldPosition(hHead);
    const d = hHead.sub(wHead);
    // the clothes, made from the body (herowear.js), and the skin they hide left out
    const J = {}; for (const b of H.bones) { objs[b.name].getWorldPosition(_v); J[b.name] = _v.toArray(); }
    // (the made pieces name bones beyond the body's too: the backpack's — `names` is every bone of the skeleton)
    for (const b of this.boneList) if (!J[b.name]) { objs[b.name].getWorldPosition(_v); J[b.name] = _v.toArray(); }
    const W = dressHero(H, J, H.bones.map((b) => b.name), { pack: !!this.desc.bag || this.desc.accessory === 'mochila', ...(this.desc.outfit || {}) }, names);
    const L = shape.lods[0], A = L.A, nh = L.nv, nb = H.nv;
    const nw = W.parts.reduce((a, p) => a + p.pos.length / 3, 0);
    const N = nb + nw + nh;
    const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3), si = new Uint16Array(N * 4), sw = new Float32Array(N * 4);
    const mat = new Uint8Array(N), reg = new Uint8Array(N), ao = new Uint8Array(N), face = new Int16Array(N * 3), uv = new Uint16Array(N * 2);
    // body
    pos.set(H.pos); nrm.set(H.nrm); sw.set(H.sw);
    for (let i = 0; i < nb * 4; i++) si[i] = bi[H.bones[H.si[i]].name];
    ao.fill(255, 0, nb); // (skin class 0, region 0)
    // clothes
    let o = nb;
    const wearIdx = [];
    for (const p of W.parts) {
      const n = p.pos.length / 3;
      pos.set(p.pos, o * 3); nrm.set(p.nrm, o * 3); sw.set(p.sw, o * 4);
      for (let i = 0; i < n * 4; i++) si[o * 4 + i] = bi[p.bones[p.si[i]]] ?? 0;
      mat.set(p.mat, o); reg.set(p.reg, o); ao.fill(255, o, o + n);
      for (let i = 0; i < p.index.length; i++) wearIdx.push(p.index[i] + o);
      o += n;
    }
    // head
    const h0 = o;
    const hp = A.position.array, hn = A.normal.array, hsi = A.skinIndex.array, hsw = A.skinWeight.array, nk = A.normal.normalized ? 1 / 127 : 1, wk = A.skinWeight.normalized ? 1 / 255 : 1;
    for (let i = 0; i < nh; i++) {
      for (let a = 0; a < 3; a++) { pos[(h0 + i) * 3 + a] = hp[i * 3 + a] + d.getComponent(a); nrm[(h0 + i) * 3 + a] = hn[i * 3 + a] * nk; }
      for (let k = 0; k < 4; k++) { si[(h0 + i) * 4 + k] = bi[shape.bones[hsi[i * 4 + k]].name] ?? bi.head; sw[(h0 + i) * 4 + k] = hsw[i * 4 + k] * wk; }
    }
    mat.set(A.aMat.array, h0); reg.set(A.aReg.array, h0); ao.set(A.aAO.array, h0); face.set(A.aFace.array, h0 * 3); uv.set(A.aUV.array, h0 * 2);
    // the seam: the head's lower edge onto the body's ring (same base vertices): positions, normals and weights
    const ringN = H.ring.length;
    for (let r = 0; r < ringN; r++) {
      const v = H.ring[r], px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
      let best = -1, bd = 9e-6; // (3 mm)
      for (let i = h0; i < N; i++) { if (mat[i] !== 17) continue; const dx = pos[i * 3] - px, dy = pos[i * 3 + 1] - py, dz = pos[i * 3 + 2] - pz, dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = i; } }
      if (best < 0) continue;
      for (let a = 0; a < 3; a++) { pos[best * 3 + a] = pos[v * 3 + a]; nrm[best * 3 + a] = nrm[v * 3 + a]; }
      for (let k = 0; k < 4; k++) { si[best * 4 + k] = si[v * 4 + k]; sw[best * 4 + k] = sw[v * 4 + k]; }
    }
    const keep = [];
    for (let t = 0, k = 0; t < H.index.length; t += 3, k++) if (W.keepTri[k]) keep.push(H.index[t], H.index[t + 1], H.index[t + 2]);
    // two meshes on the one skeleton: the body and its clothes; the head, with the face's expression units as morph
    // targets (MakeHuman's, on its base vertices — the head build keeps each vertex's base position, so they are found)
    const col = new Uint8Array(N * 3);
    const geo = (a, b, idx) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.slice(a * 3, b * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm.slice(a * 3, b * 3), 3));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si.slice(a * 4, b * 4), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw.slice(a * 4, b * 4), 4));
      g.setAttribute('aMat', new THREE.BufferAttribute(mat.slice(a, b), 1));
      g.setAttribute('aReg', new THREE.BufferAttribute(reg.slice(a, b), 1));
      g.setAttribute('aAO', new THREE.BufferAttribute(ao.slice(a, b), 1, true));
      g.setAttribute('aFace', new THREE.BufferAttribute(face.slice(a * 3, b * 3), 3, true));
      g.setAttribute('aUV', new THREE.BufferAttribute(uv.slice(a * 2, b * 2), 2, true));
      g.setAttribute('color', new THREE.BufferAttribute(col.slice(a * 3, b * 3), 3, true));
      g.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx), 1));
      return g;
    };
    const gb = geo(0, h0, keep.concat(wearIdx));
    const gh = geo(h0, N, L.index.array);
    this.exprNames = this.morphHead(gh, H);
    this.heroGeos = [gb, gh]; this.heroRegs = [reg.slice(0, h0), reg.slice(h0, N)];
    this.paint();
    this.mat = this.statue ? this.factory.bronze : this.factory.material(this.desc);
    if (STYLE.plastilina && !this.statue && !this.mat.userData.u.uClayBoil) { this.mat.userData.u.uClayBoil = STEADY_BOIL; this.mat.needsUpdate = true; } // (the protagonist's clay holds still: no boil)
    if (!this.statue) {
      const u = this.mat.userData.u;
      u.uNeckY.value = -10; // (no sculpted neck to fade into)
      u.uFringe.value.set(0, 0, 0, 0); u.uHem.value.set(0, 0, 0, 0);
    }
    this.meshes = [gb, gh].map((g) => {
      const m = new THREE.SkinnedMesh(g, this.mat);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.frustumCulled = false; m.castShadow = this._shadow; m.receiveShadow = true;
      this.object.add(m);
      return m;
    });
    this.headMesh = this.meshes[1];
    this.geos = [gb, gh];
    if (STYLE.plastilina && !this.statue) for (const [n, k] of PUPPET) if (this.bones[n]) this.bones[n].scale.setScalar(k); // (claymation: a puppet)
    this.ready = true;
  }
  // colours by region (skin, garments…) from the person's palette
  paint() {
    const P = palette(this.desc);
    const lut = P.map((c) => [Math.round(Math.pow(c.r, 1 / 2.2) * 255), Math.round(Math.pow(c.g, 1 / 2.2) * 255), Math.round(Math.pow(c.b, 1 / 2.2) * 255)]);
    this.heroGeos.forEach((g, i) => {
      const col = g.attributes.color.array, reg = this.heroRegs[i];
      for (let v = 0; v < reg.length; v++) { const c = lut[reg[v]] || lut[0]; col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; }
      g.attributes.color.needsUpdate = true;
    });
  }
  // the expression units onto the head: each unit's base vertices found among the head's skin vertices by their base
  // position (to a tenth of a millimetre), its offsets set there
  morphHead(g, H) {
    const F = g.attributes.aFace.array, M = g.attributes.aMat.array, n = g.attributes.position.count;
    // (a grid of 0.2 mm cells; a base position is looked for in its cell and the ones round it, the nearest within
    // 0.05 mm taken — with every copy of it: the head has a vertex per texture island at the seams)
    const C = 2e-4, ck = (a, b, c) => a * 73856093 ^ b * 19349663 ^ c * 83492791;
    const at = new Map(), fx = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (M[i] !== 17) continue;
      const x = (F[i * 3] / 32767) * 0.3, y = (F[i * 3 + 1] / 32767) * 0.3, z = (F[i * 3 + 2] / 32767) * 0.3;
      fx[i * 3] = x; fx[i * 3 + 1] = y; fx[i * 3 + 2] = z;
      const k = ck(Math.floor(x / C), Math.floor(y / C), Math.floor(z / C));
      let l = at.get(k); if (!l) at.set(k, (l = [])); l.push(i);
    }
    const find = (p) => {
      const ix = Math.floor(p[0] / C), iy = Math.floor(p[1] / C), iz = Math.floor(p[2] / C), out = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const l = at.get(ck(ix + a, iy + b, iz + c)); if (!l) continue;
        for (const i of l) { const d = Math.hypot(fx[i * 3] - p[0], fx[i * 3 + 1] - p[1], fx[i * 3 + 2] - p[2]); if (d < 5e-5) out.push(i); }
      }
      return out.length ? out : null;
    };
    const names = Object.keys(H.expr), targets = [];
    let found = 0, total = 0;
    for (const nm of names) {
      const e = H.expr[nm], d = new Float32Array(n * 3);
      for (let j = 0; j < e.ids.length; j++) {
        const p = H.exprBase.get(e.ids[j]); total++;
        const l = p && find(p);
        if (!l) continue;
        found++;
        for (const i of l) { d[i * 3] = e.d[j * 3]; d[i * 3 + 1] = e.d[j * 3 + 1]; d[i * 3 + 2] = e.d[j * 3 + 2]; }
      }
      targets.push(new THREE.BufferAttribute(d, 3));
    }
    g.morphAttributes.position = targets;
    g.morphTargetsRelative = true;
    this.exprFound = total ? found / total : 0;
    return names;
  }
  get mesh() { return (this.meshes && this.meshes[0]) || this._dummy || (this._dummy = new THREE.Object3D()); }
  setDistance(d, shadows = true) {
    const sh = shadows && d < 40;
    if (sh === this._shadow) return;
    this._shadow = sh;
    if (this.meshes) for (const m of this.meshes) m.castShadow = sh;
  }
  cullSphere() {}
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.factory.live.delete(this);
    if (this.meshes) { for (const m of this.meshes) this.object.remove(m); for (const g of this.heroGeos) g.dispose(); if (!this.statue) this.factory.releaseMaterial(this.mat); this.meshes = null; }
  }

  // ------------------------------------------------------------------ movement
  // opts as Character.update, plus opts.mm: { vel: [side, fwd] now, goal: [side, fwd] wanted (m/s, character frame),
  // acc: [side, fwd], turn: rad still to turn, yawVel: rad/s, halfLife, turnHalfLife } from the player's controller
  update(dt, speed, opts = {}) {
    if (!this.ready || !HD) return super.update(dt, speed, opts);
    if (!HD.db) HD.db = new MotionDB(HD.moves, bodyRig(HD.body));
    if (!this.mp) this.mp = new MotionPlayer(HD.db);
    const B = this.bones;
    // the procedural character (still, no stride: its idle, bases, actions, jump, face, hands, hair) — its result is
    // on the bones; keep it per bone to layer the capture under it
    super.update(dt, 0, { ...opts, turn: 0, fidget: false });
    if (this.rag || this.gu) return; // (the ragdoll and getting up are the procedural character's alone)
    const proc = this._proc || (this._proc = {}), procHips = this._procHips || (this._procHips = new THREE.Vector3());
    for (const n of HD.db.bones) (proc[n] || (proc[n] = new THREE.Quaternion())).copy(B[n].quaternion);
    procHips.copy(B.hips.position);
    // the capture
    const mm = opts.mm || this.ctrlFrom(speed, opts, dt);
    this.simSpeed = speed; this.simVel = mm.vel;
    const pose = this.mp.update(dt, mm);
    // how much of each part is the procedural pose: whole bases (seated, lying, on a bike, dancing), the air, crouching;
    // the arms for upper-body bases (aiming, phone, talking with the hands…) and arm actions
    const grounded = opts.grounded !== false;
    this.airK = lerp(this.airK || 0, grounded ? 0 : 1, 1 - Math.exp(-(grounded ? 10 : 14) * dt));
    const fullBase = this.base && FULL_BASES.has(this.base) ? this.baseW : 0;
    const crouch = this.crouchK || 0;
    let wAll = Math.max(fullBase, this.airK, crouch);
    let wArms = this.base && !FULL_BASES.has(this.base) ? this.baseW : 0;
    if (this.action) {
      const u = this.actionT / this.actionDur, e = smoothstep(0, 0.12, u) * (1 - smoothstep(0.82, 1, u));
      if (ARM_ACTIONS.has(this.action)) wArms = Math.max(wArms, e); else wAll = Math.max(wAll, e);
    }
    const db = HD.db;
    for (let i = 0; i < db.nb; i++) {
      const n = db.bones[i], b = B[n], cap = pose[i];
      let w = wAll;
      if (ARMS.includes(n)) w = Math.max(w, wArms);
      if (HEADB.includes(n)) {
        // the head and neck: the capture's, turned further by where the procedural head looks
        b.quaternion.copy(cap).multiply(proc[n]);
        if (w > 0) b.quaternion.slerp(proc[n], w);
        continue;
      }
      if (n === 'hips') {
        // (the capture's hips are relative to the root's heading: the object carries the heading)
        b.quaternion.copy(cap);
      } else b.quaternion.copy(cap);
      if (w > 0) b.quaternion.slerp(proc[n], w);
    }
    B.hips.position.copy(this.mp.hips).lerp(procHips, wAll);
    // a trainer's sole is stiff: the toes bend with it about half as far as a bare foot's (the capture is barefoot-ish)
    B.toeL.quaternion.slerp(_q0, 0.5); B.toeR.quaternion.slerp(_q0, 0.5);
    // the real fingers follow the old hand bones (the proximal joints with the hand's curl, the others with the tip's)
    this.fingers();
    this.shoulders();
    // breath and effort: after a sprint the chest heaves and the shoulders with it for a few seconds
    const sp = speed || 0;
    this.exert = clamp((this.exert || 0) + dt * (sp > 4.5 ? 0.22 : sp > 2.8 ? 0.06 : -0.12), 0, 1);
    this.breathT = (this.breathT || 0) + dt * (1.6 + 2.2 * this.exert) * Math.PI;
    const br = Math.sin(this.breathT) * (0.012 + 0.045 * this.exert);
    B.chest.quaternion.multiply(_q.setFromAxisAngle(_X, -br));
    B.clavL.quaternion.multiply(_q.setFromAxisAngle(_Z, br * 0.6)); B.clavR.quaternion.multiply(_q.setFromAxisAngle(_Z, -br * 0.6));
    this.faceMorphs(dt);
    // the backpack: a soft load hanging from the shoulders, swinging behind the body's motion — a spring with a little
    // bounce, pushed by the body's speeding up and slowing down, its rise and fall at each step, and its turns
    if (B.pack) {
      const pk = this.packS || (this.packS = { x: 0, vx: 0, z: 0, vz: 0, y: 0, vy: 0 });
      const idt = 1 / Math.max(dt, 1e-3), acc = (sp - (this._spPrev ?? sp)) * idt, hy = B.hips.position.y, hv = (hy - (this._hy ?? hy)) * idt;
      this._spPrev = sp; this._hy = hy;
      const tx = clamp(-acc * 0.015 + Math.abs(hv) * 0.02, -0.12, 0.12), tz = clamp(-(opts.turn || 0) * 0.04 * Math.min(1, sp / 2), -0.15, 0.15); // (it rides against the back: small swings)
      const k = 140, c = 11, h = Math.min(dt, 1 / 30);
      pk.vx += (k * (tx - pk.x) - c * pk.vx) * h; pk.x += pk.vx * h;
      pk.vz += (k * (tz - pk.z) - c * pk.vz) * h; pk.z += pk.vz * h;
      pk.vy += (k * 1.6 * (clamp(-hv * 0.012, -0.015, 0.015) - pk.y) - c * pk.vy) * h; pk.y += pk.vy * h;
      B.pack.rotation.set(pk.x, 0, pk.z); B.pack.position.copy(this.rest.pack); B.pack.position.y += pk.y;
      B.pack.scale.setScalar(this.base === 'swim' ? 1e-3 : 1); // (the backpack stays on the deck while you swim)
    }
    // (the feet are locked once the body has been put where it goes this frame: afterMove)
    this.lockW = grounded ? 1 - wAll : 0;
    this.dt = dt;
  }
  // Foot locking: called once the character's object has been placed for the frame (player.syncChar). While the
  // capture has a foot down, the ball of that foot stays where it touched the ground — whatever small difference there
  // is between the animation's pace and the body's, or a turn — and the leg is solved (two bones, the knee kept in the
  // plane it was animated in) to reach it; when the foot lifts, it eases back into the animation.
  //  - only along the ground: the height is the capture's (a heel strike lands with the ball up; held up there, the
  //    foot would hover through the whole step), and never under the ground (a lean tilts the stride)
  //  - once a step: a lock let go (the ball lifting, or dragged too far) is not taken again until the next footfall —
  //    taken again at once, the foot would jump from where it was held to where the capture has it
  //  - eased in and out with a smoothstep (no kink in the foot's speed where the lock starts or ends)
  afterMove() {
    if (!this.ready || !this.mp || this.rag || this.gu || !HD) return;
    const B = this.bones, dt = this.dt || 1 / 60, w = this.lockW || 0;
    const mk = () => ({ on: false, w: 0, pos: new THREE.Vector3(), armed: false, was: false, h: 0 });
    const L = this.locks || (this.locks = { L: mk(), R: mk() });
    if (w < 0.01) { for (const lk of [L.L, L.R]) { lk.on = lk.armed = lk.was = false; lk.w = 0; } if (this.owS) this.owS.x = this.owS.v = 0; return; }
    this.object.updateMatrixWorld(true);
    const gy = this.object.position.y;
    const mp = this.mp, f0 = mp.frame, db = mp.db, va = Math.hypot(db.vel[f0 * 2], db.vel[f0 * 2 + 1]) * mp.rate, vs = this.simSpeed || 0;
    // orientation warping (as Unreal's locomotion does it): the capture runs the way its body faces, the body may be
    // going somewhat another way (cutting from side to side, the run swung round by the camera) — the legs are turned
    // to run where the body really goes, the spine turned back so the chest and head still face ahead (up to ~35°;
    // nothing for a body going the other way from the capture's)
    const sv = this.simVel, ow = this.owS || (this.owS = { x: 0, v: 0 });
    let th = 0;
    if (sv && va > 0.5) {
      const ss = Math.hypot(sv[0], sv[1]), a = wrapA(Math.atan2(sv[0], sv[1]) - Math.atan2(db.vel[f0 * 2 + 1], db.vel[f0 * 2]));
      if (ss > 1) th = clamp(a, -0.6, 0.6) * smoothstep(1.2, 2.6, ss) * smoothstep(1.9, 1.3, Math.abs(a));
    }
    springDamper(ow, th * w, 0.08, dt);
    if (Math.abs(ow.x) > 0.004) {
      const up = _wa.set(0, 1, 0).applyQuaternion(this.object.quaternion);
      turnBone(B.hips, up, ow.x);
      turnBone(B.spine, up, -ow.x * 0.35); turnBone(B.spine2, up, -ow.x * 0.35); turnBone(B.chest, up, -ow.x * 0.3);
      B.hips.updateMatrixWorld(true);
    }
    // stride warping: a body going faster than the capture it plays (a sprint beyond the fastest run captured) takes
    // longer strides — each foot's reach ahead of and behind the hips stretched along the way it goes, the hips a
    // little lower to make the reach (the feet kept at the capture's height: lower legs, not feet in the ground)
    const warp = va > 1.5 && vs > va ? Math.min(1.35, vs / va) : 1;
    this.warpK = lerp(this.warpK || 1, warp, Math.min(1, dt * 5));
    if (this.warpK > 1.01) {
      const k = this.warpK - 1, sy = this.object.rotation.y + ow.x; // (along the legs' own way)
      const hp = B.hips.getWorldPosition(_t1), fw = _t2.set(Math.sin(sy), 0, Math.cos(sy));
      const aL = B.footL.getWorldPosition(_wa), aR = B.footR.getWorldPosition(_wb);
      const dL = (aL.x - hp.x) * fw.x + (aL.z - hp.z) * fw.z, dR = (aR.x - hp.x) * fw.x + (aR.z - hp.z) * fw.z;
      B.hips.position.y -= 0.05 * k;
      B.hips.updateMatrixWorld(true);
      this.legIK('L', aL.addScaledVector(fw, dL * k * w));
      this.legIK('R', aR.addScaledVector(fw, dR * k * w));
    }
    // (the lean tilts the whole body about the root, feet and all: a foot's height above the ground is taken in the
    // body's own frame — the capture's — and the foot is put back at it, so the body leans over feet still on the ground)
    _m.copy(this.object.matrixWorld).invert();
    const sc = this.object.scale.y;
    for (const s of ['L', 'R']) {
      const lk = L[s], contact = s === 'L' ? mp.contactL : mp.contactR;
      const toe = B['toe' + s].getWorldPosition(_t1), ank = B['foot' + s].getWorldPosition(_t2);
      const h = (lk.h = _wa.copy(toe).applyMatrix4(_m).y * sc), ha = _wb.copy(ank).applyMatrix4(_m).y * sc;
      if (contact && !lk.was) lk.armed = true; // (a footfall: this foot may be locked once)
      if (!contact) lk.armed = false;
      lk.was = contact;
      if (lk.armed && !lk.on && lk.w < 0.1 && h < TOE_LIFT) { lk.on = true; lk.armed = false; lk.pos.copy(toe); }
      if (lk.on && (!contact || h > TOE_LIFT + 0.02 || Math.hypot(toe.x - lk.pos.x, toe.z - lk.pos.z) > 0.3)) lk.on = false;
      lk.w = lk.on ? Math.min(1, lk.w + dt * 16) : Math.max(0, lk.w - dt * 7);
      const k = lk.w * lk.w * (3 - 2 * lk.w) * w;
      // where the ankle must go: the ball of the foot held on its spot (as much as k), the foot keeping its own angle,
      // at the capture's height, and lifted if the toe or the heel would be under the ground
      const dy = Math.max((gy + h - toe.y + gy + ha - ank.y) * 0.5, gy + TOE_MIN - toe.y, gy + ANKLE_MIN - ank.y);
      _t3.set((lk.pos.x - toe.x) * k, dy * w, (lk.pos.z - toe.z) * k);
      if (_t3.lengthSq() < 1e-8) continue;
      this.legIK(s, _t4.copy(ank).add(_t3));
    }
    this.steadyHead();
  }
  // Leaning into a run (the player's controller tilts the whole body at the feet: into a turn, forwards when speeding
  // up and in a sprint) the eyes stay level, as a runner's do — most of the tilt is taken back at the neck. leanP and
  // leanR: the lean (rad) about the body's own right and forward axes.
  steadyHead() {
    const lp = this.leanP || 0, lr = this.leanR || 0;
    if (Math.abs(lp) + Math.abs(lr) < 1e-4) return;
    const neck = this.bones.neck; if (!neck || !neck.parent) return;
    // the correction about the body's own axes, as a turn in the world: W = R · C · R⁻¹ (R the body's own turn)
    this.object.getWorldQuaternion(_qro);
    _q.setFromEuler(_e.set(-lp * 0.65, 0, -lr * 0.7, 'YXZ'));
    _qw.copy(_qro).multiply(_q).multiply(_q2.copy(_qro).invert());
    // the neck's new local turn: P⁻¹ · W · P · L (P its parent's world turn)
    neck.parent.getWorldQuaternion(_qpw);
    _q.copy(_qpw).invert().multiply(_qw).multiply(_qpw).multiply(neck.quaternion);
    neck.quaternion.copy(_q);
  }
  // two-bone IK on one leg towards an ankle position (world), keeping the foot's world rotation
  legIK(s, target) {
    const B = this.bones, th = B['thigh' + s], sh = B['shin' + s], ft = B['foot' + s];
    const H = th.getWorldPosition(_h), K = sh.getWorldPosition(_k), A = ft.getWorldPosition(_a);
    const qt = th.getWorldQuaternion(_qt), qs = sh.getWorldQuaternion(_qs), qf = ft.getWorldQuaternion(_qf), qp = th.parent.getWorldQuaternion(_qp);
    solveTwoBone(H, K, A, target, _qu, _ql);
    // new world rotations: the whole leg turned about the hip, the shin also bent about the knee
    _q.copy(_qu).multiply(qt);                    // thigh
    _q2.copy(_qu).multiply(_ql).multiply(qs);     // shin
    th.quaternion.copy(qp).invert().multiply(_q);
    sh.quaternion.copy(_q).invert().multiply(_q2);
    ft.quaternion.copy(_q2).invert().multiply(qf); // (the foot as it was in the world)
    th.updateMatrixWorld(true);
  }
  // the face's expression units from the procedural face (characters.js FACES: brows, smile, squint, jaw — the bones
  // still carry the brows, lids and jaw; the units add what bones cannot: cheeks raised in a real smile, the lip
  // corners pulled down, the nose wrinkled, lips rounded and parted in speech), effort, and a face never quite still
  faceMorphs(dt) {
    const m = this.headMesh; if (!m || !m.morphTargetInfluences) return;
    const I = m.morphTargetInfluences, idx = this.exprIdx || (this.exprIdx = Object.fromEntries(this.exprNames.map((n, i) => [n, i])));
    const F = this.faceCur || { lift: 0, knit: 0, smile: 0, wide: 0, squint: 0, jaw: 0 };
    const want = this._ew || (this._ew = new Float32Array(I.length));
    want.fill(0);
    const set = (n, v) => { const i = idx[n]; if (i !== undefined) want[i] = Math.max(want[i], clamp(v, 0, 1)); };
    const smile = Math.max(0, F.smile) / 0.0042, frown = Math.max(0, -F.smile) / 0.0024, knit = Math.max(0, F.knit) / 0.26, sq = Math.max(0, F.squint) / 0.3, wide = Math.max(0, -F.squint) / 0.08;
    // (a friendly rest: the corners a hair up; the face drifts a little, as no face holds still)
    this.faceT = (this.faceT || 0) + dt;
    const drift = 0.06 + 0.05 * Math.sin(this.faceT * 0.37 + 1.3) * Math.sin(this.faceT * 0.19);
    set('mouth-corner-puller', drift + smile * 0.85);
    set('mouth-upward-retraction', smile * 0.2);
    set('eye-left-slit', smile * 0.4 + sq * 0.6); set('eye-right-slit', smile * 0.4 + sq * 0.6);
    set('mouth-depression', frown * 0.8);
    set('mouth-depression-retraction', frown * 0.25 + knit * 0.15);
    set('nose-compression', knit * 0.7);
    set('mouth-compression', knit * 0.5);
    set('nose-left-elevation', knit * 0.35 + sq * 0.25); set('nose-right-elevation', knit * 0.35 + sq * 0.25);
    set('eye-left-opened-up', wide * 0.8); set('eye-right-opened-up', wide * 0.8);
    // speech: the lips part on each syllable and round on some (the jaw bone opens with them)
    const ta = this.talkAmt || 0;
    if (ta > 0.01) {
      const syl = Math.max(0, Math.sin(this.t * 13.0) * Math.sin(this.t * 4.7 + 1.3)), rnd = Math.max(0, Math.sin(this.t * 5.3 + this.seed));
      set('mouth-parling', ta * (0.25 + 0.5 * syl)); set('mouth-pursing', ta * rnd * 0.45); set('mouth-open', ta * syl * 0.25);
    }
    // effort: out of breath after running, mouth open, nostrils wide
    const ex = this.exert || 0;
    if (ex > 0.02) {
      const br = 0.5 + 0.5 * Math.sin(this.breathT || 0);
      set('mouth-parling', ex * (0.35 + 0.25 * br)); set('mouth-open', ex * 0.25 * br);
      set('nose-left-dilatation', ex * (0.3 + 0.4 * br)); set('nose-right-dilatation', ex * (0.3 + 0.4 * br));
    }
    const k = 1 - Math.exp(-dt * 12);
    for (let i = 0; i < I.length; i++) I[i] += (want[i] - I[i]) * k;
  }
  // Scapulohumeral rhythm: a real arm is raised or lowered two parts at the shoulder joint to one of the shoulder
  // girdle (the collarbone and the shoulder blade turning with it). The capture's collarbones never move, so the whole
  // turn would be at the joint — and the skin there, bound with the arm out at 45°, bunches up into a square shoulder
  // when the arm hangs. A third of the arm's lift or drop from that bind angle goes to the collarbone instead (its tip
  // drops when the arm hangs), the arm turned back by as much so the hand ends where it was.
  shoulders() {
    const B = this.bones;
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const arm = B['arm' + s], clav = B['clav' + s];
      // the arm's direction in the collarbone's frame: how far it is raised out to the side (0 hanging, π/2 level)
      _v.set(0, -1, 0).applyQuaternion(arm.quaternion);
      const abd = Math.atan2(sg * _v.x, -_v.y); // (outwards positive)
      const bind = 0.72, k = clamp((abd - bind) / 2.4, -0.42, 0.35); // (two fifths of the way from the bind angle: hanging arms let the shoulders slope)
      _q.setFromAxisAngle(_Z, sg * k);
      clav.quaternion.multiply(_q);
      arm.quaternion.premultiply(_q.invert());
    }
  }
  // a controller for the capture when the caller gives none (pedestrians, cutscenes): straight on at this speed
  ctrlFrom(speed, opts, dt) {
    const c = this._ctrl || (this._ctrl = { vel: [0, 0], goal: [0, 0], acc: [0, 0], turn: 0, yawVel: 0, halfLife: 0.25, turnHalfLife: 0.2 });
    const md = opts.moveDir || 0;
    c.goal[0] = Math.sin(md) * speed; c.goal[1] = Math.cos(md) * speed;
    c.vel[0] = c.goal[0]; c.vel[1] = c.goal[1];
    c.turn = opts.turn || 0;
    return c;
  }
  fingers() {
    const B = this.bones;
    for (const sd of ['L', 'R']) {
      const f1 = B['fing' + sd].quaternion, f2 = B['fing2' + sd].quaternion, t1 = B['thumb' + sd].quaternion, t2 = B['thumb2' + sd].quaternion;
      const k = [['idx', 0.92], ['mid', 1.0], ['rng', 1.06], ['pnk', 1.12]];
      for (const [fn, s] of k) {
        B[fn + '1' + sd].quaternion.identity().slerp(f1, s);
        B[fn + '2' + sd].quaternion.identity().slerp(f2, s * 0.95);
        B[fn + '3' + sd].quaternion.identity().slerp(f2, s * 0.7);
      }
      B['thb1' + sd].quaternion.copy(t1); B['thb2' + sd].quaternion.copy(t2); B['thb3' + sd].quaternion.identity().slerp(t2, 0.75);
    }
  }
}

// the factory makes heroes of descriptors that ask for one, once the data has come
export function installHero(factory) { factory.heroClass = Hero; }
Hero.ready = () => !!HD;
