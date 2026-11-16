import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import Module from 'manifold-3d';
import type { ManifoldToplevel, Manifold } from 'manifold-3d';

let wasm: ManifoldToplevel | null = null;
export async function getWasm(): Promise<ManifoldToplevel> {
  if (!wasm) { wasm = await Module(); wasm.setup(); }
  return wasm;
}

export interface RawMesh { name: string; id: string; verts: Float32Array; tris: Uint32Array }

export function read3mf(path: string | Uint8Array): RawMesh[] {
  const buf = typeof path === 'string' ? new Uint8Array(readFileSync(path)) : path;
  const files = unzipSync(buf);
  const s = strFromU8(files['3D/3dmodel.model']);
  const out: RawMesh[] = [];
  for (const m of s.matchAll(/<object id="(\d+)"[^>]*?name="([^"]*)"[^>]*>([\s\S]*?)<\/object>/g)) {
    const body = m[3];
    if (!body.includes('<mesh')) continue;
    const v = [...body.matchAll(/<vertex x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"/g)].flatMap(a => [+a[1], +a[2], +a[3]]);
    const t = [...body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].flatMap(a => [+a[1], +a[2], +a[3]]);
    out.push({ id: m[1], name: m[2], verts: new Float32Array(v), tris: new Uint32Array(t) });
  }
  return out;
}

export function toManifold(w: ManifoldToplevel, m: RawMesh): Manifold {
  const mesh = new w.Mesh({ numProp: 3, vertProperties: m.verts, triVerts: m.tris });
  mesh.merge();
  return new w.Manifold(mesh);
}
