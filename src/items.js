// Everything you can carry: what the shops of the town sell (food, things for the house, things just to have),
// the fishing gear, the fish you catch at the pantano and the loot of the houses (the old «mochila»). The inventory
// lives in the save: stacks of catalogue items, and single entries for fish and loot (each with its own weight/value).

export const CATS = [
  { id: 'comida', name: 'Comida', ico: '🥖' },
  { id: 'casa', name: 'Para la casa', ico: '🛋️' },
  { id: 'objetos', name: 'Objetos', ico: '🎁' },
  { id: 'pesca', name: 'Pesca', ico: '🎣' },
  { id: 'botin', name: 'Botín', ico: '💰' },
];

// cat: comida (eat → health) · casa (placed in your house) · objetos (to have, a few you can use) · pesca (gear)
// price in €. heal: health when eaten. place: how it stands in the house ('floor' | 'wall' | 'top': on a table or shelf)
export const ITEMS = {
  // ---- food and drink
  kebab: { name: 'Kebab', cat: 'comida', price: 5, heal: 40, ico: '🥙', txt: 'Pan de pita, carne del asador, ensalada y salsa de yogur.' },
  durum: { name: 'Dürüm', cat: 'comida', price: 6, heal: 45, ico: '🌯', txt: 'Enrollado en pan fino, con todo y bien de salsa.' },
  falafel: { name: 'Falafel', cat: 'comida', price: 4, heal: 30, ico: '🧆', txt: 'Bolitas de garbanzo con salsa de sésamo.' },
  patatas: { name: 'Patatas fritas', cat: 'comida', price: 3, heal: 15, ico: '🍟', txt: 'Recién hechas, con sal.' },
  isotonica: { name: 'Bebida isotónica', cat: 'comida', price: 2, heal: 8, stamina: true, ico: '🧃', txt: 'Para después de entrenar.' },
  bocadillo: { name: 'Bocadillo de jamón', cat: 'comida', price: 4, heal: 35, ico: '🥖', txt: 'Pan de pueblo y jamón de la dehesa.' },
  torta: { name: 'Torta del Casar', cat: 'comida', price: 9, heal: 45, ico: '🧀', txt: 'Se come a cucharadas, con pan.' },
  migas: { name: 'Tarrina de migas', cat: 'comida', price: 5, heal: 40, ico: '🍲', txt: 'Migas extremeñas con torreznos.' },
  fruta: { name: 'Bolsa de fruta', cat: 'comida', price: 3, heal: 20, ico: '🍑', txt: 'Melocotones y ciruelas de las Vegas.' },
  melon: { name: 'Melón', cat: 'comida', price: 3, heal: 30, ico: '🍈', txt: 'De los de piel de sapo.' },
  perrunillas: { name: 'Perrunillas', cat: 'comida', price: 3, heal: 15, ico: '🍪', txt: 'Dulce de manteca, como las de la abuela.' },
  magdalenas: { name: 'Magdalenas', cat: 'comida', price: 2, heal: 15, ico: '🧁', txt: 'Para mojar en el café.' },
  chocolate: { name: 'Tableta de chocolate', cat: 'comida', price: 2, heal: 12, ico: '🍫', txt: 'Con almendras.' },
  pan: { name: 'Barra de pan', cat: 'comida', price: 1, heal: 10, ico: '🥖', txt: 'Recién hecha.' },
  agua: { name: 'Botella de agua', cat: 'comida', price: 1, heal: 8, stamina: true, ico: '💧', txt: 'Fresquita. Te quita el cansancio.' },
  refresco: { name: 'Refresco de naranja', cat: 'comida', price: 2, heal: 10, stamina: true, ico: '🥤', txt: 'Con gas y bien frío.' },
  zumo: { name: 'Zumo de melocotón', cat: 'comida', price: 2, heal: 12, stamina: true, ico: '🧃', txt: 'De la cooperativa.' },
  // ---- for the house (you place them yourself)
  planta: { name: 'Planta en maceta', cat: 'casa', price: 16, ico: '🪴', place: 'floor', txt: 'Una costilla de Adán que no pide casi nada.' },
  geranios: { name: 'Macetero de geranios', cat: 'casa', price: 9, ico: '🌺', place: 'floor', txt: 'Rojos, como en todos los patios de Guareña.' },
  flores: { name: 'Jarrón con flores', cat: 'casa', price: 14, ico: '💐', place: 'top', txt: 'Para la mesa del salón.' },
  cactus: { name: 'Cactus', cat: 'casa', price: 6, ico: '🌵', place: 'top', txt: 'No hay quien lo mate.' },
  lampara: { name: 'Lámpara de pie', cat: 'casa', price: 45, ico: '🛋️', place: 'floor', txt: 'Luz cálida para las noches de verano.' },
  lamparita: { name: 'Lamparita de mesa', cat: 'casa', price: 18, ico: '💡', place: 'top', txt: 'Para leer en la cama.' },
  alfombra: { name: 'Alfombra', cat: 'casa', price: 38, ico: '🟥', place: 'floor', flat: true, txt: 'De lana, con cenefa.' },
  cuadro: { name: 'Cuadro de las Vegas', cat: 'casa', price: 30, ico: '🖼️', place: 'wall', txt: 'Un paisaje de trigo y encinas.' },
  espejo: { name: 'Espejo', cat: 'casa', price: 28, ico: '🪞', place: 'wall', txt: 'Con marco de madera.' },
  reloj: { name: 'Reloj de pared', cat: 'casa', price: 22, ico: '🕰️', place: 'wall', txt: 'Da la hora de verdad.' },
  poster: { name: 'Póster de la feria', cat: 'casa', price: 6, ico: '📜', place: 'wall', txt: 'Fiestas de San Gregorio.' },
  sillon: { name: 'Sillón orejero', cat: 'casa', price: 120, ico: '💺', place: 'floor', seat: true, txt: 'El de ver la tele.' },
  sofa: { name: 'Sofá de tres plazas', cat: 'casa', price: 290, ico: '🛋️', place: 'floor', seat: true, txt: 'Cabe la familia entera.' },
  mesa: { name: 'Mesa de comedor', cat: 'casa', price: 150, ico: '🪑', place: 'floor', txt: 'De madera maciza, con dos sillas.' },
  mesita: { name: 'Mesa baja', cat: 'casa', price: 55, ico: '🟫', place: 'floor', txt: 'Para el café y el mando de la tele.' },
  estanteria: { name: 'Estantería con libros', cat: 'casa', price: 85, ico: '📚', place: 'floor', txt: 'Llena de novelas.' },
  tele: { name: 'Televisor', cat: 'casa', price: 260, ico: '📺', place: 'floor', txt: 'Con su mueble. Se enciende.' },
  radio: { name: 'Radio antigua', cat: 'casa', price: 35, ico: '📻', place: 'top', txt: 'De válvulas, como la del abuelo.' },
  ventilador: { name: 'Ventilador', cat: 'casa', price: 32, ico: '🌀', place: 'floor', txt: 'Imprescindible en agosto.' },
  puff: { name: 'Puf', cat: 'casa', price: 25, ico: '🟠', place: 'floor', seat: true, txt: 'Mullido.' },
  cojines: { name: 'Cojines', cat: 'casa', price: 12, ico: '🟪', place: 'top', txt: 'Tres, de colores.' },
  // ---- things just to have (some do something)
  libro: { name: 'Libro', cat: 'objetos', price: 12, ico: '📕', use: 'read', txt: 'Poemas de Luis Chamizo, en castúo.' },
  comic: { name: 'Cómic', cat: 'objetos', price: 8, ico: '📗', use: 'read', txt: 'Aventuras en blanco y negro.' },
  balon: { name: 'Balón de fútbol', cat: 'objetos', price: 15, ico: '⚽', txt: 'Para echar un partido en el Pilar.' },
  peluche: { name: 'Peluche', cat: 'objetos', price: 14, ico: '🧸', txt: 'Un osito muy blandito.' },
  parchis: { name: 'Juego de mesa', cat: 'objetos', price: 18, ico: '🎲', txt: 'Parchís y oca, por las dos caras.' },
  cometa: { name: 'Cometa', cat: 'objetos', price: 10, ico: '🪁', txt: 'Para las tardes de viento en las eras.' },
  linterna: { name: 'Linterna', cat: 'objetos', price: 12, ico: '🔦', txt: 'Para las noches sin farolas.' },
  herramientas: { name: 'Caja de herramientas', cat: 'objetos', price: 35, ico: '🧰', txt: 'Martillo, destornilladores y cinta americana.' },
  paraguas: { name: 'Paraguas', cat: 'objetos', price: 9, ico: '☂️', txt: 'Por si acaso, que en Guareña no llueve nunca.' },
  auriculares: { name: 'Auriculares', cat: 'objetos', price: 25, ico: '🎧', txt: 'Inalámbricos.' },
  cargador: { name: 'Cargador de móvil', cat: 'objetos', price: 7, ico: '🔌', txt: 'El tuyo siempre se pierde.' },
  perfume: { name: 'Colonia', cat: 'objetos', price: 20, ico: '🧴', txt: 'Huele a lavanda.' },
  gafas: { name: 'Gafas de sol', cat: 'objetos', price: 22, ico: '🕶️', txt: 'Para el sol de la tarde.' },
  prismaticos: { name: 'Prismáticos', cat: 'objetos', price: 40, ico: '🔭', txt: 'Para ver las grullas en el pantano.' },
  navaja: { name: 'Navaja de campo', cat: 'objetos', price: 18, ico: '🔪', txt: 'Para el chorizo y el pan.' },
  cuaderno: { name: 'Cuaderno', cat: 'objetos', price: 3, ico: '📓', txt: 'Para apuntar las cosas.' },
  // ---- fishing
  cana: { name: 'Caña de pescar', cat: 'pesca', price: 45, ico: '🎣', unique: true, txt: 'Caña telescópica con carrete. Equípala en la orilla del pantano.' },
  cebo: { name: 'Lombrices (cebo)', cat: 'pesca', price: 3, ico: '🪱', pack: 10, txt: 'Con cebo pican mucho antes. Un bote, diez lances.' },
  maiz: { name: 'Maíz dulce (cebo)', cat: 'pesca', price: 2, ico: '🌽', pack: 10, txt: 'A las carpas les encanta.' },
};

