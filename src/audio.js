// audio.js — fully procedural Web Audio for the Guareña open-world driving game.
// No audio assets: every sound is synthesized live or pre-rendered once into AudioBuffers.
//
// Sections
//   1. Utilities
//   2. Offline renderers (noise, Karplus-Strong guitar, drums, explosion, bells, nature loops)
//   3. Sound bank (lazy buffer cache + sliced warm-up queue)
//   4. Player engine synth
//   5. Continuous beds (skid, off-road, wind) and sirens
//   6. GameAudio core (graph, volumes, listener, voices, spatialisation)
//   7. One-shot SFX recipes
//   8. Ambient (day/night beds, birds, dogs, owls, bells, storks)
//   9. Radio (lookahead scheduler + three procedural stations)

// ───────────────────────────── 1. Utilities ─────────────────────────────

const AC = typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : undefined;

const MAX_VOICES = 24;
const REF_DIST = 8;
const MAX_DIST = 150;
const STATIONS = ['Vegas Altas FM', 'Guadiana Urbana', 'Castúo Rock', 'Radio Apagada'];
const TAU = Math.PI * 2;

import { fetchSample } from './assets.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Deterministic RNG (mulberry32) so a generated song can repeat its own motifs.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smoothly move an AudioParam; skips redundant automation events.
function glide(p, v, t, tc = 0.05, eps = 1e-4) {
  if (!p) return;
  v = num(v, p.value);
  if (p._last !== undefined && Math.abs(p._last - v) < eps) return;
  p._last = v;
  p.setTargetAtTime(v, t, Math.max(0.002, tc));
}

// Attack / exponential-decay envelope on a gain param.
function env(p, t, peak, a, d) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(num(peak), t + Math.max(0.001, a));
  p.setTargetAtTime(0, t + Math.max(0.001, a), Math.max(0.005, d / 5));
}

// ─────────────────────── 2. Offline renderers (plain JS DSP) ───────────────────────

// In-place RBJ biquad over a Float32Array.
function biquad(x, type, f, q, sr, db = 0) {
  const w = (TAU * clamp(f, 10, sr * 0.45)) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), A = Math.pow(10, db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

const white = (n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; return a; };

function pink(n) { // Paul Kellet's economy pink filter
  const a = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  return a;
}

function brown(n) {
  const a = new Float32Array(n);
  let l = 0;
  for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = l * 3.5; }
  return a;
}

// Crossfade the tail into the head so the array loops without a click.
function loopify(a, n) {
  const len = a.length - n, out = a.slice(0, len);
  for (let i = 0; i < n; i++) { const k = i / n; out[i] = a[i] * k + a[len + i] * (1 - k); }
  return out;
}

// Render `dur` seconds from fn(t, i), t in seconds.
function synth(sr, dur, fn) {
  const n = Math.max(1, Math.floor(sr * dur)), a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(i / sr, i);
  return a;
}

function fadeEdges(a, sr, fin = 0.001, fout = 0.02) {
  const ni = Math.floor(sr * fin), no = Math.min(a.length, Math.floor(sr * fout));
  for (let i = 0; i < ni && i < a.length; i++) a[i] *= i / ni;
  for (let i = 0; i < no; i++) a[a.length - 1 - i] *= i / no;
  return a;
}

// Karplus-Strong plucked string with allpass fine tuning (chords stay in tune) and a guitar body.
function renderPluck(sr, freq, { dur = 2.4, bright = 0.5 } = {}) {
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  // Loop delay = N - 0.5 (read-ahead average) + allpass fraction; solve so it equals one period.
  let p = sr / freq + 0.5, N = Math.floor(p), frac = p - N;
  if (frac < 0.1) { N -= 1; frac += 1; }
  N = Math.max(2, N);
  const c = (1 - frac) / (1 + frac);
  const t60 = clamp(4.5 - 0.004 * (freq - 80), 1.4, 4.5);
  const rho = Math.pow(10, -3 / (t60 * freq));
  // Excitation: soft (low-passed) noise, with a pluck-position comb near the sound hole.
  const raw = new Float32Array(N), buf = new Float32Array(N);
  const k = 0.18 + 0.72 * bright;
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += k * (Math.random() * 2 - 1 - lp); raw[i] = lp; }
  const D = Math.max(1, Math.round(N * 0.16));
  for (let i = 0; i < N; i++) buf[i] = raw[i] - 0.8 * raw[(i + N - D) % N];
  let idx = 0, apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const cur = buf[idx], nxt = buf[(idx + 1) % N];
    out[i] = cur;
    const avg = rho * 0.5 * (cur + nxt);
    const y = c * avg + apx - c * apy; // first-order allpass: fractional delay
    apx = avg; apy = y;
    buf[idx] = y;
    idx = (idx + 1) % N;
  }
  // Body: air and top-plate resonances, then a soft treble roll-off
  biquad(out, 'peak', 105, 1.1, sr, 5);
  biquad(out, 'peak', 230, 1.4, sr, 3);
  biquad(out, 'lp', 3600 + bright * 2400, 0.7, sr);
  return fadeEdges(out, sr, 0.0008, 0.05);
}

// Kick drum: sine with pitch sweep + beater click, optional drive.
function renderKick(sr, { f0 = 150, f1 = 48, pd = 0.045, ad = 0.35, dur = 0.55, click = 0.35, drive = 1.4 } = {}) {
  let ph = 0;
  const a = synth(sr, dur, (t) => {
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-t / pd))) / sr;
    const s = Math.sin(ph) * Math.exp(-t / ad) + (t < 0.006 ? click * (Math.random() * 2 - 1) * (1 - t / 0.006) : 0);
    return Math.tanh(s * drive);
  });
  return fadeEdges(a, sr, 0.0005, 0.03);
}

// Noise + tone drum (snares, cajón slap, rims, toms, claps).
function renderDrum(sr, { dur = 0.3, tone = 180, tone2 = 0, td = 0.06, nd = 0.08, tl = 0.6, nl = 0.8, pitchDrop = 0.25, hp = 800, lp = 9000, bp = 0, q = 1 } = {}) {
  const n = white(Math.floor(sr * dur));
  if (hp) biquad(n, 'hp', hp, 0.7, sr);
  if (lp) biquad(n, 'lp', lp, 0.7, sr);
  if (bp) biquad(n, 'bp', bp, q, sr);
  let p1 = 0, p2 = 0;
  const a = synth(sr, dur, (t, i) => {
    const drop = 1 + pitchDrop * Math.exp(-t / 0.02);
    p1 += (TAU * tone * drop) / sr; p2 += (TAU * tone2 * drop) / sr;
    const tn = (Math.sin(p1) + (tone2 ? 0.6 * Math.sin(p2) : 0)) * tl * Math.exp(-t / td);
    return tn + n[i] * nl * Math.exp(-t / nd);
  });
  return fadeEdges(a, sr, 0.0003, 0.02);
}

// Hand clap / palmas: several quick noise bursts then a short tail.
function renderClap(sr, { bp = 1400, q = 1.3, dur = 0.25, tail = 0.07, bursts = 3 } = {}) {
  const n = biquad(white(Math.floor(sr * dur)), 'bp', bp, q, sr);
  const a = synth(sr, dur, (t, i) => {
    let e = 0;
    for (let b = 0; b < bursts; b++) { const tb = t - b * 0.009; if (tb >= 0 && tb < 0.009) e = Math.max(e, Math.exp(-tb / 0.0025)); }
    const tb = t - bursts * 0.009;
    if (tb >= 0) e = Math.max(e, Math.exp(-tb / tail));
    return n[i] * e * 3;
  });
  return fadeEdges(a, sr, 0.0002, 0.02);
}

// Metallic hi-hat / crash: 808-style square cluster plus bright noise.
function renderMetal(sr, { dur = 0.3, decay = 0.06, noiseMix = 0.6, hp = 7000, base = 1 } = {}) {
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * base);
  const nz = white(Math.floor(sr * dur));
  const a = synth(sr, dur, (t, i) => {
    let s = 0;
    for (let k = 0; k < 6; k++) s += Math.sin(TAU * fr[k] * t) > 0 ? 1 : -1;
    return (s / 6 * (1 - noiseMix) + nz[i] * noiseMix) * Math.exp(-t / decay);
  });
  biquad(a, 'hp', hp, 0.7, sr);
  biquad(a, 'peak', 10000, 1, sr, 4);
  return fadeEdges(a, sr, 0.0002, 0.02);
}

// Big explosion (stereo): filtered noise body with sweeping cutoff, sub drop and crackle.
function renderExplosion(sr, dur = 4.5) {
  const n = Math.floor(sr * dur), chans = [new Float32Array(n), new Float32Array(n)];
  for (const out of chans) {
    let l1 = 0, l2 = 0, ph = 0, cr = 0;
    const crDecay = Math.exp(-1 / (sr * 0.004));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fc = 110 + 6000 * Math.exp(-t / 0.18) + 450 * Math.exp(-t / 1.3);
      const k = 1 - Math.exp((-TAU * fc) / sr);
      l1 += k * (Math.random() * 2 - 1 - l1); l2 += k * (l1 - l2);
      const amp = (t < 0.004 ? t / 0.004 : 1) * (Math.exp(-t / 0.7) + 0.35 * Math.exp(-t / 2.4));
      ph += (TAU * (28 + 70 * Math.exp(-t / 0.3))) / sr;
      if (t < 2.2 && Math.random() < 0.0012 * Math.exp(-t / 0.7)) cr = rnd(0.2, 0.9);
      cr *= crDecay;
      const s = l2 * 2.4 * amp + Math.sin(ph) * Math.exp(-t / 0.8) * Math.min(1, t / 0.01) + cr * (Math.random() * 2 - 1);
      out[i] = Math.tanh(s * 1.6);
    }
  }
  return chans;
}

// Gunshot (stereo): supersonic crack, muzzle blast with a falling cutoff, chest thump and a
// slap-back tail off the whitewashed walls (slightly different per ear).
function renderGun(sr, { dur = 1.1, body = 0.04, f0 = 170, tail = 0.3, bright = 5500, crack = 1, echo = 0.1 } = {}) {
  const n = Math.floor(sr * dur), chans = [new Float32Array(n), new Float32Array(n)];
  const kt = 1 - Math.exp((-TAU * 700) / sr);
  chans.forEach((out, ch) => {
    let l1 = 0, l2 = 0, lt = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = Math.random() * 2 - 1;
      const fc = 250 + bright * Math.exp(-t / (body * 0.7));
      const k = 1 - Math.exp((-TAU * fc) / sr);
      l1 += k * (w - l1); l2 += k * (l1 - l2);
      const cr = t < 0.003 ? w * crack * (1 - t / 0.003) : 0;
      const bodyA = (t < 0.0006 ? t / 0.0006 : 1) * Math.exp(-t / body);
      ph += (TAU * f0 * (0.35 + 0.65 * Math.exp(-t / 0.025))) / sr;
      lt += kt * (w - lt);
      const tl = lt * tail * 1.6 * Math.exp(-t / (tail * 0.45)) * Math.min(1, t / 0.015);
      out[i] = Math.tanh((cr + l2 * 3.2 * bodyA + Math.sin(ph) * Math.exp(-t / (body * 1.3)) * 1.1 + tl) * 1.7);
    }
    const dry = out.slice(), d1 = Math.floor(sr * echo * (ch ? 1.17 : 1)), d2 = Math.floor(sr * echo * (ch ? 2.1 : 2.45));
    let e = 0;
    for (let i = 0; i < n; i++) {
      e += 0.18 * ((i >= d1 ? dry[i - d1] : 0) - e);
      out[i] += e * 0.4 + (i >= d2 ? dry[i - d2] * 0.1 : 0);
    }
  });
  for (const c of chans) fadeEdges(c, sr, 0.0001, 0.05);
  return chans;
}

// Breaking glass (stereo): sharp crack followed by randomly timed shard tinkles.
function renderGlass(sr, dur = 1.4) {
  const n = Math.floor(sr * dur), L = new Float32Array(n), R = new Float32Array(n);
  const crack = biquad(white(Math.floor(sr * 0.05)), 'hp', 2500, 0.7, sr);
  for (let i = 0; i < crack.length; i++) { const e = Math.exp(-i / (sr * 0.008)); L[i] += crack[i] * e; R[i] += crack[i] * e * 0.9; }
  for (let s = 0; s < 34; s++) {
    const t0 = Math.pow(Math.random(), 2.2) * (dur - 0.35), i0 = Math.floor(t0 * sr);
    const f = rnd(2800, 9000), d = rnd(0.02, 0.09), amp = rnd(0.15, 0.5) * Math.exp(-t0 * 1.5), pan = Math.random();
    const w1 = (TAU * f) / sr, w2 = (TAU * f * rnd(1.4, 1.7)) / sr, len = Math.min(n - i0, Math.floor(d * 6 * sr));
    for (let i = 0; i < len; i++) {
      const v = amp * Math.exp(-i / (d * sr)) * (Math.sin(w1 * i) + 0.5 * Math.sin(w2 * i));
      L[i0 + i] += v * (1 - pan); R[i0 + i] += v * pan;
    }
  }
  return [fadeEdges(L, sr), fadeEdges(R, sr)];
}

// Church bell: inharmonic partials (hum, prime, tierce, quint, nominal...) as slowly beating doublets.
function renderBell(sr, f0, dur, dscale) {
  const P = [[0.5, 0.55, 7], [1, 0.8, 4.5], [1.19, 0.5, 3.4], [1.5, 0.32, 2.8], [2, 0.75, 3.2], [2.5, 0.28, 1.9], [3, 0.22, 1.5], [4.2, 0.12, 0.9]];
  const n = Math.floor(sr * dur), a = new Float32Array(n);
  for (const [r, amp, d] of P) {
    for (const [det, am] of [[0, 1], [0.6 + 0.4 * r, 0.35]]) {
      const w = (TAU * (f0 * r + det)) / sr, k = 2 * Math.cos(w), dec = Math.exp(-1 / (d * dscale * sr));
      let y1 = Math.sin(-w), y2 = Math.sin(-2 * w), e = amp * am;
      for (let i = 0; i < n; i++) { const y = k * y1 - y2; y2 = y1; y1 = y; a[i] += y * e; e *= dec; }
    }
  }
  const nz = biquad(white(Math.floor(sr * 0.04)), 'bp', f0 * 4, 2, sr);
  for (let i = 0; i < nz.length; i++) a[i] += nz[i] * 0.6 * Math.exp(-i / (sr * 0.006));
  return fadeEdges(a, sr, 0.002, 0.3);
}

