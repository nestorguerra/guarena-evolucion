// The kerbs of Guareña's streets, laid along their houses. The orthophotos give every measured street its carriageway
// (e.w, kerb to kerb: tools/aceras) and its line between its houses (tools/build_map.py), the rest of the town the
// town's rule; but a street's houses stand nearer and further along it, and one carriageway from end to end left the
// pavement a strip wherever they came in. Here, metre by metre, from the walls as they stand (after the welding, the
// houses filling the gaps and the pieces closing the cracks):
//  - the kerb comes in wherever the houses leave less than a metre to walk on (never out beyond where the photographs
//    have it), as far as the carriageway can give: 3 m one way, 4.6 m both ways where the street is wide enough for
//    two lanes; at a short narrowing (a house jutting out) the carriageway down to 2.8 m, and only then the pavement;
//  - a street too narrow for two pavements to walk on has one, on the side the photographs show the wider, and the
//    carriageway runs to the houses on the other; one too narrow even for that is a single platform — no kerbs, the
//    carriageway from house to house, its people walking along the fronts at 20 km/h traffic (traffic.js);
//  - a side without houses gives the carriageway up to a metre and a half more, if the pavement needs it;
//  - the kerb bends in and out at most 30 cm a metre, never for a doorway; where a street has no pavement, its
//    carriageway reaches the line of the fronts (not into every doorway and gap between two houses).
// e.kerb = { n, st (m between samples), p, m: the kerb's offset from the line (+ side, − side), fp, fm: the houses' (NaN
// where none within reach), regime: 0 two pavements · 1 one, on side `side` · 2 a single platform, np, nm: where the
// photographs put the kerbs (before the pavements were given their metre) }
import { polySample, polyNearest } from './util.js';

export const WALK = 1.0, MIN_WALK = 0.9;
const STEP = 1, REACH = 9, SLOPE = 0.3, OPEN = 1.5;

