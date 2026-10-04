// The real shops of the town, by what they are (their OpenStreetMap kind; the names are invented, no business of
// Guareña appears by its own): furniture, appliances, the florist, the bazaar, the hardware store, books, toys,
// supermarkets, the bakery, the greengrocer, computers… and the gun shop by the Cooperativa. Each one has an
// inside you walk into: its shop window onto the street, the goods on shelves and on the floor with their price
// tags, and somebody behind the counter. Buy a thing where it stands, or ask at the counter for the whole list.
import * as THREE from 'three';
import { INTERIOR_ORIGIN, boxGeo, planeGeo, cylGeo, HouseBuilder, std, texMat, glassMat } from './housekit.js';
import { ITEMS, lc } from './items.js';
import { decorModel } from './decor.js';
import { buildGun } from './gunmodels.js';
import { WEAPONS } from './weapons.js';
import { randomDesc } from './characters.js';
import { mulberry32, fmtMoney } from './util.js';
import { PERK } from './perks.js';

const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

// hours: [[open, close], …] in the day's hours
const SHOP_H = [[9.5, 14], [17, 20.5]];
export const SHOP_TYPES = {
  muebles: { kinds: ['shop:furniture'], name: 'la tienda de muebles', title: 'Muebles y Decoración', hours: SHOP_H, floor: 'herringbone_parquet', wall: 0xf1e9dc,
    stock: ['sofa', 'sillon', 'mesa', 'mesita', 'estanteria', 'lampara', 'alfombra', 'puff', 'cuadro', 'espejo', 'reloj', 'cojines', 'lamparita'] },
  electro: { kinds: ['shop:appliance', 'shop:electronics'], name: 'la tienda de electrodomésticos', title: 'Electrodomésticos', hours: SHOP_H, floor: 'floor_tiles_06', wall: 0xeef0f2,
    stock: ['tele', 'ventilador', 'radio', 'lamparita', 'lampara', 'auriculares', 'cargador', 'linterna'] },
  flores: { kinds: ['shop:florist'], name: 'la floristería', title: 'Floristería', hours: SHOP_H, floor: 'floor_tiles_06', wall: 0xe8f0e2,
    stock: ['planta', 'geranios', 'flores', 'cactus'] },
  bazar: { kinds: ['shop:variety_store'], name: 'el bazar', title: 'Bazar', hours: [[9, 22]], floor: 'floor_tiles_06', wall: 0xf2eee4,
    stock: ['cojines', 'reloj', 'espejo', 'cuadro', 'poster', 'lamparita', 'cactus', 'paraguas', 'linterna', 'cargador', 'peluche', 'cometa', 'balon', 'gafas', 'cuaderno'] },
  ferreteria: { kinds: ['shop:hardware', 'shop:doityourself'], name: 'la ferretería', title: 'Ferretería', hours: SHOP_H, floor: 'concrete_floor_damaged_01', wall: 0xe8e4da,
    stock: ['herramientas', 'linterna', 'navaja', 'ventilador', 'geranios', 'planta', 'paraguas'] },
  libreria: { kinds: ['shop:books', 'shop:stationery'], name: 'la librería', title: 'Librería y Papelería', hours: SHOP_H, floor: 'herringbone_parquet', wall: 0xf4ecdc,
    stock: ['libro', 'comic', 'cuaderno', 'poster', 'parchis', 'cuadro'] },
  jugueteria: { kinds: ['shop:toys'], name: 'la juguetería', title: 'Juguetería', hours: SHOP_H, floor: 'floor_tiles_06', wall: 0xf8e8d0,
    stock: ['peluche', 'balon', 'parchis', 'cometa', 'comic', 'poster'] },
  super: { kinds: ['shop:supermarket', 'shop:convenience'], name: 'el supermercado', title: 'Supermercado', hours: [[9, 21.5]], floor: 'floor_tiles_06', wall: 0xf4f4f0,
    stock: ['bocadillo', 'torta', 'migas', 'pan', 'fruta', 'melon', 'chocolate', 'magdalenas', 'perrunillas', 'agua', 'refresco', 'zumo', 'maiz'] },
  panaderia: { kinds: ['shop:bakery', 'shop:confectionery'], name: 'la panadería', title: 'Panadería y Confitería', hours: [[8, 14.5], [17.5, 20.5]], floor: 'floor_tiles_06', wall: 0xf6ead8,
    stock: ['pan', 'perrunillas', 'magdalenas', 'bocadillo', 'chocolate', 'agua'] },
  fruteria: { kinds: ['shop:greengrocer'], name: 'la frutería', title: 'Frutería', hours: [[9, 14], [17.5, 20.5]], floor: 'floor_tiles_06', wall: 0xeef4e2,
    stock: ['fruta', 'melon', 'zumo', 'agua'] },
  informatica: { kinds: ['shop:computer', 'shop:mobile_phone'], name: 'la tienda de informática', title: 'Informática y Móviles', hours: SHOP_H, floor: 'floor_tiles_06', wall: 0xeceef2,
    stock: ['auriculares', 'cargador', 'radio', 'linterna', 'lamparita'] },
  armeria: { kinds: [], name: 'la armería', title: 'Armería y Caza Las Vegas', hours: [[9.5, 14], [17, 20.5]], floor: 'rock_tile_floor', wall: 0xd8c8b0,
    stock: ['cana', 'cebo', 'maiz', 'prismaticos', 'navaja', 'linterna'] },
  // (these two are placed by the town itself: src/infill.js placeStreetShops)
  kebab: { kinds: [], name: 'el kebab', title: 'Kebab', hours: [[12.5, 16.5], [19.5, 24]], floor: 'floor_tiles_06', wall: 0xf3e6cc,
    stock: ['kebab', 'durum', 'falafel', 'patatas', 'refresco', 'agua'] },
  gimnasio: { kinds: [], name: 'el gimnasio', title: 'Gimnasio', hours: [[7, 22.5]], floor: 'concrete_floor_damaged_01', wall: 0xe9eef0,
    stock: ['isotonica', 'agua'] },
};
const ACCENT = { kebab: 0xb83a24, gimnasio: 0x1f6fb2, armeria: 0x3a5a2a, muebles: 0x7a4e2c, electro: 0x2a5a9a, flores: 0x4a8a3a, bazar: 0xc8202a, ferreteria: 0xd87a1a, libreria: 0x2a3a6a, jugueteria: 0xe8a33a, super: 0x2a8a4a, panaderia: 0xb8742a, fruteria: 0x5aa84a, informatica: 0x3a4a5a };
// invented names for the second, third… shop of the same kind
const NAMES = {
  super: ['Supermercado La Espiga', 'Supermercado El Trigal', 'Alimentación La Vega', 'Supermercado Las Eras', 'Autoservicio El Cruce', 'Ultramarinos La Plaza'],
  bazar: ['Bazar Todo a Cien', 'Bazar El Chollo', 'Bazar La Estrella', 'Bazar El Paseo', 'Bazar Mil Cosas'],
  muebles: ['Muebles y Decoración La Vega', 'Muebles El Roble'],
  libreria: ['Librería El Tintero', 'Papelería La Pluma'],
  informatica: ['Informática El Enchufe', 'Móviles La Antena'],
};

