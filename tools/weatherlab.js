// Weather lab (src/weather.js, src/rain.js, src/sky.js): the real reading, every WMO code's mapping, each kind of sky
// forced and photographed, the network failing, the transitions, and what the rain costs.
//   const W = await import('/tools/weatherlab.js?' + Date.now());
//   await W.status()                 // the reading now (asks the API) and the line under the clock
//   W.codes()                        // every WMO code → the town's weather
//   W.force(63)                      // a code put up at once, as if the API said so (W.live() goes back to the real one)
//   await W.shots('dia', 12.5)       // every kind of sky at that hour → .snaps/wx_<tag>_<kind>.jpg
//   await W.offline()                // the network fails: what stays, what is shown, and back
//   await W.fade(0, 63)              // from one code to another: the values over 90 s (real time, no rendering)
//   await W.perf()                   // ms per frame (rendering), clear and pouring
import { WMO, derive, NEUTRAL } from '/src/weather.js';

const G = () => window.game;
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
// a reading as the API would give it now (Guareña's local time), for a code
export function fake(code, o = {}) {
  const C = WMO[code] || {};
  const now = new Date(), parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const [d, hm] = parts.split(' '); const [h, m] = hm.split(':').map(Number);
  const time = `${d}T${String(h).padStart(2, '0')}:${String(Math.floor(m / 15) * 15).padStart(2, '0')}`;
  const offset = Math.round((new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' })) - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))) / 1000); // (Madrid's offset from UTC, s)
  return {
    cur: {
      time, interval: 900, weather_code: code, cloud_cover: Math.round((C.c ?? (code === 0 ? 0.05 : 0.3)) * 100),
      precipitation: C.r ? +(C.r * 1.8).toFixed(1) : 0, snowfall: C.s ? C.s : 0, visibility: C.f ? 300 : C.r ? 9000 : 30000,
      wind_speed_10m: 14, wind_direction_10m: 250, wind_gusts_10m: C.t ? 55 : 25, temperature_2m: 18, ...o,
    },
    offset,
  };
}
export async function status() {
  const w = G().weather;
  await w.refresh();
  return { status: w.status, info: w.info(), reading: w.data && w.data.cur, cell: w.cell, fails: w.fails, why: w.failWhy, now: { ...w.now } };
}
export function codes() {
  const out = {};
  for (const k of Object.keys(WMO)) { const f = fake(+k); const w = derive(f.cur); out[k] = `${WMO[k].l}: nubes ${w.cover.toFixed(2)}, cubierto ${w.over.toFixed(2)}, lluvia ${w.rain.toFixed(2)}, nieve ${w.snow.toFixed(2)}, niebla ${w.fog.toFixed(2)}${w.fogFar ? ' (' + Math.round(w.fogFar) + ' m)' : ''}, tormenta ${w.storm.toFixed(2)}`; }
  return out;
}
// put a code up at once (the polling stopped meanwhile)
export function force(code, o = {}) {
  const w = G().weather;
  clearTimeout(w.timer);
  const f = fake(code, o);
  w.accept(f.cur, f.offset);
  Object.assign(w.now, w.data.w); w.fresh = false;
  w.update(0.001, G());
  return { label: w.data.label, w: w.data.w, info: w.info() };
}
export function live() { const w = G().weather; w.refresh(); return 'pidiendo la lectura real'; }

// the camera on the plaza, looking across it (open sky over the houses)
function frameView(hour) {
  const g = G(), lm = g.world.landmarks.poi, P = lm.plaza, T = lm.churchTower || lm.churchDoor;
  const q = g.map.nearestEdge(P.x, P.z, 60, (e) => e.walk && !e.blocked && !e.dirt);
  g.player.spawnAt(q.x, q.z, 0);
  g.sky.hour = hour;
  g.cam.yaw = Math.atan2(T.x - q.x, T.z - q.z); // (the camera's yaw points from the player to it: looking across the plaza)
  g.cam.pitch = 0.12;                            // (a little up: more sky)
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.hidden = true; }
}
async function post(name) {
  const c = G().renderer.domElement, o = document.createElement('canvas');
  o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0);
  await fetch('/__snap?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.86) });
}
export const KINDS = [['despejado', 0], ['parcial', 2], ['cubierto', 3], ['llovizna', 53], ['lluvia', 63], ['chubascos', 81], ['niebla', 45], ['tormenta', 95], ['nieve', 73]];
export async function shots(tag, hour = 12.5, kinds = KINDS) {
  const g = G(), done = [];
  frameView(hour);
  for (let f = 0; f < 90; f++) { if (g.state !== 'play') g.state = 'play'; g.sky.hour = hour; g.frame(1 / 30); if (f % 10 === 0) await yieldNow(); } // (the town streams in round the plaza)
  for (const [kind, code] of kinds) {
    force(code);
    for (let f = 0; f < 24; f++) {
      if (g.state !== 'play') g.state = 'play'; g.sky.hour = hour;
      if (kind === 'tormenta' && f === 22) g.weather.pulses.push({ t: 0, d: 0.2, k: 1 }); // (a flash in the picture)
      g.sky.envTimer = 0; g.frame(1 / 30);
      if (f % 8 === 0) await yieldNow();
    }
    await post(`wx_${tag}_${kind}`);
    done.push(kind);
  }
  return done;
}
export async function offline() {
  const g = G(), w = g.weather, keep = w.fetchFn, out = {};
  w.fetchFn = () => Promise.reject(new TypeError('Failed to fetch (prueba: sin red)'));
  await w.refresh();
  out.conDatosPrevios = { status: w.status, info: w.info(), retryEnS: null, label: w.data && w.data.label };
  // never had a reading (first start without network)
  const keepData = w.data; w.data = null; w.fails = 0;
  await w.refresh();
  out.sinDatosNunca = { status: w.status, info: w.info(), sky: { ...g.sky.wx } };
  w.update(1, g); out.cieloSinDatos = { ...w.now };
  w.data = keepData;
  w.fetchFn = keep;
  await w.refresh();
  out.vuelveLaRed = { status: w.status, info: w.info() };
  return out;
}
export async function fade(from = 0, to = 63, seconds = 90) {
  const g = G(), w = g.weather;
  force(from);
  const f = fake(to); w.accept(f.cur, f.offset);
  const rows = [];
  for (let t = 0; t <= seconds; t += 1 / 30) {
    w.update(1 / 30, g);
    if (Math.abs(t % 5) < 1 / 60 || t + 1 / 30 > seconds) rows.push(`${t.toFixed(0)} s: nubes ${w.now.cover.toFixed(2)} cubierto ${w.now.over.toFixed(2)} lluvia ${w.now.rain.toFixed(2)} niebla ${w.now.fog.toFixed(2)}`);
  }
  return rows;
}
export async function perf(n = 150) {
  const g = G(), res = {};
  for (const [kind, code] of [['despejado', 0], ['lluvia fuerte', 65], ['tormenta', 99]]) {
    force(code);
    for (let f = 0; f < 30; f++) { if (g.state !== 'play') g.state = 'play'; g.frame(1 / 60); }
    const a = [];
    for (let f = 0; f < n; f++) { if (g.state !== 'play') g.state = 'play'; const t0 = performance.now(); g.frame(1 / 60); a.push(performance.now() - t0); if (f % 20 === 0) await yieldNow(); }
    a.sort((x, y) => x - y);
    res[kind] = { mediana: +a[a.length >> 1].toFixed(1), p95: +a[Math.floor(a.length * 0.95)].toFixed(1), gotas: g.rain.mesh.visible ? g.rain.mesh.geometry.instanceCount : 0 };
  }
  return res;
}
export { NEUTRAL };
