// «Plastilina» — Guareña as a claymation film (Ajustes › Estética › Plastilina, the default look; the plan and its
// passes in docs/plastilina.md). A studio set — the façades' warm palette (textures.js applyClayPalette), a painted sky
// with cotton clouds and studio lamps (sky.js), contact shadows (STUDIO_AO) and the film's grade (ClayGrade) — where
// every lit thing is modelling clay and the people, cars and animals are puppets animated pose by pose:
//  - the clay (installClayChunks): through three.js's own shader chunks, so every standard material takes it — lumps
//    from the hands that shaped it, thumbprints with their ridges, spatula cuts, a speck of lint here and there, the
//    colour never quite even, a soft waxy sheen, light that wraps a little into the shadow (warm, as clay is); the sets
//    keep their marks, the puppets are retouched at every pose (the «boil»)
//  - stop motion (StopMotion), always on: 12 poses a second for the puppets — their bones and their place — while the
//    camera, the player and the game itself run on as always (as in Kirby and the Rainbow Curse or Spider-Verse: the
//    figures «on twos», the camera «on ones»), and no motion blur
// What every film and game studied taught (Aardman, The LEGO Movie, Kirby, The Neverhood…) is in the plan.
import * as THREE from 'three';

export const PLASTILINA = {
  fps: 12, // poses per second (animation «on twos»)
  // the last grade: clay colours are pure, the studio fills the shadows a little, the lens darkens its corners a touch
  grade: { sat: 1.1, warm: 0.045, contrast: 1.1, lift: 0.025, vignette: 0.16, tint: [1.0, 0.955, 0.95] }, // (richer and rosier, as the user's pictures)
  flicker: 0.014, // the studio lamps' little flicker from one pose to the next (the frames of a stop-motion film never match)
  // the lens: how soft the far background goes at most (a fraction of the picture's height) and from how far behind the
  // subject it starts and is at its softest (× the subject's distance). Only a little: the user asked for it gentler
  lens: { blur: 0.0034, from: 2.2, to: 10 }, // (the user's reference pictures: a macro lens on a miniature, the far end of a street soft)
  boilMM: 0.002, // how far a puppet's surface boils from one pose to the next (metres)
  // the animator's hand: a puppet put back each pose is never exactly where it was (metres, radians)
  jitter: { pos: 0.003, yaw: 0.006 },
  // the clay of the sets (metres): lumps, prints, cuts, lint; the puppets take theirs at their own scale (CLAY_SCALE)
  boil: null, // the shared uniform (installClayChunks): moved at every pose, for the puppets only
};

// contact shadows: ambient occlusion where things meet — the foot of a wall, under eaves and balconies, round pots and
// people (three.js GTAOPass on the scene's own depth: game.js)
export const STUDIO_AO = {
  ao: { radius: 2.0, distanceExponent: 1.0, thickness: 2.5, scale: 1.7, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false },
  denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 },
  blend: 1.0,
};

