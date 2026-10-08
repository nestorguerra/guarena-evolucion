// Calle Malfeitos, house by house, as it is: measured from the user's 21 photographs of the street (Google Street
// View, May 2024; the two at the Don Juan Durán corner, October 2021), used only to look at — nothing of them is in the
// game. Each picture's camera was put where it stood (its address bar: place, heading, tilt, field of view; the heading
// corrected by the street's vanishing point) and every front was unwarped, in metres, from the picture that sees it from
// nearest: that is where these numbers come from (docs/malfeitos.md).
// A house: its side of the street (E, W: as the street runs from the calle Nueva, its first node) and its frontage s0..s1
// in metres along the street; then, in metres from its left end as seen from the street (x: from s0 on the east side,
// from s1 on the west side) and up from the pavement (y):
//   wall / mat        the paint (as it looks in the sun) and what the wall is (cal, rugoso, ladrillo, piedra)
//   H, roof, parapet  the height of its front, its roof (flat, tile) and the parapet over a flat one
//   paint             areas of another paint, flush with the wall: plinths, two-tone fronts, panels (notch: cut corners)
//   relief            what stands proud: bands, pilasters, cornices (prof: layers [height, out]), stone cladding, bodies
//                     standing out (vol)
//   open              the openings, each with its hole (d: reveal depth; arch: rise of an arched top) and what is in
//                     it: frame, persiana (lvl 1 = down), reja, sill, surround (surr), balcony slab and rail, door
//                     leaf, steps, number, awning
//   extra             mailboxes, intercoms, plates, lamps, downpipes, cables, AC units, awnings (toldo)
//   top               parapet coping, terrace railings, balustrades, pergolas
// The houses are laid on the Catastro's walls under their frontage (fachadas.js): a house may span two of them.

// colours of calle Malfeitos (as seen in the sun)
const BLACK = '#1d1d1f';          // wrought iron
const WHITE_ALU = '#efefeb';      // white aluminium frames
const PERS_WHITE = '#f2f0ea';     // white roller shutters
const PERS_BROWN = '#6b4a32';     // brown roller shutters
const GREEN_AWNING = '#2a7a50';   // the green-and-white striped awnings
const TIJERA = '#bbb39d';         // folding grille gates (cancelas de tijera)
const GRANITE = '#a29d98', GRANITE_PINK = '#b4a69c';
const CANIZO = '#c9b48a';         // reed screens on the balconies

// ------------------------------------------------------------------ the east side (even numbers), from the calle Nueva
const E20 = { // nº 20 — the corner house on the calle Nueva: cream with pale ochre trims, two bays (a barred window and
  // the door, two balconies of cast-iron balusters, two small attic windows over the cornice)
  id: 'nº 20', side: 'E', s0: 8.1, s1: 15.9, H: 9.6, roof: 'flat', parapet: 0,
  wall: '#efe2c2',
  paint: [
    { x0: 0, x1: 7.8, y0: 0, y1: 1.05, col: '#f1d698' }, // the plinth, a deeper yellow
  ],
  relief: [
    { k: 'band', x0: 0, x1: 7.8, y0: 3.55, y1: 3.7, d: 0.025, col: '#f6dda2' },                  // the impost at the first floor
    { k: 'cornice', x0: 0, x1: 7.8, y: 7.2, prof: [[0.1, 0.05], [0.13, 0.12], [0.1, 0.2], [0.09, 0.26]], col: '#f4dca6', wrap0: true }, // the moulded cornice under the attic
    { k: 'cornice', x0: 0, x1: 7.8, y: 9.4, prof: [[0.09, 0.05], [0.12, 0.11]], col: '#f2e4c2', wrap0: true }, // the coping at the top
    { k: 'band', x0: 7.64, x1: 7.8, y0: 0, y1: 9.4, d: 0.02, col: '#f6dda2' },                   // the pilaster at the party wall
  ],
  open: [
    // bay 1: the barred window, the balcony over it, the attic window
    { k: 'win', x0: 0.95, x1: 2.35, y0: 1.25, y1: 2.95, d: 0.24, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.55 },
      surr: { w: 0.18, top: 0.3, ears: 0.08, col: '#f6dda2', y0: 1.12 }, sill: { col: '#f6dda2', paint: true, d: 0.05, h: 0.05, w: 0.18 },
      reja: { col: BLACK, x0: 0.8, x1: 2.5, y0: 1.17, y1: 3.05, gap: 0.12, hz: [0.33, 0.66], collars: [0.16, 0.5, 0.84], z: 0.08 } },
    { k: 'balc', x0: 1.23, x1: 2.08, y0: 4.12, y1: 6.55, d: 0.15, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 1 },
      surr: { w: 0.2, top: 0.36, ears: 0.1, col: '#f6dda2' },
      slab: { x0: 0.3, x1: 3.0, y: 4.12, t: 0.3, out: 0.38, col: '#f3e0b0' }, rail: { kind: 'ornate', h: 1.1, col: BLACK } },
    { k: 'win', x0: 1.08, x1: 2.23, y0: 8.3, y1: 8.82, d: 0.15, frame: { col: WHITE_ALU, leaves: 2 }, surr: { w: 0.14, top: 0.13, col: '#f6dda2', bottom: 0.12 } },
    // bay 2: the front door, the balcony over it, the attic window
    { k: 'door', x0: 5.62, x1: 6.62, y0: 0, y1: 2.9, d: 0.35, leaf: { kind: 'clavos', col: '#4b3526', nails: '#262220', sill: 0.3 },
      surr: { w: 0.24, top: 0.4, ears: 0.1, col: '#f6dda2' }, num: { text: '20', y: 3.04, h: 0.16, col: '#f1efe8', z: 0.016 },
      steps: [{ x0: 5.42, x1: 6.82, y1: 0.15, out: 0.32, col: '#b6b3ac' }, { x0: 5.62, x1: 6.62, y0: 0.15, y1: 0.3, out: 0.02, col: '#bdbab3' }] },
    { k: 'balc', x0: 5.8, x1: 6.65, y0: 4.12, y1: 6.55, d: 0.15, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 1 },
      surr: { w: 0.2, top: 0.36, ears: 0.1, col: '#f6dda2' },
      slab: { x0: 4.98, x1: 7.48, y: 4.12, t: 0.3, out: 0.38, col: '#f3e0b0' }, rail: { kind: 'ornate', h: 1.1, col: BLACK } },
    { k: 'win', x0: 5.65, x1: 6.8, y0: 8.3, y1: 8.82, d: 0.15, frame: { col: WHITE_ALU, leaves: 2 }, surr: { w: 0.14, top: 0.13, col: '#f6dda2', bottom: 0.12 } },
  ],
  extra: [
    { k: 'mailbox', x: 6.98, y: 1.42, w: 0.26, h: 0.34, col: '#1c1c1d' },
    { k: 'intercom', x: 6.98, y: 1.12 },
    { k: 'plate', x: 4.4, y: 3.0, w: 0.5, h: 0.34, col: '#ecebe6' },
    { k: 'camera', x: 7.3, y: 3.15 },
    { k: 'cable', pts: [[0, 7.12], [3.9, 7.08], [7.8, 7.05]], sag: 0.05 },
    { k: 'cable', pts: [[7.72, 7.0], [7.72, 3.45], [7.95, 3.3]], sag: 0 },
  ],
};

