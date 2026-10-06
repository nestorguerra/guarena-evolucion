// Talking with the neighbours: a real little conversation with whoever you stop in the street. They speak as who they
// are (census.js: their name, their age, their trade, their family, their temper, how much they like to talk) and as
// what they are doing just now (going for the bread, waiting at the school gate, sitting out at their door), and they
// remember you (Memoria): whether you told them your name, what they told you last time — so they go on from there —
// how you treated them and what they saw you do. You choose what to say: who you are, how they are, what the town is
// talking about (the same news all over town, about its own people), where they are off to, what they do for a living,
// the way to somewhere (along the real streets, by their names), or goodbye. And the town's news (Noticias) is what
// the neighbours talk about among themselves too (peds.js).
import { hash1, mulberry32, wrapAngle, clamp } from './util.js';
import { routeBetween } from './npcmind.js';

const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// {m|f}: agrees with the player; [m|f]: with the speaker
export function agree(text, speakerF, playerF) {
  return String(text).replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (_, m, f) => (playerF ? f : m)).replace(/\[([^|\[\]]*)\|([^|\[\]]*)\]/g, (_, m, f) => (speakerF ? f : m));
}
// «la calle Malfeitos», «la Plaza de España», «la avenida de la Constitución»
function laCalle(name) {
  if (!name) return 'esta calle';
  const n = name.trim(), low = n.toLowerCase();
  if (/^(calle|avenida|plaza|travesía|paseo|carretera|camino|ronda|glorieta|callejón|callejon)\b/i.test(n)) return 'la ' + low.charAt(0) + n.slice(1);
  return 'la calle ' + n;
}
// how a place is called in conversation: the public ones by their own name (Santa María, the health centre, the town
// hall, the plazas and parks, the schools); a shop or a bar by its street — no real business of the town appears by
// its name in the game
const PUBLIC = new Set(['iglesia', 'medico', 'ayto', 'abastos', 'plaza', 'parque', 'colegio', 'polideportivo', 'cementerio', 'mercadillo', 'cooperativa']);
const GENERIC = { pan: 'la panadería', compra: 'el súper', bar: 'el bar', farmacia: 'la farmacia', banco: 'el banco', estanco: 'el estanco', tienda: 'la tienda', dentista: 'el dentista', escuela: 'el colegio' };
export function placeLabel(p) {
  if (!p) return '';
  if (PUBLIC.has(p.kind) && p.name && !/^(casa|el|la)$/i.test(p.name)) return p.name.replace(/^(C\.P\.?|CP) ?/i, 'el colegio ');
  const g = GENERIC[p.kind] || 'la tienda';
  const st = p.edge && p.edge.name;
  return st ? `${g} de ${laCalle(st)}` : g;
}
const RIVALES = ['Villanueva', 'Don Benito', 'Miajadas', 'Valdivia', 'Santa Amalia', 'Medellín', 'Mengabril', 'Manchita', 'Cristina', 'Valdetorres', 'Oliva de Mérida', 'Torremayor', 'Montijo', 'Calamonte'];
const OBRAS = ['cambiar las tuberías', 'poner el asfalto nuevo', 'hacer las aceras más anchas', 'meter la fibra', 'arreglar el alcantarillado'];

