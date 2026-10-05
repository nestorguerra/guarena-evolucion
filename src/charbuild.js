// Character mesh builder: bodies, heads, hands, clothes and hair are modelled as signed distance fields
// (smooth-blended primitives, layer by layer) and polygonised with surface nets. Output is plain typed
// arrays (positions, normals, skin weights, regions, AO) so it can run inside a Web Worker.
// Everything lives inside charBuilderMain() so its source text can be shipped to a worker as-is. Heads come from the
// MakeHuman base mesh (mhdata.js, handed in as mhLib, the same way) once the factory has sent its data.
export function charBuilderMain(mhLib) {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- noise (value noise, 3D)
  const hash3 = (x, y, z) => {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
    const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
    const x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (f - e) * fx, x4 = g + (h - g) * fx;
    const y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
    return (y1 + (y2 - y1) * fz) * 2 - 1;
  }

  // ---------------------------------------------------------------- vectors & rotations (plain arrays)
  const v3 = (x, y, z) => [x, y, z];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  // 3x3 matrices, row-major [m00 m01 m02 m10 ...]; mulM(m, v) = m·v
  const mulM = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const mulMM = (a, b) => {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  };
  const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const IDM = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // rotation whose local y axis points along dir (used to align ellipsoids/boxes with limbs)
  function alignY(dir) {
    const y = nrm(dir);
    const ref = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const x = nrm(cross(y, ref)), z = cross(x, y);
    // columns = local axes in world → world-from-local; we store local-from-world (its transpose)
    return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  }

  // ---------------------------------------------------------------- primitives
  // t: 0 sphere, 1 ellipsoid, 2 round cone, 3 round box, 4 plane, 5 torus
  // m: local-from-world rotation (row-major) or null; bound: [cx, cy, cz, r]
  function P_sphere(c, r) { return { t: 0, c, r, bound: [c[0], c[1], c[2], r] }; }
  function P_ell(c, rad, m = null) { return { t: 1, c, rx: rad[0], ry: rad[1], rz: rad[2], m, bound: [c[0], c[1], c[2], Math.max(rad[0], rad[1], rad[2])] }; }
  function P_cone(a, b, ra, rb) {
    const ba = sub(b, a), l2 = dot(ba, ba), rr = ra - rb;
    const mid = lerp3(a, b, 0.5);
    return { t: 2, a, ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, ra, rb, bound: [mid[0], mid[1], mid[2], Math.sqrt(l2) / 2 + Math.max(ra, rb)] };
  }
  function P_box(c, half, round = 0, m = null) { return { t: 3, c, hx: half[0] - round, hy: half[1] - round, hz: half[2] - round, rd: round, m, bound: [c[0], c[1], c[2], Math.hypot(half[0], half[1], half[2])] }; }
  function P_plane(n, p0) { const nn = nrm(n); return { t: 4, n: nn, d0: dot(nn, p0), bound: null }; }
  function P_torus(c, R, r, m = null) { return { t: 5, c, R, r, m, bound: [c[0], c[1], c[2], R + r] }; }

  function primDist(p, x, y, z) {
    switch (p.t) {
      case 0: return Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r;
      case 1: {
        let qx = x - p.c[0], qy = y - p.c[1], qz = z - p.c[2];
        const m = p.m;
        if (m) { const a = m[0] * qx + m[1] * qy + m[2] * qz, b = m[3] * qx + m[4] * qy + m[5] * qz, c = m[6] * qx + m[7] * qy + m[8] * qz; qx = a; qy = b; qz = c; }
        const ax = qx / p.rx, ay = qy / p.ry, az = qz / p.rz;
        const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
        const bx = ax / p.rx, by = ay / p.ry, bz = az / p.rz;
        const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
        if (k1 < 1e-12) return -Math.min(p.rx, p.ry, p.rz);
        return (k0 * (k0 - 1)) / k1;
      }
      case 2: {
        const pax = x - p.a[0], pay = y - p.a[1], paz = z - p.a[2];
        const bax = p.ba[0], bay = p.ba[1], baz = p.ba[2];
        const l2 = p.l2, yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
        const xvx = pax * l2 - bax * yy, xvy = pay * l2 - bay * yy, xvz = paz * l2 - baz * yy;
        const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
        const y2 = yy * yy * l2, z2 = zz * zz * l2;
        const rr = p.rr, a2 = p.a2, il2 = p.il2;
        const k = Math.sign(rr) * rr * rr * x2;
        if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
        if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
        return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.ra;
      }
      case 3: {
        let qx = x - p.c[0], qy = y - p.c[1], qz = z - p.c[2];
        const m = p.m;
        if (m) { const a = m[0] * qx + m[1] * qy + m[2] * qz, b = m[3] * qx + m[4] * qy + m[5] * qz, c = m[6] * qx + m[7] * qy + m[8] * qz; qx = a; qy = b; qz = c; }
        qx = Math.abs(qx) - p.hx; qy = Math.abs(qy) - p.hy; qz = Math.abs(qz) - p.hz;
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
        return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.rd;
      }
      case 4: return p.n[0] * x + p.n[1] * y + p.n[2] * z - p.d0;
      case 5: {
        let qx = x - p.c[0], qy = y - p.c[1], qz = z - p.c[2];
        const m = p.m;
        if (m) { const a = m[0] * qx + m[1] * qy + m[2] * qz, b = m[3] * qx + m[4] * qy + m[5] * qz, c = m[6] * qx + m[7] * qy + m[8] * qz; qx = a; qy = b; qz = c; }
        const q = Math.hypot(qx, qz) - p.R;
        return Math.hypot(q, qy) - p.r;
      }
    }
    return 1e9;
  }
  // hair locks: value noise stretched along the flow (out from the crown and down), periodic round the head.
  // k = [amplitude, frequency round the head, frequency along the flow, crown x, y, z]
  function lockNoise(k, x, y, z) {
    const dx = x - k[3], dy = y - k[4], dz = z - k[5];
    const rh = Math.hypot(dx, dz) || 1e-6, rad = rh + Math.max(0, -dy) * 0.9;
    return k[0] * noise3((dx / rh) * k[1] + 17.3, (dz / rh) * k[1] - 5.1, rad * k[2]);
  }
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

  // ---------------------------------------------------------------- layers (ordered CSG op lists)
  // op: { p: prim, op: 0 add | 1 sub | 2 intersect, k: blend, inf: inflate, bone, reg, clip: [nx,ny,nz,d] (local cut), nz: noise amp, nf: noise freq }
  class Layer {
    constructor(name, h, opts = {}) {
      this.name = name; this.h = h; this.ops = []; this.order = opts.order || 0;
      this.face = !!opts.face; this.box = opts.box || null; this.weightFn = opts.weightFn || null;
      this.tau = opts.tau || 0.009; this.cullInside = opts.cullInside !== false;
    }
    add(p, o = {}) { return this._op(p, 0, o); }
    sub(p, o = {}) { return this._op(p, 1, o); }
    int(p, o = {}) { return this._op(p, 2, o); }
    _op(p, op, o) {
      const e = { p, op, k: o.k || 0, inf: o.inf || 0, bone: o.bone || 'hips', reg: o.reg ?? -1, clip: o.clip || null, nz: o.nz || 0, nf: o.nf || 1, w: o.w ?? 1, lk: o.lk || null, tp: o.tp || null, tp2: o.tp2 || null };
      if (p.bound) {
        const b = p.bound;
        e.bound = [b[0], b[1], b[2], b[3] + Math.abs(e.inf) + e.k + Math.abs(e.nz) + (e.lk ? Math.abs(e.lk[0]) : 0) + 0.002];
      } else e.bound = null;
      this.ops.push(e);
      return e;
    }
    bounds() {
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const e of this.ops) {
        if (e.op !== 0 || !e.bound) continue;
        const b = e.bound;
        for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], b[i] - b[3]); mx[i] = Math.max(mx[i], b[i] + b[3]); }
      }
      if (this.box) for (let i = 0; i < 3; i++) { mn[i] = Math.max(mn[i], this.box[0][i]); mx[i] = Math.min(mx[i], this.box[1][i]); }
      return [mn, mx];
    }
    // ops whose influence sphere touches the sphere (x,y,z,r); intersect ops without bounds always count
    cull(x, y, z, r, out) {
      let n = 0;
      const ops = this.ops;
      for (let i = 0; i < ops.length; i++) {
        const b = ops[i].bound;
        if (!b) { out[n++] = i; continue; }
        const dx = b[0] - x, dy = b[1] - y, dz = b[2] - z, rr = b[3] + r;
        if (dx * dx + dy * dy + dz * dz < rr * rr) out[n++] = i;
      }
      return n;
    }
    opDist(e, x, y, z) {
      let inf = e.inf;
      if (e.tp) { const t = clamp(-(e.tp[0] * x + e.tp[1] * y + e.tp[2] * z - e.tp[3]) / e.tp[4], 0, 1); inf *= t * t * (3 - 2 * t); }
      if (e.tp2) { const q = e.tp2, t = clamp(-(q[0] * x + q[1] * y + q[2] * z - q[3]) / q[4], 0, 1); inf *= q[5] + (1 - q[5]) * t * t * (3 - 2 * t); }
      let d = primDist(e.p, x, y, z) - inf;
      if (e.clip) { const c = e.clip; d = smax(d, c[0] * x + c[1] * y + c[2] * z - c[3], 0.007); }
      if (e.nz) d += e.nz * noise3(x * e.nf, y * e.nf, z * e.nf);
      if (e.lk) d += lockNoise(e.lk, x, y, z);
      return d;
    }
    // groups: group() starts a sub-accumulator, end(k) folds it back (smooth union with k, hard if 0)
    group() { this.ops.push({ op: 3, bound: null }); }
    end(k = 0, sub = false) { this.ops.push({ op: 4, k, sub, bound: null }); } // sub: carve the group out of what came before
    evalList(list, n, x, y, z) {
      const st = this._st || (this._st = new Float64Array(12));
      let sp = 0;
      st[0] = 1e9;
      const ops = this.ops;
      for (let i = 0; i < n; i++) {
        const e = ops[list[i]];
        const op = e.op;
        if (op === 3) { st[++sp] = 1e9; continue; }
        if (op === 4) {
          const v = st[sp--]; const d = st[sp];
          st[sp] = e.sub ? (e.k > 0 ? smax(d, -v, e.k) : (-v > d ? -v : d)) : e.k > 0 ? smin(d, v, e.k) : (v < d ? v : d);
          continue;
        }
        const di = this.opDist(e, x, y, z);
        const d = st[sp];
        if (op === 0) st[sp] = e.k > 0 ? smin(d, di, e.k) : (di < d ? di : d);
        else if (op === 1) st[sp] = e.k > 0 ? smax(d, -di, e.k) : (-di > d ? -di : d);
        else st[sp] = e.k > 0 ? smax(d, di, e.k) : (di > d ? di : d);
      }
      return st[0];
    }
    // spatial hash of op lists for fast point queries (AO, hidden-surface tests)
    buildHash(cell) {
      const [mn, mx] = this.bounds();
      const m = 0.06;
      this.hmn = [mn[0] - m, mn[1] - m, mn[2] - m];
      this.hc = cell;
      this.hn = [0, 1, 2].map((i) => Math.max(1, Math.ceil((mx[i] - mn[i] + 2 * m) / cell)));
      const [nx, ny, nz] = this.hn;
      this.hl = new Array(nx * ny * nz);
      const tmp = new Int32Array(this.ops.length + 1);
      const r = cell * 0.8660254 + 0.01;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const n = this.cull(this.hmn[0] + (i + 0.5) * cell, this.hmn[1] + (j + 0.5) * cell, this.hmn[2] + (k + 0.5) * cell, r, tmp);
        this.hl[i + nx * (j + ny * k)] = tmp.slice(0, n);
      }
      this.hmx = [this.hmn[0] + nx * cell, this.hmn[1] + ny * cell, this.hmn[2] + nz * cell];
    }
    evalFast(x, y, z) {
      if (x < this.hmn[0] || y < this.hmn[1] || z < this.hmn[2] || x >= this.hmx[0] || y >= this.hmx[1] || z >= this.hmx[2]) return 1;
      const c = this.hc, [nx, ny] = this.hn;
      const l = this.hl[Math.floor((x - this.hmn[0]) / c) + nx * (Math.floor((y - this.hmn[1]) / c) + ny * Math.floor((z - this.hmn[2]) / c))];
      return this.evalList(l, l.length, x, y, z);
    }
    // full evaluation at a point (culls with a small sphere)
    evalAt(x, y, z, tmp) {
      const n = this.cull(x, y, z, 0.004, tmp);
      return this.evalList(tmp, n, x, y, z);
    }
  }

  // ---------------------------------------------------------------- growable typed arrays
  class FArr { constructor(n = 1024) { this.a = new Float32Array(n); this.n = 0; }
    push3(x, y, z) { if (this.n + 3 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
    push(x) { if (this.n + 1 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; }
    out() { return this.a.slice(0, this.n); } }
  class IArr { constructor(n = 1024) { this.a = new Uint32Array(n); this.n = 0; }
    push3(x, y, z) { if (this.n + 3 > this.a.length) { const b = new Uint32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
    out() { return this.a.slice(0, this.n); } }

  // ---------------------------------------------------------------- surface nets polygoniser (sparse, block-culled)
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  function polygonize(L, h) {
    const [mn, mx] = L.bounds();
    if (!(mx[0] > mn[0])) return null;
    const pad = 2 * h;
    const ox = mn[0] - pad, oy = mn[1] - pad, oz = mn[2] - pad;
    const nx = Math.ceil((mx[0] - mn[0] + 2 * pad) / h) + 2, ny = Math.ceil((mx[1] - mn[1] + 2 * pad) / h) + 2, nz = Math.ceil((mx[2] - mn[2] + 2 * pad) / h) + 2;
    const B = 4;
    const nbx = Math.ceil((nx - 1) / B), nby = Math.ceil((ny - 1) / B), nbz = Math.ceil((nz - 1) / B);
    const S = new Float32Array(nx * ny * nz).fill(NaN);
    const tmp = new Int32Array(L.ops.length + 1);
    const lists = new Map();
    const rad = B * h * 0.8660254;
    const active = [];
    for (let bz = 0; bz < nbz; bz++) for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
      const cx = ox + (bx * B + B / 2) * h, cy = oy + (by * B + B / 2) * h, cz = oz + (bz * B + B / 2) * h;
      const n = L.cull(cx, cy, cz, rad + 2.5 * h, tmp);
      if (!n) continue;
      const list = tmp.slice(0, n);
      const d = L.evalList(list, n, cx, cy, cz);
      if (Math.abs(d) > rad * 1.35 + h) continue;
      const bi = bx + nbx * (by + nby * bz);
      lists.set(bi, list);
      active.push(bi);
      const i0 = bx * B, j0 = by * B, k0 = bz * B;
      const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
        let si = i0 + nx * (j + ny * k);
        for (let i = i0; i <= i1; i++, si++) {
          if (S[si] === S[si]) continue;
          S[si] = L.evalList(list, n, ox + i * h, oy + j * h, oz + k * h);
        }
      }
    }
    // vertices: one per cell with a sign change (average of edge crossings)
    const cellV = new Int32Array(nx * ny * nz).fill(-1);
    const P = new FArr(4096), cells = [], vlist = [];
    const c = new Float32Array(8);
    const sx = 1, sy = nx, sz = nx * ny;
    for (const bi of active) {
      const bx = bi % nbx, by = Math.floor(bi / nbx) % nby, bz = Math.floor(bi / (nbx * nby));
      const i0 = bx * B, j0 = by * B, k0 = bz * B;
      const i1 = Math.min(i0 + B, nx - 1), j1 = Math.min(j0 + B, ny - 1), k1 = Math.min(k0 + B, nz - 1);
      const list = lists.get(bi);
      for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const s0 = i + nx * (j + ny * k);
        c[0] = S[s0]; c[1] = S[s0 + sx]; c[2] = S[s0 + sy]; c[3] = S[s0 + sx + sy];
        c[4] = S[s0 + sz]; c[5] = S[s0 + sx + sz]; c[6] = S[s0 + sy + sz]; c[7] = S[s0 + sx + sy + sz];
        let mask = 0, bad = false;
        for (let q = 0; q < 8; q++) { if (c[q] !== c[q]) { bad = true; break; } if (c[q] < 0) mask |= 1 << q; }
        if (bad || mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e], b = EDGES[e + 1];
          const da = c[a], db = c[b];
          if ((da < 0) === (db < 0)) continue;
          const t = da / (da - db);
          const axq = a & 1, ayq = (a >> 1) & 1, azq = (a >> 2) & 1, bxq = b & 1, byq = (b >> 1) & 1, bzq = (b >> 2) & 1;
          ax += axq + (bxq - axq) * t; ay += ayq + (byq - ayq) * t; az += azq + (bzq - azq) * t; cnt++;
        }
        cellV[s0] = P.n / 3;
        P.push3(ox + (i + ax / cnt) * h, oy + (j + ay / cnt) * h, oz + (k + az / cnt) * h);
        cells.push(s0);
        vlist.push(list);
      }
    }
    const nv = P.n / 3;
    if (!nv) return null;
    // quads around every sign-changing grid edge
    const I = new IArr(nv * 6);
    const pos = P.a;
    const quad = (a, b, cc, d) => {
      if (a < 0 || b < 0 || cc < 0 || d < 0) return;
      const d1 = (pos[a * 3] - pos[cc * 3]) ** 2 + (pos[a * 3 + 1] - pos[cc * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[cc * 3 + 2]) ** 2;
      const d2 = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
      if (d1 < d2) { I.push3(a, b, cc); I.push3(a, cc, d); } else { I.push3(a, b, d); I.push3(b, cc, d); }
    };
    for (let v = 0; v < nv; v++) {
      const s0 = cells[v];
      const i = s0 % nx, j = Math.floor(s0 / nx) % ny, k = Math.floor(s0 / sz);
      const d0 = S[s0];
      const inside = d0 < 0;
      if (j > 0 && k > 0 && i < nx - 1) { const d1 = S[s0 + sx]; if (d1 === d1 && (d1 < 0) !== inside) {
        const A = cellV[s0], Bc = cellV[s0 - sy], C = cellV[s0 - sy - sz], D = cellV[s0 - sz];
        if (inside) quad(A, Bc, C, D); else quad(A, D, C, Bc); } }
      if (i > 0 && k > 0 && j < ny - 1) { const d1 = S[s0 + sy]; if (d1 === d1 && (d1 < 0) !== inside) {
        const A = cellV[s0], Bc = cellV[s0 - sx], C = cellV[s0 - sx - sz], D = cellV[s0 - sz];
        if (inside) quad(A, D, C, Bc); else quad(A, Bc, C, D); } }
      if (i > 0 && j > 0 && k < nz - 1) { const d1 = S[s0 + sz]; if (d1 === d1 && (d1 < 0) !== inside) {
        const A = cellV[s0], Bc = cellV[s0 - sx], C = cellV[s0 - sx - sy], D = cellV[s0 - sy];
        if (inside) quad(A, Bc, C, D); else quad(A, D, C, Bc); } }
    }
    // project vertices onto the surface (two Newton steps with tetrahedral gradients) and take SDF normals
    const N = new Float32Array(nv * 3);
    const e = h * 0.2;
    for (let v = 0; v < nv; v++) {
      const list = vlist[v], n = list.length;
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let gx = 0, gy = 0, gz = 0;
      for (let it = 0; it < 2; it++) {
        const f1 = L.evalList(list, n, x + e, y - e, z - e), f2 = L.evalList(list, n, x - e, y - e, z + e);
        const f3 = L.evalList(list, n, x - e, y + e, z - e), f4 = L.evalList(list, n, x + e, y + e, z + e);
        gx = f1 - f2 - f3 + f4; gy = -f1 - f2 + f3 + f4; gz = -f1 + f2 - f3 + f4;
        const d = (f1 + f2 + f3 + f4) * 0.25;
        const gl = Math.hypot(gx, gy, gz) || 1e-9;
        gx /= gl; gy /= gl; gz /= gl;
        const step = clamp(d, -0.6 * h, 0.6 * h);
        x -= gx * step; y -= gy * step; z -= gz * step;
      }
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
    }
    return { pos: pos.slice(0, nv * 3), nrm: N, idx: I.out(), nv, vlist };
  }

  // ---------------------------------------------------------------- regions (colour slots) & shading classes
  const REG = { skin: 0, top: 1, topTrim: 2, bottom: 3, bottomTrim: 4, belt: 5, metal: 6, shoe: 7, sole: 8, lace: 9, shoeAccent: 10,
    hair: 11, hairTie: 12, eyeWhite: 13, iris: 14, pupil: 15, lash: 16, cap: 17, capBrim: 18, lens: 19, frame: 20, bag: 21, bagTrim: 22,
    cane: 23, under: 24, mouth: 25, face: 26, beard: 27, sock: 28, lid: 29, button: 30, nail: 31, lashF: 32 };
  const MAT = { skin: 0, faceM: 1, faceF: 2, cotton: 3, knit: 4, denim: 5, twill: 6, leather: 7, rubber: 8, canvas: 9, hair: 10, eye: 11, gloss: 12, metal: 13, nylon: 14, lid: 15, lash: 16 };

  // ---------------------------------------------------------------- skeleton (rest offsets for a 1.78 m reference, arms hanging down)
  // 41 bones: the collarbones carry the arms (shrugs, reaching), the fingers bend at two joints and the thumb at two,
  // the feet roll over the toes, and the face has brows and mouth corners for expressions. [name, parent, offset, scale]
  const BONES = [
    ['root', null, [0, 0, 0]], ['hips', 'root', [0, 0.98, 0]], ['spine', 'hips', [0, 0.1, 0]], ['chest', 'spine', [0, 0.22, 0]],
    ['neck', 'chest', [0, 0.23, 0]], ['head', 'neck', [0, 0.08, 0]],
    ['jaw', 'head', [0, 0.05, -0.005]], ['eyeL', 'head', [0.032, 0.075, 0.075]], ['eyeR', 'head', [-0.032, 0.075, 0.075]],
    ['lidL', 'head', [0.032, 0.075, 0.075]], ['lidR', 'head', [-0.032, 0.075, 0.075]],
    ['browL', 'head', [0.03, 0.097, 0.085]], ['browR', 'head', [-0.03, 0.097, 0.085]],
    ['mouthL', 'head', [0.0245, 0.0068, 0.095]], ['mouthR', 'head', [-0.0245, 0.0068, 0.095]],
    ['clavL', 'chest', [0.022, 0.147, 0.045]], ['armL', 'clavL', [0.168, 0.008, -0.045]], ['foreL', 'armL', [0, -0.285, 0]], ['handL', 'foreL', [0, -0.26, 0]],
    ['fingL', 'handL', [0.002, -0.087, 0], 'hand'], ['fing2L', 'fingL', [-0.004, -0.043, 0], 'hand'],
    ['thumbL', 'handL', [-0.004, -0.016, 0.028], 'hand'], ['thumb2L', 'thumbL', [-0.012, -0.034, 0.014], 'hand'],
    ['clavR', 'chest', [-0.022, 0.147, 0.045]], ['armR', 'clavR', [-0.168, 0.008, -0.045]], ['foreR', 'armR', [0, -0.285, 0]], ['handR', 'foreR', [0, -0.26, 0]],
    ['fingR', 'handR', [-0.002, -0.087, 0], 'hand'], ['fing2R', 'fingR', [0.004, -0.043, 0], 'hand'],
    ['thumbR', 'handR', [0.004, -0.016, 0.028], 'hand'], ['thumb2R', 'thumbR', [0.012, -0.034, 0.014], 'hand'],
    ['thighL', 'hips', [0.095, -0.035, 0]], ['shinL', 'thighL', [0, -0.44, 0]], ['footL', 'shinL', [0, -0.43, 0]], ['toeL', 'footL', [0, -0.055, 0.112], 'foot'],
    ['thighR', 'hips', [-0.095, -0.035, 0]], ['shinR', 'thighR', [0, -0.44, 0]], ['footR', 'shinR', [0, -0.43, 0]], ['toeR', 'footR', [0, -0.055, 0.112], 'foot'],
    ['hair1', 'head', [0, 0.165, -0.1]], ['hair2', 'hair1', [0, -0.13, -0.02]],
  ];
  const BI = {};
  BONES.forEach((b, i) => { BI[b[0]] = i; });
  const ARM_A = 0.36, LEG_A = 0.05; // A-pose used while modelling / binding (rad)
  const HEADKIDS = { jaw: 1, eyeL: 1, eyeR: 1, lidL: 1, lidR: 1, hair1: 1, hair2: 1, browL: 1, browR: 1, mouthL: 1, mouthR: 1 };

  function makeRig(spec, mh = null) {
    const f = spec.g === 'f';
    const H = spec.S || 1;
    const S = (f ? 0.935 : 1) * H, W = spec.W || 1, Sh = (f ? 0.955 : 1) * H * (spec.hk || 1); // (hk: a bigger head, a younger look)
    const hs = S * (f ? 0.9 : 1) * Math.pow(W, 0.3), fs = S * (f ? 0.92 : 1); // hand and shoe modelling scales
    const bones = [], P = {}, R = {};
    // a MakeHuman head: the eyes (and the lids that close over them) turn about its own eyeballs; the brows sit over them
    const mhOff = mh ? { eyeL: mh.eyeL, eyeR: mh.eyeR, lidL: mh.eyeL, lidR: mh.eyeR, browL: mh.browL, browR: mh.browR } : null;
    for (const [name, parent, off, kind] of BONES) {
      let o = off.slice();
      if (mhOff && mhOff[name]) o = mhOff[name].slice();
      else if (HEADKIDS[name]) o = o.map((v) => v * Sh);
      else if (kind === 'hand') o = o.map((v) => v * hs);
      else if (kind === 'foot') o = o.map((v) => v * fs);
      else {
        let sx = 1;
        if (name === 'armL' || name === 'armR' || name === 'clavL' || name === 'clavR') sx = (f ? 0.92 : 1) * Math.sqrt(W) * (1 + 0.06 * (spec.M || 0));
        if (name === 'thighL' || name === 'thighR') sx = (f ? 1.08 : 1) * Math.sqrt(W);
        o = [o[0] * S * sx, o[1] * S, o[2] * S];
      }
      let rot = [0, 0, 0];
      if (name === 'armL') rot = [0, 0, ARM_A]; if (name === 'armR') rot = [0, 0, -ARM_A];
      if (name === 'thighL') rot = [0, 0, LEG_A]; if (name === 'thighR') rot = [0, 0, -LEG_A];
      const lr = mulMM(mulMM(rotX(rot[0]), rotY(rot[1])), rotZ(rot[2])); // three.js 'XYZ' Euler order
      const pr = parent ? R[parent] : IDM, pp = parent ? P[parent] : [0, 0, 0];
      P[name] = add(pp, mulM(pr, o));
      R[name] = mulMM(pr, lr);
      bones.push({ name, parent, off: o, rot });
    }
    const dir = (a, b) => nrm(sub(P[b], P[a]));
    return {
      f, S, W, Sh, H, spec, bones, P, R,
      elderly: !!spec.elderly, belly: spec.belly || 1, slim: spec.slim || 0, M: spec.M || 0,
      dArmL: dir('armL', 'foreL'), dArmR: dir('armR', 'foreR'), dLegL: dir('thighL', 'shinL'), dLegR: dir('thighR', 'shinR'),
      eyeR: 0.0122 * Sh, mh,
    };
  }

  // ---------------------------------------------------------------- body parts (shared by skin and clothes)
  // o: { inf: inflate, girth: extra width factor, reg, only: [part names], skip: [part names], k: blend scale }
  function want(o, name) { return (!o.only || o.only.includes(name)) && !(o.skip && o.skip.includes(name)); }
  function torsoParts(L, R, o = {}) {
    const f = R.f, S = R.S, G = R.W * (o.girth || 1), inf = o.inf || 0, reg = o.reg ?? REG.skin, ks = o.k || 1;
    const B = R.belly;
    const P = (x, y, z) => [x * S * G, y * S, z * S * G];
    const E = (name, c, r, k, bone) => { if (want(o, name)) L.add(P_ell(P(...c), [r[0] * S * G, r[1] * S, r[2] * S * G]), { k: k * ks, inf, bone, reg }); };
    const C = (name, a, b, ra, rb, k, bone) => { if (want(o, name)) L.add(P_cone(P(...a), P(...b), ra * S * G, rb * S * G), { k: k * ks, inf, bone, reg }); };
    if (!f) {
      E('pelvis', [0, 0.955, -0.008], [0.158, 0.105, 0.105], 0.06, 'hips');
      for (const s of [-1, 1]) E('glute', [s * 0.068, 0.9, -0.05], [0.078, 0.09, 0.066], 0.05, 'hips');
      E('abdomen', [0, 1.035, 0.006], [0.138, 0.095, 0.092], 0.06, 'spine');
      E('waist', [0, 1.12, 0.0], [0.132, 0.09, 0.094], 0.06, 'spine');
      if (B > 1.01) E('belly', [0, 1.075, 0.035 + 0.035 * (B - 1)], [0.128, 0.11, 0.07 + 0.09 * (B - 1)], 0.06, 'spine');
      E('ribs', [0, 1.285, -0.008], [0.156, 0.155, 0.108], 0.07, 'chest');
      E('upchest', [0, 1.365, 0.012], [0.162, 0.085, 0.098], 0.05, 'chest');
      const M = R.M || 0;
      for (const s of [-1, 1]) E('pec', [s * 0.066, 1.34, 0.07 + 0.006 * M], [0.068 * (1 + 0.12 * M), 0.048 * (1 + 0.15 * M), 0.034 * (1 + 0.45 * M)], 0.04, 'chest');
      E('back', [0, 1.37, -0.058], [0.148, 0.1, 0.058], 0.05, 'chest');
      for (const s of [-1, 1]) E('lat', [s * 0.112, 1.255, -0.028], [0.058 * (1 + 0.3 * M), 0.12, 0.068], 0.05, 'chest');
      for (const s of [-1, 1]) C('trap', [s * 0.035, 1.505, -0.025], [s * 0.158, 1.458, -0.018], 0.048 * (1 + 0.25 * M), 0.036 * (1 + 0.25 * M), 0.05, 'chest');
      for (const s of [-1, 1]) C('clav', [s * 0.02, 1.447, 0.052], [s * 0.155, 1.468, 0.022], 0.014, 0.013, 0.025, 'chest');
      C('neck', [0, 1.43, -0.022], [0, 1.64, 0.0], 0.058, 0.05, 0.04, 'neck');
      if (want(o, 'adam')) L.add(P_sphere(P(0, 1.56, 0.05), 0.011 * S), { k: 0.02, inf, bone: 'neck', reg });
    } else {
      // sl (0..1): slim figure, flat stomach, narrower waist and hips
      const sl = R.slim || 0;
      E('pelvis', [0, 0.95, -0.01], [0.172 - 0.012 * sl, 0.11, 0.11 - 0.01 * sl], 0.06, 'hips');
      for (const s of [-1, 1]) E('glute', [s * 0.072 * (1 - 0.04 * sl), 0.895, -0.058], [0.086 - 0.006 * sl, 0.098, 0.076 - 0.008 * sl], 0.05, 'hips');
      E('abdomen', [0, 1.035, 0.008 - 0.008 * sl], [0.14 - 0.014 * sl, 0.095, 0.09 - 0.01 * sl], 0.06, 'spine');
      E('waist', [0, 1.125, 0.0], [0.118 - 0.014 * sl, 0.085, 0.087 - 0.01 * sl], 0.06, 'spine');
      if (B > 1.01) E('belly', [0, 1.075, 0.03 + 0.03 * (B - 1)], [0.12, 0.1, 0.07 + 0.08 * (B - 1)], 0.06, 'spine');
      E('ribs', [0, 1.28, -0.01], [0.14 - 0.006 * sl, 0.148, 0.1 - 0.004 * sl], 0.07, 'chest');
      E('upchest', [0, 1.36, 0.008], [0.145, 0.08, 0.09], 0.05, 'chest');
      const bu = R.spec.bust || 1;
      for (const s of [-1, 1]) E('breast', [s * 0.068, 1.285, 0.064], [0.062 * bu, 0.058 * bu, 0.052 * bu], 0.045, 'chest');
      E('back', [0, 1.37, -0.055], [0.132, 0.1, 0.055], 0.05, 'chest');
      for (const s of [-1, 1]) E('lat', [s * 0.1, 1.255, -0.03], [0.05, 0.11, 0.062], 0.05, 'chest');
      for (const s of [-1, 1]) C('trap', [s * 0.032, 1.5, -0.024], [s * 0.147, 1.455, -0.018], 0.04, 0.03, 0.05, 'chest');
      for (const s of [-1, 1]) C('clav', [s * 0.02, 1.447, 0.048], [s * 0.143, 1.462, 0.02], 0.012, 0.011, 0.025, 'chest');
      C('neck', [0, 1.43, -0.02], [0, 1.64, 0.0], 0.054, 0.047, 0.04, 'neck');
    }
  }
  // arm of side s (+1 left, -1 right). o.to: how far down the arm (metres along it, from the shoulder), o.cut: clip at that distance
  function armParts(L, R, s, o = {}) {
    const sd = s > 0 ? 'L' : 'R', f = R.f, G = R.W * (o.girth || 1) * (1 + 0.14 * (R.M || 0)), S = R.S, inf = o.inf || 0, reg = o.reg ?? REG.skin, ks = o.k || 1;
    const sh = R.P['arm' + sd], el = R.P['fore' + sd], wr = R.P['hand' + sd];
    const d = s > 0 ? R.dArmL : R.dArmR;
    const m = alignY(d);
    const fwd = [0, 0, 1];
    const at = (t, fz = 0, out = 0) => add(add(sh, scl(d, t * S)), [out * s * S, 0, fz * S]);
    const clip = o.cut ? [d[0], d[1], d[2], dot(d, sh) + o.cut * S] : null;
    const opt = (k, bone) => ({ k: k * ks, inf, bone, reg, clip });
    const g = f ? 0.86 : 1;
    const gu = o.garment ? 1.17 : 1, gf = o.garment ? 1.12 : 1; // garment: one smooth tube over biceps, triceps and forearm
    if (want(o, 'deltoid')) L.add(P_ell(add(at(0.0, 0, 0), [-0.006 * s * S, 0, 0]), [0.048 * g * G * S, 0.058 * S, 0.052 * g * G * S], m), opt(0.04, 'arm' + sd));
    if (want(o, 'upper')) L.add(P_cone(at(0.02), el, 0.046 * g * G * S * gu, 0.037 * g * G * S * gu), opt(0.03, 'arm' + sd));
    if (want(o, 'upper') && !o.garment) L.add(P_ell(at(0.13, 0.012), [0.04 * g * G * S, 0.085 * S, 0.04 * g * G * S], m), opt(0.03, 'arm' + sd));
    if (want(o, 'upper') && !o.garment) L.add(P_ell(at(0.12, -0.013), [0.04 * g * G * S, 0.09 * S, 0.041 * g * G * S], m), opt(0.03, 'arm' + sd));
    if (want(o, 'elbow')) L.add(P_sphere(add(el, [0, 0, -0.006 * S]), 0.035 * g * G * S), opt(0.025, 'fore' + sd));
    const wend = o.wrist != null ? o.wrist : 0.005;
    if (want(o, 'fore')) L.add(P_cone(el, sub(wr, scl(d, wend * S)), 0.039 * g * G * S * gf, 0.026 * g * G * S * gf), opt(0.02, 'fore' + sd));
    if (want(o, 'fore') && !o.garment) L.add(P_ell(add(el, scl(d, 0.075 * S)), [0.036 * g * G * S, 0.085 * S, 0.043 * g * G * S], m), opt(0.03, 'fore' + sd));
    return { sh, el, wr, d, m, fwd };
  }
  function legParts(L, R, s, o = {}) {
    const sd = s > 0 ? 'L' : 'R', f = R.f, G = R.W * (o.girth || 1) * (1 + 0.07 * (R.M || 0)), S = R.S, inf = o.inf || 0, reg = o.reg ?? REG.skin, ks = o.k || 1;
    const hp = R.P['thigh' + sd], kn = R.P['shin' + sd], an = R.P['foot' + sd];
    const d = s > 0 ? R.dLegL : R.dLegR;
    const m = alignY(d);
    const at = (base, t, fz = 0, out = 0) => add(add(base, scl(d, t * S)), [out * s * S, 0, fz * S]);
    const clip = o.cut ? [d[0], d[1], d[2], dot(d, hp) + o.cut * S] : null;
    const opt = (k, bone) => ({ k: k * ks, inf, bone, reg, clip, w: o.w ?? 1 });
    const g = f ? 1.04 : 1;
    if (want(o, 'thigh')) {
      L.add(P_cone(hp, kn, 0.088 * g * G * S, 0.054 * G * S * (f ? 0.97 : 1)), opt(0.035, 'thigh' + sd));
      L.add(P_ell(at(hp, 0.19, 0.024), [0.066 * g * G * S, 0.17 * S, 0.058 * g * G * S], m), opt(0.04, 'thigh' + sd));
      L.add(P_ell(at(hp, 0.2, -0.022), [0.062 * g * G * S, 0.16 * S, 0.058 * g * G * S], m), opt(0.04, 'thigh' + sd));
      L.add(P_ell(at(hp, 0.1, 0, -0.03), [0.055 * g * G * S, 0.1 * S, 0.06 * g * G * S], m), opt(0.04, 'thigh' + sd));
    }
    if (want(o, 'knee')) {
      L.add(P_sphere(add(kn, [0, 0, 0.008 * S]), 0.05 * G * S * (f ? 0.96 : 1)), opt(0.03, 'shin' + sd));
      L.add(P_sphere(add(at(kn, -0.005), [0, 0, 0.046 * S]), 0.024 * S), opt(0.02, 'shin' + sd));
    }
    if (want(o, 'calf')) {
      L.add(P_cone(kn, an, 0.05 * G * S * (f ? 0.92 : 1), 0.032 * G * S * (f ? 0.9 : 1)), opt(0.025, 'shin' + sd));
      L.add(P_ell(add(at(kn, 0.12, -0.03), [0.005 * s * S, 0, 0]), [0.047 * G * S * (f ? 0.92 : 1), 0.1 * S, 0.045 * G * S * (f ? 0.92 : 1)], m), opt(0.035, 'shin' + sd));
    }
    if (want(o, 'ankle')) L.add(P_sphere(an, 0.033 * G * S * (f ? 0.9 : 1)), opt(0.02, 'foot' + sd));
    return { hp, kn, an, d, m };
  }
  // whole skin body (torso + arms + legs); inflate lets the head/hand layers overlap it seamlessly
  function bodyLayer(R, h, inf) {
    const L = new Layer('body', h, { order: 0, tau: 0.011 });
    torsoParts(L, R, { inf });
    L.group();
    for (const s of [1, -1]) { L.group(); armParts(L, R, s, { inf, wrist: -0.03 }); L.end(0); }
    L.end(0.045);
    L.group();
    for (const s of [1, -1]) { L.group(); legParts(L, R, s, { inf }); L.end(0); }
    L.end(0.05);
    return L;
  }

  // ---------------------------------------------------------------- head (face, ears) + neck base, fine resolution
  // anatomical landmarks (head-bone space, metres for a male reference); the face paint in characters.js reads the same table
  function headLandmarks(R) {
    const A = baseLandmarks(R);
    if (R.mh) { const B = JSON.parse(JSON.stringify(A)); B.cran = R.mh.cran.map((v) => v.map((x) => x / R.Sh)); B.fore = R.mh.fore.map((v) => v.map((x) => x / R.Sh)); return B; } // the hair sits on its skull
    const fc = R.spec && R.spec.face;
    if (!fc) return A;
    // the person's own face: [jaw width, chin, cheeks, nose size, brow ridge], each −1…1
    const [jw, ch, ck, ns, bw] = fc;
    const X = (a) => JSON.parse(JSON.stringify(a));
    const B = X(A);
    B.jaw[1][0] *= 1 + 0.08 * jw; B.gon[0] += 0.003 * jw; B.mand *= 1 + 0.06 * jw;
    B.chin[0][2] += 0.003 * ch; B.chin[1] = B.chin[1].map((v) => v * (1 + 0.1 * ch)); B.chinS[2] += 0.002 * ch;
    B.cheek[1] = B.cheek[1].map((v) => v * (1 + 0.12 * ck)); B.zyg[0][0] += 0.002 * ck;
    B.nb *= 1 + 0.1 * ns;
    B.brow = B.brow.map((v, i) => (i < 2 ? v * (1 + 0.22 * bw) : v));
    return B;
  }
  function baseLandmarks(R) {
    return R.f ? {
      cran: [[0, 0.094, -0.015], [0.074, 0.086, 0.097]], fore: [[0, 0.104, 0.028], [0.064, 0.05, 0.058]],
      face: [[0, 0.052, 0.044], [0.053, 0.054, 0.05]], arch: [[0, 0.01, 0.058], [0.035, 0.034, 0.033]], jaw: [[0, -0.008, 0.03], [0.04, 0.028, 0.05]],
      zyg: [[0.049, 0.066, 0.057], [0.024, 0.018, 0.022]], cheek: [[0.039, 0.036, 0.049], [0.021, 0.025, 0.027]],
      gon: [0.041, -0.006, -0.012], chinS: [0.017, -0.03, 0.064], mand: 0.0085, chin: [[0, -0.024, 0.077], [0.018, 0.017, 0.016]], tmj: [0.048, 0.05, -0.012],
      brow: [0.008, 0.007, -0.003], nb: 0.86, tipUp: 0.0014,
      mouth: { y: 0.0072, w: 0.0232, hu: 0.0086, hl: 0.0108, zu: 0.0998, zl: 0.0988 },
    } : {
      cran: [[0, 0.095, -0.015], [0.076, 0.088, 0.1]], fore: [[0, 0.105, 0.03], [0.066, 0.05, 0.06]],
      face: [[0, 0.052, 0.046], [0.056, 0.056, 0.051]], arch: [[0, 0.009, 0.06], [0.038, 0.036, 0.035]], jaw: [[0, -0.012, 0.032], [0.043, 0.03, 0.052]],
      zyg: [[0.051, 0.064, 0.057], [0.023, 0.017, 0.022]], cheek: [[0.041, 0.034, 0.05], [0.022, 0.026, 0.028]],
      gon: [0.047, -0.006, -0.012], chinS: [0.021, -0.031, 0.069], mand: 0.0105, chin: [[0, -0.026, 0.083], [0.021, 0.019, 0.017]], tmj: [0.052, 0.05, -0.012],
      brow: [0.011, 0.009, 0], nb: 1, tipUp: 0,
      mouth: { y: 0.0068, w: 0.0245, hu: 0.0078, hl: 0.0098, zu: 0.1008, zl: 0.0985 },
    };
  }
  // the skull: cranium, face mass, cheekbones, temples, jaw ramus. inf > 0 inflates it evenly, which is how the hair
  // shell follows the real head (a smooth union of inflated shapes is exactly the inflated union)
  function skullOps(L, R, A, inf = 0, o = {}) {
    const hb = R.P.head, Sh = R.Sh;
    const H = (x, y, z) => [hb[0] + x * Sh, hb[1] + y * Sh, hb[2] + z * Sh];
    const reg = o.reg ?? REG.face, nz = o.nz || 0, nf = o.nf || 1, hair = !!o.hair, lk = o.lk || null, tp = o.tp || null, tp2 = o.tp2 || null;
    const E = (c, r, k, bone = 'head') => L.add(P_ell(H(...c), [r[0] * Sh, r[1] * Sh, r[2] * Sh]), { k, bone: hair ? 'head' : bone, reg, inf, nz, nf, lk, tp, tp2 });
    const XE = (c, r, k) => L.sub(P_ell(H(...c), [r[0] * Sh, r[1] * Sh, r[2] * Sh]), { k, reg, inf: -inf });
    const Cn = (a, b, ra, rb, k, bone = 'head') => L.add(P_cone(H(...a), H(...b), ra * Sh, rb * Sh), { k, bone: hair ? 'head' : bone, reg, inf, nz, nf, lk, tp, tp2 });
    const fat = Math.max(0, R.W - 1) * 1.8 + (R.elderly ? 0.25 : 0);
    E(A.cran[0], A.cran[1], 0);
    E(A.fore[0], A.fore[1], 0.03);
    E([0, 0.075, -0.05], [0.07, 0.065, 0.06], 0.03);
    E(A.face[0], A.face[1], 0.025);
    for (const s of [-1, 1]) {
      E([s * A.zyg[0][0], A.zyg[0][1], A.zyg[0][2]], A.zyg[1], 0.02);
      E([s * A.cheek[0][0], A.cheek[0][1], A.cheek[0][2]], [A.cheek[1][0] * (1 + fat * 0.3), A.cheek[1][1], A.cheek[1][2] * (1 + fat * 0.3)], 0.03);
      XE([s * 0.07, 0.085, 0.045], [0.012, 0.02, 0.02], 0.02);
      if (!hair) Cn([s * A.gon[0], A.gon[1], A.gon[2]], [s * A.tmj[0], A.tmj[1], A.tmj[2]], A.mand, A.mand * 0.9, 0.022, 'jaw');
    }
    return fat;
  }
  function headLayer(R, h, neckTo = null) {
    const L = new Layer('head', h, { order: 1, face: true, tau: 0.006 });
    const f = R.f, Sh = R.Sh, S = R.S, old = R.elderly;
    const hb = R.P.head;
    const H = (x, y, z) => [hb[0] + x * Sh, hb[1] + y * Sh, hb[2] + z * Sh];
    const E = (c, r, k, bone = 'head', reg = REG.face, m = null) => L.add(P_ell(H(...c), [r[0] * Sh, r[1] * Sh, r[2] * Sh], m), { k, bone, reg });
    const Sp = (c, r, k, bone = 'head', reg = REG.face) => L.add(P_sphere(H(...c), r * Sh), { k, bone, reg });
    const Cn = (a, b, ra, rb, k, bone = 'head', reg = REG.face) => L.add(P_cone(H(...a), H(...b), ra * Sh, rb * Sh), { k, bone, reg });
    const X = (c, r, k, reg = REG.face) => L.sub(P_sphere(H(...c), r * Sh), { k, reg });
    const XE = (c, r, k, m = null, reg = REG.face) => L.sub(P_ell(H(...c), [r[0] * Sh, r[1] * Sh, r[2] * Sh], m), { k, reg });
    // neck and the top of the shoulders (clipped to a column) so the seam with the coarser body sits low, under the collar
    L.group();
    torsoParts(L, R, { only: ['neck', 'trap', 'clav', 'upchest', 'back', 'adam'] });
    // sternocleidomastoid: from behind the ear down to the top of the sternum
    for (const s of [-1, 1]) L.add(P_cone(H(s * 0.05, 0.03, -0.028), [s * 0.019 * S, 1.452 * S, 0.047 * S], (f ? 0.0085 : 0.0105) * Sh, (f ? 0.007 : 0.0085) * S), { k: 0.022, bone: 'neck', reg: REG.skin });
    L.int(P_plane([0, -1, 0], [0, 1.4 * S, 0]));
    L.int(P_cone([0, 1.2 * S, -0.012 * S], [0, 1.95 * S, -0.012 * S], 0.108 * S, 0.108 * S));
    if (neckTo != null) L.int(P_plane([0, 1, 0], [0, neckTo, 0])); // (a MakeHuman head takes over from here up)
    L.end(0);
    if (neckTo != null) return L;
    const A = headLandmarks(R);
    const ly = old ? 0.8 : 1;
    L.group();
    const fat = skullOps(L, R, A);
    E(A.arch[0], A.arch[1], 0.03);
    E(A.jaw[0], A.jaw[1], 0.03, 'jaw');
    for (const s of [-1, 1]) {
      Cn([s * A.gon[0], A.gon[1], A.gon[2]], [s * A.chinS[0], A.chinS[1], A.chinS[2]], A.mand, A.mand * 1.05, 0.022, 'jaw');
      if (fat > 0.05) E([s * 0.04, 0.0, 0.04], [0.022 * (1 + fat * 0.4), 0.028, 0.03], 0.03, 'jaw');
    }
    // chin: squarer and a little cleft on men, round on women
    E(A.chin[0], A.chin[1], 0.018, 'jaw');
    if (!f) for (const s of [-1, 1]) E([s * 0.0085, -0.029, 0.0815], [0.0125, 0.0135, 0.0125], 0.012, 'jaw');
    // brow ridge and eye sockets
    for (const s of [-1, 1]) Cn([0, 0.096, 0.09 + A.brow[2]], [s * 0.05, 0.092, 0.075 + A.brow[2]], A.brow[0], A.brow[1], 0.02);
    for (const s of [-1, 1]) X([s * 0.032, 0.075, 0.075], 0.0151, 0.006);
    // nose: bridge, a two-dome tip, columella, wings (alae) with a crisp crease, and nostrils carved underneath
    const nb = A.nb, z0 = 0.096, P = 0.022 * nb, tu = A.tipUp;
    Cn([0, 0.08, 0.0928], [0, 0.051 + tu * 0.5, z0 + P - 0.0075 * nb], 0.0046 * nb, 0.0066 * nb, 0.008);
    Sp([0, 0.0455 + tu, z0 + P - 0.0074 * nb], 0.0068 * nb, 0.005);
    for (const s of [-1, 1]) Sp([s * 0.0029 * nb, 0.0447 + tu, z0 + P - 0.0064 * nb], 0.0051 * nb, 0.0052);
    E([0, 0.0372 + tu * 0.6, z0 + P - 0.0122 * nb], [0.0034 * nb, 0.0036 * nb, 0.0072 * nb], 0.004, 'head', REG.face, rotX(f ? 0.55 : 0.45));
    E([0, 0.0355, 0.0975], [0.0098 * nb, 0.0048, 0.0072], 0.006);
    for (const s of [-1, 1]) E([s * 0.0114 * nb, 0.0372, z0 + 0.003], [0.0041 * nb, 0.0052 * nb, 0.0088 * nb], 0.0078, 'head', REG.face, rotY(s * 0.42));
    for (const s of [-1, 1]) XE([s * 0.0052 * nb, 0.0328 + tu * 0.4, z0 + 0.0078 * nb], [0.0018 * nb, 0.0011 * nb, 0.0036 * nb], 0.0024, rotY(s * 0.3));
    // mouth: upper lip = central tubercle + two wings following the dental arch; the lower lip is fuller, in two soft lobes
    const M = A.mouth, ym = M.y, arch = (x) => 22 * x * x;
    E([0, ym + M.hu * 0.48 * ly, M.zu - 0.0056], [0.0068, M.hu * 0.58 * ly, 0.0058], 0.004);
    for (const s of [-1, 1]) E([s * 0.0118, ym + M.hu * 0.42 * ly, M.zu - 0.0062 - arch(0.0118)], [0.0125, M.hu * 0.52 * ly, 0.006], 0.004, 'head', REG.face, rotY(-s * 0.46));
    E([0, ym - M.hl * 0.48 * ly, M.zl - 0.0064], [0.0155, M.hl * 0.56 * ly, 0.0066], 0.004, 'jaw');
    for (const s of [-1, 1]) E([s * 0.0128, ym - M.hl * 0.4 * ly, M.zl - 0.0066 - arch(0.0128)], [0.0108, M.hl * 0.46 * ly, 0.006], 0.004, 'jaw', REG.face, rotY(-s * 0.5));
    for (const s of [-1, 1]) X([s * M.w, ym, M.zu - arch(M.w) - 0.0035], 0.0026, 0.003);
    L.end(0.018); // head blends into the neck
    // ears (own group so the carved bowl does not bite the skull): shell, bowl, rolled rim (helix) and lobe
    const em = rotX(0.16), ew = transpose(em);
    for (const s of [-1, 1]) {
      L.group();
      E([s * 0.076, 0.07, -0.012], [0.011, 0.03, 0.019], 0, 'head', REG.face, em);
      X([s * 0.086, 0.066, -0.008], 0.0105, 0.004);
      let prev = null;
      for (let i = 0; i <= 9; i++) {
        const th = (0.5 + (i / 9) * 3.7);
        const q = mulM(ew, [0, 0.0262 * Math.sin(th), 0.0162 * Math.cos(th)]);
        const p = [s * (0.0815 + 0.0025 * Math.sin(Math.min(th, 3.1) * 0.5)), 0.071 + q[1], -0.0125 + q[2]];
        if (prev) Cn(prev, p, 0.0026, 0.0026, 0.003);
        prev = p;
      }
      Sp([s * 0.077, 0.045, -0.008], 0.0078, 0.006);
      L.end(0.01);
    }
    return L;
  }

  // ---------------------------------------------------------------- left hand (mirrored for the right one)
  // modelled in the hand bone frame (wrist at origin, fingers along -y, palm facing -x, thumb forward +z)
  function handLayer(R, h) {
    const L = new Layer('hand', h, { order: 1, tau: 0.0045 });
    const hs = R.S * (R.f ? 0.9 : 1) * Math.pow(R.W, 0.3);
    const o = R.P.handL, m = R.R.handL;
    const T = (x, y, z) => add(o, mulM(m, [x * hs, y * hs, z * hs]));
    const lm = transpose(m); // local-from-world for oriented prims
    const reg = REG.skin;
    // wrist + a bit of forearm (overlaps the coarse body)
    L.add(P_cone(T(0, 0.055, 0), T(0, 0.0, 0), 0.026 * hs, 0.023 * hs), { bone: 'foreL', reg });
    L.add(P_ell(T(0, 0.01, 0.001), [0.02 * hs, 0.028 * hs, 0.026 * hs], lm), { k: 0.012, bone: 'handL', reg });
    L.add(P_box(T(0.001, -0.046, 0.002), [0.0135 * hs, 0.043 * hs, 0.039 * hs], 0.011 * hs, lm), { k: 0.014, bone: 'handL', reg });
    L.add(P_ell(T(-0.006, -0.03, 0.02), [0.012 * hs, 0.026 * hs, 0.018 * hs], lm), { k: 0.01, bone: 'handL', reg });
    L.add(P_ell(T(-0.006, -0.036, -0.022), [0.011 * hs, 0.028 * hs, 0.014 * hs], lm), { k: 0.01, bone: 'handL', reg });
    // fingers: [z, base y, lengths, radius, fan]
    const F = [
      [0.027, -0.086, [0.042, 0.025, 0.02], 0.0092, 0.07],
      [0.009, -0.089, [0.046, 0.028, 0.021], 0.0095, 0.02],
      [-0.009, -0.087, [0.043, 0.026, 0.02], 0.009, -0.035],
      [-0.026, -0.081, [0.034, 0.019, 0.018], 0.008, -0.09],
    ];
    const curl = [0.22, 0.36, 0.26];
    const tips = [];
    L.group();
    for (const [z0, y0, lens, r0, fan] of F) {
      L.group();
      let p = [0.002, y0, z0], th = 0;
      let r = r0;
      L.add(P_sphere(T(0.003, y0 + 0.004, z0), r0 * 1.08 * hs), { bone: 'handL', reg });
      for (let j = 0; j < 3; j++) {
        th += curl[j];
        const dx = -Math.sin(th), dy = -Math.cos(th) * Math.cos(fan), dz = Math.sin(fan) * Math.cos(th);
        const q = [p[0] + dx * lens[j], p[1] + dy * lens[j], p[2] + dz * lens[j]];
        const r1 = r * (j === 2 ? 0.82 : 0.9);
        L.add(P_cone(T(...p), T(...q), r * hs, r1 * hs), { k: 0.004, bone: j === 0 ? 'fingL' : 'fing2L', reg }); // knuckle joint, then the middle and end joints
        p = q; r = r1;
      }
      tips.push({ p: T(...p), r: r * hs });
      L.end(0);
    }
    // thumb
    L.group();
    const t0 = [-0.004, -0.016, 0.028], t1 = [-0.016, -0.05, 0.042], t2 = [-0.026, -0.077, 0.046], t3 = [-0.033, -0.098, 0.044];
    L.add(P_cone(T(...t0), T(...t1), 0.0138 * hs, 0.0118 * hs), { bone: 'thumbL', reg, w: 0.8 }); // the thumb swings from its base at the wrist
    L.add(P_cone(T(...t1), T(...t2), 0.0114 * hs, 0.0099 * hs), { k: 0.004, bone: 'thumb2L', reg });
    L.add(P_cone(T(...t2), T(...t3), 0.0097 * hs, 0.0082 * hs), { k: 0.004, bone: 'thumb2L', reg });
    tips.push({ p: T(...t3), r: 0.0082 * hs });
    L.end(0);
    L.end(0.009);
    // knuckles on the back of the hand
    for (const [z0, y0] of F) L.add(P_sphere(T(0.011, y0 + 0.002, z0), 0.0078 * hs), { k: 0.007, bone: 'handL', reg });
    L.handFrame = { o, m, hs, tips };
    return L;
  }

  // ---------------------------------------------------------------- left shoe (foot bone frame: ankle at origin, toes +z)
  function shoeLayer(R, h, kind) {
    const L = new Layer('shoe', h, { order: 2, tau: 0.01 });
    const s = R.S * (R.f ? 0.92 : 1);
    const o = R.P.footL, m = R.R.footL, lm = transpose(m);
    const g = -R.P.footL[1] / s; // ground height in local units
    const T = (x, y, z) => add(o, mulM(m, [x * s, y * s, z * s]));
    const bone = 'footL';
    const E = (c, r, k, reg = REG.shoe) => L.add(P_ell(T(...c), [r[0] * s, r[1] * s, r[2] * s], lm), { k, bone, reg });
    const soleT = kind === 'sneaker' ? 0.03 : 0.018;
    L.group(); // sole
    E([0, g + soleT * 0.5, 0.1], [0.05, soleT * 0.55, 0.095], 0, REG.sole);
    E([0, g + soleT * 0.5, -0.035], [0.044, soleT * 0.55, 0.06], 0.03, REG.sole);
    E([0.003, g + soleT * 0.5, 0.035], [0.046, soleT * 0.55, 0.08], 0.03, REG.sole);
    if (kind !== 'sneaker') E([0, g + 0.016, -0.055], [0.036, 0.018, 0.035], 0.01, REG.sole); // heel block
    L.end(0);
    L.group(); // upper
    const toeZ = kind === 'shoe' ? 0.11 : 0.105;
    E([0, g + soleT + 0.012, toeZ], [0.045, kind === 'sneaker' ? 0.03 : 0.024, 0.082], 0);
    E([0, g + soleT + 0.03, 0.035], [0.043, 0.047, 0.085], 0.025);
    E([0, g + soleT + 0.025, -0.035], [0.04, 0.05, 0.052], 0.025);
    const collarTop = kind === 'boot' ? 0.2 : kind === 'sneaker' ? 0.118 : 0.1;
    L.add(P_cone(T(0, g + 0.06, -0.01), T(0, g + collarTop, -0.012), 0.043 * s, 0.04 * s), { k: 0.025, bone, reg: REG.shoe });
    if (kind === 'sneaker') E([0, g + 0.088, 0.045], [0.028, 0.028, 0.042], 0.012, REG.shoe);
    L.end(0.012);
    L.sub(P_cone(T(0, g + collarTop - 0.03, -0.006), T(0, g + 0.3, -0.01), 0.033 * s, 0.036 * s), { k: 0.006, reg: REG.shoe });
    L.int(P_plane(mulM(m, [0, -1, 0]), T(0, g, 0)));
    L.shoeFrame = { o, m, s, g, kind, soleT, collarTop };
    // the front of the shoe bends over the ball of the foot with the toes
    const mt = transpose(m);
    L.weightFn = (x, y, z) => {
      const lz = (mt[6] * (x - o[0]) + mt[7] * (y - o[1]) + mt[8] * (z - o[2])) / s;
      const t = sstep(0.08, 0.135, lz);
      return t > 0 ? [['footL', 1 - t], ['toeL', t]] : [['footL', 1]];
    };
    return L;
  }

  // ---------------------------------------------------------------- clothes: tops
  function sleeves(L, R, o) {
    o = { garment: true, ...o };
    L.group();
    for (const s of [1, -1]) { L.group(); armParts(L, R, s, o); L.end(0); }
    L.end(o.kj ?? 0.035);
  }
  // part 'under': the garment worn underneath an open jacket, a waistcoat or a cardigan, as a layer of its own so
  // the outer garment's edges stay clean (the hidden parts of it are culled)
  const LAYERED = { jacket: 1, vest: 1, cardigan: 1 };
  function topLayer(R, h, style, spec, part = 'outer') {
    const S = R.S, G = R.W, f = R.f;
    const L = new Layer(part === 'under' ? 'under' : 'top', h, { order: part === 'under' ? 3.5 : spec.tucked ? 3 : 4, tau: 0.012 });
    L.style = style;
    const T = REG.top, TT = REG.topTrim;
    const sl = R.slim || 0;
    // fabric bridges the waist instead of following it: fills the hollow from the chest (or the bust) down to the hips
    const fill = (loose = 0, reg = T) => f
      ? L.add(P_ell([0, 1.13 * S, 0.016 * S], [(0.136 - 0.012 * sl + loose) * S * G, 0.2 * S, (0.098 - 0.012 * sl + loose) * S * G]), { k: 0.05, bone: 'spine', reg })
      : L.add(P_ell([0, 1.1 * S, 0.006 * S], [(0.152 + loose) * S * G, 0.24 * S, (0.104 + loose) * S * G]), { k: 0.05, bone: 'spine', reg });
    // the torso under a garment; over the hips (pelvis and the tops of the thighs) a little looser than whatever is worn
    // underneath, so the hem never shows the trousers or the skirt through
    const under = { jeans: [0.007, 1.03], pants: [0.009, 1.03], shorts: [0.012, 1.14], bermuda: [0.015, 1.24], skirt: [0.014, 1.04], cargo: [0.012, 1.08], chandal: [0.013, 1.09] }[spec.bottom || 'jeans'] || [0.009, 1.03];
    const body = (inf, girth = 1.02, reg = T) => {
      const skip = ['neck', 'adam'];
      if (spec.tucked) { torsoParts(L, R, { inf, girth, skip, reg }); return; }
      torsoParts(L, R, { inf, girth, skip: skip.concat(['pelvis', 'glute']), reg });
      torsoParts(L, R, { inf: inf + 0.0045, girth, only: ['pelvis', 'glute'], reg });
      L.group();
      for (const s of [1, -1]) legParts(L, R, s, { inf: under[0] + 0.006, girth: under[1], only: ['thigh'], cut: 0.1, reg, w: 0.25 }); // mostly rides on the hips
      L.end(0.03);
    };
    const neck = (c, r, k = 0.012, reg = TT) => L.sub(P_ell([c[0] * S, c[1] * S, c[2] * S], [r[0] * S, r[1] * S, r[2] * S]), { k, reg });
    const hem = (y, reg = T) => L.int(P_plane([0, -1, 0], [0, y * S, 0]), { reg, k: 0.009 });
    const cap = () => L.sub(P_cone([0, 1.5 * S, -0.015 * S], [0, 1.9 * S, -0.015 * S], 0.075 * S, 0.075 * S), { k: 0.012, reg: TT }); // keep the neck clear
    const collar = (R0, r, tilt, y = 1.462, reg = TT) => L.add(P_torus([0, y * S, 0.004 * S], R0 * S, r * S, alignY([0, Math.cos(tilt), Math.sin(tilt)])), { k: 0.008, bone: 'chest', reg });
    const long = { only: ['deltoid', 'upper', 'elbow', 'fore'] }, short = { only: ['deltoid', 'upper'] };
    const hemY = spec.tucked ? 0.9 : 0.925;
    if (style === 'jacket' || style === 'vest') {
      // open jacket (leather or denim) or a waistcoat over a T-shirt / shirt: the garment underneath, then the outer
      // layer with an opening down the front, a fold-down collar (jacket) or a V neck with buttons (waistcoat)
      const jk = style === 'jacket';
      if (part === 'under') {
        body(0.0095, 1.02, REG.under);
        fill(0.004, REG.under);
        sleeves(L, R, jk ? { ...short, inf: 0.008, girth: 1.05, cut: 0.13, reg: REG.under } : { ...long, inf: 0.009, girth: 1.06, cut: 0.5, reg: REG.under });
        cap();
        neck([0, 1.475, 0.022], [0.066, 0.05, 0.07], 0.01, REG.under);
        if (!jk) collar(0.067, 0.013, 0.42, 1.466, REG.under);
        hem(0.925, REG.under);
        return L;
      }
      L.group();
      body(jk ? 0.019 : 0.014, jk ? 1.07 : 1.04);
      fill(jk ? 0.022 : 0.014);
      if (jk) sleeves(L, R, { ...long, inf: 0.016, girth: 1.17, cut: 0.505, reg: T });
      cap();
      // the opening down the front, through the whole thickness of the outer layer (the shirt underneath shows):
      // straight for an open jacket, a V for a waistcoat
      L.group();
      if (jk) L.add(P_box([0, 1.18 * S, 0.17 * S], [0.042 * S * G, 0.34 * S, 0.16 * S], 0.004 * S), { reg: TT });
      else for (const s of [1, -1]) L.add(P_box([s * 0.052 * S * G, 1.34 * S, 0.17 * S], [0.045 * S * G, 0.2 * S, 0.16 * S], 0.004 * S, rotZ(-s * 0.2)), { reg: TT });
      L.end(0.004, true);
      if (!jk) for (const s of [1, -1]) L.sub(P_ell([s * 0.19 * S * Math.sqrt(G), 1.37 * S, -0.005 * S], [0.07 * S, 0.12 * S, 0.09 * S]), { k: 0.01, reg: TT }); // armholes
      neck([0, 1.48, 0.0], [0.07, 0.05, 0.075], 0.01, TT);
      L.end(0);
      if (jk) { // fold-down collar lying on the shoulders
        for (const s of [1, -1]) L.add(P_box([s * 0.055 * S, 1.47 * S, 0.035 * S], [0.045 * S, 0.012 * S, 0.035 * S], 0.006 * S, mulMM(rotY(s * 0.5), rotX(0.35))), { k: 0.01, bone: 'chest', reg: TT });
        L.add(P_torus([0, 1.47 * S, -0.01 * S], 0.07 * S, 0.012 * S, alignY([0, 0.95, -0.3])), { k: 0.01, bone: 'chest', reg: TT });
      }
      hem(jk ? 0.905 : 0.89, T);
      return L;
    }
    if (style === 'sweater' || style === 'tracktop') {
      // knitted jumper (crew neck, ribbed cuffs and hem) or a tracksuit top (zip, stand-up collar)
      const kn = style === 'sweater';
      body(kn ? 0.015 : 0.014, kn ? 1.06 : 1.05);
      fill(kn ? 0.02 : 0.018);
      sleeves(L, R, { ...long, inf: kn ? 0.015 : 0.014, girth: kn ? 1.15 : 1.14, cut: 0.5, reg: T });
      cap();
      neck([0, 1.475, 0.02], [0.066, 0.05, 0.07], 0.01, TT);
      if (kn) collar(0.066, 0.011, 0.2, 1.462);
      else L.add(P_cone([0, 1.44 * S, 0.0], [0, 1.52 * S, 0.004 * S], 0.078 * S, 0.068 * S), { k: 0.01, bone: 'chest', reg: TT });
      if (!kn) L.sub(P_cone([0, 1.42 * S, 0.02 * S], [0, 1.6 * S, 0.02 * S], 0.062 * S, 0.06 * S), { k: 0.008, reg: TT });
      hem(0.905, TT);
      return L;
    }
    if (style === 'dress') {
      // a dress: fitted bodice with little sleeves and a skirt flaring from the waist to the knee
      body(0.009, 1.02);
      fill(0.008);
      sleeves(L, R, { ...short, inf: 0.012, girth: 1.08, cut: 0.11, reg: T });
      cap();
      neck([0, 1.44, 0.075], [0.06, 0.07, 0.05], 0.012);
      neck([0, 1.48, 0.02], [0.066, 0.045, 0.07], 0.01);
      const low = spec.elderly ? 0.38 : 0.5, sl2 = R.slim || 0;
      for (const s of [1, -1]) {
        const hp = R.P[s > 0 ? 'thighL' : 'thighR'];
        L.add(P_cone(add(hp, [0, 0.07 * S, -0.008 * S]), [s * 0.06 * S * G, (low - 0.04) * S, -0.012 * S], 0.088 * 1.04 * G * S + 0.014 * S, (0.18 - 0.01 * sl2) * S * G), { k: 0.07, bone: 'hips', reg: T });
      }
      L.int(P_plane([0, -1, 0], [0, low * S, 0]), { reg: TT, k: 0.01 });
      L.weightFn = (x, y, z) => { // the skirt part rides on the hips and follows the thighs a little
        if (y > 0.98 * S) return null;
        const t = clamp((0.95 * S - y) / (0.5 * S), 0, 1) * 0.8;
        const w = sstep(-0.07 * S, 0.07 * S, x);
        return [['hips', 1 - t], ['thighL', t * w], ['thighR', t * (1 - w)]];
      };
      return L;
    }
    if (style === 'cardigan') {
      if (part === 'under') {
        body(0.0095, 1.02, REG.under);
        fill(0.004, REG.under);
        sleeves(L, R, { ...short, inf: 0.008, girth: 1.05, cut: 0.13, reg: REG.under });
        cap();
        neck([0, 1.475, 0.022], [0.066, 0.05, 0.07], 0.01, REG.under);
        hem(0.9, REG.under);
        return L;
      }
      L.group();
      body(0.013, 1.04);
      fill(0.016);
      sleeves(L, R, { ...long, inf: 0.012, girth: 1.12, cut: 0.5, reg: T });
      cap();
      L.sub(P_ell([0, 1.4 * S, 0.13 * S], [0.044 * S, 0.15 * S, 0.07 * S]), { k: 0.01, reg: TT });
      neck([0, 1.48, 0.0], [0.07, 0.05, 0.075], 0.01, TT);
      L.end(0);
      hem(0.87, T);
      return L;
    }
    const fit = { tshirt: 0.0095, polo: 0.0095, shirt: 0.009, hoodie: 0.015, tank: 0.007, blouse: 0.009 }[style] ?? 0.009;
    body(fit, style === 'hoodie' ? 1.05 : 1.02);
    if (style === 'tank') {
      fill(0.002);
      cap();
      neck([0, 1.47, 0.05], [0.085, 0.095, 0.085], 0.01);
      for (const s of [-1, 1]) L.sub(P_ell([s * (f ? 0.158 : 0.172) * S * Math.sqrt(G), 1.395 * S, -0.005 * S], [0.065 * S, 0.115 * S, 0.085 * S]), { k: 0.01, reg: TT });
      hem(hemY);
      return L;
    }
    if (style === 'hoodie') {
      fill(0.022);
      sleeves(L, R, { ...long, inf: 0.014, girth: 1.16, cut: 0.505, reg: T });
      L.add(P_box([0, 1.03 * S, (f ? 0.112 : 0.122) * S * G], [0.1 * S, 0.055 * S, 0.012 * S], 0.008 * S), { k: 0.012, bone: 'spine', reg: T });
      cap();
      // the hood, bunched up behind the neck in two folds (their own outline)
      L.add(P_ell([0, 1.465 * S, -0.09 * S], [0.128 * S, 0.062 * S, 0.078 * S]), { k: 0.018, bone: 'chest', reg: T });
      L.add(P_ell([0, 1.53 * S, -0.108 * S], [0.108 * S, 0.066 * S, 0.054 * S]), { k: 0.01, bone: 'chest', reg: TT });
      L.sub(P_cone([0, 1.42 * S, -0.012 * S], [0, 1.75 * S, 0.0], 0.07 * S, 0.066 * S), { k: 0.012, reg: TT });
      hem(0.91, TT);
      return L;
    }
    if (style === 'blouse') {
      fill(0.01);
      sleeves(L, R, { ...short, inf: 0.012, girth: 1.08, cut: 0.12, reg: T });
      cap();
      neck([0, 1.43, 0.085], [0.045, 0.1, 0.06], 0.012);
      neck([0, 1.48, 0.02], [0.066, 0.045, 0.07], 0.01);
      hem(0.915);
      return L;
    }
    fill(0.004 - 0.004 * sl); // slim: fitted cut
    if (style === 'shirt') {
      sleeves(L, R, { ...long, inf: 0.009, girth: 1.06, cut: 0.5, reg: T });
      if (spec.cop) for (const s of [-1, 1]) L.add(P_box([s * 0.072 * S, 1.33 * S, 0.1 * S * G], [0.042 * S, 0.047 * S, 0.008 * S], 0.005 * S, rotX(-0.2)), { k: 0.008, bone: 'chest', reg: TT });
      cap();
      neck([0, 1.478, 0.02], [0.064, 0.05, 0.068], 0.01);
      collar(0.067, 0.013, 0.42, 1.466);
    } else {
      sleeves(L, R, { ...short, inf: 0.008, girth: 1.05, cut: 0.13, reg: T });
      cap();
      neck([0, 1.475, 0.022], [0.068, 0.052, 0.072], 0.012);
      if (style === 'polo') collar(0.068, 0.011, 0.38, 1.463);
    }
    hem(hemY);
    return L;
  }

  // ---------------------------------------------------------------- clothes: bottoms
  function bottomLayer(R, h, style, spec) {
    if (style === 'none') return null; // a dress covers it all
    const S = R.S, G = R.W;
    const L = new Layer('bottom', h, { order: spec.tucked ? 5 : 3, tau: 0.012 });
    L.style = style;
    const B = REG.bottom;
    if (style === 'skirt') {
      torsoParts(L, R, { only: ['pelvis', 'glute', 'abdomen'], inf: 0.006, reg: B });
      const low = spec.elderly ? 0.38 : spec.skirtShort ? 0.53 : 0.47; // short: just above the knee
      const sl = R.slim || 0;
      // A-line: one flared cone per side hung from the hip joint, wide enough at the top to sit over the thighs
      for (const s of [1, -1]) {
        const hp = R.P[s > 0 ? 'thighL' : 'thighR'];
        const rt = 0.088 * 1.04 * G * S + 0.012 * S;
        L.add(P_cone(add(hp, [0, 0.04 * S, -0.008 * S]), [s * 0.055 * S * G, (low - 0.04) * S, -0.012 * S], rt, (0.17 - 0.01 * sl) * S * G), { k: 0.06, bone: 'hips', reg: B });
      }
      L.int(P_plane([0, -1, 0], [0, low * S, 0]), { reg: REG.bottomTrim, k: 0.01 });
      L.int(P_plane([0, 1, 0], [0, 1.0 * S, 0]), { reg: REG.bottomTrim, k: 0.008 });
      L.weightFn = (x, y, z) => {
        const t = clamp((0.95 * S - y) / (0.5 * S), 0, 1) * 0.85;
        const sl = sstep(-0.07 * S, 0.07 * S, x);
        return [['hips', 1 - t], ['thighL', t * sl], ['thighR', t * (1 - sl)]];
      };
      return L;
    }
    const berm = style === 'bermuda', shorts = style === 'shorts' || berm, cargo = style === 'cargo' || berm, track = style === 'chandal';
    const inf = berm ? 0.015 : shorts ? 0.012 : style === 'jeans' ? 0.007 : cargo ? 0.011 : track ? 0.013 : 0.009;
    const girth = berm ? 1.24 : shorts ? 1.14 : cargo ? 1.07 : track ? 1.09 : 1.03;
    torsoParts(L, R, { only: ['pelvis', 'glute', 'abdomen'], inf: 0.005, reg: B });
    L.group();
    for (const s of [1, -1]) {
      L.group();
      const lp = legParts(L, R, s, { inf, girth, reg: B, skip: ['ankle'], cut: berm ? 0.39 : shorts ? 0.24 : null, only: berm ? ['thigh', 'knee'] : shorts ? ['thigh'] : null });
      const sd = s > 0 ? 'L' : 'R';
      if (!shorts) {
        // the lower leg: straight for jeans and trousers, gathered into an elastic cuff for a tracksuit
        const r0 = (style === 'jeans' ? 0.062 : cargo ? 0.07 : track ? 0.068 : 0.066) * S * G, r1 = (track ? 0.042 : 0.053) * S * G;
        L.add(P_cone(lp.kn, add(lp.an, scl(lp.d, -0.035 * S)), r0, r1), { k: 0.05, bone: 'shin' + sd, reg: B });
        if (track) L.add(P_cone(add(lp.an, scl(lp.d, -0.075 * S)), add(lp.an, scl(lp.d, -0.035 * S)), 0.047 * S * G, 0.046 * S * G), { k: 0.012, bone: 'shin' + sd, reg: REG.bottomTrim });
      }
      if (cargo) {
        // big bellows pockets on the outside of the thighs, with flaps
        const m = alignY(lp.d), out = [s * Math.cos(0.05), Math.sin(0.05) * s * -1, 0];
        const c0 = add(add(lp.hp, scl(lp.d, (berm ? 0.25 : 0.24) * S)), scl(out, (berm ? 0.082 : 0.074) * S * G));
        L.add(P_box(c0, [0.016 * S, 0.06 * S, 0.052 * S], 0.008 * S, m), { k: 0.008, bone: 'thigh' + sd, reg: B });
        L.add(P_box(add(c0, scl(lp.d, -0.062 * S)), [0.02 * S, 0.012 * S, 0.056 * S], 0.005 * S, m), { k: 0.004, bone: 'thigh' + sd, reg: REG.bottomTrim });
      }
      L.end(0);
    }
    L.end(0.05);
    L.int(P_plane([0, 1, 0], [0, 1.0 * S, 0]), { reg: spec.tucked ? REG.belt : REG.bottomTrim, k: 0.008 });
    if (!shorts) L.int(P_plane([0, -1, 0], [0, 0.085 * S, 0]), { reg: B, k: 0.008 });
    return L;
  }

  // ---------------------------------------------------------------- hair, beard, hats (head bone frame)
  // (on a MakeHuman head, the reference skull's frame is mapped onto its own skull, so hair and hats fit it)
  function headFrame(R) {
    const hb = R.P.head, Sh = R.Sh;
    if (R.mh) {
      const d = R.f ? { c: [0, 0.094, -0.015], r: [0.074, 0.086, 0.097] } : { c: [0, 0.095, -0.015], r: [0.076, 0.088, 0.1] }, [c, r] = R.mh.cran;
      const k = [r[0] / (d.r[0] * Sh), r[1] / (d.r[1] * Sh), r[2] / (d.r[2] * Sh)];
      // (hk: how much roomier a hat is made, so a skull wider or deeper than the reference one stays inside it)
      return { hb, Sh, hk: Math.max(1, k[0], k[2]) * 1.03, H: (x, y, z) => [hb[0] + c[0] + (x - d.c[0]) * Sh * k[0], hb[1] + c[1] + (y - d.c[1]) * Sh * k[1], hb[2] + c[2] + (z - d.c[2]) * Sh * k[2]] };
    }
    return { hb, Sh, H: (x, y, z) => [hb[0] + x * Sh, hb[1] + y * Sh, hb[2] + z * Sh] };
  }
  function scalp(R) { // (its centre in the reference frame, which headFrame maps; on a MakeHuman head, that skull's size)
    const d = R.f ? { c: [0, 0.094, -0.015], r: [0.074, 0.086, 0.097] } : { c: [0, 0.095, -0.015], r: [0.076, 0.088, 0.1] };
    return R.mh ? { c: d.c, r: R.mh.cran[1].map((v) => v / R.Sh) } : d;
  }
  // hats cut away all the hair above their lower edge (and a margin round them), so nothing pokes through;
  // the hair still shows below the edge of a cap, a beret, a beanie or a straw hat
  const HATS = { gorra: 1, boina: 1, gorro: 1, sombrero: 1 };
  function hatCut(L, R, hat) {
    if (!HATS[hat]) return;
    const { H, Sh } = headFrame(R);
    const o = { w: 0 };
    L.group();
    L.add(P_sphere(H(0, 0.1, -0.01), 0.2 * Sh), o);
    if (hat === 'gorra') L.int(P_plane([0, -0.2, 0.043], H(0, 0.068, -0.1)), o);       // above the cap's rim (tilted: lower at the back)
    else if (hat === 'boina') L.int(P_plane([0, -1, 0], H(0, 0.1, 0)), o);
    else if (hat === 'gorro') L.int(P_plane([0, -1, 0.25], H(0, 0.08, 0)), o);        // the beanie comes down over the ears at the back
    else L.int(P_plane([0, -1, 0.1], H(0, 0.1, 0)), o);                               // straw hat: the crown sits on the head
    L.end(0.006, true);
  }
  // ---------------------------------------------------------------- hair: a shell over the real skull (inflated), shaped per style, in
  // locks that follow the way hair grows from the crown; long hair hangs in curtains with ragged ends
  // th: shell thickness, lk: lock depth, lf: locks round the head, top: extra volume [y, z, rx, ry, rz]
  const HAIR = {
    corto: { th: 0.0085, lk: 0.0016, lf: 9, top: [0.148, 0.012, 0.064, 0.042, 0.078] },
    tupe: { th: 0.008, lk: 0.0018, lf: 8, top: [0.146, 0.0, 0.062, 0.04, 0.078], quiff: 1 },
    peinado: { th: 0.0072, lk: 0.001, lf: 12, top: [0.146, 0.0, 0.066, 0.04, 0.082], part: 0.03 },
    rizos: { th: 0.013, lk: 0.0042, lf: 14, curly: 1, top: [0.15, 0.0, 0.072, 0.05, 0.086] },
    afro: { th: 0.03, lk: 0.006, lf: 12, curly: 1, top: [0.16, -0.01, 0.098, 0.075, 0.11] },
    cresta: { th: 0.005, lk: 0.0022, lf: 10, mohawk: 1 },
    calvo: { th: 0.005, lk: 0.0008, lf: 12, bald: 1 },
    melena: { th: 0.011, lk: 0.0022, lf: 9, long: 0.012, fringe: 1 },
    media: { th: 0.011, lk: 0.0025, lf: 8, long: -0.045 },
    largo: { th: 0.011, lk: 0.0028, lf: 8, long: -0.21 },
    coleta: { th: 0.0065, lk: 0.001, lf: 12, tail: 'pony' },
    trenza: { th: 0.0065, lk: 0.001, lf: 12, tail: 'braid' },
    mono: { th: 0.0065, lk: 0.001, lf: 12, tail: 'bun' },
  };
  function hairLayer(R, h, style, spec) {
    const Y = HAIR[style];
    if (!Y) return spec.beard ? beardOnly(R, h, spec) : null; // rapado (painted on the scalp) or none
    // a man's short hair under a cap or a hat: what shows of it is painted on the skin (a thin shell only left crumbs)
    if (HATS[spec.hat] && !R.f && Y.long == null && !Y.tail && spec.hair !== 'afro') return spec.beard ? beardOnly(R, h, spec) : null;
    const L = new Layer('hair', h, { order: 6, tau: 0.02 });
    const { H, Sh } = headFrame(R);
    const f = R.f, hat = HATS[spec.hat] ? spec.hat : null;
    const cr = H(Y.part || 0, 0.188, -0.022);
    const LK = (amp, fa, fr) => [amp * Sh, fa, fr / Sh, cr[0], cr[1], cr[2]];
    const lk = LK(hat ? Y.lk * 0.4 : Y.lk, Y.lf, 22);
    const E = (c, r, o = {}) => L.add(P_ell(H(...c), [r[0] * Sh, r[1] * Sh, r[2] * Sh], o.m || null), { k: o.k ?? 0.02, inf: o.inf || 0, bone: o.bone || 'head', reg: o.reg ?? REG.hair, nz: o.nz || 0, nf: o.nf || 1, w: o.w ?? 1, lk: o.lk === undefined ? lk : o.lk, tp: o.tp || null });
    const X = (c, r, k = 0.01) => L.sub(P_sphere(H(...c), r * Sh), { k, reg: REG.hair });
    const XE = (c, r, k = 0.01, m = null) => L.sub(P_ell(H(...c), [r[0] * Sh, r[1] * Sh, r[2] * Sh], m), { k, reg: REG.hair });
    const long = Y.long != null;
    const curly = !!Y.curly;
    L.group();
    // the shell: the real skull inflated evenly, so the scalp never pokes through behind the ears or at the nape
    const cz = curly ? { nz: 0.0045 * Sh * (Y.th > 0.02 ? 1.4 : 1), nf: 55 / Sh } : { nz: 0.0006 * Sh, nf: 140 / Sh };
    const N = H(0, -0.005, -0.095), hn = nrm(f ? [0, -0.2, 0.133] : [0, -0.185, 0.143]);
    let tp = !long && !Y.bald && style !== 'afro' ? [hn[0], hn[1], hn[2], dot(hn, N), 0.036 * Sh] : null, tp2 = null;
    // men's short cuts: shorter over the ears and at the back (a fade)
    if (!f && !long && !curly && !Y.bald) { const sp = H(0, 0.118, 0); tp2 = [0, -1, 0, -sp[1], 0.045 * Sh, 0.35]; }
    // bald on top: the fringe of hair thins out towards the bare crown and the forehead
    if (Y.bald) { const n1 = nrm([0, 1, 0.35]), p1 = H(0, 0.108, -0.02), p2 = H(0, 0, 0.035); tp = [n1[0], n1[1], n1[2], dot(n1, p1), 0.03 * Sh]; tp2 = [0, 0, 1, p2[2], 0.04 * Sh, 0]; }
    skullOps(L, R, headLandmarks(R), Y.th * Sh, { reg: REG.hair, hair: true, ...cz, lk: curly ? null : lk, tp, tp2 });
    if (Y.top && !hat) {
      // extra volume on top, kept a couple of centimetres back from the hairline so the front edge stays thin
      L.group();
      E([0, Y.top[0], Y.top[1]], [Y.top[2], Y.top[3], Y.top[4]], { k: 0.035, ...(curly ? cz : {}) });
      if (tp) L.int(P_plane(hn, sub(N, scl(hn, 0.022 * Sh))), { reg: REG.hair, k: 0.02 * Sh });
      L.end(0.03);
    }
    if (Y.quiff && !hat) { // swept up and back off the forehead
      E([0, 0.163, 0.062], [0.05, 0.03, 0.045], { k: 0.035, m: rotX(-0.45) });
      E([0, 0.172, 0.03], [0.052, 0.03, 0.05], { k: 0.03 });
    }
    if (Y.part && !hat) { // side parting: a fine groove, more volume on the far side
      L.sub(P_cone(H(Y.part, 0.2, -0.05), H(Y.part * 0.9, 0.175, 0.085), 0.0025 * Sh, 0.002 * Sh), { k: 0.004, reg: REG.hair });
      E([-Y.part, 0.16, 0.035], [0.05, 0.03, 0.06], { k: 0.03 });
    }
    if (f && style === 'corto') E([0, 0.138, 0.083], [0.058, 0.024, 0.02], { k: 0.02, m: rotX(-0.35) }); // a short fringe
    if (Y.fringe) E([0, 0.12, 0.078], [0.062, 0.035, 0.03], { k: 0.025, m: rotX(-0.25), lk: LK(0.0018, 14, 40) });
    if (long) {
      // curtains: behind the head down the back, and at the sides over the ears, framing the face
      const low = Y.long, midY = (0.12 + low) / 2, hy = (0.12 - low) / 2;
      E([0, midY, -0.045], [0.088, hy + 0.02, 0.085], { k: 0.04, bone: low < -0.1 ? 'chest' : 'head', lk: LK(Y.lk * 1.3, Y.lf, 6) });
      for (const sd of [-1, 1]) E([sd * 0.068, midY + 0.02, 0.012], [0.03, hy + 0.01, 0.05], { k: 0.035, lk: LK(Y.lk, Y.lf, 6) });
      // the face stays clear; the ends are ragged (separate locks)
      XE([0, 0.02, 0.11], [0.058, 0.115, 0.085], 0.015);
      L.int(P_plane([0, -1, 0], H(0, low, 0)), { reg: REG.hair, k: 0.012 * Sh, lk: LK(0.016, 9, 2) });
      if (low > -0.02) L.int(P_plane([0, -0.25, -1], H(0, 0, -0.14)), { reg: REG.hair, k: 0.02 }); // a bob stops short of the neck at the back
    }
    if (style === 'afro') XE([0, 0.02, 0.11], [0.062, 0.1, 0.09], 0.02);
    // hairline: keep the crown side of the forehead–nape line (ragged, it thins out), free the ears and (men) the temples
    if (!long && !Y.bald) L.int(P_plane(hn, N), { reg: REG.hair, k: 0.006 * Sh, nz: 0.0016 * Sh, nf: 170 / Sh });
    if (!long && style !== 'afro') for (const sd of [-1, 1]) X([sd * 0.079, 0.068, -0.01], 0.03, 0.012);
    if (!f && !long && !Y.bald && style !== 'afro') for (const sd of [-1, 1]) X([sd * 0.06, 0.13, 0.08], 0.019, 0.012);
    if (Y.bald) { L.int(P_plane([0, 1, 0.35], H(0, 0.108, -0.02)), { reg: REG.hair, k: 0.01 * Sh, nz: 0.002 * Sh, nf: 120 / Sh }); L.int(P_plane([0, 0, 1], H(0, 0, 0.035)), { reg: REG.hair, k: 0.01 * Sh }); }
    if (Y.mohawk) L.int(P_box(H(0, 0.14, -0.01), [0.022 * Sh, 0.1 * Sh, 0.13 * Sh], 0.012 * Sh), { reg: REG.hair, k: 0.008 });
    if (hat) hatCut(L, R, hat);
    L.end(0);
    if (Y.mohawk && !hat) {
      // the crest: an arc along the middle of the skull from the hairline back to the nape, standing up in spikes
      L.group();
      L.add(P_torus(H(0, 0.095, -0.018), 0.098 * Sh, 0.012 * Sh, alignY([1, 0, 0])), { k: 0, bone: 'head', reg: REG.hair, lk: LK(0.006, 5, 60) });
      L.int(P_plane(hn, N), { reg: REG.hair, k: 0.01 * Sh });
      L.int(P_plane([0, -1, 0], H(0, 0.06, 0)), { reg: REG.hair, k: 0.01 * Sh });
      L.end(0.018);
    }
    if (!f && !long && !Y.bald && style !== 'afro' && !Y.mohawk && !hat) for (const sd of [-1, 1]) E([sd * 0.0725, 0.074, 0.012], [0.0045, 0.015, 0.008], { k: 0.01, lk: null }); // sideburns
    // ponytail, braid or bun on the hair bones
    if (Y.tail === 'pony' || Y.tail === 'braid') {
      const p0 = R.P.hair1, p2 = R.P.hair2;
      const p1 = add(p0, [0, -0.06 * Sh, -0.03 * Sh]), p3 = add(p2, [0, -0.09 * Sh, 0.005 * Sh]);
      L.add(P_torus(add(p0, [0, -0.012 * Sh, -0.012 * Sh]), 0.0165 * Sh, 0.0045 * Sh, alignY(nrm([0, -0.6, -0.8]))), { k: 0.003, bone: 'hair1', reg: REG.hairTie });
      if (Y.tail === 'pony') {
        const t = { nz: 0.0015 * Sh, nf: 90 / Sh, reg: REG.hair };
        L.add(P_cone(p0, p1, 0.02 * Sh, 0.027 * Sh), { k: 0.012, bone: 'hair1', ...t });
        L.add(P_cone(p1, p2, 0.027 * Sh, 0.023 * Sh), { k: 0.012, bone: 'hair2', ...t });
        L.add(P_cone(p2, p3, 0.023 * Sh, 0.008 * Sh), { k: 0.012, bone: 'hair2', ...t });
      } else {
        // three strands plaited: overlapping lobes, alternating side to side, getting thinner
        const pts = [p0, p1, p2, p3];
        for (let i = 0; i < 14; i++) {
          const u = i / 13, seg = Math.min(2, Math.floor(u * 3)), tt = u * 3 - seg;
          const c = lerp3(pts[seg], pts[seg + 1], tt), side = (i % 2 ? 1 : -1) * 0.007 * Sh * (1 - 0.5 * u);
          const r0 = (0.016 - 0.009 * u) * Sh;
          L.add(P_ell(add(c, [side, 0, 0]), [r0 * 0.9, r0 * 1.35, r0 * 0.8]), { k: 0.004, bone: u < 0.3 ? 'hair1' : 'hair2', reg: REG.hair });
        }
        L.add(P_sphere(add(p3, [0, 0.004 * Sh, 0]), 0.0065 * Sh), { k: 0.003, bone: 'hair2', reg: REG.hairTie });
      }
    }
    if (Y.tail === 'bun') {
      E([0, 0.158, -0.078], [0.043, 0.04, 0.043], { k: 0.012, nz: 0.0015 * Sh, nf: 90 / Sh, lk: null });
      L.add(P_torus(H(0, 0.135, -0.07), 0.028 * Sh, 0.005 * Sh, alignY([0, 0.6, -0.8])), { k: 0.004, bone: 'head', reg: REG.hairTie });
    }
    // (beards are painted on the skin, characters.js: the old shells poked through the jaw in patches)
    if (long) {
      // loose hair behind and below the ears rides on hair2 (a pivot at the back of the head) so it can swing
      const hb = R.P.head;
      L.post = (x, y, z, acc) => {
        const hy = (y - hb[1]) / Sh, hz = (z - hb[2]) / Sh;
        const t = clamp((0.045 - hy) / 0.13, 0, 1) * clamp((0.035 - hz) / 0.05, 0, 1) * 0.85;
        if (t <= 0) return;
        let tot = 0;
        for (const b of ['head', 'chest']) if (acc[b]) { const m = acc[b] * t; acc[b] -= m; tot += m; }
        acc.hair2 = (acc.hair2 || 0) + tot;
      };
    }
    return L;
  }
  // beards: 'short', 'full', 'perilla' (goatee), 'bigote' (moustache); 'barba3' is stubble, painted only
  function beardPrims(L, R, spec) {
    const { H, Sh } = headFrame(R);
    const st = spec.beard;
    const t = (st === 'full' ? 0.008 : 0.0035) * Sh;
    const o = (k, bone = 'jaw') => ({ k, inf: t, bone, reg: REG.beard, nz: 0.001 * Sh, nf: 160 / Sh });
    L.group();
    if (st === 'short' || st === 'full') {
      L.add(P_ell(H(0, -0.03, 0.074), [0.022 * Sh, 0.019 * Sh, 0.017 * Sh]), o(0));
      for (const s of [-1, 1]) {
        L.add(P_cone(H(s * 0.047, -0.008, -0.012), H(s * 0.05, 0.05, -0.012), 0.013 * Sh, 0.0117 * Sh), o(0.015));
        L.add(P_cone(H(s * 0.047, -0.008, -0.012), H(s * 0.018, -0.035, 0.07), 0.013 * Sh, 0.0137 * Sh), o(0.015));
        L.add(P_ell(H(s * 0.042, 0.03, 0.045), [0.024 * Sh, 0.03 * Sh, 0.03 * Sh]), o(0.03, 'head'));
      }
      L.add(P_ell(H(0, -0.012, 0.045), [0.034 * Sh, 0.024 * Sh, 0.038 * Sh]), o(0.03));
      L.add(P_ell(H(0, 0.008, 0.08), [0.03 * Sh, 0.024 * Sh, 0.022 * Sh]), o(0.02, 'head'));
      L.int(P_plane([0, 1, 0.72], H(0, 0.066, 0)), { reg: REG.beard }); // cheek line slopes down towards the mouth
      L.int(P_plane([0, 0, -1], H(0, 0, -0.035)), { reg: REG.beard });
    }
    if (st === 'perilla') { // chin and a strip under the lip, joined to the moustache at the corners
      L.add(P_ell(H(0, -0.028, 0.075), [0.017 * Sh, 0.02 * Sh, 0.016 * Sh]), o(0));
      for (const s of [-1, 1]) L.add(P_cone(H(s * 0.022, 0.012, 0.09), H(s * 0.017, -0.022, 0.08), 0.004 * Sh, 0.006 * Sh), o(0.008));
      L.add(P_ell(H(0, -0.006, 0.094), [0.006 * Sh, 0.005 * Sh, 0.004 * Sh]), o(0.004));
    }
    L.add(P_ell(H(0, 0.021, 0.094), [0.025 * Sh, 0.0062 * Sh, 0.0092 * Sh]), o(0.008, 'head')); // moustache (all styles)
    L.sub(P_ell(H(0, 0.006, 0.1), [0.022 * Sh, 0.0095 * Sh, 0.03 * Sh]), { k: 0.003, reg: REG.beard });
    L.end(0.004);
  }
  function beardOnly(R, h, spec) {
    if (!spec.beard || spec.beard === 'barba3' || !spec.beardShell) return null;
    const L = new Layer('hair', h, { order: 6, tau: 0.02 });
    beardPrims(L, R, spec);
    return L;
  }
  function hatLayer(R, h, hat) {
    if (!HATS[hat]) return null;
    const L = new Layer('hat', h, { order: 7, tau: 0.02 });
    const hf = headFrame(R), H = hf.H, Sh = hf.Sh * (hf.hk || 1), Shy = hf.Sh; // (roomier round a MakeHuman head, not taller)
    if (hat === 'gorra') {
      L.group();
      L.add(P_ell(H(0, 0.1, -0.008), [0.088 * Sh, 0.1 * Shy, 0.108 * Sh]), { bone: 'head', reg: REG.cap });
      L.int(P_plane([0, -0.2, 0.043], H(0, 0.075, -0.1)), { reg: REG.capBrim });
      L.end(0);
      L.group();
      L.add(P_ell(H(0, 0.119, 0.1), [0.08 * Sh, 0.008 * Shy, 0.078 * Sh], rotX(-0.12)), { bone: 'head', reg: REG.capBrim });
      L.int(P_plane([0, 0, -1], H(0, 0, 0.06)), { reg: REG.capBrim });
      L.end(0.01);
      L.add(P_sphere(H(0, 0.198, -0.008), 0.007 * Sh), { k: 0.004, bone: 'head', reg: REG.cap });
    } else if (hat === 'boina') {
      L.add(P_ell(H(0.008, 0.158, -0.01), [0.106 * Sh, 0.034 * Shy, 0.112 * Sh]), { bone: 'head', reg: REG.cap });
      L.group();
      const sc = scalp(R);
      L.add(P_ell(H(...sc.c), [sc.r[0] * Sh, sc.r[1] * Shy, sc.r[2] * Sh]), { inf: 0.007 * Sh, bone: 'head', reg: REG.cap });
      L.int(P_plane([0, -1, 0], H(0, 0.112, 0)), { reg: REG.cap });
      L.end(0.025);
      L.add(P_sphere(H(0.008, 0.193, -0.01), 0.006 * Sh), { k: 0.004, bone: 'head', reg: REG.cap });
    } else if (hat === 'gorro') {
      // knitted beanie: snug over the skull, a turned-up band, a little slouch at the back
      const sc = scalp(R);
      L.group();
      L.add(P_ell(H(...sc.c), [sc.r[0] * Sh, sc.r[1] * Shy, sc.r[2] * Sh]), { inf: 0.009 * Sh, bone: 'head', reg: REG.cap });
      L.add(P_ell(H(0, 0.16, -0.045), [0.07 * Sh, 0.05 * Shy, 0.07 * Sh]), { k: 0.03, bone: 'head', reg: REG.cap });
      L.int(P_plane([0, -1, 0.25], H(0, 0.085, 0)), { reg: REG.capBrim });
      L.end(0);
      L.group();
      L.add(P_ell(H(...sc.c), [sc.r[0] * Sh, sc.r[1] * Shy, sc.r[2] * Sh]), { inf: 0.014 * Sh, bone: 'head', reg: REG.capBrim });
      L.int(P_plane([0, -1, 0.25], H(0, 0.085, 0)), { reg: REG.capBrim });
      L.int(P_plane([0, 1, -0.25], H(0, 0.118, 0)), { reg: REG.capBrim });
      L.end(0.004);
    } else {
      // straw hat (sombrero de paja): a rounded crown with a band, a wide brim
      // (the crown sits a little forward and roomier: the forehead used to poke through its front)
      L.add(P_cone(H(0, 0.1, -0.006), H(0, 0.205, -0.01), 0.103 * Sh, 0.087 * Sh), { bone: 'head', reg: REG.cap, k: 0 });
      L.add(P_ell(H(0, 0.2, -0.012), [0.085 * Sh, 0.02 * Shy, 0.09 * Sh]), { k: 0.02, bone: 'head', reg: REG.cap });
      L.sub(P_ell(H(0, 0.22, -0.012), [0.03 * Sh, 0.02 * Shy, 0.06 * Sh]), { k: 0.012, reg: REG.cap }); // the dent on top
      L.add(P_cone(H(0, 0.11, -0.006), H(0, 0.135, -0.007), 0.105 * Sh, 0.097 * Sh), { k: 0.003, bone: 'head', reg: REG.capBrim });
      L.group();
      L.add(P_ell(H(0, 0.108, -0.012), [0.19 * Sh, 0.012 * Shy, 0.19 * Sh]), { bone: 'head', reg: REG.cap });
      L.add(P_torus(H(0, 0.105, -0.012), 0.182 * Sh, 0.006 * Sh), { k: 0.004, bone: 'head', reg: REG.cap });
      L.end(0.008);
    }
    return L;
  }
  // a point moved out of a layer (along its field's gradient) until it sits gap outside it: straps and strings lie on
  // whatever the clothes are, however loose (a roomy hoodie used to swallow them)
  function onSurface(layer, p, gap) {
    if (!layer) return p;
    const tmp = layer._tmpS || (layer._tmpS = new Int32Array(layer.ops.length + 1));
    const f = (x, y, z) => layer.evalAt(x, y, z, tmp), e = 0.0015;
    let q = p.slice();
    for (let i = 0; i < 10; i++) {
      const d = f(q[0], q[1], q[2]);
      if (d >= gap - 0.0004) break;
      const g = nrm([f(q[0] + e, q[1], q[2]) - f(q[0] - e, q[1], q[2]), f(q[0], q[1] + e, q[2]) - f(q[0], q[1] - e, q[2]), f(q[0], q[1], q[2] + e) - f(q[0], q[1], q[2] - e)]);
      q = add(q, scl(g, Math.min(0.03, gap - d)));
    }
    return q;
  }
  function bagLayer(R, h, top) {
    const L = new Layer('bag', h, { order: 8, tau: 0.05 });
    const S = R.S, G = R.W;
    const Pp = (x, y, z) => [x * S * G, y * S, z * S * G];
    // the pack against the back of the top: its front face just into the cloth
    let zb = -0.132 * S * G;
    if (top) { const tmp = new Int32Array(top.ops.length + 1); while (zb > -0.3 * S && top.evalAt(0, 1.26 * S, zb, tmp) < 0) zb -= 0.002 * S; }
    const back = Math.min(0, zb + 0.132 * S * G + 0.006 * S);
    L.add(P_box(add(Pp(0, 1.255, -0.2), [0, 0, back]), [0.152 * S, 0.19 * S, 0.07 * S], 0.036 * S), { bone: 'chest', reg: REG.bag });
    L.add(P_box(add(Pp(0, 1.16, -0.268), [0, 0, back]), [0.118 * S, 0.078 * S, 0.028 * S], 0.02 * S), { k: 0.012, bone: 'chest', reg: REG.bagTrim });
    for (const s of [-1, 1]) {
      const pts = [Pp(s * 0.08, 1.41, -0.15), Pp(s * 0.098, 1.515, -0.03), Pp(s * 0.115, 1.45, 0.112), Pp(s * 0.128, 1.33, 0.118), Pp(s * 0.15, 1.24, 0.085), Pp(s * 0.15, 1.15, -0.1)]
        .map((p, i) => (i === 0 ? add(p, [0, 0, back]) : onSurface(top, p, 0.011 * S)));
      for (let i = 0; i < pts.length - 1; i++) {
        const mid = lerp3(pts[i], pts[i + 1], 0.5), yv = nrm(sub(pts[i + 1], pts[i]));
        let out = sub(mid, [0, mid[1], -0.02 * S]);
        out = nrm(sub(out, scl(yv, dot(out, yv))));
        const xv = cross(yv, out);
        L.add(P_box(mid, [0.02 * S, len(sub(pts[i + 1], pts[i])) * 0.5 + 0.008 * S, 0.006 * S], 0.005 * S, [xv[0], xv[1], xv[2], yv[0], yv[1], yv[2], out[0], out[1], out[2]]), { k: 0.008, bone: 'chest', reg: REG.bagTrim });
      }
    }
    return L;
  }

  // ---------------------------------------------------------------- explicit meshes (eyes, lids, tubes)
  class Acc {
    constructor() { this.P = new FArr(); this.N = new FArr(); this.I = new IArr(); this.reg = []; this.bone = []; this.face = null; }
    get nv() { return this.P.n / 3; }
    v(p, n, reg, bone) { this.P.push3(p[0], p[1], p[2]); const l = len(n) || 1; this.N.push3(n[0] / l, n[1] / l, n[2] / l); this.reg.push(reg); this.bone.push(bone); return this.nv - 1; }
    t(a, b, c) { this.I.push3(a, b, c); }
    q(a, b, c, d) { this.I.push3(a, b, c); this.I.push3(a, c, d); }
  }
  function eyeMesh(A, C, re, bone, lo = false) {
    const rings = lo ? [[0.0, REG.pupil], [0.17, REG.pupil], [0.19, REG.iris], [0.41, REG.iris], [0.45, REG.eyeWhite], [1.0, REG.eyeWhite], [2.0, REG.eyeWhite]]
      : [[0.0, REG.pupil], [0.165, REG.pupil], [0.18, REG.iris], [0.27, REG.iris], [0.37, REG.iris], [0.405, REG.iris], [0.412, REG.iris], [0.445, REG.iris], [0.452, REG.eyeWhite], [0.7, REG.eyeWhite], [1.1, REG.eyeWhite], [1.6, REG.eyeWhite], [2.3, REG.eyeWhite], [3.1, REG.eyeWhite]];
    const seg = lo ? 9 : 18;
    const bulge = (th) => 1 + 0.075 * (1 - sstep(0.22, 0.52, th));
    const pole = A.v([C[0], C[1], C[2] + re * bulge(0)], [0, 0, 1], REG.pupil, bone);
    let prev = null;
    for (let r = 1; r < rings.length; r++) {
      const [th, reg] = rings[r];
      const rr = re * bulge(th);
      const row = [];
      for (let i = 0; i < seg; i++) {
        const ph = (i / seg) * TAU;
        const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        row.push(A.v(add(C, scl(d, rr)), d, reg, bone));
      }
      if (!prev) for (let i = 0; i < seg; i++) A.t(pole, row[i], row[(i + 1) % seg]);
      else for (let i = 0; i < seg; i++) A.q(prev[i], row[i], row[(i + 1) % seg], prev[(i + 1) % seg]);
      prev = row;
    }
  }
  // eyelid shell around the eyeball: azimuth a (0 = forward), elevation b; upper lids blink on their own bone
  function lidMesh(A, C, re, Sh, upper, bone, lo = false) {
    const na = lo ? 6 : 14, nb = lo ? 3 : 6, aMax = 1.3;
    const rO = re + (upper ? 0.0036 : 0.0033) * Sh, rI = re + 0.0006 * Sh;
    const margin = (a) => (upper ? 0.34 - 0.27 * (a / aMax) ** 2 : -0.4 + 0.31 * (a / aMax) ** 2);
    const far = upper ? 1.62 : -1.3;
    const dir = (a, b) => [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
    const grid = [];
    for (let i = 0; i <= na; i++) {
      const a = -aMax + (2 * aMax * i) / na, m0 = margin(a);
      const col = [];
      // rim: inner edge → outer edge (the dark lash line), then the lid skin out to 'far'
      const dm = dir(a, m0), dIn = dir(a, m0 + (upper ? 0.05 : -0.05));
      col.push(A.v(add(C, scl(dIn, rI)), upper ? [0, -1, 0.3] : [0, 1, 0.3], upper ? REG.lash : REG.lid, bone));
      col.push(A.v(add(C, scl(dm, (rI + rO) * 0.5 + 0.0003 * Sh)), add(dm, [0, upper ? -0.8 : 0.8, 0]), upper ? REG.lash : REG.lid, bone));
      for (let j = 0; j <= nb; j++) {
        const t = j / nb, b = mix(m0, far, t * t * 0.6 + t * 0.4);
        const d = dir(a, b);
        const bulge = 1 + (upper ? 0.1 : 0.05) * Math.sin(Math.PI * clamp(t * 1.4, 0, 1)) * (1 - Math.abs(a) / aMax);
        col.push(A.v(add(C, scl(d, rO * bulge)), d, j === 0 ? REG.lash : REG.lid, bone));
      }
      grid.push(col);
    }
    const rows = grid[0].length;
    for (let i = 0; i < na; i++) for (let j = 0; j < rows - 1; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      if (upper) A.q(a, b, c, d); else A.q(a, d, c, b);
    }
    if (!lo) { // lashes: a strip that curls up and out (upper: long, lower: short), cut into single hairs by the shader
      const L1 = (upper ? 0.0058 : 0.0022) * Sh, curl = upper ? 0.16 : -0.08;
      for (let i = 0; i < na; i++) {
        const a0 = -aMax + (2 * aMax * i) / na, a1 = -aMax + (2 * aMax * (i + 1)) / na;
        const fade = (a) => (1 - (Math.abs(a) / aMax) ** 3) * (upper ? 1 - 0.25 * Math.max(0, -a * Math.sign(C[0] || 1)) : 0.7);
        const ring = (a, t) => { const m0 = margin(a), f0 = fade(a); return add(C, scl(dir(a, m0 + (upper ? 1 : -1) * 0.015 + curl * t * t * f0), rO - 0.0004 * Sh + L1 * f0 * t)); };
        const ts = [0, 0.5, 1];
        for (let k = 0; k < 2; k++) {
          const nn = dir((a0 + a1) / 2, margin((a0 + a1) / 2) + (upper ? 0.9 : -0.9));
          const v0 = A.v(ring(a0, ts[k]), nn, REG.lashF, bone), v1 = A.v(ring(a1, ts[k]), nn, REG.lashF, bone), v2 = A.v(ring(a1, ts[k + 1]), nn, REG.lashF, bone), v3 = A.v(ring(a0, ts[k + 1]), nn, REG.lashF, bone);
          A.q(v0, v1, v2, v3); A.q(v0, v3, v2, v1);
        }
      }
    }
  }
  // tube along a polyline (world points), radius r, closed loop optional
  function tubeMesh(A, pts, r, reg, bone, seg = 6, closed = false) {
    const n = pts.length;
    let prevRow = null, firstRow = null;
    let ref = [0, 1, 0];
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const t = nrm(sub(b, a));
      if (Math.abs(dot(t, ref)) > 0.9) ref = [1, 0, 0];
      const u = nrm(cross(t, ref)), w = cross(t, u);
      const row = [];
      const rr = typeof r === 'function' ? r(i / (n - 1)) : r;
      for (let k = 0; k < seg; k++) {
        const ph = (k / seg) * TAU, d = add(scl(u, Math.cos(ph)), scl(w, Math.sin(ph)));
        row.push(A.v(add(pts[i], scl(d, rr)), d, reg, bone));
      }
      if (prevRow) for (let k = 0; k < seg; k++) A.q(prevRow[k], prevRow[(k + 1) % seg], row[(k + 1) % seg], row[k]);
      else firstRow = row;
      prevRow = row;
    }
    if (closed) for (let k = 0; k < seg; k++) A.q(prevRow[k], prevRow[(k + 1) % seg], firstRow[(k + 1) % seg], firstRow[k]);
    else {
      for (const [row, p, s] of [[firstRow, pts[0], -1], [prevRow, pts[n - 1], 1]]) {
        const c = A.v(p, scl(nrm(sub(pts[n - 1], pts[0])), s), reg, bone);
        for (let k = 0; k < seg; k++) if (s > 0) A.t(row[k], row[(k + 1) % seg], c); else A.t(row[(k + 1) % seg], row[k], c);
      }
    }
  }
  function glassesMesh(A, R) {
    const { H, Sh } = headFrame(R);
    const z = 0.099, y0 = 0.076;
    for (const s of [-1, 1]) {
      const loop = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        const cx = Math.cos(a), cy = Math.sin(a);
        const px = Math.sign(cx) * Math.pow(Math.abs(cx), 0.7) * 0.025, py = Math.sign(cy) * Math.pow(Math.abs(cy), 0.8) * 0.017;
        loop.push(H(s * 0.033 + px, y0 + py, z - 0.005 * Math.abs(px + s * 0.008) / 0.033));
      }
      tubeMesh(A, loop, 0.0021 * Sh, REG.frame, 'head', 6, true);
      const c = A.v(H(s * 0.033, y0, z - 0.001), [0, 0, 1], REG.lens, 'head');
      const ring = loop.map((p) => A.v(p, [0, 0, 1], REG.lens, 'head'));
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; A.t(c, a, b); A.t(c, b, a); }
      tubeMesh(A, [H(s * 0.058, y0 + 0.005, z - 0.005), H(s * 0.073, y0 + 0.005, 0.06), H(s * 0.079, y0 + 0.001, 0.0), H(s * 0.078, y0 - 0.01, -0.022)], 0.0019 * Sh, REG.frame, 'head', 5);
    }
    tubeMesh(A, [H(-0.009, y0 + 0.005, z), H(0, y0 + 0.008, z + 0.002), H(0.009, y0 + 0.005, z)], 0.0019 * Sh, REG.frame, 'head', 5);
  }

  // small gold hoops through the earlobes
  function earringsMesh(A, R) {
    const { H, Sh } = headFrame(R);
    for (const s of [-1, 1]) {
      const loop = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; loop.push(H(s * 0.079, 0.034 + Math.cos(a) * 0.0075, -0.007 + Math.sin(a) * 0.0075)); }
      tubeMesh(A, loop, 0.0009 * Sh, REG.metal, 'head', 4, true);
    }
  }
  // a watch on the left wrist: strap round the forearm, the case on the back of the wrist
  function watchMesh(A, R) {
    const w = R.P.handL, e = R.P.foreL, d = nrm(sub(w, e)), S = R.S, G = R.W;
    const c = add(w, scl(d, -0.03 * S));
    const x = nrm(cross(d, [0, 0, 1])), z = cross(x, d);
    const r = (0.028 * (R.f ? 0.86 : 1) * G + 0.002) * S;
    const loop = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; loop.push(add(c, add(scl(x, Math.cos(a) * r), scl(z, Math.sin(a) * r * 0.85)))); }
    tubeMesh(A, loop, 0.0035 * S, REG.frame, 'foreL', 4, true);
    const face = add(c, scl(x, r + 0.002 * S)), ring = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ring.push(add(face, add(scl(d, Math.cos(a) * 0.012 * S), scl(z, Math.sin(a) * 0.012 * S)))); }
    tubeMesh(A, ring, 0.0022 * S, REG.metal, 'foreL', 4, true);
    const cv = A.v(add(face, scl(x, 0.001 * S)), x, REG.lens, 'foreL'), rv = ring.map((p) => A.v(p, x, REG.lens, 'foreL'));
    for (let i = 0; i < rv.length; i++) { A.t(cv, rv[i], rv[(i + 1) % rv.length]); A.t(cv, rv[(i + 1) % rv.length], rv[i]); }
  }

  // ---------------------------------------------------------------- mesh simplification (quadric error, half-edge collapses)
  // Vertices on region boundaries and open borders are locked so colour edges and seams stay put.
  class Heap {
    constructor(n = 1024) { this.c = new Float64Array(n); this.u = new Int32Array(n); this.v = new Int32Array(n); this.su = new Int32Array(n); this.sv = new Int32Array(n); this.size = 0; }
    grow() {
      const n = this.c.length * 2;
      for (const k of ['c', 'u', 'v', 'su', 'sv']) { const b = new this[k].constructor(n); b.set(this[k]); this[k] = b; }
    }
    swap(i, j) {
      const C = this.c, U = this.u, V = this.v, SU = this.su, SV = this.sv;
      let t = C[i]; C[i] = C[j]; C[j] = t;
      let q = U[i]; U[i] = U[j]; U[j] = q; q = V[i]; V[i] = V[j]; V[j] = q;
      q = SU[i]; SU[i] = SU[j]; SU[j] = q; q = SV[i]; SV[i] = SV[j]; SV[j] = q;
    }
    push(c, u, v, su, sv) {
      if (this.size >= this.c.length) this.grow();
      let i = this.size++;
      this.c[i] = c; this.u[i] = u; this.v[i] = v; this.su[i] = su; this.sv[i] = sv;
      const C = this.c;
      while (i > 0) { const p = (i - 1) >> 1; if (C[p] <= C[i]) break; this.swap(p, i); i = p; }
    }
    pop(out) {
      const C = this.c;
      out[0] = C[0]; out[1] = this.u[0]; out[2] = this.v[0]; out[3] = this.su[0]; out[4] = this.sv[0];
      const n = --this.size;
      if (!n) return;
      this.swap(0, n);
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < n && C[l] < C[m]) m = l;
        if (r < n && C[r] < C[m]) m = r;
        if (m === i) break;
        this.swap(m, i); i = m;
      }
    }
  }
  function decimate(P, maxErr, ratio) {
    const nv = P.nv, pos = P.pos, idx = P.idx.slice(), nt = idx.length / 3;
    if (nt < 40) return P;
    const _t0 = performance.now();
    const Q = new Float64Array(nv * 10);
    const alive = new Uint8Array(nt).fill(1);
    const vt = new Array(nv);
    for (let v = 0; v < nv; v++) vt[v] = [];
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vt[idx[t * 3 + k]].push(t);
    const tn = new Float32Array(nt * 3);
    const area = new Float64Array(nv);
    for (let t = 0; t < nt; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const ar = Math.hypot(nx, ny, nz) || 1e-12;
      nx /= ar; ny /= ar; nz /= ar;
      tn[t * 3] = nx; tn[t * 3 + 1] = ny; tn[t * 3 + 2] = nz;
      const d = -(nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2]), w = ar * 0.5;
      const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
      for (let k = 0; k < 3; k++) { const vi = idx[t * 3 + k], o = vi * 10; area[vi] += w; for (let j = 0; j < 10; j++) Q[o + j] += q[j] * w; }
    }
    const qerr = (o1, o2, x, y, z) => {
      const a0 = Q[o1] + Q[o2], a1 = Q[o1 + 1] + Q[o2 + 1], a2 = Q[o1 + 2] + Q[o2 + 2], a3 = Q[o1 + 3] + Q[o2 + 3], a4 = Q[o1 + 4] + Q[o2 + 4];
      const a5 = Q[o1 + 5] + Q[o2 + 5], a6 = Q[o1 + 6] + Q[o2 + 6], a7 = Q[o1 + 7] + Q[o2 + 7], a8 = Q[o1 + 8] + Q[o2 + 8], a9 = Q[o1 + 9] + Q[o2 + 9];
      return a0 * x * x + 2 * a1 * x * y + 2 * a2 * x * z + 2 * a3 * x + a4 * y * y + 2 * a5 * y * z + 2 * a6 * y + a7 * z * z + 2 * a8 * z + a9;
    };
    // locks: region boundaries and open borders
    const lock = new Uint8Array(nv);
    const reg = P.reg;
    const edgeCount = new Map();
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
      const a = idx[t * 3 + k], b = idx[t * 3 + ((k + 1) % 3)];
      if (reg[a] !== reg[b]) { lock[a] = 1; lock[b] = 1; }
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
    for (const [key, c] of edgeCount) if (c !== 2) { lock[Math.floor(key / 1048576)] = 1; lock[key % 1048576] = 1; }
    const _t1 = performance.now();
    const stamp = new Int32Array(nv);
    const dead = new Uint8Array(nv);
    const H = new Heap(nt * 4);
    const mark = new Int32Array(nv), mark2 = new Int32Array(nv);
    let tok = 0, tok2 = 0;
    const NB = new Int32Array(512);
    // neighbours of v into NB (deduplicated with a token), returns count
    const nbs = (v, M, t) => {
      let n = 0;
      for (const tr of vt[v]) if (alive[tr]) for (let k = 0; k < 3; k++) { const w = idx[tr * 3 + k]; if (w !== v && M[w] !== t) { M[w] = t; if (n < 512) NB[n++] = w; } }
      return n;
    };
    const cand = (u, v) => {
      // u collapses onto v (u must be free); cost = combined quadric at v, scaled per unit area
      if (lock[u]) return;
      const c = qerr(u * 10, v * 10, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) / Math.max(1e-12, area[u] + area[v]);
      H.push(c, u, v, stamp[u], stamp[v]);
    };
    for (const key of edgeCount.keys()) {
      const a = Math.floor(key / 1048576), b = key % 1048576;
      // seed with the cheaper direction only; the other gets queued when its neighbourhood changes
      if (lock[a]) cand(b, a); else if (lock[b]) cand(a, b);
      else { const ca = qerr(a * 10, b * 10, pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]), cb = qerr(a * 10, b * 10, pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]); if (ca < cb) cand(a, b); else cand(b, a); }
    }
    const _t2 = performance.now();
    let tris = nt;
    const target = Math.max(20, Math.floor(nt * ratio));
    const e2 = maxErr * maxErr;
    const top = [0, 0, 0, 0, 0];
    while (H.size && tris > target) {
      H.pop(top);
      const [c, u, v, su, sv] = top;
      if (c > e2) break;
      if (dead[u] || dead[v] || stamp[u] !== su || stamp[v] !== sv) continue;
      // link condition: shared neighbours must be exactly the edge's opposite vertices
      const tu = ++tok;
      nbs(u, mark, tu);
      if (mark[v] !== tu) continue;
      const nvn = nbs(v, mark2, ++tok2);
      let shared = 0;
      for (let i = 0; i < nvn; i++) if (mark[NB[i]] === tu) shared++;
      let edgeTris = 0;
      for (const t of vt[u]) if (alive[t] && (idx[t * 3] === v || idx[t * 3 + 1] === v || idx[t * 3 + 2] === v)) edgeTris++;
      if (shared !== edgeTris) continue;
      // reject normal flips / slivers
      let ok = true;
      for (const t of vt[u]) {
        if (!alive[t]) continue;
        let i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
        if (i0 === v || i1 === v || i2 === v) continue;
        if (i0 === u) i0 = v; if (i1 === u) i1 = v; if (i2 === u) i2 = v;
        const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
        const ux = pos[i1 * 3] - ax, uy = pos[i1 * 3 + 1] - ay, uz = pos[i1 * 3 + 2] - az;
        const wx = pos[i2 * 3] - ax, wy = pos[i2 * 3 + 1] - ay, wz = pos[i2 * 3 + 2] - az;
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (l < 1e-14 || (nx * tn[t * 3] + ny * tn[t * 3 + 1] + nz * tn[t * 3 + 2]) / l < 0.35) { ok = false; break; }
      }
      if (!ok) continue;
      // collapse u → v
      for (const t of vt[u]) {
        if (!alive[t]) continue;
        const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
        if (i0 === v || i1 === v || i2 === v) { alive[t] = 0; tris--; continue; }
        for (let k = 0; k < 3; k++) if (idx[t * 3 + k] === u) idx[t * 3 + k] = v;
        vt[v].push(t);
      }
      dead[u] = 1;
      for (let j = 0; j < 10; j++) Q[v * 10 + j] += Q[u * 10 + j];
      area[v] += area[u];
      stamp[v]++;
      const nn = nbs(v, mark2, ++tok2);
      for (let i = 0; i < nn; i++) { const w = NB[i]; cand(w, v); cand(v, w); }
    }
    const _t3 = performance.now();
    if (self.__dbg) console.log('dec', P.name, nt, '→', tris, 'setup', (_t1 - _t0).toFixed(1), 'seed', (_t2 - _t1).toFixed(1), 'loop', (_t3 - _t2).toFixed(1));
    // compact
    const out = new IArr(tris * 3 + 3);
    for (let t = 0; t < nt; t++) if (alive[t]) out.push3(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    return { ...P, idx: out.out() };
  }

  // ---------------------------------------------------------------- the MakeHuman head (CC0: base mesh, targets and proxies by the
  // MakeHuman team; the data and the morphing in mhdata.js). The person's own head: sex, age, ancestry and build (the
  // macro targets) and a scatter of features, put on the head bone; its eyes, brows, lashes and teeth fitted onto it.
  // The neck below it stays sculpted, clipped where this mesh begins and stitched to it.
  const MHL = typeof mhLib === 'function' ? mhLib() : null;
  let MHD = null;
  function setMH(buf) { MHD = MHL && buf ? MHL.parseMH(buf) : null; return !!MHD; }
  const MH_A = [0, 0.0441, -0.0334]; // the base mesh's head joint from our head bone (so its eyes land on the rig's), × height
  const MH_SKIP = /^(head\/head-(age|fat|trans)|neck\/)/; // left to the macros (age, weight) and to the stitch (the neck)
  // desc.face's five: jaw width, chin, cheekbones, nose size, brow ridge
  const MH_FACE = [['chin/chin-bones', 'head/head-square'], ['chin/chin-prominent', 'chin/chin-height'], ['cheek/cheek-bones', 'cheek/cheek-volume'], ['nose/nose-scale-vert', 'nose/nose-scale-horiz'], ['eyebrows/eyebrows-angle', 'forehead/forehead-nubian']];
  const MH_MAT = { skin: 17, eye: 18, brow: 19, lash: 20, teeth: 21, hair: 22 };
  // claymation: the person's own head sculpted over as a stop-motion puppet's — rounder, full cheeks, a big soft nose,
  // a wide smiling mouth with rolled lips, big eye openings with no bags, ears that show — eased to nothing down the
  // neck (the seam stays)
  const MH_PUPPET = {
    'head/head-round': 0.7, 'cheek/l-cheek-volume-incr': 0.7, 'cheek/r-cheek-volume-incr': 0.7, 'cheek/l-cheek-bones-decr': 0.5, 'cheek/r-cheek-bones-decr': 0.5,
    'nose/nose-volume-incr': 1, 'nose/nose-point-width-incr': 1, 'nose/nose-scale-horiz-incr': 0.5, 'nose/nose-hump-decr': 0.6, 'nose/nose-flaring-decr': 0.6, 'nose/nose-nostrils-width-decr': 0.4,
    'mouth/mouth-scale-horiz-incr': 2.3, 'mouth/mouth-angles-up': 0.85, 'mouth/mouth-trans-forward': 0.8, 'mouth/mouth-scale-vert-incr': 0.4,
    'mouth/mouth-upperlip-volume-incr': 0.6, 'mouth/mouth-lowerlip-volume-incr': 0.2, 'mouth/mouth-cupidsbow-decr': 0.8, 'mouth/mouth-philtrum-volume-decr': 0.6,
    'eyes/l-eye-scale-incr': 0.7, 'eyes/r-eye-scale-incr': 0.7, 'eyes/l-eye-bag-decr': 1, 'eyes/r-eye-bag-decr': 1,
    'ears/l-ear-scale-incr': 0.5, 'ears/r-ear-scale-incr': 0.5, 'ears/l-ear-shape-round': 0.6, 'ears/r-ear-shape-round': 0.6,
  };
  function puppetSculpt(D, p, W) {
    const pp = MHL.morphMH(D, W); // (the targets alone over the base mesh: their deltas)
    const body = D.index.subarray(0, D.nBody);
    let ring = 1e9;
    for (let t = 0; t < body.length; t++) ring = Math.min(ring, p[D.map[body[t]] * 3 + 1]);
    for (let i = 0; i < D.nR; i++) {
      const f = sstep(ring + 0.25, ring + 0.6, p[i * 3 + 1]); // (base mesh units: decimetres)
      for (let a = 0; a < 3; a++) p[i * 3 + a] += (pp[i * 3 + a] - D.base[i * 3 + a]) * f;
    }
  }
  // ...then modelled by hand, in head-bone metres: the nose blown up into a soft ball (inflated along the skin's normal
  // round its middle, then smoothed till the wings and the crease beside them are gone) and the whole face smoothed the
  // way a thumb smooths plasticine (the folds, bags and bones of a real face go), away from the eyes' rims, the mouth's
  // slit and inside, and the neck (the seam). o: { nose: inflate (× H metres), ball: its radius, smooth: the face's }
  function mhAdj(D) { // the skin's neighbours, once
    if (!D._adj) {
      const map = D.map, body = D.index.subarray(0, D.nBody), s = Array.from({ length: D.nR }, () => new Set());
      for (let t = 0; t < body.length; t += 3) { const a = map[body[t]], b = map[body[t + 1]], c = map[body[t + 2]]; s[a].add(b).add(c); s[b].add(a).add(c); s[c].add(a).add(b); }
      D._adj = s.map((x) => Uint16Array.from(x));
    }
    return D._adj;
  }
  function puppetShape(D, q, H, o = {}) {
    const n = D.nR, map = D.map, body = D.index.subarray(0, D.nBody);
    const adj = mhAdj(D), J = (name) => MHL.jointMH(D, q, name);
    const eL = J('joint-l-eye'), eR = J('joint-r-eye'), lip = J('lm-lipline'), eyeY = (eL[1] + eR[1]) / 2;
    let ring = 1e9, tip = -1;
    for (let t = 0; t < body.length; t++) {
      const v = map[body[t]], x = q[v * 3], y = q[v * 3 + 1], z = q[v * 3 + 2];
      if (y < ring) ring = y;
      if (Math.abs(x) < 0.012 * H && y < eyeY - 0.012 * H && y > lip[1] + 0.012 * H && (tip < 0 || z > q[tip * 3 + 2])) tip = v;
    }
    if (tip < 0) return;
    const keep = new Uint8Array(n); // (the mouth's slit and inside stay)
    for (const nm of ['lm-mouthin', 'lm-lipline', 'lm-teethlow']) for (const i of D.joints[nm] || []) keep[i] = 1;
    const used = new Uint8Array(n);
    for (let t = 0; t < body.length; t++) used[map[body[t]]] = 1;
    const T = [q[tip * 3], q[tip * 3 + 1], q[tip * 3 + 2]], C = [0, T[1] - 0.004 * H, T[2] - 0.011 * H];
    const R = (o.ball || 0.027) * H, A = (o.nose ?? 0.0065) * H, Rs = R * 1.35;
    const mw = Math.abs(J('lm-mouthL')[0]) + 0.012 * H; // (round the mouth the lips keep their shape: the teeth stay behind them)
    const teeth = new Uint8Array(n);
    for (let t = D.nBody; t < D.index.length; t++) teeth[map[D.index[t]]] = 1;
    for (let i = 0; i < n; i++) if (teeth[i] && !used[i]) q[i * 3 + 2] -= (o.teeth ?? 0.006) * H; // (the teeth further in: at the widened corners they showed through the cheek)
    const wS = new Float32Array(n), wN = new Float32Array(n), N = new Float32Array(n * 3);
    for (let t = 0; t < body.length; t += 3) {
      const a = map[body[t]], b = map[body[t + 1]], c = map[body[t + 2]];
      const ux = q[b * 3] - q[a * 3], uy = q[b * 3 + 1] - q[a * 3 + 1], uz = q[b * 3 + 2] - q[a * 3 + 2], vx = q[c * 3] - q[a * 3], vy = q[c * 3 + 1] - q[a * 3 + 1], vz = q[c * 3 + 2] - q[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
    }
    for (let i = 0; i < n; i++) {
      if (!used[i] || keep[i]) continue;
      const x = q[i * 3], y = q[i * 3 + 1], z = q[i * 3 + 2];
      const de = Math.min(Math.hypot(x - eL[0], y - eL[1], z - eL[2]), Math.hypot(x - eR[0], y - eR[1], z - eR[2]));
      const low = sstep(ring + 0.02 * H, ring + 0.045 * H, y), eye = sstep(0.017 * H, 0.026 * H, de);
      const mouth = sstep(0.85, 1.5, Math.hypot(x / mw, (y - lip[1]) / (0.014 * H)));
      const dn = Math.hypot(x - C[0], y - C[1], z - C[2]), fn = dn < Rs ? (1 - (dn / Rs) ** 2) ** 2 : 0;
      wS[i] = low * eye * mouth * (o.smooth ?? 0.4);
      wN[i] = low * eye * mouth * fn;
      if (dn < R) { // inflate the nose
        const f = A * (1 - (dn / R) ** 2) ** 2 * eye, l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
        q[i * 3] += (N[i * 3] / l) * f; q[i * 3 + 1] += (N[i * 3 + 1] / l) * f; q[i * 3 + 2] += (N[i * 3 + 2] / l) * f;
      }
    }
    // Taubin's smoothing (a shrink and a swell each time, so the volume stays)
    const d = new Float32Array(n * 3), its = o.its || 14;
    for (let it = 0; it < its * 2; it++) {
      const f = it % 2 ? -0.53 : 0.5;
      for (let i = 0; i < n; i++) {
        const w = Math.min(1, wS[i] + wN[i]);
        if (!w) continue;
        const nb = adj[i]; let sx = 0, sy = 0, sz = 0;
        for (let k = 0; k < nb.length; k++) { const j = nb[k]; sx += q[j * 3]; sy += q[j * 3 + 1]; sz += q[j * 3 + 2]; }
        const k = 1 / nb.length;
        d[i * 3] = (sx * k - q[i * 3]) * f * w; d[i * 3 + 1] = (sy * k - q[i * 3 + 1]) * f * w; d[i * 3 + 2] = (sz * k - q[i * 3 + 2]) * f * w;
      }
      for (let i = 0; i < n; i++) if (wS[i] + wN[i]) { q[i * 3] += d[i * 3]; q[i * 3 + 1] += d[i * 3 + 1]; q[i * 3 + 2] += d[i * 3 + 2]; }
    }
  }
  // where the targets (strong ones on some faces: a corner of the mouth) or the puppet's sculpt folded the skin over
  // itself — a triangle facing the other way from MakeHuman's own base face: drawn it is culled, a hole with the street
  // seen through it — its corners are eased towards their neighbours till it lies flat again (the inside of the mouth
  // and the eye sockets, never seen, are left as they are)
  function untangle(D, q, its = self.__untangleIts || 80) {
    const body = D.index.subarray(0, D.nBody), map = D.map, adj = mhAdj(D), ref = D.base;
    if (!D._inner) { D._inner = new Uint8Array(D.nR); for (const nm of ['lm-mouthin', 'lm-sockL', 'lm-sockR', 'lm-teethlow']) for (const i of D.joints[nm] || []) D._inner[i] = 1; }
    const inner = D._inner;
    const turned = (P, a, b, c) => {
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    };
    for (let it = 0; it < its; it++) {
      const bad = new Set();
      for (let t = 0; t < body.length; t += 3) {
        const a = map[body[t]], b = map[body[t + 1]], c = map[body[t + 2]];
        if (inner[a] || inner[b] || inner[c]) continue;
        if (dot(turned(q, a, b, c), turned(ref, a, b, c)) < 0) { bad.add(a); bad.add(b); bad.add(c); }
      }
      if (self.__puppetDbg) self.__puppetDbg.push(bad.size); // (dev: tools/puppetlab.js)
      if (!bad.size) return;
      const move = new Set(bad);
      if (it > 3) for (const v of bad) for (const j of adj[v]) move.add(j); // (a stubborn fold: its ring too)
      const to = [];
      for (const v of move) {
        const nb = adj[v]; let sx = 0, sy = 0, sz = 0;
        for (let k = 0; k < nb.length; k++) { const j = nb[k]; sx += q[j * 3]; sy += q[j * 3 + 1]; sz += q[j * 3 + 2]; }
        to.push(v, sx / nb.length, sy / nb.length, sz / nb.length);
      }
      for (let k = 0; k < to.length; k += 4) { const v = to[k]; for (let a = 0; a < 3; a++) q[v * 3 + a] += (to[k + 1 + a] - q[v * 3 + a]) * 0.6; }
    }
  }
  function mhHead(spec) {
    const D = MHD, m = spec.mh, H = (spec.S || 1) * (spec.hk || 1);
    const w = MHL.macroWeights(m.g, m.age, { african: m.eth[0], asian: m.eth[1], caucasian: m.eth[2] }, m.wt, m.mu);
    const sl = MHL.faceSliders(D), byName = {};
    for (const x of sl) if (!byName[x.name]) byName[x.name] = x;
    const add = (x, v, k2 = 1) => {
      if (!x || !v) return;
      const [a, b] = v > 0 ? x.pos : x.neg;
      if (a) w[a] = (w[a] || 0) + Math.abs(v);
      if (b) w[b] = (w[b] || 0) + Math.abs(v) * k2;
    };
    let sd = (m.seed >>> 0) || 1;
    const rnd = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
    for (const x of sl) {
      const r = rnd(), v = (rnd() * 2 - 1) * m.amt * (/^(eyes|ears)\//.test(x.name) ? 0.6 : 1), k2 = 0.92 + rnd() * 0.16;
      if (r < 0.45 && !MH_SKIP.test(x.name)) add(x, v, k2); // (the two sides a touch apart)
    }
    if (m.face) m.face.forEach((v, i) => { for (const n of MH_FACE[i]) add(byName[n], v * 0.5); });
    const p = MHL.morphMH(D, w);
    if (spec.clay) puppetSculpt(D, p, spec.clay === true ? MH_PUPPET : spec.clay); // (an object: weights to try, dev)
    const J = MHL.jointMH(D, p, 'joint-head'), k = 0.1 * H;
    const q = new Float32Array(D.nR * 3);
    const A0 = spec.mhA || MH_A;
    for (let i = 0; i < D.nR; i++) for (let a = 0; a < 3; a++) q[i * 3 + a] = (p[i * 3 + a] - J[a]) * k + A0[a] * H;
    if (spec.clay) puppetShape(D, q, H, spec.clayShape);
    untangle(D, q);
    const at = (name) => MHL.jointMH(D, q, name);
    const eyeL = at('joint-l-eye'), eyeR = at('joint-r-eye');
    // the skull under the hair: how high, wide, far back and forward the crown goes above the brows
    const browY = (eyeL[1] + eyeR[1]) / 2 + 0.022 * H;
    let top = -1, back = 1, wide = 0, front = -1, ring = 1;
    const body = D.index.subarray(0, D.nBody);
    for (let t = 0; t < body.length; t++) {
      const v = D.map[body[t]], x = q[v * 3], y = q[v * 3 + 1], z = q[v * 3 + 2];
      if (y < ring) ring = y;
      if (y < browY) continue;
      if (y > top) top = y;
      if (z < back) back = z;
      if (y > browY + 0.02 * H && Math.abs(x) > wide) wide = Math.abs(x);
      if (Math.abs(x) < 0.02 * H && z > front) front = z;
    }
    const cy = browY + 0.005 * H, cz = (front + back) / 2 - 0.01 * H;
    const cran = [[0, cy, cz], [wide + 0.002 * H, top - cy, (front - back) / 2 + 0.005 * H]];
    const kx = cran[1][0] / 0.076, ky = cran[1][1] / 0.088, kz = cran[1][2] / 0.1;
    const fore = [[0, cy + 0.01 * ky, cz + 0.045 * kz], [0.066 * kx, 0.05 * ky, 0.06 * kz]];
    // the eyeball's radius (the eye proxy round its centre)
    const ex = D.proxies.find((x) => x.kind === 'eyes');
    let er = 0.012 * H;
    if (ex) { const eq = MHL.fitProxy(D, q, ex); er = 0; for (let i = 0; i < eq.length / 3; i++) if (eq[i * 3] > 0) er = Math.max(er, Math.hypot(eq[i * 3] - eyeL[0], eq[i * 3 + 1] - eyeL[1], eq[i * 3 + 2] - eyeL[2])); }
    return { q, H, eyeL, eyeR, er, browL: [eyeL[0], eyeL[1] + 0.022 * H, eyeL[2] + 0.012 * H], browR: [eyeR[0], eyeR[1] + 0.022 * H, eyeR[2] + 0.012 * H],
      cran, fore, lipL: at('lm-mouthL'), lipR: at('lm-mouthR'), lip: at('lm-lipline'), ring, brow: m.brow, lash: m.lash, hair: m.hair || null };
  }
  // what a hat takes away of the hair (hatCut's primitives: a sphere round the skull, above the hat's rim), world space
  function hatZone(R, hat, margin = 0.004) {
    if (!HATS[hat]) return null;
    const { H, Sh } = headFrame(R);
    const c = H(0, 0.1, -0.01), r = 0.2 * Sh;
    const [n0, p0] = hat === 'gorra' ? [[0, -0.2, 0.043], H(0, 0.068, -0.1)] : hat === 'boina' ? [[0, -1, 0], H(0, 0.1, 0)] : hat === 'gorro' ? [[0, -1, 0.25], H(0, 0.08, 0)] : [[0, -1, 0.1], H(0, 0.1, 0)];
    const n = nrm(n0), d0 = dot(n, p0);
    return (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) < r && n[0] * x + n[1] * y + n[2] * z - d0 < -margin * Sh;
  }
  // the same triangles facing the other way (normals flipped)
  function flipPart(P) {
    const idx = new Uint32Array(P.idx.length);
    for (let t = 0; t < idx.length; t += 3) { idx[t] = P.idx[t]; idx[t + 1] = P.idx[t + 2]; idx[t + 2] = P.idx[t + 1]; }
    return { ...P, nrm: P.nrm.map((v) => -v), idx };
  }
  // the head's parts in the bind pose with their bones: skin (and the mouth's inside), eyes, brows, lashes, teeth.
  // neckD: the sculpted neck's distance field, unclipped, to stitch the edge onto
  function mhParts(R, mh, neckD, hat) {
    const D = MHD, q = mh.q, hb = R.P.head, H = mh.H, n = D.nR, er = mh.er;
    const X = new Float32Array(n * 3), nBlend = [];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) X[i * 3 + a] = q[i * 3 + a] + hb[a];
    const body = D.index.subarray(0, D.nBody), teeth = D.index.subarray(D.nBody), map = D.map;
    // --- the stitch: the neck's open lower edge onto the sculpted neck, the band above it eased the same way
    if (neckD) {
      const cnt = new Map();
      for (let t = 0; t < body.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = map[body[t + e]], b = map[body[t + (e + 1) % 3]], key = a < b ? a * 65536 + b : b * 65536 + a;
        cnt.set(key, (cnt.get(key) || 0) + 1);
      }
      const edge = new Set();
      for (const [key, c] of cnt) if (c === 1) { const a = Math.floor(key / 65536), b = key % 65536; if (q[a * 3 + 1] < mh.ring + 0.025 * H && q[b * 3 + 1] < mh.ring + 0.025 * H) { edge.add(a); edge.add(b); } }
      const eps = 0.0006, moves = [];
      for (const i of edge) {
        // the edge made level (its quads end a centimetre or two apart), a few millimetres below where the sculpted neck
        // is cut, and laid onto that neck (sideways only) a hair outside it: the two overlap, the seam hidden under the edge
        const y = hb[1] + mh.ring - 0.004 * H;
        let x = X[i * 3], z = X[i * 3 + 2], gx = 0, gz = 0;
        for (let it = 0; it < 5; it++) {
          const d = neckD(x, y, z);
          gx = neckD(x + eps, y, z) - neckD(x - eps, y, z); gz = neckD(x, y, z + eps) - neckD(x, y, z - eps);
          const gl = Math.hypot(gx, gz) || 1;
          x -= (gx / gl) * d; z -= (gz / gl) * d;
        }
        const gl = Math.hypot(gx, gz) || 1;
        x += (gx / gl) * 0.0012; z += (gz / gl) * 0.0012;
        // (the neck's own normal there, so the shading runs on across the seam)
        const nx = neckD(x + eps, y, z) - neckD(x - eps, y, z), ny = neckD(x, y + eps, z) - neckD(x, y - eps, z), nz = neckD(x, y, z + eps) - neckD(x, y, z - eps), nl = Math.hypot(nx, ny, nz) || 1;
        moves.push([i, x - X[i * 3], y - X[i * 3 + 1], z - X[i * 3 + 2], nx / nl, ny / nl, nz / nl]);
      }
      // the band above follows its nearest edge vertex, less and less with the height above that vertex's own
      const band = 0.04 * H, used = new Uint8Array(n), X0 = X.slice();
      for (let t = 0; t < body.length; t++) used[map[body[t]]] = 1;
      for (let i = 0; i < n; i++) {
        if (!used[i]) continue;
        let best = 1e9, mv = null;
        for (const m of moves) { const j = m[0], dd = (X0[j * 3] - X0[i * 3]) ** 2 + (X0[j * 3 + 2] - X0[i * 3 + 2]) ** 2; if (dd < best) { best = dd; mv = m; } }
        if (!mv) continue;
        const hgt = q[i * 3 + 1] - q[mv[0] * 3 + 1];
        if (hgt > band) continue;
        const f = edge.has(i) ? 1 : Math.pow(1 - sstep(0, band, hgt), 1.3) * 0.9;
        X[i * 3] += mv[1] * f; X[i * 3 + 1] += mv[2] * f; X[i * 3 + 2] += mv[3] * f;
        nBlend.push([i, f, mv[4], mv[5], mv[6]]);
      }
    }
    // --- normals over the whole region (so none breaks at the edges of the texture's islands)
    const N = new Float32Array(n * 3);
    const tri = (idx, P, out) => {
      for (let t = 0; t < idx.length; t += 3) {
        const a = map[idx[t]], b = map[idx[t + 1]], c = map[idx[t + 2]];
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
        const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) { out[v * 3] += nx; out[v * 3 + 1] += ny; out[v * 3 + 2] += nz; }
      }
    };
    tri(body, X, N); tri(teeth, X, N);
    for (const [i, f, nx, ny, nz] of nBlend) { // down to the seam the normals turn into the sculpted neck's
      const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1, k = Math.pow(f, 0.7);
      N[i * 3] = (N[i * 3] / l) * (1 - k) + nx * k; N[i * 3 + 1] = (N[i * 3 + 1] / l) * (1 - k) + ny * k; N[i * 3 + 2] = (N[i * 3 + 2] / l) * (1 - k) + nz * k;
    }
    // --- bones: the neck into the head; the jaw below the plane from its hinge to the lips; the corners of the mouth
    // and the brows on their own (expressions); the upper lids over the eyeballs
    const Sh = R.Sh, tmj = [0, 0.05 * Sh, -0.005 * Sh], lip = mh.lip;
    const dy = lip[1] - tmj[1], dz = lip[2] - tmj[2], dl = Math.hypot(dy, dz) || 1, pny = dz / dl, pnz = -dy / dl;
    const low = new Set(D.joints['lm-teethlow'] || []);
    const upL = D.joints['lm-lidupL'] || [], upR = D.joints['lm-lidupR'] || [];
    const lidRim = new Set([...upL, ...upR]);
    const g2 = (x, y, cx, cy, rx, ry) => Math.exp(-((x - cx) ** 2) / (rx * rx) - ((y - cy) ** 2) / (ry * ry));
    // the mouth's slit (the middle of the ring where the lips meet the mouth's inside, by |x|, on the base mesh): what
    // lies below it round the mouth is the lower lip, on the jaw — the plane alone left it half on the head
    const B0 = D.base, slit = [];
    {
      const ring = D.joints['lm-lipline'] || [], bins = [[], [], [], [], [], []];
      let xc = 0.01;
      for (const v of ring) xc = Math.max(xc, Math.abs(B0[v * 3]));
      for (const v of ring) bins[Math.min(5, Math.floor((Math.abs(B0[v * 3]) / xc) * 6))].push(B0[v * 3 + 1]);
      for (let b = 0; b < 6; b++) slit.push(bins[b].length ? bins[b].reduce((a, c) => a + c, 0) / bins[b].length : null);
      for (let b = 1; b < 6; b++) if (slit[b] === null) slit[b] = slit[b - 1];
      for (let b = 4; b >= 0; b--) if (slit[b] === null) slit[b] = slit[b + 1];
      slit.xc = xc;
    }
    const lowerLip = (v) => {
      if (v < 0 || !slit.length || slit[0] === null) return -1;
      const ax = Math.abs(B0[v * 3]), by = B0[v * 3 + 1], bz = B0[v * 3 + 2];
      const u = Math.min(5.999, (ax / slit.xc) * 6), b = Math.floor(u), m = b < 5 ? slit[b] + (slit[b + 1] - slit[b]) * (u - b) : slit[5];
      const near = sstep(slit.xc + 0.08, slit.xc - 0.01, ax) * sstep(0.3, 0.1, Math.abs(by - m)) * sstep(0.85, 1.05, bz);
      return near > 0.001 ? [near, sstep(m + 0.006, m - 0.006, by)] : -1;
    };
    const weightAt = (x, y, z, rim = false, forceLow = false, v = -1) => {
      const wH = sstep(-0.07 * H, -0.012 * H, y);
      const acc = { head: wH, neck: 1 - wH };
      if (acc.neck < 1e-3) delete acc.neck;
      // jaw
      const below = (y - tmj[1]) * pny + (z - tmj[2]) * pnz;
      let wj = forceLow ? 1 : sstep(0.0025 * H, -0.006 * H, below) * sstep(-0.012 * H, 0.012 * H, z - tmj[2]) * sstep(lip[1] - 0.085 * H, lip[1] - 0.05 * H, y);
      const ll = forceLow ? -1 : lowerLip(v);
      if (ll !== -1) wj = wj + (ll[1] - wj) * ll[0];
      if (wj > 1e-3) { const h0 = acc.head || 0; acc.jaw = h0 * wj; acc.head = h0 * (1 - wj); }
      const move = (to, t, from) => { for (const b of from) { const v = acc[b]; if (!v) continue; acc[b] = v * (1 - t); acc[to] = (acc[to] || 0) + v * t; } };
      const front = sstep(lip[2] - 0.03 * H, lip[2] - 0.012 * H, z);
      for (const [c, to] of [[mh.lipL, 'mouthL'], [mh.lipR, 'mouthR']]) { const t = g2(x, y, c[0], c[1], 0.0145 * H, 0.0125 * H) * front * 0.9; if (t > 0.01) move(to, t, ['head', 'jaw']); }
      for (const [c, to] of [[mh.browL, 'browL'], [mh.browR, 'browR']]) { const t = g2(x, y, c[0], c[1], 0.019 * H, 0.011 * H) * sstep(c[2] - 0.03 * H, c[2] - 0.012 * H, z) * 0.9; if (t > 0.01) move(to, t, ['head']); }
      for (const [c, to] of [[mh.eyeL, 'lidL'], [mh.eyeR, 'lidR']]) {
        const d = Math.hypot(x - c[0], y - c[1], z - c[2]);
        const t = rim ? 1 : sstep(er * 1.45, er * 1.1, d) * sstep(-0.12 * er, 0.3 * er, y - c[1]) * sstep(c[2] - 0.2 * er, c[2] + 0.35 * er, z);
        if (t > 0.01 && Math.abs(x - c[0]) < er * 1.6) move(to, t, ['head']);
      }
      return Object.entries(acc);
    };
    const WB = new Array(n);
    for (let i = 0; i < n; i++) WB[i] = weightAt(q[i * 3], q[i * 3 + 1], q[i * 3 + 2], lidRim.has(i), low.has(i), i);
    // --- parts (merge() keeps only the vertices their triangles use)
    const nv = map.length, parts = [];
    // (the shader's face attribute on these parts: the unmorphed base mesh, metres from 0.7 m up its axis, so what is
    // painted by position — the hair's masks, the shine on the nose — stays put on every face)
    const BF = (p, i, out, o) => { out[o] = p[i * 3] * 0.1; out[o + 1] = (p[i * 3 + 1] - 7) * 0.1; out[o + 2] = p[i * 3 + 2] * 0.1; };
    const skin = (name, idx, mat, reg) => {
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), face = new Float32Array(nv * 3), R8 = new Uint8Array(nv).fill(reg), M8 = new Uint8Array(nv).fill(mat), bones = new Array(nv);
      for (let r = 0; r < nv; r++) {
        const v = map[r], l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
        for (let a = 0; a < 3; a++) { pos[r * 3 + a] = X[v * 3 + a]; nrm[r * 3 + a] = N[v * 3 + a] / l; }
        uv[r * 2] = D.uv[r * 2]; uv[r * 2 + 1] = D.uv[r * 2 + 1];
        BF(D.base, v, face, r * 3);
        bones[r] = WB[v];
      }
      parts.push({ name, nv, pos, nrm, idx: Uint32Array.from(idx), reg: R8, mat: M8, uv, face, bones, order: null, mh: mat === MH_MAT.teeth ? 'teeth' : 'skin' });
    };
    let skinIdx = body;
    if (hat && HATS[hat]) { // under a hat the crown goes (it would poke through the top of it)
      const inHat = hatZone(R, hat, 0.008), keep = [];
      for (let t = 0; t < body.length; t += 3) {
        if ([0, 1, 2].every((k) => { const v = map[body[t + k]]; return inHat(X[v * 3], X[v * 3 + 1], X[v * 3 + 2]); })) continue;
        keep.push(body[t], body[t + 1], body[t + 2]);
      }
      skinIdx = Uint16Array.from(keep);
    }
    skin('head', skinIdx, MH_MAT.skin, REG.skin);
    skin('teeth', teeth, MH_MAT.teeth, REG.mouth);
    // proxies: the eyes (each on its own bone), the chosen brows and lashes (the upper lashes on the lids)
    // hair (MakeHuman's cards): on the head, blending into the neck below it; loose hair behind and below the ears on
    // hair2 so it can swing, a ponytail's tail on hair1/hair2; darker deep inside (near the skull)
    const hairW = (x, y, z) => {
      const wH = sstep(-0.07 * H, -0.012 * H, y), acc = { head: wH };
      if (wH < 1) acc.neck = 1 - wH;
      const hy = y / Sh, hz = z / Sh;
      const mv = (to, t) => { if (t <= 0.01) return; let tot = 0; for (const b of ['head', 'neck']) if (acc[b]) { const m = acc[b] * t; acc[b] -= m; tot += m; } acc[to] = (acc[to] || 0) + tot; };
      if (mh.hair === 'ponytail01') { mv('hair1', sstep(-0.075, -0.1, hz) * sstep(0.17, 0.12, hy) * 0.9); mv('hair2', sstep(-0.1, -0.13, hz) * sstep(0.1, 0.02, hy) * 0.9); }
      else mv('hair2', clamp((0.045 - hy) / 0.13, 0, 1) * clamp((0.035 - hz) / 0.05, 0, 1) * 0.85);
      return Object.entries(acc);
    };
    const [cc, cr] = mh.cran;
    const hatIn = hat ? hatZone(R, hat) : null;
    // a haircut stands a few millimetres off the scalp at least (the morphs move the two a little differently, and a
    // close crop would sink into the skin): each vertex against the nearest skin vertex, along its normal
    const standOff = (pos, pn) => {
      const cell = 0.02 * H, grid = new Map(), K = (a, b, c) => a * 92821 + b * 689287 + c * 7919;
      const onSkin = new Uint8Array(n);
      for (let t = 0; t < body.length; t++) onSkin[map[body[t]]] = 1;
      for (let v = 0; v < n; v++) {
        if (!onSkin[v]) continue;
        const k = K(Math.floor(X[v * 3] / cell), Math.floor(X[v * 3 + 1] / cell), Math.floor(X[v * 3 + 2] / cell));
        let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(v);
      }
      const want = 0.0035 * H;
      for (let r = 0; r < pn; r++) {
        const x = pos[r * 3], y = pos[r * 3 + 1], z = pos[r * 3 + 2], ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);
        let best = 1e9, bv = -1;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const l = grid.get(K(ix + a, iy + b, iz + c)); if (!l) continue;
          for (const v of l) { const d2 = (X[v * 3] - x) ** 2 + (X[v * 3 + 1] - y) ** 2 + (X[v * 3 + 2] - z) ** 2; if (d2 < best) { best = d2; bv = v; } }
        }
        if (bv < 0) continue;
        const nx = N[bv * 3], ny = N[bv * 3 + 1], nz = N[bv * 3 + 2], nl = Math.hypot(nx, ny, nz) || 1;
        const d = ((x - X[bv * 3]) * nx + (y - X[bv * 3 + 1]) * ny + (z - X[bv * 3 + 2]) * nz) / nl;
        if (d < want && d > -0.025 * H) { const k = (want - d) / nl; pos[r * 3] += nx * k; pos[r * 3 + 1] += ny * k; pos[r * 3 + 2] += nz * k; }
      }
    };
    for (const px of D.proxies) {
      if (px.kind === 'cornea') continue;
      if ((px.kind === 'brow' && px.name !== mh.brow) || (px.kind === 'lash' && px.name !== mh.lash) || (px.kind === 'hair' && px.name !== mh.hair)) continue;
      const pq = MHL.fitProxy(D, q, px), pb = MHL.fitProxy(D, D.base, px), pn = px.map.length;
      const pos = new Float32Array(pn * 3), uv = new Float32Array(pn * 2), face = new Float32Array(pn * 3), bones = new Array(pn);
      for (let r = 0; r < pn; r++) {
        const v = px.map[r], x = pq[v * 3], y = pq[v * 3 + 1], z = pq[v * 3 + 2];
        pos[r * 3] = x + hb[0]; pos[r * 3 + 1] = y + hb[1]; pos[r * 3 + 2] = z + hb[2];
        BF(pb, v, face, r * 3);
        uv[r * 2] = px.uv[r * 2]; uv[r * 2 + 1] = px.uv[r * 2 + 1];
        if (px.kind === 'eyes') bones[r] = [[x > 0 ? 'eyeL' : 'eyeR', 1]];
        else if (px.kind === 'lash') { const c = x > 0 ? mh.eyeL : mh.eyeR; bones[r] = y > c[1] ? [[x > 0 ? 'lidL' : 'lidR', 1]] : [['head', 1]]; }
        else if (px.kind === 'hair') bones[r] = hairW(x, y, z);
        else bones[r] = weightAt(x, y, z);
      }
      let I = px.index;
      if (px.kind === 'hair') standOff(pos, pn);
      if (px.kind === 'hair' && hatIn) { // under a hat only what shows below its rim
        const keep = [];
        for (let t = 0; t < I.length; t += 3) if (![0, 1, 2].every((k) => { const v = I[t + k]; return hatIn(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); })) keep.push(I[t], I[t + 1], I[t + 2]);
        I = Uint16Array.from(keep);
      }
      // normals of the proxy's own triangles
      const nrm = new Float32Array(pn * 3);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
        const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) { nrm[v * 3] += nx; nrm[v * 3 + 1] += ny; nrm[v * 3 + 2] += nz; }
      }
      for (let r = 0; r < pn; r++) { const l = Math.hypot(nrm[r * 3], nrm[r * 3 + 1], nrm[r * 3 + 2]) || 1; nrm[r * 3] /= l; nrm[r * 3 + 1] /= l; nrm[r * 3 + 2] /= l; }
      const kind = px.kind === 'eyes' ? 'eye' : px.kind;
      const reg = kind === 'eye' ? REG.eyeWhite : kind === 'brow' || kind === 'hair' ? REG.hair : REG.lashF;
      const P = { name: kind === 'eye' ? 'eye' : 'head', nv: pn, pos, nrm, idx: Uint32Array.from(I), reg: new Uint8Array(pn).fill(reg), mat: new Uint8Array(pn).fill(MH_MAT[kind]), uv, face, bones, order: null, mh: kind };
      if (kind === 'hair') {
        // deep in the hair it is darker: by how far a vertex stands off the skull (its ellipsoid), long hair below it lit
        P.aoMul = new Float32Array(pn);
        for (let r = 0; r < pn; r++) {
          const v = px.map[r], x = pq[v * 3] - cc[0], y = pq[v * 3 + 1] - cc[1], z = pq[v * 3 + 2] - cc[2];
          const k = Math.hypot(x / cr[0], y / cr[1], z / cr[2]), d = (k - 1) * Math.min(cr[0], cr[1], cr[2]);
          P.aoMul[r] = y < -cr[1] * 0.9 ? 0.85 : 0.42 + 0.58 * sstep(-0.004 * H, 0.022 * H, d);
        }
        parts.push(P, { ...flipPart(P), mh: 'hairBack' }); // (cards: seen from both sides)
      } else parts.push(P);
    }
    return parts;
  }

  // ---------------------------------------------------------------- assembly
  const MIRROR = { handL: 'handR', fingL: 'fingR', fing2L: 'fing2R', thumbL: 'thumbR', thumb2L: 'thumb2R', foreL: 'foreR', footL: 'footR', toeL: 'toeR', shinL: 'shinR', armL: 'armR', thighL: 'thighR', clavL: 'clavR' };
  function matFor(part, reg, spec, R) {
    switch (reg) {
      case REG.skin: case REG.mouth: case REG.nail: return MAT.skin;
      case REG.face: return R.f ? MAT.faceF : MAT.faceM;
      case REG.top: case REG.topTrim: return spec.top === 'hoodie' || spec.top === 'cardigan' || spec.top === 'sweater' ? MAT.knit
        : spec.top === 'jacket' ? (spec.topMat === 'vaquera' ? MAT.denim : MAT.leather) : spec.top === 'tracktop' ? MAT.nylon : spec.top === 'vest' ? MAT.twill : MAT.cotton;
      case REG.under: case REG.lace: case REG.sock: return MAT.cotton;
      case REG.bottom: case REG.bottomTrim: return spec.bottom === 'jeans' ? MAT.denim : spec.bottom === 'chandal' ? MAT.nylon : MAT.twill;
      case REG.belt: case REG.shoeAccent: case REG.cane: return MAT.leather;
      case REG.metal: case REG.button: return MAT.metal;
      case REG.shoe: return spec.shoe === 'sneaker' ? MAT.canvas : MAT.leather;
      case REG.sole: case REG.hairTie: return MAT.rubber;
      case REG.hair: case REG.beard: return MAT.hair;
      case REG.eyeWhite: case REG.iris: case REG.pupil: return MAT.eye;
      case REG.lash: return part === 'eye' ? MAT.eye : MAT.hair;
      case REG.lashF: return MAT.lash;
      case REG.lid: return MAT.lid;
      case REG.cap: case REG.capBrim: return MAT.twill;
      case REG.lens: case REG.frame: return MAT.gloss;
      case REG.bag: case REG.bagTrim: return MAT.nylon;
    }
    return MAT.skin;
  }
  function layerAttribs(L, M, regionFn) {
    const nv = M.nv, pos = M.pos, N = M.nrm;
    const reg = new Uint8Array(nv), bones = new Array(nv);
    const tau = L.tau;
    const ds = [], bs = [], ws = [];
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const list = M.vlist[v];
      let best = 1e9, r = -1, dmin = 1e9;
      ds.length = bs.length = ws.length = 0;
      for (let i = 0; i < list.length; i++) {
        const e = L.ops[list[i]];
        if (e.op > 2) continue;
        const di = L.opDist(e, x, y, z);
        if (e.reg >= 0 && Math.abs(di) < best) { best = Math.abs(di); r = e.reg; }
        if (e.op === 0) { ds.push(di); bs.push(e.bone); ws.push(e.w); if (di < dmin) dmin = di; }
      }
      if (r < 0) r = 0;
      if (regionFn) r = regionFn(x, y, z, r, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      reg[v] = r;
      const wf = L.weightFn ? L.weightFn(x, y, z) : null;
      if (wf) bones[v] = wf;
      else {
        const acc = {};
        for (let i = 0; i < ds.length; i++) { const w = ws[i] * Math.exp(-(ds[i] - dmin) / tau); acc[bs[i]] = (acc[bs[i]] || 0) + w; }
        if (L.post) L.post(x, y, z, acc);
        bones[v] = Object.entries(acc);
      }
    }
    return { reg, bones };
  }
  // remove the triangles of tiny disconnected islands (bounding box under minD across)
  function dropCrumbs(M, minD) {
    const nv = M.nv, idx = M.idx, par = new Int32Array(nv);
    for (let i = 0; i < nv; i++) par[i] = i;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]); par[b] = a; par[c] = a; }
    const box = new Map();
    for (let t = 0; t < idx.length; t++) {
      const v = idx[t], r = find(v); let b = box.get(r);
      if (!b) box.set(r, (b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]));
      for (let k = 0; k < 3; k++) { const x = M.pos[v * 3 + k]; if (x < b[k]) b[k] = x; if (x > b[k + 3]) b[k + 3] = x; }
    }
    const small = new Set();
    for (const [r, b] of box) if (Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) < minD) small.add(r);
    if (!small.size) return;
    const out = [];
    for (let t = 0; t < idx.length; t += 3) if (!small.has(find(idx[t]))) out.push(idx[t], idx[t + 1], idx[t + 2]);
    M.idx = idx instanceof Uint32Array ? Uint32Array.from(out) : Array.isArray(idx) ? out : new idx.constructor(out);
  }
  function mirrorPart(P) {
    const nv = P.nv;
    const pos = P.pos.slice(), nrmA = P.nrm.slice();
    for (let v = 0; v < nv; v++) { pos[v * 3] = -pos[v * 3]; nrmA[v * 3] = -nrmA[v * 3]; }
    const idx = P.idx.slice();
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; }
    const bones = P.bones.map((W) => W.map(([b, w]) => [MIRROR[b] || b, w]));
    return { ...P, pos, nrm: nrmA, idx, bones, mirrored: true };
  }
  function occluderOf(L, mirrored) {
    const [mn, mx] = L.bounds();
    const box = mirrored ? [[-mx[0], mn[1], mn[2]], [-mn[0], mx[1], mx[2]]] : [mn, mx];
    return { order: L.order, box, L, mirrored, eval: mirrored ? (x, y, z) => L.evalFast(-x, y, z) : (x, y, z) => L.evalFast(x, y, z) };
  }
  const inBox = (b, x, y, z, m = 0) => x > b[0][0] - m && y > b[0][1] - m && z > b[0][2] - m && x < b[1][0] + m && y < b[1][1] + m && z < b[1][2] + m;
  function cullHidden(parts, occ) {
    for (const P of parts) {
      if (P.order == null) continue;
      const cand = occ.filter((O) => O.order > P.order);
      if (!cand.length) continue;
      const nv = P.nv, pos = P.pos, inside = new Uint8Array(nv);
      for (let v = 0; v < nv; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        for (const O of cand) { if (!inBox(O.box, x, y, z)) continue; if (O.eval(x, y, z) < -0.0008) { inside[v] = 1; break; } }
      }
      const idx = P.idx, out = new IArr(idx.length + 3);
      for (let t = 0; t < idx.length; t += 3) if (!(inside[idx[t]] && inside[idx[t + 1]] && inside[idx[t + 2]])) out.push3(idx[t], idx[t + 1], idx[t + 2]);
      P.idx = out.out();
    }
  }
  function computeAO(parts, occ, S) {
    const samples = [[0.011 * S, 0.5], [0.032 * S, 0.33], [0.075 * S, 0.17]];
    for (const P of parts) {
      const nv = P.nv, pos = P.pos, N = P.nrm, ao = new Uint8Array(nv).fill(255);
      const used = new Uint8Array(nv);
      for (let i = 0; i < P.idx.length; i++) used[P.idx[i]] = 1;
      for (let v = 0; v < nv; v++) {
        if (!used[v]) continue;
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
        let o = 0;
        for (const [dd, w] of samples) {
          const qx = x + nx * dd, qy = y + ny * dd, qz = z + nz * dd;
          let d = dd;
          for (const O of occ) { if (!inBox(O.box, qx, qy, qz)) continue; const di = O.eval(qx, qy, qz); if (di < d) d = di; }
          o += w * clamp((dd - d) / dd, 0, 1);
        }
        const groundOcc = clamp(1 - y / (0.25 * S), 0, 1) * 0.18;
        ao[v] = Math.round(clamp(1 - o * 1.25 - groundOcc, 0.25, 1) * (P.aoMul ? P.aoMul[v] : 1) * 255);
      }
      P.ao = ao;
    }
  }
  function accPart(A, name, spec, R) {
    const nv = A.nv;
    return { name, nv, pos: A.P.out(), nrm: A.N.out(), idx: A.I.out(), reg: Uint8Array.from(A.reg), bones: A.bone.map((b) => [[b, 1]]), order: null };
  }
  function merge(parts, spec, R) {
    let nv = 0, ni = 0;
    const remaps = parts.map((P) => {
      const used = new Int32Array(P.nv).fill(-1);
      for (let t = 0; t < P.idx.length; t++) used[P.idx[t]] = 1;
      let c = 0;
      for (let v = 0; v < P.nv; v++) if (used[v] > 0) used[v] = c++;
      ni += P.idx.length;
      const r = { map: used, count: c, base: nv };
      nv += c;
      return r;
    });
    const pos = new Float32Array(nv * 3), nrmO = new Int8Array(nv * 3), si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4);
    const reg = new Uint8Array(nv), mat = new Uint8Array(nv), ao = new Uint8Array(nv), face = new Int16Array(nv * 3), uv = new Uint16Array(nv * 2);
    const index = nv < 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
    const hb = R.P.head, Sh = R.Sh;
    let io = 0;
    parts.forEach((P, pi) => {
      const { map, base } = remaps[pi];
      for (let v = 0; v < P.nv; v++) {
        const o = map[v];
        if (o < 0) continue;
        const g = base + o;
        for (let k = 0; k < 3; k++) { pos[g * 3 + k] = P.pos[v * 3 + k]; nrmO[g * 3 + k] = Math.round(clamp(P.nrm[v * 3 + k], -1, 1) * 127); }
        reg[g] = P.reg[v];
        mat[g] = P.mat ? P.mat[v] : matFor(P.name, P.reg[v], spec, R);
        if (P.uv) { uv[g * 2] = Math.round(clamp(P.uv[v * 2], 0, 1) * 65535); uv[g * 2 + 1] = Math.round(clamp(P.uv[v * 2 + 1], 0, 1) * 65535); }
        ao[g] = P.ao ? P.ao[v] : 255;
        if (P.face) for (let k = 0; k < 3; k++) face[g * 3 + k] = Math.round(clamp(P.face[v * 3 + k] / 0.3, -1, 1) * 32767); // (MakeHuman: its base mesh)
        else if (P.name === 'head' || P.name === 'eye' || P.name === 'hair' || P.name === 'lid') for (let k = 0; k < 3; k++) face[g * 3 + k] = Math.round(clamp((P.pos[v * 3 + k] - hb[k]) / Sh / 0.3, -1, 1) * 32767);
        // top-4 bone weights → bytes summing to 255
        const W = P.bones[v].filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (!W.length) W.push(['hips', 1]);
        let tot = 0;
        for (const e of W) tot += e[1];
        let acc = 0;
        for (let k = 0; k < 4; k++) {
          if (k < W.length) {
            si[g * 4 + k] = BI[W[k][0]] ?? 0;
            const q = Math.floor((W[k][1] / tot) * 255);
            sw[g * 4 + k] = q; acc += q;
          } else { si[g * 4 + k] = 0; sw[g * 4 + k] = 0; }
        }
        sw[g * 4] += 255 - acc; // remainder to the strongest influence (sums stay exactly 255)
      }
      for (let t = 0; t < P.idx.length; t++) index[io++] = base + map[P.idx[t]];
    });
    return { nv, pos, nrm: nrmO, si, sw, reg, mat, ao, face, uv, index };
  }

  function regionFns(R, spec, L) {
    const S = R.S, fns = {};
    if (spec.socks) fns.body = (x, y, z, r) => (y < 0.125 * S ? REG.sock : r);
    const hf = L.hand && L.hand.handFrame;
    if (hf) {
      const back = mulM(hf.m, [1, 0, 0]);
      fns.hand = (x, y, z, r, nx, ny, nz) => {
        for (const t of hf.tips) {
          const dx = x - t.p[0], dy = y - t.p[1], dz = z - t.p[2];
          if (dx * dx + dy * dy + dz * dz < (t.r * 1.85) ** 2 && nx * back[0] + ny * back[1] + nz * back[2] > 0.5) return REG.nail;
        }
        return r;
      };
    }
    const sf = L.shoe && L.shoe.shoeFrame;
    if (sf) {
      const mt = transpose(sf.m);
      fns.shoe = (x, y, z, r, nx, ny, nz) => {
        const q = mulM(mt, [x - sf.o[0], y - sf.o[1], z - sf.o[2]]);
        const lx = q[0] / sf.s, ly = q[1] / sf.s, lz = q[2] / sf.s;
        const nl = mulM(mt, [nx, ny, nz]);
        if (ly < sf.g + sf.soleT) return REG.sole;
        if (sf.kind === 'sneaker') {
          if (Math.abs(lx) < 0.017 && lz > 0.005 && lz < 0.095 && ly > sf.g + sf.soleT + 0.036 && nl[1] > 0.3) return REG.lace;
          if (ly < sf.g + sf.soleT + 0.01) return REG.shoeAccent;
          if (lz < -0.072 && ly > sf.g + 0.058) return REG.shoeAccent;
        }
        return REG.shoe;
      };
    }
    const ts = spec.top;
    fns.top = (x, y, z, r) => {
      if (r === REG.under) return r;
      if (ts === 'shirt' || ts === 'hoodie' || ts === 'cardigan' || ts === 'jacket' || ts === 'sweater' || ts === 'tracktop') {
        for (const s of [1, -1]) {
          const sh = R.P[s > 0 ? 'armL' : 'armR'], d = s > 0 ? R.dArmL : R.dArmR;
          const px = x - sh[0], py = y - sh[1], pz = z - sh[2];
          const t = px * d[0] + py * d[1] + pz * d[2];
          if (t > 0.448 * S) { const rx = px - d[0] * t, ry = py - d[1] * t, rz = pz - d[2] * t; if (rx * rx + ry * ry + rz * rz < (0.09 * S) ** 2) return REG.topTrim; }
        }
      }
      if (ts === 'hoodie' && y < 0.975 * S) return REG.topTrim;
      if ((ts === 'sweater' || ts === 'tracktop') && y < 0.94 * S) return REG.topTrim; // ribbed hem band
      if (ts === 'jacket' && y < 0.935 * S) return REG.topTrim; // waistband
      if ((ts === 'polo' || ts === 'shirt') && Math.abs(x) < 0.011 * S && z > 0.06 * S && y > 1.3 * S && y < 1.455 * S) return REG.topTrim;
      return r;
    };
    fns.bottom = (x, y, z, r) => {
      if (spec.bottom === 'skirt') return y > 0.968 * S ? REG.bottomTrim : r;
      if (y > 0.962 * S) {
        const belt = spec.belt && spec.tucked;
        if (belt && Math.abs(x) < 0.019 * S && z > 0.05 * S && y > 0.967 * S && y < 0.995 * S) return REG.metal;
        return belt ? REG.belt : REG.bottomTrim;
      }
      return r;
    };
    return fns;
  }

  const ERR = { body: 0.0014, head: 0.00075, hand: 0.0007, shoe: 0.001, top: 0.0013, under: 0.0013, bottom: 0.0013, hair: 0.0011, hat: 0.001, bag: 0.0016 };
  function build(spec) {
    const T0 = Date.now(), times = {};
    const mh = spec.mh && MHD ? mhHead(spec) : null; // (its eyes move the eye bones)
    const R = makeRig(spec, mh);
    const S = R.S, q = (spec.q || 1) * (spec.hq ? 0.62 : 1); // playable characters: a much finer grid
    const L = {};
    L.body = bodyLayer(R, 0.02 * q * (spec.hq ? 0.85 : 1), -0.0015 * S);
    const ringY = mh ? R.P.head[1] + mh.ring : null;
    if (mh) { L.body.int(P_plane([0, 1, 0], [0, ringY - 0.002 * R.H, 0])); L.head = headLayer(R, 0.0042 * (spec.q || 1), ringY - 0.0025 * R.H); } // the neck up to the MakeHuman head (its edge overlaps it: mhParts)
    else L.head = headLayer(R, spec.hq ? 0.0028 * (spec.q || 1) : spec.hqHead ? 0.0038 * (spec.q || 1) : 0.0062 * q); // hq: ~3 mm cells so lips, nostrils and ear rims hold
    L.hand = handLayer(R, 0.0055 * q);
    L.shoe = shoeLayer(R, 0.0095 * q, spec.shoe || 'sneaker');
    L.top = topLayer(R, 0.0125 * q, spec.top || 'tshirt', spec);
    if (LAYERED[spec.top]) L.under = topLayer(R, 0.0125 * q, spec.top, spec, 'under');
    const bot = bottomLayer(R, 0.0135 * q, spec.bottom || 'jeans', spec); if (bot) L.bottom = bot;
    const hair = mh && (mh.hair || spec.hair === 'calvo') ? beardOnly(R, 0.008 * q, spec) : hairLayer(R, 0.008 * q, spec.hair, spec); if (hair) L.hair = hair; // (MakeHuman's haircut: cards, in mhParts; bald: painted)
    const hat = hatLayer(R, 0.009 * q, spec.hat); if (hat) L.hat = hat;
    if (spec.bag) L.bag = bagLayer(R, 0.013 * q, L.top);
    if (spec.headOnly) for (const k in L) delete L[k];
    else if (spec.only) for (const k in L) if (!spec.only.includes(k)) delete L[k];
    // the top of the shoulders (trapezius, the outer end of the collarbone) rides on the collarbone
    const trapPost = (x, y, z, acc) => {
      const c = acc.chest;
      if (!c) return;
      const t = sstep(0.06 * S, 0.15 * S, Math.abs(x)) * sstep(1.36 * S, 1.45 * S, y) * 0.85;
      if (t <= 0) return;
      const side = x > 0 ? 'clavL' : 'clavR';
      acc.chest = c * (1 - t); acc[side] = (acc[side] || 0) + c * t;
    };
    // shoulders: the top of the deltoid mostly stays with the shoulder girdle when the arm swings
    const shoulderPost = (x, y, z, acc) => {
      for (const [bn, cl, d, sh] of [['armL', 'clavL', R.dArmL, R.P.armL], ['armR', 'clavR', R.dArmR, R.P.armR]]) {
        const w = acc[bn];
        if (!w) continue;
        const t = (x - sh[0]) * d[0] + (y - sh[1]) * d[1] + (z - sh[2]) * d[2];
        const k = clamp(1 - (t + 0.015 * S) / (0.085 * S), 0, 1) * 0.55;
        if (k <= 0) continue;
        acc[bn] = w * (1 - k);
        acc[cl] = (acc[cl] || 0) + w * k;
      }
      trapPost(x, y, z, acc);
    };
    for (const k of ['body', 'top', 'under', 'bag']) if (L[k]) L[k].post = shoulderPost;
    // the face: skin over the brow ridge on the brow bones, the corners of the mouth on their own (expressions)
    if (L.head) {
      const hb = R.P.head, Sh = R.Sh;
      const move = (acc, to, t, from) => { for (const b of from) { const w = acc[b]; if (!w) continue; acc[b] = w * (1 - t); acc[to] = (acc[to] || 0) + w * t; } };
      L.head.post = (x, y, z, acc) => {
        trapPost(x, y, z, acc);
        const hx = (x - hb[0]) / Sh, hy = (y - hb[1]) / Sh, hz = (z - hb[2]) / Sh;
        if (hz < 0.045) return;
        const front = sstep(0.05, 0.075, hz);
        for (const sd of [1, -1]) {
          const bx = hx - sd * 0.031, by = hy - 0.097;
          const tb = Math.exp(-(bx * bx) / (0.019 * 0.019) - (by * by) / (0.011 * 0.011)) * front * 0.9;
          if (tb > 0.01) move(acc, sd > 0 ? 'browL' : 'browR', tb, ['head']);
          const mx = hx - sd * 0.0245, my = hy - 0.0068;
          const tm = Math.exp(-(mx * mx) / (0.0145 * 0.0145) - (my * my) / (0.0125 * 0.0125)) * sstep(0.066, 0.085, hz) * 0.9;
          if (tm > 0.01) move(acc, sd > 0 ? 'mouthL' : 'mouthR', tm, ['head', 'jaw']);
        }
      };
    }
    const fns = regionFns(R, spec, L);
    let parts = [];
    const occ = [];
    for (const name in L) {
      const t = Date.now();
      const layer = L[name];
      layer.buildHash(0.04);
      const M = polygonize(layer, layer.h);
      if (M && name === 'hair') dropCrumbs(M, (HATS[spec.hat] ? 0.032 : 0.012) * S); // under a hat: nothing but the band above the ears
      if (M) {
        const at = layerAttribs(layer, M, fns[name]);
        const P = { name, nv: M.nv, pos: M.pos, nrm: M.nrm, idx: M.idx, reg: at.reg, bones: at.bones, order: layer.order };
        parts.push(P);
        if (name === 'hand' || name === 'shoe') parts.push(mirrorPart(P));
      }
      occ.push(occluderOf(layer, false));
      if (name === 'hand' || name === 'shoe') occ.push(occluderOf(layer, true));
      times[name] = Date.now() - t;
    }
    let t = Date.now();
    cullHidden(parts, occ);
    times.cull = Date.now() - t;
    t = Date.now();
    const raw = parts.reduce((a, P) => a + P.idx.length / 3, 0);
    const errK = spec.hq ? 0.38 : 1;
    parts = parts.map((P) => decimate(P, (ERR[P.name] || 0.0012) * (P.name === 'head' && spec.hqHead ? 0.55 : errK), 0));
    times.decimate = Date.now() - t;
    // explicit meshes: eyeballs, eyelids, glasses, strings, cane (hi and lo detail)
    const extras = (lo) => {
      const Ae = new Acc(), Al = new Acc(), Aa = new Acc();
      for (const s of mh ? [] : [1, -1]) {
        const C = R.P[s > 0 ? 'eyeL' : 'eyeR'];
        eyeMesh(Ae, C, R.eyeR, s > 0 ? 'eyeL' : 'eyeR', lo);
        lidMesh(Al, C, R.eyeR, R.Sh, true, s > 0 ? 'lidL' : 'lidR', lo);
        lidMesh(Al, C, R.eyeR, R.Sh, false, 'head', lo);
      }
      if (spec.glasses) glassesMesh(Aa, R);
      if (spec.earrings) earringsMesh(Aa, R);
      if (spec.watch) watchMesh(Aa, R);
      if (spec.top === 'hoodie' && L.top) for (const s of [-1, 1]) { // the drawstrings: out of the neckline, hanging on the chest
        const pts = [[s * 0.03, 1.452, 0.1], [s * 0.031, 1.41, 0.12], [s * 0.033, 1.36, 0.13], [s * 0.035, 1.31, 0.13], [s * 0.036, 1.27, 0.128]]
          .map(([x, y, z]) => onSurface(L.top, [x * S, y * S, z * S * R.W], 0.0034 * S));
        tubeMesh(Aa, pts, 0.0028 * S, REG.lace, 'chest', lo ? 3 : 5);
      }
      if (spec.cane) {
        const o = R.P.handR, m = R.R.handR, hs = R.S;
        const T = (x, y, z) => add(o, mulM(m, [x * hs, y * hs, z * hs]));
        tubeMesh(Aa, [T(0.012, -0.92, 0.045), T(0.012, -0.5, 0.03), T(0.012, -0.06, 0.018), T(0.012, 0.0, 0.03), T(0.012, 0.012, 0.06), T(0.012, -0.012, 0.088)], 0.0095 * hs, REG.cane, 'handR', lo ? 4 : 7);
      }
      const out = [];
      if (Ae.nv) out.push(accPart(Ae, 'eye', spec, R));
      if (Al.nv) out.push(accPart(Al, 'lid', spec, R));
      if (Aa.nv) out.push(accPart(Aa, 'acc', spec, R));
      return out;
    };
    // the MakeHuman head, its edge stitched onto the sculpted neck (the neck's field without the clip)
    let mhP = [];
    if (mh && spec.headOnly) mhP = mhParts(R, mh, null, spec.hat);
    else if (mh) {
      t = Date.now();
      const nl = headLayer(R, 0.01, 9);
      nl.buildHash(0.03);
      mhP = mhParts(R, mh, (x, y, z) => nl.evalFast(x, y, z), spec.hat);
      times.mh = Date.now() - t;
    }
    // (far off, the MakeHuman head: a quarter of the skin's triangles, its brows, eyes and hair's outer side; no teeth
    // or lashes)
    const mhLo = mhP.filter((P) => P.mh !== 'teeth' && P.mh !== 'lash' && P.mh !== 'hairBack').map((P) => P.mh === 'skin' ? decimate(P, 0.0028 * S, 0.27) : P.mh === 'eye' ? decimate(P, 0.0015 * S, 0.35) : P);
    const hiParts = parts.concat(extras(false), mhP), loExtras = extras(true).concat(mhLo);
    t = Date.now();
    computeAO(hiParts.concat(loExtras), occ, S);
    times.ao = Date.now() - t;
    const hi = merge(hiParts, spec, R);
    t = Date.now();
    const loParts = parts.map((P) => decimate(P, 0.012, (P.name === 'head' ? 0.22 : 0.16) * (spec.hq ? 0.42 : 1))).concat(loExtras);
    times.lod = Date.now() - t;
    const lo = merge(loParts, spec, R);
    times.raw = raw;
    times.hi = hi.index.length / 3;
    times.lo = lo.index.length / 3;
    return { key: spec.key, bones: R.bones.map((b) => ({ name: b.name, parent: b.parent, off: b.off, rot: b.rot })), lods: [hi, lo], ms: Date.now() - T0, times, mh: !!mh, mhWanted: !!spec.mh, neckY: mh ? ringY : null,
      brow: mh ? [R.P.head[1] + mh.browL[1], R.P.head[2] + mh.eyeL[2], Math.abs(mh.eyeL[0])] : null }; // (the brow line, the eyes' depth and spacing: a fringe cut)
  }
  function transferables(res) {
    const t = [];
    for (const l of res.lods) for (const k of ['pos', 'nrm', 'si', 'sw', 'reg', 'mat', 'ao', 'face', 'uv', 'index']) t.push(l[k].buffer);
    return t;
  }
  if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.onmessage = (e) => {
      if (e.data.mh !== undefined) { setMH(e.data.mh ? new Uint8Array(e.data.mh) : null); return; } // the MakeHuman data, once
      const { id, spec } = e.data;
      try { const r = build(spec); self.postMessage({ id, r }, transferables(r)); } catch (err) { self.postMessage({ id, error: String((err && err.stack) || err) }); }
    };
  }
  // bone rest offsets and bind (A-pose) rotations for a spec, without building any geometry
  function rig(spec) { return makeRig(spec).bones.map((b) => ({ name: b.name, parent: b.parent, off: b.off, rot: b.rot })); }
  const landmarks = (g) => baseLandmarks({ f: g === 'f' });
  return { build, rig, transferables, landmarks, setMH, REG, MAT, BONES, VERSION: 31, _dbg: { makeRig, hairLayer, headLayer, headLandmarks, mhHead } };
}
