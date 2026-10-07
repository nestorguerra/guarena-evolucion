# pc.py n x0 y0 x1 y1 [tag] [w]: the same crop (fractions of the panorama) of the photo and of the game's shot, side by side
import sys, glob
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import files, SP, REPO
from PIL import Image
n=int(sys.argv[1]); x0,y0,x1,y1=[float(v) for v in sys.argv[2:6]]; tag=sys.argv[6] if len(sys.argv)>6 and sys.argv[6]!='-' else ''
ow=int(sys.argv[7]) if len(sys.argv)>7 else 1400
sv=Image.open(files()[n-1]).convert('RGB'); W,H=sv.size; sv=sv.crop((0,H-2016,W,H))
g=Image.open(f'{REPO}/.snaps/mf_{n:02d}{"_"+tag if tag else ""}.jpg').convert('RGB').resize((W,2016))
box=(int(x0*W),int(y0*2016),int(x1*W),int(y1*2016))
a=sv.crop(box); b=g.crop(box)
hw=(ow-8)//2; sc=hw/a.width
a=a.resize((hw,int(a.height*sc)),Image.LANCZOS); b=b.resize((hw,int(b.height*sc)),Image.LANCZOS)
out=Image.new('RGB',(ow,a.height),(255,255,255)); out.paste(a,(0,0)); out.paste(b,(hw+8,0))
name=f'{SP}/pc_{n:02d}{tag}_{int(x0*100)}_{int(y0*100)}.jpg'; out.save(name,quality=90); print(name,out.size)
