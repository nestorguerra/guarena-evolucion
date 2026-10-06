// Vehicles: procedural models (instanced), arcade driving physics with drift, collisions and damage.
// Conventions: heading θ, forward f = (sin θ, cos θ), right r = (-cos θ, sin θ); model local +z = front, +x = left side.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, TAU } from './util.js';
import { PERK } from './perks.js';
import { STYLE } from './style.js';

// ---------------------------------------------------------------- model catalogue
// Fictional names; silhouettes you recognise from any street in the Vegas Altas: the modern hatch, saloon, crossover,
// van and pick-up; a 2000s hatch; and the old ones still parked in every village — the tiny rear-engined runabout of
// the sixties, the tall "cuatro latas", the square eighties city car, the seventies three-box saloon and the old
// Linares-built 4x4. era ('old' chrome age, 'old80' plastic eighties, 'mid' 2000s, 'new') drives the lamps, grille,
// bumpers, trims, mirrors, plates, wheels and how worn the paint is.
export const MODELS = {
  veton:    { name: 'Vetón', label: 'Utilitario', shape: 'hatch', era: 'new', wheel: 'alloy', L: 4.06, W: 1.76, H: 1.44, wb: 2.56, wr: 0.31, fo: 0.8, cb: 0.17, mass: 1150, accel: 6.2, top: 47, grip: 7.5, steer: 0.62, colors: ['#c8202a', '#f2f2ee', '#1c2230', '#8a929a', '#2f5fa8', '#d9d9d4', '#3c6e4a', '#5a5f66'] },
  lusitano: { name: 'Lusitano', label: 'Berlina', shape: 'sedan', era: 'new', wheel: 'alloy5', L: 4.52, W: 1.8, H: 1.45, wb: 2.68, wr: 0.32, fo: 0.9, cb: 0.16, mass: 1350, accel: 6.8, top: 52, grip: 7.8, steer: 0.58, colors: ['#1c1c20', '#b9bdc2', '#f2f2ee', '#5b2230', '#2a3a5c', '#6b6f73'] },
  tarteso:  { name: 'Tarteso', label: 'Todocamino', shape: 'suv', era: 'new', wheel: 'alloyDark', L: 4.38, W: 1.84, H: 1.62, wb: 2.64, wr: 0.35, fo: 0.88, cb: 0.22, mass: 1450, accel: 6.3, top: 48, grip: 7.2, steer: 0.58, colors: ['#f2f2ee', '#3a3f45', '#8c1d24', '#c9b89a', '#1f4a3a', '#2c5aa0', '#9aa0a6'] },
  emerita:  { name: 'Emérita', label: 'Furgoneta', shape: 'van', era: 'mid', wheel: 'hubcap', L: 4.4, W: 1.84, H: 1.86, wb: 2.78, wr: 0.33, fo: 0.72, cb: 0.19, mass: 1480, accel: 5.2, top: 41, grip: 6.8, steer: 0.6, colors: ['#f2f2ee', '#e9e9e2', '#b8302a', '#2f5fa8', '#6d7a86'] },
  jara:     { name: 'Jara', label: 'Pick-up', shape: 'pickup', era: 'mid', wheel: 'alloy5', L: 5.2, W: 1.86, H: 1.8, wb: 3.08, wr: 0.38, fo: 0.95, cb: 0.27, mass: 1900, accel: 5.8, top: 46, grip: 6.9, steer: 0.55, colors: ['#f2f2ee', '#8a929a', '#1c1c20', '#8c1d24', '#c9b89a'] },
  cierzo:   { name: 'Cierzo', label: 'Compacto (2000)', shape: 'hatch', era: 'mid', wheel: 'hubcap', L: 3.92, W: 1.66, H: 1.46, wb: 2.46, wr: 0.3, fo: 0.74, cb: 0.15, mass: 1050, accel: 5.8, top: 45, grip: 7.2, steer: 0.62, colors: ['#8a929a', '#b8302a', '#1c3a6a', '#e9e9e2', '#3a6a4a', '#c9b89a', '#5b2230'] },
  pulga:    { name: 'Pulga', label: 'Clásico (años 60)', shape: 'tiny', era: 'old', wheel: 'steelCap', engine: 'old', L: 3.3, W: 1.38, H: 1.4, wb: 2.0, wr: 0.27, fo: 0.55, cb: 0.18, mass: 620, accel: 3.6, top: 30, grip: 6.2, steer: 0.66, colors: ['#8fb8d8', '#efe6c8', '#b8302a', '#9fc8a8', '#f2f0ea', '#e2c05a', '#5a6a8a'] },
  mulilla:  { name: 'Mulilla', label: 'Clásico (años 70)', shape: 'r4', era: 'old', wheel: 'steel', engine: 'old', L: 3.67, W: 1.49, H: 1.55, wb: 2.42, wr: 0.28, fo: 0.6, cb: 0.2, mass: 720, accel: 3.8, top: 32, grip: 6.2, steer: 0.64, colors: ['#f2f0ea', '#e8d08a', '#8a3a2a', '#6a8aa8', '#c8c0a8', '#5a7a4a'] },
  morisco:  { name: 'Morisco', label: 'Utilitario (años 80)', shape: 'boxhatch', era: 'old80', wheel: 'steel', engine: 'old', L: 3.38, W: 1.5, H: 1.45, wb: 2.16, wr: 0.27, fo: 0.62, cb: 0.17, mass: 720, accel: 4.2, top: 36, grip: 6.6, steer: 0.64, colors: ['#f2f2ee', '#b8302a', '#d8c8a0', '#2f5fa8', '#e6b422', '#3a3a3e'] },
  taifa:    { name: 'Taifa', label: 'Berlina (años 70)', shape: 'boxsedan', era: 'old', wheel: 'hubcapOld', engine: 'old', L: 4.25, W: 1.62, H: 1.4, wb: 2.5, wr: 0.29, fo: 0.82, cb: 0.17, mass: 1000, accel: 4.6, top: 40, grip: 6.8, steer: 0.6, colors: ['#e8dcc0', '#6a4a2a', '#2a4a3a', '#8a929a', '#f2f0ea', '#8a2a2a', '#3a5a8a'] },
  serrano:  { name: 'Serrano', label: 'Todoterreno clásico', shape: 'offroad', era: 'old', wheel: 'white', engine: 'diesel', L: 3.9, W: 1.68, H: 1.98, wb: 2.23, wr: 0.38, fo: 0.72, cb: 0.3, mass: 1500, accel: 4.2, top: 34, grip: 7.0, steer: 0.56, colors: ['#e9e6dc', '#c8c0a0', '#5a6a4a', '#7a9ab8', '#d8d0b8'] },
  taxi:     { name: 'Taxi', label: 'Taxi', shape: 'sedan', era: 'new', wheel: 'hubcap', livery: 'taxi', L: 4.52, W: 1.8, H: 1.45, wb: 2.68, wr: 0.32, fo: 0.9, cb: 0.16, mass: 1350, accel: 6.8, top: 52, grip: 7.8, steer: 0.58, colors: ['#f4f4f0'] },
  policia:  { name: 'Policía Local', label: 'Patrulla', shape: 'sedan', era: 'new', wheel: 'alloy5', livery: 'local', L: 4.52, W: 1.8, H: 1.45, wb: 2.68, wr: 0.32, fo: 0.9, cb: 0.16, mass: 1400, accel: 7.6, top: 56, grip: 8.4, steer: 0.6, colors: ['#f4f4f0'] },
  guardia:  { name: 'Guardia Civil', label: 'Todoterreno', shape: 'suv', era: 'new', wheel: 'alloyDark', livery: 'gc', L: 4.38, W: 1.84, H: 1.66, wb: 2.64, wr: 0.36, fo: 0.88, cb: 0.25, mass: 1600, accel: 7.8, top: 58, grip: 8.6, steer: 0.6, colors: ['#f4f4f0'] },
  moto:     { name: 'Moto', label: 'Moto de 125', shape: 'moto', twoWheel: true, era: 'new', wheel: 'alloy5', engine: 'moto', L: 1.95, W: 0.72, H: 1.15, wb: 1.3, wr: 0.3, fo: 0.3, cb: 0.12, mass: 190, accel: 7.2, top: 30, grip: 6.4, steer: 0.62, colors: ['#c8202a', '#1c1c20', '#f2f2ee', '#2f5fa8', '#e8b82a', '#3c6e4a'] },
  bici:     { name: 'Bicicleta', label: 'Bici', shape: 'bici', twoWheel: true, era: 'mid', wheel: 'spoke', engine: 'none', L: 1.75, W: 0.6, H: 1.05, wb: 1.02, wr: 0.34, fo: 0.36, cb: 0.1, mass: 95, accel: 2.8, top: 9.5, grip: 6, steer: 0.7, colors: ['#c8202a', '#2f5fa8', '#1c1c20', '#f2f2ee', '#3c6e4a', '#e87aa4'] },
  tractor:  { name: 'Tractor', label: 'Tractor', shape: 'tractor', L: 4.1, W: 2.2, H: 2.85, wb: 2.2, wr: 0.78, fo: 0.9, cb: 0.4, mass: 4200, accel: 3.0, top: 11.5, grip: 9, steer: 0.62, colors: ['#2e7d32', '#c62828', '#1565c0', '#2e7d32'] },
};
// traffic is mostly modern; the old ones sleep at the kerb (and now and then someone takes them out)
export const TRAFFIC_MIX = ['veton', 'veton', 'veton', 'lusitano', 'lusitano', 'tarteso', 'tarteso', 'emerita', 'jara', 'cierzo', 'cierzo', 'veton', 'tarteso', 'lusitano', 'taxi', 'morisco', 'taifa', 'serrano', 'mulilla'];
export const PARKED_MIX = ['veton', 'veton', 'lusitano', 'lusitano', 'tarteso', 'tarteso', 'emerita', 'emerita', 'jara', 'cierzo', 'cierzo', 'cierzo', 'morisco', 'morisco', 'taifa', 'mulilla', 'pulga', 'serrano', 'veton'];
// paint wear per era (0 showroom … 1 fifty summers in the sun)
export const ERA_WEAR = { new: [0, 0.18], mid: [0.12, 0.45], old80: [0.3, 0.75], old: [0.35, 1] };

const col = (h) => new THREE.Color(h);
function paintGeo(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const cc = color.isColor ? color : col(color);
  for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const boxAt = (w, h, d, x, y, z, color) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paintGeo(g, color); };
const boxR = (w, h, d, x, y, z, rx, ry, rz, color) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return paintGeo(g, color); };
// disc / short cylinder facing ±z (lamps, badges) and a ring around it
const discZ = (r, d, x, y, z, color, seg = 16) => { const g = new THREE.CylinderGeometry(r, r, d, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return paintGeo(g, color); };
const ringZ = (r, t, x, y, z, color) => { const g = new THREE.TorusGeometry(r, t, 6, 18); g.translate(x, y, z); return paintGeo(g, color); };
function mergeList(list) { return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false); }

