# pair.py n [tag] [half]: the Street View viewport (screenshot n) over the game's shot from the same pose
import sys, glob
from PIL import Image, ImageDraw
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import SP, REPO, files as _files
files=_files()
n=int(sys.argv[1]); tag=sys.argv[2] if len(sys.argv)>2 and sys.argv[2]!='-' else ''
half=sys.argv[3] if len(sys.argv)>3 else ''
sv=Image.open(files[n-1]).convert('RGB')
W,H=sv.size
top=H-2016
sv=sv.crop((0,top,W,H))
g=Image.open(f'{REPO}/.snaps/mf_{n:02d}{"_"+tag if tag else ""}.jpg').convert('RGB').resize((W,2016))
if half=='L': sv=sv.crop((0,0,W//2,2016)); g=g.crop((0,0,W//2,2016))
elif half=='R': sv=sv.crop((W//2,0,W,2016)); g=g.crop((W//2,0,W,2016))
tw=1400 if not half else 900
sv=sv.resize((tw,int(sv.height*tw/sv.width))); g=g.resize((tw,int(g.height*tw/g.width)))
out=Image.new('RGB',(tw,sv.height+g.height+4),(255,0,0))
out.paste(sv,(0,0)); out.paste(g,(0,sv.height+4))
name=f'{SP}/pair_{n:02d}{"_"+tag if tag else ""}{half}.jpg'
out.save(name,quality=88); print(name, out.size)
