// The doors of Santa María, made here so the street and the inside share them: the great round-headed leaves of wood
// as they are. The main door at the foot is painted oxblood over a grid of raised panels («cuarterones») with a forged
// nail head at every crossing; the side doors are boards under rows of nails. Iron rings to knock with, the keyhole
// plate. On the inside face: the boards, the battens and braces that hold them, the strap hinges, the lock box and the
// bolts. The leaves turn on their hinges, inwards, slowly, the way heavy doors do. Round them, the granite portals
// (after the photographs and the description of the BIC declaration, BOE 1 July 1988): at the foot a round arch between
// slender smooth columns on decorated pedestals, an entablature, a pediment with the coat of arms and three pinnacles;
// on the Epistle side the arch between pairs of smooth and fluted columns under a great cornice; on the Gospel side an
// arch of coffered voussoirs with buttons framed by an alfiz, and an empty niche over it. Behind an open door, the
// dark of the church and its wooden draught lobby (the «cancel»), with candlelight through its little windows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, clamp } from './util.js';

// ---------------------------------------------------------------- polygons (door coordinates: x across, y up, z towards the street)
// a polygon clipped to a convex one (Sutherland–Hodgman); both counter-clockwise
function clip(poly, conv) {
  let out = poly;
  for (let i = 0; i < conv.length && out.length; i++) {
    const a = conv[i], b = conv[(i + 1) % conv.length], inp = out;
    out = [];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
// a flat piece cut to a polygon between z0 and z1: its front face (at z1) looks at +z. uvf(x, y) → [u, v]
function slab(poly, z0, z1, uvf, { front = true, back = true, sides = true } = {}) {
  if (!poly || poly.length < 3 || Math.abs(area(poly)) < 1e-6) return null;
  if (area(poly) < 0) poly = poly.slice().reverse();
  const pos = [], nrm = [], uv = [], idx = [];
  const tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p[0], p[1])), []);
  const cap = (z, nz) => {
    const k = pos.length / 3;
    for (const p of poly) { pos.push(p[0], p[1], z); nrm.push(0, 0, nz); const t = uvf(p[0], p[1]); uv.push(t[0], t[1]); }
    for (const t of tris) {
      const a = poly[t[0]], b = poly[t[1]], c = poly[t[2]];
      const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if ((cz > 0) === (nz > 0)) idx.push(k + t[0], k + t[1], k + t[2]); else idx.push(k + t[0], k + t[2], k + t[1]);
    }
  };
  if (front) cap(z1, 1);
  if (back) cap(z0, -1);
  if (sides) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const nx = dy / L, ny = -dx / L, k = pos.length / 3; // (outwards, for a counter-clockwise polygon)
    for (const [p, z] of [[a, z0], [b, z0], [b, z1], [a, z1]]) { pos.push(p[0], p[1], z); nrm.push(nx, ny, 0); const t = uvf(p[0], p[1]); uv.push(t[0] + (z - z0) * 0.5, t[1]); }
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// every piece indexed, with the same attributes: then they merge
function norm(g) {
  if (!g) return null;
  if (!g.index) { const n = g.attributes.position.count, ix = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}
function merged(list) { const l = list.filter(Boolean).map(norm); return l.length ? mergeGeometries(l, false) : null; }
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (!g) return null; if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };

// ---------------------------------------------------------------- the leaves' layout (shared by the paint and the pieces)
// o: { w, spring, style: 'cuarterones'|'clavos', cols, t (thickness) }
function layout(o) {
  const W = o.w, R = W / 2, S = o.spring, C = S + R, gap = 0.006, bw = o.bw || 0.085;
  const a0 = Math.acos(-gap / R);
  const arc = (r, n = 16) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI - a0) * (i / n); out.push([Math.cos(a) * r, S + Math.sin(a) * r]); } return out; };
  // a leaf's outline, counter-clockwise: the left one from its hinge (x = -R) to the meeting edge (x = -gap)
  const left = [[-R, 0], [-gap, 0], ...arc(R)];
  const mirror = (p) => p.map(([x, y]) => [-x, y]).reverse();
  const L = { W, R, S, C, gap, bw, leaves: [left, mirror(left)], bars: [[], []], panels: [[], []], studs: [[], []], band: [] };
  if (o.style === 'cuarterones') {
    // stiles the full height (between the bottom rail and the arch band), rails between them a hair lower, the panels
    // raised in the fields: bars carry their own depth, so no two faces lie in one plane
    const cols = o.cols || 3, foot = 0.34, lw = R - gap;
    const pw = (lw - (cols + 1) * bw) / cols;
    const nr = Math.max(4, Math.round((S - foot) / 0.55)), pitch = (S - foot - bw) / nr;
    const xs = [], ys = [];
    for (let c = 0; c <= cols; c++) xs.push(-R + bw / 2 + c * (pw + bw));
    for (let r = 0; ; r++) { const y = foot + bw / 2 + r * pitch; if (y > C) break; ys.push(y); }
    const inner = [[-R + bw, 0], [-gap - bw, 0], ...arc(R - bw)]; // inside the arch band
    const outline = L.leaves[0];
    for (let s = 0; s < 2; s++) {
      const M = s ? (p) => mirror(p) : (p) => p, fx = s ? -1 : 1;
      const innerS = [[-R, foot], [-gap, foot], ...arc(R - bw)];
      for (const x of xs) { const b = clip(rect(x - bw / 2, foot, x + bw / 2, C), innerS); if (b.length > 2) L.bars[s].push({ p: M(b), d: 0.026 }); }
      L.bars[s].push({ p: M(clip(rect(-R, 0, -gap, foot), outline)), d: 0.026 });
      for (const y of ys) { const b = clip(rect(-R, y - bw / 2, -gap, y + bw / 2), inner); if (b.length > 2 && Math.abs(area(b)) > 0.002) L.bars[s].push({ p: M(b), d: 0.021 }); }
      for (let c = 0; c < cols; c++) for (let r = 0; r < ys.length; r++) {
        const x0 = xs[c] + bw / 2, x1 = xs[c + 1] - bw / 2, y0 = ys[r] + bw / 2, y1 = r + 1 < ys.length ? ys[r + 1] - bw / 2 : C;
        const p = clip(rect(x0, y0, x1, y1), inner);
        if (p.length > 2 && Math.abs(area(p)) > 0.012) L.panels[s].push(M(p));
      }
      for (const x of xs) for (const y of ys) { const yt = S + Math.sqrt(Math.max(0, (R - bw * 1.4) ** 2 - x * x)); if (y < yt) L.studs[s].push([x * fx, y]); }
      for (const x of xs) L.studs[s].push([x * fx, foot * 0.5]);
      for (let c = 0; c < cols; c++) L.studs[s].push([((xs[c] + xs[c + 1]) / 2) * fx, foot * 0.5]);
      // the arch band (the curved rail along the top of the leaf), studded
      L.bars[s].push({ p: M([...arc(R), ...arc(R - bw).reverse()]), d: 0.026 });
      for (let i = 1; i < 9; i++) { const a = a0 + (Math.PI - a0) * (i / 9); L.studs[s].push([Math.cos(a) * (R - bw / 2) * fx, S + Math.sin(a) * (R - bw / 2)]); }
    }
  } else {
    // boards under rows of nails (the hidden battens behind), two iron straps across
    const rowsY = [0.28, 1.0, 1.75, 2.5, Math.max(2.9, S - 0.35), S + R * 0.45];
    for (let s = 0; s < 2; s++) {
      const fx = s ? -1 : 1;
      for (const y of rowsY) {
        for (let x = -R + 0.08; x < -gap - 0.05; x += 0.16) {
          const yt = S + Math.sqrt(Math.max(0, (R - 0.1) ** 2 - x * x));
          if (y < yt) L.studs[s].push([x * fx, y]);
        }
      }
      for (let i = 1; i < 10; i++) { const a = a0 + (Math.PI - a0) * (i / 10); L.studs[s].push([Math.cos(a) * (R - 0.07) * fx, S + Math.sin(a) * (R - 0.07)]); }
      for (const y of [0.62, S - 0.75]) L.bars[s].push({ p: s ? [[gap + 0.04, y - 0.035], [R - 0.03, y - 0.035], [R - 0.03, y + 0.035], [gap + 0.04, y + 0.035]] : [[-R + 0.03, y - 0.035], [-gap - 0.04, y - 0.035], [-gap - 0.04, y + 0.035], [-R + 0.03, y + 0.035]], d: 0.008, iron: true });
    }
    L.straps = true;
  }
  return L;
}