const E18 = { // nº 18 — white, three floors: a ground floor of grey granite with two shop fronts behind folding grilles
  // under a long green awning and a white panelled door; two balconies; a moulded cornice under the top floor
  id: 'nº 18', side: 'E', s0: 15.9, s1: 24.1, H: 9.1, roof: 'flat', parapet: 0,
  wall: '#f3f2ee',
  relief: [
    { k: 'stone', x0: 0, x1: 8.2, y0: 0, y1: 3.43, d: 0.03, col: GRANITE },
    { k: 'cornice', x0: 0, x1: 7.1, y: 6.95, prof: [[0.1, 0.04], [0.14, 0.1], [0.12, 0.17]], col: '#efe3c6' },
    { k: 'cornice', x0: 0, x1: 7.1, y: 8.95, prof: [[0.1, 0.05], [0.1, 0.1]], col: '#f2efe6' },
  ],
  open: [
    { k: 'shop', x0: 0.42, x1: 3.4, y0: 0, y1: 2.65, d: 0.16, frame: { col: '#8d9194' }, mullions: [1.9], gate: { col: TIJERA } },
    { k: 'shop', x0: 4.0, x1: 6.75, y0: 0, y1: 2.65, d: 0.16, frame: { col: '#8d9194' }, gate: { col: TIJERA } },
    { k: 'door', x0: 7.0, x1: 7.85, y0: 0, y1: 2.45, d: 0.22, leaf: { kind: 'cuarterones', col: '#eeede8', frameCol: '#e6e4de', transom: 0.3, metal: '#b8953f', sill: 0.04 } },
    { k: 'balc', x0: 1.75, x1: 2.55, y0: 3.98, y1: 5.9, d: 0.15, frame: { col: WHITE_ALU }, pers: { col: PERS_WHITE, lvl: 1 }, surr: { w: 0.12, top: 0.12, col: '#efe6cf' },
      slab: { x0: 0.45, x1: 3.25, y: 3.98, t: 0.24, out: 0.42, col: '#efe3c6' }, rail: { kind: 'ornate', h: 0.95, col: BLACK } },
    { k: 'balc', x0: 4.65, x1: 5.45, y0: 3.98, y1: 5.9, d: 0.15, frame: { col: WHITE_ALU }, pers: { col: PERS_WHITE, lvl: 1 }, surr: { w: 0.12, top: 0.12, col: '#efe6cf' },
      slab: { x0: 3.35, x1: 6.3, y: 3.98, t: 0.24, out: 0.42, col: '#efe3c6' }, rail: { kind: 'ornate', h: 0.95, col: BLACK } },
    { k: 'win', x0: 1.65, x1: 2.65, y0: 7.46, y1: 8.22, d: 0.15, frame: { col: WHITE_ALU, leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.45 }, surr: { w: 0.1, top: 0.1, col: '#efe6cf', bottom: 0.08 } },
    { k: 'win', x0: 4.55, x1: 5.55, y0: 7.46, y1: 8.22, d: 0.15, frame: { col: WHITE_ALU, leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.45 }, surr: { w: 0.1, top: 0.1, col: '#efe6cf', bottom: 0.08 } },
  ],
  extra: [
    { k: 'toldo', x0: 0.4, x1: 6.6, y: 3.27, drop: 1.1, out: 1.35, col: GREEN_AWNING },
    { k: 'cable', pts: [[0, 6.92], [4.1, 6.9], [7.1, 6.88]], sag: 0.05 },
  ],
};

const E16 = { // nº 16 — brick, built in 1979: a ground floor clad in pink granite with a garage behind a folding grille
  // and a short green awning; above it the floors stand out over the pavement in brick (reaching a metre over nº 18),
  // a long balcony behind a brick parapet with slots, a small top floor
  id: 'nº 16', side: 'E', s0: 24.1, s1: 29.8, H: 9.05, roof: 'flat', parapet: 0,
  wall: '#ecebe6',
  paint: [{ x0: -1.1, x1: 3.45, y0: 3.45, y1: 9.05, mat: 'ladrillo' }],
  relief: [
    { k: 'stone', x0: 0, x1: 5.7, y0: 0, y1: 3.42, d: 0.03, col: GRANITE_PINK },
    // the cantilevered brick: the first floor's parapet, then the second floor and the top
    { k: 'vol', x0: -1.1, x1: 3.45, y0: 3.45, y1: 4.6, d: 0.6, pat: 'BRICK', col: '#a65b3e', soffit: '#e8e5de', top: false },
    { k: 'band', x0: -1.12, x1: 3.47, y0: 4.55, y1: 4.65, z0: 0, d: 0.64, col: '#e9e6df' },                     // the parapet's coping
    { k: 'band', x0: -0.9, x1: 3.2, y0: 4.05, y1: 4.17, z0: 0.5, d: 0.605, col: '#3a2a24', metal: true },          // its slots
    { k: 'vol', x0: -1.1, x1: 3.45, y0: 6.55, y1: 9.05, d: 0.6, pat: 'BRICK', col: '#a65b3e', soffit: '#e8e5de', holes: [[1.3, 7.55, 2.2, 8.3]] },
    { k: 'band', x0: -1.12, x1: 3.47, y0: 6.5, y1: 6.6, z0: 0, d: 0.64, col: '#e9e6df' },
  ],
  open: [
    { k: 'gar', x0: 0.95, x1: 4.7, y1: 2.2, d: 0.14, leaf: { kind: 'tijera', col: TIJERA } },
    { k: 'door', x0: 5.0, x1: 5.6, y0: 0, y1: 2.2, d: 0.2, leaf: { kind: 'cuarterones', col: '#5c3a26' } },
    { k: 'win', x0: 1.5, x1: 2.6, y0: 4.9, y1: 5.9, d: 0.12, frame: { col: WHITE_ALU, leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.6 } },
  ],
  extra: [
    { k: 'toldo', x0: 0.9, x1: 4.7, y: 2.95, drop: 0.45, out: 0.55, col: GREEN_AWNING },
    { k: 'ac', x: 3.95, y: 5.3 },
  ],
};

const E_PIEDRA = { // the house of beige stone: a ground floor clad in limestone slabs — a recessed doorway, a window behind
  // a grey roller grille, a studded double door in granite; a terrace over the street with a railing of white slats;
  // the roof's slab standing out over it
  id: 'piedra', side: 'E', s0: 29.8, s1: 35.9, H: 7.3, roof: 'flat', parapet: 0,
  wall: '#ece6dc',
  relief: [
    { k: 'stone', x0: 0, x1: 6.1, y0: 0, y1: 3.3, d: 0.03, col: '#d8ccb6' },
    { k: 'band', x0: 0, x1: 6.1, y0: 3.3, y1: 3.45, d: 0.06, col: '#e9e4d8' },
    { k: 'band', x0: -0.1, x1: 6.1, y0: 6.3, y1: 6.55, z0: 0, d: 0.95, col: '#efece6' },   // the roof slab over the terrace
    { k: 'cornice', x0: 0, x1: 6.1, y: 7.05, prof: [[0.12, 0.05], [0.13, 0.1]], col: '#efece4' },
  ],
  open: [
    { k: 'door', x0: 0.48, x1: 1.44, y0: 0, y1: 2.43, d: 0.35, leaf: { kind: 'chapa', col: '#e2dccf', knocker: false } },
    { k: 'win', x0: 2.3, x1: 3.65, y0: 0.99, y1: 2.44, d: 0.15, frame: { col: '#8e9195', leaves: 2 }, pers: { col: '#9a9d9f', lvl: 1 } },
    { k: 'door', x0: 4.55, x1: 5.75, y0: 0, y1: 2.43, d: 0.26, leaf: { kind: 'clavos', n: 2, col: '#5a321f', nails: '#2a1d15' }, surr: { w: 0.12, top: 0.14, col: GRANITE, stone: true } },
    { k: 'balc', x0: 4.6, x1: 5.4, y0: 3.62, y1: 5.55, d: 0.15, frame: { col: '#f0efea' }, pers: { col: PERS_BROWN, lvl: 0.7 },
      slab: { x0: -0.05, x1: 5.55, y: 3.62, t: 0.2, out: 0.75, col: '#ecebe6', mould: false }, rail: { kind: 'lamas', h: 1.1, col: '#f2f1ed' } },
    { k: 'win', x0: 1.5, x1: 2.7, y0: 4.3, y1: 5.5, d: 0.18, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.75 } },
  ],
  extra: [
    { k: 'mailbox', x: 4.3, y: 1.7, w: 0.34, h: 0.24, col: '#f1f0ec' },
    { k: 'meter', x: 0.96, y: 1.95, w: 0.4, h: 0.3, col: '#efeeea' },
    { k: 'cable', pts: [[0, 3.6], [3, 3.5], [6.1, 3.47]], sag: 0.06 },
    { k: 'pipe', x: 5.98, y1: 6.3, col: '#d9d6cf' },
  ],
};

