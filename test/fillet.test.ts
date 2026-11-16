import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getWasm } from './util';
import { buildCase } from '../src/geometry/case';
import { runBuild } from '../src/geometry/pipeline';
import { parseSvg } from '../src/geometry/svg';
import { DEFAULT_CASE, DEFAULTS, SHARP_EDGES, derive } from '../src/params';
import { Scope } from '../src/geometry/scope';

describe('edge treatment', async () => {
  const w = await getWasm();
  const s = new Scope();
  const p = { ...DEFAULT_CASE };
  const d = derive(p);
  const c = s.k(buildCase(w, p, s));
  const sharp = s.k(buildCase(w, { ...p, ...SHARP_EDGES }, s));
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const b = s.k(s.k(w.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));
    return s.k(c.intersect(b)).volume() / b.volume();
  };
  it('is manifold and only removes a little material', () => {
    expect(c.status()).toBe('NoError');
    const lost = sharp.volume() - c.volume();
    expect(lost).toBeGreaterThan(5);
    expect(lost).toBeLessThan(150);
    expect(s.k(c.subtract(sharp)).volume()).toBeLessThan(0.3); // only slab stair rounding
  });
  it('top outer edge is rounded, bed edge chamfered', () => {
    const y = d.card_cy + 30, x = d.body_w;
    expect(solid(x - 0.1, y, d.T_card - 0.1, x, y + 1, d.T_card)).toBeLessThan(0.01); // corner gone
    expect(solid(x - 0.1, y, 0, x, y + 1, 0.1)).toBeLessThan(0.01);
    expect(solid(x - 1.5, y, d.T_card - 1.5, x - 1, y + 1, d.T_card - 0.1)).toBeGreaterThan(0.99); // body intact inside
  });
  it('bbox unchanged', () => {
    const a = c.boundingBox(), b = sharp.boundingBox();
    for (let i = 0; i < 3; i++) { expect(a.min[i]).toBeCloseTo(b.min[i], 3); expect(a.max[i]).toBeCloseTo(b.max[i], 3); }
  });
  it('logo inlay still flush and manifold', () => {
    const svg = parseSvg(readFileSync('fixtures/Milwaukee_Logo.svg', 'utf8'));
    const r = runBuild(w, DEFAULTS, { kind: 'svg', shapes: svg.shapes });
    expect(r.caseMesh.status).toBe('NoError');
    expect(r.logoMesh!.status).toBe('NoError');
    expect(Math.abs(r.caseMesh.volume + r.logoMesh!.volume - r.uninlaidVolume)).toBeLessThan(1e-3);
    console.log('build ms', r.ms.toFixed(0));
  });
});