// Night crickets (stereo loop): chirping field crickets plus a soft tree-cricket trill.
function renderCrickets(sr, dur = 6) {
  const n = Math.floor(sr * dur), L = new Float32Array(n), R = new Float32Array(n);
  for (let c = 0; c < 7; c++) {
    const w = (TAU * rnd(3900, 5200)) / sr, chirps = 4 + Math.floor(Math.random() * 9), period = dur / chirps;
    const pulses = 2 + Math.floor(Math.random() * 3), gap = rnd(0.028, 0.045), plen = Math.floor(rnd(0.012, 0.02) * sr);
    const amp = rnd(0.25, 1), pan = Math.random(), off = Math.random() * period;
    for (let k = 0; k < chirps; k++) {
      for (let p = 0; p < pulses; p++) {
        const i0 = Math.floor(((off + k * period + p * gap) % dur) * sr);
        for (let i = 0; i < plen; i++) {
          const e = Math.sin((Math.PI * i) / plen), v = amp * e * e * Math.sin(w * (i0 + i)), j = (i0 + i) % n;
          L[j] += v * (1 - pan); R[j] += v * pan;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) { // 2900 Hz carrier, 45 Hz pulses: whole cycles per loop
    const t = i / sr, v = 0.12 * Math.sin(TAU * 2900 * t) * Math.max(0, Math.sin(TAU * 45 * t));
    L[i] += v; R[i] += v;
  }
  return [L, R];
}

// Summer cicadas ("chicharras", stereo loop): pulsed band-limited buzz with slow swells.
function renderCicadas(sr, dur = 4) {
  const n = Math.floor(sr * dur), out = [];
  for (const [f, am, sw] of [[5600, 220, 1], [6800, 190, 2]]) {
    const nz = biquad(biquad(white(n), 'bp', f, 3, sr), 'bp', f, 3, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr, pulse = 0.5 + 0.5 * Math.sin(TAU * am * t), swell = 0.35 + 0.65 * (0.5 - 0.5 * Math.cos((TAU * sw * t) / dur));
      nz[i] *= pulse * pulse * swell;
    }
    out.push(nz);
  }
  return out;
}

// Stork bill-clattering (crotoreo): accelerating wooden double clacks.
function renderStork(sr, dur = 1.7) {
  const n = Math.floor(sr * dur), imp = new Float32Array(n);
  let t = 0.02;
  while (t < dur - 0.1) {
    const i = Math.floor(t * sr), a = rnd(0.6, 1) * Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.45);
    imp[i] += a; imp[Math.min(n - 1, i + Math.floor(sr * 0.004))] -= a * 0.7;
    t += 1 / lerp(8, 15, Math.min(1, t / 0.6)) * rnd(0.9, 1.1);
  }
  const b1 = biquad(imp.slice(), 'bp', 1350, 7, sr), b2 = biquad(imp.slice(), 'bp', 2600, 9, sr), b3 = biquad(imp, 'bp', 620, 5, sr);
  for (let i = 0; i < n; i++) b1[i] = b1[i] + 0.6 * b2[i] + 0.8 * b3[i];
  return fadeEdges(b1, sr);
}

// Gravel crunch loop: dense random grit impulses, band-limited.
function renderGravel(sr, dur = 2) {
  const n = Math.floor(sr * dur), a = new Float32Array(n), dec = Math.exp(-1 / (sr * 0.0015));
  let e = 0;
  for (let i = 0; i < n; i++) {
    if (Math.random() < 450 / sr) e = Math.pow(Math.random(), 2.5);
    e *= dec;
    a[i] = e * (Math.random() * 2 - 1);
  }
  biquad(a, 'bp', 2200, 0.7, sr);
  return loopify(biquad(a, 'hp', 500, 0.7, sr), 1024);
}

// Reverb impulse response: pre-delay, early taps and a darkening exponential tail.
function renderIR(sr, dur = 2.2) {
  const n = Math.floor(sr * dur), pre = Math.floor(sr * 0.012), out = [];
  for (let c = 0; c < 2; c++) {
    const a = new Float32Array(n);
    for (let i = pre; i < n; i++) { const t = (i - pre) / sr; a[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * t) / 1.9); }
    for (let k = 0; k < 6; k++) a[pre + Math.floor(sr * rnd(0.005, 0.08))] += rnd(-0.7, 0.7);
    out.push(biquad(a, 'lp', 4200, 0.6, sr));
  }
  return out;
}

// Recipes rendered on demand by the bank (arrays: mono; array of arrays: stereo).
const RECIPES = {
  white: (sr) => white(sr * 2),
  pink: (sr) => loopify(pink(sr * 3 + 2048), 2048),
  brown: (sr) => loopify(brown(sr * 4 + 4096), 4096),
  kick808: (sr) => renderKick(sr, { f0: 110, f1: 44, pd: 0.06, ad: 0.55, dur: 1.1, click: 0.2, drive: 1.8 }),
  kick: (sr) => renderKick(sr, { f0: 160, f1: 52, pd: 0.035, ad: 0.28, dur: 0.45, click: 0.5, drive: 2 }),
  snare: (sr) => renderDrum(sr, { dur: 0.35, tone: 190, tone2: 330, td: 0.05, nd: 0.11, tl: 0.5, nl: 0.9, hp: 900 }),
  snareUrb: (sr) => renderDrum(sr, { dur: 0.22, tone: 240, td: 0.03, nd: 0.06, tl: 0.35, nl: 1, hp: 1800, lp: 10000 }),
  rim: (sr) => renderDrum(sr, { dur: 0.08, tone: 1700, tone2: 2500, td: 0.012, nd: 0.006, tl: 0.9, nl: 0.4, pitchDrop: 0, hp: 2000 }),
  hat: (sr) => renderMetal(sr, { dur: 0.12, decay: 0.035 }),
  hatOpen: (sr) => renderMetal(sr, { dur: 0.5, decay: 0.16 }),
  crash: (sr) => renderMetal(sr, { dur: 2.2, decay: 0.7, noiseMix: 0.75, hp: 4000, base: 1.3 }),
  tomHi: (sr) => renderDrum(sr, { dur: 0.4, tone: 190, td: 0.18, nd: 0.05, tl: 1, nl: 0.25, pitchDrop: 0.5, hp: 300, lp: 5000 }),
  tomLo: (sr) => renderDrum(sr, { dur: 0.5, tone: 120, td: 0.24, nd: 0.05, tl: 1, nl: 0.25, pitchDrop: 0.5, hp: 200, lp: 4000 }),
  palmaClara: (sr) => renderClap(sr, { bp: 2300, q: 1.6, dur: 0.16, tail: 0.035, bursts: 2 }),
  palmaSorda: (sr) => renderClap(sr, { bp: 800, q: 1.2, dur: 0.14, tail: 0.03, bursts: 1 }),
  clap: (sr) => renderClap(sr, { bp: 1300, q: 1.1 }),
  cajonBass: (sr) => renderDrum(sr, { dur: 0.35, tone: 78, td: 0.12, nd: 0.03, tl: 1, nl: 0.35, pitchDrop: 0.6, hp: 100, lp: 1200 }),
  cajonSlap: (sr) => renderDrum(sr, { dur: 0.25, tone: 260, td: 0.03, nd: 0.09, tl: 0.4, nl: 0.9, hp: 1200, lp: 7000, bp: 3000, q: 0.6 }),
  golpe: (sr) => renderDrum(sr, { dur: 0.1, tone: 150, td: 0.025, nd: 0.02, tl: 0.8, nl: 0.7, hp: 300, lp: 4000 }),
  explosion: (sr) => renderExplosion(sr),
  gunPistol: (sr) => renderGun(sr, { dur: 1.1, body: 0.032, f0: 185, tail: 0.3, bright: 5800, crack: 0.9, echo: 0.11 }),
  gunSmg: (sr) => renderGun(sr, { dur: 0.6, body: 0.022, f0: 220, tail: 0.14, bright: 6600, crack: 0.8, echo: 0.09 }),
  gunShotgun: (sr) => renderGun(sr, { dur: 1.7, body: 0.07, f0: 115, tail: 0.55, bright: 4300, crack: 1.1, echo: 0.13 }),
  gunRifle: (sr) => renderGun(sr, { dur: 2.4, body: 0.045, f0: 150, tail: 0.8, bright: 7600, crack: 1.35, echo: 0.24 }),
  glass: (sr) => renderGlass(sr),
  bell: (sr) => renderBell(sr, 262, 7.5, 1),
  bellSmall: (sr) => renderBell(sr, 523, 3.5, 0.45),
  crickets: (sr) => renderCrickets(sr),
  cicadas: (sr) => renderCicadas(sr),
  stork: (sr) => renderStork(sr),
  gravel: (sr) => renderGravel(sr),
  ir: (sr) => renderIR(sr),
};

// ───────────────────────────── 3. Sound bank ─────────────────────────────

// Dark or band-limited material is rendered at half rate: half the memory and render time.
const HALF_RATE = new Set(['brown', 'bell', 'bellSmall', 'crickets', 'cicadas', 'stork']);

class Bank {
  constructor(ctx) { this.ctx = ctx; this.sr = ctx.sampleRate; this.cache = new Map(); this.queue = []; }

  _make(data, norm, sr = this.sr) {
    const chans = Array.isArray(data) ? data : [data];
    const len = chans[0].length, b = this.ctx.createBuffer(chans.length, len, sr);
    let peak = 0;
    for (const c of chans) for (let i = 0; i < len; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
    const k = norm && peak > 1e-9 ? norm / peak : 1;
    chans.forEach((c, ch) => { if (k !== 1) for (let i = 0; i < len; i++) c[i] *= k; b.getChannelData(ch).set(c); });
    return b;
  }

  get(name) {
    let b = this.cache.get(name);
    if (!b && RECIPES[name]) {
      const sr = HALF_RATE.has(name) ? this.sr / 2 : this.sr;
      b = this._make(RECIPES[name](sr), name === 'ir' ? 0 : 0.9, sr); // the IR keeps its level (the convolver normalises)
      this.cache.set(name, b);
    }
    return b || null;
  }

  // Karplus-Strong note (half rate: nylon is dark) cached per pitch and brightness step.
  pluck(midi, bright = 0.5) {
    const m = Math.round(clamp(num(midi, 60), 28, 96)), bq = Math.round(clamp(bright, 0, 1) * 4) / 4, key = `p${m}:${bq}`;
    let b = this.cache.get(key);
    if (!b) { b = this._make(renderPluck(this.sr / 2, mtof(m), { dur: m < 50 ? 2.4 : 1.8, bright: bq }), 0.8, this.sr / 2); this.cache.set(key, b); }
    return b;
  }

  warm(list) { for (const x of list) this.queue.push(x); }

  // Render one queued item.
  step() {
    const x = this.queue.shift();
    if (x === undefined) return;
    if (typeof x === 'string') this.get(x); else this.pluck(x[0], x[1]);
  }
}

// A Kit owns a set of nodes and sources and disconnects everything once all sources ended.
class Kit {
  constructor(ctx) { this.c = ctx; this.nodes = []; this.srcs = []; this.live = 0; this.onDone = null; this.dead = false; }
  add(n) { this.nodes.push(n); return n; }
  gain(v = 1) { const g = this.c.createGain(); g.gain.value = num(v, 1); return this.add(g); }
  filter(type, f, q = 0.707, db = 0) {
    const b = this.c.createBiquadFilter();
    b.type = type; b.frequency.value = num(f, 1000); b.Q.value = num(q, 0.707); b.gain.value = num(db);
    return this.add(b);
  }
  shaper(curve) { const s = this.c.createWaveShaper(); s.curve = curve; s.oversample = '2x'; return this.add(s); }
  pan(v = 0) {
    if (this.c.createStereoPanner) { const p = this.c.createStereoPanner(); p.pan.value = clamp(num(v), -1, 1); return this.add(p); }
    const g = this.gain(1); // fallback: no panning support
    g.pan = { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} };
    return g;
  }
  _track(s) {
    this.srcs.push(s); this.live++;
    s.onended = () => { s._done = true; if (--this.live <= 0) this.dispose(); };
    return s;
  }
  osc(type, f, t0, t1, wave) {
    const o = this._track(this.c.createOscillator());
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.value = num(f, 440);
    o.start(Math.max(0, t0));
    if (t1 !== undefined) o.stop(Math.max(t0, t1));
    return o;
  }
  buf(buffer, t0, t1, rate = 1, loop = false, offset = 0) {
    const s = this._track(this.c.createBufferSource());
    s.buffer = buffer; s.loop = loop; s.playbackRate.value = clamp(num(rate, 1), 0.05, 16);
    s.start(Math.max(0, t0), loop ? offset % buffer.duration : Math.min(offset, buffer.duration * 0.99));
    if (t1 !== undefined) s.stop(Math.max(t0, t1));
    return s;
  }
  stop(t) { for (const s of this.srcs) if (!s._done) { try { s.stop(Math.max(0, t)); } catch (e) { /* not started */ } } }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const n of this.srcs) n.disconnect();
    for (const n of this.nodes) n.disconnect();
    this.srcs.length = 0; this.nodes.length = 0;
    if (this.onDone) this.onDone(this);
  }
}

// Soft (optionally asymmetric) saturation curve.
function satCurve(k, asym = 0, n = 1024) {
  const c = new Float32Array(n), norm = Math.tanh(k * (1 + asym));
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * (x + asym * x * x)) / norm; }
  return c;
}

// ───────────────────────────── 4. Player engine ─────────────────────────────
// Source: a PeriodicWave at the engine-cycle frequency (rpm/120). Harmonics at multiples of the
// cylinder count are the firing orders; the other orders give per-cylinder roughness. Chain:
// load-dependent drive → asymmetric soft-clipper (hardness per type) → throttle-controlled
// low-pass → fixed exhaust resonances.
// Extras: firing-synchronous intake noise, sub thump, cycle jitter, transmission whine.

const ENGINES = {
  car:     { cyl: 4, idle: 850, red: 6500, lp: [420, 3800], drive: 1.8, tilt: 1.0, rough: 0.28, noise: 1.2, nf: [500, 3200], nq: 1.2, am: 0.6, sub: 0.35, whine: 0.018, res: [140, 430], vol: 0.5, pops: 0.35 },
  suv:     { cyl: 6, idle: 750, red: 5800, lp: [360, 3000], drive: 1.6, tilt: 1.1, rough: 0.22, noise: 0.95, nf: [400, 2600], nq: 1.1, am: 0.5, sub: 0.45, whine: 0.022, res: [110, 340], vol: 0.48, pops: 0.1 },
  van:     { cyl: 4, idle: 800, red: 4600, lp: [320, 2300], drive: 2.4, tilt: 0.85, rough: 0.35, noise: 1.9, nf: [900, 2600], nq: 2.2, am: 0.85, sub: 0.4, whine: 0.035, res: [120, 520], vol: 0.5, pops: 0, knock: 0.3 },
  police:  { cyl: 4, idle: 900, red: 7000, lp: [500, 4600], drive: 2.4, tilt: 0.95, rough: 0.3, noise: 1.35, nf: [600, 3800], nq: 1.3, am: 0.6, sub: 0.35, whine: 0.025, res: [160, 480], vol: 0.5, pops: 0.4 },
  tractor: { cyl: 3, idle: 650, red: 2300, lp: [200, 1300], drive: 3.0, tilt: 0.75, rough: 0.45, noise: 2.4, nf: [700, 1800], nq: 2.5, am: 0.95, sub: 0.75, whine: 0.008, res: [85, 260], vol: 0.5, pops: 0, knock: 0.35 },
  old:     { cyl: 4, idle: 920, red: 5200, lp: [380, 2700], drive: 2.1, tilt: 0.88, rough: 0.55, noise: 1.7, nf: [700, 2900], nq: 1.9, am: 0.85, sub: 0.28, whine: 0.008, res: [150, 520], vol: 0.52, pops: 0.25 },
  diesel:  { cyl: 4, idle: 720, red: 4200, lp: [280, 2000], drive: 2.6, tilt: 0.8, rough: 0.45, noise: 2.2, nf: [800, 2200], nq: 2.3, am: 0.9, sub: 0.5, whine: 0.02, res: [100, 400], vol: 0.52, pops: 0, knock: 0.4 },
  moto:    { cyl: 1, idle: 1500, red: 10500, lp: [700, 5200], drive: 2.6, tilt: 0.9, rough: 0.7, noise: 1.8, nf: [900, 4200], nq: 1.6, am: 0.9, sub: 0.15, whine: 0.01, res: [260, 900], vol: 0.44, pops: 0.5 },
  sport:   { cyl: 6, idle: 950, red: 8200, lp: [650, 6500], drive: 3.2, tilt: 0.85, rough: 0.4, noise: 1.5, nf: [900, 5200], nq: 1.4, am: 0.65, sub: 0.25, whine: 0.015, res: [220, 700], vol: 0.5, pops: 0.9 },
};

function engineWave(ctx, s) {
  const N = 96, re = new Float32Array(N + 1), im = new Float32Array(N + 1), r = makeRng(s.cyl * 7919 + s.idle);
  for (let k = 1; k <= N; k++) {
    const firing = k % s.cyl === 0, half = s.cyl % 2 === 0 && k % (s.cyl / 2) === 0;
    let a = Math.pow(Math.max(k / s.cyl, 0.5), -s.tilt);
    a *= firing ? 1 : half ? s.rough * 1.3 : s.rough * 0.45 * (0.5 + r());
    const ph = r() * TAU;
    re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph);
  }
  return ctx.createPeriodicWave(re, im);
}

// Narrow pulse (duty ~30%) used to gate noise in sync with the firing pulses.
function pulseWave(ctx, duty = 0.3, N = 24) {
  const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}

class Engine {
  constructor(A, type) {
    const c = A.ctx, s = (this.spec = ENGINES[type] || ENGINES.car), k = (this.k = new Kit(c)), t = c.currentTime;
    this.type = type;
    this.out = k.gain(0);
    this.out.connect(A.engineBus);
    // Combustion core
    this.osc = k.osc('custom', s.idle / 120, t, undefined, A.wave(type, () => engineWave(c, s)));
    this.drive = k.gain(0.5);
    const shaper = k.shaper(A.curve('eng_' + type, () => satCurve(s.drive, 0.18))), post = (this.post = k.gain(1)), hp = k.filter('highpass', 28);
    this.lp = k.filter('lowpass', s.lp[0], 1.1);
    const r1 = k.filter('peaking', s.res[0], 1.4, 5), r2 = k.filter('peaking', s.res[1], 2, 4);
    this.main = k.gain(0.6);
    this.osc.connect(this.drive); this.drive.connect(shaper); shaper.connect(post); post.connect(hp);
    hp.connect(this.lp); this.lp.connect(r1); r1.connect(r2); r2.connect(this.main); this.main.connect(this.out);
    // Intake / valve noise gated by a pulse at the firing frequency
    const noise = k.buf(A.bank.get('white'), t, undefined, 1, true, Math.random() * 2);
    this.nbp = k.filter('bandpass', s.nf[0], s.nq);
    const depth = s.am / 1.43, nam = k.gain(1 - depth), amd = k.gain(depth);
    this.ng = k.gain(0);
    this.pulse = k.osc('custom', (s.idle / 120) * s.cyl, t, undefined, A.wave('pulse', () => pulseWave(c)));
    noise.connect(this.nbp); this.nbp.connect(nam); nam.connect(this.ng); this.ng.connect(this.out);
    this.pulse.connect(amd); amd.connect(nam.gain);
    // Sub thump (through the high-pass and exhaust resonances) and transmission whine
    this.sub = k.osc('sine', (s.idle / 120) * s.cyl, t); this.sg = k.gain(0);
    this.sub.connect(this.sg); this.sg.connect(hp);
    this.wh = k.osc('triangle', 60, t); this.wg = k.gain(0);
    this.wh.connect(this.wg); this.wg.connect(this.out);
    // Cycle-to-cycle jitter (slow brown noise into detune, in cents)
    const jit = k.buf(A.bank.get('brown'), t, undefined, 1, true, Math.random() * 3), jg = k.gain(10 + 30 * s.rough);
    jit.connect(jg); jg.connect(this.osc.detune); jg.connect(this.pulse.detune); jg.connect(this.sub.detune);
  }

  apply(st, t) {
    const s = this.spec, rpm = clamp(num(st.rpm), 0, 1.1), th = clamp(num(st.throttle), 0, 1);
    const load = clamp(num(st.load, th), 0, 1), spd = Math.abs(num(st.speed));
    const cyc = (s.idle + (s.red - s.idle) * rpm) / 120, fire = cyc * s.cyl;
    glide(this.osc.frequency, cyc, t, 0.045, 0.01);
    glide(this.pulse.frequency, fire, t, 0.045, 0.01);
    glide(this.sub.frequency, fire, t, 0.045, 0.01);
    const open = clamp(0.12 + 0.4 * rpm + 0.55 * th * (0.35 + 0.65 * rpm), 0, 1);
    glide(this.lp.frequency, s.lp[0] * Math.pow(s.lp[1] / s.lp[0], open), t, 0.06, 1);
    const dr = 0.4 + 0.45 * th + 0.15 * load; // stays within the curve: soft, never hard clipping
    glide(this.drive.gain, dr, t, 0.06);
    glide(this.post.gain, 1 / (0.55 + 0.45 * dr), t, 0.06);
    const overrun = (1 - th) * smooth(0.25, 0.7, rpm); // lifting off at high revs
    glide(this.main.gain, 0.55 + 0.25 * rpm + 0.35 * th - 0.25 * overrun, t, 0.05);
    glide(this.nbp.frequency, lerp(s.nf[0], s.nf[1], rpm), t, 0.06, 1);
    glide(this.ng.gain, s.noise * ((0.25 + 0.75 * th) * (0.45 + 0.55 * rpm) + 0.3 * overrun + (s.knock || 0)), t, 0.05); // knock: diesel clatter
    glide(this.sg.gain, s.sub * (0.6 + 0.4 * load) * (1 - 0.55 * rpm), t, 0.06);
    glide(this.wh.frequency, 40 + spd * 55, t, 0.08, 0.5);
    glide(this.wg.gain, s.whine * clamp(spd / 35, 0, 1) * (0.6 + 0.4 * (1 - th)), t, 0.1);
    glide(this.out.gain, s.vol, t, 0.12);
  }

  stop(t) {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.1);
    this.k.stop(t + 0.7);
  }
}

// ─────────────────────── 5. Continuous beds, horn and sirens ───────────────────────

// A bed is built on first use and torn down after a few seconds of silence.
class Bed {
  constructor(A, build) { this.A = A; this.build = build; this.target = 0; this.n = null; this.idle = 0; }
  set(v) { this.target = clamp(num(v), 0, 1); }
  update(dt, t) {
    if (this.target > 0.002) { this.idle = 0; if (!this.n) this.n = this.build(this.A, t); }
    else if (this.n && (this.idle += dt) > 2.5) { this.n.k.stop(t); this.n = null; return; }
    if (this.n) this.n.apply(this.target, t);
  }
}

// Tyre squeal: two resonant noise bands plus a wobbling tonal squeal.
function bedSkid(A, t) {
  const k = new Kit(A.ctx), out = k.gain(0);
  const src = k.buf(A.bank.get('white'), t, undefined, 1, true, Math.random() * 2);
  const b1 = k.filter('bandpass', 1500, 9), b2 = k.filter('bandpass', 2350, 14);
  const tone = k.osc('sawtooth', 1050, t), tf = k.filter('bandpass', 1050, 6), tg = k.gain(0.25);
  const vib = k.osc('sine', 7.3, t), vg = k.gain(35);
  src.connect(b1); src.connect(b2); b1.connect(out); b2.connect(out);
  tone.connect(tf); tf.connect(tg); tg.connect(out); vib.connect(vg); vg.connect(tone.frequency);
  out.connect(A.world);
  return { k, apply(v, t) {
    const sp = clamp(A._speed / 30, 0, 1);
    glide(out.gain, Math.pow(v, 1.4) * 0.3, t, 0.04);
    glide(b1.frequency, 1300 + 400 * Math.random() + 300 * sp, t, 0.06, 1);
    glide(b2.frequency, 2100 + 500 * Math.random(), t, 0.06, 1);
    glide(tone.frequency, 950 + 250 * sp + 60 * Math.random(), t, 0.08, 1);
  } };
}

// Dirt / gravel: low rumble plus a crunch loop whose rate follows speed.
function bedOffroad(A, t) {
  const k = new Kit(A.ctx), out = k.gain(0);
  const rum = k.buf(A.bank.get('brown'), t, undefined, 1, true, Math.random() * 3), rl = k.filter('lowpass', 420, 0.9), rg = k.gain(0.8);
  const grv = k.buf(A.bank.get('gravel'), t, undefined, 1, true, Math.random()), gf = k.filter('bandpass', 1700, 0.8), gg = k.gain(0.5);
  rum.connect(rl); rl.connect(rg); rg.connect(out); grv.connect(gf); gf.connect(gg); gg.connect(out);
  out.connect(A.world);
  return { k, apply(v, t) {
    const sp = clamp(A._speed / 25, 0, 1.5);
    glide(out.gain, v * 0.45, t, 0.08);
    glide(grv.playbackRate, 0.55 + 0.7 * sp, t, 0.1, 0.01);
    glide(gg.gain, 0.3 + 0.5 * sp, t, 0.1);
    glide(rl.frequency, 250 + 350 * sp, t, 0.1, 1);
  } };
}

