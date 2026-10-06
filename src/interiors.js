// Enterable houses: a procedural "casa de pueblo" of the Vegas Altas (central corridor from the street door to the
// back patio, living room, bedrooms, kitchen, bathroom, pantry, patio with a well and geraniums), furnished and lit,
// with its own collider. Interiors live far outside the town (beyond the camera's far plane) and the player is
// moved there when stepping through a marked street door. The same builder makes the locked house of "El apagón".
import * as THREE from 'three';
import { StaticCollider } from './collision.js';
import { mulberry32 } from './util.js';
import { PERK } from './perks.js';
import { INTERIOR_ORIGIN, WALL_H, boxGeo, planeGeo, cylGeo, pictureTexture, rugTexture, HouseBuilder, std, texMat, ringSegs, glassMat } from './housekit.js';
import { buildVecino, HouseLife, houseProfile, setDescMaker, COP_DESC_REF, curtainGeo } from './houses.js';
import { randomDesc } from './characters.js';
import { COP_DESC } from './police.js';
import { hash1 } from './util.js';
import { loadTexture } from './assets.js';
import { buildShop } from './shops.js';
import { ITEMS, lc } from './items.js';
import { buildChurch, updateBeams, lightCandle, ChurchLife } from './church.js';
import { massTime, weekday } from './npcmind.js';
import { buildVenue, VenueLife, setVenueDesc } from './venues.js';
setDescMaker(randomDesc);
setVenueDesc(() => randomDesc(Math.random));
Object.assign(COP_DESC_REF, COP_DESC);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const inHours = (h, a, b) => (a < b ? h >= a && h < b : h >= a || h < b);
// what you can read on the shelves of Guareña (and learn something)
const READS = [
  ['Un libro de historia local', 'Guareña ya aparece en documentos del siglo XIII, cuando era aldea de Medellín. Su nombre viene del río Guadámez… o eso dicen.'],
  ['Una guía de Extremadura', 'La iglesia de Santa María de Guareña es del siglo XVI: gótico tardío con retablo barroco. La torre se ve desde toda la vega.'],
  ['Un poemario de Luis Chamizo', '«El miajón de los castúos»: el poeta de Guareña escribió en castúo, el habla de estas tierras. En el pueblo tiene su casa museo.'],
  ['Un álbum de fotos', 'Fotos de la feria de agosto: la plaza llena, los caballos, la verbena. En una sale el pantano de Guareña recién inaugurado.'],
  ['Una revista de caza', 'Temporada de perdiz en las sierras cercanas. «Prohibido cazar en el entorno del pantano», avisa un recuadro.'],
  ['Un recetario', 'Migas extremeñas, caldereta de cordero, perrunillas y técula mécula. Alguien ha subrayado «con buen pan de pueblo».'],
  ['Un libro sobre Tarteso', 'En el Turuñuelo, a pocos kilómetros, apareció un edificio tartésico de hace 2.500 años con esculturas de rostros únicas en España.'],
  ['Una novela de detectives', 'Alguien ha dejado un billete de 10 € como marcapáginas.'],
];

