// Solid walls lab: does the camera ever end up inside a house, or see into one? The player is stood against the town's
// walls — the middle of a façade and its corners, on the pavement, half a metre off the wall — and the camera is turned
// right round them, slowly, as a player turns it with the mouse, at three heights. Every frame: is the camera inside a
// house (its footprint, below its roof)? is a corner of the picture (the near plane) inside one? does the line from the
// player's head to the camera go through a wall? And photographs of the joints between houses.
//   const SL = await import('/tools/solidezlab.js?' + Date.now());
//   await SL.camAudit({ n: 150 })     // → { frames, inside, edge, through, worst: [...] }
//   await SL.shotAt(x, z, heading, { name: 'sl_01' })   // → .snaps/sl_01.jpg (street level, looking along heading°)
import { PolyIndex } from '/src/collision.js';

const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
function pip(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the houses as drawn: footprint and how high (to the ridge)
function solids() {
  const G = window.game, M = G.map, { x0, z0, x1, z1 } = M.bounds;
  const ix = new PolyIndex(x0 - 400, z0 - 400, x1 + 400, z1 + 400, 16);
  for (const p of G.world.buildingParts || []) {
    const top = p.top || p.H + (p.roofKind === 'hip' ? 1.6 : p.roofKind === 'lip' ? 0.8 : 0.8);
    ix.add(p.ring, { p, top });
  }
  const at = (x, y, z, pad = 0) => {
    const c = [];
    if (ix.query) ix.query(x - 1e-3, z - 1e-3, x + 1e-3, z + 1e-3, c);
    else { const q = ix.find(x, z); if (q) c.push(q); }
    for (const q of c) {
      const d = q.data;
      if (y > d.top + pad) continue;
      if (!pip(x, z, d.p.ring)) continue;
      if (d.p.holes && d.p.holes.some((h) => pip(x, z, h))) continue;
      return d.p;
    }
    return null;
  };
  return { at };
}

// the near plane's corners of the camera as it stands
function nearCorners(cam, out) {
  const e = cam.matrixWorld.elements, n = cam.near, hh = n * Math.tan((cam.fov * Math.PI) / 360), hw = hh * cam.aspect;
  const px = e[12], py = e[13], pz = e[14];
  const rx = e[0], ry = e[1], rz = e[2], ux = e[4], uy = e[5], uz = e[6], fx = -e[8], fy = -e[9], fz = -e[10];
  out.length = 0;
  for (const a of [-1, 1]) for (const b of [-1, 1]) out.push([px + fx * n + rx * hw * a + ux * hh * b, py + fy * n + ry * hw * a + uy * hh * b, pz + fz * n + rz * hw * a + uz * hh * b]);
  return out;
}

// where to stand: against façades (their middle and their ends), on the pavement
export function standPoints(n = 150, seed = 7) {
  const G = window.game, runs = (G.world.facadeRuns || []).filter((r) => Math.hypot(r.bx - r.ax, r.bz - r.az) > 3 && G.map.inTown((r.ax + r.bx) / 2, (r.az + r.bz) / 2));
  const R = rng(seed), out = [];
  for (let k = 0; k < n && runs.length; k++) {
    const r = runs[Math.floor(R() * runs.length)], L = Math.hypot(r.bx - r.ax, r.bz - r.az), tx = (r.bx - r.ax) / L, tz = (r.bz - r.az) / L;
    const where = R(), s = where < 0.34 ? 0.7 : where < 0.67 ? L - 0.7 : L * (0.2 + R() * 0.6);
    out.push({ x: r.ax + tx * s + r.nx * 0.55, z: r.az + tz * s + r.nz * 0.55, h: Math.atan2(tx, tz) + (R() < 0.5 ? 0 : Math.PI) });
  }
  return out;
}

// turn the camera right round the player at each point: count what it should never do
export async function camAudit({ n = 150, seed = 7, pitches = [-0.55, -0.15, 0.3], step = 0.06, frames = 0 } = {}) {
  const G = window.game, cam = G.cam, camera = G.camera, P = G.player, S = solids();
  if (P.vehicle) P.exitVehicle(true);
  const input = { look: () => [0, 0], mouse: { wheel: 0 }, lookBack: false, keys: {} };
  const pts = standPoints(n, seed);
  let total = 0, inside = 0, edge = 0, through = 0, nearSum = 0;
  const worst = [], corners = [];
  const col = () => G.map.collider;
  for (let pi = 0; pi < pts.length; pi++) {
    const q = pts[pi];
    if (S.at(q.x, 1, q.z)) continue; // (a point inside a house: not a pavement)
    P.spawnAt(q.x, q.z, q.h);
    P.vel.set(0, 0, 0);
    let bad = 0;
    for (const pitch of pitches) {
      cam.yaw = q.h + Math.PI; cam.pitch = pitch;
      cam.tgtS = null; cam.shiftS = null; cam.pullS = null; cam.footDist = undefined; cam.lookV = null;
      for (let k = 0; k < 20; k++) cam.update(1 / 30, input); // (settle)
      const nF = frames || Math.ceil((Math.PI * 2) / step);
      for (let f = 0; f < nF; f++) {
        cam.yaw += step; cam.pitch = pitch;
        cam.update(1 / 30, input);
        camera.updateMatrixWorld(true);
        total++;
        const c = camera.position, t = cam.target;
        let flag = '';
        if (S.at(c.x, c.y, c.z)) { inside++; flag = 'dentro'; }
        else {
          nearCorners(camera, corners);
          if (corners.some((k) => S.at(k[0], k[1], k[2]))) { edge++; flag = 'borde'; }
        }
        if (col().raycast(t.x, t.z, c.x, c.z, t.y, c.y) < 0.999) { through++; flag = flag || 'atraviesa'; }
        nearSum += Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z);
        if (flag) bad++;
        if (flag && worst.length < 400) worst.push({ pi, x: +q.x.toFixed(1), z: +q.z.toFixed(1), yaw: +cam.yaw.toFixed(2), pitch, flag, cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] });
      }
    }
    if (pi % 10 === 9) await yieldNow();
  }
  return { points: pts.length, frames: total, inside, edge, through, meanDist: +(nearSum / Math.max(1, total)).toFixed(2), badPoints: new Set(worst.map((w) => w.pi)).size, worst: worst.slice(0, 60) };
}

