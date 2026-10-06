// Pedestrians of Guareña: each one is going somewhere that suits the hour and who they are (npcmind.js), along the
// sidewalks of the real streets; they cross looking out for cars, keep to the right when they meet someone, stop to
// greet a neighbour, go in at the door they were heading for (and others come out of theirs); they chat in the plazas,
// at their doors and on the benches — real little conversations — flee from trouble, get knocked down (and get back
// up), and speak castúo.
import * as THREE from 'three';
import { randomDesc } from './characters.js';
import { polySample, polyNearest, clamp, lerp, dampAngle, wrapAngle, mulberry32, hash1 } from './util.js';
import { Dogs } from './dogs.js';
import { Places, routeBetween, personaOf, Chat, greetLine, errandLine, PASSING, BUSY, ANNOYED, ANNOYED_SAT, WARY, AFTER_DARK, FOLLOWED, CLOSE, BYE, partOfDay, weekday, massTime, fillLine } from './npcmind.js';

export const FRASES = {
  bump: ['¡Chacho, ten cuidao!', '¡Mira por dónde vas!', '¡Coile, qué susto!', '¡Ay, madre!', '¡Que me escachas!', '¡Acho, que no estás {solo|sola}!'],
  punched: ['¡Pero qué haces, {zagal|zagala}!', '¡Como te pille, estás aviao!', '¡Socorro!', '¡Llamad a la Guardia Civil!', '¡Tú no eres de aquí!'],
  car: ['¡Que me atropellas!', '¡Frena, animal!', '¡Eh, cuidado con el coche!', '¡Más despacio, hombre!'],
  carWalk: ['¡Por la acera no!', '¡Que esto es la acera, animal!', '¡Que me atropellas!'],
  greet: ['¡Buenas!', '¿Qué pasa, piporro?', '¡Acho, qué caló jace!', '¿Un vasino de pitarra?', 'Espérate una mijina…', '¡Menuda sapalipanda hay en la plaza!', 'Ponme unos chochos, anda.', '¡A ver!', '¿Has visto la torre de Santa María?', 'Esto está más tranquilo que la siesta.'],
  flee: ['¡Corred!', '¡Que viene!', '¡Ay, Dios mío!', '¡Aligera, que no llegamos!'],
  carjack: ['¡Mi coche! ¡Al ladrón!', '¡Que me lo roban!', '¡Ladrón, sinvergüenza!'],
  handsup: ['¡No dispares, por tu madre!', '¡{Tranquilo, tranquilo|Tranquila, tranquila}!', '¡Llévate lo que quieras!', '¡Ay, Virgen de la Piedad!', '¡Que tengo familia!'],
  robbed: ['¡Toma, toma, y vete!', 'Es todo lo que llevo, te lo juro.', '¡Ladrón! ¡Esto no se hace!', 'Pa ti, pa ti… pero déjame.'],
  fight: ['¿Tú qué miras, {zagal|zagala}?', '¡Ahora te vas a enterar!', '¡A mí no me toca nadie!', '¡Vente pa cá si tienes lo que hay que tener!'],
  talk: ['¡Buenas! ¿Qué se cuenta?', '¿Has probao el pitarra de la cooperativa?', 'Esta noche hay verbena en la plaza, ¡no faltes!', 'Mi cuñao tiene un tractor más grande que tu coche.', 'Qué caló jace, chacho. Me voy a la piscina.', 'Dicen que en el pantano hay un tesoro de Tarteso…', 'Cuidao con los de verde, que andan por el polígono.', 'En Guareña se vive de lujo, acho.', '¿Vas pa la feria? Hay churros en la plaza.', 'Luis Chamizo era de aquí, que lo sepas.', '¿Tú no eres {el nieto|la nieta} de la Remedios?', 'Ya empezó la vendimia en las Vegas.'],
  annoyed: ['Que sí, que sí… déjame [tranquilo|tranquila].', '¿Otra vez tú? Qué pesaíto.', 'Tengo prisa, {zagal|zagala}.', 'Anda, ve a molestar a otro.'],
  insulted: ['¡Pero qué me dices, desgraciao!', '¡Más {feo|fea} eres tú!', '¡Tu padre sí que era un cansino!', '¡Vete a la porra!'],
  // neighbours sitting out at their doors "tomando el fresco"
  fresco: ['¿Te has enterao de lo de la hija de la Juani?', 'Ay, qué caló ha hecho hoy, hija.', 'Con el fresquito ya es otra cosa.', 'Mañana es día de mercao, ¿vas a ir?',
    'El butanero ha pasao a las diez y yo sin sacar la bombona.', 'Dicen que este año las fiestas van a ser sonás.', 'En mis tiempos esto era tó campo.', 'Chacha, que no se entere nadie, pero…',
    'Pues yo el gazpacho lo hago sin pepino.', '¿Has visto el coche que lleva ese? Ni que fuera de Madrid.', 'Anda que no ha llovío desde entonces…', 'A ver si refresca, que no se pue dormir.',
    'La vendimia viene buena, dice mi Paco.', 'Esa sí que sabía hacer perrunillas.', 'Mi nieto se ha ido a Badajoz a estudiar.', 'Y la otra, venga a hablar por el teléfono ese.',
    'Mira, mira quién viene por ahí…', '¿Y tu marío qué tal de lo suyo?', 'Esta noche ponen la verbena en la plaza.', '¡Qué bien se está aquí, coile!'],
  frescoGreet: ['¡Adiós!', '¡Buenas noches, hijo!', 'Adiós, guapo.', '¿De quién eres tú, zagal?', '¡Hola, hermoso!', 'Anda, siéntate un ratino.'],
  frescoGreetF: ['¡Adiós, guapa!', '¡Buenas noches, hija!', '¿De quién eres tú, zagala?', '¡Qué zagala más guapa!', 'Anda, siéntate un ratino, hija.'],
  frescoMorning: ['¡Buenos días!', 'Hoy va a apretar el sol, ya verás.', '¿Ya has ido a por el pan?', 'Voy a regar los geranios antes de que caliente.', 'Qué mañanita más buena.'],
};
// on the phone to the police (they describe what they saw)
const CALL = {
  agresion: ['¿Policía? ¡Vengan, que están pegando a alguien en la calle!', '¿Oiga? ¡Una pelea! ¡Le ha dado una paliza!'],
  homicidio: ['¡Policía! ¡Han matado a alguien! ¡Vengan ya!', '¡Un muerto! ¡Hay un muerto en la calle!'],
  atropello: ['¡Han atropellado a una persona y se ha ido!', '¿Emergencias? ¡Un atropello!'],
  atraco: ['¡Me han atracado! ¡Con una pistola!', '¿Policía? ¡Un atraco a mano armada!'],
  carjack: ['¡Me han robado el coche! ¡Me han sacao a la fuerza!', '¡Al ladrón! ¡Se lleva un coche!'],
  disparo: ['¡Disparos! ¡Están disparando en la calle!', '¿Policía? ¡He oído tiros!'],
  explosion: ['¡Una explosión! ¡Ha volado un coche!', '¡Manden a los bomberos y a la Guardia Civil!'],
  breakin: ['¡Están robando un coche! ¡Salta la alarma!', '¡Un ladrón forzando un coche!'],
  cadaver: ['¡Hay una persona en el suelo! ¡No se mueve!', '¿Emergencias? ¡Hay alguien tirado en la calle!'],
  allanamiento: ['¡Guardia Civil! ¡Se está colando alguien en casa de los vecinos!', '¡Hay uno forzando una puerta!'],
  any: ['¿Policía? ¡Vengan rápido!', '¿Oiga? ¡Aquí está pasando algo gordo!'],
};
const CALL_END = ['Ya vienen, ya vienen…', 'Ahora viene la Guardia Civil, ya verás.', 'Ya les he avisado.'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Peds {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.list = [];
    this.pool = [];
    this.spawnT = 0;
    this.rnd = mulberry32(99);
    this.tmp = {};
    this.walkEdges = this.map.edges.filter((e) => (e.walk && !e.blocked && !e.dirt && e.cls !== 'track' && e.len > 8 && this.map.inTown(e.pts[0], e.pts[1])));
    this.benches = (game.world.spawnSpots || []).filter((s) => s.kind === 'bench');
    this.fresco = game.world.frescoSpots || [];
    this.frescoGroups = [];
    this.speech = [];
    this.marks = [];
    this.speechRoot = game.ui.speech;
    this.dogs = new Dogs(game);
    this.walkSet = new Set(this.walkEdges);
    this.walkOk = (e) => this.walkSet.has(e) || (e.walk && !e.blocked && !e.dirt && e.cls !== 'track' && e.len > 3);
    this.chats = [];      // conversations going on: plaza groups, doors, benches, couples out walking
    this.later = [];      // lines said a moment after another (a greeting answered)
    this.trouble = null;  // the last thing that happened in the street (people talk about it)
    this.places = null;   // where people go (made on the first update: the shops and doors are set up after us)
    this.churchOut = 0;
  }
  get now() { return this.game.time || performance.now() / 1000; }
  // what a conversation here and now can be about
  ctx(where, members) {
    const g = this.game, h = g.sky.hour, wd = weekday(g.sky), m = massTime(h, wd);
    const needs = [];
    if (g.mercadillo && g.mercadillo.marketDay) needs.push('mercado');
    if (m && m.phase !== 'durante') needs.push('misa');
    const t = this.trouble, a = members && members[0];
    if (t && this.now - t.t < 240 && (!a || Math.hypot(a.x - t.x, a.z - t.z) < 260)) needs.push('jaleo');
    return { part: partOfDay(h), where, wd, needs, who: a && a.persona ? a.persona.age : 'adulto', n: members ? members.length : 2 };
  }
  startChat(members, where, opts = {}) {
    const c = new Chat(this, members, this.ctx(where, members), opts);
    for (const m of members) m.chat = c;
    this.chats.push(c);
    return c;
  }

  targetCount() {
    const h = this.game.sky.hour;
    const base = this.game.q.peds || 26;
    const f = h < 7 ? 0.2 : h < 10 ? 0.6 : h < 14.5 ? 1 : h < 17 ? 0.55 /* siesta */ : h < 22.5 ? 1.15 /* paseo */ : h < 24 ? 0.5 : 0.25;
    return Math.round(base * f);
  }

  makeChar(desc) {
    const c = this.game.chars.create(desc || randomDesc(this.rnd));
    this.game.scene.add(c.object);
    return c;
  }

  update(dt) {
    const g = this.game, p = g.player.pos;
    if (!this.places && g.world && g.shops) this.places = new Places(g);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.25;
      if (this.list.filter((x) => !x.fixed).length < this.targetCount()) { if (!(Math.random() < 0.4 && this.spawnFromDoor(p))) this.trySpawn(p); }
      this.ensureBenchSitters(p);
      this.ensurePlazaGroups(p);
      this.ensureFresco(p);
      this.churchCrowd(p);
    }
    this.updateFresco(dt);
    // the conversations, and the answers that come a moment later
    const near = (m) => Math.hypot(m.x - p.x, m.z - p.z) < 14 && !g.player.vehicle;
    for (let i = this.chats.length - 1; i >= 0; i--) { const c = this.chats[i]; c.update(dt, near); if (c.done) this.chats.splice(i, 1); }
    for (let i = this.later.length - 1; i >= 0; i--) { const l = this.later[i]; l.t -= dt; if (l.t <= 0) { this.later.splice(i, 1); if (this.list.includes(l.ped) && l.ped.state !== 'flee' && l.ped.state !== 'dead') this.say(l.ped, l.text); } }
    this.passing(dt, p);
    const cam = this.game.camera.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ped = this.list[i];
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (ped.state === 'dead') {
        if (d > 90 || (ped.deadT > 45 && !this.game.traffic.inView(ped.x, ped.z, d))) { this.despawn(ped, i); continue; }
      } else if (d > (ped.fixed ? 110 : 150) && ped.state !== 'lie' || (ped.state === 'lie' && d > 200)) { this.despawn(ped, i); continue; }
      this.updatePed(ped, dt, d);
      if (ped.gone) { if (d < 12) g.audio.sfx('door_close', { x: ped.x, z: ped.z, vol: 0.25 }); this.despawn(ped, i); continue; } // in at their door
      this.glance(ped, dt, d);
      // animation LOD: far peds update less often
      const cd = Math.hypot(ped.x - cam.x, ped.z - cam.z);
      ped.char.object.visible = cd < 130;
      ped.animAcc += dt;
      if (cd < 45 || ped.animAcc > 0.1) { ped.char.update(ped.animAcc, ped.speed, { turn: ped.turn || 0, fidget: !ped.chat && !ped.fixed }); ped.animAcc = 0; }
      const o = ped.char.object;
      if (!ped.char.rag) { o.position.set(ped.x, ped.y, ped.z); o.rotation.set(0, ped.heading, 0); } // (a ragdoll places itself)
      if (ped.group && ped.state === 'idle') ped.speed = 0;
    }
    this.separate();
    this.dogs.update(dt);
    this.updateSpeech(dt);
  }
  // nobody walks through anybody: two who end up closer than their shoulders allow are eased apart (the one on the
  // move gives way to the one standing; sitters and the fallen do not move)
  separate() {
    const L = this.list, R = 0.58;
    const mob = (q) => q.state === 'walk' || q.state === 'idle' || q.state === 'stroll' || q.state === 'cross' || q.state === 'follow' || q.state === 'window' || q.state === 'chat' || q.state === 'flee' || q.state === 'call';
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!mob(a)) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!mob(b) && b.state !== 'sit') continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx > R || dx < -R || dz > R || dz < -R) continue;
        const d = Math.hypot(dx, dz);
        if (d >= R || d < 1e-4) continue;
        const push = R - d, ux = dx / d, uz = dz / d;
        const bm = mob(b), am = 1;
        const wa = bm ? (a.speed >= b.speed ? 0.65 : 0.35) : 1, wb = bm ? 1 - wa : 0;
        a.x -= ux * push * wa * am; a.z -= uz * push * wa * am;
        if (wb) { b.x += ux * push * wb; b.z += uz * push * wb; }
      }
    }
  }

  trySpawn(p) {
    const fwd = this.game.cam.forwardYaw;
    for (let a = 0; a < 6; a++) {
      const e = this.walkEdges[Math.floor(Math.random() * this.walkEdges.length)];
      const s = 2 + Math.random() * (e.len - 4);
      const side = Math.random() < 0.5 ? 1 : -1;
      const pt = this.sidePoint(e, s, side, this.tmp);
      const dx = pt.x - p.x, dz = pt.z - p.z, d = Math.hypot(dx, dz);
      if (d < 35 || d > 120) continue;
      const dot = (dx * Math.sin(fwd) + dz * Math.cos(fwd)) / d;
      if (d < 70 && dot > 0.3 && this.map.collider.raycast(p.x, p.z, pt.x, pt.z, 1.7, 1.7) > 0.98) continue;
      if (this.map.buildingAt(pt.x, pt.z)) continue;
      const ped = this.spawnAt(pt.x, pt.z);
      ped.edge = e; ped.side = side; ped.dir = Math.random() < 0.5 ? 1 : -1; ped.s = s;
      ped.state = 'walk';
      ped.idleT = 3 + Math.random() * 10;
      this.plan(ped);
      // a few are out walking the dog (more in the evening); some walk with someone
      const h = this.game.sky.hour;
      if (Math.random() < (h > 19 || h < 10 ? 0.22 : 0.1) && this.dogs.list.length < 7) this.dogs.attach(ped);
      else if (Math.random() < (h > 18 && h < 22.5 ? 0.3 : 0.14)) this.companion(ped);
      return;
    }
  }

  spawnAt(x, z, desc) {
    const char = this.makeChar(desc);
    const persona = personaOf(char.desc, Math.random());
    const ped = {
      char, x, z, y: 0, heading: Math.random() * Math.PI * 2, speed: 0, state: 'walk', t: 0, persona, seedT: Math.random() * 3,
      walkSpeed: (char.desc.elderly ? 0.85 : 1.2) + persona.hurry * 0.35 + Math.random() * 0.12, hp: 100, animAcc: 0,
      edge: null, side: 1, dir: 1, s: 0, fear: 0, talkT: 0, fixed: false,
      tough: !char.desc.elderly && (char.desc.gender === 'm' ? Math.random() < 0.3 : Math.random() < 0.08),
      cash: Math.random() < 0.8 ? 5 + Math.floor(Math.random() * 55) : 0, talks: 0,
    };
    char.object.position.set(x, 0, z);
    this.list.push(ped);
    return ped;
  }
  despawn(ped, i) {
    if (ped.call) this.endCall(ped, ped.call.started || ped.call.delay <= 0);
    if (ped.follower && ped.follower.leader === ped) ped.follower.leader = null;
    if (ped.leader && ped.leader.follower === ped) ped.leader.follower = null;
    if (ped.chat) { ped.chat.members = ped.chat.members.filter((m) => m !== ped); ped.chat = null; }
    if (ped.group && ped.group.members) ped.group.members = ped.group.members.filter((m) => m !== ped);
    if (ped.dog) this.dogs.detach(ped);
    this.game.scene.remove(ped.char.object);
    ped.char.dispose();
    if (ped.bench && !this.list.some((o) => o !== ped && o.bench === ped.bench)) ped.bench.used = false;
    if (ped.group && !(ped.group.members && ped.group.members.length)) ped.group.used = false;
    if (ped.fresco) this.leaveFresco(ped);
    this.list.splice(i ?? this.list.indexOf(ped), 1);
  }

  // ------------------------------------------------------------ "tomar el fresco": neighbours on chairs at their doors
  ensureFresco(p) {
    const h = this.game.sky.hour;
    const part = h >= 19.3 || h < 0.8 ? 'tarde' : h >= 10 && h < 13 ? 'mañana' : null;
    if (!part) return;
    for (const s of this.fresco) {
      if (s.part !== part) { s.part = part; s.skip = false; }
      if (s.used || s.skip) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 80 || d < 16) continue;
      // not every door is out every evening, fewer in the morning
      if (hash1(Math.floor(s.seed * 1e7) + (part === 'tarde' ? 11 : 23)) > (part === 'tarde' ? 0.78 : 0.3)) { s.skip = true; continue; }
      this.spawnFresco(s, part);
    }
  }
  spawnFresco(s, part) {
    const g = this.game, G = g.world.streetGeoms, mat = g.world.furnMat;
    const grp = { spot: s, members: [], chairs: [], part, talkT: 1 + Math.random() * 3, speaker: null, greetT: 0 };
    const rnd = mulberry32(Math.floor(s.seed * 1e9) >>> 0);
    const seats = part === 'mañana' ? s.seats.slice(0, 2) : s.seats;
    grp.seats = seats.slice();
    seats.forEach((seat, si) => {
      const ch = new THREE.Mesh(G[s.kind], mat);
      ch.position.set(seat.x, 0, seat.z);
      ch.rotation.y = seat.ang;
      ch.castShadow = true; ch.receiveShadow = true;
      g.scene.add(ch);
      grp.chairs.push(ch);
      const desc = randomDesc(rnd);
      desc.elderly = rnd() < 0.72;
      if (desc.elderly) {
        desc.hair = rnd() < 0.7 ? 6 : 5;
        if (desc.gender === 'f' && rnd() < 0.45) { desc.top = '#1d1f24'; desc.bottom = '#1d1f24'; } // de luto
        if (desc.gender === 'm' && rnd() < 0.6) { desc.accessory = rnd() < 0.6 ? 'boina' : desc.accessory; desc.accessoryColor = '#2a2a2a'; }
      }
      desc.cane = false;
      const fx = Math.sin(seat.ang), fz = Math.cos(seat.ang);
      const ped = this.spawnAt(seat.x + fx * 0.05, seat.z + fz * 0.05, desc);
      ped.fixed = true; ped.fresco = grp; ped.seatIndex = si;
      ped.state = 'sit'; ped.heading = seat.ang;
      ped.char.setBase(desc.elderly && desc.gender === 'f' && rnd() < 0.25 ? 'sitFan' : 'sitTalk');
      grp.members.push(ped);
    });
    // in the evening there is often a chair left for whoever wants to sit a while
    if (part === 'tarde' && rnd() < 0.45 && seats.length >= 2) {
      const a = seats[seats.length - 1], b = seats[seats.length - 2];
      const x = a.x + (a.x - b.x) * 0.95, z = a.z + (a.z - b.z) * 0.95;
      if (!this.map.buildingAt(x, z)) {
        const ch = new THREE.Mesh(G[s.kind], mat);
        ch.position.set(x, 0, z); ch.rotation.y = a.ang; ch.castShadow = true; ch.receiveShadow = true;
        g.scene.add(ch); grp.chairs.push(ch);
        grp.seats.push({ x, z, ang: a.ang, free: true });
      }
    }
    s.used = true; s.group = grp;
    this.frescoGroups.push(grp);
  }
  leaveFresco(ped) {
    const grp = ped.fresco;
    ped.fresco = null;
    if (!grp) return;
    const i = grp.members.indexOf(ped);
    if (i >= 0) grp.members.splice(i, 1);
    if (grp.speaker === ped) grp.speaker = null;
    if (grp.members.length) return;
    for (const c of grp.chairs) this.game.scene.remove(c);
    grp.chairs.length = 0;
    grp.spot.used = false; grp.spot.group = null;
    this.frescoGroups.splice(this.frescoGroups.indexOf(grp), 1);
  }
  updateFresco(dt) {
    const g = this.game, pl = g.player.pos;
    for (const grp of this.frescoGroups) {
      const sitting = grp.members.filter((m) => m.state === 'sit');
      if (!sitting.length) continue;
      const dP = Math.hypot(grp.spot.x - pl.x, grp.spot.z - pl.z);
      // they talk among themselves: one topic at a time, answering each other (npcmind.js TALKS)
      if (sitting.length >= 2 && (!grp.chat || grp.chat.done)) grp.chat = this.startChat(sitting.slice(), 'puerta', { loop: true });
      grp.greetT -= dt;
      const near = dP < 5.5 && !g.player.vehicle;
      if (near && grp.greetT <= 0) {
        // whoever sees you coming says hello, as suits the hour
        const m = sitting[Math.floor(Math.random() * sitting.length)];
        const female = g.player.char && g.player.char.desc && g.player.char.desc.gender === 'f';
        const h = g.sky.hour;
        this.say(m, h < 13.5 ? greetLine(m.persona, h) : pick(female ? FRASES.frescoGreetF : FRASES.frescoGreet));
        grp.greetT = 30 + Math.random() * 20;
        if (grp.chat) grp.chat.t = Math.max(grp.chat.t, 2.2); // (and the conversation waits a moment)
      }
      if (near) for (const m of sitting) if (!grp.chat || m !== grp.chat.speaker) m.char.lookAt(this._pv || (this._pv = new THREE.Vector3()).set(pl.x, 1.6, pl.z));
    }
  }

  // groups of neighbours chatting in the plazas (standing in a circle)
  ensurePlazaGroups(p) {
    if (!this.groupSpots) {
      this.groupSpots = [];
      for (const a of this.map.areas) {
        if (!['highway:pedestrian', 'place:square', 'leisure:park', 'amenity:marketplace'].includes(a.kind)) continue;
        let cx = 0, cz = 0; const r = a.ring;
        for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; }
        cx /= r.length / 2; cz /= r.length / 2;
        for (let k = 0; k < 3; k++) {
          const x = cx + Math.cos(k * 2.1 + a.ring.length) * (4 + k * 5), z = cz + Math.sin(k * 2.1 + a.ring.length) * (4 + k * 5);
          if (this.map.buildingAt(x, z)) continue;
          this.groupSpots.push({ x, z, used: false });
        }
      }
    }
    const h = this.game.sky.hour;
    if (h < 9 || h > 23.8) return;
    for (const gs of this.groupSpots) {
      if (gs.used) continue;
      const d = Math.hypot(gs.x - p.x, gs.z - p.z);
      if (d > 75 || d < 22) continue;
      gs.used = true;
      gs.members = [];
      const n = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
        const ped = this.spawnAt(gs.x + Math.cos(a) * 0.75, gs.z + Math.sin(a) * 0.75);
        this.joinGroup(ped, gs, a);
      }
      gs.chat = this.startChat(gs.members.slice(), 'plaza', { loop: true });
    }
    // now and then someone says goodbye and walks off; the last one does not stay talking to the air
    for (const gs of this.groupSpots) {
      if (!gs.members || !gs.members.length) continue;
      for (const m of gs.members.slice()) {
        m.stayT -= 0.25;
        if (m.stayT > 0 && gs.members.length > 1) continue;
        if (m.state !== 'idle') continue;
        this.leaveGroup(m, gs);
        break;
      }
    }
  }
  joinGroup(ped, gs, a = Math.random() * Math.PI * 2) {
    ped.fixed = true; ped.group = gs;
    ped.state = 'idle'; ped.idleT = 1e9;
    ped.x = gs.x + Math.cos(a) * 0.75; ped.z = gs.z + Math.sin(a) * 0.75;
    ped.heading = Math.atan2(gs.x - ped.x, gs.z - ped.z);
    ped.char.setBase('talk');
    ped.stayT = 90 + Math.random() * 240;
    (gs.members || (gs.members = [])).push(ped);
    if (gs.chat && !gs.chat.done) { gs.chat.members.push(ped); ped.chat = gs.chat; }
  }
  leaveGroup(ped, gs) {
    const others = gs.members.filter((m) => m !== ped);
    const bye = pick(BYE);
    this.say(ped, bye[0]);
    if (others[0]) this.later.push({ ped: others[0], t: 1.4, text: fillLine(bye[1], others[0].persona, ped.persona) });
    gs.members = others;
    if (gs.chat) { gs.chat.members = gs.chat.members.filter((m) => m !== ped); gs.chat.t = Math.max(gs.chat.t, 3); }
    ped.chat = null; ped.group = null; ped.fixed = false;
    ped.char.setBase(null); ped.char.speaking = false; ped.char.lookAt(null);
    this.rejoin(ped);
    ped.state = 'walk';
    this.plan(ped);
    if (!others.length) { gs.used = false; gs.chat = null; }
  }

  // benches in the Plaza de España & parks: elderly folks sitting (very Guareña)
  ensureBenchSitters(p) {
    const h = this.game.sky.hour;
    if (h < 8 || h > 23.5) return;
    for (const b of this.benches) {
      if (b.used) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d > 70 || d < 25) continue;
      if (hash1(Math.floor(b.x * 13 + b.z)) > 0.55) { b.used = true; continue; }
      b.used = true;
      const rnd = mulberry32(Math.floor(b.x * 7 + b.z * 3) >>> 0);
      const desc = randomDesc(rnd);
      desc.elderly = rnd() < 0.7;
      if (desc.elderly) { desc.hair = 6; if (desc.gender === 'm') { desc.accessory = 'boina'; desc.accessoryColor = '#2a2a2a'; } }
      desc.cane = false;
      const fx = Math.sin(b.ang), fz = Math.cos(b.ang), lx = fz, lz = -fx;
      const two = rnd() < 0.4;
      const sitters = [];
      for (let k = 0; k < (two ? 2 : 1); k++) {
        const o = two ? (k ? -0.42 : 0.42) : 0;
        const dk = k ? randomDesc(rnd) : desc;
        if (k) { dk.elderly = desc.elderly && rnd() < 0.8; if (dk.elderly) { dk.hair = 6; if (dk.gender === 'm') { dk.accessory = 'boina'; dk.accessoryColor = '#2a2a2a'; } } dk.cane = false; }
        const ped = this.spawnAt(b.x + fx * 0.12 + lx * o, b.z + fz * 0.12 + lz * o, dk);
        ped.fixed = true; ped.bench = b;
        ped.state = 'sit'; ped.heading = b.ang;
        ped.char.setBase(two ? 'sitTalk' : 'sit');
        sitters.push(ped);
      }
      if (two) this.startChat(sitters, 'banco', { loop: true });
    }
  }
  freeBench(x, z, r) {
    let best = null, bd = r;
    for (const b of this.benches) { if (b.used) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  sidePoint(e, s, side, out) {
    polySample(e.pts, e.cum, clamp(s, 0, e.len), out);
    const off = e.walkOnly ? (e.w / 2) * 0.6 : e.w / 2 + (e.sw > 0.5 ? e.sw * 0.5 : 0.6);
    out.x += -out.dz * off * side; out.z += out.dx * off * side;
    return out;
  }

  updatePed(ped, dt, dPlayer) {
    const g = this.game;
    ped.t += dt;
    if (ped.talkCd > 0) ped.talkCd -= dt;
    switch (ped.state) {
      case 'walk': {
        const e = ped.edge;
        if (!e) { ped.state = 'idle'; break; }
        const sp = ped.walkSpeed * (ped.slowK ?? 1);
        ped.s += ped.dir * sp * dt;
        const last = ped.route && ped.ri === ped.route.length - 1;
        // on the street of the place they are going to: the right side of it first (crossing where it is clear)
        if (last && ped.goal && ped.side !== ped.goal.side && Math.abs(ped.s - ped.goal.s) < 16) { this.startCross(ped); break; }
        if (last && ped.goal && (ped.dir > 0 ? ped.s >= ped.goal.s - 0.3 : ped.s <= ped.goal.s + 0.3)) { this.arrive(ped); break; }
        if (ped.s < 0 || ped.s > e.len) this.nextEdge(ped);
        const ee = ped.edge, na = this.map.nodes[ee.a], nb = this.map.nodes[ee.b];
        const ra = Math.min(ee.len * 0.45, (na && na.degree >= 3 ? na.radius || 0 : 0) + 0.4), rb = Math.max(ee.len * 0.55, ee.len - (nb && nb.degree >= 3 ? nb.radius || 0 : 0) - 0.4);
        const tgt = this.sidePoint(ee, clamp(ped.s + ped.dir * 1.5, ra, rb), ped.side, this.tmp);
        // keep to the right of whoever comes the other way, round whoever stands in the way, overtake the slow
        let lat = this.avoid(ped, dt);
        if (lat) { const room = e.walkOnly ? 1.2 : Math.max(0.3, (e.sw || 0) * 0.45); lat = clamp(lat, -room, room); } // (a step aside, not off the kerb)
        if (lat) { const tx = this.tmp.dx * ped.dir, tz = this.tmp.dz * ped.dir; tgt.x += -tz * lat; tgt.z += tx * lat; }
        this.steerTo(ped, tgt.x, tgt.z, sp, dt);
        // someone stops to read a message now and then; a wanderer stops to look about
        if (ped.persona.age !== 'mayor' && ped.t > 30 && Math.random() < dt * 0.003) { ped.state = 'idle'; ped.idleT = 3 + Math.random() * 4; ped.char.setBase('phone'); ped.t = 0; }
        else if (!ped.goal && Math.random() < dt * 0.02) { ped.state = 'idle'; ped.idleT = 2 + Math.random() * 6; }
        break;
      }
      case 'idle': {
        ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt));
        ped.idleT -= dt;
        if (ped.idleT <= 0) {
          if (!ped.group) ped.char.setBase(null);
          if (ped.resume === 'window' || ped.resume === 'stroll') { ped.state = ped.resume; ped.resume = null; break; }
          ped.resume = null;
          ped.state = ped.edge ? 'walk' : 'idle'; ped.idleT = 5;
          if (ped.state === 'walk' && !ped.route) this.plan(ped);
        }
        break;
      }
      case 'exit': {
        // out of their door and onto the pavement
        const t = ped.exitTo;
        if (!t || Math.hypot(t.x - ped.x, t.z - ped.z) < 0.4) { ped.state = 'walk'; ped.exitTo = null; if (!ped.route) this.plan(ped); break; }
        this.steerTo(ped, t.x, t.z, ped.walkSpeed * 0.8, dt);
        break;
      }
      case 'cross': {
        // at the kerb: a look one way and the other, wait for the cars, then across
        const c = ped.cross, e = ped.edge;
        if (!c || !e) { ped.state = 'walk'; break; }
        if (c.phase === 'walkTo') { // along the pavement to the zebra crossing
          const t = this.sidePoint(e, c.s, ped.side, this.tmp);
          this.steerTo(ped, t.x, t.z, ped.walkSpeed, dt);
          if (Math.hypot(t.x - ped.x, t.z - ped.z) < 0.7) c.phase = 'look';
          if (ped.t > 90) c.phase = 'look';
          break;
        }
        if (c.phase === 'look') {
          ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt));
          c.t -= dt;
          const t = polySample(e.pts, e.cum, clamp(c.s + (Math.floor(c.t * 1.3) % 2 ? 9 : -9), 0, e.len), this.tmp);
          ped.char.lookAt((ped._lc || (ped._lc = new THREE.Vector3())).set(t.x, 1.0, t.z));
          if (c.t <= 0 && (this.clearToCross(ped) || c.t < -14)) { c.phase = 'go'; ped.char.lookAt(null); }
        } else {
          const t = this.sidePoint(e, c.s + ped.dir * 1.2, c.to, this.tmp);
          this.steerTo(ped, t.x, t.z, ped.walkSpeed * 1.15, dt);
          if (Math.hypot(t.x - ped.x, t.z - ped.z) < 0.5) { ped.side = c.to; ped.walkSide = ped.side * ped.dir; ped.s = c.s + ped.dir * 1.2; ped.cross = null; ped.state = 'walk'; }
        }
        break;
      }
      case 'enter': {
        // in at the door they came for (the street side of it, then the threshold)
        const gl = ped.goal;
        if (!gl) { ped.state = 'idle'; ped.idleT = 3; break; }
        const tx = ped.enterPhase ? gl.fx : gl.x, tz = ped.enterPhase ? gl.fz : gl.z;
        this.steerTo(ped, tx, tz, Math.max(0.9, ped.walkSpeed * 0.85), dt);
        if (Math.hypot(tx - ped.x, tz - ped.z) < 0.45) {
          if (!ped.enterPhase && Math.hypot(gl.fx - gl.x, gl.fz - gl.z) > 0.3) ped.enterPhase = 1;
          else ped.gone = true;
        }
        if (ped.t > 60) ped.gone = true;
        break;
      }
      case 'window': {
        // a look in the shop window
        const gl = ped.goal;
        ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt));
        if (gl) ped.heading = dampAngle(ped.heading, Math.atan2(gl.fx - ped.x, gl.fz - ped.z), 4, dt);
        ped.windowT -= dt;
        if (ped.windowT <= 0) { if (Math.random() < 0.4) { ped.state = 'enter'; ped.enterPhase = 0; } else { ped.state = 'walk'; this.plan(ped); } }
        break;
      }
      case 'stroll': {
        // round the plaza or the park at an easy pace, a stop here and there
        const t = ped.strollTo;
        ped.strollT -= dt;
        if (ped.strollT <= 0 || !t) { this.rejoin(ped); ped.state = 'walk'; this.plan(ped); break; }
        if (Math.hypot(t.x - ped.x, t.z - ped.z) < 0.6) {
          if (ped.goal) ped.strollTo = this.pointNear(ped.goal.x, ped.goal.z, 9);
          ped.state = 'idle'; ped.idleT = 3 + Math.random() * 7; ped.resume = 'stroll';
          break;
        }
        this.steerTo(ped, t.x, t.z, ped.walkSpeed * 0.75, dt);
        break;
      }
      case 'toBench': {
        const b = ped.bench;
        if (!b) { ped.state = 'stroll'; break; }
        const fx = Math.sin(b.ang), fz = Math.cos(b.ang), bx = b.x + fx * 0.12, bz = b.z + fz * 0.12;
        if (Math.hypot(bx - ped.x, bz - ped.z) < 0.35) { ped.x = bx; ped.z = bz; ped.heading = b.ang; ped.state = 'sit'; ped.sitT = 50 + Math.random() * 160; ped.char.setBase('sit'); break; }
        this.steerTo(ped, bx, bz, ped.walkSpeed * 0.8, dt);
        break;
      }
      case 'follow': {
        // walking with someone: at their side, at their pace (and where they go in, in too)
        const L = ped.leader;
        if (!L || !this.list.includes(L) || L.state === 'dead' || L.state === 'fly' || L.state === 'lie') { ped.leader = null; this.rejoin(ped); ped.state = 'walk'; this.plan(ped); break; }
        if (L.state === 'flee') { ped.state = 'flee'; ped.fear = 1; ped.threat = L.threat; break; }
        if (L.state === 'enter' && L.goal) { ped.goal = L.goal; ped.state = 'enter'; ped.enterPhase = 0; break; }
        const hx = Math.sin(L.heading), hz = Math.cos(L.heading);
        const moving = L.speed > 0.3;
        let ox = hz * 0.68, oz = -hx * 0.68; // (at their right)
        const le = L.edge;
        if (le && moving && L.state === 'walk') {
          const q = polySample(le.pts, le.cum, clamp(L.s, 0, le.len), this.tmp2 || (this.tmp2 = {}));
          if (!le.walkOnly && (le.sw || 0) < 1.3) { ox = -hx * 0.9; oz = -hz * 0.9; } // a narrow pavement: one behind the other
          else if (!le.walkOnly) { ox = -q.dz * L.side * 0.68; oz = q.dx * L.side * 0.68; } // the side away from the road
        }
        const tx = L.x + ox * (moving ? 1 : 0.9) - hx * (moving ? 0.1 : -0.55), tz = L.z + oz * (moving ? 1 : 0.9) - hz * (moving ? 0.1 : -0.55);
        const d = Math.hypot(tx - ped.x, tz - ped.z);
        if (d < 0.12 && !moving) { ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt)); ped.heading = dampAngle(ped.heading, L.heading + (L.state === 'idle' ? -1.2 : 0), 4, dt); break; }
        this.steerTo(ped, tx, tz, clamp(L.speed * (1 + (d - 0.15) * 0.8), 0, L.walkSpeed * 1.5), dt);
        break;
      }
      case 'chat': {
        // two who have met: face to face until they have said what they had to say
        ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt));
        const o = ped.chatWith;
        if (o) ped.heading = dampAngle(ped.heading, Math.atan2(o.x - ped.x, o.z - ped.z), 5, dt);
        if (!ped.chat || ped.chat.done) { ped.char.setBase(null); ped.chat = null; ped.chatWith = null; this.rejoin(ped); ped.state = 'walk'; this.plan(ped); }
        break;
      }
      case 'call': {
        // a witness on the phone to the police: first they get away from you, then they call (you can stop them)
        const c = ped.call, pl = g.player;
        if (!c) { ped.state = 'idle'; ped.idleT = 2; break; }
        if (c.crime === 'cadaver') {
          const bx = c.x - ped.x, bz = c.z - ped.z, bl = Math.hypot(bx, bz);
          if (!c.started && bl > 2.2) { this.steerTo(ped, c.x, c.z, 3.2 * (ped.char.desc.elderly ? 0.5 : 1), dt); break; }
          if (!c.started) { c.started = true; ped.char.setBase('phone'); this.say(ped, pick(CALL.cadaver), true); this.mark(ped, '📱'); }
          ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt));
          ped.heading = dampAngle(ped.heading, Math.atan2(bx, bz), 4, dt);
          c.t += dt;
          if (c.t > c.dur) this.endCall(ped, true);
          break;
        }
        const tx = pl.vehicle ? pl.vehicle.x : pl.pos.x, tz = pl.vehicle ? pl.vehicle.z : pl.pos.z;
        let dx = ped.x - tx, dz = ped.z - tz;
        const l = Math.hypot(dx, dz) || 1;
        c.delay -= dt;
        if (c.delay > 0 || (l < 7 && !c.started)) {
          dx /= l; dz /= l;
          this.steerTo(ped, ped.x + dx * 5, ped.z + dz * 5, 4.6 * (ped.char.desc.elderly ? 0.45 : 1), dt);
          break;
        }
        if (!c.started) {
          c.started = true;
          ped.char.setBase('phone');
          this.say(ped, pick(CALL[c.crime] || CALL.any), true);
          this.mark(ped, '📱');
        }
        ped.speed = lerp(ped.speed, 0, 1 - Math.exp(-8 * dt));
        ped.heading = dampAngle(ped.heading, Math.atan2(-dx, -dz), 4, dt); // watching you while they describe you
        c.t += dt;
        if (c.t > c.dur) this.endCall(ped, true);
        break;
      }
      case 'sit':
        ped.speed = 0;
        if (ped.sitT !== undefined && !ped.fixed) {
          ped.sitT -= dt;
          if (ped.sitT <= 0) { ped.sitT = undefined; if (ped.bench) ped.bench.used = false; ped.bench = null; ped.char.setBase(null); this.rejoin(ped); ped.state = 'walk'; this.plan(ped); break; }
        }
        if (ped.fear > 0.6) { ped.char.setBase(null); ped.char.speaking = false; ped.char.lookAt(null); ped.state = 'flee'; ped.fixed = false; if (ped.bench) ped.bench.used = false; }
        break;
      case 'flee': {
        if (ped.call) { ped.state = 'call'; break; }
        const pl = g.player.pos;
        let dx = ped.x - (ped.threat ? ped.threat.x : pl.x), dz = ped.z - (ped.threat ? ped.threat.z : pl.z);
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        this.steerTo(ped, ped.x + dx * 5, ped.z + dz * 5, 5.2 * (ped.char.desc.elderly ? 0.45 : 1), dt);
        ped.fear -= dt * 0.12;
        if (ped.fear <= 0 && l > 25) { this.rejoin(ped); ped.state = ped.edge ? 'walk' : 'idle'; ped.char.setBase(null); }
        break;
      }
      case 'fly': {
        // the ragdoll has the body (thrown, falling, against the walls): follow its hips; down once it lies still
        this.followBody(ped);
        const rag = ped.char.rag;
        if (rag && rag.landed && !ped.thud) { ped.thud = true; g.audio.sfx('land', { x: ped.x, z: ped.z, vol: ped.koLong ? 0.4 : 1 }); }
        if (!rag || rag.sleeping || ped.t > 3.5) {
          ped.state = ped.hp <= 0 ? 'dead' : 'lie'; ped.lieT = ped.koLong ? 25 + Math.random() * 15 : 3 + Math.random() * 4;
          if (ped.state === 'dead') this.onDied(ped);
        }
        break;
      }
      case 'dead':
        ped.speed = 0; ped.deadT = (ped.deadT || 0) + dt;
        this.followBody(ped);
        break;
      case 'getup':
        // back on their feet (see Character.getUp), then off, shaken
        ped.speed = 0;
        if (!ped.char.gettingUp) {
          ped.state = 'flee'; ped.fear = 1;
          if (ped.koLong) { ped.koLong = false; ped.fear = 0.4; this.say(ped, pick(['¿Qué… qué ha pasao?', 'Ay, mi cabeza…', '¿Quién ha sido?'])); }
          else this.say(ped, pick(FRASES.punched));
        }
        break;
      case 'handsup': {
        // surrendering: faces the threat with the hands up until it goes away
        const pl = g.player.pos;
        ped.speed = 0;
        ped.heading = Math.atan2(pl.x - ped.x, pl.z - ped.z);
        ped.handsT -= dt;
        if (ped.handsT <= 0 || dPlayer > 22) {
          ped.char.setBase(null); ped.state = 'flee'; ped.fear = 1; ped.threat = { x: pl.x, z: pl.z };
          if (ped.pendingCall) { const q = ped.pendingCall; ped.pendingCall = null; if (Math.random() < 0.5) this.startCall(ped, q.crime, q.x, q.z, 1.5); } // scared stiff: maybe not
        }
        break;
      }
      case 'fight': {
        // a tough guy squares up to the player
        const pl = g.player;
        const dx = pl.pos.x - ped.x, dz = pl.pos.z - ped.z, d = Math.hypot(dx, dz) || 1;
        ped.fightT -= dt;
        if (pl.vehicle || d > 25 || ped.fightT <= 0 || g.player.mode !== 'foot') { ped.char.setBase(null); this.rejoin(ped); ped.state = ped.edge ? 'walk' : 'idle'; break; }
        if (d > 1.05) this.steerTo(ped, pl.pos.x, pl.pos.z, 4.4, dt);
        else {
          ped.speed = 0; ped.heading = Math.atan2(dx, dz);
          ped.punchT = (ped.punchT ?? 0.4) - dt;
          if (ped.punchT <= 0) {
            ped.punchT = 0.8 + Math.random() * 0.6;
            ped.char.play(Math.random() < 0.5 ? 'punch' : 'punch2', 0.45);
            if (!pl.knock) setTimeout(() => {
              if (ped.state !== 'fight' || Math.hypot(pl.pos.x - ped.x, pl.pos.z - ped.z) > 1.5) return;
              g.audio.sfx('punch_hit', { x: pl.pos.x, z: pl.pos.z });
              pl.damage(6 + Math.random() * 4);
              if (Math.random() < 0.12) pl.knockDown((dx / d) * 3, (dz / d) * 3, 4);
            }, 180);
          }
        }
        break;
      }
      case 'lie': {
        ped.speed = 0;
        this.followBody(ped);
        if (ped.hp <= 0) { ped.state = 'dead'; this.onDied(ped); break; }
        ped.lieT -= dt;
        if (ped.lieT <= 0 && ped.hp > 0) {
          // up again: from the back or the front, however they fell
          const up = ped.char.getUp();
          if (up) { ped.x = up.x; ped.z = up.z; ped.heading = up.heading; }
          ped.y = 0; ped.state = 'getup';
        }
        break;
      }
    }
    // collisions with walls & player; reactions
    // guns pointed at you: hands up
    const W = g.weapons;
    if (W && W.aiming && dPlayer < 16 && (ped.state === 'walk' || ped.state === 'idle' || ped.state === 'sit' || ped.state === 'flee')) {
      const pl = g.player.pos, yaw = g.cam.forwardYaw;
      const dx = ped.x - pl.x, dz = ped.z - pl.z;
      if ((dx * Math.sin(yaw) + dz * Math.cos(yaw)) / (dPlayer || 1) > 0.975 && g.map.collider.raycast(pl.x, pl.z, ped.x, ped.z, 1.4, 1.4) > 0.97) this.surrender(ped);
    }
    // walls stop everyone on their feet — witnesses running off to phone the police too (they used to go through them)
    const st = ped.state;
    if (st === 'walk' || st === 'flee' || st === 'idle' || st === 'fight' || st === 'call' || st === 'cross' || st === 'stroll' || st === 'follow' || st === 'window' || st === 'chat' || st === 'toBench') {
      const pos = { x: ped.x, z: ped.z };
      g.map.collider.resolveCircle(pos, 0.3);
      ped.x = pos.x; ped.z = pos.z;
      const pl = g.player;
      if (!pl.vehicle && dPlayer < 0.75 && !pl.knock) {
        const dx = ped.x - pl.pos.x, dz = ped.z - pl.pos.z, l = Math.hypot(dx, dz) || 1;
        ped.x = pl.pos.x + (dx / l) * 0.75; ped.z = pl.pos.z + (dz / l) * 0.75;
        if (!ped.talkCd) {
          // a knock in passing is one thing; the third time, quite another
          ped.bumps = (ped.bumps || 0) + 1;
          const pv = Math.hypot(pl.vel.x, pl.vel.z);
          if (ped.bumps >= 3 && ped.tough && st !== 'fight' && st !== 'flee') this.startFight(ped);
          else this.say(ped, ped.bumps >= 3 ? pick(['¡Ya está bien, hombre!', '¿Me vas a dejar en paz o qué?', '¡Que me dejes!']) : pick(pv > 2.5 ? FRASES.bump : CLOSE));
          ped.talkCd = 4;
        }
      }
      if (st !== 'flee' && st !== 'fight' && st !== 'call' && !pl.vehicle && dPlayer < 6) this.noticePlayer(ped, dt, dPlayer);
    }
    // vehicles hitting pedestrians
    if (ped.state !== 'fly' && ped.state !== 'lie' && ped.state !== 'dead') this.checkVehicles(ped);
    // once a second: rescue anyone who ended up inside a building, unstick walkers, notice someone lying in the street
    ped.chk = (ped.chk ?? Math.random()) - dt;
    if (ped.chk <= 0) {
      ped.chk = 1;
      if ((ped.state === 'walk' || ped.state === 'idle') && !ped.call && g.mode === 'normal') this.lookForBodies(ped);
      if (ped.state !== 'fly' && ped.state !== 'enter' && ped.state !== 'exit' && this.map.buildingAt(ped.x, ped.z)) this.rescue(ped); // (a doorway is half inside)
      if (ped.state === 'walk') {
        const moved = Math.hypot(ped.x - (ped.px ?? 1e9), ped.z - (ped.pz ?? 1e9));
        ped.px = ped.x; ped.pz = ped.z;
        if (moved < 0.35) {
          ped.stuckN = (ped.stuckN || 0) + 1;
          if (ped.stuckN === 2) ped.side = -ped.side;
          else if (ped.stuckN === 3) ped.dir = -ped.dir;
          else if (ped.stuckN >= 4) { this.rescue(ped); ped.stuckN = 0; }
        } else ped.stuckN = 0;
      }
    }
  }

  // you, close by: a hello that suits the hour (if they see you), unease if you follow them, a step back if you crowd them
  noticePlayer(ped, dt, d) {
    const g = this.game, pl = g.player;
    const toX = pl.pos.x - ped.x, toZ = pl.pos.z - ped.z;
    const ahead = toX * Math.sin(ped.heading) + toZ * Math.cos(ped.heading);
    const pv = Math.hypot(pl.vel.x, pl.vel.z);
    if (d < 3.4 && !ped.chat && !ped.talkCd && !(ped.greetedT > this.now - 120) && ahead > 0.4 * d && Math.random() < dt * (0.4 + ped.persona.chatty)) {
      this.say(ped, greetLine(ped.persona, g.sky.hour)); ped.talkCd = 8; ped.greetedT = this.now;
    }
    if (ped.state === 'walk' && d < 5) {
      if (ahead < -0.8 && pv > 0.6) ped.followedT = (ped.followedT || 0) + dt; else ped.followedT = Math.max(-60, (ped.followedT || 0) - dt * 0.5);
      if (ped.followedT > 9) { ped.followedT = -45; this.say(ped, pick(FOLLOWED)); ped.walkSpeed = Math.min(2.1, ped.walkSpeed * 1.3); }
    }
    if (d < 1.1 && pv < 0.3 && (ped.state === 'idle' || ped.state === 'window' || ped.state === 'stroll') && !ped.fixed) {
      ped.closeT = (ped.closeT || 0) + dt;
      if (ped.closeT > 2.5 && !ped.talkCd) {
        this.say(ped, pick(CLOSE)); ped.talkCd = 6; ped.closeT = 0;
        const l = d || 1; ped.x -= (toX / l) * 0.45; ped.z -= (toZ / l) * 0.45;
      }
    } else ped.closeT = 0;
  }

  // ------------------------------------------------------------ going somewhere
  // where to now, and the way there (npcmind.js); false: no plan (they just wander the streets)
  plan(ped, goal = null) {
    const g = this.game;
    if (!this.places || !ped.edge) { ped.goal = null; ped.route = null; return false; }
    const gl = goal || this.places.choose(ped.persona, g.sky.hour, weekday(g.sky), ped.x, ped.z);
    const r = gl && routeBetween(this.map, { edge: ped.edge, s: clamp(ped.s, 0, ped.edge.len) }, { edge: gl.edge, s: gl.s }, this.walkOk);
    if (!r) { ped.goal = null; ped.route = null; return false; }
    ped.walkSide = ped.walkSide || (ped.side * ped.dir) || 1;
    ped.goal = gl; ped.route = r; ped.ri = 0;
    if (r[0].edge !== ped.edge) { ped.edge = r[0].edge; ped.s = r[0].dir > 0 ? 0.5 : ped.edge.len - 0.5; }
    ped.dir = r[0].dir;
    ped.side = ped.walkSide * ped.dir;
    ped.t = 0;
    if (ped.follower) { ped.walkSpeed = Math.min(ped.walkSpeed, ped.follower.walkSpeed); }
    return true;
  }
  arrive(ped) {
    const gl = ped.goal;
    ped.route = null;
    if (!gl) { ped.state = 'walk'; return; }
    if (gl.open) {
      // a plaza or a park: a bench for the older ones, a chat if someone is about, a stroll
      const b = ped.persona.age !== 'joven' && Math.random() < 0.55 ? this.freeBench(ped.x, ped.z, 32) : null;
      if (b && !ped.follower) { b.used = true; ped.bench = b; ped.state = 'toBench'; return; }
      const gs = (this.groupSpots || []).find((q) => q.used && q.members && q.members.length && q.members.length < 4 && Math.hypot(q.x - ped.x, q.z - ped.z) < 25);
      if (gs && !ped.follower && Math.random() < 0.5) {
        const m0 = gs.members[0];
        this.say(m0, fillLine(pick(['¡Hombre, @! ¿Qué te cuentas?', '¡Mira quién viene! Hola, @.', '¡Hola, @! Ven pa cá.']), m0.persona, ped.persona));
        this.later.push({ ped, t: 1.2, text: pick(['¡Buenas a todos!', '¡Hola, hola!', 'Aquí, a ver qué se cuenta.']) });
        this.joinGroup(ped, gs);
        return;
      }
      const mate = !ped.follower && this.list.find((o) => o !== ped && !o.chat && !o.leader && !o.follower && (o.state === 'stroll' || (o.state === 'idle' && !o.fixed)) && Math.hypot(o.x - ped.x, o.z - ped.z) < 10);
      if (mate) { this.pairChat(ped, mate, 'plaza'); return; }
      ped.state = 'stroll'; ped.strollT = 20 + Math.random() * 40; ped.strollTo = this.pointNear(gl.x, gl.z, 8);
      return;
    }
    if (gl.kind === 'tienda' && Math.random() < 0.55) { ped.state = 'window'; ped.windowT = 5 + Math.random() * 9; return; }
    ped.state = 'enter'; ped.enterPhase = 0; ped.t = 0;
  }
  // somewhere to stand within r of (x, z), out in the open
  pointNear(x, z, r) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!this.map.buildingAt(px, pz) && this.map.collider.raycast(x, z, px, pz, 1, 0.4) > 0.98) return { x: px, z: pz };
    }
    return { x, z };
  }
  startCross(ped) {
    ped.state = 'cross';
    ped.cross = { phase: 'look', t: 0.7 + Math.random() * 0.8, s: ped.s, to: -ped.side };
    // a zebra crossing a little way along this street: over there, not just anywhere
    const zs = this.zebrasOf(ped.edge);
    let best = null;
    for (const zs1 of zs) if (Math.abs(zs1 - ped.s) < 35 && (!best || Math.abs(zs1 - ped.s) < Math.abs(best - ped.s))) best = zs1;
    if (best !== null && Math.abs(best - ped.s) > 1.5) { ped.cross.s = best; ped.cross.phase = 'walkTo'; }
  }
  // where the zebra crossings are along an edge (the crossing points of the map within 4 m of it)
  zebrasOf(e) {
    if (!e) return [];
    if (!this._zebras) this._zebras = new Map();
    let a = this._zebras.get(e.id);
    if (a) return a;
    a = [];
    const map = this.map;
    if (!this._zpois) this._zpois = map.pois.filter((p) => p.kind === 'highway:crossing');
    for (const p of this._zpois) {
      if (Math.abs(p.x - e.pts[0]) > e.len + 10 && Math.abs(p.x - e.pts[e.pts.length - 2]) > e.len + 10) continue;
      const q = polyNearest(e.pts, e.cum, p.x, p.z);
      if (q.d < e.w / 2 + 4) a.push(q.s);
    }
    this._zebras.set(e.id, a);
    return a;
  }
  // nothing coming: no car within a few metres, none heading this way along the street
  clearToCross(ped) {
    for (const v of this.game.fleet.vehicles) {
      const dx = ped.x - v.x, dz = ped.z - v.z, d = Math.hypot(dx, dz);
      if (d > 28) continue;
      const sp = Math.hypot(v.vx || 0, v.vz || 0);
      if (d < 5 && sp > 0.4) return false;
      if (sp > 1.5 && (v.vx * dx + v.vz * dz) / (sp * d) > 0.55) return false;
    }
    return true;
  }
  // the lateral step aside (m, + to the right) a walker takes for whoever is in the way
  avoid(ped, dt) {
    const hx = Math.sin(ped.heading), hz = Math.cos(ped.heading);
    let want = 0, slow = 1;
    // is there room to step aside? (a facade on that side, a car, the kerb of a narrow alley)
    const room = (k) => this.map.collider.raycast(ped.x, ped.z, ped.x - hz * k * 0.95, ped.z + hx * k * 0.95, 1, 0.3) > 0.97;
    const look = (ox, oz, oh, osp, standing) => {
      const dx = ox - ped.x, dz = oz - ped.z;
      const fwd = dx * hx + dz * hz;
      if (fwd < -0.3 || fwd > (oh < -0.3 ? 6.5 : 3.2)) return;  // (someone coming the other way is seen from further off)
      const lat = dx * -hz + dz * hx; // (+: on their right)
      if (Math.abs(lat) > 1.25) return;
      if (fwd > 0 && fwd < 0.9 && Math.abs(lat) < 0.55) slow = Math.min(slow, 0.25);     // about to bump: almost stop
      if (oh < -0.3) { if (room(1)) want = Math.max(want, 0.75); }                    // coming the other way: keep right (if the wall lets you: else they will)
      else if (!standing && oh > 0.5 && osp < ped.walkSpeed - 0.15) { if (fwd < 1.4) { const k = lat > 0 ? -1 : 1; want = room(k) ? k * 0.7 : 0; if (!want) slow = Math.min(slow, 0.7); } else slow = Math.min(slow, 0.85); } // overtake
      else { let k = lat > 0 ? -1 : 1; if (!room(k)) k = -k; want = room(k) ? k * 0.7 : 0; if (!want) slow = Math.min(slow, 0.3); } // round whoever stands there
    };
    for (const o of this.list) {
      if (o === ped || o === ped.leader || o === ped.follower || o.state === 'dead' || o.state === 'lie' || o.state === 'fly') continue;
      if (Math.abs(o.x - ped.x) > 6.6 || Math.abs(o.z - ped.z) > 6.6) continue;
      const moving = o.speed > 0.3;
      look(o.x, o.z, moving ? Math.sin(o.heading) * hx + Math.cos(o.heading) * hz : 0, o.speed, !moving);
    }
    const pl = this.game.player;
    if (!pl.vehicle && pl.mode === 'foot') { const pv = Math.hypot(pl.vel.x, pl.vel.z); look(pl.pos.x, pl.pos.z, pv > 0.3 ? (pl.vel.x * hx + pl.vel.z * hz) / pv : 0, pv, pv < 0.3); }
    ped.lat = (ped.lat || 0) + (want - (ped.lat || 0)) * Math.min(1, dt * (want ? 5 : 1.6)); // (aside quickly, back slowly)
    ped.slowK = lerp(ped.slowK ?? 1, slow, Math.min(1, dt * 3));
    return Math.abs(ped.lat) > 0.01 ? ped.lat : 0;
  }
  // two neighbours who pass each other: a greeting, and its answer
  passing(dt, p) {
    this.passT = (this.passT || 0) - dt;
    if (this.passT > 0) return;
    this.passT = 0.3;
    const h = this.game.sky.hour, part = partOfDay(h), now = this.now;
    const W = this.list.filter((q) => (q.state === 'walk' || q.state === 'stroll') && !q.leader && Math.abs(q.x - p.x) < 18 && Math.abs(q.z - p.z) < 18);
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
      const a = W[i], b = W[j];
      if (a.follower === b || b.follower === a) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 2.6 || d < 0.6) continue;
      if (Math.sin(a.heading) * Math.sin(b.heading) + Math.cos(a.heading) * Math.cos(b.heading) > -0.4) continue; // (they meet, face to face)
      if (a.passed === b || b.passed === a || a.greetedT > now - 25 || b.greetedT > now - 25) continue;
      a.passed = b; b.passed = a;
      const k = (a.persona.age === 'mayor' || b.persona.age === 'mayor' ? 0.75 : 0.35) * (a.persona.chatty + b.persona.chatty) * 0.6;
      if (Math.random() > k) continue;
      const L = pick(PASSING[part] || PASSING.tarde);
      a.greetedT = b.greetedT = now;
      this.say(a, fillLine(L[0], a.persona, b.persona));
      this.later.push({ ped: b, t: 1.1 + Math.random() * 0.5, text: fillLine(L[1], b.persona, a.persona) });
      // now and then the two of them stop for a chat
      if (Math.random() < (a.persona.age === 'mayor' && b.persona.age === 'mayor' ? 0.35 : 0.12) && !a.follower && !b.follower) this.pairChat(a, b, 'calle');
    }
  }
  // someone to walk with: same age, same plan, side by side, talking
  companion(L) {
    if (!L.route) return null;
    const rnd = Math.random;
    const d = randomDesc(this.rnd);
    d.elderly = L.char.desc.elderly;
    if (d.elderly) { d.hair = rnd() < 0.7 ? 6 : 5; d.cane = false; }
    const hx = Math.sin(L.heading), hz = Math.cos(L.heading);
    const f = this.spawnAt(L.x + hz * 0.7, L.z - hx * 0.7, d);
    f.state = 'follow'; f.leader = L; L.follower = f;
    f.edge = L.edge; f.s = L.s; f.dir = L.dir; f.side = L.side; f.heading = L.heading;
    if (L.persona.age === 'mayor' || f.persona.age === 'mayor') { L.walkSpeed = Math.min(L.walkSpeed, f.walkSpeed, 1.05); }
    else L.walkSpeed = Math.min(L.walkSpeed, f.walkSpeed);
    f.persona.age = L.persona.age;
    this.startChat([L, f], 'calle', { loop: true });
    return f;
  }
  // two who have met stop to talk (and then each goes their way)
  pairChat(a, b, where) {
    for (const [m, o] of [[a, b], [b, a]]) { m.state = 'chat'; m.chatWith = o; m.route = null; m.char.setBase('talk'); }
    // the second one comes to stand in front of the first
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    if (l > 1.3) { b.x = a.x + (dx / l) * 1.1; b.z = a.z + (dz / l) * 1.1; }
    const c = this.startChat([a, b], where, {
      loop: false,
      onEnd: () => {
        const bye = pick(BYE);
        if (this.list.includes(a)) this.say(a, fillLine(bye[0], a.persona, b.persona));
        if (this.list.includes(b)) this.later.push({ ped: b, t: 1.3, text: fillLine(bye[1], b.persona, a.persona) });
        for (const m of [a, b]) { m.chat = null; }
      },
    });
    return c;
  }
  // people come out of their houses and of the shops (where you can see them do it)
  spawnFromDoor(p) {
    const g = this.game, h = g.sky.hour;
    if (!this.places || h < 7 || h > 23.4) return false;
    const shopsOpen = (h >= 9 && h < 14) || (h >= 17.5 && h < 21);
    const doors = this.places.doors;
    for (let a = 0; a < 6; a++) {
      let d = null;
      if (shopsOpen && Math.random() < 0.35 && g.shops && g.shops.list.length) { const sh = g.shops.list[Math.floor(Math.random() * g.shops.list.length)]; d = { x: sh.x, z: sh.z, wx: sh.fx, wz: sh.fz }; }
      else if (doors.length) d = doors[Math.floor(Math.random() * doors.length)];
      if (!d) continue;
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < 16 || dist > 65 || this.map.buildingAt(d.x, d.z)) continue;
      const q = this.map.nearestEdge(d.x, d.z, 14, this.walkOk);
      if (!q || q.d > 14) continue;
      const t = this.map.sample(q.edge, q.s, {});
      const side = (d.x - t.x) * -t.dz + (d.z - t.z) * t.dx >= 0 ? 1 : -1;
      const sx = d.wx ?? d.x, sz = d.wz ?? d.z;
      const ped = this.spawnAt(sx, sz);
      ped.state = 'exit'; ped.exitTo = this.sidePoint(q.edge, q.s, side, {});
      ped.edge = q.edge; ped.s = q.s; ped.side = side; ped.dir = Math.random() < 0.5 ? 1 : -1; ped.walkSide = side * ped.dir;
      ped.heading = Math.atan2(ped.exitTo.x - sx, ped.exitTo.z - sz);
      this.plan(ped);
      if (dist < 25) g.audio.sfx('door_open', { x: sx, z: sz, vol: 0.25 });
      return true;
    }
    return false;
  }
  // after mass, the people come out of Santa María (and some stay a while at the door, talking)
  churchCrowd(p) {
    const g = this.game, lm = g.world && g.world.landmarks && g.world.landmarks.poi;
    if (!lm || !lm.churchDoor || !this.places) return;
    const m = massTime(g.sky.hour, weekday(g.sky));
    if (!m || m.phase !== 'salida') { this.churchOut = 0; return; }
    const door = lm.churchDoor, portal = lm.churchPortal || door;
    if (Math.hypot(door.x - p.x, door.z - p.z) > 160 || this.churchOut >= 12 || Math.random() > 0.18) return;
    const q = this.map.nearestEdge(door.x, door.z, 20, this.walkOk);
    if (!q || q.d > 20) return;
    this.churchOut++;
    const d = randomDesc(this.rnd);
    d.elderly = Math.random() < 0.65; if (d.elderly) { d.hair = 6; d.cane = false; if (d.gender === 'm') { d.accessory = 'boina'; d.accessoryColor = '#2a2a2a'; } }
    const ped = this.spawnAt(portal.x + (Math.random() - 0.5) * 1.2, portal.z + (Math.random() - 0.5) * 1.2, d);
    ped.state = 'exit'; ped.exitTo = this.pointNear(door.x, door.z, 3);
    ped.edge = q.edge; ped.s = q.s; ped.side = 1; ped.dir = Math.random() < 0.5 ? 1 : -1; ped.walkSide = ped.dir;
    this.plan(ped);
    // a word at the door with whoever came out before
    const mate = this.list.find((o) => o !== ped && o.state === 'walk' && !o.chat && !o.leader && !o.follower && Math.hypot(o.x - door.x, o.z - door.z) < 8);
    if (mate && Math.random() < 0.45) setTimeout(() => { if (this.list.includes(ped) && this.list.includes(mate) && ped.state === 'walk' && mate.state === 'walk') this.pairChat(ped, mate, 'iglesia'); }, 2500);
  }

  // put a pedestrian back on the nearest sidewalk (outside buildings)
  rescue(ped) {
    const q = this.map.nearestEdge(ped.x, ped.z, 60, (e) => e.walk && !e.blocked && !e.dirt);
    if (!q) return;
    ped.edge = q.edge; ped.s = q.s;
    if (!ped.dir) ped.dir = 1;
    for (const side of [ped.side || 1, -(ped.side || 1)]) {
      const pt = this.sidePoint(q.edge, q.s, side, {});
      if (!this.map.buildingAt(pt.x, pt.z)) { ped.x = pt.x; ped.z = pt.z; ped.side = side; return; }
    }
    const c = this.map.sample(q.edge, q.s, {});
    ped.x = c.x; ped.z = c.z;
  }
  // after fleeing, walk on along whatever street is closest
  rejoin(ped) {
    const q = this.map.nearestEdge(ped.x, ped.z, 40, (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track');
    if (!q) return;
    ped.edge = q.edge; ped.s = q.s;
    const d = this.map.sample(q.edge, q.s, {});
    const lat = (ped.x - d.x) * -d.dz + (ped.z - d.z) * d.dx;
    ped.side = lat >= 0 ? 1 : -1;
    if (!ped.dir) ped.dir = Math.random() < 0.5 ? 1 : -1;
  }

  steerTo(ped, tx, tz, speed, dt) {
    const dx = tx - ped.x, dz = tz - ped.z;
    const want = Math.atan2(dx, dz);
    const prev = ped.heading;
    ped.heading = dampAngle(ped.heading, want, 7, dt);
    ped.turn = wrapAngle(ped.heading - prev) / Math.max(dt, 1e-3) * 0.3;
    ped.speed = lerp(ped.speed, speed, 1 - Math.exp(-5 * dt));
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
  }

  // round the corner onto the next street: on the pavement of the corner they are at (not across the junction), from
  // just past the junction's mouth
  enterEdge(ped, e, dir) {
    ped.edge = e; ped.dir = dir;
    const n0 = this.map.nodes[dir > 0 ? e.a : e.b], r0 = Math.min(e.len * 0.45, (n0 && n0.degree >= 3 ? n0.radius || 0 : 0) + 0.4);
    ped.s = dir > 0 ? r0 : e.len - r0;
    let best = 1, bd = Infinity;
    for (const side of [1, -1]) { const q = this.sidePoint(e, ped.s, side, this.tmp); const d = Math.hypot(q.x - ped.x, q.z - ped.z); if (d < bd) { bd = d; best = side; } }
    ped.side = best; ped.walkSide = best * dir;
  }
  nextEdge(ped) {
    const e = ped.edge;
    // on their way somewhere: the next street of the route (they cross over, if they must, where they are going)
    if (ped.route && ped.ri < ped.route.length - 1) {
      const st = ped.route[++ped.ri];
      this.enterEdge(ped, st.edge, st.dir);
      return;
    }
    ped.route = null; ped.goal = null;
    const nodeId = ped.dir > 0 ? e.b : e.a;
    const node = this.map.nodes[nodeId];
    const opts = node.edges.map((id) => this.map.edges[id]).filter((x) => x.id !== e.id && x.walk && !x.blocked && !x.dirt && x.cls !== 'track' && x.len > 3);
    if (!opts.length) { ped.dir = -ped.dir; ped.s = clamp(ped.s, 0, e.len); return; }
    const ne = opts[Math.floor(Math.random() * opts.length)];
    this.enterEdge(ped, ne, ne.a === nodeId ? 1 : -1);
    if (Math.random() < 0.1 && !ne.walkOnly && ne.w > 4) this.startCross(ped); // over to the other side, looking out for cars
  }

  checkVehicles(ped) {
    const g = this.game;
    for (const v of g.fleet.vehicles) {
      if (v.vel < 1.2) continue;
      const dx = ped.x - v.x, dz = ped.z - v.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lf = dx * fx + dz * fz, ll = dx * -fz + dz * fx;
      if (Math.abs(lf) < v.hl + 0.3 && Math.abs(ll) < v.hw + 0.3) {
        if (v.vel > 3.2) this.knock(ped, v.vx * 0.85, v.vz * 0.85, v);
        else if (ped.state === 'sit') {
          // someone sitting at the door gets up and moves away instead of being shoved into the wall
          ped.fear = 1; ped.threat = { x: v.x, z: v.z };
          if (!ped.talkCd) { this.say(ped, pick(FRASES.car)); ped.talkCd = 3; }
        } else {
          const s = Math.sign(ll) || 1;
          const pos = { x: ped.x - fz * s * 0.3, z: ped.z + fx * s * 0.3 };
          g.map.collider.resolveCircle(pos, 0.3);
          ped.x = pos.x; ped.z = pos.z;
          if (!ped.talkCd) { this.say(ped, pick(FRASES.car)); ped.talkCd = 3; }
        }
        return;
      }
      // dodge cars driving on the sidewalk towards them
      if (v.driver === 'player' && lf > 0 && lf < 12 && Math.abs(ll) < 2.2 && v.speed > 4 && ped.state !== 'flee' && !ped.call) {
        ped.state = 'flee'; ped.fear = 0.6; ped.threat = { x: v.x, z: v.z };
        if (!ped.talkCd) { this.say(ped, pick(this.map.roadAt && !this.map.roadAt(v.x, v.z, 0.3) ? FRASES.carWalk : FRASES.car)); ped.talkCd = 3; }
      }
    }
  }

  knock(ped, vx, vz, byVehicle = null) {
    if (ped.state === 'fly' || ped.state === 'lie') return;
    if (ped.call) this.endCall(ped, false);
    ped.pendingCall = null;
    ped.state = 'fly'; ped.t = 0; ped.thud = false;
    const sp = Math.hypot(vx, vz);
    ped.hp -= sp * 6;
    // a car sweeps the legs out and throws the body up over it; a blow sends the top half back (killed: the knees go
    // and there is no fight left in it)
    const dead = ped.hp <= 0;
    if (byVehicle) this.fall(ped, { vel: [vx * 0.9, 1.6 + sp * 0.13, vz * 0.9], legs: 0.5, up: -0.2, tone: dead ? 0.15 : 0.55 });
    else this.fall(ped, { vel: [vx * 0.8, dead ? 0.2 : 0.7, vz * 0.8], up: 0.8, legs: -0.3, tone: dead ? 0.1 : 0.75, buckle: dead ? 0.9 : 0 });
    if (ped.bench) { ped.bench.used = false; ped.bench = null; ped.fixed = false; }
    this.game.audio.sfx(ped.char.desc.gender === 'f' ? 'yelp_f' : 'yelp_m', { x: ped.x, z: ped.z });
    this.game.audio.sfx('punch_hit', { x: ped.x, z: ped.z, vol: 1.2 });
    this.scare(ped.x, ped.z, 18, byVehicle);
    if (byVehicle && byVehicle.driver === 'player') this.game.police.crime('atropello', ped.x, ped.z, { victim: ped });
  }

  // people notice you: walking past or standing about, someone you come close to (in front of them) looks at you for
  // a moment — the eyes first, then the head, the chest on a big turn (Character.lookAt) — longer if you run at them
  glance(ped, dt, d) {
    const free = (ped.state === 'walk' || ped.state === 'idle') && !ped.group && !ped.bench && !ped.call;
    if (!free) { if (ped.lookT > 0) { ped.lookT = 0; ped.char.lookAt(null); } return; }
    const pl = this.game.player;
    if (ped.lookT > 0) {
      ped.lookT -= dt;
      if (ped.lookT <= 0 || d > 10 || pl.vehicle) { ped.lookT = 0; ped.char.lookAt(null); ped.lookCd = 5 + Math.random() * 10; }
      else ped.char.lookAt((this._lp || (this._lp = new THREE.Vector3())).set(pl.pos.x, pl.pos.y + 1.55 * (pl.char.scale || 1), pl.pos.z));
      return;
    }
    ped.lookCd = (ped.lookCd ?? Math.random() * 4) - dt;
    if (ped.lookCd > 0 || d > 6.5 || pl.vehicle || pl.mode !== 'foot') return;
    const dx = pl.pos.x - ped.x, dz = pl.pos.z - ped.z;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - ped.heading));
    if (ang > 1.9) return; // (behind them: they don't see you)
    const fast = Math.hypot(pl.vel.x, pl.vel.z) > 4;
    if (Math.random() < (fast ? 0.95 : 0.7)) ped.lookT = (fast ? 2 : 1.1) + Math.random() * 2.2;
    else ped.lookCd = 2 + Math.random() * 4;
  }
  // the body goes limp and falls (a ragdoll: see Character.ragdoll); o: vel, legs, up, buckle, tone, dead
  fall(ped, o) {
    const col = this.map.collider;
    this.ragEnv = this.ragEnv || { floor: () => 0, collide: (p, r) => col.resolveCircle(p, r), crosses: (ax, az, bx, bz) => col.crosses && col.crosses(ax, az, bx, bz) };
    ped.char.ragdoll({ env: this.ragEnv, dead: ped.hp <= 0, ...o });
  }
  followBody(ped) {
    ped.speed = 0;
    if (!ped.char.rag) return;
    const p = ped.char.ragPos(this._rp || (this._rp = new THREE.Vector3()));
    ped.x = p.x; ped.z = p.z; ped.y = 0;
  }
  hitTest(x, z, r, exclude) {
    let best = null, bd = r;
    for (const ped of this.list) {
      if (ped.state === 'lie' || ped.state === 'fly' || ped.state === 'dead') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  }
  punched(ped, fx, fz, attacker) { this.damage(ped, 34, fx * 4, fz * 4, 'player', 'fist'); }

  // any kind of harm: fists, bat, bullets. kind: 'fist' | 'bat' | 'bullet'
  damage(ped, dmg, kx, kz, source = 'player', kind = 'fist') {
    if (ped.char.rag) ped.char.rag.push(9, kx * 0.35, 0.3, kz * 0.35); // a body on the ground jerks with the blow
    if (ped.state === 'dead') return false;
    const g = this.game;
    if (ped.call) this.endCall(ped, false);
    ped.hp -= dmg;
    ped.char.play('hit', 0.35);
    if (ped.bench) { ped.bench.used = false; ped.bench = null; ped.fixed = false; ped.char.setBase(null); }
    if (ped.group) { ped.group.used = false; ped.group = null; ped.fixed = false; }
    if (ped.hp <= 0) {
      // down for good
      ped.dead = true;
      if (ped.state !== 'fly' && ped.state !== 'lie') this.knock(ped, kx * 1.2, kz * 1.2);
      else if (ped.state === 'lie') { ped.state = 'dead'; this.onDied(ped); }
      if (source === 'player') g.police.crime('homicidio', ped.x, ped.z, { victim: ped });
      this.scare(ped.x, ped.z, 30, null, kind === 'bullet');
      return true;
    }
    if (kind === 'bullet') {
      if (Math.random() < 0.55 || ped.hp < 50) this.knock(ped, kx, kz);
      else { ped.state = 'flee'; ped.fear = 1; ped.threat = null; this.say(ped, pick(FRASES.flee)); }
    } else if (ped.hp < 40 || Math.random() < (kind === 'bat' ? 0.6 : 0.3)) this.knock(ped, kx, kz);
    else if (ped.tough && source === 'player' && !(g.weapons && g.weapons.def.clip)) this.startFight(ped);
    else { ped.state = 'flee'; ped.fear = 1; ped.threat = null; this.say(ped, pick(FRASES.punched)); }
    if (source === 'player' && kind !== 'bullet') g.police.crime('agresion', ped.x, ped.z, { victim: ped });
    this.scare(ped.x, ped.z, 14);
    return false;
  }
  onDied(ped) {
    const g = this.game;
    if (!ped.char.rag) this.fall(ped, { buckle: 1, tone: 0.1, dead: true }); // (it came where they stood)
    ped.char.ragDead = true;
    ped.char.blinkP = 1;
    g.effects.pool(ped.x, ped.z, 0.75);
    if (ped.cash > 0 && g.pickups) { g.pickups.cash(ped.x + (Math.random() - 0.5), ped.z + (Math.random() - 0.5), ped.cash); ped.cash = 0; }
  }
  startFight(ped) {
    ped.char.setBase(null);
    ped.state = 'fight'; ped.fightT = 18; ped.punchT = 0.5;
    this.say(ped, pick(FRASES.fight));
  }
  surrender(ped) {
    if (ped.state === 'handsup' || ped.state === 'dead') return;
    if (ped.tough && Math.random() < 0.3 && ped.state !== 'flee') { ped.state = 'flee'; ped.fear = 1; this.say(ped, pick(FRASES.flee)); return; }
    if (ped.bench) { ped.bench.used = false; ped.bench = null; ped.fixed = false; }
    if (ped.group) { ped.group.used = false; ped.group = null; ped.fixed = false; }
    if (ped.call) { ped.pendingCall = { crime: ped.call.crime, x: ped.call.x, z: ped.call.z }; this.endCall(ped, false); } // phone down, hands up
    ped.state = 'handsup'; ped.handsT = 7 + Math.random() * 4;
    ped.char.setBase('handsup');
    if (!ped.talkCd || ped.talkCd < 0) { this.say(ped, pick(FRASES.handsup)); ped.talkCd = 4; }
  }
  // hand over the wallet (interaction with a gun drawn)
  rob(ped) {
    const g = this.game;
    const amount = ped.cash || 0;
    ped.cash = 0;
    this.say(ped, amount ? pick(FRASES.robbed) : '¡Que no llevo nada, de verdad!');
    ped.handsT = Math.min(ped.handsT, 1.5);
    if (amount) { g.player.money += amount; g.audio.sfx('money'); g.hud.notify(`Le quitas la cartera: +${amount} €`, 'ok', 3); }
    g.police.crime('atraco', ped.x, ped.z, { victim: ped });
    return amount;
  }
  // chat: castúo small talk; press again quickly to wind them up
  // you stop someone: they tell you what they are up to (where they are going, why they sit there), as suits who they
  // are and the hour; the second time a word more; the third, enough. If they saw you do something, they want no part
  talk(ped) {
    const g = this.game;
    const pl = g.player.pos, h = g.sky.hour, per = ped.persona || personaOf(ped.char.desc);
    ped.talks = (ped.talks || 0) + 1;
    ped.heading = Math.atan2(pl.x - ped.x, pl.z - ped.z);
    const was = ped.state;
    if (was === 'walk' || was === 'idle' || was === 'stroll' || was === 'window' || was === 'follow') {
      ped.resume = was === 'stroll' || was === 'window' ? was : null;
      ped.state = 'idle'; ped.idleT = 4; ped.speed = 0; ped.char.setBase('talk');
      if (ped.follower) { ped.follower.speed = 0; }
    }
    if (ped.chat) ped.chat.t = Math.max(ped.chat.t, 3.5); // (their conversation waits)
    let line;
    const wanted = g.police && g.police.wanted > 0;
    if (ped.sawPlayer || (wanted && Math.random() < 0.7)) line = pick(WARY);
    else if (ped.talks > 2) line = pick(ped.fixed || ped.group || ped.bench || ped.fresco || ped.chat ? ANNOYED_SAT : ANNOYED);
    else if ((h < 6 || h > 23.6) && per.age === 'mayor') line = pick(AFTER_DARK);
    else if (ped.talks === 2) line = pick(['¿Algo más, {hijo|hija}?', 'Bueno, que me voy, ¿eh?', 'Pues nada, que te vaya bien.', 'Ya te he dicho, ¿eh?']);
    else {
      const hi = greetLine(per, h);
      if (ped.fresco) line = hi + ' ' + pick(['Aquí, tomando el fresco. ¿Te sientas un ratino?', 'Aquí estamos, de charla. Siéntate si quieres.']);
      else if (ped.bench) line = hi + ' ' + pick(['Aquí, viendo pasar a la gente.', 'Aquí [sentado|sentada], tomando el sol, que es gratis.', 'Descansando un poco las piernas.']);
      else if (ped.group) line = hi + ' ' + pick(['Aquí, de cháchara con estos.', 'Aquí, arreglando el mundo.', 'Pues aquí, de charla. ¿Qué se cuenta?']);
      else if (ped.goal) line = per.hurry > 0.7 && Math.random() < 0.35 ? pick(BUSY) : hi + ' ' + errandLine(ped.goal.kind, h);
      else line = hi + ' ' + pick(['Aquí, dando una vuelta.', 'Pues aquí, tomando el aire.', 'Paseando, que dice el médico que es bueno.']);
    }
    this.say(ped, line);
    ped.talkCd = 3;
    g.audio.sfx('text_msg', { vol: 0.3 });
  }
  insult(ped) {
    this.say(ped, pick(FRASES.insulted));
    ped.talkCd = 3;
    const young = !ped.char.desc.elderly;
    if (ped.tough || (young && ped.char.desc.gender === 'm' && Math.random() < 0.25)) { setTimeout(() => { if (ped.state !== 'dead' && ped.state !== 'lie' && ped.state !== 'fly') this.startFight(ped); }, 700); }
    else if (Math.random() < 0.5) { ped.state = 'flee'; ped.fear = 0.6; ped.char.setBase(null); ped.threat = null; }
    else if (ped.state === 'idle' && !ped.fixed) { ped.idleT = 0.6; ped.char.setBase(null); } // walks off, offended
  }

  scare(x, z, r, threat = null, gun = false) {
    this.trouble = { x, z, t: this.now };
    for (const p of this.list) {
      if (p.state === 'lie' || p.state === 'fly' || p.state === 'dead' || p.state === 'handsup') continue;
      if (p.call) { p.fear = 1; continue; } // already on the phone to the police
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r) {
        p.fear = 1;
        if (p.state === 'fight' && !gun) continue;
        // gunfire close by: some freeze with their hands up instead of running
        if (gun && d < r * 0.4 && !p.tough && Math.random() < 0.35) { this.surrender(p); continue; }
        if (p.state !== 'sit' || d < r * 0.5) { p.state = 'flee'; p.char.setBase(null); if (p.bench) { p.bench.used = false; p.bench = null; p.fixed = false; } if (p.group) { p.group = null; p.fixed = false; } }
        p.threat = threat ? { x: threat.x, z: threat.z } : { x, z };
        if (Math.random() < 0.3 && !p.talkCd) { this.say(p, pick(FRASES.flee)); p.talkCd = 5; }
      }
    }
  }

  // someone on the ground (dead or out cold): the first to see it goes over and phones 112
  lookForBodies(ped) {
    for (const b of this.list) {
      if (b.found || b === ped || !(b.state === 'dead' || (b.state === 'lie' && b.koLong))) continue;
      const dx = b.x - ped.x, dz = b.z - ped.z, d = Math.hypot(dx, dz);
      if (d > 16 || Math.abs(wrapAngle(Math.atan2(dx, dz) - ped.heading)) > 1.6) continue;
      if (this.map.collider.raycast(ped.x, ped.z, b.x, b.z, 1.6, 0.3) < 0.98) continue;
      b.found = true;
      const fb = b.char && b.char.desc && b.char.desc.gender === 'f';
      this.say(ped, pick(['¡Ay, Dios mío!', fb ? '¡Una mujer en el suelo!' : '¡Un hombre en el suelo!', '¡Madre mía! ¿Está usted bien?', '¡Socorro, que alguien ayude!']), true);
      this.game.audio.sfx(ped.char.desc.gender === 'f' ? 'yelp_f' : 'yelp_m', { x: ped.x, z: ped.z, vol: 0.7 });
      this.startCall(ped, 'cadaver', b.x, b.z, 0);
      return;
    }
  }
  // crouched behind someone who has not noticed you: a quiet knockout (no scream, they don't see who it was)
  canTakedown(ped) {
    const pl = this.game.player;
    if (!pl.crouch || pl.vehicle || !['walk', 'idle', 'sit', 'call'].includes(ped.state) || ped.fear > 0.3) return false;
    const dx = pl.pos.x - ped.x, dz = pl.pos.z - ped.z;
    if (Math.hypot(dx, dz) > 1.6) return false;
    return Math.abs(wrapAngle(Math.atan2(dx, dz) - ped.heading)) > 2.0; // behind them
  }
  takedown(ped) {
    const g = this.game, pl = g.player;
    if (ped.call) this.endCall(ped, false);
    if (ped.bench) { ped.bench.used = false; ped.bench = null; }
    if (ped.group) { ped.group.used = false; ped.group = null; }
    ped.fixed = false;
    pl.heading = Math.atan2(ped.x - pl.pos.x, ped.z - pl.pos.z);
    pl.char.play('punch', 0.45);
    const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
    ped.state = 'fly'; ped.t = 0; ped.thud = false; ped.koLong = true;
    ped.hp = Math.min(ped.hp, 70);
    this.fall(ped, { vel: [fx * 1.1, 0, fz * 1.1], up: 0.6, buckle: 1.4, tone: 0.1 }); // out cold: the knees go
    g.audio.sfx('punch_hit', { x: ped.x, z: ped.z, vol: 0.35 });
    g.police.crime('agresion', ped.x, ped.z, { victim: ped, silent: true });
  }

  // ------------------------------------------------------------ witnesses
  // who saw the player just now: in front of them (anything close, or loud, gets noticed anyway), in line of sight,
  // closer at night and when you keep low. Nearest first.
  witnesses(opts = {}) {
    const g = this.game, pl = g.player;
    const px = pl.vehicle ? pl.vehicle.x : pl.pos.x, pz = pl.vehicle ? pl.vehicle.z : pl.pos.z;
    const k = lerp(1, 0.55, g.sky.night || 0) * (!pl.vehicle && pl.crouch ? 0.7 : 1);
    const R = (opts.loud ? 55 : 32) * k;
    const out = [];
    for (const p of this.list) {
      if (p === opts.victim || p.dead || p.state === 'dead' || p.state === 'lie' || p.state === 'fly' || p.inCar || p.call) continue;
      const dx = px - p.x, dz = pz - p.z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      if (!opts.loud && d > 4 && Math.abs(wrapAngle(Math.atan2(dx, dz) - p.heading)) > 1.9) continue;
      if (this.map.collider.raycast(p.x, p.z, px, pz, 1.6, 1.2) < 0.98) continue;
      out.push({ p, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map((o) => o.p);
  }
  // delay: how long they run before stopping to phone
  startCall(ped, crime, x, z, delay = null) {
    if (ped.call || ped.dead || ped.state === 'dead' || ped.state === 'lie' || ped.state === 'fly') return false;
    if (ped.state === 'handsup') { ped.pendingCall = { crime, x, z }; return true; }
    if (ped.bench) { ped.bench.used = false; ped.bench = null; }
    if (ped.group) { ped.group.used = false; ped.group = null; }
    ped.fixed = false; ped.char.setBase(null); ped.char.speaking = false;
    if (crime !== 'cadaver') ped.sawPlayer = true;
    if (ped.chat) { ped.chat.members = ped.chat.members.filter((m) => m !== ped); ped.chat = null; }
    ped.call = { crime, x, z, t: 0, dur: 4.5 + Math.random() * 2.5, delay: delay ?? 1 + Math.random() * 1.5, started: false };
    ped.state = 'call';
    this.game.police.calls.add(ped);
    return true;
  }
  endCall(ped, done) {
    const c = ped.call;
    if (!c) return;
    ped.call = null;
    this.unmark(ped);
    this.game.police.calls.delete(ped);
    if (ped.state === 'call') { ped.char.setBase(null); ped.state = 'flee'; ped.fear = 0.5; ped.threat = { x: this.game.player.pos.x, z: this.game.player.pos.z }; }
    if (done) {
      if (this.list.includes(ped)) this.say(ped, pick(CALL_END), true);
      this.game.police.report(c.crime, c.x, c.z, ped);
    }
  }
  // a persistent icon over someone's head (📱 while they phone the police)
  mark(ped, text) {
    if (!this.speechRoot) return;
    this.unmark(ped);
    const el = document.createElement('div');
    el.className = 'speech mark';
    el.textContent = text;
    this.speechRoot.appendChild(el);
    this.marks.push({ ped, el });
  }
  unmark(ped) {
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].ped === ped) { this.marks[i].el.remove(); this.marks.splice(i, 1); }
  }

  // spawn the ejected driver of a carjacked car
  ejectDriver(v) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let lx = fz, lz = -fx;
    // thrown out on the driver's side unless there is a wall there
    const ok = (sx, sz) => !this.map.buildingAt(v.x + sx * (v.hw + 0.7), v.z + sz * (v.hw + 0.7)) && this.map.collider.raycast(v.x, v.z, v.x + sx * (v.hw + 0.9), v.z + sz * (v.hw + 0.9), 1, 1) > 0.98;
    if (!ok(lx, lz)) { if (ok(-lx, -lz)) { lx = -lx; lz = -lz; } else { lx = -fx; lz = -fz; } }
    const ped = this.spawnAt(v.x + lx * (v.hw + 0.7), v.z + lz * (v.hw + 0.7));
    ped.state = 'fly'; ped.t = 0; ped.thud = false;
    ped.hp = 100;
    this.fall(ped, { vel: [lx * 3, 1.6, lz * 3], up: 0.4, tone: 0.7 }); // dragged out and thrown down
    setTimeout(() => this.say(ped, pick(FRASES.carjack)), 900);
    return ped;
  }

  // ------------------------------------------------------------ speech bubbles (DOM, projected)
  // free: the speaker is not a street pedestrian (an officer, someone at home) and keeps the bubble wherever they are
  // {m|f} agrees with the player (who is spoken to), [m|f] with the speaker
  say(ped, text, free = false) {
    if (!this.speechRoot) return;
    const pf = this.game.player.char && this.game.player.char.desc.gender === 'f', sf = ped && ped.char && ped.char.desc.gender === 'f';
    text = String(text).replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (_, m, f) => (pf ? f : m)).replace(/\[([^|\[\]]*)\|([^|\[\]]*)\]/g, (_, m, f) => (sf ? f : m));
    for (let i = this.speech.length - 1; i >= 0; i--) if (this.speech[i].ped === ped) { this.speech[i].el.remove(); this.speech.splice(i, 1); } // one line at a time
    const el = document.createElement('div');
    el.className = 'speech';
    el.textContent = text;
    this.speechRoot.appendChild(el);
    this.speech.push({ ped, el, t: 3.2, free });
  }
  updateSpeech(dt) {
    const cam = this.game.camera;
    const v = this._v || (this._v = new THREE.Vector3());
    const W = innerWidth, H = innerHeight;
    for (let i = this.speech.length - 1; i >= 0; i--) {
      const s = this.speech[i];
      s.t -= dt;
      if (s.t <= 0 || (!s.free && !this.list.includes(s.ped))) { s.el.remove(); this.speech.splice(i, 1); continue; }
      const y = s.ped.y || 0;
      const dist = cam.position.distanceTo(v.set(s.ped.x, y + 1.8, s.ped.z));
      v.set(s.ped.x, y + 2.05, s.ped.z).project(cam);
      if (v.z > 1 || dist > 35) { s.el.style.opacity = 0; continue; }
      s.el.style.opacity = Math.min(1, s.t * 2);
      const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5;
      s.el.style.transform = `translate(${sx * W}px, ${(1 - sy) * H}px) translate(-50%, -100%)`;
    }
    for (const m of this.marks) {
      const y = m.ped.y || 0;
      const dist = cam.position.distanceTo(v.set(m.ped.x, y + 1.8, m.ped.z));
      v.set(m.ped.x, y + 2.35, m.ped.z).project(cam);
      if (v.z > 1 || dist > 60) { m.el.style.opacity = 0; continue; }
      m.el.style.opacity = 1;
      const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5;
      m.el.style.transform = `translate(${sx * W}px, ${(1 - sy) * H}px) translate(-50%, -100%)`;
    }
  }
  clear() {
    for (const p of this.list) if (p.call) this.endCall(p, false);
    for (let i = this.list.length - 1; i >= 0; i--) this.despawn(this.list[i], i);
    for (const b of this.benches) b.used = false;
    for (const grp of this.frescoGroups.slice()) { for (const c of grp.chairs) this.game.scene.remove(c); grp.spot.used = false; }
    this.frescoGroups = [];
    for (const s of this.fresco) { s.used = false; s.skip = false; s.group = null; }
    for (const s of this.speech) s.el.remove();
    this.speech = [];
    for (const m of this.marks) m.el.remove();
    this.marks = [];
  }
}
