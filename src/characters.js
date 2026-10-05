// Characters (chicos y chicas): sculpted SDF bodies built off-thread by charbuild.js, cached per shape,
// coloured per person, two LODs sharing one skeleton, animated procedurally (walk, run, punch, sit, drive,
// talk, blink, gaze...). Skin, cloth, denim, hair and eyes get their own shading in one material.
import * as THREE from 'three';
import { STYLE } from './style.js';
import { charBuilderMain } from './charbuild.js';
import { mhLib } from './mhdata.js';
import { loadAssetBytes, loadAssetImage } from './assets.js';
import { clamp, lerp, smoothstep, TAU } from './util.js';
import { GAIT, samp, gaitBody, FACES, FACE_KEYS, GETUP_BACK, GETUP_FRONT } from './motion.js';
import { Ragdoll } from './ragdoll.js';
import { SM } from './plastilina.js';

import { SKIN as SKIN0, HAIR as HAIR0, CLOTH as CLOTH0, randomShape, colorize, normalize } from './looks.js';
export const SKIN = SKIN0;
export const HAIR = HAIR0;
export const CLOTH = CLOTH0;
const EYES = ['#4a2e1c', '#3a2416', '#5b3d22', '#6a5a30', '#4d6b3a', '#4a6a8a', '#2b1d14'];

// ---------------------------------------------------------------- character descriptor presets
export const PLAYER_PRESETS = [
  // Álex, el protagonista (a la manera del mensajero del juego web Messenger): un chaval repartidor, melena negra con
  // flequillo, sudadera naranja con capucha, mochila roja con su sobre blanco, bermudas cargo, calcetines blancos y
  // zapatillas rojas de suela blanca. v: sube al cambiar el preset para renovar partidas guardadas.
  { hq: true, id: 'alex', v: 3, hero: true, heroHair: 'peinado', name: 'Álex', gender: 'm', age: 18, mhG: 0.62, bio: 'Repartidor. Conoce cada callejón entre Santa María y San Gregorio.',
    skinColor: '#f1d4bd', hairColor: '#15161a', hairStyle: 'melena', top: '#e2793e', topStyle: 'hoodie', bottom: '#77795a', bottomStyle: 'bermuda',
    shoes: '#c53b34', shoeStyle: 'sneaker', sole: '#f2efe8', laces: '#f2efe8', accessory: 'mochila', bagColor: '#a6353a', bagMark: true,
    height: 0.8, build: 0.88, slim: 1, headScale: 1.24, fringe: 0.004, hem: [-0.068, 0.03, 0.012], eyes: '#2b1d14', face: [-1, -0.5, 0.5, -1, -0.5] },
  { hq: true, id: 'manu', name: 'Manu', gender: 'm', age: 29, bio: 'Agricultor de las Vegas. Olivos, tomates y un tractor que no le deja tirado nunca.', skin: 2, hair: 0, hairStyle: 'rizos', beard: true, top: '#3c7a3f', topStyle: 'polo', bottom: '#c9b89a', bottomStyle: 'pants', shoes: '#5b3a26', accessory: 'gorra', accessoryColor: '#1f4a3a', build: 1.08, eyes: '#3a2416' },
  { hq: true, id: 'dani', name: 'Dani', gender: 'm', age: 19, bio: 'Estudiante del Eugenio Frutos. Más rápido que la Benemérita… o eso cree.', skin: 0, hair: 3, hairStyle: 'rapado', top: '#b8302a', topStyle: 'hoodie', bottom: '#1d1f24', bottomStyle: 'pants', shoes: '#1d1f24', build: 0.96, eyes: '#4a6a8a' },
  { hq: true, id: 'lucia', name: 'Lucía', gender: 'f', age: 22, bio: 'Vuelve de la UEx para las fiestas. Conduce como si llegara tarde a todo.', skin: 1, hair: 2, hairStyle: 'largo', top: '#e6b422', topStyle: 'tshirt', bottom: '#3d5f8f', bottomStyle: 'jeans', shoes: '#f2f2f2', build: 1.0, eyes: '#5b3d22' },
  { hq: true, id: 'rocio', name: 'Rocío', gender: 'f', age: 27, bio: 'Mecánica en el polígono La Alberca. Si tiene ruedas, lo arranca.', skin: 3, hair: 0, hairStyle: 'coleta', top: '#2f5fa8', topStyle: 'tank', bottom: '#2f5fa8', bottomStyle: 'pants', shoes: '#3a2a1c', build: 1.02, eyes: '#2b1d14' },
  { hq: true, id: 'carmen', name: 'Carmen', gender: 'f', age: 25, bio: 'Camarera en la Plaza de España. Sabe todos los chismes del pueblo.', skin: 0, hair: 7, hairStyle: 'media', top: '#f4f4f0', topStyle: 'blouse', bottom: '#1d1f24', bottomStyle: 'skirt', shoes: '#1d1f24', build: 0.98, eyes: '#4d6b3a' },
  // Annie: 24 años, latina, morena de pelo largo, 1,60 m y 53 kg (delgada); camiseta de Hello Kitty y falda. Cada partida
  // empieza en la puerta de su casa (calle Malfeitos, entrada según las direcciones del Catastro).
  // v: sube al cambiar el preset para renovar partidas guardadas.
  { hq: true, id: 'annie', v: 3, name: 'Annie', gender: 'f', age: 24, bio: 'Latina, morena y de las que no paran. Cada mañana sale de casa, en la calle Malfeitos, con su camiseta de Hello Kitty y ganas de conocer cada rincón de Guareña.', skin: 2, hair: 1, hairStyle: 'largo', top: '#f4f4f0', topStyle: 'tshirt', print: 'kitty', bottom: '#e87aa4', bottomStyle: 'skirt', skirtLen: 'short', shoes: '#f2f2f2', height: 0.97, build: 0.9, slim: 1, eyes: '#3a2416', start: { x: 111.9, z: -171.4, heading: 0.05 } },
  { hq: true, id: 'adri', name: 'Adri', gender: 'm', bio: 'Se sabe todos los atajos del pueblo y nunca dice que no a un plan.', skin: 1, hair: 0, hairStyle: 'corto', top: '#88a9c9', topStyle: 'shirt', bottom: '#1f2d44', bottomStyle: 'shorts', shoes: '#f2f2f2', accessory: 'gorra', accessoryColor: '#b8302a', build: 1.0, eyes: '#3a2416' },
];

// pedestrians wear shapes from a pool built once (a few dozen bodies, faces, haircuts and outfits from the same
// generator as the editor, so the workers are not swamped), each one in its own colours, patterns and accessories
const POOL_N = 44;
let pedPool = null;
function pool() {
  if (pedPool) return pedPool;
  let seed = 20260927;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  pedPool = [];
  for (let i = 0; i < POOL_N; i++) { const d = randomShape(r, i % 2 ? 'f' : 'm'); d.pedHead = true; pedPool.push(d); }
  return pedPool;
}
export function pedShapes() { return pool().map((p) => normalize(colorize({ ...p }, Math.random))); }
// a random pedestrian: a shape from the pool in fresh colours
export function randomDesc(rnd) {
  const P = pool();
  const d = { ...P[Math.floor(rnd() * P.length)] };
  if (d.face) d.face = d.face.slice();
  return normalize(colorize(d, rnd));
}

const q = (v, step) => Math.round(v / step) * step;
// descriptor → what changes the sculpted shape (everything else is colour). Accessories come as their own fields
// (hat, glasses, bag, earrings, watch); the older single 'accessory' still works.
export function shapeSpec(desc) {
  const g = desc.gender === 'f' ? 'f' : 'm';
  const elderly = !!desc.elderly;
  const hair = desc.hairStyle || 'corto';
  const acc = desc.accessory;
  const hat = desc.hat !== undefined ? desc.hat || null : acc === 'gorra' || acc === 'boina' ? acc : null;
  const top = desc.topStyle || 'tshirt';
  const bottom = top === 'dress' ? 'none' : desc.bottomStyle || 'jeans';
  const white = (desc.shoes || '').toLowerCase() === '#f2f2f2';
  let shoe = desc.shoeStyle || (white ? 'sneaker' : elderly || bottom === 'skirt' || top === 'dress' ? 'shoe' : 'sneaker');
  if (desc.uniform) shoe = 'boot';
  const W = q(desc.build || 1, 0.05);
  const bag = desc.bag !== undefined ? !!desc.bag : acc === 'mochila';
  const glasses = desc.glasses !== undefined ? desc.glasses || null : acc === 'gafas' ? 'gafas' : null;
  const spec = {
    g, S: q((desc.height || 1) * (elderly ? 0.97 : 1), 0.01), W, elderly,
    belly: desc.belly ? q(desc.belly, 0.05) : elderly && g === 'm' ? 1.15 : W > 1.07 ? 1.08 : 1,
    M: desc.muscle ? q(desc.muscle, 0.25) : 0,
    top, bottom, hair, hat, beard: desc.beardStyle || (desc.beard ? (elderly ? 'full' : 'short') : null),
    topMat: top === 'jacket' ? (desc.topMat === 'vaquera' ? 'vaquera' : 'cuero') : null,
    bag, glasses: glasses ? 'g' : null, earrings: !!desc.earrings, watch: !!desc.watch,
    cane: elderly && g === 'm' && desc.cane !== false && !bag,
    shoe, socks: shoe === 'sneaker' && (bottom === 'shorts' || bottom === 'bermuda' || bottom === 'skirt' || bottom === 'none'), tucked: !!desc.uniform, cop: !!desc.uniform,
    belt: bottom !== 'skirt' && bottom !== 'shorts' && bottom !== 'bermuda' && bottom !== 'none' && bottom !== 'chandal',
    hk: desc.headScale ? q(desc.headScale, 0.02) : 1,
    slim: desc.slim ? Math.min(1, q(desc.slim, 0.25)) : 0, skirtShort: bottom === 'skirt' && desc.skirtLen === 'short',
    bust: g === 'f' && desc.bust ? q(desc.bust, 0.1) : undefined,
    face: desc.face ? desc.face.map((v) => Math.round(clamp(v, -1, 1) * 2) / 2) : undefined, // jaw, chin, cheeks, nose, brow
    hq: !!desc.hq, // playable characters: finer sculpt
    hqHead: !desc.hq && !!desc.pedHead, // pedestrians: a finer head only
    mh: mhSpec(desc, g, elderly), // the MakeHuman head (charbuild.js mhHead)
    clay: STYLE.plastilina || undefined, // claymation: the head sculpted as a puppet's
  };
  spec.key = [spec.g, spec.S, spec.W, spec.elderly ? 'o' : 'y', spec.belly, spec.M, top, bottom, hair, hat, spec.beard, spec.topMat || '', bag ? 'b' : '', spec.glasses ? 'g' : '', spec.earrings ? 'e' : '', spec.watch ? 'w' : '',
    spec.cane ? 'c' : '', shoe, spec.socks ? 's' : '', spec.tucked ? 't' : '', spec.cop ? 'p' : '', spec.belt ? 'l' : '', spec.bust || '', spec.face ? spec.face.join(',') : ''].join('|') + (spec.slim ? '|sl' + spec.slim : '') + (spec.skirtShort ? '|ss' : '') + (spec.hq ? '|hq' : spec.hqHead ? '|hh' : '') + (spec.hk !== 1 ? '|hk' + spec.hk : '') + (spec.clay ? '|clay' : '');
  const m = spec.mh;
  m.hair = mhHairFor(spec);
  spec.key += `|mh${m.g},${m.age},${m.eth.join(',')},${m.wt},${m.mu},${m.seed},${m.brow},${m.lash},${m.hair || ''}`;
  return spec;
}
// MakeHuman's haircuts (cards with see-through ends) for the styles they suit; the rest stay sculpted or painted (a
// mohawk, a braid, a bun; bald, cropped). A man's short hair under a hat is painted too (what shows below it)
const MH_HAIR = {
  m: { corto: 'short02', tupe: 'short01', peinado: 'short04', rizos: 'short01', afro: 'afro01', melena: 'bob02', media: 'bob02', largo: 'long01', coleta: 'ponytail01' },
  f: { corto: 'short03', tupe: 'short03', peinado: 'short03', rizos: 'afro01', afro: 'afro01', melena: 'bob02', media: 'bob02', largo: 'long01', coleta: 'ponytail01' },
};
function mhHairFor(spec) {
  const h = MH_HAIR[spec.g === 'f' ? 'f' : 'm'][spec.hair] || null;
  if (h && ['gorra', 'boina', 'gorro', 'sombrero'].includes(spec.hat) && spec.g !== 'f' && !['long01', 'ponytail01', 'afro01'].includes(h)) return null;
  return h;
}

// ---------------------------------------------------------------- the MakeHuman head for a person
// sex, age, ancestry (from the descriptor, or read off the skin colour), build, and a seed from what makes the person
// themselves (so the same one always has the same face); brows and lashes to suit
const hashStr = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function skinTone(desc) { const c = new THREE.Color(desc.skinColor || SKIN[desc.skin ?? 1]); return 1 - (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) ** 0.45; }
function ancestry(desc) { return desc.anc || (skinTone(desc) > 0.62 ? 'a' : 'c'); }
function mhSpec(desc, g, elderly) {
  const f = g === 'f';
  const ageG = desc.ageGroup || (elderly ? 'mayor' : desc.age && desc.age < 27 ? 'joven' : 'adulto');
  const age = desc.age ? clamp(desc.age, 18, 90) : ageG === 'mayor' ? 72 : ageG === 'joven' ? 24 : 40;
  const seed = hashStr(JSON.stringify([desc.id || desc.name || '', desc.face || [], desc.height, desc.build, g, ageG, desc.hairStyle || '', desc.anc || '']));
  const anc = ancestry(desc);
  const eth = anc === 'a' ? [0.82, 0.03, 0.15] : anc === 's' ? [0.03, 0.75, 0.22] : [0.03, 0.05 + (seed % 7) * 0.012, 0.92 - (seed % 7) * 0.012]; // [african, asian, caucasian]
  const wt = clamp(0.5 + ((desc.build || 1) - 1) * 1.6 + ((desc.belly || 1) - 1) * 1.2 + (elderly ? 0.08 : 0), 0.18, 0.95);
  const mu = clamp(0.5 + (desc.muscle || 0) * 0.35, 0.3, 0.9);
  const brows = f ? ['eyebrow001', 'eyebrow002', 'eyebrow005', 'eyebrow011', 'eyebrow012'] : ageG === 'mayor' ? ['eyebrow009', 'eyebrow010', 'eyebrow004'] : ['eyebrow003', 'eyebrow004', 'eyebrow008', 'eyebrow010', 'eyebrow012'];
  return {
    g: +(desc.mhG ?? (f ? 0.02 + (seed % 5) * 0.01 : 0.98 - (seed % 5) * 0.01)).toFixed(2), age: Math.round(age / 3) * 3, eth: eth.map((v) => +v.toFixed(3)),
    wt: +wt.toFixed(2), mu: +mu.toFixed(2), seed, amt: 0.55, face: desc.face ? desc.face.map((v) => Math.round(clamp(v, -1, 1) * 2) / 2) : null,
    brow: desc.brow || brows[seed % brows.length], lash: f ? (seed % 3 ? 'eyelashes02' : 'eyelashes03') : 'eyelashes01',
  };
}
// the head's textures: skin (one atlas per age, sex and ancestry), eyes, brows, lashes, the lips' mask
// (until one has come: a skin shows its own mean colour, masks, brows and lashes nothing)
const mhTexCache = new Map(), mhLoading = new Set();
function mhTex(file, srgb = true, ph = '#c89a80') {
  let t = mhTexCache.get(file);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 1;
  if (srgb) { const x = c.getContext('2d'); x.fillStyle = ph; x.fillRect(0, 0, 1, 1); }
  t = new THREE.Texture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  // (dispose first: once drawn, the 1-pixel stand-in's storage is fixed in size and would not take the image)
  const p = loadAssetImage('mh/' + file).then((im) => { if (im) { t.dispose(); t.image = STYLE.anime && file.startsWith('eye_') ? animeEye(im) : STYLE.plastilina && file.startsWith('eye_') ? clayEye(im) : im; t.needsUpdate = true; } }).finally(() => mhLoading.delete(p));
  mhLoading.add(p);
  mhTexCache.set(file, t);
  return t;
}
// the anime look's eyes, painted over MakeHuman's layout (two eyeballs on the sheet): a big flat iris in the person's
// colour, darker at the top under the lid, a pupil, two white glints; a flat white round it
function animeEye(im) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data;
  // find each iris (the dark pixels in each half of the sheet) and its mean colour
  const eyes = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const i = (y * S + xx) * 4, L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (L > 120) continue;
    const e = eyes[xx + (S - y) > S ? 1 : 0];
    e[0] += xx; e[1] += y; e[2]++; if (L > 35) { e[3] += d[i]; e[4] += d[i + 1]; e[5] += d[i + 2]; e[6]++; }
  }
  x.fillStyle = '#f4f1ec'; x.fillRect(0, 0, S, S);
  for (const e of eyes) {
    if (!e[2]) continue;
    const cx = e[0] / e[2], cy = e[1] / e[2], r = Math.sqrt(e[2] / Math.PI) * 1.18;
    const ic = e[6] ? [e[3] / e[6], e[4] / e[6], e[5] / e[6]] : [80, 50, 30];
    const col = (k, a = 1) => `rgba(${Math.min(255, ic[0] * k) | 0},${Math.min(255, ic[1] * k) | 0},${Math.min(255, ic[2] * k) | 0},${a})`;
    const g = x.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, col(0.45)); g.addColorStop(0.55, col(1.05)); g.addColorStop(1, col(1.45));
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = col(0.35); x.lineWidth = r * 0.12; x.beginPath(); x.arc(cx, cy, r * 0.94, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgb(18,14,16)'; x.beginPath(); x.arc(cx, cy, r * 0.42, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + r * 0.32, cy - r * 0.34, r * 0.24, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(cx - r * 0.3, cy + r * 0.36, r * 0.11, 0, Math.PI * 2); x.fill();
  }
  return c;
}
// claymation: a puppet's eyes are beads — a cream white, a big round black pupil (no iris), one bright glint
function clayEye(im) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, S, S);
  const d = x.getImageData(0, 0, S, S).data;
  const eyes = [[0, 0, 0], [0, 0, 0]];
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const i = (y * S + xx) * 4, L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (L > 120) continue;
    const e = eyes[xx + (S - y) > S ? 1 : 0];
    e[0] += xx; e[1] += y; e[2]++;
  }
  x.fillStyle = '#f2eee4'; x.fillRect(0, 0, S, S);
  for (const e of eyes) {
    if (!e[2]) continue;
    const cx = e[0] / e[2], cy = e[1] / e[2], r = Math.sqrt(e[2] / Math.PI) * 1.05;
    x.fillStyle = 'rgb(16,12,12)'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + r * 0.34, cy - r * 0.36, r * 0.22, 0, Math.PI * 2); x.fill();
  }
  return c;
}
// the small ones (eyes, brows, lashes, masks, haircuts) are fetched as soon as the heads are, so no face appears without them
function mhPreload() {
  for (const e of new Set(Object.values(MH_EYES).concat(['bluegreen']))) mhTex('eye_' + e + '.webp');
  for (const b of ['eyebrow001', 'eyebrow002', 'eyebrow003', 'eyebrow004', 'eyebrow005', 'eyebrow008', 'eyebrow009', 'eyebrow010', 'eyebrow011', 'eyebrow012']) mhTex('brow_' + b + '.webp', false);
  for (const l of ['eyelashes01', 'eyelashes02', 'eyelashes03']) mhTex('lash_' + l + '.webp', false);
  mhTex('mask_face.png', false); mhTex('mask_hair.png', false);
  for (const h of new Set(Object.values(MH_HAIR.m).concat(Object.values(MH_HAIR.f)))) mhTex('hair_' + h + '.webp', false); // (a haircut must not appear a moment late)
}
export function mhTexReady() { return Promise.all([...mhLoading]); }
let MH_SKINS = null; // skin name → its own colour (assets/mh/skins.json)
function mhSkinFor(desc) {
  const f = desc.gender === 'f', anc = ancestry(desc), ageG = desc.ageGroup || (desc.elderly ? 'mayor' : desc.age && desc.age < 27 ? 'joven' : 'adulto');
  const a = ageG === 'mayor' ? 'o' : ageG === 'adulto' ? 'm' : 'y', s = f ? 'f' : 'm';
  const seed = hashStr(JSON.stringify([desc.id || desc.name || '', desc.face || [], desc.height]));
  let name;
  if (anc === 'a') name = a + s + '_a';
  else if (anc === 's') name = 'y' + s + '_s';
  else name = a === 'y' && seed % 2 ? 'y' + s + '_c2' : a + s + '_c';
  if (MH_SKINS && !MH_SKINS[name]) name = f ? 'yf_c' : 'ym_c';
  return name;
}
const MH_EYES = { '#4a2e1c': 'brown', '#3a2416': 'brown', '#2b1d14': 'brown', '#5b3d22': 'brownlight', '#6a5a30': 'brownlight', '#4d6b3a': 'green', '#4a6a8a': 'blue', '#6e8fb0': 'blue', '#7a8590': 'grey' };
function mhEyeFor(desc) {
  const e = (desc.eyes || EYES[desc.eye ?? 0] || '#4a2e1c').toLowerCase();
  if (MH_EYES[e]) return MH_EYES[e];
  const c = new THREE.Color(e);
  return c.b > c.r * 1.05 ? 'blue' : c.g > c.r * 0.95 ? 'green' : c.r > 0.35 ? 'brownlight' : 'brown';
}

// garment ids the material's detail pass understands (seams, pockets, plackets...), hem heights and sleeve lengths
const TOP_ID = { tshirt: 0, polo: 1, shirt: 2, hoodie: 3, tank: 4, blouse: 5, cardigan: 6, jacket: 7, sweater: 8, tracktop: 9, dress: 10, vest: 11 };
const BOT_ID = { jeans: 0, pants: 1, shorts: 2, skirt: 3, cargo: 4, chandal: 5, dress: 6, bermuda: 7 };
const SHOE_ID = { sneaker: 0, shoe: 1, boot: 2 };
const PATTERN_ID = { lisa: 0, rayas: 1, cuadros: 2, lunares: 3 };
const HEM_Y = { tshirt: 0.925, polo: 0.925, shirt: 0.925, hoodie: 0.91, tank: 0.925, blouse: 0.915, cardigan: 0.87, jacket: 0.9, sweater: 0.905, tracktop: 0.91, vest: 0.9, dress: 0.6 };
const SLEEVE = { tshirt: 0.13, polo: 0.13, blouse: 0.12, tank: 0, shirt: 0.5, hoodie: 0.505, cardigan: 0.5, jacket: 0.505, sweater: 0.5, tracktop: 0.505, vest: 0, dress: 0.12 };

// ---------------------------------------------------------------- colours per region (see REG in charbuild.js)
const C = (h) => new THREE.Color(h);
function shade(c, k) { return c.clone().multiplyScalar(k); }
export function palette(desc) {
  const skin = C(desc.skinColor || SKIN[desc.skin ?? 1]);
  const hair = C(desc.hairColor || HAIR[desc.hair ?? 0]);
  const top = C(desc.top || '#ffffff'), bot = C(desc.bottom || '#2f4f7a'), shoe = C(desc.shoes || '#222222');
  const acc = C(desc.hatColor || desc.accessoryColor || '#1f4a3a');
  const white = (desc.shoes || '').toLowerCase() === '#f2f2f2';
  const ts = desc.topStyle || 'tshirt';
  const trimK = { polo: 0.9, shirt: 0.92, hoodie: 0.82, cardigan: 0.78, tank: 0.9, blouse: 0.9 }[ts] ?? 0.86;
  const P = [];
  P[0] = skin; P[26] = skin; P[29] = shade(skin, 0.93);
  P[1] = top; P[2] = shade(top, trimK);
  P[3] = bot; P[4] = shade(bot, 0.88);
  P[5] = C(desc.uniform ? '#141414' : '#3a2a20'); P[6] = C('#c9c0a8');
  P[7] = shoe; P[8] = desc.sole ? C(desc.sole) : white ? C('#dedad2') : C('#26211c'); P[9] = desc.laces ? C(desc.laces) : white ? C('#f4f4f0') : shade(shoe, 0.7);
  P[10] = white ? (desc.top && desc.top.toLowerCase() !== '#f4f4f0' ? top.clone() : C('#b8302a')) : shade(shoe, 0.8);
  P[11] = hair; P[12] = C(desc.gender === 'f' ? '#1d1f24' : '#1d1f24'); P[27] = shade(hair, 0.92);
  P[13] = C('#e6dfd6'); P[14] = C(desc.eyes || '#4a2e1c'); P[15] = C('#08080a'); P[16] = C('#140f0c');
  P[17] = acc; P[18] = shade(acc, 0.82); P[19] = C(desc.glasses === 'sol' ? '#0c0d10' : '#b7c3cb'); P[20] = C(desc.glassesColor || '#121214');
  P[21] = C(desc.bagColor || '#18b35c'); P[22] = C(desc.bagColor ? desc.bagColor : '#0c5d2f');
  P[23] = C('#5a3a22'); P[24] = C(desc.under || '#f0ece0'); P[25] = C('#4a1c1c'); P[28] = C('#f2f2f0'); P[30] = C('#d8d0c0');
  P[31] = skin.clone().lerp(C('#f6d2c8'), 0.45);
  P[32] = C('#0b0806'); // eyelashes
  P[29] = skin.clone().lerp(C('#c98f86'), 0.25).multiplyScalar(0.95); // lids, and the pink waterline under the eye
  for (let i = 0; i < 33; i++) if (!P[i]) P[i] = C('#ff00ff');
  return P;
}

// ---------------------------------------------------------------- t-shirt prints (drawn once on a canvas)
let kittyTex = null;
function kittyTexture() {
  if (kittyTex) return kittyTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.lineJoin = 'round'; x.lineCap = 'round';
  const ink = '#141414';
  // head with two ears, white with a thick outline
  x.beginPath();
  x.moveTo(44, 112);
  x.quadraticCurveTo(30, 44, 58, 34); x.quadraticCurveTo(84, 40, 104, 70);
  x.quadraticCurveTo(128, 63, 152, 70);
  x.quadraticCurveTo(172, 40, 198, 34); x.quadraticCurveTo(226, 44, 212, 112);
  x.bezierCurveTo(238, 168, 200, 212, 128, 212); x.bezierCurveTo(56, 212, 18, 168, 44, 112);
  x.closePath();
  x.fillStyle = '#ffffff'; x.fill();
  x.lineWidth = 9; x.strokeStyle = ink; x.stroke();
  // eyes and nose
  x.fillStyle = ink;
  for (const ex of [92, 164]) { x.beginPath(); x.ellipse(ex, 150, 9, 13, 0, 0, Math.PI * 2); x.fill(); }
  x.beginPath(); x.ellipse(128, 171, 11, 7.5, 0, 0, Math.PI * 2); x.fillStyle = '#f2c230'; x.fill(); x.lineWidth = 3; x.stroke();
  // whiskers
  x.lineWidth = 6;
  for (const s of [-1, 1]) for (const [dy, tilt] of [[-16, -9], [0, 0], [16, 9]]) {
    x.beginPath(); x.moveTo(128 + s * 76, 158 + dy); x.lineTo(128 + s * 120, 158 + dy + tilt); x.stroke();
  }
  // red bow on her left ear
  x.save(); x.translate(184, 62); x.rotate(0.35);
  x.fillStyle = '#e0283c'; x.strokeStyle = ink; x.lineWidth = 6;
  for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(0, 0);
    x.bezierCurveTo(s * 18, -30, s * 44, -26, s * 42, 0); x.bezierCurveTo(s * 44, 26, s * 18, 30, 0, 0);
    x.closePath(); x.fill(); x.stroke();
  }
  x.beginPath(); x.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); x.fill(); x.stroke();
  x.restore();
  kittyTex = new THREE.CanvasTexture(c);
  kittyTex.colorSpace = THREE.SRGBColorSpace;
  kittyTex.anisotropy = 4;
  return kittyTex;
}