// ---------------------------------------------------------------- the paint (canvas): weathered, as a door in the sun is
const TEX = new Map();
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c, key) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  TEX.set(key, t);
  return t;
}
// fine grain along the boards: long wavering lines, a few knots
function grain(x, W, H, r, dark, light, n = 700) {
  for (let i = 0; i < n; i++) {
    const gx = r() * W, len = H * (0.15 + r() * 0.6), y0 = r() * H, wv = r() * 6;
    x.strokeStyle = r() < 0.6 ? dark : light; x.lineWidth = 0.6 + r() * 1.4;
    x.beginPath(); x.moveTo(gx, y0);
    for (let t = 0; t <= 1; t += 0.1) x.lineTo(gx + Math.sin(t * 6 + wv) * 2.2, y0 + t * len);
    x.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const kx = r() * W, ky = r() * H, kr = 3 + r() * 7;
    x.strokeStyle = dark; x.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(kx, ky, kr + k * 3, (kr + k * 3) * 2.4, 0, 0, 6.28); x.stroke(); }
    x.fillStyle = dark; x.beginPath(); x.ellipse(kx, ky, kr * 0.6, kr * 1.1, 0, 0, 6.28); x.fill();
  }
}
// an irregular flake (where the paint has come away)
function flake(x, cx, cy, s, r) {
  x.beginPath();
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, rr = s * (0.45 + r() * 0.75); x.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
}
// the street face. L: the layout (nail heads → rust streaks; the bars and panels shaded as they are)
function outerTexture(L, style, key) {
  if (TEX.has(key)) return TEX.get(key);
  const Wp = 512, Hp = 1024, c = cnv(Wp, Hp), x = c.getContext('2d'), r = mulberry32(key.length * 97 + 13);
  const U = (X) => ((X + L.R) / L.W) * Wp, Vv = (Y) => Hp - (Y / L.C) * Hp; // door coordinates → canvas pixels
  if (style === 'cuarterones') {
    // the wood that shows where the paint has gone: grey, dry
    x.fillStyle = '#5e5348'; x.fillRect(0, 0, Wp, Hp);
    grain(x, Wp, Hp, r, 'rgba(40,32,26,0.4)', 'rgba(150,135,115,0.2)', 500);
    // the paint, on a layer of its own so the flakes can cut through it
    const p = cnv(Wp, Hp), q = p.getContext('2d');
    q.fillStyle = '#6c1f1a'; q.fillRect(0, 0, Wp, Hp);
    for (let i = 0; i < 1400; i++) { q.fillStyle = `rgba(${r() < 0.5 ? '150,48,38' : '52,14,10'},${0.04 + r() * 0.07})`; q.fillRect(r() * Wp, r() * Hp, 1 + r() * 2.5, 30 + r() * 160); } // brush marks along the grain
    grain(q, Wp, Hp, r, 'rgba(40,8,6,0.22)', 'rgba(170,70,55,0.14)', 400);
    // the bars and the panels: their edges catch the light or the shadow (a painter's help to the relief)
    const poly = (pts) => { q.beginPath(); pts.forEach(([X, Y], i) => (i ? q.lineTo(U(X), Vv(Y)) : q.moveTo(U(X), Vv(Y)))); q.closePath(); };
    for (const s of [0, 1]) {
      for (const pn of L.panels[s]) { poly(pn); q.fillStyle = 'rgba(30,6,4,0.18)'; q.fill(); q.lineWidth = 3; q.strokeStyle = 'rgba(20,4,2,0.45)'; q.stroke(); }
      for (const b of L.bars[s]) { poly(b.p); q.fillStyle = 'rgba(200,90,70,0.07)'; q.fill(); }
    }
    // the sun has faded the top; the rain and the brooms have darkened the foot
    let g = q.createLinearGradient(0, 0, 0, Hp); g.addColorStop(0, 'rgba(255,214,190,0.22)'); g.addColorStop(0.55, 'rgba(255,214,190,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    q.fillStyle = g; q.fillRect(0, 0, Wp, Hp);
    // where the paint has come away: the foot, the meeting edge, round the rings, here and there
    q.globalCompositeOperation = 'destination-out';
    q.fillStyle = '#000';
    for (let i = 0; i < 240; i++) {
      const zone = r();
      let cx, cy, sz;
      if (zone < 0.45) { cx = r() * Wp; cy = Hp - Math.pow(r(), 2.6) * Hp * 0.16; sz = 1.2 + r() * 5; }      // the foot
      else if (zone < 0.65) { cx = Wp / 2 + (r() - 0.5) * 26; cy = Hp * (0.25 + r() * 0.7); sz = 1 + r() * 3; } // the meeting edge
      else if (zone < 0.75) { cx = U((r() < 0.5 ? -1 : 1) * 0.34) + (r() - 0.5) * 34; cy = Vv(1.58) + (r() - 0.5) * 40; sz = 1 + r() * 2.5; } // round the rings
      else if (zone < 0.85) { cx = r() < 0.5 ? r() * 14 : Wp - r() * 14; cy = r() * Hp; sz = 1 + r() * 3; }    // the hinge edges
      else { cx = r() * Wp; cy = r() * Hp; sz = 0.8 + r() * 2.2; }
      flake(q, cx, cy, sz, r);
    }
    q.globalCompositeOperation = 'source-over';
    x.drawImage(p, 0, 0);
    // a slight sheen along the hand-worn edges, and fine scratches
    for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(220,170,150,${0.08 + r() * 0.12})`; x.lineWidth = 0.7; const sx = r() * Wp, sy = Hp * (0.35 + r() * 0.5); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 40, sy + (r() - 0.5) * 12); x.stroke(); }
  } else {
    // boards, oiled long ago and greyed by the sun: oak gone silver at the top, dark at the foot
    x.fillStyle = '#6d5844'; x.fillRect(0, 0, Wp, Hp);
    const nb = 7, bwp = Wp / nb;
    for (let i = 0; i < nb; i++) {
      const v = 0.85 + r() * 0.3;
      x.fillStyle = `rgb(${110 * v | 0},${88 * v | 0},${66 * v | 0})`; x.fillRect(i * bwp, 0, bwp, Hp);
    }
    grain(x, Wp, Hp, r, 'rgba(40,28,18,0.4)', 'rgba(190,170,140,0.2)', 900);
    for (let i = 1; i < nb; i++) { x.fillStyle = 'rgba(20,12,6,0.85)'; x.fillRect(i * bwp - 1.5, 0, 3, Hp); x.fillStyle = 'rgba(200,180,150,0.25)'; x.fillRect(i * bwp + 1.5, 0, 1.5, Hp); }
    const g = x.createLinearGradient(0, 0, 0, Hp); g.addColorStop(0, 'rgba(200,200,195,0.32)'); g.addColorStop(0.5, 'rgba(180,175,165,0.12)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,12,6,0.45)');
    x.fillStyle = g; x.fillRect(0, 0, Wp, Hp);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(30,20,12,${0.15 + r() * 0.2})`; x.fillRect(r() * Wp, Hp * (0.2 + r() * 0.8), 1 + r() * 2, 20 + r() * 90); } // cracks along the grain
  }
  // rust: a streak down from every nail head, the iron straps' shadows
  for (const s of [0, 1]) for (const [X, Y] of L.studs[s]) {
    const px = U(X), py = Vv(Y);
    x.fillStyle = `rgba(30,14,8,0.45)`; x.beginPath(); x.arc(px, py, 5.5, 0, 6.28); x.fill();
    const len = 8 + r() * 34, g = x.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, 'rgba(120,52,20,0.55)'); g.addColorStop(1, 'rgba(120,52,20,0)');
    x.fillStyle = g; x.fillRect(px - 1.5 - r(), py, 2.5 + r() * 1.5, len);
  }
  // the foot: grime and splashes of the rain
  const gf = x.createLinearGradient(0, Hp * 0.86, 0, Hp); gf.addColorStop(0, 'rgba(25,18,12,0)'); gf.addColorStop(1, 'rgba(25,18,12,0.55)');
  x.fillStyle = gf; x.fillRect(0, Hp * 0.86, Wp, Hp * 0.14);
  for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(60,48,36,${0.1 + r() * 0.2})`; x.beginPath(); x.arc(r() * Wp, Hp - Math.pow(r(), 1.6) * Hp * 0.1, 0.8 + r() * 2.2, 0, 6.28); x.fill(); }
  return texOf(c, key);
}
// the face you see from inside: boards, darker and waxed, the rubbed brown of old church wood
function innerTexture() {
  const key = 'inner';
  if (TEX.has(key)) return TEX.get(key);
  const Wp = 512, Hp = 1024, c = cnv(Wp, Hp), x = c.getContext('2d'), r = mulberry32(5150);
  x.fillStyle = '#3a2618'; x.fillRect(0, 0, Wp, Hp);
  const nb = 8, bwp = Wp / nb;
  for (let i = 0; i < nb; i++) { const v = 0.82 + r() * 0.36; x.fillStyle = `rgb(${66 * v | 0},${44 * v | 0},${28 * v | 0})`; x.fillRect(i * bwp, 0, bwp, Hp); }
  grain(x, Wp, Hp, r, 'rgba(20,10,4,0.45)', 'rgba(140,100,70,0.18)', 900);
  for (let i = 1; i < nb; i++) { x.fillStyle = 'rgba(10,5,2,0.9)'; x.fillRect(i * bwp - 1, 0, 2.5, Hp); }
  const g = x.createLinearGradient(0, 0, Wp, 0); g.addColorStop(0, 'rgba(0,0,0,0.15)'); g.addColorStop(0.5, 'rgba(255,220,180,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
  x.fillStyle = g; x.fillRect(0, 0, Wp, Hp);
  return texOf(c, key);
}
// the padded leaves of the draught lobby: leather gone dark with hands, rows of brass tacks
function leatherTexture() {
  const key = 'leather';
  if (TEX.has(key)) return TEX.get(key);
  const Wp = 256, Hp = 512, c = cnv(Wp, Hp), x = c.getContext('2d'), r = mulberry32(808);
  x.fillStyle = '#4a1d16'; x.fillRect(0, 0, Wp, Hp);
  for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '20,6,4' : '120,60,45'},${0.05 + r() * 0.08})`; x.beginPath(); x.arc(r() * Wp, r() * Hp, 1 + r() * 3, 0, 6.28); x.fill(); }
  const g = x.createRadialGradient(Wp * 0.5, Hp * 0.45, 10, Wp * 0.5, Hp * 0.45, Hp * 0.6); g.addColorStop(0, 'rgba(255,200,170,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = g; x.fillRect(0, 0, Wp, Hp);
  // the buttoned diamonds of the padding
  x.strokeStyle = 'rgba(15,4,2,0.55)'; x.lineWidth = 2;
  for (let k = -8; k < 16; k++) { x.beginPath(); x.moveTo(k * 40, 0); x.lineTo(k * 40 + Hp * 0.6, Hp); x.stroke(); x.beginPath(); x.moveTo(k * 40 + Hp * 0.6, 0); x.lineTo(k * 40, Hp); x.stroke(); }
  return texOf(c, key);
}

