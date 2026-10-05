// The trees and plants of Guareña, grown at start-up: a branching skeleton per species (trunk, limbs, twigs, with its
// own bark) carrying cards painted with that species' leaves — olive, holm oak, plane, bitter orange, mulberry, stone
// pine, eucalyptus, poplar, fig, cypress, palms, peach, oleander, vine… Leaves and bark are painted on canvases here
// (nothing to download). Each species comes in a few variants, each in three levels of detail: the whole tree, a
// lighter one with fewer and larger cards, and far off a billboard (its picture and normals baked at start-up).
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { STYLE } from './style.js';
import { shared } from './materials.js';

// ------------------------------------------------------------ leaf atlas: 8 x 6 tiles of 256 px
const LT = 256, LC = 8, LR = 6;
const TILE_NAMES = [
  'olivo_a', 'olivo_b', 'encina_a', 'encina_b', 'platano_a', 'platano_b', 'naranjo_a', 'naranjo_fruta',
  'morera_a', 'morera_b', 'pino_a', 'pino_b', 'eucalipto_a', 'chopo_a', 'higuera_a', 'cipres_a',
  'palma_hoja', 'abanico', 'adelfa_rosa', 'adelfa_blanca', 'frutal_a', 'limon_fruta', 'vid_a', 'seto_a',
  'geranio_hoja', 'geranio_rojo', 'geranio_rosa', 'gitanilla', 'cinta', 'hierba', 'hierba_seca', 'flores',
  'jaramago', 'amapola', 'margarita', 'malva', 'roseta', 'cardo', 'retama', 'avena',
  'copa', 'copa_b',
];
export const TILE = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i]));
export function tileRect(i) { const c = i % LC, r = Math.floor(i / LC); return [c / LC, 1 - (r + 1) / LR, 1 / LC, 1 / LR]; } // u0, v0, du, dv (v up)

