// What the people of Guareña are doing, and why. Everyone out in the street is going somewhere that suits the hour,
// the day and who they are (the bread in the morning, the chemist's, the bank, a coffee, mass at eight, the evening
// stroll round the plaza, home for the siesta) along the real streets (A* over the walking graph); and they talk like
// neighbours: little conversations on one topic that answer each other, greetings that suit the hour, and when you stop
// them, they tell you where they are off to.
import * as THREE from 'three';
import { hash1 } from './util.js';

const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
export const weekday = (sky) => ((sky.day || 0) + 5) % 7; // 0 Monday … 6 Sunday
export function partOfDay(h) { return h < 6.5 ? 'madrugada' : h < 13.5 ? 'mañana' : h < 20.5 ? 'tarde' : 'noche'; }
// mass in Santa María: every evening at eight, and at noon on Sundays
export function massTime(h, wd) {
  const at = [20];
  if (wd === 6) at.push(12);
  for (const m of at) {
    if (h >= m - 0.6 && h < m) return { m, phase: 'antes' };
    if (h >= m && h < m + 0.75) return { m, phase: 'durante' };
    if (h >= m + 0.75 && h < m + 1.05) return { m, phase: 'salida' };
  }
  return null;
}

// ---------------------------------------------------------------- who they are
const NAMES = {
  m: { mayor: ['Paco', 'Antonio', 'Manolo', 'Julián', 'Ramón', 'Pepe', 'Fermín', 'Agustín', 'Eusebio', 'Tomás'], adulto: ['Juan', 'Luis', 'Fernando', 'Javi', 'Miguel', 'Ángel', 'Rafa', 'Sergio', 'Diego', 'Pedro'], joven: ['Álvaro', 'Hugo', 'Marcos', 'Iván', 'Rubén', 'Adri', 'Dani', 'Pablo'] },
  f: { mayor: ['Remedios', 'Juani', 'Encarna', 'Agustina', 'Isabel', 'Manoli', 'Pili', 'Rosario', 'Toñi', 'Petra'], adulto: ['Mari Carmen', 'Lola', 'Elena', 'Ana', 'Rocío', 'Pilar', 'Inma', 'Susana', 'Belén', 'Marisa'], joven: ['Lucía', 'Paula', 'Irene', 'Marta', 'Nerea', 'Sara', 'Alba', 'Claudia'] },
};
export function personaOf(desc, seed = Math.random()) {
  const f = desc.gender === 'f';
  const age = desc.elderly ? 'mayor' : desc.age && desc.age < 26 ? 'joven' : seed < 0.22 ? 'joven' : 'adulto';
  const r = (k) => hash1(Math.floor(seed * 1e7) + k);
  return {
    f, age,
    name: pick(NAMES[f ? 'f' : 'm'][age], () => r(1)),
    chatty: age === 'mayor' ? 0.6 + r(2) * 0.4 : 0.25 + r(2) * 0.6,
    hurry: age === 'mayor' ? r(3) * 0.3 : 0.2 + r(3) * 0.6,
  };
}

