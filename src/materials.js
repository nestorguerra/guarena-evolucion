// Shared materials & shader patches (texture arrays for facades and ground, wind for trees, night lighting).
import * as THREE from 'three';
import { STYLE } from './style.js';

export const shared = {
  uNight: { value: 0 },      // 0 day .. 1 full night
  uNightLit: { value: 0.35 },// fraction of windows lit
  uTime: { value: 0 },
  uWind: { value: 1 },
  uWinDark: { value: 0 },  // 1 = power cut: windows show no lit rooms
  uNearDist: { value: 0 }, // radius (m) where the facade fills turn into glass because the 3D details are there
  // the 16 street lamps nearest to the camera (xyz + strength): cheap fake point lights on walls and details at night
  uLamps: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, -100, 0, 0)) },
};
// a soft, wide falloff (a lamp still reaches the houses across the street), warm light, capped so walls never burn white
const LAMPS_GLSL = `
uniform vec4 uLamps[16];
vec3 lampLight(vec3 P, vec3 N) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    vec3 d = L.xyz - P;
    float dd = dot(d, d);
    float ndl = max(dot(N, d * inversesqrt(dd + 1e-4)), 0.0);
    acc += L.w * (0.3 + 0.7 * ndl) / (1.0 + dd * 0.07) * (1.0 - smoothstep(120.0, 560.0, dd));
  }
  acc = acc / (1.0 + acc * 0.9); // soft shoulder instead of a hard clip
  return acc * vec3(1.0, 0.76, 0.52);
}`;
const ROOF_BASE_VALUE = 64; // FACADE_STYLES.length * FACADE_LAYERS_PER_STYLE (see textures.js)

const HASH = `
float gHash3(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float gHash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float gNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(gHash2(i),gHash2(i+vec2(1,0)),f.x), mix(gHash2(i+vec2(0,1)),gHash2(i+vec2(1,1)),f.x), f.y); }
`;