export function layKerbs(map, { walk = WALK, minWalk = MIN_WALK } = {}) {
  const col = map.collider, t = {};
  const stats = { edges: 0, two: 0, one: 0, shared: 0, km: 0 };
  for (const e of map.edges) {
    e.kerb = null;
    if (!e.drive || e.dirt || e.walkOnly || e.blocked || e.cls === 'track' || e.len < 3) continue;
    const L2 = e.pts.length - 2, m0 = polySample(e.pts, e.cum, e.len / 2, t);
    if (!map.inTown(m0.x, m0.z) && !map.inTown(e.pts[0], e.pts[1]) && !map.inTown(e.pts[L2], e.pts[L2 + 1])) continue;
    const n = Math.max(2, Math.round(e.len / STEP) + 1), st = e.len / (n - 1);
    // where the photographs put each kerb: half the carriageway as measured (the street's own measurement, or the
    // town's rule), or, where the review placed it point by point (data/bordillos.json), through those points
    const NN = [nominal(e, 1, n, st), nominal(e, -1, n, st)];
    // the houses either side, every metre: the nearest wall, at 1.2 m
    const F = [new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      polySample(e.pts, e.cum, i * st, t);
      for (let k = 0; k < 2; k++) {
        const sd = k ? -1 : 1, nx = -t.dz * sd, nz = t.dx * sd, R = NN[k][i] + REACH;
        const f = col.raycast(t.x, t.z, t.x + nx * R, t.z + nz * R, 1.2, 1.2);
        F[k][i] = f >= 1 ? NaN : f * R;
      }
    }
    // the line of the fronts either side, as a line that bends at most SLOPE a metre: a house jutting out pulls it in, a
    // doorway set back or a gap of a few metres between two houses does not take it in (no house within 6 m: none)
    const Fs = F.map((a) => {
      const o = new Float32Array(n), W = Math.ceil(6 / st);
      for (let i = 0; i < n; i++) {
        let v = NaN;
        for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) {
          const f = a[j];
          if (f === f) { const c = f + SLOPE * st * Math.abs(i - j); if (!(v <= c)) v = c; }
        }
        o[i] = v;
      }
      return o;
    });
    // (the carriageway as photographed, its typical width: two lanes where it has room for them)
    const cw = []; for (let i = 0; i < n; i += 3) cw.push(NN[0][i] + NN[1][i]);
    cw.sort((a, b) => a - b);
    const cMin = e.oneway ? 3.0 : cw[cw.length >> 1] >= 5.5 ? 4.6 : 3.0, cPinch = Math.max(2.8, cMin - 0.8);
    // ---- the street's kind: two pavements, one, or none (the share of its metres with houses each allows)
    let cnt = 0, two = 0, oneP = 0, oneM = 0;
    for (let i = 0; i < n; i++) {
      const a = Fs[0][i], b = Fs[1][i];
      if (a !== a && b !== b) continue;
      cnt++;
      const Na = NN[0][i], Nb = NN[1][i];
      const wa = a === a ? a - minWalk : Na + OPEN, wb = b === b ? b - minWalk : Nb + OPEN; // (kerb with a pavement to walk)
      const xa = a === a ? a : Na + OPEN, xb = b === b ? b : Nb + OPEN; // (kerb at the houses: no pavement)
      if (wa + wb >= cMin) two++;
      if (wa + xb >= cMin) oneP++;
      if (wb + xa >= cMin) oneM++;
    }
    let regime = 0, side = 0;
    if (cnt >= 4 && two < cnt * 0.85) {
      const pp = (e.swP ?? e.sw ?? 0), pm = (e.swM ?? e.sw ?? 0);
      const okP = oneP >= cnt * 0.85, okM = oneM >= cnt * 0.85;
      if (okP || okM) { regime = 1; side = okP && okM ? (pp >= pm ? 1 : -1) : okP ? 1 : -1; }
      else regime = 2;
    }
    const hasPav = [regime === 0 || (regime === 1 && side === 1), regime === 0 || (regime === 1 && side === -1)];
    // ---- every metre: where the kerbs go
    const K = [new Float32Array(n), new Float32Array(n)], cPre = new Float32Array(n);
    const lo = [0, 0], hi = [0, 0];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) {
        const f = Fs[k][i], N = NN[k][i];
        if (f !== f) { K[k][i] = N; lo[k] = N; hi[k] = N + OPEN; continue; } // (no houses: as photographed, or wider)
        if (hasPav[k]) { K[k][i] = Math.min(N, f - walk); lo[k] = K[k][i]; hi[k] = f - minWalk; }
        else { K[k][i] = f; lo[k] = f; hi[k] = f; } // (no pavement: the carriageway to the houses)
      }
      squeeze(K, i, lo, hi, cMin, cPinch, Fs, hasPav);
      cPre[i] = K[0][i] + K[1][i];
    }
    // ---- smooth: the kerb bends in and out at most SLOPE a metre (only ever further in), then the carriageway as it was
    // (given back by the other side where its pavement is the wider)
    for (let k = 0; k < 2; k++) {
      if (!hasPav[k]) continue;
      const a = K[k], b = Float32Array.from(a), W = Math.ceil(4 / (SLOPE * st));
      for (let i = 0; i < n; i++) for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) b[i] = Math.min(b[i], a[j] + SLOPE * st * Math.abs(i - j));
      K[k] = b;
    }
    for (let i = 0; i < n; i++) {
      const c = K[0][i] + K[1][i], need = cPre[i];
      if (c >= need - 1e-4) continue;
      // (back out, on the side with the wider pavement first)
      let d = need - c;
      for (let pass = 0; pass < 2 && d > 1e-4; pass++) for (let k = 0; k < 2 && d > 1e-4; k++) {
        const f = Fs[k][i] === Fs[k][i] ? Fs[k][i] : NN[k][i] + OPEN, room = f - K[k][i], o = Fs[1 - k][i] === Fs[1 - k][i] ? Fs[1 - k][i] - K[1 - k][i] : 0;
        if (pass === 0 && room < o) continue;
        const g = Math.min(d, Math.max(0, room));
        K[k][i] += g; d -= g;
      }
    }
    e.kerb = { n, st, p: K[0], m: K[1], fp: F[0], fm: F[1], regime, side, np: NN[0], nm: NN[1] };
    stats.edges++; stats.km += e.len / 1000;
    stats[regime === 0 ? 'two' : regime === 1 ? 'one' : 'shared']++;
  }
  stats.km = +stats.km.toFixed(1);
  return stats;
}

