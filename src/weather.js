// The weather of the real Guareña, now: Open-Meteo's current conditions (https://open-meteo.com) for the town's own
// cell of the weather model — an estimate for the last quarter of an hour, not a station's reading — fetched when a
// game starts and every ten minutes. The sky, the light, the fog, the rain and the storms follow it slowly; the game's
// own clock (day and night, the neighbours' routines) is not touched. Free and without a key, for non-commercial use
// (licence CC BY 4.0: «Weather data by Open-Meteo.com»). If the network or the API fails, the last good reading stays
// (shown as old); the page published on claude.ai cannot reach other sites at all: there the game's own weather goes on.
import { clamp } from './util.js';

export const WX_SOURCE = { name: 'Open-Meteo', url: 'https://open-meteo.com', licence: 'CC BY 4.0' };
// the map's own origin, in the town (the geocoder's Guareña, Badajoz, is at 38.8595, −6.0999: there is another in Ávila,
// hence coordinates and not the name); the model answers with its nearest cell
export const WX_PLACE = { lat: 38.8596, lon: -6.1025 };
const VARS = ['weather_code', 'cloud_cover', 'precipitation', 'rain', 'showers', 'snowfall', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m'];
export const WX_URL = `https://api.open-meteo.com/v1/forecast?latitude=${WX_PLACE.lat}&longitude=${WX_PLACE.lon}&current=${VARS.join(',')}&timezone=Europe%2FMadrid`;
const EVERY = 10 * 60e3;                         // (the current conditions come in quarters of an hour: a new one is seen within 10 min)
const RETRY = [60e3, 120e3, 300e3, 600e3];       // after a failure: 1, 2, 5, then every 10 minutes
const STALE = 45 * 60e3;                         // a reading older than three quarters of an hour is old
const KEEP = 3 * 3600e3;                         // a saved reading is still worth showing at the next start for 3 h
const CACHE = 'guarena-evo-tiempo';
const HOSTED = typeof location !== 'undefined' && /claudeusercontent\.com$|claude\.ai$/.test(location.hostname);

// The WMO weather codes (Open-Meteo's table) → what the town looks like: k the kind, l its name, c the least cloud cover
// it means, r rain, s snow, f fog, t thunder (0–1)
export const WMO = {
  0: { k: 'despejado', l: 'Despejado' },
  1: { k: 'despejado', l: 'Poco nuboso', c: 0.15 },
  2: { k: 'parcial', l: 'Parcialmente nuboso', c: 0.45 },
  3: { k: 'cubierto', l: 'Cubierto', c: 0.92 },
  45: { k: 'niebla', l: 'Niebla', c: 0.6, f: 1 },
  48: { k: 'niebla', l: 'Niebla con escarcha', c: 0.6, f: 1 },
  51: { k: 'llovizna', l: 'Llovizna débil', c: 0.85, r: 0.15 },
  53: { k: 'llovizna', l: 'Llovizna', c: 0.9, r: 0.25 },
  55: { k: 'llovizna', l: 'Llovizna densa', c: 0.95, r: 0.35 },
  56: { k: 'llovizna', l: 'Llovizna helada', c: 0.9, r: 0.2 },
  57: { k: 'llovizna', l: 'Llovizna helada densa', c: 0.95, r: 0.35 },
  61: { k: 'lluvia', l: 'Lluvia débil', c: 0.9, r: 0.35 },
  63: { k: 'lluvia', l: 'Lluvia', c: 0.95, r: 0.6 },
  65: { k: 'lluvia', l: 'Lluvia fuerte', c: 1, r: 0.9 },
  66: { k: 'lluvia', l: 'Lluvia helada', c: 0.95, r: 0.4 },
  67: { k: 'lluvia', l: 'Lluvia helada fuerte', c: 1, r: 0.8 },
  71: { k: 'nieve', l: 'Nieve débil', c: 0.95, s: 0.3 },
  73: { k: 'nieve', l: 'Nieve', c: 1, s: 0.6 },
  75: { k: 'nieve', l: 'Nieve fuerte', c: 1, s: 0.9 },
  77: { k: 'nieve', l: 'Granos de nieve', c: 0.95, s: 0.3 },
  80: { k: 'chubascos', l: 'Chubascos débiles', c: 0.8, r: 0.4 },
  81: { k: 'chubascos', l: 'Chubascos', c: 0.9, r: 0.65 },
  82: { k: 'chubascos', l: 'Chubascos muy fuertes', c: 1, r: 1 },
  85: { k: 'nieve', l: 'Chubascos de nieve', c: 0.9, s: 0.5 },
  86: { k: 'nieve', l: 'Chubascos de nieve fuertes', c: 1, s: 0.9 },
  95: { k: 'tormenta', l: 'Tormenta', c: 1, r: 0.7, t: 0.8 },
  96: { k: 'tormenta', l: 'Tormenta con granizo', c: 1, r: 0.8, t: 1 },
  99: { k: 'tormenta', l: 'Tormenta con granizo fuerte', c: 1, r: 0.95, t: 1 },
};
const ICON = { despejado: '☀️', parcial: '⛅', cubierto: '☁️', niebla: '🌫️', llovizna: '🌦️', lluvia: '🌧️', chubascos: '🌧️', nieve: '🌨️', tormenta: '⛈️' };

// the game's own weather (no reading, or «Del juego»): what the town always had — a few clouds, dry, clear air
export const NEUTRAL = { cover: 0.42, over: 0, rain: 0, snow: 0, fog: 0, fogFar: 0, storm: 0, wind: 0, windX: 0, windZ: 0 };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// a reading → the town's weather (0–1 each; fogFar in metres when there is fog)
export function derive(cur) {
  const C = WMO[cur.weather_code] || null;
  const cover = clamp(Math.max(num(cur.cloud_cover, 40) / 100, C && C.c ? C.c : 0), 0, 1);
  // the quarter's precipitation as an hourly rate (light under 2.5 mm/h, heavy over 7.6)
  const mmh = Math.max(0, num(cur.precipitation, 0)) * 3600 / (num(cur.interval, 900) || 900);
  const fromMm = mmh > 0.05 ? clamp(0.15 + mmh / 8, 0.15, 1) : 0;
  let rain = C && C.r ? Math.max(C.r, fromMm) : (!C || !C.s) && mmh >= 0.4 ? Math.min(0.3, fromMm) : 0;
  const snow = C && C.s ? C.s : 0;
  if (snow) rain = 0;
  const vis = num(cur.visibility, 30000);
  const fog = Math.max(C && C.f ? C.f : 0, vis < 1000 ? 1 : vis < 5000 ? ((5000 - vis) / 4000) * 0.6 : 0);
  const storm = C && C.t ? C.t : 0;
  const over = clamp(Math.max(smooth(0.55, 0.9, cover), rain * 0.9, snow * 0.8, storm, fog * 0.9), 0, 1); // (a sky 90 % covered hides the sun; in a fog there is no sky to see)
  const wind = clamp(num(cur.wind_gusts_10m, num(cur.wind_speed_10m, 0)) / 70, 0, 1);
  // where the wind blows to (it is given as where it comes from: 270° is a west wind), m/s; world x east, z south
  const wd = num(cur.wind_direction_10m, 250) * Math.PI / 180, ws = num(cur.wind_speed_10m, 0) / 3.6;
  // (the reported visibility is where things fade out; the game's fog is linear, from your feet, so it is put at about
  // half of it to fade the near streets as much as a real fog does)
  return { cover, over, rain, snow, fog, fogFar: fog ? clamp(vis * 0.45, 50, 3000) : 0, storm, wind, windX: -Math.sin(wd) * ws, windZ: Math.cos(wd) * ws };
}
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
// the reading's time ("2026-10-06T19:45", local to Guareña) → epoch ms
function validMs(cur, offset) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(cur.time || '');
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - num(offset, 0) * 1000;
}

