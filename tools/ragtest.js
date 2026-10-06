// Dev-only: knock a character down and film it (ragdoll falls, getting up).
//   const R = await import('/tools/ragtest.js?' + Date.now()); await R.fall(0, { vel: [6, 2.5, 0], legs: 0.6 }, 'car')
import * as THREE from 'three';
import { PLAYER_PRESETS } from '/src/characters.js';
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
export const env = () => { const g = G(); return { floor: () => 0, collide: (p, r) => g.map.collider.resolveCircle(p, r) }; };

// times: when to take the pictures (s after the blow); getUp: seconds after the blow to get up (then film on)
export async function fall(desc, o, tag = '', { times = [0, 0.15, 0.3, 0.5, 0.8, 1.2, 2, 3], W = 420, H = 420, heading = 0, getUp = 0, dist = 4.2, side = 1, stats = false } = {}) {
  const g = G();
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 14, Math.PI);
  const ch = await build({ ...(typeof desc === 'number' ? PLAYER_PRESETS[desc] : desc), hq: true });
  g.scene.add(ch.object); ch.setDistance(1, true);
  ch.object.position.set(SPOT.x, 0, SPOT.z); ch.object.rotation.set(0, heading, 0);
  for (let i = 0; i < 60; i++) ch.update(1 / 60, o.walk || 0, {});
  ch.object.updateMatrixWorld(true);
  ch.ragdoll({ env: env(), ...o });
  size(W, H);
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 400);
  const frames = [], log = [];
  let t = 0, k = 0, up = null;
  const pv = new THREE.Vector3();
  const end = times[times.length - 1];
  while (t <= end + 1e-6) {
    if (k < times.length && t >= times[k] - 1e-6) {
      ch.ragPos(pv);
      const cx = pv.x, cz = pv.z;
      cam.position.set(cx + side * 0.4, 1.3, cz - dist * side); cam.lookAt(cx, Math.max(0.35, pv.y * 0.7), cz);
      ch.object.updateMatrixWorld(true);
      render(cam);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(g.renderer.domElement, 0, 0, g.renderer.domElement.width, g.renderer.domElement.height, 0, 0, W, H);
      frames.push(c); k++;
      if (stats) log.push(`${t.toFixed(2)} pelvis=(${pv.x.toFixed(2)},${pv.y.toFixed(2)},${pv.z.toFixed(2)}) sleep=${ch.rag ? ch.rag.sleeping : '-'} faceUp=${ch.rag ? ch.rag.faceUp() : '-'}`);
    }
    if (getUp && !up && t >= getUp && ch.rag) { up = ch.getUp ? ch.getUp() : null; if (up) { ch.object.position.set(up.x, 0, up.z); ch.object.rotation.set(0, up.heading, 0); } }
    ch.update(1 / 60, 0, {});
    if (up) { ch.object.position.set(up.x, 0, up.z); ch.object.rotation.set(0, up.heading, 0); }
    t += 1 / 60;
  }
  g.scene.remove(ch.object); ch.dispose();
  const cols = Math.min(frames.length, 4), rows = Math.ceil(frames.length / cols);
  const out = document.createElement('canvas'); out.width = W * cols; out.height = H * rows;
  const c2 = out.getContext('2d');
  frames.forEach((c, i) => { c2.drawImage(c, (i % cols) * W, Math.floor(i / cols) * H); c2.fillStyle = '#fff'; c2.font = '20px sans-serif'; c2.fillText(times[i] + ' s', (i % cols) * W + 8, Math.floor(i / cols) * H + 24); });
  g.resize();
  await post('rag_' + tag, out.toDataURL('image/jpeg', 0.86));
  return stats ? log.join('\n') : 'rag_' + tag;
}