export function arrayTexture(data, size, layers, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Building material: walls pick floor/bay layers procedurally; windows glow at night.
// On top of the painted facades: CC0 photo-scanned materials (plaster, brick, granite, clay tiles) with normal maps,
// "interior mapping" behind every window pane (rooms with depth, furniture, lights at night) and double-sided walls
// so no gap ever lets you look through a house.
// detail = { alb, nrm, mean[], size[], on, normals }
export function makeBuildingMaterial(facadeTex, detail = null) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  if (STYLE.plastilina) m.defines = { CLAY: '', CLAY_RELIEF: '1.6', CLAY_TONE: '1.8', CLAY_SET: '0', CLAY_TILE: '2.4', CLAY_AMP: '0.062', CLAY_CAV: '0.12' }; // (a set: worked hard by hand; its marks in the colour too, for the shade and the whitewash)
  const dOn = detail && detail.on ? 1 : 0;
  const nOn = detail && detail.on && detail.normals ? 1 : 0;
  const dummy = new THREE.DataArrayTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, 1);
  dummy.needsUpdate = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFacade = { value: facadeTex };
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uNightLit = shared.uNightLit;
    sh.uniforms.uDet = { value: (detail && detail.alb) || dummy };
    sh.uniforms.uDetN = { value: (detail && detail.nrm) || dummy };
    sh.uniforms.uDetOn = { value: dOn };
    sh.uniforms.uDetNOn = { value: nOn };
    sh.uniforms.uDetMean = { value: (detail && detail.mean) || [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    sh.uniforms.uDetSize = { value: (detail && detail.size) || [2, 2, 2, 2, 2, 2, 2, 2] };
    sh.uniforms.uWinDark = shared.uWinDark;
    sh.uniforms.uNearDist = shared.uNearDist;
    sh.uniforms.uLamps = shared.uLamps;
    // zócalo height & kind per style (textures.js STYLE_DEF order): stone plinths get the granite scan
    sh.uniforms.uZocH = { value: [0.95, 0.9, 1.0, 0.8, 0.6, 0.45, 1.2, 0.4] };
    sh.uniforms.uZocStone = { value: [0, 0, 1, 0, 0, 0, 0, 1] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aTex; attribute vec3 aTint; attribute vec2 aUv; attribute vec4 aRect; attribute float aWallH;
varying vec4 vTex; varying vec3 vTint; varying vec2 vUvF; varying float vWY; varying vec3 vWPos; varying vec3 vWNrm;
varying vec4 vRect; varying float vWallH;
#ifdef CLAY
attribute vec2 aEdge; varying vec2 vEdge;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTex = aTex; vTint = aTint; vUvF = aUv; vWY = position.y; vRect = aRect; vWallH = aWallH;
#ifdef CLAY
vEdge = aEdge;
#endif
vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uFacade; uniform float uNight; uniform float uNightLit;
uniform sampler2DArray uDet; uniform sampler2DArray uDetN; uniform float uDetOn; uniform float uDetNOn;
uniform float uDetMean[8]; uniform float uDetSize[8]; uniform float uWinDark; uniform float uNearDist;
uniform float uZocH[8]; uniform float uZocStone[8];
${LAMPS_GLSL}
varying vec4 vTex; varying vec3 vTint; varying vec2 vUvF; varying float vWY; varying vec3 vWPos; varying vec3 vWNrm;
varying vec4 vRect; varying float vWallH;
#ifdef CLAY
varying vec2 vEdge;
#endif
float gGlass; float gLit; float gDetK; vec2 gDetUV; float gDetL; float gRoom; vec3 gRoomCol; float gEmK; float gEave;
${HASH}
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * invmax, B * invmax, N);
}`)
      .replace('#include <map_fragment>', `
{
  // kind 0: facade cell with its layer already chosen on the CPU; 1: roof; 2: blank wall (ground/upper by floor)
  float kind = vTex.y;
  float layer = vTex.x;
  float fl = floor(vUvF.y + 1e-4), bay = floor(vUvF.x + 1e-4);
  float lt = -1.0;
  if (kind > 2.5) {
    // backyard / courtyard facade: layer picked per cell by hash (no real openings there)
    float h = gHash3(vec3(bay, fl, vTex.z * 97.0));
    layer += fl < 0.5 ? (h < 0.2 ? 1.0 : (h < 0.31 ? 2.0 : 0.0)) : (h < 0.42 ? 4.0 : 3.0);
    kind = 0.0;
  } else if (kind > 1.5) layer += (fl < 0.5 ? 5.0 : 6.0);
  if (kind < 0.5) lt = layer - 8.0 * floor(layer / 8.0 + 0.01);
  bool isRoof = kind > 0.5 && kind < 1.5;
  gEave = -9.0;
  #ifdef CLAY
  // claymation: the front row of tiles along the eaves (the upright band, buildings.js tileEdge) ends in round tile
  // ends — cut in scallops, a tube of clay each, as in the user's pictures
  if (isRoof && abs(normalize(vWNrm).y) < 0.35 && vTex.x - ${ROOF_BASE_VALUE}.0 < 0.5) {
    float fu = fract(vUvF.x * 16.0) - 0.5, vb = vUvF.y / 0.035; // (a tile is 0.2 m; 0 the band's bottom, 1 its top)
    float arc = 0.5 - sqrt(max(0.25 - fu * fu, 0.0));
    if (vb < arc * 1.25) discard;
    gEave = fu;
  }
  #endif
  float camD = length(vWPos.xz - cameraPosition.xz);
  bool fillQ = kind < 0.5 && vTex.w > 1.5;
  bool nearFill = fillQ && camD < uNearDist;
  bool glassy = lt < 0.5 || (lt > 2.5 && lt < 4.5) || lt > 6.5;
  // fills sample strictly inside their hole: filtering across the rectangle edge mixed in wall texels whose
  // in-between alpha read as a lit pane (a white outline around the windows at night)
  vec2 fuv = vUvF;
  if (fillQ) fuv = floor(vUvF + 1e-4) + clamp(fract(vUvF + 1e-4), vRect.xy + 0.007, vRect.zw - 0.007);
  vec4 tx = texture(uFacade, vec3(fuv, layer));
  if (nearFill) tx = glassy ? vec4(0.13, 0.16, 0.19, 0.5) : vec4(0.035, 0.03, 0.028, 0.0);
  gEmK = nearFill ? 0.5 : 1.0;
  float wallMask = step(0.75, tx.a);
  // only layers that really have panes (windows, door, balcony, shop): filtered alpha at the edges of the plaster
  // grain in blank layers must never read as glass (it glowed at night like fireflies)
  bool paneLayer = kind < 0.5 && (lt < 1.5 || (lt > 2.5 && lt < 4.5) || lt > 6.5);
  gGlass = paneLayer ? step(0.3, tx.a) * (1.0 - wallMask) : 0.0;
  vec3 col = mix(tx.rgb, tx.rgb * vTint, wallMask);
  #ifdef CLAY
  if (!isRoof && wallMask > 0.5) { // (claymation: one clean piece of clay — the paint's damp stains and grime smoothed away)
    vec4 txm = textureLod(uFacade, vec3(fuv, layer), 4.0);
    col = mix(col, txm.rgb * vTint, 0.7 * smoothstep(0.86, 0.98, txm.a));
  }
  #endif
  if (isRoof) col *= vTint; // roofs: tint variation
  // ---- photo-scanned detail (CC0): modulates painted walls, replaces brick/stone/tiles
  gDetK = 0.0; gDetL = 0.0; gDetUV = vec2(0.0);
  if (uDetOn > 0.5) {
    float st = floor(vTex.x / 8.0 + 0.001);
    float dl = -1.0, rep = 0.0, nk = 0.6;
    vec2 duv = vec2(0.0);
    if (!isRoof) {
      vec3 wn = normalize(vWNrm);
      duv = vec2(dot(vWPos.xz, vec2(-wn.z, wn.x)), vWPos.y);
      if (st < 1.5) { dl = vTex.z < 0.3 ? 1.0 : 0.0; nk = dl > 0.5 ? 0.45 : 0.55; }
      else if (st < 3.5) dl = 0.0;
      else if (st < 4.5) { dl = 2.0; rep = 1.0; nk = 1.0; }
      else if (st < 5.5) dl = 0.0;
      else if (st < 6.5) { dl = 4.0; nk = 0.8; }
      else { dl = 3.0; rep = 1.0; nk = 1.0; }
    } else {
      float rk = vTex.x - float(ROOF_BASE);
      duv = vUvF * 3.0;
      if (rk < 0.5) { dl = vTex.z < 0.3 ? 6.0 : 5.0; rep = 1.0; nk = 1.0; }
      else if (rk < 1.5) { dl = 7.0; nk = 0.5; }
      else { dl = 4.0; nk = 0.8; }
    }
    if (dl >= 0.0) {
      int di = int(dl + 0.5);
      vec2 uv = duv / uDetSize[di];
      vec3 da = texture(uDet, vec3(uv, dl)).rgb;
      float wm = isRoof ? 1.0 : wallMask;
      if (rep > 0.5) col = mix(col, da * (isRoof ? vTint * 1.05 : vTint), wm);
      else {
        bool rough = di == 1;
        col = mix(col, col * clamp(da / max(uDetMean[di], 0.05), rough ? 0.8 : 0.6, rough ? 1.15 : 1.35), wm * (rough ? 0.55 : 0.9));
      }
      // close up: the same scan at 3.7x frequency so the plaster keeps a crisp grain instead of a blurry texel
      if (!isRoof && camD < 26.0) {
        vec3 d2 = texture(uDet, vec3(uv * 3.7 + vec2(0.37, 0.61), dl)).rgb;
        float k2 = (1.0 - smoothstep(6.0, 26.0, camD)) * wm * 0.5;
        col *= mix(1.0, clamp(dot(d2, vec3(0.3333)) / max(uDetMean[di], 0.05), 0.82, 1.15), k2);
      }
      gDetK = wm * nk; gDetL = dl; gDetUV = uv;
    }
  }
  // ---- zócalo (plinth): photo-scanned granite on stone plinths, plaster grain on painted ones, with their normal maps
  if (!isRoof && uDetOn > 0.5 && fl < 0.5 && !fillQ && gGlass < 0.5 && wallMask < 0.5 && layer < 63.5) {
    int st8 = int(floor(layer / 8.0 + 0.001));
    if (fract(vUvF.y + 1e-4) < uZocH[st8] / 3.1) {
      vec3 wz = normalize(vWNrm);
      vec2 wuv = vec2(dot(vWPos.xz, vec2(-wz.z, wz.x)), vWPos.y);
      if (uZocStone[st8] > 0.5) {
        vec2 guv = wuv / uDetSize[3];
        vec3 gr = texture(uDet, vec3(guv, 3.0)).rgb;
        col = mix(col, gr * 0.92, 0.78);
        gDetK = 1.0; gDetL = 3.0; gDetUV = guv;
      } else {
        vec2 puv = wuv / uDetSize[1];
        vec3 pz = texture(uDet, vec3(puv, 1.0)).rgb;
        col *= clamp(dot(pz, vec3(0.3333)) / max(uDetMean[1], 0.05), 0.8, 1.18);
        gDetK = 0.5; gDetL = 1.0; gDetUV = puv;
      }
    }
  }
  // ---- interior mapping: a room behind each pane (walls, floor, ceiling, a wardrobe, a painting, a sofa)
  gRoom = 0.0; gRoomCol = vec3(0.0);
  if (gGlass > 0.0) {
    vec3 wn = normalize(vWNrm);
    vec3 wt = vec3(-wn.z, 0.0, wn.x);
    vec3 V = normalize(vWPos - cameraPosition);
    if (dot(V, wn) > 0.0) { wn = -wn; wt = -wt; }
    vec3 rd = vec3(dot(V, wt), V.y, dot(V, wn));
    if (rd.z < -0.02) {
      const float W = 3.2, HH = 3.1, D = 3.6;
      vec3 ro = vec3(fract(vUvF.x) * W, fract(vUvF.y) * HH, 0.0);
      vec3 tq;
      tq.x = rd.x > 0.0 ? (W - ro.x) / rd.x : -ro.x / min(rd.x, -1e-4);
      tq.y = rd.y > 0.0 ? (HH - ro.y) / rd.y : -ro.y / min(rd.y, -1e-4);
      tq.z = -D / rd.z;
      float tt = min(min(tq.x, tq.y), tq.z);
      vec3 hp = ro + rd * tt;
      float rh = gHash3(vec3(bay * 3.1 + 0.3, fl * 7.7 + 1.1, vTex.z * 131.0));
      bool shopR = lt > 6.5;
      vec3 wallC = shopR ? vec3(0.93, 0.92, 0.88) : rh < 0.4 ? vec3(0.93, 0.9, 0.82) : rh < 0.6 ? vec3(0.8, 0.87, 0.9) : rh < 0.8 ? vec3(0.95, 0.84, 0.78) : vec3(0.86, 0.9, 0.8);
      vec3 floorC = shopR ? vec3(0.78, 0.76, 0.72) : fract(rh * 13.0) < 0.55 ? vec3(0.45, 0.3, 0.19) : vec3(0.66, 0.63, 0.58);
      vec3 c;
      float depth = clamp(-hp.z / D, 0.0, 1.0);
      if (tt >= tq.z - 1e-4) {
        c = wallC;
        if (shopR) {
          // shelves full of goods on the back wall
          float sy = fract(hp.y / 0.52);
          if (hp.y > 0.35 && hp.y < 2.2) {
            float cell = floor(hp.x / 0.17) + floor(hp.y / 0.52) * 31.0;
            float g = gHash2(vec2(cell, rh * 17.0));
            vec3 goods = g < 0.25 ? vec3(0.78, 0.22, 0.18) : g < 0.45 ? vec3(0.9, 0.78, 0.3) : g < 0.65 ? vec3(0.25, 0.45, 0.75) : g < 0.8 ? vec3(0.95, 0.94, 0.9) : vec3(0.3, 0.6, 0.3);
            c = sy < 0.07 ? vec3(0.55, 0.55, 0.56) : sy < 0.62 ? goods * (0.75 + 0.25 * gHash2(vec2(cell, 3.0))) : wallC * 0.8;
          }
        } else {
          float fx = fract(rh * 17.0) * (W - 1.6) + 0.2, fw = 0.8 + fract(rh * 5.0) * 0.7;
          if (hp.x > fx && hp.x < fx + fw && hp.y < 1.85 + fract(rh * 3.0) * 0.35) c = fract(rh * 23.0) < 0.6 ? vec3(0.36, 0.23, 0.15) : vec3(0.84, 0.83, 0.79);
          float px = fract(rh * 29.0) * (W - 0.9) + 0.2;
          if (hp.x > px && hp.x < px + 0.62 && hp.y > 1.5 && hp.y < 1.98) c = vec3(0.55, 0.42, 0.3) * (0.7 + 0.5 * fract(rh * 41.0));
        }
      } else if (tt >= tq.y - 1e-4) {
        if (rd.y < 0.0) {
          c = floorC;
          float sx = fract(rh * 37.0) * (W - 2.0) + 0.3;
          if (!shopR && hp.x > sx && hp.x < sx + 1.7 && hp.z < -D + 1.0) c = fract(rh * 43.0) < 0.5 ? vec3(0.5, 0.18, 0.16) : vec3(0.22, 0.3, 0.42);
        } else c = shopR ? vec3(1.0) : vec3(0.93, 0.92, 0.9);
      } else c = wallC * 0.88;
      c *= mix(1.0, shopR ? 0.8 : 0.5, depth);
      if (shopR) c *= 1.25;
      // lace curtains (visillos) close to the pane, seen on the real glazing near the camera
      if (nearFill && !shopR) {
        vec2 cu = fract(vUvF);
        vec2 pl = (cu - vRect.xy) / max(vRect.zw - vRect.xy, vec2(1e-3));
        float cs = fract(rh * 57.0);
        float m = cs < 0.3 ? max(step(pl.x, 0.24), step(0.76, pl.x)) : cs < 0.55 ? step(pl.y, 0.56) : cs < 0.68 ? 0.85 : 0.0;
        vec3 cc = (fract(rh * 71.0) < 0.6 ? vec3(0.93, 0.92, 0.88) : vec3(0.9, 0.84, 0.72)) * (0.86 + 0.14 * sin(pl.x * 70.0));
        c = mix(c, cc * 0.85, m * 0.82);
      }
      gRoom = 1.0;
      gRoomCol = c;
      col = mix(col, c * 0.78 * (1.0 - uWinDark), gGlass * 0.75);
      // sky reflection, stronger at grazing angles
      float fres = pow(1.0 - abs(rd.z), 3.0);
      col = mix(col, mix(vec3(0.6, 0.7, 0.8), vec3(0.04, 0.05, 0.08), uNight), gGlass * (0.1 + 0.45 * fres));
    }
  }
  // dirt streaks washed down from sills and balconies (chorreones)
  if (kind < 0.5 && !fillQ && vRect.z > vRect.x + 0.01) {
    vec2 cu = fract(vUvF);
    float below = (vRect.y - cu.y) * 3.1;
    if (below > 0.0 && vRect.y > 0.02) {
      float inX = smoothstep(vRect.x - 0.02, vRect.x + 0.04, cu.x) * (1.0 - smoothstep(vRect.z - 0.04, vRect.z + 0.02, cu.x));
      float nz = gNoise(vec2(vUvF.x * 29.0, vWY * 1.7 + vTex.z * 13.0));
      float fall = exp(-below / (0.35 + 0.8 * nz));
      col *= 1.0 - 0.16 * inX * fall * (0.55 + 0.45 * nz) * wallMask;
    }
  }
  // shade under the eaves
  if (!isRoof && vWallH > 0.0) col *= mix(1.0, 0.8, smoothstep(vWallH - 0.9, vWallH, vWY));
  // base darkening (ambient occlusion near the ground)
  col *= mix(0.62, 1.0, smoothstep(0.0, 1.6, vWY));
  diffuseColor.rgb *= col;
  #ifdef CLAY
  // (claymation: the whitewash is cream-coloured clay, warm as in the user's pictures — the lime itself a peach cream,
  // measured against them; coloured bands and doors keep the lighter warm cast)
  if (!isRoof) diffuseColor.rgb *= mix(vec3(0.93, 0.83, 0.72), vec3(0.6, 0.49, 0.47), smoothstep(0.35, 0.7, dot(col, vec3(0.2126, 0.7152, 0.0722))));
  #endif
  float isShop = lt > 6.5 ? 1.0 : 0.0;
  float litChance = isShop > 0.5 ? 0.7 : uNightLit;
  gLit = step(gHash3(vec3(bay * 1.7 + 3.1, fl * 3.3, vTex.z * 53.0)), litChance) * (isShop > 0.5 ? 0.45 : 1.0)
       * (0.7 + 0.6 * gHash3(vec3(bay, fl, vTex.z * 11.0))) * (1.0 - uWinDark);
}
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uDetNOn > 0.5 && gDetK > 0.01) {
  vec3 mapN = texture(uDetN, vec3(gDetUV, gDetL)).xyz * 2.0 - 1.0;
  mapN.xy *= gDetK;
  mat3 tbn = cotangentFrame(normal, -vViewPosition, gDetUV);
  normal = normalize(tbn * mapN);
}
#ifdef CLAY
{
  // claymation: the house as a clay model — its corners, its top edge, the rim of its openings and the top of its
  // plinth rounded (the light turns round them as round a soft edge): no sharp line anywhere
  vec3 nW = normalize(vWNrm), nB = nW;
  if (abs(nW.y) < 0.35 && abs(vTex.y - 1.0) > 0.5) {
    vec3 T = vec3(-nW.z, 0.0, nW.x);
    float code = vEdge.y;
    if (code > 0.5) {
      float k = floor(code / 10000.0 + 1e-4), L = code - k * 10000.0;
      float cs = mod(k, 2.0), ce = floor(k / 2.0 + 1e-4);
      // (puffy, as modelled: the wall swells towards its middle — a long soft roll at each corner)
      float a0 = cs * pow(1.0 - smoothstep(0.0, 0.7, vEdge.x), 1.6), a1 = ce * pow(1.0 - smoothstep(0.0, 0.7, L - vEdge.x), 1.6);
      nB += T * (a1 - a0) * 1.05;
    }
    nB.y += pow(1.0 - smoothstep(0.0, 0.42, vWallH - vWPos.y), 1.5) * 0.95;
    if (vRect.z > vRect.x + 0.01) { // the rim of a window or a door: the wall curls into the opening
      vec2 cf = fract(vUvF + 1e-4);
      float dl = (vRect.x - cf.x) * 3.2, dr = (cf.x - vRect.z) * 3.2, db = (vRect.y - cf.y) * 3.1, dt = (cf.y - vRect.w) * 3.1;
      bool inY = cf.y > vRect.y - 0.04 && cf.y < vRect.w + 0.04, inX = cf.x > vRect.x - 0.04 && cf.x < vRect.z + 0.04;
      if (inY && dl > 0.0) nB += T * pow(1.0 - smoothstep(0.0, 0.13, dl), 1.5) * 0.9;
      if (inY && dr > 0.0) nB -= T * pow(1.0 - smoothstep(0.0, 0.13, dr), 1.5) * 0.9;
      if (inX && dt > 0.0) nB.y -= pow(1.0 - smoothstep(0.0, 0.13, dt), 1.5) * 0.9;
      if (inX && db > 0.0 && vRect.y > 0.01) nB.y += pow(1.0 - smoothstep(0.0, 0.13, db), 1.5) * 0.9;
    }
    if (floor(vUvF.y + 1e-4) < 0.5 && vTex.x < 63.5) { // the top of the plinth: a strip of clay laid on, its edge rounded
      float dz = uZocH[int(floor(vTex.x / 8.0 + 0.001))] - fract(vUvF.y + 1e-4) * 3.1;
      if (dz > 0.0) nB.y += pow(1.0 - smoothstep(0.0, 0.055, dz), 1.5) * 0.75;
    }
    normal = normalize(normal + mat3(viewMatrix) * (normalize(nB) - nW));
  }
  // the roof's Arab tiles as rolls of clay: convex covers and hollow channels in turn down the slope, each row's lip
  if (abs(vTex.y - 1.0) < 0.5 && vTex.x - ${ROOF_BASE_VALUE}.0 < 0.5) {
    mat3 tb = cotangentFrame(normal, -vViewPosition, vUvF);
    float cu = vUvF.x * 16.0, f = fract(cu), side = mod(floor(cu), 2.0) < 0.5 ? 1.0 : -1.0;
    float dh = side * cos(3.14159 * f) * 0.75;                       // d/du of ±sin(πu): the roll's slope across it
    float fr = fract(vUvF.y * 7.0), lip = smoothstep(0.0, 0.12, fr) * (1.0 - smoothstep(0.12, 0.3, fr));
    normal = normalize(normal - tb[0] * dh + tb[1] * lip * 0.5);
  }
}
#endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.12, gGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += gGlass * gLit * uNight * mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.72, 0.45) * (0.35 + gRoomCol * 1.1), gRoom) * 0.9 * gEmK;
if (uNight > 0.02) totalEmissiveRadiance += diffuseColor.rgb * lampLight(vWPos, normalize(vWNrm)) * uNight;`);
    sh.fragmentShader = sh.fragmentShader.replace('float(ROOF_BASE)', `${ROOF_BASE_VALUE}.0`);
  };
  m.customProgramCacheKey = () => 'bldg5';
  return m;
}

// Facade details (frames, shutters, grilles, awnings…): vertex colours + resolution-independent procedural patterns
// with bump, so slats, ribs and stripes stay sharp at any distance. Pattern id per vertex (aPat, see facades.js PAT).
export function makeTrimMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uLamps = shared.uLamps;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aPat; varying float vPat; varying vec3 vPW; varying vec3 vPN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPat = aPat; vPW = (modelMatrix * vec4(position, 1.0)).xyz; vPN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPat; varying vec3 vPW; varying vec3 vPN;
float gH; float gRgh;
uniform float uNight;
${LAMPS_GLSL}
${HASH}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
gH = 0.0; gRgh = -1.0;
{
  int pid = int(vPat + 0.5);
  if (pid > 0) {
    vec3 N = normalize(vPN);
    float hl = length(N.xz);
    vec3 T = hl > 0.05 ? vec3(-N.z, 0.0, N.x) / hl : vec3(1.0, 0.0, 0.0);
    vec2 q = vec2(dot(vPW, T), hl > 0.3 ? vPW.y : vPW.z);
    float f = 1.0;
    if (pid == 1) {            // roller shutter slats (4.5 cm)
      float t = q.y / 0.045, s = fract(t), w = fwidth(t);
      float groove = smoothstep(0.0, 0.1 + w, s) * (1.0 - smoothstep(0.9 - w, 1.0, s));
      f = mix(0.6, 1.0, groove) * (0.9 + 0.12 * sin(s * 3.1416));
      gH = sin(s * 3.1416) * 0.0025 * groove;
    } else if (pid == 2) {     // garage door ribs (12 cm)
      float t = q.y / 0.12, s = fract(t), w = fwidth(t);
      float r = smoothstep(0.0, 0.12 + w, s) * (1.0 - smoothstep(0.86 - w, 1.0, s));
      f = 0.8 + 0.2 * r; gH = r * 0.006;
    } else if (pid == 3) {     // louvres of the wooden shutters (6 cm)
      float t = q.y / 0.06, s = fract(t), w = fwidth(t);
      f = mix(0.5, 1.0, smoothstep(0.0, 0.35 + w, s)); gH = s * 0.006;
    } else if (pid == 4) {     // awning stripes along the facade
      float t = q.x / 0.3, s = fract(t), w = fwidth(t);
      float st = smoothstep(0.5 - w, 0.5 + w, s) * (1.0 - smoothstep(1.0 - w, 1.0, s));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.91, 0.84) * (0.6 + 0.4 * max(dot(diffuseColor.rgb, vec3(0.7)), 0.5)), st);
      gRgh = 0.9;
    } else if (pid == 5) {     // metal roller shutter corrugation (3 cm)
      float t = q.y / 0.03, s = fract(t);
      f = 0.82 + 0.18 * sin(s * 6.2832); gH = sin(s * 6.2832) * 0.0012; gRgh = 0.45;
    } else if (pid == 6) {     // granite
      float n = gNoise(q * 38.0) * 0.6 + gNoise(q * 110.0) * 0.4;
      float sp = step(0.86, gHash2(floor(q * 160.0)));
      f = (0.84 + 0.26 * n) * (1.0 - sp * 0.45);
    } else if (pid == 7) {     // wood grain
      float n = gNoise(vec2(q.x * 42.0, q.y * 1.3)) * 0.7 + gNoise(vec2(q.x * 150.0, q.y * 4.0)) * 0.3;
      f = 0.8 + 0.34 * n; gRgh = 0.6;
    } else if (pid == 9) {     // strip curtain: 4.5 cm plastic strips in three colours
      float t = q.x / 0.045, s = fract(t), w = fwidth(t);
      float id = floor(t);
      float hsh = gHash2(vec2(id, 7.0));
      vec3 c2 = hsh < 0.34 ? diffuseColor.rgb : hsh < 0.67 ? vec3(0.9, 0.86, 0.3) : vec3(0.92, 0.92, 0.88);
      float gap = smoothstep(0.0, 0.08 + w, s) * (1.0 - smoothstep(0.92 - w, 1.0, s));
      diffuseColor.rgb = mix(vec3(0.05), c2 * (0.85 + 0.15 * sin(q.y * 9.0 + id)), gap);
      gRgh = 0.35;
    }
    diffuseColor.rgb *= f;
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (gRgh >= 0.0) roughnessFactor = gRgh;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uNight > 0.02) totalEmissiveRadiance += diffuseColor.rgb * lampLight(vPW, normalize(vPN)) * uNight;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (gH != 0.0) {
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(gH), dhy = dFdy(gH);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  vec3 nb = abs(det) * normal - grad;
  if (abs(det) > 1e-12 && dot(nb, nb) > 1e-24) normal = normalize(nb);
}`);
  };
  m.customProgramCacheKey = () => 'trim2';
  return m;
}