// ---------------------------------------------------------------- face paint: lips, brows, creases + micro relief (one pair per gender)
// Painted in head space seen from the front (u = x / 0.14 + 0.5, v = (y + 0.045) / 0.16), aligned with the sculpt in
// charbuild.js (same landmark table). A (8 bit): r lips, g brows, b darkening. B (half float, so the relief has no
// banding): r relief in millimetres, g roughness offset.
const faceMapCache = {};
function faceMaps(B, g) {
  if (faceMapCache[g]) return faceMapCache[g];
  const f = g === 'f', A = B.landmarks(g), M = A.mouth, nb = A.nb, tu = A.tipUp;
  const N = 512, NN = N * N;
  const lips = new Float32Array(NN), dark = new Float32Array(NN), hgt = new Float32Array(NN), fine = new Float32Array(NN), rough = new Float32Array(NN);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const gl = (d, w) => Math.exp(-(d * d) / (w * w));
  const mix = (a, b, t) => a + (b - a) * t;
  const ym = M.y, mw = M.w, hu = M.hu, hl = M.hl, px = f ? 0.0055 : 0.0058;
  const yLine = (x) => ym - 0.0005 * Math.exp(-(x * x) / 3.0e-5) + 0.0005 * (x / mw) ** 2;
  const yUp = (x) => {
    const ax = Math.abs(x);
    if (ax <= px) return ym + hu - 0.0011 * (1 - ss(0, px, ax));
    const t = Math.min(1, (ax - px) / (mw - px));
    return ym + 0.0004 + (hu - 0.0004) * Math.pow(Math.cos((t * Math.PI) / 2), 1.15);
  };
  const yLow = (x) => { const t = Math.min(1, Math.abs(x) / mw); return ym - hl * Math.pow(Math.max(0, 1 - t ** 2.2), 0.75); };
  // nasolabial fold: quadratic curve from above the nose wing to beside the mouth corner
  const nl = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = [0.0182 * nb + 0.001, 0.0415], c = [0.0302, 0.028], b = [0.0298 + (f ? 0 : 0.001), ym - 0.004];
    nl.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1], t]);
  }
  for (let j = 0; j < N; j++) {
    const y = (1 - (j + 0.5) / N) * 0.16 - 0.045;
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * 0.14, ax = Math.abs(x), k = j * N + i;
      let L = 0, D = 0, Hh = 0, Fh = 0, Ro = 0;
      // --- mouth
      if (ax < mw * 1.25 && y > ym - hl - 0.004 && y < ym + hu + 0.003) {
        const yl = yLine(x), yu = yUp(x), yb = yLow(x);
        const cf = 1 - ss(mw * 0.84, mw * 1.02, ax);
        const up = ss(-0.00032, 0.00032, yu - y) * ss(-0.00025, 0.00025, y - yl);
        const lo = ss(-0.0006, 0.0006, y - yb) * ss(-0.00025, 0.00025, yl - y);
        L = Math.max(up, lo) * cf;
        const edge = 1 - ss(mw * 0.93, mw * 1.12, ax);
        D += gl(y - yl, 0.00042) * (0.5 + 0.4 * ss(0.4 * mw, mw, ax)) * edge;
        D += L * 0.14 * gl(y - yl, 0.0022); // inner lips a shade deeper
        Hh += 0.00022 * gl(y - yu, 0.00045) * cf; // the vermilion border rolls out a little ("white roll")
        Hh -= 0.00042 * gl(y - yl, 0.00055) * edge;
        Fh += L * 0.000011 * Math.sin((x / 0.0011) * Math.PI * 2 + Math.sin(y * 1300) * 0.9 + Math.sin(x * 2100) * 1.6) * (0.45 + 0.55 * (1 - ax / mw));
        Ro -= L * 0.15;
        // lower-lip highlight zone a bit glossier
        Ro -= 0.06 * gl(x, 0.008) * gl(y - (ym - hl * 0.45), 0.0025);
      }
      for (const s of [-1, 1]) {
        const d2 = (x - s * mw) ** 2 + (y - ym) ** 2;
        D += 0.45 * Math.exp(-d2 / 1.9e-6);
        Hh -= 0.0005 * Math.exp(-d2 / 4.4e-6);
      }
      // --- philtrum: two soft ridges from the columella down to the peaks of the bow, a groove between
      {
        const yTop = 0.0305, yBot = ym + hu;
        if (y > yBot - 0.002 && y < yTop + 0.003 && ax < 0.012) {
          const tt = Math.min(1, Math.max(0, (yTop - y) / (yTop - yBot)));
          const cx = mix(0.0034, px, tt), w = mix(0.0015, 0.0021, tt);
          const fv = ss(yTop + 0.0015, yTop - 0.002, y) * ss(yBot - 0.0006, yBot + 0.0012, y);
          Hh += 0.00034 * gl(ax - cx, w) * fv;
          Hh -= 0.00016 * gl(x, cx * 0.55) * fv;
          D += 0.04 * gl(x, cx * 0.5) * fv;
        }
      }
      // --- chin: groove under the lower lip (mentolabial sulcus), a faint cleft on men
      {
        const yS = ym - hl - 0.0058 + 12 * x * x;
        Hh -= 0.00045 * gl(y - yS, 0.0021) * gl(x, 0.013);
        D += 0.1 * gl(y - yS, 0.0024) * gl(x, 0.011);
        if (!f) Hh -= 0.00018 * gl(x, 0.0022) * gl(y + 0.028, 0.006);
      }
      // --- nose: nostrils, wing creases, a little shine on the tip
      for (const s of [-1, 1]) {
        const nx = (x - s * 0.0056 * nb) / (0.0029 * nb), ny = (y - (0.0331 + tu * 0.4)) / (0.00185 * nb);
        const dn = nx * nx + ny * ny;
        D += 0.36 * Math.exp(-dn * 1.3); // nostrils: shaded, never holes seen from the front
        Hh -= 0.0012 * Math.exp(-dn * 1.1);
        const ex = (x - s * 0.0128 * nb) / (0.0063 * nb), ey = (y - 0.0378) / (0.0068 * nb);
        const r = Math.sqrt(ex * ex + ey * ey);
        const w = ey > -0.35 ? 1 : 0.25;
        D += 0.14 * gl(r - 1.0, 0.2) * w;
        Hh -= 0.00045 * gl(r - 1.0, 0.24) * w;
      }
      Ro -= 0.08 * gl(x, 0.009) * gl(y - (0.045 + tu), 0.008);
      Ro -= 0.04 * gl(x, 0.02) * gl(y - 0.11, 0.02); // forehead T-zone
      // --- nasolabial folds
      if (ax > 0.012 && ax < 0.04 && y > ym - 0.01 && y < 0.047) {
        let best = 1, bt = 0;
        for (const p of nl) { const d = Math.hypot(ax - p[0], y - p[1]); if (d < best) { best = d; bt = p[2]; } }
        const fade = ss(0, 0.2, bt) * (1 - ss(0.75, 1, bt));
        D += (f ? 0.05 : 0.07) * gl(best, 0.0019) * fade;
        Hh -= (f ? 0.00028 : 0.00036) * gl(best, 0.0024) * fade;
      }
      // --- eyes: upper-lid crease, eyeshadow, under-eye hollow, inner corners
      for (const s of [-1, 1]) {
        const u = s * (x - s * 0.032);
        if (u > -0.018 && u < 0.019 && y > 0.058 && y < 0.094) {
          const yc = 0.075 + 0.0113 - 19 * (u - 0.0012) ** 2;
          const fu = ss(-0.016, -0.009, u) * ss(0.017, 0.011, u);
          D += (f ? 0.34 : 0.26) * gl(y - yc, 0.001) * fu;
          Hh -= 0.00035 * gl(y - yc, 0.0012) * fu;
          if (f) D += 0.13 * ss(yc + 0.0012, yc - 0.0022, y) * ss(0.0786, 0.0812, y) * fu;
          const yu2 = 0.075 - 0.0122 + 14 * (u - 0.002) ** 2;
          const fl = ss(-0.013, -0.004, u) * ss(0.015, 0.008, u);
          D += 0.09 * gl(y - yu2, 0.0022) * fl;
          Hh -= 0.00022 * gl(y - yu2 + 0.001, 0.0016) * fl;
        }
      }
      D += 0.13 * Math.exp(-((ax - 0.0195) ** 2 + (y - 0.0795) ** 2) / 1.6e-5);
      lips[k] = L; dark[k] = D; hgt[k] = Hh; fine[k] = Fh; rough[k] = Ro;
    }
  }
  // --- brows: filled shape + hair strokes on a canvas (mirrored), read back as the green channel
  const bc = document.createElement('canvas'); bc.width = bc.height = N;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#000'; bx.fillRect(0, 0, N, N);
  const CX = (x) => (x / 0.14 + 0.5) * N, CY = (y) => (1 - (y + 0.045) / 0.16) * N;
  const brow = f
    ? { x0: 0.0118, x1: 0.0535, bot: [0.0948, 0.0988, 0.0978], top: [0.0992, 0.1028, 0.0996], peak: 0.64, hairs: 190, len: [0.0025, 0.0042] }
    : { x0: 0.011, x1: 0.0548, bot: [0.0917, 0.0941, 0.0942], top: [0.0991, 0.1009, 0.098], peak: 0.6, hairs: 420, len: [0.0032, 0.006] };
  const curve = (arr, t) => (t < brow.peak ? mix(arr[0], arr[1], Math.sin((t / brow.peak) * Math.PI / 2)) : mix(arr[1], arr[2], ss(brow.peak, 1, t)));
  let seed = f ? 7 : 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const s of [-1, 1]) {
    const X = (t) => s * mix(brow.x0, brow.x1, t);
    bx.beginPath();
    for (let i = 0; i <= 20; i++) { const t = i / 20; const p = [CX(X(t)), CY(curve(brow.top, t))]; i ? bx.lineTo(...p) : bx.moveTo(...p); }
    for (let i = 20; i >= 0; i--) { const t = i / 20; bx.lineTo(CX(X(t)), CY(curve(brow.bot, t))); }
    bx.closePath();
    bx.fillStyle = `rgba(255,255,255,${f ? 0.42 : 0.5})`; bx.fill();
    bx.lineCap = 'round';
    for (let hI = 0; hI < brow.hairs; hI++) {
      const t = Math.pow(rnd(), 0.9);
      const yb = curve(brow.bot, t), yt = curve(brow.top, t);
      const y0 = mix(yb, yt, rnd() * 0.85);
      // medial hairs stand up, the body sweeps up and out, the tail lies flat and points down a little
      const ang = t < 0.16 ? mix(1.35, 0.75, t / 0.16) : t < brow.peak ? mix(0.62, 0.22, (t - 0.16) / (brow.peak - 0.16)) : mix(0.1, -0.22, (t - brow.peak) / (1 - brow.peak));
      const a = ang + (rnd() - 0.5) * 0.35;
      const l = mix(brow.len[0], brow.len[1], rnd()) * (1 - 0.35 * t);
      const x0 = X(t);
      bx.strokeStyle = `rgba(255,255,255,${0.45 + 0.45 * rnd()})`;
      bx.lineWidth = (f ? 0.75 : 0.95) + rnd() * 0.5;
      bx.beginPath();
      bx.moveTo(CX(x0), CY(y0));
      bx.quadraticCurveTo(CX(x0 + s * Math.cos(a) * l * 0.55), CY(y0 + Math.sin(a) * l * 0.6), CX(x0 + s * Math.cos(a - 0.12) * l), CY(y0 + Math.sin(a - 0.12) * l * 0.92));
      bx.stroke();
    }
  }
  const bd = bx.getImageData(0, 0, N, N).data;
  // --- pack
  const make = (fill) => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const id = x.createImageData(N, N); fill(id.data); x.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
  const q8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const texA = make((d) => { for (let k = 0; k < NN; k++) { d[k * 4] = q8(lips[k] * 255); d[k * 4 + 1] = bd[k * 4]; d[k * 4 + 2] = q8(Math.min(1, dark[k]) * 255); d[k * 4 + 3] = 255; } });
  const hb = new Uint16Array(NN * 4), toH = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, o = ((N - 1 - j) * N + i) * 4; hb[o] = toH((hgt[k] + fine[k]) * 1000); hb[o + 1] = toH(rough[k]); hb[o + 2] = 0; hb[o + 3] = toH(1);
  }
  const texB = new THREE.DataTexture(hb, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  texB.minFilter = texB.magFilter = THREE.LinearFilter; texB.generateMipmaps = false; texB.flipY = false; texB.needsUpdate = true;
  return (faceMapCache[g] = { A: texA, B: texB });
}

