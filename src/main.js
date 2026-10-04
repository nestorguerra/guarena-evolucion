// Boot, menus (title flyover, character select with live 3D preview in the Plaza de España), pause & settings.
import * as THREE from 'three';
import { Game, QUALITY } from './game.js';
import { PLAYER_PRESETS, SKIN, HAIR, CLOTH, mhTexReady } from './characters.js';
import { PERKS } from './perks.js';
import { colorFor } from './net.js';
import { newRoomCode } from './online.js';
import { Editor } from './editor.js';
let GameAudio;
try { ({ GameAudio } = await import('./audio.js')); } catch (e) { console.warn('audio.js unavailable, using silent audio', e); }
if (typeof GameAudio !== 'function') ({ GameAudio } = await import('./audio_stub.js'));
import { safeStorage, clamp, readSave } from './util.js';
import { applyDioramaPalette } from './textures.js';
import { STYLE, setStyle } from './style.js';
import { installToonChunks, LOOKS } from './toon.js';
import { INTRO, introPlan, droneAt, coverFov, IntroFlight } from './intro.js';

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'), radar: $('radar'), bigmap: $('bigmap'), mapScreen: $('mapScreen'), touch: $('touch'),
  money: $('money'), clock: $('clock'), stars: $('stars'), wState: $('wState'), hp: $('hp'), veh: $('veh'), speed: $('speed'), vehName: $('vehName'), vehHp: $('vehHp'),
  street: $('street'), district: $('district'), streetBox: $('streetBox'), objective: $('objective'), subs: $('subs'), help: $('help'),
  notes: $('notes'), banner: $('banner'), radio: $('radio'), timer: $('timer'), damage: $('damage'), letterbox: $('letterbox'), speech: $('speech'),
  ar: $('ar'), weapon: $('weapon'), wName: $('wName'), wAmmo: $('wAmmo'), crosshair: $('crosshair'), prompt: $('prompt'), tAttack: $('tAttack'),
  shop: $('shop'), shopList: $('shopList'), shopTitle: $('shopTitle'), shopSub: $('shopSub'), shopClose: $('shopClose'),
};

async function loadMapData() {
  const inline = document.getElementById('mapdata');
  if (inline) return JSON.parse(inline.textContent);
  const r = await fetch('data/map.json');
  return r.json();
}

function defaultQuality(store) {
  let saved = null;
  try { saved = JSON.parse(readSave(store)).quality; } catch (e) { /* ignore */ }
  if (saved && QUALITY[saved]) return saved;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) return 'baja';
  return (navigator.hardwareConcurrency || 4) >= 8 ? 'alta' : 'media';
}

let game, audio, mode = 'loading', selGender = 'm', selIdx = 0, preview = null, previewDesc = null, custom = {}, editor = null, pendingPreview = null;
const flyT = { t: 0 };

// audio must never break the game: every call is guarded
function safeAudio(a) {
  return new Proxy(a, {
    get(t, k) {
      let v;
      try { v = t[k]; } catch (e) { return undefined; }
      if (v === undefined && typeof k === 'string' && !/^(ready|station|__)/.test(k)) return () => undefined;
      if (typeof v !== 'function') return v;
      return (...args) => {
        try { return v.apply(t, args); } catch (e) { if (!t.__warned) { t.__warned = true; console.warn('audio error', e); } return undefined; }
      };
    },
  });
}

// a saved protagonist follows its preset: a newer preset version replaces the old look, otherwise the chosen colours stay
function refreshSavedCharacter() {
  const s = game.save.custom;
  const p = s && s.id && PLAYER_PRESETS.find((x) => x.id === s.id);
  if (!p) return;
  const keep = {};
  if ((s.v || 1) === (p.v || 1)) for (const k of ['skin', 'hair', 'top']) if (s[k] !== undefined) keep[k] = s[k];
  game.save.custom = { ...p, ...keep };
}

