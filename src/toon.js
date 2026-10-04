// The anime look (after the web game Messenger): two tones of light with a clean terminator and hard shadows, a flat
// cool ambient, textures repainted as flat colour with ink lines, and in a last pass the outlines of everything drawn
// from the depth buffer, a little uneven like a pen, then a soft grade. Only used when STYLE.anime.
import * as THREE from 'three';

// ------------------------------------------------------------ light: patched into three's own shader chunks, so
// every lit material of the game (buildings, ground, props, cars, characters, trees) gets it at once. Installed
// before anything compiles.
const TOON_GLSL = `
float toonStep(float x) { float w = clamp(fwidth(x) * 0.75, 0.012, 0.2); return smoothstep(0.03 - w, 0.03 + w, x); }
float toonShadow(float s) { return smoothstep(0.38, 0.62, s); }
vec3 toonSpec(vec3 s, float r) { float m = max(max(s.r, s.g), s.b); float w = clamp(fwidth(m), 0.02, 0.4); return vec3(smoothstep(0.75 - w, 0.75 + w, m) * 0.6 * (1.0 - smoothstep(0.28, 0.5, r))); }
vec3 toonAmbN(vec3 n) { vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); return normalize(mix(n, up, 0.72)); }
`;
let installed = false;
function swap(src, a, b, name) {
  if (!src.includes(a)) { console.warn('toon: chunk changed, not patched:', name); return src; }
  return src.split(a).join(b);
}
export function installToonChunks() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  // helpers first; the sky and the ground light a surface almost evenly whichever way it faces
  C.lights_pars_begin = TOON_GLSL + swap(C.lights_pars_begin, 'float hemiDiffuseWeight = 0.5 * dotNL + 0.5;', 'float hemiDiffuseWeight = 0.64 + 0.2 * dotNL;', 'hemi');
  // direct light: lit or not, a narrow soft edge between; a highlight only on shiny things, and a hard one
  const NL = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
  const NLt = 'float dotNL = toonStep( dot( geometryNormal, directLight.direction ) );';
  C.lights_physical_pars_fragment = swap(swap(C.lights_physical_pars_fragment, NL, NLt, 'physical NL'),
    'reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );',
    'reflectedLight.directSpecular += irradiance * toonSpec( BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material ), material.roughness );', 'physical spec');
  C.lights_lambert_pars_fragment = swap(C.lights_lambert_pars_fragment, NL, NLt, 'lambert NL');
  C.lights_phong_pars_fragment = swap(C.lights_phong_pars_fragment, NL, NLt, 'phong NL');
  // light falls on the surface as modelled, not on its bumps (a two-tone light turns every bump into a blot)
  C.lights_fragment_begin = swap(C.lights_fragment_begin, 'vec3 geometryNormal = normal;', '#ifdef TOON_KEEP_NORMALS\nvec3 geometryNormal = normal;\n#else\nvec3 geometryNormal = normalize( mix( normal, nonPerturbedNormal, 0.92 ) );\n#endif', 'geometry normal');
  // cast shadows with a clean edge (the soft filter only keeps it from stair-stepping)
  C.lights_fragment_begin = swap(swap(C.lights_fragment_begin,
    '? getShadow( directionalShadowMap[ i ],', '? toonShadow( getShadow( directionalShadowMap[ i ],', 'dir shadow a'),
    'vDirectionalShadowCoord[ i ] ) : 1.0;', 'vDirectionalShadowCoord[ i ] ) ) : 1.0;', 'dir shadow b');
  // what is drawn straight to the screen (the first-person gun) gets the same roll-off as the last pass
  C.tonemapping_pars_fragment = swap(C.tonemapping_pars_fragment, 'vec3 CustomToneMapping( vec3 color ) { return color; }', 'vec3 CustomToneMapping( vec3 color ) { return ( 1.0 - exp( - color * toneMappingExposure * 1.6 ) ) * 1.02; }', 'custom tone map');
  // the sky's light (IBL) mostly from above too, whichever way the surface faces
  C.lights_fragment_maps = swap(C.lights_fragment_maps, 'iblIrradiance += getIBLIrradiance( geometryNormal );', 'iblIrradiance += getIBLIrradiance( toonAmbN( geometryNormal ) );', 'ibl');
}
// the lens of the last pass: where a point of the rendered picture (uv 0..1) ends up on the screen — for what is drawn
// over it (speech bubbles, marks). It was a fish-eye (k 0.2, the reference's little planet); players found that it bent
// whatever was ahead as they moved or turned, so it is flat now
export const LENS = { k: 0 };
export function lensMap(u, v) {
  const sx = u - 0.5, sy = v - 0.5;
  let ox = sx, oy = sy;
  for (let i = 0; i < 4; i++) { const f = 1 - LENS.k * (0.5 - (ox * ox + oy * oy)); ox = sx / f; oy = sy / f; }
  return [0.5 + ox, 0.5 + oy];
}

