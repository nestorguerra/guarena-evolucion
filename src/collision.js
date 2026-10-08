// Static 2D collision world: wall segments (building outlines, walls) and round props, in a CSR uniform grid.
import { clamp } from './util.js';

export class StaticCollider {
  constructor(x0, z0, x1, z1, cell = 8) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.nx = Math.ceil((x1 - x0) / cell) + 1;
    this.nz = Math.ceil((z1 - z0) / cell) + 1;
    this._segs = [];      // temp: ax,az,bx,bz,h,owner
    this._circles = [];   // temp: x,z,r,h,owner(kind)
  }
  addSegment(ax, az, bx, bz, h, owner = -1) { this._segs.push(ax, az, bx, bz, h, owner); }
  addRing(ring, h, owner = -1) {
    const n = ring.length;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n;
      this.addSegment(ring[i], ring[i + 1], ring[j], ring[j + 1], h, owner);
    }
  }
  addCircle(x, z, r, h, owner = -1) { this._circles.push(x, z, r, h, owner); return this._circles.length / 5 - 1; }
  // add wall segments after the grid was built (flat array ax,az,bx,bz,h,owner…): rebuilds the segment grid
  appendSegments(arr) {
    if (!arr.length) return;
    if (this._segs) { this._segs.push(...arr); return; }
    this._segs = Array.from(this.segs || []);
    for (let i = 0; i < arr.length; i++) this._segs.push(arr[i]);
    this.buildSegments();
  }

  build() { this.buildSegments(); this.buildCircles(); }

  buildSegments() {
    const S = 6;
    this.segs = new Float32Array(this._segs);
    this.nSeg = this.segs.length / S;
    const nCells = this.nx * this.nz;
    const count = new Int32Array(nCells + 1);
    const cellsOfSeg = (i, fn) => {
      const o = i * S;
      const ax = this.segs[o], az = this.segs[o + 1], bx = this.segs[o + 2], bz = this.segs[o + 3];
      const cx0 = this.cx(Math.min(ax, bx)), cx1 = this.cx(Math.max(ax, bx));
      const cz0 = this.cz(Math.min(az, bz)), cz1 = this.cz(Math.max(az, bz));
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cz * this.nx + cx);
    };
    for (let i = 0; i < this.nSeg; i++) cellsOfSeg(i, (c) => count[c + 1]++);
    for (let c = 0; c < nCells; c++) count[c + 1] += count[c];
    this.segStart = count;
    this.segItems = new Int32Array(count[nCells]);
    const fill = new Int32Array(nCells);
    for (let i = 0; i < this.nSeg; i++) cellsOfSeg(i, (c) => { this.segItems[count[c] + fill[c]++] = i; });
    this.segStamp = new Uint32Array(this.nSeg);
    this.stamp = this.stamp || 1;
    this._segs = null;
    if (!this.circles) this.buildCircles();
  }

  // (Re)build the circle grid; may be called again after adding more circles.
  buildCircles() {
    const C = 5;
    const prevAlive = this.circleAlive;
    this.circles = new Float32Array(this._circles);
    this.nCirc = this.circles.length / C;
    this.circleAlive = new Uint8Array(this.nCirc).fill(1);
    if (prevAlive) this.circleAlive.set(prevAlive.subarray(0, Math.min(prevAlive.length, this.nCirc)));
    const nCells = this.nx * this.nz;
    const cellsOfCirc = (i, fn) => {
      const o = i * C;
      const x = this.circles[o], z = this.circles[o + 1], r = this.circles[o + 2];
      const cx0 = this.cx(x - r), cx1 = this.cx(x + r), cz0 = this.cz(z - r), cz1 = this.cz(z + r);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cz * this.nx + cx);
    };
    const fill = new Int32Array(nCells);
    const ccount = new Int32Array(nCells + 1);
    for (let i = 0; i < this.nCirc; i++) cellsOfCirc(i, (c) => ccount[c + 1]++);
    for (let c = 0; c < nCells; c++) ccount[c + 1] += ccount[c];
    this.circStart = ccount;
    this.circItems = new Int32Array(ccount[nCells]);
    fill.fill(0);
    for (let i = 0; i < this.nCirc; i++) cellsOfCirc(i, (c) => { this.circItems[ccount[c] + fill[c]++] = i; });
    this.circStamp = new Uint32Array(this.nCirc);
    this.stamp = this.stamp || 1;
  }
  cx(x) { return clamp(Math.floor((x - this.x0) / this.cell), 0, this.nx - 1); }
  cz(z) { return clamp(Math.floor((z - this.z0) / this.cell), 0, this.nz - 1); }

  // Iterate segments whose cells overlap bbox. fn(index, offset) returns true to stop.
  forSegs(x0, z0, x1, z1, fn) {
    const st = ++this.stamp;
    const cx0 = this.cx(x0), cx1 = this.cx(x1), cz0 = this.cz(z0), cz1 = this.cz(z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cz * this.nx + cx;
        for (let k = this.segStart[c], e = this.segStart[c + 1]; k < e; k++) {
          const i = this.segItems[k];
          if (this.segStamp[i] === st) continue;
          this.segStamp[i] = st;
          if (fn(i, i * 6)) return;
        }
      }
    }
  }
  forCircles(x0, z0, x1, z1, fn) {
    const st = ++this.stamp;
    const cx0 = this.cx(x0), cx1 = this.cx(x1), cz0 = this.cz(z0), cz1 = this.cz(z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cz * this.nx + cx;
        for (let k = this.circStart[c], e = this.circStart[c + 1]; k < e; k++) {
          const i = this.circItems[k];
          if (this.circStamp[i] === st || !this.circleAlive[i]) continue;
          this.circStamp[i] = st;
          if (fn(i, i * 5)) return;
        }
      }
    }
  }

  // Push a circle out of walls. Returns {hit, nx, nz} of the strongest contact (reused object).
  resolveCircle(pos, r, maxH = 99, res = this._res || (this._res = { hit: false, nx: 0, nz: 0, depth: 0, circle: -1 })) {
    res.hit = false; res.depth = 0; res.circle = -1;
    const S = this.segs;
    for (let it = 0; it < 2; it++) {
      const x = pos.x, z = pos.z;
      this.forSegs(x - r, z - r, x + r, z + r, (i, o) => {
        if (S[o + 4] < 0.3) return false;
        const ax = S[o], az = S[o + 1], bx = S[o + 2], bz = S[o + 3];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((pos.x - ax) * dx + (pos.z - az) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + dx * t, cz = az + dz * t;
        let ex = pos.x - cx, ez = pos.z - cz;
        const d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          let d = Math.sqrt(d2);
          if (d < 1e-5) { ex = -dz; ez = dx; d = Math.hypot(ex, ez) || 1; }
          const pen = r - d;
          pos.x += (ex / d) * pen; pos.z += (ez / d) * pen;
          if (pen > res.depth) { res.depth = pen; res.nx = ex / d; res.nz = ez / d; }
          res.hit = true;
        }
        return false;
      });
      const C = this.circles;
      this.forCircles(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (i, o) => {
        const ex = pos.x - C[o], ez = pos.z - C[o + 1];
        const rr = r + C[o + 2];
        const d2 = ex * ex + ez * ez;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const pen = rr - d;
          pos.x += (ex / d) * pen; pos.z += (ez / d) * pen;
          if (pen > res.depth) { res.depth = pen; res.nx = ex / d; res.nz = ez / d; }
          res.hit = true; res.circle = i;
        }
        return false;
      });
    }
    return res;
  }

  // Oriented box vs walls/props. box: {x,z,ux,uz (forward unit), hl (half length), hw (half width)}
  // Returns deepest contact {hit, nx, nz, depth, px, pz, circle} (normal points out of obstacle toward the box).
  boxContact(b, out) {
    out.hit = false; out.depth = 0; out.circle = -1;
    const S = this.segs;
    const rad = Math.hypot(b.hl, b.hw);
    const ux = b.ux, uz = b.uz, vx = -uz, vz = ux; // v = left
    // box corners
    const cx = b.x, cz = b.z;
    this.forSegs(cx - rad, cz - rad, cx + rad, cz + rad, (i, o) => {
      if (S[o + 4] < 0.3) return false;
      const ax = S[o], az = S[o + 1], bx = S[o + 2], bz = S[o + 3];
      // segment in box local coords
      const alx = (ax - cx) * ux + (az - cz) * uz, alz = (ax - cx) * vx + (az - cz) * vz;
      const blx = (bx - cx) * ux + (bz - cz) * uz, blz = (bx - cx) * vx + (bz - cz) * vz;
      // quick reject
      if (Math.max(alx, blx) < -b.hl || Math.min(alx, blx) > b.hl || Math.max(alz, blz) < -b.hw || Math.min(alz, blz) > b.hw) return false;
      // SAT axes: local x, local z, segment normal
      let best = Infinity, bnx = 0, bnz = 0, bpx = 0, bpz = 0;
      // axis local x
      {
        const mn = Math.min(alx, blx), mx = Math.max(alx, blx);
        const o1 = b.hl - mn, o2 = mx + b.hl; // push box toward -x by o1? compute overlap
        const ov = Math.min(o1, o2);
        if (ov <= 0) return false;
        if (ov < best) {
          best = ov;
          // obstacle more to +x side (mn close to +hl) => push box -x
          const sgn = o1 < o2 ? -1 : 1;
          bnx = sgn; bnz = 0;
          bpx = sgn < 0 ? b.hl : -b.hl; bpz = clamp((alz + blz) / 2, -b.hw, b.hw);
        }
      }
      {
        const mn = Math.min(alz, blz), mx = Math.max(alz, blz);
        const o1 = b.hw - mn, o2 = mx + b.hw;
        const ov = Math.min(o1, o2);
        if (ov <= 0) return false;
        if (ov < best) {
          best = ov;
          const sgn = o1 < o2 ? -1 : 1;
          bnx = 0; bnz = sgn;
          bpz = sgn < 0 ? b.hw : -b.hw; bpx = clamp((alx + blx) / 2, -b.hl, b.hl);
        }
      }
      {
        let nx = -(blz - alz), nz = blx - alx;
        const nl = Math.hypot(nx, nz);
        if (nl < 1e-6) return false;
        nx /= nl; nz /= nl;
        const sd = alx * nx + alz * nz; // segment offset along n
        // box projection radius
        const pr = b.hl * Math.abs(nx) + b.hw * Math.abs(nz);
        // box centre at 0 → interval [-pr, pr]; segment is a point at sd
        const o1 = pr - sd, o2 = sd + pr;
        const ov = Math.min(o1, o2);
        if (ov <= 0) return false;
        if (ov < best) {
          best = ov;
          const sgn = o1 < o2 ? -1 : 1;
          bnx = nx * sgn; bnz = nz * sgn;
          // deepest corner against normal
          const kx = -Math.sign(bnx) * b.hl, kz = -Math.sign(bnz) * b.hw;
          bpx = kx; bpz = kz;
        }
      }
      if (best > out.depth) {
        out.hit = true; out.depth = best;
        out.nx = bnx * ux + bnz * vx; out.nz = bnx * uz + bnz * vz;
        out.px = cx + bpx * ux + bpz * vx; out.pz = cz + bpx * uz + bpz * vz;
        out.circle = -1;
      }
      return false;
    });
    const C = this.circles;
    this.forCircles(cx - rad, cz - rad, cx + rad, cz + rad, (i, o) => {
      const lx = (C[o] - cx) * ux + (C[o + 1] - cz) * uz, lz = (C[o] - cx) * vx + (C[o + 1] - cz) * vz;
      const qx = clamp(lx, -b.hl, b.hl), qz = clamp(lz, -b.hw, b.hw);
      let dx = lx - qx, dz = lz - qz;
      const d2 = dx * dx + dz * dz;
      const r = C[o + 2];
      if (d2 >= r * r) return false;
      let depth, nx, nz;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        depth = r - d; nx = -dx / d; nz = -dz / d;
      } else {
        // centre inside box
        const ox = b.hl - Math.abs(lx), oz = b.hw - Math.abs(lz);
        if (ox < oz) { depth = ox + r; nx = -Math.sign(lx); nz = 0; } else { depth = oz + r; nx = 0; nz = -Math.sign(lz); }
      }
      if (depth > out.depth) {
        out.hit = true; out.depth = depth;
        out.nx = nx * ux + nz * vx; out.nz = nx * uz + nz * vz;
        out.px = cx + qx * ux + qz * vx; out.pz = cz + qx * uz + qz * vz;
        out.circle = i;
      }
      return false;
    });
    return out;
  }

  // Ray along ground from (x0,z0,y0) to (x1,z1,y1). Returns t in [0,1] of first blocking hit or 1.
  // does the move (ax, az) → (bx, bz) cross a wall or a piece of furniture (anything above a kerb)?
  crosses(ax, az, bx, bz, minH = 0.3) {
    if (!this.segs) return false;
    const S = this.segs;
    let hit = false;
    this.forSegs(Math.min(ax, bx) - 0.05, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, Math.max(az, bz) + 0.05, (i, o) => {
      if (S[o + 4] < minH) return false;
      const x1 = S[o], z1 = S[o + 1], x2 = S[o + 2], z2 = S[o + 3];
      const d = (bx - ax) * (z2 - z1) - (bz - az) * (x2 - x1);
      if (Math.abs(d) < 1e-12) return false;
      const t = ((x1 - ax) * (z2 - z1) - (z1 - az) * (x2 - x1)) / d;
      const u = ((x1 - ax) * (bz - az) - (z1 - az) * (bx - ax)) / d;
      if (t > 0 && t <= 1 && u >= 0 && u <= 1) { hit = true; return true; }
      return false;
    });
    return hit;
  }
  // A ball of radius r moved (x0, z0, y0) → (x1, z1, y1): the share of the way it goes before it touches a wall it is
  // lower than (1: all of it) — the camera's room, so that neither it nor its near plane ever enters a wall. A wall the
  // ball already touches where it sets off (the player's head beside a façade) only keeps it from coming any closer to
  // that wall than it started.
  sweepCircle(x0, z0, x1, z1, y0, y1, r) {
    const S = this.segs;
    if (!S) return 1;
    let best = 1;
    const dx = x1 - x0, dz = z1 - z0;
    if (dx * dx + dz * dz < 1e-10) return 1;
    const lower = (t, h) => y0 + (y1 - y0) * t < h;
    this.forSegs(Math.min(x0, x1) - r, Math.min(z0, z1) - r, Math.max(x0, x1) + r, Math.max(z0, z1) + r, (i, o) => {
      const h = S[o + 4];
      if (h < 0.3) return false;
      const ax = S[o], az = S[o + 1], sx = S[o + 2] - ax, sz = S[o + 3] - az, sl2 = sx * sx + sz * sz;
      if (sl2 < 1e-10) return false;
      let u0 = ((x0 - ax) * sx + (z0 - az) * sz) / sl2; u0 = u0 < 0 ? 0 : u0 > 1 ? 1 : u0;
      const d0 = Math.hypot(x0 - ax - sx * u0, z0 - az - sz * u0);
      const R = d0 > r ? r : d0 * 0.97; // (already touching: no closer than it is)
      if (R < 1e-4) return false;
      // the band along the wall's middle
      const sl = Math.sqrt(sl2), nx = -sz / sl, nz = sx / sl;
      const s0 = (x0 - ax) * nx + (z0 - az) * nz, sd = dx * nx + dz * nz;
      if (Math.abs(sd) > 1e-9 && Math.abs(s0) >= R && sd * s0 < 0) { // (coming at it from outside the band)
        const side = s0 >= 0 ? 1 : -1, t = (side * R - s0) / sd;
        if (t >= 0 && t < best) {
          const px = x0 + dx * t, pz = z0 + dz * t, u = ((px - ax) * sx + (pz - az) * sz) / sl2;
          if (u >= 0 && u <= 1 && lower(t, h)) best = t;
        }
      }
      // the wall's two ends
      for (let e = 0; e < 2; e++) {
        const ex = e ? ax + sx : ax, ez = e ? az + sz : az, fx = x0 - ex, fz = z0 - ez;
        const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R * R;
        if (C < 0) continue; // (starts inside: the band test holds it)
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t >= 0 && t < best && lower(t, h)) best = t;
      }
      return false;
    });
    return best;
  }
  raycast(x0, z0, x1, z1, y0 = 1, y1 = 1, useCircles = false) {
    const S = this.segs;
    let best = 1;
    const dx = x1 - x0, dz = z1 - z0;
    this.forSegs(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (i, o) => {
      const ax = S[o], az = S[o + 1], sx = S[o + 2] - ax, sz = S[o + 3] - az;
      const den = dx * sz - dz * sx;
      if (Math.abs(den) < 1e-9) return false;
      const t = ((ax - x0) * sz - (az - z0) * sx) / den;
      const u = ((ax - x0) * dz - (az - z0) * dx) / den;
      if (u >= 0 && u <= 1 && t >= 0 && t < best) {
        const y = y0 + (y1 - y0) * t;
        if (y < S[o + 4]) best = t;
      }
      return false;
    });
    if (useCircles) {
      const C = this.circles;
      const L2 = dx * dx + dz * dz;
      this.forCircles(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), (i, o) => {
        if (C[o + 3] < 2) return false;
        const fx = x0 - C[o], fz = z0 - C[o + 1];
        const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - C[o + 2] * C[o + 2];
        const disc = b * b - 4 * L2 * c;
        if (disc < 0) return false;
        const t = (-b - Math.sqrt(disc)) / (2 * L2);
        if (t >= 0 && t < best) best = t;
        return false;
      });
    }
    return best;
  }
}

