// The mercadillo on the way to the pantano: on Wednesday mornings, from nine to two — the day Guareña's real weekly
// market is held — a row of stalls goes up along the road
// out of town — fruit and vegetables, churros, clothes, sunglasses and caps, pottery and bits and bobs, and the
// chamarilero, who buys what you carry in the backpack (better than the pawn shop) or swaps it for something else.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomDesc } from './characters.js';
import { mulberry32 } from './util.js';
import { PERK } from './perks.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const STALLS = [
  { id: 'fruta', name: 'Frutas y verduras', cols: [0xd8263a, 0xf2d230, 0x5aa84a], items: [['Un melón de la Vega', 1, { hp: 15 }], ['Un kilo de tomates', 1.2, { hp: 10 }], ['Unos higos', 1.5, { hp: 8 }], ['Uvas de la vendimia', 1.3, { hp: 10 }]] },
  { id: 'churros', name: 'Churrería', cols: [0xf2e2b8, 0xc88a3a], items: [['Una docena de churros', 2, { hp: 20 }], ['Unas porras', 2.2, { hp: 22 }], ['Un chocolate caliente', 1.5, { hp: 8, stamina: true }]] },
  { id: 'ropa', name: 'Ropa', cols: [0x2f4f7a, 0xe87aa4, 0x3a8a3a, 0xf4f4f0], items: [['Una camiseta roja', 6, { top: '#b8302a' }], ['Una camiseta azul', 6, { top: '#2f5fa8' }], ['Una camiseta verde', 6, { top: '#3a7a3a' }], ['Una camisa blanca', 8, { top: '#f2f2ee' }]] },
  { id: 'gafas', name: 'Gafas y gorras', cols: [0x1a1a1a, 0xc8202a, 0x2a6ab8], items: [['Unas gafas de sol', 5, { glasses: true }], ['Una gorra', 4, { accessory: 'gorra' }], ['Una boina', 4, { accessory: 'boina' }], ['Quitarte la gorra', 0, { accessory: null }]] },
  { id: 'ceramica', name: 'Cerámica y cosas', cols: [0xb5552e, 0xe8dcc0, 0x2a5a8a], items: [['Un botijo', 7, { bag: ['Un botijo', 9] }], ['Un plato de cerámica pintado', 9, { bag: ['Un plato pintado', 12] }], ['Una radio antigua', 14, { bag: ['Una radio antigua', 20] }]] },
  { id: 'chamarilero', name: 'El chamarilero', cols: [0x6a4a2a, 0x8a8a84], trader: true },
];
const SWAPS = [['Una bicicleta vieja', 45], ['Una caña de pescar', 30], ['Un reloj de pared', 35], ['Una guitarra española', 60], ['Una colección de sellos', 40], ['Un jamón de bellota', 90]];

