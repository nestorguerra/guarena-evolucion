// Dev-only: the town's life measured, as the game runs it (the picture not drawn: fast). The player stands at a place
// of the town at an hour and a weekday; the game runs `seconds` of real time and this counts:
//  - people: how many there are within 60 / 120 m, what they are doing, who walks through whom, who walks in the road
//    away from a zebra crossing, who crosses with a car coming, how many lines they say and how often one repeats
//  - traffic: speed over the legal limit (Spain since 2021: 20 km/h single-platform streets, 30 in town, 50 on the
//    travesías signed at the town entries, 90 on the roads outside), STOP lines passed rolling, zebra crossings passed with
//    someone on them or waiting at their kerb, unsigned junctions entered with a car coming from the right, time headway
//    under one second, harsh braking, near misses with people, crashes; motorbikes and bicycles on the road
//   const T = await import('/tools/townlab.js?' + Date.now()); await T.run('plaza', { hour: 20.2, wd: 1 })
//   await T.suite('antes') → .snaps/townlab_antes.json (every scenario of SCENES)
// Start the game with the menu's Play button first (document.getElementById('bPlay').click(), then #bStart).
const G = () => window.game;
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const KMH = 3.6;

// the places (from the map, deterministic)
export function place(name) {
  const g = G(), map = g.map, lm = g.world.landmarks.poi;
  const area = (re) => { const a = map.areas.find((q) => re.test(q.name)); if (!a) return null; let x = 0, z = 0; const r = a.ring; for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; } return { x: x / (r.length / 2), z: z / (r.length / 2) }; };
  const onWalk = (p) => { const q = map.nearestEdge(p.x, p.z, 60, (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track'); return q ? { x: q.x, z: q.z } : p; };
  if (name === 'plaza') return onWalk(lm.plaza || { x: -35, z: 40 });
  if (name === 'iglesia') return onWalk(lm.churchDoor || lm.churchTower);
  if (name === 'colegio') { // the school gate (as census.js finds it: the point of the grounds nearest a street)
    const a = map.areas.find((q) => /C\.P San Gregorio$/.test(q.name));
    if (!a) return onWalk(area(/San Gregorio/));
    const ok = (e) => e.walk && !e.blocked && !e.dirt && e.cls !== 'track', r = a.ring, c = area(/C\.P San Gregorio$/);
    const q0 = map.nearestEdge(c.x, c.z, 40, ok);
    if (q0 && q0.d <= 40) return onWalk(c);
    let best = c, bd = Infinity;
    for (let i = 0; i < r.length; i += 2) { const t = map.nearestEdge(r[i], r[i + 1], 60, ok); if (t && t.d < bd) { bd = t.d; best = { x: r[i], z: r[i + 1] }; } }
    return onWalk(best);
  }
  if (name === 'abastos') return onWalk(area(/Mercado de Abastos/) || area(/Plaza de Abastos/));
  if (name === 'mercadillo') { const m = g.mercadillo && g.mercadillo.center; return m ? onWalk({ x: m.x, z: m.z }) : onWalk(lm.plaza); }
  if (name === 'calle') { // a residential street of the old town, 160–260 m from the plaza
    const P = lm.plaza, tmp = {};
    let best = null;
    for (const e of map.edges) {
      if (e.cls !== 'residential' || e.len < 60 || !map.inTown(e.pts[0], e.pts[1])) continue;
      map.sample(e, e.len / 2, tmp);
      const d = Math.hypot(tmp.x - P.x, tmp.z - P.z);
      if (d < 160 || d > 260) continue;
      const sc = Math.abs(d - 210) + Math.abs(e.w - 6) * 4;
      if (!best || sc < best.sc) best = { sc, x: tmp.x, z: tmp.z };
    }
    return best ? onWalk(best) : onWalk(P);
  }
  if (name === 'avenida') { // the busiest main road through the town
    const P = lm.plaza, tmp = {};
    let best = null;
    for (const e of map.edges) {
      if ((e.cls !== 'primary' && e.cls !== 'tertiary') || e.len < 50 || !map.inTown(e.pts[0], e.pts[1])) continue;
      map.sample(e, e.len / 2, tmp);
      const d = Math.hypot(tmp.x - P.x, tmp.z - P.z);
      if (!best || d < best.d) best = { d, x: tmp.x, z: tmp.z };
    }
    return best ? onWalk(best) : onWalk(P);
  }
  return onWalk(lm.plaza);
}

// the legal speed limit of a street (m/s), by the Reglamento General de Circulación (art. 50, 2021)
export function legalLimit(map, e) {
  const n = e.pts.length;
  const town = map.inTown(e.pts[0], e.pts[1]) || map.inTown(e.pts[n - 2], e.pts[n - 1]);
  if (e.dirt || e.cls === 'track') return 30 / KMH;
  if (!town) return (e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary' ? 90 : 50) / KMH;
  if (e.cls === 'living_street' || (e.w < 5.5 && (e.sw || 0) < 0.4)) return 20 / KMH; // single platform: no kerb to speak of
  if (e.cls === 'primary' || e.cls === 'secondary' || e.cls === 'tertiary') return 50 / KMH; // the signed travesía
  return 30 / KMH;
}

// zebra crossings: the drive edge, where along it, its half width
function zebras(map) {
  if (map._tlZebras) return map._tlZebras;
  const out = [];
  for (const p of map.pois) {
    if (p.kind !== 'highway:crossing') continue;
    const q = map.nearestEdge(p.x, p.z, 8, (e) => e.drive);
    if (!q) continue;
    out.push({ e: q.edge, s: q.s, x: q.x, z: q.z, hw: q.edge.w / 2 });
  }
  return (map._tlZebras = out);
}
// the junction rule for an approach (stop | ceda | null: unsigned)
const ruleOf = (map, e, node) => (map.stops ? map.stops.get(e.id + ':' + node) : null) || null;

export async function run(where = 'plaza', { hour = 11, wd = 1, seconds = 90, warm = 45, dt = 1 / 30, tag = null } = {}) {
  const g = G(), map = g.map, p = g.player;
  if (!g || !g.player || !g.player.char) throw new Error('start a game first (bPlay, then bStart)');
  if (g.state === 'paused') g.state = 'play'; // (the hidden tab pauses the game)
  for (const id of ['pause', 'menu']) { const el = document.getElementById(id); if (el) el.hidden = true; }
  const keepRender = g.render; g.render = () => {};
  // the day of the week (sky.day: 0 is a Saturday) and the hour
  g.sky.day = ((wd - 5) % 7 + 7) % 7 + 14;
  // (an hour of the game is 90 s: start early enough that the measured stretch is centred on the hour asked for)
  g.sky.hour = hour - (warm + seconds / 2) / 90;
  const at = place(where);
  p.spawnAt(at.x, at.z, 0);
  if (g.peds && g.peds.clear) g.peds.clear();
  const step = (k = 1) => { for (let i = 0; i < k; i++) { if (g.state !== 'play') g.state = 'play'; p.pos.x = at.x; p.pos.z = at.z; p.vel.x = p.vel.z = 0; g.frame(dt); } };
  const Z = zebras(map);
  // what was said
  const said = [], peds = g.peds, keepSay = peds.say.bind(peds);
  peds.say = (ped, text, free) => { said.push({ t: g.time, text: String(text), who: ped }); return keepSay(ped, text, free); };
  // crashes
  let crashes = 0, scrapes = 0, carPeds = 0;
  const keepImpact = g.fleet.onImpact.bind(g.fleet);
  g.fleet.onImpact = (v, imp, px, pz, other) => {
    if (measuring && v.ai && !(other && other.driver === 'player')) { if (other && other.ai && imp >= 2) crashes += 0.5; else if (!other && imp >= 3) scrapes++; }
    return keepImpact(v, imp, px, pz, other);
  };
  // chats among the people (whether or not the player is near enough to hear them)
  let chats = 0;
  const keepChat = peds.startChat.bind(peds);
  peds.startChat = (...a) => { if (measuring) chats++; return keepChat(...a); };
  const keepKnock = peds.knock.bind(peds);
  peds.knock = (ped, vx, vz, byV) => { if (byV && byV.ai && measuring) carPeds++; return keepKnock(ped, vx, vz, byV); };
  let measuring = false;
  // ---- warm up: people come out, traffic arrives
  const tW = performance.now();
  for (let i = 0; i < warm / dt; i++) { step(); if (i % 30 === 0) await yieldNow(); }
  const warmMs = performance.now() - tW;
  measuring = true;
  said.length = 0;
  const M = {
    frames: 0, ped60: 0, ped120: 0, pedMax60: 0, states: {}, overlaps: 0, jaywalkS: 0, midS: 0, onRoadS: 0, unsafeCross: 0, pedS: 0,
    carS: 0, overS: 0, overKmh: 0, speedSum: 0, stopRolls: 0, stopsPassed: 0, zebraPass: 0, zebraViol: 0, rightViol: 0, unsignedEntries: 0,
    headwayLow: 0, headwayN: 0, harsh: 0, nearMiss: 0, cars: 0, twoWheel: new Set(), carIds: new Set(),
  };
  const lastV = new Map(), nearSeen = new Set(), stopTrack = new Map(), zebraTrack = new Map(), nodeIn = new Map(), crossSeen = new Set();
  const N = Math.round(seconds / dt);
  const t0 = performance.now();
  for (let f = 0; f < N; f++) {
    step();
    M.frames++;
    // ---------------- people
    let n60 = 0, n120 = 0;
    const L = peds.list;
    for (const q of L) {
      const d = Math.hypot(q.x - at.x, q.z - at.z);
      if (d < 60) n60++;
      if (d < 120) n120++;
      if (d < 120) { M.states[q.state] = (M.states[q.state] || 0) + 1; M.pedS += dt; }
      const moving = q.speed > 0.3 && q.state !== 'sit';
      if (!moving || d > 120 || q.inCar) continue;
      // in the carriageway?
      const road = map.roadAt(q.x, q.z, -0.15);
      if (road && !road.walkOnly && !road.closed && legalLimit(map, road) > 21 / KMH) {
        // walking along the edge of a street with no room on the pavement is one thing (art. 121); being out in the
        // middle of the carriageway (crossing it) is what counts here
        const qq = map.nearestEdge(q.x, q.z, 8, (x) => x === road);
        if (!qq || qq.d > road.w / 2 - 1.1) continue;
        M.onRoadS += dt;
        // on a zebra: fine; at a corner: fine (art. 124: where there is no crossing, the shortest way over); in the
        // middle of a street with a zebra crossing within 40 m: not fine
        const sq = qq.s;
        const zb = Z.some((z) => z.e === road && Math.abs(sq - z.s) < 3.2);
        const na = map.nodes[road.a], nb = map.nodes[road.b];
        const corner = (na.degree >= 3 && sq < na.radius + 5) || (nb.degree >= 3 && road.len - sq < nb.radius + 5);
        if (!zb && !corner) { M.midS += dt; if (Z.some((z) => z.e === road && Math.abs(sq - z.s) < 40)) M.jaywalkS += dt; }
        // a car coming: within 2.5 s of where the walker is
        if (!crossSeen.has(q)) {
          for (const v of g.fleet.vehicles) {
            if (!v.ai || v.vel < 2) continue;
            const dx = q.x - v.x, dz = q.z - v.z, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
            const lf = dx * fx + dz * fz, lr = Math.abs(-dx * fz + dz * fx);
            if (lf > 0 && lr < v.hw + 1.2 && lf / v.vel < 2.5) { M.unsafeCross++; crossSeen.add(q); break; }
          }
        }
      }
    }
    // overlaps: two people on their feet closer than their shoulders allow
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.state === 'sit' || a.state === 'dead' || a.state === 'lie' || a.state === 'fly' || Math.abs(a.x - at.x) > 120 || Math.abs(a.z - at.z) > 120) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.state === 'sit' || b.state === 'dead' || b.state === 'lie' || b.state === 'fly' || a.leader === b || b.leader === a) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        if (dx * dx + dz * dz < 0.42 * 0.42) M.overlaps++;
      }
    }
    M.ped60 += n60; M.ped120 += n120; M.pedMax60 = Math.max(M.pedMax60, n60);
    // ---------------- traffic
    for (const v of g.fleet.vehicles) {
      if (!v.ai || v.sleeping || v.dead) continue;
      const d = Math.hypot(v.x - at.x, v.z - at.z);
      if (d > 200) continue;
      M.carIds.add(v.id);
      if (v.spec.twoWheel) M.twoWheel.add(v.id);
      const e = v.ai.edge; if (!e) continue;
      const lim = legalLimit(map, e), sp = Math.max(0, v.speed);
      M.carS += dt; M.speedSum += sp * dt;
      if (sp > lim + 0.8) { M.overS += dt; M.overKmh = Math.max(M.overKmh, (sp - lim) * KMH); }
      // harsh braking: slowing by more than 3.5 m/s² over a third of a second (one event per stop)
      const hist = lastV.get(v.id) || { s: [], hard: false };
      hist.s.push(sp); if (hist.s.length > 10) hist.s.shift();
      const decel = hist.s.length === 10 ? (hist.s[0] - sp) / (9 * dt) : 0;
      if (decel > 3.5 && !hist.hard) { M.harsh++; hist.hard = true; } else if (decel < 1.5) hist.hard = false;
      lastV.set(v.id, hist);
      // headway to the car ahead in the same lane
      if (sp > 3) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        let gap = 99;
        for (const o of g.fleet.vehicles) {
          if (o === v || !(Math.abs(o.vel || 0) > 1) || Math.abs(o.x - v.x) > 45 || Math.abs(o.z - v.z) > 45) continue; // (moving traffic: not the cars parked along a bend)
          const dx = o.x - v.x, dz = o.z - v.z, lf = dx * fx + dz * fz, lr = Math.abs(-dx * fz + dz * fx);
          if (lf > 0 && lr < 1.3) gap = Math.min(gap, lf - v.hl - o.hl);
        }
        if (gap < 60) { M.headwayN++; if (gap / sp < 1.0) M.headwayLow++; }
      }
      // near misses with people
      for (const q of L) {
        if (q.state === 'dead' || q.state === 'lie' || q.state === 'fly' || sp < 2) continue;
        const dx = q.x - v.x, dz = q.z - v.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading), lf = Math.abs(dx * fx + dz * fz) - v.hl, lr = Math.abs(-dx * fz + dz * fx) - v.hw;
        if (Math.max(lf, lr) < 0.7) { const k = v.id + ':' + (q.seedT || 0); if (!nearSeen.has(k)) { nearSeen.add(k); M.nearMiss++; } }
      }
      // the junction ahead: STOP lines and unsigned junctions
      const ai = v.ai, node = map.nodes[ai.dir > 0 ? e.b : e.a], rem = e.len - ai.s, rule = ruleOf(map, e, node.id);
      const key = v.id + ':' + e.id;
      if (rule === 'stop') {
        const tr = stopTrack.get(key) || { min: 99, done: false };
        if (!tr.done && rem - node.radius < 10) tr.min = Math.min(tr.min, sp);
        if (!tr.done && rem - node.radius < 0.2) { tr.done = true; M.stopsPassed++; if (tr.min > 0.6) M.stopRolls++; }
        stopTrack.set(key, tr);
      }
      if (node.degree >= 3 && !rule) {
        const was = nodeIn.get(v.id) === node.id;
        const inside = Math.hypot(v.x - node.x, v.z - node.z) < node.radius + 0.5;
        if (inside && !was) {
          nodeIn.set(v.id, node.id);
          // does every approach of this junction go unsigned? (then the car on the right goes first)
          M.unsignedEntries++;
          const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
          for (const o of g.fleet.vehicles) {
            if (o === v || !o.ai || o.vel < 1.5) continue;
            const dx = o.x - node.x, dz = o.z - node.z, dn = Math.hypot(dx, dz);
            if (dn > 30 || dn < node.radius + 0.5) continue;
            const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
            if ((-dx * ofx - dz * ofz) / dn < 0.8) continue;           // (o is driving at the junction)
            if ((dx * rx + dz * rz) / dn < 0.5) continue;               // (from v's right)
            if ((dn - node.radius) / o.vel > 3) continue;               // (and close)
            M.rightViol++; break;
          }
        } else if (!inside && was && Math.hypot(v.x - node.x, v.z - node.z) > node.radius + 3) nodeIn.delete(v.id);
      }
      // zebra crossings passed with someone on them or waiting at the kerb
      for (const z of Z) {
        if (z.e !== e || sp < 1) continue;
        const sz = ai.dir > 0 ? z.s : e.len - z.s;            // along the car's own travel
        const front = ai.s + v.hl;
        const k2 = v.id + ':' + z.x.toFixed(1);
        const prev = zebraTrack.get(k2);
        zebraTrack.set(k2, front);
        if (prev === undefined || !(prev < sz && front >= sz)) continue;
        M.zebraPass++;
        for (const q of L) {
          if (q.state === 'dead' || q.state === 'lie' || q.state === 'fly' || q.state === 'sit') continue;
          const dx = q.x - z.x, dz = q.z - z.z;
          if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
          const tmp = map.sample(e, z.s, {});
          const along = Math.abs(dx * tmp.dx + dz * tmp.dz), lat = Math.abs(-dx * tmp.dz + dz * tmp.dx);
          const onIt = along < 2.2 && lat < z.hw + 0.2;
          const waiting = along < 2.6 && lat >= z.hw && lat < z.hw + 1.8 && q.speed < 0.5 && (q.state === 'cross' || q.state === 'kerb' || q.state === 'idle');
          if (onIt || waiting) { M.zebraViol++; break; }
        }
      }
    }
    if (f % 30 === 0) await yieldNow();
  }
  const ms = (performance.now() - t0) / N;
  // what was said: lines, distinct, repeated within the minute
  const texts = said.map((s) => s.text);
  // (a short greeting — «¡Adiós!», «¡Buenas!» — is said a hundred times an evening by nature; what should not come round
  // again within the minute is a line of four words or more)
  const seen = new Map(); let repeats = 0, longN = 0, longRep = 0;
  for (const s of said) {
    const t = seen.get(s.text), long = s.text.split(/\s+/).length >= 4;
    if (long) longN++;
    if (t !== undefined && s.t - t < 60) { repeats++; if (long) longRep++; }
    seen.set(s.text, s.t);
  }
  g.render = keepRender; peds.say = keepSay; g.fleet.onImpact = keepImpact; peds.knock = keepKnock; peds.startChat = keepChat;
  const F = Math.max(1, M.frames);
  const out = {
    escena: tag || where, hora: hour, dia: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][wd],
    gente: { a60m: +(M.ped60 / F).toFixed(1), a120m: +(M.ped120 / F).toFixed(1), max60m: M.pedMax60, estados: Object.fromEntries(Object.entries(M.states).map(([k, n]) => [k, Math.round(n / F * 10) / 10])) },
    civismo: {
      solapes_por_min: +(M.overlaps / (seconds / 60)).toFixed(1),
      en_mitad_de_la_calzada_pct: M.pedS ? +(M.onRoadS / M.pedS * 100).toFixed(2) : 0,
      cruzando_lejos_de_paso_o_esquina_pct: M.pedS ? +(M.midS / M.pedS * 100).toFixed(2) : 0,
      sin_usar_el_paso_cercano_pct: M.pedS ? +(M.jaywalkS / M.pedS * 100).toFixed(2) : 0,
      cruzan_con_coche_encima: M.unsafeCross,
    },
    trafico: {
      vehiculos: M.carIds.size, motos_y_bicis: M.twoWheel.size,
      velocidad_media_kmh: M.carS ? +((M.speedSum / M.carS) * KMH).toFixed(1) : 0,
      exceso_velocidad_pct: M.carS ? +(M.overS / M.carS * 100).toFixed(1) : 0, exceso_max_kmh: +M.overKmh.toFixed(1),
      stop_sin_parar: `${M.stopRolls}/${M.stopsPassed}`,
      paso_cebra_sin_ceder: `${M.zebraViol}/${M.zebraPass}`,
      cruce_sin_ceder_derecha: `${M.rightViol}/${M.unsignedEntries}`,
      distancia_menor_1s_pct: M.headwayN ? +(M.headwayLow / M.headwayN * 100).toFixed(1) : 0,
      frenazos: M.harsh, casi_atropellos: M.nearMiss, choques: crashes, golpes_contra_bordillos_o_muros: scrapes, atropellos: carPeds,
    },
    charla: { conversaciones: chats, frases_oidas: said.length, distintas: new Set(texts).size, repetidas_en_1min: repeats, frases_largas: longN, largas_repetidas_en_1min: longRep },
    ms_por_paso: +ms.toFixed(2), calentamiento_s: +(warmMs / 1000).toFixed(1),
  };
  return out;
  // (s along the road for a walker)
  function require_s(road, q) { const t = map.nearestEdge(q.x, q.z, 8, (x) => x === road); return t ? t.s : -99; }
}

