# px.py view ax az bx bz [ds dD dh] label=px:py[:z] ...: points read in picture n (full-resolution panorama pixels,
# ruler.py crops) put on a wall: the camera's ray through the pixel meets the plane z metres out of the wall (+ street,
# - recessed) at u (m along the wall from a) and y (m up). The camera is the raw Street View one, or moved ds m along the
# wall and dD m toward the wall and turned dh deg (all optional, «-» to skip)
import sys, math
sys.path.insert(0, __file__.rsplit('/',1)[0])
import cam
cam.CORR.clear()
from cam import Cam
args=sys.argv[1:]
n=int(args[0]); ax,az,bx,bz=[float(v) for v in args[1:5]]; rest=args[5:]
ds=dD=dh=0.0
if rest and '=' not in rest[0]:
    ds,dD,dh=[float(v) for v in rest[:3]]; rest=rest[3:]
L=math.hypot(bx-ax,bz-az); tx,tz=(bx-ax)/L,(bz-az)/L
c0=Cam(n)
nx,nz=-tz,tx
if (c0.x-ax)*nx+(c0.z-az)*nz<0: nx,nz=-nx,-nz   # (the wall's normal toward the camera: the street)
cam.CORR[n]={'dx':tx*ds-nx*dD,'dz':tz*ds-nz*dD,'dh':dh}
c=Cam(n)
uc=(c.x-ax)*tx+(c.z-az)*tz; D=(c.x-ax)*nx+(c.z-az)*nz
print(f'v{n}: camera foot u {uc:.2f}, {D:.2f} m from the wall, eye {c.y:.2f} m')
for a in rest:
    lab,v=a.split('=') if '=' in a else ('',a)
    p=[float(t) for t in v.split(':')]
    pxx,pyy=p[0],p[1]; z=p[2] if len(p)>2 else 0.0
    (ox,oy,oz),d=c.ray(pxx,pyy)
    den=d[0]*nx+d[2]*nz
    if abs(den)<1e-9: print(f'  {lab}: parallel'); continue
    # the plane: points P with (P - a)·n = z
    t=((ax+nx*z-ox)*nx+(az+nz*z-oz)*nz)/den
    if t<=0: print(f'  {lab}: behind'); continue
    X,Y,Z=ox+d[0]*t,oy+d[1]*t,oz+d[2]*t
    u=(X-ax)*tx+(Z-az)*tz
    print(f'  {lab:12s} px ({pxx:6.0f},{pyy:6.0f}) z {z:+.2f} → u {u:6.2f}  y {Y:5.2f}  (dist {t:5.1f})')
