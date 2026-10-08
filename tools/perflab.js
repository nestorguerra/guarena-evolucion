// Performance lab: how long the game's frames take, measured the same way before and after a change (docs/fluidez.md).
//   const P = await import('/tools/perflab.js?' + Date.now());
//   await P.live({ route: 'drive', sec: 40 })    // or 'walk', 'spin': the game's own loop, as a player has it
//   await P.bench({ route: 'drive', sec: 40 })   // the same route stepped by hand, each system's share timed
//   P.inventory(), P.drawsBy(), await P.costs(), await P.variants()   // what is drawn, and what each part costs
// Every run is the same: the random numbers seeded, the player put at the same place at the same hour, the same route
// (driving through the town's main streets, walking a few streets of the old town, or standing in the Plaza turning
// the camera right round), the dynamic resolution off. live() takes the intervals between the frames the browser shows
// — measure in a Chrome of its own (tools/perf/): the app's browser pane, out of focus, gives a frame every 2 s.
// bench() steps the frame by hand at 1/60 s on a canvas of a fixed size (by default a laptop's 1440×900 at the game's
// own pixel ratio), drawn off screen; its time is the CPU's plus whatever the GPU holds it back (gl.finish is only a
// flush in Chrome). Both count the hitches (frames over 33, 50 and 100 ms), with what took longest in them.

const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

// the systems timed: [label, object getter, method]
const SYSTEMS = [
  ['player', (G) => G.player, 'update'], ['net', (G) => G.net, 'update'], ['parked', (G) => G.fleet, 'streamParked'],
  ['traffic', (G) => G.traffic, 'update'], ['police', (G) => G.police, 'update'], ['fleet', (G) => G.fleet, 'update'],
  ['traffic2', (G) => G.traffic, 'afterPhysics'], ['peds', (G) => G.peds, 'update'], ['missions', (G) => G.missions, 'update'],
  ['pickups', (G) => G.pickups, 'update'], ['interiors', (G) => G.interiors, 'update'], ['shops', (G) => G.shops, 'update'],
  ['activities', (G) => G.activities, 'update'], ['jobs', (G) => G.jobs, 'update'], ['seats', (G) => G.seats, 'update'],
  ['phone', (G) => G.phone, 'update'], ['fm', (G) => G.fm, 'update'], ['merendero', (G) => G.merendero, 'update'],
  ['mercadillo', (G) => G.mercadillo, 'update'], ['effects', (G) => G.effects, 'update'], ['cam', (G) => G.cam, 'update'],
  ['viewModel', (G) => G.viewModel, 'update'], ['hud', (G) => G.hud, 'update'], ['audio', (G) => G, 'updateAudio'],
  ['weather', (G) => G.weather, 'update'], ['sky', (G) => G.sky, 'update'], ['rain', (G) => G.rain, 'update'],
  ['world', (G) => G.world, 'update'], ['facades', (G) => G.world.facades, 'update'], ['charLods', (G) => G.chars, 'updateLods'],
];

// the route: streets to drive to one after another (by the game's edge ids, their middles), and the walk's
export const DRIVE_TO = [131, 436, 415, 164, 49, 770, 39, 142];
export const WALK_TO = [12, 13, 49, 47, 46, 14];

