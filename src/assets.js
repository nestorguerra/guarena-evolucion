// External assets: CC0 photo-scanned materials from Poly Haven and CC0 sound effects from OpenGameArt. The published
// page carries them inside itself (#assetdata: path -> base64); a dev page loads them from assets/ next to it.
// Everything is optional: if a file can't be loaded the game keeps its procedural fallback.
import * as THREE from 'three';
import { STYLE } from './style.js';
import { toonifyLayers } from './toon.js';

export const ASSET_BASE = (() => {
  try { return new URL('assets/', document.baseURI).href; } catch (e) { return 'assets/'; }
})();

// photo materials used on the town (walls & roofs) — order matters, the building shader indexes these layers
// (whitewash, rough old plaster, brick, granite ashlar, corrugated sheet, clay tiles, old curved "teja árabe", painted plaster)
export const DETAIL_LAYERS = ['white_plaster_02', 'white_rough_plaster', 'brick_wall_02', 'rock_tile_floor', 'corrugated_iron', 'clay_roof_tiles_02', 'roof_09', 'painted_plaster_wall'];
// physical size (metres) covered by one repetition of each detail texture
export const DETAIL_SIZE = [1.6, 1.4, 2.0, 1.96, 1.2, 2.5, 4.0, 2.0];
// photo materials for the ground (asphalt, concrete, dry earth, gravel, grass, dry grass) and their physical size (m)
export const GROUND_DETAIL = ['asphalt_02', 'dirty_concrete', 'dry_ground_01', 'gravel_floor_02', 'sparse_grass', 'withered_grass'];
export const GROUND_DETAIL_SIZE = [3.0, 3.0, 4.0, 2.0, 2.0, 2.0];
// materials for house interiors
export const INTERIOR_TEX = ['herringbone_parquet', 'floor_tiles_06', 'long_white_tiles', 'painted_plaster_wall', 'dark_wood', 'decrepit_wallpaper', 'concrete_floor_damaged_01', 'white_rough_plaster'];

