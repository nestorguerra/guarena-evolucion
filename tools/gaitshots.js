// Dev-only: film strips of a character walking / running past a fixed camera (side view), to see the feet stay put.
//   const S = await import('/tools/gaitshots.js?' + Date.now()); await S.strip(0, 1.4, 'w')
import * as THREE from 'three';
import { Character, PLAYER_PRESETS } from '/src/characters.js';
import { build, SPOT } from '/tools/faces.js';
const G = () => window.game;
async function post(name, url) { await fetch('/__snap?name=' + name, { method: 'POST', body: url }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } }
function render(cam) {
  const g = G(), keep = g.camera;
  if (g.renderView) { g.camera = cam; try { g.renderView(cam); } finally { g.camera = keep; } return; }
  g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
}
// n frames over one stride, each W×H, side by side; lock=false shows the old animation
export async function strip(desc, v, tag = '', { n = 8, W = 300, H = 520, lock = true, moveDir = 0, crouch = false, view = 'side' } = {}) {
  const g = G();
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 12, Math.PI);
  const ch = await build({ ...(typeof desc === 'number' ? PLAYER_PRESETS[desc] : desc), hq: true });
  g.scene.add(ch.object); ch.setDistance(1, true);
  Character.footLock = lock;
  const dt = 1 / 120, head = Math.PI / 2 - moveDir; // travel along +x
  let x = -1.5;
  const place = () => { ch.object.position.set(SPOT.x + x, 0, SPOT.z); ch.object.rotation.set(0, head, 0); };
  const step = () => { x += v * dt; place(); ch.update(dt, v, { moveDir, crouch }); };
  for (let i = 0; i < 360; i++) step();
  // one full stride from a heel strike of the right foot
  let guard = 0; while ((ch.legPh - Math.floor(ch.legPh)) > 0.02 && guard++ < 400) step();
  const cyc = 1 / (ch.cad || 1), frames = [];
  size(W, H);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
  const cx = SPOT.x + x + v * cyc * 0.5;
  if (view === 'side') { cam.position.set(cx, 0.95, SPOT.z - 5.2); cam.lookAt(cx, 0.85, SPOT.z); }
  else { cam.position.set(cx + 4.5, 1.0, SPOT.z - 2.6); cam.lookAt(cx, 0.8, SPOT.z); }
  for (let f = 0; f < n; f++) {
    ch.object.updateMatrixWorld(true);
    render(cam);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(g.renderer.domElement, 0, 0, g.renderer.domElement.width, g.renderer.domElement.height, 0, 0, W, H);
    frames.push(c);
    const k = Math.round(cyc / n / dt); for (let i = 0; i < k; i++) step();
  }
  Character.footLock = true;
  g.scene.remove(ch.object); ch.dispose();
  // strip + an onion-skin overlay (planted feet stay sharp)
  const out = document.createElement('canvas'); out.width = W * (n + 1); out.height = H;
  const cx2 = out.getContext('2d');
  frames.forEach((c, i) => cx2.drawImage(c, i * W, 0));
  cx2.globalAlpha = 1 / n * 1.6;
  frames.forEach((c) => cx2.drawImage(c, n * W, 0));
  cx2.globalAlpha = 1;
  // ground line
  cx2.strokeStyle = 'rgba(255,60,60,0.5)'; cx2.beginPath();
  g.resize();
  await post('gait_' + tag, out.toDataURL('image/jpeg', 0.85));
  return 'gait_' + tag;
}

