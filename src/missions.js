// Missions set in real places of Guareña, written as small coroutine scripts, plus markers, checkpoints,
// the "Tesoros de Tarteso" collectibles and the paint & body shop (chapa y pintura) that clears the wanted level.
import * as THREE from 'three';
import { clamp, mulberry32, ringCentroid } from './util.js';
import { driveToward, followRoute, turnSpeed } from './traffic.js';
import { PERK } from './perks.js';

function glowTexture(color = '255,200,40') {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, `rgba(${color},0)`); g.addColorStop(0.6, `rgba(${color},0.25)`); g.addColorStop(1, `rgba(${color},0.75)`);
  x.fillStyle = g; x.fillRect(0, 0, 16, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function iconTexture(letter, bg = '#f4c430') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fillStyle = bg; x.fill();
  x.lineWidth = 8; x.strokeStyle = '#1a1a1a'; x.stroke();
  x.fillStyle = '#1a1a1a'; x.font = '900 72px "Anton", "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Missions {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.active = null;
    this.markers = [];
    this.cpMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.cpGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    this.cpGeo.translate(0, 0.5, 0);
    this.checkpoint = new THREE.Mesh(this.cpGeo, this.cpMat);
    this.checkpoint.visible = false;
    this.root.add(this.checkpoint);
    this.arrow = this.makeArrow();
    this.root.add(this.arrow);
    this.done = new Set(game.save.done || []);
    this.defs = this.defineMissions();
    this.placeMarkers();
    this.setupCollectibles();
    this.setupShop();
    this.cooldown = 0;
  }
  makeArrow() {
    const s = new THREE.Shape();
    s.moveTo(0, 0.6); s.lineTo(0.5, 0); s.lineTo(0.2, 0); s.lineTo(0.2, -0.6); s.lineTo(-0.2, -0.6); s.lineTo(-0.2, 0); s.lineTo(-0.5, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
    g.rotateX(Math.PI); // point down
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf4c430 }));
    m.visible = false;
    return m;
  }

  // ------------------------------------------------------------ places
  P() {
    const lm = this.game.world.landmarks.poi;
    const poiNamed = (re) => this.map.pois.find((p) => re.test(p.name));
    const area = (re) => { const a = this.map.areas.find((a) => re.test(a.name)); return a ? (() => { const c = ringCentroid(a.ring); return { x: c[0], z: c[1] }; })() : null; };
    const onRoad = (pt) => { if (!pt) return null; const q = this.map.nearestEdge(pt.x, pt.z, 80, (e) => e.drive && !e.blocked && !e.dirt); return q ? { x: q.x, z: q.z, edge: q.edge, s: q.s } : pt; };
    const bars = this.map.pois.filter((p) => /amenity:(bar|cafe|pub|restaurant)/.test(p.kind) && this.map.inTown(p.x, p.z));
    return {
      plaza: lm.plaza || { x: -35, z: 38 }, ayto: lm.ayto, churchDoor: lm.churchDoor, tower: lm.churchTower,
      mercado: lm.mercado || area(/Mercado de Abastos/), sanGregorio: lm.sanGregorio,
      coop: lm.cooperativa || area(/Cooperativa/), estadio: lm.estadio, ermita: lm.ermita, guardia: lm.guardia, salud: lm.salud,
      pantano: area(/Pantano de San Roque/), poligono: area(/Polígono Industrial/), sanGines: area(/Parque San Gin/), pilar: area(/Parque del Pilar/),
      pabellon: area(/Pabellón Municipal La Encina/), instituto: area(/Eugenio Frutos/), chamizo: poiNamed(/Luis Chamizo/),
      bars, onRoad,
    };
  }

  defineMissions() {
    const game = this.game;
    const P = this.P();
    this.places = P;
    const G = (m, f) => (game.player.char.desc.gender === 'f' ? f : m);
    const defs = [];
    // ============ 1. Bienvenida
    defs.push({
      id: 'bienvenida', title: 'Bienvenida a Guareña', letter: 'R', giver: { name: 'Tía Remedios', at: P.plaza, desc: { gender: 'f', elderly: true, skin: 1, hair: 6, hairStyle: 'mono', top: '#1d1f24', topStyle: 'blouse', bottom: '#1d1f24', bottomStyle: 'skirt', shoes: '#1d1f24' } },
      reward: 150,
      *script(m) {
        yield m.cut(P.plaza, 'Tía Remedios', [
          [G('¡Acho, por fin llegas! Bienvenido a Guareña, hijo.', '¡Acho, por fin llegas! Bienvenida a Guareña, hija.'), 3.2],
          [G('Estás más delgao que un palillo… Ya te engordaré yo con unas migas.', 'Estás más delgá que un palillo… Ya te engordaré yo con unas migas.'), 3.2],
          ['Pero antes vas a hacerme unos recaditos, que para eso estás aquí.', 3],
        ]);
        yield m.say('Tía Remedios', 'Acércate a la Iglesia de Santa María, que la torre la han dejado preciosa.', 4);
        yield m.goTo(P.churchDoor, 5, { text: 'Ve a la <b>Iglesia de Santa María</b>.' });
        yield m.towerShot();
        yield m.say('Tía Remedios', 'Treinta y dos metros de torre. Y las cigüeñas ahí arriba, como señoras.', 3.5);
        const car = m.spawnCar('veton', P.onRoad({ x: P.churchDoor.x + 8, z: P.churchDoor.z + 12 }), '#c8202a');
        yield m.say('Tía Remedios', 'Coge el coche de mi sobrino, el rojo. Está abierto, que aquí no roba nadie… casi.', 4);
        yield m.getIn((v) => v === car, 'Sube al <b>Vetón rojo</b> de tu primo.', car);
        yield m.say('Tía Remedios', 'Llévale este encargo a la Juani, en el Mercado de Abastos. Plaza de San Gregorio.', 4);
        yield m.goTo(P.onRoad(P.mercado), 7, { text: 'Lleva el encargo al <b>Mercado de Abastos</b>.', vehicle: true });
        yield m.say('Juani', '¡Ay, qué bien! Dile a tu tía que el domingo le guardo las perrunillas.', 3.5);
        yield m.goTo(P.onRoad(P.plaza), 8, { text: 'Vuelve a la <b>Plaza de España</b>.' });
        yield m.say('Tía Remedios', G('¡Eres un sol! Toma, para tus cosas. Y no corras, que te conozco.', '¡Eres un sol! Toma, para tus cosas. Y no corras, que te conozco.'), 4);
      },
    });
    // ============ 2. Aceite del bueno
    const barsSel = [...P.bars].sort((a, b) => Math.hypot(a.x - P.plaza.x, a.z - P.plaza.z) - Math.hypot(b.x - P.plaza.x, b.z - P.plaza.z)).slice(0, 8);
    defs.push({
      id: 'aceite', title: 'Aceite del bueno', letter: 'P', requires: 'bienvenida', giver: { name: 'Paco', at: P.coop, desc: { gender: 'm', skin: 2, hair: 5, hairStyle: 'corto', top: '#3c7a3f', topStyle: 'polo', bottom: '#5b3a26', bottomStyle: 'pants', shoes: '#3a2a1c', accessory: 'gorra', accessoryColor: '#1f4a3a' } },
      reward: 350,
      *script(m) {
        yield m.cut(P.coop, 'Paco', [
          ['Aquí en la cooperativa molemos la mejor aceituna de las Vegas.', 3],
          ['Tengo tres bares esperando garrafas de aceite nuevo y la furgoneta sin conductor.', 3.4],
          ['Cuatro minutos. Y cuidadín, que las garrafas no son de goma.', 3],
        ]);
        const van = m.spawnCar('emerita', P.onRoad({ x: P.coop.x, z: P.coop.z + 25 }), '#f2f2ee');
        yield m.getIn((v) => v === van, 'Sube a la <b>furgoneta</b> de la cooperativa.', van);
        m.timer(240, 'Se acabó el tiempo: el aceite llegó tarde.');
        m.failIf(() => van.health < 450, '¡Has roto las garrafas!');
        m.failIf(() => van.dead, 'La furgoneta ha quedado destrozada.');
        const stops = [barsSel[1] || P.mercado, barsSel[4] || P.sanGregorio, barsSel[6] || P.plaza];
        for (let i = 0; i < stops.length; i++) {
          const st = P.onRoad(stops[i]);
          const street = st.edge && st.edge.name ? st.edge.name : 'el centro';
          yield m.goTo(st, 7, { text: `Entrega el aceite (${i + 1}/3) en el bar de <b>${street}</b>.`, vehicle: van, stop: true });
          game.audio.sfx('money');
          game.hud.notify(`Entrega ${i + 1}/3 completada. ¡Olé ese aceite!`, 'ok', 3);
        }
        m.timer(null);
        yield m.say('Paco', '¡Así me gusta! La próxima vez te invito a unas tostás con aceite.', 3.5);
      },
    });
    // ============ 3. Piporros para la feria
    const field = this.game.world.groundData.parcels.filter((p) => p.type === 'cultivo').sort((a, b) => Math.hypot(a.cx - 600, a.cz - 700) - Math.hypot(b.cx - 600, b.cz - 700))[0];
    const fieldPt = field ? P.onRoad({ x: field.cx, z: field.cz }) : P.onRoad({ x: 700, z: 700 });
    const feria = P.onRoad(P.pabellon || { x: 1074, z: 423 });
    defs.push({
      id: 'piporros', title: 'Piporros para la feria', letter: 'J', requires: 'bienvenida', giver: { name: 'Juani', at: P.mercado, desc: { gender: 'f', skin: 1, hair: 3, hairStyle: 'coleta', top: '#e87aa4', topStyle: 'blouse', bottom: '#1f2d44', bottomStyle: 'jeans', shoes: '#1d1f24' } },
      reward: 300,
      *script(m) {
        yield m.cut(P.mercado, 'Juani', [
          ['¿Sabes por qué nos llaman piporros? Por los melones largos que se criaban aquí.', 3.6],
          ['Para la caseta de la feria necesito un remolque de piporros del campo de mi primo.', 3.4],
          ['Coge su tractor y tráelos al recinto ferial antes de que cierre el ayuntamiento.', 3.2],
        ]);
        yield m.goTo(fieldPt, 10, { text: 'Ve al <b>campo de piporros</b>, en las afueras.' });
        const tr = m.spawnCar('tractor', P.onRoad({ x: fieldPt.x + 6, z: fieldPt.z + 6 }), '#2e7d32');
        yield m.getIn((v) => v === tr, 'Sube al <b>tractor</b>.', tr);
        m.timer(300, 'Los piporros se han calentado al sol. Misión fallida.');
        m.failIf(() => tr.dead, 'El tractor ha acabado hecho chatarra.');
        yield m.goTo(feria, 10, { text: 'Lleva los piporros al <b>recinto ferial</b>.', vehicle: tr, stop: true });
        m.timer(null);
        yield m.say('Juani', '¡Pero qué piporros más hermosos! Esta feria va a ser sonada.', 3.5);
      },
    });
    // ============ 4. Carrera de la Noria
    const raceCps = this.raceRoute(P);
    defs.push({
      id: 'carrera', title: 'La carrera de La Noria', letter: 'C', requires: 'aceite', giver: { name: 'Chema', at: P.estadio ? P.onRoad(P.estadio) : P.plaza, desc: { gender: 'm', skin: 0, hair: 4, hairStyle: 'tupe', top: '#1d1f24', topStyle: 'tshirt', bottom: '#2f4f7a', bottomStyle: 'jeans', shoes: '#f2f2f2', accessory: 'gafas' } },
      reward: 500,
      *script(m) {
        yield m.cut(P.estadio || P.plaza, 'Chema', [
          [G('¿Tú eres el que va de rápido por el pueblo? A ver si es verdad.', '¿Tú eres la que va de rápido por el pueblo? A ver si es verdad.'), 3.2],
          ['Salida en el estadio de La Noria, meta en el pantano de San Roque. Sin trampas.', 3.6],
        ]);
        const start = raceCps[0];
        const mine = m.spawnCar('lusitano', start, '#e6b422');
        yield m.getIn((v) => v === mine, 'Sube a tu coche de carreras.', mine);
        const racers = m.spawnRacers(start, 3);
        yield m.countdown(racers);
        const res = yield m.race(raceCps, racers, mine);
        if (res !== 1) { m.fail(`Has quedado en ${res}ª posición.`); return; }
        yield m.say('Chema', '¡Madre mía, qué manera de trazar la curva del pantano! Chapó.', 3.5);
      },
    });
    // ============ 5. Romería de San Isidro
    defs.push({
      id: 'romeria', title: 'Romería de San Isidro', letter: 'M', requires: 'piporros', giver: { name: 'Manolo y Pepa', at: P.onRoad(P.sanGines || P.plaza), desc: { gender: 'm', elderly: true, skin: 2, hair: 6, hairStyle: 'calvo', top: '#c9b89a', topStyle: 'cardigan', bottom: '#5b3a26', bottomStyle: 'pants', shoes: '#3a2a1c', accessory: 'boina', accessoryColor: '#2a2a2a' } },
      reward: 300,
      *script(m) {
        yield m.cut(P.sanGines || P.plaza, 'Manolo', [
          ['Todos los años subimos a la ermita de San Isidro, junto al pantano.', 3.2],
          ['Pero a Pepa ya le duelen las rodillas. ¿Nos llevas? Despacito, que me mareo.', 3.6],
        ]);
        const car = m.spawnCar('tarteso', P.onRoad({ x: (P.sanGines || P.plaza).x + 10, z: (P.sanGines || P.plaza).z + 8 }), '#c9b89a');
        yield m.getIn((v) => v === car, 'Sube al <b>Tarteso</b> de Manolo.', car);
        m.failIf(() => car.health < 600, '¡Manolo y Pepa se han bajado espantados del coche!');
        m.failIf(() => game.police.wanted > 0, 'Con la Guardia Civil detrás, Pepa no quiere ni oír hablar de ti.');
        yield m.say('Pepa', 'Ay, Manolo, qué coche más bonito. Huele a nuevo.', 3);
        yield m.goTo(P.onRoad(P.ermita || P.pantano), 12, { text: 'Lleva a Manolo y Pepa a la <b>Ermita de San Isidro</b> sin sustos.', vehicle: car, stop: true });
        yield m.say('Manolo', 'Muchas gracias, criatura. San Isidro te lo pagará. Y yo también, toma.', 3.5);
      },
    });
    // ============ 6. Los de verde
    defs.push({
      id: 'verde', title: 'Los de verde', letter: 'A', requires: 'carrera', giver: { name: 'Adolfo', at: P.onRoad(P.poligono || P.plaza), desc: { gender: 'm', skin: 1, hair: 0, hairStyle: 'rapado', top: '#1f2d44', topStyle: 'hoodie', bottom: '#1d1f24', bottomStyle: 'pants', shoes: '#1d1f24' } },
      reward: 600,
      *script(m) {
        yield m.cut(P.poligono || P.plaza, 'Adolfo', [
          ['Tengo un problemilla: la Guardia Civil busca a quien les rayó el patrulla… y te han visto conmigo.', 3.8],
          ['Si te ven, sal pitando. Piérdelos… o, si vas en coche, pásate por el taller de chapa y pintura.', 3.8],
        ]);
        game.police.setLevel(3);
        yield m.escape('Da esquinazo a la <b>Guardia Civil</b>.');
        yield m.say('Adolfo', '¡Eres un fenómeno! Aquí no ha pasado nada, ¿eh?', 3);
      },
    });
    return defs;
  }

  raceRoute(P) {
    // checkpoints from the stadium through the centre to the reservoir
    const pts = [P.estadio || { x: -835, z: 212 }, { x: -520, z: 230 }, P.pilar || { x: -26, z: 310 }, { x: 250, z: 380 }, { x: 544, z: 400 }, P.pabellon || { x: 1074, z: 423 }, { x: 1500, z: 600 }, P.pantano ? { x: P.pantano.x - 60, z: P.pantano.z - 40 } : { x: 1800, z: 950 }];
    return pts.map((p) => P.onRoad(p));
  }

  // ------------------------------------------------------------ markers for mission givers
  placeMarkers() {
    for (const m of this.markers) { this.root.remove(m.group); this.game.hud.removeBlip('m_' + m.def.id); if (m.npc) this.removeNpc(m.npc); }
    this.markers = [];
    for (const def of this.defs) {
      if (this.done.has(def.id)) continue;
      if (def.requires && !this.done.has(def.requires)) continue;
      const at = def.giver.at;
      if (!at) continue;
      const group = new THREE.Group();
      const cyl = new THREE.Mesh(this.cpGeo, this.cpMat);
      cyl.scale.set(1.1, 2.2, 1.1);
      group.add(cyl);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(def.letter), depthTest: false, transparent: true }));
      icon.scale.setScalar(1.1);
      icon.position.y = 3.2;
      icon.renderOrder = 10;
      group.add(icon);
      group.position.set(at.x, 0.05, at.z);
      this.root.add(group);
      const npc = this.spawnNpc(def.giver.desc, at.x + 2.2, at.z + 1.2, at);
      this.markers.push({ def, group, icon, npc });
      this.game.hud.setBlip('m_' + def.id, { x: at.x, z: at.z, label: def.letter, color: '#f4c430', name: def.title, edge: true });
    }
  }
  spawnNpc(desc, x, z, look) {
    const c = this.game.chars.create(desc);
    c.object.position.set(x, 0, z);
    c.object.rotation.y = Math.atan2(look.x - x, look.z - z);
    this.game.scene.add(c.object);
    c.setBase('talk');
    this.npcs = this.npcs || [];
    this.npcs.push(c);
    return c;
  }
  removeNpc(c) { this.game.scene.remove(c.object); c.dispose(); this.npcs = this.npcs.filter((n) => n !== c); }
  // missions only exist in the normal game mode
  setVisible(on) {
    this.root.visible = on;
    for (const c of this.npcs || []) c.object.visible = on;
    for (const m of this.markers) { const b = this.game.hud.blips.get('m_' + m.def.id); if (b) b.hidden = !on; }
  }

  // ------------------------------------------------------------ Tesoros de Tarteso (collectibles)
  setupCollectibles() {
    const rnd = mulberry32(1978);
    const found = new Set(this.game.save.treasures || []);
    const spots = [];
    const P = this.places;
    const add = (p, name) => { if (p) spots.push({ x: p.x, z: p.z, name }); };
    add(P.tower && { x: P.tower.x + 7, z: P.tower.z + 4 }, 'junto a la torre de Santa María');
    add(P.sanGregorio, 'en la Plaza de San Gregorio');
    add(P.pilar, 'en el Parque del Pilar');
    add(P.sanGines, 'en el Parque San Ginés');
    add(P.ermita && { x: P.ermita.x - 4, z: P.ermita.z + 6 }, 'en la Ermita de San Isidro');
    add(P.pantano && { x: P.pantano.x + 30, z: P.pantano.z - 50 }, 'en el pinar del pantano');
    add(P.estadio, 'en el estadio de La Noria');
    add(P.chamizo, 'frente a la casa de Luis Chamizo');
    add(P.coop, 'en la cooperativa');
    add(P.poligono, 'en el polígono La Alberca');
    // plus alleys across town
    const edges = this.map.edges.filter((e) => e.drive && !e.dirt && this.map.inTown(e.pts[0], e.pts[1]) && e.len > 30);
    while (spots.length < 20 && edges.length) {
      const e = edges[Math.floor(rnd() * edges.length)];
      const pt = this.map.sample(e, e.len * (0.2 + rnd() * 0.6), {});
      const off = e.w / 2 + 0.6;
      const x = pt.x - pt.dz * off, z = pt.z + pt.dx * off;
      if (this.map.buildingAt(x, z) || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 120)) continue;
      spots.push({ x, z, name: e.name ? 'en ' + e.name : 'en una calle del pueblo' });
    }
    // fix positions onto free ground
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8b53a, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a08, emissiveIntensity: 0.6 });
    this.treasures = [];
    spots.forEach((s, i) => {
      if (found.has(i)) return;
      let x = s.x, z = s.z;
      for (let k = 0; k < 20 && this.map.buildingAt(x, z); k++) { x += (rnd() - 0.5) * 6; z += (rnd() - 0.5) * 6; }
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 1.1, z);
      m.castShadow = true;
      this.root.add(m);
      this.treasures.push({ i, x, z, mesh: m, name: s.name });
    });
    this.treasureTotal = spots.length;
    this.treasureFound = found.size;
  }

  // ------------------------------------------------------------ chapa y pintura (Pay'n'Spray)
  setupShop() {
    const P = this.places;
    const base = P.poligono || { x: 1482, z: 353 };
    const q = this.map.nearestEdge(base.x, base.z, 200, (e) => e.drive && !e.blocked && !e.dirt);
    if (!q) return;
    this.shop = { x: q.x, z: q.z };
    this.game.hud.setBlip('shop', { x: q.x, z: q.z, label: '🔧', color: '#7ec8ff', name: 'Chapa y pintura', edge: false });
    const g = new THREE.Mesh(this.cpGeo, new THREE.MeshBasicMaterial({ map: glowTexture('90,190,255'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    g.scale.set(3.2, 1.2, 3.2);
    g.position.set(q.x, 0.05, q.z);
    this.root.add(g);
    this.shopMesh = g;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    const p = g.player;
    const t = performance.now() * 0.001;
    this.cooldown -= dt;
    // idle markers
    for (const mk of this.markers) {
      mk.icon.position.y = 3.2 + Math.sin(t * 2) * 0.15;
      mk.group.visible = !this.active;
      if (!this.active && this.cooldown <= 0 && g.state === 'play') {
        const d = Math.hypot(p.pos.x - mk.group.position.x, p.pos.z - mk.group.position.z);
        if (d < 1.8 && !p.vehicle) this.start(mk.def);
        else if (d < 1.8 && p.vehicle && p.vehicle.vel < 2) g.hud.help('Bájate del vehículo (' + g.input.key('F', 3, 'Bajar') + ') para empezar la misión.', 3);
      }
    }
    for (const n of this.npcs || []) n.update(dt, 0, {});
    // treasures
    for (let i = this.treasures.length - 1; i >= 0; i--) {
      const tr = this.treasures[i];
      tr.mesh.rotation.y = t * 1.6;
      tr.mesh.position.y = 1.1 + Math.sin(t * 2.4 + tr.i) * 0.12;
      if (Math.hypot(p.pos.x - tr.x, p.pos.z - tr.z) < 1.8) {
        this.root.remove(tr.mesh);
        this.treasures.splice(i, 1);
        this.treasureFound++;
        g.save.treasures = [...(g.save.treasures || []), tr.i];
        g.persist();
        const found = Math.round(100 * PERK.luck);
        p.money += found;
        g.audio.sfx('pickup');
        g.hud.notify(`Tesoro de Tarteso ${this.treasureFound}/${this.treasureTotal} encontrado ${tr.name}. +${found} €`, 'gold', 5);
        if (this.treasureFound === this.treasureTotal) { p.money += 2500; g.hud.banner('¡TODOS LOS TESOROS!', g.gx('Eres el mejor arqueólogo de las Vegas', 'Eres la mejor arqueóloga de las Vegas') + ' · +2.500 €', 'pass', 5); }
      }
    }
    // shop
    if (this.shop && p.vehicle && Math.hypot(p.pos.x - this.shop.x, p.pos.z - this.shop.z) < 4 && p.vehicle.vel < 4 && !this.shopBusy) this.useShop();
    // active mission
    if (this.active) this.tick(dt);
  }

  useShop() {
    const g = this.game, p = g.player, v = p.vehicle;
    if (p.money < 100) { if (!(this.shopNagT > g.time)) { this.shopNagT = g.time + 4; g.hud.help('El taller cuesta 100 €. Vuelve cuando tengas dinero.', 3); } return; } // once, not every frame
    if (v.spec.twoWheel) { if (!(this.shopNagT > g.time)) { this.shopNagT = g.time + 4; g.hud.help('En el taller solo pintan coches.', 3); } return; }
    this.shopBusy = true;
    g.hud.banner('CHAPA Y PINTURA', 'Como nuevo · −100 €', 'info', 2.6);
    g.audio.sfx('money');
    p.money -= 100;
    const colors = ['#c8202a', '#2f5fa8', '#1c1c20', '#f2f2ee', '#3c6e4a', '#e6b422', '#7d4fa0'];
    v.color = colors[Math.floor(Math.random() * colors.length)];
    g.fleet.renderer.setColor(v, v.color);
    v.health = 1000; v.fire = 0; v.dead = false;
    if (g.police.wanted > 0) { g.police.wanted = 0; g.police.heat = 0; g.hud.notify('Con la pintura nueva nadie te reconoce.', 'ok'); }
    setTimeout(() => { this.shopBusy = false; }, 6000);
  }

  // ------------------------------------------------------------ mission runtime
  start(def) {
    const g = this.game;
    this.active = { def, gen: def.script(this.api()), task: null, fails: [], timer: null, failMsg: '', vehicles: [], t: 0 };
    g.hud.banner(def.title.toUpperCase(), '', 'title', 2.8);
    g.audio.sfx('mission_start');
    const mk = this.markers.find((m) => m.def === def);
    if (mk && mk.npc) mk.npc.setBase('talk');
    this.next();
  }
  next(val) {
    const a = this.active;
    if (!a) return;
    const r = a.gen.next(val);
    if (r.done) { if (a.failMsg) this.fail(a.failMsg); else this.complete(); return; }
    a.task = r.value;
    if (a.task && a.task.begin) a.task.begin();
  }
  tick(dt) {
    const a = this.active;
    const g = this.game;
    a.t += dt;
    for (const f of a.fails) if (f.cond()) { this.fail(f.msg); return; }
    if (a.timer !== null) {
      a.timer -= dt;
      g.hud.timer(a.timer);
      if (a.timer <= 0) { this.fail(a.timerMsg); return; }
    }
    if (g.player.mode === 'dead' || g.player.mode === 'busted') { this.fail(g.player.mode === 'dead' ? 'Has acabado en el centro de salud.' : 'Te ha detenido la Guardia Civil.'); return; }
    const t = a.task;
    if (!t) return;
    const res = t.update(dt);
    if (res !== undefined && res !== false) { if (t.end) t.end(); this.next(res === true ? undefined : res); }
  }
  complete() {
    const g = this.game;
    const a = this.active;
    this.cleanup();
    this.done.add(a.def.id);
    g.save.done = [...this.done];
    const reward = Math.round(a.def.reward * PERK.pay); // Carmen gets paid better
    g.player.money += reward;
    g.persist();
    g.hud.banner('¡MISIÓN SUPERADA!', `${a.def.title} · +${reward} €`, 'pass', 4.5);
    g.audio.sfx('mission_pass');
    this.cooldown = 3;
    setTimeout(() => this.placeMarkers(), 800);
    const nextM = this.defs.find((d) => !this.done.has(d.id) && (!d.requires || this.done.has(d.requires)));
    if (nextM) setTimeout(() => g.hud.notify(`Nueva misión disponible: ${nextM.title} (${nextM.giver.name}).`, 'info', 7), 5000);
    else setTimeout(() => g.hud.notify('¡Has completado todas las misiones! Busca los Tesoros de Tarteso o recorre el pueblo.', 'gold', 9), 5000);
  }
  fail(msg) {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    this.cleanup();
    g.hud.banner('MISIÓN FALLIDA', msg || '', 'fail', 4);
    g.audio.sfx('mission_fail');
    this.cooldown = 6;
    setTimeout(() => this.placeMarkers(), 1000);
  }
  cancel() { if (this.active) this.fail('Misión cancelada.'); }
  cleanup() {
    const g = this.game;
    const a = this.active;
    if (a && a.task && a.task.end) a.task.end();
    this.active = null;
    this.checkpoint.visible = false; this.arrow.visible = false;
    g.hud.objectiveText(null); g.hud.subtitle(null); g.hud.timer(null);
    g.hud.objective = null;
    g.cam.endCinematic();
    g.hud.removeBlip('obj');
    if (a) for (const v of a.vehicles) { v.keep = false; if (v.missionRacer) { v.ai = null; v.ctrl = false; } }
    for (const r of this.racers || []) { if (!r.removed) g.fleet.remove(r); }
    this.racers = [];
    g.input.enabled = true;
  }

  // ------------------------------------------------------------ task API for scripts
  api() {
    const self = this, g = this.game;
    return {
      say(who, text, dur = 3) {
        let t = 0;
        return { begin() { g.hud.subtitle(who, text); }, update(dt) { t += dt; return t > dur || (t > 0.6 && g.input.skip); }, end() { g.hud.subtitle(null); } };
      },
      cut(at, who, lines) {
        // cinematic around the giver
        let t = 0, i = 0, lt = 0;
        const look = new THREE.Vector3(at.x, 1.6, at.z);
        const pl = g.player.pos;
        const dx = pl.x - at.x, dz = pl.z - at.z, l = Math.hypot(dx, dz) || 1;
        let from = new THREE.Vector3(at.x + (dx / l) * 6 + (-dz / l) * 3, 2.6, at.z + (dz / l) * 6 + (dx / l) * 3);
        let to = new THREE.Vector3(at.x + (dx / l) * 4.2 + (-dz / l) * 1.6, 2.0, at.z + (dz / l) * 4.2 + (dx / l) * 1.6);
        // a wall in the way: the other side, or closer in
        const clear = (v) => g.map.collider.raycast(at.x, at.z, v.x, v.z, 1.6, v.y) > 0.98 && !g.map.buildingAt(v.x, v.z);
        if (!clear(from) || !clear(to)) {
          const alt = [new THREE.Vector3(at.x + (dx / l) * 6 - (-dz / l) * 3, 2.6, at.z + (dz / l) * 6 - (dx / l) * 3), new THREE.Vector3(at.x + (dx / l) * 4.2 - (-dz / l) * 1.6, 2.0, at.z + (dz / l) * 4.2 - (dx / l) * 1.6)];
          if (clear(alt[0]) && clear(alt[1])) { from = alt[0]; to = alt[1]; }
          else { from = new THREE.Vector3(at.x + (dx / l) * 3.2, 1.9, at.z + (dz / l) * 3.2); to = new THREE.Vector3(at.x + (dx / l) * 2.6, 1.75, at.z + (dz / l) * 2.6); }
        }
        const total = lines.reduce((a, b) => a + b[1], 0);
        return {
          begin() { g.cam.startCinematic(from, look, total + 0.5, to); g.hud.subtitle(who, lines[0][0]); g.ui.letterbox.classList.add('on'); },
          update(dt) {
            t += dt; lt += dt;
            if (lt > lines[i][1] || (lt > 0.5 && g.input.skip)) { i++; lt = 0; if (i >= lines.length) return true; g.hud.subtitle(who, lines[i][0]); }
            return false;
          },
          end() { g.cam.endCinematic(); g.hud.subtitle(null); g.ui.letterbox.classList.remove('on'); },
        };
      },
      towerShot() {
        const tw = self.game.world.landmarks.poi.churchTower;
        if (!tw) return { update: () => true };
        let t = 0;
        // try 16 bearings: a clear line from the camera to the belfry and to the foot of the tower, open ground to stand
        // on, and (by day) the sun behind the camera so the stone is lit
        const col = g.map.collider, sun = g.sky.sunDir;
        let best = null, bs = -Infinity;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
          for (const R of [26, 34, 42]) {
            const cx = tw.x + sx * R, cz = tw.z + sz * R;
            if (g.map.buildingAt(cx, cz)) continue;
            const clearTop = col.raycast(cx, cz, tw.x - sx * 2, tw.z - sz * 2, 4, 26) > 0.97;
            const clearMid = col.raycast(cx, cz, tw.x - sx * 2, tw.z - sz * 2, 3, 12) > 0.9;
            if (!clearTop) continue;
            const lit = sun && sun.y > 0 ? sx * sun.x + sz * sun.z : 0;
            const sc = (clearMid ? 2 : 0) + lit * 1.5 - Math.abs(R - 32) * 0.03;
            if (sc > bs) { bs = sc; best = { sx, sz, R }; }
          }
        }
        const b = best || { sx: 0.77, sz: 0.63, R: 30 };
        const side = { x: -b.sz, z: b.sx }; // a gentle arc round the tower while the camera rises
        const from = new THREE.Vector3(tw.x + b.sx * b.R + side.x * 5, 2.6, tw.z + b.sz * b.R + side.z * 5), to = new THREE.Vector3(tw.x + b.sx * (b.R - 6) - side.x * 3, 11, tw.z + b.sz * (b.R - 6) - side.z * 3);
        return {
          begin() { g.cam.startCinematic(from, new THREE.Vector3(tw.x, 24, tw.z), 4.5, to); g.ui.letterbox.classList.add('on'); g.world.landmarks.bellSwing = 1; g.audio.bells(2); },
          update(dt) { t += dt; return t > 4.5 || (t > 0.8 && g.input.skip); },
          end() { g.cam.endCinematic(); g.ui.letterbox.classList.remove('on'); },
        };
      },
      goTo(pt, r, opts = {}) {
        return {
          begin() {
            g.hud.objectiveText(opts.text || 'Ve al punto marcado.');
            g.hud.objective = pt;
            g.hud.setBlip('obj', { x: pt.x, z: pt.z, label: '', color: '#f4c430', edge: true });
            self.checkpoint.visible = true;
            self.checkpoint.position.set(pt.x, 0.05, pt.z);
            self.checkpoint.scale.set(r * 0.5 + 1, 3, r * 0.5 + 1);
            g.hud.routeT = 0;
          },
          update() {
            const p = g.player;
            if (opts.vehicle) {
              const need = opts.vehicle === true ? p.vehicle : opts.vehicle;
              if (!p.vehicle || (opts.vehicle !== true && p.vehicle !== need)) { g.hud.help('Vuelve al vehículo para continuar.', 1); return false; }
            }
            const d = Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z);
            if (d < r && (!opts.stop || !p.vehicle || p.vehicle.vel < 3)) return true;
            if (d < r && opts.stop) g.hud.help('Para el vehículo en la marca.', 1);
            return false;
          },
          end() { self.checkpoint.visible = false; g.hud.removeBlip('obj'); g.hud.objective = null; g.hud.objectiveText(null); },
        };
      },
      getIn(filter, text, v) {
        return {
          begin() {
            g.hud.objectiveText(text);
            if (v) { g.hud.setBlip('obj', { x: v.x, z: v.z, label: '', color: '#6fc0ff', edge: true }); self.arrow.visible = true; g.hud.objective = { x: v.x, z: v.z }; }
          },
          update(dt) {
            if (v) { self.arrow.position.set(v.x, v.spec.H + 1.4 + Math.sin(performance.now() * 0.006) * 0.2, v.z); self.arrow.rotation.y += dt * 2; const b = g.hud.blips.get('obj'); if (b) { b.x = v.x; b.z = v.z; } }
            if (v && v.dead) { self.fail('El vehículo ha quedado destrozado.'); return false; }
            return !!(g.player.vehicle && filter(g.player.vehicle));
          },
          end() { self.arrow.visible = false; g.hud.removeBlip('obj'); g.hud.objective = null; g.hud.objectiveText(null); },
        };
      },
      spawnCar(model, at, color) {
        const spot = g.fleet.freeSpotNear(at.x, at.z, model);
        const other = g.fleet.nearest(spot.x, spot.z, 3);
        if (other && other.driver !== 'player' && !other.keep) g.fleet.remove(other);
        const v = g.fleet.spawn(model, spot.x, spot.z, spot.heading, color, { sleeping: true, keep: true });
        v.locked = false; v.opened = true;
        self.active.vehicles.push(v);
        return v;
      },
      timer(sec, msg) { self.active.timer = sec; self.active.timerMsg = msg; if (sec === null) g.hud.timer(null); },
      failIf(cond, msg) { self.active.fails.push({ cond, msg }); },
      fail(msg) { self.active.failMsg = msg; },
      escape(text) {
        return {
          begin() { g.hud.objectiveText(text); },
          update() { return g.police.wanted === 0; },
          end() { g.hud.objectiveText(null); },
        };
      },
      spawnRacers(start, n) {
        const rs = [];
        const q = self.map.nearestEdge(start.x, start.z, 60, (e) => e.drive && !e.blocked);
        for (let i = 0; i < n; i++) {
          const models = ['veton', 'tarteso', 'lusitano'];
          const s = self.map.sample(q.edge, clamp(q.s + (i + 1) * 7, 0, q.edge.len), {});
          const v = g.fleet.spawn(models[i % 3], s.x + s.dz * (i % 2 ? 1.5 : -1.5), s.z - s.dx * (i % 2 ? 1.5 : -1.5), Math.atan2(s.dx, s.dz), ['#1c1c20', '#b8302a', '#2f5fa8'][i], { sleeping: false, keep: true });
          if (!v) continue;
          v.missionRacer = true; v.locked = true; v.ctrl = true;
          v.race = { cp: 1, skill: 0.84 + i * 0.05, done: false };
          rs.push(v);
        }
        self.racers = rs;
        return rs;
      },
      countdown(racers) {
        let t = 0, last = 4;
        return {
          begin() { g.hud.objectiveText('Prepárate…'); },
          update(dt) {
            t += dt;
            for (const r of racers) { r.throttle = 0; r.brake = 1; }
            const n = 3 - Math.floor(t);
            if (n !== last && n > 0) { last = n; g.hud.banner(String(n), '', 'count', 0.9); g.audio.sfx('checkpoint'); }
            if (g.player.vehicle) { g.player.vehicle.throttle = 0; }
            if (t > 3) { g.hud.banner('¡YA!', '', 'count', 1); g.audio.sfx('mission_start'); return true; }
            return false;
          },
          end() { g.hud.objectiveText(null); },
        };
      },
      race(cps, racers, mine) {
        let cp = 1;
        const finishOrder = [];
        return {
          begin() { this.show(); },
          show() {
            const pt = cps[cp];
            self.checkpoint.visible = true;
            self.checkpoint.position.set(pt.x, 0.05, pt.z);
            self.checkpoint.scale.set(6, 4, 6);
            g.hud.objective = pt;
            g.hud.setBlip('obj', { x: pt.x, z: pt.z, label: String(cp), color: '#f4c430', edge: true });
            g.hud.objectiveText(`Carrera: control <b>${cp}/${cps.length - 1}</b> · Posición <b>${this.position()}</b>`);
          },
          position() {
            const score = (cpi, x, z) => cpi * 10000 - Math.hypot(cps[Math.min(cpi, cps.length - 1)].x - x, cps[Math.min(cpi, cps.length - 1)].z - z);
            const me = score(cp, g.player.pos.x, g.player.pos.z);
            let pos = 1 + finishOrder.length;
            for (const r of racers) if (!r.race.done && score(r.race.cp, r.x, r.z) > me) pos++;
            return pos;
          },
          update(dt) {
            if (!g.player.vehicle) { g.hud.help('¡Vuelve al coche!', 1); }
            // racers AI: drive through checkpoints
            for (const r of racers) {
              if (r.race.done || r.dead) continue;
              const pt = cps[r.race.cp];
              const d = Math.hypot(r.x - pt.x, r.z - pt.z);
              if (d < 9) { r.race.cp++; if (r.race.cp >= cps.length) { r.race.done = true; finishOrder.push(r); continue; } }
              self.driveRacer(r, cps[r.race.cp], dt);
            }
            const pt = cps[cp];
            const d = Math.hypot(g.player.pos.x - pt.x, g.player.pos.z - pt.z);
            if (d < 9 && g.player.vehicle) {
              cp++;
              g.audio.sfx('checkpoint');
              if (cp >= cps.length) { return 1 + finishOrder.length; }
              this.show();
            }
            if (Math.floor(performance.now() / 500) % 2) g.hud.objectiveText(`Carrera: control <b>${cp}/${cps.length - 1}</b> · Posición <b>${this.position()}</b>`);
            return false;
          },
          end() { self.checkpoint.visible = false; g.hud.removeBlip('obj'); g.hud.objective = null; g.hud.objectiveText(null); },
        };
      },
    };
  }

  driveRacer(r, pt, dt) {
    const map = this.map;
    const R = r.race;
    if (!R.path || R.pathCp !== R.cp || (R.pathT -= dt) <= 0) {
      R.pathT = 5; R.pathCp = R.cp;
      R.path = map.routeFrom(r.x, r.z, r.heading, pt.x, pt.z, { ignoreOneway: true });
      R.seg = 0;
    }
    const f = followRoute(R, r.x, r.z, r.heading, Math.abs(r.speed), this._fr || (this._fr = {}));
    const top = r.spec.top * R.skill * 0.85;
    driveToward(r, f.x, f.z, Math.min(top, turnSpeed(f.turn, top)), dt);
    if (R.off > 12) R.pathT = 0; // strayed: re-plan
    // recovery: back up, and if still stuck far from the player, respawn further along the route
    if (r.vel < 1.2 && !R.rev) R.stuck = (R.stuck || 0) + dt; else if (r.vel > 3) R.stuck = 0;
    if (R.stuck > 2.2 && !R.rev) { R.rev = 1.3; R.revSteer = -Math.sign(r.steerIn || 1); R.stuck = 0; R.fails = (R.fails || 0) + 1; }
    if (R.rev > 0) {
      R.rev -= dt; r.throttle = 0; r.brake = 1; r.steerIn = R.revSteer;
      if (R.rev <= 0) R.rev = 0;
    }
    const pl = this.game.player.pos;
    if (R.fails >= 3 && Math.hypot(r.x - pl.x, r.z - pl.z) > 35) {
      const P = R.path, i = Math.min(P.length / 2 - 2, (R.seg || 0) + 2);
      r.x = P[i * 2]; r.z = P[i * 2 + 1]; r.heading = Math.atan2(P[i * 2 + 2] - r.x, P[i * 2 + 3] - r.z);
      r.vx = r.vz = r.w = 0; R.fails = 0; R.seg = i;
    }
  }

}
