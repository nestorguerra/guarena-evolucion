// Dev-only: a MakeHuman head on its own (skin atlas, eyes, eyebrows, eyelashes) in the game's light, to judge the look.
//   const P = await import('/tools/mhproto.js?' + Date.now()); await P.shoot([{ g: 0, age: 25, skin: 'yf_c' }], 'a')
import * as THREE from 'three';
import { parseMH, morphMH, fitProxy, macroWeights, faceSliders, jointMH } from '/src/mhdata.js';
import { SPOT } from '/tools/faces.js';
const G = () => window.game;
let M = null;
export async function load() {
  if (M) return M;
  const r = await fetch('/assets/mh/head.bin.gz');
  const ds = r.body.pipeThrough(new DecompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(ds).arrayBuffer());
  M = parseMH(buf);
  return M;
}
const texCache = {};
function tex(path, srgb = true) {
  if (texCache[path]) return texCache[path];
  const t = new THREE.TextureLoader().load(path);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (texCache[path] = t);
}
// normals over the unsplit region vertices, copied to the render vertices (no seams at uv island edges)
function normalsFor(nR, pos, map, index) {
  const n = new Float32Array(nR * 3), P = pos;
  for (let i = 0; i < index.length; i += 3) {
    const a = map[index[i]], b = map[index[i + 1]], c = map[index[i + 2]];
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az, e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { n[v * 3] += nx; n[v * 3 + 1] += ny; n[v * 3 + 2] += nz; }
  }
  const out = new Float32Array(map.length * 3);
  for (let i = 0; i < map.length; i++) { const v = map[i]; const l = Math.hypot(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]) || 1; out[i * 3] = n[v * 3] / l; out[i * 3 + 1] = n[v * 3 + 1] / l; out[i * 3 + 2] = n[v * 3 + 2] / l; }
  return out;
}
// a head: o = { g (0 woman … 1 man), age, eth: {african, asian, caucasian}, weight, muscle, skin, eye, brow, lash, seed, amt }
export function head(o) {
  const w = macroWeights(o.g ?? 0.5, o.age ?? 25, o.eth || { caucasian: 1 }, o.weight ?? 0.5, o.muscle ?? 0.5);
  // the features: random sliders from the seed
  let s = (o.seed ?? 1) * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (const sl of faceSliders(M)) {
    if (rnd() > 0.45) continue;
    const v = (rnd() * 2 - 1) * (o.amt ?? 0.55);
    const [t0, t1] = v > 0 ? sl.pos : sl.neg;
    if (t0) w[t0] = (w[t0] || 0) + Math.abs(v);
    if (t1) w[t1] = (w[t1] || 0) + Math.abs(v) * (0.9 + rnd() * 0.2);
  }
  Object.assign(w, o.extra || {});
  const p = morphMH(M, w);
  const grp = new THREE.Group();
  const k = 0.1; // decimetres → metres
  // the head
  const n = M.map.length, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = M.map[i]; pos[i * 3] = p[v * 3] * k; pos[i * 3 + 1] = p[v * 3 + 1] * k; pos[i * 3 + 2] = p[v * 3 + 2] * k; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normalsFor(M.nR, p, M.map, M.index.subarray(0, M.nBody)), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(M.uv, 2));
  g.setIndex(new THREE.BufferAttribute(M.index.subarray(0, M.nBody), 1));
  const skin = new THREE.MeshPhysicalMaterial({ map: tex('/assets/mh/skin_' + (o.skin || 'yf_c') + '.webp'), roughness: 0.6, sheen: 0.2, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.9, 0.55, 0.45), specularIntensity: 0.35 });
  grp.add(new THREE.Mesh(g, skin));
  // teeth (the helper geometry)
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setIndex(new THREE.BufferAttribute(M.index.subarray(M.nBody), 1)); tg.computeVertexNormals();
  grp.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.35 })));
  // proxies
  for (const px of M.proxies) {
    if (px.kind === 'brow' && px.name !== (o.brow || 'eyebrow001')) continue;
    if (px.kind === 'lash' && px.name !== (o.lash || 'eyelashes01')) continue;
    if (px.kind === 'hair' && px.name !== o.hair) continue;
    const q = fitProxy(M, p, px), pn = px.map.length, pp = new Float32Array(pn * 3);
    for (let i = 0; i < pn; i++) { const v = px.map[i]; pp[i * 3] = q[v * 3] * k; pp[i * 3 + 1] = q[v * 3 + 1] * k; pp[i * 3 + 2] = q[v * 3 + 2] * k; }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pg.setAttribute('uv', new THREE.BufferAttribute(px.uv, 2));
    pg.setIndex(new THREE.BufferAttribute(px.index, 1)); pg.computeVertexNormals();
    let mat;
    if (px.kind === 'eyes') mat = new THREE.MeshStandardMaterial({ map: tex('/assets/mh/eye_' + (o.eye || 'brown') + '.webp'), roughness: 0.35 });
    else if (px.kind === 'cornea') mat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, specularIntensity: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    else mat = new THREE.MeshStandardMaterial({ map: tex('/assets/mh/' + px.kind + '_' + px.name + '.webp'), transparent: true, alphaTest: 0.08, depthWrite: false, side: THREE.DoubleSide, roughness: 0.8, color: px.kind === 'brow' ? new THREE.Color(o.browColor || 0x3a2a1e) : 0xffffff });
    const m = new THREE.Mesh(pg, mat);
    m.renderOrder = px.kind === 'eyes' ? 0 : px.kind === 'cornea' ? 1 : 2;
    grp.add(m);
  }
  grp.userData.eye = jointMH(M, p, 'joint-l-eye').map((v) => v * k);
  return grp;
}
async function post(name) { const url = G().renderer.domElement.toDataURL('image/jpeg', 0.88); await fetch('/__snap?name=' + name, { method: 'POST', body: url }); }
function size(w, h) { const g = G(); g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); } }
async function shot(name, pos, look, fov, w, h) {
  const g = G(); size(w, h);
  const cam = g.camera.clone(); cam.fov = fov; cam.aspect = w / h; cam.near = 0.01; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix();
  const keep = g.camera; g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { if (g.renderView) g.renderView(cam); else if (g.composer) g.composer.render(); else g.renderer.render(g.scene, cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
  await post(name);
}
export async function shoot(list, tag = '', opts = {}) {
  await load();
  const g = G();
  if (opts.hour != null) g.sky.hour = opts.hour;
  g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 6, Math.PI);
  // wait for textures
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const h = head(list[i]);
    h.position.set(SPOT.x, 1.62 - 0.73, SPOT.z); // (the base mesh's eyes are ~0.73 m above its origin)
    g.scene.add(h);
    await new Promise((r) => setTimeout(r, 400));
    const e = h.userData.eye, ey = 1.62 - 0.73 + e[1], ez = SPOT.z + e[2];
    for (const v of opts.views || ['q', 'f', 'p']) {
      if (v === 'q') await shot(`mh_${i}${tag}_q`, [SPOT.x + Math.sin(0.5) * 0.42, ey, ez + Math.cos(0.5) * 0.42], [SPOT.x, ey - 0.02, ez - 0.04], 30, 700, 700);
      if (v === 'f') await shot(`mh_${i}${tag}_f`, [SPOT.x, ey, ez + 0.4], [SPOT.x, ey - 0.025, ez - 0.04], 30, 700, 700);
      if (v === 'p') await shot(`mh_${i}${tag}_p`, [SPOT.x + 0.44, ey, ez - 0.05], [SPOT.x, ey - 0.02, ez - 0.05], 30, 700, 700);
    }
    g.scene.remove(h);
    out.push(`mh_${i}${tag}`);
  }
  g.resize();
  return out;
}
