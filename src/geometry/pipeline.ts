// Full build: case → logo → inlay. Pure (no DOM); used by the worker and tests.
import type { ManifoldToplevel, Manifold, SimplePolygon } from 'manifold-3d';
import { Params, derive } from '../params';
import { Scope } from './scope';
import { buildCase } from './case';
import { buildLogo2D, inlay, IslandInfo, LogoInput, inputIsEmpty } from './logo';

export interface MeshOut { positions: Float32Array; indices: Uint32Array; volume: number; status: string }

export interface BuildResult {
  caseMesh: MeshOut;
  logoMesh: MeshOut | null;
  uninlaidVolume: number;
  bbox: { min: number[]; max: number[] };
  logo: {
    bbox: { min: [number, number]; max: [number, number] } | null;
    islands: number;
    rawArea: number;
    finalArea: number;
    removedArea: number;
    clippedArea: number;
    droppedIslands: IslandInfo[];
    removed: SimplePolygon[];
    clipped: SimplePolygon[];
    allowed: SimplePolygon[];
  } | null;
  warnings: string[];
  ms: number;
}

export function toMeshOut(m: Manifold): MeshOut {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const n = mesh.vertProperties.length / np;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts), volume: m.volume(), status: m.status() };
}

export function runBuild(w: ManifoldToplevel, p: Params, input: LogoInput | null): BuildResult {
  const t0 = performance.now();
  const s = new Scope();
  const warnings: string[] = [];
  try {
    const d = derive(p);
    const raw = s.k(buildCase(w, p, s));
    const uninlaidVolume = raw.volume();
    let caseSolid: Manifold = raw;
    let logoSolid: Manifold | null = null;
    let logoInfo: BuildResult['logo'] = null;

    if (input && !inputIsEmpty(input)) {
      const l = buildLogo2D(w, input, p, s);
      warnings.push(...l.warnings);
      if (l.logo) s.k(l.logo);
      const r = inlay(raw, l.logo, p.inlay_depth, s);
      caseSolid = s.k(r.caseSolid);
      logoSolid = r.logoSolid ? s.k(r.logoSolid) : null;
      logoInfo = {
        bbox: l.bbox, islands: l.islands, rawArea: l.rawArea, finalArea: l.finalArea,
        removedArea: l.removedArea, clippedArea: l.clippedArea, droppedIslands: l.droppedIslands,
        removed: l.removed, clipped: l.clipped, allowed: l.allowed,
      };
      const ratio = p.inlay_depth / p.layer_height;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
        warnings.push(`Inlay depth ${p.inlay_depth} mm is not a multiple of the ${p.layer_height} mm layer height`);
      }
      if (p.inlay_depth >= p.skin) warnings.push(`Inlay depth ≥ skin (${p.skin} mm): logo cuts through the bottom skin`);
    }

    // sanity: flush inlay must conserve volume
    const caseMesh = toMeshOut(caseSolid);
    const logoMesh = logoSolid ? toMeshOut(logoSolid) : null;
    if (caseMesh.status !== 'NoError') warnings.push(`Case mesh status: ${caseMesh.status}`);
    if (logoMesh && logoMesh.status !== 'NoError') warnings.push(`Logo mesh status: ${logoMesh.status}`);
    const bb = caseSolid.boundingBox();
    void d;
    return {
      caseMesh, logoMesh, uninlaidVolume,
      bbox: { min: [...bb.min], max: [...bb.max] },
      logo: logoInfo, warnings, ms: performance.now() - t0,
    };
  } finally {
    s.dispose();
  }
}
