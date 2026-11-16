// Edge treatments built from stacked thin slabs (manifold has no fillet op).
// Slabs are ≤ 0.1 mm (half a 0.2 layer), well below any print layer, so slicers see a smooth profile.
import type { ManifoldToplevel, Manifold, CrossSection } from 'manifold-3d';
import { Scope } from './scope';

const SLAB = 0.1;

/** Inset of a convex-edge fillet of radius r at depth h from the face (h ∈ [0, r]). */
export function filletInset(r: number, h: number): number {
  const a = r - Math.min(Math.max(h, 0), r);
  return r - Math.sqrt(Math.max(0, r * r - a * a));
}

function slabs(n: number, from: number, to: number): { z0: number; z1: number; mid: number }[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    const z0 = from + ((to - from) * i) / n, z1 = from + ((to - from) * (i + 1)) / n;
    out.push({ z0, z1, mid: (z0 + z1) / 2 });
  }
  return out;
}

/**
 * Round every edge of the top face of `body` inside `region` (a plan-view mask),
 * where that region's top is at `zTop`. Each slab = the body's own cross-section,
 * eroded by the fillet inset, so convex edges in plan and holes are handled alike.
 */
export function filletTop(w: ManifoldToplevel, s: Scope, body: Manifold, region: CrossSection, zTop: number, r: number): Manifold {
  if (r <= 0) return body;
  const n = Math.max(2, Math.ceil(r / SLAB));
  const z0 = zTop - r;
  const parts: Manifold[] = [];
  for (const sl of slabs(n, z0, zTop)) {
    const sec = s.k(body.slice(sl.mid));
    const er = s.k(sec.offset(-filletInset(r, zTop - sl.mid), 'Round', 2, 24));
    const m = s.k(er.intersect(region));
    if (m.isEmpty()) continue;
    parts.push(s.k(s.k(m.extrude(sl.z1 - sl.z0)).translate([0, 0, sl.z0])));
  }
  const cut = s.k(s.k(region.extrude(zTop - z0 + 50)).translate([0, 0, z0]));
  const rest = s.k(body.subtract(cut));
  return s.k(w.Manifold.union([rest, ...parts]));
}

/** 45° chamfer of size c on every edge of the bed face (z = 0). */
export function chamferBottom(w: ManifoldToplevel, s: Scope, body: Manifold, c: number): Manifold {
  if (c <= 0) return body;
  const n = Math.max(2, Math.ceil(c / SLAB));
  const parts: Manifold[] = [];
  const bb = body.boundingBox();
  for (const sl of slabs(n, 0, c)) {
    const sec = s.k(body.slice(sl.mid));
    const er = s.k(sec.offset(-(c - sl.mid), 'Miter', 2));
    if (er.isEmpty()) continue;
    parts.push(s.k(s.k(er.extrude(sl.z1 - sl.z0)).translate([0, 0, sl.z0])));
  }
  const cut = s.k(s.k(w.Manifold.cube([bb.max[0] - bb.min[0] + 2, bb.max[1] - bb.min[1] + 2, c + 1])).translate([bb.min[0] - 1, bb.min[1] - 1, -1]));
  const rest = s.k(body.subtract(cut));
  return s.k(w.Manifold.union([rest, ...parts]));
}

/**
 * Rounded flare for a pocket mouth on an x-facing face at x = xFace.
 * dir = +1: pocket runs toward −x from the face (mouth on the +x side); −1: the reverse.
 * The pocket's y/z extent [y0,y1]×[z0,z1] is grown by the fillet inset as it nears the face.
 * Only the flagged sides are flared.
 */
export function mouthFlare(
  w: ManifoldToplevel, s: Scope, xFace: number, dir: 1 | -1, r: number,
  y0: number, y1: number, z0: number, z1: number,
  sides: { y0?: boolean; y1?: boolean; z0?: boolean; z1?: boolean },
): Manifold | null {
  if (r <= 0) return null;
  const n = Math.max(2, Math.ceil(r / SLAB));
  const boxes: Manifold[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = (r * i) / n, t1 = (r * (i + 1)) / n; // depth into the pocket from the face
    const g = filletInset(r, (t0 + t1) / 2);
    const ya = y0 - (sides.y0 ? g : 0), yb = y1 + (sides.y1 ? g : 0);
    const za = z0 - (sides.z0 ? g : 0), zb = z1 + (sides.z1 ? g : 0);
    const xa = dir === 1 ? xFace - t1 : xFace + t0 - (i === 0 ? 1 : 0);
    const xb = dir === 1 ? xFace - t0 + (i === 0 ? 1 : 0) : xFace + t1;
    boxes.push(s.k(s.k(w.Manifold.cube([xb - xa, yb - ya, zb - za])).translate([xa, ya, za])));
  }
  return s.k(w.Manifold.union(boxes));
}
