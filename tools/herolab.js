// Dev-only: the hero's new body on its own — the skeleton and the skinned MakeHuman body from assets/hero/body.bin.gz,
// shown in the bind pose (as modelled) and the zero pose (every rotation identity: the game's rest), for checking the
// rig, the weights and the seams. Snapshots go to .snaps/hl_<tag>_<view>.jpg.
//   const H = await import('/tools/herolab.js?' + Date.now()); await H.show('a')
import * as THREE from 'three';
import { parseHero } from '/src/herodata.js';
import { loadAssetBytes } from '/src/assets.js';
const G = () => window.game;
export const SPOT = { x: -346.5, z: 49.4 };

export async function loadBody() {
  const gz = await loadAssetBytes('hero/body.bin.gz?' + Date.now());
  const buf = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return parseHero(new Uint8Array(buf));
}

export function buildBody(H, mat) {
  const bones = H.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.fromArray(b.off); o.quaternion.fromArray(b.q); return o; });
  H.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const root = new THREE.Group(); root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(H.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(H.nrm, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(H.si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(H.sw, 4));
  geo.setIndex(new THREE.BufferAttribute(H.index, 1));
  const mesh = new THREE.SkinnedMesh(geo, mat || new THREE.MeshStandardMaterial({ color: 0xd9a98a, roughness: 0.6 }));
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(skel, new THREE.Matrix4());
  const by = Object.fromEntries(bones.map((b) => [b.name, b]));
  return { root, mesh, skel, bones: by, list: bones, bind: H.bones.map((b) => new THREE.Quaternion().fromArray(b.q)) };
}

async function post(name) { const url = G().renderer.domElement.toDataURL('image/jpeg', 0.88); await fetch('/__snap?name=' + name, { method: 'POST', body: url }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } }
// render a view and copy it at once into a 2D canvas (before the drawing buffer can be cleared)
export function renderInto(ctx, dx, dy, pos, look, fov, w, h) {
  const g = G(); size(w, h);
  const cam = g.camera.clone(); cam.fov = fov; cam.aspect = w / h; cam.near = 0.01; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix();
  const keep = g.camera; g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.renderView) g.renderView(cam); else if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
  const c = g.renderer.domElement;
  ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, w, h);
}
export async function shot(name, pos, look, fov, w, h) {
  const g = G(); size(w, h);
  const cam = g.camera.clone(); cam.fov = fov; cam.aspect = w / h; cam.near = 0.01; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix();
  const keep = g.camera; g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.renderView) g.renderView(cam); else if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
  await post(name);
}

// views: front, side, back, a close look at the hands and feet
export async function show(tag = 'a', { pose = 'both', mat = null } = {}) {
  const g = G();
  const H = await loadBody();
  const B = buildBody(H, mat);
  B.root.position.set(SPOT.x, 0, SPOT.z);
  g.scene.add(B.root);
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  const out = [];
  for (const p of pose === 'both' ? ['bind', 'zero'] : [pose]) {
    B.list.forEach((b, i) => { if (p === 'zero') b.quaternion.identity(); else b.quaternion.copy(B.bind[i]); });
    B.root.updateMatrixWorld(true);
    const X = SPOT.x, Z = SPOT.z;
    await shot(`hl_${tag}_${p}_f`, [X, 1.0, Z + 3.2], [X, 0.9, Z], 38, 520, 760);
    await shot(`hl_${tag}_${p}_s`, [X + 3.2, 1.0, Z], [X, 0.9, Z], 38, 520, 760);
    await shot(`hl_${tag}_${p}_b`, [X, 1.0, Z - 3.2], [X, 0.9, Z], 38, 520, 760);
    out.push(p);
  }
  g.scene.remove(B.root);
  g.resize();
  return { out, nv: H.nv, bones: H.bones.length };
}