// a photograph from street level: the camera at (x, eye, z) looking along heading° (0 north, 90 east), level or as asked
export async function shotAt(x, z, heading, o = {}) {
  const G = window.game, r = G.renderer, w = o.w || 1280, h = o.h || 800, c = G.camera;
  if (G.player.vehicle) G.player.exitVehicle(true);
  G.player.spawnAt(o.px ?? x, o.pz ?? z, 0);
  if (o.hour != null) G.sky.hour = o.hour;
  const step = (k) => { for (let i = 0; i < k; i++) { if (G.state !== 'play') { G.state = 'play'; const pp = document.getElementById('pause'); if (pp) pp.hidden = true; } G.frame(1 / 30); } };
  step(o.warm ?? 40);
  r.setSize(w, h, false);
  if (G.composer) { G.composer.setSize(w, h); if (G.bloom) G.bloom.setSize(w, h); }
  c.aspect = w / h;
  const ch = G.player.char, body = ch && (ch.root || ch.group || ch.object);
  if (body && o.hideBody !== false) body.visible = false;
  const pose = () => {
    const hd = (heading * Math.PI) / 180, up = ((o.up ?? 0) * Math.PI) / 180;
    c.fov = o.fov ?? 60;
    c.position.set(x, o.eye ?? 1.7, z);
    if (o.look) c.lookAt(o.look[0], o.look[1], o.look[2]);
    else c.lookAt(x + Math.sin(hd) * Math.cos(up), c.position.y + Math.sin(up), z - Math.cos(hd) * Math.cos(up));
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  };
  const pr0 = r.getPixelRatio();
  const size = () => { r.setPixelRatio(1); r.setSize(w, h, false); if (G.composer) { G.composer.setSize(w, h); if (G.bloom) G.bloom.setSize(w, h); } c.aspect = w / h; };
  for (let k = 0; k < 4; k++) { step(1); size(); pose(); G.sky.update(0, c.position); G.render(); } // (a hidden tab resizes the canvas to nothing on every frame)
  const cv = r.domElement, out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height; out.getContext('2d').drawImage(cv, 0, 0);
  r.setPixelRatio(pr0);
  if (body) body.visible = true;
  await fetch('/__snap?name=' + (o.name || 'sl_shot'), { method: 'POST', body: out.toDataURL('image/jpeg', 0.88) });
  return { x, z, heading };
}
// several, the town built once; then the window size back
export async function shots(list, o = {}) {
  for (const s of list) { await shotAt(s.x, s.z, s.heading, { ...o, ...s }); await yieldNow(); }
  window.game.resize();
  return list.length;
}

