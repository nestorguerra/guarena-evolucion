# hs.py side [index] [views]: house sheets. For every frontmost street wall of one side (or one), the raw wall-plane
# unwarp from the two pictures that see it best (one looking each way), cropped to the wall ±1.5 m, 0.5 m grid, 0.1 m
# ticks, the Catastro's ends in magenta → hs_<side><index>_v<n>.jpg; prints each wall's a, b, L
import sys, math
sys.path.insert(0, __file__.rsplit('/',1)[0])
import cam, json
cam.CORR.clear()
from cam import *
PANO={1:[1],2:[2],3:[3,21],4:[4],5:[5,20],6:[6],7:[7,19],8:[8,18],9:[9,17],10:[10],11:[11,15],12:[12,13],14:[14],16:[16]}
VP=json.load(open(SP+'/an/vp.json')); DH={}
for p_,vs in PANO.items():
    for v in vs: DH[v]=sum(VP[str(x)]['dh'] for x in vs)/len(vs)
for v in DH: cam.CORR[v]={'dh':DH[v]}
from rect import rect_wall, grid
from fronts import fronts, near
from PIL import Image, ImageDraw, ImageFont
side=sys.argv[1]; only=int(sys.argv[2]) if len(sys.argv)>2 and sys.argv[2]!='all' else None
force=[int(v) for v in sys.argv[3].split(',')] if len(sys.argv)>3 else None
segs=[o for o in fronts() if o['side']==side and o['par']>0.8 and o['L']>2.0]
for o in segs:
    sa=near(o['ax'],o['az'])[1]; sb=near(o['bx'],o['bz'])[1]
    if sa>sb: o['ax'],o['az'],o['bx'],o['bz']=o['bx'],o['bz'],o['ax'],o['az']; sa,sb=sb,sa
    o['sa'],o['sb']=sa,sb
    # a: the left end seen from the street — the north end on the E side, the south end on the W side
    if side=='W': o['ax'],o['az'],o['bx'],o['bz']=o['bx'],o['bz'],o['ax'],o['az']
segs.sort(key=lambda o:o['sa'])
f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',22)
for i,o in enumerate(segs):
    if only is not None and i!=only: continue
    a=(o['ax'],o['az']); b=(o['bx'],o['bz']); L=o['L']; H=o['f']*3.1+1.5
    tx,tz=(b[0]-a[0])/L,(b[1]-a[1])/L; nx,nz=-tz,tx
    cands=[]
    for n in range(1,22):
        c=Cam(n)
        if (c.x-a[0])*nx+(c.z-a[1])*nz<0.3: continue
        out=rect_wall(a,b,[n],20,H,(0,0))[0]
        if n not in out: continue
        seg,sm,q,_=out[n]; w,h=seg.size
        valid=sum(1 for X in range(w) if sm.getpixel((X,int(h*0.75)))>0)
        if valid<w*0.85: continue
        uc=(c.x-a[0])*tx+(c.z-a[1])*tz
        dfar=max(abs(0-uc),abs(L-uc))
        cands.append((-dfar, n, c.f[0]*tx+c.f[2]*tz>0))
    cands.sort(reverse=True)
    pick=force or [n for _,n,_ in cands[:2]]
    res=max(55,min(110,int(900/(L+3))))
    for n in pick:
        out=rect_wall(a,b,[n],res,H,(1.5,1.5))[0]
        if n not in out: continue
        seg,sm,q,_=out[n]; w,h=seg.size
        im=Image.new('RGB',(w,h),(128,128,128)); im.paste(seg,(0,0),sm)
        g=grid(im,res,H,1.5,step=0.5); d=ImageDraw.Draw(g)
        for k in range(-15,int((L+1.5)*10)+1):
            X=(k/10+1.5)*res; d.line([(X,h-7),(X,h)],fill=(255,0,255),width=1); d.line([(X,0),(X,7)],fill=(255,0,255),width=1)
        for k in range(0,int(H*10)+1):
            Y=h-k/10*res; d.line([(0,Y),(7,Y)],fill=(255,0,255),width=1); d.line([(w-7,Y),(w,Y)],fill=(255,0,255),width=1)
        for t in (0,L):
            X=(t+1.5)*res; d.line([(X,0),(X,h)],fill=(255,0,255),width=2)
        d.text((10,h-60),f'{side}{i} b{o["b"]} v{n}',fill=(255,0,0),font=f,stroke_width=3,stroke_fill=(255,255,255))
        g.save(f'{SP}/hs_{side}{i}_v{n}.jpg',quality=90)
    print(f'{side}{i} b{o["b"]} s {o["sa"]:.1f}-{o["sb"]:.1f} a ({a[0]:.2f},{a[1]:.2f}) b ({b[0]:.2f},{b[1]:.2f}) L {L:.2f} f{o["f"]} views {pick} cands {[(n,round(-d,1)) for d,n,_ in cands]}')
