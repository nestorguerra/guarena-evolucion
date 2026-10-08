# Where the main thread's time goes while playing: a CPU profile of perflab.live in a fresh tab, the self time per
# file and the inclusive time per function (in % of the time the thread was busy).
#   python3 tools/perf/profile.py URL [--route drive] [--sec 20] [--port 9333]
import argparse, collections, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Tab, LOAD_AND_PLAY
a = argparse.ArgumentParser(); a.add_argument('url'); a.add_argument('--route', default='drive'); a.add_argument('--sec', type=float, default=20); a.add_argument('--port', type=int, default=9333); a.add_argument('--top', type=int, default=60)
o = a.parse_args()
T = Tab(o.port, o.url)
T.ev(LOAD_AND_PLAY)
T.ev(f"(async () => {{ await window.__P.live({{ route: '{o.route}', sec: 3, warm: 1 }}); return 1; }})()")
T.call('Profiler.enable'); T.call('Profiler.setSamplingInterval', {'interval': 200}); T.call('Profiler.start')
res = T.ev(f"(async () => JSON.stringify(await window.__P.live({{ route: '{o.route}', sec: {o.sec}, warm: 0 }})))()")
prof = T.call('Profiler.stop')['result']['profile']
T.close()
nodes = {n['id']: n for n in prof['nodes']}
parent = {c: n['id'] for n in prof['nodes'] for c in n.get('children', [])}
self_us = collections.Counter()
for sid, dt in zip(prof['samples'], prof['timeDeltas']): self_us[sid] += dt
idle = sum(v for k, v in self_us.items() if nodes[k]['callFrame']['functionName'] in ('(idle)', '(program)', '(garbage collector)'))
busy = sum(self_us.values()) - idle
name = lambda cf: f"{cf['functionName'] or '(anon)'} {cf['url'].rsplit('/', 1)[-1].split('?')[0]}:{cf['lineNumber'] + 1}"
incl, byfile = collections.Counter(), collections.Counter()
for nid, us in self_us.items():
    cf = nodes[nid]['callFrame']; byfile[cf['url'].rsplit('/', 1)[-1].split('?')[0] or '(native)'] += us
    seen, x = set(), nid
    while x is not None:
        k = name(nodes[x]['callFrame'])
        if k not in seen: incl[k] += us; seen.add(k)
        x = parent.get(x)
print('live:', res[:300])
print(f'busy {busy / 1e6:.1f} s of {sum(self_us.values()) / 1e6:.1f} s')
for k, v in byfile.most_common(15): print(f'{v / busy * 100:5.1f}%  {k}')
print('--- inclusive')
for k, v in incl.most_common(o.top):
    if k.startswith('(idle)') or k.startswith('(root)'): continue
    print(f'{v / busy * 100:5.1f}%  {k}')
