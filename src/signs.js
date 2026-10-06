// Vertical traffic signs as they are in Spain (Norma 8.1-IC, urban sizes: triangles 70 cm, discs, octagons and squares
// 60 cm): shaped plates with a folded rim on galvanised Ø60 mm posts, the lower edge at 2.2 m, grey backs with clamps,
// faces drawn at high resolution. Placed from OSM and the street network: STOP and give way on junction approaches,
// pedestrian crossings, no entry at the end of one-way streets, no parking in narrow streets, school warnings with a
// 30 limit, the bus stop, the town entry/exit boards (S-500 / S-510) with the 50 limit, and the reservoir boards.
// Where the pavement is too narrow the sign hangs from the facade on a bracket. About a third are worn: faded,
// stickered, rusty, tagged, leaning or twisted on the post.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash1, polySample } from './util.js';

const CELL = 256, COLS = 8, ROWS = 8;
const RED = '#c4151c', BLUE = '#0b4ea2', WHITE = '#f7f7f4', BLACK = '#111111', BROWN = '#6b3d1e';

// ---------------------------------------------------------------- shapes (normalised to the cell: x,y in -0.5..0.5)
const TRI_UP = [[0, 0.44], [0.5, -0.43], [-0.5, -0.43]];        // equilateral-ish, point up
const TRI_DOWN = [[-0.5, 0.43], [0.5, 0.43], [0, -0.44]];       // give way
const OCT = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; const r = 0.5 / Math.cos(Math.PI / 8); return [Math.cos(a) * r, Math.sin(a) * r]; });
function roundRect(w, h, r, n = 4) {
  const pts = [];
  const cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of cs) for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
const CIRCLE = Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return [Math.cos(a) * 0.5, Math.sin(a) * 0.5]; });
const SQUARE = roundRect(1, 1, 0.06);
const RECT3 = roundRect(1, 1 / 3, 0.02);   // 3:1 boards (in a 2x1-cell slot, normalised to its width)

