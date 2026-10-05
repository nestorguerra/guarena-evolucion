// Dev-only: the three test views of the visual spec («Guareña — Especificación visual global», the Diorama look),
// always the same: (1) a street looking up at Santa María, (2) a narrow street of whitewashed houses, (3) a crossroads
// with a little square. The player stands there at 14:00 and the game's own camera is behind them, as in the
// reference pictures. Run it in each look (?estilo=anime|real|diorama, and the Acuarela look) and compare the sheets.
//   const C = await import('/tools/lookcompare.js?' + Date.now()); await C.shoot('manga')
//   → .snaps/look_<tag>.jpg (three views side by side) and C.views() for the spots
import * as THREE from 'three';
const G = () => window.game;
// a picture through the game's own camera (its near plane too: herolab's renderInto uses 1 cm, and at that the town's
// 24 km base field shows through the streets — not what the game shows)
function renderInto(ctx, dx, dy, pos, look, fov, w, h) {
  const g = G();
  g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } if (g.toon) g.toon.setSize(w, h);
  const cam = g.camera.clone(); cam.fov = fov; cam.aspect = w / h; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  const keep = g.camera; g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { g.renderView(cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
  const c = g.renderer.domElement;
  ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, w, h);
}
const step = (n) => { const g = G(); for (let i = 0; i < n; i++) { if (g.state !== 'play') g.state = 'play'; g.frame(1 / 30); } };

// the three spots, from the map (deterministic)
export async function views() {
  const g = G(), map = g.map, P = g.world.landmarks.poi.plaza;
  const I = await import('/src/intro.js');
  const out = [];
  // 1. up a street at Santa María (the drone intro's own spot, nearer the church)
  const plan = I.introPlan(g);
  out.push({ name: 'Hacia Santa María', x: plan.P.x + plan.dir.x * 12, z: plan.P.z + plan.dir.z * 12, h: plan.heading });
  // 2. a narrow straight street, houses both sides
  const tmp = {};
  let best = null;
  for (const e of map.edges) {
    if (!e.drive || !e.name || e.w > 5.2 || e.w < 3.4 || e.len < 70) continue;
    const a = [e.pts[0], e.pts[1]], b = [e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) / e.len < 0.97) continue;
    map.sample(e, e.len / 2, tmp);
    if (Math.hypot(tmp.x - P.x, tmp.z - P.z) > 420) continue;
    let cover = 0, n = 0;
    for (let s = 5; s < e.len - 5; s += 2) {
      map.sample(e, s, tmp);
      for (const side of [-1, 1]) { n++; const nx = -tmp.dz * side, nz = tmp.dx * side; for (let o = e.w / 2 + 0.5; o < e.w / 2 + 4; o += 0.5) if (map.buildingAt(tmp.x + nx * o, tmp.z + nz * o)) { cover++; break; } }
    }
    const score = (cover / n) * 100 + e.len * 0.1;
    if (cover / n > 0.85 && (!best || score > best.score)) best = { e, score };
  }
  if (best) { map.sample(best.e, Math.min(18, best.e.len * 0.2), tmp); out.push({ name: 'Calle estrecha', street: best.e.name, x: tmp.x, z: tmp.z, h: Math.atan2(tmp.dx, tmp.dz) }); }
  // 3. a crossroads of the old town: houses on its corners (a little square beside it scores more)
  const deg = new Map();
  for (const e of map.edges) if (e.drive) for (const k of [e.a, e.b]) deg.set(k, (deg.get(k) || 0) + 1);
  let cr = null;
  for (const [k, d] of deg) {
    if (d < 3) continue;
    const nd = map.nodes[k]; const x = nd[0] ?? nd.x, z = nd[1] ?? nd.z;
    const dist = Math.hypot(x - P.x, z - P.z);
    if (dist > 320 || dist < 60) continue;
    let corners = 0;
    for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2 + 0.39; if (map.buildingAt(x + Math.cos(t) * 11, z + Math.sin(t) * 11)) corners++; }
    if (corners < 4) continue;
    const sq = map.areas.find((q) => /place:square|leisure:park|landuse:village_green/.test(q.kind) && Math.hypot(q.ring[0] - x, q.ring[1] - z) < 45);
    const score = d * 10 + corners * 6 + (sq ? 12 : 0) - dist * 0.03;
    if (!cr || score > cr.score) cr = { x, z, score, k };
  }
  if (cr) {
    const e = map.edges.find((q) => q.drive && (q.a === cr.k || q.b === cr.k) && q.len > 25);
    if (e) { const s = e.a === cr.k ? 16 : e.len - 16; map.sample(e, s, tmp); out.push({ name: 'Cruce', x: tmp.x, z: tmp.z, h: Math.atan2(cr.x - tmp.x, cr.z - tmp.z) }); }
  }
  return out;
}