export async function bench(o = {}) {
  const G = window.game, M = G.map, r = G.renderer, gl = r.getContext();
  const route = o.route || 'drive', sec = o.sec ?? (route === 'spin' ? 10 : 40), w = o.w || 1440, h = o.h || 900;
  const pr = o.pr ?? (G.perf ? G.perf.base : r.getPixelRatio());
  const hour = o.hour ?? 12, seed = o.seed ?? 1234, warm = o.warm ?? 3;
  const traffic = await import('/src/traffic.js');
  // ---- hold the page's own loop, fix the size and the randomness
  const realFrame = Object.getPrototypeOf(G).frame.bind(G);
  const ownFrame = Object.prototype.hasOwnProperty.call(G, 'frame') ? G.frame : null;
  G.frame = () => {};
  const rnd0 = Math.random; Math.random = mulberry(seed);
  const dyn0 = G.save.dynRes; G.save.dynRes = false;
  const resize0 = G.resize;
  const size = (force) => {
    // (only when the canvas is not at the size wanted: assigning a WebGL canvas its size reallocates its buffer)
    if (!force && r.domElement.width === Math.floor(w * pr) && r.domElement.height === Math.floor(h * pr) && r.getPixelRatio() === pr) return;
    r.setPixelRatio(pr); r.setSize(w, h, false);
    if (G.composer) { G.composer.setPixelRatio(pr); G.composer.setSize(w, h); if (G.bloom) G.bloom.setSize(w, h); }
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  };
  G.resize = () => size(true); size(true);
  if (G.perf) { G.perf.pr = G.perf.base = pr; G.perf.grace = 1e9; }
  // ---- the systems' clocks
  const acc = {}, wraps = [];
  for (const [label, get, m] of SYSTEMS) {
    const obj = get(G);
    if (!obj || typeof obj[m] !== 'function') continue;
    const f = obj[m], own = Object.prototype.hasOwnProperty.call(obj, m);
    acc[label] = 0;
    obj[m] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { acc[label] += performance.now() - t0; } };
    wraps.push(() => { if (own) obj[m] = f; else delete obj[m]; });
  }
  // the GL calls that can stall a frame: shaders compiled and linked (the link's status, asked for, waits for the
  // compiler), textures and buffers uploaded — their time and count each frame
  const GLW = o.allGL ? Object.getOwnPropertyNames(Object.getPrototypeOf(gl)).filter((k) => { try { return typeof gl[k] === 'function' && k !== 'constructor'; } catch (e) { return false; } }) : ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'bufferData', 'bufferSubData', 'generateMipmap', 'readPixels', 'getError', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'clear', 'blitFramebuffer', 'invalidateFramebuffer', 'useProgram', 'bindFramebuffer', 'framebufferTexture2D', 'checkFramebufferStatus'];
  const glMax = {}; // (the longest single call of each kind, this frame)
  const glAcc = {}, glN = {}, glWraps = [];
  for (const k of GLW) {
    if (typeof gl[k] !== 'function') continue;
    const f = gl[k];
    glAcc[k] = 0; glN[k] = 0;
    gl[k] = function (...a) { const t0 = performance.now(); try { return f.apply(gl, a); } finally { const d = performance.now() - t0; glAcc[k] += d; glN[k]++; if (d > (glMax[k] || 0)) glMax[k] = d; } };
    glWraps.push(() => { gl[k] = f; });
  }
  // the GPU's own time, frame by frame (a timer query round the frame's drawing; read a few frames later)
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), pendingQ = [], gpuT = [];
  const pollQ = () => {
    while (pendingQ.length) {
      const qq = pendingQ[0];
      if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) gpuT.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(qq); pendingQ.shift();
    }
  };
  let tRender = 0, tFinish = 0, useFinish = o.finish !== false;
  // (drawn off screen, by default: the frames are not shown, so the page's compositor never holds the GPU back — in
  // the app's browser pane, out of focus, it takes a frame every 2 s, and the canvas waits for it. The last pass draws
  // into a target of the canvas's size instead, at the same cost)
  const offscreen = o.offscreen !== false;
  const offRT = offscreen && !G.composer ? new (await import('three')).WebGLRenderTarget(r.domElement.width, r.domElement.height) : null;
  const cts0 = G.composer ? G.composer.renderToScreen : null;
  if (offscreen && G.composer) G.composer.renderToScreen = false;
  const render0 = G.render, ownRender = Object.prototype.hasOwnProperty.call(G, 'render');
  G.render = function (...a) {
    const t0 = performance.now();
    let qq = null;
    if (tq && measuring) { qq = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, qq); }
    if (offRT) { if (offRT.width !== r.domElement.width || offRT.height !== r.domElement.height) offRT.setSize(r.domElement.width, r.domElement.height); r.setRenderTarget(offRT); }
    render0.apply(this, a);
    if (offRT) r.setRenderTarget(null);
    if (qq) { gl.endQuery(tq.TIME_ELAPSED_EXT); pendingQ.push(qq); }
    const t1 = performance.now();
    if (useFinish) gl.finish();
    tRender += t1 - t0; tFinish += performance.now() - t1;
  };
  let measuring = false;
  // ---- the start: the same place, hour and state every time
  const bot = await (await import('/tools/playtest.js')).setup();
  for (const k of ['moveX', 'moveY', 'throttle', 'brakeIn', 'steer']) bot[k] = 0;
  bot.sprint = false;
  G.state = 'play';
  const pp = document.getElementById('pause'); if (pp) pp.hidden = true;
  G.sky.hour = hour;
  const p = G.player;
  if (p.vehicle) p.exitVehicle(true);
  const start = o.start || (route === 'walk' ? edgeMid(M, 12) : route === 'spin' ? plaza(G) : edgeMid(M, 131));
  p.spawnAt(start.x, start.z, start.h || 0);
  G.cam.yaw = (start.h || 0) + Math.PI; G.cam.pitch = -0.15;
  if (route === 'drive') {
    G.fleet.streamParked(p.pos.x, p.pos.z);
    const vs = G.fleet.vehicles.filter((v) => !v.driver && !v.ai && !v.ctrl && !v.dead && !v.spec.twoWheel).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
    if (vs[0]) p.getIn(vs[0]);
  }
  // ---- the route
  const dests = (route === 'walk' ? WALK_TO : DRIVE_TO).map((id) => edgeMid(M, id));
  let di = 0;
  const st = { path: null, seg: 0 }, out = {};
  let stuck = 0, revT = 0, revSteer = 0;
  const plan = () => { const v = p.vehicle; if (v) { st.path = M.routeFrom(v.x, v.z, v.heading, dests[di].x, dests[di].z, {}); st.seg = 0; } };
  if (route === 'drive') plan();
  const steer = (t) => {
    if (route === 'spin') { G.cam.yaw += 0.02; return; }
    const d = dests[di];
    if (route === 'walk') {
      const dx = d.x - p.pos.x, dz = d.z - p.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 4) { di = (di + 1) % dests.length; return; }
      const yaw = G.cam.forwardYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
      bot.moveY = (dx * fx + dz * fz) / dd; bot.moveX = (dx * -fz + dz * fx) / dd; bot.sprint = true;
      return;
    }
    const v = p.vehicle;
    if (!v) return;
    const f = traffic.followRoute(st, v.x, v.z, v.heading, Math.abs(v.speed), out);
    const tsp = traffic.turnSpeed(f.turn, v.spec.top * 0.8);
    const dx = f.x - v.x, dz = f.z - v.z, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lf = dx * fx + dz * fz, lr = dx * -fz + dz * fx;
    let s = Math.max(-1, Math.min(1, Math.atan2(lr, Math.max(0.1, lf)) * 1.6));
    if (lf < 0) s = lr >= 0 ? 1 : -1;
    bot.steer = s; bot.throttle = v.speed < tsp ? 1 : 0; bot.brakeIn = v.speed > tsp + 2 ? 1 : 0;
    if (revT > 0) { revT -= 1 / 60; bot.throttle = 0; bot.brakeIn = 1; bot.steer = revSteer; return; }
    if (v.vel < 0.8) stuck += 1 / 60; else stuck = 0;
    if (stuck > 1.5) { stuck = 0; revT = 1.8; revSteer = -s || 1; }
    if (f.done || Math.hypot(v.x - d.x, v.z - d.z) < 14) { di = (di + 1) % dests.length; plan(); }
  };
  // ---- warm up (not counted), then the run
  const step = () => { if (G.state !== 'play') G.state = 'play'; size(); realFrame(1 / 60); };
  for (let i = 0; i < warm * 60; i++) { steer(i / 60); step(); if (i % 20 === 0) await yieldNow(); }
  for (const k in acc) acc[k] = 0;
  measuring = true;
  const glTot = {}, glCnt = {};
  for (const k in glAcc) { glTot[k] = 0; glCnt[k] = 0; }
  const frames = [], cpu = [], gpu = [], sys = {}, hitches = [];
  for (const k in acc) sys[k] = [];
  const prog0 = r.info.programs ? r.info.programs.length : 0;
  const auto0 = r.info.autoReset; r.info.autoReset = false; // (the composer draws several times a frame: count them all)
  let calls = 0, tris = 0, dist = 0, lx = p.pos.x, lz = p.pos.z;
  const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) {
    steer(i / 60);
    for (const k in acc) acc[k] = 0;
    for (const k in glAcc) { glAcc[k] = 0; glN[k] = 0; glMax[k] = 0; }
    const hp0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    tRender = tFinish = 0;
    r.info.reset();
    pollQ();
    const t0 = performance.now();
    step();
    const ft = performance.now() - t0;
    frames.push(ft); cpu.push(ft - tFinish); gpu.push(tFinish);
    for (const k in acc) sys[k].push(acc[k]);
    calls += r.info.render.calls; tris += r.info.render.triangles;
    const px = p.vehicle ? p.vehicle.x : p.pos.x, pz = p.vehicle ? p.vehicle.z : p.pos.z;
    dist += Math.hypot(px - lx, pz - lz); lx = px; lz = pz;
    for (const k in glAcc) { glTot[k] += glAcc[k]; glCnt[k] += glN[k]; }
    if (ft > 33.3) {
      const top = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${r1(v)}`);
      const glTop = Object.entries(glAcc).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${r1(v)}×${glN[k]} (max ${r1(glMax[k])})`);
      const hp1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      hitches.push({ i, ms: r1(ft), render: r1(tRender), gpu: r1(tFinish), top, gl: glTop, heapMB: r1((hp1 - hp0) / 1048576) });
    }
    if (i % 15 === 0) await yieldNow();
  }
  measuring = false;
  for (let k = 0; k < 20 && pendingQ.length; k++) { gl.finish(); pollQ(); }
  for (const qq of pendingQ) gl.deleteQuery(qq);
  for (const u of glWraps) u();
  const prog1 = r.info.programs ? r.info.programs.length : 0;
  r.info.autoReset = auto0;
  const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  // ---- put everything back
  for (const u of wraps) u();
  if (ownRender) G.render = render0; else delete G.render;
  if (G.composer) G.composer.renderToScreen = cts0;
  if (offRT) offRT.dispose();
  if (ownFrame) G.frame = ownFrame; else delete G.frame;
  Math.random = rnd0; G.save.dynRes = dyn0;
  G.resize = resize0;
  bot.moveX = bot.moveY = bot.throttle = bot.steer = 0; bot.brakeIn = 1; bot.sprint = false;
  G.resize();
  // ---- the numbers
  const sorted = frames.slice().sort((a, b) => a - b), mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const sysOut = {};
  for (const k in sys) {
    const a = sys[k], m = a.reduce((x, y) => x + y, 0) / a.length;
    if (m < 0.02 && Math.max(...a) < 2) continue;
    const s2 = a.slice().sort((x, y) => x - y);
    sysOut[k] = { mean: r2(m), p99: r2(q(s2, 0.99)), max: r1(s2[s2.length - 1]) };
  }
  const cs = cpu.slice().sort((a, b) => a - b), gs = gpu.slice().sort((a, b) => a - b);
  return {
    route, sec, size: [w, h], pr, frames: frames.length, metres: Math.round(dist),
    ms: { mean: r2(mean), p50: r2(q(sorted, 0.5)), p95: r2(q(sorted, 0.95)), p99: r2(q(sorted, 0.99)), max: r1(sorted[sorted.length - 1]) },
    fps: r1(1000 / mean), low1: r1(1000 / q(sorted, 0.99)),
    over: { 33: frames.filter((x) => x > 33.3).length, 50: frames.filter((x) => x > 50).length, 100: frames.filter((x) => x > 100).length },
    cpu: { mean: r2(cpu.reduce((a, b) => a + b, 0) / cpu.length), p99: r2(q(cs, 0.99)) }, gpuWait: { mean: r2(gpu.reduce((a, b) => a + b, 0) / gpu.length), p99: r2(q(gs, 0.99)) },
    draw: { calls: Math.round(calls / n), triangles: Math.round(tris / n) }, newPrograms: prog1 - prog0, programs: prog1,
    gpuMs: gpuT.length ? (() => { const a = gpuT.slice().sort((x, y) => x - y); return { mean: r2(gpuT.reduce((x, y) => x + y, 0) / gpuT.length), p50: r2(q(a, 0.5)), p99: r2(q(a, 0.99)), n: gpuT.length }; })() : null,
    gl: Object.fromEntries(Object.keys(glTot).filter((k) => glCnt[k]).map((k) => [k, { ms: r1(glTot[k]), n: glCnt[k] }])),
    heapMB: r1((heap1 - heap0) / 1048576), systems: sysOut, hitches: hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, o.nHitch || 12), nHitches: hitches.length,
  };
}
function edgeMid(M, id) { const e = M.edges[id], t = M.sample(e, e.len / 2, {}); return { x: t.x, z: t.z, h: Math.atan2(t.dx, t.dz) }; }
function plaza(G) { const p = G.world.landmarks.poi.plaza || G.world.landmarks.poi.churchTower; return { x: p.x + 6, z: p.z + 6, h: 0 }; }

