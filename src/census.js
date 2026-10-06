// El padrón de Guareña: the people who live in the town, made up house by house over the real front doors of the map.
// 6.665 vecinos — the INE's figure for 1 January 2025 — in some 2.800 households (2,4 people each), with the town's own
// age pyramid (2021 census: 13 % under 15, 60 % of working age, 27 % over 65). Everyone has a name and two surnames (and
// many a family nickname: «los Pajaritos»), an address (the street of their door and its number), a trade (the fields
// of the Vegas, the tomato plant, the cooperative, the shops, the bars, the school, the health centre, the town hall…),
// a family, friends, a routine for each day of the week and a memory of you (Memoria, below). The people you meet in the
// street are these neighbours (peds.js): the same face, the same name and the same memory every time — and how many of
// them are out, and where, comes from their routines: the bread at half past eight, the school at nine and at two, the
// mercadillo on Wednesdays, the bar, the cemetery, mass at eight, the evening walk round the plaza, the chairs out at
// the doors at night.
import { mulberry32, hash1, clamp } from './util.js';
import { pedDesc } from './characters.js';
import { Places } from './npcmind.js';

export const CENSO = { poblacion: 6665, fecha: '1 de enero de 2025', fuente: 'INE, padrón municipal' };

// ---------------------------------------------------------------- names
// first names by generation (born before 1960 / 1960–1990 / 1990–2007 / after 2007)
const NOMBRES = {
  m: [
    ['Antonio', 'José', 'Manuel', 'Francisco', 'Juan', 'Pedro', 'Ángel', 'Julián', 'Ramón', 'Fernando', 'Miguel', 'Luis', 'Jesús', 'Agustín', 'Eusebio', 'Tomás', 'Fermín', 'Joaquín', 'Andrés', 'Diego', 'Felipe', 'Rafael', 'Santiago', 'Valentín', 'Florencio', 'Pascual', 'Gregorio', 'Teodoro', 'Isidro', 'Emilio', 'Benito', 'Sebastián', 'Cándido', 'Marcelino'],
    ['José Luis', 'Juan Carlos', 'Francisco Javier', 'José Antonio', 'Manuel', 'Antonio', 'David', 'Javier', 'Miguel Ángel', 'Jesús', 'Pedro', 'Luis', 'Ángel', 'Rafael', 'Fernando', 'Carlos', 'Alberto', 'Sergio', 'Raúl', 'Óscar', 'Rubén', 'Juan Manuel', 'Alfonso', 'Ignacio', 'Enrique', 'Vicente', 'Roberto', 'Juan José', 'Agustín', 'Isidro'],
    ['Álvaro', 'Pablo', 'Alejandro', 'Adrián', 'Daniel', 'David', 'Sergio', 'Javier', 'Iván', 'Rubén', 'Marcos', 'Mario', 'Jorge', 'Diego', 'Víctor', 'Jesús', 'Manuel', 'Carlos', 'Samuel', 'Rodrigo', 'Gonzalo', 'Ismael', 'Alberto', 'Miguel'],
    ['Hugo', 'Lucas', 'Martín', 'Mateo', 'Leo', 'Daniel', 'Pablo', 'Alejandro', 'Manuel', 'Álvaro', 'Adrián', 'Mario', 'Marcos', 'Izan', 'Enzo', 'Gonzalo', 'Diego', 'Bruno'],
  ],
  f: [
    ['María', 'Carmen', 'Josefa', 'Isabel', 'Dolores', 'Ana', 'Francisca', 'Antonia', 'Pilar', 'Rosario', 'Remedios', 'Encarnación', 'Juana', 'Manuela', 'Teresa', 'Concepción', 'Petra', 'Ángeles', 'Mercedes', 'Catalina', 'Purificación', 'Felisa', 'Asunción', 'Magdalena', 'Leonor', 'Eulalia', 'Nieves', 'Consuelo', 'Agustina', 'Basilia', 'Guadalupe', 'Valentina'],
    ['María José', 'Ana', 'Isabel', 'Mari Carmen', 'Pilar', 'Rocío', 'Inmaculada', 'Susana', 'Belén', 'Marisa', 'Raquel', 'Cristina', 'Laura', 'Silvia', 'Beatriz', 'Mónica', 'Sonia', 'Nuria', 'Elena', 'Patricia', 'Lorena', 'Yolanda', 'Eva', 'Esther', 'Manoli', 'Toñi', 'Rosa', 'Teresa', 'Juani', 'Encarna', 'Puri', 'Guadalupe'],
    ['Lucía', 'Paula', 'Laura', 'María', 'Marta', 'Alba', 'Sara', 'Andrea', 'Claudia', 'Irene', 'Nerea', 'Carmen', 'Ana', 'Cristina', 'Elena', 'Sandra', 'Raquel', 'Noelia', 'Patricia', 'Alicia', 'Rocío', 'Sofía', 'Julia', 'Carla'],
    ['Lucía', 'Sofía', 'Martina', 'María', 'Paula', 'Julia', 'Valeria', 'Emma', 'Daniela', 'Carla', 'Alba', 'Noa', 'Olivia', 'Vega', 'Carmen', 'Lola', 'Candela'],
  ],
};
// what the neighbours call them (the old forms of the town for the older ones)
const CORTO = { 'Francisco': ['Paco', 'Curro'], 'José': ['Pepe'], 'Manuel': ['Manolo'], 'Antonio': ['Antonio', 'Toño'], 'Dolores': ['Lola'], 'Josefa': ['Pepi', 'Pepa'], 'Concepción': ['Concha', 'Conchi'], 'Encarnación': ['Encarna'], 'Purificación': ['Puri'], 'Francisca': ['Paqui', 'Paca'], 'Antonia': ['Toñi'], 'Juana': ['Juani'], 'Manuela': ['Manoli'], 'Inmaculada': ['Inma'], 'Mari Carmen': ['Mari Carmen', 'Maricarmen'], 'María José': ['Marijose', 'María José'], 'Francisco Javier': ['Javi', 'Fran'], 'Juan Carlos': ['Juan Carlos', 'Juanca'], 'José Antonio': ['José Antonio', 'Pepe'], 'Miguel Ángel': ['Miguel Ángel', 'Miguel'], 'Juan José': ['Juanjo'], 'Ángeles': ['Angelita', 'Ángeles'], 'Asunción': ['Asun'], 'Guadalupe': ['Lupe'], 'Rosario': ['Charo', 'Rosario'], 'Isidro': ['Isidro'], 'Agustín': ['Agustín'] };
const APELLIDOS = ['García', 'Sánchez', 'Rodríguez', 'Fernández', 'González', 'Martín', 'Pérez', 'Gómez', 'Díaz', 'López', 'Romero', 'Moreno', 'Muñoz', 'Jiménez', 'Hernández', 'Álvarez', 'Ruiz', 'Gallardo', 'Durán', 'Barroso', 'Carmona', 'Guerrero', 'Calderón', 'Gil', 'Vázquez', 'Rubio', 'Cortés', 'Rangel', 'Cerrato', 'Gordillo', 'Murillo', 'Nieto', 'Cabanillas', 'Tena', 'Ramos', 'Domínguez', 'Morales', 'Bravo', 'Silva', 'Mateos', 'Pajuelo', 'Galán', 'Becerra', 'Lozano', 'Trejo', 'Chaves', 'Píriz', 'Sayago', 'Gragera', 'Bote', 'Cuadrado', 'Cano', 'Sosa', 'Jara', 'Parejo', 'Vera', 'Caballero', 'Holguín', 'Rebollo', 'Corbacho'];
// family nicknames (every old family of a town has one)
const APODOS = ['los Pajaritos', 'los Tomateros', 'los Cabreros', 'los del Molino', 'los Chatos', 'los Rubios', 'los Canarios', 'los Sastres', 'los Herreros', 'los Carreteros', 'los Panaderos', 'los Zapateros', 'los de la Fuente', 'los Melones', 'los Pichones', 'los Morenos', 'los Chicos', 'los Barberos', 'los Galgos', 'los Santeros', 'los Pintores', 'los Mieleros', 'los Cesteros', 'los Caleros', 'los Arrieros', 'los Pastores', 'los Gitanillos', 'los Colorines', 'los Pepitos', 'los del Pilar', 'los Camineros', 'los Moraleños', 'los Rabiches', 'los Chirris', 'los Pucheros', 'los Polvorillas', 'los Tejeros'];