// ---------------------------------------------------------------- material: one physical material, per-class shading
// aMat classes: 0 skin, 1 face (m), 2 face (f), 3 cotton, 4 knit, 5 denim, 6 twill, 7 leather, 8 rubber, 9 canvas,
// 10 hair, 11 eye, 12 gloss, 13 metal, 14 nylon, 15 eyelid
const CHAR_VS_HEAD = `
attribute float aMat; attribute float aAO; attribute vec3 aFace; attribute float aReg; attribute vec2 aUV; varying vec2 vUV2;
flat varying float vReg;
flat varying float vMat; varying float vAO; varying vec3 vFace; varying vec3 vRest; varying vec3 vHairT;
uniform float uPart;`;
const CHAR_FS_HEAD = `
flat varying float vMat; varying float vAO; varying vec3 vFace; varying vec3 vRest; varying vec3 vHairT;
uniform vec3 uHair; uniform vec3 uLip; uniform float uStubble; uniform float uMakeup; uniform float uBuzz; uniform float uAge;
uniform sampler2D uPrint; uniform float uPrintOn; uniform vec3 uPrintC; uniform vec2 uPrintS; uniform float uZombie;
uniform sampler2D uFaceA; uniform sampler2D uFaceB; uniform float uFem; uniform vec4 uHL; uniform float uPart; uniform float uCurl; uniform float uCapHair; uniform float uBeard; uniform float uHairEnd;
float cHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cNoise(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cHash(i), cHash(i + vec3(1,0,0)), f.x), mix(cHash(i + vec3(0,1,0)), cHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cHash(i + vec3(0,0,1)), cHash(i + vec3(1,0,1)), f.x), mix(cHash(i + vec3(0,1,1)), cHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec2 gRelD; // screen-space derivatives of the face relief, from the height map's own gradient (smooth when magnified)
float gSkin; // 1 on skin: light scatters under it (wrapped, reddish terminator)
vec3 cBump(vec3 n, float h, float faceDir) {
  vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition);
  float dh1 = dFdx(h) + gRelD.x, dh2 = dFdy(h) + gRelD.y;
  vec3 r1 = cross(dp2, n), r2 = cross(n, dp1);
  float det = dot(dp1, r1);
  vec3 g = sign(det) * (dh1 * r1 + dh2 * r2);
  return normalize(abs(det) * n - g);
}
float gBumpH; float gRough; float gSheen; float gMetal; float gPX; vec3 gHairT; float gHairK;
// skin: diffuse light wraps past the terminator, red furthest (it scatters deepest under the skin), a little green, hardly any blue
vec3 cSkinIrr(float nl) { vec3 w = vec3(0.46, 0.22, 0.15); return clamp((vec3(nl) + w) / (1.0 + w), 0.0, 1.0) * vec3(1.0, 0.985, 0.975); }
float fa(float lambda) { return smoothstep(2.0 * gPX, 5.0 * gPX, lambda); } // fade detail smaller than a few pixels
varying vec2 vUV2; uniform sampler2D uMHSkin; uniform sampler2D uMHEye; uniform sampler2D uMHBrow; uniform sampler2D uMHLash; uniform sampler2D uMHLips; uniform vec3 uMHMean;
uniform sampler2D uMHHair; uniform vec4 uMHStyle; uniform sampler2D uMHHairTex; uniform float uNeckY; uniform vec3 uBrow;
// hair painted on the face: stubble and the blue-grey of a shaven jaw, a buzz cut, beards, short hair under a cap, the
// soft hairline under the hair shell (F: head-bone space; lipA keeps it off the lips)
void cFaceHair(inout vec3 col, vec3 F, vec3 P, float lipA, float fem, float dots) {
  float beardZone = smoothstep(0.042, 0.03, F.y + 0.25 * max(F.z - 0.02, 0.0)) * smoothstep(-0.05, -0.03, F.z) * smoothstep(-0.07, -0.035, F.y) * smoothstep(-0.03, 0.012, F.z) * (1.0 - lipA);
  float scalp = smoothstep(0.118, 0.13, F.y - 0.33 * max(F.z, 0.0) + 0.1 * max(-F.z, 0.0)) * smoothstep(0.066, 0.06, abs(F.x));
  col = mix(col, uHair * 0.7, beardZone * uStubble * (0.45 + 0.4 * dots));
  col = mix(col, mix(col, vec3(0.3, 0.34, 0.36), 0.18), beardZone * uStubble * (1.0 - fem) * 0.5); // the blue-grey of a shaven jaw
  col = mix(col, uHair * 0.75, scalp * uBuzz * (0.55 + 0.35 * dots));
  if (uBeard > 0.5) { // beards: moustache, goatee, short or full, painted hair by hair with a ragged edge
    int bst = int(uBeard + 0.5);
    float mx = abs(F.x);
    float lipTop = 0.0146 - 9.0 * mx * mx;
    float must = (1.0 - smoothstep(0.85, 1.08, length(vec2(F.x / 0.028, (F.y - 0.0215) / 0.0092)))) * smoothstep(lipTop - 0.0012, lipTop + 0.0006, F.y) * smoothstep(0.06, 0.075, F.z);
    float chinB = 1.0 - smoothstep(0.82, 1.06, length(vec2(F.x / 0.022, (F.y + 0.027) / 0.021)));
    float soul = 1.0 - smoothstep(0.7, 1.05, length(vec2(F.x / 0.0065, (F.y + 0.0105) / 0.0068)));
    vec2 cq = vec2(mx - mix(0.026, 0.018, clamp((0.004 - F.y) / 0.026, 0.0, 1.0)), 0.0);
    float corner = (1.0 - smoothstep(0.003, 0.0055, abs(cq.x))) * step(-0.024, F.y) * step(F.y, 0.006);
    float m = bst == 1 ? must : bst == 2 ? max(must, max(chinB, max(soul, corner))) : max(must, beardZone * (bst == 4 ? 1.15 : 1.0));
    m *= (1.0 - lipA) * step(0.0, F.z + 0.03);
    float rag = cNoise(P * 520.0) * 0.6 + cNoise(P * 140.0) * 0.4;
    float dens = smoothstep(0.3, 0.8, m * 1.08 + (rag - 0.5) * 0.6);
    // single hairs growing down and out (finer and sparser at the edges, the skin showing between them)
    float strd = cNoise(vec3(F.x * 1300.0, F.y * 240.0, F.z * 1300.0)) * fa(0.0009);
    float str2 = cNoise(vec3(F.x * 3400.0, F.y * 700.0, F.z * 3400.0)) * fa(0.0004);
    float hairs = smoothstep(0.25, 0.75, strd * 0.65 + str2 * 0.35 + dens * 0.35);
    vec3 bc = uHair * (0.62 + 0.5 * strd) + vec3(0.03, 0.022, 0.016) * str2; // tips catch a little warm light
    float cover = dens * mix(0.45, bst == 4 ? 0.95 : bst == 3 ? 0.84 : 0.9, hairs) * (0.82 + 0.18 * smoothstep(0.5, 1.0, dens));
    col = mix(col, bc, cover);
    gBumpH += dens * ((strd - 0.5) * 0.0009 + (str2 - 0.5) * 0.0004 + (bst == 4 ? 0.0012 : 0.0006));
    gRough = mix(gRough, 0.66, dens);
  }
  if (uCapHair > 0.5) { // short hair under a cap: above the ears and at the nape, thinning out at its edge
    vec3 ea = vec3(abs(F.x) - 0.08, F.y - 0.066, F.z + 0.012);
    float band = smoothstep(0.036, 0.058, F.y + 0.12 * max(-F.z - 0.03, 0.0)) * smoothstep(0.052, 0.03, F.z) * smoothstep(0.024, 0.034, length(ea));
    float edge = cNoise(P * 900.0) * 0.5 + 0.5;
    col = mix(col, uHair * 0.72, band * (0.75 + 0.2 * dots) * smoothstep(0.2, 0.6, band + edge * 0.35));
  }
  if (uHL.w > -5.0) { // soft hairline: sparse hair for a few millimetres below the edge of the hair shell
    float sd = dot(uHL.xyz, F) - uHL.w;
    float hlA = (1.0 - smoothstep(0.0, 0.0065, sd)) * step(-0.003, sd) * (smoothstep(0.035, 0.055, F.z) + smoothstep(-0.06, -0.08, F.z)); // forehead and nape only, not beside the ears
    col = mix(col, uHair * 0.78, hlA * 0.55 * (0.4 + 0.6 * dots));
  }
}
// hair painted on the MakeHuman head from its atlas masks (hm: the scalp of a man, of a woman, a full beard, a goatee
// with its moustache), F its base-mesh position (metres, 0.7 m up): the scalp under every haircut (so the hair's edge
// is a real hairline, not the shell's cut), a buzz cut, the fringe of a bald head, stubble and beards.
// uMHStyle: x how thick the scalp's hair, y bald on top, z cropped (the skin shows between the hairs), w a man's
// hairline as full as a woman's (the young; the old keep the receding one). Returns how much hair covers the skin
float cMHHair(inout vec3 col, vec3 skinC, vec3 F, vec3 P, float lipA, float fem, vec4 hm) {
  float rag = cNoise(P * 520.0) * 0.6 + cNoise(P * 140.0) * 0.4, fine = cNoise(P * 1100.0);
  float strd = cNoise(vec3(F.x * 1300.0, F.y * 240.0, F.z * 1300.0)) * fa(0.0009); // single hairs, growing down
  float str2 = cNoise(vec3(F.x * 3400.0, F.y * 700.0, F.z * 3400.0)) * fa(0.0004);
  float dots = mix(0.5, cNoise(P * 1400.0), fa(0.0008));
  #ifdef ANIME
  strd = 0.55; str2 = 0.5; dots = 0.5; fine = 0.5; rag = 0.5 + (rag - 0.5) * 0.3; // (painted as patches, not hair by hair)
  #endif
  float sc = fem > 0.5 ? hm.g : mix(hm.r, max(hm.r, hm.g * 0.93), uMHStyle.w), cov = 0.0;
  if (uMHStyle.y > 0.5) { // bald on top: a fringe round the sides and the back, bare (and a little shiny) above it
    float crown = smoothstep(0.066, 0.094, F.y + 0.3 * max(F.z - 0.02, 0.0) + (rag - 0.5) * 0.014 + (fine - 0.5) * 0.004);
    col = mix(col, skinC * (0.96 + 0.08 * cNoise(P * 60.0)), crown * max(hm.r, hm.g));
    gRough = mix(gRough, 0.36, crown); sc *= 1.0 - crown;
  }
  // (the edge: a few millimetres where single hairs thin out, not a line)
  float sd = smoothstep(0.12, 0.82, sc + (fine - 0.5) * 0.3 * fa(0.002) + (rag - 0.5) * 0.22) * uMHStyle.x;
  #ifdef ANIME
  sd = smoothstep(0.36, 0.5, sc + (rag - 0.5) * 0.2) * uMHStyle.x;
  #endif
  vec3 hc = uHair * (0.58 + 0.5 * strd) + vec3(0.02, 0.015, 0.01) * str2;
  float sk = sd * mix(0.95, 0.5 + 0.38 * dots, uMHStyle.z) * mix(0.55 + 0.45 * strd, 1.0, smoothstep(0.45, 0.85, sc));
  col = mix(col, hc, sk); cov = max(cov, sk);
  gRough = mix(gRough, 0.7, sd); gBumpH += sd * (strd - 0.5) * 0.0004;
  // stubble, and the blue-grey of a shaven jaw
  float bz = max(hm.b, hm.a) * (1.0 - lipA), bzs = bz * uStubble * smoothstep(0.15, 0.55, bz + (rag - 0.5) * 0.3);
  #ifdef ANIME
  bzs = uStubble * smoothstep(0.4, 0.55, bz) * 0.55;
  #endif
  col = mix(col, uBrow * 0.7, bzs * (0.35 + 0.45 * dots));
  col = mix(col, mix(col, vec3(0.3, 0.34, 0.36), 0.2), bzs * (1.0 - fem) * 0.5);
  if (uBeard > 0.5) { // moustache (the upper part of the goatee's mask), goatee, short or full: hair by hair, ragged at the edge
    int bst = int(uBeard + 0.5);
    float m = (bst == 1 ? hm.a * smoothstep(-0.044, -0.037, F.y) : bst == 2 ? hm.a : max(hm.b, hm.a)) * (1.0 - lipA);
    // thick on the chin and the lip, thinning out up the cheeks, the edge ragged and sparse
    float dens = smoothstep(0.18, 0.9, m + (rag - 0.5) * 0.42 + (fine - 0.5) * 0.25 * fa(0.002));
    #ifdef ANIME
    dens = smoothstep(0.38, 0.52, m + (rag - 0.5) * 0.2);
    #endif
    float hairs = smoothstep(0.25, 0.75, strd * 0.65 + str2 * 0.35 + dens * 0.35);
    vec3 bc = uBrow * (0.5 + 0.55 * strd) + vec3(0.03, 0.022, 0.016) * str2;
    float cover = dens * mix(0.4, bst == 4 ? 0.96 : bst == 3 ? 0.86 : 0.92, hairs) * (0.78 + 0.22 * smoothstep(0.5, 1.0, dens));
    col = mix(col, bc, cover); cov = max(cov, cover);
    gBumpH += dens * ((strd - 0.5) * 0.0009 + (str2 - 0.5) * 0.0004 + (bst == 4 ? 0.0012 : 0.0006));
    gRough = mix(gRough, 0.66, dens);
  }
  return cov;
}
`;
// garment detail in the rest pose (metres): seams and stitching, pockets, plackets and buttons, zips, patterns,
// knitted rib, and the creases that appear at the knees, the backs of the knees, the ankles and the elbows
const CHAR_FS_CLOTH = `
uniform vec4 uBody; uniform float uBagMark; uniform vec4 uFringe; uniform vec4 uHem; uniform vec4 uBend; uniform vec4 uGarm; uniform vec4 uCut; uniform vec3 uTop2; uniform vec3 uBot2; uniform vec3 uThread; uniform vec3 uShoe2;
flat varying float vReg;
float gLod; float gLod2; // fine lines fade once they are thinner than a few pixels; creases a little later
float gLn(float d, float w) { return 1.0 - smoothstep(w * 0.35, w, abs(d)); }
float gDs(float a) { return step(0.42, fract(a * 240.0)); } // stitch dashes, ~4 mm
vec3 gShoulder(float s) { return vec3(s * 0.19 * uBody.x * mix(1.0, 0.92, uBody.z) * sqrt(uBody.y), 1.455 * uBody.x, 0.0); }
vec3 gHipJ(float s) { return vec3(s * 0.095 * uBody.x * mix(1.0, 1.08, uBody.z) * sqrt(uBody.y), 0.945 * uBody.x, 0.0); }
void garmentTop(inout vec3 col, inout float bump, inout float dk, vec3 P, bool trim) {
  float S = uBody.x; int st = int(uGarm.x + 0.5), pat = int(uGarm.z + 0.5);
  float s = P.x >= 0.0 ? 1.0 : -1.0;
  vec3 sh = gShoulder(s), ad = vec3(s * 0.3523, -0.9359, 0.0);
  vec3 q = P - sh; float t = dot(q, ad); vec3 rv = q - ad * t; float rr = length(rv);
  bool arm = t > 0.02 * S && rr < 0.085 * S && abs(P.x) > 0.125 * S;
  float ra = atan(rv.z, dot(rv, vec3(s * 0.936, 0.352, 0.0))); // round the sleeve: 0 outside, ±π inside
  float ln = 0.0;
  // patterns: stripes, checks, polka dots
  if (pat == 1) col = mix(col, uTop2, step(0.5, fract(P.y / (0.042 * S))) * 0.92);
  else if (pat == 2) {
    float u = fract((arm ? rr * ra : P.x) / (0.07 * S)), v = fract((arm ? t : P.y) / (0.07 * S));
    float a = step(0.62, u), b = step(0.62, v);
    col = mix(col, uTop2, clamp(0.5 * (a + b), 0.0, 0.85));
    col *= 1.0 - 0.16 * (gLn(u - 0.3, 0.05) + gLn(v - 0.3, 0.05));
  } else if (pat == 3) {
    vec2 c = vec2(arm ? rr * ra : P.x, arm ? t : P.y) / (0.034 * S);
    vec2 f = fract(c + vec2(step(0.5, fract(c.y * 0.5)) * 0.5, 0.0)) - 0.5;
    col = mix(col, uTop2, 1.0 - smoothstep(0.17, 0.23, length(f)));
  }
  if (!arm) {
    if (abs(P.x) > 0.095 * S && P.y < 1.34 * S) ln += gLn(P.z + 0.006 * S, 0.0022);   // side seams under the arms
    if (P.y > 1.42 * S && abs(P.x) > 0.065 * S) ln += gLn(P.z + 0.01 * S, 0.002);    // shoulder seams
    ln += gLn(P.y - (uCut.x + 0.013 * S), 0.0016) * gDs(P.x + P.z);                   // hem stitching
    if (st == 1 || st == 2 || st == 6 || st == 11) {
      // placket and buttons: a polo's three, a shirt's, a cardigan's or a waistcoat's all the way down
      float top = st == 6 ? 1.42 * S : st == 11 ? 1.16 * S : 1.455 * S, bot = st == 1 ? 1.33 * S : uCut.x + 0.02 * S;
      if (P.z > 0.03 * S && P.y < top && P.y > bot) {
        ln += gLn(abs(P.x) - 0.012 * S, 0.0018);
        float by = mod(P.y - top + 0.035 * S, 0.075 * S) - 0.0375 * S;
        float bd = length(vec2(P.x, by));
        float br = 0.0052 * S;
        if (bd < br) { col = mix(col, st == 6 ? col * 0.55 : vec3(0.86, 0.84, 0.79), 0.85); bump += (1.0 - bd / br) * 0.0006; ln += gLn(bd - br * 0.8, 0.0011) + gLn(bd - br * 0.25, 0.0008); }
      }
      if (st == 2 && P.z > 0.05 * S) { // chest pocket on the left
        vec2 pc = vec2(P.x - 0.075 * S, P.y - 1.285 * S);
        if (abs(pc.x) < 0.038 * S && abs(pc.y) < 0.045 * S) { float e = min(0.038 * S - abs(pc.x), 0.045 * S - abs(pc.y)); ln += gLn(e - 0.003 * S, 0.0015) + gLn(pc.y - 0.034 * S, 0.0013); }
      }
      if (st == 2) ln += gLn(P.y - 1.39 * S, 0.002) * step(P.z, -0.02 * S); // back yoke
    }
    if (st == 7 || st == 9) { // a zip down the middle: the teeth, the tape either side
      if (P.z > 0.03 * S) { float z0 = abs(P.x); ln += gLn(z0 - 0.006 * S, 0.002) * 0.7; col = mix(col, vec3(0.1), gLn(z0, 0.004 * S) * (0.4 + 0.4 * step(0.5, fract(P.y * 420.0)))); }
    }
    if (st == 7) { // jacket: panel seams from the shoulders down, pocket flaps at the waist
      ln += gLn(abs(P.x) - (0.085 - 0.02 * smoothstep(1.4, 1.0, P.y / S)) * S, 0.0022) * step(0.02 * S, P.z);
      vec2 fp = vec2(abs(P.x) - 0.1 * S, P.y - 1.02 * S);
      if (P.z > 0.03 * S && abs(fp.x) < 0.045 * S && fp.y < 0.0 && fp.y > -0.03 * S) { dk += 0.25 * gLn(fp.y + 0.03 * S, 0.003); ln += gLn(fp.y, 0.0018) + gLn(fp.y + 0.028 * S, 0.0015); }
    }
    if (st == 8) { // sweater: cables up the front
      float cx = mod(P.x / S + 0.03, 0.06) - 0.03;
      if (P.z > 0.0 && P.y < 1.38 * S) { float cb = sin(P.y / S * 160.0 + sign(cx) * 1.57) * 0.012; float m = gLn(abs(cx) - 0.008 - cb * 0.5, 0.006); bump += m * 0.0009; dk += (1.0 - m) * gLn(abs(cx) - 0.016, 0.004) * 0.2; }
    }
  } else {
    ln += gLn(t - 0.032 * S, 0.0022); // where the sleeve joins the body
    float sc = uCut.y;
    if (sc < 0.3 * S) { ln += gLn(t - (sc - 0.011 * S), 0.0014) * gDs(rr * ra); ln += gLn(t - (sc - 0.017 * S), 0.0014) * gDs(rr * ra); }
    else if (st == 2 || st == 7) ln += gLn(t - (sc - 0.055 * S), 0.0018); // the cuff
    if (st == 9) { float o = cos(ra); col = mix(col, uTop2, clamp(step(0.97, o) + step(0.9, o) * (1.0 - step(0.935, o)), 0.0, 1.0)); } // two stripes down the sleeve
    // elbow creases on long sleeves when the arm bends
    float eb = s > 0.0 ? uBend.x : uBend.y;
    if (sc > 0.3 * S) {
      float m = (1.0 - smoothstep(0.015 * S, 0.06 * S, abs(t - 0.285 * S))) * (0.25 + 0.75 * eb) * smoothstep(0.3, -0.6, cos(ra + 1.57));
      float w = sin(t * 650.0 + cNoise(P * 90.0) * 4.0);
      bump += w * 0.0008 * m; dk += 0.22 * m * (0.5 + 0.5 * w);
    }
  }
  // knitted rib on cuffs, hem bands and necklines
  if (trim && (st == 3 || st == 6 || st == 8 || st == 1 || st == 9)) { float rb = sin((arm ? rr * ra : P.x + P.z) * 1500.0) * 0.5 + 0.5; bump += rb * 0.00035; col *= 0.94 + 0.08 * rb; }
  // drape: diagonal folds fanning from the armpits, soft ones hanging under the chest, the fabric bunched above the hem
  if (st != 7 && st != 11) {
    vec2 ap = vec2(abs(P.x) - 0.16 * S, P.y - 1.34 * S);
    float ra2 = length(ap), aa = atan(ap.y, -ap.x);
    float armF = (1.0 - smoothstep(0.03 * S, 0.17 * S, ra2)) * smoothstep(0.012 * S, 0.035 * S, ra2) * step(abs(P.x), 0.17 * S) * (1.0 - float(arm));
    float wv = sin(aa * 19.0 + cNoise(P * 38.0) * 2.2);
    bump += wv * 0.0011 * armF; dk += 0.12 * armF * (0.5 - 0.5 * wv);
    float hemF = smoothstep(uCut.x + 0.1 * S, uCut.x + 0.025 * S, P.y) * smoothstep(uCut.x, uCut.x + 0.012 * S, P.y) * (1.0 - float(arm));
    float wh = sin(P.y / S * 260.0 + cNoise(vec3(P.x * 30.0, 0.0, P.z * 30.0)) * 5.0 + sin(P.x * 40.0) * 1.5);
    bump += wh * 0.0014 * hemF * (0.6 + 0.4 * smoothstep(0.02, -0.04, P.z)); dk += 0.1 * hemF * (0.5 - 0.5 * wh);
    float chestF = smoothstep(1.3 * S, 1.2 * S, P.y) * smoothstep(1.0 * S, 1.12 * S, P.y) * smoothstep(0.02 * S, 0.06 * S, P.z) * (1.0 - float(arm));
    float wc = sin(P.x / S * 120.0 + cNoise(P * 22.0) * 3.0);
    bump += wc * 0.0008 * chestF;
    if (arm) { float slF = smoothstep(0.12 * S, 0.04 * S, t) * 0.8; float wsl = sin(ra * 3.0 + t / S * 90.0 + cNoise(P * 60.0) * 2.5); bump += wsl * 0.0009 * slF; dk += 0.08 * slF * (0.5 - 0.5 * wsl); }
  }
  ln = clamp(ln, 0.0, 1.0) * gLod;
  bump -= ln * 0.0003;
  col = mix(col, col * 0.64, ln * 0.5);
}
void garmentBottom(inout vec3 col, inout float bump, inout float dk, vec3 P, bool trim) {
  float S = uBody.x, W = sqrt(uBody.y); int st = int(uGarm.y + 0.5);
  float s = P.x >= 0.0 ? 1.0 : -1.0;
  vec3 hp = gHipJ(s), ld = vec3(s * 0.05, -0.9988, 0.0);
  vec3 q = P - hp; float t = dot(q, ld); vec3 rv = q - ld * t; float r = length(rv);
  float ang = atan(rv.z, s * rv.x); // round the leg: 0 outside, ±π inside, + in front
  bool jeans = st == 0;
  float ln = 0.0, th = 0.0;
  if (t > 0.03 * S && st != 3) {
    ln += gLn(r * ang, 0.0024); ln += gLn(r * (abs(ang) - 3.1416), 0.0022); // outseam, inseam
    if (jeans) th += (gLn(r * ang - 0.004, 0.0011) + gLn(r * (abs(ang) - 3.1416) + 0.004, 0.0011)) * gDs(t);
    if (st == 5) col = mix(col, uBot2, clamp(gLn(r * ang - 0.009, 0.004) + gLn(r * ang + 0.009, 0.004), 0.0, 1.0)); // tracksuit stripes
  }
  if (trim) { // waistband: stitched along its lower edge, belt loops
    th += gLn(P.y - 0.967 * S, 0.0012) * gDs(P.x + P.z) * (jeans ? 1.0 : 0.6);
    float la = mod(atan(P.z, P.x) + 0.3, 1.05) - 0.525;
    if (abs(la) < 0.03 && st != 5 && st != 3) { bump += 0.0009; col *= 0.9; }
  }
  if (P.y > 0.8 * S && (jeans || st == 1 || st == 2 || st == 4)) {
    float px = abs(P.x) / (S * W), py = P.y / S;
    if (P.z > 0.0) {
      // front pockets: the curved mouth from the waistband to the side seam; a rivet at each end; the coin pocket
      float cy = 0.962 - 0.075 * pow(clamp((px - 0.07) / 0.085, 0.0, 1.0), 1.5);
      if (px > 0.07 && px < 0.16) { float d = (py - cy) * S; ln += gLn(d, 0.0025); th += jeans ? gLn(d + 0.005, 0.0011) * gDs(P.x) : 0.0; dk += 0.3 * gLn(d - 0.002, 0.0025); }
      if (jeans) {
        float rv1 = length(vec2(px - 0.155, py - 0.888) * S), rv2 = length(vec2(px - 0.072, py - 0.958) * S);
        float rvt = min(rv1, rv2); if (rvt < 0.0035) { col = mix(col, vec3(0.62, 0.42, 0.22), 0.9); bump += 0.0005; }
        if (s < 0.0 && px > 0.085 && px < 0.125 && py > 0.918 && py < 0.955) th += gLn(min(min(px - 0.085, 0.125 - px), py - 0.918) * S, 0.0011);
      }
      // the fly: a J of stitching left of centre
      if (py > 0.86 && py < 0.962) { float fx = P.x / (S * W); float d = py > 0.885 ? fx - 0.03 : length(vec2(fx, py - 0.885)) - 0.03; if (fx > -0.002) { ln += gLn(d * S, 0.002) * step(0.0, fx); th += jeans ? gLn(d * S - 0.004, 0.0011) * gDs(P.y) : 0.0; } }
    } else {
      // back pockets (jeans: pointed patches with double stitching; trousers: a welt), the yoke above them
      if (jeans) {
        float yk = 0.935 + 0.22 * px;
        ln += gLn((py - yk) * S, 0.002); th += gLn((py - yk) * S - 0.004, 0.0011) * gDs(P.x);
        vec2 b = vec2(px - 0.08, py - 0.885);
        float bot = -0.045 - 0.012 * (1.0 - abs(b.x) / 0.045);
        if (abs(b.x) < 0.045 && b.y < 0.045 && b.y > bot) {
          float e = min(min(0.045 - abs(b.x), 0.045 - b.y), b.y - bot) * S;
          ln += gLn(e, 0.0022); th += (gLn(e - 0.004, 0.0011) + gLn(e - 0.007, 0.0011)) * gDs(P.x + P.y);
          th += gLn((b.y + 0.01 - 0.18 * b.x * b.x / 0.002) * S, 0.0011) * step(abs(b.x), 0.035); // the decorative arc
        }
      } else if (st == 1 || st == 4) { if (abs(px - 0.075) < 0.04) ln += gLn((py - 0.915) * S, 0.0022) + gLn((py - 0.905) * S, 0.0018); }
    }
  }
  if (st == 1 && P.z > 0.0 && t > 0.1 * S) ln += gLn(r * (ang - 1.5708), 0.003) * 0.6; // pressed crease down the front
  if (st == 2 && t > 0.1 * S) ln += gLn(t - 0.228 * S, 0.0015) * gDs(r * ang); // shorts: hem stitching
  if (st == 7 && t > 0.1 * S) ln += gLn(t - 0.395 * S, 0.0016) * gDs(r * ang) + gLn(t - 0.405 * S, 0.0022); // bermuda: the turned-up hem
  if (st == 3) ln += gLn(P.y - (uCut.w + 0.012 * S), 0.0015) * gDs(P.x + P.z); // skirt hem
  // creases: behind the knee (more when it bends), stacked at the ankle on long trousers, across the front of a bent knee
  float kb = s > 0.0 ? uBend.z : uBend.w;
  if (t > 0.2 * S && st != 3) {
    float kn = 1.0 - smoothstep(0.02 * S, 0.075 * S, abs(t - 0.44 * S));
    float backm = smoothstep(0.9, 0.2, abs(ang + 1.5708)) * kn * (0.3 + 0.7 * kb), frontm = smoothstep(1.2, 0.3, abs(ang - 1.5708)) * kn * kb;
    float w1 = sin(t * 520.0 + cNoise(P * 70.0) * 5.0);
    bump += w1 * 0.001 * backm + sin(t * 380.0 + cNoise(P * 50.0) * 3.0) * 0.0006 * frontm;
    dk += 0.25 * backm * (0.5 + 0.5 * w1);
    if (st != 2 && st != 5) { float am = smoothstep(0.75 * S, 0.85 * S, t) * (0.6 + 0.4 * cNoise(P * 25.0)); float w2 = sin(t * 430.0 + cNoise(P * 45.0) * 7.0 + ang * 1.5); bump += w2 * 0.0012 * am; dk += 0.18 * am * (0.5 + 0.5 * w2); }
    if (st == 5) { float cf = smoothstep(0.8 * S, 0.83 * S, t); col *= 1.0 - 0.08 * cf; bump += sin(r * ang * 900.0) * 0.0003 * cf; }
  }
  if (jeans) { // whiskers fanning out from the crotch
    if (P.z > 0.0 && P.y > 0.82 * S && P.y < 0.9 * S) { float wa = atan((P.y / S - 0.84), abs(P.x) / S - 0.02); float wl = sin(wa * 22.0) * 0.5 + 0.5; col = mix(col, col * vec3(1.25, 1.27, 1.2), wl * 0.25 * smoothstep(0.1, 0.02, abs(abs(P.x) / S - 0.07))); }
  }
  ln = clamp(ln, 0.0, 1.0) * gLod;
  bump -= ln * 0.0003;
  col = mix(col, col * 0.66, ln * 0.45);
  col = mix(col, uThread, clamp(th, 0.0, 1.0) * 0.8 * gLod);
}
void garmentShoe(inout vec3 col, inout float bump, vec3 P, int rg) {
  float S = uBody.x, s = P.x >= 0.0 ? 1.0 : -1.0; int st = int(uGarm.w + 0.5);
  vec3 an = gHipJ(s) + vec3(s * 0.05, -0.9988, 0.0) * 0.87 * S;
  vec3 f = (P - an) / (S * mix(1.0, 0.92, uBody.z)); // foot frame: ankle at the origin, toes +z
  float ln = 0.0;
  if (rg == 7 || rg == 10) {
    if (st == 0) { // sneaker: toe cap, heel counter, two stripes on the outside, stitching round the sole
      ln += gLn(f.z - 0.135, 0.004) + gLn(f.z + 0.045, 0.004) * step(f.y, -0.02);
      float d = f.z * 0.8 - f.y * 0.6;
      if (s * f.x > 0.018 && f.z > -0.02 && f.z < 0.1 && f.y < -0.012) col = mix(col, uShoe2, clamp(gLn(d - 0.02, 0.006) + gLn(d - 0.045, 0.006), 0.0, 1.0));
    } else if (st == 1) { // shoe: a toe cap with a row of punched holes
      ln += gLn(f.z - 0.13, 0.003); float hd = length(vec2(fract(f.x * 90.0) - 0.5, (f.z - 0.122) * 90.0)); if (abs(f.z - 0.122) < 0.004) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.15, 0.3, hd));
    } else { ln += gLn(f.z - 0.12, 0.003) + gLn(f.x, 0.003) * step(0.02, f.z); } // boot: toe seam, the lacing line
    ln += gLn(f.y + 0.052, 0.0014) * gDs(f.x + f.z); // stitching along the sole
  }
  if (rg == 8) { float tr = step(0.5, fract(f.z * 60.0)) * gLn(f.y + 0.07, 0.006); col *= 1.0 - 0.15 * tr; bump += tr * 0.0004; } // tread on the sole edge
  col = mix(col, col * 0.6, clamp(ln, 0.0, 1.0) * 0.55 * gLod);
}
`;
const _hl = new THREE.Vector3();
function makeCharMaterial(uniforms) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: 0xffffff, specularIntensity: 0.6 });
  m.userData.u = uniforms;
  m.onBeforeCompile = (sh) => {
    for (const k in uniforms) sh.uniforms[k] = uniforms[k];
    sh.vertexShader = (STYLE.plastilina ? '#define CLAY_PUPPET\n' : '') + sh.vertexShader // (claymation: its surface boils, plastilina.js)
      .replace('#include <common>', '#include <common>' + CHAR_VS_HEAD)
      .replace('#include <color_vertex>', `#include <color_vertex>
  vColor.rgb = pow(vColor.rgb, vec3(2.2));
  vMat = aMat; vAO = aAO; vFace = aFace * 0.3; vRest = position; vReg = aReg; vUV2 = aUV;`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
  { // hair: the direction the strands run (away from the crown, down the jaw for a beard), skinned, in view space
    vec3 F = aFace * 0.3, d = F - vec3(uPart, 0.188, -0.022);
    float l = max(length(d.xz), 1e-4);
    vec3 g = vec3(d.x / l, d.y < 0.0 ? -0.9 : 0.0, d.z / l);
    if (F.y < 0.05 && F.y > -0.07 && abs(F.x) < 0.075 && F.z > 0.02 - 0.3 * min(F.y, 0.0)) g = vec3(0.0, -1.0, 0.25);
    if (aMat > 21.5) { vec3 dm = F - vec3(0.0, 0.142, 0.01); g = normalize(vec3(dm.x, min(dm.y, 0.0) * 1.2 - 0.015, dm.z)); }
    #ifdef USE_SKINNING
      g = (skinMatrix * vec4(g, 0.0)).xyz;
    #endif
    vHairT = normalize((modelViewMatrix * vec4(g, 0.0)).xyz);
  }`);
    // (claymation: a puppet — its thumbprints at its own scale, retouched at every pose)
    // (CWV: how much of the real fabric's weave shows — a puppet's clothes are modelled clay, not cloth)
    sh.fragmentShader = (STYLE.plastilina ? '#define CLAY_SCALE 2.4\n#define CLAY_PUPPET\n#define CWV 0.12\n#define CLAY_SET 2\n#define CLAY_TILE 0.3\n#define CLAY_AMP 0.0009\n#define CLAY_CAV 0.08\n' : '#define CWV 1.0\n') + sh.fragmentShader
      .replace('#include <common>', '#include <common>' + CHAR_FS_HEAD + CHAR_FS_CLOTH)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  int mc = int(vMat + 0.5);
  gBumpH = 0.0; gRough = 0.7; gSheen = 0.0; gMetal = 0.0; gHairK = 0.0; gHairT = vec3(0.0, 1.0, 0.0); gRelD = vec2(0.0); gSkin = 0.0;
  vec3 P = vRest;
  gPX = max(length(fwidth(P)), 1e-5);
  if (mc == 0 || mc == 1 || mc == 2 || mc == 15) { // skin: the body, the face and the lids share one shading, so no seam shows where they meet
    vec3 F = vFace; // head-bone space, metres (male reference); zero off the head
    bool hasF = dot(F, F) > 1e-10;
    float fem = uFem;
    float n = cNoise(P * 90.0) * 0.6 * fa(0.011) + cNoise(P * 300.0) * 0.4 * fa(0.0035);
    float mot = cNoise(P * 16.0 + 4.3) * 0.65 + cNoise(P * 41.0 + 1.7) * 0.35; // blotches: skin is never one flat colour
    vec3 col = diffuseColor.rgb * (0.975 + 0.05 * n);
    col *= mix(vec3(1.0), vec3(1.04, 0.955, 0.94), smoothstep(0.45, 0.85, mot) * 0.55) * (0.985 + 0.03 * mot);
    gSkin = 1.0; gRough = 0.5; gSheen = 0.35; gBumpH = n * 0.0002;
    #ifdef CLAY
    col = diffuseColor.rgb * vec3(1.0, 0.9, 0.82) * (0.985 + 0.03 * mot); gBumpH = 0.0; gSheen = 0.12; // (a puppet's skin: one smooth, warmer colour of clay)
    #endif
    if (hasF) { // painted lips, brows and creases with relief; stubble, makeup; the warm and cool parts of a face
      vec2 fuv = vec2(F.x / 0.14 + 0.5, (F.y + 0.045) / 0.16);
      float front = smoothstep(0.02, 0.04, F.z) * step(0.002, fuv.x) * step(fuv.x, 0.998) * step(0.002, fuv.y) * step(fuv.y, 0.998);
      vec3 pa = texture2D(uFaceA, fuv).rgb * front;
      vec3 pb = texture2D(uFaceB, fuv).rgb;
      float lipA = pa.r;
      col = mix(col, uLip * (0.94 + 0.08 * n), lipA * (0.84 + 0.1 * fem));
      col = mix(col, uHair * 0.78, pa.g * 0.93);
      col *= 1.0 - pa.b * vec3(0.46, 0.55, 0.57);
      float dots = mix(0.5, cNoise(P * 1400.0), fa(0.0008));
      cFaceHair(col, F, P, lipA, fem, dots);
      // blood near the surface: cheeks, the nose, the ears and the chin a little rosier; the eye sockets a touch cooler
      float cheek = exp(-pow((abs(F.x) - 0.042) / 0.017, 2.0) - pow((F.y - 0.046) / 0.016, 2.0)) * smoothstep(0.0, 0.03, F.z);
      col = mix(col, col * vec3(1.07, 0.88, 0.86), cheek * (0.26 + 0.3 * uMakeup * fem));
      float nose = exp(-pow(F.x / 0.013, 2.0) - pow((F.y - 0.044) / 0.012, 2.0)) * step(0.09, F.z);
      col = mix(col, col * vec3(1.06, 0.89, 0.87), nose * 0.34);
      float ear = smoothstep(0.066, 0.078, abs(F.x)) * smoothstep(0.02, 0.05, F.y) * smoothstep(0.11, 0.09, F.y);
      col = mix(col, col * vec3(1.06, 0.88, 0.86), ear * 0.4);
      float chin = exp(-pow(F.x / 0.018, 2.0) - pow((F.y + 0.026) / 0.012, 2.0)) * step(0.05, F.z);
      col = mix(col, col * vec3(1.04, 0.92, 0.9), chin * 0.25);
      float sock = 0.0;
      for (int k = 0; k < 2; k++) { float sx = k == 0 ? 0.032 : -0.032; sock += exp(-pow((F.x - sx) / 0.016, 2.0) - pow((F.y - 0.066) / 0.009, 2.0)); }
      col = mix(col, col * vec3(0.9, 0.9, 0.95), clamp(sock, 0.0, 1.0) * step(0.05, F.z) * 0.35);
      float wr = uAge * (0.5 + 0.5 * sin(F.y * 900.0 + cNoise(P * 200.0) * 3.0)) * smoothstep(0.06, 0.12, F.y) * step(0.07, F.z) * fa(0.007);
      col *= 1.0 - wr * 0.07;
      // relief (lips, folds, nostrils, creases): gradient taken from the map itself, so it stays smooth up close
      float rk = 0.00085 * front * (1.0 - smoothstep(0.0007, 0.0016, gPX));
      vec2 tx = vec2(1.0 / 512.0, 0.0);
      float hdu = (texture2D(uFaceB, fuv + tx.xy).r - texture2D(uFaceB, fuv - tx.xy).r) * 256.0;
      float hdv = (texture2D(uFaceB, fuv + tx.yx).r - texture2D(uFaceB, fuv - tx.yx).r) * 256.0;
      vec2 u1 = dFdx(fuv), u2 = dFdy(fuv);
      gRelD = vec2(hdu * u1.x + hdv * u1.y, hdu * u2.x + hdv * u2.y) * rk;
      // the T-zone shines a little, the cheeks are drier
      gRough = 0.5 + pb.g * front + 0.06 * cheek;
    }
    diffuseColor.rgb = col;
  } else if (mc == 3) { // cotton jersey (with an optional chest print projected from the front, rest pose)
    if (uPrintOn > 0.5 && P.z > uPrintC.z) {
      vec2 q = (P.xy - uPrintC.xy) / uPrintS * 0.5 + 0.5;
      if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) { vec4 t = texture2D(uPrint, q); diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a); }
    }
    float w = cNoise(P * 900.0) * fa(0.0012) * CWV;
    diffuseColor.rgb *= 0.96 + 0.06 * w;
    gRough = 0.86; gSheen = 0.8; gBumpH = w * 0.00018 + cNoise(P * 45.0) * 0.0012 * fa(0.022);
  } else if (mc == 4) { // knit / fleece
    float rib = (sin(P.x * 1400.0 + cNoise(P * 60.0) * 2.0) * 0.5 + 0.5) * fa(0.0045) * CWV;
    float w = cNoise(P * 500.0) * fa(0.002) * CWV;
    diffuseColor.rgb *= 0.95 + 0.07 * w + 0.03 * rib;
    gRough = 0.92; gSheen = 1.0; gBumpH = rib * 0.00022 + cNoise(P * 40.0) * 0.0015 * fa(0.025);
  } else if (mc == 5) { // denim: twill diagonals, fading on the front of the thighs/knees
    float tw = (sin((P.x * 0.7 + P.y + P.z * 0.7) * 1900.0) * 0.5 + 0.5) * fa(0.0033) * CWV;
    float slub = cNoise(vec3(P.x * 80.0, P.y * 900.0, P.z * 80.0)) * fa(0.0012) * CWV;
    float fade = smoothstep(0.35, 0.95, cNoise(P * 9.0)) * 0.5 + smoothstep(0.02, 0.1, P.z) * 0.25;
    vec3 c = diffuseColor.rgb * (0.9 + 0.12 * tw + 0.08 * slub);
    diffuseColor.rgb = mix(c, c * vec3(1.35, 1.38, 1.3) + vec3(0.02, 0.025, 0.035), fade * 0.45);
    gRough = 0.9; gSheen = 0.6; gBumpH = tw * 0.00022 + cNoise(P * 38.0) * 0.0015 * fa(0.026);
  } else if (mc == 6) { // twill / chino
    float tw = (sin((P.x + P.y * 1.3) * 1500.0) * 0.5 + 0.5) * fa(0.0042) * CWV;
    diffuseColor.rgb *= 0.96 + 0.05 * tw + 0.04 * cNoise(P * 150.0) * fa(0.007);
    gRough = 0.84; gSheen = 0.7; gBumpH = tw * 0.00015 + cNoise(P * 40.0) * 0.0012 * fa(0.025);
  } else if (mc == 7) { // leather
    float g = cNoise(P * 700.0) * fa(0.0015) * CWV;
    diffuseColor.rgb *= 0.94 + 0.1 * g;
    gRough = 0.42 + 0.12 * g; gSheen = 0.0; gBumpH = g * 0.00015;
  } else if (mc == 8) { gRough = 0.78; } // rubber
  else if (mc == 9) { // canvas sneaker
    float w = sin(P.x * 2200.0) * sin(P.z * 2200.0) * fa(0.003) * CWV;
    diffuseColor.rgb *= 0.97 + 0.04 * w;
    gRough = 0.82; gSheen = 0.5; gBumpH = w * 0.0001;
  } else if (mc == 10) { // hair: strands flowing out from the crown (down the jaw for a beard), in locks, a sheen along them
    vec3 F = vFace;
    vec3 clayBase = diffuseColor.rgb;
    bool bd = F.y < 0.05 && F.z > 0.0 && F.y > -0.07 && abs(F.x) < 0.075 && F.z > 0.02 - 0.3 * min(F.y, 0.0);
    vec3 d = F - vec3(uPart, 0.188, -0.022);
    float az = atan(d.x, d.z), rad = length(d.xz) + max(0.0, -d.y) * 0.9;
    if (bd) { az = atan(F.x, F.z + 0.02) * 1.6; rad = 0.1 - F.y; }
    // long hair ends in separate locks of different lengths, not a clean cut
    if (uHairEnd > -5.0 && !bd) {
      float e = (F.y - uHairEnd) / 0.05;
      if (e < 1.0) {
        float lenN = cNoise(vec3(az * 34.0, 0.5, 1.0)) * 0.55 + cNoise(vec3(az * 120.0, 2.0, 3.0)) * 0.3 + cNoise(vec3(az * 400.0, 4.0, 5.0)) * 0.15;
        if (e < lenN * 1.05 - 0.08) discard;
      }
    }
    float lk = cNoise(vec3(az * 6.5, rad * 8.0, 1.3)), lk2 = cNoise(vec3(az * 17.0, rad * 20.0, 4.1));
    float s1 = cNoise(vec3(az * 44.0 + lk * 3.0, rad * 5.0, 3.0)) * fa(0.006), s2 = cNoise(vec3(az * 130.0 + lk2 * 4.0, rad * 9.0, 7.0)) * fa(0.0025);
    float str = 0.5 + (s1 - 0.5 * fa(0.006)) * 0.7 + (s2 - 0.5 * fa(0.0025)) * 0.35;
    float tip = smoothstep(0.1, 0.32, rad) * (bd ? 0.0 : 1.0); // long hair lightens towards the ends
    float gap = smoothstep(0.3, 0.17, cNoise(vec3(az * 30.0, rad * 3.0, 4.1))) * 0.2; // the dark partings between locks, long and thin
    diffuseColor.rgb *= (0.78 + 0.34 * str) * (0.86 + 0.26 * lk) * (1.0 - gap) * (1.0 + 0.16 * tip);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.02, 0.94), tip * 0.5);
    if (bd) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35 + 0.012, str * 0.35); // a beard catches the light on its tips
    gRough = 0.46 + 0.16 * (1.0 - str); gSheen = 0.9; gBumpH = (str - 0.5) * 0.0005 + (lk - 0.5) * 0.0022 + (lk2 - 0.5) * 0.0009;
    gHairT = normalize(vHairT + normalize(vNormal) * (lk - 0.5) * 0.5); // locks tilt the band a little
    gHairK = (bd ? 0.8 : 1.25) * (1.0 - 0.75 * uCurl); gRough += 0.15 * uCurl; gSheen = 0.45; // curls scatter the light
    #ifdef CLAY
    { // sculpted hair: one piece of clay, combed — wide grooves along the strands, the locks as soft swells
      float gr = 0.5 + 0.5 * sin(az * 22.0 + lk * 5.0);
      diffuseColor.rgb = clayBase * (0.86 + 0.18 * lk) * (0.84 + 0.16 * gr);
      gRough = 0.5; gSheen = 0.1; gBumpH = (gr - 0.5) * 0.0016 + (lk - 0.5) * 0.003; gHairK = 0.0;
    }
    #endif
  } else if (mc == 11) { // eye (wet): iris fibres, collarette and limbal ring; a few veins towards the corners
    vec3 F = vFace;
    vec3 d = normalize(F - vec3(F.x > 0.0 ? 0.032 : -0.032, 0.075, 0.075));
    float th = acos(clamp(d.z, -1.0, 1.0)), ph = atan(d.y, d.x);
    float iris = smoothstep(0.16, 0.19, th) * (1.0 - smoothstep(0.39, 0.43, th));
    float fib = cNoise(vec3(ph * 14.0, th * 26.0, 3.0)) * 0.6 + cNoise(vec3(ph * 42.0, th * 70.0, 9.0)) * 0.4;
    float coll = exp(-pow((th - 0.25) / 0.028, 2.0));
    vec3 ic = diffuseColor.rgb * (0.6 + 0.8 * fib) * (1.0 + 0.4 * coll) * (1.0 - 0.5 * smoothstep(0.32, 0.41, th));
    diffuseColor.rgb = mix(diffuseColor.rgb, ic, iris);
    float scl = smoothstep(0.45, 0.52, th);
    float vein = smoothstep(0.64, 0.82, cNoise(vec3(ph * 9.0, th * 5.0, 1.0))) * smoothstep(0.7, 1.2, th);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 0.8, 0.78), (vein * 0.35 + smoothstep(0.8, 1.3, th) * 0.12) * scl);
    // the limbal ring: a soft grey-brown shadow round the iris, not a black line
    float limb = smoothstep(0.37, 0.43, th) * (1.0 - smoothstep(0.45, 0.56, th));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.13, 0.11), limb * 0.55);
    // the white of the eye: ivory, greyer towards the corners and in the shadow of the upper lid
    float lidSh = smoothstep(0.1, 0.55, d.y) * 0.3 + smoothstep(0.6, 1.1, th) * 0.18;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.84, 0.8, 0.78), scl * (0.35 + lidSh));
    #ifdef CLAY
    diffuseColor.rgb = mix(vec3(0.95, 0.93, 0.88), vec3(0.05, 0.04, 0.035), 1.0 - smoothstep(0.36, 0.4, th)); // a bead: white, a big black pupil
    #endif
    gRough = 0.05;
  }
  else if (mc == 16) { // eyelashes: fine dark hairs, in little clumps, each tapering to its tip
    vec3 F = vFace;
    vec3 e = F - vec3(F.x > 0.0 ? 0.032 : -0.032, 0.075, 0.075);
    float az = atan(e.x, e.z);
    float t = clamp((length(e) - 0.0158) / 0.0058, 0.0, 1.0);
    float c = fract(az * 95.0 + cNoise(vec3(az * 23.0, 1.0, 2.0)) * 1.4);
    float w = mix(0.62, 0.1, t) * (0.75 + 0.5 * cNoise(vec3(az * 60.0, 3.0, 1.0)));
    // single hairs only where a pixel is finer than a lash; further away the fringe reads as a soft dark line
    float far = smoothstep(0.00025, 0.0007, gPX);
    if (abs(c - 0.5) > mix(w * 0.5, 0.5, far) || (far > 0.5 && t > 0.55)) discard;
    diffuseColor.rgb *= 0.9;
    gRough = 0.45;
  }
  else if (mc == 17) { // the MakeHuman head: its photographed skin (pores, lips, lids, fine lines), tinted to the person's own colour
    vec3 F = vFace; float fem = uFem;
    vec3 col = texture2D(uMHSkin, vUV2).rgb * clamp(diffuseColor.rgb / max(uMHMean, vec3(0.02)), vec3(0.0), vec3(3.0));
    vec4 fm = texture2D(uMHLips, vUV2); float lipA = fm.r; // (the lips; g: a goatee's hair)
    #ifdef ANIME
    { // painted, not photographed: the person's own colour, rosy lips, a blush on the cheeks
      col = mix(diffuseColor.rgb, col, 0.07);
      col = mix(col, col * vec3(1.04, 0.84, 0.82), lipA * 0.4);
      float bl = exp(-pow((abs(F.x) - 0.04) / 0.018, 2.0) - pow((F.y - 0.05) / 0.014, 2.0)) * smoothstep(0.02, 0.05, F.z);
      col = mix(col, col * vec3(1.06, 0.84, 0.84), bl * 0.5);
    }
    #endif
    #ifdef CLAY
    { // a puppet's face: one smooth colour of skin clay, cheeks a little rosier, the lips a pressed-in darker pink
      col = mix(diffuseColor.rgb, col, 0.05) * vec3(1.0, 0.9, 0.82);
      col = mix(col, col * vec3(1.0, 0.78, 0.76), lipA * 0.65);
      float bl = exp(-pow((abs(F.x) - 0.04) / 0.02, 2.0) - pow((F.y - 0.05) / 0.016, 2.0)) * smoothstep(0.02, 0.05, F.z);
      col = mix(col, col * vec3(1.05, 0.85, 0.83), bl * 0.5);
    }
    #endif
    col = mix(col, col * mix(vec3(1.0), uLip / max(diffuseColor.rgb, vec3(0.02)), 0.6), lipA * uMakeup * fem * 0.6); // a touch of lipstick
    float n = cNoise(P * 300.0) * fa(0.0035), n2 = cNoise(P * 900.0) * fa(0.0012);
    // down the neck the photograph gives way to the plain skin of the sculpted neck it is stitched to (no seam)
    float nk = smoothstep(uNeckY + 0.055, uNeckY + 0.006, P.y);
    col = mix(col, diffuseColor.rgb * (0.975 + 0.05 * n), nk);
    gSkin = 1.0; gSheen = 0.3;
    gRough = mix(0.5, 0.34, lipA) - 0.07 * smoothstep(0.148, 0.163, F.z) * (1.0 - smoothstep(0.012, 0.026, abs(F.x))); // lips and the tip of the nose shine a little
    gBumpH = (n - 0.5) * 0.00012 + (n2 - 0.5) * 0.00005; // pores
    #ifdef CLAY
    gBumpH = 0.0; gSheen = 0.1; gRough = mix(0.5, 0.38, lipA); // (no pores in clay)
    #endif
    float hcov = cMHHair(col, diffuseColor.rgb, F, P, lipA, fem, vec4(texture2D(uMHHair, vUV2).rgb, fm.g));
    gSheen *= 1.0 - hcov; if (hcov > 0.55) gSkin = 0.0; // (hair painted on it does not glow like skin)
    col *= 1.0 - 0.68 * fm.b; gSheen *= 1.0 - fm.b; gRough = mix(gRough, 0.3, fm.b); // the inside of the mouth, in its own shade
    diffuseColor.rgb = col;
  }
  else if (mc == 18) { diffuseColor.rgb = texture2D(uMHEye, vUV2).rgb; gRough = 0.06;
    #ifdef CLAY
    gRough = 0.1; // (a bead: its texture repainted white and black, glossy)
    #endif
  } // the eye: its painted iris and white, wet
  else if (mc == 19 || mc == 20) { // eyebrows and eyelashes: painted hairs on little cards; their alpha becomes the pixel's
    // coverage (the frame is multisampled), so the hairs have soft, fine edges and no sorting is needed
    vec4 t = mc == 19 ? texture2D(uMHBrow, vUV2) : texture2D(uMHLash, vUV2);
    float a = t.a * (mc == 19 ? 0.92 : 1.0);
    if (a < 0.04) discard;
    diffuseColor.a = clamp((a - 0.04) * 1.3, 0.0, 1.0);
    diffuseColor.rgb = (mc == 19 ? uBrow * 0.72 : vec3(0.022, 0.018, 0.016)) * (0.7 + 0.6 * dot(t.rgb, vec3(0.333)));
    #ifdef ANIME
    diffuseColor.a = smoothstep(mc == 19 ? 0.22 : 0.2, mc == 19 ? 0.42 : 0.38, a); // (one stroke, not hairs)
    diffuseColor.rgb = mc == 19 ? uBrow * 0.55 : vec3(0.03, 0.025, 0.03);
    #endif
    #ifdef CLAY
    if (mc == 20) discard; // (a puppet has no lashes)
    diffuseColor.a = smoothstep(0.2, 0.36, a); diffuseColor.rgb = uBrow * 0.6; // (a brow: a little roll of clay)
    #endif
    gRough = mc == 19 ? 0.62 : 0.45;
  }
  else if (mc == 21) { diffuseColor.rgb = vec3(0.8, 0.76, 0.68) * 0.62; gRough = 0.3; } // teeth (in the mouth's shade)
  else if (mc == 22) { // hair (MakeHuman's cards): painted strands in grey, tinted to the person's colour; alpha → coverage
    vec4 t = texture2D(uMHHairTex, vUV2);
    if (t.a < 0.05) discard;
    // a fringe: whatever hangs over the face below the brows is cut away (a bob with bangs), in pointed locks
    if (uFringe.x > 0.5) {
      float u = vRest.x / 0.017 + 0.5, i = floor(u), r = fract(sin(i * 127.1 + 3.7) * 43758.55);
      float jf = abs(fract(u) - 0.5) * 2.0; // (locks of different lengths, each to a point)
      if (vRest.y < uFringe.y + (0.003 + 0.005 * r) * jf - 0.003 * r && vRest.z > uFringe.z - 0.02 && abs(vRest.x) < uFringe.w + 0.03) discard;
    }
    // and a length: cut round the head (a little longer at the back), its ends in points too
    if (uHem.x > 0.5) {
      float back = clamp((uFringe.z - 0.03 - vRest.z) / 0.12, 0.0, 1.0);
      float u = atan(vRest.x, vRest.z - uFringe.z + 0.09) * 3.1, i = floor(u), r = fract(sin(i * 91.7 + 1.3) * 43758.55);
      float jh = abs(fract(u) - 0.5) * 2.0;
      if (vRest.y < uHem.y - uHem.z * back + uHem.w * (0.45 + 0.55 * r) * jh - 0.006 * r) discard;
    }
    diffuseColor.a = clamp((t.a - 0.05) * 1.35, 0.0, 1.0);
    float l = t.r;
    #ifdef ANIME
    diffuseColor.a = smoothstep(0.24, 0.46, t.a);                    // (locks with a clean edge)
    diffuseColor.rgb *= 0.82 + 0.3 * smoothstep(0.42, 0.58, l);      // two tones of the colour
    #elif defined(CLAY)
    diffuseColor.a = smoothstep(0.2, 0.4, t.a);                      // (sculpted locks of clay, not hairs)
    diffuseColor.rgb *= 0.86 + 0.24 * smoothstep(0.35, 0.65, l);
    #else
    diffuseColor.rgb *= (0.28 + 1.44 * l) * (0.94 + 0.12 * cNoise(P * 40.0));
    #endif
    gRough = 0.46 + 0.2 * (1.0 - l); gSheen = 0.45; gBumpH = (l - 0.5) * 0.0004;
    gHairT = normalize(vHairT); gHairK = 1.0 - 0.6 * uCurl;
    #ifdef CLAY
    // (a puppet's hair is a piece of clay worked with a modelling tool: deep grooves along the locks, the clay's waxy
    // sheen, none of the shine of real hair)
    gBumpH = (smoothstep(0.25, 0.75, l) - 0.5) * 0.0019; gRough = 0.5; gSheen = 0.1; gHairK = 0.0;
    #endif
  }
  else if (mc == 12) { gRough = 0.12; } // glossy plastic / lenses
  else if (mc == 13) { gRough = 0.3; gMetal = 1.0; } // metal
  else if (mc == 14) { // nylon
    float w = sin(P.x * 1800.0) * sin(P.y * 1800.0) * fa(0.0035) * CWV;
    diffuseColor.rgb *= 0.96 + 0.04 * w;
    gRough = 0.6; gSheen = 0.3; gBumpH = w * 0.0001;
  }
  { // garment detail: seams, pockets, buttons, patterns and creases (fading out before it can alias)
    int rg = int(vReg + 0.5); float dk = 0.0; vec3 col = diffuseColor.rgb; float bh = 0.0;
    if (uBagMark > 0.5 && rg == 21 && P.z < -0.25 * uBody.x * uBody.y) { // the courier's mark on the backpack: a white envelope
      vec2 u = vec2(P.x / uBody.y, P.y - 1.3 * uBody.x) / uBody.x;
      float fr = abs(max(abs(u.x) - 0.066, abs(u.y) - 0.046));
      vec2 a = vec2(abs(u.x), u.y), b0 = vec2(0.066, 0.046), b1 = vec2(0.0, -0.004), ba = b1 - b0;
      float fl = length(a - b0 - ba * clamp(dot(a - b0, ba) / dot(ba, ba), 0.0, 1.0));
      float dm = min(fr, fl) - 0.0055, aa = fwidth(dm) + 1e-5;
      col = mix(col, vec3(0.93, 0.92, 0.88), 1.0 - smoothstep(-aa, aa, dm));
    }
    gLod = 1.0 - smoothstep(0.003, 0.008, gPX); gLod2 = 1.0 - smoothstep(0.008, 0.02, gPX);
    if (rg == 1 || rg == 2) garmentTop(col, bh, dk, P, rg == 2);
    else if (rg == 3 || rg == 4) garmentBottom(col, bh, dk, P, rg == 4);
    else if (rg == 7 || rg == 8 || rg == 10) garmentShoe(col, bh, P, rg);
    diffuseColor.rgb = col * (1.0 - dk * 0.5 * gLod2); gBumpH += bh * gLod2;
  }
  if (uZombie > 0.5 && mc != 10 && mc != 11 && mc < 18) { // zombies: dried blood, dirt and bruises (not on eyes, hair, teeth)
    float bl = smoothstep(0.6, 0.72, cNoise(P * 13.0 + 3.7)) * (0.6 + 0.4 * cNoise(P * 60.0));
    float dirt = smoothstep(0.45, 0.8, cNoise(P * 5.0 + 9.1));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.5, 0.42), dirt * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.015, 0.01), bl * 0.9);
    gRough = mix(gRough, 0.35, bl);
  }
}`)
      .replace('#include <lights_physical_pars_fragment>', STYLE.anime ? '#include <lights_physical_pars_fragment>' : THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        'reflectedLight.directDiffuse += (gSkin > 0.5 ? cSkinIrr(dot(geometryNormal, directLight.direction)) * directLight.color : irradiance) * BRDF_Lambert( material.diffuseColor );'))
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = ${STYLE.plastilina ? 'mix(gRough, 0.5, 0.65)' : 'gRough'};`) // (claymation: plasticine's sheen; its prints come over the clothes' own colours in the chunk)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = gMetal;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = cBump(normal, gBumpH, faceDirection);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.sheenColor = mix(vec3(0.0), (int(vMat + 0.5) <= 2 || int(vMat + 0.5) == 15 || int(vMat + 0.5) == 17) ? vec3(0.32, 0.12, 0.08) : diffuseColor.rgb * 0.6 + 0.06, clamp(gSheen, 0.0, 1.0));
material.sheenRoughness = (int(vMat + 0.5) <= 2 || int(vMat + 0.5) == 15 || int(vMat + 0.5) == 17) ? 0.5 : 0.75;
#ifdef ANIME
material.sheenColor *= 0.25;
#endif
{ int mcs = int(vMat + 0.5);
  float spk = (mcs <= 2 || mcs == 15 || mcs == 17) ? 0.7 : (mcs >= 3 && mcs <= 6) ? 0.4 : (mcs == 11 || mcs == 12 || mcs == 18) ? 1.6 : (mcs == 10 || mcs == 19 || mcs == 22) ? 0.22 : (mcs == 16 || mcs == 20) ? 0.3 : 1.0;
  material.specularColor *= spk;
  material.specularF90 *= (mcs == 10 || mcs == 19 || mcs == 22) ? 0.22 : (mcs >= 3 && mcs <= 9) ? 0.55 : (mcs == 16 || mcs == 20) ? 0.3 : 1.0; }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
if (gHairK > 0.0) {
  vec3 Lh = directionalLights[0].direction, Vh = normalize(vViewPosition), Hh = normalize(Lh + Vh);
  vec3 Tn = normalize(gHairT - normal * dot(gHairT, normal));
  float th = dot(Tn, Hh), sn = sqrt(max(0.0, 1.0 - th * th));
  float nl = clamp(dot(normal, Lh), 0.0, 1.0);
  float lit = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) / (dot(diffuseColor.rgb * directionalLights[0].color, vec3(0.333)) * nl * RECIPROCAL_PI + 1e-4), 0.0, 1.0);
  float th2 = dot(normalize(Tn + normal * 0.18), Hh), sn2 = sqrt(max(0.0, 1.0 - th2 * th2)); // the secondary lobe, tinted by the hair
  #ifdef ANIME
  vec3 band = directionalLights[0].color * smoothstep(0.972, 0.986, sn) * 0.11 * (diffuseColor.rgb * 1.5 + 0.3) * step(0.05, nl) * lit * gHairK; // one clean ring of light
  #else
  vec3 band = directionalLights[0].color * (pow(sn, 140.0) * 0.055 * (diffuseColor.rgb * 1.6 + 0.35) + pow(sn2, 26.0) * 0.045 * (diffuseColor.rgb * 3.5 + 0.06)) * nl * lit * gHairK;
  #endif
  reflectedLight.directSpecular += band;
}
#endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ int mca = int(vMat + 0.5); float ao = (mca <= 2 || mca == 15 || mca == 17) ? mix(vAO, 1.0, 0.3) : mca == 21 ? 0.4 : vAO; // skin: lighter creases; the teeth, inside
  reflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= ao;
  reflectedLight.directDiffuse *= mix(1.0, ao, 0.45); reflectedLight.directSpecular *= mix(1.0, ao, 0.6);
  #ifdef ANIME
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(1.2, 0.97, 0.92), gSkin); // (skin in shade is warm, not grey)
  #endif
  #ifdef CLAY
  { // the studio's backlight: a thin warm rim round the puppet from above and behind — the light stop-motion films use
    // to lift a puppet off its set, whatever the sun does
    float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
    float up = clamp(dot(normal, normalize(vec3(-0.35, 0.94, 0.0))) * 0.6 + 0.4, 0.0, 1.0);
    reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.93, 0.82) * fres * up * 0.4 * ao;
  }
  #endif
}`);
  };
  m.alphaToCoverage = true; // (brows and lashes; every other class writes alpha 1)
  if (STYLE.anime) m.defines = { ANIME: '' };
  else if (STYLE.plastilina) m.defines = { CLAY: '' }; // (claymation: a puppet)
  m.customProgramCacheKey = () => 'char16' + (STYLE.anime ? 'a' : '');
  return m;
}

