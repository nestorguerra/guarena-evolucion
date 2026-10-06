// Dev-only: photos of the church doors from the street (src/churchdoors.js, landmarks church()), at the hours asked.
//   const D = await import('/tools/doorshots.js?' + Date.now()); await D.shoot('a', { hours: [11] })  → .snaps/door_<view>_<tag>.jpg
// Views are given in the door's frame: [name, door ('oeste'|'sur'|'norte'), out (m in front), side (m to the right), eye y,
// look out, look side, look y, fov]
import * as THREE from 'three';
const G = () => window.game;
async function post(name) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.86) }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); }
export const VIEWS = [
  ['lejos', 'oeste', 9.5, 2.2, 1.6, 0, 0, 7.5, 74],
  ['cerca', 'oeste', 5.5, 0.6, 1.7, 0, 0, 2.6, 60],
  ['hoja', 'oeste', 2.4, 1.2, 1.6, 0, -0.2, 1.8, 62],
  ['sur', 'sur', 11, -2, 1.7, 0, 0, 4.5, 58],
  ['surcerca', 'sur', 4.5, 0.5, 1.7, 0, 0, 2.4, 60],
  ['norte', 'norte', 9, 1.5, 1.7, 0, 0, 4.0, 58],
  ['dentro', 'oeste', 2.6, 0.3, 1.75, -3, 0, 1.6, 64],
];
export function frameOf(key) {
  const lm = G().world.landmarks.poi;
  const d = key === 'oeste' ? lm.churchWest : key === 'sur' ? lm.churchSouth : lm.churchNorth;
  if (!d) return null;
  const pd = d.portal || d;
  const nx = pd.nx ?? (d.x - d.f.x), nz = pd.nz ?? (d.z - d.f.z), L = Math.hypot(nx, nz);
  const o = pd.thr || { x: d.x, z: d.z };
  return { o, n: { x: nx / L, z: nz / L }, t: { x: -nz / L, z: nx / L }, d };
}
export async function shoot(tag = '', { hours = [11], W = 720, H = 900, only = null, open = null } = {}) {
  const g = G();
  if (g.interior) g.interiors.leave();
  const keepR = g.render; g.render = () => {};
  size(W, H);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 900);
  const out = [];
  try {
    for (const hour of hours) {
      g.sky.hour = hour;
      for (const [name, key, fo, fs, ey, lo, ls, ly, fov] of VIEWS) {
        if (only && !only.includes(name)) continue;
        const F = frameOf(key); if (!F) continue;
        if (open !== null && F.d.door) { F.d.door.set(open, true, false); }
        const ex = F.o.x + F.n.x * fo + F.t.x * fs, ez = F.o.z + F.n.z * fo + F.t.z * fs;
        const lx = F.o.x + F.n.x * lo + F.t.x * ls, lz = F.o.z + F.n.z * lo + F.t.z * ls;
        g.player.pos.set(ex + F.n.x * 1.2, 0, ez + F.n.z * 1.2);
        for (let i = 0; i < 3; i++) { g.state = 'play'; g.frame(1 / 30); }
        const gy = g.map.groundAt ? g.map.groundAt(ex, ez) : 0;
        cam.fov = fov; cam.position.set(ex, gy + ey, ez); cam.lookAt(lx, gy + ly, lz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        g.sky.update(0, cam.position, true);
        const keep = g.camera; g.camera = cam;
        try { g.renderView(cam); } finally { g.camera = keep; }
        const nm = `door_${name}_${tag}${hours.length > 1 ? '_' + String(hour).replace('.', 'h') : ''}`;
        await post(nm);
        out.push(nm);
      }
    }
  } finally { g.render = keepR; g.resize(); }
  return out;
}
