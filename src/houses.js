// Neighbours' houses: every marked door in town opens onto a different home. A seeded profile decides who lives there
// (an old widow, a family, a student, a hunter, a musician, a well-off couple, a farmer, a painter), the layout
// (a corridor house, a narrow side-corridor house, two storeys with stairs) and the style (wall colours, hydraulic
// tiles or parquet or terracotta, dark or pale woods, fabrics), then furnishes every room for them and leaves things
// you can pick up: the jewellery box, the savings under the mattress, the laptop, the hunter's rifle, a ham...
import * as THREE from 'three';
import { StaticCollider } from './collision.js';
import { mulberry32, hash1 } from './util.js';
import { INTERIOR_ORIGIN, WALL_H, boxGeo, planeGeo, cylGeo, pictureTexture, rugTexture, HouseBuilder, std, texMat, ringSegs } from './housekit.js';

// ---------------------------------------------------------------- who lives here
export const PROFILES = {
  abuela: { label: 'una señora mayor', names: ['Doña Remedios', 'La tía Paca', 'Doña Juana', 'Doña Petra', 'Doña Encarna', 'La señá Rosario'], adults: 1, gender: 'f', elderly: true, home: 0.9, sleep: [22.5, 8.5], layouts: ['pasillo', 'pasillo', 'lateral'], styles: ['antiguo'], rooms: ['dorm', 'comedor', 'costura', 'despensa', 'dorm2'], loot: ['joyero', 'colchon', 'cartera', 'reloj'] },
  matrimonio: { label: 'un matrimonio mayor', names: ['Los de Ramírez', 'Paco y Mari', 'Los Barragán'], adults: 2, elderly: true, home: 0.85, sleep: [23, 8], layouts: ['pasillo', 'lateral'], styles: ['antiguo', 'rustico'], rooms: ['dorm', 'comedor', 'despensa', 'dorm2', 'costura'], loot: ['joyero', 'colchon', 'cartera', 'lata'] },
  familia: { label: 'una familia', names: ['Los García', 'Los Moreno', 'Los Sánchez'], adults: 2, kids: 1, home: 0.7, sleep: [23.5, 7.5], layouts: ['pasillo', 'dosPlantas', 'dosPlantas'], styles: ['moderno', 'alegre'], rooms: ['dorm', 'ninos', 'dorm2', 'despensa'], loot: ['consola', 'portatil', 'hucha', 'cartera', 'movil'] },
  estudiante: { label: 'un estudiante', names: ['Javi, el de la Uni', 'Sergio', 'Nerea'], adults: 1, young: true, home: 0.55, sleep: [2, 10.5], layouts: ['lateral', 'dosPlantas'], styles: ['joven'], rooms: ['dormJoven', 'estudio', 'trastero'], loot: ['portatil', 'guitarra', 'altavoz', 'consola'] },
  cazador: { label: 'un cazador', names: ['El tío Anselmo', 'Ramón el de las perdices', 'Don Eusebio'], adults: 1, gender: 'm', home: 0.6, sleep: [23, 6], layouts: ['pasillo', 'dosPlantas'], styles: ['rustico'], rooms: ['dorm', 'trofeos', 'despensa', 'dorm2'], loot: ['rifle', 'jamon', 'cartera', 'prismaticos'] },
  musico: { label: 'un músico', names: ['Toni, el de la orquesta', 'Manolo el guitarrista', 'Lucía la del coro'], adults: 1, home: 0.6, sleep: [3, 11], layouts: ['lateral', 'dosPlantas'], styles: ['bohemio'], rooms: ['dorm', 'musica', 'estudio'], loot: ['guitarra', 'altavoz', 'vinilos', 'cartera'] },
  rico: { label: 'un matrimonio con dinero', names: ['Los del notario', 'Don Fernando y Doña Pilar', 'Los Cienfuegos'], adults: 2, home: 0.5, sleep: [0, 8.5], layouts: ['dosPlantas'], styles: ['lujo'], rooms: ['dorm', 'despacho', 'dorm2', 'comedor'], loot: ['cajaFuerte', 'joyero', 'reloj', 'cuadro', 'portatil'] },
  agricultor: { label: 'un agricultor', names: ['El tío Blas', 'Juan el del tractor', 'Don Isidro'], adults: 1, gender: 'm', home: 0.45, sleep: [22, 6], layouts: ['pasillo', 'lateral'], styles: ['rustico', 'antiguo'], rooms: ['dorm', 'despensa', 'taller', 'dorm2'], loot: ['lata', 'jamon', 'garrafa', 'cartera'] },
  artista: { label: 'una pintora', names: ['Marisa la pintora', 'Carmen, la de los cuadros'], adults: 1, gender: 'f', home: 0.65, sleep: [1.5, 10], layouts: ['lateral', 'dosPlantas'], styles: ['bohemio', 'alegre'], rooms: ['dorm', 'taller', 'estudio'], loot: ['cuadro', 'portatil', 'cartera'] },
};
const PROFILE_W = [['abuela', 4], ['matrimonio', 3], ['familia', 4], ['estudiante', 2], ['cazador', 2], ['musico', 1.5], ['rico', 1.5], ['agricultor', 2.5], ['artista', 1.5]];

// ---------------------------------------------------------------- how it looks
const STYLES = {
  antiguo: { walls: [0xf2ece0, 0xe9e2cf, 0xdfe8e6, 0xf0e2d2, 0xe6ecd8], floor: 'hidraulica', wood: 'dark', fabric: [0x7a2a2a, 0x5a4a3a, 0x3a4a6a, 0x6a3a4a], lamp: 0xffd2a0, zocalo: true, curtain: 0xe8d6b8 },
  rustico: { walls: [0xefe6d6, 0xe6d8c0, 0xf2eadc], floor: 'barro', wood: 'dark', fabric: [0x6a4a2a, 0x3a5a2a, 0x8a3a22, 0x4a3a2a], lamp: 0xffc890, beams: true, curtain: 0xd8c8a8 },
  moderno: { walls: [0xf4f4f0, 0xe8ecef, 0xefe9e1, 0xdfe6e0], floor: 'parquet', wood: 'pale', fabric: [0x4a5a6a, 0x8a8a84, 0x2f4f7a, 0x6a7a5a], lamp: 0xfff1dc, curtain: 0xeceae4 },
  alegre: { walls: [0xf7e3c8, 0xd9ecd8, 0xf3d5db, 0xd6e6f2, 0xf2ecb8], floor: 'terrazo', wood: 'white', fabric: [0xe8a33a, 0x3a8ab8, 0xd8263a, 0x5aa84a], lamp: 0xffe8c0, curtain: 0xf8e0c8 },
  joven: { walls: [0xe8e8e8, 0x6a7a8c, 0xd9d4ea, 0xc8dce0], floor: 'parquet', wood: 'pale', fabric: [0x222222, 0x6a2a8a, 0x2a6a8a, 0xb83a3a], lamp: 0xe8f0ff, posters: true, curtain: 0x3a3a44 },
  lujo: { walls: [0xf6f4ef, 0xe9e4da, 0x66747c, 0xe4dccf], floor: 'marmol', wood: 'walnut', fabric: [0xf0ece4, 0x2a2a2a, 0x8a6a3a, 0x3a4a5a], lamp: 0xfff4e0, curtain: 0xe8e0d0 },
  bohemio: { walls: [0xe8d0b0, 0xc8d8c8, 0xe0c8d8, 0xf0dcc0], floor: 'parquet', wood: 'pale', fabric: [0xb8563a, 0x5a7a4a, 0xd8a83a, 0x7a4a8a], lamp: 0xffd8a8, plants: 2, curtain: 0xd8b890 },
};

// things to take: money straight away (cash) or goods to sell / trade later (value), or a weapon
export const LOOT = {
  joyero: { name: 'Joyero con joyas', value: [90, 240] },
  colchon: { name: 'Ahorros bajo el colchón', cash: [80, 320], hidden: true },
  cartera: { name: 'Cartera', cash: [15, 90] },
  reloj: { name: 'Reloj de oro', value: [60, 180] },
  consola: { name: 'Videoconsola', value: [70, 160] },
  portatil: { name: 'Portátil', value: [90, 220] },
  hucha: { name: 'Hucha', cash: [10, 45] },
  movil: { name: 'Móvil', value: [40, 120] },
  guitarra: { name: 'Guitarra', value: [60, 180] },
  altavoz: { name: 'Altavoz', value: [30, 90] },
  vinilos: { name: 'Discos de vinilo', value: [25, 80] },
  rifle: { name: 'Rifle de caza', weapon: 'rifle', ammo: 12 },
  jamon: { name: 'Jamón ibérico', value: [60, 140] },
  prismaticos: { name: 'Prismáticos', value: [20, 60] },
  cajaFuerte: { name: 'Caja fuerte', cash: [300, 900], crack: 7 },
  cuadro: { name: 'Cuadro al óleo', value: [80, 300] },
  lata: { name: 'Lata de galletas con dinero', cash: [40, 160] },
  garrafa: { name: 'Garrafa de pitarra', value: [8, 20] },
};

export function houseProfile(seed) {
  const r = mulberry32((seed * 2654435761) >>> 0);
  let tot = 0; for (const [, w] of PROFILE_W) tot += w;
  let x = r() * tot, id = 'abuela';
  for (const [k, w] of PROFILE_W) { x -= w; if (x <= 0) { id = k; break; } }
  const P = PROFILES[id];
  const pk = (a) => a[Math.floor(r() * a.length)];
  return { id, ...P, name: pk(P.names), layout: pk(P.layouts), style: pk(P.styles), seed };
}