// the colour pass and the alpha pass paint the same shapes from the same random sequence; whatever only the colour
// pass needs (shade, which of the colours) comes from its own sequence, CR, so the two never drift apart
let CR = mulberry32(1);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c, k = 1) => `rgb(${Math.round(clamp(c[0] * k, 0, 255))},${Math.round(clamp(c[1] * k, 0, 255))},${Math.round(clamp(c[2] * k, 0, 255))})`;
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// one leaf along −y from the origin (length L, half width W), in the canvas's current transform
function leafPath(ctx, shape, L, W) {
  ctx.beginPath();
  if (shape === 'lance') {
    ctx.moveTo(0, 0); ctx.quadraticCurveTo(W, -L * 0.42, 0, -L); ctx.quadraticCurveTo(-W, -L * 0.42, 0, 0);
  } else if (shape === 'oval') {
    ctx.moveTo(0, 0); ctx.bezierCurveTo(W * 1.15, -L * 0.12, W * 1.05, -L * 0.82, 0, -L); ctx.bezierCurveTo(-W * 1.05, -L * 0.82, -W * 1.15, -L * 0.12, 0, 0);
  } else if (shape === 'heart') {
    ctx.moveTo(0, 0); ctx.bezierCurveTo(W * 1.5, L * 0.08, W * 1.15, -L * 0.72, 0, -L); ctx.bezierCurveTo(-W * 1.15, -L * 0.72, -W * 1.5, L * 0.08, 0, 0);
  } else if (shape === 'tooth') { // dandelion, wild rocket, thistle: long, cut into lobes that point back to the base
    const N = 5, side = (sg) => {
      for (let i = 1; i <= N; i++) {
        const t = i / (N + 0.6), w = W * Math.pow(Math.sin(Math.PI * Math.min(0.95, t * 0.95 + 0.04)), 0.6);
        ctx.lineTo(sg * w * 0.32, -L * (t - 0.5 / N)); ctx.lineTo(sg * w, -L * (t - 0.12 / N)); ctx.lineTo(sg * w * 0.55, -L * t);
      }
    };
    ctx.moveTo(0, 0); side(1); ctx.lineTo(0, -L);
    for (let i = N; i >= 1; i--) { // back down the other side
      const t = i / (N + 0.6), w = W * Math.pow(Math.sin(Math.PI * Math.min(0.95, t * 0.95 + 0.04)), 0.6);
      ctx.lineTo(-w * 0.55, -L * t); ctx.lineTo(-w, -L * (t - 0.12 / N)); ctx.lineTo(-w * 0.32, -L * (t - 0.5 / N));
    }
    ctx.closePath();
  } else if (shape === 'tri') { // poplar: a rounded triangle on its stalk
    ctx.moveTo(0, 0); ctx.bezierCurveTo(W * 1.6, -L * 0.1, W * 0.6, -L * 0.7, 0, -L); ctx.bezierCurveTo(-W * 0.6, -L * 0.7, -W * 1.6, -L * 0.1, 0, 0);
  } else { // palmate / round, as a polar outline round the leaf's centre
    const lobes = shape === 'palm5' ? 5 : shape === 'palm3' ? 3 : shape === 'fig' ? 5 : 0, cy = -L * 0.5, R = L * 0.5;
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI * 0.92 + (i / N) * Math.PI * 1.84; // from the stalk round the leaf and back
      let r = R;
      if (lobes) { const lb = Math.abs(Math.cos((th * lobes) / 2)); r = R * (shape === 'fig' ? 0.42 + 0.58 * Math.pow(lb, 0.35) : 0.6 + 0.4 * Math.pow(lb, 0.5)); }
      else r = R * (0.9 + 0.1 * Math.abs(Math.cos(th * 7))); // round, scalloped (geranium)
      const x = Math.sin(th) * r * (W / R), y = cy - Math.cos(th) * r;
      if (i === 0) ctx.moveTo(0, 0);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}
// a leaf in colour (gradient base → tip, a paler midrib) or as plain white (alpha pass)
function leaf(ctx, alpha, shape, x, y, ang, L, W, col, rnd, { vein = 0.35, under = null } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  leafPath(ctx, shape, L, W);
  if (alpha) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore(); return; }
  const k = 0.82 + CR() * 0.36;
  const c = under && CR() < 0.3 ? under : col;
  const g = ctx.createLinearGradient(0, 0, W * 0.6, -L);
  g.addColorStop(0, rgb(c, k * 0.78)); g.addColorStop(0.55, rgb(c, k)); g.addColorStop(1, rgb(c, k * 1.12));
  ctx.fillStyle = g; ctx.fill();
  if (vein > 0 && L > 10) { ctx.strokeStyle = rgb(mix3(c, [230, 235, 190], 0.45), k); ctx.globalAlpha = vein; ctx.lineWidth = Math.max(0.6, L / 60); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * 0.88); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.restore();
}
function twig(ctx, alpha, pts, w, col) {
  ctx.strokeStyle = alpha ? '#fff' : rgb(col); ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
}
// a spray: a twig up the tile with leaves along it on both sides (olive, oleander, peach, eucalyptus…)
function spray(ctx, alpha, rnd, o) {
  const S = LT, n = o.twigs || 5;
  for (let t = 0; t < n; t++) {
    const bx = S * 0.5 + (rnd() - 0.5) * S * 0.25, by = S * 0.98;
    const ang = (t / (n - 1 || 1) - 0.5) * (o.fan || 1.3) + (rnd() - 0.5) * 0.25; // fanned out from the base
    const len = S * (o.reach || 0.85) * (0.75 + rnd() * 0.25);
    const ex = bx + Math.sin(ang) * len, ey = by - Math.cos(ang) * len;
    const mx = (bx + ex) / 2 + (rnd() - 0.5) * 18, my = (by + ey) / 2;
    twig(ctx, alpha, [[bx, by], [mx, my], [ex, ey]], o.tw || 1.6, o.twigCol || [95, 80, 60]);
    const m = o.per || 9;
    for (let i = 0; i < m; i++) {
      const u = 0.15 + (i / m) * 0.85, px = bx + (ex - bx) * u + (mx - (bx + ex) / 2) * 4 * u * (1 - u), py = by + (ey - by) * u;
      for (const side of [-1, 1]) {
        if (rnd() < (o.skip || 0.1)) continue;
        const a = ang + side * (o.spread || 0.7) * (0.7 + rnd() * 0.5) + (o.droop || 0) * (rnd() * 0.6);
        leaf(ctx, alpha, o.shape, px, py, a, o.L * (0.75 + rnd() * 0.45) * (1 - u * (o.taper || 0.25)), o.W * (0.8 + rnd() * 0.4), o.col, rnd, { under: o.under, vein: o.vein ?? 0.35 });
      }
    }
    if (o.tip) leaf(ctx, alpha, o.shape, ex, ey, ang, o.L * 0.9, o.W, o.col, rnd, { under: o.under });
  }
}
// leaves scattered all over the tile (dense crowns: holm oak, orange, privet, cypress sprays)
function scatter(ctx, alpha, rnd, o) {
  const S = LT, n = o.n || 80;
  // a few twigs underneath
  for (let t = 0; t < (o.twigs ?? 4); t++) { const a = (rnd() - 0.5) * 1.6; twig(ctx, alpha, [[S * 0.5, S], [S * 0.5 + Math.sin(a) * S * 0.45, S - Math.cos(a) * S * 0.7]], 1.8, o.twigCol || [80, 65, 50]); }
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rnd()) * Math.max(S * 0.12, S * 0.47 - o.L * 0.5), th = rnd() * Math.PI * 2; // (whole leaves: none cut by the tile's edge)
    const x = S * 0.5 + Math.cos(th) * r, y = S * 0.52 + Math.sin(th) * r * (o.squash || 1);
    const shade = 0.72 + 0.28 * (i / n); // later leaves (in front) lighter
    const c = o.cols ? o.cols[Math.floor(rnd() * o.cols.length)] : o.col;
    leaf(ctx, alpha, o.shape, x, y, rnd() * Math.PI * 2, o.L * (0.75 + rnd() * 0.5), o.W * (0.8 + rnd() * 0.4), c.map((v) => v * shade), rnd, { under: o.under, vein: o.vein ?? 0.3 });
  }
}
// bunches of needles (stone pine)
function needles(ctx, alpha, rnd, o) {
  const S = LT;
  for (let b = 0; b < (o.bunches || 9); b++) {
    const cx = S * (0.2 + rnd() * 0.6), cy = S * (0.25 + rnd() * 0.6), L = S * (0.18 + rnd() * 0.12);
    twig(ctx, alpha, [[S * 0.5, S], [cx, cy]], 2.2, [100, 70, 45]);
    for (let i = 0; i < (o.n || 34); i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6, l = L * (0.6 + rnd() * 0.5);
      ctx.strokeStyle = alpha ? '#fff' : rgb(o.col, 0.75 + CR() * 0.45); ctx.lineWidth = alpha ? 1.4 : 1.1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); ctx.stroke();
    }
  }
}
// round fruit (oranges, lemons) or flower heads on top of a tile
function balls(ctx, alpha, rnd, n, col, r0) {
  for (let i = 0; i < n; i++) {
    const x = LT * (0.2 + rnd() * 0.6), y = LT * (0.2 + rnd() * 0.6), r = r0 * (0.85 + rnd() * 0.3);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (alpha) { ctx.fillStyle = '#fff'; ctx.fill(); continue; }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, rgb(col, 1.25)); g.addColorStop(0.6, rgb(col)); g.addColorStop(1, rgb(col, 0.62));
    ctx.fillStyle = g; ctx.fill();
  }
}
function umbels(ctx, alpha, rnd, n, col, r0) { // geranium / oleander flower heads: a ball of little five-petal flowers
  for (let i = 0; i < n; i++) {
    const cx = LT * (0.2 + rnd() * 0.6), cy = LT * (0.15 + rnd() * 0.5), R = r0 * (0.8 + rnd() * 0.4);
    for (let f = 0; f < 14; f++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
      for (let p = 0; p < 5; p++) {
        ctx.beginPath(); ctx.ellipse(x + Math.cos((p / 5) * 6.283) * R * 0.18, y + Math.sin((p / 5) * 6.283) * R * 0.18, R * 0.17, R * 0.12, (p / 5) * 6.283, 0, Math.PI * 2);
        ctx.fillStyle = alpha ? '#fff' : rgb(col, 0.8 + CR() * 0.35); ctx.fill();
      }
    }
  }
}
function blades(ctx, alpha, rnd, n, cols, hMin, hMax, w = 3) {
  for (let i = 0; i < n; i++) {
    const x = LT * (0.08 + rnd() * 0.84), h = LT * (hMin + rnd() * (hMax - hMin)), bend = (rnd() - 0.5) * LT * 0.35;
    ctx.beginPath(); ctx.moveTo(x - w, LT); ctx.quadraticCurveTo(x + bend * 0.3, LT - h * 0.5, x + bend, LT - h); ctx.quadraticCurveTo(x + bend * 0.3 + w * 0.3, LT - h * 0.5, x + w, LT); ctx.closePath();
    ctx.fillStyle = alpha ? '#fff' : rgb(cols[Math.floor(CR() * cols.length)], 0.8 + CR() * 0.35); ctx.fill();
  }
}
// wild plants: thin stems curving up from the bottom of the tile (returns the tips) and their flowers
function stems(ctx, alpha, rnd, n, col, hMin, hMax, w, spread = 0.5) {
  const tips = [];
  for (let i = 0; i < n; i++) {
    const x = LT * (0.5 + (rnd() - 0.5) * spread), h = LT * (hMin + rnd() * (hMax - hMin)), bend = (rnd() - 0.5) * LT * 0.4;
    const ex = x + bend, ey = LT - h;
    ctx.strokeStyle = alpha ? '#fff' : rgb(col, 0.8 + CR() * 0.35); ctx.lineWidth = w * (0.8 + rnd() * 0.4); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, LT); ctx.quadraticCurveTo(x + bend * 0.15, LT - h * 0.6, ex, ey); ctx.stroke();
    tips.push([ex, ey, bend / Math.max(1, h)]);
  }
  return tips;
}
function bloom(ctx, alpha, rnd, kind, x, y, R, col) {
  const fill = (c, k = 1) => { ctx.fillStyle = alpha ? '#fff' : rgb(c, k); ctx.fill(); };
  ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.5);
  if (kind === 'cup') { // poppy, seen from the side: a bowl of four crinkled petals round a dark eye
    for (let p = 0; p < 4; p++) {
      const a = -Math.PI / 2 + (p - 1.5) * 0.62;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.3 - R * 0.1, R * 0.6, R * 0.45, a + Math.PI / 2, 0, Math.PI * 2); fill(col, 0.84 + p * 0.07 + CR() * 0.1);
    }
    if (!alpha) { ctx.beginPath(); ctx.ellipse(0, -R * 0.42, R * 0.24, R * 0.12, 0, 0, Math.PI * 2); fill([40, 25, 30]); }
  } else if (kind === 'daisy') { // white rays round a yellow disc, tilted towards us
    const sq = 0.45 + rnd() * 0.35;
    for (let p = 0; p < 14; p++) {
      const a = (p / 14) * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55 * sq, R * 0.42, R * 0.12, a, 0, Math.PI * 2); fill(col, 0.85 + CR() * 0.2);
    }
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.3, R * 0.3 * sq + R * 0.06, 0, 0, Math.PI * 2); fill([230, 185, 40]);
  } else if (kind === 'cross') { // the little four-petal flowers of the crucifers (wild mustard, rocket)
    for (let p = 0; p < 4; p++) { const a = (p / 4) * Math.PI * 2 + 0.4; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.55, 0, Math.PI * 2); fill(col, 0.85 + CR() * 0.25); }
  } else if (kind === 'star') { // mallow: five notched petals with darker veins
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5 * 0.8, R * 0.52, R * 0.36, a, 0, Math.PI * 2); fill(col, 0.85 + CR() * 0.2);
      if (!alpha) { ctx.strokeStyle = rgb(col, 0.55); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.68); ctx.stroke(); }
    }
    ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); fill([235, 225, 235]);
  } else if (kind === 'brush') { // thistle: a spiny green bulb with a tuft of purple florets on top
    ctx.beginPath(); ctx.ellipse(0, R * 0.25, R * 0.42, R * 0.5, 0, 0, Math.PI * 2); fill([95, 115, 70]);
    ctx.lineWidth = alpha ? 1.6 : 1.2;
    for (let p = 0; p < 26; p++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, l = R * (0.55 + rnd() * 0.45);
      ctx.strokeStyle = alpha ? '#fff' : rgb(col, 0.75 + CR() * 0.45); ctx.beginPath(); ctx.moveTo(0, -R * 0.1); ctx.lineTo(Math.cos(a) * l, -R * 0.1 + Math.sin(a) * l); ctx.stroke();
    }
    for (let p = 0; p < 8; p++) { const a = Math.PI * 0.1 + (p / 7) * Math.PI * 0.8; ctx.strokeStyle = alpha ? '#fff' : rgb([150, 160, 110]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.35, R * 0.25 + Math.sin(a) * R * 0.4); ctx.lineTo(Math.cos(a) * R * 0.75, R * 0.25 + Math.sin(a) * R * 0.75); ctx.stroke(); }
  } else { // 'pea': the yellow flowers along a broom's stems
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.55, R * 0.4, rnd() * 3, 0, Math.PI * 2); fill(col, 0.85 + CR() * 0.25);
  }
  ctx.restore();
}
// the leaves at the foot of a wild plant: a fan of them from the bottom middle
function basal(ctx, alpha, rnd, n, shape, L, W, col, spread = 1.3) {
  for (let i = 0; i < n; i++) leaf(ctx, alpha, shape, LT * (0.5 + (rnd() - 0.5) * 0.2), LT * 0.99, (rnd() - 0.5) * 2 * spread, L * (0.75 + rnd() * 0.45), W * (0.8 + rnd() * 0.4), col, rnd, { vein: 0.3 });
}
function frond(ctx, alpha, rnd, col) { // a pinnate palm frond, rachis up the middle, leaflets angled out
  const S = LT;
  twig(ctx, alpha, [[S * 0.5, S], [S * 0.5, S * 0.02]], 5, [160, 140, 70]);
  for (let i = 0; i < 64; i++) {
    const u = i / 64, y = S * (0.98 - u * 0.95), L = S * 0.46 * Math.sin(Math.PI * (0.12 + u * 0.85)) * (0.85 + rnd() * 0.3);
    for (const side of [-1, 1]) {
      const a = side * (0.95 + rnd() * 0.25);
      leaf(ctx, alpha, 'lance', S * 0.5, y, a, L, 3.2, col, rnd, { vein: 0.25 });
    }
  }
}
function fan(ctx, alpha, rnd, col) { // a fan palm leaf: pleated segments radiating from the stalk
  const S = LT, cx = S * 0.5, cy = S * 0.92;
  twig(ctx, alpha, [[cx, S], [cx, cy]], 5, [150, 120, 70]);
  for (let i = 0; i < 44; i++) {
    const a = -Math.PI / 2 + (i / 43 - 0.5) * 2.7, L = S * (0.62 + rnd() * 0.08);
    leaf(ctx, alpha, 'lance', cx, cy, a + Math.PI / 2, L, 5, col.map((v, k) => v * (i % 2 ? 0.9 : 1.05)), rnd, { vein: 0 });
  }
}
// the recipes, one per tile
const LEAF_RECIPES = {
  olivo_a: (c, a, r) => spray(c, a, r, { shape: 'lance', L: 34, W: 5.2, col: hex('#5c6a48'), under: hex('#a2ab93'), twigs: 9, per: 13, spread: 0.62, fan: 2.2, reach: 0.78, twigCol: [110, 105, 90], skip: 0.05 }),
  olivo_b: (c, a, r) => spray(c, a, r, { shape: 'lance', L: 31, W: 4.8, col: hex('#65714d'), under: hex('#adb59f'), twigs: 10, per: 12, spread: 0.66, fan: 2.4, reach: 0.74, twigCol: [110, 105, 90], skip: 0.05 }),
  encina_a: (c, a, r) => scatter(c, a, r, { shape: 'oval', L: 20, W: 7, col: hex('#3e5230'), under: hex('#7f8a6c'), n: 150 }),
  encina_b: (c, a, r) => scatter(c, a, r, { shape: 'oval', L: 18, W: 6.5, col: hex('#46593a'), under: hex('#8a927a'), n: 140 }),
  platano_a: (c, a, r) => scatter(c, a, r, { shape: 'palm5', L: 92, W: 50, cols: [hex('#6f9a3e'), hex('#7ea847'), hex('#5f8c36')], n: 9, twigs: 3, vein: 0.4 }),
  platano_b: (c, a, r) => scatter(c, a, r, { shape: 'palm5', L: 80, W: 44, cols: [hex('#79a445'), hex('#678f3a')], n: 11, twigs: 3, vein: 0.4 }),
  naranjo_a: (c, a, r) => scatter(c, a, r, { shape: 'oval', L: 34, W: 12, cols: [hex('#2f5a28'), hex('#3a6a30'), hex('#2a5024')], n: 85 }),
  naranjo_fruta: (c, a, r) => { scatter(c, a, r, { shape: 'oval', L: 34, W: 12, cols: [hex('#2f5a28'), hex('#3a6a30')], n: 70 }); balls(c, a, r, 4, hex('#f08a16'), 15); },
  morera_a: (c, a, r) => scatter(c, a, r, { shape: 'heart', L: 56, W: 22, cols: [hex('#6d9c3a'), hex('#7caa44'), hex('#5e8e33')], n: 26, twigs: 4 }),
  morera_b: (c, a, r) => scatter(c, a, r, { shape: 'heart', L: 50, W: 20, cols: [hex('#76a340'), hex('#658f37')], n: 30, twigs: 4 }),
  pino_a: (c, a, r) => needles(c, a, r, { col: hex('#3f5f2e'), bunches: 10, n: 36 }),
  pino_b: (c, a, r) => needles(c, a, r, { col: hex('#4a6a34'), bunches: 9, n: 34 }),
  eucalipto_a: (c, a, r) => spray(c, a, r, { shape: 'lance', L: 64, W: 6, col: hex('#7a8c70'), under: hex('#94a08a'), twigs: 5, per: 6, spread: 0.35, droop: 1.2, fan: 1.2, taper: 0.1 }),
  chopo_a: (c, a, r) => spray(c, a, r, { shape: 'tri', L: 38, W: 16, col: hex('#6f9c42'), under: hex('#b9c7a4'), twigs: 5, per: 6, spread: 0.9, fan: 1.2 }),
  higuera_a: (c, a, r) => scatter(c, a, r, { shape: 'fig', L: 110, W: 56, cols: [hex('#5f8c38'), hex('#6a9a3e')], n: 6, twigs: 3, vein: 0.45 }),
  cipres_a: (c, a, r) => scatter(c, a, r, { shape: 'lance', L: 26, W: 5, cols: [hex('#2d4628'), hex('#355430'), hex('#28402a')], n: 260, twigs: 2, vein: 0 }),
  palma_hoja: (c, a, r) => frond(c, a, r, hex('#56823a')),
  abanico: (c, a, r) => fan(c, a, r, hex('#5d8a44')),
  adelfa_rosa: (c, a, r) => { spray(c, a, r, { shape: 'lance', L: 56, W: 6.5, col: hex('#44643a'), twigs: 5, per: 6, spread: 0.6 }); umbels(c, a, r, 4, hex('#e2709a'), 30); },
  adelfa_blanca: (c, a, r) => { spray(c, a, r, { shape: 'lance', L: 56, W: 6.5, col: hex('#44643a'), twigs: 5, per: 6, spread: 0.6 }); umbels(c, a, r, 4, hex('#f4f0e8'), 30); },
  frutal_a: (c, a, r) => spray(c, a, r, { shape: 'lance', L: 50, W: 8, col: hex('#5f8a3a'), twigs: 6, per: 7, spread: 0.55, droop: 0.4, fan: 1.6 }),
  limon_fruta: (c, a, r) => { scatter(c, a, r, { shape: 'oval', L: 36, W: 12, cols: [hex('#3a6a2e'), hex('#44753a')], n: 65 }); balls(c, a, r, 4, hex('#e8d33c'), 13); },
  vid_a: (c, a, r) => scatter(c, a, r, { shape: 'palm5', L: 60, W: 34, cols: [hex('#5f8a36'), hex('#6c9840'), hex('#557e30')], n: 14, twigs: 3 }),
  seto_a: (c, a, r) => scatter(c, a, r, { shape: 'oval', L: 16, W: 6, cols: [hex('#3c5e2e'), hex('#46683a'), hex('#35552a')], n: 220, twigs: 0 }),
  geranio_hoja: (c, a, r) => scatter(c, a, r, { shape: 'round', L: 60, W: 32, cols: [hex('#4f7d34'), hex('#5a8a3a'), hex('#46702e')], n: 18, twigs: 3, vein: 0.2 }),
  geranio_rojo: (c, a, r) => umbels(c, a, r, 5, hex('#d8262a'), 36),
  geranio_rosa: (c, a, r) => umbels(c, a, r, 5, hex('#e8609a'), 36),
  gitanilla: (c, a, r) => { spray(c, a, r, { shape: 'palm5', L: 26, W: 14, col: hex('#4f8034'), twigs: 6, per: 6, spread: 0.9, droop: 1.5, fan: 2.6, reach: 0.95 }); umbels(c, a, r, 6, hex('#e0529a'), 18); },
  cinta: (c, a, r) => blades(c, a, r, 34, [hex('#6a9a4a'), hex('#8ab86a'), hex('#e8f0d0')], 0.45, 0.95, 5), // spider plant: long pale-striped leaves
  hierba: (c, a, r) => blades(c, a, r, 90, [hex('#5f8a3a'), hex('#6f9a42'), hex('#4f7d33'), hex('#86a04a')], 0.35, 0.9, 2.2),
  hierba_seca: (c, a, r) => blades(c, a, r, 80, [hex('#c8b27a'), hex('#b89e62'), hex('#d8c48c'), hex('#a08a58')], 0.3, 0.85, 2),
  // the skin of the anime crowns' clumps: almost flat, a few scalloped marks of leaves a shade darker or lighter
  copa: (c, a, r) => { // leaf clusters drawn in: little dark scallops and flecks, a few pale ones
    c.fillStyle = a ? '#fff' : '#e8e8e8'; c.fillRect(0, 0, LT, LT); if (a) return;
    for (let i = 0; i < 46; i++) { const x = r() * LT, y = r() * LT; c.fillStyle = 'rgba(96,104,98,0.5)'; for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * 12, y + (r() - 0.5) * 7, 3 + r() * 3.5, 1.6 + r() * 1.6, r() * 3, 0, Math.PI * 2); c.fill(); } }
    for (let i = 0; i < 40; i++) { const x = r() * LT, y = r() * LT, R0 = 4 + r() * 6; c.strokeStyle = r() < 0.55 ? 'rgba(110,116,110,0.55)' : 'rgba(255,255,255,0.55)'; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, R0, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
  },
  copa_b: (c, a, r) => { c.fillStyle = a ? '#fff' : '#ececec'; c.fillRect(0, 0, LT, LT); if (!a) for (let i = 0; i < 40; i++) { const x = r() * LT, y = r() * LT; c.fillStyle = 'rgba(160,160,160,0.45)'; c.beginPath(); c.ellipse(x, y, 7 + r() * 8, 3 + r() * 3, r() * 3, 0, Math.PI * 2); c.fill(); } },
  // wild mustard (jaramago): branching stems, lobed leaves at the foot, sprays of little yellow flowers and pods
  jaramago: (c, a, r) => {
    basal(c, a, r, 7, 'tooth', 70, 16, hex('#557f36'), 1.2);
    for (const [x, y, b] of stems(c, a, r, 9, hex('#6a8a40'), 0.55, 0.97, 2, 0.35)) {
      for (let i = 0; i < 6; i++) { const t = 12 + i * 7; c.strokeStyle = a ? '#fff' : rgb(hex('#7a9448')); c.lineWidth = 1; c.beginPath(); c.moveTo(x - b * t, y + t); c.lineTo(x - b * t + (i % 2 ? 7 : -7), y + t - 9); c.stroke(); }
      for (let i = 0; i < 9; i++) bloom(c, a, r, 'cross', x + (r() - 0.5) * 14, y + (r() - 0.3) * 12, 3.2 + r() * 1.2, hex('#f0cf1c'));
    }
  },
  // poppies (amapolas): hairy stems through the grass, each with its red cup; a bud or two nodding
  amapola: (c, a, r) => {
    blades(c, a, r, 22, [hex('#5f8a3a'), hex('#6f9a42'), hex('#86a04a')], 0.18, 0.5, 2);
    basal(c, a, r, 3, 'tooth', 55, 12, hex('#5a8a38'), 1.1);
    const tips = stems(c, a, r, 7, hex('#6b8f45'), 0.5, 0.95, 1.3, 0.65);
    tips.forEach(([x, y], i) => {
      if (i % 4 === 3) { c.beginPath(); c.ellipse(x, y + 5, 4, 7, 0.5, 0, Math.PI * 2); c.fillStyle = a ? '#fff' : rgb(hex('#6a8f40')); c.fill(); }
      else bloom(c, a, r, 'cup', x, y, 19 + r() * 7, hex('#ea2a1c'));
    });
  },
  // daisies and chamomile (margaritas, manzanilla): feathery leaves, white rays, yellow discs
  margarita: (c, a, r) => {
    blades(c, a, r, 30, [hex('#6f9a42'), hex('#86a04a'), hex('#5f8a3a')], 0.15, 0.45, 1.6);
    for (const [x, y] of stems(c, a, r, 14, hex('#6b9044'), 0.3, 0.8, 1.4, 0.8)) bloom(c, a, r, 'daisy', x, y, 8 + r() * 5, hex('#f6f4ec'));
  },
  // common mallow (malva): a mound of round scalloped leaves with pink-purple flowers among them
  malva: (c, a, r) => {
    for (let i = 0; i < 26; i++) {
      const x = LT * (0.5 + (r() - 0.5) * 0.7), y = LT * (0.45 + r() * 0.52), sz = 34 + r() * 22;
      twig(c, a, [[LT * 0.5, LT], [x, y + sz * 0.3]], 1.5, [110, 130, 70]);
      leaf(c, a, 'round', x, y + sz * 0.4, (r() - 0.5) * 1.6, sz, sz * 0.55, [hex('#557f36'), hex('#5f8a3a'), hex('#4c7430')][i % 3].map((v) => v * (0.8 + i / 100)), r, { vein: 0.25 });
    }
    for (let i = 0; i < 9; i++) bloom(c, a, r, 'star', LT * (0.5 + (r() - 0.5) * 0.7), LT * (0.35 + r() * 0.45), 11 + r() * 5, hex('#b25aa6'));
  },
  // a rosette seen from above (dandelion, plantain): deeply lobed leaves flat on the ground round a centre
  roseta: (c, a, r) => {
    const n = 13;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + r() * 0.4, L = LT * (0.3 + r() * 0.16);
      leaf(c, a, i % 3 ? 'tooth' : 'lance', LT / 2, LT / 2, ang, L, 17 + r() * 8, [hex('#4f7d32'), hex('#5a8a38'), hex('#46712c')][i % 3].map((v) => v * (0.8 + (i / n) * 0.35)), r, { vein: 0.4 });
    }
    if (r() < 0.7) bloom(c, a, r, 'daisy', LT / 2, LT / 2, 20, hex('#f2c81e'));
  },
  // thistle (cardo): stiff grey-green spiny leaves up the stems, purple heads; the dry lots of summer
  cardo: (c, a, r) => {
    basal(c, a, r, 6, 'tooth', 80, 22, hex('#7d9068'), 1.2);
    for (const [x, y, b] of stems(c, a, r, 5, hex('#8a9a70'), 0.55, 0.92, 3, 0.4)) {
      for (let i = 1; i < 4; i++) leaf(c, a, 'tooth', x - b * i * 40, y + i * 40, (i % 2 ? 1 : -1) * (0.9 + r() * 0.4), 34, 10, hex('#86987a'), r, { vein: 0.5 });
      bloom(c, a, r, 'brush', x, y, 14 + r() * 5, hex('#9a4fae'));
    }
  },
  // broom (retama): a fountain of thin green rods, a few yellow flowers along them
  retama: (c, a, r) => {
    for (let i = 0; i < 46; i++) {
      const bx = LT * (0.5 + (r() - 0.5) * 0.12), ang = (r() - 0.5) * 1.9, L = LT * (0.55 + r() * 0.42);
      const ex = bx + Math.sin(ang) * L, ey = LT - Math.cos(ang) * L * 0.95, mx = bx + Math.sin(ang) * L * 0.35, my = LT - L * 0.55;
      c.strokeStyle = a ? '#fff' : rgb([hex('#5e7d3a'), hex('#6f8a44'), hex('#557236')][i % 3], 0.8 + CR() * 0.35); c.lineWidth = a ? 2 : 1.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx, LT); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
      if (i % 3 === 0) for (let k = 0; k < 4; k++) { const t = 0.55 + r() * 0.45; bloom(c, a, r, 'pea', bx + (ex - bx) * t, LT + (ey - LT) * t, 5 + r() * 2, hex('#e8c21a')); }
    }
  },
  // wild oats and brome (avena loca): golden grass with drooping spikelets, what covers every verge by June
  avena: (c, a, r) => {
    blades(c, a, r, 60, [hex('#d6c07e'), hex('#c2a864'), hex('#e0cf94'), hex('#a88c56')], 0.25, 0.7, 2);
    for (const [x, y, b] of stems(c, a, r, 11, hex('#cdb57a'), 0.6, 0.97, 1.3, 0.7)) {
      for (let i = 0; i < 7; i++) {
        const t = i * 9, sx = x - b * t, sy = y + t, sg = i % 2 ? 1 : -1;
        c.strokeStyle = a ? '#fff' : rgb(hex('#c9b07a')); c.lineWidth = 0.9; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + sg * 8, sy + 4); c.stroke();
        leaf(c, a, 'lance', sx + sg * 8, sy + 4, Math.PI + sg * 0.3, 13 + r() * 5, 2.6, hex('#dcc88e'), r, { vein: 0 });
      }
    }
  },
  flores: (c, a, r) => { blades(c, a, r, 50, [hex('#6f9a42'), hex('#86a04a')], 0.3, 0.8, 2); balls(c, a, r, 7, hex('#d8302a'), 7); balls(c, a, r, 6, hex('#e8d23a'), 5); },
};
// the anime look: every painted leaf and petal in a few flat tones, with a dark rim just inside its edge
function animeFlatten(dc, da, W, H) {
  const lv = 5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let r = dc[i], g = dc[i + 1], b = dc[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (L > 1) { const t = (L / 255) * lv, q = ((Math.floor(t) + (t % 1 > 0.5 ? 1 : 0) * 0.85 + 0.075) / lv) * 255, m = 1 + (q / L - 1) * 0.8; r *= m; g *= m; b *= m; }
    const a = da[i];
    if (a > 110) { // (an edge: a transparent neighbour two pixels away)
      const xm = Math.max(0, x - 2), xp = Math.min(W - 1, x + 2), ym = Math.max(0, y - 2), yp = Math.min(H - 1, y + 2);
      if (da[(y * W + xm) * 4] < 110 || da[(y * W + xp) * 4] < 110 || da[(ym * W + x) * 4] < 110 || da[(yp * W + x) * 4] < 110) { r *= 0.5; g *= 0.52; b *= 0.58; }
    }
    dc[i] = Math.min(255, r); dc[i + 1] = Math.min(255, g); dc[i + 2] = Math.min(255, b);
  }
}
// the diorama look: the leaves towards the visual spec's olive and dark greens (dusty, a little warm); flowers keep theirs
function dioramaGreens(dc, W, H) {
  for (let i = 0; i < W * H * 4; i += 4) {
    const r = dc[i], g = dc[i + 1], b = dc[i + 2];
    const gr = Math.min(1, (g - Math.max(r, b)) / 30); // how green the pixel is
    if (gr <= 0) continue;
    const L = 0.299 * r + 0.587 * g + 0.114 * b, k = 0.7;
    dc[i] = r + ((L + (r - L) * k) * 1.06 - r) * gr;
    dc[i + 1] = g + ((L + (g - L) * k) * 0.97 - g) * gr;
    dc[i + 2] = b + ((L + (b - L) * k) * 0.8 - b) * gr;
  }
}
// claymation: the leaves and petals as pieces of plasticine — purer, a little lighter, never dusty
function clayColours(dc, W, H) {
  for (let i = 0; i < W * H * 4; i += 4) {
    const r = dc[i], g = dc[i + 1], b = dc[i + 2], L = 0.299 * r + 0.587 * g + 0.114 * b;
    dc[i] = Math.min(255, (L + (r - L) * 1.25) * 1.04); dc[i + 1] = Math.min(255, (L + (g - L) * 1.25) * 1.04); dc[i + 2] = Math.min(255, (L + (b - L) * 1.25) * 1.04);
  }
}
// the leaf atlas as a DataTexture: colour painted over the tile's own mean colour (so filtering never pulls in a dark
// halo), alpha painted separately
export function makeLeafAtlas() {
  const W = LT * LC, H = LT * LR;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cc = mk(), ca = mk(), xc = cc.getContext('2d'), xa = ca.getContext('2d');
  xa.fillStyle = '#000'; xa.fillRect(0, 0, W, H);
  TILE_NAMES.forEach((name, i) => {
    const x0 = (i % LC) * LT, y0 = Math.floor(i / LC) * LT, f = LEAF_RECIPES[name];
    if (!f) return;
    // the tile's background: its own leaves' colour, then the leaves on top
    xc.save(); xc.beginPath(); xc.rect(x0, y0, LT, LT); xc.clip(); xc.translate(x0, y0);
    xc.fillStyle = name.startsWith('hierba_seca') || name === 'avena' ? '#b8a06a' : name.startsWith('geranio_r') ? '#b03040' : name === 'palma_hoja' || name === 'abanico' ? '#5a8040' : '#4f6a3a';
    xc.fillRect(0, 0, LT, LT);
    CR = mulberry32(991 + i * 37); f(xc, false, mulberry32(77 + i * 131)); xc.restore();
    xa.save(); xa.beginPath(); xa.rect(x0, y0, LT, LT); xa.clip(); xa.translate(x0, y0);
    f(xa, true, mulberry32(77 + i * 131)); xa.restore();
  });
  const dc = xc.getImageData(0, 0, W, H).data, da = xa.getImageData(0, 0, W, H).data;
  if (STYLE.anime) animeFlatten(dc, da, W, H);
  else if (STYLE.plastilina) clayColours(dc, W, H);
  else if (STYLE.diorama) dioramaGreens(dc, W, H);
  const out = new Uint8Array(W * H * 4);
  // rows flipped: the DataTexture's first row is the bottom (v = 0)
  for (let y = 0; y < H; y++) {
    const sy = H - 1 - y;
    for (let x = 0; x < W; x++) {
      const s = (sy * W + x) * 4, d = (y * W + x) * 4;
      out[d] = dc[s]; out[d + 1] = dc[s + 1]; out[d + 2] = dc[s + 2]; out[d + 3] = da[s];
    }
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------ bark atlas: 8 tiles of 256 x 512 (u round the trunk,
// v up it; it repeats up the height)
const BW = 256, BH = 512;
const BARKS = ['olivo', 'platano', 'pino', 'eucalipto', 'comun', 'palma', 'chopo', 'cipres'];
export const BARK = Object.fromEntries(BARKS.map((n, i) => [n, i]));
function valueNoise(seed) {
  const R = mulberry32(seed), P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = R();
  return (x, y, px = 256, py = 256) => { // tiling with a period of px × py lattice cells
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = P[(y0 & 255) * 256 + (x0 & 255)], b = P[(y0 & 255) * 256 + (x1 & 255)], c = P[(y1 & 255) * 256 + (x0 & 255)], d = P[(y1 & 255) * 256 + (x1 & 255)];
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function makeBarkAtlas() {
  const W = BW * BARKS.length, H = BH, out = new Uint8Array(W * H * 4);
  const n1 = valueNoise(11), n2 = valueNoise(23), n3 = valueNoise(37);
  // noise that tiles both ways (u wraps round the trunk, v repeats up it): fu × fv lattice cells over the tile
  const tn = (n, u, v, fu, fv) => n(u * fu, v * fv, Math.round(fu), Math.round(fv));
  const fbm = (n, u, v, fu, fv, oct = 4) => { let s = 0, a = 0.5, k = 1; for (let o = 0; o < oct; o++) { s += a * tn(n, u, v, fu * k, fv * k); a *= 0.5; k *= 2; } return s; };
  const cells = (u, v, fu, fv, seed) => { // distance to the nearest and second jittered cell centre (plates, patches)
    const x = u * fu, y = v * fv, xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, wx = ((cx % fu) + fu) % fu, wy = ((cy % fv) + fv) % fv;
      const h = Math.sin(wx * 127.1 + wy * 311.7 + seed) * 43758.5453, rx = h - Math.floor(h), h2 = Math.sin(wx * 269.5 + wy * 183.3 + seed) * 43758.5453, ry = h2 - Math.floor(h2);
      const d = Math.hypot(cx + rx - x, cy + ry - y);
      if (d < d1) { d2 = d1; d1 = d; id = rx; } else if (d < d2) d2 = d;
    }
    return [d1, d2, id];
  };
  for (let t = 0; t < BARKS.length; t++) {
    const kind = BARKS[t];
    for (let y = 0; y < H; y++) for (let x = 0; x < BW; x++) {
      const u = x / BW, v = y / BH; // v: 0…1 up the tile (it repeats)
      let c;
      if (kind === 'olivo') { // grey, deeply fissured in a net, twisted, a little lichen
        const tw = u + v * 0.35 + fbm(n1, u, v, 8, 16, 3) * 0.08;
        const r = Math.abs(fbm(n2, tw, v, 16, 6, 4) - 0.5) * 2; // ridges
        const fis = Math.pow(clamp(1 - r * 3.2, 0, 1), 1.5);
        const base = mix3(hex('#8a857a'), hex('#6d695f'), fbm(n3, u, v, 8, 16, 3));
        c = mix3(base, hex('#2e2a24'), fis * 0.85);
        const lich = clamp((fbm(n1, u + 0.3, v, 32, 64, 3) - 0.62) * 6, 0, 1);
        c = mix3(c, hex('#a8a878'), lich * 0.5);
      } else if (kind === 'platano') { // camouflage: irregular flakes of cream, olive grey and pale brown
        const wu = u + (fbm(n3, u, v, 8, 8, 3) - 0.5) * 0.25, wv = v + (fbm(n1, u, v, 8, 8, 3) - 0.5) * 0.25;
        const p1 = fbm(n1, wu, wv, 8, 12, 4), p2 = fbm(n2, wu, wv, 6, 10, 4);
        c = hex('#8f8a6c');
        c = mix3(c, hex('#c9bf98'), sstep(0.5, 0.56, p1));
        c = mix3(c, hex('#e0dac0'), sstep(0.56, 0.62, p2) * 0.9);
        c = mix3(c, hex('#a9a07e'), sstep(0.6, 0.66, p1 * 0.6 + p2 * 0.5) * 0.7);
        c = mix3(c, scl(c, 0.8), clamp((fbm(n3, u, v, 32, 64, 3) - 0.45) * 2, 0, 1) * 0.4);
      } else if (kind === 'pino') { // plates of red-brown with dark fissures, stretched up the trunk
        const wu = u + (fbm(n1, u, v, 8, 8, 3) - 0.5) * 0.18, wv = v + (fbm(n2, u, v, 8, 8, 3) - 0.5) * 0.18;
        const [d1, d2, id] = cells(wu, wv, 6, 5, 7.3);
        const plate = clamp((d2 - d1) * (3.5 + fbm(n3, u, v, 16, 16, 2) * 3), 0, 1);
        const pc = mix3(hex('#94603e'), hex('#b67a4e'), id * 0.7 + fbm(n3, u, v, 32, 32, 3) * 0.5);
        c = mix3(hex('#2a1d16'), pc, Math.pow(plate, 0.55));
        c = mix3(c, hex('#5e4232'), clamp(fbm(n2, u, v, 32, 48, 3) - 0.35, 0, 1) * 0.6);
      } else if (kind === 'eucalipto') { // smooth pale bark with grey and pinkish patches, strips peeling
        const s = fbm(n1, u, v, 8, 3, 4), strip = clamp((Math.abs(fbm(n2, u, v, 16, 2, 3) - 0.5) - 0.18) * 8, 0, 1);
        c = mix3(hex('#d6cdb6'), hex('#b8a894'), s);
        c = mix3(c, hex('#9a8a78'), strip * 0.6);
        c = mix3(c, hex('#c8b0a0'), clamp((fbm(n3, u, v, 8, 8, 3) - 0.55) * 5, 0, 1) * 0.5);
      } else if (kind === 'comun') { // grey-brown, fine vertical fissures (holm oak, orange, mulberry, fig)
        const r = Math.abs(fbm(n2, u + fbm(n1, u, v, 8, 8, 2) * 0.05, v, 24, 3, 4) - 0.5) * 2;
        const fis = Math.pow(clamp(1 - r * 3.5, 0, 1), 1.3);
        const base = mix3(hex('#6a6056'), hex('#544a42'), fbm(n3, u, v, 8, 16, 3));
        c = mix3(base, hex('#241e1a'), fis * 0.8);
      } else if (kind === 'palma') { // the old leaf bases in a diamond lattice
        const a = u * 10 + v * 6, b = u * 10 - v * 6, fa = a - Math.floor(a), fb = b - Math.floor(b);
        const dm = Math.min(Math.min(fa, 1 - fa), Math.min(fb, 1 - fb));
        c = mix3(hex('#3a2e22'), mix3(hex('#8a7254'), hex('#a88c64'), fbm(n1, u, v, 16, 16, 3)), clamp(dm * 7, 0, 1));
      } else if (kind === 'chopo') { // whitish grey, dark diamond lenticels, dark fissures low on the trunk
        const lent = clamp((fbm(n1, u, v, 32, 32, 2) - 0.66) * 7, 0, 1);
        c = mix3(hex('#bdb8aa'), hex('#9a968a'), fbm(n2, u, v, 8, 16, 3));
        c = mix3(c, hex('#3a3830'), lent * 0.8);
      } else { // cypress: stringy fibres
        const f = fbm(n3, u, v, 64, 2, 4);
        c = mix3(hex('#5e4636'), hex('#8a6a50'), f);
      }
      const o = (y * W + t * BW + x) * 4;
      out[o] = clamp(c[0], 0, 255); out[o + 1] = clamp(c[1], 0, 255); out[o + 2] = clamp(c[2], 0, 255); out[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------ species
// H: height (m) · trunk: fraction of H to the first fork, base radius, stems from the ground, how they spread, lean,
// wobble · crown: centre (fraction of H) and radii (m) of the envelope the twigs grow out to · L1 limbs, L2 twigs:
// how many, where along the parent they start, angle from it, drift up / droop, wobble, share of the way to the
// envelope · leaves: tiles, card size (m), cards per metre of twig, droop, outward bias
export const SPECIES = {
  olivo: { bark: 'olivo', H: [3.4, 4.8], trunk: { h: [0.22, 0.34], r: [0.16, 0.26], stems: [1, 3], spread: 0.42, lean: 0.12, wobble: 0.3, flare: 1.45 },
    crown: { cy: 0.66, rx: [2.0, 2.7], ry: [1.25, 1.7] },
    L1: { n: [5, 7], from: 0.55, ang: [0.55, 1.05], up: 0.12, droop: 0.05, wobble: 0.3, fill: [0.75, 0.97], r: 0.6 },
    L2: { n: [5, 8], from: 0.2, ang: [0.5, 1.2], up: 0.05, droop: 0.2, wobble: 0.35, fill: [0.7, 1.0], r: 0.55 },
    leaves: { tiles: ['olivo_a', 'olivo_b'], size: [0.6, 0.85], density: 8.5, droop: 0.2, out: 1 } },
  encina: { bark: 'comun', barkTint: '#8a847c', H: [6.5, 9], trunk: { h: [0.22, 0.3], r: [0.24, 0.36], stems: [1, 1], lean: 0.08, wobble: 0.18, flare: 1.35 },
    crown: { cy: 0.62, rx: [3.6, 4.8], ry: [2.2, 2.9] },
    L1: { n: [5, 7], from: 0.8, ang: [0.75, 1.15], up: 0.1, droop: 0.04, wobble: 0.22, fill: [0.7, 0.9], r: 0.55 },
    L2: { n: [6, 9], from: 0.2, ang: [0.5, 1.1], up: 0.05, droop: 0.15, wobble: 0.3, fill: [0.6, 0.95], r: 0.5 },
    leaves: { tiles: ['encina_a', 'encina_b'], size: [0.75, 1.05], density: 5.6, droop: 0.1, out: 1 } },
  platano: { bark: 'platano', H: [10, 14], trunk: { h: [0.26, 0.34], r: [0.24, 0.34], stems: [1, 1], lean: 0.04, wobble: 0.06, flare: 1.2 },
    crown: { cy: 0.64, rx: [3.8, 5.0], ry: [3.4, 4.4] },
    L1: { n: [4, 6], from: 0.85, ang: [0.45, 0.8], up: 0.12, droop: 0.02, wobble: 0.12, fill: [0.75, 0.95], r: 0.6 },
    L2: { n: [6, 9], from: 0.2, ang: [0.55, 1.1], up: 0.05, droop: 0.2, wobble: 0.22, fill: [0.55, 0.9], r: 0.5 },
    leaves: { tiles: ['platano_a', 'platano_b'], size: [1.0, 1.35], density: 3.0, droop: 0.2, out: 0.9 } },
  naranjo: { bark: 'comun', H: [3.0, 4.0], trunk: { h: [0.2, 0.28], r: [0.08, 0.12], stems: [1, 1], lean: 0.05, wobble: 0.12, flare: 1.2 },
    crown: { cy: 0.6, rx: [1.3, 1.65], ry: [1.2, 1.5] },
    L1: { n: [4, 5], from: 0.85, ang: [0.45, 0.85], up: 0.15, droop: 0.02, wobble: 0.2, fill: [0.7, 0.9], r: 0.6 },
    L2: { n: [6, 9], from: 0.15, ang: [0.5, 1.3], up: 0.05, droop: 0.1, wobble: 0.25, fill: [0.8, 1.02], r: 0.55 },
    leaves: { tiles: ['naranjo_a', 'naranjo_a', 'naranjo_fruta'], size: [0.52, 0.68], density: 13, droop: 0.05, out: 1.1 } },
  limonero: { base: 'naranjo', leaves: { tiles: ['naranjo_a', 'limon_fruta'], size: [0.52, 0.68], density: 12, droop: 0.05, out: 1.1 } },
  morera: { bark: 'comun', barkTint: '#9a9084', H: [5, 6.5], trunk: { h: [0.3, 0.38], r: [0.15, 0.22], stems: [1, 1], lean: 0.04, wobble: 0.1, flare: 1.25 },
    crown: { cy: 0.66, rx: [2.6, 3.2], ry: [1.8, 2.3] },
    L1: { n: [5, 7], from: 0.9, ang: [0.7, 1.05], up: 0.2, droop: 0, wobble: 0.15, fill: [0.3, 0.42], r: 0.72 }, // the pollard's knuckles
    L2: { n: [6, 9], from: 0.6, ang: [0.25, 0.75], up: 0.35, droop: 0.05, wobble: 0.15, fill: [0.75, 1.0], r: 0.35 },
    leaves: { tiles: ['morera_a', 'morera_b'], size: [0.75, 1.0], density: 5.0, droop: 0.15, out: 0.8 } },
  pino: { bark: 'pino', H: [10, 14], trunk: { h: [0.6, 0.7], r: [0.2, 0.3], stems: [1, 1], lean: 0.14, wobble: 0.08, flare: 1.15 },
    crown: { cy: 0.9, rx: [5.0, 6.4], ry: [0.95, 1.25] },
    L1: { n: [6, 8], from: 0.82, ang: [0.85, 1.2], up: 0.16, droop: 0.02, wobble: 0.12, fill: [0.85, 1.0], r: 0.55 },
    L2: { n: [8, 11], from: 0.4, ang: [0.8, 1.35], up: 0.14, droop: 0.02, wobble: 0.16, fill: [0.8, 1.02], r: 0.45 },
    leaves: { tiles: ['pino_a', 'pino_b'], size: [1.1, 1.45], density: 7.5, droop: -0.9, out: 0.35, from: 0.3 } },
  eucalipto: { bark: 'eucalipto', H: [15, 21], trunk: { h: [0.38, 0.48], r: [0.24, 0.34], stems: [1, 1], lean: 0.1, wobble: 0.1, flare: 1.2 },
    crown: { cy: 0.66, rx: [3.2, 4.4], ry: [5.0, 6.4] },
    L1: { n: [6, 8], from: 0.55, ang: [0.35, 0.75], up: 0.1, droop: 0.05, wobble: 0.25, fill: [0.8, 1.0], r: 0.55 },
    L2: { n: [6, 9], from: 0.25, ang: [0.6, 1.2], up: 0, droop: 0.35, wobble: 0.3, fill: [0.5, 0.9], r: 0.5 },
    leaves: { tiles: ['eucalipto_a'], size: [1.0, 1.4], density: 6.5, droop: 0.7, out: 0.6 } },
  chopo: { bark: 'chopo', H: [14, 18], trunk: { h: [0.12, 0.18], r: [0.18, 0.26], stems: [1, 1], lean: 0.03, wobble: 0.05, flare: 1.15, top: 0.95 },
    crown: { cy: 0.56, rx: [1.4, 1.9], ry: [6.5, 8] },
    L1: { n: [9, 13], from: 0.12, ang: [0.18, 0.35], up: 0.25, droop: 0, wobble: 0.1, fill: [0.75, 0.95], r: 0.4 },
    L2: { n: [3, 5], from: 0.3, ang: [0.3, 0.6], up: 0.2, droop: 0.05, wobble: 0.2, fill: [0.4, 0.7], r: 0.5 },
    leaves: { tiles: ['chopo_a'], size: [0.7, 0.95], density: 5.0, droop: 0.1, out: 0.7 } },
  higuera: { bark: 'chopo', barkTint: '#a8a49a', H: [3.5, 4.8], trunk: { h: [0.12, 0.2], r: [0.1, 0.16], stems: [2, 4], spread: 0.55, lean: 0.1, wobble: 0.25, flare: 1.3 },
    crown: { cy: 0.58, rx: [2.6, 3.4], ry: [1.6, 2.1] },
    L1: { n: [3, 4], from: 0.5, ang: [0.55, 0.95], up: 0.15, droop: 0.05, wobble: 0.2, fill: [0.7, 0.95], r: 0.6 },
    L2: { n: [4, 6], from: 0.2, ang: [0.4, 0.9], up: 0.2, droop: 0.05, wobble: 0.2, fill: [0.5, 0.9], r: 0.5 },
    leaves: { tiles: ['higuera_a'], size: [1.0, 1.3], density: 2.8, droop: 0.05, out: 0.9 } },
  frutal: { bark: 'comun', barkTint: '#8a7a70', H: [2.8, 3.6], trunk: { h: [0.18, 0.24], r: [0.07, 0.1], stems: [1, 1], lean: 0.05, wobble: 0.15, flare: 1.2 },
    crown: { cy: 0.66, rx: [1.6, 2.0], ry: [1.0, 1.3] },
    L1: { n: [3, 4], from: 0.9, ang: [0.6, 0.85], up: 0.2, droop: 0.02, wobble: 0.15, fill: [0.75, 0.95], r: 0.65 }, // an open vase
    L2: { n: [5, 7], from: 0.25, ang: [0.3, 0.8], up: 0.25, droop: 0.15, wobble: 0.25, fill: [0.5, 0.85], r: 0.5 },
    leaves: { tiles: ['frutal_a'], size: [0.55, 0.75], density: 5.5, droop: 0.2, out: 0.8 } },
  adelfa: { bark: 'comun', barkTint: '#7a8a6a', H: [1.9, 2.6], shrub: true, trunk: { h: [0.9, 1], r: [0.025, 0.035], stems: [6, 10], spread: 0.35, lean: 0.05, wobble: 0.12, flare: 1 },
    crown: { cy: 0.58, rx: [1.1, 1.4], ry: [1.0, 1.25] },
    leaves: { tiles: ['adelfa_rosa', 'adelfa_rosa', 'adelfa_blanca'], size: [0.55, 0.75], density: 7.5, droop: 0.1, out: 0.9, from: 0.3 } },
  cipres: { kind: 'column', bark: 'cipres', H: [9, 13], r: [0.9, 1.25], tiles: ['cipres_a'], size: [0.8, 1.1] },
  seto: { kind: 'box', size: [2, 0.8, 1.2], tiles: ['seto_a'], card: [0.45, 0.6] },
  palmera: { kind: 'palm', bark: 'palma', H: [5, 8.5], r: [0.36, 0.44], fronds: [34, 44], frondL: [3.6, 4.6], frondW: [0.9, 1.15] },
  washingtonia: { kind: 'fan', bark: 'palma', barkTint: '#b0a490', H: [11, 16], r: [0.18, 0.24], fronds: [26, 34], frondL: [1.3, 1.7] },
  vid: { kind: 'vine' },
  canas: { kind: 'reed', H: [2.4, 3.4] },
};
export const SPECIES_KEYS = Object.keys(SPECIES);
for (const k of SPECIES_KEYS) SPECIES[k].name = k;
function specOf(name) { const s = SPECIES[name]; return s.base ? { ...SPECIES[s.base], ...s } : s; }

// ------------------------------------------------------------ small vector helpers (plain arrays)
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function perp(d) { const t = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return nrm(cross(d, t)); }
function rotAxis(v, ax, a) { // Rodrigues
  const c = Math.cos(a), s = Math.sin(a), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
}
const R = (rnd, [a, b]) => a + (b - a) * rnd();
const RI = (rnd, [a, b]) => Math.round(a + (b - a) * rnd());
function ellT(P, D, C, Rr) { // distance along D from P to the crown ellipsoid
  const px = (P[0] - C[0]) / Rr[0], py = (P[1] - C[1]) / Rr[1], pz = (P[2] - C[2]) / Rr[2];
  const dx = D[0] / Rr[0], dy = D[1] / Rr[1], dz = D[2] / Rr[2];
  const a = dx * dx + dy * dy + dz * dz, b = 2 * (px * dx + py * dy + pz * dz), c = px * px + py * py + pz * pz - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-9) return 0.25;
  return Math.max(0.15, (-b + Math.sqrt(disc)) / (2 * a));
}
const ellD = (P, C, Rr) => Math.hypot((P[0] - C[0]) / Rr[0], (P[1] - C[1]) / Rr[1], (P[2] - C[2]) / Rr[2]); // 0 centre, 1 surface

// ------------------------------------------------------------ growth: a skeleton of branches (polylines + radii)
function branchLine(rnd, P0, D0, L, r0, r1, segs, o) {
  const pts = [P0.slice()], rad = [r0];
  let p = P0, d = D0;
  const step = L / segs;
  for (let i = 1; i <= segs; i++) {
    const w = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    d = nrm(add(add(d, scl(w, (o.wobble || 0) * 1.6)), [0, ((o.up || 0) - (o.droop || 0) * (i / segs)) * 0.6, 0]));
    p = add(p, scl(d, step));
    pts.push(p); rad.push(r0 + (r1 - r0) * (i / segs));
  }
  return { pts, rad, len: L };
}
function pointOn(b, t) { // position and direction at a fraction t of a branch's length
  const n = b.pts.length - 1, f = clamp(t, 0, 0.9999) * n, i = Math.floor(f), u = f - i;
  const a = b.pts[i], c = b.pts[i + 1];
  return { p: add(a, scl(sub(c, a), u)), d: nrm(sub(c, a)), r: b.rad[i] + (b.rad[i + 1] - b.rad[i]) * u };
}
function grow(sp, rnd) {
  const H = R(rnd, sp.H), T = sp.trunk, C = [0, H * sp.crown.cy, 0], Rr = [R(rnd, sp.crown.rx), R(rnd, sp.crown.ry), 0];
  Rr[2] = Rr[0] * (0.85 + rnd() * 0.3);
  const out = { H, C, Rr, bark: [], twigs: [] };
  const stems = RI(rnd, T.stems), r0 = R(rnd, T.r) / Math.sqrt(stems > 1 ? stems * 0.6 : 1);
  const trunkH = H * R(rnd, T.h);
  const leanAz = rnd() * Math.PI * 2, lean = (T.lean || 0) * (0.5 + rnd());
  for (let s = 0; s < stems; s++) {
    const az = leanAz + (s / stems) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
    const sp0 = stems > 1 ? (T.spread || 0.3) * (0.7 + rnd() * 0.5) : lean;
    const D = nrm([Math.sin(az) * sp0, 1, Math.cos(az) * sp0]);
    const base = stems > 1 ? [Math.sin(az) * r0 * 0.8, 0, Math.cos(az) * r0 * 0.8] : [0, 0, 0];
    const Lt = sp.shrub ? H * (0.75 + rnd() * 0.3) : trunkH / Math.max(0.5, D[1]) * (T.top ? T.top : 1);
    const st = branchLine(rnd, base, D, Lt, r0, r0 * (sp.shrub ? 0.4 : T.top ? 0.25 : 0.72), sp.shrub ? 4 : 6, { wobble: T.wobble, up: 0.05 });
    st.depth = 0; st.flare = T.flare || 1;
    out.bark.push(st);
    if (sp.shrub) { out.twigs.push(st); continue; }
    // limbs
    const L1 = sp.L1, n1 = RI(rnd, L1.n);
    const lim = [];
    for (let i = 0; i < n1; i++) {
      const t = L1.from + (1 - L1.from) * (i + rnd() * 0.8) / n1;
      const at = pointOn(st, t);
      const az1 = i * 2.39996 + rnd() * 0.6; // golden angle round the stem
      const ax = rotAxis(perp(at.d), at.d, az1);
      let d = nrm(rotAxis(at.d, ax, R(rnd, L1.ang)));
      const Lb = ellT(at.p, d, C, Rr) * R(rnd, L1.fill);
      const b = branchLine(rnd, at.p, d, Lb, at.r * L1.r, at.r * L1.r * 0.35, 4, L1);
      b.depth = 1; lim.push(b); out.bark.push(b);
    }
    // twigs on the limbs
    const L2 = sp.L2;
    for (const b of lim) {
      const n2 = Math.max(2, Math.round(RI(rnd, L2.n) * clamp(b.len / 2.2, 0.6, 1.6)));
      for (let i = 0; i < n2; i++) {
        const t = L2.from + (1 - L2.from) * (i + rnd()) / n2;
        const at = pointOn(b, t);
        const ax = rotAxis(perp(at.d), at.d, i * 2.39996 + rnd() * 0.8);
        const d = nrm(rotAxis(at.d, ax, R(rnd, L2.ang)));
        const Lb = ellT(at.p, d, C, Rr) * R(rnd, L2.fill);
        const tw = branchLine(rnd, at.p, d, Math.max(0.2, Lb), at.r * L2.r, at.r * L2.r * 0.3, 3, L2);
        tw.depth = 2; out.bark.push(tw); out.twigs.push(tw);
      }
      // the limb's own tip carries leaves too
      out.twigs.push({ ...b, tipOnly: true });
    }
  }
  return out;
}

// ------------------------------------------------------------ geometry
class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.i = []; }
  get nv() { return this.p.length / 3; }
  v(p, n, u, v, ao, flex, ph) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(u, v); this.c.push(ao[0], ao[1], ao[2]); this.w.push(flex, ph); return this.nv - 1; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 2));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tint3 = (hexs) => (hexs ? hex(hexs).map((v) => v / 255) : [1, 1, 1]);
// a branch as a tube, the bark's u round it, v up it (scaled by its girth so the pattern keeps its size)
function tube(B, br, radial, tile, tint, sk, ph) {
  const pts = br.pts, n = pts.length;
  let N = null, vAcc = 0;
  const rMean = (br.rad[0] + br.rad[n - 1]) / 2;
  const vk = 1 / Math.max(0.12, 2 * Math.PI * Math.max(rMean, 0.03) * 2);
  const first = B.nv;
  for (let i = 0; i < n; i++) {
    const t = nrm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    N = N ? nrm(sub(N, scl(t, dot(N, t)))) : perp(t);
    const Bn = cross(t, N);
    if (i > 0) vAcc += len(sub(pts[i], pts[i - 1])) * vk;
    let r = br.rad[i];
    if (br.depth === 0 && br.flare > 1) r *= 1 + (br.flare - 1) * Math.pow(1 - clamp(i / (n - 1) / 0.35, 0, 1), 2); // the flare at its foot
    const y = pts[i][1];
    const ao = (0.55 + 0.45 * sstep(0, 1.4, y)) * (br.depth > 0 && sk.C ? 0.75 + 0.25 * sstep(0.5, 1, ellD(pts[i], sk.C, sk.Rr)) : 1);
    const flex = Math.pow(clamp(y / sk.H, 0, 1), 1.6) * (br.depth === 0 ? 0.4 : br.depth === 1 ? 0.7 : 0.9);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, d = add(scl(N, Math.cos(a)), scl(Bn, Math.sin(a)));
      B.v(add(pts[i], scl(d, r)), d, (tile + 0.006 + (j / radial) * 0.988) / BARKS.length, vAcc, [ao * tint[0], ao * tint[1], ao * tint[2]], flex, ph);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = first + i * (radial + 1) + j, b = a + radial + 1;
    B.i.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
// one leaf card: anchored at P, growing along `up`, `side` across; normals bent outward from the crown (soft, round
// shading instead of flat cards)
function card(B, P, up, side, h, w, tile, outN, ao, flex, ph, flip = false, back = 0.08) {
  const [u0, v0, du, dv] = tileRect(tile), iu = du * 0.01, iv = dv * 0.01;
  const base = sub(P, scl(up, h * back));
  const hw = scl(side, w / 2), top = scl(up, h);
  let cn = nrm(cross(side, up));
  if (dot(cn, outN) < 0) cn = scl(cn, -1);
  const n = nrm(add(scl(outN, 0.72), scl(cn, 0.28)));
  const uL = flip ? u0 + du - iu : u0 + iu, uR = flip ? u0 + iu : u0 + du - iu;
  const a0 = [ao * 0.82, ao * 0.82, ao * 0.82], a1 = [ao, ao, ao];
  const bl = B.v(sub(base, hw), n, uL, v0 + iv, a0, flex * 0.8, ph);
  const brr = B.v(add(base, hw), n, uR, v0 + iv, a0, flex * 0.8, ph);
  const tr = B.v(add(add(base, hw), top), n, uR, v0 + dv - iv, a1, flex, ph);
  const tl = B.v(add(sub(base, hw), top), n, uL, v0 + dv - iv, a1, flex, ph);
  B.i.push(bl, brr, tr, bl, tr, tl);
}
function leafCards(B, sp, sk, rnd, lod) {
  const Lf = sp.leaves, tiles = Lf.tiles.map((t) => TILE[t]);
  const kN = lod ? (Lf.lod1 ?? 0.3) : 1, kS = lod ? (Lf.lod1Size ?? 1.8) : 1;
  for (const tw of sk.twigs) {
    const from = tw.tipOnly ? 0.7 : (Lf.from ?? 0.25);
    const n = Math.max(tw.tipOnly ? 1 : 2, Math.round(Lf.density * tw.len * (1 - from) * kN * (0.8 + rnd() * 0.4)));
    for (let k = 0; k < n; k++) {
      const at = pointOn(tw, from + (1 - from) * (lod ? (k + 0.5) / n : rnd()));
      const o = nrm(sub(at.p, [sk.C[0], sk.C[1] - sk.Rr[1] * 0.3, sk.C[2]]));
      const up = nrm(add(add(scl(at.d, 0.5), scl(o, Lf.out ?? 0.8)), [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.7 - (Lf.droop || 0), (rnd() - 0.5) * 0.9]));
      const side = nrm(cross(up, nrm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5])));
      const s = R(rnd, Lf.size) * kS;
      const d = ellD(at.p, sk.C, sk.Rr);
      const ao = (0.42 + 0.58 * sstep(0.3, 1.02, d)) * (0.8 + 0.2 * clamp(0.5 + 0.5 * (at.p[1] - sk.C[1]) / sk.Rr[1], 0, 1));
      card(B, at.p, up, side, s, s * (Lf.aspect || 1), tiles[Math.floor(rnd() * tiles.length)], o, ao, 1, rnd(), rnd() < 0.5);
    }
  }
}
// ------------------------------------------------------------ the anime look: crowns of rounded clumps (the way a
// background painter draws a tree), shaded as one volume, each clump outlined by the ink pass, fruit and flowers as
// little balls of colour
const ANIME_LEAF = { olivo: '#93a17c', encina: '#587a4c', platano: '#7aa55c', naranjo: '#4a7a45', limonero: '#52844a', morera: '#72a35a', pino: '#577a55', eucalipto: '#8ca68e', chopo: '#8fb266', higuera: '#6f9c56', frutal: '#7ba45e', adelfa: '#5a8552', cipres: '#446448', seto: '#548453', vid: '#7aa45a' };
const ANIME_DOTS = { naranjo: [['#f28c1c', 16, 0.075]], limonero: [['#eed63c', 14, 0.07]], adelfa: [['#ef7aa6', 26, 0.09], ['#f6f0ea', 6, 0.09]], frutal: [['#f4b0c0', 10, 0.06]] };
const lin = (h) => hex(h).map((v) => Math.pow(v / 255, 2.2));
// (claymation: the same greens as plasticine — more saturated; the anime look keeps its own)
// (claymation: the deep olive greens of modelling clay, as in the user's pictures — darker, a touch warm)
const clayGreen = (c) => { if (!STYLE.plastilina) return c; const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map((v, i) => Math.max(0, (L + (v - L) * 1.0) * 0.47 * [1.12, 1.0, 1.0][i])); };
const ICO = [];
function icoMesh(detail) { // a unit icosphere with shared vertices (smooth normals, lumps that stay closed)
  if (ICO[detail]) return ICO[detail];
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  return (ICO[detail] = { p: g.attributes.position.array, i: g.index.array, n: g.attributes.position.count });
}
// one lumpy ball of foliage at c (radius r, squashed by sq vertically); normals half its own, half the crown's
function blob(B, c, r, sq, col, sk, rnd, detail, tile, flexK, lump = 0.34, box = null) {
  const g = icoMesh(detail), [u0, v0, du, dv] = tileRect(tile), first = B.nv;
  const s1 = rnd() * 6.28, s2 = rnd() * 6.28, s3 = rnd() * 6.28, ph = rnd();
  const cc = sk.C ? [sk.C[0], sk.C[1] - sk.Rr[1] * 0.25, sk.C[2]] : [c[0], c[1] - r, c[2]];
  for (let k = 0; k < g.n; k++) {
    const d = [g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]];
    const w = Math.sin(d[0] * 2.7 + s1) * Math.sin(d[1] * 3.1 + s2) * Math.sin(d[2] * 2.9 + s3) + 0.35 * Math.sin(d[0] * 5.3 + s2) * Math.sin(d[2] * 4.7 + s1)
      + (detail > 2 ? 0.28 * Math.sin(d[0] * 9.7 + s3) * Math.sin(d[1] * 8.9 + s1) * Math.sin(d[2] * 9.3 + s2) : 0); // (a leafy, scalloped edge up close)
    const kk = 1 + w * lump;
    let P = [c[0] + d[0] * r * kk, c[1] + d[1] * r * kk * sq, c[2] + d[2] * r * kk];
    if (box) { // a clipped shape: a rounded box (superellipsoid of exponent box.n, half sizes box.h)
      const e = box.n, q = Math.pow(Math.pow(Math.abs(d[0]), e) + Math.pow(Math.abs(d[1]), e) + Math.pow(Math.abs(d[2]), e), -1 / e);
      P = [c[0] + d[0] * q * box.h[0] * kk, c[1] + d[1] * q * box.h[1] * kk, c[2] + d[2] * q * box.h[2] * kk];
    }
    const own = STYLE.plastilina && detail <= 2 && sk.C ? 0.7 : 0.5; // (claymation: each ball shaded as a ball — they read one by one)
    const n = nrm(add(scl(d, own), scl(nrm(sub(P, cc)), 1 - own)));
    const dd = sk.C ? ellD(P, sk.C, sk.Rr) : 1;
    const ao = (0.62 + 0.38 * sstep(0.2, 1.0, dd)) * (0.86 + 0.14 * (0.5 + 0.5 * d[1]));
    const flex = sk.H ? flexK * Math.pow(clamp(P[1] / sk.H, 0, 1), 1.5) : flexK;
    B.v(P, n, u0 + du * (0.5 + d[0] * 0.46), v0 + dv * (0.5 + (d[1] * 0.7 + d[2] * 0.3) * 0.46), [col[0] * ao, col[1] * ao, col[2] * ao], flex, ph);
  }
  for (let k = 0; k < g.i.length; k += 3) B.i.push(first + g.i[k], first + g.i[k + 1], first + g.i[k + 2]);
}
function clumps(B, sp, sk, rnd, lod) {
  const Lf = sp.leaves, name = sp.name;
  const col = clayGreen(lin(ANIME_LEAF[name] || '#6e9c4a'));
  const pts = [];
  for (const tw of sk.twigs) {
    const from = tw.tipOnly ? 0.7 : (Lf.from ?? 0.25);
    const n = Math.max(1, Math.round(tw.len * 2.5));
    for (let k = 0; k < n; k++) pts.push(pointOn(tw, from + (1 - from) * (k + 0.5) / n).p);
  }
  for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const crownR = Math.cbrt(sk.Rr[0] * sk.Rr[1] * sk.Rr[2]);
  if (STYLE.plastilina && !lod) { // (claymation: the balls laid over the crown's whole envelope, evenly, like a broccoli)
    pts.length = 0;
    const rb = Math.min(crownR * 0.3, 0.45), N = Math.round(clamp(4 * crownR * crownR / (rb * rb) * 0.5, 24, 70)), ga = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < N; k++) {
      const y = 1 - (k + 0.5) / N * 1.75, r = Math.sqrt(Math.max(0, 1 - y * y)), a = k * ga + rnd() * 0.3;
      pts.push([sk.C[0] + Math.cos(a) * r * sk.Rr[0] * 1.06, sk.C[1] + y * sk.Rr[1] * 1.06, sk.C[2] + Math.sin(a) * r * sk.Rr[2] * 1.06]);
    }
  }
  // (claymation: the crown made of many small balls of clay, as in the user's pictures)
  // (claymation: every tree a broccoli of small balls of clay, ~25 cm whatever its size — the user's pictures)
  const rc = STYLE.plastilina && !lod ? Math.min(crownR * 0.3, 0.45) : crownR * (lod ? 0.5 : 0.42) * (sp.clump || 1), sq = clamp(sk.Rr[1] / Math.max(sk.Rr[0], 0.1), 0.55, 1.2);
  const cs = [];
  for (const p0 of pts) {
    const p = add(sk.C, scl(sub(p0, sk.C), 0.84)); // (a little inside the envelope: the lumps reach out to it)
    if (cs.some((c) => Math.hypot(c[0] - p[0], (c[1] - p[1]) / sq, c[2] - p[2]) < rc * (STYLE.plastilina && !lod ? 0.9 : 1.05))) continue;
    cs.push(p);
    if (cs.length >= (lod ? 9 : STYLE.plastilina ? 70 : 13)) break; // (the far ones stay light: thousands of them)
  }
  // a core, so no sky shows through the middle of the crown
  blob(B, sk.C, crownR * 0.62, sq, col.map((v) => v * 0.82), sk, rnd, lod ? 1 : 2, TILE.copa, 0.25, 0.2);
  cs.forEach((c, i) => {
    const vk = 0.9 + rnd() * 0.2 + (c[1] > sk.C[1] ? 0.06 : -0.04);
    blob(B, c, rc * (0.9 + rnd() * 0.4), sq * (0.85 + rnd() * 0.2), col.map((v) => v * vk), sk, rnd, lod ? 1 : STYLE.plastilina ? 2 : 3, i % 3 ? TILE.copa : TILE.copa_b, 0.45, STYLE.plastilina ? 0.2 : 0.26);
  });
  // fruit, flowers: little balls sitting on the clumps
  if (!lod && ANIME_DOTS[name]) for (const [h, n, r] of ANIME_DOTS[name]) {
    const dc = lin(h);
    for (let k = 0; k < n; k++) {
      const c = cs[Math.floor(rnd() * cs.length)] || sk.C;
      const d = nrm([rnd() - 0.5, rnd() * 0.9 - 0.25, rnd() - 0.5]);
      blob(B, add(c, [d[0] * rc * 0.95, d[1] * rc * 0.95 * sq, d[2] * rc * 0.95]), r * (0.85 + rnd() * 0.3), 1, dc, sk, rnd, 0, TILE.copa, 0.5, 0.05);
    }
  }
}
// broadleaves and conifers with a branching crown
function buildBranching(sp, rnd, lod) {
  const sk = grow(sp, rnd), bark = new Buf(), leaves = new Buf();
  const tile = BARK[sp.bark] ?? BARK.comun, tint = tint3(sp.barkTint);
  sk.bark.forEach((b, i) => {
    if (lod && b.depth > 1) return; // far off only the trunk and the limbs
    const radial = b.depth === 0 ? (lod ? 6 : 9) : b.depth === 1 ? (lod ? 4 : 6) : 3;
    tube(bark, b, radial, tile, tint, sk, (i * 0.61803) % 1);
  });
  if (STYLE.anime || STYLE.plastilina) clumps(leaves, sp, sk, rnd, lod); else leafCards(leaves, sp, sk, rnd, lod); // (claymation: balls of modelled clay)
  return { bark, leaves, H: sk.H, R: Math.max(sk.Rr[0], sk.Rr[2]) };
}
// cypress: a slim spindle of foliage round a hidden stem
function buildColumn(sp, rnd, lod) {
  const H = R(rnd, sp.H), Rm = R(rnd, sp.r), bark = new Buf(), leaves = new Buf();
  const sk = { H, C: [0, H * 0.5, 0], Rr: [Rm, H * 0.5, Rm] };
  tube(bark, { pts: [[0, 0, 0], [0.02, 0.8, 0], [0, H * 0.85, 0.02]], rad: [0.16, 0.12, 0.03], depth: 0, flare: 1.3 }, lod ? 5 : 7, BARK[sp.bark], [1, 1, 1], sk, 0.3);
  if (STYLE.anime || STYLE.plastilina) { // a column of lumps, tapering to a point
    const col = clayGreen(lin(ANIME_LEAF.cipres)), n = lod ? 5 : 9;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, y = 0.9 + t * (H - 1.4), prof = Math.pow(Math.sin(Math.PI * clamp(t * 0.92 + 0.06, 0, 1)), 0.7) * (1 - 0.45 * t * t);
      const r = Math.max(0.25, Rm * prof * 1.05), vk = 0.88 + 0.2 * t + rnd() * 0.08;
      blob(leaves, [(rnd() - 0.5) * 0.12, y, (rnd() - 0.5) * 0.12], r, ((H - 1.4) / n) / r * 0.95, col.map((v) => v * vk), sk, rnd, lod ? 1 : 2, TILE.copa, 0.5, 0.2);
    }
    return { bark, leaves, H, R: Rm };
  }
  const tiles = sp.tiles.map((t) => TILE[t]);
  const step = lod ? 0.75 : 0.34;
  for (let y = 0.5; y < H - 0.2; y += step) {
    const t = (y - 0.4) / (H - 0.4), prof = Math.pow(Math.sin(Math.PI * clamp(t * 0.92 + 0.06, 0, 1)), 0.7) * (1 - 0.45 * t * t);
    const r = Rm * prof * (0.9 + rnd() * 0.2);
    const s = R(rnd, sp.size) * (lod ? 1.9 : 1);
    const nC = Math.max(3, Math.ceil((2 * Math.PI * Math.max(r, 0.2)) / (s * (lod ? 0.9 : 0.55))));
    for (let k = 0; k < nC; k++) {
      const a = (k / nC) * Math.PI * 2 + y * 1.7 + rnd() * 0.4, o = [Math.sin(a), 0, Math.cos(a)];
      const P = [o[0] * r * 0.45, y, o[2] * r * 0.45];
      const up = nrm([o[0] * 0.45 + (rnd() - 0.5) * 0.3, 1, o[2] * 0.45 + (rnd() - 0.5) * 0.3]);
      const side = nrm(cross(up, o));
      const ao = 0.55 + 0.45 * (0.5 + 0.5 * t);
      card(leaves, P, up, side, s, s * 0.9, tiles[0], nrm([o[0], 0.25, o[2]]), ao, clamp(y / H, 0, 1), rnd(), rnd() < 0.5, 0.2);
    }
  }
  return { bark, leaves, H, R: Rm };
}
// clipped hedge: cards all over a box, turned outwards
function buildBox(sp, rnd, lod) {
  const [L, W, Hh] = sp.size, bark = new Buf(), leaves = new Buf(), tile = TILE[sp.tiles[0]];
  if (STYLE.anime || STYLE.plastilina) { // a clipped hedge as a row of rounded lumps
    const col = clayGreen(lin(ANIME_LEAF.seto)), sk = { H: Hh, C: [0, Hh * 0.55, 0], Rr: [L / 2, Hh / 2, W / 2] };
    blob(leaves, [0, Hh * 0.5, 0], 1, 1, col.map((v) => v * (0.94 + rnd() * 0.1)), sk, rnd, lod ? 1 : 2, TILE.copa_b, 0.15, 0.05, { n: 5, h: [L * 0.53, Hh * 0.5, W * 0.5] });
    return { bark, leaves, H: Hh, R: L / 2 };
  }
  const step = lod ? 0.7 : 0.32, sz = R(rnd, sp.card) * (lod ? 1.8 : 1);
  const face = (o, P) => { const up = nrm(add(o, [(rnd() - 0.5) * 0.6, 0.5 + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.6])); const side = nrm(cross(up, nrm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]))); card(leaves, P, up, side, sz, sz, tile, o, 0.75 + rnd() * 0.25, 0.25, rnd(), rnd() < 0.5, 0.35); };
  for (let x = -L / 2 + step / 2; x < L / 2; x += step) for (let y = step / 2; y < Hh; y += step) { face([0, 0, 1], [x, y, W / 2 - 0.12]); face([0, 0, -1], [x, y, -W / 2 + 0.12]); }
  for (let z = -W / 2 + step / 2; z < W / 2; z += step) for (let y = step / 2; y < Hh; y += step) { face([1, 0, 0], [L / 2 - 0.12, y, z]); face([-1, 0, 0], [-L / 2 + 0.12, y, z]); }
  for (let x = -L / 2 + step / 2; x < L / 2; x += step) for (let z = -W / 2 + step / 2; z < W / 2; z += step) face([0, 1, 0], [x, Hh - 0.12, z]);
  return { bark, leaves, H: Hh, R: L / 2 };
}
// Canary palm: a thick straight trunk, the crown of arching fronds (each a strip folded along its rib)
function buildPalm(sp, rnd, lod) {
  const H = R(rnd, sp.H), r = R(rnd, sp.r), bark = new Buf(), leaves = new Buf();
  const sk = { H, C: [0, H, 0], Rr: [4, 2, 4] };
  const bend = (rnd() - 0.5) * 0.12, az = rnd() * 6.28;
  const pts = [], rad = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([Math.sin(az) * bend * t * t * H, t * H, Math.cos(az) * bend * t * t * H]); rad.push(r * (1.12 - 0.12 * t + (i === 8 ? 0.15 : 0))); }
  tube(bark, { pts, rad, depth: 0, flare: 1.25 }, lod ? 8 : 12, BARK[sp.bark], tint3(sp.barkTint), sk, 0.2);
  const top = pts[8], nF = Math.round(R(rnd, sp.fronds) * (lod ? 0.5 : 1)), tile = TILE.palma_hoja, [u0, v0, du, dv] = tileRect(tile);
  for (let f = 0; f < nF; f++) {
    const a = f * 2.39996 + rnd() * 0.3, e = 1.1 - (f / nF) * 1.55 + (rnd() - 0.5) * 0.2; // young fronds up, old ones hang
    const L = R(rnd, sp.frondL) * (1 - 0.15 * (f / nF)), Wd = R(rnd, sp.frondW) * (lod ? 1.3 : 1);
    let d = nrm([Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]);
    const side = nrm(cross([0, 1, 0], d));
    let p = add(top, scl(d, r * 0.6));
    const segs = lod ? 3 : 6, rows = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      rows.push({ p, t });
      d = nrm(add(d, [0, -0.32 * (L / segs) / 1.5, 0]));
      p = add(p, scl(d, L / segs));
    }
    for (let s = 0; s <= segs; s++) {
      const { p: q, t } = rows[s], w = Wd * Math.sin(Math.PI * clamp(0.1 + t * 0.9, 0, 1)) * 0.5 + 0.05;
      const fold = [0, w * 0.35, 0]; // the leaflets rise from the rib in a V
      const nUp = nrm(add(cross(side, sub(rows[Math.min(segs, s + 1)].p, rows[Math.max(0, s - 1)].p)), [0, 0.3, 0]));
      const ao = 0.6 + 0.4 * t, fl = 0.4 + 0.6 * t;
      leaves.v(add(add(q, scl(side, -w)), fold), nUp, u0 + du * 0.02, v0 + dv * (0.02 + t * 0.96), [ao, ao, ao], fl, f * 0.37);
      leaves.v(q, nUp, u0 + du * 0.5, v0 + dv * (0.02 + t * 0.96), [ao, ao, ao], fl, f * 0.37);
      leaves.v(add(add(q, scl(side, w)), fold), nUp, u0 + du * 0.98, v0 + dv * (0.02 + t * 0.96), [ao, ao, ao], fl, f * 0.37);
    }
    const b0 = leaves.nv - (segs + 1) * 3;
    for (let s = 0; s < segs; s++) for (let k = 0; k < 2; k++) {
      const a0 = b0 + s * 3 + k, a1 = a0 + 3;
      leaves.i.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
    }
  }
  return { bark, leaves, H: H + 2, R: 4.2 };
}
// fan palm (Washingtonia): a tall slim trunk and a compact head of fans held out on long stalks — the young ones
// standing up in the middle, the grown ones spread, the old ones hanging — and on some a skirt of dead leaves
function buildFanPalm(sp, rnd, lod) {
  const H = R(rnd, sp.H), r = R(rnd, sp.r), bark = new Buf(), leaves = new Buf();
  const sk = { H, C: [0, H, 0], Rr: [2.6, 1.8, 2.6] };
  const pts = [], rad = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push([0, t * H, 0]); rad.push(r * (1.25 - 0.3 * t)); }
  tube(bark, { pts, rad, depth: 0, flare: 1.3 }, lod ? 6 : 9, BARK[sp.bark], tint3(sp.barkTint), sk, 0.4);
  const n = Math.round(R(rnd, sp.fronds) * (lod ? 0.6 : 1)), tile = TILE.abanico, top = [0, H + 0.15, 0];
  for (let f = 0; f < n; f++) {
    const u = f / n, a = f * 2.39996 + rnd() * 0.3;
    const e = 1.3 - u * 1.95 + (rnd() - 0.5) * 0.2; // (from about 75° up to 37° down)
    const d = nrm([Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]);
    const pl = (0.75 + rnd() * 0.5) * (1 - 0.35 * Math.max(0, Math.sin(e))), L = R(rnd, sp.frondL) * (0.85 + 0.2 * u);
    const tip = add(top, scl(d, pl));
    tube(bark, { pts: [add(top, scl(d, -0.1)), tip], rad: [0.045, 0.025], depth: 2 }, 3, BARK.comun, [0.6, 0.55, 0.35], sk, rnd());
    // the fan carries on from its stalk: its plane holds the stalk and the level line across it, rolled a little,
    // and its end sags
    let side = cross([0, 1, 0], d); side = len(side) < 0.15 ? nrm([Math.cos(a), 0, -Math.sin(a)]) : nrm(side);
    const roll = (rnd() - 0.5) * 0.9, fn = nrm(cross(side, d));
    side = nrm(add(scl(side, Math.cos(roll)), scl(fn, Math.sin(roll))));
    const up = nrm(add(d, [0, -0.2 - 0.25 * u, 0]));
    card(leaves, tip, up, side, L * 1.05, L * 1.5, tile, nrm(add(d, [0, 0.9, 0])), 0.72 + 0.28 * rnd(), 0.8, rnd(), rnd() < 0.5, 0.05);
  }
  if (!lod && rnd() < 0.6) { // the skirt of dead leaves hanging under the head (the town trims most of it)
    const m = 12, len0 = 1.2 + rnd() * 1.6;
    for (let k = 0; k < m; k++) {
      const a = (k / m) * 6.28 + rnd() * 0.3, o = [Math.sin(a), 0, Math.cos(a)], P = [o[0] * r * 1.05, H + 0.05, o[2] * r * 1.05];
      card(leaves, P, nrm([o[0] * 0.12, -1, o[2] * 0.12]), nrm(cross([0, -1, 0], o)), len0 * (0.85 + rnd() * 0.3), r * 3.2, TILE.hierba_seca, o, 0.62 + rnd() * 0.2, 0.15, rnd(), k % 2 === 0, 0);
    }
  }
  return { bark, leaves, H: H + 2.2, R: 2.8 };
}
// vine (espaldera): a gnarled stock, two arms along the row (x), a hedge of leaves over the wires
function buildVine(sp, rnd, lod) {
  const bark = new Buf(), leaves = new Buf(), sk = { H: 1.8, C: [0, 1.25, 0], Rr: [0.9, 0.55, 0.35] };
  tube(bark, { pts: [[0, 0, 0], [0.05, 0.4, 0.02], [-0.03, 0.8, 0]], rad: [0.05, 0.04, 0.035], depth: 0, flare: 1.2 }, 5, BARK.comun, [0.9, 0.8, 0.7], sk, 0.1);
  for (const s of [-1, 1]) tube(bark, { pts: [[-0.03, 0.8, 0], [s * 0.5, 0.86, 0], [s * 1.0, 0.84, 0]], rad: [0.03, 0.025, 0.015], depth: 1 }, 4, BARK.comun, [0.9, 0.8, 0.7], sk, 0.2);
  if (STYLE.anime || STYLE.plastilina) { // the row's leaves as a few soft lumps over the wires
    const col = clayGreen(lin(ANIME_LEAF.vid));
    for (let k = 0; k < (lod ? 2 : 4); k++) blob(leaves, [(k / ((lod ? 2 : 4) - 1) - 0.5) * 1.5, 1.3, 0], 0.55, 0.7, col.map((v) => v * (0.92 + rnd() * 0.12)), sk, rnd, lod ? 0 : 1, TILE.copa, 0.5, 0.3);
    return { bark, leaves, H: 1.8, R: 1.1 };
  }
  const n = lod ? 7 : 26, tile = TILE.vid_a;
  for (let k = 0; k < n; k++) {
    const x = (rnd() - 0.5) * 2.1, y = 0.85 + rnd() * 0.85, z = (rnd() - 0.5) * 0.35;
    const o = nrm([rnd() - 0.5, 0.3, z > 0 ? 1 : -1]), up = nrm([rnd() - 0.5, 1, (rnd() - 0.5) * 0.5]), side = nrm(cross(up, o));
    const s = (lod ? 1.1 : 0.62) * (0.8 + rnd() * 0.4);
    card(leaves, [x, y - s * 0.4, z], up, side, s, s, tile, o, 0.7 + 0.3 * ((y - 0.85) / 0.85), 0.6, rnd(), rnd() < 0.5, 0.2);
  }
  return { bark, leaves, H: 1.8, R: 1.1 };
}
// reeds: a clump of tall blades
function buildReed(sp, rnd, lod) {
  const bark = new Buf(), leaves = new Buf(), H = R(rnd, sp.H), n = lod ? 5 : 12, tile = TILE.hierba;
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.28, P = [Math.sin(a) * 0.25 * rnd(), 0, Math.cos(a) * 0.25 * rnd()];
    const up = nrm([Math.sin(a) * 0.15, 1, Math.cos(a) * 0.15]), side = nrm(cross(up, [Math.cos(a), 0, -Math.sin(a)]));
    card(leaves, P, up, side, H * (0.75 + rnd() * 0.35), 0.9, tile, nrm([Math.sin(a), 0.4, Math.cos(a)]), 0.8, 0.8, rnd(), rnd() < 0.5, 0);
  }
  return { bark, leaves, H, R: 0.6 };
}
// one variant of a species, at LOD 0 (near) or 1 (further off): { bark, leaves } geometries, height, crown radius
export function buildTree(name, variant, lod) {
  const sp = specOf(name), rnd = mulberry32(1000 + SPECIES_KEYS.indexOf(name) * 97 + variant * 7919);
  const r = sp.kind === 'column' ? buildColumn(sp, rnd, lod) : sp.kind === 'box' ? buildBox(sp, rnd, lod) : sp.kind === 'palm' ? buildPalm(sp, rnd, lod)
    : sp.kind === 'fan' ? buildFanPalm(sp, rnd, lod) : sp.kind === 'vine' ? buildVine(sp, rnd, lod) : sp.kind === 'reed' ? buildReed(sp, rnd, lod) : buildBranching(sp, rnd, lod);
  return { bark: r.bark.nv ? r.bark.geometry() : null, leaves: r.leaves.nv ? r.leaves.geometry() : null, H: r.H, R: r.R };
}

