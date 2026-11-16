import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { getWasm, read3mf, toManifold } from './util';
import { parseSvg } from '../src/geometry/svg';
import { runBuild } from '../src/geometry/pipeline';
import { DEFAULTS, LEGACY_RETENTION, SHARP_EDGES } from '../src/params';
import { Scope } from '../src/geometry/scope';
import { build3MF } from '../src/export/threemf';

const svg = parseSvg(readFileSync('fixtures/Milwaukee_Logo.svg', 'utf8'));

describe('Milwaukee inlay (acceptance 2–4)', async () => {
  const w = await getWasm();
  const p = { ...DEFAULTS, ...LEGACY_RETENTION, ...SHARP_EDGES, card_t: 2.76 };
  const r = runBuild(w, p, { kind: 'svg', shapes: svg.shapes });

  it('meshes are manifold', () => {
    expect(r.caseMesh.status).toBe('NoError');
    expect(r.logoMesh!.status).toBe('NoError');
  });

  it('logo bbox ≈ 33.5 × 75 at z 0 → 0.4, ® removed', () => {
    const b = r.logo!.bbox!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(33.5, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo(75, 1);
    const z = r.logoMesh!.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...z)).toBeCloseTo(0, 5);
    expect(Math.max(...z)).toBeCloseTo(0.4, 5);
    expect(r.logo!.droppedIslands.length).toBe(2); // ® ring + R
    expect(r.logo!.islands).toBe(5);
  });

  it('flush inlay conserves volume', () => {
    expect(Math.abs(r.caseMesh.volume + r.logoMesh!.volume - r.uninlaidVolume)).toBeLessThan(1e-3);
  });

  it('case ∪ logo matches Fusion; logo matches Fusion logo', () => {
    const s = new Scope();
    const mk = (m: { positions: Float32Array; indices: Uint32Array }) =>
      s.k(toManifold(w, { name: '', id: '', verts: m.positions, tris: m.indices }));
    const C = mk(r.caseMesh), L = mk(r.logoMesh!);
    const U = s.k(C.add(L));
    const refs = read3mf('reference/milwaukee_fusion_cardt2.76.3mf').map(m => s.k(toManifold(w, m)));
    const RU = s.k(w.Manifold.union(refs));
    const RL = s.k(w.Manifold.union(refs.slice(1)));
    const xor = (a: any, b: any) => s.k(a.subtract(b)).volume() + s.k(b.subtract(a)).volume();
    const xu = xor(U, RU), xl = xor(L, RL);
    console.log('union xor', xu, 'logo xor', xl, 'logo vol', L.volume(), RL.volume());
    expect(xu).toBeLessThan(3);
    expect(xl).toBeLessThan(6);
    // letter counters stay case-colored: logo solids have through-holes
    const holes = L.genus() + L.decompose().length - 1;
    expect(holes).toBeGreaterThanOrEqual(3);
    s.dispose();
  });

  it('3MF: one build item, assembly of Case + Logo', () => {
    const z = build3MF([
      { name: 'Case', positions: r.caseMesh.positions, indices: r.caseMesh.indices, color: p.case_color, extruder: 1 },
      { name: 'Logo', positions: r.logoMesh!.positions, indices: r.logoMesh!.indices, color: p.logo_color, extruder: 2 },
    ]);
    const files = unzipSync(z);
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(model.match(/<item /g)!.length).toBe(1);
    expect(model.match(/<component /g)!.length).toBe(2);
    expect(files['Metadata/model_settings.config']).toBeTruthy();
    const meshes = read3mf(z);
    expect(meshes.map(m => m.name)).toEqual(['Case', 'Logo']);
    const s = new Scope();
    for (const m of meshes) expect(s.k(toManifold(w, m)).status()).toBe('NoError');
    s.dispose();
  });
});

describe('no logo', async () => {
  it('builds plain case', async () => {
    const w = await getWasm();
    const r = runBuild(w, { ...DEFAULTS, ...LEGACY_RETENTION, ...SHARP_EDGES, card_t: 2.0 }, null);
    expect(r.logoMesh).toBeNull();
    expect(r.bbox.max[2]).toBeCloseTo(5.8, 4);
  });
});
