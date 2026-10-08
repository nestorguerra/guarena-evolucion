// Street life of a village in Extremadura: what really sits in its streets, placed from the real doors, shops, bars,
// junctions and squares. Study (see the in-game credits too):
//  · at the doors: chairs to "tomar el fresco", geranium pots on the ground, the orange butane cylinder left out for
//    the butanero, a broom, a bicycle, a shopping trolley, a cat on the doorstep, stone benches (poyetes)
//  · waste: resto / envases / papel / orgánico containers and the green glass igloo, bags and cardboard boxes piled next
//    to them, paper, cans, bottles and plastic bags along the kerb, litter bins
//  · bars and shops: terraces with tables, chairs and parasols, stacked beer crates, a chalkboard, fruit crates outside
//    the greengrocers, the green cross of the pharmacy
//  · street furniture: planters, bollards, convex traffic mirrors at blind corners, yellow Correos mailbox,
//    parked mopeds, ceramic street-name tiles at the corners
//  · roofs: satellite dishes, clothes lines on the flat roofs (azoteas)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, InstanceGroup } from './props.js';
import { mulberry32, hash1, polySample, pointInRing, ringBounds, ringArea } from './util.js';
import { makeNightGlowMaterial } from './materials.js';
import { groundPot } from './facades.js';
import { STYLE } from './style.js';