// ---------------------------------------------------------------- the town's places
const KINDS = {
  pan: ['shop:bakery', 'shop:confectionery'],
  compra: ['shop:supermarket', 'shop:greengrocer', 'shop:variety_store', 'shop:kiosk', 'shop:butcher'],
  estanco: ['shop:tobacco', 'shop:lottery'],
  farmacia: ['amenity:pharmacy'],
  banco: ['amenity:bank', 'amenity:post_office'],
  bar: ['amenity:bar', 'amenity:cafe', 'amenity:pub'],
  medico: ['amenity:clinic', 'amenity:doctors'],
  dentista: ['amenity:dentist'],
  escuela: ['amenity:school', 'amenity:college', 'amenity:language_school'],
  tienda: ['shop:clothes', 'shop:shoes', 'shop:books', 'shop:toys', 'shop:jewelry', 'shop:perfumery', 'shop:beauty', 'shop:hairdresser', 'shop:florist', 'shop:optician', 'shop:hardware'],
  ayto: ['amenity:townhall', 'amenity:library'],
};
// where each kind of person goes at each part of the day (weights)
const WANTS = {
  mayor: {
    madrugada: { casa: 1 },
    mañana: { pan: 3, compra: 2.2, farmacia: 2, medico: 1.4, dentista: 0.3, banco: 1.2, plaza: 3, parque: 1.2, ayto: 0.5, estanco: 0.6, bar: 0.8, casa: 1.2 },
    tarde: { plaza: 3, parque: 2, compra: 1, farmacia: 0.8, bar: 0.8, casa: 1.6, iglesia: 0.4 },
    noche: { casa: 4, plaza: 1, bar: 0.3 },
  },
  adulto: {
    madrugada: { casa: 2, bar: 0.4 },
    mañana: { compra: 2.4, pan: 1.6, banco: 1.6, bar: 1.6, farmacia: 0.8, ayto: 1, tienda: 1.2, medico: 0.6, dentista: 0.3, estanco: 0.8, escuela: 0.5, casa: 1.2 },
    tarde: { compra: 1.6, tienda: 1.6, bar: 2, plaza: 1.6, parque: 1.2, farmacia: 0.6, dentista: 0.3, casa: 1.4, iglesia: 0.15 },
    noche: { bar: 2.2, plaza: 1.2, casa: 3 },
  },
  joven: {
    madrugada: { casa: 1.5, bar: 1.2 },
    mañana: { escuela: 2.4, tienda: 1, compra: 0.8, bar: 0.8, parque: 0.8, plaza: 0.8, casa: 0.6 },
    tarde: { parque: 2, plaza: 2, bar: 1.4, tienda: 1.4, compra: 0.6, casa: 1 },
    noche: { plaza: 2, bar: 2.6, parque: 0.8, casa: 1.4 },
  },
};
export class Places {
  constructor(game) {
    this.game = game;
    const g = game, map = g.map;
    this.byKind = {};
    const add = (kind, p) => { (this.byKind[kind] || (this.byKind[kind] = [])).push(p); };
    const walkOk = (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track';
    const anchor = (x, z, fx, fz, kind, name) => {
      const q = map.nearestEdge(x, z, 30, walkOk);
      if (!q || q.d > 30) return null;
      const t = map.sample(q.edge, q.s, {});
      const side = (x - t.x) * -t.dz + (z - t.z) * t.dx >= 0 ? 1 : -1;
      return { kind, name: name || '', x, z, fx: fx ?? x, fz: fz ?? z, edge: q.edge, s: q.s, side };
    };
    const seen = [];
    for (const poi of map.pois) {
      if (!map.inTown(poi.x, poi.z)) continue;
      const kind = Object.keys(KINDS).find((k) => KINDS[k].includes(poi.kind));
      if (!kind) continue;
      const d = g.activities && g.activities.doorOf ? g.activities.doorOf(poi) : null;
      const x = d ? d.x : poi.x, z = d ? d.z : poi.z;
      if (seen.some((s) => Math.hypot(s[0] - x, s[1] - z) < 4)) continue;
      seen.push([x, z]);
      const p = anchor(x, z, d && d.fx, d && d.fz, kind, poi.name);
      if (p) add(kind, p);
    }
    // the shops you can walk into yourself
    for (const s of (g.shops && g.shops.list) || []) {
      const kind = s.type === 'panaderia' ? 'pan' : s.type === 'super' || s.type === 'fruteria' || s.type === 'bazar' ? 'compra' : 'tienda';
      if (seen.some((q) => Math.hypot(q[0] - s.x, q[1] - s.z) < 4)) continue;
      const p = anchor(s.x, s.z, s.fx, s.fz, kind, s.title);
      if (p) add(kind, p);
    }
    const lm = (g.world && g.world.landmarks && g.world.landmarks.poi) || {};
    if (lm.churchDoor) { const p = anchor(lm.churchDoor.x, lm.churchDoor.z, lm.churchPortal ? lm.churchPortal.x : lm.churchDoor.x, lm.churchPortal ? lm.churchPortal.z : lm.churchDoor.z, 'iglesia', 'Santa María'); if (p) { p.big = true; add('iglesia', p); } }
    if (lm.salud) { const p = anchor(lm.salud.x, lm.salud.z, null, null, 'medico', 'Centro de Salud'); if (p) add('medico', p); }
    // plazas and parks: somewhere in them to stroll to
    for (const a of map.areas) {
      const kind = a.kind === 'leisure:park' ? 'parque' : ['place:square', 'highway:pedestrian', 'amenity:marketplace'].includes(a.kind) ? 'plaza' : null;
      if (!kind) continue;
      let cx = 0, cz = 0; const r = a.ring;
      for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; }
      cx /= r.length / 2; cz /= r.length / 2;
      if (!map.inTown(cx, cz) || map.buildingAt(cx, cz)) continue;
      const p = anchor(cx, cz, null, null, kind, a.name);
      if (p) { p.open = true; add(kind, p); }
    }
    if (lm.plaza) { const p = anchor(lm.plaza.x, lm.plaza.z, null, null, 'plaza', 'Plaza de España'); if (p) { p.open = true; p.main = true; add('plaza', p); } }
    this.doors = (g.world && g.world.facadeDoors) || [];
  }
  // a home door near (x, z): the street side of a real house door
  home(x, z, rnd = Math.random) {
    const D = this.doors;
    if (!D.length) return null;
    let best = null, bd = 1e9;
    for (let k = 0; k < 24; k++) {
      const d = D[Math.floor(rnd() * D.length)];
      const dist = Math.hypot(d.x - x, d.z - z);
      const sc = Math.abs(dist - 140) + rnd() * 60;
      if (dist > 25 && sc < bd) { bd = sc; best = d; }
    }
    if (!best) return null;
    const map = this.game.map;
    const q = map.nearestEdge(best.x, best.z, 20, (e) => e.walk && !e.blocked && !e.dirt);
    if (!q || q.d > 20) return null;
    const t = map.sample(q.edge, q.s, {});
    const side = (best.x - t.x) * -t.dz + (best.z - t.z) * t.dx >= 0 ? 1 : -1;
    return { kind: 'casa', name: 'casa', x: best.x, z: best.z, fx: best.wx, fz: best.wz, edge: q.edge, s: q.s, side };
  }
  // somewhere this person would go now, not too far and not too near (x, z)
  choose(persona, h, wd, x, z, rnd = Math.random) {
    const part = partOfDay(h);
    const w = { ...(WANTS[persona.age] || WANTS.adulto)[part] };
    const mass = massTime(h, wd);
    if (mass && mass.phase === 'antes') w.iglesia = (w.iglesia || 0) + (persona.age === 'mayor' ? 9 : persona.age === 'adulto' ? 2 : 0.4);
    if (h >= 13.6 && h < 16.5) { w.casa = (w.casa || 0) + 5; w.bar = (w.bar || 0) * 0.6; } // the siesta: home, or the bar
    if (wd === 6) { w.escuela = 0; w.banco = 0; w.ayto = 0; w.tienda = (w.tienda || 0) * 0.3; w.bar = (w.bar || 0) * 1.6; w.plaza = (w.plaza || 0) * 1.4; }
    if (wd === 5 && h < 14) w.escuela = 0;
    if (h < 9 || h > 20.5) { w.banco = 0; w.ayto = 0; w.medico = 0; w.dentista = 0; }
    if (h > 21 || h < 8) { w.pan = 0; w.compra = 0; w.tienda = 0; w.farmacia = (w.farmacia || 0) * 0.2; w.escuela = 0; }
    if (h < 8 || h > 14.5) w.escuela = 0;
    let tot = 0;
    for (const k in w) { if (k !== 'casa' && !(this.byKind[k] && this.byKind[k].length)) w[k] = 0; tot += w[k] || 0; }
    for (let tries = 0; tries < 4; tries++) {
      let r = rnd() * tot, kind = 'casa';
      for (const k in w) { r -= w[k] || 0; if (r <= 0) { kind = k; break; } }
      const p = kind === 'casa' ? this.home(x, z, rnd) : this.near(kind, x, z, rnd);
      if (p) return p;
    }
    return this.home(x, z, rnd);
  }
  // one of this kind, the nearer the likelier (people go to their own bakery, not across town)
  near(kind, x, z, rnd = Math.random) {
    const L = this.byKind[kind];
    if (!L || !L.length) return null;
    let best = null, bs = 1e9;
    for (const p of L) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 18) continue;
      const sc = (p.big ? d * 0.5 : d) * (0.6 + rnd() * 0.8);
      if (sc < bs) { bs = sc; best = p; }
    }
    return best;
  }
}