// Wind: band-passed pink noise with random gusts, plus a little high hiss.
function bedWind(A, t) {
  const k = new Kit(A.ctx), out = k.gain(0);
  const src = k.buf(A.bank.get('pink'), t, undefined, 1, true, Math.random() * 3);
  const bp = k.filter('bandpass', 500, 0.6), lp = k.filter('lowpass', 2800, 0.5), hs = k.filter('highpass', 3000), hg = k.gain(0.15);
  src.connect(bp); bp.connect(lp); lp.connect(out); src.connect(hs); hs.connect(hg); hg.connect(out);
  out.connect(A.world);
  let gust = 1;
  return { k, apply(v, t) {
    gust = clamp(gust + (Math.random() - 0.5) * 0.08, 0.65, 1.25);
    glide(out.gain, v * v * 0.5 * gust, t, 0.15);
    glide(bp.frequency, 300 + 900 * v * gust, t, 0.2, 1);
  } };
}

// Rain: the broad hiss of the drops (pink noise, its highs for the patter on the street), a low wash when it pours;
// muffled from indoors (the roof and the shutters keep the highs out)
function bedRain(A, t) {
  const k = new Kit(A.ctx), out = k.gain(0);
  const src = k.buf(A.bank.get('pink'), t, undefined, 1, true, Math.random() * 3);
  const hp = k.filter('highpass', 500, 0.5), lp = k.filter('lowpass', 7000, 0.4), body = k.gain(0.9);
  const wash = k.buf(A.bank.get('brown'), t, undefined, 1, true, Math.random() * 3), wl = k.filter('lowpass', 380, 0.7), wg = k.gain(0);
  const pat = k.buf(A.bank.get('white'), t, undefined, 1, true, Math.random() * 2), pb = k.filter('bandpass', 4200, 1.2), pg = k.gain(0.12);
  src.connect(hp); hp.connect(lp); lp.connect(body); body.connect(out);
  wash.connect(wl); wl.connect(wg); wg.connect(out);
  pat.connect(pb); pb.connect(pg); pg.connect(lp);
  out.connect(A.world);
  return { k, apply(v, t) {
    const m = A._rainMuffle;
    glide(out.gain, Math.pow(v, 0.8) * 0.42 * (m ? 0.7 : 1), t, 0.6);
    glide(lp.frequency, m ? 900 : 4500 + 3500 * v, t, 0.4, 1);
    glide(wg.gain, v * v * 0.8, t, 0.6);
  } };
}

// Two-tone car horn: slightly detuned squares, saturated and band-passed.
function makeHorn(A, t) {
  const k = new Kit(A.ctx), out = k.gain(0), mix = k.gain(0.4);
  const sh = k.shaper(A.curve('horn', () => satCurve(2.5))), bp = k.filter('bandpass', 1150, 0.8);
  const pk = k.filter('peaking', 2600, 2, 5), lp = k.filter('lowpass', 5500);
  for (const [f, det] of [[415, 0], [523, 4], [417, -7]]) { const o = k.osc('square', f, t); o.detune.value = det; o.connect(mix); }
  mix.connect(sh); sh.connect(bp); bp.connect(pk); pk.connect(lp); lp.connect(out); out.connect(A.world);
  return { k, out };
}

// Spanish police sirens. 'local': fast two-tone ~650/950 Hz; 'guardia': slow wail 600–1300 Hz.
class Siren {
  constructor(A, kind) {
    const c = A.ctx, k = (this.k = new Kit(c)), t = c.currentTime, g = kind === 'guardia';
    this.A = A; this.kind = kind; this.x = A.lis.x; this.z = A.lis.z; this.d = null; this.vr = 0;
    const center = g ? 950 : 800, depth = g ? 350 : 150;
    this.o1 = k.osc('sawtooth', center, t); this.o2 = k.osc('square', center * 1.003, t);
    const lfo = k.osc(g ? 'triangle' : 'square', g ? 0.28 : 1.05, t), ls = k.filter('lowpass', g ? 6 : 28), lg = k.gain(depth);
    lfo.connect(ls); ls.connect(lg); lg.connect(this.o1.frequency); lg.connect(this.o2.frequency);
    const m1 = k.gain(0.45), m2 = k.gain(0.3), sh = k.shaper(A.curve('siren', () => satCurve(1.8)));
    const pk = k.filter('peaking', 1700, 1.2, 6), lp = k.filter('lowpass', 4800);
    this.env = k.gain(0);
    this.o1.connect(m1); this.o2.connect(m2); m1.connect(sh); m2.connect(sh); sh.connect(pk); pk.connect(lp); lp.connect(this.env);
    this.sp = A._spatial(k, A.world, 14, 450, 0.12);
    this.env.connect(this.sp.input);
    this.env.gain.setTargetAtTime(0.32, t, 0.08);
    A._place(this.sp, this.x, this.z, t, 0, true);
  }
  pos(x, z) { this.x = num(x, this.x); this.z = num(z, this.z); }
  update(dt, t) {
    const L = this.A.lis, d = Math.hypot(this.x - L.x, this.z - L.z);
    if (this.d !== null && dt > 0) this.vr = lerp(this.vr, clamp((d - this.d) / dt, -60, 60), 0.15);
    this.d = d;
    const det = 1200 * Math.log2(343 / (343 + this.vr)); // Doppler shift in cents
    glide(this.o1.detune, det, t, 0.05, 0.5); glide(this.o2.detune, det, t, 0.05, 0.5);
    this.A._place(this.sp, this.x, this.z, t, 0.04);
  }
  stop(t) { this.env.gain.cancelScheduledValues(t); this.env.gain.setTargetAtTime(0, t, 0.12); this.k.stop(t + 0.8); }
}

// ───────────────────────────── 6. GameAudio core ─────────────────────────────

// Guitar notes worth rendering ahead of time: A-minor open chords (strums) and the melody register.
const GUITAR_WARM = [40, 41, 43, 45, 46, 47, 48, 50, 52, 53, 55, 56, 57, 59, 60, 61, 62, 64, 65, 67, 69].map((m) => [m, 0.5])
  .concat(Array.from({ length: 16 }, (_, i) => [64 + i, 0.75]));

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.bank = null;
    this.lis = { x: 0, z: 0, fx: 0, fz: 1, rx: 1, rz: 0 };
    this.yawOffset = 0; // optional yaw calibration the game may add before calling setListener()
    this._vol = { master: 0.8, music: 0.55, sfx: 0.9 };
    this._voices = [];
    this._sirens = new Map();
    this._loops = new Map(); // persistent sounds of places (a fountain's water), placed round the listener every frame
    this._waves = new Map();
    this._curves = new Map();
    this._eng = null;          // latest state passed to setEngine()
    this._engine = null;
    this._speed = 0;
    this._prevTh = 0;
    this._horn = null; this._hornOn = false; this._hornIdle = 0;
    this._pending = { skid: 0, off: 0, wind: 0, rain: 0 };
    this._beds = null;
    this._paused = false;
    this._amb = { hour: 12, town: 0.5, indoor: 0 };
    this._church = null;
    this._bellQ = [];
    this._radioOn = false;
    this._station = 0;
    this._warned = false;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  async unlock() {
    if (!AC) return false;
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch (e) { this._warn(e); }
    return this.ready;
  }

  // Builds the whole graph; this.ctx is only set once everything exists, so a failure leaves every method a no-op.
  _build() {
    const c = new AC({ latencyHint: 'interactive' });
    try { this._graph(c); } catch (e) { try { c.close(); } catch (e2) { /* ignore */ } throw e; }
    this.ctx = c;
    if (this._radioOn) this._radio.setOn(true);
    if (this._paused) this.pauseAll(true);
    this._warmUp();
  }

  // Pre-render the remaining buffers in ~8 ms slices so unlocking never stalls a frame.
  _warmUp() {
    const t0 = Date.now();
    while (this.bank.queue.length && Date.now() - t0 < 8) this.bank.step();
    if (this.bank.queue.length) setTimeout(() => this._warmUp(), 16);
  }

  _graph(c) {
    this.bank = new Bank(c);
    for (const nm of ['white', 'pink', 'brown']) this.bank.get(nm);
    const g = (v, dest) => { const n = c.createGain(); n.gain.value = v; if (dest) n.connect(dest); return n; };
    const bq = (type, f, q, db, dest) => {
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = db; b.connect(dest); return b;
    };
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    comp.connect(c.destination);
    this.master = g(this._vol.master, comp);
    this.sfxVol = g(this._vol.sfx, this.master);
    this.musicVol = g(this._vol.music, this.master);
    this.world = g(1, this.sfxVol);      // everything in the game world (ducked on pause)
    this.ui = g(1, this.sfxVol);         // menu sounds: never ducked
    this.engineBus = g(0.75, this.world);
    this.ambBus = g(0.25, this.world);
    // Shared reverb send
    this.revIn = g(1);
    const rev = c.createConvolver();
    rev.buffer = this.bank.get('ir');
    this.revIn.connect(rev); rev.connect(g(0.8, this.world));
    // Radio chain: gentle saturation and band-limiting like car speakers, then on/off gain and pause duck
    this.musicDuck = g(1, this.musicVol);
    this.radioGain = g(0, this.musicDuck);
    const lp = bq('lowpass', 6500, 0.6, 0, this.radioGain), pk = bq('peaking', 1800, 0.8, 2.5, lp), hp = bq('highpass', 55, 0.7, 0, pk);
    const sat = c.createWaveShaper(); sat.curve = satCurve(1.4); sat.oversample = '2x'; sat.connect(hp);
    this.radioIn = g(0.45, sat); // keeps the mix inside the soft part of the saturation curve
    this._beds = { skid: new Bed(this, bedSkid), off: new Bed(this, bedOffroad), wind: new Bed(this, bedWind), rain: new Bed(this, bedRain) };
    for (const key of Object.keys(this._pending)) this._beds[key].set(this._pending[key]);
    this._ambient = new Ambient(this);
    this._radio = new Radio(this);
    this.bank.warm(['gunPistol', 'gravel', 'crickets', 'cicadas', 'explosion', 'gunSmg', 'gunShotgun', 'gunRifle', 'glass', 'bell', 'bellSmall', 'stork', 'golpe', 'palmaClara', 'palmaSorda',
      'cajonBass', 'cajonSlap', 'kick', 'kick808', 'snare', 'snareUrb', 'hat', 'hatOpen', 'crash', 'clap', 'rim', 'tomHi', 'tomLo']);
    this.bank.warm(GUITAR_WARM);
  }

  curve(key, make) { let v = this._curves.get(key); if (!v) { v = make(); this._curves.set(key, v); } return v; }
  wave(key, make) { let v = this._waves.get(key); if (!v) { v = make(); this._waves.set(key, v); } return v; }

  _warn(e) { if (!this._warned) { this._warned = true; if (typeof console !== 'undefined') console.warn('[GameAudio]', e); } }
  _safe(fn) { if (!this.ctx) return; try { fn(); } catch (e) { this._warn(e); } }

  // ── Mix ──
  setVolumes(v) {
    if (!v) return;
    for (const key of ['master', 'music', 'sfx']) if (v[key] !== undefined) this._vol[key] = clamp(num(v[key], this._vol[key]), 0, 1);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    glide(this.master.gain, this._vol.master, t, 0.03);
    glide(this.musicVol.gain, this._vol.music, t, 0.03);
    glide(this.sfxVol.gain, this._vol.sfx, t, 0.03);
  }

  pauseAll(on) {
    this._paused = !!on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    glide(this.world.gain, this._paused ? 0.06 : 1, t, 0.08);
    glide(this.musicDuck.gain, this._paused ? 0.25 : 1, t, 0.1);
  }

  // ── Listener & spatialisation ──
  setListener(x, z, yaw) {
    const L = this.lis, y = num(yaw, 0);
    L.x = num(x, L.x); L.z = num(z, L.z);
    // game convention: forward (sin y, cos y), right-hand side (-cos y, sin y)
    L.fx = Math.sin(y); L.fz = Math.cos(y); L.rx = -Math.cos(y); L.rz = Math.sin(y);
  }

  // Positional chain: low-pass (air + behind-the-head) → stereo pan → distance gain → dest.
  _spatial(k, dest, ref = REF_DIST, max = MAX_DIST, rev = 0) {
    const lp = k.filter('lowpass', 18000, 0.5), pan = k.pan(0), g = k.gain(0);
    lp.connect(pan); pan.connect(g); g.connect(dest);
    const sp = { input: lp, lp, pan, g, ref, max, rev, send: null };
    if (rev > 0) { sp.send = k.gain(0); lp.connect(sp.send); sp.send.connect(this.revIn); }
    return sp;
  }

  _place(sp, x, z, t, tc = 0.05, init = false) {
    const L = this.lis, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    let g = d <= sp.ref ? 1 : sp.ref / (sp.ref + (d - sp.ref));
    g *= 1 - smooth(sp.max * 0.6, sp.max, d);
    const inv = d > 1e-3 ? 1 / d : 0;
    const side = (dx * L.rx + dz * L.rz) * inv, front = (dx * L.fx + dz * L.fz) * inv;
    const pan = clamp(side * 0.85 * clamp(d / 2.5, 0, 1), -1, 1);
    const cut = clamp((18000 / (1 + d / 45)) * (1 - 0.4 * Math.max(0, -front)), 400, 18000);
    const set = (p, v, eps) => { if (init) { p.value = v; p._last = v; } else glide(p, v, t, tc, eps); };
    set(sp.g.gain, g, 1e-4); set(sp.pan.pan, pan, 0.005); set(sp.lp.frequency, cut, 5);
    if (sp.send) set(sp.send.gain, sp.rev * Math.sqrt(g), 1e-3); // distant sounds are relatively wetter
  }

  // ── Voices (one-shots) ──
  _voice(o, dest) {
    const c = this.ctx, t = c.currentTime;
    if (this._voices.length >= MAX_VOICES) this._steal(t);
    const k = new Kit(c), v = { k, t, out: k.gain(clamp(num(o.vol, 1), 0, 2)), sp: null, x: 0, z: 0 };
    if (o.x !== undefined || o.z !== undefined) {
      v.x = num(o.x, this.lis.x); v.z = num(o.z, this.lis.z);
      v.sp = this._spatial(k, dest, o.ref || REF_DIST, o.max || MAX_DIST, o.rev || 0);
      v.out.connect(v.sp.input);
      this._place(v.sp, v.x, v.z, t, 0, true);
    } else {
      v.out.connect(dest);
      if (o.rev) { const s = k.gain(o.rev); v.out.connect(s); s.connect(this.revIn); }
    }
    k.onDone = () => { const i = this._voices.indexOf(v); if (i >= 0) this._voices.splice(i, 1); };
    this._voices.push(v);
    return v;
  }

  _steal(t) {
    const v = this._voices.shift(); // oldest first
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0, t, 0.01);
    v.k.stop(t + 0.06);
  }

  // ── Frame update ──
  update(dt) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      dt = clamp(num(dt, 0.016), 0, 0.25);
      const st = this._eng;
      if (st) {
        if (!this._engine || this._engine.type !== st.type) { if (this._engine) this._engine.stop(t); this._engine = new Engine(this, st.type); }
        this._engine.apply(st, t);
        this._speed = Math.abs(st.speed);
        this._backfire(st, t);
      }
      for (const key in this._beds) this._beds[key].update(dt, t);
      if (this._horn && !this._hornOn && (this._hornIdle += dt) > 0.6) { this._horn.k.stop(t); this._horn = null; }
      for (const s of this._sirens.values()) s.update(dt, t);
      for (const v of this._voices) if (v.sp && t - v.t > 0.25) this._place(v.sp, v.x, v.z, t, 0.06);
      for (const L of this._loops.values()) { this._place(L.sp, L.x, L.z, t, 0.12); glide(L.out.gain, this._paused ? 0 : L.vol * (L.on ? 1 : 0), t, 0.4); }
      this._ambient.update(dt, t);
      this._bellTick(t);
    } catch (e) { this._warn(e); }
  }

  // ── Player vehicle ──
  setEngine(st) {
    if (!st) {
      this._eng = null;
      if (this._engine) { this._engine.stop(this.ctx.currentTime); this._engine = null; }
      return;
    }
    const e = this._eng || (this._eng = {});
    e.type = ENGINES[st.type] ? st.type : 'car';
    e.rpm = clamp(num(st.rpm), 0, 1.1); e.throttle = clamp(num(st.throttle), 0, 1);
    e.speed = num(st.speed); e.load = clamp(num(st.load, e.throttle), 0, 1);
  }

  // Overrun crackle: lifting off sharply at high revs pops the exhaust (sporty engines only).
  _backfire(st, t) {
    const s = this._engine.spec;
    if (s.pops && this._prevTh > 0.65 && st.throttle < 0.15 && st.rpm > 0.55 && Math.random() < s.pops) {
      let tt = t + 0.05;
      for (let i = 2 + Math.floor(Math.random() * 4); i > 0; i--, tt += rnd(0.05, 0.16)) this._pop(tt);
    }
    this._prevTh = st.throttle;
  }

  _pop(t) {
    const v = this._voice({ vol: rnd(0.25, 0.55) }, this.engineBus), k = v.k;
    const n = k.buf(this.bank.get('white'), t, t + 0.08, 1, true, Math.random() * 1.5), bp = k.filter('bandpass', rnd(700, 1600), 0.9);
    const th = k.osc('sine', 90, t, t + 0.08);
    chain(n, bp, eg(v, t, 1, 0.001, 0.03), v.out);
    chain(th, eg(v, t, 0.8, 0.001, 0.04), v.out);
  }

  setSkid(v) { this._setBed('skid', v); }
  setOffroad(v) { this._setBed('off', v); }
  setWind(v) { this._setBed('wind', v); }
  setRain(v, muffled = false) { this._rainMuffle = !!muffled; this._setBed('rain', v); }
  _setBed(key, v) { this._pending[key] = clamp(num(v), 0, 1); if (this._beds) this._beds[key].set(this._pending[key]); }

  horn(on) {
    this._hornOn = !!on;
    this._safe(() => {
      const t = this.ctx.currentTime;
      if (this._hornOn) {
        if (!this._horn) this._horn = makeHorn(this, t);
        glide(this._horn.out.gain, 0.2, t, 0.008);
        this._hornIdle = 0;
      } else if (this._horn) glide(this._horn.out.gain, 0, t, 0.025);
    });
  }

  // ── One-shots ──
  sfx(name, opts) {
    const fn = SFX[name];
    if (!fn || !this.ready) return;
    let v = null;
    try {
      const o = opts || {}, m = SFX_META[name] || {};
      v = this._voice({ x: o.x, z: o.z, vol: clamp(num(o.vol, 1), 0, 2) * (m.vol || 1), rev: m.rev, ref: m.ref, max: m.max },
        name.startsWith('ui_') ? this.ui : this.world);
      fn(this, v, this.ctx.currentTime + 0.005, clamp(num(o.pitch, 1), 0.25, 4));
      if (v.k.live === 0) v.k.dispose();
    } catch (e) { this._warn(e); if (v) v.k.stop(this.ctx.currentTime); }
  }

  // ── CC0 samples (optional files next to the page: zombies, horror ambience, screams…) ──
  async loadSamples(names) {
    if (!this.ctx) return;
    this._samples = this._samples || new Map();
    await Promise.all(names.map(async (n) => {
      if (this._samples.has(n)) return;
      this._samples.set(n, null);
      const data = await fetchSample(n);
      if (!data) return;
      try { this._samples.set(n, await this.ctx.decodeAudioData(data)); } catch (e) { /* codec not supported: keep the synth fallback */ }
    }));
  }
  sample(name, o = {}) {
    const b = this._samples && this._samples.get(name);
    if (!b || !this.ready) return null;
    try {
      const v = this._voice({ x: o.x, z: o.z, vol: clamp(num(o.vol, 1), 0, 3), rev: o.rev ?? 0.15, ref: o.ref || 6, max: o.max || 140 }, o.ui ? this.ui : this.world);
      v.k.buf(b, this.ctx.currentTime + 0.005, undefined, clamp(num(o.pitch, 1), 0.25, 4), !!o.loop).connect(v.out);
      return v;
    } catch (e) { this._warn(e); return null; }
  }
  // looping beds by id (fade in/out); never stolen by the voice limiter
  loop(id, name, vol = 0.5) {
    if (!this.ready) return;
    this._loops = this._loops || new Map();
    const cur = this._loops.get(id), t = this.ctx.currentTime;
    if (cur && cur.name === name) { cur.v.out.gain.setTargetAtTime(vol, t, 0.4); return; }
    if (cur) this.loopStop(id);
    const v = this.sample(name, { vol: 0.0001, loop: true, rev: 0.12 });
    if (!v) return;
    const i = this._voices.indexOf(v); if (i >= 0) this._voices.splice(i, 1);
    v.out.gain.setTargetAtTime(vol, t, 0.8);
    this._loops.set(id, { name, v });
  }
  loopStop(id, fade = 0.8) {
    const cur = this._loops && this._loops.get(id);
    if (!cur || !this.ctx) return;
    const t = this.ctx.currentTime;
    cur.v.out.gain.cancelScheduledValues(t);
    cur.v.out.gain.setTargetAtTime(0, t, fade / 3);
    cur.v.k.stop(t + fade + 0.1);
    this._loops.delete(id);
  }

  // ── Sirens ──
  sirenStart(id, kind) {
    this._safe(() => {
      const key = String(id), k = kind === 'guardia' ? 'guardia' : 'local', old = this._sirens.get(key);
      if (old && old.kind === k) return;
      if (old) old.stop(this.ctx.currentTime);
      this._sirens.set(key, new Siren(this, k));
    });
  }
  sirenPos(id, x, z) { const s = this._sirens.get(String(id)); if (s) s.pos(x, z); }
  sirenStop(id) {
    const key = String(id), s = this._sirens.get(key);
    if (!s) return;
    s.stop(this.ctx.currentTime);
    this._sirens.delete(key);
  }
  sirenStopAll() { for (const key of [...this._sirens.keys()]) this.sirenStop(key); }

  // ── Places that sound all the time (a fountain): one loop each, on while the listener is near enough ──
  loopAt(id, o = {}) {
    if (!this.ready) return;
    this._safe(() => {
      let L = this._loops.get(id);
      if (!L) {
        const c = this.ctx, t = c.currentTime, k = new Kit(c), sp = this._spatial(k, this.world, o.ref || 6, o.max || 70, o.rev || 0.15), out = k.gain(0);
        out.connect(sp.input);
        if (o.kind === 'fuente') {
          // water falling into water: a bright splashing hiss, a softer murmur under it, both breathing a little
          const hi = k.buf(this.bank.get('pink'), t, undefined, 1, true, Math.random() * 2), bp = k.filter('bandpass', 2600, 0.8), g1 = k.gain(0.5);
          const lo = k.buf(this.bank.get('brown'), t, undefined, 1, true, Math.random() * 2), lp = k.filter('lowpass', 700, 0.7), g2 = k.gain(0.7);
          chain(hi, bp, g1, out); chain(lo, lp, g2, out);
          const lfo = k.osc('sine', 0.37, t), lg = k.gain(0.18); chain(lfo, lg, g1.gain);
        }
        L = { k, sp, out, x: num(o.x, 0), z: num(o.z, 0), vol: num(o.vol, 0.6), on: true };
        this._place(sp, L.x, L.z, t, 0, true);
        this._loops.set(id, L);
      }
      L.on = o.on !== false;
    });
  }

  // ── Ambient, church bells and storks ──
  setAmbient(o) {
    if (!o) return;
    if (o.hour !== undefined) this._amb.hour = num(o.hour, this._amb.hour);
    if (o.town !== undefined) this._amb.town = clamp(num(o.town, this._amb.town), 0, 1);
    if (o.indoor !== undefined) this._amb.indoor = clamp(num(o.indoor, 0), 0, 1);
    if (o.wet !== undefined) this._amb.wet = clamp(num(o.wet, 0), 0, 1); // (in the rain the crickets, cicadas and birds go quiet)
  }
  setChurchPos(x, z) { this._church = { x: num(x), z: num(z) }; }

  bells(count) {
    if (!this.ready) return;
    const n = Math.round(clamp(num(count), 0, 24)), q = this._bellQ;
    let t = Math.max(this.ctx.currentTime + 0.05, q.length ? q[q.length - 1].t + 2.2 : 0);
    if (n === 0) q.push({ t, small: true }); // quarter-hour ding
    for (let i = 0; i < n; i++, t += 2.2) q.push({ t, small: false });
  }

  // Strikes are released just in time so each one is placed relative to the current listener.
  _bellTick(t) {
    const q = this._bellQ;
    while (q.length && q[0].t <= t + 0.1) {
      const b = q.shift(), c = this._church;
      const v = this._voice({ x: c ? c.x : undefined, z: c ? c.z : undefined, vol: b.small ? 0.5 : 0.9, rev: 0.35, ref: 40, max: 900 }, this.world);
      v.k.buf(this.bank.get(b.small ? 'bellSmall' : 'bell'), Math.max(b.t, t + 0.01), undefined, rnd(0.997, 1.003)).connect(v.out);
    }
  }

  storks(x, z) {
    if (!this.ready) return;
    this._safe(() => {
      const v = this._voice({ x: num(x, this.lis.x), z: num(z, this.lis.z), vol: 0.7, rev: 0.12, ref: 10, max: 220 }, this.world);
      v.k.buf(this.bank.get('stork'), this.ctx.currentTime + 0.01, undefined, rnd(0.92, 1.08)).connect(v.out);
    });
  }

  // ── Radio ──
  radioOn(on, level = 1) { this._radioOn = !!on; this._radioLevel = level; this._safe(() => this._radio.setOn(this._radioOn)); }
  tuneNoise() { this._safe(() => this._static(this.ctx.currentTime)); } // the hiss of turning the dial
  radioNext() { this.stationIndex = this._station + 1; return this.stationName; }
  radioPrev() { this.stationIndex = this._station - 1; return this.stationName; }
  get stationName() { return STATIONS[this._station]; }
  get stationIndex() { return this._station; }
  set stationIndex(i) {
    const n = STATIONS.length, j = (((Math.round(num(i)) % n) + n) % n);
    if (j === this._station) return;
    this._station = j;
    this._safe(() => this._radio.tune(j));
  }

  // Tuning noise between stations: swept static plus a heterodyne whistle.
  _static(t) {
    const k = new Kit(this.ctx), g = k.gain(0), bp = k.filter('bandpass', 1800, 0.7);
    const n = k.buf(this.bank.get('white'), t, t + 0.42, 1, true, Math.random());
    bp.frequency.setValueAtTime(rnd(900, 2500), t); bp.frequency.linearRampToValueAtTime(rnd(900, 2500), t + 0.35);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    g.gain.setValueAtTime(0.3, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.4);
    const w = k.osc('sine', 2200, t, t + 0.4), wg = k.gain(0.05);
    w.frequency.setValueAtTime(rnd(1500, 3000), t); w.frequency.exponentialRampToValueAtTime(rnd(400, 900), t + 0.38);
    chain(n, bp, g, this.radioIn); chain(w, wg, g);
  }
}