export function isOpen(type, hour) { const t = SHOP_TYPES[type]; return !t || t.hours.some(([a, b]) => hour >= a && hour < b); }
export function nextOpen(type, hour) {
  const t = SHOP_TYPES[type];
  const next = t.hours.map(([a]) => a).find((a) => a > hour) ?? t.hours[0][0];
  const h = Math.floor(next), m = Math.round((next % 1) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- what each product looks like on the shelf
const PM = {};
const pmat = (c, o) => PM[c + (o ? JSON.stringify(o) : '')] || (PM[c + (o ? JSON.stringify(o) : '')] = std(c, o || { roughness: 0.6 }));
function productModel(id, k = 0) {
  const d = ITEMS[id];
  if (d && d.cat === 'casa') return decorModel(id, 3 + k).obj;
  const g = new THREE.Group();
  const add = (geo, c, x, y, z, o) => { const m = new THREE.Mesh(geo, pmat(c, o)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (id) {
    case 'bocadillo': case 'pan': add(new THREE.CapsuleGeometry(0.045, id === 'pan' ? 0.42 : 0.2, 4, 8).rotateZ(Math.PI / 2), 0xd8a060, 0, 0.05, 0); break;
    case 'torta': add(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 16), 0xe8d4a0, 0, 0.035, 0); break;
    case 'migas': add(new THREE.CylinderGeometry(0.06, 0.05, 0.08, 12), 0xf0e8d8, 0, 0.04, 0); break;
    case 'fruta': for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(0.04, 8, 6), [0xf0a040, 0xd83a2a, 0x8a3a6a][i % 3], (i - 2) * 0.05, 0.04, (i % 2) * 0.04); break;
    case 'melon': add(new THREE.SphereGeometry(0.1, 12, 8).scale(1.25, 1, 1), 0x7a9a4a, 0, 0.1, 0); break;
    case 'chocolate': add(new THREE.BoxGeometry(0.14, 0.02, 0.07), 0x5a2a1a, 0, 0.01, 0); break;
    case 'magdalenas': case 'perrunillas': add(new THREE.BoxGeometry(0.2, 0.08, 0.12), id === 'perrunillas' ? 0xc8a050 : 0xe8c060, 0, 0.04, 0); break;
    case 'agua': case 'refresco': case 'zumo': add(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), id === 'agua' ? 0x9ac8e8 : id === 'refresco' ? 0xf08a20 : 0xf0c050, 0, 0.11, 0, id === 'agua' ? { roughness: 0.1, transparent: true, opacity: 0.7 } : null); break;
    case 'maiz': case 'cebo': add(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), id === 'maiz' ? 0xf2d230 : 0x6a4a2a, 0, 0.04, 0); break;
    case 'libro': case 'comic': case 'cuaderno': add(new THREE.BoxGeometry(0.03, 0.22, 0.16), id === 'libro' ? 0x8a2a2a : id === 'comic' ? 0x2a6a8a : 0xe8dcc0, 0, 0.11, 0); break;
    case 'balon': add(new THREE.SphereGeometry(0.11, 14, 10), 0xf4f4f0, 0, 0.11, 0); break;
    case 'peluche': add(new THREE.SphereGeometry(0.09, 10, 8), 0x9a6a3a, 0, 0.09, 0); add(new THREE.SphereGeometry(0.06, 10, 8), 0x9a6a3a, 0, 0.22, 0); break;
    case 'parchis': add(new THREE.BoxGeometry(0.3, 0.05, 0.3), 0xd8263a, 0, 0.025, 0); break;
    case 'cometa': add(new THREE.PlaneGeometry(0.4, 0.4).rotateZ(Math.PI / 4), 0x3a8ab8, 0, 0.3, 0, { side: THREE.DoubleSide }); break;
    case 'linterna': add(new THREE.CylinderGeometry(0.025, 0.03, 0.18, 10).rotateZ(Math.PI / 2), 0x2a2a2a, 0, 0.03, 0); break;
    case 'herramientas': add(new THREE.BoxGeometry(0.4, 0.18, 0.2), 0xc8202a, 0, 0.09, 0); break;
    case 'paraguas': add(new THREE.CylinderGeometry(0.04, 0.02, 0.8, 10), 0x1a2240, 0, 0.4, 0); break;
    case 'auriculares': add(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), 0x222222, 0, 0.1, 0); break;
    case 'cargador': add(new THREE.BoxGeometry(0.05, 0.08, 0.03), 0xf4f4f0, 0, 0.04, 0); break;
    case 'perfume': add(new THREE.BoxGeometry(0.05, 0.12, 0.03), 0xc8a0d8, 0, 0.06, 0, { roughness: 0.1 }); break;
    case 'gafas': add(new THREE.BoxGeometry(0.14, 0.04, 0.03), 0x111111, 0, 0.1, 0); break;
    case 'prismaticos': for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.03, 0.035, 0.14, 10).rotateX(Math.PI / 2), 0x2a3a2a, s * 0.035, 0.04, 0); break;
    case 'navaja': add(new THREE.BoxGeometry(0.11, 0.02, 0.025), 0x6a4a2a, 0, 0.012, 0); break;
    case 'cana': add(new THREE.CylinderGeometry(0.006, 0.014, 2.4, 6), 0x2a2a2a, 0, 1.2, 0); add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10).rotateZ(Math.PI / 2), 0xa0a4a8, 0.03, 0.55, 0, { metalness: 0.7, roughness: 0.3 }); break;
    default: add(new THREE.BoxGeometry(0.2, 0.2, 0.2), 0xb0a080, 0, 0.1, 0);
  }
  return g;
}

// a price tag (name and price) on a little card
function tagMesh(name, price) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#c8202a'; x.fillRect(0, 0, 256, 16);
  x.fillStyle = '#222'; x.font = 'bold 24px sans-serif'; x.textAlign = 'center';
  const words = name.split(' '); let l1 = '', l2 = '';
  for (const w of words) { if ((l1 + ' ' + w).length < 19 && !l2) l1 = (l1 + ' ' + w).trim(); else l2 = (l2 + ' ' + w).trim(); }
  x.fillText(l1, 128, 46); if (l2) x.fillText(l2.slice(0, 20), 128, 72);
  x.fillStyle = '#c8202a'; x.font = 'bold 34px sans-serif'; x.fillText(`${price} €`, 128, 114);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
}

export function price(id) { const d = ITEMS[id]; return d ? Math.max(1, Math.round(d.price * PERK.price)) : 0; }

