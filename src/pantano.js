// Pantano de San Roque done properly: a natural shoreline with coves (smoothed from the OSM outline; the long straight
// edge is kept for the dam), water with wind waves, sky reflections, sun glitter and a colour that deepens away from
// the shore, lapping at the edge; the late-summer drawdown band of cracked clay up to the old waterline, reeds in the
// shallows, granite boulders, an earth dam with riprap and a concrete parapet, the intake tower with its footbridge
// and level gauge, and a wooden jetty with a moored rowboat. You can't walk on the water (the jetty you can).
// Everything reads the shore distance from one signed-distance texture (negative inside the water).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shared } from './materials.js';
import { loadTexture } from './assets.js';
import { mulberry32 } from './util.js';

const SDF_RANGE = 48; // metres encoded either side of the shore

// small deterministic value noise (JS side, for coves and placement)
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const GLSL_NOISE = `
float ph(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return pn(p) * 0.5 + pn(p * 2.03 + 7.1) * 0.3 + pn(p * 4.1 + 3.3) * 0.2; }`;

export class Reservoir {
  constructor(world, area) {
    this.world = world;
    this.map = world.map;
    this.root = new THREE.Group();
    this.rnd = mulberry32(1906);
    this.reeds = [];      // for the vegetation pass: [x, z, rot, scale]
    this.trees = [];      // encinas and eucalyptus round the banks
    this.boats = [];
    this.shoreline(area.ring);
    this.distanceField();
    this.buildWater();
    this.buildBand();
    this.buildDam();
    this.buildJetty();
    this.buildRocks();
    this.plant();
    this.collide();
  }