// ---------------------------------------------------------------- canvas patterns (floors, skirting, posters)
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
// hydraulic tiles (baldosa hidráulica), as in the old houses of the Vegas: a 2x2 motif per texture
function hydraulicTex(r) {
  const pal = [['#b8412c', '#e8dcc4', '#2c3a4a', '#c89a3a'], ['#2f5a6a', '#ece2cc', '#8a2a22', '#d0a650'], ['#6a4a2a', '#efe4d0', '#3a5a3a', '#b8412c'], ['#7a2430', '#f0e8d8', '#24344a', '#b89a4a']][Math.floor(r() * 4)];
  const kind = Math.floor(r() * 3);
  return canvasTex(256, 256, (x, W) => {
    const s = W / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      x.save(); x.translate(i * s + s / 2, j * s + s / 2); x.rotate(((i + j) % 2) * Math.PI / 2);
      x.fillStyle = pal[1]; x.fillRect(-s / 2, -s / 2, s, s);
      if (kind === 0) { // star
        x.fillStyle = pal[0]; x.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, rr = k % 2 ? s * 0.18 : s * 0.42; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.fill();
        x.fillStyle = pal[2]; x.beginPath(); x.arc(0, 0, s * 0.1, 0, Math.PI * 2); x.fill();
        x.fillStyle = pal[3]; for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { x.beginPath(); x.arc(a * s / 2, b * s / 2, s * 0.2, 0, Math.PI * 2); x.fill(); }
      } else if (kind === 1) { // flower quarter
        x.fillStyle = pal[0]; x.beginPath(); x.arc(-s / 2, -s / 2, s * 0.55, 0, Math.PI / 2); x.lineTo(-s / 2, -s / 2); x.fill();
        x.fillStyle = pal[2]; for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(0, 0, s * 0.34, s * 0.11, (k * Math.PI) / 4, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = pal[3]; x.beginPath(); x.arc(0, 0, s * 0.08, 0, Math.PI * 2); x.fill();
      } else { // geometric
        x.strokeStyle = pal[0]; x.lineWidth = s * 0.08; x.strokeRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.72);
        x.fillStyle = pal[2]; x.beginPath(); x.moveTo(0, -s * 0.3); x.lineTo(s * 0.3, 0); x.lineTo(0, s * 0.3); x.lineTo(-s * 0.3, 0); x.fill();
        x.fillStyle = pal[3]; x.fillRect(-s * 0.06, -s * 0.06, s * 0.12, s * 0.12);
      }
      x.restore();
    }
    x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2;
    for (let k = 0; k <= 2; k++) { x.beginPath(); x.moveTo(k * s, 0); x.lineTo(k * s, W); x.stroke(); x.beginPath(); x.moveTo(0, k * s); x.lineTo(W, k * s); x.stroke(); }
  });
}
function terrazoTex(r) {
  const base = ['#e8e2d6', '#d8d0c4', '#e4d8c8'][Math.floor(r() * 3)];
  return canvasTex(256, 256, (x, W) => {
    x.fillStyle = base; x.fillRect(0, 0, W, W);
    const cols = ['#8a8478', '#b8a890', '#5a5650', '#c8b8a0', '#9a6a4a', '#f4f0e8'];
    for (let i = 0; i < 900; i++) { x.fillStyle = cols[Math.floor(r() * cols.length)]; const s = 1 + r() * 4; x.beginPath(); x.ellipse(r() * W, r() * W, s, s * (0.5 + r() * 0.6), r() * 3, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2; x.strokeRect(0, 0, W, W);
  });
}
function barroTex(r) {
  return canvasTex(256, 256, (x, W) => {
    const s = W / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const k = 0.85 + r() * 0.3;
      x.fillStyle = `rgb(${Math.round(178 * k)},${Math.round(96 * k)},${Math.round(62 * k)})`; x.fillRect(i * s, j * s, s, s);
      for (let n = 0; n < 60; n++) { x.fillStyle = `rgba(${r() < 0.5 ? '90,40,20' : '230,170,120'},${0.08 + r() * 0.1})`; x.fillRect(i * s + r() * s, j * s + r() * s, 2 + r() * 8, 2 + r() * 8); }
    }
    x.strokeStyle = '#d8c8b0'; x.lineWidth = 5;
    for (let k = 0; k <= 2; k++) { x.beginPath(); x.moveTo(k * s, 0); x.lineTo(k * s, W); x.stroke(); x.beginPath(); x.moveTo(0, k * s); x.lineTo(W, k * s); x.stroke(); }
  });
}
// tiled skirting (zócalo de azulejos) along the walls of old houses
function zocaloTex(r) {
  const c1 = ['#2f5a8a', '#3a6a4a', '#8a3a2a', '#c8962a'][Math.floor(r() * 4)];
  return canvasTex(128, 128, (x, W) => {
    x.fillStyle = '#f2ece0'; x.fillRect(0, 0, W, W);
    x.fillStyle = c1; x.beginPath(); x.arc(W / 2, W / 2, W * 0.3, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2ece0'; x.beginPath(); x.arc(W / 2, W / 2, W * 0.17, 0, Math.PI * 2); x.fill();
    x.fillStyle = c1; for (const [a, b] of [[0, 0], [W, 0], [W, W], [0, W]]) { x.beginPath(); x.arc(a, b, W * 0.16, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = 'rgba(0,0,0,0.2)'; x.lineWidth = 2; x.strokeRect(0, 0, W, W);
  });
}
function posterTex(r) {
  const bg = ['#1a1a2a', '#2a1a1a', '#f2d230', '#e84a6a', '#2a8ab8'][Math.floor(r() * 5)];
  const words = ['FESTIVAL', 'ROCK', 'GUAREÑA', 'CONCIERTO', 'VEGAS', 'VERBENA', 'FERIA', 'JAZZ'];
  return canvasTex(128, 176, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, 128, 176);
    x.fillStyle = `hsl(${Math.floor(r() * 360)},70%,60%)`; x.beginPath(); x.arc(64, 74, 30 + r() * 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.fillText(words[Math.floor(r() * words.length)], 64, 150);
    x.font = '11px sans-serif'; x.fillText('AGOSTO · PLAZA DE ESPAÑA', 64, 166);
  }, false);
}
function paintingTex(r) {
  return canvasTex(160, 120, (x) => {
    const sky = x.createLinearGradient(0, 0, 0, 80); sky.addColorStop(0, `hsl(${200 + r() * 30},50%,${55 + r() * 15}%)`); sky.addColorStop(1, `hsl(${30 + r() * 20},70%,75%)`);
    x.fillStyle = sky; x.fillRect(0, 0, 160, 120);
    for (let i = 0; i < 40; i++) { x.fillStyle = `hsla(${r() * 360},55%,${40 + r() * 30}%,0.55)`; x.beginPath(); x.arc(r() * 160, 60 + r() * 60, 6 + r() * 16, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#f4efe6'; x.fillRect(96, 58, 34, 26); x.fillStyle = '#b5552e'; x.beginPath(); x.moveTo(92, 60); x.lineTo(113, 46); x.lineTo(134, 60); x.fill();
  }, false);
}
function antlerGeo() {
  const parts = [];
  const tine = (x0, y0, x1, y1, r0) => { const L = Math.hypot(x1 - x0, y1 - y0); const g = new THREE.CylinderGeometry(r0 * 0.6, r0, L, 6); g.rotateZ(-Math.atan2(x1 - x0, y1 - y0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0); parts.push(g); };
  for (const s of [-1, 1]) {
    tine(0, 0, s * 0.18, 0.28, 0.02); tine(s * 0.18, 0.28, s * 0.3, 0.52, 0.016); tine(s * 0.12, 0.18, s * 0.02, 0.32, 0.012); tine(s * 0.25, 0.42, s * 0.16, 0.56, 0.01);
  }
  return parts;
}

// a curtain hanging in soft folds (a plane waved across its width)
export function curtainGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h, 16, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin((x / w) * Math.PI * 7) * 0.035); }
  g.computeVertexNormals();
  return g;
}
const NAMES_F = ['Mari', 'Juani', 'Encarna', 'Pili', 'Rosa', 'Lola', 'Isabel', 'Carmen', 'Toñi', 'Merche', 'Nieves', 'Lucía', 'Paula', 'Irene'];
const NAMES_M = ['Paco', 'Manolo', 'Antonio', 'José', 'Juan', 'Pedro', 'Luis', 'Ángel', 'Rafa', 'Fermín', 'Julián', 'Pablo', 'Hugo', 'Álvaro'];

// ---------------------------------------------------------------- the rooms and their furniture
const SIDE_RY = { s: 0, n: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
const INSET = 0.08; // half a wall: pieces stand against the inner face
const WALLF = 0.075; // where the inner face of a wall is, from the room's edge (things hung on it go just in front)

class Room {
  constructor(id, type, x0, z0, x1, z1, lv = 0) {
    Object.assign(this, { id, type, x0, z0, x1, z1, lv });
    this.open = [];   // {side, a, b, door}
    this.boxes = [];  // occupied footprints [x0,z0,x1,z1]
    this.tallOn = { s: [], n: [], w: [], e: [] }; // spans along each wall covered by tall pieces (no pictures there)
  }
  get w() { return this.x1 - this.x0; }
  get d() { return this.z1 - this.z0; }
  get cx() { return (this.x0 + this.x1) / 2; }
  get cz() { return (this.z0 + this.z1) / 2; }
  door(side, a, b) { this.open.push({ side, a: Math.min(a, b), b: Math.max(a, b), door: true }); }
  win(side, a, b) { this.open.push({ side, a: Math.min(a, b), b: Math.max(a, b), door: false }); }
  free(bx) {
    const m = 0.04;
    if (bx[0] < this.x0 + INSET - 1e-3 || bx[2] > this.x1 - INSET + 1e-3 || bx[1] < this.z0 + INSET - 1e-3 || bx[3] > this.z1 - INSET + 1e-3) return false;
    for (const o of this.boxes) if (bx[0] < o[2] - m && bx[2] > o[0] + m && bx[1] < o[3] - m && bx[3] > o[1] + m) return false;
    // the swing of every door and a step in front of it stay clear
    for (const o of this.open) {
      if (!o.door) continue;
      const k = 1.0, e = 0.45;
      const z = o.side === 's' ? [this.z0, this.z0 + k] : o.side === 'n' ? [this.z1 - k, this.z1] : null;
      const x = o.side === 'w' ? [this.x0, this.x0 + k] : o.side === 'e' ? [this.x1 - k, this.x1] : null;
      const cb = z ? [o.a - e, z[0], o.b + e, z[1]] : [x[0], o.a - e, x[1], o.b + e];
      if (bx[0] < cb[2] && bx[2] > cb[0] && bx[1] < cb[3] && bx[3] > cb[1]) return false;
    }
    return true;
  }
  // a spot for a w x d piece with its back to a wall (sides in order of preference); tall pieces keep off windows
  fit(w, d, sides, tall = false, r = Math.random) {
    for (const side of sides) {
      const along = side === 's' || side === 'n';
      const lo = (along ? this.x0 : this.z0) + INSET + w / 2, hi = (along ? this.x1 : this.z1) - INSET - w / 2;
      if (hi < lo) continue;
      const n = Math.max(1, Math.floor((hi - lo) / 0.1));
      const start = Math.floor(r() * (n + 1));
      for (let k = 0; k <= n; k++) {
        const c = lo + (((start + k) % (n + 1)) / n) * (hi - lo);
        if (tall && this.open.some((o) => o.side === side && c + w / 2 > o.a - 0.08 && c - w / 2 < o.b + 0.08)) continue;
        let bx, x, z;
        if (side === 's') { z = this.z0 + INSET + d / 2; x = c; bx = [c - w / 2, this.z0 + INSET, c + w / 2, this.z0 + INSET + d]; }
        else if (side === 'n') { z = this.z1 - INSET - d / 2; x = c; bx = [c - w / 2, this.z1 - INSET - d, c + w / 2, this.z1 - INSET]; }
        else if (side === 'w') { x = this.x0 + INSET + d / 2; z = c; bx = [this.x0 + INSET, c - w / 2, this.x0 + INSET + d, c + w / 2]; }
        else { x = this.x1 - INSET - d / 2; z = c; bx = [this.x1 - INSET - d, c - w / 2, this.x1 - INSET, c + w / 2]; }
        if (!this.free(bx)) continue;
        this.boxes.push(bx);
        if (tall) this.tallOn[side].push([c - w / 2, c + w / 2]);
        return { x, z, ry: SIDE_RY[side], side };
      }
    }
    return null;
  }
  // free floor for a w x d piece (tables, rugs), as central as possible
  fitCenter(w, d, r = Math.random, ry = 0) {
    const rw = ry % Math.PI ? d : w, rd = ry % Math.PI ? w : d;
    let best = null, bs = Infinity;
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const x = this.x0 + INSET + rw / 2 + (i / 10) * (this.w - 2 * INSET - rw), z = this.z0 + INSET + rd / 2 + (j / 10) * (this.d - 2 * INSET - rd);
      const bx = [x - rw / 2 - 0.3, z - rd / 2 - 0.3, x + rw / 2 + 0.3, z + rd / 2 + 0.3]; // room to walk round it
      if (!this.free(bx)) continue;
      const s = Math.hypot(x - this.cx, z - this.cz) + r() * 0.3;
      if (s < bs) { bs = s; best = { x, z, bx }; }
    }
    if (!best) return null;
    this.boxes.push([best.x - rw / 2, best.z - rd / 2, best.x + rw / 2, best.z + rd / 2]);
    return { x: best.x, z: best.z, ry };
  }
  // a patch of free floor to stand on (for people and for the navigation)
  standSpot() {
    let best = null, bs = -Infinity;
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
      const x = this.x0 + (i / 8) * this.w, z = this.z0 + (j / 8) * this.d;
      let dmin = Math.min(x - this.x0, this.x1 - x, z - this.z0, this.z1 - z);
      for (const o of this.boxes) {
        const dx = Math.max(o[0] - x, 0, x - o[2]), dz = Math.max(o[1] - z, 0, z - o[3]);
        dmin = Math.min(dmin, Math.hypot(dx, dz));
      }
      const s = dmin - Math.hypot(x - this.cx, z - this.cz) * 0.05;
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best || { x: this.cx, z: this.cz };
  }
}

// ---------------------------------------------------------------- the builder for one house
export function buildVecino(seed, origin = INTERIOR_ORIGIN) {
  const prof = houseProfile(seed);
  const r = mulberry32((seed * 97 + 13) >>> 0);
  const pk = (a) => a[Math.floor(r() * a.length)];
  const S = STYLES[prof.style];
  const B = new HouseBuilder(origin.x, origin.z, false);
  const F2 = 3.1, H2 = 2.75;
  const cx0 = B.ox, cz0 = B.oz;

  // ---- materials
  const woodTint = { dark: 0xffffff, pale: 0xf0d4b0, white: 0xf4f2ee, walnut: 0xb89070 }[S.wood];
  const M = {
    wall: (i) => B.mat('wall' + i, () => texMat(['moderno', 'lujo', 'alegre', 'joven'].includes(prof.style) ? 'white_plaster_02' : 'painted_plaster_wall', S.walls[i % S.walls.length], 0.9)),
    out: B.mat('wallout', () => texMat('white_rough_plaster', 0xf4f0e6, 0.95)),
    ceil: B.mat('ceil', () => texMat('painted_plaster_wall', 0xf8f6f0, 0.95)),
    wood: B.mat('furnwood', () => S.wood === 'white' ? std(0xf2f0ea, { roughness: 0.5 }) : texMat('dark_wood', woodTint, 0.6)),
    wood2: B.mat('furnwood2', () => texMat('dark_wood', 0xe8c8a0, 0.6)),
    white: B.mat('white', () => std(0xf2f2ee, { roughness: 0.35 })),
    metal: B.mat('metal', () => std(0x9aa0a4, { roughness: 0.3, metalness: 0.8 })),
    black: B.mat('black', () => std(0x141416, { roughness: 0.4 })),
    iron: B.mat('iron', () => std(0x1d1d1f, { roughness: 0.5, metalness: 0.6 })),
    shutter: B.mat('shutter', () => std(0xe8e1cf, { roughness: 0.8 })),
    bath: B.mat('azulejo', () => texMat('long_white_tiles', 0xffffff, 0.3)),
    tile: B.mat('tile', () => texMat('floor_tiles_06', 0xffffff, 0.45)),
    patio: B.mat('patio', () => texMat('floor_tiles_06', 0xd08a5a, 0.8)),
    stone: B.mat('stone', () => texMat('granite_wall', 0xffffff, 0.9)),
    brick: B.mat('brick', () => texMat('brick_wall_02', 0xffffff, 0.9)),
    plant: B.mat('plant', () => std(0x3f7a35, { roughness: 0.9 })),
    pot: B.mat('pot', () => std(0xb5552e, { roughness: 0.8 })),
    flower: B.mat('flower', () => std(0xd8263a, { roughness: 0.7 })),
    sheet: B.mat('sheet', () => std(0xf4f0e8, { roughness: 0.95 })),
    fabric: (i) => B.mat('fabric' + (i % S.fabric.length), () => std(S.fabric[i % S.fabric.length], { roughness: 0.95 })),
    leather: B.mat('leather', () => std(0x5a3a22, { roughness: 0.55 })),
    glass: B.mat('glass', () => std(0x9ab8c8, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 })),
    gold: B.mat('gilt', () => std(0xc8a050, { roughness: 0.35, metalness: 0.75 })),
    screen: B.mat('screen', () => std(0x0c0d10, { roughness: 0.25 })),
    rooftile: B.mat('rooftile', () => texMat('clay_roof_tiles_02', 0xffffff, 0.8)),
    curtain: B.mat('curtain', () => std(S.curtain, { roughness: 1, side: THREE.DoubleSide })),
  };
  const floorMat = (() => {
    if (S.floor === 'parquet') return B.mat('floorP', () => texMat('herringbone_parquet', prof.style === 'joven' ? 0xd8d0c8 : 0xffffff, 0.6));
    if (S.floor === 'marmol') return B.mat('floorM', () => texMat('rock_tile_floor', 0xf4f0ea, 0.25));
    const tex = S.floor === 'hidraulica' ? hydraulicTex(r) : S.floor === 'terrazo' ? terrazoTex(r) : barroTex(r);
    return B.mat('floorC', () => new THREE.MeshStandardMaterial({ map: tex, roughness: S.floor === 'terrazo' ? 0.35 : 0.7 }));
  })();
  const zocalo = S.zocalo ? B.mat('zocalo', () => new THREE.MeshStandardMaterial({ map: zocaloTex(r), roughness: 0.3 })) : null;
  // daylight in the windows (updated with the hour by the house life)
  const winMat = new THREE.MeshStandardMaterial({ color: 0xbfd8e8, emissive: 0xcfe4f4, emissiveIntensity: 0.6, roughness: 0.1 });

  // ---- shared drawing helpers
  const tileSize = { hidraulica: 0.42, barro: 0.62, terrazo: 0.8, parquet: 1.2, marmol: 1.2 }[S.floor] || 1.2;
  const floor = (key, x0, z0, x1, z1, y = 0, tex = key === floorMat ? tileSize : 1.2) => B.add(key, planeGeo(x1 - x0, z1 - z0, tex).rotateX(-Math.PI / 2), (x0 + x1) / 2, y + 0.005, (z0 + z1) / 2);
  const ceil = (x0, z0, x1, z1, y) => B.add(M.ceil, planeGeo(x1 - x0, z1 - z0, 2.0).rotateX(Math.PI / 2), (x0 + x1) / 2, y, (z0 + z1) / 2);
  const holeDoor = (a, w = 0.9) => [a, a + w, 0, 2.1];
  const winHole = (a, w = 1.3, y0 = 0.95, y1 = 2.05) => [a, a + w, y0, y1];
  // a window seen from inside: sill, glass with the light of the hour, a half-lowered shutter, curtains, a grille (ground floor)
  const windowIn = (x, z, ry, y = 0, w = 1.3, grille = true) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const q0 = P(0, -0.03), q1 = P(0, -0.01), q2 = P(0, 0.04), hS = 0.35 + r() * 0.4;
    B.extraMesh(new THREE.Mesh(planeGeo(w, 1.1, 1), winMat), q0[0], y + 1.5, q0[1], ry);
    B.add(M.shutter, boxGeo(w, hS, 0.03, 1), q1[0], y + 2.05 - hS / 2, q1[1], ry);
    B.add(M.wood, boxGeo(w + 0.12, 0.06, 0.22, 1), q2[0], y + 0.95, q2[1], ry);
    if (grille) for (let i = 0; i < 7; i++) { const q = P(-w / 2 + 0.12 + (i * (w - 0.24)) / 6, -0.08); B.add(M.iron, boxGeo(0.018, 1.1, 0.018, 1), q[0], y + 1.5, q[1], ry); }
    for (const sx of [-1, 1]) { const q = P(sx * (w / 2 + 0.06), 0.1); B.add(M.curtain, curtainGeo(0.38, 2.05), q[0], y + 1.2, q[1], ry); }
    B.view(z < 1 ? 'f' : 'b', x - w / 2, y + 0.95, z - 0.12, x + w / 2, y + 2.05, z + 0.12); // the street shows through it
  };
  const lampAt = (x, z, y, area) => B.light(x, y - 0.33, z, S.lamp, Math.min(11, 4 + area * 0.32), Math.max(6, Math.sqrt(area) * 2.6));

  // ---------------------------------------------------------------- layouts
  const rooms = [];
  const addRoom = (id, type, x0, z0, x1, z1, lv = 0) => { const rm = new Room(id, type, x0, z0, x1, z1, lv); rooms.push(rm); return rm; };
  const segs0 = [], segs1 = [];
  B.segs = segs0;
  let doorX = 0, D1, hw, W, P, twoStorey = false, SX0, SX1, SZ0, SZ1, backDoor = [-0.5, 0.5];
  const leaves = [];
  const leaf = (x, z, dx, dz, sign, open, w = 0.86, y = 0) => { const d = B.doorLeaf(M.wood, M.metal, x, z, dx, dz, sign, open, w); d.pivot.position.y = y; leaves.push(d); return d; };
  const ajar = () => 1.35 + r() * 0.35;
  // room-type queue: the profile's own rooms after the basics
  const queue = [...prof.rooms];
  const nextType = () => queue.shift() || pk(['dorm2', 'trastero', 'despensa']);

  if (prof.layout === 'pasillo') {
    // ---- a corridor from the street door to the patio, rooms on both sides
    W = 8.2 + r() * 2.2; hw = W / 2; D1 = 10 + r() * 2.6; P = 3.6 + r() * 2.2;
    const ch = 0.62 + r() * 0.14;
    const a1 = 3.6 + r() * 1.2, a2 = Math.min(a1 + 2.9 + r() * 1.2, D1 - 2.6);
    const b1 = 3.0 + r() * 1.0, b2 = b1 + 2.1 + r() * 0.5, b3 = b2 + 2.5 + r() * 0.8;
    const cutsL = [0, a1, a2, D1], cutsR = b3 < D1 - 2.0 ? [0, b1, b2, b3, D1] : [0, b1, b2, D1];
    const typesL = ['salon', nextType(), 'cocina'];
    const typesR = [nextType(), 'bano', nextType(), nextType()];
    addRoom('pasillo', 'pasillo', -ch, 0, ch, D1);
    const L = [], R = [];
    for (let i = 0; i < 3; i++) L.push(addRoom('L' + i, typesL[i], -hw, cutsL[i], -ch, cutsL[i + 1]));
    for (let i = 0; i < cutsR.length - 1; i++) R.push(addRoom('R' + i, typesR[i], ch, cutsR[i], hw, cutsR[i + 1]));
    for (const rm of rooms) floor(rm.type === 'bano' ? M.bath : rm.type === 'cocina' ? M.tile : floorMat, rm.x0, rm.z0, rm.x1, rm.z1);
    for (const rm of rooms) ceil(rm.x0, rm.z0, rm.x1, rm.z1, WALL_H);
    floor(M.patio, -hw, D1, hw, D1 + P, 0, 2.4);
    // facade: a window for each front room, the door in the corridor
    const wl = (-hw - ch) / 2, wr = (hw + ch) / 2;
    const facadeHoles = [winHole(wl - 0.65 + hw), holeDoor(hw - 0.55, 1.1), winHole(wr - 0.65 + hw)];
    B.wall(M.wall(0), -hw, 0, hw, 0, WALL_H, facadeHoles);
    B.wall(M.out, -hw, -0.02, hw, -0.02, WALL_H + 0.4, facadeHoles, 0, false);
    L[0].win('s', wl - 0.65, wl + 0.65); R[0].win('s', wr - 0.65, wr + 0.65);
    windowIn(wl, 0.03, 0); windowIn(wr, 0.03, 0);
    B.wall(M.wall(1), -hw, 0, -hw, D1); B.wall(M.wall(1), hw, 0, hw, D1);
    // corridor walls with a door into every room
    const holesL = [], holesR = [];
    L.forEach((rm, i) => { const zc = i === 0 ? rm.z1 - 0.75 : rm.z0 + 0.7 + r() * Math.max(0, rm.d - 1.6); holesL.push(holeDoor(zc - 0.45)); rm.door('e', zc - 0.45, zc + 0.45); rm.doorAt = { x: -ch, z: zc, nx: 1, nz: 0 }; leaf(-ch, zc - 0.45, 0, 1, -1, ajar()); });
    R.forEach((rm, i) => { const zc = i === 0 ? rm.z1 - 0.75 : rm.z0 + 0.7 + r() * Math.max(0, rm.d - 1.6); holesR.push(holeDoor(zc - 0.45)); rm.door('w', zc - 0.45, zc + 0.45); rm.doorAt = { x: ch, z: zc, nx: -1, nz: 0 }; leaf(ch, zc - 0.45, 0, 1, 1, ajar()); });
    for (const rm of L) rooms[0].door('w', rm.doorAt.z - 0.45, rm.doorAt.z + 0.45);
    for (const rm of R) rooms[0].door('e', rm.doorAt.z - 0.45, rm.doorAt.z + 0.45);
    backDoor = [-0.5, 0.5];
    B.wall(M.wall(2), -ch, 0, -ch, D1, WALL_H, holesL);
    B.wall(M.wall(2), ch, 0, ch, D1, WALL_H, holesR);
    for (let i = 1; i < L.length; i++) B.wall(M.wall(i), -hw, cutsL[i], -ch, cutsL[i]);
    for (let i = 1; i < R.length; i++) B.wall(M.wall(i + 1), ch, cutsR[i], hw, cutsR[i]);
    // back wall onto the patio: corridor door and the kitchen window
    const backHoles = [[-3.6 + hw + 0.4, -2.3 + hw + 0.4, 1.0, 2.0], holeDoor(hw - 0.5, 1.0)];
    B.wall(M.wall(3), -hw, D1, hw, D1, WALL_H, backHoles);
    B.wall(M.out, -hw, D1 + 0.02, hw, D1 + 0.02, WALL_H + 0.25, backHoles, 0, false);
    L[2].win('n', -3.2, -1.9);
    windowIn(-2.55, D1 - 0.03, Math.PI, 0, 1.3, false);
    leaf(-0.5, D1, 1, 0, -1, 1.6, 1.0);
    rooms[0].door('n', -0.5, 0.5); rooms[0].door('s', -0.55, 0.55);
    rooms[0].doorsAlong = [...L, ...R].map((rm) => rm.doorAt);
    B.add(M.rooftile, boxGeo(W + 0.5, 0.25, D1 + 0.3, 2.5), 0, WALL_H + 0.15, D1 / 2);
    doorX = 0;
  } else if (prof.layout === 'lateral') {
    // ---- a narrow house: corridor along the left wall, rooms one behind the other on the right
    W = 6.0 + r() * 1.6; hw = W / 2; P = 3.4 + r() * 2.2;
    const cw = 1.2, xr = -hw + cw;
    const depths = [3.8 + r() * 0.9, 3.0 + r() * 0.8, 2.1 + r() * 0.4, 3.0 + r() * 0.8];
    const types = ['salon', nextType(), 'bano', 'cocina'];
    if (r() < 0.5) { depths.splice(3, 0, 2.8 + r() * 0.6); types.splice(3, 0, nextType()); }
    D1 = depths.reduce((a, b) => a + b, 0);
    addRoom('pasillo', 'pasillo', -hw, 0, xr, D1);
    let z = 0;
    const RR = [];
    depths.forEach((d, i) => { RR.push(addRoom('R' + i, types[i], xr, z, hw, z + d)); z += d; });
    for (const rm of rooms) floor(rm.type === 'bano' ? M.bath : rm.type === 'cocina' ? M.tile : floorMat, rm.x0, rm.z0, rm.x1, rm.z1);
    for (const rm of rooms) ceil(rm.x0, rm.z0, rm.x1, rm.z1, WALL_H);
    floor(M.patio, -hw, D1, hw, D1 + P, 0, 2.4);
    doorX = -hw + cw / 2;
    const wx = (xr + hw) / 2;
    const facadeHoles = [holeDoor(doorX - 0.5 + hw, 1.0), winHole(wx - 0.7 + hw, 1.4)];
    B.wall(M.wall(0), -hw, 0, hw, 0, WALL_H, facadeHoles);
    B.wall(M.out, -hw, -0.02, hw, -0.02, WALL_H + 0.4, facadeHoles, 0, false);
    RR[0].win('s', wx - 0.7, wx + 0.7); windowIn(wx, 0.03, 0, 0, 1.4);
    B.wall(M.wall(1), -hw, 0, -hw, D1); B.wall(M.wall(1), hw, 0, hw, D1);
    const holes = [];
    RR.forEach((rm, i) => { const zc = rm.z0 + 0.65 + r() * Math.max(0, rm.d - 1.5); holes.push(holeDoor(zc - 0.45)); rm.door('w', zc - 0.45, zc + 0.45); rm.doorAt = { x: xr, z: zc, nx: -1, nz: 0 }; leaf(xr, zc - 0.45, 0, 1, 1, ajar()); });
    for (const rm of RR) rooms[0].door('e', rm.doorAt.z - 0.45, rm.doorAt.z + 0.45);
    backDoor = [doorX - 0.5, doorX + 0.5];
    B.wall(M.wall(2), xr, 0, xr, D1, WALL_H, holes);
    for (let i = 1; i < RR.length; i++) B.wall(M.wall(i + 1), xr, RR[i].z0, hw, RR[i].z0);
    const kx = (xr + hw) / 2;
    const backHoles = [holeDoor(doorX - 0.5 + hw, 1.0), [kx - 0.65 + hw, kx + 0.65 + hw, 1.0, 2.0]];
    B.wall(M.wall(3), -hw, D1, hw, D1, WALL_H, backHoles);
    B.wall(M.out, -hw, D1 + 0.02, hw, D1 + 0.02, WALL_H + 0.25, backHoles, 0, false);
    RR[RR.length - 1].win('n', kx - 0.65, kx + 0.65); windowIn(kx, D1 - 0.03, Math.PI, 0, 1.3, false);
    leaf(doorX - 0.5, D1, 1, 0, -1, 1.6, 1.0);
    rooms[0].door('n', doorX - 0.5, doorX + 0.5); rooms[0].door('s', doorX - 0.5, doorX + 0.5);
    rooms[0].doorsAlong = RR.map((rm) => rm.doorAt);
    B.add(M.rooftile, boxGeo(W + 0.5, 0.25, D1 + 0.3, 2.5), 0, WALL_H + 0.15, D1 / 2);
  } else {
    // ---- two storeys (like Annie's): front room, then a hall with the stairs, kitchen and a bathroom; upstairs the bedrooms
    twoStorey = true;
    W = 6.4 + r() * 1.6; hw = W / 2; P = 3.0 + r() * 1.6;
    const a = 3.6 + r() * 0.8;
    SX1 = hw - 0.08; SX0 = SX1 - 1.12; SZ0 = a + 1.2; SZ1 = SZ0 + 4.4;
    D1 = SZ1 + 1.1 + r() * 0.6;
    const xk = SX0 - 1.1, kd = (D1 - a) * 0.6;
    const NSTEP = 17;
    // ground floor
    const salon = addRoom('salon', 'salon', -hw, 0, hw, a);
    const hall = addRoom('hall', 'hall', xk, a, hw, D1);
    const coc = addRoom('cocina', 'cocina', -hw, a, xk, a + kd);
    const ban = addRoom('bano', 'bano', -hw, a + kd, xk, D1);
    floor(floorMat, -hw, 0, hw, a); floor(M.tile, xk, a, hw, D1); floor(M.tile, -hw, a, xk, a + kd); floor(M.bath, -hw, a + kd, xk, D1);
    ceil(-hw, 0, hw, a, WALL_H); ceil(-hw, a, xk, D1, WALL_H);
    ceil(xk, a, hw, SZ0, WALL_H); ceil(xk, SZ0, SX0, D1, WALL_H); ceil(SX0, SZ1, hw, D1, WALL_H);
    floor(M.patio, -hw, D1, hw, D1 + P, 0, 2.4);
    doorX = r() < 0.5 ? 0 : -hw + 1.2;
    const wx = doorX === 0 ? (r() < 0.5 ? -hw + 1.1 : hw - 1.4) : 0.9;
    const facadeHoles = [holeDoor(doorX - 0.55 + hw, 1.1), winHole(wx - 0.65 + hw)].sort((p, q) => p[0] - q[0]);
    B.wall(M.wall(0), -hw, 0, hw, 0, WALL_H, facadeHoles);
    B.wall(M.out, -hw, -0.02, hw, -0.02, WALL_H + 0.4, facadeHoles, 0, false);
    salon.win('s', wx - 0.65, wx + 0.65); windowIn(wx, 0.03, 0);
    salon.door('s', doorX - 0.55, doorX + 0.55);
    B.wall(M.wall(0), -hw, 0, -hw, a); B.wall(M.wall(0), hw, 0, hw, a);
    B.wall(M.wall(1), -hw, a, -hw, D1); B.wall(M.wall(2), hw, a, hw, D1, F2);
    // salon → hall door, near the stairs side
    const dz = xk + 0.15;
    B.wall(M.wall(0), -hw, a, hw, a, WALL_H, [holeDoor(dz + hw)]);
    salon.door('n', dz, dz + 0.9); hall.door('s', dz, dz + 0.9);
    leaf(dz, a, 1, 0, 1, 1.5);
    // kitchen and bathroom doors onto the hall
    const kz = a + 0.35 + r() * Math.max(0, kd - 1.4);
    B.wall(M.wall(1), xk, a, xk, D1, WALL_H, [holeDoor(kz - a), holeDoor(D1 - a - 1.05, 0.8)]);
    coc.door('e', kz, kz + 0.9); hall.door('w', kz, kz + 0.9); ban.door('e', D1 - 1.05, D1 - 0.25); hall.door('w', D1 - 1.05, D1 - 0.25);
    coc.doorAt = { x: xk, z: kz + 0.45, nx: 1, nz: 0 }; ban.doorAt = { x: xk, z: D1 - 0.65, nx: 1, nz: 0 };
    leaf(xk, kz, 0, 1, -1, 1.45); leaf(xk, D1 - 1.05, 0, 1, -1, 1.3, 0.8);
    B.wall(M.wall(1), -hw, a + kd, xk, a + kd);
    // back onto the patio: door from the hall, kitchen window
    const pdx = xk + 0.2;
    const backHoles = [[-hw + 0.9 + hw, -hw + 2.0 + hw, 1.2, 1.9], holeDoor(pdx + hw)];
    B.wall(M.wall(3), -hw, D1, hw, D1, WALL_H, backHoles);
    B.wall(M.out, -hw, D1 + 0.02, hw, D1 + 0.02, WALL_H + 0.25, backHoles, 0, false);
    hall.door('n', pdx, pdx + 0.9); leaf(pdx, D1, 1, 0, -1, 1.55);
    backDoor = [pdx, pdx + 0.9];
    ban.win('n', -hw + 0.9, -hw + 2.0);
    // the stairs: solid steps against the right wall, closed underneath; handrail
    const rise = F2 / NSTEP, run = (SZ1 - SZ0) / NSTEP;
    const mStep = B.mat('step', () => texMat(prof.style === 'lujo' ? 'rock_tile_floor' : 'floor_tiles_06', prof.style === 'lujo' ? 0xf4f0ea : 0xe0c8b0, 0.35));
    for (let i = 0; i < NSTEP; i++) {
      const top = rise * (i + 1), z0 = SZ0 + run * i;
      B.add(M.wall(2), boxGeo(SX1 - SX0, top - 0.03, run, 1.6), (SX0 + SX1) / 2, (top - 0.03) / 2, z0 + run / 2);
      B.add(mStep, boxGeo(SX1 - SX0 + 0.02, 0.03, run + 0.03, 0.8), (SX0 + SX1) / 2, top - 0.015, z0 + run / 2 + 0.015);
    }
    segs0.push([B.ox + SX0, B.oz + SZ0, B.ox + SX0, B.oz + SZ1, 3]);
    segs0.push([B.ox + SX0, B.oz + SZ1, B.ox + hw, B.oz + SZ1, 3]);
    hall.boxes.push([SX0 - 0.05, SZ0 - 0.9, hw, SZ1 + 0.1]); // keep the foot of the stairs clear
    const rail = (x0, z0, y0, x1, z1, y1) => {
      const L = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      const m = new THREE.Mesh(cylGeo(0.022, 0.022, L, 8), B.mats.get(M.wood));
      m.position.set(B.ox + (x0 + x1) / 2, (y0 + y1) / 2, B.oz + (z0 + z1) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
      B.extra.push(m);
    };
    rail(SX0 + 0.04, SZ0 + 0.1, 0.95, SX0 + 0.04, SZ1, F2 + 0.95);
    for (let i = 1; i < NSTEP; i += 2) { const z = SZ0 + run * (i + 0.5); B.add(M.iron, boxGeo(0.02, 0.9, 0.02, 1), SX0 + 0.04, rise * (i + 1) + 0.45, z); }
    B.add(M.rooftile, boxGeo(W + 0.5, 0.25, D1 + 0.3, 2.5), 0, F2 + H2 + 0.15, D1 / 2);
    // ---- upper floor
    B.segs = segs1;
    const Y = F2, mid = SZ0 + 2.3;
    const up0 = addRoom('A0', nextType(), -hw, 0, hw, SZ0, 1);
    const up1 = addRoom('A1', r() < 0.6 ? 'bano' : nextType(), -hw, SZ0, xk, mid, 1);
    const up2 = addRoom('A2', nextType(), -hw, mid, xk, D1, 1);
    const land = addRoom('rellano', 'hall', xk, SZ0, hw, D1, 1);
    for (const rm of [up0, up1, up2]) { floor(rm.type === 'bano' ? M.bath : floorMat, rm.x0, rm.z0, rm.x1, rm.z1, Y); ceil(rm.x0, rm.z0, rm.x1, rm.z1, Y + H2); }
    floor(floorMat, xk, SZ0, SX0, D1, Y); floor(floorMat, SX0, SZ1, hw, D1, Y); ceil(xk, SZ0, hw, D1, Y + H2);
    B.add(M.ceil, boxGeo(0.1, F2 - WALL_H, SZ1 - SZ0, 1), SX0 - 0.05, WALL_H + (F2 - WALL_H) / 2, (SZ0 + SZ1) / 2);
    B.add(M.ceil, boxGeo(hw - SX0, F2 - WALL_H + 0.01, 0.1, 1), (SX0 + hw) / 2, WALL_H + (F2 - WALL_H) / 2 - 0.005, SZ0);
    const fw = r() < 0.5;
    const upFacade = fw ? [[hw - 1.3 + hw - 1.0, hw - 0.3 + hw - 1.0, 0, 2.15]] : [winHole(-0.65 + hw)];
    B.wall(M.wall(3), -hw, 0, hw, 0, H2, upFacade, Y);
    B.wall(M.out, -hw, -0.02, hw, -0.02, H2 + 0.3, upFacade, Y, false);
    if (fw) { up0.win('s', hw - 2.3, hw - 1.3); segs1.push([B.ox + hw - 2.3, B.oz + 0.05, B.ox + hw - 1.3, B.oz + 0.05, 1.1]); windowIn(hw - 1.8, 0.03, 0, Y, 1.0, false); }
    else { up0.win('s', -0.65, 0.65); windowIn(0, 0.03, 0, Y, 1.3, false); }
    B.wall(M.wall(3), -hw, 0, -hw, SZ0, H2, [], Y); B.wall(M.wall(3), hw, 0, hw, SZ0, H2, [], Y);
    B.wall(M.wall(1), -hw, SZ0, -hw, D1, H2, [], Y); B.wall(M.wall(2), hw, SZ0, hw, D1, H2, [], Y);
    const upBack = [[0.9, 2.0, 1.1, 1.9]];
    B.wall(M.wall(1), -hw, D1, hw, D1, H2, upBack, Y);
    B.wall(M.out, -hw, D1 + 0.02, hw, D1 + 0.02, H2 + 0.3, upBack, Y, false);
    up2.win('n', -hw + 0.9, -hw + 2.0); windowIn(-hw + 1.45, D1 - 0.03, Math.PI, Y, 1.1, false);
    // bedroom door from the landing (beside the stairwell), and the two back rooms' doors
    B.wall(M.wall(3), -hw, SZ0, hw, SZ0, H2, [holeDoor(xk + 0.1 + hw)], Y);
    up0.door('n', xk + 0.1, xk + 1.0); land.door('s', xk + 0.1, xk + 1.0);
    up0.doorAt = { x: xk + 0.55, z: SZ0, nx: 0, nz: 1 };
    const d1z = SZ0 + 0.3, d2z = mid + 0.35;
    B.wall(M.wall(1), xk, SZ0, xk, D1, H2, [holeDoor(d1z - SZ0), holeDoor(d2z - SZ0)], Y);
    up1.door('e', d1z, d1z + 0.9); up2.door('e', d2z, d2z + 0.9);
    up1.doorAt = { x: xk, z: d1z + 0.45, nx: 1, nz: 0 }; up2.doorAt = { x: xk, z: d2z + 0.45, nx: 1, nz: 0 };
    land.door('w', d1z, d1z + 0.9); land.door('w', d2z, d2z + 0.9);
    B.wall(M.wall(1), -hw, mid, xk, mid, H2, [], Y);
    segs1.push([B.ox + SX0, B.oz + SZ0, B.ox + SX0, B.oz + SZ1, 1.1]);
    for (let z = SZ0 + 0.1; z < SZ1; z += 0.12) B.add(M.iron, boxGeo(0.018, 0.9, 0.018, 1), SX0 + 0.02, Y + 0.45, z);
    rail(SX0 + 0.02, SZ0 + 0.05, Y + 0.93, SX0 + 0.02, SZ1, Y + 0.93);
    land.boxes.push([SX0 - 0.05, SZ0, hw, SZ1]); // the stairwell
    leaf(xk + 0.1, SZ0, 1, 0, -1, 1.5, 0.86, Y); leaf(xk, d1z, 0, 1, -1, 1.4, 0.86, Y); leaf(xk, d2z, 0, 1, -1, 1.45, 0.86, Y);
    B.segs = segs0;
    hall.doorsAlong = [coc.doorAt, ban.doorAt];
    land.doorsAlong = [up0.doorAt, up1.doorAt, up2.doorAt];
  }
  const D = D1 + P;

  // ---- the street door (shut from inside) and the way out
  B.add(M.wood, boxGeo(prof.layout === 'lateral' ? 1.0 : 1.1, 2.2, 0.08, 1.2), doorX, 1.1, 0.06, 0);
  B.add(M.metal, boxGeo(0.06, 0.06, 0.1, 1), doorX + 0.38, 1.05, 0.12, 0);
  B.interact({ type: 'exit', x: doorX, z: 0.7, r: 1.1, label: 'Salir a la calle' });
  segs0.push([B.ox + doorX - 0.6, B.oz + 0.05, B.ox + doorX + 0.6, B.oz + 0.05, 2.2]);
  // patio walls (over them, the roofs of the neighbours)
  B.wall(M.out, -hw, D1, -hw, D, 3.6); B.wall(M.out, hw, D1, hw, D, 3.6); B.wall(M.out, -hw, D, hw, D, 3.6);
  B.view('b', -hw, 3.2, D1, hw, 40, D);
  if (S.zocalo) for (const rm of rooms) if (rm.lv === 0 && rm.type !== 'bano' && rm.type !== 'cocina') {
    // tiled skirting 1.1 m high round the room (skipping doors)
    for (const [side, ax, az, bx, bz] of [['s', rm.x0, rm.z0 + INSET - 0.07, rm.x1, rm.z0 + INSET - 0.07], ['n', rm.x0, rm.z1 - INSET + 0.07, rm.x1, rm.z1 - INSET + 0.07], ['w', rm.x0 + INSET - 0.07, rm.z0, rm.x0 + INSET - 0.07, rm.z1], ['e', rm.x1 - INSET + 0.07, rm.z0, rm.x1 - INSET + 0.07, rm.z1]]) {
      const along = side === 's' || side === 'n';
      const lo = along ? rm.x0 : rm.z0, hi = along ? rm.x1 : rm.z1;
      const cuts = rm.open.filter((o) => o.side === side && o.door).map((o) => [o.a, o.b]).sort((p, q) => p[0] - q[0]);
      let s0 = lo;
      const piece = (p0, p1) => {
        if (p1 - p0 < 0.05) return;
        const c = (p0 + p1) / 2, L = p1 - p0;
        const ry = along ? (side === 's' ? 0 : Math.PI) : side === 'w' ? Math.PI / 2 : -Math.PI / 2;
        const px = along ? c : side === 'w' ? rm.x0 + WALLF + 0.004 : rm.x1 - WALLF - 0.004, pz = along ? (side === 's' ? rm.z0 + WALLF + 0.004 : rm.z1 - WALLF - 0.004) : c;
        B.add(zocalo, planeGeo(L, 1.1, 0.24), px, 0.55, pz, ry);
      };
      for (const [a0, b0] of cuts) { piece(s0, a0); s0 = b0; }
      piece(s0, hi);
    }
  }

  // ---------------------------------------------------------------- furniture
  const loot = [];
  const pieces = { bed: [], sofa: [], kitchen: [], tv: [], table: [], seat: [] };
  const lootPool = [...prof.loot];
  // a piece drawn in its own frame (width x, depth z, front towards +z), placed at (x, z) turned by ry on level y
  const at = (x, z, ry, y = 0) => { const c = Math.cos(ry), s = Math.sin(ry); return (key, geo, lx, ly, lz, rot = 0) => B.add(key, geo, x + lx * c + lz * s, y + ly, z - lx * s + lz * c, ry + rot); };
  const L2W = (x, z, ry, lx, lz) => { const c = Math.cos(ry), s = Math.sin(ry); return [x + lx * c + lz * s, z - lx * s + lz * c]; };
  const segsFor = (rm) => (rm.lv ? segs1 : segs0);
  const foot = (rm, w, d, x, z, ry, h) => { const keep = B.segs; B.segs = segsFor(rm); B.footprint(w, d, x, z, ry, Math.max(h, 0.5)); B.segs = keep; };
  // a loot item: its own mesh (so it can disappear), an interaction
  const lootItem = (id, mesh, x, y, z, ry = 0, extra = {}) => {
    const def = LOOT[id];
    if (!def) return;
    if (mesh) B.extraMesh(mesh, x, y, z, ry);
    const it = B.interact({ type: 'loot', id, x, z, y: y > 2 ? F2 : 0, r: 0.95, label: (def.hidden ? 'Buscar bajo el colchón' : 'Coger: ' + def.name.toLowerCase()), mesh, def, ...extra });
    loot.push(it);
    return it;
  };
  const takeLoot = (...ids) => { for (const id of ids) { const i = lootPool.indexOf(id); if (i >= 0) { lootPool.splice(i, 1); return id; } } return null; };
  const smallMesh = (geo, mat) => { const m = new THREE.Mesh(geo, typeof mat === 'string' ? B.mats.get(mat) : mat); m.castShadow = true; return m; };
  const picture = (tex, x, y, z, ry, w = 0.42, h = 0.52) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    B.extraMesh(m, x, y, z, ry);
    B.add(M.wood, boxGeo(w + 0.05, h + 0.05, 0.02, 1), x - Math.sin(ry) * 0.016, y, z - Math.cos(ry) * 0.016, ry);
    return m;
  };
  // hang something on a free stretch of wall (not over windows, doors or tall furniture)
  const onWall = (rm, w, fn, sides = ['s', 'n', 'w', 'e']) => {
    for (const side of sides.sort(() => r() - 0.5)) {
      const along = side === 's' || side === 'n';
      const lo = (along ? rm.x0 : rm.z0) + 0.35 + w / 2, hi = (along ? rm.x1 : rm.z1) - 0.35 - w / 2;
      for (let k = 0; k < 8 && hi > lo; k++) {
        const c = lo + r() * (hi - lo);
        if (rm.open.some((o) => o.side === side && c + w / 2 > o.a - 0.15 && c - w / 2 < o.b + 0.15)) continue;
        if (rm.tallOn[side].some(([a, b]) => c + w / 2 > a && c - w / 2 < b)) continue;
        const y = rm.lv ? F2 : 0;
        const x = side === 's' || side === 'n' ? c : side === 'w' ? rm.x0 + WALLF + 0.02 : rm.x1 - WALLF - 0.02;
        const z = side === 's' ? rm.z0 + WALLF + 0.02 : side === 'n' ? rm.z1 - WALLF - 0.02 : c;
        rm.tallOn[side].push([c - w / 2, c + w / 2]);
        return fn(x, y, z, SIDE_RY[side]);
      }
    }
    return null;
  };
  const decorate = (rm, n) => {
    for (let i = 0; i < n; i++) {
      const kind = S.posters && r() < 0.6 ? 'poster' : prof.id === 'abuela' || prof.id === 'matrimonio' ? pk(['virgen', 'foto', 'foto', 'paisaje', 'calendario']) : prof.id === 'artista' ? 'pintura' : pk(['paisaje', 'foto', 'pintura']);
      const w = kind === 'poster' ? 0.5 : kind === 'pintura' ? 0.7 : 0.42;
      onWall(rm, w, (x, y, z, ry) => {
        const tex = kind === 'poster' ? posterTex(r) : kind === 'pintura' ? paintingTex(r) : pictureTexture(kind, Math.floor(r() * 1e6));
        const h = kind === 'poster' ? 0.68 : kind === 'pintura' ? 0.52 : 0.52;
        const m = picture(tex, x, y + 1.55 + r() * 0.15, z, ry, w, h);
        if (kind === 'pintura' && takeLoot('cuadro')) lootItem('cuadro', null, x + Math.sin(ry) * 0.5, y + 1.6, z + Math.cos(ry) * 0.5, 0, { mesh: m, r: 1.1 });
      });
    }
  };
  const plant = (rm, big = r() < 0.5) => {
    const p = rm.fit(0.5, 0.5, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r);
    if (!p) return;
    const y = rm.lv ? F2 : 0;
    B.add(M.pot, cylGeo(big ? 0.22 : 0.15, big ? 0.16 : 0.11, big ? 0.36 : 0.24), p.x, y + (big ? 0.18 : 0.12), p.z);
    B.add(M.plant, new THREE.SphereGeometry(big ? 0.34 : 0.22, 10, 8), p.x, y + (big ? 0.62 : 0.38), p.z);
    if (r() < 0.6) for (let i = 0; i < 5; i++) B.add(M.flower, new THREE.SphereGeometry(0.045, 6, 5), p.x + (r() - 0.5) * 0.32, y + (big ? 0.78 : 0.5) + r() * 0.1, p.z + (r() - 0.5) * 0.32);
  };
  const rug = (rm) => {
    const p = rm.fitCenter(1.6, 1.1, r);
    if (!p) return;
    rm.boxes.pop(); // walkable
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rugTexture(Math.floor(r() * 1e6)), roughness: 1 }));
    B.extraMesh(m, p.x, (rm.lv ? F2 : 0) + 0.012, p.z);
  };

  // ---- the pieces (w x d x h in their own frame; y = level)
  const F = {
    sofa(rm, sides = ['s', 'n', 'w', 'e'], color = 0) {
      const w = 1.8 + r() * 0.4, d = 0.85;
      const p = rm.fit(w, d, sides, false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y), m = prof.style === 'rustico' || prof.id === 'cazador' ? M.leather : M.fabric(color);
      A(m, boxGeo(w, 0.42, d, 1), 0, 0.21, 0.02); A(m, boxGeo(w, 0.48, 0.2, 1), 0, 0.64, -d / 2 + 0.1);
      A(m, boxGeo(0.18, 0.28, d, 1), -w / 2 + 0.09, 0.56, 0.02); A(m, boxGeo(0.18, 0.28, d, 1), w / 2 - 0.09, 0.56, 0.02);
      for (let i = 0; i < 2; i++) A(M.fabric(color + 1 + i), boxGeo(0.36, 0.34, 0.12, 1), (i ? 1 : -1) * (w / 2 - 0.4), 0.62, -d / 2 + 0.26, 0.12);
      foot(rm, w, d, p.x, p.z, p.ry, 0.9);
      const seat = { x: cx0 + L2W(p.x, p.z, p.ry, 0, 0.18)[0], z: cz0 + L2W(p.x, p.z, p.ry, 0, 0.18)[1], y, h: p.ry + Math.PI * 0, rm };
      pieces.sofa.push({ ...p, y, seat, rm }); pieces.seat.push(seat);
      return p;
    },
    armchair(rm) {
      const p = rm.fit(0.85, 0.85, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y), m = M.fabric(2);
      A(m, boxGeo(0.8, 0.42, 0.8, 1), 0, 0.21, 0); A(m, boxGeo(0.8, 0.5, 0.18, 1), 0, 0.66, -0.31); A(m, boxGeo(0.14, 0.25, 0.8, 1), -0.33, 0.54, 0); A(m, boxGeo(0.14, 0.25, 0.8, 1), 0.33, 0.54, 0);
      foot(rm, 0.8, 0.8, p.x, p.z, p.ry, 0.9);
      const q = L2W(p.x, p.z, p.ry, 0, 0.1); pieces.seat.push({ x: cx0 + q[0], z: cz0 + q[1], y, h: p.ry, rm });
      return p;
    },
    tv(rm, sides) {
      const w = prof.id === 'abuela' || prof.id === 'matrimonio' ? 1.0 : 1.5, d = 0.45;
      const p = rm.fit(w + 0.2, d, sides || ['n', 's', 'e', 'w'], false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(w + 0.2, 0.5, d, 1), 0, 0.25, 0);
      const big = w > 1.2;
      const scr = smallMesh(boxGeo(big ? 1.25 : 0.72, big ? 0.72 : 0.5, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0x0c0d10, emissive: 0x6a8aa8, emissiveIntensity: 0.0, roughness: 0.3 }));
      const q = L2W(p.x, p.z, p.ry, 0, -0.05);
      B.extraMesh(scr, q[0], y + 0.5 + (big ? 0.38 : 0.28), q[1], p.ry);
      foot(rm, w + 0.2, d, p.x, p.z, p.ry, 0.5);
      const f = L2W(p.x, p.z, p.ry, 0, 0.9);
      B.interact({ type: 'tv', x: f[0], z: f[1], y, r: 0.9, label: 'Encender la tele', mesh: scr });
      pieces.tv.push({ ...p, y, mesh: scr, rm });
      // a console on the stand
      if (big && takeLoot('consola')) { const m = smallMesh(boxGeo(0.3, 0.06, 0.24, 1), M.black); const c = L2W(p.x, p.z, p.ry, 0.55, 0.05); lootItem('consola', m, c[0], y + 0.53, c[1], p.ry); }
      return p;
    },
    coffeeTable(rm) {
      const p = rm.fitCenter(1.0, 0.55, r); if (!p) return null;
      const y = rm.lv ? F2 : 0;
      B.add(prof.style === 'lujo' ? M.glass : M.wood, boxGeo(1.0, 0.04, 0.55, 1), p.x, y + 0.42, p.z);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(M.wood, boxGeo(0.04, 0.4, 0.04, 1), p.x + a * 0.44, y + 0.2, p.z + b * 0.22);
      foot(rm, 1.0, 0.55, p.x, p.z, 0, 0.5);
      const id = takeLoot('cartera', 'movil');
      if (id) lootItem(id, smallMesh(id === 'cartera' ? boxGeo(0.11, 0.025, 0.09, 1) : boxGeo(0.08, 0.012, 0.15, 1), id === 'cartera' ? M.leather : M.black), p.x + 0.25, y + 0.45, p.z, r() * 3);
      pieces.table.push({ x: p.x, z: p.z, y: y + 0.44, rm });
      return p;
    },
    // the mesa camilla: round table with a long skirt and the brasero underneath (old houses)
    camilla(rm) {
      const p = rm.fitCenter(1.0, 1.0, r); if (!p) return null;
      const y = rm.lv ? F2 : 0;
      B.add(M.fabric(0), new THREE.CylinderGeometry(0.55, 0.62, 0.72, 20), p.x, y + 0.36, p.z);
      B.add(M.white, new THREE.CylinderGeometry(0.56, 0.56, 0.03, 20), p.x, y + 0.735, p.z);
      foot(rm, 1.1, 1.1, p.x, p.z, 0, 0.8);
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + r() * 0.6, cx = p.x + Math.sin(a) * 0.95, cz = p.z + Math.cos(a) * 0.95;
        if (!rm.free([cx - 0.25, cz - 0.25, cx + 0.25, cz + 0.25])) continue;
        const A = at(cx, cz, a + Math.PI);
        A(M.wood, boxGeo(0.42, 0.04, 0.42, 1), 0, y + 0.46, 0); A(M.wood, boxGeo(0.42, 0.5, 0.04, 1), 0, y + 0.71, -0.2);
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(M.wood, boxGeo(0.035, 0.46, 0.035, 1), u * 0.18, y + 0.23, v * 0.18);
        pieces.seat.push({ x: cx0 + cx, z: cz0 + cz, y, h: a + Math.PI, rm, chair: true });
      }
      pieces.table.push({ x: p.x, z: p.z, y: y + 0.75, rm });
      return p;
    },
    diningTable(rm, n = 4) {
      const w = 1.4, d = 0.85;
      const p = rm.fitCenter(w + 1.0, d + 1.0, r); if (!p) return null;
      rm.boxes.pop(); rm.boxes.push([p.x - w / 2 - 0.5, p.z - d / 2 - 0.5, p.x + w / 2 + 0.5, p.z + d / 2 + 0.5]);
      const y = rm.lv ? F2 : 0;
      B.add(M.wood, boxGeo(w, 0.05, d, 1), p.x, y + 0.76, p.z);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(M.wood, boxGeo(0.06, 0.74, 0.06, 1), p.x + a * (w / 2 - 0.08), y + 0.37, p.z + b * (d / 2 - 0.08));
      foot(rm, w, d, p.x, p.z, 0, 0.8);
      const seats = [[-0.35, -1, 0], [0.35, -1, 0], [-0.35, 1, Math.PI], [0.35, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]].slice(0, n);
      for (const [u, v, ry] of seats) {
        const cx = p.x + (Math.abs(u) === 1 ? u * (w / 2 + 0.3) : u), cz = p.z + (Math.abs(v) === 1 ? v * (d / 2 + 0.3) : 0);
        const A = at(cx, cz, ry);
        A(M.wood, boxGeo(0.42, 0.04, 0.42, 1), 0, y + 0.46, 0); A(M.wood, boxGeo(0.42, 0.5, 0.04, 1), 0, y + 0.71, -0.2);
        for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(M.wood, boxGeo(0.035, 0.46, 0.035, 1), s1 * 0.18, y + 0.23, s2 * 0.18);
        pieces.seat.push({ x: cx0 + cx, z: cz0 + cz, y, h: ry, rm, chair: true });
      }
      pieces.table.push({ x: p.x, z: p.z, y: y + 0.78, rm });
      return p;
    },
    shelf(rm, books = true) {
      const w = 1.0 + r() * 0.4, d = 0.34;
      const p = rm.fit(w, d, ['n', 's', 'w', 'e'].sort(() => r() - 0.5), true, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(w, 1.8, 0.03, 1), 0, 0.9, -d / 2 + 0.015);
      A(M.wood, boxGeo(0.03, 1.8, d, 1), -w / 2, 0.9, 0); A(M.wood, boxGeo(0.03, 1.8, d, 1), w / 2, 0.9, 0);
      for (const hy of [0.02, 0.45, 0.88, 1.31, 1.77]) A(M.wood, boxGeo(w, 0.03, d, 1), 0, hy, 0);
      const cols = [0x7a2a22, 0x2a4a6a, 0x3a5a2a, 0xb89a5a, 0xe8dcc0, 0x5a3a6a];
      if (books) for (let sh = 0; sh < 3; sh++) { let x = -w / 2 + 0.05; while (x < w / 2 - 0.1) { const bw = 0.03 + r() * 0.035, bh = 0.2 + r() * 0.13; if (r() < 0.1) { x += 0.1; continue; } A(B.mat('book' + Math.floor(r() * 6), () => std(cols[Math.floor(r() * 6)], { roughness: 0.8 })), boxGeo(bw, bh, 0.2, 1), x + bw / 2, 0.05 + sh * 0.43 + bh / 2, 0, (r() - 0.5) * 0.05); x += bw + 0.004; } }
      foot(rm, w, d, p.x, p.z, p.ry, 1.8);
      const f = L2W(p.x, p.z, p.ry, 0, 0.7);
      B.interact({ type: 'read', x: f[0], z: f[1], y, r: 0.8, label: 'Hojear un libro' });
      return p;
    },
    vitrina(rm) {
      const w = 1.2, d = 0.45;
      const p = rm.fit(w, d, ['n', 's', 'w', 'e'].sort(() => r() - 0.5), true, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(w, 0.85, d, 1), 0, 0.425, 0); A(M.wood, boxGeo(w, 1.05, 0.04, 1), 0, 1.38, -d / 2 + 0.02);
      A(M.wood, boxGeo(w, 0.04, d * 0.8, 1), 0, 1.9, -0.04); A(M.glass, boxGeo(w - 0.04, 1.0, 0.02, 1), 0, 1.38, d * 0.3);
      for (const hy of [1.2, 1.55]) { A(M.wood, boxGeo(w - 0.06, 0.02, d * 0.7, 1), 0, hy, -0.05); for (let i = 0; i < 4; i++) A(M.white, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16).rotateX(Math.PI / 2), -0.42 + i * 0.28, hy + 0.11, -0.12); }
      foot(rm, w, d, p.x, p.z, p.ry, 1.9);
      return p;
    },
    chimney(rm) {
      const w = 1.4, d = 0.55;
      const p = rm.fit(w, d, ['n', 'w', 'e'], true, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.stone, boxGeo(w, 0.95, d, 0.8), 0, 0.475, 0); A(M.stone, boxGeo(w * 0.7, WALL_H - 0.95, d * 0.6, 0.8), 0, 0.95 + (WALL_H - 0.95) / 2, -d * 0.2);
      A(M.black, boxGeo(0.8, 0.6, 0.06, 1), 0, 0.42, d / 2 - 0.02);
      A(M.wood, boxGeo(w + 0.1, 0.08, d + 0.06, 1), 0, 0.99, 0.02);
      foot(rm, w, d, p.x, p.z, p.ry, 1.2);
      const q = L2W(p.x, p.z, p.ry, 0, d / 2 + 0.2);
      if (prof.id === 'cazador' || prof.style === 'rustico') { const l = B.light(q[0], y + 0.4, q[1], 0xff9a50, 3, 5); l.userData.fire = true; B.extra[B.extra.length - 1].visible = false; }
      return p;
    },
    bed(rm, double = true, color = 0) {
      const w = double ? 1.5 : 0.95, d = 2.05;
      const p = rm.fit(w + 0.1, d, ['n', 'w', 'e', 's'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(w + 0.08, 0.3, d, 1.2), 0, 0.15, 0);
      A(M.sheet, boxGeo(w, 0.22, d - 0.1, 1), 0, 0.41, 0.03);
      A(M.fabric(color), boxGeo(w + 0.04, 0.07, d * 0.62, 1), 0, 0.53, d * 0.18);
      A(M.sheet, boxGeo(w * 0.82, 0.12, 0.34, 1), 0, 0.58, -d / 2 + 0.3);
      A(M.wood, boxGeo(w + 0.1, 1.0, 0.06, 1.2), 0, 0.5, -d / 2 + 0.03);
      foot(rm, w + 0.08, d, p.x, p.z, p.ry, 0.6);
      // nightstands (with a lamp) where they fit
      for (const s of [-1, 1]) {
        const q = L2W(p.x, p.z, p.ry, s * (w / 2 + 0.3), -d / 2 + 0.25);
        const bx = [q[0] - 0.24, q[1] - 0.24, q[0] + 0.24, q[1] + 0.24];
        if (!rm.free(bx)) continue;
        rm.boxes.push(bx);
        const N = at(q[0], q[1], p.ry, y);
        N(M.wood, boxGeo(0.44, 0.55, 0.4, 1), 0, 0.275, 0);
        const lamp = new THREE.Mesh(cylGeo(0.07, 0.13, 0.18), new THREE.MeshStandardMaterial({ color: 0xf0e4c8, emissive: 0xffd9a0, emissiveIntensity: 0.4 }));
        lamp.userData.lamp = true;
        B.extraMesh(lamp, q[0], y + 0.76, q[1], p.ry);
        foot(rm, 0.44, 0.4, q[0], q[1], p.ry, 0.6);
        const lid = s === 1 ? takeLoot('reloj', 'movil') : null;
        if (lid) lootItem(lid, smallMesh(lid === 'reloj' ? boxGeo(0.07, 0.02, 0.07, 1) : boxGeo(0.08, 0.012, 0.15, 1), lid === 'reloj' ? M.gold : M.black), q[0] + 0.08, y + 0.56, q[1], p.ry, { r: 0.9 });
      }
      const head = L2W(p.x, p.z, p.ry, 0, -d / 2 + 0.55), side = L2W(p.x, p.z, p.ry, w / 2 + 0.45, 0);
      pieces.bed.push({ x: cx0 + head[0], z: cz0 + head[1], hx: cx0 + p.x, hz: cz0 + p.z, y, ry: p.ry, rm, double, side: { x: cx0 + side[0], z: cz0 + side[1] } });
      if (double && takeLoot('colchon')) lootItem('colchon', null, side[0], y, side[1], 0, { r: 1.0 });
      return p;
    },
    wardrobe(rm, w = 1.2 + r() * 0.4) {
      const d = 0.6;
      const p = rm.fit(w, d, ['e', 'w', 's', 'n'].sort(() => r() - 0.5), true, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(w, 2.1, d, 1.2), 0, 1.05, 0);
      A(M.black, boxGeo(0.012, 1.9, 0.01, 1), 0, 1.05, d / 2 + 0.002);
      for (const s of [-1, 1]) A(M.metal, boxGeo(0.02, 0.12, 0.03, 1), s * 0.06, 1.05, d / 2 + 0.01);
      foot(rm, w, d, p.x, p.z, p.ry, 2.1);
      const f = L2W(p.x, p.z, p.ry, 0, d / 2 + 0.45);
      B.interact({ type: 'hide', x: f[0], z: f[1], y, r: 0.8, label: 'Esconderse en el armario', hx: p.x, hz: p.z, ry: p.ry });
      return p;
    },
    dresser(rm) {
      const p = rm.fit(1.0, 0.48, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(1.0, 0.85, 0.48, 1), 0, 0.425, 0);
      for (let i = 0; i < 3; i++) A(M.metal, boxGeo(0.12, 0.02, 0.02, 1), 0, 0.2 + i * 0.26, 0.245);
      const mir = new THREE.Mesh(planeGeo(0.6, 0.7, 1), new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.05, metalness: 1 }));
      const q = L2W(p.x, p.z, p.ry, 0, -0.2);
      B.extraMesh(mir, q[0], y + 1.3, q[1], p.ry);
      foot(rm, 1.0, 0.48, p.x, p.z, p.ry, 0.9);
      const f = L2W(p.x, p.z, p.ry, 0, 0.7);
      B.interact({ type: 'drawer', x: f[0], z: f[1], y, r: 0.8, label: 'Registrar los cajones' });
      if (takeLoot('joyero')) { const m = smallMesh(boxGeo(0.22, 0.12, 0.15, 1), M.fabric(1)); const c = L2W(p.x, p.z, p.ry, 0.28, 0.02); lootItem('joyero', m, c[0], y + 0.91, c[1], p.ry); }
      else if (takeLoot('reloj')) { const c = L2W(p.x, p.z, p.ry, 0.3, 0.02); lootItem('reloj', smallMesh(boxGeo(0.07, 0.02, 0.07, 1), M.gold), c[0], y + 0.86, c[1], p.ry); }
      return p;
    },
    desk(rm, pc = true) {
      const p = rm.fit(1.2, 0.62, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(1.2, 0.04, 0.62, 1), 0, 0.75, 0);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(M.wood, boxGeo(0.04, 0.73, 0.04, 1), a * 0.56, 0.365, b * 0.27);
      if (pc) { A(M.screen, boxGeo(0.56, 0.34, 0.03, 1), 0, 1.02, -0.2); A(M.black, boxGeo(0.06, 0.2, 0.06, 1), 0, 0.86, -0.22); A(M.black, boxGeo(0.44, 0.02, 0.14, 1), 0, 0.78, 0.05); }
      // chair in front
      const c = L2W(p.x, p.z, p.ry, 0, 0.55);
      const cb = L2W(p.x, p.z, p.ry, 0, 0.78);
      B.add(M.black, boxGeo(0.46, 0.06, 0.46, 1), c[0], y + 0.47, c[1], p.ry);
      B.add(M.black, boxGeo(0.44, 0.55, 0.05, 1), cb[0], y + 0.8, cb[1], p.ry);
      foot(rm, 1.2, 0.62, p.x, p.z, p.ry, 0.8);
      if (takeLoot('portatil')) { const m = smallMesh(boxGeo(0.34, 0.025, 0.24, 1), M.metal); const q = L2W(p.x, p.z, p.ry, 0.3, 0.05); lootItem('portatil', m, q[0], y + 0.785, q[1], p.ry); }
      pieces.seat.push({ x: cx0 + c[0], z: cz0 + c[1], y, h: p.ry + Math.PI, rm, chair: true });
      return p;
    },
    kitchen(rm) {
      // a run of units with the sink and the hob along the longest free wall, the fridge at one end
      const sides = rm.w >= rm.d ? ['n', 's', 'w', 'e'] : ['w', 'e', 'n', 's'];
      const len = Math.min(3.0, Math.max(rm.w, rm.d) - 1.3);
      const p = rm.fit(len, 0.62, sides, false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.white, boxGeo(len, 0.88, 0.6, 1), 0, 0.44, 0);
      A(B.mat('worktop', () => std(prof.style === 'lujo' ? 0xe8e4dc : 0x3a3a3a, { roughness: 0.3 })), boxGeo(len + 0.04, 0.04, 0.64, 1), 0, 0.9, 0.01);
      A(M.bath, boxGeo(len, 0.7, 0.02, 0.6), 0, 1.28, -0.3);
      A(M.black, boxGeo(0.55, 0.02, 0.5, 1), -len / 2 + 0.45, 0.93, 0);
      A(M.metal, boxGeo(0.5, 0.05, 0.4, 1), len / 2 - 0.5, 0.92, 0);
      A(M.white, boxGeo(len, 0.6, 0.35, 1), 0, 1.85, -0.12);
      foot(rm, len, 0.62, p.x, p.z, p.ry, 0.9);
      const f = L2W(p.x, p.z, p.ry, 0, 0.75);
      pieces.kitchen.push({ x: cx0 + f[0], z: cz0 + f[1], y, ry: p.ry, rm });
      B.interact({ type: 'eat', x: f[0], z: f[1], y, r: 0.9, label: 'Picar algo de la cocina' });
      const fr = rm.fit(0.72, 0.66, [p.side, ...sides], true, r);
      if (fr) { const Fz = at(fr.x, fr.z, fr.ry, y); Fz(M.white, boxGeo(0.7, 1.8, 0.64, 1), 0, 0.9, 0); Fz(M.metal, boxGeo(0.03, 0.4, 0.03, 1), -0.28, 1.1, 0.33); foot(rm, 0.7, 0.64, fr.x, fr.z, fr.ry, 1.8); const q = L2W(fr.x, fr.z, fr.ry, 0, 0.7); B.interact({ type: 'fridge', x: q[0], z: q[1], y, r: 0.8, label: 'Abrir la nevera' }); }
      const j = takeLoot('jamon', 'lata', 'garrafa');
      if (j) {
        const q = L2W(p.x, p.z, p.ry, 0, 0.05);
        const mesh = j === 'jamon' ? smallMesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8).rotateZ(1.3), M.leather) : j === 'lata' ? smallMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 14), M.metal) : smallMesh(new THREE.CylinderGeometry(0.12, 0.13, 0.36, 12), M.glass);
        lootItem(j, mesh, q[0], y + 0.99 + (j === 'garrafa' ? 0.14 : 0), q[1], p.ry);
      }
      return p;
    },
    bathroom(rm) {
      const y = rm.lv ? F2 : 0;
      let tw = 1.6, td = 0.75, t = rm.fit(tw, td, ['n', 's', 'w', 'e'].sort(() => r() - 0.5), false, r);
      if (!t) { tw = 0.9; td = 0.9; t = rm.fit(tw, td, ['n', 's', 'w', 'e'], false, r); }
      if (t) { const A = at(t.x, t.z, t.ry, y); A(M.white, boxGeo(tw, tw > 1 ? 0.55 : 0.12, td, 1), 0, tw > 1 ? 0.275 : 0.06, 0); foot(rm, tw, td, t.x, t.z, t.ry, 0.6); }
      const wc = rm.fit(0.45, 0.62, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r);
      if (wc) { const A = at(wc.x, wc.z, wc.ry, y); A(M.white, boxGeo(0.4, 0.42, 0.5, 1), 0, 0.21, 0.04); A(M.white, boxGeo(0.4, 0.38, 0.16, 1), 0, 0.6, -0.22); foot(rm, 0.4, 0.55, wc.x, wc.z, wc.ry, 0.5); }
      const sk = rm.fit(0.55, 0.45, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r);
      if (sk) {
        const A = at(sk.x, sk.z, sk.ry, y); A(M.white, boxGeo(0.55, 0.85, 0.42, 1), 0, 0.425, 0);
        const mir = new THREE.Mesh(planeGeo(0.5, 0.65, 1), new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.05, metalness: 1 }));
        const q = L2W(sk.x, sk.z, sk.ry, 0, -0.19); B.extraMesh(mir, q[0], y + 1.5, q[1], sk.ry);
        foot(rm, 0.55, 0.42, sk.x, sk.z, sk.ry, 0.9);
        const f = L2W(sk.x, sk.z, sk.ry, 0, 0.6); B.interact({ type: 'mirror', x: f[0], z: f[1], y, r: 0.6, label: 'Mirarse al espejo' });
      }
      // tiles on the walls
      for (const [x, z, w, ry] of [[rm.cx, rm.z0 + WALLF + 0.005, rm.w, 0], [rm.cx, rm.z1 - WALLF - 0.005, rm.w, Math.PI], [rm.x0 + WALLF + 0.005, rm.cz, rm.d, Math.PI / 2], [rm.x1 - WALLF - 0.005, rm.cz, rm.d, -Math.PI / 2]]) B.add(M.bath, planeGeo(w - 0.16, 1.5, 0.6), x, y + 0.75, z, ry);
    },
    washer(rm) {
      const p = rm.fit(0.62, 0.62, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.white, boxGeo(0.6, 0.85, 0.6, 1), 0, 0.425, 0); A(M.glass, new THREE.CylinderGeometry(0.18, 0.18, 0.02, 18).rotateX(Math.PI / 2), 0, 0.45, 0.305);
      foot(rm, 0.6, 0.6, p.x, p.z, p.ry, 0.9);
      return p;
    },
    pantry(rm) {
      for (let k = 0; k < 2; k++) {
        const p = rm.fit(1.2, 0.4, ['n', 'w', 'e', 's'].sort(() => r() - 0.5), true, r); if (!p) break;
        const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
        for (const hy of [0.02, 0.55, 1.1, 1.65]) A(M.wood2, boxGeo(1.2, 0.03, 0.4, 1), 0, hy, 0);
        for (const sx of [-1, 1]) A(M.wood2, boxGeo(0.03, 1.7, 0.4, 1), sx * 0.6, 0.85, 0);
        for (let i = 0; i < 9; i++) A(B.mat('jar', () => std(0xc8a060, { roughness: 0.4, transparent: true, opacity: 0.85 })), cylGeo(0.06, 0.06, 0.18, 8), -0.45 + (i % 5) * 0.22, 0.14 + Math.floor(i / 5) * 0.55, 0);
        foot(rm, 1.2, 0.4, p.x, p.z, p.ry, 1.7);
      }
      const j = takeLoot('jamon', 'lata', 'garrafa');
      if (j) { const p = rm.standSpot(); lootItem(j, smallMesh(j === 'jamon' ? new THREE.CapsuleGeometry(0.09, 0.42, 4, 8).rotateZ(1.3) : new THREE.CylinderGeometry(0.12, 0.13, 0.36, 12), B.mats.get(j === 'jamon' ? M.leather : M.glass)), p.x, (rm.lv ? F2 : 0) + 0.2, p.z); }
    },
    antlers(rm, n = 3) {
      for (let i = 0; i < n; i++) onWall(rm, 0.7, (x, y, z, ry) => {
        const g = new THREE.Group();
        const mat = B.mats.get(B.mat('bone', () => std(0xd8c8a8, { roughness: 0.7 })));
        for (const geo of antlerGeo()) g.add(new THREE.Mesh(geo, mat));
        const plaque = new THREE.Mesh(boxGeo(0.28, 0.34, 0.04, 1), B.mats.get(M.wood)); plaque.position.y = -0.06; g.add(plaque);
        B.extraMesh(g, x, y + 1.9, z, ry);
      }, ['n', 's', 'w', 'e']);
    },
    gunRack(rm) {
      const p = rm.fit(0.7, 0.35, ['n', 'w', 'e', 's'].sort(() => r() - 0.5), true, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(0.7, 1.7, 0.35, 1), 0, 0.85, 0); A(M.glass, boxGeo(0.64, 1.5, 0.02, 1), 0, 0.9, 0.18);
      foot(rm, 0.7, 0.35, p.x, p.z, p.ry, 1.7);
      if (takeLoot('rifle')) {
        const g = new THREE.Group();
        const stock = new THREE.Mesh(boxGeo(0.05, 0.3, 0.08, 1), B.mats.get(M.leather)); stock.position.y = 0.45; g.add(stock);
        const barrel = new THREE.Mesh(cylGeo(0.012, 0.012, 0.9, 8), B.mats.get(M.iron)); barrel.position.y = 1.05; g.add(barrel);
        const q = L2W(p.x, p.z, p.ry, 0, 0.05);
        const f = L2W(p.x, p.z, p.ry, 0, 0.75);
        B.extraMesh(g, q[0], y, q[1], p.ry);
        const it = lootItem('rifle', null, f[0], y, f[1], 0, { mesh: g });
        if (it) it.label = 'Coger el rifle de caza';
      }
      return p;
    },
    piano(rm) {
      const p = rm.fit(1.5, 0.6, ['n', 'w', 'e', 's'].sort(() => r() - 0.5), true, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.black, boxGeo(1.5, 1.25, 0.6, 1), 0, 0.625, -0.02); A(M.white, boxGeo(1.36, 0.03, 0.18, 1), 0, 0.75, 0.3); A(M.black, boxGeo(1.4, 0.05, 0.2, 1), 0, 0.72, 0.3);
      foot(rm, 1.5, 0.7, p.x, p.z, p.ry, 1.3);
      const f = L2W(p.x, p.z, p.ry, 0, 0.9);
      B.interact({ type: 'piano', x: f[0], z: f[1], y, r: 0.8, label: 'Tocar el piano' });
      return p;
    },
    guitar(rm) {
      const p = rm.fit(0.5, 0.4, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 18).rotateX(Math.PI / 2), B.mats.get(B.mat('guitar', () => std(0xb86a2a, { roughness: 0.35 })))); body.position.y = 0.3; g.add(body);
      const neck = new THREE.Mesh(boxGeo(0.05, 0.55, 0.03, 1), B.mats.get(M.wood)); neck.position.y = 0.72; g.add(neck);
      g.rotation.x = -0.25;
      B.extraMesh(g, p.x, y, p.z, p.ry);
      if (takeLoot('guitarra')) lootItem('guitarra', null, p.x, y, p.z, 0, { mesh: g });
      else B.interact({ type: 'guitar', x: p.x, z: p.z, y, r: 0.9, label: 'Tocar la guitarra' });
      return p;
    },
    speaker(rm) {
      const p = rm.fit(0.4, 0.35, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0;
      const m = smallMesh(boxGeo(0.36, 0.6, 0.32, 1), M.black);
      if (takeLoot('altavoz')) lootItem('altavoz', m, p.x, y + 0.3, p.z, p.ry); else B.extraMesh(m, p.x, y + 0.3, p.z, p.ry);
      return p;
    },
    easel(rm) {
      const p = rm.fitCenter(0.8, 0.7, r); if (!p) return null;
      const y = rm.lv ? F2 : 0;
      for (const [a, b] of [[-0.25, 0.1], [0.25, 0.1], [0, -0.25]]) B.add(M.wood2, boxGeo(0.03, 1.7, 0.03, 1), p.x + a, y + 0.85, p.z + b);
      const canvasM = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), new THREE.MeshStandardMaterial({ map: paintingTex(r), roughness: 0.8 }));
      B.extraMesh(canvasM, p.x, y + 1.25, p.z + 0.14, 0);
      foot(rm, 0.7, 0.5, p.x, p.z, 0, 1.5);
      return p;
    },
    toys(rm) {
      const y = rm.lv ? F2 : 0;
      for (let i = 0; i < 6; i++) {
        const x = rm.x0 + 0.5 + r() * (rm.w - 1), z = rm.z0 + 0.5 + r() * (rm.d - 1);
        if (!rm.free([x - 0.1, z - 0.1, x + 0.1, z + 0.1])) continue;
        B.add(B.mat('toy' + (i % 4), () => std([0xd8263a, 0x3a8ab8, 0xf2d230, 0x5aa84a][i % 4], { roughness: 0.5 })), i % 2 ? boxGeo(0.12, 0.12, 0.12, 1) : new THREE.SphereGeometry(0.08, 10, 8), x, y + 0.07, z, r() * 3);
      }
      if (takeLoot('hucha')) { const p = rm.fit(0.3, 0.3, ['s', 'n', 'w', 'e'], false, r); if (p) lootItem('hucha', smallMesh(new THREE.SphereGeometry(0.1, 12, 10), B.mats.get(B.mat('pig', () => std(0xf4a6c0, { roughness: 0.4 })))), p.x, y + 0.1, p.z); }
    },
    safe(rm) {
      const p = rm.fit(0.55, 0.5, ['n', 'w', 'e', 's'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(B.mat('safe', () => std(0x3a4046, { roughness: 0.4, metalness: 0.7 })), boxGeo(0.55, 0.65, 0.5, 1), 0, 0.325, 0);
      A(M.gold, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14).rotateX(Math.PI / 2), 0.1, 0.4, 0.26);
      foot(rm, 0.55, 0.5, p.x, p.z, p.ry, 0.7);
      const f = L2W(p.x, p.z, p.ry, 0, 0.65);
      if (takeLoot('cajaFuerte')) { const it = lootItem('cajaFuerte', null, f[0], y, f[1], 0, { r: 0.8 }); if (it) it.label = 'Forzar la caja fuerte'; }
      return p;
    },
    barrels(rm) {
      for (let i = 0; i < 2; i++) {
        const p = rm.fit(0.62, 0.62, ['n', 'w', 'e', 's'].sort(() => r() - 0.5), false, r); if (!p) break;
        const y = rm.lv ? F2 : 0;
        B.add(M.wood2, new THREE.CylinderGeometry(0.28, 0.28, 0.8, 16).rotateZ(Math.PI / 2), p.x, y + 0.3, p.z, p.ry + Math.PI / 2);
        foot(rm, 0.6, 0.6, p.x, p.z, p.ry, 0.6);
      }
    },
    workbench(rm) {
      const p = rm.fit(1.6, 0.7, ['n', 's', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood2, boxGeo(1.6, 0.08, 0.7, 1), 0, 0.88, 0); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(M.wood2, boxGeo(0.07, 0.86, 0.07, 1), a * 0.74, 0.43, b * 0.3);
      A(M.metal, boxGeo(0.3, 0.1, 0.12, 1), -0.4, 0.97, 0); A(M.iron, boxGeo(0.5, 0.02, 0.02, 1), 0.3, 0.93, 0.1);
      foot(rm, 1.6, 0.7, p.x, p.z, p.ry, 0.9);
      return p;
    },
    boxes(rm, n = 3) {
      for (let i = 0; i < n; i++) {
        const s = 0.4 + r() * 0.25;
        const p = rm.fit(s, s, ['n', 's', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) break;
        B.add(B.mat('box', () => std(0xa8845a, { roughness: 1 })), boxGeo(s, s * 0.8, s, 1), p.x, (rm.lv ? F2 : 0) + s * 0.4, p.z, r() * 0.4);
        foot(rm, s, s, p.x, p.z, 0, s);
      }
    },
    sewing(rm) {
      const p = rm.fit(0.9, 0.5, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), false, r); if (!p) return null;
      const y = rm.lv ? F2 : 0, A = at(p.x, p.z, p.ry, y);
      A(M.wood, boxGeo(0.9, 0.04, 0.5, 1), 0, 0.76, 0); A(M.iron, boxGeo(0.8, 0.7, 0.03, 1), 0, 0.37, -0.2);
      A(M.black, boxGeo(0.34, 0.24, 0.16, 1), 0, 0.9, 0);
      foot(rm, 0.9, 0.5, p.x, p.z, p.ry, 0.8);
      return p;
    },
  };

  // ---- each room, by what it is and who lives here
  const old = prof.id === 'abuela' || prof.id === 'matrimonio';
  for (const rm of rooms) {
    const y = rm.lv ? F2 : 0;
    if (rm.type === 'pasillo' || rm.type === 'hall') {
      // phone table or shoe cabinet, pictures, a plant, the lights
      const along = rm.doorsAlong || [];
      if (rm.type === 'pasillo') { const p = rm.fit(0.35, 0.34, ['w', 'e'], false, r); if (p) { B.add(M.wood, boxGeo(0.35, 0.8, 0.34, 1), p.x, y + 0.4, p.z, p.ry); foot(rm, 0.35, 0.34, p.x, p.z, p.ry, 0.8); B.interact({ type: 'phone', x: p.x + Math.sin(p.ry) * 0.5, z: p.z + Math.cos(p.ry) * 0.5, y, r: 0.7, label: 'Coger el teléfono' }); } }
      decorate(rm, 2);
      const n = Math.max(1, Math.round(rm.d / 5));
      for (let i = 0; i < n; i++) B.light(rm.cx, y + (rm.lv ? H2 : WALL_H) - 0.33, rm.z0 + ((i + 0.5) / n) * rm.d, S.lamp, 4.5, 6);
      if (rm.type === 'hall' && r() < 0.7) plant(rm, false);
      rm.along = along;
      continue;
    }
    switch (rm.type) {
      case 'salon':
        if (old) { F.camilla(rm); F.tv(rm); F.armchair(rm); F.vitrina(rm); if (r() < 0.6) F.shelf(rm); }
        else { F.tv(rm); F.sofa(rm, ['s', 'n', 'w', 'e'].sort(() => r() - 0.5), Math.floor(r() * 3)); F.coffeeTable(rm); if (prof.id === 'cazador' || S.beams) F.chimney(rm); F.armchair(rm); F.shelf(rm); if (prof.id === 'musico') F.piano(rm); }
        if (prof.id === 'cazador') F.antlers(rm, 3);
        rug(rm); plant(rm, true); decorate(rm, 3);
        break;
      case 'comedor': F.diningTable(rm, 6); F.vitrina(rm); decorate(rm, 3); plant(rm); break;
      case 'cocina': F.kitchen(rm); F.diningTable(rm, rm.w * rm.d > 9 ? 4 : 2); if (r() < 0.5) F.washer(rm); decorate(rm, 1); break;
      case 'bano': F.bathroom(rm); break;
      case 'dorm': case 'dorm2': F.bed(rm, rm.type === 'dorm' || r() < 0.5, Math.floor(r() * 4)); F.wardrobe(rm); if (rm.type === 'dorm') F.dresser(rm); if (rm.w * rm.d > 16) { F.armchair(rm); rug(rm); } if (rm.w * rm.d > 22) F.desk(rm, false); decorate(rm, 2); if (r() < 0.5) plant(rm, false); break;
      case 'ninos': F.bed(rm, false, 1); if (r() < 0.6) F.bed(rm, false, 2); F.wardrobe(rm, 1.0); F.desk(rm, false); F.toys(rm); decorate(rm, 2); break;
      case 'dormJoven': F.bed(rm, r() < 0.3, 0); F.wardrobe(rm, 1.0); F.desk(rm, true); F.guitar(rm); F.speaker(rm); decorate(rm, 3); break;
      case 'estudio': F.desk(rm, true); F.shelf(rm); F.shelf(rm); F.armchair(rm); decorate(rm, 2); break;
      case 'despacho': F.desk(rm, true); F.shelf(rm); F.safe(rm); F.armchair(rm); decorate(rm, 2); rug(rm); break;
      case 'musica': F.piano(rm); F.guitar(rm); F.guitar(rm); F.speaker(rm); F.speaker(rm); F.sofa(rm, ['n', 's', 'w', 'e'], 1); decorate(rm, 3); break;
      case 'trofeos': F.gunRack(rm); F.antlers(rm, 4); F.armchair(rm); F.shelf(rm, false); rug(rm); break;
      case 'taller': if (prof.id === 'artista') { F.easel(rm); F.easel(rm); F.desk(rm, false); decorate(rm, 4); } else { F.workbench(rm); F.boxes(rm, 3); F.barrels(rm); } break;
      case 'costura': F.sewing(rm); F.armchair(rm); F.wardrobe(rm, 1.0); decorate(rm, 2); plant(rm); break;
      case 'despensa': F.pantry(rm); if (prof.id === 'agricultor' || prof.id === 'cazador') F.barrels(rm); break;
      case 'trastero': F.boxes(rm, 5); F.shelf(rm, false); break;
      default: F.boxes(rm, 2);
    }
    // the leftover loot finds a place in the main rooms
    const area = rm.w * rm.d;
    lampAt(rm.cx, rm.cz, y + (rm.lv ? H2 : WALL_H), area);
    if (S.beams && !rm.lv) for (let k = 0.6; k < rm.d; k += 1.1) B.add(M.wood, boxGeo(rm.w, 0.14, 0.12, 1), rm.cx, WALL_H - 0.07, rm.z0 + k);
  }
  // a wallet or a phone left on a table, whatever is still in the pool
  for (const id of lootPool.splice(0)) {
    const tb = pieces.table[Math.floor(r() * pieces.table.length)] || null;
    const rm = tb ? tb.rm : rooms.find((q) => q.type === 'salon');
    if (!rm) continue;
    if (LOOT[id].weapon) continue;
    const x = tb ? tb.x + (r() - 0.5) * 0.4 : rm.standSpot().x, z = tb ? tb.z + (r() - 0.5) * 0.3 : rm.standSpot().z;
    const yy = tb ? tb.y : rm.lv ? F2 : 0;
    const mesh = smallMesh(id === 'cartera' ? boxGeo(0.11, 0.025, 0.09, 1) : id === 'movil' ? boxGeo(0.08, 0.012, 0.15, 1) : boxGeo(0.14, 0.08, 0.1, 1), B.mats.get(id === 'cartera' ? M.leather : M.black));
    lootItem(id, mesh, x, yy + 0.02, z, r() * 3);
  }

  // ---- the patio: plants, a washing line, a well or a bench, the lemon tree
  {
    const pr = new Room('patio', 'patio', -hw, D1, hw, D);
    pr.door('s', backDoor[0], backDoor[1]);
    for (let i = 0; i < 5; i++) plant(pr, r() < 0.5);
    if (r() < 0.6) {
      const wx = (r() - 0.5) * (W - 3), wz = D1 + P / 2;
      B.add(M.stone, new THREE.CylinderGeometry(0.64, 0.66, 0.8, 18, 1, true), wx, 0.4, wz);
      B.add(M.stone, new THREE.RingGeometry(0.5, 0.64, 18).rotateX(-Math.PI / 2), wx, 0.8, wz);
      B.add(M.black, new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2), wx, 0.35, wz);
      segs0.push(...ringSegs(B.ox + wx, B.oz + wz, 0.7, 1));
      B.interact({ type: 'well', x: wx, z: wz - 1.0, r: 0.9, label: 'Asomarse al pozo' });
    } else if (r() < 0.7) {
      B.add(M.wood2, cylGeo(0.08, 0.1, 1.6, 8), hw - 1.2, 0.8, D - 1.2);
      B.add(B.mat('leaves', () => std(0x2f6a2a, { roughness: 0.9 })), new THREE.SphereGeometry(0.9, 12, 10), hw - 1.2, 2.1, D - 1.2);
      for (let i = 0; i < 8; i++) B.add(B.mat('lemon', () => std(0xf2d230, { roughness: 0.6 })), new THREE.SphereGeometry(0.06, 6, 5), hw - 1.2 + (r() - 0.5) * 1.3, 1.8 + r() * 0.8, D - 1.2 + (r() - 0.5) * 1.3);
      segs0.push(...ringSegs(B.ox + hw - 1.2, B.oz + D - 1.2, 0.25, 1.6));
    }
    B.add(M.metal, boxGeo(0.02, 0.02, P - 0.8, 1), -hw + 1.0, 2.1, D1 + P / 2);
    for (let i = 0; i < 3; i++) B.add(B.mat('cloth' + i, () => std([0xf4f4f0, 0x88a9c9, 0xe87aa4][i], { roughness: 1, side: THREE.DoubleSide })), planeGeo(0.5, 0.6, 1), -hw + 1.0, 1.8, D1 + 0.8 + i * 0.9, Math.PI / 2);
    B.light(0, 2.7, D1 + 0.3, 0xffe8c0, 4, 6);
  }

  // ---------------------------------------------------------------- finish (one collider per storey)
  B.segs = segs0;
  const out = B.finish();
  const ox = origin.x, oz = origin.z;
  if (twoStorey) {
    for (const s of segs1) s[4] += F2; // upstairs segments stand on the upper floor
    const xs = segs1.flatMap((s) => [s[0], s[2]]), zs = segs1.flatMap((s) => [s[1], s[3]]);
    const col1 = new StaticCollider(Math.min(...xs) - 10, Math.min(...zs) - 10, Math.max(...xs) + 10, Math.max(...zs) + 10, 2);
    for (const s of segs1) col1.addSegment(s[0], s[1], s[2], s[3], s[4]);
    col1.build();
    out.levels = [out.collider, col1];
    out.level = 0;
    out.split = F2 * 0.5;
    out.floorY = (x, z, y) => {
      const lx = x - ox, lz = z - oz;
      if (lx > SX0 - 0.02 && lx < hw && lz > SZ0 && lz < SZ1) return ((lz - SZ0) / (SZ1 - SZ0)) * F2;
      return y > F2 * 0.5 ? F2 : 0;
    };
    out.ceilY = (x, z, y) => (y > F2 * 0.5 ? F2 + H2 : WALL_H);
  }
  // navigation: a node in every room, at every door (both sides) and along the corridors; people walk node to node
  const nodes = [], edges = [];
  const node = (x, z, y, room) => { nodes.push({ x: ox + x, z: oz + z, y, room }); edges.push([]); return nodes.length - 1; };
  const link = (a, b) => { if (a == null || b == null || a === b) return; edges[a].push(b); edges[b].push(a); };
  const roomNode = new Map();
  for (const rm of rooms) { const sp = rm.standSpot(); roomNode.set(rm, node(sp.x, sp.z, rm.lv ? F2 : 0, rm.id)); }
  const hallFor = (rm) => rooms.find((q) => (q.type === 'pasillo' || q.type === 'hall') && q.lv === rm.lv && (q.doorsAlong || []).includes(rm.doorAt));
  for (const rm of rooms) {
    if (!rm.doorAt) continue;
    const d = rm.doorAt, yl = rm.lv ? F2 : 0;
    const inN = node(d.x - d.nx * 0.55, d.z - d.nz * 0.55, yl, rm.id), outN = node(d.x + d.nx * 0.55, d.z + d.nz * 0.55, yl, 'door');
    link(roomNode.get(rm), inN); link(inN, outN);
    const h = hallFor(rm);
    if (h) link(outN, roomNode.get(h));
    rm.navIn = inN; rm.navOut = outN;
  }
  // corridor door nodes chain along the corridor (straight line, always free)
  for (const h of rooms.filter((q) => q.type === 'pasillo' || q.type === 'hall')) {
    const outs = rooms.filter((q) => q.navOut != null && hallFor(q) === h).map((q) => q.navOut).sort((a, b) => nodes[a].z - nodes[b].z);
    for (let i = 1; i < outs.length; i++) link(outs[i - 1], outs[i]);
  }
  // the entrance
  const entN = node(doorX, 1.2, 0, 'entrada');
  const front = rooms.find((q) => q.lv === 0 && q.z0 < 0.1 && doorX > q.x0 && doorX < q.x1);
  if (front) link(entN, roomNode.get(front));
  // two storeys: salon ↔ hall door, and the stairs (foot ↔ top)
  if (twoStorey) {
    const salon = rooms.find((q) => q.id === 'salon'), hall = rooms.find((q) => q.id === 'hall'), land = rooms.find((q) => q.id === 'rellano');
    const dz = rooms.find((q) => q.id === 'salon').open.find((o) => o.side === 'n');
    const a1 = node((dz.a + dz.b) / 2, salon.z1 - 0.55, 0, 'salon'), a2 = node((dz.a + dz.b) / 2, salon.z1 + 0.55, 0, 'hall');
    link(roomNode.get(salon), a1); link(a1, a2); link(a2, roomNode.get(hall));
    const foot0 = node((SX0 + SX1) / 2, SZ0 - 0.6, 0, 'hall'), top1 = node((SX0 + SX1) / 2, SZ1 + 0.5, F2, 'rellano');
    link(roomNode.get(hall), foot0); link(foot0, top1); link(top1, roomNode.get(land));
    for (const rm of rooms) if (rm.lv === 1 && rm.navOut != null) link(rm.navOut, roomNode.get(land));
    for (const rm of rooms) if (rm.lv === 0 && rm.navOut != null && rm !== salon && rm !== hall) link(rm.navOut, a2);
    out.stairs = { x0: ox + SX0, x1: ox + hw, z0: oz + SZ0, z1: oz + SZ1 };
  }
  out.nav = { nodes, edges, roomNode: Object.fromEntries([...roomNode].map(([rm, i]) => [rm.id, i])), entrance: entN };
  out.rooms = rooms.map((q) => ({ id: q.id, type: q.type, lv: q.lv, x0: ox + q.x0, z0: oz + q.z0, x1: ox + q.x1, z1: oz + q.z1 }));
  out.pieces = pieces;
  out.loot = loot;
  out.profile = prof;
  out.winMat = winMat;
  out.spots.entrada = { x: ox + doorX, z: oz + 1.2 };
  out.spots.floor = Object.fromEntries(rooms.map((q) => [q.id, { x: nodes[roomNode.get(q)].x, z: nodes[roomNode.get(q)].z }]));
  out.origin = { x: ox, z: oz };
  out.kind = 'vecino';
  out.bounds = { x0: ox - hw, x1: ox + hw, z0: oz, z1: oz + D };
  // lamps that only make sense lit at night (the fire, the telly) are switched by the house life
  return out;
}