// ---------------------------------------------------------------- the way there: A* over the walking graph
// from / to: { edge, s }; returns [{ edge, dir }] — the first step is the edge you are on, the last the one the place is on
export function routeBetween(map, from, to, ok) {
  const e0 = from.edge, e1 = to.edge;
  if (e0 === e1) return [{ edge: e0, dir: to.s >= from.s ? 1 : -1 }];
  const N = map.nodes, E = map.edges;
  const gx = (N[e1.a].x + N[e1.b].x) / 2, gz = (N[e1.a].z + N[e1.b].z) / 2;
  const gs = new Map(), came = new Map(), open = [];
  const push = (n, g, prev, edge) => {
    if (gs.has(n) && gs.get(n) <= g) return;
    gs.set(n, g); came.set(n, { prev, edge });
    open.push({ n, f: g + Math.hypot(N[n].x - gx, N[n].z - gz) });
  };
  push(e0.a, from.s, -1, e0); push(e0.b, e0.len - from.s, -1, e0);
  let best = null, bestCost = Infinity;
  const done = new Set();
  for (let it = 0; it < 4000 && open.length; it++) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { n, f } = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done.has(n)) continue;
    if (f >= bestCost) break;
    done.add(n);
    const g = gs.get(n);
    if (n === e1.a && g + to.s < bestCost) { bestCost = g + to.s; best = { n, dir: 1 }; }
    if (n === e1.b && g + e1.len - to.s < bestCost) { bestCost = g + e1.len - to.s; best = { n, dir: -1 }; }
    for (const id of N[n].edges) {
      const e = E[id];
      if (e === e1 || !ok(e)) continue;
      const m = e.a === n ? e.b : e.a;
      if (!done.has(m)) push(m, g + e.len + (e.drive && !e.walkOnly ? 0.5 : 0), n, e);
    }
  }
  if (!best) return null;
  // back from the place's edge to the start
  const steps = [{ edge: e1, dir: best.dir }];
  let n = best.n;
  for (let k = 0; k < 600; k++) {
    const c = came.get(n);
    if (!c) return null;
    if (c.prev < 0) { steps.push({ edge: e0, dir: n === e0.b ? 1 : -1 }); break; }
    steps.push({ edge: c.edge, dir: c.edge.a === c.prev ? 1 : -1 });
    n = c.prev;
  }
  return steps.reverse();
}

