// The schools of Guareña, recognisable from the street — players missed them («faltan los colegios e instituto»). The
// map knows their grounds (OpenStreetMap's amenity:school / college areas): CEIP San Gregorio and its infants' school,
// the IES Eugenio Frutos, the Colegio Nuestra Señora de los Dolores, the Escuela Infantil San Ginés. Each ground gets
// its fence where no building stands on the boundary (a cream plinth and red railings, as Spanish schools have), a gate
// on the street with the school's name over it and the three flags beside it, and in the yard a court (painted lines,
// two goals, two baskets) where there is room for one. A school too small for a yard gets its plaque on the facade.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInRing, polyNearest } from './util.js';
import { flagCanvas } from './textures.js';

const NAMES = [[/San Gregorio Educ/i, 'CEIP San Gregorio', 'Educación Infantil'], [/C\.?P\.? San Gregorio/i, 'CEIP San Gregorio', 'Guareña'],
  [/Eugenio Frutos/i, 'IES Eugenio Frutos', 'Guareña'], [/Dolores/i, 'Colegio Ntra. Sra. de los Dolores', 'Guareña'], [/San Gin[ée]s/i, 'Escuela Infantil San Ginés', 'Guareña']];
const display = (n) => { for (const [re, a, b] of NAMES) if (re.test(n)) return [a, b]; return [n, 'Guareña']; };

function canvasTex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  return t;
}
// railings: vertical bars between two rails, transparent between (a 1.2 m repeat)
function barsTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128); x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 128, 7); x.fillRect(0, 118, 128, 10);
  for (let i = 0; i < 10; i++) x.fillRect(4 + i * 12.8, 0, 3, 128);
  return canvasTex(c, true);
}
function signTexture(name, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 180;
  const x = c.getContext('2d');
  x.fillStyle = '#0f6a3a'; x.fillRect(0, 0, 1024, 180);
  x.fillStyle = '#ffffff'; x.fillRect(0, 150, 1024, 6);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let s = 78; x.font = `bold ${s}px Arial, sans-serif`;
  const t = name.toUpperCase();
  while (x.measureText(t).width > 960 && s > 24) { s -= 2; x.font = `bold ${s}px Arial, sans-serif`; }
  x.fillText(t, 512, 72);
  x.font = '30px Arial, sans-serif'; x.fillText(sub, 512, 124);
  return canvasTex(c);
}
function courtTexture(L, W) {
  const px = 24, cw = Math.round(L * px), ch = Math.round(W * px);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = '#3f7d5a'; x.fillRect(0, 0, cw, ch);
  x.fillStyle = '#4f9a6c'; x.fillRect(px, px, cw - 2 * px, ch - 2 * px);
  x.strokeStyle = '#f4f4ee'; x.lineWidth = Math.max(2, px * 0.08);
  x.strokeRect(px, px, cw - 2 * px, ch - 2 * px);
  x.beginPath(); x.moveTo(cw / 2, px); x.lineTo(cw / 2, ch - px); x.stroke();
  x.beginPath(); x.arc(cw / 2, ch / 2, 3 * px, 0, Math.PI * 2); x.stroke();
  for (const e of [px, cw - px]) { x.beginPath(); x.arc(e, ch / 2, 6 * px, e < cw / 2 ? -Math.PI / 2 : Math.PI / 2, e < cw / 2 ? Math.PI / 2 : Math.PI * 1.5); x.stroke(); }
  return canvasTex(c);
}

