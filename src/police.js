// Wanted level & law enforcement: Policía Local (1–2 estrellas) and Guardia Civil (3+).
// The police only chase what they see. Every car and officer has a field of view: shorter at night, much shorter if
// you are crouched, blocked by buildings and (keeping low) by parked cars and containers. When they lose you they drive
// to the last place you were seen and comb the streets around it; officers get out, look behind things and open
// containers. Hide (a container, a house) or get far away and the stars go out; if they saw you go in, they know.
// Cars chase over the real street graph (A*), ram at high levels; officers arrest on foot.
import * as THREE from 'three';
import { driveToward, lanePoint, followRoute, turnSpeed } from './traffic.js';
import { clamp, dampAngle, lerp, wrapAngle } from './util.js';
import { PERK } from './perks.js';

const UNITS = [0, 1, 2, 3, 4, 5];
export const COP_DESC = {
  local: { gender: 'm', skin: 1, hair: 0, hairStyle: 'rapado', top: '#1f2d4d', topStyle: 'shirt', bottom: '#1c2336', bottomStyle: 'pants', shoes: '#111111', accessory: 'gorra', accessoryColor: '#1a2240', build: 1.05, uniform: true },
  gc: { gender: 'm', skin: 2, hair: 0, hairStyle: 'corto', top: '#4f6b3a', topStyle: 'shirt', bottom: '#3f5530', bottomStyle: 'pants', shoes: '#111111', accessory: 'gorra', accessoryColor: '#3b5230', build: 1.08, uniform: true },
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// how much each crime raises the heat; which ones the police learn about at once (their own, alarms)
const ADD = { atropello: 1, agresion: 0.6, carjack: 1, breakin: 1, policia: 1.2, explosion: 1.4, disparo: 0.7, homicidio: 2.2, atraco: 1, vandalismo: 0.3, policia_muerto: 3.2, atraco_tienda: 2.2, atraco_joyeria: 3, atraco_banco: 4.6, allanamiento: 1.4, hurto: 0.8, cadaver: 0.8 };
const DIRECT = new Set(['policia', 'policia_muerto', 'atraco_tienda', 'atraco_joyeria', 'atraco_banco']);
const CRIME_NAME = { agresion: 'agresión', homicidio: 'homicidio', atropello: 'atropello con fuga', atraco: 'atraco a mano armada', carjack: 'robo de un coche', disparo: 'disparos', explosion: 'una explosión', breakin: 'robo de un coche', allanamiento: 'allanamiento de morada', hurto: 'un hurto', cadaver: 'una persona herida en la calle', vandalismo: 'vandalismo' };
// the radio (📻, shown to the player like a scanner) and what the officers say out loud
const RADIO = {
  lost: ['📻 ¡{Lo|La} hemos perdido! ¿Dónde está?', '📻 {Sospechoso|Sospechosa} fuera de vista. Último avistamiento: {s}.', '📻 ¿Alguien {lo|la} ve? Se nos ha escapado por {s}.'],
  search: ['📻 Peinad la zona, no puede estar lejos.', '📻 Sin rastro en {s}. Seguid buscando.', '📻 Mirad detrás de los coches y en los portales.', '📻 Revisad los contenedores de {s}.', '📻 Que nadie baje la guardia: tiene que estar por aquí.'],
  found: ['📻 ¡{Lo|La} tengo! ¡{Sospechoso|Sospechosa} a la vista en {s}!', '📻 ¡Ahí está! ¡Vamos, vamos!', '📻 ¡{Localizado|Localizada}! Todas las unidades a {s}.'],
  house: ['📻 Se ha metido en una casa de {s}. Vigilad las salidas.', '📻 ¡Ha entrado en una vivienda de {s}! Rodead la manzana.'],
  outside: ['📻 Seguimos fuera de la casa. Que no salga nadie sin que {lo|la} veamos.', '📻 Unidades en posición en {s}. Esperamos a que salga.'],
  cont: ['📻 ¡Se ha metido en un contenedor de {s}!'],
  raid: ['📻 ¡Guardia Civil! ¡Salga con las manos en alto! ¡Vamos a entrar!'],
  give: ['📻 Nada. Se ha esfumado. Volvemos a patrulla.', '📻 Dejamos la búsqueda. Todas las unidades, a sus zonas.'],
};
const SAY = {
  lost: ['¿Dónde está?', '¿Dónde se ha metido?', '¡Se ha escapado!', '¡{Lo|La} he perdido!'],
  search: ['¿Dónde está?', 'Por aquí no está…', 'Ha tenido que ir por aquí.', 'Sal de donde estés…', 'Sé que estás por aquí.', 'Mira detrás de los coches.'],
  found: ['¡Ahí está!', '¡Alto! ¡Policía!', '¡{Quieto|Quieta}!', '¡Te veo!'],
  cont: ['A ver aquí dentro…', '¿Habrá alguien aquí?'],
  contNo: ['Aquí no hay nadie.', 'Nada… solo basura.', 'Puaj. Aquí no está.'],
  contYes: ['¡Te pillé! ¡Sal de ahí!', '¡Fuera del contenedor!'],
  sawCont: ['¡Se ha metido en el contenedor!', '¡{Lo|La} he visto! ¡Está en el contenedor!'],
};

export class Police {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.wanted = 0;
    this.heat = 0;
    this.searchT = 0;
    this.seen = false;
    this.seenNow = null;   // who can see you (last perception pass)
    this.lookT = 0;
    this.lkp = { x: 0, z: 0 };   // last known position
    this.lkv = { x: 0, z: 0 };   // and the way you were going
    this.lostT = 0;              // time since anyone saw you
    this.lostN = 0;              // bumps every time they lose you (units and officers re-plan)
    this.lostSaid = false;
    this.chatterT = 6;
    this.hideSpot = null;        // they saw you get into a container or a house
    this.lastOnFoot = true;
    this.saidAt = {};
    this.units = [];
    this.officers = [];
    this.spawnT = 0;
    this.bustT = 0;
    this.lastCrimeT = -99;
    this.calls = new Set();      // witnesses phoning it in right now
    this.tmp = {};
    this.sid = 1;
  }

  // ------------------------------------------------------------ crimes
  // Like GTA V: the police only hear about what somebody sees. Crimes against them, and alarms, reach them at once;
  // anything else needs a witness who phones it in (a few seconds: stop them and nobody calls). With nobody looking —
  // or doing it quietly — nothing happens. A victim who is still on their feet may call too, a while later.
  // opts: { victim, silent (a quiet takedown: the victim cannot call), direct (they know at once) }
  crime(type, x, z, opts = {}) {
    const g = this.game;
    if (g.state !== 'play' || (g.mode && g.mode !== 'normal')) return;
    // inside a house: the neighbours call it in from the street door
    const inHouse = g.interior && g.interiors && g.interiors.current && g.interiors.current.x !== undefined;
    if (inHouse) { x = g.interiors.current.x; z = g.interiors.current.z; }
    if (inHouse) {
      // in a house: against the police (they are right there) or whoever lives here and sees it
      if (DIRECT.has(type) || opts.direct) { this.report(type, x, z, null, true); this.hideSpot = { kind: 'house', obj: g.interiors.current }; this.resetRaid(); }
      else g.interiors.onCrime(type, opts);
      return;
    }
    const direct = opts.direct || DIRECT.has(type);
    const mem = g.census && g.census.memoria;
    if (mem) { try { const loud0 = type === 'disparo' || type === 'explosion' || type === 'breakin'; mem.event(type, x, z, [opts.victim, ...g.peds.witnesses({ loud: loud0, victim: opts.victim })].filter(Boolean)); } catch (e) { /* (the town remembers what it can) */ } }
    if (direct || this.observe(true)) { this.report(type, x, z, null, true); return; }
    const loud = type === 'disparo' || type === 'explosion' || type === 'breakin';
    const ws = g.peds.witnesses({ loud, victim: opts.victim });
    // on the run already: people point you out straight away
    if (this.wanted > 0) { if (ws.length) this.report(type, x, z, ws[0]); else this.heat += (ADD[type] ?? 1) * 0.3; return; }
    // Carmen: people look the other way
    const callers = ws.filter((p) => Math.random() < 0.9 * PERK.witness);
    if (callers.length) {
      if (this.calls.size < 2 && !callers.some((p) => this.calls.has(p))) g.peds.startCall(callers[0], type, x, z);
      if (ws.length > 2 && this.calls.size < 2 && callers[1]) g.peds.startCall(callers[1], type, x, z, 2 + Math.random() * 2);
      return;
    }
    // nobody saw it: the victim, if still standing, may call once they are safe
    const v = opts.victim;
    if (v && !opts.silent && !v.dead && Math.random() < 0.55 * PERK.witness) g.peds.startCall(v, type, x, z, 4 + Math.random() * 4);
  }
  // someone found lying in the street: one car comes to have a look (no stars: only what they see counts)
  investigate(x, z) {
    const g = this.game;
    if (this.wanted > 0 || this.inv) return;
    this.inv = { x, z, t: 0, dur: 45, n: (this.invN = (this.invN || 0) + 1), spawned: false };
    const st = this.streetAt(x, z);
    g.hud && g.hud.notify(`📻 Central: persona herida${st ? ' en ' + st : ''}. Una unidad, acuda a investigar.`, 'police', 5);
    g.audio.sfx('radio');
  }
  // the police hear about a crime (a witness's call, an alarm, their own eyes)
  report(type, x, z, caller = null, known = null) {
    const g = this.game;
    if (g.state !== 'play' || (g.mode && g.mode !== 'normal')) return;
    if (type === 'cadaver') { this.investigate(x, z); return; }
    this.heat += ADD[type] ?? 1;
    const lvl = Math.min(5, Math.max(this.wanted, this.heat >= 7 ? 4 : this.heat >= 4.5 ? 3 : this.heat >= 2 ? 2 : 1));
    const min = { policia: 2, policia_muerto: 3, homicidio: 2, atraco_tienda: 2, atraco_joyeria: 2, atraco_banco: 3 }[type] || 0;
    // what they know: where you are right now if the caller can still see you (or they saw it themselves)
    const T = this.targetPos(), p = g.player;
    if (known === null) known = !!caller && !caller.dead && !p.hideIn && !g.interior && Math.hypot(caller.x - T.x, caller.z - T.z) < 45 && this.map.collider.raycast(caller.x, caller.z, T.x, T.z, 1.6, 1.2) > 0.98;
    if (known) { this.setLevel(Math.max(lvl, min)); return; }
    // only where it happened: they come to look
    const was = this.wanted;
    this.wanted = clamp(Math.max(lvl, min), 1, 5);
    if (this.wanted > was) {
      const st = this.streetAt(x, z);
      g.hud && g.hud.notify(`📻 Aviso de un vecino: ${CRIME_NAME[type] || 'un delito'}${st ? ' en ' + st : ''}. Unidades, acudan.`, 'police', 5);
      g.audio.sfx('radio');
    }
    this.lkp.x = x; this.lkp.z = z; this.lkv.x = 0; this.lkv.z = 0;
    this.seen = false; this.seenNow = null; this.lastCrimeT = -99;
    this.lostT = Math.max(this.lostT, 2); this.lostSaid = true; this.lostN++; this.searchT = 0;
    this.spawnT = Math.min(this.spawnT, 0.5);
  }
  setLevel(l) {
    const g = this.game;
    l = clamp(Math.round(l), 0, 5);
    if (l > this.wanted) {
      const street = g.hud ? g.hud.currentStreet : '';
      const who = l >= 3 ? 'Guardia Civil' : 'Policía Local';
      g.hud && g.hud.notify(`📻 ${who}: sospechoso ${street ? 'en ' + street : 'en el casco urbano'}. Todas las unidades.`, 'police');
      if (this.wanted === 0) g.audio.sfx('whistle');
    }
    this.wanted = l;
    if (l === 0) { this.heat = 0; this.hideSpot = null; }
    this.searchT = 0;
    this.seen = true;
    this.lostT = 0; this.lostSaid = false;
    this.lastCrimeT = this.game.time;
    const t = this.targetPos();
    this.lkp.x = t.x; this.lkp.z = t.z;
    this.spawnT = Math.min(this.spawnT, 0.5);
  }
  clear() {
    this.wanted = 0; this.heat = 0; this.hideSpot = null;
    for (const c of [...this.calls]) this.game.peds.endCall(c, false);
    this.calls.clear();
    for (const u of this.units) this.removeUnit(u);
    this.units = [];
    for (const o of this.officers) { this.game.scene.remove(o.char.object); o.char.dispose(); }
    this.officers = [];
    this.game.audio.sirenStopAll();
  }
  giveUp() {
    const g = this.game;
    g.hud && g.hud.notify(g.gxs(pick(RADIO.give)), 'police', 4);
    g.hud && g.hud.notify('Has despistado a la policía.', 'ok');
    this.wanted = 0; this.heat = 0; this.hideSpot = null; this.searchT = 0;
  }
  resetRaid() { this.raidT = 0; this.raidWarned = false; this.raided = false; }

  copsNear(x, z, r) {
    for (const u of this.units) if (Math.hypot(u.v.x - x, u.v.z - z) < r) return true;
    for (const o of this.officers) if (Math.hypot(o.x - x, o.z - z) < r) return true;
    return false;
  }
  targetPos() {
    const p = this.game.player;
    return p.vehicle ? { x: p.vehicle.x, z: p.vehicle.z } : { x: p.pos.x, z: p.pos.z };
  }
  get conts() {
    if (!this._conts) { const w = this.game.world; this._conts = w && w.breakables ? w.breakables.filter((b) => b.kind === 'cont') : []; }
    return this._conts;
  }

  // ------------------------------------------------------------ perception
  // 1 = standing in daylight; lower is harder to spot
  visK() {
    const g = this.game, p = g.player;
    let k = lerp(1, 0.6, g.sky ? g.sky.night || 0 : 0);
    if (p.vehicle) k *= 1.35; else if (p.crouch) k *= 0.55;
    return k * (PERK.lose < 1 ? 0.92 : 1); // Adri knows how to keep out of sight
  }
  // the eyes on the street right now: cars (driver and partner look everywhere) and officers (looking ahead)
  observers(out = this._obs || (this._obs = [])) {
    out.length = 0;
    for (const u of this.units) {
      const v = u.v;
      if (v.dead || v.removed || v.driver === 'player' || u.state === 'leave') continue;
      out.push({ x: v.x, z: v.z, h: v.heading, R: 80, cone: 1.75, near: 6, ey: 1.4, u });
    }
    for (const o of this.officers) {
      if (o.state === 'ko' || o.state === 'dead' || o.state === 'getup') continue;
      out.push({ x: o.x, z: o.z, h: o.heading, R: 55, cone: 1.2, near: 2.5, ey: 1.65, o });
    }
    return out;
  }
  // who (if anyone) sees or hears the player. force: ignore that they are hidden (the moment they get in)
  observe(force = false) {
    const g = this.game, p = g.player;
    if (!force && (p.hideIn || g.interior)) return null;
    if (p.mode === 'dead' || p.mode === 'busted') return null;
    const T = this.targetPos();
    const k = this.visK();
    const low = !p.vehicle && p.crouch;
    const ty = p.vehicle ? 1.0 : low ? 0.75 : 1.3;
    const noise = p.vehicle ? (p.vehicle.vel > 1.5 ? 12 + p.vehicle.vel * 0.5 : 5) : p.noise ?? 3;
    for (const ob of this.observers()) {
      const dx = T.x - ob.x, dz = T.z - ob.z, d = Math.hypot(dx, dz);
      // heard: close by and making noise (buildings in between muffle it)
      if (d < ob.near + noise && (d < 2 || this.map.collider.raycast(ob.x, ob.z, T.x, T.z, 2.2, 2.2) > 0.98)) return ob;
      if (d > ob.R * k) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - ob.h)) > ob.cone) continue;
      if (this.los(ob, T.x, T.z, ty, low)) return ob;
    }
    return null;
  }
  // a clear line from the observer's eyes to the player; keeping low, parked cars and containers hide you too
  los(ob, x, z, ty, low) {
    if (this.map.collider.raycast(ob.x, ob.z, x, z, ob.ey, ty) < 0.98) return false;
    if (!low) return true;
    const g = this.game;
    const x0 = Math.min(ob.x, x) - 3, x1 = Math.max(ob.x, x) + 3, z0 = Math.min(ob.z, z) - 3, z1 = Math.max(ob.z, z) + 3;
    const dx = x - ob.x, dz = z - ob.z, L = Math.hypot(dx, dz) || 1;
    for (const v of g.fleet.vehicles) {
      if (v.x < x0 || v.x > x1 || v.z < z0 || v.z > z1 || v === (ob.u && ob.u.v) || v === g.player.vehicle) continue;
      if (Math.hypot(v.x - x, v.z - z) > L) continue; // cover must be on the player's side of the observer
      if (segBox(ob.x, ob.z, x, z, v.x, v.z, v.heading, v.hl, v.hw)) return false;
    }
    for (const c of this.conts) {
      if (c.broken || c.x < x0 || c.x > x1 || c.z < z0 || c.z > z1) continue;
      const t = clamp(((c.x - ob.x) * dx + (c.z - ob.z) * dz) / (L * L), 0, 1);
      if (Math.hypot(ob.x + dx * t - c.x, ob.z + dz * t - c.z) < 0.8 && t > 0.05) return false;
    }
    return true;
  }
  streetAt(x, z) {
    const q = this.map.nearestEdge(x, z, 40, (e) => !!e.name);
    return q && q.d < 60 ? q.edge.name : '';
  }
  // someone says it on the radio (and an officer nearby, out loud)
  announce(kind, ob = null) {
    const g = this.game;
    if (g.time - (this.saidAt[kind] ?? -99) < 5) return;
    this.saidAt[kind] = g.time;
    const st = this.streetAt(this.lkp.x, this.lkp.z) || 'la zona';
    if (RADIO[kind]) {
      g.hud && g.hud.notify(g.gxs(pick(RADIO[kind])).replace('{s}', st), 'police', 4);
      g.audio.sfx('radio');
    }
    const say = SAY[kind === 'found' ? 'found' : kind === 'lost' ? 'lost' : kind === 'search' ? 'search' : kind === 'cont' ? 'sawCont' : ''];
    const o = ob && ob.o ? ob.o : this.nearestOfficer(this.lkp.x, this.lkp.z, 40);
    if (say && o) g.peds.say(o, pick(say), true);
  }
  nearestOfficer(x, z, r) {
    let best = null, bd = r;
    for (const o of this.officers) {
      if (o.state === 'ko' || o.state === 'dead' || o.state === 'getup') continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  // the player gets into a container or a house: did anyone see it?
  onHide(kind, obj) {
    if (!this.wanted) { this.hideSpot = null; return; }
    const ob = this.observe(true);
    this.resetRaid();
    if (!ob) { this.hideSpot = null; return; }
    this.hideSpot = { kind, obj };
    this.lkp.x = obj.x; this.lkp.z = obj.z; this.lkv.x = 0; this.lkv.z = 0;
    this.lostN++;
    this.announce(kind === 'cont' ? 'cont' : 'house', ob);
  }

  // ------------------------------------------------------------ update (outside)
  update(dt) {
    const g = this.game;
    const p = g.player;
    const T = this.targetPos();
    const px = T.x, pz = T.z;
    // units needed (while they search, reinforcements come to where you were last seen)
    const want = UNITS[this.wanted];
    this.spawnT -= dt;
    if (this.units.length < want && this.spawnT <= 0) { this.spawnT = 2.5; if (this.seen || !this.wanted) this.spawnUnit(px, pz); else this.spawnUnit(this.lkp.x, this.lkp.z); }
    // an investigation (a body found): one car to the spot, officers look around, then back to patrol
    const inv = this.inv;
    if (inv) {
      if (this.wanted > 0) this.inv = null;
      else {
        inv.t += dt;
        if (!inv.spawned && this.spawnT <= 0) { this.spawnT = 2.5; const u = this.spawnUnit(inv.x, inv.z); if (u) { u.inv = inv; inv.spawned = true; } }
        if (inv.t > inv.dur + 60) this.inv = null;
      }
    }
    // who can see you (a few times a second); witnesses of a fresh crime tell them where you are
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 0.12; this.seenNow = this.wanted > 0 ? this.observe() : null; }
    const witnessed = g.time - this.lastCrimeT < 2.5 && !p.hideIn;
    const seen = this.wanted > 0 && (witnessed || !!this.seenNow);
    if (this.wanted > 0) {
      if (seen) {
        if (!this.seen && this.lostT > 2.5) { this.announce('found', this.seenNow); this.hideSpot = null; }
        this.lkp.x = px; this.lkp.z = pz;
        const vv = p.vehicle ? { x: p.vehicle.vx, z: p.vehicle.vz } : p.vel;
        this.lkv.x = vv.x; this.lkv.z = vv.z;
        this.lastOnFoot = !p.vehicle;
        this.lostT = 0; this.searchT = 0; this.lostSaid = false;
        this.resetRaid();
      } else {
        if (this.seen) this.lostN++; // just lost you: everybody re-plans towards the last sighting
        this.lostT += dt;
        if (this.lostT > 1.8 && !this.lostSaid) { this.lostSaid = true; if (!this.hideSpot) this.announce('lost'); this.chatterT = 7 + Math.random() * 4; }
        // the search runs out faster the further you get; slower if they saw you hide
        let rate = this.hideSpot ? 0.45 : p.hideIn ? 1.2 : 1;
        if (Math.hypot(px - this.lkp.x, pz - this.lkp.z) > 140) rate *= 1.6;
        this.searchT += dt * rate;
        this.chatterT -= dt;
        if (this.chatterT <= 0 && this.lostSaid) { this.chatterT = 8 + Math.random() * 6; this.announce('search'); }
        if (this.searchT > this.searchDuration) this.giveUp();
      }
    }
    this.seen = seen && this.wanted > 0;
    // units AI
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = u.v;
      const d = Math.hypot(v.x - px, v.z - pz);
      const investigating = this.wanted === 0 && u.inv && this.inv === u.inv && u.inv.t < u.inv.dur;
      if (v.removed || (this.wanted === 0 && d > 90 && !investigating) || d > 420 || (v.dead && d > 80)) {
        this.removeUnit(u); this.units.splice(i, 1); continue;
      }
      if (this.wanted === 0) u.state = investigating ? 'inv' : 'leave';
      g.audio.sirenPos(u.sid, v.x, v.z);
      if (v.dead) { v.siren = false; g.audio.sirenStop(u.sid); continue; }
      if (v.driver === 'player') { this.units.splice(i, 1); g.audio.sirenStop(u.sid); continue; }
      this.driveUnit(u, dt, px, pz, d);
    }
    // officers on foot
    let touching = false;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      o.t += dt;
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz);
      const unitGone = !o.unit || o.unit.v.removed || o.unit.v.dead;
      const invO = !unitGone && o.unit.inv && this.inv === o.unit.inv;
      if (d > 150 || (this.wanted === 0 && (unitGone ? o.t > 3 && (d > 45 || !g.traffic.inView(o.x, o.z, d)) : o.t > 40 && !invO))) { g.scene.remove(o.char.object); o.char.dispose(); this.officers.splice(i, 1); continue; }
      // run over by a car
      if (o.state !== 'ko' && o.state !== 'dead') for (const v of g.fleet.vehicles) {
        if (v.vel < 4 || Math.abs(v.x - o.x) > 4 || Math.abs(v.z - o.z) > 4) continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const lx = o.x - v.x, lz = o.z - v.z;
        if (Math.abs(lx * fx + lz * fz) < v.hl + 0.3 && Math.abs(-lx * fz + lz * fx) < v.hw + 0.3) {
          o.state = 'ko'; o.koT = 4 + Math.random() * 3; o.hp = 100;
          this.fall(o, { vel: [fx * v.vel * 0.9, 1.6 + v.vel * 0.13, fz * v.vel * 0.9], legs: 0.5, up: -0.2, tone: 0.55 });
          g.audio.sfx('punch_hit', { x: o.x, z: o.z, vol: 1.2 });
          if (v.driver === 'player') this.crime('policia', o.x, o.z);
          break;
        }
      }
      if ((o.chk = (o.chk ?? 1) - dt) <= 0) { o.chk = 1; if (this.map.buildingAt(o.x, o.z)) this.placeOutside(o, o.x, o.z); }
      if (o.state === 'ko' || o.state === 'dead' || o.state === 'getup') {
        // down (the ragdoll has the body), then up again and back after you
        o.char.update(dt, 0, {});
        if (o.char.rag) { const rp = o.char.ragPos(this._rp || (this._rp = new THREE.Vector3())); o.x = rp.x; o.z = rp.z; }
        if (o.state === 'ko' && (o.koT -= dt) <= 0) {
          const up = o.char.getUp();
          if (up) { o.x = up.x; o.z = up.z; o.heading = up.heading; }
          o.state = 'getup';
        } else if (o.state === 'getup') {
          o.char.object.position.set(o.x, 0, o.z); o.char.object.rotation.set(0, o.heading, 0);
          if (!o.char.gettingUp) { o.state = 'run'; o.char.setBase(null); }
        }
        continue;
      }
      let speed = 0;
      if (this.wanted > 0 && this.seen && !(p.vehicle && p.vehicle.vel > 4)) {
        o.mode = 'chase'; o.waitT = 0;
        const tx = px, tz = pz;
        const ddx = tx - o.x, ddz = tz - o.z, dd = Math.hypot(ddx, ddz);
        o.heading = dampAngle(o.heading, Math.atan2(ddx, ddz), 10, dt);
        speed = dd > 1.1 ? 5.4 : 0;
        // Guardia Civil (3+ stars) opens fire when they have a clear line (they stop to aim)
        if (this.wanted >= 3 && dd < 34 && dd > 2.2 && g.state === 'play') {
          o.shootT = (o.shootT ?? 0.8 + Math.random()) - dt;
          if (o.shootT < 0.6) { speed = 0; if (o.char.base !== 'aim') o.char.setBase('aim'); }
          if (o.shootT <= 0) { o.shootT = 0.9 + Math.random() * 0.8; this.officerShoot(o, tx, tz, dd); }
        } else if (o.char.base === 'aim') o.char.setBase(null);
        o.x += Math.sin(o.heading) * speed * dt; o.z += Math.cos(o.heading) * speed * dt;
        const reach = p.vehicle ? p.vehicle.hw + 1.2 : 1.35;
        // you are only cuffed if you stop (or walk); sprinting away breaks free
        const pSpeed = p.vehicle ? p.vehicle.vel : Math.hypot(p.vel.x, p.vel.z);
        if (dd < reach && pSpeed < (p.vehicle ? 1.2 : 2.6) && !p.knock) touching = true;
        if (dd < 2 && !p.vehicle && Math.random() < dt * 0.6 && this.wanted >= 2 && !p.knock) {
          o.char.play('punch', 0.45); p.damage(6); g.audio.sfx('punch_hit');
        }
      } else if (this.wanted > 0) {
        if (o.char.base === 'aim') o.char.setBase(null);
        speed = this.searchStep(o, dt);
      } else if (o.unit && o.unit.inv && this.inv === o.unit.inv && o.unit.inv.t < o.unit.inv.dur) {
        speed = this.searchStep(o, dt, o.unit.inv, -o.unit.inv.n); // looking around where the body is
      } else if (o.unit && !o.unit.v.removed) {
        // go back to the car
        const ddx = o.unit.v.x - o.x, ddz = o.unit.v.z - o.z, dd = Math.hypot(ddx, ddz);
        o.heading = dampAngle(o.heading, Math.atan2(ddx, ddz), 8, dt);
        speed = dd > 2 ? 3 : 0;
        o.x += Math.sin(o.heading) * speed * dt; o.z += Math.cos(o.heading) * speed * dt;
        if (dd < 2.2) { g.scene.remove(o.char.object); o.char.dispose(); this.officers.splice(i, 1); o.unit.cops = Math.max(0, o.unit.cops - 1); continue; }
      }
      const pos = { x: o.x, z: o.z };
      this.map.collider.resolveCircle(pos, 0.32);
      o.x = pos.x; o.z = pos.z;
      o.char.update(dt, speed, {});
      o.char.object.position.set(o.x, 0, o.z);
      o.char.object.rotation.set(0, o.heading, 0);
    }
    if (touching && this.wanted > 0) {
      this.bustT += dt;
      if (this.bustT > (p.vehicle ? 1.6 : 1.1)) { this.bustT = 0; g.onBusted(); }
    } else this.bustT = Math.max(0, this.bustT - dt * 2);
  }

  // an officer who has lost you: to the last sighting, then around it looking behind things and into containers
  searchStep(o, dt, C = this.lkp, key = this.lostN) {
    const g = this.game, p = g.player;
    const V = C === this.lkp ? this.lkv : { x: 0, z: 0 };
    if (o.lostN !== key || !o.goal) {
      o.lostN = key; o.mode = 'goto'; o.waitT = 0; o.cont = null; o.C = C;
      o.goal = { x: C.x + clamp(V.x, -6, 6) * 0.8 + (Math.random() - 0.5) * 3, z: C.z + clamp(V.z, -6, 6) * 0.8 + (Math.random() - 0.5) * 3 };
      o.stuck = 0; o.lx = o.x; o.lz = o.z;
    }
    if (o.waitT > 0) {
      o.waitT -= dt;
      if (o.mode === 'check' && o.cont) {
        o.heading = dampAngle(o.heading, Math.atan2(o.cont.x - o.x, o.cont.z - o.z), 8, dt);
        if (o.waitT <= 0) this.checkDone(o);
      } else o.heading += Math.sin(o.t * 1.3 + o.x) * dt * 1.1; // looking around
      return 0;
    }
    const dx = o.goal.x - o.x, dz = o.goal.z - o.z, d = Math.hypot(dx, dz);
    if (d < (o.mode === 'check' ? 1.25 : 1.1)) {
      if (o.mode === 'check' && o.cont) {
        o.waitT = 1.7;
        g.audio.sfx('lid', { x: o.cont.x, z: o.cont.z });
        if (Math.random() < 0.7) g.peds.say(o, pick(SAY.cont), true);
        return 0;
      }
      this.nextSearchGoal(o);
      o.waitT = 0.8 + Math.random() * 1.8;
      if (Math.random() < 0.25) g.peds.say(o, pick(SAY.search), true);
      return 0;
    }
    o.heading = dampAngle(o.heading, Math.atan2(dx, dz), 7, dt);
    const speed = o.mode === 'goto' ? 4.6 : 2.3;
    o.x += Math.sin(o.heading) * speed * dt; o.z += Math.cos(o.heading) * speed * dt;
    // blocked by a wall: pick somewhere else
    o.stuck += dt;
    if (o.stuck > 1.5) {
      if (Math.hypot(o.x - o.lx, o.z - o.lz) < 0.6) this.nextSearchGoal(o);
      o.stuck = 0; o.lx = o.x; o.lz = o.z;
    }
    return speed;
  }
  nextSearchGoal(o) {
    const g = this.game;
    const L = o.C || this.lkp;
    o.cont = null;
    // a container they saw you get into, or (sometimes) one nearby
    let c = null;
    if (this.hideSpot && this.hideSpot.kind === 'cont' && !this.hideSpot.obj.broken && !(this.hideSpot.obj.checkedT > this.lostStart)) c = this.hideSpot.obj;
    else if (Math.random() < 0.4) {
      let bd = 16;
      for (const k of this.conts) {
        if (k.broken || k.checkedT > this.lostStart || k.claimed === o) continue;
        const d = Math.hypot(k.x - L.x, k.z - L.z) + Math.hypot(k.x - o.x, k.z - o.z) * 0.3;
        if (d < bd) { bd = d; c = k; }
      }
    }
    if (c) {
      const a = Math.atan2(o.x - c.x, o.z - c.z);
      o.mode = 'check'; o.cont = c; c.claimed = o;
      o.goal = { x: c.x + Math.sin(a) * 1.15, z: c.z + Math.cos(a) * 1.15 };
      return;
    }
    o.mode = 'search';
    const R = 10 + this.wanted * 3;
    for (let k = 0; k < 8; k++) {
      const q = this.streetPoint(L.x, L.z, R, true);
      if (!this.map.buildingAt(q.x, q.z) && this.map.collider.raycast(o.x, o.z, q.x, q.z, 1, 1) > 0.98) { o.goal = q; return; }
    }
    o.goal = { x: L.x + (Math.random() - 0.5) * 6, z: L.z + (Math.random() - 0.5) * 6 };
  }
  checkDone(o) {
    const g = this.game, p = g.player, c = o.cont;
    c.checkedT = g.time; c.claimed = null;
    o.cont = null; o.mode = 'search';
    if (p.hideIn === c) {
      g.peds.say(o, pick(SAY.contYes), true);
      p.leaveContainer(true);
      this.hideSpot = null;
      this.lastCrimeT = g.time; // everybody knows where you are again
      this.seenNow = { o, x: o.x, z: o.z };
      this.announce('found', this.seenNow);
      return;
    }
    if (this.hideSpot && this.hideSpot.obj === c) this.hideSpot = null; // they were wrong
    g.peds.say(o, pick(SAY.contNo), true);
    this.nextSearchGoal(o);
  }
  get lostStart() { return this.game.time - this.lostT; }
  // a random point on the streets around (x, z)
  streetPoint(x, z, R, walk = false) {
    const ids = [...this.map.edgesNear(x, z, R)];
    for (let a = 0; a < 14 && ids.length; a++) {
      const e = this.map.edges[ids[Math.floor(Math.random() * ids.length)]];
      if (e.blocked || !(walk ? e.walk || e.drive : e.drive && e.cls !== 'track' && e.cls !== 'service')) continue;
      const c = this.map.sample(e, Math.random() * e.len, {});
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < R && d > 4) return { x: c.x, z: c.z };
    }
    return { x: x + (Math.random() - 0.5) * R, z: z + (Math.random() - 0.5) * R };
  }

  // ------------------------------------------------------------ while you are inside a house
  updateInside(dt) {
    if (!this.wanted) return;
    const g = this.game;
    this.seen = false; this.seenNow = null;
    if (g.time - this.lastCrimeT < 1) return;
    this.lostT += dt;
    if (this.lostT > 1.8 && !this.lostSaid) { this.lostSaid = true; if (!this.hideSpot) this.announce('lost'); this.chatterT = 8; }
    this.searchT += dt * (this.hideSpot ? 0.4 : 1.3);
    this.chatterT -= dt;
    if (this.chatterT <= 0) { this.chatterT = 10 + Math.random() * 7; this.announce(this.hideSpot ? 'outside' : 'search'); }
    // they saw you go in and it is serious: they come in after you
    if (this.hideSpot && this.hideSpot.kind === 'house' && this.wanted >= 3 && g.interiors.raid) {
      this.raidT = (this.raidT || 0) + dt;
      if (!this.raidWarned && this.raidT > 12) { this.raidWarned = true; this.announce('raid'); g.audio.sfx('knock', { vol: 1.2 }); }
      if (!this.raided && this.raidT > 19) { this.raided = true; g.interiors.raid(this.wanted >= 3 ? 'gc' : 'local'); }
    }
    if (this.searchT > this.searchDuration) this.giveUp();
  }

  get searchDuration() { return (10 + this.wanted * 6) * PERK.lose; } // Adri knows where to hide
  get flashing() { return this.wanted > 0 && !this.seen && this.lostT > 1.5; }
  // for the HUD: 'visto' | 'busca' | 'oculto' | 'rodeado' | null
  get state() {
    if (!this.wanted) return this.calls.size ? 'llamada' : null;
    if (this.seen) return 'visto';
    const g = this.game, p = g.player;
    if (p.hideIn || g.interior) return this.hideSpot ? 'rodeado' : 'oculto';
    return this.lostT > 1.5 ? 'busca' : 'visto';
  }

  spawnUnit(px, pz) {
    const g = this.game;
    const gc = this.wanted >= 3 && (this.units.filter((u) => u.kind === 'gc').length < this.wanted - 1);
    const map = this.map;
    const T = this.targetPos();
    const near = [...map.edgesNear(px, pz, 230)].map((id) => map.edges[id]).filter((e) => e.drive && !e.blocked && e.cls !== 'track' && e.cls !== 'service' && e.len >= 15);
    for (let a = 0; a < 16 && near.length; a++) {
      const e = near[Math.floor(Math.random() * near.length)];
      const s = Math.random() * e.len;
      const dir = e.oneway === -1 ? -1 : e.oneway === 1 ? 1 : Math.random() < 0.5 ? 1 : -1;
      const lp = lanePoint(map, e, dir, dir > 0 ? s : e.len - s, this.tmp);
      if (!g.fleet.boxFree(lp.x, lp.z, Math.atan2(lp.dx, lp.dz), g.fleet.renderer.models.guardia.spec, 0.1)) continue;
      const d = Math.hypot(lp.x - px, lp.z - pz);
      if (d < 100 || d > 210) continue;
      if (Math.hypot(lp.x - T.x, lp.z - T.z) < 70) continue; // never pop up right next to the player
      if (g.fleet.nearest(lp.x, lp.z, 10)) continue;
      const v = g.fleet.spawn(gc ? 'guardia' : 'policia', lp.x, lp.z, Math.atan2(lp.dx, lp.dz), '#f4f4f0', { sleeping: false, keep: true });
      if (!v) return;
      v.siren = true;
      v.locked = false;
      v.police = true;
      v.ctrl = true;
      const sid = 'u' + this.sid++;
      g.audio.sirenStart(sid, gc ? 'guardia' : 'local');
      const u = { v, kind: gc ? 'gc' : 'local', sid, path: null, pathT: 0, pi: 0, state: 'chase', stuckT: 0, revT: 0, cops: 0, lostN: -1 };
      this.units.push(u);
      return u;
    }
  }
  removeUnit(u) {
    this.game.audio.sirenStop(u.sid);
    if (u.v.driver !== 'player') this.game.fleet.remove(u.v);
  }

  driveUnit(u, dt, px, pz, d) {
    const g = this.game;
    const v = u.v;
    const map = this.map;
    const p = g.player;
    if (u.state === 'inv') {
      const I = u.inv;
      v.siren = true;
      if (u.cops > 0) { v.throttle = 0; v.brake = 1; v.steerIn = 0; return; } // parked while the officers look around
      const dI = Math.hypot(I.x - v.x, I.z - v.z);
      u.pathT -= dt;
      if (!u.path || u.pathT <= 0) { u.pathT = 5; u.path = map.routeFrom(v.x, v.z, v.heading, I.x, I.z, {}); u.seg = 0; }
      const f = followRoute(u, v.x, v.z, v.heading, Math.abs(v.speed), this._fr || (this._fr = {}));
      if ((dI < 14 || f.done) && !u.deployedInv) { if (v.vel < 4) { this.deploy(u); u.deployedInv = true; } else { v.throttle = 0; v.brake = 1; return; } }
      if (u.deployedInv) { v.throttle = 0; v.brake = 1; v.steerIn = 0; return; }
      driveToward(v, f.x, f.z, turnSpeed(f.turn, v.spec.top * 0.55), dt);
      return;
    }
    if (u.state === 'leave') {
      v.siren = false;
      if (u.cops > 0) { v.throttle = 0; v.brake = 1; v.steerIn = 0; return; } // wait for the officers to get back in
      driveToward(v, v.x + Math.sin(v.heading) * 20, v.z + Math.cos(v.heading) * 20, 8, dt);
      return;
    }
    v.siren = true;
    // reverse out if stuck
    if (u.revT > 0) {
      u.revT -= dt;
      v.throttle = 0; v.brake = 1; v.steerIn = u.revSteer; v.handbrake = 0;
      return;
    }
    const pv = p.vehicle;
    const chasing = this.seen;
    let gx = px, gz = pz;
    if (!chasing) {
      // lost: to where they saw you last (a bit further along the way you were going), then the streets around it
      if (u.lostN !== this.lostN || !u.goal) {
        u.lostN = this.lostN; u.mode = 'goto'; u.path = null; u.waitT = 0;
        u.goal = { x: this.lkp.x + clamp(this.lkv.x, -15, 15) * 1.5, z: this.lkp.z + clamp(this.lkv.z, -15, 15) * 1.5 };
      }
      if (u.waitT > 0) { u.waitT -= dt; v.throttle = 0; v.brake = 1; v.steerIn = 0; return; }
      gx = u.goal.x; gz = u.goal.z;
    }
    const direct = chasing && d < 75 && map.collider.raycast(v.x, v.z, px, pz, 1.2, 1.2) > 0.98;
    let tx, tz, tsp;
    if (direct) {
      const lead = pv ? 0.7 : 0.2;
      tx = px + (pv ? pv.vx : p.vel.x) * lead; tz = pz + (pv ? pv.vz : p.vel.z) * lead;
      tsp = pv ? Math.max(8, pv.vel + (this.wanted >= 3 ? 6 : 2)) : Math.max(0, (d - 7) * 1.2);
      // on-foot suspect: stop and deploy officers
      if (!pv && d < 22 && u.cops < 2 && v.vel < 3) this.deploy(u);
      if (pv && pv.vel < 1.5 && d < 10 && u.cops < 2 && v.vel < 2) this.deploy(u);
    } else {
      u.pathT -= dt;
      if (!u.path || u.pathT <= 0) {
        u.pathT = chasing ? 2.5 : 6;
        u.path = map.routeFrom(v.x, v.z, v.heading, gx, gz, { ignoreOneway: this.wanted >= 2 });
        u.seg = 0;
      }
      // end of the road network (plaza, alley): officers go on foot
      const f = followRoute(u, v.x, v.z, v.heading, Math.abs(v.speed), this._fr || (this._fr = {}));
      if (chasing && !pv && d < 70 && f.done && u.cops < 2 && v.vel < 4) this.deploy(u);
      if (!chasing && (f.done || Math.hypot(gx - v.x, gz - v.z) < 12)) {
        // got there: officers get out to look around (if you were on foot), then on to another street
        if (u.mode === 'goto' && this.lastOnFoot && u.cops < (this.wanted >= 2 ? 2 : 1) && v.vel < 5) this.deploy(u);
        u.mode = 'search';
        u.goal = this.streetPoint(this.lkp.x, this.lkp.z, 35 + this.wanted * 12);
        u.path = null; u.waitT = 1 + Math.random() * 2;
      }
      tx = f.x; tz = f.z;
      tsp = turnSpeed(f.turn, v.spec.top * (chasing ? 0.72 : u.mode === 'goto' ? 0.6 : 0.36));
      if (u.off > 14) u.pathT = 0;
    }
    driveToward(v, tx, tz, tsp, dt);
    if (direct && pv && this.wanted >= 3 && d < 12) v.throttle = 1; // ram
    // stuck detection
    if (v.vel < 1 && tsp > 3) u.stuckT += dt; else u.stuckT = 0;
    if (u.stuckT > 2.2) { u.stuckT = 0; u.revT = 1.3; u.revSteer = -Math.sign(v.steerIn || 1); }
  }

  // spot next to a car (or near x,z) that is on the street, not inside a building
  placeOutside(o, x, z) {
    const q = this.map.nearestEdge(x, z, 50, (e) => (e.walk || e.drive) && !e.blocked);
    if (q) { const c = this.map.sample(q.edge, q.s, {}); o.x = c.x; o.z = c.z; }
  }
  deploy(u) {
    const g = this.game;
    const v = u.v;
    const col = this.map.collider;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const spots = [[fz, -fx], [-fz, fx], [-fx, -fz]].map(([sx, sz]) => [v.x + sx * (v.hw + 0.65), v.z + sz * (v.hw + 0.65)])
      .filter(([x, z]) => !this.map.buildingAt(x, z) && col.raycast(v.x, v.z, x, z, 1, 1) > 0.98);
    if (!spots.length) return;
    for (let k = u.cops; k < 2; k++) {
      const [x, z] = spots[Math.min(k, spots.length - 1)];
      const desc = { ...COP_DESC[u.kind] };
      desc.skin = Math.floor(Math.random() * 4);
      const char = g.chars.create(desc);
      g.scene.add(char.object);
      this.officers.push({ char, x, z, heading: v.heading, t: 0, state: 'run', unit: u, hp: 100, lostN: -1 });
      u.cops++;
    }
    v.throttle = 0; v.brake = 1;
    g.audio.sfx('door_open', { x: v.x, z: v.z });
  }

  hitTest(x, z, r) {
    let best = null, bd = r;
    for (const o of this.officers) {
      if (o.state === 'ko' || o.state === 'dead' || o.state === 'getup') continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  punched(o, fx, fz) { this.damageOfficer(o, 30, fx * 3, fz * 3); }
  // the body goes limp and falls (a ragdoll: see Character.ragdoll)
  fall(o, opts) {
    const col = this.map.collider;
    this.ragEnv = this.ragEnv || { floor: () => 0, collide: (p, r) => col.resolveCircle(p, r), crosses: (ax, az, bx, bz) => col.crosses && col.crosses(ax, az, bx, bz) };
    o.char.ragdoll({ env: this.ragEnv, ...opts });
  }
  damageOfficer(o, dmg, kx = 0, kz = 0) {
    if (o.char.rag) o.char.rag.push(9, kx * 0.35, 0.3, kz * 0.35); // a body on the ground jerks with the blow
    if (o.state === 'dead') return;
    const g = this.game;
    o.hp -= dmg;
    o.char.play('hit', 0.4);
    if (o.hp <= 0) {
      o.state = 'dead'; o.koT = 1e9;
      this.fall(o, { vel: [kx * 0.8, 0.2, kz * 0.8], up: 0.6, buckle: 0.9, tone: 0.1, dead: true });
      g.effects.pool(o.x, o.z, 0.8);
      this.crime('policia_muerto', o.x, o.z);
      if (g.pickups && Math.random() < 0.6) g.pickups.weapon(o.x + 0.6, o.z, 'pistola', 12);
      return;
    }
    if (o.hp <= 40 && Math.random() < 0.6 && o.state !== 'ko') { o.state = 'ko'; o.koT = 6; o.hp = 60; this.fall(o, { vel: [kx * 0.8, 0.7, kz * 0.8], up: 0.8, legs: -0.3, tone: 0.75 }); }
    this.crime('policia', o.x, o.z);
  }
  // an officer fires at the player (misses more at range and when you move fast)
  officerShoot(o, tx, tz, d) {
    const g = this.game;
    const p = g.player;
    const ox = o.x + Math.sin(o.heading) * 0.5, oz = o.z + Math.cos(o.heading) * 0.5;
    if (this.map.collider.raycast(ox, oz, tx, tz, 1.35, 1.2) < 0.98) return;
    const moving = p.vehicle ? p.vehicle.vel : Math.hypot(p.vel.x, p.vel.z);
    const pHit = clamp(0.55 - d / 70 - moving * 0.03 - (p.crouch ? 0.12 : 0), 0.06, 0.55);
    const hit = Math.random() < pHit;
    const mx = tx + (hit ? 0 : (Math.random() - 0.5) * 3), mz = tz + (hit ? 0 : (Math.random() - 0.5) * 3);
    g.weapons && g.weapons.tracers.add(ox, 1.35, oz, mx, hit ? 1.1 : 0.4 + Math.random(), mz);
    g.effects.muzzle(ox, 1.35, oz, Math.sin(o.heading), Math.cos(o.heading));
    g.audio.sfx('shot_pistol', { x: ox, z: oz, vol: 0.9 });
    g.peds.scare(ox, oz, 30, { x: ox, z: oz }, true);
    if (!hit) return;
    if (p.vehicle) { p.vehicle.health -= 22; g.effects.sparks(mx, 0.9, mz, 4); g.audio.sfx('bullet_metal', { x: mx, z: mz }); }
    else { p.damage(7 + Math.random() * 5); g.effects.blood(p.pos.x, 1.2, p.pos.z, Math.sin(o.heading), Math.cos(o.heading)); }
  }
}

// does the segment (x0,z0)-(x1,z1) cross the box centred at (cx,cz), heading h, half length hl, half width hw?
function segBox(x0, z0, x1, z1, cx, cz, h, hl, hw) {
  const fx = Math.sin(h), fz = Math.cos(h);
  const ax = x0 - cx, az = z0 - cz, bx = x1 - cx, bz = z1 - cz;
  const a1 = ax * fx + az * fz, a2 = -ax * fz + az * fx, b1 = bx * fx + bz * fz, b2 = -bx * fz + bz * fx;
  let t0 = 0, t1 = 1;
  const d1 = b1 - a1, d2 = b2 - a2;
  for (const [p, d, e] of [[a1, d1, hl], [a2, d2, hw]]) {
    if (Math.abs(d) < 1e-9) { if (p < -e || p > e) return false; continue; }
    let ta = (-e - p) / d, tb = (e - p) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