async function boot(hot = {}) {
  const store = safeStorage();
  try { audio = safeAudio(new GameAudio()); } catch (e) { console.warn(e); audio = safeAudio({ stationName: 'Radio Apagada' }); }
  const raw = await loadMapData();
  const q = defaultQuality(store);
  // the look (anime unless the player chose the photographic one): it has to be set before anything is built
  let style = null;
  try { style = JSON.parse(readSave(store)).style; } catch (e) { /* ignore */ }
  try { const u = new URLSearchParams(location.search).get('estilo'); if (u) style = u; } catch (e) { /* (?estilo=real: a look for this visit only) */ }
  setStyle(style || 'anime');
  if (STYLE.anime) installToonChunks();
  if (STYLE.diorama) applyDioramaPalette(); // (the façades in the diorama's palette, before the town is painted)
  document.body.dataset.look = STYLE.name;
  // the anime look comes in without a menu: the drone's picture of the town drifts closer while it is built
  const intro = STYLE.anime && !hot.resume ? introPicture() : null;
  game = new Game({ canvas: ui.canvas, ui, raw, quality: q, audio });
  refreshSavedCharacter();
  ui.onPause = () => openPause();
  const bar = document.querySelector('#loadBar b'), txt = $('loadText');
  await game.init((label, f) => { bar.style.width = Math.round(f * 100) + '%'; txt.textContent = label; });
  if (hot.money !== undefined) game.player.money = hot.money;
  if (hot.hour !== undefined) game.sky.hour = hot.hour;
  if (hot.pos) game.save.pos = hot.pos;
  if (window.claude?.hot?.snapshot) window.claude.hot.snapshot(() => game.snapshot());
  window.game = game;
  $('loading').hidden = true;
  if (intro) await beginIntro(intro);
  else showMenu();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      if (mode === 'play') game.frame(dt);
      else if (mode === 'intro') introFrame(dt);
      else menuFrame(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  if (hot.preset && hot.resume) { previewDesc = hot.preset; startGame(); }
}

// ------------------------------------------------------------ the way in (anime look): the drone's picture, then the flight
// the painted view of the town covers the screen and drifts slowly closer (a CSS transition: smooth even while the
// page is busy building the town)
function introPicture() {
  const box = $('intro'), img = $('introImg');
  if (!box || !img) return null;
  if (!box.hidden) return { box, img }; // (the page's own script has already put it up and set it drifting)
  box.hidden = false;
  const fit = () => {
    const vw = innerWidth, vh = innerHeight, k = Math.max(vw / 1920, vh / 1080);
    Object.assign(img.style, { width: 1920 * k + 'px', height: 1080 * k + 'px', left: (vw - 1920 * k) / 2 + 'px', top: (vh - 1080 * k) / 2 + 'px' });
  };
  fit(); addEventListener('resize', fit);
  const go = () => { img.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => { img.style.transition = `transform ${INTRO.zoomTime}s cubic-bezier(0.25, 0.55, 0.35, 1), opacity 0.7s`; img.style.transform = `scale(${INTRO.zoomMax})`; })); };
  if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
  return { box, img, fit };
}
function pictureScale(img) {
  const m = getComputedStyle(img).transform;
  const a = m && m !== 'none' ? parseFloat(m.slice(m.indexOf('(') + 1)) : 1;
  return Number.isFinite(a) && a > 0 ? a : 1;
}
let flight = null, introBits = null;
async function beginIntro(pic) {
  const g = game, cam = g.camera;
  const plan = introPlan(g);
  g.sky.hour = INTRO.hour;
  // Álex already in his street, the game started behind the picture (its HUD hidden until the flight has landed)
  g.pendingMode = 'normal';
  g.start(PLAYER_PRESETS[0], { at: { x: plan.P.x, z: plan.P.z, heading: plan.heading } });
  if (g.weapons && g.weapons.cur !== 'punos') { g.weapons.select('punos'); if (g.weapons.syncModel && g.player.char) g.weapons.syncModel(g.player.char); } // (empty-handed on his street; the rest stays in his pockets)
  $('hud').hidden = true;
  // his own figure built, its skin and eyes painted, before the drone comes down to him (the picture drifts on meanwhile)
  for (let t = 0; t < 15000 && !(g.player.char && g.player.char.ready); t += 50) await new Promise((r) => setTimeout(r, 50));
  await Promise.race([mhTexReady(), new Promise((r) => setTimeout(r, 5000))]);
  // where the game's own camera will be: the end of the flight
  g.cam.update(0, g.input);
  const endPos = cam.position.clone(), endLook = g.cam.target.clone(), endFov = g.cam.fov;
  // the live camera exactly where the picture has got to, the picture frozen there
  const s = pictureScale(pic.img);
  pic.img.style.transition = 'none'; pic.img.style.transform = `scale(${s})`;
  cam.fov = coverFov(innerWidth / Math.max(1, innerHeight));
  droneAt(plan, s, cam.position); cam.lookAt(plan.T); cam.updateProjectionMatrix();
  // a few frames behind the picture: the town around the drone streamed in, the shaders warm
  for (let i = 0; i < 4; i++) { g.sky.update(0.016, cam.position); g.world.update(0.016, g.sky.night, cam.position); g.chars.updateLods(cam.position, true); g.render(); await new Promise((r) => setTimeout(r, 0)); }
  flight = new IntroFlight(plan, cam.position, cam.fov, endPos, endLook, endFov);
  introBits = { pic, t: 0 };
  pic.box.classList.add('out'); // (the picture fades into the live view)
  mode = 'intro';
  // the first touch or key wakes the sound (browsers keep it asleep until then)
  const wake = () => { audio.unlock(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
  addEventListener('pointerdown', wake); addEventListener('keydown', wake);
}
// (for the test tools, whose hidden page gets no animation frames: step the way in by hand)
window.guarenaIntro = { step: (dt) => mode === 'intro' && introFrame(dt), get mode() { return mode; } };
function introFrame(dt) {
  const g = game;
  flight.update(dt, g.camera);
  introBits.t += dt;
  if (introBits.t > 1.2 && !introBits.pic.box.hidden) introBits.pic.box.hidden = true;
  g.sky.update(dt, g.camera.position);
  g.world.update(dt, g.sky.night, g.camera.position);
  g.fleet.streamParked(g.camera.position.x, g.camera.position.z);
  g.fleet.update(dt, g.sky.night);
  const ch = g.player && g.player.char;
  if (ch) ch.update(dt, 0, {});
  g.chars.updateLods(g.camera.position, true);
  g.render();
  if (flight.done) { // landed: you are playing
    flight = null;
    $('hud').hidden = false;
    ui.touch.classList.add('playing');
    mode = 'play';
    game.input.wantLock = true;
    // arriving with a friend's invitation (a link ending in #sala-XXXXX): into their room
    if (game.net.invited && !game.net.connected) { game.net.invited = false; game.state = 'paused'; game.input.exitLock(); openMulti(); }
  }
}

// ------------------------------------------------------------ title menu with flyover
function showMenu() {
  mode = 'menu';
  $('menu').hidden = false; $('select').hidden = true; $('hud').hidden = true; $('pause').hidden = true; $('mp').hidden = true;
  ui.touch.classList.remove('playing');
  removePreview();
  playLabel();
  $('bPlay').focus();
}
function menuFrame(dt) {
  const g = game;
  flyT.t += dt;
  const lm = g.world.landmarks.poi;
  const c = lm.churchTower || { x: -150, z: -40 };
  if (window.debugCam) {
    const d = window.debugCam;
    g.camera.position.set(d.x, d.y, d.z);
    g.camera.lookAt(d.lx, d.ly, d.lz);
  } else if (mode === 'menu' || mode === 'mp') {
    const a = flyT.t * 0.045 + 2.2;
    const R = 95;
    g.camera.position.set(c.x + Math.cos(a) * R, 38 + Math.sin(flyT.t * 0.1) * 6, c.z + Math.sin(a) * R);
    g.camera.lookAt(c.x + 40, 8, c.z + 40);
  } else if (mode === 'edit' && preview) {
    // the editor: the camera stays in front, the figure turns; zoom from the face (0) to the whole body (1)
    const p = preview.object.position, E = editor, ang = selectCamAngle, sc = preview.scale || 1;
    E.zoomS = (E.zoomS ?? E.zoom) + (E.zoom - (E.zoomS ?? E.zoom)) * Math.min(1, dt * 6);
    const z = E.zoomS, narrow = innerWidth < 760 || innerHeight <= 520;
    const dist = (narrow ? 1.45 : 1.05) + z * (narrow ? 3.2 : 2.6), lookY = (1.6 - 0.62 * z) * sc - (narrow ? 0.25 * z + 0.12 : 0);
    g.camera.position.set(p.x + Math.sin(ang) * dist, lookY + 0.04 + z * 0.35, p.z + Math.cos(ang) * dist);
    const off = narrow ? 0 : 0.18 + z * 0.62;
    g.camera.lookAt(p.x - Math.cos(ang) * off, lookY, p.z + Math.sin(ang) * off);
    preview.object.rotation.y += ((selectCamAngle + E.yaw) - preview.object.rotation.y) * Math.min(1, dt * 8);
    preview.lookAt(Math.abs(Math.sin(E.yaw)) < 0.5 && Math.cos(E.yaw) > 0 ? g.camera.position : null);
    preview.update(dt, 0, { fidget: false });
  } else if (mode === 'select' && preview) {
    const p = preview.object.position;
    const ang = selectCamAngle;
    const short = innerHeight <= 500;
    const narrow = innerWidth < 760 && !short;
    const dist = narrow ? 4.6 : 3.4;
    g.camera.position.set(p.x + Math.sin(ang) * dist, narrow ? 1.35 : 1.55, p.z + Math.cos(ang) * dist);
    if (narrow) g.camera.lookAt(p.x, 0.25, p.z);
    else {
      // landscape phones: centre the character in the space the panel leaves free
      let off = 0.55;
      if (short) {
        const r = document.querySelector('.selPanel')?.getBoundingClientRect();
        const frac = r ? Math.min(0.7, r.right / innerWidth) : 0.5;
        off = frac * dist * Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2)) * g.camera.aspect;
      }
      g.camera.lookAt(p.x - Math.cos(ang) * off, 1.05, p.z + Math.sin(ang) * off);
    }
    preview.object.rotation.y = selectCamAngle + Math.sin(flyT.t * 0.45) * 0.55;
    preview.lookAt(g.camera.position);
    preview.update(dt, 0, {});
  }
  g.sky.update(dt, g.camera.position);
  const night = g.sky.night;
  g.world.update(dt, night, g.camera.position);
  g.fleet.streamParked(g.camera.position.x, g.camera.position.z);
  g.fleet.update(dt, night);
  g.chars.updateLods(g.camera.position, true);
  g.render();
}
let selectCamAngle = 0;