// ---------------------------------------------------------------- the pyramid and the households
// 5-year bands, per cent (Guareña, 2021 census, rounded): 0–4 … 85+
const PIRAMIDE = [4.1, 4.2, 4.9, 5.3, 5.2, 5.1, 5.3, 6.0, 7.0, 7.6, 7.5, 7.4, 7.0, 5.3, 5.6, 4.6, 3.4, 3.5];
// kinds of household (weights): who lives together in a town of the Vegas
const HOGARES = [
  ['mayorSolo', 16], ['mayoresPareja', 22], ['parejaSinHijos', 12], ['familia', 30], ['monoparental', 5], ['adultoSolo', 9], ['tresGeneraciones', 5], ['jovenes', 3],
];

// trades (who does what), and where (kinds of place: see Places); 'fuera' works out of town (the fields, the plants)
const OFICIOS = {
  agricultor: { label: ['agricultor', 'agricultora'], where: 'fuera', share: 0.16 },
  jornalero: { label: ['jornalero', 'jornalera'], where: 'fuera', share: 0.07 },
  fabrica: { label: ['trabajador de la tomatera', 'trabajadora de la tomatera'], where: 'fuera', share: 0.08 },
  cooperativa: { label: ['trabajador de la cooperativa', 'trabajadora de la cooperativa'], where: 'cooperativa', share: 0.03 },
  construccion: { label: ['albañil', 'albañila'], where: 'fuera', share: 0.07 },
  comercio: { label: ['dependiente', 'dependienta'], where: 'tienda', share: 0.12 },
  hosteleria: { label: ['camarero', 'camarera'], where: 'bar', share: 0.07 },
  docente: { label: ['maestro', 'maestra'], where: 'escuela', share: 0.04 },
  sanidad: { label: ['enfermero', 'enfermera'], where: 'medico', share: 0.04 },
  administracion: { label: ['funcionario del Ayuntamiento', 'funcionaria del Ayuntamiento'], where: 'ayto', share: 0.04 },
  banca: { label: ['empleado de banca', 'empleada de banca'], where: 'banco', share: 0.02 },
  transporte: { label: ['camionero', 'camionera'], where: 'fuera', share: 0.04 },
  taller: { label: ['mecánico', 'mecánica'], where: 'fuera', share: 0.03 },
  servicios: { label: ['peluquero', 'peluquera'], where: 'tienda', share: 0.04 },
  limpieza: { label: ['limpiador', 'limpiadora'], where: 'fuera', share: 0.03 },
  farmacia: { label: ['farmacéutico', 'farmacéutica'], where: 'farmacia', share: 0.01 },
  otros: { label: ['autónomo', 'autónoma'], where: 'fuera', share: 0.11 },
};
const OFICIO_LIST = Object.entries(OFICIOS);