// ───────────────────────────── 7. One-shot SFX ─────────────────────────────
// Every recipe is (A, v, t, p): GameAudio, voice (kit + output), start time, pitch multiplier.

function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
// Gain node with an attack/decay envelope.
function eg(v, t, peak, a, d) { const g = v.k.gain(0); env(g.gain, t, peak, a, d); return g; }
// Gain node with attack, hold until t+hold, then linear release.
function eh(v, t, peak, a, hold, r = 0.03) {
  const g = v.k.gain(0), p = g.gain;
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + hold); p.linearRampToValueAtTime(0, t + hold + r);
  return g;
}
function sweep(p, t, f0, f1, dur) { p.setValueAtTime(f0, t); p.exponentialRampToValueAtTime(Math.max(1e-3, f1), t + dur); }
const nz = (A, v, t, dur, color = 'white', rate = 1) => v.k.buf(A.bank.get(color), t, t + dur, rate, true, Math.random() * 1.5);
const tone = (v, type, f, t, dur) => v.k.osc(type, f, t, t + dur);

// Bell-like ding: sine fundamental plus inharmonic shimmer.
function ding(v, t, f, dur, amp) {
  chain(tone(v, 'sine', f, t, dur + 0.1), eg(v, t, amp, 0.002, dur), v.out);
  chain(tone(v, 'sine', f * 2.76, t, dur * 0.5), eg(v, t, amp * 0.25, 0.001, dur * 0.35), v.out);
  chain(tone(v, 'triangle', f * 2, t, dur * 0.6), eg(v, t, amp * 0.15, 0.001, dur * 0.4), v.out);
}

// Brassy synth stab: detuned saws through a snapping low-pass.
function stab(v, t, notes, p, dur, amp) {
  const f = v.k.filter('lowpass', 300, 2);
  f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.06); f.frequency.setTargetAtTime(700, t + 0.08, dur / 4);
  chain(f, eg(v, t, amp, 0.01, dur), v.out);
  for (const m of notes) for (const d of [-7, 7]) { const o = tone(v, 'sawtooth', mtof(m) * p, t, dur + 0.2); o.detune.value = d; o.connect(f); }
}

// Vehicle impact: body thump, saturated crunches, ringing panels, optional glass.
function crash(A, v, t, p, size, glass) {
  const o = tone(v, 'sine', 110 * p, t, 0.5);
  sweep(o.frequency, t, 110 * p, 40 * p, 0.25);
  chain(o, eg(v, t, 0.9 * size, 0.003, 0.3), v.out);
  const curve = A.curve('crunch', () => satCurve(4));
  for (let i = 0, n = glass ? 4 : 2; i < n; i++) {
    const ti = t + (i ? rnd(0.02, 0.1) * i : 0);
    chain(nz(A, v, ti, 0.35, 'white', rnd(0.6, 1)), v.k.filter('lowpass', rnd(2500, 5000) * p, 0.8),
      eg(v, ti, (i ? 0.5 : 0.9) * size, 0.002, rnd(0.12, 0.3) * size + 0.05), v.k.shaper(curve), v.out);
  }
  for (const f of [420, 1130, 1790, 2610, 3350]) {
    chain(tone(v, 'sine', f * p * rnd(0.93, 1.07), t, 1.2), eg(v, t, 0.07 * size * rnd(0.5, 1), 0.002, rnd(0.25, 0.9)), v.out);
  }
  if (glass) chain(v.k.buf(A.bank.get('glass'), t + 0.03, undefined, p * rnd(0.9, 1.1)), v.k.gain(0.45), v.out);
}

// Short human-ish yelp: gliding sawtooth through three vowel formants plus breath.
function yelp(A, v, t, p, f0, fmt) {
  const dur = rnd(0.22, 0.34), o = tone(v, 'sawtooth', f0, t, dur + 0.05), f = o.frequency;
  f.setValueAtTime(f0 * 0.9, t); f.linearRampToValueAtTime(f0 * 1.45, t + dur * 0.3); f.linearRampToValueAtTime(f0 * 0.85, t + dur);
  chain(tone(v, 'sine', 9, t, dur), v.k.gain(f0 * 0.03), f);
  const g = v.k.gain(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.025); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);
  o.connect(g);
  for (const [ff, q, a] of fmt) chain(g, v.k.filter('bandpass', ff * p, q), v.k.gain(a), v.out);
  chain(nz(A, v, t, dur, 'pink'), v.k.filter('bandpass', fmt[1][0] * p, 1), eg(v, t, 0.05, 0.02, dur), v.out);
}

// Pea whistle blast: sine with the pea's fast trill as FM, plus breath noise.
function blast(A, v, t, p, d) {
  const o = tone(v, 'sine', 2900 * p, t, d + 0.05);
  chain(tone(v, 'triangle', 36, t, d + 0.05), v.k.gain(140 * p), o.frequency);
  chain(o, eh(v, t, 0.3, 0.015, d - 0.03), v.out);
  chain(nz(A, v, t, d + 0.05), v.k.filter('bandpass', 2900 * p, 3), eh(v, t, 0.12, 0.015, d - 0.03), v.out);
}

const blip = (v, t, f, dur, amp, type = 'triangle') => chain(tone(v, type, f, t, dur + 0.05), eg(v, t, amp, 0.003, dur), v.out);
const marimba = (v, t, f, amp, dest) => {
  chain(tone(v, 'sine', f, t, 0.4), eg(v, t, amp, 0.002, 0.3), dest);
  chain(tone(v, 'sine', f * 3.9, t, 0.1), eg(v, t, amp * 0.22, 0.001, 0.05), dest);
};

