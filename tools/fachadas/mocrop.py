# mocrop.py side s0 s1 [ymax]: a stretch of the mosaic with a 0.5 m grid labelled in s (street metres), heights, and the
# picture each column comes from along the bottom
import sys, json
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import SP
from fronts import fronts, near
from PIL import Image, ImageDraw, ImageFont
side=sys.argv[1]; s0=float(sys.argv[2]); s1=float(sys.argv[3]); ym=float(sys.argv[4]) if len(sys.argv)>4 else 10
res=60; S0=-2.0; HM=13.0
im=Image.open(f'{SP}/mo_{side}.png').convert('RGB'); who=json.load(open(f'{SP}/mo_{side}_who.json'))
c=im.crop((int((s0-S0)*res),int((HM-ym)*res),int((s1-S0)*res),im.height)).copy()
d=ImageDraw.Draw(c); f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',15)
s=round(s0*2)/2
while s<=s1:
    X=(s-s0)*res
    if X>=0:
        maj=abs(s-round(s))<1e-6
        d.line([(X,0),(X,c.height)],fill=(255,0,0) if maj else (255,230,0),width=1)
        if maj: d.text((X+2,2),str(int(round(s))),fill=(255,0,0),font=f,stroke_width=2,stroke_fill=(255,255,255))
    s+=0.5
for k in range(int(ym*10)+1):
    Y=c.height-k/10*res
    if k%5==0: d.line([(0,Y),(c.width,Y)],fill=(0,220,255) if k%10==0 else (160,255,255),width=1)
    if k%10==0: d.text((2,Y-16),str(k//10),fill=(0,90,255),font=f,stroke_width=2,stroke_fill=(255,255,255))
    d.line([(0,Y),(5,Y)],fill=(255,0,255),width=1)
for k in range(int(s0*10),int(s1*10)+1):
    X=(k/10-s0)*res; d.line([(X,c.height-5),(X,c.height)],fill=(255,0,255),width=1)
# the picture each stretch comes from
prev=None
for X in range(c.width):
    col=int((s0-S0)*res)+X
    n=who[col] if 0<=col<len(who) else 0
    if n!=prev:
        d.text((X+3,c.height-40),f'v{n}',fill=(255,255,255),font=f,stroke_width=2,stroke_fill=(0,0,0)); d.line([(X,c.height-45),(X,c.height)],fill=(255,255,255),width=2)
        prev=n
B=set()
for o in fronts():
    if o['side']!=side or o['par']<0.8 or o['L']<1.0: continue
    for (x,z) in ((o['ax'],o['az']),(o['bx'],o['bz'])): B.add(round(near(x,z)[1],1))
for b in sorted(B):
    if s0<=b<=s1:
        X=(b-s0)*res; d.polygon([(X,22),(X-7,6),(X+7,6)],fill=(255,0,255))
name=f'{SP}/mc_{side}_{int(s0)}.jpg'; c.save(name,quality=90); print(name,c.size)