// ---------------------------------------------------------------- the routines
// each outing: kind of place, start window [from, to] (hours), how long there (h), probability on its days, days
// (L M X J V S D), out: stays out in the street the whole time (a bench, the walk round the plaza, the chairs at the
// door); terraza: the share that sit out on the bar's terrace
const W = 'LMXJV', ALL = 'LMXJVSD';
const RUTINAS = {
  jubilado: [
    ['pan', 8.2, 9.6, 0.2, 0.35, ALL], ['bar', 9.8, 12.2, 1.5, 0.5, ALL, { terraza: 0.3 }], ['plaza', 10.3, 12.3, 1.2, 0.3, ALL, { out: true }],
    ['huerto', 8.8, 10.3, 2.5, 0.14, 'LMXJVS'], ['medico', 9, 12, 0.7, 0.05, W], ['banco', 9, 13, 0.3, 0.06, W], ['estanco', 10, 13, 0.2, 0.12, 'LMXJVS'],
    ['mercadillo', 10, 12.3, 1, 0.3, 'X', { out: true }], ['cementerio', 10, 12, 0.6, 0.03, ALL],
    ['paseo', 18.4, 20.2, 1.0, 0.42, ALL, { out: true }], ['iglesia', 19.6, 19.85, 1.05, 0.06, 'LMXJVS'], ['iglesia', 11.6, 11.85, 1.1, 0.25, 'D'],
    ['bar', 20.4, 22, 1.3, 0.22, ALL, { terraza: 0.55 }], ['fresco', 21.2, 22.3, 1.6, 0.2, ALL, { out: true }],
  ],
  jubilada: [
    ['pan', 8.4, 10, 0.25, 0.55, ALL], ['compra', 9.4, 12, 0.6, 0.45, 'LMXJVS'], ['abastos', 9.4, 11.6, 0.5, 0.15, 'LMXJVS'],
    ['mercadillo', 9.4, 12.4, 1.2, 0.55, 'X', { out: true }], ['cementerio', 9.8, 12, 0.7, 0.06, ALL], ['medico', 9, 12.4, 0.8, 0.06, W],
    ['farmacia', 10, 13, 0.2, 0.15, ALL], ['iglesia', 19.55, 19.85, 1.05, 0.2, 'LMXJVS'], ['iglesia', 11.55, 11.85, 1.1, 0.55, 'D'],
    ['visita', 17, 19, 1.5, 0.18, ALL], ['paseo', 18.2, 19.9, 1.0, 0.32, ALL, { out: true }], ['fresco', 21, 22.2, 1.8, 0.38, ALL, { out: true }],
  ],
  trabajador: [ // works out of town: the fields, the tomato plant, the building sites
    ['trabajo', 6.8, 7.6, 7, 0.95, W, { fuera: true }], ['trabajo', 7, 8, 5, 0.35, 'S', { fuera: true }],
    ['bar', 19.6, 21.4, 1.2, 0.32, W, { terraza: 0.5 }], ['paseo', 19.4, 20.6, 1.0, 0.2, W, { out: true }],
    ['compra', 10, 12.5, 0.6, 0.35, 'S'], ['bar', 12.4, 13.4, 1.5, 0.45, 'SD', { terraza: 0.6 }], ['paseo', 19, 20.6, 1.2, 0.4, 'SD', { out: true }],
    ['bar', 21.5, 23, 1.5, 0.25, 'VS', { terraza: 0.6 }], ['iglesia', 11.6, 11.85, 1.1, 0.08, 'D'],
  ],
  comercio: [ // in their shop or bar: two shifts on weekdays, the morning on Saturdays
    ['trabajo', 9.1, 9.45, 4.6, 0.97, 'LMXJVS'], ['trabajo', 17.1, 17.45, 3.2, 0.95, W],
    ['bar', 20.6, 22, 1.2, 0.25, ALL, { terraza: 0.5 }], ['paseo', 19.2, 20.6, 1.0, 0.35, 'D', { out: true }], ['iglesia', 11.6, 11.85, 1.1, 0.1, 'D'],
  ],
  hosteleria: [
    ['trabajo', 6.8, 7.3, 8, 0.5, 'LMXJVS'], ['trabajo', 15.5, 16.2, 8, 0.5, ALL], ['paseo', 18.5, 19.5, 1, 0.15, ALL, { out: true }],
  ],
  oficina: [ // the school, the health centre, the town hall, the bank: mornings
    ['trabajo', 7.6, 8.4, 6.6, 0.95, W], ['compra', 17.5, 19.5, 0.6, 0.25, W], ['paseo', 19, 20.8, 1.0, 0.32, ALL, { out: true }],
    ['bar', 20.5, 22, 1.2, 0.25, ALL, { terraza: 0.5 }], ['compra', 10, 12.5, 0.6, 0.4, 'S'], ['bar', 12.5, 13.5, 1.5, 0.4, 'SD', { terraza: 0.6 }],
    ['iglesia', 11.6, 11.85, 1.1, 0.12, 'D'],
  ],
  casa: [ // at home: the shopping, the children, the evening walk
    ['pan', 8.5, 10, 0.25, 0.45, ALL], ['compra', 9.5, 12, 0.7, 0.6, 'LMXJVS'], ['mercadillo', 9.5, 12.5, 1.2, 0.45, 'X', { out: true }],
    ['abastos', 9.5, 11.5, 0.5, 0.12, 'LMXJVS'], ['farmacia', 10, 13, 0.2, 0.1, ALL], ['medico', 9, 12, 0.6, 0.04, W],
    ['parque', 17.4, 18.8, 1.3, 0.3, ALL, { out: true }], ['paseo', 19.3, 20.8, 1.0, 0.35, ALL, { out: true }],
    ['iglesia', 19.6, 19.85, 1.05, 0.06, 'LMXJVS'], ['iglesia', 11.6, 11.85, 1.1, 0.25, 'D'], ['fresco', 21.4, 22.4, 1.4, 0.15, ALL, { out: true }],
  ],
  parado: [
    ['compra', 10, 12.3, 0.6, 0.4, 'LMXJVS'], ['bar', 11.5, 13.5, 1.3, 0.4, ALL, { terraza: 0.4 }], ['paseo', 19, 20.8, 1.1, 0.4, ALL, { out: true }],
    ['bar', 21, 23, 1.5, 0.35, ALL, { terraza: 0.6 }], ['mercadillo', 10, 12.5, 1, 0.3, 'X', { out: true }],
  ],
  estudiante: [ // the instituto (12–17)
    ['escuela', 8.1, 8.4, 6.2, 0.97, W], ['parque', 17.3, 18.6, 1.5, 0.35, ALL, { out: true }], ['plaza', 18.5, 20.4, 1.5, 0.45, ALL, { out: true }],
    ['plaza', 22, 23.2, 2, 0.35, 'VS', { out: true }], ['polideportivo', 17.5, 18.5, 1.5, 0.2, W],
  ],
  joven: [ // 18–24 still at home: studying out of town, working, looking for work
    ['trabajo', 7.4, 8.4, 6.5, 0.45, W, { fuera: true }], ['bar', 21, 23, 2, 0.45, ALL, { terraza: 0.7 }], ['plaza', 23, 24.5, 2.5, 0.4, 'VS', { out: true }],
    ['polideportivo', 18, 19.5, 1.5, 0.25, ALL], ['paseo', 19.5, 21, 1.0, 0.3, ALL, { out: true }],
  ],
  cura: [
    ['iglesia', 19.2, 19.4, 1.8, 1, 'LMXJVS'], ['iglesia', 11.2, 11.4, 2.4, 1, 'D'], ['paseo', 17.5, 18.5, 1, 0.5, ALL, { out: true }], ['visita', 10.5, 12, 1.2, 0.5, W],
  ],
};
const DAYS = 'LMXJVSD';

// ---------------------------------------------------------------- the census
export class Census {
  constructor(game) {
    this.game = game;
    const g = game, map = g.map;
    this.places = new Places(g);
    this.addPlaces();
    const rnd = mulberry32(20250101);
    this.rnd = rnd;
    this.residents = [];
    this.households = [];
    this.byDoor = new Map();
    this.buildHouseholds(rnd);
    this.assignTrades(rnd);
    this.buildTies(rnd);
    this.schoolRuns();
    this.memoria = new Memoria(g, this);
    this.spawned = new Set();      // residents walking about as people right now (peds.js)
    this.inside = new Map();       // residents who went in somewhere: until when (game time), not to be met again outside
    this._idx = null;
  }