// ---------------------------------------------------------------- the inside of a shop
export function buildShop(type, seed = 1, origin = INTERIOR_ORIGIN, title = null) {
  const T = SHOP_TYPES[type] || SHOP_TYPES.bazar;
  const r = mulberry32(seed);
  const B = new HouseBuilder(origin.x, origin.z, false);
  const arm = type === 'armeria';
  const nBig = T.stock.filter((id) => ITEMS[id] && ITEMS[id].place === 'floor').length;
  const W = arm ? 8.4 : nBig >= 5 ? 9.6 : 7.4 + Math.round(r() * 3) * 0.6, hw = W / 2, D = arm ? 10.5 : nBig >= 5 ? 12 : 9.4 + Math.round(r() * 3) * 0.5, H = 3.3;
  const mWall = B.mat('wall', () => arm ? texMat('dark_wood', 0xc8a07a, 0.6) : std(T.wall, { roughness: 0.92 }));
  const mFloor = B.mat('floor', () => texMat(T.floor, T.floor === 'herringbone_parquet' ? 0xffffff : type === 'super' ? 0xe8e8e4 : 0xd8d0c4, 0.5));
  const mCeil = B.mat('ceil', () => std(0xf6f6f2, { roughness: 0.95 }));
  const mWood = B.mat('wood', () => texMat('dark_wood', 0xffffff, 0.6));
  const mPale = B.mat('pale', () => texMat('dark_wood', 0xf0d4b0, 0.6));
  const mMetal = B.mat('metal', () => std(0x9aa0a4, { roughness: 0.35, metalness: 0.7 }));
  const mWhite = B.mat('white', () => std(0xf2f2ee, { roughness: 0.4 }));
  const mDark = B.mat('dark', () => std(0x1a1a1c, { roughness: 0.5 }));
  const glass = glassMat();
  const floor = (x0, z0, x1, z1) => B.add(mFloor, planeGeo(x1 - x0, z1 - z0, 1.4).rotateX(-Math.PI / 2), (x0 + x1) / 2, 0.005, (z0 + z1) / 2);
  floor(-hw, 0, hw, D);
  B.add(mCeil, planeGeo(W, D, 2).rotateX(Math.PI / 2), 0, H, D / 2);
  // the shop front: glass door in the middle, a shop window each side (the street shows through them)
  const winL = [0.4, hw - 1.0], winR = [hw + 1.0, W - 0.4];
  B.wall(mWall, -hw, 0, hw, 0, H, [[winL[0], winL[1], 0.45, 2.6], [hw - 0.65, hw + 0.65, 0, 2.35], [winR[0], winR[1], 0.45, 2.6]]);
  for (const [a, b] of [winL, winR]) {
    const x0 = -hw + a, x1 = -hw + b, cx = (x0 + x1) / 2, w = x1 - x0;
    B.extraMesh(new THREE.Mesh(planeGeo(w, 2.15, 1), glass), cx, 1.525, 0.04, 0);
    B.add(mMetal, boxGeo(w, 0.06, 0.1, 1), cx, 2.6, 0.04); B.add(mMetal, boxGeo(w, 0.06, 0.3, 1), cx, 0.42, 0.1);
    B.view('f', x0, 0.45, -0.12, x1, 2.6, 0.12);
    B.segs.push([B.ox + x0, B.oz + 0.05, B.ox + x1, B.oz + 0.05, 2.6]);
  }
  // glass door (shut behind you) and the way out
  B.extraMesh(new THREE.Mesh(planeGeo(1.26, 2.3, 1), glass), 0, 1.15, 0.05, 0);
  for (const x of [-0.64, 0, 0.64]) B.add(mMetal, boxGeo(0.05, 2.35, 0.06, 1), x, 1.175, 0.05);
  B.add(mMetal, boxGeo(0.34, 0.03, 0.03, 1), 0.3, 1.05, 0.12);
  B.view('f', -0.65, 0, -0.12, 0.65, 2.35, 0.12);
  B.interact({ type: 'exit', x: 0, z: 0.7, r: 1.1, label: 'Salir a la calle' });
  B.segs.push([B.ox - 0.7, B.oz + 0.05, B.ox + 0.7, B.oz + 0.05, 2.3]);
  B.wall(mWall, -hw, 0, -hw, D, H); B.wall(mWall, hw, 0, hw, D, H);
  B.wall(mWall, -hw, D, hw, D, H, [[0.3, 1.2, 0, 2.1]]);
  B.add(mWood, boxGeo(0.9, 2.1, 0.05, 1), -hw + 0.75, 1.05, D - 0.05); // the storeroom door behind the counter, shut
  B.segs.push([B.ox - hw + 0.3, B.oz + D - 0.05, B.ox - hw + 1.2, B.oz + D - 0.05, 2.1]);
  // skirting and a band of colour
  for (const [ax, az, bx, bz] of [[-hw + 0.08, 0.1, -hw + 0.08, D - 0.1], [hw - 0.08, 0.1, hw - 0.08, D - 0.1], [-hw + 0.1, D - 0.08, hw - 0.1, D - 0.08]]) {
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    B.add(mWood, boxGeo(L, 0.1, 0.02, 1), (ax + bx) / 2, 0.05, (az + bz) / 2, ry);
  }
  // a band of colour round the room at door height
  const band = B.mat('band', () => std(ACCENT[type] || 0x2a6a8a, { roughness: 0.7 }));
  for (const [ax, az, bx, bz] of [[-hw + 0.075, 0.2, -hw + 0.075, D - 0.2], [hw - 0.075, 0.2, hw - 0.075, D - 0.2], [-hw + 0.2, D - 0.075, hw - 0.2, D - 0.075]]) {
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    B.add(band, boxGeo(L, 0.12, 0.012, 1), (ax + bx) / 2, 2.72, (az + bz) / 2, ry);
  }
  // lights: panels in the ceiling
  for (const z of [2.2, D / 2 + 0.4, D - 2.2]) for (const x of W > 8 ? [-hw / 2, hw / 2] : [0]) {
    B.add(B.mat('panel', () => std(0xffffff, { emissive: 0xfff6e8, emissiveIntensity: 0.9 })), boxGeo(1.1, 0.03, 0.5, 1), x, H - 0.02, z);
    B.lights.push(Object.assign(new THREE.PointLight(0xfff2e0, arm ? 7 : 10, 13, 1.25), { userData: { base: arm ? 7 : 10 } }));
    B.lights[B.lights.length - 1].position.set(B.ox + x, H - 0.3, B.oz + z);
  }
  // the counter at the back, the till, and whoever serves behind it
  const cx = -hw + 2.2, cz = D - 1.6;
  B.block(arm ? mWood : mPale, 2.4, 1.0, 0.6, cx, 0, cz);
  B.add(mDark, boxGeo(2.46, 0.04, 0.66, 1), cx, 1.02, cz);
  B.add(mDark, boxGeo(0.34, 0.2, 0.3, 1), cx + 0.6, 1.14, cz); B.add(B.mat('lcd', () => std(0x2a4a3a, { emissive: 0x3a8a5a, emissiveIntensity: 0.5 })), boxGeo(0.2, 0.08, 0.01, 1), cx + 0.6, 1.2, cz - 0.16);
  // behind the counter: staff only (the gap by the wall, and a flap at the other end)
  B.segs.push([B.ox - hw, B.oz + cz, B.ox + cx - 1.2, B.oz + cz, 1.0]);
  B.segs.push([B.ox + cx + 1.2, B.oz + cz + 0.3, B.ox + cx + 1.2, B.oz + D - 0.05, 1.0]);
  B.add(arm ? mWood : mPale, boxGeo(0.05, 0.95, D - cz - 0.35, 1), cx + 1.2, 0.475, (cz + 0.3 + D) / 2);
  B.spots.keeper = { x: B.ox + cx - 0.2, z: B.oz + cz + 0.75 };
  // the name of the shop over the counter
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = arm ? '#2a1c12' : '#' + (ACCENT[type] || 0x2a6a8a).toString(16).padStart(6, '0'); x.fillRect(0, 0, 512, 96);
    x.fillStyle = '#fbfaf6'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const t = (title || T.title).toUpperCase();
    let fs = 44; x.font = `bold ${fs}px sans-serif`;
    while (x.measureText(t).width > 480 && fs > 16) { fs -= 2; x.font = `bold ${fs}px sans-serif`; }
    x.fillText(t, 256, 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    B.extraMesh(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })), cx, 2.35, D - 0.08, Math.PI);
  }
  B.interact({ type: 'counter', x: cx, z: cz - 0.9, r: 1.25, label: arm ? 'Hablar con el armero' : 'Pedir en el mostrador' });
  B.spots.entrada = { x: B.ox, z: B.oz + 1.2 };

  // ---- the goods, each with its price tag
  const tag = (id, x, y, z, ry, name, pr) => { const t = tagMesh(name, pr); B.extraMesh(t, x, y, z, ry); };
  const buyAt = (item, x, z, y = 0, extra = {}) => B.interact({ type: 'buy', item, x, z, r: 0.95, y, ...extra });
  // wall shelving units down the two long sides (small things, food)
  const shelfUnit = (side, z, items) => {
    const x = side * (hw - 0.3), ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    B.block(mPale, 0.42, 0.06, 1.2, x, 0, z, 0, 1, false);
    B.add(mPale, boxGeo(0.03, 1.9, 1.2, 1), x + side * 0.2, 0.95, z);
    for (const y of [0.45, 0.95, 1.45]) B.add(mPale, boxGeo(0.42, 0.03, 1.2, 1), x, y, z);
    B.footprint(0.44, 1.2, x, z, 0, 1.9);
    items.forEach((id, k) => {
      const y = [0.47, 0.97, 1.47][k];
      if (!id) return;
      for (let i = 0; i < 4; i++) { const m = productModel(id, i); m.rotation.y = ry; B.extraMesh(m, x - side * 0.02, y + 0.015, z - 0.42 + i * 0.28, ry); }
      tag(id, x - side * 0.22, y - 0.07, z, ry, ITEMS[id].name, price(id));
    });
    const main = items.find(Boolean);
    if (main) buyAt(main, x - side * 0.9, z, 0, { alt: items.filter(Boolean) });
  };
  // big pieces on the floor, a tag on a stand in front
  const floorPiece = (id, x, z, ry) => {
    const m = decorModel(id, 5 + Math.round(x * 3 + z)); m.obj.rotation.y = ry;
    B.extraMesh(m.obj, x, 0, z, ry);
    if (!ITEMS[id].flat) B.footprint(m.w, m.d, x, z, ry, Math.max(0.5, m.h));
    const fx = Math.sin(ry), fz = Math.cos(ry), off = m.d / 2 + 0.25;
    B.add(mMetal, cylGeo(0.012, 0.012, 0.7), x + fx * off, 0.35, z + fz * off);
    tag(id, x + fx * off, 0.76, z + fz * off, ry, ITEMS[id].name, price(id));
    buyAt(id, x + fx * (off + 0.5), z + fz * (off + 0.5));
  };
  // pictures, mirrors and clocks hung on the back wall
  const wallPiece = (id, x, y) => {
    const m = decorModel(id, 7 + Math.round(x * 5)); B.extraMesh(m.obj, x, y, D - 0.08, Math.PI);
    tag(id, x, y - m.h / 2 - 0.12, D - 0.09, Math.PI, ITEMS[id].name, price(id));
    buyAt(id, x, D - 1.0);
  };

  const stock = T.stock.filter((id) => ITEMS[id]);
  const big = stock.filter((id) => ITEMS[id].place === 'floor');
  const hung = stock.filter((id) => ITEMS[id].place === 'wall');
  const small = stock.filter((id) => !ITEMS[id].place || ITEMS[id].place === 'top');
  // side slots along the two long walls (front to back, left then right)
  const zs = []; for (let z = 1.9; z < D - 3.3; z += 1.45) zs.push(z);
  const sideSlots = []; for (const side of [-1, 1]) for (const z of zs) sideSlots.push({ side, z });
  if (arm) {
    armeriaFittings(B, { W, hw, D, H, mWood, mDark, mMetal, glass, tag, buyAt, r });
    // fishing and the rest on the shelves by the door
    shelfUnit(1, 2.1, ['cana', 'cebo', 'maiz']); shelfUnit(1, 3.55, ['prismaticos', 'navaja', 'linterna']);
  } else if (type === 'kebab') kebabFittings(B, { W, hw, D, H, cx, cz, mDark, mMetal, mWhite, mWood, r });
  else if (type === 'gimnasio') gymFittings(B, { W, hw, D, H, cx, cz, mDark, mMetal, mWhite, r });
  else {
    const food = type === 'super' || (small.length && small.every((id) => ITEMS[id].cat === 'comida' || ITEMS[id].cat === 'pesca'));
    // the big pieces down the middle, facing the door (two columns in a wide shop); the rest against the walls
    const cols = W >= 9 ? [-1.65, 1.65] : [0];
    const mid = [];
    if (!food) for (let z = 2.7; z < D - 3.2; z += 2.45) for (const x of cols) mid.push([x, z]);
    const units = [];
    for (let i = 0; i < small.length; i += 3) units.push(small.slice(i, i + 3));
    let si = 0;
    const flats = big.filter((id) => ITEMS[id].flat), stand = big.filter((id) => !ITEMS[id].flat);
    stand.forEach((id) => {
      if (id === 'estanteria' && si < sideSlots.length) { const q = sideSlots[sideSlots.length - 1 - si++]; floorPiece(id, q.side * (hw - 0.3), q.z, q.side > 0 ? -Math.PI / 2 : Math.PI / 2); return; }
      if (mid.length) { const [x, z] = mid.shift(); floorPiece(id, x, z, Math.PI); return; }
      if (si < sideSlots.length - units.length) { const q = sideSlots[sideSlots.length - 1 - si++]; floorPiece(id, q.side * (hw - 0.75), q.z, q.side > 0 ? -Math.PI / 2 : Math.PI / 2); }
    });
    // rugs lie in the aisle by the door
    flats.forEach((id, i) => floorPiece(id, (i % 2 ? 1 : -1) * 0.9, 1.6, Math.PI));
    // every free stretch of wall gets shelving: the same goods again (rotated) if there are fewer than slots
    const nFree = sideSlots.length - si;
    for (let i = 0; i < nFree && units.length; i++) {
      const u = units[i % units.length], k = Math.floor(i / units.length);
      shelfUnit(sideSlots[i].side, sideSlots[i].z, k ? [...u.slice(k % u.length), ...u.slice(0, k % u.length)] : u);
    }
    if (food) {
      // a gondola down the middle: a back panel, shelves on both faces full of packets, tins and bottles
      const gz0 = 3.3, gz1 = Math.max(gz0 + 1.6, D - 3.5), gl = gz1 - gz0, gm = (gz0 + gz1) / 2;
      B.add(mWhite, boxGeo(0.06, 1.55, gl, 1), 0, 0.775, gm);
      B.add(mWhite, boxGeo(0.9, 0.12, gl, 1), 0, 0.06, gm);
      for (const sd of [-1, 1]) for (const y of [0.12, 0.55, 0.98, 1.41]) B.add(mWhite, boxGeo(0.4, 0.02, gl, 1), sd * 0.23, y, gm);
      for (const z of [gz0, gz1]) B.add(mWhite, boxGeo(0.9, 1.6, 0.04, 1), 0, 0.8, z);
      // the end facing the door: an offer sign
      const offer = document.createElement('canvas'); offer.width = 256; offer.height = 128;
      { const x = offer.getContext('2d'); x.fillStyle = '#f2d230'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#c8202a'; x.font = 'bold 46px sans-serif'; x.textAlign = 'center'; x.fillText('OFERTA', 128, 62); x.font = 'bold 26px sans-serif'; x.fillText('2ª unidad -50%', 128, 104); }
      const ot = new THREE.CanvasTexture(offer); ot.colorSpace = THREE.SRGBColorSpace;
      B.extraMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.43), new THREE.MeshStandardMaterial({ map: ot, roughness: 0.7 })), 0, 1.3, gz0 - 0.025, Math.PI);
      B.footprint(0.9, gl, 0, gm, 0, 1.6);
      const pc = [0xd8263a, 0xf2d230, 0x2a6a9a, 0x5aa84a, 0xf08a20, 0xe8e8e0, 0x6a3a1a, 0x9ac8e8];
      for (const sd of [-1, 1]) for (const y of [0.13, 0.56, 0.99, 1.42]) {
        let z = gz0 + 0.08;
        while (z < gz1 - 0.12) {
          const c = pc[Math.floor(r() * pc.length)], kind = r();
          const m = B.mat('pk' + c, () => std(c, { roughness: kind < 0.3 ? 0.3 : 0.6 }));
          if (kind < 0.3) { const h = 0.22 + r() * 0.08; B.add(m, cylGeo(0.035, 0.035, h, 8), sd * 0.3, y + h / 2, z); z += 0.09; }
          else if (kind < 0.5) { B.add(m, cylGeo(0.04, 0.04, 0.11, 10), sd * 0.32, y + 0.055, z); z += 0.1; }
          else { const h = 0.16 + r() * 0.14, w = 0.12 + r() * 0.1; B.add(m, boxGeo(0.2, h, w, 1), sd * 0.3, y + h / 2, z + w / 2); z += w + 0.015; }
        }
      }
      // fruit crates on the end facing the door
      const crate = B.mat('crate', () => texMat('dark_wood', 0xd8b890, 0.7));
      for (const [i, c] of [[0, 0xf0a040], [1, 0xd83a2a], [2, 0x7aa84a]]) {
        const zc = gz0 - 0.4, xc = (i - 1) * 0.42;
        B.add(crate, boxGeo(0.38, 0.22, 0.32, 1), xc, 0.62, zc);
        B.add(mWhite, boxGeo(0.4, 0.5, 0.02, 1), xc, 0.25, zc + 0.14);
        for (let k = 0; k < 6; k++) B.add(B.mat('fr' + c, () => std(c, { roughness: 0.6 })), new THREE.SphereGeometry(0.045, 8, 6), xc - 0.12 + (k % 3) * 0.12, 0.77, zc - 0.06 + Math.floor(k / 3) * 0.12);
      }
      B.footprint(1.3, 0.4, 0, gz0 - 0.4, 0, 0.8);
    }
    if (type === 'flores') {
      // the florist is full of green: pots along the shop window, buckets of cut flowers, a hanging plant
      const cols = [0xd8263a, 0xf4f0e6, 0xf2d230, 0xe8456a, 0x8a3ab8];
      for (let i = 0; i < 7; i++) { const x = -hw + 0.6 + i * ((W - 1.2) / 6); if (Math.abs(x) < 1.1) continue; const m = decorModel(i % 2 ? 'geranios' : 'planta', 20 + i).obj; B.extraMesh(m, x, 0, 0.55, 0); B.footprint(0.5, 0.4, x, 0.55, 0, 0.8); }
      for (let i = 0; i < 5; i++) {
        const x = -1.2 + i * 0.6, z = D - 3.3;
        B.add(mMetal, cylGeo(0.16, 0.13, 0.42, 14), x, 0.21, z);
        for (let k = 0; k < 9; k++) { const a = k * 0.7; B.add(B.mat('stem', () => std(0x3f7a35)), cylGeo(0.006, 0.006, 0.55, 4), x + Math.sin(a) * 0.07, 0.62, z + Math.cos(a) * 0.07); B.add(B.mat('cf' + i, () => std(cols[i], { roughness: 0.7 })), new THREE.SphereGeometry(0.045, 7, 5), x + Math.sin(a) * 0.1, 0.92 + (k % 3) * 0.04, z + Math.cos(a) * 0.1); }
      }
      B.footprint(3.1, 0.4, 0.0, D - 3.3, 0, 0.9);
      buyAt('flores', 0, D - 4.2);
    }
    // what hangs on the walls: along the back wall, right of the counter
    hung.slice(0, Math.max(0, Math.floor((W - 4.5) / 1.0))).forEach((id, i) => wallPiece(id, -hw + 4.0 + i * 1.0, 1.75));
  }
  const out = B.finish();
  out.origin = { x: origin.x, z: origin.z };
  out.kind = 'tienda';
  out.shop = type;
  out.bounds = { x0: origin.x - hw, x1: origin.x + hw, z0: origin.z, z1: origin.z + D };
  out.spots.floor = { tienda: { x: origin.x, z: origin.z + D / 2 } };
  return out;
}