// onion skin: n exposures over `cycles` strides, fixed wide camera low at the feet; a planted foot stays sharp
export async function onion(desc, v, tag = '', { n = 24, cycles = 1.5, W = 1400, H = 420, lock = true, moveDir = 0, crouch = false } = {}) {
  const g = G();
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 12, Math.PI);
  const ch = await build({ ...(typeof desc === 'number' ? PLAYER_PRESETS[desc] : desc), hq: true });
  g.scene.add(ch.object); ch.setDistance(1, true);
  Character.footLock = lock;
  const dt = 1 / 120, head = Math.PI / 2 - moveDir;
  let x = -3;
  const place = () => { ch.object.position.set(SPOT.x + x, 0, SPOT.z); ch.object.rotation.set(0, head, 0); };
  const step = () => { x += v * dt; place(); ch.update(dt, v, { moveDir, crouch }); };
  for (let i = 0; i < 360; i++) step();
  let guard = 0; while ((ch.legPh - Math.floor(ch.legPh)) > 0.02 && guard++ < 400) step();
  const cyc = 1 / (ch.cad || 1), span = v * cyc * cycles;
  size(W, H);
  const cam = new THREE.PerspectiveCamera(22, W / H, 0.05, 400);
  const cx = SPOT.x + x + span * 0.5;
  cam.position.set(cx, 0.55, SPOT.z - 7.5); cam.lookAt(cx, 0.35, SPOT.z);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const c2 = out.getContext('2d');
  for (let f = 0; f < n; f++) {
    ch.object.updateMatrixWorld(true);
    render(cam);
    c2.globalAlpha = f === 0 ? 1 : 1 / (f + 1);
    c2.drawImage(g.renderer.domElement, 0, 0, g.renderer.domElement.width, g.renderer.domElement.height, 0, 0, W, H);
    const k = Math.round((cyc * cycles) / n / dt); for (let i = 0; i < k; i++) step();
  }
  Character.footLock = true;
  g.scene.remove(ch.object); ch.dispose();
  g.resize();
  await post('onion_' + tag, out.toDataURL('image/jpeg', 0.88));
  return 'onion_' + tag;
}

// feet rows: a fixed camera on the feet, one row per frame (top to bottom), a grid every 10 cm on the ground line;
// a planted foot keeps its place from row to row
export async function feet(desc, v, tag = '', { n = 10, cycles = 1, W = 1000, H = 170, lock = true, moveDir = 0, crouch = false, span } = {}) {
  const g = G();
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 12, Math.PI);
  const ch = await build({ ...(typeof desc === 'number' ? PLAYER_PRESETS[desc] : desc), hq: true });
  g.scene.add(ch.object); ch.setDistance(1, true);
  Character.footLock = lock;
  const dt = 1 / 120, head = Math.PI / 2 - moveDir;
  let x = -3;
  const place = () => { ch.object.position.set(SPOT.x + x, 0, SPOT.z); ch.object.rotation.set(0, head, 0); };
  const step = () => { x += v * dt; place(); ch.update(dt, v, { moveDir, crouch }); };
  for (let i = 0; i < 360; i++) step();
  let guard = 0; while ((ch.legPh - Math.floor(ch.legPh)) > 0.02 && guard++ < 400) step();
  const cyc = 1 / (ch.cad || 1), travel = v * cyc * cycles, wide = span || travel + 1.4;
  size(W, H);
  const dist = 6, fov = 2 * Math.atan((wide * H / W) / 2 / dist) * 180 / Math.PI;
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 400);
  const cx = SPOT.x + x + travel * 0.5;
  cam.position.set(cx, 0.22, SPOT.z - dist); cam.lookAt(cx, 0.22, SPOT.z);
  const out = document.createElement('canvas'); out.width = W; out.height = H * n;
  const c2 = out.getContext('2d');
  for (let f = 0; f < n; f++) {
    ch.object.updateMatrixWorld(true);
    render(cam);
    c2.drawImage(g.renderer.domElement, 0, 0, g.renderer.domElement.width, g.renderer.domElement.height, 0, f * H, W, H);
    const k = Math.round((cyc * cycles) / n / dt); for (let i = 0; i < k; i++) step();
  }
  // grid: every 10 cm along the walk, projected onto the ground under the feet
  const P = new THREE.Vector3();
  c2.lineWidth = 1;
  for (let gx = Math.floor((cx - wide) * 10) / 10; gx < cx + wide; gx += 0.1) {
    P.set(gx, 0, SPOT.z).project(cam);
    const px = (P.x * 0.5 + 0.5) * W;
    c2.strokeStyle = Math.abs(Math.round(gx * 10) % 5) === 0 ? 'rgba(255,40,40,0.55)' : 'rgba(255,255,0,0.3)';
    c2.beginPath(); c2.moveTo(px, 0); c2.lineTo(px, H * n); c2.stroke();
  }
  Character.footLock = true;
  g.scene.remove(ch.object); ch.dispose();
  g.resize();
  await post('feet_' + tag, out.toDataURL('image/jpeg', 0.88));
  return 'feet_' + tag;
}