// ------------------------------------------------------------ textures: repainted as flat colour with ink lines.
// Each layer of an RGBA texture array (sRGB bytes) is smoothed (the grain of plaster, asphalt or stone goes), its
// light softly quantised into a few flat tones, and wherever it has a real edge (a brick, a tile joint, a window
// frame, the border of a pane in the alpha) a dark line is drawn. Alpha is kept.
function boxBlur(src, dst, tmp, S, r) { // wraps round (the textures tile)
  if (r < 1) { dst.set(src); return; }
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
export function toonifyLayers(data, S, layers, o = {}) {
  const k = S / 512;
  const rCol = Math.max(1, Math.round((o.rColor ?? 4) * k)), rEdge = Math.max(0, Math.round((o.rEdge ?? 1) * k));
  const levels = o.levels ?? 6, post = o.posterize ?? 0.8, ink = o.ink ?? 0.55, e0 = o.edge0 ?? 16, e1 = o.edge1 ?? 34, aInk = o.alphaInk ?? 0.7;
  const sat = o.saturation ?? 1.0, split = o.split ?? 191;
  const N = S * S;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), L = new Float32Array(N), A = new Float32Array(N);
  const Rb = new Float32Array(N), Gb = new Float32Array(N), Bb = new Float32Array(N), Le = new Float32Array(N), tmp = new Float32Array(N);
  for (let l = 0; l < layers; l++) {
    const off = l * N * 4;
    for (let i = 0, j = off; i < N; i++, j += 4) {
      R[i] = data[j]; G[i] = data[j + 1]; B[i] = data[j + 2];
      L[i] = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
      A[i] = data[j + 3] >= split ? 255 : 0;
    }
    boxBlur(R, Rb, tmp, S, rCol); boxBlur(G, Gb, tmp, S, rCol); boxBlur(B, Bb, tmp, S, rCol);
    boxBlur(L, Le, tmp, S, rEdge);
    for (let y = 0; y < S; y++) {
      const ym = ((y - 1 + S) % S) * S, y0 = y * S, yp = ((y + 1) % S) * S;
      for (let x = 0; x < S; x++) {
        const xm = (x - 1 + S) % S, xp = (x + 1) % S, i = y0 + x;
        // the flat colour: smoothed, its brightness pulled onto a few tones (soft steps, so no hard banding)
        let r = Rb[i], g = Gb[i], b = Bb[i];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum > 1) {
          const t = (lum / 255) * levels, f = t - Math.floor(t), s = f < 0.3 ? 0 : f > 0.7 ? 1 : (f - 0.3) / 0.4;
          const q = ((Math.floor(t) + s * s * (3 - 2 * s)) / levels) * 255;
          const m = 1 + (q / lum - 1) * post;
          r *= m; g *= m; b *= m;
        }
        if (sat !== 1) { const lm = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = lm + (r - lm) * sat; g = lm + (g - lm) * sat; b = lm + (b - lm) * sat; }
        // ink where the picture has an edge (Sobel on the lightly smoothed light) or where the alpha class changes
        const gx = Le[ym + xp] + 2 * Le[y0 + xp] + Le[yp + xp] - Le[ym + xm] - 2 * Le[y0 + xm] - Le[yp + xm];
        const gy = Le[yp + xm] + 2 * Le[yp + x] + Le[yp + xp] - Le[ym + xm] - 2 * Le[ym + x] - Le[ym + xp];
        const mag = Math.sqrt(gx * gx + gy * gy) * 0.25;
        let e = mag <= e0 ? 0 : mag >= e1 ? 1 : (mag - e0) / (e1 - e0);
        const ac = A[i];
        if (A[y0 + xm] !== ac || A[y0 + xp] !== ac || A[ym + x] !== ac || A[yp + x] !== ac) e = Math.max(e, aInk);
        const d = 1 - e * ink;
        const j = off + i * 4;
        data[j] = Math.max(0, Math.min(255, r * d));
        data[j + 1] = Math.max(0, Math.min(255, g * d));
        data[j + 2] = Math.max(0, Math.min(255, b * d * 1.02 + e * ink * 6));
      }
    }
    if (o.grunge) grunge(data, off, S, A, l, o.grunge);
  }
  return data;
}
// the wear a background painter draws in: stains with a drawn edge (damp, moss, soot) and now and then a crack,
// only on the wall itself (never across a pane)
function grunge(data, off, S, A, layer, amount) {
  let sd = (layer * 2654435761 + 12345) >>> 0;
  const rnd = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  const G = 8, grid = Array.from({ length: G * G }, rnd), grid2 = Array.from({ length: 16 * 16 }, rnd);
  const vnoise = (u, v, g, n) => { // periodic value noise over the tile
    const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
  };
  if (rnd() > 0.45 + amount * 0.25) return; // (most walls are clean)
  const th = 0.86 - amount * 0.05, tint = rnd() < 0.5 ? [0.95, 0.965, 0.93] : [0.95, 0.94, 0.915]; // (moss-green or soot-brown)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (A[i] < 128) continue;
    const n = vnoise(x / S, y / S, grid, G) * 0.72 + vnoise(x / S, y / S, grid2, 16) * 0.28;
    if (n < th - 0.012) continue;
    const j = off + i * 4, edge = n < th - 0.004;
    const k = edge ? [0.8, 0.81, 0.84] : tint;
    data[j] *= k[0]; data[j + 1] *= k[1]; data[j + 2] *= k[2];
  }
  const cracks = rnd() < 0.55 * amount ? 1 + Math.floor(rnd() * 2) : 0;
  for (let c = 0; c < cracks; c++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    const len = (0.06 + rnd() * 0.12) * S;
    for (let t = 0; t < len; t += 1) {
      a += (rnd() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a);
      const xi = ((Math.round(x) % S) + S) % S, yi = ((Math.round(y) % S) + S) % S, i = yi * S + xi;
      if (A[i] < 128) break;
      const j = off + i * 4; data[j] *= 0.42; data[j + 1] *= 0.44; data[j + 2] *= 0.5;
      if (rnd() < 0.04) a += (rnd() < 0.5 ? -1 : 1) * 0.9; // (a kink)
    }
  }
}
// the same for a canvas (signs, posters, painted cards): smoothed a little and flattened, no lines
export function toonifyCanvas(cv, o = {}) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height;
  if (w !== h || w < 16) return cv;
  const id = x.getImageData(0, 0, w, h);
  toonifyLayers(id.data, w, 1, { rColor: 1, rEdge: 1, ink: 0.35, ...o });
  x.putImageData(id, 0, 0);
  return cv;
}

