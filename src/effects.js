// Visual effects: GPU point particles (smoke, fire, dust, sparks), tyre skid marks, explosions, flying debris,
// and the player's headlight at night.
import * as THREE from 'three';
import { smokeCanvas, radialCanvas } from './textures.js';
import { clamp } from './util.js';
import { STYLE } from './style.js';
import { casingMesh } from './gunmodels.js';

class Particles {
  constructor(scene, cap, tex, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size0 = new Float32Array(cap);
    this.size1 = new Float32Array(cap);
    this.col = new Float32Array(cap * 4);
    this.grow = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('size', this.aSize);
    g.setAttribute('pcol', this.aCol);
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 pcol; varying vec4 vC;
        uniform float scale;
        void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb * t.rgb, t.a * vC.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a) {
    let i = this.n;
    if (i >= this.cap) { i = Math.floor(Math.random() * this.cap); } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size0[i] = s0; this.size1[i] = s1;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
  update(dt, buoy = 0.6, drag = 0.8) {
    const sz = this.aSize.array, cl = this.aCol.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.n;
        this.pos.copyWithin(i * 3, j * 3, j * 3 + 3); this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size0[i] = this.size0[j]; this.size1[i] = this.size1[j];
        this.col.copyWithin(i * 4, j * 4, j * 4 + 4);
        i--; continue;
      }
      const k = Math.exp(-drag * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + buoy * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const u = 1 - this.life[i] / this.max[i];
      sz[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * u;
      cl[i * 4] = this.col[i * 4]; cl[i * 4 + 1] = this.col[i * 4 + 1]; cl[i * 4 + 2] = this.col[i * 4 + 2];
      cl[i * 4 + 3] = this.col[i * 4 + 3] * Math.min(1, (1 - u) * 3) * Math.min(1, u * 8 + 0.2);
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aCol.needsUpdate = true;
  }
}

class SkidMarks {
  constructor(scene, cap = 1600) {
    this.cap = cap; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 4 * 3);
    this.alpha = new Float32Array(cap * 4);
    const idx = new Uint32Array(cap * 6);
    for (let k = 0; k < cap; k++) idx.set([k * 4, k * 4 + 2, k * 4 + 1, k * 4 + 1, k * 4 + 2, k * 4 + 3], k * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -30,
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.06,0.06,0.06, vA); }',
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.last = new Map();
  }
  add(key, x, z, dx, dz, w, a) {
    const prev = this.last.get(key);
    this.last.set(key, { x, z });
    if (!prev) return;
    const L = Math.hypot(x - prev.x, z - prev.z);
    if (L < 0.05 || L > 3) return;
    const nx = -(z - prev.z) / L * w, nz = (x - prev.x) / L * w;
    const k = this.i++ % this.cap;
    const y = 0.035;
    this.pos.set([prev.x + nx, y, prev.z + nz, prev.x - nx, y, prev.z - nz, x + nx, y, z + nz, x - nx, y, z - nz], k * 12);
    this.alpha.set([a, a, a, a], k * 4);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
  cut(key) { this.last.delete(key); }
}

// claymation: a flame cut from cellophane — three nested tongues, orange, yellow and a pale heart, with clean edges
function flameCanvas(S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const tongue = (k, col) => {
    const w = S * 0.36 * k, h = S * 0.86 * k, cx = S / 2, by = S * 0.95 - (1 - k) * S * 0.12;
    x.fillStyle = col; x.beginPath(); x.moveTo(cx, by - h);
    x.bezierCurveTo(cx + w * 0.35, by - h * 0.62, cx + w, by - h * 0.38, cx + w * 0.82, by - h * 0.14);
    x.bezierCurveTo(cx + w * 0.62, by, cx - w * 0.62, by, cx - w * 0.82, by - h * 0.14);
    x.bezierCurveTo(cx - w, by - h * 0.38, cx - w * 0.35, by - h * 0.62, cx, by - h);
    x.fill();
  };
  tongue(1, 'rgba(236,112,34,0.88)'); tongue(0.68, 'rgba(250,186,48,0.92)'); tongue(0.38, 'rgba(255,240,170,0.95)');
  return c;
}

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const smoke = new THREE.CanvasTexture(smokeCanvas(128));
    const glow = new THREE.CanvasTexture(STYLE.plastilina ? flameCanvas(64) : radialCanvas(64, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,220,150,0.8)'], [1, 'rgba(255,120,40,0)']]));
    this.smoke = new Particles(scene, 900, smoke, false);
    this.fire = new Particles(scene, 500, glow, !STYLE.plastilina); // (claymation: flames of cut cellophane, not light)
    this.skids = new SkidMarks(scene);
    this.debris = [];
    this.flash = new THREE.PointLight(0xffa040, 0, 40, 1.5);
    scene.add(this.flash);
    // muzzle flash: a star of crossed additive quads that lives for a couple of frames
    const fc = document.createElement('canvas'); fc.width = fc.height = 128;
    const fx = fc.getContext('2d');
    const grd = fx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,235,1)'); grd.addColorStop(0.18, 'rgba(255,225,140,0.95)'); grd.addColorStop(0.5, 'rgba(255,150,40,0.45)'); grd.addColorStop(1, 'rgba(255,80,0,0)');
    fx.fillStyle = grd;
    fx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 26 : 62; fx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    fx.closePath(); fx.fill();
    const fm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const fq = new THREE.PlaneGeometry(1, 1);
    this.flashStar = new THREE.Group();
    const face = new THREE.Mesh(fq, fm); this.flashStar.add(face);
    for (const r of [0, Math.PI / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.55).translate(0, 0, 0), fm); side.rotation.set(0, Math.PI / 2, r); side.position.z = 0.25; side.scale.set(1.3, 1, 1); this.flashStar.add(side); }
    this.flashStar.visible = false;
    this.flashStar.renderOrder = 8;
    scene.add(this.flashStar);
    this.flashT = 0;
    this.casings = [];
    // player headlight
    this.head = new THREE.SpotLight(0xfff1d6, 0, 55, 0.55, 0.45, 1.2);
    this.head.castShadow = false;
    scene.add(this.head, this.head.target);
    this.headlights = true;
    // ground stains (dark puddles under people who went down), instanced discs
    this.poolCap = 28; this.pools = []; this.poolI = 0;
    const pg = new THREE.CircleGeometry(1, 20); pg.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicMaterial({ color: 0x3a0505, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -20 });
    this.poolMesh = new THREE.InstancedMesh(pg, pm, this.poolCap);
    this.poolMesh.count = 0; this.poolMesh.frustumCulled = false; this.poolMesh.renderOrder = 2;
    scene.add(this.poolMesh);
    this._m4 = new THREE.Matrix4();
  }

  update(dt) {
    const g = this.game;
    // vehicle smoke / fire / tyre smoke / skids / dust
    for (const v of g.fleet.vehicles) {
      if (v.sleeping) { this.skids.cut(v.id + 'L'); this.skids.cut(v.id + 'R'); continue; }
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const hood = { x: v.x + fx * v.hl * 0.7, z: v.z + fz * v.hl * 0.7 };
      if (v.health < 400 && Math.random() < dt * (v.health < 200 ? 30 : 12)) {
        const dark = v.health < 200 ? 0.2 : 0.6;
        this.smoke.emit(hood.x, v.spec.H * 0.7, hood.z, (Math.random() - 0.5) * 0.6, 1.2, (Math.random() - 0.5) * 0.6, 2.2, 0.8, 3.5, dark, dark, dark, 0.55);
      }
      if (v.fire > 0 && !v.dead || (v.dead && v.burnT > 0)) {
        for (let k = 0; k < 3; k++) this.fire.emit(hood.x + (Math.random() - 0.5), v.spec.H * 0.6, hood.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.5, 1.8 + Math.random(), (Math.random() - 0.5) * 0.5, 0.7, 1.2, 0.3, 1, 0.55, 0.2, 0.9);
        if (v.dead) v.burnT -= dt;
      }
      // tyre smoke & skid marks
      const rx = -fz, rz = fx;
      if (v.skid > 0.25 && v.vel > 3) {
        for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
          const wx = v.x - fx * v.hl * 0.62 + rx * side * v.hw * 0.8, wz = v.z - fz * v.hl * 0.62 + rz * side * v.hw * 0.8;
          this.skids.add(v.id + key, wx, wz, fx, fz, 0.12, clamp(v.skid * 0.7, 0.2, 0.75));
          if (Math.random() < dt * 20 * v.skid && !(v.surf && v.surf.dirt)) this.smoke.emit(wx, 0.3, wz, -v.vx * 0.1, 0.6, -v.vz * 0.1, 1.6, 0.6, 3, 0.85, 0.85, 0.85, 0.35 * v.skid);
        }
      } else { this.skids.cut(v.id + 'L'); this.skids.cut(v.id + 'R'); }
      // dust on dirt
      if (v.surf && v.surf.dirt && v.vel > 5 && Math.random() < dt * v.vel * 1.2) {
        this.smoke.emit(v.x - fx * v.hl, 0.4, v.z - fz * v.hl, -v.vx * 0.2 + (Math.random() - 0.5), 0.5, -v.vz * 0.2 + (Math.random() - 0.5), 2.5, 1, 5, 0.78, 0.68, 0.52, 0.35);
      }
      // exhaust at night/cold start
      if ((v.driver || v.ai) && v.throttle > 0.6 && Math.random() < dt * 6) {
        const ex = v.x - fx * (v.hl + 0.05) + rx * 0.45, ez = v.z - fz * (v.hl + 0.05) + rz * 0.45;
        this.smoke.emit(ex, v.spec.shape === 'tractor' ? 2.6 : 0.3, ez, -fx * 0.5, 0.3, -fz * 0.5, 0.9, 0.2, 0.8, 0.5, 0.5, 0.5, 0.15);
      }
    }
    this.smoke.update(dt, 0.25, 0.9);
    this.fire.update(dt, 2.2, 1.5);
    // explosion / muzzle flash
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * (this.flash.intensity > 60 ? 120 : 260));
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashStar.visible = false; }
    // spent brass: tumbles out, bounces on the ground, rolls a little and stays a while
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.t += dt;
      if (!c.rest) {
        c.vy -= 9.8 * dt;
        c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
        c.m.rotation.x += c.sx * dt; c.m.rotation.y += c.sy * dt;
        const floor = c.floor + 0.005;
        if (c.m.position.y < floor) {
          c.m.position.y = floor; c.vy = -c.vy * 0.35; c.vx *= 0.5; c.vz *= 0.5; c.sx *= 0.4;
          if (!c.clink) { c.clink = true; g.audio.sfx(c.shell ? 'shell_drop' : 'casing', { x: c.m.position.x, z: c.m.position.z, vol: 0.6 }); }
          if (Math.abs(c.vy) < 0.4) { c.rest = true; c.m.rotation.x = 0; c.m.rotation.z = 0; c.m.position.y = floor + (c.shell ? 0.006 : 0.0); }
        }
      }
      if (c.t > 12) { g.scene.remove(c.m); this.casings.splice(i, 1); }
    }
    // puddles grow for a few seconds, fade after a while
    if (this.pools.length) {
      for (let i = 0; i < this.pools.length; i++) {
        const pl = this.pools[i];
        pl.t += dt;
        const r = pl.r * Math.min(1, 0.25 + pl.t / 3.5) * (pl.t > 80 ? Math.max(0, 1 - (pl.t - 80) / 10) : 1);
        this._m4.makeScale(r, 1, r * 0.8).setPosition(pl.x, 0.022, pl.z);
        this.poolMesh.setMatrixAt(i, this._m4);
      }
      this.pools = this.pools.filter((pl) => pl.t < 90);
      this.poolMesh.count = this.pools.length;
      this.poolMesh.instanceMatrix.needsUpdate = true;
    }
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (!d.rest) {
        d.vy -= 12 * dt;
        d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
        d.m.rotation.x += d.sx * dt; d.m.rotation.z += d.sz * dt;
        const floor = d.floor ?? 0.4;
        if (d.m.position.y < floor) { d.m.position.y = floor; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.sx *= 0.5; d.sz *= 0.5; if (Math.abs(d.vy) < 1) { d.rest = true; d.m.rotation.x = d.restX ?? Math.PI / 2; d.m.rotation.z = 0; } }
      }
      if (d.t > (d.ttl || 60)) { g.scene.remove(d.m); this.debris.splice(i, 1); }
    }
    // headlight for the player's car
    const pv = g.player.vehicle;
    const night = g.sky.night;
    if (pv && night > 0.35 && !pv.dead) {
      const fx = Math.sin(pv.heading), fz = Math.cos(pv.heading);
      this.head.intensity = 60 * clamp((night - 0.35) * 3, 0, 1);
      this.head.position.set(pv.x + fx * pv.hl, 0.9, pv.z + fz * pv.hl);
      this.head.target.position.set(pv.x + fx * (pv.hl + 18), 0, pv.z + fz * (pv.hl + 18));
      this.head.target.updateMatrixWorld();
    } else this.head.intensity = 0;
  }

  explosion(x, z, scale = 1) {
    this.flash.position.set(x, 2, z);
    this.flash.intensity = 250 * scale;
    for (let k = 0; k < 60 * scale; k++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 8;
      this.fire.emit(x, 1 + Math.random(), z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 0.6 + Math.random() * 0.6, 3, 0.8, 1, 0.5 + Math.random() * 0.3, 0.15, 1);
    }
    for (let k = 0; k < 40 * scale; k++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this.smoke.emit(x, 1 + Math.random() * 2, z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 4 + Math.random() * 3, 2, 8, 0.12, 0.11, 0.1, 0.7);
    }
  }
  casing(kind, pos, vx, vy, vz) {
    const m = casingMesh(kind);
    m.position.copy(pos);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.castShadow = false;
    this.game.scene.add(m);
    this.casings.push({ m, vx, vy, vz, sx: (Math.random() - 0.5) * 30, sy: (Math.random() - 0.5) * 20, t: 0, floor: this.game.player.pos.y, shell: kind === 'escopeta' });
    if (this.casings.length > 36) { const c = this.casings.shift(); this.game.scene.remove(c.m); }
  }
  // flash star at the muzzle (dir3: normalised 3D direction of fire; size by weapon)
  muzzleStar(x, y, z, dx, dy, dz, size = 1) {
    const f = this.flashStar;
    f.position.set(x + dx * 0.05, y + dy * 0.05, z + dz * 0.05);
    f.lookAt(x + dx, y + dy, z + dz);
    const s = size * (0.8 + Math.random() * 0.4);
    f.scale.set(s * 0.32, s * 0.32, s * 0.5);
    f.children[0].rotation.z = Math.random() * Math.PI;
    f.visible = true;
    this.flashT = 0.045;
  }
  muzzle(x, y, z, dx, dz) {
    for (let k = 0; k < 5; k++) this.fire.emit(x + dx * 0.1, y, z + dz * 0.1, dx * (2 + Math.random() * 3), (Math.random() - 0.3) * 0.6, dz * (2 + Math.random() * 3), 0.05 + Math.random() * 0.03, 0.34, 0.08, 1, 0.8, 0.45, 1);
    this.smoke.emit(x + dx * 0.3, y, z + dz * 0.3, dx * 0.6, 0.35, dz * 0.6, 0.7, 0.15, 0.7, 0.75, 0.75, 0.75, 0.22);
    if (this.flash.intensity < 30) { this.flash.position.set(x, y, z); this.flash.intensity = 28; }
  }
  impact(x, y, z) {
    for (let k = 0; k < 4; k++) this.smoke.emit(x, y, z, (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.3, 0.08, 0.45, 0.62, 0.58, 0.52, 0.55);
    this.sparks(x, y, z, 3);
  }
  blood(x, y, z, dx, dz) {
    for (let k = 0; k < 6; k++) this.smoke.emit(x, y, z, dx * (1 + Math.random() * 2) + (Math.random() - 0.5), 0.2 + Math.random() * 0.8, dz * (1 + Math.random() * 2) + (Math.random() - 0.5), 0.35 + Math.random() * 0.25, 0.06, 0.28, 0.42, 0.02, 0.02, 0.85);
  }
  pool(x, z, r = 0.8) {
    if (this.pools.length >= this.poolCap) this.pools.shift();
    this.pools.push({ x, z, r: r * (0.8 + Math.random() * 0.4), t: 0 });
  }
  sparks(x, y, z, n = 10) {
    for (let k = 0; k < n; k++) this.fire.emit(x, y, z, (Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8, 0.35, 0.25, 0.05, 1, 0.8, 0.4, 1);
  }
  addDebris(mesh, vx, vy, vz, opts = {}) {
    this.game.scene.add(mesh);
    this.debris.push({ m: mesh, vx, vy, vz, sx: (Math.random() - 0.5) * 8, sz: (Math.random() - 0.5) * 8, t: 0, ...opts });
    if (this.debris.length > 40) { const d = this.debris.shift(); this.game.scene.remove(d.m); }
  }
}