const MATS = {};
function mats() {
  if (MATS.iron) return MATS;
  MATS.iron = new THREE.MeshStandardMaterial({ color: 0x2c2724, roughness: 0.62, metalness: 0.55 });
  MATS.inner = new THREE.MeshStandardMaterial({ color: 0xffffff, map: innerTexture(), roughness: 0.6 });
  MATS.brass = new THREE.MeshStandardMaterial({ color: 0xc89a48, roughness: 0.3, metalness: 0.85 });
  MATS.leather = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leatherTexture(), roughness: 0.55 });
  MATS.void = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x241b14, roughness: 1, side: THREE.BackSide });
  MATS.glow = new THREE.MeshStandardMaterial({ color: 0x2a1c10, emissive: 0xffb060, emissiveIntensity: 0.55, roughness: 0.4 });
  return MATS;
}

// ---------------------------------------------------------------- a double door of two round-headed leaves
// The group's origin: the middle of the threshold, on the floor, the leaves' street face looking at +z. They open
// inwards (towards -z): set(k) 0 = shut, 1 = wide open; one: only the right-hand leaf (as seen from the street).
export class ChurchDoor {
  constructor({ w = 2.6, spring = 3.7, style = 'cuarterones', cols = 3, t = 0.1, key = 'oeste', one = false, maxOpen = 1.42, flip = false } = {}) {
    const M = mats();
    this.w = w; this.spring = spring; this.crown = spring + w / 2; this.one = one; this.maxOpen = maxOpen;
    const L = layout({ w, spring, style, cols });
    this.layout = L;
    const outer = new THREE.MeshStandardMaterial({ color: 0xffffff, map: outerTexture(L, style, key + ':' + style + ':' + w.toFixed(2) + ':' + spring.toFixed(2)), roughness: style === 'cuarterones' ? 0.62 : 0.8 });
    this.mats = { outer, ...M };
    const uvf = (X, Y) => [(X + L.R) / L.W, Y / L.C];
    const h = t / 2;
    this.group = new THREE.Group();
    if (flip) this.group.rotation.y = Math.PI; // (seen from the other side: the inside face out)
    this.leaves = [];
    const r = mulberry32(key.length * 31 + 7);
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1, hx = -sg * L.R; // the hinge
      const fo = [], fi = [], fe = [];
      fo.push(slab(L.leaves[s], -h, h, uvf, { back: false, sides: false }));
      fi.push(slab(L.leaves[s], -h, h, uvf, { front: false }));
      // the street face: bars and raised panels, the cover strip on the meeting edge
      for (const b of L.bars[s]) (b.iron ? fe : fo).push(slab(b.p, h, h + b.d, uvf, { back: false }));
      for (const p of L.panels[s]) {
        fo.push(slab(p, h, h + 0.012, uvf, { back: false }));
        const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
        fo.push(slab(p.map(([X, Y]) => [cx + (X - cx) * 0.72, cy + (Y - cy) * 0.8]), h + 0.012, h + 0.02, uvf, { back: false }));
      }
      if (s === 1) fo.push(slab(rect(L.gap - 0.03, 0.02, L.gap + 0.05, L.S + Math.sqrt(L.R * L.R - 0.0025) - 0.02), h, h + 0.03, uvf, { back: false }));
      // nail heads: four-sided, like diamonds
      for (const [X, Y] of L.studs[s]) {
        const n = new THREE.ConeGeometry(style === 'cuarterones' ? 0.034 : 0.026, 0.03, 4, 1); n.rotateY(Math.PI / 4); n.rotateX(Math.PI / 2);
        fe.push(at(n, X, Y, h + (style === 'cuarterones' ? 0.026 : 0.008) + 0.015));
      }
      // the iron ring to knock with, on its rose; the keyhole plate on the right-hand leaf
      {
        const kx = -sg * 0.34, ky = 1.58, z0 = h + (style === 'cuarterones' ? 0.03 : 0.012);
        const rose = new THREE.CylinderGeometry(0.075, 0.08, 0.016, 12); rose.rotateX(Math.PI / 2); fe.push(at(rose, kx, ky, z0));
        const boss = new THREE.SphereGeometry(0.028, 8, 6); fe.push(at(boss, kx, ky, z0 + 0.018));
        const ring = new THREE.TorusGeometry(0.095, 0.012, 6, 18); ring.rotateX(-0.16); fe.push(at(ring, kx, ky - 0.1, z0 + 0.03));
        if (s === 1) { fe.push(at(new THREE.BoxGeometry(0.1, 0.22, 0.012), sg * -0.16, 1.12, z0)); }
      }
      // the inside face: battens and braces, strap hinges, the lock box, the bolts, a pull ring
      const zi = -h, bat = [0.32, 1.25, 2.2, Math.max(2.8, L.S - 0.45), L.S + L.R * 0.45];
      const lx0 = s ? L.gap + 0.02 : -L.R + 0.03, lx1 = s ? L.R - 0.03 : -L.gap - 0.02;
      const inner = [[-L.R + 0.02, 0], [-L.gap - 0.01, 0]];
      { const a0 = Math.acos(-L.gap / L.R); for (let i = 0; i <= 14; i++) { const a = a0 + (Math.PI - a0) * (i / 14); inner.push([Math.cos(a) * (L.R - 0.05), L.S + Math.sin(a) * (L.R - 0.05)]); } }
      const innerS = s ? inner.map(([X, Y]) => [-X, Y]).reverse() : inner;
      bat.forEach((y, i) => {
        const b = clip(rect(Math.min(lx0, lx1), y - 0.07, Math.max(lx0, lx1), y + 0.07), innerS);
        if (b.length > 2) fi.push(slab(b, zi - 0.035, zi, uvf, { back: true, front: false }));
        if (i < bat.length - 2) { // a brace up from this batten to the next, rising towards the hinge
          const y1 = bat[i + 1], xa = s ? lx1 - 0.08 : lx0 + 0.08, xb = s ? lx0 + 0.08 : lx1 - 0.08; // (low at the hinge, up to the free edge)
          const dx = xb - xa, dy = y1 - y - 0.14, L2 = Math.hypot(dx, dy), nx = -dy / L2 * 0.06, ny = dx / L2 * 0.06;
          const q = [[xa - nx, y + 0.07 - ny], [xb - nx, y1 - 0.07 - ny], [xb + nx, y1 - 0.07 + ny], [xa + nx, y + 0.07 + ny]];
          fi.push(slab(clip(area(q) > 0 ? q : q.reverse(), innerS), zi - 0.03, zi, uvf, { back: true, front: false }));
        }
        if (i % 2 === 0 || i === bat.length - 1) { // a strap hinge along it from the hinge side, ending in a point
          const x0 = s ? L.R - 0.02 : -L.R + 0.02, x1 = x0 + (s ? -1 : 1) * Math.min(0.95, L.R * 0.75);
          const st = [[x0, y - 0.035], [x1, y - 0.03], [x1 + (s ? -0.07 : 0.07), y], [x1, y + 0.03], [x0, y + 0.035]];
          const sp = slab(area(st) > 0 ? st : st.reverse(), zi - 0.045, zi - 0.035, uvf, { front: false });
          if (sp) fe.push(sp);
          for (let k = 0; k < 4; k++) fe.push(at(new THREE.SphereGeometry(0.014, 6, 4), x0 + (x1 - x0) * (0.15 + k * 0.25), y, zi - 0.048));
          // the hinge's knuckle
          const kn = new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8); fe.push(at(kn, x0 + (s ? 0.02 : -0.02), y, zi - 0.02));
        }
      });
      if (s === 1) { // the lock box and its key; the pull ring
        fe.push(at(new THREE.BoxGeometry(0.3, 0.2, 0.06), L.gap + 0.22, 1.12, zi - 0.045));
        fe.push(at(new THREE.BoxGeometry(0.02, 0.12, 0.012), L.gap + 0.22, 1.12, zi - 0.08));
        const key2 = new THREE.TorusGeometry(0.03, 0.007, 4, 10); fe.push(at(key2, L.gap + 0.22, 1.0, zi - 0.085));
      } else { // the bolts that hold the shut leaf, top and bottom
        fe.push(at(new THREE.BoxGeometry(0.035, 0.7, 0.035), -L.gap - 0.07, 0.42, zi - 0.03));
        fe.push(at(new THREE.BoxGeometry(0.035, 0.7, 0.035), -L.gap - 0.07, L.S + 0.1, zi - 0.03));
        fe.push(at(new THREE.BoxGeometry(0.06, 0.05, 0.05), -L.gap - 0.07, 0.75, zi - 0.03));
      }
      const tr = new THREE.TorusGeometry(0.07, 0.012, 6, 14); fe.push(at(tr, -sg * 0.3, 1.05, zi - 0.06));
      // into one pivot at the hinge (on the inside face, so the leaf turns inwards)
      const pivot = new THREE.Group();
      pivot.position.set(hx, 0, -h);
      for (const [list, mat] of [[fo, outer], [fi, M.inner], [fe, M.iron]]) {
        const g = merged(list);
        if (!g) continue;
        g.translate(-hx, 0, h);
        const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
        pivot.add(m);
      }
      this.group.add(pivot);
      this.leaves.push({ pivot, sign: sg, cur: 0, target: 0, v: 0, jitter: 0.9 + r() * 0.2 });
    }
    this.k = 0;
  }
  get open() { return this.leaves.reduce((a, l) => Math.max(a, l.cur), 0); }
  // how wide the way through is (m), for walking in
  // the clear way through, across the door (door x; + is the right-hand side seen from the street)
  clear() {
    const [l, r] = this.leaves, R = this.w / 2, c = (q) => Math.cos(clamp(q.cur, 0, 1) * this.maxOpen);
    return [l.cur < 0.04 ? 0 : -R + R * c(l) + 0.05, r.cur < 0.04 ? 0 : R - R * c(r) - 0.05];
  }
  set(k, now = false, one = this.one) {
    this.leaves.forEach((l, i) => {
      l.target = one && i === 0 ? 0 : k;
      if (now) { l.cur = l.target; l.v = 0; l.pivot.rotation.y = l.sign * l.cur * this.maxOpen; }
    });
  }
  // the leaves are heavy: they gather speed, glide, and come to rest. Returns 'open' as one starts to open, 'shut' when
  // the last one closes (for the sounds)
  update(dt) {
    let ev = null;
    for (const l of this.leaves) {
      const d = l.target - l.cur;
      if (Math.abs(d) < 1e-4 && Math.abs(l.v) < 1e-4) continue;
      if (l.cur < 0.01 && d > 0.05 && l.v === 0) ev = 'open';
      const vmax = 0.55 * l.jitter, acc = 1.1;
      const want = clamp(d * 2.2, -vmax, vmax);
      l.v += clamp(want - l.v, -acc * dt, acc * dt);
      const was = l.cur;
      l.cur += l.v * dt;
      if ((d > 0 && l.cur >= l.target) || (d < 0 && l.cur <= l.target)) { l.cur = l.target; l.v = 0; if (l.target === 0 && was > 0) ev = 'shut'; }
      l.pivot.rotation.y = l.sign * clamp(l.cur, 0, 1) * this.maxOpen;
    }
    return ev;
  }
}