// ---------------------------------------------------------------- side silhouettes
// returns the outline (front bottom → over the roof → rear bottom, then the sills with wheel arches), key lines and
// the window shapes: side glass quad, windshield (zw0 at bl → zw1 at the roof) and rear window (top zt,yt → bottom zb,yb)
function profile(s) {
  const { L, H, wb, wr, fo, cb } = s;
  const zf = L / 2, zr = -L / 2;
  const zfa = zf - fo, zra = zfa - wb;
  const ra = wr + 0.07;
  const pts = [];
  const P = (z, y) => pts.push([z, y]);
  let zw0, zw1, zroof, bl, hf, side, rear;
  const explicit = {
    // tiny rear-engined runabout: rounded nose without grille, short bonnet, domed roof, louvred engine lid
    tiny: () => {
      bl = 0.86; hf = 0.6; zw0 = zf - 0.7; zw1 = zw0 - 0.36; zroof = -0.82;
      [[zf - 0.05, cb + 0.08], [zf, cb + 0.22], [zf + 0.01, 0.54], [zf - 0.04, 0.64], [zf - 0.16, 0.74], [zf - 0.36, 0.81], [zf - 0.62, 0.85], [zw0, bl],
        [zw1 + 0.05, H - 0.06], [zw1 - 0.12, H - 0.005], [0.05, H], [-0.35, H - 0.025], [-0.62, H - 0.07], [zroof, H - 0.13], [-1.1, 1.13], [-1.34, 0.99], [-1.52, 0.86],
        [zr - 0.01, 0.64], [zr, cb + 0.22], [zr + 0.05, cb + 0.08]].forEach((p) => P(p[0], p[1]));
      side = [[zw0 - 0.05, bl + 0.03], [zw1 - 0.03, H - 0.08], [-0.62, H - 0.12], [-1.12, bl + 0.05]];
      rear = { zt: zroof - 0.02, yt: H - 0.16, zb: -1.3, yb: 1.01 };
    },
    // square eighties city car: upright flat panels
    boxhatch: () => {
      bl = 0.86; hf = 0.72; zw0 = zf - 0.68; zw1 = zw0 - 0.44; zroof = zr + 0.14;
      [[zf - 0.04, cb + 0.08], [zf, cb + 0.22], [zf + 0.005, 0.72], [zf - 0.04, 0.78], [zf - 0.4, 0.82], [zw0, bl], [zw1 + 0.03, H - 0.03], [zw1 - 0.06, H],
        [zroof, H - 0.005], [zr + 0.03, H - 0.05], [zr - 0.005, bl + 0.1], [zr, cb + 0.22], [zr + 0.04, cb + 0.08]].forEach((p) => P(p[0], p[1]));
      side = [[zw0 - 0.05, bl + 0.03], [zw1 - 0.02, H - 0.06], [zr + 0.2, H - 0.06], [zr + 0.16, bl + 0.03]];
      rear = { zt: zr + 0.1, yt: H - 0.08, zb: zr + 0.01, yb: bl + 0.12 };
    },
    // tall "cuatro latas": sloping bonnet, big grille, upright glasshouse, long flat roof
    r4: () => {
      bl = 0.9; hf = 0.7; zw0 = zf - 0.78; zw1 = zw0 - 0.3; zroof = zr + 0.24;
      [[zf - 0.04, cb + 0.08], [zf, cb + 0.24], [zf + 0.01, 0.7], [zf - 0.03, 0.76], [zf - 0.35, 0.82], [zf - 0.7, 0.88], [zw0, bl],
        [zw1 + 0.04, H - 0.04], [zw1 - 0.08, H], [zroof, H - 0.01], [zr + 0.08, H - 0.1], [zr - 0.005, bl - 0.05], [zr, cb + 0.24], [zr + 0.04, cb + 0.08]].forEach((p) => P(p[0], p[1]));
      side = [[zw0 - 0.05, bl + 0.02], [zw1 - 0.02, H - 0.06], [zr + 0.28, H - 0.06], [zr + 0.14, bl + 0.02]];
      rear = { zt: zr + 0.16, yt: H - 0.09, zb: zr + 0.04, yb: bl + 0.04 };
    },
    // seventies three-box saloon: long flat bonnet and boot, thin pillars
    boxsedan: () => {
      bl = 0.84; hf = 0.7; zw0 = zf - 1.08; zw1 = zw0 - 0.6; zroof = zra + 0.3;
      [[zf - 0.04, cb + 0.08], [zf, cb + 0.22], [zf + 0.01, 0.7], [zf - 0.03, 0.76], [zf - 0.5, 0.8], [zw0, bl], [zw1 + 0.05, H - 0.03], [zw1 - 0.1, H],
        [zroof, H - 0.01], [zroof - 0.45, bl + 0.1], [zr + 0.1, bl + 0.08], [zr - 0.005, bl - 0.02], [zr, cb + 0.22], [zr + 0.04, cb + 0.08]].forEach((p) => P(p[0], p[1]));
      side = [[zw0 - 0.05, bl + 0.03], [zw1 - 0.02, H - 0.06], [zroof - 0.02, H - 0.06], [zroof - 0.36, bl + 0.05]];
      rear = { zt: zroof - 0.04, yt: H - 0.06, zb: zroof - 0.42, yb: bl + 0.12 };
    },
    // old 4x4: flat bonnet, near-vertical windscreen, flat roof and back
    offroad: () => {
      bl = 1.12; hf = 1.0; zw0 = zf - 1.0; zw1 = zw0 - 0.14; zroof = zr + 0.04;
      [[zf - 0.03, cb + 0.06], [zf, cb + 0.2], [zf, 1.0], [zf - 0.04, 1.06], [zf - 0.9, 1.1], [zw0, bl], [zw1 + 0.02, H - 0.04], [zw1 - 0.06, H],
        [zroof, H], [zr, H - 0.04], [zr, cb + 0.2], [zr + 0.03, cb + 0.06]].forEach((p) => P(p[0], p[1]));
      side = [[zw0 - 0.1, bl + 0.06], [zw1 - 0.04, H - 0.1], [zr + 0.14, H - 0.1], [zr + 0.14, bl + 0.06]];
      rear = { zt: zr - 0.004, yt: H - 0.12, zb: zr - 0.004, yb: bl + 0.12 };
    },
  }[s.shape];
  if (explicit) explicit();
  else {
    const suv = s.shape === 'suv' || s.shape === 'pickup';
    const van = s.shape === 'van';
    bl = van ? 1.02 : suv ? 1.04 : 0.92;
    hf = van ? 0.98 : suv ? 0.93 : 0.74;
    P(zf - 0.06, cb + 0.1);
    P(zf, cb + 0.26);
    P(zf + 0.01, (cb + hf) * 0.55 + 0.05);
    P(zf - 0.03, hf - 0.07);
    P(zf - 0.14, hf);
    if (van) { zw0 = zfa + 0.05; zw1 = zw0 - (H - bl) * 0.95; P(zf - 0.5, hf + 0.03); }
    else { zw0 = zfa - (suv ? 0.2 : 0.38); zw1 = zw0 - (H - bl) * (suv ? 1.45 : 1.75); P(zw0 + (zf - zw0) * 0.45, hf + (bl - hf) * 0.7); }
    P(zw0, bl);
    P(zw1 + 0.06, H - 0.04);
    P(zw1 - 0.12, H);
    let rearPts = [];
    if (s.shape === 'hatch') {
      zroof = zr + 0.55;
      rearPts = [[zroof, H - 0.02], [zr + 0.2, bl + 0.12], [zr + 0.04, bl - 0.02], [zr - 0.01, bl - 0.25], [zr, cb + 0.3], [zr + 0.06, cb + 0.1]];
    } else if (s.shape === 'sedan') {
      zroof = zra + 0.25;
      rearPts = [[zroof, H - 0.03], [zr + 0.95, bl + 0.1], [zr + 0.25, bl + 0.06], [zr + 0.02, bl - 0.02], [zr - 0.01, bl - 0.3], [zr, cb + 0.3], [zr + 0.06, cb + 0.1]];
    } else if (s.shape === 'suv') {
      zroof = zr + 0.3;
      rearPts = [[zroof, H - 0.02], [zr + 0.1, H - 0.2], [zr + 0.02, bl - 0.05], [zr - 0.01, bl - 0.35], [zr, cb + 0.3], [zr + 0.06, cb + 0.1]];
    } else if (s.shape === 'van') {
      zroof = zr + 0.12;
      rearPts = [[zroof, H - 0.03], [zr + 0.01, H - 0.2], [zr - 0.01, cb + 0.3], [zr + 0.06, cb + 0.1]];
    } else { // pickup: cab then bed
      zroof = zfa - 2.05;
      rearPts = [[zroof, H - 0.03], [zroof - 0.08, bl + 0.05], [zroof - 0.12, bl + 0.02], [zr + 0.05, bl + 0.02], [zr - 0.01, bl - 0.08], [zr - 0.01, cb + 0.3], [zr + 0.06, cb + 0.1]];
    }
    P(zroof + 0.15, H);
    for (const p of rearPts) P(p[0], p[1]);
    // side window and rear window
    const gTop = H - 0.06, gBot = bl + 0.035, zA0 = zw0 - 0.1, zA1 = zw1 - 0.02;
    let zC1, zC0;
    if (s.shape === 'hatch') { zC1 = zroof + 0.02; zC0 = zr + 0.42; }
    else if (s.shape === 'sedan') { zC1 = zroof - 0.02; zC0 = zroof - 0.42; }
    else if (s.shape === 'suv') { zC1 = zroof + 0.05; zC0 = zr + 0.2; }
    else if (s.shape === 'van') { zC1 = zroof + 0.35; zC0 = zroof + 0.3; }
    else { zC1 = zroof + 0.06; zC0 = zroof + 0.02; }
    side = [[zA0, gBot], [zA1, gTop], [zC1, gTop], [zC0, gBot]];
    if (s.shape === 'hatch') rear = { zt: zroof - 0.04, yt: H - 0.06, zb: zr + 0.24, yb: bl + 0.14 };
    else if (s.shape === 'sedan') rear = { zt: zroof - 0.06, yt: H - 0.06, zb: zr + 1.0, yb: bl + 0.14 };
    else if (s.shape === 'suv') rear = { zt: zr + 0.26, yt: H - 0.07, zb: zr + 0.12, yb: bl + 0.1 };
    else if (s.shape === 'van') rear = { zt: zr + 0.02, yt: H - 0.25, zb: zr, yb: bl + 0.1 };
    else rear = { zt: zroof - 0.03, yt: H - 0.1, zb: zroof - 0.08, yb: bl + 0.12 };
  }
  // sills with the wheel arches (rear to front)
  const arch = (za) => {
    P(za - ra - 0.02, cb);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      P(za + Math.cos(a) * ra, wr + Math.sin(a) * ra * 0.92);
    }
    P(za + ra + 0.02, cb);
  };
  P(Math.min(zr + 0.35, zra - ra - 0.05), cb);
  arch(zra);
  arch(zfa);
  P(Math.max(zf - 0.3, zfa + ra + 0.05), cb);
  return { pts, zw0, zw1, zroof, bl, hf, zfa, zra, zf, zr, side, rear };
}

// body build per shape: how much the sides lean in (tumblehome), plan rounding of the ends, edge bevel
const SHAPE_FORM = {
  hatch: [0.13, 0.07, 0.05], sedan: [0.13, 0.07, 0.05], suv: [0.12, 0.07, 0.05], van: [0.05, 0.07, 0.05], pickup: [0.12, 0.07, 0.05],
  tiny: [0.17, 0.15, 0.08], boxhatch: [0.05, 0.03, 0.025], r4: [0.07, 0.04, 0.03], boxsedan: [0.08, 0.035, 0.03], offroad: [0.0, 0.02, 0.02],
};