// what lives in the Pantano de San Roque: kg range, €/kg at the fish stall, how often it bites, what baits it
export const FISH = [
  { id: 'carpa', name: 'Carpa', kg: [0.8, 9], eur: 3, w: 30, bait: 'maiz' },
  { id: 'barbo', name: 'Barbo comizo', kg: [0.6, 5], eur: 4, w: 18 },
  { id: 'bass', name: 'Black bass', kg: [0.3, 2.8], eur: 7, w: 16, fight: 1.3 },
  { id: 'lucio', name: 'Lucio', kg: [1.2, 8], eur: 6, w: 7, fight: 1.5 },
  { id: 'tenca', name: 'Tenca', kg: [0.3, 2], eur: 5, w: 10, bait: 'cebo' },
  { id: 'boga', name: 'Boga', kg: [0.1, 0.8], eur: 4, w: 14, bait: 'cebo' },
  { id: 'carpin', name: 'Carpín', kg: [0.1, 0.9], eur: 2, w: 12 },
  { id: 'bota', name: 'Una bota vieja', junk: true, w: 3 },
  { id: 'lata', name: 'Una lata oxidada', junk: true, w: 3 },
];

// «Cuadro de las Vegas» → «cuadro de las Vegas» (a name in the middle of a sentence)
export function lc(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

// ---------------------------------------------------------------- the inventory
// entries: { id, n } for catalogue items; { id: 'pez', sp, name, kg, value } for fish; loot stays in player.bag
export class Inventory {
  constructor(game) {
    this.g = game;
    const s = game.save;
    this.list = Array.isArray(s.inv) ? s.inv.filter((e) => e && (e.id === 'pez' || ITEMS[e.id])) : [];
    s.inv = this.list;
    this.bait = s.bait || 0; // lances left in the open bait pot
    this.baitKind = s.baitKind || 'cebo';
  }
  save() { this.g.save.inv = this.list; this.g.save.bait = this.bait; this.g.persist(); }
  count(id) { return this.list.filter((e) => e.id === id).reduce((a, e) => a + (e.n || 1), 0); }
  has(id) { return this.count(id) > 0; }
  add(id, n = 1, extra = null) {
    if (id === 'pez') { this.list.push({ id, ...extra }); this.save(); return; }
    const d = ITEMS[id];
    if (!d) return;
    if (d.unique && this.has(id)) return;
    const e = this.list.find((x) => x.id === id);
    if (e) e.n = (e.n || 1) + n; else this.list.push({ id, n });
    this.save();
  }
  take(id, n = 1) {
    const e = this.list.find((x) => x.id === id);
    if (!e) return false;
    e.n = (e.n || 1) - n;
    if (e.n <= 0) this.list.splice(this.list.indexOf(e), 1);
    this.save();
    return true;
  }
  removeEntry(e) { const i = this.list.indexOf(e); if (i >= 0) { this.list.splice(i, 1); this.save(); } }
  fish() { return this.list.filter((e) => e.id === 'pez'); }
  // one lance of bait (a pot gives ten): false if there is none
  useBait() {
    if (this.bait > 0) { this.bait--; this.save(); return this.baitKind || 'cebo'; }
    for (const k of ['maiz', 'cebo']) if (this.take(k)) { this.bait = (ITEMS[k].pack || 10) - 1; this.baitKind = k; this.g.save.baitKind = k; this.save(); return k; }
    return false;
  }
  get baitLeft() { return this.bait + (this.count('cebo') + this.count('maiz')) * 10; }
}
