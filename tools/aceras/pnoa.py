# The PNOA orthophoto of Guareña (Instituto Geográfico Nacional, CC BY 4.0 — «PNOA cedido por © Instituto Geográfico
# Nacional», scne.es) in the game's frame. The WMS serves it in CRS:84 (longitude, latitude), and the game's projection
# is linear in both, so a tile's pixels map straight onto the game's metres (x east, z south). Tiles of 300 m at 15 cm a
# pixel, kept in .cache/pnoa (not in the repository: only the measurements made on them go into the game).
#   from pnoa import Mosaic;  M = Mosaic();  img, px = M.region(x0, z0, x1, z1)  # px(x, z) → pixel in img
import math, os, json, urllib.request
from PIL import Image

LAT0, LON0 = 38.8596, -6.1025
R = 6378137.0
KX = math.cos(math.radians(LAT0)) * R * math.pi / 180
KZ = R * math.pi / 180
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(REPO, '.cache', 'pnoa')
# the flights: the latest (2025, «máxima actualidad») and three older ones over Guareña, each taken from elsewhere — the
# roofs lean another way and the shadows fall elsewhere, so a pavement hidden in one is seen in another
WMS = {
    'ma': 'https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=CRS:84&FORMAT=image/jpeg',
    '2022': 'https://www.ign.es/wms/pnoa-historico?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=PNOA2022&STYLES=&CRS=CRS:84&FORMAT=image/jpeg',
    '2019': 'https://www.ign.es/wms/pnoa-historico?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=PNOA2019&STYLES=&CRS=CRS:84&FORMAT=image/jpeg',
    '2016': 'https://www.ign.es/wms/pnoa-historico?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=PNOA2016&STYLES=&CRS=CRS:84&FORMAT=image/jpeg',
}
FLIGHTS = ['ma', '2022', '2019', '2016']
X0, Z0 = -720.0, -760.0      # the town's corner (north-west), metres
TILE, RES = 300.0, 0.15      # a tile: 300 m square, 2000 px
NPX = int(round(TILE / RES))


def lonlat(x, z):
    return LON0 + x / KX, LAT0 - z / KZ


def tile_box(i, j):
    x0, z0 = X0 + i * TILE, Z0 + j * TILE
    return x0, z0, x0 + TILE, z0 + TILE


def fetch(i, j, flight='ma'):
    """tile (i, j) of a flight: its JPEG in the cache (downloaded the first time)"""
    d = CACHE if flight == 'ma' else os.path.join(CACHE, flight)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f't_{i}_{j}.jpg')
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return p
    x0, z0, x1, z1 = tile_box(i, j)
    lo0, la1 = lonlat(x0, z0)
    lo1, la0 = lonlat(x1, z1)   # (z0 is the north edge: the larger latitude)
    url = f'{WMS[flight]}&BBOX={lo0:.8f},{la0:.8f},{lo1:.8f},{la1:.8f}&WIDTH={NPX}&HEIGHT={NPX}'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                data = r.read()
            if data[:2] != b'\xff\xd8':
                raise RuntimeError('not a JPEG: ' + data[:200].decode('latin1'))
            open(p, 'wb').write(data)
            return p
        except Exception as ex:  # (the service is busy now and then)
            err = ex
    raise err


class Mosaic:
    def __init__(self, flight='ma'):
        self.flight = flight
        self.cache = {}

    def tile(self, i, j):
        k = (i, j)
        if k not in self.cache:
            if len(self.cache) > 24:
                self.cache.pop(next(iter(self.cache)))
            self.cache[k] = Image.open(fetch(i, j, self.flight)).convert('RGB')
        return self.cache[k]

    def region(self, x0, z0, x1, z1):
        """the photograph of the game rectangle (x0..x1, z0..z1), at RES; and px(x, z) → its pixel"""
        W, H = int(math.ceil((x1 - x0) / RES)), int(math.ceil((z1 - z0) / RES))
        img = Image.new('RGB', (W, H))
        i0, i1 = int(math.floor((x0 - X0) / TILE)), int(math.floor((x1 - X0) / TILE))
        j0, j1 = int(math.floor((z0 - Z0) / TILE)), int(math.floor((z1 - Z0) / TILE))
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                tx0, tz0, _, _ = tile_box(i, j)
                ox, oz = int(round((tx0 - x0) / RES)), int(round((tz0 - z0) / RES))
                img.paste(self.tile(i, j), (ox, oz))
        return img, (lambda x, z: ((x - x0) / RES, (z - z0) / RES))


def tiles_for(boxes, pad=30):
    """the tiles that boxes (x0, z0, x1, z1) need"""
    need = set()
    for x0, z0, x1, z1 in boxes:
        for i in range(int(math.floor((x0 - pad - X0) / TILE)), int(math.floor((x1 + pad - X0) / TILE)) + 1):
            for j in range(int(math.floor((z0 - pad - Z0) / TILE)), int(math.floor((z1 + pad - Z0) / TILE)) + 1):
                need.add((i, j))
    return sorted(need)


if __name__ == '__main__':
    # every tile of the town, of the flights asked for (all of them by default)
    import sys
    n = 0
    for fl in (sys.argv[1:] or FLIGHTS):
        for i in range(6):
            for j in range(5):
                fetch(i, j, fl); n += 1
        print('flight', fl, 'done', flush=True)
    print(n, 'tiles in', CACHE)
