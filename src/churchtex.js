// The surfaces of Santa María inside, painted here: kept, but old. The whitewash laid on with a trowel over the years
// (its strokes, hairline cracks, a chip here and there showing the mortar); the granite plinth darkened by the damp that
// climbs from the ground; the floor of stone slabs in running bond, each of its own tone, veined, a few cracked or
// replaced; the pews' varnished wood, rubbed pale where people sit and hold on; the runner up the middle, a red weave with
// its border, flattened and faded along its middle; the granite of the columns in its drums; the tomb slabs in the floor.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const CACHE = new Map();
function make(key, w, h, draw, { repeat = true } = {}) {
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, mulberry32(key.length * 977 + key.charCodeAt(0) * 13));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  CACHE.set(key, t);
  return t;
}
// soft blots (wrapped round the edges so the tile repeats)
function blots(x, W, H, r, n, col, rmin, rmax, amin, amax) {
  for (let i = 0; i < n; i++) {
    const cx = r() * W, cy = r() * H, rr = rmin + r() * (rmax - rmin), a = amin + r() * (amax - amin);
    for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {
      if (cx + ox + rr < 0 || cx + ox - rr > W || cy + oy + rr < 0 || cy + oy - rr > H) continue;
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
      g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.fillRect(cx + ox - rr, cy + oy - rr, rr * 2, rr * 2);
    }
  }
}
function blotsIn(x, x0, y0, w, h, r, n, col, rmin, rmax, amin, amax) {
  for (let i = 0; i < n; i++) {
    const cx = x0 + r() * w, cy = y0 + r() * h, rr = rmin + r() * (rmax - rmin), a = amin + r() * (amax - amin);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
}
// a hairline crack: a wandering, branching line
function crack(x, px, py, len, r, col = 'rgba(90,80,70,0.5)', w = 0.8) {
  let a = r() * 6.283;
  x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round';
  x.beginPath(); x.moveTo(px, py);
  for (let k = 0; k < len; k++) { a += (r() - 0.5) * 0.9; px += Math.cos(a) * (2 + r() * 4); py += Math.sin(a) * (2 + r() * 4); x.lineTo(px, py); if (r() < 0.08) { x.stroke(); crack(x, px, py, len * 0.4, r, col, w * 0.7); x.beginPath(); x.moveTo(px, py); } }
  x.stroke();
}

// whitewash (a 1.6 m tile)
export function calTexture() {
  return make('cal2', 512, 512, (x, W, H, r) => {
    x.fillStyle = '#f3efe6'; x.fillRect(0, 0, W, H);
    blots(x, W, H, r, 40, '255,253,248', 30, 120, 0.15, 0.35);  // the coats, uneven
    blots(x, W, H, r, 30, '222,212,196', 20, 90, 0.08, 0.2);
    // the trowel: broad soft strokes, slightly glossier
    for (let i = 0; i < 90; i++) { const cx = r() * W, cy = r() * H, a = r() * 3.14, L = 40 + r() * 90; x.strokeStyle = `rgba(${r() < 0.5 ? '255,255,252' : '214,204,188'},${0.06 + r() * 0.08})`; x.lineWidth = 8 + r() * 18; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a) * L * 0.5 + (r() - 0.5) * 20, cy + Math.sin(a) * L * 0.5 + (r() - 0.5) * 20, cx + Math.cos(a) * L, cy + Math.sin(a) * L); x.stroke(); }
    // hairline cracks, a few chips showing the grey mortar under the lime, dust settled in the hollows
    for (let i = 0; i < 4; i++) crack(x, r() * W, r() * H, 18 + r() * 20, r, 'rgba(120,108,92,0.35)', 0.7);
    for (let i = 0; i < 7; i++) { const cx = r() * W, cy = r() * H, rr = 2 + r() * 5; x.fillStyle = 'rgba(160,150,135,0.55)'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283, q = rr * (0.6 + r() * 0.6); x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } x.closePath(); x.fill(); x.strokeStyle = 'rgba(255,255,250,0.6)'; x.lineWidth = 1; x.stroke(); }
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(150,140,120,${0.05 + r() * 0.1})`; x.fillRect(r() * W, r() * H, 1, 1); }
  });
}
// the granite plinth along the walls: two courses of ashlar, the damp's tide marks over the lower one (a 1.6 m tile, 1 m tall)
export function plinthTexture() {
  return make('plinth', 512, 320, (x, W, H, r) => {
    granite(x, W, H, r, [178, 172, 162]);
    // the courses and their joints
    const rows = [0, H * 0.55, H];
    let off = 0;
    for (let i = 0; i < 2; i++) {
      const y0 = rows[i], y1 = rows[i + 1];
      for (let bx = -off; bx < W; bx += W / 3) { x.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '60,55,50'},${0.04 + r() * 0.06})`; x.fillRect(bx, y0, W / 3, y1 - y0); x.fillStyle = 'rgba(70,64,58,0.7)'; x.fillRect(bx, y0, 2, y1 - y0); }
      x.fillStyle = 'rgba(70,64,58,0.7)'; x.fillRect(0, y1 - 2, W, 2);
      off = W / 6;
    }
    // the damp, rising from the floor: darker at the foot, a soft wavy tide line, salts whitening its edge
    const g = x.createLinearGradient(0, H, 0, H * 0.25); g.addColorStop(0, 'rgba(70,60,48,0.5)'); g.addColorStop(0.6, 'rgba(90,80,64,0.22)'); g.addColorStop(1, 'rgba(90,80,64,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(235,230,215,0.35)'; x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 40; i++) { const px = (i / 40) * W, py = H * (0.42 + 0.06 * Math.sin(i * 0.7) + 0.03 * Math.sin(i * 2.3)); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(120,110,95,0.5)'; x.beginPath(); x.arc(r() * W, H * (0.1 + r() * 0.15), 2 + r() * 4, 0, 6.283); x.fill(); } // chips at the arrises
  });
}
// granite: the grains of quartz, feldspar and mica (base: its grey)
function granite(x, W, H, r, base) {
  x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(0, 0, W, H);
  blots(x, W, H, r, 30, `${base[0] + 20},${base[1] + 18},${base[2] + 14}`, 20, 70, 0.1, 0.25);
  blots(x, W, H, r, 24, `${base[0] - 40},${base[1] - 40},${base[2] - 38}`, 15, 60, 0.06, 0.16);
  for (let i = 0; i < W * H * 0.035; i++) {
    const v = r();
    x.fillStyle = v < 0.35 ? `rgba(40,38,40,${0.35 + r() * 0.4})` : v < 0.7 ? `rgba(250,248,244,${0.3 + r() * 0.4})` : v < 0.85 ? `rgba(196,160,140,${0.3 + r() * 0.3})` : `rgba(120,116,112,${0.3 + r() * 0.3})`;
    const s = 1 + r() * 2.2; x.fillRect(r() * W, r() * H, s, s * (0.6 + r() * 0.8));
  }
}
// the columns' granite: drums of about 70 cm (a tile of one drum: the joint at its top)
export function drumTexture() {
  return make('drum', 256, 256, (x, W, H, r) => {
    granite(x, W, H, r, [186, 180, 170]);
    x.fillStyle = 'rgba(80,74,66,0.75)'; x.fillRect(0, 0, W, 3);
    x.fillStyle = 'rgba(255,250,240,0.25)'; x.fillRect(0, 3, W, 2);
    blots(x, W, H, r, 6, '90,84,76', 20, 50, 0.05, 0.12); // the grime of hands at the height people touch
  });
}
// the floor: limestone slabs in running bond, three by four in a 2.4 m tile
export function floorTexture() {
  return make('floor2', 1024, 1024, (x, W, H, r) => {
    x.fillStyle = '#6a645c'; x.fillRect(0, 0, W, H); // the mortar
    const cols = 3, rows = 4, sw = W / cols, sh = H / rows;
    for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
      const x0 = i * sw + (j % 2) * sw * 0.5, y0 = j * sh, v = r();
      const base = v < 0.12 ? [150, 146, 138] : v < 0.2 ? [196, 186, 168] : [176 + r() * 20, 170 + r() * 18, 156 + r() * 16]; // (now and then one replaced, greyer or newer)
      x.save(); x.beginPath(); x.rect(x0 + 2, y0 + 2, sw - 4, sh - 4); x.clip();
      x.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`; x.fillRect(x0, y0, sw, sh);
      blotsIn(x, x0, y0, sw, sh, r, 5, `${base[0] + 18},${base[1] + 16},${base[2] + 12}`, 30, 110, 0.1, 0.25);
      blotsIn(x, x0, y0, sw, sh, r, 4, `${base[0] - 30},${base[1] - 30},${base[2] - 28}`, 20, 80, 0.06, 0.14);
      // veins
      for (let k = 0; k < 3; k++) { x.strokeStyle = `rgba(110,100,88,${0.15 + r() * 0.2})`; x.lineWidth = 0.8 + r() * 1.5; x.beginPath(); let px = x0 + r() * sw, py = y0 + r() * sh; x.moveTo(px, py); for (let s = 0; s < 8; s++) { px += (r() - 0.4) * 40; py += (r() - 0.5) * 26; x.lineTo(px, py); } x.stroke(); }
      // polished by feet in the middle, the edges duller; a chipped corner, a crack across now and then
      const pg = x.createRadialGradient(x0 + sw / 2, y0 + sh / 2, 10, x0 + sw / 2, y0 + sh / 2, sw * 0.6); pg.addColorStop(0, 'rgba(255,250,240,0.12)'); pg.addColorStop(1, 'rgba(60,55,50,0.1)');
      x.fillStyle = pg; x.fillRect(x0, y0, sw, sh);
      if (r() < 0.25) crack(x, x0 + r() * sw, y0 + r() * sh, 14 + r() * 10, r, 'rgba(60,54,48,0.6)', 1.2);
      x.restore();
      if (r() < 0.3) { const cx = x0 + (r() < 0.5 ? 4 : sw - 4), cy = y0 + (r() < 0.5 ? 4 : sh - 4); x.fillStyle = '#5a554e'; x.beginPath(); x.arc(cx, cy, 5 + r() * 7, 0, 6.283); x.fill(); }
    }
    for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,36,32'},${0.04 + r() * 0.08})`; x.fillRect(r() * W, r() * H, 1 + r(), 1 + r()); }
  });
}
// the pews: oak, varnished dark, rubbed pale and glossy where people sit and hold on (a 1 m tile along the grain)
export function pewTexture() {
  return make('pew', 256, 512, (x, W, H, r) => {
    x.fillStyle = '#5e3a22'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { const gx = r() * W, L = H * (0.3 + r() * 0.7), gy = r() * H; x.strokeStyle = `rgba(${r() < 0.6 ? '30,16,8' : '150,100,60'},${0.12 + r() * 0.2})`; x.lineWidth = 0.6 + r() * 1.6; x.beginPath(); x.moveTo(gx, gy - L / 2); for (let t = 0; t <= 1; t += 0.1) x.lineTo(gx + Math.sin(t * 6 + i) * 2.5, gy - L / 2 + L * t); x.stroke(); } // the grain runs along v
    for (let i = 0; i < 5; i++) { const kx = r() * W, ky = r() * H; for (let k = 0; k < 4; k++) { x.strokeStyle = 'rgba(30,14,6,0.4)'; x.lineWidth = 1; x.beginPath(); x.ellipse(kx, ky, 6 + k * 4, 3 + k * 2, 0, 0, 6.283); x.stroke(); } }
    blots(x, W, H, r, 10, '170,120,80', 20, 60, 0.1, 0.22); // the rubbed places
    for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(200,160,120,${0.1 + r() * 0.15})`; x.lineWidth = 0.6; const sx = r() * W, sy = r() * H; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 30, sy + (r() - 0.5) * 6); x.stroke(); } // scratches
  });
}
// the runner: a red weave, its border of cream and gold, faded and flattened along the middle (u across 1.5 m, v along 3 m)
export function carpetTexture() {
  return make('carpet2', 256, 512, (x, W, H, r) => {
    x.fillStyle = '#8c1d22'; x.fillRect(0, 0, W, H);
    // the field: a small lozenge pattern in a darker red
    x.strokeStyle = 'rgba(60,8,12,0.45)'; x.lineWidth = 2;
    const st = 26;
    for (let yy = -st; yy < H + st; yy += st) for (let xx = 30; xx < W - 30; xx += st) { x.beginPath(); x.moveTo(xx, yy + st / 2); x.lineTo(xx + st / 2, yy); x.lineTo(xx + st, yy + st / 2); x.lineTo(xx + st / 2, yy + st); x.closePath(); x.stroke(); }
    for (let yy = 0; yy < H; yy += st) for (let xx = 30 + st / 2; xx < W - 30; xx += st) { x.fillStyle = 'rgba(210,150,80,0.35)'; x.beginPath(); x.arc(xx, yy + st / 2, 2.2, 0, 6.283); x.fill(); }
    // the border: dark edge, a cream band with a running pattern, a gold line
    for (const side of [0, 1]) {
      const bx = side ? W - 30 : 0;
      x.fillStyle = '#3a0c0e'; x.fillRect(bx + (side ? 24 : 0), 0, 6, H);
      x.fillStyle = '#d8c39a'; x.fillRect(bx + (side ? 6 : 6), 0, 18, H);
      x.fillStyle = '#7a1418'; for (let yy = 0; yy < H; yy += 16) { x.beginPath(); x.moveTo(bx + 15, yy); x.lineTo(bx + 21, yy + 8); x.lineTo(bx + 15, yy + 16); x.lineTo(bx + 9, yy + 8); x.closePath(); x.fill(); }
      x.fillStyle = '#c89a40'; x.fillRect(bx + (side ? 4 : 24), 0, 2, H);
    }
    // the weave: fine threads across and along
    for (let yy = 0; yy < H; yy += 2) { x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; x.fillRect(0, yy, W, 1); }
    for (let xx = 0; xx < W; xx += 3) { x.fillStyle = `rgba(255,220,200,${0.02 + r() * 0.03})`; x.fillRect(xx, 0, 1, H); }
    // worn: the middle flattened and faded where everybody walks, a few darker spots
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(255,220,200,0)'); g.addColorStop(0.35, 'rgba(255,214,196,0.13)'); g.addColorStop(0.5, 'rgba(255,214,196,0.18)'); g.addColorStop(0.65, 'rgba(255,214,196,0.13)'); g.addColorStop(1, 'rgba(255,220,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    blots(x, W, H, r, 8, '50,10,10', 8, 26, 0.08, 0.2);
  });
}
// a tomb slab in the floor: granite, a cross and lettering worn by feet
export function tombTexture(i) {
  const names = [['AQVI YACE', 'D. ALONSO', 'DE MENDOZA', 'MDCXII'], ['SEPVLTVRA', 'DE LOS', 'CABRERA', 'MDLXXXIX'], ['AQVI YACE', 'D.ª MARIA', 'DE ARCE', 'MDCLXV'], ['R.I.P.', 'PRESBITERO', 'J. GARCIA', 'MDCCXL']];
  const t = names[i % names.length];
  return make('tomb' + i, 256, 512, (x, W, H, r) => {
    granite(x, W, H, r, [150, 146, 140]);
    x.strokeStyle = 'rgba(50,46,42,0.75)'; x.lineWidth = 4; x.strokeRect(14, 14, W - 28, H - 28);
    x.fillStyle = 'rgba(46,42,38,0.8)'; x.fillRect(W / 2 - 5, 50, 10, 90); x.fillRect(W / 2 - 32, 80, 64, 10);
    x.font = 'bold 26px serif'; x.textAlign = 'center';
    t.forEach((line, k) => { x.fillStyle = 'rgba(40,36,32,0.75)'; x.fillText(line, W / 2, 200 + k * 46); });
    // the feet have smoothed the middle: the letters there fade
    const g = x.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, H * 0.45); g.addColorStop(0, 'rgba(180,176,168,0.5)'); g.addColorStop(1, 'rgba(180,176,168,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    crack(x, r() * W, r() * H, 20, r, 'rgba(50,46,42,0.6)', 1.4);
  }, { repeat: false });
}