// shortest path over the navigation graph (a few dozen nodes: plain Dijkstra)
export function navPath(nav, from, to) {
  const n = nav.nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const v of nav.edges[u]) {
      const a = nav.nodes[u], b = nav.nodes[v];
      const w = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 2;
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  if (!isFinite(dist[to])) return null;
  const path = [];
  for (let v = to; v >= 0; v = prev[v]) path.unshift(v);
  return path;
}
export function nearestNode(nav, x, z, y = 0) {
  let best = 0, bd = Infinity;
  nav.nodes.forEach((q, i) => { const d = Math.hypot(q.x - x, q.z - z) + Math.abs(q.y - y) * 3; if (d < bd) { bd = d; best = i; } });
  return best;
}

// ---------------------------------------------------------------- the people inside
// Who is at home depends on the hour (asleep at night, on the sofa or in the kitchen by day, sometimes out). Awake
// they see what is in front of them; asleep they only hear. Caught stealing, they scream and phone the Guardia Civil
// (you can stop them); a visitor let in at the door is welcome until they see you pocket something.
const SAY_RES = {
  greetF: ['¡Hola, {hijo|hija}! Pasa, pasa.', '¡Anda! ¿Qué te trae por aquí?', 'Pasa, que no muerdo. ¿Quieres un vasino de agua?'],
  greetM: ['¡Hombre! Pasa, pasa.', '¿Qué hay? Entra, entra.', 'Buenas. Tú dirás.'],
  thief: ['¡Un ladrón! ¡Socorro!', '¡Ay, Dios mío! ¿Quién es usted?', '¡Fuera de mi casa!', '¡Al ladrón!'],
  caught: ['¡Oye! ¡Eso es mío! ¡Suelta eso!', '¿Qué haces? ¡Deja eso ahora mismo!', '¡Qué vergüenza! ¡Voy a llamar a la Guardia Civil!'],
  heard: ['¿Quién anda ahí?', '¿Hay alguien?', '¿Eres tú, Manolo?', '¿Qué ha sido eso?'],
  calm: ['Serán los gatos…', 'Nada, cosas mías.', 'Qué susto, madre.'],
  phone: ['¿Guardia Civil? ¡Hay un ladrón en mi casa!', '¡Vengan, que se me ha metido alguien en casa!'],
  hide: ['¡Ya viene la Guardia Civil, sinvergüenza!', '¡No te acerques!'],
  wake: ['Mmm… ¿qué hora es?', '¿Quién está ahí?'],
  talkF: ['Mi nieto está en Badajoz, estudiando. Viene los fines de semana.', 'Antes en esta calle nos conocíamos todos.', 'La torre de Santa María la hicieron con piedra de aquí, ¿sabes?', 'En la feria de agosto no queda un sitio libre en la plaza.', 'Si ves a la Juani, dile que me debe una fuente.'],
  talkM: ['Este año la vendimia viene buena.', 'El pantano está a rebosar, da gusto verlo.', 'Yo he trabajado toda la vida en la cooperativa.', 'Ni se te ocurra meterte con los de la Guardia Civil.', 'Por la calle Malfeitos pasa de todo, ya te digo.'],
  cop: ['¡Guardia Civil! ¡Salga con las manos en alto!', '¡Registrad las habitaciones!', 'Aquí no está… siguiente.', '¡Sé que estás aquí!'],
  copSee: ['¡Ahí está! ¡Alto!', '¡Quieto! ¡Las manos donde las vea!'],
};
const pickR = (a) => a[Math.floor(Math.random() * a.length)];
const inHours = (h, a, b) => (a < b ? h >= a && h < b : h >= a || h < b);

