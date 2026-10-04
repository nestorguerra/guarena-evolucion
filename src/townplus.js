// More of Guareña, built on what the map knows of it: the fountain of the Plaza de España (where OSM puts it) and the
// plaza round it; the municipal pool; the Pabellón La Encina; the fronts of the Mercado de Abastos, the Casa de la
// Cultura (its theatre) and Agrícola Corbacho on the Carretera de Don Benito, with the palms along that road; the
// Avenida de la Constitución as a boulevard; the town's name in big letters where the road from Mérida comes in.
// Each part is a function of the Landmarks builder (L): L.add / L.put / L.circle / L.poi / L.mat / L.map.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInRing, ringCentroid, orientedRect, mulberry32, clamp, polySample } from './util.js';
import { flagCanvas } from './textures.js';

const llTo = (map, lat, lon) => { const o = map.raw.origin, R = 6378137, KX = Math.cos((o[0] * Math.PI) / 180) * R * Math.PI / 180, KZ = R * Math.PI / 180; return [(lon - o[1]) * KX, -(lat - o[0]) * KZ]; };
function norm(g) {
  if (!g) return null;
  if (!g.index) g = mergeVertices(g);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}
export function merged(list) { const l = list.filter(Boolean).map(norm); return l.length ? mergeGeometries(l, false) : null; }
export const at = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
export const place = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); if (ry) m.rotation.y = ry; return m; };
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);

// ---------------------------------------------------------------- water (shaders: the basin's surface, falling water)
const WATER_VS = `
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
// the surface: rings spreading from where the water falls, a glint of sky, the tiles of the bottom seen through
const POOL_FS = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uNight; uniform vec2 uC; uniform float uRi; uniform float uRo;
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 d = vW.xz - uC; float r = length(d);
  float ring = 0.0;
  for (int i = 0; i < 3; i++) { float rr = uRi + mod(uTime * 0.55 + float(i) * 0.33, 1.0) * (uRo - uRi); ring += smoothstep(0.06, 0.0, abs(r - rr)) * (1.0 - (rr - uRi) / (uRo - uRi)); }
  float w = sin(vW.x * 3.1 + uTime * 1.7) * sin(vW.z * 2.7 - uTime * 1.3) * 0.5 + 0.5;
  float glint = step(0.985, h(floor(vW.xz * 9.0) + floor(uTime * 3.0)));
  vec3 c = mix(uDeep, uShallow, 0.35 + 0.35 * w + 0.3 * smoothstep(uRo, uRo * 0.4, r));
  c += vec3(0.9, 0.95, 1.0) * (ring * 0.45 + glint * 0.6);
  c = mix(c, c * 0.35 + vec3(0.25, 0.45, 0.55) * 0.9, uNight); // (lit from under the water at night)
  gl_FragColor = vec4(c, 0.86);
#include <fog_fragment>
}`;
// falling water: streaks running down (v), flickering, thinner at the edges of the sheet
const FALL_FS = `
uniform float uTime; uniform float uSpeed; uniform float uNight;
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  float u = vUv.x * 110.0, col = floor(u), f = fract(u);
  float off = h(col) * 10.0, sp = uSpeed * (0.8 + 0.4 * h(col + 3.0));
  float s = fract(vUv.y * 2.0 + uTime * sp + off);
  float streak = smoothstep(0.0, 0.3, s) * smoothstep(1.0, 0.7, s) * smoothstep(0.42, 0.05, abs(f - 0.5)) * step(0.35, h(col + 7.0));
  float a = 0.07 + 0.42 * streak;
  vec3 c = mix(vec3(0.82, 0.92, 0.97), vec3(1.0), streak);
  c = mix(c, c * 0.5 + vec3(0.2, 0.4, 0.5), uNight);
  gl_FragColor = vec4(c, a * smoothstep(0.0, 0.08, vUv.y));
#include <fog_fragment>
}`;
export function waterMat(kind, o = {}) {
  const u = { uTime: { value: 0 }, uNight: { value: 0 }, uDeep: { value: new THREE.Color(o.deep || 0x2a7c88) }, uShallow: { value: new THREE.Color(o.shallow || 0x6fc6cf) }, uC: { value: new THREE.Vector2(o.cx || 0, o.cz || 0) }, uRi: { value: o.ri || 0.5 }, uRo: { value: o.ro || 3 }, uSpeed: { value: o.speed || 1.2 } };
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, u]), vertexShader: WATER_VS, fragmentShader: kind === 'fall' ? FALL_FS : POOL_FS, transparent: true, depthWrite: kind !== 'fall', fog: true, side: kind === 'fall' ? THREE.DoubleSide : THREE.FrontSide });
  m.userData.noInk = kind === 'fall';
  return m;
}

