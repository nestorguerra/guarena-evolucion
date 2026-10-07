# sample.py n x0 y0 x1 y1 [...]: mean colour (sRGB hex) of rectangles of screenshot n's panorama (full-res pixels)
import sys
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import files, W
from PIL import Image, ImageStat
n=int(sys.argv[1]); im=Image.open(files()[n-1]).convert('RGB'); top=im.height-2016
a=[int(v) for v in sys.argv[2:]]
for k in range(0,len(a),4):
    x0,y0,x1,y1=a[k:k+4]
    st=ImageStat.Stat(im.crop((x0,top+y0,x1,top+y1)))
    m=[round(v) for v in st.mean]; sd=[round(v,1) for v in st.stddev]
    print(f'({x0},{y0})-({x1},{y1}): #{m[0]:02x}{m[1]:02x}{m[2]:02x} {m} sd {sd}')
