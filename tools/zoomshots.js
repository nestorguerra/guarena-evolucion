// Dev-only: close-ups at full resolution (to look at fine detail: railings, spokes, the ink on thin things).
//   const Z = await import('/tools/zoomshots.js?' + Date.now()); await Z.shoot('a', [['bici', [x, y, z], [tx, ty, tz], fov], …], { W: 1600, H: 1000, hour: 11 })
import * as THREE from 'three';
const G = () => window.game;
async function post(name, q = 0.95) { const c = G().renderer.domElement; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0, c.width, c.height, 0, 0, c.width, c.height); await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', q) }); }
export async function shoot(tag, views, { hour = 11, W = 1600, H = 1000, frames = 6 } = {}) {
  const g = G();
  if (g.interior) g.interiors.leave();
  const keepR = g.render; g.render = () => {};
  g.renderer.setSize(W, H, false);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 2500);
  const out = [];
  try {
    g.sky.hour = hour;
    for (const [name, e, t, fov] of views) {
      g.player.pos.set(e[0] + 3, 0, e[2] + 3);
      for (let i = 0; i < frames; i++) { g.state = 'play'; g.frame(1 / 30); }
      g.player.pos.set(e[0] + 40, 0, e[2] + 40); // (the player out of the picture)
      g.state = 'play'; g.frame(1 / 30);
      cam.fov = fov || 40; cam.position.set(e[0], e[1], e[2]); cam.lookAt(t[0], t[1], t[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      g.sky.update(0, cam.position, true);
      const keep = g.camera; g.camera = cam;
      try { g.renderView(cam); } finally { g.camera = keep; }
      await post(`zm_${name}_${tag}`);
      out.push(`zm_${name}_${tag}`);
    }
  } finally { g.render = keepR; g.resize(); }
  return out;
}