// ---------------------------------------------------------------- car geometry builder
function buildCar(spec) {
  const s = spec;
  const pr = profile(s);
  const era = s.era || 'new', old = era === 'old', old80 = era === 'old80', mid = era === 'mid', neu = era === 'new';
  let [tumble, rounding, bevel] = SHAPE_FORM[s.shape] || SHAPE_FORM.hatch;
  // (claymation: a toy car modelled in clay — a fatter, rounder body, its edges soft)
  const clay = STYLE.plastilina;
  if (clay) { tumble *= 1.18; rounding = Math.min(0.6, rounding * 1.3 + 0.05); bevel = bevel * 1.7 + 0.05; }
  const shape = new THREE.Shape();
  pr.pts.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  const bt = Math.max(0.03, bevel + 0.02);
  const eg = new THREE.ExtrudeGeometry(shape, { depth: s.W - bt * 2, bevelEnabled: true, bevelThickness: bt, bevelSize: bevel, bevelSegments: clay ? 4 : 2, curveSegments: clay ? 6 : 3 });
  eg.translate(0, 0, -(s.W - bt * 2) / 2);
  eg.rotateY(-Math.PI / 2); // x' = -z, z' = x
  const halfW = (y) => (s.W / 2) * (1 - tumble * clamp((y - pr.bl) / (s.H - pr.bl), 0, 1));
  const p = eg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = clamp((y - pr.bl) / (s.H - pr.bl), 0, 1);
    x *= 1 - tumble * t;
    const e = smoothstep(s.L / 2 - (s.shape === 'tiny' ? 0.75 : 0.55), s.L / 2 + 0.02, Math.abs(z));
    x *= 1 - rounding * e * e;
    p.setXYZ(i, x, y, z);
  }
  eg.deleteAttribute('normal');
  eg.deleteAttribute('uv');
  let body = mergeVertices(eg, 1e-3);
  body.computeVertexNormals();
  body = paintGeo(body, '#ffffff');
  const bodyExtra = [], trim = [], chrome = [], lf = [], lr = [], extra = [], glass = [];
  const dark = '#18191b', black = '#0e0f11', grey = '#4a4d52', plate = '#f4f4f0', eu = '#1d3f9a';
  const fz = s.L / 2, rz = -s.L / 2, W = s.W;
  const sideX = (y) => halfW(y) + 0.004;

  // ---- glass: side windows (following the tumblehome), windshield, rear window
  for (const sx of [1, -1]) {
    const g = new THREE.BufferGeometry();
    const V = ([z, y]) => [sx * (halfW(y) + 0.006), y, z];
    const [a, b, c, d] = pr.side.map(V);
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.computeVertexNormals();
    if (g.attributes.normal.getX(0) * sx < 0) { const arr = g.attributes.position.array; for (let k = 0; k < arr.length; k += 9) for (let q = 0; q < 3; q++) { const t = arr[k + 3 + q]; arr[k + 3 + q] = arr[k + 6 + q]; arr[k + 6 + q] = t; } g.computeVertexNormals(); }
    glass.push(paintGeo(g, '#ffffff'));
  }
  const quad = (p0, p1, p2, p3, outward) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
    g.computeVertexNormals();
    const n = new THREE.Vector3(g.attributes.normal.getX(0), g.attributes.normal.getY(0), g.attributes.normal.getZ(0));
    if (n.dot(outward) < 0) {
      g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p2, ...p1, ...p0, ...p3, ...p2], 3));
      g.computeVertexNormals();
    }
    return paintGeo(g, '#ffffff');
  };
  {
    const y0 = pr.bl + 0.03, y1 = s.H - 0.045;
    const w0 = halfW(y0) - 0.09, w1 = halfW(y1) - 0.1;
    const z0 = pr.zw0 - 0.02, z1 = pr.zw1 + 0.02;
    const nrm = new THREE.Vector3(0, pr.zw0 - pr.zw1, s.H - pr.bl).normalize();
    const o = bt - 0.002;
    glass.push(quad([w0, y0 + nrm.y * o, z0 + nrm.z * o], [-w0, y0 + nrm.y * o, z0 + nrm.z * o], [-w1, y1 + nrm.y * o, z1 + nrm.z * o], [w1, y1 + nrm.y * o, z1 + nrm.z * o], nrm));
  }
  {
    const { zt, yt, zb, yb } = pr.rear;
    const nrm = new THREE.Vector3(0, zt - zb, -(yt - yb)).normalize();
    if (nrm.z > 0) nrm.negate();
    const o = bt;
    const w0 = halfW(yb) - 0.12, w1 = halfW(yt) - 0.12;
    glass.push(quad([w0, yb + nrm.y * o, zb + nrm.z * o], [-w0, yb + nrm.y * o, zb + nrm.z * o], [-w1, yt + nrm.y * o, zt + nrm.z * o], [w1, yt + nrm.y * o, zt + nrm.z * o], nrm));
  }

  // ---- pillars, handles, sills
  const zB = (pr.side[0][0] + pr.side[2][0]) / 2 + 0.1;
  for (const sx of [1, -1]) {
    const py = (pr.bl + s.H) / 2 - 0.02;
    trim.push(boxAt(0.02, s.H - pr.bl - 0.12, old || old80 ? 0.07 : 0.1, sx * (halfW(py) + 0.009), py, zB, s.shape === 'offroad' ? '#e0ddd4' : '#101114'));
    const hc = old ? '#c8ccd0' : neu ? '#1a1b1d' : '#2b2c2f';
    (old ? chrome : trim).push(boxAt(0.02, 0.028, 0.13, sx * (W / 2 + 0.006), pr.bl - 0.1, zB + 0.35, hc));
    if (!['van', 'pickup', 'tiny', 'r4', 'offroad'].includes(s.shape)) (old ? chrome : trim).push(boxAt(0.02, 0.028, 0.13, sx * (W / 2 + 0.006), pr.bl - 0.1, zB - 0.55, hc));
    trim.push(boxAt(0.04, 0.09, (pr.zfa - pr.zra) - 0.9, sx * (W / 2 - 0.005), s.cb + 0.06, (pr.zfa + pr.zra) / 2, neu ? dark : grey));
    if (s.shape === 'offroad') {
      // rear side pillar, door hinges, side step
      trim.push(boxAt(0.02, s.H - pr.bl - 0.12, 0.08, sx * (halfW(py) + 0.009), py, zB - 0.85, '#e0ddd4'));
      for (const hy of [pr.bl - 0.35, pr.bl - 0.05]) chrome.push(boxAt(0.03, 0.06, 0.05, sx * (W / 2 + 0.01), hy, pr.side[0][0] + 0.02, '#8a8e92'));
      trim.push(boxAt(0.12, 0.03, 0.9, sx * (W / 2 + 0.03), s.cb + 0.05, zB, black));
    }
  }
  // ---- mirrors
  for (const sx of [1, -1]) {
    const mx = sx * (halfW(pr.bl) + 0.07), mz = pr.zw0 - 0.14;
    if (old || s.shape === 'offroad') {
      // small round mirror on a stalk
      chrome.push(boxAt(0.06, 0.018, 0.018, sx * (halfW(pr.bl) + 0.03), pr.bl + 0.06, mz, '#c8ccd0'));
      const m = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12); m.rotateX(Math.PI / 2); m.translate(mx, pr.bl + 0.1, mz);
      chrome.push(paintGeo(m, '#c8ccd0'));
    } else if (old80 || mid) trim.push(boxAt(0.18, 0.11, 0.08, mx, pr.bl + 0.1, mz, dark));
    else bodyExtra.push(boxAt(0.2, 0.12, 0.1, mx, pr.bl + 0.1, mz, '#ffffff'));
  }
  // rain gutters on the old ones
  if (old || old80) for (const sx of [1, -1]) (old ? chrome : trim).push(boxAt(0.015, 0.015, (pr.side[1][0] - pr.side[2][0]) + 0.1, sx * (halfW(s.H - 0.03) + 0.004), s.H - 0.03, (pr.side[1][0] + pr.side[2][0]) / 2, old ? '#c8ccd0' : dark));
  // chrome body side strip (seventies)
  if (old && s.shape !== 'offroad' && s.shape !== 'r4') for (const sx of [1, -1]) chrome.push(boxAt(0.012, 0.018, s.L * 0.78, sx * (W / 2 + 0.004), pr.bl - 0.22, 0, '#d0d4d8'));

  // ---- front: lamps, grille, bumper
  const hy = pr.hf - (old ? 0.06 : 0.09);
  const hx = W / 2 - (s.shape === 'tiny' ? 0.2 : 0.26);
  if (s.shape === 'tiny') {
    for (const sx of [1, -1]) { lf.push(discZ(0.075, 0.05, sx * hx, 0.6, fz - 0.03, '#ffffff')); chrome.push(ringZ(0.078, 0.012, sx * hx, 0.6, fz - 0.005, '#dfe3e6')); }
    chrome.push(boxAt(0.46, 0.035, 0.03, 0, 0.5, fz + 0.005, '#dfe3e6')); // the chrome "moustache"
    chrome.push(boxAt(0.12, 0.08, 0.02, 0, 0.66, fz - 0.06, '#dfe3e6'));   // badge
    for (const sx of [1, -1]) lf.push(boxAt(0.07, 0.035, 0.03, sx * (hx - 0.02), 0.42, fz + 0.005, '#ffd9a0')); // indicators
  } else if (s.shape === 'r4') {
    trim.push(boxAt(W - 0.24, 0.22, 0.04, 0, 0.58, fz + 0.012, '#9aa0a6'));   // full-width grille
    for (let i = 0; i < 6; i++) trim.push(boxAt(W - 0.52, 0.012, 0.012, 0, 0.5 + i * 0.032, fz + 0.035, '#5a5f66'));
    for (const sx of [1, -1]) { lf.push(discZ(0.075, 0.05, sx * (W / 2 - 0.2), 0.6, fz + 0.02, '#ffffff')); chrome.push(ringZ(0.078, 0.012, sx * (W / 2 - 0.2), 0.6, fz + 0.04, '#dfe3e6')); }
  } else if (s.shape === 'offroad') {
    trim.push(boxAt(W * 0.42, 0.34, 0.03, 0, 0.8, fz - 0.035, black));        // recessed mesh grille
    for (let i = 0; i < 7; i++) trim.push(boxAt(0.012, 0.32, 0.012, -W * 0.18 + i * W * 0.06, 0.8, fz - 0.015, '#3a3d42'));
    for (const sx of [1, -1]) { lf.push(discZ(0.088, 0.05, sx * (W / 2 - 0.24), 0.8, fz + 0.005, '#ffffff')); chrome.push(ringZ(0.092, 0.014, sx * (W / 2 - 0.24), 0.8, fz + 0.025, '#b8bcc0')); lf.push(boxAt(0.07, 0.05, 0.03, sx * (W / 2 - 0.24), 0.62, fz + 0.01, '#ffd9a0')); }
  } else if (s.shape === 'boxsedan') {
    trim.push(boxAt(W - 0.3, 0.2, 0.03, 0, 0.6, fz + 0.012, '#1a1b1d'));
    for (let i = 0; i < 5; i++) chrome.push(boxAt(W * 0.38, 0.012, 0.012, 0, 0.53 + i * 0.035, fz + 0.03, '#dfe3e6'));
    for (const sx of [1, -1]) for (const dx of [0.5, 0.33]) { lf.push(discZ(0.068, 0.05, sx * dx, 0.61, fz + 0.02, '#ffffff')); chrome.push(ringZ(0.07, 0.01, sx * dx, 0.61, fz + 0.04, '#dfe3e6')); }
    for (const sx of [1, -1]) lf.push(boxAt(0.12, 0.05, 0.03, sx * (W / 2 - 0.14), 0.42, fz + 0.04, '#ffd9a0'));
  } else if (old80) {
    trim.push(boxAt(W - 0.08, 0.2, 0.03, 0, 0.62, fz + 0.012, '#1a1b1d'));   // slotted plastic front panel
    for (let i = 0; i < 4; i++) trim.push(boxAt(W * 0.36, 0.014, 0.012, -0.08, 0.56 + i * 0.04, fz + 0.03, '#2e3034'));
    for (const sx of [1, -1]) { lf.push(boxAt(0.3, 0.13, 0.03, sx * (W / 2 - 0.22), 0.63, fz + 0.03, '#ffffff')); lf.push(boxAt(0.1, 0.06, 0.03, sx * (W / 2 - 0.1), 0.42, fz + 0.05, '#ffd9a0')); }
  } else if (mid) {
    // big swept-back teardrop lamps, oval grille, grey bumper lower
    for (const sx of [1, -1]) {
      lf.push(boxR(0.4, 0.15, 0.1, sx * (W / 2 - 0.27), hy + 0.01, fz - 0.03, 0, sx * 0.25, sx * -0.08, '#ffffff'));
      lf.push(boxR(0.08, 0.11, 0.26, sx * (halfW(hy) - 0.03), hy, fz - 0.2, 0, 0, 0, '#ffffff'));
    }
    trim.push(boxAt(0.42, 0.1, 0.05, 0, hy - 0.02, fz + 0.01, '#15161a'));
    trim.push(boxAt(W * 0.6, 0.12, 0.06, 0, s.cb + 0.2, fz + 0.03, '#15161a'));
    trim.push(boxAt(W * 0.96, 0.08, 0.12, 0, s.cb + 0.1, fz - 0.03, grey));
  } else {
    // slim lamps with a daytime strip, big trapezoid grille, lower intake with fog lamps
    for (const sx of [1, -1]) {
      lf.push(boxR(0.42, 0.075, 0.1, sx * (W / 2 - 0.28), hy + 0.02, fz - 0.03, 0, sx * 0.28, sx * -0.12, '#ffffff'));
      lf.push(boxR(0.36, 0.016, 0.1, sx * (W / 2 - 0.3), hy - 0.03, fz - 0.02, 0, sx * 0.28, sx * -0.12, '#ffffff'));
      lf.push(discZ(0.035, 0.03, sx * (W / 2 - 0.25), s.cb + 0.2, fz + 0.03, '#ffffff'));
    }
    trim.push(boxAt(W * 0.5, 0.13, 0.05, 0, hy - 0.03, fz + 0.01, '#0f1012'));
    trim.push(boxAt(W * 0.62, 0.14, 0.06, 0, s.cb + 0.22, fz + 0.03, '#0f1012'));
    trim.push(boxAt(0.1, 0.07, 0.02, 0, hy - 0.02, fz + 0.04, '#b4b8bc')); // badge
  }
  // bumpers
  if (old && s.shape !== 'offroad') {
    const by = s.shape === 'tiny' ? s.cb + 0.2 : s.cb + 0.2;
    chrome.push(boxAt(W * 0.94, 0.07, 0.07, 0, by, fz + 0.04, '#dfe3e6'));
    chrome.push(boxAt(W * 0.94, 0.07, 0.07, 0, by, rz - 0.04, '#dfe3e6'));
    for (const sx of [1, -1]) for (const z of [fz + 0.07, rz - 0.07]) chrome.push(boxAt(0.05, 0.14, 0.04, sx * W * 0.28, by + 0.02, z, '#dfe3e6'));
    trim.push(boxAt(W * 0.94, 0.02, 0.075, 0, by, fz + 0.042, black));
  } else if (s.shape === 'offroad') {
    trim.push(boxAt(W + 0.06, 0.13, 0.1, 0, s.cb + 0.12, fz + 0.04, black));
    trim.push(boxAt(W * 0.7, 0.1, 0.08, 0, s.cb + 0.1, rz - 0.04, black));
    chrome.push(boxAt(0.12, 0.05, 0.05, 0, s.cb + 0.03, fz + 0.1, '#6a6e72'));
  } else if (old80) {
    trim.push(boxAt(W * 0.99, 0.16, 0.14, 0, s.cb + 0.16, fz - 0.01, '#2a2c30'));
    trim.push(boxAt(W * 0.99, 0.16, 0.14, 0, s.cb + 0.16, rz + 0.01, '#2a2c30'));
  } else {
    trim.push(boxAt(W * 0.92, neu ? 0.1 : 0.16, 0.12, 0, s.cb + 0.12, fz - 0.03, neu ? '#15161a' : dark));
    trim.push(boxAt(W * 0.92, neu ? 0.12 : 0.18, 0.12, 0, s.cb + 0.14, rz + 0.03, neu ? '#15161a' : dark));
  }
  // plates (old ones white without the blue European band)
  const fpy = s.shape === 'offroad' ? s.cb + 0.3 : s.cb + (old ? 0.34 : 0.3);
  trim.push(boxAt(0.52, 0.115, 0.02, 0, fpy, fz + (old ? 0.09 : 0.075), plate));
  if (!old && !old80) trim.push(boxAt(0.06, 0.1, 0.022, -0.235, fpy, fz + 0.077, eu));
  const rpy = s.shape === 'pickup' ? pr.bl - 0.25 : s.shape === 'van' ? pr.bl - 0.15 : s.shape === 'tiny' ? 0.5 : s.shape === 'offroad' ? s.cb + 0.45 : pr.bl - 0.28;
  trim.push(boxAt(0.52, 0.115, 0.02, 0, rpy, rz - 0.03, plate));
  if (!old && !old80) trim.push(boxAt(0.06, 0.1, 0.022, 0.235, rpy, rz - 0.032, eu));

  // ---- rear lamps
  for (const sx of [1, -1]) {
    if (s.shape === 'tiny') { lr.push(discZ(0.045, 0.04, sx * (W / 2 - 0.16), 0.66, rz + 0.02, '#ffffff')); lr.push(discZ(0.035, 0.04, sx * (W / 2 - 0.16), 0.56, rz + 0.02, '#ffffff')); }
    else if (s.shape === 'offroad') lr.push(boxAt(0.1, 0.18, 0.05, sx * (W / 2 - 0.12), s.cb + 0.55, rz - 0.02, '#ffffff'));
    else if (s.shape === 'r4') lr.push(boxAt(0.1, 0.16, 0.05, sx * (W / 2 - 0.1), pr.bl - 0.2, rz - 0.02, '#ffffff'));
    else if (old) lr.push(boxAt(0.34, 0.1, 0.05, sx * (W / 2 - 0.24), pr.bl - 0.14, rz - 0.03, '#ffffff'));
    else if (old80) lr.push(boxAt(0.3, 0.14, 0.05, sx * (W / 2 - 0.2), pr.bl - 0.12, rz - 0.035, '#ffffff'));
    else if (mid) {
      const ty = s.shape === 'van' ? pr.bl - 0.1 : pr.bl - 0.02;
      lr.push(boxAt(0.14, s.shape === 'van' ? 0.4 : 0.3, 0.08, sx * (W / 2 - 0.12), ty, rz - 0.03, '#ffffff'));
    } else {
      const ty = s.shape === 'van' ? pr.bl - 0.1 : s.shape === 'pickup' ? pr.bl - 0.1 : pr.bl - 0.08;
      lr.push(boxAt(0.42, s.shape === 'van' ? 0.35 : 0.085, 0.08, sx * (W / 2 - 0.24), ty, rz - 0.035, '#ffffff'));
      lr.push(boxAt(0.05, 0.07, 0.3, sx * (halfW(ty) + 0.002), ty, rz + 0.14, '#ffffff'));
    }
  }
  if (neu && s.shape !== 'van') lr.push(boxAt(W * 0.44, 0.018, 0.04, 0, pr.bl - 0.06, rz - 0.04, '#ffffff')); // light bar across the tailgate

  // ---- shape extras
  if (s.shape === 'suv' && neu) {
    for (const sx of [1, -1]) trim.push(boxAt(0.05, 0.05, s.L * 0.55, sx * (halfW(s.H) - 0.12), s.H + 0.03, -0.1, '#1a1b1d'));
    // black wheel-arch cladding: a half ring round each arch, on both sides
    for (const za of [pr.zfa, pr.zra]) for (const sx of [1, -1]) {
      const ra = s.wr + 0.07;
      const g = new THREE.RingGeometry(ra - 0.005, ra + 0.075, 14, 1, 0, Math.PI);
      g.scale(1, 0.92, 1);
      g.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(sx * (W / 2 + 0.012), s.wr, za);
      trim.push(paintGeo(g, '#141517'));
    }
  }
  if (s.shape === 'suv' && !neu) for (const sx of [1, -1]) trim.push(boxAt(0.05, 0.05, s.L * 0.55, sx * (halfW(s.H) - 0.12), s.H + 0.03, -0.1, '#1a1b1d'));
  if (s.shape === 'pickup') {
    trim.push(boxAt(W - 0.2, 0.05, (pr.zroof - rz) - 0.25, 0, pr.bl - 0.35, (pr.zroof + rz) / 2 - 0.05, '#232426'));
    trim.push(boxAt(W - 0.06, 0.06, 0.08, 0, pr.bl + 0.03, rz + 0.06, '#1a1b1d'));
  }
  if (s.shape === 'tiny') {
    for (let i = 0; i < 6; i++) trim.push(boxAt(W * 0.36, 0.012, 0.02, 0, 0.72 + i * 0.03, -1.52 + i * 0.03 * 0.95, '#1d1e21')); // engine-lid louvres
    chrome.push(boxAt(0.18, 0.03, 0.02, 0, 0.9, -1.43, '#dfe3e6'));
  }
  if (s.shape === 'offroad') {
    // spare wheel on the bonnet, roof rack
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18); tyre.translate(0, 1.2, fz - 0.55);
    trim.push(paintGeo(tyre, '#161616'));
    const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.21, 14); rim.translate(0, 1.2, fz - 0.55);
    trim.push(paintGeo(rim, '#e8e6e0'));
    for (const sx of [1, -1]) trim.push(boxAt(0.04, 0.04, s.L * 0.62, sx * (W / 2 - 0.12), s.H + 0.12, -0.3, '#2a2c30'));
    for (let i = 0; i < 5; i++) trim.push(boxAt(W - 0.24, 0.03, 0.04, 0, s.H + 0.12, -0.3 - s.L * 0.3 + i * s.L * 0.15, '#2a2c30'));
    for (const sx of [1, -1]) for (const z of [-1.3, 0.6]) trim.push(boxAt(0.04, 0.12, 0.04, sx * (W / 2 - 0.12), s.H + 0.06, z, '#2a2c30'));
  }

  // ---- roof extra (light bar / taxi sign)
  if (s.livery === 'local' || s.livery === 'gc') extra.push(boxAt(1.1, 0.1, 0.28, 0, s.H + 0.08, -0.15, '#ffffff'));
  else if (s.livery === 'taxi') extra.push(boxAt(0.36, 0.14, 0.16, 0, s.H + 0.08, -0.1, '#ffffff'));

  body = mergeList([body, ...bodyExtra]);
  // livery id for the body shader (crisp bands whatever the triangulation): 1 local police, 2 guardia civil, 3 taxi
  const liv = { local: 1, gc: 2, taxi: 3 }[s.livery] || 0;
  body.setAttribute('aLiv', new THREE.Float32BufferAttribute(new Float32Array(body.attributes.position.count).fill(liv), 1));
  const wheels = [[1, pr.zfa], [-1, pr.zfa], [1, pr.zra], [-1, pr.zra]].map(([sx, z]) => new THREE.Vector3(sx * (W / 2 - (s.shape === 'offroad' ? 0.16 : 0.2)), s.wr, z));
  return {
    body, glass: mergeList(glass), trim: mergeList(trim), chrome: chrome.length ? mergeList(chrome) : null, lightF: mergeList(lf), lightR: mergeList(lr),
    extra: extra.length ? mergeList(extra) : null, wheels, wheelR: s.wr, wheelW: s.shape === 'tiny' ? 0.17 : old || old80 ? 0.19 : s.shape === 'offroad' ? 0.24 : 0.24,
    seat: new THREE.Vector3(0.38, pr.bl - 0.35, (pr.zw0 + pr.zroof) / 2 - 0.1), door: new THREE.Vector3(W / 2 + 0.55, 0, pr.zw0 - 0.55),
    headPos: [new THREE.Vector3(0.6, pr.hf - 0.09, fz), new THREE.Vector3(-0.6, pr.hf - 0.09, fz)],
    tailPos: [new THREE.Vector3(W / 2 - 0.2, pr.bl - 0.08, rz), new THREE.Vector3(-(W / 2 - 0.2), pr.bl - 0.08, rz)],
    exhaust: new THREE.Vector3(-0.45, s.cb + 0.05, rz - 0.05),
    cabin: { bl: pr.bl, zw0: pr.zw0, zw1: pr.zw1, zroof: pr.zroof, H: s.H, W: s.W, halfW }, // for the view from inside
  };
}