// Build a house. kind: 'casa' (lived-in) | 'apagon' (the locked, run-down house of the blackout)
export function buildHouse(kind = 'casa', seed = 1, origin = INTERIOR_ORIGIN) {
  const horror = kind === 'apagon';
  const r = mulberry32(seed);
  const B = new HouseBuilder(origin.x, origin.z, horror);
  const W = 9.6, D1 = 11, D = 16, hw = W / 2, ch = 0.7; // width, house depth, total depth (patio), corridor half width
  const wallTints = horror ? [0x9a9080, 0x8a8478, 0x958a7a] : [0xf2ece0, 0xdce8ea, 0xf0dcd0, 0xe4ead8, 0xf4efe6];
  const tint = () => wallTints[Math.floor(r() * wallTints.length)];
  // --- materials
  const mWall = (t) => B.mat('wall' + t, () => horror ? texMat('decrepit_wallpaper', t, 0.95) : texMat('painted_plaster_wall', t, 0.9));
  const mWallOut = B.mat('wallout', () => texMat('white_rough_plaster', 0xf4f0e6, 0.95));
  const mFloorWood = B.mat('wood', () => horror ? texMat('concrete_floor_damaged_01', 0x9a9088, 0.95) : texMat('herringbone_parquet', 0xffffff, 0.6));
  const mFloorTile = B.mat('tile', () => horror ? texMat('concrete_floor_damaged_01', 0x8a8a84, 0.95) : texMat('floor_tiles_06', 0xffffff, 0.45));
  const mBathTile = B.mat('azulejo', () => texMat('long_white_tiles', horror ? 0xb8b4a0 : 0xffffff, 0.3));
  const mCeil = B.mat('ceil', () => texMat(horror ? 'white_rough_plaster' : 'painted_plaster_wall', horror ? 0x8a867c : 0xf8f6f0, 0.95));
  const mPatio = B.mat('patio', () => texMat('floor_tiles_06', 0xd08a5a, 0.8));
  const mDark = B.mat('darkwood', () => texMat('dark_wood', horror ? 0x7a6a5a : 0xffffff, 0.6));
  const mPale = B.mat('palewood', () => texMat('dark_wood', 0xe8c8a0, 0.6));
  const mWhite = B.mat('white', () => std(horror ? 0xb8b2a4 : 0xf2f2ee, { roughness: 0.35 }));
  const mMetal = B.mat('metal', () => std(0x9aa0a4, { roughness: 0.3, metalness: 0.8 }));
  const mBlack = B.mat('black', () => std(0x141416, { roughness: 0.4 }));
  const fabricCols = horror ? [0x4a3f38, 0x3a3a40, 0x50443a] : [0x8a2a2a, 0x2f4f7a, 0x5a6a3a, 0x7a5a8a, 0xb88a4a];
  const mFabric = B.mat('fabric', () => std(fabricCols[Math.floor(r() * fabricCols.length)], { roughness: 0.95 }));
  const mBed = B.mat('bed', () => std(horror ? 0xa89c8a : 0xf4f0e8, { roughness: 0.95 }));
  const mBlanket = B.mat('blanket', () => std(fabricCols[Math.floor(r() * fabricCols.length)], { roughness: 0.95 }));
  const mSheet = B.mat('sheet', () => std(0xd8d2c4, { roughness: 1 })); // dust sheets over furniture (apagón)
  const mStone = B.mat('stone', () => texMat('granite_wall', 0xffffff, 0.9));
  const mPlant = B.mat('plant', () => std(0x3f7a35, { roughness: 0.9 }));
  const mPot = B.mat('pot', () => std(0xb5552e, { roughness: 0.8 }));
  const mRed = B.mat('flower', () => std(0xd8263a, { roughness: 0.7 }));
  const mGlass = B.mat('glass', () => std(0x223040, { roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55 }));
  const mShutter = B.mat('shutter', () => std(horror ? 0x8a8474 : 0xe8e1cf, { roughness: 0.8 }));
  const mIron = B.mat('iron', () => std(0x1d1d1f, { roughness: 0.5, metalness: 0.6 }));

  // --- floors & ceilings (rooms get their own floor)
  const floor = (key, x0, z0, x1, z1) => B.add(key, planeGeo(x1 - x0, z1 - z0, 2.4).rotateX(-Math.PI / 2), (x0 + x1) / 2, 0.005, (z0 + z1) / 2);
  const ceil = (x0, z0, x1, z1) => B.add(mCeil, planeGeo(x1 - x0, z1 - z0, 2.0).rotateX(Math.PI / 2), (x0 + x1) / 2, WALL_H, (z0 + z1) / 2);
  const rooms = {
    salon: [-hw, 0, -ch, 4.6], dorm1: [-hw, 4.6, -ch, 8.2], cocina: [-hw, 8.2, -ch, D1],
    dorm2: [ch, 0, hw, 4.0], bano: [ch, 4.0, hw, 6.4], dorm3: [ch, 6.4, hw, 9.2], despensa: [ch, 9.2, hw, D1],
    pasillo: [-ch, 0, ch, D1],
  };
  for (const [name, [x0, z0, x1, z1]] of Object.entries(rooms)) {
    floor(name === 'cocina' || name === 'pasillo' || name === 'despensa' ? mFloorTile : name === 'bano' ? mBathTile : mFloorWood, x0, z0, x1, z1);
    ceil(x0, z0, x1, z1);
  }
  floor(mPatio, -hw, D1, hw, D);
  B.spots.rooms = rooms;

  // --- walls. Exterior: front (z=0, street door + two barred windows), sides, patio walls (tall), back
  const tOut = mWallOut;
  B.wall(mWall(tint()), -hw, 0, hw, 0, WALL_H, [[hw - 3.5, hw - 2.0, 0.95, 2.05], [hw - 0.55, hw + 0.55, 0, 2.2], [hw + 2.0, hw + 3.5, 0.95, 2.05]]);
  B.wall(tOut, -hw, -0.02, hw, -0.02, WALL_H + 0.4, [[hw - 3.5, hw - 2.0, 0.95, 2.05], [hw - 0.55, hw + 0.55, 0, 2.2], [hw + 2.0, hw + 3.5, 0.95, 2.05]], 0, false);
  B.wall(mWall(tint()), -hw, 0, -hw, D1); B.wall(mWall(tint()), hw, 0, hw, D1);
  B.wall(tOut, -hw, D1, -hw, D, 3.7); B.wall(tOut, hw, D1, hw, D, 3.7); B.wall(tOut, -hw, D, hw, D, 3.7);
  // corridor walls with the room doors (0.9 m openings)
  const door = (z) => [z - 0.45, z + 0.45, 0, 2.1];
  B.wall(mWall(tint()), -ch, 0, -ch, D1, WALL_H, [door(2.6), door(6.8), door(9.4)]);
  B.wall(mWall(tint()), ch, 0, ch, D1, WALL_H, [door(2.2), door(5.2), door(7.6), door(10.1)]);
  // room separators
  B.wall(mWall(tint()), -hw, 4.6, -ch, 4.6); B.wall(mWall(tint()), -hw, 8.2, -ch, 8.2);
  B.wall(mWall(tint()), ch, 4.0, hw, 4.0); B.wall(mWall(tint()), ch, 6.4, hw, 6.4); B.wall(mWall(tint()), ch, 9.2, hw, 9.2);
  // back of the house onto the patio: corridor door + kitchen window
  B.wall(tOut, -hw, D1, hw, D1, WALL_H, [[hw - 3.6, hw - 2.3, 1.0, 2.0], [hw - 0.5, hw + 0.5, 0, 2.15]]);
  // roof slab over the house (seen from the patio)
  B.add(B.mat('rooftile', () => texMat('clay_roof_tiles_02', 0xffffff, 0.8)), boxGeo(W + 0.5, 0.25, D1 + 0.3, 2.5), 0, WALL_H + 0.15, D1 / 2);
  B.view('b', -hw, 3.3, D1, hw, 40, D); // over the patio walls: the roofs of the neighbours

  // --- windows: frame, glass, closed roller shutter (persiana) and iron grille
  const windowAt = (x, z, ry, w = 1.5) => {
    B.add(mShutter, boxGeo(w, 1.1, 0.04, 1), x, 1.5, z + 0.02 * Math.cos(ry), ry);
    for (let i = 0; i < 9; i++) B.add(mIron, boxGeo(0.02, 1.12, 0.02, 1), x - w / 2 + 0.1 + i * (w - 0.2) / 8, 1.5, z - 0.07 * Math.cos(ry), ry);
    B.add(mDark, boxGeo(w + 0.1, 0.08, 0.2, 1), x, 0.95, z, ry);
  };
  windowAt(-2.75, 0.03, 0); windowAt(2.75, 0.03, 0);
  // kitchen window to the patio: glass you can see through
  B.add(mGlass, boxGeo(1.3, 1.0, 0.02, 1), -2.95, 1.5, D1, 0);
  // --- the street door (always shut from inside)
  B.add(mDark, boxGeo(1.1, 2.2, 0.08, 1.2), 0, 1.1, 0.06, 0);
  B.add(mMetal, boxGeo(0.06, 0.06, 0.1, 1), 0.38, 1.05, 0.12, 0);
  B.interact({ type: 'exit', x: 0, z: 0.7, r: 1.1, label: horror ? 'Puerta de la calle' : 'Salir a la calle' });
  B.segs.push([B.ox - 0.6, B.oz + 0.05, B.ox + 0.6, B.oz + 0.05, 2.2]);
  // patio door frame
  B.add(mDark, boxGeo(0.08, 2.15, 0.16, 1), -0.5, 1.075, D1, 0); B.add(mDark, boxGeo(0.08, 2.15, 0.16, 1), 0.5, 1.075, D1, 0);
  // door leaves: every room door, left ajar (in the old house some barely), hinged on the corridor wall
  const ajar = () => (horror ? 1.0 + r() * 0.75 : 1.35 + r() * 0.35);
  for (const zc of [2.6, 6.8, 9.4]) B.doorLeaf(mDark, mMetal, -ch, zc - 0.45, 0, 1, -1, ajar());
  for (const zc of [2.2, 5.2, 7.6, 10.1]) B.doorLeaf(mDark, mMetal, ch, zc - 0.45, 0, 1, 1, ajar());
  B.doorLeaf(mDark, mMetal, -0.5, D1, 1, 0, -1, horror ? 1.3 : 1.6, 1.0);

  // --- furniture helpers
  const sheet = (w, h, d, x, z, ry = 0) => { if (horror && r() < 0.6) { B.block(mSheet, w + 0.1, h + 0.08, d + 0.1, x, 0, z, ry); return true; } return false; };
  const picture = (kind, x, y, z, ry, w = 0.45, h = 0.56) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: pictureTexture(kind, Math.floor(r() * 1e6)), roughness: 0.6 }));
    B.extraMesh(m, x, y, z, ry);
    B.add(mDark, boxGeo(w + 0.06, h + 0.06, 0.02, 1), x - Math.sin(ry) * 0.018, y, z - Math.cos(ry) * 0.018, ry);
  };
  const wardrobe = (x, z, ry, w = 1.4) => {
    B.block(mDark, w, 2.1, 0.6, x, 0, z, ry, 1.2);
    // door line and knobs
    B.add(mBlack, boxGeo(0.015, 1.9, 0.01, 1), x + Math.sin(ry) * 0.301, 1.1, z + Math.cos(ry) * 0.301, ry);
    B.interact({ type: 'hide', x: x + Math.sin(ry) * 0.75, z: z + Math.cos(ry) * 0.75, r: 0.85, label: 'Esconderse en el armario', hx: x, hz: z, ry });
  };
  const bed = (x, z, ry, double = true) => {
    const w = double ? 1.5 : 0.95;
    if (!sheet(w, 0.55, 2.0, x, z, ry)) {
      B.block(mDark, w + 0.08, 0.3, 2.05, x, 0, z, ry, 1.2);
      B.add(mBed, boxGeo(w, 0.22, 1.95, 1), x, 0.41, z, ry);
      B.add(mBlanket, boxGeo(w + 0.04, 0.06, 1.3, 1), x + Math.sin(ry) * 0.3, 0.54, z + Math.cos(ry) * 0.3, ry);
      B.add(mBed, boxGeo(w * 0.8, 0.12, 0.35, 1), x - Math.sin(ry) * 0.75, 0.58, z - Math.cos(ry) * 0.75, ry);
    }
    // headboard
    B.add(mDark, boxGeo(w + 0.1, 1.0, 0.06, 1.2), x - Math.sin(ry) * 1.02, 0.5, z - Math.cos(ry) * 1.02, ry);
    return { x: x + B.ox, z: z + B.oz };
  };
  const nightstand = (x, z, ry) => {
    B.block(mDark, 0.45, 0.55, 0.4, x, 0, z, ry, 1);
    const lamp = new THREE.Mesh(cylGeo(0.08, 0.14, 0.18), new THREE.MeshStandardMaterial({ color: 0xf0e4c8, emissive: 0xffd9a0, emissiveIntensity: horror ? 0 : 0.5 }));
    lamp.userData.lamp = true;
    B.extraMesh(lamp, x, 0.75, z, ry);
  };
  const table = (x, z, w = 1.2, d = 0.8, h = 0.76) => {
    B.add(mPale, boxGeo(w, 0.05, d, 1), x, h, z);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(mPale, boxGeo(0.05, h, 0.05, 1), x + a * (w / 2 - 0.06), h / 2, z + b * (d / 2 - 0.06));
    B.footprint(w, d, x, z, 0, 0.8);
  };
  const chair = (x, z, ry) => {
    B.add(mPale, boxGeo(0.42, 0.04, 0.42, 1), x, 0.46, z, ry);
    B.add(mPale, boxGeo(0.42, 0.5, 0.04, 1), x - Math.sin(ry) * 0.2, 0.71, z - Math.cos(ry) * 0.2, ry);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add(mPale, boxGeo(0.035, 0.46, 0.035, 1), x + a * 0.18, 0.23, z + b * 0.18, ry);
  };
  const plant = (x, z, big = false) => {
    B.add(mPot, cylGeo(big ? 0.22 : 0.15, big ? 0.16 : 0.11, big ? 0.36 : 0.24), x, big ? 0.18 : 0.12, z);
    B.add(mPlant, new THREE.SphereGeometry(big ? 0.34 : 0.22, 10, 8), x, big ? 0.6 : 0.38, z);
    for (let i = 0; i < 5; i++) B.add(mRed, new THREE.SphereGeometry(0.05, 6, 5), x + (r() - 0.5) * 0.35, (big ? 0.75 : 0.5) + r() * 0.1, z + (r() - 0.5) * 0.35);
  };

  // ---------------- salón (x -4.8..-0.7, z 0..4.6)
  {
    if (!sheet(2.0, 0.85, 0.85, -3.4, 1.2, 0)) {
      B.block(mFabric, 2.0, 0.42, 0.85, -3.4, 0, 1.2, 0, 1);         // sofa seat
      B.add(mFabric, boxGeo(2.0, 0.5, 0.2, 1), -3.4, 0.67, 0.85);    // back
      B.add(mFabric, boxGeo(0.2, 0.3, 0.85, 1), -4.35, 0.57, 1.2); B.add(mFabric, boxGeo(0.2, 0.3, 0.85, 1), -2.45, 0.57, 1.2);
    }
    table(-3.4, 2.4, 1.0, 0.55, 0.42);
    B.block(mDark, 1.4, 0.55, 0.45, -3.2, 0, 4.3, 0, 1);            // TV stand
    const tvScreen = new THREE.Mesh(boxGeo(0.95, 0.56, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0x0c0d10, emissive: 0x6a8aa8, emissiveIntensity: horror ? 0 : 0.35, roughness: 0.3 }));
    tvScreen.userData.tv = true;
    B.extraMesh(tvScreen, -3.2, 0.9, 4.25, Math.PI);
    B.interact({ type: 'tv', x: -3.2, z: 3.6, r: 0.9, label: 'Encender la tele', mesh: tvScreen });
    B.block(mDark, 0.35, 1.9, 1.1, -4.55, 0, 3.2, 0, 1.2);          // bookshelf
    for (let i = 0; i < 12; i++) B.add(B.mat('book' + (i % 4), () => std([0x7a2a22, 0x2a4a6a, 0x3a5a2a, 0xb89a5a][i % 4], { roughness: 0.8 })), boxGeo(0.22, 0.26, 0.05, 1), -4.5, 0.55 + Math.floor(i / 4) * 0.45, 2.8 + (i % 4) * 0.2);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rugTexture(seed), roughness: 1 }));
    B.extraMesh(rug, -3.2, 0.012, 2.3);
    picture(horror ? 'oscuro' : 'paisaje', -2.0, 1.65, 4.53, Math.PI);
    picture('virgen', -hw + 0.08, 1.7, 2.2, Math.PI / 2, 0.36, 0.48);
    // pendulum wall clock between the window and the corridor (it keeps ticking in the blackout)
    B.add(mDark, boxGeo(0.4, 0.95, 0.12, 1), -1.35, 1.75, 0.08);
    B.add(mDark, boxGeo(0.48, 0.08, 0.16, 1), -1.35, 2.26, 0.08);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshStandardMaterial({ color: horror ? 0xcfc4a8 : 0xf4efe0, roughness: 0.5 }));
    B.extraMesh(face, -1.35, 2.0, 0.145);
    for (const [len, ang] of [[0.1, 0.9], [0.13, -2.3]]) {
      const hand = new THREE.Mesh(boxGeo(0.012, len, 0.004, 1), B.mats.get(mBlack));
      hand.geometry.translate(0, len / 2, 0);
      hand.rotation.z = ang;
      B.extraMesh(hand, -1.35, 2.0, 0.15).rotation.z = ang;
    }
    const pend = new THREE.Group();
    const rod = new THREE.Mesh(boxGeo(0.012, 0.36, 0.01, 1), B.mats.get(mMetal)); rod.position.y = -0.18; pend.add(rod);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16).rotateX(Math.PI / 2), B.mats.get(mMetal)); bob.position.y = -0.38; pend.add(bob);
    B.extraMesh(pend, -1.35, 1.8, 0.15);
    B.spots.clock = { x: B.ox - 1.35, z: B.oz + 0.2, pend };
    B.light(-2.8, 2.6, 2.3, 0xffd9a0, 8, 8);
    B.spots.salon = { x: B.ox - 3.0, z: B.oz + 2.8 };
  }
  // ---------------- dormitorio 1 (z 4.6..8.2, left)
  {
    const b = bed(-3.6, 6.4, Math.PI / 2);
    nightstand(-4.4, 5.3, Math.PI / 2); nightstand(-4.4, 7.5, Math.PI / 2);
    wardrobe(-1.6, 7.85, Math.PI);
    picture('foto', -2.4, 1.6, 4.67, 0);
    B.light(-2.8, 2.6, 6.4, 0xffd2a0, 6, 7);
    B.spots.dorm1 = b; // the bed (items are placed around it)
    // where the player wakes up: standing on the free floor between the bed and the door, never inside the furniture
    B.spots.wake = { x: B.ox - 1.8, z: B.oz + 6.8 };
  }
  // ---------------- cocina (z 8.2..11, left)
  {
    B.block(mWhite, 0.6, 0.9, 2.6, -4.45, 0, 9.6, 0, 1);               // counter
    B.add(B.mat('worktop', () => std(horror ? 0x5a5650 : 0x3a3a3a, { roughness: 0.3 })), boxGeo(0.64, 0.04, 2.64, 1), -4.45, 0.92, 9.6);
    B.add(mBathTile, planeGeo(2.6, 0.7, 0.6).rotateY(Math.PI / 2), -hw + 0.08, 1.3, 9.6);          // tiled backsplash
    B.add(mBlack, boxGeo(0.5, 0.02, 0.55, 1), -4.45, 0.95, 9.2);          // hob
    B.add(mMetal, boxGeo(0.45, 0.05, 0.4, 1), -4.45, 0.93, 10.3);         // sink
    B.block(mWhite, 0.7, 1.8, 0.65, -1.2, 0, 10.6, 0, 1);                  // fridge
    table(-2.6, 9.6, 1.1, 0.75);
    chair(-2.6, 9.0, 0); chair(-2.6, 10.2, Math.PI); chair(-3.3, 9.6, Math.PI / 2);
    picture('calendario', -1.6, 1.6, 8.27, 0, 0.32, 0.4);
    B.light(-2.8, 2.6, 9.6, 0xfff0d8, 7, 7);
    B.interact({ type: 'drawer', x: -3.9, z: 9.8, r: 0.9, label: 'Registrar los cajones' });
    B.spots.cocina = { x: B.ox - 2.6, z: B.oz + 9.6 };
  }
  // ---------------- dormitorio 2 (right, z 0..4)
  {
    const b = bed(3.7, 2.2, -Math.PI / 2);
    nightstand(4.45, 1.0, -Math.PI / 2);
    wardrobe(2.0, 3.65, Math.PI, 1.3);
    picture('foto', 4.73, 1.6, 3.1, -Math.PI / 2, 0.3, 0.38);
    B.light(2.8, 2.6, 2.0, 0xffd2a0, 6, 7);
    B.spots.dorm2 = b;
  }
  // ---------------- baño (z 4..6.4)
  {
    B.block(mWhite, 0.75, 0.55, 1.7, 4.35, 0, 5.2, 0, 1);            // bathtub
    B.add(mBathTile, planeGeo(2.4, 1.6, 0.6).rotateY(-Math.PI / 2), hw - 0.08, 0.8, 5.2);
    B.block(mWhite, 0.4, 0.42, 0.55, 1.2, 0, 6.0, Math.PI, 1);       // toilet
    B.add(mWhite, boxGeo(0.38, 0.35, 0.16, 1), 1.2, 0.6, 6.25);
    B.block(mWhite, 0.55, 0.85, 0.4, 2.6, 0, 6.2, Math.PI, 1);       // sink
    const mirror = new THREE.Mesh(planeGeo(0.55, 0.7, 1), new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.05, metalness: 1 }));
    B.extraMesh(mirror, 2.6, 1.55, 6.32, Math.PI);
    B.interact({ type: 'mirror', x: 2.6, z: 5.7, r: 0.7, label: 'Mirarse al espejo' });
    B.light(2.8, 2.6, 5.2, 0xf4f8ff, 5, 6);
    B.spots.bano = { x: B.ox + 2.6, z: B.oz + 5.2 };
  }
  // ---------------- dormitorio 3 (z 6.4..9.2)
  {
    const b = bed(3.9, 7.8, -Math.PI / 2, false);
    wardrobe(1.3, 8.85, Math.PI, 1.1);
    table(2.6, 6.85, 1.0, 0.5);
    chair(2.6, 7.35, Math.PI);
    picture(horror ? 'oscuro' : 'foto', 3.4, 1.6, 6.47, 0, 0.3, 0.38);
    B.spots.dorm3 = b;
  }
  // ---------------- despensa (z 9.2..11)
  {
    B.block(mPale, 0.4, 1.8, 1.6, 4.5, 0, 10.1, 0, 1);
    for (let i = 0; i < 9; i++) B.add(B.mat('jar', () => std(0xb89a5a, { roughness: 0.4, transparent: true, opacity: 0.85 })), cylGeo(0.06, 0.06, 0.18, 8), 4.45, 0.55 + Math.floor(i / 3) * 0.5, 9.5 + (i % 3) * 0.5);
    B.block(B.mat('box', () => std(0xa8845a, { roughness: 1 })), 0.5, 0.4, 0.5, 2.0, 0, 10.5, 0.3, 1);
    B.spots.despensa = { x: B.ox + 2.8, z: B.oz + 10.1 };
  }
  // ---------------- pasillo: phone table, fuse box, coat rack, pictures
  {
    B.add(mDark, boxGeo(0.35, 0.8, 0.7, 1), -0.45, 0.4, 4.2);
    const phone = new THREE.Mesh(boxGeo(0.2, 0.08, 0.16, 1), new THREE.MeshStandardMaterial({ color: horror ? 0x3a3a38 : 0xe8e0d0, roughness: 0.4 }));
    B.extraMesh(phone, -0.45, 0.85, 4.2);
    B.interact({ type: 'phone', x: -0.1, z: 4.2, r: 0.8, label: 'Coger el teléfono', mesh: phone });
    // electrical panel (cuadro eléctrico) next to the street door
    const panel = new THREE.Mesh(boxGeo(0.34, 0.46, 0.08, 1), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 }));
    B.extraMesh(panel, ch - 0.05, 1.6, 1.3, -Math.PI / 2);
    B.interact({ type: 'fusebox', x: 0.2, z: 1.3, r: 0.8, label: 'Cuadro eléctrico', mesh: panel });
    picture('foto', -ch + 0.08, 1.6, 7.6, Math.PI / 2, 0.3, 0.38);
    picture(horror ? 'oscuro' : 'virgen', ch - 0.08, 1.7, 8.8, -Math.PI / 2, 0.3, 0.4);
    B.light(0, 2.6, 2.4, 0xffd9a0, 5, 6);
    B.light(0, 2.6, 8.4, 0xffd9a0, 5, 6);
    B.spots.entrada = { x: B.ox, z: B.oz + 1.4 };
    B.spots.fusebox = { x: B.ox + 0.2, z: B.oz + 1.3 };
    B.spots.pasillo = { x: B.ox, z: B.oz + 6 };
  }
  // ---------------- patio: pozo, macetas, limonero, tendedero
  {
    B.add(mStone, new THREE.CylinderGeometry(0.64, 0.66, 0.8, 18, 1, true), 0, 0.4, 13.6);
    B.add(mStone, new THREE.CylinderGeometry(0.5, 0.5, 0.8, 18, 1, true), 0, 0.4, 13.6);
    B.add(mStone, new THREE.RingGeometry(0.5, 0.64, 18).rotateX(-Math.PI / 2), 0, 0.8, 13.6);
    B.add(mBlack, new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2), 0, 0.35, 13.6);
    B.add(mDark, boxGeo(0.08, 1.6, 0.08, 1), -0.6, 1.6, 13.6); B.add(mDark, boxGeo(0.08, 1.6, 0.08, 1), 0.6, 1.6, 13.6);
    B.add(mDark, boxGeo(1.4, 0.08, 0.1, 1), 0, 2.4, 13.6);
    B.segs.push(...ringSegs(B.ox, B.oz + 13.6, 0.7, 1));
    B.interact({ type: 'well', x: 0, z: 12.6, r: 0.9, label: 'Asomarse al pozo' });
    for (const [x, z, big] of [[-4.2, 11.6, true], [-4.2, 15.4, false], [4.2, 15.4, true], [4.3, 12.2, false], [-2.0, 15.5, false], [2.2, 15.5, false]]) plant(x, z, big);
    // lemon tree
    B.add(mDark, cylGeo(0.08, 0.1, 1.6, 8), 3.4, 0.8, 13.2);
    B.add(B.mat('leaves', () => std(0x2f6a2a, { roughness: 0.9 })), new THREE.SphereGeometry(0.9, 12, 10), 3.4, 2.1, 13.2);
    for (let i = 0; i < 8; i++) B.add(B.mat('lemon', () => std(0xf2d230, { roughness: 0.6 })), new THREE.SphereGeometry(0.06, 6, 5), 3.4 + (r() - 0.5) * 1.3, 1.8 + r() * 0.8, 13.2 + (r() - 0.5) * 1.3);
    B.segs.push(...ringSegs(B.ox + 3.4, B.oz + 13.2, 0.25, 1.6));
    // clothesline
    B.add(mMetal, boxGeo(0.02, 0.02, 4.6, 1), -2.6, 2.1, 13.5);
    if (!horror) for (let i = 0; i < 4; i++) B.add(B.mat('cloth' + i, () => std([0xf4f4f0, 0x88a9c9, 0xe87aa4, 0xe6b422][i], { roughness: 1, side: THREE.DoubleSide })), planeGeo(0.5, 0.6, 1), -2.6, 1.8, 11.9 + i * 1.1, Math.PI / 2);
    else B.add(B.mat('cloth0', () => std(0xe8e4dc, { roughness: 1, side: THREE.DoubleSide })), planeGeo(0.6, 1.3, 1), -2.6, 1.45, 14.6, Math.PI / 2);
    B.light(0, 2.7, D1 + 0.3, 0xffe8c0, 4, 6);
    B.spots.patio = { x: B.ox + 1.5, z: B.oz + 14.5 };
    B.spots.pozo = { x: B.ox, z: B.oz + 12.6 };
  }
  // free floor points (never inside a bed, table or wardrobe footprint): where someone can stand in each room
  const fl = (x, z) => ({ x: B.ox + x, z: B.oz + z });
  B.spots.floor = {
    salon: fl(-2.2, 3.4), dorm1: fl(-1.8, 6.8), cocina: fl(-1.5, 9.0), dorm2: fl(1.7, 1.2), bano: fl(2.4, 5.1),
    dorm3: fl(1.8, 7.8), despensa: fl(2.9, 10.0), pasillo: fl(0, 6), entrada: fl(0, 1.4), patio: fl(1.5, 14.5), pozo: fl(0, 12.6),
  };
  const out = B.finish();
  out.origin = { x: origin.x, z: origin.z };
  out.kind = kind;
  out.bounds = { x0: origin.x - hw, x1: origin.x + hw, z0: origin.z, z1: origin.z + D };
  return out;
}

