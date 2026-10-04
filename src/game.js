// Game orchestrator: renderer & post-processing, world, systems, time of day, audio, events, death/arrest, saving.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { STYLE } from './style.js';
import { ToonPipeline } from './toon.js';
import { LoFi } from './lofi.js';
import { Chant } from './chant.js';
import { MapData } from './mapdata.js';
import { World } from './world.js';
import { SkySystem } from './sky.js';
import { shared } from './materials.js';
import { CharacterFactory, PLAYER_PRESETS, pedShapes } from './characters.js';
import { installHero, loadHero } from './hero.js';
import { COP_DESC } from './police.js';
import { Fleet } from './fleet.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Player, CameraRig } from './player.js';
import { Hud } from './hud.js';
import { Missions } from './missions.js';
import { Effects } from './effects.js';
import { Weapons } from './weapons.js';
import { ViewModel } from './viewmodel.js';
import { Pickups } from './pickups.js';
import { Activities } from './activities.js';
import { Jobs } from './jobs.js';
import { Seats } from './terrace.js';
import { Merendero } from './merendero.js';
import { Mercadillo } from './mercadillo.js';
import { Phone } from './phone.js';
import { FM } from './fm.js';
import { CarInterior } from './carinterior.js';
import { Interiors } from './interiors.js';
import { WindowView } from './windowview.js';
import { Inventory } from './items.js';
import { InventoryUI } from './inventory.js';
import { Decorator } from './decor.js';
import { Shops } from './shops.js';
import { Fishing } from './fishing.js';
import { HomeSafe } from './home.js';
import { Zombies } from './zombies.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { clamp, lerp, ringCentroid, safeStorage, readSave, SAVE_KEY } from './util.js';

export const QUALITY = {
  alta: { name: 'Alta', texSize: 512, photo: 1024, aniso: 8, shadows: 2, trees: 6500, traffic: 13, peds: 30, bloom: true, pr: 1.5, parkRadius: 220, carCapacity: 150, facade3d: 120 },
  media: { name: 'Media', texSize: 512, photo: 512, aniso: 4, shadows: 1, trees: 4200, traffic: 11, peds: 22, bloom: false, pr: 1.0, parkRadius: 180, carCapacity: 130, facade3d: 80 },
  baja: { name: 'Baja', texSize: 256, photo: 256, aniso: 2, shadows: 0, trees: 1800, traffic: 7, peds: 14, bloom: false, pr: 0.8, parkRadius: 140, carCapacity: 110, facade3d: 0 },
};