// a 125 cc motorbike: painted tank and tail, black seat and engine, chrome exhaust and forks, a round headlamp
function buildMoto(spec) {
  const body = [], trim = [], chrome = [], lf = [], lr = [];
  const P = '#ffffff', K = '#1a1b1d';
  const tube = (list, a, b, r, color) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, 8); g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); list.push(paintGeo(g, color)); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  body.push(boxAt(0.3, 0.26, 0.62, 0, 0.8, 0.12, P));          // tank
  body.push(boxAt(0.26, 0.18, 0.5, 0, 0.84, -0.5, P));         // tail
  body.push(boxAt(0.34, 0.22, 0.2, 0, 0.62, 0.66, P));          // front mudguard
  body.push(boxAt(0.28, 0.3, 0.2, 0, 0.98, 0.52, P));           // headlamp cowl
  trim.push(boxAt(0.28, 0.09, 0.6, 0, 0.95, -0.24, K));         // seat
  trim.push(boxAt(0.26, 0.28, 0.4, 0, 0.44, -0.04, '#2b2c2f')); // engine
  trim.push(boxAt(0.7, 0.035, 0.035, 0, 1.12, 0.46, K));        // handlebar
  for (const sx of [1, -1]) { trim.push(boxAt(0.05, 0.05, 0.12, sx * 0.34, 1.12, 0.46, K)); trim.push(boxAt(0.14, 0.03, 0.05, sx * 0.2, 0.34, -0.12, K)); }
  for (const sx of [1, -1]) tube(chrome, V(sx * 0.09, 0.3, 0.66), V(sx * 0.09, 1.1, 0.46), 0.022, '#c8ccd0'); // forks
  for (const sx of [1, -1]) tube(chrome, V(sx * 0.12, 0.34, -0.62), V(sx * 0.12, 0.84, -0.3), 0.02, '#8a8e92'); // rear shocks
  tube(chrome, V(0.16, 0.3, 0.1), V(0.18, 0.38, -0.78), 0.045, '#c8ccd0');                   // exhaust
  lf.push(boxAt(0.16, 0.16, 0.04, 0, 0.98, 0.64, P));
  lr.push(boxAt(0.14, 0.06, 0.04, 0, 0.86, -0.76, P));
  return {
    body: mergeList(body), trim: mergeList(trim), chrome: mergeList(chrome), lightF: mergeList(lf), lightR: mergeList(lr),
    wheels: [V(0, 0.3, 0.66), V(0, 0.3, 0.66), V(0, 0.3, -0.64), V(0, 0.3, -0.64)], wheelRs: [0.3, 0.3, 0.3, 0.3], wheelWs: [0.12, 0.12, 0.14, 0.14], wheelR: 0.3, wheelW: 0.13,
    seat: V(0, 0.95, -0.22), door: V(0.75, 0, -0.1),
    headPos: [V(0, 0.98, 0.67), V(0, 0.98, 0.67)], tailPos: [V(0, 0.86, -0.78), V(0, 0.86, -0.78)], exhaust: V(0.18, 0.38, -0.8),
    twoWheel: true,
  };
}
// a town bicycle: painted frame, saddle, handlebar, crank and pedals
function buildBici(spec) {
  const body = [], trim = [], chrome = [], lf = [], lr = [];
  const P = '#ffffff', K = '#1a1b1d';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = (list, a, b, r, color) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, 7); g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); list.push(paintGeo(g, color)); };
  const bb = V(0, 0.36, 0), seatT = V(0, 0.86, -0.18), head = V(0, 0.88, 0.36), rear = V(0, 0.34, -0.5), front = V(0, 0.34, 0.52);
  tube(body, bb, seatT, 0.022, P); tube(body, seatT, head, 0.02, P); tube(body, bb, head, 0.024, P);
  for (const sx of [1, -1]) { tube(body, V(sx * 0.05, 0.36, 0), V(sx * 0.06, 0.34, -0.5), 0.012, P); tube(body, V(sx * 0.04, 0.86, -0.18), V(sx * 0.06, 0.34, -0.5), 0.011, P); tube(chrome, V(sx * 0.05, 0.88, 0.37), V(sx * 0.05, 0.34, 0.52), 0.012, '#c8ccd0'); }
  tube(chrome, seatT, V(0, 0.96, -0.2), 0.012, '#c8ccd0');
  trim.push(boxAt(0.14, 0.05, 0.26, 0, 0.98, -0.2, K));               // saddle
  tube(chrome, head, V(0, 1.02, 0.34), 0.014, '#c8ccd0');
  trim.push(boxAt(0.58, 0.028, 0.028, 0, 1.02, 0.33, K));              // handlebar
  for (const sx of [1, -1]) trim.push(boxAt(0.05, 0.04, 0.09, sx * 0.29, 1.02, 0.33, '#3a2a1e'));
  const crank = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16); crank.rotateZ(Math.PI / 2); crank.translate(0.06, 0.36, 0); chrome.push(paintGeo(crank, '#8a8e92'));
  for (const sx of [1, -1]) trim.push(boxAt(0.1, 0.02, 0.05, sx * 0.13, 0.36 + sx * 0.12, sx * 0.05, K)); // pedals
  body.push(boxAt(0.1, 0.02, 0.3, 0, 0.62, -0.44, P));                // rear mudguard
  lr.push(boxAt(0.05, 0.04, 0.02, 0, 0.66, -0.6, P));
  lf.push(boxAt(0.06, 0.06, 0.03, 0, 0.92, 0.42, P));
  return {
    body: mergeList(body), trim: mergeList(trim), chrome: mergeList(chrome), lightF: mergeList(lf), lightR: mergeList(lr),
    wheels: [front, front.clone(), rear, rear.clone()], wheelRs: [0.34, 0.34, 0.34, 0.34], wheelWs: [0.04, 0.04, 0.045, 0.045], wheelR: 0.34, wheelW: 0.04,
    seat: V(0, 0.98, -0.2), door: V(0.6, 0, -0.05),
    headPos: [V(0, 0.92, 0.44), V(0, 0.92, 0.44)], tailPos: [V(0, 0.66, -0.62), V(0, 0.66, -0.62)], exhaust: V(0, 0.36, -0.2),
    twoWheel: true, pedal: true,
  };
}

