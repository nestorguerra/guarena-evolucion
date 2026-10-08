# The A/B runs (ab.py) summed up: per version and route, the median over the rounds of each measure, and the change.
#   python3 tools/perf/absum.py [--json]
import glob, json, os, statistics, sys
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.cache/perf')
runs = {}
for f in sorted(glob.glob(os.path.join(here, 'ab_*_*.json'))):
    runs.setdefault(os.path.basename(f).split('_')[1], []).append(json.load(open(f)))
med = lambda a: round(statistics.median(a), 2) if a else None
out = {}
for lab, rs in runs.items():
    o = {'n': len(rs), 'load_s': med([r['load'] / 1000 for r in rs])}
    for route in ('drive', 'walk', 'spin'):
        R = [r[route] for r in rs if route in r]
        if not R: continue
        o[route] = {
            'fps': med([x['fps'] for x in R]), 'ms_mean': med([x['ms']['mean'] for x in R]), 'p50': med([x['ms']['p50'] for x in R]),
            'p95': med([x['ms']['p95'] for x in R]), 'p99': med([x['ms']['p99'] for x in R]), 'max': med([x['ms']['max'] for x in R]),
            'low1': med([x['low1'] for x in R]), 'over33': med([x['over']['33'] for x in R]), 'over50': med([x['over']['50'] for x in R]),
            'over100': med([x['over']['100'] for x in R]), 'jank_ms': med([x['jankMs'] for x in R]), 'work': med([x['work']['mean'] for x in R]),
            'calls': med([x['draw']['calls'] for x in R if x.get('draw')]), 'frames': med([x['frames'] for x in R]), 'pr': med([x['pr'] for x in R]),
        }
    out[lab] = o
if '--json' in sys.argv: print(json.dumps(out, indent=1)); sys.exit()
for lab, o in out.items():
    print(lab, 'runs', o['n'], 'load', o['load_s'], 's')
    for route in ('drive', 'walk', 'spin'):
        if route in o: print('  ', route, o[route])
if 'antes' in out and 'despues' in out:
    a, d = out['antes'], out['despues']
    print('--- change')
    for route in ('drive', 'walk', 'spin'):
        if route not in a or route not in d: continue
        A, D = a[route], d[route]
        print(route, f"fps {A['fps']} -> {D['fps']} ({(D['fps'] / A['fps'] - 1) * 100:+.0f} %)", f"| frame {A['ms_mean']} -> {D['ms_mean']} ms ({(1 - D['ms_mean'] / A['ms_mean']) * 100:.0f} % less)",
              f"| p99 {A['p99']} -> {D['p99']} ms | 1% low {A['low1']} -> {D['low1']} fps | >50 ms {A['over50']} -> {D['over50']} | >100 ms {A['over100']} -> {D['over100']} | jank {A['jank_ms']} -> {D['jank_ms']} ms")
    print('load', a['load_s'], '->', d['load_s'], 's')
