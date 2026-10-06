// Side activities and interactions with people: talk to, wind up, threaten and rob pedestrians, hold up
// shops and the bank, have something at the bars, buy at the gun shop, and the taxi and police-patrol shifts.
// One contextual prompt at a time ("E · Hablar"); on touch screens the prompt itself is the button.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { randomDesc } from './characters.js';
import { fmtMoney, clamp } from './util.js';
import { PERK } from './perks.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => Math.round(a + Math.random() * (b - a));
// Spanish contractions: de + el = del, a + el = al
const de = (n) => (n.startsWith('el ') ? 'del ' + n.slice(3) : 'de ' + n);
const al = (n) => (n.startsWith('el ') ? 'al ' + n.slice(3) : 'a ' + n);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const DRINKS = [
  'una caña bien fría', 'un café con leche', 'un vasino de pitarra', 'un tinto de verano', 'una tapa de migas extremeñas',
  'unos churros con chocolate', 'una tostá de jamón', 'un botellín con aceitunas', 'una ración de torta del Casar', 'un mosto con hielo',
];
const DRINK_PRICE = 3;

// places that can be held up (generic names: the real shops are only used for their location)
// invented names for the bars (no real business of the town appears by its name in the game)
const BAR_NAMES = ['el bar El Brocal', 'el bar Los Arcos', 'el bar El Pozo', 'la cafetería La Vega', 'el bar El Chaparro', 'la taberna La Encina', 'el bar La Esquina', 'el Café Central', 'el bar El Paseo', 'el mesón El Tractor', 'el bar El Cruce', 'la cafetería La Torre', 'el bar El Lagar', 'el bar La Fuente', 'el bar El Olivo', 'la cervecería La Espiga', 'el bar El Molino', 'el bar Las Eras'];
const HOLDUP = {
  'shop:supermarket': { name: 'el supermercado', loot: [120, 320], time: 6, crime: 'atraco_tienda' },
  'shop:tobacco': { name: 'el estanco', loot: [60, 180], time: 4.5, crime: 'atraco_tienda' },
  'shop:variety_store': { name: 'el bazar', loot: [50, 150], time: 4.5, crime: 'atraco_tienda' },
  'shop:lottery': { name: 'la administración de lotería', loot: [150, 380], time: 6, crime: 'atraco_tienda' },
  'shop:kiosk': { name: 'el quiosco', loot: [30, 90], time: 3.5, crime: 'atraco_tienda' },
  'shop:jewelry': { name: 'la joyería', loot: [400, 900], time: 8, crime: 'atraco_joyeria', alarm: true },
  'amenity:bank': { name: 'el banco', loot: [900, 2200], time: 11, crime: 'atraco_banco', alarm: true },
  'amenity:fuel': { name: 'la gasolinera', loot: [100, 260], time: 5, crime: 'atraco_tienda' },
  // every other shop of the town (and what a quick hand takes from its counter)
  'amenity:pharmacy': { name: 'la farmacia', loot: [150, 350], time: 5, crime: 'atraco_tienda', item: ['Una crema carísima', 18, 40] },
  'shop:bakery': { name: 'la panadería', loot: [40, 120], time: 3.5, crime: 'atraco_tienda', item: ['Una bolsa de perrunillas', 4, 9] },
  'shop:confectionery': { name: 'la confitería', loot: [40, 110], time: 3.5, crime: 'atraco_tienda', item: ['Una caja de bombones', 8, 18] },
  'shop:clothes': { name: 'la tienda de ropa', loot: [80, 220], time: 4.5, crime: 'atraco_tienda', item: ['Una camiseta de marca', 12, 30] },
  'shop:shoes': { name: 'la zapatería', loot: [70, 200], time: 4.5, crime: 'atraco_tienda', item: ['Unas zapatillas', 25, 55] },
  'shop:perfumery': { name: 'la perfumería', loot: [90, 240], time: 4.5, crime: 'atraco_tienda', item: ['Un perfume', 20, 50] },
  'shop:optician': { name: 'la óptica', loot: [120, 300], time: 5, crime: 'atraco_tienda', item: ['Unas gafas de sol', 25, 70] },
  'shop:books': { name: 'la librería', loot: [40, 130], time: 4, crime: 'atraco_tienda', item: ['Un libro', 8, 20] },
  'shop:computer': { name: 'la tienda de informática', loot: [120, 320], time: 5, crime: 'atraco_tienda', item: ['Unos auriculares', 20, 60] },
  'shop:toys': { name: 'la juguetería', loot: [50, 140], time: 4, crime: 'atraco_tienda', item: ['Un juguete', 8, 25] },
  'shop:florist': { name: 'la floristería', loot: [40, 120], time: 3.5, crime: 'atraco_tienda', item: ['Un ramo de flores', 6, 15] },
  'shop:greengrocer': { name: 'la frutería', loot: [40, 110], time: 3.5, crime: 'atraco_tienda', item: ['Un melón', 2, 5] },
  'shop:hardware': { name: 'la ferretería', loot: [70, 190], time: 4.5, crime: 'atraco_tienda', item: ['Una caja de herramientas', 15, 35] },
  'shop:appliance': { name: 'la tienda de electrodomésticos', loot: [100, 280], time: 5, crime: 'atraco_tienda', item: ['Un secador', 15, 35] },
  'shop:car_parts': { name: 'la tienda de recambios', loot: [80, 220], time: 4.5, crime: 'atraco_tienda', item: ['Un juego de bujías', 10, 25] },
  'shop:furniture': { name: 'la tienda de muebles', loot: [90, 250], time: 5, crime: 'atraco_tienda', item: ['Una lámpara', 15, 40] },
  'shop:beauty': { name: 'el centro de estética', loot: [60, 170], time: 4, crime: 'atraco_tienda', item: ['Un pintalabios', 8, 20] },
  'shop:hairdresser': { name: 'la peluquería', loot: [50, 150], time: 4, crime: 'atraco_tienda', item: ['Un bote de champú', 5, 12] },
  'amenity:fast_food': { name: 'el kebab', loot: [60, 160], time: 4, crime: 'atraco_tienda' },
  'amenity:bar': { name: 'la caja del bar', loot: [80, 200], time: 4.5, crime: 'atraco_tienda' },
  'amenity:cafe': { name: 'la caja de la cafetería', loot: [70, 180], time: 4.5, crime: 'atraco_tienda' },
  'amenity:pub': { name: 'la caja del pub', loot: [90, 230], time: 4.5, crime: 'atraco_tienda' },
  'amenity:post_office': { name: 'Correos', loot: [200, 500], time: 7, crime: 'atraco_tienda', alarm: true },
  'tourism:hotel': { name: 'la recepción del hotel', loot: [150, 380], time: 6, crime: 'atraco_tienda' },
  'amenity:casino': { name: 'el salón de juegos', loot: [300, 700], time: 7, crime: 'atraco_tienda', alarm: true },
};
const SHOP_ITEM = { 'shop:supermarket': ['Una botella de whisky', 10, 22], 'shop:tobacco': ['Un cartón de tabaco', 20, 45], 'shop:variety_store': ['Un cargador de móvil', 4, 10], 'shop:kiosk': ['Unas revistas', 3, 8], 'shop:jewelry': ['Un anillo', 60, 160], 'shop:lottery': ['Unos rascas', 5, 15], 'amenity:fuel': ['Un bocadillo envasado', 2, 5] };
const HOLDUP_LINES = ['¡Esto es un atraco! ¡La caja, rápido!', '¡Quieto todo el mundo! ¡El dinero!', '¡Vacía la caja y aquí no pasa nada!', '¡Arriba las manos! ¡Los billetes a la bolsa!'];