// ---------------------------------------------------------------- what the town is talking about
// the news of a given day: always the same for that day, about the town's own people (weddings, a new baby, a
// retirement, someone in hospital, the tomato campaign, last Sunday's match, the street that is up, prices…) and,
// when you have been up to something, about you
export function noticias(census, day) {
  const C = census, R = C.residents;
  if (C._news && C._news.day === day) return C._news.list;
  const rnd = mulberry32((day * 7919 + 2025) >>> 0);
  const find = (ok, tries = 400) => { for (let k = 0; k < tries; k++) { const r = R[Math.floor(rnd() * R.length)]; if (ok(r)) return r; } return null; };
  const list = [];
  const wd = ((day + 5) % 7 + 7) % 7;
  // a wedding
  const novia = find((r) => r.f && r.age >= 26 && r.age <= 36 && r.spouse === undefined);
  const novio = novia && find((r) => !r.f && Math.abs(r.age - novia.age) < 5 && r.spouse === undefined && r.h !== novia.h);
  if (novia && novio) {
    const mes = pick(['en octubre', 'el mes que viene', 'en noviembre', 'antes de Navidad'], rnd);
    list.push({ k: 'boda', about: [novia, novio], txt: (C2) => `${cap(C2.nameOf(novia, 'pueblo'))} y ${C2.nameOf(novio, 'pueblo')}${C2.households[novio.h].apodo ? ', el de ' + C2.households[novio.h].apodo + ',' : ''} se casan ${mes} en Santa María.`, re: ['¡Anda! Pues no sabía yo que eran novios.', 'Ya era hora, que llevan años juntos.', 'Pues a ver si nos invitan, que en las bodas de aquí se come de lujo.'] });
  }
  // a new baby (a real baby of the census)
  const bebe = find((r) => r.age === 0);
  if (bebe) {
    const madre = R.find((r) => r.h === bebe.h && r.f && r.age >= 24 && r.age <= 45);
    if (madre) list.push({ k: 'bebe', about: [madre, bebe], txt: (C2) => `${cap(C2.nameOf(madre, 'pueblo'))} ha tenido ${bebe.f ? 'una niña' : 'un niño'}. Le han puesto ${bebe.first}.`, re: ['¡Qué alegría! Que falta hacen niños en el pueblo.', '¿Y a quién se parece?', 'Hay que ir a verla un día de estos.'] });
  }
  // a retirement
  const jub = find((r) => r.age >= 63 && r.age <= 66 && r.trade);
  if (jub) list.push({ k: 'jubilacion', about: [jub], txt: (C2) => `${cap(C2.nameOf(jub, 'pueblo'))} se jubila este mes, después de toda la vida de ${C2.tradeOf(jub)}.`, re: ['Bien merecido lo tiene.', 'Ahora a ver qué hace con tanto tiempo.', 'Le van a echar de menos.'] });
  // in hospital (the hospital of Don Benito-Villanueva)
  const enf = find((r) => r.age >= 72);
  if (enf) list.push({ k: 'hospital', about: [enf], txt: (C2) => `${cap(C2.nameOf(enf, 'pueblo'))} está en el hospital de Don Benito, de ${pick(['la cadera', 'una caída', 'los bronquios', 'una operación de nada'], rnd)}. Dicen que va mejorando.`, re: ['Ay, pobre. A ver si sale pronto.', 'Mañana voy a llamar a su hija, a ver.', 'A esas edades, cualquier cosa…'] });
  // the fields of the Vegas (end of September: the tomato campaign is finishing, the grape harvest)
  list.push({ k: 'campo', about: [], txt: () => pick(['La campaña del tomate está terminando: las fábricas no han parado ni de noche.', 'Este año el tomate ha venido bueno, pero lo pagan a cuatro perras.', 'La vendimia viene buena, dicen en la cooperativa.', 'Con lo poco que ha llovido, el arroz ha aguantado de milagro.'], rnd), re: ['Como todos los años, coile.', 'Pues a ver si pagan mejor, que el gasoil está por las nubes.', 'El campo es muy sacrificado.'] });
  // last Sunday's match
  const gl = Math.floor(rnd() * 4), gv = Math.floor(rnd() * 3), riv = pick(RIVALES, rnd);
  list.push({ k: 'futbol', about: [], txt: () => gl > gv ? `El domingo el Guareña le ganó ${gl} a ${gv} al ${riv}.` : gl === gv ? `El domingo el Guareña empató a ${gl} con el ${riv}.` : `El domingo el Guareña perdió ${gl} a ${gv} con el ${riv}. ¡Qué disgusto!`, re: gl > gv ? ['¡Así me gusta!', 'Este año subimos, ya verás.'] : ['El árbitro, que no veía ni tres en un burro.', 'Otra vez será.'] });
  // a street that is up
  const calles = [...new Set(C.households.slice(0, 600).map((h) => h.street).filter(Boolean))];
  if (calles.length) { const c = pick(calles, rnd), o = pick(OBRAS, rnd); list.push({ k: 'obras', about: [], txt: () => `Están levantando ${laCalle(c)} para ${o}.`, re: ['Cada año igual, y nunca terminan.', 'Pues a mí me pilla de paso todos los días.', 'Ya era hora, que estaba hecha una pena.'] }); }
  // what is coming
  if (wd === 1) list.push({ k: 'mercadillo', about: [], txt: () => 'Mañana es miércoles: día de mercadillo.', re: ['A ver si encuentro unas zapatillas.', 'Yo voy a por fruta, que la del súper no sabe a nada.'] });
  if (wd === 5) list.push({ k: 'verbena', about: [], txt: () => 'Esta noche hay música en la plaza, con orquesta.', re: ['Pues allí estaremos.', 'Uy, a mí ya no me pillan, que luego no duermo.'] });
  if (wd === 6) list.push({ k: 'misa', about: [], txt: () => 'Hoy en la misa de doce estaba la iglesia llena.', re: ['Como en los buenos tiempos.', 'Será por el bautizo.'] });
  // prices
  list.push({ k: 'precios', about: [], txt: () => pick(['El aceite está carísimo: a nueve euros la botella.', 'La luz ha vuelto a subir. ¡Qué barbaridad!', 'He echado gasoil y casi me da algo.'], rnd), re: ['Esto no hay quien lo aguante.', 'Y los sueldos igual.', 'Y la pensión, la misma.'] });
  C._news = { day, list };
  return list;
}
// what the town says about the things you did
export function sucesoTxt(ev, playerF) {
  const donde = ev.st ? ' en ' + laCalle(ev.st) : '';
  const quien = playerF ? 'una chavala' : 'un chaval';
  const T = {
    atraco: `atracaron a una persona${donde}`, atraco_tienda: `atracaron una tienda${donde}`, atraco_banco: 'atracaron el banco', atraco_joyeria: 'atracaron la joyería',
    agresion: `hubo una pelea${donde}`, homicidio: `mataron a una persona${donde}`, atropello: `atropellaron a una persona${donde} y se dieron a la fuga`,
    carjack: `sacaron a uno de su coche a la fuerza${donde}`, breakin: `forzaron un coche${donde}`, disparo: `hubo tiros${donde}`, explosion: `voló un coche por los aires${donde}`,
    allanamiento: `se colaron en una casa${donde}`, hurto: `robaron en una tienda${donde}`, vandalismo: `hicieron destrozos${donde}`,
  };
  const what = T[ev.k] || `pasó algo gordo${donde}`;
  return `Dicen que ${what}… y que fue ${quien} joven.`;
}