// ---------------------------------------------------------------- the fountain of the Plaza de España
// a round granite basin with a moulded rim, a step round it; a pedestal with two bowls, a pine-cone finial spouting;
// the water overflows the bowls in sheets; four spouts from mascarons on the pedestal into the basin
export function fountain(L) {
  const map = L.map, M = L.mat;
  const p = map.pois.find((q) => q.kind === 'amenity:fountain' && Math.hypot(q.x - (L.poi.plaza ? L.poi.plaza.x : -35), q.z - (L.poi.plaza ? L.poi.plaza.z : 40)) < 40);
  const [fx, fz] = p ? [p.x, p.z] : llTo(map, 38.8591608, -6.1029444);
  const g = new THREE.Group(); g.position.set(fx, 0, fz); L.root.add(g);
  const R = 3.6, stone = [], dark = [];
  // the step and the basin's wall with its rounded coping
  stone.push(lathe([[R + 0.75, 0], [R + 0.75, 0.13], [R + 0.38, 0.14], [R + 0.38, 0.0]], 48));
  stone.push(lathe([[R + 0.35, 0.12], [R + 0.38, 0.18], [R + 0.36, 0.36], [R + 0.42, 0.4], [R + 0.4, 0.46], [R + 0.2, 0.5], [R - 0.02, 0.47], [R - 0.06, 0.42], [R - 0.08, 0.12]], 64)); // (low enough to sit on)
  dark.push(new THREE.CircleGeometry(R - 0.06, 48).rotateX(-Math.PI / 2).translate(0, 0.14, 0)); // its floor
  // the pedestal: a square plinth with four mascarons, a baluster, the big bowl; a second baluster, the small bowl
  stone.push(at(new THREE.BoxGeometry(1.15, 0.85, 1.15), 0, 0.55, 0));
  stone.push(at(new THREE.BoxGeometry(1.32, 0.14, 1.32), 0, 1.0, 0), at(new THREE.BoxGeometry(1.32, 0.16, 1.32), 0, 0.2, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    const mask = new THREE.SphereGeometry(0.17, 12, 10); mask.scale(1, 1.15, 0.6); stone.push(at(mask, sx * 0.6, 0.62, sz * 0.6));
    const spout = new THREE.CylinderGeometry(0.03, 0.035, 0.22, 8); spout.rotateX(Math.PI / 2); spout.rotateY(a); dark.push(at(spout, sx * 0.72, 0.58, sz * 0.72));
  }
  stone.push(lathe([[0.38, 1.07], [0.3, 1.2], [0.22, 1.35], [0.3, 1.55], [0.34, 1.62], [0.24, 1.72], [0.2, 1.9]], 24));
  stone.push(lathe([[0.2, 1.88], [0.5, 1.92], [1.15, 2.02], [1.52, 2.12], [1.6, 2.22], [1.56, 2.3], [1.42, 2.27], [0.9, 2.18], [0.3, 2.14], [0.001, 2.14]], 48));
  stone.push(lathe([[0.22, 2.14], [0.16, 2.3], [0.12, 2.45], [0.18, 2.62], [0.1, 2.75], [0.1, 2.85]], 20));
  stone.push(lathe([[0.1, 2.84], [0.35, 2.88], [0.66, 2.96], [0.8, 3.03], [0.78, 3.1], [0.66, 3.08], [0.3, 3.02], [0.001, 3.02]], 36));
  stone.push(lathe([[0.1, 3.02], [0.14, 3.12], [0.16, 3.3], [0.12, 3.45], [0.06, 3.55], [0.001, 3.58]], 16)); // the pine cone
  for (let k = 0; k < 4; k++) { const leaf = new THREE.SphereGeometry(0.09, 8, 6); leaf.scale(1, 1.8, 0.5); stone.push(at(leaf, Math.sin(k * Math.PI / 2) * 0.13, 3.12, Math.cos(k * Math.PI / 2) * 0.13, k * Math.PI / 2)); }
  const sm = new THREE.Mesh(merged(stone), M.sillar); sm.castShadow = true; sm.receiveShadow = true; g.add(sm);
  const dm = new THREE.Mesh(merged(dark), new THREE.MeshStandardMaterial({ color: 0x34505a, roughness: 0.8 })); g.add(dm);
  // the water: in the basin, in both bowls; sheets falling from their rims; jets from the spouts and the finial
  const wb = waterMat('pool', { cx: fx, cz: fz, ri: 1.6, ro: R - 0.1 });
  const wTop = waterMat('pool', { cx: fx, cz: fz, ri: 0.2, ro: 1.45, deep: 0x3a8a96, shallow: 0x8ad6dc });
  const fall = waterMat('fall', { speed: 1.4 });
  const basin = new THREE.Mesh(new THREE.RingGeometry(0.62, R - 0.07, 64, 1).rotateX(-Math.PI / 2), wb); basin.position.y = 0.37; g.add(basin);
  const bowl1 = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.5, 48, 1).rotateX(-Math.PI / 2), wTop); bowl1.position.y = 2.25; g.add(bowl1);
  const bowl2 = new THREE.Mesh(new THREE.CircleGeometry(0.74, 32).rotateX(-Math.PI / 2), wTop); bowl2.position.y = 3.06; g.add(bowl2);
  const sheet1 = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.78, 1.9, 64, 1, true), fall); sheet1.position.y = 2.27 - 0.95; g.add(sheet1);
  const sheet2 = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.88, 0.82, 40, 1, true), fall); sheet2.position.y = 3.08 - 0.41; g.add(sheet2);
  const jets = [];
  for (let k = 0; k < 4; k++) { // the spouts' arcs into the basin
    const a = (k / 4) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a), pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(sx * (0.8 + t * 1.1), 0.58 + 0.18 * t - 0.56 * t * t, sz * (0.8 + t * 1.1))); }
    jets.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 6, false));
  }
  { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(t * 0.5, 3.58 + 0.9 * t - 1.4 * t * t, 0)); } for (let r = 0; r < 4; r++) { const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.025, 6, false); tg.rotateY(r * Math.PI / 2 + Math.PI / 4); jets.push(tg); } } // (from the pine cone into the small bowl)
  const jm = new THREE.Mesh(mergeGeometries(jets), fall); g.add(jm);
  for (const m of [basin, bowl1, bowl2, sheet1, sheet2, jm]) { m.renderOrder = 3; m.userData.noInk = m !== basin && m !== bowl1 && m !== bowl2; }
  L.circle(fx, fz, R + 0.42, 0.5);
  (L.reserved || (L.reserved = [])).push([fx, fz, R + 3.2]);
  L.waterMats = (L.waterMats || []).concat([wb, wTop, fall]);
  L.poi.fuente = { x: fx, z: fz, r: R };
  // the rim to sit on: four places, facing out
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; L.world.spawnSpots.push({ kind: 'bench', x: fx + Math.sin(a) * (R + 0.55), z: fz + Math.cos(a) * (R + 0.55), ang: a, low: true }); }
  return g;
}

// ---------------------------------------------------------------- the Plaza de España round it: a granite ring of paving
// round the fountain, benches facing it (iron and wooden slats), round flower beds with geraniums, bins
export function plazaDetails(L) {
  const map = L.map, M = L.mat, F = L.poi.fuente;
  const plaza = map.areas.find((a) => a.name === 'Plaza de España');
  if (!F || !plaza) return;
  const ring = plaza.ring;
  const g = new THREE.Group(); L.root.add(g);
  // the paving: a ring of granite setts with a band of darker stone
  const pave = new THREE.Mesh(new THREE.RingGeometry(F.r + 0.7, F.r + 3.0, 64, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: L.mat.sillar.map, color: 0xd8d2c6, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  pave.position.set(F.x, 0.012, F.z); pave.receiveShadow = true; g.add(pave);
  const band = new THREE.Mesh(new THREE.RingGeometry(F.r + 2.7, F.r + 3.05, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6c6862, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  band.position.set(F.x, 0.014, F.z); g.add(band);
  // benches: six round the fountain, facing it
  const bench = benchGeo();
  const iron = new THREE.MeshStandardMaterial({ color: 0x1e2a24, roughness: 0.55, metalness: 0.5 }), wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.7 });
  const placeBench = (x, z, ang) => {
    for (const [geo, mat] of [[bench.iron, iron], [bench.wood, wood]]) { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.rotation.y = ang; m.castShadow = true; m.receiveShadow = true; g.add(m); }
    L.circle(x, z, 0.6, 1);
    L.world.spawnSpots.push({ kind: 'bench', x, z, ang });
  };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.25, d = F.r + 4.4, x = F.x + Math.sin(a) * d, z = F.z + Math.cos(a) * d;
    if (!pointInRing(x, z, ring) || map.buildingAt(x, z) || map.roadAt(x, z, 1)) continue;
    placeBench(x, z, a + Math.PI); // (its seat looks at the fountain)
  }
  // round beds of geraniums with a clipped box edge, a bin by each other bench
  const bedM = new THREE.MeshStandardMaterial({ color: 0x3e6b2c, roughness: 0.9 }), soil = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 1 });
  const flowers = [new THREE.MeshStandardMaterial({ color: 0xd8283a, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xe86aa0, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 })];
  const r = mulberry32(31);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, d = F.r + 7.5, x = F.x + Math.sin(a) * d, z = F.z + Math.cos(a) * d;
    if (!pointInRing(x, z, ring) || map.buildingAt(x, z) || map.roadAt(x, z, 1.5)) continue;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.35, 0.42, 24), L.mat.sillar); rim.position.set(x, 0.21, z); rim.castShadow = true; g.add(rim);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.05, 24), soil); s.position.set(x, 0.43, z); g.add(s);
    const hedge = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 24).rotateX(Math.PI / 2), bedM); hedge.position.set(x, 0.5, z); g.add(hedge);
    const fl = [[], [], []], leaves = [];
    for (let i = 0; i < 46; i++) { const aa = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.85; fl[i % 3].push(at(new THREE.SphereGeometry(0.07 + r() * 0.04, 6, 5), x + Math.cos(aa) * rr, 0.55 + r() * 0.12, z + Math.sin(aa) * rr)); }
    for (let i = 0; i < 26; i++) { const aa = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.9, lf = new THREE.SphereGeometry(0.1, 6, 5); lf.scale(1, 0.6, 1); leaves.push(at(lf, x + Math.cos(aa) * rr, 0.5, z + Math.sin(aa) * rr)); }
    fl.forEach((list, i) => { const gm = merged(list); if (gm) g.add(new THREE.Mesh(gm, flowers[i])); });
    g.add(new THREE.Mesh(merged(leaves), bedM));
    L.circle(x, z, 1.35, 0.5);
  }
  const bin = merged([at(new THREE.CylinderGeometry(0.22, 0.2, 0.62, 12, 1, true), 0, 0.58, 0), at(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), 0, 0.45, -0.24), at(new THREE.TorusGeometry(0.22, 0.02, 4, 16).rotateX(Math.PI / 2), 0, 0.89, 0)]);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.8, d = F.r + 5.6, x = F.x + Math.sin(a) * d, z = F.z + Math.cos(a) * d; if (!pointInRing(x, z, ring)) continue; const m = new THREE.Mesh(bin, iron); m.position.set(x, 0, z); m.rotation.y = a; g.add(m); L.circle(x, z, 0.25, 1); }
  g.traverse((o) => { if (o.isMesh && o.material !== pave.material && o.material !== band.material) { o.castShadow = true; o.receiveShadow = true; } });
}
// a bench of the plazas: cast-iron ends with scrolls, slats of wood for the seat and the back
export function benchGeo() {
  if (benchGeo.cache) return benchGeo.cache;
  const iron = [], wood = [];
  for (const sx of [-0.85, 0.85]) {
    const leg = new THREE.Shape(); leg.moveTo(-0.28, 0); leg.quadraticCurveTo(-0.2, 0.25, -0.24, 0.44); leg.lineTo(0.26, 0.44); leg.quadraticCurveTo(0.2, 0.25, 0.3, 0); leg.lineTo(0.24, 0); leg.quadraticCurveTo(0.15, 0.22, 0.2, 0.38); leg.lineTo(-0.18, 0.38); leg.quadraticCurveTo(-0.13, 0.22, -0.22, 0); leg.closePath();
    const lg = new THREE.ExtrudeGeometry(leg, { depth: 0.05, bevelEnabled: false }); lg.rotateY(Math.PI / 2); iron.push(at(lg, sx - 0.025, 0, 0));
    const back = new THREE.Shape(); back.moveTo(-0.24, 0.44); back.quadraticCurveTo(-0.3, 0.6, -0.34, 0.86); back.quadraticCurveTo(-0.3, 0.92, -0.26, 0.86); back.quadraticCurveTo(-0.24, 0.62, -0.18, 0.44); back.closePath();
    const bg = new THREE.ExtrudeGeometry(back, { depth: 0.05, bevelEnabled: false }); bg.rotateY(Math.PI / 2); iron.push(at(bg, sx - 0.025, 0, 0));
    const scroll = new THREE.TorusGeometry(0.06, 0.015, 4, 10); scroll.rotateY(Math.PI / 2); iron.push(at(scroll, sx, 0.5, 0.26));
  }
  for (let i = 0; i < 4; i++) wood.push(at(new THREE.BoxGeometry(1.9, 0.035, 0.09), 0, 0.455, -0.17 + i * 0.12));
  for (let i = 0; i < 3; i++) { const sl = new THREE.BoxGeometry(1.9, 0.09, 0.03); sl.rotateX(-0.28); wood.push(at(sl, 0, 0.6 + i * 0.11, -0.27 - i * 0.025)); }
  return (benchGeo.cache = { iron: merged(iron), wood: merged(wood) });
}
export function updateWater(L, dt, night) {
  for (const m of L.waterMats || []) { m.uniforms.uTime.value += dt; m.uniforms.uNight.value = night; }
}

