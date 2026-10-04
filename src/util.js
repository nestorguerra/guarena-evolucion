// Shared math / geometry helpers.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const dampAngle = (cur, target, rate, dt) => cur + wrapAngle(target - cur) * (1 - Math.exp(-rate * dt));

// Deterministic hash-based random numbers.
export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function hash1(n) {
  let h = Math.imul(n | 0, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

// 2D value noise (for textures & terrain tint)
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi + seed * 131, yi), b = hash2(xi + 1 + seed * 131, yi);
  const c = hash2(xi + seed * 131, yi + 1), d = hash2(xi + 1 + seed * 131, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * valueNoise(x * f, y * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// ---------------------------------------------------------------- polygons (flat arrays [x0,z0,x1,z1,...])

export function ringArea(r) {
  let a = 0;
  const n = r.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    a += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return a * 0.5;
}
export function ringCentroid(r) {
  let a = 0, cx = 0, cz = 0;
  const n = r.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    const c = r[i] * r[j + 1] - r[j] * r[i + 1];
    a += c;
    cx += (r[i] + r[j]) * c;
    cz += (r[i + 1] + r[j + 1]) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i += 2) { sx += r[i]; sz += r[i + 1]; }
    return [sx / (n / 2), sz / (n / 2)];
  }
  return [cx / (3 * a), cz / (3 * a)];
}
export function pointInRing(x, z, r) {
  let ins = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
export function ringBounds(r) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    if (r[i] < x0) x0 = r[i];
    if (r[i] > x1) x1 = r[i];
    if (r[i + 1] < z0) z0 = r[i + 1];
    if (r[i + 1] > z1) z1 = r[i + 1];
  }
  return [x0, z0, x1, z1];
}
// Minimum-area oriented rectangle (rotating edges of the ring). Returns {cx,cz,ang,hw,hd} (half sizes along ang / perpendicular)
export function orientedRect(r) {
  let best = null;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = r[j * 2] - r[i * 2], dz = r[j * 2 + 1] - r[i * 2 + 1];
    const L = Math.hypot(dx, dz);
    if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const px = r[k * 2], pz = r[k * 2 + 1];
      const a = px * ux + pz * uz, b = -px * uz + pz * ux;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) {
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
      best = { area, ang: Math.atan2(uz, ux), hw: (a1 - a0) / 2, hd: (b1 - b0) / 2, cx: ca * ux - cb * uz, cz: ca * uz + cb * ux };
    }
  }
  return best;
}
// Distance from point to segment
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

// Polyline helpers: pts flat array [x,z,...]
export function polyLength(p) {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}
export function polyCum(p) {
  const c = new Float32Array(p.length / 2);
  let L = 0;
  for (let i = 1; i < c.length; i++) {
    L += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    c[i] = L;
  }
  return c;
}
// Sample polyline at distance s: writes {x,z,dx,dz} into out
export function polySample(p, cum, s, out) {
  const n = cum.length;
  if (s <= 0) {
    const dx = p[2] - p[0], dz = p[3] - p[1], l = Math.hypot(dx, dz) || 1;
    out.x = p[0]; out.z = p[1]; out.dx = dx / l; out.dz = dz / l;
    return out;
  }
  const L = cum[n - 1];
  if (s >= L) {
    const dx = p[n * 2 - 2] - p[n * 2 - 4], dz = p[n * 2 - 1] - p[n * 2 - 3], l = Math.hypot(dx, dz) || 1;
    out.x = p[n * 2 - 2]; out.z = p[n * 2 - 1]; out.dx = dx / l; out.dz = dz / l;
    return out;
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid; else hi = mid;
  }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  const x0 = p[lo * 2], z0 = p[lo * 2 + 1], x1 = p[hi * 2], z1 = p[hi * 2 + 1];
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
  out.x = x0 + dx * t; out.z = z0 + dz * t; out.dx = dx / l; out.dz = dz / l;
  return out;
}
// Nearest point on polyline → {s, d, x, z}
export function polyNearest(p, cum, px, pz) {
  let best = Infinity, bs = 0, bx = 0, bz = 0;
  for (let i = 0; i < cum.length - 1; i++) {
    const ax = p[i * 2], az = p[i * 2 + 1], bx2 = p[i * 2 + 2], bz2 = p[i * 2 + 3];
    const dx = bx2 - ax, dz = bz2 - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const cx = ax + dx * t, cz = az + dz * t;
    const d = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    if (d < best) { best = d; bs = cum[i] + (cum[i + 1] - cum[i]) * t; bx = cx; bz = cz; }
  }
  return { s: bs, d: Math.sqrt(best), x: bx, z: bz };
}

// Offset polyline (positive = left of direction, i.e. rotate direction +90° in x/z: left = (-dz, dx))
export function offsetPolyline(p, off) {
  const n = p.length / 2;
  const out = new Float32Array(p.length);
  for (let i = 0; i < n; i++) {
    let nx = 0, nz = 0;
    if (i > 0) {
      const dx = p[i * 2] - p[i * 2 - 2], dz = p[i * 2 + 1] - p[i * 2 - 1], l = Math.hypot(dx, dz) || 1;
      nx += -dz / l; nz += dx / l;
    }
    if (i < n - 1) {
      const dx = p[i * 2 + 2] - p[i * 2], dz = p[i * 2 + 3] - p[i * 2 + 1], l = Math.hypot(dx, dz) || 1;
      nx += -dz / l; nz += dx / l;
    }
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    // miter length correction
    let m = 1;
    if (i > 0 && i < n - 1) {
      const dx = p[i * 2] - p[i * 2 - 2], dz = p[i * 2 + 1] - p[i * 2 - 1], ll = Math.hypot(dx, dz) || 1;
      const dot = (-dz / ll) * nx + (dx / ll) * nz;
      m = 1 / Math.max(0.35, dot);
    }
    out[i * 2] = p[i * 2] + nx * off * m;
    out[i * 2 + 1] = p[i * 2 + 1] + nz * off * m;
  }
  return out;
}

export function fmtMoney(v) {
  const s = Math.floor(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + s + ' €';
}

// Guareña Evolución keeps its own save: on the same site as the fixed version (GitHub Pages) the two would share it.
// The first time it starts from the fixed version's progress (read, never written)
export const SAVE_KEY = 'guarena_evo_save', SAVE_KEY_FIXED = 'guarena_save';
export function readSave(store) {
  return (store && (store.getItem(SAVE_KEY) || store.getItem(SAVE_KEY_FIXED))) || '{}';
}

export function safeStorage() {
  try {
    const k = '__t';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch (e) {
    return null;
  }
}
