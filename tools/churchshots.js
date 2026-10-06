// Dev-only: photos of the inside of Santa María (src/church.js) from where a visitor would stand, at the hours asked.
//   const C = await import('/tools/churchshots.js?' + Date.now()); await C.shoot('a', { hours: [10.5] })  → .snaps/ch_<view>_<tag>.jpg
import * as THREE from 'three';
const G = () => window.game;
async function post(name) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.86) }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) g.composer.setSize(w, h); }
// the views (church coordinates: x to the altar, z south): [name, eye, target, fov]
export const VIEWS = [
  ['nave', [-21.2, 1.7, 0.6], [10, 6, 0], 62],
  ['medio', [-2, 1.7, -1.6], [24, 6.5, 0], 58],
  ['retablo', [12.8, 1.8, 0], [25, 8.5, 0], 55],
  ['boveda', [-5, 1.7, 0], [-4.5, 21, 0.3], 80],
  ['coro', [12, 2.2, 2], [-26, 9, 0], 60],
  ['capilla', [-12, 1.7, 4.5], [-15, 3, 10.5], 62],
  ['pulpito', [4, 1.7, 3], [-1, 4, -6.5], 58],
  ['abside', [16, 1.8, -3], [24, 15, 1.5], 70],
  ['oculo', [-12, 8, 0], [-26.5, 12.5, 0], 50],
  ['sol', [2, 1.7, 5], [-8, 0.5, -6], 75],
  ['virgen', [19.5, 3.4, 0.4], [25, 7.6, 0], 42],
  ['predela', [21.5, 2.2, 1.2], [25, 2.6, 0], 60],
  ['cristo', [-5.2, 1.7, -5.5], [-5.2, 3.2, -11], 55],
  ['inmac', [14.2, 1.7, 5.5], [14.2, 3.2, 11], 55],
  ['dolor', [-14.75, 1.7, 5.5], [-14.75, 3.1, 11], 55],
]; // (eyes and targets in church coordinates)
export async function shoot(tag = '', { hours = [10.5], W = 720, H = 900, only = null } = {}) {
  const g = G(), I = g.interiors;
  if (!g.interior || !g.interior.church) {
    const d = I.doors.find((q) => q.church === 'oeste');
    g.player.spawnAt(d.x, d.z, 0);
    await I.enter(d, { mode: 'visit', spot: 'entrada', silent: true });
  }
  const h = g.interior, O = h.origin;
  const keepR = g.render; g.render = () => {};
  size(W, H);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 400);
  const out = [];
  try {
    for (const hour of hours) {
      g.sky.hour = hour;
      for (let i = 0; i < 3; i++) { g.state = 'play'; g.frame(1 / 30); }
      for (const [name, e, t, fov] of VIEWS) {
        if (only && !only.includes(name)) continue;
        cam.fov = fov; cam.position.set(O.x + e[0], e[1], O.z + e[2]); cam.lookAt(O.x + t[0], t[1], O.z + t[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        g.sky.update(0, cam.position, true);
        g.interiors.dimSky();
        const keep = g.camera; g.camera = cam;
        try { g.renderView(cam); } finally { g.camera = keep; }
        const nm = `ch_${name}_${tag}${hours.length > 1 ? '_' + String(hour).replace('.', 'h') : ''}`;
        await post(nm);
        out.push(nm);
      }
    }
  } finally { g.render = keepR; g.resize(); }
  return out;
}