// ------------------------------------------------------------ character select
function openSelect() {
  mode = 'select';
  $('menu').hidden = true; $('select').hidden = false; $('pause').hidden = true; $('hud').hidden = true;
  const saved = game.save.custom;
  if (saved && !previewDesc) { const i = PLAYER_PRESETS.findIndex((p) => p.id === saved.id); if (i >= 0) { selGender = PLAYER_PRESETS[i].gender; selIdx = PLAYER_PRESETS.filter((p) => p.gender === selGender).indexOf(PLAYER_PRESETS[i]); custom = { skin: saved.skin, hair: saved.hair, top: saved.top }; } }
  renderCards();
  updatePreview();
}
function presetsOf(g) { return g === 'u' ? (game.save.chars || []) : PLAYER_PRESETS.filter((p) => p.gender === g); }
function renderCards() {
  $('tabM').classList.toggle('on', selGender === 'm');
  $('tabF').classList.toggle('on', selGender === 'f');
  $('tabU').classList.toggle('on', selGender === 'u');
  const list = presetsOf(selGender);
  const box = $('cards');
  box.innerHTML = '';
  if (selGender === 'u' && !list.length) box.innerHTML = '<p class="edHint">Aquí aparecen los personajes que crees con el editor.</p>';
  list.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'card' + (i === selIdx ? ' on' : '');
    const pk = PERKS[p.perk || p.id];
    b.innerHTML = `<span class="av" style="background:${p.top}">${(p.name || '?')[0]}</span><span><b>${p.name || 'Sin nombre'}</b>${pk ? `<i>★ ${pk.title}</i>` : ''}<small>${p.bio || ''}</small></span>`;
    b.onclick = () => { selIdx = i; custom = {}; audio.sfx('ui_select'); renderCards(); updatePreview(); };
    box.appendChild(b);
  });
  const d = currentDesc();
  const sw = (id, values, key, isIndex) => {
    const el = $(id);
    el.innerHTML = '';
    values.forEach((v, i) => {
      const b = document.createElement('button');
      b.style.background = v;
      b.setAttribute('aria-label', key + ' ' + (i + 1));
      const cur = isIndex ? d[key] === i : d[key] === v;
      if (cur) b.classList.add('on');
      b.onclick = () => { custom[key] = isIndex ? i : v; audio.sfx('ui_click'); renderCards(); updatePreview(); };
      el.appendChild(b);
    });
  };
  sw('swSkin', SKIN, 'skin', true);
  sw('swHair', HAIR, 'hair', true);
  sw('swTop', CLOTH.slice(0, 12), 'top', false);
  $('selN').textContent = d.name || '';
  $('selBio').textContent = d.bio || '';
  const pk = PERKS[d.perk || d.id];
  $('selPerk').innerHTML = pk ? `<b>★ Ventaja · ${pk.title}</b><ul>${pk.lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '';
  $('selRole').textContent = (d.gender === 'f' ? 'Protagonista · Chica' : 'Protagonista · Chico') + (typeof d.age === 'number' ? ` · ${d.age} años` : '');
}
function currentDesc() {
  const base = presetsOf(selGender)[selIdx] || PLAYER_PRESETS[0];
  const d = { ...base, ...custom };
  // the quick colour swatches also work on edited characters (they carry exact colours)
  if (custom.skin != null) delete d.skinColor;
  if (custom.hair != null) delete d.hairColor;
  return d;
}
function removePreview() {
  if (preview) { game.scene.remove(preview.object); preview.dispose(); preview = null; }
}
function placePreview(ch) {
  const lm = game.world.landmarks.poi;
  const a = lm.ayto;
  const x = a ? a.x + a.nx * 14 : -35, z = a ? a.z + a.nz * 14 : 45;
  ch.object.position.set(x, 0, z);
  selectCamAngle = a ? Math.atan2(a.nx, a.nz) : 0;
  ch.object.rotation.y = selectCamAngle;
  ch.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}
function showPreview(d) {
  previewDesc = d;
  const ch = game.chars.create(d);
  placePreview(ch);
  if (pendingPreview) pendingPreview.dispose();
  pendingPreview = ch;
  const swap = () => {
    if (pendingPreview !== ch) return;
    if (!ch.ready) { setTimeout(swap, 50); return; }
    const old = preview;
    preview = ch; pendingPreview = null;
    if (old) ch.object.rotation.y = old.object.rotation.y;
    game.scene.add(ch.object);
    if (old) { game.scene.remove(old.object); old.dispose(); }
    ch.update(0.016, 0, { fidget: false });
  };
  swap();
}
function openEditor(from) {
  mode = 'edit';
  $('select').hidden = true; $('menu').hidden = true; $('hud').hidden = true;
  editor.open(from);
}
function updatePreview() {
  removePreview();
  const d = currentDesc();
  previewDesc = d;
  preview = game.chars.create(d);
  const lm = game.world.landmarks.poi;
  const a = lm.ayto;
  const x = a ? a.x + a.nx * 14 : -35, z = a ? a.z + a.nz * 14 : 45;
  preview.object.position.set(x, 0, z);
  selectCamAngle = a ? Math.atan2(a.nx, a.nz) : 0;
  preview.object.rotation.y = selectCamAngle;
  preview.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(preview.object);
}

// ------------------------------------------------------------ play / pause
function startGame() {
  audio.unlock();
  const d = previewDesc || currentDesc();
  removePreview();
  $('menu').hidden = true; $('select').hidden = true; $('pause').hidden = true;
  $('hud').hidden = false;
  ui.touch.classList.add('playing');
  mode = 'play';
  game.input.wantLock = true;
  game.input.requestLock();
  if (game.state === 'paused') {
    game.state = 'play'; game.audio.pauseAll(false);
    // a different character picked in «Personajes» from the title menu: put it in (it used to be ignored until a reload)
    const cur = game.player.char && game.player.char.desc;
    if (d && cur && JSON.stringify(d) !== JSON.stringify(cur)) { swapCharacter(d); announcePerk(d); }
    if (game.mode !== selMode) game.setMode(selMode);
    else game.revive(); // came back to the menu from an end screen
    return;
  }
  game.pendingMode = selMode;
  game.start(d);
  announcePerk(d);
}
// ------------------------------------------------------------ multiplayer lobby
let mpUnsub = null, selReturn = null;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function mpDesc() { return game.save.custom ? { ...game.save.custom } : { ...PLAYER_PRESETS[0] }; }
function mpName() { return (game.save.mpName || '').trim() || mpDesc().name || 'Jugador'; }
async function openMulti() {
  mode = 'mp';
  $('menu').hidden = true; $('select').hidden = true; $('pause').hidden = true; $('hud').hidden = true;
  $('mp').hidden = false;
  removePreview();
  const net = game.net;
  if (!mpUnsub) mpUnsub = net.on(onNet);
  $('mpName').value = mpName();
  renderMulti();
  if (!net.connected && !net.connecting) {
    await net.probe();
    renderMulti();
    if (net.available) { const c = net.connect(mpName(), mpDesc()); renderMulti(); await c; }
  }
  renderMulti();
  // while the lobby is open, keep the invitation links fresh (the internet link can be renewed)
  clearInterval(openMulti.timer);
  openMulti.timer = setInterval(async () => {
    if (mode !== 'mp') { clearInterval(openMulti.timer); return; }
    if (net.available && net.isLocalHost && !net.online) { await net.probe(); if (mode === 'mp') renderMulti(); }
    else if (net.online) renderMulti();
  }, 4000);
}
function onNet(kind, data) {
  if (kind === 'start') { startMulti(data && data.late); return; }
  if (kind === 'lost') { const t = $('tChat'); if (t) t.hidden = true; }
  if (mode === 'mp') renderMulti();
}
function renderMulti() {
  const net = game.net, info = net.info;
  if (net.online) { renderOnline(); return; }
  $('mpRoom').hidden = true; $('mpGo').hidden = true;
  const yes = !!(net.available && net.connected);
  // a public server of the game (baked in at build time): outside it, offer to go there
  const online = (typeof window !== 'undefined' && window.GUARENA_MP_URL) || '';
  $('mpOnline').hidden = !(net.available === false && online);
  if (online) $('mpOnlineLink').href = online;
  $('mpNo').hidden = net.available !== false;
  $('mpYes').hidden = !yes;
  $('mpReady').hidden = !yes;
  const st = $('mpStatus');
  if (net.available === false) st.textContent = online ? 'Desde esta página se juega solo: el multijugador está en su servidor.' : '⚠️ Este juego no está abierto desde el servidor multijugador.';
  else if (net.fullError) st.textContent = 'La sala está llena (caben 8 jugadores).';
  else if (!net.connected) st.textContent = net.available == null ? 'Buscando el servidor…' : net.connecting ? 'Conectando…' : 'No se pudo conectar. ¿Sigue abierta la ventana del servidor?';
  else st.innerHTML = `<i class="dot"></i>Conectado a la sala${net.isHost ? ' · la has abierto tú' : ''}`;
  if (!yes) return;
  // the invitation: on the computer that runs the server, or for everyone on a public server (its own address)
  const cloud = !!(info && info.cloud);
  $('mpInvite').hidden = !(net.isLocalHost || cloud);
  $('mpLanRow').hidden = cloud;
  $('mpNetNote').textContent = cloud ? `Pásales este enlace a tus amigos (por WhatsApp, por ejemplo): quien lo abra entra en la sala. Caben ${info.max || 8}.` : '¿Tu amigo está en otra casa? Crea el enlace por internet y mándaselo (por WhatsApp, por ejemplo).';
  const lan = info && info.lan && info.lan[0];
  $('mpLan').textContent = lan || 'sin red local';
  $('mpCopyLan').hidden = !lan;
  const tn = (info && info.tunnel) || 'off', url = info && info.internet;
  $('mpNet').textContent = url || (tn === 'starting' ? 'Creando el enlace…' : tn === 'error' ? info.tunnelError || 'No se pudo crear' : '—');
  const mk = $('mpMakeNet');
  mk.textContent = url ? 'Copiar' : tn === 'starting' ? '…' : tn === 'error' ? 'Reintentar' : 'Crear enlace';
  mk.disabled = tn === 'starting' && !url;
  // me and the others
  const d = mpDesc(), pk = PERKS[d.id];
  $('mpCharN').textContent = d.name || 'Personaje';
  $('mpCharP').textContent = pk ? '★ ' + pk.title : '';
  const row = (id, name, char, state, ok) => `<li><i style="background:${colorFor(id)}"></i><b>${esc(name)}</b><span>${esc(char)}</span><em class="${ok ? 'ok' : ''}">${state}</em></li>`;
  const lista = (desc) => (desc && desc.gender === 'f' ? '✓ Lista' : '✓ Listo');
  const rows = [row(net.id, net.name + ' (tú)', d.name || '', net.ready ? lista(d) : 'Eligiendo…', net.ready)];
  let playing = 0;
  for (const p of net.players.values()) {
    if (p.playing) playing++;
    rows.push(row(p.id, p.name, (p.desc && p.desc.name) || '', p.playing ? '🎮 Jugando' : p.ready ? lista(p.desc) : 'Eligiendo…', p.ready || p.playing));
  }
  $('mpPlayers').innerHTML = rows.join('');
  const others = net.players.size;
  const rb = $('mpReady');
  rb.textContent = playing ? '¡Entrar en la partida!' : net.ready ? 'Esperando a los demás…' : d.gender === 'f' ? '¡Estoy lista!' : '¡Estoy listo!';
  rb.classList.toggle('on', net.ready && !playing);
  $('mpHint').textContent = playing ? 'Tu amigo ya está en Guareña: aparecerás a su lado.'
    : !others ? 'Esperando a que llegue tu amigo… Pásale el enlace de arriba.'
    : net.ready ? 'En cuanto los demás estén listos, salís juntos desde la Plaza de España. (Pulsa otra vez para cancelar.)'
    : 'Cuando estéis todos listos, salís juntos desde la Plaza de España.';
}
// online, browser to browser (the page on GitHub): a public room everybody shares, or a private one with its own link
function renderOnline() {
  const net = game.net, yes = net.connected;
  const home = (typeof window !== 'undefined' && window.GUARENA_ONLINE_URL) || 'https://nestorguerra.github.io/guarena-evolucion/';
  $('mpOnline').hidden = true; $('mpNo').hidden = true; $('mpInvite').hidden = true;
  // could not reach the meeting servers: from a page that blocks them (the published copy), send people to GitHub
  $('mpGo').hidden = !(net.onlineError && !location.href.startsWith(home));
  $('mpGoLink').href = home + (net.room ? '#sala-' + net.room : '');
  $('mpYes').hidden = !yes; $('mpRoom').hidden = !yes;
  $('mpReady').hidden = !(yes || (net.onlineError && !net.connecting));
  const st = $('mpStatus');
  if (!yes) {
    st.textContent = net.connecting ? 'Conectando con la partida online…' : net.onlineError ? 'No se pudo conectar con la partida online. ¿Tienes internet?' : 'Buscando la partida online…';
    $('mpReady').textContent = 'Reintentar';
    return;
  }
  const m = net.mesh, people = net.players.size;
  st.innerHTML = `<i class="dot"></i>En línea · ${net.room ? 'sala privada ' + esc(net.room) : 'sala pública'}${people ? ` · ${people + 1} en la sala` : ''}${m && !m.brokersUp ? ' · reconectando…' : ''}`;
  $('mpRoomT').textContent = net.room ? `Sala privada ${net.room}` : 'Sala pública de Guareña';
  $('mpRoomLink').textContent = net.inviteLink();
  $('mpRoomNote').textContent = net.room ? 'Solo entra quien tenga este enlace. Pásaselo a tus amigos (por WhatsApp, por ejemplo).' : 'Aquí entra cualquiera que abra Guareña y elija Multijugador. Pásale el enlace a tus amigos, o crea una sala privada solo para vosotros.';
  $('mpPrivate').textContent = net.room ? 'Otra sala privada' : 'Crear sala privada';
  $('mpPublic').hidden = !net.room;
  const d = mpDesc(), pk = PERKS[d.id];
  $('mpCharN').textContent = d.name || 'Personaje';
  $('mpCharP').textContent = pk ? '★ ' + pk.title : '';
  const row = (id, name, char, state, ok) => `<li><i style="background:${colorFor(id)}"></i><b>${esc(name)}</b><span>${esc(char)}</span><em class="${ok ? 'ok' : ''}">${state}</em></li>`;
  const rows = [row(net.id, net.name + ' (tú)', d.name || '', 'Aquí', true)];
  let playing = 0;
  for (const p of net.players.values()) {
    if (p.playing) playing++;
    const direct = m && m.peers.get(p.id) && m.peers.get(p.id).direct;
    rows.push(row(p.id, p.name, (p.desc && p.desc.name) || '', p.playing ? '🎮 Jugando' + (direct ? '' : ' ·') : 'En el menú', p.playing));
  }
  $('mpPlayers').innerHTML = rows.join('');
  $('mpReady').textContent = '¡Entrar en Guareña!';
  $('mpReady').classList.remove('on');
  $('mpHint').textContent = playing ? `${playing === 1 ? 'Hay 1 jugador' : `Hay ${playing} jugadores`} en Guareña ahora mismo: aparecerás a su lado. ${game.input.isTouch ? '💬' : 'T'} para hablar.`
    : 'Ahora mismo no hay nadie más jugando. Entra igualmente: en cuanto llegue alguien, os veréis por la calle y en el mapa.';
}
async function copyText(t, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
  }
  if (btn) { const old = btn.textContent; btn.textContent = ok ? '¡Copiado!' : 'Cópialo a mano'; btn.classList.toggle('ok', ok); setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1600); }
}
async function startMulti(late) {
  const net = game.net, d = mpDesc();
  // joining a game in progress: wait a moment for the others' positions, to appear beside one of them
  let near = null;
  if (late) {
    $('mpStatus').textContent = 'Entrando en la partida…';
    for (let i = 0; i < 25 && !(near = net.spawnNearOthers()); i++) await new Promise((r) => setTimeout(r, 100));
  }
  audio.unlock();
  removePreview();
  for (const id of ['menu', 'select', 'pause', 'mp']) $(id).hidden = true;
  $('hud').hidden = false;
  ui.touch.classList.add('playing');
  const tc = $('tChat'); if (tc) tc.hidden = !game.input.isTouch;
  mode = 'play';
  game.input.wantLock = true;
  game.input.requestLock();
  game.pendingMode = 'normal'; setModeSel('normal');
  let at = near;
  if (!at) at = game.meetPoint(Math.max(0, (net.order || []).indexOf(net.id)));
  game.start(d, { at });
  const others = [...net.players.values()].filter((p) => p.playing).map((p) => p.name);
  setTimeout(() => game.hud.notify(others.length ? `🎮 ¡Estáis en Guareña con ${others.join(', ')}! ${game.input.isTouch ? '💬' : 'T'} para hablar.` : '🎮 Partida multijugador', 'gold', 7), 700);
  announcePerk(d);
}
function leaveMultiToMenu() {
  if (game.net.inGame) game.net.menu();
  const tc = $('tChat'); if (tc) tc.hidden = true;
}

// a reminder of what the chosen character is good at, a moment after the game starts
function announcePerk(d) {
  const pk = PERKS[d.id];
  if (pk && game.hud) setTimeout(() => game.hud.notify(`★ ${d.name} · ${pk.title}: ${pk.lines[0].toLowerCase()}.`, 'gold', 6), 2500);
}
function openPause() {
  if (game.state !== 'play') return;
  game.state = 'paused';
  mode = 'paused';
  game.input.exitLock();
  audio.pauseAll(true);
  $('pause').hidden = false;
  $('pCancel').hidden = !game.missions.active; // nothing to give up otherwise
  $('pOnline').hidden = game.net.active; // (already playing with others)
  showPanel('stats');
  $('pResume').focus();
}
// the pause box doubles as the menu's Controls / Settings page: there «Volver» goes back to the menu
let pauseLike = false;
const PAUSE_ONLY = ['pMap', 'pChars', 'pCancel', 'pOnline', 'pMenu'];
function resume() {
  if (pauseLike) {
    pauseLike = false;
    $('pResume').textContent = 'Continuar';
    $('pTitle').textContent = 'Pausa';
    for (const id of PAUSE_ONLY) $(id).hidden = false;
    $('pCancel').hidden = !game.missions.active; $('pOnline').hidden = game.net.active;
    $('pause').hidden = true;
    showMenu();
    return;
  }
  $('pause').hidden = true;
  game.state = 'play';
  mode = 'play';
  audio.pauseAll(false);
  game.input.requestLock();
}
function showPanel(kind) {
  const P = $('pPanel');
  const g = game;
  if (kind === 'stats') {
    const m = g.missions;
    const rows = m.defs.map((d) => {
      const done = m.done.has(d.id), open = !d.requires || m.done.has(d.requires);
      return `<div><span>${d.letter} · ${d.title}</span><span class="${done ? 'ok' : open ? '' : 'lock'}">${done ? 'Superada' : open ? d.giver.name : 'Bloqueada'}</span></div>`;
    }).join('');
    P.innerHTML = `<h3>Tu Guareña</h3>
      <div class="stats">
        <div class="stat"><b>${Math.round(g.player.money).toLocaleString('es-ES')} €</b><span>Dinero</span></div>
        <div class="stat"><b>${m.done.size}/${m.defs.length}</b><span>Misiones</span></div>
        <div class="stat"><b>${m.treasureFound}/${m.treasureTotal}</b><span>Tesoros de Tarteso</span></div>
        <div class="stat"><b>${g.sky.timeString}</b><span>Hora</span></div>
      </div>
      <h3>Misiones</h3><div class="missionList">${rows}</div>
      <h3 style="margin-top:16px">Ajustes</h3>${settingsHtml()}
      <h3 style="margin-top:16px">Controles</h3>${controlsHtml()}`;
    bindSettings();
  }
}
function settingsHtml() {
  const q = game.qKey;
  const times = [['Mañana', 10], ['Tarde', 17], ['Atardecer', 19.9], ['Noche', 23]];
  return `
    <div class="setting"><span>Calidad gráfica <small style="opacity:.6">(se aplica al recargar)</small></span><span class="seg" id="sQ">${Object.entries(QUALITY).map(([k, v]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${v.name}</button>`).join('')}</span></div>
    <div class="setting"><span>Estética <small style="opacity:.6">(Manga y Acuarela al momento; Realista y Diorama al recargar)</small></span><span class="seg" id="sLook">${[...LOOKS.map((l) => [l.id, l.id === 'acuarela' ? 'Acuarela' : l.name]), ['real', 'Realista'], ['diorama', 'Diorama']].map(([id, n]) => `<button data-look="${id}" class="${(STYLE.anime ? (game.toon && game.toon.look) || 'manga' : STYLE.name) === id ? 'on' : ''}">${n}</button>`).join('')}</span></div>
    <div class="setting"><span>Resolución <small style="opacity:.6">(automática: baja un poco solo si el juego va a tirones)</small></span><span class="seg" id="sR"><button data-r="auto" class="${game.save.dynRes !== false ? 'on' : ''}">Automática</button><button data-r="fija" class="${game.save.dynRes === false ? 'on' : ''}">Fija</button></span></div>
    <div class="setting"><span>Hora del día</span><span class="seg" id="sT">${times.map(([n, h]) => `<button data-h="${h}">${n}</button>`).join('')}</span></div>
    ${STYLE.anime ? `<div class="setting"><span>Música lo-fi <small style="opacity:.6">(suena bajito mientras paseas)</small></span><span class="seg" id="sL"><button data-l="on" class="${game.save.lofi !== false ? 'on' : ''}">Sí</button><button data-l="off" class="${game.save.lofi === false ? 'on' : ''}">No</button></span></div>` : ''}
    <div class="setting"><span>Música (radio)</span><input id="sMus" type="range" min="0" max="1" step="0.05" value="${game.save.music ?? 0.55}"></div>
    <div class="setting"><span>Efectos</span><input id="sSfx" type="range" min="0" max="1" step="0.05" value="${game.save.sfx ?? 0.9}"></div>
    <div class="setting"><span>Sensibilidad del ratón</span><input id="sSens" type="range" min="0.3" max="2.5" step="0.1" value="${game.cam.sens}"></div>`;
}
function bindSettings() {
  document.querySelectorAll('#sQ button').forEach((b) => (b.onclick = () => {
    game.setQuality(b.dataset.q);
    document.querySelectorAll('#sQ button').forEach((x) => x.classList.toggle('on', x === b));
    // it takes a reload: offer it right there (the HUD notice is not visible from the title menu)
    const seg = $('sQ'); let rl = $('sQReload');
    if (b.dataset.q !== game.qKey) {
      if (!rl) { rl = document.createElement('button'); rl.id = 'sQReload'; rl.className = 'btn ghost'; rl.style.cssText = 'margin-left:8px;padding:6px 12px;font-size:14px'; rl.textContent = 'Recargar ahora'; rl.onclick = () => { game.persist(); location.reload(); }; seg.after(rl); }
    } else if (rl) rl.remove();
  }));
  document.querySelectorAll('#sS button').forEach((b) => (b.onclick = () => {
    game.save.style = b.dataset.s; game.persist();
    document.querySelectorAll('#sS button').forEach((x) => x.classList.toggle('on', x === b));
    const seg = $('sS'); let rl = $('sSReload');
    if (b.dataset.s !== STYLE.name) {
      if (!rl) { rl = document.createElement('button'); rl.id = 'sSReload'; rl.className = 'btn ghost'; rl.style.cssText = 'margin-left:8px;padding:6px 12px;font-size:14px'; rl.textContent = 'Recargar ahora'; rl.onclick = () => { game.persist(); location.reload(); }; seg.after(rl); }
    } else if (rl) rl.remove();
  }));
  document.querySelectorAll('#sLook button').forEach((b) => (b.onclick = () => {
    // Manga and Acuarela are the anime look's own (they change at once); Realista and Diorama are built differently
    // from the start: those take a reload
    const id = b.dataset.look, base = id === 'real' || id === 'diorama' ? id : 'anime';
    if (base === 'anime') game.save.look = id;
    game.save.style = base; game.persist();
    document.querySelectorAll('#sLook button').forEach((x) => x.classList.toggle('on', x === b));
    const seg = $('sLook'); let rl = $('sLookReload');
    if (base === STYLE.name) { if (game.toon) game.toon.setLook(id); if (game.state !== 'play') game.render(); if (rl) rl.remove(); return; }
    if (!rl) { rl = document.createElement('button'); rl.id = 'sLookReload'; rl.className = 'btn ghost'; rl.style.cssText = 'margin-left:8px;padding:6px 12px;font-size:14px'; rl.textContent = 'Recargar ahora'; rl.onclick = () => { game.persist(); location.reload(); }; seg.after(rl); }
  }));
  document.querySelectorAll('#sR button').forEach((b) => (b.onclick = () => { game.save.dynRes = b.dataset.r === 'auto'; game.persist(); document.querySelectorAll('#sR button').forEach((x) => x.classList.toggle('on', x === b)); }));
  document.querySelectorAll('#sL button').forEach((b) => (b.onclick = () => { game.save.lofi = b.dataset.l === 'on'; game.persist(); document.querySelectorAll('#sL button').forEach((x) => x.classList.toggle('on', x === b)); }));
  document.querySelectorAll('#sT button').forEach((b) => (b.onclick = () => { game.sky.hour = parseFloat(b.dataset.h); game.sky.update(0, game.camera.position, true); game.render(); }));
  const mus = $('sMus'), sfx = $('sSfx'), sens = $('sSens');
  if (mus) mus.oninput = () => { game.save.music = +mus.value; audio.setVolumes({ music: +mus.value }); game.persist(); };
  if (sfx) sfx.oninput = () => { game.save.sfx = +sfx.value; audio.setVolumes({ sfx: +sfx.value }); game.persist(); };
  if (sens) sens.oninput = () => { game.cam.sens = +sens.value; game.save.sens = +sens.value; game.persist(); };
}
function controlsHtml() {
  // the published page cannot reach outside radio streams (only the desktop folder can)
  const live = !(game && game.fm && game.fm.closed);
  const realFm = live ? 'las reales de la zona en directo: SER Vegas Altas, Onda Cero Mérida, COPE, RNE, Canal Extremadura…' : 'aquí, las tres del juego; las reales de la zona se oyen en la versión del ordenador';
  if (game?.input?.isTouch) return `<dl class="keys">
    <dt>Joystick</dt><dd>Andar · girar el volante (arriba acelera si no pulsas nada)</dd>
    <dt>Arrastrar a la derecha</dt><dd>Mover la cámara</dd>
    <dt>Correr · Saltar · Golpe</dt><dd>A pie (con un arma, <b>Disparar</b> apunta solo al más cercano)</dd>
    <dt>Agachar</dt><dd>Ir en sigilo: haces menos ruido y cuesta más verte (detrás de coches y contenedores no te ven)</dd>
    <dt>Arma</dt><dd>Cambiar de arma (puños, bate, pistola, subfusil, escopeta, rifle de caza con mira)</dd>
    <dt>Aviso en pantalla</dt><dd>Tócalo para hablar, vacilar, amenazar, atracar, entrar en bares y tiendas o empezar el taxi y la patrulla</dd>
    <dt>Gas · Freno · Derrape</dt><dd>Al volante (Freno mantenido = marcha atrás)</dd>
    <dt>Subir / Bajar</dt><dd>Entrar o salir del vehículo (roba el que quieras)</dd>
    <dt>Radio · Claxon</dt><dd>Siguiente emisora (${realFm}) · pitar (doble toque: sirena en patrullas). En el 📱, la app <b>Radio</b> mueve el dial a mano</dd>
    <dt>Mapa · II</dt><dd>Mapa con GPS · pausa</dd>
  </dl>`;
  return `<dl class="keys">
    <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Andar / conducir</dd>
    <dt><kbd>Shift</kbd></dt><dd>Esprintar</dd>
    <dt><kbd>Espacio</kbd></dt><dd>Saltar · freno de mano (derrape)</dd>
    <dt><kbd>F</kbd> / <kbd>Intro</kbd></dt><dd>Subir o bajar del vehículo (roba el que quieras)</dd>
    <dt><kbd>E</kbd></dt><dd>Interactuar: hablar, vacilar, amenazar, atracar, bares, armería, pedir trabajo en los comercios, llamar a las puertas (agachado: colarte), coger objetos · en taxi o patrulla, empezar el turno</dd>
    <dt>Clic izq.</dt><dd>Golpear · disparar (sin apuntar, apunta solo al más cercano)</dd>
    <dt>Clic der. (mantener)</dt><dd>Apuntar por encima del hombro</dd>
    <dt>Rueda · <kbd>Q</kbd> · <kbd>1</kbd>–<kbd>6</kbd></dt><dd>Cambiar de arma (en el coche, la rueda aleja la cámara)</dd>
    <dt><kbd>R</kbd></dt><dd>Recargar · en el coche, siguiente emisora (<kbd>Shift</kbd>+<kbd>R</kbd> la anterior; después de la última, apagada). ${live ? 'Son las emisoras reales que se oyen en Guareña, en directo por internet, y tres del juego (91.1, 96.4, 105.2).' : 'Aquí suenan las tres del juego (91.1, 96.4, 105.2); las reales de Guareña, en directo, en la versión del ordenador.'} Con el móvil (<kbd>Tab</kbd> → Radio) sintonizas a mano con ←/→, también andando</dd>
    <dt><kbd>H</kbd></dt><dd>Claxon</dd>
    <dt>Ratón</dt><dd>Cámara</dd>
    <dt><kbd>C</kbd> / <kbd>Ctrl</kbd></dt><dd>A pie: agacharse (sigilo; detrás de coches y contenedores no te ven) · en el coche: mirar atrás</dd>
    <dt><kbd>V</kbd></dt><dd>A pie: primera/tercera persona (en el coche: cerca/lejos)</dd>
    <dt><kbd>L</kbd></dt><dd>Luces del coche</dd>
    <dt><kbd>G</kbd></dt><dd>Sirena (en patrullas)</dd>
    <dt><kbd>M</kbd></dt><dd>Mapa y GPS</dd>
    <dt><kbd>Tab</kbd></dt><dd>Móvil: mapa, mensajes, llamar a tus amigos (mantén <kbd>B</kbd> para hablar), enviar tu ubicación, trabajos, inventario, cámara y menú · <kbd>Esc</kbd> vuelve atrás</dd>
    <dt><kbd>I</kbd></dt><dd>Inventario: comer, colocar muebles en tu casa, la caña de pescar, lo que vas a vender (<kbd>Q</kbd>/<kbd>E</kbd> cambian de pestaña)</dd>
    <dt><kbd>T</kbd></dt><dd>Multijugador: escribir en el chat (Intro para enviar)</dd>
    <dt><kbd>Esc</kbd> / <kbd>P</kbd></dt><dd>Pausa</dd>
  </dl>
  <h3 style="margin:14px 0 6px">Mando (se detecta solo al pulsar cualquier botón)</h3>
  <dl class="keys">
    <dt>Stick izq. · stick der.</dt><dd>Andar / conducir · cámara</dd>
    <dt>A · X · B · Y</dt><dd>Esprintar (mantener) · saltar (apuntando: recargar) · golpear · subir o bajar del vehículo</dd>
    <dt>Gatillos RT · LT</dt><dd>Acelerar · frenar y marcha atrás (a pie: disparar · apuntar)</dd>
    <dt>RB · LB</dt><dd>Arma siguiente · anterior (en coche: freno de mano) · en una llamada, LB para hablar</dd>
    <dt>L3 · R3</dt><dd>Agacharse (en coche: claxon; dos veces seguidas, la sirena de las patrullas) · mirar atrás</dd>
    <dt>Cruceta ▲ ▼ ◀ ▶</dt><dd>Móvil · cámara 1.ª/3.ª persona · radio · interactuar (el aviso de pantalla)</dd>
    <dt>Back · Start</dt><dd>Mapa · pausa</dd>
    <dt>En los menús</dt><dd>Cruceta o stick para moverte, A para elegir, B para volver</dd>
  </dl>`;
}

// ------------------------------------------------------------ wiring
const MODE_DESC = {
  normal: 'El Guareña de siempre: misiones, coches, armas, bares, taxi y patrulla por sus calles reales.',
  zombis: 'Anochece y los muertos salen a las calles de Guareña. Sobrevive a oleadas cada vez más grandes con lo que encuentres. Ganas 10 € por cada zombi.',
};
let selMode = 'normal';
function setModeSel(m) {
  selMode = MODE_DESC[m] ? m : 'normal';
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === selMode));
  $('modeDesc').textContent = MODE_DESC[selMode];
  playLabel();
  if (game) { game.pendingMode = selMode; game.save.modePref = selMode; game.persist(); }
}
// with a character already chosen, Play goes straight in with them: say so
function playLabel() {
  const who = game && game.save && game.save.custom && game.save.custom.name;
  const base = who ? 'Continuar' : 'Jugar';
  $('bPlay').textContent = selMode === 'normal' ? (who ? `Continuar · ${who}` : 'Jugar') : `${base} · Zombis`;
}

