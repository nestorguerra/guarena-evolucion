// Multijugador: jugar con amigos en el mismo Guareña. Quien invita abre servidor.py (carpeta «multijugador») y el juego
// se sirve desde su ordenador; los demás abren su enlace en el navegador. Aquí: la conexión (WebSocket, o sondeo HTTP
// si un túnel no deja pasar WebSocket), la sala (quién está y quién está listo), la salida juntos desde la Plaza de
// España y, ya en la calle, los demás jugadores: andan, corren, conducen, disparan, hablan y salen en el radar.
// Cada navegador simula su propio tráfico, peatones y policía; se comparten los jugadores, sus coches, sus disparos,
// el chat, la hora del día (la de quien abrió la sala) y los destinos marcados en el mapa.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { buildGun } from './gunmodels.js';
import { GunRig } from './gunrig.js';
import { MODELS } from './vehicles.js';
import { clamp, lerp, wrapAngle } from './util.js';
import { Mesh, onlinePossible, roomFromHash, ONLINE_MAX } from './online.js';

const SEND_DT = 1 / 12;   // state updates per second
const DELAY = 0.15;       // remote players are drawn this far in the past, between two known states
export const MP_COLORS = ['#4fc3f7', '#ff8a65', '#aed581', '#ba68c8', '#ffd54f', '#4db6ac', '#f06292', '#90a4ae'];
export const colorFor = (id) => MP_COLORS[((id || 1) - 1) % MP_COLORS.length];
const r2 = (v) => Math.round((v || 0) * 100) / 100, r3 = (v) => Math.round((v || 0) * 1000) / 1000;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function waitFor(fn, ms) { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await sleep(50); return fn(); }
// what travels of a character description (the look, not the texts)
export function slimDesc(d) {
  const o = {};
  for (const [k, v] of Object.entries(d || {})) if (k !== 'bio' && v !== undefined && (typeof v !== 'object' || (k === 'start' && v))) o[k] = v;
  return o;
}
const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

export class Net {
  constructor(game) {
    this.game = game;
    this.available = null; this.info = null;
    this.connected = false; this.connecting = false; this.transport = null; this.ws = null; this.sid = null;
    this.id = null; this.hostId = null; this.started = false; this.order = [];
    this.players = new Map(); // id -> { id, name, desc, ready, playing }
    this.remotes = new Map(); // id -> Remote (the other players in the street)
    this.inGame = false; this.ready = false;
    this.listeners = new Set();
    this.outbox = []; this.sendT = 0; this.hudT = 0;
    this.name = 'Jugador'; this.desc = null;
    this.lastWp = null; this.remoteWp = null; this.hostHour = null;
    this.chat = { open: false, lines: [] };
    // online (from GitHub, no server of ours): the room in the link (#sala-XXXXX), or the public one everybody shares
    this.mesh = null; this.room = roomFromHash(); this.invited = !!this.room; this.onlineError = false;
    this.bindChat();
    addEventListener('beforeunload', () => { if (this.mesh) this.mesh.bye(); });
    addEventListener('pagehide', () => {
      if (this.mesh) this.mesh.bye();
      if (this.sid) { try { navigator.sendBeacon('/mp/leave', JSON.stringify({ sid: this.sid })); } catch (e) { /* gone */ } }
    });
  }
  get online() { return !!(this.info && this.info.online); }
  // the link that brings a friend into this room
  inviteLink() { return location.origin + location.pathname + (this.room ? '#sala-' + this.room : ''); }
  // another room (a private one, or back to the public one): out of this one and into that
  async switchRoom(code, name, desc) {
    if (this.mesh || this.connected) this.leave();
    this.room = code || null;
    try { history.replaceState(null, '', location.pathname + location.search + (this.room ? '#sala-' + this.room : '')); } catch (e) { /* sandboxed */ }
    this.info = { online: true, room: this.room, max: ONLINE_MAX };
    this.emit('lobby');
    return this.connect(name, desc);
  }
  get active() { return this.connected && this.inGame; }
  get isHost() { return this.connected && this.id != null && this.hostId === this.id; }
  get isLocalHost() { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, data) { for (const fn of [...this.listeners]) { try { fn(kind, data); } catch (e) { console.warn('net', e); } } }