function buildTractor(spec) {
  const body = [], glass = [], trim = [], lf = [], lr = [];
  const P = '#ffffff';
  // engine hood & chassis (paint)
  body.push(boxAt(0.86, 0.72, 1.9, 0, 1.18, 1.05, P));
  body.push(boxAt(0.9, 0.2, 0.2, 0, 1.52, 1.95, P));
  body.push(boxAt(0.7, 0.35, 2.6, 0, 0.72, 0.4, P));
  // rear fenders
  for (const sx of [1, -1]) {
    const f = new THREE.CylinderGeometry(0.9, 0.9, 0.55, 14, 1, true, -Math.PI / 2, Math.PI);
    f.rotateZ(Math.PI / 2);
    f.translate(sx * 0.98, 0.78, -0.62);
    body.push(paintGeo(f, P));
    body.push(boxAt(0.55, 0.06, 1.2, sx * 0.98, 1.6, -0.62, P));
  }
  // cabin posts & roof
  for (const sx of [1, -1]) for (const z of [0.05, -1.2]) trim.push(boxAt(0.07, 1.3, 0.07, sx * 0.72, 2.1, z, '#1a1b1d'));
  body.push(boxAt(1.62, 0.1, 1.5, 0, 2.8, -0.55, P));
  trim.push(boxAt(1.4, 0.18, 1.2, 0, 1.52, -0.55, '#2b2c2f'));
  trim.push(boxAt(0.5, 0.5, 0.5, 0, 1.85, -0.9, '#2b2c2f')); // seat
  // glass box
  for (const sx of [1, -1]) glass.push(boxAt(0.02, 1.15, 1.2, sx * 0.72, 2.12, -0.57, P));
  glass.push(boxAt(1.42, 1.15, 0.02, 0, 2.12, 0.06, P));
  glass.push(boxAt(1.42, 1.0, 0.02, 0, 2.2, -1.2, P));
  // grille, exhaust, weights
  trim.push(boxAt(0.8, 0.5, 0.05, 0, 1.2, 2.02, '#1a1b1d'));
  trim.push(boxAt(0.1, 1.1, 0.1, -0.3, 2.0, 1.55, '#2b2c2f'));
  trim.push(boxAt(0.8, 0.3, 0.3, 0, 0.62, 2.1, '#3a3b3e'));
  trim.push(boxAt(0.5, 0.12, 0.02, 0, 0.9, -1.35, '#f4f4f0'));
  // lights
  for (const sx of [1, -1]) lf.push(boxAt(0.16, 0.12, 0.05, sx * 0.3, 1.45, 2.03, P));
  for (const sx of [1, -1]) lf.push(boxAt(0.16, 0.12, 0.05, sx * 0.6, 2.72, 0.12, P));
  for (const sx of [1, -1]) lr.push(boxAt(0.14, 0.1, 0.05, sx * 0.95, 1.4, -1.38, P));
  const extra = [boxAt(0.18, 0.14, 0.18, 0, 2.93, -0.6, P)]; // amber beacon
  return {
    body: mergeList(body), glass: mergeList(glass), trim: mergeList(trim), lightF: mergeList(lf), lightR: mergeList(lr), extra: mergeList(extra),
    wheels: [new THREE.Vector3(0.8, 0.46, 1.55), new THREE.Vector3(-0.8, 0.46, 1.55), new THREE.Vector3(0.98, 0.78, -0.62), new THREE.Vector3(-0.98, 0.78, -0.62)],
    wheelRs: [0.46, 0.46, 0.78, 0.78], wheelWs: [0.28, 0.28, 0.48, 0.48], wheelR: 0.78, wheelW: 0.45,
    seat: new THREE.Vector3(0, 1.9, -0.8), door: new THREE.Vector3(1.6, 0, -0.2),
    headPos: [new THREE.Vector3(0.3, 1.45, 2.05), new THREE.Vector3(-0.3, 1.45, 2.05)],
    tailPos: [new THREE.Vector3(0.95, 1.4, -1.4), new THREE.Vector3(-0.95, 1.4, -1.4)],
    exhaust: new THREE.Vector3(-0.3, 2.6, 1.55),
    tractor: true,
  };
}


