# sheet21.py [tag] [views]: photo and game (from the same pose) side by side, a row per view → cmp_<tag>_<a>.jpg
import sys
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import files, SP, REPO
from PIL import Image, ImageDraw, ImageFont
tag=sys.argv[1] if len(sys.argv)>1 and sys.argv[1]!='-' else ''
views=[int(v) for v in sys.argv[2].split(',')] if len(sys.argv)>2 else list(range(1,22))
f=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',20)
rows=[]
for n in views:
    sv=Image.open(files()[n-1]).convert('RGB'); W,H=sv.size; sv=sv.crop((0,H-2016,W,H)).resize((700,392),Image.LANCZOS)
    g=Image.open(f'{REPO}/.snaps/mf_{n:02d}{"_"+tag if tag else ""}.jpg').convert('RGB').resize((700,392),Image.LANCZOS)
    r=Image.new('RGB',(1406,392),(255,255,255)); r.paste(sv,(0,0)); r.paste(g,(706,0))
    ImageDraw.Draw(r).text((712,6),f'v{n}',fill=(255,255,0),font=f,stroke_width=2,stroke_fill=(0,0,0))
    rows.append(r)
out=Image.new('RGB',(1406,len(rows)*398),(255,255,255))
for i,r in enumerate(rows): out.paste(r,(0,i*398))
name=f'{SP}/cmp{"_"+tag if tag else ""}_{views[0]}.jpg'; out.save(name,quality=82); print(name,out.size)
