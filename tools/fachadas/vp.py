# vp.py [views]: each picture's heading from the vanishing point of the street's lines (cornices, plinths, balcony
# slabs, kerbs): the edges of the photograph vote for the point on the horizon they run to; the walls' direction near the
# camera (Catastro) turns that point into the camera's true heading. Writes an/vp.json {n: dh (deg, to add to the URL's)}
import sys, math, json
sys.path.insert(0, __file__.rsplit('/',1)[0])
import cam
from cam import *
from fronts import fronts, near
from PIL import Image, ImageFilter, ImageDraw
DS=3; w,h=W//DS,H//DS
UI=[(0,0,0.225,0.075),(0,0,0.18,0.215),(0,0.865,0.137,1),(0.94,0.82,1,1),(0.69,0.985,1,1),(0.89,0,1,0.065),(0.885,0.86,1,1)]
FR=[o for o in fronts() if o['par']>0.8 and o['L']>2]
def wall_dir(c):
    # the mean direction (unit, pointing the way the camera looks) of the street walls 3-30 m ahead of the camera
    sx=sz=0.0
    for o in FR:
        mx,mz=(o['ax']+o['bx'])/2,(o['az']+o['bz'])/2
        f=(mx-c.x)*c.f[0]+(mz-c.z)*c.f[2]
        if f<3 or f>30: continue
        dx,dz=o['bx']-o['ax'],o['bz']-o['az']; L=math.hypot(dx,dz); dx/=L; dz/=L
        if dx*c.f[0]+dz*c.f[2]<0: dx,dz=-dx,-dz
        wgt=L/(1+f/10)
        sx+=dx*wgt; sz+=dz*wgt
    L=math.hypot(sx,sz)
    if L<1e-6: return (c.f[0]/math.hypot(c.f[0],c.f[2]), c.f[2]/math.hypot(c.f[0],c.f[2]))
    return (sx/L,sz/L)
def edges(n):
    im=Image.open(files()[n-1]).convert('L'); top=im.height-2016; im=im.crop((0,top,W,im.height)).resize((w,h),Image.BOX)
    gx=im.filter(ImageFilter.Kernel((3,3),[-1,0,1,-2,0,2,-1,0,1],8,128))
    gy=im.filter(ImageFilter.Kernel((3,3),[-1,-2,-1,0,0,0,1,2,1],8,128))
    GX=list(gx.getdata()); GY=list(gy.getdata())
    pts=[]
    for i in range(len(GX)):
        a=GX[i]-128; b=GY[i]-128
        m=a*a+b*b
        if m<36: continue
        x=i%w; y=i//w
        X=x*DS; Y=y*DS
        if any(u0*W<=X<=u1*W and v0*H<=Y<=v1*H for (u0,v0,u1,v1) in UI): continue
        mm=math.sqrt(m)
        pts.append((X,Y,-b/mm,a/mm,min(mm,40.0)))  # (edge direction: along the edge)
    return pts
def score(pts,vx,vy,sig=0.02):
    s=0.0
    for (X,Y,ex,ey,m) in pts:
        tx=vx-X; ty=vy-Y; L=math.hypot(tx,ty)
        if L<60: continue
        sn=(ex*ty-ey*tx)/L
        if sn<0: sn=-sn
        if sn<0.06: s+=m*math.exp(-(sn/sig)**2)
    return s
views=[int(v) for v in sys.argv[1].split(',')] if len(sys.argv)>1 else list(range(1,22))
out={}
try: out={int(k):v for k,v in json.load(open(SP+'/an/vp.json')).items()}
except Exception: pass
for n in views:
    cam.CORR.pop(n,None)  # (the raw camera)
    c=Cam(n); d=wall_dir(c)
    q=c.proj(c.x+d[0]*1000,c.y,c.z+d[1]*1000)
    vx0,vy0=q[0],q[1]
    pts=edges(n)
    # keep only edges that are roughly aimed at the predicted point (within ~12 deg): the street's lines
    sel=[]
    for p in pts:
        tx=vx0-p[0]; ty=vy0-p[1]; L=math.hypot(tx,ty)
        if L<80: continue
        if abs(p[2]*ty-p[3]*tx)/L<0.2: sel.append(p)
    # each edge's line crosses the horizon somewhere: a histogram of those crossings (precise edges weigh more)
    bins={}
    for (X,Y,ex,ey,m) in sel:
        dyh=vy0-Y
        if abs(dyh)<120 or abs(ey)<0.04: continue
        xh=X+dyh*ex/ey
        sx=abs(dyh)*0.012/(ey*ey)          # (its spread for a 0.7 deg error in the edge's direction)
        if sx>60: continue
        wgt=m/max(2.0,sx)
        k0=int((xh-sx*2)//2); k1=int((xh+sx*2)//2)
        for k in range(k0,k1+1):
            xc=k*2+1; bins[k]=bins.get(k,0.0)+wgt*math.exp(-0.5*((xc-xh)/max(2.0,sx))**2)
    # smoothed peak near the prediction (±400 px)
    k0=int((vx0-400)//2); k1=int((vx0+400)//2)
    best=None; vals=[]
    for k in range(k0,k1+1):
        v=sum(bins.get(k+j,0.0)*math.exp(-0.5*(j/2.0)**2) for j in range(-6,7))
        vals.append(v)
        if best is None or v>best[1]: best=(k*2+1-vx0,v)
    srt=sorted(vals); peak=best[1]/max(1e-6,srt[len(srt)//2])
    ang=math.degrees(math.atan((vx0+best[0]-W/2)/c.F))-math.degrees(math.atan((vx0-W/2)/c.F))
    dh=-ang
    print(n,'edges',len(sel),'vp0',(round(vx0),round(vy0)),'dx',round(best[0],1),'dh',round(dh,2),'peak/median',round(peak,1))
    out[n]={'dh':round(dh,3),'peak':round(peak,2)}
    # a picture of the vote
    im=Image.open(files()[n-1]).convert('RGB'); top=im.height-2016; im=im.crop((0,top,W,im.height)).resize((w,h))
    dr=ImageDraw.Draw(im)
    vx,vy=(vx0+best[0])/DS,(vy0)/DS
    for (X,Y,ex,ey,m) in sel[::7]:
        tx=vx0+best[0]-X; ty=vy0-Y; L=math.hypot(tx,ty)
        if abs((ex*ty-ey*tx)/L)<0.02: dr.line([(X/DS,Y/DS),(vx,vy)],fill=(255,0,0),width=1)
    dr.ellipse((vx-6,vy-6,vx+6,vy+6),outline=(0,255,0),width=3)
    dr.ellipse((vx0/DS-6,vy0/DS-6,vx0/DS+6,vy0/DS+6),outline=(255,255,0),width=2)
    im.save(f'{SP}/vp_{n:02d}.jpg',quality=80)
json.dump(out,open(SP+'/an/vp.json','w'),indent=1)