const SFX = {
  punch(A, v, t, p) {
    const f = v.k.filter('bandpass', 400 * p, 1.4);
    f.frequency.setValueAtTime(400 * p, t); f.frequency.exponentialRampToValueAtTime(2400 * p, t + 0.09); f.frequency.exponentialRampToValueAtTime(700 * p, t + 0.2);
    chain(nz(A, v, t, 0.25, 'pink'), f, eg(v, t, 0.8, 0.06, 0.18), v.out);
  },
  punch_hit(A, v, t, p) {
    const o = tone(v, 'sine', 130 * p, t, 0.2);
    sweep(o.frequency, t, 130 * p, 48 * p, 0.12);
    chain(o, eg(v, t, 1, 0.002, 0.14), v.out);
    chain(nz(A, v, t, 0.08), v.k.filter('lowpass', 1800 * p), eg(v, t, 0.7, 0.001, 0.05), v.out);
    chain(nz(A, v, t, 0.05), v.k.filter('bandpass', 1100 * p, 1.2), eg(v, t, 0.4, 0.001, 0.03), v.out);
  },
  shot_pistol(A, v, t, p) { chain(v.k.buf(A.bank.get('gunPistol'), t, undefined, p * rnd(0.94, 1.06)), v.out); },
  shot_smg(A, v, t, p) { chain(v.k.buf(A.bank.get('gunSmg'), t, undefined, p * rnd(0.92, 1.08)), v.k.gain(0.8), v.out); },
  shot_shotgun(A, v, t, p) {
    chain(v.k.buf(A.bank.get('gunShotgun'), t, undefined, p * rnd(0.95, 1.03)), v.k.gain(1.1), v.out);
    const tt = t + 0.42; // pump: back and forward
    chain(nz(A, v, tt, 0.05), v.k.filter('bandpass', 1700 * p, 2), eg(v, tt, 0.3, 0.002, 0.03), v.out);
    chain(nz(A, v, tt + 0.17, 0.05), v.k.filter('bandpass', 2500 * p, 2.5), eg(v, tt + 0.17, 0.38, 0.002, 0.03), v.out);
  },
  shot_rifle(A, v, t, p) {
    chain(v.k.buf(A.bank.get('gunRifle'), t, undefined, p * rnd(0.97, 1.03)), v.k.gain(1.15), v.out);
    // bolt: lift, draw back, push home, turn down
    const c = (tt, f, a, q = 4, d = 0.03) => chain(nz(A, v, tt, d + 0.02), v.k.filter('bandpass', f * p, q), eg(v, tt, a, 0.001, d), v.out);
    c(t + 0.24, 2600, 0.3); c(t + 0.33, 1500, 0.28, 2, 0.06); c(t + 0.5, 1900, 0.34, 2, 0.05); c(t + 0.66, 3200, 0.4, 5); c(t + 0.74, 2400, 0.3);
  },
  // ---- the dead: guttural growls, runner shrieks, gurgles, dragged feet, bites, bodies hitting the ground
  z_growl(A, v, t, p) {
    const d = 0.9 + Math.random() * 0.6;
    const o = tone(v, 'sawtooth', 78 * p, t, d);
    for (let i = 0; i < 9; i++) o.frequency.setValueAtTime((62 + Math.random() * 40) * p, t + (i / 9) * d);
    const f1 = v.k.filter('bandpass', 520 * p, 3.5); f1.frequency.setValueAtTime(420 * p, t); f1.frequency.linearRampToValueAtTime(680 * p, t + d * 0.6); f1.frequency.linearRampToValueAtTime(380 * p, t + d);
    chain(o, f1, eg(v, t, 0.55, 0.12, d * 0.8), v.out);
    chain(nz(A, v, t, d, 'pink'), v.k.filter('bandpass', 900 * p, 2), eg(v, t, 0.22, 0.1, d * 0.8), v.out);
  },
  z_shriek(A, v, t, p) {
    const o = tone(v, 'sawtooth', 420 * p, t, 0.75);
    sweep(o.frequency, t, 380 * p, 980 * p, 0.25); o.frequency.linearRampToValueAtTime(620 * p, t + 0.75);
    const f = v.k.filter('bandpass', 1500 * p, 2.5);
    chain(o, f, eg(v, t, 0.45, 0.03, 0.6), v.out);
    chain(nz(A, v, t, 0.7), v.k.filter('highpass', 2200 * p), eg(v, t, 0.22, 0.02, 0.55), v.out);
  },
  z_gurgle(A, v, t, p) {
    for (let i = 0; i < 9; i++) {
      const tt = t + i * (0.05 + Math.random() * 0.05), f = (160 + Math.random() * 190) * p;
      const o = tone(v, 'sine', f, tt, 0.07); sweep(o.frequency, tt, f, f * 1.6, 0.05);
      chain(o, v.k.filter('lowpass', 900 * p), eg(v, tt, 0.25, 0.005, 0.05), v.out);
    }
    chain(nz(A, v, t, 0.6, 'pink'), v.k.filter('bandpass', 380 * p, 1.5), eg(v, t, 0.18, 0.05, 0.5), v.out);
  },
  z_drag(A, v, t, p) { // a shoe scraping the pavement
    const f = v.k.filter('bandpass', 2200 * p, 1.6); f.frequency.setValueAtTime(1600 * p, t); f.frequency.linearRampToValueAtTime(2800 * p, t + 0.3);
    chain(nz(A, v, t, 0.4), f, eg(v, t, 0.28, 0.08, 0.28), v.out);
  },
  z_bite(A, v, t, p) { // crunch and tear
    chain(nz(A, v, t, 0.1), v.k.filter('lowpass', 1400 * p), eg(v, t, 0.9, 0.002, 0.07), v.out);
    const f = v.k.filter('bandpass', 2400 * p, 2); f.frequency.setValueAtTime(2600 * p, t + 0.06); f.frequency.exponentialRampToValueAtTime(700 * p, t + 0.3);
    chain(nz(A, v, t + 0.06, 0.28), f, eg(v, t + 0.06, 0.5, 0.01, 0.22), v.out);
  },
  z_fall(A, v, t, p) { // a body hitting the ground, clothes and a limb after
    const o = tone(v, 'sine', 70 * p, t, 0.35); sweep(o.frequency, t, 80 * p, 42 * p, 0.25);
    chain(o, eg(v, t, 0.9, 0.003, 0.28), v.out);
    chain(nz(A, v, t, 0.2, 'pink'), v.k.filter('lowpass', 700 * p), eg(v, t, 0.7, 0.002, 0.14), v.out);
    chain(nz(A, v, t + 0.14, 0.12, 'pink'), v.k.filter('lowpass', 1100 * p), eg(v, t + 0.14, 0.3, 0.002, 0.08), v.out);
  },
  z_splat(A, v, t, p) { // head shot
    chain(nz(A, v, t, 0.15), v.k.filter('bandpass', 900 * p, 1.4), eg(v, t, 0.9, 0.001, 0.1), v.out);
    chain(tone(v, 'sine', 120 * p, t, 0.12), eg(v, t, 0.5, 0.002, 0.08), v.out);
  },
  casing(A, v, t, p) { // brass tinkling on the ground
    for (let i = 0; i < 3; i++) {
      const tt = t + i * (0.06 + Math.random() * 0.05), f = (5200 + Math.random() * 2600) * p;
      chain(tone(v, 'sine', f, tt, 0.08), eg(v, tt, 0.16 / (i + 1), 0.001, 0.06), v.out);
      chain(tone(v, 'sine', f * 1.51, tt, 0.05), eg(v, tt, 0.06 / (i + 1), 0.001, 0.035), v.out);
    }
  },
  shell_drop(A, v, t, p) { // plastic hull bouncing
    for (let i = 0; i < 2; i++) { const tt = t + i * 0.09; chain(nz(A, v, tt, 0.04), v.k.filter('bandpass', (1300 + i * 300) * p, 3), eg(v, tt, 0.35 / (i + 1), 0.001, 0.03), v.out); }
  },
  reload(A, v, t, p) { // magazine out, magazine in, slide
    const click = (tt, f, a, q = 4) => chain(nz(A, v, tt, 0.04), v.k.filter('bandpass', f * p, q), eg(v, tt, a, 0.001, 0.02), v.out);
    click(t, 2100, 0.35);
    chain(nz(A, v, t + 0.02, 0.14, 'pink'), v.k.filter('bandpass', 900 * p, 1.5), eg(v, t + 0.02, 0.1, 0.01, 0.08), v.out);
    click(t + 0.55, 1500, 0.5); click(t + 0.57, 3100, 0.28);
    click(t + 0.92, 2500, 0.42); click(t + 1.02, 3700, 0.5, 6);
  },
  empty(A, v, t, p) { chain(nz(A, v, t, 0.03), v.k.filter('bandpass', 3400 * p, 5), eg(v, t, 0.5, 0.001, 0.012), v.out); },
  bat_swing(A, v, t, p) {
    const f = v.k.filter('bandpass', 280 * p, 1.1);
    f.frequency.setValueAtTime(280 * p, t); f.frequency.exponentialRampToValueAtTime(1400 * p, t + 0.17); f.frequency.exponentialRampToValueAtTime(380 * p, t + 0.34);
    chain(nz(A, v, t, 0.38, 'pink'), f, eg(v, t, 0.9, 0.13, 0.2), v.out);
  },
  bat_hit(A, v, t, p) {
    const o = tone(v, 'sine', 115 * p, t, 0.25);
    sweep(o.frequency, t, 115 * p, 45 * p, 0.14);
    chain(o, eg(v, t, 1.1, 0.002, 0.16), v.out);
    chain(tone(v, 'triangle', 430 * p, t, 0.12), eg(v, t, 0.35, 0.001, 0.05), v.out); // the wood knocks
    chain(nz(A, v, t, 0.1), v.k.filter('lowpass', 2200 * p), eg(v, t, 0.9, 0.001, 0.06), v.out);
  },
  bullet_flesh(A, v, t, p) {
    const o = tone(v, 'sine', 90 * p, t, 0.12);
    sweep(o.frequency, t, 90 * p, 50 * p, 0.08);
    chain(o, eg(v, t, 0.7, 0.001, 0.07), v.out);
    chain(nz(A, v, t, 0.06, 'pink'), v.k.filter('bandpass', 700 * p, 1.2), eg(v, t, 0.6, 0.001, 0.035), v.out);
  },
  bullet_metal(A, v, t, p) {
    chain(nz(A, v, t, 0.03), v.k.filter('highpass', 2500), eg(v, t, 0.55, 0.001, 0.015), v.out);
    for (const [f, a, d] of [[1830, 0.22, 0.25], [2990, 0.16, 0.18], [4410, 0.11, 0.12], [6100, 0.07, 0.08]]) chain(tone(v, 'sine', f * p * rnd(0.97, 1.03), t, d + 0.05), eg(v, t, a, 0.001, d), v.out);
  },
  ricochet(A, v, t, p) {
    const f0 = rnd(3000, 4200) * p, o = tone(v, 'sine', f0, t, 0.5);
    sweep(o.frequency, t, f0, f0 * 0.35, 0.45);
    chain(o, eg(v, t, 0.2, 0.004, 0.35), v.out);
    chain(nz(A, v, t, 0.3), v.k.filter('bandpass', f0 * 0.8, 3), eg(v, t, 0.1, 0.004, 0.2), v.out);
    chain(nz(A, v, t, 0.04), v.k.filter('bandpass', 1800, 1.5), eg(v, t, 0.35, 0.001, 0.02), v.out); // the chip off the wall
  },
  heartbeat(A, v, t, p) { // lub-dub
    for (const [dt, a] of [[0, 1], [0.26, 0.7]]) {
      const o = tone(v, 'sine', 62 * p, t + dt, 0.25);
      sweep(o.frequency, t + dt, 62 * p, 38 * p, 0.16);
      chain(o, eg(v, t + dt, a, 0.004, 0.14), v.out);
      chain(nz(A, v, t + dt, 0.06, 'brown'), v.k.filter('lowpass', 180), eg(v, t + dt, a * 0.5, 0.003, 0.05), v.out);
    }
  },
  door_slam(A, v, t, p) {
    const o = tone(v, 'sine', 70 * p, t, 0.5);
    sweep(o.frequency, t, 70 * p, 40 * p, 0.25);
    chain(o, eg(v, t, 1.2, 0.002, 0.3), v.out);
    chain(nz(A, v, t, 0.35), v.k.filter('lowpass', 900 * p), eg(v, t, 1.1, 0.002, 0.18), v.out);
    chain(nz(A, v, t + 0.01, 0.08), v.k.filter('bandpass', 2600 * p, 2), eg(v, t + 0.01, 0.5, 0.001, 0.04), v.out);
    chain(nz(A, v, t + 0.05, 0.6, 'pink'), v.k.filter('bandpass', 400 * p, 0.8), eg(v, t + 0.05, 0.2, 0.05, 0.5), v.out);
  },
  knock(A, v, t, p) { // three knocks on a wooden door
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.24 + (i === 2 ? 0.06 : 0);
      chain(tone(v, 'triangle', 190 * p, tt, 0.12), eg(v, tt, 0.7, 0.001, 0.07), v.out);
      chain(nz(A, v, tt, 0.06), v.k.filter('bandpass', 850 * p, 1.6), eg(v, tt, 0.9, 0.001, 0.04), v.out);
    }
  },
  flashlight(A, v, t, p) { chain(nz(A, v, t, 0.03), v.k.filter('bandpass', 3200 * p, 3), eg(v, t, 0.45, 0.001, 0.015), v.out); },
  creak(A, v, t, p) { // old wood under weight / a door hinge: stick-slip friction
    const o = tone(v, 'sawtooth', 150 * p, t, 1.1);
    for (let i = 0; i < 11; i++) o.frequency.setValueAtTime((120 + Math.random() * 75) * p, t + i * 0.09);
    chain(o, v.k.filter('bandpass', 900 * p, 6), eg(v, t, 0.32, 0.12, 0.85), v.out);
    chain(nz(A, v, t, 1.0, 'pink'), v.k.filter('bandpass', 1900 * p, 4), eg(v, t, 0.06, 0.2, 0.7), v.out);
  },
  clock(A, v, t, p) { // tick of a wall clock
    chain(nz(A, v, t, 0.02), v.k.filter('bandpass', 3600 * p, 5), eg(v, t, 0.55, 0.0005, 0.012), v.out);
    chain(tone(v, 'sine', 1900 * p, t, 0.02), eg(v, t, 0.12, 0.0005, 0.01), v.out);
  },
  thunder(A, v, t, p) { // a peal of thunder: close (p > 1.1) a crack first; then the long rumble that rolls away
    const near = p > 1.1, dur = 4.5 + Math.random() * 3;
    if (near) chain(nz(A, v, t, 0.5, 'white'), v.k.filter('bandpass', 1800, 0.7), eg(v, t, 0.9, 0.004, 0.35), v.out);
    const lp = v.k.filter('lowpass', near ? 520 : 260, 0.6), g = v.k.gain(0), G = g.gain;
    let tt = t + (near ? 0.05 : 0.25);
    G.setValueAtTime(0, t); G.linearRampToValueAtTime(near ? 1 : 0.7, tt);
    for (let i = 0; i < 5; i++) { tt += (dur / 6) * (0.6 + Math.random() * 0.8); G.linearRampToValueAtTime((0.35 + Math.random() * 0.55) * (1 - i / 6), tt); } // (it rolls: louder and softer as it comes from farther along the bolt)
    G.linearRampToValueAtTime(0, tt + 1.2);
    chain(nz(A, v, t, tt - t + 1.4, 'brown'), lp, g, v.out);
  },
  wind(A, v, t, p) { // a gust against the shutters
    const f = v.k.filter('lowpass', 380 * p, 0.7);
    f.frequency.setValueAtTime(260 * p, t); f.frequency.linearRampToValueAtTime(720 * p, t + 1.2); f.frequency.linearRampToValueAtTime(240 * p, t + 3);
    chain(nz(A, v, t, 3.2, 'pink'), f, eg(v, t, 0.5, 1.1, 1.9), v.out);
  },
  whisper(A, v, t, p) { // breathy syllables right behind you
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.22 + Math.random() * 0.06;
      chain(nz(A, v, tt, 0.18), v.k.filter('bandpass', (2200 + Math.random() * 1600) * p, 3), eg(v, tt, 0.35, 0.03, 0.12), v.out);
    }
  },
  thud(A, v, t, p) { // something heavy falls in another room
    const o = tone(v, 'sine', 62 * p, t, 0.5);
    sweep(o.frequency, t, 62 * p, 34 * p, 0.3);
    chain(o, eg(v, t, 1.1, 0.002, 0.35), v.out);
    chain(nz(A, v, t, 0.25, 'pink'), v.k.filter('lowpass', 600 * p), eg(v, t, 0.8, 0.002, 0.16), v.out);
  },
  crash_small(A, v, t, p) { crash(A, v, t, p, 0.55, false); },
  crash_big(A, v, t, p) { crash(A, v, t, p, 1, true); },
  church_door(A, v, t, p) { // a great church door on its iron hinges: the latch lifts, a long low groan, the wood
    chain(nz(A, v, t, 0.05), v.k.filter('bandpass', 2100 * p, 4), eg(v, t, 0.5, 0.001, 0.04), v.out);
    chain(tone(v, 'triangle', 820 * p, t + 0.02, 0.15), eg(v, t + 0.02, 0.1, 0.001, 0.12), v.out);
    const o = tone(v, 'sawtooth', 70 * p, t + 0.25, 2.4);
    for (let i = 0; i < 26; i++) o.frequency.setValueAtTime((50 + Math.random() * 40) * p, t + 0.25 + i * 0.085);
    chain(o, v.k.filter('bandpass', 430 * p, 5), eg(v, t + 0.25, 0.26, 0.45, 1.8), v.out);
    chain(nz(A, v, t + 0.25, 2.2, 'brown'), v.k.filter('bandpass', 260 * p, 2), eg(v, t + 0.25, 0.22, 0.5, 1.5), v.out);
  },
  church_shut(A, v, t, p) { // … and its boom as it closes, round the stone; the iron latch drops
    const o = tone(v, 'sine', 58 * p, t, 0.9);
    sweep(o.frequency, t, 58 * p, 30 * p, 0.45);
    chain(o, eg(v, t, 1.3, 0.003, 0.6), v.out);
    chain(nz(A, v, t, 0.5, 'brown'), v.k.filter('lowpass', 420 * p), eg(v, t, 1.2, 0.002, 0.3), v.out);
    chain(nz(A, v, t + 0.01, 0.1), v.k.filter('bandpass', 1500 * p, 2), eg(v, t + 0.01, 0.4, 0.001, 0.06), v.out);
    chain(nz(A, v, t + 0.14, 0.05), v.k.filter('bandpass', 2600 * p, 6), eg(v, t + 0.14, 0.35, 0.001, 0.035), v.out);
    chain(tone(v, 'triangle', 1180 * p, t + 0.14, 0.25), eg(v, t + 0.14, 0.07, 0.001, 0.2), v.out);
  },
  cancel_flap(A, v, t, p) { // the padded swing leaves of the lobby: a soft leather thump, and a smaller one
    for (const [dt, a] of [[0, 1], [0.3, 0.4]]) {
      chain(nz(A, v, t + dt, 0.12, 'brown'), v.k.filter('lowpass', 380 * p), eg(v, t + dt, 0.7 * a, 0.003, 0.08), v.out);
      chain(tone(v, 'sine', 110 * p, t + dt, 0.15), eg(v, t + dt, 0.3 * a, 0.002, 0.09), v.out);
    }
  },
  door_open(A, v, t, p) {
    chain(nz(A, v, t, 0.03), v.k.filter('bandpass', 2600 * p, 2), eg(v, t, 0.5, 0.001, 0.02), v.out);
    chain(nz(A, v, t + 0.06, 0.1), v.k.filter('bandpass', 900 * p, 1.5), eg(v, t + 0.06, 0.6, 0.002, 0.06), v.out);
    chain(tone(v, 'sine', 95 * p, t + 0.06, 0.2), eg(v, t + 0.06, 0.5, 0.003, 0.1), v.out);
    chain(nz(A, v, t + 0.1, 0.35, 'pink'), v.k.filter('bandpass', 1400 * p, 0.8), eg(v, t + 0.1, 0.15, 0.08, 0.25), v.out);
  },
  door_close(A, v, t, p) {
    const o = tone(v, 'sine', 90 * p, t, 0.35);
    sweep(o.frequency, t, 90 * p, 52 * p, 0.15);
    chain(o, eg(v, t, 1, 0.002, 0.2), v.out);
    chain(nz(A, v, t, 0.2), v.k.filter('lowpass', 700 * p), eg(v, t, 0.8, 0.002, 0.1), v.out);
    chain(nz(A, v, t + 0.012, 0.04), v.k.filter('bandpass', 2400 * p, 3), eg(v, t + 0.012, 0.35, 0.001, 0.025), v.out);
  },
  car_break_in(A, v, t, p) {
    let tt = t;
    for (let i = 0; i < 9; i++) {
      tt += rnd(0.05, 0.14);
      chain(nz(A, v, tt, 0.03), v.k.filter('bandpass', rnd(2500, 5200) * p, 6), eg(v, tt, rnd(0.25, 0.6), 0.001, 0.02), v.out);
      if (i % 3 === 1) chain(nz(A, v, tt, 0.12, 'pink'), v.k.filter('bandpass', 1700 * p, 2), eg(v, tt, 0.12, 0.02, 0.08), v.out);
    }
    tt += 0.12;
    chain(tone(v, 'square', 180 * p, tt, 0.1), v.k.filter('lowpass', 900), eg(v, tt, 0.3, 0.001, 0.05), v.out);
    chain(nz(A, v, tt, 0.06), v.k.filter('bandpass', 1200 * p, 2), eg(v, tt, 0.6, 0.001, 0.04), v.out);
  },
  alarm(A, v, t, p) { // warble → rising whoops → beeps (~3 s)
    const o = tone(v, 'square', 1450 * p, t, 3.05), f = o.frequency, g = v.k.gain(0);
    let s = t;
    for (let i = 0; i < 16; i++, s += 0.075) f.setValueAtTime((i % 2 ? 1850 : 1450) * p, s);
    for (let i = 0; i < 4; i++, s += 0.25) sweep(f, s, 800 * p, 1800 * p, 0.23);
    f.setValueAtTime(1150 * p, s);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.01);
    for (let i = 0; i < 4; i++) { g.gain.setTargetAtTime(0.3, s + i * 0.2, 0.004); g.gain.setTargetAtTime(0, s + i * 0.2 + 0.12, 0.004); }
    chain(o, v.k.filter('bandpass', 1500, 0.9), v.k.shaper(A.curve('horn', () => satCurve(2.5))), g, v.out);
  },
  explosion(A, v, t, p) {
    chain(v.k.buf(A.bank.get('explosion'), t, undefined, p * rnd(0.9, 1.05)), v.k.gain(1.2), v.out);
    const o = tone(v, 'sine', 60 * p, t, 1.5);
    sweep(o.frequency, t, 60 * p, 25 * p, 1.2);
    chain(o, eg(v, t, 0.8, 0.005, 1.2), v.out);
  },
  footstep(A, v, t, p) {
    const r = p * rnd(0.85, 1.18);
    chain(nz(A, v, t, 0.09, 'pink'), v.k.filter('bandpass', 520 * r, 1.1), eg(v, t, 0.55, 0.004, 0.06), v.out);
    chain(nz(A, v, t, 0.03), v.k.filter('highpass', 3000 * r), eg(v, t + 0.005, 0.08, 0.001, 0.02), v.out);
  },
  jump(A, v, t, p) {
    const f = v.k.filter('bandpass', 350 * p, 1.2);
    sweep(f.frequency, t, 350 * p, 1300 * p, 0.14);
    chain(nz(A, v, t, 0.2, 'pink'), f, eg(v, t, 0.35, 0.03, 0.12), v.out);
    chain(nz(A, v, t, 0.06, 'pink'), v.k.filter('lowpass', 500 * p), eg(v, t, 0.4, 0.003, 0.04), v.out);
  },
  land(A, v, t, p) {
    const o = tone(v, 'sine', 95 * p, t, 0.25);
    sweep(o.frequency, t, 95 * p, 42 * p, 0.12);
    chain(o, eg(v, t, 0.8, 0.002, 0.12), v.out);
    chain(nz(A, v, t, 0.15, 'pink'), v.k.filter('lowpass', 700 * p), eg(v, t, 0.7, 0.002, 0.09), v.out);
    chain(nz(A, v, t + 0.01, 0.08), v.k.filter('bandpass', 2800 * p, 0.8), eg(v, t + 0.01, 0.12, 0.002, 0.05), v.out);
  },
  pickup(A, v, t, p) { ding(v, t, 1318.5 * p, 0.45, 0.35); ding(v, t + 0.07, 1975.5 * p, 0.5, 0.3); },
  money(A, v, t, p) { // drawer clack, register "ching", coin jingle
    chain(nz(A, v, t, 0.06), v.k.filter('bandpass', 1500 * p, 1.5), eg(v, t, 0.5, 0.001, 0.04), v.out);
    ding(v, t + 0.07, 2637 * p, 0.9, 0.3); ding(v, t + 0.07, 3322 * p, 0.7, 0.2);
    for (let i = 0; i < 8; i++) {
      const ti = t + 0.12 + Math.random() * 0.35;
      chain(tone(v, 'sine', rnd(3500, 7000) * p, ti, 0.12), eg(v, ti, rnd(0.05, 0.14), 0.001, rnd(0.04, 0.1)), v.out);
    }
  },
  checkpoint(A, v, t, p) {
    const lp = v.k.filter('lowpass', 4000); lp.connect(v.out);
    chain(tone(v, 'square', 880 * p, t, 0.08), eg(v, t, 0.18, 0.003, 0.06), lp);
    chain(tone(v, 'square', 1318.5 * p, t + 0.07, 0.25), eg(v, t + 0.07, 0.2, 0.003, 0.18), lp);
  },
  mission_start(A, v, t, p) { // sub boom + D minor brass stab + snare/crash
    const b = tone(v, 'sine', 80 * p, t, 1.6);
    sweep(b.frequency, t, 80 * p, 35 * p, 1.2);
    chain(b, eg(v, t, 0.9, 0.005, 1.2), v.out);
    stab(v, t, [50, 57, 62, 65], p, 1.6, 0.16);
    chain(v.k.buf(A.bank.get('snare'), t), v.k.gain(0.5), v.out);
    chain(v.k.buf(A.bank.get('crash'), t, undefined, 0.8), v.k.gain(0.25), v.out);
  },
  mission_pass(A, v, t, p) { // rasgueado, Andalusian run, F → E7 → A major with palmas and brass
    const G = (m, tt, vel, br = 0.5) => chain(v.k.buf(A.bank.pluck(m, br), tt, undefined, p), v.k.gain(vel), v.out);
    const strum = (ch, tt, vel, sp = 0.011) => ch.forEach((m, i) => G(m, tt + i * sp, vel * (0.8 + (0.2 * i) / ch.length)));
    const Am = [45, 52, 57, 60, 64], F = [41, 48, 53, 57, 60, 65], E7 = [40, 47, 50, 56, 59, 64], AM = [45, 52, 57, 61, 64, 69];
    for (let i = 0; i < 4; i++) strum(Am, t + i * 0.03, 0.14 + i * 0.05, 0.004);
    [69, 67, 65, 64].forEach((m, i) => G(m, t + 0.24 + i * 0.09, 0.5, 0.75));
    strum(F, t + 0.62, 0.32);
    for (let i = 0; i < 3; i++) strum(E7, t + 0.86 + i * 0.03, 0.18 + i * 0.07, 0.004);
    [64, 68, 71, 76].forEach((m, i) => G(m, t + 1.08 + i * 0.07, 0.42, 0.75));
    strum(AM, t + 1.42, 0.55, 0.014);
    for (const [dt, a] of [[1.2, 0.3], [1.31, 0.3], [1.42, 0.5]]) chain(v.k.buf(A.bank.get('palmaClara'), t + dt, undefined, p), v.k.gain(a), v.out);
    stab(v, t + 1.42, [69, 73, 76], p, 1.1, 0.09);
  },
  mission_fail(A, v, t, p) { // low thud, then four descending detuned-saw notes, the last one wavering
    const lo = tone(v, 'sine', 70 * p, t, 0.6);
    sweep(lo.frequency, t, 70 * p, 38 * p, 0.4);
    chain(lo, eg(v, t, 0.7, 0.004, 0.4), v.out);
    const f = v.k.filter('lowpass', 1400, 1.5); chain(f, v.k.gain(0.2), v.out);
    [64, 63, 62, 61].forEach((m, i) => {
      const tt = t + 0.1 + i * 0.32, d = i === 3 ? 1.1 : 0.28, g = eh(v, tt, 1, 0.02, d, 0.12);
      g.connect(f);
      for (const det of [-6, 6]) {
        const o = tone(v, 'sawtooth', mtof(m - 12) * p, tt, d + 0.2); o.detune.value = det; o.connect(g);
        if (i === 3) chain(tone(v, 'sine', 5.5, tt, d + 0.2), v.k.gain(25), o.detune);
      }
    });
  },
  wasted(A, v, t, p) { // slowed-down explosion and a sinking drone
    chain(v.k.buf(A.bank.get('explosion'), t, undefined, 0.5 * p), v.k.filter('lowpass', 900), v.k.gain(1.1), v.out);
    const f = v.k.filter('lowpass', 900, 1);
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 4.5);
    const g = v.k.gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.6); g.gain.setTargetAtTime(0, t + 3.2, 0.5);
    for (const [m, d] of [[33, -8], [33, 8], [40, 0]]) { const o = tone(v, 'sawtooth', mtof(m) * p, t, 5.5); o.detune.value = d; o.connect(f); }
    chain(f, g, v.out);
  },
  busted(A, v, t, p) { // tense stab and two siren chirps
    stab(v, t, [45, 51, 57, 60], p, 1.0, 0.14);
    chain(v.k.buf(A.bank.get('snare'), t), v.k.gain(0.4), v.out);
    for (let i = 0; i < 2; i++) {
      const tt = t + 0.35 + i * 0.32, o = tone(v, 'square', 650 * p, tt, 0.3);
      sweep(o.frequency, tt, 650 * p, 1500 * p, 0.12); o.frequency.exponentialRampToValueAtTime(900 * p, tt + 0.26);
      chain(o, v.k.filter('bandpass', 1400, 1), eg(v, tt, 0.25, 0.01, 0.2), v.out);
    }
  },
  ui_click(A, v, t, p) {
    blip(v, t, 2200 * p, 0.015, 0.25, 'sine');
    chain(nz(A, v, t, 0.01), v.k.filter('highpass', 4000), eg(v, t, 0.15, 0.0005, 0.005), v.out);
  },
  ui_select(A, v, t, p) { blip(v, t, 880 * p, 0.05, 0.22); blip(v, t + 0.055, 1320 * p, 0.08, 0.2); },
  ui_back(A, v, t, p) { blip(v, t, 660 * p, 0.05, 0.22); blip(v, t + 0.055, 440 * p, 0.08, 0.2); },
  phone_ring(A, v, t, p) {
    const hp = v.k.filter('highpass', 500); hp.connect(v.out);
    for (let r = 0; r < 2; r++) [81, 84, 88, 84, 86, 83].forEach((m, i) => marimba(v, t + r * 1.1 + i * 0.12, mtof(m) * p, 0.28, hp));
  },
  bark(A, v, t, p) { // two short barks
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.22, f = rnd(0.85, 1.15) * p;
      const o = tone(v, 'sawtooth', 420 * f, tt, 0.14);
      sweep(o.frequency, tt, 520 * f, 260 * f, 0.1);
      chain(o, v.k.filter('bandpass', 900 * f, 1.4), eg(v, tt, 0.55, 0.004, 0.09), v.out);
      chain(nz(A, v, tt, 0.08), v.k.filter('bandpass', 1500 * f, 2), eg(v, tt, 0.3, 0.002, 0.05), v.out);
    }
  },
  piano(A, v, t, p) { // a little tune (the neighbours will hear it)
    const notes = [67, 72, 76, 79, 76, 72, 74, 71, 67];
    notes.forEach((m, i) => { const f = mtof(m) * p, tt = t + i * 0.22; chain(tone(v, 'triangle', f, tt, 0.9), eg(v, tt, 0.32, 0.004, 0.7), v.out); chain(tone(v, 'sine', f * 2, tt, 0.5), eg(v, tt, 0.08, 0.004, 0.4), v.out); });
  },
  guitar(A, v, t, p) { // a strummed chord
    [52, 57, 62, 67, 71, 76].forEach((m, i) => { const f = mtof(m) * p, tt = t + i * 0.018; chain(tone(v, 'sawtooth', f, tt, 1.4), v.k.filter('lowpass', 2200 * p, 0.7), eg(v, tt, 0.1, 0.002, 1.1), v.out); });
  },
  radio(A, v, t, p) { // squelch, a short burst of static and the talk-back beep
    chain(nz(A, v, t, 0.16), v.k.filter('bandpass', 2400 * p, 0.9), eg(v, t, 0.22, 0.002, 0.12), v.out);
    blip(v, t + 0.02, 1850 * p, 0.05, 0.12, 'square');
  },
  lid(A, v, t, p) { // a plastic container lid: lift creak and thump down
    chain(nz(A, v, t, 0.12), v.k.filter('bandpass', 700 * p, 3), eg(v, t, 0.25, 0.02, 0.08), v.out);
    const tt = t + 0.28;
    chain(nz(A, v, tt, 0.14), v.k.filter('bandpass', 300 * p, 3), eg(v, tt, 1.1, 0.002, 0.1), v.out);
    const o = tone(v, 'triangle', 150 * p, tt, 0.12);
    sweep(o.frequency, tt, 150 * p, 95 * p, 0.1);
    chain(o, eg(v, tt, 0.45, 0.002, 0.08), v.out);
  },
  text_msg(A, v, t, p) { marimba(v, t, mtof(88) * p, 0.3, v.out); marimba(v, t + 0.11, mtof(95) * p, 0.26, v.out); },
  bin_hit(A, v, t, p) { // hollow plastic knock, a few bounces, lid rattle
    const knock = (tt, a) => {
      chain(nz(A, v, tt, 0.18), v.k.filter('bandpass', 320 * p, 4), eg(v, tt, a * 1.4, 0.002, 0.12), v.out);
      chain(nz(A, v, tt, 0.1), v.k.filter('bandpass', 950 * p, 5), eg(v, tt, a * 0.8, 0.001, 0.07), v.out);
      const o = tone(v, 'triangle', 190 * p, tt, 0.15);
      sweep(o.frequency, tt, 190 * p, 120 * p, 0.1);
      chain(o, eg(v, tt, a * 0.5, 0.002, 0.08), v.out);
    };
    knock(t, 1); knock(t + 0.24, 0.55); knock(t + 0.41, 0.35); knock(t + 0.53, 0.2);
    for (let i = 0, tt = t + 0.6; i < 5; i++, tt += rnd(0.04, 0.08)) {
      chain(nz(A, v, tt, 0.03), v.k.filter('bandpass', rnd(1500, 2500) * p, 3), eg(v, tt, 0.15 * (1 - i / 5), 0.001, 0.02), v.out);
    }
  },
  glass(A, v, t, p) { chain(v.k.buf(A.bank.get('glass'), t, undefined, p * rnd(0.92, 1.08)), v.k.gain(0.8), v.out); },
  yelp_m(A, v, t, p) { yelp(A, v, t, p, 170 * p * rnd(0.92, 1.1), [[750, 6, 1], [1150, 7, 0.6], [2500, 8, 0.25]]); },
  yelp_f(A, v, t, p) { yelp(A, v, t, p, 330 * p * rnd(0.92, 1.1), [[850, 6, 1], [1400, 7, 0.55], [2900, 8, 0.25]]); },
  whistle(A, v, t, p) { blast(A, v, t, p, 0.16); blast(A, v, t + 0.24, p, 0.6); },
  ball(A, v, t, p) { // a ball on a sports floor: a rubbery thud, then smaller and quicker bounces
    let a = 1, tt = t, dt = 0.32;
    for (let i = 0; i < 5; i++, tt += dt, dt *= 0.72, a *= 0.6) {
      const o = tone(v, 'sine', 150 * p, tt, 0.12); sweep(o.frequency, tt, 150 * p, 85 * p, 0.08);
      chain(o, eg(v, tt, a * 0.9, 0.002, 0.07), v.out);
      chain(nz(A, v, tt, 0.05), v.k.filter('bandpass', 1300 * p, 2), eg(v, tt, a * 0.35, 0.001, 0.03), v.out);
    }
  },
  splash(A, v, t, p) { // thump, falling noise wash, bubbles
    const o = tone(v, 'sine', 110 * p, t, 0.3);
    sweep(o.frequency, t, 110 * p, 45 * p, 0.2);
    chain(o, eg(v, t, 0.5, 0.004, 0.18), v.out);
    const f = v.k.filter('lowpass', 5000 * p, 0.8);
    sweep(f.frequency, t, 5000 * p, 700 * p, 0.9);
    chain(nz(A, v, t, 1.1, 'pink'), f, eg(v, t, 0.9, 0.01, 0.7), v.out);
    for (let i = 0; i < 10; i++) {
      const tt = t + 0.08 + Math.random() * 0.8, f0 = rnd(400, 1100) * p, b = tone(v, 'sine', f0, tt, 0.06);
      sweep(b.frequency, tt, f0, f0 * 1.8, 0.05);
      chain(b, eg(v, tt, rnd(0.04, 0.12), 0.003, 0.04), v.out);
    }
  },
};