// ---------------------------------------------------------------- a public building on the map (the theatre, the market…):
// its door on the side that looks at the nearest street, a sign over it, the venue's entry for the Interiors
export function venueFront(L, o) {
  const map = L.map;
  let b = map.buildingAt(o.x, o.z);
  if (!b) { let bd = 30; for (const q of map.buildings) { const d = Math.hypot(q.c[0] - o.x, q.c[1] - o.z); if (d < bd) { bd = d; b = q; } } }
  if (!b) return null;
  const [cx, cz] = b.c;
  L.overrides.set(b.id, { ...(L.overrides.get(b.id) || {}), noShop: true, shop: 0, ...(o.override || {}) });
  // the street in front: the nearest walkable edge to the building (or to the point given)
  const q = map.nearestEdge(o.door ? o.door[0] : cx, o.door ? o.door[1] : cz, 80, (e) => (e.walk || e.drive) && !e.blocked && !e.walkOnly);
  if (!q) return null;
  // from the street towards the building's middle until its wall: the door is there
  let dx = cx - q.x, dz = cz - q.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let wx = q.x, wz = q.z;
  for (let t = 0; t < l; t += 0.25) { const x = q.x + dx * t, z = q.z + dz * t; if (map.buildingAt(x, z) === b) break; wx = x; wz = z; }
  // the wall's own direction there: the ring edge nearest the door point
  const r = b.ring; let best = null;
  for (let i = 0; i < r.length; i += 2) { const j = (i + 2) % r.length, ax = r[i], az = r[i + 1], bx = r[j], bz = r[j + 1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez; if (L2 < 1) continue; let t = ((wx - ax) * ex + (wz - az) * ez) / L2; t = clamp(t, 0, 1); const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(px - wx, pz - wz); if (!best || d < best.d) best = { d, px, pz, ex, ez, L: Math.sqrt(L2) }; }
  let nx = best.ez / best.L, nz = -best.ex / best.L; if (nx * -dx + nz * -dz < 0) { nx = -nx; nz = -nz; } // (out, towards the street)
  const fx = best.px, fz = best.pz;
  const g = new THREE.Group(); g.position.set(fx + nx * 0.03, 0, fz + nz * 0.03); g.rotation.y = Math.atan2(nx, nz); L.root.add(g);
  const M = L.mat;
  // the door: a dark opening with its leaves, a frame; the sign over it
  if (o.doorStyle !== 'none') {
    const dw = o.doorW || 2.0, dh = o.doorH || 2.7;
    g.add(place(new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), M.dark), 0, dh / 2, 0.01));
    const leaf = new THREE.MeshStandardMaterial({ color: o.doorColor || 0x5a3a24, roughness: 0.7, metalness: o.glassDoor ? 0.3 : 0 });
    for (const sx of [-1, 1]) g.add(place(new THREE.Mesh(new THREE.BoxGeometry(dw / 2 - 0.03, dh - 0.05, 0.05), o.glassDoor ? new THREE.MeshStandardMaterial({ color: 0x8aa0aa, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.55 }) : leaf), sx * dw / 4, dh / 2, 0.03));
    for (const [w2, h2, x2, y2] of [[0.12, dh + 0.12, -dw / 2 - 0.06, dh / 2], [0.12, dh + 0.12, dw / 2 + 0.06, dh / 2], [dw + 0.24, 0.12, 0, dh + 0.06]]) g.add(place(new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.1), o.frameMat || M.sillar), x2, y2, 0.05));
  }
  if (o.sign) {
    const tex = new THREE.CanvasTexture(textCanvasOf(o.sign, o.signBg || '#f2ede2', o.signFg || '#2a2a2a', o.signFont)); tex.colorSpace = THREE.SRGBColorSpace;
    const sw = o.signW || 4.2, sh = o.signH || 0.7;
    g.add(place(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })), 0, o.signY || 3.4, 0.08));
  }
  if (o.extra) o.extra(g, { nx, nz, fx, fz });
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const v = { kind: o.kind, name: o.name, sub: o.sub || '', x: fx + nx * 1.2, z: fz + nz * 1.2, fx: fx - nx * 3, fz: fz - nz * 3, seed: o.seed || 5, nx, nz };
  (L.poi.venues || (L.poi.venues = [])).push(v);
  return { g, v, b, nx, nz, fx, fz };
}
function textCanvasOf(txt, bg, fg, font) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 170;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 1024, 170);
  x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 6; x.strokeRect(10, 10, 1004, 150); x.globalAlpha = 1;
  x.fillStyle = fg; x.font = font || 'bold 92px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const lines = txt.split('\n');
  if (lines.length > 1) { x.font = font || 'bold 70px Georgia, serif'; lines.forEach((t, i) => x.fillText(t, 512, 85 + (i - (lines.length - 1) / 2) * 72)); }
  else x.fillText(txt, 512, 90);
  return c;
}
// the Casa de la Cultura and its theatre: the sign, a marquee, the posters either side of the door
export function cultura(L) {
  const p = L.map.pois.find((q) => /Casa de la Cultura/.test(q.name));
  const [x, z] = p ? [p.x, p.z] : llTo(L.map, 38.8595787, -6.1038206);
  venueFront(L, {
    kind: 'teatro', name: 'Casa de la Cultura', sub: 'Teatro · Escuela Municipal de Teatro', x, z, seed: 21,
    sign: 'CASA DE LA CULTURA', signBg: '#f4efe2', signFg: '#5a1e24', signY: 3.9, signW: 5.2, glassDoor: true, doorW: 2.2,
    extra: (g) => {
      // the marquee over the door, «TEATRO» in letters on it; the posters of the season either side
      const mq = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.4), new THREE.MeshStandardMaterial({ color: 0x5a1e24, roughness: 0.6 })); mq.position.set(0, 3.05, 0.7); g.add(mq);
      const tt = new THREE.CanvasTexture(textCanvasOf('TEATRO', '#5a1e24', '#f2d27a', 'bold 110px Georgia, serif')); tt.colorSpace = THREE.SRGBColorSpace;
      const tm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.43), new THREE.MeshStandardMaterial({ map: tt, emissive: 0x6a4a10, emissiveIntensity: 0.4, roughness: 0.5 })); tm.position.set(0, 3.42, 1.41); g.add(tm);
      for (const sx of [-1, 1]) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 360; const q = c.getContext('2d');
        q.fillStyle = sx < 0 ? '#1e2a44' : '#2a1a10'; q.fillRect(0, 0, 256, 360); q.fillStyle = '#f2e0b0'; q.textAlign = 'center'; q.font = 'bold 34px Georgia'; q.fillText(sx < 0 ? 'ESCÉNICAS' : 'LA VIDA', 128, 120); if (sx > 0) q.fillText('ES SUEÑO', 128, 160); q.font = '20px Arial'; q.fillText(sx < 0 ? 'Teatro y danza · julio' : 'Hoy, 20:00 h', 128, 240);
        const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace;
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.26), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.6 })); pm.position.set(sx * 2.0, 1.6, 0.04); g.add(pm);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.38, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.5 })); fr.position.set(sx * 2.0, 1.6, 0.01); g.add(fr);
      }
    },
  });
}

