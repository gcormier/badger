import { describe, it, expect } from 'vitest';
import { getWasm, read3mf, toManifold } from './util';
import { buildCase } from '../src/geometry/case';
import { DEFAULT_CASE, derive } from '../src/params';
import { Scope } from '../src/geometry/scope';

describe('case', () => {
  it('matches Fusion gen1 at card_t=2.00 (acceptance 1)', async () => {
    const w = await getWasm();
    const s = new Scope();
    const c = s.k(buildCase(w, { ...DEFAULT_CASE, card_t: 2.0 }, s));
    expect(c.status()).toBe('NoError');
    const bb = c.boundingBox();
    expect(bb.min[0]).toBeCloseTo(0, 3); expect(bb.min[1]).toBeCloseTo(0, 3); expect(bb.min[2]).toBeCloseTo(0, 3);
    expect(bb.max[0]).toBeCloseTo(61.213, 2); expect(bb.max[1]).toBeCloseTo(120.6, 3); expect(bb.max[2]).toBeCloseTo(5.8, 3);
    const ref = read3mf('reference/gen1_fusion_cardt2.00.3mf').find(m => m.id === '3')!;
    const R = s.k(toManifold(w, ref));
    expect(R.status()).toBe('NoError');
    const xor = s.k(c.subtract(R)).volume() + s.k(R.subtract(c)).volume();
    console.log('case vol', c.volume(), 'ref', R.volume(), 'xor', xor);
    expect(xor).toBeLessThan(3);
    s.dispose();
  });

  it('card_t only changes card section thickness/pocket (acceptance 5)', async () => {
    const w = await getWasm();
    const s = new Scope();
    const a = s.k(buildCase(w, { ...DEFAULT_CASE, card_t: 2.0 }, s));
    const b = s.k(buildCase(w, { ...DEFAULT_CASE, card_t: 2.76 }, s));
    const da = derive({ ...DEFAULT_CASE, card_t: 2.0 }), db = derive({ ...DEFAULT_CASE, card_t: 2.76 });
    expect(da.body_w).toBeCloseTo(db.body_w, 9); expect(da.body_h).toBeCloseTo(db.body_h, 9);
    // key section identical below the card window undercut region
    const keyBox = s.k(s.k(w.Manifold.cube([62, da.key_sec - 3, 10])).translate([-0.5, -0.5, -1]));
    const ka = s.k(a.intersect(keyBox)), kb = s.k(b.intersect(keyBox));
    expect(Math.abs(s.k(ka.subtract(kb)).volume()) + s.k(kb.subtract(ka)).volume()).toBeLessThan(1e-3);
    expect(b.boundingBox().max[2]).toBeCloseTo(5.8, 3);
    s.dispose();
  });
});