// the film's last grade, in linear light before the tone curve (its values: PLASTILINA.grade): the studio lamps (uGain,
// a hair brighter or dimmer at each pose) and their gels (uTint), purer colour, a warm white balance, a touch of
// contrast round the middle greys, the studio's fill in the shadows, the lens's darker corners
export const ClayGrade = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1 }, uWarm: { value: 0 }, uContrast: { value: 1 }, uLift: { value: 0 }, uVignette: { value: 0 }, uGain: { value: 1 }, uTint: { value: { x: 1, y: 1, z: 1 } } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uWarm, uContrast, uLift, uVignette, uGain; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = max(c.rgb, 0.0) * uGain * uTint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm * 0.7);
      float k = pow(max(l, 1e-4) / 0.18, uContrast - 1.0);
      col *= clamp(k, 0.6, 1.6);
      col += uLift * vec3(0.2, 0.17, 0.13) * (1.0 - smoothstep(0.0, 0.3, l));
      col *= 1.0 - uVignette * smoothstep(0.4, 1.0, length((vUv - 0.5) * vec2(1.25, 1.0)));
      gl_FragColor = vec4(col, c.a);
    }`,
};

// ---------------------------------------------------------------- textures repainted as pieces of plasticine
// Each layer of an RGBA texture array (sRGB bytes; a single picture is one layer): smoothed — the grain of plaster,
// asphalt or stone goes, clay has none — its light pulled softly onto a few tones and its colour made a little purer:
// the painted façades, the ground and the interiors' wood, tiles and plaster as flat pieces of coloured clay (world.js,
// assets.js). Alpha is kept. blur: in texels of a 512 tile.
function boxBlur(src, dst, tmp, S, r) { // (wraps round: the textures tile)
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < S; y++) {
    const row = y * S;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + ((k + S) % S)];
    for (let x = 0; x < S; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + ((x + r + 1) % S)] - src[row + ((x - r + S) % S)];
    }
  }
  for (let x = 0; x < S; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[((k + S) % S) * S + x];
    for (let y = 0; y < S; y++) {
      dst[y * S + x] = acc * inv;
      acc += tmp[((y + r + 1) % S) * S + x] - tmp[((y - r + S) % S) * S + x];
    }
  }
}
export function clayRepaint(data, S, layers, { blur = 3, levels = 5, posterize = 0.5, saturation = 1.1 } = {}) {
  const r0 = Math.max(1, Math.round(blur * S / 512)), N = S * S;
  const C = [0, 1, 2].map(() => new Float32Array(N)), Cb = [0, 1, 2].map(() => new Float32Array(N)), tmp = new Float32Array(N);
  const byte = (v) => Math.max(0, Math.min(255, v));
  for (let l = 0; l < layers; l++) {
    const off = l * N * 4;
    for (let i = 0, j = off; i < N; i++, j += 4) { C[0][i] = data[j]; C[1][i] = data[j + 1]; C[2][i] = data[j + 2]; }
    for (let c = 0; c < 3; c++) boxBlur(C[c], Cb[c], tmp, S, r0);
    for (let i = 0, j = off; i < N; i++, j += 4) {
      let r = Cb[0][i], g = Cb[1][i], b = Cb[2][i];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 1) { // (soft steps from tone to tone: no hard banding)
        const t = (lum / 255) * levels, f = t - Math.floor(t), s = f < 0.3 ? 0 : f > 0.7 ? 1 : (f - 0.3) / 0.4;
        const m = 1 + ((((Math.floor(t) + s * s * (3 - 2 * s)) / levels) * 255) / lum - 1) * posterize;
        r *= m; g *= m; b *= m;
      }
      const lm = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      data[j] = byte(lm + (r - lm) * saturation); data[j + 1] = byte(lm + (g - lm) * saturation); data[j + 2] = byte((lm + (b - lm) * saturation) * 1.02);
    }
  }
  return data;
}

// ---------------------------------------------------------------- the clay's surface, modelled once
// A tile of modelled clay (1024², wraps on every side), made when the game starts: four kinds of surface, one per
// channel, each a height (0.5 = flat):
//  r  a wall's clay — dabs of clay pressed on with the thumb, thumb smears, pits where it did not quite fill, a grain
//  g  a road's clay — crumbs and grains of grey clay rolled flat, little pits, a low swell
//  b  a puppet's or a car's — smoothed, a few soft dents where the fingers held it, the finest grain
//  a  the pores and crumbs close up, for every kind
// The shader lays it on every surface from the three sides (triplanar, on the thing's own shape) and takes its
// relief (the light picks out the dabs) and its hollows (darker, so they show in the shade too).
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function clayDetailData(S = 1024) {
  const ch = [new Float32Array(S * S), new Float32Array(S * S), new Float32Array(S * S), new Float32Array(S * S)];
  const r = rng(20261005);
  // a soft dab at (x, y): radius rad (texels), height a, stretched along (dx, dy) by k — wraps round the tile
  const dab = (F, x, y, rad, a, dx = 1, dy = 0, k = 1) => {
    const R = Math.ceil(rad * Math.max(1, k)), x0 = Math.floor(x), y0 = Math.floor(y), r2 = 1 / (rad * rad);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const u = (i * dx + j * dy) / k, v = -i * dy + j * dx, d2 = (u * u + v * v) * r2;
      if (d2 >= 1) continue;
      const f = (1 - d2) * (1 - d2);
      F[(((y0 + j) % S + S) % S) * S + (((x0 + i) % S + S) % S)] += a * f;
    }
  };
  const sc = S / 1024;
  // r: a wall's clay, smoothed by hand (the tile is ~2.4 m: a texel ~2.3 mm) — broad dabs and swells, long thumb
  // smears with the ridge they push up, a few pits where it did not fill, the odd fine crack
  // (2026-10-05, sixth pass: broader and fewer marks — the pictures' walls are smoothed by hand, soft swells a palm to
  // an arm across, not the crumpled paper the many small dabs made)
  for (let n = 0; n < 320; n++) dab(ch[0], r() * S, r() * S, (80 + r() * 150) * sc, (r() * 1.6 - 0.6) * 0.08);
  for (let n = 0; n < 700; n++) dab(ch[0], r() * S, r() * S, (20 + r() * 34) * sc, (r() * 1.4 - 0.4) * 0.06);
  // (a few broad smears of the thumb, a soft lip beside each: many narrow ones crossing each other read as wrinkles)
  for (let n = 0; n < 45; n++) {
    const a = r() * Math.PI * 2, x = r() * S, y = r() * S, w = (28 + r() * 36) * sc, k = 2.5 + r() * 3, dx = Math.cos(a), dy = Math.sin(a);
    dab(ch[0], x, y, w, -(0.04 + r() * 0.05), dx, dy, k); // the smear's groove
    dab(ch[0], x - dy * w * 1.1, y + dx * w * 1.1, w * 0.6, 0.025, dx, dy, k * 1.4); // and the soft lip beside it
  }
  for (let n = 0; n < 250; n++) dab(ch[0], r() * S, r() * S, (1.5 + r() * 3) * sc, -(0.08 + r() * 0.12));
  for (let n = 0; n < 12; n++) { // fine cracks: short wandering grooves
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
    for (let k = 0, L = 30 + r() * 90; k < L; k++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 1.5 * sc; y += Math.sin(a) * 1.5 * sc; dab(ch[0], x, y, 1.6 * sc, -0.12); }
  }
  // g: a road's clay
  // (sixth pass: smoother — the pictures' road is a smoothed grey clay with hairline cracks, hardly a pore)
  for (let n = 0; n < 14000; n++) dab(ch[1], r() * S, r() * S, (1.5 + r() * 4.5) * sc, (r() - 0.45) * 0.2);
  for (let n = 0; n < 900; n++) dab(ch[1], r() * S, r() * S, (14 + r() * 40) * sc, (r() - 0.5) * 0.14);
  for (let n = 0; n < 1500; n++) dab(ch[1], r() * S, r() * S, (1.2 + r() * 2.5) * sc, -(0.2 + r() * 0.3));
  // b: smoothed clay (puppets, cars)
  for (let n = 0; n < 140; n++) dab(ch[2], r() * S, r() * S, (40 + r() * 80) * sc, -(0.06 + r() * 0.12));
  for (let n = 0; n < 500; n++) dab(ch[2], r() * S, r() * S, (18 + r() * 40) * sc, (r() - 0.5) * 0.08);
  // a: pores and crumbs
  for (let n = 0; n < 26000; n++) dab(ch[3], r() * S, r() * S, (1 + r() * 2.2) * sc, (r() < 0.65 ? -1 : 1) * (0.1 + r() * 0.25));
  // a fine grain on all (value noise, ~3 texels)
  const G = 3 * sc, gw = Math.ceil(S / G), gv = new Float32Array(gw * gw);
  for (let i = 0; i < gv.length; i++) gv[i] = r() - 0.5;
  const grain = (x, y) => {
    const fx = x / G, fy = y / G, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const g = (a, b) => gv[((b % gw) + gw) % gw * gw + ((a % gw) + gw) % gw];
    return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
  };
  const out = new Uint8Array(S * S * 4), gk = [0.02, 0.035, 0.012, 0.0];
  for (let c = 0; c < 4; c++) {
    const F = ch[c];
    let m = 0; for (let i = 0; i < F.length; i++) m += F[i]; m /= F.length;
    let v = 0; for (let i = 0; i < F.length; i++) v += (F[i] - m) * (F[i] - m); const sd = Math.sqrt(v / F.length) || 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, h = (F[i] - m) / sd * 0.16 + grain(x, y) * gk[c] / 0.16 * 0.16;
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round((0.5 + h) * 255)));
    }
  }
  return out;
}
function makeClayDetail(S = 1024) {
  const t = new THREE.DataTexture(clayDetailData(S), S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- the clay
// One plain object shared by every material (three.js copies uniform values that are plain objects by reference),
// so moving it once moves the boil of every puppet. (The detail texture is cloned per material, but every clone shares
// its one upload: same source.)
export function installClayChunks() {
  const C = THREE.ShaderChunk;
  const boil = { value: { x: 0, y: 0 } };
  const detail = makeClayDetail(1024);
  PLASTILINA.detail = detail;
  for (const lib of ['standard', 'physical']) { THREE.ShaderLib[lib].uniforms.uClayBoil = boil; THREE.ShaderLib[lib].uniforms.uClayTex = { value: detail }; }
  PLASTILINA.boil = boil.value;
  C.common += `