// the Mercado de Abastos (1924–25): an arched door under a gable with its name and its year
export function mercadoFront(L, x, z) {
  venueFront(L, {
    kind: 'mercado', name: 'Mercado de Abastos', sub: 'Desde 1925', x, z, seed: 31, doorW: 2.6, doorH: 3.3, doorColor: 0x2e5a3a,
    sign: 'MERCADO DE ABASTOS', signBg: '#e8d8b0', signFg: '#3a2a18', signY: 5.0, signW: 4.6, signH: 0.62,
    override: { minFloors: 2 },
    extra: (g) => {
      const M = L.mat;
      // the gable crowning the front, the year in it; pilasters either side of the door; a fan-light of iron
      const gab = new THREE.Shape(); gab.moveTo(-3.4, 0); gab.lineTo(3.4, 0); gab.lineTo(0, 1.5); gab.closePath();
      g.add(place(new THREE.Mesh(new THREE.ExtrudeGeometry(gab, { depth: 0.25, bevelEnabled: false }), M.sillar), 0, 5.62, 0));
      const yr = new THREE.CanvasTexture(textCanvasOf('1 9 2 5', '#d8c8a0', '#3a2a18', 'bold 100px Georgia, serif')); yr.colorSpace = THREE.SRGBColorSpace;
      g.add(place(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.27), new THREE.MeshStandardMaterial({ map: yr, roughness: 0.7 })), 0, 6.08, 0.27));
      g.add(place(new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 0.4), M.sillar), 0, 5.5, 0.15));
      for (const sx of [-1, 1]) g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.4, 0.25), M.sillar), sx * 2.0, 2.7, 0.1));
      const fan = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.6 })); fan.position.set(0, 3.3, 0.03); g.add(fan);
      for (let i = 0; i < 7; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.25, 0.03), new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.4, metalness: 0.6 })); bar.geometry.translate(0, 0.62, 0); bar.position.set(0, 3.3, 0.06); bar.rotation.z = -Math.PI / 2 + (i / 6) * Math.PI; g.add(bar); }
    },
  });
}

// ---------------------------------------------------------------- Agrícola Corbacho (Ctra. de Don Benito, 16)
// The tractor dealer's showroom and workshop behind the service road: the name across the front (our own lettering, a
// tractor drawn beside it), the showroom glass, the workshop's roller door, a pole sign by the road and new tractors out
// on the forecourt; the palms along the Carretera de Don Benito from the Parque San Ginés to its door
function corbachoSign() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#2f7a2e'; x.fillRect(0, 0, 1024, 200);
  x.fillStyle = '#f2c230'; x.fillRect(0, 168, 1024, 14);
  // a tractor, side on, in yellow
  x.fillStyle = '#f2c230'; x.strokeStyle = '#f2c230'; x.lineWidth = 9;
  x.fillRect(46, 62, 70, 40); x.fillRect(100, 40, 44, 62); x.clearRect(108, 48, 28, 26); x.fillStyle = '#2f7a2e'; x.fillRect(108, 48, 28, 26); x.fillStyle = '#f2c230';
  x.fillRect(58, 44, 7, 20);
  x.beginPath(); x.arc(130, 120, 34, 0, 6.283); x.stroke(); x.beginPath(); x.arc(130, 120, 10, 0, 6.283); x.fill();
  x.beginPath(); x.arc(62, 128, 22, 0, 6.283); x.stroke(); x.beginPath(); x.arc(62, 128, 6, 0, 6.283); x.fill();
  x.fillStyle = '#ffffff'; x.textBaseline = 'middle';
  const fit = (txt, px, maxW, face) => { let s = px; x.font = face(s); while (x.measureText(txt).width > maxW && s > 16) { s -= 2; x.font = face(s); } };
  fit('AGRÍCOLA CORBACHO', 92, 1024 - 196 - 28, (s) => `bold ${s}px "Arial Black", Arial, sans-serif`); x.fillText('AGRÍCOLA CORBACHO', 196, 84);
  fit('TRACTORES  ·  TALLER  ·  RECAMBIOS', 34, 1024 - 200 - 28, (s) => `bold ${s}px Arial, sans-serif`); x.fillStyle = '#e8f2dc'; x.fillText('TRACTORES  ·  TALLER  ·  RECAMBIOS', 200, 146);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function corbacho(L) {
  const signTex = corbachoSign();
  const res = venueFront(L, {
    kind: 'corbacho', name: 'Agrícola Corbacho', sub: 'Tractores · Taller · Recambios', x: 640, z: -226, door: [645, -250], seed: 41,
    glassDoor: true, doorW: 2.4, doorH: 2.8, frameMat: new THREE.MeshStandardMaterial({ color: 0x2f7a2e, roughness: 0.5 }),
    override: { minFloors: 2 },
    extra: (g) => {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.05), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.12 }));
      sign.position.set(0, 4.6, 0.09); g.add(sign);
      const band = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 0.12), new THREE.MeshStandardMaterial({ color: 0x24602a, roughness: 0.5 })); band.position.set(0, 3.45, 0.06); g.add(band);
      // the showroom glass either side of the door, the workshop's roller door at one end
      const glass = new THREE.MeshStandardMaterial({ color: 0x5c7680, roughness: 0.08, metalness: 0.5 });
      const frame = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.4 });
      for (const sx of [-1, 1]) {
        const gp = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.9), glass); gp.position.set(sx * 3.75, 1.55, 0.05); g.add(gp);
        for (const fx2 of [1.65, 3.75, 5.85]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.95, 0.08), frame); f.position.set(sx * fx2, 1.55, 0.07); g.add(f); }
        const ft = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.08, 0.08), frame); ft.position.set(sx * 3.75, 3.02, 0.07); g.add(ft);
      }
      const rc = document.createElement('canvas'); rc.width = 64; rc.height = 256; const rx = rc.getContext('2d');
      for (let i = 0; i < 32; i++) { rx.fillStyle = i % 2 ? '#a8adb0' : '#c8ccce'; rx.fillRect(0, i * 8, 64, 8); }
      const rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace;
      const roll = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.8), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.5, metalness: 0.5 })); roll.position.set(-7.4, 1.9, 0.05); g.add(roll);
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.45, 0.5), frame); box.position.set(-7.4, 4.0, 0.25); g.add(box);
      // the pole sign by the road
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6.4, 10), frame); pole.position.set(12.9, 3.2, 4.0); g.add(pole);
      const ps = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 3.4), new THREE.MeshStandardMaterial({ color: 0x2f7a2e, roughness: 0.5 })); ps.position.set(12.9, 6.1, 4.0); g.add(ps);
      for (const sx of [-1, 1]) { const face = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.64), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5 })); face.position.set(12.9 + sx * 0.16, 6.1, 4.0); face.rotation.y = sx * Math.PI / 2; g.add(face); } // (read from along the road)
    },
  });
  if (!res) return;
  const { nx, nz, fx, fz } = res;
  const tx = nz, tz = -nx; // (along the facade)
  const W = (lx, lz) => [fx + tx * lx + nx * lz, fz + tz * lx + nz * lz];
  { const [px, pz] = W(12.9, 4.0); L.circle(px, pz, 0.2, 3); }
  // the new tractors along the front, before the showroom glass (you can take one: they are not locked); the place in
  // front of the workshop's door where yours waits
  const along = Math.atan2(tx, tz);
  L.vehicleSpots = L.vehicleSpots || [];
  for (const [lx, col] of [[8.7, '#3f8f2a'], [13.3, '#3f8f2a']]) { const [px, pz] = W(lx, 2.6); L.vehicleSpots.push({ x: px, z: pz, heading: along, model: 'tractor', color: col }); } // (past the showroom glass: the way in stays clear)
  const [yx, yz] = W(-7.4, 2.9);
  L.poi.corbacho = { x: res.v.x, z: res.v.z, yard: { x: yx, z: yz, heading: along + Math.PI } };
  palmRoad(L, res);
}
// the palms of the Carretera de Don Benito: both sides, from the Parque San Ginés to Agrícola Corbacho
function palmRoad(L, res) {
  const map = L.map, extra = L.world.extraTrees || (L.world.extraTrees = []);
  const park = map.areas.find((a) => a.name === 'Parque San Ginés');
  const xA = park ? ringCentroid(park.ring)[0] + 10 : -220, xB = res ? res.fx + 25 : 660;
  let n = 0;
  for (const e of map.edges) {
    if (e.name !== 'Carretera de Don Benito' || !e.drive) continue;
    for (let s = 4; s < e.len - 2; s += 12) {
      let i = 0; while (i < e.cum.length - 2 && e.cum[i + 1] < s) i++;
      const t = (s - e.cum[i]) / Math.max(1e-6, e.cum[i + 1] - e.cum[i]);
      const ax = e.pts[i * 2], az = e.pts[i * 2 + 1], bx = e.pts[i * 2 + 2], bz = e.pts[i * 2 + 3];
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (x < xA || x > xB) continue;
      const l = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / l, dz = (bz - az) / l;
      for (const side of [1, -1]) {
        const off = e.w / 2 + 2.4, px = x - dz * off * side, pz = z + dx * off * side;
        if (map.buildingAt(px, pz)) continue;
        const q = map.nearestEdge(px, pz, 10, (o) => o !== e);
        if (q && q.d < q.edge.w / 2 + 1.2) continue;
        extra.push({ kind: 'palmera', x: px, z: pz, s: 0.92 + ((n * 37) % 10) * 0.016 });
        n++;
      }
    }
  }
  L.poi.palmRoad = n;
}

