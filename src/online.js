// Multijugador online sin servidor propio, para jugar desde la página de GitHub: los navegadores se hablan directamente
// (WebRTC) y, para encontrarse, usan unos servidores públicos de mensajería (MQTT) que solo llevan las presentaciones,
// cifradas con la clave de la sala; si dos navegadores no consiguen verse directamente (algunas redes móviles), también
// sus mensajes viajan por ahí, a menos veces por segundo.
// Hace de servidor.py dentro del propio navegador: entrega a Net los mismos mensajes (welcome, join, profile, ready,
// start, st, ev, leave, host), así que el resto del juego no nota la diferencia.

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://broker-cn.emqx.io:8084/mqtt'];
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const PROTO = 'guarena-evo/p1/';     // a new protocol gets a new prefix, so different versions never mix
export const ONLINE_MAX = 16;    // everyone talks to everyone: a room is a few friends, not a stadium
const HELLO_EVERY = 7000, GONE_AFTER = 30000, AWAY_GONE = 150000, RELAY_AFTER = 7000, RELAY_ST_DT = 0.2;
// (a page in a background tab gets its timers slowed down to one a minute: «away», the others wait longer for it)
const te = new TextEncoder(), td = new TextDecoder();

export const onlinePossible = () => typeof RTCPeerConnection === 'function' && typeof WebSocket === 'function' && !!(globalThis.crypto && crypto.subtle) && /^https?:$/.test(location.protocol);
// a room code people can read out loud: no 0/O, 1/I/L
export function newRoomCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (const b of crypto.getRandomValues(new Uint8Array(5))) s += A[b % A.length]; return s; }
export function roomFromHash(h = location.hash) { const m = /^#sala-([A-Za-z0-9]{4,12})$/.exec(h || ''); return m ? m[1].toUpperCase() : null; }

// ---------------------------------------------------------------- the smallest MQTT 3.1.1 client (over WebSocket)
function mstr(s) { const b = te.encode(s), o = new Uint8Array(2 + b.length); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
function cat(...parts) { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; }
function packet(type, body) {
  const len = []; let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
  return cat(new Uint8Array([type, ...len]), body);
}
class Mqtt {
  constructor(url, onMsg, onDown) {
    this.url = url; this.onMsg = onMsg; this.onDown = onDown;
    this.ws = null; this.up = false; this.buf = new Uint8Array(0); this.pid = 1; this.subs = []; this.ping = null;
  }
  open(timeout = 7000) {
    return new Promise((resolve, reject) => {
      let ws, done = false;
      const fail = (why) => { if (done) return; done = true; clearTimeout(to); try { ws && ws.close(); } catch (e) { /* closed */ } reject(new Error(why)); };
      const to = setTimeout(() => fail('timeout'), timeout);
      try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { fail('ws'); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        const id = 'gu' + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
        ws.send(packet(0x10, cat(mstr('MQTT'), new Uint8Array([4, 2, 0, 40]), mstr(id))));  // clean session, 40 s keep-alive
      };
      ws.onmessage = (e) => {
        this.feed(new Uint8Array(e.data), (type, flags, body) => {
          if (type === 2 && !done) { // CONNACK
            if (body[1] !== 0) { fail('refused'); return; }
            done = true; clearTimeout(to); this.up = true;
            this.ping = setInterval(() => this.raw(new Uint8Array([0xc0, 0])), 25000);
            resolve(this);
          } else if (type === 3) { // PUBLISH (we only ask for QoS 0)
            const tl = (body[0] << 8) | body[1], topic = td.decode(body.subarray(2, 2 + tl));
            const qos = (flags >> 1) & 3, at = 2 + tl + (qos ? 2 : 0);
            this.onMsg(topic, body.subarray(at));
          }
        });
      };
      ws.onerror = () => fail('error');
      ws.onclose = () => { const was = this.up; this.up = false; clearInterval(this.ping); if (!done) fail('closed'); else if (was && this.onDown) this.onDown(this); };
    });
  }
  feed(chunk, handle) {
    let b = this.buf.length ? cat(this.buf, chunk) : chunk;
    for (;;) {
      if (b.length < 2) break;
      let rem = 0, mul = 1, i = 1, ok = false;
      for (; i < 5 && i < b.length; i++) { rem += (b[i] & 127) * mul; mul *= 128; if (!(b[i] & 128)) { ok = true; break; } }
      if (!ok) break;
      const end = i + 1 + rem;
      if (b.length < end) break;
      handle(b[0] >> 4, b[0] & 15, b.subarray(i + 1, end));
      b = b.subarray(end);
    }
    this.buf = b.length ? b.slice() : new Uint8Array(0);
  }
  raw(bytes) { if (this.ws && this.ws.readyState === 1) { try { this.ws.send(bytes); } catch (e) { /* closing */ } } }
  sub(topic) { const id = this.pid++ & 0xffff || 1; this.raw(packet(0x82, cat(new Uint8Array([id >> 8, id & 255]), mstr(topic), new Uint8Array([0])))); }
  pub(topic, payload) { this.raw(packet(0x30, cat(mstr(topic), payload))); }
  close() { this.onDown = null; this.raw(new Uint8Array([0xe0, 0])); clearInterval(this.ping); try { this.ws && this.ws.close(); } catch (e) { /* closed */ } this.up = false; }
}

// ---------------------------------------------------------------- the room's key: what is said in a room stays in it
async function roomKeys(room) {
  const raw = await crypto.subtle.digest('SHA-256', te.encode('guarena-sala:' + room));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const th = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('guarena-tema:' + room)));
  return { key, topic: PROTO + [...th.subarray(0, 9)].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
  return cat(iv, ct);
}
async function unseal(key, bytes) {
  if (bytes.length < 29) return null;
  try { return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)))); } catch (e) { return null; }
}
// what servidor.py lets through of a character description: plain values, short texts
function cleanDesc(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const o = {};
  for (const [k, v] of Object.entries(d).slice(0, 48)) {
    if (k.length > 24 || k === '__proto__') continue;
    if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || v === null) o[k] = v;
    else if (typeof v === 'string') o[k] = v.slice(0, 220);
    else if (k === 'start' && v && typeof v === 'object') { const s = {}; for (const [kk, vv] of Object.entries(v).slice(0, 8)) if (typeof vv === 'number' && Number.isFinite(vv)) s[kk] = vv; o.start = s; }
  }
  return o;
}
const ivKey = (b) => { let s = ''; for (let i = 0; i < 12; i++) s += String.fromCharCode(b[i]); return s; };