#ifdef STANDARD
varying vec3 vClayP; varying vec3 vClayN;
#endif
`;
  // (the pattern sits on each thing's own shape — its vertices before skinning — so it travels with the cars and people)
  // A puppet's surface also «boils»: between two frames the animator's fingers have been on it, so its skin never sits
  // quite where it sat — every pose its outline shifts by a millimetre or two, a few centimetres at a time
  C.begin_vertex += `
#ifdef STANDARD
vClayP = position; vClayN = objectNormal;
#if defined(CLAY_PUPPET) && !defined(CLAY_NO_BOIL)
{
  vec3 bq = position * 26.0 + vec3(uClayBoil.x, uClayBoil.y, uClayBoil.x - uClayBoil.y) * 5.3, bi = floor(bq), bf = fract(bq);
  bf = bf * bf * (3.0 - 2.0 * bf);
  #define CLAY_VH(o) fract(sin(dot(bi + o, vec3(127.1, 311.7, 74.7))) * 43758.5453)
  float bn = mix(mix(mix(CLAY_VH(vec3(0, 0, 0)), CLAY_VH(vec3(1, 0, 0)), bf.x), mix(CLAY_VH(vec3(0, 1, 0)), CLAY_VH(vec3(1, 1, 0)), bf.x), bf.y),
                 mix(mix(CLAY_VH(vec3(0, 0, 1)), CLAY_VH(vec3(1, 0, 1)), bf.x), mix(CLAY_VH(vec3(0, 1, 1)), CLAY_VH(vec3(1, 1, 1)), bf.x), bf.y), bf.z);
  #undef CLAY_VH
  transformed += objectNormal * (bn - 0.5) * ${PLASTILINA.boilMM.toFixed(4)};
}
#endif
#endif
`;
  C.common += `
