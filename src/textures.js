// Procedural textures (canvas 2D): facades of Extremaduran houses, roofs, ground surfaces, road markings, signs, sprites.
import { mulberry32, clamp } from './util.js';
import { STYLE } from './style.js';

// ---------------------------------------------------------------- tileable noise
function makeNoiseTile(n, period, seed) {
  // value noise, tileable with `period` cells across the tile
  const rnd = mulberry32(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * period, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * period, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx);
      const x0 = xi % period, x1 = (xi + 1) % period, y0 = yi % period, y1 = (yi + 1) % period;
      const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
      out[y * n + x] = (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
  }
  return out;
}
function fbmTile(n, seed, octaves = 5, base = 4) {
  const out = new Float32Array(n * n);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const t = makeNoiseTile(n, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += t[i] * amp;
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

const NOISE_CACHE = new Map();
function noise(n, seed, oct = 5, base = 4) {
  const k = `${n}_${seed}_${oct}_${base}`;
  if (!NOISE_CACHE.has(k)) NOISE_CACHE.set(k, fbmTile(n, seed, oct, base));
  return NOISE_CACHE.get(k);
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext;
  c.getContext = function (type, opts) { return g.call(this, type, type === '2d' ? { willReadFrequently: true, ...(opts || {}) } : opts); };
  return c;
}
// Copy RGBA rows into dst flipping vertically (canvas row 0 = top; texture v=0 = bottom)
function copyFlipped(dst, src, S, offset) {
  const row = S * 4;
  for (let y = 0; y < S; y++) dst.set(src.subarray((S - 1 - y) * row, (S - y) * row), offset + y * row);
}

// Multiply an area of the canvas by noise (keeps tiling). strength ~0.1
function grain(ctx, S, seed, strength, oct = 5, base = 4, bias = 0) {
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const nz = noise(S, seed, oct, base);
  for (let i = 0, p = 0; i < nz.length; i++, p += 4) {
    const m = 1 + (nz[i] - 0.5 + bias) * strength * 2;
    d[p] = clamp(d[p] * m, 0, 255);
    d[p + 1] = clamp(d[p + 1] * m, 0, 255);
    d[p + 2] = clamp(d[p + 2] * m, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}
function speckle(ctx, S, rnd, count, colors, rmin = 0.5, rmax = 1.5, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const x = rnd() * S, y = rnd() * S, r = rmin + rnd() * (rmax - rmin);
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();
}

// ================================================================ FACADES
// Each tile = one bay (3.2 m wide) × one floor (3.1 m tall). Alpha channel: 255 wall (tintable), 128 glass (lit at night), 0 other.
export const BAY_W = 3.2;
export const FLOOR_H = 3.1;
export const FACADE_LAYERS_PER_STYLE = 8; // 0 gWin 1 gDoor 2 gGarage 3 uWin 4 uBalcony 5 gBlank 6 uBlank 7 gShop
export const FACADE_STYLES = ['trad_verde', 'trad_ocre', 'renovada', 'color', 'ladrillo', 'moderna', 'nave', 'piedra'];
export const ROOF_BASE = FACADE_STYLES.length * FACADE_LAYERS_PER_STYLE; // roof layers follow
export const ROOF_LAYERS = ['teja', 'azotea', 'chapa', 'uralita'];

export const STYLE_DEF = {
  trad_verde: { wall: '#f7f6f1', zocalo: '#8d8f8c', zocH: 0.95, wood: '#2f5d3a', frame: '#2f5d3a', reja: true, persiana: '#e8e1cf', door: 'wood', doorCol: '#3f5f36', garage: '#e9e7df' },
  trad_ocre: { wall: '#f8f5ec', zocalo: '#b8793f', zocH: 0.9, wood: '#6b3f22', frame: '#6b3f22', reja: true, persiana: '#ddd3bf', door: 'wood', doorCol: '#5a321c', garage: '#6b3f22' },
  renovada: { wall: '#f5f4f0', zocalo: 'stone', zocH: 1.0, wood: '#d9d9d6', frame: '#e8e8e6', reja: true, persiana: '#f2f0ea', door: 'alu', doorCol: '#8a6a4a', garage: '#f0efeb' },
  color: { wall: '#ffffff', zocalo: '#a58f75', zocH: 0.8, wood: '#ffffff', frame: '#ffffff', reja: false, persiana: '#efe8d8', door: 'wood', doorCol: '#704626', garage: '#e0d8c8', trims: '#ffffff' },
  ladrillo: { wall: 'brick', zocalo: '#7d6e62', zocH: 0.6, wood: '#b5b5b0', frame: '#a9aaa6', reja: false, persiana: '#c9c3b5', door: 'alu', doorCol: '#6b6b68', garage: '#9a9a96' },
  moderna: { wall: '#ecebe7', zocalo: '#4d4f52', zocH: 0.45, wood: '#2c2e31', frame: '#2c2e31', reja: false, persiana: '#707275', door: 'modern', doorCol: '#2c2e31', garage: '#3a3c3f', big: true },
  nave: { wall: 'metal', zocalo: '#9a9a92', zocH: 1.2, wood: '#6d7c86', frame: '#6d7c86', reja: false, persiana: '#aaa', door: 'metal', doorCol: '#4f6d7a', garage: '#4f6d7a' },
  piedra: { wall: 'stone', zocalo: 'stone', zocH: 0.4, wood: '#4e3421', frame: '#4e3421', reja: true, persiana: '#d0c8b8', door: 'wood', doorCol: '#4a2e1a', garage: '#4a2e1a' },
};

// the diorama's façades (Ajustes › Estética › Diorama; src/diorama.js): the visual spec's palette over the same kinds of
// house — ivory and cream whitewash, toasted-ochre plinths, deep green or dark wood doors and shutters; brick, stone,
// sheds and the modern blocks keep what they are. Applied once, before the town is painted (main.js boot), so the 3D
// details of the fronts (facades.js) take the same colours
const DIORAMA_DEF = {
  trad_verde: { wall: '#f0e5cd', zocalo: '#bb7d44', wood: '#354d3d', frame: '#354d3d', persiana: '#e6dcc4', doorCol: '#354d3d', garage: '#e6dcc6' },
  trad_ocre: { wall: '#f2e8d4', zocalo: '#bb7d44', wood: '#5a3a24', frame: '#4a3020', persiana: '#dcd0b8', doorCol: '#4e3220', garage: '#5a3a24' },
  renovada: { wall: '#ece2cc', wood: '#d8d2c4', frame: '#e6dfd0', persiana: '#ece4d4', doorCol: '#6e5034', garage: '#e8e0d0' },
  color: { zocalo: '#bf9258', persiana: '#e8dcc6', doorCol: '#5a3a24' },
  moderna: { wall: '#e6ded0', zocalo: '#6a6560', persiana: '#8a8580' },
};
export function applyDioramaPalette() { for (const [k, v] of Object.entries(DIORAMA_DEF)) Object.assign(STYLE_DEF[k], v); }

function facadePainter(S) {
  const kx = S / BAY_W, ky = S / FLOOR_H;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  // rect in metres from bottom-left
  const R = (x0, y0, x1, y1) => [x0 * kx, S - y1 * ky, (x1 - x0) * kx, (y1 - y0) * ky];
  const fill = (col, x0, y0, x1, y1) => { ctx.fillStyle = col; const r = R(x0, y0, x1, y1); ctx.fillRect(r[0], r[1], r[2], r[3]); };
  return { c, ctx, R, fill, kx, ky, S };
}

function paintWall(P, st, rnd, seed, upper) {
  const { ctx, S, fill } = P;
  if (st.wall === 'brick') {
    ctx.fillStyle = '#9b5a3c';
    ctx.fillRect(0, 0, S, S);
    const bh = 0.075 * P.ky, bw = 0.25 * P.kx;
    for (let row = 0, y = S; y > -bh; row++, y -= bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw + off; x < S + bw; x += bw) {
        const v = 0.82 + rnd() * 0.3;
        const r = Math.floor(160 * v), g = Math.floor(88 * v), b = Math.floor(58 * v);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 1, y - bh + 1, bw - 2, bh - 2);
      }
    }
    grain(ctx, S, seed, 0.08, 4, 16);
  } else if (st.wall === 'metal') {
    ctx.fillStyle = '#c9cdce';
    ctx.fillRect(0, 0, S, S);
    const rib = S / 16;
    for (let i = 0; i < 16; i++) {
      const g = ctx.createLinearGradient(i * rib, 0, (i + 1) * rib, 0);
      g.addColorStop(0, '#b3b8ba'); g.addColorStop(0.3, '#dde1e2'); g.addColorStop(0.6, '#c4c9ca'); g.addColorStop(1, '#a9aeb0');
      ctx.fillStyle = g;
      ctx.fillRect(i * rib, 0, rib, S);
    }
    grain(ctx, S, seed, 0.05, 3, 4);
    // rust streaks
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#8a5a3a';
      ctx.fillRect(rnd() * S, rnd() * S * 0.5, 2 + rnd() * 3, S * (0.2 + rnd() * 0.4));
    }
    ctx.globalAlpha = 1;
  } else if (st.wall === 'stone') {
    // granite ashlar (sillería)
    ctx.fillStyle = '#b9ad98';
    ctx.fillRect(0, 0, S, S);
    const bh = 0.42 * P.ky;
    for (let row = 0, y = S; y > -bh; row++, y -= bh) {
      let x = row % 2 ? -0.35 * P.kx : 0;
      while (x < S) {
        const bw = (0.55 + rnd() * 0.45) * P.kx;
        const v = 0.85 + rnd() * 0.25;
        ctx.fillStyle = `rgb(${Math.floor(186 * v)},${Math.floor(174 * v)},${Math.floor(152 * v)})`;
        ctx.fillRect(x + 1.5, y - bh + 1.5, bw - 3, bh - 3);
        x += bw;
      }
    }
    speckle(ctx, S, rnd, S * 20, ['#6f675b', '#d8cfbd', '#8c8272', '#4d473f'], 0.6, 1.6, 0.5);
    grain(ctx, S, seed, 0.12, 5, 4);
  } else {
    ctx.fillStyle = st.wall;
    ctx.fillRect(0, 0, S, S);
    grain(ctx, S, seed, 0.035, 5, 4);
    // whitewash layering: soft blotches
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#e8e2d2' : '#ffffff';
      ctx.beginPath();
      ctx.arc(rnd() * S, rnd() * S, 20 + rnd() * 60, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (!upper) {
    // zócalo
    const zh = st.zocH;
    if (st.zocalo === 'stone') {
      // irregular slate / granite cladding
      fill('#8a8378', 0, 0, BAY_W, zh);
      for (let i = 0; i < 40; i++) {
        const x = rnd() * BAY_W, y = rnd() * zh, w = 0.2 + rnd() * 0.35, h = 0.1 + rnd() * 0.18;
        const v = Math.floor(100 + rnd() * 70);
        fill(`rgb(${v},${v - 6},${v - 14})`, x, y, Math.min(BAY_W, x + w), Math.min(zh, y + h));
      }
      speckle(ctx, S, rnd, 900, ['#5d574e', '#b7ae9e'], 0.5, 1.5, 0.6);
    } else {
      fill(st.zocalo, 0, 0, BAY_W, zh);
      const g = ctx.createLinearGradient(0, S - zh * P.ky, 0, S);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      const r = P.R(0, 0, BAY_W, zh);
      ctx.fillRect(r[0], r[1], r[2], r[3]);
    }
    // top edge of zócalo
    fill('rgba(0,0,0,0.18)', 0, zh - 0.02, BAY_W, zh);
    // humidity stains above zócalo
    if (st.wall !== 'metal' && st.wall !== 'stone') {
      const g2 = ctx.createLinearGradient(0, S - (zh + 0.5) * P.ky, 0, S - zh * P.ky);
      g2.addColorStop(0, 'rgba(120,110,90,0)');
      g2.addColorStop(1, 'rgba(120,110,90,0.10)');
      ctx.fillStyle = g2;
      const r2 = P.R(0, zh, BAY_W, zh + 0.5);
      ctx.fillRect(r2[0], r2[1], r2[2], r2[3]);
    }
  }
}

function paintGlass(P, x0, y0, x1, y1, rnd) {
  const { ctx } = P;
  const r = P.R(x0, y0, x1, y1);
  const g = ctx.createLinearGradient(0, r[1], 0, r[1] + r[3]);
  g.addColorStop(0, '#6f8596');
  g.addColorStop(0.45, '#2b3843');
  g.addColorStop(1, '#1b232b');
  ctx.fillStyle = g;
  ctx.fillRect(r[0], r[1], r[2], r[3]);
  // curtain hint
  if (rnd() < 0.7) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(235,225,200,0.35)' : 'rgba(210,190,160,0.3)';
    ctx.fillRect(r[0] + r[2] * 0.05, r[1] + r[3] * 0.1, r[2] * 0.3, r[3] * 0.85);
    ctx.fillRect(r[0] + r[2] * 0.65, r[1] + r[3] * 0.1, r[2] * 0.3, r[3] * 0.85);
  }
  // diagonal reflection
  ctx.save();
  ctx.beginPath();
  ctx.rect(r[0], r[1], r[2], r[3]);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.moveTo(r[0] + r[2] * 0.2, r[1]);
  ctx.lineTo(r[0] + r[2] * 0.45, r[1]);
  ctx.lineTo(r[0] + r[2] * 0.05, r[1] + r[3]);
  ctx.lineTo(r[0] - r[2] * 0.2, r[1] + r[3]);
  ctx.fill();
  ctx.restore();
}

function paintWindow(P, st, rnd, opts) {
  const { ctx, fill } = P;
  const { x0, y0, x1, y1 } = opts;
  // reveal (recess) shadow
  fill('rgba(60,55,45,0.55)', x0 - 0.04, y0 - 0.02, x1 + 0.04, y1 + 0.04);
  paintGlass(P, x0, y0, x1, y1, rnd);
  // persiana (roller shutter) partially lowered
  const pDown = opts.shutter ?? (0.15 + rnd() * 0.6);
  if (pDown > 0.05) {
    const ys = y1 - (y1 - y0) * pDown;
    fill(st.persiana, x0, ys, x1, y1);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = ys; y < y1; y += 0.045) {
      const r = P.R(x0, y, x1, y + 0.008);
      ctx.fillRect(r[0], r[1], r[2], r[3]);
    }
    fill('rgba(0,0,0,0.25)', x0, ys - 0.015, x1, ys);
  }
  // frame + mullion
  const fw = 0.05;
  fill(st.frame, x0, y0, x0 + fw, y1);
  fill(st.frame, x1 - fw, y0, x1, y1);
  fill(st.frame, x0, y1 - fw, x1, y1);
  fill(st.frame, x0, y0, x1, y0 + fw);
  const mx = (x0 + x1) / 2;
  fill(st.frame, mx - 0.025, y0, mx + 0.025, y1 - (y1 - y0) * pDown);
  // sill (vierteaguas)
  fill('#e6e1d6', x0 - 0.08, y0 - 0.07, x1 + 0.08, y0);
  fill('rgba(0,0,0,0.25)', x0 - 0.08, y0 - 0.1, x1 + 0.08, y0 - 0.07);
  // wooden shutters (contraventanas) open at sides for traditional styles
  if (opts.shutters) {
    const w = (x1 - x0) / 2;
    fill(st.wood, x0 - w - 0.02, y0, x0 - 0.02, y1);
    fill(st.wood, x1 + 0.02, y0, x1 + w + 0.02, y1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = y0 + 0.08; y < y1 - 0.05; y += 0.09) {
      let r = P.R(x0 - w + 0.02, y, x0 - 0.06, y + 0.02); ctx.fillRect(r[0], r[1], r[2], r[3]);
      r = P.R(x1 + 0.06, y, x1 + w - 0.02, y + 0.02); ctx.fillRect(r[0], r[1], r[2], r[3]);
    }
  }
  // iron grille (reja)
  if (opts.reja) {
    const gx0 = x0 - 0.06, gx1 = x1 + 0.06, gy0 = y0 - 0.02, gy1 = y1 + 0.05;
    const bar = (a, b, c, d, col) => fill(col, a, b, c, d);
    for (const pass of [0, 1]) {
      const col = pass ? '#1d1d1f' : 'rgba(0,0,0,0.35)';
      const o = pass ? 0 : 0.018;
      const t = 0.016;
      bar(gx0 + o, gy0 - o, gx0 + t + o, gy1 - o, col);
      bar(gx1 - t + o, gy0 - o, gx1 + o, gy1 - o, col);
      bar(gx0 + o, gy1 - t - o, gx1 + o, gy1 - o, col);
      bar(gx0 + o, gy0 - o, gx1 + o, gy0 + t - o, col);
      bar(gx0 + o, (gy0 + gy1) * 0.5 - o, gx1 + o, (gy0 + gy1) * 0.5 + t - o, col);
      for (let x = gx0 + 0.11; x < gx1 - 0.05; x += 0.11) bar(x + o, gy0 - o, x + t * 0.8 + o, gy1 - o, col);
    }
    // decorative top curls
    ctx.strokeStyle = '#1d1d1f';
    ctx.lineWidth = Math.max(1.5, 0.014 * P.kx);
    for (let x = gx0 + 0.11; x < gx1 - 0.05; x += 0.22) {
      const r = P.R(x - 0.05, gy1 - 0.12, x + 0.05, gy1 - 0.02);
      ctx.beginPath();
      ctx.arc(r[0] + r[2] / 2, r[1] + r[3] / 2, r[3] / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // geranium pots on the sill
  if (opts.flowers) {
    for (let i = 0; i < 3; i++) {
      const px = x0 + 0.1 + i * (x1 - x0 - 0.2) / 2;
      fill('#b5552e', px - 0.07, y0, px + 0.07, y0 + 0.12);
      ctx.fillStyle = '#3f7a35';
      const r = P.R(px - 0.12, y0 + 0.1, px + 0.12, y0 + 0.28);
      ctx.beginPath(); ctx.ellipse(r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] / 2, r[3] / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rnd() < 0.5 ? '#d8263a' : '#e8487a';
      for (let k = 0; k < 7; k++) {
        const fx = r[0] + rnd() * r[2], fy = r[1] + rnd() * r[3] * 0.7;
        ctx.beginPath(); ctx.arc(fx, fy, 0.022 * P.kx, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function paintDoor(P, st, rnd, kind) {
  const { ctx, fill } = P;
  const x0 = 1.0, x1 = 2.2, y1 = 2.3;
  // stone frame (recercado de granito)
  if (kind !== 'metal' && kind !== 'modern') {
    fill('#cfc6b4', x0 - 0.16, 0, x1 + 0.16, y1 + 0.16);
    speckle(ctx, P.S, rnd, 400, ['#8a8272', '#efe8da', '#6b6559'], 0.5, 1.4, 0.7);
    // keystone lintel
    fill('rgba(0,0,0,0.12)', x0 - 0.16, y1 + 0.02, x1 + 0.16, y1 + 0.04);
  }
  fill('rgba(30,25,20,0.6)', x0 - 0.02, 0, x1 + 0.02, y1 + 0.02);
  if (kind === 'wood') {
    fill(st.doorCol, x0, 0.12, x1, y1);
    const mx = (x0 + x1) / 2;
    fill('rgba(0,0,0,0.35)', mx - 0.012, 0.12, mx + 0.012, y1);
    // raised panels (cuarterones)
    for (const [a, b] of [[x0 + 0.08, mx - 0.08], [mx + 0.08, x1 - 0.08]]) {
      for (const [c, d] of [[0.3, 1.1], [1.25, 1.85]]) {
        fill('rgba(255,255,255,0.10)', a, c, b, d);
        fill('rgba(0,0,0,0.22)', a, c, b, c + 0.03);
        fill('rgba(0,0,0,0.22)', b - 0.03, c, b, d);
      }
      // upper glass with grille
      paintGlass(P, a, 1.95, b, y1 - 0.08, rnd);
      fill('#1d1d1f', (a + b) / 2 - 0.01, 1.95, (a + b) / 2 + 0.01, y1 - 0.08);
    }
    // knocker
    fill('#b08d3c', mx - 0.13, 1.15, mx - 0.07, 1.22);
    fill('#b08d3c', mx + 0.07, 1.15, mx + 0.13, 1.22);
  } else if (kind === 'alu') {
    fill(st.doorCol, x0, 0.12, x1, y1);
    paintGlass(P, x0 + 0.12, 0.9, x1 - 0.12, y1 - 0.12, rnd);
    fill('#1d1d1f', x0 + 0.1, 0.9, x1 - 0.1, 0.94);
    for (let x = x0 + 0.2; x < x1 - 0.12; x += 0.12) fill('#1d1d1f', x, 0.9, x + 0.018, y1 - 0.12);
    fill('#d6d6d0', x0 + 0.05, 1.1, x0 + 0.1, 1.2);
  } else if (kind === 'modern') {
    fill('#2a2b2e', x0, 0.05, x1, y1 + 0.1);
    paintGlass(P, x0 + 0.08, 0.1, x0 + 0.34, y1, rnd);
    fill('#b8b8b4', x1 - 0.2, 1.0, x1 - 0.16, 1.5);
  } else {
    fill(st.doorCol, x0 - 0.3, 0, x1 + 0.3, 2.6);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = x0 - 0.25; x < x1 + 0.3; x += 0.1) { const r = P.R(x, 0, x + 0.015, 2.6); ctx.fillRect(r[0], r[1], r[2], r[3]); }
  }
  // step
  fill('#d9d2c2', x0 - 0.2, 0, x1 + 0.2, 0.12);
  fill('rgba(0,0,0,0.25)', x0 - 0.2, 0.1, x1 + 0.2, 0.12);
  // house number tile
  if (kind !== 'metal') {
    fill('#f4f6f8', x1 + 0.25, 2.0, x1 + 0.45, 2.17);
    fill('#2f5aa0', x1 + 0.27, 2.02, x1 + 0.43, 2.15);
  }
}

function paintGarage(P, st, rnd) {
  const { ctx, fill } = P;
  const x0 = 0.35, x1 = 2.85, y1 = 2.55;
  fill('rgba(30,25,20,0.55)', x0 - 0.04, 0, x1 + 0.04, y1 + 0.05);
  fill(st.garage, x0, 0, x1, y1);
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for (let x = x0 + 0.1; x < x1; x += 0.13) { const r = P.R(x, 0, x + 0.02, y1); ctx.fillRect(r[0], r[1], r[2], r[3]); }
  fill('rgba(255,255,255,0.08)', x0, y1 - 0.25, x1, y1);
  // lock
  fill('#8d8d88', (x0 + x1) / 2 - 0.03, 1.0, (x0 + x1) / 2 + 0.03, 1.12);
  // "vado permanente" plate
  fill('#ffffff', x1 + 0.07, 1.7, x1 + 0.33, 2.02);
  fill('#c8202a', x1 + 0.09, 1.72, x1 + 0.31, 2.0);
  fill('#2d56a8', x1 + 0.12, 1.75, x1 + 0.28, 1.97);
  fill('#c8202a', x1 + 0.12, 1.85, x1 + 0.28, 1.87);
}

function paintBalcony(P, st, rnd) {
  const { ctx, fill } = P;
  const x0 = 1.1, x1 = 2.1;
  fill('rgba(60,55,45,0.55)', x0 - 0.04, 0.12, x1 + 0.04, 2.3);
  paintGlass(P, x0, 0.12, x1, 2.25, rnd);
  const pDown = 0.2 + rnd() * 0.5;
  const ys = 2.25 - 2.13 * pDown;
  fill(st.persiana, x0, ys, x1, 2.25);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = ys; y < 2.25; y += 0.045) { const r = P.R(x0, y, x1, y + 0.008); ctx.fillRect(r[0], r[1], r[2], r[3]); }
  fill(st.frame, x0, 0.12, x0 + 0.05, 2.25);
  fill(st.frame, x1 - 0.05, 0.12, x1, 2.25);
  fill(st.frame, x0, 2.2, x1, 2.25);
  fill(st.frame, (x0 + x1) / 2 - 0.025, 0.12, (x0 + x1) / 2 + 0.025, ys);
  // slab
  fill('#e3ddd0', 0.85, 0.0, 2.35, 0.12);
  fill('rgba(0,0,0,0.3)', 0.85, -0.05, 2.35, 0.0);
  // railing
  for (const pass of [0, 1]) {
    const col = pass ? '#1f1f22' : 'rgba(0,0,0,0.3)';
    const o = pass ? 0 : 0.02;
    fill(col, 0.88 + o, 0.95 - o, 2.32 + o, 1.0 - o);
    fill(col, 0.88 + o, 0.12 - o, 2.32 + o, 0.16 - o);
    for (let x = 0.9; x <= 2.32; x += 0.1) fill(col, x + o, 0.12 - o, x + 0.016 + o, 1.0 - o);
  }
  if (rnd() < 0.6) {
    // flower pots hanging
    for (const px of [1.0, 2.2]) {
      fill('#b5552e', px - 0.06, 0.95, px + 0.06, 1.07);
      ctx.fillStyle = '#3f7a35';
      const r = P.R(px - 0.1, 1.02, px + 0.1, 1.2);
      ctx.beginPath(); ctx.ellipse(r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] / 2, r[3] / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e02a40';
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(r[0] + rnd() * r[2], r[1] + rnd() * r[3] * 0.7, 0.02 * P.kx, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

function paintShop(P, st, rnd, addGlass) {
  const { ctx, fill } = P;
  const x0 = 0.22, x1 = 2.98, y0 = 0.12, y1 = 2.5;
  const frame = rnd() < 0.5 ? '#2b2d30' : '#b9bbb8';
  fill('rgba(30,28,25,0.6)', x0 - 0.05, 0, x1 + 0.05, y1 + 0.05);
  paintGlass(P, x0, y0, x1, y1, rnd);
  addGlass(x0, y0, x1, y1);
  // interior hints: shelves and a warm interior glow
  ctx.globalAlpha = 0.16;
  fill('#f3d9a8', x0 + 0.1, y0 + 0.1, x1 - 0.1, y1 - 0.2);
  ctx.globalAlpha = 0.22;
  for (let k = 0; k < 3; k++) fill('#1a1612', x0 + 0.15, y0 + 0.55 + k * 0.55, x1 - 0.15, y0 + 0.6 + k * 0.55);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 10; i++) {
    const cols = ['#c2553f', '#d8b64a', '#4a78a8', '#e8e4dc', '#5d8f58'];
    const bx = x0 + 0.2 + rnd() * 2.3, by = y0 + 0.62 + Math.floor(rnd() * 3) * 0.55;
    fill(cols[Math.floor(rnd() * cols.length)], bx, by, bx + 0.12 + rnd() * 0.2, by + 0.18 + rnd() * 0.2);
  }
  ctx.globalAlpha = 1;
  fill(frame, x0, y0, x0 + 0.06, y1); fill(frame, x1 - 0.06, y0, x1, y1);
  fill(frame, x0, y1 - 0.06, x1, y1); fill(frame, x0, y0, x1, y0 + 0.08);
  fill(frame, 1.95, y0, 2.0, y1); fill(frame, 1.95, 2.1, x1, 2.14);
  fill('#9a9a95', 2.1, 1.05, 2.14, 1.35);
  // fascia (sign band)
  const fascia = ['#1f3b5a', '#7a1f1f', '#23472c', '#3b3b3b', '#8a5a1c', '#5a2d5f'][Math.floor(rnd() * 6)];
  fill(fascia, 0.1, 2.58, 3.1, 3.0);
  fill('rgba(255,255,255,0.12)', 0.1, 2.93, 3.1, 3.0);
  // awning (toldo)
  if (rnd() < 0.55) {
    const c1 = ['#1d6e3e', '#b02a2a', '#1f4f8a', '#c77a12'][Math.floor(rnd() * 4)];
    for (let i = 0; i < 10; i++) fill(i % 2 ? c1 : '#f1ede4', 0.1 + i * 0.3, 2.3, 0.4 + i * 0.3, 2.58);
    fill('rgba(0,0,0,0.25)', 0.1, 2.24, 3.1, 2.3);
  }
}

// Build alpha mask: wall = 255 where pixel is close to base wall colour; glass = 128 for dark-blue glass pixels; else 0
function finalizeFacade(P, st, isWallFn) {
  const { ctx, S } = P;
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = isWallFn(d[i], d[i + 1], d[i + 2], (i / 4) % S, Math.floor(i / 4 / S));
  return img;
}

function drawFacadeLayer(style, layer, S, seed) {
  const st = STYLE_DEF[style];
  const rnd = mulberry32(seed);
  const P = facadePainter(S);
  const upper = layer === 3 || layer === 4 || layer === 6;
  paintWall(P, st, rnd, seed, upper);
  // mark glass rectangles to encode in alpha later
  const glassRects = [];
  const addGlass = (x0, y0, x1, y1) => glassRects.push(P.R(x0, y0, x1, y1));
  const trad = style === 'trad_verde' || style === 'trad_ocre';
  const big = !!st.big;
  if (style === 'nave') {
    if (layer === 1 || layer === 2) {
      paintDoor(P, st, rnd, 'metal');
    } else if (layer === 0 || layer === 3) {
      // high strip windows
      paintGlass(P, 0.4, 2.2, 2.8, 2.8, rnd); addGlass(0.4, 2.2, 2.8, 2.8);
      P.fill('#6d7c86', 0.4, 2.2, 2.8, 2.24); P.fill('#6d7c86', 0.4, 2.76, 2.8, 2.8);
      for (let x = 0.4; x <= 2.8; x += 0.6) P.fill('#6d7c86', x, 2.2, x + 0.04, 2.8);
    }
  } else if (layer === 0 || layer === 3) {
    const x0 = big ? 0.55 : 1.05, x1 = big ? 2.65 : 2.15;
    const y0 = upper ? (big ? 0.5 : 0.95) : (big ? 0.6 : 0.95), y1 = big ? 2.55 : 2.3;
    paintWindow(P, st, rnd, {
      x0, y0, x1, y1,
      reja: st.reja && (!upper || rnd() < 0.3),
      shutters: trad && upper && rnd() < 0.7,
      flowers: (trad || style === 'renovada') && rnd() < 0.55,
      shutter: big ? 0.05 + rnd() * 0.25 : undefined,
    });
    addGlass(x0, y0, x1, y1);
  } else if (layer === 1) {
    paintDoor(P, st, rnd, st.door);
    addGlass(1.1, 1.95, 2.1, 2.2);
  } else if (layer === 2) {
    paintGarage(P, st, rnd);
  } else if (layer === 4) {
    if (big) {
      paintWindow(P, st, rnd, { x0: 0.3, y0: 0.1, x1: 2.9, y1: 2.6, shutter: 0.1 });
      P.fill('rgba(20,20,22,0.85)', 0.25, 0.9, 2.95, 0.95);
      addGlass(0.3, 0.1, 2.9, 2.6);
    } else {
      paintBalcony(P, st, rnd);
      addGlass(1.1, 0.12, 2.1, 2.25);
    }
  }
  if (layer === 7) paintShop(P, st, rnd, addGlass);
  // AC split unit sometimes (modern Spain)
  if (upper && (layer === 3) && rnd() < 0.35 && style !== 'piedra' && style !== 'nave') {
    P.fill('rgba(0,0,0,0.25)', 2.52, 1.95, 3.07, 2.36);
    P.fill('#ecece8', 2.5, 2.0, 3.05, 2.4);
    P.fill('#c9c9c4', 2.55, 2.05, 3.0, 2.08);
    P.fill('#b0b0aa', 2.55, 2.12, 3.0, 2.35);
  }
  // (the eave shadow is shaded per wall in the building material: here it repeated on every floor)
  // alpha encoding
  const img = P.ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const tint = style === 'color' || style === 'trad_verde' || style === 'trad_ocre' || style === 'renovada' || style === 'moderna';
  const wallRGB = tint ? hexRGB(st.wall) : null;
  for (let i = 0, p = 0; p < d.length; i++, p += 4) {
    let a = 0;
    if (wallRGB) {
      const dr = d[p] - wallRGB[0], dg = d[p + 1] - wallRGB[1], db = d[p + 2] - wallRGB[2];
      if (dr * dr + dg * dg + db * db < 900) a = 255;
    }
    d[p + 3] = a;
  }
  for (const r of glassRects) {
    const x0 = Math.max(0, Math.floor(r[0])), y0 = Math.max(0, Math.floor(r[1]));
    const x1 = Math.min(S, Math.ceil(r[0] + r[2])), y1 = Math.min(S, Math.ceil(r[1] + r[3]));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * S + x) * 4;
      // only dark glass pixels (not persiana / frame)
      const lum = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
      if (lum < 120 && d[p + 2] >= d[p] - 4) d[p + 3] = 128;
    }
  }
  return img.data;
}

function hexRGB(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ---------------------------------------------------------------- roofs
function drawRoofLayer(kind, S, seed) {
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  if (kind === 'teja') {
    // Arab clay tiles: columns alternating canal (concave) / cobija (convex). u across slope, v down slope.
    ctx.fillStyle = '#9c4a2c';
    ctx.fillRect(0, 0, S, S);
    const cols = 16, rows = 7;
    const cw = S / cols, rh = S / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const v = 0.78 + rnd() * 0.34;
        const base = [178 * v, 86 * v, 52 * v];
        if (rnd() < 0.12) { base[0] *= 0.8; base[1] *= 0.85; base[2] *= 0.8; }
        const x = i * cw, y = j * rh + (i % 2 ? rh * 0.5 : 0);
        const g = ctx.createLinearGradient(x, 0, x + cw, 0);
        const convex = i % 2 === 0;
        const k1 = convex ? 0.7 : 1.1, k2 = convex ? 1.25 : 0.75;
        g.addColorStop(0, rgbs(base, k1));
        g.addColorStop(0.5, rgbs(base, k2));
        g.addColorStop(1, rgbs(base, k1 * 0.9));
        ctx.fillStyle = g;
        ctx.fillRect(x, y - rh, cw, rh * 1.02);
        ctx.fillRect(x, y, cw, rh * 1.02);
        // overlap shadow at the lower edge of each tile
        ctx.fillStyle = 'rgba(40,15,5,0.35)';
        ctx.fillRect(x, y + rh - 3, cw, 3);
        ctx.fillRect(x, y - 3, cw, 3);
      }
    }
    // lichen / dirt
    ctx.globalAlpha = 0.18;
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = rnd() < 0.5 ? '#6f6a4a' : '#d9c7a0';
      ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 3 + rnd() * 14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    grain(ctx, S, seed, 0.1, 4, 8);
  } else if (kind === 'azotea') {
    // baldosa catalana (terracotta squares) with grout
    ctx.fillStyle = '#9c8a77';
    ctx.fillRect(0, 0, S, S);
    const n = 12, w = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 0.85 + rnd() * 0.25;
      ctx.fillStyle = `rgb(${Math.floor(176 * v)},${Math.floor(118 * v)},${Math.floor(88 * v)})`;
      ctx.fillRect(i * w + 1.5, j * w + 1.5, w - 3, w - 3);
    }
    ctx.globalAlpha = 0.25;
    for (let k = 0; k < 30; k++) { ctx.fillStyle = '#5a5040'; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 4 + rnd() * 20, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    grain(ctx, S, seed, 0.1, 4, 8);
  } else if (kind === 'chapa') {
    const n = 20, w = S / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      g.addColorStop(0, '#9aa1a3'); g.addColorStop(0.2, '#d7dcdd'); g.addColorStop(0.35, '#b9bfc1'); g.addColorStop(1, '#a8aeb0');
      ctx.fillStyle = g;
      ctx.fillRect(i * w, 0, w, S);
    }
    ctx.globalAlpha = 0.15;
    for (let k = 0; k < 12; k++) { ctx.fillStyle = '#6b5a45'; ctx.fillRect(rnd() * S, rnd() * S, 3, 30 + rnd() * 80); }
    ctx.globalAlpha = 1;
    grain(ctx, S, seed, 0.06, 4, 4);
  } else {
    // uralita: grey corrugated fibre cement, weathered
    const n = 14, w = S / n;
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      g.addColorStop(0, '#7d7f79'); g.addColorStop(0.5, '#b2b3ab'); g.addColorStop(1, '#7d7f79');
      ctx.fillStyle = g;
      ctx.fillRect(i * w, 0, w, S);
    }
    ctx.globalAlpha = 0.3;
    for (let k = 0; k < 60; k++) { ctx.fillStyle = rnd() < 0.5 ? '#5f6a45' : '#3e3d38'; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 2 + rnd() * 12, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    grain(ctx, S, seed, 0.12, 5, 4);
  }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 0;
  return img.data;
}
const rgbs = (b, k) => `rgb(${clamp(Math.floor(b[0] * k), 0, 255)},${clamp(Math.floor(b[1] * k), 0, 255)},${clamp(Math.floor(b[2] * k), 0, 255)})`;

export function buildFacadeArray(S) {
  const nLayers = ROOF_BASE + ROOF_LAYERS.length;
  const data = new Uint8Array(S * S * 4 * nLayers);
  let li = 0;
  for (let s = 0; s < FACADE_STYLES.length; s++) {
    for (let l = 0; l < FACADE_LAYERS_PER_STYLE; l++) {
      const px = drawFacadeLayer(FACADE_STYLES[s], l, S, 1000 + s * 37 + l * 7);
      copyFlipped(data, px, S, li * S * S * 4);
      li++;
    }
  }
  for (let r = 0; r < ROOF_LAYERS.length; r++) {
    copyFlipped(data, drawRoofLayer(ROOF_LAYERS[r], S, 5000 + r * 13), S, li * S * S * 4);
    li++;
  }
  return { data, size: S, layers: nLayers };
}

// ================================================================ GROUND
// Layers of the ground texture array + metres per repeat
export const GROUND = {
  asphalt: 0, asphalt2: 1, acera: 2, plaza: 3, tierra: 4, albero: 5, cesped: 6, hierbaseca: 7,
  rastrojo: 8, arado: 9, cultivo: 10, olivar: 11, hormigon: 12, grava: 13, pista: 14, adoquin: 15,
  bordillo: 16, // granite kerb: drawn procedurally by the ground material from the strip's local frame (samples hormigon)
};
export const GROUND_SCALE = [5, 7, 2.4, 6, 7, 5, 4, 8, 9, 9, 7, 9, 6, 5, 4, 3, 1];

function drawGroundLayer(name, S, seed) {
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const base = (col) => { ctx.fillStyle = col; ctx.fillRect(0, 0, S, S); };
  switch (name) {
    case 'asphalt':
    case 'asphalt2': {
      // (the diorama's asphalt: a warm grey, darker, its grain finer)
      const D = STYLE.diorama, PL = STYLE.plastilina; // (claymation: a warm, faintly pink grey clay, as in the user's pictures)
      base(name === 'asphalt' ? (PL ? '#7b716c' : D ? '#6c675f' : '#7c7a76') : (PL ? '#746a65' : D ? '#655f58' : '#696866'));
      speckle(ctx, S, rnd, S * S * (PL ? 0.1 : 0.22), PL ? ['#5d5450', '#665c57', '#4f4744'] : D ? ['#58544d', '#7a746b', '#857e74', '#504c46', '#766d62'] : ['#5f5d59', '#8e8b85', '#9c9892', '#55534f', '#857d74'], 0.6, 1.6, 0.6); // (claymation: no light specks — the clay is one grey)
      grain(ctx, S, seed, 0.12, 5, 3);
      if (name === 'asphalt') {
        // patches & cracks
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < 3; i++) { ctx.fillStyle = rnd() < 0.5 ? '#3d3e40' : '#616264'; ctx.fillRect(rnd() * S, rnd() * S, 40 + rnd() * 120, 30 + rnd() * 80); }
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#2b2b2c';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
          let x = rnd() * S, y = rnd() * S;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'acera': {
      // Spanish pavement tiles: 30 cm squares with 4-pastilla relief (2.4 m -> 8 tiles)
      const D = STYLE.diorama; // (the diorama's pavements: sand-coloured)
      base(D ? '#a8916a' : '#a79c8a');
      const n = 8, w = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 0.9 + rnd() * 0.14;
        ctx.fillStyle = D ? `rgb(${Math.floor(220 * v)},${Math.floor(200 * v)},${Math.floor(162 * v)})` : `rgb(${Math.floor(206 * v)},${Math.floor(194 * v)},${Math.floor(172 * v)})`;
        ctx.fillRect(i * w + 1.5, j * w + 1.5, w - 3, w - 3);
        const q = w / 2;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          ctx.fillRect(i * w + a * q + q * 0.22, j * w + b * q + q * 0.22, q * 0.6, q * 0.6);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(i * w + a * q + q * 0.18, j * w + b * q + q * 0.18, q * 0.6, q * 0.6);
        }
      }
      grain(ctx, S, seed, 0.1, 4, 4);
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 20; i++) { ctx.fillStyle = '#3a342c'; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 2 + rnd() * 8, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      break;
    }
    case 'plaza': {
      // granite slabs in running bond
      const D = STYLE.diorama;
      base(D ? '#988462' : '#8e877a');
      const rows = 6, rh = S / rows;
      for (let j = 0; j < rows; j++) {
        let x = (j % 2) * rh * 0.7;
        x -= rh * 1.4;
        while (x < S) {
          const w = rh * (1.1 + rnd() * 0.8);
          const v = 0.85 + rnd() * 0.2;
          ctx.fillStyle = D ? `rgb(${Math.floor(214 * v)},${Math.floor(194 * v)},${Math.floor(156 * v)})` : `rgb(${Math.floor(190 * v)},${Math.floor(182 * v)},${Math.floor(166 * v)})`;
          ctx.fillRect(x + 1.5, j * rh + 1.5, w - 3, rh - 3);
          x += w;
        }
      }
      speckle(ctx, S, rnd, S * S * 0.08, ['#6d665b', '#d9d1c0', '#8a8274'], 0.5, 1.4, 0.5);
      grain(ctx, S, seed, 0.08, 4, 4);
      break;
    }
    case 'adoquin': {
      base('#6d665d');
      const n = 12, w = S / n;
      for (let j = 0; j < n; j++) for (let i = -1; i < n; i++) {
        const x = i * w + (j % 2) * w * 0.5;
        const v = 0.8 + rnd() * 0.3;
        ctx.fillStyle = `rgb(${Math.floor(150 * v)},${Math.floor(142 * v)},${Math.floor(130 * v)})`;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x + 2, j * w + 2, w - 4, w - 4, 6) : ctx.rect(x + 2, j * w + 2, w - 4, w - 4);
        ctx.fill();
      }
      grain(ctx, S, seed, 0.1, 4, 4);
      break;
    }
    case 'tierra': {
      base('#a88c67');
      grain(ctx, S, seed, 0.14, 5, 3);
      speckle(ctx, S, rnd, S * S * 0.08, ['#8a7152', '#c2a882', '#7a6247', '#d8c3a0'], 0.8, 2.4, 0.7);
      // wheel ruts
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#6e5a40';
      ctx.fillRect(S * 0.22, 0, S * 0.08, S);
      ctx.fillRect(S * 0.7, 0, S * 0.08, S);
      ctx.globalAlpha = 1;
      break;
    }
    case 'albero': {
      base('#d8b574');
      grain(ctx, S, seed, 0.08, 5, 4);
      speckle(ctx, S, rnd, S * S * 0.1, ['#c49d5c', '#e8cc92', '#b8904f'], 0.6, 1.6, 0.6);
      break;
    }
    case 'cesped': {
      base('#4f7d33');
      grain(ctx, S, seed, 0.18, 5, 4);
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < S * S * 0.05; i++) {
        ctx.fillStyle = rnd() < 0.5 ? '#6a9a43' : '#3a6326';
        ctx.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'hierbaseca': {
      base('#b39d62');
      grain(ctx, S, seed, 0.16, 5, 4);
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < S * S * 0.05; i++) {
        ctx.fillStyle = ['#c9b37a', '#8f7d48', '#a38e56', '#7d7a4a'][Math.floor(rnd() * 4)];
        ctx.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 4);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'rastrojo': {
      // harvested cereal stubble in rows (September)
      base('#c9a964');
      grain(ctx, S, seed, 0.1, 5, 4);
      const rows = 24;
      for (let r = 0; r < rows; r++) {
        const y = (r / rows) * S;
        ctx.fillStyle = r % 2 ? 'rgba(120,95,50,0.18)' : 'rgba(240,220,160,0.14)';
        ctx.fillRect(0, y, S, S / rows * 0.5);
      }
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < S * S * 0.04; i++) { ctx.fillStyle = rnd() < 0.5 ? '#e0c787' : '#9a7f45'; ctx.fillRect(rnd() * S, rnd() * S, 1, 2); }
      ctx.globalAlpha = 1;
      break;
    }
    case 'arado': {
      base('#8a6446');
      grain(ctx, S, seed, 0.16, 5, 3);
      const rows = 20;
      for (let r = 0; r < rows; r++) {
        const y = (r / rows) * S;
        const g = ctx.createLinearGradient(0, y, 0, y + S / rows);
        g.addColorStop(0, 'rgba(60,40,25,0.35)');
        g.addColorStop(0.5, 'rgba(180,140,105,0.2)');
        g.addColorStop(1, 'rgba(60,40,25,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, S, S / rows);
      }
      speckle(ctx, S, rnd, S * S * 0.03, ['#5d412c', '#b08a68', '#c8b8a0'], 1, 3, 0.6);
      break;
    }
    case 'cultivo': {
      // tomato / vegetable rows (Vegas Altas irrigated crops)
      base('#7a5c40');
      const rows = 14;
      for (let r = 0; r < rows; r++) {
        const y = (r / rows) * S;
        ctx.fillStyle = '#3f6a2a';
        ctx.fillRect(0, y + 2, S, S / rows * 0.62);
        for (let k = 0; k < 90; k++) {
          ctx.fillStyle = rnd() < 0.18 ? '#c8321f' : rnd() < 0.5 ? '#5b8a37' : '#2f5520';
          ctx.beginPath();
          ctx.arc(rnd() * S, y + 3 + rnd() * S / rows * 0.58, 1.5 + rnd() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      grain(ctx, S, seed, 0.1, 4, 4);
      break;
    }
    case 'olivar': {
      base('#a0714f');
      grain(ctx, S, seed, 0.16, 5, 3);
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 60; i++) { ctx.fillStyle = rnd() < 0.5 ? '#8e8a4f' : '#b89a6c'; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 4 + rnd() * 18, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      speckle(ctx, S, rnd, S * S * 0.03, ['#7b563a', '#c9a27e'], 1, 2.5, 0.6);
      break;
    }
    case 'hormigon': {
      base('#a7a49c');
      grain(ctx, S, seed, 0.1, 5, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 12; i++) { ctx.fillStyle = '#5b5850'; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, 5 + rnd() * 30, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      break;
    }
    case 'grava': {
      base('#bcb3a2');
      speckle(ctx, S, rnd, S * S * 0.3, ['#8f8676', '#d8d0c0', '#a39a88', '#e8e2d6', '#716a5e'], 1, 3, 0.9);
      grain(ctx, S, seed, 0.08, 4, 4);
      break;
    }
    case 'pista': {
      // artificial turf with mowing stripes
      base('#3f8a3a');
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(0, (i * S) / 4, S, S / 4); }
      grain(ctx, S, seed, 0.1, 4, 8);
      break;
    }
  }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  return img.data;
}

export function buildGroundArray(S) {
  const names = Object.keys(GROUND);
  const data = new Uint8Array(S * S * 4 * names.length);
  names.forEach((n, i) => copyFlipped(data, drawGroundLayer(n, S, 9000 + i * 17), S, i * S * S * 4));
  return { data, size: S, layers: names.length };
}

// ================================================================ road markings (RGBA canvas atlas, 4 rows)
// row 0: dashed centre line, row 1: solid line, row 2: zebra, row 3: stop line + STOP text
export function markingsCanvas() {
  const W = 256, H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const paint = 'rgba(245,245,238,0.92)';
  // row 0 (y 0-128): dashed: 1/2 painted along u (u runs along the road)
  ctx.fillStyle = paint;
  ctx.fillRect(0, 48, W * 0.5, 32);
  // row 1: solid
  ctx.fillRect(0, 128 + 48, W, 32);
  // row 2: zebra: stripes along road direction u
  for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + 8, 256 + 8, 40, 112);
  // row 3: STOP
  ctx.fillRect(0, 384 + 8, W, 24);
  ctx.font = 'bold 72px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STOP', W / 2, 384 + 108);
  // grime
  const img = ctx.getImageData(0, 0, W, H);
  const rnd = mulberry32(77);
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) img.data[i] = Math.floor(img.data[i] * (0.65 + rnd() * 0.35));
  ctx.putImageData(img, 0, 0);
  return c;
}

// ================================================================ sprites & small canvases
export function radialCanvas(size, stops) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
export function smokeCanvas(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(5);
  if (STYLE.plastilina) { // claymation: smoke is a tuft of cotton wool — denser puffs, fibrous at the edge
    for (let i = 0; i < 14; i++) {
      const r = size * (0.1 + rnd() * 0.12), x = size / 2 + (rnd() - 0.5) * size * 0.36, y = size / 2 + (rnd() - 0.5) * size * 0.36;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.7, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 160; i++) { // the fibres
      const a = rnd() * Math.PI * 2, r0 = size * (0.18 + rnd() * 0.22), L = size * (0.04 + rnd() * 0.08);
      const x = size / 2 + Math.cos(a) * r0, y = size / 2 + Math.sin(a) * r0, b = a + (rnd() - 0.5) * 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * L, y + Math.sin(b) * L); ctx.stroke();
    }
    return c;
  }
  for (let i = 0; i < 26; i++) {
    const r = size * (0.12 + rnd() * 0.18);
    const x = size / 2 + (rnd() - 0.5) * size * 0.4, y = size / 2 + (rnd() - 0.5) * size * 0.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

export function flagCanvas(kind) {
  const c = canvas(192, 128);
  const ctx = c.getContext('2d');
  if (kind === 'es') {
    ctx.fillStyle = '#c60b1e'; ctx.fillRect(0, 0, 192, 128);
    ctx.fillStyle = '#ffc400'; ctx.fillRect(0, 32, 192, 64);
    // simplified coat of arms
    ctx.fillStyle = '#ad1519'; ctx.fillRect(44, 44, 26, 34);
    ctx.fillStyle = '#c8b100'; ctx.fillRect(40, 40, 34, 5); ctx.fillRect(36, 44, 4, 36); ctx.fillRect(74, 44, 4, 36);
  } else if (kind === 'ex') {
    ctx.fillStyle = '#00a650'; ctx.fillRect(0, 0, 192, 43);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 43, 192, 42);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 85, 192, 43);
  } else if (kind === 'eu') {
    ctx.fillStyle = '#003399'; ctx.fillRect(0, 0, 192, 128);
    ctx.fillStyle = '#ffcc00';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      star(ctx, 96 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 6);
    }
  }
  return c;
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// Sign atlas: 8x4 cells of 128px. Returns {canvas, cells: {name: [col,row]}}
export function signAtlas() {
  const N = 128, C = 8, Rw = 4;
  const c = canvas(N * C, N * Rw);
  const ctx = c.getContext('2d');
  const cells = {};
  let idx = 0;
  const cell = (name, fn) => {
    const cx = (idx % C) * N, cy = Math.floor(idx / C) * N;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.rect(0, 0, N, N); ctx.clip();
    fn(ctx, N);
    ctx.restore();
    cells[name] = [idx % C, Math.floor(idx / C)];
    idx++;
  };
  const circle = (ctx, fill, stroke, w) => { ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke(); } };
  cell('stop', (ctx) => {
    ctx.fillStyle = '#fff';
    oct(ctx, 64, 64, 62); ctx.fill();
    ctx.fillStyle = '#c8102e'; oct(ctx, 64, 64, 56); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STOP', 64, 66);
  });
  cell('ceda', (ctx) => {
    ctx.fillStyle = '#c8102e';
    ctx.beginPath(); ctx.moveTo(4, 10); ctx.lineTo(124, 10); ctx.lineTo(64, 118); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(24, 22); ctx.lineTo(104, 22); ctx.lineTo(64, 94); ctx.closePath(); ctx.fill();
  });
  cell('prohibido', (ctx) => { circle(ctx, '#c8102e'); ctx.fillStyle = '#fff'; ctx.fillRect(22, 54, 84, 20); });
  cell('v30', (ctx) => {
    circle(ctx, '#fff', '#c8102e', 14);
    ctx.fillStyle = '#111'; ctx.font = 'bold 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('30', 64, 68);
  });
  cell('sentido', (ctx) => {
    circle(ctx, '#1a4fa0');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(64, 18); ctx.lineTo(98, 58); ctx.lineTo(76, 58); ctx.lineTo(76, 108); ctx.lineTo(52, 108); ctx.lineTo(52, 58); ctx.lineTo(30, 58); ctx.closePath(); ctx.fill();
  });
  cell('paso', (ctx) => {
    ctx.fillStyle = '#1a4fa0'; ctx.fillRect(4, 4, 120, 120);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(64, 14); ctx.lineTo(114, 110); ctx.lineTo(14, 110); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(34, 92, 60, 6); ctx.beginPath(); ctx.arc(64, 48, 8, 0, 7); ctx.fill(); ctx.fillRect(60, 56, 8, 26);
  });
  cell('farmacia', (ctx) => {
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#19d45a'; ctx.fillRect(44, 12, 40, 104); ctx.fillRect(12, 44, 104, 40);
  });
  cell('parada', (ctx) => {
    ctx.fillStyle = '#1a4fa0'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.fillText('BUS', 64, 52);
    ctx.fillRect(28, 66, 72, 34); ctx.fillStyle = '#1a4fa0'; ctx.fillRect(34, 72, 60, 14);
  });
  const text = (name, bg, fg, txt, size = 30, font = 'bold') => cell(name, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = fg; ctx.font = `${font} ${size}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = txt.split('\n');
    lines.forEach((l, i) => ctx.fillText(l, 64, 64 + (i - (lines.length - 1) / 2) * size * 1.1));
  });
  text('bar', '#7a1f1f', '#ffe9b0', 'BAR', 44);
  text('cafe', '#3b2a1c', '#f3d7a5', 'CAFÉ', 40);
  text('panaderia', '#d9b36a', '#4a2a12', 'PANA-\nDERÍA', 28);
  text('estanco', '#6b2323', '#f5d24a', 'T\nESTANCO', 26);
  text('banco', '#0d5c46', '#ffffff', 'BANCO', 36);
  text('super', '#e31e24', '#ffffff', 'SUPER', 38);
  text('ropa', '#222222', '#e8e8e8', 'MODA', 40);
  text('peluqueria', '#6b3a78', '#ffffff', 'PELU', 40);
  text('tienda', '#2d5a8c', '#ffffff', 'TIENDA', 30);
  text('taller', '#333333', '#f2c500', 'TALLER', 32);
  text('farmacia_txt', '#ffffff', '#11903f', 'FARMACIA', 22);
  text('ayto', '#e9e1cf', '#3a2a1a', 'AYUNTA-\nMIENTO', 22);
  text('correos', '#ffcc00', '#003a8c', 'Correos', 30);
  text('loteria', '#ffffff', '#c8102e', 'LOTERÍA', 28);
  text('guarena', '#ffffff', '#111111', 'GUAREÑA', 26);
  text('hotel', '#1c2c4a', '#ffffff', 'HOTEL', 36);
  text('pizza', '#b3261e', '#fff3cf', 'PIZZA', 38);
  text('kebab', '#e57722', '#ffffff', 'KEBAB', 36);
  text('muebles', '#5b4636', '#f0e2cc', 'MUEBLES', 26);
  text('zapateria', '#1e1e1e', '#f6c26b', 'CALZADOS', 22);
  text('joyeria', '#18181c', '#e6c77a', 'JOYERÍA', 26);
  text('optica', '#ffffff', '#0b5aa6', 'ÓPTICA', 30);
  text('chapa', '#1f2e3b', '#f5d000', 'CHAPA Y\nPINTURA', 20);
  text('cooperativa', '#2f5d2a', '#f4e8c0', 'COOPE-\nRATIVA', 22);
  // town entry sign (white with red border)
  cell('entrada', (ctx) => {
    ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 20, 128, 88);
    ctx.fillStyle = '#fff'; ctx.fillRect(6, 26, 116, 76);
    ctx.fillStyle = '#111'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GUAREÑA', 64, 64);
  });
  return { canvas: c, cells, cols: C, rows: Rw };
}
function oct(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

// Text label canvas for building names on landmark plaques, big letters etc.
export function textCanvas(txt, { w = 512, h = 128, bg = null, fg = '#fff', font = 'bold 64px Arial', stroke = null } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = 8; ctx.strokeStyle = stroke; ctx.strokeText(txt, w / 2, h / 2); }
  ctx.fillStyle = fg;
  ctx.fillText(txt, w / 2, h / 2);
  return c;
}

// ================================================================ stone & special textures for landmarks
// kind: 'mamposteria' (rubble masonry), 'sillar' (granite ashlar), 'teja' (roof tiles), 'reloj' (clock face)
// claymation: the church's stones as pieces of clay pressed into a bed of softer clay — round-cornered, each its own flat
// colour, lighter where the thumb rounded its top and darker under, a soft groove round each; no speckle, no grain
function clayStones(ctx, S, rnd, ash, hx) {
  ctx.fillStyle = ash ? '#a89c86' : '#cdbfa3';
  ctx.fillRect(0, 0, S, S);
  if (hx) { hx.fillStyle = '#202020'; hx.fillRect(0, 0, S, S); } // (its relief: each stone a bulge, the bed sunk between)
  const rows = ash ? 5 : 7, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = ash ? (r % 2 ? -S / 5 : 0) : -rnd() * rh;
    while (x < S) {
      const w = ash ? S * (0.26 + rnd() * 0.16) : rh * (1 + rnd() * 0.9);
      const v = ash ? 0.88 + rnd() * 0.14 : 0.72 + rnd() * 0.26, warm = rnd() < 0.45;
      const b = (ash ? [196, 186, 164] : warm ? [178, 150, 112] : [152, 144, 128]).map((k) => k * v);
      const pad = S * (ash ? 0.012 : 0.01 + rnd() * 0.012), ww = w - 2 * pad, hh = rh - 2 * pad - (ash ? 0 : rnd() * rh * 0.12);
      const y0 = r * rh + pad, rad = Math.min(ww, hh) * (ash ? 0.2 : 0.38 + rnd() * 0.1);
      for (const ox of [0, -S, S]) {
        const x0 = x + pad + ox;
        if (x0 > S || x0 + ww < 0) continue;
        ctx.save();
        ctx.shadowColor = 'rgba(40,30,20,0.45)'; ctx.shadowBlur = S * 0.012; ctx.shadowOffsetY = S * 0.005; // (its groove)
        const gr = ctx.createLinearGradient(x0, y0, x0 + ww * 0.35, y0 + hh);
        gr.addColorStop(0, `rgb(${b.map((k) => Math.min(255, Math.round(k * 1.13))).join(',')})`);
        gr.addColorStop(0.45, `rgb(${b.map(Math.round).join(',')})`);
        gr.addColorStop(1, `rgb(${b.map((k) => Math.round(k * 0.84)).join(',')})`);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.roundRect(x0, y0, ww, hh, rad); ctx.fill();
        ctx.restore();
        if (hx) { const hv = Math.round(150 + v * 90); hx.fillStyle = `rgb(${hv},${hv},${hv})`; hx.beginPath(); hx.roundRect(x0 + S * 0.006, y0 + S * 0.006, ww - S * 0.012, hh - S * 0.012, rad); hx.fill(); }
      }
      x += w;
    }
  }
}
export function stoneCanvas(kind, S = 512, seed = 1) {
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  if (STYLE.plastilina && (kind === 'mamposteria' || kind === 'sillar')) {
    const hc = canvas(S), hx = hc.getContext('2d');
    clayStones(ctx, S, rnd, kind === 'sillar', hx);
    // (rounded: the relief blurred a little, so every stone swells from its bed)
    const bc = canvas(S), bx = bc.getContext('2d'); bx.filter = `blur(${Math.max(1, Math.round(S * 0.008))}px)`; bx.drawImage(hc, 0, 0);
    c.bump = bc;
    return c;
  }
  if (kind === 'mamposteria') {
    ctx.fillStyle = '#c9bca3'; // lime mortar
    ctx.fillRect(0, 0, S, S);
    // irregular stones, rows of varying height
    let y = 0;
    while (y < S) {
      const rh = S * (0.05 + rnd() * 0.05);
      let x = -rnd() * 30;
      while (x < S) {
        const w = S * (0.06 + rnd() * 0.1);
        const v = 0.62 + rnd() * 0.3;
        const warm = rnd() < 0.4;
        ctx.fillStyle = `rgb(${Math.floor((warm ? 150 : 128) * v)},${Math.floor((warm ? 128 : 120) * v)},${Math.floor((warm ? 100 : 108) * v)})`;
        ctx.beginPath();
        const pad = 2 + rnd() * 3;
        const x0 = x + pad, y0 = y + pad, x1 = x + w - pad, y1 = y + rh - pad;
        ctx.moveTo(x0 + rnd() * 6, y0);
        ctx.lineTo(x1 - rnd() * 6, y0 + rnd() * 4);
        ctx.lineTo(x1, y1 - rnd() * 6);
        ctx.lineTo(x0 + rnd() * 8, y1);
        ctx.closePath();
        ctx.fill();
        x += w;
      }
      y += rh;
    }
    speckle(ctx, S, rnd, S * S * 0.05, ['#6d665c', '#e3d8c2', '#8f8373', '#50493f'], 0.6, 1.8, 0.5);
    grain(ctx, S, seed, 0.14, 5, 4);
    // wash / weathering streaks
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 18; i++) { ctx.fillStyle = rnd() < 0.5 ? '#3a3228' : '#f0e8d8'; ctx.fillRect(rnd() * S, rnd() * S * 0.4, 4 + rnd() * 10, S * (0.2 + rnd() * 0.5)); }
    ctx.globalAlpha = 1;
  } else if (kind === 'sillar') {
    ctx.fillStyle = '#9e9280';
    ctx.fillRect(0, 0, S, S);
    const rows = 6, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -S / 6 : 0;
      while (x < S) {
        const w = S * (0.22 + rnd() * 0.16);
        const v = 0.84 + rnd() * 0.2;
        ctx.fillStyle = `rgb(${Math.floor(190 * v)},${Math.floor(180 * v)},${Math.floor(160 * v)})`;
        ctx.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 2, r * rh + 2, w - 4, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + 2, r * rh + rh - 6, w - 4, 4);
        x += w;
      }
    }
    speckle(ctx, S, rnd, S * S * 0.12, ['#5f594f', '#e7e0d0', '#7e7668', '#b4ab9a', '#3d3a35'], 0.5, 1.5, 0.55);
    grain(ctx, S, seed, 0.1, 5, 4);
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 10; i++) { ctx.fillStyle = '#4a4538'; ctx.fillRect(rnd() * S, 0, 3 + rnd() * 8, S * rnd()); }
    ctx.globalAlpha = 1;
  } else if (kind === 'reloj') {
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = S * 0.03; ctx.strokeStyle = '#1d1d1d'; ctx.stroke();
    ctx.fillStyle = '#1d1d1d';
    ctx.font = `bold ${Math.floor(S * 0.1)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(R[i], S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36);
    }
  } else if (kind === 'escudo') {
    // Guareña coat of arms (simplified): per pale, lion & column | cross between crescents; closed crown
    ctx.clearRect(0, 0, S, S);
    const w = S * 0.6, h = S * 0.66, x0 = (S - w) / 2, y0 = S * 0.26;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0 + w, y0 + h * 0.62);
    ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w / 2, y0 + h); ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h * 0.62); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#1f4aa8'; ctx.fillRect(x0, y0, w / 2, h);
    ctx.fillStyle = '#c21f2a'; ctx.fillRect(x0 + w / 2, y0, w / 2, h);
    ctx.fillStyle = '#e8b62c';
    ctx.fillRect(x0 + w * 0.3, y0 + h * 0.15, w * 0.07, h * 0.7); // column
    ctx.beginPath(); ctx.ellipse(x0 + w * 0.2, y0 + h * 0.45, w * 0.09, h * 0.18, 0.3, 0, Math.PI * 2); ctx.fill(); // lion (stylised)
    ctx.fillRect(x0 + w * 0.715, y0 + h * 0.25, w * 0.07, h * 0.4);
    ctx.fillRect(x0 + w * 0.64, y0 + h * 0.38, w * 0.22, h * 0.07); // cross
    for (const cx of [0.6, 0.9]) { ctx.beginPath(); ctx.arc(x0 + w * cx, y0 + h * 0.62, w * 0.05, 0.3, Math.PI - 0.3); ctx.lineWidth = w * 0.025; ctx.strokeStyle = '#e8b62c'; ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = S * 0.015; ctx.strokeStyle = '#6a5520';
    ctx.stroke();
    // crown
    ctx.fillStyle = '#e8b62c';
    ctx.fillRect(x0 + w * 0.15, y0 - S * 0.08, w * 0.7, S * 0.07);
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x0 + w * (0.18 + i * 0.16), y0 - S * 0.1, S * 0.028, 0, Math.PI * 2); ctx.fill(); }
  }
  return c;
}