// the gun shop: wood panelling, the long guns racked on the back wall, pistols under the glass of the counter,
// a mounted stag, boxes of cartridges, the vest on a dummy and the first-aid kits
// the kebab: the meat turning on its upright spit behind the counter, its grill glowing, the drinks fridge, the menu
// over it all, little tables down one side
function kebabFittings(B, o) {
  const { hw, D, cx, cz, mDark, mMetal, mWhite, mWood } = o;
  const meat = B.mat('k_meat', () => std(0x8a5530, { roughness: 0.8 }));
  const grill = B.mat('k_grill', () => std(0x3a1c10, { emissive: 0xff6a2a, emissiveIntensity: 0.7, roughness: 0.6 }));
  const sx = cx - 0.55, sz = cz + 0.75;
  B.add(mMetal, cylGeo(0.2, 0.2, 0.04), sx, 1.0, sz); B.add(mMetal, cylGeo(0.02, 0.02, 1.0), sx, 1.45, sz);
  B.add(meat, cylGeo(0.13, 0.19, 0.62), sx, 1.36, sz); B.add(mMetal, cylGeo(0.05, 0.05, 0.05), sx, 1.72, sz);
  B.add(grill, boxGeo(0.46, 0.8, 0.06, 1), sx, 1.4, sz + 0.3);
  B.add(mMetal, boxGeo(0.56, 0.9, 0.04, 1), sx, 1.4, sz + 0.35);
  // the drinks fridge against the back wall, lit
  const fr = B.mat('k_fridge', () => std(0xdfe8ee, { emissive: 0xbfe0ff, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.2 }));
  B.block(mWhite, 0.75, 1.9, 0.6, cx + 1.9, 0, D - 0.45);
  B.add(fr, boxGeo(0.62, 1.6, 0.02, 1), cx + 1.9, 1.0, D - 0.76);
  // the menu over the counter
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const x = c.getContext('2d');
  x.fillStyle = '#1d1a18'; x.fillRect(0, 0, 512, 288);
  x.fillStyle = '#f2c230'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText('MENÚ', 256, 42);
  x.textAlign = 'left'; x.font = 'bold 26px sans-serif';
  [['Kebab', 5], ['Dürüm', 6], ['Falafel', 4], ['Patatas fritas', 3], ['Refresco', 2], ['Agua', 1]].forEach(([n, pr], i) => {
    x.fillStyle = '#f6f2ea'; x.fillText(n, 36, 86 + i * 34); x.fillStyle = '#f2c230'; x.textAlign = 'right'; x.fillText(pr + ' €', 476, 86 + i * 34); x.textAlign = 'left';
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  B.extraMesh(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.96), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 })), cx + 0.15, 1.95, D - 0.09, Math.PI);
  // little tables and stools down the right
  for (let z = 1.9; z < cz - 1.4; z += 1.7) {
    const tx = hw - 0.75;
    B.block(mWood, 0.7, 0.04, 0.7, tx, 0.72, z, 0, 1, false);
    B.add(mMetal, cylGeo(0.03, 0.03, 0.72), tx, 0.36, z);
    B.footprint(0.7, 0.7, tx, z, 0, 0.75);
    for (const dz of [-0.55, 0.55]) { B.add(mDark, cylGeo(0.17, 0.17, 0.05), tx, 0.47, z + dz); B.add(mMetal, cylGeo(0.025, 0.025, 0.45), tx, 0.23, z + dz); }
  }
}
// the gym: treadmills along one wall, a bench with its barbell, a rack of dumbbells, a punching bag, mirrors, mats;
// the reception is the counter. Training (an hour, at the counter or at the machines) makes you fitter for good
function gymFittings(B, o) {
  const { hw, D, cx, cz, mDark, mMetal, mWhite } = o;
  const mat = B.mat('g_mat', () => std(0x2a2c30, { roughness: 0.95 }));
  const red = B.mat('g_red', () => std(0xb8302a, { roughness: 0.6 }));
  const mirror = B.mat('g_mirror', () => std(0xc8d4dc, { roughness: 0.05, metalness: 0.9 }));
  B.add(mat, planeGeo(2 * hw - 1.0, cz - 2.2, 1).rotateX(-Math.PI / 2), 0, 0.012, (cz - 1.2) / 2 + 1.0);
  // treadmills on the left, facing the wall
  for (const z of [1.8, 3.2]) {
    const x = -hw + 0.9;
    B.block(mDark, 0.75, 0.22, 1.7, x, 0, z, Math.PI / 2);
    B.add(mMetal, boxGeo(0.04, 1.1, 0.04, 1), x - 0.75, 0.75, z - 0.3); B.add(mMetal, boxGeo(0.04, 1.1, 0.04, 1), x - 0.75, 0.75, z + 0.3);
    B.add(mDark, boxGeo(0.18, 0.3, 0.62, 1), x - 0.75, 1.32, z);
  }
  // the bench, its rack and barbell
  const bx = 0.4, bz = 2.6;
  B.block(red, 0.34, 0.45, 1.2, bx, 0, bz);
  for (const s of [-1, 1]) B.add(mMetal, boxGeo(0.05, 1.2, 0.05, 1), bx + s * 0.55, 0.6, bz - 0.45);
  B.add(mMetal, cylGeo(0.016, 0.016, 1.8).rotateZ(Math.PI / 2), bx, 1.12, bz - 0.45);
  for (const s of [-1, 1]) B.add(mDark, cylGeo(0.22, 0.22, 0.05).rotateZ(Math.PI / 2), bx + s * 0.72, 1.12, bz - 0.45);
  // dumbbells on a rack against the right wall, mirrors over it
  const rx = hw - 0.4;
  B.block(mDark, 0.4, 0.75, 2.2, rx, 0, 3.4);
  for (let i = 0; i < 6; i++) { const z = 2.5 + i * 0.36; for (const dx of [-0.08, 0.08]) B.add(mMetal, cylGeo(0.05, 0.05, 0.12).rotateX(Math.PI / 2), rx + dx, 0.82, z); }
  B.add(mirror, planeGeo(3.6, 1.6, 1), hw - 0.09, 1.75, 3.4, -Math.PI / 2);
  // the punching bag, hung from the ceiling
  B.add(red, cylGeo(0.2, 0.2, 1.0), -0.9, 1.35, cz - 2.2); B.add(mMetal, cylGeo(0.01, 0.01, 1.3), -0.9, 2.5, cz - 2.2);
  B.footprint(0.45, 0.45, -0.9, cz - 2.2, 0, 1.5);
  // a poster: the hours
  const c = document.createElement('canvas'); c.width = 256; c.height = 340;
  const x = c.getContext('2d');
  x.fillStyle = '#1f6fb2'; x.fillRect(0, 0, 256, 340); x.fillStyle = '#ffffff'; x.textAlign = 'center';
  x.font = 'bold 34px sans-serif'; x.fillText('GIMNASIO', 128, 60); x.font = '22px sans-serif';
  ['Abierto todos los días', 'de 7:00 a 22:30', '', 'Una hora: 4 €', 'Cinta · Pesas · Saco'].forEach((l, i) => x.fillText(l, 128, 120 + i * 38));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  B.extraMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.06), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })), -hw + 0.09, 1.7, cz - 0.6, Math.PI / 2);
  B.interact({ type: 'train', x: 0.0, z: 3.2, r: 1.6, label: 'Entrenar una hora' });
}
function armeriaFittings(B, o) {
  const { hw, D, mWood, mDark, mMetal, glass, tag, buyAt } = o;
  // rack on the back wall
  B.add(mWood, boxGeo(4.6, 1.4, 0.06, 1), 1.0, 1.75, D - 0.1);
  const longs = ['escopeta', 'rifle', 'subfusil'];
  longs.forEach((id, i) => {
    const gun = buildGun(id);
    if (!gun) return;
    gun.scale.setScalar(1.15);
    B.extraMesh(gun, -0.1 + i * 1.1, 1.35 + (i % 2) * 0.4, D - 0.2, Math.PI / 2);
  });
  const bat = buildGun('bate'); if (bat) { bat.rotation.set(0, 0, 0.25); B.extraMesh(bat, 3.0, 1.2, D - 0.2, 0); }
  B.interact({ type: 'buy', weapon: 'escopeta', x: -0.1, z: D - 1.1, r: 0.9 });
  B.interact({ type: 'buy', weapon: 'rifle', x: 1.0, z: D - 1.1, r: 0.9 });
  B.interact({ type: 'buy', weapon: 'subfusil', x: 2.1, z: D - 1.1, r: 0.9 });
  B.interact({ type: 'buy', weapon: 'bate', x: 3.0, z: D - 1.1, r: 0.8 });
  // the glass case in front of the counter with two pistols
  const cx = -hw + 2.2, cz = D - 2.6;
  B.block(mWood, 1.8, 0.8, 0.55, cx, 0, cz);
  B.extraMesh(new THREE.Mesh(boxGeo(1.8, 0.02, 0.55, 1), glass), cx, 1.0, cz);
  for (const s of [-1, 1]) { const pg = buildGun('pistola'); if (pg) { pg.rotation.set(-Math.PI / 2, 0, s * 0.4); B.extraMesh(pg, cx + s * 0.45, 0.83, cz, 0); } }
  B.add(mMetal, boxGeo(1.84, 0.2, 0.02, 1), cx, 0.9, cz - 0.28);
  B.interact({ type: 'buy', weapon: 'pistola', x: cx, z: cz - 0.8, r: 0.8 });
  // cartridges on the side wall
  const bx = -hw + 0.3;
  B.add(mWood, boxGeo(0.4, 0.03, 1.4, 1), bx, 1.2, 4.2); B.add(mWood, boxGeo(0.4, 0.03, 1.4, 1), bx, 1.6, 4.2);
  const ammoC = [0xc8202a, 0x2a5a8a, 0x3a6a3a, 0xd8a030];
  for (const y of [1.215, 1.615]) for (let i = 0; i < 8; i++) B.add(B.mat('ammo' + (i % 4), () => std(ammoC[i % 4], { roughness: 0.5 })), boxGeo(0.14, 0.1, 0.12, 1), bx, y + 0.05, 3.6 + i * 0.16);
  B.interact({ type: 'buy', ammo: true, x: bx + 0.9, z: 4.2, r: 0.9 });
  // the stag
  const st = new THREE.Group();
  const fur = std(0x7a5a3a, { roughness: 0.95 });
  const plq = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20).rotateX(Math.PI / 2), std(0x4a3020, { roughness: 0.6 })); st.add(plq);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 10).rotateX(Math.PI / 2 - 0.3), fur); neck.position.set(0, 0.02, 0.15); st.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.32), fur); head.position.set(0, 0.08, 0.34); st.add(head);
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.4, 5), std(0xe8dcc0)); a.position.set(s * 0.12, 0.3, 0.22); a.rotation.z = s * 0.5; st.add(a); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, 4), std(0xe8dcc0)); t.position.set(s * 0.2, 0.42, 0.24); t.rotation.z = -s * 0.3; st.add(t); }
  B.extraMesh(st, -hw + 0.12, 2.35, D / 2 + 0.6, Math.PI / 2);
  // the vest on a dummy and first-aid kits
  const dummy = new THREE.Group();
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.26), std(0x2a3326, { roughness: 0.9 })); vest.position.y = 1.25; dummy.add(vest);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), std(0x222222)); pole.position.y = 0.5; dummy.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 14), std(0x222222)); dummy.add(base);
  B.extraMesh(dummy, hw - 0.8, 0, D - 3.2, -Math.PI / 2);
  B.footprint(0.5, 0.5, hw - 0.8, D - 3.2, 0, 1.5);
  B.interact({ type: 'buy', armor: true, x: hw - 1.6, z: D - 3.2, r: 0.9 });
  const kit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.12), std(0xf4f4f0)); const cross = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.01), std(0xc8202a)); cross.position.z = 0.065; kit.add(cross); const c2 = cross.clone(); c2.rotation.z = Math.PI / 2; kit.add(c2);
  B.extraMesh(kit, hw - 0.25, 1.5, D - 5.0, -Math.PI / 2);
  B.interact({ type: 'buy', health: true, x: hw - 1.0, z: D - 5.0, r: 0.8 });
  // a mounted carp by the fishing gear
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8).scale(1.8, 0.8, 0.35), std(0x8a7a40, { roughness: 0.5, metalness: 0.2 }));
  B.extraMesh(fish, hw - 0.1, 2.25, 3.1, -Math.PI / 2);
}

