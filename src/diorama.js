// «Diorama extremeño» — the central settings of the diorama look (Ajustes › Estética › Diorama), after the visual spec
// of 4 October 2026: warm stylized realism with the finish of a crafted architectural model. One place for the palette,
// the families of materials, the contact shadows and the final grade; the sky and the sun keep theirs in sky.js
// (KEYS_DIORAMA), the façades theirs in textures.js (DIORAMA_DEF) and buildings.js (tints).
//
// The palette is the spec's (a starting point for production, tuned by eye against its three reference renders):
// ivory whitewash, cream, toasted-ochre plinths, terracotta, deep green doors, warm charcoal iron, sand pavements, warm
// grey asphalt, olive and dark greens, geranium red, a soft blue sky.
import * as THREE from 'three';

export const PALETTE = {
  cal: '#f0e5cd', crema: '#e2d2b5', zocalo: '#be793c', teja: '#ab573a', verde: '#354d3d', hierro: '#30322d',
  acera: '#c4ad87', asfalto: '#56544d', oliva: '#637648', verdeOscuro: '#3d5536', geranio: '#bd4e43', cielo: '#8cb8d6',
};

// families of materials: roughness ranges for a PBR renderer (0..1), from the spec
export const ROUGH = { cal: [0.85, 0.95], teja: [0.7, 0.9], piedra: [0.8, 1.0], asfalto: [0.8, 1.0], metal: [0.55, 0.8] };

export const DIORAMA = {
  // contact shadows: ambient occlusion where things meet (the foot of a wall, under eaves, balconies, pots, people)
  ao: { radius: 2.0, distanceExponent: 1.0, thickness: 2.5, scale: 1.7, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false },
  aoDenoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 },
  aoBlend: 1.0,
};

// the last grade, in linear light before the tone curve: a little more colour, the white balance of a warm afternoon,
// a touch of contrast round the middle greys (the model's light, not a filter: no outlines, no grain, no wash)
export const DioramaGrade = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.04 }, uWarm: { value: 0.03 }, uContrast: { value: 1.04 }, uLift: { value: 0 }, uVignette: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uWarm, uContrast, uLift, uVignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = max(c.rgb, 0.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm * 0.7);
      float k = pow(max(l, 1e-4) / 0.18, uContrast - 1.0);
      col *= clamp(k, 0.6, 1.6);
      col += uLift * vec3(0.2, 0.15, 0.1) * (1.0 - smoothstep(0.0, 0.3, l)); // (warm light in the shadows: a lit model)
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(1.25, 1.0)));
      gl_FragColor = vec4(col, c.a);
    }`,
};

// ================================================================ «Miniatura»
// The same town as a handmade miniature photographed with a macro lens (Ajustes › Estética › Miniatura, built on the
// diorama): a tilt-shift — a narrow band in focus across the picture, a strong blur before and behind it —, a golden
// hour all day, warm saturated colours (terracotta, cream, orange, sky blue), every surface modelling clay with a
// soft sheen and thumbprints, and stop motion: the picture changes 12 times a second (the game itself runs on as
// always: the same camera, the same people, the same action).
export const MINIATURA = {
  fps: 12,
  grade: { sat: 1.24, warm: 0.065, contrast: 1.1, lift: 0.035, vignette: 0.3 },
  // the lens: the band in focus (half height, as a part of the picture) and its soft edge; the depth of field round the
  // subject (as a part of its distance); the largest blur (as a part of the picture's height)
  tilt: { band: 0.09, soft: 0.2, range: 0.2, maxR: 0.021 },
  sun: { maxElev: 0.55, col: [1.0, 0.74, 0.5], push: 0.55 }, // the golden hour: the sun never above ~31° (it still gets into the streets), warmer
  boil: null, // (set by installClayChunks: the stop-motion frame's own little differences in the clay)
  tick() { if (this.boil) { this.boil.x = Math.random() * 2 - 1; this.boil.y = Math.random() * 2 - 1; } },
};

// the tilt-shift, one direction per pass (run across, then down). The blur of each pixel grows with how far it lies
// from the band in focus and from the subject's distance; the pixels around a sharp thing do not take its colour.
export const TiltShift = {
  defines: { TAPS: 10 },
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1280, 720) },
    uNear: { value: 0.25 }, uFar: { value: 4200 }, uFocus: { value: 6 }, uFocusUV: { value: new THREE.Vector2(0.5, 0.5) },
    uRange: { value: 0.2 }, uMaxR: { value: 15 }, uBandY: { value: 0.45 }, uBand: { value: 0.09 }, uSoft: { value: 0.2 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uDir, uRes, uFocusUV;
    uniform float uNear, uFar, uFocus, uRange, uMaxR, uBandY, uBand, uSoft;
    varying vec2 vUv;
    float viewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float coc(vec2 uv, float F) {
      float band = smoothstep(uBand, uBand + uSoft, abs(uv.y - uBandY));
    #ifdef NO_DEPTH
      return band;
    #else
      float dz = smoothstep(uRange * 0.35, uRange * 2.4, abs(viewZ(texture2D(tDepth, uv).x) - F) / F);
      return clamp(max(dz * 0.9, band), 0.0, 1.0);
    #endif
    }
    void main() {
    #ifdef NO_DEPTH
      float F = 1.0;
    #else
      float F = uFocus > 0.0 ? uFocus : viewZ(texture2D(tDepth, uFocusUV).x); // (first person: focus where you look)
    #endif
      float c0 = coc(vUv, F), r = c0 * uMaxR;
      vec4 acc = texture2D(tDiffuse, vUv); float ws = 1.0;
      if (r > 0.35) {
        for (int i = 1; i <= TAPS; i++) {
          float t = float(i) / float(TAPS), w = exp(-t * t * 2.2);
          for (int s = -1; s <= 1; s += 2) {
            vec2 uv = vUv + uDir * (float(s) * t * r) / uRes;
            float ww = w * clamp(coc(uv, F) * 1.7, 0.0, 1.0);
            acc += texture2D(tDiffuse, uv) * ww; ws += ww;
          }
        }
      }
      gl_FragColor = acc / ws;
    }`,
};