const PAX = {
  hail: ['¡Taxi! ¡Aquí!', '¡Eh, taxista!', '¡Para, para!', '¡Por aquí, por aquí!'],
  in: ['Buenas. Lléveme {a}, que llego tarde.', '{A}, por favor. Y sin correr, ¿eh?', 'Vamos {a}. ¡Aligera, que me esperan!', 'Voy {a}. ¿Usted es de aquí?', 'Lléveme {a}, que tengo una cita.'],
  fast: ['¡Olé, qué rápido!', '¡Así da gusto!', 'Tome, quédese con el cambio.', '¡Menudo piloto está usted hecho!'],
  slow: ['Llegamos… por fin.', 'Mi abuela conduce más ligera.', 'Tardón, tardón…'],
  crash: ['¡Cuidao, que me mata!', '¡Ay, mi cuello!', '¿Pero quién le ha dado el carné?', '¡Que esto no son los autos de choque!'],
  late: ['¡Pare! Me bajo aquí, ¡menudo taxista!', 'Ya no llego. ¡Me bajo!'],
  police: ['¡Con la Guardia Civil detrás yo no voy!', '¡Déjeme bajar, que yo no he hecho ná!'],
};

// floating icon above interaction spots (canvas paths, so it looks the same on every device)
function iconSprite(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2);
  x.fillStyle = kind === 'gun' ? '#e0533a' : '#e3a23a'; x.fill();
  x.lineWidth = 8; x.strokeStyle = '#1a1a1a'; x.stroke();
  x.fillStyle = '#1a1a1a'; x.strokeStyle = '#1a1a1a';
  if (kind === 'bar') {
    x.fillRect(40, 52, 36, 40); // mug
    x.lineWidth = 8; x.beginPath(); x.arc(78, 71, 11, -Math.PI / 2, Math.PI / 2); x.stroke();
    x.fillStyle = '#fbfaf6';
    for (const [cx, cy, r] of [[45, 50, 9], [58, 45, 10], [71, 50, 9]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
  } else {
    x.fillRect(26, 44, 74, 18); // slide
    x.beginPath(); x.moveTo(72, 60); x.lineTo(98, 60); x.lineTo(90, 96); x.lineTo(66, 96); x.closePath(); x.fill(); // grip
    x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 9, 0, Math.PI); x.stroke(); // trigger guard
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(0.75, 0.75, 1);
  return s;
}

export class Activities {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.t = 0;
    this.bars = [];
    this.shops = [];
    this.gunShop = null;
    this.holdup = null;
    this.taxi = null;
    this.patrol = null;
    this.lastTalk = null; this.lastTalkT = -9;
    this.subT = 0;
    this.tapped = false;
    const pr = game.ui.prompt;
    if (pr) pr.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.tapped = true; });
    this.bindShop();
  }

  // ------------------------------------------------------------ places
  // a point on the pavement in front of a place (the map POIs sit inside the buildings)
  doorOf(pt) {
    const map = this.game.map;
    const q = map.nearestEdge(pt.x, pt.z, 60, (e) => (e.walk || e.drive) && !e.blocked);
    if (!q) return null;
    const d = map.sample(q.edge, q.s, {});
    const dx = pt.x - d.x, dz = pt.z - d.z, l = Math.hypot(dx, dz) || 1;
    let bx = d.x, bz = d.z, hit = false;
    for (let t = 0; t <= l; t += 0.5) {
      const x = d.x + (dx / l) * t, z = d.z + (dz / l) * t;
      if (map.buildingAt(x, z)) { hit = true; break; }
      bx = x; bz = z;
    }
    if (hit) { bx -= (dx / l) * 0.7; bz -= (dz / l) * 0.7; }
    return { x: bx, z: bz, fx: pt.x, fz: pt.z };
  }

  setup(P) {
    const g = this.game, map = g.map;
    this.P = P;
    // bars and cafés
    const seen = [];
    for (const b of P.bars || []) {
      const door = this.doorOf(b);
      if (!door || seen.some((s) => Math.hypot(s.x - door.x, s.z - door.z) < 8)) continue;
      seen.push(door);
      const name = BAR_NAMES[this.bars.length % BAR_NAMES.length];
      this.bars.push({ ...door, name, cd: 0, icon: this.marker('bar', door) });
    }
    // shops that can be held up
    for (const p of map.pois) {
      const def = HOLDUP[p.kind];
      if (!def || !map.inTown(p.x, p.z)) continue;
      const door = this.doorOf(p);
      if (!door) continue;
      this.shops.push({ ...door, def, cd: 0, liftCd: 0, kind: p.kind });
    }
    // the hunting & shooting shop (fictional) next to the Cooperativa, where the countryside begins
    const base = P.coop || P.poligono || P.plaza;
    const q = base && map.nearestEdge(base.x + 20, base.z, 150, (e) => e.drive && !e.blocked && !e.dirt);
    if (q) {
      const d = map.sample(q.edge, q.s, {});
      let spot = null;
      for (const side of [1, -1]) {
        const off = q.edge.w / 2 + 1.2;
        const x = d.x - d.dz * off * side, z = d.z + d.dx * off * side;
        if (!map.buildingAt(x, z)) { spot = { x, z }; break; }
      }
      spot = spot || { x: d.x, z: d.z };
      this.gunShop = { ...spot, name: 'Armería y Caza Las Vegas', icon: this.marker('gun', spot) };
      g.hud.setBlip('armeria', { x: spot.x, z: spot.z, label: 'A', color: '#e0533a', name: 'Armería', edge: false });
    }
    // the pawn shop (compraventa): sells whatever you carry in the backpack, at a fence's price
    {
      const tp = map.pois.find((p) => p.kind === 'shop:trade' && map.inTown(p.x, p.z)) || map.pois.filter((p) => p.kind === 'shop:variety_store' && map.inTown(p.x, p.z))[1];
      const door = tp && this.doorOf(tp);
      if (door) {
        this.pawn = { ...door, name: 'la compraventa' };
        g.hud.setBlip('compraventa', { x: door.x, z: door.z, label: '€', color: '#8fe39b', name: 'Compraventa', edge: false, small: true });
      }
    }
    // a patrol car at the town hall, a Guardia Civil 4x4 at the barracks and taxis at the rank
    const park = (pt, model, dx = 0, dz = 0) => {
      if (!pt) return;
      const s = g.fleet.freeSpotNear(pt.x + dx, pt.z + dz, model);
      if (!s) return;
      g.fleet.spots.push({ x: s.x, z: s.z, heading: s.heading, model, color: '#f4f4f0', vehicle: null, taken: false });
    };
    park(P.ayto, 'policia', 0, 14);
    park(P.guardia, 'guardia', 10, 0);
    const rank = map.pois.find((p) => p.kind === 'amenity:taxi');
    park(rank || P.plaza, 'taxi');
    park(P.plaza, 'taxi', 30, -20);
    // the bars are small blips on the radar
    this.bars.forEach((b, i) => g.hud.setBlip('bar' + i, { x: b.x, z: b.z, label: 'B', color: '#c08552', name: b.name.replace(/^(el|la) (bar |cafetería |taberna |mesón |cervecería )?/, ''), edge: false, small: true }));
    // where to take taxi fares
    const named = [
      ['la Plaza de España', P.plaza], ['el Ayuntamiento', P.ayto], ['el Mercado de Abastos', P.mercado], ['la Cooperativa', P.coop],
      ['el Estadio La Noria', P.estadio], ['la Ermita de San Isidro', P.ermita], ['el cuartel de la Guardia Civil', P.guardia],
      ['el Centro de Salud', P.salud], ['el Pantano de San Roque', P.pantano], ['el Polígono Industrial', P.poligono],
      ['el Parque San Ginés', P.sanGines], ['el Parque del Pilar', P.pilar], ['el Pabellón La Encina', P.pabellon],
      ['el instituto Eugenio Frutos', P.instituto], ['la casa de Luis Chamizo', P.chamizo], ['San Gregorio', P.sanGregorio],
    ];
    this.dests = [];
    for (const [name, pt] of named) { const r = pt && P.onRoad(pt); if (r) this.dests.push({ name, x: r.x, z: r.z }); }
    for (const b of this.bars.slice(0, 10)) { const r = P.onRoad(b); if (r) this.dests.push({ name: b.name, x: r.x, z: r.z }); }
  }

  marker(kind, at) {
    const grp = new THREE.Group();
    const s = iconSprite(kind);
    s.position.y = 2.5;
    grp.add(s);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: kind === 'gun' ? 0xe0533a : 0xe3a23a, transparent: true, opacity: 0.65, depthWrite: false }));
    ring.position.y = 0.04;
    grp.add(ring);
    grp.position.set(at.x, 0, at.z);
    grp.visible = false;
    grp.userData.sprite = s;
    this.root.add(grp);
    return grp;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    const px = p.pos.x, pz = p.pos.z;
    // icons: only nearby ones, bobbing
    const bob = Math.sin(this.t * 2.2) * 0.1;
    for (const b of this.bars) {
      b.cd -= dt;
      const on = Math.abs(b.x - px) < 45 && Math.abs(b.z - pz) < 45;
      b.icon.visible = on;
      if (on) b.icon.userData.sprite.position.y = 2.5 + bob;
    }
    for (const s of this.shops) { s.cd -= dt; s.liftCd -= dt; }
    if (this.gunShop) {
      const gs = this.gunShop, on = Math.abs(gs.x - px) < 60 && Math.abs(gs.z - pz) < 60;
      gs.icon.visible = on;
      if (on) gs.icon.userData.sprite.position.y = 2.5 + bob;
    }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0 && !g.missions.active) g.hud.subtitle(null); }
    if (this.holdup) this.updateHoldup(dt);
    if (this.taxi) this.updateTaxi(dt);
    if (this.patrol) this.updatePatrol(dt);
    this.updatePassenger(dt);
    // one contextual action at a time
    let opt = null;
    if (g.state === 'play' && !g.cam.cinematic) {
      if (this.holdup) opt = { label: `Vaciando la caja… <b>${Math.round((this.holdup.t / this.holdup.dur) * 100)} %</b>`, info: true };
      else if (p.vehicle) opt = this.vehicleOption(p.vehicle);
      else if (p.mode === 'passenger') opt = { label: `${g.input.device === 'touch' ? 'Toca «Bajar»:' : g.input.key('F', 3)} bajarte del coche`, info: true };
      else if (p.mode === 'hidden') opt = { label: 'Salir del contenedor', run: () => p.leaveContainer() };
      else if (p.mode === 'sit') opt = g.seats && g.seats.menuOpen ? null : { label: 'Levantarse', run: () => g.seats.standUp() };
      else if (p.mode === 'swim') { const ex = p.swimExit(); opt = ex ? { label: ex.label, run: () => p.leaveSwim(ex.x, ex.z) } : null; }
      else if (p.mode === 'foot') {
        // multiplayer: a friend's car right here
        const rc = g.net && g.net.active && g.net.rideCandidate(p.pos.x, p.pos.z);
        opt = rc ? { label: `${g.input.device === 'touch' ? 'Toca «Subir»:' : g.input.key('F', 3)} subir de copiloto con ${rc.name.replace(/[<>&]/g, '')}`, info: true } : this.footOption();
      }
    }
    const touch = g.input.isTouch;
    g.hud.prompt(opt ? (opt.info ? opt.label : `${g.input.device === 'touch' ? '' : g.input.key('E', 15)}${opt.label}`) : '', !!opt && !opt.info && touch);
    const act = g.input.interact || this.tapped;
    this.tapped = false;
    if (opt && !opt.info && act) opt.run();
  }

  armed() { const W = this.game.weapons; return !!(W && W.def.clip); }
  armedAt() { return false; }

  // a dip in the pool: down the ladder, a few lengths, out again dripping (and feeling better)
  async dip(lad) {
    const g = this.game, p = g.player;
    if (this.dipping) return;
    this.dipping = true;
    g.audio.sfx('splash', { x: lad.x, z: lad.z, vol: 0.7 });
    const hold = g.input.enabled; g.input.enabled = false;
    try {
      if (g.interiors && g.interiors.fade) await g.interiors.fade(true);
      const n = Math.min(100, p.health + (lad.kids ? 5 : 20)) - p.health; p.health += n;
      p.wetT = 40; // (dripping for a while)
      if (g.interiors && g.interiors.fade) setTimeout(() => g.interiors.fade(false), 900);
      g.hud.notify(lad.kids ? 'Te mojas los pies con los críos. Qué gusto con este calor.' : `¡Al agua! Te haces unos largos y sales chorreando.${n > 0 ? ` +${Math.round(n)} de salud` : ''}`, 'ok', 4);
      setTimeout(() => g.audio.sfx('splash', { x: lad.x, z: lad.z, vol: 0.35 }), 500);
    } finally { g.input.enabled = hold; setTimeout(() => { this.dipping = false; }, 1500); }
  }
  footOption() {
    const g = this.game, p = g.player;
    if (g.fishing && g.fishing.active) return null; // the rod has the keys
    if (g.interior) return g.interiors.option();
    // a public building's door comes first (the town hall's job is offered at its door too)
    const vd = g.mode === 'normal' && g.interiors && g.interiors.doorNear(p.pos.x, p.pos.z, 1.7);
    if (vd && vd.venue) return { label: `Entrar: ${vd.name}`, run: () => g.interiors.enter(vd, { mode: 'visit' }) };
    // the municipal pool: in off the ladder
    const lad = ((g.world.landmarks && g.world.landmarks.poi.poolLadders) || []).find((q) => Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 1.4);
    if (lad && p.mode === 'foot') return { label: lad.kids ? 'Mojarte los pies en la piscina pequeña' : 'Bajar a la piscina por la escalera', run: () => (lad.kids || !lad.pool ? this.dip(lad) : p.startSwim(lad.pool, lad.wx, lad.wz)) };
    // on the edge of the big pool: in head first
    const pl = p.mode === 'foot' && ((g.world.landmarks && g.world.landmarks.poi.pools) || []).find((q) => {
      if (q.kids) return false;
      const dx = p.pos.x - q.cx, dz = p.pos.z - q.cz, lx = Math.abs(dx * q.ux + dz * q.uz), lz = Math.abs(-dx * q.uz + dz * q.ux);
      return lx < q.hl + q.cw + 1.0 && lz < q.hd + q.cw + 1.0 && (lx > q.hl - 0.2 || lz > q.hd - 0.2);
    });
    if (pl) return { label: 'Tirarte al agua', run: () => {
      const dx = p.pos.x - pl.cx, dz = p.pos.z - pl.cz;
      let lx = dx * pl.ux + dz * pl.uz, lz = -dx * pl.uz + dz * pl.ux;
      lx = clamp(lx, -pl.hl + 1.2, pl.hl - 1.2); lz = clamp(lz, -pl.hd + 1.2, pl.hd - 1.2);
      p.startSwim(pl, pl.cx + lx * pl.ux - lz * pl.uz, pl.cz + lx * pl.uz + lz * pl.ux, true);
    } };
    const J = g.jobs;
    if (J && g.mode === 'normal') {
      const jo = J.option();
      if (jo) return jo;
    }
    if (g.charla && g.charla.open) return null; // (talking with someone: the conversation has the keys)
    if (g.interiors && g.interiors.picking) return { label: `Forzando la cerradura… <b>${g.interiors.pickPct} %</b>`, info: true };
    const hd = g.mode === 'normal' && g.interiors && g.interiors.doorNear(p.pos.x, p.pos.z, 1.8);
    if (hd && !this.armedAt(p)) {
      if (hd.church && hd.shut) return { label: 'Puerta del Evangelio <small>(cerrada: se entra por la de los pies o por la del Mediodía)</small>', info: true };
      if (hd.church) return { label: hd.church === 'sur' ? 'Entrar en Santa María <small>(puerta del Mediodía)</small>' : 'Entrar en la iglesia de Santa María', run: () => g.interiors.enter(hd, { mode: 'visit', spot: hd.church === 'sur' ? 'sur' : 'entrada' }) };
      if (hd.owner) { const nm = g.interiors.doorLabel(hd); return { label: nm === 'Tu casa' ? 'Entrar en tu casa' : `Entrar: ${nm}`, run: () => g.interiors.enter(hd, { mode: 'owner' }) }; }
      if (p.crouch) return { label: `Colarse en ${hd.name} <small>(forzar la cerradura)</small>`, run: () => g.interiors.sneakIn(hd) };
      return { label: `Llamar a la puerta: ${hd.name} <small>· ${g.gx('agachado', 'agachada')}, colarte</small>`, run: () => g.interiors.knock(hd) };
    }
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    // people in front of us
    let ped = null, bs = -Infinity;
    for (const x of g.peds.list) {
      if (x.state === 'dead' || x.state === 'fly' || x.state === 'lie' || x.state === 'fight' || x.inCar) continue;
      const dx = x.x - p.pos.x, dz = x.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 2.6) continue;
      const sc = (dx * fx + dz * fz) / (d || 1) - d * 0.4;
      if (sc > bs) { bs = sc; ped = x; }
    }
    if (ped) {
      if (g.peds.canTakedown(ped)) return { label: 'Noquear por la espalda <small>(en silencio)</small>', run: () => g.peds.takedown(ped) };
      if (ped.state === 'handsup') {
        if (ped.cash > 0 || !ped.robbed) return { label: 'Atracar', run: () => { ped.robbed = true; g.peds.rob(ped); } };
      } else if (this.armed()) {
        return { label: 'Amenazar', run: () => { g.peds.surrender(ped); if (ped.state === 'handsup') g.police.crime('agresion', ped.x, ped.z); } };
      } else if (this.lastTalk === ped && this.t - this.lastTalkT < 4) {
        return { label: 'Vacilar', run: () => { this.lastTalk = null; g.peds.insult(ped); } };
      } else {
        return { label: 'Hablar', run: () => { this.lastTalk = ped; this.lastTalkT = this.t; this.talkTo(ped); } };
      }
    }
    // the pawn shop
    const pw = this.pawn;
    if (pw && Math.hypot(pw.x - p.pos.x, pw.z - p.pos.z) < 2.6) {
      const bag = p.bag || [];
      if (!bag.length) return { label: 'Compraventa: no llevas nada que vender', info: true };
      const total = Math.round(bag.reduce((a, b) => a + b.value, 0) * 0.6 * (PERK.price < 1 ? 1.15 : 1));
      return { label: `Vender la mochila en la compraventa <small>(${bag.length} ${bag.length === 1 ? 'cosa' : 'cosas'}, ${total} €)</small>`, run: () => this.sellBag(total) };
    }
    // the mercadillo's stalls (market days)
    if (g.mercadillo) { if (g.mercadillo.menu) return null; const mo = g.mercadillo.option(); if (mo) return mo; }
    // fishing at the pantano (with a rod: before the jetty's bench), the fish stall at the market
    const fo = g.fishing && g.inv.has('cana') && g.fishing.option();
    if (fo) return fo;
    const mo = g.fishing && g.fishing.marketOption();
    if (mo && !mo.info) return mo;
    // somewhere to sit
    const seat = g.seats && !(g.weapons && g.weapons.aiming) && g.seats.near(p.pos.x, p.pos.z);
    if (seat) return { label: seat.kind === 'terraza' ? 'Sentarse en la terraza' : seat.kind === 'fresco' ? 'Sentarse con los vecinos' : seat.kind === 'banco' ? 'Sentarse en el banco' : 'Sentarse', run: () => g.seats.sit(seat) };
    // the shops you can walk into, the gun shop among them (crouched or armed you are up to something else there)
    if (!p.crouch && !this.armed() && g.shops) { const so = g.shops.option(); if (so) return so; }
    const gs = this.gunShop;
    if (gs && !(g.shops && g.shops.armeria) && Math.hypot(gs.x - p.pos.x, gs.z - p.pos.z) < 3) return { label: 'Entrar en la armería', run: () => this.openShop() };
    // bars (a drink first; right after one, the same door offers a job as a waiter)
    for (const b of this.bars) {
      if (b.cd > 0 || Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 3.2) continue;
      return { label: `Tomar algo en ${b.name} <small>(${Math.max(1, Math.round(DRINK_PRICE * PERK.price))} €)</small>`, run: () => this.drink(b) };
    }
    // rubbish containers: somewhere to hide (offered when you are on the run or sneaking)
    if ((g.police.wanted > 0 || p.crouch) && g.mode === 'normal') {
      let c = null, bd = 1.7;
      for (const k of g.police.conts) {
        if (k.broken || Math.abs(k.x - p.pos.x) > 2 || Math.abs(k.z - p.pos.z) > 2) continue;
        const d = Math.hypot(k.x - p.pos.x, k.z - p.pos.z);
        if (d < bd) { bd = d; c = k; }
      }
      if (c) return { label: 'Esconderse en el contenedor', run: () => p.hideInContainer(c) };
    }
    // a quick hand (crouched, empty-handed): something from the counter while the shopkeeper looks the other way
    if (p.crouch && !this.armed()) {
      for (const s of this.shops) {
        if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 2.6) continue;
        if (s.liftCd > 0) return { label: 'Ya te llevaste algo de aquí: mejor no tentar a la suerte', info: true };
        const it = s.def.item || SHOP_ITEM[s.kind];
        if (it) return { label: `Birlar algo ${de(s.def.name)} <small>(${it[0].toLowerCase()})</small>`, run: () => this.shoplift(s, it) };
      }
    }
    // hold-ups (only with a gun in the hand)
    if (this.armed()) {
      for (const s of this.shops) {
        if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 3.2) continue;
        if (s.cd > 0) return { label: `Ya has atracado ${s.def.name}`, info: true };
        return { label: `Atracar ${s.def.name}`, run: () => this.startHoldup(s) };
      }
    }
    // work: at the door of a shop, bar, workshop… (after what you came to do there: a drink, a quick hand, a hold-up)
    if (J && g.mode === 'normal') {
      const wp = J.near(p.pos.x, p.pos.z);
      if (wp) {
        if (J.job && J.job.place === wp) return { label: 'Dejar el trabajo', run: () => J.quit() };
        if (!J.job && !this.armed()) return { label: `Pedir trabajo en ${wp.name} <small>(${{ reparto: 'repartos', reponedor: 'descargar la furgoneta', cartero: 'cartero', grua: 'la grúa', camarero: 'camarero', barrendero: 'barrendero', tractor: 'tractor' }[wp.job] || ''})</small>`, run: () => J.hire(wp) };
      }
      if (!J.job && J.policeCarNear(p.pos.x, p.pos.z) && g.police.wanted === 0) {
        const ay = J.places.find((q) => q.kind === 'ayto') || { name: 'el Ayuntamiento', boss: 'El jefe', x: p.pos.x, z: p.pos.z };
        return { label: 'Trabajar de Policía Local', run: () => J.hire(ay, 'policia') };
      }
    }
    // last of all: the fish stall (nothing to sell yet) and a good spot to fish without a rod
    if (mo) return mo;
    const fn = g.fishing && g.fishing.option();
    if (fn) return fn;
    return null;
  }

  vehicleOption(v) {
    const g = this.game;
    if (g.jobs && g.jobs.job) { const jo = g.jobs.option(); if (jo) return jo; }
    if (g.missions.active) return null;
    if (v.spec.livery === 'taxi') return this.taxi ? { label: 'Terminar el turno de taxi', run: () => this.endTaxi('Turno terminado') } : { label: 'Empezar turno de taxi', run: () => this.startTaxi(v) };
    if (v.spec.livery === 'local' || v.spec.livery === 'gc') return this.patrol ? { label: 'Terminar la patrulla', run: () => this.endPatrol('Patrulla terminada') } : { label: 'Patrullar: perseguir sospechosos', run: () => this.startPatrol(v) };
    return null;
  }

  // ------------------------------------------------------------ people
  talkTo(ped) {
    const g = this.game;
    if (g.charla && g.charla.start(ped)) return; // a neighbour of the padrón: a real conversation (charla.js)
    g.peds.talk(ped);
    // the old folks sometimes slip you something for a coffee
    if (ped.talks === 1 && ped.char.desc.elderly && Math.random() < 0.18) {
      const n = Math.round(rint(2, 10) * PERK.luck);
      setTimeout(() => { g.peds.say(ped, `Toma, zagal${g.player.char.desc.gender === 'f' ? 'a' : ''}, ${n} € pa un café.`); g.player.money += n; g.audio.sfx('money'); g.hud.notify(`+${n} €`, 'ok', 2); }, 1400);
    }
  }

  // ------------------------------------------------------------ bars
  drink(b) {
    const g = this.game, p = g.player;
    if (b.cd > 0) { g.hud.notify('El camarero: «¿Otra? Espérate una mijina, que no doy abasto».', 'info', 3); return; }
    const price = Math.max(1, Math.round(DRINK_PRICE * PERK.price));
    if (p.money < price) { g.hud.notify('No te llega ni para un café.', 'info', 3); return; }
    p.money -= price;
    const before = p.health;
    p.health = Math.min(100, p.health + 35);
    b.cd = 25;
    g.audio.sfx('money', { vol: 0.6 });
    g.hud.notify(`Te tomas ${pick(DRINKS)} en ${b.name}.${p.health > before ? ` +${Math.round(p.health - before)} de salud` : ''}`, 'ok', 4);
    g.police.heat = Math.max(0, g.police.heat - 0.5);
    g.persist();
  }

  sellBag(total) {
    const g = this.game, p = g.player;
    const n = (p.bag || []).length;
    p.bag = []; g.save.bag = [];
    p.money += total;
    g.audio.sfx('money');
    g.hud.subtitle('El de la compraventa', pick(['Esto lo tengo que mirar… venga, trato hecho.', 'No pregunto de dónde viene. Toma.', 'Te doy esto y no se hable más.']));
    setTimeout(() => g.hud.subtitle(null), 3000);
    g.hud.notify(`Vendes ${n} ${n === 1 ? 'cosa' : 'cosas'}: +${total} €`, 'ok', 3);
    g.persist();
  }

  // ------------------------------------------------------------ shoplifting
  shoplift(s, it) {
    const g = this.game, p = g.player;
    s.liftCd = 150;
    // the shopkeeper sees you less at night and when you are careful; Carmen, everybody likes her
    const seenP = (g.sky.night > 0.5 ? 0.28 : 0.42) * PERK.witness;
    p.char.play('punch2', 0.35);
    if (Math.random() < seenP) {
      g.hud.subtitle('Dependiente', pick(['¡Eh! ¡Al ladrón!', '¡Suelta eso, sinvergüenza!', '¡Que te he visto! ¡Llamo a la policía!']));
      setTimeout(() => g.hud.subtitle(null), 2600);
      g.police.crime('hurto', s.x, s.z, { direct: true });
      return;
    }
    const value = Math.round(rint(it[1], it[2]) * PERK.loot);
    p.bag = p.bag || [];
    p.bag.push({ id: 'hurto', name: it[0], value });
    g.save.bag = p.bag;
    g.audio.sfx('pickup', { vol: 0.5 });
    g.hud.notify(`Te llevas ${it[0].toLowerCase()} sin que nadie se entere (≈ ${value} €).`, 'ok', 3.5);
    g.persist();
  }

  // ------------------------------------------------------------ hold-ups
  startHoldup(s) {
    const g = this.game;
    this.holdup = { shop: s, t: 0, dur: s.def.time, loot: rint(s.def.loot[0], s.def.loot[1]) };
    s.cd = 360;
    g.hud.subtitle('Tú', pick(HOLDUP_LINES)); this.subT = 3;
    if (s.def.alarm) g.audio.sfx('alarm', { x: s.fx, z: s.fz });
    g.police.crime(s.def.crime, s.x, s.z);
    g.peds.scare(s.x, s.z, 25, g.player.pos, true);
    g.cam.shake(0.05);
  }
  updateHoldup(dt) {
    const g = this.game, p = g.player, h = this.holdup;
    const d = Math.hypot(p.pos.x - h.shop.x, p.pos.z - h.shop.z);
    if (g.state !== 'play' || p.vehicle || p.mode !== 'foot' || d > 7 || !this.armed()) { this.finishHoldup(h.t / h.dur); return; }
    h.t += dt;
    if (h.t >= h.dur) this.finishHoldup(1);
  }
  finishHoldup(frac) {
    const g = this.game, h = this.holdup;
    this.holdup = null;
    const amount = Math.round(h.loot * clamp(frac, 0, 1) * (frac < 1 ? 0.6 : 1) * PERK.loot);
    if (amount > 0) {
      g.player.money += amount;
      g.audio.sfx('money');
      g.hud.notify(`Botín ${de(h.shop.def.name)}: +${fmtMoney(amount)}`, 'gold', 4);
      if (frac < 1) g.hud.help('Te has ido antes de tiempo y te llevas solo una parte.', 4);
    } else g.hud.notify('Te vas con las manos vacías.', 'info', 3);
    g.hint('holdup', '<b>Atracos</b>: ahora huye y despista a la policía. En el taller de <b style="color:#7ec8ff">chapa y pintura</b> del polígono te borran las estrellas.', 8);
    g.persist();
  }

  // ------------------------------------------------------------ gun shop
  bindShop() {
    const ui = this.game.ui;
    if (!ui.shop) return;
    // the counter list of a shop (Shops) or, without one, the old gun-shop panel
    ui.shopClose.addEventListener('click', () => { const S = this.game.shops; if (S && S.store) S.closeStore(); else this.closeShop(); });
    ui.shopList.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const S = this.game.shops;
      if (S && S.store) S.buyAt(+b.dataset.i); else this.buy(+b.dataset.i);
    });
  }
  shopItems() {
    const W = this.game.weapons;
    const items = [];
    const gun = (id, sub) => {
      const d = WEAPONS[id];
      if (!W.has(id)) items.push({ kind: 'weapon', id, title: d.name, sub, price: d.price });
      else if (d.clip) items.push({ kind: 'ammo', id, title: `Munición · ${d.name}`, sub: `+${d.ammoPack} · llevas ${W.inv[id].clip + W.inv[id].ammo}`, price: d.ammoPrice });
    };
    gun('bate', 'Madera de fresno. Para «hacer deporte».');
    gun('pistola', `Cargador de ${WEAPONS.pistola.clip}. Incluye ${WEAPONS.pistola.ammoPack} balas.`);
    gun('escopeta', `Para la caza menor… o mayor. ${WEAPONS.escopeta.ammoPack} cartuchos.`);
    gun('subfusil', `Ráfagas de ${WEAPONS.subfusil.clip}. Incluye ${WEAPONS.subfusil.ammoPack} balas.`);
    gun('rifle', `De cerrojo, con visor de aumentos: el de las monterías. ${WEAPONS.rifle.ammoPack} cartuchos.`);
    items.push({ kind: 'armor', title: 'Chaleco antibalas', sub: 'Absorbe buena parte de los disparos y golpes.', price: 120 });
    items.push({ kind: 'health', title: 'Botiquín', sub: '+50 de salud', price: 30 });
    if (PERK.price !== 1) for (const it of items) it.price = Math.round(it.price * PERK.price); // Carmen's discount
    return items;
  }
  openShop() {
    const g = this.game;
    if (g.police.wanted > 0) { g.hud.notify('El armero echa la persiana: «Con la Guardia Civil detrás, ni hablar».', 'police', 4); return; }
    this.items = this.shopItems();
    this.renderShop();
    g.ui.shop.hidden = false;
    g.state = 'shop';
    g.input.exitLock();
    g.hud.prompt('');
    g.audio.sfx('door_open');
  }
  renderShop() {
    const g = this.game, money = g.player.money;
    g.ui.shopTitle.textContent = this.gunShop ? this.gunShop.name : 'Armería';
    g.ui.shopSub.innerHTML = `Tienes <b style="color:var(--money)">${fmtMoney(money)}</b>. ${g.input.device === 'touch' ? 'Toca' : g.input.device === 'pad' ? `Elige con la cruceta y pulsa ${g.input.key('', 0)} en` : 'Haz clic en'} un artículo para comprarlo.`;
    g.ui.shopList.innerHTML = this.items.map((it, i) =>
      `<button class="item${money < it.price ? ' off' : ''}" data-i="${i}"><span><b>${it.title}</b><small>${it.sub}</small></span><span class="price">${it.price} €</span></button>`).join('');
  }
  buy(i) {
    const g = this.game, p = g.player, it = this.items && this.items[i];
    if (!it) return;
    if (p.money < it.price) { g.audio.sfx('ui_back'); g.ui.shopSub.innerHTML = '<b style="color:#ff8a7e">No te llega el dinero.</b> Vuelve cuando tengas más.'; return; }
    if (it.kind === 'armor' && p.armor >= 100) { g.audio.sfx('ui_back'); g.ui.shopSub.innerHTML = 'Ya llevas el chaleco puesto, y como nuevo.'; return; }
    if (it.kind === 'health' && p.health >= 100) { g.audio.sfx('ui_back'); g.ui.shopSub.innerHTML = 'Estás como una rosa: el botiquín, para cuando haga falta.'; return; }
    p.money -= it.price;
    const W = g.weapons;
    if (it.kind === 'weapon') { W.give(it.id, WEAPONS[it.id].ammoPack || 0); W.select(it.id); }
    else if (it.kind === 'ammo') W.give(it.id, WEAPONS[it.id].ammoPack);
    else if (it.kind === 'armor') p.armor = 100;
    else if (it.kind === 'health') p.health = Math.min(100, p.health + 50);
    g.audio.sfx('money');
    g.hud.weapon(true);
    this.items = this.shopItems();
    this.renderShop();
    g.persist();
  }
  closeShop() {
    const g = this.game;
    if (g.state !== 'shop') return;
    g.ui.shop.hidden = true;
    g.state = 'play';
    g.audio.sfx('door_close');
    g.input.requestLock();
    if (this.armed()) g.hint('guns2', 'Con un arma en la mano puedes <b>atracar</b> tiendas, gasolineras, la joyería… y el banco. Acércate a la puerta y ' + (g.input.device === 'touch' ? 'toca el aviso.' : 'pulsa ' + g.input.key('E', 15) + '.'), 9);
  }

  // ------------------------------------------------------------ passenger (taxi) character
  spawnPassenger(x, z) {
    const g = this.game;
    const ch = g.chars.create(randomDesc(Math.random));
    g.scene.add(ch.object);
    ch.object.position.set(x, 0, z);
    return { ch, x, z, heading: 0, speed: 0, walkTo: null };
  }
  removePassenger() {
    const T = this.taxi, px = T && T.pax;
    if (!px) return;
    this.game.scene.remove(px.ch.object);
    px.ch.dispose();
    T.pax = null;
  }
  updatePassenger(dt) {
    const T = this.taxi, px = T && T.pax;
    if (!px || !px.ch.object.visible) return;
    let sp = 0;
    if (px.walkTo) {
      const dx = px.walkTo.x - px.x, dz = px.walkTo.z - px.z, d = Math.hypot(dx, dz);
      if (d > 0.25) { sp = Math.min(1.5, d * 3); px.x += (dx / d) * sp * dt; px.z += (dz / d) * sp * dt; px.heading = Math.atan2(dx, dz); }
    } else if (T.v) px.heading = Math.atan2(T.v.x - px.x, T.v.z - px.z);
    px.ch.update(dt, sp, {});
    px.ch.object.position.set(px.x, 0, px.z);
    px.ch.object.rotation.set(0, px.heading, 0);
  }
  paxSay(text) { this.game.hud.subtitle('Cliente', text); this.subT = 3.5; }

  // ------------------------------------------------------------ taxi shift
  startTaxi(v) {
    const g = this.game;
    if (g.police.wanted > 0) { g.hud.notify('Con la policía detrás nadie se sube a tu taxi.', 'police', 3); return; }
    this.taxi = { v, fares: 0, earned: 0, streak: 0, stage: 'seek', pax: null, next: 0 };
    v.taxiFree = true;
    g.audio.sfx('mission_start', { vol: 0.5 });
    g.hud.banner('TAXI', 'Recoge clientes y llévalos a tiempo', 'pass', 2.5);
    g.hint('taxi', 'Para <b>junto al cliente</b> para que suba y llévalo a su destino antes de que se acabe el tiempo. Sin golpes, ¡más propina! Cada 5 carreras seguidas hay premio.', 9);
    this.nextFare();
  }
  nextFare() {
    const g = this.game, T = this.taxi, v = T.v;
    const edges = g.peds.walkEdges;
    for (let a = 0; a < 60; a++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const pt = g.peds.sidePoint(e, 2 + Math.random() * Math.max(1, e.len - 4), Math.random() < 0.5 ? 1 : -1, {});
      const d = Math.hypot(pt.x - v.x, pt.z - v.z);
      if (d < 90 || d > 480 || g.map.buildingAt(pt.x, pt.z)) continue;
      const q = g.map.nearestEdge(pt.x, pt.z, 10, (x) => x.drive && !x.blocked && !x.dirt);
      if (!q) continue;
      T.stage = 'seek'; T.pickup = { x: pt.x, z: pt.z, rx: q.x, rz: q.z }; T.dest = null; T.limit = 0;
      v.taxiFree = true;
      g.hud.setBlip('taxi', { x: pt.x, z: pt.z, label: '', color: '#6fc0ff', edge: true });
      g.hud.objective = { x: q.x, z: q.z };
      g.hud.route = null; g.hud.routeT = 0;
      g.hud.objectiveText('Recoge al <b style="color:#6fc0ff">cliente</b> que te espera.');
      g.hud.timer(null);
      return;
    }
    T.next = 2; T.stage = 'wait';
  }
  updateTaxi(dt) {
    const g = this.game, T = this.taxi, v = T.v, p = g.player;
    if (p.vehicle !== v || v.dead || v.removed) { this.endTaxi(v.dead ? 'El taxi está destrozado' : 'Te has bajado del taxi'); return; }
    if (g.missions.active) { this.endTaxi('Turno interrumpido'); return; }
    if (T.stage === 'wait') { T.next -= dt; if (T.next <= 0) this.nextFare(); return; }
    if (T.stage === 'seek') {
      const d = Math.hypot(T.pickup.x - v.x, T.pickup.z - v.z);
      if (!T.pax && d < 140) { T.pax = this.spawnPassenger(T.pickup.x, T.pickup.z); T.pax.ch.setBase('talk'); T.hailed = false; }
      if (T.pax && !T.hailed && d < 45) { T.hailed = true; this.paxSay(pick(PAX.hail)); }
      if (g.police.wanted > 0 && d < 60) { this.paxSay(pick(PAX.police)); this.removePassenger(); g.hud.removeBlip('taxi'); T.stage = 'wait'; T.next = 8; g.hud.objective = null; g.hud.objectiveText('Despista a la policía para seguir con el turno.'); return; }
      if (T.pax && d < 10 && v.vel < 1.8) {
        // walk to the nearest rear door
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const sides = [1, -1].map((s) => ({ x: v.x + fz * (v.hw + 0.4) * s - fx * 0.5, z: v.z - fx * (v.hw + 0.4) * s - fz * 0.5 }));
        const door = Math.hypot(sides[0].x - T.pax.x, sides[0].z - T.pax.z) < Math.hypot(sides[1].x - T.pax.x, sides[1].z - T.pax.z) ? sides[0] : sides[1];
        T.pax.walkTo = door; T.pax.ch.setBase(null);
        T.stage = 'board'; T.boardT = 0;
        g.hud.removeBlip('taxi');
        g.hud.objectiveText('Espera a que suba el cliente…');
      }
      return;
    }
    if (T.stage === 'board') {
      T.boardT += dt;
      const px = T.pax;
      if (v.vel > 3) { T.stage = 'seek'; px.walkTo = null; g.hud.setBlip('taxi', { x: px.x, z: px.z, label: '', color: '#6fc0ff', edge: true }); g.hud.objectiveText('¡No arranques! Para junto al <b style="color:#6fc0ff">cliente</b>.'); return; }
      if (Math.hypot(px.walkTo.x - px.x, px.walkTo.z - px.z) < 0.35 || T.boardT > 4.5) {
        px.ch.object.visible = false;
        g.audio.sfx('door_close', { x: v.x, z: v.z });
        v.taxiFree = false;
        // destination far enough to be a real fare
        const opts = this.dests.filter((d) => { const dd = Math.hypot(d.x - v.x, d.z - v.z); return dd > 220 && dd < 1500; });
        const dest = opts.length ? pick(opts) : pick(this.dests);
        const dist = Math.hypot(dest.x - v.x, dest.z - v.z);
        T.dest = dest; T.dist = dist;
        T.limit = Math.round(22 + (dist * 1.35) / 9);
        T.fare = Math.round(12 + dist * 0.045);
        T.hp0 = v.health; T.hits = 0;
        T.stage = 'ride';
        this.paxSay(pick(PAX.in).replace('{a}', al(dest.name)).replace('{A}', cap(al(dest.name))));
        g.hud.setBlip('taxi', { x: dest.x, z: dest.z, label: '', color: '#f4c430', edge: true });
        g.hud.objective = { x: dest.x, z: dest.z };
        g.hud.route = null; g.hud.routeT = 0;
        const el = dest.name.startsWith('el ');
        g.hud.objectiveText(`Lleva al cliente ${el ? 'al' : 'a'} <b style="color:#f4c430">${el ? dest.name.slice(3) : dest.name}</b> · ${fmtMoney(T.fare)}`);
      }
      return;
    }
    if (T.stage === 'ride') {
      T.limit -= dt;
      g.hud.timer(T.limit);
      if (v.health < T.hp0 - 40) { T.hits++; T.hp0 = v.health; this.paxSay(pick(PAX.crash)); }
      if (g.police.wanted >= 2) { this.paxSay(pick(PAX.police)); this.dropPassenger(false); return; }
      if (T.limit <= 0) { this.paxSay(pick(PAX.late)); T.streak = 0; this.dropPassenger(false); return; }
      const d = Math.hypot(T.dest.x - v.x, T.dest.z - v.z);
      if (d < 14 && v.vel < 2.2) {
        const tip = Math.min(T.fare, T.hits === 0 ? Math.round(T.limit * 0.45) : T.hits === 1 ? Math.round(T.limit * 0.15) : 0);
        const pay = Math.round((T.fare + tip) * PERK.taxi); // Adri takes the short cuts
        T.fares++; T.streak++; T.earned += pay;
        g.player.money += pay;
        g.audio.sfx('money');
        this.paxSay(pick(T.hits === 0 && T.limit > 10 ? PAX.fast : PAX.slow));
        g.hud.notify(`Carrera: ${fmtMoney(T.fare)}${tip ? ` + ${fmtMoney(tip)} de propina` : ''}${PERK.taxi > 1 ? ` · atajos +${fmtMoney(pay - T.fare - tip)}` : ''}`, 'ok', 4);
        if (T.streak % 5 === 0) { const bonus = 100 * (T.streak / 5); g.player.money += bonus; T.earned += bonus; g.hud.banner('¡RACHA DE TAXISTA!', `${T.streak} carreras seguidas · +${fmtMoney(bonus)}`, 'pass', 3.5); g.audio.sfx('mission_pass', { vol: 0.6 }); }
        this.dropPassenger(true);
      }
    }
  }
  dropPassenger() {
    const g = this.game, T = this.taxi, v = T.v, px = T.pax;
    g.hud.timer(null);
    g.hud.removeBlip('taxi');
    g.hud.objective = null;
    v.taxiFree = true;
    if (px) {
      // out on the pavement side and away
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      let sx = -fz, sz = fx;
      if (g.map.buildingAt(v.x + sx * 3, v.z + sz * 3) || g.map.collider.raycast(v.x, v.z, v.x + sx * 2.2, v.z + sz * 2.2, 1, 1) < 0.98) { sx = -sx; sz = -sz; }
      px.x = v.x + sx * (v.hw + 0.5); px.z = v.z + sz * (v.hw + 0.5);
      px.walkTo = { x: px.x + sx * 2.5 + fx * 3, z: px.z + sz * 2.5 + fz * 3 };
      px.ch.object.visible = true;
      g.audio.sfx('door_open', { x: v.x, z: v.z });
      const cur = px;
      setTimeout(() => { if (this.taxi && this.taxi.pax === cur) this.removePassenger(); else if (!cur.ch.disposed) { g.scene.remove(cur.ch.object); cur.ch.dispose(); } }, 5000);
    }
    T.stage = 'wait'; T.next = 3;
    g.hud.objectiveText('Buscando otro cliente…');
  }
  endTaxi(reason) {
    const g = this.game, T = this.taxi;
    if (!T) return;
    this.taxi = null;
    if (T.pax && !T.pax.ch.disposed) { g.scene.remove(T.pax.ch.object); T.pax.ch.dispose(); }
    g.hud.removeBlip('taxi');
    g.hud.objective = null; g.hud.objectiveText(null); g.hud.timer(null);
    g.hud.notify(`${reason}: ${T.fares} carrera${T.fares === 1 ? '' : 's'}, ${fmtMoney(T.earned)} ganados.`, 'gold', 5);
    g.persist();
  }

  // ------------------------------------------------------------ police patrol ("vigilante")
  startPatrol(v) {
    const g = this.game;
    if (g.police.wanted > 0) { g.hud.notify('📻 Central: «Primero explica tú lo tuyo». Sin estrellas no hay patrulla.', 'police', 4); return; }
    this.patrol = { v, caught: 0, earned: 0, suspect: null, wait: 0, t: 0, stopT: 0 };
    g.audio.sfx('mission_start', { vol: 0.5 });
    g.hud.banner('PATRULLA', 'Persigue a los sospechosos y sácalos de la carretera', 'pass', 2.8);
    g.hint('patrol', 'Sigue al <b style="color:#e53935">sospechoso</b> y embístelo o bloquéalo hasta que se pare. ' + (g.input.device === 'touch' ? 'Doble toque en <b>Claxon</b>' : g.input.device === 'pad' ? 'Doble ' + g.input.key('', 10) : '<kbd>G</kbd>') + ' pone la sirena.', 9);
    this.nextSuspect();
  }
  nextSuspect() {
    const g = this.game, P = this.patrol, v = P.v;
    const cands = g.traffic.cars.filter((c) => c.ai && c.ai.mode === 'traffic' && !c.dead && !c.police && !c.ai.suspect && c.spec.livery !== 'taxi' && (() => { const d = Math.hypot(c.x - v.x, c.z - v.z); return d > 60 && d < 260; })());
    if (!cands.length) { P.suspect = null; P.wait = 3; g.hud.objectiveText('📻 Central: buscando sospechosos…'); return; }
    const s = pick(cands);
    s.ai.suspect = true; s.ai.speedMul = 1.45; s.ai.panic = 0;
    P.suspect = s; P.t = 150; P.stopT = 0; P.hp0 = s.health; P.spotted = false;
    g.hud.setBlip('suspect', { x: s.x, z: s.z, label: '!', color: '#e53935', edge: true });
    g.hud.objective = { x: s.x, z: s.z };
    g.hud.route = null; g.hud.routeT = 0;
    g.hud.objectiveText(`Detén al <b style="color:#e53935">sospechoso</b> (${s.spec.name})`);
    const q = g.map.nearestEdge(s.x, s.z, 30, (e) => !!e.name);
    g.hud.notify(`📻 Central: ${s.spec.name} sospechoso${q ? ' por ' + q.edge.name : ''}. Proceda.`, 'police', 5);
  }
  updatePatrol(dt) {
    const g = this.game, P = this.patrol, p = g.player;
    if (p.vehicle !== P.v || P.v.dead || P.v.removed) { this.endPatrol(P.v.dead ? 'Patrulla destrozada' : 'Has dejado la patrulla'); return; }
    if (g.police.wanted > 0 || g.missions.active) { this.endPatrol('Patrulla suspendida'); return; }
    const s = P.suspect;
    if (!s) { P.wait -= dt; if (P.wait <= 0) this.nextSuspect(); return; }
    if (s.removed || (!s.ai && !s.dead)) { this.suspectDone(false, 'Se ha perdido la pista del sospechoso'); return; }
    const d = Math.hypot(s.x - P.v.x, s.z - P.v.z);
    g.hud.setBlip('suspect', { x: s.x, z: s.z, label: '!', color: '#e53935', edge: true });
    g.hud.objective = { x: s.x, z: s.z };
    if (d < 50) { if (s.ai) s.ai.panic = 2; if (!P.spotted) { P.spotted = true; g.hud.help('¡Te ha visto! Va a intentar escapar.', 3); } }
    P.t -= dt;
    g.hud.timer(P.t);
    if (s.dead || s.health < 320 || (d < 10 && s.vel < 1.2 && (P.stopT += dt) > 1.6)) { this.suspectDone(true); return; }
    if (!(d < 10 && s.vel < 1.2)) P.stopT = 0;
    if (d > 340 || P.t <= 0) this.suspectDone(false, 'El sospechoso se ha escapado');
  }
  suspectDone(caught, why) {
    const g = this.game, P = this.patrol, s = P.suspect;
    P.suspect = null; P.wait = 4;
    g.hud.removeBlip('suspect'); g.hud.objective = null; g.hud.timer(null);
    if (s && s.ai) s.ai.suspect = false;
    if (caught) {
      P.caught++;
      const pay = Math.min(600, 150 + 50 * (P.caught - 1));
      P.earned += pay;
      g.player.money += pay;
      g.audio.sfx('mission_pass', { vol: 0.5 });
      g.hud.notify(`¡Sospechoso detenido! +${fmtMoney(pay)}`, 'gold', 4);
      if (s && !s.removed && s.ai && !s.dead) {
        // the driver gets out with the hands up
        const ped = g.peds.ejectDriver(s);
        g.traffic.release(s);
        s.driver = null; s.throttle = 0; s.brake = 1; s.handbrake = 1; s.steerIn = 0;
        setTimeout(() => { if (ped && ped.state !== 'dead') { g.peds.surrender(ped); g.peds.say(ped, '¡Me rindo, me rindo!'); } }, 2200);
      }
      g.hud.objectiveText('📻 Central: buen trabajo. Esperando al siguiente aviso…');
    } else {
      g.hud.notify(why, 'info', 4);
      g.hud.objectiveText('📻 Central: esperando al siguiente aviso…');
    }
    g.persist();
  }
  endPatrol(reason) {
    const g = this.game, P = this.patrol;
    if (!P) return;
    this.patrol = null;
    if (P.suspect && P.suspect.ai) P.suspect.ai.suspect = false;
    g.hud.removeBlip('suspect');
    g.hud.objective = null; g.hud.objectiveText(null); g.hud.timer(null);
    g.hud.notify(`${reason}: ${P.caught} detenido${P.caught === 1 ? '' : 's'}, ${fmtMoney(P.earned)} ganados.`, 'gold', 5);
  }

  // leaving the game state (death, arrest): stop everything cleanly
  reset() {
    if (this.holdup) this.holdup = null;
    if (this.taxi) this.endTaxi('Turno terminado');
    if (this.patrol) this.endPatrol('Patrulla terminada');
    if (this.game.state === 'shop') { if (this.game.shops && this.game.shops.store) this.game.shops.closeStore(); else this.closeShop(); }
  }
}