// ---------------------------------------------------------------- the Pabellón Municipal La Encina
// its name over the doors (the town's blue), a canopy over the way in, the band of polycarbonate high along the front,
// the three flags by the door
export function pabellonFront(L) {
  const p = L.map.areas.find((a) => /La Encina/.test(a.name) && a.kind === 'leisure:sports_centre');
  const [x, z] = p ? ringCentroid(p.ring) : llTo(L.map, 38.8560056, -6.0904921);
  venueFront(L, {
    kind: 'pabellon', name: 'Pabellón Municipal La Encina', sub: 'Polideportivo cubierto', x, z, seed: 51, glassDoor: true, doorW: 2.6, doorH: 2.6,
    sign: 'PABELLÓN MUNICIPAL LA ENCINA', signBg: '#1f5fa8', signFg: '#ffffff', signFont: 'bold 74px Arial, sans-serif', signY: 4.0, signW: 9.0, signH: 1.0,
    frameMat: new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.5 }),
    override: { style: 'nave', tint: [0.93, 0.95, 0.98], minFloors: 3 },
    extra: (g) => {
      const can = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.2, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 })); can.position.set(0, 3.0, 1.2); g.add(can);
      for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.6 })); post.position.set(sx * 2.8, 1.5, 2.3); g.add(post); }
      const band = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.3), new THREE.MeshStandardMaterial({ color: 0xf2f0e6, emissive: 0xe8e4d0, emissiveIntensity: 0.25, roughness: 0.4 })); band.position.set(0, 6.6, 0.05); g.add(band);
      for (const [i, kind] of [[-1, 'es'], [0, 'ex'], [1, 'eu']]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 7, 8), new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.3, metalness: 0.8 })); pole.position.set(5.2 + i * 1.1, 3.5, 3.0); g.add(pole);
        const t = new THREE.CanvasTexture(flagCanvas(kind)); t.colorSpace = THREE.SRGBColorSpace;
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 })); fl.position.set(5.2 + i * 1.1 + 0.62, 6.5, 3.0); g.add(fl);
      }
    },
  });
}

// ---------------------------------------------------------------- big block letters (a 5 × 7 grid, each run of cells a box)
const GLYPHS = {
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
};
// one geometry per letter (centred on x, standing on y = 0, facing +z): word, cell size, depth
export function blockLetters(word, cell = 0.3, depth = 0.4, gap = 1.2) {
  const out = [];
  const letters = [...word];
  const W = letters.length * 5 * cell + (letters.length - 1) * gap * cell;
  let x0 = -W / 2;
  for (const ch0 of letters) {
    const accent = ch0 === 'É' || ch0 === 'Á', tilde = ch0 === 'Ñ';
    const ch = ch0 === 'Ñ' ? 'N' : ch0 === 'É' ? 'E' : ch0 === 'Á' ? 'A' : ch0;
    const g = GLYPHS[ch];
    const parts = [];
    if (g) for (let row = 0; row < 7; row++) {
      const y = (6 - row) * cell;
      let c = 0;
      while (c < 5) {
        if (g[row][c] !== '1') { c++; continue; }
        let e = c; while (e < 5 && g[row][e] === '1') e++;
        const b = new THREE.BoxGeometry((e - c) * cell, cell, depth); b.translate(x0 + ((c + e) / 2) * cell, y + cell / 2, 0); parts.push(b);
        c = e;
      }
    }
    if (tilde) { for (const [cx, cy] of [[0.5, 7.4], [1.5, 7.7], [2.5, 7.4], [3.5, 7.1], [4.5, 7.4]]) { const b = new THREE.BoxGeometry(cell, cell * 0.6, depth); b.translate(x0 + cx * cell, cy * cell, 0); parts.push(b); } }
    if (accent) { const b = new THREE.BoxGeometry(cell * 1.6, cell * 0.55, depth); b.rotateZ(0.6); b.translate(x0 + 3.0 * cell, 7.6 * cell, 0); parts.push(b); }
    if (parts.length) out.push(merged(parts));
    x0 += (5 + gap) * cell;
  }
  return { letters: out, width: W };
}

