// Sky, sun & moon, time of day (real solar geometry for Guareña in late September), clouds, fog, lights, IBL — and the
// weather of the real town (weather.js: `wx`), cloud, overcast, rain, fog and lightning, over both looks.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep } from './util.js';
import { STYLE } from './style.js';

const LAT = 38.86 * Math.PI / 180;
const DECL = -0.8 * Math.PI / 180; // ~24 September
const SOLAR_NOON = 14.42;          // local time (CEST) of solar noon at 6.1°W

export function sunDirection(hour, out = new THREE.Vector3()) {
  const H = (hour - SOLAR_NOON) * 15 * Math.PI / 180;
  const sinAlt = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const cosAz = (Math.sin(DECL) - Math.sin(alt) * Math.sin(LAT)) / (Math.cos(alt) * Math.cos(LAT));
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (H > 0) az = Math.PI * 2 - az;
  // world: x east, z south (north = -z)
  out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
  return out;
}

// palette keyed by sun altitude (sin): night, twilight, golden, day
const KEYS = [
  { a: -0.3, zen: 0x05081a, hor: 0x0d1428, warm: 0x121a30, gnd: 0x07090e, sun: 0x000000 },
  { a: -0.08, zen: 0x121c44, hor: 0x3a3456, warm: 0x7a4a52, gnd: 0x151419, sun: 0x552a18 },
  { a: 0.0, zen: 0x27438a, hor: 0xd7865a, warm: 0xff8a3c, gnd: 0x4a3e38, sun: 0xff7a2a },
  { a: 0.12, zen: 0x2d5cb8, hor: 0xe8b98c, warm: 0xffb060, gnd: 0x8a7c68, sun: 0xffc27a },
  { a: 0.35, zen: 0x2f6bd0, hor: 0xa9cbee, warm: 0xd4e2f2, gnd: 0xb3ab98, sun: 0xfff2d8 },
  { a: 1.0, zen: 0x2a62cc, hor: 0x9cc4ec, warm: 0xc9dcf2, gnd: 0xb8b0a0, sun: 0xffffff },
];
// claymation: the sky is the studio's backdrop — one even cyan blue by day, painted on plaster (no pale horizon), as in
// the user's pictures; a deeper blue than the physical sky at dawn, dusk and night, and warm low suns
const KEYS_CLAY = [
  { a: -0.3, zen: 0x08102a, hor: 0x16203c, warm: 0x1c2640, gnd: 0x0a0c12, sun: 0x000000 },
  { a: -0.08, zen: 0x1a2a58, hor: 0x4a3c58, warm: 0x8a5a50, gnd: 0x1a1816, sun: 0x5a3020 },
  { a: 0.0, zen: 0x2f4f96, hor: 0xe09a68, warm: 0xff9a50, gnd: 0x5a4a3c, sun: 0xff8a40 },
  { a: 0.12, zen: 0x3570c0, hor: 0xeac49a, warm: 0xffc078, gnd: 0x9a8668, sun: 0xffc98a },
  { a: 0.35, zen: 0x5aa7cc, hor: 0x7bb8d2, warm: 0xd2dcd8, gnd: 0xbfa880, sun: 0xffe2b8 },
  { a: 1.0, zen: 0x57a5cb, hor: 0x78b6d1, warm: 0xcedad8, gnd: 0xc4ad87, sun: 0xffeccf },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
const NIGHT_FILL = new THREE.Color(0.27, 0.33, 0.47), NIGHT_GND = new THREE.Color(0.11, 0.1, 0.09);
const WHITE = new THREE.Color(1, 1, 1);
// claymation: the studio's lamps and fills (warm: no blue in the shade)
const CLAY = {
  sun: new THREE.Color(1, 0.97, 0.9), key: new THREE.Color(1.0, 0.89, 0.74), fill: new THREE.Color(0.98, 0.94, 0.88),
  studio: new THREE.Color(1.0, 0.91, 0.8), ground: new THREE.Color(0.88, 0.76, 0.58), bounce: new THREE.Color(1.0, 0.84, 0.64),
  air: new THREE.Color(0.93, 0.88, 0.8), walls: new THREE.Color(0.96, 0.89, 0.76),
};
const REAL = { fill: new THREE.Color(0.86, 0.84, 0.8), walls: new THREE.Color(0.9, 0.84, 0.72), haze: new THREE.Color(0.8, 0.77, 0.72) };
const _c = new THREE.Color(), _sunCol = new THREE.Color();
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _lz = new THREE.Vector3(), _sf = new THREE.Vector3(), _fw = new THREE.Vector3();
function paletteAt(alt, key, out) {
  const K = STYLE.plastilina ? KEYS_CLAY : KEYS;
  let i = 0;
  while (i < K.length - 2 && alt > K[i + 1].a) i++;
  const A = K[i], B = K[i + 1];
  const t = clamp((alt - A.a) / (B.a - A.a), 0, 1);
  _ca.setHex(A[key]); _cb.setHex(B[key]);
  return out.copy(_ca).lerp(_cb, t);
}

// The daytime sky is the physical one (Preetham scattering, behind); this dome draws on top of it the clouds, and from
// dusk on the whole night sky (palette, Milky Way, the glow of the town) — so it is transparent by day.
function makeSkyMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uSun, uZen, uHor, uWarm, uGnd, uSunCol; uniform float uTime, uNight, uCloud, uOver, uRain, uFlash;
      varying vec3 vDir;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        // horizon colour warms towards the sun azimuth at dawn/dusk
        vec2 hs = normalize(uSun.xz + 1e-5), hd = normalize(d.xz + 1e-5);
        float toward = pow(max(dot(hs, hd), 0.0), 3.0);
        vec3 hor = mix(uHor, uWarm, toward);
        vec3 col = mix(hor, uZen, pow(clamp(h, 0.0, 1.0), 0.42));
        col = mix(col, uGnd, smoothstep(0.0, -0.12, h));
        // sun glow + disc
        float sd = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.5);
        col += uSunCol * smoothstep(0.99955, 0.99985, sd) * 12.0 * step(-0.02, uSun.y);
        // at night: the Milky Way across the sky and the glow of the town low on the horizon
        if (uNight > 0.01) {
          vec3 bandN = normalize(vec3(0.42, 0.28, 0.86));
          float band = exp(-pow(dot(d, bandN) / 0.2, 2.0)) * smoothstep(0.0, 0.25, h);
          float mw = band * (0.55 + 0.9 * fbm(d.xz / (h + 0.3) * 3.0 + d.y * 4.0)) * (0.6 + 0.4 * fbm(d.xy * 9.0));
          col += vec3(0.16, 0.17, 0.22) * mw * uNight * 0.55;
          col += vec3(0.2, 0.13, 0.08) * exp(-max(h, 0.0) * 14.0) * uNight * 0.22;
        }
        // clouds on a flat layer (a second, finer octave gives them some body and a darker belly)
        float cov = 0.0; vec3 cc = col;
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0016);
          float c = fbm(uv), c2 = fbm(uv * 3.1 + 5.3);
          // (how much of the sky they take: the game's usual few at 0.42, as always; a clear sky next to none; a cloudy
          // one, most of it)
          float lo = uCloud <= 0.42 ? 0.8 - uCloud * 0.143 : 0.74 - (uCloud - 0.42) * 0.72;
          cov = smoothstep(lo, lo + 0.163, c * 0.85 + c2 * 0.15) * smoothstep(0.0, 0.12, h);
          vec3 lit = mix(vec3(1.0, 0.98, 0.95), uSunCol * 1.2 + vec3(0.2), 0.35 * (1.0 - smoothstep(0.0, 0.4, uSun.y)));
          cc = mix(hor * 0.9, lit, 0.45 + 0.55 * pow(sd, 3.0));
          cc *= 0.78 + 0.22 * smoothstep(0.35, 0.8, c2); // thicker parts in shade
          cc = mix(cc, uZen * 0.35, uNight * 0.85);
        }
        float nightK = smoothstep(-0.03, -0.15, uSun.y); // 0: the physical sky shows, 1: our night sky
        vec3 full = mix(col, cc, cov * 0.85);
        vec3 rgb = mix(cc, full, nightK); float alpha = mix(cov * 0.85, 1.0, nightK);
        // overcast: a grey deck over the whole sky down to the horizon (darker where it rains, the town's lights on its
        // belly at night), which hides the sun; lit up for an instant by the lightning
        if (uOver > 0.001 || uFlash > 0.001) {
          float dayK = smoothstep(-0.12, 0.25, uSun.y);
          vec2 ouv = d.xz / (max(h, 0.0) + 0.1) * 0.8 + vec2(uTime * 0.006, uTime * 0.002);
          // (the deck has its clouds: rolls and masses with darker bellies, paler gaps between them; heavier and darker
          // the harder it rains)
          float m1 = fbm(ouv * 0.9), m2 = fbm(ouv * 2.6 + 3.1);
          float mass = smoothstep(0.3, 0.78, m1 * 0.7 + m2 * 0.3);
          vec3 ovLit = mix(vec3(0.78, 0.8, 0.84), vec3(0.52, 0.54, 0.58), uRain), ovDark = mix(vec3(0.48, 0.5, 0.55), vec3(0.19, 0.2, 0.24), uRain);
          vec3 ov = mix(ovLit, ovDark, mass * (0.6 + 0.4 * uRain)) * (0.94 + 0.12 * fbm(ouv * 7.0 + 1.3));
          ov = mix(ov, ov * (uWarm * 0.7 + 0.45), 0.4 * (1.0 - smoothstep(0.02, 0.3, uSun.y)) * dayK);
          ov *= mix(0.07, 1.0, dayK);
          ov += vec3(0.06, 0.04, 0.025) * (1.0 - dayK) * exp(-max(h, 0.0) * 5.0);
          ov += vec3(0.72, 0.76, 0.9) * uFlash * (0.55 + 0.45 * fbm(ouv * 2.0 + 3.0));
          float ovA = min(1.0, max(uOver * 1.15, uFlash * 0.8)) * smoothstep(-0.1, 0.04, h); // (closed before it is quite whole: not a glint of the sun through it)
          rgb = mix(rgb, ov, ovA); alpha = max(alpha, ovA);
        }
        gl_FragColor = vec4(rgb, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// claymation: the sky is the set's painted backdrop — a soft gradient with a painter's brush in it — and the clouds are
// cotton wool, the stop-motion way: round puffs, fibrous at their edges, lit from above, a little lilac underneath
function makeClaySkyMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uSun, uZen, uHor, uWarm, uGnd, uSunCol; uniform float uTime, uNight, uCloud, uOver, uRain, uFlash;
      varying vec3 vDir;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      // round puffs: the nearest of a few jittered centres, each puff a ball of cotton
      vec2 puffs(vec2 p) { vec2 i = floor(p), f = fract(p); float d = 9.0, id = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(h2(i + g), h2(i + g + 7.3)) * 0.8 + 0.1;
          float r = 0.32 + 0.22 * h2(i + g + 3.1), dd = length(g + o - f) / r; if (dd < d) { d = dd; id = h2(i + g + 9.7); } }
        return vec2(d, id); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec2 hs = normalize(uSun.xz + 1e-5), hd = normalize(d.xz + 1e-5);
        float toward = pow(max(dot(hs, hd), 0.0), 2.5);
        vec3 hor = mix(uHor, uWarm, toward * 0.35);
        vec3 col = mix(hor, uZen, smoothstep(0.0, 0.6, pow(max(h, 0.0), 0.8)));
        col = mix(col, uGnd, smoothstep(0.0, -0.1, h));
        // overcast: the backdrop repainted the grey of a rainy day (a painter's grey, a little lilac, darker in the rain;
        // soft darker swathes), under the same brush
        if (uOver > 0.001) {
          float dayK = smoothstep(-0.12, 0.25, uSun.y);
          vec3 ov = mix(vec3(0.56, 0.57, 0.63), vec3(0.34, 0.35, 0.41), uRain) * (0.9 + 0.18 * fbm(vec2(atan(d.x, d.z) * 2.0, h * 5.0) + uTime * 0.002));
          ov = mix(ov, ov * (uWarm * 0.6 + 0.55), 0.35 * (1.0 - smoothstep(0.02, 0.3, uSun.y)) * dayK);
          ov *= mix(0.13, 1.0, dayK);
          col = mix(col, ov, uOver * smoothstep(-0.08, 0.04, h));
        }
        // the painter's brush: long soft strokes in the backdrop's colour, over a plaster wall dabbed with a sponge (its
        // little bumps lit from above)
        vec2 bp = vec2(atan(d.x, d.z) * 3.0, h * 9.0);
        col *= 0.97 + 0.06 * fbm(vec2(bp.x * 0.7, bp.y * 3.0));
        vec2 sp = vec2(atan(d.x, d.z) * 260.0, h * 260.0);
        float st0 = fbm(sp), st1 = fbm(sp + vec2(0.0, 0.6));
        col *= 0.94 + 0.1 * st0 + 0.16 * (st1 - st0);
        vec2 bs = vec2(atan(d.x, d.z) * 9.0, h * 30.0); // (and the broad strokes of the brush that painted it)
        col *= 0.95 + 0.1 * fbm(vec2(bs.x * 1.3 + fbm(bs * 0.5) * 2.0, bs.y * 0.4));
        float sd = max(dot(d, uSun), 0.0), up = step(-0.03, uSun.y) * (1.0 - uOver); // (behind the clouds: no sun)
        col += uSunCol * (pow(sd, 8.0) * 0.12 + pow(sd, 64.0) * 0.22) * up;
        col = mix(col, uSunCol * 1.4 + 0.45, smoothstep(0.9993, 0.9996, sd) * up); // (a painted disc)
        col += vec3(0.16, 0.11, 0.08) * exp(-max(h, 0.0) * 12.0) * uNight * 0.3;
        // (uCloud −1: the cotton clouds hang in front instead — unless the sky clouds over: then the backdrop fills with
        // cotton overhead too, grey and heavy in the rain)
        float cc = uCloud > -0.5 ? uCloud : uOver * 1.7 - 0.25;
        if (h > -0.02 && cc > -0.1) {
          vec2 uv = d.xz / (h + 0.16) * 0.9 + vec2(uTime * 0.002, uTime * 0.0007);
          float big = fbm(uv * 0.35 + 5.0);                                  // where the cotton gathers
          vec2 pf = puffs(uv * 1.6);
          float fib = fbm(uv * 14.0 + 3.0) * 0.6 + fbm(uv * 40.0 + 1.0) * 0.4; // its fibres
          float edge = pf.x + (fib - 0.5) * 0.55;
          float th = 1.0 - (big - 0.42 + cc * 0.25) * 1.6;                    // (fewer puffs where the sky is clear)
          float m = (1.0 - smoothstep(th - 0.08, th + 0.04, edge)) * smoothstep(-0.01, 0.12, h) * mix(1.0 - smoothstep(0.5, 0.95, h) * 0.6, 1.0, uOver);
          // lit from above and from the sun's side; a lilac grey underneath and in its folds
          float shade = clamp(0.55 + 0.45 * (1.0 - pf.x) + 0.25 * (fib - 0.5) + 0.2 * dot(normalize(vec3(uSun.x, 0.6, uSun.z)), vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
          vec3 lit = mix(vec3(0.82, 0.8, 0.88), vec3(1.0, 0.99, 0.97), shade);
          lit = mix(lit, lit * (uSunCol * 0.5 + 0.55), 0.35 * (1.0 - smoothstep(0.0, 0.4, uSun.y)));
          lit = mix(lit, mix(vec3(0.64, 0.64, 0.7), vec3(0.3, 0.3, 0.36), uRain) * (0.75 + 0.35 * shade), uOver); // (rain clouds: grey cotton, darker than the sky behind it in the rain)
          lit = mix(lit, uZen * 0.5 + vec3(0.04, 0.045, 0.07), uNight * 0.85);
          col = mix(col, lit, m * (0.97 - 0.35 * uNight));
        }
        col += vec3(0.8, 0.82, 0.95) * uFlash * 0.75 * smoothstep(-0.05, 0.3, h); // (a lightning flash lights the whole backdrop)
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// claymation: the clouds are tufts of cotton wool hung in front of the painted backdrop, as in a stop-motion set — a
// few clumps of soft balls round the town (low on the backdrop), each lit by the sun as a ball is: bright on top, a soft
// grey underneath. They go with the camera, like the backdrop (always as far)
function buildCottonClouds() {
  let sd = 77031; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const balls = [];
  const clumpOf = []; // (each ball's tuft's threshold: the order the tufts are hung in as the sky clouds over)
  for (let c = 0; c < 72; c++) {
    const rank = ((c * 37) % 72) / 72 * 0.9 + 0.05, n0 = balls.length;
    const th = (c / 72) * Math.PI * 2 + (rnd() - 0.5) * 0.2, R = 1300 + rnd() * 400, el = (rnd() < 0.75 ? 4 + rnd() * 12 : 16 + rnd() * 16) * Math.PI / 180; // (most low, just above the roofs)
    const cx = Math.sin(th) * R, cz = Math.cos(th) * R, cy = Math.tan(el) * R + 30;
    const S = 58 + rnd() * 52, tx = Math.cos(th), tz = -Math.sin(th); // (a round tuft of cotton across the view)
    const put = (along, up, r) => balls.push([cx + tx * along, cy + up, cz + tz * along + (rnd() - 0.5) * S * 0.25, r]);
    put(0, S * 0.18, S * (0.55 + rnd() * 0.1));                                   // the big puff
    for (const sd of [-1, 1]) {                                                    // smaller ones down each side
      const m = 1 + Math.floor(rnd() * 2);
      for (let k = 1; k <= m; k++) { const r = S * (0.42 - k * 0.09 + rnd() * 0.06); put(sd * S * (0.5 + 0.38 * (k - 1) + rnd() * 0.08), r * 0.15, r); }
    }
    if (rnd() < 0.7) put((rnd() - 0.5) * S * 0.5, S * 0.55, S * (0.32 + rnd() * 0.08)); // a puff on top
    for (let i = n0; i < balls.length; i++) clumpOf.push(rank);
  }
  const geo = new THREE.SphereGeometry(1, 22, 16);
  const mat = new THREE.MeshStandardMaterial({ color: 0xfbf6ec, roughness: 1, metalness: 0, fog: false, emissive: 0x5a5048 });
  mat.defines = { CLAY_SET: '3', CLAY_TILE: '18.0', CLAY_AMP: '0.9', CLAY_CAV: '0.12' }; // (its fibres: the clay's pores at the cloud's own size; a little glow of its own — lit cotton is never grey)
  const m = new THREE.InstancedMesh(geo, mat, balls.length), M = new THREE.Matrix4(), q = new THREE.Quaternion();
  balls.forEach(([x, y, z, r], i) => m.setMatrixAt(i, M.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r, r * 0.86, r * 0.8))));
  m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.renderOrder = -90; m.name = 'cotton';
  m.userData.balls = balls; m.userData.clump = clumpOf; m.userData.cover = -1;
  return m;
}
// how much of the cotton is hung: the game's usual sky (cover 0.42) has every tuft; a clear sky none; a cloudier one
// bigger tufts. A tuft grows in or shrinks away (never pops), each at its own threshold
function hangCotton(m, cover) {
  const U = m.userData;
  if (Math.abs(cover - U.cover) < 0.004) return;
  U.cover = cover;
  const show = clamp((cover - 0.04) / 0.33, 0, 1.2), big = 1 + Math.max(0, cover - 0.42) * 0.9; // (at 0.42: every tuft, whole)
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  U.balls.forEach(([x, y, z, r], i) => {
    const k = clamp((show - U.clump[i]) * 7, 0, 1) * big;
    m.setMatrixAt(i, M.compose(v.set(x, y, z), q, sc.set(r * k + 1e-4, r * 0.86 * k + 1e-4, r * 0.8 * k + 1e-4)));
  });
  m.instanceMatrix.needsUpdate = true;
}

export class SkySystem {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.hour = 18.6;
    this.q = quality;
    this.uniforms = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uWarm: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uTime: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0.42 }, uOver: { value: 0 }, uRain: { value: 0 }, uFlash: { value: 0 },
    };
    // the weather (weather.js eases it towards the real town's): cloud cover, overcast, rain, snow, fog (and how far one
    // sees in it, m), storm, wind (0–1 and m/s), a lightning flash. These values are the game's usual sky
    this.wx = { cover: 0.42, over: 0, rain: 0, snow: 0, fog: 0, fogFar: 3000, storm: 0, wind: 0, windX: 0, windZ: 0, flash: 0 };
    const skyMaterial = () => (STYLE.plastilina ? makeClaySkyMaterial(this.uniforms) : makeSkyMaterial(this.uniforms));
    this.mat = skyMaterial();
    if (!STYLE.plastilina) { // physical daytime sky (Rayleigh + Mie scattering): real blues, a white haze at the horizon, orange sunsets
      this.phys = new Sky();
      this.phys.scale.setScalar(3800);
      this.phys.frustumCulled = false;
      this.phys.renderOrder = -101;
      const pu = this.phys.material.uniforms;
      pu.turbidity.value = 3.2; pu.rayleigh.value = 1.35; pu.mieCoefficient.value = 0.0038; pu.mieDirectionalG.value = 0.82;
      scene.add(this.phys);
    }
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;
    scene.add(this.dome);
    if (STYLE.plastilina) { this.cotton = buildCottonClouds(); scene.add(this.cotton); }
    // stars
    const n = 5200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n);
    const bandN = new THREE.Vector3(0.42, 0.28, 0.86).normalize();
    for (let i = 0; i < n; i++) {
      let th, ph, v = new THREE.Vector3();
      // a third of them crowd along the Milky Way
      for (let k = 0; k < 6; k++) { th = Math.random() * Math.PI * 2; ph = Math.acos(Math.random() * 0.97); v.set(Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)); if (i % 3 || Math.abs(v.dot(bandN)) < 0.22) break; }
      const r = 3800;
      pos[i * 3] = v.x * r; pos[i * 3 + 1] = v.y * r; pos[i * 3 + 2] = v.z * r;
      const m = Math.pow(Math.random(), 3.2); // magnitude: most are faint
      const b = 0.14 + m * 0.8; // the town's lights wash out the faintest
      const tint = Math.random();
      col[i * 3] = b * (tint < 0.15 ? 1.0 : tint > 0.85 ? 0.82 : 0.95); col[i * 3 + 1] = b * 0.95; col[i * 3 + 2] = b * (tint < 0.15 ? 0.8 : tint > 0.85 ? 1.05 : 1.0);
      siz[i] = 0.9 + m * 2.4;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sg.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    const starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uTime: this.uniforms.uTime, uPR: { value: Math.min(devicePixelRatio || 1, 2) } },
      vertexShader: `attribute float size; varying vec3 vCol; varying float vTw; uniform float uTime, uPR;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.99999;
          float ph = dot(position, vec3(0.013, 0.017, 0.011)); vTw = 0.78 + 0.22 * sin(uTime * (1.3 + fract(ph) * 2.0) + ph * 50.0);
          gl_PointSize = size * uPR; }`,
      fragmentShader: `uniform float uOpacity; varying vec3 vCol; varying float vTw;
        void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
          float a = exp(-r2 * 3.2); gl_FragColor = vec4(vCol * a * vTw * uOpacity, 1.0); }`,
      vertexColors: true,
    });
    this.stars = new THREE.Points(sg, starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -99;
    scene.add(this.stars);
    // moon
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const x = mc.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.35, 'rgba(250,245,225,1)'); g.addColorStop(0.42, 'rgba(200,210,255,0.25)'); g.addColorStop(1, 'rgba(160,180,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(260);
    this.moon.renderOrder = -98;
    scene.add(this.moon);
    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality.shadows > 0;
    const sm = quality.shadows >= 2 ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    this.shadowSize = quality.shadows >= 2 ? 70 : 55;
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowSize; sc.right = this.shadowSize; sc.top = this.shadowSize; sc.bottom = -this.shadowSize;
    sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = STYLE.plastilina ? 6.5 : 2.5; // (claymation: the soft shadows of studio lamps)
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a60, 0.6);
    scene.add(this.hemi);
    // claymation: the bounce of the sunlit street and walls lighting the shade back, warm (a fill light: no shadows)
    if (STYLE.plastilina) { this.bounce = new THREE.DirectionalLight(0xffdcb0, 0); scene.add(this.bounce, this.bounce.target); }
    this.fog = new THREE.Fog(0xcad6e0, 150, 1600);
    scene.fog = this.fog;
    this.sunDir = new THREE.Vector3();
    // IBL: the same sky rendered into a PMREM environment map
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // (redrawn into the same target every time: a new one every 3 s was a new texture for the environment, and every
    // material in town worked its shader's parameters out again for it — a hitch every 3 s — besides the GPU making
    // and freeing the target)
    { const alloc = this.pmrem._allocateTargets.bind(this.pmrem); this.pmrem._allocateTargets = () => this.envRT || alloc(); }
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial()));
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(90, 24), new THREE.MeshBasicMaterial({ color: 0x8a7e6c }));
    this.envGround.rotation.x = -Math.PI / 2; this.envGround.position.y = -2;
    this.envScene.add(this.envGround);
    // sunlit whitewashed facades all around: the warm bounce that fills the shade of a village street
    this.envBand = new THREE.Mesh(new THREE.CylinderGeometry(95, 95, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xd8cdb8, side: THREE.BackSide }));
    this.envBand.position.y = 17;
    this.envScene.add(this.envBand);
    // dust & haze of the Vegas: the ambient light is less saturated than the deep blue we see overhead
    this.envHaze = new THREE.Mesh(new THREE.SphereGeometry(98, 16, 8), new THREE.MeshBasicMaterial({ color: 0xc9c4ba, transparent: true, opacity: 0.38, side: THREE.BackSide, depthWrite: false }));
    this.envHaze.renderOrder = 1;
    this.envScene.add(this.envHaze);
    this.envTimer = 0;
    this.envRT = null;
    this.night = 0;
    this.cloud = 0.42;
    this.update(0, new THREE.Vector3(), true);
  }

  get timeString() {
    const h = Math.floor(this.hour) % 24, m = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // the dome, the stars, the moon and the sun's shadow box around another point (the street seen from a window)
  placeAt(focus) {
    if (!this.lightDir) return;
    this.dome.position.copy(focus); if (this.phys) this.phys.position.copy(focus); this.stars.position.copy(focus); if (this.cotton) this.cotton.position.set(focus.x, 0, focus.z);
    this.moon.position.copy(focus).addScaledVector(this.moonDir, 3500);
    this.shadowBox(focus, this.lightDir, null);
  }
  // The sun's shadow box: centred where the camera looks (ahead of it along the ground — further ahead from a camera
  // high up, like the menu's flyover), and held on its own texel grid, in the light's frame: a move of the camera shifts
  // the shadow map by whole texels only, so the edges of the shadows and the pattern of their filtering stay where they
  // are. (It was centred on the camera and snapped on the town's x/z grid, which is not the shadow map's: every move
  // slid the map by a fraction of a texel, and the shadows on the ground flickered — patches of street going from shade
  // to light and back, white specks; and seen from above, most of the street in view lay at the box's edge.)
  shadowBox(focus, ld, view) {
    const S = this.shadowSize, texel = (S * 2) / this.sun.shadow.mapSize.x;
    const c = _sf.set(focus.x, 0, focus.z);
    if (view) {
      view.getWorldDirection(_fw); _fw.y = 0;
      const l = _fw.length();
      if (l > 1e-3) c.addScaledVector(_fw, Math.min(S * 0.8, S * 0.3 + Math.max(0, focus.y) * 1.5) / l);
    }
    const z = _lz.copy(ld).normalize(), x = _lx.set(0, 1, 0).cross(z);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0); else x.normalize();
    const y = _ly.copy(z).cross(x);
    const px = Math.round(c.dot(x) / texel) * texel, py = Math.round(c.dot(y) / texel) * texel;
    this.sun.target.position.set(0, 0, 0).addScaledVector(x, px).addScaledVector(y, py).addScaledVector(z, c.dot(z));
    this.sun.position.copy(this.sun.target.position).addScaledVector(z, 250);
    this.sun.target.updateMatrixWorld();
  }

  // view: the camera, to put the shadows where it looks
  update(dt, focus, forceEnv = false, view = null) {
    const d = sunDirection(this.hour, this.sunDir);
    const alt = d.y;
    const U = this.uniforms;
    U.uSun.value.copy(d);
    paletteAt(alt, 'zen', U.uZen.value);
    paletteAt(alt, 'hor', U.uHor.value);
    paletteAt(alt, 'warm', U.uWarm.value);
    paletteAt(alt, 'gnd', U.uGnd.value);
    paletteAt(alt, 'sun', U.uSunCol.value);
    U.uTime.value += dt;
    const W = this.wx, ov = W.over;
    this.cloud = W.cover;
    U.uCloud.value = this.cotton ? -1 : this.cloud;
    U.uOver.value = ov; U.uRain.value = Math.max(W.rain, W.storm * 0.8, W.snow * 0.5); U.uFlash.value = W.flash;
    const day = smoothstep(-0.08, 0.12, alt);
    const golden = 1 - smoothstep(0.05, 0.35, alt);
    this.night = 1 - smoothstep(-0.12, 0.03, alt);
    U.uNight.value = this.night;
    this.dome.position.copy(focus);
    if (this.cotton) {
      this.cotton.position.set(focus.x, 0, focus.z);
      // (the cotton hung as the sky clouds over; grey cotton under a rainy sky, lit for an instant by the lightning)
      hangCotton(this.cotton, W.cover);
      const cm = this.cotton.material;
      cm.color.setHex(0xfbf6ec).lerp(_c.setRGB(0.4, 0.4, 0.45), ov * 0.85);
      cm.emissive.setHex(0x5a5048).multiplyScalar(1 - ov * 0.75).lerp(_c.setRGB(0.9, 0.92, 1), W.flash * 0.6);
    }
    if (this.phys) {
      this.phys.position.copy(focus);
      this.phys.material.uniforms.sunPosition.value.copy(d);
      this.phys.material.uniforms.turbidity.value = Math.min(20, 2.8 + this.cloud * 2.4 + ov * 7); // hazier with more cloud
      this.phys.visible = alt > -0.2;
    }
    this.stars.position.copy(focus);
    this.stars.material.uniforms.uOpacity.value = this.night * (1 - (this.cloud || 0) * 0.5) * (1 - ov); // (no stars through a cloud deck)
    // moon opposite-ish to the sun, high at night
    const md = (this.moonDir || (this.moonDir = new THREE.Vector3())).set(-d.x * 0.6 + 0.2, Math.max(0.15, -d.y * 0.9 + 0.25), -d.z * 0.6 - 0.3).normalize();
    this.moon.position.copy(focus).addScaledVector(md, 3500);
    this.moon.material.opacity = this.night * (1 - ov * 0.95);
    // sun light
    const sunCol = paletteAt(Math.max(alt, 0.0), 'sun', _sunCol);
    if (alt > -0.02) {
      let ld = d;
      if (!STYLE.plastilina) {
        this.sun.color.copy(sunCol).lerp(WHITE, 0.25);
        this.sun.intensity = 4.4 * smoothstep(-0.02, 0.16, alt);
      } else {
        // (the key lamp of a studio set: the afternoon sun's warmth, softer — the whites never burn out, so the clay's
        // dabs show in the light too)
        this.sun.color.copy(sunCol).lerp(CLAY.sun, 0.1).lerp(CLAY.key, 0.4);
        this.sun.intensity = 5.2 * 0.74 * smoothstep(-0.02, 0.16, alt);
        // (and never overhead: a lamp at most 40° up, where the sun stands round the sky — one pavement in the light, the
        // other in shade, every dab of clay standing out, as in the user's pictures)
        const s40 = Math.sin(40 * Math.PI / 180);
        if (d.y > s40) { const hx = d.x, hz = d.z, hl = Math.hypot(hx, hz) || 1, c40 = Math.cos(40 * Math.PI / 180); ld = (this._keyDir || (this._keyDir = new THREE.Vector3())).set(hx / hl * c40, s40, hz / hl * c40); }
      }
      this.sun.position.copy(focus).addScaledVector(ld, 250);
      this.lightDir = (this.lightDir || new THREE.Vector3()).copy(ld);
    } else {
      this.sun.color.setRGB(0.6, 0.7, 0.95);
      this.sun.intensity = 0.9 * this.night; // moonlight: soft blue light and long shadows
      this.sun.position.copy(focus).addScaledVector(md, 250);
      this.lightDir = (this.lightDir || new THREE.Vector3()).copy(md);
    }
    this.sun.intensity *= 1 - 0.82 * ov; // (behind the clouds: hardly any direct sun, and its shadows fade with it)
    this.shadowBox(focus, this.lightDir, view);
    // hemisphere: sky & ground bounce
    // at night the moon and the glow of the town on the haze keep every street readable (never pitch black)
    if (!STYLE.plastilina) {
      this.hemi.color.copy(U.uZen.value).lerp(U.uHor.value, 0.55).lerp(REAL.fill, 0.62 * day).lerp(NIGHT_FILL, this.night * 0.85);
      this.hemi.groundColor.copy(U.uGnd.value).multiplyScalar(0.85).lerp(NIGHT_GND, this.night * 0.8);
      this.hemi.intensity = lerp(0.45, 0.5, day) + this.night * 0.8;
    } else { // claymation: the studio fills the set — a clear, warm shade, never dark (the key lamp still models it)
      this.hemi.color.copy(U.uZen.value).lerp(U.uHor.value, 0.5).lerp(CLAY.fill, 0.7 * day).lerp(NIGHT_FILL, this.night * 0.85).lerp(CLAY.studio, 0.82 * day);
      this.hemi.groundColor.copy(U.uGnd.value).lerp(CLAY.ground, 0.7 * day).lerp(NIGHT_GND, this.night * 0.8); // (warm like the sand of the pavements)
      this.hemi.intensity = lerp(0.5, 1.35, day) + this.night * 0.8;
      // the bounce comes from the side away from the sun, a little above the street
      const b = this.bounce;
      b.color.copy(U.uGnd.value).lerp(CLAY.bounce, 0.65);
      b.intensity = 0.95 * day * smoothstep(-0.02, 0.16, alt);
      b.target.position.copy(focus);
      b.position.set(-d.x, 0, -d.z).normalize().setY(0.35).normalize().multiplyScalar(100).add(focus);
      b.target.updateMatrixWorld();
    }
    // overcast: the light comes from the whole sky, greyer and even (a little more of it while the sun is gone, less in
    // the rain); a lightning flash, for an instant, white
    if (ov > 0.001 || W.flash > 0.001 || W.rain > 0.001) {
      const wet = Math.max(W.rain, W.storm * 0.8, W.snow * 0.5);
      this.hemi.color.lerp(_c.setRGB(0.8, 0.82, 0.86), (STYLE.plastilina ? 0.45 : 0.55) * ov * day);
      this.hemi.intensity *= (STYLE.plastilina ? 1 - 0.16 * ov * day : 1 + 0.14 * ov * day) * (1 - (STYLE.plastilina ? 0.28 : 0.18) * wet); // (claymation: the studio's lamps turned down for a grey day)
      if (this.bounce) this.bounce.intensity *= 1 - 0.9 * ov;
      this.hemi.color.lerp(_c.setRGB(0.88, 0.92, 1), Math.min(1, W.flash));
      this.hemi.intensity += W.flash * 2.4;
    }
    // fog matches the horizon
    if (!STYLE.plastilina) {
      this.fog.color.copy(U.uHor.value).lerp(U.uZen.value, 0.15);
      this.fog.near = lerp(60, 280, day); this.fog.far = lerp(800, 2600, day);
      this.renderer.toneMappingExposure = lerp(1.08, 0.68, day) + golden * day * 0.06;
    } else { // (claymation: only as much air as the distance needs, no milky haze over the streets; the whites keep their clay)
      this.fog.color.copy(U.uHor.value).lerp(CLAY.air, 0.25 * day);
      this.fog.near = lerp(120, 520, day); this.fog.far = lerp(1200, 4200, day);
      this.renderer.toneMappingExposure = 0.9 + golden * day * 0.05;
    }
    // rain and fog close the distance in, and the air goes the grey of the clouds
    const wetK = Math.max(W.rain * 0.55, W.snow * 0.7, W.fog);
    if (wetK > 0.001 || ov > 0.001) {
      const far0 = this.fog.far, far = Math.min(W.fog > 0.01 ? lerp(far0, Math.min(far0, W.fogFar), W.fog) : far0, far0 * (1 - 0.55 * Math.max(W.rain, W.snow)));
      this.fog.far = far;
      this.fog.near = Math.min(this.fog.near, lerp(this.fog.near, W.fog > 0.5 ? 0 : far * 0.05 + 4, Math.max(W.fog, W.rain * 0.5))); // (in a real fog it starts at your feet)
      this.fog.color.lerp(_c.setRGB(0.62, 0.64, 0.68).multiplyScalar(0.15 + 0.85 * day), Math.min(1, Math.max(ov * 0.7, W.fog)));
      this.renderer.toneMappingExposure += (STYLE.plastilina ? 0.0 : 0.1) * ov * day;
    }
    this.renderer.toneMappingExposure += W.flash * 0.3;
    // environment map (IBL), refreshed occasionally
    this.envTimer -= dt;
    if (forceEnv || this.envTimer <= 0) {
      this.envTimer = 3;
      const sunK = smoothstep(-0.02, 0.2, alt);
      if (!STYLE.plastilina) {
        this.envGround.material.color.copy(U.uGnd.value);
        this.envBand.material.color.copy(U.uHor.value).multiplyScalar(0.35).lerp(_c.copy(REAL.walls).multiply(U.uSunCol.value), sunK * 0.85);
        this.envHaze.material.color.copy(U.uHor.value).lerp(REAL.haze, 0.6).multiplyScalar(0.25 + 0.75 * day).lerp(_c.setRGB(0.6, 0.62, 0.66).multiplyScalar(0.2 + 0.8 * day), ov);
        this.envHaze.material.opacity = 0.38 * day + 0.3 * ov * day;
      } else { // (claymation: the studio round the set reflects warm — its walls, its lamps — never the painted blue)
        this.envGround.material.color.setRGB(0.6, 0.5, 0.42);
        this.envBand.material.color.copy(U.uHor.value).multiplyScalar(0.3).lerp(_c.copy(CLAY.walls).multiply(U.uSunCol.value), sunK * 0.95);
        this.envHaze.material.color.setRGB(0.93, 0.83, 0.7).multiplyScalar(0.3 + 0.7 * day).lerp(_c.setRGB(0.72, 0.72, 0.76).multiplyScalar(0.25 + 0.75 * day), ov * 0.8);
        this.envHaze.material.opacity = 0.62 * day;
      }
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 400);
      if (rt !== this.envRT) { if (this.envRT) this.envRT.dispose(); this.envRT = rt; this.scene.environment = rt.texture; }
    }
    this.scene.environmentIntensity = STYLE.plastilina ? lerp(0.45, 0.6, day) : lerp(0.4, 0.55, day);
    return this.night;
  }
}