export class Weather {
  constructor(game) {
    this.game = game;
    this.on = game.save.weatherLive !== false;
    this.data = null;                 // the last good reading: { cur, at: when fetched, valid: when it is for (ms), kind, label, w }
    this.lastOk = 0; this.lastFail = 0; this.fails = 0; this.failWhy = '';
    this.now = { ...NEUTRAL };        // what the town shows (eased towards the target)
    this.fresh = true;                // (the first reading at the start of a game is put up at once, not faded in)
    this.flash = 0; this.boltT = 8; this.pulses = []; this.thunders = [];
    this.fetchFn = (url, o) => fetch(url, o);
    this.restore();
    if (this.on && !HOSTED) this.refresh();
  }

  // ------------------------------------------------------------------ the reading
  restore() {
    try {
      const s = JSON.parse((this.game.store && this.game.store.getItem(CACHE)) || 'null');
      if (s && s.cur && Date.now() - s.valid < KEEP) this.accept(s.cur, s.offset, s.at, true);
    } catch (e) { /* no saved reading */ }
  }
  accept(cur, offset, at = Date.now(), cached = false) {
    const C = WMO[cur.weather_code];
    const w = derive(cur);
    const kind = C ? C.k : w.rain ? 'lluvia' : w.cover > 0.8 ? 'cubierto' : w.cover > 0.35 ? 'parcial' : 'despejado';
    this.data = { cur, offset, at, valid: validMs(cur, offset) ?? at, kind, label: C ? C.l : kind[0].toUpperCase() + kind.slice(1), w, cached };
    if (!cached) {
      this.lastOk = Date.now(); this.fails = 0; this.failWhy = '';
      try { this.game.store && this.game.store.setItem(CACHE, JSON.stringify({ cur, offset, at, valid: this.data.valid })); } catch (e) { /* storage full or off */ }
    }
  }
  async refresh() {
    clearTimeout(this.timer);
    if (!this.on || HOSTED) return;
    let ok = false;
    try {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = setTimeout(() => ac && ac.abort(), 12000);
      const r = await this.fetchFn(WX_URL, { signal: ac && ac.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || !j.current || typeof j.current.weather_code !== 'number') throw new Error('respuesta sin datos');
      this.accept(j.current, j.utc_offset_seconds);
      this.cell = { lat: j.latitude, lon: j.longitude, elevation: j.elevation };
      ok = true;
    } catch (e) {
      this.fails++; this.lastFail = Date.now(); this.failWhy = String((e && e.message) || e);
    }
    if (!this.on) return;
    this.timer = setTimeout(() => this.refresh(), ok ? EVERY : RETRY[Math.min(this.fails, RETRY.length) - 1]);
  }
  setOn(on) {
    this.on = !!on;
    this.game.save.weatherLive = this.on; this.game.persist();
    clearTimeout(this.timer);
    if (this.on && !HOSTED) this.refresh();
  }
  // where the reading stands: 'off' (the game's own weather, by choice), 'hosted' (this page cannot reach other sites),
  // 'loading' (asking), 'live', 'stale' (old, or no answer lately: the last good one stays), 'none' (never had one)
  get status() {
    if (!this.on) return 'off';
    if (HOSTED) return 'hosted';
    const d = this.data;
    if (!d) return this.fails ? 'none' : 'loading';
    if (Date.now() - d.valid > STALE || d.cached || this.lastFail > this.lastOk) return 'stale';
    return 'live';
  }
  // what to show under the clock (null: nothing)
  info() {
    const st = this.status, d = this.data;
    if (st === 'off') return null;
    if (st === 'hosted') return { icon: '', text: 'Tiempo en directo no disponible aquí', sub: 'solo en la versión de GitHub o del ordenador', cls: 'none' };
    if (!d) return st === 'loading' ? { icon: '', text: 'Consultando el tiempo…', sub: '', cls: 'none' } : { icon: '', text: 'Sin datos del tiempo', sub: 'sin conexión · tiempo del juego', cls: 'none' };
    const hhmm = new Date(d.valid).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    const night = this.game.sky && this.game.sky.night > 0.5;
    const icon = d.kind === 'despejado' && night ? '🌙' : ICON[d.kind] || '';
    const why = st !== 'stale' ? '' : this.lastFail > this.lastOk ? ' · sin conexión' : ' · sin actualizar'; // (no answer lately / an old or saved reading)
    return { icon, text: d.label, sub: `Guareña ${hhmm}${why} · Open-Meteo`, cls: st };
  }

  // ------------------------------------------------------------------ the town follows it
  // (real seconds: the weather turns at its own pace, whatever the game's clock does)
  update(dtReal, game) {
    const dt = clamp(dtReal, 0, 0.1);
    const st = this.status;
    const useIt = this.data && (st === 'live' || st === 'stale') && game.mode !== 'zombis'; // (the zombie night keeps its own dusk)
    const T = useIt ? this.data.w : NEUTRAL;
    const N = this.now;
    // (a reading there when the game starts is put up at once; one that comes later rolls in)
    this.playT = (this.playT || 0) + dt;
    if (this.fresh && useIt) Object.assign(N, T);
    if (this.fresh && (useIt || this.playT > 6)) this.fresh = false;
    // a minute or so to change from one sky to another; rain comes and goes a little sooner
    const ease = (k, tau) => { N[k] += (T[k] - N[k]) * (1 - Math.exp(-dt / tau)); };
    ease('cover', 18); ease('over', 18); ease('rain', 12); ease('snow', 12); ease('fog', 20); ease('storm', 8); ease('wind', 10); ease('windX', 10); ease('windZ', 10);
    N.fogFar = T.fogFar || N.fogFar || 3000;
    // lightning: now and then a flash (one, two or three strokes), and its thunder after the time sound takes to come
    const s = N.storm;
    if (s > 0.25 && !game.interior) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = (5 + Math.random() * 16) / Math.max(0.4, s);
        const n = 1 + Math.floor(Math.random() * 3), km = 0.6 + Math.random() * 5.5;
        let t0 = 0;
        for (let i = 0; i < n; i++) { this.pulses.push({ t: t0, d: 0.05 + Math.random() * 0.07, k: (i ? 0.55 : 1) * (1.1 - km / 8) }); t0 += 0.08 + Math.random() * 0.18; }
        this.thunders.push({ t: Math.min(9, km / 0.343), vol: clamp(1.15 - km / 6.5, 0.25, 1), near: km < 1.6 });
      }
    }
    let f = 0;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t -= dt;
      if (p.t <= 0) { const a = 1 + p.t / p.d; if (a <= 0) { this.pulses.splice(i, 1); continue; } f = Math.max(f, p.k * a); }
    }
    this.flash = f;
    for (let i = this.thunders.length - 1; i >= 0; i--) {
      const th = this.thunders[i];
      if ((th.t -= dt) <= 0) { this.thunders.splice(i, 1); game.audio.sfx('thunder', { vol: th.vol * (game.interior ? 0.6 : 1), pitch: th.near ? 1.3 : 0.85 + Math.random() * 0.3 }); }
    }
    // to the sky (sky.js reads it on its next update)
    const W = game.sky.wx;
    W.cover = N.cover; W.over = N.over; W.rain = N.rain; W.snow = N.snow; W.fog = N.fog; W.fogFar = N.fogFar; W.storm = N.storm; W.wind = N.wind; W.windX = N.windX; W.windZ = N.windZ; W.flash = this.flash;
  }
}