// ------------------------------------------------------------ materials: bark and leaves sway in the wind (more
// towards the tips, each tree in its own time); leaves light up from behind and wrap the light softly
// (bump SHADER_V on any change below: three.js reuses a compiled program by its cache key)
export const SHADER_V = 3;
const WIND_VS = `
attribute vec2 aWind;
uniform float uTime; uniform float uWind;`;
const WIND_BEGIN = `#include <begin_vertex>
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
    ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  #endif
  float ph = ip.x * 0.37 + ip.z * 0.21 + aWind.y * 6.2831;
  float k = aWind.x * uWind;
  float gust = 0.65 + 0.35 * sin(uTime * 0.31 + ip.x * 0.013 + ip.z * 0.017);
  transformed.x += (sin(uTime * 1.15 + ph) * 0.05 + sin(uTime * 2.9 + ph * 1.7) * 0.012) * k * gust * (1.0 + position.y * 0.08);
  transformed.z += (cos(uTime * 0.95 + ph * 1.3) * 0.035) * k * gust * (1.0 + position.y * 0.08);
  #ifdef LEAF_FLUTTER
    transformed += objectNormal * sin(uTime * 6.3 + ph * 3.1 + position.x * 4.0) * 0.018 * k;
  #endif
}`;
export function makeLeafMaterial(atlas, { a2c = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.42 });
  m.alphaToCoverage = a2c;
  m.defines = { LEAF_FLUTTER: '' };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + WIND_VS).replace('#include <begin_vertex>', WIND_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      // far off, mipmaps thin the leaves out: keep their coverage
      .replace('#include <map_fragment>', `#include <map_fragment>
  diffuseColor.a *= 1.0 + max(0.0, log2(max(fwidth(vMapUv.x), fwidth(vMapUv.y)) * 2048.0)) * 0.3;${STYLE.plastilina ? `
  { // (claymation: a crown's balls are plain clay, not painted leaves — on the two crown tiles only; the vertex colour
    // comes next)
    vec4 r0 = vec4(${tileRect(TILE.copa).map((v) => v.toFixed(5)).join(', ')}), r1 = vec4(${tileRect(TILE.copa_b).map((v) => v.toFixed(5)).join(', ')});
    vec2 q0 = (vMapUv - r0.xy) / r0.zw, q1 = (vMapUv - r1.xy) / r1.zw;
    bool crown = (q0.x >= 0.0 && q0.x <= 1.0 && q0.y >= 0.0 && q0.y <= 1.0) || (q1.x >= 0.0 && q1.x <= 1.0 && q1.y >= 0.0 && q1.y <= 1.0);
    if (crown) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), 0.75);
  }` : ''}`)
      // the diffuse light wraps round the crown and some comes through the leaves from behind (the specular keeps the
      // plain term: a lit back face would blow up the GGX lobe). The anime look keeps its two clean tones instead.
      .replace('#include <lights_physical_pars_fragment>', STYLE.anime ? '#include <lights_physical_pars_fragment>' : THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        '{ float nlL = dot( geometryNormal, directLight.direction ); reflectedLight.directDiffuse += ( saturate( ( nlL + 0.4 ) / 1.4 ) + saturate( -nlL ) * 0.3 ) * directLight.color * BRDF_Lambert( material.diffuseColor ); }'));
  };
  m.customProgramCacheKey = () => 'leaf' + SHADER_V + (a2c ? 'a' : '') + STYLE.name;
  return m;
}
export function makeBarkMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2.2, vertexColors: true, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + WIND_VS).replace('#include <begin_vertex>', WIND_BEGIN);
  };
  m.customProgramCacheKey = () => 'bark' + SHADER_V;
  return m;
}
// shadows: the leaves' cards cut out along their alpha
export function makeLeafDepthMaterial(atlas) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });
  return m;
}