// ---------------------------------------------------------------- Annie's house (calle Malfeitos): two storeys
// Street door → a small sitting room (saloncito) → a door into the other part of the house: hall with the staircase,
// kitchen, bathroom and a little patio. Upstairs: Annie's bedroom over the street, a bathroom and a study.
// The stairs are walkable: floorY() gives the height (a ramp over the steps) and each storey has its own collider.
function catPoster() {
  const c = document.createElement('canvas'); c.width = 192; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#ffd6e4'); g.addColorStop(1, '#fff3f7');
  x.fillStyle = g; x.fillRect(0, 0, 192, 256);
  x.fillStyle = '#ffffff'; x.strokeStyle = '#2a2226'; x.lineWidth = 6;
  // a round cartoon cat (no brand): head, ears, eyes, whiskers, a flower
  x.beginPath(); x.moveTo(40, 120); x.lineTo(52, 62); x.lineTo(84, 92); x.lineTo(108, 92); x.lineTo(140, 62); x.lineTo(152, 120);
  x.bezierCurveTo(170, 190, 22, 190, 40, 120); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#2a2226';
  for (const ex of [74, 118]) { x.beginPath(); x.ellipse(ex, 132, 7, 10, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#f29ab8'; x.beginPath(); x.ellipse(96, 150, 8, 6, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#2a2226'; x.lineWidth = 3;
  for (const s of [-1, 1]) for (const dy of [-6, 4]) { x.beginPath(); x.moveTo(96 + s * 30, 150 + dy); x.lineTo(96 + s * 62, 146 + dy * 1.6); x.stroke(); }
  x.fillStyle = '#e8456a';
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; x.beginPath(); x.arc(142 + Math.cos(a) * 9, 78 + Math.sin(a) * 9, 7, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(142, 78, 6, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c23a64'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('¡hola!', 96, 228);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function buildAnnieHouse(seed = 12, origin = INTERIOR_ORIGIN) {
  const r = mulberry32(seed);
  const B = new HouseBuilder(origin.x, origin.z, false);
  const W = 6.4, hw = W / 2, D1 = 10.5, DP = 13.5; // width, house depth, patio end
  const F2 = 3.1, H2 = 2.75;                       // upper floor level and its height
  const SX0 = 2.0, SX1 = 3.12, SZ0 = 5.0, SZ1 = 9.4; // stairs: x range, bottom → top along +z
  const NSTEP = 17;
  // --- materials
  const mWall = (t) => B.mat('wall' + t, () => texMat('painted_plaster_wall', t, 0.9));
  const mOut = B.mat('wallout', () => texMat('white_rough_plaster', 0xf4f0e6, 0.95));
  const mWood = B.mat('wood', () => texMat('herringbone_parquet', 0xffffff, 0.6));
  const mTile = B.mat('tile', () => texMat('floor_tiles_06', 0xffffff, 0.45));
  const mBath = B.mat('azulejo', () => texMat('long_white_tiles', 0xffffff, 0.3));
  const mCeil = B.mat('ceil', () => texMat('painted_plaster_wall', 0xf8f6f0, 0.95));
  const mStep = B.mat('marble', () => texMat('rock_tile_floor', 0xf0ece4, 0.35));
  const mPatio = B.mat('patio', () => texMat('floor_tiles_06', 0xd08a5a, 0.8));
  const mDark = B.mat('darkwood', () => texMat('dark_wood', 0xffffff, 0.6));
  const mPale = B.mat('palewood', () => texMat('dark_wood', 0xf0d4b0, 0.6));
  const mWhite = B.mat('white', () => std(0xf2f2ee, { roughness: 0.35 }));
  const mMetal = B.mat('metal', () => std(0x9aa0a4, { roughness: 0.3, metalness: 0.8 }));
  const mBlack = B.mat('black', () => std(0x141416, { roughness: 0.4 }));
  const mIron = B.mat('iron', () => std(0x1d1d1f, { roughness: 0.5, metalness: 0.6 }));
  const mShutter = B.mat('shutter', () => std(0xe8e1cf, { roughness: 0.8 }));
  const glass = glassMat();
  const mSofa = B.mat('sofa', () => std(0x6a7f9a, { roughness: 0.95 }));
  const mPink = B.mat('pink', () => std(0xf4a6c0, { roughness: 0.95 }));
  const mSheet = B.mat('sheetw', () => std(0xfbf6f4, { roughness: 0.95 }));
  const mLilac = B.mat('lilac', () => std(0xc8b4e0, { roughness: 0.95 }));
  const mPlant = B.mat('plant', () => std(0x3f7a35, { roughness: 0.9 }));
  const mPot = B.mat('pot', () => std(0xb5552e, { roughness: 0.8 }));
  const mRed = B.mat('flower', () => std(0xd8263a, { roughness: 0.7 }));
  const mStone = B.mat('stone', () => texMat('granite_wall', 0xffffff, 0.9));
  const tints = [0xf6efe6, 0xe8f0ee, 0xf4e6ea, 0xf2ece0];
  const segs0 = [], segs1 = [];
  // --- helpers (y0 = level of the floor they stand on)
  const floor = (key, x0, z0, x1, z1, y = 0) => B.add(key, planeGeo(x1 - x0, z1 - z0, 2.4).rotateX(-Math.PI / 2), (x0 + x1) / 2, y + 0.005, (z0 + z1) / 2);
  const ceil = (x0, z0, x1, z1, y) => B.add(mCeil, planeGeo(x1 - x0, z1 - z0, 2.0).rotateX(Math.PI / 2), (x0 + x1) / 2, y, (z0 + z1) / 2);
  // openings are measured along the wall from its first end (as HouseBuilder.wall expects)
  const door = (a, w = 0.9) => [a, a + w, 0, 2.1];
  const box = (key, w, h, d, x, y, z, ry = 0, tex = 1) => B.add(key, boxGeo(w, h, d, tex), x, y + h / 2, z, ry);
  const solid = (key, w, h, d, x, y, z, ry = 0, tex = 1) => { box(key, w, h, d, x, y, z, ry, tex); B.footprint(w, d, x, z, ry, Math.max(h, 0.5)); };
  const picture = (tex, x, y, z, ry, w = 0.42, h = 0.52) => {
    B.extraMesh(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })), x, y, z, ry);
    B.add(mDark, boxGeo(w + 0.05, h + 0.05, 0.02, 1), x - Math.sin(ry) * 0.016, y, z - Math.cos(ry) * 0.016, ry);
  };
  const plant = (x, z, y = 0, big = false) => {
    B.add(mPot, cylGeo(big ? 0.2 : 0.14, big ? 0.15 : 0.1, big ? 0.34 : 0.22), x, y + (big ? 0.17 : 0.11), z);
    B.add(mPlant, new THREE.SphereGeometry(big ? 0.32 : 0.2, 10, 8), x, y + (big ? 0.58 : 0.36), z);
    for (let i = 0; i < 5; i++) B.add(mRed, new THREE.SphereGeometry(0.045, 6, 5), x + (r() - 0.5) * 0.32, y + (big ? 0.72 : 0.48) + r() * 0.1, z + (r() - 0.5) * 0.32);
  };
  const windowAt = (x, z, ry, y = 0, w = 1.3) => {
    B.add(mShutter, boxGeo(w, 1.1, 0.04, 1), x, y + 1.5, z + 0.02 * Math.cos(ry), ry);
    for (let i = 0; i < 8; i++) B.add(mIron, boxGeo(0.02, 1.12, 0.02, 1), x - w / 2 + 0.1 + i * (w - 0.2) / 7, y + 1.5, z - 0.07 * Math.cos(ry), ry);
    B.add(mDark, boxGeo(w + 0.1, 0.08, 0.2, 1), x, y + 0.95, z, ry);
  };

  // ================================================================ ground floor
  B.segs = segs0;
  const rooms0 = { saloncito: [-hw, 0, hw, 3.8], cocina: [-hw, 3.8, 0.9, 8.4], bano: [-hw, 8.4, 0.9, D1], recibidor: [0.9, 3.8, hw, D1] };
  for (const [name, [x0, z0, x1, z1]] of Object.entries(rooms0)) {
    floor(name === 'saloncito' ? mWood : name === 'bano' ? mBath : mTile, x0, z0, x1, z1);
    if (name !== 'recibidor') ceil(x0, z0, x1, z1, WALL_H);
  }
  // the hall's ceiling, leaving the stairwell open
  ceil(0.9, 3.8, hw, SZ0, WALL_H); ceil(0.9, SZ0, SX0, D1, WALL_H); ceil(SX0, SZ1, hw, D1, WALL_H);
  floor(mPatio, -hw, D1, hw, DP);
  // exterior walls: façade with the street door and a barred window, sides, back onto the patio, patio walls
  B.wall(mWall(tints[0]), -hw, 0, hw, 0, WALL_H, [[0.4, 1.7, 0.95, 2.05], [hw - 0.55, hw + 0.55, 0, 2.2]]);
  B.wall(mWall(tints[0]), -hw, 0, -hw, 3.8); B.wall(mWall(tints[0]), hw, 0, hw, 3.8);
  B.wall(mWall(tints[1]), -hw, 3.8, -hw, D1); B.wall(mWall(tints[2]), hw, 3.8, hw, D1, F2); // up to the floor above along the stairwell
  B.wall(mOut, -hw, D1, -hw, DP, 3.6); B.wall(mOut, hw, D1, hw, DP, 3.6); B.wall(mOut, -hw, DP, hw, DP, 3.6);
  B.wall(mWall(tints[1]), -hw, D1, hw, D1, WALL_H, [door(1.25 + hw), [0.8, 1.8, 1.2, 1.9]]);
  B.wall(mOut, -hw, D1 + 0.02, hw, D1 + 0.02, WALL_H + 0.25, [door(1.25 + hw), [0.8, 1.8, 1.2, 1.9]], 0, false);
  // the door from the saloncito into the other part of the house
  B.wall(mWall(tints[0]), -hw, 3.8, hw, 3.8, WALL_H, [door(1.5 + hw)]);
  // kitchen / bathroom wall onto the hall, and between them
  B.wall(mWall(tints[1]), 0.9, 3.8, 0.9, D1, WALL_H, [door(4.25 - 3.8), door(9.3 - 3.8, 0.8)]);
  B.wall(mWall(tints[1]), -hw, 8.4, 0.9, 8.4);
  // the stairs: solid marble steps against the right wall, closed underneath; the side toward the hall is a wall
  const rise = F2 / NSTEP, run = (SZ1 - SZ0) / NSTEP;
  for (let i = 0; i < NSTEP; i++) {
    const top = rise * (i + 1), z0 = SZ0 + run * i;
    B.add(mWall(tints[2]), boxGeo(SX1 - SX0, top - 0.03, run, 1.6), (SX0 + SX1) / 2, (top - 0.03) / 2, z0 + run / 2);
    B.add(mStep, boxGeo(SX1 - SX0 + 0.02, 0.03, run + 0.03, 0.8), (SX0 + SX1) / 2, top - 0.015, z0 + run / 2 + 0.015);
  }
  segs0.push([B.ox + SX0, B.oz + SZ0, B.ox + SX0, B.oz + SZ1, 3]); // can't step onto the stairs from the side
  segs0.push([B.ox + SX0, B.oz + SZ1, B.ox + hw, B.oz + SZ1, 3]);  // …nor climb in from under the landing
  // handrail up the open side of the flight
  const rail = (x0, z0, y0, x1, z1, y1) => {
    const L = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
    const m = new THREE.Mesh(cylGeo(0.022, 0.022, L, 8), B.mats.get(mDark));
    m.position.set(B.ox + (x0 + x1) / 2, (y0 + y1) / 2, B.oz + (z0 + z1) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
    B.extra.push(m);
  };
  rail(SX0 + 0.04, SZ0 + 0.1, 0.95, SX0 + 0.04, SZ1, F2 + 0.95);
  for (let i = 1; i < NSTEP; i += 2) { const z = SZ0 + run * (i + 0.5); B.add(mIron, boxGeo(0.02, 0.9, 0.02, 1), SX0 + 0.04, rise * (i + 1) + 0.45, z); }
  // the street door (shut from inside) and the way out
  B.add(mDark, boxGeo(1.1, 2.2, 0.08, 1.2), 0, 1.1, 0.06, 0);
  B.add(mMetal, boxGeo(0.06, 0.06, 0.1, 1), 0.38, 1.05, 0.12, 0);
  B.interact({ type: 'exit', x: 0, z: 0.7, r: 1.1, label: 'Salir a la calle' });
  segs0.push([B.ox - 0.6, B.oz + 0.05, B.ox + 0.6, B.oz + 0.05, 2.2]);
  // the window onto calle Malfeitos: persiana half up, glass, the iron grille outside
  {
    const x = -2.15, w = 1.3, hS = 0.45;
    B.add(mShutter, boxGeo(w, hS, 0.04, 1), x, 2.05 - hS / 2, 0.02);
    B.extraMesh(new THREE.Mesh(planeGeo(w - 0.04, 1.1 - hS, 1), glass), x, 0.95 + (1.1 - hS) / 2, 0.06, 0);
    B.add(mWhite, boxGeo(0.04, 1.1 - hS, 0.05, 1), x, 0.95 + (1.1 - hS) / 2, 0.06);
    for (let i = 0; i < 8; i++) B.add(mIron, boxGeo(0.02, 1.12, 0.02, 1), x - w / 2 + 0.1 + i * (w - 0.2) / 7, 1.5, -0.07);
    B.add(mDark, boxGeo(w + 0.1, 0.08, 0.2, 1), x, 0.95, 0.03);
    B.view('f', x - w / 2, 0.95, -0.12, x + w / 2, 2.05, 0.12);
  }
  // door leaves
  B.doorLeaf(mDark, mMetal, 1.5, 3.8, 1, 0, 1, 1.5);
  B.doorLeaf(mDark, mMetal, 0.9, 4.25, 0, 1, -1, 1.45);
  B.doorLeaf(mDark, mMetal, 0.9, 9.3, 0, 1, -1, 1.3, 0.8);
  B.doorLeaf(mDark, mMetal, 1.25, D1, 1, 0, -1, 1.55);
  // the bathroom window onto the patio: white frame, frosted glass, a sill
  {
    const cx = -hw + 1.3, w = 1.0;
    B.add(mWhite, boxGeo(w + 0.12, 0.05, 0.24, 1), cx, 1.185, D1 - 0.03);
    for (const sx of [-1, 1]) B.add(mWhite, boxGeo(0.05, 0.7, 0.12, 1), cx + sx * (w / 2 - 0.025), 1.55, D1);
    B.add(mWhite, boxGeo(w, 0.05, 0.12, 1), cx, 1.875, D1);
    B.add(B.mat('frosted', () => std(0xe8eef0, { roughness: 0.5, transparent: true, opacity: 0.82 })), boxGeo(w - 0.06, 0.64, 0.01, 1), cx, 1.55, D1);
  }
  // --- saloncito: two-seater sofa and an armchair round a small table, the telly, shelves, a rug
  {
    solid(mSofa, 0.85, 0.42, 1.8, -2.72, 0, 1.9);
    box(mSofa, 0.2, 0.5, 1.8, -3.05, 0.42, 1.9); box(mSofa, 0.85, 0.3, 0.2, -2.72, 0.42, 0.9); box(mSofa, 0.85, 0.3, 0.2, -2.72, 0.42, 2.9);
    for (const [z, c] of [[1.45, mPink], [2.35, mLilac]]) box(c, 0.14, 0.34, 0.38, -2.9, 0.44, z, 0.1);
    solid(mSofa, 0.8, 0.42, 0.8, -1.0, 0, 3.25, 0); box(mSofa, 0.8, 0.45, 0.18, -1.0, 0.42, 3.55); // armchair
    solid(mPale, 0.9, 0.42, 0.55, -1.7, 0, 1.9);
    box(B.mat('mug', () => std(0xe8456a, { roughness: 0.4 })), 0.08, 0.1, 0.08, -1.55, 0.42, 1.8);
    solid(mDark, 0.45, 0.5, 1.3, 2.95, 0, 1.6);
    const tv = new THREE.Mesh(boxGeo(0.06, 0.6, 1.05, 1), new THREE.MeshStandardMaterial({ color: 0x0c0d10, emissive: 0x6a8aa8, emissiveIntensity: 0.3, roughness: 0.3 }));
    B.extraMesh(tv, 2.95, 0.84, 1.6);
    B.interact({ type: 'tv', x: 2.1, z: 1.6, r: 0.9, label: 'Encender la tele', mesh: tv });
    // open bookshelf (back, sides, four shelves) with books, clear of the door into the hall (x 1.5-2.4)
    box(mDark, 1.1, 1.7, 0.03, -0.2, 0, 3.745); for (const x of [-0.74, 0.34]) box(mDark, 0.03, 1.7, 0.32, x, 0, 3.6);
    for (const y of [0.02, 0.45, 0.88, 1.31, 1.67]) box(mDark, 1.1, 0.03, 0.32, -0.2, y, 3.6);
    B.footprint(1.1, 0.32, -0.2, 3.6, 0, 1.7);
    const bookCols = [0x7a2a22, 0x2a4a6a, 0xe87aa4, 0xb89a5a, 0x3a5a2a, 0xe8dcc0];
    for (let sh = 0; sh < 3; sh++) {
      let x = -0.7;
      while (x < 0.25) {
        const w = 0.03 + r() * 0.035, hb = 0.2 + r() * 0.12;
        if (r() < 0.12) { x += 0.08; continue; }
        box(B.mat('book' + (Math.floor(r() * 6)), () => std(bookCols[Math.floor(r() * 6)], { roughness: 0.8 })), w, hb, 0.2, x + w / 2, 0.05 + sh * 0.43, 3.62, (r() - 0.5) * 0.06);
        x += w + 0.004;
      }
    }
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rugTexture(seed), roughness: 1 }));
    B.extraMesh(rug, -1.6, 0.012, 1.9);
    picture(pictureTexture('paisaje', seed), -hw + 0.08, 1.65, 1.9, Math.PI / 2, 0.7, 0.5);
    picture(pictureTexture('foto', seed + 1), 0.9, 1.6, 3.72, Math.PI, 0.3, 0.38);
    plant(-3.0, 3.5, 0, true);
    const mir = new THREE.Mesh(new THREE.CircleGeometry(0.24, 28), new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.05, metalness: 1 }));
    B.extraMesh(mir, 2.8, 1.65, 3.72, Math.PI);
    B.add(B.mat('gilt', () => std(0xb89a5a, { roughness: 0.35, metalness: 0.7 })), new THREE.TorusGeometry(0.25, 0.022, 8, 28), 2.8, 1.65, 3.73, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.5 }));
    B.extraMesh(face, -0.2, 2.2, 3.72, Math.PI);
    B.add(mDark, new THREE.TorusGeometry(0.15, 0.018, 6, 24), -0.2, 2.2, 3.73, 0);
    for (let i = 0; i < 3; i++) picture(pictureTexture('foto', seed + 10 + i), -2.2 + i * 0.45, 1.55 + (i % 2) * 0.12, 3.72, Math.PI, 0.26, 0.32);
    box(mDark, 0.05, 1.5, 0.05, -3.0, 0, 0.5); // floor lamp
    const fl = new THREE.Mesh(cylGeo(0.14, 0.22, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0xf4ead8, emissive: 0xffd9a0, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    fl.userData.lamp = true; B.extraMesh(fl, -3.0, 1.62, 0.5);
    B.light(-3.0, 1.5, 0.6, 0xffd0a0, 3, 4);
    for (const x of [-2.95, -1.35]) B.add(B.mat('curtain', () => std(0xe8d6b8, { roughness: 1, side: THREE.DoubleSide })), boxGeo(0.35, 1.6, 0.04, 1), x, 1.45, 0.12);
    B.light(-0.6, 2.62, 1.9, 0xffd9a0, 7, 7);
    B.spots.salon = { x: B.ox - 1.4, z: B.oz + 2.6 };
  }
  // --- recibidor (the other part of the house): coat rack, shoe cabinet, mirror, the phone
  {
    solid(mDark, 0.3, 0.9, 0.9, 1.08, 0, 7.2);
    const mirror = new THREE.Mesh(planeGeo(0.5, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.05, metalness: 1 }));
    B.extraMesh(mirror, 0.99, 1.55, 7.2, Math.PI / 2);
    B.interact({ type: 'mirror', x: 1.45, z: 7.2, r: 0.6, label: 'Mirarse al espejo' });
    box(mDark, 0.06, 1.7, 0.06, 1.1, 0, 5.8); for (const a of [0, 2.1, 4.2]) box(mDark, 0.3, 0.03, 0.03, 1.1 + Math.cos(a) * 0.12, 1.66, 5.8 + Math.sin(a) * 0.12, a);
    plant(1.2, 10.2, 0, false);
    B.light(1.45, 2.62, 4.6, 0xffd9a0, 5, 6);
    B.light(1.45, 2.62, 9.9, 0xffd9a0, 4, 5);
    B.spots.entrada = { x: B.ox, z: B.oz + 1.2 };
  }
  // --- cocina
  {
    solid(mWhite, 0.62, 0.9, 3.4, -2.88, 0, 6.0);
    box(B.mat('worktop', () => std(0x3a3a3a, { roughness: 0.3 })), 0.66, 0.04, 3.44, -2.88, 0.9, 6.0);
    B.add(mBath, planeGeo(3.4, 0.7, 0.6).rotateY(Math.PI / 2), -hw + 0.08, 1.3, 6.0);
    box(mBlack, 0.5, 0.02, 0.55, -2.88, 0.94, 5.2); box(mMetal, 0.45, 0.05, 0.4, -2.88, 0.9, 6.9);
    solid(mWhite, 0.7, 1.8, 0.66, -2.8, 0, 7.95);
    solid(mPale, 1.0, 0.76, 0.75, -1.0, 0, 6.2);
    for (const [x, z, ry] of [[-1.0, 5.6, 0], [-1.0, 6.8, Math.PI], [-0.3, 6.2, -Math.PI / 2]]) {
      box(mPale, 0.42, 0.04, 0.42, x, 0.44, z, ry); box(mPale, 0.42, 0.48, 0.04, x - Math.sin(ry) * 0.2, 0.48, z - Math.cos(ry) * 0.2, ry);
    }
    B.interact({ type: 'drawer', x: -2.3, z: 6.3, r: 0.9, label: 'Registrar los cajones' });
    picture(pictureTexture('calendario', seed + 2), -0.2, 1.6, 8.33, Math.PI, 0.3, 0.38);
    B.light(-1.2, 2.62, 6.1, 0xfff0d8, 7, 7);
    B.spots.cocina = { x: B.ox - 1.4, z: B.oz + 5.0 };
  }
  // --- baño de abajo
  {
    solid(mWhite, 0.8, 0.12, 0.8, -2.7, 0, 9.7);
    B.add(mBath, planeGeo(2.1, 1.8, 0.6).rotateY(Math.PI / 2), -hw + 0.08, 0.9, 9.45);
    solid(mWhite, 0.4, 0.42, 0.55, -1.5, 0, 10.1, Math.PI); box(mWhite, 0.38, 0.35, 0.16, -1.5, 0.42, 10.35);
    solid(mWhite, 0.5, 0.85, 0.4, -0.3, 0, 10.2, Math.PI);
    B.light(-1.2, 2.62, 9.4, 0xf4f8ff, 4, 5);
  }
  // --- patio: geraniums, a table with two chairs, the washing machine under a little roof, a clothesline
  {
    for (const [x, z, big] of [[-2.8, 11.0, true], [-2.8, 13.0, false], [2.8, 13.0, true], [2.9, 11.2, false], [0, 13.1, false]]) plant(x, z, 0, big);
    const mGreen = B.mat('iron2', () => std(0x2a4a3a, { roughness: 0.5, metalness: 0.4 }));
    box(mGreen, 0.72, 0.03, 0.72, -0.9, 0.72, 12.0); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(mGreen, 0.03, 0.72, 0.03, -0.9 + a * 0.32, 0, 12.0 + b * 0.32);
    B.footprint(0.72, 0.72, -0.9, 12.0, 0, 0.75);
    for (const [x, z, ry] of [[-0.9, 11.45, 0], [-0.9, 12.55, Math.PI]]) { box(mGreen, 0.4, 0.03, 0.4, x, 0.45, z, ry); box(mGreen, 0.4, 0.45, 0.03, x - Math.sin(ry) * 0.19, 0.46, z - Math.cos(ry) * 0.19, ry); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(mGreen, 0.025, 0.45, 0.025, x + a * 0.17, 0, z + b * 0.17); }
    solid(mWhite, 0.6, 0.85, 0.6, 2.7, 0, 12.1);
    box(B.mat('corrugated', () => texMat('corrugated_iron', 0xd8d4c8, 0.6)), 1.3, 0.04, 1.1, 2.6, 2.3, 12.1);
    box(mMetal, 0.02, 0.02, 2.6, -2.2, 2.05, 12.2);
    for (let i = 0; i < 3; i++) B.add(B.mat('cloth' + i, () => std([0xf4a6c0, 0xf4f4f0, 0x88a9c9][i], { roughness: 1, side: THREE.DoubleSide })), planeGeo(0.45, 0.55, 1), -2.2, 1.75, 11.4 + i * 0.8, Math.PI / 2);
    B.light(0, 2.7, D1 + 0.3, 0xffe8c0, 4, 6);
    B.spots.patio = { x: B.ox + 0.8, z: B.oz + 12.8 };
    B.view('b', -hw, 3.2, D1, hw, 40, DP); // the sky over the patio, the neighbours' roofs
  }

  // ================================================================ upper floor
  B.segs = segs1;
  const Y = F2;
  const rooms1 = { dormitorio: [-hw, 0, hw, SZ0], banoAlto: [-hw, SZ0, 0.9, 7.4], estudio: [-hw, 7.4, 0.9, D1] };
  for (const [name, [x0, z0, x1, z1]] of Object.entries(rooms1)) { floor(name === 'banoAlto' ? mBath : mWood, x0, z0, x1, z1, Y); ceil(x0, z0, x1, z1, Y + H2); }
  floor(mWood, 0.9, SZ0, SX0, D1, Y); floor(mWood, SX0, SZ1, hw, D1, Y); // hall and landing
  ceil(0.9, SZ0, hw, D1, Y + H2);
  // slab edges round the stairwell (the ground-floor ceiling is 15 cm under the upper floor)
  box(mCeil, 0.1, F2 - WALL_H, SZ1 - SZ0, SX0 - 0.05, WALL_H, (SZ0 + SZ1) / 2);
  box(mCeil, hw - SX0, F2 - WALL_H + 0.01, 0.1, (SX0 + hw) / 2, WALL_H - 0.005, SZ0);
  // walls
  B.wall(mWall(tints[3]), -hw, 0, hw, 0, H2, [[hw - 1.3, hw - 0.3, 0, 2.15]], Y);
  segs1.push([B.ox - 1.3, B.oz + 0.05, B.ox - 0.3, B.oz + 0.05, 1.1]); // balcony rail
  B.wall(mWall(tints[3]), -hw, 0, -hw, SZ0, H2, [], Y); B.wall(mWall(tints[3]), hw, 0, hw, SZ0, H2, [], Y);
  B.wall(mWall(tints[1]), -hw, SZ0, -hw, D1, H2, [], Y); B.wall(mWall(tints[2]), hw, SZ0, hw, D1, H2, [], Y);
  B.wall(mWall(tints[1]), -hw, D1, hw, D1, H2, [[0.9, 1.8, 1.1, 1.9], [4.8, 5.8, 1.1, 1.9]], Y);
  B.wall(mOut, -hw, D1 + 0.02, hw, D1 + 0.02, H2 + 0.3, [[0.9, 1.8, 1.1, 1.9], [4.8, 5.8, 1.1, 1.9]], Y, false);
  // the eave over the patio: a row of clay tiles on the top of the back wall
  B.add(B.mat('rooftile', () => texMat('clay_roof_tiles_02', 0xffffff, 0.8)), boxGeo(W + 0.3, 0.12, 0.7, 2.5).rotateX(0.32), 0, Y + H2 + 0.36, D1 + 0.28);
  // the two windows at the back, over the patio: white frame, glass, sill, the persiana nearly all the way up
  for (const [x0, x1] of [[-hw + 0.9, -hw + 1.8], [-hw + 4.8, -hw + 5.8]]) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    B.add(mWhite, boxGeo(w + 0.12, 0.05, 0.26, 1), cx, Y + 1.085, D1 - 0.03);
    for (const sx of [-1, 1]) B.add(mWhite, boxGeo(0.05, 0.8, 0.12, 1), cx + sx * (w / 2 - 0.025), Y + 1.5, D1);
    B.add(mWhite, boxGeo(w, 0.05, 0.12, 1), cx, Y + 1.875, D1);
    B.add(mWhite, boxGeo(0.04, 0.72, 0.05, 1), cx, Y + 1.5, D1);
    B.extraMesh(new THREE.Mesh(planeGeo(w - 0.06, 0.74, 1), glass), cx, Y + 1.5, D1 + 0.01, Math.PI);
    B.add(mShutter, boxGeo(w, 0.2, 0.03, 1), cx, Y + 1.79, D1 + 0.06);
    B.view('b', x0, Y + 1.1, D1 - 0.12, x1, Y + 1.9, D1 + 0.12);
  }
  B.wall(mWall(tints[3]), -hw, SZ0, hw, SZ0, H2, [door(1.0 + hw)], Y); // bedroom wall, door at the end of the landing hall
  B.wall(mWall(tints[1]), 0.9, SZ0, 0.9, D1, H2, [door(5.85 - SZ0), door(9.5 - SZ0)], Y);
  B.wall(mWall(tints[1]), -hw, 7.4, 0.9, 7.4, H2, [], Y);
  // railing round the stairwell
  segs1.push([B.ox + SX0, B.oz + SZ0, B.ox + SX0, B.oz + SZ1, 1.1]);
  for (let z = SZ0 + 0.1; z < SZ1; z += 0.12) B.add(mIron, boxGeo(0.018, 0.9, 0.018, 1), SX0 + 0.02, Y + 0.45, z);
  rail(SX0 + 0.02, SZ0 + 0.05, Y + 0.93, SX0 + 0.02, SZ1, Y + 0.93);
  B.doorLeaf(mDark, mMetal, 1.0, SZ0, 1, 0, -1, 1.5);
  B.doorLeaf(mDark, mMetal, 0.9, 5.85, 0, 1, -1, 1.4);
  B.doorLeaf(mDark, mMetal, 0.9, 9.5, 0, 1, -1, 1.45);
  for (const d of B.doorLeaves.slice(-3)) d.pivot.position.y = Y;
  // --- Annie's bedroom: her bed against the back wall, bedside tables, wardrobe, a dressing table by the balcony,
  //     fairy lights, a cat poster, a plush cat on the pillows
  {
    const bx = -1.55, bz = 3.9; // bed centre (headboard on z = SZ0)
    solid(mDark, 1.58, 0.3, 2.05, bx, Y, bz);
    box(mSheet, 1.5, 0.22, 1.95, bx, Y + 0.3, bz);
    box(mPink, 1.56, 0.07, 1.25, bx, Y + 0.52, bz - 0.33);
    box(mSheet, 0.62, 0.13, 0.36, bx - 0.38, Y + 0.52, SZ0 - 0.33); box(mSheet, 0.62, 0.13, 0.36, bx + 0.38, Y + 0.52, SZ0 - 0.33);
    box(mLilac, 0.4, 0.3, 0.12, bx, Y + 0.58, SZ0 - 0.55, 0.15);
    box(mDark, 1.66, 1.05, 0.06, bx, Y, SZ0 - 0.05, 0, 1.2); // headboard
    // plush cat
    const catM = B.mat('plush', () => std(0xfdfbf7, { roughness: 1 }));
    B.add(catM, new THREE.SphereGeometry(0.13, 12, 10), bx + 0.45, Y + 0.72, SZ0 - 0.55);
    B.add(catM, new THREE.SphereGeometry(0.1, 12, 10), bx + 0.45, Y + 0.9, SZ0 - 0.52);
    for (const s of [-1, 1]) B.add(catM, new THREE.ConeGeometry(0.035, 0.07, 8), bx + 0.45 + s * 0.055, Y + 0.99, SZ0 - 0.52);
    B.add(B.mat('bow', () => std(0xe0283c, { roughness: 0.6 })), new THREE.SphereGeometry(0.03, 8, 6), bx + 0.52, Y + 0.98, SZ0 - 0.48);
    for (const x of [bx - 1.05, bx + 1.05]) {
      solid(mPale, 0.45, 0.55, 0.4, x, Y, SZ0 - 0.3);
      const lamp = new THREE.Mesh(cylGeo(0.08, 0.13, 0.18), new THREE.MeshStandardMaterial({ color: 0xffe4ee, emissive: 0xffc8d8, emissiveIntensity: 0.55 }));
      lamp.userData.lamp = true;
      B.extraMesh(lamp, x, Y + 0.75, SZ0 - 0.3);
    }
    // fairy lights over the bed
    const fairy = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd890, emissiveIntensity: 1.2 });
    for (let i = 0; i < 22; i++) {
      const t = i / 21, x = bx - 1.1 + t * 2.2, y = Y + 1.95 - Math.sin(t * Math.PI) * 0.22;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), fairy); b.userData.lamp = true;
      B.extraMesh(b, x, y, SZ0 - 0.1);
    }
    picture(catPoster(), bx + 1.35, Y + 1.55, SZ0 - 0.08, Math.PI, 0.46, 0.6);
    // wardrobe on the left wall, dressing table with a mirror under the front window
    solid(mPale, 0.6, 2.1, 1.6, -2.88, Y, 1.4, 0, 1.2);
    box(mBlack, 0.01, 1.9, 0.015, -2.57, Y + 0.1, 1.4);
    solid(mPale, 1.0, 0.75, 0.48, 1.8, Y, 0.3);
    const vm = new THREE.Mesh(planeGeo(0.6, 0.75, 1), new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.05, metalness: 1 }));
    B.extraMesh(vm, 1.8, Y + 1.25, 0.1, 0);
    B.interact({ type: 'mirror', x: 1.8, z: 0.95, r: 0.7, y: Y, label: 'Arreglarse en el tocador' });
    box(mPale, 0.42, 0.04, 0.42, 1.8, Y + 0.44, 0.85); // stool
    // balcony door on the street side (shutter half down) and a rug
    B.add(mShutter, boxGeo(1.0, 0.6, 0.04, 1), -0.8, Y + 1.85, 0.03, 0);
    B.extraMesh(new THREE.Mesh(planeGeo(0.94, 1.45, 1), glass), -0.8, Y + 0.83, 0.06, 0);
    for (const x of [-1.27, -0.33]) B.add(mWhite, boxGeo(0.05, 1.55, 0.08, 1), x, Y + 0.78, 0.05);
    B.add(mWhite, boxGeo(0.04, 1.45, 0.05, 1), -0.8, Y + 0.83, 0.06);
    B.add(mWhite, boxGeo(0.98, 0.06, 0.08, 1), -0.8, Y + 0.08, 0.05);
    B.view('f', -1.3, Y, -0.12, -0.3, Y + 2.15, 0.12);
    for (let i = 0; i < 9; i++) B.add(mIron, boxGeo(0.018, 1.0, 0.018, 1), -1.25 + i * 0.112, Y + 0.5, -0.08);
    B.add(mIron, boxGeo(1.02, 0.03, 0.04, 1), -0.8, Y + 1.0, -0.08);
    const rug2 = new THREE.Mesh(planeGeo(1.6, 1.1, 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6c6d6, roughness: 1 }));
    B.extraMesh(rug2, bx, Y + 0.012, 2.2);
    plant(-2.9, 3.3, Y, false);
    for (const x of [-1.47, -0.13]) B.add(B.mat('curtainP', () => std(0xf8dce6, { roughness: 1, side: THREE.DoubleSide })), curtainGeo(0.36, 2.2), x, Y + 1.15, 0.13);
    box(mMetal, 1.7, 0.025, 0.025, -0.8, Y + 2.27, 0.13); // curtain rail
    box(mPale, 0.9, 0.03, 0.22, 3.02, Y + 1.6, 3.6, Math.PI / 2);
    for (let i = 0; i < 6; i++) box(B.mat('bookP' + (i % 3), () => std([0xe87aa4, 0x88a9c9, 0xf2d230][i % 3], { roughness: 0.8 })), 0.16, 0.2, 0.04, 3.02, Y + 1.63, 3.3 + i * 0.07);
    picture(pictureTexture('foto', seed + 20), hw - 0.08, Y + 1.5, 2.2, -Math.PI / 2, 0.3, 0.38);
    B.interact({ type: 'bed', x: bx + 0.95, z: 3.0, r: 1.0, y: Y, label: 'Echarse una siesta en su cama' });
    // the safe, on the floor against the right wall: what is in it is never lost (a hospital bill, a fine…)
    {
      const sx = hw - 0.34, sz = 2.75;
      const mSafe = B.mat('safe', () => std(0x3a3f46, { roughness: 0.35, metalness: 0.65 }));
      solid(mSafe, 0.46, 0.56, 0.5, sx, Y, sz);
      box(mMetal, 0.02, 0.44, 0.38, sx - 0.24, Y + 0.06, sz);
      const dial = new THREE.Mesh(cylGeo(0.05, 0.05, 0.03, 18).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.9 }));
      B.extraMesh(dial, sx - 0.26, Y + 0.34, sz + 0.08);
      box(mMetal, 0.04, 0.03, 0.16, sx - 0.26, Y + 0.22, sz - 0.1);
      B.interact({ type: 'safe', x: sx - 0.7, z: sz, r: 0.75, y: Y, label: 'Caja fuerte' });
    }
    B.light(-0.6, Y + H2 - 0.33, 2.3, 0xffe2d0, 7, 7);
    B.spots.dormAnnie = { x: B.ox + 0.4, z: B.oz + 2.6 };
  }
  // --- upstairs bathroom and a study
  {
    solid(mWhite, 1.6, 0.55, 0.72, -2.35, Y, 5.45);
    B.add(mBath, planeGeo(1.8, 1.6, 0.6), -2.35, Y + 0.8, SZ0 + 0.08, 0);
    solid(mWhite, 0.4, 0.42, 0.55, -0.4, Y, 5.4); box(mWhite, 0.38, 0.35, 0.16, -0.4, Y + 0.42, 5.18);
    solid(mWhite, 0.5, 0.85, 0.4, -2.9, Y, 6.9, Math.PI / 2);
    B.light(-1.2, Y + H2 - 0.33, 6.2, 0xf4f8ff, 4, 5);
    solid(mPale, 1.2, 0.75, 0.6, -2.5, Y, 9.9);
    const lap = new THREE.Mesh(boxGeo(0.34, 0.02, 0.24, 1), B.mats.get(mBlack)); B.extraMesh(lap, -2.5, Y + 0.77, 9.85);
    box(mPale, 0.42, 0.04, 0.42, -2.5, Y + 0.44, 9.3);
    solid(mDark, 0.32, 1.8, 1.1, -3.0, Y, 8.3);
    solid(mSofa, 1.5, 0.42, 0.75, -1.2, Y, 7.85);
    B.light(-1.2, Y + H2 - 0.33, 9.0, 0xffe8c8, 5, 6);
    B.light(1.45, Y + H2 - 0.33, 7.2, 0xffd9a0, 4, 6);
    B.light(2.6, Y + H2 - 0.33, 9.95, 0xffd9a0, 3, 5);
  }
  for (const s of segs1) s[4] += F2; // upstairs segments stand on the upper floor (rays below them pass)

  // ================================================================ finish: one collider per storey
  B.segs = segs0;
  const out = B.finish();
  const xs = segs1.flatMap((s) => [s[0], s[2]]), zs = segs1.flatMap((s) => [s[1], s[3]]);
  const col1 = new StaticCollider(Math.min(...xs) - 10, Math.min(...zs) - 10, Math.max(...xs) + 10, Math.max(...zs) + 10, 2);
  for (const s of segs1) col1.addSegment(s[0], s[1], s[2], s[3], s[4]);
  col1.build();
  out.levels = [out.collider, col1];
  out.level = 0;
  out.split = F2 * 0.5;
  const ox = origin.x, oz = origin.z;
  // standing height at (x, z) for someone currently at height y: a ramp over the steps, else their storey's floor
  out.floorY = (x, z, y) => {
    const lx = x - ox, lz = z - oz;
    if (lx > SX0 - 0.02 && lx < hw && lz > SZ0 && lz < SZ1) return ((lz - SZ0) / (SZ1 - SZ0)) * F2;
    return y > F2 * 0.5 ? F2 : 0;
  };
  out.ceilY = (x, z, y) => (y > F2 * 0.5 ? F2 + H2 : WALL_H);
  const fl = (x, z) => ({ x: ox + x, z: oz + z });
  out.spots.floor = { saloncito: fl(-1.2, 2.6), recibidor: fl(1.45, 4.4), cocina: fl(-1.4, 5.0), patio: fl(0.8, 12.8), entrada: fl(0, 1.2) };
  out.spots.wake = fl(0.4, 2.6);
  out.origin = { x: ox, z: oz };
  out.kind = 'annie';
  out.bounds = { x0: ox - hw, x1: ox + hw, z0: oz, z1: oz + DP };
  return out;
}

