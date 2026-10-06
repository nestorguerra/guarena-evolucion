// The images of the altars, carved and painted as the imagineros did them: a head with its features cut in the wood
// and the flesh painted over («encarnadura»: the eyes, the brows, the lips, a blush on the cheeks); the tunic and the
// mantle falling in folds, the mantle lined in another colour and both gilded over in small flowers («estofado»); the
// hands joined or holding; crowns, haloes, the sunburst; the peana of clouds and cherubs, or of gilded mouldings. And the
// crucified Christ: the body hung from the nails, the head fallen on the right shoulder, the crown of thorns, the
// loincloth knotted at the hip.
//   statue(B, kind, x, y, z, ry, h, k) — kind: virgen, inmaculada, dolorosa, corazon, jose, carmen, antonio, juan, cristo;
//   (x, y, z) the foot of the image in the church's coordinates, ry its turn (its face looks along local +z), h its height.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, clamp } from './util.js';

const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (dx, dy, sx, sy) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));

// ---------------------------------------------------------------- the paint
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = false) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
// the painted face over the carved head (an equirectangular sheet: the face is round u = 0.25)
const MEMO = new Map();
const memo = (key, fn) => { if (!MEMO.has(key)) MEMO.set(key, fn()); return MEMO.get(key); };
function faceTexture(kind) { return memo('face' + kind, () => faceTexture_(kind)); }
function faceTexture_(kind) {
  const W = 512, H = 256, c = cnv(W, H), x = c.getContext('2d');
  const sk = kind === 'cristo' ? '#e2cdb4' : kind === 'maria' ? '#f0d2b8' : '#e2b896';
  x.fillStyle = sk; x.fillRect(0, 0, W, H);
  const cx = W * 0.25, ey = H * 0.47;
  // the blush, the shadow under the brows
  for (const sx of [-1, 1]) { const g = x.createRadialGradient(cx + sx * 34, H * 0.6, 2, cx + sx * 34, H * 0.6, 26); g.addColorStop(0, kind === 'cristo' ? 'rgba(170,110,100,0.25)' : 'rgba(225,120,110,0.4)'); g.addColorStop(1, 'rgba(225,120,110,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 17;
    const g = x.createRadialGradient(ex, ey - 2, 1, ex, ey, 13); g.addColorStop(0, 'rgba(120,70,50,0.35)'); g.addColorStop(1, 'rgba(120,70,50,0)'); x.fillStyle = g; x.fillRect(ex - 14, ey - 14, 28, 28);
    if (kind === 'cristo') { x.strokeStyle = 'rgba(60,30,20,0.9)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(ex - 7, ey + 1); x.quadraticCurveTo(ex, ey + 3, ex + 7, ey + 1); x.stroke(); }
    else {
      x.fillStyle = '#f6f0e6'; x.beginPath(); x.ellipse(ex, ey + 1, 7, 3.2, 0, 0, 6.283); x.fill();
      x.fillStyle = kind === 'maria' ? '#3a2a1e' : '#2e2016'; x.beginPath(); x.arc(ex + sx * -0.5, ey + 1.6, 2.8, 0, 6.283); x.fill(); // the gaze a little down
      x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(ex - 1, ey + 0.6, 0.8, 0, 6.283); x.fill(); // glass eyes catch the light
      x.strokeStyle = 'rgba(50,25,15,0.9)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(ex - 8, ey + 0.5); x.quadraticCurveTo(ex, ey - 3.5, ex + 8, ey + 0.5); x.stroke(); // the upper lid
    }
    x.strokeStyle = kind === 'maria' ? 'rgba(90,60,40,0.75)' : 'rgba(60,40,28,0.85)'; x.lineWidth = 2; x.beginPath(); x.moveTo(ex - 9, ey - 8 - (kind === 'dolor' ? sx * -2 : 0)); x.quadraticCurveTo(ex, ey - 12, ex + 9, ey - 7 + (kind === 'dolor' ? sx * -2 : 0)); x.stroke(); // brows
  }
  // the nose's shadow, the lips
  x.strokeStyle = 'rgba(140,80,60,0.45)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx + 3, ey + 4); x.quadraticCurveTo(cx + 6, ey + 18, cx + 2, ey + 22); x.stroke();
  x.fillStyle = kind === 'cristo' ? 'rgba(150,80,80,0.75)' : 'rgba(190,80,80,0.85)'; x.beginPath(); x.ellipse(cx, H * 0.66, 8, 2.6, 0, 0, 6.283); x.fill();
  x.strokeStyle = 'rgba(100,40,35,0.8)'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx - 8, H * 0.66); x.quadraticCurveTo(cx, H * 0.665 + 1, cx + 8, H * 0.66); x.stroke();
  if (kind === 'dolor' || kind === 'cristo') for (const sx of [-1, 1]) { x.fillStyle = kind === 'cristo' ? 'rgba(140,20,20,0.6)' : 'rgba(230,240,250,0.85)'; x.beginPath(); x.ellipse(cx + sx * 17, ey + 9, 1.4, 3, 0, 0, 6.283); x.fill(); } // tears (or blood from the thorns)
  return tex(c);
}
// gilded flowers sown over a colour; the hem a band of gold
const hexRGB = (h) => { const v = parseInt(h.slice(1), 16); return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`; };
function estofado(base, gold = '#e2b450', dense = 1, seed = 1) { return memo(`est${base}${gold}${dense}${seed}`, () => estofado_(base, gold, dense, seed)); }
function estofado_(base, gold, dense, seed) {
  const S = 256, c = cnv(S, S), x = c.getContext('2d'), r = mulberry32(seed);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.04})`; x.fillRect(r() * S, r() * S, 1 + r() * 3, 6 + r() * 20); } // the brush
  // small gilded flowers in a staggered net, a fine scroll between them (the punched gold of estofado)
  const n = Math.round(16 * dense), gc = hexRGB(gold);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = (i + 0.5 + (j % 2) * 0.5) * S / n, cy = (j + 0.5) * S / n, rr = (S / n) * 0.2;
    x.fillStyle = `rgba(${gc},0.8)`;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283 + r() * 0.3; x.beginPath(); x.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rr * 0.62, rr * 0.3, a, 0, 6.283); x.fill(); }
    x.fillStyle = `rgba(${gc},1)`; x.beginPath(); x.arc(cx, cy, rr * 0.3, 0, 6.283); x.fill();
    x.strokeStyle = `rgba(${gc},0.45)`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(cx + rr * 1.3, cy); x.quadraticCurveTo(cx + rr * 2.1, cy - rr * 0.9, cx + rr * 2.5, cy + rr * 0.3); x.stroke();
  }
  return tex(c, true);
}
function mats(B) {
  const m = (key, make) => B.mat(key, make);
  return {
    face: m('st_face', () => new THREE.MeshStandardMaterial({ map: faceTexture('santo'), roughness: 0.42 })),
    faceM: m('st_faceM', () => new THREE.MeshStandardMaterial({ map: faceTexture('maria'), roughness: 0.4 })),
    faceD: m('st_faceD', () => new THREE.MeshStandardMaterial({ map: faceTexture('dolor'), roughness: 0.4 })),
    faceC: m('st_faceC', () => new THREE.MeshStandardMaterial({ map: faceTexture('cristo'), roughness: 0.45 })),
    flesh: m('st_flesh', () => new THREE.MeshStandardMaterial({ color: 0xe8c4a2, roughness: 0.42 })),
    fleshC: m('st_fleshC', () => new THREE.MeshStandardMaterial({ color: 0xdcc6aa, roughness: 0.48 })),
    blood: m('st_blood', () => new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.4 })),
    hairD: m('st_hairD', () => new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6 })),
    hairL: m('st_hairL', () => new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.6 })),
    hairG: m('st_hairG', () => new THREE.MeshStandardMaterial({ color: 0xb4aca0, roughness: 0.6 })),
    white: m('st_white', () => new THREE.MeshStandardMaterial({ map: estofado('#f0ebe0', '#d8aa48', 1, 3), roughness: 0.6 })),
    blue: m('st_blue', () => new THREE.MeshStandardMaterial({ map: estofado('#24418c', '#e0b24e', 0.8, 5), roughness: 0.55 })),
    black: m('st_black', () => new THREE.MeshStandardMaterial({ map: estofado('#17151a', '#c0c4cc', 0.6, 7), roughness: 0.7 })),
    red: m('st_red', () => new THREE.MeshStandardMaterial({ map: estofado('#8c1c22', '#e0b24e', 0.9, 9), roughness: 0.55 })),
    cream: m('st_cream', () => new THREE.MeshStandardMaterial({ map: estofado('#e8dcc0', '#c89a40', 0.7, 11), roughness: 0.6 })),
    purple: m('st_purple', () => new THREE.MeshStandardMaterial({ map: estofado('#5a3a62', '#e0b24e', 0.9, 13), roughness: 0.6 })),
    ochre: m('st_ochre', () => new THREE.MeshStandardMaterial({ map: estofado('#c08a2c', '#ffe08a', 1.1, 15), roughness: 0.45, metalness: 0.25 })),
    brown: m('st_brown', () => new THREE.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.8 })),
    green: m('st_green', () => new THREE.MeshStandardMaterial({ map: estofado('#2c5e36', '#e0b24e', 0.9, 17), roughness: 0.55 })),
    lining: m('st_lining', () => new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.6, side: THREE.DoubleSide })),
    liningG: m('st_liningG', () => new THREE.MeshStandardMaterial({ color: 0xd0a044, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide })),
    cloud: m('st_cloud', () => new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.85 })),
    wood: m('st_wood', () => new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 0.6 })),
  };
}