// Polygon lookup grid: which building contains a point?
export class PolyIndex {
  constructor(x0, z0, x1, z1, cell = 16) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.nx = Math.ceil((x1 - x0) / cell) + 1;
    this.nz = Math.ceil((z1 - z0) / cell) + 1;
    this.cells = new Map();
    this.polys = [];
  }
  add(ring, data) {
    const idx = this.polys.length;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]);
      z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]);
    }
    this.polys.push({ ring, data, x0, z0, x1, z1 });
    const cx0 = Math.floor((x0 - this.x0) / this.cell), cx1 = Math.floor((x1 - this.x0) / this.cell);
    const cz0 = Math.floor((z0 - this.z0) / this.cell), cz1 = Math.floor((z1 - this.z0) / this.cell);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cz * 100000 + cx;
      let a = this.cells.get(k);
      if (!a) this.cells.set(k, (a = []));
      a.push(idx);
    }
    return idx;
  }
  find(x, z) {
    const cx = Math.floor((x - this.x0) / this.cell), cz = Math.floor((z - this.z0) / this.cell);
    const a = this.cells.get(cz * 100000 + cx);
    if (!a) return null;
    for (const i of a) {
      const p = this.polys[i];
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
      if (pip(x, z, p.ring)) return p;
    }
    return null;
  }
  // every polygon whose bounds meet the box (each once)
  query(x0, z0, x1, z1, out = []) {
    const cx0 = Math.floor((x0 - this.x0) / this.cell), cx1 = Math.floor((x1 - this.x0) / this.cell);
    const cz0 = Math.floor((z0 - this.z0) / this.cell), cz1 = Math.floor((z1 - this.z0) / this.cell);
    const seen = this._seen || (this._seen = new Map());
    const stamp = (this._stamp = (this._stamp || 0) + 1);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const a = this.cells.get(cz * 100000 + cx);
      if (!a) continue;
      for (const i of a) {
        if (seen.get(i) === stamp) continue;
        seen.set(i, stamp);
        const p = this.polys[i];
        if (p.x1 < x0 || p.x0 > x1 || p.z1 < z0 || p.z0 > z1) continue;
        out.push(p);
      }
    }
    return out;
  }
}
function pip(x, z, r) {
  let ins = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
