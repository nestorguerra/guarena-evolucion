# A Chrome of its own for measuring the game, driven over the DevTools protocol (Python's standard library only).
# Why: the app's browser pane, out of focus, gives a page an animation frame every 2 s — nothing measured there is the
# game's. A headless Chrome with the real GPU (ANGLE on Metal on a Mac) runs at the display's rate:
#   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
#     --user-data-dir=.cache/perf/chrome --no-first-run --use-angle=metal --enable-gpu --ignore-gpu-blocklist \
#     --autoplay-policy=no-user-gesture-required about:blank &
# Tab(port, url) opens a fresh tab (1440×900 at 2×, a laptop's retina screen) with the page's errors collected from
# the start (window.__errs); tab.ev(js) runs JavaScript there and waits for its promise.
import base64, json, os, socket, struct, urllib.request


class WS:  # (a websocket client: the handshake, masked frames out, frames in)
    def __init__(self, url):
        hostport, path = url[5:].split('/', 1)
        host, port = hostport.split(':')
        self.s = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(f'GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            d = self.s.recv(4096)
            if not d: raise RuntimeError('handshake failed')
            buf += d
        head, self.buf = buf.split(b'\r\n\r\n', 1)
        if b' 101 ' not in head.split(b'\r\n')[0]: raise RuntimeError(head.decode(errors='replace'))

    def _read(self, n):
        while len(self.buf) < n:
            d = self.s.recv(1 << 20)
            if not d: raise RuntimeError('closed')
            self.buf += d
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        p = text.encode()
        h = bytearray([0x81])
        n = len(p)
        if n < 126: h.append(0x80 | n)
        elif n < 65536: h.append(0x80 | 126); h += struct.pack('>H', n)
        else: h.append(0x80 | 127); h += struct.pack('>Q', n)
        m = os.urandom(4); h += m
        self.s.sendall(bytes(h) + bytes(b ^ m[i % 4] for i, b in enumerate(p)))

    def recv(self):
        msg = b''
        while True:
            b0, b1 = self._read(2)
            op, n = b0 & 0x0f, b1 & 0x7f
            if n == 126: n = struct.unpack('>H', self._read(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._read(8))[0]
            mask = self._read(4) if b1 & 0x80 else None
            p = self._read(n)
            if mask: p = bytes(b ^ mask[i % 4] for i, b in enumerate(p))
            if op == 9: continue
            if op == 8: raise RuntimeError('closed by peer')
            msg += p
            if b0 & 0x80: return msg.decode()


ERRS = r"""window.__errs = []; addEventListener('error', (e) => window.__errs.push('error ' + String(e.message || e)));
addEventListener('unhandledrejection', (e) => window.__errs.push('rejection ' + String(e.reason && (e.reason.stack || e.reason))));
{ const ce = console.error; console.error = (...a) => { try { window.__errs.push(a.map((x) => String(x && x.stack || x)).join(' ').slice(0, 400)); } catch (e) {} ce.apply(console, a); }; }"""

# the page loaded, a game started (as a player starts it: the Play button), perflab imported
LOAD_AND_PLAY = '''(async () => {
  const t = await new Promise((r, no) => { const c = () => (window.game && document.getElementById('loading') && document.getElementById('loading').hidden) ? r(performance.now()) : performance.now() > 120000 ? no(new Error('no carga: ' + JSON.stringify(window.__errs || []))) : setTimeout(c, 50); c(); });
  document.getElementById('bPlay').click();
  await new Promise(r => setTimeout(r, 1500));
  window.__P = await import('/tools/perflab.js?' + Date.now());
  return Math.round(t);
})()'''


class Tab:
    def __init__(self, port, url, w=1440, h=900, dpr=2):
        self.port = port
        t = json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/json/new?about:blank', method='PUT')))
        self.id = t['id']
        self.ws = WS(t['webSocketDebuggerUrl']); self.ws.s.settimeout(1800)
        self.mid = 0
        self.call('Page.enable')
        self.call('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': False})
        self.call('Page.addScriptToEvaluateOnNewDocument', {'source': ERRS})
        self.call('Page.navigate', {'url': url})

    def call(self, method, params=None):
        self.mid += 1
        self.ws.send(json.dumps({'id': self.mid, 'method': method, 'params': params or {}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == self.mid: return m

    def ev(self, js, timeout=1700):
        m = self.call('Runtime.evaluate', {'expression': js, 'awaitPromise': True, 'returnByValue': True, 'timeout': int(timeout * 1000)})
        r = m.get('result', {})
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'])[:3000])
        return r.get('result', {}).get('value')

    def shot(self, path, quality=92):
        d = self.call('Page.captureScreenshot', {'format': 'jpeg', 'quality': quality})
        open(path, 'wb').write(base64.b64decode(d['result']['data']))

    def close(self):
        try: urllib.request.urlopen(f'http://127.0.0.1:{self.port}/json/close/{self.id}')
        except Exception: pass