// Per-sound mix and range (vol multiplier, reverb send, reference / max distance).
const SFX_META = {
  explosion: { ref: 20, max: 500, rev: 0.45 }, crash_big: { ref: 12, max: 250, rev: 0.25 }, crash_small: { ref: 10, max: 180, rev: 0.12, vol: 0.8 },
  alarm: { ref: 10, max: 220, rev: 0.12 }, whistle: { ref: 12, max: 250, rev: 0.15, vol: 0.8 }, glass: { rev: 0.1 },
  footstep: { ref: 3, max: 45, vol: 0.5 }, jump: { ref: 4, max: 50, vol: 0.6 }, land: { ref: 4, max: 60, vol: 0.7 },
  punch: { ref: 4, max: 60, vol: 0.7 }, punch_hit: { ref: 5, max: 80 }, door_open: { ref: 5, max: 70, vol: 0.7 }, door_close: { ref: 5, max: 90, vol: 0.8 },
  car_break_in: { ref: 4, max: 50, vol: 0.7 }, bin_hit: { ref: 8, max: 120, rev: 0.08 }, splash: { ref: 8, max: 120, rev: 0.08 }, ball: { ref: 8, max: 90, rev: 0.25 },
  yelp_m: { ref: 6, max: 90, vol: 0.7 }, yelp_f: { ref: 6, max: 90, vol: 0.7 },
  mission_start: { rev: 0.25 }, mission_pass: { rev: 0.2 }, mission_fail: { rev: 0.25 }, wasted: { rev: 0.4 }, busted: { rev: 0.25 },
  z_growl: { ref: 4, max: 60, rev: 0.35 }, z_shriek: { ref: 6, max: 90, rev: 0.4 }, z_gurgle: { ref: 3, max: 30, rev: 0.25 }, z_drag: { ref: 2, max: 22, vol: 0.6 },
  z_bite: { ref: 3, max: 30, vol: 1 }, z_fall: { ref: 4, max: 40, rev: 0.25 }, z_splat: { ref: 4, max: 45, rev: 0.25 },
  shot_rifle: { ref: 26, max: 1100, rev: 0.55 }, casing: { ref: 2, max: 18, vol: 0.7 }, shell_drop: { ref: 2, max: 16, vol: 0.6 },
  shot_pistol: { ref: 18, max: 700, rev: 0.4 }, shot_smg: { ref: 16, max: 600, rev: 0.35, vol: 0.9 }, shot_shotgun: { ref: 22, max: 800, rev: 0.45 },
  reload: { ref: 3, max: 30, vol: 0.7 }, empty: { ref: 3, max: 25, vol: 0.7 }, bat_swing: { ref: 4, max: 50, vol: 0.7 }, bat_hit: { ref: 6, max: 90 },
  bullet_flesh: { ref: 5, max: 60, vol: 0.8 }, bullet_metal: { ref: 6, max: 120, rev: 0.05, vol: 0.8 }, ricochet: { ref: 6, max: 120, rev: 0.1, vol: 0.7 },
  heartbeat: { vol: 0.9 }, door_slam: { ref: 6, max: 90, rev: 0.35 }, church_door: { ref: 6, max: 70, rev: 0.4, vol: 0.8 }, church_shut: { ref: 8, max: 110, rev: 0.6 }, cancel_flap: { ref: 4, max: 40, rev: 0.5, vol: 0.7 }, knock: { ref: 5, max: 60, rev: 0.25 }, flashlight: { vol: 0.6 },
  thunder: { vol: 1.15, rev: 0.5 }, creak: { ref: 4, max: 40, rev: 0.45 }, clock: { ref: 2, max: 16, vol: 0.55, rev: 0.25 }, wind: { vol: 0.45, rev: 0.3 }, whisper: { ref: 2, max: 14, rev: 0.4 }, thud: { ref: 6, max: 60, rev: 0.4 },
  radio: { vol: 0.45 }, lid: { ref: 5, max: 60, vol: 0.8 }, bark: { ref: 5, max: 70, vol: 0.8, rev: 0.1 }, piano: { rev: 0.25, vol: 0.9 }, guitar: { rev: 0.2, vol: 0.8 },
  pickup: { vol: 0.8 }, money: { vol: 0.8 }, checkpoint: { vol: 0.9 }, phone_ring: { vol: 0.7 }, text_msg: { vol: 0.7 },
};

// ───────────────────────────── 8. Ambient ─────────────────────────────
// Beds (town murmur, distant traffic, crickets, cicadas) crossfade with the hour; birds, swifts,
// dogs and scops owls are scheduled as sparse positional events around the listener.

class Ambient {
  constructor(A) { this.A = A; this.k = null; this.timers = { bird: 2, swift: 6, dog: 18, owl: 12 }; }

  _build(t) {
    const A = this.A, k = (this.k = new Kit(A.ctx));
    const loop = (name, ...fx) => { const g = k.gain(0); chain(k.buf(A.bank.get(name), t, undefined, 1, true, Math.random() * 3), ...fx, g, A.ambBus); return g; };
    this.murmur = loop('pink', k.filter('bandpass', 520, 0.6), k.filter('lowpass', 1600));
    this.traffic = loop('brown', k.filter('lowpass', 260));
    this.crickets = loop('crickets');
    this.cicadas = loop('cicadas');
  }

  update(dt, t) {
    const A = this.A, h = ((num(A._amb.hour, 12) % 24) + 24) % 24, town = A._amb.town;
    if (!this.k) this._build(t);
    const day = smooth(6, 7.5, h) * (1 - smooth(20.5, 22, h)), night = 1 - day;
    const act = clamp(0.12 + 0.55 * day + 0.45 * bump(h, 20, 1.6) + 0.2 * bump(h, 12, 2.5), 0, 1); // evening paseo peak
    // indoors the street is muffled (in a house) or gone (in the church: only its own silence)
    const ind = num(A._amb.indoor, 0), out = 1 - ind, dry = 1 - 0.85 * num(A._amb.wet, 0);
    glide(this.murmur.gain, town * act * 0.55 * out, t, 0.8);
    glide(this.traffic.gain, (0.25 + 0.45 * town) * act * 0.5 * out, t, 0.8);
    glide(this.crickets.gain, night * (0.35 + 0.65 * (1 - town)) * 0.7 * out * dry, t, 1.5);
    glide(this.cicadas.gain, day * bump(h, 15.5, 2.3) * (1 - 0.85 * town) * 0.35 * out * dry, t, 1.5);
    if (A._paused || ind > 0.5) return; // (no birds, swifts, dogs or owls inside)
    const ev = this.timers;
    const birds = day * (0.5 + 0.5 * (1 - town)) * (1 + 1.5 * bump(h, 7.8, 1)) * dry; // dawn chorus
    const swifts = smooth(17.5, 18.5, h) * (1 - smooth(20.8, 21.6, h)) * (0.4 + 0.6 * town) * dry;
    if ((ev.bird -= dt * birds) < 0) { ev.bird = rnd(1.5, 5); this.bird(); }
    if ((ev.swift -= dt * swifts) < 0) { ev.swift = rnd(4, 12); this.swifts(); }
    if ((ev.owl -= dt * night * (1 - 0.6 * town)) < 0) { ev.owl = rnd(20, 45); this.owl(); }
    if ((ev.dog -= dt * (0.25 + 0.35 * (1 - town))) < 0) { ev.dog = rnd(25, 70); this.dog(); }
  }

  // Voice placed at a random bearing and distance around the listener.
  _around(dmin, dmax, vol, rev) {
    const L = this.A.lis, a = Math.random() * TAU, d = rnd(dmin, dmax);
    return this.A._voice({ x: L.x + Math.cos(a) * d, z: L.z + Math.sin(a) * d, vol, rev, ref: 12, max: 220 }, this.A.ambBus);
  }

