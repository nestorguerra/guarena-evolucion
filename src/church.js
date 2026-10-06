// The inside of the Iglesia de Santa María de Guareña, after what is written of it (Diputación de Badajoz; J. García
// Murga, Coloquios Históricos de Extremadura 1977 and 2001; the parish audio guide): a single nave (≈50 × 16 m, «quizá
// la mayor de toda la región») of four great bays with tierceron vaults on tall fluted Ionic columns, the chapels between
// the buttresses behind pointed arches, the side doors in the third bay, the raised choir at the foot over an under-choir
// of fine ribs and lit by the great oculus over the main door, the semicircular head under a coffered half dome and its
// gilded retablo mayor (Diego López Cabrera, 1945–49, after the old one was burnt in 1936), the sacristy off the Epistle
// side and, hidden behind the right-hand collateral altar, the wall painting of Santo Domingo and Santa Catalina.
// Whitewash and granite. The sun really comes in through the windows (the walls and vaults cast its shadows) in beams of
// dust; chandeliers and candles do the rest. People pray in the pews, and at mass time the church fills up.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { INTERIOR_ORIGIN, HouseBuilder, boxGeo, planeGeo, std, texMat } from './housekit.js';
import { mulberry32, clamp, lerp } from './util.js';
import { ChurchDoor, cancelLobby, doorwayWall, revealGeo } from './churchdoors.js';
import { buildRetablo } from './retablo.js';
import { statue as carve } from './statues.js';
import { calTexture, floorTexture, plinthTexture, drumTexture, pewTexture, carpetTexture, tombTexture } from './churchtex.js';
import { paintingTexture as oilPainting } from './paintings.js';

// ---------------------------------------------------------------- the measures (metres; x towards the altar = east,
// z south = the Epistle side, y up; the inside faces of the walls)
const HW = 8;                 // half the nave's width (16 m between the columns)
const X0 = -26.5;             // the west wall, at the foot
const XC = -19.5;             // the front of the choir
const BAY = 9.5, NB = 4;      // four bays
const XA = XC + BAY * NB;     // 18.5: the triumphal arch; the apse beyond (semicircle round (XA, 0))
const AR = HW;                // apse radius
const S = 12.4;               // springing of the vaults (above the capitals)
const CD = 3.1;               // chapel depth (between the buttresses)
const PW = 2.4;               // pier width (along x)
const CHY = 6.2;              // choir floor
const P = 0.9;                // presbytery floor (five steps)
const XP = 13.6;              // the first step
const WIN = { w: 2.1, y0: 10.9, y1: 15.2 };