// ---------------------------------------------------------------- shape cache in IndexedDB (instant second visits)
const DB_NAME = 'guarena-evo-chars', STORE = 'shapes'; // (not the fixed version's cache: same site on GitHub Pages)
function idbOpen() {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
}
function idbGet(db, key) {
  return new Promise((res) => {
    if (!db) return res(null);
    try { const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(key); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); } catch (e) { res(null); }
  });
}
function idbPut(db, key, val) {
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key); } catch (e) { /* quota or private mode */ }
}

// ---------------------------------------------------------------- factory: builds shapes in workers, hands out characters
// the MakeHuman data: gunzipped from assets/mh/head.bin.gz (embedded in the published page), and the skins' own colours
async function loadMHData() {
  const [gz, js] = await Promise.all([loadAssetBytes('mh/head.bin.gz'), loadAssetBytes('mh/skins.json')]);
  if (js) try { MH_SKINS = JSON.parse(new TextDecoder().decode(js)); } catch (e) { MH_SKINS = null; }
  if (!gz || typeof DecompressionStream === 'undefined') return null;
  const ds = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}
export class CharacterFactory {
  constructor(opts = {}) {
    this.q = opts.q || 1;        // mesh resolution scale (coarser on low-end devices)
    this.lodNear = opts.lodNear || 13;
    this.B = charBuilderMain(mhLib); // main-thread copy: rig() and fallback builds
    this.shapes = new Map();    // key → shape (THREE attributes, bone inverses)
    this.pending = new Map();   // key → { spec, cbs: [], prio }
    this.queue = [];
    this.live = new Set();
    this.geoPool = new Map();   // key → [ {hi, lo} geometries ready for reuse ]
    this.matPool = [];
    this.bronze = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.38, metalness: 0.85 });
    this.workers = [];
    this.busy = 0;
    this.version = this.B.VERSION;
    this.dbReady = opts.noCache ? Promise.resolve(null) : idbOpen().then((db) => (this.db = db)); // noCache: dev bench, always rebuild
    try {
      const src = `(${charBuilderMain.toString()})(${mhLib.toString()});`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.onmessage = (e) => this.onResult(w, e.data);
        w.onerror = (e) => { console.warn('char worker error', e.message); w.dead = true; w.job = null; this.pump(); };
        w.job = null;
        this.workers.push(w);
      }
    } catch (e) { console.warn('workers unavailable, building characters on the main thread', e); }
    // the MakeHuman heads (a few hundred KB, unzipped once): nothing is built before it has come — a shape made without
    // it must not be taken for (and cached as) one made with it
    this.mhReady = false; this.mhOn = false;
    loadMHData().then((buf) => {
      if (buf) {
        this.mhBuf = buf;
        this.mhOn = this.B.setMH(buf);
        mhPreload();
        for (const w of this.workers) w.postMessage({ mh: buf.slice().buffer });
      }
    }).catch((e) => console.warn('MakeHuman data unavailable', e)).finally(() => { this.mhReady = true; this.pump(); });
  }
  // queue shapes for building (highest priority first)
  spec(desc) { const s = shapeSpec(desc); if (this.q !== 1) { s.q = this.q; s.key += '|q' + this.q; } return s; }
  prebuild(descs, prio = 0) { for (const d of descs) this.request(this.spec(d), null, prio); }
  whenReady(desc) { return new Promise((res) => this.request(this.spec(desc), res, 10)); }
  get idle() { return !this.pending.size; }
  request(spec, cb, prio = 0) {
    const s = this.shapes.get(spec.key);
    if (s) { if (cb) cb(s); return; }
    let p = this.pending.get(spec.key);
    if (!p) {
      p = { spec, cbs: [], prio, state: 'wait' };
      this.pending.set(spec.key, p);
      this.dbReady.then(() => idbGet(this.db, 'v' + this.version + ':' + spec.key)).then((r) => {
        if (r && p.state === 'wait') { p.state = 'done'; this.finish(spec.key, r, false); } else if (p.state === 'wait') { p.state = 'queued'; this.queue.push(p); this.pump(); }
      });
    }
    p.prio = Math.max(p.prio, prio);
    if (cb) p.cbs.push(cb);
  }
  pump() {
    if (!this.mhReady) return;
    this.queue.sort((a, b) => b.prio - a.prio);
    const free = this.workers.filter((w) => !w.job && !w.dead);
    if (!this.workers.length || this.workers.every((w) => w.dead)) {
      // main-thread fallback, one shape per call so the page stays responsive
      const p = this.queue.shift();
      if (!p) return;
      setTimeout(() => { const r = this.B.build({ ...p.spec, lods: undefined }); this.finish(p.spec.key, r, !(r.mhWanted && !r.mh)); this.pump(); }, 0);
      return;
    }
    for (const w of free) {
      const p = this.queue.shift();
      if (!p) break;
      w.job = p.spec.key;
      w.postMessage({ id: p.spec.key, spec: p.spec });
    }
  }
  onResult(w, data) {
    w.job = null;
    if (data.error) {
      console.warn('character build failed', data.id, data.error);
      const p = this.pending.get(data.id);
      if (p) { try { this.finish(data.id, this.B.build(p.spec), true); } catch (e) { console.error(e); } }
    } else this.finish(data.id, data.r, !(data.r.lods && data.r.mhWanted && !data.r.mh));
    this.pump();
  }
  finish(key, r, store) {
    const p = this.pending.get(key);
    if (store) idbPut(this.db, 'v' + this.version + ':' + key, r);
    const shape = this.makeShape(r);
    this.shapes.set(key, shape);
    this.pending.delete(key);
    if (p) for (const cb of p.cbs) cb(shape);
  }
  makeShape(r) {
    const lods = r.lods.map((l) => {
      const A = {
        position: new THREE.BufferAttribute(l.pos, 3),
        normal: new THREE.BufferAttribute(l.nrm, 3, true),
        skinIndex: new THREE.BufferAttribute(l.si, 4),
        skinWeight: new THREE.BufferAttribute(l.sw, 4, true),
        aMat: new THREE.BufferAttribute(l.mat, 1),
        aAO: new THREE.BufferAttribute(l.ao, 1, true),
        aFace: new THREE.BufferAttribute(l.face, 3, true),
        aReg: new THREE.BufferAttribute(l.reg, 1),
        aUV: new THREE.BufferAttribute(l.uv || new Uint16Array(l.nv * 2), 2, true),
      };
      const index = new THREE.BufferAttribute(l.index, 1);
      const bs = new THREE.Sphere();
      const tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', A.position); tmp.computeBoundingSphere(); bs.copy(tmp.boundingSphere); bs.radius += 0.25;
      return { A, index, reg: l.reg, nv: l.nv, bs };
    });
    // bind matrices in character space (A-pose), shared by every character of this shape
    const root = new THREE.Object3D();
    const byName = {}, order = [];
    for (const b of r.bones) {
      const o = new THREE.Object3D();
      o.position.fromArray(b.off);
      o.rotation.set(b.rot[0], b.rot[1], b.rot[2]);
      (b.parent ? byName[b.parent] : root).add(o);
      byName[b.name] = o;
      order.push(o);
    }
    root.updateMatrixWorld(true);
    const inverses = order.map((o) => o.matrixWorld.clone().invert());
    return { key: r.key, lods, bones: r.bones, inverses, neckY: r.neckY ?? null, brow: r.brow || null };
  }
  // per-character geometry: shared attributes + its own colours
  geometry(shape, desc) {
    const pool = this.geoPool.get(shape.key);
    const pal = palette(desc);
    const pair = pool && pool.length ? pool.pop() : shape.lods.map((L) => {
      const g = new THREE.BufferGeometry();
      for (const k in L.A) g.setAttribute(k, L.A[k]);
      g.setIndex(L.index);
      g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(L.nv * 3), 3, true));
      g.boundingSphere = L.bs;
      return g;
    });
    pair.forEach((g, i) => {
      const reg = shape.lods[i].reg, col = g.attributes.color.array;
      const lut = pal.map((c) => [Math.round(Math.pow(c.r, 1 / 2.2) * 255), Math.round(Math.pow(c.g, 1 / 2.2) * 255), Math.round(Math.pow(c.b, 1 / 2.2) * 255)]);
      for (let v = 0; v < reg.length; v++) { const c = lut[reg[v]] || lut[0]; col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; }
      g.attributes.color.needsUpdate = true;
    });
    return pair;
  }
  releaseGeometry(key, pair) {
    let pool = this.geoPool.get(key);
    if (!pool) this.geoPool.set(key, (pool = []));
    if (pool.length < 12) pool.push(pair);
  }
  material(desc) {
    const m = this.matPool.pop() || makeCharMaterial({ uHair: { value: new THREE.Color() }, uLip: { value: new THREE.Color() }, uStubble: { value: 0 }, uMakeup: { value: 0 }, uBuzz: { value: 0 }, uAge: { value: 0 },
      uPrint: { value: kittyTexture() }, uPrintOn: { value: 0 }, uPrintC: { value: new THREE.Vector3() }, uPrintS: { value: new THREE.Vector2(1, 1) }, uZombie: { value: 0 },
      uFaceA: { value: null }, uFaceB: { value: null }, uFem: { value: 0 }, uHL: { value: new THREE.Vector4(0, 0, 0, -10) }, uPart: { value: 0 }, uCurl: { value: 0 }, uCapHair: { value: 0 }, uBeard: { value: 0 }, uHairEnd: { value: -10 },
      uBody: { value: new THREE.Vector4(1, 1, 0, 0) }, uBagMark: { value: 0 }, uFringe: { value: new THREE.Vector4() }, uHem: { value: new THREE.Vector4() }, uBend: { value: new THREE.Vector4() }, uGarm: { value: new THREE.Vector4() }, uCut: { value: new THREE.Vector4(0.925, 0.13, 0, 0.47) },
      uTop2: { value: new THREE.Color() }, uBot2: { value: new THREE.Color() }, uThread: { value: new THREE.Color() }, uShoe2: { value: new THREE.Color() },
      uMHSkin: { value: null }, uMHEye: { value: null }, uMHBrow: { value: null }, uMHLash: { value: null }, uMHLips: { value: null }, uMHMean: { value: new THREE.Vector3(0.6, 0.35, 0.25) },
      uMHHair: { value: null }, uMHStyle: { value: new THREE.Vector4(0.94, 0, 0, 0) }, uMHHairTex: { value: null }, uNeckY: { value: -10 }, uBrow: { value: new THREE.Color() } });
    const u = m.userData.u;
    // the MakeHuman head's textures: the skin for this age, sex and ancestry (and its own colour, to tint it to the
    // person's), their eyes' colour, the brows and lashes the shape was fitted with
    {
      const sk = mhSkinFor(desc), mean = (MH_SKINS && MH_SKINS[sk]) || [0.8, 0.6, 0.5], sp0 = shapeSpec(desc).mh;
      u.uMHSkin.value = mhTex('skin_' + sk + '.webp', true, `rgb(${mean.map((c) => Math.round(c * 255)).join(',')})`); u.uMHEye.value = mhTex('eye_' + mhEyeFor(desc) + '.webp');
      u.uMHBrow.value = mhTex('brow_' + sp0.brow + '.webp', false); u.uMHLash.value = mhTex('lash_' + sp0.lash + '.webp', false);
      u.uMHLips.value = mhTex('mask_face.png', false); u.uMHHair.value = mhTex('mask_hair.png', false);
      u.uMHHairTex.value = sp0.hair ? mhTex('hair_' + sp0.hair + '.webp', false) : u.uMHLips.value;
      u.uMHMean.value.set(Math.pow(mean[0], 2.2), Math.pow(mean[1], 2.2), Math.pow(mean[2], 2.2));
    }
    const skin = new THREE.Color(desc.skinColor || SKIN[desc.skin ?? 1]);
    u.uHair.value.set(desc.hairColor || HAIR[desc.hair ?? 0]);
    { // brows, beard and stubble: the hair's colour if it could be natural; under a dyed one (blue, violet, pink,
      // green…) a dark brown
      const hsl = u.uHair.value.getHSL({});
      const dyed = hsl.s > 0.3 && hsl.l > 0.08 && (hsl.h < 0.01 || hsl.h > 0.15);
      u.uBrow.value.copy(dyed ? new THREE.Color('#2b1d14') : u.uHair.value);
    }
    u.uZombie.value = desc.zombie ? 1 : 0;
    const f = desc.gender === 'f';
    u.uLip.value.copy(skin).lerp(new THREE.Color(f ? (desc.lips || '#b65a5e') : '#95524e'), f ? 0.48 : 0.4);
    const bst = f ? null : desc.beardStyle || (desc.beard ? (desc.elderly ? 'full' : 'short') : null); // as shapeSpec reads it
    u.uStubble.value = !f && (desc.stubble || bst) ? (bst === 'barba3' ? 0.95 : 0.8) : !f && !desc.elderly ? 0.25 : 0;
    u.uMakeup.value = f && !desc.elderly ? 1 : 0.3;
    u.uBuzz.value = desc.hairStyle === 'rapado' || desc.hairStyle === 'cresta' ? 1 : 0;
    const hatK = desc.hat !== undefined ? desc.hat : desc.accessory === 'gorra' || desc.accessory === 'boina' ? desc.accessory : null; // as shapeSpec reads it
    const hatOn = ['gorra', 'boina', 'gorro', 'sombrero'].includes(hatK);
    u.uBeard.value = { bigote: 1, perilla: 2, short: 3, full: 4 }[bst] || 0;
    u.uHairEnd.value = { media: -0.045, largo: -0.21 }[desc.hairStyle] ?? -10; // where the long cuts end (charbuild HAIR.long)
    u.uCapHair.value = hatOn && !f && !['largo', 'media', 'melena', 'coleta', 'trenza', 'mono', 'afro'].includes(desc.hairStyle || 'corto') && desc.hairStyle !== 'rapado' ? 1 : 0;
    u.uPart.value = desc.hairStyle === 'peinado' ? 0.03 : desc.hairStyle === 'melena' || desc.hairStyle === 'media' ? -0.012 : 0; // where the hair parts
    u.uCurl.value = desc.hairStyle === 'rizos' || desc.hairStyle === 'afro' ? 1 : 0;
    u.uAge.value = desc.elderly ? 1 : 0;
    { // the MakeHuman scalp: thick under a haircut, cropped (rapado, a mohawk's sides, what shows under a cap), bald on top
      const hs0 = desc.hairStyle || 'corto', crop = hs0 === 'rapado' || hs0 === 'cresta' || u.uCapHair.value > 0.5;
      u.uMHStyle.value.set(hs0 === 'calvo' ? 0.9 : crop ? 0.85 : 0.94, hs0 === 'calvo' ? 1 : 0, crop || hs0 === 'calvo' ? 1 : 0, desc.elderly ? 0 : 1);
    }
    const maps = faceMaps(this.B, f ? 'f' : 'm');
    u.uFaceA.value = maps.A; u.uFaceB.value = maps.B; u.uFem.value = f ? 1 : 0;
    // hairline plane of the hair shell (charbuild.js hairLayer) for the soft edge painted on the forehead
    const hs = desc.hairStyle || 'corto';
    if (hs === 'largo' || hs === 'media' || hs === 'melena' || hs === 'rapado' || hs === 'afro' || hs === 'cresta' || desc.zombie) u.uHL.value.set(0, 0, 0, -10);
    else { _hl.set(0, f ? -0.2 : -0.185, f ? 0.133 : 0.143).normalize(); u.uHL.value.set(_hl.x, _hl.y, _hl.z, _hl.y * -0.005 + _hl.z * -0.095); }
    // garment detail: body measures, which garments, the pattern, second colours, hem and sleeve lengths
    const sp = shapeSpec(desc), rS = (f ? 0.935 : 1) * sp.S;
    const ts = desc.topStyle || 'tshirt', bs = desc.bottomStyle || 'jeans';
    u.uBody.value.set(rS, sp.W, f ? 1 : 0, sp.slim || 0);
    u.uBagMark.value = desc.bagMark ? 1 : 0;
    u.uGarm.value.set(TOP_ID[ts] ?? 0, BOT_ID[bs] ?? 0, PATTERN_ID[desc.topPattern] ?? 0, SHOE_ID[sp.shoe] ?? 0);
    u.uCut.value.set((sp.tucked ? 0.9 : HEM_Y[ts] ?? 0.925) * rS, (SLEEVE[ts] ?? 0.13) * rS, sp.tucked ? 1 : 0, (bs === 'skirt' ? (sp.elderly ? 0.38 : sp.skirtShort ? 0.53 : 0.47) : 0) * rS);
    u.uTop2.value.set(desc.top2 || '#f4f4f0');
    u.uBot2.value.set(desc.bottom2 || '#f4f4f0');
    u.uThread.value.set(desc.thread || '#c8923e');
    const pal = palette(desc); u.uShoe2.value.copy(pal[10]);
    // chest print: centred a little below the bust line, sized to the body
    u.uPrintOn.value = desc.print === 'kitty' && (desc.topStyle || 'tshirt') === 'tshirt' ? 1 : 0;
    if (u.uPrintOn.value) {
      u.uPrintC.value.set(0, (f ? 1.262 : 1.3) * sp.S, 0.03 * sp.S);
      u.uPrintS.value.set(0.095 * sp.S * sp.W, 0.083 * sp.S);
    }
    return m;
  }
  releaseMaterial(m) { if (this.matPool.length < 24) this.matPool.push(m); }
  create(desc, statue = false) {
    const c = desc.hero && !statue && this.heroClass && this.heroClass.ready() ? new this.heroClass(desc, this) : new Character(desc, this, statue);
    this.live.add(c);
    return c;
  }
  // LOD + shadow switching for every live character (called once per frame)
  // alt: a second viewpoint (the street seen from the windows of a house): each one takes the nearer of the two
  updateLods(camPos, shadows = true, alt = null) {
    const k = 13 / this.lodNear;
    for (const c of this.live) {
      const d = c.object.position.distanceTo(camPos);
      c.setDistance((alt ? Math.min(d, c.object.position.distanceTo(alt)) : d) * k, shadows);
    }
  }
}