export class HouseLife {
  // mode: 'visit' (let in at the door) | 'sneak' (you got in on your own) | 'owner'
  constructor(game, house, door, mode = 'sneak') {
    this.g = game; this.h = house; this.door = door; this.mode = mode;
    this.people = [];
    this.t = 0; this.alarmed = false; this.noiseT = 0;
    this.tvOn = false;
    const prof = house.profile;
    if (!prof) return;
    const hour = game.sky.hour;
    const asleep = inHours(hour, prof.sleep[0], prof.sleep[1]);
    const home = mode === 'visit' || hash1(prof.seed * 31 + Math.floor(game.time / 900)) < (asleep ? 0.95 : prof.home);
    if (!home) return;
    const rnd = mulberry32((prof.seed * 7 + 3) >>> 0);
    const n = (prof.adults || 1) + (asleep ? 0 : prof.kids || 0);
    const beds = house.pieces.bed.slice();
    const seats = house.pieces.seat.filter((s) => !s.chair);
    const chairs = house.pieces.seat.filter((s) => s.chair);
    const kit = house.pieces.kitchen[0];
    for (let i = 0; i < n; i++) {
      const kid = i >= (prof.adults || 1);
      const desc = this.desc(rnd, prof, i, kid);
      const char = game.chars.create(desc);
      game.scene.add(char.object);
      char.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const single = (prof.adults || 1) === 1 && !prof.kids;
      const first = (desc.gender === 'f' ? NAMES_F : NAMES_M)[Math.floor(rnd() * 14)];
      const p = { kind: 'res', char, name: single ? prof.name : first, x: 0, z: 0, y: 0, heading: 0, state: 'idle', hp: 100, look: 0, seeT: 0, i, kid, female: desc.gender === 'f', talks: 0 };
      if (asleep && beds.length) {
        const b = beds.shift();
        this.lieOnBed(p, b);
      } else {
        const r0 = rnd();
        const spot = r0 < 0.5 && seats.length ? { ...seats.shift(), sit: true } : r0 < 0.75 && kit ? { ...kit, h: kit.ry + Math.PI } : chairs.length ? { ...chairs.shift(), sit: true } : null;
        if (spot) this.place(p, spot);
        else { const k = house.nav.nodes[house.nav.roomNode.salon ?? 0]; p.x = k.x; p.z = k.z; p.y = k.y; p.state = 'idle'; }
        if (spot && spot.sit && seats.length + 1 && house.pieces.tv.length) this.setTv(true);
      }
      p.home = { x: p.x, z: p.z, y: p.y, heading: p.heading, sit: p.state === 'sit', bed: p.bed };
      this.people.push(p);
    }
    // the one who opened the door waits in the hall
    if (mode === 'visit' && this.people.length) {
      const p = this.people[0];
      const e = house.nav.nodes[house.nav.entrance];
      p.char.setBase(null); p.state = 'host'; p.x = e.x; p.z = e.z + 1.7; p.y = 0; p.heading = Math.PI;
      setTimeout(() => this.say(p, pickR(p.female ? SAY_RES.greetF : SAY_RES.greetM)), 500);
    }
  }
  desc(rnd, prof, i, kid) {
    let d = null;
    for (let k = 0; k < 30; k++) {
      d = randomDescFrom(rnd);
      const g = prof.gender || (prof.adults === 2 ? (i === 0 ? 'f' : 'm') : null);
      if (kid) { if (!d.elderly) break; continue; }
      if (g && d.gender !== g) continue;
      if (prof.elderly && !d.elderly) continue;
      if ((prof.young || prof.id === 'familia') && d.elderly) continue;
      break;
    }
    if (kid) { d.height = 0.72; d.build = 0.9; d.elderly = false; }
    if (d.elderly && d.gender === 'm' && rnd() < 0.5) { d.accessory = 'boina'; d.accessoryColor = '#2a2a2a'; }
    return d;
  }
  lieOnBed(p, b) {
    const fx = Math.sin(b.ry), fz = Math.cos(b.ry);
    p.bed = b; p.state = 'sleep';
    p.x = b.hx + fx * 0.85; p.z = b.hz + fz * 0.85; p.y = b.y + 0.64; p.heading = b.ry;
    p.char.setBase('lie');
    p.snoreT = 2 + Math.random() * 4;
  }
  place(p, s) {
    p.x = s.x; p.z = s.z; p.y = s.y; p.heading = s.h ?? s.ry ?? 0;
    if (s.sit) { p.state = 'sit'; p.char.setBase('sit'); } else { p.state = 'idle'; p.char.setBase(null); }
  }
  setTv(on) {
    this.tvOn = on;
    for (const t of this.h.pieces.tv) t.mesh.material.emissiveIntensity = on ? 0.85 : 0;
  }
  say(p, text) { this.g.peds.say(p, text, true); }
  dispose() {
    for (const p of this.people) { this.g.scene.remove(p.char.object); p.char.dispose(); this.g.peds.unmark(p); }
    this.people = [];
  }