// nº 14 and nº 14ᴬ — twin houses, cream with the ground floor's plaster cut in courses: each a window behind a black
// grille with scrolls along its foot, in a moulded frame, a carved double door (oval medallions, brass handles) in a
// wide frame of granite, a balcony over the window hung with a reed screen
const twin14 = (id, s0, num) => ({
  id, side: 'E', s0, s1: s0 + 4.25, H: 7.1, roof: 'flat', parapet: 0,
  wall: '#ece8de',
  paint: [0.95, 1.4, 1.85, 2.3, 2.75].map((y) => ({ x0: 0.2, x1: 4.05, y0: y, y1: y + 0.025, col: '#d9d3c6' })), // (the courses' joints)
  relief: [
    { k: 'stone', x0: 0, x1: 4.25, y0: 0, y1: 0.55, d: 0.025, col: GRANITE },
    { k: 'band', x0: 0, x1: 4.25, y0: 3.0, y1: 3.14, d: 0.035, col: '#f2efe8' },                 // the impost
    { k: 'band', x0: 4.0, x1: 4.25, y0: 0.55, y1: 6.4, d: 0.03, col: '#f4f2ec' },                // the pilaster at the party wall
    { k: 'cornice', x0: 0, x1: 4.25, y: 6.35, prof: [[0.1, 0.05], [0.12, 0.12], [0.08, 0.17]], col: '#f2efe8' },
  ],
  open: [
    { k: 'win', x0: 0.62, x1: 1.72, y0: 0.62, y1: 2.5, d: 0.22, frame: { col: PERS_BROWN, leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.55 },
      surr: { w: 0.13, top: 0.15, col: '#f4f2ec', d: 0.025, bottom: 0.1 },
      reja: { col: BLACK, x0: 0.7, x1: 1.65, y0: 0.4, y1: 2.45, gap: 0.11, hz: [0.6], scrolls: [[0.0, 0.1]] } },
    { k: 'door', x0: 2.42, x1: 3.6, y0: 0, y1: 2.5, d: 0.24, leaf: { kind: 'cuarterones', n: 2, col: '#6d4428', panels: [[0.06, 0.42], [0.5, 0.94]], metal: '#b8953f' },
      surr: { w: 0.28, top: 0.32, col: '#a9a39c', stone: true, d: 0.035 }, num: { text: num, y: 2.62, h: 0.13, col: '#2a2420', z: 0.04 } },
    { k: 'balc', x0: 0.72, x1: 1.62, y0: 3.4, y1: 5.65, d: 0.3, frame: { col: PERS_BROWN }, pers: { col: PERS_BROWN, lvl: 0.5 }, surr: { w: 0.16, top: 0.22, col: '#f4f2ec', d: 0.05 },
      slab: { x0: 0.12, x1: 2.25, y: 3.4, t: 0.26, out: 0.5, col: '#efebe2' }, rail: { kind: 'canizo', h: 1.05, col: BLACK, screen: CANIZO } },
  ],
  extra: [
    { k: 'plate', x: 0.5, y: 2.95, w: 0.38, h: 0.3, col: '#efeeea' },
    { k: 'meter', x: 0.28, y: 2.0, w: 0.3, h: 0.36, col: '#efeeea' },
    { k: 'mailbox', x: 2.62, y: 1.45, w: 0.24, h: 0.34, col: '#5e5f60' },
    { k: 'intercom', x: 3.78, y: 1.35 },
    { k: 'cable', pts: [[0, 3.32], [2.1, 3.27], [4.25, 3.22]], sag: 0.06 },
  ],
});
const E14 = twin14('nº 14', 35.9, '14'), E14A = twin14('nº 14ᴬ', 40.15, '14ª');

const SALMON = { // the salmon house: white pilasters at both ends, white heads over the openings, three balconies with
  // black railings, two doors in granite and a tall barred window, a plinth of granite
  id: 'casa salmón', side: 'E', s0: 44.6, s1: 55.5, H: 7.7, roof: 'flat', parapet: 0,
  wall: '#edc1a0',
  relief: [
    { k: 'stone', x0: 0, x1: 10.9, y0: 0, y1: 0.7, d: 0.025, col: GRANITE },
    { k: 'band', x0: 0, x1: 0.22, y0: 0, y1: 7.0, d: 0.03, col: '#f6f2ea' },
    { k: 'band', x0: 10.68, x1: 10.9, y0: 0, y1: 7.0, d: 0.03, col: '#f6f2ea' },
    { k: 'band', x0: 0, x1: 10.9, y0: 3.38, y1: 3.5, d: 0.03, col: '#f6f2ea' },
    { k: 'cornice', x0: 0, x1: 10.9, y: 6.95, prof: [[0.1, 0.05], [0.14, 0.13], [0.1, 0.2]], col: '#f6f2ea' },
    { k: 'cornice', x0: 0, x1: 10.9, y: 7.5, prof: [[0.2, 0.06]], col: '#f6f2ea' },
  ],
  open: [
    { k: 'door', x0: 0.8, x1: 1.72, y0: 0, y1: 2.4, d: 0.2, leaf: { kind: 'cuarterones', col: '#5e5a56' }, surr: { w: 0.16, top: 0.22, col: '#aaa49d', stone: true, d: 0.03 } },
    { k: 'door', x0: 2.9, x1: 3.82, y0: 0, y1: 2.4, d: 0.2, leaf: { kind: 'cuarterones', col: '#4e3424' }, surr: { w: 0.16, top: 0.22, col: '#aaa49d', stone: true, d: 0.03 } },
    { k: 'win', x0: 6.2, x1: 7.2, y0: 0.3, y1: 2.6, d: 0.2, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.6 },
      reja: { col: BLACK, y0: 0.25, y1: 2.66, gap: 0.12, hz: [0.33, 0.66], collars: [0.16, 0.5, 0.84] } },
    { k: 'door', x0: 9.05, x1: 9.95, y0: 0, y1: 2.4, d: 0.2, leaf: { kind: 'alu', col: '#e4e2dc' }, surr: { w: 0.14, top: 0.2, col: '#aaa49d', stone: true, d: 0.03 } },
    { k: 'balc', x0: 0.85, x1: 1.7, y0: 3.75, y1: 5.85, d: 0.18, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.75 }, surr: { w: 0.14, top: 0.32, ears: 0.06, col: '#f6f2ea', d: 0.04 },
      slab: { x0: 0.25, x1: 2.3, y: 3.75, t: 0.24, out: 0.48, col: '#f4f0e8' }, rail: { kind: 'bars', h: 1.0, col: BLACK } },
    { k: 'balc', x0: 2.95, x1: 3.8, y0: 3.75, y1: 5.85, d: 0.18, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.75 }, surr: { w: 0.14, top: 0.32, ears: 0.06, col: '#f6f2ea', d: 0.04 },
      slab: { x0: 2.35, x1: 4.4, y: 3.75, t: 0.24, out: 0.48, col: '#f4f0e8' }, rail: { kind: 'bars', h: 1.0, col: BLACK } },
    { k: 'balc', x0: 6.25, x1: 7.1, y0: 3.75, y1: 5.85, d: 0.18, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.8 }, surr: { w: 0.14, top: 0.32, ears: 0.06, col: '#f6f2ea', d: 0.04 },
      slab: { x0: 5.65, x1: 7.7, y: 3.75, t: 0.24, out: 0.48, col: '#f4f0e8' }, rail: { kind: 'bars', h: 1.0, col: BLACK } },
    { k: 'win', x0: 9.1, x1: 9.9, y0: 4.3, y1: 5.85, d: 0.18, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.5 }, surr: { w: 0.14, top: 0.32, ears: 0.06, col: '#f6f2ea', d: 0.04 } },
  ],
  extra: [
    { k: 'meter', x: 0.45, y: 3.9, w: 0.3, h: 0.4, col: '#efeeea' },
    { k: 'cable', pts: [[0, 3.6], [5.4, 3.5], [10.9, 3.45]], sag: 0.08 },
  ],
};