// ---------------------------------------------------------------- how each person moves
// Walk personality: hip sway and pelvis roll, bounce, arm swing, stride, posture (slouch > 0), swagger in the shoulders,
// stance width, and the little things they do while standing around. Pedestrians get a seeded blend.
const GAITS = {
  // Álex walks like the courier of Messenger: upright, short quick steps with a young bounce, the arms hanging close and
  // barely swinging, no swagger; idle, he looks about him
  alex: { hips: 0.55, sway: 0.75, bounce: 1.3, arms: 0.55, stride: 0.9, slouch: -0.01, swagger: 0.04, wide: -0.012, fidgets: ['look', 'shift', 'look', 'stretch', 'look'] },
  manu: { hips: 0.7, sway: 1.3, bounce: 0.8, arms: 0.85, stride: 0.95, slouch: 0.04, swagger: 0.5, wide: 0.045, fidgets: ['cross', 'stretch', 'look', 'scratch', 'cross'] },
  dani: { hips: 0.8, sway: 0.8, bounce: 1.4, arms: 1.2, stride: 1.06, slouch: 0.06, swagger: 0.25, wide: 0.01, fidgets: ['tap', 'phone', 'look', 'shift', 'scratch'] },
  lucia: { hips: 1.35, sway: 1.0, bounce: 1.05, arms: 0.9, stride: 1.02, slouch: -0.02, swagger: 0.12, wide: -0.01, fidgets: ['hips', 'look', 'phone', 'hair', 'watch'] },
  rocio: { hips: 1.1, sway: 1.0, bounce: 0.95, arms: 1.05, stride: 1.04, slouch: -0.03, swagger: 0.35, wide: 0.02, fidgets: ['cross', 'stretch', 'hips', 'look', 'hair'] },
  carmen: { hips: 1.7, sway: 1.05, bounce: 0.85, arms: 0.8, stride: 0.94, slouch: -0.04, swagger: 0.1, wide: -0.015, fidgets: ['hips', 'watch', 'look', 'hair', 'cross'] },
  annie: { hips: 1.5, sway: 1.0, bounce: 1.3, arms: 1.05, stride: 1.0, slouch: -0.02, swagger: 0.15, wide: -0.01, fidgets: ['hair', 'look', 'tap', 'phone', 'hips'] },
  adri: { hips: 0.9, sway: 1.15, bounce: 1.15, arms: 1.1, stride: 1.0, slouch: 0.02, swagger: 0.7, wide: 0.015, fidgets: ['look', 'scratch', 'tap', 'cross', 'phone'] },
};
function gaitFor(desc, seed) {
  const gp = desc.gait && PLAYER_PRESETS.find((p) => p.id === desc.gait);
  if (gp && gp.gender === desc.gender) return GAITS[desc.gait]; // a custom character walks like the one whose edge it took
  if (GAITS[desc.id]) return GAITS[desc.id];
  const r = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };
  const f = desc.gender === 'f', old = !!desc.elderly;
  return {
    hips: (f ? 1.25 : 0.8) + r(1) * 0.4, sway: 1 + r(2) * 0.3, bounce: (old ? 0.6 : 1) + r(3) * 0.3, arms: (f ? 0.9 : 1) + r(4) * 0.3,
    stride: (old ? 0.9 : 1) + r(5) * 0.08, slouch: (old ? 0.04 : 0) + r(6) * 0.06, swagger: (f ? 0.15 : 0.35) + r(7) * 0.4, wide: r(8) * 0.03,
    fidgets: old ? ['look', 'shift', 'watch', 'cross'] : f ? ['look', 'hips', 'phone', 'hair', 'shift', 'watch'] : ['look', 'cross', 'phone', 'scratch', 'shift', 'stretch'],
  };
}
// idle fidgets: additive poses over the standing pose, e = 0..1 envelope, t = seconds into the fidget
export const FIDGETS = {
  look: { dur: [2.5, 4], pose: (R, e, t, c) => { c.fidYaw = Math.sin(t * 1.15 + c.seed) * 0.75 * e; } },
  cross: { dur: [4, 7], pose: (R, e) => { R('armL', -0.3 * e, -1.2 * e, -0.12 * e); R('foreL', -1.9 * e); R('armR', -0.34 * e, 1.2 * e, 0.12 * e); R('foreR', -1.85 * e); R('head', -0.03 * e); } },
  // hands on hips: the upper arm turns on its own axis before it opens out, so the elbow bends in towards the waist
  hips: { dur: [3, 5], pose: (R, e, t, c) => { c.QP('armL', 0.02, 0.62, -1.25, e); R('foreL', -1.65 * e); c.QP('armR', 0.02, -0.62, 1.25, e); R('foreR', -1.65 * e); R('hips', 0, 0, 0.04 * e); R('head', 0, 0, -0.04 * e); } },
  scratch: { dur: [1.8, 2.6], pose: (R, e, t) => { R('armR', -2.35 * e, 0.2 * e, -0.35 * e); R('foreR', -2.05 * e + Math.sin(t * 17) * 0.12 * e); R('head', 0.1 * e, 0, 0.12 * e); } },
  watch: { dur: [2, 3], pose: (R, e) => { R('armL', -0.75 * e, -1.1 * e, -0.1 * e); R('foreL', -1.75 * e); R('head', 0.42 * e, 0.15 * e, 0); R('neck', 0.1 * e); } },
  phone: { dur: [3, 5.5], pose: (R, e, t) => { R('armR', -0.55 * e, 0.4 * e, 0.12 * e); R('foreR', -1.55 * e); R('armL', -0.5 * e, -0.3 * e, -0.12 * e); R('foreL', -1.45 * e); R('head', 0.48 * e, 0, 0); R('neck', 0.18 * e); R('fingR', 0, 0, 0.25 * e * Math.max(0, Math.sin(t * 5))); } },
  stretch: { dur: [2.5, 3.5], pose: (R, e) => { R('armL', -2.75 * e, 0, 0.32 * e); R('armR', -2.75 * e, 0, -0.32 * e); R('foreL', -0.35 * e); R('foreR', -0.35 * e); R('spine', -0.12 * e); R('head', -0.22 * e); } },
  tap: { dur: [1.8, 3], pose: (R, e, t) => { const k = Math.max(0, Math.sin(t * 11)); R('footR', -0.32 * k * e); R('shinR', 0.1 * e); R('thighR', -0.05 * e); } },
  hair: { dur: [1.6, 2.2], pose: (R, e) => { R('armR', -0.6 * e, 0.3 * e, -1.35 * e); R('foreR', -2.3 * e); R('head', 0, -0.15 * e, -0.1 * e); } },
  shift: { dur: [2, 3.5], pose: (R, e, t, c) => { R('hips', 0, 0, 0.05 * e); c.fidX = 0.02 * e; R('shinR', 0.2 * e); R('thighR', -0.1 * e); R('footR', -0.08 * e); } },
};

// ---------------------------------------------------------------- one-shot actions
// Arms are posed with three.js XYZ Euler angles, i.e. applied z, then y, then x: z raises the arm sideways (left +,
// right −), y then swings the raised arm round horizontally (left −, right + bring it forward) and x pitches it
// (− forward / up). u runs 0 → 1 through the action; each returns what the hands and the face do meanwhile.
const bump = (u, a, b, c, d) => smoothstep(a, b, u) * (1 - smoothstep(c, d, u)); // rises a→b, falls c→d
const guard = (R, g, lead = 'L') => {
  // fists up in front of the chin, elbows in, chin down
  R('armL', -0.55 * g, 0, -0.12 * g); R('foreL', -2.25 * g, 0.2 * g); R('handL', 0.25 * g);
  R('armR', -0.55 * g, 0, 0.12 * g); R('foreR', -2.3 * g, -0.2 * g); R('handR', 0.25 * g);
  R('clavL', 0, -0.06 * g, 0.05 * g); R('clavR', 0, 0.06 * g, -0.05 * g);
  R('neck', 0.12 * g); R('head', 0.06 * g);
  // boxer's stance: knees soft, lead foot forward
  R('thighL', (lead === 'L' ? -0.2 : 0.05) * g); R('shinL', 0.22 * g); R('thighR', (lead === 'L' ? 0.05 : -0.2) * g); R('shinR', 0.22 * g);
};
export const ACTION_POSES = {
  // lead-hand jab (left): the shoulder rolls forward, the chin tucks behind it, the other fist guards the face
  jab(R, O, u) {
    const g = bump(u, 0, 0.14, 0.78, 1), s = bump(u, 0.1, 0.28, 0.42, 0.7);
    guard(R, g);
    R('armL', -1.0 * s, 0.1 * s, 0.3 * s); R('foreL', 2.1 * s, -0.2 * s); R('handL', 0, -1.0 * s, 0);
    R('clavL', 0, -0.2 * s, 0.03 * s);
    R('chest', 0.04 * g, -0.24 * s, 0); R('spine', 0.05 * g, -0.1 * s, 0); R('head', 0, 0.18 * s, 0);
    R('thighL', -0.1 * s); R('footR', 0.15 * s);
    return { fist: g, face: 'angry', fw: g, hz: 0.04 * s, hy: -0.02 * g };
  },
  // rear-hand cross (right): the hips and shoulders turn through, the back heel lifts and pivots
  cross(R, O, u) {
    const g = bump(u, 0, 0.14, 0.78, 1), w = bump(u, 0.02, 0.13, 0.13, 0.24), s = bump(u, 0.13, 0.32, 0.44, 0.78);
    guard(R, g);
    R('armR', -1.0 * s, -0.1 * s, -0.5 * s); R('foreR', 2.2 * s, 0.2 * s); R('handR', 0, 1.0 * s, 0);
    R('clavR', 0, 0.24 * s, -0.04 * s);
    R('hips', 0, 0.22 * s - 0.1 * w, 0); R('spine', 0.04 * g, 0.12 * s - 0.08 * w, 0); R('chest', 0, 0.22 * s - 0.1 * w, 0);
    R('head', 0, -0.45 * s, 0); // eyes stay on the target while the body turns
    R('thighR', 0, 0.25 * s); R('shinR', 0.12 * s); R('footR', 0.5 * s); R('toeR', -0.55 * s);
    return { fist: g, face: 'angry', fw: g, hz: 0.05 * s, hy: -0.025 * g };
  },
  // left hook: elbow up at shoulder height, forearm level, the whole body turning into it on the lead foot
  hookL(R, O, u) {
    const g = bump(u, 0, 0.14, 0.78, 1), w = bump(u, 0.03, 0.15, 0.15, 0.27), s = bump(u, 0.15, 0.34, 0.46, 0.8);
    guard(R, g);
    R('armL', 0.55 * s, -0.75 * s, 1.3 * s + 0.1 * w); R('foreL', 0.5 * s, -0.2 * s); R('handL', 0, -0.4 * s, 0);
    R('clavL', 0, -0.1 * s, 0.1 * s);
    R('hips', 0, -0.3 * s + 0.12 * w, 0); R('spine', 0, -0.22 * s + 0.08 * w, 0); R('chest', 0, -0.36 * s + 0.12 * w, 0);
    R('head', 0, 0.62 * s, 0);
    R('thighL', 0, -0.2 * s); R('footL', 0.2 * s); R('toeL', -0.3 * s);
    return { fist: g, face: 'angry', fw: g, hz: 0.02 * s, hy: -0.03 * g };
  },
  // right uppercut: dip the shoulder and bend the knees, then drive up through the legs, the fist rising under the chin
  upper(R, O, u) {
    const g = bump(u, 0, 0.14, 0.78, 1), d = bump(u, 0.04, 0.18, 0.2, 0.36), s = bump(u, 0.2, 0.38, 0.5, 0.84);
    guard(R, g);
    R('armR', 0.3 * d - 0.75 * s, 0.1 * s, 0.1 * s); R('foreR', 0.5 * d + 0.55 * s, -0.3 * s); R('handR', -0.3 * s, 0.7 * s, 0);
    R('spine', 0.14 * d - 0.14 * s, -0.1 * d + 0.16 * s, -0.12 * d); R('chest', 0, -0.1 * d + 0.22 * s, -0.08 * d); R('hips', 0, 0.2 * s, 0);
    R('thighL', -0.3 * d); R('shinL', 0.45 * d); R('thighR', -0.28 * d); R('shinR', 0.45 * d); R('footR', 0.25 * s); R('toeR', -0.3 * s);
    R('head', 0.08 * d, -0.35 * s, 0);
    return { fist: g, face: 'effort', fw: 1, hy: -0.05 * d + 0.015 * s, hz: 0.02 * s };
  },
  // front kick with the right: knee up (chamber), snap the shin out, pull it back; arms out for balance
  kick(R, O, u) {
    const c = bump(u, 0, 0.22, 0.62, 0.9), x = bump(u, 0.22, 0.36, 0.44, 0.64);
    R('thighR', -1.45 * c + 0.1 * x); R('shinR', 1.9 * c - 1.75 * x); R('footR', -0.3 * x); R('toeR', -0.5 * x);
    R('thighL', -0.1 * c); R('shinL', 0.2 * c); R('footL', 0.12 * c);
    R('spine', -0.2 * x - 0.05 * c); R('chest', -0.05 * c); R('head', 0.15 * x);
    R('armL', -0.5 * c, 0, 0.4 * c); R('foreL', -1.4 * c); R('armR', 0.25 * c, 0, -0.3 * c); R('foreR', -1.2 * c);
    return { fist: c, face: 'angry', hz: -0.03 * x, hy: 0.01 * c };
  },
  // baseball bat, right-handed: cock it back over the right shoulder, uncoil hips then shoulders, swing level, follow through
  bat(R, O, u) {
    const w = bump(u, 0, 0.24, 0.28, 0.44), s = bump(u, 0.28, 0.44, 0.5, 0.74), f = bump(u, 0.44, 0.64, 0.76, 1);
    R('hips', 0, -0.35 * w + 0.45 * s + 0.3 * f, 0); R('spine', 0.06, -0.3 * w + 0.35 * s + 0.25 * f, 0); R('chest', 0, -0.45 * w + 0.5 * s + 0.35 * f, 0);
    R('head', 0, 0.6 * w - 0.55 * s - 0.45 * f, 0);
    R('clavR', 0, -0.1 * w + 0.15 * s, -0.1 * w); R('clavL', 0, 0.1 * w - 0.15 * s, 0);
    R('armR', -0.3 * w - 1.2 * s - 0.7 * f, 0.6 * s + 0.9 * f, -1.0 * w - 0.4 * s); R('foreR', -1.7 * w - 0.25 * s - 0.6 * f);
    R('armL', -0.8 * w - 1.25 * s - 0.9 * f, 0.5 * w - 0.2 * s - 0.5 * f, -0.1 * w + 0.1 * s + 0.6 * f); R('foreL', -1.3 * w - 0.35 * s - 0.5 * f);
    R('handR', -0.5 * w + 0.4 * s); R('handL', -0.5 * w + 0.4 * s);
    R('thighL', -0.2 * (w + s)); R('shinL', 0.22 * (w + s)); R('thighR', 0.05, 0.25 * (s + f)); R('footR', 0.45 * s + 0.35 * f); R('toeR', -0.5 * (s + f));
    return { fist: 1, face: 'effort', hz: 0.03 * s };
  },
  // a shove with both hands
  push(R, O, u) {
    const w = bump(u, 0, 0.2, 0.2, 0.35), s = bump(u, 0.22, 0.38, 0.5, 0.9);
    R('armL', -0.6 * w - 1.35 * s, 0, -0.1 * s); R('armR', -0.6 * w - 1.35 * s, 0, 0.1 * s);
    R('foreL', -1.6 * w - 0.05 * s); R('foreR', -1.6 * w - 0.05 * s); R('handL', -0.9 * s); R('handR', -0.9 * s);
    R('clavL', 0, -0.2 * s, 0); R('clavR', 0, 0.2 * s, 0);
    R('spine', 0.15 * s - 0.05 * w); R('thighL', -0.35 * s); R('shinL', 0.3 * s); R('thighR', 0.15 * s); R('footR', 0.3 * s);
    return { open: 1, face: 'angry', hz: 0.08 * s };
  },
  // a blow taken from the front: head snaps back, arms fly up, a step back
  hit(R, O, u, c) {
    const e = bump(u, 0, 0.1, 0.3, 1);
    R('spine', -0.3 * e); R('chest', -0.1 * e); R('neck', -0.2 * e); R('head', -0.35 * e, 0, 0.12 * e);
    R('armL', -0.5 * e, 0, 0.5 * e); R('armR', -0.4 * e, 0, -0.6 * e); R('foreL', -0.8 * e); R('foreR', -0.6 * e);
    R('clavL', 0, 0, 0.12 * e); R('clavR', 0, 0, -0.12 * e);
    R('thighL', 0.15 * e); R('shinL', 0.2 * e); R('thighR', -0.12 * e); R('shinR', 0.32 * e); R('footR', -0.15 * e);
    c.blinkP = Math.max(c.blinkP, e);
    return { open: e, face: 'pain', hz: -0.06 * e, hy: -0.02 * e };
  },
  // hit from behind: thrown forward, arms out
  hitB(R, O, u, c) {
    const e = bump(u, 0, 0.1, 0.3, 1);
    R('spine', 0.35 * e); R('chest', 0.12 * e); R('neck', 0.25 * e); R('head', 0.2 * e);
    R('armL', 0.4 * e, 0, 0.6 * e); R('armR', 0.4 * e, 0, -0.6 * e); R('foreL', -0.5 * e); R('foreR', -0.5 * e);
    R('thighL', -0.35 * e); R('shinL', 0.4 * e); R('thighR', 0.1 * e);
    c.blinkP = Math.max(c.blinkP, e);
    return { open: e, face: 'pain', hz: 0.06 * e };
  },
  // a wave hello
  wave(R, O, u, c) {
    const e = bump(u, 0, 0.15, 0.8, 1);
    R('clavR', 0, 0, -0.15 * e); R('armR', -0.3 * e, 0.2 * e, -2.4 * e); R('foreR', -0.6 * e, 0, 0.45 * Math.sin(c.actionT * 13) * e); R('handR', -0.2 * e);
    R('head', 0, -0.1 * e, 0.05 * e); R('chest', 0, 0, 0.04 * e);
    return { open: e, face: 'happy', fw: e };
  },
  // getting into a car: duck, lead leg in, a hand on the frame
  enter(R, O, u) {
    const e = Math.sin(Math.min(1, u) * Math.PI);
    R('spine', 0.5 * e); R('neck', 0.15 * e); R('thighL', -0.8 * e); R('shinL', 1.0 * e); R('armR', -1.0 * e, 0, -0.3 * e); R('foreR', -0.5 * e);
    return { open: e * 0.6 };
  },
  // yes / no with the head
  nod(R, O, u) { const e = bump(u, 0, 0.1, 0.8, 1); R('head', 0.22 * Math.max(0, Math.sin(u * Math.PI * 4)) * e); R('neck', 0.06 * e); return { face: 'happy', fw: 0.4 * e }; },
  shake(R, O, u) { const e = bump(u, 0, 0.1, 0.8, 1); R('head', 0.04 * e, 0.3 * Math.sin(u * Math.PI * 5) * e); return { face: 'doubt', fw: e }; },
  // don't know: shoulders up, palms up, head to one side
  shrug(R, O, u) {
    const e = bump(u, 0, 0.25, 0.65, 1);
    R('clavL', 0, 0, 0.25 * e); R('clavR', 0, 0, -0.25 * e);
    R('armL', -0.2 * e, 0, 0.3 * e); R('armR', -0.2 * e, 0, -0.3 * e); R('foreL', -1.2 * e, -1.2 * e); R('foreR', -1.2 * e, 1.2 * e);
    R('head', 0, 0, 0.15 * e);
    return { open: e, face: 'doubt', fw: e };
  },
  // pointing (at a car, at the way to go)
  point(R, O, u) {
    const e = bump(u, 0, 0.2, 0.75, 1);
    R('clavR', 0, 0.15 * e, 0); R('armR', -1.45 * e, 0.15 * e, 0.05 * e); R('foreR', -0.1 * e); R('head', 0, -0.15 * e, 0); R('chest', 0, -0.12 * e, 0);
    return { open: 0.5 * e };
  },
  // bending down to pick something up
  pickup(R, O, u) {
    const e = bump(u, 0, 0.35, 0.6, 1);
    R('spine', 0.55 * e); R('chest', 0.25 * e); R('neck', 0.1 * e); R('head', 0.25 * e);
    R('thighL', -0.95 * e); R('thighR', -0.7 * e); R('shinL', 1.4 * e); R('shinR', 1.2 * e); R('footL', -0.5 * e); R('footR', -0.45 * e);
    R('armR', -1.0 * e, 0, -0.1 * e); R('foreR', -0.3 * e); R('armL', -0.3 * e, 0, 0.2 * e); R('foreL', -0.8 * e);
    return { open: e, hy: -0.28 * e, hz: -0.04 * e };
  },
  // knocking on a door
  knock(R, O, u, c) {
    const e = bump(u, 0, 0.15, 0.85, 1), k = Math.max(0, Math.sin(c.actionT * 18)) * smoothstep(0.2, 0.3, u) * (1 - smoothstep(0.7, 0.8, u));
    R('armR', -1.25 * e + 0.1 * k, 0.1 * e, 0.12 * e); R('foreR', -1.5 * e + 0.35 * k); R('handR', 0.3 * k);
    return { fist: e };
  },
  // arms up: a goal, a win
  cheer(R, O, u, c) {
    const e = bump(u, 0, 0.15, 0.8, 1), b = Math.sin(c.actionT * 9) * 0.15;
    R('clavL', 0, 0, 0.2 * e); R('clavR', 0, 0, -0.2 * e);
    R('armL', -0.2 * e, 0, 2.6 * e + b); R('armR', -0.2 * e, 0, -2.6 * e - b); R('foreL', -0.4 * e); R('foreR', -0.4 * e);
    R('head', -0.2 * e); R('spine', -0.08 * e);
    return { fist: e, face: 'grin', fw: e, hy: 0.02 * Math.abs(b) * e };
  },
  // clapping
  clap(R, O, u, c) {
    const e = bump(u, 0, 0.15, 0.85, 1), k = 0.5 + 0.5 * Math.sin(c.actionT * 16);
    R('armL', -0.9 * e, 0.2 * e, -0.05 * e - 0.12 * k * e); R('armR', -0.9 * e, -0.2 * e, 0.05 * e + 0.12 * k * e);
    R('foreL', -1.1 * e, -0.6 * e); R('foreR', -1.1 * e, 0.6 * e);
    return { open: e, face: 'happy', fw: e };
  },
  // an overarm throw with the right
  throw(R, O, u) {
    const w = bump(u, 0, 0.3, 0.3, 0.45), s = bump(u, 0.35, 0.5, 0.55, 0.9);
    R('armR', 0.4 * w - 1.9 * s, 0.4 * w, -1.7 * w + 0.6 * s); R('foreR', -1.8 * w + 1.2 * s); R('chest', 0, -0.4 * w + 0.5 * s, 0); R('hips', 0, -0.2 * w + 0.3 * s, 0);
    R('armL', -1.2 * w, 0, 0.3 * w); R('thighL', -0.35 * (w + s)); R('shinL', 0.25 * (w + s)); R('footR', 0.4 * s);
    return { fist: w, face: 'effort', hz: 0.04 * s };
  },
  // wiping the brow / tired
  wipe(R, O, u) {
    const e = bump(u, 0, 0.25, 0.7, 1);
    R('armR', -0.9 * e, 0.4 * e, -0.6 * e); R('foreR', -2.3 * e, -0.3 * e); R('handR', 0.2 * e, 0, 0.3 * Math.sin(u * 12) * e); R('head', -0.1 * e);
    return { open: e, face: 'effort', fw: e };
  },
};
export const GESTURES = ['beat', 'beatL', 'open', 'shrug', 'apart', 'chest', 'wave', 'count', 'clasp', 'beat', 'open'];
const MOVABLE = ['hips', 'browL', 'browR', 'mouthL', 'mouthR'];
const COMBO = ['jab', 'cross', 'hookL', 'upper'];