export async function shoot(tag = 'a', { W = 640, H = 400, hour = 14 } = {}) {
  const g = G(), p = g.player, list = await views();
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const cv = document.createElement('canvas'); cv.width = W * list.length; cv.height = H;
  const ctx = cv.getContext('2d');
  list.forEach((v, i) => {
    p.spawnAt(v.x, v.z, v.h);
    g.sky.hour = hour;
    g.cam.yaw = v.h + Math.PI; g.cam.pitch = -0.1;
    step(40);
    g.cam.yaw = v.h + Math.PI; g.cam.pitch = -0.1;
    step(20);
    renderInto(ctx, i * W, 0, g.camera.position.toArray(), g.cam.target.toArray(), g.camera.fov, W, H);
  });
  g.resize();
  await fetch('/__snap?name=look_' + tag, { method: 'POST', body: cv.toDataURL('image/jpeg', 0.88) });
  return list.map((v) => ({ name: v.name, street: v.street, x: +v.x.toFixed(1), z: +v.z.toFixed(1) }));
}

// the rest of the game in the same look: the plaza at noon (people), Santa María at dusk, the narrow street at night,
// a car in the street, the fields, a street seen from the car → .snaps/look_<tag>_mas.jpg (3 × 2)
export async function extras(tag = 'a', { W = 640, H = 400 } = {}) {
  const g = G(), p = g.player, list = await views();
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const t = g.world.landmarks.poi.churchTower || { x: -180.5, z: -38.1 };
  const nv = list[1], dir = [Math.sin(nv.h), Math.cos(nv.h)];
  // the parked or passing car nearest the plaza's west side
  const P0 = [-40, 40];
  const car = g.fleet.vehicles.filter((v) => !v.dead && v.spec.shape !== 'bike' && v.model !== 'bici' && v.model !== 'mulilla').sort((a, b) => Math.hypot(a.x - P0[0], a.z - P0[1]) - Math.hypot(b.x - P0[0], b.z - P0[1]))[0];
  const cx = car ? car.x : P0[0], cz = car ? car.z : P0[1], ch = car ? car.heading || 0 : 0;
  const V = [
    ['Plaza a mediodía', 12, [-50, 2.0, 52], [-25, 6, 22], 60, [-44, 46]],
    ['Santa María al atardecer', 18.6, [t.x + 52, 2.2, t.z + 5], [t.x, 13, t.z], 60, [t.x + 48, t.z + 5]],
    ['Calle estrecha de noche', 22.5, [nv.x - dir[0] * 5, 2.2, nv.z - dir[1] * 5], [nv.x + dir[0] * 20, 1.6, nv.z + dir[1] * 20], 62, [nv.x, nv.z]],
    ['Un coche', 14, [cx + Math.sin(ch + 0.9) * 5.5, 1.7, cz + Math.cos(ch + 0.9) * 5.5], [cx, 0.8, cz], 55, [cx + 3, cz + 3]],
    ['El campo', 12, [-1250, 2.0, -1560], [-1600, 3, -2150], 62, [-1252, -1562]],
    ['Desde lo alto', 16, [-120, 40, 90], [-60, 0, 0], 60, [-70, 30]],
  ];
  const cv = document.createElement('canvas'); cv.width = W * 3; cv.height = H * 2;
  const ctx = cv.getContext('2d');
  V.forEach(([name, hour, eye, look, fov, at], i) => {
    p.spawnAt(at[0], at[1], 0);
    g.sky.hour = hour; step(30);
    g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(eye[0], 0, eye[2]), true);
    renderInto(ctx, (i % 3) * W, Math.floor(i / 3) * H, eye, look, fov, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect((i % 3) * W, Math.floor(i / 3) * H, 230, 24);
    ctx.fillStyle = '#fff'; ctx.font = '15px system-ui'; ctx.fillText(name, (i % 3) * W + 8, Math.floor(i / 3) * H + 17);
  });
  g.resize();
  await fetch('/__snap?name=look_' + tag + '_mas', { method: 'POST', body: cv.toDataURL('image/jpeg', 0.88) });
  return { car: car ? { x: +cx.toFixed(1), z: +cz.toFixed(1), kind: car.model } : null };
}