// ---------------------------------------------------------------- the town's name where the road from Mérida comes in
// GUAREÑA in big letters on a low granite plinth, on the verge just past the roundabout of the EX-307, turned to the
// drivers coming in; floodlit at night
export function entranceLetters(L) {
  const map = L.map;
  // the road into town from the roundabout where the EX-307 (from Mérida) arrives
  const e = map.edges.find((q) => q.name === 'Carretera de Don Benito a Portugal por Almendralejo' && Math.hypot(q.pts[0] + 683.3, q.pts[1] + 715.8) < 3)
    || map.edges.find((q) => q.name === 'Carretera de Don Benito a Portugal por Almendralejo' && Math.hypot(q.pts[0] + 683, q.pts[1] + 716) < 40);
  if (!e) return;
  let spot = null;
  for (const s of [55, 70, 85, 100, 40]) {
    const p = polySample(e.pts, e.cum, Math.min(s, e.len - 5), {});
    for (const side of [1, -1]) {
      const off = e.w / 2 + 7, x = p.x - p.dz * off * side, z = p.z + p.dx * off * side;
      if (map.buildingAt(x, z) || map.buildingAt(x + p.dx * 7, z + p.dz * 7) || map.buildingAt(x - p.dx * 7, z - p.dz * 7)) continue;
      const q = map.nearestEdge(x, z, 12, (o) => o !== e && o.drive);
      if (q && q.d < q.edge.w / 2 + 4) continue;
      // facing the traffic coming from the roundabout (against the edge's direction), turned a little towards the road
      spot = { x, z, ang: Math.atan2(-p.dx, -p.dz) + side * 0.55 };
      break;
    }
    if (spot) break;
  }
  if (!spot) return;
  const g = new THREE.Group(); g.position.set(spot.x, 0, spot.z); g.rotation.y = spot.ang; L.root.add(g);
  const { letters, width } = blockLetters('GUAREÑA', 0.36, 0.45, 1.1);
  const cols = [0xf6f2e8, 0xf6f2e8, 0xf6f2e8, 0xf6f2e8, 0xf6f2e8, 0xf2c230, 0xf6f2e8];
  letters.forEach((lg, i) => { const m = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.45, emissive: 0x302820, emissiveIntensity: 0.2 })); m.position.y = 0.55; m.castShadow = true; g.add(m); });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.55, 1.4), L.mat.sillar); plinth.position.y = 0.275; plinth.castShadow = true; plinth.receiveShadow = true; g.add(plinth);
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 0.12, 4.2), new THREE.MeshStandardMaterial({ color: 0x6aa84a, roughness: 0.95 })); lawn.position.set(0, 0.06, 0.6); g.add(lawn);
  for (const k of [-0.36, 0, 0.36]) { const lp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2c30 })); lp.position.set(k * width, 0.1, 1.9); g.add(lp); const wp = g.localToWorld(new THREE.Vector3(k * width, 0.6, 1.6)); L.world.lampPoints.push(wp.x, 0.6, wp.z); }
  g.updateMatrixWorld(true);
  const a = g.localToWorld(new THREE.Vector3(-width / 2 - 0.7, 0, 0)), b = g.localToWorld(new THREE.Vector3(width / 2 + 0.7, 0, 0));
  L.seg(a.x, a.z, b.x, b.z, 2.6);
  L.poi.letrasGuarena = { x: spot.x, z: spot.z };
}

