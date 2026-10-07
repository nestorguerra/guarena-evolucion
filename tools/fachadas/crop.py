# crop.py n x0 y0 x1 y1 [out_w]: a crop of screenshot n's panorama (fractions 0..1 of the 3600x2016 view) → crop_n_*.jpg
import sys, glob
from PIL import Image
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import SP, REPO, files as _files
files=_files()
n=int(sys.argv[1]); x0,y0,x1,y1=[float(v) for v in sys.argv[2:6]]; ow=int(sys.argv[6]) if len(sys.argv)>6 else 1400
im=Image.open(files[n-1]).convert('RGB'); W,H=im.size; top=H-2016
c=im.crop((int(x0*W),top+int(y0*2016),int(x1*W),top+int(y1*2016)))
if c.width>ow: c=c.resize((ow,int(c.height*ow/c.width)), Image.LANCZOS)
name=f'{SP}/crop_{n:02d}_{int(x0*100)}_{int(y0*100)}.jpg'; c.save(name,quality=90); print(name,c.size)