// a kerb's nominal offset from the line, every sample: half the carriageway, or through the points the review placed
// (projected on the line; straight between them, level past the first and the last)
function nominal(e, side, n, st) {
  const out = new Float32Array(n).fill(e.w / 2), P = e.kerbPts && (side > 0 ? e.kerbPts.p : e.kerbPts.m);
  if (!P || P.length < 2) return out;
  const q = [];
  for (let i = 0; i < P.length; i += 2) {
    const r = polyNearest(e.pts, e.cum, P[i], P[i + 1]), t = polySample(e.pts, e.cum, r.s, {});
    const sd = (P[i] - t.x) * -t.dz + (P[i + 1] - t.z) * t.dx >= 0 ? 1 : -1;
    if (sd === side && r.d > 0.5 && r.d < 20) q.push([r.s, r.d]);
  }
  if (!q.length) return out;
  q.sort((a, b) => a[0] - b[0]);
  for (let i = 0, j = 0; i < n; i++) {
    const s = i * st;
    while (j + 1 < q.length && q[j + 1][0] <= s) j++;
    if (s <= q[0][0]) out[i] = q[0][1];
    else if (j + 1 >= q.length) out[i] = q[q.length - 1][1];
    else out[i] = q[j][1] + ((q[j + 1][1] - q[j][1]) * (s - q[j][0])) / Math.max(1e-6, q[j + 1][0] - q[j][0]);
  }
  return out;
}

// one metre: the kerbs out (towards hi) until the carriageway is cMin — first the pavements down to MIN_WALK (hi), then
// a narrower carriageway at a narrowing (cPinch), then the pavements narrower still, to nothing (the houses)
function squeeze(K, i, lo, hi, cMin, cPinch, Fs, hasPav) {
  let c = K[0][i] + K[1][i];
  if (c >= cMin) return;
  // 1: the pavements to MIN_WALK (and an open side out), in proportion to what each can give
  const r0 = Math.max(0, hi[0] - K[0][i]), r1 = Math.max(0, hi[1] - K[1][i]);
  if (r0 + r1 > 1e-6) {
    const g = Math.min(1, (cMin - c) / (r0 + r1));
    K[0][i] += r0 * g; K[1][i] += r1 * g;
    c = K[0][i] + K[1][i];
  }
  if (c >= cPinch - 1e-6) return;
  // 2: a narrowing — the pavements give the rest, down to nothing
  const f0 = Fs[0][i] === Fs[0][i] ? Fs[0][i] : K[0][i], f1 = Fs[1][i] === Fs[1][i] ? Fs[1][i] : K[1][i];
  const q0 = hasPav[0] ? Math.max(0, f0 - K[0][i]) : 0, q1 = hasPav[1] ? Math.max(0, f1 - K[1][i]) : 0;
  if (q0 + q1 > 1e-6) {
    const g = Math.min(1, (cPinch - c) / (q0 + q1));
    K[0][i] += q0 * g; K[1][i] += q1 * g;
  }
}

// the kerb's offset from the street's line at s, on one side (the photographs' half carriageway where it was not laid)
export function kerbAt(e, s, side) {
  const k = e.kerb;
  if (!k) return e.w / 2;
  const a = side > 0 ? k.p : k.m, x = Math.max(0, Math.min(k.n - 1, s / k.st)), i = Math.min(k.n - 2, Math.floor(x)), f = x - i;
  return a[i] + (a[i + 1] - a[i]) * f;
}