const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
function merged(list) {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function lumpy(r, detail, rnd, sx = 1, sy = 1, sz = 1, bump = 0.22) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 1 + (rnd() - 0.5) * bump; seen.set(key, k); }
    p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz);
  }
  g.computeVertexNormals();
  return g;
}
// vertex-coloured foliage blob with a few flower-coloured vertices
function flowerBlob(r, rnd, leaf, flower, share = 0.25, sy = 0.8) {
  const g = lumpy(r, 1, rnd, 1, sy, 1, 0.3).toNonIndexed();
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const cL = new THREE.Color(leaf), cF = new THREE.Color(flower || leaf);
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const c = flower && y > -0.1 * r && rnd() < share ? cF : cL;
    const v = 0.85 + rnd() * 0.3;
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r * v; col[(i + k) * 3 + 1] = c.g * v; col[(i + k) * 3 + 2] = c.b * v; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// ------------------------------------------------------------------ geometry library
export function makeStreetGeometries() {
  const rnd = mulberry32(4242);
  const G = {};
  // white plastic garden chair (silla de plástico) — origin at the floor, facing +z
  {
    const c = '#f0f0ea';
    const seat = paint(at(new THREE.BoxGeometry(0.46, 0.035, 0.44), 0, 0.44, 0.02), c);
    const back = paint(new THREE.BoxGeometry(0.46, 0.42, 0.03), c); back.rotateX(-0.2); back.translate(0, 0.68, -0.21);
    const parts = [seat, back];
    for (const x of [-0.2, 0.2]) for (const z of [-0.18, 0.2]) { const l = paint(at(new THREE.BoxGeometry(0.035, 0.44, 0.035), x, 0.22, z), '#e6e6e0'); parts.push(l); }
    for (const x of [-0.235, 0.235]) parts.push(paint(at(new THREE.BoxGeometry(0.035, 0.03, 0.42), x, 0.63, 0), c), paint(at(new THREE.BoxGeometry(0.03, 0.2, 0.03), x, 0.53, 0.19), c));
    G.sillaPlastico = merged(parts);
  }
  // rush-seat chair (silla de enea), natural wood and the painted green one of the grandmothers
  const enea = (frame) => {
    const parts = [];
    for (const x of [-0.19, 0.19]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.02, 0.022, 0.46, 5), x, 0.23, 0.18), frame));
      parts.push(paint(at(new THREE.CylinderGeometry(0.02, 0.022, 0.98, 5), x, 0.49, -0.18), frame));
    }
    parts.push(paint(at(new THREE.BoxGeometry(0.42, 0.05, 0.4), 0, 0.45, 0), '#c9a45a', 0.25, rnd));
    for (const y of [0.64, 0.76, 0.88]) parts.push(paint(at(new THREE.BoxGeometry(0.38, 0.045, 0.02), 0, y, -0.18), frame));
    for (const z of [-0.18, 0.18]) parts.push(paint(at(new THREE.BoxGeometry(0.38, 0.02, 0.02), 0, 0.16, z), frame));
    return merged(parts);
  };
  G.sillaEnea = enea('#6b4226');
  G.sillaEneaVerde = enea('#2f6a55');
  // terrace chair & table (aluminium) and parasol
  {
    const c = '#b8bbbd';
    const parts = [paint(at(new THREE.BoxGeometry(0.42, 0.03, 0.42), 0, 0.45, 0), c)];
    const back = paint(new THREE.BoxGeometry(0.42, 0.34, 0.025), c); back.rotateX(-0.12); back.translate(0, 0.66, -0.2); parts.push(back);
    for (const x of [-0.19, 0.19]) for (const z of [-0.19, 0.19]) parts.push(paint(at(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), x, 0.225, z), '#9a9da0'));
    G.sillaTerraza = merged(parts);
    G.mesaTerraza = merged([
      paint(at(new THREE.CylinderGeometry(0.38, 0.38, 0.025, 14), 0, 0.73, 0), '#d6d8d9'),
      paint(at(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), 0, 0.36, 0), '#8e9194'),
      paint(at(new THREE.CylinderGeometry(0.26, 0.28, 0.03, 10), 0, 0.015, 0), '#6f7275'),
    ]);
    const canopy = paint(at(new THREE.ConeGeometry(1.25, 0.38, 8, 1, true), 0, 2.28, 0), '#ffffff');
    const under = paint(at(new THREE.ConeGeometry(1.24, 0.37, 8, 1, true), 0, 2.275, 0), '#d0d0d0');
    const ui = under.index ? under.toNonIndexed() : under;
    { const p = ui.attributes.position; for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); } }
    G.sombrilla = merged([canopy, ui, paint(at(new THREE.CylinderGeometry(0.02, 0.025, 2.3, 6), 0, 1.15, 0), '#e8e8e4'), paint(at(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 8), 0, 0.04, 0), '#4a4d50')]);
  }
  // pots on the ground: geraniums, aspidistra, cactus
  G.macetaGeranio = merged([paint(at(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 9), 0, 0.13, 0), '#b5552e', 0.1, rnd), at(flowerBlob(0.22, rnd, '#3f7a35', '#d8263a', 0.3), 0, 0.36, 0)]);
  G.macetaGitanilla = merged([paint(at(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 9), 0, 0.1, 0), '#b5552e', 0.1, rnd), at(flowerBlob(0.2, rnd, '#467f3a', '#e8487a', 0.35, 1.1), 0, 0.26, 0)]);
  {
    const leaves = [paint(at(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 9), 0, 0.15, 0), '#8a4a2e', 0.1, rnd)];
    for (let i = 0; i < 9; i++) {
      const l = paint(new THREE.ConeGeometry(0.05, 0.62 + rnd() * 0.25, 4), rnd() < 0.5 ? '#2f5f2a' : '#3a6f32');
      l.rotateZ((rnd() - 0.5) * 0.7); l.rotateX((rnd() - 0.5) * 0.7); l.translate((rnd() - 0.5) * 0.15, 0.6, (rnd() - 0.5) * 0.15);
      leaves.push(l);
    }
    G.macetaAspidistra = merged(leaves);
  }
  G.macetaCactus = merged([
    paint(at(new THREE.CylinderGeometry(0.14, 0.11, 0.22, 9), 0, 0.11, 0), '#c26a3e', 0.1, rnd),
    paint(at(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 7), 0, 0.46, 0), '#4f7a3a', 0.1, rnd),
    paint(at(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 6), 0.1, 0.52, 0), '#4f7a3a'),
    paint(at(new THREE.CylinderGeometry(0.04, 0.045, 0.16, 6), -0.09, 0.46, 0.02), '#4f7a3a'),
  ]);
  // a little cypress clipped to a cone in a clay pot (claymation: along the house fronts, as in the user's pictures)
  G.macetaCipres = merged([
    paint(at(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 9), 0, 0.15, 0), '#b5552e', 0.1, rnd),
    paint(at(new THREE.SphereGeometry(0.19, 9, 7), 0, 0.44, 0), '#3d6b33', 0.12, rnd),
    paint(at(new THREE.ConeGeometry(0.2, 0.72, 9), 0, 0.82, 0), '#3d6b33', 0.12, rnd),
  ]);
  // big concrete planter with a shrub
  G.maceton = merged([paint(at(new THREE.BoxGeometry(0.9, 0.5, 0.9), 0, 0.25, 0), '#b9b3a6', 0.05, rnd), at(flowerBlob(0.5, rnd, '#3f6f35', '#e0c040', 0.08, 0.75), 0, 0.72, 0)]);
  // orange butane cylinder (bombona de butano)
  {
    const o = '#e5641a';
    const shoulder = paint(new THREE.SphereGeometry(0.15, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), o);
    shoulder.scale(1, 0.55, 1); shoulder.translate(0, 0.55, 0);
    G.butano = merged([
      paint(at(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 12), 0, 0.3, 0), o, 0.04, rnd),
      shoulder,
      paint(at(new THREE.CylinderGeometry(0.095, 0.1, 0.1, 10, 1, true), 0, 0.66, 0), '#d45a16'),
      paint(at(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), 0, 0.64, 0), '#8e9295'),
      paint(at(new THREE.CylinderGeometry(0.145, 0.14, 0.05, 12), 0, 0.025, 0), '#3a3a3a'),
    ]);
  }
  // garbage bag (knotted), cardboard boxes, a flattened sheet of cardboard, an old mattress
  {
    const bag = lumpy(0.24, 1, rnd, 1, 0.8, 0.9, 0.32);
    bag.translate(0, 0.18, 0);
    const knot = new THREE.ConeGeometry(0.035, 0.09, 5); knot.translate(0, 0.39, 0);
    G.bolsa = paint(merged([bag, knot]), '#ffffff', 0.12, rnd);
    const box = [];
    for (const [w, h, d, x, z] of [[0.5, 0.36, 0.02, 0, 0.19], [0.5, 0.36, 0.02, 0, -0.19], [0.02, 0.36, 0.4, 0.24, 0], [0.02, 0.36, 0.4, -0.24, 0], [0.5, 0.02, 0.4, 0, 0]]) {
      box.push(paint(at(new THREE.BoxGeometry(w, h, d), x, w === 0.5 && d === 0.4 ? 0.01 : h / 2, z), '#b8894f', 0.12, rnd));
    }
    for (const s of [-1, 1]) { const f = paint(new THREE.BoxGeometry(0.5, 0.012, 0.2), '#a97c46'); f.rotateX(s * 0.9); f.translate(0, 0.42, s * 0.26); box.push(f); }
    G.caja = merged(box);
    const flat = paint(new THREE.BoxGeometry(0.9, 0.7, 0.012), '#b8894f', 0.15, rnd); flat.rotateX(-0.25); flat.translate(0, 0.34, 0);
    G.carton = flat;
    const mat = paint(new THREE.BoxGeometry(0.9, 1.85, 0.16), '#dfe4ea', 0.08, rnd); mat.rotateX(-0.28); mat.translate(0, 0.9, 0);
    G.colchon = mat;
  }
  // litter: crumpled paper, a newspaper sheet, cans, a plastic bottle, a plastic bag, a paper cup
  {
    G.papel = paint(lumpy(0.04, 0, rnd, 1, 0.8, 1, 0.5), '#f0eee6', 0.1, rnd);
    const sheet = new THREE.PlaneGeometry(0.34, 0.24, 2, 1);
    sheet.rotateX(-Math.PI / 2);
    { const p = sheet.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.012 + (p.getX(i) > 0.1 ? 0.03 : 0)); }
    G.periodico = paint(sheet, '#d9d7cf', 0.1, rnd);
    const can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 7); can.rotateZ(Math.PI / 2); can.translate(0, 0.033, 0);
    G.lata = paint(can, '#ffffff');
    const bot = merged([new THREE.CylinderGeometry(0.04, 0.04, 0.2, 7), at(new THREE.CylinderGeometry(0.014, 0.04, 0.07, 7), 0, 0.135, 0)]);
    bot.rotateZ(Math.PI / 2); bot.translate(0, 0.04, 0);
    G.botella = paint(bot, '#d2e6ef');
    G.bolsaPlastico = paint(lumpy(0.12, 1, rnd, 1, 0.25, 0.8, 0.6), '#f4f4f2', 0.15, rnd);
    const cup = new THREE.CylinderGeometry(0.04, 0.03, 0.09, 7, 1, true); cup.rotateZ(Math.PI / 2); cup.translate(0, 0.04, 0);
    G.vaso = paint(cup, '#f2f2ee');
  }
  // green litter bin on its post (papelera)
  G.papelera = merged([
    paint(at(new THREE.CylinderGeometry(0.19, 0.17, 0.46, 10), 0, 0.62, 0), '#2f5d3a', 0.05, rnd),
    paint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), 0, 0.86, 0), '#264d30'),
    paint(at(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 6), 0, 0.45, -0.22), '#3b3f44'),
  ]);
  // Correos mailbox
  G.buzon = merged([
    paint(at(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 8), 0, 0.31, 0), '#3b3f44'),
    paint(at(new THREE.BoxGeometry(0.4, 0.5, 0.32), 0, 0.87, 0), '#f2c200', 0.03, rnd),
    paint(at(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), 0, 1.12, 0), '#f2c200'),
    paint(at(new THREE.BoxGeometry(0.24, 0.035, 0.02), 0, 1.0, 0.165), '#2a2a2a'),
    paint(at(new THREE.BoxGeometry(0.12, 0.12, 0.02), 0, 0.82, 0.165), '#1c3f8c'),
  ]);
  // convex traffic mirror
  {
    const disk = paint(new THREE.SphereGeometry(0.34, 12, 6, 0, Math.PI * 2, 0, 0.5), '#9fb6c8'); disk.rotateX(Math.PI / 2); disk.translate(0, 2.75, 0.06);
    const rim = paint(new THREE.TorusGeometry(0.33, 0.045, 5, 16), '#e35b1a'); rim.translate(0, 2.75, 0.05);
    G.espejo = merged([paint(at(new THREE.CylinderGeometry(0.04, 0.045, 2.8, 6), 0, 1.4, 0), '#8f9499'), disk, rim, paint(at(new THREE.BoxGeometry(0.4, 0.14, 0.06), 0, 3.2, 0.02), '#e35b1a')]);
  }
  // beer crates stack & chalkboard
  {
    const crate = (col, y) => [paint(at(new THREE.BoxGeometry(0.4, 0.28, 0.3), 0, y + 0.14, 0), col, 0.05, rnd), paint(at(new THREE.BoxGeometry(0.36, 0.01, 0.26), 0, y + 0.281, 0), '#3a2a18')];
    G.cajasCerveza = merged([...crate('#c8202a', 0), ...crate('#c8202a', 0.29), ...crate('#2f7a3a', 0.58), ...crate('#c8202a', 0.87)]);
    const b1 = paint(new THREE.BoxGeometry(0.5, 0.8, 0.02), '#1f2622'); b1.rotateX(0.18); b1.translate(0, 0.44, 0.08);
    const b2 = paint(new THREE.BoxGeometry(0.5, 0.8, 0.02), '#1f2622'); b2.rotateX(-0.18); b2.translate(0, 0.44, -0.08);
    const f1 = paint(new THREE.BoxGeometry(0.56, 0.86, 0.015), '#8a5a33'); f1.rotateX(0.18); f1.translate(0, 0.44, 0.07);
    const f2 = paint(new THREE.BoxGeometry(0.56, 0.86, 0.015), '#8a5a33'); f2.rotateX(-0.18); f2.translate(0, 0.44, -0.07);
    const chalk = paint(new THREE.BoxGeometry(0.36, 0.32, 0.004), '#e8e8e0'); chalk.rotateX(0.18); chalk.translate(0, 0.55, 0.092);
    G.pizarra = merged([f1, f2, b1, b2, chalk]);
  }
  // fruit crates on a trestle outside the greengrocer
  {
    const parts = [paint(at(new THREE.BoxGeometry(1.3, 0.04, 0.6), 0, 0.62, 0), '#8a6a44'), paint(at(new THREE.BoxGeometry(0.05, 0.6, 0.5), -0.55, 0.3, 0), '#6b4a2e'), paint(at(new THREE.BoxGeometry(0.05, 0.6, 0.5), 0.55, 0.3, 0), '#6b4a2e')];
    const fruits = ['#f08a24', '#d8262a', '#7fb03a', '#f2c230'];
    for (let k = 0; k < 3; k++) {
      const x = -0.42 + k * 0.42;
      parts.push(paint(at(new THREE.BoxGeometry(0.38, 0.14, 0.5), x, 0.71, 0), '#c9a06a', 0.1, rnd));
      for (let i = 0; i < 6; i++) parts.push(paint(at(new THREE.IcosahedronGeometry(0.055, 0), x + (i % 3 - 1) * 0.11, 0.8, (Math.floor(i / 3) - 0.5) * 0.18), fruits[(k + (i % 2)) % 4], 0.12, rnd));
    }
    G.frutas = merged(parts);
  }
  // shopping trolley (carro de la compra)
  G.carro = merged([
    paint(at(new THREE.BoxGeometry(0.34, 0.5, 0.24), 0, 0.5, 0), '#3a4f7a', 0.08, rnd),
    paint(at(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), 0, 0.55, -0.14), '#9a9da0'),
    paint(at(new THREE.BoxGeometry(0.3, 0.02, 0.02), 0, 1.05, -0.14), '#2a2a2a'),
    paint(at(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10).rotateZ(Math.PI / 2), -0.17, 0.09, -0.1), '#2a2a2a'),
    paint(at(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10).rotateZ(Math.PI / 2), 0.17, 0.09, -0.1), '#2a2a2a'),
  ]);
  // broom leaning on the wall
  { const s = paint(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5), '#c49a5a'); s.translate(0, 0.65, 0); const h = paint(at(new THREE.BoxGeometry(0.3, 0.1, 0.06), 0, 0.05, 0), '#d8c060'); const b = merged([s, h]); b.rotateX(-0.22); G.escoba = b; }
  // moped (motillo) parked
  {
    const wheel = (z) => paint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 10).rotateZ(Math.PI / 2), 0, 0.2, z), '#1c1c1c');
    G.moto = merged([
      wheel(0.55), wheel(-0.5),
      paint(at(new THREE.BoxGeometry(0.3, 0.3, 0.9), 0, 0.45, -0.1), '#ffffff'),
      paint(at(new THREE.BoxGeometry(0.28, 0.12, 0.55), 0, 0.68, -0.25), '#1f1f1f'),
      paint(at(new THREE.BoxGeometry(0.34, 0.55, 0.12), 0, 0.62, 0.42), '#ffffff'),
      paint(at(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5).rotateZ(Math.PI / 2), 0, 1.02, 0.48), '#2a2a2a'),
      paint(at(new THREE.BoxGeometry(0.12, 0.08, 0.06), 0, 0.95, 0.52), '#e8e8d0'),
    ]);
  }
  // bicycle leaning (simple)
  {
    const ring = (z) => paint(at(new THREE.TorusGeometry(0.31, 0.022, 4, 12).rotateY(Math.PI / 2), 0, 0.33, z), '#1c1c1c');
    const bar = (a, b) => { const d = new THREE.Vector3().subVectors(b, a); const g = new THREE.CylinderGeometry(0.015, 0.015, d.length(), 5); g.translate(0, d.length() / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))); g.translate(a.x, a.y, a.z); return paint(g, '#b8302a'); };
    const V = (y, z) => new THREE.Vector3(0, y, z);
    G.bici = merged([ring(0.52), ring(-0.52), bar(V(0.33, -0.52), V(0.62, -0.12)), bar(V(0.33, -0.52), V(0.36, 0.02)), bar(V(0.36, 0.02), V(0.62, -0.12)), bar(V(0.62, -0.12), V(0.68, 0.4)), bar(V(0.36, 0.02), V(0.68, 0.4)), bar(V(0.68, 0.4), V(0.33, 0.52)), bar(V(0.62, -0.12), V(0.86, -0.16)), paint(at(new THREE.BoxGeometry(0.1, 0.04, 0.24), 0, 0.88, -0.17), '#1c1c1c'), paint(at(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 5).rotateZ(Math.PI / 2), 0, 0.92, 0.42), '#2a2a2a')]);
  }
  // cats: sitting and curled up (instance colour gives black / ginger / grey / white)
  {
    const body = lumpy(0.13, 1, rnd, 0.9, 1.25, 1.15, 0.08); body.translate(0, 0.16, -0.02);
    const head = lumpy(0.075, 1, rnd, 1, 0.92, 1, 0.05); head.translate(0, 0.33, 0.07);
    const e1 = new THREE.ConeGeometry(0.028, 0.06, 4); e1.translate(-0.04, 0.4, 0.07);
    const e2 = new THREE.ConeGeometry(0.028, 0.06, 4); e2.translate(0.04, 0.4, 0.07);
    const tail = new THREE.CylinderGeometry(0.018, 0.022, 0.3, 5); tail.rotateX(Math.PI / 2 - 0.2); tail.rotateY(0.8); tail.translate(0.1, 0.03, 0.06);
    G.gatoSentado = paint(merged([body, head, e1, e2, tail]), '#ffffff', 0.08, rnd);
    const b2 = lumpy(0.14, 1, rnd, 1.25, 0.55, 1.4, 0.08); b2.translate(0, 0.075, 0);
    const h2 = lumpy(0.07, 1, rnd, 1, 0.85, 1, 0.05); h2.translate(0.08, 0.1, 0.15);
    const t2 = new THREE.TorusGeometry(0.15, 0.02, 4, 8, Math.PI); t2.rotateX(Math.PI / 2); t2.translate(0, 0.04, 0);
    G.gatoTumbado = paint(merged([b2, h2, t2]), '#ffffff', 0.08, rnd);
  }
  // stone bench against the facade (poyete)
  G.poyete = merged([paint(at(new THREE.BoxGeometry(1.4, 0.42, 0.4), 0, 0.21, 0), '#ece8de', 0.04, rnd), paint(at(new THREE.BoxGeometry(1.46, 0.06, 0.46), 0, 0.45, 0.02), '#c9c2b4')]);
  // glass igloo (iglú de vidrio)
  G.iglu = merged([
    paint(new THREE.SphereGeometry(0.85, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1), '#2f7a3a', 0.05, rnd),
    paint(at(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 12), 0, 0.06, 0), '#265f2f'),
    paint(at(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 8), 0, 1.12, 0), '#dcdcd6'),
    paint(at(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10).rotateX(Math.PI / 2 - 0.5), 0, 0.85, 0.62), '#1a1a1a'),
  ]);
  // satellite dish
  {
    const dish = paint(new THREE.SphereGeometry(0.4, 10, 4, 0, Math.PI * 2, 0, 0.55), '#e8e8e4'); dish.rotateX(Math.PI / 2 + 0.5); dish.translate(0, 0.55, 0.05);
    G.parabolica = merged([dish, paint(at(new THREE.CylinderGeometry(0.02, 0.025, 0.6, 5), 0, 0.3, -0.05), '#9a9a9a'), paint(at(new THREE.BoxGeometry(0.05, 0.05, 0.4), 0, 0.62, 0.3), '#6a6a6a')]);
  }
  // clothes line on a flat roof: two posts and three lines of washing (vertex colours per garment)
  {
    const parts = [paint(at(new THREE.BoxGeometry(0.05, 1.7, 0.05), -1.6, 0.85, 0), '#9a9da0'), paint(at(new THREE.BoxGeometry(0.05, 1.7, 0.05), 1.6, 0.85, 0), '#9a9da0')];
    for (const z of [-0.25, 0, 0.25]) parts.push(paint(at(new THREE.BoxGeometry(3.2, 0.008, 0.008), 0, 1.65, z), '#d8d8d8'));
    const cols = ['#f2f2ee', '#e2574c', '#4a7fc0', '#f2c230', '#7fbf6a', '#f08aa8', '#ffffff', '#8a6ad0'];
    for (let i = 0; i < 9; i++) {
      const w = 0.25 + rnd() * 0.35, h = 0.3 + rnd() * 0.45, x = -1.4 + (i % 3) * 1.0 + rnd() * 0.3, z = -0.25 + Math.floor(i / 3) * 0.25;
      parts.push(paint(at(new THREE.BoxGeometry(w, h, 0.01), x, 1.65 - h / 2, z), cols[Math.floor(rnd() * cols.length)]));
    }
    G.tendedero = merged(parts);
  }
  // pharmacy cross (green, glows at night): arms perpendicular to the facade
  G.cruz = merged([paint(at(new THREE.BoxGeometry(0.1, 0.62, 0.22), 0, 0, 0), '#ffffff'), paint(at(new THREE.BoxGeometry(0.1, 0.22, 0.62), 0, 0, 0), '#ffffff')]);
  G.cruzSoporte = merged([paint(at(new THREE.BoxGeometry(0.04, 0.04, 0.5), 0, 0, -0.25), '#2a2a2a')]);
  for (const k in G) G[k].computeBoundingSphere();
  return G;
}

