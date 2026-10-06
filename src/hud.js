// HUD: radar with the real street map of Guareña, GPS routes, blips, street names, money, clock, wanted stars,
// speedometer, mission text, subtitles, notifications, big banners and the full-screen map.
import { clamp, fmtMoney, lerp } from './util.js';

const PX = 0.66; // radar raster: pixels per metre

// the place name shown under the street: public places by their name; businesses (car parks of a shop, factories,
// firms) only by what they are — no real business names in the game
function districtName(a) {
  const n = a.name.replace(/\.$/, '').trim();
  if (/^Parque\/Terraza$/.test(n)) return null;
  if (a.kind === 'amenity:parking') return 'Aparcamiento';
  if (a.kind === 'man_made:works') return /cooperativa/i.test(n) ? 'Cooperativa del Campo' : 'Zona industrial';
  if (a.kind === 'landuse:military') return 'Cuartel de la Guardia Civil';
  return n;
}
export class Hud {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.map = game.map;
    this.moneyShown = 0;
    this.currentStreet = '';
    this.streetT = 0;
    this.blips = new Map(); // id -> {x,z,kind,label,color}
    this.route = null; this.routeT = 0; this.routeTarget = null;
    this.waypoint = null;
    this.notes = [];
    this.bannerT = 0;
    this.buildRaster();
    this.radar = ui.radar.getContext('2d');
    this.mapOpen = false;
    this.mapView = { x: -150, z: 0, s: 0.55 };
    this.bindMap();
  }

  // ------------------------------------------------------------ static raster of the map
  buildRaster() {
    const { x0, z0, x1, z1 } = this.map.bounds;
    const pad = 250;
    this.rx0 = x0 - pad; this.rz0 = z0 - pad;
    const W = Math.ceil((x1 - x0 + pad * 2) * PX), H = Math.ceil((z1 - z0 + pad * 2) * PX);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    this.drawMap(ctx, (x) => (x - this.rx0) * PX, (z) => (z - this.rz0) * PX, PX, W, H, true);
    this.raster = c;
  }

  drawMap(ctx, X, Z, s, W, H, radarStyle) {
    const map = this.map;
    ctx.fillStyle = radarStyle ? '#8d9a6c' : '#a7b07d';
    ctx.fillRect(0, 0, W, H);
    const poly = (r, fill) => {
      ctx.beginPath();
      ctx.moveTo(X(r[0]), Z(r[1]));
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(X(r[i]), Z(r[i + 1]));
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    };
    // fields patchwork
    const gd = this.game.world.groundData;
    const pcol = { rastrojo: '#b8a871', arado: '#9c8466', cultivo: '#6f8a4f', olivar: '#8a9366', hierbaseca: '#a39c6c', vina: '#7f8d56' };
    if (gd) for (const p of gd.parcels) poly(p.ring, pcol[p.type] || '#9aa070');
    const acol = {
      'landuse:residential': '#d9d2c4', 'landuse:industrial': '#c9c2cf', 'leisure:park': '#86b06a', 'leisure:pitch': '#6fa35a',
      'natural:water': '#5b9bd5', 'leisure:swimming_pool': '#62c3e8', 'landuse:forest': '#5f8a4a', 'landuse:cemetery': '#9fb09a',
      'amenity:parking': '#bdbab4', 'highway:pedestrian': '#efe6d2', 'place:square': '#efe6d2', 'amenity:marketplace': '#efe6d2',
      'landuse:orchard': '#8f9a62', 'landuse:military': '#b7b9a4', 'amenity:school': '#d8cdb8', 'landuse:grass': '#8ab36e', 'landuse:village_green': '#8ab36e',
    };
    const order = ['landuse:residential', 'landuse:industrial', 'landuse:orchard', 'landuse:forest', 'landuse:cemetery', 'landuse:military', 'amenity:school', 'leisure:park', 'landuse:grass', 'landuse:village_green', 'leisure:pitch', 'amenity:parking', 'highway:pedestrian', 'place:square', 'amenity:marketplace', 'natural:water', 'leisure:swimming_pool'];
    for (const k of order) for (const a of map.areas) if (a.kind === k) poly(a.ring, acol[k]);
    // streams
    ctx.strokeStyle = '#5b9bd5'; ctx.lineWidth = Math.max(1, 2.5 * s);
    for (const l of map.lines) if (l.kind.startsWith('water')) { ctx.beginPath(); for (let i = 0; i < l.pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(l.pts[i]), Z(l.pts[i + 1])); ctx.stroke(); }
    // roads: casing + fill
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const drawRoads = (casing) => {
      for (const e of map.edges) {
        const w = Math.max(casing ? 2.2 : 1.2, (e.w + (casing ? 2.2 : 0)) * s);
        let col;
        if (e.dirt || e.cls === 'track' || e.cls === 'path') col = casing ? '#8a7a5c' : '#c9b48a';
        else if (e.cls === 'footway' || e.cls === 'pedestrian') col = casing ? '#b8b0a0' : '#ece4d2';
        else if (e.cls === 'primary' || e.cls === 'primary_link') col = casing ? '#b88a3a' : '#f3c969';
        else if (e.cls === 'tertiary' || e.cls === 'secondary') col = casing ? '#9e9e96' : '#fbf3d8';
        else col = casing ? '#9a968c' : '#ffffff';
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(e.pts[i]), Z(e.pts[i + 1]));
        ctx.stroke();
      }
    };
    drawRoads(true); drawRoads(false);
    // buildings
    for (const b of map.buildings) {
      const fill = b.use === 1 || b.use === 2 ? '#a79f98' : b.use === 5 ? '#b99b85' : '#b8aea0';
      poly(b.ring, fill);
    }
    // landmarks highlight
    ctx.fillStyle = '#8a5a3c';
    for (const r of this.game.world.landmarks.claimed) poly(r, '#a0664a');
  }

  // the big map with a pad: left stick pans, RT/LT zoom, A marks the destination under the centre cross, Y clears it
  mapPad(input, dt) {
    const v = this.mapView, gp = input.gp;
    if (!gp) return;
    const ax = input.gpAxis(0), ay = input.gpAxis(1);
    const zi = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
    let moved = !this.padCross;
    this.padCross = true;
    if (ax || ay) { v.x += (ax * 420 * dt) / v.s; v.z += (ay * 420 * dt) / v.s; moved = true; }
    if (Math.abs(zi) > 0.05) { v.s = clamp(v.s * Math.exp(zi * dt * 2.2), 0.15, 4); moved = true; }
    if (input.gpPressed(0)) { this.waypoint = { x: v.x, z: v.z }; this.route = null; this.routeT = 0; this.game.audio.sfx('ui_click'); moved = true; }
    if (input.gpPressed(3) && this.waypoint) { this.waypoint = null; this.route = null; moved = true; }
    if (moved) this.renderBigMap();
  }
  // ------------------------------------------------------------ full map interaction
  bindMap() {
    const c = this.ui.bigmap;
    let drag = null;
    c.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
    addEventListener('mouseup', (e) => {
      if (drag && !drag.moved && this.mapOpen) {
        // set waypoint
        const r = c.getBoundingClientRect();
        const wx = this.mapView.x + (e.clientX - r.left - r.width / 2) / this.mapView.s;
        const wz = this.mapView.z + (e.clientY - r.top - r.height / 2) / this.mapView.s;
        if (this.waypoint && Math.hypot(this.waypoint.x - wx, this.waypoint.z - wz) < 20 / this.mapView.s) this.waypoint = null;
        else this.waypoint = { x: wx, z: wz };
        this.route = null; this.routeT = 0;
        this.game.audio.sfx('ui_click');
        this.renderBigMap();
      }
      drag = null;
    });
    addEventListener('mousemove', (e) => {
      if (!drag || !this.mapOpen) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      this.mapView.x -= dx / this.mapView.s; this.mapView.z -= dy / this.mapView.s;
      drag.x = e.clientX; drag.y = e.clientY;
      this.renderBigMap();
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.mapView.s = clamp(this.mapView.s * (e.deltaY > 0 ? 0.85 : 1.18), 0.15, 4); this.renderBigMap(); }, { passive: false });
    // touch pan/tap
    let tp = null;
    c.addEventListener('touchstart', (e) => { const t = e.touches[0]; tp = { x: t.clientX, y: t.clientY, moved: false, d: e.touches.length === 2 ? dist2(e.touches) : 0 }; e.preventDefault(); }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      if (!tp) return;
      if (e.touches.length === 2) { const d = dist2(e.touches); if (tp.d) this.mapView.s = clamp(this.mapView.s * d / tp.d, 0.15, 4); tp.d = d; tp.moved = true; }
      else { const t = e.touches[0]; this.mapView.x -= (t.clientX - tp.x) / this.mapView.s; this.mapView.z -= (t.clientY - tp.y) / this.mapView.s; tp.x = t.clientX; tp.y = t.clientY; tp.moved = true; }
      this.renderBigMap(); e.preventDefault();
    }, { passive: false });
    c.addEventListener('touchend', (e) => {
      if (tp && !tp.moved) {
        const r = c.getBoundingClientRect();
        this.waypoint = { x: this.mapView.x + (tp.x - r.left - r.width / 2) / this.mapView.s, z: this.mapView.z + (tp.y - r.top - r.height / 2) / this.mapView.s };
        this.route = null; this.renderBigMap();
      }
      tp = null;
    });
    const dist2 = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }
  toggleMap(open) {
    this.mapOpen = open ?? !this.mapOpen;
    this.ui.mapScreen.hidden = !this.mapOpen;
    this.padCross = false;
    const kh = this.ui.mapScreen.querySelector('.kbHint');
    if (kh) kh.textContent = this.game.input.device === 'pad' ? ` (${this.game.input.padName(1)})` : ' (M)';
    const help = this.ui.mapScreen.querySelector('.mapUi p');
    if (help) help.innerHTML = this.game.input.device === 'pad'
      ? `Stick izquierdo para moverte, ${this.game.input.key('', 7)} / ${this.game.input.key('', 6)} para acercar o alejar. ${this.game.input.key('', 0)} marca un destino en la cruz: el GPS te guiará por el callejero real (${this.game.input.key('', 3)} lo borra).`
      : this.game.input.device === 'touch' ? 'Arrastra para moverte y pellizca para acercar. Toca para marcar un destino: el GPS te guiará por el callejero real.'
        : 'Arrastra para moverte, rueda para acercar. Haz clic para marcar un destino: el GPS te guiará por el callejero real.';
    if (this.mapOpen) {
      const p = this.game.player.pos;
      this.mapView.x = p.x; this.mapView.z = p.z;
      this.renderBigMap();
    }
  }
  renderBigMap() {
    const c = this.ui.bigmap;
    const W = c.clientWidth, H = c.clientHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = this.mapView, s = v.s;
    const X = (x) => (x - v.x) * s + W / 2, Z = (z) => (z - v.z) * s + H / 2;
    if (s < 1.1) {
      // raster is enough when zoomed out
      ctx.fillStyle = '#8d9a6c'; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      const k = s / PX;
      ctx.drawImage(this.raster, X(this.rx0), Z(this.rz0), this.raster.width * k, this.raster.height * k);
    } else this.drawMap(ctx, X, Z, s, W, H, false);
    // labels: plazas & landmarks & streets. No two names on top of each other: the blips' names (what you can do
    // there) are reserved first, then the place names in order of importance; one that would overlap is left out
    ctx.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    const boxes = [];
    const free = (x0, y0, x1, y1) => !boxes.some((q) => x0 < q[2] && x1 > q[0] && y0 < q[3] && y1 > q[1]);
    ctx.font = '700 12px "Barlow Condensed", sans-serif';
    for (const [, b] of this.blips) {
      if (b.hidden) continue;
      const x = X(b.x), y = Z(b.z), r = b.small ? 6.5 : 10;
      boxes.push([x - r, y - r, x + r, y + r]);
      if (b.name && (!b.small || s > 1.1)) { const w = ctx.measureText(b.name).width; boxes.push([x + r + 2, y - 8, x + r + 6 + w, y + 8]); }
    }
    const label = (t, x, z, col = '#2b2419', size = 12) => {
      ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      const px = X(x), py = Z(z), w = ctx.measureText(t).width / 2 + 3;
      if (px < -w || px > W + w || py < -20 || py > H + 20) return;
      if (!free(px - w, py - size, px + w, py + 4)) return;
      boxes.push([px - w, py - size, px + w, py + 4]);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,250,240,0.85)'; ctx.strokeText(t, px, py);
      ctx.fillStyle = col; ctx.fillText(t, px, py);
    };
    { const pp = this.game.player.pos, ax = X(pp.x), ay = Z(pp.z); boxes.push([ax - 12, ay - 12, ax + 12, ay + 12]); }
    for (const L of this.game.labels || []) if (s > (L.minS || 0.2)) label(L.name, L.x, L.z, L.color, L.size || 13);
    if (s > 0.8) {
      const done = new Set();
      for (const e of this.map.edges) {
        if (!e.name || done.has(e.name) || e.len < 60 || e.dirt) continue;
        done.add(e.name);
        const p = this.game.map.sample(e, e.len / 2, {});
        let a = Math.atan2(p.dz, p.dx); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
        ctx.font = '600 11px "Barlow Condensed", "Arial Narrow", sans-serif';
        const hw = ctx.measureText(e.name).width / 2, cx = X(p.x), cy = Z(p.z);
        const ex = Math.abs(Math.cos(a)) * hw + 6, ey = Math.abs(Math.sin(a)) * hw + 6;
        if (cx < -ex || cx > W + ex || cy < -ey || cy > H + ey || !free(cx - ex, cy - ey, cx + ex, cy + ey)) continue;
        boxes.push([cx - ex, cy - ey, cx + ex, cy + ey]);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(e.name, 0, 4);
        ctx.fillStyle = '#4a4238'; ctx.fillText(e.name, 0, 4);
        ctx.restore();
      }
    }
    // blips
    this.drawBlips(ctx, X, Z, s, true);
    const pl = this.game.player;
    this.drawArrow(ctx, X(pl.pos.x), Z(pl.pos.z), pl.heading, 9);
    if (this.waypoint) this.drawPin(ctx, X(this.waypoint.x), Z(this.waypoint.z));
    if (this.route) this.drawRoute(ctx, X, Z, 4);
    if (this.padCross) {
      ctx.strokeStyle = 'rgba(20,20,20,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W / 2 - 14, H / 2); ctx.lineTo(W / 2 + 14, H / 2); ctx.moveTo(W / 2, H / 2 - 14); ctx.lineTo(W / 2, H / 2 + 14); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // ------------------------------------------------------------ per-frame HUD
  update(dt) {
    const g = this.game;
    const p = g.player;
    const ui = this.ui;
    // money
    const m = p.money;
    if (Math.abs(this.moneyShown - m) > 0.5) this.moneyShown = lerp(this.moneyShown, m, 1 - Math.exp(-6 * dt));
    else this.moneyShown = m;
    ui.money.textContent = fmtMoney(Math.round(this.moneyShown));
    const wd = (((g.sky.day || 0) + 5) % 7);
    ui.clock.textContent = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][wd] + ' ' + g.sky.timeString;
    // wanted
    const w = g.police.wanted, fl = g.police.flashing && Math.floor(performance.now() / 300) % 2;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<i class="${i < w ? (fl ? 'on dim' : 'on') : ''}"></i>`;
    if (ui.stars._last !== stars) { ui.stars.innerHTML = stars; ui.stars._last = stars; }
    ui.stars.classList.toggle('active', w > 0);
    if (ui.wState) {
      const st = g.police.state;
      if (st !== this._wst) {
        this._wst = st;
        ui.wState.className = st || '';
        ui.wState.textContent = { visto: 'TE HAN VISTO', busca: 'TE BUSCAN', oculto: g.gx('ESCONDIDO', 'ESCONDIDA'), rodeado: 'SABEN DÓNDE ESTÁS', llamada: '📱 ALGUIEN LLAMA A LA POLICÍA' }[st] || '';
      }
    }
    // health & armour
    ui.hp.style.width = `${p.health}%`;
    ui.hp.classList.toggle('low', p.health < 30);
    if (ui.ar) {
      const a = Math.round(p.armor || 0);
      if (a !== this._ar) { this._ar = a; ui.ar.style.width = `${a}%`; ui.ar.parentElement.style.display = a > 0 ? '' : 'none'; }
    }
    // crosshair while aiming a gun; red flash on hits
    const W = g.weapons;
    if (ui.crosshair && W) {
      const on = !p.vehicle && W.aiming && !!W.def.clip && !g.input.isTouch;
      if (on !== this._xh) { this._xh = on; ui.crosshair.classList.toggle('on', on); }
      const hit = W.hitT > 0;
      if (hit !== this._xhit) { this._xhit = hit; ui.crosshair.classList.toggle('hit', hit); }
      if (W.cur !== this._wcur) { this._wcur = W.cur; this.weapon(); }
    }
    // vehicle
    if (p.vehicle) {
      ui.veh.hidden = false;
      const kmh = Math.round(Math.abs(p.vehicle.speed) * 3.6);
      ui.speed.textContent = kmh;
      ui.vehName.textContent = p.vehicle.spec.name;
      ui.vehHp.style.width = `${clamp(p.vehicle.health / 10, 0, 100)}%`;
    } else ui.veh.hidden = true;
    // street name (on change)
    this.streetT -= dt;
    if (this.streetT <= 0) {
      this.streetT = 0.5;
      const q = g.map.nearestEdge(p.pos.x, p.pos.z, 25, (e) => !!e.name);
      let name = q && q.d < q.edge.w / 2 + 12 ? q.edge.name : '';
      const area = g.map.areaAt(p.pos.x, p.pos.z);
      let district = g.map.inTown(p.pos.x, p.pos.z) ? 'Guareña' : 'Vegas Altas';
      if (area && area.name) district = districtName(area) || district;
      if (name.startsWith('Carretera') || name.startsWith('EX-') || name.startsWith('BA-')) district = 'Vegas Altas';
      if (name !== this.currentStreet || district !== this.currentDistrict) {
        const changed = name !== this.currentStreet;
        this.currentStreet = name; this.currentDistrict = district;
        if (name && changed) {
          ui.street.textContent = name;
          ui.district.textContent = district;
          ui.streetBox.classList.remove('show'); void ui.streetBox.offsetWidth; ui.streetBox.classList.add('show');
        }
      }
    }
    // banner
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) { ui.banner.classList.remove('show'); ui.notes.classList.remove('dim'); } }
    // radar (not inside a house)
    const inside = !!g.interior;
    if (inside !== this._inside) { this._inside = inside; ui.radar.style.visibility = inside ? 'hidden' : ''; }
    if (!inside) this.drawRadar(dt);
    // route recompute
    this.routeT -= dt;
    const tgt = this.objective || this.waypoint;
    if (tgt && this.routeT <= 0) { this.routeT = 1.5; this.computeRoute(tgt); }
    if (!tgt) this.route = null;
    if (this.waypoint && Math.hypot(this.waypoint.x - p.pos.x, this.waypoint.z - p.pos.z) < 15) { this.waypoint = null; this.route = null; this.notify('Has llegado a tu destino.', 'ok'); }
    // notifications timeline
    const dimmed = this.bannerT > 0; // notices wait while a big banner covers them
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      if (dimmed) continue;
      n.t -= dt;
      if (n.t <= 0) { n.el.classList.add('out'); setTimeout(() => n.el.remove(), 400); this.notes.splice(i, 1); }
    }
  }

  computeRoute(t) {
    const g = this.game;
    const p = g.player;
    const heading = p.vehicle ? p.vehicle.heading : null;
    this.route = g.map.routeFrom(p.pos.x, p.pos.z, heading, t.x, t.z, { ignoreOneway: !p.vehicle });
    this.routeColor = this.objective ? '#f4c430' : '#b26dff';
  }

  drawRadar(dt) {
    const c = this.ui.radar;
    const ctx = this.radar;
    const W = c.width, H = c.height;
    if (W < 8 || H < 8) return; // zero-sized window (hidden tab / pane)
    const g = this.game;
    const p = g.player;
    const inCar = !!p.vehicle;
    const speed = inCar ? p.vehicle.vel : 0;
    const zoomT = inCar ? lerp(1.55, 0.95, clamp(speed / 30, 0, 1)) : 2.1; // screen px per metre
    this.rzoom = lerp(this.rzoom || zoomT, zoomT, 1 - Math.exp(-2 * dt));
    const s = this.rzoom * (W / 220);
    const yaw = g.cam.forwardYaw; // radar rotates with the camera (north not fixed)
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#6f7d55'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    // world -> screen: rotate so that camera forward points up
    ctx.rotate(yaw - Math.PI);
    const k = s / PX;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.raster, (this.rx0 - p.pos.x) * s, (this.rz0 - p.pos.z) * s, this.raster.width * k, this.raster.height * k);
    const X = (x) => (x - p.pos.x) * s, Z = (z) => (z - p.pos.z) * s;
    if (this.route) this.drawRoute(ctx, X, Z, Math.max(3, 4.5 * s / 2));
    // shade overlay (night tint)
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    const night = g.sky.night;
    if (night > 0.05) { ctx.fillStyle = `rgba(10,18,40,${night * 0.35})`; ctx.fillRect(0, 0, W, H); }
    // blips (rotated positions, upright icons)
    ctx.translate(W / 2, H / 2);
    const rot = yaw - Math.PI;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const RX = (x, z) => { const dx = (x - p.pos.x) * s, dz = (z - p.pos.z) * s; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
    const R = W / 2 - 12;
    const clampR = (q) => { const l = Math.hypot(q[0], q[1]); if (l > R) { const f = R / l; return [q[0] * f, q[1] * f, true]; } return [q[0], q[1], false]; };
    this.drawBlips(ctx, (x) => x, (z) => z, 1, false, (x, z) => clampR(RX(x, z)));
    if (this.waypoint) { const q = clampR(RX(this.waypoint.x, this.waypoint.z)); this.drawPin(ctx, q[0], q[1]); }
    // police: what they can see (while you are wanted), officers on foot, the cars
    const P = g.police;
    if (P.wanted > 0 && !g.interior) {
      const vk = P.visK();
      for (const ob of P.observers()) {
        const R = ob.R * vk, n = 10;
        ctx.beginPath();
        let q = RX(ob.x, ob.z); ctx.moveTo(q[0], q[1]);
        for (let i = 0; i <= n; i++) { const a = ob.h - ob.cone + (2 * ob.cone * i) / n; q = RX(ob.x + Math.sin(a) * R, ob.z + Math.cos(a) * R); ctx.lineTo(q[0], q[1]); }
        ctx.closePath();
        ctx.fillStyle = P.seen ? 'rgba(229,57,53,0.16)' : 'rgba(120,170,255,0.14)';
        ctx.fill();
      }
      if (!P.seen && P.lostT > 1.5) { // where they are looking for you
        const q = RX(P.lkp.x, P.lkp.z);
        ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(q[0], q[1], (35 + P.wanted * 12) * s, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    for (const c of P.calls) { // witnesses on the phone: stop them before they finish
      const q = clampR(RX(c.x, c.z));
      ctx.fillStyle = '#ff8a3d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const o of P.officers) {
      if (o.state === 'dead') continue;
      const q = clampR(RX(o.x, o.z));
      ctx.fillStyle = '#1e88e5'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const u of P.units) {
      const q = clampR(RX(u.v.x, u.v.z));
      ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#e53935' : '#1e88e5';
      ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow (points to character heading relative to camera)
    this.drawArrow(ctx, 0, 0, p.heading - yaw + Math.PI, 8);
    ctx.restore();
    // north marker on the rim
    ctx.save();
    const na = yaw - Math.PI; // canvas rotation; north (0,-1) maps to (sin na, -cos na)
    const nx = W / 2 + Math.sin(na) * (W / 2 - 12), ny = H / 2 - Math.cos(na) * (W / 2 - 12);
    ctx.fillStyle = '#fff'; ctx.font = '700 12px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.beginPath(); ctx.arc(nx, ny, 9, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,20,20,0.75)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('N', nx, ny + 1);
    ctx.restore();
    // wanted ring: flashing while they can see you
    if (g.police.wanted > 0 && g.police.seen) {
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = Math.floor(performance.now() / 250) % 2 ? 'rgba(229,57,53,0.9)' : 'rgba(30,136,229,0.9)';
      ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  drawRoute(ctx, X, Z, w) {
    const r = this.route;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w + 3;
    ctx.beginPath(); for (let i = 0; i < r.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(r[i]), Z(r[i + 1])); ctx.stroke();
    ctx.strokeStyle = this.routeColor || '#b26dff'; ctx.lineWidth = w;
    ctx.stroke();
    ctx.restore();
  }
  drawArrow(ctx, x, y, heading, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.3); ctx.lineTo(size * 0.85, size); ctx.lineTo(0, size * 0.45); ctx.lineTo(-size * 0.85, size); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  drawPin(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#b26dff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 8, 6, 0, Math.PI * 2); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x, y + 2); ctx.lineTo(x + 5, y - 5); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  drawBlips(ctx, X, Z, k, big, proj) {
    for (const [id, b] of this.blips) {
      if (b.hidden) continue;
      let x, y, edge = false;
      if (proj) { const q = proj(b.x, b.z); x = q[0]; y = q[1]; edge = q[2]; if (edge && !b.edge) continue; }
      else { x = X(b.x); y = Z(b.z); }
      const r = b.small ? (big ? 6.5 : 5) : big ? 10 : 7;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color || '#f4c430'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
      if (b.label) { ctx.fillStyle = '#1a1a1a'; ctx.font = `800 ${b.small ? (big ? 9 : 8) : big ? 12 : 10}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.label, x, y + 1); }
      if (big && b.name && (!b.small || k > 1.1)) { ctx.font = '700 12px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(b.name, x + r + 4, y + 4); ctx.fillStyle = '#fff'; ctx.fillText(b.name, x + r + 4, y + 4); }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ weapon panel & action prompt
  weapon(flash = false) {
    const W = this.game.weapons, ui = this.ui;
    if (!W || !ui.wName) return;
    const d = W.def, s = W.slot;
    ui.wName.textContent = d.name;
    ui.wAmmo.textContent = d.clip ? (W.reloadT > 0 ? 'Recargando' : `${s.clip} / ${s.ammo}`) : '';
    ui.wAmmo.classList.toggle('low', !!d.clip && (s.clip + s.ammo === 0 || s.clip <= Math.ceil(d.clip * 0.25)));
    const tb = this.ui.tAttack;
    if (tb) tb.textContent = d.clip ? 'Disparar' : d.id === 'bate' ? 'Batear' : 'Golpe';
    if (flash) { const el = ui.weapon; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); clearTimeout(this._wT); this._wT = setTimeout(() => el.classList.remove('flash'), 220); }
  }
  prompt(html, tap = false) {
    const el = this.ui.prompt;
    if (!el) return;
    if (html === this._prompt && tap === this._promptTap) return;
    this._prompt = html; this._promptTap = tap;
    if (html) el.innerHTML = html;
    el.classList.toggle('on', !!html);
    el.classList.toggle('tap', !!html && tap);
  }

  // ------------------------------------------------------------ messages
  setBlip(id, b) { this.blips.set(id, b); }
  removeBlip(id) { this.blips.delete(id); }
  notify(text, kind = 'info', t = 5) {
    // the same line again (a repeated warning): bring it back to the top instead of stacking copies
    const dup = this.notes.find((n) => n.el.textContent === String(text));
    if (dup) { dup.t = Math.max(dup.t, t); this.ui.notes.prepend(dup.el); return; }
    const el = document.createElement('div');
    el.className = 'note ' + kind;
    el.textContent = text;
    this.ui.notes.prepend(el);
    this.notes.push({ el, t });
    while (this.notes.length > 4) { const n = this.notes.shift(); n.el.remove(); }
    this.game.audio.sfx('text_msg');
  }
  help(text, t = 6) {
    const h = this.ui.help;
    if (!text) { h.classList.remove('show'); this.helpUntil = 0; return; }
    h.innerHTML = text;
    h.classList.add('show');
    clearTimeout(this._helpT);
    this.helpUntil = t > 0 ? performance.now() + t * 1000 : Infinity;
    if (t > 0) this._helpT = setTimeout(() => { h.classList.remove('show'); this.helpUntil = 0; }, t * 1000);
  }
  get helpBusy() { return (this.helpUntil || 0) > performance.now(); }
  objectiveText(text) {
    const o = this.ui.objective;
    if (!text) { o.classList.remove('show'); return; }
    o.innerHTML = text;
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
  }
  subtitle(who, text) {
    const s = this.ui.subs;
    this.subWho = text ? who || null : null; // who is speaking now (the player's character moves its lips and hands)
    if (!text) { s.classList.remove('show'); return; }
    s.innerHTML = who ? `<b>${who}:</b> ${text}` : text;
    s.classList.add('show');
  }
  banner(title, sub = '', kind = 'pass', t = 4) {
    const b = this.ui.banner;
    b.className = 'banner ' + kind;
    b.innerHTML = `<div class="bt">${title}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`;
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerT = t;
    this.ui.notes.classList.add('dim'); // the big title reads clean over the notices
  }
  radio(name, sub = '') {
    const r = this.ui.radio;
    r.innerHTML = '';
    r.append(document.createTextNode(name));
    if (sub) { const s = document.createElement('small'); s.textContent = sub; r.append(s); }
    r.classList.remove('show'); void r.offsetWidth; r.classList.add('show');
  }
  timer(sec) {
    const t = this.ui.timer;
    if (sec === null || sec === undefined) { t.hidden = true; return; }
    t.hidden = false;
    const m = Math.floor(Math.max(0, sec) / 60), s = Math.floor(Math.max(0, sec) % 60);
    t.textContent = `${m}:${String(s).padStart(2, '0')}`;
    t.classList.toggle('urgent', sec < 10);
  }
  flashDamage() {
    const d = this.ui.damage;
    d.classList.remove('hit'); void d.offsetWidth; d.classList.add('hit');
  }
}
