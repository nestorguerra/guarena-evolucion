# Before and after, taking turns (a busier moment of the machine falls on both): N rounds, each a fresh tab per version
# — the load (to the menu), then perflab.live: 40 s driving, 30 s walking, 15 s turning round in the Plaza, the game's
# own loop. Each run goes to .cache/perf/ab_<version>_<round>.json (one already there is kept); absum.py sums them up.
#   python3 tools/perf/ab.py --rounds 3 [--port 9333] [--antes URL] [--despues URL]
# The «antes» page is a copy of the code before the change, served beside the current one (tools/perf/antes.sh).
import argparse, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Tab, LOAD_AND_PLAY

a = argparse.ArgumentParser()
a.add_argument('--port', type=int, default=9333)
a.add_argument('--rounds', type=int, default=3)
a.add_argument('--antes', default='http://localhost:8918/.snaps/antes/index.html?perf=ab')
a.add_argument('--despues', default='http://localhost:8918/index.html?perf=ab')
a.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.cache/perf'))
o = a.parse_args()
os.makedirs(o.out, exist_ok=True)
VERS = [('antes', o.antes), ('despues', o.despues)]
ROUTES = [('drive', 40), ('walk', 30), ('spin', 15)]
for k in range(o.rounds):
    for label, url in (VERS if k % 2 == 0 else VERS[::-1]):
        outp = os.path.join(o.out, f'ab_{label}_{k}.json')
        if os.path.exists(outp): print('have', outp, flush=True); continue
        t0 = time.time()
        T = Tab(o.port, url + f'&r={k}')
        try:
            load = T.ev(LOAD_AND_PLAY)
            v = json.loads(T.ev('(async () => { const P = window.__P, out = {}; for (const [route, sec] of %s) out[route] = await P.live({ route, sec }); out.inv = P.inventory(); out.errs = (window.__errs || []).slice(0, 30); return JSON.stringify(out); })()' % json.dumps(ROUTES)))
            v['load'] = load; v['wall'] = round(time.time() - t0)
            json.dump(v, open(outp, 'w'), indent=1)
            print(label, k, 'load', load, ' '.join(f"{r} {v[r]['fps']}fps p99 {v[r]['ms']['p99']} >50:{v[r]['over']['50']}" for r, _ in ROUTES), 'errs', len(v['errs']), flush=True)
        except Exception as e:
            print('FAILED', label, k, str(e)[:300], flush=True)
        finally:
            T.close()
print('done', flush=True)