// the scene as it stands: what is drawn and with what
export function inventory() {
  const G = window.game, r = G.renderer;
  const meshes = { mesh: 0, instanced: 0, instances: 0, skinned: 0, points: 0, lines: 0, sprites: 0, visible: 0, castShadow: 0, tris: 0 };
  const mats = new Set(), geos = new Set(), texs = new Set();
  G.scene.traverse((o) => {
    if (o.isInstancedMesh) { meshes.instanced++; meshes.instances += o.count; } else if (o.isSkinnedMesh) meshes.skinned++; else if (o.isMesh) meshes.mesh++;
    if (o.isPoints) meshes.points++; if (o.isLine) meshes.lines++; if (o.isSprite) meshes.sprites++;
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
    if (o.visible) meshes.visible++;
    if (o.castShadow) meshes.castShadow++;
    const g = o.geometry; if (g) { geos.add(g); if (g.index) meshes.tris += (g.index.count / 3) * (o.isInstancedMesh ? o.count : 1); }
    for (const m of [].concat(o.material || [])) { mats.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); } if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) texs.add(u.value); }
  });
  let texMB = 0;
  const big = [];
  for (const t of texs) {
    const im = t.image || {}, w = im.width || 0, h = im.height || 0, d = im.depth || 1;
    const bpp = t.type === 1016 || t.type === 1015 ? (t.type === 1015 ? 16 : 8) : 4; // (half / float RGBA, else 8-bit RGBA)
    const mb = (w * h * d * bpp * (t.generateMipmaps !== false && t.minFilter !== 1006 ? 1.33 : 1)) / 1048576;
    texMB += mb;
    big.push({ name: t.name || (t.isDataArrayTexture ? 'array' : t.isCanvasTexture ? 'canvas' : 'tex'), w, h, d, mb: r1(mb) });
  }
  big.sort((a, b) => b.mb - a.mb);
  return { meshes, materials: mats.size, geometries: geos.size, textures: texs.size, texMB: Math.round(texMB), bigTextures: big.slice(0, 14), programs: r.info.programs ? r.info.programs.length : null, memory: r.info.memory, shadowMap: r.shadowMap.enabled ? (G.sky && G.sky.sun && G.sky.sun.shadow ? G.sky.sun.shadow.mapSize.x : '?') : 0, pr: r.getPixelRatio(), passes: G.composer ? G.composer.passes.map((p) => p.constructor.name) : [] };
}

