# fitpx.py view ax az bx bz anchors [base] label=px:py[:z] ...: the camera fitted to one house, then its features.
# anchors: «px:py=t[,px:py=t]» — pixels of the house's party walls (at the wall plane) and where the Catastro has them
# (m along the wall from a). One anchor: the camera's distance to the wall; two: its distance and its place along the
# street. base: «px:py» of the foot of the wall (pavement level), to measure heights from (default: the camera's eye
# height minus 2.5 m — the road). Prints each feature's u (m from a) and y (m above the pavement) at depth z.
import sys, math, json
sys.path.insert(0, __file__.rsplit('/',1)[0])
import cam
cam.CORR.clear()
from cam import Cam, SP
args=sys.argv[1:]
n=int(args[0]); ax,az,bx,bz=[float(v) for v in args[1:5]]
anch=[]
for a in args[5].split(','):
    p,t=a.split('='); x,y=[float(v) for v in p.split(':')]; anch.append((x,y,float(t)))
rest=args[6:]
base=None
if rest and '=' not in rest[0]:
    base=[float(v) for v in rest[0].split(':')]; rest=rest[1:]
L=math.hypot(bx-ax,bz-az); tx,tz=(bx-ax)/L,(bz-az)/L
c0=Cam(n); nx,nz=-tz,tx
if (c0.x-ax)*nx+(c0.z-az)*nz<0: nx,nz=-nx,-nz
def hit(c,px,py,z):
    (ox,oy,oz),d=c.ray(px,py); den=d[0]*nx+d[2]*nz
    t=((ax+nx*z-ox)*nx+(az+nz*z-oz)*nz)/den
    X,Y,Z=ox+d[0]*t,oy+d[1]*t,oz+d[2]*t
    return (X-ax)*tx+(Z-az)*tz, Y, t
import os
MODE=os.environ.get('FIT','hD')   # which two the anchors fix: hD (heading, distance) or sD (along, distance)
def camof(a,dD):
    if MODE=='sD': cam.CORR[n]={'dx':tx*a-nx*dD,'dz':tz*a-nz*dD}
    else: cam.CORR[n]={'dx':-nx*dD,'dz':-nz*dD,'dh':a}
    return Cam(n)
p=[0.0,0.0]
free=[0,1] if len(anch)>=2 else [1]
for it in range(40):
    c=camof(*p); r=[hit(c,x,y,0)[0]-t for (x,y,t) in anch]
    if max(abs(v) for v in r)<1e-4: break
    J=[]
    for k in free:
        q=p[:]; q[k]+=0.01; cq=camof(*q); J.append([(hit(cq,x,y,0)[0]-t-r0)/0.01 for (x,y,t),r0 in zip(anch,r)])
    if len(free)==1:
        g=sum(J[0][i]*r[i] for i in range(len(r))); hh=sum(v*v for v in J[0]); p[1]-=g/hh
    else:
        a11=sum(v*v for v in J[0]); a12=sum(J[0][i]*J[1][i] for i in range(len(r))); a22=sum(v*v for v in J[1])
        g1=sum(J[0][i]*r[i] for i in range(len(r))); g2=sum(J[1][i]*r[i] for i in range(len(r)))
        det=a11*a22-a12*a12; p[0]-=(a22*g1-a12*g2)/det; p[1]-=(a11*g2-a12*g1)/det
c=camof(*p)
uc=(c.x-ax)*tx+(c.z-az)*tz; D=(c.x-ax)*nx+(c.z-az)*nz
y0=hit(c,base[0],base[1],0)[1] if base else c.y-2.5
print(f'v{n}: camera {"turned %+.2f deg"%p[0] if MODE!="sD" else "moved %+.2f m along"%p[0]}, {p[1]:+.2f} m toward the wall → foot u {uc:.2f}, {D:.2f} m off; pavement at y {y0:.2f}')
for (x,y,t) in anch: print(f'  anchor ({x:.0f},{y:.0f}) → {hit(c,x,y,0)[0]:.2f} (Catastro {t})')
for a in rest:
    lab,v=a.split('=') if '=' in a else ('',a)
    q=[float(s) for s in v.split(':')]
    z=q[2] if len(q)>2 else 0.0
    u,Y,dist=hit(c,q[0],q[1],z)
    print(f'  {lab:12s} ({q[0]:5.0f},{q[1]:5.0f}) z {z:+.2f} → u {u:6.2f}  y {Y-y0:5.2f}')