// ---------------------------------------------------------------- what they say
// placeholders: [m|f] agrees with the speaker, <m|f> with the one spoken to, @ is the other one's name
export const GREET = {
  mañana: { mayor: ['Buenos días, {hijo|hija}.', '¡Buenos días!', '¡Muy buenas, {hijo|hija}!'], adulto: ['¡Buenos días!', '¡Buenas!', '¡Muy buenos días!'], joven: ['¡Buenas!', '¡Ey!', '¿Qué pasa?'] },
  tarde: { mayor: ['Buenas tardes, {hijo|hija}.', '¡Adiós, {guapo|guapa}!', '¡Buenas tardes!'], adulto: ['¡Buenas tardes!', '¡Buenas!', '¡Adiós!'], joven: ['¡Buenas!', '¿Qué pasa?', '¡Ey, qué tal!'] },
  noche: { mayor: ['Buenas noches, {hijo|hija}.', '¡Adiós, que descanses!', '¡Buenas noches!'], adulto: ['¡Buenas noches!', '¡Buenas!', '¡Adiós!'], joven: ['¡Buenas!', '¿Qué pasa?', '¡Ey!'] },
  madrugada: { mayor: ['¿Qué haces por ahí a estas horas, {hijo|hija}?', 'Buenas noches.'], adulto: ['Buenas noches.', '¡Buenas!'], joven: ['¡Ey!', '¿Qué pasa? ¿De fiesta?'] },
};
// two neighbours who pass each other in the street
// two who know each other only by sight, in passing: the town's short greeting, by age and time of day (<m|f>: the
// one greeted), and its answer
export const BY_SIGHT = {
  mañana: { mayor: ['¡Buenos días!', '¡Adiós!', 'Buenos días nos dé Dios.', '¡Muy buenas!', '¡Adiós, <hijo|hija>!'], adulto: ['¡Buenos días!', '¡Buenas!', '¡Adiós!', '¡Muy buenas!', '¡Adiós, buenos días!'], joven: ['¡Buenas!', '¡Ey!', '¡Buenos días!', '¡Adiós!'] },
  tarde: { mayor: ['¡Buenas tardes!', '¡Adiós!', '¡Adiós, <hijo|hija>!', 'Vaya usted con Dios.', '¿Qué, de paseo?'], adulto: ['¡Buenas tardes!', '¡Adiós!', '¡Buenas!', '¡Adiós, buenas!', '¡Hasta luego!'], joven: ['¡Buenas!', '¡Ey!', '¿Qué pasa?', '¡Adiós!'] },
  noche: { mayor: ['¡Buenas noches!', '¡Adiós!', '¡Hasta mañana, si Dios quiere!', '¡Adiós, <hijo|hija>!'], adulto: ['¡Buenas noches!', '¡Adiós!', '¡Hasta mañana!', '¡Buenas!'], joven: ['¡Buenas!', '¡Ey!', '¡Hasta luego!', '¿Qué pasa?'] },
};
export const BY_SIGHT_RE = {
  mañana: ['¡Buenos días!', '¡Adiós!', '¡Igualmente!', '¡Muy buenas!', '¡Adiós, adiós!', '¡Buenas!'],
  tarde: ['¡Adiós!', '¡Buenas tardes!', '¡Adiós, adiós!', '¡Igualmente!', '¡Hasta luego!', '¡Buenas!'],
  noche: ['¡Buenas noches!', '¡Adiós!', '¡Hasta mañana!', '¡Igualmente!', '¡Adiós, adiós!'],
};
export const PASSING = {
  mañana: [['¡Buenos días, @!', '¡Buenos días! ¿Ya vas a por el pan?'], ['¡Adiós, @!', '¡Adiós, <hijo|hija>!'], ['¡Buenas!', '¡Muy buenas! ¿Qué tal todo?'], ['¡Buenos días!', '¡Buenos días! Qué mañanita más buena.']],
  tarde: [['¡Buenas tardes, @!', '¡Buenas tardes!'], ['¡Adiós, @!', '¡Adiós! Recuerdos a los tuyos.'], ['¡Adiós!', '¡Adiós, <hijo|hija>, adiós!'], ['¿Dónde vas con este caló, @?', 'Aquí, a hacer un recao.']],
  noche: [['¡Buenas noches, @!', '¡Buenas noches! Que descanses.'], ['¡Adiós, @!', '¡Hasta mañana!'], ['¡Buenas!', '¡Buenas noches!']],
  madrugada: [['¡Buenas noches!', 'Buenas…']],
};
// when you stop someone: where they are off to, in their own words
const ERRAND = {
  pan: ['Voy a por el pan, que si llego tarde no queda.', 'A la panadería, a por unas perrunillas.', 'A por una barra, que en casa no hay ni miga.'],
  compra: ['Voy a hacer la compra, que tengo el frigorífico pelao.', 'Al super, que no me queda ni aceite.', 'A por fruta, que dicen que han traído melones de los buenos.'],
  estanco: ['Voy al estanco, a echar la primitiva.', 'A por el periódico y la lotería.'],
  farmacia: ['Voy a la farmacia, a por lo de la tensión.', 'A la farmacia, que a mi [mujer|marío] le duele la espalda otra vez.'],
  banco: ['Voy al banco, a ver si me han ingresao ya.', 'A Correos, a mandar un paquete a mi hija.', 'Al banco, a pagar el recibo de la luz. ¡Qué cara está!'],
  bar: { mañana: ['Voy a tomarme un café, que sin café no soy persona.', 'Al bar, a desayunar una tostá.'], tarde: ['Voy a echar una caña con los amigos.', 'A la terraza, a tomar algo a la sombra.'], noche: ['Voy al bar, que hay partido.', 'A tomar algo, que hoy es día de salir.'], madrugada: ['A tomar la última.'] },
  medico: ['Tengo cita en el centro de salud.', 'Voy al médico, que este catarro no se me quita.'],
  dentista: ['Voy al dentista, que tengo una muela fastidiá.', 'Tengo cita en el dentista. ¡Qué miedo me da!'],
  escuela: ['Voy a clase, que llego tarde.', 'Al instituto, que tengo examen de mates.'],
  tienda: ['Voy a mirar unos zapatos.', 'A ver si encuentro un regalo pa mi sobrina, que es su cumpleaños.', 'Voy a por una cosa a la tienda.'],
  ayto: ['Voy al ayuntamiento, a por un papel.', 'A la biblioteca, a devolver un libro.'],
  iglesia: ['Voy a misa, que ya están tocando.', 'A misa de ocho, como todos los días.', 'Voy a encenderle una vela a la Virgen.'],
  plaza: ['Voy a la plaza, a ver quién hay.', 'A la plaza, que he quedao.', 'A dar una vuelta por la plaza.'],
  parque: ['Voy a dar un paseo por el parque.', 'Al parque, a estirar las piernas.'],
  casa: { mañana: ['Me voy pa casa, que tengo la comida al fuego.', 'Para casa, que ya he hecho los recaos.'], tarde: ['Pa casa, a echarme la siesta.', 'Me vuelvo a casa, que hace mucho caló.'], noche: ['Me voy pa casa, que ya es tarde.', 'A casa, que mañana madrugo.'], madrugada: ['A casa, a dormir.'] },
};
export function errandLine(kind, h) {
  const part = partOfDay(h);
  let L = ERRAND[kind] || ERRAND.casa;
  if (!Array.isArray(L)) L = L[part] || L.tarde || L.mañana;
  return pick(L);
}
export function greetLine(persona, h) {
  const G = GREET[partOfDay(h)];
  return pick(G[persona.age] || G.adulto);
}
// when you keep stopping them, or they are in a hurry
export const BUSY = ['Perdona, que voy con prisa.', 'Ahora no puedo, que llego tarde.', 'Luego hablamos, ¿vale?'];
export const ANNOYED = ['Que sí, que sí… déjame [tranquilo|tranquila].', '¿Otra vez tú? Qué pesaíto.', 'Anda, ve a molestar a otro.', 'Tengo prisa, {zagal|zagala}.'];
export const ANNOYED_SAT = ['Anda, déjanos, que estamos hablando.', '¿Otra vez tú? Qué pesaíto.', 'Venga, ve con Dios, {hijo|hija}.', 'Que sí, que sí…'];
export const WARY = ['Tú eres el que anda buscando la Guardia Civil… déjame en paz.', 'No quiero líos, ¿eh?', 'Aléjate de mí, que llamo a la Guardia Civil.'];
export const AFTER_DARK = ['¿Qué haces a estas horas por la calle, {hijo|hija}?', 'Vete pa casa, que ya es muy tarde.'];
export const FOLLOWED = ['¿Por qué me sigues?', '¿Quieres algo? Llevas un rato detrás de mí.', 'Oye, ¿me estás siguiendo?'];
export const CLOSE = ['¿Quieres algo?', 'Perdona, ¿me dejas pasar?', 'Uy, qué susto. No te había visto.'];

