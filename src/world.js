// Builds the whole static world of Guareña: ground, roads, buildings, landmarks, vegetation and street furniture.
import * as THREE from 'three';
import { buildFacadeArray, buildGroundArray, markingsCanvas, radialCanvas, signAtlas } from './textures.js';
import { arrayTexture, makeBuildingMaterial, makeGroundMaterial, makeNightGlowMaterial, makeTrimMaterial, shared } from './materials.js';
import { FacadeDetails, CT } from './facades.js';
import { PLAYER_PRESETS } from './characters.js';
import { buildStreetLife } from './streetlife.js';
import { buildBuildings, buildAOGeometry } from './buildings.js';
import { infillGaps, placeStreetShops } from './infill.js';
import { loadTextureArray, loadTexture, DETAIL_LAYERS, DETAIL_SIZE, GROUND_DETAIL, GROUND_DETAIL_SIZE } from './assets.js';
import { buildGroundField, buildGroundRelief, placeGroundLife } from './groundfx.js';
import { buildGround, buildMarkings } from './ground.js';
import { makeFurnitureGeometries, InstanceGroup } from './props.js';
import { TreeLibrary, TreeField } from './trees.js';
import { plantTown } from './vegetation.js';
import { STYLE } from './style.js';
import { toonifyLayers } from './toon.js';
import { buildLandmarks } from './landmarks.js';
import { Reservoir } from './pantano.js';
import { buildTrafficSigns } from './signs.js';
import { mulberry32, hash1, hash2, pointInRing, ringArea, ringBounds, polySample, polyNearest, clamp } from './util.js';

export class World {
  constructor(scene, map, quality) {
    this.scene = scene;
    this.map = map;
    this.q = quality;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.lampPoints = [];   // for glow sprites & light pools
    this.spawnSpots = [];
    this.breakables = [];   // dynamic props that can be knocked over
  }

