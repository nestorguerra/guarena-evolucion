# the Street View cameras as pinhole cameras in the game's frame (x east, y up, z south)
import math, json, glob
import os
REPO=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SP=os.path.join(REPO, '.snaps', 'fachadas'); os.makedirs(SP + '/an', exist_ok=True)
LAT0, LON0 = 38.8596, -6.1025; R=6378137.0
KX=math.cos(math.radians(LAT0))*R*math.pi/180; KZ=R*math.pi/180
VIEWS=[(38.8616327,-6.1012251,182.07,95.24,75),(38.8615187,-6.1012437,182.07,95.24,75),(38.8614199,-6.1012391,182.07,95.24,75),(38.8613237,-6.1012283,182.07,95.24,75),(38.8612311,-6.1012205,182.07,95.24,75),(38.861142,-6.1012151,182.07,95.24,75),(38.8610567,-6.1012107,182.07,95.24,75),(38.8609704,-6.1012067,182.07,95.24,75),(38.8608142,-6.1012234,182.07,95.24,75),(38.8607466,-6.1012002,182.07,95.24,75),(38.8605634,-6.101207,182.07,95.24,75),(38.8603603,-6.1012535,182.07,95.24,75),(38.8603603,-6.1012535,20.7,92.72,75),(38.8604715,-6.1012344,20.7,92.72,75),(38.8605634,-6.101207,20.7,92.72,75),(38.8606542,-6.1012024,20.7,92.72,75),(38.8608142,-6.1012234,20.7,92.72,75),(38.8609704,-6.1012067,25.55,95.36,88.6),(38.8610567,-6.1012107,25.55,95.36,75),(38.8612311,-6.1012205,25.55,95.36,75),(38.8614199,-6.1012391,25.55,95.36,75)]
W,H=3600,2016
# per-view corrections (metres, degrees), found by aligning building corners
CORR={}
try: CORR={int(k):v for k,v in json.load(open(SP+'/an/corr.json')).items()}
except Exception: pass
def files():
    return sorted(glob.glob(os.path.join(os.environ.get('FOTOS', os.path.expanduser('~/Desktop/Malfeitos')), '*.png')), key=lambda f: [int(x) for x in f.split('las ')[1].replace('.png','').split('.')])
class Cam:
    def __init__(s, n, eye=2.5):
        la,lo,h,t,fov=VIEWS[n-1]; c=CORR.get(n,{})
        s.x=(lo-LON0)*KX+c.get('dx',0); s.z=-(la-LAT0)*KZ+c.get('dz',0); s.y=c.get('eye',eye)
        s.h=math.radians(h+c.get('dh',0)); s.t=math.radians(t-90+c.get('dt',0)); s.roll=math.radians(c.get('roll',0))
        s.fov=fov+c.get('dfov',0)
        f=(math.sin(s.h)*math.cos(s.t), math.sin(s.t), -math.cos(s.h)*math.cos(s.t))
        r=(f[1]*0-f[2]*1, f[2]*0-f[0]*0, f[0]*1-f[1]*0)  # f x up
        rl=math.hypot(*r); r=(r[0]/rl,r[1]/rl,r[2]/rl)
        u=(r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0])
        cr,sr=math.cos(s.roll),math.sin(s.roll)
        s.r=tuple(r[i]*cr+u[i]*sr for i in range(3)); s.u=tuple(u[i]*cr-r[i]*sr for i in range(3)); s.f=f
        s.F=(H/2)/math.tan(math.radians(s.fov)/2)
    def proj(s, x, y, z):
        d=(x-s.x,y-s.y,z-s.z)
        zc=sum(d[i]*s.f[i] for i in range(3))
        if zc<0.3: return None
        xc=sum(d[i]*s.r[i] for i in range(3)); yc=sum(d[i]*s.u[i] for i in range(3))
        return (W/2+xc/zc*s.F, H/2-yc/zc*s.F, zc)
    def ray(s, px, py):
        a=(px-W/2)/s.F; b=-(py-H/2)/s.F
        d=tuple(s.f[i]+a*s.r[i]+b*s.u[i] for i in range(3))
        return (s.x,s.y,s.z), d
def load_map():
    return json.load(open(REPO+'/data/map.json'))
dec=lambda a:[v/10 for v in a]