// frame time at the three views (the whole frame: the game's update and its render, waited for on the GPU with a 1-pixel
// read), at W×H and pixel ratio 1, after the town around has streamed in. Same machine, one look per page load.
export async function perf({ W = 1280, H = 720, n = 90 } = {}) {
  const g = G(), p = g.player, list = await views(), out = [];
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const r = g.renderer, keepPR = r.getPixelRatio();
  r.setPixelRatio(1); if (g.composer) g.composer.setPixelRatio(1);
  r.setSize(W, H, false); if (g.composer) g.composer.setSize(W, H); if (g.toon) g.toon.setSize(W, H);
  g.camera.aspect = W / H; g.camera.updateProjectionMatrix();
  const keepResize = g.resize; g.resize = () => {};
  const gl = r.getContext(), px = new Uint8Array(4);
  try {
    for (const v of list) {
      p.spawnAt(v.x, v.z, v.h); g.sky.hour = 14;
      g.cam.yaw = v.h + Math.PI; g.cam.pitch = -0.1; step(60);
      g.cam.yaw = v.h + Math.PI; g.cam.pitch = -0.1;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      r.info.autoReset = false;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { r.info.reset(); if (g.state !== 'play') g.state = 'play'; g.frame(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const ms = (performance.now() - t0) / n;
      r.info.autoReset = true;
      out.push({ vista: v.name, ms: +ms.toFixed(1), fps: Math.round(1000 / ms), llamadas: r.info.render.calls, triangulos: r.info.render.triangles });
    }
  } finally {
    g.resize = keepResize;
    r.setPixelRatio(keepPR); if (g.composer) g.composer.setPixelRatio(keepPR);
    g.resize();
  }
  return out;
}

// a walk in motion: the player goes up the narrow street with the game's own camera behind, one picture every few
// frames → .snaps/rec_<tag>_NN.jpg (put together as a GIF outside)
export async function walk(tag = 'a', { W = 560, H = 350, n = 36, stepM = 0.55, hour = 14 } = {}) {
  const g = G(), p = g.player, map = g.map, list = await views(), v = list[1], tmp = {};
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const e = map.edges.find((q) => q.name === v.street);
  let s = Math.min(18, e.len * 0.2);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  map.sample(e, s, tmp); p.spawnAt(tmp.x, tmp.z, Math.atan2(tmp.dx, tmp.dz)); g.sky.hour = hour; step(40);
  for (let i = 0; i < n; i++) {
    s += stepM; map.sample(e, s, tmp);
    const h = Math.atan2(tmp.dx, tmp.dz);
    p.pos.x = tmp.x; p.pos.z = tmp.z; if (p.heading !== undefined) p.heading = h;
    g.cam.yaw = h + Math.PI + Math.sin(i * 0.12) * 0.25; g.cam.pitch = -0.08;
    g.sky.hour = hour; step(2);
    renderInto(ctx, 0, 0, g.camera.position.toArray(), g.cam.target.toArray(), g.camera.fov, W, H);
    await fetch('/__snap?name=rec_' + tag + '_' + String(i).padStart(2, '0'), { method: 'POST', body: cv.toDataURL('image/jpeg', 0.85) });
  }
  g.resize();
  return n;
}

// close looks at the clay (2 × 3): the player from behind and from the front, a wall with its door, a parked car, a
// street tree, the ground at the kerb → .snaps/look_<tag>_cerca.jpg
export async function closeups(tag = 'a', { W = 640, H = 400, hour = 14 } = {}) {
  const g = G(), p = g.player, list = await views(), v = list[0], dir = [Math.sin(v.h), Math.cos(v.h)], nx = -dir[1], nz = dir[0];
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  p.spawnAt(v.x, v.z, v.h); g.sky.hour = hour; step(40);
  const P = p.pos;
  const car = g.fleet.vehicles.filter((q) => !q.dead && q.model !== 'bici' && q.spec.shape !== 'moto').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  const trees = g.world.trees && g.world.trees.instances ? g.world.trees.instances : null;
  const V = [
    ['Personaje (espalda)', [P.x - dir[0] * 1.3 + dir[1] * 0.5, 1.45, P.z - dir[1] * 1.3 - dir[0] * 0.5], [P.x, 1.0, P.z], 45],
    ['Personaje (cara)', [P.x + dir[0] * 1.5 + dir[1] * 0.35, 1.55, P.z + dir[1] * 1.5 - dir[0] * 0.35], [P.x, 1.35, P.z], 38],
    ['Pared y puerta', [P.x - nx * 0.7, 1.5, P.z - nz * 0.7], [P.x - nx * 3.5 + dir[0] * 1.5, 1.1, P.z - nz * 3.5 + dir[1] * 1.5], 55],
    ['Un coche', car ? [car.x + Math.sin((car.heading || 0) + 0.9) * 4.2, 1.5, car.z + Math.cos((car.heading || 0) + 0.9) * 4.2] : [P.x + 3, 1.5, P.z + 3], car ? [car.x, 0.7, car.z] : [P.x, 0.7, P.z], 50],
    ['Hacia la iglesia', [P.x - dir[0] * 4, 1.7, P.z - dir[1] * 4], [P.x + dir[0] * 30, 6, P.z + dir[1] * 30], 55],
    ['El suelo', [P.x + nx * 1.2, 1.3, P.z + nz * 1.2], [P.x + nx * 2.4 + dir[0] * 2.5, 0, P.z + nz * 2.4 + dir[1] * 2.5], 60],
  ];
  const cv = document.createElement('canvas'); cv.width = W * 3; cv.height = H * 2;
  const ctx = cv.getContext('2d');
  V.forEach(([name, eye, look, fov], i) => {
    g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(eye[0], 0, eye[2]), true);
    renderInto(ctx, (i % 3) * W, Math.floor(i / 3) * H, eye, look, fov, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect((i % 3) * W, Math.floor(i / 3) * H, 210, 24);
    ctx.fillStyle = '#fff'; ctx.font = '15px system-ui'; ctx.fillText(name, (i % 3) * W + 8, Math.floor(i / 3) * H + 17);
  });
  g.resize();
  await fetch('/__snap?name=look_' + tag + '_cerca', { method: 'POST', body: cv.toDataURL('image/jpeg', 0.88) });
  return { car: car && car.model };
}

// a video of the game as it plays: the camera behind the player walking up a street (the original walk's path, sway
// and speed: 0.55 m every 0.11 s), people and cars moving as they do, sampled at `fps` — in the claymation every frame
// is a new pose. Saves .snaps/vid_<tag>_NN.jpg and, recorded in the page, .snaps/vid_<tag>.jpg (an MP4: rename it)
const sleepExact = (ms) => new Promise((r) => { const t0 = performance.now(); const ch = new MessageChannel(); ch.port1.onmessage = () => (performance.now() - t0 >= ms ? r() : ch.port2.postMessage(0)); ch.port2.postMessage(0); });
export async function walkVideo(tag = 'a', { W = 960, H = 600, fps = 12, seconds = 3.96, hour = 14, view = 1, origStep = 0.55, origDt = 0.11, record = true, spot = null, film = false } = {}) {
  // (film: the «Película» mode as it plays — 24 frames a second, the puppets on twos, the film's grain and black bars)
  if (film) fps = 24;
  const g = G(), p = g.player, map = g.map, list = await views(), v = spot ? { x: spot[0], z: spot[1], h: spot[2] } : list[view], tmp = {};
  const P = await import('/src/plastilina.js');
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const e = v.street ? map.edges.find((q) => q.name === v.street) : null;
  const s0 = e ? Math.min(18, e.len * 0.2) : 0, n = Math.round(seconds * fps), speed = origStep / origDt;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  if (e) { map.sample(e, s0, tmp); p.spawnAt(tmp.x, tmp.z, Math.atan2(tmp.dx, tmp.dz)); } else p.spawnAt(v.x, v.z, v.h);
  g.sky.hour = hour; step(40);
  const frames = [];
  for (let i = 0; i < n; i++) {
    let h = v.h, phase = i * 0.09;
    if (e) {
      const s = s0 + origStep + (i / fps) * speed; phase = ((s - s0) / origStep - 1) * 0.12;
      map.sample(e, s, tmp); h = Math.atan2(tmp.dx, tmp.dz);
      p.pos.x = tmp.x; p.pos.z = tmp.z; if (p.heading !== undefined) p.heading = h;
    }
    g.cam.yaw = h + Math.PI + Math.sin(phase) * 0.25; g.cam.pitch = -0.08;
    g.sky.hour = hour;
    if (film) { if (g.state !== 'play') g.state = 'play'; g.frame(1 / fps); } // (the game's own clock decides each pose)
    else for (let k = 0; k < 2; k++) { if (g.state !== 'play') g.state = 'play'; g.frame(1 / (2 * fps)); }
    // (each video frame is a pose: hold nothing back — but each puppet where the animator's hand put it)
    if (!film) P.SM.tick = true;
    if (film && g.grade) { g.grade.uniforms.uGrain.value = P.PLASTILINA.grain; g.grade.uniforms.uSeed.value = Math.random() * 100; }
    P.SM.hold();
    renderInto(ctx, 0, 0, g.camera.position.toArray(), g.cam.target.toArray(), g.camera.fov, W, H);
    P.SM.release();
    if (film) { const bar = Math.max(0, Math.round((H - W / 2.39) / 2)); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); }
    frames.push(await createImageBitmap(cv));
    await fetch('/__snap?name=vid_' + tag + '_' + String(i).padStart(2, '0'), { method: 'POST', body: cv.toDataURL('image/jpeg', 0.88) });
  }
  g.resize();
  if (!record) return { frames: n };
  const rec = document.createElement('canvas'); rec.width = W; rec.height = H; const rctx = rec.getContext('2d');
  const stream = rec.captureStream(0), track = stream.getVideoTracks()[0];
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 }), chunks = [];
  mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const done = new Promise((r) => (mr.onstop = r));
  mr.start();
  for (let i = 0; i < frames.length; i++) { rctx.drawImage(frames[i], 0, 0); track.requestFrame(); await sleepExact(1000 / fps); }
  await sleepExact(120); mr.stop(); await done;
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  await fetch('/__snap?name=vid_' + tag, { method: 'POST', body: url });
  return { frames: n, mime, bytes: blob.size };
}