// ---------------------------------------------------------------- painted textures (canvas): made once, kept (each visit
// builds the church again; its pictures need not be painted again — nor fill the GPU)
const MEMO = new Map();
const memo = (key, fn) => { if (!MEMO.has(key)) MEMO.set(key, fn()); return MEMO.get(key); };
function canvasTex(c, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// carved, gilded wood: acanthus scrolls round rosettes, the leaves lit on their upper edges and shadowed under, the red
// bole showing in the hollows and where the gold has worn off with the years
function goldTexture_(seed = 3) {
  const S2 = 512, c = document.createElement('canvas'); c.width = c.height = S2;
  const x = c.getContext('2d'), r = mulberry32(seed);
  // the ground between the carving: gold too, only darker in the hollows (the red bole shows only where it is worn)
  const g = x.createLinearGradient(0, 0, S2, S2); g.addColorStop(0, '#b48434'); g.addColorStop(0.5, '#c8963c'); g.addColorStop(1, '#ad7c2e');
  x.fillStyle = g; x.fillRect(0, 0, S2, S2);
  x.lineCap = 'round'; x.lineJoin = 'round';
  // drawn at (px, py) and again wrapped round the edges, so the tile does not show its seams
  const wrapped = (px, py, R, draw) => { for (const ox of [-S2, 0, S2]) for (const oy of [-S2, 0, S2]) if (px + ox > -R && px + ox < S2 + R && py + oy > -R && py + oy < S2 + R) draw(px + ox, py + oy); };
  const leaf = (px, py, a, L, w) => {
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, bend = Math.sin(t * Math.PI) * w; pts.push([px + ca * L * t + nx * bend, py + sa * L * t + ny * bend]); }
    for (let i = 10; i >= 0; i--) { const t = i / 10, bend = -Math.sin(t * Math.PI) * w * 0.55; pts.push([px + ca * L * t + nx * bend, py + sa * L * t + ny * bend]); }
    x.beginPath(); pts.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath();
    x.fillStyle = 'rgba(92,52,18,0.38)'; x.save(); x.translate(2.5, 2.5); x.fill(); x.restore();
    const lg = x.createLinearGradient(px - nx * w, py - ny * w, px + nx * w, py + ny * w); lg.addColorStop(0, '#fbe2a0'); lg.addColorStop(0.5, '#deae52'); lg.addColorStop(1, '#b07c2c');
    x.fillStyle = lg; x.fill();
    x.strokeStyle = 'rgba(110,64,20,0.45)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + ca * L * 0.9, py + sa * L * 0.9); x.stroke();
  };
  // scrolls of acanthus scattered loosely (no grid), some turning one way, some the other, rosettes here and there
  for (let i = 0; i < 26; i++) {
    const cx = r() * S2, cy = r() * S2, dir = r() < 0.5 ? 1 : -1, R0 = 26 + r() * 30, a0 = r() * 6.283, n = 5 + Math.floor(r() * 4);
    wrapped(cx, cy, R0 + 40, (px, py) => { for (let k = 0; k < n; k++) { const t = k / n, a = a0 + dir * t * 4, rr = R0 * (1 - t * 0.65); leaf(px + Math.cos(a) * rr, py + Math.sin(a) * rr, a + dir * 1.9, 18 + r() * 14, 5 + r() * 4); } });
  }
  for (let i = 0; i < 12; i++) {
    const cx = r() * S2, cy = r() * S2, rr = 5 + r() * 4;
    wrapped(cx, cy, 20, (px, py) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283; x.fillStyle = 'rgba(96,54,18,0.35)'; x.beginPath(); x.ellipse(px + Math.cos(a) * rr + 1.5, py + Math.sin(a) * rr + 1.5, rr * 0.85, rr * 0.42, a, 0, 6.283); x.fill(); x.fillStyle = '#e6b45a'; x.beginPath(); x.ellipse(px + Math.cos(a) * rr, py + Math.sin(a) * rr, rr * 0.85, rr * 0.42, a, 0, 6.283); x.fill(); } const rg = x.createRadialGradient(px - 1.5, py - 1.5, 1, px, py, rr * 0.7); rg.addColorStop(0, '#fff3c4'); rg.addColorStop(1, '#c08a30'); x.fillStyle = rg; x.beginPath(); x.arc(px, py, rr * 0.65, 0, 6.283); x.fill(); });
  }
  // the years: the gold rubbed thin on the high points, the bole showing through in small patches
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '140,66,26' : '100,56,22'},${0.12 + r() * 0.2})`; x.beginPath(); x.ellipse(r() * S2, r() * S2, 1 + r() * 3.5, 1 + r() * 2, r() * 3, 0, 6.283); x.fill(); }
  return canvasTex(c, { repeat: true });
}
export const goldTexture = (seed = 3) => memo('gold' + seed, () => goldTexture_(seed));
const cofferTexture = () => memo('coffer', cofferTexture_);
const viaCrucisTexture = (n) => memo('via' + n, () => viaCrucisTexture_(n));
const plaqueTexture = () => memo('plaque', plaqueTexture_);
// what the gold reflects: the warm church round it (whitewash lit by candles above, dark wood below, a bright window)
let _goldEnv = null;
export function goldEnv() {
  if (_goldEnv) return _goldEnv;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#fff4dc'); g.addColorStop(0.4, '#e8cfa0'); g.addColorStop(0.55, '#9a7448'); g.addColorStop(1, '#2a1a0e');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  for (const [u, v, rr, a] of [[40, 30, 26, 0.9], [170, 36, 20, 0.7], [110, 50, 14, 0.8], [220, 60, 10, 0.6]]) { const rg = x.createRadialGradient(u, v, 1, u, v, rr); rg.addColorStop(0, `rgba(255,252,236,${a})`); rg.addColorStop(1, 'rgba(255,240,200,0)'); x.fillStyle = rg; x.fillRect(0, 0, 256, 128); }
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return (_goldEnv = t);
}
// the coffers of the half dome: a sunk square panel with a gilded rosette
function cofferTexture_() {
  // a coffer of the half dome as the photographs show them: a sunk panel framed in stepped mouldings, painted blue-grey,
  // a cherub's head in grisaille in it, little gilded rosettes at its corners
  const S2 = 256, c = document.createElement('canvas'); c.width = c.height = S2;
  const x = c.getContext('2d');
  x.fillStyle = '#d6cdbb'; x.fillRect(0, 0, S2, S2);
  for (const [o, top, bot] of [[10, '#ece4d2', '#9e9480'], [24, '#d8d0bc', '#8a826e'], [36, '#c4bcaa', '#7a7262']]) { x.fillStyle = bot; x.fillRect(o, o, S2 - o * 2, S2 - o * 2); x.fillStyle = top; x.beginPath(); x.moveTo(o, o); x.lineTo(S2 - o, o); x.lineTo(S2 - o - 8, o + 8); x.lineTo(o + 8, o + 8); x.lineTo(o + 8, S2 - o - 8); x.lineTo(o, S2 - o); x.closePath(); x.fill(); }
  const g = x.createRadialGradient(S2 / 2, S2 * 0.45, 10, S2 / 2, S2 / 2, S2 * 0.4); g.addColorStop(0, '#9fb0c2'); g.addColorStop(1, '#6a7a8e');
  x.fillStyle = g; x.fillRect(46, 46, S2 - 92, S2 - 92);
  // the cherub: a child's head between wings, painted in greys with white lights
  for (const sx of [-1, 1]) { x.fillStyle = '#d8dde2'; x.beginPath(); x.moveTo(S2 / 2 + sx * 10, S2 / 2); x.quadraticCurveTo(S2 / 2 + sx * 60, S2 / 2 - 40, S2 / 2 + sx * 70, S2 / 2 - 6); x.quadraticCurveTo(S2 / 2 + sx * 50, S2 / 2 + 18, S2 / 2 + sx * 12, S2 / 2 + 14); x.closePath(); x.fill(); x.strokeStyle = 'rgba(80,90,104,0.6)'; x.lineWidth = 1.5; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(S2 / 2 + sx * 16, S2 / 2 + 6); x.lineTo(S2 / 2 + sx * (40 + i * 8), S2 / 2 - 26 + i * 8); x.stroke(); } }
  const hg = x.createRadialGradient(S2 / 2 - 5, S2 / 2 - 8, 2, S2 / 2, S2 / 2, 24); hg.addColorStop(0, '#f4f2ee'); hg.addColorStop(1, '#a8b0ba');
  x.fillStyle = hg; x.beginPath(); x.arc(S2 / 2, S2 / 2, 22, 0, 6.283); x.fill();
  x.fillStyle = 'rgba(60,66,78,0.7)'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(S2 / 2 + sx * 8, S2 / 2 - 2, 2.2, 0, 6.283); x.fill(); } x.fillRect(S2 / 2 - 4, S2 / 2 + 10, 8, 2);
  x.fillStyle = '#c2c8ce'; x.beginPath(); x.ellipse(S2 / 2, S2 / 2 - 18, 18, 8, 0, Math.PI, 0); x.fill(); // the curls
  for (const [px, py] of [[30, 30], [S2 - 30, 30], [30, S2 - 30], [S2 - 30, S2 - 30]]) { for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283; x.fillStyle = '#c8962e'; x.beginPath(); x.ellipse(px + Math.cos(a) * 6, py + Math.sin(a) * 6, 6, 3, a, 0, 6.283); x.fill(); } x.fillStyle = '#f2d27a'; x.beginPath(); x.arc(px, py, 4, 0, 6.283); x.fill(); }
  return canvasTex(c, { repeat: true });
}
// the Way of the Cross: fourteen little oil paintings (Christ under the cross on the road, the crowd a dark smudge), the
// station's number on a plaque under each
function viaCrucisTexture_(n) {
  const W2 = 128, H2 = 160, c = document.createElement('canvas'); c.width = W2; c.height = H2;
  const x = c.getContext('2d'), r = mulberry32(300 + n);
  const g = x.createLinearGradient(0, 0, 0, H2); g.addColorStop(0, '#3a2c22'); g.addColorStop(0.55, '#7a5a3a'); g.addColorStop(0.62, '#4a3a2a'); g.addColorStop(1, '#2a2018');
  x.fillStyle = g; x.fillRect(0, 0, W2, H2 - 30);
  x.fillStyle = 'rgba(30,22,16,0.8)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(10 + r() * 108, 86 + r() * 10, 6 + r() * 6, 14 + r() * 8, 0, 0, 6.283); x.fill(); } // the crowd
  const fall = n === 2 || n === 6 || n === 8, cx = 52 + (n % 3) * 8, gy = fall ? 104 : 98;
  if (n < 11) { // carrying the cross (or fallen under it)
    x.strokeStyle = '#4a3020'; x.lineWidth = 6; x.beginPath(); x.moveTo(cx - 22, gy + 8); x.lineTo(cx + 28, gy - (fall ? 30 : 58)); x.stroke(); x.beginPath(); x.moveTo(cx - 4, gy - (fall ? 4 : 38)); x.lineTo(cx + 24, gy - (fall ? 18 : 26)); x.stroke();
    x.fillStyle = '#8a2a24'; x.beginPath(); fall ? x.ellipse(cx + 6, gy - 6, 18, 8, -0.3, 0, 6.283) : x.ellipse(cx, gy - 22, 8, 22, 0.15, 0, 6.283); x.fill();
    x.fillStyle = '#e0bc98'; x.beginPath(); x.arc(cx + (fall ? 20 : 4), gy - (fall ? 14 : 46), 5, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(255,220,140,0.7)'; x.lineWidth = 1; x.beginPath(); x.arc(cx + (fall ? 20 : 4), gy - (fall ? 14 : 46), 8, 0, 6.283); x.stroke();
  } else { // on the cross; laid in the tomb
    x.strokeStyle = '#4a3020'; x.lineWidth = 6; x.beginPath(); x.moveTo(64, 30); x.lineTo(64, 110); x.moveTo(40, 48); x.lineTo(88, 48); x.stroke();
    if (n < 13) { x.fillStyle = '#e8d6bc'; x.fillRect(61, 48, 6, 36); x.beginPath(); x.arc(64, 44, 5, 0, 6.283); x.fill(); x.fillRect(44, 47, 40, 4); }
    else { x.fillStyle = '#e8d6bc'; x.fillRect(30, 104, 68, 7); x.fillStyle = '#2a2018'; x.fillRect(24, 110, 80, 14); }
  }
  // a little varnish and the dark round the edges
  const vg = x.createRadialGradient(64, 70, 20, 64, 70, 90); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,0,0.55)'); x.fillStyle = vg; x.fillRect(0, 0, W2, H2 - 30);
  // its plaque
  x.fillStyle = '#c8a050'; x.fillRect(0, H2 - 30, W2, 30); x.fillStyle = '#3a2410'; x.font = 'bold 20px serif'; x.textAlign = 'center';
  x.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'][n], W2 / 2, H2 - 9);
  return canvasTex(c);
}
function plaqueTexture_() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = '#d8c8a0'; x.fillRect(0, 0, 256, 160);
  x.strokeStyle = '#6a5030'; x.lineWidth = 6; x.strokeRect(6, 6, 244, 148);
  x.fillStyle = '#3a2a18'; x.textAlign = 'center';
  x.font = 'bold 17px serif'; x.fillText('IGLESIA PARROQUIAL', 128, 40); x.fillText('DE SANTA MARÍA', 128, 62);
  x.font = '13px serif'; x.fillText('Comenzada en 1557', 128, 92); x.fillText('Rodrigo Gil de Hontañón', 128, 112); x.fillText('Bien de Interés Cultural', 128, 136);
  return canvasTex(c);
}

// ---------------------------------------------------------------- geometry helpers
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function lathe(profile, seg = 16) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg); }
// a rib / moulding swept along a polyline (a tube of n sides)
function tube(pts, r, sides = 6, closed = false) {
  // (points that repeat break the curve's parameterisation: out with them; and never a NaN vertex)
  const q = [];
  for (const p of pts) if (!q.length || q[q.length - 1].distanceToSquared(p) > 1e-6) q.push(p);
  if (q.length < 2) return null;
  for (const type of ['centripetal', 'chordal', 'catmullrom']) {
    const curve = new THREE.CatmullRomCurve3(q, closed, type);
    const len = curve.getLength();
    if (!Number.isFinite(len) || len < 1e-3) return null;
    const g = new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(len / 0.45)), r, sides, closed);
    const a = g.attributes.position.array;
    let ok = true;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { ok = false; break; }
    if (ok) return g;
    g.dispose();
  }
  return null;
}
// a flat shape with a round or round-headed hole (blocks the sun round a window, so its light falls in that shape)
function maskWithHole(w, h, holeW, holeH, round = false) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2);
  const hole = new THREE.Path();
  if (round) hole.absarc(0, 0, holeW / 2, 0, Math.PI * 2, true);
  else { const r = holeW / 2, yb = -holeH / 2, ys = holeH / 2 - r; hole.moveTo(-r, yb); hole.lineTo(-r, ys); hole.absarc(0, ys, r, Math.PI, 0, true); hole.lineTo(r, yb); hole.lineTo(-r, yb); }
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s, 24);
}
// a pointed (two-centred) arch outline from x=-w/2 to w/2 springing at y0, rising h
function pointedArch(w, y0, h, n = 12) {
  const out = [];
  const R = (w * w / 4 + h * h) / w; // radius of each arc (centres on the springing line)
  for (let i = 0; i <= n; i++) { const t = i / n, x = -w / 2 + t * (w / 2); const cx = -w / 2 + R; out.push([x, y0 + Math.sqrt(Math.max(0, R * R - (x - cx) ** 2))]); }
  for (let i = n - 1; i >= 0; i--) { const p = out[i]; out.push([-p[0], p[1]]); }
  return out;
}
// the web of a vault over a box of plan [xa, xb] × [-HW, HW]: two barrels that meet in groins, a little domed
function vaultY(x, z, xa, xb, s, rT, dome = 0.45) {
  const L = xb - xa, u = (x - xa) / L, v = z / HW;
  const T = rT * Math.sqrt(Math.max(0, 1 - v * v));
  const Lb = (L / 2) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
  return s + Math.max(T, Lb) + dome * Math.sin(Math.PI * clamp(u, 0, 1)) * (1 - v * v);
}
function vaultWeb(xa, xb, s, rT, dome, nx = 34, nz = 30) {
  const pos = [], uv = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = xa + ((xb - xa) * i) / nx, z = -HW + (2 * HW * j) / nz;
    pos.push(x, vaultY(x, z, xa, xb, s, rT, dome) + 0.03, z);
    uv.push(x / 3, z / 3);
  }
  const idx = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = i * (nz + 1) + j, b = a + nz + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1); // (faces down, into the nave)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a rib between two plan points, hung just under the web
function ribAlong(ax, az, bx, bz, xa, xb, s, rT, dome, r = 0.15, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; pts.push(V(x, vaultY(x, z, xa, xb, s, rT, dome) - r * 0.6, z)); }
  return tube(pts, r, 6);
}

// ---------------------------------------------------------------- the builder
export function buildChurch(seed = 7, origin = INTERIOR_ORIGIN) {
  const B = new HouseBuilder(origin.x, origin.z, false);
  const r = mulberry32(seed);
  let cal = null;
  const OX = origin.x, OZ = origin.z;
  // --- materials
  const k = {
    plaster: B.mat('plaster', () => std(0xffffff, { roughness: 0.95, map: calTexture() })),
    vault: B.mat('vault', () => std(0xffffff, { roughness: 0.96, map: calTexture(), side: THREE.DoubleSide })),
    mask: B.mat('mask', () => std(0xffffff, { roughness: 0.95, map: calTexture(), side: THREE.DoubleSide })),
    plinth: B.mat('plinth', () => std(0xffffff, { roughness: 0.85, map: plinthTexture() })),
    granCol: B.mat('granCol', () => { const m = std(0xffffff, { roughness: 0.85, map: drumTexture() }); m.map.repeat.set(3, 1); return m; }),
    granite: B.mat('granite', () => texMat('granite_wall', 0xf2ebdf, 0.88)),
    floor: B.mat('floor', () => { const m = std(0xffffff, { roughness: 0.5, map: floorTexture() }); m.map.repeat.set(1 / 2.4, 1 / 2.4); return m; }),
    step: B.mat('step', () => texMat('granite_wall', 0xcfc6b6, 0.8)),
    darkwood: B.mat('darkwood', () => texMat('dark_wood', 0xb08868, 0.62)),
    pew: B.mat('pew', () => std(0xffffff, { roughness: 0.42, map: pewTexture() })),
    kneel: B.mat('kneel', () => std(0x6a2a24, { roughness: 0.6 })),
    gold: B.mat('gold', () => { const m = std(0xffffff, { roughness: 0.5, metalness: 0.68, map: goldTexture(3), envMap: goldEnv(), envMapIntensity: 1.3, emissive: 0x4a3008, emissiveIntensity: 0.42 }); m.map.repeat.set(2.2, 2.2); return m; }),
    goldPlain: B.mat('goldPlain', () => std(0xf0c25a, { roughness: 0.24, metalness: 0.82, envMap: goldEnv(), envMapIntensity: 1.45, emissive: 0x3a2606, emissiveIntensity: 0.36 })),
    coffer: B.mat('coffer', () => std(0xffffff, { roughness: 0.9, map: cofferTexture(), side: THREE.DoubleSide })),
    iron: B.mat('iron', () => std(0x2a2a2c, { roughness: 0.55, metalness: 0.7 })),
    brass: B.mat('brass', () => std(0xd2aa5c, { roughness: 0.3, metalness: 0.85, envMap: goldEnv(), envMapIntensity: 1.1, emissive: 0x2a1a06, emissiveIntensity: 0.2 })),
    silver: B.mat('silver', () => std(0xe6e8ec, { roughness: 0.22, metalness: 0.85, envMap: goldEnv(), envMapIntensity: 1.3, emissive: 0x202020, emissiveIntensity: 0.25 })),
    red: B.mat('red', () => std(0x9a1f22, { roughness: 0.8 })),
    carpet: B.mat('carpet', () => std(0xffffff, { roughness: 1, map: carpetTexture() })),
    white: B.mat('white', () => std(0xf4f1ea, { roughness: 0.7 })),
    cloth: B.mat('cloth', () => std(0xf6f4ee, { roughness: 0.9 })),
    black: B.mat('black', () => std(0x1c1b20, { roughness: 0.75 })),
    blue: B.mat('blue', () => std(0x2e4f9a, { roughness: 0.6 })),
    purple: B.mat('purple', () => std(0x5a3a6a, { roughness: 0.7 })),
    brown: B.mat('brown', () => std(0x5e4028, { roughness: 0.8 })),
    cream: B.mat('cream', () => std(0xe8dcc0, { roughness: 0.75 })),
    ochre: B.mat('ochre', () => std(0xc8902e, { roughness: 0.6, metalness: 0.2 })),
    green: B.mat('green', () => std(0x2f6a3a, { roughness: 0.7 })),
    skin: B.mat('skin', () => std(0xe4bf9a, { roughness: 0.55 })),
    hair: B.mat('hair', () => std(0x4a3426, { roughness: 0.7 })),
    cloud: B.mat('cloudm', () => std(0xf4f0e6, { roughness: 0.9 })),
    velvet: B.mat('velvet', () => std(0x5a1420, { roughness: 1 })),
    candle: B.mat('candle', () => std(0xf2ead2, { roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.15 })),
    pipe: B.mat('pipe', () => std(0xc8ccd0, { roughness: 0.22, metalness: 0.95 })),
    leaf: B.mat('leaf', () => std(0x3f7a35, { roughness: 0.85 })),
    flower: B.mat('flower', () => std(0xf2ece6, { roughness: 0.8 })),
    flowerR: B.mat('flowerR', () => std(0xc8283a, { roughness: 0.8 })),
  };
  // (every piece indexed, with normals and uvs: the kit merges them per material)
  const add = (key, g, x = 0, y = 0, z = 0, ry = 0) => { if (!g) return; if (!g.index) g = mergeVertices(g); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); B.add(key, g, x, y, z, ry); };
  const extra = (mesh, x, y, z, ry = 0) => B.extraMesh(mesh, x, y, z, ry);
  const seg = (ax, az, bx, bz, h = 4) => B.segs.push([OX + ax, OZ + az, OX + bx, OZ + bz, h]);
  const boxSegs = (x0, z0, x1, z1, h = 2) => { seg(x0, z0, x1, z0, h); seg(x1, z0, x1, z1, h); seg(x1, z1, x0, z1, h); seg(x0, z1, x0, z0, h); };
  const lights = [];
  const point = (x, y, z, color, intensity, dist, flick = false) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.8); l.position.set(OX + x, y, OZ + z); l.userData.base = intensity; if (flick) l.userData.fire = true;
    B.lights.push(l); lights.push(l); return l;
  };
  const bays = [];
  for (let i = 0; i < NB; i++) bays.push({ i, xa: XC + i * BAY, xb: XC + (i + 1) * BAY, xm: XC + (i + 0.5) * BAY });
  const doorBay = bays[2];

  // ================================================================ floor and steps
  add(k.floor, planeGeo(XA - X0 + AR + 1, 2 * (HW + CD) + 0.4, 1).rotateX(-Math.PI / 2), (X0 + XA + AR) / 2, 0, 0);
  const NS = 5, rise = P / NS, tread = (XP + 1.5 - XP) / NS;
  for (let i = 0; i < NS; i++) add(k.step, boxGeo(tread * (NS - i), rise, 2 * HW, 1.6), XP + i * tread + (tread * (NS - i)) / 2, rise * (i + 0.5), 0);
  // the presbytery platform: across the last part of the nave and the whole apse
  add(k.step, boxGeo(XA - (XP + 1.5), P, 2 * HW, 1.6), (XA + XP + 1.5) / 2, P / 2, 0);
  { const half = new THREE.CylinderGeometry(AR, AR, P, 32, 1, false, 0, Math.PI); half.translate(0, P / 2, 0); add(k.step, half, XA, 0, 0); }
  add(k.floor, planeGeo(XA - (XP + 1.5), 2 * HW, 1).rotateX(-Math.PI / 2), (XA + XP + 1.5) / 2, P + 0.005, 0);
  { const disc = new THREE.CircleGeometry(AR, 32, -Math.PI / 2, Math.PI); disc.rotateX(-Math.PI / 2); add(k.floor, disc, XA, P + 0.005, 0); }
  // the red runner up the middle, up the five steps (a brass rod at the foot of each riser) and onto the presbytery
  {
    const w = 1.5, pos = [], uv = [], idx = [], lift = 0.012;
    let along = 0;
    const strip = (x0, y0, x1, y1) => {
      const k = pos.length / 3, L = Math.hypot(x1 - x0, y1 - y0);
      pos.push(x0, y0, -w / 2, x0, y0, w / 2, x1, y1, w / 2, x1, y1, -w / 2);
      uv.push(0, along / 3, 1, along / 3, 1, (along + L) / 3, 0, (along + L) / 3);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      along += L;
    };
    strip(XC + 1, lift, XP - 0.012, lift);
    for (let i = 0; i < NS; i++) { const xs = XP + i * tread - 0.012, y = rise * i; strip(xs, y + lift, xs, y + rise + lift); strip(xs, y + rise + lift, xs + tread, y + rise + lift); }
    strip(XP + 1.5 - 0.012, P + lift, XA - 2.6, P + lift);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    add(k.carpet, g);
    for (let i = 0; i < NS; i++) add(k.brass, new THREE.CylinderGeometry(0.011, 0.011, w + 0.12, 8).rotateX(Math.PI / 2), XP + i * tread - 0.03, rise * i + 0.03, 0);
    for (const e of [XC + 1, XA - 2.6]) add(k.brass, boxGeo(0.03, 0.012, w + 0.04), e, 0.018 + (e > XP ? P : 0), 0); // the brass edging at its ends
  }
  // tomb slabs in the floor, where the old families of Guareña were buried (in the cross aisle and under the choir)
  [[2.6, -3.2], [4.9, -3.2], [2.6, 3.2], [4.9, 3.2], [X0 + 4.8, -5.2]].forEach(([tx, tz], i) => {
    const m = new THREE.Mesh(planeGeo(0.95, 1.95, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tombTexture(i), roughness: 0.6 }));
    m.geometry.attributes.uv.array.forEach((v, j, a) => { a[j] = j % 2 ? v / 1.95 : v / 0.95; });
    m.receiveShadow = true; extra(m, tx, 0.004, tz, Math.PI / 2);
  });

  // ================================================================ walls (with their doors and windows)
  const wallH = S + 9;
  // the foot (west wall): the main door under the choir, the great oculus above
  const wallZ = (x0, x1, z, holes = [], h = wallH) => B.wall(k.plaster, x0, z, x1, z, h, holes);
  const wallX = (z0, z1, x, holes = [], h = wallH) => B.wall(k.plaster, x, z0, x, z1, h, holes);
  // (the door and the oculus one above the other: the middle strip of the wall in pieces)
  wallX(-HW, -1.75, X0, [], 14.6); wallX(1.75, HW, X0, [], 14.6);
  B.wall(k.plaster, X0, -1.75, X0, 1.75, 14.6 - 5.2, [[0, 3.5, 10.8 - 5.2, 14.3 - 5.2]], 5.2, false);
  seg(X0, -1.7, X0, 1.7, 3); // (the great door is shut behind you: out through its lobby)
  // the side walls of the choir bay (the tower stair door on the Epistle side)
  wallZ(X0, XC + PW / 2, -HW, [], 10.2);
  wallZ(X0, XC + PW / 2, HW, [[3.2, 4.4, 0, 2.3]], 10.2);
  // the outer walls of the chapels and the door bay; the walls between chapels are the piers
  for (const s of [-1, 1]) {
    const zo = s * (HW + CD);
    for (const b of bays) {
      const x0 = b.xa + PW / 2, x1 = b.xb - PW / 2;
      const isDoor = b === doorBay;
      wallZ(x0 - 0.2, x1 + 0.2, zo, isDoor ? [[(x1 - x0) / 2 + 0.2 - 1.65, (x1 - x0) / 2 + 0.2 + 1.65, 0, 4.9]] : [], 10.2); // (a little into the piers: no seam for the sun)
      if (isDoor) seg(b.xm - 1.6, zo, b.xm + 1.6, zo, 3);
      // the chapel ceiling: a simple ribbed vault
      add(k.vault, boxGeo(x1 - x0, 0.3, CD, 3), (x0 + x1) / 2, 10.05, s * (HW + CD / 2));
    }
  }
  // the nave walls above the chapel arches, with a window in each bay (the lunette under the wall rib)
  const windows = [];
  const YW = 9.95; // (below it, the chapel's arch)
  for (const s of [-1, 1]) {
    const holes = bays.map((b) => [b.xm - (XC - PW / 2) - WIN.w / 2, b.xm - (XC - PW / 2) + WIN.w / 2, WIN.y0 - YW, WIN.y1 - YW]);
    B.wall(k.plaster, XC - PW / 2, s * HW, XA + 0.2, s * HW, wallH - YW, holes, YW, false);
    for (const b of bays) windows.push({ x: b.xm, z: s * HW, nx: 0, nz: s, w: WIN.w, y0: WIN.y0, y1: WIN.y1 });
  }
  // and the choir bay's walls go up to the vault as well
  for (const s of [-1, 1]) B.wall(k.plaster, X0, s * HW, XC - PW / 2, s * HW, wallH - 10.2, [], 10.2, false);
  // the apse: a semicircle of wall up to the springing, two windows either side of the retablo
  {
    const n = 28, pos = [];
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
      const ax = XA + Math.cos(a0) * AR, az = Math.sin(a0) * AR, bx = XA + Math.cos(a1) * AR, bz = Math.sin(a1) * AR;
      const am = (a0 + a1) / 2;
      const win = Math.abs(Math.abs(am) - 1.05) < 0.07;
      B.wall(k.plaster, bx, bz, ax, az, S, win ? [[0, Math.hypot(bx - ax, bz - az), 8.6, 11.6]] : []);
      if (win && !pos.some((p) => Math.abs(p - am) < 0.2)) { pos.push(am); windows.push({ x: XA + Math.cos(am) * AR, z: Math.sin(am) * AR, nx: Math.cos(am), nz: Math.sin(am), w: 0.88, y0: 8.6, y1: 11.6, apse: true }); }
    }
  }

  // ================================================================ piers, columns, arches
  // a giant fluted Ionic half column on a pedestal against each pier (24 flutes), the impost above it
  const column = (x, s) => {
    const z = s * (HW + 0.05), h0 = 1.5, h1 = S - 1.15;
    add(k.granite, boxGeo(1.8, h0, 1.8, 1.6), x, h0 / 2, s * (HW + 0.05));
    add(k.granite, boxGeo(1.95, 0.18, 1.95, 1.6), x, h0 + 0.09, s * (HW + 0.05));
    const base = lathe([[0.82, 0], [0.82, 0.12], [0.76, 0.2], [0.72, 0.32], [0.78, 0.4], [0.72, 0.48], [0.68, 0.5]], 24); add(k.granite, base, x, h0 + 0.18, z);
    // the fluted shaft: a cylinder with 24 shallow grooves
    const sh = new THREE.CylinderGeometry(0.62, 0.67, h1 - h0 - 0.7, 48, 12, false);
    const p = sh.attributes.position;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i), a = Math.atan2(pz, px); if (px * px + pz * pz < 1e-10) continue; const f = 1 - 0.07 * Math.max(0, Math.cos(a * 24)) ** 2; p.setXYZ(i, px * f, p.getY(i), pz * f); } // (the caps' centres stay put)
    sh.computeVertexNormals(); sh.translate(0, (h1 + h0 + 0.68) / 2 - 0.01, 0);
    { const uvA = sh.attributes.uv; const L = h1 - h0 - 0.7; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i), uvA.getY(i) * L / 0.74); } // (a drum every 74 cm)
    add(k.granCol, sh, x, 0, z);
    // the Ionic capital: echinus, two volutes facing the nave, the abacus; then the impost block
    add(k.granite, lathe([[0.62, 0], [0.7, 0.1], [0.74, 0.22], [0, 0.23]], 24), x, h1, z);
    for (const sx of [-1, 1]) { const vol = new THREE.TorusGeometry(0.2, 0.09, 8, 16); vol.rotateY(Math.PI / 2); add(k.granite, vol, x + sx * 0.66, h1 + 0.12, z - s * 0.18); }
    add(k.granite, boxGeo(1.75, 0.16, 1.7, 1.6), x, h1 + 0.31, z);
    add(k.granite, boxGeo(2.2, 0.62, 1.9, 1.6), x, h1 + 0.7, s * (HW + 0.35));
    add(k.granite, boxGeo(2.5, 0.2, 2.1, 1.6), x, h1 + 1.1, s * (HW + 0.35));
    B.footprint(1.9, 1.9, x, s * (HW + 0.05), 0, 4);
  };
  for (let i = 0; i <= NB; i++) {
    const x = XC + i * BAY;
    for (const s of [-1, 1]) {
      column(x, s);
      // the pier itself, the wall between two chapels (or between the last chapel and the presbytery)
      if (i < NB || true) add(k.plaster, boxGeo(PW, 10.2, CD, 2), x, 5.1, s * (HW + CD / 2));
      boxSegs(x - PW / 2, s > 0 ? HW + 0.6 : -HW - CD, x + PW / 2, s > 0 ? HW + CD : -HW - 0.6, 4);
    }
    // the transverse arch: a semicircle of granite voussoirs from column to column
    const pts = [];
    for (let j = 0; j <= 32; j++) { const a = Math.PI - (j / 32) * Math.PI; pts.push(V(x, S + Math.sin(a) * (HW - 0.25) - 0.2, Math.cos(a) * (HW - 0.25))); }
    const arch = tube(pts, 0.42, 4);
    add(k.granite, arch);
  }
  // the chapel openings: pointed granite arches from pier to pier, the bay walls of the door bay the same
  for (const s of [-1, 1]) for (const b of bays) {
    const x0 = b.xa + PW / 2, x1 = b.xb - PW / 2, w = x1 - x0;
    const outline = pointedArch(w - 0.2, 6.6, 3.3, 10);
    const pts = outline.map(([u, y]) => V(b.xm + u, y, s * (HW + 0.12)));
    add(k.granite, tube(pts, 0.24, 4));
    for (const sx of [-1, 1]) add(k.granite, boxGeo(0.4, 6.6, 0.5, 1.6), b.xm + sx * (w / 2 - 0.15), 3.3, s * (HW + 0.12));
    // the wall above the arch up to the window (its spandrels)
    const sp = new THREE.Shape(); sp.moveTo(-w / 2, 6.6); outline.forEach(([u, y]) => sp.lineTo(u, y)); sp.lineTo(w / 2, 6.6); sp.lineTo(w / 2, 10.0); sp.lineTo(-w / 2, 10.0); sp.lineTo(-w / 2, 6.6);
    const spg = new THREE.ExtrudeGeometry(sp, { depth: 0.3, bevelEnabled: false, curveSegments: 8 }); spg.translate(0, 0, -0.15); add(k.plaster, spg, b.xm, 0, s * (HW + 0.05));
  }
  // the triumphal arch and the walls either side of it are the last pier pair (XA)

  // ================================================================ the vaults: four tierceron vaults, the apse half dome
  for (const b of bays) {
    const { xa, xb, xm } = b, d = 0.5;
    add(k.vault, vaultWeb(xa, xb, S, HW, d));
    const K = [xm, 0], Kn = [xm, -HW * 0.5], Ks = [xm, HW * 0.5], Kw = [xa + BAY * 0.25, 0], Ke = [xb - BAY * 0.25, 0];
    const C = [[xa, -HW], [xa, HW], [xb, -HW], [xb, HW]];
    const rib = (a, c, rr = 0.15) => add(k.granite, ribAlong(a[0], a[1], c[0], c[1], xa, xb, S, HW, d, rr));
    for (const c of C) rib(c, K, 0.17); // diagonals
    rib(C[0], Kn); rib(C[0], Kw); rib(C[1], Ks); rib(C[1], Kw); rib(C[2], Kn); rib(C[2], Ke); rib(C[3], Ks); rib(C[3], Ke); // tiercerons
    rib(Kw, K, 0.12); rib(K, Ke, 0.12); rib(Kn, K, 0.12); rib(K, Ks, 0.12); // ridge ribs
    rib([xa, 0], Kw, 0.12); rib(Ke, [xb, 0], 0.12); rib([xm, -HW], Kn, 0.12); rib(Ks, [xm, HW], 0.12);
    // the wall ribs along the windows
    for (const s of [-1, 1]) { const pts = []; for (let j = 0; j <= 16; j++) { const x = xa + PW / 2 + ((BAY - PW) * j) / 16; pts.push(V(x, vaultY(x, s * (HW - 0.12), xa, xb, S, HW, d) - 0.1, s * (HW - 0.12))); } add(k.granite, tube(pts, 0.13, 4)); }
    // the bosses: gilded, the middle one bigger
    for (const [q, rr] of [[K, 0.5], [Kn, 0.3], [Ks, 0.3], [Kw, 0.3], [Ke, 0.3]]) {
      const y = vaultY(q[0], q[1], xa, xb, S, HW, d) - 0.18;
      const boss = new THREE.CylinderGeometry(rr, rr * 0.85, 0.28, 16); add(k.gold, boss, q[0], y, q[1]);
      add(k.goldPlain, new THREE.SphereGeometry(rr * 0.45, 10, 8), q[0], y - 0.16, q[1]);
    }
  }
  {
    const xa = X0, xb = XC, xm = (xa + xb) / 2, d = 0.4, L = xb - xa;
    add(k.vault, vaultWeb(xa, xb, S, HW, d, 24, 30));
    const K = [xm, 0], C = [[xa, -HW], [xa, HW], [xb, -HW], [xb, HW]];
    const rib = (a, c, rr = 0.15) => add(k.granite, ribAlong(a[0], a[1], c[0], c[1], xa, xb, S, HW, d, rr));
    for (const c of C) rib(c, K, 0.16);
    rib([xa + L * 0.25, 0], K, 0.11); rib(K, [xb - L * 0.25, 0], 0.11); rib([xm, -HW * 0.5], K, 0.11); rib(K, [xm, HW * 0.5], 0.11);
    const y = vaultY(xm, 0, xa, xb, S, HW, d) - 0.18; add(k.gold, new THREE.CylinderGeometry(0.45, 0.38, 0.28, 16), xm, y, 0);
    // the west wall up to the vault, round the oculus
    B.wall(k.plaster, X0, -HW, X0, HW, wallH - 14.6, [], 14.6, false);
  }
  // the half dome of the apse (a quarter of a sphere) with its coffers, and the arch in front of it
  {
    const rows = 5, cols = 12, R0 = AR - 0.02;
    const pos = [], uv = [], idx = [];
    const nu = 48, nv = 20;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const az = -Math.PI / 2 + (i / nu) * Math.PI, el = (j / nv) * (Math.PI / 2);
      pos.push(XA + Math.cos(el) * Math.cos(az) * R0, S + Math.sin(el) * R0, Math.cos(el) * Math.sin(az) * R0);
      uv.push((i / nu) * cols, (j / nv) * rows);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b2 = a + nv + 1; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // (normals must point into the apse)
    const nrm = g.attributes.normal; let flip = false;
    { const i0 = Math.floor(nrm.count / 2); const px = pos[i0 * 3] - XA, py = pos[i0 * 3 + 1] - S, pz = pos[i0 * 3 + 2]; flip = nrm.getX(i0) * px + nrm.getY(i0) * py + nrm.getZ(i0) * pz > 0; }
    if (flip) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    add(k.coffer, g);
    // the coffer frames: meridians and parallels in relief
    for (let c = 0; c <= cols; c++) { const az = -Math.PI / 2 + (c / cols) * Math.PI, pts = []; for (let j = 0; j <= 16; j++) { const el = (j / 16) * (Math.PI / 2) * 0.97; pts.push(V(XA + Math.cos(el) * Math.cos(az) * (R0 - 0.08), S + Math.sin(el) * (R0 - 0.08), Math.cos(el) * Math.sin(az) * (R0 - 0.08))); } add(k.granite, tube(pts, 0.08, 4)); }
    for (let rI = 1; rI < rows; rI++) { const el = (rI / rows) * (Math.PI / 2), pts = []; for (let j = 0; j <= 24; j++) { const az = -Math.PI / 2 + (j / 24) * Math.PI; pts.push(V(XA + Math.cos(el) * Math.cos(az) * (R0 - 0.08), S + Math.sin(el) * (R0 - 0.08), Math.cos(el) * Math.sin(az) * (R0 - 0.08))); } add(k.granite, tube(pts, 0.08, 4)); }
    // a cornice round the apse at the springing
    { const pts = []; for (let j = 0; j <= 28; j++) { const az = -Math.PI / 2 + (j / 28) * Math.PI; pts.push(V(XA + Math.cos(az) * (AR - 0.2), S - 0.1, Math.sin(az) * (AR - 0.2))); } add(k.granite, tube(pts, 0.22, 4)); }
  }

  // ================================================================ the choir at the foot and its under-choir
  {
    const y0 = 4.5, rise = 1.25, d = 0;
    // the under-choir: a shallow star vault with a ring of curved ribs (the «afiligranadas crucerías»)
    const sv = (x, z) => y0 + rise * Math.sqrt(Math.max(0, 1 - (z / HW) ** 2)) * (0.75 + 0.25 * Math.sin(Math.PI * clamp((x - X0) / (XC - X0), 0, 1)));
    const nx = 20, nz = 26, pos = [], idx = [], uv = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const x = X0 + ((XC - X0) * i) / nx, z = -HW + (2 * HW * j) / nz; pos.push(x, sv(x, z) + 0.03, z); uv.push(x / 3, z / 3); }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b2 = a + nz + 1; idx.push(a, a + 1, b2, b2, a + 1, b2 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    add(k.vault, g);
    const cx = (X0 + XC) / 2, rxs = (XC - X0) / 2;
    const ribP = (pts2) => { const pts = pts2.map(([x, z]) => V(x, sv(x, z) - 0.08, z)); add(k.granite, tube(pts, 0.1, 5)); };
    const ring = []; for (let j = 0; j <= 32; j++) { const a = (j / 32) * Math.PI * 2; ring.push([cx + Math.cos(a) * rxs * 0.55, Math.sin(a) * HW * 0.55]); }
    ribP(ring);
    const star = []; for (let j = 0; j < 8; j++) { const a = (j / 8) * Math.PI * 2; star.push([cx + Math.cos(a) * rxs * 0.55, Math.sin(a) * HW * 0.55]); }
    const corners = [[X0, -HW], [X0, HW], [XC, -HW], [XC, HW], [cx, -HW], [cx, HW], [X0, 0], [XC, 0]];
    for (const c of corners) { let best = star[0], bd = 1e9; for (const q of star) { const dd = Math.hypot(q[0] - c[0], (q[1] - c[1]) * 0.6); if (dd < bd) { bd = dd; best = q; } } const pts = []; for (let t = 0; t <= 8; t++) pts.push([c[0] + (best[0] - c[0]) * t / 8, c[1] + (best[1] - c[1]) * t / 8]); ribP(pts); }
    for (const q of star) { const pts = []; for (let t = 0; t <= 8; t++) pts.push([q[0] + (cx - q[0]) * t / 8, q[1] * (1 - t / 8)]); ribP(pts); add(k.gold, new THREE.CylinderGeometry(0.16, 0.14, 0.16, 12), q[0], sv(q[0], q[1]) - 0.14, q[1]); }
    add(k.gold, new THREE.CylinderGeometry(0.3, 0.26, 0.2, 14), cx, sv(cx, 0) - 0.14, 0);
    // the choir's front: the low arch, its floor slab and the granite balustrade
    const front = []; for (let j = 0; j <= 24; j++) { const z = -HW + (2 * HW * j) / 24; front.push(V(XC - 0.1, sv(XC - 0.1, z) - 0.15, z)); }
    add(k.granite, tube(front, 0.35, 4));
    add(k.granite, boxGeo(0.7, CHY - (y0 + rise) + 0.3, 2 * HW, 1.6), XC - 0.3, (CHY + y0 + rise) / 2 - 0.1, 0);
    add(k.plaster, boxGeo(XC - X0, 0.3, 2 * HW, 2), cx, CHY - 0.15, 0);
    add(k.granite, boxGeo(0.5, 0.22, 2 * HW, 1.6), XC - 0.15, CHY + 0.11, 0);
    add(k.granite, boxGeo(0.45, 0.16, 2 * HW, 1.6), XC - 0.15, CHY + 1.0, 0);
    const bal = lathe([[0.07, 0], [0.09, 0.06], [0.06, 0.14], [0.11, 0.38], [0.06, 0.6], [0.08, 0.66], [0.07, 0.68]], 10);
    for (let z = -HW + 0.3; z <= HW - 0.3; z += 0.34) add(k.granite, bal.clone(), XC - 0.15, CHY + 0.22, z);
    // the organ against the west wall, to one side of the oculus (its light falls on the choir): a wooden case, three
    // towers of pipes
    const ox = X0 + 0.9, oz = -4.3;
    add(k.darkwood, boxGeo(1.2, 3.2, 5.6, 1.2), ox, CHY + 1.6, oz);
    add(k.darkwood, boxGeo(1.0, 0.25, 6.0, 1.2), ox, CHY + 3.3, oz);
    for (const [zc0, wN, hp] of [[-2.0, 7, 2.2], [0, 9, 2.9], [2.0, 7, 2.2]]) {
      const zc = zc0 + oz;
      for (let i = 0; i < wN; i++) { const zz = zc + (i - (wN - 1) / 2) * 0.17, hh = hp * (1 - Math.abs(i - (wN - 1) / 2) / wN * 0.6); add(k.pipe, new THREE.CylinderGeometry(0.06, 0.06, hh, 8), ox + 0.25, CHY + 3.4 + hh / 2, zz); add(k.pipe, new THREE.ConeGeometry(0.06, 0.12, 8), ox + 0.25, CHY + 3.4 - 0.05, zz); }
      add(k.gold, boxGeo(0.3, 0.2, wN * 0.17 + 0.2, 1), ox + 0.25, CHY + 3.4 + hp + 0.1, zc);
    }
  }

  // ================================================================ the doors: round-headed like the portals outside (churchdoors.js),
  // their great leaves shut behind you; inside each one, its wooden lobby (the «cancel») with padded swing leaves
  const DOORS = { oeste: { w: 2.6, spring: 3.7, W: 3.5, H: 5.2 }, sur: { w: 2.3, spring: 3.3, W: 3.3, H: 4.9 }, norte: { w: 2.2, spring: 3.2, W: 3.3, H: 4.9 } };
  const cancels = [];
  // key; (x, z) on the wall's line; ry turns local +z into the church (the lobby stands out that way)
  const doorway = (key, x, z, ry, deep = 1.05) => {
    const D = DOORS[key], c = Math.cos(ry), sn = Math.sin(ry);
    const wallG = doorwayWall(D.W, D.H, D.w, D.spring, -0.07, 0.07); wallG.rotateY(ry); add(k.plaster, wallG, x, 0, z);
    const rv = revealGeo(D.w, D.spring, deep); rv.rotateY(ry); add(k.granite, rv, x, 0, z);
    const dr = new ChurchDoor({ w: D.w, spring: D.spring, style: key === 'oeste' ? 'cuarterones' : 'clavos', key });
    dr.group.rotation.y = ry + Math.PI; // (its street face looks out)
    dr.group.position.set(OX + x - sn * (deep - 0.12), 0, OZ + z - c * (deep - 0.12));
    B.extra.push(dr.group);
    const L = cancelLobby(Math.max(3.4, D.w + 1.1), 2.3, 3.4);
    const lx = x + sn * 0.07, lz = z + c * 0.07;
    L.group.rotation.y = ry; L.group.position.set(OX + lx, 0, OZ + lz); B.extra.push(L.group);
    const W2 = (px, pz) => [lx + px * c + pz * sn, lz - px * sn + pz * c];
    for (const [ax, az, bx, bz] of L.segs) { const p0 = W2(ax, az), p1 = W2(bx, bz); seg(p0[0], p0[1], p1[0], p1[1], 3); }
    const f = W2(0, L.d);
    cancels.push({ key, lobby: L, door: dr, x: OX + f[0], z: OZ + f[1], nx: sn, nz: c, half: L.front.w / 2 });
    return { f, n: [sn, c] };
  };
  const dW = doorway('oeste', X0, 0, Math.PI / 2);
  const sx3 = doorBay.xm;
  const dS = doorway('sur', sx3, HW + CD, Math.PI);
  const dN = doorway('norte', sx3, -HW - CD, 0);
  // the tower stair door, the sacristy door
  add(k.darkwood, boxGeo(1.2, 2.3, 0.1, 1.2), X0 + 3.8, 1.15, HW - 0.05);
  { const a = 1.32, sx = XA + Math.cos(a) * (AR - 0.06), sz = Math.sin(a) * (AR - 0.06); add(k.darkwood, boxGeo(1.3, 2.4, 0.1, 1.2).rotateY(-a + Math.PI / 2), sx, P + 1.2, sz); B.interact({ type: 'info', x: XA + Math.cos(a) * (AR - 1), z: Math.sin(a) * (AR - 1), y: P, r: 1.5, label: 'Sacristía', text: 'La puerta de la sacristía está cerrada. Dicen que dentro tiene una cúpula gallonada con casetones.' }); }
  // ways out: through the lobby (walk in, or press E before it)
  const before = (d, m) => ({ x: d.f[0] + d.n[0] * m, z: d.f[1] + d.n[1] * m });
  B.interact({ type: 'exit', ...before(dW, 0.7), r: 1.3, label: 'Salir por la puerta principal', door: 'oeste' });
  B.interact({ type: 'exit', ...before(dS, 0.7), r: 1.3, label: 'Salir por la puerta del Mediodía', door: 'sur' });
  B.interact({ type: 'info', ...before(dN, 0.7), r: 1.3, label: 'Puerta del Evangelio', text: 'La puerta del lado norte está cerrada; hoy se entra por la de los pies y por la del Mediodía.' });
  B.interact({ type: 'info', x: X0 + 3.8, z: HW - 0.8, r: 1.3, label: 'Escalera de la torre', text: 'La escalera de caracol de la torre: más de cien peldaños de granito. Está cerrada con llave.' });
  { const q = before(dW, 1.7); B.spots.entrada = { x: OX + q.x, z: OZ + q.z, h: Math.PI / 2 }; }
  { const q = before(dS, 1.7); B.spots.sur = { x: OX + q.x, z: OZ + q.z, h: Math.PI }; }
  // the spots are in world coordinates already (the kit's spots are in local ones: see finish below)

  // ================================================================ windows: openings with their glass and the sun's mask
  const glass = B.mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0d0, emissiveIntensity: 1.3, roughness: 0.4, transparent: true, opacity: 0.85, depthWrite: false }));
  for (const w of windows) {
    const ry = Math.atan2(w.nx, w.nz);
    const h = w.y1 - w.y0, cy = (w.y0 + w.y1) / 2;
    const pane = planeGeo(w.w, h, 1); pane.rotateY(ry + Math.PI); add(glass, pane, w.x - w.nx * 0.05, cy, w.z - w.nz * 0.05);
    const mask = maskWithHole(w.w + 0.4, h + 0.4, w.w, h, false); mask.rotateY(ry); add(k.mask, mask, w.x + w.nx * 0.1, cy, w.z + w.nz * 0.1);
    // a granite frame (the splay of the window)
    const fr = []; const r0 = w.w / 2; for (let j = 0; j <= 16; j++) { const a = Math.PI - (j / 16) * Math.PI; fr.push(V(0, h / 2 - r0 + Math.sin(a) * r0, Math.cos(a) * r0)); }
    const frame = tube([V(0, -h / 2, -r0), ...fr, V(0, -h / 2, r0)], 0.12, 4); if (frame) { frame.rotateY(ry + Math.PI / 2); add(k.granite, frame, w.x - w.nx * 0.06, cy, w.z - w.nz * 0.06); }
  }
  // the oculus over the main door (round, its light on the choir)
  { const m = maskWithHole(3.9, 3.9, 3.2, 3.2, true); m.rotateY(-Math.PI / 2); add(k.mask, m, X0 - 0.05, 12.55, 0); const gl = new THREE.CircleGeometry(1.6, 32); gl.rotateY(Math.PI / 2); add(glass, gl, X0 + 0.05, 12.55, 0); const ring = new THREE.TorusGeometry(1.7, 0.18, 6, 32); ring.rotateY(Math.PI / 2); add(k.granite, ring, X0 + 0.1, 12.55, 0); windows.push({ x: X0, z: 0, nx: -1, nz: 0, w: 3.2, y0: 10.95, y1: 14.15, round: true }); }

  // ================================================================ the retablo mayor (gilded wood, 1945–49): retablo.js, after the photographs
  const RT = buildRetablo(k, { P, xb: XA + AR - 1.15, OX, OZ, add, B, statue: carve });
  // the altar (the table of the Eucharist), its cloth and candles; the ambo; the chairs; the sanctuary lamp
  {
    const ax = XA - 0.6;
    B.block(k.step, 1.05, 1.0, 2.4, ax, P, 0, 0, 1.6);
    B.footprint(1.1, 2.5, ax, 0, 0, 2);
    add(k.cloth, boxGeo(1.2, 0.03, 2.6, 1), ax, P + 1.02, 0);
    add(k.cloth, boxGeo(0.02, 0.5, 2.5, 1), ax - 0.6, P + 0.78, 0);
    for (const z of [-1.0, 1.0]) { add(k.brass, lathe([[0.08, 0], [0.03, 0.05], [0.025, 0.3], [0.06, 0.32], [0, 0.34]], 10), ax, P + 1.04, z); add(k.candle, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), ax, P + 1.53, z); }
    add(k.brass, boxGeo(0.03, 0.42, 0.03), ax + 0.2, P + 1.25, 0); add(k.brass, boxGeo(0.03, 0.03, 0.22), ax + 0.2, P + 1.36, 0);
    // the ambo (Gospel side), the presider's chair and two more against the apse wall (Epistle side)
    B.block(k.darkwood, 0.6, 1.15, 0.7, XP + 2.6, P, -HW + 2.4, 0, 1.2); B.footprint(0.7, 0.8, XP + 2.6, -HW + 2.4, 0, 1.4);
    add(k.darkwood, boxGeo(0.8, 0.06, 0.6, 1), XP + 2.6, P + 1.2, -HW + 2.4);
    for (const [cz, hh] of [[5.2, 1.5], [4.3, 1.1], [6.1, 1.1]]) { B.block(k.velvet, 0.6, 0.5, 0.6, XA - 2.2, P, cz, 0, 1); add(k.darkwood, boxGeo(0.1, hh, 0.62, 1), XA - 1.95, P + hh / 2, cz); B.footprint(0.7, 0.7, XA - 2.15, cz, 0, 1.2); }
    // the sanctuary lamp hanging by the tabernacle: red glass
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc8202a, emissive: 0xff3020, emissiveIntensity: 1.6, roughness: 0.3 }));
    extra(lamp, XA + 3.2, P + 3.4, -2.6); add(k.brass, new THREE.CylinderGeometry(0.008, 0.008, 9, 4), XA + 3.2, P + 8, -2.6);
    point(XA + 3.2, P + 3.3, -2.6, 0xff5040, 2.2, 4, true);
    // flowers at the foot of the retablo
    for (const z of [-1.8, 1.8]) { add(k.white, lathe([[0.14, 0], [0.2, 0.25], [0.12, 0.5], [0.16, 0.6], [0, 0.6]], 12), XA + AR - 2.3, P, z); for (let i = 0; i < 9; i++) add(i % 3 ? k.flower : k.leaf, new THREE.SphereGeometry(0.11 + r() * 0.05, 8, 6), XA + AR - 2.3 + (r() - 0.5) * 0.4, P + 0.7 + r() * 0.35, z + (r() - 0.5) * 0.4); }
  }

  // ================================================================ the chapels: their altars and images
  const CHAPEL_SAINTS = ['isidro', 'antonio', 'gregorioOst', 'lucia', 'barbara', 'ana', 'blas', 'roque', 'isidro', 'antonio'];
  const CHAPELS = [
    { b: 0, s: -1, kind: 'bautismo', title: 'Capilla bautismal' },
    { b: 0, s: 1, kind: 'dolorosa', title: 'Capilla de la Virgen de los Dolores', candles: true },
    { b: 1, s: -1, kind: 'cristo', title: 'Capilla del Cristo', candles: true },
    { b: 1, s: 1, kind: 'corazon', title: 'Capilla del Sagrado Corazón' },
    { b: 3, s: -1, kind: 'jose', title: 'Altar de San José' },
    { b: 3, s: 1, kind: 'inmaculada', title: 'Altar de la Inmaculada', candles: true, mural: true },
  ];
  for (const C of CHAPELS) {
    const b = bays[C.b], s = C.s, zb = s * (HW + CD - 0.15), ry = s > 0 ? Math.PI : 0;
    const cx = b.xm;
    if (C.kind === 'bautismo') {
      // the font: a fluted granite cup on a baluster foot, a wooden lid with a little cross
      const font = lathe([[0.3, 0], [0.32, 0.12], [0.18, 0.3], [0.16, 0.5], [0.2, 0.62], [0.55, 0.8], [0.62, 1.0], [0.6, 1.05], [0, 1.05]], 24);
      add(k.granite, font, cx, 0, s * (HW + 1.6));
      add(k.darkwood, new THREE.ConeGeometry(0.64, 0.35, 24), cx, 1.22, s * (HW + 1.6));
      add(k.brass, boxGeo(0.03, 0.25, 0.03), cx, 1.5, s * (HW + 1.6));
      B.footprint(1.3, 1.3, cx, s * (HW + 1.6), 0, 1.1);
      const m = new THREE.Mesh(planeGeo(1.8, 2.6, 1), new THREE.MeshStandardMaterial({ map: oilPainting('bautismo', { seed: 77 }), roughness: 0.6 })); extra(m, cx, 3.2, zb + -s * 0.02, ry);
      for (const [fx, fy, fw, fh] of [[0, 1.36, 2.1, 0.14], [0, -1.36, 2.1, 0.14], [-0.98, 0, 0.14, 2.6], [0.98, 0, 0.14, 2.6]]) add(k.goldPlain, boxGeo(fw, fh, 0.1, 0.5), cx + fx, 3.2 + fy, zb - s * 0.04);
      // a wrought-iron screen across the chapel
      for (let x = b.xa + PW / 2 + 0.3; x < b.xb - PW / 2 - 0.2; x += 0.14) add(k.iron, boxGeo(0.025, 2.1, 0.025), x, 1.05, s * (HW + 0.35));
      add(k.iron, boxGeo(BAY - PW - 0.4, 0.05, 0.05), cx, 2.1, s * (HW + 0.35)); add(k.iron, boxGeo(BAY - PW - 0.4, 0.05, 0.05), cx, 0.15, s * (HW + 0.35));
      boxSegs(b.xa + PW / 2, s > 0 ? HW + 0.3 : -HW - 0.4, b.xb - PW / 2, s > 0 ? HW + 0.4 : -HW - 0.3, 2);
      continue;
    }
    // the altar table and a small gilded retablo on the back wall: one body of three streets, an attic
    B.block(k.step, 2.2, 0.95, 0.9, cx, 0, zb - s * 0.85, 0, 1.6);
    add(k.cloth, boxGeo(2.4, 0.03, 1.0, 1), cx, 0.97, zb - s * 0.85);
    {
      const W2 = 4.2, ox = cx, oz = zb - s * 0.12;
      const put = (key, geo, lx, ly, lz) => { geo.translate(lx, ly, lz); geo.rotateY(ry); geo.translate(ox, 0, oz); B.add(key, geo, 0, 0, 0); };
      put(k.gold, boxGeo(W2, 1.0, 0.4, 0.8), 0, 1.5, 0.05);
      put(k.goldPlain, boxGeo(W2, 3.6, 0.25, 1), 0, 3.8, -0.05);
      put(k.gold, boxGeo(W2 + 0.1, 0.36, 0.3, 1), 0, 5.4, 0.0); // the carved frieze under the cornice
      for (const lx of [-1.45, 1.45]) { put(k.gold, boxGeo(0.95, 0.22, 0.28, 1), lx, 3.05, 0.0); put(k.gold, boxGeo(0.95, 0.22, 0.28, 1), lx, 4.75, 0.0); } // carved bands round the side paintings
      for (const lx of [-W2 / 2 + 0.2, -0.75, 0.75, W2 / 2 - 0.2]) { const col = new THREE.CylinderGeometry(0.1, 0.11, 3.2, 12, 16); const p = col.attributes.position; for (let i = 0; i < p.count; i++) { const py = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), rr = Math.hypot(p.getX(i), p.getZ(i)) * (1 + 0.25 * Math.sin(a * 2 + py * 10)); p.setXYZ(i, Math.cos(a) * rr, py, Math.sin(a) * rr); } col.computeVertexNormals(); put(k.goldPlain, col, lx, 3.7, 0.2); }
      put(k.goldPlain, boxGeo(W2 + 0.3, 0.2, 0.55, 1), 0, 5.65, 0.12);
      put(k.goldPlain, boxGeo(1.6, 1.4, 0.25, 1), 0, 6.45, -0.05); put(k.gold, boxGeo(1.3, 1.1, 0.27, 1), 0, 6.45, -0.05);
      const arc = new THREE.TorusGeometry(0.8, 0.1, 6, 16, Math.PI); put(k.goldPlain, arc, 0, 7.15, 0.0);
      put(k.velvet, boxGeo(1.2, 3.0, 0.04, 1), 0, 3.75, 0.1);
      for (const lx of [-1.45, 1.45]) {
        const m = new THREE.Mesh(planeGeo(0.8, 1.3, 1), new THREE.MeshStandardMaterial({ map: oilPainting(CHAPEL_SAINTS[(CHAPELS.indexOf(C) * 2 + (lx < 0 ? 0 : 1)) % CHAPEL_SAINTS.length], { seed: 40 + CHAPELS.indexOf(C) * 2 + (lx < 0 ? 0 : 1) }), roughness: 0.6 }));
        const c = Math.cos(ry), sn = Math.sin(ry); m.position.set(OX + ox + lx * c + 0.12 * sn, 3.9, OZ + oz - lx * sn + 0.12 * c); m.rotation.y = ry; B.extra.push(m);
      }
      const c = Math.cos(ry), sn = Math.sin(ry);
      carve(B, C.kind, ox + 0.3 * sn, C.kind === 'cristo' ? 2.1 : 2.15, oz + 0.3 * c, ry, C.kind === 'cristo' ? 1.5 : 1.55, k);
    }
    // a stand of candles before it (light one yourself)
    if (C.candles) {
      const vx = cx + 2.0, vz = s * (HW + 0.9);
      add(k.iron, boxGeo(1.4, 0.04, 0.45, 1), vx, 0.95, vz); add(k.iron, boxGeo(0.04, 0.95, 0.04), vx - 0.6, 0.47, vz); add(k.iron, boxGeo(0.04, 0.95, 0.04), vx + 0.6, 0.47, vz);
      const stand = { x: OX + vx, z: OZ + vz, lit: [], free: [] };
      for (let i = 0; i < 12; i++) { const px = vx - 0.55 + (i % 6) * 0.22, pz = vz + (i < 6 ? -0.1 : 0.1); stand.free.push([px, pz]); }
      B.stands = B.stands || []; B.stands.push(stand);
      for (let i = 0; i < 4; i++) litCandle(B, stand, k);
      B.interact({ type: 'vela', x: vx, z: s * (HW + 0.2), r: 1.4, label: 'Encender una vela <small>(0,50 € en el cepillo)</small>', stand });
      point(vx, 1.3, vz, 0xffb060, 1.6, 5, true);
    }
    // the wall painting of Santo Domingo and Santa Catalina, half hidden behind the right-hand collateral altar
    if (C.mural) {
      for (const [kind, dx] of [['domingo', -1.85], ['catalina', 1.85]]) {
        const m = new THREE.Mesh(planeGeo(1.0, 1.9, 1), new THREE.MeshStandardMaterial({ map: oilPainting(kind, { seed: 31, fresco: true }), roughness: 0.95 }));
        extra(m, cx + dx, 3.5, zb - s * 0.01, ry);
      }
      B.interact({ type: 'info', x: cx, z: s * (HW + 1.2), r: 1.6, label: 'Pintura mural', text: 'Detrás del altar colateral asoma una pintura mural antigua: Santo Domingo de Guzmán y Santa Catalina de Siena.' });
    }
    B.interact({ type: 'info', x: cx, z: s * (HW + 1.0), r: 1.2, label: C.title, text: chapelText(C.kind) });
  }

  // ================================================================ the pulpit, the stoups, the confessionals, the Way of the Cross
  {
    // the pulpit, on the Gospel side against the column between the second and third bays: a granite cup on a
    // column, an iron stair, a wooden sounding board above
    const px = bays[1].xb, pz = -HW + 1.25;
    add(k.granite, lathe([[0.18, 0], [0.18, 2.0], [0.3, 2.2], [0.62, 2.45], [0.7, 3.4], [0.74, 3.5], [0, 3.5]], 16), px, 0, pz);
    add(k.darkwood, new THREE.CylinderGeometry(0.95, 0.95, 0.12, 16), px, 5.8, pz - 0.3);
    add(k.gold, new THREE.ConeGeometry(0.9, 0.5, 16), px, 6.15, pz - 0.3);
    add(k.darkwood, boxGeo(0.1, 2.2, 0.8, 1), px, 4.65, pz - 0.75);
    for (let i = 0; i < 10; i++) add(k.iron, boxGeo(0.7, 0.04, 0.28), px + 0.9 + i * 0.22, 0.34 * (i + 1), pz + 0.2);
    add(k.iron, tube([V(px + 0.75, 1.0, pz + 0.52), V(px + 3.0, 4.2, pz + 0.52)], 0.02, 4));
    B.footprint(1.4, 1.2, px, pz, 0, 2);
    B.footprint(2.3, 0.7, px + 1.9, pz + 0.2, 0, 1.4);
    // holy water at the doors: shells of granite on a foot
    const stoup = (x, z) => { add(k.granite, lathe([[0.1, 0], [0.12, 0.6], [0.08, 0.8], [0.32, 0.92], [0.36, 1.0], [0, 1.0]], 16), x, 0, z); B.footprint(0.6, 0.6, x, z, 0, 1); };
    stoup(X0 + 3.0, -2.6); stoup(X0 + 3.0, 2.6); stoup(sx3 - 2.4, HW + CD - 2.9);
    B.interact({ type: 'pila', x: X0 + 3.0, z: -2.6, r: 1.0, label: 'Santiguarse con agua bendita' });
    B.interact({ type: 'pila', x: X0 + 3.0, z: 2.6, r: 1.0, label: 'Santiguarse con agua bendita' });
    // the plaque and the collection box by the main door
    const pl = new THREE.Mesh(planeGeo(0.9, 0.56, 1), new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.6 })); extra(pl, X0 + 0.05, 1.7, -2.3, Math.PI / 2);
    B.interact({ type: 'info', x: X0 + 1.2, z: -2.3, r: 1.2, label: 'Leer la placa', text: 'Santa María de Guareña: empezada en 1557 con trazas de Sancho de Cabrera, la siguió Rodrigo Gil de Hontañón (1560). La torre se acabó en 1700 y la fachada en 1793. En 1900 se hundió una bóveda; se reabrió en 1917. El retablo mayor es de 1945–49.' });
    add(k.darkwood, boxGeo(0.35, 0.5, 0.25, 1), X0 + 0.5, 1.0, 2.5); add(k.iron, boxGeo(0.1, 1.0, 0.1), X0 + 0.5, 0.5, 2.5);
    B.interact({ type: 'cepillo', x: X0 + 1.1, z: 2.6, r: 1.0, label: 'Echar un donativo <small>(1 €)</small>' });
    // two confessionals in the door bay
    for (const s of [-1, 1]) {
      const cx = doorBay.xa + PW / 2 + 0.6, cz = s * (HW + CD - 0.75);
      B.block(k.darkwood, 1.6, 2.4, 1.1, cx, 0, cz, 0, 1.2);
      add(k.darkwood, new THREE.ConeGeometry(1.0, 0.5, 4).rotateY(Math.PI / 4), cx, 2.65, cz);
      add(k.velvet, boxGeo(0.5, 1.5, 0.02, 1), cx, 1.25, cz - s * 0.56);
    }
    // the Way of the Cross: fourteen little framed stations round the nave, on the piers
    let n = 0;
    for (const s of [-1, 1]) for (let i = 0; i <= NB && n < 14; i++) {
      for (const dx of [-0.75, 0.75]) {
        if (n >= 14) break;
        const x = XC + i * BAY + dx; if (x > XP - 1 || x < XC) continue;
        const m = new THREE.Mesh(planeGeo(0.42, 0.52, 1), new THREE.MeshStandardMaterial({ map: viaCrucisTexture(n), roughness: 0.6 }));
        extra(m, x, 2.9, s * (HW + 0.79), s > 0 ? Math.PI : 0);
        for (const [fw, fh, fx, fy] of [[0.52, 0.05, 0, 0.285], [0.52, 0.05, 0, -0.285], [0.05, 0.52, 0.235, 0], [0.05, 0.52, -0.235, 0]]) add(k.goldPlain, boxGeo(fw, fh, 0.03, 1), x + fx, 2.9 + fy, s * (HW + 0.8));
        add(k.darkwood, boxGeo(0.035, 0.26, 0.03), x, 3.42, s * (HW + 0.8)); add(k.darkwood, boxGeo(0.16, 0.035, 0.03), x, 3.48, s * (HW + 0.8));
        n++;
      }
    }
  }

  // ================================================================ the pews: two blocks, a cross aisle between the side doors. Oak:
  // ends cut with a scroll for the arm, a panelled back with the shelf for the missals behind it, a padded kneeler
  const pews = [];
  {
    const zIn = 1.25, zOut = HW - 1.0, len = zOut - zIn, pitch = 0.98;
    // the end's profile (x: + towards the altar), extruded across
    const endShape = new THREE.Shape();
    endShape.moveTo(0.3, 0); endShape.lineTo(0.3, 0.6); endShape.quadraticCurveTo(0.31, 0.72, 0.2, 0.74); endShape.lineTo(0.02, 0.75);
    endShape.quadraticCurveTo(-0.14, 0.8, -0.2, 0.98); endShape.quadraticCurveTo(-0.23, 1.06, -0.3, 1.02); endShape.lineTo(-0.31, 0); endShape.closePath();
    const endGeo = new THREE.ExtrudeGeometry(endShape, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 });
    endGeo.translate(0, 0, -0.0275);
    { const uvA = endGeo.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 0.6, uvA.getY(i) * 0.6); }
    const panelShape = new THREE.Shape(); panelShape.moveTo(0.2, 0.12); panelShape.lineTo(0.2, 0.56); panelShape.lineTo(-0.2, 0.56); panelShape.lineTo(-0.2, 0.12); panelShape.closePath();
    const panelGeo = new THREE.ExtrudeGeometry(panelShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.01, bevelSegments: 1 });
    for (let x = XC + 2.0; x < XP - 1.2; x += pitch) {
      if (x > doorBay.xa + 1.6 && x < doorBay.xb - 1.6) continue; // (the aisle from door to door)
      for (const s of [-1, 1]) {
        const zc = s * (zIn + len / 2);
        add(k.pew, boxGeo(0.4, 0.045, len, 1), x + 0.01, 0.44, zc);                                     // the seat
        add(k.pew, new THREE.CylinderGeometry(0.024, 0.024, len, 8).rotateX(Math.PI / 2), x + 0.21, 0.44, zc); // its rounded front
        add(k.pew, boxGeo(0.035, 0.44, len, 1).rotateZ(0.13), x - 0.22, 0.73, zc);                         // the back, leaning a little
        add(k.pew, boxGeo(0.05, 0.03, len - 0.1, 1).rotateZ(0.13), x - 0.235, 0.62, zc);                   // its panels' rails
        add(k.pew, boxGeo(0.05, 0.03, len - 0.1, 1).rotateZ(0.13), x - 0.205, 0.86, zc);
        add(k.pew, boxGeo(0.09, 0.06, len, 1), x - 0.2, 0.98, zc);                                       // the top rail, where hands rest
        add(k.pew, boxGeo(0.13, 0.025, len - 0.08, 1), x - 0.31, 0.8, zc);                               // the shelf behind for the missals
        add(k.pew, boxGeo(0.02, 0.06, len - 0.08, 1), x - 0.37, 0.84, zc);
        add(k.kneel, boxGeo(0.15, 0.06, len - 0.1, 1), x + 0.47, 0.13, zc);                               // the padded kneeler (for the pew in front of you)
        add(k.pew, boxGeo(0.17, 0.02, len - 0.06, 1), x + 0.47, 0.095, zc);
        for (const e of [-1, 1]) {
          const ez = zc + e * (len / 2 + 0.03);
          add(k.pew, endGeo.clone(), x - 0.02, 0, ez);
          if ((s > 0 && e < 0) || (s < 0 && e > 0)) { const pg = panelGeo.clone(); if (e > 0) pg.rotateY(Math.PI); add(k.pew, pg, x - 0.02, 0, ez + e * 0.034); } // the carved panel on the aisle end
        }
        B.footprint(0.62, len + 0.12, x, zc, 0, 1);
        pews.push({ x, z0: s > 0 ? zIn : -zOut, z1: s > 0 ? zOut : -zIn, s });
        // sit down in it (from the central aisle)
        if (pews.length % 3 === 1) B.interact({ type: 'banco', x: x + 0.5, z: s * (zIn - 0.35), r: 0.85, label: 'Sentarte en el banco', sx: OX + x - 0.04, sz: OZ + s * (zIn + 0.45) });
      }
    }
  }

  // ================================================================ the granite plinth along the walls (a metre, its moulding on top)
  {
    const plinth = (ax, az, bx, bz, nx, nz, y0 = 0, h = 0.95) => {
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) return;
      const g = new THREE.PlaneGeometry(L, h); { const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * L / 1.6, uvA.getY(i)); }
      const ry = Math.atan2(nx, nz);
      g.rotateY(ry); add(k.plinth, g, (ax + bx) / 2 + nx * 0.075, y0 + h / 2, (az + bz) / 2 + nz * 0.075);
      const m = boxGeo(L, 0.06, 0.06, 1.6); m.rotateY(ry); add(k.granite, m, (ax + bx) / 2 + nx * 0.09, y0 + h + 0.03, (az + bz) / 2 + nz * 0.09);
    };
    plinth(X0, -HW, X0, -1.95, 1, 0); plinth(X0, 1.95, X0, HW, 1, 0);
    for (const s of [-1, 1]) {
      const zz = s * HW;
      if (s > 0) { plinth(X0 + 0.07, zz, X0 + 3.15, zz, 0, -s); plinth(X0 + 4.45, zz, XC - 0.95, zz, 0, -s); } else plinth(X0 + 0.07, zz, XC - 0.95, zz, 0, -s);
      const zo = s * (HW + CD);
      for (const b of bays) {
        const x0 = b.xa + PW / 2, x1 = b.xb - PW / 2;
        if (b === doorBay) { plinth(x0, zo, b.xm - 1.95, zo, 0, -s); plinth(b.xm + 1.95, zo, x1, zo, 0, -s); }
        else plinth(x0, zo, x1, zo, 0, -s);
        plinth(x0 - 0.07, s * (HW + 0.95), x0 - 0.07, zo, 1, 0);   // the piers' faces either side of the chapel
        plinth(x1 + 0.07, s * (HW + 0.95), x1 + 0.07, zo, -1, 0);
      }
    }
    // round the apse, on the presbytery floor (but not across the sacristy's door)
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI, am = (a0 + a1) / 2;
      if (Math.abs(am - 1.32) < 0.12) continue;
      const R = AR;
      plinth(XA + Math.cos(a0) * R, Math.sin(a0) * R, XA + Math.cos(a1) * R, Math.sin(a1) * R, -Math.cos(am), -Math.sin(am), P, 0.8);
    }
  }

  // ================================================================ light: chandeliers, wall lamps, the retablo's lamps
  const chand = [];
  for (const b of bays) {
    const x = b.xm, y = 7.2, ytop = vaultY(x, 0, b.xa, b.xb, S, HW, 0.5) - 0.3;
    add(k.brass, new THREE.CylinderGeometry(0.012, 0.012, ytop - y - 0.6, 4).translate(0, (ytop + y + 0.6) / 2, 0), x, 0, 0);
    add(k.brass, lathe([[0.05, 0], [0.22, 0.12], [0.12, 0.3], [0.07, 0.6], [0, 0.62]], 12), x, y - 0.2, 0);
    for (const [rr, yy, n] of [[1.3, y, 12], [0.8, y + 0.45, 8]]) {
      const ring = new THREE.TorusGeometry(rr, 0.03, 4, 32); ring.rotateX(Math.PI / 2); add(k.brass, ring, x, yy, 0);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; add(k.candle, new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), x + Math.cos(a) * rr, yy + 0.1, Math.sin(a) * rr); }
    }
    const bulbs = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 4, 32), new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd890, emissiveIntensity: 1.8 }));
    bulbs.rotation.x = Math.PI / 2; extra(bulbs, x, y + 0.2, 0); bulbs.userData.lamp = true; chand.push(bulbs);
    point(x, y - 0.2, 0, 0xffdcaa, 14, 24);
  }
  // the retablo lit from below, warm
  for (const z of [-3.5, 3.5]) {
    const sp = new THREE.SpotLight(0xffd8a0, 60, 26, 0.55, 0.6, 1.5);
    sp.position.set(OX + XP + 1.6, 4.2, OZ + z); sp.target.position.set(OX + XA + AR - 1.2, 7.5, OZ + z * 0.3);
    sp.userData.base = 60; B.lights.push(sp); B.extra.push(sp.target);
  }
  point(XC - 3.5, 4.0, 0, 0xffe0b8, 4, 14); // under the choir
  point(XA + 3, 10, 0, 0xffe2b8, 6, 20);     // the apse, high

  // ================================================================ the floor, for walking (the steps of the presbytery)
  const floorY = (x, z) => {
    const lx = x - OX, lz = z - OZ;
    if (lx < XP || Math.abs(lz) > HW + 0.5) return 0;
    if (lx < XP + 1.5) return Math.ceil(((lx - XP) / 1.5) * NS) * rise * 0.999;
    return P;
  };
  // the walls round the inside (the kit took the wall segments; add the apse, the chapel backs)
  const h = B.finish();
  // the glass lets the sun through (it must not cast a shadow); it glows by day, goes dark by night
  const gm = B.mats.get(glass);
  for (const m of h.group.children) if (m.isMesh && m.material === gm) { m.castShadow = false; m.receiveShadow = false; }
  h.glass = gm;
  h.floorY = (x, z, y) => floorY(x, z);
  h.church = true;
  h.thirdPerson = true;
  h.daylight = { sun: 1.15, hemi: 0.5 };
  h.windows = windows.map((w) => ({ ...w, x: w.x + OX, z: w.z + OZ }));
  h.pews = pews.map((p) => ({ ...p, x: p.x + OX, z0: p.z0 + OZ, z1: p.z1 + OZ }));
  h.stands = B.stands || [];
  h.chandeliers = chand;
  h.origin = { x: OX, z: OZ };
  h.altar = { x: OX + XA - 0.6, z: OZ, y: P };
  h.spots.entrada = B.spots.entrada; h.spots.sur = B.spots.sur;
  h.cancels = cancels;
  h.beams = makeBeams(h.group, h.windows);
  return h;
}

function chapelText(kind) {
  return {
    dolorosa: 'La Virgen de los Dolores, de luto, con el puñal de plata en el pecho. Delante, las velas que encienden los vecinos.',
    cristo: 'Un Cristo crucificado sobre terciopelo granate. Le rezan sobre todo las mujeres mayores, por la tarde.',
    corazon: 'El Sagrado Corazón de Jesús, con la túnica roja y el manto blanco.',
    jose: 'San José con el Niño y la vara de azucenas, en un retablito dorado.',
    inmaculada: 'La Inmaculada sobre la luna, de blanco y azul. Es el altar colateral derecho.',
  }[kind] || '';
}
// a candle lit on a stand: a little flame that flickers
function litCandle(B, stand, k) {
  if (!stand.free.length) return null;
  const [x, z] = stand.free.shift();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), B.mats.get(k.candle));
  c.position.set(B.ox + x, 1.03, B.oz + z);
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffc860 }));
  f.scale.set(1, 2.2, 1); f.position.set(0, 0.085, 0); f.userData.flame = true; c.add(f);
  B.extra.push(c); stand.lit.push(c);
  return c;
}
export function lightCandle(h, stand) {
  if (!stand.free.length) return false;
  const [x, z] = stand.free.shift();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xf2ead2, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.15 }));
  c.position.set(h.origin.x + x, 1.03, h.origin.z + z);
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffc860 }));
  f.scale.set(1, 2.2, 1); f.position.set(0, 0.085, 0); f.userData.flame = true; c.add(f);
  h.group.add(c); stand.lit.push(c);
  return true;
}

// ---------------------------------------------------------------- beams of sunlight through the windows (dust in them)
const BEAM_VS = `
uniform vec3 uBase; uniform vec3 uU; uniform vec3 uV; uniform vec3 uD; uniform float uLen;
varying vec3 vL;
void main() {
  vec3 p = uBase + uU * position.x + uV * position.y + uD * (position.z * uLen);
  vL = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BEAM_FS = `
uniform float uK; uniform float uTime; uniform vec3 uCol;
varying vec3 vL;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  // (only the box's faces are drawn: on each face one of x, y sits at ±0.5 and the other runs across it)
  float edge = 1.0 - smoothstep(0.18, 0.5, min(abs(vL.x), abs(vL.y)));
  float along = smoothstep(0.0, 0.08, vL.z) * (1.0 - smoothstep(0.55, 1.0, vL.z));
  float dust = 0.85 + 0.15 * sin(vL.z * 40.0 + uTime * 0.6 + vL.x * 7.0);
  float motes = step(0.996, h(floor(vec2(vL.x * 30.0 + vL.z * 7.0, vL.y * 30.0 + uTime * 0.4)))) * 2.0;
  gl_FragColor = vec4(uCol * (dust + motes), edge * along * uK);
}`;
function makeBeams(group, windows) {
  const out = [];
  for (const w of windows) {
    const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0, 0.5);
    const u = {
      uBase: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uV: { value: new THREE.Vector3() }, uD: { value: new THREE.Vector3() }, uLen: { value: 20 },
      uK: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.92, 0.72) },
    };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 5; m.userData.noInk = true;
    group.add(m);
    out.push({ w, m, u });
  }
  return out;
}
// each frame: the beams follow the sun (only the windows it shines into have one)
export function updateBeams(h, sky, dt) {
  if (!h || !h.beams) return;
  if (h.glass) { const n = sky.night || 0; h.glass.emissiveIntensity = lerp(1.35, 0.06, n); h.glass.color.setRGB(lerp(1, 0.25, n), lerp(0.97, 0.3, n), lerp(0.88, 0.45, n)); }
  const sun = sky.lightDir || (sky.sun && sky.sun.position.clone().sub(sky.sun.target.position).normalize());
  const up = sun ? sun.y : -1;
  const d = sun ? new THREE.Vector3(-sun.x, -sun.y, -sun.z) : new THREE.Vector3(0, -1, 0);
  const day = clamp((up - 0.05) / 0.25, 0, 1) * (1 - (sky.night || 0));
  for (const b of h.beams) {
    const w = b.w, u = b.u;
    u.uTime.value += dt;
    const facing = -(d.x * w.nx + d.z * w.nz); // light coming in through this window (from outside)
    const k = day * clamp(facing * 2.5, 0, 1) * (w.apse ? 0.6 : 1);
    u.uK.value = lerp(u.uK.value, k * 0.15, Math.min(1, dt * 2));
    b.m.visible = u.uK.value > 0.004;
    if (!b.m.visible) continue;
    const cy = (w.y0 + w.y1) / 2;
    u.uBase.value.set(w.x - w.nx * 0.2, cy, w.z - w.nz * 0.2);
    u.uU.value.set(-w.nz, 0, w.nx).multiplyScalar(w.w); // across the window
    u.uV.value.set(0, w.y1 - w.y0, 0);
    u.uD.value.copy(d);
    u.uLen.value = clamp(cy / Math.max(0.08, -d.y), 4, 40);
  }
}