// The town's pavements, metre by metre: on every street in town, each side, how wide the pavement is from its kerb to
// the first wall — none (a house over the kerb), a strip (under 0.5 m), narrow (under 0.9 m), or one to walk on; and,
// apart, the sides that have none by design (kerbs.js: a street with its pavement on the other side, a single
// platform). And where the pedestrians' walking line falls: inside a wall, on the pavement, on a single platform (along
// the fronts) or in the carriageway. junctions: false leaves out the corners (where the kerbs stop). Self-contained
// against the old build too (no kerbs: the kerb at half the carriageway).
export function pavAudit({ step = 1, junctions = true } = {}) {
  const G = window.game, M = G.map, col = M.collider, t = {}, q2 = {};
  const S = () => ({ m: 0, none: 0, strip: 0, narrow: 0, ok: 0, oneSide: 0, platform: 0 });
  const out = { all: S(), measured: S(), other: S(), walkers: { m: 0, inWall: 0, byProp: 0, onPavement: 0, onPlatform: 0, inRoad: 0 } };
  // (a wall: one as tall as a person, within a shoulder's width — the pavement is measured to those; what is lower or
  // round, a garden wall, a lamp post, a tree, a bin, they step round)
  const wallNear = (x, z, r) => {
    if (M.buildingAt(x, z)) return true;
    let hit = false;
    const Sg = col.segs;
    col.forSegs(x - r, z - r, x + r, z + r, (i, o) => {
      if (Sg[o + 4] < 1.2) return false;
      const ax = Sg[o], az = Sg[o + 1], dx = Sg[o + 2] - ax, dz = Sg[o + 3] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) hit = true;
      return false;
    });
    return hit;
  };
  const peds = G.peds;
  const kerb = (e, s, side) => (M.kerbAt ? M.kerbAt(e, s, side) : e.w / 2);
  const pav = (e, s, side) => { // kerb to the first wall within 9 m, or null
    if (e.kerb) return M.pavementAt(e, s, side);
    polyAt(e, s, t);
    const hw = e.w / 2, nx = -t.dz * side, nz = t.dx * side, a = hw - 0.4, R = 9;
    const k = col.raycast(t.x + nx * a, t.z + nz * a, t.x + nx * (hw + R), t.z + nz * (hw + R), 1.2, 1.2);
    return k >= 1 ? null : a + k * (R + 0.4) - hw;
  };
  for (const e of M.edges) {
    if (!e.drive || e.dirt || e.cls === 'track' || e.walkOnly || e.len < 4) continue;
    const mid = polyAt(e, e.len / 2, {});
    if (!M.inTown(mid.x, mid.z)) continue;
    const na = M.nodes[e.a], nb = M.nodes[e.b];
    const ja = !junctions && na.degree >= 3 ? na.radius + 1.2 : 0, jb = !junctions && nb.degree >= 3 ? e.len - nb.radius - 1.2 : e.len;
    const kb = e.kerb;
    for (let s = 1.5; s < e.len - 1.5; s += step) {
      if (s < ja || s > jb) continue;
      polyAt(e, s, t);
      for (const side of [1, -1]) {
        const design = kb && (kb.regime === 2 ? 'platform' : kb.regime === 1 && kb.side !== side ? 'oneSide' : null);
        const p = pav(e, s, side);
        if (p == null && !design) continue;
        for (const k of ['all', e.measured ? 'measured' : 'other']) {
          const o = out[k]; o.m++;
          if (design) o[design]++;
          else if (p < 0) o.none++; else if (p < 0.5) o.strip++; else if (p < 0.9) o.narrow++; else o.ok++;
        }
        if (peds && peds.sidePoint && !(kb && kb.regime === 1 && kb.side !== side)) {
          const q = peds.sidePoint(e, s, side, q2), W = out.walkers;
          W.m++;
          const pp = { x: q.x, z: q.z };
          const off = (q.x - t.x) * -t.dz * side + (q.z - t.z) * t.dx * side; // (out from the line, that side)
          if (wallNear(q.x, q.z, 0.25)) W.inWall++;
          else if (kb && kb.regime === 2) W.onPlatform++;
          else if (off < kerb(e, s, side)) W.inRoad++;
          else { W.onPavement++; if (col.resolveCircle(pp, 0.25).hit) W.byProp++; }
        }
      }
    }
  }
  const pc = (o) => (o.m ? { metres: o.m, sinAcera: +(100 * o.none / o.m).toFixed(1), tira: +(100 * o.strip / o.m).toFixed(1), estrecha: +(100 * o.narrow / o.m).toFixed(1), buena: +(100 * o.ok / o.m).toFixed(1), aceraAlOtroLado: +(100 * o.oneSide / o.m).toFixed(1), plataformaUnica: +(100 * o.platform / o.m).toFixed(1) } : o);
  const W = out.walkers;
  return { todas: pc(out.all), medidas: pc(out.measured), resto: pc(out.other), peatones: W.m ? { puntos: W.m, enMuro: +(100 * W.inWall / W.m).toFixed(2), enAcera: +(100 * W.onPavement / W.m).toFixed(1), deEllosJuntoAMobiliario: +(100 * W.byProp / W.m).toFixed(1), enPlataforma: +(100 * W.onPlatform / W.m).toFixed(1), enCalzada: +(100 * W.inRoad / W.m).toFixed(2) } : null };
}
function polyAt(e, s, out) {
  const p = e.pts, c = e.cum;
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  const ax = p[(i - 1) * 2], az = p[(i - 1) * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1], L = Math.hypot(bx - ax, bz - az) || 1;
  out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.dx = (bx - ax) / L; out.dz = (bz - az) / L;
  return out;
}