// little conversations: the roles take turns (0, 1, 2…). when: parts of the day; where: plaza, puerta, calle, banco,
// iglesia; who: the age of whoever starts; wd: days; need: 'mercado' (market morning), 'jaleo' (trouble just now),
// 'misa' (mass about to start or just over)
export const TALKS = [
  { when: ['mañana'], lines: [[0, '¿Ya has ido a por el pan?'], [1, 'Ahora voy, que luego se acaban las barras.'], [0, 'Pues date prisa, que hoy hay cola hasta la puerta.']] },
  { when: ['mañana'], lines: [[0, 'Hoy va a apretar el sol, ya verás.'], [1, 'A las doce no se va a poder ni salir a la calle.'], [0, 'Yo ya he regao los geranios, por si acaso.']] },
  { when: ['mañana'], need: 'mercado', lines: [[0, '¿Vas al mercadillo?'], [1, 'Sí, a ver si encuentro unas zapatillas pa mi Paco.'], [0, 'Dicen que el de la fruta trae melones de los buenos.'], [1, 'La última vez me salió uno más soso que el agua.']] },
  { when: ['mañana', 'tarde'], who: 'mayor', lines: [[0, '¿Y tú qué tal de lo tuyo?'], [1, 'Ahí vamos. Mañana tengo cita en el centro de salud.'], [0, 'Pues que te miren bien, que el invierno pasado estuviste una semana en la cama.'], [1, 'Calla, calla, no me lo recuerdes.']] },
  { when: ['mañana'], who: 'mayor', lines: [[0, '¿Has cobrao ya la pensión?'], [1, 'Este mes la han ingresao antes. Vengo del banco.'], [0, 'Menos mal, que con lo caro que está todo…'], [1, 'Y la luz, que no veas cómo ha subío.']] },
  { when: ['tarde'], need: 'misa', lines: [[0, '¿Vas a misa de ocho?'], [1, 'Sí, que hoy es el aniversario de mi madre.'], [0, 'Pues guárdame un sitio, que si no me toca de pie.']] },
  { where: ['iglesia'], need: 'misa', lines: [[0, 'Qué bonita ha estado la misa.'], [1, 'Y qué bien canta el coro, ¿eh?'], [0, 'Eso es la Encarna, que tiene una voz de ángel.']] },
  { who: 'adulto', lines: [[0, '¿Cómo viene este año la uva?'], [1, 'Buena, pero si no llueve un poco se va a quedar chica.'], [0, 'Y el tomate igual. En la cooperativa dicen que este año pagan poco.'], [1, 'Como siempre, coile.']] },
  { who: 'adulto', lines: [[0, '¿Viste el partido del domingo en La Noria?'], [1, 'Dos a uno, y el gol en el último minuto.'], [0, '¡Ese delantero vale un imperio!'], [1, 'Pues dicen que se lo quiere llevar el Villanovense.']] },
  { lines: [[0, '¿Has oído lo del Turuñuelo?'], [1, '¿Lo de los tartesos? Dicen que han sacao unas caras de piedra.'], [0, 'De hace dos mil quinientos años, y aquí al lao.'], [1, 'Y nosotros sin enterarnos de ná.']] },
  { who: 'mayor', lines: [[0, '¿Y tu nieto, qué tal por Badajoz?'], [1, 'Muy contento. Estudia pa enfermero.'], [0, 'Eso tiene salida, eso tiene salida.']] },
  { who: 'adulto', lines: [[0, 'Ya están otra vez levantando la calle.'], [1, 'Cada año igual, y nunca terminan.'], [0, 'A mí me han dejao la puerta llena de polvo.']] },
  { when: ['tarde', 'noche'], lines: [[0, '¿Vais a ir a la feria este año?'], [1, 'Claro, a la caseta de la peña, como siempre.'], [0, 'A ver si este año no os quedáis hasta las seis.'], [1, 'Eso no te lo prometo.']] },
  { when: ['noche'], lines: [[0, 'Esta noche hay verbena en la plaza.'], [1, '¿Y quién toca?'], [0, 'Una orquesta de Don Benito. Dicen que es muy buena.']] },
  { when: ['tarde', 'noche'], where: ['puerta'], lines: [[0, 'Ay, qué bien se está ya con el fresquito.'], [1, 'Hoy ha hecho un caló que no se podía ni respirar.'], [2, 'Y mañana dicen que más.'], [0, 'Pues mañana nos sentamos más tarde.']] },
  { where: ['puerta', 'banco', 'plaza'], who: 'mayor', lines: [[0, '¿Te has enterao de lo de la hija de la Juani?'], [1, 'No, ¿qué ha pasao?'], [0, 'Que se casa en octubre, con uno de Villanueva.'], [1, '¡Anda! Pues a mí no me había dicho ná.']] },
  { when: ['mañana'], where: ['puerta', 'calle'], lines: [[0, '¿Ha pasao ya el butanero?'], [1, 'A las diez, y yo sin sacar la bombona.'], [0, 'Pues déjala en la puerta, que el jueves vuelve.']] },
  { when: ['mañana'], lines: [[0, '¿Qué vas a hacer hoy de comer?'], [1, 'Gazpacho, que con este caló no apetece otra cosa.'], [0, 'Yo migas. Mi [mujer|marío] no perdona las migas.']] },
  { when: ['mañana', 'tarde'], lines: [[0, 'Vengo del super y no veas qué caro está todo.'], [1, 'Los tomates a dos euros. ¡A dos euros!'], [0, 'Y eso que aquí los criamos nosotros.']] },
  { lines: [[0, '¿Has visto que han vuelto las cigüeñas a la torre de Santa María?'], [1, 'Ahí llevan toda la vida, en el mismo nido.'], [0, 'Más que el cura, fíjate.']] },
  { who: 'mayor', lines: [[0, 'Mi abuelo se sabía de memoria «El miajón de los castúos».'], [1, 'Luis Chamizo, el de aquí. Eso sí que era un poeta.'], [0, 'Y escribía como hablamos nosotros.']] },
  { need: 'jaleo', lines: [[0, '¿Has visto el jaleo de antes?'], [1, 'Sí, uno corriendo como un loco por la calle.'], [0, 'Ya ha venido la Guardia Civil. A ver si lo cogen.']] },
  { need: 'jaleo', lines: [[0, '¿Qué ha pasao ahí abajo?'], [1, 'No sé, pero he oído unas voces…'], [0, 'Esto antes no pasaba en Guareña.']] },
  { when: ['tarde'], lines: [[0, 'Me voy pa casa, que ya es hora de la siesta.'], [1, 'Haces bien. Con este caló, a la sombrita.']] },
  { when: ['tarde'], who: 'mayor', lines: [[0, '¿Damos una vuelta hasta el parque?'], [1, 'Venga, pero despacito, que me duelen las rodillas.'], [0, 'Despacito y con buena letra.']] },
  { who: 'joven', lines: [[0, 'Tío, ¿estudiaste pa el examen?'], [1, 'Qué va. Me pasé la tarde en la piscina.'], [0, 'Pues mañana ya verás.']] },
  { who: 'joven', when: ['tarde', 'noche'], lines: [[0, '¿Esta noche dónde quedamos?'], [1, 'En la plaza, a las once, y luego vemos.'], [0, 'Vale, avisa a los demás.']] },
  { who: 'joven', lines: [[0, 'Mi primo se ha comprao una moto nueva.'], [1, '¿Y te deja cogerla?'], [0, 'Ni de broma. No la deja ni mirar.']] },
  { lines: [[0, 'Dicen que viene tormenta pa el fin de semana.'], [1, 'Falta hace, que el campo está seco.'], [0, 'A ver si es verdad y no se queda en ná.']] },
  { lines: [[0, '¡Buenas! ¿Qué tal la familia?'], [1, 'Bien, bien, todos bien, gracias a Dios. ¿Y la tuya?'], [0, 'Tirando, que no es poco.']] },
  { wd: [6], lines: [[0, '¿Qué, a misa de doce?'], [1, 'Y luego al vermú, como Dios manda.']] },
  { lines: [[0, 'El domingo fuimos al pantano a merendar.'], [1, '¿Y había agua?'], [0, 'Poca, pero a la sombra de los eucaliptos se estaba de gloria.']] },
  { who: 'adulto', when: ['tarde', 'noche'], lines: [[0, '¿Has probao el pitarra de este año?'], [1, 'Está fuertecito. Con dos vasinos ya canto.'], [0, 'Pues el de mi suegro es peor, te lo digo yo.']] },
  { when: ['mañana'], lines: [[0, 'Vengo del ayuntamiento, a por un papel.'], [1, '¿Y te lo han dao?'], [0, 'Que vuelva mañana. Como siempre.']] },
  { lines: [[0, '¿Qué farmacia está de guardia esta semana?'], [1, 'La de la plaza, me parece.'], [0, 'Pues menos mal, que me pilla al lao.']] },
  { when: ['mañana'], lines: [[0, '¡Qué mañanita más buena hace!'], [1, 'Aprovecha ahora, que a mediodía no hay quien pare.']] },
  { when: ['noche'], lines: [[0, 'Bueno, me voy a acostar, que mañana madrugo.'], [1, 'Hasta mañana. Que descanses.'], [0, 'Igualmente.']] },
  { where: ['plaza', 'banco'], lines: [[0, '¿Te acuerdas cuando la plaza era de tierra?'], [1, 'Y los domingos venía el cine de verano.'], [0, 'Qué tiempos aquellos, ¿eh?']] },
  { where: ['plaza'], when: ['tarde', 'noche'], lines: [[0, 'Cuánta gente hay hoy en la plaza.'], [1, 'Es que con el buen tiempo sale todo el pueblo.'], [2, 'Como tiene que ser.']] },
  { who: 'adulto', lines: [[0, '¿Has visto a ese que va por ahí con la mochila roja?'], [1, 'El repartidor. Ese conoce el pueblo mejor que el cartero.']] },
];
// a grown-up and the children they are taking to school or bringing back (role 0: the grown-up, 1: the child)
export const KID_TALKS = [
  { kid: true, lines: [[0, '¿Qué tal en el cole?'], [1, 'Bien. Hoy hemos hecho un mural de las cigüeñas.'], [0, '¡Qué bonito! Luego me lo enseñas.']] },
  { kid: true, lines: [[1, '¿Me compras unas pipas?'], [0, 'Si te comes toda la comida, sí.'], [1, '¡Vale!']] },
  { kid: true, lines: [[1, '¿Qué hay de comer?'], [0, 'Lentejas.'], [1, '¡Jo, otra vez!'], [0, 'Las lentejas: si quieres las comes, y si no, las dejas.']] },
  { kid: true, lines: [[1, 'El viernes hay excursión al pantano.'], [0, '¿Y tienes la autorización firmada?'], [1, 'Está en la mochila.']] },
  { kid: true, lines: [[0, 'Dame la mano para cruzar.'], [1, 'Ya sé cruzar sol[o|a]…'], [0, 'Que me des la mano, te digo.']] },
  { kid: true, lines: [[1, '¿Puedo ir luego al parque?'], [0, 'Cuando hagas los deberes.'], [1, 'Jo…']] },
  { kid: true, lines: [[0, '¿Te has comido todo el bocadillo?'], [1, 'Casi todo…'], [0, '¿Casi?']] },
  { kid: true, lines: [[1, 'La seño dice que el sábado hay teatro en la Casa de la Cultura.'], [0, 'Pues iremos a verlo, si te portas bien.']] },
  { kid: true, lines: [[0, 'Mira, las cigüeñas en la torre de Santa María.'], [1, '¿Cuántas hay?'], [0, 'Cuéntalas tú.']] },
  { kid: true, lines: [[1, 'Hoy en el recreo hemos jugado al fútbol.'], [0, '¿Y quién ha ganado?'], [1, 'Nosotros, cinco a tres.']] },
  { kid: true, lines: [[0, '¿Qué os ha mandado la seño?'], [1, 'Una ficha de mates.'], [0, 'Pues nada más comer, la hacemos.']] },
  { kid: true, lines: [[1, 'Mañana hay que llevar un tetrabrik pa manualidades.'], [0, 'Pues mira a ver si queda alguno de leche.']] },
  { kid: true, lines: [[1, '¿Sabes que a Lucas se le ha caído un diente?'], [0, '¿Y le va a venir el Ratoncito Pérez?'], [1, '¡Esta noche!']] },
  { kid: true, lines: [[0, 'Ponte bien la mochila, que vas torcid<o|a>.'], [1, 'Es que pesa un montón.']] },
  { kid: true, lines: [[1, 'Tengo un hambre…'], [0, 'Pues hay cocido.'], [1, '¡Bien!']] },
  { kid: true, lines: [[1, 'Hemos aprendido una canción de las cigüeñas.'], [0, 'A ver, cántamela.'], [1, 'Que me da vergüenza…']] },
  { kid: true, lines: [[0, '¿Te has puesto la chaqueta en el recreo?'], [1, 'Sí…'], [0, 'Ya, ya.']] },
  { kid: true, lines: [[1, 'El jueves es el cumple de Martina y nos invita a todos.'], [0, 'Pues habrá que comprarle algo.']] },
  { kid: true, lines: [[1, 'La seño me ha puesto un positivo.'], [0, '¡Muy bien! ¿Y eso?'], [1, 'Por leer en voz alta sin trabarme.']] },
];
// what was said lately anywhere in the town (real seconds): the next group talks about something else
const RECENT = new Map();
const recentlyUsed = (t) => { const at = RECENT.get(t); return at !== undefined && performance.now() - at < 75000; };
// the line that closes a chat when someone has to go
export const BYE = [
  ['Bueno, me voy, que se me hace tarde.', '¡Adiós, adiós! Recuerdos a los tuyos.'], ['Venga, que tengo que hacer la comida.', '¡Hasta luego!'],
  ['Me voy, que me están esperando.', 'Anda, ve, ve.'], ['Bueno, pues nada, ya nos veremos.', '¡Venga, hasta otra!'],
  ['Me voy yendo, que tengo la lavadora puesta.', 'Ea, pues hala, hasta luego.'], ['Venga, que se me enfría el pan.', '¡Adiós, <guapo|guapa>!'],
  ['Bueno, que te dejo, que llevarás prisa.', 'Qué va, pero sí, me voy yendo. ¡Adiós!'], ['Hala, saluda a tu madre de mi parte.', 'De tu parte. ¡Adiós!'],
  ['Me voy, que viene el chiquillo del colegio.', '¡Corre, corre! Hasta luego.'], ['Bueno, a ver si nos vemos más.', '¡Eso, eso! Adiós.'],
];

