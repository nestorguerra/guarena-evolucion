# ruler.py n x0 x1 [y0 y1] [outw]: a crop of picture n (full-resolution panorama pixels) with rulers (ticks every 10 px,
# numbers every 100 px, in panorama pixels) on all four sides, and the Catastro's party walls projected with the raw
# Street View camera (dashed, labelled E/W + s) — to read where each real boundary is, in pixels
import sys, math
sys.path.insert(0, __file__.rsplit('/',1)[0])
import cam
cam.CORR.clear()
from cam import *
from fronts import fronts, near
from PIL import Image, ImageDraw, ImageFont
n=int(sys.argv[1]); x0=int(sys.argv[2]); x1=int(sys.argv[3])
y0=int(sys.argv[4]) if len(sys.argv)>4 else 0; y1=int(sys.argv[5]) if len(sys.argv)>5 else H
ow=int(sys.argv[6]) if len(sys.argv)>6 else 1400
c=Cam(n)
im=Image.open(files()[n-1]).convert('RGB'); top=im.height-2016; im=im.crop((0,top,W,im.height))
cr=im.crop((x0,y0,x1,y1)); k=ow/(x1-x0); cr=cr.resize((ow,int((y1-y0)*k)),Image.LANCZOS)
d=ImageDraw.Draw(cr); f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14); fs=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',13)
X=lambda x:(x-x0)*k; Y=lambda y:(y-y0)*k
# the party walls (ends of the frontmost street walls)
B=set()
for o in fronts():
    if o['par']<0.8 or o['L']<1.0: continue
    for (x,z) in ((o['ax'],o['az']),(o['bx'],o['bz'])): B.add((o['side'],round(near(x,z)[1],1),round(x,2),round(z,2),o['f']))
for (side,s,x,z,fl) in sorted(B):
    q0=c.proj(x,0,z); q1=c.proj(x,fl*3.1,z)
    if not q0 or not q1: continue
    if not (x0-40<q0[0]<x1+40): continue
    for t in range(0,40,2):
        a=(q0[0]+(q1[0]-q0[0])*t/40,q0[1]+(q1[1]-q0[1])*t/40); b=(q0[0]+(q1[0]-q0[0])*(t+1)/40,q0[1]+(q1[1]-q0[1])*(t+1)/40)
        d.line([(X(a[0]),Y(a[1])),(X(b[0]),Y(b[1]))],fill=(255,0,255) if side=='E' else (0,200,255),width=2)
    lab_y=min(max(Y(q0[1])-20,20),cr.height-40)
    d.text((X(q0[0])+3,lab_y),f'{side}{s}',fill=(255,0,255) if side=='E' else (0,160,255),font=fs,stroke_width=2,stroke_fill=(255,255,255))
# rulers
for x in range((x0//10)*10,x1+1,10):
    if x<x0: continue
    L=12 if x%100==0 else 6 if x%50 else 9
    d.line([(X(x),0),(X(x),L)],fill=(255,0,0),width=1); d.line([(X(x),cr.height-L),(X(x),cr.height)],fill=(255,0,0),width=1)
    if x%100==0: d.text((X(x)+2,12),str(x),fill=(255,0,0),font=f,stroke_width=2,stroke_fill=(255,255,255)); d.text((X(x)+2,cr.height-28),str(x),fill=(255,0,0),font=f,stroke_width=2,stroke_fill=(255,255,255))
for y in range((y0//10)*10,y1+1,10):
    if y<y0: continue
    L=12 if y%100==0 else 6
    d.line([(0,Y(y)),(L,Y(y))],fill=(0,0,255),width=1); d.line([(cr.width-L,Y(y)),(cr.width,Y(y))],fill=(0,0,255),width=1)
    if y%100==0: d.text((14,Y(y)-8),str(y),fill=(0,0,255),font=f,stroke_width=2,stroke_fill=(255,255,255))
name=f'{SP}/ru_{n:02d}_{x0}_{y0}.jpg'; cr.save(name,quality=90); print(name,cr.size,'scale',round(k,3))
