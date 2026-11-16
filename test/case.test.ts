import { describe, it, expect } from 'vitest';
import { getWasm, read3mf, toManifold } from './util';
import { buildCase } from '../src/geometry/case';
import { DEFAULT_CASE, LEGACY_RETENTION, SHARP_EDGES, derive, CaseParams } from '../src/params';

const LEG: CaseParams = { ...DEFAULT_CASE, ...LEGACY_RETENTION, ...SHARP_EDGES };
import { Scope } from '../src/geometry/scope';

describe('case', () => {
  it('matches Fusion gen1 at card_t=2.00 (acceptance 1)', async () => {
    const w = await getWasm();
    const s = new Scope();
    const c = s.k(buildCase(w, { ...LEG, card_t: 2.0 }, s));
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
    const a = s.k(buildCase(w, { ...LEG, card_t: 2.0 }, s));
    const b = s.k(buildCase(w, { ...LEG, card_t: 2.76 }, s));
    const da = derive({ ...LEG, card_t: 2.0 }), db = derive({ ...LEG, card_t: 2.76 });
    expect(da.body_w).toBeCloseTo(db.body_w, 9); expect(da.body_h).toBeCloseTo(db.body_h, 9);
    // key section identical below the card window undercut region
    const keyBox = s.k(s.k(w.Manifold.cube([62, da.key_sec - 3, 10])).translate([-0.5, -0.5, -1]));
    const ka = s.k(a.intersect(keyBox)), kb = s.k(b.intersect(keyBox));
    expect(Math.abs(s.k(ka.subtract(kb)).volume()) + s.k(kb.subtract(ka)).volume()).toBeLessThan(1e-3);
    expect(b.boundingBox().max[2]).toBeCloseTo(5.8, 3);
    s.dispose();
  });

  describe('partial dovetail + auto ridges', async () => {
    const w = await getWasm();
    const p: CaseParams = { ...DEFAULT_CASE, card_mode: 'count', card_count: 4, card_unit: 0.8 };
    const d = derive(p);
    const s = new Scope();
    const c = s.k(buildCase(w, p, s));
    const solidFrac = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const b = s.k(s.k(w.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));
      return s.k(c.intersect(b)).volume() / b.volume();
    };
    const edgeX = d.body_w - p.side; // +x pocket wall = card edge + clearance
    const ym = d.card_cy + 20, xm = d.entry + p.relief_len + 15;

    it('count mode sets the stack', () => {
      expect(d.card_t).toBeCloseTo(3.2, 9);
      expect(c.status()).toBe('NoError');
      expect(c.boundingBox().max[2]).toBeCloseTo(Math.max(d.T_card, d.T_key), 4);
    });
    it('pocket walls are vertical and tight up to the front card face', () => {
      expect(d.dove_o).toBeCloseTo(0, 9);
      for (const z of [p.skin + 0.1, (p.skin + d.z_front) / 2, d.z_front - 0.05]) {
        expect(solidFrac(edgeX - 0.05, ym, z, edgeX - 0.01, ym + 1, z + 0.02)).toBeLessThan(1e-6); // card fits
        expect(solidFrac(edgeX + 0.01, ym, z, edgeX + 0.05, ym + 1, z + 0.02)).toBeGreaterThan(0.999); // no slop
        // ±y walls too
        expect(solidFrac(xm, d.key_sec - 0.05, z, xm + 1, d.key_sec - 0.01, z + 0.02)).toBeGreaterThan(0.999);
        expect(solidFrac(xm, d.key_sec + 0.01, z, xm + 1, d.key_sec + 0.05, z + 0.02)).toBeLessThan(1e-6);
      }
    });
    it('45° lip overhangs the front card above it', () => {
      const zt = d.T_card - p.fillet_r - 0.05; // below the top fillet
      const over = zt - d.z_front - 0.05; // lip reach at that height
      expect(solidFrac(edgeX - over + 0.02, ym, zt - 0.02, edgeX - 0.02, ym + 1, zt)).toBeGreaterThan(0.999);
      expect(solidFrac(xm, d.key_sec + 0.02, zt - 0.02, xm + 1, d.key_sec + over - 0.02, zt)).toBeGreaterThan(0.999);
    });
    it('lips are removed in the entry relief zone', () => {
      const zt = d.T_card - 0.05, xr = d.entry + p.relief_len / 2;
      expect(solidFrac(xr, d.key_sec + 0.02, zt - 0.02, xr + 1, d.key_sec + 1, zt)).toBeLessThan(1e-6);
    });
    it('ridges catch the front card by ridge_engage', () => {
      const frontBottom = d.z_front - p.card_unit;
      expect(p.skin + d.ridge_h - frontBottom).toBeCloseTo(p.ridge_engage, 9);
      const yr = d.card_cy + p.notch_r + 1 + p.ridge_len / 2;
      const xTop = d.entry - p.ridge_gap - d.ridge_catch; // ridge apex x
      expect(solidFrac(xTop - 0.05, yr, frontBottom + 0.05, xTop + 0.0, yr + 1, frontBottom + p.ridge_engage - 0.1)).toBeGreaterThan(0.9);
      // seated cards clear the ridge
      expect(solidFrac(d.entry - p.ridge_gap + 0.01, yr, p.skin + 0.01, d.entry + 2, yr + 1, d.z_front)).toBeLessThan(1e-6);
    });
  });
});