// ---------------------------------------------------------------- granite round the doors (the street side)
// local frame as the door's: x across, y up, z out to the street (the facade's plane at z = 0)
function archRing(r0, r1, z0, z1, n = 24, a0 = 0, a1 = Math.PI) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: n });
  g.translate(0, 0, z0);
  return g;
}
const box = (w, h, d, x, y, z) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
// turned inside out: the faces and their normals look the other way
function inward(g) {
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}
// the opening's reveal: its jambs and the round soffit, from the facade (z = 0) back to z = -depth
function reveal(w, spring, depth) {
  const R = w / 2, out = [];
  for (const sx of [-1, 1]) { const p = new THREE.PlaneGeometry(depth, spring); p.rotateY(-sx * Math.PI / 2); out.push(at(p, sx * R, spring / 2, -depth / 2)); }
  const soffit = inward(new THREE.CylinderGeometry(R, R, depth, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)); // (seen from inside the tunnel)
  out.push(at(soffit, 0, spring, -depth / 2));
  return out;
}
function finial(x, y, z, h = 1.0, wb = 0.42) {
  const out = [box(wb, 0.28, wb, x, y + 0.14, z)];
  const py = new THREE.ConeGeometry(wb * 0.42, h, 4, 1); py.rotateY(Math.PI / 4); out.push(at(py, x, y + 0.28 + h / 2, z));
  out.push(at(new THREE.SphereGeometry(wb * 0.26, 10, 8), x, y + 0.28 + h + 0.06, z));
  return out;
}
function column(x, z, y0, h, r, fluted = false) {
  const sh = new THREE.CylinderGeometry(r * 0.88, r, h, fluted ? 40 : 16, fluted ? 6 : 1);
  if (fluted) { const p = sh.attributes.position; for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i); if (px * px + pz * pz < 1e-8) continue; const a = Math.atan2(pz, px), f = 1 - 0.09 * Math.max(0, Math.cos(a * 10)) ** 2; p.setXYZ(i, px * f, p.getY(i), pz * f); } sh.computeVertexNormals(); }
  const out = [at(sh, x, y0 + h / 2, z)];
  const base = new THREE.CylinderGeometry(r * 1.18, r * 1.25, 0.16, 16); out.push(at(base, x, y0 + 0.08, z));
  const tor = new THREE.TorusGeometry(r * 1.06, 0.05, 6, 16); tor.rotateX(Math.PI / 2); out.push(at(tor, x, y0 + 0.2, z));
  const ech = new THREE.CylinderGeometry(r * 1.25, r * 0.9, 0.18, 16); out.push(at(ech, x, y0 + h + 0.09, z));
  out.push(box(r * 2.7, 0.12, r * 2.7, x, y0 + h + 0.24, z));
  return out;
}
function pedestal(x, z, w, h, d) {
  return [box(w + 0.1, 0.18, d + 0.1, x, 0.09, z), box(w, h - 0.36, d, x, h / 2, z), box(w * 0.68, (h - 0.36) * 0.62, 0.04, x, h / 2, z + d / 2 + 0.02), box(w + 0.12, 0.18, d + 0.12, x, h - 0.09, z)];
}
// a shield of arms, carved (a pointed-bottomed escutcheon with a crown over it)
function shield(x, y, z, s = 0.6) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.5 * s, 0.6 * s); sh.lineTo(0.5 * s, 0.6 * s); sh.lineTo(0.5 * s, 0); sh.quadraticCurveTo(0.5 * s, -0.55 * s, 0, -0.75 * s); sh.quadraticCurveTo(-0.5 * s, -0.55 * s, -0.5 * s, 0); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 6 });
  const out = [at(g, x, y, z)];
  out.push(box(0.12 * s, 0.9 * s, 0.05, x, y - 0.05 * s, z + 0.17));
  out.push(box(0.7 * s, 0.1 * s, 0.05, x, y + 0.2 * s, z + 0.17));
  const crown = new THREE.CylinderGeometry(0.42 * s, 0.36 * s, 0.22 * s, 10, 1, true); out.push(at(crown, x, y + 0.78 * s, z + 0.06));
  for (let i = 0; i < 5; i++) out.push(at(new THREE.SphereGeometry(0.05 * s, 6, 4), x + (i - 2) * 0.18 * s, y + 0.93 * s, z + 0.06));
  return out;
}
// a niche: a shallow round-headed hollow with a shell at its head (empty, as the Gospel door's is today)
function niche(x, y, z, w, h) {
  const out = [], R = w / 2;
  const back = new THREE.Shape(); back.moveTo(-R, 0); back.lineTo(R, 0); back.lineTo(R, h - R); back.absarc(0, h - R, R, 0, Math.PI, false); back.closePath();
  out.push({ void: true, g: at(new THREE.ShapeGeometry(back, 12), x, y, z + 0.005) });
  for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI, rib = new THREE.BoxGeometry(0.04, R * 0.9, 0.04); rib.translate(0, R * 0.45, 0); rib.rotateZ(a - Math.PI / 2); out.push({ g: at(rib, x, y + h - R, z + 0.03) }); }
  out.push({ g: box(w + 0.36, 0.14, 0.3, x, y - 0.07, z + 0.12) });
  for (const sx of [-1, 1]) out.push({ g: box(0.16, h, 0.18, x + sx * (R + 0.08), y + h / 2, z + 0.08) });
  out.push({ g: archRing(R, R + 0.16, 0, 0.18, 16).translate(x, y + h - R, z) });
  return out;
}