#if defined(STANDARD) && defined(CLAY_PUPPET)
uniform vec2 uClayBoil;
#endif
`;
  C.bumpmap_pars_fragment += `
#ifdef STANDARD
#ifndef CLAY_SCALE
#define CLAY_SCALE 1.0
#endif
#ifndef CLAY_RELIEF
#define CLAY_RELIEF 1.0
#endif
#ifndef CLAY_TONE
#define CLAY_TONE 1.0
#endif
#ifndef CLAY_PUPPET
uniform vec2 uClayBoil;
#endif
// the modelled surface (clayDetailData): which kind (CLAY_SET: 0 a wall, 1 a road, 2 smoothed, 3 pores), the tile's size in
// metres, how deep its relief goes (metres) and how dark its hollows
#ifndef CLAY_SET
#define CLAY_SET 2
#endif
#ifndef CLAY_TILE
#define CLAY_TILE 0.6
#endif
#ifndef CLAY_AMP
#define CLAY_AMP 0.0015
#endif
#ifndef CLAY_CAV
#define CLAY_CAV 0.12
#endif
uniform sampler2D uClayTex;
vec4 clayDetail(vec3 p, vec3 n) { // from the three sides, blended by how the surface faces
  vec3 w = pow(abs(n), vec3(4.0)); w /= max(w.x + w.y + w.z, 1e-4);
  vec4 t = vec4(0.0);
  if (w.x > 0.02) t += texture2D(uClayTex, p.zy) * w.x;
  if (w.y > 0.02) t += texture2D(uClayTex, p.xz + 0.37) * w.y;
  if (w.z > 0.02) t += texture2D(uClayTex, p.xy + 0.71) * w.z;
  return t / max(w.x * step(0.02, w.x) + w.y * step(0.02, w.y) + w.z * step(0.02, w.z), 1e-4);
}
vec2 gClaySlope; float gClayDark; float gClayCavK = 1.0;
float clayHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float clayNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clayHash(i), clayHash(i + vec3(1, 0, 0)), f.x), mix(clayHash(i + vec3(0, 1, 0)), clayHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(clayHash(i + vec3(0, 0, 1)), clayHash(i + vec3(1, 0, 1)), f.x), mix(clayHash(i + vec3(0, 1, 1)), clayHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// the clay at p (px: metres per pixel there): x its height (metres), y how much darker it is (the hollows, the grooves of
// a print, a cut), z a speck of lint (0..1)
vec3 clayAt(vec3 p, float px) {
  // lumps from the hands that shaped it; the finer ones (and every mark below) only where they can be seen — far off a
  // pixel covers more than they are, and they would only cost and shimmer
  float n1 = clayNoise(p * 1.4) - 0.5;
  float h = n1 * 0.06, dark = max(0.0, -n1) * 0.08, lint = 0.0;
  if (px > 0.05) return vec3(h, dark, lint);
  h += (clayNoise(p * 4.2 + 7.0) - 0.5) * 0.016 * (1.0 - smoothstep(0.03, 0.05, px));
  // a thumb's smear: a long shallow stroke where the clay was smoothed, with the little ridge it pushed up beside it
  vec3 a = floor(p / 0.9);
  if (clayHash(a + 71.0) < 0.55) {
    vec3 o = (a + 0.3 + 0.4 * vec3(clayHash(a + 1.7), clayHash(a + 4.1), clayHash(a + 6.6))) * 0.9;
    vec3 dir = normalize(vec3(clayHash(a + 3.3), clayHash(a + 5.5), clayHash(a + 7.7)) - 0.5);
    vec3 q = p - o; float t = dot(q, dir), L = 0.15 + 0.08 * clayHash(a + 9.9); // (it stays inside its cell: one test each)
    float d = length(q - dir * t), w = 0.05 + 0.03 * clayHash(a + 2.2), along = (1.0 - smoothstep(L * 0.6, L, abs(t))) * (1.0 - smoothstep(0.035, 0.05, px));
    float k = exp(-(d / w) * (d / w));
    h += along * (-0.007 * k + 0.003 * exp(-pow((d - w * 1.3) / (w * 0.5), 2.0)));
    dark += along * 0.04 * k;
  }
  if (px > 0.025) return vec3(h, dark, lint);
  // thumbprints: an oval loop of ridges pressed in, in about half the cells of 0.55 m (never across a cell)
  vec3 c = floor(p / 0.55);
  if (clayHash(c + 17.0) < 0.48) {
    vec3 q = p - (c + 0.35 + 0.3 * vec3(clayHash(c + 3.1), clayHash(c + 5.7), clayHash(c + 9.3))) * 0.55;
    vec3 ax = normalize(vec3(clayHash(c + 1.3), clayHash(c + 2.9), clayHash(c + 4.4)) - 0.5);
    vec3 qo = q - ax * dot(q, ax) * 0.5; // (an oval: a thumb pressed at a slant)
    float d = length(qo), R = 0.11 + 0.05 * clayHash(c + 8.8);
    if (d < R) {
      vec3 side = normalize(cross(ax, vec3(0.31, 0.83, 0.46)));
      float lean = dot(qo, side) / R; // (pressed harder on one side)
      float m = (1.0 - smoothstep(R * 0.4, R, d)) * (0.75 + 0.25 * lean) * (1.0 - smoothstep(0.018, 0.025, px));
      float rf = 1.0 - smoothstep(0.011, 0.022, px); // (the ridges only where they are a few pixels apart)
      // a loop, not a target: the ridges' phase turns with the angle round the print's core
      float ang = atan(dot(qo, side), dot(qo, cross(ax, side)));
      float ridges = 0.5 + 0.5 * cos(6.2832 * (d / 0.04 + 0.16 * ang + 0.35 * clayHash(c + 2.6)));
      h += m * (-0.007 + 0.003 * ridges * rf);
      dark += m * (0.03 + 0.09 * (1.0 - ridges) * rf);
    }
  }
  if (px > 0.015) return vec3(h, dark, lint);
#ifdef CLAY_PUPPET
  return vec3(h, dark, lint); // (a puppet's face and hands are smoothed: no cut nor speck to read as a scar)
#endif
  // spatula cuts: a short straight stroke in some cells of 0.8 m, a fine groove with a soft lip
  vec3 e = floor(p / 0.8);
  if (clayHash(e + 31.0) < 0.38) {
    vec3 o = (e + 0.5) * 0.8, dir = normalize(vec3(clayHash(e + 2.3), clayHash(e + 6.1), clayHash(e + 8.7)) - 0.5);
    vec3 q = p - o; float t = clamp(dot(q, dir), -0.17, 0.17);
    float d = length(q - dir * t), w = 0.006 + 0.004 * clayHash(e + 4.9);
    float g = exp(-(d / w) * (d / w)) * (1.0 - smoothstep(0.008, 0.015, px)) * (1.0 - smoothstep(0.14, 0.17, abs(dot(q, dir))));
    h -= g * 0.004; dark += g * 0.12;
  }
  // a speck of lint or dust stuck to it, close up only
  vec3 sp = floor(p / 0.06);
  if (px < 0.012 && clayHash(sp + 51.0) < 0.012) {
    float d = length(p - (sp + 0.5) * 0.06);
    lint = (1.0 - smoothstep(0.004, 0.009, d)) * (1.0 - smoothstep(0.006, 0.012, px));
  }
  return vec3(h, dark, lint);
}
vec3 clayPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
#endif
`;
  // (after the alpha test, so leaves that are cut away cost nothing; still before any light)
  C.roughnessmap_fragment = `
#ifdef STANDARD
{
  vec3 cp = vClayP * CLAY_SCALE;
#ifdef CLAY_PUPPET
  cp += vec3(uClayBoil.x, uClayBoil.y, uClayBoil.x * 0.7) * 0.012; // (a puppet: retouched at every pose — the boil)
#endif
  vec2 dl = vec2(length(dFdx(vClayP)), length(dFdy(vClayP))) * CLAY_SCALE;
  vec3 cl = clayAt(cp, max(dl.x, dl.y));
  // the modelled surface: its relief in metres (the kind's own, and the pores), in light and in its hollows
  vec4 ctx = clayDetail(vClayP / CLAY_TILE, dot(vClayN, vClayN) > 1e-8 ? normalize(vClayN) : vec3(0.0, 1.0, 0.0));
  float cset = CLAY_SET == 0 ? ctx.r : CLAY_SET == 1 ? ctx.g : CLAY_SET == 2 ? ctx.b : ctx.a; // (3: the pores alone — cotton's fibres)
  float chm = ((cset - 0.5) * 2.0 + (ctx.a - 0.5) * 0.35) * CLAY_AMP;
  vec2 dlr = dl / CLAY_SCALE;
  gClaySlope = clamp(vec2(dFdx(cl.x), dFdy(cl.x)) / max(dl, vec2(1e-5)) * CLAY_RELIEF + vec2(dFdx(chm), dFdy(chm)) / max(dlr, vec2(1e-5)), -0.85, 0.85); // (the sets: CLAY_RELIEF, worked harder)
  gClayDark = cl.y;
  diffuseColor.rgb *= (1.0 - CLAY_CAV * gClayCavK * (smoothstep(0.5, 0.12, cset) + 0.5 * smoothstep(0.5, 0.2, ctx.a))) * (1.0 + CLAY_CAV * gClayCavK * 0.25 * smoothstep(0.55, 0.85, cset));
  // the colour never quite even: kneaded by hand, a little marbled
  float mb = clayNoise(vec3(cp.x * 1.1, cp.y * 2.2, cp.z * 1.1) + 3.1);
  diffuseColor.rgb *= (0.95 + 0.1 * mb * CLAY_TONE) * (1.0 - cl.y * CLAY_TONE);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.86) * (0.6 + 0.4 * clayHash(floor(cp / 0.06))), cl.z * 0.7);
}
#endif
` + C.roughnessmap_fragment;
  C.roughnessmap_fragment += `