  async build(progress) {
    const map = this.map;
    const q = this.q;
    let tPrev = performance.now(), lPrev = 'start';
    const step = async (label, frac) => {
      const t = performance.now();
      if (typeof location !== 'undefined' && /[?&]debug\b/.test(location.search)) console.log(`[world] ${lPrev}: ${(t - tPrev).toFixed(0)} ms`);
      tPrev = t; lPrev = label;
      progress && progress(label, frac);
      await new Promise((r) => setTimeout(r, 0));
    };

    await step('Encalando fachadas…', 0.08);
    const S = q.texSize;
    const fac = buildFacadeArray(S);
    // the anime look repaints them: flat colour, a few tones, ink on every real edge
    if (STYLE.anime) toonifyLayers(fac.data, fac.size, fac.layers, { rColor: 3, rEdge: 1, levels: 6, posterize: 0.75, ink: 0.78, edge0: 15, edge1: 30, grunge: 1 });
    // claymation: the same paintings as pieces of plasticine — smoothed, a few soft tones, purer colour, no lines
    else if (STYLE.plastilina) toonifyLayers(fac.data, fac.size, fac.layers, { rColor: 3, rEdge: 1, levels: 5, posterize: 0.5, ink: 0, saturation: 1.1 });
    this.facadeTex = arrayTexture(fac.data, fac.size, fac.layers, { aniso: q.aniso });
    await step('Empedrando calles…', 0.18);
    const gnd = buildGroundArray(Math.min(512, S));
    if (STYLE.anime) toonifyLayers(gnd.data, gnd.size, gnd.layers, { rColor: 4, rEdge: 1, levels: 5, posterize: 0.7, ink: 0.62, edge0: 16, edge1: 36, saturation: 0.82, grunge: 0.35 });
    else if (STYLE.plastilina) toonifyLayers(gnd.data, gnd.size, gnd.layers, { rColor: 3, rEdge: 1, levels: 5, posterize: 0.45, ink: 0, saturation: 1.08 });
    this.groundTex = arrayTexture(gnd.data, gnd.size, gnd.layers, { aniso: q.aniso });

    // ---------------- landmarks (claim their footprints first)
    await step('Levantando la torre de Santa María…', 0.26);
    this.landmarks = buildLandmarks(this, map);
    const skipPart = (p) => this.landmarks.claims(p.c[0], p.c[1]);
    // the street fronts the Catastro leaves open where the town has houses (src/infill.js)
    this.infill = infillGaps(map, { claims: (x, z) => this.landmarks.claims(x, z) });
    this.streetShops = placeStreetShops(map, { claims: (x, z) => this.landmarks.claims(x, z) });

    // ---------------- buildings
    await step('Colocando tejas árabes…', 0.34);
    // CC0 photo-scanned materials (Poly Haven) for plaster, brick, granite and clay tiles
    const dS = q.photo || (q.texSize >= 512 ? 512 : 256); // photo scans at 1K on high quality
    // (the anime look paints its walls flat, the claymation models them: no photographs)
    const [dA, dN] = STYLE.anime || STYLE.plastilina ? [{ tex: null, mean: null, any: false }, null] : await Promise.all([
      loadTextureArray(DETAIL_LAYERS, '_d', dS, { aniso: q.aniso }),
      q.shadows > 0 ? loadTextureArray(DETAIL_LAYERS, '_n', Math.min(dS, 512), { srgb: false, aniso: q.aniso, flat: [128, 128, 255, 255] }) : Promise.resolve(null),
    ]);
    this.detail = { alb: dA.tex, nrm: dN ? dN.tex : null, mean: dA.mean, size: DETAIL_SIZE, on: dA.any, normals: !!(dN && dN.any) };
    this.bMat = makeBuildingMaterial(this.facadeTex, this.detail);
    // real openings (holes + reveals) and 3D facade details around the camera on medium/high quality
    const near3d = q.facade3d || 0;
    const annie = PLAYER_PRESETS.find((pp) => pp.id === 'annie');
    const facade = { holes: near3d > 0, forcedDoors: annie && annie.start ? [{ x: annie.start.x, z: annie.start.z }] : [], openings: near3d > 0 ? [] : null, runs: [], ground: [] };
    const bb = buildBuildings(map, { skipPart, onBuilding: (b) => !this.landmarks.claimsBuilding(b), overrides: this.landmarks.overrides, facade });
    for (const g of bb.geometries) {
      const m = new THREE.Mesh(g, this.bMat);
      m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.root.add(m);
    }
    this.buildingParts = bb.parts;
    this.stats = { buildingTris: bb.tris };
    this.aoLines = bb.ao;
    this.facadeRuns = facade.runs || [];
    shared.uNearDist.value = 0;
    // every planned front door / garage / shop front on the street facades (with or without real holes)
    this.facadeGround = facade.ground;
    this.facadeDoors = [];
    for (const o of facade.ground) {
      if (o.type !== CT.DOOR) continue;
      const old = o.style === 'trad_verde' || o.style === 'trad_ocre' || o.style === 'piedra';
      this.facadeDoors.push({ x: o.x + o.nx * 0.75, z: o.z + o.nz * 0.75, wx: o.x, wz: o.z, nx: o.nx, nz: o.nz, bid: o.bid, old });
    }
    // streamed chunks of 3D facade details, also used for every static street prop (so it exists on low quality too)
    this.trimMat = makeTrimMaterial();
    this.facades = new FacadeDetails(facade.openings || [], near3d > 0 ? facade.runs : [], this.root, this.trimMat, { near: near3d || 90, shadowDist: q.shadows > 1 ? 70 : q.shadows ? 45 : 0 });
    if (facade.openings) {
      shared.uNearDist.value = near3d;
      this.stats.openings = facade.openings.length;
    }
    // AO strips
    // zone map (distance to the street, age of the neighbourhood, greenery) shared by the ground and its details
    await step('Midiendo las aceras…', 0.46);
    this.groundField = buildGroundField(map, this.facadeRuns);
    const aoG = buildAOGeometry(bb.ao);
    const F = this.groundField;
    // contact shadow at the foot of the walls, with grime and moss where the street is old or damp
    const aoMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -28,
      uniforms: { uField: { value: F.tex }, uRect: { value: new THREE.Vector4(F.x0, F.z0, F.w, F.h) } },
      vertexShader: 'attribute float aAlpha; varying float vA; varying vec2 vW; void main(){ vA=aAlpha; vW=(modelMatrix*vec4(position,1.0)).xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform sampler2D uField; uniform vec4 uRect; varying float vA; varying vec2 vW;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec4 z = texture2D(uField, (vW - uRect.xy) / uRect.zw);
  float age = z.g, green = z.b;
  float nz = n2(vW * 3.1) * 0.6 + n2(vW * 11.0) * 0.4;
  float moss = smoothstep(0.55, 0.8, nz) * smoothstep(0.55, 0.95, vA) * clamp(age * 0.8 + green * 0.6, 0.0, 1.0);
  vec3 c = mix(vec3(0.07, 0.055, 0.04), vec3(0.16, 0.2, 0.07), moss);
  float a = vA * vA * (0.75 + 0.5 * nz) * (0.85 + age * 0.35) + moss * 0.35 * vA;
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.85));
}`,
    });
    const ao = new THREE.Mesh(aoG, aoMat);
    ao.renderOrder = 2;
    ao.matrixAutoUpdate = false;
    this.root.add(ao);
    // the joints between houses built side by side (no crack showing the void behind them)
    this.buildGapFillers(map);
    // collider for landmarks; wall grid is final from here on (circles are added later)
    this.landmarks.addColliders(map);
    map.collider.buildSegments();

    // ---------------- ground
    await step('Arando los campos de las Vegas…', 0.5);
    const G = buildGround(map, null, { garages: this.facadeGround.filter((o) => o.type === CT.GARAGE) });
    this.groundData = G;
    // CC0 photo-scanned ground (asphalt, concrete, dry earth, gravel, grass) + the zone map for the imperfections
    const gS = q.photo || (q.texSize >= 512 ? 512 : 256);
    const [gA, gN] = STYLE.anime || STYLE.plastilina ? [{ tex: null, mean: null, any: false }, null] : await Promise.all([
      loadTextureArray(GROUND_DETAIL, '_d', gS, { aniso: q.aniso }),
      q.shadows > 0 ? loadTextureArray(GROUND_DETAIL, '_n', Math.min(gS, 512), { srgb: false, aniso: q.aniso, flat: [128, 128, 255, 255] }) : Promise.resolve(null),
    ]);
    const fx = { det: gA.tex, detN: gN ? gN.tex : null, on: gA.any, normals: !!(gN && gN.any), mean: gA.mean, size: GROUND_DETAIL_SIZE, field: F.tex, rect: [F.x0, F.z0, F.w, F.h] };
    this.groundFx = fx;
    const levelMats = [0, 1, 2, 3, 4, 5, 6].map((lv) => makeGroundMaterial(this.groundTex, { polygonOffset: lv, fx }));
    G.geoms.forEach((g, lv) => {
      if (!g) return;
      const m = new THREE.Mesh(g, levelMats[lv]);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.renderOrder = -10 + lv;
      this.root.add(m);
    });
    if (G.curbs) {
      const m = new THREE.Mesh(G.curbs, makeGroundMaterial(this.groundTex, { polygonOffset: 6, fx }));
      m.receiveShadow = true; m.matrixAutoUpdate = false; m.renderOrder = -3;
      this.root.add(m);
    }
    // base plane (outside everything)
    const baseG = new THREE.PlaneGeometry(24000, 24000, 1, 1);
    baseG.rotateX(-Math.PI / 2);
    const bt = new Float32Array(4 * 3), bg = new Float32Array(4 * 3);
    const bp = baseG.attributes.position;
    for (let i = 0; i < 4; i++) { bg[i * 3] = bp.getX(i) / 9; bg[i * 3 + 1] = bp.getZ(i) / 9; bg[i * 3 + 2] = 8; bt.set([0.92, 0.88, 0.8], i * 3); }
    baseG.setAttribute('aGnd', new THREE.BufferAttribute(bg, 3));
    baseG.setAttribute('aTint', new THREE.BufferAttribute(bt, 3));
    const base = new THREE.Mesh(baseG, makeGroundMaterial(this.groundTex, { polygonOffset: 0, fx }));
    base.position.y = -0.05;
    base.receiveShadow = true;
    base.renderOrder = -20;
    this.root.add(base);
    this.base = base; // (the fields out to the horizon: hidden inside a house, whose windows show the real street)
    // markings
    const mk = buildMarkings(map);
    if (mk) {
      const tex = new THREE.CanvasTexture(markingsCanvas());
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = q.aniso;
      const mm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 });
      const m = new THREE.Mesh(mk, mm);
      m.receiveShadow = true; m.renderOrder = 1; m.matrixAutoUpdate = false;
      this.root.add(m);
    }
    // water
    this.buildWater(G.water);

    // ---------------- vegetation
    await step('Plantando olivos y encinas…', 0.66);
    this.buildVegetation(G);
    // tree pits, lifted and broken tiles, downpipe channels
    await step('Levantando baldosas…', 0.74);
    this.groundRelief = buildGroundRelief(this, map, this.groundField);
    if (this.groundRelief.geom) {
      const m = new THREE.Mesh(this.groundRelief.geom, makeGroundMaterial(this.groundTex, { polygonOffset: 1, fx }));
      m.receiveShadow = true; m.matrixAutoUpdate = false; m.renderOrder = -2;
      this.root.add(m);
    }

    // ---------------- street furniture & lights
    await step('Encendiendo las farolas…', 0.8);
    this.buildFurniture(G);
    await step('Despertando a las cigüeñas…', 0.92);
    this.landmarks.finish();
    map.collider.buildCircles();
    await step('done', 1);
  }

  // ------------------------------------------------------------ water
  buildWater(list) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f6d7a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -20 });
    const pool = new THREE.MeshStandardMaterial({ color: 0x4fc3d9, roughness: 0.05, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -20 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix*vec4(position,1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vWP;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float t=uTime*0.6; vec2 p=vWP*0.35;
  vec3 pn = normalize(vec3(sin(p.x*1.7+t)*0.08+sin(p.y*2.3-t*1.3)*0.06, 1.0, cos(p.y*1.9+t*0.7)*0.08+cos(p.x*2.9+t)*0.05));
  normal = normalize((viewMatrix*vec4(pn,0.0)).xyz); }`);
    };
    for (const w of list) {
      if (w.water === 'pool' && Math.hypot(w.ring[0], w.ring[1]) < 1500) continue; // (the town's swimming pools: pools.js)
      // the big reservoir gets the full treatment (shore, dam, jetty, real water)
      if (w.water === 'lake' && (/Pantano/i.test(w.name || '') || Math.abs(ringArea(w.ring)) > 30000)) {
        try { this.reservoir = new Reservoir(this, w); this.root.add(this.reservoir.root); continue; } catch (e) { console.warn('pantano', e); this.reservoir = null; }
      }
      const shape = new THREE.Shape();
      const r = w.ring;
      shape.moveTo(r[0], -r[1]);
      for (let i = 2; i < r.length; i += 2) shape.lineTo(r[i], -r[i + 1]);
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, w.water === 'pool' ? pool : mat);
      m.position.y = w.water === 'pool' ? 0.06 : 0.02;
      m.receiveShadow = true;
      this.root.add(m);
      if (w.water === 'pool') {
        // pool rim
        const pts = [];
        for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector3(r[i], 0.12, r[i + 1]));
        pts.push(pts[0].clone());
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), pts.length * 2, 0.25, 4, false);
        this.root.add(new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 })));
      }
    }
    // stream (arroyo) as a thin strip of water with reeds
    this.streams = this.map.lines.filter((l) => l.kind.startsWith('water:'));
  }

  // ------------------------------------------------------------ vegetation
  // every species grown at start-up (trees.js), planted by what each place is (vegetation.js), drawn as instances:
  // whole near the camera, lighter further off, billboards out to the horizon
  buildVegetation(G) {
    const q = this.q;
    const lib = new TreeLibrary(this.renderer || null, { variants: q.trees >= 4000 ? 3 : 2 });
    const F = new TreeField(lib, { near: q.shadows > 1 ? 170 : q.shadows ? 140 : 110, d0: q.shadows > 1 ? 48 : q.shadows ? 36 : 26, dShadow: q.shadows > 1 ? 85 : 60 });
    this.treeLib = lib; this.trees = F;
    this.vegCounts = plantTown(this, G, F, q);
    F.build(this.root);
    // the pots on sills, balconies and doorsteps get their plants from the same leaves
    if (this.facades) { this.facades.plantMat = lib.leafMat; this.facades.plantDepth = lib.depthMat; }
    // tree trunks collide
    const c = F.circles;
    for (let i = 0; i < c.length; i += 3) if (c[i + 2] > 0.05) this.map.collider.addCircle(c[i], c[i + 1], c[i + 2], 6, -2);
    this.treeCount = F.items.length;
  }

  // ------------------------------------------------------------ street furniture & lamps
  buildFurniture(G) {
    const map = this.map;
    const F = makeFurnitureGeometries();
    this.furnGeoms = F;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
    const glowMat = makeNightGlowMaterial(0xffffff, { dayLevel: 0.9, nightLevel: 2.2 });
    this.lodGroups = this.lodGroups || [];
    const g = (geo, m = mat, cs = true) => { const ig = new InstanceGroup(geo, m, { castShadow: cs, chunk: 200, maxDist: 450 }); this.lodGroups.push(ig); return ig; };
    const lampsWall = g(F.farolPared), lampsWallL = g(F.farolParedLuz, glowMat, false);
    const lampsPost = g(F.farola), lampsPostL = g(F.farolaLuz, glowMat, false);
    const benches = g(F.banco), bolards = g(F.bolardo);
    const conts = { v: g(F.contVerde), a: g(F.contAmarillo), z: g(F.contAzul), m: g(F.contMarron) };
    const chimneys = g(F.chimenea), antennas = g(F.antena, mat, false), solar = g(F.solar), tanks = g(F.deposito), acs = g(F.aire);
    const poles = g(F.posteLuz);
    const rnd = mulberry32(777);
    const col = map.collider;
    const lampPts = this.lampPoints;
    const tmp = {};
    // lamps along streets. Wall lanterns hang from a real street facade (square to that wall, under its eaves, on a
    // plate and brace); where there is no wall, a post lamp stands on the pavement by the kerb — never on another
    // street's carriageway, inside a junction or in front of a door or garage.
    const grid = (cell) => { const m = new Map(); return { add(x0, z0, x1, z1, o) { for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) { const k = gx * 73856093 ^ gz * 19349663; let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(o); } }, near(x, z) { return m.get(Math.floor(x / cell) * 73856093 ^ Math.floor(z / cell) * 19349663) || []; } }; };
    const runs = grid(12);
    for (const r of this.facadeRuns) runs.add(Math.min(r.ax, r.bx) - 7, Math.min(r.az, r.bz) - 7, Math.max(r.ax, r.bx) + 7, Math.max(r.az, r.bz) + 7, r);
    const doors = grid(8);
    for (const o of this.facadeGround) doors.add(o.x - o.r - 1, o.z - o.r - 1, o.x + o.r + 1, o.z + o.r + 1, o);
    const junc = grid(20);
    for (const n of map.nodes) if (n.degree >= 3) junc.add(n.x - n.radius - 2, n.z - n.radius - 2, n.x + n.radius + 2, n.z + n.radius + 2, n);
    const wallAt = (px, pz, snx, snz) => {
      // the facade run on this side of the street that the point projects onto (roughly parallel, within 6 m)
      let best = null, bd = 6.5;
      for (const r of runs.near(px, pz)) {
        if (r.nx * snx + r.nz * snz > -0.72) continue; // wall must face the street
        const dx = r.bx - r.ax, dz = r.bz - r.az, L = Math.hypot(dx, dz);
        const t = ((px - r.ax) * dx + (pz - r.az) * dz) / (L * L);
        if (t * L < 0.6 || (1 - t) * L < 0.6) continue;
        const d = (px - r.ax) * r.nx + (pz - r.az) * r.nz; // distance in front of the wall
        if (d < 0 || d > bd) continue;
        bd = d; best = { r, x: r.ax + dx * t, z: r.az + dz * t };
      }
      return best;
    };
    const blocked = (x, z, e) => {
      // any carriageway (this street's own too, past a bend) and the middle of pedestrian streets
      if (map.roadAt(x, z, 0.45)) return true;
      const q = map.nearestEdge(x, z, 25, (o) => o !== e && o.cls === 'pedestrian');
      if (q && q.d < q.edge.w / 2 + 0.45) return true;
      for (const n of junc.near(x, z)) if (Math.hypot(n.x - x, n.z - z) < n.radius + 1.2) return true;
      for (const o of doors.near(x, z)) if (Math.hypot(o.x - x, o.z - z) < o.r + 0.5) return true;
      return map.buildingAt(x, z);
    };
    this.lampLog = { wall: 0, post: 0, skipped: 0 };
    for (const e of map.edges) {
      if (!e.drive && e.cls !== 'pedestrian') continue;
      if (e.dirt) continue;
      const inTown = map.inTown(e.pts[0], e.pts[1]) || map.inTown(e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]);
      if (!inTown && e.cls !== 'primary') continue;
      const spacing = e.facade && e.facade < 14 ? 24 : 30;
      let side = hash1(e.id) < 0.5 ? 1 : -1;
      for (let s = 8; s < e.len - 4; s += spacing) {
        polySample(e.pts, e.cum, s, tmp);
        side = -side;
        const nx = -tmp.dz * side, nz = tmp.dx * side;
        const hw = e.w / 2;
        const w = inTown ? wallAt(tmp.x + nx * hw, tmp.z + nz * hw, nx, nz) : null;
        if (w) {
          const r = w.r, ang = Math.atan2(r.nx, r.nz); // lantern arm along the wall normal, out over the pavement
          // under the eaves of a single-storey house; between ground floor and first floor on taller ones
          const y = r.H > 5.4 ? 2.85 : Math.max(2.45, Math.min(2.85, r.H - 0.5));
          const x = w.x + r.nx * 0.012, z = w.z + r.nz * 0.012;
          lampsWall.add(x, y, z, ang); lampsWallL.add(x, y, z, ang);
          lampPts.push(x + r.nx * 0.62, y - 0.36, z + r.nz * 0.62);
          this.lampLog.wall++;
        } else {
          const d = hw + (e.sw > 0 ? 0.62 : 0.7);
          const x = tmp.x + nx * d, z = tmp.z + nz * d;
          if (blocked(x, z, e)) { this.lampLog.skipped++; continue; }
          const ang = Math.atan2(-nx, -nz); // arm out over the road
          const h1 = lampsPost.add(x, 0, z, ang), h2 = lampsPostL.add(x, 0, z, ang);
          this.breakables.push({ kind: 'farola', x, z, r: 0.15, group: lampsPost, h: h1, group2: lampsPostL, h2, ang, geo: F.farola, h6: 6 });
          lampPts.push(x - nx * 1.15, 5.4, z - nz * 1.15);
          this.lampLog.post++;
        }
      }
    }
    // containers in sets of 3-4, as in Guareña: in the parking lane against the kerb (the side where cars park, the
    // parked cars leave that space free), a little away from the junction — never in a narrow street's carriageway
    const junctions = map.nodes.filter((n) => n.degree >= 3 && map.inTown(n.x, n.z));
    const doorsNear = (x, z) => this.facadeGround.some((o) => Math.abs(o.x - x) < o.r + 1.4 && Math.abs(o.z - z) < o.r + 1.4 && Math.hypot(o.x - x, o.z - z) < o.r + 1.4);
    for (const n of junctions) {
      if (hash1(n.id * 7) > 0.34) continue;
      const e = n.edges.map((id) => map.edges[id]).filter((q) => q.drive && !q.dirt && !q.blocked && q.w >= 8 && q.len > n.radius + 24 && q.cls !== 'primary').sort((a, b) => b.w - a.w)[0];
      if (!e) continue;
      const fromA = e.a === n.id;
      const s = fromA ? n.radius + 12 : e.len - n.radius - 12;
      polySample(e.pts, e.cum, s, tmp);
      const side = e.w >= 10.2 ? 1 : e.oneway ? -1 : hash1(e.id) < 0.5 ? 1 : -1; // same rule as the parked cars
      const nx = -tmp.dz * side, nz = tmp.dx * side;
      const d = e.w / 2 - 0.82;
      const ang = Math.atan2(tmp.dx, tmp.dz);
      const kinds = ['v', 'a', 'z', 'm'];
      if (doorsNear(tmp.x + nx * d, tmp.z + nz * d)) continue;
      for (let k = 0; k < 4; k++) {
        const along = (k - 1.5) * 1.45;
        const x = tmp.x + nx * d + tmp.dx * along, z = tmp.z + nz * d + tmp.dz * along;
        if (map.buildingAt(x, z) || map.buildingAt(x + nx * 0.8, z + nz * 0.8)) continue;
        // only in this street's parking lane: never on another street's carriageway nor in the travel lanes
        if (map.roadAt(x, z, 0.6, false, e) || map.roadAt(x, z, 0.7, true)) continue;
        const h = conts[kinds[k]].add(x, 0, z, ang + Math.PI / 2);
        this.breakables.push({ kind: 'cont', x, z, r: 0.75, color: kinds[k], group: conts[kinds[k]], h, ang: ang + Math.PI / 2, geo: F['cont' + { v: 'Verde', a: 'Amarillo', z: 'Azul', m: 'Marron' }[kinds[k]]] });
      }
    }
    // benches in parks & plazas
    const plazaLike = map.areas.filter((a) => ['leisure:park', 'place:square', 'highway:pedestrian', 'amenity:marketplace', 'landuse:village_green'].includes(a.kind));
    for (const a of plazaLike) {
      const [x0, z0, x1, z1] = ringBounds(a.ring);
      const area = Math.abs(ringArea(a.ring));
      const n = Math.min(24, Math.max(1, area / 250));
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!pointInRing(x, z, a.ring) || map.buildingAt(x, z) || map.roadAt(x, z, 1.2)) continue; // a street crossing the square
        if ((this.landmarks.reserved || []).some(([rx, rz, rr]) => Math.hypot(x - rx, z - rz) < rr)) continue; // (round a fountain)
        const ang = rnd() * Math.PI * 2;
        benches.add(x, 0, z, ang);
        col.addCircle(x, z, 0.55, 1, -4);
        this.spawnSpots.push({ kind: 'bench', x, z, ang });
      }
    }
    // roof clutter: chimneys, antennas, solar panels, water tanks
    for (const p of this.buildingParts) {
      if (p.area < 25) continue;
      const h = hash1(p.id * 13 + 5);
      const [cx, cz] = p.c;
      if (!pointInRing(cx, cz, p.ring)) continue;
      if (p.info.style === 'nave') {
        if (h < 0.18) for (let k = 0; k < 4; k++) solar.add(cx + (k - 1.5) * 2.2, p.H + 0.1, cz, 0);
        continue;
      }
      if (h < 0.35) chimneys.add(cx + (hash1(p.id) - 0.5) * 2, p.H + 0.2, cz + (hash1(p.id + 1) - 0.5) * 2, h * 20, 1, 1 + h);
      if (h > 0.55 && h < 0.8) antennas.add(cx, p.H + 0.8, cz, h * 30);
      if (p.floors >= 3 && h > 0.3) { tanks.add(cx + 1.5, p.H, cz - 1, 0); acs.add(cx - 1.5, p.H, cz + 1, h * 5); }
      if (h > 0.9) for (let k = 0; k < 3; k++) solar.add(cx + (k - 1) * 2.1, p.H + 1.2, cz, 0.3);
    }
    // power poles from OSM nodes. Some are mapped in a carriageway (on the centreline or a little off): those go to the
    // nearer kerb, and their wires with them; where neither kerb is free the line hangs from the facade instead
    const tp = {};
    for (const p of map.pois) {
      if (p.kind !== 'power:pole') continue;
      const e = map.roadAt(p.x, p.z, 0.35);
      if (!e) continue;
      const q = polyNearest(e.pts, e.cum, p.x, p.z);
      polySample(e.pts, e.cum, q.s, tp);
      const side = (p.x - q.x) * -tp.dz + (p.z - q.z) * tp.dx >= 0 ? 1 : -1;
      let moved = false;
      for (const sd of [side, -side]) {
        const d = e.w / 2 + 0.45, x = q.x - tp.dz * d * sd, z = q.z + tp.dx * d * sd;
        if (map.buildingAt(x, z) || map.roadAt(x, z, 0.3)) continue;
        for (const l of map.lines) {
          if (!l.kind.startsWith('power:')) continue;
          for (let i = 0; i < l.pts.length; i += 2) if (Math.abs(l.pts[i] - p.x) < 0.3 && Math.abs(l.pts[i + 1] - p.z) < 0.3) { l.pts[i] = x; l.pts[i + 1] = z; }
        }
        p.x = x; p.z = z; moved = true;
        break;
      }
      if (!moved) p.kind = 'power:pole_wall';
    }
    for (const p of map.pois) if (p.kind === 'power:pole') { poles.add(p.x, 0, p.z, hash1(p.x) * 3); col.addCircle(p.x, p.z, 0.2, 9, -5); }
    for (const grp of [lampsWall, lampsWallL, lampsPost, lampsPostL, benches, bolards, chimneys, antennas, solar, tanks, acs, poles, ...Object.values(conts)]) grp.build(this.root);
    // vertical traffic signs (shaped plates on posts or wall brackets, some worn)
    try { buildTrafficSigns(this, map); } catch (e) { console.warn('signs', e); }
    // breakable props as colliders (containers, lamp posts)
    this.breakByCircle = new Map();
    for (const b of this.breakables) { b.circle = col.addCircle(b.x, b.z, b.r, b.h6 || 1.4, -6); this.breakByCircle.set(b.circle, b); }
    this.furnMat = mat;
    this.buildLampGlows();
    this.buildPowerLines();
    // what really fills the streets: chairs, pots, bags, litter, terraces, cats… (streetlife.js)
    buildStreetLife(this, map, this.q);
    // and the weeds, grass and scrub invading pavements, kerbs, tree pits and yards (groundfx.js)
    placeGroundLife(this, map, this.groundField, (this.groundRelief && this.groundRelief.weedSpots) || []);
  }

  // Catastro footprints of neighbouring houses leave slivers of 6 cm – 1.2 m between them. Round a corner and you could
  // see straight through to nothing. A party wall (medianera) now stands in every such joint, set half the gap back
  // from the street, as tall as the lower of the two houses, and it blocks the way too.
  buildGapFillers(map) {
    const cell = 8, grid = new Map(), edges = [];
    for (const b of map.buildings) {
      if (!b.height || !map.inTown(b.c[0], b.c[1])) continue;
      const r = b.ring, n = r.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], L = Math.hypot(bx - ax, bz - az);
        if (L < 1) continue;
        const ei = edges.length;
        edges.push({ b, ax, az, bx, bz, L, ux: (bx - ax) / L, uz: (bz - az) / L });
        for (let gx = Math.floor(Math.min(ax, bx) / cell); gx <= Math.floor(Math.max(ax, bx) / cell); gx++)
          for (let gz = Math.floor(Math.min(az, bz) / cell); gz <= Math.floor(Math.max(az, bz) / cell); gz++) {
            const k = gx * 73856093 ^ gz * 19349663;
            let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(ei);
          }
      }
    }
    const segDist = (px, pz, e) => { const t = clamp((px - e.ax) * e.ux + (pz - e.az) * e.uz, 0, e.L); return Math.hypot(e.ax + e.ux * t - px, e.az + e.uz * t - pz); };
    const pos = [], uv = [];
    for (let ei = 0; ei < edges.length; ei++) {
      const A = edges[ei];
      const cands = new Set();
      for (let gx = Math.floor(Math.min(A.ax, A.bx) / cell) - 1; gx <= Math.floor(Math.max(A.ax, A.bx) / cell) + 1; gx++)
        for (let gz = Math.floor(Math.min(A.az, A.bz) / cell) - 1; gz <= Math.floor(Math.max(A.az, A.bz) / cell) + 1; gz++)
          for (const ej of grid.get(gx * 73856093 ^ gz * 19349663) || []) if (ej > ei) cands.add(ej);
      for (const ej of cands) {
        const Bq = edges[ej];
        if (Bq.b === A.b || Math.abs(A.ux * Bq.ux + A.uz * Bq.uz) < 0.97) continue;
        const g = Math.min(segDist(Bq.ax, Bq.az, A), segDist(Bq.bx, Bq.bz, A), segDist(A.ax, A.az, Bq), segDist(A.bx, A.bz, Bq));
        if (g < 0.05 || g > 1.25) continue;
        const t1 = (Bq.ax - A.ax) * A.ux + (Bq.az - A.az) * A.uz, t2 = (Bq.bx - A.ax) * A.ux + (Bq.bz - A.az) * A.uz;
        const o0 = Math.max(0, Math.min(t1, t2)), o1 = Math.min(A.L, Math.max(t1, t2));
        if (o1 - o0 < 0.8) continue;
        // the midline between the two walls, over the stretch where they face each other
        const side = (Bq.ax + Bq.bx) / 2 - A.ax, sideZ = (Bq.az + Bq.bz) / 2 - A.az;
        const nx = -A.uz, nz = A.ux, sgn = side * nx + sideZ * nz >= 0 ? 1 : -1;
        const off = (g / 2) * sgn;
        const x0 = A.ax + A.ux * o0 + nx * off, z0 = A.az + A.uz * o0 + nz * off;
        const x1 = A.ax + A.ux * o1 + nx * off, z1 = A.az + A.uz * o1 + nz * off;
        const h = Math.max(2.4, Math.min(A.b.height, Bq.b.height) - 0.05);
        pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0);
        const L = o1 - o0;
        uv.push(0, 0, L / 2, 0, L / 2, h / 2, 0, 0, L / 2, h / 2, 0, h / 2);
        map.collider.addSegment(x0, z0, x1, z1, h);
        (this.gapList || (this.gapList = [])).push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, g, L, nx: nx * sgn, nz: nz * sgn });
      }
    }
    this.gapCount = pos.length / 18;
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: loadTexture('white_rough_plaster', '_d'), color: 0xd9d2c4, roughness: 0.95, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
    this.root.add(m);
  }

  buildLampGlows() {
    const pts = this.lampPoints;
    const n = pts.length / 3;
    if (!n) return;
    // glow sprites (Points)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const tex = new THREE.CanvasTexture(radialCanvas(128, [[0, 'rgba(255,236,200,1)'], [0.15, 'rgba(255,200,120,0.55)'], [0.5, 'rgba(255,160,80,0.12)'], [1, 'rgba(255,140,60,0)']]));
    this.glowMat = new THREE.PointsMaterial({ map: tex, size: 3.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true });
    const P = new THREE.Points(g, this.glowMat);
    P.frustumCulled = false;
    P.renderOrder = 5;
    this.root.add(P);
    // light pools on the ground (instanced quads, additive)
    const pool = new THREE.PlaneGeometry(1, 1);
    pool.rotateX(-Math.PI / 2);
    const ptex = new THREE.CanvasTexture(radialCanvas(128, [[0, 'rgba(255,205,140,0.62)'], [0.25, 'rgba(255,185,110,0.38)'], [0.55, 'rgba(255,165,90,0.14)'], [1, 'rgba(255,150,70,0)']]));
    this.poolMat = new THREE.MeshBasicMaterial({ map: ptex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -36 });
    const im = new THREE.InstancedMesh(pool, this.poolMat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeScale(17, 1, 17);
      m.setPosition(pts[i * 3], 0.04, pts[i * 3 + 2]);
      im.setMatrixAt(i, m);
    }
    im.frustumCulled = false;
    im.renderOrder = 3;
    this.root.add(im);
  }

  buildPowerLines() {
    const lines = this.map.lines.filter((l) => l.kind.startsWith('power:'));
    const pos = [];
    for (const l of lines) {
      const p = l.pts;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        const L = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        for (const off of [-0.7, 0, 0.7]) {
          const seg = 8;
          for (let k = 0; k < seg; k++) {
            const t0 = k / seg, t1 = (k + 1) / seg;
            const sag = (t) => 8.75 - Math.sin(t * Math.PI) * Math.min(1.6, L * 0.02);
            pos.push(ax + (bx - ax) * t0 + nx * off, sag(t0), az + (bz - az) * t0 + nz * off, ax + (bx - ax) * t1 + nx * off, sag(t1), az + (bz - az) * t1 + nz * off);
          }
        }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.8 })));
  }

  // nearest lamps to the camera feed the fake point lights of the building / detail materials
  updateLamps(cam, night) {
    const L = shared.uLamps.value;
    const pts = this.lampPoints;
    if (night < 0.02 || !pts.length) { for (const v of L) v.w = 0; return; }
    const best = this._lampBest || (this._lampBest = []);
    best.length = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const dx = pts[i] - cam.x, dz = pts[i + 2] - cam.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 110 * 110) continue;
      best.push(d2, i);
    }
    const order = [];
    for (let k = 0; k < best.length; k += 2) order.push(k);
    order.sort((a, b) => best[a] - best[b]);
    for (let k = 0; k < L.length; k++) {
      if (k < order.length) {
        const i = best[order[k] + 1], d = Math.sqrt(best[order[k]]);
        L[k].set(pts[i], pts[i + 1] - 0.3, pts[i + 2], 1.1 * (1 - clamp((d - 70) / 40, 0, 1)));
      } else L[k].w = 0;
    }
  }

  update(dt, night, cam) {
    if (this.reservoir) this.reservoir.update(dt, this.skySource);
    if (cam && this.facades) this.facades.update(cam.x, cam.z);
    if (cam) { this._lampT = (this._lampT || 0) - dt; if (this._lampT <= 0) { this._lampT = 0.2; this.updateLamps(cam, night); } }
    if (cam) {
      this._lodT = (this._lodT || 0) - dt;
      if (this._lodT <= 0) {
        this._lodT = 0.25;
        for (const g of this.lodGroups || []) g.update(cam.x, cam.z);
        if (this.trees) this.trees.update(cam.x, cam.z);
      }
    }
    if (this.glowMat) this.glowMat.opacity = clamp(night * 1.2, 0, 1);
    if (this.poolMat) this.poolMat.opacity = clamp(night * 0.85, 0, 0.85);
    this.landmarks && this.landmarks.update(dt, night);
  }
}