  // Sparrow chips or a warbling songbird phrase: one FM'd sine with per-note glides.
  bird() {
    const v = this._around(12, 70, rnd(0.5, 0.9), 0.1), k = v.k, t = this.A.ctx.currentTime + 0.02, sparrow = Math.random() < 0.5;
    const o = k.osc('sine', 3000, t, t + 3), f = o.frequency, g = k.gain(0);
    chain(k.osc('sine', rnd(25, 60), t, t + 3), k.gain(rnd(80, 300)), f);
    chain(o, g, v.out);
    let tt = t;
    for (let i = 0, n = sparrow ? 2 + Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 8); i < n && tt < t + 2.7; i++) {
      const d = sparrow ? rnd(0.05, 0.09) : rnd(0.04, 0.16), f0 = sparrow ? rnd(3800, 4800) : rnd(2200, 6000);
      sweep(f, tt, f0, sparrow ? f0 * 0.72 : rnd(2200, 6000), d);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(rnd(0.15, 0.35), tt + d * 0.2); g.gain.linearRampToValueAtTime(0, tt + d);
      tt += d + (sparrow ? rnd(0.08, 0.2) : rnd(0.02, 0.12));
    }
  }

  // Common swifts (vencejos) screaming past: pulsed high saws with a pan fly-by.
  swifts() {
    const A = this.A, v = A._voice({ vol: rnd(0.4, 0.8) }, A.ambBus), k = v.k, t = A.ctx.currentTime + 0.02;
    const pan = k.pan(0), p0 = rnd(-1, 1), dur = rnd(1.2, 2.2), hp = k.filter('highpass', 2500);
    pan.pan.setValueAtTime(p0, t); pan.pan.linearRampToValueAtTime(-p0 * 0.8, t + dur);
    chain(hp, pan, v.out);
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
      const tt = t + Math.random() * dur * 0.6, d = rnd(0.25, 0.6), f0 = rnd(3600, 4800), o = k.osc('sawtooth', f0, tt, tt + d);
      sweep(o.frequency, tt, f0, f0 * 0.82, d);
      const am = k.gain(0.5);
      chain(k.osc('square', rnd(55, 80), tt, tt + d), k.gain(0.5), am.gain);
      const e = k.gain(0);
      e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(0.2, tt + 0.03); e.gain.setTargetAtTime(0, tt + d * 0.6, d * 0.15);
      chain(o, am, e, hp);
    }
  }

  // Distant farm dog: a few formant-filtered barks with reverb.
  dog() {
    const A = this.A, v = this._around(50, 140, 1, 0.3), k = v.k, t = A.ctx.currentTime + 0.02, f0 = rnd(280, 420), gap = rnd(0.3, 0.5);
    for (let i = 0, n = 1 + Math.floor(Math.random() * 4); i < n; i++) {
      const tt = t + i * gap * rnd(0.85, 1.15), o = k.osc('sawtooth', f0, tt, tt + 0.2);
      sweep(o.frequency, tt, f0 * 1.25, f0 * 0.8, 0.14);
      chain(o, k.filter('bandpass', rnd(650, 900), 2.5), eg(v, tt, 0.5, 0.01, 0.12), v.out);
      chain(nz(A, v, tt, 0.12), k.filter('bandpass', 1200, 1.5), eg(v, tt, 0.12, 0.005, 0.08), v.out);
    }
  }

  // Scops owl (autillo): a soft whistled "tiu" repeated every ~2.5 s.
  owl() {
    const v = this._around(30, 100, 0.9, 0.35), k = v.k, t = this.A.ctx.currentTime + 0.02, f0 = rnd(1150, 1300), per = rnd(2.4, 3);
    for (let i = 0, n = 3 + Math.floor(Math.random() * 5); i < n; i++) {
      const tt = t + i * per, o = k.osc('sine', f0, tt, tt + 0.35), f = o.frequency, g = k.gain(0);
      f.setValueAtTime(f0 * 0.97, tt); f.linearRampToValueAtTime(f0, tt + 0.05); f.linearRampToValueAtTime(f0 * 0.94, tt + 0.28);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.35, tt + 0.06); g.gain.setTargetAtTime(0, tt + 0.18, 0.04);
      chain(o, g, v.out);
    }
  }
}

// ───────────────────────────── 9. Radio ─────────────────────────────
// A 25 ms setInterval schedules ~0.12 s ahead on the AudioContext clock. Each station composes
// endless songs (sections, progressions, motifs) from a seeded RNG, one 16th-note step at a time.

class Radio {
  constructor(A) { this.A = A; this.on = false; this.timer = null; this.cur = null; this.st = [new Rumba(A), new Urbano(A), new Rock(A), null]; }

  setOn(on) {
    const A = this.A, t = A.ctx.currentTime, lv = A._radioLevel ?? 1;
    if (on === this.on) { if (on) glide(A.radioGain.gain, lv, t, 0.1); return; }
    this.on = on;
    glide(A.radioGain.gain, on ? lv : 0, t, on ? 0.05 : 0.08);
    if (on) {
      this._play(A._station, t + 0.05);
      if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
    } else {
      if (this.cur) this.cur.pause(t + 0.3); // cut ringing notes once the fade-out is done
      this.cur = null;
      clearInterval(this.timer); this.timer = null;
    }
  }

  tune(i) {
    if (!this.on) return;
    const A = this.A, t = A.ctx.currentTime;
    if (this.cur) this.cur.pause(t);
    A._static(t);
    this._play(i, t + 0.35);
  }

  _play(i, t) { this.cur = this.st[i] || null; if (this.cur) this.cur.resume(t); }

  tick() {
    const c = this.A.ctx;
    if (!this.cur || c.state !== 'running') return;
    const ahead = typeof document !== 'undefined' && document.hidden ? 1.2 : 0.12; // throttled background timers
    try { this.cur.schedule(c.currentTime, c.currentTime + ahead); } catch (e) { this.A._warn(e); }
  }
}

class Station {
  constructor(A) { this.A = A; this.song = null; this.pos = 0; this.nextT = 0; this.pausedAt = null; this.bus = null; this.chans = []; }

  mono() { const ch = { n: null }; this.chans.push(ch); return ch; }

  mkBus(v, pan) {
    const c = this.A.ctx, g = c.createGain();
    g.gain.value = v;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.A.radioIn); } else g.connect(this.A.radioIn);
    return g;
  }

  resume(t) {
    if (!this.bus) this.bus = this.makeBus();
    if (!this.song) this.newSong();
    else if (this.pausedAt !== null) this.advance(Math.floor(Math.max(0, t - this.pausedAt) / this.song.sd)); // live radio: it kept playing
    this.pausedAt = null;
    this.nextT = t;
  }

  pause(t) { this.pausedAt = t; for (const ch of this.chans) this.cut(ch, t); }

  newSong() { this.song = this.compose(makeRng((Math.random() * 4294967296) >>> 0)); }

  advance(n) {
    let p = this.pos + n;
    while (p >= this.song.bars.length * 16) { p -= this.song.bars.length * 16; this.newSong(); }
    this.pos = p;
  }

  schedule(now, until) {
    if (this.nextT < now - 0.05) { // timer stalled: skip rather than burst
      const n = Math.ceil((now - this.nextT) / this.song.sd);
      this.nextT += n * this.song.sd; this.advance(n);
    }
    while (this.nextT < until) {
      const s = this.song, i = this.pos;
      this.step(this.nextT, s.bars[i >> 4], i & 15, s);
      this.nextT += s.sd;
      this.advance(1);
    }
  }

  // Sample hit → gain → bus, optionally gated after `dur` seconds.
  hit(buf, t, dest, vel, rate = 1, dur = 0) {
    const c = this.A.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vel;
    s.connect(g); g.connect(dest);
    s.onended = () => { s._done = true; s.disconnect(); g.disconnect(); };
    s.start(t);
    if (dur > 0) { g.gain.setValueAtTime(vel, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.012); s.stop(t + dur + 0.1); }
    return { s: [s], g };
  }

  // Oscillator note: partials o.f, optional pitch drop (pd), detune pairs, filter envelope lp=[from, to, tc, Q].
  note(t, dest, o) {
    const c = this.A.ctx, g = c.createGain(), a = o.a || 0.005, rel = o.rel || 0.05, end = t + Math.max(a, o.dur) + rel * 6, extra = [];
    let head = g;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = o.lp[3] || 0.8;
      f.frequency.setValueAtTime(o.lp[0], t); f.frequency.setTargetAtTime(o.lp[1], t + 0.003, o.lp[2]);
      f.connect(g); head = f; extra.push(f);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vel, t + a);
    if (o.d) g.gain.setTargetAtTime(o.vel * (o.sus || 0), t + a, o.d);
    g.gain.setTargetAtTime(0, t + Math.max(a, o.dur), rel);
    g.connect(dest);
    const oscs = o.f.map((fr, i) => {
      const s = c.createOscillator();
      s.type = o.type || 'sawtooth';
      if (o.pd) { s.frequency.setValueAtTime(fr * o.pd, t); s.frequency.exponentialRampToValueAtTime(fr, t + 0.05); } else s.frequency.value = fr;
      if (o.det) s.detune.value = i % 2 ? o.det : -o.det;
      s.connect(head); s.start(t); s.stop(end);
      return s;
    });
    oscs[0].onended = () => { for (const s of oscs) { s._done = true; s.disconnect(); } for (const n of extra) n.disconnect(); g.disconnect(); };
    return { s: oscs, g };
  }

  // Monophonic channels (a guitar string, the bass): a new note cuts the previous one.
  play(ch, n, t) { this.cut(ch, t); ch.n = n; }
  cut(ch, t) {
    const n = ch.n;
    if (!n) return;
    ch.n = null;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setTargetAtTime(0, t, 0.012);
    for (const s of n.s) if (!s._done) { try { s.stop(t + 0.1); } catch (e) { /* already stopped */ } }
  }
}

// ── Harmony helpers ──
const normBass = (m) => { while (m > 43) m -= 12; while (m < 28) m += 12; return m; };
const pcOf = (m) => ((m % 12) + 12) % 12;
function scalePcs(tpc, harmonic) { return new Set([0, 2, 3, 5, 7, 8, harmonic ? 11 : 10].map((i) => (tpc + i) % 12)); }
function nearest(m, pcs) {
  for (let d = 0; d < 7; d++) { if (pcs.has(pcOf(m + d))) return m + d; if (pcs.has(pcOf(m - d))) return m - d; }
  return m;
}
const parseProg = (s) => s.split(',').map((tok) => tok.split('-'));

// Melodic line over bars of chords: a stepwise walk on the minor scale (raised 7th over the
// dominant), chord tones on the beats, a long resolving note closing every 4-bar phrase.
function melody(r, bars, tpc, lo, hi) {
  const RH = ['x.x.x.x.x.x.x.x.', 'x..x..x.x.x.x...', 'x.xxx.x.x...x.x.', 'x...x.x.x.x.xxxx', 'x.x.x...xxxxx...', '..x.x.x.x.x.x.x.'];
  const pcs = scalePcs(tpc, false), scale = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(pcOf(m))) scale.push(m);
  let k = scale.length >> 1, dir = 1;
  return bars.map((b, bi) => {
    const rh = bi % 4 === 3 ? 'x.x.x...x.......' : pick(RH, r), out = new Array(16).fill(null);
    for (let s = 0; s < 16; s++) {
      if (rh[s] !== 'x') continue;
      const ch = b.ch[s < 8 ? 0 : b.ch.length - 1];
      if (r() < 0.25) dir = -dir;
      k += dir * (r() < 0.75 ? 1 : 2);
      if (k < 0 || k >= scale.length) { dir = -dir; k = clamp(k, 0, scale.length - 1); }
      let m = scale[k];
      if (ch.harm && pcOf(m - tpc) === 10) m += 1;
      if (s % 4 === 0) { m = nearest(m, ch.pcs); k = scale.reduce((best, x, i) => (Math.abs(x - m) < Math.abs(scale[best] - m) ? i : best), 0); }
      out[s] = { m, v: s % 4 === 0 ? 0.9 : 0.6 + r() * 0.25 };
    }
    return out;
  });
}

// ── Station 0: Vegas Altas FM — rumba flamenca ──
// Open-position voicings (low E → high e, null = string not played) and bass roots per degree.
const FAMILIES = {
  A: { tonic: 57,
    v: { i: [null, 45, 52, 57, 60, 64], VII: [43, 47, 50, 55, 59, 67], VI: [41, 48, 53, 57, 60, 65], V: [40, 47, 52, 56, 59, 64],
      V7: [40, 47, 50, 56, 59, 64], iv: [null, null, 50, 57, 62, 65], III: [null, 48, 52, 55, 60, 64], bII: [null, 46, 53, 58, 62, 65] },
    r: { i: 45, VII: 43, VI: 41, V: 40, V7: 40, iv: 38, III: 36, bII: 34 } },
  E: { tonic: 52,
    v: { i: [40, 47, 52, 55, 59, 64], VII: [null, null, 50, 57, 62, 66], VI: [null, 48, 52, 55, 60, 64], V: [null, 47, 51, 57, 59, 66],
      V7: [null, 47, 51, 57, 59, 66], iv: [null, 45, 52, 57, 60, 64], III: [43, 47, 50, 55, 59, 67], bII: [41, 48, 53, 57, 60, 65] },
    r: { i: 40, VII: 38, VI: 36, V: 35, V7: 35, iv: 33, III: 43, bII: 41 } },
};
const RUMBA_PROG = {
  intro: ['i,i,VII-VI,V', 'i,VII,VI,V'],
  verse: ['i,VII,VI,V,i,VII,VI,V', 'i,i,VII,VII,VI,VI,V,V', 'i-VII,VI-V,i-VII,VI-V,i-VII,VI-V,iv,V', 'i,iv,VII,III,VI,iv,V,V'],
  chorus: ['VI,VII,i,i,VI,VII,V,V', 'iv,i,V,i,iv,i,V7,V7', 'III,VII,i,V,III,VII,VI-V,i', 'VI,V,i,i,VI,V,i-V,i'],
  bridge: ['iv,iv,i,i,bII,bII,V,V', 'VI,VI,V,V'],
};
// Pattern letters — cajón: B bass, S slap, g ghost; palmas: C accented / c normal clara, s sorda.
const CAJON = { verse: 'B...S..g..B.S..g', chorus: 'B..gS.Bg..B.S.gg', fill: 'B...S...SgSgSSSS' };
const PALMAS = { verse: '..s...s...s...s.', chorus: '..c.C.c...c.C.c.', bridge: 'C..c..c.C.c.C...', intro: '....C.......C...' };
// Bass figures: step → R root, 5 fifth, 8 octave, A approach to the next chord; length in 16ths.
const bassFig = (spec) => { const k = Object.keys(spec).map(Number); return k.map((s, i) => ({ s, c: spec[s], len: (k[i + 1] || 16) - s })); };
const RUMBA_BASS = { verse: bassFig({ 0: 'R', 6: '5', 8: 'R', 12: '5', 14: 'A' }), chorus: bassFig({ 0: 'R', 3: 'R', 6: '5', 8: 'R', 10: '8', 12: '5', 14: 'A' }) };

class Rumba extends Station {
  constructor(A) {
    super(A);
    this.strings = [0, 1, 2, 3, 4, 5].map(() => this.mono());
    this.bassCh = this.mono(); this.leadCh = this.mono();
  }

  makeBus() { return { gtr: this.mkBus(0.9, -0.18), lead: this.mkBus(0.8, 0.22), perc: this.mkBus(0.8, 0.05), bass: this.mkBus(0.7, 0) }; }

  chord(fam, deg, capo) {
    const voic = fam.v[deg].map((m) => (m === null ? null : m + capo));
    return { deg, voic, root: normBass(fam.r[deg] + capo), pcs: new Set(voic.filter((m) => m !== null).map(pcOf)), harm: deg === 'V' || deg === 'V7' };
  }

  compose(r) {
    const fam = r() < 0.6 ? FAMILIES.A : FAMILIES.E, capo = pick(fam === FAMILIES.A ? [0, 0, 2, 3, 5] : [0, 2, 3, 4], r);
    const bpm = 100 + Math.floor(r() * 16), tpc = (fam.tonic + capo) % 12;
    const verse = pick(RUMBA_PROG.verse, r), chorus = pick(RUMBA_PROG.chorus, r);
    const plan = [['intro', pick(RUMBA_PROG.intro, r)], ['verse', verse], ['chorus', chorus], ['inter', 'i,VII,VI,V'], ['verse', verse],
      ['chorus', chorus], ['bridge', pick(RUMBA_PROG.bridge, r)], ['chorus', chorus], ['outro', 'i,VII,VI,V,i'], ['gap', 'i']];
    const bars = [];
    for (const [sec, prog] of plan) {
      const toks = parseProg(prog);
      toks.forEach((tok, i) => bars.push({ sec, i, n: toks.length, idx: bars.length, ch: tok.map((d) => this.chord(fam, d, capo)) }));
    }
    const lo = fam.tonic + capo + 7, hi = lo + 15, secBars = (sec) => bars.filter((b) => b.sec === sec).slice(0, 8);
    return {
      bpm, sd: 60 / bpm / 4, bars,
      mel: { intro: melody(r, secBars('intro'), tpc, lo, hi), inter: melody(r, secBars('inter'), tpc, lo, hi), chorus: melody(r, secBars('chorus'), tpc, lo, hi) },
      gv: pick(['D.u.X.u.D.u.X.u.', 'D.u.X.udD.u.X.u.', 'D...X.u.D.u.X.u.'], r),
      gc: pick(['D.U.X.UdD.U.X.U.', 'D.UdX.U.D.UdX.U.', 'R.U.X.U.D.U.X.Ud'], r),
    };
  }

  // One strum across the voicing with per-string delays. kind: D down, d light down, U up, u light up
  // (treble strings only), X golpe (muted strings + body slap), R rasgueado (four quick finger flicks).
  strum(t, ch, kind, vel) {
    if (kind === 'R') { for (let i = 0; i < 4; i++) this.strum(t + i * 0.028, ch, i < 3 ? 'r' : 'D', vel * (0.5 + i * 0.17)); return; }
    const A = this.A, v = ch.voic, mute = kind === 'X', up = kind === 'U' || kind === 'u';
    let idx = [0, 1, 2, 3, 4, 5].filter((i) => v[i] !== null);
    if (up) idx = idx.slice(kind === 'U' ? -4 : -3).reverse();
    const spread = kind === 'D' ? 0.012 : kind === 'r' ? 0.005 : 0.009;
    const acc = kind === 'D' || mute ? 1 : kind === 'U' ? 0.75 : kind === 'r' ? 0.7 : 0.55;
    idx.forEach((si, j) => {
      const tt = t + j * spread * rnd(0.8, 1.2), sv = vel * acc * rnd(0.8, 1) * (si < 2 && kind !== 'D' ? 0.7 : 1);
      this.play(this.strings[si], this.hit(A.bank.pluck(v[si], 0.5), tt, this.bus.gtr, sv * 0.3, 1, mute ? 0.045 : 0), tt);
    });
    if (mute) this.hit(A.bank.get('golpe'), t, this.bus.gtr, vel * 0.45);
  }

