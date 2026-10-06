#!/usr/bin/env python3
"""Bundle index.html + src/*.js + data/map.json + assets/ into one self-contained artifact page (dist/guarena-evolucion.html).
With --split the map data and the assets ship as separate files next to the page instead.

Each ES module becomes a scoped factory (so top-level names never collide); local imports turn into
destructuring of the dependency's exports; 'three' and 'three/addons/*' imports are hoisted to the top.
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')

IMPORT_RE = re.compile(r"^import\s+(.+?)\s+from\s+'([^']+)';\s*$", re.M)
DYN_AUDIO_RE = re.compile(r"^let GameAudio;\n(?:.*\n){1,3}?if \(typeof GameAudio !== 'function'\).*\n", re.M)



# binary assets travel as text: a base-85 code (5 characters per 4 bytes, against base 64's 4 per 3 — about 0.7 MB less
# page) whose alphabet is printable ASCII without " \ < (so it sits in a JSON string inside <script> as is) and without
# { } @ [ ] | (random runs of those read as template placeholders and diff markers to the artifact host's checks)
B85 = ''.join(chr(c) for c in range(33, 127) if chr(c) not in '"\\<{}@[]|')
assert len(B85) == 85


def b85(data):
    out, n = [], len(data)
    pad = (-n) % 4
    data = data + b'\0' * pad
    A = B85
    for i in range(0, len(data), 4):
        v = int.from_bytes(data[i:i + 4], 'big')
        d4 = v % 85; v //= 85
        d3 = v % 85; v //= 85
        d2 = v % 85; v //= 85
        d1 = v % 85; v //= 85
        out.append(A[v] + A[d1] + A[d2] + A[d3] + A[d4])
    t = ''.join(out)
    return t[:len(t) - pad] if pad else t

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def mod_name(path):
    return '__m_' + re.sub(r'\W', '_', os.path.splitext(os.path.basename(path))[0])


def parse_module(fname, seen, order, externals):
    path = os.path.join(SRC, fname)
    if fname in seen:
        return
    seen.add(fname)
    code = read(path) if os.path.exists(path) else ''
    if fname == 'audio.js' and 'export class GameAudio' not in code:
        print('WARNING: audio.js incomplete, bundling the silent stub')
        code = read(os.path.join(SRC, 'audio_stub.js'))
    deps = []
    local_imports = []
    for m in IMPORT_RE.finditer(code):
        spec, src = m.group(1), m.group(2)
        if src.startswith('./'):
            dep = src[2:]
            deps.append(dep)
            local_imports.append((spec, dep))
        else:
            externals.setdefault(src, set())
            if spec.startswith('* as '):
                externals[src].add(spec)
            else:
                names = re.findall(r'[\w$]+(?:\s+as\s+[\w$]+)?', spec.strip('{} '))
                for n in names:
                    externals[src].add(n)
    for d in deps:
        parse_module(d, seen, order, externals)
    order.append((fname, code, local_imports))


# whole-line comments go (the page must stay under the artifact host's 16 MB); the sources keep them
FULL_LINE_COMMENT_RE = re.compile(r'^[ \t]*//[^\n]*\n', re.M)


def transform(fname, code, local_imports, exports_of):
    code = FULL_LINE_COMMENT_RE.sub('', code)
    # drop import lines
    code = IMPORT_RE.sub('', code)
    # main.js: static audio instead of dynamic import
    if fname == 'main.js':
        code = DYN_AUDIO_RE.sub("const { GameAudio } = __m_audio;\n", code)
    names = []
    def exp(m):
        names.append(m.group(2))
        return m.group(1)
    code = re.sub(r'^export\s+((?:async\s+)?function\s*\*?\s*([\w$]+))', lambda m: (names.append(m.group(2)), m.group(1))[1], code, flags=re.M)
    code = re.sub(r'^export\s+(class\s+([\w$]+))', lambda m: (names.append(m.group(2)), m.group(1))[1], code, flags=re.M)
    code = re.sub(r'^export\s+((?:const|let|var)\s+([\w$]+))', lambda m: (names.append(m.group(2)), m.group(1))[1], code, flags=re.M)
    code = re.sub(r'^export\s+default\s+[\w$]+;\s*$', '', code, flags=re.M)
    head = []
    for spec, dep in local_imports:
        dn = mod_name(dep)
        spec = spec.strip()
        if spec.startswith('{'):
            parts = [p.strip() for p in spec.strip('{} ').split(',') if p.strip()]
            parts = [re.sub(r'\s+as\s+', ': ', p) for p in parts]
            head.append(f"const {{ {', '.join(parts)} }} = {dn};")
        elif spec.startswith('* as '):
            head.append(f"const {spec[5:].strip()} = {dn};")
        else:
            head.append(f"const {spec} = {dn}.default;")
    exports_of[fname] = names
    body = '\n'.join(head) + '\n' + code
    ret = ', '.join(names)
    return f"const {mod_name(fname)} = (() => {{\n{body}\nreturn {{ {ret} }};\n}})();\n"


def main():
    order, seen, externals = [], set(), {}
    # audio first so main can reference it
    parse_module('audio.js', seen, order, externals)
    parse_module('main.js', seen, order, externals)
    exports_of = {}
    out = []
    for fname, code, li in order:
        out.append(f"// ---- {fname}\n" + transform(fname, code, li, exports_of))
    head = []
    # absolute jsDelivr ESM URLs (no import map needed); the addon builds import three from the same URL
    def cdn(src):
        base = 'https://cdn.jsdelivr.net/npm/three@0.170.0'
        if src == 'three':
            return base + '/+esm'
        if src.startswith('three/addons/'):
            return base + '/examples/jsm/' + src[len('three/addons/'):] + '/+esm'
        return src
    for src, specs in externals.items():
        src_url = cdn(src)
        star = [s for s in specs if s.startswith('* as ')]
        named = sorted(s for s in specs if not s.startswith('* as '))
        for s in star:
            head.append(f"import {s} from '{src_url}';")
        if named:
            head.append(f"import {{ {', '.join(named)} }} from '{src_url}';")
    js = '\n'.join(head) + '\n' + '\n'.join(out)
    html = read(os.path.join(ROOT, 'index.html'))
    a = html.index('<!--ARTIFACT-START-->') + len('<!--ARTIFACT-START-->')
    b = html.index('<!--ARTIFACT-SCRIPTS-->')
    page = html[a:b].strip() + '\n'
    split = '--split' in sys.argv
    dist = os.path.join(ROOT, 'dist')
    src_assets = os.path.join(ROOT, 'assets')
    asset_files = sorted(os.path.relpath(os.path.join(d, f), src_assets).replace(os.sep, '/')
                         for d, _, fs in os.walk(src_assets) for f in fs if f != 'meta.json' and f != 'rig.json' and not f.startswith('.'))  # (hero/rig.json: for the tools only)
    for sub in ('data', 'assets'):
        if os.path.isdir(os.path.join(dist, sub)): shutil.rmtree(os.path.join(dist, sub))
    os.makedirs(dist, exist_ok=True)
    data = read(os.path.join(ROOT, 'data', 'map.json'))
    if split:
        os.makedirs(os.path.join(dist, 'data'))
        with open(os.path.join(dist, 'data', 'map.json'), 'w', encoding='utf-8') as f:
            f.write(data)
        shutil.copytree(src_assets, os.path.join(dist, 'assets'), ignore=shutil.ignore_patterns('meta.json', '.*'))
    else:
        # the artifact host fails to serve versions with attached files, so everything travels inside the page
        assert '</script' not in data
        page += f'<script type="application/json" id="mapdata">{data}</script>\n'
        emb = {}
        for rel in asset_files:
            with open(os.path.join(src_assets, rel), 'rb') as f:
                emb[rel] = b85(f.read())
        emb['__enc'] = 'b85'  # (the code the copies are in: src/assets.js reads it)
        blob = json.dumps(emb, separators=(',', ':'))
        assert '</script' not in blob and '\\' not in blob
        page += '<script type="application/json" id="assetdata">' + blob + '</script>\n'
    # the public multiplayer server, if there is one (GUARENA_MP_URL=https://… python3 tools/build.py): the copies that
    # cannot host a game themselves (the published page, GitHub Pages) offer to go there
    mp_url = os.environ.get('GUARENA_MP_URL', '').strip()
    if mp_url:
        assert re.match(r'^https://[\w.-]+(:\d+)?/?$', mp_url), 'GUARENA_MP_URL debe ser https://servidor'
        page += f'<script>window.GUARENA_MP_URL = {json.dumps(mp_url.rstrip("/"))};</script>\n'
    page += '<script type="module">\n' + js + '\n</script>\n'
    fn = os.path.join(ROOT, 'dist', 'guarena-evolucion.html')  # (dist/guarena.html was the fixed version's page)
    with open(fn, 'w', encoding='utf-8') as f:
        # declare UTF-8 first thing: without it a host that sends no charset shows «GuareÃ±a» instead of «Guareña»
        f.write('<meta charset="utf-8">\n' + page)
    # dev wrapper to test locally
    full = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n' + page + '</body></html>'
    with open(os.path.join(ROOT, 'dist', 'test.html'), 'w', encoding='utf-8') as f:
        f.write(full)
    # the multiplayer server hands this full page to every player
    mp = os.path.join(ROOT, 'multijugador')
    if os.path.isdir(mp):
        with open(os.path.join(mp, 'guarena.html'), 'w', encoding='utf-8') as f:
            f.write(full)
        print('wrote', os.path.join(mp, 'guarena.html'))
    kb_assets = sum(os.path.getsize(os.path.join(src_assets, rel)) for rel in asset_files) // 1024
    print('assets:', len(asset_files), 'files,', kb_assets, 'KB', 'next to the page' if split else 'embedded')
    print('modules:', [o[0] for o in order])
    print('externals:', {k: sorted(v) for k, v in externals.items()})
    print('wrote', fn, round(os.path.getsize(fn) / 1024), 'KB')


if __name__ == '__main__':
    main()
