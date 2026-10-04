// The public buildings of Guareña you can walk into (besides Santa María: church.js): the Ayuntamiento with its
// Salón de Plenos, the theatre of the Casa de la Cultura, the Mercado de Abastos, the Pabellón La Encina, the workshop
// and showroom of Agrícola Corbacho, the church of San Gregorio. buildVenue(kind) makes the inside (venuekit.js);
// VenueLife puts the people in it: who works there, who comes, what they say.
import * as THREE from 'three';
import { INTERIOR_ORIGIN, boxGeo, planeGeo, std, texMat } from './housekit.js';
import { Kit, canvasTexture, textTexture } from './venuekit.js';
import { stoneCanvas } from './textures.js';
import { paintingTexture } from './paintings.js';
import { mulberry32 } from './util.js';
import { statue } from './statues.js';
import { goldEnv, goldTexture } from './church.js';
import { calTexture } from './churchtex.js';

export function buildVenue(kind, seed = 1, origin = INTERIOR_ORIGIN) {
  const make = { ayto: ayuntamiento, teatro, mercado, pabellon, corbacho, sangregorio }[kind];
  const h = make ? make(origin, seed) : ayuntamiento(origin, seed);
  h.venue = kind;
  return h;
}

// ---------------------------------------------------------------- pictures for the walls (canvas)
const posterTex = (key, title, sub, bg, fg, accent) => canvasTexture('poster:' + key, 256, 360, (x, W, H) => {
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = accent; x.fillRect(0, 0, W, 40); x.fillRect(0, H - 26, W, 26);
  x.fillStyle = fg; x.textAlign = 'center';
  x.font = 'bold 30px Georgia, serif'; title.split('\n').forEach((t, i) => x.fillText(t, W / 2, 100 + i * 36));
  x.font = '17px Arial'; sub.split('\n').forEach((t, i) => x.fillText(t, W / 2, 200 + i * 24));
  x.font = 'bold 12px Arial'; x.fillText('AYUNTAMIENTO DE GUAREÑA', W / 2, H - 9);
});
const bandoTex = (key, lines) => canvasTexture('bando:' + key, 256, 340, (x, W, H) => {
  x.fillStyle = '#f6f2e6'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2a2420'; x.textAlign = 'center'; x.font = 'bold 22px Georgia, serif'; x.fillText('B A N D O', W / 2, 40);
  x.font = '13px Georgia, serif'; x.textAlign = 'left';
  lines.forEach((t, i) => x.fillText(t, 22, 80 + i * 20));
  x.fillStyle = 'rgba(160,40,40,0.8)'; x.beginPath(); x.arc(W - 50, H - 50, 26, 0, 6.283); x.fill(); // the seal
  x.fillStyle = '#2a2420'; x.font = 'italic 13px Georgia, serif'; x.fillText('El Alcalde', 30, H - 40);
});
const escudoTex = () => canvasTexture('escudo', 256, 256, (x) => { x.drawImage(stoneCanvas('escudo', 256), 0, 0); });

// ================================================================ the Ayuntamiento (Plaza de España, 1)
// Ground floor: the hall behind the arcade (granite floor, the information counter, the notice board with the
// edicts, benches, the offices' doors), a staircase of two flights. Upstairs: the Salón de Plenos over the arcade
// — the presidency on its dais under the coat of arms and the flags, the councillors' benches, the public, portraits,
// chandeliers — its five balcony doors onto the plaza.
function ayuntamiento(origin, seed) {
  const K = new Kit(origin, seed), B = K.B, m = K.m;
  const W = 16, hw = 8, D = 15, H1 = 4.4, F2 = 4.6, H2 = 4.2;
  K.upstairs(F2);
  const wall = B.mat('a_wall', () => std(0xf2ede2, { roughness: 0.92 }));
  const wall2 = B.mat('a_wall2', () => std(0xe8dcc4, { roughness: 0.9 }));
  const panel = B.mat('a_panel', () => texMat('dark_wood', 0xc89a70, 0.55));
  const gran = B.mat('a_floor', () => { const mm = texMat('floor_tiles_06', 0xe6e0d4, 0.5); return mm; });
  const parquet = B.mat('a_parquet', () => texMat('herringbone_parquet', 0xffffff, 0.45));
  const ceil = B.mat('a_ceil', () => std(0xfaf8f2, { roughness: 0.95 }));
  const velvet = B.mat('a_velvet', () => std(0x7a1420, { roughness: 1 }));
  const green = B.mat('a_baize', () => std(0x2e5a3a, { roughness: 1 }));
  // ---- ground floor: floor, ceiling, walls (the door and two windows onto the arcade)
  K.floor(gran, -hw, 0, hw, D, 0, 1.2);
  K.wall(wall, -hw, 0, hw, 0, H1, [[hw - 1.1, hw + 1.1, 0, 3.3], [hw - 5.4, hw - 3.8, 0.9, 3.1], [hw + 3.8, hw + 5.4, 0.9, 3.1]]);
  K.wall(wall, -hw, 0, -hw, D, H1); K.wall(wall, hw, 0, hw, D, H1); K.wall(wall, -hw, D, hw, D, H1);
  B.segs.push([K.ox - 1.1, K.oz + 0.06, K.ox + 1.1, K.oz + 0.06, 3]); // (the door: out by its prompt)
  for (const sx of [-1, 1]) K.window(sx * 4.6, 0.02, 0, 1.6, 2.2, 0.9);
  // the street door from inside: two panelled leaves
  for (const sx of [-1, 1]) { K.add(m.wood, boxGeo(1.08, 3.25, 0.07, 1), sx * 0.555, 1.625, 0.05); for (let k = 0; k < 3; k++) K.add(m.wood, boxGeo(0.8, 0.8, 0.02, 1), sx * 0.555, 0.6 + k * 1.05, 0.1); K.add(m.brass, new THREE.SphereGeometry(0.04, 8, 6), sx * 0.12, 1.1, 0.12); }
  // the information counter (right) and the clerk's chair behind it
  K.solid(panel, 3.6, 1.05, 0.6, 5.6, 0, 4.4); K.box(m.granite, 3.8, 0.05, 0.7, 5.6, 1.05, 4.4);
  K.picture(textTexture('info', 'INFORMACIÓN · REGISTRO', { w: 512, h: 96, bg: '#1f3a5a', fg: '#ffffff', font: 'bold 40px Arial' }), 5.6, 2.6, D - 0.09, Math.PI, 2.6, 0.5, null);
  K.chair(5.6, 5.3, Math.PI, m.wood, velvet);
  K.box(m.dark, 0.5, 0.35, 0.35, 4.8, 1.1, 4.45); K.box(m.dark, 0.48, 0.3, 0.02, 4.8, 1.5, 4.65); // a computer
  B.interact({ type: 'info', x: 5.6, z: 3.3, r: 1.3, label: 'Hablar con la funcionaria', text: '«Buenos días. Para el padrón, el registro o pedir cita, aquí mismo. El Salón de Plenos está arriba: hoy está abierto al público.»' });
  // the notice board (left wall) with the edicts
  K.box(m.cork, 0.05, 1.3, 2.6, -hw + 0.06, 1.1, 3.4);
  K.box(m.wood, 0.07, 0.06, 2.7, -hw + 0.07, 2.42, 3.4); K.box(m.wood, 0.07, 0.06, 2.7, -hw + 0.07, 1.06, 3.4);
  const bandos = [
    bandoTex('feria', ['Se hace saber a todos los', 'vecinos que con motivo de', 'la Feria y Fiestas de agosto', 'quedan cortadas al tráfico', 'las calles de la Plaza de', 'España desde las 20:00 h.', '', 'Lo que se hace público', 'para general conocimiento.']),
    posterTex('escenicas', 'ESCÉNICAS\nGUAREÑA', 'Festival de teatro\ny danza · julio\nCasa de la Cultura', '#1e2a44', '#ffffff', '#c8402e'),
    bandoTex('agua', ['Se comunica que el próximo', 'martes, de 9:00 a 13:00 h,', 'se cortará el suministro de', 'agua en la Calle Derecha', 'y adyacentes por obras de', 'mejora de la red.', '', 'Disculpen las molestias.']),
    posterTex('piscina', 'PISCINA\nMUNICIPAL', 'Temporada de verano\nde 12:00 a 20:00 h\nAbonos en el Ayuntamiento', '#2a8ab0', '#ffffff', '#f2b632'),
  ];
  bandos.forEach((t, i) => K.picture(t, -hw + 0.1, 1.75 + (i % 2 ? 0.05 : -0.05), 2.4 + i * 0.66, Math.PI / 2, 0.5, 0.68, null));
  B.interact({ type: 'info', x: -hw + 1.0, z: 3.4, r: 1.3, label: 'Leer el tablón de anuncios', text: 'Un bando de la feria de agosto, el corte de agua en la Calle Derecha, el cartel del festival Escénicas en la Casa de la Cultura y el horario de la piscina municipal.' });
  // benches to wait on, plants, the offices' doors
  K.bench(-hw + 0.45, 6.6, Math.PI / 2, 2.4, m.wood); K.bench(-hw + 0.45, 9.6, Math.PI / 2, 2.4, m.wood);
  B.interact({ type: 'banco', x: -hw + 1.2, z: 6.6, r: 0.9, label: 'Sentarte a esperar', sx: K.ox - hw + 0.5, sz: K.oz + 6.6, h: Math.PI / 2 });
  K.plant(-hw + 0.5, 0.7); K.plant(hw - 0.5, 0.7); K.plant(-3.2, 7.8, 1.2); K.plant(3.2, 7.8, 1.2);
  [['Secretaría', hw, 8.0], ['Intervención', hw, 11.0], ['Urbanismo', hw, 13.6], ['Archivo', -hw, 12.5]].forEach(([t, x, z]) => {
    K.shutDoor(x - Math.sign(x) * 0.05, z, -Math.sign(x) * Math.PI / 2);
    K.picture(textTexture('dp:' + t, t, { w: 256, h: 64, bg: '#f2ede2', fg: '#2a2a2a', font: 'bold 34px Arial' }), x - Math.sign(x) * 0.09, 2.45, z, -Math.sign(x) * Math.PI / 2, 0.6, 0.15, null);
  });
  B.interact({ type: 'info', x: hw - 1.0, z: 11, r: 1.2, label: 'Despachos', text: 'Las puertas de Secretaría, Intervención y Urbanismo están cerradas: se atiende con cita previa.' });
  // the coat of arms over the stairs, a plaque
  K.picture(escudoTex(), 0, 3.3, D - 0.09, Math.PI, 1.3, 1.3, null);
  K.picture(textTexture('casa', 'CASA CONSISTORIAL', { w: 512, h: 96, bg: '#d8c8a0', fg: '#3a2a18', font: 'bold 44px Georgia' }), -4.6, 2.6, D - 0.09, Math.PI, 1.8, 0.34, m.brass);
  // ---- the staircase: up from the hall (left flight), the landing at the back, the second flight back (right)
  const sx0 = -2.6, sx1 = 2.6, z0 = 8.5, zl = 12.9, z2 = 14.8, yl = F2 / 2;
  K.stairs(m.granite, sx0, -0.6, z0, zl, 0, yl, 1);
  K.add(m.granite, boxGeo(sx1 - sx0, yl, z2 - zl, 1), 0, yl / 2, (zl + z2) / 2); // the landing on its block
  K.ramps.push([sx0, zl, sx1, z2, yl, yl, 1]);
  K.stairs(m.granite, 0.6, sx1, z0, zl, yl, F2, -1);
  K.add(wall, boxGeo(1.2, F2, zl - z0, 1.6), 0, F2 / 2, (z0 + zl) / 2); // the wall between the two flights
  B.segs.push([K.ox + sx0, K.oz + z2, K.ox + sx1, K.oz + z2, 3], [K.ox - 0.6, K.oz + z0, K.ox - 0.6, K.oz + zl, 3]);
  // ---- upstairs: the floor (open over the stairwell), the ceiling, its walls
  for (const [x0, a, x1, b] of [[-hw, 0, hw, z0], [-hw, z0, sx0, D], [sx1, z0, hw, D]]) { K.floor(parquet, x0, a, x1, b, F2, 1); K.ceiling(ceil, x0, a, x1, b, F2 - 0.2); }
  K.floor(parquet, sx0, z2, sx1, D, F2, 1);
  K.ceiling(ceil, -hw, 0, hw, D, F2 + H2);
  K.wall(wall2, -hw, 0, hw, 0, H2, [-5.8, -2.9, 0, 2.9, 5.8].map((x) => [hw + x - 0.7, hw + x + 0.7, 0.05, 2.85]), F2);
  K.segs1.push([K.ox - hw, K.oz + 0.08, K.ox + hw, K.oz + 0.08, 3]); // (the balconies' doors stay shut)
  K.wall(wall2, -hw, 0, -hw, D, H2, [], F2); K.wall(wall2, hw, 0, hw, D, H2, [], F2); K.wall(wall2, -hw, D, hw, D, H2, [], F2);
  // the Salón's back wall, its wide doorway onto the stair head
  K.wall(wall2, -hw, 8.3, hw, 8.3, H2, [[hw - 1.0, hw + 3.0, 0, 3.2]], F2);
  // the stairwell's balustrade up there (open where the second flight arrives)
  const bal = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 0.16); for (let i = 0; i <= n; i++) { const t = i / n; K.add(m.iron, boxGeo(0.025, 0.95, 0.025, 1), ax + (bx - ax) * t, F2 + 0.475, az + (bz - az) * t); } const g = boxGeo(L, 0.06, 0.08, 1); g.rotateY(Math.atan2(-(bz - az), bx - ax)); K.add(m.wood, g, (ax + bx) / 2, F2 + 0.98, (az + bz) / 2); K.segs1.push([K.ox + ax, K.oz + az, K.ox + bx, K.oz + bz, 1.1]); };
  bal(sx0, z0 + 0.02, sx0, z2); bal(sx1, z0 + 0.02, sx1, z2); bal(sx0, z0 + 0.02, -0.6, z0 + 0.02); bal(-0.6, z0, -0.6, zl); bal(0.6, z0, 0.6, zl);
  // the balcony doors (the plaza shows through them), velvet curtains
  for (const x of [-5.8, -2.9, 0, 2.9, 5.8]) {
    K.window(x, 0.03, 0, 1.4, 2.8, F2 + 0.05);
    for (const s of [-1, 1]) { const c = boxGeo(0.4, 3.3, 0.08, 1); K.add(velvet, c, x + s * 0.9, F2 + 1.75, 0.18); }
    K.add(m.brass, new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6).rotateZ(Math.PI / 2), x, F2 + 3.45, 0.2);
  }
  // ---- the Salón de Plenos: the dais and the presidency table (west end), the coat of arms, the flags
  K.yAt = F2;
  K.add(panel, boxGeo(3.2, 0.25, 6.6, 1), -hw + 1.6, F2 + 0.125, 4.1); K.foot(3.2, 6.6, -hw + 1.6, 4.1, 0, 0.25, F2);
  K.yAt = F2 + 0.25;
  K.table(-hw + 2.0, 4.1, 1.1, 4.4, 0.78, panel, 0, green);
  for (const z of [2.6, 3.6, 4.6, 5.6]) K.chair(-hw + 1.1, z, Math.PI / 2, panel, velvet, z === 4.6 || z === 3.6);
  K.add(m.brass, new THREE.CylinderGeometry(0.06, 0.08, 0.04, 10), -hw + 2.2, F2 + 1.05, 4.1); K.add(m.brass, new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), -hw + 2.2, F2 + 1.22, 4.1); // the microphone
  K.yAt = F2;
  K.picture(escudoTex(), -hw + 0.09, F2 + 2.6, 4.1, Math.PI / 2, 1.5, 1.5, null);
  for (const [k, z] of [['es', 5.9], ['ex', 6.5], ['eu', 7.1]]) K.flag(-hw + 0.6, z, k);
  K.add(panel, boxGeo(0.06, 1.2, 8.2, 1), -hw + 0.03, F2 + 0.6, 4.15);
  // the councillors: two rows of desks facing each other along the room
  for (const zr of [2.0, 6.3]) {
    K.table(0.2, zr, 7.8, 0.75, 0.76, panel, 0, green);
    for (let i = 0; i < 6; i++) K.chair(-3.0 + i * 1.28, zr + (zr < 4 ? -0.6 : 0.6), zr < 4 ? 0 : Math.PI, panel, velvet);
    for (let i = 0; i < 6; i++) K.add(m.brass, new THREE.CylinderGeometry(0.004, 0.006, 0.28, 4).rotateX(zr < 4 ? -0.4 : 0.4), -3.0 + i * 1.28, F2 + 0.92, zr + (zr < 4 ? 0.15 : -0.15));
  }
  // the public: benches at the east end
  for (let i = 0; i < 3; i++) K.bench(5.3, 1.6 + i * 1.7, -Math.PI / 2, 2.0, panel);
  B.interact({ type: 'banco', x: 4.4, z: 3.3, r: 0.9, label: 'Sentarte entre el público', sx: K.ox + 5.3, sz: K.oz + 3.3, h: -Math.PI / 2 });
  // the walls: a dado of wood, portraits of mayors gone, a big painting of the Vegas
  for (const [ax, az, bx, bz] of [[-hw + 0.05, 8.25, hw - 0.05, 8.25], [hw - 0.05, 0.1, hw - 0.05, 8.2]]) { const L = Math.hypot(bx - ax, bz - az), g = boxGeo(L, 1.1, 0.04, 1); g.rotateY(Math.atan2(-(bz - az), bx - ax)); K.add(panel, g, (ax + bx) / 2, F2 + 0.55, (az + bz) / 2); }
  for (let i = 0; i < 5; i++) K.picture(paintingTexture('retrato', { w: 192, h: 240, seed: 70 + i }), -5.4 + i * 2.3, F2 + 2.4, 8.22, Math.PI, 0.7, 0.88, B.mat('a_gilt', () => std(0xc8a050, { roughness: 0.35, metalness: 0.7 })));
  K.picture(paintingTexture('vegas', { w: 384, h: 192, seed: 3 }), hw - 0.09, F2 + 2.4, 4.2, -Math.PI / 2, 3.4, 1.7, B.mat('a_gilt', () => std(0xc8a050, { roughness: 0.35, metalness: 0.7 })));
  K.chandelier(-2.4, F2 + H2 - 1.0, 4.1, 0.8, 10); K.chandelier(3.2, F2 + H2 - 1.0, 4.1, 0.8, 10);
  // up here: the mayor's chair, the corridor's doors (the Alcaldía), the plaques
  B.interact({ type: 'alcalde', x: -hw + 2.1, z: 4.1, y: F2, r: 1.2, label: 'Sentarte en el sillón del alcalde', sx: K.ox - hw + 1.1, sz: K.oz + 4.1, sy: F2 + 0.25, h: Math.PI / 2 });
  B.interact({ type: 'info', x: -2.0, z: 6.0, y: F2, r: 2.2, label: 'El Salón de Plenos', text: 'Aquí se reúne la Corporación municipal: el alcalde y los concejales, de cara al pueblo, bajo el escudo de Guareña. Por los balcones se ve la Plaza de España.' });
  K.yAt = F2;
  K.shutDoor(4.6, D - 0.05, Math.PI, 1.6, 2.4, panel);
  K.picture(textTexture('alc', 'ALCALDÍA', { w: 256, h: 64, bg: '#2a2a2a', fg: '#e8d090', font: 'bold 36px Georgia' }), 4.6, F2 + 2.75, D - 0.09, Math.PI, 0.8, 0.2, null);
  B.interact({ type: 'info', x: 4.6, z: D - 1.0, y: F2, r: 1.2, label: 'Alcaldía', text: 'La puerta del despacho del alcalde está cerrada. Dentro se oye el teléfono.' });
  K.plant(-hw + 0.6, D - 0.6); K.plant(hw - 0.6, 9.0);
  K.chandelier(0, H1 - 0.9, 4.0, 0.6, 8);
  K.lamp(0, 3.4, 11.5, 0xfff0d0, 4, 9); K.lamp(-5, 3.6, 10, 0xfff0d0, 3, 8);
  K.lamp(0, F2 + 3.2, 11.5, 0xfff0d0, 4, 9);
  K.yAt = 0;
  const h = K.finish({ kind: 'ayuntamiento', daylight: { sun: 0.35, hemi: 0.55 } });
  h.ceilY = (x, z, y) => (y > F2 * 0.5 ? F2 + H2 : H1);
  h.spots.entrada = { x: K.ox, z: K.oz + 1.6, h: 0 };
  h.bounds = { x0: K.ox - hw, x1: K.ox + hw, z0: K.oz, z1: K.oz + D };
  B.interact({ type: 'exit', x: 0, z: 0.8, r: 1.2, label: 'Salir a la plaza' });
  h.inter = B.inter;
  h.cast = [
    { id: 'funcionaria', desc: { gender: 'f', skin: 1, hair: 3, hairStyle: 'media', age: 46, top: '#3a5a7a', topStyle: 'shirt', bottom: '#2a2a30', bottomStyle: 'pants', shoes: '#222222' }, x: 5.6, z: 5.3, y: 0, h: Math.PI, pose: 'sit', lines: ['Buenos días.', '¿Viene por el padrón?', 'Le atiendo ahora mismo.', 'Arriba está el Salón de Plenos, si quiere verlo.'] },
    { id: 'vecino', desc: { gender: 'm', skin: 1, hair: 6, hairStyle: 'corto', age: 72, top: '#5a4a3a', topStyle: 'shirt', bottom: '#3a3a3a', bottomStyle: 'pants', shoes: '#222222', accessory: 'boina', accessoryColor: '#2a2a2a' }, x: -hw + 0.55, z: 6.0, y: 0, h: Math.PI / 2, pose: 'sit', lines: ['Aquí estoy, esperando a que me den lo de la luz.', 'Antes esto era todo más fácil.'] },
  ];
  return h;
}