#ifdef STANDARD
roughnessFactor = mix(roughnessFactor, 0.5, 0.7); // (plasticine: a soft waxy sheen, never glossy, never dead matt)
#endif
`;
  C.metalnessmap_fragment += `
#ifdef STANDARD
metalnessFactor *= 0.15; // (nothing is metal: painted clay)
#endif
`;
  C.normal_fragment_maps += `
#ifdef STANDARD
normal = clayPerturb(- vViewPosition, normal, gClaySlope, faceDirection);
#endif
`;
  // light wraps a little round the shadow side and warms its edge (clay is not quite opaque)
  const L = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
  if (C.lights_physical_pars_fragment.includes(L)) {
    C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(L, `{
		float clayNL = dot( geometryNormal, directLight.direction );
		float clayW = saturate( ( clayNL + 0.32 ) / 1.32 );
		vec3 clayEdge = mix( vec3( 1.0 ), vec3( 1.06, 0.86, 0.74 ), smoothstep( 0.35, 0.0, abs( clayNL - 0.05 ) ) * 0.7 );
		reflectedLight.directDiffuse += clayW * clayEdge * directLight.color * BRDF_Lambert( material.diffuseColor );
	}`);
  }
}

// every box of the game (furniture, benches, bins, kiosks, a car's trim…) as a soft slab of clay: as each BoxGeometry is
// made, its corners' normals lean out along their diagonals (more on small things, hardly on a whole wall), so the light
// turns round its edges as round rounded ones — no extra triangles, the outline the same. (BoxGeometry sets 'uv' last.)
export function installPillowBoxes() {
  const setAttribute = THREE.BufferGeometry.prototype.setAttribute;
  THREE.BufferGeometry.prototype.setAttribute = function (name, attr) {
    const r = setAttribute.call(this, name, attr);
    if (name === 'uv' && this.type === 'BoxGeometry' && this.parameters) pillow(this);
    return r;
  };
}
function pillow(g) {
  const { width: w, height: h, depth: d } = g.parameters, P = g.attributes.position, N = g.attributes.normal;
  if (!P || !N) return;
  const k = 0.62 * Math.min(1, Math.max(0.12, 0.7 / Math.max(w, h, d)));
  for (let i = 0; i < P.count; i++) {
    const fx = N.getX(i), fy = N.getY(i), fz = N.getZ(i);
    const ox = Math.sign(P.getX(i)) * (1 - Math.abs(fx)), oy = Math.sign(P.getY(i)) * (1 - Math.abs(fy)), oz = Math.sign(P.getZ(i)) * (1 - Math.abs(fz));
    const nx = fx + ox * k, ny = fy + oy * k, nz = fz + oz * k, l = Math.hypot(nx, ny, nz) || 1;
    N.setXYZ(i, nx / l, ny / l, nz / l);
  }
}

// ---------------------------------------------------------------- the lens
// A real lens on a small set: what is far behind the subject goes a little soft (as in Kirby and the Rainbow Curse:
// «background blur makes everything feel appropriately tiny»). Gentle on purpose: the subject, the street ahead and
// anything nearer stay sharp (no band, no blurred foreground: the game must read as clearly as ever). Two passes
// (across, then down); the pixels round a sharp thing do not take its colour.
export const ClayLens = {
  defines: { TAPS: 8, LENS_FROM: PLASTILINA.lens.from.toFixed(2), LENS_TO: PLASTILINA.lens.to.toFixed(2) },
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1280, 720) },
    uNear: { value: 0.25 }, uFar: { value: 4200 }, uFocus: { value: 6 }, uFocusUV: { value: new THREE.Vector2(0.5, 0.5) }, uMaxR: { value: 4 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uDir, uRes, uFocusUV; uniform float uNear, uFar, uFocus, uMaxR;
    varying vec2 vUv;
    float viewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    // (a macro lens on a miniature: what lies far behind the subject softens, and so does what is right under the lens —
    // the bottom of the picture a little, as in the user's pictures)
    float coc(vec2 uv, float F) { float z = viewZ(texture2D(tDepth, uv).x); return max(smoothstep(F * LENS_FROM, F * LENS_TO, z), (1.0 - smoothstep(F * 0.28, F * 0.55, z)) * 0.55); }
    void main() {
      float F = uFocus > 0.0 ? uFocus : viewZ(texture2D(tDepth, uFocusUV).x);
      F = clamp(F, 1.5, 60.0);
      float c0 = coc(vUv, F), r = c0 * uMaxR;
      vec4 acc = texture2D(tDiffuse, vUv); float ws = 1.0;
      if (r > 0.35) {
        for (int i = 1; i <= TAPS; i++) {
          float t = float(i) / float(TAPS), w = exp(-t * t * 2.0);
          for (int s = -1; s <= 1; s += 2) {
            vec2 uv = vUv + uDir * (float(s) * t * r) / uRes;
            float ww = w * clamp(coc(uv, F) * 1.6, 0.0, 1.0);
            acc += texture2D(tDiffuse, uv) * ww; ws += ww;
          }
        }
      }
      gl_FragColor = acc / ws;
    }`,
};

