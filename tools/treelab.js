// Dev-only: a line-up of the procedural trees (src/trees.js) on the open ground by the town, to judge them.
//   const T = await import('/tools/treelab.js?' + Date.now()); await T.lineup(['olivo', 'encina'], 'a')
//   → .snaps/tree_<species>_<tag>.jpg (near, LOD 0 and LOD 1 side by side) and T.atlas('a') (the painted textures)
import * as THREE from 'three';
const G = () => window.game;
const SPOT = { x: -346.5, z: 49.4 };
async function post(name) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.88) }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } }
function render(cam) {
  const g = G(), keep = g.camera;
  if (g.renderView) { g.camera = cam; try { g.renderView(cam); } finally { g.camera = keep; } return; }
  g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
}
let LIB = null;
async function lib() {
  if (LIB) return LIB;
  const T = await import('/src/trees.js?' + Date.now());
  const t0 = performance.now();
  const atlas = T.makeLeafAtlas(), bark = T.makeBarkAtlas();
  LIB = { T, atlas, bark, leafMat: T.makeLeafMaterial(atlas), barkMat: T.makeBarkMaterial(bark), depth: T.makeLeafDepthMaterial(atlas), ms: performance.now() - t0 };
  return LIB;
}
export async function reload() { LIB = null; return (await lib()).ms; }
function place(L, name, variant, lod, x, z) {
  const t = L.T.buildTree(name, variant, lod), grp = new THREE.Group();
  if (t.bark) { const m = new THREE.Mesh(t.bark, L.barkMat); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  if (t.leaves) { const m = new THREE.Mesh(t.leaves, L.leafMat); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = L.depth; grp.add(m); }
  grp.position.set(x, 0, z);
  grp.userData.tris = ((t.bark ? t.bark.index.count : 0) + (t.leaves ? t.leaves.index.count : 0)) / 3;
  grp.userData.H = t.H; grp.userData.R = t.R;
  return grp;
}
// each species: its variants in a row (LOD 0), and the same at LOD 1 behind; a photo from a person's height
export async function lineup(names, tag = '', { hour = 11, variants = 3, W = 900, H = 560 } = {}) {
  const L = await lib(), g = G();
  // (the town's own trees out of the way while we look)
  const wl = g.world.treeLib, hidden = [];
  if (wl) g.world.root.traverse((o) => { if (o.visible && (o.material === wl.leafMat || o.material === wl.barkMat || o.material === wl.impMat)) { o.visible = false; hidden.push(o); } });
  const keepUpd = g.world.trees && g.world.trees.update;
  if (keepUpd) g.world.trees.update = () => {};
  g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  const out = {};
  for (const name of names) {
    const grp = new THREE.Group(), trees = [];
    let x = 0, tallest = 0, widest = 0;
    for (let v = 0; v < variants; v++) {
      const a = place(L, name, v, 0, 0, 0);
      tallest = Math.max(tallest, a.userData.H); widest = Math.max(widest, a.userData.R);
      trees.push(a);
    }
    const gap = Math.max(3, widest * 2.3);
    trees.forEach((t, i) => { t.position.x = SPOT.x + (i - (variants - 1) / 2) * gap; t.position.z = SPOT.z; grp.add(t); });
    const lod1 = place(L, name, 0, 1, SPOT.x + ((variants + 1) / 2) * gap, SPOT.z);
    grp.add(lod1);
    g.scene.add(grp);
    const dist = Math.max(9, tallest * 1.25 + widest * 1.5);
    const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000);
    cam.position.set(SPOT.x + gap * 0.5, 1.7, SPOT.z + dist); cam.lookAt(SPOT.x + gap * 0.5, tallest * 0.45, SPOT.z); cam.updateMatrixWorld();
    size(W, H); render(cam); await post(`tree_${name}_${tag}`);
    // and one closer, of the first tree's crown
    const c2 = new THREE.PerspectiveCamera(50, W / H, 0.05, 500);
    const t0 = trees[0].position;
    c2.position.set(t0.x + widest * 1.1, Math.max(1.7, tallest * 0.45), t0.z + widest * 1.6 + 2); c2.lookAt(t0.x, tallest * 0.6, t0.z); c2.updateMatrixWorld();
    render(c2); await post(`tree_${name}_${tag}_c`);
    out[name] = { tris0: trees.map((t) => t.userData.tris), tris1: lod1.userData.tris, H: +tallest.toFixed(1), R: +widest.toFixed(1) };
    g.scene.remove(grp);
    grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  g.resize();
  for (const o of hidden) o.visible = true;
  if (keepUpd) delete g.world.trees.update;
  return out;
}
// the painted atlases, as images
export async function atlas(tag = '') {
  const L = await lib();
  for (const [name, t] of [['leaves', L.atlas], ['bark', L.bark]]) {
    const { width: w, height: h, data } = t.image;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), id = x.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const s = ((h - 1 - y) * w + i) * 4, d = (y * w + i) * 4, a = data[s + 3] / 255;
      const bg = ((i >> 4) + (y >> 4)) % 2 ? 200 : 150; // checker behind the alpha
      id.data[d] = data[s] * a + bg * (1 - a); id.data[d + 1] = data[s + 1] * a + bg * (1 - a); id.data[d + 2] = data[s + 2] * a + bg * (1 - a); id.data[d + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    await fetch('/__snap?name=atlas_' + name + '_' + tag, { method: 'POST', body: c.toDataURL('image/jpeg', 0.9) });
  }
  return L.ms;
}

// the whole machinery: a library (all species, baked billboards) and a field of instances — an olive grove of
// n × n trees and a row of each species — photographed near, mid and far with render stats
export async function field(tag = '', { n = 50, spacing = 7, hour = 11 } = {}) {
  const g = G(), T = await import('/src/trees.js?' + Date.now());
  const t0 = performance.now();
  const lib = new T.TreeLibrary(g.renderer, { variants: 3 });
  const tLib = performance.now() - t0;
  const F = new T.TreeField(lib, {});
  const ox = SPOT.x - 40, oz = SPOT.z - 60, rnd = Math.random;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) F.add('olivo', ox - i * spacing + (rnd() - 0.5), oz - j * spacing + (rnd() - 0.5), { s: 0.85 + rnd() * 0.3, lean: 0.05, tint: [0.92 + rnd() * 0.16, 0.92 + rnd() * 0.16, 0.9 + rnd() * 0.12] });
  const names = Object.keys(lib.kinds);
  names.forEach((nm, i) => F.add(nm, SPOT.x + (i - names.length / 2) * 7, SPOT.z - 14, { s: 1 }));
  const root = new THREE.Group(); g.scene.add(root);
  const t1 = performance.now(); F.build(root); const tBuild = performance.now() - t1;
  g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  const W = 900, H = 560; size(W, H);
  const info = g.renderer.info; info.autoReset = false;
  const stats = {};
  for (const [nm, eye, look] of [['near', [SPOT.x + 4, 1.7, SPOT.z + 8], [SPOT.x - 4, 3, SPOT.z - 14]], ['grove', [ox + 20, 1.7, oz + 20], [ox - 60, 1.5, oz - 60]], ['air', [ox + 120, 60, oz + 120], [ox - 150, 0, oz - 150]]]) {
    const cam = new THREE.PerspectiveCamera(55, W / H, 0.1, 3000); cam.position.set(...eye); cam.lookAt(...look); cam.updateMatrixWorld();
    const tu = performance.now(); F.update(eye[0], eye[2]); const tUp = performance.now() - tu;
    info.reset(); render(cam);
    stats[nm] = { tris: info.render.triangles, calls: info.render.calls, upd: +tUp.toFixed(1) };
    await post(`field_${nm}_${tag}`);
  }
  info.autoReset = true;
  window._field = { F, lib, root };
  g.scene.remove(root);
  g.resize();
  return { tLib: Math.round(tLib), tBuild: Math.round(tBuild), items: F.items.length, cells: lib.cells, stats };
}