// ---------------------------------------------------------------- wheels
// unit wheel (radius 1, width 1, axis along x): a tyre with sidewall bulge and tread, and a rim in one of the styles
// seen on the street: black steel with a small cap, silver steel with a chrome dome (sixties), full chrome or plastic
// hubcaps, white steel (old 4x4), and 10-spoke / 5-spoke / dark alloys. Two geometries: tyre (rubber) and rim (metal).
function wheelParts(style) {
  const tyreP = [], rimP = [];
  const tractor = style === 'tractor';
  const spoke = style === 'spoke';
  const prof = tractor
    ? [[0.62, -0.5], [0.95, -0.5], [1.0, -0.4], [1.0, 0.4], [0.95, 0.5], [0.62, 0.5]]
    : spoke ? [[0.88, -0.5], [0.96, -0.46], [1.0, -0.22], [1.0, 0.22], [0.96, 0.46], [0.88, 0.5]]
    : [[0.64, -0.46], [0.86, -0.5], [0.97, -0.44], [1.0, -0.3], [1.0, 0.3], [0.97, 0.44], [0.86, 0.5], [0.64, 0.46]];
  const tyre = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), tractor ? 20 : 22);
  tyre.rotateZ(Math.PI / 2);
  tyreP.push(paintGeo(tyre, '#141414'));
  // tread blocks
  const nT = tractor ? 18 : spoke ? 0 : 26;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * TAU;
    const lug = tractor ? new THREE.BoxGeometry(0.9, 0.12, 0.2) : new THREE.BoxGeometry(0.55, 0.035, 0.1);
    if (tractor) lug.rotateX(0.5);
    lug.translate(0, tractor ? 1.02 : 1.005, 0);
    lug.rotateX(a);
    tyreP.push(paintGeo(lug, '#111111'));
  }
  const face = (sx, r, color, z = 0.0) => { const d = new THREE.CircleGeometry(r, 22); d.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2); d.translate(sx * (0.44 + z), 0, 0); return paintGeo(d, color); };
  const barrel = new THREE.CylinderGeometry(spoke ? 0.87 : 0.64, spoke ? 0.87 : 0.64, spoke ? 0.5 : 0.88, 22, 1, true); barrel.rotateZ(Math.PI / 2);
  rimP.push(paintGeo(barrel, spoke ? '#b8bcc0' : '#5a5e63'));
  const spokes = (sx, n, w, len, color, r0 = 0.2, twist = 0) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + twist;
      const sp = new THREE.BoxGeometry(0.06, len, w);
      sp.translate(0, r0 + len / 2, 0);
      sp.rotateX(a);
      sp.translate(sx * 0.47, 0, 0);
      rimP.push(paintGeo(sp, color));
    }
  };
  const hub = (sx, r, color, d = 0.06) => { const h = new THREE.CylinderGeometry(r, r * 0.9, d, 14); h.rotateZ(sx > 0 ? -Math.PI / 2 : Math.PI / 2); h.translate(sx * (0.47 + d / 2), 0, 0); rimP.push(paintGeo(h, color)); };
  const nuts = (sx, n, r, color) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const nb = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6); nb.rotateZ(Math.PI / 2); nb.translate(sx * 0.49, Math.cos(a) * r, Math.sin(a) * r); rimP.push(paintGeo(nb, color)); } };
  for (const sx of [1, -1]) {
    if (spoke) {
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + sx * 0.1; const sp = new THREE.BoxGeometry(0.02, 0.8, 0.02); sp.translate(0, 0.46, 0); sp.rotateX(a); sp.translate(sx * 0.12, 0, 0); rimP.push(paintGeo(sp, '#d0d4d8')); }
      hub(sx, 0.08, '#9aa0a4', 0.12);
    } else if (tractor) {
      rimP.push(face(sx, 0.64, '#e0b21e'));
      spokes(sx, 5, 0.13, 0.5, '#caa018', 0.12);
      hub(sx, 0.16, '#6d7176');
    } else if (style === 'steel' || style === 'white') {
      const c = style === 'white' ? '#e8e6e0' : '#2a2c30';
      rimP.push(face(sx, 0.64, c));
      // ventilation slots between the centre and the rim
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const sl = new THREE.BoxGeometry(0.02, 0.1, 0.06); sl.translate(0, 0.44, 0); sl.rotateX(a); sl.translate(sx * 0.45, 0, 0); rimP.push(paintGeo(sl, '#0c0c0d')); }
      hub(sx, style === 'white' ? 0.22 : 0.14, style === 'white' ? '#d8d6d0' : '#b8bcc0', 0.07);
      nuts(sx, style === 'white' ? 5 : 4, 0.26, '#7a7e82');
    } else if (style === 'steelCap') {
      rimP.push(face(sx, 0.64, '#c4c8cc'));
      const dome = new THREE.SphereGeometry(0.36, 16, 8, 0, TAU, 0, Math.PI / 2); dome.rotateZ(sx > 0 ? -Math.PI / 2 : Math.PI / 2); dome.scale(0.45, 1, 1); dome.translate(sx * 0.46, 0, 0);
      rimP.push(paintGeo(dome, '#eef0f2'));
    } else if (style === 'hubcapOld') {
      rimP.push(face(sx, 0.66, '#dfe3e6'));
      const ringG = new THREE.TorusGeometry(0.5, 0.04, 6, 22); ringG.rotateY(Math.PI / 2); ringG.translate(sx * 0.46, 0, 0); rimP.push(paintGeo(ringG, '#f4f6f8'));
      hub(sx, 0.18, '#f0f2f4', 0.08);
    } else if (style === 'hubcap') {
      rimP.push(face(sx, 0.66, '#b8bcc2'));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const sl = new THREE.BoxGeometry(0.02, 0.22, 0.05); sl.translate(0, 0.42, 0); sl.rotateX(a); sl.translate(sx * 0.46, 0, 0); rimP.push(paintGeo(sl, '#2a2c30')); }
      hub(sx, 0.15, '#9aa0a6', 0.05);
    } else if (style === 'alloy') {
      rimP.push(face(sx, 0.64, '#16171a', -0.06));
      spokes(sx, 10, 0.07, 0.46, '#c8ccd2', 0.16);
      hub(sx, 0.17, '#b4b8be', 0.06);
      nuts(sx, 5, 0.1, '#e0e2e4');
    } else if (style === 'alloyDark') {
      rimP.push(face(sx, 0.64, '#0d0e10', -0.06));
      spokes(sx, 5, 0.09, 0.46, '#3a3d42', 0.16, 0.08);
      spokes(sx, 5, 0.09, 0.46, '#3a3d42', 0.16, -0.08);
      hub(sx, 0.17, '#2a2c30', 0.06);
    } else { // alloy5
      rimP.push(face(sx, 0.64, '#16171a', -0.06));
      spokes(sx, 5, 0.15, 0.46, '#d5d9de', 0.14);
      hub(sx, 0.16, '#a8adb3', 0.06);
      nuts(sx, 5, 0.1, '#e0e2e4');
    }
  }
  const t = mergeList(tyreP), r = mergeList(rimP);
  t.computeBoundingSphere(); r.computeBoundingSphere();
  return { tyre: t, rim: r };
}
export const WHEEL_STYLES = ['steel', 'white', 'steelCap', 'hubcapOld', 'hubcap', 'alloy', 'alloy5', 'alloyDark', 'tractor', 'spoke'];

// paint wear on the body: sun-faded and chalky paint, road dust low on the sides, dull clearcoat, rust at the edges
function wearBody(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWear;\nattribute float aLiv;\nvarying float vWear;\nvarying float vLiv;\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWear = aWear; vLiv = aLiv; vOP = position; vON = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vWear; varying float vLiv; varying vec3 vOP; varying vec3 vON;
float wh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float wn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wh(i), wh(i + vec3(1,0,0)), f.x), mix(wh(i + vec3(0,1,0)), wh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wh(i + vec3(0,0,1)), wh(i + vec3(1,0,1)), f.x), mix(wh(i + vec3(0,1,1)), wh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (vLiv > 0.5) {
    float sd = step(0.55, abs(vON.x)), y = vOP.y, z = vOP.z;
    vec3 blue = vec3(0.06, 0.16, 0.5), yel = vec3(0.92, 0.72, 0.04), grn = vec3(0.05, 0.3, 0.13);
    if (vLiv < 1.5) {        // Policía Local: blue and yellow chequered band, blue line above
      float chk = mod(floor((z + 5.0) / 0.3) + floor(y / 0.1), 2.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(yel, blue, chk), sd * step(0.52, y) * step(y, 0.72));
      diffuseColor.rgb = mix(diffuseColor.rgb, blue, sd * step(0.72, y) * step(y, 0.78));
    } else if (vLiv < 2.5) { // Guardia Civil: green band with a yellow line, green noses
      diffuseColor.rgb = mix(diffuseColor.rgb, grn, sd * step(0.6, y) * step(y, 0.88));
      diffuseColor.rgb = mix(diffuseColor.rgb, yel, sd * step(0.88, y) * step(y, 0.93));
      diffuseColor.rgb = mix(diffuseColor.rgb, grn, (1.0 - sd) * step(0.62, y) * step(y, 0.84) * step(1.9, abs(z)));
    } else {                 // taxi: a green stripe along the doors
      diffuseColor.rgb = mix(diffuseColor.rgb, grn * 1.4, sd * step(0.66, y) * step(y, 0.72) * step(-1.2, z) * step(z, 1.6));
    }
  }
  float wear = vWear${STYLE.plastilina ? ' * 0.0' : ''}; // (claymation: a clay car is never rusty nor faded)
  float n1 = wn(vOP * 3.1), n2 = wn(vOP * 11.0 + 7.0);
  // sun: faded, chalky on the flat tops
  float top = smoothstep(0.55, 0.95, vON.y);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * 1.05 + 0.05, wear * (0.28 + 0.3 * top));
  // dust and dried mud low on the body
  float low = 1.0 - smoothstep(0.12, 0.62, vOP.y);
  float dust = clamp(low * (0.45 + 0.8 * n1) * (0.25 + wear), 0.0, 1.0) * 0.85 + top * wear * 0.25 * n2;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.41, 0.32), dust * 0.75);
  // rust at the sills, arch lips and panel edges of the old ones
  float edge = low * 0.45 + (1.0 - abs(vON.x)) * 0.12;
  float rust = smoothstep(0.66, 0.8, n2 * 0.6 + n1 * 0.4 + edge * 0.5) * smoothstep(0.62, 0.95, wear);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.33, 0.14, 0.06), vec3(0.2, 0.1, 0.05), n2), rust);
  float wearRough = wear * 0.55 + dust * 0.5 + rust;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = min(1.0, roughnessFactor + wearRough);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  #ifdef USE_CLEARCOAT\n  material.clearcoat *= clamp(1.0 - wearRough * 1.3, 0.0, 1.0);\n  #endif');
  };
  mat.customProgramCacheKey = () => 'carwear2';
}