// ------------------------------------------------------------ the library: every species' variants at both levels
// of detail, and their billboards (albedo and normals baked into two atlases of 128 px cells)
const IMP_CELL = 128, IMP_COLS = 8;
export class TreeLibrary {
  constructor(renderer, { variants = 3, a2c = true, species = SPECIES_KEYS, perSpecies = {} } = {}) {
    this.atlas = makeLeafAtlas(); this.barkTex = makeBarkAtlas();
    this.leafMat = makeLeafMaterial(this.atlas, { a2c }); this.barkMat = makeBarkMaterial(this.barkTex); this.depthMat = makeLeafDepthMaterial(this.atlas);
    this.kinds = {};
    let cell = 0;
    for (const name of species) {
      const n = perSpecies[name] || variants, list = [];
      for (let v = 0; v < n; v++) {
        const l0 = buildTree(name, v, 0), l1 = buildTree(name, v, 1);
        list.push({ name, v, lod: [l0, l1], H: l0.H, R: l0.R, cell: cell++ });
      }
      this.kinds[name] = list;
    }
    this.cells = cell;
    this.imp = renderer ? this.bake(renderer) : null;
    this.impMat = this.imp ? makeImpostorMaterial(this.imp.alb, this.imp.nrm, { a2c }) : null;
  }
  // each variant photographed from the side, unlit (its colours × its shading) and as normals, into one cell each
  bake(renderer) {
    const rows = Math.ceil(this.cells / IMP_COLS), W = IMP_CELL * IMP_COLS, H = IMP_CELL * rows;
    const mk = () => { const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true }); rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.magFilter = THREE.LinearFilter; return rt; };
    const alb = mk(), nrmRT = mk();
    alb.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
    const bakeMat = (mode, map) => new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { map: { value: map } },
      vertexShader: `attribute vec3 color; varying vec2 vUv; varying vec3 vC; varying vec3 vN;
        void main() { vUv = uv; vC = color; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vC; varying vec3 vN;
        void main() {
          vec4 t = texture2D(map, vUv);
          if (t.a < 0.45) discard;
          ${mode === 'alb' ? 'gl_FragColor = vec4(t.rgb * vC, 1.0); /* (linear: the sRGB target encodes it) */' : 'vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; n.z = abs(n.z); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);'}
        }`,
    });
    const mats = { alb: [bakeMat('alb', this.barkTex), bakeMat('alb', this.atlas)], nrm: [bakeMat('nrm', this.barkTex), bakeMat('nrm', this.atlas)] };
    const keepRT = renderer.getRenderTarget(), keepClear = renderer.getClearColor(new THREE.Color()), keepAlpha = renderer.getClearAlpha(), keepAuto = renderer.autoClear;
    renderer.autoClear = false;
    for (const [pass, rt, clear] of [['alb', alb, [0.28, 0.34, 0.2]], ['nrm', nrmRT, [0.5, 0.5, 1]]]) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(new THREE.Color(clear[0], clear[1], clear[2]), 0); renderer.clear(true, true, false);
      for (const name in this.kinds) for (const k of this.kinds[name]) {
        const g0 = k.lod[0];
        const box = new THREE.Box3();
        for (const g of [g0.bark, g0.leaves]) if (g) { g.computeBoundingBox(); box.union(g.boundingBox); }
        const w = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * 2, h = box.max.y;
        const S = Math.max(w, h) * 1.04;
        k.imp = { S, u0: (k.cell % IMP_COLS) / IMP_COLS, v0: Math.floor(k.cell / IMP_COLS) / rows, du: 1 / IMP_COLS, dv: 1 / rows };
        cam.left = -S / 2; cam.right = S / 2; cam.bottom = 0; cam.top = S; cam.near = 0.01; cam.far = 200;
        cam.position.set(0, 0, 60); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
        const x0 = (k.cell % IMP_COLS) * IMP_CELL, y0 = Math.floor(k.cell / IMP_COLS) * IMP_CELL;
        rt.viewport.set(x0 + 2, y0 + 2, IMP_CELL - 4, IMP_CELL - 4); rt.scissor.set(x0, y0, IMP_CELL, IMP_CELL); rt.scissorTest = true;
        scene.clear();
        if (g0.bark) scene.add(new THREE.Mesh(g0.bark, mats[pass][0]));
        if (g0.leaves) scene.add(new THREE.Mesh(g0.leaves, mats[pass][1]));
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
      }
      rt.scissorTest = false; rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H);
    }
    renderer.setRenderTarget(keepRT); renderer.setClearColor(keepClear, keepAlpha); renderer.autoClear = keepAuto;
    for (const m of [...mats.alb, ...mats.nrm]) m.dispose();
    return { alb: alb.texture, nrm: nrmRT.texture, rts: [alb, nrmRT] };
  }
}
// far off: a billboard turned to the camera round its upright, its picture lit through its baked normals
export function makeImpostorMaterial(alb, nrmTex, { a2c = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: alb, normalMap: nrmTex, roughness: 0.85, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide });
  m.alphaToCoverage = a2c;
  m.defines = { TOON_KEEP_NORMALS: '' }; // (a billboard's volume is all in its baked normals)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aCell;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  vMapUv = aCell.xy + uv * aCell.zw; vNormalMapUv = vMapUv;`)
      .replace('#include <defaultnormal_vertex>', `
  vec3 bIp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 bTo = cameraPosition - bIp; bTo.y = 0.0; bTo = normalize(bTo + vec3(1e-5, 0.0, 0.0));
  vec3 transformedNormal = normalize((viewMatrix * vec4(bTo, 0.0)).xyz);`)
      .replace('#include <project_vertex>', `
  vec2 bS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  vec3 bR = vec3(bTo.z, 0.0, -bTo.x);
  vec3 bW = bIp + bR * position.x * bS.x + vec3(0.0, position.y * bS.y, 0.0);
  vec4 mvPosition = viewMatrix * vec4(bW, 1.0);
  gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `vec4 worldPosition = vec4(bW, 1.0);`);
  };
  m.customProgramCacheKey = () => 'imp' + SHADER_V + (a2c ? 'a' : '');
  return m;
}

// ------------------------------------------------------------ the forest: every tree as an instance. Near the camera
// they are drawn whole (and cast shadows), further off lighter, beyond `near` as billboards in chunks
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
export class TreeField {
  constructor(lib, { chunk = 96, near = 170, d0 = 48, dShadow = 85 } = {}) {
    this.lib = lib; this.chunk = chunk; this.near = near; this.d0 = d0; this.dShadow = dShadow;
    this.items = [];        // { k (variant), x, y, z, m (16 floats), tint }
    this.circles = [];      // trunks for collisions: x, z, r
  }
  // species at (x, z): s scale, sy height scale, rot, tint [r,g,b] multiplier, lean (rad), variant (else random)
  add(name, x, z, { s = 1, sy = s, rot = null, tint = null, lean = 0, variant = null, y = 0, rnd = Math.random, trunk = 0.3 } = {}) {
    const list = this.lib.kinds[name];
    if (!list) return null;
    const k = list[variant == null ? Math.floor(rnd() * list.length) % list.length : variant % list.length];
    const r = rot == null ? rnd() * Math.PI * 2 : rot;
    _e.set(lean ? (rnd() - 0.5) * lean * 2 : 0, r, lean ? (rnd() - 0.5) * lean * 2 : 0, 'YXZ');
    _q.setFromEuler(_e); _p.set(x, y, z); _s.set(s, sy, s);
    _m.compose(_p, _q, _s);
    const it = { k, x, y, z, s: Math.max(s, sy), m: _m.toArray(new Float32Array(16)), tint: tint || [1, 1, 1] };
    this.items.push(it);
    if (trunk > 0) this.circles.push(x, z, trunk * s);
    return it;
  }
  build(parent) {
    this.parent = parent;
    const L = this.lib, C = this.chunk;
    // near buckets per variant: [lod0 (shadows), lod1 near (shadows), lod1 far (none)], each a bark and a leaves mesh
    this.byVar = new Map();
    const count = new Map();
    for (const it of this.items) count.set(it.k, (count.get(it.k) || 0) + 1);
    for (const [k, n] of count) {
      const buckets = [0, 1, 1].map((lod, bi) => {
        const g = k.lod[lod], ms = [];
        for (const [geo, mat] of [[g.bark, L.barkMat], [g.leaves, L.leafMat]]) {
          if (!geo) { ms.push(null); continue; }
          const im = new THREE.InstancedMesh(geo, mat, n);
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.setColorAt(0, _c.setRGB(1, 1, 1)); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
          im.count = 0; im.frustumCulled = false; im.visible = false;
          im.castShadow = bi < 2; im.receiveShadow = true;
          if (mat === L.leafMat) im.customDepthMaterial = L.depthMat;
          parent.add(im); ms.push(im);
        }
        return ms;
      });
      this.byVar.set(k, buckets);
    }
    // chunks, each with its billboards
    this.chunks = new Map();
    for (const it of this.items) {
      const key = Math.floor(it.x / C) + ':' + Math.floor(it.z / C);
      let ch = this.chunks.get(key);
      if (!ch) this.chunks.set(key, (ch = { cx: (Math.floor(it.x / C) + 0.5) * C, cz: (Math.floor(it.z / C) + 0.5) * C, items: [], imp: null, near: false }));
      ch.items.push(it);
    }
    if (L.imp) {
      const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
      const impMesh = (items) => {
        const n = items.length, g = quad.clone(), cells = new Float32Array(n * 4);
        const im = new THREE.InstancedMesh(g, L.impMat, n);
        items.forEach((it, i) => {
          const I = it.k.imp;
          cells.set([I.u0, I.v0, I.du, I.dv], i * 4);
          _m.makeScale(I.S * it.s, I.S * it.s, 1).setPosition(it.x, it.y, it.z);
          im.setMatrixAt(i, _m);
          im.setColorAt(i, _c.setRGB(it.tint[0], it.tint[1], it.tint[2]));
        });
        g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4));
        im.computeBoundingSphere(); im.boundingSphere.radius += 12;
        im.castShadow = false; im.receiveShadow = false;
        parent.add(im);
        return im;
      };
      for (const ch of this.chunks.values()) ch.imp = impMesh(ch.items);
      // far off, 3 × 3 chunks share one billboard mesh (one draw call for nine); by the 3D trees, each its own
      this.supers = new Map();
      for (const ch of this.chunks.values()) {
        const key = Math.floor(ch.cx / (C * 3)) + ':' + Math.floor(ch.cz / (C * 3));
        let sc = this.supers.get(key); if (!sc) this.supers.set(key, (sc = { chunks: [], imp: null }));
        sc.chunks.push(ch);
      }
      for (const sc of this.supers.values()) if (sc.chunks.length > 1) sc.imp = impMesh(sc.chunks.flatMap((ch) => ch.items));
    }
    this.update(0, 0, true);
  }
  // which chunks are near, and within them which level each tree is drawn at
  update(cx, cz, force = false) {
    if (!this.chunks) return;
    const C = this.chunk, near = this.near;
    const nearItems = [];
    for (const ch of this.chunks.values()) {
      const dx = Math.max(0, Math.abs(cx - ch.cx) - C / 2), dz = Math.max(0, Math.abs(cz - ch.cz) - C / 2);
      const isNear = Math.hypot(dx, dz) < near;
      if (ch.imp) ch.imp.visible = !isNear;
      if (isNear) for (const it of ch.items) nearItems.push(it);
      ch.near = isNear;
    }
    if (this.supers) for (const sc of this.supers.values()) {
      if (!sc.imp) continue;
      const far = !sc.chunks.some((ch) => ch.near);
      sc.imp.visible = far;
      if (far) for (const ch of sc.chunks) ch.imp.visible = false;
    }
    for (const b of this.byVar.values()) for (const ms of b) for (const im of ms) if (im) im.count = 0;
    for (const it of nearItems) {
      const d = Math.hypot(it.x - cx, it.z - cz), bi = d < this.d0 ? 0 : d < this.dShadow ? 1 : 2;
      const ms = this.byVar.get(it.k)[bi];
      for (let j = 0; j < 2; j++) {
        const im = ms[j];
        if (!im) continue;
        const i = im.count++;
        im.instanceMatrix.array.set(it.m, i * 16);
        const t = it.tint, w = j === 0 ? 0.35 : 1; // (the bark takes a little of the tint)
        im.instanceColor.array[i * 3] = 1 + (t[0] - 1) * w; im.instanceColor.array[i * 3 + 1] = 1 + (t[1] - 1) * w; im.instanceColor.array[i * 3 + 2] = 1 + (t[2] - 1) * w;
      }
    }
    for (const b of this.byVar.values()) for (const ms of b) for (const im of ms) if (im) {
      im.visible = im.count > 0;
      if (im.count) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    }
  }
}

// ------------------------------------------------------------ potted plants (balconies, sills, doorsteps): leaf and
// flower cards on the leaf atlas, built into the facade chunks with the leaves' material
export class CardGeo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.i = []; this.nv = 0; this.o = [0, 0, 0, 1, 0, 0, 1]; }
  frame(ox, oy, oz, tx, tz, nx, nz) { this.o = [ox, oy, oz, tx, tz, nx, nz]; }
  world() { this.o = [0, 0, 0, 1, 0, 0, 1]; }
  _v(P, N, u, v, col, flex, ph) {
    const o = this.o;
    this.p.push(o[0] + o[3] * P[0] + o[5] * P[2], o[1] + P[1], o[2] + o[4] * P[0] + o[6] * P[2]);
    this.n.push(o[3] * N[0] + o[5] * N[2], N[1], o[4] * N[0] + o[6] * N[2]);
    this.uv.push(u, v); this.c.push(col[0], col[1], col[2]); this.w.push(flex, ph);
    return this.nv++;
  }
  // a card in the local frame: base point, up (along the card), side (across), height, width
  card(base, up, side, h, w, tile, outN, col, flex = 0.4, flip = false) {
    const [u0, v0, du, dv] = tileRect(tile), iu = du * 0.01, iv = dv * 0.01;
    let cn = nrm(cross(side, up)); if (dot(cn, outN) < 0) cn = scl(cn, -1);
    const n = nrm(add(scl(outN, 0.7), scl(cn, 0.3)));
    const hw = scl(side, w / 2), tp = scl(up, h), b = sub(base, scl(up, h * 0.06));
    const uL = flip ? u0 + du - iu : u0 + iu, uR = flip ? u0 + iu : u0 + du - iu;
    const c0 = col.map((x) => x * 0.8);
    const a = this._v(sub(b, hw), n, uL, v0 + iv, c0, flex * 0.5, this.ph);
    this._v(add(b, hw), n, uR, v0 + iv, c0, flex * 0.5, this.ph);
    this._v(add(add(b, hw), tp), n, uR, v0 + dv - iv, col, flex, this.ph);
    this._v(add(sub(b, hw), tp), n, uL, v0 + dv - iv, col, flex, this.ph);
    this.i.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }
  build(material, depth = null) {
    if (!this.nv || !material) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 2));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false; m.receiveShadow = true;
    if (depth) m.customDepthMaterial = depth;
    return m;
  }
}
// the plant in a pot of radius r whose soil is at (x, y, z) in the builder's frame: 'geranio' (a mound of round
// leaves and heads of red or pink flowers), 'gitanilla' (trailing over the edge), 'cinta' (arching striped leaves),
// 'aspidistra' (tall dark leaves), 'mata' (a small clipped shrub)
export function potPlant(B, kind, x, y, z, r, rnd, { flowers = null } = {}) {
  B.ph = rnd();
  const ring = (n, f) => { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rnd() * 0.8; f(a, [Math.cos(a), 0, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)]); } };
  const g = () => [0.85 + rnd() * 0.3, 0.85 + rnd() * 0.3, 0.85 + rnd() * 0.25];
  if (kind === 'geranio' || kind === 'geranioAlto') {
    const tall = kind === 'geranioAlto' ? 1.5 : 1;
    ring(5, (a, o, s) => B.card([x + o[0] * r * 0.25, y, z + o[2] * r * 0.25], nrm([o[0] * 0.75, 1, o[2] * 0.75]), s, r * 3.1 * tall, r * 3.1, TILE.geranio_hoja, nrm([o[0], 0.6, o[2]]), g(), 0.5, rnd() < 0.5));
    B.card([x, y, z], [0, 1, 0], nrm([rnd() - 0.5, 0, rnd() - 0.5]), r * 2.6 * tall, r * 2.6, TILE.geranio_hoja, [0, 1, 0], g(), 0.5);
    const fl = flowers || (rnd() < 0.6 ? TILE.geranio_rojo : TILE.geranio_rosa);
    ring(3, (a, o, s) => B.card([x + o[0] * r * 0.35, y + r * 1.1 * tall, z + o[2] * r * 0.35], nrm([o[0] * 0.3, 1, o[2] * 0.3]), s, r * 2.3, r * 2.3, fl, [0, 1, 0], [1, 1, 1], 0.7, rnd() < 0.5));
  } else if (kind === 'gitanilla') {
    ring(6, (a, o, s) => B.card([x + o[0] * r * 0.8, y + r * 0.2, z + o[2] * r * 0.8], nrm([o[0] * 0.55, -1, o[2] * 0.55]), s, r * 3.8, r * 2.6, TILE.gitanilla, nrm([o[0], 0.2, o[2]]), g(), 0.8, rnd() < 0.5));
    ring(3, (a, o, s) => B.card([x + o[0] * r * 0.3, y, z + o[2] * r * 0.3], nrm([o[0] * 0.8, 1, o[2] * 0.8]), s, r * 2.2, r * 2.4, TILE.gitanilla, [0, 1, 0], g(), 0.6));
  } else if (kind === 'cinta') {
    ring(7, (a, o, s) => B.card([x + o[0] * r * 0.2, y, z + o[2] * r * 0.2], nrm([o[0] * 1.1, 1, o[2] * 1.1]), s, r * 3.4, r * 2.2, TILE.cinta, nrm([o[0], 0.5, o[2]]), g(), 0.6, rnd() < 0.5));
  } else if (kind === 'aspidistra') {
    ring(6, (a, o, s) => B.card([x + o[0] * r * 0.15, y, z + o[2] * r * 0.15], nrm([o[0] * 0.45, 1, o[2] * 0.45]), s, r * 5, r * 2.4, TILE.cinta, nrm([o[0], 0.4, o[2]]), [0.45, 0.62, 0.42], 0.5, rnd() < 0.5));
  } else { // a little shrub
    ring(5, (a, o, s) => B.card([x + o[0] * r * 0.3, y, z + o[2] * r * 0.3], nrm([o[0] * 0.7, 1, o[2] * 0.7]), s, r * 3.2, r * 3.2, TILE.seto_a, nrm([o[0], 0.6, o[2]]), g(), 0.4, rnd() < 0.5));
    B.card([x, y, z], [0, 1, 0], nrm([rnd() - 0.5, 0, rnd() - 0.5]), r * 3, r * 3, TILE.seto_a, [0, 1, 0], g(), 0.4);
  }
}

// ------------------------------------------------------------ plants of the ground (wall bases, kerbs, tree pits,
// yards and empty lots): tufts of crossed cards, rosettes lying flat, clumps of scrub — same atlas and material
export const GROUND_KINDS = ['hierba', 'hierbaAlta', 'hierbaSeca', 'avena', 'jaramago', 'amapola', 'margarita', 'malva', 'roseta', 'cardo', 'matorral'];
export function groundPlant(B, kind, x, y, z, s, rnd) {
  B.ph = rnd();
  const up = [0, 1, 0];
  const g = (k = [1, 1, 1]) => { const v = 0.82 + rnd() * 0.32; return [v * k[0], v * k[1] * (0.95 + rnd() * 0.1), v * k[2] * (0.92 + rnd() * 0.14)]; };
  // n cards crossing near (x, z), each turned by π/n and leaning a little; h, w in metres before the plant's scale
  const tuft = (n, tile, h, w, lean, flex, col, spread = 0) => {
    const a0 = rnd() * Math.PI;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI + (rnd() - 0.5) * 0.35;
      const sd = [Math.cos(a), 0, Math.sin(a)], nd = [-Math.sin(a), 0, Math.cos(a)];
      const lf = (rnd() - 0.5) * 2 * lean, o = spread * s * (rnd() - 0.5) * 2;
      B.card([x + nd[0] * o + sd[0] * o * 0.5, y, z + nd[2] * o + sd[2] * o * 0.5], nrm([nd[0] * lf, 1, nd[2] * lf]), sd, h * s * (0.8 + rnd() * 0.4), w * s * (0.8 + rnd() * 0.4), tile, up, g(col), flex, rnd() < 0.5);
    }
  };
  const flat = (tile, size, dy) => { // a card lying on the ground, centred on (x, z)
    const a = rnd() * Math.PI * 2, d = [Math.cos(a), 0, Math.sin(a)], sd = [-Math.sin(a), 0, Math.cos(a)], L = size * s;
    B.card([x - d[0] * L * 0.47, y + dy, z - d[2] * L * 0.47], d, sd, L, L, tile, up, g(), 0.05, rnd() < 0.5);
  };
  const G = [1, 1, 1];
  switch (kind) {
    case 'hierbaAlta': tuft(3, TILE.hierba, 0.46, 0.46, 0.3, 0.7, G); break;
    case 'hierbaSeca': tuft(3, TILE.hierba_seca, 0.4, 0.44, 0.35, 0.6, G); break;
    case 'avena': tuft(3, TILE.avena, 0.62, 0.52, 0.3, 0.8, G); if (rnd() < 0.5) tuft(2, TILE.hierba_seca, 0.3, 0.4, 0.4, 0.5, G); break;
    case 'jaramago': tuft(2, TILE.jaramago, 0.75, 0.55, 0.2, 0.7, G, 0.04); tuft(2, TILE.hierba, 0.24, 0.34, 0.3, 0.5, G); break;
    case 'amapola': tuft(3, TILE.amapola, 0.52, 0.46, 0.25, 0.8, G, 0.05); break;
    case 'margarita': tuft(2, TILE.margarita, 0.32, 0.4, 0.3, 0.6, G, 0.03); break;
    case 'malva': tuft(3, TILE.malva, 0.42, 0.56, 0.55, 0.4, G); break;
    case 'roseta': flat(TILE.roseta, 0.28 + rnd() * 0.12, 0.022); if (rnd() < 0.3) tuft(2, TILE.hierba, 0.16, 0.26, 0.3, 0.4, G); break;
    case 'cardo': tuft(3, TILE.cardo, 0.7, 0.55, 0.2, 0.3, G, 0.05); break;
    case 'matorral': // a broom bush with dry grass round its foot
      tuft(4, TILE.retama, 0.95, 0.95, 0.35, 0.5, [0.95, 0.95, 0.9], 0.1);
      if (rnd() < 0.6) tuft(2, TILE.hierba_seca, 0.35, 0.6, 0.5, 0.5, G, 0.2);
      break;
    default: tuft(3, TILE.hierba, 0.22, 0.3, 0.25, 0.5, G);
  }
}
