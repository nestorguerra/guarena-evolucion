// Dev-only: the player running, as the game plays it — keys held down by a script, one game frame per video frame at
// 60 fps, drawn by the game's own render (stop motion, lens and all) — recorded to an MP4 and measured:
//  - foot slide: how fast a foot the capture says is planted moves on the ground, as drawn (m/s)
//  - foot skate: how fast a toe within 4 cm of the ground moves, whatever the capture says (m/s), and how often over 1 m/s
//  - camera jerk: the camera's acceleration from frame to frame (m/s²) and its turn jerk (rad/s²)
//  - screen shake: how the hips jump about on screen (second difference, pixels)
//  - pose steps: how often the drawn pose changes (a 12 fps stop motion changes one frame in five)
//   const R = await import('/tools/runlab.js?' + Date.now()); await R.run('a', { script: 'zigzag' })
//   → .snaps/run_<tag>.jpg (an MP4: rename it), .snaps/run_<tag>_NN.jpg (stills), and the measures
// Start the game with the menu's own Play button (document.getElementById('bPlay').click()), not game.start(): the page's
// loop would otherwise stay on the menu and run its frames in between this one's (while it waits on the encoder),
// flying the camera about and moving the parked cars to where the menu camera is — `interferencias` counts such frames.
import * as THREE from 'three';
const G = () => window.game;
const sleepExact = (ms) => new Promise((r) => { const t0 = performance.now(); const ch = new MessageChannel(); ch.port1.onmessage = () => (performance.now() - t0 >= ms ? r() : ch.port2.postMessage(0)); ch.port2.postMessage(0); });

// the scripts: what is held at time t (s) — keys, and the mouse moving the camera (pixels this frame)
export const SCRIPTS = {
  // sprint straight up the street
  recto: (t) => ({ keys: t < 0.4 ? [] : ['KeyW', 'ShiftLeft'] }),
  // the everyday run (the jog that comes after a while walking), straight
  trote: (t) => ({ keys: t < 0.4 ? [] : ['KeyW'], jog: true }),
  // sprint weaving left and right (on open ground: a street's kerbs and cars got in the way)
  zigzag: (t) => ({ keys: t < 0.4 ? [] : ['KeyW', 'ShiftLeft'].concat(t > 1.2 ? (Math.floor((t - 1.2) / 1.1) % 2 ? ['KeyA'] : ['KeyD']) : []), open: true }),
  // run, stop, turn back, run
  parar: (t) => ({ keys: t < 0.4 ? [] : t < 2.2 ? ['KeyW', 'ShiftLeft'] : t < 3.0 ? [] : t < 5 ? ['KeyS', 'ShiftLeft'] : [] }),
  // sprint in a long curve to the right (the camera following round), on the open square
  curva: (t) => ({ keys: t < 0.4 ? [] : ['KeyW', 'ShiftLeft'].concat(t > 1.2 && t < 4 ? ['KeyD'] : []), open: true }),
  // sprint while the camera is swung round with the mouse (the run swung round with it: on open ground)
  camara: (t) => ({ keys: t < 0.4 ? [] : ['KeyW', 'ShiftLeft'], look: t > 1 && t < 3.5 ? 6 : 0, open: true }),
};

// a long straight street with room to weave (the widest of the centre's), the player at its start looking along it
export function spot() {
  const g = G(), map = g.map, P = g.world.landmarks.poi.plaza, tmp = {};
  let best = null;
  for (const e of map.edges) {
    if (!e.drive || e.w < 6 || e.len < 120) continue;
    const a = [e.pts[0], e.pts[1]], b = [e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) / e.len < 0.96) continue;
    map.sample(e, e.len / 2, tmp);
    const d = Math.hypot(tmp.x - P.x, tmp.z - P.z);
    if (d > 500) continue;
    const sc = e.len - d * 0.2;
    if (!best || sc > best.sc) best = { e, sc };
  }
  map.sample(best.e, 10, tmp);
  return { x: tmp.x, z: tmp.z, h: Math.atan2(tmp.dx, tmp.dz), street: best.e.name };
}