// ------------------------------------------------------------------ placement
const CAN_COLS = [0xc8202a, 0xd0d4d8, 0x1f4fb0, 0x2f8a3a, 0xf2c230, 0x111111, 0xe87a1a];
const BAG_COLS = [0x1a1a1a, 0x1a1a1a, 0x1a1a1a, 0x2a2a2a, 0x3a3f46, 0x333a45, 0xd8d8d2];
const CAT_COLS = [0x1c1c1c, 0xd88a3a, 0x8a8a8a, 0xf0ece4, 0x6a5040];
const PARASOL = [0xc8202a, 0x1f6e3e, 0xe8e3d8, 0x1f4f8a, 0xf2c230];
const MOTO_COLS = [0xc8202a, 0x1c1c1c, 0x2a5fb0, 0xf0f0ea, 0x8a8f94, 0x2f7a3a];

// a point on the pavement in front of a POI (same idea as activities.doorOf)
function doorFront(map, pt) {
  const q = map.nearestEdge(pt.x, pt.z, 50, (e) => (e.walk || e.drive) && !e.blocked);
  if (!q) return null;
  const d = map.sample(q.edge, q.s, {});
  const dx = pt.x - d.x, dz = pt.z - d.z, l = Math.hypot(dx, dz) || 1;
  let bx = d.x, bz = d.z, hit = false;
  for (let t = 0; t <= l; t += 0.4) {
    const x = d.x + (dx / l) * t, z = d.z + (dz / l) * t;
    if (map.buildingAt(x, z)) { hit = true; break; }
    bx = x; bz = z;
  }
  if (!hit) return null;
  // wall normal: from the wall point back towards the street
  return { x: bx, z: bz, nx: -dx / l, nz: -dz / l, edge: q.edge };
}

