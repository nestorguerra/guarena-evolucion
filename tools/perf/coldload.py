# The load of a first visit, before and after taking turns: the site's storage emptied first (the characters' cache in
# IndexedDB, the saved game), then the time from opening the page to the menu, and to the first frame of a game.
#   python3 tools/perf/coldload.py [--rounds 2] [--port 9333] [--antes URL] [--despues URL]
import argparse, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Tab
a = argparse.ArgumentParser()
a.add_argument('--port', type=int, default=9333)
a.add_argument('--rounds', type=int, default=2)
a.add_argument('--antes', default='http://localhost:8918/.snaps/antes/index.html?perf=cold')
a.add_argument('--despues', default='http://localhost:8918/index.html?perf=cold')
o = a.parse_args()
WAIT = '''(async () => {
  const t = await new Promise((r, no) => { const c = () => (window.game && document.getElementById('loading') && document.getElementById('loading').hidden) ? r(performance.now()) : performance.now() > 180000 ? no(new Error('no carga')) : setTimeout(c, 50); c(); });
  return Math.round(t);
})()'''
res = {'antes': [], 'despues': []}
for k in range(o.rounds):
    for label, url in ([('antes', o.antes), ('despues', o.despues)] if k % 2 == 0 else [('despues', o.despues), ('antes', o.antes)]):
        T = Tab(o.port, 'about:blank')
        T.call('Storage.clearDataForOrigin', {'origin': 'http://localhost:8918', 'storageTypes': 'indexeddb,local_storage,cache_storage,service_workers'})
        T.call('Network.enable'); T.call('Network.clearBrowserCache')
        T.call('Page.navigate', {'url': url + f'&r={k}'})
        time.sleep(0.5)
        try:
            ms = T.ev(WAIT)
            res[label].append(ms)
            print(label, k, 'menu at', ms, 'ms', flush=True)
        except Exception as e:
            print('FAILED', label, k, str(e)[:200], flush=True)
        T.close()
print(json.dumps(res))