// ---------------------------------------------------------------- shapes
// a garment: rings from the hem (t = 0) up (t = 1), each an ellipse of half-width a(t), half-depth b(t) centred at
// (cx(t), y(t), cz(t)); folds round it, deeper towards the hem. ang 0 is the front (+z). arc: [from, to] for a shell
// open at the front (a mantle); flip: faces looking inwards (its lining)
function garment({ H, a, b, cx = () => 0, cz = () => 0, folds = 9, depth = 0.03, segs = 44, rows = 26, arc = null, flip = false, seed = 1, y0 = 0, inset = 0 }) {
  const pos = [], uv = [], idx = [], r = mulberry32(seed), ph = r() * 6;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, y = y0 + t * H;
    for (let j = 0; j <= segs; j++) {
      const u = j / segs, ang = arc ? arc[0] + (arc[1] - arc[0]) * u : u * Math.PI * 2;
      const fd = depth * Math.pow(1 - t, 1.3) * (0.65 * Math.sin(ang * folds + ph + Math.sin(t * 4 + ang) * 1.2) + 0.35 * Math.sin(ang * folds * 2.1 + 2 * ph)) + depth * 0.25 * Math.sin(ang * 3 + t * 6);
      const A = a(t) + fd - inset, Bb = b(t) + fd - inset;
      pos.push(cx(t) + Math.sin(ang) * A, y, cz(t) + Math.cos(ang) * Bb);
      uv.push(u * 3, y * 2);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < segs; j++) { const p = i * (segs + 1) + j, q = p + segs + 1; if (flip) idx.push(p, q, p + 1, p + 1, q, q + 1); else idx.push(p, p + 1, q, p + 1, q + 1, q); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the carved head, facing +z, its crown at y = r * 1.18 over its middle
function headGeo(r) {
  const g = new THREE.SphereGeometry(r, 30, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = x / r, ny = y / r, nz = z / r;
    x *= 0.84; y *= 1.16; z *= 0.98;
    if (ny < 0.1) { const k = 1 - 0.3 * smooth(0.1, -1, ny); x *= k; z *= 1 - 0.08 * smooth(0.1, -1, ny); } // the jaw narrows to the chin
    if (nz > 0) {
      const f = nz;
      let d = 0;
      d += 0.13 * gauss(nx, ny + 0.1, 0.09, 0.22) * smooth(0.25, -0.3, ny + 0.0) * 1.0; // the nose's bridge and its length
      d += 0.09 * gauss(nx, ny + 0.3, 0.1, 0.07);                                      // its tip
      d -= 0.07 * (gauss(nx - 0.33, ny - 0.05, 0.13, 0.08) + gauss(nx + 0.33, ny - 0.05, 0.13, 0.08)); // the eye sockets
      d += 0.035 * gauss(nx, ny - 0.2, 0.5, 0.06);                                     // the brow
      d += 0.035 * (gauss(nx - 0.45, ny + 0.2, 0.14, 0.12) + gauss(nx + 0.45, ny + 0.2, 0.14, 0.12)); // cheekbones
      d += 0.04 * gauss(nx, ny + 0.52, 0.18, 0.06);                                    // the lips
      d -= 0.02 * gauss(nx, ny + 0.62, 0.2, 0.03);                                     // under the lip
      d += 0.05 * gauss(nx, ny + 0.8, 0.16, 0.1);                                      // the chin
      const s = 1 + d * f;
      x *= 1 + d * f * 0.2; z *= s;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
const sph = (r, ws = 12, hs = 10, ...rest) => new THREE.SphereGeometry(r, ws, hs, ...rest);
function tubeAlong(pts, r0, r1 = r0, sides = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, Math.max(6, pts.length * 4), 1, sides, false);
  // taper the radius from r0 to r1 along the tube
  const p = g.attributes.position, n = g.attributes.normal, segs = Math.max(6, pts.length * 4);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), rr = r0 + (r1 - r0) * t;
    for (let j = 0; j <= sides; j++) { const k = i * (sides + 1) + j; p.setXYZ(k, c.x + n.getX(k) * rr, c.y + n.getY(k) * rr, c.z + n.getZ(k) * rr); }
  }
  g.computeVertexNormals();
  return g;
}
// joined hands, praying (at the origin, pointing up and a little out)
function handsJoined(s) {
  const out = [];
  for (const sx of [-1, 1]) { const h = sph(0.045 * s, 10, 8); h.scale(0.55, 1.5, 1); h.rotateZ(sx * 0.08); h.rotateX(-0.35); h.translate(sx * 0.022 * s, 0.03 * s, 0.01 * s); out.push(h); const th = sph(0.018 * s, 8, 6); th.scale(0.8, 1.5, 0.8); th.translate(sx * 0.035 * s, -0.01 * s, 0.03 * s); out.push(th); }
  return out;
}
function handAt(s, x, y, z, rx = 0, rz = 0) { const h = sph(0.045 * s, 10, 8); h.scale(0.6, 1.25, 1); h.rotateX(rx); h.rotateZ(rz); h.translate(x, y, z); return h; }

// ---------------------------------------------------------------- the images
const DRESS = {
  virgen: { tunic: 'white', mantle: 'blue', lining: 'liningG', veil: true, crown: true, sun: false, peana: 'nubes', hands: 'joined', face: 'faceM' },
  inmaculada: { tunic: 'white', mantle: 'blue', lining: 'liningG', veil: true, stars: true, peana: 'luna', hands: 'joined', face: 'faceM' },
  dolorosa: { tunic: 'black', mantle: 'black', lining: 'lining', veil: true, halo: 'silver', peana: 'dorada', hands: 'joined', face: 'faceD', dagger: true, toca: true },
  corazon: { tunic: 'red', mantle: 'cream', lining: 'liningG', hair: 'hairD', beard: true, halo: 'gold', peana: 'dorada', hands: 'heart', face: 'face' },
  jose: { tunic: 'purple', mantle: 'ochre', lining: 'lining', hair: 'hairD', beard: true, halo: 'gold', peana: 'dorada', hands: 'child', face: 'face', staff: true },
  carmen: { tunic: 'brown', mantle: 'cream', lining: 'liningG', veil: true, crown: true, peana: 'nubes', hands: 'child', face: 'faceM' },
  antonio: { tunic: 'brown', mantle: 'brown', lining: 'lining', hair: 'hairD', beard: false, halo: 'gold', peana: 'dorada', hands: 'child', face: 'face', cord: true },
  juan: { tunic: 'green', mantle: 'red', lining: 'liningG', hair: 'hairL', beard: false, halo: 'gold', peana: 'dorada', hands: 'joined', face: 'face' },
  // San Gregorio Ostiense, bishop: alb, red cope lined in gold, the mitre and the crozier
  gregorio: { tunic: 'white', mantle: 'red', lining: 'liningG', hair: 'hairG', beard: true, peana: 'dorada', hands: 'bless', face: 'face', mitre: true, crozier: true },
  isidro: { tunic: 'brown', mantle: 'green', lining: 'lining', hair: 'hairD', beard: true, halo: 'gold', peana: 'dorada', hands: 'joined', face: 'face' },
};
export function statue(B, kind, x, y, z, ry, h = 1.6, k = {}) {
  const M = mats(B);
  const s = h / 1.7; // (modelled 1.7 tall)
  const cr = Math.cos(ry), sr = Math.sin(ry);
  const put = (key, g) => {
    if (!g) return;
    if (!g.index) g = mergeVertices(g);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    g.scale(s, s, s); g.rotateY(ry); g.translate(x, y, z);
    B.add(key, g, 0, 0, 0);
  };
  if (kind === 'cristo') return crucified(put, M, k);
  const D = DRESS[kind] || DRESS.virgen;
  const female = !!D.veil;
  // the peana
  let base = 0;
  if (D.peana === 'nubes' || D.peana === 'luna') {
    const r = mulberry32(7);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, c = sph(0.13 + r() * 0.06, 12, 10); c.scale(1.2, 0.75, 1.0); c.translate(Math.cos(a) * 0.2, 0.12 + r() * 0.06, Math.sin(a) * 0.15); put(M.cloud, c); }
    for (const a of [-0.9, 0, 0.9]) { const cx = Math.sin(a) * 0.24, cz = Math.cos(a) * 0.2; put(M.flesh, sph(0.055, 12, 10).translate(cx, 0.16, cz + 0.04)); for (const sx of [-1, 1]) { const w = sph(0.06, 8, 6); w.scale(1, 0.4, 0.3); w.rotateZ(sx * 0.6); put(M.cloud, w.translate(cx + sx * 0.07, 0.19, cz + 0.02)); } }
    if (D.peana === 'luna') { const moon = new THREE.TorusGeometry(0.22, 0.045, 8, 24, Math.PI); moon.rotateX(Math.PI / 2 - 0.25); moon.rotateY(Math.PI); put(k.silver || M.cloud, moon.translate(0, 0.27, 0.02)); }
    base = 0.24;
  } else {
    put(k.gold || M.ochre, new THREE.CylinderGeometry(0.27, 0.31, 0.08, 8).translate(0, 0.04, 0));
    put(k.goldPlain || M.ochre, new THREE.CylinderGeometry(0.24, 0.27, 0.1, 8).translate(0, 0.13, 0));
    put(k.gold || M.ochre, new THREE.CylinderGeometry(0.27, 0.24, 0.05, 8).translate(0, 0.205, 0));
    base = 0.23;
  }
  // the tunic, from the hem to the neck (a little sway: the weight on one leg)
  const TH = 1.18, sway = (t) => Math.sin(t * Math.PI) * 0.018;
  const wT = (t) => 0.2 - 0.07 * smooth(0.0, 0.55, t) + 0.035 * smooth(0.55, 0.85, t) - 0.08 * smooth(0.86, 1, t); // hem, waist, chest, neck
  const dT = (t) => 0.15 - 0.05 * smooth(0, 0.5, t) + 0.02 * smooth(0.6, 0.85, t) - 0.07 * smooth(0.88, 1, t);
  put(M[D.tunic], garment({ H: TH, a: wT, b: dT, cx: sway, folds: 11, depth: 0.026, y0: base, seed: 3 }));
  put(M[D.tunic], new THREE.CircleGeometry(0.2, 16).rotateX(Math.PI / 2).translate(0, base + 0.005, 0)); // (its hem's underside)
  if (D.cord) { const c = new THREE.TorusGeometry(0.135, 0.012, 6, 20); c.rotateX(Math.PI / 2); put(M.cream, c.translate(0, base + TH * 0.55, 0)); put(M.cream, tubeAlong([[0.05, base + TH * 0.55, 0.12], [0.07, base + TH * 0.35, 0.15], [0.06, base + TH * 0.15, 0.17]], 0.01)); }
  // the mantle: over the head (the Virgins) or the shoulders, round the back, open at the front, lined
  const top = base + TH + (female ? 0.33 : 0.02);
  const MH = top - base - 0.12;
  const wM = (t) => (female ? 0.25 - 0.04 * smooth(0.4, 0.8, t) - 0.14 * smooth(0.82, 1, t) : 0.25 - 0.03 * smooth(0.4, 0.8, t) - 0.05 * smooth(0.85, 1, t));
  const dM = (t) => (female ? 0.19 - 0.03 * smooth(0.4, 0.8, t) - 0.09 * smooth(0.82, 1, t) : 0.19 - 0.02 * smooth(0.5, 0.85, t));
  const open = female ? [0.62, Math.PI * 2 - 0.62] : [0.85, Math.PI * 2 - 0.85];
  put(M[D.mantle], garment({ H: MH, a: wM, b: dM, cz: () => -0.02, folds: 7, depth: 0.04, arc: open, y0: base + 0.12, seed: 5 }));
  put(M[D.lining], garment({ H: MH, a: wM, b: dM, cz: () => -0.02, folds: 7, depth: 0.04, arc: open, y0: base + 0.12, seed: 5, flip: true, inset: 0.012 }));
  if (female) { // the veil closes over the crown of the head
    const v = sph(0.115, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2); v.scale(1, 1.15, 1.05); put(M[D.mantle], v.translate(0, top - 0.14, -0.015));
    if (D.toca) { const t = new THREE.CylinderGeometry(0.104, 0.092, 0.2, 20, 1, true, 0.95, Math.PI * 2 - 1.9); put(M.white, t.translate(0, top - 0.25, 0.005)); const ch = new THREE.TorusGeometry(0.07, 0.02, 6, 14, Math.PI); ch.rotateX(Math.PI / 2 + 0.5); ch.rotateZ(Math.PI); put(M.white, ch.translate(0, top - 0.33, 0.04)); } // the white wimple framing the face, under the chin
  }
  // the neck and the head
  const hy = base + TH + 0.13;
  put(M.flesh, new THREE.CylinderGeometry(0.045, 0.05, 0.12, 12).translate(sway(1), base + TH + 0.02, 0.005));
  const tilt = female ? 0.12 : 0.05;
  { const hg = headGeo(0.1); hg.rotateX(tilt); put(M[D.face], hg.translate(sway(1), hy, 0.01)); }
  if (!female) {
    const hair = M[D.hair || 'hairD'];
    const cap = sph(0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); cap.scale(0.9, 1.16, 1.05); cap.rotateX(-0.2); put(hair, cap.translate(sway(1), hy + 0.012, -0.012));
    const back = sph(0.1, 12, 10); back.scale(0.92, 1.1, 0.8); put(hair, back.translate(sway(1), hy - 0.03, -0.04)); // long at the back
    if (D.beard) { const bd = sph(0.07, 14, 10); bd.scale(1.05, 1.05, 0.75); bd.rotateX(0.2); put(hair, bd.translate(sway(1), hy - 0.085, 0.045)); }
  }
  // the arms in their sleeves and the hands
  const shY = base + TH - 0.06;
  for (const sx of [-1, 1]) {
    const elbow = [sx * 0.2, shY - 0.27, 0.06];
    const hand = D.hands === 'joined' ? [sx * 0.03, shY - 0.2, 0.2] : D.hands === 'heart' && sx > 0 ? [0.06, shY - 0.12, 0.17] : D.hands === 'child' && sx < 0 ? [-0.1, shY - 0.27, 0.17] : D.hands === 'bless' ? (sx > 0 ? [0.12, shY + 0.02, 0.2] : [-0.2, shY - 0.24, 0.16]) : [sx * 0.15, shY - 0.36, 0.15];
    put(M[D.tunic], tubeAlong([[sx * 0.17, shY, 0.0], elbow, [hand[0] * 0.6 + elbow[0] * 0.4, (hand[1] + elbow[1]) / 2, (hand[2] + elbow[2]) / 2 - 0.02], hand], 0.05, 0.065, 12)); // a sleeve, widening at the cuff
    if (D.hands !== 'joined') put(M.flesh, handAt(1, hand[0], hand[1], hand[2] + 0.04, -0.4, sx * 0.3));
  }
  if (D.hands === 'joined') for (const g of handsJoined(1)) put(M.flesh, g.translate(0, shY - 0.17, 0.24));
  // what they wear or hold
  const hx = sway(1);
  if (D.crown) { const c = new THREE.CylinderGeometry(0.1, 0.085, 0.09, 20, 2, true); const p = c.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.02) p.setY(i, p.getY(i) + 0.03 * Math.max(0, Math.cos(Math.atan2(p.getZ(i), p.getX(i)) * 8))); c.computeVertexNormals(); put(k.goldPlain || M.ochre, c.translate(hx, hy + 0.15, -0.005)); }
  if (D.stars) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; put(k.goldPlain || M.ochre, sph(0.016, 6, 5).translate(hx + Math.cos(a) * 0.2, hy + 0.06 + Math.sin(a) * 0.2, -0.08)); }
  if (D.stars) { const ring = new THREE.TorusGeometry(0.2, 0.006, 4, 32); put(k.goldPlain || M.ochre, ring.translate(hx, hy + 0.06, -0.08)); }
  if (D.halo) { const ring = new THREE.TorusGeometry(0.17, 0.008, 4, 28); put(D.halo === 'silver' ? (k.silver || M.cloud) : (k.goldPlain || M.ochre), ring.translate(hx, hy + 0.05, -0.1)); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, ray = new THREE.BoxGeometry(0.008, 0.07 + (i % 2) * 0.04, 0.004); ray.translate(0, 0.19 + (i % 2) * 0.02, 0); ray.rotateZ(a); put(D.halo === 'silver' ? (k.silver || M.cloud) : (k.goldPlain || M.ochre), ray.translate(hx, hy + 0.05, -0.1)); } }
  if (D.dagger) { const bl = new THREE.BoxGeometry(0.012, 0.22, 0.004); bl.rotateZ(0.5); put(k.silver || M.cloud, bl.translate(0.05, shY - 0.1, 0.17)); put(k.goldPlain || M.ochre, new THREE.BoxGeometry(0.06, 0.012, 0.012).rotateZ(0.5).translate(0.09, shY - 0.035, 0.17)); }
  if (D.hands === 'heart') { put(M.red, sph(0.04, 10, 8).translate(0.0, shY - 0.1, 0.165)); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, ray = new THREE.BoxGeometry(0.006, 0.05, 0.004); ray.translate(0, 0.06, 0); ray.rotateZ(a); put(k.goldPlain || M.ochre, ray.translate(0, shY - 0.1, 0.17)); } put(k.goldPlain || M.ochre, new THREE.ConeGeometry(0.015, 0.05, 6).translate(0, shY - 0.04, 0.17)); }
  if (D.hands === 'child') child(put, M, -0.12, shY - 0.2, 0.16);
  // a bishop's mitre: two peaks, front and back, a gold band round it and down the middle
  if (D.mitre) {
    const mt = new THREE.CylinderGeometry(0.07, 0.096, 0.24, 24, 6, true), p = mt.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.12, t = y / 0.24, a = Math.atan2(p.getZ(i), p.getX(i)), sz = Math.abs(Math.sin(a)); p.setY(i, p.getY(i) + 0.09 * t * sz * sz); p.setX(i, p.getX(i) * (1 - 0.55 * t * t)); }
    mt.computeVertexNormals();
    put(M.white, mt.translate(hx, hy + 0.2, -0.005));
    const band = new THREE.TorusGeometry(0.097, 0.012, 4, 24); band.rotateX(Math.PI / 2); put(k.goldPlain || M.ochre, band.translate(hx, hy + 0.09, -0.005));
    for (const sz of [-1, 1]) put(k.goldPlain || M.ochre, new THREE.BoxGeometry(0.03, 0.27, 0.01).translate(hx, hy + 0.23, sz * 0.085 - 0.005));
    put(M.cream, sph(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(hx, hy + 0.08, -0.005)); // (the head inside it)
  }
  // the crozier: a tall gilt staff, its crook curling outwards
  if (D.crozier) {
    const cx2 = -0.22, cz2 = 0.16;
    put(k.goldPlain || M.ochre, new THREE.CylinderGeometry(0.011, 0.013, 1.62, 8).translate(cx2, base + 0.85, cz2));
    put(k.goldPlain || M.ochre, sph(0.03, 10, 8).translate(cx2, base + 1.67, cz2));
    const crook = new THREE.TorusGeometry(0.07, 0.012, 6, 18, Math.PI * 1.45); crook.rotateZ(-0.25); put(k.goldPlain || M.ochre, crook.translate(cx2 - 0.07, base + 1.74, cz2));
  }
  if (D.staff) { put(M.wood, new THREE.CylinderGeometry(0.008, 0.009, 1.0, 6).translate(0.2, base + 0.62, 0.15)); for (let i = 0; i < 5; i++) put(M.white, sph(0.025, 8, 6).translate(0.2 + (i % 2 ? 0.02 : -0.015), base + 1.12 + i * 0.035, 0.15)); }
}
// the Child Jesus, sitting on an arm (x, y, z: where he sits)
function child(put, M, x, y, z) {
  put(M.white, garment({ H: 0.18, a: (t) => 0.06 - 0.02 * t, b: (t) => 0.05 - 0.015 * t, folds: 6, depth: 0.008, y0: y, cx: () => x, cz: () => z, segs: 20, rows: 8 }));
  { const h = headGeo(0.045); put(M.faceM, h.translate(x, y + 0.24, z + 0.01)); }
  { const c = sph(0.048, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); c.scale(0.9, 1.1, 1); put(M.hairL, c.translate(x, y + 0.255, z)); }
  put(M.flesh, handAt(0.6, x + 0.05, y + 0.16, z + 0.04, -0.6, 0.6));
}
// the crucified Christ on his cross (the foot of the cross at the origin)
function crucified(put, M, k) {
  const wood = M.wood;
  put(wood, new THREE.BoxGeometry(0.13, 2.5, 0.09).translate(0, 1.25, -0.09));
  put(wood, new THREE.BoxGeometry(1.5, 0.12, 0.09).translate(0, 2.0, -0.09));
  put(k.goldPlain || M.ochre, new THREE.BoxGeometry(0.16, 0.04, 0.1).translate(0, 2.5, -0.09));
  for (const sx of [-1, 1]) put(k.goldPlain || M.ochre, new THREE.BoxGeometry(0.04, 0.16, 0.1).translate(sx * 0.75, 2.0, -0.09));
  put(M.cream, new THREE.BoxGeometry(0.24, 0.1, 0.02).translate(0, 2.3, -0.035)); // INRI
  const F = M.fleshC;
  // the body: the chest wide, the belly drawn in, the hips; it hangs a little forward of the cross, the weight on the arms
  const torso = garment({ H: 0.56, a: (t) => 0.115 + 0.035 * smooth(0.3, 0.75, t) - 0.03 * smooth(0.85, 1, t), b: (t) => 0.07 + 0.015 * smooth(0.4, 0.8, t), cx: (t) => 0.015 * Math.sin(t * Math.PI), cz: (t) => 0.02 + 0.02 * (1 - t), folds: 3, depth: 0.004, segs: 28, rows: 14, y0: 1.36, seed: 2 });
  put(F, torso);
  for (let i = 0; i < 4; i++) { const rib = new THREE.TorusGeometry(0.1 - i * 0.004, 0.006, 4, 16, Math.PI * 0.8); rib.rotateX(Math.PI / 2); rib.rotateY(Math.PI * 0.1); rib.scale(1, 1, 0.62); put(F, rib.translate(0.01, 1.66 + i * 0.045, 0.04)); }
  // the arms up along the beam to the nailed hands
  for (const sx of [-1, 1]) {
    put(F, tubeAlong([[sx * 0.13, 1.86, 0.03], [sx * 0.34, 1.93, 0.0], [sx * 0.62, 1.99, -0.02]], 0.045, 0.032, 10));
    put(F, handAt(1, sx * 0.67, 2.0, -0.02, 0, sx * 1.4));
    put(M.blood, sph(0.012, 6, 5).translate(sx * 0.67, 1.995, 0.01));
  }
  // the legs, the knees a little forward, the right foot over the left, one nail
  put(F, tubeAlong([[0.05, 1.33, 0.03], [0.06, 1.0, 0.07], [0.03, 0.62, 0.02], [0.01, 0.46, 0.0]], 0.055, 0.03, 10));
  put(F, tubeAlong([[-0.05, 1.33, 0.03], [-0.045, 1.0, 0.075], [-0.01, 0.62, 0.025], [0.0, 0.48, 0.01]], 0.055, 0.03, 10));
  for (const [fx, fz] of [[0.01, 0.03], [-0.005, 0.0]]) { const f = sph(0.035, 8, 6); f.scale(0.7, 1.6, 1); f.rotateX(0.5); put(F, f.translate(fx, 0.42, fz)); }
  put(M.blood, sph(0.012, 6, 5).translate(0.0, 0.44, 0.06));
  // the loincloth: wrapped round the hips, knotted at the right, its end hanging
  put(M.white, garment({ H: 0.2, a: (t) => 0.13 - 0.01 * t, b: (t) => 0.095, cx: (t) => 0.01, cz: () => 0.02, folds: 8, depth: 0.012, segs: 30, rows: 8, y0: 1.2, seed: 8 }));
  put(M.white, sph(0.04, 10, 8).translate(0.13, 1.36, 0.03));
  put(M.white, garment({ H: 0.24, a: (t) => 0.035 - 0.01 * t, b: () => 0.018, cx: () => 0.15, cz: () => 0.03, folds: 3, depth: 0.006, segs: 12, rows: 6, y0: 1.12, seed: 9 }));
  put(M.blood, sph(0.01, 6, 5).translate(-0.06, 1.72, 0.105)); // the wound in the side
  // the head fallen on the right shoulder, the hair long, the beard, the crown of thorns
  const hg = headGeo(0.085); hg.rotateX(0.45); hg.rotateZ(-0.4); put(M.faceC, hg.translate(0.06, 1.98, 0.07));
  { const cap = sph(0.092, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6); cap.scale(0.9, 1.15, 1.05); cap.rotateX(0.45); cap.rotateZ(-0.4); put(M.hairD, cap.translate(0.055, 1.985, 0.06)); }
  { const lh = sph(0.06, 10, 8); lh.scale(0.8, 1.6, 0.6); lh.rotateZ(-0.4); put(M.hairD, lh.translate(0.1, 1.9, 0.04)); }
  { const bd = sph(0.05, 12, 8); bd.scale(1, 1.1, 0.7); bd.rotateX(0.5); bd.rotateZ(-0.4); put(M.hairD, bd.translate(0.1, 1.91, 0.11)); }
  { const t = new THREE.TorusGeometry(0.085, 0.012, 6, 18); t.rotateX(Math.PI / 2 + 0.45); t.rotateZ(-0.4); put(M.wood, t.translate(0.055, 2.03, 0.06)); }
}
