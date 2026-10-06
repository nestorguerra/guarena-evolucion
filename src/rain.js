// Rain (and the rare snow) round the camera, drawn by the graphics card: thin streaks falling through a box that goes
// with the camera and wraps round it, so the CPU never touches a drop; the real wind slants them. The streaks are hidden
// behind houses (depth test) and fade at the box's edges. In the claymation they are fatter drops of glass that pose
// twelve times a second, like everything on the set; in the photographic town, fine streaks blurred by their speed.
import * as THREE from 'three';
import { STYLE } from './style.js';
import { SM } from './plastilina.js';

const MAX = { alta: 9000, media: 6000, baja: 3500 };
const BOX = new THREE.Vector3(40, 24, 40); // (m round the camera: x, y, z)

const VS = `
  attribute vec4 aSeed;
  uniform vec3 uCam, uBox; uniform float uTime, uFall, uLen, uWidth, uSnow; uniform vec2 uWind;
  varying vec2 vUv; varying float vFade;
  void main() {
    vec3 vel = vec3(uWind.x, -uFall, uWind.y);
    float t = uTime + aSeed.w * 17.0;
    vec3 p = aSeed.xyz * uBox + vel * t;
    // (snow drifts from side to side as it comes down)
    p.x += uSnow * sin(t * 1.3 + aSeed.w * 40.0) * 0.35;
    p.z += uSnow * cos(t * 1.1 + aSeed.x * 40.0) * 0.35;
    vec3 o = uCam - uBox * vec3(0.5, 0.35, 0.5);   // (more of the box above the eye than below it)
    p = o + mod(p - o, uBox);
    vec3 dir = normalize(vel), toCam = normalize(cameraPosition - p);
    vec3 side = normalize(cross(dir, toCam) + vec3(1e-5, 0.0, 0.0));
    vec3 up = normalize(mix(dir, cross(toCam, side), uSnow)); // (a flake: a little disc facing the camera)
    vec3 pos = p - up * (position.y * uLen) + side * (position.x * uWidth);
    vUv = vec2(position.x + 0.5, position.y);
    vec3 q = (p - o) / uBox;
    float e = min(min(q.x, 1.0 - q.x), min(q.z, 1.0 - q.z));
    vFade = smoothstep(0.0, 0.14, e) * smoothstep(0.0, 0.1, q.y) * smoothstep(1.0, 0.88, q.y) * smoothstep(0.5, 1.8, distance(p, cameraPosition));
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }`;
const FS = `
  uniform vec3 uColor; uniform float uAlpha, uSnow;
  varying vec2 vUv; varying float vFade;
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float streak = (1.0 - c.x * c.x) * smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.85, vUv.y); // (faint tail, brighter head)
    float flake = 1.0 - smoothstep(0.55, 1.0, length(vec2(c.x, vUv.y * 2.0 - 1.0)));
    float a = mix(streak, flake, uSnow) * uAlpha * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Rain {
  constructor(game) {
    this.game = game;
    this.max = MAX[game.qKey] || MAX.media;
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0); // (y from the tail, 0, to the head, 1)
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    const seeds = new Float32Array(this.max * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = 0;
    this.u = {
      uCam: { value: new THREE.Vector3() }, uBox: { value: BOX.clone() }, uTime: { value: 0 }, uFall: { value: 8 }, uLen: { value: 0.5 },
      uWidth: { value: 0.012 }, uSnow: { value: 0 }, uWind: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0.3 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    this.mesh.name = 'lluvia';
    game.scene.add(this.mesh);
    this.t = 0;
  }
  // wx: the sky's weather (sky.js); inside a building it does not rain
  update(dt, wx, camera, inside) {
    this.t += dt;
    const snow = wx.snow > wx.rain, k = Math.max(wx.rain, wx.snow);
    if (k < 0.01 || inside) { this.mesh.visible = false; return; }
    const U = this.u, clay = STYLE.plastilina, sky = this.game.sky;
    this.mesh.visible = true;
    this.mesh.geometry.instanceCount = Math.round(this.max * Math.pow(Math.min(1, k), 0.85));
    U.uCam.value.copy(camera.position);
    U.uTime.value = clay ? SM.time(this.t) : this.t; // (the claymation's rain poses with the set)
    U.uSnow.value = snow ? 1 : 0;
    U.uFall.value = snow ? 1.2 : 7.5 + 2 * k;
    U.uLen.value = snow ? (clay ? 0.07 : 0.045) : clay ? 0.32 : 0.45 + 0.35 * k;
    U.uWidth.value = snow ? U.uLen.value : clay ? 0.032 : 0.012;
    U.uWind.value.set(wx.windX * (snow ? 0.8 : 0.45), wx.windZ * (snow ? 0.8 : 0.45));
    U.uAlpha.value = snow ? 0.85 : clay ? 0.42 + 0.18 * k : 0.22 + 0.18 * k;
    // lit as the street is (darker at night), and white for an instant in a lightning flash
    const day = sky.uniforms.uSun.value.y > 0 ? Math.min(1, sky.uniforms.uSun.value.y * 4 + 0.35) : 0.35 * (1 - sky.night) + 0.12;
    U.uColor.value.setRGB(snow ? 0.95 : 0.74, snow ? 0.96 : 0.79, snow ? 1 : 0.86).multiplyScalar(day * (clay ? 1.05 : 0.9) + wx.flash * 1.6);
  }
}
