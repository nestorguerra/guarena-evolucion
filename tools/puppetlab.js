// Dev-only: the claymation puppet heads — the same people built without and with the puppet sculpt (charbuild.js
// MH_PUPPET), face on, three-quarter and profile, side by side → .snaps/puppet_<tag>.jpg. Run it in ?estilo=plastilina.
//   const P = await import('/tools/puppetlab.js?' + Date.now()); await P.sheet([0, 1, 2, 5], 'a')
//   (views: f face on, q three-quarter, p profile, b whole, m the mouth close up; opts.clay: target weights to try instead of MH_PUPPET; opts.shape: puppetShape's options; opts.before: false for
//   the puppets alone)
import * as THREE from 'three';
import { SPOT } from '/tools/faces.js';
const G = () => window.game;
export async function build(desc, clay, shape) {
  const g = G();
  const CB = await import('/src/charbuild.js?x=' + Date.now() + Math.random());
  const { mhLib } = await import('/src/mhdata.js');
  const B = CB.charBuilderMain(mhLib);
  if (g.chars.mhBuf) B.setMH(g.chars.mhBuf);
  const spec = g.chars.spec(desc);
  spec.clay = clay || undefined; spec.clayShape = shape;
  spec.key = spec.key + '|p' + Date.now() + Math.random();
  const r = B.build(spec);
  g.chars.shapes.set(spec.key, g.chars.makeShape(r));
  const orig = g.chars.spec.bind(g.chars); g.chars.spec = () => spec;
  const ch = g.chars.create(desc); g.chars.spec = orig;
  return ch;
}
function render(ctx, dx, dy, pos, look, fov, w, h) {
  const g = G();
  g.renderer.setSize(w, h, false); if (g.composer) { g.composer.setSize(w, h); if (g.bloom) g.bloom.setSize(w, h); }
  const cam = g.camera.clone(); cam.fov = fov; cam.aspect = w / h; cam.near = 0.01; cam.position.set(...pos); cam.lookAt(...look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  const keep = g.camera; g.camera = cam; if (g.composer) g.composer.passes[0].camera = cam;
  try { g.renderView(cam); } finally { g.camera = keep; if (g.composer) g.composer.passes[0].camera = keep; }
  const c = g.renderer.domElement;
  ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, w, h);
}
export async function sheet(list, tag = 'a', { clay = true, shape, before = true, views = ['f', 'q', 'p', 'b'], S = 300, hour = 11 } = {}) {
  const g = G(), C = await import('/src/characters.js');
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  g.sky.hour = hour; g.sky.update(0, new THREE.Vector3(SPOT.x, 0, SPOT.z), true);
  g.player.spawnAt(SPOT.x, SPOT.z + 6, Math.PI);
  const kinds = before ? [false, clay] : [clay];
  const cv = document.createElement('canvas'); cv.width = S * views.length * kinds.length; cv.height = S * list.length;
  const ctx = cv.getContext('2d');
  for (let k = 0; k < list.length; k++) {
    const desc = typeof list[k] === 'number' ? C.PLAYER_PRESETS[list[k]] : list[k];
    for (let j = 0; j < kinds.length; j++) {
      const ch = await build({ ...desc, hq: true }, kinds[j], shape);
      if (C.mhTexReady) await C.mhTexReady();
      ch.object.position.set(SPOT.x, 0, SPOT.z); ch.object.rotation.y = 0; g.scene.add(ch.object);
      for (let f = 0; f < 40; f++) ch.update(1 / 30, 0, {});
      ch.setDistance(1, true); ch.object.updateMatrixWorld(true);
      const hp = new THREE.Vector3(); ch.bones.head.getWorldPosition(hp);
      const ey = hp.y + 0.06 * ch.scale, lz = hp.z + 0.06;
      views.forEach((v, i) => {
        const x = (j * views.length + i) * S, y = k * S;
        if (v === 'f') render(ctx, x, y, [hp.x, ey, lz + 0.42], [hp.x, ey - 0.012, lz], 30, S, S);
        if (v === 'q') render(ctx, x, y, [hp.x + Math.sin(0.55) * 0.44, ey, lz + Math.cos(0.55) * 0.44], [hp.x, ey - 0.01, lz], 30, S, S);
        if (v === 'p') render(ctx, x, y, [hp.x + 0.46, ey, lz - 0.02], [hp.x, ey - 0.01, lz - 0.02], 30, S, S);
        if (v === 'b') render(ctx, x, y, [SPOT.x + 0.9, 1.25, SPOT.z + 2.4], [SPOT.x, 1.0, SPOT.z], 40, S, S);
        if (v === 'm' && ch.bones.mouthL) { // the mouth close up, three-quarter (its corners: no crack)
          const a = new THREE.Vector3(), c = new THREE.Vector3(); ch.bones.mouthL.getWorldPosition(a); ch.bones.mouthR.getWorldPosition(c); a.add(c).multiplyScalar(0.5);
          render(ctx, x, y, [a.x + 0.09, a.y + 0.01, a.z + 0.2], [a.x, a.y, a.z], 30, S, S);
        }
      });
      g.scene.remove(ch.object); ch.dispose();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, k * S, 150, 20); ctx.fillStyle = '#fff'; ctx.font = '13px system-ui'; ctx.fillText(desc.name || 'persona ' + k, 6, k * S + 14);
  }
  g.resize();
  await fetch('/__snap?name=puppet_' + tag, { method: 'POST', body: cv.toDataURL('image/jpeg', 0.9) });
  return list.length;
}