// the portal at the foot, round the main door. Returns { group, door, steps (for the collider: circles), thr }
export function westPortal(stone, { w = 2.6, spring = 3.7, room = 2.6 } = {}) {
  const R = w / 2, C = spring + R, g = new THREE.Group(), parts = [], voids = [];
  // the reveal (the wall is deep: the door stands back in it), two shallow granite steps
  parts.push(...reveal(w, spring, 0.75));
  parts.push(box(w + 2.6, 0.05, 1.5, 0, 0.025, 0.75), box(w + 1.4, 0.05, 0.8, 0, 0.075, 0.4));
  // the archivolt: three mouldings round the arch and down the jambs, the keystone, the imposts
  for (const [r0, r1, d] of [[R, R + 0.12, 0.08], [R + 0.12, R + 0.34, 0.14], [R + 0.34, R + 0.44, 0.2]]) {
    parts.push(at(archRing(r0, r1, 0, d), 0, spring, 0));
    for (const sx of [-1, 1]) parts.push(box(r1 - r0, spring, d, sx * (r0 + r1) / 2, spring / 2, d / 2));
  }
  for (const sx of [-1, 1]) parts.push(box(0.58, 0.16, 0.26, sx * (R + 0.22), spring - 0.08, 0.13));
  parts.push(box(0.34, 0.5, 0.3, 0, C + 0.12, 0.15));
  // the two slender smooth columns on their decorated pedestals, standing out from the wall
  const cx = R + 0.78, cz = 0.5, ph = 1.45, ch = 4.15;
  for (const sx of [-1, 1]) { parts.push(...pedestal(sx * cx, cz, 0.68, ph, 0.68)); parts.push(...column(sx * cx, cz, ph, ch, 0.19)); parts.push(box(0.5, ph + ch + 0.3, 0.1, sx * cx, (ph + ch + 0.3) / 2, 0.05)); }
  // the entablature: architrave, frieze, cornice, broken forward over the columns
  const ye = ph + ch + 0.3, EW = 2 * cx + 0.9;
  parts.push(box(EW, 0.26, 0.36, 0, ye + 0.13, 0.18), box(EW, 0.32, 0.3, 0, ye + 0.42, 0.15), box(EW + 0.3, 0.22, 0.52, 0, ye + 0.69, 0.26));
  for (const sx of [-1, 1]) parts.push(box(0.68, 0.26, 0.5, sx * cx, ye + 0.13, cz), box(0.68, 0.32, 0.44, sx * cx, ye + 0.42, cz), box(0.92, 0.22, 0.7, sx * cx, ye + 0.69, cz + 0.04));
  // the pediment: its raking cornices, the coat of arms in the tympanum; three pinnacles
  const yp = ye + 0.8, PW = EW + 0.1, PH = 1.55;
  { const tri = new THREE.Shape(); tri.moveTo(-PW / 2 + 0.25, 0); tri.lineTo(PW / 2 - 0.25, 0); tri.lineTo(0, PH - 0.2); tri.closePath(); parts.push(at(new THREE.ExtrudeGeometry(tri, { depth: 0.18, bevelEnabled: false }), 0, yp, 0)); }
  const ang = Math.atan2(PH, PW / 2), len = Math.hypot(PW / 2, PH);
  for (const sx of [-1, 1]) { const rc = new THREE.BoxGeometry(len + 0.1, 0.2, 0.44); rc.rotateZ(sx * ang); parts.push(at(rc, sx * PW / 4, yp + PH / 2, 0.22)); }
  parts.push(...shield(0, yp + 0.55, 0.18, 0.62));
  for (const sx of [-1, 1]) parts.push(...finial(sx * cx, ye + 0.8, cz, 0.95));
  parts.push(...finial(0, yp + PH - 0.05, 0.2, 0.75, 0.34));
  const m = new THREE.Mesh(merged(parts), stone); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const door = new ChurchDoor({ w, spring, style: 'cuarterones', cols: 3, key: 'oeste' });
  door.group.position.set(0, 0.1, -0.6); g.add(door.group);
  g.add(vestibule(w, C, 0.65, clamp(room - 0.75, 1.4, 2.6)));
  return { group: g, door, posts: [[-cx, cz, 0.48], [cx, cz, 0.48]], depth: 0.65, w, spring };
}
// the portal of the Epistle side (the Mediodía), onto its open atrium: pairs of columns, smooth and fluted, on a high
// base, under a great cornice
export function southPortal(stone, { w = 2.3, spring = 3.3, room = 2.6 } = {}) {
  const R = w / 2, C = spring + R, g = new THREE.Group(), parts = [];
  parts.push(...reveal(w, spring, 0.7));
  parts.push(box(w + 3.6, 0.05, 1.3, 0, 0.025, 0.65), box(w + 1.2, 0.05, 0.7, 0, 0.075, 0.35));
  for (const [r0, r1, d] of [[R, R + 0.14, 0.1], [R + 0.14, R + 0.38, 0.16]]) { parts.push(at(archRing(r0, r1, 0, d), 0, spring, 0)); for (const sx of [-1, 1]) parts.push(box(r1 - r0, spring, d, sx * (r0 + r1) / 2, spring / 2, d / 2)); }
  for (const sx of [-1, 1]) parts.push(box(0.62, 0.16, 0.24, sx * (R + 0.2), spring - 0.08, 0.12));
  parts.push(box(0.36, 0.52, 0.3, 0, C + 0.15, 0.15));
  // the spandrels, sunk panels with a disc each
  for (const sx of [-1, 1]) parts.push(at(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14).rotateX(Math.PI / 2), sx * (R + 0.55), C - 0.1, 0.06));
  const ph = 1.75, ch = 3.9, pos = [R + 0.62, R + 1.32];
  for (const sx of [-1, 1]) {
    parts.push(...pedestal(sx * (pos[0] + pos[1]) / 2, 0.45, pos[1] - pos[0] + 0.66, ph, 0.66));
    parts.push(...column(sx * pos[0], 0.45, ph, ch, 0.2, false));
    parts.push(...column(sx * pos[1], 0.45, ph, ch, 0.2, true));
    parts.push(box(pos[1] - pos[0] + 0.7, ph + ch + 0.3, 0.1, sx * (pos[0] + pos[1]) / 2, (ph + ch + 0.3) / 2, 0.05));
  }
  const ye = ph + ch + 0.3, EW = 2 * pos[1] + 0.9;
  parts.push(box(EW, 0.28, 0.4, 0, ye + 0.14, 0.2), box(EW, 0.36, 0.34, 0, ye + 0.46, 0.17));
  for (const sx of [-1, 1]) parts.push(box(pos[1] - pos[0] + 0.72, 0.28, 0.5, sx * (pos[0] + pos[1]) / 2, ye + 0.14, 0.45), box(pos[1] - pos[0] + 0.72, 0.36, 0.44, sx * (pos[0] + pos[1]) / 2, ye + 0.46, 0.45));
  // the great cornice, its dentils, and a balled pinnacle over each pair and in the middle
  parts.push(box(EW + 0.6, 0.16, 0.8, 0, ye + 0.72, 0.42), box(EW + 0.9, 0.24, 1.05, 0, ye + 0.92, 0.5));
  for (let i = 0; i < 26; i++) parts.push(box(0.09, 0.1, 0.12, -EW / 2 + 0.15 + i * (EW - 0.3) / 25, ye + 0.6, 0.86));
  for (const sx of [-1, 1]) parts.push(...finial(sx * (pos[0] + pos[1]) / 2, ye + 1.04, 0.45, 0.8, 0.4));
  parts.push(...finial(0, ye + 1.04, 0.3, 1.0, 0.44));
  const m = new THREE.Mesh(merged(parts), stone); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const door = new ChurchDoor({ w, spring, style: 'clavos', key: 'sur', one: true });
  door.group.position.set(0, 0.1, -0.55); g.add(door.group);
  g.add(vestibule(w, C, 0.6, clamp(room - 0.7, 1.3, 2.4)));
  return { group: g, door, posts: [[-(pos[0] + pos[1]) / 2, 0.45, 0.85], [(pos[0] + pos[1]) / 2, 0.45, 0.85]], depth: 0.6, w, spring };
}
// the Gospel door: its round arch of coffered voussoirs with buttons, the alfiz round it, the empty niche above. Shut.
export function northPortal(stone, { w = 2.2, spring = 3.2 } = {}) {
  const R = w / 2, C = spring + R, g = new THREE.Group(), parts = [], voids = [];
  parts.push(...reveal(w, spring, 0.5));
  // the voussoirs: thirteen, each sunk in a coffer with a button in it
  const n = 13, r0 = R, r1 = R + 0.5;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI, am = (a0 + a1) / 2;
    parts.push(at(archRing(r0, r1, 0, 0.12, 3, a0 + 0.012, a1 - 0.012), 0, spring, 0));
    parts.push(at(archRing(r0 + 0.08, r1 - 0.08, 0.12, 0.15, 3, a0 + 0.05, a1 - 0.05), 0, spring, 0));
    parts.push(at(new THREE.SphereGeometry(0.06, 8, 6), Math.cos(am) * (r0 + r1) / 2, spring + Math.sin(am) * (r0 + r1) / 2, 0.2));
    const ia = am, ib = new THREE.SphereGeometry(0.045, 6, 5); parts.push(at(ib, Math.cos(ia) * (R + 0.02), spring + Math.sin(ia) * (R + 0.02), -0.25)); // (the buttons on the soffit)
  }
  for (const sx of [-1, 1]) { parts.push(box(0.5, spring, 0.12, sx * (R + 0.25), spring / 2, 0.06)); for (let k = 0; k < 4; k++) parts.push(box(0.36, 0.1, 0.05, sx * (R + 0.25), 0.5 + k * 0.8, 0.145)); }
  // the alfiz: a square frame of mouldings round the arch
  const AW = 2 * r1 + 0.5, AT = C + 0.62;
  for (const sx of [-1, 1]) parts.push(box(0.18, AT - spring + 0.4, 0.2, sx * AW / 2, spring - 0.2 + (AT - spring + 0.4) / 2, 0.1));
  parts.push(box(AW + 0.18, 0.2, 0.22, 0, AT, 0.11));
  // the niche over it (empty)
  for (const q of niche(0, AT + 0.35, 0, 0.9, 1.6)) (q.void ? voids : parts).push(q.g);
  parts.push(box(1.7, 0.18, 0.36, 0, AT + 0.35 + 1.75, 0.16));
  const m = new THREE.Mesh(merged(parts), stone); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const vm = new THREE.Mesh(merged(voids), mats().void); g.add(vm);
  const door = new ChurchDoor({ w, spring, style: 'clavos', key: 'norte' });
  door.group.position.set(0, 0.04, -0.4); g.add(door.group);
  return { group: g, door, posts: [], depth: 0.4, w, spring };
}
// behind the open door: the dark of the church, the wooden lobby facing you with candlelight in its little windows
function vestibule(w, crown, z0, depth, y0 = 0.1) {
  const M = mats(), g = new THREE.Group();
  const W = w + 0.7, H = crown + 0.3;
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, depth), M.dark);
  room.position.set(0, y0 + H / 2, -z0 - depth / 2);
  room.receiveShadow = true;
  g.add(room);
  if (!M.floor) M.floor = new THREE.MeshStandardMaterial({ color: 0x3a342e, roughness: 0.9 });
  const fl = new THREE.Mesh(new THREE.BoxGeometry(W, y0, depth + z0 + 0.05), M.floor); fl.position.set(0, y0 / 2, -(depth + z0) / 2 + 0.02); fl.receiveShadow = true; g.add(fl);
  const lobby = cancelFront(Math.min(W - 0.2, 3.4), 3.2, true);
  lobby.group.position.set(0, y0, -z0 - depth + 0.06);
  g.add(lobby.group);
  return g;
}

