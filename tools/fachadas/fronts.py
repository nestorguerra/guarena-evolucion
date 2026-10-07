# the street-facing walls of Calle Malfeitos (Catastro part edges), per side, in order from north to south
import math, json, sys
sys.path.insert(0, __file__.rsplit('/',1)[0])
from cam import load_map, dec, SP
PL=[(106.5,-222.1),(110.6,-135.5),(112.0,-82.1)]
def near(x,z):
    best=None; s0=0
    for i in range(len(PL)-1):
        a,b=PL[i],PL[i+1]; L=math.hypot(b[0]-a[0],b[1]-a[1]); dx,dz=(b[0]-a[0])/L,(b[1]-a[1])/L
        t=max(-5,min(L+5,(x-a[0])*dx+(z-a[1])*dz)); px,pz=a[0]+dx*t,a[1]+dz*t
        lat=(x-px)*dz-(z-pz)*dx  # >0: west?  for d=(0,1): lat = x-px → east positive
        d=math.hypot(x-px,z-pz)
        if best is None or d<best[0]: best=(d,s0+t,lat,dx,dz)
        s0+=L
    return best
def fronts(M=None):
    M=M or load_map(); out=[]
    for pi,p in enumerate(M['parts']):
        r=dec(p['p']); n=len(r)//2
        # ring orientation: area sign
        A=sum(r[2*i]*r[2*((i+1)%n)+1]-r[2*((i+1)%n)]*r[2*i+1] for i in range(n))/2
        for i in range(n):
            j=(i+1)%n; ax,az,bx,bz=r[2*i],r[2*i+1],r[2*j],r[2*j+1]
            L=math.hypot(bx-ax,bz-az)
            if L<0.3: continue
            mx,mz=(ax+bx)/2,(az+bz)/2
            q=near(mx,mz)
            if q[0]>7.5 or q[1]<-3 or q[1]>143: continue
            # outward normal: for CCW (A>0 in x,z with z south...) compute and test toward street
            nx,nz=(bz-az)/L,-(bx-ax)/L
            if A<0: nx,nz=-nx,-nz
            # street direction at q: (q[3],q[4]); toward street = -(lat sign) * (dz,-dx)... use the centre point
            sx,sz=mx+nx*1.0,mz+nz*1.0
            if near(sx,sz)[0]>=q[0]: continue  # not facing the street
            par=abs((bx-ax)/L*q[3]+(bz-az)/L*q[4])
            side='E' if q[2]>0 else 'W'
            qa,qb=near(ax,az),near(bx,bz)
            out.append(dict(side=side,b=p['b'],p=pi,f=p['f'],ax=ax,az=az,bx=bx,bz=bz,L=L,nx=nx,nz=nz,s0=min(qa[1],qb[1]),s1=max(qa[1],qb[1]),d=q[0],par=par))
    out.sort(key=lambda o:(o['side'],o['s0']))
    # only the frontmost wall of each stretch: drop walls with another one in front of them over most of their length
    keep=[]
    for o in out:
        if o['par']<0.8: keep.append(o); continue
        hidden=False
        for q in out:
            if q is o or q['side']!=o['side'] or q['par']<0.8: continue
            ov=min(o['s1'],q['s1'])-max(o['s0'],q['s0'])
            if ov>0.5*(o['s1']-o['s0']) and q['d']<o['d']-0.8: hidden=True; break
        o['hidden']=hidden
        if not hidden: keep.append(o)
    return keep
if __name__=='__main__':
    for o in fronts():
        print(f"{o['side']} b{o['b']:5d} p{o['p']:5d} f{o['f']} s {o['s0']:6.1f}-{o['s1']:6.1f} L {o['L']:5.1f} d {o['d']:4.1f} par {o['par']:.2f}  ({o['ax']:.1f},{o['az']:.1f})-({o['bx']:.1f},{o['bz']:.1f})")