// ---------------------------------------------------------------- the people inside: praying in the pews; at mass time the
// church fills up, the priest at the altar and the faithful answering him
const MASS = [
  ['En el nombre del Padre, y del Hijo, y del Espíritu Santo.', 'Amén.'],
  ['El Señor esté con vosotros.', 'Y con tu espíritu.'],
  ['Palabra de Dios.', 'Te alabamos, Señor.'],
  ['Levantemos el corazón.', 'Lo tenemos levantado hacia el Señor.'],
  ['Este es el sacramento de nuestra fe.', 'Anunciamos tu muerte, proclamamos tu resurrección. ¡Ven, Señor Jesús!'],
  ['La paz del Señor esté siempre con vosotros.', 'Y con tu espíritu.'],
  ['Podéis ir en paz.', 'Demos gracias a Dios.'],
];
export class ChurchLife {
  constructor(g, h, { randomDesc, massTime, weekday }) {
    this.g = g; this.h = h; this.people = []; this.t = 0; this.line = 0; this.lineT = 4;
    const hour = g.sky.hour, wd = weekday(g.sky), m = massTime(hour, wd);
    this.mass = m && m.phase === 'durante';
    const n = m ? (m.phase === 'durante' ? 22 : m.phase === 'antes' ? 12 : 6) : hour >= 8 && hour < 21.5 ? 2 + Math.floor(Math.random() * 4) : hour >= 7 ? 1 : 0;
    const rnd = Math.random, used = [];
    // the front rows fill first; nobody sits on anyone
    const pews = h.pews.slice().sort((a, b) => b.x - a.x);
    for (let i = 0; i < n * 6 && this.people.length < n; i++) {
      const pw = pews[Math.floor(Math.pow(rnd(), 1.6) * pews.length)];
      const z = pw.z0 + 0.4 + rnd() * (pw.z1 - pw.z0 - 0.8);
      if (used.some((q) => Math.abs(q.x - pw.x) < 0.3 && Math.abs(q.z - z) < 0.75)) continue;
      used.push({ x: pw.x, z });
      const d = randomDesc();
      d.elderly = rnd() < 0.62; d.cane = false;
      if (d.elderly) { d.hair = 6; if (d.gender === 'f' && rnd() < 0.5) { d.top = '#1d1f24'; d.bottom = '#1d1f24'; } if (d.gender === 'm' && rnd() < 0.4) { d.accessory = null; } }
      this.sit(d, pw.x - 0.04, z, Math.PI / 2);
    }
    if (this.mass) this.priest();
  }
  sit(desc, x, z, heading) {
    const ch = this.g.chars.create(desc);
    ch.object.position.set(x, 0, z); ch.object.rotation.y = heading;
    ch.setBase('sit');
    this.g.scene.add(ch.object);
    const p = { ch, x, z, y: 0, heading };
    this.people.push(p);
    return p;
  }
  // the priest behind the altar, facing the people: white alb, a green chasuble over it
  priest() {
    const a = this.h.altar, g = this.g;
    const ch = g.chars.create({ gender: 'm', skin: 1, hair: 6, hairStyle: 'corto', age: 58, top: '#f2f0e8', topStyle: 'shirt', bottom: '#f2f0e8', bottomStyle: 'pants', shoes: '#111111', build: 1.0 });
    const x = a.x + 0.95, z = a.z;
    ch.object.position.set(x, a.y, z); ch.object.rotation.y = -Math.PI / 2;
    g.scene.add(ch.object);
    const cas = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0.62], [0.3, 0.55], [0.42, 0.25], [0.44, 0]].map(([r2, y]) => new THREE.Vector2(r2, y)), 16), new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.7, side: THREE.DoubleSide }));
    cas.scale.set(1, 1, 0.6); cas.position.set(x, a.y + 0.78, z);
    g.scene.add(cas);
    this.extras = [cas];
    this.priestP = { ch, x, z, y: a.y, heading: -Math.PI / 2, priest: true };
    this.people.push(this.priestP);
  }
  update(dt) {
    this.t += dt;
    for (const p of this.people) { p.ch.update(dt, 0, { fidget: false }); p.ch.object.position.set(p.x, p.y, p.z); p.ch.object.rotation.y = p.heading; }
    if (!this.mass || !this.priestP) return;
    this.lineT -= dt;
    if (this.lineT > 0) return;
    const [said, answer] = MASS[this.line % MASS.length];
    const pr = this.priestP;
    this.g.peds.say({ x: pr.x, z: pr.z, y: pr.y }, said, true);
    pr.ch.setBase('talk');
    setTimeout(() => {
      if (!this.people.length) return;
      pr.ch.setBase(null);
      const f = this.people[Math.floor(Math.random() * (this.people.length - 1))];
      if (f && !f.priest) this.g.peds.say({ x: f.x, z: f.z, y: 0 }, answer, true);
    }, 2600 + said.length * 30);
    this.line++;
    this.lineT = 10 + Math.random() * 6;
  }
  dispose() {
    for (const p of this.people) { this.g.scene.remove(p.ch.object); p.ch.dispose(); }
    for (const e of this.extras || []) { this.g.scene.remove(e); e.geometry.dispose(); }
    this.people = [];
  }
}
