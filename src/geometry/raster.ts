// Raster (PNG/JPEG) → contours. Pure functions; no DOM.
// "Ink" field = alpha × (1 − luminance) (or × luminance when inverted); the logo is
// the region where ink > threshold. Contours are traced with marching squares on
// pixel centres, linearly interpolated → sub-pixel accurate, then simplified.
import type { Pt } from './svg';

export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export function inkField(img: RGBAImage, invert: boolean): Float32Array {
  const { width: W, height: H, data } = img;
  const f = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255, a = data[i * 4 + 3] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    f[i] = a * (invert ? lum : 1 - lum);
  }
  return f;
}

/** Otsu threshold on a [0,1] field; returns a value in (0,1). */
export function otsu(f: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < f.length; i++) hist[Math.min(255, Math.max(0, Math.round(f[i] * 255)))]++;
  const total = f.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestT = 127, bestT2 = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best * (1 + 1e-9)) { best = between; bestT = bestT2 = t; }
    else if (between >= best * (1 - 1e-9)) bestT2 = t;
  }
  // plateau (e.g. a pure two-level image): take its middle
  return Math.min(0.98, Math.max(0.02, ((bestT + bestT2) / 2 + 0.5) / 255));
}

export function gaussianBlur(f: Float32Array, W: number, H: number, sigma: number): Float32Array {
  if (sigma <= 0) return f;
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let ks = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); ks += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] * f[y * W + Math.min(W - 1, Math.max(0, x + i))];
    tmp[y * W + x] = s;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x];
    out[y * W + x] = s;
  }
  return out;
}

/**
 * Marching squares. Returns closed contours (pixel units, y down, pixel centres at
 * integer + 0.5). Contours never cross, so EvenOdd filling gives the right holes.
 */
export function traceContours(f: Float32Array, W: number, H: number, t: number): Pt[][] {
  // Pad by one background pixel so every contour closes.
  const PW = W + 2, PH = H + 2;
  const v = (x: number, y: number) => (x <= 0 || y <= 0 || x > W || y > H ? 0 : f[(y - 1) * W + (x - 1)]);
  // Edge ids: horizontal edge from (x,y)→(x+1,y): 2*(y*PW+x); vertical (x,y)→(x,y+1): +1
  const hE = (x: number, y: number) => 2 * (y * PW + x);
  const vE = (x: number, y: number) => 2 * (y * PW + x) + 1;
  const pt = new Map<number, Pt>();
  const edgePt = (id: number): Pt => {
    let p = pt.get(id);
    if (p) return p;
    const cell = id >> 1, x = cell % PW, y = (cell - x) / PW;
    const a = v(x, y);
    const b = id & 1 ? v(x, y + 1) : v(x + 1, y);
    let s = (t - a) / (b - a);
    if (!Number.isFinite(s)) s = 0.5;
    s = Math.min(1, Math.max(0, s));
    // padded grid index (x,y) is pixel (x-1,y-1) whose centre is (x-0.5, y-0.5)
    p = id & 1 ? [x - 0.5, y - 0.5 + s] : [x - 0.5 + s, y - 0.5];
    pt.set(id, p);
    return p;
  };
  const next = new Map<number, number>();
  const seg = (a: number, b: number) => next.set(a, b);

  for (let y = 0; y < PH - 1; y++) {
    for (let x = 0; x < PW - 1; x++) {
      const tl = v(x, y) > t, tr = v(x + 1, y) > t, br = v(x + 1, y + 1) > t, bl = v(x, y + 1) > t;
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = hE(x, y), B = hE(x, y + 1), L = vE(x, y), R = vE(x + 1, y);
      // Segments oriented with ink on the right-hand side (y-down coordinates).
      switch (c) {
        case 1: seg(L, B); break;
        case 2: seg(B, R); break;
        case 3: seg(L, R); break;
        case 4: seg(R, T); break;
        case 6: seg(B, T); break;
        case 7: seg(L, T); break;
        case 8: seg(T, L); break;
        case 9: seg(T, B); break;
        case 11: seg(T, R); break;
        case 12: seg(R, L); break;
        case 13: seg(R, B); break;
        case 14: seg(B, L); break;
        case 5: case 10: {
          const centre = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 > t;
          if (c === 5) { // tr + bl ink
            if (centre) { seg(L, T); seg(R, B); } else { seg(L, B); seg(R, T); }
          } else { // tl + br ink
            if (centre) { seg(T, R); seg(B, L); } else { seg(T, L); seg(B, R); }
          }
          break;
        }
      }
    }
  }

  const out: Pt[][] = [];
  for (const start of [...next.keys()]) {
    if (!next.has(start)) continue;
    const ring: Pt[] = [];
    let cur = start;
    let guard = 0;
    while (next.has(cur) && guard++ < 10_000_000) {
      ring.push(edgePt(cur));
      const n = next.get(cur)!;
      next.delete(cur);
      cur = n;
      if (cur === start) break;
    }
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/** Ramer–Douglas–Peucker on a closed ring. */
export function simplifyRing(ring: Pt[], eps: number): Pt[] {
  if (ring.length < 8 || eps <= 0) return ring;
  // split at the two farthest-apart points (approx: index 0 and farthest from it)
  let far = 0, fd = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  const rdp = (pts: Pt[]): Pt[] => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack: [number, number][] = [[0, pts.length - 1]];
    const e2 = eps * eps;
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let mi = -1, md = e2;
      for (let i = a + 1; i < b; i++) {
        const px = pts[i][0] - ax, py = pts[i][1] - ay;
        const d = L2 > 0 ? (px * dy - py * dx) ** 2 / L2 : px * px + py * py;
        if (d > md) { md = d; mi = i; }
      }
      if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const a = rdp(ring.slice(0, far + 1));
  const b = rdp([...ring.slice(far), ring[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

export interface TraceResult { contours: Pt[][]; threshold: number; width: number; height: number }

export function traceImage(img: RGBAImage, opts: { threshold: number | null; invert: boolean; blur: number; simplifyPx: number }): TraceResult {
  let f = inkField(img, opts.invert);
  const threshold = opts.threshold ?? otsu(f);
  f = gaussianBlur(f, img.width, img.height, opts.blur);
  const contours = traceContours(f, img.width, img.height, threshold)
    .map(r => simplifyRing(r, opts.simplifyPx))
    .filter(r => r.length >= 3);
  return { contours, threshold, width: img.width, height: img.height };
}