// every scenario, one after another → .snaps/townlab_<tag>.json
export const SCENES = [
  ['plaza', { hour: 11.0, wd: 1 }, 'Plaza de España, martes 11:00'],
  ['plaza', { hour: 20.25, wd: 3 }, 'Plaza de España, jueves 20:15 (paseo)'],
  ['iglesia', { hour: 12.8, wd: 6 }, 'Santa María, domingo 12:48 (salida de misa)'],
  ['colegio', { hour: 14.02, wd: 2 }, 'C. P. San Gregorio, miércoles 14:01 (salida)'],
  ['calle', { hour: 10.5, wd: 4 }, 'Una calle del casco, viernes 10:30'],
  ['avenida', { hour: 13.2, wd: 2 }, 'La travesía, miércoles 13:12'],
  ['mercadillo', { hour: 11.0, wd: 2 }, 'El mercadillo, miércoles 11:00'],
];
export async function suite(tag = 'a', { seconds = 90, warm = 45, only = null } = {}) {
  const res = [];
  for (const [where, o, label] of SCENES) {
    if (only && !only.includes(where)) continue;
    const r = await run(where, { ...o, seconds, warm, tag: label });
    res.push(r);
    console.log(label, JSON.stringify(r));
  }
  await fetch('/__snap?name=townlab_' + tag, { method: 'POST', body: 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(res, null, 1)))) });
  return res;
}