  // the town's places for the routines (the Places of npcmind.js, and a few more)
  addPlaces() {
    const g = this.game, map = g.map, P = this.places;
    const add = (kind, x, z, name, extra = {}) => {
      const q = map.nearestEdge(x, z, 40, (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track');
      if (!q || q.d > 40) return null;
      const t = map.sample(q.edge, q.s, {});
      const side = (x - t.x) * -t.dz + (z - t.z) * t.dx >= 0 ? 1 : -1;
      const p = { kind, name, x, z, fx: x, fz: z, edge: q.edge, s: q.s, side, ...extra };
      (P.byKind[kind] || (P.byKind[kind] = [])).push(p);
      return p;
    };
    // an area's middle, or (big grounds, a school's playgrounds) the point of its outline nearest a street: the gate
    const centroid = (a) => {
      let x = 0, z = 0; const r = a.ring;
      for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; }
      const c = { x: x / (r.length / 2), z: z / (r.length / 2) };
      const ok = (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track';
      const q = map.nearestEdge(c.x, c.z, 40, ok);
      if (q && q.d <= 40) return c;
      let best = null, bd = Infinity;
      for (let i = 0; i < r.length; i += 2) { const t = map.nearestEdge(r[i], r[i + 1], 60, ok); if (t && t.d < bd) { bd = t.d; best = { x: r[i], z: r[i + 1] }; } }
      return best || c;
    };
    for (const a of map.areas) {
      const c = centroid(a);
      if (a.kind === 'landuse:cemetery') add('cementerio', c.x, c.z, a.name || 'el cementerio', { open: true });
      else if (a.kind === 'leisure:sports_centre') add('polideportivo', c.x, c.z, a.name || 'el polideportivo', { open: true });
      else if (a.kind === 'amenity:marketplace') add('abastos', c.x, c.z, a.name || 'el Mercado de Abastos');
      else if (a.kind === 'amenity:school' || a.kind === 'amenity:college') add('colegio', c.x, c.z, a.name || 'el colegio', { open: true, school: /Instituto/i.test(a.name) ? 'ies' : /Escuela Infantil/i.test(a.name) ? 'guarderia' : /Infantil/i.test(a.name) ? 'infantil' : 'primaria' });
      else if (a.kind === 'man_made:works' && /Cooperativa/i.test(a.name)) add('cooperativa', c.x, c.z, 'la cooperativa');
    }
    const m = g.mercadillo && g.mercadillo.center;
    if (m) add('mercadillo', m.x, m.z, 'el mercadillo', { open: true });
    // the main plaza is where the evening walk goes round
    const plazas = P.byKind.plaza || [];
    this.paseo = plazas.find((p) => p.main) || plazas[0] || null;
  }

  // ---------------------------------------------------------------- households over the real front doors
  buildHouseholds(rnd) {
    const g = this.game, map = g.map;
    const doors = (g.world.facadeDoors || []).filter((d) => map.inTown(d.x, d.z));
    // a random order of the doors (fixed): the first ones get the households
    const order = doors.map((d, i) => [hash1(i * 7919 + 13), d]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    const tot = HOGARES.reduce((a, h) => a + h[1], 0);
    const pickKind = () => { let r = rnd() * tot; for (const [k, w] of HOGARES) { r -= w; if (r <= 0) return k; } return 'familia'; };
    const bandAge = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    let di = 0;
    while (this.residents.length < CENSO.poblacion && di < order.length) {
      const door = order[di++];
      const kind = pickKind();
      const h = { id: this.households.length, door, kind, members: [], apodo: rnd() < 0.38 ? APODOS[Math.floor(rnd() * APODOS.length)] : null, s1: APELLIDOS[Math.floor(Math.pow(rnd(), 1.35) * APELLIDOS.length)] };
      const add = (f, age, role = null) => {
        if (this.residents.length >= CENSO.poblacion) return null;
        const id = this.residents.length;
        const r = { id, h: h.id, f, age, role, seed: (hash1(id * 104729 + 7) * 2147483647) | 0 };
        this.residents.push(r);
        h.members.push(id);
        return r;
      };
      const coupleAges = (lo, hi) => { const a = bandAge(lo, hi); return [a, clamp(a + Math.round((rnd() - 0.35) * 8), 18, 98)]; };
      switch (kind) {
        case 'mayorSolo': add(rnd() < 0.72, bandAge(66, 96)); break;
        case 'mayoresPareja': { const [a, b] = coupleAges(65, 90); add(false, a); add(true, b); break; }
        case 'parejaSinHijos': { const [a, b] = coupleAges(26, 64); add(false, a); add(true, b); break; }
        case 'familia': {
          const [a, b] = coupleAges(30, 56); add(false, a); add(true, b);
          const nk = rnd() < 0.42 ? 1 : rnd() < 0.8 ? 2 : 3;
          for (let k = 0; k < nk; k++) { const ka = clamp(b - 21 - Math.floor(rnd() * 20), 0, 28); add(rnd() < 0.5, ka); }
          break;
        }
        case 'monoparental': { const pa = bandAge(32, 58); add(rnd() < 0.82, pa); const nk = rnd() < 0.6 ? 1 : 2; for (let k = 0; k < nk; k++) add(rnd() < 0.5, clamp(pa - 22 - Math.floor(rnd() * 16), 0, 26)); break; }
        case 'adultoSolo': add(rnd() < 0.45, bandAge(25, 64)); break;
        case 'tresGeneraciones': { add(true, bandAge(74, 95)); const [a, b] = coupleAges(44, 60); add(false, a); add(true, b); if (rnd() < 0.7) add(rnd() < 0.5, clamp(b - 24 - Math.floor(rnd() * 12), 4, 26)); break; }
        case 'jovenes': add(rnd() < 0.5, bandAge(24, 38)); add(rnd() < 0.5, bandAge(24, 38)); break;
      }
      // the address: the street the door is on, and a number along it (odd on one side, even on the other)
      const q = map.nearestEdge(door.x, door.z, 30, (e) => e.walk && !!e.name);
      if (q) {
        const t = map.sample(q.edge, q.s, {});
        const side = (door.x - t.x) * -t.dz + (door.z - t.z) * t.dx >= 0 ? 0 : 1;
        h.street = q.edge.name; h.num = 1 + side + 2 * Math.floor(q.s / 8.5);
      }
      if (!h.members.length) continue;
      this.households.push(h);
      this.byDoor.set(door, h);
    }
    // names and surnames: the household's own (the children take the father's first surname and the mother's)
    for (const h of this.households) {
      const M = h.members.map((id) => this.residents[id]);
      const adults = M.filter((r) => r.age >= 26).sort((a, b) => b.age - a.age);
      const father = adults.find((r) => !r.f), mother = adults.find((r) => r.f);
      const sMother = APELLIDOS[Math.floor(rnd() * APELLIDOS.length)];
      for (const r of M) {
        const gen = r.age >= 65 ? 0 : r.age >= 35 ? 1 : r.age >= 18 ? 2 : 3;
        const L = NOMBRES[r.f ? 'f' : 'm'][gen];
        r.first = L[Math.floor(rnd() * L.length)];
        const isChild = r.age < 26 && (r !== father && r !== mother) && adults.length;
        if (isChild) { r.s1 = father ? father.s1 : h.s1; r.s2 = mother ? mother.s1 : sMother; }
        else { r.s1 = r === father || !mother || r.f === false ? h.s1 : APELLIDOS[Math.floor(rnd() * APELLIDOS.length)]; r.s2 = APELLIDOS[Math.floor(rnd() * APELLIDOS.length)]; }
        if (r.s2 === r.s1) r.s2 = APELLIDOS[(APELLIDOS.indexOf(r.s1) + 7) % APELLIDOS.length];
        const C = CORTO[r.first];
        r.called = C && (r.age >= 40 || rnd() < 0.3) ? C[Math.floor(rnd() * C.length)] : r.first.split(' ')[0] === 'María' && r.first.includes(' ') ? r.first : r.first;
      }
      if (father && mother && Math.abs(father.age - mother.age) < 14) { father.spouse = mother.id; mother.spouse = father.id; }
    }
    // the town as the INE counts it
    this.stats = { poblacion: this.residents.length, hogares: this.households.length, puertas: doors.length };
  }

  // ---------------------------------------------------------------- what everyone does
  assignTrades(rnd) {
    const P = this.places.byKind;
    // the shops, bars, schools… that people work in: a few each
    const jobsAt = { tienda: [...(P.tienda || []), ...(P.compra || []), ...(P.pan || []), ...(P.estanco || [])], bar: P.bar || [], escuela: P.colegio || P.escuela || [], medico: P.medico || [], ayto: P.ayto || [], banco: P.banco || [], farmacia: P.farmacia || [], cooperativa: P.cooperativa || [] };
    const tot = OFICIO_LIST.reduce((a, [, o]) => a + o.share, 0);
    let curaDone = false;
    for (const r of this.residents) {
      if (r.age < 3) { r.role = 'bebe'; continue; }
      if (r.age < 12) { r.role = 'nino'; continue; }
      if (r.age < 18) { r.role = 'estudiante'; continue; }
      if (r.age >= 66) { r.role = r.f ? 'jubilada' : 'jubilado'; r.was = this.pickTrade(rnd, tot); continue; }
      if (!curaDone && !r.f && r.age > 42 && r.age < 70 && this.households[r.h].members.length === 1) { r.role = 'cura'; curaDone = true; continue; }
      if (r.age < 24) { r.role = rnd() < 0.72 ? 'joven' : 'parado'; if (r.role === 'joven') r.studies = rnd() < 0.55; continue; }
      const employed = rnd() < (r.f ? 0.64 : 0.8) - (r.age > 58 ? 0.15 : 0);
      if (!employed) { r.role = r.f && r.age > 40 && rnd() < 0.6 ? 'casa' : 'parado'; continue; }
      const [k] = this.pickTrade(rnd, tot);
      r.trade = k;
      const where = OFICIOS[k].where;
      const L = jobsAt[where];
      if (L && L.length) { r.work = L[Math.floor(rnd() * L.length)]; r.role = where === 'tienda' || where === 'bar' ? (where === 'bar' ? 'hosteleria' : 'comercio') : 'oficina'; }
      else r.role = 'trabajador';
    }
  }
  pickTrade(rnd, tot) { let x = rnd() * tot; for (const e of OFICIO_LIST) { x -= e[1].share; if (x <= 0) return e; } return OFICIO_LIST[0]; }

  // friends and family across the town: the same age, the same neighbourhood; the grown-up children of the old couples
  buildTies(rnd) {
    const R = this.residents, H = this.households;
    // a coarse grid of homes to find neighbours
    const cell = 80, grid = new Map();
    for (const h of H) { const k = Math.floor(h.door.x / cell) + ':' + Math.floor(h.door.z / cell); (grid.get(k) || grid.set(k, []).get(k)).push(h); }
    const near = (h) => { const out = []; const cx = Math.floor(h.door.x / cell), cz = Math.floor(h.door.z / cell); for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const L = grid.get((cx + dx) + ':' + (cz + dz)); if (L) out.push(...L); } return out; };
    for (const r of R) {
      if (r.age < 12) continue;
      const hs = near(H[r.h]);
      const f = [];
      for (let k = 0; k < 18 && f.length < 5; k++) {
        const h2 = hs[Math.floor(rnd() * hs.length)];
        if (!h2 || h2.id === r.h) continue;
        const o = R[h2.members[Math.floor(rnd() * h2.members.length)]];
        if (!o || Math.abs(o.age - r.age) > (r.age > 60 ? 12 : 8) || o.age < 12) continue;
        if (!f.includes(o.id)) f.push(o.id);
      }
      r.friends = f;
    }
    // the old couples' children live in town too, in their own houses
    const olds = H.filter((h) => h.kind === 'mayoresPareja' || h.kind === 'mayorSolo');
    const fams = H.filter((h) => h.kind === 'familia' || h.kind === 'parejaSinHijos' || h.kind === 'monoparental');
    for (const h of olds) {
      if (rnd() > 0.7 || !fams.length) continue;
      const nk = 1 + Math.floor(rnd() * 2);
      const mom = h.members.map((id) => R[id]).sort((a, b) => b.age - a.age)[0];
      for (let k = 0; k < nk; k++) {
        const f = fams[Math.floor(rnd() * fams.length)];
        const kid = f.members.map((id) => R[id]).find((m) => m.age >= 28 && mom && mom.age - m.age >= 20 && mom.age - m.age <= 42);
        if (!kid) continue;
        (h.kids || (h.kids = [])).push(kid.id);
        kid.parentsH = h.id;
        if (mom && kid.s2 !== mom.s1 && rnd() < 0.5) kid.s1 = h.s1; // (the surname follows)
      }
    }
  }

  // who takes the little ones (3–11) to school and fetches them at two: whoever is at home, else a grandparent (in a
  // town of the Vegas the grandparents do a good share of it), else nobody (the older brothers take them)
  schoolRuns() {
    const R = this.residents, H = this.households;
    this.carer = new Map(); // resident id -> [children]
    const free = (r) => r.age >= 18 && ['casa', 'parado', 'jubilado', 'jubilada'].includes(r.role);
    for (const h of H) {
      const kids = h.members.map((id) => R[id]).filter((r) => r.age >= 3 && r.age <= 11);
      if (!kids.length) continue;
      const M = h.members.map((id) => R[id]);
      let c = M.filter(free).sort((a, b) => (a.role === 'casa' ? -1 : 0) - (b.role === 'casa' ? -1 : 0))[0] || null;
      if (!c || hash1(h.id * 3 + 1) < 0.3) {
        // the grandparents' house (the parents' parents)
        for (const m of M) {
          if (m.parentsH === undefined) continue;
          const gp = H[m.parentsH].members.map((id) => R[id]).filter((r) => r.age >= 58 && free(r));
          if (gp.length) { c = gp[Math.floor(hash1(h.id * 7) * gp.length)]; break; }
        }
      }
      if (!c) continue;
      const L = this.carer.get(c.id) || [];
      L.push(...kids);
      this.carer.set(c.id, L);
    }
  }

  // ---------------------------------------------------------------- about a person
  ageGroup(r) { return r.age >= 65 ? 'mayor' : r.age >= 30 ? 'adulto' : r.age >= 12 ? 'joven' : 'nino'; }
  household(r) { return this.households[r.h]; }
  // how the town names them: «Remedios», «la Remedios», «Remedios García», «la Remedios, la de los Pajaritos»
  nameOf(r, form = 'nombre') {
    const art = r.f ? 'la' : 'el', h = this.households[r.h];
    if (form === 'nombre') return r.called || r.first;
    if (form === 'pueblo') return r.age >= 40 ? `${art} ${r.called || r.first}` : r.called || r.first;
    if (form === 'completo') return `${r.first} ${r.s1} ${r.s2}`;
    if (form === 'apellido') return `${r.called || r.first} ${r.s1}`;
    if (form === 'mote') return h.apodo ? `${art} ${r.called || r.first}, ${r.f ? 'la' : 'el'} de ${h.apodo}` : `${art} ${r.called || r.first} ${r.s1}`;
    return r.first;
  }
  address(r) { const h = this.households[r.h]; return h.street ? `${h.street}, ${h.num}` : null; }
  tradeOf(r) {
    if (r.role === 'jubilado' || r.role === 'jubilada') return r.was ? OFICIOS[r.was[0]].label[r.f ? 1 : 0] : null;
    return r.trade ? OFICIOS[r.trade].label[r.f ? 1 : 0] : null;
  }
  // their look, the same every time (their seed)
  descOf(r) {
    if (r._desc) return r._desc;
    const rnd = mulberry32(r.seed >>> 0);
    if (r.age < 12) { // a child: a young one's shape, smaller (three sizes), the head bigger, a school bag
      const d = pedDesc(r.f ? 'f' : 'm', 'joven', rnd);
      const hb = r.age <= 5 ? 0.6 : r.age <= 8 ? 0.7 : 0.8;
      d.height = hb; d.headScale = hb === 0.6 ? 1.22 : hb === 0.7 ? 1.15 : 1.08; d.slim = 1; d.build = 0.9; d.muscle = 0;
      delete d.beardStyle; delete d.hat; delete d.glasses; delete d.watch; delete d.topMat;
      if (d.topStyle === 'jacket' || d.topStyle === 'vest' || d.topStyle === 'blouse' || d.topStyle === 'cardigan') d.topStyle = 'tshirt';
      d.bag = true; d.bagColor = ['#e6b422', '#3c7a3f', '#b8302a', '#2f5fa8', '#e87aa4', '#f08a24'][Math.floor(rnd() * 6)];
      d.shoeStyle = 'sneaker'; d.child = true; d.age = r.age; d.name = r.called || r.first;
      return (r._desc = d);
    }
    const ag = r.age >= 65 ? 'mayor' : r.age >= 34 ? 'adulto' : 'joven';
    const d = pedDesc(r.f ? 'f' : 'm', ag, rnd);
    if (r.age >= 65) {
      d.hairColor = ['#8a8580', '#d9d6d0', '#b8b4ae', '#6e6a66', '#e8e6e2'][Math.floor(rnd() * 5)];
      if (r.f && !this.residents[r.spouse] && rnd() < 0.35) { d.top = '#1d1f24'; d.bottom = '#1d1f24'; d.luto = true; } // a widow, in black
      if (!r.f && rnd() < 0.28) { d.hat = 'boina'; d.hatColor = '#2a2a2a'; }
      d.cane = !r.f && r.age > 80 && rnd() < 0.5;
    }
    if (r.role === 'cura') { d.top = '#1d1f24'; d.bottom = '#1d1f24'; d.topStyle = 'shirt'; d.topPattern = 'lisa'; d.bottomStyle = 'pants'; delete d.hat; }
    if (r.trade === 'agricultor' || r.trade === 'jornalero') { if (rnd() < 0.4) { d.hat = 'gorra'; d.hatColor = ['#1f4a3a', '#b8302a', '#1d1f24', '#c9b89a'][Math.floor(rnd() * 4)]; } }
    d.age = r.age; d.name = r.called || r.first;
    return (r._desc = d);
  }
  // what peds.js calls a persona (npcmind.js), for this neighbour
  persona(r) {
    const k = (n) => hash1(r.seed + n * 31);
    const ag = this.ageGroup(r);
    return {
      f: r.f, age: ag === 'nino' ? 'joven' : ag, name: r.called || r.first, r,
      chatty: ag === 'mayor' ? 0.55 + k(2) * 0.45 : 0.25 + k(2) * 0.6,
      hurry: ag === 'mayor' ? k(3) * 0.3 : 0.2 + k(3) * 0.6,
    };
  }
  // the character of a person, from their seed (0..1 each)
  traits(r) {
    if (r._tr) return r._tr;
    const k = (n) => hash1(r.seed + n * 977);
    return (r._tr = { charla: k(1), fe: k(2) * (r.age > 60 ? 1.4 : 0.8), cotilla: k(3), futbol: !r.f ? 0.4 + k(4) * 0.6 : k(4) * 0.6, genio: k(5), bar: k(6) });
  }
  // two people who know each other: family, friends, neighbours; how well (0 none, 1 by sight, 2 neighbours, 3 friends, 4 family)
  acquaintance(a, b) {
    if (!a || !b || a === b) return 0;
    if (a.h === b.h) return 4;
    const ha = this.households[a.h], hb = this.households[b.h];
    if ((ha.kids && ha.kids.includes(b.id)) || (hb.kids && hb.kids.includes(a.id)) || a.parentsH === b.h || b.parentsH === a.h) return 4;
    if ((a.friends && a.friends.includes(b.id)) || (b.friends && b.friends.includes(a.id))) return 3;
    if (Math.hypot(ha.door.x - hb.door.x, ha.door.z - hb.door.z) < 70) return 2;
    return hash1(a.id * 31 + b.id) < (a.age > 50 && b.age > 50 ? 0.85 : 0.5) ? 1 : 0; // (in a town of 6.000 most know each other by sight)
  }
  relatives(r) {
    const h = this.households[r.h], R = this.residents, out = [];
    for (const id of h.members) if (id !== r.id) out.push(R[id]);
    if (h.kids) for (const id of h.kids) out.push(R[id]);
    if (r.parentsH !== undefined) for (const id of this.households[r.parentsH].members) out.push(R[id]);
    return out;
  }

  // ---------------------------------------------------------------- the day of each one
  // the outings of a person on a given day: [{ kind, place, t0, t1, out, fuera, terraza }] (t0: arrives there, t1: leaves)
  day(r, day) {
    const key = day * 1e5 + r.id;
    if (r._dayK === key) return r._day;
    const wd = ((day + 5) % 7 + 7) % 7, L = DAYS[wd];
    const rnd = mulberry32(((r.seed ^ (day * 2654435761)) >>> 0) + 1);
    const T = RUTINAS[r.role] || null;
    const out = [];
    if (T) {
      // (the young ones studying away come back for the weekend)
      const away = r.role === 'joven' && r.studies && 'LMXJ'.includes(L);
      for (const [kind, a, b, dur, p, days, o] of T) {
        // (the evening walk and the chairs at the door: a share of the town on a warm evening, more on Sundays; the
        // bars at night, a little less on working days)
        const k = kind === 'paseo' ? (L === 'D' ? 0.85 : 0.62) : kind === 'fresco' ? 0.7 : kind === 'bar' && a > 19 ? ('VS'.includes(L) ? 1 : 0.7) : 1;
        if (away || !days.includes(L) || rnd() > p * k) continue;
        const t0 = a + rnd() * (b - a), d = dur * (0.75 + rnd() * 0.5);
        out.push({ kind, t0, t1: t0 + d, out: !!(o && o.out), fuera: !!(o && o.fuera), terraza: !!(o && o.terraza && rnd() < o.terraza) });
      }
      // the school: the instituto lets out at half past two; the little ones, taken at nine and fetched at two
      for (const o of out) if (o.kind === 'escuela') o.t1 = 14.45 + rnd() * 0.12;
      const kids = this.carer && this.carer.get(r.id);
      if (kids && 'LMXJV'.includes(L)) {
        const sch = this.schoolOf(kids[0]);
        if (sch) {
          for (let i = out.length - 1; i >= 0; i--) if ((out[i].t0 < 9.3 && out[i].t1 > 8.5) || (out[i].t0 < 14.4 && out[i].t1 > 13.5)) out.splice(i, 1);
          out.push({ kind: 'colegio', t0: 8.7 + rnd() * 0.14, t1: 8.96 + rnd() * 0.08, out: true, place: sch, kids });
          out.push({ kind: 'colegio', t0: 13.72 + rnd() * 0.16, t1: 14.06 + rnd() * 0.1, out: true, place: sch, kids });
        }
      }
      out.sort((x, y) => x.t0 - y.t0);
      // one thing after another: nobody is in two places at once
      for (let i = 1; i < out.length; i++) {
        const prev = out[i - 1], cur = out[i];
        if (cur.t0 < prev.t1 + 0.25) { const sh = prev.t1 + 0.25 - cur.t0; cur.t0 += sh; cur.t1 += sh; }
      }
      for (let i = out.length - 1; i >= 0; i--) if (out[i].t0 > 25.5) out.splice(i, 1);
    }
    // where: the nearest of its kind to home (people go to their own bakery), the work place, their own door
    const h = this.households[r.h];
    for (const o of out) {
      if (o.kind === 'trabajo') o.place = r.work || null;
      else if (o.kind === 'fresco') o.place = { kind: 'fresco', x: h.door.x, z: h.door.z, door: h.door };
      else if (o.kind === 'visita') { const rel = this.relatives(r).find((x) => x.h !== r.h); const hh = rel ? this.households[rel.h] : null; o.place = hh ? { kind: 'casa', x: hh.door.x, z: hh.door.z, door: hh.door, of: rel.id } : null; }
      else if (o.kind === 'escuela') o.place = this.schoolOf(r);
      else if (o.kind === 'colegio' && o.place) { /* (the children's school) */ }
      else if (o.kind === 'paseo') o.place = this.paseo;
      else if (o.kind === 'huerto') o.place = null;
      else o.place = this.favourite(r, o.kind);
      if (!o.place && o.kind !== 'huerto') o.fuera = o.fuera || o.kind === 'trabajo';
    }
    r._dayK = key; r._day = out;
    return out;
  }
  // the instituto from twelve; the nursery under three; else the family's school (the nearer of the two, mostly, the
  // same for every child of the house), its infant building for the three-to-five-year-olds if it has one
  schoolOf(r) {
    const L = this.places.byKind.colegio || [];
    const of = (k) => L.filter((p) => p.school === k);
    if (r.age >= 12) return of('ies')[0] || null;
    if (r.age < 3) return of('guarderia')[0] || of('infantil')[0] || null;
    const P = of('primaria');
    if (!P.length) return L[0] || null;
    const door = this.households[r.h].door;
    const ranked = P.map((p) => [Math.hypot(p.x - door.x, p.z - door.z), p]).sort((a, b) => a[0] - b[0]);
    const prim = ranked.length > 1 && hash1(r.h * 7.31 + 3) < 0.3 ? ranked[1][1] : ranked[0][1];
    if (r.age < 6) { const inf = of('infantil').find((p) => p.name && prim.name && p.name.startsWith(prim.name)); if (inf) return inf; }
    return prim;
  }
  // the place of a kind this person goes to: one of the two or three nearest their home, always the same one
  favourite(r, kind) {
    const L = this.places.byKind[kind];
    if (!L || !L.length) return null;
    const h = this.households[r.h], c = r._fav || (r._fav = {});
    if (c[kind] !== undefined) return L[c[kind]];
    const ranked = L.map((p, i) => [Math.hypot(p.x - h.door.x, p.z - h.door.z) * (p.big ? 0.5 : p.main ? 0.6 : 1), i]).sort((a, b) => a[0] - b[0]);
    const k = ranked[Math.min(ranked.length - 1, Math.floor(hash1(r.seed + kind.length * 17) * Math.min(3, ranked.length)))][1];
    c[kind] = k;
    return L[k];
  }
  // where a person is at the time h of a day: null (at home, inside somewhere, out of town), or out in the street —
  // going there, coming back, or out the whole time — with where they are about now
  whereNow(r, day, h) {
    const plan = this.day(r, day);
    const hh = this.households[r.h], home = hh.door;
    for (const o of plan) {
      if (!o.place && !o.fuera) continue;
      const tg = o.fuera ? null : o.place;
      // the walk there and back: a quarter of an hour, more if it is far
      const dist = tg ? Math.hypot(tg.x - home.x, tg.z - home.z) : 120;
      const walk = clamp(dist / 1400, 0.08, 0.3); // (game hours: 1 h of the game is a minute and a half)
      if (h >= o.t0 - walk && h < o.t0) return { phase: 'ida', k: (h - (o.t0 - walk)) / walk, o, from: home, to: tg };
      if (h >= o.t0 && h < o.t1) { if (o.out || o.terraza) return { phase: 'alli', k: (h - o.t0) / (o.t1 - o.t0), o, from: tg, to: tg }; return null; }
      if (h >= o.t1 && h < o.t1 + walk) return { phase: 'vuelta', k: (h - o.t1) / walk, o, from: tg, to: home };
    }
    return null;
  }
  // everyone out in the street now (refreshed every few game minutes): a grid of where they are
  index() {
    const g = this.game, day = g.sky.day || 0, h = g.sky.hour;
    const bin = Math.floor(h * 30); // (every 2 game minutes)
    if (this._idx && this._idx.day === day && this._idx.bin === bin) return this._idx;
    const cells = new Map(), C = 40, list = [];
    for (const r of this.residents) {
      if (r.role === 'bebe' || r.role === 'nino') continue;  // (the children go with a grown-up: not on their own)
      const w = this.whereNow(r, day, h);
      if (!w) continue;
      let x, z;
      if (w.phase === 'alli') { const p = w.to; x = p.x; z = p.z; }
      else { const a = w.from || w.to, b = w.to || w.from; if (!a || !b) continue; x = a.x + (b.x - a.x) * w.k; z = a.z + (b.z - a.z) * w.k; }
      const e = { r, w, x, z };
      list.push(e);
      const k = Math.floor(x / C) + ':' + Math.floor(z / C);
      (cells.get(k) || cells.set(k, []).get(k)).push(e);
    }
    this._idx = { day, bin, cells, list, C };
    return this._idx;
  }
  // the neighbours out in the street within rad of (x, z) not already walking about (or gone in somewhere)
  near(x, z, rad) {
    const I = this.index(), C = I.C, out = [], now = this.game.time;
    const cx0 = Math.floor((x - rad) / C), cx1 = Math.floor((x + rad) / C), cz0 = Math.floor((z - rad) / C), cz1 = Math.floor((z + rad) / C);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const L = I.cells.get(cx + ':' + cz);
      if (!L) continue;
      for (const e of L) {
        if (this.spawned.has(e.r.id)) continue;
        const til = this.inside.get(e.r.id);
        if (til && til > now) continue;
        const d = Math.hypot(e.x - x, e.z - z);
        if (d <= rad) out.push({ ...e, d });
      }
    }
    return out;
  }
  // how many are out within rad (for the number of people to show)
  countNear(x, z, rad) {
    const I = this.index(), C = I.C;
    let n = 0;
    const cx0 = Math.floor((x - rad) / C), cx1 = Math.floor((x + rad) / C), cz0 = Math.floor((z - rad) / C), cz1 = Math.floor((z + rad) / C);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const L = I.cells.get(cx + ':' + cz); if (L) for (const e of L) if (Math.hypot(e.x - x, e.z - z) <= rad) n++; }
    return n;
  }
  // somebody of the town to sit at a bench, a door, a group: near (x, z), of an age, not out already
  someoneFor(x, z, opts = {}) {
    const H = this.households, R = this.residents, rnd = opts.rnd || Math.random;
    let best = null, bs = -1;
    for (let k = 0; k < 40; k++) {
      const h = H[Math.floor(rnd() * H.length)];
      const d = Math.hypot(h.door.x - x, h.door.z - z);
      if (d > (opts.within || 300)) continue;
      for (const id of h.members) {
        const r = R[id];
        if (this.spawned.has(id) || r.role === 'bebe' || r.role === 'nino') continue;
        if (opts.old && r.age < 62) continue;
        if (opts.young && (r.age < 13 || r.age > 30)) continue;
        if (opts.adult && r.age < 18) continue;
        const sc = 1 / (1 + d / 60) + rnd() * 0.3;
        if (sc > bs) { bs = sc; best = r; }
      }
    }
    return best;
  }
  // the people of a house (the chairs out at its door)
  householdAt(door) { return this.byDoor.get(door) || null; }
  householdNear(x, z) {
    if (!this._hgrid) { this._hgrid = new Map(); for (const h of this.households) { const k = Math.round(h.door.x / 4) + ':' + Math.round(h.door.z / 4); (this._hgrid.get(k) || this._hgrid.set(k, []).get(k)).push(h); } }
    let best = null, bd = 2.5;
    const cx = Math.round(x / 4), cz = Math.round(z / 4);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const h of this._hgrid.get((cx + dx) + ':' + (cz + dz)) || []) { const d = Math.hypot(h.door.x - x, h.door.z - z); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  // who rides a bicycle (the old men to their huertos, the young ones) or a motorbike (the young ones)
  riderFor(kind, x, z) {
    const opts = kind === 'bici' ? (Math.random() < 0.45 ? { old: true } : { young: true }) : { young: true };
    return this.someoneFor(x, z, { ...opts, within: 600 });
  }
  // how much of the town is out at each hour of a day (to check the routines): [[h, people]]
  outdoorCurve(day = this.game.sky.day || 0) {
    const out = [];
    for (let h = 0; h < 24; h += 0.5) {
      let n = 0;
      for (const r of this.residents) { if (r.role === 'bebe' || r.role === 'nino') continue; if (this.whereNow(r, day, h)) n++; }
      out.push([h, n]);
    }
    return out;
  }
}

// ---------------------------------------------------------------- what the town remembers of you
// Every neighbour you have spoken to remembers it: how many times and when, where, whether you told them your name,
// how you treated them, what they told you (so they go on from there, not from the start), and anything they saw you
// do. The town remembers the big things too (a hold-up, a fight, a car stolen in front of everybody), and they spread
// by word of mouth. Kept in the save (the 400 most recent neighbours).
export class Memoria {
  constructor(game, census) {
    this.game = game; this.census = census;
    const s = game.save;
    if (!s.memoria || s.memoria.v !== 1) s.memoria = { v: 1, p: {}, sucesos: [] };
    this.m = s.memoria;
  }
  get now() { const s = this.game.sky; return (s.day || 0) * 24 + (s.hour || 0); }
  of(r) { return this.m.p[r.id] || null; }
  // a page for this neighbour (created on first contact)
  page(r) {
    let p = this.m.p[r.id];
    if (!p) {
      p = this.m.p[r.id] = { n: 0, t: this.now, rel: 0, name: 0, told: [], saw: [] };
      const ids = Object.keys(this.m.p);
      if (ids.length > 400) { ids.sort((a, b) => this.m.p[a].t - this.m.p[b].t); for (const id of ids.slice(0, ids.length - 400)) delete this.m.p[id]; }
    }
    return p;
  }
  met(r, where) { const p = this.page(r); p.prevT = p.t; p.n++; p.t = this.now; if (where) p.where = where; return p; }
  hoursSince(p) { return p && p.prevT !== undefined ? this.now - p.prevT : Infinity; }
  told(r, topic) { const p = this.page(r); if (!p.told.includes(topic)) { p.told.push(topic); if (p.told.length > 24) p.told.shift(); } }
  hasTold(r, topic) { const p = this.of(r); return !!(p && p.told.includes(topic)); }
  relate(r, k) { const p = this.page(r); p.rel = clamp((p.rel || 0) + k, -5, 5); }
  // the player did something: those who saw it remember it, and the town comes to know it
  event(kind, x, z, witnesses = []) {
    const g = this.game, now = this.now;
    const q = g.map.nearestEdge(x, z, 40, (e) => !!e.name);
    const ev = { k: kind, t: now, x: Math.round(x), z: Math.round(z), st: q ? q.edge.name : '' };
    this.m.sucesos.push(ev);
    if (this.m.sucesos.length > 30) this.m.sucesos.shift();
    for (const ped of witnesses) {
      const r = ped && ped.persona && ped.persona.r;
      if (!r) continue;
      const p = this.page(r);
      p.saw.push({ k: kind, t: now });
      if (p.saw.length > 6) p.saw.shift();
      p.rel = clamp((p.rel || 0) - (kind === 'homicidio' ? 5 : kind === 'atraco' || kind === 'agresion' ? 3 : 2), -5, 5);
    }
  }
  // what this neighbour has heard about you (the bad things go round the town in a day or two)
  heard(r) {
    const now = this.now, out = [];
    for (const ev of this.m.sucesos) {
      const age = now - ev.t;
      if (age > 24 * 6) continue;
      const reach = clamp(age / 30, 0.15, 1) * (this.census.traits(r).cotilla * 0.6 + 0.4);
      if (hash1(r.id * 13 + Math.floor(ev.t)) < reach) out.push(ev);
    }
    return out;
  }
}