const E_BLANCA = { // the white house of the tiled roof: a cream plinth, a tall window behind a dark grille, its door, a
  // window behind a black grille; three balconies with black railings upstairs
  id: 'casa blanca del tejado', side: 'E', s0: 55.5, s1: 68.3, H: 6.25, roof: 'tile',
  wall: '#f1efe9',
  paint: [{ x0: 0, x1: 12.81, y0: 0, y1: 0.85, col: '#e7dcc6' }],
  relief: [{ k: 'band', x0: 0, x1: 12.81, y0: 3.45, y1: 3.6, d: 0.025, col: '#f6f5f1' }],
  open: [
    { k: 'win', x0: 1.35, x1: 2.75, y0: 0.2, y1: 2.45, d: 0.25, frame: { col: '#3a2c22', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.3 },
      reja: { col: '#2a2420', y0: 0.15, y1: 2.5, gap: 0.14, hz: [0.25, 0.5, 0.75] } },
    { k: 'door', x0: 7.05, x1: 7.8, y0: 0, y1: 2.35, d: 0.3, leaf: { kind: 'tablas', col: '#5b4030' }, steps: [{ x0: 6.9, x1: 7.95, y1: 0.12, out: 0.25, col: '#cfc9bc' }] },
    { k: 'win', x0: 9.6, x1: 10.6, y0: 0.35, y1: 2.45, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.4 },
      reja: { col: BLACK, y0: 0.3, y1: 2.5, gap: 0.11, hz: [0.33, 0.66], collars: [0.16, 0.5, 0.84] } },
    { k: 'balc', x0: 1.65, x1: 2.55, y0: 3.75, y1: 5.55, d: 0.2, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.6 },
      slab: { x0: 0.85, x1: 3.35, y: 3.75, t: 0.2, out: 0.45, col: '#f1efe9', mould: false }, rail: { kind: 'bars', h: 1.0, col: BLACK } },
    { k: 'balc', x0: 6.65, x1: 7.45, y0: 3.75, y1: 5.55, d: 0.2, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.7 },
      slab: { x0: 5.95, x1: 8.15, y: 3.75, t: 0.2, out: 0.45, col: '#f1efe9', mould: false }, rail: { kind: 'bars', h: 1.0, col: BLACK } },
    { k: 'balc', x0: 9.75, x1: 10.55, y0: 3.75, y1: 5.55, d: 0.2, frame: { col: '#f0efea' }, pers: { col: '#d8d6d0', lvl: 0.5 },
      slab: { x0: 8.95, x1: 11.35, y: 3.75, t: 0.2, out: 0.45, col: '#f1efe9', mould: false }, rail: { kind: 'bars', h: 1.0, col: BLACK } },
  ],
  extra: [
    { k: 'plate', x: 8.45, y: 1.3, w: 0.3, h: 0.2, col: '#d9d6cf' },
    { k: 'cable', pts: [[0, 3.42], [6.4, 3.32], [12.81, 3.28]], sag: 0.08 },
  ],
};

// Correos: three floors, the post office on the ground floor (its yellow sign, glass fronts), a door in granite and a
// portal; six bays of balconies on each floor, green awnings over the first floor's
const corBays = [1.65, 4.4, 7.15, 9.9, 12.65, 15.4];
const E_CORREOS = {
  id: 'Correos', side: 'E', s0: 68.3, s1: 85.5, H: 9.3, roof: 'flat', parapet: 0,
  wall: '#f3f2ee',
  relief: [
    { k: 'stone', x0: 0, x1: 17.2, y0: 0, y1: 0.45, d: 0.025, col: GRANITE },
    { k: 'band', x0: 0, x1: 17.2, y0: 3.45, y1: 3.6, d: 0.04, col: '#efede6' },
    { k: 'cornice', x0: 0, x1: 17.2, y: 9.0, prof: [[0.12, 0.05], [0.14, 0.12]], col: '#efede6' },
  ],
  open: [
    { k: 'shop', x0: 2.1, x1: 5.7, y0: 0.35, y1: 2.7, d: 0.18, frame: { col: '#c9cbcd' } },
    { k: 'shop', x0: 6.4, x1: 7.5, y0: 0, y1: 2.7, d: 0.18, frame: { col: '#c9cbcd' } },
    { k: 'shop', x0: 8.0, x1: 10.4, y0: 0.35, y1: 2.7, d: 0.18, frame: { col: '#c9cbcd' } },
    { k: 'door', x0: 11.6, x1: 12.5, y0: 0, y1: 2.45, d: 0.22, leaf: { kind: 'alu', col: '#e9e8e3' }, surr: { w: 0.2, top: 0.2, col: GRANITE, stone: true, d: 0.03 } },
    { k: 'gate', x0: 13.4, x1: 15.2, y0: 0, y1: 2.6, d: 0.6, leaf: { kind: 'cristal', col: '#c9cbcd' } },
    ...corBays.flatMap((c) => [
      { k: 'balc', x0: c - 0.45, x1: c + 0.45, y0: 3.9, y1: 5.95, d: 0.18, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.7 },
        slab: { x0: c - 1.1, x1: c + 1.1, y: 3.9, t: 0.2, out: 0.5, col: '#efede6', mould: false }, rail: { kind: 'bars', h: 0.98, col: BLACK } },
      { k: 'balc', x0: c - 0.45, x1: c + 0.45, y0: 6.5, y1: 8.55, d: 0.18, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.6 },
        slab: { x0: c - 1.1, x1: c + 1.1, y: 6.5, t: 0.2, out: 0.5, col: '#efede6', mould: false }, rail: { kind: 'bars', h: 0.98, col: BLACK } },
    ]),
  ],
  extra: [
    { k: 'box', x0: 0.5, y0: 2.85, x1: 10.7, y1: 3.35, d: 0.15, col: '#f2c418' },            // the yellow sign of Correos
    { k: 'box', x0: 9.6, y0: 2.9, x1: 10.25, y1: 3.3, d: 0.16, col: '#1f3f8f' },             // its blue crown
    ...corBays.map((c) => ({ k: 'toldo', x0: c - 0.75, x1: c + 0.75, y: 6.15, drop: 0.45, out: 0.6, col: GREEN_AWNING })),
    { k: 'ac', x: 5.5, y: 7.0 }, { k: 'ac', x: 8.3, y: 4.5 }, { k: 'ac', x: 11.05, y: 7.0 },
  ],
};

const E_OCRE = { // the ochre house of the white surrounds: its doors in white frames, two windows behind black grilles,
  // four balconies upstairs under moulded heads, a tiled roof
  id: 'casa ocre de los recercados', side: 'E', s0: 85.5, s1: 96.4, H: 7.2, roof: 'tile',
  wall: '#e7c39b',
  paint: [{ x0: 0, x1: 10.9, y0: 0, y1: 0.7, col: '#d6ae84' }],
  relief: [
    { k: 'band', x0: 0, x1: 10.9, y0: 3.5, y1: 3.65, d: 0.03, col: '#f7f3ea' },
    { k: 'cornice', x0: 0, x1: 10.9, y: 6.85, prof: [[0.1, 0.05], [0.12, 0.12]], col: '#f7f3ea' },
  ],
  open: [
    { k: 'door', x0: 0.15, x1: 1.05, y0: 0, y1: 2.6, d: 0.25, leaf: { kind: 'clavos', col: '#4b3526' }, surr: { w: 0.2, top: 0.25, col: '#f8f5ee', d: 0.02 } },
    { k: 'door', x0: 2.4, x1: 3.6, y0: 0, y1: 2.85, d: 0.3, leaf: { kind: 'cuarterones', n: 2, col: '#5a3a26' }, surr: { w: 0.25, top: 0.3, col: '#f8f5ee', d: 0.02 } },
    { k: 'win', x0: 5.9, x1: 6.95, y0: 0.55, y1: 2.75, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.5 },
      surr: { w: 0.16, top: 0.2, col: '#f8f5ee', d: 0.02 }, sill: { col: '#f8f5ee', paint: true, w: 0.16 }, reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
    { k: 'win', x0: 8.4, x1: 9.45, y0: 0.55, y1: 2.75, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.5 },
      surr: { w: 0.16, top: 0.2, col: '#f8f5ee', d: 0.02 }, sill: { col: '#f8f5ee', paint: true, w: 0.16 }, reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
    ...[1.05, 3.85, 6.4, 8.9].map((c) => ({ k: 'balc', x0: c - 0.45, x1: c + 0.45, y0: 4.1, y1: 6.15, d: 0.2, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.75 },
      surr: { w: 0.15, top: 0.35, ears: 0.08, col: '#f8f5ee', d: 0.04 },
      slab: { x0: c - 1.05, x1: c + 1.05, y: 4.1, t: 0.22, out: 0.45, col: '#f3ece0' }, rail: { kind: 'bars', h: 1.0, col: BLACK } })),
  ],
  extra: [
    { k: 'plate', x: 4.6, y: 2.25, w: 0.9, h: 0.22, col: '#f6f4ee' },
    { k: 'cable', pts: [[0, 3.85], [5.4, 3.75], [10.9, 3.7]], sag: 0.08 },
  ],
};

const E_GARAJE = { // the low white house of the arched garage: a barred window, the arched garage door under its moulding
  id: 'casa del garaje en arco', side: 'E', s0: 96.4, s1: 103.7, H: 4.4, roof: 'tile',
  wall: '#f3f2ee',
  paint: [{ x0: 0, x1: 7.31, y0: 0, y1: 0.7, col: '#e6e1d6' }],
  relief: [{ k: 'band', x0: 3.55, x1: 6.25, y0: 3.12, y1: 3.32, d: 0.04, col: '#f8f7f3' }],
  open: [
    { k: 'win', x0: 1.0, x1: 1.85, y0: 0.95, y1: 2.4, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.4 },
      reja: { col: BLACK, gap: 0.12, hz: [0.33, 0.66] } },
    { k: 'gar', x0: 3.85, x1: 5.95, y1: 3.0, arch: 0.4, d: 0.15, leaf: { kind: 'sectional', col: '#efeee9' } },
  ],
  extra: [{ k: 'plate', x: 2.2, y: 2.65, w: 0.45, h: 0.3, col: '#f4f4f0' }],
};