// open ground inside the town's bounds with nothing to run into within 28 m (room to run a whole curve): the nearest
// such spot to the plaza, rings outwards (2026-10-05: −35.5, 300.2, north of the town; a fixed spot picked before lay
// outside the bounds — the runner slid along the invisible edge)
export function square() {
  const map = G().map, col = map.collider, P = G().world.landmarks.poi.plaza, b = map.bounds, q = { x: 0, y: 0, z: 0 };
  const clear = (x, z, R) => {
    for (let a = 0; a < 24; a++) for (const r of [0, R * 0.35, R * 0.7, R]) {
      const px = x + Math.cos((a / 24) * 6.283) * r, pz = z + Math.sin((a / 24) * 6.283) * r;
      if (map.buildingAt(px, pz)) return false;
      q.x = px; q.z = pz; col.resolveCircle(q, 0.6);
      if (Math.hypot(q.x - px, q.z - pz) > 1e-3) return false;
    }
    return true;
  };
  for (let d = 60; d < 900; d += 20) for (let a = 0; a < 32; a++) {
    const x = P.x + Math.cos((a / 32) * 6.283) * d, z = P.z + Math.sin((a / 32) * 6.283) * d;
    if (x < b.x0 + 60 || x > b.x1 - 60 || z < b.z0 + 60 || z > b.z1 - 60) continue;
    if (clear(x, z, 28)) return { x, z, h: Math.PI / 2 };
  }
  return null;
}

export async function run(tag = 'a', { script = 'zigzag', seconds = 6, fps = 60, W = 960, H = 540, hour = 11, record = true, stills = 8, where = null, stillAt = null } = {}) {
  const g = G(), p = g.player, inp = g.input, S = typeof script === 'function' ? script : SCRIPTS[script];
  const P = await import('/src/plastilina.js');
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const S0 = S(0);
  const sp = where || (S0.open ? square() : spot());
  p.spawnAt(sp.x, sp.z, sp.h); g.sky.hour = hour;
  g.cam.yaw = sp.h + Math.PI; g.cam.pitch = -0.18;
  inp.keys.clear();
  for (let i = 0; i < 40; i++) { g.state = 'play'; g.frame(1 / 60); }
  // the picture at W×H, the game's own resize held off meanwhile
  const r = g.renderer, keepResize = g.resize, keepPR = r.getPixelRatio();
  g.resize = () => {};
  r.setPixelRatio(1); if (g.composer) g.composer.setPixelRatio(1);
  r.setSize(W, H, false); if (g.composer) { g.composer.setSize(W, H); if (g.bloom) g.bloom.setSize(W, H); }
  g.camera.aspect = W / H; g.camera.updateProjectionMatrix();
  // what was drawn: the toes and hips as shown (inside render, after the stop motion's hold)
  const keepView = g.renderView.bind(g), shown = { toeL: new THREE.Vector3(), toeR: new THREE.Vector3(), hips: new THREE.Vector3(), pose: 0 };
  const B = p.char.bones;
  g.renderView = (cam) => {
    p.char.object.updateMatrixWorld(true);
    B.toeL.getWorldPosition(shown.toeL); B.toeR.getWorldPosition(shown.toeR); B.hips.getWorldPosition(shown.hips);
    shown.pose = B.thighL.quaternion.x * 1e3 + B.thighR.quaternion.y * 7 + B.shinL.quaternion.z * 3; // (a fingerprint of the pose)
    return keepView(cam);
  };
  const n = Math.round(seconds * fps), dt = 1 / fps, frames = [], log = [];
  // (the page's own loop may get a frame in while this one waits on the encoder: only this loop moves the game now)
  const realFrame = g.frame; g.frame = () => {};
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  const v = new THREE.Vector3(), camWas = new THREE.Vector3();
  let meddled = 0; // (frames where something else moved the camera in between: the menu's loop — start the game with its Play button)
  try {
    for (let i = 0; i < n; i++) {
      const t = i * dt, s = S(t);
      if (i && g.camera.position.distanceToSquared(camWas) > 1e-10) meddled++;
      inp.keys.clear(); for (const k of s.keys || []) inp.keys.add(k);
      if (s.jog) p.holdT = 99; // (the jog straight away, not after seven seconds of walking)
      inp.mouse.dx = s.look || 0;
      g.state = 'play'; realFrame.call(g, dt);
      const c = g.camera, mp = p.char.mp;
      camWas.copy(c.position);
      v.copy(shown.hips).project(c);
      log.push({
        t, cam: c.position.toArray(), camQ: c.quaternion.toArray(), camD: c.position.distanceTo(g.cam.target), shake: g.cam.shakeAmt, yaw: g.cam.yaw, pos: p.pos.toArray(), sp: Math.hypot(p.vel.x, p.vel.z),
        toeL: shown.toeL.toArray(), toeR: shown.toeR.toArray(), cL: mp ? mp.contactL : false, cR: mp ? mp.contactR : false,
        sx: (v.x * 0.5 + 0.5) * W, sy: (0.5 - v.y * 0.5) * H, pose: shown.pose, tick: P.SM.tick, lp: p.lean ? p.lean.p.x : 0, lr: p.lean ? p.lean.r.x : 0,
      });
      const wantStill = stills && i >= (stillAt ?? n / 2) && i < (stillAt ?? n / 2) + stills;
      if (record || wantStill) ctx.drawImage(r.domElement, 0, 0, r.domElement.width, r.domElement.height, 0, 0, W, H);
      if (record) frames.push(await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9))); // (compressed: hundreds of frames)
      if (stills && i >= (stillAt ?? n / 2) && i < (stillAt ?? n / 2) + stills) await fetch('/__snap?name=run_' + tag + '_' + String(i - Math.floor(stillAt ?? n / 2)).padStart(2, '0'), { method: 'POST', body: cv.toDataURL('image/jpeg', 0.85) });
    }
  } finally {
    g.frame = realFrame;
    inp.keys.clear(); inp.mouse.dx = 0;
    g.renderView = keepView;
    g.resize = keepResize; r.setPixelRatio(keepPR); if (g.composer) g.composer.setPixelRatio(keepPR); g.resize();
  }
  const m = measure(log, dt);
  m.interferencias = meddled;
  run.lastLog = log; // (dev: the time series, to look into a spike)
  if (record) {
    const rec = document.createElement('canvas'); rec.width = W; rec.height = H; const rctx = rec.getContext('2d');
    const stream = rec.captureStream(0), track = stream.getVideoTracks()[0];
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((x) => MediaRecorder.isTypeSupported(x));
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6 }), chunks = [];
    mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    const done = new Promise((res) => (mr.onstop = res));
    mr.start();
    let t0 = performance.now();
    for (let i = 0; i < frames.length; i++) {
      const bmp = await createImageBitmap(frames[i]); rctx.drawImage(bmp, 0, 0); bmp.close(); track.requestFrame();
      const wait = t0 + (i + 1) * (1000 / fps) - performance.now(); if (wait > 0) await sleepExact(wait);
    }
    await sleepExact(150); mr.stop(); await done;
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    await fetch('/__snap?name=run_' + tag, { method: 'POST', body: url });
    m.bytes = blob.size;
  }
  return m;
}

