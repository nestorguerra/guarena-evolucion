// Dev-only: the three test views of the visual spec («Guareña — Especificación visual global», the Diorama look),
// always the same: (1) a street looking up at Santa María, (2) a narrow street of whitewashed houses, (3) a crossroads
// with a little square. The player stands there at 14:00 and the game's own camera is behind them, as in the
// reference pictures. Run it in each look (?estilo=anime|real|diorama, and the Acuarela look) and compare the sheets.
//   const C = await import('/tools/lookcompare.js?' + Date.now()); await C.shoot('manga')
//   → .snaps/look_<tag>.jpg (three views side by side) and C.views() for the spots
import * as THREE from 'three';
import { renderInto } from '/tools/herolab.js';
const G = () => window.game;
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