export function buildStreetLife(world, map, q) {
  const G = makeStreetGeometries();
  world.streetGeoms = G;
  const col = map.collider;
  const groups = [];
  // static props go into the streamed detail chunks (merged, one draw call per chunk); tiny ones only up close
  const FINE = new Set(['papel', 'periodico', 'lata', 'botella', 'bolsaPlastico', 'vaso', 'escoba', 'gatoSentado', 'gatoTumbado', 'carro', 'pizarra']);
  const tmpC = new THREE.Color();
  const POTS = new Set(['macetaGeranio', 'macetaGitanilla', 'macetaAspidistra', 'maceton']);
  let potSeed = 5;
  const put = (k, x, y, z, ang, s = 1, color = null) => {
    if (POTS.has(k)) { // pots are built with their plants (leaf cards) when their chunk streams in
      const seed = potSeed++;
      world.facades.addBuild(x, z, k === 'maceton' ? 1 : 0.5, (Gb, Fb, Pb) => groundPot(Gb, Pb, k, x, y, z, s, mulberry32(seed * 7919)));
      return;
    }
    const tint = color != null ? (tmpC.setHex(color), [tmpC.r, tmpC.g, tmpC.b]) : null;
    world.facades.addProp(G[k], x, y, z, ang, s, s, tint, FINE.has(k));
  };
  const rnd = mulberry32(90210);
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  const free = (x, z, r = 0.3) => !map.buildingAt(x, z) && !map.buildingAt(x + r, z) && !map.buildingAt(x - r, z) && !map.buildingAt(x, z + r) && !map.buildingAt(x, z - r);
  // how far a point is from the carriageway of the nearest road cars use (negative: on it)
  const offRoad = (x, z) => {
    let best = 99;
    for (const id of map.edgesNear(x, z, 9)) {
      const e = map.edges[id];
      if (!e.drive) continue;
      const P = e.pts;
      for (let i = 0; i + 3 < P.length; i += 2) {
        const ax = P[i], az = P[i + 1], vx = P[i + 2] - ax, vz = P[i + 3] - az, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t) - e.w / 2);
      }
    }
    return best;
  };
  const litterKinds = ['papel', 'papel', 'papel', 'periodico', 'periodico', 'lata', 'lata', 'lata', 'botella', 'bolsaPlastico', 'vaso'];
  const litter = (x, z, rr = 0) => {
    const k = pick(litterKinds);
    const a = rnd() * Math.PI * 2;
    const xx = x + (rnd() - 0.5) * rr * 2, zz = z + (rnd() - 0.5) * rr * 2;
    if (!free(xx, zz, 0.05)) return;
    put(k, xx, 0, zz, a, 0.85 + rnd() * 0.35, k === 'lata' ? pick(CAN_COLS) : k === 'botella' && rnd() < 0.3 ? 0x6fae78 : null);
  };
  const doors = world.facadeDoors || [];
  const stats = { doorItems: 0, fresco: 0, litter: 0, terraces: 0 };
  const debug = { terraces: [], sets: [] };
  world.streetLifeDebug = debug;

  // ---- at the doors (the real 3D doors on street facades)
  const frescoSpots = [];
  const groundOpen = world.facadeGround || [];
  // is this point in front of a door, garage or shop front? (r = extra margin)
  const nearOpening = (x, z, r) => groundOpen.some((o) => { const rr = o.r + r; return Math.abs(o.x - x) < rr && Math.abs(o.z - z) < rr && Math.hypot(o.x - x, o.z - z) < rr; });
  for (const d of doors) {
    const h = hash1(Math.floor(d.wx * 31 + d.wz * 17) * 7 + 3);
    const r = mulberry32(Math.floor(h * 1e9));
    const nx = d.nx, nz = d.nz, tx = -nz, tz = nx;
    const ang = Math.atan2(nx, nz);
    const P = (along, out) => [d.wx + tx * along + nx * out, d.wz + tz * along + nz * out];
    const side = r() < 0.5 ? 1 : -1;
    // chairs to "tomar el fresco": remember the spot (the neighbours come out in the evening)
    if (h < 0.3) {
      const n = 2 + Math.floor(r() * 3);
      const seats = [];
      let ok = true;
      for (let i = 0; i < n; i++) {
        const along = side * (1.05 + i * 0.66), out = 0.5 + (i === n - 1 && n > 2 ? 0.35 : 0);
        const [x, z] = P(along, out);
        if (!free(x, z, 0.3) || nearOpening(x - nx * out, z - nz * out, 0.05) || offRoad(x, z) < 0.45) { ok = false; break; }
        seats.push({ x, z, ang: ang + side * (i === n - 1 && n > 2 ? -0.7 : -0.12) });
      }
      if (ok && seats.length >= 2) { frescoSpots.push({ x: d.x, z: d.z, seats, kind: r() < 0.55 ? 'sillaPlastico' : r() < 0.6 ? 'sillaEnea' : 'sillaEneaVerde', seed: h, used: false }); stats.fresco++; continue; }
    }
    if (d.measured) continue; // (a house modelled from photographs: its doorstep as it is — fachadas.js)
    // pots on the ground beside the door (claymation: on most doorsteps, as in the user's pictures)
    if (r() < (STYLE.plastilina ? 0.86 : 0.42)) {
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const [x, z] = P(-side * (0.95 + i * 0.38), 0.24);
        if (!free(x, z, 0.12)) continue;
        put(pick(['macetaGeranio', 'macetaGeranio', 'macetaGitanilla', 'macetaAspidistra', 'macetaCactus']), x, 0, z, r() * 6.28, 0.85 + r() * 0.3);
        stats.doorItems++;
      }
      if (r() < 0.4) { const [x, z] = P(side * (0.95 + r() * 0.2), 0.24); if (free(x, z, 0.12)) { put(pick(['macetaGeranio', 'macetaAspidistra']), x, 0, z, r() * 6.28); stats.doorItems++; } }
    }
    const extra = r();
    if (extra < 0.08) { const [x, z] = P(side * 0.95, 0.28); if (free(x, z, 0.15)) { put('butano', x, 0, z, r() * 6.28); stats.doorItems++; } }
    else if (extra < 0.12) { const [x, z] = P(side * 1.0, 0.1); if (free(x, z, 0.1)) put('escoba', x, 0, z, ang); }
    else if (extra < 0.16) { const [x, z] = P(side * 1.55, 0.36); if (free(x, z, 0.3)) (world.twoWheelSpots || (world.twoWheelSpots = [])).push({ model: 'bici', x, z, heading: ang + Math.PI / 2, color: pick(['#c8202a', '#2f5fa8', '#1c1c20', '#f2f2ee', '#3c6e4a']) }); }
    else if (extra < 0.2) { const [x, z] = P(side * 1.0, 0.4); if (free(x, z, 0.25)) put(pick(['sillaPlastico', 'sillaEnea']), x, 0, z, ang + (r() - 0.5) * 0.6); }
    else if (extra < 0.22) { const [x, z] = P(side * 0.95, 0.25); if (free(x, z, 0.2)) put('carro', x, 0, z, ang); }
    else if (extra < 0.245 && d.old) { const [x, z] = P(side * 1.9, 0.2); if (free(x, z, 0.7) && !map.roadAt(x, z, 0.35)) { put('poyete', x, 0, z, ang); col.addCircle(x, z, 0.55, 0.5, -4); } }
    if (r() < 0.035) { const [x, z] = P(side * (0.5 + r() * 0.3), 0.45); if (free(x, z, 0.15)) put(r() < 0.6 ? 'gatoSentado' : 'gatoTumbado', x, 0.13, z, ang + (r() - 0.5) * 2, 1, pick(CAT_COLS)); }
  }
  world.frescoSpots = frescoSpots;
  // (claymation: pots set out under the ground-floor windows too — geraniums, a clipped cypress, an aspidistra — as the
  // user's pictures have them every few steps along the walls)
  if (STYLE.plastilina) for (const wd of world.facadeWindows || []) {
    const r = mulberry32(Math.floor(hash1(Math.floor(wd.x * 29 + wd.z * 13) * 5 + 7) * 1e9));
    if (r() > 0.6) continue;
    const tx = -wd.nz, tz = wd.nx, ang = Math.atan2(wd.nx, wd.nz), n = r() < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const along = (n === 1 ? (r() - 0.5) * 0.4 : i ? 0.32 : -0.32) * Math.min(1, wd.w), x = wd.x + tx * along + wd.nx * 0.26, z = wd.z + tz * along + wd.nz * 0.26;
      if (!free(x, z, 0.14) || nearOpening(x, z, 0.1)) continue;
      put(pick(['macetaGeranio', 'macetaCipres', 'macetaCipres', 'macetaAspidistra', 'macetaGitanilla']), x, 0, z, ang + r() * 6.28, 0.9 + r() * 0.25);
      stats.doorItems++;
    }
  }

  // ---- waste containers: add the glass igloo, bags, boxes and litter around each set
  const conts = (world.breakables || []).filter((b) => b.kind === 'cont');
  const sets = [];
  for (const c of conts) {
    let s = sets.find((t) => Math.hypot(t.x - c.x, t.z - c.z) < 4);
    if (!s) sets.push((s = { x: c.x, z: c.z, n: 0, ang: c.ang, items: [] }));
    s.items.push(c); s.n++;
  }
  for (const s of sets) {
    const r = mulberry32(Math.floor(hash1(Math.floor(s.x * 13 + s.z * 7)) * 1e9));
    const cx = s.items.reduce((a, c) => a + c.x, 0) / s.n, cz = s.items.reduce((a, c) => a + c.z, 0) / s.n;
    const ux = Math.sin(s.ang - Math.PI / 2), uz = Math.cos(s.ang - Math.PI / 2); // along the row
    debug.sets.push({ x: cx, z: cz, ang: s.ang });
    // the green glass igloo at one end of the row
    if (r() < 0.75) { const x = cx + ux * (s.n * 0.75 + 0.9), z = cz + uz * (s.n * 0.75 + 0.9); if (free(x, z, 0.8) && !map.roadAt(x, z, 0.9, true)) { put('iglu', x, 0, z, s.ang); col.addCircle(x, z, 0.8, 1.3, -6); } }
    // bags and boxes piled next to the containers (the containers are always a bit too full)
    const nb = 2 + Math.floor(r() * 6);
    for (let i = 0; i < nb; i++) {
      const along = (r() - 0.5) * s.n * 1.5, out = 0.75 + r() * 0.5;
      const fx = Math.sin(s.ang), fz = Math.cos(s.ang);
      const x = cx + ux * along + fx * out, z = cz + uz * along + fz * out;
      if (!free(x, z, 0.2)) continue;
      const k = r();
      if (k < 0.62) put('bolsa', x, 0, z, r() * 6.28, 0.8 + r() * 0.45, pick(BAG_COLS));
      else if (k < 0.85) put('caja', x, 0, z, r() * 6.28, 0.8 + r() * 0.4);
      else put('carton', x, 0, z, s.ang + (r() - 0.5));
    }
    if (r() < 0.08) { const x = cx - ux * (s.n * 0.75 + 0.6), z = cz - uz * (s.n * 0.75 + 0.6); if (free(x, z, 0.5)) put('colchon', x, 0, z, s.ang + Math.PI / 2); }
    for (let i = 0; i < 6 + Math.floor(r() * 8); i++) { litter(cx + Math.sin(s.ang) * 1.1, cz + Math.cos(s.ang) * 1.1, 1.8); stats.litter++; }
    if (r() < 0.25) { const x = cx + Math.sin(s.ang) * 0.9 + ux * 1.2, z = cz + Math.cos(s.ang) * 0.9 + uz * 1.2; if (free(x, z, 0.2)) put('gatoSentado', x, 0, z, r() * 6.28, 1, pick(CAT_COLS)); }
  }

  // ---- litter along the kerbs of the town streets
  const tmp = {};
  for (const e of map.edges) {
    if (!(e.walk || e.drive) || e.blocked || e.dirt || e.cls === 'track') continue;
    if (!map.inTown(e.pts[0], e.pts[1])) continue;
    const r = mulberry32((e.id * 2654435761) >>> 0);
    for (let s = 3; s < e.len - 3; s += 5 + r() * 6) {
      if (r() > 0.3) continue;
      polySample(e.pts, e.cum, s, tmp);
      const side = r() < 0.5 ? 1 : -1;
      const byWall = r() < 0.45;
      const pav = map.pavementAt(e, s, side), kb = map.kerbAt(e, s, side); // (against the wall where it is, the pavement as wide as it is there)
      const off = byWall ? kb + (pav != null ? Math.max(0.12, pav - 0.15) : e.sw > 0.5 ? e.sw - 0.15 : 0.45) : kb - 0.25;
      const x = tmp.x - tmp.dz * off * side, z = tmp.z + tmp.dx * off * side;
      litter(x, z, 0.25);
      stats.litter++;
    }
  }

  // ---- bars: terraces, stacked crates, chalkboard; shops: fruit crates; pharmacy cross; Correos
  const squares = map.areas.filter((a) => ['place:square', 'highway:pedestrian', 'amenity:marketplace'].includes(a.kind)).map((a) => ({ ring: a.ring, bb: ringBounds(a.ring) }));
  const inSquare = (x, z) => squares.some((s) => x > s.bb[0] && x < s.bb[2] && z > s.bb[1] && z < s.bb[3] && pointInRing(x, z, s.ring));
  const glowGreen = makeNightGlowMaterial(0x22cc55, { dayLevel: 1.0, nightLevel: 2.6 });
  const crosses = new InstanceGroup(G.cruz, glowGreen, { castShadow: false, chunk: 300, maxDist: 400 });
  groups.push(crosses); world.lodGroups.push(crosses);
  const seenBars = [];
  for (const p of map.pois) {
    if (!map.inTown(p.x, p.z)) continue;
    const bar = /^amenity:(bar|cafe|pub|restaurant)$/.test(p.kind);
    const shopFood = /^shop:(greengrocer|convenience|supermarket|farm)$/.test(p.kind);
    const pharmacy = p.kind === 'amenity:pharmacy';
    const post = p.kind === 'amenity:post_office';
    if (!bar && !shopFood && !pharmacy && !post) continue;
    const d = doorFront(map, p);
    if (!d) continue;
    const tx = -d.nz, tz = d.nx;
    const ang = Math.atan2(d.nx, d.nz);
    const r = mulberry32(Math.floor(hash1(Math.floor(p.x * 7 + p.z * 11)) * 1e9));
    const P = (along, out) => [d.x + tx * along + d.nx * out, d.z + tz * along + d.nz * out];
    if (bar) {
      if (seenBars.some((b) => Math.hypot(b.x - d.x, b.z - d.z) < 6)) continue;
      seenBars.push(d);
      const [sx, sz] = P(0, 3.2);
      const wide = inSquare(sx, sz) || (d.edge && (d.edge.sw > 2.2 || d.edge.cls === 'pedestrian' || d.edge.cls === 'living_street'));
      const nT = wide ? 2 + Math.floor(r() * 3) : (d.edge && d.edge.sw > 1.6 ? 1 : 0);
      for (let i = 0; i < nT; i++) {
        const along = (i - (nT - 1) / 2) * 2.3, out = wide ? 2.4 : 1.1;
        const [x, z] = P(along, out);
        if (!free(x, z, 0.9) || map.roadAt(x, z, 1.1, true)) continue; // tables may take the parking lane, never the traffic lanes
        put('mesaTerraza', x, 0, z, 0);
        col.addCircle(x, z, 0.42, 0.8, -4);
        const nC = wide ? 4 : 2;
        for (let c = 0; c < nC; c++) {
          const a = (c / nC) * Math.PI * 2 + (wide ? Math.PI / 4 : Math.PI / 2) + (r() - 0.5) * 0.3;
          const cx = x + Math.sin(a) * 0.62, cz = z + Math.cos(a) * 0.62;
          put('sillaTerraza', cx, 0, cz, a + Math.PI);
          (debug.chairs || (debug.chairs = [])).push({ x: cx, z: cz, a: a + Math.PI, tx: x, tz: z }); // somewhere to sit
        }
        if (wide && r() < 0.75) put('sombrilla', x, 0, z, r() * 6.28, 1, pick(PARASOL));
        for (let k = 0; k < 2; k++) litter(x, z, 1.2);
        stats.terraces++;
        debug.terraces.push({ x, z, nx: d.nx, nz: d.nz });
      }
      if (r() < 0.7) { const [x, z] = P((r() < 0.5 ? -1 : 1) * 1.3, 0.28); if (free(x, z, 0.25)) put('cajasCerveza', x, 0, z, ang + (r() - 0.5) * 0.4); }
      if (r() < 0.55) { const [x, z] = P((r() < 0.5 ? -1 : 1) * 1.1, 0.9); if (free(x, z, 0.3)) put('pizarra', x, 0, z, ang); }
      if (r() < 0.6) { const [x, z] = P(1.6, 0.35); if (free(x, z, 0.25)) put('papelera', x, 0, z, ang); }
      for (let k = 0; k < 6; k++) litter(d.x + d.nx * 1.5, d.z + d.nz * 1.5, 2.2);
    } else if (shopFood) {
      if (r() < 0.8) { const [x, z] = P((r() < 0.5 ? -1 : 1) * 1.5, 0.45); if (free(x, z, 0.7) && !map.roadAt(x, z, 0.6)) { put('frutas', x, 0, z, ang); col.addCircle(x, z, 0.55, 0.8, -4); } }
    } else if (pharmacy) {
      const [x, z] = P(0.9, 0.34);
      crosses.add(x, 3.05, z, ang);
    } else if (post) {
      const [x, z] = P(1.4, 0.5);
      if (free(x, z, 0.3) && !map.roadAt(x, z, 0.3)) { put('buzon', x, 0, z, ang); col.addCircle(x, z, 0.25, 1.2, -4); }
    }
  }

  // ---- squares & pedestrian streets: planters, litter bins; mirrors at narrow blind corners; parked mopeds
  for (const a of map.areas) {
    if (!['place:square', 'highway:pedestrian', 'amenity:marketplace', 'leisure:park'].includes(a.kind)) continue;
    const [x0, z0, x1, z1] = ringBounds(a.ring);
    const area = Math.abs(ringArea(a.ring));
    const r = mulberry32(Math.floor(hash1(Math.floor(x0 * 3 + z0 * 5)) * 1e9));
    const nP = Math.min(8, Math.floor(area / 400));
    for (let i = 0; i < nP; i++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (!pointInRing(x, z, a.ring) || !free(x, z, 0.8) || map.roadAt(x, z, 0.8)) continue;
      put(a.kind === 'leisure:park' ? 'papelera' : 'maceton', x, 0, z, r() * 6.28);
      col.addCircle(x, z, a.kind === 'leisure:park' ? 0.25 : 0.55, 0.9, -4);
    }
    for (let i = 0; i < Math.min(30, area / 120); i++) { const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0); if (pointInRing(x, z, a.ring)) { litter(x, z, 0.3); stats.litter++; } }
  }
  for (const n of map.nodes) {
    if (n.degree < 3 || !map.inTown(n.x, n.z)) continue;
    const es = n.edges.map((i) => map.edges[i]).filter((e) => e.drive);
    if (es.length < 3 || es.some((e) => e.w > 7)) continue;
    if (hash1(n.id * 31 + 7) > 0.3) continue;
    // mirror on the corner opposite to the narrowest arm
    const e = es[0];
    const fromA = e.a === n.id;
    polySample(e.pts, e.cum, fromA ? Math.min(e.len, 4) : Math.max(0, e.len - 4), tmp);
    const dx = tmp.x - n.x, dz = tmp.z - n.z, l = Math.hypot(dx, dz) || 1;
    const px = n.x - (dx / l) * (e.w / 2 + 1.2) - (dz / l) * (e.w / 2 + 0.4), pz = n.z - (dz / l) * (e.w / 2 + 1.2) + (dx / l) * (e.w / 2 + 0.4);
    if (!free(px, pz, 0.2) || map.roadAt(px, pz, 0.2)) continue;
    put('espejo', px, 0, pz, Math.atan2(dx, dz));
    col.addCircle(px, pz, 0.08, 3, -5);
  }
  for (const e of map.edges) {
    if (!e.drive || e.dirt || e.blocked || !map.inTown(e.pts[0], e.pts[1]) || e.len < 25) continue;
    const r = mulberry32((e.id * 40503 + 17) >>> 0);
    for (let s = 12; s < e.len - 12; s += 60 + r() * 80) {
      if (r() > 0.35) continue;
      polySample(e.pts, e.cum, s, tmp);
      const side = r() < 0.5 ? 1 : -1;
      // in the parking lane of wide streets; in narrow ones up on a wide pavement (in the road it blocked the traffic)
      const kb = map.kerbAt(e, s, side), noKerb = e.kerb && (e.kerb.regime === 2 || (e.kerb.regime === 1 && e.kerb.side !== side));
      const off = noKerb ? -1 : e.w >= 7 && kb >= e.w / 2 - 0.3 ? kb - 0.45 : (map.pavementAt(e, s, side) ?? e.sw ?? 0) >= 1.6 ? kb + 0.5 : -1;
      if (off < 0) continue;
      const x = tmp.x - tmp.dz * off * side, z = tmp.z + tmp.dx * off * side;
      if (!free(x, z, 0.4) || nearOpening(x, z, 1.2) || map.roadAt(x, z, 0.3, true)) continue;
      // a real motorbike you can ride (the fleet parks it here)
      (world.twoWheelSpots || (world.twoWheelSpots = [])).push({ model: 'moto', x, z, heading: Math.atan2(tmp.dx, tmp.dz) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.3, color: pick(MOTO_COLS) });
    }
  }

  // ---- roofs: satellite dishes and clothes lines on the azoteas
  for (const p of world.buildingParts || []) {
    if (p.info.style === 'nave' || p.area < 30) continue;
    const h = hash1(p.id * 97 + 13);
    const [cx, cz] = p.c;
    if (!pointInRing(cx, cz, p.ring)) continue;
    if (p.roofKind === 'flat' && h < 0.28 && p.area > 45 && p.area < 400) put('tendedero', cx, p.H + 0.02, cz, h * 40);
    else if (h > 0.86) put('parabolica', cx + (hash1(p.id) - 0.5) * 2, p.H + (p.roofKind === 'flat' ? 0.02 : 0.6), cz, h * 25);
  }

  stats.plates = buildStreetPlates(world, map);
  for (const ig of groups) ig.build(world.root);
  stats.props = world.facades.nProps;
  world.streetLifeStats = stats;
  return { groups, frescoSpots, stats };
}