// Watch the camera through real play (tools/playtest.js walk / drive): after every frame, the same three checks as
// camAudit; with spin, the camera is also turned (rad a frame) as a player turning it with the mouse while walking.
//   SL.watch({ spin: 0.03 }); await T.run('walk', 60); SL.watch(false) → the counts
export function watch(o = {}) {
  const G = window.game;
  if (o === false) {
    if (G._frameOrig) { G.frame = G._frameOrig; G._frameOrig = null; }
    const r = G._camWatch; G._camWatch = null;
    return r;
  }
  if (G._frameOrig) G.frame = G._frameOrig;
  const S = solids(), corners = [], W = (G._camWatch = { frames: 0, inside: 0, edge: 0, through: 0, ex: [] });
  const orig = (G._frameOrig = G.frame);
  G.frame = function (dt) {
    if (o.spin && G.cam && !G.player.vehicle) G.cam.yaw += o.spin;
    const r = orig.call(this, dt);
    const c = G.camera, t = G.cam.target;
    if (G.state !== 'play' || G.interior || G.cam.fp) return r;
    c.updateMatrixWorld(true);
    W.frames++;
    let flag = '';
    if (S.at(c.position.x, c.position.y, c.position.z)) { W.inside++; flag = 'dentro'; }
    else { nearCorners(c, corners); if (corners.some((k) => S.at(k[0], k[1], k[2]))) { W.edge++; flag = 'borde'; } }
    if (G.map.collider.raycast(t.x, t.z, c.position.x, c.position.z, t.y, c.position.y) < 0.999) { W.through++; flag = flag || 'atraviesa'; }
    if (flag && W.ex.length < 20) W.ex.push({ flag, mode: G.player.mode, cam: [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(2)), tgt: [t.x, t.y, t.z].map((v) => +v.toFixed(2)) });
    return r;
  };
  return W;
}

