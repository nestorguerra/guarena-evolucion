// The Piscina Municipal (in the Polideportivo, by the Carretera de Oliva de Mérida): the big pool with its lanes and
// starting blocks, the children's pool beside it, both with the white coping you sit on, the stainless ladders, the
// floating lane ropes; the paved deck round them, then the lawn with its umbrellas and sun loungers, the lifeguard's
// chair, the fence round it all and the name over the gate. The water is a shader: the tiles of the bottom and the
// dark lane lines seen through it, wobbling, the caustics running over them, deeper and bluer towards the deep end,
// lit from under the water at night. A dip off the ladder (you come out dripping, refreshed).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { orientedRect, pointInRing, mulberry32 } from './util.js';

const VS = `
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const FS = `
uniform float uTime; uniform float uNight; uniform vec2 uSize; uniform float uLanes; uniform float uKids;
varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 m = vUv * uSize; // metres: x along the pool, y across
  float t = uTime;
  vec2 w = vec2(n2(m * 0.7 + vec2(t * 0.35, 0.0)), n2(m * 0.7 + vec2(3.1, t * 0.3))) - 0.5;
  vec2 q = m + w * 0.28; // (the bottom seen through moving water)
  // the bottom: small white-blue tiles, the dark lane lines with their T at each end
  vec2 tile = fract(q / 0.33);
  float joint = step(0.9, max(tile.x, tile.y));
  vec3 bottom = mix(vec3(0.78, 0.93, 0.97), vec3(0.6, 0.8, 0.88), joint);
  if (uKids < 0.5) {
    float laneW = uSize.y / uLanes, ly = mod(q.y, laneW) - laneW * 0.5;
    float stripe = step(abs(ly), 0.12) * step(2.0, q.x) * step(q.x, uSize.x - 2.0);
    float tbar = step(abs(ly), 0.5) * (step(abs(q.x - 2.0), 0.12) + step(abs(q.x - (uSize.x - 2.0)), 0.12));
    bottom = mix(bottom, vec3(0.02, 0.08, 0.3), clamp(stripe + tbar, 0.0, 1.0));
  }
  float depth = uKids > 0.5 ? 0.15 : mix(0.3, 1.0, smoothstep(0.35, 0.95, vUv.x));
  vec3 water = mix(vec3(0.22, 0.78, 0.88), vec3(0.0, 0.36, 0.62), depth);
  float edge = min(min(m.x, uSize.x - m.x), min(m.y, uSize.y - m.y));
  vec3 c = mix(bottom, water, 0.5 + depth * 0.3);
  c *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 1.0, edge)); // (the walls' shade)
  // caustics: a bright net running over the bottom
  float c1 = n2(q * 1.7 + vec2(t * 0.45, t * 0.3)), c2 = n2(q * 2.2 - vec2(t * 0.35, -t * 0.25) + 5.0);
  float caus = pow(max(0.0, 1.0 - abs(c1 - c2) * 2.2), 7.0);
  c += vec3(0.85, 1.0, 1.0) * caus * (0.32 - depth * 0.12) * (1.0 - uNight);
  // the sky glinting on the ripples
  float gl = step(0.988, n2(m * 3.5 + vec2(t * 1.3, -t * 0.9)));
  c += vec3(1.0) * gl * 0.55 * (1.0 - uNight);
  // night: the lamps under the water along the walls
  vec3 nightC = c * vec3(0.18, 0.32, 0.48) + vec3(0.02, 0.22, 0.32) * (1.0 - smoothstep(0.0, 5.0, edge)) * 1.4 + vec3(0.0, 0.05, 0.08);
  c = mix(c, nightC, uNight * 0.9);
  gl_FragColor = vec4(c, 1.0);