// ---------------------------------------------------------------- instanced renderer
const PARTS = ['body', 'glass', 'trim', 'chrome', 'lightF', 'lightR', 'extra'];
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const wearHash = (x, z) => { const s = Math.sin(Math.round(x * 7) * 12.9898 + Math.round(z * 7) * 78.233) * 43758.5453; return s - Math.floor(s); };
export class VehicleRenderer {
  constructor(scene, capacity = 140) {
    this.scene = scene;
    this.capacity = capacity;
    this.mats = {
      body: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x06090d, roughness: 0.06, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }),
      trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }),
      chrome: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 1 }),
      lightF: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
      lightR: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
      extra: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
      tyre: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
      rim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75 }),
    };
    wearBody(this.mats.body);
    if (STYLE.plastilina) { // (claymation: painted clay, not lacquer; the windows a pale painted blue with a gleam)
      const M = this.mats;
      M.body.clearcoat = 0; M.body.roughness = 0.5; M.body.metalness = 0;
      M.glass.color.set(0x7d98ad); M.glass.roughness = 0.18; M.glass.clearcoat = 0.4;
      M.chrome.roughness = 0.4; M.rim.roughness = 0.45; M.trim.roughness = 0.6;
    }
    this.models = {};
    for (const key in MODELS) {
      const spec = MODELS[key];
      const geo = spec.shape === 'tractor' ? buildTractor(spec) : spec.shape === 'moto' ? buildMoto(spec) : spec.shape === 'bici' ? buildBici(spec) : buildCar(spec);
      if (geo.body) geo.body.setAttribute('aWear', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
      const m = { key, spec, geo, meshes: {}, slots: [], count: 0, wheel: spec.shape === 'tractor' ? 'tractor' : spec.wheel || 'alloy5' };
      for (const part of PARTS) {
        if (!geo[part]) continue;
        const im = new THREE.InstancedMesh(geo[part], this.mats[part], capacity);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = part === 'body' || part === 'trim';
        im.receiveShadow = part === 'body';
        if (part !== 'glass') { im.setColorAt(0, new THREE.Color(1, 1, 1)); }
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(im);
        m.meshes[part] = im;
      }
      this.models[key] = m;
    }
    // one instanced tyre + rim pair per wheel style
    this.wheelSets = {};
    for (const style of WHEEL_STYLES) {
      const users = Object.values(this.models).filter((m) => m.wheel === style).length;
      if (!users) continue;
      const g = wheelParts(style), cap = style === 'tractor' ? 40 : Math.min(capacity * 4 * 3, capacity * 4 * users);
      const tyre = new THREE.InstancedMesh(g.tyre, this.mats.tyre, cap), rim = new THREE.InstancedMesh(g.rim, this.mats.rim, cap);
      for (const w of [tyre, rim]) { w.count = 0; w.frustumCulled = false; w.castShadow = w === tyre; w.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(w); }
      this.wheelSets[style] = { tyre, rim, slots: [], cap };
    }
    this.tmpM = new THREE.Matrix4();
    this.dirty = true;
  }
  alloc(v) {
    const m = this.models[v.model];
    if (m.count >= this.capacity) return false;
    const ws = this.wheelSets[m.wheel];
    if (ws.slots.length * 4 >= ws.cap) return false;
    const i = m.count++;
    m.slots[i] = v;
    v.slot = i;
    for (const p in m.meshes) m.meshes[p].count = m.count;
    v.wheelSlot = ws.slots.length;
    ws.slots.push(v);
    ws.tyre.count = ws.rim.count = ws.slots.length * 4;
    this.setColor(v, v.color);
    this.setWear(v);
    this.setLights(v, 0, 0, 0);
    this.changed = true; // (slots given out or taken back: see fleet's flush)
    return true;
  }
  setWear(v) {
    const m = this.models[v.model], a = m.geo.body && m.geo.body.attributes.aWear;
    if (!a || v.slot < 0) return;
    const r = ERA_WEAR[m.spec.era || 'new'] || [0, 0.2];
    if (v.wear === undefined) v.wear = r[0] + (r[1] - r[0]) * (v.parked || v.sleeping ? wearHash(v.x, v.z) : Math.random());
    a.setX(v.slot, v.wear);
    a.needsUpdate = true;
  }
  free(v) {
    if (v.slot < 0) return;
    const m = this.models[v.model];
    const last = m.count - 1;
    const wa = m.geo.body && m.geo.body.attributes.aWear;
    if (v.slot !== last) {
      const o = m.slots[last];
      m.slots[v.slot] = o;
      o.slot = v.slot;
      // copy matrix, colours and wear of last into the freed slot
      for (const p in m.meshes) {
        const im = m.meshes[p];
        im.getMatrixAt(last, this.tmpM); im.setMatrixAt(v.slot, this.tmpM);
        if (im.instanceColor) { const c = new THREE.Color(); im.getColorAt(last, c); im.setColorAt(v.slot, c); }
      }
      if (wa) { wa.setX(v.slot, wa.getX(last)); wa.needsUpdate = true; }
    }
    m.slots.length = last;
    m.count = last;
    for (const p in m.meshes) { m.meshes[p].count = m.count; m.meshes[p].instanceMatrix.needsUpdate = true; if (m.meshes[p].instanceColor) m.meshes[p].instanceColor.needsUpdate = true; }
    v.slot = -1;
    // wheels
    const ws = this.wheelSets[m.wheel];
    const wl = ws.slots.length - 1;
    if (v.wheelSlot !== wl) {
      const o = ws.slots[wl];
      ws.slots[v.wheelSlot] = o;
      for (const W of [ws.tyre, ws.rim]) for (let k = 0; k < 4; k++) { W.getMatrixAt(wl * 4 + k, this.tmpM); W.setMatrixAt(v.wheelSlot * 4 + k, this.tmpM); }
      o.wheelSlot = v.wheelSlot;
    }
    ws.slots.length = wl;
    ws.tyre.count = ws.rim.count = ws.slots.length * 4;
    ws.tyre.instanceMatrix.needsUpdate = true; ws.rim.instanceMatrix.needsUpdate = true;
    v.wheelSlot = -1;
    this.changed = true;
  }
  setColor(v, color) {
    const m = this.models[v.model];
    const c = color.isColor ? color : new THREE.Color(color);
    m.meshes.body.setColorAt(v.slot, c);
    m.meshes.body.instanceColor.needsUpdate = true;
    if (m.meshes.trim) { m.meshes.trim.setColorAt(v.slot, new THREE.Color(1, 1, 1)); m.meshes.trim.instanceColor.needsUpdate = true; }
  }
  // front: 0 off .. 1 on; rear: 0 off, 0.5 night, 1 brake; extra: flash phase (-1..1)
  setLights(v, front, rear, extra, extraKind = null) {
    const m = this.models[v.model];
    const c = new THREE.Color();
    c.setRGB(0.55 + front * 3.2, 0.55 + front * 3.0, 0.5 + front * 2.6);
    m.meshes.lightF.setColorAt(v.slot, c); m.meshes.lightF.instanceColor.needsUpdate = true;
    const rr = rear;
    c.setRGB(0.28 + rr * 2.6, 0.02 + rr * 0.08, 0.02 + rr * 0.05);
    m.meshes.lightR.setColorAt(v.slot, c); m.meshes.lightR.instanceColor.needsUpdate = true;
    if (m.meshes.extra) {
      const k = extraKind || m.spec.livery;
      if (k === 'local' || k === 'gc') {
        const on = extra;
        c.setRGB(0.1 + (on > 0 ? on * 0.4 : 0), 0.15 + (on > 0 ? on * 0.8 : 0), 0.45 + Math.abs(on) * 3.5);
      } else if (k === 'taxi') c.setRGB(0.2 + extra * 0.3, 0.8 + extra * 2.4, 0.3 + extra * 0.6);
      else c.setRGB(1.0 + Math.max(0, extra) * 3, 0.55 + Math.max(0, extra) * 1.6, 0.05);
      m.meshes.extra.setColorAt(v.slot, c); m.meshes.extra.instanceColor.needsUpdate = true;
    }
  }
  write(v, matrix) {
    const m = this.models[v.model];
    for (const p in m.meshes) m.meshes[p].setMatrixAt(v.slot, p === 'glass' && v.hideGlass ? ZERO_M : matrix); // from inside you look through
    this.dirty = true;
  }
  writeWheel(v, k, matrix) {
    const ws = this.wheelSets[this.models[v.model].wheel];
    ws.tyre.setMatrixAt(v.wheelSlot * 4 + k, matrix);
    ws.rim.setMatrixAt(v.wheelSlot * 4 + k, matrix);
  }
  flush() {
    for (const k in this.models) for (const p in this.models[k].meshes) { const a = this.models[k].meshes[p].instanceMatrix; a.clearUpdateRanges(); a.needsUpdate = true; }
    for (const st in this.wheelSets) for (const w of [this.wheelSets[st].tyre, this.wheelSets[st].rim]) { w.instanceMatrix.clearUpdateRanges(); w.instanceMatrix.needsUpdate = true; }
    this.changed = false;
  }
  // only one car's matrices to the GPU (the others keep their last pose: claymation)
  flushOnly(v) {
    if (!v || v.slot < 0) return;
    const m = this.models[v.model];
    for (const p in m.meshes) { const a = m.meshes[p].instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(v.slot * 16, 16); a.needsUpdate = true; }
    const ws = this.wheelSets[m.wheel];
    if (ws && v.wheelSlot >= 0) for (const w of [ws.tyre, ws.rim]) { const a = w.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(v.wheelSlot * 64, 64); a.needsUpdate = true; }
  }
  info(model) { return this.models[model].geo; }
}

// ---------------------------------------------------------------- vehicle
let VID = 1;
export class Vehicle {
  constructor(model, x, z, heading, color) {
    this.id = VID++;
    this.model = model;
    this.spec = MODELS[model];
    this.color = color || this.spec.colors[Math.floor(Math.random() * this.spec.colors.length)];
    this.x = x; this.z = z; this.y = 0;
    this.heading = heading;
    this.vx = 0; this.vz = 0; this.w = 0;
    this.steer = 0; this.speed = 0;
    this.throttle = 0; this.brake = 0; this.steerIn = 0; this.handbrake = 0;
    this.health = 1000; this.dead = false; this.fire = 0;
    this.sleeping = true;
    this.driver = null;          // 'player' | 'ai' | null
    this.slot = -1; this.wheelSlot = -1;
    this.pitch = 0; this.roll = 0; this.pv = 0; this.rv = 0; this.bump = 0;
    this.spin = 0;
    this.lights = false; this.siren = false; this.sirenT = 0;
    this.skid = 0; this.offroad = 0;
    this.lastHit = 0;
    this.locked = this.spec.shape === 'bici' ? false : Math.random() < (this.spec.twoWheel ? 0.25 : 0.35);
    this.gear = 1; this.rpm = 0.2;
    this.hl = this.spec.L / 2; this.hw = this.spec.W / 2;
    this.mass = this.spec.mass;
    this.inertia = this.mass * (this.spec.L * this.spec.L + this.spec.W * this.spec.W) / 12;
    this.matrix = new THREE.Matrix4();
    this.hornT = 0;
  }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
  get vel() { return Math.hypot(this.vx, this.vz); }
  box(o = {}) { o.x = this.x; o.z = this.z; o.ux = Math.sin(this.heading); o.uz = Math.cos(this.heading); o.hl = this.hl; o.hw = this.hw; return o; }