  // ------------------------------------------------------------ is this page served by the Guareña server?
  async probe() {
    if (this.online && this.available) return true;
    if (!/^https?:$/.test(location.protocol)) return (this.available = false);
    try {
      const r = await fetch('/mp/info', { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      this.info = j && j.guarena ? j : null;
    } catch (e) { this.info = null; }
    // no Guareña server behind this page (GitHub Pages): online, browser to browser
    if (!this.info && onlinePossible()) this.info = { online: true, room: this.room, max: ONLINE_MAX };
    return (this.available = !!this.info);
  }
  // ask the server for a public link (a tunnel); the lobby shows it as soon as it is ready
  async makeInternetLink() {
    try { await fetch('/mp/tunnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { /* offline */ }
    for (let i = 0; i < 40; i++) {
      await this.probe();
      this.emit('info');
      if (!this.info || this.info.tunnel === 'on' || this.info.tunnel === 'error') return;
      await sleep(1500);
    }
  }

  // ------------------------------------------------------------ connection
  async connect(name, desc) {
    if (this.connected || this.connecting) return this.connected;
    this.connecting = true; this.fullError = false;
    this.name = name; this.desc = desc;
    const hello = { t: 'hello', name, desc: slimDesc(desc) };
    try {
      if (this.online) await this.openMesh(name, desc);
      else {
        try { this.useWS(await this.openWS()); this.send(hello); }
        catch (e) { await this.openPoll(hello); }
        await waitFor(() => this.connected || this.fullError, 7000);
      }
    } catch (e) { this.transport = null; }
    this.connecting = false;
    this.emit('lobby');
    return this.connected;
  }
  openWS() {
    return new Promise((resolve, reject) => {
      let ws, done = false;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { reject(e); return; }
      const fail = () => { if (done) return; done = true; clearTimeout(to); try { ws.close(); } catch (e) { /* closed */ } reject(new Error('ws')); };
      const to = setTimeout(fail, 4500);
      ws.onopen = () => { if (done) return; done = true; clearTimeout(to); resolve(ws); };
      ws.onerror = fail;
    });
  }
  async openMesh(name, desc) {
    this.onlineError = false;
    const mesh = new Mesh((m) => { if (this.mesh === mesh) this.recv(m); }, () => this.emit('lobby'));
    this.mesh = mesh; this.transport = 'mesh';
    try { await mesh.start(this.room || 'plaza', name, slimDesc(desc)); }
    catch (e) { if (this.mesh === mesh) { this.mesh = null; this.transport = null; } this.onlineError = true; }
  }
  useWS(ws) {
    this.ws = ws; this.transport = 'ws';
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.recv(m); };
    ws.onclose = () => { if (this.ws === ws) this.lost(); };
  }
  async openPoll(hello) {
    const r = await fetch('/mp/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hello }) });
    if (!r.ok) throw new Error('join');
    const j = await r.json();
    this.sid = j.sid; this.transport = 'poll';
    this.pollLoop(j.sid);
  }
  async pollLoop(sid) {
    let fails = 0;
    while (this.sid === sid && this.transport === 'poll') {
      const out = this.outbox.splice(0);
      try {
        const r = await fetch('/mp/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, out }) });
        if (r.status === 410) { if (this.sid === sid) this.lost(); return; }
        const j = await r.json();
        fails = 0;
        for (const m of j.in || []) this.recv(m);
      } catch (e) {
        this.outbox.unshift(...out.filter((m) => m.t !== 'st'));
        if (++fails > 14) { if (this.sid === sid) this.lost(); return; }
      }
      await sleep(this.inGame ? 60 : 250);
    }
  }
  send(obj) {
    if (this.transport === 'mesh') { if (this.mesh) this.mesh.send(obj); }
    else if (this.transport === 'ws') { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
    else if (this.transport === 'poll') {
      if (obj.t === 'st') for (let i = this.outbox.length - 1; i >= 0; i--) if (this.outbox[i].t === 'st') this.outbox.splice(i, 1);
      this.outbox.push(obj);
      if (this.outbox.length > 200) this.outbox.splice(0, this.outbox.length - 200);
    }
  }
  // leave the room (back to the menu from the lobby, or the page closes)
  leave() {
    const sid = this.sid, ws = this.ws, mesh = this.mesh;
    this.transport = null; this.ws = null; this.sid = null; this.mesh = null;
    if (mesh) mesh.close();
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* closed */ } }
    if (sid) { try { navigator.sendBeacon ? navigator.sendBeacon('/mp/leave', JSON.stringify({ sid })) : fetch('/mp/leave', { method: 'POST', body: JSON.stringify({ sid }) }); } catch (e) { /* gone */ } }
    this.reset();
    this.emit('lobby');
  }
  reset() {
    this.connected = false; this.inGame = false; this.ready = false; this.started = false;
    this.id = null; this.hostId = null; this.players.clear();
    this.clearRemotes();
    this.outbox.length = 0;
  }
  lost() {
    const wasIn = this.inGame;
    this.transport = null; this.ws = null; this.sid = null;
    this.reset();
    this.closeChat();
    if (wasIn && this.game.hud) this.game.hud.notify('Se ha perdido la conexión con la partida multijugador. Sigues jugando por tu cuenta.', 'info', 7);
    this.emit('lost');
    this.emit('lobby');
  }

  // ------------------------------------------------------------ room
  profile(name, desc) {
    this.name = name; this.desc = desc;
    if (this.connected) this.send({ t: 'profile', name, desc: slimDesc(desc) });
  }
  setReady(on) { this.ready = !!on; this.send({ t: 'ready', on: this.ready }); this.emit('lobby'); }
  // back to the main menu from a multiplayer game: the others stop seeing us until we come back
  menu() {
    if (!this.connected) return;
    this.send({ t: 'menu' });
    this.inGame = false; this.ready = false;
    this.clearRemotes();
    this.closeChat();
    this.emit('lobby');
  }
  addPlayer(p) { if (p && p.id !== this.id) this.players.set(p.id, { id: p.id, name: p.name, desc: p.desc, ready: !!p.ready, playing: !!p.playing }); }
  recv(m) {
    const g = this.game;
    switch (m.t) {
      case 'welcome':
        this.id = m.id; this.hostId = m.host; this.started = !!m.started; this.connected = true;
        this.players.clear();
        for (const p of m.players || []) this.addPlayer(p);
        this.emit('lobby');
        break;
      case 'join':
        this.addPlayer(m.p);
        if (this.inGame && g.hud) g.hud.notify(`👋 ${m.p.name} ha llegado a la sala`, 'ok', 5);
        this.emit('lobby');
        break;
      case 'profile': {
        const p = this.players.get(m.id);
        if (p) { p.name = m.name; p.desc = m.desc; }
        const r = this.remotes.get(m.id);
        if (r) r.setProfile(m.name, m.desc);
        this.emit('lobby');
        break;
      }
      case 'ready': {
        const p = this.players.get(m.id);
        if (p) { p.ready = !!m.on; if (m.playing !== undefined) p.playing = !!m.playing; }
        if (m.playing === false) { if (this.remotes.has(m.id) && this.inGame && g.hud && p) g.hud.notify(`${p.name} ha vuelto al menú`, 'info', 4); this.removeRemote(m.id); }
        if (p && m.playing === true && this.inGame && g.hud) g.hud.notify(`🚶 ${p.name} ya está en Guareña`, 'ok', 5);
        this.emit('lobby');
        break;
      }
      case 'start':
        this.started = true;
        this.order = m.order || [];
        for (const id of this.order) { const p = this.players.get(id); if (p) p.playing = true; }
        if (!this.inGame) { this.inGame = true; this.emit('start', { late: !!m.late }); }
        break;
      case 'st':
        if (m.hr != null && m.id === this.hostId) this.hostHour = m.hr;
        if (this.inGame) { const r = this.remoteFor(m.id); if (r) r.push(m); }
        break;
      case 'ev':
        if (this.inGame) this.event(m);
        break;
      case 'leave': {
        const p = this.players.get(m.id);
        this.players.delete(m.id);
        this.removeRemote(m.id);
        if (p && this.inGame && g.hud) g.hud.notify(`${p.name} se ha ido de la partida`, 'info', 5);
        this.emit('lobby');
        break;
      }
      case 'host': this.hostId = m.id; this.emit('lobby'); break;
      case 'link': // the internet link changed (free links get renewed now and then): only the host shares it
        if (this.isLocalHost) {
          this.info = { ...(this.info || {}), internet: m.url, tunnel: 'on', tunnelError: null };
          if (this.inGame && g.hud) g.hud.notify(`🌍 Enlace por internet para tus amigos: ${m.url}`, 'info', 10);
          this.emit('info');
        }
        break;
      case 'full': this.fullError = true; this.emit('lobby'); break;
    }
  }
  nameOf(id) { return id === this.id ? this.name : (this.players.get(id) || {}).name || 'Alguien'; }

  // ------------------------------------------------------------ the other players in the street
  remoteFor(id) {
    let r = this.remotes.get(id);
    if (r) return r;
    const p = this.players.get(id);
    if (!p || !p.desc) return null;
    r = new Remote(this, p);
    this.remotes.set(id, r);
    return r;
  }
  removeRemote(id) { const r = this.remotes.get(id); if (r) { r.dispose(); this.remotes.delete(id); } }
  clearRemotes() { for (const r of this.remotes.values()) r.dispose(); this.remotes.clear(); this.hudList(); }
  // a friend's car close enough to hop in as the passenger
  rideCandidate(x, z) {
    let best = null, bd = 4.2;
    for (const r of this.remotes.values()) {
      const v = r.car;
      if (!v || v.dead || !r.visibleHere) continue;
      const d = Math.hypot(v.x - x, v.z - z) - v.hw;
      if (d < bd) { bd = d; best = { v, id: r.id, name: r.name }; }
    }
    return best;
  }
  // where a latecomer appears: beside a friend who is walking in the street, if there is one
  spawnNearOthers() {
    for (const r of this.remotes.values()) {
      const s = r.last;
      if (!s || s.in || s.m !== 'f') continue;
      const fx = Math.sin(s.h), fz = Math.cos(s.h);
      const x = s.x - fz * 1.4, z = s.z + fx * 1.4;
      if (!this.game.map.buildingAt(x, z)) return { x, z, heading: s.h };
    }
    return null;
  }

  // ------------------------------------------------------------ per frame (while playing)
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = Math.max(0, this.sendT + SEND_DT); this.sendState(); }
    const now = performance.now() / 1000;
    for (const r of this.remotes.values()) r.update(dt, now);
    // the time of day follows whoever opened the room
    if (!this.isHost && this.hostHour != null) {
      const d = ((this.hostHour - g.sky.hour + 36) % 24) - 12;
      if (Math.abs(d) > 0.5) g.sky.hour = this.hostHour;
      else g.sky.hour = (g.sky.hour + d * Math.min(1, dt * 0.8) + 24) % 24;
    }
    // a pin on the map is shared with everybody
    const wp = g.hud.waypoint;
    if (wp !== this.lastWp) {
      if (wp !== this.remoteWp) this.send({ t: 'ev', k: 'wp', x: wp ? r2(wp.x) : null, z: wp ? r2(wp.z) : null });
      this.lastWp = wp;
    }
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.4; this.hudList(); }
  }
  sendState() {
    const g = this.game, p = g.player, W = g.weapons, v = p.vehicle;
    const cur = g.interiors && g.interiors.house ? g.interiors.current : null;
    const st = {
      t: 'st', ts: r3(performance.now() / 1000), x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), h: r3(p.heading), s: r2(Math.hypot(p.vel.x, p.vel.z)),
      g: p.grounded ? 1 : 0, vy: r2(p.vel.y), tr: r2(p.turnRate || 0), md: r2(p.moveDir || 0),
      m: p.mode === 'car' ? 'c' : p.mode === 'passenger' ? 'p' : p.mode === 'dead' ? 'd' : p.mode === 'busted' ? 'b' : p.knock ? (p.char.gettingUp ? 'u' : 'k') : p.mode === 'sit' ? 's' : p.mode === 'hidden' ? 'h' : 'f',
      cr: p.crouch ? 1 : 0,
      w: W ? W.cur : 'punos', a: W && W.aiming ? 1 : 0, pi: r2(g.cam.pitch || 0), in: cur ? cur.seed || 1 : 0,
    };
    if (cur && cur.x !== undefined) { st.dx = r2(cur.x); st.dz = r2(cur.z); }
    if (v) st.car = { m: v.model, c: v.color, sp: v.fromSpot ?? -1, x: r2(v.x), z: r2(v.z), h: r3(v.heading), v: r2(v.speed), st: r3(v.steer), b: r2(v.brake), hp: Math.round(v.health), s: v.siren ? 1 : 0, d: v.dead ? 1 : 0, pt: r3(v.pitch), rl: r3(v.roll) };
    if (p.mode === 'passenger' && p.ride) st.ride = p.ride.id;
    if (this.isHost) st.hr = r3(g.sky.hour);
    this.send(st);
  }
  // shots and punches are shown (and heard) by the others; they do not hurt anybody on their screens
  shot(w, o, e) { if (this.active) this.send({ t: 'ev', k: 'shot', w, ox: r2(o.x), oy: r2(o.y), oz: r2(o.z), ex: r2(e.x), ey: r2(e.y), ez: r2(e.z) }); }
  punch(side, bat) { if (this.active) this.send({ t: 'ev', k: 'punch', side: side ? 1 : 0, bat: bat ? 1 : 0 }); }
  event(m) {
    const g = this.game, r = this.remotes.get(m.id), who = this.nameOf(m.id);
    if (m.k === 'chat') { const txt = String(m.text || '').slice(0, 140); this.chatLine(who, txt, colorFor(m.id)); if (r) r.say(txt); }
    else if ((m.k === 'loc' || m.k === 'call' || m.k === 'voice') && g.phone) g.phone.onEvent(m, who);
    else if (m.k === 'radio' && g.fm) g.fm.onShared(m, m.id);
    else if (m.k === 'shot' && r) r.shot(m);
    else if (m.k === 'punch' && r) r.punch(m);
    else if (m.k === 'wp') {
      if (m.x == null) { if (g.hud.waypoint && g.hud.waypoint === this.remoteWp) { g.hud.waypoint = null; g.hud.route = null; } this.remoteWp = null; }
      else {
        g.hud.waypoint = { x: +m.x, z: +m.z }; g.hud.route = null; g.hud.routeT = 0;
        this.remoteWp = this.lastWp = g.hud.waypoint;
        g.hud.notify(`📍 ${who} ha marcado un destino en el mapa`, 'info', 4);
      }
    }
  }
  // who is around, top-right under the money
  hudList() {
    const el = document.getElementById('mpHud');
    if (!el) return;
    if (!this.active) { el.hidden = true; return; }
    const p = this.game.player, rows = [];
    for (const r of this.remotes.values()) {
      const s = r.last;
      let where = '…';
      if (s) {
        const myIn = this.game.interiors && this.game.interiors.house ? this.game.interiors.current?.seed || 1 : 0;
        if (s.in && s.in !== myIn) where = 'en una casa';
        else { const x = s.car ? s.car.x : s.x, z = s.car ? s.car.z : s.z; where = Math.round(Math.hypot(x - p.pos.x, z - p.pos.z)) + ' m'; }
        if (s.m === 'c') where = p.mode === 'passenger' && p.ride && p.ride.id === r.id ? 'vas de copiloto' : where + ' · al volante';
        else if (s.m === 'p' && s.ride === this.id) where = 'va contigo en el coche';
      }
      rows.push(`<div><i style="background:${r.color}"></i>${esc(r.name)} <small>${where}</small></div>`);
    }
    for (const q of this.players.values()) {
      if (this.remotes.has(q.id)) continue;
      rows.push(`<div class="off"><i style="background:${colorFor(q.id)}"></i>${esc(q.name)} <small>${q.playing ? 'llegando…' : 'en el menú'}</small></div>`);
    }
    el.innerHTML = rows.length ? rows.join('') : '<div class="off"><i></i>Esperando a tus amigos…</div>';
    el.hidden = false;
  }

