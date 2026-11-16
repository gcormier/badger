// Logo: SVG shapes → placed, cleaned, clipped 2D region → inlaid solids.
import type { ManifoldToplevel, CrossSection, Manifold, SimplePolygon } from 'manifold-3d';
import { Params, derive } from '../params';
import { Scope } from './scope';
import { SvgShape, Pt, flattenPath, controlBounds } from './svg';
import { logoAllowedRegion } from './case';

export const FLATTEN_TOL_MM = 0.02;

/** Logo source in its own y-down coordinates (SVG user units or image pixels). */
export type LogoInput =
  | { kind: 'svg'; shapes: SvgShape[] }
  | { kind: 'raster'; contours: Pt[][]; width: number; height: number };

export function inputIsEmpty(i: LogoInput | null): boolean {
  return !i || (i.kind === 'svg' ? i.shapes.length === 0 : i.contours.length === 0);
}

export interface IslandInfo { area: number; cx: number; cy: number }

export interface Logo2DResult {
  /** final logo region in part coordinates (z = 0 plane), NOT tracked */
  logo: CrossSection | null;
  /** areas removed by the min-feature/island filter, in part coordinates */
  removed: SimplePolygon[];
  /** areas clipped by the keep-out */
  clipped: SimplePolygon[];
  allowed: SimplePolygon[];
  droppedIslands: IslandInfo[];
  removedArea: number;
  clippedArea: number;
  rawArea: number;
  finalArea: number;
  bbox: { min: [number, number]; max: [number, number] } | null;
  islands: number;
  warnings: string[];
}

/**
 * Combine shapes in paint order: "ink" shapes are added, others knock out.
 * Ink = dark fill (luminance < 0.5), or light fill when `invert`.
 */
function combineShapes(w: ManifoldToplevel, s: Scope, shapes: SvgShape[], tolSrc: number, invert: boolean, warnings: string[]): CrossSection {
  const { CrossSection } = w;
  const build = (allInk: boolean) => {
    let acc = s.k(new CrossSection([[]], 'NonZero'));
    for (const sh of shapes) {
      const polys = flattenPath(sh.d, tolSrc);
      if (!polys.length) continue;
      const cs = s.k(new CrossSection(polys, sh.fillRule));
      const ink = allInk || ((sh.luminance < 0.5) !== invert);
      acc = s.k(ink ? acc.add(cs) : acc.subtract(cs));
    }
    return acc;
  };
  let acc = build(false);
  if (acc.isEmpty() && shapes.length) {
    warnings.push(`No ${invert ? 'light' : 'dark'} fills found; using every filled shape as the logo`);
    acc = build(true);
  }
  return acc;
}