// ---------------------------------------------------------------- the room
export class Mesh {
  // deliver(msg): what servidor.py would have sent to this browser
  constructor(deliver, onDown) {
    this.deliver = deliver; this.onDown = onDown;
    this.brokers = new Map(); // url -> Mqtt
    this.peers = new Map();   // id -> peer
    this.early = new Map();   // signals from someone we have not heard say hello yet
    this.seen = new Set(); this.seenQ = [];
    this.open = false; this.hostNow = null; this.relayT = 0;
  }
  get size() { return this.peers.size; }
  get brokersUp() { let n = 0; for (const b of this.brokers.values()) if (b.up) n++; return n; }
  async start(room, name, desc) {
    this.room = room;
    Object.assign(this, await roomKeys(room));
    this.id = 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646);
    this.since = Date.now();
    this.me = { name, desc, ready: false, playing: false };
    this.byeBytes = await seal(this.key, { k: 'bye', from: this.id });
    // all the brokers at once: in at the first that answers, the others join as they come
    try {
      await new Promise((resolve, reject) => {
        let left = BROKERS.length, won = false;
        for (const url of BROKERS) {
          this.connectBroker(url).then(() => { if (!won) { won = true; resolve(); } }, () => { if (--left === 0 && !won) reject(new Error('sin servidores')); });
        }
      });
    } catch (e) { this.close(); throw e; }
    this.open = true;
    this.hostNow = this.hostId();
    this.deliver({ t: 'welcome', id: this.id, host: this.hostNow, players: [], started: false });
    this.hello();
    this.timer = setInterval(() => this.tick(), 1000);
    // going to another tab or coming back: tell the others at once (see «away»)
    this.onVis = () => this.hello();
    document.addEventListener('visibilitychange', this.onVis);
    return this;
  }
  async connectBroker(url, attempt = 0) {
    const m = new Mqtt(url, (topic, payload) => this.onBroker(topic, payload), () => this.brokerDown(url, 0));
    this.brokers.set(url, m);
    try { await m.open(); }
    catch (e) { if (this.brokers.get(url) === m) this.brokers.delete(url); if (!this.closed) this.retryBroker(url, attempt + 1); throw e; }
    if (this.closed) { m.close(); return; }
    m.sub(this.topic + '/all'); m.sub(this.topic + '/' + this.id);
    if (this.open) this.hello(); // back after a cut: say hello again
  }
  brokerDown(url) {
    this.brokers.delete(url);
    if (!this.closed) this.retryBroker(url, 1);
    if (!this.brokersUp && this.onDown) this.onDown();
  }
  retryBroker(url, attempt) {
    const wait = Math.min(60000, 4000 * 2 ** Math.min(4, attempt));
    setTimeout(() => { if (!this.closed && !this.brokers.has(url)) this.connectBroker(url, attempt).catch(() => {}); }, wait);
  }
  async publish(topic, obj, bytes = null) {
    const b = bytes || (await seal(this.key, obj));
    for (const m of this.brokers.values()) if (m.up) m.pub(topic, b);
  }
  async onBroker(topic, payload) {
    if (this.closed || payload.length < 29) return;
    const k = ivKey(payload);
    if (this.seen.has(k)) return; // the same message through another broker
    this.seen.add(k); this.seenQ.push(k);
    if (this.seenQ.length > 600) this.seen.delete(this.seenQ.shift());
    const m = await unseal(this.key, payload);
    if (!m || typeof m !== 'object' || !Number.isInteger(m.from) || m.from === this.id) return;
    if (m.k === 'hi') this.onHello(m);
    else if (m.k === 'bye') this.gone(m.from);
    else if (m.k === 'r') { if (Array.isArray(m.to) && m.to.includes(this.id)) { const p = this.peers.get(m.from); if (p && !p.direct) this.onData(p, m.m); } }
    else if (m.k === 'sdp' || m.k === 'ice') this.onSignal(m);
  }

  // ------------------------------------------------------------ who is here
  hello(direct = null) {
    if (!this.open) return;
    const m = { k: 'hi', from: this.id, since: this.since, name: this.me.name, desc: this.me.desc, ready: this.me.ready, playing: this.me.playing, away: typeof document !== 'undefined' && document.visibilityState === 'hidden' };
    this.lastHello = Date.now();
    if (direct) { this.sendDirect(direct, m); return; }
    this.publish(this.topic + '/all', m);
    const s = JSON.stringify(m);
    for (const p of this.peers.values()) if (p.ev && p.ev.readyState === 'open') { try { p.ev.send(s); } catch (e) { /* closing */ } }
  }
  onHello(m) {
    const now = Date.now();
    let p = this.peers.get(m.from);
    const name = String(m.name || 'Jugador').replace(/[\x00-\x1f<>]/g, '').slice(0, 20) || 'Jugador';
    const desc = cleanDesc(m.desc);
    if (!p) {
      if (this.peers.size >= ONLINE_MAX - 1) return;
      p = { id: m.from, name, desc, since: +m.since || now, ready: !!m.ready, playing: !!m.playing, seen: now, first: now, pc: null, gen: 0, iceQ: [], direct: false, tries: 0, nextTry: 0 };
      this.peers.set(p.id, p);
      this.deliver({ t: 'join', p: { id: p.id, name, desc, ready: p.ready, playing: p.playing } });
      // a newcomer: tell them we are here (a moment later, so a room full of people does not all answer at once)
      if (!this.helloSoon) this.helloSoon = setTimeout(() => { this.helloSoon = null; this.hello(); }, 100 + Math.random() * 600);
      const e = this.early.get(p.id);
      if (e) { this.early.delete(p.id); for (const s of e.list) this.onSignal(s); }
      this.checkHost();
      this.connect(p);
      return;
    }
    p.seen = now; p.away = !!m.away;
    if (name !== p.name || JSON.stringify(desc) !== JSON.stringify(p.desc)) { p.name = name; p.desc = desc; this.deliver({ t: 'profile', id: p.id, name, desc }); }
    if (!!m.playing !== p.playing || !!m.ready !== p.ready) { p.ready = !!m.ready; p.playing = !!m.playing; this.deliver({ t: 'ready', id: p.id, on: p.ready, playing: p.playing }); }
  }
  gone(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    this.closePc(p);
    this.deliver({ t: 'leave', id });
    this.checkHost();
  }
  // whoever has been longest in the room keeps the time of day for everybody
  hostId() {
    let best = { id: this.id, since: this.since };
    for (const p of this.peers.values()) if (p.since < best.since || (p.since === best.since && p.id < best.id)) best = p;
    return best.id;
  }
  checkHost() { const h = this.hostId(); if (h !== this.hostNow) { this.hostNow = h; this.deliver({ t: 'host', id: h }); } }
  tick() {
    if (this.closed) return;
    const now = Date.now();
    if (now - (this.lastHello || 0) > HELLO_EVERY) this.hello();
    for (const p of [...this.peers.values()]) {
      if (now - p.seen > (p.away ? AWAY_GONE : GONE_AFTER)) { this.gone(p.id); continue; }
      // the one with the smaller number calls; if a call does not get through, it tries again, less and less often
      if (this.id < p.id && !p.direct && now > p.nextTry && (!p.pc || now - p.callT > 9000)) this.connect(p, true);
    }
  }

  // ------------------------------------------------------------ the direct line (WebRTC)
  makePc(p, gen) {
    this.closePc(p);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p.pc = pc; p.gen = gen; p.callT = Date.now();
    p.st = pc.createDataChannel('st', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    p.ev = pc.createDataChannel('ev', { negotiated: true, id: 1, ordered: true });
    p.ev.onopen = () => { if (p.pc !== pc) return; p.direct = true; p.tries = 0; this.hello(p); };
    p.ev.onclose = () => { if (p.pc === pc) { p.direct = false; p.away = false; p.seen = Math.min(p.seen, Date.now() - GONE_AFTER + 5000); } };
    for (const ch of [p.st, p.ev]) ch.onmessage = (e) => { if (p.pc !== pc) return; let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.onData(p, m); };
    pc.onicecandidate = (e) => { if (e.candidate && p.pc === pc) this.publish(this.topic + '/' + p.id, { k: 'ice', from: this.id, n: gen, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (p.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') { this.closePc(p); p.nextTry = Date.now() + Math.min(60000, 3000 * 2 ** Math.min(4, p.tries)); }
    };
    return pc;
  }
  closePc(p) {
    const pc = p.pc;
    p.pc = null; p.direct = false; p.st = p.ev = null;
    if (pc) { try { pc.close(); } catch (e) { /* closed */ } }
  }
  async connect(p, retry = false) {
    if (this.id > p.id || this.closed) return; // they will call us
    if (p.direct || (p.pc && !retry)) return;
    p.tries++;
    p.nextTry = Date.now() + Math.min(90000, 10000 * 2 ** Math.min(4, p.tries - 1)); // (calls that never get through: less and less often)
    const gen = (p.gen || 0) + 1, pc = this.makePc(p, gen);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (p.pc === pc) this.publish(this.topic + '/' + p.id, { k: 'sdp', from: this.id, n: gen, d: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch (e) { if (p.pc === pc) this.closePc(p); }
  }
  async onSignal(s) {
    const p = this.peers.get(s.from);
    if (!p) { // they called before their hello reached us
      let e = this.early.get(s.from);
      if (!e) { if (this.early.size > 40) this.early.clear(); e = { list: [] }; this.early.set(s.from, e); }
      if (e.list.length < 60) e.list.push(s);
      return;
    }
    try {
      if (s.k === 'sdp' && s.d && s.d.type === 'offer') {
        if (this.id < p.id) return; // we are the one who calls in this pair
        const pc = this.makePc(p, s.n);
        await pc.setRemoteDescription(s.d);
        await pc.setLocalDescription(await pc.createAnswer());
        if (p.pc !== pc) return;
        this.publish(this.topic + '/' + p.id, { k: 'sdp', from: this.id, n: s.n, d: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        this.flushIce(p);
      } else if (s.k === 'sdp' && s.d && s.d.type === 'answer') {
        if (p.pc && p.gen === s.n && !p.pc.remoteDescription) { await p.pc.setRemoteDescription(s.d); this.flushIce(p); }
      } else if (s.k === 'ice' && s.c) {
        if (p.pc && p.gen === s.n && p.pc.remoteDescription) await p.pc.addIceCandidate(s.c);
        else if (!p.pc || s.n >= p.gen) { p.iceQ.push(s); if (p.iceQ.length > 80) p.iceQ.shift(); }
      }
    } catch (e) { /* a stale or broken offer: the next call will do */ }
  }
  async flushIce(p) {
    const q = p.iceQ.filter((s) => s.n === p.gen); p.iceQ = p.iceQ.filter((s) => s.n > p.gen);
    for (const s of q) { try { await p.pc.addIceCandidate(s.c); } catch (e) { /* stale */ } }
  }
  sendDirect(p, m) { const ch = p.ev; if (ch && ch.readyState === 'open') { try { ch.send(JSON.stringify(m)); } catch (e) { /* closing */ } } }
  onData(p, m) {
    if (!m || typeof m !== 'object') return;
    p.seen = Date.now();
    if (m.k === 'hi') { this.onHello({ ...m, from: p.id }); return; }
    if (m.k === 'bye') { this.gone(p.id); return; }
    if (m.t === 'st' || m.t === 'ev') { m.id = p.id; this.deliver(m); }
  }

  // ------------------------------------------------------------ what Net sends to «the server»
  send(obj) {
    if (!this.open || !obj) return;
    const t = obj.t;
    if (t === 'st' || t === 'ev') {
      const s = JSON.stringify(obj), relay = [], now = Date.now();
      for (const p of this.peers.values()) {
        if (!p.playing) continue;
        const ch = t === 'st' ? p.st : p.ev;
        if (ch && ch.readyState === 'open') { if (ch.bufferedAmount < 262144) { try { ch.send(s); } catch (e) { /* closing */ } } }
        else if (now - p.first > RELAY_AFTER) relay.push(p.id);
      }
      // the ones we cannot reach directly hear us through the brokers: every event, and the position 5 times a second
      if (relay.length) {
        const nowS = performance.now() / 1000;
        if (t === 'st' && nowS - this.relayT < RELAY_ST_DT) return;
        if (t === 'st') this.relayT = nowS;
        this.publish(this.topic + '/all', { k: 'r', from: this.id, to: relay, m: obj });
      }
    } else if (t === 'profile') { this.me.name = obj.name; this.me.desc = obj.desc; this.hello(); }
    else if (t === 'ready') {
      this.me.ready = !!obj.on;
      // online there is no waiting room: «ready» means in you go, beside whoever is already in the street
      if (this.me.ready && !this.me.playing) {
        this.me.playing = true;
        const order = [this.id, ...[...this.peers.values()].filter((p) => p.playing).map((p) => p.id)].sort((a, b) => a - b);
        const late = [...this.peers.values()].some((p) => p.playing);
        this.hello();
        this.deliver({ t: 'start', late, order });
      } else this.hello();
    } else if (t === 'menu') { this.me.ready = false; this.me.playing = false; this.hello(); }
  }
  // the page is closing: say goodbye with what is already sealed (there is no time to encrypt anything now)
  bye() {
    if (!this.open) return;
    for (const m of this.brokers.values()) if (m.up) m.pub(this.topic + '/all', this.byeBytes);
    for (const p of this.peers.values()) this.sendDirect(p, { k: 'bye' });
  }
  close() {
    if (this.closed) return;
    this.bye();
    this.closed = true; this.open = false;
    clearInterval(this.timer); clearTimeout(this.helloSoon);
    if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
    for (const p of this.peers.values()) this.closePc(p);
    this.peers.clear();
    for (const m of this.brokers.values()) m.close();
    this.brokers.clear();
  }
}