  // ------------------------------------------------------------ chat (T to write, Intro to send)
  bindChat() {
    const form = document.getElementById('chatForm'), input = document.getElementById('chatIn');
    if (!form || !input) return;
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyT' && !this.chat.open && this.active && this.game.state === 'play' && document.activeElement !== input) { e.preventDefault(); this.openChat(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const txt = input.value.trim().slice(0, 140);
      if (txt && this.active) { this.send({ t: 'ev', k: 'chat', text: txt }); this.chatLine(this.name, txt, colorFor(this.id)); }
      this.closeChat();
    });
    input.addEventListener('keydown', (e) => { if (e.code === 'Escape') { e.preventDefault(); this.closeChat(); } e.stopPropagation(); });
    input.addEventListener('blur', () => setTimeout(() => this.closeChat(), 50));
    const tb = document.getElementById('tChat');
    if (tb) tb.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.active) this.openChat(); }, { passive: false });
  }
  openChat() {
    const form = document.getElementById('chatForm'), input = document.getElementById('chatIn'), inp = this.game.input;
    if (!form) return;
    this.chat.open = true;
    inp.enabled = false; inp.keys.clear(); inp.exitLock();
    form.hidden = false; input.value = '';
    setTimeout(() => input.focus(), 0);
  }
  closeChat() {
    const form = document.getElementById('chatForm'), input = document.getElementById('chatIn');
    if (!this.chat.open || !form) return;
    this.chat.open = false;
    form.hidden = true; input.blur();
    const inp = this.game.input;
    inp.enabled = true;
    if (this.game.state === 'play') inp.requestLock();
  }
  chatLine(who, text, color) {
    const log = document.getElementById('chatLog');
    if (!log) return;
    const el = document.createElement('div');
    const b = document.createElement('b'); b.textContent = who + ': '; b.style.color = color || '#fff';
    el.appendChild(b); el.appendChild(document.createTextNode(text));
    log.appendChild(el);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, 14000);
    this.game.audio.sfx('text_msg');
  }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------- canvas sprites (name tag, speech bubble)