// ---------------------------------------------------------------- the way somewhere, by the streets
export function directions(map, from, place, walkOk) {
  if (!place || !place.edge) return null;
  const q = map.nearestEdge(from.x, from.z, 40, walkOk);
  if (!q) return null;
  const steps = routeBetween(map, { edge: q.edge, s: q.s }, { edge: place.edge, s: place.s }, walkOk);
  if (!steps) return null;
  // the legs: one per named street (the little unnamed bits joined to the street before them)
  const legs = [];
  const head = (e, dir, atEnd) => { const s = dir > 0 ? (atEnd ? e.len - 0.5 : 0.5) : (atEnd ? 0.5 : e.len - 0.5); const t = map.sample(e, s, {}); return Math.atan2(t.dx * dir, t.dz * dir); };
  let total = 0;
  steps.forEach((st, i) => {
    let len = st.edge.len;
    if (i === 0) len = st.dir > 0 ? st.edge.len - q.s : q.s;
    if (i === steps.length - 1) len = steps.length === 1 ? Math.abs(place.s - q.s) : (st.dir > 0 ? place.s : st.edge.len - place.s);
    total += len;
    const name = st.edge.name || '';
    const last = legs[legs.length - 1];
    if (last && (name === last.name || !name)) { last.len += len; last.h1 = head(st.edge, st.dir, true); return; }
    legs.push({ name, len, h0: head(st.edge, st.dir, false), h1: head(st.edge, st.dir, true) });
  });
  const m10 = (v) => Math.max(10, Math.round(v / 10) * 10);
  const parts = [];
  if (total < 25) return { text: '¡Si lo tienes ahí mismo!', dist: total };
  legs.slice(0, 4).forEach((L, i) => {
    if (i === 0) { parts.push(`sigue por ${laCalle(L.name)}${L.len > 35 ? ` unos ${m10(L.len)} metros` : ''}`); return; }
    const t = wrapAngle(L.h0 - legs[i - 1].h1);
    const turn = t > 0.55 ? 'gira a la izquierda' : t < -0.55 ? 'gira a la derecha' : 'sigue recto';
    parts.push(`${turn} por ${laCalle(L.name)}${L.len > 60 ? ` unos ${m10(L.len)} metros` : ''}`);
  });
  let text = parts.join(', luego ');
  if (legs.length > 4) text += ', y desde allí pregunta otra vez, que ya está cerca';
  // which hand it is on at the end
  const lastSt = steps[steps.length - 1], tp = map.sample(lastSt.edge, place.s, {});
  const side = ((place.fx ?? place.x) - tp.x) * -tp.dz * lastSt.dir + ((place.fz ?? place.z) - tp.z) * tp.dx * lastSt.dir;
  text += side > 0.3 ? ', y lo tienes a la derecha' : side < -0.3 ? ', y lo tienes a la izquierda' : ', y allí está';
  const min = Math.max(1, Math.round(total / 75));
  return { text: cap(text) + `. Está a unos ${m10(total)} metros${total > 150 ? `, ${min} minutos andando` : ''}.`, dist: total };
}

// what you can ask the way to (kinds of place of census.places)
const SITIOS = [
  ['farmacia', 'la farmacia'], ['pan', 'una panadería'], ['medico', 'el Centro de Salud'], ['ayto', 'el Ayuntamiento'], ['iglesia', 'la iglesia de Santa María'],
  ['bar', 'un bar'], ['banco', 'un banco'], ['compra', 'un supermercado'], ['estanco', 'el estanco'], ['abastos', 'el Mercado de Abastos'], ['parque', 'un parque'],
];

// what the player's own character is, to the town
const PLAYER_ROLE = { alex: 'el repartidor', manu: 'Manu, el de las Vegas', dani: 'Dani, el del instituto', lucia: 'Lucía, la que estudia en la UEx', rocio: 'Rocío, la mecánica', carmen: 'Carmen, la camarera de la plaza', adri: 'Adri', annie: 'Annie, la de la calle Malfeitos' };
const LOCALS = new Set(['manu', 'dani', 'lucia', 'rocio', 'carmen', 'adri']);