export function buildSchools(L) {
  const map = L.map;
  const areas = map.areas.filter((a) => /^amenity:(school|college|kindergarten)$/.test(a.kind) && a.name);
  const G = { plinth: [], bars: [], posts: [], white: [], pole: [] };
  const M = {
    plinth: new THREE.MeshStandardMaterial({ color: 0xe6dac2, roughness: 0.9 }),
    bars: new THREE.MeshStandardMaterial({ color: 0x8e2a22, roughness: 0.55, metalness: 0.3, map: barsTexture(), alphaTest: 0.5, side: THREE.DoubleSide }),
    posts: new THREE.MeshStandardMaterial({ color: 0x8e2a22, roughness: 0.55, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
    pole: new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.3, metalness: 0.8 }),
  };
  const at = (g, x, y, z, ry = 0) => { g.rotateY(ry); g.translate(x, y, z); return g; };
  const roadNear = (x, z, m) => {
    for (const id of map.edgesNear(x, z, 6)) { const e = map.edges[id]; if ((e.drive || e.walk) && polyNearest(e.pts, e.cum, x, z).d < e.w / 2 + m) return true; }
    return false;
  };
  // a straight run of fence from a to b (plinth, railings, posts) and its collider
  const fence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.4) return;
    const ry = Math.atan2(-(bz - az), bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    G.plinth.push(at(new THREE.BoxGeometry(len, 0.55, 0.22), mx, 0.275, mz, ry));
    const p = new THREE.PlaneGeometry(len, 1.35), uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 1.2));
    G.bars.push(at(p, mx, 1.225, mz, ry));
    const n = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) { const t = k / n; G.posts.push(at(new THREE.BoxGeometry(0.06, 1.95, 0.06), ax + (bx - ax) * t, 0.975, az + (bz - az) * t)); }
    L.seg(ax, az, bx, bz, 1.9);
  };
  const out = [];
  for (const a of areas) {
    const ring = a.ring, [name, sub] = display(a.name);
    let area = 0;
    for (let i = 0, n = ring.length; i < n; i += 2) { const j = (i + 2) % n; area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1]; }
    area = Math.abs(area) / 2;
    // the street the school looks onto: the nearest named road to the ground
    let cx = 0, cz = 0; for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cz += ring[i + 1]; } cx /= ring.length / 2; cz /= ring.length / 2;
    if (area < 600) { // no yard of its own: the plaque on its front
      const q = map.nearestEdge(cx, cz, 60, (e) => (e.drive || e.walk) && !!e.name);
      if (q) {
        const dx = cx - q.x, dz = cz - q.z, l = Math.hypot(dx, dz) || 1;
        for (let t = 0; t < l; t += 0.25) {
          const x = q.x + dx / l * t, z = q.z + dz / l * t;
          if (map.buildingAt(x, z)) {
            const ry = Math.atan2(-dx, -dz);
            const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), new THREE.MeshStandardMaterial({ map: signTexture(name, sub), roughness: 0.6 }));
            m.position.set(x - dx / l * 0.08, 2.7, z - dz / l * 0.08); m.rotation.y = ry; L.root.add(m);
            out.push({ name, plaque: [x, z] });
            break;
          }
        }
      }
      continue;
    }
    // ---- the fence: along each side of the ground, where no building stands on it and no road crosses
    const runs = [];
    for (let i = 0, n = ring.length; i < n; i += 2) {
      const j = (i + 2) % n, ax = ring[i], az = ring[i + 1], bx = ring[j], bz = ring[j + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz, nz = ux;
      let s0 = null;
      const flush = (s1) => { if (s0 !== null && s1 - s0 >= 1) runs.push({ ax: ax + ux * s0, az: az + uz * s0, bx: ax + ux * s1, bz: az + uz * s1 }); s0 = null; };
      for (let s = 0; s <= len; s += 0.5) {
        const x = ax + ux * s, z = az + uz * s;
        const free = !map.buildingAt(x + nx * 0.5, z + nz * 0.5) && !map.buildingAt(x - nx * 0.5, z - nz * 0.5) && !map.buildingAt(x, z) && !roadNear(x, z, 0.3);
        if (free) { if (s0 === null) s0 = s; } else flush(s - 0.5);
      }
      flush(len);
    }
    if (!runs.length) continue;
    // ---- the gate: on the run nearest a named street, where it comes closest to it
    let gate = null;
    for (const r of runs) {
      const L2 = Math.hypot(r.bx - r.ax, r.bz - r.az);
      if (L2 < 6) continue;
      for (let s = 2.5; s <= L2 - 2.5; s += 1) {
        const x = r.ax + (r.bx - r.ax) * s / L2, z = r.az + (r.bz - r.az) * s / L2;
        const q = map.nearestEdge(x, z, 40, (e) => e.drive && !!e.name);
        if (q && (!gate || q.d < gate.d)) gate = { r, s, x, z, d: q.d, qx: q.x, qz: q.z };
      }
    }
    for (const r of runs) {
      if (gate && r === gate.r) {
        const L2 = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / L2, uz = (r.bz - r.az) / L2;
        fence(r.ax, r.az, gate.x - ux * 1.8, gate.z - uz * 1.8);
        fence(gate.x + ux * 1.8, gate.z + uz * 1.8, r.bx, r.bz);
      } else fence(r.ax, r.az, r.bx, r.bz);
    }
    if (gate) {
      const r = gate.r, L2 = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / L2, uz = (r.bz - r.az) / L2;
      // inward: away from the street
      let nx = -uz, nz = ux;
      if ((gate.qx - gate.x) * nx + (gate.qz - gate.z) * nz > 0) { nx = -nx; nz = -nz; }
      const ry = Math.atan2(-uz, ux);
      for (const sd of [-1, 1]) {
        const px = gate.x + ux * sd * 1.95, pz = gate.z + uz * sd * 1.95;
        G.plinth.push(at(new THREE.BoxGeometry(0.42, 2.7, 0.42), px, 1.35, pz, ry));
        L.circle(px, pz, 0.3, 2.7);
        // the gate's leaves, open inwards
        const lx = gate.x + ux * sd * 1.75, lz = gate.z + uz * sd * 1.75;
        // (whichever way round swings the leaf's free end into the yard)
        const end = (a) => -sd * 1.6 * Math.cos(a) * nx + sd * 1.6 * Math.sin(a) * nz;
        const la = end(ry + 1.15) > end(ry - 1.15) ? ry + 1.15 : ry - 1.15;
        const p = new THREE.PlaneGeometry(1.6, 1.8), uv = p.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (1.6 / 1.2));
        p.translate(-sd * 0.8, 0, 0);
        G.bars.push(at(p, lx, 0.95, lz, la));
      }
      // the name over the gate
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.78), new THREE.MeshStandardMaterial({ map: signTexture(name, sub), roughness: 0.6, side: THREE.DoubleSide }));
      sg.position.set(gate.x, 3.05, gate.z); sg.rotation.y = Math.atan2(-nx, -nz); L.root.add(sg);
      G.posts.push(at(new THREE.BoxGeometry(4.6, 0.12, 0.12), gate.x, 2.62, gate.z, ry));
      // the three flags just inside
      ['es', 'ex', 'eu'].forEach((k, i) => {
        const fx = gate.x + nx * 2.6 + ux * (3.2 + i * 1.1), fz = gate.z + nz * 2.6 + uz * (3.2 + i * 1.1);
        G.pole.push(at(new THREE.CylinderGeometry(0.045, 0.055, 6.5, 8), fx, 3.25, fz));
        L.circle(fx, fz, 0.1, 6.5);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.73), new THREE.MeshStandardMaterial({ map: canvasTex(flagCanvas(k)), side: THREE.DoubleSide, roughness: 0.8 }));
        fl.position.set(fx + ux * 0.58, 6.05, fz + uz * 0.58); fl.rotation.y = ry; L.root.add(fl);
      });
      L.poi['colegio:' + name] = { x: gate.x, z: gate.z };
    }
    // ---- the court, where the yard has room for one (along the ground's longest side)
    let best = null, lx = 1, lz = 0, lmax = 0;
    for (let i = 0, n = ring.length; i < n; i += 2) { const j = (i + 2) % n, dx = ring[j] - ring[i], dz = ring[j + 1] - ring[i + 1], l = Math.hypot(dx, dz); if (l > lmax) { lmax = l; lx = dx / l; lz = dz / l; } }
    const sizes = area > 5000 ? [[32, 17], [24, 13]] : area > 1400 ? [[24, 13], [18, 10]] : [];
    for (const [CL, CW] of sizes) {
      if (best) break;
      for (let rad = 0; rad < 90 && !best; rad += 4) for (let k = 0; k < Math.max(1, Math.round(rad * 1.6)) && !best; k++) {
        const t = (k / Math.max(1, Math.round(rad * 1.6))) * Math.PI * 2, x0 = cx + Math.cos(t) * rad, z0 = cz + Math.sin(t) * rad;
        let ok = true;
        for (let u = -CL / 2 - 1.5; u <= CL / 2 + 1.5 && ok; u += 2.5) for (let v = -CW / 2 - 1.5; v <= CW / 2 + 1.5 && ok; v += 2.5) {
          const x = x0 + lx * u - lz * v, z = z0 + lz * u + lx * v;
          if (!pointInRing(x, z, ring) || map.buildingAt(x, z) || roadNear(x, z, 0.5)) ok = false;
        }
        if (ok) best = { x: x0, z: z0, L: CL, W: CW };
      }
    }
    if (best) {
      const ry = Math.atan2(-lz, lx);
      const cm = new THREE.Mesh(new THREE.PlaneGeometry(best.L, best.W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: courtTexture(best.L, best.W), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
      cm.position.set(best.x, 0.03, best.z); cm.rotation.y = ry; cm.receiveShadow = true; L.root.add(cm);
      for (const e of [-1, 1]) {
        // a goal at each end
        const gx = best.x + lx * e * (best.L / 2 - 1), gz = best.z + lz * e * (best.L / 2 - 1);
        for (const s of [-1, 1]) { const px = gx - lz * s * 1.5, pz = gz + lx * s * 1.5; G.white.push(at(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), px, 1.0, pz)); L.circle(px, pz, 0.08, 2); }
        G.white.push(at(new THREE.BoxGeometry(0.08, 0.08, 3.06), gx, 2.0, gz, ry));
        // a basket behind it
        const hx = best.x + lx * e * (best.L / 2 + 0.6), hz = best.z + lz * e * (best.L / 2 + 0.6);
        G.pole.push(at(new THREE.CylinderGeometry(0.07, 0.08, 3.3, 8), hx, 1.65, hz)); L.circle(hx, hz, 0.12, 3.3);
        G.white.push(at(new THREE.BoxGeometry(0.05, 1.05, 1.8), hx - lx * e * 0.25, 3.35, hz - lz * e * 0.25, ry));
        const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0601a, roughness: 0.5 }));
        ringM.position.set(hx - lx * e * 0.52, 3.05, hz - lz * e * 0.52); L.root.add(ringM);
      }
    }
    out.push({ name, area: Math.round(area), runs: runs.length, gate: !!gate, court: best ? `${best.L}×${best.W}` : null });
  }
  for (const [k, list] of Object.entries(G)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list, false), M[k]);
    m.castShadow = k !== 'bars'; m.receiveShadow = true;
    L.root.add(m);
  }
  L.schools = out;
  return out;
}