#include <fog_fragment>
}`;
function waterMat(size, lanes, kids) {
  const u = { uTime: { value: 0 }, uNight: { value: 0 }, uSize: { value: new THREE.Vector2(size[0], size[1]) }, uLanes: { value: lanes }, uKids: { value: kids ? 1 : 0 } };
  // (the ground pulls itself forward with a polygon offset; what lies flat on it has to pull harder)
  return new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, u]), vertexShader: VS, fragmentShader: FS, fog: true, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -48 });
}
function norm(g) {
  if (!g.index) g = mergeVertices(g);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}
const merged = (l) => (l.length ? mergeGeometries(l.map(norm), false) : null);
const bx = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
function canvasTex(w, h, draw, rep = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }

export function buildPools(L) {
  const map = L.map, world = L.world;
  const pools = map.areas.filter((a) => a.kind === 'leisure:swimming_pool' && Math.hypot(a.ring[0], a.ring[1]) < 1500 && Math.abs(ringAreaOf(a.ring)) > 60);
  if (!pools.length) return;
  const M = {
    coping: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.75 }),
    deck: new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#e6dccb'; x.fillRect(0, 0, w, h); x.strokeStyle = '#cfc2ac'; x.lineWidth = 3; for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); } }), roughness: 0.85 }),
    lawn: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#6aa84a' : '#78b656'; x.fillRect(0, i * 32, w, 32); } const r = mulberry32(3); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '40,90,30' : '150,200,110'},0.25)`; x.fillRect(r() * w, r() * h, 2, 3); } }), roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.2, metalness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: 0xd8382e, roughness: 0.5 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }),
    fence: new THREE.MeshStandardMaterial({ color: 0x2e5a3a, roughness: 0.6, metalness: 0.3 }),
    mesh: new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(46,90,58,0.95)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke(); }), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 }),
  };
  M.lawn.map.repeat.set(1, 1);
  Object.assign(M.lawn, { polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 });
  Object.assign(M.deck, { polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -40 });
  const lawnPolys = [], deckRects = [], coping = [], steel = [], white = [], blue = [], red = [], yellow = [], decks = [];
  const add = (list, g) => list.push(g);
  let big = null;
  for (const a of pools) {
    const ob = orientedRect(a.ring);
    let ux = Math.cos(ob.ang), uz = Math.sin(ob.ang), hl = ob.hw, hd = ob.hd;
    if (hd > hl) { [hl, hd] = [hd, hl]; [ux, uz] = [-uz, ux]; }
    const area = hl * hd * 4, kids = area < 500;
    const Lw = hl * 2 - 0.5, Ww = hd * 2 - 0.5;
    const ry = -Math.atan2(uz, ux);
    const g = new THREE.Group(); g.position.set(ob.cx, 0, ob.cz); g.rotation.y = ry; L.root.add(g);
    g.updateMatrixWorld(true);
    const toW = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
    const lanes = kids ? 1 : Math.max(4, Math.round(Ww / 2.5));
    // the water
    const wm = waterMat([Lw, Ww], lanes, kids);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(Lw, Ww).rotateX(-Math.PI / 2), wm); water.position.y = 0.12; water.receiveShadow = true; g.add(water);
    L.waterMats = (L.waterMats || []).concat([wm]);
    // the coping, its inner face down to the water; the deck round it
    const cw = 0.45, ch = 0.2, dw = kids ? 2.0 : 2.6;
    for (const s of [-1, 1]) {
      coping.push(bx(Lw + cw * 2, ch, cw, 0, ch / 2, s * (Ww / 2 + cw / 2)));
      coping.push(bx(cw, ch, Ww, s * (Lw / 2 + cw / 2), ch / 2, 0));
    }
    const DL = Lw + (cw + dw) * 2, DW = Ww + (cw + dw) * 2;
    decks.push({ g, DL, DW });
    const corners = [toW(-DL / 2, -DW / 2), toW(DL / 2, -DW / 2), toW(DL / 2, DW / 2), toW(-DL / 2, DW / 2)];
    deckRects.push(corners.flatMap((v) => [v.x, v.z]));
    // the ladders: two curved stainless rails each, over the coping and down into the water
    const lad = kids ? [[0, -1]] : [[-Lw / 2 + 2.5, -1], [Lw / 2 - 2.5, -1], [-Lw / 2 + 2.5, 1], [Lw / 2 - 2.5, 1]];
    const ladders = [];
    for (const [lx, s] of lad) {
      for (const dx of [-0.28, 0.28]) {
        const z0 = s * (Ww / 2 + cw + 0.35), z1 = s * (Ww / 2 - 0.12);
        const pts = [new THREE.Vector3(lx + dx, 0.05, z0), new THREE.Vector3(lx + dx, 0.85, z0), new THREE.Vector3(lx + dx, 1.0, (z0 + z1) / 2 + s * 0.05), new THREE.Vector3(lx + dx, 0.8, z1), new THREE.Vector3(lx + dx, -0.4, z1)];
        steel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), 16, 0.025, 6, false));
      }
      for (let k = 0; k < 2; k++) steel.push(bx(0.56, 0.03, 0.12, lx, 0.0 - k * 0.3, s * (Ww / 2 - 0.12)));
      const wp = toW(lx, s * (Ww / 2 + cw + 0.9)), ip = toW(lx, s * (Ww / 2 - 0.9)); // (on the deck; at its foot, in the water)
      ladders.push({ x: wp.x, z: wp.z, kids, wx: ip.x, wz: ip.z });
    }
    (L.poi.poolLadders || (L.poi.poolLadders = [])).push(...ladders);
    // the water itself, for swimming in it (src/player.js updateSwim): its frame, its half sizes, its ladders
    const pool = { cx: ob.cx, cz: ob.cz, ux, uz, hl: Lw / 2, hd: Ww / 2, cw, kids, ladders, y: 0.12 };
    for (const q of ladders) q.pool = pool;
    (L.poi.pools || (L.poi.pools = [])).push(pool);
    if (!kids) {
      big = { g, Lw, Ww, cw, dw, toW };
      // the starting blocks at the shallow end, numbered; the lane ropes, red and white, blue near the walls
      for (let i = 0; i < lanes; i++) { // (at the deep end)
        const lz = -Ww / 2 + (i + 0.5) * (Ww / lanes), x0 = Lw / 2 + cw / 2;
        white.push(bx(0.5, 0.5, 0.55, x0 + 0.05, ch + 0.25, lz));
        const top = new THREE.BoxGeometry(0.6, 0.05, 0.55); top.rotateZ(0.12); top.translate(x0 - 0.05, ch + 0.53, lz); blue.push(top);
      }
      for (let i = 1; i < lanes; i++) {
        const lz = -Ww / 2 + i * (Ww / lanes), n = Math.floor(Lw / 0.5);
        for (let k = 0; k < n; k++) {
          const c = new THREE.CylinderGeometry(0.065, 0.065, 0.48, 6); c.rotateZ(Math.PI / 2); c.translate(-Lw / 2 + 0.25 + k * 0.5, 0.15, lz);
          const nearWall = k < 10 || k > n - 11;
          (nearWall ? red : (k % 2 ? white : (i === 1 || i === lanes - 1 ? blue : yellow))).push(c);
        }
      }
      // the lifeguard's chair, halfway along
      const lz = -(Ww / 2 + cw + 1.3);
      for (const dx of [-0.35, 0.35]) for (const dz of [-0.3, 0.3]) white.push(bx(0.06, 1.9, 0.06, dx, 0.95, lz + dz));
      white.push(bx(0.8, 0.06, 0.7, 0, 1.9, lz), bx(0.8, 0.6, 0.06, 0, 2.2, lz - 0.33));
      for (let k = 0; k < 4; k++) white.push(bx(0.7, 0.04, 0.06, 0, 0.4 + k * 0.42, lz + 0.32));
      red.push(bx(0.3, 0.3, 0.02, 0, 1.4, lz + 0.36));
      L.circle(toW(0, lz).x, toW(0, lz).z, 0.6, 2);
    }
    // nobody walks on the water (the coping stops you; the ladders take you in)
    for (const [ax2, az2, bx2, bz2] of [[-Lw / 2, -Ww / 2, Lw / 2, -Ww / 2], [Lw / 2, -Ww / 2, Lw / 2, Ww / 2], [Lw / 2, Ww / 2, -Lw / 2, Ww / 2], [-Lw / 2, Ww / 2, -Lw / 2, -Ww / 2]]) {
      const A = toW(ax2, az2), B = toW(bx2, bz2);
      L.seg(A.x, A.z, B.x, B.z, 1.2);
    }
    (L.reserved || (L.reserved = [])).push([ob.cx, ob.cz, Math.hypot(hl, hd) + 3]);
    // the meshes of this pool, in its own frame
    const add2 = (list, mat, cast = true) => { const geo = merged(list.splice(0)); if (!geo) return; const mm = new THREE.Mesh(geo, mat); mm.castShadow = cast; mm.receiveShadow = true; g.add(mm); };
    add2(coping, M.coping); add2(steel, M.steel); add2(white, M.white); add2(blue, M.blue); add2(red, M.red); add2(yellow, M.yellow);
    // the deck (with the coping's footprint left for it)
    const dk = new THREE.PlaneGeometry(DL, DW).rotateX(-Math.PI / 2);
    { const uv = dk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * DL / 1.2, uv.getY(i) * DW / 1.2); }
    const dm = new THREE.Mesh(dk, M.deck); dm.position.y = 0.035; dm.receiveShadow = true; g.add(dm);
  }
  // ---- the enclosure: round the pools, inside the Polideportivo, clear of the buildings and the roads; lawn over it
  const all = deckRects.flat(), xs = all.filter((_, i) => i % 2 === 0), zs = all.filter((_, i) => i % 2 === 1);
  const pad = 11, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
  const inDeck = (x, z) => deckRects.some((r) => pointInRing(x, z, r));
  const okCell = (x, z) => {
    if (map.buildingAt(x, z)) return false;
    const e = map.nearestEdge(x, z, 12, (q) => q.drive || q.walk);
    if (e && e.d < e.edge.w / 2 + 1.5) return false;
    for (const a of map.areas) if (a.kind === 'leisure:pitch' && pointInRing(x, z, a.ring)) return false;
    return true;
  };
  const C = 1.5, nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C);
  const cell = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C; cell[i * nz + j] = okCell(x, z) ? (inDeck(x, z) ? 2 : 1) : 0; }
  // keep the lawn in one piece round the pools: cells reachable from a deck without crossing a building or a road
  const keep = new Uint8Array(nx * nz), stack = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (cell[i * nz + j] === 2) { keep[i * nz + j] = 1; stack.push([i, j, 0]); }
  while (stack.length) {
    const [i, j, dd] = stack.pop();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { // (8 ways: the lawn grows square)
      const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const k = ii * nz + jj; if (keep[k] || !cell[k] || dd > 7) continue;
      keep[k] = 1; stack.push([ii, jj, dd + 1]);
    }
  }
  const lawn = [];
  const lawnCells = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (!keep[i * nz + j] || cell[i * nz + j] !== 1) continue;
    const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C;
    const q = new THREE.PlaneGeometry(C, C).rotateX(-Math.PI / 2); q.translate(x, 0.022, z);
    const uv = q.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, (x + (uv.getX(k) - 0.5) * C) / 12, (z - (uv.getY(k) - 0.5) * C) / 12);
    lawn.push(q); lawnCells.push([x, z, i, j]);
  }
  const lg = merged(lawn);
  if (lg) { const lm = new THREE.Mesh(lg, M.lawn); lm.receiveShadow = true; L.root.add(lm); }
  // ---- umbrellas and sun loungers on the lawn, a few towels; the fence round the edge of the lawn
  const r = mulberry32(77), sw = [], swW = [], canopy = [[], [], []];
  const used = [];
  const edgeCell = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const ii = i + a, jj = j + b; return ii < 0 || jj < 0 || ii >= nx || jj >= nz || !keep[ii * nz + jj]; });
  for (let n = 0, tries = 0; n < 26 && tries < 600; tries++) {
    const [x, z, i, j] = lawnCells[Math.floor(r() * lawnCells.length)] || [];
    if (x === undefined || edgeCell(i, j) || inDeck(x + 1.2, z) || inDeck(x - 1.2, z) || inDeck(x, z + 1.2) || inDeck(x, z - 1.2)) continue;
    if (used.some(([ux2, uz2]) => Math.hypot(ux2 - x, uz2 - z) < 4.2)) continue;
    used.push([x, z]); n++;
    const a = r() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    // the umbrella: a pole, a canopy of eight panels in two colours
    swW.push(bx(0.05, 2.3, 0.05, x, 1.15, z));
    const col = n % 3;
    const cone = new THREE.ConeGeometry(1.25, 0.45, 8, 1, true); cone.translate(x, 2.35, z); canopy[col].push(cone);
    // two loungers under it, side by side
    for (const s of [-0.45, 0.45]) {
      const lx = x + ca * s, lz = z - sa * s;
      const seat = new THREE.BoxGeometry(0.62, 0.08, 1.4); seat.rotateY(a); seat.translate(lx + sa * 0.3, 0.32, lz + ca * 0.3); sw.push(seat);
      const back = new THREE.BoxGeometry(0.62, 0.08, 0.7); back.rotateX(0.75); back.rotateY(a); back.translate(lx - sa * 0.55, 0.5, lz - ca * 0.55); sw.push(back);
      for (const [ox, oz] of [[0.26, 0.9], [-0.26, 0.9], [0.26, -0.3], [-0.26, -0.3]]) sw.push(bx(0.04, 0.3, 0.04, lx + ca * ox + sa * oz, 0.15, lz - sa * ox + ca * oz));
      world.spawnSpots.push({ kind: 'bench', x: lx + sa * 0.3, z: lz + ca * 0.3, ang: a + Math.PI, low: true });
    }
    L.circle(x, z, 0.25, 2);
  }
  { const g1 = merged(sw); if (g1) { const m1 = new THREE.Mesh(g1, M.white); m1.castShadow = true; L.root.add(m1); } }
  { const g2 = merged(swW); if (g2) L.root.add(new THREE.Mesh(g2, M.steel)); }
  const canMats = [new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.8, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: 0x2a78c8, roughness: 0.8, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: 0xe8642a, roughness: 0.8, side: THREE.DoubleSide })];
  canopy.forEach((list, i) => { const gg = merged(list); if (gg) { const mm = new THREE.Mesh(gg, canMats[i]); mm.castShadow = true; L.root.add(mm); } });
  // the fence: along every edge of the lawn that does not touch a building (posts every few cells, the wire between)
  const posts = [], panels = [];
  const seen = new Set();
  for (const [x, z, i, j] of lawnCells) {
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + a, jj = j + b;
      const out = ii < 0 || jj < 0 || ii >= nx || jj >= nz || !keep[ii * nz + jj];
      if (!out) continue;
      const ex = x + a * C / 2, ez = z + b * C / 2;
      if (map.buildingAt(ex + a * 0.6, ez + b * 0.6)) continue; // (the changing rooms close it there)
      const key = Math.round(ex * 2) + ':' + Math.round(ez * 2); if (seen.has(key)) continue; seen.add(key);
      const pw = new THREE.PlaneGeometry(C, 1.8); if (a !== 0) pw.rotateY(Math.PI / 2); pw.translate(ex, 0.9, ez);
      const uv = pw.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * C / 0.15, uv.getY(k) * 1.8 / 0.15);
      panels.push(pw);
      if ((i + j) % 2 === 0) posts.push(bx(0.06, 1.9, 0.06, ex + (a === 0 ? C / 2 : 0), 0.95, ez + (b === 0 ? C / 2 : 0)));
      const half = C / 2;
      if (a !== 0) L.seg(ex, ez - half, ex, ez + half, 1.8); else L.seg(ex - half, ez, ex + half, ez, 1.8);
    }
  }
  { const g3 = merged(panels); if (g3) L.root.add(new THREE.Mesh(g3, M.mesh)); }
  { const g4 = merged(posts); if (g4) L.root.add(new THREE.Mesh(g4, M.fence)); }
  // the name on the changing rooms, over the way in from the car park
  const b = map.buildings.find((q) => q.use === 5 && deckRects.some((rr) => Math.hypot(q.c[0] - (rr[0] + rr[4]) / 2, q.c[1] - (rr[1] + rr[5]) / 2) < 45) && q.area > 300);
  if (b) {
    let ex = -Infinity, ez = 0; for (let i = 0; i < b.ring.length; i += 2) if (b.ring[i] > ex) { ex = b.ring[i]; ez = b.ring[i + 1]; }
    const t = canvasTex(1024, 160, (x, w, h) => { x.fillStyle = '#1f5fa8'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffffff'; x.font = 'bold 96px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PISCINA MUNICIPAL', w / 2, h / 2 + 4); x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); }, false);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.75), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
    s.position.set(ex + 0.06, 3.1, ez); s.rotation.y = Math.PI / 2; L.root.add(s);
  }
  if (big) L.poi.piscina = { x: big.toW(0, 0).x, z: big.toW(0, 0).z };
}
function ringAreaOf(r) { let s = 0; for (let i = 0; i < r.length; i += 2) { const j = (i + 2) % r.length; s += r[i] * r[j + 1] - r[j] * r[i + 1]; } return s / 2; }