export function loadImage(url) {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

// the page's copies are base-85 text (tools/build.py: 5 characters per 4 bytes, an alphabet that needs no escaping
// inside a JSON string in a <script>), or base 64 in older pages
const B85 = "!#$%&\'()*+,-./0123456789:;=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ^_`abcdefghijklmnopqrstuvwxyz~";
let B85I = null;
function fromB85(s) {
  if (!B85I) { B85I = new Uint8Array(128); for (let i = 0; i < 85; i++) B85I[B85.charCodeAt(i)] = i; }
  const n = s.length, full = Math.floor(n / 5), rem = n % 5;
  const out = new Uint8Array(full * 4 + (rem ? rem - 1 : 0));
  let o = 0, i = 0;
  const d = (k) => B85I[s.charCodeAt(k)];
  for (let g = 0; g < full; g++, i += 5) {
    const v = (((d(i) * 85 + d(i + 1)) * 85 + d(i + 2)) * 85 + d(i + 3)) * 85 + d(i + 4);
    out[o++] = v >>> 24; out[o++] = (v >>> 16) & 255; out[o++] = (v >>> 8) & 255; out[o++] = v & 255;
  }
  if (rem) {
    let v = 0;
    for (let k = 0; k < 5; k++) v = v * 85 + (k < rem ? d(i + k) : 84); // (the short last group, padded with the top digit)
    for (let k = 0; k < rem - 1; k++) out[o++] = (v >>> (24 - 8 * k)) & 255;
  }
  return out;
}
let embed, embedEnc = 'b64';
function embedded(path) {
  if (embed === undefined) {
    embed = null;
    try {
      const el = document.getElementById('assetdata');
      if (el) { embed = JSON.parse(el.textContent); embedEnc = embed.__enc || 'b64'; }
    } catch (e) { embed = null; }
  }
  const txt = embed && embed[path];
  if (!txt) return null;
  if (embedEnc === 'b85') return fromB85(txt);
  const bin = atob(txt);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// asset bytes by path under assets/ (embedded copy first), or null
export async function loadAssetBytes(path) {
  const bytes = embedded(path);
  if (bytes) return bytes;
  try {
    const r = await fetch(ASSET_BASE + path);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch (e) { return null; }
}
// asset image by path under assets/ (embedded copy first); resolves to a canvas or image, or null
export async function loadAssetImage(path) {
  const bytes = embedded(path);
  if (bytes) {
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg' }));
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      return c;
    } catch (e) { /* fall back to the network copy */ }
  }
  return loadImage(ASSET_BASE + path);
}

// Builds a DataArrayTexture from several square images (flipped so that v grows upwards like the image).
// Missing images become flat layers (grey albedo / straight-up normal). Returns { tex, ok, mean }.
export async function loadTextureArray(names, suffix, size, { srgb = true, aniso = 8, flat = [128, 128, 128, 255] } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const layer = size * size * 4;
  const data = new Uint8Array(layer * names.length);
  const ok = [], mean = [];
  const ims = await Promise.all(names.map((n) => loadAssetImage('tex/' + n + suffix + '.jpg')));
  for (let i = 0; i < names.length; i++) {
    const im = ims[i];
    let sum = 0;
    if (im) {
      ctx.drawImage(im, 0, 0, size, size);
      const px = ctx.getImageData(0, 0, size, size).data;
      const row = size * 4;
      for (let y = 0; y < size; y++) data.set(px.subarray((size - 1 - y) * row, (size - y) * row), i * layer + y * row);
      for (let k = 0; k < px.length; k += 4) sum += px[k] * 0.2126 + px[k + 1] * 0.7152 + px[k + 2] * 0.0722;
      ok.push(true);
      mean.push(sum / (size * size) / 255);
    } else {
      for (let k = 0; k < layer; k += 4) data.set(flat, i * layer + k);
      ok.push(false);
      mean.push(flat[0] / 255);
    }
  }
  const t = new THREE.DataArrayTexture(data, size, size, names.length);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return { tex: t, ok, mean, any: ok.some(Boolean) };
}

// single tiling texture (interiors)
const texCache = new Map();
export function loadTexture(name, suffix = '_d', { srgb = true, repeat = 1 } = {}) {
  const key = name + suffix;
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, repeat);
  loadAssetImage('tex/' + name + suffix + '.jpg').then((im) => {
    if (!im) return;
    if (STYLE.anime && suffix === '_d') { // repainted flat, like the rest of the anime town
      const S = Math.min(512, im.width || 512), c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, S, S);
      const id = x.getImageData(0, 0, S, S);
      toonifyLayers(id.data, S, 1, { rColor: 6, rEdge: 2, levels: 5, posterize: 0.8, ink: 0.4, edge0: 20, edge1: 44 });
      x.putImageData(id, 0, 0);
      t.image = c;
    } else if (STYLE.diorama && suffix === '_d' && /plaster/.test(name)) {
      // the diorama's lime plaster (the visual spec): the scan's stains and blotches kept as soft differences of tone
      const S = Math.min(1024, im.width || 1024), c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, S, S);
      const id = x.getImageData(0, 0, S, S), d = id.data, M = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { M[0] += d[i]; M[1] += d[i + 1]; M[2] += d[i + 2]; }
      const IV = [240, 230, 208], T = [0, 0, 0]; // (its mean moved most of the way to the ivory of fresh lime)
      for (let k = 0; k < 3; k++) { M[k] /= d.length / 4; T[k] = M[k] + (IV[k] - M[k]) * 0.7; }
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        for (let k = 0; k < 3; k++) d[i + k] = T[k] + (l + (d[i + k] - l) * 0.6 - M[k]) * 0.3;
      }
      x.putImageData(id, 0, 0);
      t.image = c;
    } else t.image = im;
    t.needsUpdate = true;
  });
  texCache.set(key, t);
  return t;
}

// sound samples: name -> ArrayBuffer (decoded later by the audio engine)
export const SAMPLES = {
  breath: 'ghost_breath.mp4',
  z1: 'zombie1.mp4', z2: 'zombie2.mp4', z3: 'zombie3.mp4', z4: 'zombie4.mp4', z5: 'zombie5.mp4', z6: 'zombie6.mp4',
};
export async function fetchSample(name) {
  const f = SAMPLES[name];
  if (!f) return null;
  const bytes = embedded('snd/' + f);
  if (bytes) return bytes.buffer;
  try {
    const r = await fetch(ASSET_BASE + 'snd/' + f);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch (e) { return null; }
}