// ------------------------------------------------------------ menus with the gamepad (and Esc to go back)
// The top visible screen gets spatial navigation: D-pad / left stick move the focus, A presses, B goes back.
const BACK = { select: 'bBack', mp: 'mpBack', shop: 'shopClose', mapScreen: 'mClose', pause: 'pResume', editor: 'edBack', inv: 'invClose' };
function topScreen() { const v = [...document.querySelectorAll('.screen')].filter((s) => !s.hidden && s.id !== 'loading'); return v[v.length - 1] || null; }
function focusables(root) { return [...root.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && !e.hidden && e.offsetParent !== null); }
function menuBack() {
  const s = topScreen();
  if (!s) return false;
  const id = BACK[s.id];
  const b = id && $(id);
  if (b && !b.hidden) { b.click(); return true; }
  return false;
}
function moveFocus(dx, dy) {
  const s = topScreen();
  if (!s) return;
  const els = focusables(s);
  if (!els.length) return;
  const cur = document.activeElement && s.contains(document.activeElement) ? document.activeElement : null;
  if (!cur) { (els.find((e) => e.classList.contains('primary')) || els[0]).focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const e of els) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
    const along = x * dx + y * dy;
    if (along <= 4) continue;
    const across = Math.abs(x * dy - y * dx);
    const sc = along + across * 2.2;
    if (sc < bs) { bs = sc; best = e; }
  }
  if (best) { best.focus(); audio && audio.sfx('ui_click', { vol: 0.4 }); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' }); }
}
function startMenuPad() {
  let prev = [], rep = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const s = topScreen();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp || !s || (game && game.state === 'play' && s.id !== 'pause')) { prev = gp ? gp.buttons.map((b) => b.pressed) : []; return; }
    const hit = (i) => gp.buttons[i] && gp.buttons[i].pressed && !prev[i];
    // the big map moves with the stick and marks destinations with A itself (hud.mapPad); here only B closes it
    if (s.id === 'mapScreen') { if (hit(1)) menuBack(); prev = gp.buttons.map((b) => b.pressed); return; }
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    rep -= 1;
    if (editor && s.id === 'editor') editor.pad(gp, 1 / 60);
    const act = document.activeElement;
    if (act && act.type === 'range' && s.contains(act) && (hit(14) || hit(15))) {
      const st = parseFloat(act.step) || 0.1, v = Math.min(parseFloat(act.max), Math.max(parseFloat(act.min), parseFloat(act.value) + (hit(15) ? st : -st)));
      act.value = String(v); act.dispatchEvent(new Event('input', { bubbles: true }));
      prev = gp.buttons.map((b) => b.pressed);
      return;
    }
    const stick = Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6;
    if (hit(12) || (stick && ay < -0.6 && rep <= 0)) { moveFocus(0, -1); rep = 12; }
    else if (hit(13) || (stick && ay > 0.6 && rep <= 0)) { moveFocus(0, 1); rep = 12; }
    else if (hit(14) || (stick && ax < -0.6 && rep <= 0)) { moveFocus(-1, 0); rep = 12; }
    else if (hit(15) || (stick && ax > 0.6 && rep <= 0)) { moveFocus(1, 0); rep = 12; }
    if (!stick) rep = 0;
    if (hit(0)) { const f = document.activeElement; if (f && s.contains(f) && f.click) f.click(); else moveFocus(0, 1); }
    if (hit(1)) menuBack();
    prev = gp.buttons.map((b) => b.pressed);
  };
  requestAnimationFrame(loop);
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    const s = topScreen();
    if (!s || s.id === 'pause' || s.id === 'menu' || document.activeElement && document.activeElement.tagName === 'INPUT') return; // pause has its own
    if (menuBack()) e.preventDefault();
  });
}