// the looks of the last pass (Ajustes › Estética): the manga of the game and the watercolour of the dehesa
export const LOOKS = [
  { id: 'manga', name: 'Manga' },
  { id: 'acuarela', name: 'Acuarela de dehesa' },
];
// ------------------------------------------------------------ the last pass: outlines, grade, output
const POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const POST_FS = `
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uLine; uniform float uExposure;
uniform float uFadeN; uniform float uFadeF; uniform float uNight; uniform float uTime; uniform float uInkK;
uniform vec3 uLift; uniform float uSat; uniform float uDebug; uniform float uBarrel; uniform float uVig; uniform float uStyle;
varying vec2 vUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float vz(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float iz(vec2 uv) { return 1.0 / vz(texture2D(tDepth, uv).r); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// light to colour: exposure, a soft shoulder, a little lift in the shadows towards the teal of the sky
vec3 gradeC(vec3 c) {
  c *= uExposure;
  c = (1.0 - exp(-c * 1.6)) * 1.02;                                 // (a film's roll-off: whites stay paper, never glare)
  float lm = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lm), c, uSat);
  c = c + uLift * (1.0 - smoothstep(0.0, 0.6, lm)) * (1.0 - uNight * 0.7);
  return mix(c, c * vec3(0.8, 0.88, 1.1), uNight * 0.5);             // (night leans blue)
}
// ---- «Acuarela de la dehesa» (uStyle 1), from the picture on screen in display colour: washes over white cold-pressed
//      paper, the pigment pooling where colours meet, granulating in the flats, the paper left bare for the brightest
//      light, a pencil line under it all
float lumi(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 dispAt(vec2 uv) { return srgb(clamp(gradeC(texture2D(tColor, uv).rgb), 0.0, 1.0)); }
vec3 sAcuarela(vec2 uv, vec2 px, float e, vec2 fp) {
  vec2 w = (vec2(vn(fp / 50.0), vn(fp / 50.0 + 9.0)) - 0.5) * 8.0 * px;   // (the wash wanders off the drawing a little)
  vec3 c0 = dispAt(uv + w), b = c0 * 2.0;
  for (int k = 0; k < 8; k++) { float a = float(k) * 0.7854 + 0.3; b += dispAt(uv + w + vec2(cos(a), sin(a)) * 7.0 * px); }
  b /= 10.0;
  b = 1.0 - (1.0 - b) * 0.78;                                    // watercolour values: lighter, softer
  b = mix(vec3(lumi(b)), b, 0.9);
  float edge = clamp(length(c0 - b) * 2.6, 0.0, 1.0);
  vec3 pig = b * (1.0 - 0.32 * edge);                            // the wet edge where one wash meets another
  float gr = vn(fp / 2.0) * 0.5 + vn(fp / 5.0) * 0.3 + vn(fp / 13.0) * 0.2;
  pig *= 1.0 - 0.14 * gr * (1.0 - abs(lumi(b) - 0.55) * 2.0);     // (granulation in the half-tones)
  pig = mix(pig, vec3(0.985, 0.978, 0.955), smoothstep(0.78, 0.95, lumi(b)) * 0.8); // the bare paper for the lights
  pig *= 0.95 + 0.06 * vn(fp / 1.3);
  return mix(pig, vec3(0.38, 0.37, 0.42), clamp(e * 0.33, 0.0, 1.0));   // a light pencil under it all
}
void main() {
  vec2 px = 1.0 / uRes;
  // a pen, not a ruler: the lines wander a pixel here and there and swell and thin along their length. (The depth is
  // read texel by texel, so the neighbourhood stays symmetric on whole texels — else every slope reads as a crease.)
  // a wide lens: the middle of the picture a touch bigger, its edges drawn in (a gentle fish-eye)
  vec2 st = vUv - 0.5;
  vec2 vUvL = 0.5 + st * (1.0 - uBarrel * (0.5 - dot(st, st)));
  #define vUv vUvL
  vec2 q = vUv * uRes / 34.0;
  vec2 wob = (vec2(vn(q + 3.7), vn(q + 11.3)) - 0.5) * 1.7;
  float thick = 0.8 + 0.45 * vn(vUv * uRes / 23.0 + 5.1);
  vec2 uv = (floor(vUv * uRes + wob) + 0.5) * px;
  vec2 o = px * max(1.0, floor(uLine + 0.5));
  float d0 = texture2D(tDepth, uv).r;
  float z0 = vz(d0), i0 = 1.0 / z0;
  float il = iz(uv - vec2(o.x, 0.0)), ir = iz(uv + vec2(o.x, 0.0)), idn = iz(uv - vec2(0.0, o.y)), iup = iz(uv + vec2(0.0, o.y));
  float ia = iz(uv + o), ib = iz(uv - o), ic = iz(uv + vec2(o.x, -o.y)), id2 = iz(uv + vec2(-o.x, o.y));
  float zn = 1.0 / max(max(max(il, ir), max(idn, iup)), i0); // the nearest of the neighbourhood owns the line
  // how far 1/z departs from a plane through the neighbourhood (0 on any flat surface; creases and silhouettes)
  float lap = abs(il + ir - 2.0 * i0) + abs(idn + iup - 2.0 * i0) + 0.6 * (abs(ia + ib - 2.0 * i0) + abs(ic + id2 - 2.0 * i0));
  float rel = lap / max(i0, 1e-6);
  float sil = smoothstep(0.03 / thick, 0.1 / thick, rel);          // one thing in front of another
  float crease = smoothstep(0.0065 / thick, 0.014 / thick, rel) * 0.95; // a corner, a step, a fold (not a facet)
  // the outer contour of a thing against what is behind it gets a bolder stroke, on its own side (a manga outline)
  vec2 o2 = o * 3.0;
  float ja = iz(uv + vec2(o2.x, 0.0)), jb = iz(uv - vec2(o2.x, 0.0)), jc = iz(uv + vec2(0.0, o2.y)), jd = iz(uv - vec2(0.0, o2.y));
  float jump = max(max(i0 - ja, i0 - jb), max(i0 - jc, i0 - jd)) / max(i0, 1e-6);
  float bold = smoothstep(0.14, 0.4, jump) * step(d0, 0.99999);
  float e = max(max(sil, crease), bold);
  float fade = 1.0 - smoothstep(uFadeN, uFadeF, zn);
  e *= fade;                                                        // far away the lines fade out
  // (no pen skips: on thin things — railings, spokes, cables — each gap showed the light behind as a white speck)
  if (d0 >= 0.99999 && zn > uFar * 0.98) e = 0.0;                  // (the sky itself)
  if (uDebug > 0.5) { gl_FragColor = vec4(uDebug < 1.5 ? vec3(rel * 200.0) : uDebug < 2.5 ? vec3(rel * 25.0, rel * 100.0, rel * 400.0) : vec3(fract(d0 * 4096.0)), 1.0); return; }
  vec3 c = texture2D(tColor, vUv).rgb;
  // at night whatever shines (lamps, windows, headlights) spreads a soft halo round it
  if (uNight > 0.02) {
    vec3 g = vec3(0.0);
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5236 + 0.26;
      vec2 dd = vec2(cos(a), sin(a)) * px * uLine;
      g += max(texture2D(tColor, vUv + dd * 5.0).rgb - 1.1, 0.0) * 0.55 + max(texture2D(tColor, vUv + dd * 13.0).rgb - 1.1, 0.0) * 0.45;
    }
    c += g * (uNight * 0.09);
  }
  c = gradeC(c);
  float vig = smoothstep(0.35, 0.95, length(st * vec2(1.0, uRes.y / uRes.x) * 1.5));
  if (uStyle < 0.5) {
    // the manga ink: a dark, slightly blue version of what it outlines
    vec3 ink = mix(c * vec3(0.16, 0.18, 0.22), vec3(0.018, 0.02, 0.03), 0.84);   // black, a breath of the colour
    ink = mix(ink, c * 0.5, uNight * 0.3);
    c = mix(c, ink, clamp(e * uInkK, 0.0, 1.0));
    c *= 1.0 - uVig * vig;                                          // (and the corners a little darker)
    gl_FragColor = vec4(srgb(clamp(c, 0.0, 1.0)), 1.0);
    return;
  }
  gl_FragColor = vec4(clamp(sAcuarela(vUv, px, e, gl_FragCoord.xy), 0.0, 1.0), 1.0);
}`;
export class ToonPipeline {
  constructor(renderer, { msaa = 4, line = 1 } = {}) {
    this.r = renderer;
    this.line = line;
    const dt = new THREE.DepthTexture(1, 1);
    dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: msaa, depthBuffer: true, stencilBuffer: false, depthTexture: dt });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.rt.texture.generateMipmaps = false;
    this.u = {
      tColor: { value: this.rt.texture }, tDepth: { value: dt }, uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.25 }, uFar: { value: 4000 }, uLine: { value: 1 }, uExposure: { value: 1 },
      uFadeN: { value: 420 }, uFadeF: { value: 1400 }, uNight: { value: 0 }, uTime: { value: 0 }, uInkK: { value: 1.0 },
      uLift: { value: new THREE.Color(0.035, 0.05, 0.06) }, uSat: { value: 0.96 }, uDebug: { value: 0 }, uBarrel: { value: LENS.k }, uVig: { value: 0.16 }, uStyle: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.w = 1; this.h = 1;
  }
  setSize(w, h) {
    const pr = this.r.getPixelRatio();
    const W = Math.max(1, Math.round(w * pr)), H = Math.max(1, Math.round(h * pr));
    this.w = W; this.h = H;
    this.rt.setSize(W, H);
    this.u.uRes.value.set(W, H);
    // lines keep their weight on the screen whatever its resolution (about a pixel and a half on 1080 lines)
    this.u.uLine.value = this.line * Math.max(0.8, H / 900);
  }
  render(scene, camera, { night = 0, exposure = 1, overlay = null } = {}) {
    const r = this.r;
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    if (overlay) overlay(r); // (the first-person gun: into the same frame, so it gets its lines and grade too)
    r.setRenderTarget(prevTarget);
    this.u.uNear.value = camera.near; this.u.uFar.value = camera.far;
    this.u.uNight.value = night; this.u.uExposure.value = exposure;
    this.u.uTime.value = performance.now() / 1000;
    const at = r.autoClear; r.autoClear = false;
    r.render(this.qScene, this.qCam);
    r.autoClear = at;
  }
  // the look (see LOOKS): 0 manga, 1 acuarela; anything else saved before falls back to the manga
  setLook(id) { const i = LOOKS.findIndex((l) => l.id === id); this.u.uStyle.value = Math.max(0, i); this.look = LOOKS[Math.max(0, i)].id; }
  dispose() { this.rt.dispose(); this.mat.dispose(); }
}