function tagSprite(name, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const x = c.getContext('2d');
  x.font = '800 58px "Barlow Condensed", "Arial Narrow", sans-serif';
  const w = Math.min(500, x.measureText(name).width + 70);
  const x0 = (512 - w) / 2;
  x.fillStyle = 'rgba(10,12,16,0.72)';
  x.beginPath(); x.roundRect(x0, 14, w, 84, 42); x.fill();
  x.fillStyle = color; x.beginPath(); x.arc(x0 + 38, 56, 13, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fbfaf6'; x.textBaseline = 'middle'; x.fillText(name, x0 + 60, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.renderOrder = 20; s.scale.set(1.6, 0.35, 1);
  return s;
}
function bubbleSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const x = c.getContext('2d');
  x.font = '600 34px "Barlow", system-ui, sans-serif';
  const words = text.split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > 440 && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const L = lines.slice(0, 3);
  const h = 30 + L.length * 42;
  x.fillStyle = 'rgba(251,250,246,0.95)';
  x.beginPath(); x.roundRect(16, 4, 480, h, 26); x.fill();
  x.beginPath(); x.moveTo(236, h + 2); x.lineTo(256, h + 26); x.lineTo(276, h + 2); x.fill();
  x.fillStyle = '#16181d'; x.textAlign = 'center'; x.textBaseline = 'top';
  L.forEach((l, i) => x.fillText(l, 256, 20 + i * 42));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.renderOrder = 21; s.scale.set(2.2, 0.86, 1); s.center.set(0.5, 0);
  return s;
}