const E_BAJA = { // a single storey, white, a grey door
  id: 'casa baja blanca', side: 'E', s0: 103.7, s1: 109.1, H: 3.7, roof: 'flat', parapet: 0.25,
  wall: '#f2f1ec',
  open: [{ k: 'door', x0: 2.4, x1: 3.3, y0: 0, y1: 2.15, d: 0.2, leaf: { kind: 'chapa', col: '#8f9192', knocker: false } }],
  extra: [{ k: 'pipe', x: 0.9, y1: 3.6, col: '#d9d6cf' }],
};

// the modern block at the south end: white, its windows set in full-height bands of grey (two to a bay) between white
// pilasters, a grey plinth; balconies with black railings on every other bay upstairs, a blank stretch before the corner
const modBays = [0.3, 3.4, 6.5, 9.6, 12.7, 15.8, 18.9];
const MOD_GREY = '#8d9194';
const E_MODERNO = {
  id: 'edificio de las bandas grises', side: 'E', s0: 109.1, s1: 135.5, H: 7.3, roof: 'flat', parapet: 0,
  wall: '#f1f0ec',
  paint: [
    { x0: 0, x1: 26.55, y0: 0, y1: 0.6, col: MOD_GREY },
    ...modBays.flatMap((b) => [{ x0: b + 0.4, x1: b + 1.4, y0: 0.6, y1: 6.95, col: MOD_GREY }, { x0: b + 1.6, x1: b + 2.6, y0: 0.6, y1: 6.95, col: MOD_GREY }]),
  ],
  relief: [
    ...[0, 3.1, 6.2, 9.3, 12.4, 15.5, 18.6, 21.7].map((x) => ({ k: 'band', x0: x + 0.02, x1: x + 0.38, y0: 0.6, y1: 6.95, d: 0.04, col: '#f4f4f1' })),
    { k: 'band', x0: 26.2, x1: 26.55, y0: 0.6, y1: 6.95, d: 0.05, col: MOD_GREY },
    { k: 'cornice', x0: 0, x1: 26.55, y: 6.95, prof: [[0.15, 0.05], [0.2, 0.1]], col: '#f4f4f1' },
  ],
  open: modBays.flatMap((b, i) => [
    { k: 'win', x0: b + 0.55, x1: b + 1.25, y0: 0.85, y1: 2.2, d: 0.16, frame: { col: '#6f7376' }, reja: { col: BLACK, gap: 0.1, hz: [0.5] } },
    { k: 'win', x0: b + 1.75, x1: b + 2.45, y0: 0.85, y1: 2.2, d: 0.16, frame: { col: '#6f7376' }, reja: { col: BLACK, gap: 0.1, hz: [0.5] } },
    i % 2 === 0
      ? { k: 'balc', x0: b + 0.55, x1: b + 1.25, y0: 4.2, y1: 6.25, d: 0.16, frame: { col: '#6f7376' }, pers: { col: PERS_WHITE, lvl: 0.75 },
        slab: { x0: b + 0.3, x1: b + 2.7, y: 4.2, t: 0.18, out: 0.55, col: '#e8e7e2', mould: false }, rail: { kind: 'bars', h: 1.0, col: BLACK } }
      : { k: 'win', x0: b + 0.6, x1: b + 1.2, y0: 4.6, y1: 6.2, d: 0.16, frame: { col: '#6f7376', leaves: 1 }, pers: { col: PERS_WHITE, lvl: 0.5 } },
    i % 2 === 0
      ? { k: 'balc', x0: b + 1.75, x1: b + 2.45, y0: 4.2, y1: 6.25, d: 0.16, frame: { col: '#6f7376' }, pers: { col: PERS_WHITE, lvl: 0.6 } }
      : { k: 'win', x0: b + 1.8, x1: b + 2.4, y0: 4.6, y1: 6.2, d: 0.16, frame: { col: '#6f7376', leaves: 1 }, pers: { col: PERS_WHITE, lvl: 0.5 } },
  ]),
};