// choose a conversation that suits who, where and when (today's news of the town first, now and then: ctx.extra)
export function chooseTalk(ctx, used = null) {
  const t = chooseTalk0(ctx, used);
  if (t) RECENT.set(t, performance.now());
  return t;
}
function chooseTalk0(ctx, used) {
  const fresh = (A) => { const F = A.filter((t) => !recentlyUsed(t)); return F.length ? F : A; };
  const X = ctx.extra && fresh(ctx.extra.filter((t) => !used || !used.has(t)));
  if (X && X.length && (ctx.kidOnly || Math.random() < 0.45)) return X[Math.floor(Math.random() * X.length)];
  if (ctx.kidOnly) return ctx.extra.length ? ctx.extra[Math.floor(Math.random() * ctx.extra.length)] : null;
  const L = TALKS.filter((t) =>
    (!t.when || t.when.includes(ctx.part)) && (!t.where || t.where.includes(ctx.where)) && (!t.who || t.who === ctx.who || (t.who === 'adulto' && ctx.who === 'mayor')) &&
    (!t.wd || t.wd.includes(ctx.wd)) && (!t.need || ctx.needs.includes(t.need)) && (t.lines.reduce((m, l) => Math.max(m, l[0]), 0) < ctx.n));
  if (!L.length) return null;
  const unused = fresh(used ? L.filter((t) => !used.has(t)) : L);
  // things that are happening come first
  const urgent = unused.filter((t) => t.need);
  return pick(urgent.length && Math.random() < 0.8 ? urgent : unused.length ? unused : L);
}
// fill in the agreement marks for one line, said by `sp` to `to` (persona objects)
export function fillLine(text, sp, to) {
  return String(text)
    .replace(/\[([^|\[\]]*)\|([^|\[\]]*)\]/g, (_, m, f) => (sp && sp.f ? f : m))
    .replace(/<([^|<>]*)\|([^|<>]*)>/g, (_, m, f) => (to && to.f ? f : m))
    .replace(/@/g, (to && to.name) || '');
}

