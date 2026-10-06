// Dev-only: photos of any place in town, from where you say, through the game's own pipeline.
//   const P = await import('/tools/placeshots.js?' + Date.now());
//   P.ll(38.8591608, -6.1029444)                      → [x, z] (world metres from lat/lon)
//   await P.shoot('a', [['fuente', [x, 1.7, z], [tx, 1, tz], 60], …], { hour: 11 })  → .snaps/pl_<name>_<tag>.jpg
import * as THREE from 'three';
const G = () => window.game;
async function post(name) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.86) }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); }
export function ll(lat, lon) {
  const o = G().map.raw.origin, R = 6378137, KX = Math.cos((o[0] * Math.PI) / 180) * R * Math.PI / 180, KZ = R * Math.PI / 180;
  return [(lon - o[1]) * KX, -(lat - o[0]) * KZ];
}
// a view looking at (tx, tz) from a distance d, at a bearing a (radians, 0 = from the south), height y
export function around(name, tx, tz, d, a, y = 6, ty = 1.5, fov = 60) { return [name, [tx + Math.sin(a) * d, y, tz + Math.cos(a) * d], [tx, ty, tz], fov]; }
export async function shoot(tag, views, { hour = 11, W = 960, H = 600 } = {}) {
  const g = G();
  if (g.interior) g.interiors.leave();
  const keepR = g.render; g.render = () => {};
  size(W, H);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 2500);
  const out = [];
  try {
    g.sky.hour = hour;
    for (const [name, e, t, fov] of views) {
      g.player.pos.set(e[0], 0, e[2]);
      for (let i = 0; i < 3; i++) { g.state = 'play'; g.frame(1 / 30); }
      cam.fov = fov || 60; cam.position.set(e[0], e[1], e[2]); cam.lookAt(t[0], t[1], t[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      g.sky.update(0, cam.position, true);
      const keep = g.camera; g.camera = cam;
      try { g.renderView(cam); } finally { g.camera = keep; }
      await post(`pl_${name}_${tag}`);
      out.push(`pl_${name}_${tag}`);
    }
  } finally { g.render = keepR; g.resize(); }
  return out;
}