// put the chosen character in the running game (same place, same everything else)
function swapCharacter(d) {
  const p = game.player;
  if (p.char && p.char.desc && JSON.stringify(p.char.desc) === JSON.stringify(d)) return; // already wearing it
  const ch = game.chars.create(d);
  const vis = p.char.object.visible;
  p.setCharacter(ch);
  p.char.object.visible = vis;
  p.syncChar();
  if (game.net.active) game.net.profile(mpName(), d);
}
function applyInGame(d) {
  game.save.custom = d; game.persist();
  removePreview();
  swapCharacter(d);
  $('select').hidden = true; $('hud').hidden = false;
  game.state = 'play'; mode = 'play'; audio.pauseAll(false);
  game.input.requestLock();
  announcePerk(d);
}
function wire() {
  startMenuPad();
  editor = new Editor(game, audio, {
    preview: (d) => showPreview(d),
    done: (d) => {
      editor.close();
      previewDesc = d; game.save.custom = d; game.persist();
      if (selReturn === 'mp') { selReturn = null; $('bStart').textContent = '¡A Guareña!'; removePreview(); game.net.profile(mpName(), mpDesc()); openMulti(); return; }
      if (selReturn === 'game') { selReturn = null; $('bStart').onclick = null; applyInGame(d); return; }
      startGame();
    },
    back: () => { editor.close(); mode = 'select'; $('select').hidden = false; renderCards(); updatePreview(); },
  });
  const click = (id, fn) => $(id).addEventListener('click', () => { audio.unlock(); audio.sfx('ui_click'); fn(); });
  document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => { audio.unlock(); audio.sfx('ui_select'); setModeSel(b.dataset.mode); }));
  setModeSel(game.save.modePref || 'normal');
  ui.onMenu = () => { $('hEnd').hidden = true; game.state = 'paused'; game.persist(); showMenu(); };
  click('bPlay', () => { if (STYLE.anime) { previewDesc = { ...PLAYER_PRESETS[0] }; startGame(); } else if (game.save.custom) { previewDesc = { ...game.save.custom }; startGame(); } else openSelect(); });
  click('bMulti', openMulti);
  click('mpBack', () => { game.net.leave(); showMenu(); });
  click('mpReady', () => { const net = game.net; if (net.online && !net.connected) { if (!net.connecting) net.connect(mpName(), mpDesc()).then(renderMulti); renderMulti(); return; } const playing = [...net.players.values()].some((p) => p.playing); net.setReady(net.online || playing ? true : !net.ready); });
  click('mpCopyRoom', () => copyText(game.net.inviteLink(), $('mpCopyRoom')));
  click('mpPrivate', () => game.net.switchRoom(newRoomCode(), mpName(), mpDesc()).then(renderMulti));
  click('mpPublic', () => game.net.switchRoom(null, mpName(), mpDesc()).then(renderMulti));
  click('pOnline', () => { $('pause').hidden = true; game.state = 'paused'; game.persist(); openMulti(); });
  click('mpChangeChar', () => { selReturn = 'mp'; $('mp').hidden = true; openSelect(); $('bStart').textContent = 'Elegir'; });
  click('mpCopyLan', () => copyText($('mpLan').textContent, $('mpCopyLan')));
  click('mpMakeNet', () => { const i = game.net.info; if (i && i.internet) copyText(i.internet, $('mpMakeNet')); else game.net.makeInternetLink(); });
  $('mpName').addEventListener('input', () => { game.save.mpName = $('mpName').value.trim().slice(0, 20); game.persist(); clearTimeout(wire.nameT); wire.nameT = setTimeout(() => { game.net.profile(mpName(), mpDesc()); renderMulti(); }, 400); });
  $('mpName').addEventListener('keydown', (e) => e.stopPropagation());
  click('bChars', openSelect);
  click('bControls', () => { $('menu').hidden = true; openPauseLike(controlsHtml(), 'Controles'); });
  click('bSettings', () => { $('menu').hidden = true; openPauseLike(settingsHtml(), 'Ajustes'); bindSettings(); });
  click('bStart', () => {
    previewDesc = currentDesc(); game.save.custom = previewDesc; game.persist();
    if (selReturn === 'mp') { selReturn = null; $('bStart').textContent = '¡A Guareña!'; removePreview(); game.net.profile(mpName(), mpDesc()); openMulti(); return; }
    startGame();
  });
  click('bBack', () => {
    if (selReturn === 'mp') { selReturn = null; $('bStart').textContent = '¡A Guareña!'; removePreview(); openMulti(); }
    else if (selReturn === 'game') { selReturn = null; $('bStart').onclick = null; removePreview(); $('select').hidden = true; $('hud').hidden = false; game.state = 'play'; mode = 'play'; audio.pauseAll(false); game.input.requestLock(); }
    else showMenu();
  });
  $('tabM').onclick = () => { selGender = 'm'; selIdx = 0; custom = {}; audio.sfx('ui_select'); renderCards(); updatePreview(); };
  $('tabF').onclick = () => { selGender = 'f'; selIdx = 0; custom = {}; audio.sfx('ui_select'); renderCards(); updatePreview(); };
  $('tabU').onclick = () => { selGender = 'u'; selIdx = 0; custom = {}; audio.sfx('ui_select'); renderCards(); updatePreview(); };
  click('bCreate', () => openEditor(currentDesc()));
  click('pResume', resume);
  click('pMap', () => { $('pause').hidden = true; game.state = 'map'; mode = 'play'; audio.pauseAll(false); game.hud.toggleMap(true); });
  click('pChars', () => { $('pause').hidden = true; game.state = 'paused'; openSelectInGame(); });
  click('pCancel', () => { game.missions.cancel(); resume(); });
  click('pMenu', () => { $('pause').hidden = true; game.state = 'paused'; game.persist(); leaveMultiToMenu(); showMenu(); });
  click('mClose', () => { game.hud.toggleMap(false); game.state = 'play'; game.input.requestLock(); });
  addEventListener('keydown', (e) => {
    if ((mode === 'paused' || pauseLike) && (e.code === 'Escape' || (e.code === 'KeyP' && !pauseLike)) && !$('pause').hidden) { e.preventDefault(); resume(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && game.state === 'play') openPause(); if (document.hidden) savePos(); });
  // closing the tab: keep the last seconds of play too (the autosave runs every 10 s)
  const savePos = () => { try { const p = game.player; if (p && game.state !== 'loading' && !game.interior && !game.map.buildingAt(p.pos.x, p.pos.z) && (mode === 'play' || mode === 'paused')) game.save.pos = { x: p.pos.x, z: p.pos.z }; game.persist(); } catch (e) { /* storage unavailable */ } };
  addEventListener('pagehide', savePos);
  const sens = game.save.sens; if (sens) game.cam.sens = sens;
  audio.setVolumes({ music: game.save.music ?? 0.55, sfx: game.save.sfx ?? 0.9 });
}
function openPauseLike(html, title) {
  mode = 'menu';
  pauseLike = true;
  $('pause').hidden = false;
  for (const id of PAUSE_ONLY) $(id).hidden = true;
  $('pTitle').textContent = title;
  $('pPanel').innerHTML = html;
  $('pResume').textContent = 'Volver';
  $('pResume').focus();
}
function openSelectInGame() {
  mode = 'select';
  $('hud').hidden = true;
  $('select').hidden = false;
  renderCards();
  updatePreview();
  selReturn = 'game';
  $('bStart').onclick = () => {
    audio.sfx('ui_click');
    selReturn = null;
    $('bStart').onclick = null;
    applyInGame(currentDesc());
  };
}

// hot-reload aware boot
const hot = window.claude?.hot;
const go = (data) => boot(data || {}).then(wire).catch((e) => {
  console.error(e);
  $('loadText').textContent = 'No se pudo cargar el juego: ' + (e && e.message ? e.message : e) + '. Comprueba que tu navegador tiene WebGL2 activado.';
});
if (hot?.ready) hot.ready(go); else go(hot?.data ?? {});