// ================================================================ the other venues: in their own functions below
// ================================================================ the theatre of the Casa de la Cultura (where the Festival
// Escénicas and the Escuela Municipal de Teatro play): the foyer with the box office and the posters, the stalls of red
// seats, the stage behind its proscenium and its curtains, a painted backdrop, the lights
function teatro(origin, seed) {
  const K = new Kit(origin, seed), B = K.B, m = K.m;
  const W = 15, hw = 7.5, DF = 6, D = 30, H = 8, ZS = 22.5, SY = 1.0;
  const wall = B.mat('t_wall', () => std(0x5a1e24, { roughness: 0.9 }));
  const foyerW = B.mat('t_foyer', () => std(0xefe6d6, { roughness: 0.92 }));
  const ceil = B.mat('t_ceil', () => std(0x2a1a1c, { roughness: 1 }));
  const carpet = B.mat('t_carpet', () => std(0x7a1a22, { roughness: 1 }));
  const floorF = B.mat('t_floorF', () => texMat('floor_tiles_06', 0xe8e0d0, 0.5));
  const boards = B.mat('t_boards', () => texMat('herringbone_parquet', 0xc89a6a, 0.6));
  const velvet = B.mat('t_velvet', () => std(0x8a1420, { roughness: 1 }));
  const seatM = B.mat('t_seat', () => std(0xa01c28, { roughness: 0.9 }));
  const gilt = B.mat('t_gilt', () => std(0xd0a850, { roughness: 0.35, metalness: 0.7, emissive: 0x2a1a06, emissiveIntensity: 0.3 }));
  // ---- the foyer
  K.floor(floorF, -hw, 0, hw, DF, 0, 1.2); K.ceiling(B.mat('t_fceil', () => std(0xf6f2ea, { roughness: 0.95 })), -hw, 0, hw, DF, 3.6);
  K.wall(foyerW, -hw, 0, hw, 0, 3.6, [[hw - 1.0, hw + 1.0, 0, 2.6], [1.0, 3.2, 0.9, 2.6], [W - 3.2, W - 1.0, 0.9, 2.6]]);
  B.segs.push([K.ox - 1.0, K.oz + 0.06, K.ox + 1.0, K.oz + 0.06, 3]);
  K.window(-hw + 2.1, 0.02, 0, 2.2, 1.7, 0.9); K.window(hw - 2.1, 0.02, 0, 2.2, 1.7, 0.9);
  for (const sx of [-1, 1]) K.add(m.metal, boxGeo(0.95, 2.6, 0.05, 1), sx * 0.5, 1.3, 0.05); // the glass doors' frames
  K.wall(foyerW, -hw, 0, -hw, DF, 3.6); K.wall(foyerW, hw, 0, hw, DF, 3.6);
  // the box office (left) and its sign; the posters (right wall); a bench; the doors into the stalls
  K.solid(m.wood, 2.6, 1.1, 0.7, -hw + 1.6, 0, 3.6); K.box(m.granite, 2.7, 0.05, 0.8, -hw + 1.6, 1.1, 3.6);
  K.box(B.mat('t_glass', () => std(0x9ab0b8, { roughness: 0.1, transparent: true, opacity: 0.35 })), 2.6, 0.9, 0.03, -hw + 1.6, 1.15, 3.3);
  K.picture(textTexture('taquilla', 'TAQUILLA', { w: 512, h: 96, bg: '#2a1a1c', fg: '#e8c070', font: 'bold 54px Georgia' }), -hw + 1.6, 2.6, 3.95, Math.PI, 1.8, 0.34, null);
  const plays = [['ESCÉNICAS', 'Festival de teatro\ny danza de Guareña\nJULIO', '#1e2a44', '#ffffff', '#c8402e'], ['LA VIDA\nES SUEÑO', 'Calderón de la Barca\nEscuela Municipal\nde Teatro', '#2a1a10', '#f2e0b0', '#8a2a1a'], ['DON JUAN\nTENORIO', 'José Zorrilla\nNoviembre\nCasa de la Cultura', '#101a2a', '#e8e0d0', '#5a6a8a'], ['CINE DE\nVERANO', 'Todos los viernes\na las 22:30 h\nen el patio', '#0e2a2a', '#f2f0d8', '#d89a2a']];
  plays.forEach(([t, sub, bg, fg, ac], i) => K.picture(posterTex('pl' + i, t, sub, bg, fg, ac), hw - 0.09, 1.8, 1.2 + i * 1.15, -Math.PI / 2, 0.75, 1.05, m.metal));
  B.interact({ type: 'info', x: hw - 1.0, z: 2.9, r: 1.6, label: 'Mirar la cartelera', text: 'Escénicas, el festival de teatro y danza de julio; «La vida es sueño» por la Escuela Municipal de Teatro; el Tenorio de noviembre; el cine de verano en el patio.' });
  B.interact({ type: 'taquilla', x: -hw + 1.6, z: 2.6, r: 1.2, label: 'Comprar una entrada <small>(5 €)</small>' });
  K.bench(hw - 0.5, 4.9, -Math.PI / 2, 1.6, m.wood);
  K.plant(-hw + 0.5, 0.6); K.plant(hw - 0.5, 0.6);
  // the wall between the foyer and the stalls: two doors with their curtains
  K.wall(foyerW, -hw, DF, hw, DF, 3.6, [[2.2, 4.2, 0, 2.5], [W - 4.2, W - 2.2, 0, 2.5]]);
  K.wall(wall, -hw, DF, hw, DF, H - 3.6, [], 3.6);
  for (const x of [-hw + 3.2, hw - 3.2]) { K.add(velvet, boxGeo(0.9, 2.4, 0.05, 1), x - 0.5, 1.2, DF + 0.1); K.add(velvet, boxGeo(0.9, 2.4, 0.05, 1), x + 0.5, 1.2, DF + 0.1); K.picture(textTexture('sala', 'PATIO DE BUTACAS', { w: 512, h: 80, bg: '#2a1a1c', fg: '#e8c070', font: 'bold 38px Georgia' }), x, 2.85, DF - 0.08, Math.PI, 1.6, 0.25, null); }
  // ---- the hall: dark red walls, a dark ceiling, the carpet in the aisles
  K.floor(carpet, -hw, DF, hw, ZS, 0, 1.4);
  K.ceiling(ceil, -hw, DF, hw, D, H);
  K.wall(wall, -hw, DF, -hw, D, H); K.wall(wall, hw, DF, hw, D, H); K.wall(wall, -hw, D, hw, D, H);
  // the seats: rows of red plush, an aisle down the middle
  const rows = [];
  for (let rI = 0; rI < 13; rI++) {
    const z = DF + 1.6 + rI * 1.0;
    for (const side of [-1, 1]) for (let c = 0; c < 6; c++) {
      const x = side * (0.9 + c * 0.6);
      K.add(seatM, boxGeo(0.52, 0.12, 0.48, 1), x, 0.42, z);                     // the seat
      K.add(seatM, boxGeo(0.52, 0.62, 0.1, 1), x, 0.72, z - 0.26);               // the back (facing the stage, +z)
      K.add(m.dark, boxGeo(0.06, 0.62, 0.5, 1), x - 0.29, 0.31, z - 0.02);       // the arm
    }
    for (const side of [-1, 1]) K.foot(3.7, 0.6, side * (0.75 + 1.5 + 0.15), z - 0.05, 0, 0.9);
    rows.push(z);
  }
  for (let i = 0; i < 13; i += 3) B.interact({ type: 'banco', x: 0, z: rows[i], r: 0.7, label: 'Sentarte en una butaca', sx: K.ox + 0.9, sz: K.oz + rows[i], h: 0 });
  // ---- the stage: its front, the steps at its sides, the boards, the proscenium arch and the curtains
  K.solid(m.wood, W - 2.4, SY, 0.15, 0, 0, ZS - 0.08);
  K.add(boards, boxGeo(W, SY, D - ZS, 1), 0, SY / 2, (ZS + D) / 2);
  B.segs.push([K.ox - hw + 1.2, K.oz + ZS, K.ox + hw - 1.2, K.oz + ZS, 1.2]);
  for (const sx of [-1, 1]) { const x0 = sx > 0 ? hw - 1.2 : -hw, x1 = sx > 0 ? hw : -hw + 1.2; K.stairs(m.wood, x0, x1, ZS - 1.8, ZS, 0, SY, 1, false); }
  K.ramps.push([-hw, ZS, hw, D, SY, SY, 1]);
  // the proscenium: a gilded frame, the valance, the great red curtains drawn to the sides
  const PW = 10.5, PH = 5.8;
  for (const sx of [-1, 1]) { K.add(wall, boxGeo((W - PW) / 2, H - SY, 0.4, 1), sx * (PW / 2 + (W - PW) / 4), SY + (H - SY) / 2, ZS + 0.3); K.add(gilt, boxGeo(0.3, PH, 0.5, 1), sx * (PW / 2 + 0.15), SY + PH / 2, ZS + 0.15); }
  K.add(wall, boxGeo(PW, H - SY - PH, 0.4, 1), 0, SY + PH + (H - SY - PH) / 2, ZS + 0.3);
  K.add(gilt, boxGeo(PW + 0.6, 0.35, 0.55, 1), 0, SY + PH + 0.17, ZS + 0.12);
  K.picture(escudoTex(), 0, SY + PH + 0.95, ZS + 0.05, Math.PI, 0.9, 0.9, null);
  const curtain = (x0, x1, y0, y1, z, folds) => { const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, folds * 4, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / (x1 - x0)) * folds * Math.PI * 2) * 0.12); g.computeVertexNormals(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, z); return g; };
  K.add(velvet, curtain(-PW / 2, -PW / 2 + 1.8, SY, SY + PH, ZS + 0.5, 6)); K.add(velvet, curtain(PW / 2 - 1.8, PW / 2, SY, SY + PH, ZS + 0.5, 6));
  K.add(velvet, curtain(-PW / 2, PW / 2, SY + PH - 0.9, SY + PH, ZS + 0.45, 18)); // the valance
  for (const sx of [-1, 1]) K.add(gilt, new THREE.TorusGeometry(0.12, 0.03, 6, 12), sx * (PW / 2 - 1.0), SY + 2.6, ZS + 0.62);
  // the backdrop: a street of the town under the sky, painted
  K.picture(canvasTexture('telon', 512, 256, (x, w2, h2) => {
    const g2 = x.createLinearGradient(0, 0, 0, h2); g2.addColorStop(0, '#5a8ab8'); g2.addColorStop(0.7, '#e8c890'); x.fillStyle = g2; x.fillRect(0, 0, w2, h2);
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#f2ece0' : '#ece4d4'; const bx = i * 58, bh = 90 + (i % 3) * 20; x.fillRect(bx, h2 - bh, 56, bh); x.fillStyle = '#b05a34'; x.fillRect(bx - 2, h2 - bh - 8, 60, 10); x.fillStyle = '#3a5a3a'; x.fillRect(bx + 18, h2 - bh + 30, 14, 22); x.fillStyle = '#5a3a24'; x.fillRect(bx + 20, h2 - 38, 16, 38); }
    x.fillStyle = '#c8a070'; x.fillRect(300, h2 - 200, 34, 120); x.beginPath(); x.arc(317, h2 - 200, 17, Math.PI, 0); x.fill(); // a tower
  }), 0, SY + 3.0, D - 0.12, Math.PI, PW - 0.6, 5.2, null);
  // the lights: a bar of spotlights over the stage, footlights, the house lights
  K.add(m.dark, boxGeo(PW, 0.12, 0.12, 1), 0, SY + PH - 0.3, ZS + 1.4);
  for (let i = 0; i < 7; i++) { const sp = new THREE.CylinderGeometry(0.12, 0.16, 0.36, 10); sp.rotateX(-0.9); K.add(m.dark, sp, -PW / 2 + 1.2 + i * ((PW - 2.4) / 6), SY + PH - 0.55, ZS + 1.4); }
  const foot = B.mat('t_foot', () => std(0xfff2d0, { emissive: 0xffe2a0, emissiveIntensity: 1.2 }));
  for (let i = 0; i < 12; i++) K.add(foot, boxGeo(0.4, 0.06, 0.08, 1), -PW / 2 + 0.7 + i * ((PW - 1.4) / 11), SY + 0.03, ZS + 0.12);
  K.lamp(0, SY + 4.5, ZS + 3.2, 0xfff0d0, 22, 16); K.lamp(-3, SY + 4.2, ZS + 2, 0xffe0b0, 8, 10); K.lamp(3, SY + 4.2, ZS + 2, 0xffe0b0, 8, 10);
  for (const z of [DF + 4, DF + 9, DF + 14]) K.chandelier(0, H - 1.4, z, 0.9, 10);
  K.lamp(0, 3, 3, 0xfff0d8, 6, 9); K.lamp(-4.5, 3.1, 2.6, 0xfff0d8, 5, 8); K.lamp(4.5, 3.1, 2.6, 0xfff0d8, 5, 8);
  B.interact({ type: 'info', x: 0, z: ZS - 2.2, r: 1.8, label: 'El escenario', text: 'Las tablas del teatro de la Casa de la Cultura: aquí ensaya la Escuela Municipal de Teatro y actúan las compañías del festival Escénicas. Puedes subir por las escaleras de los lados.' });
  const h = K.finish({ kind: 'teatro', daylight: { sun: 0.08, hemi: 0.3 } });
  h.ceilY = () => H;
  h.spots.entrada = { x: K.ox, z: K.oz + 1.6, h: 0 };
  h.bounds = { x0: K.ox - hw, x1: K.ox + hw, z0: K.oz, z1: K.oz + D };
  B.interact({ type: 'exit', x: 0, z: 0.8, r: 1.2, label: 'Salir a la calle' });
  h.inter = B.inter;
  // the people: at show time (20:00–22:00) the house fills and two actors play «La vida es sueño»; else a rehearsal
  const show = (hr) => hr >= 19.8 && hr < 22.2;
  const actorA = { gender: 'm', skin: 1, hair: 0, hairStyle: 'corto', age: 30, top: '#3a2a4a', topStyle: 'shirt', bottom: '#1a1a1a', bottomStyle: 'pants', shoes: '#111111' };
  const actorB = { gender: 'f', skin: 1, hair: 2, hairStyle: 'larga', age: 27, top: '#7a2a2a', topStyle: 'shirt', bottom: '#2a1a1a', bottomStyle: 'skirt', shoes: '#111111' };
  const VIDA = ['¿Qué es la vida? Un frenesí.', '¿Qué es la vida? Una ilusión, una sombra, una ficción…', '…y el mayor bien es pequeño: que toda la vida es sueño, y los sueños, sueños son.', '¡Ay, mísero de mí, y ay, infelice!', 'Apurar, cielos, pretendo, ya que me tratáis así, qué delito cometí contra vosotros naciendo.'];
  h.cast = [
    { id: 'actor', desc: actorA, x: -1.2, z: ZS + 2.4, y: SY, h: Math.PI, pose: 'talk', lines: VIDA },
    { id: 'actriz', desc: actorB, x: 1.4, z: ZS + 2.9, y: SY, h: Math.PI + 0.4, pose: 'stand', lines: ['¿Quién eres tú, que me hablas desde la sombra?', '¡Segismundo!'] },
    { id: 'taquillera', desc: { gender: 'f', skin: 1, hair: 5, hairStyle: 'media', age: 52, top: '#2a4a5a', topStyle: 'shirt', bottom: '#2a2a30', bottomStyle: 'pants', shoes: '#222222' }, x: -hw + 1.6, z: 4.3, y: 0, h: Math.PI, pose: 'stand', lines: ['La función empieza a las ocho.', '¿Una entrada? Son cinco euros.', 'Esta noche estamos casi llenos.'] },
  ];
  // the audience at show time
  const r = mulberry32(seed * 3 + 1);
  for (let i = 0; i < 26; i++) { const rI = Math.floor(r() * 10), side = r() < 0.5 ? -1 : 1, c = Math.floor(r() * 6); h.cast.push({ id: 'pub' + i, crowd: true, x: side * (0.9 + c * 0.6), z: rows[rI] - 0.04, y: 0, h: 0, pose: 'sit', when: show }); }
  return h;
}
// ================================================================ the Mercado de Abastos (1924–25): one hall under wooden trusses,
// light from the lantern along the ridge; the stalls round the walls and two islands in the middle — fruit and
// vegetables, fish on ice, the butcher's, bread, cheeses (the Torta del Casar) and olives, cured meats hanging — and the
// people who keep them, calling out what they have
function mercado(origin, seed) {
  const K = new Kit(origin, seed), B = K.B, m = K.m, r = mulberry32(seed * 7 + 3);
  const W = 18, hw = 9, D = 22, H = 5.4, RH = 3.2;
  const wall = B.mat('m_wall', () => std(0xf2ead8, { roughness: 0.92 }));
  const ochre = B.mat('m_ochre', () => std(0xd8a860, { roughness: 0.85 }));
  const tiles = B.mat('m_floor', () => texMat('floor_tiles_06', 0xd8d0c4, 0.55));
  const beam = B.mat('m_beam', () => texMat('dark_wood', 0xb08860, 0.7));
  const roof = B.mat('m_roof', () => std(0xd8ccb4, { roughness: 0.95, side: THREE.DoubleSide }));
  const sky = B.mat('m_sky', () => std(0xfff8e8, { emissive: 0xfff2d8, emissiveIntensity: 0.9 }));
  const tileW = B.mat('m_tilew', () => std(0xf4f4f0, { roughness: 0.3 }));
  const marble = B.mat('m_marble', () => texMat('granite_wall', 0xf2f0ea, 0.35));
  const glassC = B.mat('m_glass', () => std(0xbfd8e0, { roughness: 0.05, transparent: true, opacity: 0.3 }));
  const ice = B.mat('m_ice', () => std(0xeef6fa, { roughness: 0.2 }));
  const col = (hex2, rough = 0.6) => B.mat('m_c' + hex2.toString(16), () => std(hex2, { roughness: rough }));
  K.floor(tiles, -hw, 0, hw, D, 0, 1.0);
  K.wall(wall, -hw, 0, hw, 0, H, [[hw - 1.3, hw + 1.3, 0, 3.3], [2.0, 4.4, 2.2, 4.0], [W - 4.4, W - 2.0, 2.2, 4.0]]);
  B.segs.push([K.ox - 1.3, K.oz + 0.06, K.ox + 1.3, K.oz + 0.06, 3]);
  K.window(-hw + 3.2, 0.02, 0, 2.4, 1.8, 2.2); K.window(hw - 3.2, 0.02, 0, 2.4, 1.8, 2.2);
  K.wall(wall, -hw, 0, -hw, D, H); K.wall(wall, hw, 0, hw, D, H); K.wall(wall, -hw, D, hw, D, H);
  for (const [ax, az, bx, bz] of [[-hw + 0.08, 0, -hw + 0.08, D], [hw - 0.08, 0, hw - 0.08, D], [-hw, D - 0.08, hw, D - 0.08]]) { const L = Math.hypot(bx - ax, bz - az), g = boxGeo(L, 1.2, 0.03, 1); g.rotateY(Math.atan2(-(bz - az), bx - ax)); K.add(tileW, g, (ax + bx) / 2, 0.6, (az + bz) / 2); } // a dado of white tiles
  for (const [ax, az, bx, bz] of [[-hw + 0.09, 0, -hw + 0.09, D], [hw - 0.09, 0, hw - 0.09, D]]) { const g = boxGeo(D, 0.12, 0.04, 1); g.rotateY(Math.PI / 2); K.add(ochre, g, ax, 1.25, D / 2); }
  // the roof: two slopes on trusses, the glazed lantern along the ridge
  const slope = Math.hypot(hw, RH);
  for (const sx of [-1, 1]) { const g = planeGeo(slope, D, 2); g.rotateX(Math.PI / 2); g.rotateZ(-sx * Math.atan2(RH, hw)); K.add(roof, g, sx * hw / 2, H + RH / 2, D / 2); }
  for (const z of [0.02, D - 0.02]) { const t = new THREE.Shape(); t.moveTo(-hw, 0); t.lineTo(hw, 0); t.lineTo(0, RH); t.closePath(); const g = new THREE.ShapeGeometry(t); K.add(wall, g, 0, H, z, z > 1 ? Math.PI : 0); } // the gables
  { const t = new THREE.Shape(); t.arc(0, 0, 1.1, 0, Math.PI, false); t.closePath(); const g = new THREE.ShapeGeometry(t, 12); K.add(sky, g, 0, H + 0.5, 0.04); } // the fan-light of the front gable
  K.add(sky, boxGeo(1.6, 0.05, D - 1, 1), 0, H + RH - 0.05, D / 2);
  for (let i = 0; i <= 7; i++) {
    const z = 0.4 + i * ((D - 0.8) / 7);
    K.add(beam, boxGeo(W, 0.22, 0.18, 1), 0, H, z);                                         // the tie beam
    for (const sx of [-1, 1]) { const g = boxGeo(slope, 0.2, 0.16, 1); g.rotateZ(-sx * Math.atan2(RH, hw)); K.add(beam, g, sx * hw / 2, H + RH / 2, z); } // the rafters
    K.add(beam, boxGeo(0.16, RH, 0.16, 1), 0, H + RH / 2, z);                                // the king post
    for (const sx of [-1, 1]) { const g = boxGeo(Math.hypot(hw / 2, RH / 2), 0.12, 0.12, 1); g.rotateZ(sx * Math.atan2(RH / 2, hw / 2)); K.add(beam, g, sx * hw / 4, H + RH / 4, z); } // the struts
  }
  for (let i = 0; i < 4; i++) K.lamp(0, H - 0.6, 3 + i * 5.3, 0xfff2dc, 7, 12);
  // ---- the stalls: [name, x, z, ry, goods, item, price, vendor line]
  const STALLS = [
    ['FRUTAS Y VERDURAS · PACA', -hw + 1.0, 4.6, Math.PI / 2, 'fruta', 'fruta', 3, '¡Mire qué melocotones, recién cogidos en las Vegas!'],
    ['PESCADOS · EL PUERTO', -hw + 1.0, 11.0, Math.PI / 2, 'pescado', null, 0, '¡Hay boquerones fresquitos y sardinas!'],
    ['CARNICERÍA · HNOS. DÍAZ', -hw + 1.0, 17.4, Math.PI / 2, 'carne', 'bocadillo', 4, 'Hoy tengo presa ibérica y chorizo de la matanza.'],
    ['PANADERÍA · LA ESPIGA', hw - 1.0, 4.6, -Math.PI / 2, 'pan', 'pan', 1, '¡Pan de pueblo, recién hecho!'],
    ['QUESOS Y ACEITUNAS', hw - 1.0, 11.0, -Math.PI / 2, 'queso', 'torta', 9, 'Pruebe la torta, que se come a cucharadas.'],
    ['EMBUTIDOS · LA DEHESA', hw - 1.0, 17.4, -Math.PI / 2, 'embutido', 'bocadillo', 4, 'Jamón de bellota, cortado a cuchillo.'],
    ['MELONES DE GUAREÑA', -2.2, 11.0, Math.PI / 2, 'melon', 'melon', 3, '¡Melones de piel de sapo, dulces como la miel!'],
    ['FLORES · ROSI', 2.2, 11.0, -Math.PI / 2, 'flores', null, 0, '¿Un ramo para la Virgen?'],
  ];
  const vendors = [];
  for (const [name, x, z, ry, goods, item, price, line] of STALLS) {
    const c = Math.cos(ry), sn = Math.sin(ry), W2 = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    // the counter (towards the aisle: local +z), the vendor's side behind it, the back shelf and the sign
    { const [cx2, cz2] = W2(0, 0.55); K.add(tileW, boxGeo(3.6, 0.9, 0.6, 1), cx2, 0.45, cz2, ry); K.add(marble, boxGeo(3.7, 0.05, 0.7, 1), cx2, 0.92, cz2, ry); K.foot(3.7, 0.7, cx2, cz2, ry, 1); }
    { const [bx2, bz2] = W2(0, -0.75); K.add(m.wood, boxGeo(3.6, 1.6, 0.4, 1), bx2, 0.8, bz2, ry); K.foot(3.6, 0.4, bx2, bz2, ry, 1.6); }
    { const tx = textTexture('ms:' + name, name, { w: 768, h: 96, bg: '#2a4a3a', fg: '#f2ead0', font: 'bold 44px Georgia' });
      if (Math.abs(x) > 4) { const [sx2, sz2] = W2(0, -0.95); K.picture(tx, sx2, 2.65, sz2, ry, 3.2, 0.42, m.wood); }
      else { const [sx2, sz2] = W2(0, 0.2); K.picture(tx, sx2 + Math.sin(ry) * 0.03, 3.0, sz2 + Math.cos(ry) * 0.03, ry, 3.2, 0.42, null); K.picture(tx, sx2 - Math.sin(ry) * 0.03, 3.0, sz2 - Math.cos(ry) * 0.03, ry + Math.PI, 3.2, 0.42, null); for (const lx of [-1.4, 1.4]) { const [cx4, cz4] = W2(lx, 0.2); K.add(m.iron, boxGeo(0.015, H - 3.2, 0.015, 1), cx4, (H + 3.2) / 2, cz4); } } }
    // the goods on the counter (and what hangs)
    const top = (lx, lz) => W2(lx, 0.55 + lz);
    const pile = (lx, lz, matK, n, rad, ys = 0.95) => { for (let i = 0; i < n; i++) { const a = r() * 6.283, rr = Math.sqrt(r()) * 0.3, [px, pz] = top(lx + Math.cos(a) * rr, Math.sin(a) * rr * 0.6 + lz); K.add(matK, new THREE.SphereGeometry(rad * (0.9 + r() * 0.2), 8, 6), px, ys + rad + r() * 0.08, pz); } };
    const crate = (lx, lz) => { const [px, pz] = top(lx, lz); K.add(m.pale, boxGeo(0.62, 0.14, 0.42, 1), px, 0.99, pz, ry); };
    if (goods === 'fruta') { for (const [lx, mk] of [[-1.3, col(0xf08a1a)], [-0.45, col(0xd8282a)], [0.4, col(0x6aa83a)], [1.25, col(0xf2c84a)]]) { crate(lx, 0); pile(lx, 0, mk, 14, 0.055, 1.06); } }
    if (goods === 'melon') { for (let i = 0; i < 9; i++) { const [px, pz] = top(-1.3 + (i % 5) * 0.62, (i < 5 ? -0.1 : 0.15)); const g = new THREE.SphereGeometry(0.15, 10, 8); g.scale(1.35, 1, 1); K.add(i % 3 ? col(0x6a8a3a) : col(0x2e5a2a), g, px, 1.1 + (i < 5 ? 0 : 0.12), pz, ry); } }
    if (goods === 'pescado') { const [px, pz] = top(0, 0); K.add(ice, boxGeo(3.3, 0.08, 0.55, 1), px, 0.98, pz, ry); for (let i = 0; i < 14; i++) { const [fx, fz] = top(-1.4 + i * 0.21, (i % 2) * 0.15 - 0.07); const f = new THREE.SphereGeometry(0.07, 8, 5); f.scale(2.4, 0.5, 0.8); f.rotateY(ry + Math.PI / 2 + (r() - 0.5) * 0.4); K.add(col(0xa8b4bc, 0.25), f, fx, 1.05, fz); } }
    if (goods === 'carne' || goods === 'embutido') {
      const [gx, gz] = top(0, -0.05); K.add(glassC, boxGeo(3.3, 0.45, 0.45, 1), gx, 1.17, gz, ry);
      for (let i = 0; i < 7; i++) { const [px, pz] = top(-1.3 + i * 0.43, -0.05); const g = new THREE.SphereGeometry(0.09, 8, 6); g.scale(1.5, 0.45, 1); K.add(col(goods === 'carne' ? 0xb83a3a : 0xa82a24, 0.5), g, px, 1.0, pz, ry); }
      for (let i = 0; i < 5; i++) { const [hx2, hz2] = W2(-1.4 + i * 0.7, -0.55); const ham = new THREE.SphereGeometry(0.16, 10, 8); ham.scale(1, 2.0, 0.8); K.add(col(0x8a4a2a, 0.6), ham, hx2, 2.0, hz2); K.add(m.iron, boxGeo(0.01, 0.4, 0.01, 1), hx2, 2.55, hz2); } // hams hanging
      for (let i = 0; i < 4; i++) { const [cx3, cz3] = W2(-1.2 + i * 0.8, -0.35); K.add(col(0x9a2a1a, 0.5), new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI * 1.6), cx3, 2.2, cz3, ry); } // chorizos
    }
    if (goods === 'pan') { for (let i = 0; i < 12; i++) { const [px, pz] = top(-1.4 + (i % 6) * 0.55, i < 6 ? -0.1 : 0.15); const g = i % 3 ? new THREE.SphereGeometry(0.12, 10, 8) : new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8); if (i % 3) g.scale(1.3, 0.7, 1); else g.rotateZ(Math.PI / 2); K.add(col(0xc8904a, 0.8), g, px, 1.05, pz, ry); } }
    if (goods === 'queso') { for (let i = 0; i < 6; i++) { const [px, pz] = top(-1.4 + i * 0.55, 0); K.add(col(i % 2 ? 0xe8d8a0 : 0xd8b870, 0.7), new THREE.CylinderGeometry(0.16, 0.16, 0.12 + (i % 3) * 0.05, 14), px, 1.0 + 0.06, pz); } for (const lx of [-1.6, 1.6]) { const [bx3, bz3] = W2(lx, 1.15); K.add(m.wood, new THREE.CylinderGeometry(0.28, 0.25, 0.7, 14), bx3, 0.35, bz3); pile(lx, 0.6, col(0x5a6a2a), 18, 0.03, 0.7); } }
    if (goods === 'flores') { for (let i = 0; i < 6; i++) { const [px, pz] = top(-1.4 + i * 0.55, 0); K.add(m.metal, new THREE.CylinderGeometry(0.14, 0.11, 0.35, 12), px, 1.12, pz); pile(-1.4 + i * 0.55, 0, col([0xd8263a, 0xf4f0e6, 0xf2d230, 0xe8456a, 0x8a3ab8, 0xf08a1a][i]), 10, 0.045, 1.35); } }
    { const [px, pz] = top(1.55, 0.18); K.add(m.white, boxGeo(0.25, 0.08, 0.25, 1), px, 0.99, pz, ry); K.add(m.metal, boxGeo(0.2, 0.02, 0.2, 1), px, 1.05, pz, ry); } // the scales
    const [ix, iz] = W2(0, 1.45);
    if (item) B.interact({ type: 'compra', x: ix, z: iz, r: 1.1, label: `Comprar ${({ fruta: 'una bolsa de fruta', bocadillo: 'un bocadillo de jamón', pan: 'una barra de pan', torta: 'una Torta del Casar', melon: 'un melón' })[item]} <small>(${price} €)</small>`, item, price, line });
    else B.interact({ type: 'info', x: ix, z: iz, r: 1.1, label: name.split(' · ')[0][0] + name.split(' · ')[0].slice(1).toLowerCase(), text: line });
    const [vx, vz] = W2(0, -0.2);
    vendors.push({ name, x: vx, z: vz, h: ry, line });
  }
  K.plant(-hw + 0.6, 0.7); K.plant(hw - 0.6, 0.7);
  const h = K.finish({ kind: 'mercado', daylight: { sun: 0.25, hemi: 0.6 } });
  h.ceilY = () => H + RH;
  h.spots.entrada = { x: K.ox, z: K.oz + 1.6, h: 0 };
  h.bounds = { x0: K.ox - hw, x1: K.ox + hw, z0: K.oz, z1: K.oz + D };
  B.interact({ type: 'exit', x: 0, z: 0.8, r: 1.3, label: 'Salir a la calle' });
  h.inter = B.inter;
  // the vendors (mornings: the market keeps its hours) and the people buying
  const open = (hr) => hr >= 8 && hr < 14.5;
  h.cast = vendors.map((v, i) => ({ id: 'vend' + i, crowd: true, x: v.x, z: v.z, y: 0, h: v.h, pose: 'stand', when: open, lines: [v.line, ['¿Qué le pongo?', '¿Algo más?', 'Hoy está todo buenísimo.', 'Le dejo el kilo a buen precio.'][i % 4]] }));
  for (let i = 0; i < 9; i++) { const st = STALLS[i % STALLS.length], ry = st[3], c = Math.cos(ry), sn = Math.sin(ry), lx = (r() - 0.5) * 2.6, lz = 1.6 + r() * 0.5; h.cast.push({ id: 'cli' + i, crowd: true, x: st[1] + lx * c + lz * sn, z: st[2] - lx * sn + lz * c, y: 0, h: ry + Math.PI, pose: 'stand', when: open }); }
  return h;
}
// ================================================================ the Pabellón Municipal La Encina
// One big court under steel trusses: the sports floor with every game's lines on it (futsal and handball in white, the
// two cross basketball courts in yellow, volleyball in blue), the goals at the ends, the baskets over them, the stands
// along one side, the scoreboard, the high windows; the changing rooms' doors. A training session in the evenings.
function courtTexture() {
  return canvasTexture('court', 2048, 1152, (x, w, hh) => {
    const S = w / 46, X = (m2) => (m2 + 23) * S, Y = (m2) => (m2 + 13) * S; // (the floor: 46 × 26 m, the court 40 × 20)
    x.fillStyle = '#c8763a'; x.fillRect(0, 0, w, hh);                    // the run-off, terracotta
    x.fillStyle = '#2f7aa8'; x.fillRect(X(-20), Y(-10), 40 * S, 20 * S);  // the court, blue
    const line = (col, lw) => { x.strokeStyle = col; x.lineWidth = lw * S; };
    // basketball (yellow): the 28 × 15 court, the keys, the three-point lines, the circles
    line('#f2c230', 0.05);
    x.strokeRect(X(-14), Y(-7.5), 28 * S, 15 * S);
    x.beginPath(); x.arc(X(0), Y(0), 1.8 * S, 0, 6.283); x.stroke();
    for (const s of [-1, 1]) {
      const ex = s * 14, bxm = ex - s * 1.575, kx = Math.min(X(ex), X(ex - s * 5.8));
      x.fillStyle = 'rgba(200,64,40,0.6)'; x.fillRect(kx, Y(-2.45), 5.8 * S, 4.9 * S); x.strokeRect(kx, Y(-2.45), 5.8 * S, 4.9 * S);
      x.beginPath(); x.arc(X(ex - s * 5.8), Y(0), 1.8 * S, 0, 6.283); x.stroke();
      const aa = Math.asin(6.6 / 6.75), dx = 6.75 * Math.cos(aa);
      x.beginPath(); if (s < 0) x.arc(X(bxm), Y(0), 6.75 * S, -aa, aa, false); else x.arc(X(bxm), Y(0), 6.75 * S, Math.PI - aa, Math.PI + aa, false); x.stroke();
      for (const yy of [-6.6, 6.6]) { x.beginPath(); x.moveTo(X(ex), Y(yy)); x.lineTo(X(bxm - s * dx), Y(yy)); x.stroke(); }
    }
    // volleyball (light blue): 18 × 9, the net line, the attack lines
    line('#bfe4ff', 0.05); x.strokeRect(X(-9), Y(-4.5), 18 * S, 9 * S);
    for (const xx of [-3, 0, 3]) { x.beginPath(); x.moveTo(X(xx), Y(-4.5)); x.lineTo(X(xx), Y(4.5)); x.stroke(); }
    // futsal and handball (white): the court, halfway, the centre circle, the 6 m areas, the dashed 9 m lines, the spots
    line('#ffffff', 0.08);
    x.strokeRect(X(-20), Y(-10), 40 * S, 20 * S);
    x.beginPath(); x.moveTo(X(0), Y(-10)); x.lineTo(X(0), Y(10)); x.stroke();
    x.beginPath(); x.arc(X(0), Y(0), 3 * S, 0, 6.283); x.stroke();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(X(0), Y(0), 0.15 * S, 0, 6.283); x.fill();
    const c9 = Math.asin(8.5 / 9);
    for (const s of [-1, 1]) {
      const gx = X(s * 20);
      x.beginPath();
      if (s < 0) { x.arc(gx, Y(-1.5), 6 * S, -Math.PI / 2, 0, false); x.lineTo(gx + 6 * S, Y(1.5)); x.arc(gx, Y(1.5), 6 * S, 0, Math.PI / 2, false); }
      else { x.arc(gx, Y(-1.5), 6 * S, -Math.PI / 2, -Math.PI, true); x.lineTo(gx - 6 * S, Y(1.5)); x.arc(gx, Y(1.5), 6 * S, Math.PI, Math.PI / 2, true); }
      x.stroke();
      x.setLineDash([0.3 * S, 0.3 * S]); x.beginPath();
      if (s < 0) { x.arc(gx, Y(-1.5), 9 * S, -c9, 0, false); x.lineTo(gx + 9 * S, Y(1.5)); x.arc(gx, Y(1.5), 9 * S, 0, c9, false); }
      else { x.arc(gx, Y(-1.5), 9 * S, -(Math.PI - c9), -Math.PI, true); x.lineTo(gx - 9 * S, Y(1.5)); x.arc(gx, Y(1.5), 9 * S, Math.PI, Math.PI - c9, true); }
      x.stroke(); x.setLineDash([]);
      for (const dd of [6, 10]) { x.beginPath(); x.arc(X(s * (20 - dd)), Y(0), 0.12 * S, 0, 6.283); x.fill(); }
    }
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = `bold ${Math.round(1.0 * S)}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('PABELLÓN MUNICIPAL LA ENCINA  ·  GUAREÑA', w / 2, Y(11.6));
  });
}
function pabellon(origin, seed) {
  const K = new Kit(origin, seed), B = K.B, m = K.m, r = mulberry32(seed * 11 + 5);
  const W = 26, hw = 13, D = 46, H = 9.5;             // (x across the court, z along it: the court runs away from the door)
  const court = B.mat('p_court', () => { const t = courtTexture(); return std(0xffffff, { map: t, roughness: 0.45 }); });
  const wallL = B.mat('p_wallL', () => std(0x2f6aa0, { roughness: 0.8 }));
  const wallU = B.mat('p_wallU', () => std(0xeceae4, { roughness: 0.9 }));
  const steel = B.mat('p_steel', () => std(0x7a8086, { roughness: 0.45, metalness: 0.6 }));
  const poly = B.mat('p_poly', () => std(0xf4f2e8, { emissive: 0xf0ecd8, emissiveIntensity: 0.75, roughness: 0.5 }));
  const seatB = B.mat('p_seat', () => std(0x1f5fa8, { roughness: 0.5 }));
  const conc = B.mat('p_conc', () => std(0xbab6ae, { roughness: 0.9 }));
  const white = m.white, red = m.red;
  const netM = B.mat('p_net', () => { const t = canvasTexture('netmesh', 64, 64, (x, w, hh) => { x.clearRect(0, 0, w, hh); x.strokeStyle = 'rgba(250,250,250,0.95)'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, hh); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(w, i * 16); x.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; const mm = std(0xffffff, { map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }); mm.userData.noInk = true; return mm; }); // (no depth: the ink would outline every mesh of the net)
  const lamp = B.mat('p_lamp', () => std(0xfffaf0, { emissive: 0xfff8e8, emissiveIntensity: 1.6 }));
  // the floor (the court's texture over all of it), the walls (padded blue below, white above, a band of windows), the roof
  { const g = planeGeo(W, D, 1).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u0 = uv.getX(i) / W, v0 = uv.getY(i) / D; uv.setXY(i, v0, u0); } K.add(court, g, 0, 0.005, D / 2); } // (the texture runs along z)
  K.wall(wallU, -hw, 0, hw, 0, H, [[hw - 1.3, hw + 1.3, 0, 2.6]]);
  B.segs.push([K.ox - 1.3, K.oz + 0.06, K.ox + 1.3, K.oz + 0.06, 3]);
  K.wall(wallU, -hw, 0, -hw, D, H); K.wall(wallU, hw, 0, hw, D, H); K.wall(wallU, -hw, D, hw, D, H);
  for (const [ax, az, bx2, bz] of [[-hw + 0.05, 0, -hw + 0.05, D], [hw - 0.05, 0, hw - 0.05, D], [-hw, D - 0.05, hw, D - 0.05], [-hw, 0.05, -1.4, 0.05], [1.4, 0.05, hw, 0.05]]) { const L2 = Math.hypot(bx2 - ax, bz - az), g = boxGeo(L2, 2.2, 0.06, 1); g.rotateY(Math.atan2(-(bz - az), bx2 - ax)); K.add(wallL, g, (ax + bx2) / 2, 1.1, (az + bz) / 2); }
  for (const sx of [-1, 1]) { const g = planeGeo(D - 2, 1.6, 1); g.rotateY(-sx * Math.PI / 2); K.add(poly, g, sx * (hw - 0.04), H - 2.2, D / 2); } // the polycarbonate band
  K.ceiling(wallU, -hw, 0, hw, D, H, 6);
  for (let i = 0; i < 8; i++) { const z = 3 + i * 5.7; K.add(steel, boxGeo(W, 0.4, 0.25, 1), 0, H - 0.6, z); K.add(steel, boxGeo(W, 0.15, 0.15, 1), 0, H - 1.7, z); for (let k = -6; k <= 6; k++) { const g = boxGeo(0.08, 1.2, 0.08, 1); g.rotateZ(k % 2 ? 0.6 : -0.6); K.add(steel, g, k * 1.95, H - 1.15, z); } } // the trusses
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { const z = 5 + i * 7.2; K.add(lamp, new THREE.CylinderGeometry(0.45, 0.35, 0.18, 14), sx * 6, H - 2.0, z); K.add(m.iron, boxGeo(0.02, 0.9, 0.02, 1), sx * 6, H - 1.5, z); K.lamp(sx * 6, H - 2.4, z, 0xfff8ec, 6, 16); }
  // the goals at both ends (3 × 2 m, red and white), the nets; the baskets over them, folded down
  for (const s of [-1, 1]) {
    const gz = D / 2 + s * 20;
    for (const gx of [-1.5, 1.5]) { for (let k = 0; k < 5; k++) K.add(k % 2 ? red : white, boxGeo(0.08, 0.4, 0.08, 1), gx, 0.2 + k * 0.4, gz); }
    for (let k = 0; k < 8; k++) K.add(k % 2 ? red : white, boxGeo(0.375, 0.08, 0.08, 1), -1.5 + 0.1875 + k * 0.375, 2.0, gz);
    { const n = planeGeo(3, 2.0, 0.25); n.rotateX(-0.5); K.add(netM, n, 0, 1.15, gz + s * 0.5); for (const gx of [-1.5, 1.5]) { const sn = planeGeo(1.0, 2.0, 0.25); sn.rotateY(Math.PI / 2); K.add(netM, sn, gx, 1.0, gz + s * 0.5); } }
    K.foot(3.2, 1.0, 0, gz + s * 0.45, 0, 2);
    // the basket: a mobile unit behind the basketball end line (padded base, the column, the arm), the board, the ring, the net
    const ez = D / 2 + s * 14, rz = D / 2 + s * (14 - 1.575), pz = D / 2 + s * (14 - 1.2);
    K.add(wallL, boxGeo(1.6, 0.7, 2.4, 1), 0, 0.35, ez + s * 1.9); K.foot(1.6, 2.4, 0, ez + s * 1.9, 0, 1.2);
    { const g = boxGeo(0.25, 3.6, 0.25, 1); g.rotateX(s * 0.18); K.add(steel, g, 0, 2.3, ez + s * 1.5); }
    K.add(steel, boxGeo(0.14, 0.14, Math.abs(pz - (ez + s * 1.2)), 1), 0, 4.0, (pz + ez + s * 1.2) / 2);
    K.add(white, boxGeo(1.8, 1.05, 0.04, 1), 0, 3.45, pz);
    K.add(red, boxGeo(0.59, 0.45, 0.045, 1), 0, 3.3, pz - s * 0.005);
    { const ring = new THREE.TorusGeometry(0.23, 0.012, 6, 20); ring.rotateX(Math.PI / 2); K.add(B.mat('p_hoop', () => std(0xe8642a, { roughness: 0.4, metalness: 0.5 })), ring, 0, 3.05, rz); }
    { const n = new THREE.CylinderGeometry(0.23, 0.15, 0.4, 14, 1, true); K.add(netM, n, 0, 2.85, rz); }
    B.interact({ type: 'tiro', x: 0, z: D / 2 + s * (14 - 5.8), r: 1.6, label: 'Tirar a canasta <small>(desde el tiro libre)</small>', kind: 'canasta' });
    B.interact({ type: 'tiro', x: 2.2, z: D / 2 + s * 14, r: 1.4, label: 'Tirar un penalti', kind: 'gol' });
  }
  // the stands along the right side: five steps of blue seats, the rail
  const SX = hw - 4.2;
  for (let i = 0; i < 5; i++) {
    const y = i * 0.45, x = SX + i * 0.8;
    K.add(conc, boxGeo(hw - x, y + 0.45, D - 10, 1), (x + hw) / 2, (y + 0.45) / 2, D / 2);
    for (let k = 0; k < 40; k++) { const z = 5.6 + k * 0.9; K.add(seatB, boxGeo(0.42, 0.06, 0.4, 1), x + 0.4, y + 0.48, z); K.add(seatB, boxGeo(0.06, 0.36, 0.4, 1), x + 0.62, y + 0.66, z); }
  }
  K.add(steel, boxGeo(0.05, 0.05, D - 10, 1), SX - 0.1, 1.0, D / 2); for (let k = 0; k <= 12; k++) K.add(steel, boxGeo(0.04, 1.0, 0.04, 1), SX - 0.1, 0.5, 5 + k * 3);
  K.foot(0.2, D - 10, SX - 0.1, D / 2, 0, 1.1);
  for (let i = 0; i < 12; i += 3) B.interact({ type: 'banco', x: SX - 0.9, z: 9 + i * 2.5, r: 1.0, label: 'Sentarte en la grada', sx: K.ox + SX + 1.2, sz: K.oz + 9 + i * 2.5, sy: 0.93, h: -Math.PI / 2 });
  // the scoreboard on the far wall, the doors of the changing rooms, a banner
  K.picture(canvasTexture('marcador', 512, 192, (x, w, hh) => { x.fillStyle = '#0c0c0e'; x.fillRect(0, 0, w, hh); x.font = 'bold 30px Arial'; x.fillStyle = '#f2f2f2'; x.textAlign = 'center'; x.fillText('LOCAL', 110, 40); x.fillText('VISITANTE', 402, 40); x.font = 'bold 96px "Courier New", monospace'; x.fillStyle = '#ff3b2a'; x.fillText('3', 110, 140); x.fillText('2', 402, 140); x.fillStyle = '#f2c230'; x.font = 'bold 60px "Courier New", monospace'; x.fillText('14:37', 256, 120); x.font = 'bold 22px Arial'; x.fillStyle = '#9ad0f0'; x.fillText('2º TIEMPO', 256, 170); }), 0, 6.4, D - 0.06, Math.PI, 3.6, 1.35, m.iron);
  for (const [z, tx] of [[8, 'VESTUARIO 1'], [14, 'VESTUARIO 2'], [30, 'ALMACÉN'], [36, 'ÁRBITROS']]) { K.shutDoor(-hw + 0.05, z, Math.PI / 2, 1.0, 2.15); K.picture(textTexture('pd:' + tx, tx, { w: 384, h: 96, bg: '#f2f2ee', fg: '#1f3f6a', font: 'bold 44px Arial' }), -hw + 0.06, 2.55, z, Math.PI / 2, 0.9, 0.22, null); }
  K.picture(textTexture('pab_banner', 'PABELLÓN MUNICIPAL LA ENCINA', { w: 1024, h: 128, bg: '#1f5fa8', fg: '#ffffff', font: 'bold 64px Arial' }), -hw + 0.09, 5.0, D / 2, Math.PI / 2, 10, 1.25, null);
  K.picture(textTexture('pab_fair', 'JUEGO LIMPIO · RESPETO · DEPORTE', { w: 1024, h: 128, bg: '#f2c230', fg: '#1f3f6a', font: 'bold 60px Arial' }), 0, 4.6, 0.09, 0, 8, 1.0, null);
  const h = K.finish({ kind: 'pabellon', daylight: { sun: 0.15, hemi: 0.6 } });
  h.ceilY = () => H;
  h.spots.entrada = { x: K.ox, z: K.oz + 1.6, h: 0 };
  B.interact({ type: 'exit', x: 0, z: 0.8, r: 1.3, label: 'Salir a la calle' });
  h.inter = B.inter;
  // evenings: futsal training (two teams of five, the coach on the touchline), parents in the stands
  const train = (hr) => hr >= 17 && hr < 21.5;
  h.cast = [{ id: 'conserje', crowd: true, x: -2.5, z: 2.2, y: 0, h: 0.4, pose: 'stand', lines: ['¿Vienes a echar un partido? A las ocho entrenan los juveniles.', 'Ojo, que acabo de fregar la pista.'] }];
  for (let i = 0; i < 10; i++) { const side = i < 5 ? -1 : 1, k = i % 5; const pos = [[-6, 4], [6, 4], [-3, 10], [3, 10], [0, 18]][k]; h.cast.push({ id: 'jug' + i, crowd: true, x: pos[0] + (r() - 0.5), z: D / 2 + side * pos[1] + (r() - 0.5), y: 0, h: side > 0 ? Math.PI : 0, pose: 'stand', when: train }); }
  h.cast.push({ id: 'entrenador', crowd: true, x: SX - 1.4, z: D / 2 - 2, y: 0, h: -Math.PI / 2, pose: 'talk', when: train, lines: ['¡Venga, presión arriba!', '¡Esa pared, esa pared!', '¡Bien! ¡Así se defiende!', '¡Vuelve, vuelve!'] });
  for (let i = 0; i < 8; i++) { const st = Math.floor(r() * 4), x = SX + st * 0.8 + 0.4, z = 6 + Math.floor(r() * 36) * 0.9; h.cast.push({ id: 'pad' + i, crowd: true, x: x + 0.2, z, y: st * 0.45 + 0.46, h: -Math.PI / 2, pose: 'sit', when: train }); }
  h.onEnter = (g) => { if (train(g.sky.hour)) { g.audio.sfx('whistle', { vol: 0.5 }); g.hud.subtitle('Pabellón La Encina', 'Entrenamiento de fútbol sala. En las gradas, padres y algún abuelo que no se pierde uno.'); setTimeout(() => g.hud.subtitle(null), 5000); } };
  return h;
}
// ================================================================ Agrícola Corbacho (Ctra. de Don Benito, 16)
// The showroom (two new tractors on the polished floor, the parts counter, the racks of filters and belts, the posters)
// and, through the wide opening at the back, the workshop: a tractor up on stands with its bonnet open, another waiting
// for its wheel, the bench and the tool board, the drums of oil, the compressor, the hoist. Whoever plays Adri has a
// tractor of their own here; anybody else can hire one for the day.
function tractorMesh(K, x, z, ry, paint, { open = false, noWheel = false } = {}) {
  const m = K.m, c = Math.cos(ry), sn = Math.sin(ry);
  const dark = K.mat('t_tyre', () => std(0x1c1c1e, { roughness: 0.9 }));
  const rim = K.mat('t_rim', () => std(0xb8bcc0, { roughness: 0.35, metalness: 0.6 }));
  const glass = K.mat('t_glass', () => std(0x9ab4bc, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 }));
  const put = (key, g, lx, ly, lz) => { g.translate(lx, ly, lz); g.rotateY(ry); g.translate(x, 0, z); K.add(key, g); };
  const wheel = (r, w, lx, lz) => { const t = new THREE.CylinderGeometry(r, r, w, 22); t.rotateZ(Math.PI / 2); put(dark, t, lx, r, lz); const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 14); h.rotateZ(Math.PI / 2); put(rim, h, lx, r, lz); };
  for (const sx of [-1, 1]) { if (!(noWheel && sx > 0)) wheel(0.8, 0.5, sx * 0.88, -0.9); wheel(0.48, 0.34, sx * 0.78, 1.35); }
  if (noWheel) { put(m.iron, new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8).rotateZ(Math.PI / 2), 0.88, 0.8, -0.9); put(m.iron, boxGeo(0.4, 0.62, 0.4, 1), 0.85, 0.31, -0.9); }
  put(m.iron, boxGeo(0.55, 0.42, 3.3, 1), 0, 0.72, 0.15);              // the chassis
  put(paint, boxGeo(0.86, 0.82, 1.9, 1), 0, 1.25, 0.75);               // the bonnet
  if (open) { const lid = boxGeo(0.9, 0.05, 1.8, 1); lid.translate(0, 0, 0.9); lid.rotateX(-0.9); put(paint, lid, 0, 1.68, -0.15); put(m.metal, boxGeo(0.6, 0.5, 1.2, 1), 0, 1.35, 0.8); }
  else put(paint, boxGeo(0.9, 0.08, 1.94, 1), 0, 1.68, 0.75);
  put(m.dark, boxGeo(0.8, 0.6, 0.06, 1), 0, 1.2, 1.72);                // the grille
  for (const sx of [-1, 1]) put(K.mat('t_lamp', () => std(0xfff4d0, { emissive: 0xfff0c0, emissiveIntensity: 0.5 })), boxGeo(0.14, 0.1, 0.04, 1), sx * 0.3, 1.5, 1.73);
  put(m.iron, boxGeo(0.5, 0.35, 0.3, 1), 0, 0.85, 1.85);               // the front weights
  for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(0.9, 0.9, 0.58, 18, 1, true, Math.PI * 0.5, Math.PI * 0.75); g.rotateZ(Math.PI / 2); g.rotateX(-0.2); put(paint, g, sx * 0.88, 0.85, -0.9); } // the mudguards
  // the cab: four posts, the roof, glass all round, the seat and the wheel
  for (const [px, pz] of [[-0.68, -1.5], [0.68, -1.5], [-0.68, -0.25], [0.68, -0.25]]) put(m.iron, boxGeo(0.06, 1.4, 0.06, 1), px, 2.1, pz);
  put(paint, boxGeo(1.55, 0.12, 1.5, 1), 0, 2.85, -0.88);
  for (const sx of [-1, 1]) put(glass, boxGeo(0.02, 1.2, 1.2, 1), sx * 0.68, 2.1, -0.88);
  put(glass, boxGeo(1.3, 1.2, 0.02, 1), 0, 2.1, -0.25); put(glass, boxGeo(1.3, 1.2, 0.02, 1), 0, 2.1, -1.5);
  put(m.iron, boxGeo(1.4, 0.12, 1.3, 1), 0, 1.42, -0.88);              // the cab floor
  put(m.dark, boxGeo(0.5, 0.12, 0.45, 1), 0, 1.75, -1.05); put(m.dark, boxGeo(0.5, 0.5, 0.1, 1), 0, 2.0, -1.3);
  { const w = new THREE.TorusGeometry(0.17, 0.02, 6, 16); w.rotateX(-1.0); put(m.dark, w, 0, 2.0, -0.5); }
  put(m.iron, new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), 0.4, 2.35, 0.25); // the exhaust
  K.foot(2.2, 4.1, x, z, ry, 2.5);
}
function corbacho(origin, seed) {
  const K = new Kit(origin, seed), B = K.B, m = K.m, r = mulberry32(seed * 3 + 7);
  const W = 18, hw = 9, D = 24, ZW = 12, H = 6.0;
  const floorS = B.mat('c_floor', () => std(0xa6a8aa, { roughness: 0.28, metalness: 0.05 }));
  const floorW = B.mat('c_floorW', () => { const t = canvasTexture('oilfloor', 256, 256, (x, w, hh) => { x.fillStyle = '#8c8e8c'; x.fillRect(0, 0, w, hh); const rr = mulberry32(9); for (let i = 0; i < 14; i++) { const g = x.createRadialGradient(0, 0, 1, 0, 0, 30); const cx = rr() * w, cy = rr() * hh; g.addColorStop(0, 'rgba(30,28,24,0.45)'); g.addColorStop(1, 'rgba(30,28,24,0)'); x.save(); x.translate(cx, cy); x.scale(1, 0.6); x.fillStyle = g; x.fillRect(-40, -40, 80, 80); x.restore(); } x.strokeStyle = 'rgba(60,60,60,0.5)'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, hh); x.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return std(0xffffff, { map: t, roughness: 0.6 }); });
  const wall = B.mat('c_wall', () => std(0xf2f2ee, { roughness: 0.9 }));
  const wallW = B.mat('c_wallW', () => std(0xd8d8d2, { roughness: 0.9 }));
  const green = B.mat('c_green', () => std(0x2f7a2e, { roughness: 0.5 }));
  const yellow = B.mat('c_yellow', () => std(0xf2c230, { roughness: 0.5 }));
  const paint = B.mat('c_paint', () => std(0x3f8f2a, { roughness: 0.35, metalness: 0.2 }));
  const paintR = B.mat('c_paintR', () => std(0xb82a24, { roughness: 0.35, metalness: 0.2 }));
  const ceil = B.mat('c_ceil', () => std(0xf6f6f2, { roughness: 0.95 }));
  const steel = B.mat('c_steel', () => std(0x6a7074, { roughness: 0.5, metalness: 0.6 }));
  const lampM = B.mat('c_lamp', () => std(0xfffaf0, { emissive: 0xfff4e0, emissiveIntensity: 1.4 }));
  // ---- floors, walls (the door and the showroom glass at the front), the opening to the workshop, the ceiling
  K.floor(floorS, -hw, 0, hw, ZW, 0, 1.0);
  K.floor(floorW, -hw, ZW, hw, D, 0, 4.0);
  K.wall(wall, -hw, 0, hw, 0, H, [[hw - 1.2, hw + 1.2, 0, 2.8], [hw - 5.85, hw - 1.65, 0.3, 3.0], [hw + 1.65, hw + 5.85, 0.3, 3.0]]);
  B.segs.push([K.ox - 1.2, K.oz + 0.06, K.ox + 1.2, K.oz + 0.06, 3]);
  for (const sx of [-1, 1]) K.window(sx * 3.75, 0.02, 0, 4.2, 2.7, 0.3);
  K.wall(wall, -hw, 0, -hw, ZW, H); K.wall(wall, hw, 0, hw, ZW, H);
  K.wall(wallW, -hw, ZW, -hw, D, H); K.wall(wallW, hw, ZW, hw, D, H); K.wall(wallW, -hw, D, hw, D, H);
  // the workshop's side gate, its roller shutter down (an opening there would show the street at the front: every
  // opening of an interior looks out from its street door)
  K.picture(canvasTexture('corb_roll', 128, 256, (x, w, hh) => {
    x.fillStyle = '#9da3a6'; x.fillRect(0, 0, w, hh);
    for (let i = 0; i < hh; i += 8) { x.fillStyle = (i / 8) % 2 ? '#aeb4b7' : '#8f9598'; x.fillRect(0, i, w, 5); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, i + 6, w, 1); }
    x.fillStyle = '#5d6366'; x.fillRect(0, 0, 6, hh); x.fillRect(w - 6, 0, 6, hh); x.fillRect(0, hh - 10, w, 10);
    x.fillStyle = '#3a3e40'; x.fillRect(w / 2 - 10, hh - 26, 20, 6);
  }), -hw + 0.09, 2.1, ZW + 5, Math.PI / 2, 4.0, 4.2, null);
  K.wall(wall, -hw, ZW, hw, ZW, H, [[hw - 3.2, hw + 3.2, 0, 4.4]]);
  for (const [ax, az, bx2, bz] of [[-hw + 0.05, 0, -hw + 0.05, ZW], [hw - 0.05, 0, hw - 0.05, ZW], [-hw, ZW - 0.05, -3.2, ZW - 0.05], [3.2, ZW - 0.05, hw, ZW - 0.05]]) { const L2 = Math.hypot(bx2 - ax, bz - az), g = boxGeo(L2, 0.35, 0.03, 1); g.rotateY(Math.atan2(-(bz - az), bx2 - ax)); K.add(green, g, (ax + bx2) / 2, 2.75, (az + bz) / 2); } // the green band round the showroom
  K.ceiling(ceil, -hw, 0, hw, ZW, H, 2);
  K.ceiling(wallW, -hw, ZW, hw, D, H, 4);
  for (let i = 0; i < 4; i++) K.add(steel, boxGeo(W, 0.3, 0.2, 1), 0, H - 0.4, ZW + 1.5 + i * 3); // the workshop's steel trusses
  // ---- the big sign over the opening (our own lettering) and the posters
  K.picture(canvasTexture('corb_sign', 1024, 200, (x, w, hh) => { x.fillStyle = '#2f7a2e'; x.fillRect(0, 0, w, hh); x.fillStyle = '#f2c230'; x.fillRect(0, hh - 30, w, 12); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; const fit = (t, px, face) => { let s2 = px; x.font = face(s2); while (x.measureText(t).width > w - 60 && s2 > 16) { s2 -= 2; x.font = face(s2); } }; fit('AGRÍCOLA CORBACHO', 92, (s2) => `bold ${s2}px "Arial Black", Arial, sans-serif`); x.fillText('AGRÍCOLA CORBACHO', w / 2, 82); fit('TRACTORES · TALLER · RECAMBIOS · GUAREÑA', 32, (s2) => `bold ${s2}px Arial`); x.fillStyle = '#e8f2dc'; x.fillText('TRACTORES · TALLER · RECAMBIOS · GUAREÑA', w / 2, 146); }), 0, 5.0, ZW - 0.09, Math.PI, 7.5, 1.45, null);
  const poster = (key, title, sub, bg) => canvasTexture('cp:' + key, 256, 360, (x, w, hh) => { x.fillStyle = bg; x.fillRect(0, 0, w, hh); x.fillStyle = '#f2c230'; x.fillRect(0, 0, w, 28); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.font = 'bold 30px Arial'; title.split('\n').forEach((t, i) => x.fillText(t, w / 2, 90 + i * 36)); x.font = '18px Arial'; sub.split('\n').forEach((t, i) => x.fillText(t, w / 2, 210 + i * 26)); x.font = 'bold 14px Arial'; x.fillText('AGRÍCOLA CORBACHO', w / 2, hh - 16); });
  K.picture(poster('nuevos', 'TRACTORES\nNUEVOS Y\nDE OCASIÓN', 'Financiación\na tu medida', '#2f7a2e'), -hw + 0.09, 1.9, 4.0, Math.PI / 2, 0.9, 1.26);
  K.picture(poster('taller', 'TALLER\nOFICIAL', 'Revisiones · Averías\nPreparación ITV', '#24602a'), -hw + 0.09, 1.9, 7.0, Math.PI / 2, 0.9, 1.26);
  K.picture(poster('riego', 'CAMPAÑA\nDEL TOMATE', 'Pon a punto tu\ntractor antes de julio', '#b8562a'), hw - 0.09, 1.9, 10.2, -Math.PI / 2, 0.9, 1.26);
  // ---- the two new tractors on display, a little turned towards the door
  tractorMesh(K, -4.2, 6.2, 0.55, paint);
  tractorMesh(K, 4.0, 5.6, -0.6, paint);
  for (const [tx2, tz2] of [[-4.2, 6.2], [4.0, 5.6]]) K.add(yellow, new THREE.CylinderGeometry(2.6, 2.6, 0.02, 32), tx2, 0.012, tz2); // (each on its yellow disc)
  B.interact({ type: 'info', x: -2.0, z: 4.2, r: 1.3, label: 'Tractor nuevo, 110 CV', text: 'Cabina con aire acondicionado, doble tracción, toma de fuerza de cuatro velocidades. «Para las parcelas de las Vegas, el ideal», dice el vendedor.' });
  B.interact({ type: 'info', x: 2.0, z: 3.8, r: 1.3, label: 'Tractor frutero, 95 CV', text: 'Estrecho, para pasar entre los frutales y la viña. Este ya está vendido: se lo llevan la semana que viene.' });
  // ---- the parts counter, its till and its screen; the racks of filters and belts; a vending machine
  K.add(green, boxGeo(5.0, 1.05, 0.7, 1), 5.6, 0.525, 9.6); K.add(m.white, boxGeo(5.1, 0.05, 0.8, 1), 5.6, 1.07, 9.6); K.foot(5.1, 0.8, 5.6, 9.6, 0, 1.1);
  K.add(m.dark, boxGeo(0.5, 0.35, 0.04, 1), 4.6, 1.35, 9.75); K.add(m.dark, boxGeo(0.1, 0.2, 0.1, 1), 4.6, 1.15, 9.8); K.add(m.metal, boxGeo(0.4, 0.15, 0.3, 1), 6.6, 1.16, 9.6);
  for (let k = 0; k < 3; k++) {
    const z0 = 1.6 + k * 2.4;
    K.add(steel, boxGeo(0.5, 2.4, 2.0, 1), hw - 0.3, 1.2, z0 + 1.0); K.foot(0.5, 2.0, hw - 0.3, z0 + 1.0, 0, 2.4);
    for (let sh = 0; sh < 4; sh++) for (let i = 0; i < 5; i++) { if (r() < 0.2) continue; const col = [green, yellow, m.red, m.white, m.metal][Math.floor(r() * 5)]; K.add(col, boxGeo(0.34, 0.26 + r() * 0.12, 0.3, 1), hw - 0.36, 0.35 + sh * 0.58 + 0.15, z0 + 0.25 + i * 0.38); }
  }
  K.add(m.red, boxGeo(0.8, 1.85, 0.75, 1), -hw + 0.45, 0.925, 10.6); K.add(lampM, boxGeo(0.5, 0.9, 0.02, 1), -hw + 0.84, 1.2, 10.6, Math.PI / 2); K.foot(0.8, 0.75, -hw + 0.45, 10.6, 0, 1.9);
  B.interact({ type: 'compra', x: -hw + 1.5, z: 10.6, r: 0.9, label: 'Sacar un refresco de la máquina <small>(1,50 €)</small>', item: 'refresco', price: 1.5, who: 'La máquina', line: 'La lata cae con un golpe metálico. Está fría.' });
  B.interact({ type: 'tractor', x: 5.2, z: 8.6, r: 1.2 });
  // ---- the workshop: the tractor on stands with its bonnet open, the other one waiting for its wheel
  tractorMesh(K, 0.5, 17.8, 0.0, paint, { open: true });
  tractorMesh(K, -5.0, 20.5, 0.3, paintR, { noWheel: true });
  { const t = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 22); t.rotateX(Math.PI / 2); t.rotateY(0.4); K.add(B.mat('t_tyre', () => std(0x1c1c1e, { roughness: 0.9 })), t, -hw + 0.6, 0.8, 16.0); K.foot(0.7, 1.7, -hw + 0.6, 16.0, 0, 1.6); }
  K.add(steel, boxGeo(0.2, 0.3, W - 0.4, 1), 0.5, H - 0.6, D / 2 + ZW / 2, Math.PI / 2); // the hoist's runway
  K.add(m.iron, boxGeo(0.05, 2.6, 0.05, 1), 0.5, H - 0.75 - 1.3, 17.8); K.add(m.iron, new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI * 1.4), 0.5, H - 3.4, 17.8);
  // the bench, the tool board, the chest; drums, the compressor, a stack of tyres
  K.add(m.wood, boxGeo(0.8, 0.08, 4.5, 1), -hw + 0.45, 0.92, 21.3); K.add(steel, boxGeo(0.75, 0.88, 4.4, 1), -hw + 0.45, 0.44, 21.3); K.foot(0.8, 4.5, -hw + 0.45, 21.3, 0, 1);
  K.picture(canvasTexture('toolboard', 256, 128, (x, w, hh) => { x.fillStyle = '#d8c8a0'; x.fillRect(0, 0, w, hh); x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) x.fillRect(8 + i * 15, 6 + j * 15, 2, 2); x.fillStyle = '#4a4e52'; for (let i = 0; i < 9; i++) { x.fillRect(16 + i * 26, 18, 6, 50 + (i % 3) * 12); x.fillRect(10 + i * 26, 14, 18, 8); } x.fillStyle = '#b82a24'; for (let i = 0; i < 5; i++) x.fillRect(20 + i * 46, 96, 30, 14); }), -hw + 0.04, 1.9, 21.3, Math.PI / 2, 4.2, 1.6, m.wood);
  K.add(m.red, boxGeo(0.7, 1.1, 1.0, 1), hw - 0.5, 0.55, 22.8); K.foot(0.7, 1.0, hw - 0.5, 22.8, 0, 1.2);
  for (let i = 0; i < 4; i++) { const col = [B.mat('c_drumB', () => std(0x1f4fa0, { roughness: 0.5, metalness: 0.4 })), m.red][i % 2]; K.add(col, new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), hw - 0.45, 0.44, 13.2 + i * 0.65); }
  K.foot(0.6, 2.6, hw - 0.45, 14.2, 0, 1);
  K.add(m.red, new THREE.CylinderGeometry(0.35, 0.35, 1.2, 14).rotateZ(Math.PI / 2), hw - 0.8, 0.5, 19.6); K.add(m.dark, boxGeo(0.4, 0.4, 0.4, 1), hw - 0.8, 1.2, 19.6); K.foot(1.3, 0.8, hw - 0.8, 19.6, 0, 1);
  for (let i = 0; i < 4; i++) K.add(B.mat('t_tyre', () => std(0x1c1c1e, { roughness: 0.9 })), new THREE.TorusGeometry(0.42, 0.16, 8, 16).rotateX(Math.PI / 2), hw - 0.9, 0.16 + i * 0.32, 17.0);
  K.foot(1.1, 1.1, hw - 0.9, 17.0, 0, 1.3);
  B.interact({ type: 'info', x: 2.6, z: 16.4, r: 1.5, label: 'En el taller', text: 'Un tractor con el capó abierto sobre los caballetes: revisión de las quinientas horas, filtros nuevos y el aceite cambiado. Huele a gasoil y a grasa.' });
  // ---- the lights
  for (const [lx, lz] of [[-4, 3.5], [4, 3.5], [-4, 9], [4, 9]]) { K.add(lampM, boxGeo(1.2, 0.05, 0.3, 1), lx, H - 0.03, lz); K.lamp(lx, H - 0.5, lz, 0xfff6ea, 5, 10); }
  for (const [lx, lz] of [[-4, 16], [4, 16], [-4, 21], [4, 21]]) { K.add(steel, new THREE.ConeGeometry(0.35, 0.3, 12, 1, true), lx, H - 1.1, lz); K.add(lampM, new THREE.CircleGeometry(0.3, 12).rotateX(Math.PI / 2), lx, H - 1.25, lz); K.add(m.iron, boxGeo(0.02, 0.9, 0.02, 1), lx, H - 0.5, lz); K.lamp(lx, H - 1.5, lz, 0xfff0d8, 5, 11); }
  const h = K.finish({ kind: 'corbacho', daylight: { sun: 0.2, hemi: 0.5 } });
  h.ceilY = () => H;
  h.spots.entrada = { x: K.ox, z: K.oz + 1.6, h: 0 };
  B.interact({ type: 'exit', x: 0, z: 0.8, r: 1.3, label: 'Salir a la carretera' });
  h.inter = B.inter;
  const open = (hr) => (hr >= 8 && hr < 14) || (hr >= 16 && hr < 20);
  h.cast = [
    { id: 'dependiente', crowd: true, x: 5.6, z: 10.4, y: 0, h: Math.PI, pose: 'stand', lines: ['¡Buenas! ¿Qué necesitas: filtros, aceite, una correa?', 'El de la entrada es la novedad de este año.', 'En la campaña del tomate aquí no paramos.'] },
    { id: 'mecanico', crowd: true, x: 1.7, z: 19.6, y: 0, h: -2.6, pose: 'stand', when: open, lines: ['Este trae el embrague tocado.', 'Pásame la llave del diecinueve, anda.', 'A este le toca la revisión de las quinientas horas.'] },
    { id: 'labrador', crowd: true, x: -1.9, z: 7.4, y: 0, h: -2.4, pose: 'stand', when: open, lines: ['Con este me apaño yo para las parcelas del canal.', '¿Y cuánto gasta este en una jornada?'] },
  ];
  // whoever plays Adri is expected here
  h.onEnter = (g) => {
    const adri = g.save && g.save.preset === 'adri';
    g.hud.subtitle('Agrícola Corbacho', adri ? '¡Hombre, Adri! Tu tractor está listo: pide las llaves en el mostrador y te lo sacamos a la puerta del taller.' : 'Buenas. Pase, pase: tractores, taller y recambios. Si necesita un tractor para el día, pregunte en el mostrador.');
    setTimeout(() => g.hud.subtitle(null), 6000);
  };
  return h;
}
// ================================================================ the church of San Gregorio (Plaza de San Gregorio)
// One whitewashed nave under a barrel vault with its transverse arches, the presbytery raised three steps under a dome on
// a drum with its lantern, and at the end the gilt retablo with San Gregorio Ostiense — the bishop with his mitre and
// crozier, invoked for the fields — between two saints; side altars with their candles, pews, the stoup by the door
function sangregorio(origin, seed) {
  const K = new Kit(origin, seed), B = K.B, m = K.m, r = mulberry32(seed * 5 + 1);
  const hw = 4.5, W = 9, DN = 16, D = 24, H = 5.6, PY = 0.5, RD = 3.85;
  const cal = B.mat('g_cal', () => std(0xffffff, { map: calTexture(), roughness: 0.95 }));
  const calD = B.mat('g_calD', () => std(0xffffff, { map: calTexture(), roughness: 0.95, side: THREE.DoubleSide }));
  const stone = B.mat('g_stone', () => texMat('granite_wall', 0xe2d8c4, 0.85));
  const barro = B.mat('g_barro', () => { const t = canvasTexture('barro', 256, 256, (x, w, hh) => { const rr = mulberry32(5); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 0.85 + rr() * 0.2; x.fillStyle = `rgb(${178 * v | 0},${104 * v | 0},${70 * v | 0})`; x.fillRect(i * 64, j * 64, 64, 64); x.fillStyle = 'rgba(255,230,200,0.05)'; x.fillRect(i * 64 + 6, j * 64 + 6, 30, 20); } x.strokeStyle = '#d8c8b0'; x.lineWidth = 4; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, hh); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return std(0xffffff, { map: t, roughness: 0.8 }); });
  const gold = B.mat('g_gold', () => { const mm = std(0xffffff, { roughness: 0.5, metalness: 0.68, map: goldTexture(5), envMap: goldEnv(), envMapIntensity: 1.3, emissive: 0x4a3008, emissiveIntensity: 0.42 }); mm.map.repeat.set(1.6, 1.6); return mm; });
  const goldPlain = B.mat('g_goldP', () => std(0xf0c25a, { roughness: 0.24, metalness: 0.82, envMap: goldEnv(), envMapIntensity: 1.45, emissive: 0x3a2606, emissiveIntensity: 0.36 }));
  const velvet = B.mat('g_velvet', () => std(0x7a1420, { roughness: 1 }));
  const linen = B.mat('g_linen', () => std(0xf6f2e8, { roughness: 0.9 }));
  const glow = B.mat('g_glow', () => std(0xfff4dc, { emissive: 0xfff0d0, emissiveIntensity: 1.1, roughness: 0.4 }));
  const alab = B.mat('g_alab', () => std(0xf8ecd0, { emissive: 0xf6dca8, emissiveIntensity: 0.85, roughness: 0.5 }));
  const candle = B.mat('g_candle', () => std(0xf2ead2, { roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.15 }));
  const flame = B.mat('g_flame', () => new THREE.MeshBasicMaterial({ color: 0xffc860 }));
  const pewM = B.mat('g_pew', () => texMat('dark_wood', 0xc09070, 0.6));
  // ---- floor, the steps up to the presbytery, the walls (the door; windows high up), the plinth
  K.floor(barro, -hw, 0, hw, DN, 0, 1.6);
  K.floor(barro, -hw, DN, hw, D, PY, 1.6);
  K.stairs(stone, -hw, hw, DN - 0.9, DN, 0, PY, 1, false);
  K.ramps.push([-hw, DN, hw, D, PY, PY, 1]);
  K.add(stone, boxGeo(W, PY, D - DN, 1), 0, PY / 2 - 0.001, (DN + D) / 2);
  K.wall(cal, -hw, 0, hw, 0, H + hw, [[hw - 1.2, hw + 1.2, 0, 3.8]]);
  B.segs.push([K.ox - 1.2, K.oz + 0.06, K.ox + 1.2, K.oz + 0.06, 3]);
  const winZ = [2.1, 6, 10];
  K.wall(cal, -hw, 0, -hw, D, H, winZ.map((z) => [z - 0.5, z + 0.5, 3.4, 5.0]));
  K.wall(cal, hw, 0, hw, D, H, winZ.map((z) => [z - 0.5, z + 0.5, 3.4, 5.0]));
  K.wall(cal, -hw, D, hw, D, H + RD + 2);
  for (const sx of [-1, 1]) for (const z of winZ) K.add(alab, planeGeo(1.0, 1.6, 1), sx * (hw + 0.05), 4.2, z, -sx * Math.PI / 2); // alabaster light in the windows
  for (const sx of [-1, 1]) { const g = boxGeo(D, 0.9, 0.06, 1); g.rotateY(Math.PI / 2); K.add(stone, g, sx * (hw - 0.03), 0.45, D / 2); } // the granite plinth
  // ---- the barrel vault over the nave, its transverse arches on pilasters, the cornice
  { const g = new THREE.CylinderGeometry(hw, hw, DN, 40, 1, true, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); K.add(calD, g, 0, H, DN / 2); }
  for (const z of [0.15, 4, 8, 12]) {
    const t = new THREE.TorusGeometry(hw - 0.12, 0.17, 6, 28, Math.PI); K.add(stone, t, 0, H, z);
    for (const sx of [-1, 1]) K.add(stone, boxGeo(0.5, H, 0.4, 1), sx * (hw - 0.2), H / 2, z);
  }
  for (const sx of [-1, 1]) { const g = boxGeo(D, 0.28, 0.34, 1); g.rotateY(Math.PI / 2); K.add(stone, g, sx * (hw - 0.14), H - 0.12, D / 2); }
  // ---- the triumphal arch, and over the presbytery the dome on its drum, the lantern letting the light fall in
  { const outer = new THREE.Shape(); outer.moveTo(-hw, -0.2); outer.lineTo(hw, -0.2); outer.lineTo(hw, H); outer.absarc(0, H, hw, 0, Math.PI, false); outer.lineTo(-hw, -0.2);
    const ar = 3.5, hole = new THREE.Path(); hole.moveTo(-ar, -0.1); hole.lineTo(-ar, H - 0.6); hole.absarc(0, H - 0.6, ar, Math.PI, 0, true); hole.lineTo(ar, -0.1); hole.lineTo(-ar, -0.1); outer.holes.push(hole);
    K.add(calD, new THREE.ShapeGeometry(outer, 24), 0, 0, DN); }
  { const t = new THREE.TorusGeometry(3.5, 0.2, 6, 28, Math.PI); K.add(stone, t, 0, H - 0.6, DN); for (const sx of [-1, 1]) K.add(stone, boxGeo(0.5, H - 0.6, 0.5, 1), sx * 3.5, (H - 0.6) / 2, DN); }
  const dz = DN + (D - DN) / 2, dh = 1.6;
  { const sq = new THREE.Shape(); sq.moveTo(-hw, DN - dz); sq.lineTo(hw, DN - dz); sq.lineTo(hw, D - dz); sq.lineTo(-hw, D - dz); sq.lineTo(-hw, DN - dz); const c = new THREE.Path(); c.absarc(0, 0, RD, 0, Math.PI * 2, true); sq.holes.push(c); const g = new THREE.ShapeGeometry(sq, 32); g.rotateX(Math.PI / 2); K.add(calD, g, 0, H, dz); }
  { const g = new THREE.CylinderGeometry(RD, RD, dh, 40, 1, true); K.add(calD, g, 0, H + dh / 2, dz); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8, g = planeGeo(0.7, 1.0, 1); K.add(alab, g, Math.sin(a) * (RD - 0.04), H + dh / 2, dz + Math.cos(a) * (RD - 0.04), a + Math.PI); }
  { const g = new THREE.SphereGeometry(RD, 40, 14, 0, Math.PI * 2, 0.2, Math.PI / 2 - 0.2); K.add(calD, g, 0, H + dh, dz); } // (open at the top: the lantern)
  for (let i = 0; i < 8; i++) { const t = new THREE.TorusGeometry(RD - 0.05, 0.07, 4, 16, Math.PI / 2 - 0.2); t.rotateY((i / 8) * Math.PI * 2); K.add(stone, t, 0, H + dh, dz); } // the ribs
  { const t = new THREE.TorusGeometry(RD - 0.04, 0.12, 6, 40); t.rotateX(Math.PI / 2); K.add(stone, t, 0, H + dh, dz); } // the ring at the dome's foot
  { const lr = RD * Math.sin(0.2), lh = 1.4; K.add(calD, new THREE.CylinderGeometry(lr, lr, lh, 16, 1, true), 0, H + dh + RD * Math.cos(0.2) + lh / 2 - 0.05, dz); K.add(glow, new THREE.CircleGeometry(lr, 16).rotateX(Math.PI / 2), 0, H + dh + RD * Math.cos(0.2) + lh - 0.06, dz); }
  K.lamp(0, H + dh + 2.5, dz, 0xfff0d0, 7, 14);
  // ---- the retablo: the predella, three streets between twisted columns, San Gregorio in the middle niche, the attic
  const RW = 6.6, RZ = D - 0.35, y0 = PY;
  K.add(gold, boxGeo(RW, 1.1, 0.6, 1), 0, y0 + 0.55, RZ - 0.1);
  K.add(goldPlain, boxGeo(0.9, 0.7, 0.5, 1), 0, y0 + 1.45, RZ - 0.35); K.add(gold, new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), 0, y0 + 1.86, RZ - 0.35); // the tabernacle
  K.add(gold, boxGeo(RW, 4.2, 0.3, 1), 0, y0 + 3.2, RZ + 0.05);
  for (const [nx2, nw, nh2] of [[0, 1.6, 2.7], [-2.2, 1.1, 2.0], [2.2, 1.1, 2.0]]) {
    K.add(velvet, boxGeo(nw, nh2, 0.05, 1), nx2, y0 + 1.25 + nh2 / 2, RZ - 0.12);
    const arc = new THREE.TorusGeometry(nw / 2, 0.08, 6, 16, Math.PI); K.add(goldPlain, arc, nx2, y0 + 1.25 + nh2, RZ - 0.15);
    K.add(goldPlain, boxGeo(nw + 0.2, 0.1, 0.3, 1), nx2, y0 + 1.22, RZ - 0.2);
  }
  for (const cx3 of [-3.1, -1.2, 1.2, 3.1]) { const col = new THREE.CylinderGeometry(0.13, 0.14, 4.0, 12, 20); const p = col.attributes.position; for (let i = 0; i < p.count; i++) { const py = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), rr = Math.hypot(p.getX(i), p.getZ(i)) * (1 + 0.28 * Math.sin(a * 2 + py * 9)); p.setXYZ(i, Math.cos(a) * rr, py, Math.sin(a) * rr); } col.computeVertexNormals(); K.add(goldPlain, col, cx3, y0 + 3.2, RZ - 0.3); }
  K.add(goldPlain, boxGeo(RW + 0.4, 0.35, 0.6, 1), 0, y0 + 5.45, RZ - 0.15);
  K.add(gold, boxGeo(3.0, 1.9, 0.3, 1), 0, y0 + 6.55, RZ + 0.05);
  K.add(goldPlain, new THREE.TorusGeometry(1.5, 0.12, 6, 20, Math.PI), 0, y0 + 7.5, RZ - 0.05);
  for (const sx of [-1, 1]) { const s2 = new THREE.TorusGeometry(0.45, 0.1, 6, 12, Math.PI); s2.rotateZ(sx > 0 ? 0 : Math.PI); K.add(goldPlain, s2, sx * 1.9, y0 + 5.95, RZ - 0.1); } // the scrolls
  K.picture(paintingTexture('gregorioOst', { seed: 61 }), 0, y0 + 6.55, RZ - 0.13, Math.PI, 1.3, 1.5, null);
  const k = { gold, goldPlain };
  statue(B, 'gregorio', 0, y0 + 1.32, RZ - 0.32, Math.PI, 1.75, k);
  statue(B, 'isidro', -2.2, y0 + 1.32, RZ - 0.3, Math.PI, 1.3, k);
  statue(B, 'antonio', 2.2, y0 + 1.32, RZ - 0.3, Math.PI, 1.3, k);
  K.lamp(0, y0 + 3.5, RZ - 2.5, 0xffd8a0, 5, 7);
  K.foot(RW, 1.0, 0, RZ - 0.2, 0, 3, y0);
  // the altar: its linen, the cross and six candlesticks
  K.add(stone, boxGeo(2.4, 0.95, 0.9, 1), 0, y0 + 0.475, D - 2.6); K.add(linen, boxGeo(2.5, 0.04, 1.0, 1), 0, y0 + 0.97, D - 2.6); K.add(linen, boxGeo(2.5, 0.5, 0.02, 1), 0, y0 + 0.73, D - 3.11);
  K.foot(2.5, 1.0, 0, D - 2.6, 0, 1, y0);
  K.add(goldPlain, boxGeo(0.04, 0.6, 0.04, 1), 0, y0 + 1.3, D - 2.45); K.add(goldPlain, boxGeo(0.3, 0.04, 0.04, 1), 0, y0 + 1.45, D - 2.45);
  for (let i = 0; i < 6; i++) { const cx4 = -1.0 + i * 0.4 + (i > 2 ? 0 : 0); if (Math.abs(cx4) < 0.15) continue; K.add(goldPlain, new THREE.CylinderGeometry(0.03, 0.06, 0.4, 8), cx4, y0 + 1.19, D - 2.4); K.add(candle, new THREE.CylinderGeometry(0.022, 0.022, 0.3, 6), cx4, y0 + 1.54, D - 2.4); K.add(flame, new THREE.SphereGeometry(0.018, 6, 5).scale(1, 2.2, 1), cx4, y0 + 1.73, D - 2.4); }
  K.lamp(0, y0 + 1.9, D - 2.4, 0xffb060, 1.6, 4);
  // ---- the side altars (the Virgin, the Sacred Heart), with stands of candles you can light
  B.stands = B.stands || [];
  for (const [sx, kind, title, text] of [[-1, 'carmen', 'Altar de la Virgen del Carmen', 'La Virgen del Carmen con el Niño, en su retablito dorado. Las velas de los encargos arden delante.'], [1, 'corazon', 'Altar del Sagrado Corazón', 'El Sagrado Corazón de Jesús. Aquí vienen a rezar las abuelas del barrio por las tardes.']]) {
    const xw = sx * (hw - 0.25), az = 14.3, ry = -sx * Math.PI / 2;
    { const g = boxGeo(2.2, 3.4, 0.25, 1); g.rotateY(ry); K.add(gold, g, xw, 1.7 + 0.6, az); }
    { const g = boxGeo(1.0, 1.7, 0.04, 1); g.rotateY(ry); K.add(velvet, g, xw - sx * 0.14, 2.35, az); }
    { const g = new THREE.TorusGeometry(0.5, 0.07, 6, 14, Math.PI); g.rotateY(ry); K.add(goldPlain, g, xw - sx * 0.15, 3.2, az); }
    { const g = boxGeo(1.6, 0.9, 0.55, 1); g.rotateY(ry); K.add(stone, g, xw - sx * 0.2, 0.45, az); K.foot(0.6, 1.6, xw - sx * 0.2, az, 0, 1); }
    statue(B, kind, xw - sx * 0.3, 0.92, az, ry, 1.25, k);
    const vx = xw - sx * 1.05, vz = az;
    K.add(m.iron, boxGeo(0.45, 0.04, 1.2, 1), vx, 0.95, vz); K.add(m.iron, boxGeo(0.04, 0.95, 0.04), vx, 0.47, vz - 0.5); K.add(m.iron, boxGeo(0.04, 0.95, 0.04), vx, 0.47, vz + 0.5);
    const stand = { x: K.ox + vx, z: K.oz + vz, lit: [], free: [] };
    for (let i = 0; i < 10; i++) stand.free.push([vx + (i < 5 ? -0.1 : 0.1), vz - 0.45 + (i % 5) * 0.22]);
    B.stands.push(stand);
    for (let i = 0; i < 3; i++) { const [px, pz] = stand.free.shift(); K.add(candle, new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), px, 1.03, pz); K.add(flame, new THREE.SphereGeometry(0.014, 6, 5).scale(1, 2.2, 1), px, 1.12, pz); }
    K.foot(0.5, 1.3, vx, vz, 0, 1);
    B.interact({ type: 'vela', x: vx - sx * 0.6, z: vz, r: 1.2, label: 'Encender una vela <small>(0,50 € en el cepillo)</small>', stand });
    B.interact({ type: 'info', x: xw - sx * 1.9, z: az - 0.9, r: 0.9, label: title, text });
    K.lamp(vx, 1.4, vz, 0xffb060, 1.4, 4);
  }
  // ---- the pews, the Way of the Cross, the stoup and the alms box by the door, the lamps hanging from the vault
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push(2.8 + i * 1.25);
  for (const z of rows) for (const sx of [-1, 1]) K.bench(sx * 2.0, z, 0, 2.6, pewM);
  for (let i = 0; i < rows.length; i += 3) B.interact({ type: 'banco', x: 0, z: rows[i], r: 0.75, label: 'Sentarte en un banco', sx: K.ox + 1.0, sz: K.oz + rows[i] + 0.05, h: 0 });
  for (let i = 0; i < 14; i++) { const sx = i < 7 ? -1 : 1, z = [1.0, 3.0, 5.0, 7.0, 9.0, 11.0, 12.9][i % 7]; K.add(m.wood, boxGeo(0.04, 0.42, 0.05, 1), sx * (hw - 0.04), 2.5, z); K.add(m.wood, boxGeo(0.04, 0.05, 0.26, 1), sx * (hw - 0.04), 2.6, z); } // the Way of the Cross
  K.add(stone, new THREE.CylinderGeometry(0.28, 0.12, 0.25, 14), -1.6, 1.0, 0.45); K.add(stone, new THREE.CylinderGeometry(0.1, 0.13, 0.9, 10), -1.6, 0.45, 0.45); K.foot(0.5, 0.5, -1.6, 0.45, 0, 1);
  B.interact({ type: 'pila', x: -1.6, z: 1.0, r: 0.8, label: 'Mojar los dedos en la pila' });
  K.add(m.wood, boxGeo(0.4, 0.5, 0.3, 1), 1.7, 1.0, 0.3); K.add(m.wood, boxGeo(0.08, 0.75, 0.08, 1), 1.7, 0.37, 0.3);
  B.interact({ type: 'cepillo', x: 1.7, z: 0.9, r: 0.8, label: 'Echar un euro en el cepillo' });
  for (const z of [5.5, 11.5]) { K.chandelier(0, H + 1.4, z, 0.6, 6); K.add(m.brass, boxGeo(0.015, hw - 2.2, 0.015, 1), 0, H + 2.2 + (hw - 2.2) / 2, z); }
  B.interact({ type: 'info', x: 0, z: DN - 1.6, r: 1.6, label: 'San Gregorio Ostiense', text: 'En el centro del retablo, San Gregorio Ostiense: obispo, con su mitra y su báculo. Desde hace siglos los labradores le piden por los campos y contra las plagas.' });
  B.interact({ type: 'info', x: 0, z: dz - 1, r: 1.4, label: 'La cúpula', text: 'Sobre el presbiterio, la cúpula sobre su tambor de ventanas; por la linterna de arriba cae la luz del día.' });
  const h = K.finish({ kind: 'sangregorio', chapel: true, daylight: { sun: 0.2, hemi: 0.45 } });
  h.ceilY = () => H + dh + RD + 1;
  h.spots.entrada = { x: K.ox, z: K.oz + 1.6, h: 0 };
  B.interact({ type: 'exit', x: 0, z: 0.8, r: 1.3, label: 'Salir a la plaza' });
  h.inter = B.inter; h.stands = B.stands;
  // who is there: the sacristan, a few neighbours praying (mornings and evenings)
  const prayer = (hr) => (hr > 8.5 && hr < 13) || (hr > 18 && hr < 21.5);
  h.cast = [
    { id: 'sacristan', crowd: true, x: 1.6, z: D - 3.6, y: PY, h: Math.PI, pose: 'stand', lines: ['Buenas. Pase, pase, que está abierta.', 'Este retablo lo doraron hace muchos años: mírelo con la luz de la tarde.', 'A San Gregorio se le pide por los campos.'] },
  ];
  for (let i = 0; i < 7; i++) { const z = rows[1 + Math.floor(r() * 7)], sx = r() < 0.5 ? -1 : 1, x = sx * (1.2 + Math.floor(r() * 4) * 0.6); h.cast.push({ id: 'fiel' + i, crowd: true, x, z: z - 0.04, y: 0, h: 0, pose: 'sit', when: prayer }); }
  return h;
}

// ---------------------------------------------------------------- the people inside: each at their place, now and then a word
let _rd = null;
export function setVenueDesc(fn) { _rd = fn; }
const randomDescOf = () => (_rd ? _rd() : { gender: 'm', skin: 1, hair: 1 });
export class VenueLife {
  constructor(g, h) {
    this.g = g; this.h = h; this.people = []; this.t = 0; this.lineT = 6 + Math.random() * 4;
    const hour = g.sky.hour;
    const seen = new Set();
    for (const c of h.cast || []) {
      if (c.when && !c.when(hour)) continue;
      const key = Math.round(c.x * 3) + ':' + Math.round(c.z * 3);
      if (seen.has(key)) continue; // (nobody on anybody's lap)
      seen.add(key);
      const ch = g.chars.create(c.crowd ? randomDescOf(g) : { ...c.desc });
      const O = h.origin;
      const x = O.x + c.x, z = O.z + c.z, y = c.y || 0;
      ch.object.position.set(x, y, z); ch.object.rotation.y = c.h || 0;
      if (c.pose === 'sit') ch.setBase('sit'); else if (c.pose === 'talk') ch.setBase('talk');
      g.scene.add(ch.object);
      this.people.push({ ch, x, z, y, heading: c.h || 0, c });
    }
  }
  update(dt) {
    this.t += dt;
    for (const p of this.people) { p.ch.update(dt, 0, { fidget: p.c.pose !== 'sit' }); p.ch.object.position.set(p.x, p.y, p.z); p.ch.object.rotation.y = p.heading; }
    this.lineT -= dt;
    if (this.lineT > 0 || !this.people.length) return;
    this.lineT = 9 + Math.random() * 8;
    const pl = this.g.player;
    const near = this.people.filter((p) => p.c.lines && Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 9);
    if (!near.length) return;
    const p = near[Math.floor(Math.random() * near.length)];
    this.g.peds.say({ x: p.x, z: p.z, y: p.y }, p.c.lines[Math.floor(Math.random() * p.c.lines.length)], true);
  }
  dispose() { for (const p of this.people) { this.g.scene.remove(p.ch.object); p.ch.dispose(); } this.people = []; }
}