// ---------------------------------------------------------------- faces
function path(ctx, pts, s, ox, oy) { ctx.beginPath(); pts.forEach(([x, y], i) => { const X = ox + (x + 0.5) * s, Y = oy + (0.5 - y) * s; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); }
function inset(pts, k) { return pts.map(([x, y]) => [x * k, y * k]); }
function walker(ctx, x, y, s, col = BLACK) {
  // pedestrian pictogram, walking right; (x, y) = feet centre, s = height
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(4, -88, 10, 0, 7); ctx.fill();
  ctx.lineWidth = 15;
  ctx.beginPath(); ctx.moveTo(2, -72); ctx.lineTo(-2, -38); ctx.stroke();                  // torso
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(18, -50); ctx.lineTo(24, -34); ctx.stroke(); // front arm
  ctx.beginPath(); ctx.moveTo(-1, -64); ctx.lineTo(-16, -48); ctx.lineTo(-22, -36); ctx.stroke(); // back arm
  ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(-2, -40); ctx.lineTo(14, -20); ctx.lineTo(20, 0); ctx.stroke();   // front leg
  ctx.beginPath(); ctx.moveTo(-2, -40); ctx.lineTo(-14, -18); ctx.lineTo(-28, -4); ctx.stroke(); // back leg
  ctx.restore();
}
const FACES = {
  stop(ctx, s) {
    path(ctx, OCT, s, 0, 0); ctx.fillStyle = WHITE; ctx.fill();
    path(ctx, inset(OCT, 0.93), s, 0, 0); ctx.fillStyle = RED; ctx.fill();
    ctx.fillStyle = WHITE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${s * 0.3}px Arial, Helvetica, sans-serif`;
    ctx.save(); ctx.translate(s / 2, s * 0.52); ctx.scale(0.86, 1); ctx.fillText('STOP', 0, 0); ctx.restore();
  },
  ceda(ctx, s) {
    path(ctx, TRI_DOWN, s, 0, 0); ctx.fillStyle = RED; ctx.fill();
    path(ctx, [[-0.3, 0.315], [0.3, 0.315], [0, -0.215]], s, 0, 0); ctx.fillStyle = WHITE; ctx.fill();
  },
  prohibido(ctx, s) {
    path(ctx, CIRCLE, s, 0, 0); ctx.fillStyle = RED; ctx.fill();
    ctx.fillStyle = WHITE; ctx.fillRect(s * 0.17, s * 0.42, s * 0.66, s * 0.16);
  },
  v50(ctx, s) { speed(ctx, s, '50'); },
  v30(ctx, s) { speed(ctx, s, '30'); },
  noAparcar(ctx, s) {
    path(ctx, CIRCLE, s, 0, 0); ctx.fillStyle = RED; ctx.fill();
    path(ctx, inset(CIRCLE, 0.78), s, 0, 0); ctx.fillStyle = BLUE; ctx.fill();
    ctx.save(); path(ctx, inset(CIRCLE, 0.78), s, 0, 0); ctx.clip();
    ctx.strokeStyle = RED; ctx.lineWidth = s * 0.11; ctx.beginPath(); ctx.moveTo(s * 0.18, s * 0.18); ctx.lineTo(s * 0.82, s * 0.82); ctx.stroke(); ctx.restore();
  },
  noParar(ctx, s) {
    FACES.noAparcar(ctx, s);
    ctx.save(); path(ctx, inset(CIRCLE, 0.78), s, 0, 0); ctx.clip();
    ctx.strokeStyle = RED; ctx.lineWidth = s * 0.11; ctx.beginPath(); ctx.moveTo(s * 0.82, s * 0.18); ctx.lineTo(s * 0.18, s * 0.82); ctx.stroke(); ctx.restore();
  },
  paso(ctx, s) { // S-13: pedestrian crossing
    path(ctx, SQUARE, s, 0, 0); ctx.fillStyle = BLUE; ctx.fill();
    path(ctx, [[0, 0.4], [0.4, -0.33], [-0.4, -0.33]], s, 0, 0); ctx.fillStyle = WHITE; ctx.fill();
    ctx.fillStyle = BLACK;
    for (let i = 0; i < 5; i++) ctx.fillRect(s * (0.22 + i * 0.12), s * 0.72, s * 0.07, s * 0.07);
    walker(ctx, s * 0.5, s * 0.71, s * 0.42);
  },
  pelPaso(ctx, s) { warn(ctx, s); walker(ctx, s * 0.5, s * 0.78, s * 0.4); ctx.fillStyle = BLACK; for (let i = 0; i < 4; i++) ctx.fillRect(s * (0.31 + i * 0.1), s * 0.8, s * 0.06, s * 0.05); },
  ninos(ctx, s) { warn(ctx, s); walker(ctx, s * 0.43, s * 0.8, s * 0.38); walker(ctx, s * 0.6, s * 0.8, s * 0.28); },
  resalto(ctx, s) {
    warn(ctx, s); ctx.fillStyle = BLACK;
    ctx.fillRect(s * 0.26, s * 0.74, s * 0.48, s * 0.04);
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.74, s * 0.12, s * 0.09, 0, Math.PI, 0); ctx.fill();
  },
  bus(ctx, s) { // S-19: bus stop
    path(ctx, SQUARE, s, 0, 0); ctx.fillStyle = BLUE; ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.beginPath(); ctx.roundRect(s * 0.2, s * 0.3, s * 0.6, s * 0.36, s * 0.05); ctx.fill();
    ctx.fillStyle = BLUE; for (let i = 0; i < 4; i++) ctx.fillRect(s * (0.24 + i * 0.13), s * 0.35, s * 0.1, s * 0.12);
    ctx.fillStyle = WHITE; for (const x of [0.32, 0.68]) { ctx.beginPath(); ctx.arc(s * x, s * 0.68, s * 0.05, 0, 7); ctx.fill(); }
    ctx.font = `bold ${s * 0.12}px Arial`; ctx.textAlign = 'center'; ctx.fillText('BUS', s * 0.5, s * 0.87);
  },
  sentido(ctx, s) { // R-400a: ahead only
    path(ctx, CIRCLE, s, 0, 0); ctx.fillStyle = BLUE; ctx.fill();
    ctx.fillStyle = WHITE; path(ctx, [[0, 0.36], [0.2, 0.08], [0.07, 0.08], [0.07, -0.36], [-0.07, -0.36], [-0.07, 0.08], [-0.2, 0.08]], s, 0, 0); ctx.fill();
  },
  // 3:1 boards (drawn in a 2x1-cell slot: w = 2s, h = s)
  entrada(ctx, s) { board(ctx, s, WHITE, BLACK, BLACK, 'GUAREÑA'); },
  salida(ctx, s) {
    board(ctx, s, WHITE, BLACK, BLACK, 'GUAREÑA');
    ctx.save(); path(ctx, RECT3, s * 2, 0, -s / 2); ctx.clip();
    ctx.strokeStyle = RED; ctx.lineWidth = s * 0.075; ctx.beginPath(); ctx.moveTo(s * 0.12, s * 0.8); ctx.lineTo(s * 1.88, s * 0.2); ctx.stroke(); ctx.restore();
  },
  turismo(ctx, s) { board(ctx, s, BROWN, WHITE, WHITE, 'PANTANO DE SAN ROQUE', 0.15); },
  bano(ctx, s) { board(ctx, s, WHITE, RED, RED, 'PROHIBIDO BAÑARSE', 0.16); },
};
function speed(ctx, s, n) {
  path(ctx, CIRCLE, s, 0, 0); ctx.fillStyle = RED; ctx.fill();
  path(ctx, inset(CIRCLE, 0.8), s, 0, 0); ctx.fillStyle = WHITE; ctx.fill();
  ctx.fillStyle = BLACK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${s * 0.4}px Arial, Helvetica, sans-serif`;
  ctx.save(); ctx.translate(s / 2, s * 0.53); ctx.scale(0.82, 1); ctx.fillText(n, 0, 0); ctx.restore();
}
function warn(ctx, s) {
  path(ctx, TRI_UP, s, 0, 0); ctx.fillStyle = RED; ctx.fill();
  path(ctx, [[0, 0.3], [0.345, -0.33], [-0.345, -0.33]], s, 0, 0); ctx.fillStyle = WHITE; ctx.fill();
}
function board(ctx, s, bg, border, fg, txt, fs = 0.2) {
  path(ctx, RECT3, s * 2, 0, -s / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = s * 0.03; ctx.strokeStyle = border;
  path(ctx, inset(RECT3, 0.955), s * 2, 0, -s / 2); ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${s * fs}px Arial, Helvetica, sans-serif`;
  const w = ctx.measureText(txt).width, max = s * 1.8;
  ctx.save(); ctx.translate(s, s * 0.51); if (w > max) ctx.scale(max / w, 1); ctx.fillText(txt, 0, 0); ctx.restore();
}
const SHAPE_OF = {
  stop: OCT, ceda: TRI_DOWN, prohibido: CIRCLE, v50: CIRCLE, v30: CIRCLE, noAparcar: CIRCLE, noParar: CIRCLE, paso: SQUARE,
  pelPaso: TRI_UP, ninos: TRI_UP, resalto: TRI_UP, bus: SQUARE, sentido: CIRCLE, entrada: RECT3, salida: RECT3, turismo: RECT3, bano: RECT3,
};
const WIDE = { entrada: 1, salida: 1, turismo: 1, bano: 1 };
// physical size (m): width of the plate
const SIZE = { stop: 0.6, ceda: 0.7, prohibido: 0.6, v50: 0.6, v30: 0.6, noAparcar: 0.6, noParar: 0.6, paso: 0.6, pelPaso: 0.7, ninos: 0.7, resalto: 0.7, bus: 0.6, sentido: 0.6, entrada: 1.5, salida: 1.5, turismo: 1.5, bano: 1.2 };

// wear painted over a face: sun fade, stickers, rust bleeding from the edges, grime streaks, a tag
function wear(ctx, x0, y0, w, h, rnd, kind) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  // sun: reds go pink, blues go pale
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(${120 + rnd() * 40},${70 + rnd() * 30},${70 + rnd() * 30},${0.25 + rnd() * 0.25})`;
  ctx.fillRect(x0, y0, w, h);
  ctx.globalCompositeOperation = 'multiply';
  // grime streaks running down from the top edge
  for (let i = 0; i < 14; i++) {
    const x = x0 + rnd() * w, len = h * (0.2 + rnd() * 0.7);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(90,80,70,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, 2 + rnd() * 5, len);
  }
  // rust spots near the rim
  if (kind >= 1) for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2, r = w * (0.36 + rnd() * 0.12);
    const x = x0 + w / 2 + Math.cos(a) * r, y = y0 + h / 2 + Math.sin(a) * r * (h / w);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 6 + rnd() * 16);
    rg.addColorStop(0, 'rgba(120,55,20,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // stickers (a band's gig, a phone number, a political one)
  const ns = kind === 0 ? 1 + Math.floor(rnd() * 3) : Math.floor(rnd() * 2);
  for (let i = 0; i < ns; i++) {
    const sw = w * (0.1 + rnd() * 0.12), sh = sw * (0.4 + rnd() * 0.8);
    const x = x0 + w * (0.15 + rnd() * 0.6), y = y0 + h * (0.2 + rnd() * 0.6);
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.6);
    ctx.fillStyle = ['#f4f1e4', '#ffd400', '#e8e8e8', '#63b33d', '#ff5a36'][Math.floor(rnd() * 5)];
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.fillStyle = 'rgba(20,20,20,0.8)';
    for (let k = 0; k < 3; k++) ctx.fillRect(-sw * 0.4, -sh * 0.3 + k * sh * 0.25, sw * (0.4 + rnd() * 0.4), sh * 0.1);
    ctx.restore();
  }
  // a tag
  if (kind === 2) {
    ctx.strokeStyle = ['#111', '#1c3fbf', '#d11', '#111'][Math.floor(rnd() * 4)];
    ctx.lineWidth = 3 + rnd() * 3; ctx.lineCap = 'round';
    ctx.beginPath();
    let x = x0 + w * 0.2, y = y0 + h * (0.45 + rnd() * 0.2);
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) { const nx = x + w * (0.06 + rnd() * 0.07), ny = y0 + h * (0.35 + rnd() * 0.35); ctx.quadraticCurveTo((x + nx) / 2, y - h * 0.2 + rnd() * h * 0.4, nx, ny); x = nx; y = ny; }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- atlas
export function signFaceAtlas() {
  const c = document.createElement('canvas'); c.width = CELL * COLS; c.height = CELL * ROWS;
  const ctx = c.getContext('2d');
  const cells = {}; // name → [variant] → {u0, v0, u1, v1}
  let slot = 0;
  const rnd = mulberry32(8123);
  const place = (name, variant, wide) => {
    // wide boards take two cells in the same row
    if (wide && slot % COLS === COLS - 1) slot++;
    const cx = slot % COLS, cy = Math.floor(slot / COLS);
    slot += wide ? 2 : 1;
    const x0 = cx * CELL, y0 = cy * CELL, w = CELL * (wide ? 2 : 1);
    ctx.save(); ctx.translate(x0, y0 + (wide ? 0 : 0));
    ctx.beginPath(); ctx.rect(0, 0, w, CELL); ctx.clip();
    FACES[name](ctx, CELL);
    ctx.restore();
    if (variant > 0) wear(ctx, x0, y0, w, CELL, rnd, variant - 1);
    (cells[name] || (cells[name] = []))[variant] = { u0: x0 / c.width, v0: 1 - (y0 + CELL) / c.height, u1: (x0 + w) / c.width, v1: 1 - y0 / c.height, wide: !!wide };
  };
  for (const name of Object.keys(FACES)) {
    const n = ['stop', 'ceda', 'paso', 'noAparcar', 'prohibido', 'v50'].includes(name) ? 3 : 2;
    for (let v = 0; v < n; v++) place(name, v, WIDE[name]);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, cells, canvas: c };
}

// ---------------------------------------------------------------- geometry
const _m = new THREE.Matrix4();
function faceGeo(name, cell) {
  // front face in metres (x right, y up), uv into the atlas cell
  const pts = SHAPE_OF[name], S = SIZE[name];
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
  const g = new THREE.ShapeGeometry(sh);
  const p = g.attributes.position, uv = g.attributes.uv;
  const wide = WIDE[name];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / S, y = p.getY(i) / S;
    // wide slots are 2:1; the 3:1 board sits centred vertically in them
    const u = x + 0.5, v = wide ? y * 2 + 0.5 : y + 0.5;
    uv.setXY(i, cell.u0 + u * (cell.u1 - cell.u0), cell.v0 + v * (cell.v1 - cell.v0));
  }
  return g;
}
function plateGeo(name) {
  const pts = SHAPE_OF[name], S = SIZE[name];
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 2 });
  g.translate(0, 0, -0.011);
  return g;
}
function plateHeight(name) { const pts = SHAPE_OF[name], S = SIZE[name]; let a = Infinity, b = -Infinity; for (const [, y] of pts) { a = Math.min(a, y); b = Math.max(b, y); } return { bottom: a * S, top: b * S }; }