// ---------------------------------------------------------------- a remote player
class Remote {
  constructor(net, p) {
    this.net = net; this.g = net.game; this.id = p.id;
    this.name = p.name || 'Jugador'; this.desc = p.desc; this.color = colorFor(p.id);
    this.buf = []; this.offs = []; this.off = null; this.last = null;
    this.char = null; this.car = null; this.gun = null; this.gunId = null; this.rig = new GunRig();
    this.lastShot = -9; this.visibleHere = false; this.pose = null;
    this.tag = tagSprite(this.name, this.color); this.tag.visible = false; this.g.scene.add(this.tag);
    this.bubble = null; this.bubbleT = 0;
    this.makeChar();
  }
  makeChar() {
    const g = this.g;
    if (this.char) { g.scene.remove(this.char.object); this.char.dispose(); }
    this.char = g.chars.create({ ...(this.desc || {}) });
    this.char.object.visible = false;
    this.char.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scene.add(this.char.object);
    this.gunId = null; this.gun = null;
  }
  setProfile(name, desc) {
    if (name !== this.name) { this.name = name; this.g.scene.remove(this.tag); this.tag.material.map.dispose(); this.tag = tagSprite(name, this.color); this.g.scene.add(this.tag); }
    if (!same(desc, this.desc)) { this.desc = desc; this.makeChar(); }
  }
  push(m) {
    const now = performance.now() / 1000;
    if (!Number.isFinite(m.ts)) m.ts = now - (this.off || 0);
    // sender clock → our clock: the smallest delay seen lately is the offset (network jitter only ever adds to it)
    this.offs.push(now - m.ts);
    if (this.offs.length > 40) this.offs.shift();
    this.off = Math.min(...this.offs);
    // states are kept in the sender's time, so bursts and late arrivals slot in without being thrown away
    if (this.buf.length && m.ts <= this.buf[this.buf.length - 1].ts) return;
    // how often their states come (5 a second when they reach us through the online relay, 12 directly)
    if (this.buf.length) { const d = m.ts - this.buf[this.buf.length - 1].ts; if (d > 0 && d < 2) this.gap = this.gap ? this.gap * 0.9 + d * 0.1 : d; }
    this.buf.push(m);
    if (this.buf.length > 40) this.buf.shift();
    this.last = m;
  }
  update(dt, now) {
    const g = this.g, net = this.net;
    if (!this.buf.length) return;
    const t = now - this.off - Math.max(DELAY, Math.min(0.6, (this.gap || 0) * 1.3 + 0.03)); // in the sender's clock
    let a = this.buf[0], b = null;
    for (let i = this.buf.length - 1; i >= 0; i--) if (this.buf[i].ts <= t) { a = this.buf[i]; b = this.buf[i + 1] || null; break; }
    const k = b ? clamp((t - a.ts) / Math.max(1e-3, b.ts - a.ts), 0, 1) : 0;
    const s = b && k > 0.5 ? b : a; // discrete fields from the nearer state
    let x = a.x, y = a.y, z = a.z, h = a.h, sp = a.s;
    if (b) { x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k); z = lerp(a.z, b.z, k); h = a.h + wrapAngle(b.h - a.h) * k; sp = lerp(a.s, b.s, k); }
    else if (a.m === 'f') { const e = Math.min(0.35, t - a.ts); if (e > 0) { x += Math.sin(a.h) * a.s * e; z += Math.cos(a.h) * a.s * e; } }
    // same place? (both in the street, or both inside the same house)
    const myIn = g.interiors && g.interiors.house ? g.interiors.current?.seed || 1 : 0;
    const here = (s.in || 0) === myIn;
    const inCar = s.m === 'c' || s.m === 'p';
    this.visibleHere = here;
    // --- the car they drive
    if (s.m === 'c' && s.car && here && !myIn) this.driveCar(a.car || s.car, b && b.car, k, dt);
    else if (this.car) this.releaseCar();
    // --- the body
    const ch = this.char;
    // on a friend's motorbike or bicycle we see them riding it; riding with them, we see them at the wheel
    const meP = g.player;
    const withMe = s.m === 'c' && this.car && meP.mode === 'passenger' && meP.ride && meP.ride.id === this.id;
    const bike = s.m === 'c' && this.car && here && (this.car.spec.twoWheel || withMe);
    if (bike) {
      const v = this.car, info = g.fleet.renderer.info(v.model), tw = v.spec.twoWheel, bici = v.spec.shape === 'bici', sc = ch.scale || 1;
      const lx = tw ? 0 : info.seat.x || 0.38;
      const sy = tw ? info.seat.y - (bici ? 0.64 : 0.5) * sc : info.seat.y + 0.1 - 0.49 * sc, sz = info.seat.z, r = v.roll, pt = v.pitch, hh = v.heading;
      const x1 = lx * Math.cos(r) - sy * Math.sin(r), y1 = lx * Math.sin(r) + sy * Math.cos(r), y2 = y1 * Math.cos(pt) - sz * Math.sin(pt), z2 = y1 * Math.sin(pt) + sz * Math.cos(pt);
      ch.object.visible = true;
      const pose = !tw ? 'drive' : bici ? 'bici' : 'moto';
      if (this.pose !== pose) { this.pose = pose; ch.setBase(pose); }
      ch.object.rotation.order = 'YXZ'; ch.object.rotation.set(pt, hh, r);
      ch.object.position.set(v.x + x1 * Math.cos(hh) + z2 * Math.sin(hh), 0.02 + y2, v.z - x1 * Math.sin(hh) + z2 * Math.cos(hh));
      ch.pedal = (ch.pedal || 0) + (Math.max(0, v.speed) / (v.spec.wr || 0.34)) * dt * 0.42;
      ch.steer = v.steer || 0; // the wheel turns in their hands
      ch.update(dt, 0, { fidget: false });
    } else if (ch.object.rotation.order === 'YXZ') { ch.object.rotation.order = 'XYZ'; ch.object.rotation.set(0, 0, 0); }
    ch.object.visible = bike || (here && !inCar && s.m !== 'h');
    // knocked down or dead: their body falls here too (a ragdoll of our own, thrown the way they were going), and
    // gets up when they do
    if (ch.object.visible && !bike && (s.m === 'd' || s.m === 'k' || (s.m === 'u' && ch.rag))) {
      if (!ch.rag && !this.ragged && s.m !== 'u') {
        this.ragged = true; this.pose = null; ch.setBase(null);
        ch.object.rotation.order = 'XYZ'; ch.object.position.set(x, y, z); ch.object.rotation.set(0, h, 0); ch.object.updateMatrixWorld(true);
        const col = g.map.collider, v = this.lastV || [0, 0];
        ch.ragdoll({ vel: [v[0], 1.2, v[1]], up: 0.5, tone: 0.6, dead: s.m === 'd', env: { floor: () => y, collide: (pp, r) => col.resolveCircle(pp, r) } });
      }
      if (ch.rag && s.m === 'u') ch.getUp();
      if (ch.rag) { ch.ragDead = s.m === 'd'; ch.update(dt, 0, {}); }
    }
    if (ch.object.visible && !bike && !ch.rag) {
      if (s.m !== 'd' && s.m !== 'k') this.ragged = false;
      if (ch.gettingUp) { ch.object.position.set(ch.object.position.x, y, ch.object.position.z); ch.update(dt, 0, {}); }
      else {
      ch.object.position.set(x, y, z);
      const pose = s.m === 'b' ? 'handsup' : s.m === 's' ? 'sitTalk' : null;
      if (pose !== this.pose) { this.pose = pose; ch.setBase(pose); ch.object.rotation.x = 0; }
      ch.object.rotation.y = h;
      if (s.w !== this.gunId) this.setGun(s.w);
      const posed = ch.update(dt, pose ? 0 : sp, { grounded: !!s.g, vy: s.vy, turn: s.tr, fidget: s.w === 'punos' && !s.a && !s.cr, crouch: !!s.cr, moveDir: s.md || 0 });
      // (the aim on top of the pose, only when the pose was worked out: claymation poses 12 times a second)
      this.rigDt = (this.rigDt || 0) + dt;
      if (posed !== false) { if (this.gun && !this.gunMelee) this.rig.update(this.rigDt, ch, this.gun, !!s.a || now - this.lastShot < 1, s.pi || 0, {}); this.rigDt = 0; }
      }
    }
    // (how fast they were going, for a fall)
    if (b && b.ts > a.ts) { const it = 1 / (b.ts - a.ts); this.lastV = [(b.x - a.x) * it, (b.z - a.z) * it]; }
    // --- name tag over the head (or over the car), bigger with distance so it stays readable
    const cam = g.camera.position;
    let tx = x, ty = y + 2.05 * ch.scale, tz = z;
    if (s.m === 'c' && this.car) { tx = this.car.x; tz = this.car.z; ty = this.car.spec.H + 0.7; }
    else if (s.m === 'p') {
      const drv = s.ride === net.id ? g.player.vehicle : net.remotes.get(s.ride)?.car;
      if (drv) { tx = drv.x; tz = drv.z; ty = drv.spec.H + 1.1; }
    }
    const d = Math.hypot(tx - cam.x, ty - cam.y, tz - cam.z);
    const me = g.player, ridingWith = me.mode === 'passenger' && me.ride && me.ride.id === this.id;
    const showTag = here && d > 3 && d < 160 && !(s.m === 'p' && s.ride === net.id) && !ridingWith;
    this.tag.visible = showTag;
    if (showTag) { this.tag.position.set(tx, ty, tz); const sc = clamp(d * 0.045, 0.9, 5); this.tag.scale.set(sc * 1.6, sc * 0.35, 1); }
    // riding with us
    if ((s.m === 'p' && s.ride === net.id) !== !!this.withUs) {
      this.withUs = s.m === 'p' && s.ride === net.id;
      g.hud.notify(this.withUs ? `🚗 ${this.name} se ha subido de copiloto` : `${this.name} se ha bajado del coche`, 'ok', 3);
    }
    if (this.bubble) {
      this.bubbleT -= dt;
      const on = this.bubbleT > 0 && showTag && d < 45;
      this.bubble.visible = on;
      if (on) { this.bubble.position.set(tx, ty + 0.25 * clamp(d * 0.045, 0.9, 5), tz); const sc = clamp(d * 0.05, 1, 3.2); this.bubble.scale.set(2.2 * sc, 0.86 * sc, 1); }
      if (this.bubbleT <= 0) { g.scene.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble = null; }
    }
    // --- radar / map: in the street, or at the door of the house they went into
    let bx = s.car && s.m === 'c' ? s.car.x : x, bz = s.car && s.m === 'c' ? s.car.z : z;
    if (s.in && !myIn && s.dx !== undefined) { bx = s.dx; bz = s.dz; }
    g.hud.setBlip('mp' + this.id, { x: bx, z: bz, label: (this.name[0] || '?').toUpperCase(), color: this.color, name: this.name, edge: true, hidden: !!myIn && !here });
  }
  // their car, drawn from the same parked car of our town when they took one (every town parks the same cars)
  driveCar(c, c2, k, dt) {
    const g = this.g, f = g.fleet;
    if (this.car && (this.car.removed || this.car.model !== c.m)) this.releaseCar();
    if (!this.car) {
      let v = null;
      if (c.sp >= 0 && f.spots[c.sp]) {
        const spot = f.spots[c.sp];
        spot.taken = true;
        if (spot.vehicle && !spot.vehicle.driver && !spot.vehicle.remote) { v = spot.vehicle; spot.vehicle = null; v.spot = null; }
      }
      if (!v && MODELS[c.m]) v = f.spawn(c.m, c.x, c.z, c.h, typeof c.c === 'string' ? c.c : '#8a929a', {});
      if (!v) return;
      v.remote = true; v.remoteId = this.id; v.driver = 'remote'; v.keep = true; v.sleeping = false; v.parked = false; v.ai = null;
      this.car = v;
    }
    const v = this.car;
    let x = c.x, z = c.z, h = c.h, spd = c.v;
    if (c2) { x = lerp(c.x, c2.x, k); z = lerp(c.z, c2.z, k); h = c.h + wrapAngle(c2.h - c.h) * k; spd = lerp(c.v, c2.v, k); }
    v.x = x; v.z = z; v.heading = h; v.speed = spd;
    v.vx = Math.sin(h) * spd; v.vz = Math.cos(h) * spd; v.w = 0;
    v.steer = c.st || 0; v.brake = c.b || 0; v.throttle = 0; v.siren = !!c.s;
    v.pitch = c.pt || 0; v.roll = c.rl || 0;
    v.health = c.hp ?? v.health;
    if (c.d && !v.dead) f.explode(v);
    v.spin += (spd / (v.spec.wr || 0.32)) * dt;
  }
  releaseCar() {
    const v = this.car;
    this.car = null;
    if (!v || v.removed) return;
    v.remote = false; v.remoteId = null; v.driver = null; v.keep = false;
    v.throttle = 0; v.brake = 1; v.handbrake = 1; v.steerIn = 0; v.siren = false;
    v.sleeping = false;
    const p = this.g.player;
    if (p.mode === 'passenger' && p.ride && p.ride.v === v) p.leaveRide();
  }
  setGun(id) {
    const ch = this.char;
    if (this.gun && this.gun.parent) this.gun.parent.remove(this.gun);
    this.gun = null; this.gunId = id; this.gunMelee = false;
    if (!id || id === 'punos' || !WEAPONS[id]) return;
    const m = buildGun(id);
    if (!m) return;
    if (WEAPONS[id].melee) { m.position.set(0.02, -0.072, 0); m.rotation.x = 0.64; if (ch.bones.handR) ch.bones.handR.add(m); this.gunMelee = true; }
    else { m.matrixAutoUpdate = false; ch.object.add(m); this.rig.ready = 0; }
    this.gun = m;
  }
  shot(m) {
    const g = this.g;
    if (!this.visibleHere) return;
    const d = WEAPONS[m.w] || WEAPONS.pistola;
    g.effects.muzzle(m.ox, m.oy, m.oz, Math.sin(this.last ? this.last.h : 0), Math.cos(this.last ? this.last.h : 0));
    const dx = m.ex - m.ox, dy = m.ey - m.oy, dz = m.ez - m.oz, l = Math.hypot(dx, dy, dz) || 1;
    g.effects.muzzleStar(m.ox, m.oy, m.oz, dx / l, dy / l, dz / l, 0.8);
    g.weapons.tracers.add(m.ox, m.oy, m.oz, m.ex, m.ey, m.ez);
    g.audio.sfx(d.sfx || 'shot_pistol', { x: m.ox, z: m.oz });
    this.lastShot = performance.now() / 1000;
    this.rig.shot(d.kick || 0.5);
  }
  punch(m) {
    if (!this.visibleHere) return;
    this.char.play(m.bat ? 'bat' : m.side ? 'punch' : 'punch2', m.bat ? 0.6 : 0.42);
    const s = this.last;
    if (s) this.g.audio.sfx(m.bat ? 'bat_swing' : 'punch', { x: s.x, z: s.z });
  }
  say(text) {
    if (this.bubble) { this.g.scene.remove(this.bubble); this.bubble.material.map.dispose(); }
    this.bubble = bubbleSprite(text);
    this.bubble.visible = false;
    this.g.scene.add(this.bubble);
    this.bubbleT = Math.min(9, 3 + text.length * 0.08);
  }
  dispose() {
    const g = this.g;
    this.releaseCar();
    if (this.gun && this.gun.parent) this.gun.parent.remove(this.gun);
    g.scene.remove(this.char.object); this.char.dispose();
    g.scene.remove(this.tag); this.tag.material.map.dispose();
    if (this.bubble) { g.scene.remove(this.bubble); this.bubble.material.map.dispose(); }
    g.hud.removeBlip('mp' + this.id);
  }
}
