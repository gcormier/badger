// Case CSG — direct port of reference/build_reference.py (verified against Fusion).
import type { ManifoldToplevel, Manifold, CrossSection } from 'manifold-3d';
import { CaseParams, Derived, derive } from '../params';
import { Scope } from './scope';
import { filletTop, chamferBottom, mouthFlare } from './edges';

const E = 0.01;
const T30 = Math.tan(Math.PI / 6);

export function roundedRect(w: ManifoldToplevel, s: Scope, W: number, H: number, r: number): CrossSection {
  const { CrossSection } = w;
  if (r <= 0) return s.k(CrossSection.square([W, H]));
  const sq = s.k(CrossSection.square([W - 2 * r, H - 2 * r]));
  const t = s.k(sq.translate([r, r]));
  return s.k(t.offset(r, 'Round', 2, 128));
}

function box(w: ManifoldToplevel, s: Scope, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Manifold {
  return s.k(s.k(w.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));
}

function rect2(w: ManifoldToplevel, s: Scope, x0: number, y0: number, x1: number, y1: number): CrossSection {
  return s.k(s.k(w.CrossSection.square([x1 - x0, y1 - y0])).translate([x0, y0]));
}

/** Builds the un-inlaid case. Returned Manifold is NOT tracked by `s`. */
export function buildCase(w: ManifoldToplevel, p: CaseParams, s: Scope): Manifold {
  const { Manifold, CrossSection } = w;
  const d = derive(p);
  const W = d.body_w, H = d.body_h, sk = p.skin;

  const outline = roundedRect(w, s, W, H, p.corner_r);
  let body = s.k(outline.extrude(d.T_card));
  const keyreg = s.k(outline.intersect(rect2(w, s, 0, 0, W, d.key_sec)));
  body = s.k(body.add(s.k(keyreg.extrude(d.T_key))));

  // Card pocket: vertical walls (card size + clearance, pushed out by dove_o) up to
  // dove_z, then a 45° dovetail lip to the top: edges move inward by (z − dove_z).
  // With dove_h ≥ full height this is the original full-height dovetail.
  const o = d.dove_o, zs = d.dove_z;
  const rectAt = (z: number, off: number): [number, number, number][] => {
    const x1 = W - p.side + off, y0 = d.key_sec - off, y1 = d.key_sec + d.card_ph + off;
    return [[-5, y0, z], [x1, y0, z], [x1, y1, z], [-5, y1, z]];
  };
  if (zs > sk + 1e-6) body = s.k(body.subtract(box(w, s, -5, d.key_sec - o, sk, W - p.side + o, d.key_sec + d.card_ph + o, zs + E)));
  const zt = d.T_card + E;
  const dove = s.k(Manifold.hull([...rectAt(zs, o), ...rectAt(zt, o - (zt - zs))]));
  body = s.k(body.subtract(dove));
  // Lip relief near the entry: no lips here, so a whole stack can bow up over the ridges.
  if (p.relief_len > 0) {
    body = s.k(body.subtract(box(w, s, -5, d.key_sec - o, sk, d.entry + p.relief_len, d.key_sec + d.card_ph + o, d.T_card + 1)));
  }

  // Key pocket, open at the +x end.
  const x0k = W - d.key_pl, y0k = p.side, y1k = p.side + d.key_ph;
  body = s.k(body.subtract(box(w, s, x0k, y0k, sk, W + 1, y1k, sk + d.key_gap)));
  // Key-end window in the top skin.
  body = s.k(body.subtract(box(w, s, W - p.key_win, y0k, sk + d.key_gap - E, W + 1, y1k, d.T_key + 1)));
  // Pinch windows through both skins.
  const gc = W - p.key_clr - p.grip_off;
  if (p.grip_l > 0) body = s.k(body.subtract(box(w, s, gc - p.grip_l / 2, y0k, -1, gc + p.grip_l / 2, y1k, d.T_key + 1)));

  // Flexure U-slot in the bottom skin.
  const slot = flexureSlot(w, s, p, d);
  body = s.k(body.subtract(s.k(s.k(slot.extrude(sk + 2 * E)).translate([0, 0, -E]))));

  // Detent bump (frustum).
  const r0 = p.bump_d / 2;
  const r1 = r0 - p.bump_h * T30;
  if (p.bump_h > 0) {
    const bump = s.k(s.k(Manifold.cylinder(p.bump_h, r0, r1, 64)).translate([d.ring_x, d.key_cy, sk - E]));
    body = s.k(body.add(bump));
  }

  // Card detent ridges (triangular prisms). CCW winding matters.
  const x0 = d.entry - d.ridge_lead - d.ridge_catch - p.ridge_gap;
  for (const c of ridgeCentres(p, d)) {
    const tri = s.k(new CrossSection([[
      [x0, sk - E], [x0 + d.ridge_lead + d.ridge_catch, sk - E], [x0 + d.ridge_lead, sk + d.ridge_h],
    ]]));
    const pr = s.k(s.k(s.k(tri.extrude(p.ridge_len)).rotate([90, 0, 0])).translate([0, c + p.ridge_len / 2, 0]));
    body = s.k(body.add(pr));
  }

  // Thumb notch and lanyard slot.
  body = s.k(body.subtract(s.k(s.k(Manifold.cylinder(20, p.notch_r, p.notch_r, 128)).translate([0, d.card_cy, -5]))));
  body = s.k(body.subtract(lanyardBox(w, s, p, d)));

  // ---- edge treatment ----
  // Pocket mouths: rounded lead-ins (card enters at x = 0, key at x = W).
  const cardMouth = mouthFlare(w, s, 0, -1, p.mouth_r, d.key_sec - o, d.key_sec + d.card_ph + o, sk, d.T_card + 1, { y0: true, y1: true, z0: true });
  if (cardMouth) body = s.k(body.subtract(cardMouth));
  const keyMouth = mouthFlare(w, s, W, 1, p.mouth_r, y0k, y1k, sk, sk + d.key_gap, { y0: true, y1: true, z0: true, z1: true });
  if (keyMouth) body = s.k(body.subtract(keyMouth));
  // Top-face fillets, per section (they can have different heights).
  if (p.fillet_r > 0) {
    const r = Math.min(p.fillet_r, sk);
    const keyRegion = rect2(w, s, -10, -10, W + 10, d.key_sec);
    const cardRegion = rect2(w, s, -10, d.key_sec, W + 10, H + 10);
    body = filletTop(w, s, body, keyRegion, d.T_key, r);
    body = filletTop(w, s, body, cardRegion, d.T_card, r);
  }
  body = chamferBottom(w, s, body, Math.min(p.bed_chamfer, sk / 2));

  return s.release(body);
}

export function ridgeCentres(p: CaseParams, d: Derived): number[] {
  const o = p.notch_r + 1 + p.ridge_len / 2;
  return [d.card_cy - o, d.card_cy + o];
}

function flexureSlot(w: ManifoldToplevel, s: Scope, p: CaseParams, d: Derived): CrossSection {
  const rx = d.ring_x, cy = d.key_cy;
  const ox0 = rx - p.flex_len, ox1 = rx + p.bump_d / 2 + 1 + p.flex_gap;
  const oy0 = cy - p.flex_w / 2 - p.flex_gap, oy1 = cy + p.flex_w / 2 + p.flex_gap;
  const ix0 = rx - p.flex_len - 2, ix1 = rx + p.bump_d / 2 + 1;
  return s.k(rect2(w, s, ox0, oy0, ox1, oy1).subtract(rect2(w, s, ix0, cy - p.flex_w / 2, ix1, cy + p.flex_w / 2)));
}

function lanyardRect(p: CaseParams, d: Derived) {
  const cx = d.body_w / 2, cy = d.body_h - p.top_band / 2;
  return { x0: cx - p.slot_w / 2, y0: cy - p.slot_h / 2, x1: cx + p.slot_w / 2, y1: cy + p.slot_h / 2 };
}

function lanyardBox(w: ManifoldToplevel, s: Scope, p: CaseParams, d: Derived): Manifold {
  const r = lanyardRect(p, d);
  return box(w, s, r.x0, r.y0, -1, r.x1, r.y1, 10);
}

/**
 * The region of the flat bottom face (z = 0) where a logo may go:
 * outline minus openings, inset by `margin`; the key section is excluded entirely.
 * Returned CrossSection is NOT tracked by `s`.
 */
export function logoAllowedRegion(w: ManifoldToplevel, p: CaseParams, margin: number, s: Scope): CrossSection {
  const { CrossSection } = w;
  const d = derive(p);
  const outline = roundedRect(w, s, d.body_w, d.body_h, p.corner_r);
  let region = s.k(outline.intersect(rect2(w, s, -1, d.key_sec, d.body_w + 1, d.body_h + 1)));
  const notch = s.k(s.k(CrossSection.circle(p.notch_r, 128)).translate([0, d.card_cy]));
  const lr = lanyardRect(p, d);
  const holes = s.k(notch.add(rect2(w, s, lr.x0, lr.y0, lr.x1, lr.y1)));
  region = s.k(region.subtract(holes));
  if (margin > 0) region = s.k(region.offset(-margin, 'Round', 2, 64));
  return s.release(region);
}