// a conversation running between some people (2–4): they take turns; the others look at whoever speaks
export class Chat {
  constructor(peds, members, ctx, { loop = true, onEnd = null } = {}) {
    this.P = peds; this.members = members; this.ctx = ctx; this.loop = loop; this.onEnd = onEnd;
    this.used = new Set(); this.t = 0.6 + Math.random() * 1.5; this.talk = null; this.i = 0; this.speaker = null; this.done = false;
  }
  start() {
    this.ctx.n = this.members.length;
    this.talk = chooseTalk(this.ctx, this.used);
    this.i = 0;
    if (!this.talk) { this.finish(); return; }
    this.used.add(this.talk);
    if (this.used.size > 8) this.used.clear();
    // whoever begins: someone of the age the talk is for, if there is one
    // whoever begins: someone of the age the talk is for, if there is one; otherwise whoever (not always the same one)
    const who = this.talk.who;
    const cand = this.talk.kid ? this.members.filter((m) => m.persona && m.persona.r && m.persona.r.age >= 18) : who ? this.members.filter((m) => m.persona && m.persona.age === who) : this.members;
    const lead = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    if (lead) { const k = this.members.indexOf(lead); this.members.splice(k, 1); this.members.unshift(lead); }
    if (this.members.length > 2 && Math.random() < 0.5) { const rest = this.members.slice(1).reverse(); this.members.splice(1, rest.length, ...rest); }
  }
  update(dt, near) {
    if (this.done) return;
    this.members = this.members.filter((m) => this.P.list.includes(m) && m.state !== 'dead' && m.state !== 'flee' && m.state !== 'fly' && m.state !== 'lie');
    if (this.members.length < 2) { this.finish(); return; }
    this.t -= dt;
    if (this.t > 0) { this.look(); return; }
    if (!this.talk || this.i >= this.talk.lines.length) {
      if (this.talk && !this.loop) { this.finish(); return; }
      this.start();
      if (this.done) return;
      if (this.i === 0 && this.used.size > 1) { this.t = 2.5 + Math.random() * 4; this.mute(); return; } // a pause between topics
    }
    const [role, text] = this.talk.lines[this.i++];
    const sp = this.members[role % this.members.length];
    const to = this.members[(role + 1) % this.members.length];
    this.mute();
    this.speaker = sp;
    if (sp.char) sp.char.speaking = true;
    const line = fillLine(text, sp.persona, to.persona);
    if (near(sp)) this.P.say(sp, line);
    this.t = 1.4 + line.length * 0.055;
    this.look();
  }
  mute() { if (this.speaker && this.speaker.char) this.speaker.char.speaking = false; this.speaker = null; }
  // the others turn their heads to whoever speaks; the speaker looks at the next one (walkers glance only now and then)
  look() {
    const sp = this.speaker;
    for (const m of this.members) {
      if (!m.char) continue;
      const v = m._lkv || (m._lkv = new THREE.Vector3());
      const walking = m.state === 'walk' || m.state === 'follow';
      if (walking && (Math.floor(performance.now() / 1700 + (m.seedT || 0)) % 3)) { m.char.lookAt(null); continue; }
      if (sp && m !== sp) m.char.lookAt(v.set(sp.x, 1.25, sp.z));
      else if (m === sp) { const o = this.members[(this.members.indexOf(m) + 1) % this.members.length]; m.char.lookAt(v.set(o.x, 1.25, o.z)); }
      else m.char.lookAt(null);
    }
  }
  finish() {
    if (this.done) return;
    this.done = true; this.mute();
    for (const m of this.members) if (m.char) m.char.lookAt(null);
    if (this.onEnd) this.onEnd(this);
  }
}