// ------------------------------------------------------------------ ceramic street-name tiles at the corners
// White glazed tiles with blue lettering and border, one atlas for every street name of the town.
function plateText(name) {
  let t = name.trim();
  t = t.replace(/^Avenida\b/i, 'Avda.').replace(/^Carretera\b/i, 'Ctra.').replace(/^Travesía\b/i, 'Trva.');
  return t.toUpperCase();
}
function buildStreetPlates(world, map) {
  const names = [];
  const index = new Map();
  const edges = map.edges.filter((e) => e.name && (e.drive || e.walk) && !e.blocked && e.len > 14 && map.inTown(e.pts[0], e.pts[1]));
  for (const e of edges) if (!index.has(e.name)) { index.set(e.name, names.length); names.push(e.name); }
  if (!names.length) return 0;
  const TW = 320, TH = 80, COLS = 6;
  const rows = Math.ceil(Math.min(names.length, 150) / COLS);
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = Math.max(128, Math.pow(2, Math.ceil(Math.log2(rows * TH))));
  const x = cv.getContext('2d');
  x.fillStyle = '#e9e6dc'; x.fillRect(0, 0, cv.width, cv.height);
  const blue = '#1f4394';
  names.forEach((n, i) => {
    if (i >= 150) return;
    const cx = (i % COLS) * TW, cy = Math.floor(i / COLS) * TH;
    const g = x.createLinearGradient(cx, cy, cx, cy + TH);
    g.addColorStop(0, '#fbfaf5'); g.addColorStop(1, '#ebe8dd');
    x.fillStyle = g; x.fillRect(cx + 2, cy + 2, TW - 4, TH - 4);
    // tile joints (three tiles side by side), border and corner dots
    x.strokeStyle = 'rgba(120,115,100,0.35)'; x.lineWidth = 1.5;
    for (const k of [1, 2]) { x.beginPath(); x.moveTo(cx + (TW * k) / 3, cy + 3); x.lineTo(cx + (TW * k) / 3, cy + TH - 3); x.stroke(); }
    x.strokeStyle = blue; x.lineWidth = 5; x.strokeRect(cx + 7, cy + 7, TW - 14, TH - 14);
    x.lineWidth = 1.5; x.strokeRect(cx + 13, cy + 13, TW - 26, TH - 26);
    x.fillStyle = blue;
    for (const [dx, dy] of [[16, 16], [TW - 16, 16], [16, TH - 16], [TW - 16, TH - 16]]) { x.beginPath(); x.arc(cx + dx, cy + dy, 3.2, 0, Math.PI * 2); x.fill(); }
    const txt = plateText(n);
    let fs = 30;
    x.font = `bold ${fs}px Georgia, 'Times New Roman', serif`;
    while (x.measureText(txt).width > TW - 44 && fs > 12) { fs -= 1; x.font = `bold ${fs}px Georgia, 'Times New Roman', serif`; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(txt, cx + TW / 2, cy + TH / 2 + 1);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const pos = [], nor = [], uv = [], idx = [];
  const placed = [];
  const tmp = {};
  const W = 0.66, H = 0.165;
  for (const e of edges) {
    const i = index.get(e.name);
    if (i >= 150) continue;
    const u0 = ((i % COLS) * TW + 3) / cv.width, u1 = ((i % COLS) * TW + TW - 3) / cv.width;
    const v1 = 1 - (Math.floor(i / COLS) * TH + 3) / cv.height, v0 = 1 - (Math.floor(i / COLS) * TH + TH - 3) / cv.height;
    for (const end of [0, 1]) {
      const s = end === 0 ? Math.min(7, e.len * 0.3) : Math.max(e.len - 7, e.len * 0.7);
      polySample(e.pts, e.cum, s, tmp);
      for (const side of [1, -1]) {
        if (hash1(e.id * 4 + end * 2 + (side > 0 ? 1 : 0)) > 0.6) continue;
        const nx = -tmp.dz * side, nz = tmp.dx * side;
        const hw = map.kerbAt(e, s, side);
        const t = map.collider.raycast(tmp.x + nx * hw, tmp.z + nz * hw, tmp.x + nx * (hw + 7), tmp.z + nz * (hw + 7), 3.2, 3.2);
        if (t >= 1) continue;
        const d = hw + 7 * t - 0.03;
        const px = tmp.x + nx * d, pz = tmp.z + nz * d;
        if (placed.some((q) => Math.hypot(q[0] - px, q[1] - pz) < 4)) continue;
        placed.push([px, pz]);
        // the plate faces the street (-n), its width runs along the street direction
        const fx = -nx, fz = -nz, ax = tmp.dx, az = tmp.dz;
        const y0 = 2.75, y1 = y0 + H;
        const k = pos.length / 3;
        const L = (a) => [px + ax * a, pz + az * a];
        const [x0, z0] = L(-W / 2), [x1, z1] = L(W / 2);
        // make sure the text reads left-to-right when seen from the street
        const flip = (ax * fz - az * fx) < 0;
        const [xa, za, xb, zb] = flip ? [x1, z1, x0, z0] : [x0, z0, x1, z1];
        pos.push(xa, y0, za, xb, y0, zb, xb, y1, zb, xa, y1, za);
        for (let q = 0; q < 4; q++) nor.push(fx, 0, fz);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        // wind the quad towards the street: face normal of (a, b, c) is cross(b - a, up) = (-e1z, 0, e1x)
        const e1x = xb - xa, e1z = zb - za;
        if (-e1z * fx + e1x * fz >= 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3); else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
      }
    }
  }
  if (!pos.length) return 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  world.root.add(m);
  return placed.length;
}
