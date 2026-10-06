// Dev-only: photos of the town's trees and plants from where a person would stand (plaza, avenue, park, olive grove,
// cemetery, reservoir, balconies, wall bases), to judge the vegetation.
//   const V = await import('/tools/vegshots.js?' + Date.now()); await V.shoot('a')        → .snaps/veg_<view>_a.jpg
import * as THREE from 'three';
const G = () => window.game;
async function post(name) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.86) }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } }
function render(cam) {
  const g = G(), keep = g.camera;
  if (g.renderView) { g.camera = cam; try { g.renderView(cam); } finally { g.camera = keep; } return; }
  g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
}
const cen = (r) => { let x = 0, z = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; } return [x / (r.length / 2), z / (r.length / 2)]; };
// the viewpoints: [name, eye [x, y, z], target [x, y, z], fov]
export function views() {
  const g = G(), w = g.world, M = g.map, h = (x, z) => (M.heightAt ? M.heightAt(x, z) : 0) || 0;
  const V = [];
  const plaza = w.landmarks.poi.plaza;
  V.push(['plaza', [plaza.x + 14, 1.7, plaza.z + 16], [plaza.x - 8, 2.5, plaza.z - 6], 55]);
  // an avenue: stand in the carriageway beside one of its trees, looking along the street
  const clear = (x, z) => !M.buildingAt(x, z);
  const st = (w.streetTrees || []).find((t, i) => i > 40 && M.roadAt && M.roadAt(t.x - t.dz * 5, t.z + t.dx * 5)) || (w.streetTrees || [])[0];
  if (st) { let ex = st.x, ez = st.z; for (const k of [4, -4, 6, -6, 2, -2]) { const x = st.x - st.dz * k - st.dx * 14, z = st.z + st.dx * k - st.dz * 14; if (clear(x, z)) { ex = x; ez = z; break; } } V.push(['avenida', [ex, 1.7, ez], [ex + st.dx * 30, 2.5, ez + st.dz * 30], 60]); }
  const parks = M.areas.filter((a) => a.kind === 'leisure:park').map((a) => cen(a.ring));
  if (parks[0]) V.push(['parque', [parks[0][0] + 18, 1.7, parks[0][1] + 18], [parks[0][0], 2.5, parks[0][1]], 55]);
  const orch = M.areas.filter((a) => a.kind === 'landuse:orchard').map((a) => cen(a.ring));
  if (orch[1]) V.push(['olivar', [orch[1][0] + 30, 1.7, orch[1][1] + 30], [orch[1][0], 1.5, orch[1][1]], 55]);
  const cem = M.areas.find((a) => a.kind === 'landuse:cemetery');
  if (cem) { const c = cen(cem.ring); let e = [c[0] + 40, c[1] + 30]; for (let a = 0; a < 6.28; a += 0.4) { const x = c[0] + Math.cos(a) * 45, z = c[1] + Math.sin(a) * 45; if (clear(x, z)) { e = [x, z]; break; } } V.push(['cementerio', [e[0], 1.7, e[1]], [c[0], 4, c[1]], 50]); }
  const res = w.reservoir && w.reservoir.trees && w.reservoir.trees[20];
  if (res) V.push(['pantano', [res.x + 20, 1.7, res.z + 20], [res.x, 4, res.z], 55]);
  V.push(['balcon', [0, 1.7, 4.8], [0, 4.2, -3], 50]);
  V.push(['acera', [2, 1.2, 3], [-2, 0.1, -1.5], 60]);
  V.push(['lejos', [plaza.x + 60, 22, plaza.z + 90], [plaza.x - 60, 0, plaza.z - 80], 60]);
  // a yard inside a block, from a roof: the n-th fig or lemon tree planted in town
  const K = w.trees && w.trees.lib.kinds, isYard = (t) => K && (K.higuera.includes(t.k) || K.limonero.includes(t.k));
  const yard = w.trees && w.trees.items.filter((t) => isYard(t) && Math.hypot(t.x - plaza.x, t.z - plaza.z) < 600)[3];
  if (yard) V.push(['corral', [yard.x + 12, 14, yard.z + 12], [yard.x, 1, yard.z], 55]);
  return V;
}
export async function shoot(tag = '', { hour = 11, W = 800, H = 500, only = null } = {}) {
  const g = G();
  g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(0, 0, 0), true);
  const out = [];
  for (const [name, eye, look, fov] of views()) {
    if (only && !only.includes(name)) continue;
    // stream in what is around the viewpoint (facade details, chunks, LOD groups) as the game does
    const night = g.sky.update(0, new THREE.Vector3(eye[0], 0, eye[2]), true);
    const M = await import('/src/materials.js'); M.shared.uNight.value = night; // (the game loop sets it: lit windows, lamps)
    const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 3000); cam.position.set(...eye); cam.lookAt(...look); cam.updateMatrixWorld();
    if (g.world.update) try { g.world._lodT = 0; g.world.update(0, 0, cam.position); } catch (e) { /* (world streaming is optional) */ }
    if (g.chars && g.chars.updateLods) g.chars.updateLods(cam.position);
    size(W, H);
    render(cam);
    await post(`veg_${name}_${tag}`);
    out.push(name);
  }
  g.resize();
  return out;
}
// close-ups of the ground plants: for each kind, the n-th one found in the detail chunks (skipping `skip`), seen from
// a person's height a couple of metres off, from a side with no building in the way
//   await V.close('a', ['malva', 'amapola'])        → .snaps/veg_close_<kind>_a.jpg
export async function close(tag = '', kinds = ['hierba', 'malva', 'roseta', 'jaramago', 'amapola', 'avena', 'cardo', 'matorral'], { hour = 11, W = 800, H = 500, skip = 40, dist = 2.2, eyeY = 1.3 } = {}) {
  const g = G(), fd = g.world.facades, M = g.map;
  const T = await import('/src/trees.js');
  const out = {};
  for (const kind of kinds) {
    const ki = T.GROUND_KINDS.indexOf(kind);
    let found = null, seen = 0;
    for (const ch of fd.list) {
      const pl = ch.plants; if (!pl) continue;
      for (let k = 0; k < pl.length; k += 6) if (pl[k] === ki && seen++ >= skip) { found = [pl[k + 1], pl[k + 3]]; break; }
      if (found) break;
    }
    if (!found) { out[kind] = 'none'; continue; }
    const [px, pz] = found;
    let eye = null;
    for (let a = 0; a < 6.28 && !eye; a += 0.5) { const x = px + Math.cos(a) * dist, z = pz + Math.sin(a) * dist; if (!M.buildingAt(x, z) && !M.buildingAt((x + px) / 2, (z + pz) / 2)) eye = [x, eyeY, z]; }
    if (!eye) eye = [px + dist, eyeY, pz];
    g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(px, 0, pz), true);
    const cam = new THREE.PerspectiveCamera(50, W / H, 0.05, 2000); cam.position.set(...eye); cam.lookAt(px, 0.25, pz); cam.updateMatrixWorld();
    try { g.world._lodT = 0; g.world.update(0, 0, cam.position); } catch (e) { /* */ }
    size(W, H); render(cam); await post(`veg_close_${kind}_${tag}`);
    out[kind] = [+px.toFixed(1), +pz.toFixed(1)];
  }
  g.resize();
  return out;
}
// render cost at each viewpoint: draw calls, triangles and the time of a synced frame (median of 5), at the game's size
//   await V.perf()      → { plaza: { calls, tris, ms }, … }
export async function perf({ W = 1280, H = 720, only = null } = {}) {
  const g = G(), info = g.renderer.info, gl = g.renderer.getContext();
  const out = {};
  size(W, H);
  info.autoReset = false;
  for (const [name, eye, look, fov] of views()) {
    if (only && !only.includes(name)) continue;
    g.sky.update(0, new THREE.Vector3(eye[0], 0, eye[2]), true);
    const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 3000); cam.position.set(...eye); cam.lookAt(...look); cam.updateMatrixWorld();
    for (let i = 0; i < 3; i++) { g.world._lodT = 0; g.world.update(0, 0, cam.position); }
    render(cam); gl.finish();
    const ts = [];
    for (let i = 0; i < 5; i++) { info.reset(); const t0 = performance.now(); render(cam); gl.finish(); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    out[name] = { calls: info.render.calls, tris: info.render.triangles, ms: +ts[2].toFixed(1) };
  }
  info.autoReset = true;
  g.resize();
  return out;
}