// ------------------------------------------------------------------ the west side (odd numbers), from the calle Nueva
const OCHRE_W = '#cfa877';
const W_ESQ_BAJA = { // the corner block's low wing: two barred windows, a patch of grey render, a railing on its roof
  id: 'esquina (ala baja)', side: 'W', s0: 4.5, s1: 8.7, H: 4.6, roof: 'flat', parapet: 0,
  wall: OCHRE_W,
  paint: [{ x0: 2.3, x1: 3.9, y0: 1.9, y1: 3.4, col: '#aaa39b' }],
  open: [
    { k: 'win', x0: 0.1, x1: 0.95, y0: 0.45, y1: 2.35, d: 0.22, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.6 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' },
      reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
    { k: 'win', x0: 1.3, x1: 2.2, y0: 0.2, y1: 2.45, d: 0.22, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.4 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' },
      reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
  ],
  top: { rails: [{ x0: 0.1, x1: 4.1, y: 4.6, h: 0.95, kind: 'bars', col: BLACK, z: -0.12 }] },
};

const W_ESQ = { // the corner block: ochre, two storeys and a roof terrace with white pillars, its railing and a pergola of
  // corrugated sheet; on the ground floor windows behind grilles, doors in white frames and a white roller garage door;
  // upstairs two long balconies with brown roller shutters, two windows and a lantern
  id: 'esquina (cuerpo principal)', side: 'W', s0: 8.7, s1: 24.2, H: 7.9, roof: 'flat', parapet: 0,
  wall: OCHRE_W,
  paint: [{ x0: 0, x1: 15.47, y0: 0, y1: 0.45, col: '#b8956a' }],
  relief: [
    { k: 'band', x0: 0, x1: 15.47, y0: 3.55, y1: 3.68, d: 0.03, col: '#d9bb90' },
    { k: 'cornice', x0: 0, x1: 15.47, y: 7.45, prof: [[0.12, 0.04], [0.33, 0.08]], col: '#ece8de' },
  ],
  open: [
    { k: 'win', x0: 1.75, x1: 2.65, y0: 0.45, y1: 2.35, d: 0.22, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.5 }, reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
    { k: 'door', x0: 4.65, x1: 5.9, y0: 0, y1: 2.45, d: 0.25, leaf: { kind: 'alu', col: '#e8e6e0' }, surr: { w: 0.18, top: 0.2, col: '#f1ede4', d: 0.02 } },
    { k: 'win', x0: 8.1, x1: 8.95, y0: 0.45, y1: 2.35, d: 0.22, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.5 }, reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
    { k: 'gar', x0: 10.9, x1: 13.4, y1: 2.45, d: 0.12, leaf: { kind: 'roller', col: '#f1f0ec' } },
    { k: 'door', x0: 14.05, x1: 15.0, y0: 0, y1: 2.45, d: 0.25, leaf: { kind: 'tablas', col: '#5b4030' }, surr: { w: 0.18, top: 0.2, col: '#f1ede4', d: 0.02 } },
    { k: 'balc', x0: 1.75, x1: 2.65, y0: 4.2, y1: 6.35, d: 0.2, frame: { col: '#5a3a24' }, pers: { col: PERS_BROWN, lvl: 0.85 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' } },
    { k: 'balc', x0: 4.15, x1: 6.4, y0: 4.2, y1: 6.35, d: 0.2, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.8 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' },
      slab: { x0: 1.2, x1: 7.3, y: 4.2, t: 0.22, out: 0.48, col: '#d8c3a2', mould: false }, rail: { kind: 'panel', h: 1.0, col: '#2b2b2c', panel: '#2b2b2c', panelH: 0.4 } },
    { k: 'win', x0: 7.7, x1: 8.6, y0: 4.65, y1: 6.35, d: 0.2, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.7 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' } },
    { k: 'balc', x0: 10.9, x1: 13.4, y0: 4.2, y1: 6.35, d: 0.2, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.9 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' },
      slab: { x0: 9.4, x1: 14.6, y: 4.2, t: 0.22, out: 0.48, col: '#d8c3a2', mould: false }, rail: { kind: 'panel', h: 1.0, col: '#2b2b2c', panel: '#2b2b2c', panelH: 0.4 } },
    { k: 'win', x0: 14.15, x1: 15.0, y0: 4.65, y1: 6.35, d: 0.2, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.7 }, surr: { w: 0.1, top: 0.1, col: '#efe9de' } },
  ],
  extra: [
    { k: 'lamp', x: 15.25, y: 4.75 },
    { k: 'cable', pts: [[0, 3.95], [7.7, 3.85], [15.47, 3.8]], sag: 0.1 },
    { k: 'pipe', x: 15.35, y1: 7.4, col: '#2a2a2a', r: 0.03 },
  ],
  top: {
    posts: [0.25, 3.95, 7.7, 11.45, 15.2].map((x) => ({ x, y0: 7.9, y1: 9.0, w: 0.42, z: -0.25, col: '#f1efe9' })),
    rails: [{ x0: 0.2, x1: 15.3, y: 7.9, h: 1.0, kind: 'bars', col: '#e9e8e4', z: -0.25 }],
    pergola: { x0: 0.25, x1: 15.2, posts: [0.25, 3.95, 7.7, 11.45, 15.2], y0: 9.0, y1: 9.35, depth: 4.5, z: -0.25, rise: 0.5, col: '#f0efea', sheet: '#c7cbcf' },
  },
};

const W9 = { // nº 9 — pale yellow, its arched door in a granite frame, two windows behind wrought grilles in white frames;
  // three balconies of cast-iron balusters, brown roller shutters
  id: 'nº 9', side: 'W', s0: 24.2, s1: 33.8, H: 7.45, roof: 'flat', parapet: 0,
  wall: '#f3e4b9',
  relief: [
    { k: 'stone', x0: 4.15, x1: 6.3, y0: 0, y1: 3.15, d: 0.03, col: GRANITE },
    { k: 'cornice', x0: 0, x1: 9.63, y: 6.95, prof: [[0.12, 0.05], [0.14, 0.12], [0.1, 0.18]], col: '#f6eccf' },
  ],
  open: [
    { k: 'win', x0: 0.95, x1: 2.4, y0: 0.1, y1: 2.6, d: 0.22, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.35 }, surr: { w: 0.14, top: 0.16, col: '#fbf8ef', d: 0.02 },
      reja: { col: BLACK, gap: 0.13, hz: [0.3, 0.55], scrolls: [[0.02, 0.1]], collars: [0.42] } },
    { k: 'door', x0: 4.95, x1: 5.85, y0: 0, y1: 2.7, arch: 0.3, d: 0.3, leaf: { kind: 'cuarterones', n: 2, col: '#4a2f22' }, num: { text: '9', y: 2.92, h: 0.16, col: '#2b2420', z: 0.04 } },
    { k: 'win', x0: 7.65, x1: 8.5, y0: 0.1, y1: 2.6, d: 0.22, frame: { col: '#5a3a24', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.35 }, surr: { w: 0.14, top: 0.16, col: '#fbf8ef', d: 0.02 },
      reja: { col: BLACK, gap: 0.13, hz: [0.3, 0.55], scrolls: [[0.02, 0.1]], collars: [0.42] } },
    ...[[1.85, 2.65, 0.6, 3.0], [5.2, 6.0, 3.7, 6.1], [7.85, 8.65, 6.6, 8.75]].map(([a, b, s0, s1]) => ({ k: 'balc', x0: a, x1: b, y0: 4.05, y1: 6.3, d: 0.18, frame: { col: '#5a3a24' }, pers: { col: PERS_BROWN, lvl: 0.95 },
      slab: { x0: s0, x1: s1, y: 4.05, t: 0.25, out: 0.45, col: '#f4eccf' }, rail: { kind: 'ornate', h: 0.98, col: BLACK } })),
  ],
  extra: [
    { k: 'ac', x: 6.2, y: 6.45 },
    { k: 'meter', x: 6.55, y: 1.45, w: 0.28, h: 0.2, col: '#efeeea' },
    { k: 'cable', pts: [[0, 3.75], [4.8, 3.7], [9.63, 3.62]], sag: 0.1 },
  ],
};

const OCHRE_7 = '#dba862';
const W7 = { // nº 7 — white with ochre frames: arched windows behind grilles, its arched door in an ochre frame, a long
  // balcony between two windows upstairs, an ochre cornice
  id: 'nº 7', side: 'W', s0: 33.8, s1: 43.6, H: 7.35, roof: 'flat', parapet: 0,
  wall: '#f7f6f1',
  paint: [{ x0: 0, x1: 9.85, y0: 0, y1: 0.5, col: OCHRE_7 }],
  relief: [
    { k: 'band', x0: 0, x1: 9.85, y0: 3.3, y1: 3.45, d: 0.03, col: OCHRE_7 },
    { k: 'cornice', x0: 0, x1: 9.85, y: 6.5, prof: [[0.12, 0.05], [0.14, 0.11]], col: OCHRE_7 },
    { k: 'cornice', x0: 0, x1: 9.85, y: 7.15, prof: [[0.2, 0.06]], col: '#f2efe6' },
  ],
  open: [
    { k: 'win', x0: 0.56, x1: 1.39, y0: 0.6, y1: 2.3, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.5 }, surr: { w: 0.14, top: 0.16, col: OCHRE_7, d: 0.02 }, reja: { col: BLACK, gap: 0.12, hz: [0.5] } },
    { k: 'win', x0: 2.17, x1: 3.45, y0: 0.35, y1: 2.45, arch: 0.4, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, surr: { w: 0.12, top: 0.12, col: OCHRE_7, d: 0.02 }, reja: { col: BLACK, gap: 0.12, hz: [0.45, 0.75] } },
    { k: 'door', x0: 5.29, x1: 6.23, y0: 0, y1: 2.5, arch: 0.35, d: 0.28, leaf: { kind: 'cuarterones', col: '#4a2f22' }, surr: { w: 0.45, top: 0.4, col: OCHRE_7, d: 0.02 }, num: { text: '7', y: 2.72, h: 0.15, col: '#2b2420', z: 0.03 } },
    { k: 'win', x0: 7.96, x1: 9.01, y0: 0.35, y1: 2.45, arch: 0.4, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, surr: { w: 0.12, top: 0.12, col: OCHRE_7, d: 0.02 }, reja: { col: BLACK, gap: 0.12, hz: [0.45, 0.75] } },
    { k: 'win', x0: 1.95, x1: 3.0, y0: 4.7, y1: 5.75, d: 0.2, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.65 }, surr: { w: 0.14, top: 0.14, col: OCHRE_7, d: 0.02, bottom: 0.1 } },
    { k: 'balc', x0: 4.51, x1: 7.07, y0: 4.25, y1: 5.85, d: 0.2, frame: { col: '#f0efea', leaves: 3 }, pers: { col: PERS_WHITE, lvl: 0.35 }, surr: { w: 0.14, top: 0.14, col: OCHRE_7, d: 0.02 },
      slab: { x0: 3.34, x1: 7.18, y: 4.25, t: 0.22, out: 0.4, col: OCHRE_7 }, rail: { kind: 'bars', h: 0.95, col: BLACK } },
    { k: 'win', x0: 8.4, x1: 9.5, y0: 4.65, y1: 5.75, d: 0.2, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.7 }, surr: { w: 0.14, top: 0.14, col: OCHRE_7, d: 0.02, bottom: 0.1 } },
  ],
  extra: [{ k: 'lamp', x: 7.85, y: 5.0 }, { k: 'cable', pts: [[0, 3.15], [4.9, 3.05], [9.85, 3.0]], sag: 0.08 }],
};