// ---------------------------------------------------------------- stop motion
// (one for the whole game: the characters, the dogs and the cars register with it as they are made)
// The puppets keep each pose for 1/12 s: every frame the game moves them as always (so nothing it computes changes);
// before the picture is drawn, those that are not due a new pose are put back as they were at the last one, and
// after it they get their live state again. A puppet is a node tree (a character's group with its bones, a dog…).
export class StopMotion {
  constructor(fps = PLASTILINA.fps) {
    this.dt = 1 / fps;
    this.acc = 0;
    this.tick = true;
    this.items = new Map(); // root -> { nodes, held, live, jit, n }
    this.ticks = 0;
  }
  add(root) { this.items.set(root, { nodes: null, held: null, live: null, jit: null, n: -1 }); }
  // (the protagonist is taken off: it is posed every frame and drawn where it is, as fluid as the camera that follows it)
  remove(root) { this.items.delete(root); }
  // once a frame, with the frame's real time: is this frame a new pose?
  advance(dt) {
    this.acc += dt;
    this.tick = this.acc >= this.dt;
    if (this.tick) {
      this.acc = Math.min(this.acc - this.dt, this.dt);
      this.ticks++;
      if (PLASTILINA.boil) { PLASTILINA.boil.x = Math.random() * 2 - 1; PLASTILINA.boil.y = Math.random() * 2 - 1; }
    }
    return this.tick;
  }
  // the time the shaders see (trees in the wind, water, clouds): it too moves pose by pose
  time(t) { return Math.floor(t / this.dt) * this.dt; }
  nodesOf(root) {
    const list = [];
    root.traverse((o) => { if (o.matrixAutoUpdate !== false) list.push(o); });
    return list;
  }
  static capture(nodes, arr) {
    const a = arr && arr.length === nodes.length * 10 ? arr : new Float32Array(nodes.length * 10);
    for (let i = 0; i < nodes.length; i++) {
      const o = nodes[i], k = i * 10;
      a[k] = o.position.x; a[k + 1] = o.position.y; a[k + 2] = o.position.z;
      a[k + 3] = o.quaternion.x; a[k + 4] = o.quaternion.y; a[k + 5] = o.quaternion.z; a[k + 6] = o.quaternion.w;
      a[k + 7] = o.scale.x; a[k + 8] = o.scale.y; a[k + 9] = o.scale.z;
    }
    return a;
  }
  static apply(nodes, a) {
    for (let i = 0; i < nodes.length; i++) {
      const o = nodes[i], k = i * 10;
      o.position.set(a[k], a[k + 1], a[k + 2]);
      o.quaternion.set(a[k + 3], a[k + 4], a[k + 5], a[k + 6]);
      o.scale.set(a[k + 7], a[k + 8], a[k + 9]);
    }
  }
  // before drawing: the puppets not due a new pose go back to their last one — and every puppet sits where the
  // animator's hand put it this pose: a few millimetres and a fraction of a degree off (PLASTILINA.jitter)
  hold() {
    this.swapped = false;
    const J = PLASTILINA.jitter;
    for (const [root, it] of this.items) {
      if (!root.parent || !root.visible) { it.held = null; continue; }
      // (the node list is gathered again when the tree changes: a hat put on, a level of detail swapped)
      let count = 0; root.traverse(() => count++);
      if (!it.nodes || count !== it.n) { it.nodes = this.nodesOf(root); it.n = count; it.held = null; }
      const newPose = this.tick || !it.held;
      if (newPose) {
        it.held = StopMotion.capture(it.nodes, it.held);
        it.jit = [(Math.random() - 0.5) * 2 * J.pos, (Math.random() - 0.5) * 2 * J.pos, (Math.random() - 0.5) * 2 * J.yaw];
      }
      it.live = StopMotion.capture(it.nodes, it.live);
      if (!newPose) StopMotion.apply(it.nodes, it.held);
      if (it.jit && it.nodes[0] === root) { root.position.x += it.jit[0]; root.position.z += it.jit[1]; root.rotateY(it.jit[2]); } // (put back after the picture: release)
      it.swapped = true; this.swapped = true;
    }
  }
  // after drawing: the live state again, for the game to carry on from
  release() {
    if (!this.swapped) return;
    for (const it of this.items.values()) if (it.swapped) { StopMotion.apply(it.nodes, it.live); it.swapped = false; }
    this.swapped = false;
  }
}

export const SM = new StopMotion();
// the protagonist's clay does not boil: its own, still copy of the boil uniform (characters.js / hero.js)
export const STEADY_BOIL = { value: { x: 0, y: 0 } };
