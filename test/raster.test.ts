import { describe, it, expect } from 'vitest';
import { traceImage, otsu, inkField } from '../src/geometry/raster';
import { getWasm } from './util';
import { runBuild } from '../src/geometry/pipeline';
import { DEFAULTS } from '../src/params';

function ringImage(W: number, H: number): { width: number; height: number; data: Uint8ClampedArray } {
  // black ring (outer r 40, inner r 20) on white → one island with one hole
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2);
    const ink = r < 40 && r > 20;
    const i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = ink ? 0 : 255; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}

describe('raster trace', () => {
  it('traces a ring with a hole', async () => {
    const img = ringImage(100, 100);
    const t = otsu(inkField(img, false));
    expect(t).toBeGreaterThan(0.05); expect(t).toBeLessThan(0.95);
    const r = traceImage(img, { threshold: null, invert: false, blur: 0.7, simplifyPx: 0.2 });
    expect(r.contours.length).toBe(2);
    const w = await getWasm();
    const cs = new w.CrossSection(r.contours, 'EvenOdd');
    expect(cs.area()).toBeGreaterThan(Math.PI * (40 ** 2 - 20 ** 2) * 0.95);
    expect(cs.area()).toBeLessThan(Math.PI * (40 ** 2 - 20 ** 2) * 1.05);
    const b = runBuild(w, { ...DEFAULTS, logo_length: 30 }, { kind: 'raster', contours: r.contours, width: 100, height: 100 });
    expect(b.logoMesh!.status).toBe('NoError');
    expect(b.logo!.islands).toBe(1);
    const bb = b.logo!.bbox!;
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(30, 0);
  });
  it('invert traces the background', () => {
    const r = traceImage(ringImage(100, 100), { threshold: null, invert: true, blur: 0, simplifyPx: 0.2 });
    expect(r.contours.length).toBe(3); // frame outer + ring outer hole + inner disc
  });
});