// The game's own loop, as a player has it: requestAnimationFrame and the page's frame(), the bot driving (or walking,
// or turning the camera in the Plaza) the same route — the intervals between the frames the browser shows, and for
// each long one what the frame before it spent its time on. (The page must be on screen: a hidden page gets no
// animation frames; in the app's browser pane out of focus the browser itself takes a frame every 2 s — measure in a
// Chrome of its own, tools/perfrun.py.) The canvas is the page's; the dynamic resolution off unless dynRes: true.
export async function live(o = {}) {
  const G = window.game, M = G.map, route = o.route || 'drive', sec = o.sec ?? (route === 'spin' ? 15 : 30), warm = o.warm ?? 2;
  const traffic = await import('/src/traffic.js');
  const rnd0 = Math.random; Math.random = mulberry(o.seed ?? 1234);
  const dyn0 = G.save.dynRes; if (!o.dynRes) G.save.dynRes = false;
  const bot = await (await import('/tools/playtest.js')).setup();
  for (const k of ['moveX', 'moveY', 'throttle', 'brakeIn', 'steer']) bot[k] = 0;
  bot.sprint = false;
  G.state = 'play';
  const pp = document.getElementById('pause'); if (pp) pp.hidden = true;
  G.sky.hour = o.hour ?? 12;
  const p = G.player;
  if (p.vehicle) p.exitVehicle(true);
  const start = route === 'walk' ? edgeMid(M, 12) : route === 'spin' ? plaza(G) : edgeMid(M, 131);
  p.spawnAt(start.x, start.z, start.h || 0);
  G.cam.yaw = (start.h || 0) + Math.PI; G.cam.pitch = -0.15;
  if (route === 'drive') {
    G.fleet.streamParked(p.pos.x, p.pos.z);
    const vs = G.fleet.vehicles.filter((v) => !v.driver && !v.ai && !v.ctrl && !v.dead && !v.spec.twoWheel).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
    if (vs[0]) p.getIn(vs[0]);
  }
  const dests = (route === 'walk' ? WALK_TO : DRIVE_TO).map((id) => edgeMid(M, id));
  let di = 0;
  const st = { path: null, seg: 0 }, out = {};
  let stuck = 0, revT = 0, revSteer = 0;
  const plan = () => { const v = p.vehicle; if (v) { st.path = M.routeFrom(v.x, v.z, v.heading, dests[di].x, dests[di].z, {}); st.seg = 0; } };
  plan();
  const steer = (dt) => {
    if (route === 'spin') { G.cam.yaw += 1.2 * dt; return; }
    const v = p.vehicle, d = dests[di];
    if (route === 'walk') {
      const dx = d.x - p.pos.x, dz = d.z - p.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 4) { di = (di + 1) % dests.length; return; }
      const yaw = G.cam.forwardYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
      bot.moveY = (dx * fx + dz * fz) / dd; bot.moveX = (dx * -fz + dz * fx) / dd; bot.sprint = true;
      return;
    }
    if (!v) return;
    const f = traffic.followRoute(st, v.x, v.z, v.heading, Math.abs(v.speed), out);
    const tsp = traffic.turnSpeed(f.turn, v.spec.top * 0.8);
    const dx = f.x - v.x, dz = f.z - v.z, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lf = dx * fx + dz * fz, lr = dx * -fz + dz * fx;
    let s = Math.max(-1, Math.min(1, Math.atan2(lr, Math.max(0.1, lf)) * 1.6));
    if (lf < 0) s = lr >= 0 ? 1 : -1;
    bot.steer = s; bot.throttle = v.speed < tsp ? 1 : 0; bot.brakeIn = v.speed > tsp + 2 ? 1 : 0;
    if (revT > 0) { revT -= dt; bot.throttle = 0; bot.brakeIn = 1; bot.steer = revSteer; return; }
    if (v.vel < 0.8) stuck += dt; else stuck = 0;
    if (stuck > 1.5) { stuck = 0; revT = 1.8; revSteer = -s || 1; }
    if (f.done || Math.hypot(v.x - d.x, v.z - d.z) < 14) { di = (di + 1) % dests.length; plan(); }
  };
  // the systems' clocks and the drawing's, per frame (to say what a long frame was spent on)
  const acc = {}, wraps = [];
  for (const [label, get, m] of SYSTEMS) {
    const obj = get(G);
    if (!obj || typeof obj[m] !== 'function') continue;
    const f = obj[m], own = Object.prototype.hasOwnProperty.call(obj, m);
    acc[label] = 0;
    obj[m] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { acc[label] += performance.now() - t0; } };
    wraps.push(() => { if (own) obj[m] = f; else delete obj[m]; });
  }
  let tRender = 0;
  const render0 = G.render, ownRender = Object.prototype.hasOwnProperty.call(G, 'render');
  G.render = function (...a) { const t0 = performance.now(); try { return render0.apply(this, a); } finally { tRender += performance.now() - t0; } };
  const frame0 = Object.prototype.hasOwnProperty.call(G, 'frame') ? G.frame : null, realFrame = Object.getPrototypeOf(G).frame;
  const r = G.renderer, auto0 = r.info.autoReset; r.info.autoReset = false;
  const iv = [], work = [], hitches = [];
  let calls = 0, tris = 0, nF = 0, dist = 0, lx = p.pos.x, lz = p.pos.z;
  const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0, prog0 = r.info.programs ? r.info.programs.length : 0;
  // (all of it inside the page's own frame: the interval since the last one began, and what that last one cost — a
  // long interval is the previous frame's work, or the GPU holding the page back)
  let lastStart = 0, tStart = 0, prev = null, finish;
  const ended = new Promise((res) => { finish = res; });
  G.frame = function (dt) {
    const t0 = performance.now();
    if (!tStart) tStart = t0;
    const measuring = t0 - tStart > warm * 1000;
    if (lastStart && measuring && prev) {
      const d = t0 - lastStart;
      iv.push(d); work.push(prev.frame);
      if (d > 50) hitches.push({ at: r1((t0 - tStart) / 1000 - warm), ms: r1(d), frame: r1(prev.frame), render: r1(prev.render), top: prev.top });
    }
    lastStart = t0;
    if (G.state !== 'play') { G.state = 'play'; if (pp) pp.hidden = true; }
    steer(dt);
    for (const k in acc) acc[k] = 0;
    tRender = 0;
    r.info.reset();
    try { realFrame.call(this, dt); } finally {
      prev = { frame: performance.now() - t0, render: tRender, top: Object.entries(acc).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${r1(v)}`) };
      if (measuring) {
        calls += r.info.render.calls; tris += r.info.render.triangles; nF++;
        const px = p.vehicle ? p.vehicle.x : p.pos.x, pz = p.vehicle ? p.vehicle.z : p.pos.z;
        dist += Math.hypot(px - lx, pz - lz); lx = px; lz = pz;
      } else { lx = p.vehicle ? p.vehicle.x : p.pos.x; lz = p.vehicle ? p.vehicle.z : p.pos.z; }
      if (t0 - tStart > (sec + warm) * 1000) finish();
    }
  };
  await ended;
  for (const u of wraps) u();
  if (ownRender) G.render = render0; else delete G.render;
  if (frame0) G.frame = frame0; else delete G.frame;
  r.info.autoReset = auto0;
  Math.random = rnd0; G.save.dynRes = dyn0;
  bot.moveX = bot.moveY = bot.throttle = bot.steer = 0; bot.brakeIn = 1; bot.sprint = false;
  const s = iv.slice().sort((a, b) => a - b), mean = iv.reduce((a, b) => a + b, 0) / iv.length;
  const ws = work.slice().sort((a, b) => a - b);
  const jank = iv.reduce((a, x) => a + Math.max(0, x - 1000 / 60 * 1.5), 0); // (time lost to frames over 25 ms)
  return {
    route, sec, frames: iv.length, fps: r1(1000 / mean), metres: Math.round(dist),
    ms: { mean: r2(mean), p50: r2(q(s, 0.5)), p90: r2(q(s, 0.9)), p95: r2(q(s, 0.95)), p99: r2(q(s, 0.99)), max: r1(s[s.length - 1]) },
    low1: r1(1000 / q(s, 0.99)), over: { 20: iv.filter((x) => x > 20).length, 33: iv.filter((x) => x > 33.4).length, 50: iv.filter((x) => x > 50).length, 100: iv.filter((x) => x > 100).length },
    jankMs: Math.round(jank), work: { mean: r2(ws.reduce((a, b) => a + b, 0) / ws.length), p95: r2(q(ws, 0.95)), p99: r2(q(ws, 0.99)) },
    draw: nF ? { calls: Math.round(calls / nF), triangles: Math.round(tris / nF) } : null, newPrograms: (r.info.programs ? r.info.programs.length : 0) - prog0,
    heapMB: r1(((performance.memory ? performance.memory.usedJSHeapSize : 0) - heap0) / 1048576),
    hitches: hitches.sort((a, b) => b.ms - a.ms).slice(0, o.nHitch ?? 10), nHitch50: hitches.length,
    canvas: [r.domElement.width, r.domElement.height], pr: r.getPixelRatio(),
  };
}

// The whole measure, as it is compared before and after a change: a fresh page (its first-time costs included —
// shaders compiled, streets streamed in for the first time — as a player meets them), then 40 s driving, 30 s walking
// and 10 s turning the camera in the Plaza; the load's time is the page's own (navigation to the menu).
//   window.__suite = P.suite()  … then read window.__suite.out when window.__suite.done
export function suite(o = {}) {
  const S = { done: false, out: null, err: null, step: '' };
  (async () => {
    try {
      const out = { load: o.load ?? null, inv: null };
      for (const [route, sec] of o.runs || [['drive', 40], ['walk', 30], ['spin', 10]]) {
        S.step = route;
        const b = await bench({ route, sec, ...(o.bench || {}) });
        out[route] = { fps: b.fps, low1: b.low1, ms: b.ms, over: b.over, cpu: b.cpu, gpuWait: b.gpuWait, draw: b.draw, newPrograms: b.newPrograms, metres: b.metres, heapMB: b.heapMB, systems: b.systems, gl: b.gl, hitches: b.hitches.slice(0, o.nHitch ?? 6), nHitches: b.nHitches };
      }
      S.step = 'inventory';
      out.inv = inventory();
      S.out = out;
    } catch (e) { S.err = String((e && e.stack) || e); }
    S.done = true;
  })();
  return S;
}

// What a frame's drawing costs, piece by piece: the same still view drawn n times, each one waited for to the end of
// the GPU's work (a pixel read back), with parts of the pipeline switched off in turn — the scene alone, without its
// shadows, without each pass — and at other resolutions. (The game's loop held meanwhile.)
//   await P.costs({ at: 'plaza' | 'street', prs: [2, 1.5, 1] })
export async function costs(o = {}) {
  const G = window.game, r = G.renderer, gl = r.getContext(), n = o.n ?? 20;
  const own = Object.prototype.hasOwnProperty.call(G, 'frame') ? G.frame : null;
  G.frame = () => {};
  await new Promise((res) => setTimeout(res, 100));
  const p = G.player, at = o.at === 'street' ? edgeMid(G.map, 131) : plaza(G);
  if (p.vehicle) p.exitVehicle(true);
  p.spawnAt(at.x, at.z, at.h || 0);
  G.cam.yaw = (at.h || 0) + Math.PI + (o.yaw || 0); G.cam.pitch = -0.15;
  G.sky.hour = o.hour ?? 12;
  const realFrame = Object.getPrototypeOf(G).frame.bind(G);
  for (let i = 0; i < 30; i++) realFrame(1 / 60); // (settle the camera and the streaming there)
  const px = new Uint8Array(4);
  const sync = () => { const t = r.getRenderTarget(); r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(t); };
  const time = (fn) => { fn(); sync(); fn(); sync(); const t0 = performance.now(); for (let i = 0; i < n; i++) { fn(); sync(); } return r2((performance.now() - t0) / n); };
  const setPR = (x) => { r.setPixelRatio(x); if (G.composer) G.composer.setPixelRatio(x); G.resize(); };
  const pr0 = r.getPixelRatio(), out = {};
  const passes = G.composer ? G.composer.passes : [];
  const nameOf = (ps) => (ps === G.gtao ? 'gtao' : ps === G.grade ? 'grade' : G.lens && G.lens.includes(ps) ? 'lens' : ps === G.bloom ? 'bloom' : ps.constructor.name);
  for (const pr of o.prs || [2, 1.5, 1]) {
    setPR(pr);
    const R = {};
    R.full = time(() => G.render());
    r.shadowMap.autoUpdate = false; R.noShadowUpdate = time(() => G.render()); r.shadowMap.autoUpdate = true;
    for (const nm of ['gtao', 'lens', 'bloom', 'grade']) {
      const ps = passes.filter((x) => nameOf(x) === nm);
      if (!ps.length) continue;
      for (const x of ps) x.enabled = false;
      R['no_' + nm] = time(() => G.render());
      for (const x of ps) x.enabled = true;
    }
    // the scene alone into the canvas (no post), and the post alone (an empty scene)
    R.sceneOnly = time(() => { r.setRenderTarget(null); r.render(G.scene, G.camera); });
    const rp = passes[0], sc = rp && rp.scene, empty = new (G.scene.constructor)();
    if (rp) { rp.scene = empty; r.shadowMap.autoUpdate = false; R.postOnly = time(() => G.render()); rp.scene = sc; r.shadowMap.autoUpdate = true; }
    // the CPU's part alone: the same calls, not waited for
    { G.render(); sync(); const t0 = performance.now(); for (let i = 0; i < n; i++) G.render(); R.cpuIssue = r2((performance.now() - t0) / n); sync(); }
    R.canvas = r.domElement.width + 'x' + r.domElement.height;
    out['pr' + pr] = R;
  }
  setPR(pr0);
  r.info.autoReset = false; r.info.reset(); G.render(); out.draw = { calls: r.info.render.calls, triangles: r.info.render.triangles }; r.info.autoReset = true;
  if (own) G.frame = own; else delete G.frame;
  return out;
}

// What is drawn, by kind: the draw calls of one frame in the camera's view and in the sun's shadow map, grouped by
// the top-level object they belong to (its name, or its class), and the scene graph's size.
export function drawsBy(o = {}) {
  const G = window.game, r = G.renderer, scene = G.scene;
  const top = new Map();
  scene.children.forEach((c, i) => top.set(c, (c.name || c.type) + '#' + i));
  const cat = (obj) => {
    const path = []; let o2 = obj; while (o2.parent && o2 !== scene) { path.unshift(o2); o2 = o2.parent; }
    if (o2 !== scene) return 'detached';
    const a = path[0], b = path[1];
    const nm = (x) => (x.name || x.type) + (x.parent ? '#' + x.parent.children.indexOf(x) : '');
    let t = nm(a);
    if (a.children.length > 3 && b) t += '/' + (b.name || b.type) + (b.children.length > 3 && path[2] ? '/' + (path[2].name || path[2].type) : '');
    if (/^(Mesh|Group|Object3D)#\d+$/.test(t) && a.children.length) t = 'top ' + (a.name || a.type) + ' [' + a.children.length + ' ch]';
    return (obj.isSkinnedMesh ? 'skinned ' : obj.isInstancedMesh ? 'inst ' : '') + t + (o.mat ? ' ' + (obj.material && (obj.material.name || obj.material.type)) : '');
  };
  const main = new Map(), shadow = new Map(), tri = new Map();
  const rbd = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    const m = camera.isOrthographicCamera && sc === null ? shadow : main;
    const k = cat(object);
    m.set(k, (m.get(k) || 0) + 1);
    if (m === main && geometry.index) tri.set(k, (tri.get(k) || 0) + geometry.index.count / 3 * (object.isInstancedMesh ? object.count : 1));
    return rbd.apply(this, arguments);
  };
  try { G.render(); } finally { r.renderBufferDirect = rbd; }
  let nodes = 0, auto = 0, meshes = 0, bones = 0;
  scene.traverse((x) => { nodes++; if (x.matrixAutoUpdate) auto++; if (x.isMesh) meshes++; if (x.isBone) bones++; });
  const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.n || 25).map(([k, v]) => `${v} ${k}`);
  return { nodes, matrixAuto: auto, meshes, bones, mainCalls: [...main.values()].reduce((a, b) => a + b, 0), shadowCalls: [...shadow.values()].reduce((a, b) => a + b, 0), main: sort(main), shadow: sort(shadow), tris: [...tri.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${Math.round(v / 1000)}k ${k}`) };
}

