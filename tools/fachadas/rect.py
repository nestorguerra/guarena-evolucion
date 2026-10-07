# rect.py: unwarp the screenshots onto planar walls. A wall: two ground points a, b (x, z) — u runs from a to b — and
# the screenshots that see it. rect_wall(a, b, views, res, ymax) → {view: (image, mask, quality per column)}, composite
import sys, math
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import *
from PIL import Image, ImageDraw, ImageFont, ImageChops
UI=[(0,0,0.225,0.075),(0,0,0.18,0.215),(0,0.865,0.137,1),(0.94,0.82,1,1),(0.69,0.985,1,1),(0.89,0,1,0.065),(0.885,0.86,1,1)]
_ph={}
GAME=None  # a tag: unwarp the game's own shot from that pose (.snaps/mf_nn[_tag].jpg) instead of the photograph
def photo(n):
    key=(n,GAME)
    if key in _ph: return _ph[key]
    if GAME is not None:
        im=Image.open(f'{REPO}/.snaps/mf_{n:02d}{"_"+GAME if GAME else ""}.jpg').convert('RGB').resize((W,H))
        m=Image.new('L',(W,H),255); _ph[key]=(im,m); return im,m
    im=Image.open(files()[n-1]).convert('RGB'); top=im.height-2016; im=im.crop((0,top,W,im.height))
    m=Image.new('L',(W,H),255); dm=ImageDraw.Draw(m)
    for (a,b,c2,d2) in UI: dm.rectangle((a*W,b*H,c2*W,d2*H),fill=0)
    _ph[key]=(im,m); return im,m
def wall_coeffs(c, a, b, res, ymax, y0=0.0):
    L=math.hypot(b[0]-a[0],b[1]-a[1]); tx,tz=(b[0]-a[0])/L,(b[1]-a[1])/L
    A=(a[0]-c.x,0-c.y,a[1]-c.z)
    def comp(v): return (A[0]*v[0]+A[1]*v[1]+A[2]*v[2], (tx*v[0]+tz*v[2])/res, v[1])
    def lin(cf): return (cf[1], -cf[2]/res, cf[0]+cf[2]*ymax)
    X_=lin(comp(c.r)); Y_=lin(comp(c.u)); Z_=lin(comp(c.f))
    F=c.F
    nx=(W/2*Z_[0]+F*X_[0], W/2*Z_[1]+F*X_[1], W/2*Z_[2]+F*X_[2])
    ny=(H/2*Z_[0]-F*Y_[0], H/2*Z_[1]-F*Y_[1], H/2*Z_[2]-F*Y_[2])
    kk=Z_[2]
    return (nx[0]/kk,nx[1]/kk,nx[2]/kk,ny[0]/kk,ny[1]/kk,ny[2]/kk,Z_[0]/kk,Z_[1]/kk), Z_, L
def rect_wall(a, b, views, res=60, ymax=12.0, ext=(0.0,0.0)):
    # ext: metres beyond a and beyond b
    L=math.hypot(b[0]-a[0],b[1]-a[1]); tx,tz=(b[0]-a[0])/L,(b[1]-a[1])/L
    a2=(a[0]-tx*ext[0],a[1]-tz*ext[0]); b2=(b[0]+tx*ext[1],b[1]+tz*ext[1])
    nx,nz=tz,-tx  # outward normal for a wall seen with a on the left... decide by camera side
    out={}
    w=int(round((L+ext[0]+ext[1])*res)); h=int(round(ymax*res))
    for n in views:
        c=Cam(n); im,mask=photo(n)
        side=(c.x-a[0])*nx+(c.z-a[1])*nz
        co,Z_,_=wall_coeffs(c,a2,b2,res,ymax)
        # columns in front of the camera only
        if min(Z_[0]*X+Z_[1]*Y+Z_[2] for X in (0,w) for Y in (0,h))<0.8:
            # keep only the part in front: find X range where depth>0.8 at both Y
            xs=[X for X in range(0,w,4) if min(Z_[0]*X+Z_[1]*Y+Z_[2] for Y in (0,h))>0.8]
            if not xs: continue
        seg=im.transform((w,h),Image.PERSPECTIVE,co,Image.BICUBIC)
        sm=mask.transform((w,h),Image.PERSPECTIVE,co,Image.NEAREST)
        fr=Image.new('L',(W,H),255).transform((w,h),Image.PERSPECTIVE,co,Image.NEAREST)
        sm=ImageChops.multiply(sm,fr)
        # depth validity mask
        dm=Image.new('L',(w,h),0); dd=ImageDraw.Draw(dm)
        xs=[X for X in range(0,w) if min(Z_[0]*X+Z_[1]*Y+Z_[2] for Y in (0,h))>0.8]
        if not xs: continue
        dd.rectangle((xs[0],0,xs[-1],h),fill=255)
        sm=ImageChops.multiply(sm,dm)
        q=[]
        for X in range(w):
            u=X/res; px=a2[0]+tx*u; pz=a2[1]+tz*u
            dx,dz=px-c.x,pz-c.z; d=math.hypot(dx,dz)+1e-6
            cos=abs((dx*nx+dz*nz)/d); q.append(cos/(d*d+(4-c.y)**2))
        out[n]=(seg,sm,q,abs(side))
    comp=Image.new('RGB',(w,h),(128,128,128)); best=[0]*w; who=[0]*w
    for n,(seg,sm,q,_) in out.items():
        for X in range(w):
            if q[X]>best[X] and sm.getpixel((X,h//2))>0:
                best[X]=q[X]; who[X]=n
    for X in range(w):
        n=who[X]
        if n: seg,sm,_,_=out[n]; comp.paste(seg.crop((X,0,X+1,h)),(X,0),sm.crop((X,0,X+1,h)))
    return out, comp, who, w, h
def grid(img, res, ymax, ext0=0.0, step=0.5, label=True):
    img=img.copy(); d=ImageDraw.Draw(img); f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',max(11,res//4))
    w,h=img.size
    import math as _m
    u=_m.ceil(-ext0/step-1e-9)*step
    while (u+ext0)*res<=w+1:
        X=(u+ext0)*res
        major=abs(u-round(u))<1e-6
        d.line([(X,0),(X,h)],fill=(255,0,0) if major else (255,230,0),width=1)
        if major and label: d.text((X+2,2),f'{u:.0f}',fill=(255,0,0),font=f,stroke_width=1,stroke_fill=(255,255,255))
        u+=step
    y=0.0
    while y<=ymax+1e-6:
        Y=h-y*res; major=abs(y-round(y))<1e-6
        d.line([(0,Y),(w,Y)],fill=(0,200,255) if major else (150,255,255),width=1)
        if major and label: d.text((2,Y-res//4-2),f'{y:.0f}',fill=(0,90,255),font=f,stroke_width=1,stroke_fill=(255,255,255))
        y+=step
    return img