  // ---------------------------------------------------------------- outline
  shoreline(ring) {
    const P = [];
    for (let i = 0; i < ring.length; i += 2) P.push([ring[i], ring[i + 1]]);
    // the dam: the longest straight edge
    let di = 0, dl = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > dl) { dl = l; di = i; } }
    const A = P[di], B = P[(di + 1) % P.length];
    this.damA = A; this.damB = B;
    // open polyline from B round to A (everything but the dam), Chaikin-smoothed with fixed ends
    let line = [];
    for (let k = 0; k <= P.length - 1; k++) line.push(P[(di + 1 + k) % P.length]);
    for (let it = 0; it < 4; it++) {
      const out = [line[0]];
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(line[line.length - 1]);
      line = out;
    }
    // resample every ~5 m and push coves and points in and out (not near the dam)
    const res = [];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / 5));
      for (let k = 0; k < n; k++) res.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
    }
    res.push(line[line.length - 1]);
    const N = res.length, out = [];
    for (let i = 0; i < N; i++) {
      const p = res[i], q = res[Math.min(N - 1, i + 1)], o = res[Math.max(0, i - 1)];
      let tx = q[0] - o[0], tz = q[1] - o[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const endFade = Math.min(1, Math.min(i, N - 1 - i) / 8);
      const off = ((vnoise(p[0] * 0.018, p[1] * 0.018) - 0.5) * 18 + (vnoise(p[0] * 0.07, p[1] * 0.07) - 0.5) * 5) * endFade;
      out.push([p[0] - tz * off, p[1] + tx * off]);
    }
    // the dam edge, straight, sampled every 4 m
    const dn = Math.max(2, Math.round(dl / 4));
    for (let k = 0; k < dn; k++) out.push([A[0] + (B[0] - A[0]) * (k / dn), A[1] + (B[1] - A[1]) * (k / dn)]);
    this.shore = out;
    // outward normal of the dam (away from the water) and its direction
    const cx = out.reduce((s, p) => s + p[0], 0) / out.length, cz = out.reduce((s, p) => s + p[1], 0) / out.length;
    this.center = [cx, cz];
    let ux = B[0] - A[0], uz = B[1] - A[1]; const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
    let nx = -uz, nz = ux;
    const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
    if ((cx - mx) * nx + (cz - mz) * nz > 0) { nx = -nx; nz = -nz; }
    this.dam = { A, B, ux, uz, nx, nz, len: ul, mx, mz };
  }

  inside(x, z) {
    const s = this.shore; let c = false;
    for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
      const [xi, zi] = s[i], [xj, zj] = s[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  distanceField() {
    const s = this.shore;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const m = 60; x0 -= m; z0 -= m; x1 += m; z1 += m;
    const cell = 2, w = Math.ceil((x1 - x0) / cell), h = Math.ceil((z1 - z0) / cell);
    this.rect = { x0, z0, w: w * cell, h: h * cell, cell, nx: w, nz: h };
    const sd = new Float32Array(w * h), data = new Uint8Array(w * h * 4);
    const segs = [];
    for (let i = 0; i < s.length; i++) { const a = s[i], b = s[(i + 1) % s.length]; segs.push(a[0], a[1], b[0], b[1]); }
    for (let j = 0; j < h; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = 0; i < w; i++) {
        const x = x0 + (i + 0.5) * cell;
        let best = 1e9, inside = false;
        for (let k = 0; k < segs.length; k += 4) {
          const ax = segs[k], az = segs[k + 1], bx = segs[k + 2], bz = segs[k + 3];
          const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
          let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - ax - ex * t, dz = z - az - ez * t, d2 = dx * dx + dz * dz;
          if (d2 < best) best = d2;
          if ((az > z) !== (bz > z) && x < (ex * (z - az)) / ez + ax) inside = !inside;
        }
        const d = Math.sqrt(best) * (inside ? -1 : 1);
        sd[j * w + i] = d;
        const v = Math.max(0, Math.min(255, Math.round((d / SDF_RANGE * 0.5 + 0.5) * 255)));
        const o = (j * w + i) * 4;
        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
      }
    }
    this.sdfArr = sd;
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.sdfTex = tex;
    this.rectU = new THREE.Vector4(x0, z0, w * cell, h * cell);
  }
  // signed distance to the shore (negative in the water), bilinear from the grid
  sdf(x, z) {
    const r = this.rect;
    const fx = (x - r.x0) / r.cell - 0.5, fz = (z - r.z0) / r.cell - 0.5;
    const i = Math.max(0, Math.min(r.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(r.nz - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const A = this.sdfArr, w = r.nx;
    const a = A[j * w + i], b = A[j * w + i + 1], c = A[(j + 1) * w + i], d = A[(j + 1) * w + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // ---------------------------------------------------------------- water
  buildWater() {
    const sky = this.world.skyUniforms;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uSdf: { value: null }, uRect: { value: null }, uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uZen: { value: new THREE.Color(0.3, 0.5, 0.8) },
      uHor: { value: new THREE.Color(0.7, 0.8, 0.9) }, uWarm: { value: new THREE.Color(0.9, 0.6, 0.4) }, uNight: { value: 0 },
    }]);
    uniforms.uSdf.value = this.sdfTex; uniforms.uRect.value = this.rectU;
    uniforms.uTime = shared.uTime;
    if (sky) for (const k of ['uSun', 'uSunCol', 'uZen', 'uHor', 'uWarm', 'uNight']) if (sky[k]) uniforms[k] = sky[k];
    const mat = new THREE.ShaderMaterial({
      uniforms, fog: true,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24,
      vertexShader: `varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uSdf; uniform vec4 uRect; uniform float uTime, uNight;
        uniform vec3 uSun, uSunCol, uZen, uHor, uWarm;
        varying vec3 vW;
        #include <common>
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        float sdfAt(vec2 p){ return (texture2D(uSdf, (p - uRect.xy) / uRect.zw).r - 0.5) * ${(SDF_RANGE * 2).toFixed(1)}; }
        // wind waves: a few travelling sines plus drifting ripples; returns the slope (d/dx, d/dz)
        vec2 waves(vec2 p, float t){
          vec2 g = vec2(0.0);
          vec4 D[4]; D[0] = vec4(0.94, 0.34, 0.9, 0.022); D[1] = vec4(0.71, -0.7, 1.7, 0.012); D[2] = vec4(-0.2, 0.98, 2.9, 0.008); D[3] = vec4(0.5, 0.86, 5.3, 0.004);
          // the travelling waves wander (warped phase) so the pattern never lines up
          vec2 w = vec2(fbm(p * 0.05 + t * 0.02), fbm(p * 0.05 + 11.0 - t * 0.02)) * 6.0;
          for (int i = 0; i < 4; i++) { float k = D[i].z; float ph = dot(D[i].xy, p + w) * k + t * sqrt(9.8 * k) * 0.55; g += D[i].xy * k * D[i].w * cos(ph) * 8.0; }
          float e = 0.35; vec2 q = p * 0.9 + vec2(t * 0.35, t * 0.22);
          float n0 = fbm(q), nx = fbm(q + vec2(e, 0.0)), nz = fbm(q + vec2(0.0, e));
          g += vec2(nx - n0, nz - n0) / e * 0.3;
          vec2 q2 = p * 2.7 - vec2(t * 0.5, -t * 0.3);
          float m0 = pn(q2), mx = pn(q2 + vec2(0.3, 0.0)), mz = pn(q2 + vec2(0.0, 0.3));
          g += vec2(mx - m0, mz - m0) / 0.3 * 0.08;
          // gusts: patches of rougher water drifting across
          g *= 0.6 + 0.8 * smoothstep(0.35, 0.75, fbm(p * 0.02 + vec2(t * 0.03, 0.0)));
          return g;
        }
        void main(){
          float d = sdfAt(vW.xz) + (fbm(vW.xz * 0.25) - 0.5) * 1.4;
          if (d > 0.0) discard;
          float depth = -d;
          vec3 V = normalize(cameraPosition - vW);
          float calm = mix(0.3, 1.0, smoothstep(0.0, 14.0, depth));
          vec2 g = waves(vW.xz, uTime) * calm;
          float far = clamp(length(cameraPosition.xz - vW.xz) / 400.0, 0.0, 1.0);
          g *= 1.0 - far * 0.6;
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          float cosT = clamp(dot(N, V), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
          float toward = pow(max(0.0, dot(normalize(R.xz + 1e-5), normalize(uSun.xz + 1e-5))), 3.0);
          vec3 hor = mix(uHor, uWarm, toward * 0.7);
          vec3 sky = mix(hor, uZen, pow(clamp(R.y, 0.0, 1.0), 0.5));
          float sd = max(dot(normalize(R), uSun), 0.0);
          vec3 spec = uSunCol * (pow(sd, 1800.0) * 14.0 + pow(sd, 160.0) * 0.55) * smoothstep(-0.02, 0.06, uSun.y);
          float lightK = clamp(uSun.y * 1.6 + 0.3, 0.05, 1.0) * (1.0 - uNight * 0.85);
          // body colour: the bed seen through the shallows, green-blue deep water
          float k = 1.0 - exp(-depth / 8.0);
          vec3 shallow = vec3(0.26, 0.24, 0.15), mid = vec3(0.07, 0.13, 0.1), deep = vec3(0.018, 0.055, 0.06);
          vec3 body = mix(mix(shallow, mid, smoothstep(0.0, 0.5, k)), deep, smoothstep(0.4, 1.0, k));
          body *= lightK * (0.55 + 0.45 * clamp(uSunCol.g, 0.0, 1.0));
          vec3 col = mix(body, sky * vec3(0.82, 0.92, 0.9) * (0.35 + 0.65 * lightK), F) + spec * (1.0 - uNight);
          // lapping at the edge and a thin broken foam line
          float lap = 0.5 + 0.5 * sin(uTime * 1.7 - depth * 5.0 + fbm(vW.xz * 0.15) * 7.0);
          float foam = (1.0 - smoothstep(0.0, 0.9, depth)) * lap * smoothstep(0.35, 0.75, fbm(vW.xz * 1.6 + vec2(uTime * 0.12, 0.0)));
          col = mix(col, vec3(0.82, 0.8, 0.74) * lightK, foam * 0.6);
          // wet dark rim right at the waterline
          col *= mix(0.75, 1.0, smoothstep(0.0, 0.5, depth));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const r = this.rect;
    const g = new THREE.PlaneGeometry(r.w, r.h, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(r.x0 + r.w / 2, 0.035, r.z0 + r.h / 2);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -2;
    this.root.add(m);
    this.water = m;
  }

  // ---------------------------------------------------------------- drawdown band: cracked clay up to the old waterline
  buildBand() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 });
    const sdfTex = this.sdfTex, rect = this.rectU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSdf = { value: sdfTex }; sh.uniforms.uRect = { value: rect };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBW = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D uSdf; uniform vec4 uRect; varying vec2 vBW;
        ${GLSL_NOISE}
        float sdfAt(vec2 p){ return (texture2D(uSdf, (p - uRect.xy) / uRect.zw).r - 0.5) * ${(SDF_RANGE * 2).toFixed(1)}; }
        // cell (voronoi) edges for the mud cracks
        float cellH;
        float cracks(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 c = o + vec2(ph(i + o), ph(i + o + 17.3)) * 0.85 - f; float d = dot(c, c); if (d < d1) { d2 = d1; d1 = d; cellH = ph(i + o + 9.1); } else if (d < d2) d2 = d; }
          return sqrt(d2) - sqrt(d1); }
        float bandW; float bandT;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float d = sdfAt(vBW) + (fbm(vBW * 0.25) - 0.5) * 1.4;
          bandW = 6.0 + 11.0 * fbm(vBW * 0.012);
          bandT = d / bandW;
          if (d < -0.2 || bandT > 1.0) discard;
          if (bandT > 0.82 && ph(floor(vBW * 3.0)) < (bandT - 0.82) / 0.18) discard;
          float nz = fbm(vBW * 0.6);
          vec3 wet = vec3(0.14, 0.11, 0.075), mud = vec3(0.36, 0.27, 0.18), clay = vec3(0.62, 0.45, 0.29), line = vec3(0.74, 0.7, 0.62);
          vec3 c = mix(wet, mud, smoothstep(0.02, 0.2, bandT));
          c = mix(c, clay * (0.85 + 0.3 * nz), smoothstep(0.18, 0.5, bandT));
          float cr = 1.0 - smoothstep(0.012, 0.04 + 0.03 * nz, cracks(vBW * 2.3 + vec2(fbm(vBW * 0.5), fbm(vBW * 0.5 + 5.0)) * 0.8));
          // each plate of dried mud its own shade, the curled edges darker
          float plate = smoothstep(0.25, 0.45, bandT);
          c *= mix(1.0, 0.86 + 0.26 * cellH, plate);
          c *= 1.0 - cr * 0.6 * plate;
          c = mix(c, line, smoothstep(0.68, 0.74, bandT) * (1.0 - smoothstep(0.76, 0.84, bandT)) * 0.8);
          // pebbles: small round stones, denser low on the band
          vec2 sc = vBW * 3.0, si = floor(sc), sf = fract(sc) - 0.5 - (vec2(ph(si), ph(si + 4.7)) - 0.5) * 0.5;
          float st = step(0.86, ph(si + 1.3)) * (1.0 - smoothstep(0.12, 0.2, length(sf))) * smoothstep(0.08, 0.3, bandT);
          c = mix(c, vec3(0.5, 0.48, 0.45) * (0.65 + 0.55 * ph(si + 3.1)), st);
          diffuseColor.rgb = c;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.28, 0.95, smoothstep(0.0, 0.2, bandT));');
    };
    const r = this.rect;
    const g = new THREE.PlaneGeometry(r.w, r.h, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(r.x0 + r.w / 2, 0.02, r.z0 + r.h / 2);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.renderOrder = -3;
    this.root.add(m);
  }

  // ---------------------------------------------------------------- earth dam with riprap, crest road, parapet, spillway, intake tower
  buildDam() {
    const D = this.dam;
    const granite = loadTexture('granite_wall', '_d');
    if (granite) { granite.wrapS = granite.wrapT = THREE.RepeatWrapping; granite.repeat.set(1, 1); }
    const riprap = new THREE.MeshStandardMaterial({ color: 0xe6e0d4, map: granite, roughness: 0.95 });
    const grass = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 1 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.85 });
    const gravel = new THREE.MeshStandardMaterial({ color: 0xa89a80, roughness: 1 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }), red = new THREE.MeshStandardMaterial({ color: 0xb8302a, roughness: 0.6 });
    const H = 5.2, crestU0 = 11, crestU1 = 16, toeU = 27, wetU = -3;
    const L = D.len + 36, s0 = -18; // the embankment runs a little past the water at both ends
    const at = (s, u, y) => [D.A[0] + D.ux * s + D.nx * u, y, D.A[1] + D.uz * s + D.nz * u];
    const hAt = (s) => H * Math.min(1, Math.max(0, (s - s0) / 26)) * Math.min(1, Math.max(0, (s0 + L - s) / 26));
    // cross sections along the length: water toe → crest (riprap) → crest (gravel) → downstream toe (grass)
    const faces = { rip: [], gra: [], top: [] };
    const N = 48;
    for (let i = 0; i < N; i++) {
      const sa = s0 + (L * i) / N, sb = s0 + (L * (i + 1)) / N, ha = hAt(sa), hb = hAt(sb);
      const quad = (list, p0, p1, p2, p3) => list.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      const ua = (h) => crestU0 * (h / H), ub = (h) => crestU1 + (toeU - crestU1) * 1 - (toeU - crestU1) * (1 - h / H) * 0;
      quad(faces.rip, at(sa, wetU, -0.6), at(sb, wetU, -0.6), at(sb, ua(hb), hb), at(sa, ua(ha), ha));
      quad(faces.top, at(sa, ua(ha), ha), at(sb, ua(hb), hb), at(sb, crestU1 - (crestU0 - ua(hb)) * 0, hb), at(sa, crestU1, ha));
      quad(faces.gra, at(sa, crestU1, ha), at(sb, crestU1, hb), at(sb, crestU1 + (toeU - crestU1) * (hb / H), 0), at(sa, crestU1 + (toeU - crestU1) * (ha / H), 0));
    }
    const mk = (arr, m, uvScale) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      // planar uv from world xz / y for the rock texture
      const p = g.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) * D.ux + p.getZ(i) * D.uz) / uvScale; uv[i * 2 + 1] = (p.getY(i) + (p.getX(i) * D.nx + p.getZ(i) * D.nz)) / uvScale; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      // make the faces point up/outwards
      const n = g.attributes.normal;
      if (n.getY(0) < 0) { for (let i = 0; i < arr.length; i += 9) for (let q = 0; q < 3; q++) { const t = arr[i + 3 + q]; arr[i + 3 + q] = arr[i + 6 + q]; arr[i + 6 + q] = t; } g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); }
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; this.root.add(mesh); return mesh;
    };
    mk(faces.rip, riprap, 3); mk(faces.top, gravel, 4); mk(faces.gra, grass, 6);
    // concrete parapet on the water side of the crest, bollards on the other, and the waterline marks
    const para = [];
    const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); return g; };
    const ang = Math.atan2(D.ux, D.uz);
    for (let s = s0 + 22; s < s0 + L - 22; s += 6) {
      const h = hAt(s + 3);
      const [x, , z] = at(s + 3, crestU0 + 0.3, 0);
      para.push(box(0.4, 1.0, 6.02, x, h + 0.5, z, ang));
      const [bx, , bz] = at(s + 3, crestU1 - 0.3, 0);
      para.push(box(0.25, 0.8, 0.25, bx, h + 0.4, bz, ang));
    }
    const pm = new THREE.Mesh(mergeGeometries(para), concrete); pm.castShadow = true; pm.receiveShadow = true; this.root.add(pm);
    // spillway near the B end: a stepped concrete chute down the downstream face with side walls
    const sp = [];
    const sS = D.len - 12;
    for (let k = 0; k < 9; k++) {
      const u = crestU1 + (toeU - crestU1) * (k / 9), y = H * (1 - k / 9);
      const [x, , z] = at(sS, u + 0.6, 0);
      sp.push(box(6, 0.35, 1.3, x, y - 0.1, z, ang + Math.PI / 2));
    }
    for (const side of [-3.2, 3.2]) {
      const [x0, , z0] = at(sS + side, crestU1, 0), [x1, , z1] = at(sS + side, toeU, 0);
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.BoxGeometry(0.4, 1.4, len); g.rotateX(Math.atan2(H, len)); g.rotateY(ang + Math.PI / 2 * 0 + Math.atan2(D.nx, D.nz) - ang); g.translate((x0 + x1) / 2, H / 2 + 0.3, (z0 + z1) / 2);
      sp.push(g);
    }
    const spm = new THREE.Mesh(mergeGeometries(sp), concrete); spm.castShadow = true; spm.receiveShadow = true; this.root.add(spm);
    // intake tower out in the water with a footbridge to the crest, and the level gauge
    const tS = D.len * 0.42;
    const [tx, , tz] = at(tS, -16, 0);
    const tw = [];
    const cyl = new THREE.CylinderGeometry(2.1, 2.3, 7.5, 20); cyl.translate(tx, 2.7, tz); tw.push(cyl);
    const hut = new THREE.BoxGeometry(3.2, 2.4, 3.2); hut.translate(tx, 7.6, tz); tw.push(hut);
    const deckLen = 16 + crestU0 - 0.5;
    const [bx, , bz] = at(tS, (-16 + crestU0) / 2 - 1, 0);
    const deck = new THREE.BoxGeometry(1.6, 0.25, deckLen); deck.rotateY(Math.atan2(D.nx, D.nz)); deck.translate(bx, H + 0.4, bz); tw.push(deck);
    const tm = new THREE.Mesh(mergeGeometries(tw), concrete); tm.castShadow = true; tm.receiveShadow = true; this.root.add(tm);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 4), new THREE.MeshStandardMaterial({ color: 0xa8583a, roughness: 0.8 }));
    roof.position.set(tx, 9.45, tz); roof.rotation.y = ang + Math.PI / 4; roof.castShadow = true; this.root.add(roof);
    const rails = [];
    for (const side of [-0.75, 0.75]) {
      const [rx, , rz] = at(tS + side, (-16 + crestU0) / 2 - 1, 0);
      const g = new THREE.BoxGeometry(0.05, 0.05, deckLen); g.rotateY(Math.atan2(D.nx, D.nz)); g.translate(rx, H + 1.4, rz); rails.push(g);
      for (let k = 0; k <= 8; k++) { const [px, , pz] = at(tS + side, -16 + 2.2 + (deckLen - 2.2) * (k / 8), 0); rails.push(box(0.06, 1.0, 0.06, px, H + 0.95, pz)); }
    }
    this.root.add(new THREE.Mesh(mergeGeometries(rails), iron));
    // gauge: white post with red decimetre bands and metre numbers' blocks
    const [gx, , gz] = at(tS + 5, -14.5, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.08), white); post.position.set(gx, 1.1, gz); post.rotation.y = ang; this.root.add(post);
    const bands = [];
    for (let k = 0; k < 20; k++) if (k % 2 === 0) bands.push(box(0.23, 0.1, 0.085, gx, -0.9 + k * 0.2, gz, ang));
    this.root.add(new THREE.Mesh(mergeGeometries(bands), red));
    this.tower = { x: tx, z: tz, r: 2.4 };
    this.damGeo = { at, s0, L, toeU, crestU0 };
  }

  // ---------------------------------------------------------------- jetty with a moored rowboat
  buildJetty() {
    // the shore point closest to the Ermita de San Isidro (or the far side from the dam)
    const lm = this.world.landmarks && this.world.landmarks.poi;
    const target = lm && lm.ermita ? [lm.ermita.x, lm.ermita.z] : [this.center[0] - this.dam.nx * 300, this.center[1] - this.dam.nz * 300];
    let best = null, bd = Infinity, bi = 0;
    const n = this.shore.length - Math.max(2, Math.round(this.dam.len / 4));
    for (let i = 4; i < n - 4; i++) { const p = this.shore[i], d = Math.hypot(p[0] - target[0], p[1] - target[1]); if (d < bd) { bd = d; best = p; bi = i; } }
    const p0 = this.shore[bi - 2], p1 = this.shore[bi + 2];
    let tx = p1[0] - p0[0], tz = p1[1] - p0[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    let nx = -tz, nz = tx; // into the water
    if (this.sdf(best[0] + nx * 4, best[1] + nz * 4) > this.sdf(best[0] - nx * 4, best[1] - nz * 4)) { nx = -nx; nz = -nz; }
    const len = 18, w = 2.4, ang = Math.atan2(nx, nz);
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
    const planks = [], posts = [];
    const P = (a, s) => [best[0] + nx * a + tx * s, best[1] + nz * a + tz * s];
    for (let a = -2; a < len; a += 0.32) {
      const [x, z] = P(a, 0);
      const g = new THREE.BoxGeometry(w, 0.06, 0.28); g.rotateY(ang); g.translate(x, 0.62 + (this.rnd() - 0.5) * 0.015, z); planks.push(g);
    }
    for (let a = 0; a <= len; a += 3) for (const s of [-w / 2 + 0.1, w / 2 - 0.1]) { const [x, z] = P(a, s); const g = new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8); g.translate(x, -0.4, z); posts.push(g); }
    for (const s of [-w / 2 + 0.05, w / 2 - 0.05]) { const [x, z] = P(len / 2 - 1, s); const g = new THREE.BoxGeometry(0.12, 0.18, len + 2); g.rotateY(ang); g.translate(x, 0.5, z); posts.push(g); }
    const bench = []; { const [x, z] = P(len - 1.5, 0); const g = new THREE.BoxGeometry(1.6, 0.08, 0.4); g.rotateY(ang + Math.PI / 2); g.translate(x, 1.08, z); bench.push(g); for (const s of [-0.6, 0.6]) { const [lx, lz] = P(len - 1.5, s); const l = new THREE.BoxGeometry(0.08, 0.42, 0.36); l.rotateY(ang); l.translate(lx, 0.85, lz); bench.push(l); } }
    const pm = new THREE.Mesh(mergeGeometries(planks), wood); pm.castShadow = true; pm.receiveShadow = true; this.root.add(pm);
    this.root.add(new THREE.Mesh(mergeGeometries(posts), dark));
    this.root.add(new THREE.Mesh(mergeGeometries(bench), wood));
    // rowboat moored alongside
    const hull = this.boatGeometry();
    const hullM = new THREE.MeshStandardMaterial({ color: 0x2f5f8a, roughness: 0.6, side: THREE.DoubleSide });
    const boat = new THREE.Mesh(hull, hullM); boat.castShadow = true;
    const [bx, bz] = P(len * 0.62, w / 2 + 1.1);
    boat.position.set(bx, 0.05, bz); boat.rotation.y = ang + 0.08;
    this.root.add(boat);
    this.boats.push({ m: boat, y0: 0.05, ph: 0, ry: boat.rotation.y });
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 5), new THREE.MeshStandardMaterial({ color: 0xd8c8a0 }));
    const [rx, rz] = P(len * 0.62 + 1.6, w / 2 + 0.5); rope.position.set(rx, 0.45, rz); rope.rotation.z = 1.1; rope.rotation.y = ang; this.root.add(rope);
    this.jetty = { x: best[0], z: best[1], nx, nz, tx, tz, len, w };
  }
  boatGeometry() {
    // a clinker-ish rowboat: lathe half-shell pinched to a bow, with two thwarts
    const L = 3.6, B = 1.3, D = 0.55;
    const g = new THREE.CylinderGeometry(B / 2, B / 2, L, 16, 12, true, Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2); g.rotateZ(Math.PI); // axis along z, open side up
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = z / (L / 2);
      const pinch = t > 0 ? 1 - Math.pow(t, 2.2) : 1 - Math.pow(-t, 4) * 0.45; // pointed bow, transom stern
      x *= pinch; y = y * (D / (B / 2)) * (0.85 + 0.15 * pinch) + (t > 0 ? Math.pow(t, 3) * 0.18 : 0);
      p.setXYZ(i, x, y + D * 0.9, z);
    }
    g.computeVertexNormals();
    const parts = [g];
    for (const z of [-0.5, 0.55]) { const th = new THREE.BoxGeometry(B * 0.9, 0.05, 0.25); th.translate(0, D * 0.75, z); parts.push(th.toNonIndexed()); }
    const gg = g.toNonIndexed();
    for (const q of parts.slice(1)) { if (q.attributes.uv) q.deleteAttribute('uv'); }
    if (gg.attributes.uv) gg.deleteAttribute('uv');
    return mergeGeometries([gg, ...parts.slice(1)]);
  }

  // ---------------------------------------------------------------- granite boulders on the band and in the shallows
  buildRocks() {
    const granite = loadTexture('granite_wall', '_d');
    if (granite) { granite.wrapS = granite.wrapT = THREE.RepeatWrapping; }
    const mat = new THREE.MeshStandardMaterial({ color: 0xbab4a8, map: granite, roughness: 0.92, flatShading: true });
    const shapes = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 0.75 + vnoise(x * 2.1 + k * 5, z * 2.1 + y * 1.7) * 0.5;
        p.setXYZ(i, x * n * (1.2 + k * 0.15), Math.max(-0.3, y * n * 0.7), z * n);
      }
      g.computeVertexNormals();
      return g;
    });
    const cap = 160;
    const ims = shapes.map((g) => { const im = new THREE.InstancedMesh(g, mat, cap); im.count = 0; im.castShadow = true; im.receiveShadow = true; this.root.add(im); return im; });
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
    let placed = 0;
    for (let tries = 0; tries < 4000 && placed < cap * 3; tries++) {
      const i = Math.floor(this.rnd() * this.shore.length), p = this.shore[i];
      const off = -2 + this.rnd() * 13;
      const [cx, cz] = this.center;
      let dx = p[0] - cx, dz = p[1] - cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const x = p[0] + dx * off + (this.rnd() - 0.5) * 3, z = p[1] + dz * off + (this.rnd() - 0.5) * 3;
      const d = this.sdf(x, z);
      if (d < -2.5 || d > 12) continue;
      if (this.nearDamOrJetty(x, z, 4)) continue;
      if (vnoise(x * 0.04, z * 0.04) < 0.45) continue; // in clusters
      const k = Math.floor(this.rnd() * 3), im = ims[k];
      if (im.count >= cap) continue;
      const sc = 0.35 + Math.pow(this.rnd(), 2.2) * 1.6;
      e.set(this.rnd() * 0.4, this.rnd() * 6.28, this.rnd() * 0.4);
      q.setFromEuler(e); s.set(sc, sc * (0.7 + this.rnd() * 0.5), sc); v.set(x, d < 0 ? -0.15 * sc : -0.05 * sc, z);
      M.compose(v, q, s);
      im.setMatrixAt(im.count++, M);
      placed++;
      if (sc > 0.9) this.rocksCol = (this.rocksCol || []).concat([x, z, sc * 1.1]);
    }
    for (const im of ims) im.instanceMatrix.needsUpdate = true;
  }
  nearDamOrJetty(x, z, pad) {
    const D = this.dam;
    const u = (x - D.A[0]) * D.nx + (z - D.A[1]) * D.nz, s = (x - D.A[0]) * D.ux + (z - D.A[1]) * D.uz;
    if (u > -20 - pad && u < 28 + pad && s > -20 && s < D.len + 20) return true;
    const J = this.jetty;
    if (J) { const a = (x - J.x) * J.nx + (z - J.z) * J.nz, b = (x - J.x) * J.tx + (z - J.z) * J.tz; if (a > -3 - pad && a < J.len + pad && Math.abs(b) < J.w + 3 + pad) return true; }
    return false;
  }

  // ---------------------------------------------------------------- reeds in the shallows, encinas and eucalyptus on the banks
  plant() {
    for (let i = 0; i < this.shore.length; i++) {
      const p = this.shore[i];
      if (vnoise(p[0] * 0.03, p[1] * 0.03) < 0.42) continue;
      const [cx, cz] = this.center;
      let dx = p[0] - cx, dz = p[1] - cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const n = 2 + Math.floor(this.rnd() * 5);
      for (let k = 0; k < n; k++) {
        const off = -2.2 + this.rnd() * 3.2;
        const x = p[0] + dx * off + (this.rnd() - 0.5) * 2.5, z = p[1] + dz * off + (this.rnd() - 0.5) * 2.5;
        if (this.nearDamOrJetty(x, z, 2)) continue;
        this.reeds.push([x, z, this.rnd() * 6.28, 0.8 + this.rnd() * 0.5]);
      }
    }
    for (let i = 0; i < 70; i++) {
      const p = this.shore[Math.floor(this.rnd() * this.shore.length)];
      const [cx, cz] = this.center;
      let dx = p[0] - cx, dz = p[1] - cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const off = 16 + this.rnd() * 30, x = p[0] + dx * off, z = p[1] + dz * off;
      if (this.sdf(x, z) < 14 || this.nearDamOrJetty(x, z, 6) || this.map.buildingAt(x, z)) continue;
      this.trees.push({ kind: this.rnd() < 0.7 ? 'encina' : 'eucalipto', x, z, s: 0.8 + this.rnd() * 0.5 });
    }
  }

  // ---------------------------------------------------------------- nobody walks or drives on the water (the jetty and the dam are solid)
  collide() {
    const col = this.map.collider;
    const r = this.rect, A = this.sdfArr, w = r.nx, h = r.nz, lvl = -1.2;
    const segs = [];
    const J = this.jetty;
    const onJetty = (x, z) => { if (!J) return false; const a = (x - J.x) * J.nx + (z - J.z) * J.nz, b = (x - J.x) * J.tx + (z - J.z) * J.tz; return a > -3 && a < J.len + 0.5 && Math.abs(b) < J.w / 2 + 0.2; };
    // marching squares on the distance grid
    const P = (i, j) => [r.x0 + (i + 0.5) * r.cell, r.z0 + (j + 0.5) * r.cell];
    const lerpP = (i0, j0, i1, j1) => { const a = A[j0 * w + i0], b = A[j1 * w + i1], t = (lvl - a) / (b - a || 1e-6); const p0 = P(i0, j0), p1 = P(i1, j1); return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]; };
    for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
      const c = (A[j * w + i] < lvl ? 1 : 0) | (A[j * w + i + 1] < lvl ? 2 : 0) | (A[(j + 1) * w + i + 1] < lvl ? 4 : 0) | (A[(j + 1) * w + i] < lvl ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const e = [];
      const top = () => lerpP(i, j, i + 1, j), right = () => lerpP(i + 1, j, i + 1, j + 1), bot = () => lerpP(i, j + 1, i + 1, j + 1), left = () => lerpP(i, j, i, j + 1);
      const T = { 1: [left, top], 2: [top, right], 3: [left, right], 4: [right, bot], 5: [left, top, right, bot], 6: [top, bot], 7: [left, bot], 8: [left, bot], 9: [top, bot], 10: [top, right, left, bot], 11: [right, bot], 12: [left, right], 13: [top, right], 14: [left, top] }[c];
      for (let k = 0; k < T.length; k += 2) e.push(T[k](), T[k + 1]());
      for (let k = 0; k < e.length; k += 2) {
        const a = e[k], b = e[k + 1];
        if (onJetty((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
        segs.push(a[0], a[1], b[0], b[1], 1.2, -1);
      }
    }
    // jetty sides (walk out on it, not off it)
    if (J) for (const sd of [-1, 1]) {
      const bx = J.x + J.tx * sd * (J.w / 2 - 0.15), bz = J.z + J.tz * sd * (J.w / 2 - 0.15);
      segs.push(bx, bz, bx + J.nx * J.len, bz + J.nz * J.len, 1.2, -1);
    }
    if (J) { const ex = J.x + J.nx * J.len, ez = J.z + J.nz * J.len; segs.push(ex - J.tx * J.w / 2, ez - J.tz * J.w / 2, ex + J.tx * J.w / 2, ez + J.tz * J.w / 2, 1.2, -1); }
    // the dam body
    const G = this.damGeo;
    if (G) {
      const c = [[G.s0 + 6, -3], [G.s0 + G.L - 6, -3], [G.s0 + G.L - 6, G.toeU - 3], [G.s0 + 6, G.toeU - 3]].map(([s, u]) => { const p = G.at(s, u, 0); return [p[0], p[2]]; });
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; segs.push(a[0], a[1], b[0], b[1], 5, -1); }
    }
    col.appendSegments(segs);
    if (this.tower) col.addCircle(this.tower.x, this.tower.z, this.tower.r, 8, -2);
    const rc = this.rocksCol || [];
    for (let k = 0; k < rc.length; k += 3) if (this.sdf(rc[k], rc[k + 1]) > -1) col.addCircle(rc[k], rc[k + 1], rc[k + 2] * 0.8, 1.2, -2);
  }

  update(dt, sky) {
    // follow the sky (sun, colours, night) for the reflections
    if (sky && this.water) {
      const U = this.water.material.uniforms;
      for (const k of ['uSun', 'uSunCol', 'uZen', 'uHor', 'uWarm']) if (sky[k] && U[k]) U[k].value.copy(sky[k].value);
      if (sky.uNight && U.uNight) U.uNight.value = sky.uNight.value;
    }
    for (const b of this.boats) {
      b.ph += dt;
      b.m.position.y = b.y0 + Math.sin(b.ph * 1.3) * 0.04;
      b.m.rotation.z = Math.sin(b.ph * 0.9) * 0.04;
      b.m.rotation.x = Math.sin(b.ph * 1.1 + 1) * 0.025;
    }
  }
}
