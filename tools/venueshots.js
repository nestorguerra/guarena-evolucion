// Dev-only: photos inside the public buildings (src/venues.js). Views in the venue's coordinates (x across, z in from
// the street front, y up).
//   const V = await import('/tools/venueshots.js?' + Date.now()); await V.shoot('ayto', 'a', V.VIEWS.ayto)  → .snaps/vn_<kind>_<view>_<tag>.jpg
import * as THREE from 'three';
const G = () => window.game;
async function post(name) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.86) }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); }
export const VIEWS = {
  teatro: [['foyer', [0, 1.7, 1.0], [-5, 1.6, 4], 70], ['sala', [0, 1.8, 7.2], [0, 3, 26], 66], ['escenario', [-3, 1.5, 15], [0, 3.4, 26], 60], ['desde', [0, 2.7, 25.5], [0, 1.2, 8], 72]],
  pabellon: [['entrada', [0, 1.7, 1.2], [0, 2.5, 30], 76], ['pista', [-10, 6, 4], [4, 0, 26], 70], ['grada', [-8, 1.7, 23], [11, 1.4, 23], 70], ['porteria', [0, 1.6, 34], [0, 1.4, 44], 66], ['marcador', [0, 2, 30], [0, 6.2, 46], 50], ['canasta', [3, 2.0, 37], [0, 3.2, 44.6], 60]],
  corbacho: [['entrada', [0, 1.7, 1.2], [0, 1.8, 10], 72], ['tractor', [-1, 1.7, 2.5], [-4.2, 1.4, 6.2], 66], ['mostrador', [2, 1.7, 5.5], [6, 1.3, 9.8], 64], ['taller', [0, 2.2, 11.5], [0, 1.3, 20], 72], ['banco', [3, 1.7, 16], [-8, 1.4, 21.3], 66], ['fuera', [5, 1.7, 22.5], [-3, 1.6, 14], 74]],
  sangregorio: [['nave', [0, 1.6, 1.2], [0, 3.2, 20], 70], ['retablo', [0, 2.2, 15.5], [0, 3.6, 24], 64], ['cupula', [0, 1.8, 17.5], [0, 9, 20.2], 80], ['lateral', [2.5, 1.7, 11], [-4.3, 2.0, 14.3], 66], ['desde', [-3, 2.5, 22.5], [2, 1.2, 4], 72], ['santo', [0, 2.1, 21.2], [0, 2.6, 23.6], 40]],
  mercado: [['entrada', [0, 1.7, 1.2], [0, 2.2, 14], 72], ['fruta', [-4.5, 1.7, 7.5], [-8.2, 1.2, 4.6], 64], ['pescado', [-5, 1.6, 13.5], [-8.2, 1.0, 11], 62], ['centro', [4, 1.8, 16], [-2, 1.1, 9], 70], ['techo', [0, 1.5, 20], [0, 6.6, 3], 78], ['quesos', [4.6, 1.6, 8.5], [8.2, 1.0, 11], 64]],
  ayto: [['hall', [0, 1.7, 1.2], [0, 2.2, 12], 70], ['mostrador', [-3, 1.7, 2], [6, 1.4, 4.6], 66], ['escalera', [4, 1.7, 7], [-1, 3, 12], 70], ['pleno', [6.5, 6.4, 7.6], [-6, 5.6, 3], 72], ['presidencia', [3, 6.3, 4.1], [-8, 6.6, 4.1], 62], ['balcones', [0, 6.4, 7.5], [0, 6.2, 0], 76]],
};
export async function shoot(kind, tag = '', views = VIEWS[kind], { hour = 11, W = 960, H = 640 } = {}) {
  const g = G(), I = g.interiors;
  if (!g.interior || g.interior.venue !== kind) {
    if (g.interior) I.leave();
    const d = I.doors.find((q) => q.venue === kind);
    if (!d) throw new Error('no door for ' + kind);
    g.player.spawnAt(d.x, d.z, 0);
    await I.enter(d, { mode: 'visit', silent: true });
  }
  const h = g.interior, O = h.origin;
  const keepR = g.render; g.render = () => {};
  size(W, H);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 400);
  const out = [];
  try {
    g.sky.hour = hour;
    for (let i = 0; i < 3; i++) { g.state = 'play'; g.frame(1 / 30); }
    for (const [name, e, t, fov] of views) {
      cam.fov = fov; cam.position.set(O.x + e[0], e[1], O.z + e[2]); cam.lookAt(O.x + t[0], t[1], O.z + t[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      g.sky.update(0, cam.position, true); g.interiors.dimSky();
      const keep = g.camera; g.camera = cam;
      const wv = g.windowView && g.windowView.render && g.windowView.render();
      try { g.renderView(cam); } finally { g.camera = keep; if (wv) g.windowView.after(); }
      await post(`vn_${kind}_${name}_${tag}`);
      out.push(`vn_${kind}_${name}_${tag}`);
    }
  } finally { g.render = keepR; g.resize(); }
  return out;
}