// ---------------------------------------------------------------- character
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const _ikA = new THREE.Vector3(), _ikB = new THREE.Vector3(), _ikC = new THREE.Vector3(), _ikM = new THREE.Matrix4();
const _ikX = new THREE.Vector3(), _ikY = new THREE.Vector3(), _ikZ = new THREE.Vector3(), _ikQ = new THREE.Quaternion();
// two-bone IK: the upper bone hanging from joint J (in the frame parentQ) and the lower one reach for T, the middle
// joint pointing towards P (sgn +1: the lower bone folds back, like a knee; −1: forward, like an elbow). Bones point
// down their −y and fold about their x. Writes both local rotations.
function ik2(J, T, P, parentQ, L1, L2, sgn, outU, outL) {
  const d = _ikA.subVectors(T, J);
  const D = clamp(d.length(), Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.999);
  d.normalize();
  const kn = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  const al = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const pp = _ikB.copy(P).addScaledVector(d, -P.dot(d));
  if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1).addScaledVector(d, -d.z);
  pp.normalize();
  const u = _ikC.copy(d).multiplyScalar(Math.cos(al)).addScaledVector(pp, Math.sin(al));
  _ikY.copy(u).negate();
  _ikZ.copy(pp).addScaledVector(u, -pp.dot(u)).normalize().multiplyScalar(sgn);
  _ikX.crossVectors(_ikY, _ikZ);
  _ikM.makeBasis(_ikX, _ikY, _ikZ);
  outU.setFromRotationMatrix(_ikM).premultiply(_ikQ.copy(parentQ).invert());
  outL.setFromAxisAngle(_AX, kn * sgn);
}
const GU_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'clavR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _AX = new THREE.Vector3(1, 0, 0), _AY = new THREE.Vector3(0, 1, 0), _AZ = new THREE.Vector3(0, 0, 1);
// claymation (src/plastilina.js): a puppet's proportions, as bone scales over the person's own build
export const PUPPET = [['head', 1.24], ['eyeL', 1.42], ['eyeR', 1.42], ['lidL', 1.42], ['lidR', 1.42], ['browL', 1.3], ['browR', 1.3], ['handL', 1.2], ['handR', 1.2]]; // (a toy's head, as the puppets of the user's pictures)
export class Character {
  constructor(desc, factory, statue = false) {
    this.desc = desc;
    this.factory = factory;
    this.statue = statue;
    this.spec = this.makeSpec ? this.makeSpec(desc, factory) : factory.spec(desc); // (a subclass may build its own: the hero)
    this.key = this.spec.key;
    this.object = new THREE.Group();
    if (STYLE.plastilina && !statue) SM.add(this.object); // (claymation: a puppet, posed 12 times a second)
    const byName = {}, list = [];
    for (const b of this.rigBones ? this.rigBones() : factory.B.rig(this.spec)) {
      const o = new THREE.Bone();
      o.name = b.name;
      o.position.fromArray(b.off);
      (b.parent ? byName[b.parent] : this.object).add(o);
      byName[b.name] = o;
      list.push(o);
    }
    this.bones = byName;
    this.boneList = list;
    this.rest = Object.fromEntries(list.map((b) => [b.name, b.position.clone()]));
    this.legL1 = this.rest.shinL.length(); this.legL2 = this.rest.footL.length(); // thigh and shin lengths
    // heel and ball of the foot on the sole, from the ankle (standing straight the ankle is this high off the ground)
    const ankH = this.rest.hips.y + this.rest.thighL.y - this.legL1 - this.legL2;
    this.heelOff = [0, -ankH, -0.045 * this.rest.hips.y / 0.98]; this.ballOff = [0, -ankH, this.rest.toeL.z];
    this.scale = (this.spec.g === 'f' ? 0.935 : 1) * this.spec.S;
    this.meshes = null;
    this.lod = 0;
    this._shadow = true;
    this.ready = false;
    // animation state
    this.phase = Math.random() * TAU;
    this.t = Math.random() * 10;
    this.blend = { walk: 0, run: 0, sprint: 0 };
    this.headK = (this.spec.g === 'f' ? 0.955 : 1) * this.spec.S; // head size (face bone offsets)
    this.mood = null; // 'happy', 'angry', 'scared', 'sad'…: the face they wear
    this.combo = 0; this.lastPunchT = -9;
    this.action = null; this.actionT = 0; this.actionDur = 0.5;
    this.base = null; this.baseW = 0;
    this.hairV = [0, 0]; this.hairA = [0, 0];
    this.lean = 0;
    this.seed = Math.random() * 100;
    this.gait = gaitFor(desc, this.seed);
    this.accS = 0; this.idleT = 0; this.nextFid = 3 + Math.random() * 6; this.fid = null;
    this.lookClock = Math.random() * 2; this.lookGoal = [0, 0]; this.lookCur = [0, 0];
    this.turnK = 0; this.turnPh = 0; this.airT = 0; this.airVy = 0; this.landK = 0; this.landT = 0;
    this.blinkT = 1 + Math.random() * 3; this.blinkP = 0;
    this.gaze = [0, 0]; this.gazeT = 0; this.gazeGoal = [0, 0];
    this.lookTarget = null;
    this.talkAmt = 0;
    factory.request(this.spec, (shape) => this.attach(shape), statue ? 1 : 5);
  }
  attach(shape) {
    if (this.disposed) return;
    this.shape = shape;
    // the bones' rest offsets as the shape was built (a MakeHuman head puts the eyes, lids and brows over its own eyeballs)
    for (const b of shape.bones) { const o = this.bones[b.name]; if (o) { o.position.fromArray(b.off); if (this.rest[b.name]) this.rest[b.name].copy(o.position); } }
    this.skeleton = new THREE.Skeleton(this.boneList, shape.inverses);
    this.geos = this.factory.geometry(shape, this.desc);
    this.mat = this.statue ? this.factory.bronze : this.factory.material(this.desc);
    if (!this.statue) this.mat.userData.u.uNeckY.value = shape.neckY ?? -10; // (where the MakeHuman head meets the sculpted neck)
    if (!this.statue) {
      const b = shape.brow, u = this.mat.userData.u, d = this.desc || {};
      if (b && d.fringe) u.uFringe.value.set(1, b[0] + d.fringe, b[1], b[2]); else u.uFringe.value.set(0, 0, 0, 0);
      if (b && d.hem) u.uHem.value.set(1, b[0] + d.hem[0], d.hem[1], d.hem[2]); else u.uHem.value.set(0, 0, 0, 0); // (below the brows, lower at the back, points)
    }
    const ident = new THREE.Matrix4();
    this.meshes = this.geos.map((g, i) => {
      const m = new THREE.SkinnedMesh(g, this.mat);
      m.bind(this.skeleton, ident);
      m.boundingSphere = shape.lods[i].bs.clone();
      m.castShadow = this._shadow && i === this.lod;
      m.receiveShadow = true;
      m.visible = i === this.lod;
      this.object.add(m);
      return m;
    });
    // claymation: a puppet's proportions — a bigger head, big bead eyes (their lids with them), fatter brows, big hands
    if (STYLE.plastilina && !this.statue) for (const [n, k] of PUPPET) if (this.bones[n]) this.bones[n].scale.setScalar(k);
    this.ready = true;
    if (this.rag || this.gu) this.cullSphere(true);
  }
  get mesh() { return (this.meshes && this.meshes[this.lod]) || this._dummy || (this._dummy = new THREE.Object3D()); }
  setDistance(d, shadows = true) {
    const lod = this.lod === 0 ? (d > 15 ? 1 : 0) : (d < 12 ? 0 : 1);
    const sh = shadows && d < 40;
    if (lod === this.lod && sh === this._shadow) return;
    this.lod = lod; this._shadow = sh;
    if (this.meshes) this.meshes.forEach((m, i) => { m.visible = i === lod; m.castShadow = sh && i === lod; });
  }
  setShadow(on) { this._shadow = on; if (this.meshes) this.meshes.forEach((m, i) => { m.castShadow = on && i === this.lod; }); }
  lookAt(worldPos) { this.lookTarget = worldPos ? (this.lookTarget || new THREE.Vector3()).copy(worldPos) : null; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.factory.live.delete(this);
    SM.remove(this.object);
    if (this.meshes) {
      for (const m of this.meshes) this.object.remove(m);
      this.factory.releaseGeometry(this.key, this.geos);
      if (!this.statue) this.factory.releaseMaterial(this.mat);
      this.meshes = null;
    }
  }
  // trigger a one-shot action: 'punch','punch2','kick','hit','wave','enter'
  // punches thrown one after another chain into a combination: jab, cross, left hook, uppercut
  play(name, dur = 0.5) {
    if (name === 'punch' || name === 'punch2') {
      this.combo = this.t - this.lastPunchT < 0.95 ? this.combo + 1 : 0;
      this.lastPunchT = this.t;
      name = COMBO[this.combo % COMBO.length];
    }
    this.action = name; this.actionT = 0; this.actionDur = dur;
  }
  setBase(name) { if (this.base !== name) this.base = name; }
  // knocked down: the body goes limp and falls (see ragdoll.js for o); dead: the eyes close. While it lasts the ragdoll
  // places the character (object position and turn): read it back with ragPos()
  ragdoll(o = {}) {
    this.base = null; this.baseW = 0; this.action = null; this.fid = null; this.gu = null;
    if (this._legs) for (const q of this._legs) { q.on = false; q.rt = 1; }
    this.rag = new Ragdoll(this, o);
    this.ragDead = !!o.dead;
    this.cullSphere(true);
    return this.rag;
  }
  // a body lying on the ground (or getting up) reaches further out from its origin than one standing: a bigger
  // bounding sphere so it is never culled while part of it is still on screen
  cullSphere(wide) {
    if (!this.meshes || !this.shape) return;
    this.meshes.forEach((m, i) => {
      if (wide) m.boundingSphere.set(_v.set(0, 0.45 * this.scale, 0), 1.75 * this.scale);
      else m.boundingSphere.copy(this.shape.lods[i].bs);
    });
  }
  ragPos(out) { return this.rag ? this.rag.pelvis(out) : out.copy(this.object.position); }
  get gettingUp() { return !!this.gu; }
  // straight back on the feet (a respawn, a scene change): no ragdoll, no getting up
  standUp() { if (this.rag) this.endRagdoll(); this.gu = null; this.ragDead = false; this.cullSphere(false); }
  // up off the ground after the ragdoll: from the back (sit up, feet in, onto them) or the front (push up, all fours,
  // a foot forward), blended out of wherever the ragdoll left the limbs. Returns where to stand the character while
  // it does it ({x, z, heading}: its object is put there too); gettingUp is true until it is standing again
  getUp() {
    const rag = this.rag;
    if (!rag) return null;
    const up = rag.faceUp(), [hx, hz] = rag.headDir(), pel = rag.pelvis(new THREE.Vector3()), fy = rag.floorY;
    const dx = up ? -hx : hx, dz = up ? -hz : hz, heading = Math.atan2(dx, dz), K = up ? GETUP_BACK : GETUP_FRONT, S = this.scale;
    const x = pel.x - K[0].P[2] * S * dx, z = pel.z - K[0].P[2] * S * dz;
    // the ragdoll's pose, turned into the new frame
    const from = new Map();
    for (const n of GU_BONES) from.set(n, this.bones[n].quaternion.clone());
    const turn = new THREE.Quaternion().setFromAxisAngle(_AY, rag.yaw - heading);
    from.get('hips').premultiply(turn);
    const c = Math.cos(-heading), sn = Math.sin(-heading), ox = pel.x - x, oz = pel.z - z;
    const fromP = new THREE.Vector3(ox * c + oz * sn, pel.y - fy, -ox * sn + oz * c);
    this.rag = null;
    this.gu = { t: 0, K, from, fromP, up };
    this.object.position.set(x, fy, z); this.object.rotation.set(0, heading, 0);
    return { x, z, heading };
  }
  // the key poses at the moment (Catmull-Rom through them), blended in from the ragdoll's pose over the first half
  // second and out into the ordinary standing pose (already on the bones) over the last third of a second
  getUpStep(dt) {
    const g = this.gu, K = g.K, B = this.bones, S = this.scale;
    g.t += dt;
    const dur = K[K.length - 1].t;
    if (g.t >= dur) { this.gu = null; this.cullSphere(false); return; }
    let i = 0;
    while (i < K.length - 2 && K[i + 1].t <= g.t) i++;
    const k0 = K[Math.max(0, i - 1)], k1 = K[i], k2 = K[i + 1], k3 = K[Math.min(K.length - 1, i + 2)];
    const s = clamp((g.t - k1.t) / (k2.t - k1.t), 0, 1), s2 = s * s, s3 = s2 * s;
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
    const v3 = (n, out) => out.set(cr(k0[n][0], k1[n][0], k2[n][0], k3[n][0]), cr(k0[n][1], k1[n][1], k2[n][1], k3[n][1]), cr(k0[n][2], k1[n][2], k2[n][2], k3[n][2]));
    const sc = (n) => cr(k0[n], k1[n], k2[n], k3[n]);
    const w0 = smoothstep(0, 0.45, g.t), w1 = 1 - smoothstep(dur - 0.35, dur, g.t);
    const T = this._gt || (this._gt = { e: new THREE.Euler(), v: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion(), qa: new THREE.Quaternion(), qu: new THREE.Quaternion(), ql: new THREE.Quaternion(), J: new THREE.Vector3(), tg: new THREE.Vector3(), pole: new THREE.Vector3() });
    const put = (n, q) => { const f = g.from.get(n); T.qa.copy(f || q); if (f) T.qa.slerp(q, w0); B[n].quaternion.slerp(T.qa, w1); };
    const eul = (n) => { v3(n, T.v); return T.q.setFromEuler(T.e.set(T.v.x, T.v.y, T.v.z)); };
    // hips
    v3('P', T.p).multiplyScalar(S);
    T.v.copy(g.fromP).lerp(T.p, w0); B.hips.position.lerp(T.v, w1);
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR']) put(n, eul(n));
    put('clavL', T.q.identity()); put('clavR', T.q.identity());
    // legs: the key angles, or reaching for the ground (feet planted, knees down) — solved against the hips as placed
    const Qh = B.hips.quaternion, Ph = B.hips.position;
    for (const sd of ['L', 'R']) {
      const ik = sc('ik' + sd);
      const qt = eul('thigh' + sd).clone(), qs = eul('shin' + sd).clone(), qf = eul('foot' + sd).clone();
      if (ik > 0.001) {
        T.J.copy(this.rest['thigh' + sd]).applyQuaternion(Qh).add(Ph);
        v3('f' + sd, T.tg).multiplyScalar(S); v3('k' + sd, T.pole).normalize();
        ik2(T.J, T.tg, T.pole, Qh, this.legL1, this.legL2, 1, T.qu, T.ql);
        // the foot at its pitch to the ground
        T.q.copy(Qh).multiply(T.qu).multiply(T.ql).invert().multiply(T.qa.setFromAxisAngle(_AX, sc('a' + sd)));
        qt.slerp(T.qu, ik); qs.slerp(T.ql, ik); qf.slerp(T.q, ik);
      }
      put('thigh' + sd, qt); put('shin' + sd, qs); put('foot' + sd, qf);
    }
  }
  endRagdoll() { this.rag = null; for (const b of this.boneList) b.quaternion.identity(); for (const n in this.rest) this.bones[n].position.copy(this.rest[n]); }
  // the rest of the body while the ragdoll has it: eyes shut (or half shut, dazed), the mouth fallen open, hands loose
  ragPose() {
    const B = this.bones, rag = this.rag;
    if (rag.sleeping && rag.posed) return; // lying still: nothing to redo
    rag.pose();
    if (rag.sleeping) rag.posed = true;
    const lid = this.ragDead ? 0.72 : 0.45 + 0.08 * Math.sin(this.t * 0.9);
    B.lidL.rotation.set(lid, 0, 0); B.lidR.rotation.set(lid, 0, 0);
    B.eyeL.rotation.set(0.12, 0, 0); B.eyeR.rotation.set(0.12, 0, 0); B.jaw.rotation.set(this.ragDead ? 0.14 : 0.07, 0, 0);
    for (const n of ['browL', 'browR', 'mouthL', 'mouthR']) { B[n].position.copy(this.rest[n]); B[n].rotation.set(0, 0, 0); }
    B.fingL.rotation.set(0, 0, -0.6); B.fing2L.rotation.set(0, 0, -0.75); B.fingR.rotation.set(0, 0, 0.6); B.fing2R.rotation.set(0, 0, 0.75);
    B.thumbL.rotation.set(0.03, -0.25, 0.02); B.thumb2L.rotation.set(0.15, 0, 0); B.thumbR.rotation.set(0.03, 0.25, -0.02); B.thumb2R.rotation.set(0.15, 0, 0);
    if (B.hair1) { B.hair1.rotation.set(0.25, 0, 0); B.hair2.rotation.set(0.12, 0, 0); }
    const u = this.mat && this.mat.userData.u;
    if (u && u.uBend) { const ang = (b) => 2 * Math.acos(clamp(Math.abs(b.quaternion.w), 0, 1)); u.uBend.value.set(clamp(ang(B.foreL) / 2.3, 0, 1), clamp(ang(B.foreR) / 2.3, 0, 1), clamp(ang(B.shinL) / 2, 0, 1), clamp(ang(B.shinR) / 2, 0, 1)); }
  }
  // a joint pose given anatomically (flex, then open out, turning on the bone's own axis first), blended in by w
  QP(name, fx, abd, tw, w) {
    const pool = this._qpool || (this._qpool = []);
    const q = pool[this._qn] || (pool[this._qn] = new THREE.Quaternion());
    q.copy(_qa.setFromAxisAngle(_AX, fx)).multiply(_qb.setFromAxisAngle(_AZ, abd)).multiply(_qc.setFromAxisAngle(_AY, tw));
    (this._qlist || (this._qlist = [])).push(name, q, w);
    this._qn++;
  }