export class Mercadillo {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.visible = false;
    game.scene.add(this.root);
    this.stalls = [];
    this.people = [];
    this.open = false;
    this.menu = null;
    this.sel = 0;
    this.ui = null;
  }

  // where: on the road from the Plaza to the pantano, where it leaves the houses behind
  build(P) {
    const g = this.game, map = g.map;
    if (!P.plaza || !P.pantano) return;
    const route = map.routeFrom(P.plaza.x, P.plaza.z, null, P.pantano.x, P.pantano.z);
    if (!route || route.length < 8) return;
    // walk the route: the first straight stretch just outside the town
    let spot = null;
    for (let i = 2; i < route.length - 4 && !spot; i += 2) {
      const x = route[i], z = route[i + 1];
      if (map.inTown(x, z)) continue;
      const q = map.nearestEdge(x, z, 20, (e) => e.drive && !e.blocked);
      if (!q || q.edge.len < 70) continue;
      const s = Math.min(Math.max(q.s, 35), q.edge.len - 35);
      spot = { e: q.edge, s };
    }
    if (!spot) return;
    const e = spot.e, rnd = mulberry32(777);
    const pole = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.7 });
    const table = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
    const PG = [], TG = [];
    let k = 0;
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, along = spot.s + (Math.floor(i / 2) - 2) * 6.5;
      const c = map.sample(e, along, {});
      const off = e.w / 2 + 2.6;
      const x = c.x - c.dz * off * side, z = c.z + c.dx * off * side;
      if (map.buildingAt(x, z) || map.collider.raycast(c.x, c.z, x, z, 1, 1) < 0.9) continue;
      const ry = Math.atan2(c.dx, c.dz);
      const def = STALLS[k % STALLS.length]; k++;
      const fx = -c.dz * side, fz = c.dx * side; // from the road to the stall
      const box = (arr, w, h, d, px, py, pz) => { const q = new THREE.BoxGeometry(w, h, d); q.rotateY(ry); q.translate(px, py, pz); arr.push(q); };
      for (const [a, b] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) box(PG, 0.05, 2.3, 0.05, x + c.dx * a + fx * b, 1.15, z + c.dz * a + fz * b);
      box(TG, 2.4, 0.06, 1.0, x - fx * 0.3, 0.8, z - fz * 0.3);
      // the striped awning
      const aw = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.2, 1, 1).rotateX(-Math.PI / 2 + 0.12), new THREE.MeshStandardMaterial({ map: awningTex(def.cols[0], rnd), side: THREE.DoubleSide, roughness: 0.9 }));
      aw.position.set(x, 2.32, z); aw.rotation.y = ry;
      this.root.add(aw);
      // the goods: coloured crates / piles on the table
      for (let j = 0; j < 6; j++) {
        const col = def.cols[j % def.cols.length];
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14 + rnd() * 0.12, 0.3), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
        const a = (j - 2.5) * 0.36;
        m.position.set(x - fx * 0.3 + c.dx * a, 0.9, z - fz * 0.3 + c.dz * a); m.rotation.y = ry + (rnd() - 0.5) * 0.2;
        this.root.add(m);
      }
      map.collider.addCircle(x - fx * 0.3, z - fz * 0.3, 0.9, 1, -4);
      this.stalls.push({ def, x, z, front: { x: x - fx * 1.4, z: z - fz * 1.4 }, back: { x: x + fx * 0.6, z: z + fz * 0.6 }, face: Math.atan2(-fx, -fz) });
    }
    const add = (arr, mat) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr.map((q) => (q.index ? q.toNonIndexed() : q))), mat); m.castShadow = true; m.receiveShadow = true; this.root.add(m); };
    add(PG, pole); add(TG, table);
    map.collider.buildCircles();
    const c = map.sample(e, spot.s, {});
    this.center = { x: c.x, z: c.z };
    this.edge = e;
    this.buildUI();
  }

  get marketDay() { const s = this.game.sky, wd = ((s.day || 0) + 5) % 7; return wd === 2 && s.hour >= 9 && s.hour < 14; }

  update(dt) {
    const g = this.game, p = g.player;
    if (!this.center) return;
    const on = this.marketDay;
    if (on !== this.open) {
      this.open = on; this.root.visible = on;
      // the road is closed to traffic while the stalls are up (the cars go round; whoever is on it drives out)
      if (this.edge) this.edge.closed = on;
      if (on) g.hud.setBlip('mercadillo', { x: this.center.x, z: this.center.z, label: 'M', color: '#f2b632', name: 'Mercadillo', edge: false, small: true });
      else { this.clear(); g.hud.removeBlip('mercadillo'); }
    }
    if (!on) return;
    const d = Math.hypot(p.pos.x - this.center.x, p.pos.z - this.center.z);
    this.people = this.people.filter((q) => g.peds.list.includes(q));
    if (!this.people.length && d < 100 && d > 50) this.spawnPeople();
    if (this.menu) {
      const s = this.menu.stall;
      if (Math.hypot(p.pos.x - s.front.x, p.pos.z - s.front.z) > 2.6) this.closeMenu();
      else this.menuInput();
    }
  }
  spawnPeople() {
    const g = this.game, P = g.peds, rnd = mulberry32(Math.floor(g.time));
    for (const s of this.stalls) {
      const v = P.spawnAt(s.back.x, s.back.z, randomDesc(rnd));
      v.fixed = true; v.state = 'idle'; v.idleT = 1e9; v.heading = s.face; v.char.setBase(rnd() < 0.5 ? 'talk' : null);
      s.vendor = v; this.people.push(v);
      if (rnd() < 0.6) { const c = P.spawnAt(s.front.x + (rnd() - 0.5), s.front.z + (rnd() - 0.5), randomDesc(rnd)); c.fixed = true; c.state = 'idle'; c.idleT = 1e9; c.heading = s.face + Math.PI; this.people.push(c); }
    }
  }
  clear() {
    const P = this.game.peds;
    for (const q of this.people) { const i = P.list.indexOf(q); if (i >= 0) P.despawn(q, i); }
    this.people = [];
    this.closeMenu();
  }

  // the prompt at a stall
  option() {
    const g = this.game, p = g.player;
    if (!this.open || this.menu) return null;
    for (const s of this.stalls) {
      if (Math.hypot(p.pos.x - s.front.x, p.pos.z - s.front.z) > 1.6) continue;
      return { label: s.def.trader ? 'Tratar con el chamarilero' : `Mirar el puesto: ${s.def.name.toLowerCase()}`, run: () => this.openMenu(s) };
    }
    return null;
  }

  // ------------------------------------------------------------ buying, selling, swapping
  items(s) {
    const g = this.game, p = g.player, k = PERK.price;
    if (!s.def.trader) return s.def.items.map(([name, price, fx]) => ({ name, price: Math.round(price * k * 10) / 10, fx }));
    const bag = p.bag || [];
    const out = bag.map((b, i) => ({ name: `Vender: ${b.name}`, price: -Math.round(b.value * 0.75), sell: i }));
    if (bag.length) out.push({ name: `Cambiar ${bag[0].name.toLowerCase()} por otra cosa`, price: 0, swap: 0 });
    if (!out.length) out.push({ name: 'No llevas nada que le interese', price: 0, none: true });
    return out;
  }
  openMenu(s) {
    this.menu = { stall: s, list: this.items(s) };
    this.sel = 0;
    const g = this.game;
    if (s.vendor) g.peds.say(s.vendor, s.def.trader ? pick(['¿Qué traes por ahí?', 'Yo lo compro todo… a buen precio.', 'A ver, a ver…']) : pick(['¡Mire, mire, que se lo lleva!', '¡A euro, a euro!', '¡Lo más fresco de la Vega!', '¿Qué le pongo, {guapo|guapa}?']), true);
    this.render();
    this.ui.hidden = false;
  }
  closeMenu() { this.menu = null; if (this.ui) this.ui.hidden = true; }
  menuInput() {
    const input = this.game.input, L = this.menu.list;
    for (let i = 0; i < Math.min(9, L.length); i++) if (input.hit('Digit' + (i + 1))) { this.pick(i); return; }
    if (input.hit('ArrowDown') || input.gpPressed(13)) { this.sel = (this.sel + 1) % L.length; this.render(); }
    if (input.hit('ArrowUp') || input.gpPressed(12)) { this.sel = (this.sel + L.length - 1) % L.length; this.render(); }
    if (input.hit('Enter') || input.gpPressed(0)) this.pick(this.sel);
    if (input.hit('Escape') || input.gpPressed(1)) this.closeMenu();
  }
  pick(i) {
    const g = this.game, p = g.player, it = this.menu && this.menu.list[i], s = this.menu && this.menu.stall;
    if (!it || it.none) return;
    if (it.sell !== undefined) {
      const b = p.bag[it.sell];
      p.bag.splice(it.sell, 1); g.save.bag = p.bag;
      p.money += -it.price; g.audio.sfx('money');
      g.hud.notify(`Le vendes ${b.name.toLowerCase()}: +${-it.price} €`, 'ok', 3);
      if (s.vendor) g.peds.say(s.vendor, pick(['Trato hecho.', 'Esto lo coloco yo en un pispás.', 'Venga, que me pillas de buenas.']), true);
      this.menu.list = this.items(s); this.sel = 0; this.render(); g.persist();
      return;
    }
    if (it.swap !== undefined) {
      const b = p.bag[it.swap];
      const [name, value] = pick(SWAPS.filter(([, v]) => v <= b.value * 1.4 + 10)) || SWAPS[0];
      p.bag[it.swap] = { id: 'trueque', name, value };
      g.save.bag = p.bag;
      g.audio.sfx('pickup');
      g.hud.notify(`Cambias ${b.name.toLowerCase()} por ${name.toLowerCase()} (≈ ${value} €).`, 'ok', 4);
      if (s.vendor) g.peds.say(s.vendor, '¡Hecho! Has salido ganando, ya verás.', true);
      this.menu.list = this.items(s); this.sel = 0; this.render(); g.persist();
      return;
    }
    if (p.money < it.price) { g.hud.notify('No te llega.', 'info', 2); return; }
    p.money -= it.price;
    const fx = it.fx || {};
    if (fx.hp) { p.health = Math.min(100, p.health + fx.hp); }
    if (fx.stamina) p.stamina = 1;
    if (fx.bag) { p.bag = p.bag || []; p.bag.push({ id: 'mercadillo', name: fx.bag[0], value: fx.bag[1] }); g.save.bag = p.bag; }
    if (fx.top || fx.glasses !== undefined || 'accessory' in fx) this.restyle(fx);
    g.audio.sfx('money', { vol: 0.6 });
    g.hud.notify(`${it.name}${it.price ? `: −${String(it.price).replace('.', ',')} €` : ''}${fx.hp ? ` · +${fx.hp} de salud` : ''}`, 'ok', 3);
    if (s.vendor) g.peds.say(s.vendor, pick(['¡Que lo disfrutes!', 'Gracias, {guapo|guapa}.', '¡Vuelve el miércoles que viene!']), true);
    g.persist();
  }
  // new clothes, sunglasses, a cap: the character is rebuilt with them
  restyle(fx) {
    const g = this.game, p = g.player;
    const desc = { ...p.char.desc };
    if (fx.top) desc.top = fx.top;
    if (fx.glasses) desc.glasses = true;
    if ('accessory' in fx) { desc.accessory = fx.accessory || undefined; if (fx.accessory) desc.accessoryColor = fx.accessory === 'boina' ? '#2a2a2a' : pick(['#c8202a', '#1a2240', '#f4f4f0']); }
    const ch = g.chars.create(desc);
    p.setCharacter(ch);
    p.syncChar();
    g.save.style = { top: desc.top, glasses: desc.glasses, accessory: desc.accessory, accessoryColor: desc.accessoryColor };
  }

  buildUI() {
    if (this.ui || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'stallMenu'; el.className = 'listMenu'; el.hidden = true;
    document.getElementById('hud').appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) this.pick(+b.dataset.i); });
    this.ui = el;
  }
  render() {
    const m = this.menu;
    if (!m) return;
    const money = this.game.player.money;
    this.ui.innerHTML = `<h3>${m.stall.def.name}</h3>` + m.list.map((it, i) => `<button data-i="${i}" class="${i === this.sel ? 'on' : ''}${it.price > money ? ' off' : ''}"><kbd>${i + 1}</kbd><span>${it.name}</span><b>${it.none ? '' : it.price < 0 ? '+' + (-it.price) + ' €' : it.price ? String(it.price).replace('.', ',') + ' €' : it.swap !== undefined ? 'trueque' : 'gratis'}</b></button>`).join('') + '<small>1–9 o clic · Esc para irte</small>';
  }
}

function awningTex(col, rnd) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const a = '#' + col.toString(16).padStart(6, '0');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f4f0e6' : a; x.fillRect(i * 8, 0, 8, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