export class Game {
  constructor({ canvas, ui, raw, quality, audio }) {
    this.canvas = canvas;
    this.ui = ui;
    this.raw = raw;
    this.qKey = quality;
    this.q = { ...QUALITY[quality] };
    this.audio = audio;
    this.state = 'loading';
    this.store = safeStorage();
    this.save = this.load();
    this.timeScale = 1;
    this.time = 0;
    this.labels = [];
  }
  load() {
    try { return JSON.parse(readSave(this.store)); } catch (e) { return {}; }
  }
  persist() {
    try {
      this.save.money = this.player ? this.player.money : this.save.money;
      if (this.weapons) this.save.weapons = this.weapons.toJSON();
      if (this.player) this.save.armor = Math.round(this.player.armor || 0);
      if (this.player) this.save.bag = this.player.bag || [];
      this.store && this.store.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (e) { /* storage unavailable */ }
  }

  async init(progress) {
    const q = this.q;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !q.bloom, powerPreference: 'high-performance', stencil: false });
    // (the anime look's ink lines want the screen's own resolution on high quality; dynamic resolution backs off if needed)
    r.setPixelRatio(Math.min(devicePixelRatio || 1, STYLE.anime && this.qKey === 'alta' ? 2 : q.pr));
    r.setSize(innerWidth, innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = q.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 4200);
    progress('Leyendo el callejero de Guareña…', 0.03);
    // characters are sculpted in background workers while the town is being built
    this.chars = new CharacterFactory(this.qKey === 'baja' ? { q: 1.3, lodNear: 7 } : this.qKey === 'media' ? { lodNear: 10 } : {});
    installHero(this.chars); this.heroLoad = loadHero(); // (the protagonist's body and motion capture, unzipped meanwhile)
    // (the anime look has one protagonist, Álex the courier; the photographic one keeps the saved character)
    const firstDesc = STYLE.anime ? PLAYER_PRESETS[0] : this.save.custom || PLAYER_PRESETS[0];
    this.chars.prebuild([firstDesc], 10);
    this.chars.prebuild(PLAYER_PRESETS, 8);
    this.chars.prebuild(pedShapes(), 6);
    this.chars.prebuild(Object.values(COP_DESC), 5);
    await tick();
    this.map = new MapData(this.raw);
    this.world = new World(this.scene, this.map, q);
    this.world.renderer = r; // (the trees bake their far-off billboards with it)
    await this.world.build((l, f) => progress(l, 0.05 + f * 0.7));
    await this.heroLoad; // (long done by now)
    progress('Poniendo el sol sobre las Vegas…', 0.78);
    await tick();
    this.sky = new SkySystem(r, this.scene, q);
    this.world.skySource = this.sky.uniforms; // the reservoir reflects this sky
    this.sky.hour = this.save.hour ?? 18.4;
    this.world.landmarks.hour = this.sky.hour;
    this.input = new Input(this.canvas, this.ui.touch);
    progress('Aparcando coches en doble fila…', 0.84);
    await tick();
    this.fleet = new Fleet(this);
    this.traffic = new Traffic(this);
    this.effects = new Effects(this);
    this.cam = new CameraRig(this, this.camera);
    this.player = new Player(this, this.chars.create(firstDesc));
    this.player.money = this.save.money ?? 250;
    this.player.bag = Array.isArray(this.save.bag) ? this.save.bag : [];
    this.hud = new Hud(this, this.ui);
    this.peds = new Peds(this);
    this.police = new Police(this);
    this.props = { hitCircle: (ci, v) => this.hitProp(ci, v) };
    progress('Repartiendo encargos por el pueblo…', 0.92);
    await tick();
    this.missions = new Missions(this);
    // weapons, pick-ups around town and the side activities (bars, gun shop, hold-ups, taxi, patrol)
    this.weapons = new Weapons(this);
    this.weapons.load(this.save.weapons);
    this.viewModel = new ViewModel(this);
    this.player.armor = this.save.armor || 0;
    this.pickups = new Pickups(this);
    this.pickups.setupWorld(this.missions.places);
    this.activities = new Activities(this);
    this.jobs = new Jobs(this);
    this.seats = new Seats(this);
    this.activities.setup(this.missions.places);
    this.jobs.setup(this.missions.places);
    this.seats.setup();
    this.merendero = new Merendero(this);
    try { this.merendero.build(); this.map.collider.buildCircles(); } catch (e) { console.warn('merendero', e); }
    this.sky.day = this.save.day ?? 0;
    this.phone = new Phone(this);
    this.fm = new FM(this);
    this.carInterior = new CarInterior(this);
    this.mercadillo = new Mercadillo(this);
    try { this.mercadillo.build(this.missions.places); } catch (e) { console.warn('mercadillo', e); }
    this.interiors = new Interiors(this);
    this.interiors.setup(this.activities);
    this.windowView = new WindowView(this); // the real street through the windows of a house
    // what you carry, the shops you can walk into, decorating your house, its safe, fishing at the pantano
    this.inv = new Inventory(this);
    this.decor = new Decorator(this);
    this.shops = new Shops(this);
    try { this.shops.setup(this.activities); } catch (e) { console.warn('shops', e); }
    this.fishing = new Fishing(this);
    try { this.fishing.setupMarket(this.activities); } catch (e) { console.warn('fishing', e); }
    this.homeSafe = new HomeSafe(this);
    this.invUI = new InventoryUI(this);
    this.zombieSys = new Zombies(this);
    // the end-of-run screen of the zombie night: again, back to the town at dawn, or the menu
    const endB = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => { const e = document.getElementById('hEnd'); if (e) e.hidden = true; fn(); }); };
    endB('hRetry', () => this.retryMode());
    endB('hMenu', () => { this.setMode('normal'); if (this.ui.onMenu) this.ui.onMenu(); });
    endB('hTown', () => this.setMode('normal', { dawn: true }));
    this.net = new Net(this); // multiplayer (only connects when the page comes from servidor.py)
    this.mode = 'normal';
    this.hud.weapon();
    this.buildLabels();
    const lm = this.world.landmarks.poi;
    if (lm.churchTower) this.audio.setChurchPos(lm.churchTower.x, lm.churchTower.z);
    // post-processing: the anime look draws its ink lines and grade in one last pass (no bloom); the real one blooms
    if (STYLE.anime) {
      this.toon = new ToonPipeline(r, { msaa: this.qKey === 'baja' ? 0 : 4 });
      this.toon.setLook(this.save.look || 'manga'); // (the look: Ajustes › Estética)
      r.toneMapping = THREE.CustomToneMapping; // (what is drawn straight to the screen gets the pipeline's curve)
    } else if (q.bloom) {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.setPixelRatio(r.getPixelRatio());
    }
    addEventListener('resize', () => this.resize());
    this.resize();
    // warm up shaders
    progress('Encendiendo el motor…', 0.97);
    this.camera.position.set(-60, 30, 140); this.camera.lookAt(-60, 0, 0);
    this.sky.update(0, new THREE.Vector3(-60, 0, 60), true);
    try { r.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    this.render();
    this.hourPrev = Math.floor(this.sky.hour * 4);
    progress('Vistiendo a los vecinos…', 0.99);
    await Promise.race([this.chars.whenReady(firstDesc), new Promise((res) => setTimeout(res, 7000))]);
    progress('¡Listo!', 1);
  }

  buildLabels() {
    const lm = this.world.landmarks.poi;
    const L = (name, p, size = 13, minS = 0.2, color = '#3a2a1a') => { if (p) this.labels.push({ name, x: p.x, z: p.z, size, minS, color }); };
    L('Iglesia de Santa María', lm.churchTower, 14, 0.25);
    L('Plaza de España', lm.plaza, 14, 0.2, '#6a2a12');
    L('Ayuntamiento', lm.ayto && { x: lm.ayto.x, z: lm.ayto.z - 18 }, 12, 0.6);
    L('San Gregorio', lm.sanGregorio, 13, 0.3);
    L('Mercado de Abastos', lm.mercado, 12, 0.6);
    L('Ermita de San Isidro', lm.ermita, 13, 0.2);
    L('Estadio La Noria', lm.estadio, 13, 0.25);
    L('Guardia Civil', lm.guardia, 12, 0.35, '#1f4a2a');
    L('Centro de Salud', lm.salud, 12, 0.35, '#135a36');
    L('Gasolinera', lm.gasolinera, 11, 0.5);
    for (const a of this.map.areas) {
      if (!a.name) continue;
      const c = ringCentroid(a.ring);
      if (a.kind === 'amenity:parking') continue; // the Pabellón's car park would sit on top of the Pabellón itself
      if (/Cooperativa/.test(a.name)) { L('Cooperativa', { x: c[0], z: c[1] }, 12, 0.45); continue; } // no business names
      if (/Pantano|Polígono|Cementerio|Parque San|Parque del Pilar|Polideportivo|Eugenio Frutos|Pabellón/.test(a.name)) L(a.name, { x: c[0], z: c[1] }, 12, /Pantano|Polígono|Cementerio/.test(a.name) ? 0.15 : 0.45, /Pantano/.test(a.name) ? '#154a7a' : '#3a2a1a');
    }
    const ch = this.map.pois.find((p) => /Luis Chamizo/.test(p.name));
    if (ch) L('Casa de Luis Chamizo', ch, 11, 0.9);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); this.bloom.setSize(w, h); }
    if (this.toon) this.toon.setSize(w, h);
    const radar = this.ui.radar;
    const size = Math.round(w < 520 ? Math.min(128, w * 0.34) : h <= 500 ? Math.min(112, h * 0.3) : Math.min(230, Math.max(150, Math.min(w, h) * 0.24)));
    const dpr = Math.min(2, devicePixelRatio || 1);
    radar.width = radar.height = size * dpr;
    radar.style.width = radar.style.height = size + 'px';
  }
  setQuality(key) {
    this.save.quality = key;
    this.persist();
  }

  // ------------------------------------------------------------ start / respawn
  // multiplayer meeting point: where a normal game starts in the Plaza de España, the players side by side
  meetPoint(slot = 0) {
    const lm = this.world.landmarks.poi;
    const pz = lm.plaza || { x: -35, z: 40 };
    const n = lm.ayto ? { x: lm.ayto.nx, z: lm.ayto.nz } : { x: 0, z: 1 };
    const side = (slot % 2 ? -1 : 1) * Math.ceil(slot / 2) * 1.3;
    let x = pz.x + n.x * 9 + n.z * (5 + side), z = pz.z + n.z * 9 - n.x * (5 + side);
    if (this.map.buildingAt(x, z)) { x = pz.x + 6 + side; z = pz.z + 6; }
    return { x, z, heading: Math.atan2(pz.x - x, pz.z - z) };
  }
  start(desc, opts = {}) {
    const p = this.player;
    const ch = this.chars.create(desc);
    p.setCharacter(ch);
    this.save.preset = desc.id || 'custom';
    this.save.custom = desc;
    const lm = this.world.landmarks.poi;
    // spawn at the plaza, a few steps from Tía Remedios' marker (facing it)
    const pz = lm.plaza || { x: -35, z: 40 };
    // some characters always start the game at home (not in a multiplayer game: everybody meets at the plaza)
    const home = opts.at ? null : desc.start || (PLAYER_PRESETS.find((x) => x.id === desc.id) || {}).start;
    const sp = this.save.pos, bb = this.map.bounds;
    const spOk = sp && Number.isFinite(sp.x) && Number.isFinite(sp.z) && sp.x > bb.x0 + 30 && sp.x < bb.x1 - 30 && sp.z > bb.z0 + 30 && sp.z < bb.z1 - 30;
    let at = opts.at ? { x: opts.at.x, z: opts.at.z } : home ? { x: home.x, z: home.z } : spOk ? sp : null;
    if (at && (this.map.buildingAt(at.x, at.z) || !this.map.nearestEdge(at.x, at.z, 150))) {
      const q = this.map.nearestEdge(at.x, at.z, 150, (e) => e.walk && !e.blocked);
      at = q ? { x: q.x, z: q.z } : null;
    }
    if (!at) {
      const n = lm.ayto ? { x: lm.ayto.nx, z: lm.ayto.nz } : { x: 0, z: 1 };
      at = { x: pz.x + n.x * 9 + n.z * 5, z: pz.z + n.z * 9 - n.x * 5 };
      if (this.map.buildingAt(at.x, at.z)) at = { x: pz.x + 6, z: pz.z + 6 };
    }
    p.spawnAt(at.x, at.z, opts.at && Number.isFinite(opts.at.heading) ? opts.at.heading : home && Number.isFinite(home.heading) ? home.heading : Math.atan2(pz.x - at.x, pz.z - at.z));
    this.missions.cooldown = 3;
    this.hud.moneyShown = p.money;
    this.cam.yaw = p.heading + Math.PI;
    this.cam.pitch = -0.2;
    this.state = 'play';
    this.missions.placeMarkers();
    this.persist();
    if (this.fm) this.fm.stop(); else this.audio.radioOn(false);
    this.setMode(this.pendingMode || 'normal');
    setTimeout(() => {
      if (this.state === 'play' && this.time > 20 && this.mode === 'normal') this.hint('extras', 'Además de las misiones: hay <b>armas</b> escondidas por el pueblo (puntos amarillos del radar), una <b style="color:#ff8a70">armería</b> junto a la Cooperativa, <b>bares</b> para reponer salud y trabajos de <b>taxista</b> y de <b>patrulla</b> (súbete a un taxi o a un coche de policía y ' + (this.input.device === 'touch' ? 'toca el aviso' : 'pulsa ' + this.input.key('E', 15)) + ').', 12);
    }, 60000);
    setTimeout(() => {
      if (!this.missions.done.size && this.mode === 'normal') {
        const dev = this.input.device;
        const move = dev === 'touch' ? 'El joystick te mueve y arrastrando a la derecha miras. ' : dev === 'pad' ? `El stick izquierdo te mueve, el derecho mira y ${this.input.key('', 0)} corre. ` : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> para andar, el ratón mira y <kbd>Shift</kbd> corre. ';
        this.hud.help(this.gx('Bienvenido', 'Bienvenida') + ' a <b>Guareña</b>. ' + move + 'Acércate a la marca <b style="color:#f4c430">amarilla</b> de la plaza para tu primera misión. ' + this.input.key('M', 8, 'Mapa') + ' abre el mapa.', 12);
      }
    }, 1500);
  }

  respawn(where) {
    const p = this.player;
    if (this.interior && this.interiors) this.interiors.leave(); // caught (or worse) inside a house: back to town
    const lm = this.world.landmarks.poi;
    const pt = (where === 'salud' ? lm.salud : lm.guardia) || lm.plaza || { x: 0, z: 0 };
    const q = this.map.nearestEdge(pt.x, pt.z, 80, (e) => e.walk && !e.blocked);
    const x = q ? q.x : pt.x, z = q ? q.z : pt.z;
    p.spawnAt(x, z, 0);
    this.perfGrace();
    p.health = 100;
    p.armor = 0;
    if (this.weapons) this.weapons.aiming = false;
    this.police.clear();
    this.cam.yaw = Math.PI;
    this.canvas.style.filter = '';
    this.timeScale = 1;
    this.state = 'play';
    this.sky.hour = (this.sky.hour + 3) % 24; // time passes at the health centre / the station
  }

  onPlayerDeath() {
    if (this.state !== 'play') return;
    const p = this.player;
    if (this.mode === 'zombis') {
      this.state = 'ended';
      if (p.vehicle) p.exitVehicle(true);
      p.mode = 'dead'; p.char.object.visible = true; this.collapse(p);
      this.audio.sfx('wasted');
      const Z = this.zombieSys, k = Z.kills;
      const kills = k === 0 ? 'sin abatir a ningún zombi' : k === 1 ? 'con un zombi abatido' : `con ${k} zombis abatidos`;
      this.showEnd('TE HAN MORDIDO', Z.wave > 0 ? `Aguantaste hasta la oleada ${Z.wave}, ${kills}.` : `No llegaste ni a la primera oleada.`, false, 'zombis');
      return;
    }
    this.state = 'wasted';
    if (this.activities) this.activities.reset();
    if (p.vehicle) p.exitVehicle(true);
    p.mode = 'dead';
    p.knock = null;
    p.enter = null;
    p.char.object.visible = true;
    this.collapse(p);
    this.timeScale = 0.35;
    this.canvas.style.filter = 'grayscale(0.85) contrast(1.1)';
    this.audio.sfx('wasted');
    this.hud.banner('HOSPITALIZADO', 'Te llevan al Centro de Salud de Guareña', 'dead', 4.2);
    this.missions.active && this.missions.fail('Has acabado en el centro de salud.');
    setTimeout(() => {
      // the bill: 100 € and a tenth of what you carry (the money in your safe at home is never touched)
      const bill = Math.min(p.money, 100 + Math.round(p.money * 0.1));
      p.money -= bill;
      this.respawn('salud');
      const home = this.save.bank || 0;
      this.hud.notify(`Factura del hospital: −${bill} €.${home ? ` En tu casa sigues teniendo ${home.toLocaleString('es-ES')} € a salvo.` : ' Guarda dinero en la caja fuerte de tu casa y no lo perderás.'}`, 'info', 5);
    }, 4200);
  }
  // the player's body goes down (already falling if knocked down: it just stays limp now), eyes closed
  collapse(p) {
    const ch = p.char;
    if (!ch.rag) { ch.standUp(); ch.object.updateMatrixWorld(true); ch.ragdoll({ buckle: 1.1, tone: 0.15, dead: true, env: p.ragEnv(), vel: [(Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8], up: 0.5 }); }
    ch.ragDead = true;
  }
  onBusted() {
    if (this.state !== 'play') return;
    const p = this.player;
    this.state = 'busted';
    if (this.activities) this.activities.reset();
    const hadGuns = this.weapons && this.weapons.confiscate();
    if (p.vehicle) p.exitVehicle(true);
    p.mode = 'busted';
    p.knock = null;
    p.enter = null;
    p.char.standUp();
    p.char.setBase('handsup');
    this.audio.sfx('busted');
    this.hud.banner('DETENIDO', 'Pasas la noche en el cuartel de la Guardia Civil', 'dead', 4);
    this.missions.active && this.missions.fail('Te ha detenido la Guardia Civil.');
    setTimeout(() => {
      const fine = Math.min(p.money, 150 + Math.round(p.money * 0.15));
      p.money -= fine;
      this.respawn('guardia');
      const home = this.save.bank || 0;
      this.hud.notify(`Multa: −${fine} €. La Benemérita no perdona.` + (hadGuns ? ' Te han requisado las armas.' : '') + (home ? ` Lo de tu caja fuerte (${home.toLocaleString('es-ES')} €) sigue allí.` : ''), 'info', 5);
    }, 4000);
  }
  onCarjack(v) {
    this.peds.ejectDriver(v);
    v.ai = null;
    this.traffic.release(v);
    this.police.crime('carjack', v.x, v.z);
  }
  // player-directed words that agree with the character: gx('listo', 'lista')
  gx(m, f) { const d = this.player && this.player.char && this.player.char.desc; return d && d.gender === 'f' ? f : m; }
  // resolve {m|f} alternatives in a line by the player's gender
  gxs(text) { return String(text).replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (_, m, f) => this.gx(m, f)); }
  // one-time tips. They wait their turn: a tip never wipes out another one (or a message) still on screen
  hint(key, html, t = 7) {
    this.save.hints = this.save.hints || {};
    if (this.save.hints[key]) return;
    this.save.hints[key] = 1;
    this.persist();
    if (this.hud.helpBusy) { (this.hintQ || (this.hintQ = [])).push([html, t]); return; }
    this.hud.help(html, t);
  }
  flushHints() {
    if (this.hintQ && this.hintQ.length && !this.hud.helpBusy && this.state === 'play' && !this.cam.cinematic) { const [html, t] = this.hintQ.shift(); this.hud.help(html, t); }
  }
  onEnterVehicle(v) {
    const dev = this.input.device, K = (k, p, t) => this.input.key(k, p, t);
    // two wheels: no car radio, and a hint of their own
    if (v.spec.twoWheel) {
      const bici = v.spec.shape === 'bici' || /bici/i.test(v.model || '');
      this.hint('bike', dev === 'touch' ? `<b>${bici ? 'En bici' : 'En moto'}</b>: <b>Gas</b> ${bici ? 'pedalea' : 'acelera'}, <b>Freno</b> frena, el joystick gira y <b>Bajar</b> te bajas.`
        : dev === 'pad' ? `<b>${bici ? 'En bici' : 'En moto'}</b>: ${K('', 7)} ${bici ? 'pedalea' : 'acelera'}, ${K('', 6)} frena, el stick izquierdo gira, ${K('', 3)} bajar.`
          : `<b>${bici ? 'En bici' : 'En moto'}</b>: <kbd>W</kbd> ${bici ? 'pedalea' : 'acelera'}, <kbd>S</kbd> frena, <kbd>A</kbd>/<kbd>D</kbd> gira, <kbd>F</kbd> bajar. La radio, en el móvil.`, 8);
      this.hud.notify(`${v.spec.name} · ${v.spec.label}`, 'veh', 2.5);
      return;
    }
    const live = this.fm && !this.fm.closed ? ' (las emisoras de la zona, en directo)' : '';
    this.hint('car', dev === 'touch'
      ? '<b>Al volante</b>: <b>Gas</b> acelera, <b>Freno</b> frena y da marcha atrás, el joystick gira, <b>Derrape</b> es el freno de mano. <b>Radio</b> cambia de emisora y <b>Bajar</b> te saca del coche.'
      : dev === 'pad'
        ? `<b>Al volante</b>: ${K('', 7)} acelera, ${K('', 6)} frena y marcha atrás, el stick izquierdo gira, ${K('', 5)} freno de mano para derrapar, ${K('', 10)} claxon, ${K('', 14)} radio${live}, ${K('', 13)} cámara, ${K('', 3)} bajar.`
        : `<b>Al volante</b>: <kbd>W</kbd> acelera, <kbd>S</kbd> frena y marcha atrás, <kbd>A</kbd>/<kbd>D</kbd> gira, <kbd>Espacio</kbd> freno de mano para derrapar, <kbd>H</kbd> claxon, <kbd>R</kbd> radio${live} (<kbd>Tab</kbd> → Radio para mover el dial), <kbd>V</kbd> cámara, <kbd>F</kbd> bajar.`, 10);
    this.fm.enterCar();
    this.hud.notify(`${v.spec.name} · ${v.spec.label}`, 'veh', 2.5);
    if (v.spec.livery) this.hud.help(this.input.device === 'touch' ? 'Toca dos veces <b>Claxon</b> para la sirena.' : this.input.device === 'pad' ? `Pulsa dos veces ${this.input.key('', 10)} para la sirena.` : 'Pulsa <kbd>G</kbd> para la sirena.', 4);
  }
  onExitVehicle(v) {
    this.audio.setEngine(null);
    this.fm.exitCar();
    this.audio.setSkid(0); this.audio.setWind(0); this.audio.setOffroad(0);
  }
  onPlayerHitByCar(v) {
    if (v.ai) v.ai.panic = 4;
  }
  onVehicleImpact(v, imp, px, pz, other) {
    const pv = this.player.vehicle;
    const mine = v === pv;
    if (mine || imp > 6) this.audio.sfx(imp > 9 ? 'crash_big' : 'crash_small', { x: px, z: pz, vol: clamp(imp / 12, 0.3, 1.4) });
    if (mine) { this.cam.shake(clamp(imp / 20, 0.1, 0.8)); if (imp > 7) this.effects.sparks(px, 0.6, pz, 12); }
    if (mine && other && other.police) this.police.crime('policia', px, pz);
    if (mine && other && other.ai && other.ai.mode === 'traffic') other.ai.panic = 5;
  }
  onExplosion(x, z, v) {
    this.effects.explosion(x, z, 1);
    this.audio.sfx('explosion', { x, z, vol: 1.6 });
    v.burnT = 12;
    const p = this.player;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    this.cam.shake(clamp(2 - d / 40, 0, 1.2));
    if (d < 8 && !p.vehicle) p.knockDown((p.pos.x - x) * 1.5, (p.pos.z - z) * 1.5, 45 * (1 - d / 8));
    if (p.vehicle && p.vehicle !== v && Math.hypot(p.vehicle.x - x, p.vehicle.z - z) < 6) p.vehicle.health -= 250;
    for (const o of this.fleet.vehicles) {
      if (o === v) continue;
      const dd = Math.hypot(o.x - x, o.z - z);
      if (dd < 10) { const f = (10 - dd) * 0.8; o.sleeping = false; o.vx += ((o.x - x) / (dd || 1)) * f; o.vz += ((o.z - z) / (dd || 1)) * f; o.health -= (10 - dd) * 25; }
    }
    this.peds.scare(x, z, 40);
    for (const ped of this.peds.list) { const dd = Math.hypot(ped.x - x, ped.z - z); if (dd < 8) this.peds.knock(ped, (ped.x - x) * 1.5, (ped.z - z) * 1.5); }
    if (d < 80 || v === this.player.vehicle) this.police.crime('explosion', x, z);
  }

  hitProp(ci, v) {
    const b = this.world.breakByCircle && this.world.breakByCircle.get(ci);
    if (!b || b.broken) return false;
    if (v.vel < (b.kind === 'farola' ? 7 : 3.5)) return false;
    b.broken = true;
    this.map.collider.circleAlive[ci] = 0;
    b.group.hide(b.h);
    if (b.group2) b.group2.hide(b.h2);
    const mesh = new THREE.Mesh(b.geo, this.world.furnMat);
    mesh.position.set(b.x, b.kind === 'farola' ? 0 : 0.1, b.z);
    mesh.rotation.y = b.ang;
    mesh.castShadow = true;
    const sp = v.vel;
    if (b.kind === 'farola') this.effects.addDebris(mesh, v.vx * 0.15, 0.5, v.vz * 0.15, { floor: 0.1, restX: -Math.PI / 2, ttl: 90, sx: 0, sz: 0 });
    else this.effects.addDebris(mesh, v.vx * 0.9, 2 + sp * 0.15, v.vz * 0.9, { floor: 0.55, ttl: 90 });
    this.audio.sfx(b.kind === 'farola' ? 'crash_small' : 'bin_hit', { x: b.x, z: b.z });
    if (b.kind === 'farola') this.effects.sparks(b.x, 1, b.z, 16);
    v.vx *= b.kind === 'farola' ? 0.75 : 0.9; v.vz *= b.kind === 'farola' ? 0.75 : 0.9;
    if (v === this.player.vehicle) this.cam.shake(0.25);
    return true;
  }

  // ------------------------------------------------------------ main loop
  frame(dtReal) {
    const input = this.input;
    input.poll();
    const dt = Math.min(0.05, dtReal) * this.timeScale;
    this.time = (this.time || 0) + dt;
    const playing = this.state === 'play' || this.state === 'wasted' || this.state === 'busted';
    if (this.state === 'play') {
      const listOpen = this.homeSafe.menu.open || (this.mercadillo && this.mercadillo.menu); // the D-pad belongs to the list
      if (input.phone && this.phone && !listOpen) { this.phone.toggle(); }
      if (input.pause && !(this.seats && this.seats.menuOpen) && !(this.mercadillo && this.mercadillo.menu) && !(this.phone && this.phone.open) && !this.homeSafe.menu.open && !this.decor.placing) { this.ui.onPause && this.ui.onPause(); input.endFrame(); return; } // Esc closes the order card first
      if (input.inventory && !this.decor.placing && !this.homeSafe.menu.open && !(this.phone && this.phone.open)) { this.invUI.show(); input.endFrame(); return; }
      if (input.map && !this.interior) { this.hud.toggleMap(); this.state = 'map'; input.exitLock(); input.endFrame(); return; }
      if (input.radioNext && this.player.vehicle) { // R: next station (Mayús+R: back)
        if (this.player.vehicle.spec.twoWheel) this.hud.notify('Aquí no hay radio: ponla en el móvil (Radio).', 'info', 2.5);
        else this.fm.seek(input.shift ? -1 : 1, true);
      }
      if (input.camToggle && !listOpen) {
        if (this.player.vehicle || this.player.mode === 'passenger') {
          // far → close → from inside (the cabin) → far
          const c = this.cam, tw = this.player.vehicle && (this.player.vehicle.spec.twoWheel || this.player.vehicle.spec.shape === 'tractor');
          if (c.carFP) { c.carFP = false; c.dist = 6.2; }
          else if (c.dist > 5) c.dist = 3.2;
          else if (!tw) { c.carFP = true; c.fpYaw = 0; c.fpPitch = -0.05; }
          else c.dist = 6.2;
          this.hud.notify(c.carFP ? `Vista desde dentro del coche (${input.keyText('V', 13)} para cambiar)` : c.dist > 5 ? 'Cámara lejana' : 'Cámara cercana', 'info', 1.6);
        }
        else { this.cam.setFirstPerson(!this.cam.fp); this.cam.fpPref = this.cam.fp; this.hud.notify(`Cámara en ${this.cam.fp ? 'primera' : 'tercera'} persona (${input.keyText('V', 13)} para cambiar)`, 'info', 2); }
      }
    } else if (this.state === 'map') {
      if (input.map || input.pause) { this.hud.toggleMap(false); this.state = 'play'; input.requestLock(); }
      else if (input.gp) this.hud.mapPad(input, Math.min(0.05, dtReal));
      input.endFrame();
      return;
    } else if (this.state === 'shop') {
      if (input.pause || input.interact) { if (this.shops.store) this.shops.closeStore(); else this.activities.closeShop(); }
      else if (this.shops.store) {
        if (input.hit('ArrowDown') || input.hit('KeyS')) this.shops.moveSel(1);
        if (input.hit('ArrowUp') || input.hit('KeyW')) this.shops.moveSel(-1);
        if (input.hit('Enter')) this.shops.buyAt(this.shops.sel);
      }
      input.endFrame();
      return;
    } else if (this.state === 'inv') {
      this.invUI.input(input);
      input.endFrame();
      return;
    } else if (this.state === 'ended') {
      this.render();
      input.endFrame();
      return;
    }
    if (this.state === 'play' && dtReal > 0 && dtReal < 0.1) this.adaptResolution(dtReal);
    if (playing) {
      // time of day
      const nh = this.sky.hour + dt / (this.mode === 'zombis' ? 600 : 90); // the zombie dusk lasts
      if (nh >= 24) { this.sky.day = (this.sky.day || 0) + 1; this.save.day = this.sky.day; }
      this.sky.hour = nh % 24;
      this.world.landmarks.hour = this.sky.hour;
      const qh = Math.floor(this.sky.hour * 4);
      if (qh !== this.hourPrev) {
        this.hourPrev = qh;
        const inChurch = !!(this.interior && (this.interior.church || this.interior.chapel)); // (inside it: only the chant)
        if (qh % 4 === 0) { const h = Math.floor(this.sky.hour) % 12 || 12; if (!inChurch) this.audio.bells(h); this.world.landmarks.bellSwing = 1; }
        else if (qh % 4 === 2 && !inChurch) this.audio.bells(0);
      }
      shared.uTime.value += dt;
      const p = this.player;
      // (the anime look) a quiet lo-fi bed while you walk the town: not in a car or with the radio on, not in church
      if (STYLE.anime) {
        if (!this.lofi) this.lofi = new LoFi(this.audio);
        this.lofi.enabled = this.save.lofi !== false;
        const radio = this.audio._radioOn || (this.fm && this.fm.where);
        this.lofi.update(dt, (p.mode === 'foot' || p.mode === 'sit') && !radio && !(this.interior && (this.interior.church || this.interior.chapel)));
      }
      // inside Santa María, Gregorian chant far off in the stone (softer while mass is said)
      if (!this.chant) this.chant = new Chant(this.audio);
      this.chant.update(dt, !!(this.interior && (this.interior.church || this.interior.chapel)), this.interior && this.interior.chapel ? 0.6 : this.interiors.church && this.interiors.church.mass ? 0.45 : 1);
      p.update(dt, input, this.cam.forwardYaw);
      this.net.update(dt); // friends (multiplayer): their state in, ours out
      const inCar = !!p.vehicle;
      if (inCar !== this.touchCar && this.ui.touch) {
        this.touchCar = inCar;
        this.ui.touch.classList.toggle('incar', inCar);
        const eb = this.ui.touch.querySelector('[data-btn="enter"]');
        if (eb) eb.textContent = inCar ? 'Bajar' : 'Subir';
      }
      if (!p.vehicle && this.time > 6 && !(this.save.hints || {}).steal) {
        const v = this.fleet.nearest(p.pos.x, p.pos.z, 4.5);
        if (v && !v.police) this.hint('steal', (this.input.device === 'touch' ? 'Toca <b>Subir</b>' : 'Pulsa ' + this.input.key('F', 3)) + ' para subirte a un coche. Si tiene conductor… lo sacas tú. Los aparcados pueden estar cerrados.', 8);
      }
      if (this.police.wanted > 0) this.hint('wanted2', '<b>¡Te busca la policía!</b> Solo te siguen si te ven: sal de su vista (en el radar ves hacia dónde miran), agáchate con ' + this.input.key('C', 10, 'Agacharse') + ' o escóndete en un <b>contenedor</b> o una casa. Si no te encuentran, se apagan las estrellas. También vale el taller de <b style="color:#7ec8ff">chapa y pintura</b> del polígono.', 12);
      else if (this.police.calls.size) this.hint('witness', '<b>📱 Te han visto.</b> Esa persona está llamando a la policía: si la paras antes de que cuelgue, no vendrá nadie. Sin testigos (o ' + this.gx('agachado', 'agachada') + ' y por la espalda) no pasa nada.', 10);
      if (!this.interior) {
        const zm = this.mode === 'zombis';
        this.fleet.streamParked(p.pos.x, p.pos.z);
        if (!zm) this.traffic.update(dt);
        if (!zm) this.police.update(dt);
        this.fleet.update(dt, this.sky.night);
        if (p.vehicle && p.vehicle.spec.twoWheel) p.rideBike(p.vehicle, dt); // the rider sits on the bike where it is now
        if (!zm) this.peds.update(dt); else this.peds.updateSpeech(dt);
        if (this.mode === 'normal') this.missions.update(dt);
        this.pickups.update(dt);
      } else {
        if (this.mode === 'normal') this.police.updateInside(dt); // hidden in a house: the search goes on outside
        this.peds.updateSpeech(dt);
      }
      this.interiors.update(dt);
      this.shops.update(dt);
      this.fishing.update(dt);
      this.homeSafe.update();
      this.activities.update(dt);
      if (this.mode === 'normal') this.jobs.update(dt);
      this.seats.update(dt);
      if (this.phone) { this.phone.update(dt); input.phoneOpen = this.phone.open; }
      if (this.fm) this.fm.update(dt);
      if (this.mode === 'normal' && !this.interior) { this.merendero.update(dt); this.mercadillo.update(dt); }
      if (this.zombieSys.active) this.zombieSys.update(dt);
      this.effects.update(dt);
      this.weapons.tracers.update(dt);
      this.cam.update(dt, input);
      this.viewModel.update(dt);
      this.hud.update(dt);
      this.updateAudio(dt);
      this.save.hour = this.sky.hour;
      this.flushHints();
      this.saveT = (this.saveT || 0) + dtReal;
      if (this.saveT > 10) { this.saveT = 0; if (!this.interior && !this.map.buildingAt(p.pos.x, p.pos.z)) this.save.pos = { x: p.pos.x, z: p.pos.z }; this.persist(); }
    }
    const night = this.sky.update(dt, this.camera.position);
    // cutscenes are lit like a film at night: a little more exposure and sky fill so you can see what it shows
    if (this.cam.cinematic && night > 0.05) { this.renderer.toneMappingExposure *= 1 + 0.4 * night; this.sky.hemi.intensity += 0.55 * night; }
    if (this.interior) this.interiors.dimSky();
    if (this.mode === 'zombis') { const f = this.sky.fog; f.near = 18; f.far = 230; f.color.lerp(new THREE.Color(0.42, 0.36, 0.32), 0.5); }
    shared.uNight.value = night;
    shared.uNightLit.value = this.sky.hour > 23.5 || this.sky.hour < 6 ? 0.15 : 0.4;
    // inside a house the town is still seen through its windows: stream it around the real building
    const wv = this.interior && this.windowView && this.windowView.active ? this.windowView : null;
    if (wv) wv.sync();
    this.world.update(dt, night, wv ? wv.eye : this.camera.position);
    this.chars.updateLods(this.camera.position, this.q.shadows > 0, wv ? wv.eye : null);
    this.render();
    input.endFrame();
  }

  // dynamic resolution, gently: only a sustained slowdown (not a hiccup while the town streams in) lowers the internal
  // resolution, by small steps and never below ~60 % of the chosen one; it comes back as soon as there is room.
  // Ajustes › Resolución «Fija» turns it off. (It used to drop to 0.55 at the first stutter and stay there: the
  // «the graphics get worse out of nowhere» of the testers.)
  adaptResolution(dtReal) {
    const r = this.renderer;
    const pf = this.perf || (this.perf = { avg: 1 / 60, t: 0, pr: r.getPixelRatio(), base: r.getPixelRatio(), lock: 0, slow: 0, fast: 0, grace: 8 });
    if (this.save.dynRes === false) { if (pf.pr !== pf.base) { pf.pr = pf.base; r.setPixelRatio(pf.base); if (this.composer) this.composer.setPixelRatio(pf.base); this.resize(); } return; }
    pf.grace -= dtReal;
    if (pf.grace > 0) return; // the first seconds after starting / entering somewhere: everything is loading
    pf.avg = pf.avg * 0.97 + dtReal * 0.03;
    pf.t += dtReal;
    pf.lock -= dtReal;
    if (pf.t < 2) return;
    pf.t = 0;
    pf.slow = pf.avg > 1 / 38 ? pf.slow + 1 : 0;   // under ~38 fps
    pf.fast = pf.avg < 1 / 50 ? pf.fast + 1 : 0;   // over ~50 fps
    const floor = Math.max(0.75, pf.base * 0.6);
    let pr = pf.pr;
    if (pf.slow >= 3 && pr > floor) { pr = Math.max(floor, pr - 0.1); pf.lock = 6; pf.slow = 0; }       // 6 s in a row
    else if (pf.fast >= 2 && pr < pf.base && pf.lock <= 0) { pr = Math.min(pf.base, pr + 0.1); pf.fast = 0; }
    if (Math.abs(pr - pf.pr) < 0.01) return;
    pf.pr = pr;
    r.setPixelRatio(pr);
    if (this.composer) this.composer.setPixelRatio(pr);
    this.resize();
  }
  // a pause before judging the frame rate again (after a teleport, a respawn, a house…)
  perfGrace(s = 6) { if (this.perf) { this.perf.grace = Math.max(this.perf.grace || 0, s); this.perf.slow = 0; } }

  updateAudio(dt) {
    const a = this.audio;
    const p = this.player;
    a.setListener(this.camera.position.x, this.camera.position.z, this.cam.forwardYaw + (a.yawOffset || 0));
    const v = p.vehicle;
    if (v && !v.dead) {
      const type = v.spec.engine || (v.spec.shape === 'tractor' ? 'tractor' : v.spec.livery ? 'police' : v.spec.shape === 'suv' || v.spec.shape === 'pickup' ? 'suv' : v.spec.shape === 'van' ? 'van' : 'car');
      if (type === 'none') a.setEngine(null); // a bicycle: just the wind
      else a.setEngine({ type, rpm: clamp((v.rpm - 0.2) / 0.85, 0, 1.1), throttle: v.throttle, speed: Math.abs(v.speed), load: v.throttle });
      a.setSkid(clamp(v.skid, 0, 1) * (v.surf && v.surf.dirt ? 0.3 : 1));
      a.setOffroad(v.surf && v.surf.dirt ? clamp(v.vel / 15, 0, 1) : 0);
      a.setWind(clamp((v.vel - 8) / 35, 0, 1));
      a.horn(this.input.horn);
      if (this.input.horn) this.peds.scare(v.x + Math.sin(v.heading) * 8, v.z + Math.cos(v.heading) * 8, 6);
      if (v.siren) { if (!this.playerSiren) { a.sirenStart('player', v.spec.livery === 'gc' ? 'guardia' : 'local'); this.playerSiren = true; } a.sirenPos('player', v.x, v.z); }
      else if (this.playerSiren) { a.sirenStop('player'); this.playerSiren = false; }
    } else {
      if (this.playerSiren) { a.sirenStop('player'); this.playerSiren = false; }
      a.horn(false);
    }
    a.setAmbient({ hour: this.sky.hour, town: this.map.inTown(p.pos.x, p.pos.z) ? 1 : 0.25, indoor: this.interior ? (this.interior.church ? 1 : 0.65) : 0 });
    const fu = this.world.landmarks.poi.fuente; // the fountain's water, all the time (not heard from inside anywhere)
    if (fu && a.ready) a.loopAt('fuente', { x: fu.x, z: fu.z, kind: 'fuente', vol: 0.55, ref: 5, max: 60, on: !this.interior });
    this.storkT = (this.storkT || 20) - dt;
    const tw = this.world.landmarks.poi.churchTower;
    if (tw && this.storkT <= 0) {
      this.storkT = 25 + Math.random() * 30;
      if (Math.hypot(p.pos.x - tw.x, p.pos.z - tw.z) < 180 && this.sky.night < 0.5) a.storks(tw.x, tw.z);
    }
    a.update(dt);
  }

  // the scene through whichever pipeline is on (also used by the photo tools with their own cameras)
  renderView(cam, overlay = null) {
    if (this.toon) this.toon.render(this.scene, cam, { night: this.sky ? this.sky.night : 0, exposure: this.renderer.toneMappingExposure, overlay });
    else if (this.composer) { const rp = this.composer.passes[0], keep = rp.camera; rp.camera = cam; this.composer.render(); rp.camera = keep; }
    else this.renderer.render(this.scene, cam);
  }
  render() {
    if (this.bloom) {
      const night = this.sky ? this.sky.night : 0;
      this.bloom.strength = lerp(0.05, 0.6, night);
      this.bloom.threshold = lerp(1.8, 0.85, night);
      this.bloom.radius = lerp(0.3, 0.6, night);
    }
    const wv = this.interior && this.windowView && this.windowView.render(); // the street, drawn for the windows
    this.renderView(this.camera);
    if (wv) this.windowView.after();
    // first-person gun on top (in the anime look, through the same tone curve: CustomToneMapping)
    if (this.viewModel && this.state === 'play') this.viewModel.render(this.renderer);
  }

  // ------------------------------------------------------------ game modes: normal · zombis
  // back on your feet after the end of a zombie night (the menu, «Seguir en Guareña»…)
  revive() {
    const p = this.player;
    if (!p || !(p.mode === 'dead' || p.mode === 'busted' || p.health <= 0)) return;
    p.health = 100;
    p.spawnAt(p.pos.x, p.pos.z, p.heading);
    this.canvas.style.filter = ''; this.timeScale = 1;
  }
  setMode(id, opts = {}) {
    if (this.zombieSys.active) this.zombieSys.stop();
    if (this.state === 'ended') this.state = 'play';
    this.revive();
    this.mode = id;
    this.pendingMode = id;
    document.body.dataset.mode = id;
    this.missions.setVisible(id === 'normal');
    for (const d of this.interiors.doors) d.spr.visible = false;
    if (id === 'zombis') this.zombieSys.start();
    else if (opts.dawn) {
      this.sky.hour = 7.2;
      const d = this.interiors.doors[0];
      if (d) { this.player.spawnAt(d.x, d.z, Math.atan2(d.x - d.fx, d.z - d.fz)); this.cam.yaw = this.player.heading + Math.PI; }
      this.cam.setFirstPerson(false);
      this.state = 'play';
      this.hud.banner('AMANECE EN GUAREÑA', 'Ha vuelto la luz', 'pass', 3.5);
    }
  }

  // end-of-run screen of the zombie night
  showEnd(title, sub, win, mode) {
    const $ = (id) => document.getElementById(id);
    const e = $('hEnd');
    if (!e) return;
    $('hEndTitle').textContent = title; $('hEndSub').textContent = sub;
    e.classList.toggle('win', !!win);
    e.hidden = false;
    $('hTown').hidden = !win;
    this.endMode = mode;
    this.input.exitLock && this.input.exitLock();
  }
  retryMode() {
    const $ = (id) => document.getElementById(id);
    $('hEnd').hidden = true;
    const p = this.player;
    p.char.standUp(); p.char.object.rotation.x = 0; p.mode = 'foot'; p.health = 100;
    this.canvas.style.filter = ''; this.timeScale = 1;
    this.state = 'play';
    if (this.endMode === 'zombis') { const d = this.interiors.doors[0]; if (d) p.spawnAt(d.x, d.z, 0); this.setMode('zombis'); }
    else this.setMode(this.mode);
  }

  // hot-reload snapshot for open viewers
  snapshot() {
    const p = this.player;
    return { pos: p ? { x: p.pos.x, z: p.pos.z } : null, money: p ? p.money : 0, hour: this.sky ? this.sky.hour : 18, preset: this.save.custom || null };
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
