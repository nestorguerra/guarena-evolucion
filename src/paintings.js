// Oil paintings for the retablo and the chapels, painted here on canvases (no files): the apostles standing full length
// on a dark warm ground, lit from the upper left the way the old masters lit them — the light side of the robe, the
// shadow side, the folds — each with his attribute (Peter's keys, Paul's sword, Andrew's cross…); the Crucifixion with
// Mary and John under a darkened sky; busts of the four Latin Doctors for the predella; the Virgin of the Assumption;
// the Baptism. Then the work of the years on them: the varnish gone amber, fine cracks (craquelure), the canvas weave,
// the edges darkened under the frame.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

const CACHE = new Map();
// kind: an apostle ('pedro', 'pablo', …), 'crucifixion', a doctor ('agustin', 'ambrosio', 'jeronimo', 'gregorio'),
// 'asuncion', 'bautismo', 'domingo', 'catalina'
export function paintingTexture(kind, { w = 288, h = 432, seed = 1, fresco = false } = {}) {
  const key = `${kind}:${w}x${h}:${seed}:${fresco ? 1 : 0}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const r = mulberry32(seed * 7919 + kind.length * 131 + kind.charCodeAt(0));
  const P = new Painter(x, w, h, r);
  if (APOSTLES[kind]) P.apostle(APOSTLES[kind]);
  else if (SAINTS[kind]) P.saint(SAINTS[kind]);
  else if (kind === 'crucifixion') P.crucifixion();
  else if (DOCTORS[kind]) P.doctor(DOCTORS[kind]);
  else if (kind === 'asuncion') P.assumption();
  else if (kind === 'bautismo') P.baptism();
  else if (kind === 'domingo' || kind === 'catalina') P.dominican(kind);
  else if (kind === 'retrato') P.portrait(seed);
  else if (kind === 'vegas') P.vegas();
  else P.apostle(APOSTLES.pedro);
  if (fresco) P.fresco(); else P.age();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  CACHE.set(key, t);
  return t;
}
export const APOSTLE_ORDER = ['pedro', 'pablo', 'andres', 'santiago', 'juan', 'tomas', 'mateo', 'bartolome', 'felipe', 'menor', 'simon', 'tadeo'];

// the apostles as tradition paints them: their colours, hair and beard, what they hold
const APOSTLES = {
  pedro: { tunic: '#34466c', mantle: '#c48a2a', hair: '#d6d0c4', beard: 'short', bald: true, attr: 'llaves', look: -0.3 },
  pablo: { tunic: '#3a5a38', mantle: '#8c2620', hair: '#3a2a1c', beard: 'long', bald: true, attr: 'espada', look: 0.2 },
  andres: { tunic: '#40607e', mantle: '#a4602c', hair: '#e0dbd0', beard: 'long', attr: 'aspa', look: -0.5 },
  santiago: { tunic: '#6a4a2c', mantle: '#2c4c38', hair: '#4a3020', beard: 'short', attr: 'bordon', look: 0.1, shells: true },
  juan: { tunic: '#386a3e', mantle: '#a8281f', hair: '#7a4c26', beard: null, young: true, attr: 'caliz', look: -0.15 },
  tomas: { tunic: '#3a5846', mantle: '#b5552a', hair: '#4a3424', beard: 'short', attr: 'lanza', look: 0.3 },
  mateo: { tunic: '#58386a', mantle: '#c49634', hair: '#5a4230', beard: 'short', attr: 'libro', look: -0.25 },
  bartolome: { tunic: '#d4cec0', mantle: '#8a2824', hair: '#2a1e14', beard: 'long', attr: 'cuchillo', look: 0.15 },
  felipe: { tunic: '#7a3828', mantle: '#386846', hair: '#5a3824', beard: 'short', attr: 'cruz', look: -0.1 },
  menor: { tunic: '#566856', mantle: '#982838', hair: '#3a2a1e', beard: 'short', attr: 'maza', look: 0.25 },
  simon: { tunic: '#364e78', mantle: '#bc6c30', hair: '#b8b0a4', beard: 'long', attr: 'sierra', look: -0.35 },
  tadeo: { tunic: '#3c683c', mantle: '#783058', hair: '#4a2e1e', beard: 'short', attr: 'alabarda', look: 0.2 },
};
// the saints of the chapels' little retablos (San Gregorio Ostiense is the patron of Guareña; San Isidro, of its fields)
const SAINTS = {
  isidro: { tunic: '#7a5634', mantle: '#4a5a32', hair: '#4a3020', beard: 'short', attr: 'aguijada', look: 0.2 },
  antonio: { tunic: '#5a3e2a', mantle: '#5a3e2a', hair: '#3a2416', young: true, tonsure: true, attr: 'nino', look: -0.3, cord: true },
  gregorioOst: { tunic: '#f0ece0', mantle: '#c49634', hair: '#d0c8bc', beard: 'short', mitre: true, attr: 'baculo', look: -0.1 },
  blas: { tunic: '#f0ece0', mantle: '#9a2424', hair: '#c8c0b4', beard: 'long', mitre: true, attr: 'baculo', look: 0.2 },
  roque: { tunic: '#6a5a3a', mantle: '#7a2a24', hair: '#5a3a24', beard: 'short', attr: 'bordon', look: 0.25, dog: true, shells: true },
  lucia: { female: true, tunic: '#2c4a7a', mantle: '#a8281f', attr: 'plato' },
  barbara: { female: true, tunic: '#7a2a40', mantle: '#c49634', attr: 'torre' },
  ana: { female: true, old: true, tunic: '#8a3a2a', mantle: '#3a6a48', attr: 'libro' },
};
// the four Latin Doctors, for the predella: Augustine and Ambrose in their mitres, Jerome in his red hat, Gregory in the tiara
const DOCTORS = {
  agustin: { robe: '#2c2a36', cope: '#c8a040', hat: 'mitra', hair: '#5a4632', beard: 'short', attr: 'corazon' },
  ambrosio: { robe: '#f0ece0', cope: '#a82a26', hat: 'mitra', hair: '#c8c0b2', beard: 'short', attr: 'libro' },
  jeronimo: { robe: '#a01e1c', cope: '#a01e1c', hat: 'capelo', hair: '#e0dad0', beard: 'long', attr: 'libro' },
  gregorio: { robe: '#f0ece0', cope: '#c8a040', hat: 'tiara', hair: '#d0c8bc', beard: null, attr: 'paloma' },
};

// ---------------------------------------------------------------- colour helpers
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb(a, k = 1, add = 0) { return `rgb(${clamp(a[0] * k + add, 0, 255) | 0},${clamp(a[1] * k + add, 0, 255) | 0},${clamp(a[2] * k + add, 0, 255) | 0})`; }
function rgba(a, al, k = 1, add = 0) { return `rgba(${clamp(a[0] * k + add, 0, 255) | 0},${clamp(a[1] * k + add, 0, 255) | 0},${clamp(a[2] * k + add, 0, 255) | 0},${al})`; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const SKIN = [226, 182, 146], SKIN_DARK = [150, 98, 68];

class Painter {
  constructor(x, w, h, r) { this.x = x; this.W = w; this.H = h; this.r = r; this.light = [-0.75, -0.65]; }
  // ------------------------------------------------------------ primitives
  path(pts, close = true) { const x = this.x; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); if (close) x.closePath(); }
  // a smooth closed shape through points (Catmull-Rom → Bézier)
  smooth(pts, close = true) {
    const x = this.x, n = pts.length;
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < (close ? n : n - 1); i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const q0 = !close && i === 0 ? p1 : p0, q3 = !close && i + 2 >= n ? p2 : p3;
      x.bezierCurveTo(p1[0] + (p2[0] - q0[0]) / 6, p1[1] + (p2[1] - q0[1]) / 6, p2[0] - (q3[0] - p1[0]) / 6, p2[1] - (q3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (close) x.closePath();
  }
  // a soft line: drawn wide and faint, then narrow and stronger (a brush, not a pen)
  soft(draw, color, width, alpha) {
    const x = this.x;
    for (const [wk, ak] of [[2.6, 0.25], [1.6, 0.45], [1, 1]]) { x.strokeStyle = color.replace('A', alpha * ak); x.lineWidth = width * wk; draw(); x.stroke(); }
  }
  // fill the current shape with a light-to-shadow gradient across its box (the light from the upper left)
  shade(col, x0, y0, x1, y1, lit = 1.25, dark = 0.5) {
    const x = this.x, g = x.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgb(col, lit)); g.addColorStop(0.45, rgb(col, 1)); g.addColorStop(1, rgb(col, dark));
    x.fillStyle = g; x.fill();
  }
  // brush texture inside the current clip: short strokes along a direction
  strokes(x0, y0, x1, y1, col, n, len, ang, al = 0.08, k0 = 0.7, k1 = 1.3) {
    const x = this.x, r = this.r;
    x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = x0 + r() * (x1 - x0), py = y0 + r() * (y1 - y0), a = ang + (r() - 0.5) * 0.5, l = len * (0.5 + r());
      x.strokeStyle = rgba(col, al * (0.5 + r()), k0 + r() * (k1 - k0)); x.lineWidth = 0.8 + r() * 2.2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
  }
  // a fold: a dark crease with its lit edge on the side of the light
  fold(pts, base, w = 3, depth = 0.4) {
    const x = this.x, s = this.H / 432;
    this.soft(() => this.smooth(pts, false), rgba(base, 'A', 0.32), w * s, depth);
    const off = pts.map(([px, py]) => [px - 2.2 * s, py - 0.8 * s]);
    this.soft(() => this.smooth(off, false), rgba(base, 'A', 1.55, 18), w * 0.6 * s, depth * 0.55);
  }
  // ------------------------------------------------------------ grounds
  ground({ glow = 0.55, sky = false, horizon = 0.82, tone = [64, 46, 30] } = {}) {
    const x = this.x, W = this.W, H = this.H, r = this.r;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(tone, 0.55)); g.addColorStop(0.6, rgb(tone, 0.9)); g.addColorStop(1, rgb(tone, 0.45));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // the light behind the figure (a glory, or the evening sky)
    const lg = x.createRadialGradient(W * 0.46, H * 0.3, H * 0.02, W * 0.5, H * 0.38, H * 0.62);
    lg.addColorStop(0, rgba(sky ? [250, 222, 160] : [214, 172, 112], glow)); lg.addColorStop(0.5, rgba(sky ? [196, 150, 96] : [150, 110, 66], glow * 0.45)); lg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lg; x.fillRect(0, 0, W, H);
    // clouds: soft lumps in the light
    for (let i = 0; i < 18; i++) {
      const cx = r() * W, cy = H * (0.05 + r() * 0.6), rr = H * (0.04 + r() * 0.07);
      const cg = x.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, 1, cx, cy, rr);
      cg.addColorStop(0, `rgba(240,214,170,${0.05 + r() * 0.08})`); cg.addColorStop(1, 'rgba(240,214,170,0)');
      x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, rr, 0, 6.283); x.fill();
    }
    // far landscape and the ground he stands on
    const hy = H * horizon;
    x.fillStyle = rgb(tone, 0.62); this.smooth([[0, hy], [W * 0.2, hy - H * 0.015], [W * 0.45, hy + H * 0.005], [W * 0.75, hy - H * 0.02], [W, hy], [W, H], [0, H]]); x.fill();
    const sg = x.createLinearGradient(0, hy - 4, 0, hy + 10); sg.addColorStop(0, 'rgba(255,220,160,0.28)'); sg.addColorStop(1, 'rgba(255,220,160,0)');
    x.fillStyle = sg; x.fillRect(0, hy - 4, W, 14);
    this.strokes(0, hy, W, H, tone, 160, H * 0.02, 0, 0.12, 0.4, 1.0);
  }
  // ------------------------------------------------------------ a head (cx, cy: its middle; s: its height)
  head(cx, cy, s, o = {}) {
    const x = this.x, r = this.r, tilt = o.tilt || 0, rx = s * 0.36, ry = s * 0.5;
    x.save(); x.translate(cx, cy); x.rotate(tilt);
    // hair at the back (long for the young, a fringe on the bald)
    const hair = hex(o.hair || '#4a3020');
    if (o.young || o.long) { x.fillStyle = rgb(hair, 0.85); this.smooth([[-rx * 1.15, -ry * 0.2], [-rx * 1.25, ry * 0.75], [-rx * 0.6, ry * 1.1], [rx * 0.7, ry * 1.05], [rx * 1.2, ry * 0.7], [rx * 1.1, -ry * 0.3], [0, -ry * 1.12]]); x.fill(); }
    // the face: skin lit from the left
    this.smooth([[0, -ry], [rx * 0.85, -ry * 0.6], [rx, 0], [rx * 0.8, ry * 0.6], [rx * 0.3, ry * 0.98], [-rx * 0.3, ry * 0.98], [-rx * 0.8, ry * 0.6], [-rx, 0], [-rx * 0.85, -ry * 0.6]]);
    const sk = o.skin || (o.old ? mix(SKIN, [210, 170, 140], 0.4) : SKIN);
    const g = x.createRadialGradient(-rx * 0.4, -ry * 0.2, s * 0.05, 0, 0, s * 0.62);
    g.addColorStop(0, rgb(sk, 1.12)); g.addColorStop(0.55, rgb(sk, 0.92)); g.addColorStop(1, rgb(SKIN_DARK, 0.75));
    x.fillStyle = g; x.fill();
    // the shadow side of the face, the eye sockets, the nose, the mouth
    x.fillStyle = 'rgba(80,40,25,0.22)'; this.smooth([[rx * 0.15, -ry * 0.7], [rx * 0.9, -ry * 0.4], [rx * 0.95, ry * 0.4], [rx * 0.4, ry * 0.95], [rx * 0.25, ry * 0.2]]); x.fill();
    const ey = -ry * 0.08, ex = rx * 0.42;
    for (const sx of [-1, 1]) {
      x.fillStyle = 'rgba(70,35,20,0.32)'; x.beginPath(); x.ellipse(sx * ex, ey - s * 0.01, rx * 0.3, ry * 0.12, 0, 0, 6.283); x.fill();
      x.fillStyle = 'rgba(30,18,12,0.85)'; x.beginPath(); x.ellipse(sx * ex + (o.lookX || 0) * rx * 0.08, ey + (o.down ? s * 0.012 : 0), rx * 0.11, ry * (o.down ? 0.035 : 0.055), 0, 0, 6.283); x.fill();
      x.strokeStyle = rgba(hair, 0.7, 0.7); x.lineWidth = Math.max(1, s * 0.035); x.beginPath(); x.moveTo(sx * ex - rx * 0.25, ey - ry * 0.2 - (o.sorrow ? sx * s * 0.02 : 0)); x.quadraticCurveTo(sx * ex, ey - ry * 0.3, sx * ex + rx * 0.27, ey - ry * 0.18 + (o.sorrow ? sx * s * 0.02 : 0)); x.stroke(); // brows
    }
    x.strokeStyle = 'rgba(90,45,28,0.55)'; x.lineWidth = Math.max(1, s * 0.03); x.beginPath(); x.moveTo(rx * 0.05, ey + ry * 0.05); x.quadraticCurveTo(rx * 0.16, ry * 0.32, rx * 0.02, ry * 0.36); x.stroke();
    x.fillStyle = 'rgba(255,235,210,0.35)'; x.beginPath(); x.ellipse(-rx * 0.06, ry * 0.18, rx * 0.06, ry * 0.15, 0, 0, 6.283); x.fill(); // light on the nose
    x.fillStyle = 'rgba(120,40,35,0.6)'; x.beginPath(); x.ellipse(0, ry * 0.58, rx * 0.22, ry * 0.05, 0, 0, 6.283); x.fill(); // lips
    x.fillStyle = 'rgba(200,90,80,0.18)'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(sx * rx * 0.55, ry * 0.3, rx * 0.22, 0, 6.283); x.fill(); } // cheeks
    // beard
    if (o.beard) {
      const L = o.beard === 'long' ? 1.0 : 0.55;
      x.fillStyle = rgb(hair, 0.95);
      this.smooth([[-rx * 0.95, ry * 0.05], [-rx * 0.85, ry * 0.6], [-rx * 0.4, ry * (1.0 + L * 0.7)], [0, ry * (1.1 + L * 0.85)], [rx * 0.45, ry * (1.0 + L * 0.65)], [rx * 0.9, ry * 0.55], [rx * 0.95, ry * 0.05], [rx * 0.55, ry * 0.4], [rx * 0.2, ry * 0.48], [0, ry * 0.7], [-rx * 0.2, ry * 0.48], [-rx * 0.55, ry * 0.4]]);
      x.fill();
      this.strokes(-rx, ry * 0.3, rx, ry * (1 + L), hair, 26, s * 0.12, Math.PI / 2, 0.35, 0.6, 1.5);
      x.fillStyle = 'rgba(110,40,30,0.55)'; x.beginPath(); x.ellipse(0, ry * 0.62, rx * 0.18, ry * 0.04, 0, 0, 6.283); x.fill();
    }
    // hair on top: the bald crown with its fringe, or a full head of hair
    x.fillStyle = rgb(hair, 1);
    if (o.bald) { this.smooth([[-rx * 1.02, -ry * 0.05], [-rx * 0.95, -ry * 0.55], [-rx * 0.7, -ry * 0.7], [-rx * 0.6, -ry * 0.35], [-rx * 0.8, ry * 0.1]]); x.fill(); this.smooth([[rx * 1.02, -ry * 0.05], [rx * 0.95, -ry * 0.55], [rx * 0.7, -ry * 0.7], [rx * 0.6, -ry * 0.35], [rx * 0.8, ry * 0.1]]); x.fill(); if (o.tuft !== false) { x.beginPath(); x.ellipse(-rx * 0.1, -ry * 0.88, rx * 0.25, ry * 0.08, 0, 0, 6.283); x.fill(); } }
    else if (!o.covered) { this.smooth([[-rx * 1.05, ry * 0.05], [-rx * 1.1, -ry * 0.6], [-rx * 0.5, -ry * 1.1], [rx * 0.4, -ry * 1.12], [rx * 1.08, -ry * 0.6], [rx * 1.02, ry * 0.05], [rx * 0.8, -ry * 0.45], [rx * 0.2, -ry * 0.62], [-rx * 0.5, -ry * 0.55], [-rx * 0.85, -ry * 0.3]]); x.fill(); this.strokes(-rx, -ry, rx, -ry * 0.3, hair, 18, s * 0.2, Math.PI * 0.35, 0.3, 0.7, 1.5); }
    // the light on the forehead
    x.fillStyle = 'rgba(255,240,220,0.18)'; x.beginPath(); x.ellipse(-rx * 0.3, -ry * 0.42, rx * 0.35, ry * 0.16, -0.3, 0, 6.283); x.fill();
    x.restore();
  }
  halo(cx, cy, rr, rays = false) {
    const x = this.x;
    const g = x.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr * 1.35);
    g.addColorStop(0, 'rgba(255,236,170,0.55)'); g.addColorStop(0.6, 'rgba(255,214,120,0.25)'); g.addColorStop(1, 'rgba(255,214,120,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr * 1.35, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(255,224,140,0.85)'; x.lineWidth = Math.max(1, rr * 0.05); x.beginPath(); x.arc(cx, cy, rr, 0, 6.283); x.stroke();
    if (rays) { x.strokeStyle = 'rgba(255,230,160,0.35)'; x.lineWidth = 1; for (let i = 0; i < 36; i++) { const a = (i / 36) * 6.283; x.beginPath(); x.moveTo(cx + Math.cos(a) * rr * 1.05, cy + Math.sin(a) * rr * 1.05); x.lineTo(cx + Math.cos(a) * rr * (1.5 + (i % 2) * 0.4), cy + Math.sin(a) * rr * (1.5 + (i % 2) * 0.4)); x.stroke(); } }
  }
  hand(cx, cy, s, ang = 0, open = false) {
    const x = this.x;
    x.save(); x.translate(cx, cy); x.rotate(ang);
    const g = x.createRadialGradient(-s * 0.2, -s * 0.2, 1, 0, 0, s);
    g.addColorStop(0, rgb(SKIN, 1.1)); g.addColorStop(1, rgb(SKIN_DARK, 0.85));
    x.fillStyle = g;
    this.smooth([[-s * 0.5, -s * 0.3], [s * 0.25, -s * 0.45], [s * (open ? 0.95 : 0.6), -s * 0.2], [s * (open ? 0.98 : 0.62), s * 0.18], [s * 0.2, s * 0.42], [-s * 0.5, s * 0.3]]); x.fill();
    x.strokeStyle = 'rgba(110,60,40,0.5)'; x.lineWidth = Math.max(0.6, s * 0.06);
    for (let i = 0; i < 3; i++) { const yy = -s * 0.15 + i * s * 0.15; x.beginPath(); x.moveTo(s * 0.1, yy); x.lineTo(s * (open ? 0.85 : 0.55), yy + s * 0.03); x.stroke(); }
    x.restore();
  }
  // ------------------------------------------------------------ drapery
  // a fold as the light finds it: a soft shadow band along a curve and, on the side of the light, its lit ridge
  band(pts, base, w, depth = 0.5) {
    const x = this.x, s = this.H / 432;
    for (const [k, a] of [[3.2, 0.12], [2.0, 0.22], [1.0, 0.32]]) { x.strokeStyle = rgba(base, a * depth * 2, 0.3); x.lineWidth = w * k * s; this.smooth(pts, false); x.stroke(); }
    const lit = pts.map(([px, py]) => [px - w * 1.6 * s, py - w * 0.5 * s]);
    for (const [k, a] of [[2.0, 0.1], [0.9, 0.22]]) { x.strokeStyle = rgba(base, a * depth * 2, 1.6, 22); x.lineWidth = w * k * s; this.smooth(lit, false); x.stroke(); }
  }
  // a hem that breaks where the folds meet it
  hemLine(x0, x1, y, n, amp) { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t, y + (i % 2 ? amp : -amp * 0.4) * (0.6 + this.r() * 0.8)]); } return pts; }
  // ------------------------------------------------------------ a standing saint
  apostle(A) {
    const x = this.x, W = this.W, H = this.H, r = this.r, s = H / 432;
    this.ground({ glow: 0.5 });
    const tunic = hex(A.tunic), mantle = hex(A.mantle), lining = mix(hex(A.tunic), [40, 30, 20], 0.35);
    const lean = (A.look || 0) * 0.06; // the weight on one leg: the body sways
    const cx = W * 0.5 + (r() - 0.5) * W * 0.03, top = H * 0.1, hs = H * 0.104;
    const X = (u, v) => cx + u * W + (v - 0.5) * lean * W * -1.2; // (u across, v down the figure 0..1)
    const neck = top + hs * 0.95, sh = top + hs * 1.25, waist = H * 0.45, hem = H * 0.875;
    const hx = X(0, 0.15) + (A.look || 0) * W * 0.02;
    this.halo(hx, top + hs * 0.45, hs * 0.75, true);
    this.attribute(A.attr, cx, sh, waist, hem, s, true);
    // the tunic: shoulders to the feet, the hem breaking over the feet
    const hemPts = this.hemLine(X(-0.2, 1), X(0.21, 1), hem, 8, H * 0.006);
    const tunicPts = [[hx, neck], [X(-0.085, 0.18), sh], [X(-0.165, 0.25), sh + hs * 0.2], [X(-0.185, 0.5), waist], [X(-0.205, 0.85), hem - H * 0.05], ...hemPts, [X(0.21, 0.85), hem - H * 0.05], [X(0.18, 0.5), waist], [X(0.165, 0.25), sh + hs * 0.2], [X(0.085, 0.18), sh]];
    this.smooth(tunicPts);
    x.save(); x.clip();
    x.fillStyle = rgb(tunic); x.fillRect(0, 0, W, H);
    const tg = x.createLinearGradient(X(-0.22, 0.5), 0, X(0.22, 0.5), 0); tg.addColorStop(0, 'rgba(255,240,210,0.3)'); tg.addColorStop(0.45, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(10,5,0,0.5)');
    x.fillStyle = tg; x.fillRect(0, 0, W, H);
    this.strokes(cx - W * 0.22, sh, cx + W * 0.22, hem, tunic, 120, H * 0.05, Math.PI / 2, 0.09, 0.7, 1.3);
    // long folds from the girdle to the hem, ending in its breaks
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5, fx = X(-0.17 + t * 0.34, 0.75); this.band([[fx + (r() - 0.5) * 4 * s, waist + H * 0.02], [fx - W * 0.012, waist + H * 0.2], [hemPts[1 + i + (i > 2 ? 1 : 0)][0], hem - H * 0.004]], tunic, 2.6 + r() * 1.6, 0.42); }
    x.fillStyle = 'rgba(20,10,4,0.28)'; x.fillRect(0, waist - H * 0.008, W, H * 0.012); // the girdle's shadow
    x.restore();
    for (const sx of [-1, 1]) { x.fillStyle = rgb(SKIN, 0.85); x.beginPath(); x.ellipse(X(sx * 0.07, 1), hem + H * 0.007, W * 0.034, H * 0.008, 0, 0, 6.283); x.fill(); x.fillStyle = 'rgba(30,20,10,0.35)'; x.beginPath(); x.ellipse(X(sx * 0.07, 1) + W * 0.01, hem + H * 0.014, W * 0.04, H * 0.004, 0, 0, 6.283); x.fill(); }
    // the mantle: hung from the left shoulder, down that side to below the knee, and brought round the body in a swag
    // to the right hand, which gathers it at the hip
    const G = [X(0.15, 0.55), waist + H * 0.02]; // where it is gathered
    const mantlePts = [[X(-0.05, 0.16), sh - hs * 0.06], [X(-0.19, 0.2), sh + hs * 0.25], [X(-0.235, 0.5), waist + H * 0.06], [X(-0.24, 0.8), hem - H * 0.11], [X(-0.2, 0.86), hem - H * 0.065], [X(-0.09, 0.84), hem - H * 0.1], [X(0.05, 0.78), hem - H * 0.17], [X(0.17, 0.66), waist + H * 0.16], [G[0] + W * 0.03, G[1] + H * 0.03], [G[0], G[1] - H * 0.02], [X(0.05, 0.42), waist - H * 0.03], [X(-0.06, 0.32), sh + hs * 0.8], [X(-0.07, 0.22), sh + hs * 0.25]];
    this.smooth(mantlePts);
    x.save(); x.clip();
    x.fillStyle = rgb(mantle); x.fillRect(0, 0, W, H);
    const mg = x.createLinearGradient(X(-0.25, 0.3), sh, X(0.2, 0.8), hem); mg.addColorStop(0, 'rgba(255,244,214,0.36)'); mg.addColorStop(0.4, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(15,6,0,0.55)');
    x.fillStyle = mg; x.fillRect(0, 0, W, H);
    this.strokes(cx - W * 0.25, sh, cx + W * 0.25, hem, mantle, 150, H * 0.045, Math.PI * 0.3, 0.1, 0.7, 1.35);
    // the hanging part: long folds from the shoulder
    this.band([[X(-0.12, 0.2), sh + hs * 0.35], [X(-0.17, 0.45), waist - H * 0.02], [X(-0.2, 0.75), hem - H * 0.13]], mantle, 4.2, 0.55);
    this.band([[X(-0.08, 0.22), sh + hs * 0.6], [X(-0.12, 0.5), waist + H * 0.04], [X(-0.13, 0.78), hem - H * 0.12]], mantle, 3.2, 0.45);
    // the swag: folds that sag from the left side to the gathering hand, each a different depth
    for (const [y0, sag, w] of [[waist + H * 0.05, 0.05, 4.5], [waist + H * 0.12, 0.09, 3.6], [waist + H * 0.2, 0.12, 3.0]]) {
      const a = [X(-0.21, 0.6), y0], m = [X(-0.02, 0.7), y0 + H * sag], e = [G[0] - W * 0.01, G[1] + H * 0.01];
      this.band([a, m, e], mantle, w + r() * 1.2, 0.55);
    }
    // where the hand gathers it: tight folds radiating out
    for (let i = 0; i < 4; i++) { const ang = Math.PI * (0.55 + i * 0.12); this.band([[G[0], G[1]], [G[0] + Math.cos(ang) * W * 0.06, G[1] + Math.sin(ang) * H * 0.04]], mantle, 2.2, 0.5); }
    x.restore();
    // the turned edge shows the lining, and a band of gold along it
    const edge = mantlePts.slice(4, 9);
    x.strokeStyle = rgba(lining, 0.85); x.lineWidth = 4 * s; this.smooth(edge, false); x.stroke();
    x.strokeStyle = 'rgba(232,196,110,0.8)'; x.lineWidth = 1.6 * s; this.smooth(edge.map(([a, b]) => [a, b - 2.5 * s]), false); x.stroke();
    x.strokeStyle = 'rgba(232,196,110,0.55)'; x.lineWidth = 1.4 * s; this.smooth(mantlePts.slice(9, 13), false); x.stroke();
    if (A.shells) for (let i = 0; i < 3; i++) this.shell(X(-0.17 + i * 0.04, 0.3), sh + hs * (0.5 + i * 0.6), 6 * s);
    // the neck, the head
    x.fillStyle = rgb(SKIN, 0.78); x.fillRect(hx - W * 0.028, neck - hs * 0.15, W * 0.056, hs * 0.35);
    this.head(hx, top + hs * 0.45, hs, { hair: A.hair, beard: A.beard, bald: A.bald || A.tonsure, tuft: !A.tonsure, young: A.young, covered: A.mitre, tilt: (A.look || 0) * 0.25, lookX: A.look > 0 ? 1 : -1, old: !A.young && A.hair && hex(A.hair)[0] > 180 });
    if (A.mitre) this.mitre(hx, top + hs * 0.45, hs);
    if (A.cord) { x.strokeStyle = 'rgba(236,226,200,0.9)'; x.lineWidth = 2.2 * s; x.beginPath(); x.moveTo(X(-0.18, 0.45), waist); x.lineTo(X(0.18, 0.45), waist); x.moveTo(X(0.06, 0.5), waist); x.lineTo(X(0.08, 0.7), waist + H * 0.2); x.stroke(); }
    if (A.dog) this.dog(X(-0.3, 1), hem - H * 0.02, H * 0.08);
    this.attribute(A.attr, cx, sh, waist, hem, s, false);
    this.soften(0.7);
  }
  // the edges of the paint, soft as a brush leaves them
  soften(px = 0.6) {
    const x = this.x, c = x.canvas;
    if (!('filter' in x)) return;
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const tx = t.getContext('2d'); tx.filter = `blur(${px}px)`; tx.drawImage(c, 0, 0);
    x.globalAlpha = 0.75; x.drawImage(t, 0, 0); x.globalAlpha = 1;
  }
  mitre(cx, cy, hs) {
    const x = this.x;
    x.fillStyle = '#f2ecd8'; this.path([[cx - hs * 0.36, cy - hs * 0.3], [cx - hs * 0.3, cy - hs * 0.88], [cx, cy - hs * 1.18], [cx + hs * 0.3, cy - hs * 0.88], [cx + hs * 0.36, cy - hs * 0.3]]); x.fill();
    x.fillStyle = 'rgba(214,170,70,0.95)'; x.fillRect(cx - hs * 0.05, cy - hs * 1.1, hs * 0.1, hs * 0.78); x.fillRect(cx - hs * 0.36, cy - hs * 0.4, hs * 0.72, hs * 0.09);
  }
  dog(cx, cy, s) { // San Roque's dog, with the bread in its mouth
    const x = this.x;
    x.fillStyle = '#8a6a48'; x.beginPath(); x.ellipse(cx, cy, s * 0.55, s * 0.28, 0, 0, 6.283); x.fill();
    x.beginPath(); x.ellipse(cx + s * 0.55, cy - s * 0.25, s * 0.22, s * 0.18, 0.3, 0, 6.283); x.fill();
    x.fillStyle = '#6a4a30'; for (const dx of [-0.35, -0.15, 0.25, 0.4]) x.fillRect(cx + dx * s, cy + s * 0.15, s * 0.08, s * 0.3);
    x.fillStyle = '#d8b880'; x.beginPath(); x.arc(cx + s * 0.78, cy - s * 0.2, s * 0.09, 0, 6.283); x.fill();
  }
  saint(S) {
    if (!S.female) return this.apostle(S);
    const x = this.x, W = this.W, H = this.H, s = H / 432;
    this.ground({ glow: 0.5 });
    if (S.attr === 'torre') { x.fillStyle = '#8a7a64'; x.fillRect(W * 0.72, H * 0.42, W * 0.16, H * 0.45); x.fillStyle = '#2a2018'; for (const [a, b] of [[0.77, 0.5], [0.77, 0.62]]) x.fillRect(W * a, H * b, W * 0.05, H * 0.06); x.fillStyle = '#7a6a54'; this.path([[W * 0.71, H * 0.42], [W * 0.8, H * 0.34], [W * 0.89, H * 0.42]]); x.fill(); }
    this.figureStanding(W * 0.48, H * 0.11, H * 0.77, { tunic: S.tunic, mantle: S.mantle, veil: !!S.old, hair: '#5a3418', young: !S.old, look: S.old ? 0.2 : -0.2, hands: 'joined' });
    if (S.attr === 'plato') { x.fillStyle = 'rgba(214,170,70,0.95)'; x.beginPath(); x.ellipse(W * 0.66, H * 0.44, W * 0.07, H * 0.015, 0, 0, 6.283); x.fill(); x.fillStyle = '#fff'; for (const dx of [-0.02, 0.02]) { x.beginPath(); x.arc(W * (0.66 + dx), H * 0.432, 2.6 * s, 0, 6.283); x.fill(); } x.fillStyle = '#2a3a5a'; for (const dx of [-0.02, 0.02]) { x.beginPath(); x.arc(W * (0.66 + dx), H * 0.432, 1.2 * s, 0, 6.283); x.fill(); } }
    if (S.attr === 'plato' || S.attr === 'torre') { x.strokeStyle = 'rgba(70,120,50,0.9)'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(W * 0.4, H * 0.42); x.quadraticCurveTo(W * 0.3, H * 0.3, W * 0.33, H * 0.18); x.stroke(); for (let i = 0; i < 9; i++) { const t = i / 9, px = W * (0.4 - 0.08 * t), py = H * (0.42 - 0.22 * t); x.beginPath(); x.moveTo(px, py); x.lineTo(px - W * 0.03, py - H * 0.01); x.moveTo(px, py); x.lineTo(px + W * 0.02, py - H * 0.015); x.stroke(); } }
    if (S.attr === 'libro') this.book(W * 0.5, H * 0.42, 34 * s, 0.1, true);
    this.soften(0.6);
  }
  shell(cx, cy, s) {
    const x = this.x;
    x.fillStyle = 'rgba(240,226,196,0.9)'; x.beginPath(); x.moveTo(cx, cy + s); for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s * 0.9); } x.closePath(); x.fill();
    x.strokeStyle = 'rgba(120,90,60,0.6)'; x.lineWidth = 0.7; for (let i = 1; i < 6; i++) { const a = Math.PI + (i / 6) * Math.PI; x.beginPath(); x.moveTo(cx, cy + s * 0.9); x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s * 0.9); x.stroke(); }
  }
  // what each apostle holds; drawn in two passes (behind him: back = true; in his hands: back = false)
  attribute(kind, cx, sh, waist, hem, s, back) {
    const x = this.x, W = this.W, H = this.H;
    const hR = [cx + W * 0.14, waist - H * 0.07], hL = [cx - W * 0.12, waist + H * 0.02]; // where the hands are
    const iron = (pts, w = 3) => { this.soft(() => this.path(pts, false), 'rgba(40,40,46,A)', w * s, 0.9); this.soft(() => this.path(pts.map(([a, b]) => [a - 1, b - 1]), false), 'rgba(220,224,232,A)', w * 0.35 * s, 0.7); };
    const wood = (pts, w = 4) => { this.soft(() => this.path(pts, false), 'rgba(92,60,34,A)', w * s, 0.95); this.soft(() => this.path(pts.map(([a, b]) => [a - 1, b]), false), 'rgba(170,130,90,A)', w * 0.35 * s, 0.6); };
    const gold = (pts, w = 3) => { this.soft(() => this.path(pts, false), 'rgba(170,120,40,A)', w * s, 0.95); this.soft(() => this.path(pts.map(([a, b]) => [a - 1, b - 1]), false), 'rgba(255,230,150,A)', w * 0.4 * s, 0.8); };
    if (back) {
      if (kind === 'aspa') { wood([[cx - W * 0.34, sh - H * 0.06], [cx + W * 0.34, hem - H * 0.02]], 9); wood([[cx + W * 0.34, sh - H * 0.06], [cx - W * 0.34, hem - H * 0.02]], 9); }
      else if (kind === 'bordon') { wood([[hR[0] + W * 0.04, sh - H * 0.08], [hR[0] + W * 0.06, hem + H * 0.01]], 4); x.fillStyle = 'rgba(200,150,80,0.95)'; x.beginPath(); x.ellipse(hR[0] + W * 0.05, sh - H * 0.03, W * 0.025, H * 0.022, 0, 0, 6.283); x.fill(); }
      else if (kind === 'lanza') { wood([[hR[0] + W * 0.03, sh - H * 0.14], [hR[0] + W * 0.05, hem + H * 0.01]], 3.4); iron([[hR[0] + W * 0.03, sh - H * 0.2], [hR[0] + W * 0.03, sh - H * 0.13]], 6); }
      else if (kind === 'cruz') { wood([[hR[0] + W * 0.03, sh - H * 0.16], [hR[0] + W * 0.05, hem + H * 0.01]], 3.6); wood([[hR[0] - W * 0.03, sh - H * 0.1], [hR[0] + W * 0.09, sh - H * 0.1]], 3.6); }
      else if (kind === 'alabarda') { wood([[hR[0] + W * 0.04, sh - H * 0.15], [hR[0] + W * 0.05, hem + H * 0.01]], 3.4); iron([[hR[0] + W * 0.04, sh - H * 0.21], [hR[0] + W * 0.04, sh - H * 0.12], [hR[0] + W * 0.11, sh - H * 0.14], [hR[0] + W * 0.04, sh - H * 0.17]], 4); }
      else if (kind === 'maza') { wood([[hR[0] + W * 0.02, waist - H * 0.03], [hR[0] + W * 0.06, sh - H * 0.08]], 5); x.fillStyle = 'rgba(110,74,44,0.95)'; x.beginPath(); x.ellipse(hR[0] + W * 0.065, sh - H * 0.1, W * 0.03, H * 0.035, 0.2, 0, 6.283); x.fill(); }
      else if (kind === 'baculo') { gold([[hR[0] + W * 0.04, sh - H * 0.1], [hR[0] + W * 0.05, hem + H * 0.01]], 3.2); x.strokeStyle = 'rgba(214,170,70,0.95)'; x.lineWidth = 3.4 * s; x.beginPath(); x.arc(hR[0] + W * 0.075, sh - H * 0.13, W * 0.035, Math.PI * 0.9, Math.PI * 2.6); x.stroke(); }
      else if (kind === 'aguijada') { wood([[hR[0] + W * 0.03, sh - H * 0.12], [hR[0] + W * 0.08, hem + H * 0.01]], 3); iron([[hR[0] + W * 0.03, sh - H * 0.15], [hR[0] + W * 0.03, sh - H * 0.11]], 3); }
      return;
    }
    // in the hands
    if (kind === 'llaves') {
      gold([[hR[0], hR[1]], [hR[0] + W * 0.02, hR[1] - H * 0.12]], 3.5); gold([[hR[0] + W * 0.015, hR[1]], [hR[0] + W * 0.05, hR[1] - H * 0.11]], 3);
      for (const [dx, dy] of [[0.02, -0.12], [0.05, -0.11]]) { x.strokeStyle = 'rgba(230,190,90,0.9)'; x.lineWidth = 2.4 * s; x.beginPath(); x.arc(hR[0] + W * dx, hR[1] + H * dy - 4 * s, 4.5 * s, 0, 6.283); x.stroke(); }
      this.hand(hR[0], hR[1], 9 * s, -0.6); this.hand(hL[0], hL[1], 9 * s, 0.4);
    } else if (kind === 'espada') {
      iron([[hR[0], hR[1] + H * 0.02], [hR[0] + W * 0.015, hem - H * 0.02]], 5); gold([[hR[0] - W * 0.04, hR[1] + H * 0.02], [hR[0] + W * 0.04, hR[1] + H * 0.02]], 3);
      this.hand(hR[0], hR[1], 9 * s, 1.3); this.book(hL[0] - W * 0.02, hL[1] - H * 0.03, 26 * s, 0.3);
    } else if (kind === 'caliz') {
      x.fillStyle = 'rgba(214,170,70,0.98)'; this.path([[hR[0] - W * 0.05, hR[1] - H * 0.06], [hR[0] + W * 0.03, hR[1] - H * 0.06], [hR[0] + W * 0.0, hR[1] - H * 0.025], [hR[0] - W * 0.02, hR[1] - H * 0.025]]); x.fill();
      gold([[hR[0] - W * 0.01, hR[1] - H * 0.025], [hR[0] - W * 0.01, hR[1] + H * 0.005]], 3); gold([[hR[0] - W * 0.04, hR[1] + H * 0.006], [hR[0] + W * 0.02, hR[1] + H * 0.006]], 3);
      x.fillStyle = 'rgba(255,240,190,0.6)'; x.beginPath(); x.ellipse(hR[0] - W * 0.025, hR[1] - H * 0.058, W * 0.03, H * 0.004, 0, 0, 6.283); x.fill();
      this.hand(hR[0] - W * 0.01, hR[1] + H * 0.01, 9 * s, 0.2); this.hand(hR[0] + W * 0.03, hR[1] - H * 0.01, 8 * s, 2.6);
    } else if (kind === 'libro') {
      this.book(hR[0] - W * 0.04, hR[1] - H * 0.02, 32 * s, -0.2, true); this.hand(hR[0] - W * 0.01, hR[1] + H * 0.02, 9 * s, -0.4);
      gold([[hL[0] + W * 0.02, hL[1] - H * 0.02], [hL[0] + W * 0.05, hL[1] - H * 0.07]], 1.5); this.hand(hL[0], hL[1], 8 * s, 0.6);
    } else if (kind === 'cuchillo') {
      iron([[hR[0], hR[1] + H * 0.01], [hR[0] + W * 0.08, hR[1] - H * 0.09]], 6); wood([[hR[0] - W * 0.02, hR[1] + H * 0.03], [hR[0], hR[1] + H * 0.01]], 5);
      this.hand(hR[0], hR[1] + H * 0.015, 9 * s, -0.8); this.book(hL[0] - W * 0.03, hL[1] - H * 0.02, 24 * s, 0.4);
    } else if (kind === 'sierra') {
      x.fillStyle = 'rgba(150,154,160,0.95)'; this.path([[hR[0], hR[1] - H * 0.015], [hR[0] + W * 0.02, hR[1] - H * 0.2], [hR[0] + W * 0.07, hR[1] - H * 0.2], [hR[0] + W * 0.045, hR[1] - H * 0.01]]); x.fill();
      x.strokeStyle = 'rgba(60,60,64,0.8)'; x.lineWidth = 1; for (let i = 0; i < 12; i++) { const yy = hR[1] - H * 0.02 - i * H * 0.015; x.beginPath(); x.moveTo(hR[0] + W * 0.045 + (i / 12) * W * 0.025, yy); x.lineTo(hR[0] + W * 0.06 + (i / 12) * W * 0.025, yy - H * 0.006); x.stroke(); }
      wood([[hR[0] - W * 0.01, hR[1]], [hR[0] + W * 0.025, hR[1] - H * 0.02]], 6); this.hand(hR[0], hR[1], 9 * s, -0.4); this.hand(hL[0], hL[1], 8 * s, 0.6);
    } else if (kind === 'aspa' || kind === 'bordon' || kind === 'lanza' || kind === 'cruz' || kind === 'alabarda') {
      this.hand(hR[0] + W * 0.04, hR[1] - H * 0.02, 9 * s, -1.3);
      if (kind === 'bordon' || kind === 'lanza') this.book(hL[0] - W * 0.03, hL[1] - H * 0.02, 24 * s, 0.4); else this.hand(hL[0], hL[1], 8 * s, 0.6);
    } else if (kind === 'maza') {
      this.hand(hR[0] + W * 0.02, waist - H * 0.04, 9 * s, -1.0); this.hand(hL[0], hL[1], 8 * s, 0.6);
    } else if (kind === 'baculo' || kind === 'aguijada') {
      this.hand(hR[0] + W * 0.045, hR[1] - H * 0.03, 9 * s, -1.3); this.book(hL[0] - W * 0.03, hL[1] - H * 0.02, 24 * s, 0.4);
    } else if (kind === 'nino') { // the Child sitting on the book in his arm, a lily in the other hand
      this.book(hL[0] + W * 0.04, sh + H * 0.1, 30 * s, 0.1);
      x.fillStyle = 'rgba(244,238,226,0.98)'; this.smooth([[hL[0] + W * 0.0, sh + H * 0.08], [hL[0] + W * 0.08, sh + H * 0.07], [hL[0] + W * 0.09, sh + H * 0.0], [hL[0] + W * 0.02, sh - H * 0.005]]); x.fill();
      this.head(hL[0] + W * 0.05, sh - H * 0.03, H * 0.045, { hair: '#c8904a', young: true });
      this.halo(hL[0] + W * 0.05, sh - H * 0.035, H * 0.032);
      x.strokeStyle = 'rgba(60,110,50,0.9)'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(hR[0], hR[1]); x.lineTo(hR[0] + W * 0.04, sh - H * 0.06); x.stroke();
      for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(248,246,240,0.95)'; x.beginPath(); x.ellipse(hR[0] + W * (0.03 + i * 0.008), sh - H * (0.04 + i * 0.03), W * 0.018, H * 0.012, 0.6, 0, 6.283); x.fill(); }
      this.hand(hR[0], hR[1], 9 * s, -0.8); this.hand(hL[0] + W * 0.02, sh + H * 0.11, 8 * s, 0.2);
    } else { this.hand(hR[0], hR[1], 9 * s, -0.5); this.hand(hL[0], hL[1], 8 * s, 0.5); }
  }
  book(cx, cy, w, ang = 0, open = false) {
    const x = this.x;
    x.save(); x.translate(cx, cy); x.rotate(ang);
    x.fillStyle = 'rgba(110,36,26,0.98)'; x.fillRect(-w * 0.5, -w * 0.35, w, w * 0.7);
    x.fillStyle = open ? 'rgba(236,226,200,0.98)' : 'rgba(220,206,170,0.9)';
    if (open) { x.fillRect(-w * 0.46, -w * 0.32, w * 0.44, w * 0.62); x.fillRect(w * 0.02, -w * 0.32, w * 0.44, w * 0.62); x.strokeStyle = 'rgba(60,40,30,0.5)'; x.lineWidth = 0.6; for (let i = 0; i < 6; i++) { const yy = -w * 0.24 + i * w * 0.09; x.beginPath(); x.moveTo(-w * 0.42, yy); x.lineTo(-w * 0.07, yy); x.moveTo(w * 0.06, yy); x.lineTo(w * 0.41, yy); x.stroke(); } }
    else { x.fillRect(-w * 0.46, w * 0.27, w * 0.92, w * 0.06); x.strokeStyle = 'rgba(220,180,90,0.8)'; x.lineWidth = 1; x.strokeRect(-w * 0.4, -w * 0.28, w * 0.8, w * 0.5); }
    x.restore();
  }
  // ------------------------------------------------------------ the Crucifixion, with Mary and John
  crucifixion() {
    const x = this.x, W = this.W, H = this.H, r = this.r, s = H / 432;
    // the sky gone dark at noon, a band of red light low down, Jerusalem far off
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16141a'); g.addColorStop(0.45, '#2c2630'); g.addColorStop(0.7, '#7a4a30'); g.addColorStop(0.78, '#3a2a20'); g.addColorStop(1, '#1e1610');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { const cx = r() * W, cy = H * (0.05 + r() * 0.55), rr = H * (0.05 + r() * 0.08), cg = x.createRadialGradient(cx, cy, 1, cx, cy, rr); cg.addColorStop(0, `rgba(${r() < 0.3 ? '150,110,90' : '60,54,62'},${0.18 + r() * 0.2})`); cg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, rr, 0, 6.283); x.fill(); }
    const lg = x.createRadialGradient(W * 0.5, H * 0.3, 4, W * 0.5, H * 0.3, H * 0.4); lg.addColorStop(0, 'rgba(230,200,150,0.35)'); lg.addColorStop(1, 'rgba(230,200,150,0)'); x.fillStyle = lg; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(40,30,26,0.9)';
    for (let i = 0; i < 12; i++) { const bx = W * (0.04 + i * 0.08) + r() * 6, bw = W * (0.03 + r() * 0.04), bh = H * (0.02 + r() * 0.05); x.fillRect(bx, H * 0.74 - bh, bw, bh + 2); if (r() < 0.3) { x.beginPath(); x.arc(bx + bw / 2, H * 0.74 - bh, bw / 2, Math.PI, 0); x.fill(); } }
    // Golgotha: the hill, a skull at the foot of the cross
    x.fillStyle = '#2a2018'; this.smooth([[0, H * 0.8], [W * 0.3, H * 0.76], [W * 0.5, H * 0.73], [W * 0.7, H * 0.76], [W, H * 0.8], [W, H], [0, H]]); x.fill();
    this.strokes(0, H * 0.76, W, H, [70, 54, 40], 140, H * 0.02, 0, 0.14, 0.6, 1.2);
    // the cross
    const cx = W * 0.5, ct = H * 0.06, cb = H * 0.8, ay = H * 0.22;
    for (const [pts, w] of [[[[cx, ct], [cx, cb]], 13], [[[cx - W * 0.3, ay], [cx + W * 0.3, ay]], 11]]) { this.soft(() => this.path(pts, false), 'rgba(58,38,22,A)', w * s, 1); this.soft(() => this.path(pts.map(([a, b]) => [a - 2 * s, b - 1]), false), 'rgba(150,110,70,A)', w * 0.25 * s, 0.6); }
    x.fillStyle = '#e8dcc0'; x.fillRect(cx - W * 0.05, ct + H * 0.015, W * 0.1, H * 0.03); x.fillStyle = '#3a2a1a'; x.font = `bold ${Math.round(9 * s)}px serif`; x.textAlign = 'center'; x.fillText('INRI', cx, ct + H * 0.038);
    x.fillStyle = '#d8d0c0'; x.beginPath(); x.ellipse(cx - W * 0.03, cb - H * 0.01, W * 0.022, H * 0.014, 0, 0, 6.283); x.fill(); x.fillStyle = '#2a2018'; x.beginPath(); x.arc(cx - W * 0.037, cb - H * 0.012, 1.6 * s, 0, 6.283); x.arc(cx - W * 0.022, cb - H * 0.012, 1.6 * s, 0, 6.283); x.fill();
    // Christ: pale against the dark, the arms stretched along the beam, the head fallen to his right
    const bx = cx, by = ay + H * 0.02;
    const skin = [232, 214, 190];
    const arm = (sx) => { this.soft(() => this.path([[bx + sx * W * 0.03, by + H * 0.01], [bx + sx * W * 0.16, by - H * 0.005], [bx + sx * W * 0.27, by - H * 0.012]], false), `rgba(${skin.join(',')},A)`, 9 * s, 1); this.soft(() => this.path([[bx + sx * W * 0.03, by + H * 0.016], [bx + sx * W * 0.27, by - H * 0.004]], false), 'rgba(120,90,70,A)', 3 * s, 0.4); };
    arm(-1); arm(1);
    x.fillStyle = rgb(skin, 1); this.smooth([[bx - W * 0.045, by], [bx + W * 0.045, by], [bx + W * 0.05, by + H * 0.08], [bx + W * 0.035, by + H * 0.17], [bx - W * 0.035, by + H * 0.17], [bx - W * 0.05, by + H * 0.08]]);
    const bg = x.createLinearGradient(bx - W * 0.05, 0, bx + W * 0.05, 0); bg.addColorStop(0, rgb(skin, 1.08)); bg.addColorStop(0.6, rgb(skin, 0.92)); bg.addColorStop(1, rgb(skin, 0.62)); x.fillStyle = bg; x.fill();
    x.strokeStyle = 'rgba(120,90,70,0.45)'; x.lineWidth = 1.2 * s; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(bx - W * 0.035, by + H * (0.03 + i * 0.018)); x.quadraticCurveTo(bx, by + H * (0.04 + i * 0.018), bx + W * 0.035, by + H * (0.03 + i * 0.018)); x.stroke(); } // the ribs
    x.fillStyle = '#f2ece0'; this.smooth([[bx - W * 0.05, by + H * 0.16], [bx + W * 0.055, by + H * 0.155], [bx + W * 0.07, by + H * 0.2], [bx + W * 0.02, by + H * 0.23], [bx - W * 0.04, by + H * 0.215]]); x.fill(); // the loincloth
    this.fold([[bx - W * 0.03, by + H * 0.17], [bx, by + H * 0.2], [bx + W * 0.04, by + H * 0.22]], [242, 236, 224], 2, 0.4);
    for (const sx of [-1, 0.6]) { this.soft(() => this.path([[bx + sx * W * 0.02, by + H * 0.22], [bx + sx * W * 0.015, by + H * 0.33], [bx, cb - H * 0.17]], false), `rgba(${skin.join(',')},A)`, 8 * s, 1); }
    x.fillStyle = 'rgba(150,20,20,0.75)'; for (const [hx, hy] of [[bx - W * 0.26, by - H * 0.012], [bx + W * 0.26, by - H * 0.012], [bx, cb - H * 0.17], [bx + W * 0.03, by + H * 0.07]]) { x.beginPath(); x.arc(hx, hy, 2.2 * s, 0, 6.283); x.fill(); }
    this.halo(bx + W * 0.02, by - H * 0.035, H * 0.04);
    this.head(bx + W * 0.02, by - H * 0.03, H * 0.065, { hair: '#3a2416', beard: 'short', tilt: 0.55, long: true, down: true, skin });
    x.strokeStyle = 'rgba(70,50,30,0.95)'; x.lineWidth = 2 * s; x.beginPath(); x.ellipse(bx + W * 0.012, by - H * 0.05, W * 0.035, H * 0.012, 0.5, 0, 6.283); x.stroke(); // the crown of thorns
    // Mary to his right (our left), in blue over red, her hands joined; John to his left in red over green, looking up
    this.figureStanding(W * 0.2, H * 0.42, H * 0.4, { tunic: '#7a2a40', mantle: '#28407a', veil: true, hands: 'joined', look: 0.4, sorrow: true });
    this.figureStanding(W * 0.8, H * 0.42, H * 0.4, { tunic: '#386a3e', mantle: '#a8281f', hair: '#7a4c26', young: true, hands: 'clasped', look: -0.5, up: true });
    this.soften(0.6);
  }
  // a draped standing figure (cx, top of the head y, height h): a tunic, and a mantle over the shoulder or over the head
  // and all round (the Virgin), open at the front; hands joined at the breast or clasped
  figureStanding(cx, y, h, o) {
    const x = this.x, s = this.H / 432, hs = h * 0.13, r = this.r;
    const tunic = hex(o.tunic), mantle = hex(o.mantle), lining = o.lining ? hex(o.lining) : mix(mantle, [255, 240, 200], 0.15);
    const sh = y + hs * 1.25, hem = y + h, sway = (o.look || 0) * h * 0.03;
    this.halo(cx + sway, y + hs * 0.5, hs * 0.72, !!o.rays);
    const hemPts = this.hemLine(cx - h * 0.16, cx + h * 0.17, hem, 7, h * 0.008);
    const body = [[cx + sway, y + hs * 0.95], [cx - h * 0.07, sh], [cx - h * 0.12, sh + h * 0.05], [cx - h * 0.14, y + h * 0.5], [cx - h * 0.16, hem - h * 0.05], ...hemPts, [cx + h * 0.17, hem - h * 0.05], [cx + h * 0.15, y + h * 0.5], [cx + h * 0.12, sh + h * 0.05], [cx + h * 0.07, sh]];
    this.smooth(body); x.save(); x.clip();
    x.fillStyle = rgb(tunic); x.fillRect(0, 0, this.W, this.H);
    const tg = x.createLinearGradient(cx - h * 0.18, 0, cx + h * 0.18, 0); tg.addColorStop(0, 'rgba(255,240,210,0.3)'); tg.addColorStop(0.5, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(10,5,0,0.45)'); x.fillStyle = tg; x.fillRect(0, 0, this.W, this.H);
    for (let i = 0; i < 4; i++) this.band([[cx - h * 0.08 + i * h * 0.055, y + h * 0.45], [cx - h * 0.09 + i * h * 0.06, y + h * 0.7], [hemPts[1 + i * 2][0], hem]], tunic, 2.2, 0.4);
    x.restore();
    // the mantle
    const m = o.veil
      ? [[cx + sway - hs * 0.5, y + hs * 0.05], [cx + sway, y - hs * 0.12], [cx + sway + hs * 0.52, y + hs * 0.08], [cx + h * 0.15, sh + h * 0.08], [cx + h * 0.19, y + h * 0.55], [cx + h * 0.2, hem - h * 0.03], [cx + h * 0.06, hem - h * 0.06], [cx + h * 0.055, y + h * 0.55], [cx + h * 0.03, sh + h * 0.12], [cx - h * 0.03, sh + h * 0.12], [cx - h * 0.06, y + h * 0.55], [cx - h * 0.07, hem - h * 0.05], [cx - h * 0.19, hem - h * 0.02], [cx - h * 0.19, y + h * 0.55], [cx - h * 0.15, sh + h * 0.08]]
      : [[cx - h * 0.06, sh - hs * 0.1], [cx - h * 0.15, sh + h * 0.06], [cx - h * 0.18, y + h * 0.5], [cx - h * 0.17, hem - h * 0.12], [cx - h * 0.04, hem - h * 0.16], [cx + h * 0.12, hem - h * 0.24], [cx + h * 0.15, y + h * 0.5], [cx + h * 0.06, y + h * 0.42], [cx - h * 0.04, sh + h * 0.15]];
    this.smooth(m); x.save(); x.clip();
    x.fillStyle = rgb(mantle); x.fillRect(0, 0, this.W, this.H);
    const mg = x.createLinearGradient(cx - h * 0.2, y, cx + h * 0.2, hem); mg.addColorStop(0, 'rgba(255,244,214,0.36)'); mg.addColorStop(0.45, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(15,6,0,0.55)'); x.fillStyle = mg; x.fillRect(0, 0, this.W, this.H);
    if (o.veil) { for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) this.band([[cx + sx * h * (0.08 + i * 0.03), sh + h * 0.1], [cx + sx * h * (0.1 + i * 0.03), y + h * 0.6], [cx + sx * h * (0.09 + i * 0.035), hem - h * 0.05]], mantle, 2.6 + r(), 0.5); }
    else { for (const [y0, sag] of [[y + h * 0.48, 0.05], [y + h * 0.58, 0.09], [y + h * 0.68, 0.12]]) this.band([[cx - h * 0.16, y0], [cx, y0 + h * sag], [cx + h * 0.12, y0 - h * 0.08]], mantle, 3, 0.5); this.band([[cx - h * 0.1, sh + h * 0.06], [cx - h * 0.14, y + h * 0.45], [cx - h * 0.15, hem - h * 0.14]], mantle, 3.2, 0.5); }
    x.restore();
    x.strokeStyle = rgba(lining, 0.75); x.lineWidth = 2.4 * s; this.smooth(o.veil ? m.slice(6, 12) : m.slice(3, 7), false); x.stroke();
    this.head(cx + sway, y + hs * 0.5, hs, { hair: o.hair || '#3a2416', young: o.young, covered: !!o.veil, tilt: (o.look || 0) * 0.3, lookX: o.look > 0 ? 1 : -1, down: !o.up, sorrow: o.sorrow });
    if (o.veil) { x.fillStyle = rgb(mantle, 1.12); this.smooth([[cx + sway - hs * 0.44, y + hs * 0.12], [cx + sway - hs * 0.22, y - hs * 0.06], [cx + sway + hs * 0.25, y - hs * 0.06], [cx + sway + hs * 0.46, y + hs * 0.14], [cx + sway + hs * 0.42, y + hs * 0.62], [cx + sway + hs * 0.33, y + hs * 0.1], [cx + sway - hs * 0.3, y + hs * 0.1], [cx + sway - hs * 0.4, y + hs * 0.62]]); x.fill(); x.fillStyle = 'rgba(245,240,228,0.9)'; this.smooth([[cx + sway - hs * 0.32, y + hs * 0.12], [cx + sway + hs * 0.32, y + hs * 0.12], [cx + sway + hs * 0.3, y + hs * 0.22], [cx + sway - hs * 0.3, y + hs * 0.22]]); x.fill(); }
    // the hands, joined at the breast (or clasped lower)
    const hy = o.hands === 'clasped' ? sh + h * 0.2 : sh + h * 0.12;
    this.hand(cx - h * 0.018 + sway * 0.5, hy, 7 * s * h / (this.H * 0.4), -1.25); this.hand(cx + h * 0.018 + sway * 0.5, hy, 7 * s * h / (this.H * 0.4), -1.9);
  }
  // ------------------------------------------------------------ a Doctor of the Church: a bust in a dark oval
  doctor(D) {
    const x = this.x, W = this.W, H = this.H, s = H / 432;
    const g = x.createRadialGradient(W * 0.42, H * 0.36, 4, W * 0.5, H * 0.5, H * 0.75); g.addColorStop(0, '#5e4630'); g.addColorStop(0.6, '#32241a'); g.addColorStop(1, '#140e08');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const cx = W * 0.5, hs = H * 0.22, hy = H * 0.42;
    const robe = hex(D.robe), cope = hex(D.cope);
    // the shoulders and the cope over them, its orphreys, the clasp
    const cp = [[cx - W * 0.46, H], [cx - W * 0.43, H * 0.8], [cx - W * 0.3, H * 0.66], [cx - W * 0.1, H * 0.6], [cx + W * 0.1, H * 0.6], [cx + W * 0.3, H * 0.66], [cx + W * 0.43, H * 0.8], [cx + W * 0.46, H]];
    this.smooth(cp); this.shade(cope, cx - W * 0.45, H * 0.6, cx + W * 0.45, H, 1.3, 0.45);
    x.save(); this.smooth(cp); x.clip(); for (let i = 0; i < 4; i++) this.band([[cx - W * (0.36 - i * 0.04), H * 0.72], [cx - W * (0.38 - i * 0.05), H]], cope, 3, 0.5); for (let i = 0; i < 4; i++) this.band([[cx + W * (0.26 + i * 0.05), H * 0.7], [cx + W * (0.3 + i * 0.05), H]], cope, 3, 0.5); x.restore();
    this.smooth([[cx - W * 0.12, H], [cx - W * 0.1, H * 0.62], [cx + W * 0.1, H * 0.62], [cx + W * 0.12, H]]); this.shade(robe, cx - W * 0.12, 0, cx + W * 0.12, 0);
    x.fillStyle = 'rgba(236,200,110,0.9)'; for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(cx + sx * W * 0.12, H * 0.62); x.lineTo(cx + sx * W * 0.2, H); x.lineTo(cx + sx * W * 0.14, H); x.lineTo(cx + sx * W * 0.08, H * 0.63); x.fill(); }
    x.fillStyle = '#e0b850'; x.beginPath(); x.ellipse(cx, H * 0.7, W * 0.05, H * 0.03, 0, 0, 6.283); x.fill(); x.fillStyle = '#a82030'; x.beginPath(); x.arc(cx, H * 0.7, W * 0.018, 0, 6.283); x.fill();
    x.fillStyle = rgb(SKIN, 0.75); x.fillRect(cx - W * 0.05, hy + hs * 0.3, W * 0.1, hs * 0.5);
    this.halo(cx, hy, hs * 0.75);
    this.head(cx, hy, hs, { hair: D.hair, beard: D.beard, covered: D.hat !== 'capelo', old: true, lookX: -1, tilt: -0.08 });
    if (D.hat === 'mitra') { x.fillStyle = '#f2ecd8'; this.path([[cx - hs * 0.37, hy - hs * 0.36], [cx - hs * 0.3, hy - hs * 0.92], [cx, hy - hs * 1.2], [cx + hs * 0.3, hy - hs * 0.92], [cx + hs * 0.37, hy - hs * 0.36]]); x.fill(); x.fillStyle = 'rgba(214,170,70,0.95)'; x.fillRect(cx - hs * 0.05, hy - hs * 1.12, hs * 0.1, hs * 0.76); x.fillRect(cx - hs * 0.37, hy - hs * 0.44, hs * 0.74, hs * 0.09); x.fillStyle = 'rgba(120,40,30,0.5)'; x.fillRect(cx - hs * 0.37, hy - hs * 0.36, hs * 0.74, hs * 0.03); }
    else if (D.hat === 'tiara') { for (let i = 0; i < 3; i++) { x.fillStyle = i % 2 ? '#e8e2d2' : '#f4efe2'; x.fillRect(cx - hs * (0.35 - i * 0.04), hy - hs * (0.42 + (i + 1) * 0.22), hs * (0.7 - i * 0.08), hs * 0.23); x.fillStyle = 'rgba(214,170,70,0.95)'; x.fillRect(cx - hs * (0.35 - i * 0.04), hy - hs * (0.43 + (i + 1) * 0.22), hs * (0.7 - i * 0.08), hs * 0.05); } x.beginPath(); x.arc(cx, hy - hs * 1.14, hs * 0.06, 0, 6.283); x.fill(); }
    else if (D.hat === 'capelo') { x.fillStyle = '#a01e1c'; x.beginPath(); x.ellipse(cx, hy - hs * 0.52, hs * 0.85, hs * 0.13, 0, 0, 6.283); x.fill(); x.fillStyle = '#b8261f'; x.beginPath(); x.ellipse(cx, hy - hs * 0.62, hs * 0.42, hs * 0.22, 0, Math.PI, 0); x.fill(); x.strokeStyle = '#a01e1c'; x.lineWidth = 1.2 * s; for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(cx + sx * hs * 0.7, hy - hs * 0.5); x.quadraticCurveTo(cx + sx * hs * 0.9, hy + hs * 0.3, cx + sx * hs * 0.75, hy + hs * 0.9); x.stroke(); } }
    if (D.attr === 'paloma') { x.fillStyle = '#f4f2ec'; x.beginPath(); x.ellipse(cx + hs * 0.62, hy - hs * 0.22, hs * 0.14, hs * 0.07, -0.4, 0, 6.283); x.fill(); x.beginPath(); x.ellipse(cx + hs * 0.67, hy - hs * 0.3, hs * 0.16, hs * 0.05, -1.2, 0, 6.283); x.fill(); }
    else if (D.attr === 'corazon') { x.fillStyle = '#b8202a'; x.beginPath(); x.arc(cx - W * 0.22, H * 0.8, hs * 0.12, 0, 6.283); x.fill(); x.fillStyle = 'rgba(255,200,120,0.6)'; x.beginPath(); x.arc(cx - W * 0.22, H * 0.76, hs * 0.05, 0, 6.283); x.fill(); this.hand(cx - W * 0.22, H * 0.85, 10 * s, 0.3); }
    else { this.book(cx + W * 0.22, H * 0.82, 44 * s, -0.2, true); this.hand(cx + W * 0.16, H * 0.88, 10 * s, -0.3); }
    this.soften(0.6);
  }
  // ------------------------------------------------------------ the Assumption, the Baptism, the Dominicans of the mural
  assumption() {
    const x = this.x, W = this.W, H = this.H, s = H / 432;
    this.ground({ glow: 0.85, sky: true, horizon: 0.95, tone: [120, 90, 60] });
    const cx = W * 0.5;
    this.halo(cx, H * 0.16, H * 0.07, true);
    for (let i = 0; i < 12; i++) { const a = -Math.PI + (i / 11) * Math.PI; x.fillStyle = 'rgba(255,240,170,0.95)'; x.beginPath(); x.arc(cx + Math.cos(a) * H * 0.09, H * 0.16 + Math.sin(a) * H * 0.09, 2.4 * s, 0, 6.283); x.fill(); }
    this.figureStanding(cx, H * 0.11, H * 0.7, { tunic: '#f0ece2', mantle: '#2c4a96', veil: true, hands: 'joined', look: -0.2, up: true, lining: '#c8a040' });
    // the cloud she rises on, and the cherubs in it
    for (let i = 0; i < 9; i++) { const ax = W * (0.12 + i * 0.095), ay = H * (0.84 + Math.sin(i * 1.7) * 0.03), cg = x.createRadialGradient(ax - 4, ay - 4, 2, ax, ay, H * 0.07); cg.addColorStop(0, 'rgba(250,240,220,0.9)'); cg.addColorStop(1, 'rgba(220,200,170,0)'); x.fillStyle = cg; x.beginPath(); x.arc(ax, ay, H * 0.07, 0, 6.283); x.fill(); }
    for (const [ax, ay] of [[0.22, 0.8], [0.5, 0.86], [0.78, 0.8]]) this.cherub(W * ax, H * ay, H * 0.05);
    this.soften(0.6);
  }
  // a cherub: a child's head between two little wings
  cherub(cx, cy, s) {
    const x = this.x;
    for (const sx of [-1, 1]) {
      const g = x.createLinearGradient(cx, cy, cx + sx * s * 1.4, cy - s * 0.3); g.addColorStop(0, 'rgba(250,244,232,0.95)'); g.addColorStop(1, 'rgba(200,180,150,0.85)');
      x.fillStyle = g; this.smooth([[cx + sx * s * 0.3, cy - s * 0.1], [cx + sx * s * 1.1, cy - s * 0.6], [cx + sx * s * 1.45, cy - s * 0.2], [cx + sx * s * 1.2, cy + s * 0.25], [cx + sx * s * 0.4, cy + s * 0.3]]); x.fill();
      x.strokeStyle = 'rgba(150,120,90,0.5)'; x.lineWidth = 0.8; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(cx + sx * s * 0.45, cy + s * 0.1); x.lineTo(cx + sx * s * (1.0 + i * 0.1), cy - s * (0.45 - i * 0.2)); x.stroke(); }
    }
    this.head(cx, cy, s, { hair: '#c8904a', young: true });
  }
  baptism() {
    const x = this.x, W = this.W, H = this.H;
    this.ground({ glow: 0.7, sky: true, horizon: 0.72, tone: [90, 80, 60] });
    x.fillStyle = 'rgba(110,150,180,0.7)'; x.fillRect(0, H * 0.78, W, H * 0.22);
    x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(W * 0.5, H * 0.07, W * 0.05, H * 0.012, 0, 0, 6.283); x.fill(); // the dove
    x.strokeStyle = 'rgba(255,240,190,0.4)'; for (let i = 0; i < 14; i++) { const a = Math.PI * 0.3 + (i / 13) * Math.PI * 0.4; x.beginPath(); x.moveTo(W * 0.5, H * 0.08); x.lineTo(W * 0.5 + Math.cos(a) * H * 0.4, H * 0.08 + Math.sin(a) * H * 0.4); x.stroke(); }
    this.figureStanding(W * 0.36, H * 0.3, H * 0.55, { tunic: '#f2ece0', mantle: '#f2ece0', hair: '#4a2c18', look: 0.2 });
    this.figureStanding(W * 0.72, H * 0.22, H * 0.6, { tunic: '#7a5a3a', mantle: '#a8281f', hair: '#3a2416', look: -0.6 });
    this.soften(0.6);
  }
  dominican(kind) {
    this.ground({ glow: 0.4, horizon: 0.9, tone: [150, 130, 100] });
    this.figureStanding(this.W * 0.5, this.H * 0.12, this.H * 0.78, kind === 'catalina' ? { tunic: '#f2efe6', mantle: '#1e1e22', veil: true, look: 0.3 } : { tunic: '#f2efe6', mantle: '#1e1e22', hair: '#3a2416', look: -0.3 });
  }
  // ------------------------------------------------------------ a portrait of a mayor gone (dark suit, a sash now and then)
  portrait(seed) {
    const x = this.x, W = this.W, H = this.H, r = this.r, s = H / 432;
    const g = x.createRadialGradient(W * 0.4, H * 0.35, 4, W * 0.5, H * 0.5, H * 0.7); g.addColorStop(0, '#6a5a48'); g.addColorStop(1, '#1e1812');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const suit = [[40, 40, 46], [30, 34, 48], [56, 48, 40]][seed % 3], cx = W * 0.5, hs = H * 0.26, hy = H * 0.38;
    this.smooth([[cx - W * 0.5, H], [cx - W * 0.44, H * 0.74], [cx - W * 0.16, H * 0.6], [cx + W * 0.16, H * 0.6], [cx + W * 0.44, H * 0.74], [cx + W * 0.5, H]]); this.shade(suit, cx - W * 0.45, 0, cx + W * 0.45, 0, 1.4, 0.5);
    x.fillStyle = '#f2f0ea'; this.path([[cx - W * 0.1, H * 0.6], [cx + W * 0.1, H * 0.6], [cx, H * 0.86]]); x.fill(); // the shirt
    x.fillStyle = ['#7a1420', '#1a2a5a', '#2a2a2a'][(seed >> 1) % 3]; this.path([[cx - W * 0.025, H * 0.62], [cx + W * 0.025, H * 0.62], [cx + W * 0.03, H * 0.85], [cx, H * 0.88], [cx - W * 0.03, H * 0.85]]); x.fill(); // the tie
    if (seed % 2) { x.strokeStyle = 'rgba(200,40,50,0.9)'; x.lineWidth = 10 * s; x.beginPath(); x.moveTo(cx - W * 0.35, H * 0.7); x.lineTo(cx + W * 0.25, H); x.stroke(); x.strokeStyle = 'rgba(240,200,60,0.9)'; x.lineWidth = 3 * s; x.stroke(); } // the sash of office
    x.fillStyle = rgb(SKIN, 0.8); x.fillRect(cx - W * 0.06, hy + hs * 0.3, W * 0.12, hs * 0.5);
    this.head(cx, hy, hs, { hair: ['#2a2018', '#6a6460', '#c8c2b8', '#3a2a1e'][seed % 4], beard: seed % 5 === 0 ? 'short' : null, bald: seed % 3 === 1, old: seed % 2 === 0, lookX: -1 });
    this.soften(0.6);
  }
  // ------------------------------------------------------------ the Vegas Altas: fields to the horizon, the Guadiana, the town and its tower
  vegas() {
    const x = this.x, W = this.W, H = this.H, r = this.r;
    const sky = x.createLinearGradient(0, 0, 0, H * 0.55); sky.addColorStop(0, '#7aa6c8'); sky.addColorStop(1, '#f0dcb0'); x.fillStyle = sky; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) { const cx = r() * W, cy = H * (0.08 + r() * 0.25), rr = H * (0.05 + r() * 0.06), cg = x.createRadialGradient(cx, cy, 1, cx, cy, rr * 2); cg.addColorStop(0, 'rgba(255,250,240,0.7)'); cg.addColorStop(1, 'rgba(255,250,240,0)'); x.fillStyle = cg; x.beginPath(); x.ellipse(cx, cy, rr * 2, rr, 0, 0, 6.283); x.fill(); }
    const hz = H * 0.55, cols = ['#b8a05a', '#8a9a48', '#c8b070', '#6a8a3a', '#a08048', '#d0c080'];
    for (let j = 0; j < 7; j++) { const y0 = hz + (H - hz) * Math.pow(j / 7, 1.6), y1 = hz + (H - hz) * Math.pow((j + 1) / 7, 1.6); for (let i = 0; i < 5; i++) { x.fillStyle = cols[(i + j * 2) % cols.length]; x.beginPath(); x.moveTo(W * (i / 5) - (y0 - hz) * 0.6, y0); x.lineTo(W * ((i + 1) / 5) - (y0 - hz) * 0.6, y0); x.lineTo(W * ((i + 1) / 5) + (y1 - hz) * 0.9, y1); x.lineTo(W * (i / 5) + (y1 - hz) * 0.9, y1); x.fill(); } }
    x.strokeStyle = '#6a9ab8'; x.lineWidth = H * 0.025; x.beginPath(); x.moveTo(0, H * 0.82); x.bezierCurveTo(W * 0.3, H * 0.72, W * 0.6, H * 0.9, W, H * 0.7); x.stroke(); // the river
    x.fillStyle = '#efe8dc'; for (let i = 0; i < 16; i++) x.fillRect(W * (0.55 + i * 0.018), hz - H * (0.01 + (i % 3) * 0.008), W * 0.016, H * (0.02 + (i % 3) * 0.008));
    x.fillStyle = '#b89870'; x.fillRect(W * 0.6, hz - H * 0.09, W * 0.022, H * 0.09); x.fillStyle = '#8a6a48'; x.beginPath(); x.arc(W * 0.611, hz - H * 0.09, W * 0.012, Math.PI, 0); x.fill(); // the tower of Santa María
    this.strokes(0, hz, W, H, [150, 130, 70], 300, H * 0.02, 0, 0.1, 0.6, 1.3);
    this.soften(0.7);
  }
  // ------------------------------------------------------------ the years: amber varnish, cracks, the weave, dark edges
  age() {
    const x = this.x, W = this.W, H = this.H, r = this.r;
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgba(236,206,150,0.55)'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    const vg = x.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(18,10,2,0.6)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    // the craquelure: a fine web of cracks, darker in the darks
    x.lineWidth = 0.6; x.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      let px = r() * W, py = r() * H, a = r() * 6.283;
      x.strokeStyle = `rgba(20,12,4,${0.12 + r() * 0.14})`;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 14; k++) { a += (r() - 0.5) * 1.6; px += Math.cos(a) * (3 + r() * 6); py += Math.sin(a) * (3 + r() * 6); x.lineTo(px, py); if (r() < 0.12) { x.moveTo(px, py); a += Math.PI / 2; } }
      x.stroke();
    }
    // the canvas weave, a few specks of dust
    x.fillStyle = 'rgba(255,240,210,0.035)'; for (let yy = 0; yy < H; yy += 2) x.fillRect(0, yy, W, 1);
    x.fillStyle = 'rgba(0,0,0,0.03)'; for (let xx = 0; xx < W; xx += 2) x.fillRect(xx, 0, 1, H);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,236,200,${0.06 + r() * 0.1})`; x.fillRect(r() * W, r() * H, 1, 1); }
  }
  // a wall painting: dry, pale, flaking away into the plaster
  fresco() {
    const x = this.x, W = this.W, H = this.H, r = this.r;
    x.fillStyle = 'rgba(236,226,206,0.35)'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; x.beginPath(); x.ellipse(r() * W, r() * H, 2 + r() * 14, 2 + r() * 9, r() * 3, 0, 6.283); x.fill(); }
    x.globalCompositeOperation = 'destination-over';
    x.fillStyle = '#e6dccb'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
  }
}
