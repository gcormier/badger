import sys, math, numpy as np
from manifold3d import Manifold, CrossSection
sys.path.insert(0,'.')
def P(card_t=2.0):
    p=dict(card_t=card_t,card_w=53.98,card_h=85.6,card_clr=0.2,card_tclr=0.3,key_t=3.3,key_w=18,key_l=45.5,key_clr=0.4,key_tclr=0.1,
      ring_off=5,skin=1.2,side=3.2,top_band=10,slot_w=14,slot_h=3.5,flex_len=14,flex_w=6,flex_gap=0.6,bump_d=3.8,bump_h=1.2,
      ridge_h=1.4,ridge_len=13,notch_r=7,key_win=12,grip_l=10,grip_off=28,corner_r=2)
    t30=math.tan(math.radians(30))
    p['card_gap']=p['card_t']+p['card_tclr']; p['key_gap']=p['key_t']+p['key_tclr']
    p['T_card']=2*p['skin']+p['card_gap']; p['T_key']=2*p['skin']+p['key_gap']
    p['ridge_lead']=p['ridge_h']/t30; p['ridge_catch']=p['ridge_h']*t30
    p['entry']=p['ridge_lead']+p['ridge_catch']+0.6
    p['body_w']=p['entry']+p['card_w']+p['card_clr']+p['side']
    p['key_ph']=p['key_w']+p['key_clr']; p['key_sec']=2*p['side']+p['key_ph']
    p['card_ph']=p['card_h']+p['card_clr']; p['body_h']=p['key_sec']+p['card_ph']+p['top_band']
    p['key_pl']=p['key_l']+p['key_clr']; p['ring_x']=p['body_w']-p['key_clr']-p['ring_off']
    p['key_cy']=p['side']+p['key_ph']/2; p['card_cy']=p['key_sec']+p['card_ph']/2
    return p
def box(x0,y0,z0,x1,y1,z1):
    return Manifold.cube([x1-x0,y1-y0,z1-z0]).translate([x0,y0,z0])
def rrect(w,h,r,seg=32):
    return CrossSection.square([w-2*r,h-2*r]).translate([r,r]).offset(r,join_type=__import__('manifold3d').JoinType.Round,circular_segments=seg*4)
def build(p):
    E=0.01; W,H=p['body_w'],p['body_h']; s=p['skin']
    outline=rrect(W,H,p['corner_r'])
    body=Manifold.extrude(outline,p['T_card'])
    keyreg=outline ^ CrossSection.square([W,p['key_sec']])
    body=body+Manifold.extrude(keyreg,p['T_key'])
    # card window with 45deg dovetail
    def win(z):
        d=z-s
        x1=W-p['side']+p['card_t']-d; y0=p['key_sec']-p['card_t']+d; y1=p['key_sec']+p['card_ph']+p['card_t']-d
        return [(-5,y0,z),(x1,y0,z),(x1,y1,z),(-5,y1,z)]
    pts=np.array(win(s)+win(p['T_card']+E))
    body=body-Manifold.hull_points(pts)
    # key pocket, open at +x end
    x0k=W-p['key_pl']; y0k=p['side']; y1k=p['side']+p['key_ph']
    body=body-box(x0k,y0k,s,W+1,y1k,s+p['key_gap'])
    body=body-box(W-p['key_win'],y0k,s+p['key_gap']-E,W+1,y1k,p['T_key']+1)
    gc=W-p['key_clr']-p['grip_off']
    body=body-box(gc-p['grip_l']/2,y0k,-1,gc+p['grip_l']/2,y1k,p['T_key']+1)
    # flexure U slot in bottom skin
    rx,cy,fl,fw,fg=p['ring_x'],p['key_cy'],p['flex_len'],p['flex_w'],p['flex_gap']
    ox0,ox1=rx-fl, rx+p['bump_d']/2+1+fg; oy0,oy1=cy-fw/2-fg, cy+fw/2+fg
    ix0,ix1=rx-fl-2, rx+p['bump_d']/2+1
    slot=CrossSection.square([ox1-ox0,oy1-oy0]).translate([ox0,oy0]) - CrossSection.square([ix1-ix0,fw]).translate([ix0,cy-fw/2])
    body=body-Manifold.extrude(slot,s+2*E).translate([0,0,-E])
    # bump frustum
    r0=p['bump_d']/2; r1=r0-p['bump_h']*math.tan(math.radians(30))
    body=body+Manifold.cylinder(p['bump_h'],r0,r1,64).translate([rx,cy,s-E]) 
    # card ridges
    x0=p['entry']-p['ridge_lead']-p['ridge_catch']+0.1
    for c in (p['card_cy']-(p['notch_r']+1+p['ridge_len']/2), p['card_cy']+(p['notch_r']+1+p['ridge_len']/2)):
        tri=CrossSection([[(x0,s-E),(x0+p['ridge_lead']+p['ridge_catch'],s-E),(x0+p['ridge_lead'],s+p['ridge_h'])]])
        pr=Manifold.extrude(tri,p['ridge_len']).rotate([90,0,0]).translate([0,c+p['ridge_len']/2,0])
        body=body+pr
    # thumb notch and lanyard slot
    body=body-Manifold.cylinder(20,p['notch_r'],p['notch_r'],128).translate([0,p['card_cy'],-5])
    body=body-box(W/2-p['slot_w']/2,H-p['top_band']/2-p['slot_h']/2,-1,W/2+p['slot_w']/2,H-p['top_band']/2+p['slot_h']/2,10)
    return body
if __name__=='__main__':
    import trimesh
    from load3mf import load
    ref=load('gen1_fusion_cardt2.00.3mf')['3:Body1']
    b=build(P(2.0)); mm=b.to_mesh()
    t=trimesh.Trimesh(mm.vert_properties[:,:3],mm.tri_verts)
    print('built vol',round(b.volume(),2),'ref',round(ref.volume,2),'bbox',np.round(t.bounds,3).tolist())
    R=Manifold(__import__('manifold3d').Mesh(vert_properties=np.asarray(ref.vertices,np.float32),tri_verts=np.asarray(ref.faces,np.uint32)))
    print('ref manifold ok',R.status())
    print('built-ref',round((b-R).volume(),3),'ref-built',round((R-b).volume(),3))
    t.export('built_cardt2.stl')