// The game's own camera, photographed: the player stood at (x, z) facing h, the camera turned to yaw/pitch and left to
// settle as it would in play (its springs, its collisions) → .snaps/<name>.jpg
export async function camShot(x, z, h, yaw, pitch, o = {}) {
  const G = window.game, r = G.renderer, w = o.w || 1280, hh = o.h || 800, c = G.camera, P = G.player;
  if (P.vehicle) P.exitVehicle(true);
  const input = { look: () => [0, 0], mouse: { wheel: 0 }, lookBack: false, keys: {} };
  const step = (k) => { for (let i = 0; i < k; i++) { if (G.state !== 'play') { G.state = 'play'; const pp = document.getElementById('pause'); if (pp) pp.hidden = true; } G.frame(1 / 30); } };
  P.spawnAt(x, z, h); step(20); P.spawnAt(x, z, h); P.vel.set(0, 0, 0);
  if (o.hour != null) G.sky.hour = o.hour;
  const pr0 = r.getPixelRatio();
  G.cam.yaw = yaw; G.cam.pitch = pitch;
  for (let k = 0; k < (o.settle ?? 45); k++) { G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.update(1 / 30, input); }
  r.setPixelRatio(1); r.setSize(w, hh, false); if (G.composer) { G.composer.setSize(w, hh); if (G.bloom) G.bloom.setSize(w, hh); }
  c.aspect = w / hh; c.updateProjectionMatrix();
  G.cam.update(1 / 30, input); c.updateMatrixWorld(true);
  G.sky.update(0, c.position); G.render();
  const cv = r.domElement, out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height; out.getContext('2d').drawImage(cv, 0, 0);
  r.setPixelRatio(pr0);
  await fetch('/__snap?name=' + (o.name || 'camshot'), { method: 'POST', body: out.toDataURL('image/jpeg', 0.88) });
  const t = G.cam.target;
  return { cam: [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(2)), dist: +Math.hypot(c.position.x - t.x, c.position.z - t.z).toFixed(2) };
}

// The houses from above, around (x, z): each part in its own colour with its number, the pieces of wall that fill the
// slots in red, the streets and paths as lines, and the cracks (auditGaps detail) as blue marks → .snaps/<name>.jpg
//   const det = []; S.auditGaps(G.map, { detail: det }); await SL.plan(x, z, { r: 10, det, name: 'plan_01' })
export async function plan(x, z, o = {}) {
  const G = window.game, M = G.map, r = o.r || 10, px = o.px || 900, k = px / (2 * r);
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, px, px);
  const X = (wx) => (wx - x + r) * k, Z = (wz) => (wz - z + r) * k;
  // (a 1 m grid)
  g.strokeStyle = '#e2e2dc'; g.lineWidth = 1;
  for (let v = Math.ceil(x - r); v <= x + r; v++) { g.beginPath(); g.moveTo(X(v), 0); g.lineTo(X(v), px); g.stroke(); }
  for (let v = Math.ceil(z - r); v <= z + r; v++) { g.beginPath(); g.moveTo(0, Z(v)); g.lineTo(px, Z(v)); g.stroke(); }
  const near = (p) => { const rr = p.ring; for (let i = 0; i < rr.length; i += 2) if (Math.abs(rr[i] - x) < r + 2 && Math.abs(rr[i + 1] - z) < r + 2) return true; return false; };
  const path = (rr) => { g.beginPath(); for (let i = 0; i < rr.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(rr[i]), Z(rr[i + 1])); g.closePath(); };
  const labels = [];
  for (const p of M.parts) {
    if (!near(p)) continue;
    const hue = (p.id * 137.5) % 360;
    g.fillStyle = p.filler ? 'rgba(220,40,40,0.75)' : `hsla(${hue},55%,72%,0.85)`;
    path(p.ring); g.fill();
    g.strokeStyle = p.filler ? '#900' : '#333'; g.lineWidth = 1.5; g.stroke();
    for (const h of p.holes || []) { g.fillStyle = '#f4f4f0'; path(h); g.fill(); g.stroke(); }
    labels.push([X(p.c[0]), Z(p.c[1]), String(p.id) + (p.filler ? 'F' : '')]);
  }
  for (const e of M.edges) {
    const pp = e.pts; let inb = false;
    for (let i = 0; i < pp.length; i += 2) if (Math.abs(pp[i] - x) < r + 20 && Math.abs(pp[i + 1] - z) < r + 20) { inb = true; break; }
    if (!inb) continue;
    g.strokeStyle = e.drive ? 'rgba(60,60,60,0.6)' : 'rgba(40,140,40,0.7)'; g.lineWidth = e.drive ? 3 : 2; g.setLineDash(e.drive ? [] : [6, 4]);
    g.beginPath(); for (let i = 0; i < pp.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(pp[i]), Z(pp[i + 1])); g.stroke();
    g.setLineDash([]);
  }
  for (const q of o.det || []) {
    if (Math.abs(q.x - x) > r || Math.abs(q.z - z) > r || q.w >= 1.3) continue;
    g.fillStyle = q.cosA < 0.8 ? 'rgba(160,160,160,0.8)' : 'rgba(20,60,230,0.9)';
    g.beginPath(); g.arc(X(q.x), Z(q.z), Math.max(2, Math.min(6, q.w * k / 2)), 0, Math.PI * 2); g.fill();
  }
  g.font = '13px sans-serif'; g.fillStyle = '#000';
  for (const [lx, lz, t] of labels) if (lx > 0 && lx < px && lz > 0 && lz < px) g.fillText(t, lx - 12, lz + 4);
  g.fillText(`(${x.toFixed(1)}, ${z.toFixed(1)})  ±${r} m  rejilla 1 m`, 8, px - 8);
  await fetch('/__snap?name=' + (o.name || 'plan'), { method: 'POST', body: cv.toDataURL('image/jpeg', 0.9) });
  return o.name || 'plan';
}