  step(t, bar, s, S) {
    const sec = bar.sec;
    if (sec === 'gap') return;
    const A = this.A, B = this.bus, ch = bar.ch[s < 8 ? 0 : bar.ch.length - 1], last = bar.i === bar.n - 1, end = sec === 'outro' && last;
    const tt = t + (s % 2 ? S.sd * 0.1 : 0) + rnd(-0.003, 0.003); // light swing + human timing
    const early = sec === 'intro' && bar.i < 2;
    // Guitar
    let pat = sec === 'chorus' ? S.gc : S.gv;
    if (early) pat = 'R.......R.....u.';
    else if (end) pat = 'R...............';
    else if (sec === 'bridge') pat = 'R...X...R...X.U.';
    else if (last && sec !== 'intro') pat = 'D.u.X.u.R...R.R.';
    if (pat[s] !== '.') this.strum(tt, ch, pat[s], (sec === 'chorus' ? 0.95 : sec === 'inter' ? 0.6 : 0.8) * (s % 4 === 0 ? 1 : 0.85));
    // Cajón
    const cp = end || early ? null : last && sec !== 'intro' ? CAJON.fill : sec === 'chorus' || sec === 'bridge' ? CAJON.chorus : CAJON.verse;
    const c = cp ? cp[s] : '.';
    if (c === 'B') this.hit(A.bank.get('cajonBass'), tt, B.perc, 0.75);
    else if (c === 'S') this.hit(A.bank.get('cajonSlap'), tt, B.perc, cp === CAJON.fill && s >= 8 ? 0.3 + 0.04 * (s - 8) : 0.5);
    else if (c === 'g') this.hit(A.bank.get('cajonSlap'), tt, B.perc, 0.14, 1.1);
    if (end && s === 0) this.hit(A.bank.get('cajonBass'), tt, B.perc, 0.8);
    // Palmas: two palmeros, slightly apart
    const pp = end ? null : PALMAS[sec] || PALMAS.verse, pc = pp ? pp[s] : '.';
    if (pc === 'C' || pc === 'c') {
      const a = pc === 'C' ? 0.5 : 0.3;
      this.hit(A.bank.get('palmaClara'), tt, B.perc, a, rnd(0.96, 1.04));
      this.hit(A.bank.get('palmaClara'), tt + rnd(0.004, 0.012), B.perc, a * 0.7, rnd(0.9, 1));
    } else if (pc === 's') this.hit(A.bank.get('palmaSorda'), tt, B.perc, 0.35, rnd(0.95, 1.05));
    // Bass
    if (!early) {
      const fig = end ? (s === 0 ? { c: 'R', len: 12 } : null) : RUMBA_BASS[sec === 'chorus' ? 'chorus' : 'verse'].find((f) => f.s === s);
      if (fig) {
        let m = ch.root;
        if (fig.c === '5') m += 7;
        else if (fig.c === '8') m += 12;
        else if (fig.c === 'A') { const nx = S.bars[bar.idx + 1], nr = nx && nx.sec !== 'gap' ? nx.ch[0].root : ch.root; m = nr === ch.root ? ch.root + 7 : nr + (Math.random() < 0.5 ? -1 : 2); }
        this.play(this.bassCh, this.note(tt, B.bass, { f: [mtof(m)], type: 'triangle', vel: 0.55, a: 0.004, d: 0.3, sus: 0.45, dur: fig.len * S.sd * 0.9, rel: 0.04, lp: [1100, 400, 0.07, 1] }), tt);
      }
    }
    // Lead guitar melody (falseta in intro/interlude, sung-like line in the chorus)
    const mel = S.mel[sec];
    if (mel && !early) {
      const nt = mel[bar.i % mel.length][s];
      if (nt) this.play(this.leadCh, this.hit(A.bank.pluck(nt.m, 0.75), tt, B.lead, nt.v * 0.34), tt);
    }
  }
}

// ── Station 1: Guadiana Urbana — reggaetón / urbano ──
const MINOR_DEG = { i: [0, 'm'], III: [3, 'M'], iv: [5, 'm'], v: [7, 'm'], V: [7, 'M'], VI: [8, 'M'], VII: [10, 'M'] };
const URB_PROG = [['i', 'VI', 'III', 'VII'], ['i', 'iv', 'VI', 'V'], ['i', 'VII', 'VI', 'VII'], ['VI', 'VII', 'i', 'i'], ['i', 'v', 'VI', 'iv'], ['iv', 'i', 'VII', 'VI'], ['i', 'III', 'VII', 'iv']];
const DEMBOW = '...x..x....x..x.', DEMBOW_VAR = '...x..xx...x..xx';
const URB_BASS = bassFig({ 0: 'R', 3: 'R', 6: 'R', 8: 'R', 11: 'R', 14: 'R' }); // 3-3-2 808 figure

class Urbano extends Station {
  constructor(A) { super(A); this.bassCh = this.mono(); this.padCh = this.mono(); this.leadCh = this.mono(); this.fxCh = this.mono(); }

  makeBus() {
    const c = this.A.ctx, b = { drums: this.mkBus(0.85, 0) };
    const node = (type, f, q, dest) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(dest); return n; };
    // 808: saturated for car speakers, then tamed
    const sat = c.createWaveShaper(); sat.curve = satCurve(2.2); sat.oversample = '2x';
    sat.connect(node('lowpass', 1200, 0.7, this.mkBus(0.8, 0)));
    b.bass = sat;
    // Pad through a low-pass and a kick-driven "pump" gain
    b.pump = c.createGain(); b.pump.connect(this.mkBus(0.6, -0.12));
    b.pad = node('lowpass', 1100, 0.7, b.pump);
    // Lead with a dotted-8th feedback delay
    const out = this.mkBus(0.55, 0.2), fb = c.createGain();
    b.dl = c.createDelay(1); fb.gain.value = 0.32;
    b.lead = c.createGain(); b.lead.connect(out); b.lead.connect(b.dl);
    b.dl.connect(node('lowpass', 2500, 0.7, fb)); fb.connect(b.dl); fb.connect(out);
    return b;
  }

  compose(r) {
    const bpm = 90 + Math.floor(r() * 9), root = pick([33, 35, 36, 37, 38, 40], r), pv = pick(URB_PROG, r);
    let pc = pick(URB_PROG, r);
    if (pc === pv) pc = URB_PROG[(URB_PROG.indexOf(pv) + 1) % URB_PROG.length];
    const chord = (deg) => {
      const [off, q] = MINOR_DEG[deg], rt = root + off, iv = q === 'm' ? [0, 3, 7, 10] : [0, 4, 7, 14];
      const pad = [...new Set(iv.map((i) => { let m = 48 + pcOf(rt + i); while (m < 55) m += 12; return m; }))].sort((a, b) => a - b);
      const tones = iv.slice(0, 3).map((i) => { let m = 60 + pcOf(rt + i); while (m < 67) m += 12; return m; }).sort((a, b) => a - b);
      tones.push(tones[0] + 12);
      return { root: normBass(rt), pad, tones };
    };
    const plan = [['intro', 4, pv], ['verse', 8, pv], ['pre', 4, pv], ['chorus', 8, pc], ['verse', 8, pv], ['pre', 4, pv],
      ['chorus', 8, pc], ['break', 4, pv], ['chorus', 8, pc], ['outro', 4, pv], ['gap', 1, pv]];
    const bars = [];
    for (const [sec, n, prog] of plan) for (let i = 0; i < n; i++) bars.push({ sec, i, n, idx: bars.length, ch: chord(prog[i % 4]) });
    // Arp: rhythm on the 3-3-2 grid, indices into the chord tones
    const arp = new Array(16).fill(-1);
    for (const s of pick([[0, 3, 6, 8, 11, 14], [0, 2, 3, 6, 8, 10, 11, 14], [0, 3, 6, 7, 8, 11, 14, 15]], r)) arp[s] = Math.floor(r() * 4);
    // Chorus hook: two bars on the minor pentatonic
    let lt = 60 + pcOf(root);
    if (lt < 64) lt += 12;
    const pent = [0, 3, 5, 7, 10, 12, 15].map((i) => lt + i), hook = new Array(32).fill(null);
    let j = 2;
    ['x..x..x.x..x..x.', pick(['x..x..x.x.x.x...', 'x..x..x.x..x.xx.', '..x..x..x.x.x...'], r)].forEach((rh, bi) => {
      for (let s = 0; s < 16; s++) if (rh[s] === 'x') { j = clamp(j + Math.floor(r() * 5) - 2, 0, pent.length - 1); hook[bi * 16 + s] = pent[j]; }
    });
    return { bpm, sd: 60 / bpm / 4, bars, arp, hook, oct: r() < 0.4, openHat: r() < 0.6 };
  }

  pluck(t, m, vel) {
    this.play(this.leadCh, this.note(t, this.bus.lead, { f: [mtof(m)], type: 'square', vel, a: 0.003, d: 0.07, sus: 0, dur: 0.2, rel: 0.05, lp: [4200, 700, 0.06, 3] }), t);
  }

  riser(t, dur) {
    const c = this.A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.A.bank.get('white'); s.loop = true; f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    s.connect(f); f.connect(g); g.connect(this.bus.drums);
    s.onended = () => { s._done = true; s.disconnect(); f.disconnect(); g.disconnect(); };
    s.start(t); s.stop(t + dur + 0.1);
    this.fxCh.n = { s: [s], g };
  }

  step(t, bar, s, S) {
    const sec = bar.sec;
    if (sec === 'gap') return;
    const A = this.A, B = this.bus, bk = A.bank, ch = bar.ch, last = bar.i === bar.n - 1, bd = 16 * S.sd;
    if (s === 0) glide(B.dl.delayTime, 3 * S.sd, t, 0.05, 1e-3); // dotted-8th echo follows the tempo
    const groove = sec === 'verse' || sec === 'chorus' || (sec === 'outro' && bar.i < 2);
    // Kick (+ pad pumping)
    const kick = groove ? s % 4 === 0 : (sec === 'pre' && !last && s % 8 === 0) || (sec === 'break' && !last && s === 0);
    if (kick) {
      this.hit(bk.get('kick808'), t, B.drums, s % 8 === 0 ? 0.9 : 0.8);
      B.pump.gain.setTargetAtTime(0.35, t, 0.005); B.pump.gain.setTargetAtTime(1, t + 0.04, 0.09);
    }
    // Dembow snare, clap layer, rolls into the chorus
    if (groove && (bar.i % 4 === 3 ? DEMBOW_VAR : DEMBOW)[s] === 'x') {
      this.hit(bk.get('snareUrb'), t, B.drums, 0.62);
      if (sec === 'chorus' && (s === 6 || s === 14)) this.hit(bk.get('clap'), t, B.drums, 0.3);
    }
    if (sec === 'pre' && last) this.hit(bk.get('snareUrb'), t, B.drums, 0.15 + 0.035 * s);
    // Hats and percussion
    if (groove || sec === 'pre' || (sec === 'intro' && bar.i >= 2)) {
      if (sec === 'chorus') this.hit(bk.get('hat'), t, B.drums, [0.3, 0.14, 0.22, 0.14][s % 4]);
      else if (s % 2 === 0) this.hit(bk.get('hat'), t, B.drums, s % 4 === 0 ? 0.24 : 0.17);
      if (sec === 'chorus' && S.openHat && s === 14 && bar.i % 2) this.hit(bk.get('hatOpen'), t, B.drums, 0.16);
      if (sec === 'chorus' && (s === 2 || s === 10)) this.hit(bk.get('rim'), t, B.drums, 0.25);
    }
    if (s === 0 && bar.i === 0 && (sec === 'chorus' || sec === 'verse')) this.hit(bk.get('crash'), t, B.drums, 0.22);
    if (sec === 'pre' && bar.i === 0 && s === 0) this.riser(t, bd * bar.n);
    // 808 bass
    const fig = groove ? URB_BASS.find((f) => f.s === s) : (sec === 'pre' || sec === 'break') && !last && s === 0 ? { s: 0, len: 16 } : null;
    if (fig) {
      const m = ch.root + (S.oct && s === 14 ? 12 : 0);
      this.play(this.bassCh, this.note(t, B.bass, { f: [mtof(m)], type: 'sine', pd: 1.5, vel: 0.6, a: 0.004, d: 0.5, sus: 0.5, dur: fig.len * S.sd * 0.92, rel: 0.05 }), t);
    }
    // Pad: new chord every bar, previous one releases on its own
    if (s === 0) {
      const lvl = { intro: 0.06, verse: 0.045, pre: 0.06, chorus: 0.065, break: 0.08, outro: 0.06 }[sec] || 0.05;
      glide(B.pad.frequency, { intro: 700, verse: 1100, pre: 1400, chorus: 1900, break: 900, outro: 800 }[sec] || 1100, t, 0.3, 1);
      this.padCh.n = this.note(t, B.pad, { f: ch.pad.flatMap((m) => [mtof(m), mtof(m)]), type: 'sawtooth', det: 9, vel: lvl, a: 0.35, dur: bd - 0.05, rel: 0.3 });
    }
    // Lead: arpeggio in verses/intro/break/outro, the hook in choruses
    if (sec === 'chorus') { const m = S.hook[(bar.i % 2) * 16 + s]; if (m) this.pluck(t, m, 0.1); }
    else if (S.arp[s] >= 0 && (sec !== 'verse' || bar.i % 2 === 1)) this.pluck(t, ch.tones[S.arp[s]], sec === 'verse' ? 0.06 : 0.08);
  }
}

// ── Station 2: Castúo Rock — Spanish rock ──
const ROCK_PROG = [[0, 7, 9, 5], [0, 10, 5, 0], [0, 8, 3, 10], [0, 5, 7, 5], [9, 5, 0, 7], [0, 3, 5, 3], [0, 10, 8, 10]];
const ROCK_KEYS = [40, 45, 38, 43, 42]; // E, A, D, G, F#

class Rock extends Station {
  constructor(A) { super(A); this.gtrCh = this.mono(); this.bassCh = this.mono(); this.leadCh = this.mono(); }

  makeBus() {
    const c = this.A.ctx;
    // Guitar amp: drive → waveshaper → cab-ish filters
    const amp = (pan, drive) => {
      const g = c.createGain(), sh = c.createWaveShaper(), out = this.mkBus(0.45, pan);
      g.gain.value = drive; sh.curve = satCurve(3.5, 0.1); sh.oversample = '2x';
      let prev = sh;
      for (const [type, f, q, db] of [['highpass', 110, 0.7, 0], ['peaking', 1700, 1, 5], ['lowpass', 4800, 0.7, 0]]) {
        const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = db;
        prev.connect(b); prev = b;
      }
      g.connect(sh); prev.connect(out);
      return g;
    };
    return { gtr: amp(-0.25, 3.5), lead: amp(0.3, 2.5), drums: this.mkBus(0.8, 0), bass: this.mkBus(0.7, 0) };
  }

  compose(r) {
    const bpm = 120 + Math.floor(r() * 21), key = pick(ROCK_KEYS, r), pv = pick(ROCK_PROG, r), pc = pick(ROCK_PROG, r), pb = pick(ROCK_PROG, r);
    const plan = [['intro', 4, pv], ['verse', 8, pv], ['chorus', 8, pc], ['verse', 8, pv], ['chorus', 8, pc], ['solo', 8, pv], ['bridge', 8, pb],
      ['chorus', 8, pc], ['chorus', 8, pc], ['outro', 4, pv], ['gap', 1, pv]];
    const bars = [];
    for (const [sec, n, prog] of plan) {
      for (let i = 0; i < n; i++) { let m = key + prog[i % 4]; while (m > 49) m -= 12; bars.push({ sec, i, n, idx: bars.length, root: m }); }
    }
    // Two-bar pentatonic riff in 8th notes
    const pent = [0, 3, 5, 7, 10, 12].map((i) => key + 12 + i), riff = new Array(32).fill(null);
    let j = 0;
    for (let e = 0; e < 16; e++) if (e % 8 === 0 || r() < 0.72) { j = e % 8 === 0 ? 0 : clamp(j + Math.floor(r() * 5) - 2, 0, pent.length - 1); riff[e * 2] = pent[j]; }
    return { bpm, sd: 60 / bpm / 4, bars, riff };
  }

  power(t, m, kind, len, S) {
    const open = kind !== 'm';
    this.play(this.gtrCh, this.note(t, this.bus.gtr, {
      f: [m, m + 7, m + 12].map(mtof), type: 'sawtooth', det: 5, vel: kind === 'O' ? 0.2 : kind === 'o' ? 0.16 : 0.13, a: 0.003,
      d: open ? 0.9 : 0.06, sus: open ? 0.55 : 0.25, dur: len * S.sd * (open ? 0.95 : 0.7), rel: open ? 0.08 : 0.03,
      lp: open ? [5000, 2400, 0.25, 0.7] : [1600, 650, 0.04, 1],
    }), t);
  }

  step(t, bar, s, S) {
    const sec = bar.sec;
    if (sec === 'gap') return;
    const B = this.bus, bk = this.A.bank, last = bar.i === bar.n - 1, end = sec === 'outro' && last, early = sec === 'intro' && bar.i < 2;
    // Drums (with a snare/tom fill closing each section)
    if (!early && !end) {
      if (last && s >= 8) {
        const f = ['snare', 'snare', 'snare', 'snare', 'tomHi', 'tomHi', 'tomLo', 'tomLo'][s - 8];
        this.hit(bk.get(f), t, B.drums, [0.9, 0.5, 0.8, 0.6, 0.8, 0.7, 0.9, 0.8][s - 8]);
        if (s === 8 || s === 14) this.hit(bk.get('kick'), t, B.drums, 0.85);
      } else {
        const big = sec === 'chorus' || sec === 'solo';
        const K = sec === 'bridge' ? 'x.........x.....' : big ? 'x.....x.x.x.....' : bar.i % 2 ? 'x.......x.x.....' : 'x.......x.......';
        const Sn = sec === 'bridge' ? '........x.......' : '....x.......x...';
        if (K[s] === 'x') this.hit(bk.get('kick'), t, B.drums, 0.9);
        if (Sn[s] === 'x') this.hit(bk.get('snare'), t, B.drums, 0.75);
        if (s % 2 === 0) this.hit(bk.get(big ? 'hatOpen' : 'hat'), t, B.drums, big ? 0.14 : s % 4 === 0 ? 0.28 : 0.18);
      }
    }
    if (s === 0 && ((bar.i === 0 && sec !== 'intro') || end)) { this.hit(bk.get('crash'), t, B.drums, 0.3); if (end) this.hit(bk.get('kick'), t, B.drums, 0.9); }
    // Rhythm guitar: palm-muted 8ths in verses, open power chords in choruses
    let gp = null;
    if (sec === 'verse') gp = last ? 'O.m.m.m.O...O.O.' : bar.i % 2 ? 'm.m.m.m.m.m.m.m.' : 'O.m.m.m.m.m.m.m.';
    else if (sec === 'chorus' || sec === 'solo') gp = last ? 'O.o.o.o.O.O.O.O.' : 'O.o.o.o.O.o.o.o.';
    else if (sec === 'bridge') gp = 'O.......O.......';
    else if (sec === 'outro') gp = end ? 'O...............' : 'O.o.o.o.O.o.o.o.';
    else if (!early) gp = 'O.......O.....o.';
    if (gp && gp[s] !== '.') this.power(t, bar.root, gp[s], gp[s] === 'O' ? (end ? 16 : sec === 'bridge' ? 8 : 2) : 2, S);
    // Bass: driving 8ths (half notes in the bridge), octave pops in the chorus
    if (!early && s % 2 === 0 && (!end || s === 0) && (sec !== 'bridge' || s % 8 === 0)) {
      const m = bar.root - 12 + ((sec === 'chorus' || sec === 'solo') && (s === 6 || s === 14) ? 12 : 0), len = end ? 12 : sec === 'bridge' ? 8 : 2;
      this.play(this.bassCh, this.note(t, B.bass, { f: [mtof(m)], type: 'sawtooth', vel: 0.3, a: 0.003, d: 0.15, sus: 0.6, dur: len * S.sd * 0.85, rel: 0.04, lp: [1500, 420, 0.06, 1.2] }), t);
    }
    // Lead riff: alone in the intro, an octave up for the solo and the bridge
    if (sec === 'intro' || sec === 'bridge' || sec === 'solo') {
      const m = S.riff[(bar.i % 2) * 16 + s];
      if (m) this.play(this.leadCh, this.note(t, B.lead, { f: [mtof(m + (sec === 'intro' ? 0 : 12))], type: 'sawtooth', vel: 0.14, a: 0.004, d: 0.3, sus: 0.6, dur: S.sd * 1.8, rel: 0.05, lp: [3800, 2200, 0.2, 0.8] }), t);
    }
  }
}

export default GameAudio;