  // ---- perception
  sees(p, range = 9) {
    const g = this.g, pl = g.player;
    if (pl.hidden || p.state === 'sleep' || p.state === 'ko' || p.state === 'dead' || p.state === 'getup') return false;
    if (Math.abs(pl.pos.y - p.y) > 1.6) return false;
    const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z, d = Math.hypot(dx, dz);
    const R = range * (pl.crouch ? 0.55 : 1);
    if (d > R) return false;
    if (d > 1.2 && Math.abs(wrapA(Math.atan2(dx, dz) - p.heading - (p.look || 0))) > 1.15) return false;
    return this.colOf(p).raycast(p.x, p.z, pl.pos.x, pl.pos.z, p.y + 1.5, pl.pos.y + (pl.crouch ? 0.7 : 1.2)) > 0.98;
  }
  hears(p) {
    const pl = this.g.player;
    if (Math.abs(pl.pos.y - p.y) > 2.2 && p.state !== 'sleep') return false;
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) + Math.abs(pl.pos.y - p.y) * 1.5;
    return d < (pl.noise || 0) * (p.state === 'sleep' ? 0.55 : 1) + this.noiseT;
  }
  // somebody did something loud (a gunshot, a safe being forced): everyone within r hears it
  noise(x, z, r) {
    for (const p of this.people) {
      if (p.kind !== 'res' || p.state === 'dead' || p.state === 'ko') continue;
      if (Math.hypot(p.x - x, p.z - z) < r) this.alert(p, { x, z });
    }
  }

  // ---- reactions
  alert(p, at) {
    if (p.state === 'sleep') { this.wake(p); }
    if (['alarm', 'flee', 'call', 'cower', 'ko', 'dead', 'fight', 'getup'].includes(p.state)) return;
    if (p.state === 'host' && this.mode === 'visit') return;
    p.state = 'search'; p.char.setBase(null);
    p.goal = { x: at.x, z: at.z, y: p.y }; p.path = null; p.waitT = 0; p.searchT = 0;
    this.say(p, pickR(SAY_RES.heard));
  }
  wake(p) {
    const b = p.bed;
    p.char.setBase(null); p.char.object.rotation.set(0, 0, 0);
    if (b) { p.x = b.side.x; p.z = b.side.z; p.y = b.y; }
    p.state = 'idle';
    this.say(p, pickR(SAY_RES.wake));
  }
  // they have seen the intruder (or the visitor stealing)
  alarm(p, caught = false) {
    if (['alarm', 'flee', 'call', 'cower', 'ko', 'dead', 'fight', 'getup'].includes(p.state)) return;
    if (p.state === 'sleep') this.wake(p);
    p.char.setBase(null);
    this.say(p, pickR(caught ? SAY_RES.caught : SAY_RES.thief));
    this.g.audio.sfx(p.female ? 'yelp_f' : 'yelp_m', { vol: 0.8 });
    this.alarmed = true;
    // a hunter who still has his rifle does not run
    const prof = this.h.profile;
    if (prof.id === 'cazador' && !p.kid && Math.random() < 0.6) { p.state = 'fight'; p.fightT = 25; p.punchT = 0.6; return; }
    p.state = 'flee';
    // the room furthest from the intruder
    const nav = this.h.nav, pl = this.g.player;
    let far = null, fd = -1;
    for (const id in nav.roomNode) { const q = nav.nodes[nav.roomNode[id]]; if (Math.abs(q.y - p.y) > 1) continue; const d = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z); if (d > fd) { fd = d; far = nav.roomNode[id]; } }
    p.path = far != null ? navPath(nav, nearestNode(nav, p.x, p.z, p.y), far) : null; p.pi = 0;
    p.callIn = 1.5;
  }
  startCall(p) {
    p.state = 'call'; p.callT = 0; p.char.setBase('phone');
    this.say(p, pickR(SAY_RES.phone));
    this.g.peds.mark(p, '📱');
    this.g.police.calls.add(p);
  }
  endCall(p, done) {
    this.g.peds.unmark(p);
    this.g.police.calls.delete(p);
    p.char.setBase(null);
    if (!done) return;
    const g = this.g, d = this.door;
    p.state = 'cower';
    this.say(p, pickR(SAY_RES.hide));
    g.police.report('allanamiento', d.x, d.z, null, false);
    g.police.hideSpot = { kind: 'house', obj: d }; g.police.resetRaid();
  }

  // ---- the player's doings
  // took something: anyone who sees it raises the alarm; a noise for the ones who only hear
  onLoot(it) {
    this.noiseT = 1.5;
    for (const p of this.people) if (p.kind === 'res' && this.sees(p, 10)) this.alarm(p, this.mode === 'visit');
  }
  // a crime inside (hitting someone, a shot): who saw it phones; shots are heard next door
  onCrime(type, opts = {}) {
    const g = this.g;
    if (type === 'disparo' || type === 'explosion') {
      this.noise(g.player.pos.x, g.player.pos.z, 40);
      if (!this.neighbours) { this.neighbours = true; setTimeout(() => { if (g.state === 'play') { g.police.report(type, this.door.x, this.door.z, null, false); g.police.hideSpot = { kind: 'house', obj: this.door }; } }, 6000); }
      return;
    }
    if (type === 'policia' || type === 'policia_muerto') { g.police.report(type, this.door.x, this.door.z, null, true); return; }
    for (const p of this.people) if (p.kind === 'res' && p !== opts.victim && this.sees(p, 10)) this.alarm(p);
  }

  // ---- combat hooks (fists, bat, bullets)
  hitTest(x, z, r) {
    let best = null, bd = r;
    for (const p of this.people) {
      if (p.state === 'dead' || p.state === 'ko') continue;
      if (Math.abs(p.y - this.g.player.pos.y) > 1.2) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  damage(p, dmg, kx = 0, kz = 0, kind = 'fist') {
    const g = this.g;
    if (p.state === 'dead') return;
    p.hp -= dmg;
    p.char.play('hit', 0.35);
    if (p.kind === 'cop') { g.police.crime(p.hp <= 0 ? 'policia_muerto' : 'policia', this.door.x, this.door.z); }
    if (p.call) { }
    if (g.police.calls.has(p)) this.endCall(p, false);
    if (p.char.rag) p.char.rag.push(9, kx * 0.35, 0.3, kz * 0.35); // a body on the floor jerks with the blow
    if (p.hp <= 0) {
      if (p.state === 'sleep') { p.state = 'dead'; p.char.setBase('lie'); p.char.object.rotation.order = 'YXZ'; }
      else { p.state = 'dead'; this.fall(p, { vel: [kx * 0.8, 0.2, kz * 0.8], up: 0.6, buckle: 0.9, tone: 0.1, dead: true }); }
      g.effects.pool(p.x, p.z, 0.8);
      if (p.kind === 'res') this.onCrime('homicidio', { victim: p });
      return;
    }
    if (kind === 'bullet' || p.hp < 45 || Math.random() < (kind === 'bat' ? 0.6 : 0.3)) { this.knockOut(p, 30 + Math.random() * 20, kx, kz); }
    else if (p.kind === 'res') this.alarm(p);
    if (p.kind === 'res') this.onCrime('agresion', { victim: p });
  }
  knockOut(p, t = 40, kx = 0, kz = 0) {
    if (this.g.police.calls.has(p)) this.endCall(p, false);
    p.state = 'ko'; p.koT = t;
    if (!p.char.rag) this.fall(p, { vel: [kx * 0.6, 0.3, kz * 0.6], up: 0.6, buckle: 1.3, tone: 0.1 }); // out cold: the knees go
  }
  // the body goes limp onto this storey's floor, against its walls (a ragdoll: see Character.ragdoll)
  fall(p, opts) {
    const col = this.colOf(p), h = this.h;
    p.char.object.rotation.order = 'XYZ';
    p.char.ragdoll({ env: { floor: (x, z, y) => (h.floorY ? h.floorY(x, z, y) : 0), collide: (pp, r) => col.resolveCircle(pp, r), crosses: (ax, az, bx, bz) => col.crosses && col.crosses(ax, az, bx, bz) }, dead: p.hp <= 0, ...opts });
  }
  canTakedown(p) {
    const pl = this.g.player;
    if (!pl.crouch || p.kind !== 'res' || ['ko', 'dead', 'fight'].includes(p.state)) return false;
    if (Math.abs(p.y - pl.pos.y) > 0.8) return false;
    const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
    if (Math.hypot(dx, dz) > 1.6) return false;
    return p.state === 'sleep' || Math.abs(wrapA(Math.atan2(dx, dz) - p.heading)) > 2.0;
  }
  takedown(p) {
    const pl = this.g.player;
    pl.heading = Math.atan2(p.x - pl.pos.x, p.z - pl.pos.z);
    pl.char.play('punch', 0.45);
    this.g.audio.sfx('punch_hit', { vol: 0.35 });
    if (p.state === 'sleep') { p.koT = 60; p.state = 'ko'; return; } // stays asleep for good
    if (p.state === 'sit' || p.state === 'host') p.char.setBase(null);
    this.knockOut(p, 55 + Math.random() * 20, Math.sin(pl.heading) * 1.5, Math.cos(pl.heading) * 1.5);
  }

  // ---- the police come in (3+ stars and they saw you go in)
  raid(kind = 'gc') {
    const g = this.g, nav = this.h.nav, e = nav.nodes[nav.entrance];
    for (let k = 0; k < 2; k++) {
      const desc = { ...COP_DESC_REF[kind] }; desc.skin = Math.floor(Math.random() * 4);
      const char = g.chars.create(desc);
      g.scene.add(char.object);
      const p = { kind: 'cop', char, x: e.x + (k - 0.5) * 0.6, z: e.z + 0.3, y: 0, heading: 0, state: 'search', hp: 100, look: 0, path: null, pi: 0, visited: new Set(), shootT: 1 };
      this.people.push(p);
    }
    g.audio.sfx('door_slam', { vol: 1 });
    this.say(this.people[this.people.length - 1], SAY_RES.cop[0]);
  }

  // ---- per frame
  update(dt) {
    const g = this.g, pl = g.player;
    this.t += dt;
    this.noiseT = Math.max(0, this.noiseT - dt);
    // the windows follow the daylight
    const day = 1 - (g.sky.night || 0);
    if (this.h.winMat && !this.h.clearGlass) this.h.winMat.emissiveIntensity = 0.1 + day * 0.75;
    let touching = false;
    for (const p of this.people) {
      p.seeT -= dt;
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      let speed = 0;
      switch (p.state) {
        case 'sleep':
          p.snoreT -= dt;
          if (p.snoreT <= 0) { p.snoreT = 5 + Math.random() * 4; if (d < 12) this.say(p, 'Zzz…'); }
          if (p.seeT <= 0) { p.seeT = 0.25; if (this.hears(p)) this.alert(p, { x: pl.pos.x, z: pl.pos.z }); }
          break;
        case 'idle': case 'sit': case 'host':
          p.look = Math.sin(this.t * 0.5 + p.i * 2) * 0.5;
          if (p.state === 'host' && d < 6) { p.heading = dampA(p.heading, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), 3, dt); p.look = 0; }
          if (p.seeT <= 0) {
            p.seeT = 0.25;
            if (this.mode !== 'visit' && this.sees(p)) this.alarm(p);
            else if (this.mode !== 'visit' && this.hears(p)) this.alert(p, { x: pl.pos.x, z: pl.pos.z });
          }
          break;
        case 'search': {
          if (p.seeT <= 0) { p.seeT = 0.2; if (this.sees(p, 10)) { this.alarm(p); break; } }
          speed = this.walkTo(p, p.goal, 1.3, dt);
          if (speed === 0) { p.searchT += dt; p.look = Math.sin(this.t * 2) * 0.8; if (p.searchT > 3) { this.say(p, pickR(SAY_RES.calm)); this.goHome(p); } }
          break;
        }
        case 'back': {
          speed = this.walkTo(p, p.home, 1.2, dt);
          if (speed === 0) { p.x = p.home.x; p.z = p.home.z; p.heading = p.home.heading; if (p.home.sit) { p.state = 'sit'; p.char.setBase('sit'); } else p.state = 'idle'; }
          if (p.seeT <= 0) { p.seeT = 0.25; if (this.mode !== 'visit' && this.sees(p)) this.alarm(p); }
          break;
        }
        case 'flee': {
          p.callIn -= dt;
          speed = this.followPath(p, 3.4, dt);
          if (speed === 0 || p.callIn < -3) this.startCall(p);
          break;
        }
        case 'call':
          p.callT += dt;
          p.heading = dampA(p.heading, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), 3, dt);
          if (p.callT > 6) this.endCall(p, true);
          break;
        case 'cower': p.look = Math.sin(this.t * 3) * 0.3; break;
        case 'fight': {
          p.fightT -= dt;
          const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
          p.heading = dampA(p.heading, Math.atan2(dx, dz), 8, dt);
          if (p.fightT <= 0 || pl.mode !== 'foot') { this.startCall(p); break; }
          if (d > 1.05) { speed = 3.8; this.step(p, speed, dt); }
          else if ((p.punchT -= dt) <= 0) {
            p.punchT = 0.9 + Math.random() * 0.5;
            p.char.play(Math.random() < 0.5 ? 'punch' : 'punch2', 0.45);
            setTimeout(() => { if (p.state === 'fight' && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 1.5) { g.audio.sfx('punch_hit'); pl.damage(7 + Math.random() * 5); } }, 180);
          }
          break;
        }
        case 'ko':
          p.koT -= dt;
          if (p.koT <= 0) {
            if (p.char.rag) { const up = p.char.getUp(); if (up) { p.x = up.x; p.z = up.z; p.heading = up.heading; } p.state = 'getup'; }
            else { p.char.setBase(null); p.state = 'idle'; this.say(p, '¿Qué… qué ha pasao?'); this.alarm(p); }
          }
          break;
        case 'getup':
          if (!p.char.gettingUp) { p.state = 'idle'; this.say(p, '¿Qué… qué ha pasao?'); this.alarm(p); }
          break;
        case 'dead': break;
        // the police, room by room
        case 'search_cop': case 'searchc': break;
      }
      if (p.kind === 'cop') speed = this.copStep(p, dt, d) ?? speed;
      if (p.kind === 'cop' && p.state === 'chase' && d < 1.3 && !pl.knock && Math.hypot(pl.vel.x, pl.vel.z) < 2.6) touching = true;
      // pose and position
      const o = p.char.object;
      const lying = p.state === 'sleep' || p.state === 'ko' || p.state === 'dead';
      p.char.update(dt, speed, { lookYaw: lying ? undefined : p.look });
      if (p.char.rag) { const rp = p.char.ragPos(this._rp || (this._rp = new THREE.Vector3())); p.x = rp.x; p.z = rp.z; p.y = p.char.rag.floorY; } // (it places the body itself)
      else if (lying) {
        o.rotation.order = 'YXZ';
        o.rotation.set(-Math.PI / 2, p.heading, 0);
        o.position.set(p.x, p.state === 'sleep' ? p.y : p.y + 0.14, p.z);
      } else {
        o.rotation.order = 'XYZ';
        o.rotation.set(0, p.heading, 0);
        o.position.set(p.x, p.y, p.z);
      }
    }
    if (touching && g.police.wanted > 0) { this.bustT = (this.bustT || 0) + dt; if (this.bustT > 1.1) { this.bustT = 0; g.onBusted(); } }
    else this.bustT = 0;
  }
  goHome(p) { p.state = 'back'; p.path = null; }
  // the walls of the storey this person is on (not necessarily the player's)
  colOf(p) { const h = this.h; return h.levels ? h.levels[p.y > h.split ? 1 : 0] : this.g.map.collider; }
  step(p, speed, dt) {
    // along their own storey, and never through a wall
    const col = this.colOf(p);
    const ox = p.x, oz = p.z;
    p.x += Math.sin(p.heading) * speed * dt; p.z += Math.cos(p.heading) * speed * dt;
    const pos = { x: p.x, z: p.z };
    col.resolveCircle(pos, 0.28);
    if (col.crosses && col.crosses(ox, oz, pos.x, pos.z)) { pos.x = ox; pos.z = oz; }
    p.x = pos.x; p.z = pos.z;
    const fy = this.h.floorY ? this.h.floorY(p.x, p.z, p.y) : 0;
    p.y = fy;
  }
  // along the navigation graph to a point; returns the speed (0 = arrived)
  walkTo(p, goal, speed, dt) {
    const nav = this.h.nav;
    if (!p.path || p.pathGoal !== goal) {
      p.pathGoal = goal;
      const a = nearestNode(nav, p.x, p.z, p.y), b = nearestNode(nav, goal.x, goal.z, goal.y ?? p.y);
      p.path = navPath(nav, a, b) || []; p.pi = 0;
      p.path.push(-1); // the goal itself at the end
    }
    return this.followPath(p, speed, dt, goal);
  }
  followPath(p, speed, dt, goal = null) {
    if (!p.path || p.pi >= p.path.length) return 0;
    const id = p.path[p.pi];
    const t = id === -1 ? goal : this.h.nav.nodes[id];
    if (!t) { p.pi++; return 0; }
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.35 || (t.y !== undefined && Math.abs(t.y - p.y) > 1.5 && d < 0.8)) { p.pi++; return p.pi >= p.path.length ? 0 : speed; }
    p.heading = dampA(p.heading, Math.atan2(dx, dz), 9, dt);
    this.step(p, speed, dt);
    return speed;
  }
  // a Guardia Civil in the house: search the rooms, check the wardrobes, chase and arrest when they see you
  copStep(p, dt, d) {
    const g = this.g, pl = g.player, nav = this.h.nav;
    if (p.state === 'ko' || p.state === 'dead' || p.state === 'getup') return 0;
    if (g.police.wanted === 0) { p.state = 'leave'; }
    if (p.state === 'leave') { const s = this.walkTo(p, nav.nodes[nav.entrance], 2, dt); return s; }
    if (p.seeT <= 0) {
      p.seeT = 0.2;
      if (this.sees(p, 11)) { if (p.state !== 'chase') this.say(p, pickR(SAY_RES.copSee)); p.state = 'chase'; p.lastSeen = { x: pl.pos.x, z: pl.pos.z, y: pl.pos.y }; g.police.seen = true; }
      else if (p.state === 'chase' && p.lostT > 2) { p.state = 'search'; p.path = null; }
    }
    if (p.state === 'chase') {
      const vis = this.sees(p, 14);
      p.lostT = vis ? 0 : (p.lostT || 0) + dt;
      if (vis) p.lastSeen = { x: pl.pos.x, z: pl.pos.z, y: pl.pos.y };
      // Guardia Civil opens fire at 3+ stars when they have a clear line
      if (vis && g.police.wanted >= 3 && d > 2.2 && d < 12) {
        p.shootT -= dt;
        if (p.shootT <= 0) { p.shootT = 1 + Math.random() * 0.8; g.police.officerShoot(p, pl.pos.x, pl.pos.z, d); }
      }
      if (vis && d < 8 && this.colOf(p).raycast(p.x, p.z, pl.pos.x, pl.pos.z, p.y + 1, pl.pos.y + 1) > 0.98) {
        p.heading = dampA(p.heading, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), 10, dt);
        if (d > 1.0) { this.step(p, 4.6, dt); return 4.6; }
        return 0;
      }
      return this.walkTo(p, p.lastSeen, 4.4, dt);
    }
    // searching: next unvisited room, a look round, the wardrobes
    if (p.waitT > 0) {
      p.waitT -= dt; p.look = Math.sin(this.t * 2.2 + p.x) * 0.9;
      if (p.checking && p.waitT <= 0) {
        const it = p.checking; p.checking = null;
        if (g.interiors.hiding === it) { this.say(p, '¡Te pillé! ¡Sal de ahí!'); g.interiors.unhide(true); p.state = 'chase'; p.lastSeen = { x: pl.pos.x, z: pl.pos.z, y: pl.pos.y }; }
        else this.say(p, 'Aquí no hay nadie.');
      }
      return 0;
    }
    if (!p.target) {
      const rooms = Object.entries(nav.roomNode).filter(([id]) => !p.visited.has(id));
      if (!rooms.length) { p.visited.clear(); return 0; }
      // nearest unvisited room
      let best = null, bd = Infinity;
      for (const [id, ni] of rooms) { const q = nav.nodes[ni]; const dd = Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(q.y - p.y) * 4 + Math.random() * 3; if (dd < bd) { bd = dd; best = [id, ni]; } }
      p.target = { id: best[0], ...nav.nodes[best[1]] };
      p.path = null;
    }
    const s = this.walkTo(p, p.target, 2.4, dt);
    if (s === 0) {
      p.visited.add(p.target.id);
      p.waitT = 1.2 + Math.random();
      if (Math.random() < 0.3) this.say(p, pickR(SAY_RES.cop.slice(1)));
      // a wardrobe in this room? open it (more likely if it is the only place left)
      const wardrobes = this.h.inter.filter((it) => it.type === 'hide' && Math.abs((it.y || 0) - p.y) < 1 && Math.hypot(it.x - p.x, it.z - p.z) < 3.2);
      if (wardrobes.length && Math.random() < 0.45) { const w = wardrobes[0]; p.checking = w; p.waitT = 1.6; p.heading = Math.atan2(w.hx - p.x, w.hz - p.z); g.audio.sfx('door_open', { vol: 0.5 }); }
      p.target = null;
    }
    return s;
  }
}
function wrapA(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }
function dampA(cur, target, rate, dt) { return cur + wrapA(target - cur) * (1 - Math.exp(-rate * dt)); }
// set by the interiors module (the police uniforms live in police.js; houses.js must not import game systems)
export const COP_DESC_REF = {};
let randomDescFrom = null;
export function setDescMaker(fn) { randomDescFrom = fn; }