const W_LADRILLO = { // the brick block (1977): cream slab edges, windows with brown roller shutters, a garage, windows
  // behind grilles on the ground floor, a lantern; to the north a lower wing with a terrace
  id: 'edificio de ladrillo', side: 'W', s0: 43.6, s1: 56.9, H: 10.3, roof: 'flat', parapet: 0, heights: [{ x0: 10.8, x1: 13.3, H: 6.9 }],
  wall: '#8f7464',
  relief: [
    // (its brick: a greyish brown, laid as a facing round the openings)
    { k: 'vol', x0: 0, x1: 10.8, y0: 0, y1: 10.3, d: 0.015, skin: true, pat: 'BRICK', col: '#9a7b6a', holes: 'auto' },
    { k: 'vol', x0: 10.8, x1: 13.3, y0: 0, y1: 6.9, d: 0.015, skin: true, pat: 'BRICK', col: '#9a7b6a', holes: 'auto' },
    { k: 'band', x0: 0, x1: 13.3, y0: 3.05, y1: 3.4, d: 0.12, col: '#e6d8bb' },
    { k: 'band', x0: 0, x1: 10.8, y0: 6.6, y1: 6.95, d: 0.12, col: '#e6d8bb' },
    { k: 'band', x0: 0, x1: 10.8, y0: 10.05, y1: 10.3, d: 0.08, col: '#e6d8bb' },
  ],
  open: [
    { k: 'win', x0: 2.45, x1: 4.4, y0: 1.0, y1: 2.5, d: 0.15, frame: { col: '#9a9d9f', leaves: 2 }, pers: { col: '#a3a6a8', lvl: 1 } },
    { k: 'gar', x0: 5.75, x1: 7.25, y1: 2.6, d: 0.12, leaf: { kind: 'basculante', col: '#7a5236' } },
    { k: 'win', x0: 9.3, x1: 10.6, y0: 1.2, y1: 2.6, d: 0.15, frame: { col: '#8e9195', leaves: 2 }, reja: { col: BLACK, gap: 0.11, hz: [0.5] } },
    { k: 'door', x0: 11.0, x1: 12.6, y0: 0, y1: 2.5, d: 0.15, leaf: { kind: 'chapa', col: '#8a8c8e', knocker: false } },
    ...[[0.3, 1.6], [3.0, 4.4], [8.0, 9.2]].flatMap(([a, b]) => [
      { k: 'win', x0: a, x1: b, y0: 4.25, y1: 5.85, d: 0.15, frame: { col: '#e8dcc2', leaves: 2 }, pers: { col: '#c9b796', lvl: 0.55 }, sill: { col: '#e6d8bb', w: 0.05 } },
      { k: 'win', x0: a, x1: b, y0: 7.75, y1: 9.35, d: 0.15, frame: { col: '#e8dcc2', leaves: 2 }, pers: { col: '#c9b796', lvl: 0.6 }, sill: { col: '#e6d8bb', w: 0.05 } },
    ]),
    { k: 'balc', x0: 11.2, x1: 12.4, y0: 3.45, y1: 5.65, d: 0.2, frame: { col: '#e8dcc2', leaves: 2 }, pers: { col: '#c9b796', lvl: 0.5 },
      slab: { x0: 10.9, x1: 13.2, y: 3.45, t: 0.15, out: 0.25, col: '#e6d8bb', mould: false }, rail: { kind: 'tubos', h: 1.05, col: '#cfcfca' } },
  ],
  extra: [
    { k: 'lamp', x: 3.75, y: 5.0 },
    { k: 'ac', x: 9.6, y: 6.2 },
    { k: 'cable', pts: [[0, 3.55], [6.6, 3.45], [13.3, 3.4]], sag: 0.1 },
  ],
};

const W_FISIO = { // the house of the physiotherapy centre: three floors, ochre with a dark red ground floor and a white band;
  // white frames round the windows, small balconies on the top floor, its sign, a lantern; to the north a lower wing
  id: 'casa de la fisioterapia', side: 'W', s0: 61.0, s1: 81.1, H: 9.6, roof: 'tile', heights: [{ x0: 15.71, x1: 20.1, H: 6.6, roof: 'tile' }],
  wall: '#ebc57f',
  paint: [{ x0: 0, x1: 20.1, y0: 0, y1: 3.37, col: '#8e3434' }],
  relief: [
    { k: 'band', x0: 0, x1: 20.1, y0: 3.37, y1: 3.52, d: 0.04, col: '#f4f1ea' },
    { k: 'cornice', x0: 0, x1: 15.71, y: 9.35, prof: [[0.12, 0.05], [0.12, 0.12]], col: '#f2ede2' },
  ],
  open: [
    { k: 'door', x0: 5.58, x1: 6.55, y0: 0, y1: 2.6, d: 0.2, leaf: { kind: 'alu', col: '#f3f3f0' }, surr: { w: 0.12, top: 0.12, col: '#f4f1ea', d: 0.02 } },
    { k: 'door', x0: 9.25, x1: 10.23, y0: 0, y1: 2.6, d: 0.2, leaf: { kind: 'cristal' }, surr: { w: 0.12, top: 0.12, col: '#f4f1ea', d: 0.02 } },
    { k: 'win', x0: 11.09, x1: 12.07, y0: 1.0, y1: 2.6, d: 0.2, frame: { col: '#f3f3f0', leaves: 2 }, surr: { w: 0.12, top: 0.12, col: '#f4f1ea', d: 0.02 } },
    { k: 'win', x0: 14.45, x1: 15.42, y0: 1.0, y1: 2.6, d: 0.2, frame: { col: '#f3f3f0', leaves: 2 }, surr: { w: 0.12, top: 0.12, col: '#f4f1ea', d: 0.02 } },
    ...[[5.58, 6.88], [9.25, 10.55], [13.69, 14.99]].flatMap(([a, b]) => [
      { k: 'win', x0: a + 0.15, x1: b - 0.15, y0: 5.0, y1: 6.15, d: 0.2, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.7 }, surr: { w: 0.15, top: 0.15, col: '#f6f3ec', d: 0.025, bottom: 0.12 } },
      { k: 'balc', x0: a + 0.15, x1: b - 0.15, y0: 7.25, y1: 8.55, d: 0.2, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.6 }, surr: { w: 0.15, top: 0.15, col: '#f6f3ec', d: 0.025 },
        slab: { x0: a, x1: b, y: 7.25, t: 0.12, out: 0.18, col: '#f6f3ec', mould: false }, rail: { kind: 'bars', h: 0.6, col: BLACK } },
    ]),
    { k: 'win', x0: 17.0, x1: 18.0, y0: 4.6, y1: 5.9, d: 0.2, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_BROWN, lvl: 0.6 }, surr: { w: 0.15, top: 0.15, col: '#f6f3ec', d: 0.025 } },
    { k: 'door', x0: 18.5, x1: 19.4, y0: 0, y1: 2.5, d: 0.2, leaf: { kind: 'tablas', col: '#f1f0ec' } },
  ],
  extra: [
    { k: 'plate', x: 2.8, y: 3.0, w: 5.4, h: 0.32, col: '#f2f2ef', d: 0.04 },
    { k: 'box', x0: 0.2, y0: 3.07, x1: 5.3, y1: 3.15, d: 0.045, col: '#2f8a4c' },
    { k: 'lamp', x: 6.7, y: 4.75 },
    { k: 'cable', pts: [[0, 3.75], [10, 3.65], [20.1, 3.6]], sag: 0.1 },
  ],
};

const W_ARCOS = { // on the corner of Don Juan Durán: cream with a yellow plinth, arched windows in white frames behind
  // grilles, a lantern
  id: 'casa de las ventanas de arco', side: 'W', s0: 90.9, s1: 103.5, H: 7.0, roof: 'tile',
  wall: '#f3e7c8',
  paint: [{ x0: 0, x1: 12.61, y0: 0, y1: 0.75, col: '#e2b35c' }],
  relief: [{ k: 'cornice', x0: 0, x1: 12.61, y: 6.75, prof: [[0.12, 0.05], [0.14, 0.12]], col: '#f8f4ea' }],
  open: [
    { k: 'win', x0: 3.5, x1: 4.35, y0: 0.9, y1: 3.0, arch: 0.42, d: 0.25, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.3 }, surr: { w: 0.18, top: 0.2, col: '#fbf9f2', d: 0.02 }, reja: { col: BLACK, gap: 0.11, hz: [0.4, 0.7] } },
    { k: 'win', x0: 8.85, x1: 9.75, y0: 0.9, y1: 3.0, arch: 0.45, d: 0.25, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.3 }, surr: { w: 0.18, top: 0.2, col: '#fbf9f2', d: 0.02 }, reja: { col: BLACK, gap: 0.11, hz: [0.4, 0.7] } },
    { k: 'win', x0: 3.5, x1: 4.4, y0: 4.9, y1: 6.1, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.5 }, surr: { w: 0.16, top: 0.16, col: '#fbf9f2', d: 0.02 } },
    { k: 'balc', x0: 8.95, x1: 9.85, y0: 4.8, y1: 6.5, arch: 0.3, d: 0.22, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.4 }, surr: { w: 0.16, top: 0.16, col: '#fbf9f2', d: 0.02 },
      slab: { x0: 8.8, x1: 10.0, y: 4.8, t: 0.12, out: 0.18, col: '#fbf9f2', mould: false }, rail: { kind: 'bars', h: 0.65, col: BLACK } },
  ],
  extra: [
    { k: 'lamp', x: 5.0, y: 5.3 },
    { k: 'cable', pts: [[0, 3.95], [6.3, 3.9], [12.61, 3.85]], sag: 0.08 },
  ],
};

