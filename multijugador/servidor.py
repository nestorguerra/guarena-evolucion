#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Servidor multijugador de Guareña Evolución.

    python3 servidor.py                  (o doble clic en «Jugar multijugador»)
    python3 servidor.py --puerto 8921 --sin-navegador
    python3 servidor.py --nube           en un servidor de internet (Render…): puerto de $PORT, sin túneles

Sirve el juego (guarena.html) y conecta a los jugadores entre sí. Solo usa la biblioteca estándar de Python 3.
Tu amigo solo necesita un navegador: abre el enlace que te enseña la pantalla Multijugador del juego.
Conexión: WebSocket en /ws; si un túnel no deja pasar WebSocket, el juego usa sondeo HTTP (/mp/join, /mp/sync).
Por internet (opcional, cuando lo pides en el juego): túnel de Cloudflare si tienes «cloudflared», o localhost.run
por ssh (viene con macOS y Windows 10+), sin cuentas ni configurar el router.
"""
import base64, gzip, hashlib, http.server, json, os, queue, re, secrets, shutil, signal, socket, socketserver, struct
import subprocess, sys, threading, time, urllib.request, webbrowser

VERSION = 1
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)            # the project folder (for --dev)
MAX_PLAYERS = 8
MAX_MSG = 64 * 1024
GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else default
    return default


DEV = '--dev' in sys.argv                # serve the source tree (index.html + src/) instead of the packed game
# on a hosting service (Render and the like): the port it gives in $PORT, its public address, no tunnels, no browser
CLOUD = '--nube' in sys.argv or bool(os.environ.get('RENDER'))
OPEN_BROWSER = '--sin-navegador' not in sys.argv and not CLOUD
PORT0 = int(arg('--puerto', os.environ.get('PORT') if CLOUD and os.environ.get('PORT') else os.environ.get('GUARENA_PUERTO', '8921')))
PUBLIC_URL = (os.environ.get('GUARENA_URL') or os.environ.get('RENDER_EXTERNAL_URL') or '').rstrip('/')


def game_file():
    for p in (os.path.join(HERE, 'guarena.html'), os.path.join(ROOT, 'dist', 'test.html')):
        if os.path.isfile(p):
            return p
    return None


def log(msg):
    print(time.strftime('%H:%M:%S'), msg, flush=True)


_page = {'path': None, 'mtime': 0, 'raw': b'', 'gz': b''}


def game_bytes():
    # the ~10 MB page, read once and kept compressed as well (friends over the internet download ~6.6 MB)
    f = game_file()
    if not f:
        return None
    m = os.path.getmtime(f)
    if _page['path'] != f or _page['mtime'] != m:
        with open(f, 'rb') as fh:
            raw = fh.read()
        _page.update(path=f, mtime=m, raw=raw, gz=gzip.compress(raw, 6))
    return _page


# a small first page with a progress bar while the game itself downloads (it can take a while through a free link)
LOADER = '''<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Guareña Evolución</title>
<style>html,body{height:100%;margin:0;background:#0d1117;color:#fbfaf6;font:600 17px system-ui,-apple-system,Segoe UI,sans-serif}
body{display:grid;place-items:center}.w{width:min(440px,84vw)}.t{font:800 40px/1 Impact,'Arial Narrow',sans-serif;letter-spacing:.02em;text-transform:uppercase}
.s{margin-top:10px;color:rgba(251,250,246,.75)}.b{height:8px;margin-top:16px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}
.b i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c2562e,#f2b632);transition:width .2s}</style></head>
<body><div class="w"><div class="t">Guareña</div><div class="s" id="s">Descargando el juego…</div><div class="b"><i id="b"></i></div></div>
<script>
(async () => {
  try {
    const r = await fetch('/juego.html', { cache: 'no-store' });
    if (!r.ok || !r.body || !window.TextDecoder) throw 0;
    const total = +r.headers.get('X-Guarena-Size') || 0, rd = r.body.getReader(), parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value); got += value.length;
      if (total) { const f = Math.min(1, got / total); document.getElementById('b').style.width = (f * 100).toFixed(1) + '%'; document.getElementById('s').textContent = 'Descargando el juego… ' + Math.round(f * 100) + ' %'; }
    }
    const html = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
    document.open(); document.write(html); document.close();
  } catch (e) { location.replace('/juego.html'); }
})();
</script></body></html>'''


# ------------------------------------------------------------------ players and the room
lock = threading.RLock()
clients = {}            # id -> Client
by_sid = {}             # poll session id -> Client
room = {'started': False}
_next = [1]


class Client:
    def __init__(self, kind, addr):
        with lock:
            self.id = _next[0]
            _next[0] += 1
        self.kind = kind            # 'ws' | 'poll'
        self.addr = addr
        self.name = 'Jugador'
        self.desc = None
        self.ready = False
        self.playing = False
        self.joined = False
        self.alive = True
        self.last = time.time()
        self.sid = secrets.token_hex(12)
        self.inbox = []             # poll: messages waiting to be fetched
        self.outq = queue.Queue(maxsize=3000)   # ws: frames for the writer thread
        self.sock = None

    def public(self):
        return {'id': self.id, 'name': self.name, 'desc': self.desc, 'ready': self.ready, 'playing': self.playing}

    def send(self, obj):
        if not self.alive:
            return
        if self.kind == 'poll':
            with lock:
                self.inbox.append(obj)
                if len(self.inbox) > 600:   # a stalled poller: keep events, drop stale positions
                    self.inbox = [m for m in self.inbox if m.get('t') != 'st'][-400:]
        else:
            try:
                self.outq.put_nowait(obj)
            except queue.Full:
                self.alive = False


def clean_name(v):
    s = re.sub(r'[\x00-\x1f<>]', '', str(v or '')).strip()[:20]
    return s or 'Jugador'


def clean_desc(d):
    # the character description travels as-is between browsers; keep it small and made of plain values
    if not isinstance(d, dict):
        return None
    out = {}
    for k, v in list(d.items())[:48]:
        if not isinstance(k, str) or len(k) > 24:
            continue
        if isinstance(v, (int, float, bool)) or v is None:
            out[k] = v
        elif isinstance(v, str):
            out[k] = v[:220]
        elif isinstance(v, dict) and k == 'start':
            out[k] = {kk: vv for kk, vv in v.items() if isinstance(vv, (int, float)) and isinstance(kk, str)}
    return out


def host_id():
    ids = [c.id for c in clients.values() if c.joined]
    return min(ids) if ids else None


def broadcast(obj, skip=None):
    for c in list(clients.values()):
        if c.joined and c is not skip:
            c.send(obj)


def check_start():
    with lock:
        ps = [c for c in clients.values() if c.joined]
        if room['started']:
            # late arrivals start next to the others as soon as they are ready
            for c in ps:
                if c.ready and not c.playing:
                    c.playing = True
                    c.send({'t': 'start', 'late': True, 'order': [x.id for x in ps if x.playing]})
                    broadcast({'t': 'ready', 'id': c.id, 'on': True, 'playing': True}, skip=c)
            return
        if len(ps) >= 2 and all(c.ready for c in ps):
            room['started'] = True
            order = sorted(c.id for c in ps)
            for c in ps:
                c.playing = True
            broadcast({'t': 'start', 'late': False, 'order': order})
            log('¡Empieza la partida! ' + ', '.join(c.name for c in ps))


def handle(c, m):
    if not isinstance(m, dict):
        return
    t = m.get('t')
    c.last = time.time()
    if t == 'hello':
        with lock:
            if c.joined:
                return
            if sum(1 for x in clients.values() if x.joined) >= MAX_PLAYERS:
                c.send({'t': 'full'})
                return
            c.name = clean_name(m.get('name'))
            c.desc = clean_desc(m.get('desc'))
            c.joined = True
            others = [x.public() for x in clients.values() if x.joined and x is not c]
            c.send({'t': 'welcome', 'id': c.id, 'host': host_id(), 'players': others, 'started': room['started'], 'v': VERSION})
            broadcast({'t': 'join', 'p': c.public()}, skip=c)
        log(f'{c.name} se ha conectado ({c.addr})')
        return
    if not c.joined:
        return
    if t == 'profile':
        c.name = clean_name(m.get('name'))
        c.desc = clean_desc(m.get('desc'))
        broadcast({'t': 'profile', 'id': c.id, 'name': c.name, 'desc': c.desc}, skip=c)
    elif t == 'ready':
        with lock:
            c.ready = bool(m.get('on'))
            broadcast({'t': 'ready', 'id': c.id, 'on': c.ready, 'playing': c.playing}, skip=c)
        check_start()
    elif t == 'menu':
        with lock:
            c.playing = False
            c.ready = False
            broadcast({'t': 'ready', 'id': c.id, 'on': False, 'playing': False}, skip=c)
            if not any(x.playing for x in clients.values()):
                room['started'] = False
    elif t in ('st', 'ev'):
        if t == 'st' and not c.playing:
            return
        m['id'] = c.id
        broadcast(m, skip=c)


def register(c):
    with lock:
        clients[c.id] = c
        if c.kind == 'poll':
            by_sid[c.sid] = c


def drop(c):
    with lock:
        if clients.pop(c.id, None) is None:
            return
        by_sid.pop(c.sid, None)
        c.alive = False
        if c.joined:
            broadcast({'t': 'leave', 'id': c.id})
            broadcast({'t': 'host', 'id': host_id()})
        if not any(x.playing for x in clients.values()):
            room['started'] = False
    if c.joined:
        log(f'{c.name} se ha desconectado')
    if c.kind == 'ws':
        try:
            c.outq.put_nowait(None)
        except queue.Full:
            pass


def reaper():
    # poll clients that stopped asking are gone
    while True:
        time.sleep(2)
        now = time.time()
        for c in list(clients.values()):
            if c.kind == 'poll' and now - c.last > 12:
                drop(c)


# ------------------------------------------------------------------ WebSocket (RFC 6455, text frames)
def ws_frame(op, data):
    n = len(data)
    h = bytearray([0x80 | op])
    if n < 126:
        h.append(n)
    elif n < 65536:
        h.append(126)
        h += struct.pack('>H', n)
    else:
        h.append(127)
        h += struct.pack('>Q', n)
    return bytes(h) + data


def read_exact(sock, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise EOFError()
        buf += chunk
    return bytes(buf)


def ws_recv(c):
    sock = c.sock
    msg = bytearray()
    while True:
        b1, b2 = read_exact(sock, 2)
        op, n = b1 & 0x0F, b2 & 0x7F
        if n == 126:
            n = struct.unpack('>H', read_exact(sock, 2))[0]
        elif n == 127:
            n = struct.unpack('>Q', read_exact(sock, 8))[0]
        if n > MAX_MSG:
            raise ValueError('mensaje demasiado grande')
        mask = read_exact(sock, 4) if b2 & 0x80 else b'\0\0\0\0'
        data = bytearray(read_exact(sock, n))
        for i in range(n):
            data[i] ^= mask[i & 3]
        c.last = time.time()
        if op == 8:
            return None
        if op == 9:
            try:
                c.outq.put_nowait(('pong', bytes(data)))
            except queue.Full:
                pass
            continue
        if op == 10:
            continue
        msg += data
        if len(msg) > MAX_MSG:
            raise ValueError('mensaje demasiado grande')
        if b1 & 0x80:
            return bytes(msg).decode('utf-8', 'replace')


def ws_writer(c):
    # one thread per socket writes, so a slow connection never blocks anybody else
    last_ping = time.time()
    while c.alive:
        try:
            item = c.outq.get(timeout=5)
        except queue.Empty:
            item = 'ping'
        if item is None:
            break
        try:
            if item == 'ping' or time.time() - last_ping > 20:
                c.sock.sendall(ws_frame(9, b'guarena'))
                last_ping = time.time()
                if item == 'ping':
                    continue
            if isinstance(item, tuple):
                c.sock.sendall(ws_frame(10, item[1]))
            else:
                c.sock.sendall(ws_frame(1, json.dumps(item, separators=(',', ':'), ensure_ascii=False).encode('utf-8')))
        except OSError:
            break
    c.alive = False
    try:
        c.sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass


# ------------------------------------------------------------------ internet link (tunnel), only when asked from the game
tunnel = {'state': 'off', 'url': None, 'error': None, 'kind': None, 'proc': None, 'log': [], 'gen': 0, 'restarts': []}
LOOPBACK = ('127.0.0.1', '::1', '::ffff:127.0.0.1')


def start_tunnel(force=False):
    with lock:
        if tunnel['state'] in ('starting', 'on') and not force:
            return
        tunnel['gen'] += 1
        gen, old = tunnel['gen'], tunnel.get('proc')
        tunnel.update(state='starting', url=None, error=None, proc=None)
    if old and old.poll() is None:
        old.terminate()
    threading.Thread(target=run_tunnel, args=(gen,), daemon=True).start()


def set_url(u):
    if tunnel['url'] == u:
        return
    tunnel.update(state='on', url=u, error=None)
    log(f'Enlace por internet: {u}')
    # the players on this computer (whoever opened the room) get the new link in the lobby / on screen
    for c in list(clients.values()):
        if c.joined and c.addr in LOOPBACK:
            c.send({'t': 'link', 'url': u})


def run_tunnel(gen):
    exe = shutil.which('cloudflared') or next((p for p in (os.path.join(HERE, 'cloudflared'), os.path.join(HERE, 'cloudflared.exe')) if os.path.isfile(p)), None)
    if exe:
        cmd = [exe, 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{PORT}']
        pat, kind = re.compile(r'https://[-a-z0-9]+\.trycloudflare\.com'), 'Cloudflare'
    elif shutil.which('ssh'):
        cmd = ['ssh', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=20',
               '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-R', f'80:127.0.0.1:{PORT}', 'nokey@localhost.run']
        pat, kind = re.compile(r'https://[a-z0-9][-a-z0-9]*\.(?:lhr\.life|localhost\.run)'), 'localhost.run'
    else:
        tunnel.update(state='error', error='No encuentro «ssh» ni «cloudflared» en este ordenador.')
        return
    log(f'Creando el enlace por internet ({kind})…')
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding='utf-8', errors='replace', bufsize=1)
    except OSError as e:
        tunnel.update(state='error', error=f'No se pudo abrir el túnel: {e}')
        return
    tunnel.update(proc=proc, kind=kind)
    threading.Thread(target=watch_tunnel, args=(proc, gen), daemon=True).start()
    for line in proc.stdout:
        tunnel['log'] = (tunnel['log'] + [line.rstrip()[:200]])[-30:]
        if tunnel['gen'] != gen:
            continue
        for u in pat.findall(line):   # the free services may hand out a new address later on: follow it
            if not u.startswith(('https://admin.', 'https://www.', 'https://docs.')):
                set_url(u)
                break
    proc.wait()
    if tunnel['gen'] == gen:
        was_on = tunnel['state'] == 'on'
        tunnel.update(state='error', url=None, proc=None,
                      error='El enlace por internet se ha cortado.' if was_on else (tunnel['error'] or 'No se pudo crear el enlace por internet.'))
        log('El enlace por internet se ha cerrado.')
        if was_on:
            retry_tunnel()


def retry_tunnel():
    # a dropped link is made again on its own, but not endlessly
    now = time.time()
    tunnel['restarts'] = [t for t in tunnel['restarts'] if now - t < 600] + [now]
    if len(tunnel['restarts']) <= 4:
        log('Creo un enlace nuevo…')
        start_tunnel(force=True)


def watch_tunnel(proc, gen):
    t0 = time.time()
    while tunnel['gen'] == gen and tunnel['state'] == 'starting':
        if time.time() - t0 > 45:
            tunnel.update(state='error', error='El servicio de enlaces no ha respondido. Prueba otra vez en un rato.')
            proc.kill()
            return
        time.sleep(1)
    # every 20 s: does the link still reach us? (free links sometimes stop forwarding without closing)
    fails = 0
    while tunnel['gen'] == gen and proc.poll() is None:
        time.sleep(20)
        u = tunnel['url']
        if not u or tunnel['gen'] != gen:
            continue
        try:
            with urllib.request.urlopen(u + '/mp/info', timeout=12) as r:
                ok = r.status == 200 and b'guarena' in r.read(300)
        except Exception:
            ok = False
        fails = 0 if ok else fails + 1
        if fails >= 2 and tunnel['gen'] == gen:
            log('El enlace por internet ha dejado de responder.')
            retry_tunnel()
            return


def stop_tunnel():
    tunnel['gen'] += 1
    p = tunnel.get('proc')
    if p and p.poll() is None:
        p.terminate()


# ------------------------------------------------------------------ HTTP
def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))   # no packet is sent: this only picks the outgoing interface
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in ips and not ip.startswith(('127.', '169.254.')):
                ips.append(ip)
    except OSError:
        pass
    return ips


MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'audio/mp4', '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm'}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'Guarena/1'

    def log_message(self, *a):
        pass

    def reply(self, code, body=b'', ctype='application/json', extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode('utf-8')
        elif isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def body_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 512 * 1024:
            raise ValueError('demasiado grande')
        raw = self.rfile.read(n) if n else b'{}'
        return json.loads(raw.decode('utf-8') or '{}')

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/ws':
            return self.websocket()
        if path == '/mp/info':
            with lock:
                names = [c.name for c in clients.values() if c.joined]
            if CLOUD:
                # already on the internet: the address of this very page is the link to share
                host = (self.headers.get('Host') or '').strip()
                url = PUBLIC_URL or (f'https://{host}' if host else None)
                return self.reply(200, {
                    'guarena': True, 'v': VERSION, 'cloud': True, 'lan': [], 'internet': url, 'tunnel': 'on', 'tunnelError': None,
                    'tunnelKind': 'nube', 'players': names, 'started': room['started'], 'max': MAX_PLAYERS})
            return self.reply(200, {
                'guarena': True, 'v': VERSION, 'lan': [f'http://{ip}:{PORT}' for ip in lan_ips()],
                'internet': tunnel['url'], 'tunnel': tunnel['state'], 'tunnelError': tunnel['error'], 'tunnelKind': tunnel['kind'],
                'players': names, 'started': room['started']})
        if path == '/favicon.ico':
            return self.reply(204, b'', 'image/x-icon')
        if not DEV and path == '/':
            return self.reply(200, LOADER, 'text/html; charset=utf-8')
        if not DEV and path in ('/juego.html', '/index.html', '/guarena.html'):
            pg = game_bytes()
            if not pg:
                return self.reply(404, 'No encuentro guarena.html junto al servidor.', 'text/plain; charset=utf-8')
            extra = {'X-Guarena-Size': str(len(pg['raw']))}
            if 'gzip' in (self.headers.get('Accept-Encoding') or ''):
                extra['Content-Encoding'] = 'gzip'
                return self.reply(200, pg['gz'], 'text/html; charset=utf-8', extra)
            return self.reply(200, pg['raw'], 'text/html; charset=utf-8', extra)
        if DEV:
            rel = 'index.html' if path == '/' else path.lstrip('/')
            full = os.path.realpath(os.path.join(ROOT, rel))
            # only what the game needs (and the test helpers), never the rest of the project folder
            allowed = rel == 'index.html' or rel == 'data/map.json' or rel.startswith(('src/', 'assets/')) or (rel.startswith('tools/') and rel.endswith('.js'))
            if allowed and full.startswith(os.path.realpath(ROOT) + os.sep) and os.path.isfile(full):
                with open(full, 'rb') as fh:
                    return self.reply(200, fh.read(), MIME.get(os.path.splitext(full)[1].lower(), 'application/octet-stream'))
        return self.reply(404, 'No encontrado', 'text/plain; charset=utf-8')

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        try:
            data = self.body_json()
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {'error': 'petición no válida'})
        if path == '/mp/join':
            c = Client('poll', self.client_address[0])
            register(c)
            handle(c, data.get('hello') or {})
            return self.reply(200, {'sid': c.sid})
        if path == '/mp/sync':
            c = by_sid.get(str(data.get('sid', '')))
            if not c:
                return self.reply(410, {'error': 'sesión caducada'})
            c.last = time.time()
            for m in (data.get('out') or [])[:200]:
                handle(c, m)
            with lock:
                inbox, c.inbox = c.inbox, []
            return self.reply(200, {'in': inbox})
        if path == '/mp/leave':
            c = by_sid.get(str(data.get('sid', '')))
            if c:
                drop(c)
            return self.reply(200, {'ok': True})
        if path == '/mp/tunnel':
            if CLOUD:   # a public server never opens tunnels (nor runs anything on request)
                return self.reply(200, {'tunnel': 'on'})
            start_tunnel()
            return self.reply(200, {'tunnel': tunnel['state']})
        return self.reply(404, {'error': 'no encontrado'})

    def websocket(self):
        key = self.headers.get('Sec-WebSocket-Key')
        if not key or 'websocket' not in (self.headers.get('Upgrade') or '').lower():
            return self.reply(400, 'Se esperaba WebSocket', 'text/plain; charset=utf-8')
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode('ascii')).digest()).decode('ascii')
        self.send_response(101, 'Switching Protocols')
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        self.end_headers()
        self.wfile.flush()
        c = Client('ws', self.client_address[0])
        c.sock = self.connection
        c.sock.settimeout(75)
        register(c)
        threading.Thread(target=ws_writer, args=(c,), daemon=True).start()
        try:
            while c.alive:
                txt = ws_recv(c)
                if txt is None:
                    break
                try:
                    handle(c, json.loads(txt))
                except ValueError:
                    pass
        except (OSError, EOFError, ValueError):
            pass
        finally:
            drop(c)
            self.close_connection = True


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != 'nt'   # on Windows it would let two servers share a port
    address_family = socket.AF_INET6

    def server_bind(self):
        # one socket for IPv4 and IPv6 (browsers may resolve «localhost» to either)
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (OSError, AttributeError):
            pass
        super().server_bind()


class Server4(Server):
    address_family = socket.AF_INET

    def server_bind(self):
        http.server.HTTPServer.server_bind(self)


def open_server():
    if CLOUD:   # exactly the port the hosting service says, on every interface
        return Server4(('0.0.0.0', PORT0), Handler), PORT0
    for port in range(PORT0, PORT0 + 12):
        for cls, host in ((Server, '::'), (Server4, '0.0.0.0')):
            try:
                return cls((host, port), Handler), port
            except OSError:
                continue
    raise SystemExit('No hay ningún puerto libre entre %d y %d.' % (PORT0, PORT0 + 11))


def main():
    global PORT
    if not DEV and not game_file():
        print('No encuentro el juego (guarena.html) junto a este servidor.')
        if CLOUD:
            print('Genéralo antes de arrancar: python3 tools/build.py', flush=True)
            sys.exit(1)
        print('Ponlo en la misma carpeta que servidor.py y vuelve a abrirlo.')
        input('Pulsa Intro para salir…')
        return
    httpd, PORT = open_server()
    if not DEV:
        game_bytes()   # compress the page once, before anybody asks for it
    threading.Thread(target=reaper, daemon=True).start()
    if CLOUD:
        log(f'Guareña · servidor multijugador en internet · puerto {PORT} · {PUBLIC_URL or "dirección pública del servicio"}')
        signal.signal(signal.SIGTERM, lambda *_: os._exit(0))
        httpd.serve_forever(poll_interval=0.5)
        return
    ips = lan_ips()
    line = '=' * 64
    print(line)
    print('  GUAREÑA · VEGAS ALTAS  —  SERVIDOR MULTIJUGADOR')
    print(line)
    print(f'  Tú juegas en:            http://localhost:{PORT}')
    for ip in ips[:2]:
        print(f'  Tu amigo (misma WiFi):   http://{ip}:{PORT}')
    print('  Por internet:            en el juego, Multijugador → «Crear enlace por internet».')
    print()
    print('  Deja esta ventana abierta mientras jugáis. Para cerrar el servidor: Ctrl + C')
    print(line, flush=True)

    def bye(*_):
        stop_tunnel()
        os._exit(0)
    signal.signal(signal.SIGINT, bye)
    for sig in ('SIGTERM', 'SIGHUP'):   # closing the Terminal window also closes the internet link
        try:
            signal.signal(getattr(signal, sig), bye)
        except (AttributeError, ValueError, OSError):
            pass
    if OPEN_BROWSER:
        threading.Timer(0.8, lambda: webbrowser.open(f'http://127.0.0.1:{PORT}/')).start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        stop_tunnel()


PORT = PORT0
if __name__ == '__main__':
    main()