// ---------------------------------------------------------------- the road to Mérida
// From where the EX-307 leaves the map, on through the dehesa (holm oaks, the odd olive grove) for some four and a half
// kilometres — a few minutes at the wheel — to the gates of Mérida: a roundabout, MÉRIDA in big letters, the arches of
// the aqueduct of Los Milagros against the sky and the city beyond; the road closed there (Mérida is still to be
// built): round the roundabout and back.
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#55585c'; x.fillRect(0, 0, 128, 512);
  const r = mulberry32(17); for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '30,30,32' : '120,122,126'},${0.15 + r() * 0.2})`; x.fillRect(r() * 128, r() * 512, 2, 2); }
  x.fillStyle = '#f2f2ee'; x.fillRect(6, 0, 4, 512); x.fillRect(118, 0, 4, 512);   // the edge lines
  x.fillRect(62, 0, 4, 200); x.fillRect(62, 256, 4, 200);                          // the dashed centre line
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
export function meridaRoad(L) {
  const map = L.map;
  const ex = map.edges.filter((e) => e.name === 'EX-307');
  if (!ex.length) return;
  // where the EX-307 ends furthest from the town: the start of our road
  let start = null, dir = null;
  for (const e of ex) for (const end of [0, 1]) {
    const i = end ? e.pts.length - 2 : 0, x = e.pts[i], z = e.pts[i + 1];
    if (!start || Math.hypot(x, z) > Math.hypot(start[0], start[1])) { start = [x, z]; const j = end ? e.pts.length - 4 : 2; const l = Math.hypot(x - e.pts[j], z - e.pts[j + 1]) || 1; dir = [(x - e.pts[j]) / l, (z - e.pts[j + 1]) / l]; }
  }
  // its line: on the way it was going, bending round to the west, towards Mérida
  const ctrl = [[start[0], start[1]], [start[0] + dir[0] * 300, start[1] + dir[1] * 300]];
  const goal = [start[0] - 3900, start[1] - 1500];
  ctrl.push([ctrl[1][0] - 420, ctrl[1][1] - 420], [ctrl[1][0] - 1300, ctrl[1][1] - 820], [goal[0] + 1500, goal[1] + 120], [goal[0] + 500, goal[1] + 20], goal);
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const LEN = curve.getLength(), N = Math.ceil(LEN / 4);
  const pts = curve.getSpacedPoints(N);
  const RW = 7.6, SW = 1.8;
  const pos = [], uv = [], idx = [], spos = [], suv = [], sidx = [];
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const p = pts[i], q = pts[Math.min(N, i + 1)], o = pts[Math.max(0, i - 1)];
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    if (i) acc += p.distanceTo(pts[i - 1]);
    for (const s of [-1, 1]) { pos.push(p.x + nx * RW / 2 * s, 0.03, p.z + nz * RW / 2 * s); uv.push(s < 0 ? 0 : 1, acc / 16); }
    for (const s of [-1, 1]) { spos.push(p.x + nx * (RW / 2 + SW) * s, 0.02, p.z + nz * (RW / 2 + SW) * s, p.x + nx * (RW / 2) * s, 0.02, p.z + nz * (RW / 2) * s); suv.push(0, acc / 4, 1, acc / 4); }
    if (i < N) {
      const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const b = i * 4; sidx.push(b, b + 4, b + 1, b + 1, b + 4, b + 5, b + 2, b + 3, b + 6, b + 3, b + 7, b + 6);
    }
  }
  // the cars feel asphalt on it (the fleet asks: off the map's streets, is this the road to Mérida?)
  const CELL = 40, cells = new Map();
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[i + 1]; for (const p of [a, b]) { const k = Math.floor(p.x / CELL) + ':' + Math.floor(p.z / CELL); let l = cells.get(k); if (!l) cells.set(k, (l = [])); if (l[l.length - 1] !== i) l.push(i); } }
  const ringR = 19, half = RW / 2 + SW;
  (L.extraRoads || (L.extraRoads = [])).push({
    on: (x, z) => {
      if (L.poi.merida && Math.hypot(x - L.poi.merida.x, z - L.poi.merida.z) < ringR + 1) return true;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of cells.get((cx + a) + ':' + (cz + b)) || []) {
        const A = pts[i], B = pts[i + 1], ex2 = B.x - A.x, ez2 = B.z - A.z, L2 = ex2 * ex2 + ez2 * ez2 || 1, t = clamp(((x - A.x) * ex2 + (z - A.z) * ez2) / L2, 0, 1);
        if (Math.hypot(x - A.x - ex2 * t, z - A.z - ez2 * t) < half) return true;
      }
      return false;
    },
  });
  const off = { polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -40 };
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.85, side: THREE.DoubleSide, ...off })); road.receiveShadow = true; L.root.add(road);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2)); sg.setIndex(sidx); sg.computeVertexNormals();
  L.root.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 })));
  // posts every 50 m, a kilometre stone each kilometre, the signs; holm oaks out in the dehesa
  const r = mulberry32(307), posts = [], bands = [], stones = [];
  const at2 = (t) => { const p = curve.getPointAt(clamp(t, 0, 1)), a = curve.getPointAt(clamp(t - 0.0005, 0, 1)), b = curve.getPointAt(clamp(t + 0.0005, 0, 1)); const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: p.x, z: p.z, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l }; };
  for (let s = 20; s < LEN - 80; s += 50) {
    const p = at2(s / LEN);
    for (const side of [-1, 1]) { const x = p.x - p.dz * (RW / 2 + SW + 0.4) * side, z = p.z + p.dx * (RW / 2 + SW + 0.4) * side; const g = new THREE.BoxGeometry(0.12, 1.0, 0.12); g.translate(x, 0.5, z); posts.push(g); const b = new THREE.BoxGeometry(0.13, 0.18, 0.13); b.translate(x, 0.85, z); bands.push(b); }
  }
  for (let k = 1; k * 1000 < LEN - 100; k++) { const p = at2((k * 1000) / LEN); const x = p.x - p.dz * (RW / 2 + SW + 1.0), z = p.z + p.dx * (RW / 2 + SW + 1.0); const g = new THREE.BoxGeometry(0.45, 0.8, 0.2); g.rotateY(Math.atan2(p.dx, p.dz)); g.translate(x, 0.4, z); stones.push(g); }
  // the fields along the way (stubble, ploughland, green crops, the odd vineyard), over the plain of the horizon
  const fieldCols = [0xd8c48a, 0xc8a878, 0x9a7a52, 0x8aa858, 0xb8b070, 0xd2bc80];
  const fieldsBy = fieldCols.map(() => []);
  for (let s2 = 0; s2 < LEN; s2 += 140) {
    const p = at2(s2 / LEN);
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const d = 16 + k * 170 + r() * 20, w = 110 + r() * 60, dd = 120 + r() * 60;
      const cxf = p.x - p.dz * (d + dd / 2) * side, czf = p.z + p.dx * (d + dd / 2) * side;
      const f = new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2); f.rotateY(Math.atan2(p.dx, p.dz)); f.translate(cxf, 0.012, czf);
      fieldsBy[Math.floor(r() * fieldCols.length)].push(f);
    }
  }
  fieldsBy.forEach((list, i) => { const g = merged(list); if (g) { const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: fieldCols[i], roughness: 1, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 })); m.receiveShadow = true; L.root.add(m); } });
  // holm oaks of the dehesa, thicker near the road (instanced: there are many)
  const NT = 1600, trM = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6, 1, true); trunkG.translate(0, 1.1, 0);
  const crownG = new THREE.IcosahedronGeometry(2.6, 0); crownG.scale(1.25, 0.62, 1.25); crownG.translate(0, 3.2, 0);
  const trI = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }), NT);
  const crI = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0x4a6a32, roughness: 0.95, flatShading: true }), NT);
  let nt = 0;
  for (let i = 0; i < NT * 3 && nt < NT; i++) {
    const t = r(), p = at2(t * 0.985), side = r() < 0.5 ? -1 : 1, d = 13 + Math.pow(r(), 1.5) * 320;
    const x = p.x - p.dz * d * side + (r() - 0.5) * 14, z = p.z + p.dx * d * side + (r() - 0.5) * 14;
    if (Math.hypot(x - start[0], z - start[1]) < 120) continue; // (not over the map's own countryside)
    const sc = 0.75 + r() * 0.65;
    q4.setFromAxisAngle(sv.set(0, 1, 0), r() * 6.283); trM.compose(pv.set(x, 0, z), q4, sv.set(sc, sc * (0.9 + r() * 0.2), sc));
    trI.setMatrixAt(nt, trM); crI.setMatrixAt(nt, trM); nt++;
  }
  trI.count = crI.count = nt; crI.castShadow = true;
  L.root.add(trI); L.root.add(crI);
  const add = (list, mat, cast = false) => { const g = merged(list); if (!g) return null; const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = true; L.root.add(m); return m; };
  add(posts, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
  add(bands, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 }));
  add(stones, new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.8 }));
  // the direction signs: at the start and halfway (white, black letters, the distance left)
  const signAt = (t, lines) => {
    const p = at2(t);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 512, 256); x.strokeStyle = '#1c1c1e'; x.lineWidth = 10; x.strokeRect(12, 12, 488, 232);
    x.fillStyle = '#1c1c1e'; x.font = 'bold 64px Arial'; x.textBaseline = 'middle'; lines.forEach((l, i) => { x.textAlign = 'left'; x.fillText(l[0], 40, 80 + i * 96); x.textAlign = 'right'; x.fillText(l[1], 472, 80 + i * 96); });
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group(); g.position.set(p.x - p.dz * (RW / 2 + SW + 1.6), 0, p.z + p.dx * (RW / 2 + SW + 1.6)); g.rotation.y = Math.atan2(-p.dx, -p.dz); L.root.add(g); // (facing the drivers on their way)
    for (const sx of [-0.9, 0.9]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6, roughness: 0.4 })); pl.position.set(sx, 1.4, 0); g.add(pl); }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.6 })); face.position.set(0, 2.4, 0.05); g.add(face);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x9aa0a4 })); back.position.set(0, 2.4, 0.04); back.rotation.y = Math.PI; g.add(back);
  };
  signAt(0.02, [['Mérida', String(Math.round(LEN / 1000 * 10) / 10).replace('.', ',') + ' km'], ['A-5', 'Badajoz']]);
  signAt(0.55, [['Mérida', String(Math.round(LEN * 0.45 / 100) / 10).replace('.', ',') + ' km']]);
  // ---- the gates of Mérida
  const end = at2(1), cx = end.x + end.dx * 17, cz = end.z + end.dz * 17, ang = Math.atan2(end.dx, end.dz);
  const G = new THREE.Group(); G.position.set(cx, 0, cz); G.rotation.y = ang; L.root.add(G);
  // the roundabout: its asphalt ring, the kerb, the grass in the middle with an olive tree
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 19, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9, ...off })); ring.position.y = 0.03; G.add(ring);
  const isle = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.2, 0.35, 40), new THREE.MeshStandardMaterial({ color: 0x6aa84a, roughness: 0.95 })); isle.position.y = 0.17; G.add(isle);
  const kerb = new THREE.Mesh(new THREE.TorusGeometry(9.1, 0.18, 6, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 })); kerb.position.y = 0.2; G.add(kerb);
  L.circle(cx, cz, 9.1, 0.6);
  // MÉRIDA on the island, facing the way you come
  const { letters, width } = blockLetters('MÉRIDA', 0.42, 0.5, 1.1);
  for (const lg of letters) { const m = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.4, emissive: 0x302820, emissiveIntensity: 0.25 })); m.position.set(0, 0.35, -4.0); m.rotation.y = Math.PI; m.castShadow = true; G.add(m); }
  { const pl = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 0.3, 1.2), L.mat.sillar); pl.position.set(0, 0.5, -4.0); G.add(pl); }
  { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#8a3a24'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#f2ede0'; x.font = 'italic bold 52px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Augusta Emerita', 256, 50); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.26), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); m.position.set(0, 0.5, -4.62); m.rotation.y = Math.PI; G.add(m); }
  // beyond: the road closed (barriers, the works sign), and the city out of reach
  const bar = [];
  for (let k = -5; k <= 5; k++) { const b = new THREE.BoxGeometry(1.9, 0.9, 0.3); b.translate(k * 2, 0.45, 26); bar.push(b); }
  const bm = new THREE.Mesh(merged(bar), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); for (let i = -2; i < 8; i++) { x.fillStyle = i % 2 ? '#d8382e' : '#f4f4f0'; x.beginPath(); x.moveTo(i * 24, 64); x.lineTo(i * 24 + 24, 64); x.lineTo(i * 24 + 56, 0); x.lineTo(i * 24 + 32, 0); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.6 }));
  G.add(bm);
  { const c = document.createElement('canvas'); c.width = 512; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#f2c230'; x.fillRect(0, 0, 512, 300); x.strokeStyle = '#1c1c1e'; x.lineWidth = 12; x.strokeRect(10, 10, 492, 280); x.fillStyle = '#1c1c1e'; x.textAlign = 'center'; x.font = 'bold 54px Arial'; x.fillText('MÉRIDA', 256, 80); x.font = 'bold 34px Arial'; x.fillText('Ciudad en obras', 256, 140); x.font = '30px Arial'; x.fillText('Aún no se puede entrar.', 256, 196); x.fillText('Da la vuelta en la rotonda.', 256, 244); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sg2 = new THREE.Group(); sg2.position.set(0, 0, 25.4); G.add(sg2);
    for (const sx of [-1.1, 1.1]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6 })); pl.position.set(sx, 1.6, 0); sg2.add(pl); }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.65), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); face.position.set(0, 2.5, -0.05); face.rotation.y = Math.PI; sg2.add(face); }
  G.updateMatrixWorld(true);
  const wA = G.localToWorld(new THREE.Vector3(-600, 0, 27)), wB = G.localToWorld(new THREE.Vector3(600, 0, 27));
  L.seg(wA.x, wA.z, wB.x, wB.z, 2.0);
  for (const sx of [-1, 1]) { const a = G.localToWorld(new THREE.Vector3(sx * 600, 0, 27)), b = G.localToWorld(new THREE.Vector3(sx * 600, 0, -1200)); L.seg(a.x, a.z, b.x, b.z, 2.0); } // (no way round it over the fields either)
  // the aqueduct of Los Milagros: granite piers banded with brick, three tiers of arches, against the sky
  const gran = [], brick = [];
  const AZ = 230, NP = 26, SP = 9.5;
  for (let i = 0; i < NP; i++) {
    const x = (i - (NP - 1) / 2) * SP, h = 24 - Math.abs(i - NP / 2) * 0.35;
    for (let k = 0; k < 6; k++) { const y0 = k * h / 6; const g = new THREE.BoxGeometry(3.0, h / 6 - 0.7, 3.0); g.translate(x, y0 + (h / 6 - 0.7) / 2, AZ); gran.push(g); const b = new THREE.BoxGeometry(3.05, 0.7, 3.05); b.translate(x, y0 + h / 6 - 0.35, AZ); brick.push(b); }
    if (i < NP - 1) for (const y of [8.5, 16.5]) { const a = new THREE.BoxGeometry(SP - 3.0, 0.9, 1.6); a.translate(x + SP / 2, y, AZ); brick.push(a); }
    if (i < NP - 1) { const a = new THREE.BoxGeometry(SP, 2.2, 2.6); a.translate(x + SP / 2, h + 1.0, AZ); gran.push(a); }
  }
  const addG = (list, mat) => { const g = merged(list); if (!g) return null; const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; G.add(m); return m; };
  addG(gran, new THREE.MeshStandardMaterial({ color: 0xbcb4a2, roughness: 0.9 }));
  addG(brick, new THREE.MeshStandardMaterial({ color: 0xa8583a, roughness: 0.9 }));
  // the city beyond: pale blocks, a tower or two, the hint of the Roman theatre's curve
  const city = [], cr2 = mulberry32(5);
  for (let i = 0; i < 70; i++) { const x = (cr2() - 0.5) * 900, z = 380 + cr2() * 450, w = 18 + cr2() * 40, d = 14 + cr2() * 30, h = 8 + cr2() * (cr2() < 0.15 ? 40 : 16); const g = new THREE.BoxGeometry(w, h, d); g.translate(x, h / 2, z); city.push(g); }
  { const t = new THREE.CylinderGeometry(55, 55, 14, 32, 1, true, -Math.PI * 0.6, Math.PI * 1.2); t.translate(-160, 7, 330); city.push(t); }
  addG(city, new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.95 }));
  L.poi.merida = { x: cx, z: cz, len: LEN, dx: end.dx, dz: end.dz };
}

// ---------------------------------------------------------------- the Avenida de la Constitución as a boulevard
// Where its two carriageways run side by side, the strip between them gets bitter oranges (palms where it is wide),
// oleanders where it is narrow, double street lamps every thirty metres; benches where there is room to sit
function doubleLamp() {
  const parts = [], heads = [];
  const post = new THREE.CylinderGeometry(0.08, 0.14, 7.6, 10); post.translate(0, 3.8, 0); parts.push(post);
  const base = new THREE.CylinderGeometry(0.22, 0.26, 0.7, 10); base.translate(0, 0.35, 0); parts.push(base);
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(s * 1.4 * t, 7.4 + Math.sin(t * Math.PI) * 0.35, 0)); }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.05, 6, false));
    const h = new THREE.BoxGeometry(0.75, 0.16, 0.36); h.translate(s * 1.55, 7.45, 0); parts.push(h);
    const gl = new THREE.BoxGeometry(0.6, 0.04, 0.28); gl.translate(s * 1.55, 7.36, 0); heads.push(gl);
  }
  return { iron: merged(parts), glow: merged(heads) };
}
export function avenida(L) {
  const map = L.map, extra = L.world.extraTrees || (L.world.extraTrees = []);
  const av = map.edges.filter((e) => e.name === 'Avenida de la Constitución' && e.drive);
  const seen = new Set(), lampAt = [], benches = [];
  let n = 0;
  for (const e of av) {
    for (let s = 2; s < e.len - 2; s += 3) {
      const p = polySample(e.pts, e.cum, s, {});
      const q = map.nearestEdge(p.x, p.z, 30, (o) => o !== e && o.name === 'Avenida de la Constitución' && o.drive);
      if (!q) continue;
      const qp = polySample(q.edge.pts, q.edge.cum, q.s, {});
      if (Math.abs(qp.dx * p.dx + qp.dz * p.dz) < 0.85) continue; // (only a carriageway running alongside)
      const mw = q.d - e.w / 2 - q.edge.w / 2;
      if (mw < 1.4 || q.d > 28) continue;
      const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      const key = Math.round(mx / 3) + ':' + Math.round(mz / 3);
      if (seen.has(key)) continue;
      seen.add(key);
      if (map.buildingAt(mx, mz) || map.roadAt(mx, mz, 0.3)) continue;
      n++;
      if (n % 3 === 0) extra.push({ kind: mw >= 4 ? (n % 12 === 0 ? 'palmera' : 'naranjo') : 'adelfa', x: mx, z: mz, s: mw >= 4 ? 0.95 : 0.8 });
      if (n % 10 === 5 && mw >= 1.6) lampAt.push([mx, mz, Math.atan2(p.dx, p.dz)]);
      if (mw >= 5.5 && n % 13 === 8) benches.push([mx + p.dz * 1.2, mz - p.dx * 1.2, Math.atan2(-p.dz, p.dx)]);
    }
  }
  if (lampAt.length) {
    const { iron, glow } = doubleLamp();
    const im = new THREE.InstancedMesh(iron, L.mat.iron || new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.5, metalness: 0.5 }), lampAt.length);
    const gm = new THREE.InstancedMesh(glow, new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe8b0, emissiveIntensity: 1.2 }), lampAt.length);
    const o = new THREE.Object3D();
    lampAt.forEach(([x, z, a], i) => {
      o.position.set(x, 0, z); o.rotation.y = a + Math.PI / 2; o.updateMatrix(); im.setMatrixAt(i, o.matrix); gm.setMatrixAt(i, o.matrix);
      for (const sx of [-1, 1]) { const ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2); L.world.lampPoints.push(x + ca * sx * 1.55, 7.3, z - sa * sx * 1.55); }
      L.circle(x, z, 0.2, 6);
    });
    im.castShadow = true; L.root.add(im); L.root.add(gm);
  }
  if (benches.length) {
    const bench = benchGeo(), iron = new THREE.MeshStandardMaterial({ color: 0x1e2a24, roughness: 0.55, metalness: 0.5 }), wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.7 });
    for (const [x, z, a] of benches) {
      for (const [geo, mat] of [[bench.iron, iron], [bench.wood, wood]]) { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.rotation.y = a; m.castShadow = true; L.root.add(m); }
      L.circle(x, z, 0.6, 1);
      L.world.spawnSpots.push({ kind: 'bench', x, z, ang: a });
    }
  }
  L.poi.avenida = { trees: Math.floor(n / 3), lamps: lampAt.length };
}
