// Dev-only: face close-ups (front 3/4, profile) and full bodies of player presets, built fresh with the builder on disk.
//   const F = await import('/tools/faces.js?' + Date.now()); await F.shoot([6, 0, 1, 3], 'b')
import * as THREE from 'three';
const G = () => window.game;
export const SPOT = { x: -346.5, z: 49.4 };
async function post(name) { const url = G().renderer.domElement.toDataURL('image/jpeg', 0.88); await fetch('/__snap?name=' + name, { method: 'POST', body: url }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } }
async function shot(name, pos, look, fov, w, h) {
  const g = G(); size(w, h);
  const cam = g.camera.clone(); cam.fov = fov; cam.aspect = w / h; cam.near = 0.01; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix();
  // through the composer (bloom, tone mapping) like the game
  const keep = g.camera; g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.renderView) g.renderView(cam); else if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
  await post(name);
}
export async function build(desc) {
  const g = G();
  const CB = await import('/src/charbuild.js?x=' + Date.now() + Math.random());
  const { mhLib } = await import('/src/mhdata.js');
  const B = CB.charBuilderMain(mhLib);
  if (g.chars.mhBuf) B.setMH(g.chars.mhBuf);
  const spec = g.chars.spec(desc); spec.key = spec.key + '|f' + Date.now() + Math.random();
  const r = B.build(spec);
  g.chars.shapes.set(spec.key, g.chars.makeShape(r));
  const orig = g.chars.spec.bind(g.chars); g.chars.spec = () => spec;
  const ch = g.chars.create(desc); g.chars.spec = orig;
  return ch;
}
export async function shoot(list, tag = '', opts = {}) {
  const g = G(); const C = await import('/src/characters.js');
  if (opts.hour != null) { g.sky.hour = opts.hour; }
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 6, Math.PI);
  const out = [];
  for (let k = 0; k < list.length; k++) {
    const desc = typeof list[k] === 'number' ? C.PLAYER_PRESETS[list[k]] : list[k];
    const ch = await build({ ...desc, hq: opts.hq ?? true });
    if (C.mhTexReady) await C.mhTexReady(); // (its skin, eyes, brows: no shot with a placeholder)
    ch.object.position.set(SPOT.x, 0, SPOT.z); ch.object.rotation.y = 0; g.scene.add(ch.object);
    for (let f = 0; f < 40; f++) ch.update(1 / 30, 0, opts.face ? { forceFace: opts.face } : {});
    ch.setDistance(1, true); ch.object.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); ch.bones.head.getWorldPosition(hp);
    const ey = hp.y + 0.06 * ch.scale, lz = hp.z + 0.06;
    const views = opts.views || ['q', 'p', 'b'];
    for (const v of views) {
      if (v === 'q') await shot(`fc_${k}${tag}_q`, [hp.x + Math.sin(0.5) * 0.4, ey, lz + Math.cos(0.5) * 0.4], [hp.x, ey - 0.01, lz], 30, 700, 700);
      if (v === 'f') await shot(`fc_${k}${tag}_f`, [hp.x, ey, lz + 0.36], [hp.x, ey - 0.012, lz], 30, 700, 700);
      if (v === 'p') await shot(`fc_${k}${tag}_p`, [hp.x + 0.42, ey, lz - 0.02], [hp.x, ey - 0.01, lz - 0.02], 30, 700, 700);
      if (v === 'h') await shot(`fc_${k}${tag}_h`, [hp.x + Math.sin(0.6) * 0.62, ey + 0.05, lz + Math.cos(0.6) * 0.62], [hp.x, ey + 0.01, lz - 0.03], 30, 700, 700); // the whole head, hair and all
      if (v === 'k') await shot(`fc_${k}${tag}_k`, [hp.x - Math.sin(2.4) * 0.62, ey + 0.05, lz + Math.cos(2.4) * 0.62], [hp.x, ey + 0.0, lz - 0.05], 30, 700, 700); // from behind
      if (v === 'b') await shot(`fc_${k}${tag}_b`, [SPOT.x + 0.5, 1.05, SPOT.z + 2.6], [SPOT.x, 0.92, SPOT.z], 42, 480, 720);
      if (v === 'r') await shot(`fc_${k}${tag}_r`, [SPOT.x - 0.7, 1.75, SPOT.z - 3.1], [SPOT.x, 0.85, SPOT.z], 40, 480, 720); // from behind, like the game's camera
    }
    g.scene.remove(ch.object); ch.dispose();
    out.push(desc.name);
  }
  g.resize();
  return out;
}