// The same, as an A/B of pipeline variants: each variant switched on, the still view drawn n times (each waited for
// to the GPU's end), switched off — round after round, the variants taking turns (so a busier moment of the machine
// falls on all of them), and the median of the rounds kept.
//   await P.variants({ at: 'street', rounds: 4, n: 16, only: ['base', 'gtaoHalf', …] })
export async function variants(o = {}) {
  const G = window.game, r = G.renderer, gl = r.getContext(), n = o.n ?? 16, rounds = o.rounds ?? 4;
  const own = Object.prototype.hasOwnProperty.call(G, 'frame') ? G.frame : null;
  G.frame = () => {};
  await new Promise((res) => setTimeout(res, 100));
  const p = G.player, at = o.at === 'plaza' ? plaza(G) : edgeMid(G.map, o.edge ?? 131);
  if (p.vehicle) p.exitVehicle(true);
  p.spawnAt(at.x, at.z, at.h || 0);
  G.cam.yaw = (at.h || 0) + Math.PI + (o.yaw || 0); G.cam.pitch = -0.15;
  G.sky.hour = o.hour ?? 12;
  const realFrame = Object.getPrototypeOf(G).frame.bind(G);
  for (let i = 0; i < 40; i++) realFrame(1 / 60);
  const px = new Uint8Array(4);
  const sync = () => { const t = r.getRenderTarget(); r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(t); };
  const time = (fn) => { fn(); sync(); fn(); sync(); const t0 = performance.now(); for (let i = 0; i < n; i++) { fn(); sync(); } return (performance.now() - t0) / n; };
  const pr0 = r.getPixelRatio();
  const setPR = (x) => { r.setPixelRatio(x); if (G.composer) G.composer.setPixelRatio(x); G.resize(); };
  const passes = G.composer ? G.composer.passes : [];
  const lens = G.lens || [], gtao = G.gtao, bloom = G.bloom;
  const V = {
    base: [() => {}, () => {}],
    noShadowUpd: [() => { r.shadowMap.autoUpdate = false; }, () => { r.shadowMap.autoUpdate = true; }],
    noGtao: [() => { if (gtao) gtao.enabled = false; }, () => { if (gtao) gtao.enabled = true; }],
    gtaoHalf: [() => { if (!gtao) return; gtao._ss = gtao.setSize; const ss = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => ss(Math.ceil(w / 2), Math.ceil(h / 2)); G.resize(); }, () => { if (gtao && gtao._ss) { gtao.setSize = gtao._ss; delete gtao._ss; G.resize(); } }],
    noLens: [() => { for (const x of lens) x.enabled = false; }, () => { for (const x of lens) x.enabled = true; }],
    noBloom: [() => { if (bloom) bloom.enabled = false; }, () => { if (bloom) bloom.enabled = true; }],
    noGrade: [() => { if (G.grade) G.grade.enabled = false; }, () => { if (G.grade) G.grade.enabled = true; }],
    pr15: [() => setPR(1.5), () => setPR(pr0)],
    pr1: [() => setPR(1), () => setPR(pr0)],
    msaa2: [() => { for (const t of [G.composer.renderTarget1, G.composer.renderTarget2]) { t.dispose(); t.samples = 2; } }, () => { for (const t of [G.composer.renderTarget1, G.composer.renderTarget2]) { t.dispose(); t.samples = 4; } }],
    msaa0: [() => { for (const t of [G.composer.renderTarget1, G.composer.renderTarget2]) { t.dispose(); t.samples = 0; } }, () => { for (const t of [G.composer.renderTarget1, G.composer.renderTarget2]) { t.dispose(); t.samples = 4; } }],
    sceneOnly: [() => { G._r0 = G.render; G.render = () => { r.setRenderTarget(null); r.render(G.scene, G.camera); }; }, () => { G.render = G._r0; delete G._r0; }],
  };
  const names = (o.only || Object.keys(V)).filter((k) => V[k]);
  const res = Object.fromEntries(names.map((k) => [k, []]));
  for (let k = 0; k < rounds; k++) for (const nm of names) { V[nm][0](); const t = time(() => G.render()); V[nm][1](); res[nm].push(t); }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return r2(s[s.length >> 1]); };
  const out = Object.fromEntries(names.map((k) => [k, med(res[k])]));
  out.spread = Object.fromEntries(names.map((k) => [k, [r1(Math.min(...res[k])), r1(Math.max(...res[k]))]]));
  out.canvas = r.domElement.width + 'x' + r.domElement.height;
  if (own) G.frame = own; else delete G.frame;
  return out;
}
