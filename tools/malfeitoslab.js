// Calle Malfeitos lab: the 21 Street View views the user photographed (May 2024 imagery, there and back) as camera poses,
// and the game photographed from each of them, to compare facade by facade. The screenshots are only a reference for
// modelling by hand: nothing of them goes into the game.
//   const MF = await import('/tools/malfeitoslab.js?' + Date.now());
//   await MF.shot(1)                 // view 1 → .snaps/mf_01.jpg (the game from where the Street View camera stood)
//   await MF.all()                   // every view
//   MF.where(3)                      // view 3 in the game's metres
import { setup } from '/tools/playtest.js';

// [lat, lon, heading°, tilt° (90 = level), vertical field of view°] from each screenshot's address bar
export const VIEWS = [
  [38.8616327, -6.1012251, 182.07, 95.24, 75], [38.8615187, -6.1012437, 182.07, 95.24, 75], [38.8614199, -6.1012391, 182.07, 95.24, 75],
  [38.8613237, -6.1012283, 182.07, 95.24, 75], [38.8612311, -6.1012205, 182.07, 95.24, 75], [38.861142, -6.1012151, 182.07, 95.24, 75],
  [38.8610567, -6.1012107, 182.07, 95.24, 75], [38.8609704, -6.1012067, 182.07, 95.24, 75], [38.8608142, -6.1012234, 182.07, 95.24, 75],
  [38.8607466, -6.1012002, 182.07, 95.24, 75], [38.8605634, -6.101207, 182.07, 95.24, 75], [38.8603603, -6.1012535, 182.07, 95.24, 75],
  [38.8603603, -6.1012535, 20.7, 92.72, 75], [38.8604715, -6.1012344, 20.7, 92.72, 75], [38.8605634, -6.101207, 20.7, 92.72, 75],
  [38.8606542, -6.1012024, 20.7, 92.72, 75], [38.8608142, -6.1012234, 20.7, 92.72, 75], [38.8609704, -6.1012067, 25.55, 95.36, 88.6],
  [38.8610567, -6.1012107, 25.55, 95.36, 75], [38.8612311, -6.1012205, 25.55, 95.36, 75], [38.8614199, -6.1012391, 25.55, 95.36, 75],
];
// each picture's heading corrected by the street's vanishing point in it (the mean of the panorama's two views; metres
// east, metres south, degrees): the positions stay the GPS ones
export const CORR = {1: [0, 0, 1.16], 2: [0, 0, 1.13], 3: [0, 0, -0.72], 4: [0, 0, 0.88], 5: [0, 0, -0.01], 6: [0, 0, 1.07], 7: [0, 0, 1.04], 8: [0, 0, -1.16], 9: [0, 0, 0.36], 10: [0, 0, 0.14], 11: [0, 0, -0.07], 12: [0, 0, 0.47], 13: [0, 0, 0.47], 14: [0, 0, 0.16], 15: [0, 0, -0.07], 16: [0, 0, -1.04], 17: [0, 0, 0.36], 18: [0, 0, -1.16], 19: [0, 0, 1.04], 20: [0, 0, -0.01], 21: [0, 0, -0.72]};
const LAT0 = 38.8596, LON0 = -6.1025, R = 6378137;
const KX = (Math.cos((LAT0 * Math.PI) / 180) * R * Math.PI) / 180, KZ = (R * Math.PI) / 180;
export const proj = (lat, lon) => ({ x: (lon - LON0) * KX, z: -(lat - LAT0) * KZ });
export function where(n, raw = false) {
  const [lat, lon, h, t, fov] = VIEWS[n - 1], p = proj(lat, lon), c = raw ? [0, 0, 0] : CORR[n] || [0, 0, 0];
  return { x: +(p.x + c[0]).toFixed(2), z: +(p.z + c[1]).toFixed(2), heading: h + c[2], up: +(t - 90).toFixed(2), fov };
}
// a correction for the Street View positions (their GPS runs ~2 m east of the street's centre): set by hand after looking
export const shift = { x: 0, z: 0, eye: 2.5 };

const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const step = (n) => { const G = window.game; for (let i = 0; i < n; i++) { if (G.state !== 'play') { G.state = 'play'; const p = document.getElementById('pause'); if (p) p.hidden = true; } G.frame(1 / 30); } };
async function post(name, canvas) {
  await fetch('/__snap?name=' + name, { method: 'POST', body: canvas.toDataURL('image/jpeg', 0.88) });
}

// the camera where the Street View one stood; w × h is the screenshots' panorama (3600 × 2016 → 1800 × 1008)
export function pose(n, o = {}) {
  const G = window.game, c = G.camera;
  const v = where(n), x = v.x + (o.dx ?? shift.x), z = v.z + (o.dz ?? shift.z);
  const h = ((o.heading ?? v.heading) * Math.PI) / 180, up = ((o.up ?? v.up) * Math.PI) / 180;
  c.fov = o.fov ?? v.fov;
  c.position.set(x, o.eye ?? shift.eye, z);
  // compass heading → the game's frame (x east, z south)
  c.lookAt(x + Math.sin(h) * Math.cos(up), c.position.y + Math.sin(up), z - Math.cos(h) * Math.cos(up));
  c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  return { x, z };
}
export async function shot(n, o = {}) {
  const G = window.game, r = G.renderer, w = o.w || 1800, h = o.h || 1008;
  await setup();
  const v = where(n);
  if (G.player.vehicle) G.player.exitVehicle(true);
  G.player.spawnAt(v.x, v.z, 0);
  G.sky.hour = o.hour ?? 16.2; // (the pictures: a May afternoon, the sun on the east side's fronts)
  // the May morning of the pictures: a clear sky whatever the real one says now (not saved: the setting stays)
  if (G.weather && o.clear !== false) { const W = G.weather; clearTimeout(W.timer); W.on = false; W.data = null; Object.assign(W.now, { cover: 0.3, over: 0, rain: 0, snow: 0, fog: 0, storm: 0, fogFar: 3000 }); }
  step(o.warm ?? 60);
  r.setSize(w, h, false);
  if (G.composer) { G.composer.setSize(w, h); if (G.bloom) G.bloom.setSize(w, h); }
  G.camera.aspect = w / h;
  const ch = G.player.char, body = ch && (ch.root || ch.group || ch.mesh);
  if (body) body.visible = false;
  // a few frames with the camera held there (shadows, the claymation's pose, streaming round it)
  for (let k = 0; k < 4; k++) { step(1); pose(n, o); G.sky.update(0, G.camera.position); G.render(); }
  const c = r.domElement, out = document.createElement('canvas');
  out.width = c.width; out.height = c.height; out.getContext('2d').drawImage(c, 0, 0);
  if (body) body.visible = true;
  await post(o.name || `mf_${String(n).padStart(2, '0')}${o.tag ? '_' + o.tag : ''}`, out);
  return { n, ...pose(n, o), size: [c.width, c.height] };
}
// several views in a row (the town is built once): MF.some([2, 3, 21], { tag: 'real' })
export async function some(list, o = {}) {
  const done = [];
  for (const n of list) { done.push(await shot(n, o)); await yieldNow(); }
  window.game.resize();
  return done.map((d) => d.n);
}
export async function all(o = {}) {
  const done = [];
  for (let n = 1; n <= VIEWS.length; n++) { done.push(await shot(n, o)); await yieldNow(); }
  window.game.resize();
  return done;
}