// two recorded runs side by side in one MP4 (.snaps/run_<out>.jpg), each with its label — e.g. the game as published and
// as it is now: await R.sideBySide('antes_recto', 'despues_recto', 'cmp_recto', ['Antes', 'Ahora'])
export async function sideBySide(a, b, out, labels = ['Antes', 'Ahora'], { fps = 60, scale = 0.5 } = {}) {
  const load = async (tag) => {
    const blob = await (await fetch('/.snaps/run_' + tag + '.jpg?' + Date.now())).blob();
    const v = document.createElement('video'); v.muted = true; v.playsInline = true;
    v.src = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; });
    return v;
  };
  const va = await load(a), vb = await load(b);
  const w = Math.round(va.videoWidth * scale), h = Math.round(va.videoHeight * scale), W = w * 2 + 8, H = h;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  const seek = (v, t) => new Promise((res) => { v.onseeked = () => res(); v.currentTime = t; });
  const n = Math.floor(Math.min(va.duration, vb.duration) * fps) - 1, frames = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / fps;
    await seek(va, t); await seek(vb, t);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(va, 0, 0, w, h); ctx.drawImage(vb, w + 8, 0, w, h);
    ctx.font = `bold ${Math.round(h / 14)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
    for (const [k, x] of [[0, 12], [1, w + 20]]) { ctx.strokeText(labels[k], x, h / 10); ctx.fillText(labels[k], x, h / 10); }
    frames.push(await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9)));
  }
  // encoded in real time, as run() does
  const rec = document.createElement('canvas'); rec.width = W; rec.height = H; const rctx = rec.getContext('2d');
  const stream = rec.captureStream(0), track = stream.getVideoTracks()[0];
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((x) => MediaRecorder.isTypeSupported(x));
  const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 }), chunks = [];
  mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const done = new Promise((res) => (mr.onstop = res));
  mr.start();
  const t0 = performance.now();
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(frames[i]); rctx.drawImage(bmp, 0, 0); bmp.close(); track.requestFrame();
    const wait = t0 + (i + 1) * (1000 / fps) - performance.now(); if (wait > 0) await sleepExact(wait);
  }
  await sleepExact(150); mr.stop(); await done;
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  await fetch('/__snap?name=run_' + out, { method: 'POST', body: url });
  URL.revokeObjectURL(va.src); URL.revokeObjectURL(vb.src);
  return { frames: frames.length, bytes: blob.size, size: [W, H], mime };
}

// the measures over a run (skipping its first second: the start)
export function measure(log, dt) {
  const L = log.filter((e) => e.t > 1);
  let slideN = 0, slide = 0, slideMax = 0;
  for (let i = 1; i < L.length; i++) {
    for (const [k, c] of [['toeL', 'cL'], ['toeR', 'cR']]) {
      if (!(L[i][c] && L[i - 1][c])) continue;
      const a = L[i][k], b = L[i - 1][k], s = Math.hypot(a[0] - b[0], a[2] - b[2]) / dt;
      slide += s; slideN++; slideMax = Math.max(slideMax, s);
    }
  }
  // what the eye sees skate: a toe within 4 cm of the ground (whatever the capture says) moving along it
  let skN = 0, sk = 0, skBad = 0;
  for (let i = 1; i < L.length; i++) {
    for (const k of ['toeL', 'toeR']) {
      const a = L[i][k], b = L[i - 1][k];
      if (a[1] - L[i].pos[1] > 0.04 || b[1] - L[i - 1].pos[1] > 0.04) continue;
      const s = Math.hypot(a[0] - b[0], a[2] - b[2]) / dt;
      sk += s; skN++; if (s > 1) skBad++;
    }
  }
  let jerk = 0, jerkMax = 0, yawJ = 0, shake = 0, shakeMax = 0, poseCh = 0;
  for (let i = 2; i < L.length; i++) {
    const a = L[i].cam, b = L[i - 1].cam, c = L[i - 2].cam;
    const j = Math.hypot(a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1], a[2] - 2 * b[2] + c[2]) / (dt * dt);
    jerk += j; jerkMax = Math.max(jerkMax, j);
    yawJ += Math.abs(L[i].yaw - 2 * L[i - 1].yaw + L[i - 2].yaw) / (dt * dt);
    const sh = Math.hypot(L[i].sx - 2 * L[i - 1].sx + L[i - 2].sx, L[i].sy - 2 * L[i - 1].sy + L[i - 2].sy);
    shake += sh; shakeMax = Math.max(shakeMax, sh);
  }
  for (let i = 1; i < L.length; i++) if (Math.abs(L[i].pose - L[i - 1].pose) > 1e-6) poseCh++;
  const k = Math.max(1, L.length - 2);
  return {
    pieDeslizaMedia: +(slide / Math.max(1, slideN)).toFixed(2), pieDeslizaMax: +slideMax.toFixed(2),
    pieRasMedia: +(sk / Math.max(1, skN)).toFixed(2), pieRasPatina: +(skBad / Math.max(1, skN)).toFixed(3),
    camaraSacudida: +(jerk / k).toFixed(1), camaraSacudidaMax: +jerkMax.toFixed(1), giroSacudida: +(yawJ / k).toFixed(2),
    pantallaTiembla: +(shake / k).toFixed(2), pantallaTiemblaMax: +shakeMax.toFixed(1),
    posesPorSegundo: +(poseCh / ((L.length - 1) * dt)).toFixed(1), velocidadMedia: +(L.reduce((s, e) => s + e.sp, 0) / L.length).toFixed(2),
  };
}