// Ground material: layer & uv per vertex, macro variation noise, optional tint — plus photo-scanned detail and the
// imperfections of every surface, placed consistently: the zone map (distance to the street, age of the neighbourhood,
// greenery) and the local frame of roads and kerbs (aLoc) decide where potholes, patches, cracks, manholes, drains,
// worn tiles, gum spots and lowered kerbs go. fx = { det, detN, on, normals, mean[6], size[6], field, rect[4] }
const GROUND_GLSL = `
#ifdef CLAY_RELIEF
#define GCW 0.011
#else
#define GCW 0.004
#endif
vec2 gVor(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(gHash2(ip + g), gHash2(ip + g + 17.31));
    vec2 r = g + o - fp; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = ip + g; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), gHash2(id));
}
float gLine(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-5; return 1.0 - smoothstep(w, w + aa, abs(d)); }
mat3 gCotangent(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x, B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * invmax, B * invmax, N);
}`;

export function makeGroundMaterial(groundTex, { polygonOffset = 0, roughness = 0.95, transparentEdges = false, fx = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0 });
  if (STYLE.plastilina) m.defines = { CLAY_RELIEF: '1.8', CLAY_TONE: '2.0', CLAY_SET: '1', CLAY_TILE: '6.0', CLAY_AMP: '0.016', CLAY_CAV: '0.25' }; // (the ground's clay crumbly at a model's scale, as in the user's pictures)
  if (polygonOffset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -polygonOffset;
    m.polygonOffsetUnits = -polygonOffset * 4;
  }
  const dummyA = new THREE.DataArrayTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, 1); dummyA.needsUpdate = true;
  const dummyF = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1); dummyF.needsUpdate = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGround = { value: groundTex };
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uGDet = { value: (fx && fx.det) || dummyA };
    sh.uniforms.uGDetN = { value: (fx && fx.detN) || dummyA };
    sh.uniforms.uGDetOn = { value: fx && fx.on ? 1 : 0 };
    sh.uniforms.uGDetNOn = { value: fx && fx.on && fx.normals ? 1 : 0 };
    sh.uniforms.uGDetMean = { value: (fx && fx.mean) || [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    sh.uniforms.uGDetSize = { value: (fx && fx.size) || [3, 3, 4, 2, 2, 2] };
    sh.uniforms.uField = { value: (fx && fx.field) || dummyF };
    sh.uniforms.uFieldRect = { value: new THREE.Vector4(...((fx && fx.rect) || [-1e5, -1e5, 2e5, 2e5])) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aGnd; attribute vec3 aTint; attribute vec4 aLoc;
varying vec3 vGnd; varying vec3 vTint; varying vec2 vWXZ; varying vec4 vLoc; varying vec3 vWPosG;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGnd = aGnd; vTint = aTint; vLoc = aLoc; vWPosG = (modelMatrix * vec4(position,1.0)).xyz; vWXZ = vWPosG.xz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uGround; uniform sampler2DArray uGDet; uniform sampler2DArray uGDetN;
uniform float uGDetOn; uniform float uGDetNOn; uniform float uGDetMean[6]; uniform float uGDetSize[6];
uniform sampler2D uField; uniform vec4 uFieldRect;
varying vec3 vGnd; varying vec3 vTint; varying vec2 vWXZ; varying vec4 vLoc; varying vec3 vWPosG;
float gGH; float gGRough; float gGDetK; float gGDetL; vec2 gGDetUV;
${HASH}
${GROUND_GLSL}`)
      .replace('#include <map_fragment>', `
{
  float layer = floor(vGnd.z + 0.5);
  vec4 tx = texture(uGround, vec3(vGnd.xy, layer > 15.5 ? 12.0 : layer));
  vec3 col = tx.rgb * vTint;
  vec2 wp = vWXZ;
  float camD = length(vWPosG - cameraPosition);
  float fine = 1.0 - smoothstep(60.0, 140.0, camD);
  vec4 fld = texture(uField, (wp - uFieldRect.xy) / uFieldRect.zw);
  float roadD = fld.r * 20.0, age = fld.g, green = fld.b;
  gGH = 0.0; gGRough = -1.0; gGDetK = 0.0; gGDetL = 0.0; gGDetUV = vec2(0.0);
  // ---- photo-scanned materials (CC0)
  if (uGDetOn > 0.5 && layer < 15.5) {
    int dl = -1; float mode = 0.0;
    if (layer < 1.5) { dl = 0; mode = 1.0; }
    else if (layer < 3.5) { dl = 1; mode = 0.0; }
    else if (layer < 4.5) { dl = 2; mode = 1.0; }
    else if (layer < 5.5) { dl = 2; mode = 2.0; }
    else if (layer < 6.5) { dl = 4; mode = 1.0; }
    else if (layer < 7.5) { dl = 5; mode = 1.0; }
    else if (layer < 11.5) { dl = layer < 9.5 ? 2 : 5; mode = 0.0; }
    else if (layer < 12.5) { dl = 1; mode = 1.0; }
    else if (layer < 13.5) { dl = 3; mode = 1.0; }
    else { dl = 1; mode = 0.0; }
    if (dl >= 0) {
      vec2 duv = wp / uGDetSize[dl];
      vec3 d = texture(uGDet, vec3(duv, float(dl))).rgb;
      float mn = max(uGDetMean[dl], 0.05);
      bool lumOnly = false;
      if (lumOnly) col *= mix(1.0, clamp(dot(d, vec3(0.3333)) / mn, 0.62, 1.38), 0.85);
      else if (mode > 1.5) col = mix(col, col * d / mn, 0.7);
      else if (mode > 0.5) col = mix(col, d * vTint * (layer > 0.5 && layer < 1.5 ? vec3(0.86) : layer > 6.5 && layer < 7.5 ? vec3(1.1, 1.0, 0.82) : vec3(1.0)), 0.85);
      else col *= mix(1.0, clamp(dot(d, vec3(0.3333)) / mn, 0.72, 1.28), 0.5);
      gGDetK = mode > 0.5 ? 0.9 : 0.35; gGDetL = float(dl); gGDetUV = duv;
    }
  }
  // ---- asphalt streets, in their own frame: along s, across t, half width hw, wear dmg, street seed eid
  if (layer < 1.5 && vLoc.z > 0.5) {
    float s = vLoc.x, t = vLoc.y, hw = vLoc.z;
    float eid = floor(vLoc.w / 4.0 + 1e-3);
    float dmg = clamp(vLoc.w - eid * 4.0, 0.0, 1.0);
    dmg = clamp(dmg * (0.55 + age * 0.9), 0.0, 1.0);
    float at = abs(t);
    // wheel paths: darker and smoother
    float lane = hw > 2.6 ? hw * 0.5 : 0.0;
    float tr = exp(-pow((at - max(0.0, lane - 0.75)) / 0.35, 2.0)) + exp(-pow((at - (lane + 0.75)) / 0.35, 2.0));
    col *= 1.0 - 0.06 * clamp(tr, 0.0, 1.0);
    // gutter: sand, leaves and dust against the kerb
    float gut = smoothstep(hw - 0.5, hw - 0.04, at);
    // crumbling edge where there is no kerb to hold the asphalt
    float cr = smoothstep(hw - 0.12 - 0.22 * gNoise(vec2(s * 1.3, eid)), hw, at) * (0.25 + dmg);
    #ifdef CLAY_RELIEF
    // (claymation: the road's clay meets the kerb clean, in the kerb's soft shadow — the pale dust read as a glow)
    col *= 1.0 - 0.3 * smoothstep(hw - 0.22, hw - 0.01, at);
    cr = 0.0;
    #else
    col = mix(col, col * vec3(0.93, 0.87, 0.76) * (0.82 + 0.3 * gNoise(wp * 6.0)), gut * 0.65);
    #endif
    col = mix(col, vec3(0.6, 0.56, 0.5) * (0.8 + 0.4 * gNoise(wp * 11.0)), clamp(cr, 0.0, 1.0) * 0.7);
    gGH -= 0.008 * clamp(cr, 0.0, 1.0);
    // cracks: the paving joint along the street, transverse cracks, alligator cracking where the street is tired
    float crack = 0.0;
    float jn = step(0.55 - dmg * 0.4, gNoise(vec2(s * 0.06, eid * 1.7)));
    crack = max(crack, gLine(t - (hw > 3.2 ? 0.0 : hw * 0.3) - 0.07 * sin(s * 0.8 + eid) - 0.05 * (gNoise(vec2(s * 2.5, eid)) - 0.5), GCW) * jn);
    float cc = floor(s / 11.0);
    float sc = s - (cc * 11.0 + 5.5 + (gHash2(vec2(cc, eid)) - 0.5) * 7.0) - 0.3 * sin(t * 1.7 + cc * 2.1) - 0.22 * (gNoise(vec2(t * 1.3, cc)) - 0.5) - 0.07 * (gNoise(vec2(t * 6.0, cc + 4.0)) - 0.5);
    // a transverse crack rarely spans the whole street: a random stretch of it
    float tc = (gHash2(vec2(cc, eid + 5.0)) * 2.0 - 1.0) * hw, tl = hw * (0.35 + 0.8 * gHash2(vec2(cc, eid + 6.0)));
    crack = max(crack, gLine(sc, GCW) * step(gHash2(vec2(cc, eid + 3.0)), 0.2 + dmg * 0.55) * step(at, hw - 0.1) * (1.0 - smoothstep(tl * 0.8, tl, abs(t - tc))));
    float an = gNoise(vec2(s * 0.13, t * 0.4) + eid * 3.1) * 0.7 + gNoise(vec2(s * 0.4, t * 0.9) + eid) * 0.3;
    float thr = 1.0 - dmg * 0.22;
    if (an > thr && fine > 0.0) {
      // alligator cracking: irregular (warped) cells, only in tired patches
      vec2 wq = vec2(s, t) * 2.3 + vec2(gNoise(vec2(s, t) * 1.7), gNoise(vec2(t, s) * 1.9)) * 0.9;
      vec2 v = gVor(wq);
      crack = max(crack, (1.0 - smoothstep(0.01, 0.035 + fwidth(v.x), v.x)) * smoothstep(thr, thr + 0.06, an) * 0.7);
    }
    crack *= fine;
    #ifdef CLAY_RELIEF
    crack = clamp(crack * 1.6, 0.0, 1.0); // (claymation: cracks cut deep into the clay with a tool)
    col *= 1.0 - 0.62 * crack;
    gGH -= 0.009 * crack;
    #else
    col *= 1.0 - 0.48 * crack;
    gGH -= 0.004 * crack;
    #endif
    // repair patches (bacheo): rectangles of newer or older asphalt with a sealed seam
    float pc = floor(s / 7.0);
    if (gHash2(vec2(pc, eid + 11.0)) < 0.04 + dmg * 0.2) {
      float pl = 1.0 + gHash2(vec2(pc, eid + 12.0)) * 3.4;
      float pw = 0.6 + gHash2(vec2(pc, eid + 13.0)) * min(2.4, hw * 1.2);
      float ps = pc * 7.0 + 0.3 + gHash2(vec2(pc, eid + 14.0)) * max(0.1, 6.4 - pl);
      float pt = (gHash2(vec2(pc, eid + 15.0)) * 2.0 - 1.0) * max(0.0, hw - pw * 0.5 - 0.15);
      vec2 q = vec2(s - ps - pl * 0.5, t - pt);
      vec2 e2 = abs(q) - vec2(pl, pw) * 0.5;
      float sd = max(e2.x, e2.y);
      float inP = 1.0 - smoothstep(-0.005, 0.005 + fwidth(sd), sd);
      float newer = step(gHash2(vec2(pc, eid + 16.0)), 0.55);
      vec3 pcol = newer > 0.5 ? col * 0.72 : col * vec3(1.1, 1.08, 1.04);
      col = mix(col, pcol, inP);
      col *= 1.0 - 0.35 * gLine(sd, 0.02) * fine;
      gGH += 0.002 * inP;
    }
    // potholes (baches), some holding rainwater
    float kc = floor(s / 10.0);
    if (gHash2(vec2(kc, eid + 21.0)) < 0.03 + dmg * 0.32) {
      vec2 c = vec2(kc * 10.0 + 1.2 + gHash2(vec2(kc, eid + 22.0)) * 7.6, (gHash2(vec2(kc, eid + 23.0)) * 2.0 - 1.0) * max(0.2, hw - 0.7));
      float R = 0.26 + gHash2(vec2(kc, eid + 24.0)) * 0.5;
      vec2 d = vec2(s, t) - c;
      float ang = atan(d.y, d.x);
      float rr = R * (1.0 + 0.25 * sin(ang * 3.0 + kc) + 0.17 * sin(ang * 5.0 + eid) + 0.16 * (gNoise(d * 8.0 + kc) - 0.5));
      float dist = length(d);
      if (dist < rr + 0.2) {
        float inside = 1.0 - smoothstep(rr - 0.015, rr + 0.012 + fwidth(dist), dist);
        float rim = smoothstep(rr - 0.1, rr, dist) * (1.0 - smoothstep(rr, rr + 0.12, dist));
        float depth = inside * (1.0 - pow(clamp(dist / max(rr, 0.01), 0.0, 1.0), 2.0));
        // loose gravel and dust in the hole, a lighter broken rim of old asphalt around it
        vec3 grav = mix(vec3(0.2, 0.19, 0.18), vec3(0.52, 0.48, 0.42), gHash2(floor(d * 45.0) + kc)) * (0.75 + 0.5 * depth);
        vec3 rimC = vec3(0.6, 0.58, 0.55) * (0.8 + 0.4 * gNoise(d * 30.0));
        #ifdef CLAY_RELIEF
        // (claymation: a dent pressed into the grey clay, crumbs of the same clay in it — the gravel and the pale rim
        // came out as a white splash under the studio light)
        grav = col * mix(0.5, 0.78, gHash2(floor(d * 30.0) + kc)) * (0.85 + 0.3 * depth); rimC = col * 1.06;
        #endif
        col = mix(col, grav, inside * 0.92);
        col = mix(col, rimC, rim * 0.55);
        gGH -= 0.08 * depth;
        // a damp, darker bottom in some (a dry town: no mirror puddles — they showed as white blobs under the sky)
        if (gHash2(vec2(kc, eid + 25.0)) < 0.18) {
          float water = 1.0 - smoothstep(rr * 0.75 - 0.02, rr * 0.75 + 0.01, dist);
          col = mix(col, col * 0.55, water * 0.8);
          gGRough = mix(0.95, 0.7, water);
          gGH = mix(gGH, -0.05, water);
        }
      }
    }
    // manhole covers along the lanes
    float mc = floor(s / 42.0);
    if (hw > 1.8 && gHash2(vec2(mc, eid + 31.0)) < 0.75) {
      vec2 c = vec2(mc * 42.0 + 6.0 + gHash2(vec2(mc, eid + 32.0)) * 30.0, (gHash2(vec2(mc, eid + 33.0)) < 0.5 ? 0.0 : 1.0) * (hw * 0.32) * (gHash2(vec2(mc, eid + 34.0)) < 0.5 ? -1.0 : 1.0));
      vec2 d = vec2(s, t) - c;
      float dist = length(d);
      if (dist < 0.46) {
        float R = 0.32;
        float inC = 1.0 - smoothstep(R - 0.004, R + 0.004 + fwidth(dist), dist);
        float ring = (smoothstep(R, R + 0.01, dist) - smoothstep(R + 0.07, R + 0.1, dist));
        float grid = step(0.5, fract((d.x + d.y) * 13.0)) * step(0.5, fract((d.x - d.y) * 13.0));
        float rings = gLine(dist - 0.22, 0.012) + gLine(dist - 0.1, 0.01);
        vec3 iron = vec3(0.2, 0.19, 0.18) * (0.78 + 0.3 * grid) * (1.0 - 0.25 * clamp(rings, 0.0, 1.0));
        col = mix(col, iron, inC);
        col *= 1.0 - 0.28 * ring;
        gGRough = mix(gGRough < 0.0 ? 0.95 : gGRough, 0.5, inC);
        gGH += (0.0015 * grid - 0.002 * rings) * inC - 0.003 * ring;
      }
    }
    // drain grates (imbornales) in the gutter
    float gc = floor(s / 28.0);
    if (hw > 1.5 && gHash2(vec2(gc, eid + 41.0)) < 0.6) {
      float gs = gc * 28.0 + 4.0 + gHash2(vec2(gc, eid + 42.0)) * 20.0;
      float side = gHash2(vec2(gc, eid + 43.0)) < 0.5 ? -1.0 : 1.0;
      vec2 q = vec2(s - gs, t * side - (hw - 0.21));
      if (abs(q.x) < 0.32 && abs(q.y) < 0.2) {
        float frame = step(abs(q.x), 0.3) * step(abs(q.y), 0.18);
        float slot = step(0.42, fract(q.x * 11.0 + 0.5)) * step(abs(q.y), 0.14) * step(abs(q.x), 0.26);
        col = mix(col, vec3(0.22, 0.21, 0.2), frame);
        col = mix(col, vec3(0.03), slot);
        gGH -= 0.012 * slot;
        gGRough = mix(gGRough < 0.0 ? 0.95 : gGRough, 0.55, frame);
      }
    }
    // oil drops where cars park along the kerb: only streets wide enough to park in (in the narrow ones the band
    // covered the whole road), and dull — glossy drops caught the sun as white blobs all over the asphalt
    float oil = smoothstep(0.62, 0.75, gNoise(vec2(s * 0.9, eid + at * 2.0))) * step(hw - 2.3, at) * step(at, hw - 0.5) * step(3.4, hw);
    col *= 1.0 - 0.28 * oil * (0.5 + 0.5 * gNoise(wp * 6.0));
    gGRough = oil > 0.3 ? mix(gGRough < 0.0 ? 0.95 : gGRough, 0.8, oil) : gGRough;
  } else if (layer < 1.5) {
    // junction discs & parking: a few fine cracks here and there (not the broken-tile look of old)
    vec2 v = gVor(wp * 2.2);
    float an = gNoise(wp * 0.07);
    col *= 1.0 - 0.2 * (1.0 - smoothstep(0.01, 0.03 + fwidth(v.x), v.x)) * step(0.88 - age * 0.1, an) * fine;
  }
  // ---- sidewalk tiles (30 cm, on the texture grid): replaced, cracked, stained and chewing gum; yards away from streets
  if (layer > 1.5 && layer < 2.5) {
    float clSq = 0.0; // (claymation: how much of a square this is — cobbles, not a yard)
    vec2 tp = wp / 0.3;
    vec2 tid = floor(tp), tf = fract(tp);
    float th = gHash2(tid + 0.37);
    float zd = clamp(age * 0.85 + (gNoise(wp * 0.045) - 0.5) * 0.7, 0.0, 1.0);
    if (th < 0.05 + zd * 0.05) col *= gHash2(tid + 3.1) < 0.5 ? vec3(1.09, 1.07, 1.03) : vec3(0.86, 0.85, 0.83);
    if (th > 0.95 - zd * 0.08 && fine > 0.0) {
      float a = gHash2(tid + 5.7) * 6.2832;
      vec2 n = vec2(cos(a), sin(a));
      float cl = gLine(dot(tf - 0.5, n) - (gHash2(tid + 6.1) - 0.5) * 0.4 + 0.03 * sin(dot(tf, n.yx) * 20.0), 0.012) * fine;
      col *= 1.0 - 0.5 * cl;
      gGH -= 0.002 * cl;
    }
    float st = gNoise(wp * 1.3 + 11.0);
    col *= 1.0 - 0.18 * smoothstep(0.72, 0.85, st) * (0.4 + zd);
    #ifdef CLAY_RELIEF
    { // claymation: each tile a slab of clay pressed down — its edges rounded, a dark gap round it, each its own shade;
      // away from the street (a square, the space before the church) the ground is laid with rounded cobbles instead
      // (slabs of 45 cm, a little irregular, the colour of sand — the user's pictures)
      vec2 sp = wp / 0.45 + vec2(gNoise(wp * 1.7), gNoise(wp * 1.7 + 4.0)) * 0.08;
      vec2 sid = floor(sp), sf = fract(sp);
      vec2 ef = min(sf, 1.0 - sf); float e = min(ef.x, ef.y) * 0.45;
      float sq = smoothstep(4.8, 6.8, fld.a * 20.0 + (gNoise(wp * 0.3) - 0.5) * 1.6); clSq = sq; // (well away from any front: a square)
      gGH += 0.009 * smoothstep(0.0, 0.05, e) * (1.0 - sq);
      col *= mix(vec3(1.0), vec3(1.11, 0.97, 0.97) * mix(0.58, 1.0, smoothstep(0.003, 0.014, e)) * (0.9 + 0.18 * gHash2(sid + 8.8)), 1.0 - sq);
      if (sq > 0.0) {
        vec2 cq = wp / 0.36 + vec2(gNoise(wp * 0.8), gNoise(wp * 0.8 + 7.0)) * 0.6;
        vec2 cv = gVor(cq);
        float bulge = 1.0 - pow(1.0 - smoothstep(0.0, 0.5, cv.x), 2.0);
        vec3 stone = vec3(0.15, 0.138, 0.155) * (0.82 + 0.3 * cv.y) * (0.92 + 0.16 * gNoise(wp * 3.0));
        col = mix(col, mix(vec3(0.06, 0.052, 0.05), stone, smoothstep(0.035, 0.08, cv.x)) * mix(0.8, 1.0, bulge), sq);
        gGH += 0.026 * bulge * sq;
      }
    }
    #endif
    vec2 gcell = floor(wp * 2.6);
    float gh = gHash2(gcell + 9.3);
    if (gh > 0.972 - zd * 0.02) {
      vec2 gcen = (gcell + 0.25 + 0.5 * vec2(gHash2(gcell + 1.7), gHash2(gcell + 2.9))) / 2.6;
      float gr = 0.012 + 0.02 * gHash2(gcell + 4.2);
      col *= 1.0 - 0.45 * (1.0 - smoothstep(gr, gr + 0.004 + fwidth(length(wp - gcen)), length(wp - gcen))) * fine;
    }
    // yards and empty lots, well away from the streets: dry earth, gravel, old concrete, dry grass
    float facD = fld.a * 20.0;
    float yard = smoothstep(4.5, 8.5, roadD + (gNoise(wp * 0.23) - 0.5) * 4.0) * smoothstep(3.0, 5.5, facD) * (1.0 - clSq);
    if (yard > 0.0) {
      float zn = gNoise(wp * 0.06 + 3.0);
      vec3 ycol;
      if (uGDetOn > 0.5) {
        vec3 dirt = texture(uGDet, vec3(wp / uGDetSize[2], 2.0)).rgb;
        vec3 grav = texture(uGDet, vec3(wp / uGDetSize[3], 3.0)).rgb;
        vec3 dry = texture(uGDet, vec3(wp / uGDetSize[5], 5.0)).rgb;
        vec3 conc = texture(uGDet, vec3(wp / uGDetSize[1], 1.0)).rgb;
        ycol = zn < 0.35 ? dirt : zn < 0.5 ? grav : zn < 0.62 ? conc : dry;
        ycol = mix(ycol, dry, green * 0.5);
      } else ycol = mix(vec3(0.62, 0.54, 0.42), vec3(0.7, 0.64, 0.46), zn);
      col = mix(col, ycol, yard);
      gGDetK *= 1.0 - yard;
    }
  }
  // ---- granite slabs of the squares: cracked slabs and stains
  if (layer > 2.5 && layer < 3.5) {
    vec2 v = gVor(wp * 0.8);
    col *= 1.0 - 0.3 * (1.0 - smoothstep(0.01, 0.03 + fwidth(v.x), v.x)) * step(v.y, 0.18 + age * 0.15) * fine;
    col *= 1.0 - 0.15 * smoothstep(0.7, 0.85, gNoise(wp * 0.9 + 5.0));
  }
  // ---- earth: warm Extremaduran soil; tracks get wheel ruts, a grass hump in the middle and ragged verges
  if (layer > 3.5 && layer < 4.5) {
    col *= vec3(1.1, 0.96, 0.8);
    float wet = smoothstep(0.66, 0.82, gNoise(wp * 0.25 + 7.0));
    col *= 1.0 - 0.3 * wet;
    gGRough = wet > 0.1 ? mix(0.95, 0.6, wet) : gGRough;
    gGH -= 0.02 * wet;
    if (vLoc.z > 0.5) {
      float t = vLoc.y, hw = vLoc.z, at = abs(t);
      float rut = exp(-pow((at - min(0.8, hw * 0.45)) / 0.22, 2.0));
      col *= 1.0 - 0.14 * rut;
      gGH -= 0.03 * rut;
      float hump = (1.0 - smoothstep(0.18, 0.42, at)) * smoothstep(0.35, 0.6, gNoise(vec2(vLoc.x * 0.4, 3.0)));
      float verge = smoothstep(hw - 0.55 - 0.35 * gNoise(vec2(vLoc.x * 0.8, 1.0)), hw, at);
      vec3 grassC = uGDetOn > 0.5 ? texture(uGDet, vec3(wp / uGDetSize[5], 5.0)).rgb * vec3(0.95, 1.0, 0.85) : vec3(0.62, 0.6, 0.4);
      col = mix(col, grassC, clamp(max(hump * 0.85, verge * 0.9), 0.0, 1.0));
    }
  }
  // ---- concrete: expansion joints every 3 m and cracks
  if (layer > 11.5 && layer < 12.5) {
    vec2 jq = abs(fract(wp / 3.0) - 0.5) * 3.0;
    float j = max(gLine(jq.x - 1.5, 0.006), gLine(jq.y - 1.5, 0.006)) * fine;
    col *= 1.0 - 0.35 * j;
    gGH -= 0.003 * j;
  }
  // ---- granite kerbs (flat strip shaded as a kerb): across t from the road edge, ramp in front of garages / crossings
  if (layer > 15.5) {
    float s = vLoc.x, t = vLoc.y;
    float ramp = clamp(vLoc.w, 0.0, 1.0), yellow = smoothstep(1.4, 1.6, vLoc.w);
    vec3 gran = vec3(0.73, 0.72, 0.69) * (0.88 + 0.2 * gNoise(vec2(s, t) * 35.0)) * (0.9 + 0.12 * gNoise(vec2(s * 0.7, 3.0)));
    if (uGDetOn > 0.5) gran *= mix(1.0, clamp(dot(texture(uGDet, vec3(vec2(s, t) / 1.5, 1.0)).rgb, vec3(0.333)) / max(uGDetMean[1], 0.05), 0.8, 1.2), 0.6);
    float face = mix(0.06, 0.018, ramp);
    float onFace = 1.0 - smoothstep(face - 0.004, face + 0.004, t);
    vec3 c = gran * mix(1.0, 0.5, onFace);
    c *= 1.0 - 0.5 * (1.0 - smoothstep(0.004, 0.014, t));
    float js = s / (0.8 + 0.2 * step(0.5, gHash2(vec2(floor(s / 0.8), 7.0))));
    c *= 1.0 - 0.4 * gLine(fract(js + 0.5) - 0.5, 0.006 / 0.8) * fine;
    c *= 1.0 + 0.12 * (smoothstep(face, face + 0.01, t) - smoothstep(face + 0.01, face + 0.03, t));
    c *= mix(1.0, 0.94 + 0.1 * (t / 0.28), ramp);
    float paint = yellow * (1.0 - smoothstep(0.1, 0.12, t)) * step(0.28, gNoise(vec2(s * 7.0, t * 25.0)));
    c = mix(c, vec3(0.92, 0.74, 0.08), paint * 0.9);
    col = c;
    gGH = 0.11 * (1.0 - onFace) * (1.0 - ramp * 0.8);
    gGRough = paint > 0.5 ? 0.6 : 0.85;
    #ifdef CLAY_RELIEF
    { // claymation: the kerb in fat blocks of pale grey clay half a metre long, each rounded at its ends and along its
      // top, a dark gap between them — and painted as raised: its face (towards the road) in shade, its rounded top
      // edge catching the light, its shadow on the road (the user's pictures)
      float real = step(7.5, vLoc.w), fl = vLoc.w - 8.0 * real; // (real: a roll with its own shape, ground.js curbRoll)
      ramp = clamp(fl, 0.0, 1.0); yellow = smoothstep(1.4, 1.6, fl);
      paint = yellow * (1.0 - smoothstep(0.1, 0.12, t)) * step(0.28, gNoise(vec2(s * 7.0, t * 25.0)));
      float bi = floor(s / 0.5), be = min(fract(s / 0.5), 1.0 - fract(s / 0.5)) * 0.5;
      float gap = 1.0 - smoothstep(0.006, 0.02, be);
      float fw = mix(0.13, 0.03, ramp) * (1.0 - real);                        // (the face, seen from the road — painted on the flat strip only)
      float f = (1.0 - smoothstep(fw - 0.01, fw + 0.01, t)) * (1.0 - real);
      float lip = smoothstep(fw, fw + 0.03, t) * (1.0 - smoothstep(fw + 0.03, fw + 0.09, t)); // (the rounded top edge)
      vec3 cc = vec3(0.8, 0.77, 0.71) * (0.9 + 0.14 * gHash2(vec2(bi, 5.0)));
      col = cc * mix(1.0, mix(0.38, 0.62, t / max(fw, 1e-3)), f) * (1.0 + 0.16 * lip) * (1.0 - 0.65 * gap);
      col = mix(col, vec3(0.92, 0.74, 0.08), paint * 0.9);
      gGH = mix(0.11 * (1.0 - f) * (1.0 - ramp * 0.8) * (1.0 - 0.6 * gap) + 0.025 * smoothstep(0.0, 0.07, be) * smoothstep(fw, fw + 0.06, t), 0.02 * smoothstep(0.0, 0.07, be), real);
      gGRough = 0.8;
    }
    #endif
  }
  #ifdef CLAY_RELIEF
  // claymation: the road's clay smoothed by hand in patches — lighter and darker smears half a metre to two across;
  // its crumbs and pits on the road only (slabs and kerbs are smoother pieces)
  if (layer < 1.5) col *= (0.84 + 0.2 * gNoise(wp * 0.55 + 3.3) + 0.12 * gNoise(wp * 1.7 + 9.1)) * vec3(1.18, 1.24, 1.5); // (a pinkish grey under the warm studio light, as in the pictures — not brown)
  gClayCavK = layer < 1.5 ? 1.0 : 0.3;
  if (gGRough < 0.0) gGRough = 0.8; // (the ground's clay is matt: no sheen of the low sun washing it white)
  if ((layer > 2.5 && layer < 3.5) || (layer > 14.5 && layer < 15.5)) {
    // claymation: the squares paved with rounded clay cobbles (the user's pictures) — each its own warm grey, swelling
    // from a sandy joint
    vec2 cq = wp / 0.24 + vec2(gNoise(wp * 0.8), gNoise(wp * 0.8 + 7.0)) * 0.6; // (stones of a palm and a half, as the pictures' squares)
    vec2 cv = gVor(cq);
    float bulge = 1.0 - pow(1.0 - smoothstep(0.0, 0.5, cv.x), 2.0);
    vec3 stone = vec3(0.15, 0.138, 0.155) * (0.82 + 0.3 * cv.y) * (0.92 + 0.16 * gNoise(wp * 3.0)); // (warm grey stones under the light, darker joints: the pictures)
    col = mix(vec3(0.095, 0.085, 0.085), stone, smoothstep(0.025, 0.065, cv.x)) * mix(0.87, 1.0, bulge);
    gGH += 0.026 * bulge;
  }
  if (layer > 4.5 && layer < 5.5) {
    // claymation: the sanded squares and gardens (albero) laid with big flags of sandstone clay, soft joints between —
    // the third picture's square
    vec2 aq = wp / 0.75 + vec2(gNoise(wp * 0.9), gNoise(wp * 0.9 + 5.0)) * 0.35;
    vec2 av = gVor(aq);
    vec3 flag = vec3(0.84, 0.64, 0.42) * (0.88 + 0.22 * av.y) * (0.94 + 0.12 * gNoise(wp * 2.3));
    col = mix(vec3(0.42, 0.34, 0.24), flag, smoothstep(0.02, 0.07, av.x));
    gGH += 0.014 * smoothstep(0.0, 0.25, av.x);
  }
  #endif
  // macro variation
  float n = gNoise(vWXZ * 0.035) * 0.6 + gNoise(vWXZ * 0.11) * 0.4;
  col *= mix(0.86, 1.1, n);
  diffuseColor.rgb *= col;
}
`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (gGRough >= 0.0) roughnessFactor = gGRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uGDetNOn > 0.5 && gGDetK > 0.01) {
  vec3 mapN = texture(uGDetN, vec3(gGDetUV, gGDetL)).xyz * 2.0 - 1.0;
  mapN.xy *= gGDetK;
  normal = normalize(gCotangent(normal, -vViewPosition, gGDetUV) * mapN);
}
if (gGH != 0.0) {
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(gGH), dhy = dFdy(gGH);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 nb = abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2);
  if (abs(det) > 1e-12 && dot(nb, nb) > 1e-24) normal = normalize(nb);
}`);
  };
  m.customProgramCacheKey = () => 'gnd3' + polygonOffset + (fx ? 'fx' : '');
  return m;
}

// Emissive-at-night basic material (street lamps, signs). Brightness follows uNight.
export function makeNightGlowMaterial(color, { dayLevel = 0.0, nightLevel = 3.0, map = null, transparent = false, additive = false } = {}) {
  const m = new THREE.MeshBasicMaterial({ color, map, transparent, depthWrite: !transparent, toneMapped: true });
  if (additive) { m.blending = THREE.AdditiveBlending; m.depthWrite = false; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;`)
      .replace('#include <opaque_fragment>', `outgoingLight *= mix(${dayLevel.toFixed(3)}, ${nightLevel.toFixed(3)}, uNight);
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `glow${dayLevel}_${nightLevel}_${additive}`;
  return m;
}