// ---------------------------------------------------------------- door markers in town + entering/leaving
function doorIcon() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fillStyle = '#6fc0ff'; x.fill();
  x.lineWidth = 8; x.strokeStyle = '#1a1a1a'; x.stroke();
  x.fillStyle = '#1a1a1a'; x.fillRect(42, 34, 44, 62);
  x.fillStyle = '#6fc0ff'; x.fillRect(50, 42, 28, 50);
  x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(72, 68, 4, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
}

export class Interiors {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.doors = [];
    this.current = null;
    this.house = null;
    this.t = 0;
    this.iconMat = doorIcon();
    this.fadeEl = document.getElementById('fade');
  }

  // a few marked street doors around town (and Annie's house in calle Malfeitos)
  setup(activities) {
    const g = this.game, map = g.map;
    // the scans the houses are made of, fetched now: the first time you step inside, the walls are not black
    for (const n of ['floor_tiles_06', 'dark_wood', 'painted_plaster_wall', 'white_rough_plaster', 'long_white_tiles', 'herringbone_parquet', 'granite_wall',
      'clay_roof_tiles_02', 'rock_tile_floor', 'concrete_floor_damaged_01', 'decrepit_wallpaper', 'corrugated_iron', 'brick_wall_02', 'white_plaster_02']) loadTexture(n, '_d');
    const picks = [];
    const home = { x: 112.6, z: -171.4 };
    // snap the marker to a real 3D front door of that house when there is one close by
    const fdoors = (g.world && g.world.facadeDoors) || [];
    const snap = (door, bid) => {
      let best = null, bd = 7;
      for (const f of fdoors) {
        if (bid != null && f.bid !== bid && Math.hypot(f.x - door.x, f.z - door.z) > 1.5) continue;
        const d = Math.hypot(f.x - door.x, f.z - door.z);
        if (d < bd) { bd = d; best = f; }
      }
      return best ? { ...door, x: best.x, z: best.z, fx: best.wx - best.nx * 3, fz: best.wz - best.nz * 3 } : door;
    };
    const addDoor = (door0, name, seed, owner = null, bid = null) => {
      const door = snap(door0, bid);
      const spr = new THREE.Sprite(this.iconMat);
      spr.scale.set(0.6, 0.6, 1);
      spr.position.set(door.x, 2.7, door.z);
      spr.visible = false;
      this.root.add(spr);
      this.doors.push({ ...door, name, seed, owner, spr });
    };
    // Annie's door: the Catastro entrance point, the pavement spot just in front of it
    addDoor({ x: 111.9, z: -171.4, fx: home.x, fz: home.z }, 'Casa de Annie', 12, 'annie');
    // Santa María: in by the main door at the foot or by the Mediodía one, walking through their open leaves (or with E
    // before them); the Gospel door stays shut. No marker: the doors themselves are there to be seen
    const lm = g.world && g.world.landmarks && g.world.landmarks.poi;
    for (const [key, d] of [['oeste', lm && lm.churchWest], ['sur', lm && lm.churchSouth], ['norte', lm && lm.churchNorth]]) {
      if (!d) continue;
      const spr = new THREE.Sprite(this.iconMat); spr.scale.set(0.6, 0.6, 1); spr.position.set(d.x, 2.7, d.z); spr.visible = false; this.root.add(spr);
      this.doors.push({ x: d.x, z: d.z, fx: d.f.x, fz: d.f.z, name: 'Iglesia de Santa María', seed: 7, owner: null, church: key, spr, leaves: d.door || null, thr: d.thr || { x: d.x, z: d.z }, nx: d.nx ?? 0, nz: d.nz ?? 1, half: d.half || 1.2, shut: key === 'norte' });
    }
    // the public buildings you can go into (venues.js): the Ayuntamiento, the theatre, the market, the sports hall…
    for (const v of (lm && lm.venues) || []) {
      const spr = new THREE.Sprite(this.iconMat); spr.scale.set(0.6, 0.6, 1); spr.position.set(v.x, 2.7, v.z); spr.visible = false; this.root.add(spr);
      this.doors.push({ x: v.x, z: v.z, fx: v.fx, fz: v.fz, name: v.name, seed: v.seed || 5, owner: null, venue: v.kind, spr, leaves: v.door || null, thr: v.thr, nx: v.nx, nz: v.nz, half: v.half || 1, marker: !v.door });
    }
    // other houses: residential buildings along walkable streets in town, spread out
    const cands = map.buildings.filter((b) => b.use !== 1 && b.use !== 2 && b.floors <= 2 && b.area > 60 && b.area < 400 && map.inTown(b.c[0], b.c[1]));
    const rnd = mulberry32(77);
    cands.sort(() => rnd() - 0.5);
    for (const b of cands) {
      if (picks.length >= 22) break;
      if (picks.some((p) => Math.hypot(p.x - b.c[0], p.z - b.c[1]) < 70) || Math.hypot(home.x - b.c[0], home.z - b.c[1]) < 40) continue;
      const d = activities && activities.doorOf ? activities.doorOf({ x: b.c[0], z: b.c[1] }) : null;
      if (!d || map.buildingAt(d.x, d.z) || Math.hypot(d.x - d.fx, d.z - d.fz) > 25) continue;
      picks.push({ x: b.c[0], z: b.c[1] });
      const prof = houseProfile(1000 + b.id);
      const n = prof.name;
      addDoor(d, n.startsWith('El ') ? 'Casa del ' + n.slice(3) : 'Casa de ' + n.replace(/^Los /, 'los ').replace(/^La /, 'la '), 1000 + b.id, null, b.id);
    }
  }

  // your own house is «Tu casa» unless you are Annie herself
  doorLabel(d) {
    const p = this.game.player, me = p && p.char && p.char.desc;
    return d.owner === 'annie' && !(me && me.id === 'annie') ? 'Tu casa' : d.name;
  }
  doorNear(x, z, r = 2.2) {
    let best = null, bd = r;
    for (const d of this.doors) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }

  fade(on, ms = 350) {
    const f = this.fadeEl;
    if (!f) return Promise.resolve();
    f.style.transitionDuration = ms + 'ms';
    f.classList.toggle('on', on);
    return new Promise((res) => setTimeout(res, ms));
  }

  // step inside: build (or reuse) the house, swap the collider, park the outside world
  async enter(door, { kind = 'casa', seed = door ? door.seed : 1, silent = false, spot = 'entrada', mode = 'sneak' } = {}) {
    const g = this.game, p = g.player;
    if (this.entering) return null; // a second press during the fade
    if (door && door.x !== undefined && !door.shop && !door.church && !door.venue && g.mode === 'normal' && !this.house) g.police.onHide('house', door); // did the police see you go in?
    this.entering = true;
    try { if (!silent) await this.fade(true); } finally { this.entering = false; }
    this.leave(true);
    // where to come back to in town if we leave without using the door (mode change, death…)
    if (Math.abs(p.pos.x - INTERIOR_ORIGIN.x) > 500) this.returnTo = { x: p.pos.x, z: p.pos.z, h: p.heading };
    const vecino = kind === 'casa' && door && !door.owner && !door.shop && !door.venue && door.seed >= 1000;
    const h = door && door.venue ? buildVenue(door.venue, seed) : door && door.church ? buildChurch(seed) : door && door.shop ? buildShop(door.shop, seed, undefined, door.name) : door && door.owner === 'annie' && kind === 'casa' ? buildAnnieHouse(seed) : vecino ? buildVecino(seed) : buildHouse(kind, seed);
    this.house = h;
    this.root.add(h.group);
    this.current = door || { name: 'Casa', seed };
    this.savedCollider = g.map.collider;
    g.map.collider = h.collider;
    g.interior = h;
    if (g.windowView) g.windowView.attach(h, door, this.savedCollider); // its windows look onto the real street
    const at = h.spots[spot] || h.spots.entrada;
    if (at.h !== undefined) { p.spawnAt(at.x, at.z, at.h); g.cam.yaw = at.h + Math.PI; g.cam.pitch = h.church ? 0.12 : -0.05; }
    else { p.spawnAt(at.x, at.z + (spot === 'entrada' ? 0.6 : 0), 0); g.cam.yaw = Math.PI; g.cam.pitch = -0.05; }
    if (g.cam.setFirstPerson) g.cam.setFirstPerson(h.thirdPerson ? false : g.cam.fpPref ?? true);
    for (const d of this.doors) d.spr.visible = false;
    this.lightsOn(kind !== 'apagon');
    if (g.fm) g.fm.stop(); else g.audio.radioOn(false);
    if (!h.church) g.audio.sfx('door_close', { vol: 0.8 });
    this.visitT = 0;
    if (g.perfGrace) g.perfGrace();
    this.life = vecino ? new HouseLife(g, h, door, mode) : null;
    this.church = h.church ? new ChurchLife(g, h, { randomDesc: () => randomDesc(Math.random), massTime, weekday }) : null;
    this.venueLife = h.cast ? new VenueLife(g, h) : null;
    if (h.onEnter) setTimeout(() => { if (this.house === h) h.onEnter(g); }, 900);
    if (h.venue && door && door.name && g.hud.banner) g.hud.banner(door.name, door.sub || '', 'title');
    if (h.church) {
      g.hud.banner && g.hud.banner('Santa María', 'Iglesia parroquial · s. XVI', 'title');
      // you have just pushed through the lobby: its padded leaves swing back behind you; the great door shuts beyond
      const key = spot === 'sur' ? 'sur' : 'oeste', c = (h.cancels || []).find((q) => q.key === key);
      if (c) { c.lobby.front.set(-0.85, true); c.lobby.front.set(0); c.hold = 1.2; }
      if (!silent) setTimeout(() => { if (this.house === h && c) g.audio.sfx('church_shut', { x: c.x - c.nx * 2.6, z: c.z - c.nz * 2.6, vol: 0.55 }); }, 450);
    }
    if (door && door.shop && g.shops) g.shops.onEnter(h, door);        // somebody behind the counter
    if (door && door.owner && g.decor && kind === 'casa') g.decor.enter(h); // your things, where you left them
    if (vecino && mode === 'sneak') g.hud.notify(h.profile ? `Estás dentro. Aquí vive ${h.profile.label}. ${g.gx('Agachado', 'Agachada')} (${g.input.keyText('C', 10, 'Agachar')}) haces menos ruido.` : 'Estás dentro.', 'info', 4);
    if (!silent) this.fade(false);
    return h;
  }

  async exit(which = null) {
    const g = this.game;
    let d = this.current;
    if (!this.house) return;
    if (which && d && d.church) d = this.doors.find((q) => q.church === which) || d;
    await this.fade(true);
    if (!(d && d.church)) g.audio.sfx('door_open', { vol: 0.8 });
    this.leave();
    if (d && d.church && d.thr) {
      // out on the step before the door, its leaves open behind you (they close once you walk away)
      const ang = Math.atan2(d.nx, d.nz);
      g.player.spawnAt(d.thr.x + d.nx * 1.0, d.thr.z + d.nz * 1.0, ang);
      g.cam.yaw = ang + Math.PI;
      if (d.leaves) d.leaves.set(1, true, d.church !== 'oeste');
      g.audio.sfx('church_door', { x: d.thr.x, z: d.thr.z, vol: 0.5 });
    } else if (d && d.x !== undefined) {
      const ang = Math.atan2(d.x - d.fx, d.z - d.fz); // facing away from the facade
      g.player.spawnAt(d.x + Math.sin(ang) * 0.4, d.z + Math.cos(ang) * 0.4, ang);
      g.cam.yaw = ang + Math.PI;
    }
    this.fade(false);
  }

  leave(quiet = false) {
    const g = this.game;
    if (!this.house) return;
    if (this.hiding) this.unhide();
    this.cracking = null;
    if (this.life) { this.life.dispose(); this.life = null; }
    if (this.church) { this.church.dispose(); this.church = null; }
    if (this.venueLife) { this.venueLife.dispose(); this.venueLife = null; }
    if (g.windowView) g.windowView.detach();
    if (g.shops && g.shops.here) g.shops.onLeave();
    if (g.decor && g.decor.house) g.decor.leave();
    if (g.homeSafe) g.homeSafe.menu.close();
    this.root.remove(this.house.group);
    this.house.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.house = null;
    if (this.savedCollider) g.map.collider = this.savedCollider;
    this.savedCollider = null;
    g.interior = null;
    const p = g.player;
    if (Math.abs(p.pos.x - INTERIOR_ORIGIN.x) < 500) {
      const r = this.returnTo || this.doors[0] || { x: 0, z: 0 };
      p.spawnAt(r.x, r.z, r.h || 0);
    }
    if (g.cam.setFirstPerson) g.cam.setFirstPerson(false);
    shared_restoreLights(g);
    if (!quiet) this.current = null;
  }

  lightsOn(on) {
    const h = this.house;
    if (!h) return;
    h.powered = on;
    for (const l of h.lights) l.intensity = on ? l.userData.base : 0;
    h.group.traverse((o) => {
      if (o.userData && o.userData.lamp && o.material) o.material.emissiveIntensity = on ? 0.6 : 0;
    });
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    if (!this.house) {
      // outside: show the nearby door icons (bobbing)
      for (const d of this.doors) {
        if (d.church || (d.venue && d.leaves)) { this.churchDoorStep(d, dt); continue; }
        const on = g.mode === 'normal' && Math.abs(d.x - p.pos.x) < 40 && Math.abs(d.z - p.pos.z) < 40;
        d.spr.visible = on;
        if (on) d.spr.position.y = 2.6 + Math.sin(this.t * 2.2 + d.seed) * 0.08;
      }
      this.pickStep(dt);
      return;
    }
    // inside: doors swing open when pushed (they creak in the old house) and ease towards their target
    const horrorOn = g.horror && g.horror.active;
    // two-storey houses: the storey you are on decides the walls you bump into
    const hs = this.house;
    if (hs.levels) {
      const lv = p.pos.y > hs.split ? 1 : 0;
      if (lv !== hs.level) { hs.level = lv; g.map.collider = hs.levels[lv]; }
    }
    for (const d of this.house.doors || []) {
      const cx = d.pivot.position.x + Math.sin(d.base) * 0.43, cz = d.pivot.position.z + Math.cos(d.base) * 0.43;
      const gh = horrorOn && g.horror.ghost;
      const sameFloor = Math.abs(p.pos.y - d.pivot.position.y) < 1.6;
      const near = (sameFloor && Math.hypot(p.pos.x - cx, p.pos.z - cz) < 0.95) || (gh && gh.visible && gh.mode === 'stalk' && Math.hypot(gh.x - cx, gh.z - cz) < 0.9);
      if (near && d.target < 1.45) {
        d.target = Math.max(d.rest, 1.55); d.speed = 2.2;
        if (d.cur < 1.2) g.audio.sfx(horrorOn ? 'creak' : 'door_open', { x: cx, z: cz, vol: horrorOn ? 0.9 : 0.25 });
      }
      if (Math.abs(d.cur - d.target) > 1e-3) {
        const step = d.speed * dt;
        d.cur += Math.max(-step, Math.min(step, d.target - d.cur));
        d.pivot.rotation.y = d.base + d.sign * d.cur;
      }
    }
    const clk = this.house.spots.clock;
    if (clk && clk.pend) clk.pend.rotation.z = Math.sin(this.t * Math.PI) * 0.16;
    // fireplaces flicker; the people who live here; a safe being forced
    for (const l of this.house.lights) if (l.userData.fire) l.intensity = l.userData.base * (0.75 + Math.sin(this.t * 11) * 0.12 + Math.sin(this.t * 23.7) * 0.08);
    if (this.life) this.life.update(dt);
    if (this.venueLife) this.venueLife.update(dt);
    if (this.church) {
      this.lobbyStep(dt);
      this.church.update(dt);
      updateBeams(this.house, g.sky, dt);
      // candle flames flicker
      const f = 0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 31.7) * 0.06;
      for (const st of this.house.stands || []) for (const c of st.lit) { const fl = c.children[0]; if (fl) fl.scale.set(1, 2.2 * f, 1); }
    }
    if (g.decor && g.decor.house === this.house) g.decor.update(dt, g.input);
    if (this.cracking) {
      const c = this.cracking;
      if (Math.hypot(p.pos.x - c.it.x, p.pos.z - c.it.z) > c.it.r + 0.4) { this.cracking = null; g.hud.notify('Dejas la caja fuerte a medias.', 'info', 2); }
      else {
        c.t += dt;
        c.beep = (c.beep || 0) - dt;
        if (c.beep <= 0) { c.beep = 0.6; g.audio.sfx('ui_click', { vol: 0.5 }); if (this.life) this.life.noise(p.pos.x, p.pos.z, 3.5); }
        if (c.t >= c.dur) { this.cracking = null; this.finishLoot(c.it); }
      }
    }
    if (this.hiding) { p.pos.set(this.hiding.hx, p.pos.y, this.hiding.hz); p.vel.set(0, 0, 0); }
    this.visitT += dt;
  }
  // Santa María's doors from the street: heavy leaves that open as you come up to them (one leaf for the people going in
  // and out, and stands ajar in the hours the church is open; both wide when mass is about to begin or lets out). Walk
  // on through and you are inside
  churchDoorStep(d, dt) {
    const g = this.game, p = g.player, D = d.leaves;
    d.spr.visible = false;
    if (!D) return;
    const dx = p.pos.x - d.thr.x, dz = p.pos.z - d.thr.z;
    if (dx * dx + dz * dz > 140 * 140) return;
    const out = dx * d.nx + dz * d.nz, lat = dx * d.nz - dz * d.nx; // (lat: across the door, + to its right seen from the street)
    const onFoot = p.mode === 'foot' && g.mode === 'normal' && !this.house;
    const near = onFoot && !d.shut && out > -0.5 && out < 5 && Math.abs(lat) < 3.5;
    let peds = false;
    if (!d.shut) for (const q of g.peds.list) if ((q.state === 'enter' || q.state === 'exit') && Math.abs(q.x - d.thr.x) + Math.abs(q.z - d.thr.z) < 5) { peds = true; break; }
    const h = g.sky.hour, m = massTime(h, weekday(g.sky)), crowd = !!m && (m.phase === 'antes' || m.phase === 'salida');
    const hours = (h >= 9 && h < 13.5) || (h >= 17.5 && h < 21.5);
    if (d.shut) D.set(0);
    else if (near || (crowd && d.church === 'oeste')) D.set(1, false, d.church !== 'oeste');
    else if (peds || hours) D.set(1, false, true);
    else D.set(0);
    const ev = D.update(dt);
    if (ev === 'open') g.audio.sfx('church_door', { x: d.thr.x, z: d.thr.z });
    else if (ev === 'shut') g.audio.sfx('church_shut', { x: d.thr.x, z: d.thr.z });
    // walking in: through the clear part of the doorway, towards the inside
    if (near && !this.entering && out < 1.15) {
      const [lo, hi] = D.clear(), vin = -(p.vel.x * d.nx + p.vel.z * d.nz);
      if (hi - lo > 0.75 && lat > lo + 0.2 && lat < hi - 0.2 && vin > 0.45) this.enter(d, { mode: 'visit', spot: d.church === 'sur' ? 'sur' : 'entrada' });
    }
  }
  // inside the church: the lobbies' padded leaves give as you come to them; walk into one and you are out in the street
  lobbyStep(dt) {
    const g = this.game, p = g.player, h = this.house;
    for (const c of h.cancels || []) {
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z, out = dx * c.nx + dz * c.nz, lat = dx * c.nz - dz * c.nx;
      const vin = -(p.vel.x * c.nx + p.vel.z * c.nz); // (towards the lobby)
      const near = p.mode === 'foot' && c.key !== 'norte' && out > -0.2 && out < 1.5 && Math.abs(lat) < c.half + 0.3 && (vin > 0.3 || out < 0.45);
      c.hold = Math.max(0, (c.hold || 0) - dt);
      if (!c.hold) c.lobby.front.set(near ? 0.75 : 0);
      if (c.lobby.front.update(dt) === 'flap' && Math.hypot(dx, dz) < 30) g.audio.sfx('cancel_flap', { x: c.x, z: c.z });
      if (near && !this.entering && !this.leaving && out < 0.55 && Math.abs(lat) < c.half - 0.2 && vin > 0.45) {
        this.leaving = true; this.exit(c.key).finally(() => { this.leaving = false; });
      }
    }
  }
  // a nap in Annie's bed: two hours go by and she wakes up rested
  async nap() {
    const g = this.game, p = g.player;
    if (this.napping) return;
    this.napping = true;
    await this.fade(true, 600);
    g.sky.hour = (g.sky.hour + 2) % 24;
    p.health = 100; p.stamina = 1;
    g.hud.notify(`Te echas una siesta en tu cama. Dos horas después, como ${g.gx('nuevo', 'nueva')}.`, 'ok', 4);
    await new Promise((res) => setTimeout(res, 700));
    this.fade(false, 600);
    this.napping = false;
  }
  // called after the sky update: the sun and sky light barely reach inside
  dimSky() {
    const g = this.game;
    if (!this.house) return;
    if (g.windowView) g.windowView.outdoor = { sun: g.sky.sun.intensity, hemi: g.sky.hemi.intensity }; // for the street outside
    const dl = this.house.daylight;
    g.sky.sun.intensity *= dl ? dl.sun : 0.12;
    g.sky.hemi.intensity *= dl ? dl.hemi : this.house.powered ? 0.55 : 0.18;
  }

  // ---------------------------------------------------------------- neighbours' doors: knock, or sneak in
  async knock(door) {
    const g = this.game;
    if (this.knocking) return;
    this.knocking = true;
    g.audio.sfx('knock', { x: door.x, z: door.z });
    await wait(1500);
    this.knocking = false;
    if (g.state !== 'play' || this.house) return;
    const prof = houseProfile(door.seed), hour = g.sky.hour;
    const asleep = inHours(hour, prof.sleep[0], prof.sleep[1]);
    const home = hash1(prof.seed * 31 + Math.floor(g.time / 900)) < prof.home;
    const who = prof.name;
    const sub = (t, ms = 3200) => { g.hud.subtitle(who, t); setTimeout(() => g.hud.subtitle(null), ms); };
    if (!home) { g.hud.notify(`No abre nadie. Parece que no hay nadie en casa… (${g.gx('agachado', 'agachada')}, con ${g.input.keyText('C', 10, 'Agacharse')}, podrías colarte).`, 'info', 4); return; }
    if (asleep) { g.hud.notify('Nadie contesta: a estas horas estarán durmiendo.', 'info', 3); return; }
    if (g.police.wanted > 0) { sub('¡Váyase de aquí, que le anda buscando la Guardia Civil!'); return; }
    if (hour >= 22 || hour < 8.5) { sub('¿Quién es a estas horas? ¡Márchese o llamo a la Guardia Civil!'); return; }
    sub('¿Quién es? … ¡Ah, pasa, pasa!', 1800);
    await wait(900);
    if (g.state === 'play' && !this.house) this.enter(door, { mode: 'visit' });
  }
  sneakIn(door) {
    const g = this.game, p = g.player;
    if (this.picking || this.house) return;
    // somebody in the street might be watching
    const ws = g.peds.witnesses({});
    if (ws.length && Math.random() < 0.8 * PERK.witness) g.peds.startCall(ws[0], 'allanamiento', door.x, door.z);
    else if (g.police.observe(true)) g.police.report('allanamiento', door.x, door.z, null, true);
    this.picking = { door, t: 0, dur: PERK.lockpick ? 2 : 5 };
    g.audio.sfx('car_break_in', { x: door.x, z: door.z, vol: 0.45 });
  }
  pickStep(dt) {
    const g = this.game, p = g.player, k = this.picking;
    if (!k) return;
    if (Math.hypot(p.pos.x - k.door.x, p.pos.z - k.door.z) > 2.4 || p.mode !== 'foot') { this.picking = null; return; }
    k.t += dt;
    k.tick = (k.tick || 0) - dt;
    if (k.tick <= 0) { k.tick = 0.7; g.audio.sfx('ui_click', { vol: 0.35 }); }
    if (k.t >= k.dur) { this.picking = null; g.audio.sfx('door_open', { vol: 0.4 }); this.enter(k.door, { mode: 'sneak' }); }
  }
  get pickPct() { return this.picking ? Math.round((this.picking.t / this.picking.dur) * 100) : 0; }
  // loot: money at once, goods into the backpack (sell them later), the hunter's rifle into your hands
  takeLoot(it) {
    const g = this.game;
    if (it.taken) return;
    if (it.def.crack) { this.cracking = { it, t: 0, dur: it.def.crack * (PERK.lockpick ? 0.5 : 1) }; g.hud.notify('Forzando la caja fuerte… (no te alejes)', 'info', 2); return; }
    this.finishLoot(it);
  }
  finishLoot(it) {
    const g = this.game, p = g.player, def = it.def;
    it.taken = true;
    if (it.mesh) it.mesh.visible = false;
    const rint = (a) => Math.round(a[0] + Math.random() * (a[1] - a[0]));
    if (def.weapon) { g.weapons.give(def.weapon, def.ammo); g.hud.notify(`Coges el ${def.name.toLowerCase()} (${def.ammo} cartuchos).`, 'ok', 3); }
    else if (def.cash) { const n = Math.round(rint(def.cash) * PERK.luck * PERK.loot); p.money += n; g.audio.sfx('money'); g.hud.notify(`${def.name}: +${n} €`, 'ok', 3); }
    else {
      const value = Math.round(rint(def.value) * PERK.loot);
      p.bag = p.bag || [];
      p.bag.push({ id: it.id, name: def.name, value });
      g.save.bag = p.bag;
      g.hud.notify(`A la mochila: ${def.name} (≈ ${value} €). Véndelo en la compraventa o cámbialo en el mercadillo.`, 'ok', 4);
    }
    g.audio.sfx('pickup', { vol: 0.7 });
    if (this.life) this.life.onLoot(it);
    g.persist();
  }
  talkTo(q) {
    const g = this.game, L = this.life;
    q.talks = (q.talks || 0) + 1;
    q.heading = Math.atan2(g.player.pos.x - q.x, g.player.pos.z - q.z);
    const lines = q.female ? ['¡Hola, {hijo|hija}! Pasa, pasa.', '¿Quieres un vasino de agua?', 'Mi nieto está en Badajoz, estudiando.', 'Antes en esta calle nos conocíamos todos.', 'La torre de Santa María se ve desde toda la vega.', 'En la feria de agosto no cabe un alma en la plaza.'] : ['¿Qué hay? Siéntate si quieres.', 'Este año la vendimia viene buena.', 'El pantano está a rebosar, da gusto verlo.', 'Yo he trabajado toda la vida en la cooperativa.', 'Por la calle Malfeitos pasa de todo, ya te digo.'];
    L.say(q, q.talks > 5 ? 'Bueno, {hijo|hija}, que tengo cosas que hacer…' : lines[(q.talks - 1) % lines.length]);
  }
  // hide in a wardrobe (normal mode: from the police coming in, from whoever lives here)
  hideIn(it) {
    const g = this.game, p = g.player;
    this.hiding = it;
    p.hidden = true;
    p.pos.set(it.hx, p.pos.y, it.hz);
    g.audio.sfx('door_close', { vol: 0.5 });
    g.cam.fovOverride = 55;
    if (g.cam.setFirstPerson) g.cam.setFirstPerson(true);
    document.body.classList.add('hiding');
  }
  unhide(forced = false) {
    const g = this.game, p = g.player, it = this.hiding;
    if (!it) return;
    this.hiding = null;
    p.hidden = false;
    p.pos.set(it.x, p.pos.y, it.z);
    g.audio.sfx('door_open', { vol: 0.5 });
    g.cam.fovOverride = 0;
    document.body.classList.remove('hiding');
    if (forced) p.knockDown(Math.sin(p.heading) * 2, Math.cos(p.heading) * 2, 0);
  }
  // the Guardia Civil comes in after you
  raid(kind) { if (this.life) this.life.raid(kind); else if (this.house) { this.game.hud.notify('📻 La Guardia Civil espera en la puerta.', 'police', 3); } }
  // crimes committed in here (from police.crime)
  onCrime(type, opts) {
    const g = this.game;
    if (this.life) { this.life.onCrime(type, opts); return; }
    if ((type === 'disparo' || type === 'explosion') && this.current && this.current.x !== undefined) {
      const d = this.current;
      setTimeout(() => { if (g.state === 'play') { g.police.report(type, d.x, d.z, null, false); g.police.hideSpot = { kind: 'house', obj: d }; } }, 6000);
    }
  }
  get people() { return this.life ? this.life.people : null; }

  // prompt/interaction while inside (normal mode); returns an option for the prompt system
  option() {
    const g = this.game, p = g.player, h = this.house;
    if (!h) return null;
    if (g.horror && g.horror.active && g.horror.hiding) return g.horror.option(g.horror.hiding);
    let best = null, bd = Infinity;
    for (const it of h.inter) {
      if (Math.abs(p.pos.y - (it.y || 0)) > 1.5) continue; // other storey
      const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    // decorating: the piece you carry about follows your aim (its own keys), or the one you are looking at
    const D = g.decor;
    if (D && D.house === h) {
      if (D.placing) return { label: `Colocando: ${lc(ITEMS[D.placing.id].name)} <small>· ${g.input.device === 'pad' ? `${g.input.padName(0)} dejar · ${g.input.padName(4)}/${g.input.padName(5)} girar · ${g.input.padName(1)} cancelar` : g.input.device === 'touch' ? 'toca aquí para dejarlo · arma: girar · Subir: cancelar' : 'E o clic: dejar · rueda, Q o X: girar · Esc: cancelar'}</small>`, info: !g.input.isTouch, run: () => D.tryPlace() };
      if (!(best && best.type === 'exit')) { const o = D.option(); if (o) return o; }
    }
    // at the way out, leaving comes first (the host who walks you to the door must not stand between you and it)
    if (best && best.type === 'exit' && !this.hiding && !(g.horror && g.horror.active)) return { label: best.label, run: () => this.exit() };
    // people: talk to the one who let you in, knock out someone from behind
    const L = this.life;
    if (L && !(g.horror && g.horror.active)) {
      if (this.hiding) return { label: 'Salir del armario', run: () => this.unhide() };
      if (this.cracking) return { label: `Forzando la caja fuerte… <b>${Math.round((this.cracking.t / this.cracking.dur) * 100)} %</b>`, info: true };
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      let who = null, ws = -Infinity;
      for (const q of L.people) {
        if (q.kind !== 'res' || q.state === 'dead' || Math.abs(q.y - p.pos.y) > 1) continue;
        const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d > 2.2) continue;
        const sc = (dx * fx + dz * fz) / (d || 1) - d * 0.3;
        if (sc > ws) { ws = sc; who = q; }
      }
      if (who && L.canTakedown(who)) return { label: 'Noquear por la espalda <small>(en silencio)</small>', run: () => L.takedown(who) };
      if (who && L.mode === 'visit' && ['host', 'idle', 'sit'].includes(who.state)) return { label: `Hablar con ${who.name}`, run: () => this.talkTo(who) };
    }
    if (!best) return null;
    if (g.horror && g.horror.active) return g.horror.option(best);
    switch (best.type) {
      case 'loot': {
        if (best.taken) return null;
        const def = best.def, v = def.cash ? '' : def.weapon ? '' : ` <small>(≈ ${Math.round((def.value[0] + def.value[1]) / 2)} €)</small>`;
        return { label: best.label + v, run: () => this.takeLoot(best) };
      }
      case 'read': return { label: best.label, run: () => { const [t, x] = READS[Math.floor(Math.random() * READS.length)]; g.hud.subtitle(t, x); setTimeout(() => g.hud.subtitle(null), 6500); if (x.includes('10 €') && !best.used) { best.used = true; g.player.money += 10; g.audio.sfx('money'); } } };
      case 'eat': return best.used ? { label: 'Ya has picado algo', info: true } : { label: best.label, run: () => { best.used = true; const n = Math.min(100, g.player.health + 15) - g.player.health; g.player.health += n; g.audio.sfx('pickup', { vol: 0.5 }); g.hud.notify(`Te comes ${['un trozo de queso', 'unas perrunillas', 'un poco de chorizo', 'una magdalena'][Math.floor(Math.random() * 4)]}.${n > 0 ? ` +${Math.round(n)} de salud` : ''}`, 'ok', 3); if (this.life) this.life.noiseT = 1; } };
      case 'fridge': return best.used ? { label: 'Nevera', info: true } : { label: best.label, run: () => { best.used = true; g.player.health = Math.min(100, g.player.health + 8); g.audio.sfx('door_open', { vol: 0.3 }); g.hud.notify('Te bebes un refresco bien frío. +8 de salud', 'ok', 3); } };
      case 'piano': return { label: best.label, run: () => { g.audio.sfx('piano'); if (this.life) this.life.noise(p.pos.x, p.pos.z, 14); } };
      case 'guitar': return { label: best.label, run: () => { g.audio.sfx('guitar'); if (this.life) this.life.noise(p.pos.x, p.pos.z, 9); } };
      case 'hide': return this.hiding ? { label: 'Salir del armario', run: () => this.unhide() } : { label: best.label, run: () => this.hideIn(best) };
      case 'exit': return { label: best.label, run: () => this.exit(best.door) };
      case 'info': return { label: best.label, run: () => { g.hud.subtitle(best.label, best.text); setTimeout(() => g.hud.subtitle(null), 6500); } };
      case 'pila': return { label: best.label, run: () => { g.hud.notify('Mojas los dedos en el agua bendita y te santiguas.', 'info', 3); g.audio.sfx('pickup', { vol: 0.2 }); } };
      case 'cepillo': return { label: best.label, run: () => { if (g.player.money < 1) { g.hud.notify('No llevas ni un euro suelto.', 'info', 2.5); return; } g.player.money -= 1; g.audio.sfx('money', { vol: 0.5 }); g.hud.notify('Echas un euro en el cepillo. Las monedas suenan en la caja de madera.', 'ok', 3); } };
      case 'vela': return best.stand.free.length ? { label: best.label, run: () => { if (g.player.money < 0.5) { g.hud.notify('No llevas suelto para la vela.', 'info', 2.5); return; } g.player.money -= 0.5; lightCandle(this.house, best.stand); g.audio.sfx('ui_click', { vol: 0.3 }); g.hud.notify('Enciendes una vela y le pides algo en silencio.', 'ok', 3.5); } } : { label: 'Ya no caben más velas', info: true };
      case 'banco': return { label: best.label, run: () => { g.player.sitOn({ x: best.sx, z: best.sz, y: best.sy || 0, h: best.h ?? Math.PI / 2, kind: 'banco' }); if (h.church) g.hud.notify('Te sientas en el banco. El silencio de la iglesia, el eco de algún paso…', 'info', 3.5); } };
      case 'tiro': return { label: best.label, run: () => {
        const ok = Math.random() < (best.kind === 'gol' ? 0.72 : 0.45);
        g.audio.sfx('ball', { vol: 0.8 });
        if (best.kind === 'gol') g.hud.notify(ok ? '⚽ ¡Goooool! Por la escuadra.' : '⚽ Al palo… ¡uy!', ok ? 'gold' : 'info', 3);
        else g.hud.notify(ok ? '🏀 ¡Canasta! Ni ha tocado el aro.' : '🏀 Aro y fuera.', ok ? 'gold' : 'info', 3);
      } };
      case 'tractor': {
        const adri = g.save && g.save.preset === 'adri';
        return { label: adri ? 'Pedir las llaves de tu tractor' : 'Alquilar un tractor para el día <small>(30 €)</small>', run: async () => {
          if (!adri && g.player.money < 30) { g.hud.notify('No te llega: el alquiler son 30 €.', 'info', 3); return; }
          if (!adri) { g.player.money -= 30; g.audio.sfx('money', { vol: 0.5 }); }
          const y = g.world.landmarks.poi.corbacho && g.world.landmarks.poi.corbacho.yard;
          await this.exit();
          if (!y) return;
          const tr = g.fleet.spawn('tractor', y.x, y.z, y.heading, '#3f8f2a', { sleeping: false, keep: true, locked: false });
          if (tr) { g.player.getIn(tr); g.hud.notify(adri ? '🚜 ¡Ahí lo tienes, Adri! Revisado, engrasado y con el depósito lleno.' : '🚜 Tractor alquilado para todo el día. Trátalo bien, que es de la casa.', 'gold', 5); }
        } };
      }
      case 'compra': return { label: best.label, run: () => { if (g.player.money < best.price) { g.hud.notify('No te llega el dinero.', 'info', 2.5); return; } g.player.money -= best.price; if (g.inv) g.inv.add(best.item); g.audio.sfx('money', { vol: 0.5 }); g.hud.subtitle(best.who || 'En el puesto', best.line); setTimeout(() => g.hud.subtitle(null), 3500); g.hud.notify(`Comprado. Lo llevas en la mochila (${g.input.keyText ? g.input.keyText('I', 10, 'Inventario') : 'I'}).`, 'ok', 3); } };
      case 'taquilla': return { label: best.label, run: () => { if (g.player.money < 5) { g.hud.notify('No te llega para la entrada.', 'info', 2.5); return; } g.player.money -= 5; g.audio.sfx('money', { vol: 0.5 }); g.hud.notify(g.sky.hour < 20 ? 'Tienes entrada para la función de las 20:00 h: «La vida es sueño».' : 'Entra, que ya ha empezado la función.', 'ok', 4); } };
      case 'alcalde': return { label: best.label, run: () => { g.player.sitOn({ x: best.sx, z: best.sz, y: best.sy || 0, h: best.h ?? 0, kind: 'banco' }); g.hud.notify('Te sientas en el sillón del alcalde. Desde aquí se ve todo el salón… Se levanta la sesión.', 'ok', 4); } };
      case 'tv': return { label: best.mesh.material.emissiveIntensity > 0.2 ? 'Apagar la tele' : 'Encender la tele', run: () => { const m = best.mesh.material; m.emissiveIntensity = m.emissiveIntensity > 0.2 ? 0 : 0.8; g.audio.sfx('ui_click'); } };
      case 'drawer': return best.used ? { label: 'Cajones vacíos', info: true } : { label: best.label, run: () => { best.used = true; const n = Math.round((5 + Math.floor(Math.random() * 40)) * PERK.luck); g.player.money += n; g.audio.sfx('money'); g.hud.notify(`Encuentras ${n} € en un cajón.`, 'ok', 3); } };
      case 'bed': return { label: best.label, run: () => this.nap() };
      case 'mirror': return { label: best.label, run: () => g.hud.notify('Te miras al espejo. Tienes buena cara.', 'info', 3) };
      case 'phone': return { label: 'Llamar por teléfono', run: () => { g.audio.sfx('phone_ring', { vol: 0.5 }); g.hud.subtitle('Teléfono', '… no contesta nadie.'); setTimeout(() => g.hud.subtitle(null), 2500); } };
      case 'hide': return null;
      case 'well': return { label: best.label, run: () => g.hud.notify('El agua del pozo está fresca y oscura.', 'info', 3) };
      case 'fusebox': return { label: 'Cuadro eléctrico', run: () => { this.lightsOn(!h.powered); g.audio.sfx(h.powered ? 'ui_click' : 'ui_back'); } };
      case 'buy': case 'counter': return g.shops ? g.shops.optionAt(best) : null;
      case 'safe': return g.homeSafe && !g.homeSafe.menu.open ? g.homeSafe.option(best) : null;
      default: return null;
    }
  }
}

function shared_restoreLights(g) { /* sky lights are recomputed every frame by the sky system */ }