// ---------------------------------------------------------------- the conversation
export class Charla {
  constructor(game) {
    this.g = game;
    const el = document.createElement('div');
    el.id = 'charla'; el.hidden = true;
    (document.getElementById('hud') || document.body).appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) this.choose(+b.dataset.i); });
    this.el = el;
    this.ped = null; this.opts = []; this.sel = 0; this.t = 0; this.turns = 0; this.line = ''; this.mine = '';
  }
  get open() { return !!this.ped; }
  get C() { return this.g.census; }
  me() { const d = this.g.player.char && this.g.player.char.desc; return { f: !!(d && d.gender === 'f'), name: (d && d.name) || 'forastero', id: d && d.id }; }
  // tú or usted: the old ones are «usted» to a young one (and the young ones «tú» to everybody)
  usted() { const r = this.r; return r && r.age >= 60; }
  ag(text) { return agree(text, this.r && this.r.f, this.me().f); }

  // ---------------- open / close
  start(ped) {
    const g = this.g, C = this.C, r = ped.persona && ped.persona.r;
    if (!C || !r) return false;
    this.ped = ped; this.r = r; this.turns = 0; this.t = 0; this.sel = 0; this.mine = '';
    const M = C.memoria, me = this.me();
    this.p = M.met(r, this.streetHere());
    // a local character: the town knows them by name
    if (LOCALS.has(me.id) && !this.p.name && hash1(r.id + 5) < 0.6) this.p.name = 1;
    // they stop what they were doing and turn to you (and their companion waits)
    ped.talking = true;
    ped.resumeState = ped.state === 'walk' || ped.state === 'idle' || ped.state === 'stroll' || ped.state === 'window' || ped.state === 'follow' ? ped.state : null;
    if (ped.resumeState) { ped.state = 'idle'; ped.idleT = 1e9; ped.speed = 0; ped.char.setBase('talk'); }
    if (ped.chat) ped.chat.t = Math.max(ped.chat.t, 30);
    this.opening();
    g.audio.sfx('text_msg', { vol: 0.3 });
    return true;
  }
  close(bye = null) {
    const ped = this.ped, g = this.g;
    if (!ped) return;
    if (bye) this.say(bye);
    ped.talking = false;
    if (ped.chat) ped.chat.t = Math.min(ped.chat.t, 2.5);
    if (ped.resumeState && ped.state === 'idle') { ped.idleT = 1.2; ped.resume = ped.resumeState === 'stroll' || ped.resumeState === 'window' ? ped.resumeState : null; }
    ped.char.lookAt(null);
    this.ped = null; this.r = null; this.opts = [];
    this.el.hidden = true;
    g.persist && g.persist();
  }
  streetHere() { const g = this.g, q = g.map.nearestEdge(g.player.pos.x, g.player.pos.z, 30, (e) => !!e.name); return q ? q.edge.name : ''; }
  say(text) {
    const g = this.g, line = this.ag(text);
    this.line = line;
    if (this.ped) g.peds.say(this.ped, line);
    this.render();
  }

  // ---------------- what they say first
  opening() {
    const g = this.g, C = this.C, r = this.r, p = this.p, M = C.memoria, me = this.me(), ped = this.ped, tr = C.traits(r);
    const h = g.sky.hour, since = M.hoursSince(p);
    const hi = h < 13.5 ? 'Buenos días' : h < 20.5 ? 'Buenas tardes' : 'Buenas noches';
    const hijo = r.age >= 55 ? (me.f ? 'hija' : 'hijo') : null;
    // they saw you do something
    const saw = (p.saw || []).filter((s) => M.now - s.t < 24 * 10);
    if (saw.length || p.rel <= -3) {
      const what = saw.length ? { atraco: 'atracar a una persona', agresion: 'pegar a una persona', homicidio: 'matar a una persona', carjack: 'sacar a uno de su coche', atropello: 'atropellar a una persona', disparo: 'pegar tiros', atraco_tienda: 'atracar una tienda' }[saw[saw.length - 1].k] : null;
      this.say(what ? `¡Tú! Yo te vi ${what}. No quiero saber nada de ti.` : pick(['Contigo no quiero hablar, que ya sé cómo eres.', 'Tú y yo no tenemos nada que hablar.']));
      this.options([{ label: 'Perdone, fue un malentendido', run: () => { if (Math.random() < 0.25) { M.relate(r, 1); this.say('Bueno… pero que no se repita, ¿eh?'); this.menu(); } else this.close('Sí, sí, un malentendido… ¡Anda y vete!'); } }, { label: 'Adiós', run: () => this.close(null) }]);
      return;
    }
    if (g.police && g.police.wanted > 0) {
      this.say(pick(['Ahora no, que te anda buscando la Guardia Civil… y yo no quiero líos.', 'Déjame, déjame, que te están buscando y no me quiero meter en nada.']));
      this.options([{ label: 'Adiós', run: () => this.close(null) }]);
      return;
    }
    let line;
    if (p.n > 1 && p.name) {
      if (since < 1.5) line = pick([`¿Otra vez tú, ${me.name}? ¡Si nos acabamos de ver!`, `¡${me.name}! Qué, ¿se te ha olvidado algo?`]);
      else if (since > 24 * 2) line = pick([`¡Hombre, ${me.name}! Hacía días que no te veía.`, `¡${me.name}! ¿Dónde te habías metido?`, `¡Pero si es ${me.name}! ¿Qué es de tu vida?`]);
      else line = pick([`¡Hola, ${me.name}! ¿Qué tal?`, `¡${hi}, ${me.name}!`, `¡Hombre, ${me.name}! Otra vez por aquí.`]);
      // they go on from last time
      if (p.asked && since < 24 * 3) line += ` ¿Encontraste ${p.asked}?`;
    } else if (p.n > 1) line = pick([`¡Hola otra vez! Tú eres {el chico|la chica} de antes, ¿no?`, `Anda, tú otra vez. ¿Qué querías?`]);
    else {
      const me2 = PLAYER_ROLE[me.id];
      if (r.age >= 60) line = pick([`¡${hi}, ${hijo}! ¿Qué querías?`, `Tú no eres de aquí, ¿verdad? ¿De quién eres?`, `¡${hi}! ¿Querías algo, ${hijo}?`]);
      else if (r.age >= 25) line = pick([`¡${hi}! ¿Te puedo ayudar en algo?`, `¡Buenas! Dime.`, me2 === 'el repartidor' ? '¡Buenas! Tú eres el repartidor, ¿no? ¿Qué pasa?' : `¡${hi}! ¿Qué tal?`]);
      else line = pick(['¿Qué pasa? ¿Querías algo?', '¡Ey! ¿Qué tal?', 'Dime, dime.']);
    }
    // in a hurry: a word, and on their way
    const going = ped.goal && (ped.state === 'idle' && ped.resumeState === 'walk');
    if (going && ped.persona.hurry > 0.72 && tr.charla < 0.5) { this.hurry = true; line += ' ' + pick(['Pero dime rápido, que voy con prisa.', 'Que voy un poco apurad[o|a], ¿eh?']); }
    else this.hurry = false;
    this.say(line);
    this.menu();
  }

  // ---------------- what you can say
  menu() {
    const C = this.C, r = this.r, p = this.p, me = this.me(), U = this.usted();
    const L = [];
    if (!p.name) L.push({ label: U ? `Me llamo ${me.name}. ¿Y usted?` : `Me llamo ${me.name}. ¿Y tú?`, run: () => this.introduce() });
    L.push({ label: U ? '¿Qué tal está?' : '¿Qué tal?', run: () => this.howAreYou() });
    L.push({ label: '¿Qué se cuenta por el pueblo?', run: () => this.news() });
    if (this.ped && (this.ped.goal || this.ped.fresco || this.ped.bench || this.ped.group || this.ped.resumeState)) L.push({ label: U ? '¿Dónde va usted?' : '¿Dónde vas?', run: () => this.errand() });
    if (r.age >= 18) L.push({ label: U ? '¿A qué se dedica?' : '¿A qué te dedicas?', run: () => this.trade() });
    L.push({ label: U ? '¿Sabe dónde está…?' : '¿Sabes dónde está…?', run: () => this.askWay() });
    L.push({ label: 'Adiós', run: () => this.bye() });
    if (this.turns >= 2) L.push({ label: '<i>Vacilar</i>', run: () => this.tease() });
    this.options(L);
  }
  options(L) { this.opts = L; this.sel = 0; this.render(); }
  choose(i) {
    const o = this.opts[i];
    if (!o) return;
    this.mine = o.label.replace(/<[^>]+>/g, '');
    this.turns++; this.t = 0;
    o.run();
    // in a hurry: one question, and off they go
    if (this.ped && this.hurry && this.turns >= 2 && this.opts.length > 1) this.close(pick(['Bueno, que me voy, que llego tarde.', 'Venga, luego hablamos, ¿eh?', 'Me tengo que ir, que me están esperando.']));
  }

  introduce() {
    const C = this.C, r = this.r, M = C.memoria, me = this.me(), h = C.household(r);
    this.p.name = 1; M.relate(r, 1);
    const yo = C.nameOf(r, 'nombre');
    const casa = h.street ? `, vivo en ${laCalle(h.street)}` : '';
    const mote = h.apodo && r.age >= 30 ? `, ${r.f ? 'la' : 'el'} de ${h.apodo}` : '';
    this.say(pick([`Yo soy ${yo}${mote}${casa}. Encantad[o|a], ${me.name}.`, `${yo}, para servirte${casa}. Encantad[o|a].`, `Pues yo soy ${yo}${mote}. ¡Mucho gusto, ${me.name}!`]));
    this.menu();
  }
  howAreYou() {
    const C = this.C, r = this.r, g = this.g, M = C.memoria, tr = C.traits(r), h = g.sky.hour;
    const fam = C.relatives(r);
    const said = (k) => M.hasTold(r, k);
    const lines = [];
    // their family (the real one: names and ages from the census)
    const nieto = fam.find((x) => x.age < 26 && x.h !== r.h && r.age > 58) || fam.find((x) => x.age < 26 && r.age > 58);
    const hijo = fam.find((x) => x.age >= 18 && x.age < r.age - 18);
    const pareja = r.spouse !== undefined ? C.residents[r.spouse] : null;
    if (nieto && !said('nieto')) lines.push(['nieto', `Pues muy bien. Mi ${nieto.f ? 'nieta' : 'nieto'} ${nieto.first} ${nieto.age >= 18 ? (nieto.studies ? 'estudia fuera, en Badajoz, y viene los fines de semana' : 'ya trabaja, ¿sabes?') : nieto.age >= 12 ? 'está ya en el instituto' : 'empezó el colegio este año'}. ¡Cómo pasa el tiempo!`]);
    else if (nieto && said('nieto')) lines.push(['nieto2', `Bien, bien. Lo de mi ${nieto.f ? 'nieta' : 'nieto'} ${nieto.first}, que te conté: ${pick(['que va de maravilla', 'que este fin de semana viene a comer', 'que al final aprobó todo'])}.`]);
    if (pareja && !said('pareja') && r.age > 50) lines.push(['pareja', `Aquí, con mi ${pareja.f ? 'mujer' : 'marío'}, ${pareja.called || pareja.first}, ${pick(['que no para quiet[a|o] ni un momento', 'que anda con la espalda fastidiada', 'que está en casa viendo la novela'])}.`.replace('[a|o]', pareja.f ? 'a' : 'o')]);
    if (hijo && !said('hijo') && !nieto) lines.push(['hijo', `Muy bien. Mi ${hijo.f ? 'hija' : 'hijo'} ${hijo.first} ${C.tradeOf(hijo) ? 'es ' + C.tradeOf(hijo) + ' aquí en el pueblo' : 'está buscando trabajo, a ver si sale algo'}.`]);
    if (r.age >= 70 && !said('salud')) lines.push(['salud', pick(['Pues aquí, con los achaques de la edad. Las rodillas, que ya no son lo que eran.', 'Tirando, que no es poco. Mañana tengo cita en el centro de salud.', 'Muy bien, gracias a Dios. Ochenta y tantos y aquí estoy.'])]);
    if (r.trade && !said('trabajo')) lines.push(['trabajo', pick([`Liad[o|a] con el trabajo, como siempre. Esto de ser ${C.tradeOf(r)} no para.`, 'Cansad[o|a], que hoy ha sido un día muy largo.'])]);
    if (h >= 13 && h < 18) lines.push(['calor', pick(['Con este caló no hay quien haga nada. Yo, en cuanto llegue, a la siesta.', '¡Qué caló hace, por Dios! Y eso que ya es finales de septiembre.'])]);
    if (h < 11) lines.push(['mañana', pick(['Muy bien. Me gusta salir temprano, antes de que apriete el sol.', 'Bien, aquí madrugando como siempre.'])]);
    if (!lines.length) lines.push(['bien', pick(['Pues bien, aquí estamos. ¿Y tú?', 'Bien, bien, no me puedo quejar.', 'Ahí vamos, tirando.'])]);
    const [k, txt] = tr.charla > 0.6 ? lines[0] : pick(lines);
    M.told(r, k);
    this.say(txt);
    this.menu();
  }
  news() {
    const C = this.C, r = this.r, g = this.g, M = C.memoria, tr = C.traits(r), me = this.me();
    const day = g.sky.day || 0;
    // what they have heard about you comes first (the bad things go round fast)
    const heard = M.heard(r).filter((ev) => !M.hasTold(r, 'suc' + ev.t.toFixed(1)));
    if (heard.length && Math.random() < 0.75) {
      const ev = heard[heard.length - 1];
      M.told(r, 'suc' + ev.t.toFixed(1));
      this.say(sucesoTxt(ev, me.f) + ' ' + pick(['Esto antes no pasaba en Guareña.', '¡Qué miedo!', 'Ya ha venido la Guardia Civil a preguntar.']));
      this.menu();
      return;
    }
    const N = noticias(C, day).filter((n) => !M.hasTold(r, 'n' + day + n.k) && !n.about.includes(r));
    if (!N.length) { this.say(pick(['Pues no sé, hoy no me he enterado de nada.', 'Nada, que aquí no pasa nunca nada. ¡Bendito sea!', 'Ya te lo he contado todo, {hijo|hija}.'])); this.menu(); return; }
    // the gossips tell you about people; the rest, about the town
    const people = N.filter((n) => n.about.length), town = N.filter((n) => !n.about.length);
    const n = tr.cotilla > 0.5 && people.length ? people[0] : town.length && Math.random() < 0.5 ? pick(town) : N[0];
    M.told(r, 'n' + day + n.k);
    let txt = n.txt(C);
    // do they know them? (family, friends): they say so
    const rel = n.about[0];
    const ac = rel ? C.acquaintance(r, rel) : 0;
    if (ac >= 4) txt = 'Mira, es de mi familia: ' + txt.charAt(0).toLowerCase() + txt.slice(1);
    else if (ac >= 3) txt += rel.f ? ' Es amiga mía de toda la vida.' : ' Es amigo mío de toda la vida.';
    else if (tr.cotilla > 0.7 && rel) txt = pick(['Chacho, que no se entere nadie, pero… ', '¿Te has enterao? ', 'Mira lo que me han contao: ']) + txt;
    this.say(txt);
    this.menu();
  }
  errand() {
    const C = this.C, r = this.r, g = this.g, ped = this.ped, h = g.sky.hour, day = g.sky.day || 0;
    const w = C.whereNow(r, day, h);
    let txt;
    if (ped.fresco) txt = pick(['Aquí, tomando el fresco con los vecinos, que dentro de casa no se puede estar.', 'Aquí sentad[o|a], que a estas horas es cuando mejor se está.']);
    else if (ped.bench) txt = pick(['Aquí, viendo pasar a la gente, que es gratis.', 'Descansando un poco las piernas.']);
    else if (ped.group) txt = pick(['Aquí, de cháchara con estos, arreglando el mundo.', 'Aquí, charlando un rato, que ya tocaba.']);
    else if (w && w.o) {
      const o = w.o, pl = o.place, nm = pl ? placeLabel(pl) : null;
      const home = w.phase === 'vuelta';
      const T = {
        pan: home ? 'De la panadería, que ya tengo el pan para hoy.' : `A por el pan${nm ? ', a ' + nm : ''}, que si llego tarde no quedan barras.`,
        compra: home ? 'De la compra, cargad[o|a] como una mula.' : `A hacer la compra${nm ? ', a ' + nm : ''}, que tengo la nevera pelá.`,
        bar: home ? 'Del bar, de echar un rato con los amigos.' : `Al bar${nm ? ', a ' + nm : ''}, a tomar algo con los amigos.`,
        iglesia: home ? 'De misa, de Santa María.' : 'A misa, a Santa María, que ya están tocando.',
        medico: home ? 'Del centro de salud, de que me miren la tensión.' : 'Al centro de salud, que tengo cita.',
        farmacia: home ? 'Pues de la farmacia, de por lo de la tensión, y ahora pa casa.' : `A la farmacia${nm ? ', a ' + nm : ''}, a por lo de la tensión.`,
        banco: home ? 'Del banco, de pagar recibos.' : 'Al banco, a pagar un recibo.',
        estanco: 'Al estanco, a echar la primitiva. ¡A ver si toca!',
        mercadillo: 'Al mercadillo, que hoy es miércoles. A ver qué hay.',
        abastos: 'A la plaza de abastos, a por pescado.',
        cementerio: home ? 'Del cementerio, de llevarle flores a mi difunt[o|a].' : 'Al cementerio, a llevarle unas flores a los míos.',
        paseo: 'A dar una vuelta por la plaza, que con el fresquito apetece.',
        plaza: 'A la plaza, a ver quién hay.',
        parque: 'Al parque, a estirar las piernas.',
        trabajo: home ? 'Del trabajo, reventad[o|a].' : `Al trabajo${nm ? ', a ' + nm : ''}, que entro ya.`,
        escuela: home ? 'Del instituto, a casa a comer.' : 'Al instituto, que llego tarde.',
        visita: o.place && o.place.of !== undefined ? `A casa de mi ${C.residents[o.place.of].f ? 'hija' : 'hijo'} ${C.residents[o.place.of].first}, a ver a los nietos.` : 'A casa de unos parientes.',
        polideportivo: 'Al polideportivo, a echar un partido.',
        huerto: 'Al huerto, a regar los tomates.',
        fresco: 'A casa, a sacar las sillas a la puerta.',
      };
      txt = T[o.kind] || 'Aquí, a hacer un recado.';
      if (home && !T[o.kind]) txt = 'Para casa, que ya es hora.';
    } else txt = pick(['Para casa, que ya es hora.', 'Aquí, dando una vuelta.', 'A hacer unos recados.']);
    this.say(txt);
    this.menu();
  }
  trade() {
    const C = this.C, r = this.r, M = C.memoria;
    const t = C.tradeOf(r);
    let txt;
    if (r.role === 'jubilado' || r.role === 'jubilada') txt = t ? `Yo ya estoy jubilad[o|a]. Fui ${t} toda la vida, desde los catorce años.` : 'Jubilad[o|a], gracias a Dios. Ahora a disfrutar de los nietos.';
    else if (r.role === 'cura') txt = 'Soy el párroco de Santa María. La misa es a las ocho, y los domingos a las doce: ¡a ver si te veo!';
    else if (r.role === 'casa') txt = 'Yo, mis labores: la casa, los niños y todo lo que haga falta, que no es poco.';
    else if (r.role === 'parado') txt = pick(['Ahora mismo estoy parad[o|a]. He echado currículums en la tomatera, a ver si me llaman para la campaña.', 'Buscando trabajo, que está la cosa muy mala.']);
    else if (r.role === 'joven' && r.studies) txt = 'Estudio en Badajoz, en la universidad. Vengo los fines de semana.';
    else if (r.work) txt = `Soy ${t}, en ${placeLabel(r.work)}. ${pick(['Ven un día y te invito a algo.', 'Ya sabes dónde encontrarme.', 'Es un trabajo muy sacrificado, pero me gusta.'])}`;
    else if (r.trade === 'agricultor') txt = `Agricult[or|ora]: tomate y maíz en las Vegas. ${pick(['Este año el tomate lo pagan fatal.', 'Ahora estamos terminando la campaña.'])}`;
    else if (r.trade === 'fabrica') txt = 'Trabajo en una de las tomateras, a turnos. En campaña no paramos ni de noche.';
    else txt = t ? `Soy ${t}. ${pick(['Trabajo fuera, en el polígono.', 'De lunes a viernes, como todo el mundo.'])}` : 'Pues de todo un poco, lo que va saliendo.';
    M.told(r, 'oficio');
    this.say(txt);
    this.menu();
  }
  askWay() {
    const C = this.C, U = this.usted();
    const L = SITIOS.filter(([k]) => (C.places.byKind[k] || []).length).map(([k, label]) => ({ label: cap(label), run: () => this.way(k, label) }));
    L.push({ label: 'Nada, nada, gracias', run: () => { this.say(pick(['Pues nada, tú dirás.', 'Muy bien.'])); this.menu(); } });
    this.say(U ? '¿Qué buscaba usted?' : pick(['¿Qué buscas?', 'Dime, ¿adónde quieres ir?']));
    this.options(L);
  }
  way(kind, label) {
    const g = this.g, C = this.C, M = C.memoria, pl = g.player.pos;
    const L = C.places.byKind[kind] || [];
    let best = null, bd = Infinity;
    for (const p of L) { const d = Math.hypot(p.x - pl.x, p.z - pl.z); if (d < bd) { bd = d; best = p; } }
    const walkOk = (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track';
    const D = best && directions(g.map, pl, best, walkOk);
    if (!D) { this.say('Uy, pues eso no te lo sé decir yo.'); this.menu(); return; }
    this.say(D.text);
    this.p.asked = label;
    if (g.hud) { g.hud.waypoint = { x: best.x, z: best.z }; g.hud.route = null; g.hud.routeT = 0; g.hud.notify(`📍 ${cap(label)}: marcado en el GPS`, 'info', 2.5); }
    M.relate(this.r, 0.2);
    this.menu();
  }
  bye() {
    const r = this.r, me = this.me(), h = this.g.sky.hour, p = this.p;
    const nm = p.name ? ', ' + me.name : '';
    const L = r.age >= 60 ? [`¡Adiós, {hijo|hija}! Que vaya bien.`, `Anda, ve con Dios${nm}.`, `¡Adiós${nm}! Recuerdos a los tuyos.`] : r.age >= 25 ? [`¡Hasta luego${nm}!`, '¡Venga, adiós!', `¡Que vaya bien${nm}!`] : [`¡Venga, nos vemos${nm}!`, '¡Hasta luego!', '¡Chao!'];
    if (h >= 21) L.push('¡Buenas noches! Que descanses.');
    this.C.memoria.relate(r, 0.3);
    // the old folks sometimes slip you something for a coffee (the first time you have a proper chat with them)
    const g = this.g, ped = this.ped;
    if (r.age >= 68 && p.n <= 2 && this.turns >= 2 && !p.gift && Math.random() < 0.22) {
      p.gift = 1;
      const n = 2 + Math.floor(Math.random() * 8);
      this.close(null);
      g.peds.say(ped, agree(`Toma, {zagal|zagala}, ${n} € pa un café. Y no se lo digas a nadie.`, r.f, me.f));
      g.player.money += n; g.audio.sfx('money'); g.hud.notify(`+${n} €`, 'ok', 2);
      return;
    }
    this.close(pick(L));
  }
  tease() {
    const g = this.g, ped = this.ped;
    this.C.memoria.relate(this.r, -2);
    this.close(null);
    g.peds.insult(ped);
  }

  // ---------------- every frame
  update(dt) {
    const g = this.g, ped = this.ped;
    if (!ped) return;
    const pl = g.player;
    const gone = !g.peds.list.includes(ped) || ped.state === 'dead' || ped.state === 'flee' || ped.state === 'fly' || ped.state === 'lie' || ped.state === 'fight' || ped.state === 'call';
    if (gone || pl.vehicle || g.state !== 'play') { this.close(null); return; }
    const d = Math.hypot(ped.x - pl.pos.x, ped.z - pl.pos.z);
    this.t += dt;
    if (d > 3.6) { this.close(pick(['¡Bueno, adiós!', '¿Y se va así, sin decir nada?', 'Pues nada, adiós.'])); return; }
    if (this.t > 45) { this.close(pick(['Bueno, que me voy, que se me hace tarde.', 'Venga, ya nos veremos.'])); return; }
    // looking at you while you talk
    const v = this._v || (this._v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
    if (ped.state === 'idle') { const want = Math.atan2(pl.pos.x - ped.x, pl.pos.z - ped.z); ped.heading += wrapAngle(want - ped.heading) * Math.min(1, dt * 5); }
    ped.char.lookAt(v.set(pl.pos.x, pl.pos.y + 1.55 * (pl.char.scale || 1), pl.pos.z));
    // the keys (1–9, arrows and Intro, Esc to say goodbye; the D-pad and A / B)
    const input = g.input, L = this.opts;
    for (let i = 0; i < Math.min(9, L.length); i++) if (input.hit('Digit' + (i + 1))) { this.choose(i); return; }
    if (input.hit('ArrowDown') || input.gpPressed(13)) { this.sel = (this.sel + 1) % L.length; this.render(); }
    if (input.hit('ArrowUp') || input.gpPressed(12)) { this.sel = (this.sel + L.length - 1) % L.length; this.render(); }
    if (input.hit('Enter') || input.gpPressed(0)) { this.choose(this.sel); return; }
    if (input.hit('Escape') || input.gpPressed(1)) { this.bye(); }
  }
  render() {
    if (!this.ped) { this.el.hidden = true; return; }
    const C = this.C, r = this.r, p = this.p, g = this.g, d = g.input.device;
    const who = p && p.name ? `${C.nameOf(r, 'apellido')}` : r.age >= 65 ? (r.f ? 'Una señora mayor' : 'Un señor mayor') : r.age >= 30 ? (r.f ? 'Una vecina' : 'Un vecino') : (r.f ? 'Una chica del pueblo' : 'Un chico del pueblo');
    const sub = p && p.name ? [r.age >= 65 ? `${r.age} años` : '', C.address(r) || ''].filter(Boolean).join(' · ') : '';
    const help = d === 'pad' ? `▲ ▼ y ${g.input.padName(0)} · ${g.input.padName(1)} para despedirte` : d === 'touch' ? 'Toca lo que quieras decir' : '1–9, flechas e Intro o clic · Esc para despedirte';
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    this.el.innerHTML = `<h3>${esc(who)}${sub ? `<small>${esc(sub)}</small>` : ''}</h3>` + (this.mine ? `<p class="mine">${esc(this.mine)}</p>` : '') + `<p class="line">${esc(this.line)}</p>` +
      this.opts.map((o, i) => `<button data-i="${i}" class="${i === this.sel ? 'on' : ''}"><kbd>${i + 1}</kbd><span>${o.label}</span></button>`).join('') + `<small>${help}</small>`;
    this.el.hidden = false;
  }
}
