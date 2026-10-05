// «Plastilina» — Guareña as a claymation film (Ajustes › Estética › Plastilina; the plan in docs/plastilina.md).
// Built on the diorama (its palette, sky, light and contact shadows: STYLE.diorama is on too), it turns every lit thing
// into modelling clay and the people, cars and animals into puppets animated pose by pose:
//  - the clay (installClayChunks): through three.js's own shader chunks, so every standard material takes it — lumps
//    from the hands that shaped it, thumbprints with their ridges, spatula cuts, a speck of lint here and there, the
//    colour never quite even, a soft waxy sheen, light that wraps a little into the shadow (warm, as clay is); the sets
//    keep their marks, the puppets are retouched at every pose (the «boil»)
//  - stop motion (StopMotion): 12 poses a second for the puppets — their bones and, but for the player, their place —
//    while the camera and the game itself run on as always (as in Kirby and the Rainbow Curse or Spider-Verse: the
//    figures «on twos», the camera «on ones»), and no motion blur
// What every film and game studied taught (Aardman, The LEGO Movie, Kirby, The Neverhood…) is in the plan.
import * as THREE from 'three';

export const PLASTILINA = {
  fps: 12, // poses per second (animation «on twos»)
  // the last grade: clay colours are pure, the studio fills the shadows a little, the lens darkens its corners a touch
  grade: { sat: 1.14, warm: 0.035, contrast: 1.06, lift: 0.03, vignette: 0.16 },
  flicker: 0.014, // the studio lamps' little flicker from one pose to the next (the frames of a stop-motion film never match)
  // the lens: how soft the far background goes at most (a fraction of the picture's height) and from how far behind the
  // subject it starts and is at its softest (× the subject's distance). Only a little: the user asked for it gentler
  lens: { blur: 0.0024, from: 2.4, to: 11 },
  boilMM: 0.002, // how far a puppet's surface boils from one pose to the next (metres)
  grain: 0.045, // «Película»: the film's grain
  // the animator's hand: a puppet put back each pose is never exactly where it was (metres, radians; the player less)
  jitter: { pos: 0.003, yaw: 0.006, player: 0.35 },
  // the clay of the sets (metres): lumps, prints, cuts, lint; the puppets take theirs at their own scale (CLAY_SCALE)
  boil: null, // the shared uniform (installClayChunks): moved at every pose, for the puppets only
};

// ---------------------------------------------------------------- the clay
// One plain object shared by every material (three.js copies uniform values that are plain objects by reference),
// so moving it once moves the boil of every puppet.
export function installClayChunks() {
  const C = THREE.ShaderChunk;
  const boil = { value: { x: 0, y: 0 } };
  for (const lib of ['standard', 'physical']) THREE.ShaderLib[lib].uniforms.uClayBoil = boil;
  PLASTILINA.boil = boil.value;
  C.common += `
#ifdef STANDARD
varying vec3 vClayP;
#endif
`;
  // (the pattern sits on each thing's own shape — its vertices before skinning — so it travels with the cars and people)
  // A puppet's surface also «boils»: between two frames the animator's fingers have been on it, so its skin never sits
  // quite where it sat — every pose its outline shifts by a millimetre or two, a few centimetres at a time
  C.begin_vertex += `
#ifdef STANDARD
vClayP = position;
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
vec2 gClaySlope; float gClayDark;
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
  gClaySlope = clamp(vec2(dFdx(cl.x), dFdy(cl.x)) / max(dl, vec2(1e-5)) * CLAY_RELIEF, -0.75, 0.75); // (the sets: CLAY_RELIEF, worked harder)
  gClayDark = cl.y;
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
    float coc(vec2 uv, float F) { float z = viewZ(texture2D(tDepth, uv).x); return smoothstep(F * LENS_FROM, F * LENS_TO, z); }
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
// after it they get their live state again. A puppet is a node tree (a character's group with its bones, a dog…);
// `smooth` keeps its place live and holds only its pose (the player: the camera follows it smoothly).
export class StopMotion {
  constructor(fps = PLASTILINA.fps) {
    this.dt = 1 / fps;
    this.acc = 0;
    this.tick = true;
    this.on = true;
    this.items = new Map(); // root -> { nodes, held, live, smooth }
    this.ticks = 0;
  }
  add(root, { smooth = false } = {}) { this.items.set(root, { nodes: null, held: null, live: null, smooth, n: -1 }); }
  remove(root) { this.items.delete(root); }
  setSmooth(root, smooth) { const it = this.items.get(root); if (it) it.smooth = smooth; }
  // once a frame, with the frame's real time: is this frame a new pose?
  advance(dt) {
    if (!this.on) { this.tick = true; return true; }
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
  time(t) { return this.on ? Math.floor(t / this.dt) * this.dt : t; }
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
  static apply(nodes, a, skipRoot) {
    for (let i = skipRoot ? 1 : 0; i < nodes.length; i++) {
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
    if (!this.on) return;
    const J = PLASTILINA.jitter;
    for (const [root, it] of this.items) {
      if (!root.parent || !root.visible) { it.held = null; continue; }
      // (the node list is gathered again when the tree changes: a hat put on, a level of detail swapped)
      let count = 0; root.traverse(() => count++);
      if (!it.nodes || count !== it.n) { it.nodes = this.nodesOf(root); it.n = count; it.held = null; }
      const newPose = this.tick || !it.held;
      if (newPose) {
        it.held = StopMotion.capture(it.nodes, it.held);
        const k = it.smooth ? J.player : 1;
        it.jit = [(Math.random() - 0.5) * 2 * J.pos * k, (Math.random() - 0.5) * 2 * J.pos * k, (Math.random() - 0.5) * 2 * J.yaw * k];
      }
      it.live = StopMotion.capture(it.nodes, it.live);
      if (!newPose) StopMotion.apply(it.nodes, it.held, it.smooth);
      if (it.jit && it.nodes[0] === root) { root.position.x += it.jit[0]; root.position.z += it.jit[1]; root.rotateY(it.jit[2]); } // (put back after the picture: release)
      it.swapped = true; this.swapped = true;
    }
  }
  // after drawing: the live state again, for the game to carry on from
  release() {
    if (!this.swapped) return;
    for (const it of this.items.values()) if (it.swapped) { StopMotion.apply(it.nodes, it.live, false); it.swapped = false; }
    this.swapped = false;
  }
}

export const SM = new StopMotion();