// a close look at a puppet for a few seconds, standing (its boil, the hand's jitter, its blinks), at 12 poses a second →
// .snaps/vid_<tag>.jpg (an MP4) like walkVideo
export async function faceVideo(tag = 'cara', { W = 720, H = 720, fps = 12, seconds = 4, hour = 11, dist = 0.55, side = 0.22 } = {}) {
  const g = G(), p = g.player, P = await import('/src/plastilina.js');
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const SPOT = { x: -346.5, z: 49.4 };
  p.spawnAt(SPOT.x, SPOT.z, 0); g.sky.hour = hour; step(40);
  const ch = p.char, n = Math.round(seconds * fps), frames = [];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) { if (g.state !== 'play') g.state = 'play'; g.frame(1 / (2 * fps)); }
    ch.object.updateMatrixWorld(true);
    const eL = new THREE.Vector3(), eR = new THREE.Vector3(); ch.bones.eyeL.getWorldPosition(eL); ch.bones.eyeR.getWorldPosition(eR);
    const ec = eL.add(eR).multiplyScalar(0.5), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.object.getWorldQuaternion(new THREE.Quaternion())); fwd.y = 0; fwd.normalize();
    const rt = new THREE.Vector3(fwd.z, 0, -fwd.x), c0 = ec.clone(); c0.y -= 0.04;
    if (i === 0) { faceVideo.cam = [c0.x + fwd.x * dist + rt.x * side, c0.y + 0.03, c0.z + fwd.z * dist + rt.z * side]; faceVideo.look = c0.toArray(); }
    P.SM.tick = true; P.SM.hold();
    renderInto(ctx, 0, 0, faceVideo.cam, faceVideo.look, 30, W, H);
    P.SM.release();
    frames.push(await createImageBitmap(cv));
  }
  g.resize();
  const rec = document.createElement('canvas'); rec.width = W; rec.height = H; const rctx = rec.getContext('2d');
  const stream = rec.captureStream(0), track = stream.getVideoTracks()[0];
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 }), chunks = [];
  mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const done = new Promise((r) => (mr.onstop = r));
  mr.start();
  for (let i = 0; i < frames.length; i++) { rctx.drawImage(frames[i], 0, 0); track.requestFrame(); await sleepExact(1000 / fps); }
  await sleepExact(120); mr.stop(); await done;
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  await fetch('/__snap?name=vid_' + tag, { method: 'POST', body: url });
  return { frames: n, mime, bytes: blob.size };
}
