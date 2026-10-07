# mosaic.py side [res] [dmin dmax]: one side of the street unwarped onto its frontmost walls (in street metres s, from the
# north end) from every picture, each picture used only where it sees the wall from close and not too obliquely
# (dmin..dmax metres ahead of the camera), its heading corrected by the panorama's vanishing point (the mean of its two
# views); where two pictures cover the same s, the nearer wins. → mo_<side>.png (+ which picture: mo_<side>_who.json)
import sys, math, json
sys.path.insert(0, __file__.rsplit('/',1)[0])
import cam
cam.CORR.clear()
from cam import *
from rect import rect_wall
from fronts import fronts, near
from PIL import Image, ImageDraw, ImageFont
side=sys.argv[1]; res=int(sys.argv[2]) if len(sys.argv)>2 else 60
dmin=float(sys.argv[3]) if len(sys.argv)>3 else 2.4; dmax=float(sys.argv[4]) if len(sys.argv)>4 else 8.0
PANO={1:[1],2:[2],3:[3,21],4:[4],5:[5,20],6:[6],7:[7,19],8:[8,18],9:[9,17],10:[10],11:[11,15],12:[12,13],14:[14],16:[16]}
VP=json.load(open(SP+'/an/vp.json'))
DH={}
for p,vs in PANO.items():
    m=sum(VP[str(v)]['dh'] for v in vs)/len(vs)
    for v in vs: DH[v]=m
HM=13.0; S0,S1=-2.0,142.0
segs=[o for o in fronts() if o['side']==side and o['par']>0.8]
for o in segs:
    sa=near(o['ax'],o['az'])[1]; sb=near(o['bx'],o['bz'])[1]
    if sa>sb: o['ax'],o['az'],o['bx'],o['bz']=o['bx'],o['bz'],o['ax'],o['az']; sa,sb=sb,sa
    o['sa'],o['sb']=sa,sb
WS=int((S1-S0)*res); HS=int(HM*res)
mos=Image.new('RGB',(WS,HS),(128,128,128)); best=[1e9]*WS; who=[0]*WS
for n in range(1,22):
    cam.CORR[n]={'dh':DH[n]}; c=Cam(n)
    scam=near(c.x,c.z)[1]; fw=c.f[2]*1>0  # looking south (s grows) or north
    for o in segs:
        if (c.x-o['ax'])*o['nx']+(c.z-o['az'])*o['nz']<0.3: continue
        r=rect_wall((o['ax'],o['az']),(o['bx'],o['bz']),[n],res,HM)[0]
        if n not in r: continue
        seg,sm,q,_=r[n]
        ws=max(2,int(round((o['sb']-o['sa'])*res)))
        if ws!=seg.width: seg=seg.resize((ws,HS)); sm=sm.resize((ws,HS))
        X0=int(round((o['sa']-S0)*res))
        for X in range(ws):
            col=X0+X
            if not (0<=col<WS): continue
            s=S0+col/res; d=(s-scam) if fw else (scam-s)
            if d<dmin or d>dmax: continue
            if sm.getpixel((X,int(HS*0.7)))==0: continue
            if d<best[col]:
                best[col]=d; who[col]=n
                mos.paste(seg.crop((X,0,X+1,HS)),(col,0),sm.crop((X,0,X+1,HS)))
    cam.CORR.pop(n,None)
mos.save(f'{SP}/mo_{side}.png')
json.dump(who,open(f'{SP}/mo_{side}_who.json','w'))
runs=[]
for col,n in enumerate(who):
    if not runs or runs[-1][0]!=n: runs.append([n,col,col])
    else: runs[-1][2]=col
print('coverage', [(n, round(S0+a/res,1), round(S0+b/res,1)) for n,a,b in runs if n])