// The kerbs as the game lays them (src/kerbs.js), every street, to .cache/aceras/kerbs_runtime.json — for
// tools/aceras/verificar.py, which checks them against the orthophotos
export async function exportKerbs() {
  const G = window.game, M = G.map, r2 = (v) => (v === v ? Math.round(v * 100) / 100 : null), out = [];
  for (const e of M.edges) {
    let kb = e.kerb;
    // (and the streets the game closed, their line under the houses — flagBlockedEdges —, to be placed by hand)
    if (!kb && e.blocked && e.drive && !e.dirt && M.inTown(e.pts[0], e.pts[1])) {
      const n = Math.max(2, Math.round(e.len) + 1), hw = new Float32Array(n).fill(e.w / 2), nan = new Float32Array(n).fill(NaN);
      kb = { n, st: e.len / (n - 1), p: hw, m: hw, fp: nan, fm: nan, np: hw, nm: hw, regime: 0, side: 0, blocked: true };
    }
    if (!kb) continue;
    const pts = [];
    for (let i = 0; i < e.pts.length; i += 2) pts.push([r2(e.pts[i]), r2(e.pts[i + 1])]);
    out.push({ id: e.id, name: e.name, cls: e.cls, w: e.w, ow: e.oneway, measured: !!e.measured, swP: e.swP ?? null, swM: e.swM ?? null, sw: e.sw, regime: kb.regime, side: kb.side, st: r2(kb.st), n: kb.n, pts, p: Array.from(kb.p, r2), m: Array.from(kb.m, r2), fp: Array.from(kb.fp, r2), fm: Array.from(kb.fm, r2), np: Array.from(kb.np, r2), nm: Array.from(kb.nm, r2), ra: M.nodes[e.a].degree >= 2 ? r2(M.nodes[e.a].radius) : 0, rb: M.nodes[e.b].degree >= 2 ? r2(M.nodes[e.b].radius) : 0, blocked: !!kb.blocked });
  }
  const res = await fetch('/__save?path=.cache/aceras/kerbs_runtime.json', { method: 'POST', body: JSON.stringify(out) });
  return { streets: out.length, ok: res.ok };
}