export function buildLogo2D(w: ManifoldToplevel, input: LogoInput, p: Params, s: Scope): Logo2DResult {
  const warnings: string[] = [];
  const d = derive(p);
  const allowed = s.k(logoAllowedRegion(w, p, p.logo_margin, s));
  const empty: Logo2DResult = {
    logo: null, removed: [], clipped: [], allowed: allowed.toPolygons(), droppedIslands: [],
    removedArea: 0, clippedArea: 0, rawArea: 0, finalArea: 0, bbox: null, islands: 0, warnings,
  };
  let logo: CrossSection;
  if (input.kind === 'svg') {
    const cb = controlBounds(input.shapes);
    if (!cb) return empty;
    const srcLong = Math.max(cb.max[0] - cb.min[0], cb.max[1] - cb.min[1]);
    if (!(srcLong > 0)) return empty;
    const tolSrc = FLATTEN_TOL_MM * (srcLong / p.logo_length) * 0.5;
    logo = combineShapes(w, s, input.shapes, tolSrc, p.invert, warnings);
  } else {
    logo = s.k(new w.CrossSection(input.contours, 'EvenOdd'));
  }
  if (logo.isEmpty()) { warnings.push('Logo is empty'); return empty; }

  // SVG is y-down → flip to y-up so the artwork reads correctly.
  logo = s.k(logo.scale([1, -1]));
  // Scale to target length along the long axis of the actual filled geometry.
  let b = logo.bounds();
  const long = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
  logo = s.k(logo.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]));
  logo = s.k(logo.scale(p.logo_length / long));
  // Rotate (CCW, as seen from below), then mirror X: the bottom face is viewed from below.
  logo = s.k(logo.rotate(p.logo_rotation));
  logo = s.k(logo.mirror([1, 0]));
  logo = s.k(logo.translate([d.logo_cx + p.logo_offset_x, d.logo_cy + p.logo_offset_y]));
  const rawArea = logo.area();

  // Clean: morphological opening (erode then dilate by min_feature/2).
  let opened = logo;
  const h = p.min_feature / 2;
  if (h > 0) {
    const eroded = s.k(logo.offset(-h, 'Round', 2, 64));
    opened = s.k(s.k(eroded.offset(h, 'Round', 2, 64)).intersect(logo));
  }
  // Islands: 'strict' keeps the opened shape itself; 'keep_tips' keeps each original
  // island whole (sharp tips, thin serifs) as long as its thick core is big enough.
  const droppedIslands: IslandInfo[] = [];
  const kept: CrossSection[] = [];
  const candidates = p.thin_mode === 'strict' ? opened.decompose() : logo.decompose();
  for (const isl of candidates) {
    s.k(isl);
    const core = p.thin_mode === 'strict' ? isl : s.k(isl.intersect(opened));
    const a = core.area();
    if (a < p.min_island_area) {
      const bb = isl.bounds();
      droppedIslands.push({ area: isl.area(), cx: (bb.min[0] + bb.max[0]) / 2, cy: (bb.min[1] + bb.max[1]) / 2 });
    } else kept.push(isl);
  }
  const cleaned = s.k(kept.length ? w.CrossSection.union(kept) : new w.CrossSection([[]], 'NonZero'));
  const removed = s.k(logo.subtract(cleaned));
  const removedArea = removed.area();

  // Keep-out.
  const final = s.k(cleaned.intersect(allowed));
  const clipped = s.k(cleaned.subtract(final));
  const clippedArea = clipped.area();
  if (clippedArea > 0.01) warnings.push(`Logo crosses the keep-out region: ${clippedArea.toFixed(2)} mm² clipped`);
  if (droppedIslands.length) {
    warnings.push(`${droppedIslands.length} island(s) below ${p.min_island_area} mm² removed (` +
      droppedIslands.map(i => `${i.area.toFixed(2)} mm² @ ${i.cx.toFixed(1)},${i.cy.toFixed(1)}`).join('; ') + ')');
  }

  const finalIslands = final.decompose();
  finalIslands.forEach(i => s.k(i));
  const fb = final.isEmpty() ? null : final.bounds();
  return {
    logo: final.isEmpty() ? null : s.release(final),
    removed: removed.toPolygons(),
    clipped: clipped.toPolygons(),
    allowed: allowed.toPolygons(),
    droppedIslands,
    removedArea,
    clippedArea,
    rawArea,
    finalArea: final.area(),
    bbox: fb ? { min: [fb.min[0], fb.min[1]], max: [fb.max[0], fb.max[1]] } : null,
    islands: finalIslands.length,
    warnings,
  };
}

export interface InlayResult { caseSolid: Manifold; logoSolid: Manifold | null }

/** Flush inlay from the bed face: case − logo3d, logo = case ∩ logo3d. Results NOT tracked. */
export function inlay(caseSolid: Manifold, logo: CrossSection | null, depth: number, s: Scope): InlayResult {
  if (!logo || logo.isEmpty()) return { caseSolid, logoSolid: null };
  const l3 = s.k(logo.extrude(depth));
  const logoSolid = caseSolid.intersect(l3);
  const out = caseSolid.subtract(l3);
  return { caseSolid: out, logoSolid };
}