// skin triangles (MakeHuman's, class 17) whose winding disagrees with their vertices' normals: folds the sculpt made
// (they are culled, and the background shows through). → [{ p: where, d: how far turned }]
export function flips(ch) {
  const out = [];
  for (const m of ch.meshes || [ch.object]) {
    const geo = m.geometry; if (!geo || !geo.attributes.aMat || !geo.index) continue;
    const P = geo.attributes.position, N = geo.attributes.normal, M = geo.attributes.aMat, idx = geo.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (M.getX(a) !== 17) continue;
      const ax = P.getX(a), ay = P.getY(a), az = P.getZ(a), ux = P.getX(b) - ax, uy = P.getY(b) - ay, uz = P.getZ(b) - az, vx = P.getX(c) - ax, vy = P.getY(c) - ay, vz = P.getZ(c) - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      const sx = N.getX(a) + N.getX(b) + N.getX(c), sy = N.getY(a) + N.getY(b) + N.getY(c), sz = N.getZ(a) + N.getZ(b) + N.getZ(c);
      const d = (nx * sx + ny * sy + nz * sz) / (l * (Math.hypot(sx, sy, sz) || 1));
      if (d < -0.2) out.push({ p: [ax, ay, az].map((v) => +v.toFixed(3)), d: +d.toFixed(2) });
    }
  }
  return out;
}

// holes in a head: the person alone in front of magenta, seen from the front, both three-quarters and from below; the
// magenta pixels inside the face's outline are holes (culled triangles). → { total, perView, sheet: .snaps/holes_<tag>.jpg }
export async function holes(desc, clay = true, shape, tag = 'h') {
  const g = G(), C = await import('/src/characters.js');
  const d = typeof desc === 'number' ? C.PLAYER_PRESETS[desc] : desc;
  const ch = await build({ ...d, hq: true }, clay, shape);
  if (C.mhTexReady) await C.mhTexReady();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(1, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2.2));
  ch.object.position.set(0, 0, 0); ch.object.rotation.set(0, 0, 0); scene.add(ch.object);
  for (let f = 0; f < 40; f++) ch.update(1 / 30, 0, {});
  ch.setDistance(1, true); ch.object.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(); ch.bones.mouthL.getWorldPosition(a); ch.bones.mouthR.getWorldPosition(b);
  const m = a.clone().add(b).multiplyScalar(0.5), S = 320, r = g.renderer, rt = new THREE.WebGLRenderTarget(S, S), px = new Uint8Array(S * S * 4);
  const cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S; const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  const views = [[0, 0.02, 0.3], [0.17, 0.02, 0.25], [-0.17, 0.02, 0.25], [0, -0.12, 0.24]], per = [];
  const keepTM = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
  views.forEach(([x, y, z], i) => {
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10); cam.position.set(m.x + x, m.y + y, m.z + z); cam.lookAt(m.x, m.y + 0.02, m.z - 0.02); cam.updateMatrixWorld();
    r.setRenderTarget(rt); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, S, S, px); r.setRenderTarget(null);
    // magenta enclosed by the face: rows where non-magenta lies on both sides
    let n = 0;
    for (let yy = 0; yy < S; yy++) {
      let L = -1, R = -1;
      for (let xx = 0; xx < S; xx++) { const k = (yy * S + xx) * 4, mg = px[k] > 200 && px[k + 1] < 60 && px[k + 2] > 200; if (!mg) { if (L < 0) L = xx; R = xx; } }
      for (let xx = L + 1; xx < R; xx++) { const k = (yy * S + xx) * 4; if (px[k] > 200 && px[k + 1] < 60 && px[k + 2] > 200) n++; }
    }
    per.push(n);
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const s = ((S - 1 - yy) * S + xx) * 4, t = (yy * S + xx) * 4; img.data[t] = px[s]; img.data[t + 1] = px[s + 1]; img.data[t + 2] = px[s + 2]; img.data[t + 3] = 255; }
    ctx.putImageData(img, i * S, 0);
  });
  r.toneMapping = keepTM; rt.dispose(); scene.remove(ch.object); ch.dispose && ch.dispose();
  await fetch('/__snap?name=holes_' + tag, { method: 'POST', body: cv.toDataURL('image/jpeg', 0.9) });
  return { total: per.reduce((s, v) => s + v, 0), perView: per };
}
