import zipfile,re,numpy as np,trimesh,sys
def load(p):
    s=zipfile.ZipFile(p).read('3D/3dmodel.model').decode()
    out={}
    for m in re.finditer(r'<object id="(\d+)" name="([^"]*)".*?</object>',s,re.S):
        o=m.group(0)
        v=np.array(re.findall(r'<vertex x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"',o),float)
        f=np.array(re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"',o),int)
        out[m.group(1)+":"+m.group(2)]=trimesh.Trimesh(v,f,process=True)
    return out
if __name__=="__main__":
    for k,mm in load(sys.argv[1]).items():
        print(k,mm.is_watertight,round(mm.volume,2),mm.bounds.round(3).tolist(),len(mm.faces))