const W_PORTON = { // cream with a high ochre plinth and white pilasters: a dark steel gate, tall arched windows behind
  // grilles on both floors
  id: 'casa del portón', side: 'W', s0: 109.2, s1: 117.9, H: 7.2, roof: 'tile',
  wall: '#f1e5c9',
  paint: [{ x0: 0, x1: 8.7, y0: 0, y1: 1.4, col: '#e6b663' }],
  relief: [
    { k: 'band', x0: 2.1, x1: 2.4, y0: 1.4, y1: 7.0, d: 0.04, col: '#fbf8f1' },
    { k: 'cornice', x0: 0, x1: 8.7, y: 6.9, prof: [[0.12, 0.05], [0.14, 0.12]], col: '#f8f4ea' },
  ],
  open: [
    { k: 'gar', x0: -1.0, x1: 1.5, y1: 2.95, d: 0.15, leaf: { kind: 'basculante', col: '#3a3a38' } },
    { k: 'win', x0: 3.95, x1: 4.9, y0: 1.5, y1: 4.15, arch: 0.45, d: 0.25, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.25 }, surr: { w: 0.2, top: 0.22, col: '#fbf8f1', d: 0.02 },
      reja: { col: BLACK, gap: 0.11, hz: [0.3, 0.6, 0.85] } },
    { k: 'balc', x0: 3.95, x1: 4.95, y0: 4.7, y1: 6.6, arch: 0.45, d: 0.25, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.3 }, surr: { w: 0.25, top: 0.25, col: '#fbf8f1', d: 0.02 },
      slab: { x0: 3.8, x1: 5.1, y: 4.7, t: 0.12, out: 0.2, col: '#fbf8f1', mould: false }, rail: { kind: 'bars', h: 0.85, col: BLACK } },
  ],
};

const W_AMARILLA = { // the yellow corner house at the south end: a granite plinth, white pilasters and bands, windows behind
  // wrought grilles, balconies of cast iron, a lantern
  id: 'casa amarilla de la esquina', side: 'W', s0: 117.9, s1: 135.9, H: 7.5, roof: 'flat', parapet: 0,
  wall: '#efd99f',
  relief: [
    { k: 'stone', x0: 0, x1: 18.05, y0: 0, y1: 0.95, d: 0.03, col: GRANITE },
    { k: 'band', x0: 0, x1: 0.45, y0: 0.95, y1: 7.1, d: 0.04, col: '#faf6ea' },
    { k: 'band', x0: 14.0, x1: 14.4, y0: 0.95, y1: 7.1, d: 0.04, col: '#faf6ea' },
    { k: 'band', x0: 0, x1: 18.05, y0: 3.55, y1: 3.72, d: 0.04, col: '#faf6ea' },
    { k: 'cornice', x0: 0, x1: 18.05, y: 7.05, prof: [[0.12, 0.05], [0.14, 0.12], [0.1, 0.18]], col: '#faf6ea' },
  ],
  open: [
    ...[[2.3, 3.3], [6.6, 7.6], [11.6, 12.5], [14.9, 15.7]].map(([a, b]) => ({ k: 'win', x0: a, x1: b, y0: 0.85, y1: 2.85, d: 0.22, frame: { col: '#f0efea', leaves: 2 }, pers: { col: PERS_WHITE, lvl: 0.45 },
      surr: { w: 0.14, top: 0.18, col: '#faf6ea', d: 0.02 }, reja: { col: BLACK, gap: 0.12, hz: [0.33, 0.66], collars: [0.16, 0.5, 0.84] } })),
    { k: 'door', x0: 9.2, x1: 10.2, y0: 0, y1: 2.6, d: 0.28, leaf: { kind: 'cuarterones', n: 2, col: '#4e3424' }, surr: { w: 0.22, top: 0.25, col: GRANITE, stone: true, d: 0.03 } },
    ...[[2.35, 3.25], [6.65, 7.55], [11.65, 12.45], [17.0, 17.85]].map(([a, b]) => ({ k: 'balc', x0: a, x1: b, y0: 4.15, y1: 6.4, d: 0.2, frame: { col: '#f0efea' }, pers: { col: PERS_WHITE, lvl: 0.7 },
      surr: { w: 0.14, top: 0.3, ears: 0.06, col: '#faf6ea', d: 0.03 },
      slab: { x0: a - 0.55, x1: b + 0.55, y: 4.15, t: 0.22, out: 0.45, col: '#f6efd8' }, rail: { kind: 'ornate', h: 1.0, col: BLACK } })),
  ],
  extra: [
    { k: 'lamp', x: 16.4, y: 5.9 },
    { k: 'cable', pts: [[0, 4.0], [9, 3.9], [18.05, 3.85]], sag: 0.1 },
  ],
};

// the two gaps of the west side: the Catastro has no building there, the pictures do
const W_HUECO_A = { // between the brick block and the physiotherapy house: one storey of the same dark red, a brown roller
  // garage door and a white door; on its roof a terrace with a white balustrade, a pergola, an ochre floor behind
  id: 'casa del garaje rojo', side: 'W', s0: 56.9, s1: 61.0, H: 3.45, roof: 'flat', parapet: 0,
  wall: '#8e3434', sideCol: '#e9c27a',
  relief: [{ k: 'band', x0: 0, x1: 4.1, y0: 3.3, y1: 3.45, d: 0.06, col: '#f4f1ea' }],
  open: [
    { k: 'gar', x0: 0.55, x1: 2.7, y1: 2.55, d: 0.14, leaf: { kind: 'roller', col: '#8a6a4c', guide: '#6d5640' } },
    { k: 'door', x0: 2.95, x1: 3.7, y0: 0, y1: 2.4, d: 0.18, leaf: { kind: 'alu', col: '#f3f3f0' }, surr: { w: 0.08, top: 0.08, col: '#f4f1ea', d: 0.02 } },
  ],
  extra: [{ k: 'plate', x: 0.3, y: 2.3, w: 0.22, h: 0.3, col: '#efeeea' }],
  top: {
    balusters: [{ x0: 0.05, x1: 4.05, y: 3.45, h: 0.95, z: 0.04, gap: 0.17, col: '#f2f0ea' }],
    pergola: { x0: 0.2, x1: 3.9, posts: [0.25, 3.85], y0: 3.45, y1: 6.2, depth: 2.1, z: -0.1, rise: 0.25, col: '#f0efea', sheet: '#cfd3d6' },
  },
};

const W_HUECO_B = { // between the house of the arched windows and the house of the steel gate: a tall cream wall with an
  // ochre plinth, a small arched door in a white frame, the tiles of its roof
  id: 'tapia alta de la puerta de arco', side: 'W', s0: 103.5, s1: 109.2, H: 6.2, roof: 'tile',
  wall: '#f1e3c4',
  paint: [{ x0: 0, x1: 5.7, y0: 0, y1: 0.75, col: '#e3b25a' }],
  open: [{ k: 'door', x0: 3.95, x1: 4.55, y0: 0, y1: 2.35, arch: 0.3, d: 0.25, leaf: { kind: 'tablas', col: '#5b3a26' }, surr: { w: 0.14, top: 0.14, col: '#fbf8f1', d: 0.02 } }],
  extra: [{ k: 'cable', pts: [[0, 4.3], [2.85, 4.25], [5.7, 4.22]], sag: 0.06 }],
};

export const MALFEITOS = {
  name: 'Calle Malfeitos',
  // (where its metres start: the end at the Calle Nueva as it was when the street was measured — the street's line
  // moves when the town's pavements are measured again, its houses do not)
  origin: [106.5, -222.1],
  // (the parts of the building put in the gaps the Catastro leaves, d0..d1 metres back from its front, with their
  // heights)
  gaps: [
    { side: 'W', s0: 56.9, s1: 61.0, parts: [{ d0: 0, d1: 2.2, H: 3.45 }, { d0: 2.2, d1: 9, H: 6.6 }] },
    // (the town's own filling of the other gap — infill.js, which looks for gaps of 6 m or more by the metre — missed
    // this one, 5.7 m, once the street's line was measured again: it is given here, the tall wall's house)
    { side: 'W', s0: 103.5, s1: 109.2, parts: [{ d0: 0, d1: 9, H: 6.2, roof: 'tile' }] },
  ],
  houses: [
    W_HUECO_A, W_HUECO_B,
    E20, E18, E16, E_PIEDRA, E14, E14A, SALMON, E_BLANCA, E_CORREOS, E_OCRE, E_GARAJE, E_BAJA, E_MODERNO,
    W_ESQ_BAJA, W_ESQ, W9, W7, W_LADRILLO, W_FISIO, W_ARCOS, W_PORTON, W_AMARILLA,
  ],
};
