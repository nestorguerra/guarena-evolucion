// Dev-only: the user's three reference pictures of the claymation look (2026-10-05: a narrow street of whitewashed
// houses, a wider street with parked cars, the church square with a palm), reproduced in the game through its own
// camera behind the player, at the pictures' size → .snaps/ref_<tag>_<n>.jpg (put beside the references outside).
//   const R = await import('/tools/refcompare.js?' + Date.now()); await R.shoot('a')
import { views } from '/tools/lookcompare.js';
const G = () => window.game;
const step = (n, dt = 1 / 30) => { const g = G(); for (let i = 0; i < n; i++) { if (g.state !== 'play') g.state = 'play'; g.frame(dt); } };

// the three spots (deterministic, from the map)
export async function spots() {
  const g = G(), map = g.map, tmp = {};
  const v = await views();
  const out = [{ name: 'Calle estrecha', x: v[1].x, z: v[1].z, h: v[1].h, hour: 12.25, pitch: -0.18 }];
  // a wider street of the centre with lane lines and cars parked along it
  const P = g.world.landmarks.poi.plaza;
  let best = null;
  for (const e of map.edges) {
    if (!e.drive || e.w < 7 || e.len < 70) continue;
    map.sample(e, e.len / 2, tmp);
    const d = Math.hypot(tmp.x - P.x, tmp.z - P.z);
    if (d > 380) continue;
    let cover = 0, n = 0;
    for (let s = 6; s < e.len - 6; s += 3) { map.sample(e, s, tmp); for (const sd of [-1, 1]) { n++; const nx = -tmp.dz * sd, nz = tmp.dx * sd; for (let o = e.w / 2 + 0.5; o < e.w / 2 + 5; o += 0.5) if (map.buildingAt(tmp.x + nx * o, tmp.z + nz * o)) { cover++; break; } } }
    const score = (cover / Math.max(1, n)) * 100 - d * 0.05;
    if (!best || score > best.score) best = { e, score };
  }
  if (best) { map.sample(best.e, Math.min(20, best.e.len * 0.25), tmp); out.push({ name: 'Calle ancha', street: best.e.name, x: tmp.x, z: tmp.z, h: Math.atan2(tmp.dx, tmp.dz), hour: 12.7, pitch: -0.18 }); }
  // (the third picture's own spot: Santa María from the east across its square — the round tower and the belfry on the
  // left, the palm on the right, broccoli trees and lamp posts between; found 2026-10-05 from the palm by the square)
  // (the picture looks more level: the horizon low in it, the belfry's cross in the sky)
  const ax = -104, az = -62;
  out.push({ name: 'Iglesia', x: ax, z: az, h: Math.atan2(-166 - ax, -57 - az), hour: 13.0, pitch: -0.05 });
  return out;
}

export async function shoot(tag = 'a', { W = 1672, H = 940, list = null } = {}) {
  const g = G(), p = g.player, L = list || (await spots());
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const r = g.renderer, keepResize = g.resize;
  g.resize = () => {};
  r.setSize(W, H, false); if (g.composer) { g.composer.setSize(W, H); if (g.bloom) g.bloom.setSize(W, H); }
  g.camera.aspect = W / H; g.camera.updateProjectionMatrix();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  try {
    for (let i = 0; i < L.length; i++) {
      const v = L[i];
      p.spawnAt(v.x, v.z, v.h); g.sky.hour = v.hour;
      g.cam.yaw = v.h + Math.PI; g.cam.pitch = v.pitch; step(50);
      g.cam.yaw = v.h + Math.PI; g.cam.pitch = v.pitch; g.sky.hour = v.hour; step(10);
      g.render();
      const c = r.domElement; ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, W, H);
      await fetch('/__snap?name=ref_' + tag + '_' + (i + 1), { method: 'POST', body: cv.toDataURL('image/jpeg', 0.9) });
    }
  } finally { g.resize = keepResize; g.resize(); }
  return L.map((v) => ({ name: v.name, street: v.street, x: +v.x.toFixed(1), z: +v.z.toFixed(1) }));
}