  // arcade physics step
  step(dt, surface) {
    const s = this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const dead = this.dead;
    const thr = dead ? 0 : this.throttle, brk = dead ? 0 : this.brake;
    // the player's own driving perks (Lucía: faster, grippier; Manu: keeps his pace off the tarmac)
    const me = this.driver === 'player', dk = me ? PERK.dirt : 1;
    const top = s.top * (this.health < 250 ? 0.6 : 1) * (surface.dirt ? Math.min(1, 0.8 * dk) : 1) * (me ? PERK.carTop : 1);
    const accel = s.accel * (me ? PERK.carAccel : 1), brakeK = me ? PERK.carGrip : 1;
    // nobody at the wheel: in gear with the handbrake on, the tyres scrub the car to a stop. (Before, the soft brake
    // of an empty car worked as reverse once it was pushed backwards, and shunted cars kept rolling into others.)
    if (this.parkBrake && !thr) { const dec = 9 * dt; vF = Math.abs(vF) <= dec ? 0 : vF - Math.sign(vF) * dec; }
    // engine & brakes
    else if (thr > 0) {
      if (vF < -0.3) vF += 14 * thr * dt;
      else {
        const k = clamp(vF / top, 0, 1);
        vF += accel * thr * (1 - k * k) * dt * 1.25;
      }
    }
    if (brk > 0 && !this.parkBrake) {
      if (vF > 0.3) vF -= 13 * brakeK * brk * dt;
      else if (vF > -top * 0.35) vF -= accel * 0.7 * brk * dt;
    }
    if (this.handbrake && Math.abs(vF) > 0.2) vF -= Math.sign(vF) * 4.5 * dt;
    // resistance
    const roll = surface.dirt ? 0.35 / dk : 0.16;
    vF -= (0.0007 * vF * Math.abs(vF) + roll * vF * 0.4) * dt;
    if (!thr && !brk && Math.abs(vF) < 0.3) vF *= Math.max(0, 1 - 6 * dt);
    // steering (speed sensitive), rate limited
    const sp = Math.abs(vF);
    const maxSteer = s.steer / (1 + sp * 0.055);
    const target = this.steerIn * maxSteer;
    const rate = 3.2;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    // yaw
    let yawT = -(vF / s.wb) * Math.tan(this.steer);
    const drifting = this.handbrake && sp > 6;
    if (drifting) yawT *= 1.45;
    const resp = drifting ? 3.5 : 9 + sp * 0.1;
    this.w += (yawT - this.w) * Math.min(1, resp * dt);
    this.heading += this.w * dt;
    // lateral grip (tyres)
    const gripBase = s.grip * (surface.dirt ? Math.min(1, 0.7 * dk) : 1) * (dead ? 0.6 : 1) * (me ? PERK.carGrip : 1);
    const grip = drifting ? 1.3 : this.handbrake ? 3 : gripBase;
    const slide = Math.abs(vR);
    vR *= Math.exp(-grip * dt * (slide > 7 ? 0.7 : 1));
    // re-project onto new heading
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    this.vx = nfx * vF + nrx * vR;
    this.vz = nfz * vF + nrz * vR;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.speed = vF;
    this.skid = clamp((slide - 2.2) / 5, 0, 1) + (this.handbrake && sp > 4 ? 0.5 : 0) + (brk > 0.5 && sp > 12 ? 0.25 : 0);
    // body motion springs (pitch from accel, roll from lateral g)
    const aLong = (vF - (this._pvF || 0)) / Math.max(dt, 1e-4);
    this._pvF = vF;
    const latG = this.w * vF;
    const tp = clamp(-aLong * 0.006, -0.07, 0.07), tr = clamp(latG * 0.0045, -0.08, 0.08);
    this.pv += ((tp - this.pitch) * 60 - this.pv * 9) * dt;
    this.rv += ((tr - this.roll) * 55 - this.rv * 8) * dt;
    this.pitch += this.pv * dt; this.roll += this.rv * dt;
    if (s.twoWheel) {
      // a bike leans into the bend (and stands up when stopped); it does not pitch on its springs
      const lean = clamp(-this.w * Math.abs(vF) * 0.075, -0.62, 0.62) * clamp(Math.abs(vF) / 3, 0, 1);
      this.roll += (lean - this.roll) * (1 - Math.exp(-7 * dt)); this.rv = 0;
      this.pitch *= 0.5;
    }
    this.bump *= Math.exp(-6 * dt);
    this.spin += (vF / (this.spec.wr || 0.32)) * dt;
    // gears / rpm for audio
    const g = [0, 6.5, 12, 19, 27, 36, 99];
    let gear = 1;
    while (gear < 6 && sp > g[gear]) gear++;
    this.gear = gear;
    const lo = g[gear - 1], hi = Math.min(g[gear], top);
    const target01 = clamp((sp - lo) / Math.max(1, hi - lo), 0, 1) * 0.75 + 0.2 + thr * 0.08;
    this.rpm = lerp(this.rpm, s.shape === 'tractor' ? 0.25 + sp / top * 0.6 + thr * 0.15 : target01, 1 - Math.exp(-8 * dt));
  }

  // collision response against a static contact (normal points toward the car)
  resolveStatic(c, restitution = 0.25) {
    this.x += c.nx * c.depth;
    this.z += c.nz * c.depth;
    const px = c.px - this.x, pz = c.pz - this.z;
    const vcx = this.vx + this.w * pz, vcz = this.vz - this.w * px;
    const vn = vcx * c.nx + vcz * c.nz;
    if (vn >= 0) return 0;
    const k = pz * c.nx - px * c.nz;
    const invM = 1 / this.mass, invI = 1 / this.inertia;
    const j = -(1 + restitution) * vn / (invM + k * k * invI);
    this.vx += j * c.nx * invM; this.vz += j * c.nz * invM;
    this.w += j * k * invI;
    // friction along the wall
    const tx = -c.nz, tz = c.nx;
    const vt = (this.vx + this.w * pz) * tx + (this.vz - this.w * px) * tz;
    const kt = pz * tx - px * tz;
    let jt = -vt / (invM + kt * kt * invI);
    jt = clamp(jt, -0.35 * j, 0.35 * j);
    this.vx += jt * tx * invM; this.vz += jt * tz * invM;
    this.w += jt * kt * invI;
    this.w = clamp(this.w, -4, 4);
    return -vn;
  }

  writeMatrix(renderer, tmp) {
    const q = tmp.q, e = tmp.e, p = tmp.p, s = tmp.s;
    e.set(this.pitch + this.bump * 0.3, this.heading, this.roll, 'YXZ');
    q.setFromEuler(e);
    p.set(this.x, this.y + 0.02 + Math.abs(this.bump) * 0.1, this.z);
    s.set(1, 1, 1);
    this.matrix.compose(p, q, s);
    renderer.write(this, this.matrix);
    // wheels
    const geo = renderer.info(this.model);
    const wm = tmp.wm, wq = tmp.wq, we = tmp.we;
    for (let k = 0; k < 4; k++) {
      const wp = geo.wheels[k];
      const r = geo.wheelRs ? geo.wheelRs[k] : geo.wheelR;
      const w = geo.wheelWs ? geo.wheelWs[k] : geo.wheelW;
      const steer = k < 2 ? -this.steer : 0;
      we.set(this.spin * (geo.wheelRs ? geo.wheelR / r : 1), steer, 0, 'YXZ');
      wq.setFromEuler(we);
      tmp.wl.set(wp.x, wp.y, wp.z);
      tmp.ws.set(w, r, r);
      wm.compose(tmp.wl, wq, tmp.ws);
      // wheels ignore body roll/pitch: compose with yaw-only matrix
      tmp.yq.setFromAxisAngle(tmp.up, this.heading);
      tmp.ym.compose(tmp.p2.set(this.x, this.y, this.z), tmp.yq, tmp.one);
      wm.premultiply(tmp.ym);
      renderer.writeWheel(this, k, wm);
    }
  }
}

export function makeTmp() {
  return {
    q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(),
    wm: new THREE.Matrix4(), wq: new THREE.Quaternion(), we: new THREE.Euler(), wl: new THREE.Vector3(), ws: new THREE.Vector3(),
    yq: new THREE.Quaternion(), ym: new THREE.Matrix4(), p2: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0),
  };
}

// OBB vs OBB (2D SAT). Returns {depth, nx, nz (from b to a), px, pz} or null
export function obbContact(a, b, out = {}) {
  const axes = [[a.ux, a.uz], [-a.uz, a.ux], [b.ux, b.uz], [-b.uz, b.ux]];
  const dx = a.x - b.x, dz = a.z - b.z;
  let best = Infinity, bnx = 0, bnz = 0;
  for (const [ax, az] of axes) {
    const ra = a.hl * Math.abs(a.ux * ax + a.uz * az) + a.hw * Math.abs(-a.uz * ax + a.ux * az);
    const rb = b.hl * Math.abs(b.ux * ax + b.uz * az) + b.hw * Math.abs(-b.uz * ax + b.ux * az);
    const d = dx * ax + dz * az;
    const ov = ra + rb - Math.abs(d);
    if (ov <= 0) return null;
    if (ov < best) { best = ov; const s = d >= 0 ? 1 : -1; bnx = ax * s; bnz = az * s; }
  }
  // contact point: deepest corner of a toward b, or of b toward a (pick corner inside other box)
  const corner = (o, sx, sz) => [o.x + o.ux * o.hl * sx + -o.uz * o.hw * sz, o.z + o.uz * o.hl * sx + o.ux * o.hw * sz];
  const inside = (o, x, z) => {
    const lx = (x - o.x) * o.ux + (z - o.z) * o.uz, lz = (x - o.x) * -o.uz + (z - o.z) * o.ux;
    return Math.abs(lx) <= o.hl + 0.05 && Math.abs(lz) <= o.hw + 0.05;
  };
  let px = (a.x + b.x) / 2, pz = (a.z + b.z) / 2, found = false;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    if (found) break;
    const [cx, cz] = corner(a, sx, sz);
    if (inside(b, cx, cz)) { px = cx; pz = cz; found = true; }
  }
  if (!found) for (const sx of [1, -1]) for (const sz of [1, -1]) {
    if (found) break;
    const [cx, cz] = corner(b, sx, sz);
    if (inside(a, cx, cz)) { px = cx; pz = cz; found = true; }
  }
  out.depth = best; out.nx = bnx; out.nz = bnz; out.px = px; out.pz = pz;
  return out;
}

// impulse between two vehicles (n from b to a)
export function resolvePair(a, b, c, e = 0.2) {
  const invMa = 1 / a.mass;
  const invMb = 1 / b.mass;
  const invIa = 1 / a.inertia, invIb = 1 / b.inertia;
  const tot = invMa + invMb;
  a.x += c.nx * c.depth * (invMa / tot); a.z += c.nz * c.depth * (invMa / tot);
  b.x -= c.nx * c.depth * (invMb / tot); b.z -= c.nz * c.depth * (invMb / tot);
  const pax = c.px - a.x, paz = c.pz - a.z, pbx = c.px - b.x, pbz = c.pz - b.z;
  const vax = a.vx + a.w * paz, vaz = a.vz - a.w * pax;
  const vbx = b.vx + b.w * pbz, vbz = b.vz - b.w * pbx;
  const vn = (vax - vbx) * c.nx + (vaz - vbz) * c.nz;
  if (vn >= 0) return 0;
  const ka = paz * c.nx - pax * c.nz, kb = pbz * c.nx - pbx * c.nz;
  const j = -(1 + e) * vn / (invMa + invMb + ka * ka * invIa + kb * kb * invIb);
  a.vx += j * c.nx * invMa; a.vz += j * c.nz * invMa; a.w += j * ka * invIa;
  b.vx -= j * c.nx * invMb; b.vz -= j * c.nz * invMb; b.w -= j * kb * invIb;
  a.w = clamp(a.w, -4, 4); b.w = clamp(b.w, -4, 4);
  return -vn;
}