// ---------------------------------------------------------------- the shops in town
function bagIcon() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fillStyle = '#8fe39b'; x.fill();
  x.lineWidth = 8; x.strokeStyle = '#1a1a1a'; x.stroke();
  x.fillStyle = '#1a1a1a'; x.fillRect(38, 50, 52, 44);
  x.lineWidth = 7; x.beginPath(); x.arc(64, 50, 14, Math.PI, 0); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
}

export class Shops {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.icon = bagIcon();
    this.here = null;   // the shop you are in
    this.keeper = null;
    this.store = null;  // the counter's list, open
    this.sel = 0;
  }

  setup(activities) {
    const g = this.g, map = g.map, used = [];
    const count = {};
    for (const p of map.pois) {
      if (!map.inTown(p.x, p.z)) continue;
      const type = p.shopType || Object.keys(SHOP_TYPES).find((t) => SHOP_TYPES[t].kinds.includes(p.kind));
      if (!type) continue;
      const door = this.fixDoor(activities.doorOf(p));
      if (!door || used.some((u) => Math.hypot(u.x - door.x, u.z - door.z) < 5)) continue;
      used.push(door);
      const n = count[type] = (count[type] || 0) + 1;
      const T = SHOP_TYPES[type];
      const title = p.title || (n === 1 ? T.title : (NAMES[type] && NAMES[type][(n - 2) % NAMES[type].length]) || T.title);
      this.add({ ...door, type, title, name: T.name, seed: 300 + this.list.length * 17 + n });
    }
    // the gun shop: the building by the Cooperativa where the old sign stood
    const gs = activities.gunShop;
    if (gs) {
      let best = null, bd = 40;
      for (const b of map.buildings) { const d = Math.hypot(b.c[0] - gs.x, b.c[1] - gs.z); if (d < bd && b.area > 60 && b.area < 900) { bd = d; best = b; } }
      const door = best ? this.fixDoor(activities.doorOf({ x: best.c[0], z: best.c[1] })) : null;
      if (door && Math.hypot(door.x - gs.x, door.z - gs.z) < 45) {
        gs.x = door.x; gs.z = door.z;
        if (gs.icon) gs.icon.position.set(door.x, 0, door.z);
        g.hud.setBlip('armeria', { x: door.x, z: door.z, label: 'A', color: '#e0533a', name: 'Armería', edge: false });
        this.armeria = this.add({ ...door, type: 'armeria', title: SHOP_TYPES.armeria.title, name: 'la armería', seed: 999 });
      }
    }
    // the ones for the house and for things show on the map (the food shops are everywhere: only up close)
    for (const s of this.list) if (!['armeria', 'super', 'panaderia', 'fruteria'].includes(s.type)) g.hud.setBlip('tienda' + this.list.indexOf(s), { x: s.x, z: s.z, label: 'T', color: '#8fe39b', name: s.title, edge: false, small: true });
  }
  // a map point for a shop often sits on the facade itself: find the building behind it, so that the door has a
  // pavement spot in front and a point inside (the way in, the way out, the street seen from the shop window)
  fixDoor(door) {
    if (!door) return null;
    const map = this.g.map;
    if (Math.hypot(door.x - door.fx, door.z - door.fz) > 1.2 && map.buildingAt(door.fx, door.fz)) return door;
    const q = map.nearestEdge(door.x, door.z, 40, (e) => (e.walk || e.drive) && !e.blocked);
    let dx = door.fx - door.x, dz = door.fz - door.z;
    if (q) { dx = door.x - q.x; dz = door.z - q.z; }
    const l = Math.hypot(dx, dz);
    if (l < 0.05) return door;
    dx /= l; dz /= l;
    let fx = door.x, fz = door.z;
    for (let t = 0; t <= 12; t += 0.25) {
      const x = door.x + dx * t, z = door.z + dz * t;
      if (map.buildingAt(x, z)) return { ...door, x: fx - dx * 0.7, z: fz - dz * 0.7, fx: x + dx * 2.5, fz: z + dz * 2.5 };
      fx = x; fz = z;
    }
    return door;
  }
  add(s) {
    const spr = new THREE.Sprite(this.icon);
    spr.scale.set(0.5, 0.5, 1); spr.position.set(s.x, 2.6, s.z); spr.visible = false;
    this.root.add(spr);
    s.spr = spr;
    this.list.push(s);
    return s;
  }
  near(x, z, r = 2.2) {
    let best = null, bd = r;
    for (const s of this.list) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (!g.interior) {
      for (const s of this.list) { const on = g.mode === 'normal' && Math.abs(s.x - p.pos.x) < 35 && Math.abs(s.z - p.pos.z) < 35; s.spr.visible = on && s.type !== 'armeria'; if (on) s.spr.position.y = 2.55 + Math.sin(g.time * 2.2 + s.seed) * 0.07; }
      return;
    }
    const k = this.keeper;
    if (k) {
      const dx = p.pos.x - k.x, dz = p.pos.z - k.z;
      k.heading += Math.atan2(Math.sin(Math.atan2(dx, dz) - k.heading), Math.cos(Math.atan2(dx, dz) - k.heading)) * Math.min(1, dt * 3);
      k.char.update(dt, 0, { fidget: true, talking: k.talkT > 0 });
      k.talkT -= dt;
      k.char.object.position.set(k.x, 0, k.z);
      k.char.object.rotation.set(0, k.heading, 0);
    }
  }

  // at a shop door in town: go in (if it is open)
  option() {
    const g = this.g, p = g.player;
    if (g.mode !== 'normal') return null;
    const s = this.near(p.pos.x, p.pos.z, 2.0);
    if (!s) return null;
    const T = SHOP_TYPES[s.type], hour = g.sky.hour;
    if (!isOpen(s.type, hour)) return { label: `${s.title}: cerrado · abre a las ${nextOpen(s.type, hour)}`, info: true };
    return { label: `Entrar en ${s.type === 'armeria' ? 'la armería' : T.name}${s.type !== 'armeria' ? ` <small>(${s.title})</small>` : ''}`, run: () => this.enter(s) };
  }
  enter(s) {
    const g = this.g;
    if (g.police.wanted > 0) { g.hud.notify(s.type === 'armeria' ? 'El armero echa la persiana: «Con la Guardia Civil detrás, ni hablar».' : 'Te cierran la puerta en las narices: «¡Aquí no, que viene la Guardia Civil!»', 'police', 4); return; }
    g.interiors.enter({ x: s.x, z: s.z, fx: s.fx, fz: s.fz, name: s.title, seed: s.seed, shop: s.type, shopRef: s }, { mode: 'shop' });
  }
  // called by the interiors once the shop is built
  onEnter(h, door) {
    const g = this.g, s = door.shopRef;
    this.here = { h, s };
    const rnd = mulberry32(s.seed);
    const desc = randomDesc(rnd);
    const ch = g.chars.create(desc);
    g.scene.add(ch.object);
    const at = h.spots.keeper;
    this.keeper = { char: ch, x: at.x, z: at.z, heading: Math.PI, talkT: 0, name: desc.gender === 'f' ? 'La dependienta' : 'El dependiente' };
    if (s.type === 'armeria') this.keeper.name = desc.gender === 'f' ? 'La armera' : 'El armero';
    setTimeout(() => this.say(pick(s.type === 'armeria' ? ['¡Buenas! ¿De caza o de pesca?', 'Pase, pase. Aquí tenemos de todo para el campo.'] : ['¡Buenos días! ¿Qué le pongo?', '¡Hola! Mire sin compromiso.', 'Pase, que hoy tenemos de todo.', '¡Buenas! Si busca algo, me dice.'])), 700);
  }
  onLeave() {
    const g = this.g;
    this.closeStore();
    if (this.keeper) { g.scene.remove(this.keeper.char.object); this.keeper.char.dispose(); this.keeper = null; }
    this.here = null;
  }
  say(t, ms = 2600) {
    const g = this.g, k = this.keeper;
    if (!k || !this.here) return;
    k.talkT = ms / 1000;
    g.hud.subtitle(k.name, g.gxs ? g.gxs(t) : t);
    clearTimeout(this._sub); this._sub = setTimeout(() => g.hud.subtitle(null), ms);
  }

  // ---------------------------------------------------------------- buying
  // everything the shop sells, as rows for the list (the gun shop adds the weapons, ammunition, the vest, the kits)
  rows() {
    const g = this.g, H = this.here;
    if (!H) return [];
    const out = [];
    // work here: ask at the counter (the job starts outside, at the door)
    const J = g.jobs, wp = J && g.mode === 'normal' ? (J.near(H.s.x, H.s.z, 6) || (H.s.fx !== undefined ? J.near(H.s.fx, H.s.fz, 8) : null)) : null;
    if (wp) {
      const what = { reparto: 'repartos', reponedor: 'descargar la furgoneta', cartero: 'cartero', grua: 'la grúa', camarero: 'camarero', barrendero: 'barrendero', tractor: 'tractor' }[wp.job] || wp.job;
      if (J.job && J.job.place === wp) out.push({ kind: 'quitjob', title: 'Dejar el trabajo', sub: `Ahora trabajas aquí (${what}).`, price: 0, ico: '🧾', wp });
      else if (!J.job) out.push({ kind: 'job', title: 'Pedir trabajo', sub: `Buscan a alguien: ${what}. Te pagan por tarea.`, price: 0, ico: '🤝', wp });
    }
    if (H.s.type === 'gimnasio') {
      const lv = (g.save && g.save.fitness) || 0;
      out.push(lv >= 10 ? { kind: 'train', title: 'Ya estás en plena forma', sub: 'Nivel de forma 10 de 10: más no se puede.', price: 0, ico: '🏆', off: true }
        : { kind: 'train', title: 'Entrenar una hora', sub: `Cinta, pesas y saco. Nivel de forma ${lv} de 10: cada hora, más aguante al esprintar, recuperas antes el aliento y pegas más fuerte.`, price: 4, ico: '🏋️' });
    }
    if (H.s.type === 'armeria') for (const it of g.activities.shopItems()) out.push({ ...it, ico: it.kind === 'weapon' || it.kind === 'ammo' ? '🎯' : it.kind === 'armor' ? '🦺' : '🩹' });
    for (const id of SHOP_TYPES[H.s.type].stock) {
      const d = ITEMS[id];
      if (!d) continue;
      const have = g.inv.count(id);
      out.push({ kind: 'item', id, title: d.name, sub: d.txt + (have ? ` · tienes ${have}` : ''), price: price(id), ico: d.ico, off: d.unique && have > 0 });
    }
    return out;
  }
  // inside: the counter, and each thing on display
  optionAt(it) {
    const g = this.g;
    if (it.type === 'counter') return { label: it.label, run: () => this.openStore() };
    if (it.type === 'train') { const row = this.rows().find((r) => r.kind === 'train'); return row ? (row.off ? { label: row.title, info: true } : { label: `${row.title} <small>(${row.price} €)</small>`, run: () => this.buy(row) }) : null; }
    if (it.type !== 'buy') return null;
    const row = this.rowFor(it);
    if (!row) return null;
    if (row.off) return { label: `${row.title}: ya lo tienes`, info: true };
    const alt = it.alt && it.alt.length > 1 ? ` <small>· en el mostrador, todo</small>` : '';
    return { label: `Comprar ${lc(row.title)} <small>(${row.price} €)</small>${alt}`, run: () => this.buy(row) };
  }
  rowFor(it) {
    const rows = this.rows();
    if (it.weapon) return rows.find((r) => (r.kind === 'weapon' || r.kind === 'ammo') && r.id === it.weapon);
    if (it.ammo) return rows.find((r) => r.kind === 'ammo') || rows.find((r) => r.kind === 'weapon' && WEAPONS[r.id] && WEAPONS[r.id].clip);
    if (it.armor) return rows.find((r) => r.kind === 'armor');
    if (it.health) return rows.find((r) => r.kind === 'health');
    return rows.find((r) => r.kind === 'item' && r.id === it.item);
  }
  buy(row) {
    const g = this.g, p = g.player;
    if (!row) return false;
    if (row.kind === 'job' || row.kind === 'quitjob') {
      this.closeStore();
      if (row.kind === 'quitjob') { g.jobs.quit(); return true; }
      this.say('¡Pues mira, justo nos hacía falta alguien!', 2000);
      g.interiors.exit().then(() => g.jobs.hire(row.wp));
      return true;
    }
    if (p.money < row.price) { g.audio.sfx('ui_back'); this.say(pick(['Uy, no le llega…', 'Le faltan unos euros, ¿eh?', 'Con eso no le llega, lo siento.'])); return false; }
    if (row.kind === 'train') {
      if (row.off) return false;
      p.money -= row.price;
      g.audio.sfx('money', { vol: 0.7 });
      this.closeStore();
      this.train();
      return true;
    }
    if (row.kind === 'item') {
      const d = ITEMS[row.id];
      if (d.unique && g.inv.has(row.id)) return false;
      p.money -= row.price;
      g.inv.add(row.id);
      g.audio.sfx('money', { vol: 0.7 });
      const big = d.cat === 'casa' && d.place === 'floor' && !d.flat;
      g.hud.notify(`${d.ico} ${d.name}: −${row.price} €${big ? ' · te lo llevan a casa: colócalo desde el inventario' : ' · al inventario'} (${g.input.keyText('I', 'móvil', 'Móvil')})`, 'ok', 4);
      this.say(pick(['¡Gracias! Que lo disfrute.', '¡Aquí tiene! Vuelva cuando quiera.', 'Muy buena elección.', '¡Gracias, {guapo|guapa}!']));
      if (row.id === 'cana') g.hint('fishing', 'Con la <b>caña</b> ve a la orilla del <b style="color:#6fc0ff">Pantano de San Roque</b> (o al embarcadero) y ' + (g.input.device === 'touch' ? 'toca el aviso' : 'pulsa ' + g.input.key('E', 15)) + ' para echarla. Con cebo pican antes. El pescado se vende en el Mercado de Abastos.', 12);
      g.persist();
      return true;
    }
    // the gun shop's own things
    if (row.kind === 'armor' && p.armor >= 100) { this.say('Ya lleva el chaleco puesto, y como nuevo.'); return false; }
    if (row.kind === 'health' && p.health >= 100) { this.say('Está usted como una rosa: el botiquín, para cuando haga falta.'); return false; }
    p.money -= row.price;
    const W = g.weapons;
    if (row.kind === 'weapon') { W.give(row.id, WEAPONS[row.id].ammoPack || 0); W.select(row.id); }
    else if (row.kind === 'ammo') W.give(row.id, WEAPONS[row.id].ammoPack);
    else if (row.kind === 'armor') p.armor = 100;
    else if (row.kind === 'health') p.health = Math.min(100, p.health + 50);
    g.audio.sfx('money');
    g.hud.weapon(true);
    g.hud.notify(`${row.title}: −${row.price} €`, 'ok', 3);
    this.say(pick(['Aquí tiene. Y con cabeza, ¿eh?', 'Buena elección. Úsela con cuidado.', 'Todo en regla. ¡Buena caza!']));
    g.persist();
    return true;
  }

  // the list at the counter (the old shop panel)
  openStore() {
    const g = this.g;
    if (!this.here) return;
    this.store = true;
    this.sel = 0;
    this.renderStore();
    g.ui.shop.hidden = false;
    g.state = 'shop';
    g.input.exitLock();
    g.hud.prompt('');
    this.say(this.here.s.type === 'armeria' ? '¿Qué va a ser?' : '¿Qué le pongo?', 1800);
  }
  renderStore() {
    const g = this.g, money = g.player.money, ui = g.ui;
    this.items = this.rows();
    ui.shopTitle.textContent = this.here ? this.here.s.title : 'Tienda';
    const dev = g.input.device;
    ui.shopSub.innerHTML = `Llevas <b style="color:var(--money)">${fmtMoney(money)}</b>. ${dev === 'touch' ? 'Toca' : dev === 'pad' ? `Elige con la cruceta y pulsa ${g.input.key('', 0)} en` : 'Haz clic (o ↑ ↓ e Intro) en'} lo que quieras comprar.`;
    ui.shopList.innerHTML = this.items.map((it, i) =>
      `<button class="item${money < it.price || it.off ? ' off' : ''}${i === this.sel ? ' on' : ''}" data-i="${i}"><span><b>${it.ico ? it.ico + ' ' : ''}${it.title}</b><small>${it.sub}</small></span><span class="price">${it.off ? '✓' : it.kind === 'job' || it.kind === 'quitjob' ? '' : it.price + ' €'}</span></button>`).join('');
  }
  buyAt(i) {
    const it = this.items && this.items[i];
    if (!it || it.off) return;
    this.sel = i;
    const ok = this.buy(it);
    this.renderStore();
    if (!ok) this.g.ui.shopSub.innerHTML = this.g.player.money < it.price ? '<b style="color:#ff8a7e">No te llega el dinero.</b> Vuelve cuando tengas más.' : this.g.ui.shopSub.innerHTML;
    const b = this.g.ui.shopList.querySelector(`[data-i="${i}"]`); if (b && this.g.input.device === 'pad') b.focus();
  }
  moveSel(d) {
    if (!this.items || !this.items.length) return;
    this.sel = (this.sel + d + this.items.length) % this.items.length;
    this.renderStore();
    const b = this.g.ui.shopList.querySelector(`[data-i="${this.sel}"]`); if (b) b.scrollIntoView({ block: 'nearest' });
  }
  // an hour at the gym: time goes by, you come out fitter (for good, up to level 10) and out of breath for a moment
  async train() {
    const g = this.g, p = g.player;
    if (this.training) return;
    this.training = true;
    try {
      if (g.interiors && g.interiors.fade) await g.interiors.fade(true, 600);
      g.sky.hour = (g.sky.hour + 1) % 24;
      g.save.fitness = Math.min(10, (g.save.fitness || 0) + 1);
      p.applyPerks();
      p.stamina = 1; p.health = Math.min(100, p.health + 10);
      g.hud.notify(`🏋️ Una hora de gimnasio. Nivel de forma ${g.save.fitness} de 10: aguantas más esprintando, recuperas antes el aliento y pegas más fuerte.`, 'ok', 5);
      g.persist();
      await new Promise((res) => setTimeout(res, 700));
      if (g.interiors && g.interiors.fade) g.interiors.fade(false, 600);
      this.say(pick(['¡Buen entreno! Mañana más.', '¡Así se hace! Bebe agua, ¿eh?', 'Se te nota en forma, ¿eh?']), 2200);
    } finally { this.training = false; }
  }
  closeStore() {
    const g = this.g;
    if (!this.store) return;
    this.store = false;
    g.ui.shop.hidden = true;
    if (g.state === 'shop') g.state = 'play';
    g.input.requestLock();
  }
}