// ---------------------------------------------------------------- builder
export function buildTrafficSigns(world, map) {
  const atlas = signFaceAtlas();
  const faceMat = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.42, metalness: 0, emissive: 0xffffff, emissiveMap: atlas.tex, emissiveIntensity: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.42, metalness: 0.65 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  const faces = [], metals = [], caps = [];
  const rnd = mulberry32(4411);
  const col = map.collider;
  const tmp = {};
  const placed = [];
  const lampNear = (x, z, r) => { const L = world.lampPoints; for (let i = 0; i < L.length; i += 3) if (Math.abs(L[i] - x) < r && Math.abs(L[i + 2] - z) < r) return true; return false; };
  const taken = (x, z, r = 1.1) => placed.some(([a, b]) => Math.hypot(a - x, b - z) < r);
  const MAJOR = new Set(['stop', 'ceda', 'prohibido', 'paso', 'entrada', 'salida', 'glorieta', 'v30', 'v50', 'ninos']);
  const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  // where drivers must stop / give way (edge id : junction node) — the traffic AI obeys these
  map.stops = map.stops || new Map();
  const runsNear = (px, pz, r) => world.facadeRuns.filter((w) => Math.min(Math.hypot(w.ax - px, w.az - pz), Math.hypot(w.bx - px, w.bz - pz), segDist(w, px, pz)) < r);
  const segDist = (w, px, pz) => { const dx = w.bx - w.ax, dz = w.bz - w.az, L2 = dx * dx + dz * dz || 1; let t = ((px - w.ax) * dx + (pz - w.az) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(w.ax + dx * t - px, w.az + dz * t - pz); };

  // one post (or wall bracket) carrying a stack of plates. faceAng: the direction the faces look (towards the drivers)
  function post(x, z, faceAng, plates, opts = {}) {
    if (map.buildingAt(x, z) || taken(x, z)) return false;
    // no forest of posts at a corner: minor signs keep 7 m away from any other; an approach gets one sign
    const minor = !plates.some((p) => MAJOR.has(p));
    const near = (world.signList || []).filter((s) => Math.hypot(s.x - x, s.z - z) < (minor ? 7 : 3.2));
    if (minor && near.length) return false;
    if (near.some((s) => Math.abs(angDiff(s.a, faceAng)) < 1.0) || near.length >= 2) return false;
    placed.push([x, z]);
    (world.signList || (world.signList = [])).push({ x, z, a: faceAng, plates, wall: !!opts.wall });
    const worn = opts.worn ?? rnd() < 0.3;
    const lean = !opts.wall && rnd() < 0.12 ? (rnd() - 0.5) * 0.28 : 0, leanDir = rnd() * Math.PI * 2;
    const twist = rnd() < 0.1 ? (rnd() - 0.5) * 0.6 : 0;
    // plates from the top down; the lowest edge at 2.2 m
    let y = opts.bottom ?? 2.2;
    const stack = [];
    for (let i = plates.length - 1; i >= 0; i--) {
      const hgt = plateHeight(plates[i]);
      const cy = y - hgt.bottom;
      stack.push({ name: plates[i], cy });
      y = cy + hgt.top + 0.05;
    }
    const top = y - 0.02;
    const G = new THREE.Group();
    // post (or bracket from the wall)
    if (opts.wall) {
      const w = opts.wall; // {nx, nz} wall normal; the plate stands out from the wall
      const arm = new THREE.BoxGeometry(0.04, 0.04, opts.armLen || 0.45); arm.translate(0, 0, (opts.armLen || 0.45) / 2);
      for (const s of stack) { const a = arm.clone(); a.translate(0, s.cy + 0.18, 0); const b = arm.clone(); b.translate(0, s.cy - 0.18, 0); metals.push(bake(a, x, z, Math.atan2(w.nx, w.nz), 0, 0, 0), bake(b, x, z, Math.atan2(w.nx, w.nz), 0, 0, 0)); }
      const plate = new THREE.BoxGeometry(0.12, 0.5, 0.02); plate.translate(0, stack[0].cy, 0.01);
      metals.push(bake(plate, x, z, Math.atan2(w.nx, w.nz), 0, 0, 0));
      x += w.nx * (opts.armLen || 0.45); z += w.nz * (opts.armLen || 0.45);
    } else {
      const pg = new THREE.CylinderGeometry(0.03, 0.03, top, 10); pg.translate(0, top / 2, 0);
      metals.push(bake(pg, x, z, 0, lean, leanDir, 0));
      const cg = new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10); cg.translate(0, top + 0.012, 0);
      caps.push(bake(cg, x, z, 0, lean, leanDir, 0));
      col.addCircle(x, z, 0.06, 2.4, -7);
    }
    for (const s of stack) {
      const variant = worn ? 1 + Math.floor(rnd() * ((atlas.cells[s.name].length || 1) - 1)) : 0;
      const cell = atlas.cells[s.name][Math.min(variant, atlas.cells[s.name].length - 1)];
      const off = opts.wall ? 0 : 0.045; // plate in front of the post
      const f = faceGeo(s.name, cell); f.translate(0, s.cy, off);
      faces.push(bake(f, x, z, faceAng + twist, lean, leanDir, 0));
      const b = plateGeo(s.name); b.translate(0, s.cy, off);
      metals.push(bake(b, x, z, faceAng + twist, lean, leanDir, 0));
      if (!opts.wall) for (const dy of [-0.14, 0.14]) {
        // clamp (abrazadera) round the post
        const cl = new THREE.BoxGeometry(0.1, 0.035, 0.05); cl.translate(0, s.cy + dy * (SIZE[s.name] / 0.6), off * 0.5 - 0.005);
        metals.push(bake(cl, x, z, faceAng + twist, lean, leanDir, 0));
      }
      // double-sided town boards: the exit board on the back of the entry one
      if (opts.back && s.name === 'entrada') {
        const bc = atlas.cells.salida[worn ? 1 : 0];
        const bf = faceGeo('salida', bc); bf.rotateY(Math.PI); bf.translate(0, s.cy, off - 0.022);
        faces.push(bake(bf, x, z, faceAng + twist, lean, leanDir, 0));
      }
    }
    return true;
  }
  // rotate about the post base: yaw, then lean
  function bake(g, x, z, yaw, lean, leanDir) {
    g.rotateY(yaw);
    if (lean) { const ax = new THREE.Vector3(Math.cos(leanDir), 0, Math.sin(leanDir)); g.applyMatrix4(_m.makeRotationAxis(ax, lean)); }
    g.translate(x, 0, z);
    return g.index ? g.toNonIndexed() : g;
  }
  // a sign on the right-hand side of a road, facing drivers travelling (fx, fz) at point (px, pz)
  function roadside(e, px, pz, fx, fz, plates, opts = {}) {
    const rx = -fz, rz = fx; // driver's right
    const hw = e.w / 2;
    // a facade close to the kerb: hang it from the wall instead
    const kerbX = px + rx * (hw + 0.3), kerbZ = pz + rz * (hw + 0.3);
    const walls = runsNear(kerbX, kerbZ, 1.8).filter((w) => w.nx * -rx + w.nz * -rz > 0.7);
    if (!opts.noWall && walls.length && (e.sw || 0) < 1.2) {
      const w = walls[0];
      const dx = w.bx - w.ax, dz = w.bz - w.az, L2 = dx * dx + dz * dz;
      const t = Math.max(0.05, Math.min(0.95, ((kerbX - w.ax) * dx + (kerbZ - w.az) * dz) / L2));
      const wx = w.ax + dx * t + w.nx * 0.01, wz = w.az + dz * t + w.nz * 0.01;
      return post(wx, wz, Math.atan2(-fx, -fz), plates, { ...opts, wall: w, armLen: 0.42, bottom: 2.3 });
    }
    const d = hw + (e.sw > 0 ? 0.68 : 0.55);
    let x = px + rx * d, z = pz + rz * d;
    // near a junction the kerb spot can fall on the crossing street (or this one past a bend): step back along the
    // approach until the post stands clear of every carriageway
    for (let k = 0; k < 10 && map.roadAt(x, z, 0.3); k++) { x -= fx * 1.5; z -= fz * 1.5; }
    if (map.roadAt(x, z, 0.3) || lampNear(x, z, 0.8)) return false;
    return post(x, z, Math.atan2(-fx, -fz), plates, opts);
  }
  const sampleDir = (e, s) => { polySample(e.pts, e.cum, s, tmp); return { x: tmp.x, z: tmp.z, dx: tmp.dx, dz: tmp.dz }; };

  // --- STOP / give way from OSM, and on minor roads meeting a main road
  const osmYield = [];
  for (const p of map.pois) {
    if (p.kind !== 'highway:stop' && p.kind !== 'highway:give_way') continue;
    const q = map.nearestEdge(p.x, p.z, 10, (e) => e.drive);
    if (!q) continue;
    const e = q.edge, d = map.sample(e, q.s, tmp);
    const na = map.nodes[e.a], nb = map.nodes[e.b];
    const toB = Math.hypot(nb.x - q.x, nb.z - q.z) < Math.hypot(na.x - q.x, na.z - q.z);
    const fx = toB ? d.dx : -d.dx, fz = toB ? d.dz : -d.dz;
    const kind = p.kind === 'highway:stop' ? 'stop' : 'ceda';
    if (roadside(e, q.x, q.z, fx, fz, [kind], { noWall: false })) osmYield.push([q.x, q.z]);
    map.stops.set(e.id + ':' + (toB ? e.b : e.a), kind); // obeyed even when the plate itself could not be placed
  }
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 1, living_street: 0, service: 0 };
  for (const n of map.nodes) {
    if (n.degree < 3 || !map.inTown(n.x, n.z)) continue;
    const es = n.edges.map((id) => map.edges[id]).filter((e) => e.drive && !e.dirt);
    if (es.length < 3) continue;
    const top = Math.max(...es.map((e) => RANK[e.cls] ?? 1));
    for (const e of es) {
      const rk = RANK[e.cls] ?? 1;
      if (rk >= top || top < 2 || e.len < 12) continue;
      if (e.oneway && ((e.a === n.id && e.oneway === 1) || (e.b === n.id && e.oneway === -1))) continue; // traffic leaves the junction here
      const fromA = e.b === n.id; // approaching the node along the edge
      const s = fromA ? Math.max(1, e.len - n.radius - 2.2) : Math.min(e.len - 1, n.radius + 2.2);
      const d = sampleDir(e, s);
      const fx = fromA ? d.dx : -d.dx, fz = fromA ? d.dz : -d.dz;
      if (osmYield.some(([a, b]) => Math.hypot(a - d.x, b - d.z) < 18)) continue;
      const kind = hash1(e.id * 3 + n.id) < 0.22 ? 'stop' : 'ceda';
      roadside(e, d.x, d.z, fx, fz, [kind]);
      map.stops.set(e.id + ':' + n.id, kind);
    }
  }
  // --- pedestrian crossings: S-13 on both sides, facing each direction; a warning ahead on main roads
  for (const p of map.pois) {
    if (p.kind !== 'highway:crossing') continue;
    const q = map.nearestEdge(p.x, p.z, 8, (e) => e.drive);
    if (!q) continue;
    const e = q.edge, d = map.sample(e, q.s, tmp);
    const dx = d.dx, dz = d.dz;
    const extra = rnd() < 0.25 ? ['noAparcar'] : [];
    roadside(e, q.x, q.z, dx, dz, ['paso', ...extra]);
    if (!e.oneway) roadside(e, q.x, q.z, -dx, -dz, ['paso']);
    if (RANK[e.cls] >= 3) {
      for (const dir of [1, -1]) {
        const s = q.s - dir * 45;
        if (s < 5 || s > e.len - 5) continue;
        const w = sampleDir(e, s);
        roadside(e, w.x, w.z, dx * dir, dz * dir, ['pelPaso'], { noWall: true });
      }
    }
  }
  // --- one-way streets: no entry at the far end
  for (const e of map.edges) {
    if (!e.drive || !e.oneway || e.len < 25 || !map.inTown(e.pts[0], e.pts[1])) continue;
    const fwd = e.oneway === 1;
    const sExit = fwd ? e.len - 3 : 3, dir = fwd ? 1 : -1;
    const d = sampleDir(e, sExit);
    // drivers who would enter against the flow travel -dir: the board faces +dir
    roadside(e, d.x, d.z, -d.dx * dir, -d.dz * dir, ['prohibido']);
  }
  // --- no parking along some narrow streets (every ~70 m, one side), often hung from the wall
  for (const e of map.edges) {
    if (!e.drive || e.dirt || e.w > 6.6 || e.len < 40 || !map.inTown(e.pts[0], e.pts[1]) || hash1(e.id * 11) > 0.35) continue;
    for (let s = 18; s < e.len - 12; s += 70) {
      const d = sampleDir(e, s);
      roadside(e, d.x, d.z, d.dx, d.dz, [hash1(e.id + s) < 0.3 ? 'noParar' : 'noAparcar']);
    }
  }
  // --- schools: children crossing, a speed bump and the 30 limit on the approaches
  for (const p of map.pois) {
    if (p.kind !== 'amenity:school') continue;
    const q = map.nearestEdge(p.x, p.z, 60, (e) => e.drive && !e.dirt);
    if (!q) continue;
    const e = q.edge;
    for (const dir of [1, -1]) {
      const s = q.s - dir * 35;
      if (s < 4 || s > e.len - 4) continue;
      const d = sampleDir(e, s);
      roadside(e, d.x, d.z, d.dx * dir, d.dz * dir, ['ninos', 'v30']);
    }
  }
  // --- bus station: bus stop sign
  for (const p of map.pois) {
    if (p.kind !== 'amenity:bus_station') continue;
    const q = map.nearestEdge(p.x, p.z, 40, (e) => e.drive && !e.dirt);
    if (!q) continue;
    const d = map.sample(q.edge, q.s, tmp);
    roadside(q.edge, q.x, q.z, d.dx, d.dz, ['bus'], { noWall: true });
  }
  // --- town entry boards (S-500, exit S-510 on the back) and the 50 limit, on the main roads at the town edge
  const done = [];
  for (const e of map.edges) {
    if (!e.drive || !['primary', 'tertiary', 'secondary', 'unclassified'].includes(e.cls)) continue;
    const aIn = map.inTown(e.pts[0], e.pts[1]);
    const nn = e.pts.length / 2;
    const bIn = map.inTown(e.pts[nn * 2 - 2], e.pts[nn * 2 - 1]);
    if (aIn === bIn) continue;
    let s0 = 0, s1 = e.len;
    for (let it = 0; it < 18; it++) { const sm = (s0 + s1) / 2; const pp = map.sample(e, sm, {}); if (map.inTown(pp.x, pp.z) === aIn) s0 = sm; else s1 = sm; }
    const s = aIn ? Math.min(e.len, s0 + 6) : Math.max(0, s0 - 6);
    const pp = map.sample(e, s, {});
    if (done.some(([x, z]) => Math.hypot(x - pp.x, z - pp.z) < 120)) continue;
    done.push([pp.x, pp.z]);
    const dirIn = aIn ? -1 : 1;
    const fx = pp.dx * dirIn, fz = pp.dz * dirIn;
    roadside(e, pp.x, pp.z, fx, fz, ['entrada'], { noWall: true, back: true, bottom: 1.6, worn: rnd() < 0.2 });
    const s2 = aIn ? Math.min(e.len - 2, s + 22) : Math.max(2, s - 22);
    const p2 = map.sample(e, s2, {});
    roadside(e, p2.x, p2.z, fx, fz, ['v50'], { noWall: true });
  }
  // --- the reservoir: no swimming at the jetty and the dam, brown tourist board on the way in
  const R = world.reservoir;
  if (R && R.jetty) {
    const J = R.jetty;
    post(J.x - J.nx * 3.5 + J.tx * 2.2, J.z - J.nz * 3.5 + J.tz * 2.2, Math.atan2(-J.nx, -J.nz), ['bano'], { bottom: 1.2, worn: rnd() < 0.5 });
    const D = R.dam;
    post(D.mx + D.nx * 32 + D.ux * 8, D.mz + D.nz * 32 + D.uz * 8, Math.atan2(D.nx, D.nz), ['bano'], { bottom: 1.2, worn: true });
    const q = map.nearestEdge(R.center[0], R.center[1], 500, (e) => e.drive);
    if (q) { const d = map.sample(q.edge, q.s, tmp); roadside(q.edge, q.x, q.z, d.dx, d.dz, ['turismo'], { noWall: true, bottom: 1.5 }); }
  }

  const group = new THREE.Group();
  const add = (list, mat, shadow) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list.map(strip)), mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); };
  add(faces, faceMat, false); add(metals, metal, true); add(caps, black, false);
  world.root.add(group);
  world.signCount = placed.length;
  return group;
}
function strip(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