// modelling clay on every lit surface (all the standard materials, through three.js's shader chunks, before anything
// is made): lumps from the hands that shaped it, a thumbprint here and there with its ridges (only where they are a
// few pixels wide: no shimmer far off), colour never quite even, a soft waxy sheen, nothing metallic. The pattern is
// fixed to each thing's own shape (its vertices before skinning), so it travels with the cars and the people.
export function installClayChunks() {
  const C = THREE.ShaderChunk;
  const boil = { value: { x: 0, y: 0 } }; // one plain object for every material (three.js shares it, it does not clone it)
  for (const lib of ['standard', 'physical']) THREE.ShaderLib[lib].uniforms.uClayBoil = boil;
  MINIATURA.boil = boil.value;
  C.common += `
#ifdef STANDARD
varying vec3 vClayP;
#endif
`;
  C.begin_vertex += `
#ifdef STANDARD
vClayP = position;
#endif
`;
  C.bumpmap_pars_fragment += `
#ifdef STANDARD
#ifndef CLAY_SCALE
#define CLAY_SCALE 1.0
#endif
uniform vec2 uClayBoil;
vec2 gClaySlope; float gClayDark;
float clayHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float clayNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clayHash(i), clayHash(i + vec3(1, 0, 0)), f.x), mix(clayHash(i + vec3(0, 1, 0)), clayHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(clayHash(i + vec3(0, 0, 1)), clayHash(i + vec3(1, 0, 1)), f.x), mix(clayHash(i + vec3(0, 1, 1)), clayHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// the clay at p (px: metres per pixel there): x its height (metres), y how much darker it is there (the hollows, the
// grooves of a print, a little grime from the thumb)
vec2 clayAt(vec3 p, float px) {
  float n1 = clayNoise(p * 1.7) - 0.5, n2 = (clayNoise(p * 5.0 + 7.0) - 0.5) * (1.0 - smoothstep(0.03, 0.08, px));
  float h = n1 * 0.06 + n2 * 0.016, dark = max(0.0, -n1) * 0.12;
  // thumbprints: big enough to be seen at play distance (a thumb on a figure a hand high), one in most cells of 0.6 m
  vec3 c = floor(p / 0.6);
  if (clayHash(c + 17.0) < 0.72) {
    vec3 q = p - (c + 0.34 + 0.32 * vec3(clayHash(c + 3.1), clayHash(c + 5.7), clayHash(c + 9.3))) * 0.6;
    vec3 ax = normalize(vec3(clayHash(c + 1.3), clayHash(c + 2.9), clayHash(c + 4.4)) - 0.5);
    float d = length(q - ax * dot(q, ax) * 0.3), R = 0.16 + 0.04 * clayHash(c + 8.8);
    float m = 1.0 - smoothstep(R * 0.5, R, d);
    float rf = 1.0 - smoothstep(0.012, 0.025, px); // (the ridges only where they are a few pixels apart)
    float ridges = 0.5 + 0.5 * cos(6.2832 * (d / 0.05 + 0.6 * clayNoise(p * 7.0 + c)));
    h += m * (-0.01 + 0.004 * ridges * rf);
    dark += m * (0.07 + 0.2 * (1.0 - ridges) * rf);
  }
  return vec2(h, dark);
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
  C.color_fragment += `
#ifdef STANDARD
{
  // (CLAY_SCALE: the figures, a hand high, take their thumbprints smaller)
  vec3 cp = vClayP * CLAY_SCALE + vec3(uClayBoil.x, uClayBoil.y, uClayBoil.x * 0.7) * 0.004; // (each stop-motion frame, retouched)
  vec2 dl = vec2(length(dFdx(vClayP)), length(dFdy(vClayP))) * CLAY_SCALE;
  vec2 cl = clayAt(cp, max(dl.x, dl.y));
  gClaySlope = clamp(vec2(dFdx(cl.x), dFdy(cl.x)) / max(dl, vec2(1e-5)), -0.7, 0.7);
  gClayDark = cl.y;
  diffuseColor.rgb *= (0.94 + 0.12 * clayNoise(vClayP * 1.7 + 3.1)) * (1.0 - cl.y);
}
#endif
`;
  C.roughnessmap_fragment += `
#ifdef STANDARD
roughnessFactor = mix(roughnessFactor, 0.44, 0.65);
#endif
`;
  C.metalnessmap_fragment += `
#ifdef STANDARD
metalnessFactor *= 0.25;
#endif
`;
  C.normal_fragment_maps += `
#ifdef STANDARD
normal = clayPerturb(- vViewPosition, normal, gClaySlope, faceDirection);
#endif
`;
}