// ---------------------------------------------------------------- the draught lobby («cancel»): a front of framed
// panels in dark wood with a pair of padded swing leaves (brass tacks, a little glazed window each). Its origin: the
// middle of its front on the floor, the front looking at +z; the leaves swing both ways.
export function cancelFront(w, h, glow = false, wood = null) {
  const M = mats(), g = new THREE.Group(), fr = [], gl = [];
  const lw = 0.72, dw = 2 * lw + 0.04, dh = 2.35;
  const woodM = wood || M.inner;
  // the frame: posts, the head, the panels either side, a cornice
  for (const sx of [-1, 1]) {
    const pw = (w - dw) / 2, px = sx * (dw / 2 + pw / 2);
    fr.push(box(pw, h, 0.08, px, h / 2, 0));
    fr.push(box(pw - 0.16, h * 0.32, 0.03, px, h * 0.22, 0.05), box(pw - 0.16, h * 0.4, 0.03, px, h * 0.66, 0.05));
    fr.push(box(0.12, h, 0.14, sx * dw / 2, h / 2, 0.02));
  }
  fr.push(box(dw, h - dh, 0.08, 0, dh + (h - dh) / 2, 0), box(w + 0.16, 0.14, 0.24, 0, h + 0.07, 0.04), box(w + 0.06, 0.08, 0.18, 0, h - 0.04, 0.03));
  // a fanlight of glass over the leaves (the glow behind)
  gl.push(box(dw - 0.3, (h - dh) * 0.55, 0.02, 0, dh + (h - dh) * 0.5, 0.045));
  const fm = new THREE.Mesh(merged(fr), woodM); fm.castShadow = true; fm.receiveShadow = true; g.add(fm);
  const gm = new THREE.Mesh(merged(gl), glow ? M.glow : new THREE.MeshStandardMaterial({ color: 0x8a7a60, emissive: 0x3a2814, emissiveIntensity: 0.6, roughness: 0.2 })); g.add(gm);
  // the leaves
  const leaves = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * dw / 2 - sx * 0.02, 0, 0.0);
    const lp = [], lb = [], lg = [];
    const cxL = -sx * lw / 2;
    lp.push(box(lw, dh - 0.04, 0.07, cxL, (dh - 0.04) / 2 + 0.02, 0));
    lb.push(box(lw - 0.1, 0.06, 0.09, cxL, 0.12, 0));
    for (let i = 0; i < 5; i++) for (let j = 0; j < 9; j++) { if ((i + j) % 2) continue; const tx = cxL - lw / 2 + 0.1 + i * (lw - 0.2) / 4, ty = 0.3 + j * 0.2; if (ty > 1.45 && ty < 1.95) continue; for (const zz of [0.04, -0.04]) lb.push(at(new THREE.SphereGeometry(0.012, 5, 4), tx, ty, zz)); }
    lg.push(box(0.26, 0.4, 0.075, cxL, 1.7, 0));
    lb.push(box(0.36, 0.05, 0.085, cxL, 1.92, 0), box(0.36, 0.05, 0.085, cxL, 1.48, 0));
    const lm = new THREE.Mesh(merged(lp), M.leather), bm = new THREE.Mesh(merged(lb), M.brass), gm2 = new THREE.Mesh(merged(lg), glow ? M.glow : gm.material);
    for (const q of [lm, bm, gm2]) { q.castShadow = true; q.receiveShadow = true; pivot.add(q); }
    g.add(pivot);
    leaves.push({ pivot, sign: sx, cur: 0, target: 0, v: 0 });
  }
  return {
    group: g, leaves, w: dw,
    // k in [-1, 1]: which way they swing (+ into the lobby, away from +z)
    set(k, now = false) { for (const l of leaves) { l.target = k; if (now) { l.cur = k; l.v = 0; l.pivot.rotation.y = -l.sign * k * 1.3; } } },
    update(dt) {
      let ev = null;
      for (const l of leaves) {
        const d = l.target - l.cur;
        if (Math.abs(d) < 1e-4 && Math.abs(l.v) < 1e-3) continue;
        l.v += (d * 26 - l.v * 7.5) * dt; // a sprung swing door: it overshoots a little and settles
        const was = l.cur; l.cur += l.v * dt;
        if (l.target === 0 && Math.sign(was) !== Math.sign(l.cur) && Math.abs(l.v) > 0.4) ev = 'flap';
        l.pivot.rotation.y = -l.sign * l.cur * 1.3;
      }
      return ev;
    },
  };
}
// the whole lobby inside a door: its front (above), its framed sides and its lid. Origin: the middle of the door wall
// on the floor; the lobby stands out d metres along +z (into the church). segs: its walls, for the collider (local
// [ax, az, bx, bz])
export function cancelLobby(w, d, h) {
  const M = mats(), g = new THREE.Group(), parts = [];
  for (const sx of [-1, 1]) {
    parts.push(box(0.08, h, d, sx * (w / 2 - 0.04), h / 2, d / 2));
    for (const [py, ph] of [[h * 0.22, h * 0.32], [h * 0.66, h * 0.4]]) parts.push(box(0.03, ph, d - 0.34, sx * (w / 2 + 0.012), py, d / 2), box(0.02, ph - 0.12, d - 0.5, sx * (w / 2 + 0.03), py, d / 2));
    parts.push(box(0.1, h, 0.12, sx * (w / 2 - 0.02), h / 2, d - 0.04));
  }
  parts.push(box(w + 0.06, 0.06, d, 0, h - 0.03, d / 2));
  parts.push(box(w + 0.22, 0.16, d + 0.12, 0, h + 0.08, d / 2 + 0.03), box(w + 0.1, 0.06, d + 0.04, 0, h + 0.19, d / 2));
  const m = new THREE.Mesh(merged(parts), M.inner); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const front = cancelFront(w, h, false);
  front.group.position.z = d; g.add(front.group);
  const dw = front.w;
  return {
    group: g, front, w, d, h,
    // (the swing leaves' gap closed too: you push them, you do not walk through — and the camera stays out)
    segs: [[-w / 2, 0, -w / 2, d], [w / 2, 0, w / 2, d], [-w / 2, d, w / 2, d]],
  };
}
// for the inside: a stretch of wall (W wide, H tall, between z0 and z1) with a round-headed doorway in its middle, and
// the doorway's reveal through the wall's depth
export function doorwayWall(W, H, w, spring, z0, z1, tile = 1.6) {
  const R = w / 2, poly = [[-W / 2, 0], [-R, 0], [-R, spring]];
  for (let i = 1; i < 24; i++) { const a = Math.PI - (i / 24) * Math.PI; poly.push([Math.cos(a) * R, spring + Math.sin(a) * R]); }
  poly.push([R, spring], [R, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]);
  return slab(poly, z0, z1, (x, y) => [x / tile, y / tile]);
}
export function revealGeo(w, spring, depth) { return merged(reveal(w, spring, depth)); }