  // opts: grounded, vy (vertical speed), turn (turn rate), crouch, fidget (idle fidgets allowed), lookYaw, talking,
  // moveDir (direction of travel relative to facing: 0 ahead, ±π/2 sideways, π backwards), forceFidget
  update(dt, speed, opts = {}) {
    this.t += dt;
    const B = this.bones;
    if (this.rag) { this.rag.step(dt); this.ragPose(); return; }
    // per-bone rotation and translation accumulators, allocated once (no garbage per frame)
    if (!this._r) {
      this._r = {}; this._p = {}; this._o = {}; this._pl = [];
      for (const n in B) { this._r[n] = new Float32Array(3); this._p[n] = new Float32Array(3); this._o[n] = new Float32Array(3); }
    }
    const r = this._r, po = this._o;
    for (const n in r) { const a = r[n]; a[0] = 0; a[1] = 0; a[2] = 0; const b = po[n]; b[0] = 0; b[1] = 0; b[2] = 0; }
    const R = (n, x = 0, y = 0, z = 0) => { const v = r[n]; if (!v) return; v[0] += x; v[1] += y; v[2] += z; };
    const O = (n, x = 0, y = 0, z = 0) => { const v = po[n]; if (!v) return; v[0] += x; v[1] += y; v[2] += z; };
    this._qn = 0; if (this._qlist) this._qlist.length = 0;
    const grounded = opts.grounded !== false;
    const old = !!this.desc.elderly;
    const G = this.gait, sc = this.scale;
    let faceWant = this.mood || null, faceW = 1;
    const wantFace = (name, w = 1) => { if (w > 0.05 && (!faceWant || w >= faceW || faceWant === this.mood)) { faceWant = name; faceW = w; } };
    // --- locomotion: walk → run → sprint by speed, crouched or not, forwards, sideways or backwards
    const v = Math.max(0, speed);
    this.blend.walk = lerp(this.blend.walk, smoothstep(0.06, 0.9, v), 1 - Math.exp(-10 * dt));
    this.blend.run = lerp(this.blend.run, smoothstep(2.3, 3.3, v), 1 - Math.exp(-8 * dt));
    this.blend.sprint = lerp(this.blend.sprint || 0, smoothstep(4.7, 6.2, v), 1 - Math.exp(-6 * dt));
    const wb = this.blend.walk, rb = this.blend.run, sb = this.blend.sprint;
    this.crouchK = lerp(this.crouchK || 0, opts.crouch ? 1 : 0, 1 - Math.exp(-9 * dt));
    const ck = this.crouchK;
    this.moveDir = opts.moveDir ?? 0;
    const fwdC = Math.cos(this.moveDir), sideC = Math.sin(this.moveDir), back = fwdC < -0.3;
    // strides per second: slower for tall people and long striders, faster running; crouched steps are shorter and slow
    // (side-stepping takes shorter, quicker steps: a leg reaches much less far out to the side than ahead)
    const cad = lerp(0.52 + 0.28 * Math.min(v, 2.6), 1.12 + 0.07 * v, rb) / (Math.sqrt(sc) * G.stride) * (1 - 0.2 * ck) * (1 + 0.5 * Math.abs(sideC) * (1 - rb));
    if (grounded) this.phase += cad * dt * TAU;
    const cyc = this.phase / TAU;
    // smoothed acceleration: lean into a start, sit back into a stop
    const acc = dt > 1e-4 ? (speed - (this.prevSpeed ?? speed)) / dt : 0;
    this.prevSpeed = speed;
    this.accS = lerp(this.accS, clamp(acc, -14, 14), 1 - Math.exp(-7 * dt));
    let hipsY = 0, hipsX = 0, hipsZ = 0;
    this.fidYaw = 0; this.fidX = 0;
    // --- standing: breathing, weight on one leg then the other, relaxed arms and hands, the person's posture
    const br = Math.sin(this.t * 1.7 + this.seed) * 0.5 + 0.5;
    const idle = 1 - wb;
    R('chest', -0.012 + br * 0.025 * idle); R('spine', -br * 0.006 * idle);
    R('clavL', 0, 0, br * 0.018 * idle); R('clavR', 0, 0, -br * 0.018 * idle);
    R('armL', -0.07 * idle + 0.02, 0.06, 0.08 + 0.012 * br); R('armR', -0.07 * idle + 0.02, -0.06, -0.08 - 0.012 * br);
    R('foreL', -0.2 - 0.13 * idle, 0.25 + 0.12 * idle); R('foreR', -0.2 - 0.13 * idle, -0.25 - 0.12 * idle);
    R('handL', 0.1 + 0.06 * idle, 0.05 * idle, 0.1); R('handR', 0.1 + 0.06 * idle, -0.05 * idle, -0.1);
    R('neck', 0.035 * idle); R('head', -0.02 * idle);
    // contrapposto: most of the weight on one leg, the other knee soft, the pelvis dropping on the free side
    this.stanceT = (this.stanceT ?? Math.random() * 20) + dt * (0.6 + 0.2 * Math.sin(this.seed));
    const shift = Math.sin(this.stanceT * 0.33 + this.seed) * (0.7 + 0.3 * Math.sin(this.stanceT * 0.11));
    const sL = Math.max(0, shift), sR = Math.max(0, -shift); // weight on the left leg / on the right leg
    const cp = (0.6 + 0.8 * (G.contra ?? 0.5)) * idle * (1 - ck);
    R('hips', 0, shift * 0.05 * cp, -shift * 0.045 * cp);
    hipsX += shift * 0.018 * cp * sc;
    hipsY -= Math.abs(shift) * 0.006 * cp * sc;
    R('shinR', sL * 0.16 * cp); R('thighR', -sL * 0.07 * cp, 0, sL * 0.03 * cp); R('footR', -sL * 0.05 * cp, 0, 0);
    R('shinL', sR * 0.16 * cp); R('thighL', -sR * 0.07 * cp, 0, -sR * 0.03 * cp); R('footL', -sR * 0.05 * cp, 0, 0);
    R('spine', 0, -shift * 0.03 * cp, shift * 0.035 * cp); R('chest', 0, 0, shift * 0.02 * cp); R('head', 0, 0, -shift * 0.03 * cp);
    R('spine', G.slouch); R('neck', -G.slouch * 0.5);
    if (G.wide) { R('thighL', 0, 0, G.wide * idle); R('thighR', 0, 0, -G.wide * idle); R('footL', 0, 0, -G.wide * idle); R('footR', 0, 0, G.wide * idle); }
    // feet turned out a little
    R('thighL', 0, 0.06 * idle, 0); R('thighR', 0, -0.06 * idle, 0);
    // --- idle fidgets (arms folded, hands on hips, a look round, a stretch...) once they have stood still a while
    const canFid = grounded && !this.base && !this.action && !this.gu && wb < 0.06 && !this.lookTarget && opts.fidget !== false && !this.statue;
    this.idleT = canFid ? this.idleT + dt : 0;
    if (opts.forceFidget && (!this.fid || this.fid.name !== opts.forceFidget)) this.fid = { name: opts.forceFidget, t: 0.6, dur: 1e9, cut: 1 };
    if (!this.fid && canFid && this.idleT > this.nextFid) {
      const list = G.fidgets, name = list[Math.floor(Math.random() * list.length)], F = FIDGETS[name];
      this.fid = { name, t: 0, dur: F.dur[0] + Math.random() * (F.dur[1] - F.dur[0]), cut: 1 };
      this.idleT = 0; this.nextFid = 5 + Math.random() * 9;
    }
    if (this.fid) {
      const f = this.fid;
      f.t += dt;
      if (!canFid && !opts.forceFidget) f.cut -= dt * 4; // interrupted: let go quickly
      const e = smoothstep(0, 0.5, f.t) * (1 - smoothstep(f.dur - 0.5, f.dur, f.t)) * clamp(f.cut, 0, 1);
      if (f.t >= f.dur || f.cut <= 0) this.fid = null;
      else { FIDGETS[f.name].pose(R, e, f.t, this); if (FIDGETS[f.name].face) wantFace(FIDGETS[f.name].face, e); }
    }
    hipsX += this.fidX;
    // --- head and eyes: a glance at something now and then (the eyes get there first, the chest helps on big turns)
    this.lookClock -= dt;
    if (this.lookClock <= 0) {
      this.lookClock = 1.4 + Math.random() * 3.6;
      const far = Math.random() < 0.3;
      this.lookGoal[0] = (Math.random() - 0.5) * (far ? 1.4 : 0.55); this.lookGoal[1] = (Math.random() - 0.35) * 0.16;
    }
    // looking at someone (lookAt): the head turns to them smoothly and keeps on them (the eyes lead, below)
    if (this.lookTarget) {
      const o = this.object;
      _v.copy(this.lookTarget).sub(o.position);
      _v.y -= 1.62 * this.scale;
      _q.copy(o.quaternion).invert();
      _v.applyQuaternion(_q);
      this.lookGoal[0] = clamp(Math.atan2(_v.x, _v.z), -1.6, 1.6) * 0.8;
      this.lookGoal[1] = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.5, 0.5) * 0.6;
      this.lookClock = Math.max(this.lookClock, 0.8 + Math.random()); // (no idle glances meanwhile)
    }
    const lk = 1 - Math.exp(-dt * (this.lookTarget ? 5 : 3)), lt = this.lookTarget ? 1 : 0;
    this.lookCur[0] += (this.lookGoal[0] - this.lookCur[0]) * lk; this.lookCur[1] += (this.lookGoal[1] - this.lookCur[1]) * lk;
    let headYaw = opts.lookYaw ?? this.lookCur[0] * (1 - wb * 0.75 * (1 - lt)) + this.fidYaw, headPitch = this.lookCur[1] * (1 - wb * (1 - lt));
    const over = Math.sign(headYaw) * Math.max(0, Math.abs(headYaw) - 0.7); // past what the neck turns: the chest follows
    R('head', -headPitch * 0.7, (headYaw - over) * 0.72, 0); R('neck', -headPitch * 0.3, (headYaw - over) * 0.28, 0);
    R('chest', 0, over * 0.6, 0); R('spine', 0, over * 0.4, 0);
    const lookT = this.lookCur[0]; // where they happen to be looking (seated / talking poses)
    if (old) { R('spine', 0.12); R('neck', 0.1); R('chest', 0.05); R('clavL', 0, -0.06, 0); R('clavR', 0, 0.06, 0); }
    // --- the stride: gait-lab joint curves for each leg, blended walk → run → sprint; arms swinging against the legs
    if (wb > 0.001 && grounded) {
      const gb = gaitBody(rb, sb);
      const WK = GAIT.walk, RN = GAIT.run, SP = GAIT.sprint;
      const amp = Math.pow(smoothstep(0.02, 1.15, v), 0.75) * wb; // short, shuffling steps when slow
      const sag = 0.35 + 0.65 * Math.abs(fwdC); // sideways: the legs mostly step out and in
      const k = amp * sag * (old ? 0.8 : 1);
      // phase warping: a foot can only stay on the ground while the leg reaches it, so the faster the run the less of
      // the stride it spends there (as runners do). The joint curves' stance is sped up to fit and the swing slowed
      const tc = lerp(lerp(0.62, 0.38, rb), 0.33, sb), L1 = this.legL1, L2 = this.legL2, kh = k * (1 - 0.3 * ck), kk = 1 - 0.25 * ck;
      const zAt = (ph) => {
        const fk = (key) => lerp(lerp(samp(WK[key], ph), samp(RN[key], ph), rb), samp(SP[key], ph), sb);
        const at = gb.tilt * wb - fk('hip') * kh, as = at + (0.05 + (fk('knee') - 0.05) * k) * kk;
        return -L1 * Math.sin(at) - L2 * Math.sin(as);
      };
      // how far the foot on the ground can travel under the body: ahead, the ankle's sweep and the roll off the foot;
      // out to the side, a good deal less
      const reachF = zAt(0) - zAt(tc) + 0.2 * sc * Math.min(1, k), reachS = 0.4 * sc;
      const reach = reachF > 0.05 ? 1 / Math.hypot(fwdC / reachF, sideC / reachS) : 0;
      const trT = v > 0.2 && reach > 0.05 ? clamp(((reach * cad) / v) * (this.trK ?? 1), 0.22, tc) : tc;
      this.tr = lerp(this.tr ?? trT, trT, 1 - Math.exp(-6 * dt));
      const tr = Math.min(this.tr, tc);
      const warp = (p) => { p -= Math.floor(p); return p < tr ? (p * tc) / tr : tc + ((p - tr) * (1 - tc)) / (1 - tr); };
      for (const [sd, off] of [['R', 0], ['L', 0.5]]) {
        const lp = back ? 1 - (cyc + off) : cyc + off, lw = warp(lp);
        const f = (key) => { const a = samp(WK[key], lw), b = samp(RN[key], lw), c = samp(SP[key], lw); return lerp(lerp(a, b, rb), c, sb); };
        const hip = f('hip'), knee = f('knee'), ank = f('ankle'), toe = f('toe');
        R('thigh' + sd, -hip * k * (1 - 0.3 * ck));
        R('shin' + sd, (0.05 + (knee - 0.05) * k) * (1 - 0.25 * ck));
        R('foot' + sd, -ank * k * (1 - 0.3 * ck));
        R('toe' + sd, -toe * k);
        // sideways: the swinging leg reaches out the way you are going (both legs turn the same way)
        if (Math.abs(sideC) > 0.05) {
          const ph = lw, sw = ph > tc ? Math.sin(((ph - tc) / (1 - tc)) * Math.PI) : 0, as = Math.abs(sideC);
          R('thigh' + sd, -0.32 * sw * as * amp, 0, sideC * 0.1 * sw * amp); // (the foot lifts clear as it steps across)
          R('shin' + sd, 0.7 * sw * as * amp);
          R('foot' + sd, -0.2 * sw * as * amp, 0, -sideC * 0.12 * sw * amp);
        }
        // the same-side arm is back when this heel strikes; the elbow bends more as the arm comes through
        const sg = sd === 'L' ? 1 : -1;
        const flex = -gb.arm * Math.cos(TAU * (lp - 0.04)) * amp * G.arms * (old ? 0.55 : 1) * (0.4 + 0.6 * Math.abs(fwdC)) * (1 - 0.7 * ck);
        const fk = flex / gb.arm;
        R('arm' + sd, -flex, 0, sg * (gb.abd + 0.015) * wb);
        R('fore' + sd, -(gb.elb0 + gb.elbA * Math.max(0, fk) - 0.35 * gb.elbA * Math.max(0, -fk)) * wb + 0.2 * wb * (1 - rb));
        R('clav' + sd, 0, -sg * 0.06 * fk * amp, sg * 0.025 * Math.abs(fk) * amp);
        R('hand' + sd, (0.1 * fk - 0.05) * amp, 0, 0); // the wrist trails the forearm
      }
      // where each foot is in its stride (0 heel strike … toe-off … swing), for the foot locking below
      this.toeOff = tr; this.legPh = back ? 1 - cyc : cyc; this.cad = cad;
      // pelvis turn and list (the swing side drops); the thighs undo the turn so the knees keep pointing ahead
      const ang = TAU * (back ? 1 - cyc : cyc);
      const hipsK = 0.75 + 0.35 * G.hips;
      const pr = gb.pelRot * amp * hipsK * (0.5 + 0.5 * Math.abs(fwdC)), pc = Math.cos(ang), ps = Math.sin(ang);
      const roll = -gb.pelRoll * G.hips * amp * ps * (1 - 0.5 * ck);
      R('hips', gb.tilt * wb, pr * pc, roll);
      R('thighL', 0, -pr * pc * 0.7, -roll); R('thighR', 0, -pr * pc * 0.7, -roll);
      // trunk against the pelvis (more in a swagger), lean with speed; the head stays steady and looks ahead
      const sw = 0.8 + 0.4 * G.swagger;
      R('spine', (gb.lean + G.slouch * 0.5) * wb, -pr * pc * 0.5, -roll * 0.55);
      R('chest', 0, -pr * pc * 0.9 * sw, -roll * 0.2 + 0.03 * pc * wb * G.swagger);
      R('neck', -gb.lean * 0.35 * wb, pr * pc * 0.25 * sw, 0);
      R('head', -gb.lean * 0.3 * wb, pr * pc * 0.15 * sw, -roll * 0.35);
      // the body rises over the stance leg and falls at each footfall; it sways over the foot that carries it
      hipsY += (-gb.bob * Math.cos(2 * TAU * ((back ? -cyc : cyc) - gb.bobPh)) * G.bounce * amp - gb.low * wb) * sc;
      hipsX += -gb.lat * G.sway * amp * ps * sc;
      if (Math.abs(sideC) > 0.05) hipsX += sideC * 0.012 * amp * Math.sin(2 * ang) * sc;
    }
    // crouched (sneaking): knees bent, hips low, torso forward, hands up ready in front
    if (ck > 0.01) {
      hipsY -= 0.26 * ck * sc;
      R('thighL', -0.95 * ck); R('thighR', -0.95 * ck); R('shinL', 1.55 * ck); R('shinR', 1.55 * ck); R('footL', -0.58 * ck); R('footR', -0.58 * ck);
      R('spine', 0.4 * ck); R('chest', 0.1 * ck); R('neck', -0.2 * ck); R('head', -0.28 * ck);
      R('clavL', 0, -0.08 * ck, 0); R('clavR', 0, 0.08 * ck, 0);
      R('armL', -0.45 * ck, 0, -0.08 * ck); R('armR', -0.45 * ck, 0, 0.08 * ck); R('foreL', -0.8 * ck); R('foreR', -0.8 * ck);
      wantFace('effort', ck * 0.35);
    }
    // the legs follow the sideways weight shift so the feet stay planted
    R('thighL', 0, 0, -hipsX / (0.87 * sc)); R('thighR', 0, 0, -hipsX / (0.87 * sc));
    // leaning: into turns, forward when setting off, back when pulling up
    this.lean = lerp(this.lean, clamp(opts.turn || 0, -1, 1) * 0.12 * wb, 1 - Math.exp(-6 * dt));
    R('hips', 0, 0, -this.lean); R('head', 0, 0, this.lean * 0.4);
    const fl = grounded && !this.base ? clamp(this.accS * 0.011, -0.1, 0.13) : 0;
    R('spine', fl); R('head', -fl * 0.45);
    // turning on the spot: small steps, one foot then the other
    const turning = grounded && wb < 0.35 && Math.abs(opts.turn || 0) > 0.3 && !this.base;
    this.turnK = clamp(this.turnK + (turning ? dt * 7 : -dt * 4), 0, 1);
    if (this.turnK > 0.01) {
      this.turnPh += dt * 10;
      const k = this.turnK * (1 - wb), s1 = Math.max(0, Math.sin(this.turnPh)), s2 = Math.max(0, -Math.sin(this.turnPh));
      const dir = Math.sign(opts.turn || 0);
      R('thighL', -0.22 * s1 * k, 0.15 * dir * s1 * k); R('shinL', 0.45 * s1 * k); R('footL', -0.2 * s1 * k); R('toeL', -0.1 * s2 * k);
      R('thighR', -0.22 * s2 * k, 0.15 * dir * s2 * k); R('shinR', 0.45 * s2 * k); R('footR', -0.2 * s2 * k); R('toeR', -0.1 * s1 * k);
      R('chest', 0, dir * 0.08 * k); R('head', 0, dir * 0.12 * k);
      hipsY -= 0.01 * (s1 + s2) * k * sc;
    }
    // --- in the air: pushing off (legs straight, toes pointed, arms swinging up), tucked, then reaching for the ground
    if (!grounded) {
      this.airT += dt; this.airVy = opts.vy || 0;
      const up = clamp((opts.vy || 0) * 0.2, -1, 1);
      const push = 1 - smoothstep(0, 0.15, this.airT);
      const tuck = smoothstep(0.06, 0.3, this.airT) * (0.55 + 0.45 * Math.max(0, up));
      const reach = Math.max(0, -up) * smoothstep(0.2, 0.55, this.airT);
      const runJ = Math.max(rb, wb * 0.5); // a running jump: one leg leads
      R('thighL', -0.15 * push - (0.8 + 0.3 * runJ) * tuck + 0.35 * reach); R('shinL', 0.05 * push + 1.15 * tuck - 0.55 * reach); R('footL', 0.5 * push + 0.1 * tuck - 0.15 * reach);
      R('thighR', -0.05 * push - (0.5 - 0.3 * runJ) * tuck + 0.25 * reach); R('shinR', 0.05 * push + (0.8 + 0.3 * runJ) * tuck - 0.4 * reach); R('footR', 0.55 * push + 0.2 * tuck);
      R('toeL', 0.35 * push); R('toeR', 0.35 * push);
      R('armL', -1.0 * push - 0.5 * tuck, 0, 0.2 + 0.35 * reach); R('armR', -0.8 * push - 0.3 * tuck, 0, -0.2 - 0.35 * reach);
      R('clavL', 0, 0, 0.12 * push); R('clavR', 0, 0, -0.12 * push);
      R('foreL', -0.55); R('foreR', -0.55);
      R('spine', 0.12 * tuck - 0.06 * push); R('head', -0.12 * push + 0.08 * reach);
      wantFace('effort', 0.5 * push + 0.3 * tuck);
    } else {
      if (this.airT > 0.12) { this.landK = clamp(-this.airVy * 0.14, 0.2, 1); this.landT = 0; }
      this.airT = 0;
    }
    if (this.landK > 0) {
      // landing: knees and hips soak it up and spring back
      this.landT += dt;
      const u = this.landT / 0.08, e = this.landK * u * Math.exp(1 - u);
      if (this.landT > 0.7) this.landK = 0;
      hipsY -= 0.09 * e * sc;
      R('thighL', -0.48 * e); R('thighR', -0.48 * e); R('shinL', 0.95 * e); R('shinR', 0.95 * e); R('footL', -0.45 * e); R('footR', -0.45 * e);
      R('spine', 0.2 * e); R('head', -0.1 * e);
      R('armL', -0.35 * e, 0, 0.25 * e); R('armR', -0.35 * e, 0, -0.25 * e); R('foreL', -0.3 * e); R('foreR', -0.3 * e);
      wantFace('effort', e * 0.6);
    }
    // --- persistent base poses
    this.baseW = lerp(this.baseW, this.base ? 1 : 0, 1 - Math.exp(-(this.base === 'lie' ? 14 : 8) * dt));
    let fist = 0, talk = 0, grip = 0, open = 0;
    this._open = 0; this._face = null; // set by talking gestures
    if (this.baseW > 0.001 && this.base) {
      const w = this.baseW;
      const P = this._p, pl = this._pl;
      pl.length = 0;
      const Q = (n, x = 0, y = 0, z = 0) => { const a = P[n]; if (!a) return; a[0] = x; a[1] = y; a[2] = z; if (!pl.includes(n)) pl.push(n); };
      let hy = 0;
      const bs = this.base;
      if (bs === 'sit' || bs === 'drive' || bs === 'sitTalk' || bs === 'sitFan') {
        // seated: thighs level, shins down, the back a little rounded; some cross their legs at the ankles
        const cross = bs !== 'drive' && (this.seed % 3) < 1;
        Q('thighL', -1.5, cross ? -0.05 : 0.02, cross ? -0.06 : 0.07); Q('thighR', -1.5, cross ? 0.08 : -0.02, cross ? 0.02 : -0.07);
        Q('shinL', cross ? 1.2 : 1.45); Q('shinR', cross ? 1.3 : 1.45); Q('footL', cross ? 0.25 : 0.1); Q('footR', cross ? 0.3 : 0.1);
        Q('spine', 0.06); Q('chest', 0.04);
        hy = -0.46 * sc;
        if (bs === 'drive') {
          // hands on the wheel at ten to two, turning it with the steering; checking the mirrors now and then
          const st = clamp(this.steer || 0, -1, 1);
          Q('armL', -1.0 + st * 0.12, 0.1, 0.22 - st * 0.1); Q('armR', -1.0 - st * 0.12, -0.1, -0.22 - st * 0.1);
          Q('foreL', -0.62 + st * 0.2, 0.3); Q('foreR', -0.62 - st * 0.2, -0.3);
          Q('handL', 0.1, 0.5, 0.1); Q('handR', 0.1, -0.5, -0.1);
          Q('spine', 0.02); Q('head', 0.02, lookT * 0.4 + st * 0.15, 0);
          grip = 1;
        } else if (bs === 'sitTalk') {
          // chatting on a chair: hands on the lap or gesturing while speaking; the head follows lookTarget
          const g = this.gestureStep(dt, !!this.speaking);
          Q('armL', -0.42, 0.1, 0.12); Q('foreL', -0.95, 0.3); Q('armR', -0.45, -0.1, -0.12); Q('foreR', -0.95, -0.3);
          Q('handL', 0.2, 0, 0.1); Q('handR', 0.2, 0, -0.1);
          if (g) this.gesturePose(g, Q, P, 0.75);
          Q('thighL', -1.5, 0, 0.1); Q('thighR', -1.5, 0, -0.02);
          talk = this.speaking ? 1 : 0;
        } else if (bs === 'sitFan') {
          // fanning herself (abanico) in the evening heat
          Q('armL', -0.4, 0, 0.12); Q('foreL', -0.95);
          Q('armR', -1.05, 0.35, -0.55); Q('foreR', -1.85 + Math.sin(this.t * 10 + this.seed) * 0.28);
          Q('handR', 0, 0, Math.sin(this.t * 10 + this.seed) * 0.35);
          Q('spine', -0.02);
          talk = this.speaking ? 1 : 0;
        } else {
          Q('armL', -0.38, 0.1, 0.1); Q('armR', -0.38, -0.1, -0.1); Q('foreL', -0.85, 0.35); Q('foreR', -0.85, -0.35);
          Q('handL', 0.25, 0, 0.1); Q('handR', 0.25, 0, -0.1);
          Q('spine', 0.02); Q('head', 0.05, lookT * 0.6, 0);
        }
      } else if (bs === 'moto' || bs === 'bici') {
        // on two wheels: hands on the bars; the motorbike's pegs, or pedalling
        if (bs === 'moto') {
          Q('thighL', -1.25, 0, 0.18); Q('thighR', -1.25, 0, -0.18); Q('shinL', 1.25); Q('shinR', 1.25); Q('footL', 0.15); Q('footR', 0.15);
          Q('spine', 0.28); hy = -0.46 * sc;
        } else {
          const ph = this.pedal || 0;
          const a = Math.sin(ph), b = Math.cos(ph);
          Q('thighL', -0.95 - a * 0.42, 0, 0.06); Q('shinL', 0.9 + b * 0.45); Q('footL', -0.1 + a * 0.2);
          Q('thighR', -0.95 + a * 0.42, 0, -0.06); Q('shinR', 0.9 - b * 0.45); Q('footR', -0.1 - a * 0.2);
          Q('spine', 0.38); Q('hips', 0, 0, a * 0.04); hy = -0.3 * sc;
        }
        Q('armL', -1.2, 0, 0.18); Q('armR', -1.2, 0, -0.18); Q('foreL', -0.35); Q('foreR', -0.35); Q('head', -0.25);
        Q('clavL', 0, -0.1, 0); Q('clavR', 0, 0.1, 0);
        grip = 1;
      } else if (bs === 'swim') {
        // in the water up to the shoulders: a front crawl when moving — each arm over in turn, the head turning to that
        // side for air, a flutter kick — and treading water when still: upright, the hands sculling, the legs turning
        const v = clamp(this.swimSpeed || 0, 0, 2), mv = smoothstep(0.12, 0.8, v), tr = 1 - mv;
        this.swimPh = (this.swimPh || 0) + dt * (1.6 + 2.2 * v);
        const ph = this.swimPh, a = Math.sin(ph), b = Math.cos(ph), k = Math.sin(ph * 3), sc2 = Math.sin(this.t * 3.4 + this.seed), cc2 = Math.cos(this.t * 3.4 + this.seed);
        Q('hips', 0.95 * mv, 0, 0.06 * a * mv); Q('spine', 0.08 * mv + 0.04 * tr); Q('chest', 0.04 * mv);
        Q('neck', -0.35 * mv); Q('head', -0.55 * mv + 0.06 * tr, 0.55 * mv * Math.max(0, -b) * Math.sign(a || 1), 0);
        // crawl: one arm reaching forward over the water while the other pulls under it
        const reachL = a, reachR = -a;
        Q('armL', mv * (-1.6 - 1.3 * reachL) + tr * -0.25, 0, mv * (0.25 + 0.25 * Math.max(0, b)) + tr * (0.9 + 0.25 * sc2));
        Q('armR', mv * (-1.6 - 1.3 * reachR) + tr * -0.25, 0, -(mv * (0.25 + 0.25 * Math.max(0, -b)) + tr * (0.9 - 0.25 * sc2)));
        Q('foreL', mv * -0.35 * Math.max(0, -reachL) + tr * -0.35, tr * 0.6 * cc2); Q('foreR', mv * -0.35 * Math.max(0, -reachR) + tr * -0.35, -tr * 0.6 * cc2);
        Q('handL', tr * 0.2 * sc2); Q('handR', -tr * 0.2 * sc2);
        // legs: a flutter kick, or slow circles treading water
        Q('thighL', mv * (0.12 + 0.28 * k) + tr * (-0.55 + 0.25 * sc2), 0, 0.08 * tr); Q('thighR', mv * (0.12 - 0.28 * k) + tr * (-0.55 - 0.25 * sc2), 0, -0.08 * tr);
        Q('shinL', mv * (0.25 + 0.2 * Math.max(0, k)) + tr * (1.0 + 0.3 * cc2)); Q('shinR', mv * (0.25 + 0.2 * Math.max(0, -k)) + tr * (1.0 - 0.3 * cc2));
        Q('footL', 0.7 * mv + 0.3 * tr); Q('footR', 0.7 * mv + 0.3 * tr);
        hy = 0;
      } else if (bs === 'lie') {
        // flat out, limbs where they fell (each body a little different)
        const s = this.seed;
        Q('armL', 0.2 + Math.sin(s) * 0.4, 0, 1.1 + Math.sin(s * 1.7) * 0.4); Q('armR', 0.1 + Math.cos(s) * 0.4, 0, -1.3 + Math.cos(s * 1.3) * 0.4);
        Q('foreL', -0.3 - Math.abs(Math.sin(s * 2.1)) * 0.8); Q('foreR', -0.5 - Math.abs(Math.cos(s * 1.9)) * 0.7);
        Q('thighL', -0.2 + Math.sin(s * 0.7) * 0.25, 0, 0.12); Q('thighR', 0.05, 0, -0.1 - Math.abs(Math.sin(s)) * 0.12);
        Q('shinL', 0.4 + Math.abs(Math.sin(s * 3)) * 0.4); Q('shinR', 0.15); Q('head', -0.2, 0.5 * Math.sign(Math.sin(s * 5)), 0);
        Q('footL', 0.5); Q('footR', 0.4);
      } else if (bs === 'handsup') {
        // hands up, palms out, shoulders hunched, looking a bit down: scared
        Q('clavL', 0, 0, 0.18); Q('clavR', 0, 0, -0.18);
        Q('armL', -0.5, 0.2, 1.9); Q('armR', -0.5, -0.2, -1.9); Q('foreL', -1.55, -0.2); Q('foreR', -1.55, 0.2);
        Q('handL', -0.35); Q('handR', -0.35);
        Q('head', 0.12, 0, 0); Q('spine', 0.05);
        open = 1; wantFace('scared', 1);
      } else if (bs === 'fish') {
        // a fishing rod held out over the water in both hands; the left one winds the reel while reeling in
        const rl = this.reeling ? Math.sin(this.t * 15) : 0;
        Q('armR', -0.95, -0.1, -0.2); Q('foreR', -0.55, -0.2); Q('handR', 0.1, -0.2, 0);
        Q('armL', -0.8, 0.25, 0.3 + rl * 0.06); Q('foreL', -1.2 + rl * 0.3, 0.45); Q('handL', 0.1, 0, rl * 0.5);
        Q('spine', 0.04); Q('head', 0.14, 0, 0);
        grip = 1;
      } else if (bs === 'talk') {
        // standing and talking: one gesture after another, head nods on the stressed words
        const g = this.gestureStep(dt, true);
        Q('armL', -0.12, 0.05, 0.1); Q('foreL', -0.85, 0.3); Q('armR', -0.12, -0.05, -0.1); Q('foreR', -0.85, -0.3);
        Q('handL', 0.2); Q('handR', 0.2);
        if (g) this.gesturePose(g, Q, P, 1);
        Q('head', Math.sin(this.t * 2.3) * 0.05 + Math.max(0, Math.sin(this.t * 5.1 + this.seed)) * 0.05, lookT * 0.3, Math.sin(this.t * 0.9) * 0.04);
        talk = 1;
      } else if (bs === 'phone') {
        // phone at the ear, the other hand on the hip or gesturing; weight on one leg
        Q('armR', -0.3, 0.45, -0.45); Q('foreR', -2.45, -0.5); Q('handR', -0.1, 0.6, -0.25);
        const g2 = Math.sin(this.t * 0.7 + this.seed);
        if (g2 > 0) { this.QP('armL', 0.02, 0.62, -1.25, w); Q('foreL', -1.65); }
        else { Q('armL', -0.3, 0.05, 0.12); Q('foreL', -1.1 + Math.sin(this.t * 3.1) * 0.25, 0.3); }
        Q('head', 0.05, 0, -0.18); Q('neck', 0, 0, -0.06);
        talk = 0.6;
      } else if (bs === 'dance') {
        // swaying on the beat: hips, shoulders, arms up, stepping side to side
        const b = Math.sin(this.t * 7), b2 = Math.sin(this.t * 3.5 + this.seed);
        hy = -Math.abs(b) * 0.05;
        Q('armL', -2.0 + b * 0.4, 0, 0.5 + b2 * 0.3); Q('armR', -2.0 - b * 0.4, 0, -0.5 + b2 * 0.3); Q('foreL', -0.9 + b * 0.3); Q('foreR', -0.9 - b * 0.3);
        Q('hips', 0, b2 * 0.3, b * 0.08); Q('chest', 0, -b2 * 0.25, -b * 0.06); Q('head', 0.05, b2 * 0.2, b * 0.08);
        Q('thighL', -0.25 * Math.max(0, b)); Q('shinL', 0.45 * Math.max(0, b)); Q('thighR', -0.25 * Math.max(0, -b)); Q('shinR', 0.45 * Math.max(0, -b));
        wantFace('grin', 0.8);
      } else if (bs === 'aim') {
        // two hands on a pistol at arm's length, knees soft, leaning into it
        Q('armR', -1.5, -0.1, 0.12); Q('foreR', -0.1); Q('armL', -1.4, 0.2, -0.3); Q('foreL', -0.35, 0.4); Q('chest', 0.05, 0.12, 0);
        Q('clavL', 0, -0.12, 0); Q('clavR', 0, 0.1, 0); Q('handL', 0, 0.4, 0);
        Q('thighL', -0.15); Q('shinL', 0.2); Q('thighR', 0.05); Q('shinR', 0.15); Q('spine', 0.08);
        grip = 1; wantFace('angry', 0.6);
      } else if (bs === 'flee') {
        // running away: arms up round the head, hunched
        Q('armL', -2.2, 0, 0.6); Q('armR', -2.2, 0, -0.6); Q('foreL', -1.6); Q('foreR', -1.6);
        Q('clavL', 0, 0, 0.15); Q('clavR', 0, 0, -0.15); Q('spine', 0.25);
        open = 0.6; wantFace('scared', 1);
      } else if (bs === 'zombie') {
        // arms reaching forward, head lolling, hunched
        const sw = Math.sin(this.t * 1.3 + this.seed);
        Q('armL', -1.45 + sw * 0.12, 0, 0.14); Q('armR', -1.3 - sw * 0.12, 0, -0.1); Q('foreL', -0.2); Q('foreR', -0.35);
        Q('spine', 0.2); Q('neck', 0.25); Q('head', 0.3 + sw * 0.05, Math.sin(this.t * 0.7 + this.seed) * 0.35, 0.35);
        Q('clavL', 0, -0.15, 0.08); Q('clavR', 0, 0.15, -0.08);
        fist = 0.2; wantFace('pain', 0.5);
      } else if (bs === 'ghost') {
        // la aparición: arms hanging straight, head bowed and tilted
        Q('armL', 0.04, 0, 0.03); Q('armR', 0.04, 0, -0.03); Q('foreL', -0.02); Q('foreR', -0.02);
        Q('neck', 0.25); Q('head', 0.5, 0, 0.3); Q('spine', -0.02);
        Q('thighL', 0, 0, 0.02); Q('thighR', 0, 0, -0.02);
        wantFace('sad', 1);
      }
      const full = bs === 'sit' || bs === 'drive' || bs === 'lie' || bs === 'sitTalk' || bs === 'sitFan' || bs === 'moto' || bs === 'bici' || bs === 'swim';
      for (let pi = 0; pi < pl.length; pi++) {
        const n = pl[pi];
        const cur = r[n];
        const t = P[n];
        for (let i = 0; i < 3; i++) cur[i] = full ? lerp(cur[i], t[i], w) : lerp(cur[i], cur[i] * 0.3 + t[i], w);
      }
      hipsY = lerp(hipsY, hy, w);
      fist *= w; talk *= w; grip *= w; open = Math.max(open, this._open * 0.8) * w;
      if (this._face) wantFace(this._face, 0.8 * w);
    }
    // --- one-shot actions (see ACTION_POSES): combinations of punches, kicks, a bat swing, blows taken, gestures
    if (this.action) {
      this.actionT += dt;
      const u = this.actionT / this.actionDur;
      if (u >= 1) this.action = null;
      else {
        const res = ACTION_POSES[this.action] ? ACTION_POSES[this.action](R, O, u, this) : null;
        if (res) {
          if (res.fist) fist = Math.max(fist, res.fist);
          if (res.open) open = Math.max(open, res.open);
          if (res.face) wantFace(res.face, res.fw ?? 1);
          if (res.hx) hipsX += res.hx * sc; if (res.hy) hipsY += res.hy * sc; if (res.hz) hipsZ += res.hz * sc;
        }
      }
    }
    if (this.gu) wantFace('effort', 0.55); // (getting up off the ground)
    // --- face: blinking, gaze, jaw and lips while talking, expressions on the brows and mouth corners
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 1.8 + Math.random() * 4.5; this.blinkS = 0; }
    if (this.blinkS !== undefined) { this.blinkS += dt; if (this.blinkS > 0.16) this.blinkS = undefined; }
    const bl = this.blinkS !== undefined ? Math.sin((this.blinkS / 0.16) * Math.PI) : 0;
    const closed = this.base === 'lie' ? 1 : 0;
    this.blinkP = Math.max(bl, closed, this.blinkP * Math.exp(-dt * 10));
    // expression blend
    const F = this.faceCur || (this.faceCur = { ...FACES.neutral });
    const tgt = FACES[faceWant] || FACES.neutral, fw = faceWant ? clamp(faceW, 0, 1) : 0;
    const fk = 1 - Math.exp(-dt * 9);
    for (const key of FACE_KEYS) F[key] += ((FACES.neutral[key] + (tgt[key] - FACES.neutral[key]) * fw) - F[key]) * fk;
    const rest = 0.045; // relaxed lids just cover the top of the iris
    const lid = clamp(rest + F.squint + this.blinkP * (0.72 - rest - F.squint), -0.1, 0.9);
    R('lidL', lid); R('lidR', lid);
    this.gazeT -= dt;
    if (this.gazeT <= 0) { this.gazeT = 0.6 + Math.random() * 2.2; this.gazeGoal = [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.12]; }
    // the eyes lead the head: they already look where the head is still turning to
    let gy = this.gazeGoal[0] * 0.5 + clamp((this.lookGoal[0] - this.lookCur[0]) * 0.6, -0.4, 0.4);
    let gp = this.gazeGoal[1] * 0.5 + clamp((this.lookGoal[1] - this.lookCur[1]) * 0.6, -0.2, 0.2);
    if (this.lookTarget) { gy += clamp(headYaw * 0.12, -0.15, 0.15); gp += clamp(headPitch * 0.3, -0.15, 0.15); } // (eyes on them)
    this.gaze[0] = lerp(this.gaze[0], gy, 1 - Math.exp(-dt * 18)); this.gaze[1] = lerp(this.gaze[1], gp, 1 - Math.exp(-dt * 18));
    for (const e of ['eyeL', 'eyeR']) R(e, -this.gaze[1], this.gaze[0], 0);
    R('lidL', -this.gaze[1] * 0.5); R('lidR', -this.gaze[1] * 0.5);
    // talking: syllables open the jaw, the lips round and spread, the brows lift on the stressed words
    this.talkAmt = lerp(this.talkAmt, Math.max(talk, opts.talking ? 1 : 0), 1 - Math.exp(-dt * 6));
    const ta = this.talkAmt, syl = Math.max(0, Math.sin(this.t * 13.0) * Math.sin(this.t * 4.7 + 1.3));
    const round = ta * Math.max(0, Math.sin(this.t * 5.3 + this.seed)) * 0.0022;
    const stress = ta * Math.pow(Math.max(0, Math.sin(this.t * 1.9 + this.seed * 3)), 6);
    R('jaw', (this.shape && this.shape.neckY != null ? 0.004 : 0.015) + F.jaw + ta * (0.04 + 0.07 * syl)); // (a MakeHuman mouth rests closed)
    const hk = this.headK;
    const clayB = STYLE.plastilina ? 1 : 0; // (claymation: a puppet's open, friendly brows — a touch up, the inner ends raised)
    const lift = (F.lift + stress * 0.0026 + clayB * 0.0014) * hk, knit = F.knit - stress * 0.05 - clayB * 0.09;
    O('browL', 0, lift, 0); O('browR', 0, lift, 0); R('browL', 0, 0, knit); R('browR', 0, 0, -knit);
    // (claymation: a puppet's mouth — its width is in the sculpt, charbuild.js MH_PUPPET; here a little smile in it)
    const sm = (F.smile + (STYLE.plastilina ? 0.0012 : 0)) * hk, wd = (F.wide - round) * hk;
    O('mouthL', wd + sm * 0.4, sm, -Math.abs(sm) * 0.3); O('mouthR', -wd - sm * 0.4, sm, -Math.abs(sm) * 0.3);
    // --- hands: relaxed curl, a loose fist running, tight fists fighting, gripping the wheel, open palms
    const relaxed = lerp(0.42, 0.75, rb) + 0.05 * wb; // relaxed hands: the fingers curl a little, more towards the little finger
    const c1 = lerp(lerp(lerp(relaxed, 1.35, fist), 1.15, grip), 0.08, open), c2 = lerp(lerp(lerp(relaxed * 1.2, 1.55, fist), 1.3, grip), 0.05, open);
    const th = lerp(lerp(0.28, 1, fist), 0.75, grip) * (1 - 0.85 * open); // the thumb folds over the curled fingers
    R('fingL', 0, 0, -c1); R('fing2L', 0, 0, -c2); R('fingR', 0, 0, c1); R('fing2R', 0, 0, c2);
    R('thumbL', 0.1 * th, -0.8 * th, 0.05 * th + 0.15 * open); R('thumb2L', 0.5 * th);
    R('thumbR', 0.1 * th, 0.8 * th, -0.05 * th - 0.15 * open); R('thumb2R', 0.5 * th);
    // --- hair springs: the ponytail, and long hair swinging from a pivot at the back of the head
    const hs = this.desc.hairStyle;
    if (hs === 'coleta' || hs === 'largo' || hs === 'media' || hs === 'trenza' || hs === 'melena') {
      const pony = hs === 'coleta' || hs === 'trenza', amp = pony ? 1 : hs === 'largo' ? 0.8 : 0.55;
      const d0 = (this.accS * 0.02 + rb * 0.25 + wb * Math.sin(this.phase * 2) * (0.12 + 0.3 * rb)) * amp, d1 = (opts.turn || 0) * 0.35 * amp;
      for (let i = 0; i < 2; i++) {
        const a = ((i ? d1 : d0) - this.hairA[i]) * 30 - this.hairV[i] * 5;
        this.hairV[i] += a * Math.min(dt, 0.05);
        this.hairA[i] += this.hairV[i] * Math.min(dt, 0.05);
      }
      if (pony) { R('hair1', 0.25 + this.hairA[0], 0, this.hairA[1]); R('hair2', 0.12 + this.hairA[0] * 0.8, 0, this.hairA[1] * 0.6); }
      else R('hair2', clamp(this.hairA[0], -0.03, 0.4), 0, clamp(this.hairA[1], -0.3, 0.3));
    }
    // --- feet planted on the ground (foot locking): from heel strike to toe-off the foot in contact stays where it
    // landed — on the heel, then on the ball of the foot as the heel lifts — while the body goes on over it; each leg
    // is re-solved as a two-bone chain (knee in front), the foot keeping its angle and rolling further up onto the toes
    // when the leg behind can reach no further; past that the foot comes away (and the next stances are made a little
    // shorter). The hips ride as high as the legs on the ground allow. At toe-off the ball of the foot lifts where it
    // was and the foot eases back into the animated swing
    const legs = this._legs || (this._legs = [{ on: false, w: 0, rt: 1, lift: 0 }, { on: false, w: 0, rt: 1, lift: 0 }]);
    // turning: the ground turns the other way under the body (the heading is set after this update: last frame's turn)
    const yaw = this.object.rotation.y;
    let dyw = this._yaw0 === undefined ? 0 : yaw - this._yaw0; dyw -= Math.round(dyw / TAU) * TAU; this._yaw0 = yaw;
    if (Math.abs(dyw) > 1e-5 && Math.abs(dyw) < 0.5) {
      const c = Math.cos(dyw), s = Math.sin(dyw);
      for (const q of legs) if (q.on || q.rt < 1) { const x = q.x, z = q.z; q.x = x * c - z * s; q.z = x * s + z * c; }
    }
    const ww = grounded && !this.statue && Character.footLock ? wb * (1 - this.baseW) * (this.action ? 0.5 : 1) : 0;
    if (ww > 0.02) {
      const L1 = this.legL1, L2 = this.legL2, Lm = (L1 + L2) * 0.998, Lm2 = Lm * Lm;
      const ha = r.hips[0], ca = Math.cos(ha), sa = Math.sin(ha), cb = Math.cos(r.hips[1]), sb1 = Math.sin(r.hips[1]), cc = Math.cos(r.hips[2]), sc1 = Math.sin(r.hips[2]);
      const hy0 = this.rest.hips.y + hipsY, toeOff = this.toeOff ?? 0.6, gv = v * fwdC * dt, gx = v * sideC * dt, HO = this.heelOff, BO = this.ballOff;
      // (z, y) of a point on the sole from the ankle, the foot pitched by a
      const off = (a, O, out) => { const c = Math.cos(a), s = Math.sin(a); out[0] = O[1] * s + O[2] * c; out[1] = O[1] * c - O[2] * s; return out; };
      const oh = this._oh || (this._oh = [0, 0]), ob = this._ob || (this._ob = [0, 0]);
      const need = (z, y, x = 0) => (z * z + x * x < Lm2 ? -y - Math.sqrt(Lm2 - z * z - x * x) : 1); // how much lower the hip must be to reach
      // the least further roll onto the toes that lets a leg reach the ball of the foot it holds (-1: none does)
      const fits = (q, lf, hjy) => { off(q.af + lf, BO, ob); const z = q.z - ob[0] - q.hjz, y = -ob[1] - hjy, x = q.x - q.hjx; return z * z + y * y + x * x <= Lm2; };
      const liftFor = (q, hjy) => {
        if (fits(q, q.lift, hjy)) return q.lift;
        let lo = q.lift, hi = q.lift + 0.6;
        if (!fits(q, hi, hjy)) return -1;
        for (let it = 0; it < 6; it++) { const m = (lo + hi) * 0.5; if (fits(q, m, hjy)) hi = m; else lo = m; }
        return hi;
      };
      // half a step out to the side: a side step lands this far out the way you are going and leaves as far behind
      const sh = sideC * v * (toeOff / (this.cad || 1)) * 0.5;
      let drop = 0;
      for (let i = 0; i < 2; i++) {
        const sd = i ? 'L' : 'R', q = legs[i], t = this.rest['thigh' + sd];
        // the hip joint: the thigh's offset turned with the pelvis (Euler XYZ)
        const x1 = t.x * cc - t.y * sc1, y1 = t.x * sc1 + t.y * cc, z2 = -x1 * sb1 + t.z * cb;
        q.hjy = hy0 + y1 * ca - z2 * sa; q.hjz = hipsZ + y1 * sa + z2 * ca; q.hjx = hipsX + x1 * cb + t.z * sb1;
        const at = ha + r['thigh' + sd][0], as = at + r['shin' + sd][0], af = as + r['foot' + sd][0];
        // the animated (FK) ankle relative to the hip joint, and how far out to the side it is
        q.fz = -L1 * Math.sin(at) - L2 * Math.sin(as); q.fy = -L1 * Math.cos(at) - L2 * Math.cos(as); q.af = af;
        q.phiF = r.hips[2] + r['thigh' + sd][2]; q.fx = q.hjx + (L1 + L2 * Math.cos(r['shin' + sd][0])) * Math.sin(q.phiF);
        off(af, HO, oh); off(af, BO, ob);
        let ph = (this.legPh ?? 0) + (i ? 0.5 : 0); ph -= Math.floor(ph);
        if (ph >= toeOff) q.early = false;
        q.u = ph >= toeOff ? (back ? 1 - ph : ph - toeOff) / (1 - toeOff) : 0; // how far through its swing (backwards: the other way)
        q.need = 0;
        if (ph < toeOff && !q.early) {
          if (!q.on) {
            // heel strike (the ball first if the foot comes down toes first): planted where it lands, within reach
            // (the hips come down to reach it: only a foot that even the lowest hips could not reach is pulled in)
            const piv = ob[1] < oh[1] - 0.004 ? 1 : 0, o = piv ? ob : oh, ty = -o[1] - q.hjy + 0.06 * sc;
            let tz = q.fz;
            if (tz * tz + ty * ty > Lm2) tz = Math.sign(tz) * Math.sqrt(Math.max(0, Lm2 - ty * ty));
            q.on = true; q.piv = piv; q.z = q.hjz + tz + o[0]; q.x = q.fx + sh; q.w = 0; q.lift = 0;
          } else {
            q.z -= gv; q.x -= gx; // the ground goes by under the body
            if (!q.piv && ob[1] < oh[1] - 0.002) { q.z = q.sz + ob[0] - gv; q.piv = 1; } // heel off: onto the ball of the foot
            else if (q.piv && back && oh[1] < ob[1] - 0.002) { q.z = q.sz + oh[0] - gv; q.piv = 0; } // (stepping back: toes, then heel)
          }
          q.w = Math.min(1, q.w + dt * 30);
          // the heel stays down through mid-stance (the hips come down instead); later in the stance the foot may roll
          // further up onto the toes rather than pull the hips down
          q.late = q.piv && !back && ph > toeOff * 0.55;
          let o = q.piv ? off(af + (q.late ? q.lift + 0.6 : q.lift), BO, ob) : oh;
          q.need = need(q.z - o[0] - q.hjz, -o[1] - q.hjy, (q.x - q.hjx) * q.w) * q.w; q.st = true; q.rt = 0;
          // a foot left too far out to the side comes away (and the next stances are made a little shorter)
          if (Math.abs(q.x - q.fx) > 0.25 * sc && q.w >= 1) { q.early = true; q.st = false; q.need = 0; this.trK = Math.max(0.6, (this.trK ?? 1) - 0.03); }
        } else {
          q.st = false;
          if (q.on) {
            // toe-off; a stance that needed little rolling onto the toes could have been longer
            q.on = false;
            if (!q.early && q.lift < 0.15) this.trK = Math.min(1.1, (this.trK ?? 1) + 0.01);
            if (!q.piv) { q.z = q.sz + ob[0]; q.piv = 1; }
          }
          if (q.rt < 1) { q.rt = Math.min(1, q.rt + dt * (this.cad || 1) / 0.18); q.z -= gv; q.x -= gx; } else q.lift = 0;
          q.w = 0;
        }
        drop = Math.max(drop, q.need);
      }
      // the hips ride as high as the legs on the ground let them: highest over a straight leg in mid-stance, lowest
      // with both feet down (the animated rise and fall only where the legs have room for it)
      this.strideDrop = lerp(this.strideDrop || 0, Math.min(Math.max(0, drop), 0.07 * sc), 1 - Math.exp(-30 * dt));
      const dh = this.strideDrop * ww;
      hipsY -= dh;
      for (let i = 0; i < 2; i++) {
        const sd = i ? 'L' : 'R', q = legs[i], hjy = q.hjy - dh;
        let az, ay, pa, ax;
        // the swing crossing from behind to ahead, sideways: it leaves and lands moving back with the ground (Hermite)
        const u = q.u, u2 = u * u, u3 = u2 * u, vr = -sideC * v * ((1 - toeOff) / (this.cad || 1));
        const sx = (-2 * u3 + 3 * u2) * 2 * sh - sh + (u3 - 2 * u2 + u) * vr + (u3 - u2) * vr;
        const clr = 0.045 * sc * Math.pow(Math.sin(Math.PI * u), 0.6); // a swinging foot always clears the ground
        if (q.st) {
          // on the ground: the held heel or ball of the foot, rolling up onto the toes as far as the leg needs
          let o = q.piv ? off(q.af + q.lift, BO, ob) : off(q.af, HO, oh), tz = q.z - o[0] - q.hjz, ty = -o[1] - hjy;
          if (q.late) {
            const lf = liftFor(q, hjy);
            if (lf >= 0) q.lift = lf;
            else if (q.w >= 1) { q.early = true; this.trK = Math.max(0.6, (this.trK ?? 1) - 0.03); }
            o = off(q.af + q.lift, BO, ob); tz = q.z - o[0] - q.hjz; ty = -o[1] - hjy;
          }
          az = lerp(q.fz, tz, q.w); ay = lerp(q.fy + dh, ty, q.w); pa = q.af + (q.piv ? q.lift : 0) * q.w; ax = lerp(q.fx + sh, q.x, q.w);
        } else if (q.rt < 1) {
          // letting go: the ball of the foot lifts where it was on the ground, then the foot eases into the swing
          const e = q.rt * q.rt * (3 - 2 * q.rt), u = Math.min(1, q.rt * 2.5), ev = u * u * (3 - 2 * u);
          pa = q.af + q.lift * (1 - e);
          const o = off(pa, BO, ob), gy = -o[1] - hjy;
          az = lerp(q.z - o[0] - q.hjz, q.fz, e); ay = Math.max(lerp(gy, q.fy + dh, ev), gy + clr); ax = lerp(q.x, q.fx + sx, e);
        } else { az = q.fz; pa = q.af; ax = q.fx + sx; ay = Math.max(q.fy + dh, -Math.min(off(pa, HO, oh)[1], off(pa, BO, ob)[1]) - hjy + clr); } // swinging through, as animated (the lower hips don't lower it)
        // two-bone solve: the knee from the reach, the leg out to the side (hip abduction), then its swing fore and aft
        const dx = ax - q.hjx, D = clamp(Math.hypot(dx, az, ay), Math.abs(L1 - L2) + 0.01, Lm);
        const kn = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
        const Pk = L1 + L2 * Math.cos(kn), Qk = L2 * Math.sin(kn), phi = Math.asin(clamp(dx / Pk, -0.7, 0.7)), Pc = Pk * Math.cos(phi);
        const at = Math.atan2(-Qk, Pc) - Math.atan2(az, -ay), as = at + kn;
        q.sz = q.hjz - Pc * Math.sin(at) - Qk * Math.cos(at); // where the ankle ended up
        // faded in and out with the walk (the sole keeps its roll to the ground)
        r['thigh' + sd][0] = lerp(r['thigh' + sd][0], at - ha, ww); r['shin' + sd][0] = lerp(r['shin' + sd][0], kn, ww); r['foot' + sd][0] = lerp(r['foot' + sd][0], pa - as, ww);
        r['thigh' + sd][2] = lerp(r['thigh' + sd][2], phi - r.hips[2], ww); r['foot' + sd][2] -= (phi - q.phiF) * ww;
      }
    } else { for (const q of legs) { q.on = false; q.rt = 1; q.lift = 0; q.early = false; } this.strideDrop = 0; }
    // --- apply
    for (const name in B) {
      const a = r[name];
      B[name].rotation.set(a[0], a[1], a[2]);
    }
    if (this._qlist) for (let i = 0; i < this._qlist.length; i += 3) { const b = B[this._qlist[i]]; if (b) b.quaternion.slerp(this._qlist[i + 1], this._qlist[i + 2]); }
    if (this.mat && this.mat.userData.u && this.mat.userData.u.uBend) this.mat.userData.u.uBend.value.set(clamp(-r.foreL[0] / 2.3, 0, 1), clamp(-r.foreR[0] / 2.3, 0, 1), clamp(r.shinL[0] / 2.0, 0, 1), clamp(r.shinR[0] / 2.0, 0, 1)); // creases follow the joints
    O('hips', hipsX, hipsY, hipsZ);
    for (const name of MOVABLE) {
      const b = B[name], p = po[name], rs = this.rest[name];
      if (b && rs) b.position.set(rs.x + p[0], rs.y + p[1], rs.z + p[2]);
    }
    if (this.gu) this.getUpStep(dt);
  }

  // talking gestures, one after another: a beat of the hand on the stressed words, open palms, a shrug, hands apart
  // (showing how big), a hand on the chest, a wave of dismissal, fingers counting, hands together while listening
  static footLock = true; // (off only to compare, in the dev tools)
  gestureStep(dt, active) {
    const g = this.gest || (this.gest = { name: null, t: 0, dur: 0 });
    g.t += dt;
    if (!g.name || g.t >= g.dur) {
      if (!active) { g.name = null; return null; }
      const list = GESTURES;
      let n;
      do n = list[Math.floor(Math.random() * list.length)]; while (n === g.name && list.length > 1);
      g.name = n; g.t = 0; g.dur = 1.2 + Math.random() * 1.8; g.seed = Math.random() * 10;
    }
    return g;
  }
  gesturePose(g, Q, P, k) {
    const u = g.t / g.dur, e = smoothstep(0, 0.25, u) * (1 - smoothstep(0.75, 1, u)) * k, t = this.t, b = Math.sin(t * 6.2 + g.seed);
    const add = (n, x = 0, y = 0, z = 0) => { const a = P[n]; if (!a) return; Q(n, a[0] + x * e, a[1] + y * e, a[2] + z * e); };
    switch (g.name) {
      case 'beat': add('armR', -0.35, 0.1, 0.05); add('foreR', -0.55 + 0.22 * Math.max(0, b), -0.6); add('handR', -0.2 * Math.max(0, b)); break;
      case 'beatL': add('armL', -0.35, -0.1, -0.05); add('foreL', -0.55 + 0.22 * Math.max(0, b), 0.6); add('handL', -0.2 * Math.max(0, b)); break;
      case 'open': add('armL', -0.35, -0.2, 0.1); add('armR', -0.35, 0.2, -0.1); add('foreL', -0.5, -1.1); add('foreR', -0.5, 1.1); add('handL', -0.3); add('handR', -0.3); this._open = 1; break;
      case 'shrug': add('clavL', 0, 0, 0.2); add('clavR', 0, 0, -0.2); add('armL', -0.15, 0, 0.25); add('armR', -0.15, 0, -0.25); add('foreL', -0.6, -1.2); add('foreR', -0.6, 1.2); add('head', 0, 0, 0.12); this._open = 1; this._face = 'doubt'; break;
      case 'apart': add('armL', -0.5, 0, 0.35 + 0.1 * b); add('armR', -0.5, 0, -0.35 - 0.1 * b); add('foreL', -0.6, -0.4); add('foreR', -0.6, 0.4); this._open = 1; break;
      case 'chest': add('armR', -0.25, 0.2, 0.35); add('foreR', -1.35, -0.4); add('handR', 0.2, 0.3, 0); this._open = 1; break;
      case 'wave': add('armR', -0.45, 0, -0.1); add('foreR', -0.8, -0.8); add('handR', 0, 0, 0.5 * Math.sin(t * 9)); this._open = 1; break;
      case 'count': add('armR', -0.55, 0.1, 0.1); add('foreR', -0.9, -0.3); add('armL', -0.45, -0.1, -0.1); add('foreL', -1.0, 0.3); add('handR', 0, 0, 0.15 * Math.sin(t * 5)); break;
      case 'clasp': add('armL', -0.3, 0, -0.08); add('armR', -0.3, 0, 0.08); add('foreL', -0.75, 0.2); add('foreR', -0.75, -0.2); break;
      case 'cross': add('armL', -0.3, -1.1, -0.1); add('foreL', -1.4); add('armR', -0.34, 1.1, 0.1); add('foreR', -1.35); break;
    }
  }

}
