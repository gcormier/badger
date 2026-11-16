// Parameters for the gen1 badge holder. Values mirror the Fusion 360 model.

export interface CaseParams {
  card_t: number;
  card_w: number;
  card_h: number;
  card_clr: number;
  card_tclr: number;
  key_t: number;
  key_w: number;
  key_l: number;
  key_clr: number;
  key_tclr: number;
  ring_off: number;
  skin: number;
  side: number;
  lip: number;
  top_band: number;
  slot_w: number;
  slot_h: number;
  flex_len: number;
  flex_w: number;
  flex_gap: number;
  bump_d: number;
  bump_h: number;
  ridge_h: number;
  ridge_len: number;
  notch_r: number;
  key_win: number;
  grip_l: number;
  grip_off: number;
  corner_r: number;
}

export interface LogoParams {
  logo_length: number;
  logo_rotation: number;
  logo_offset_x: number;
  logo_offset_y: number;
  inlay_depth: number;
  min_feature: number;
  min_island_area: number;
  /** keep_tips: drop only islands whose thick core is too small; strict: pure opening */
  thin_mode: 'keep_tips' | 'strict';
  logo_margin: number;
  layer_height: number;
  /** 0..255; null = automatic (Otsu). PNG only. */
  threshold: number | null;
  invert: boolean;
  /** PNG only: Gaussian smoothing before tracing, in pixels */
  trace_smooth: number;
  case_color: string;
  logo_color: string;
}

export type Params = CaseParams & LogoParams;

export const DEFAULT_CASE: CaseParams = {
  card_t: 2.76,
  card_w: 53.98,
  card_h: 85.6,
  card_clr: 0.2,
  card_tclr: 0.3,
  key_t: 3.3,
  key_w: 18,
  key_l: 45.5,
  key_clr: 0.4,
  key_tclr: 0.1,
  ring_off: 5,
  skin: 1.2,
  side: 3.2,
  lip: 3,
  top_band: 10,
  slot_w: 14,
  slot_h: 3.5,
  flex_len: 14,
  flex_w: 6,
  flex_gap: 0.6,
  bump_d: 3.8,
  bump_h: 1.2,
  ridge_h: 1.4,
  ridge_len: 13,
  notch_r: 7,
  key_win: 12,
  grip_l: 10,
  grip_off: 28,
  corner_r: 2,
};

export const DEFAULT_LOGO: LogoParams = {
  logo_length: 75,
  logo_rotation: 90,
  logo_offset_x: 0,
  logo_offset_y: 0,
  inlay_depth: 0.4,
  min_feature: 0.4,
  min_island_area: 1.5,
  thin_mode: 'keep_tips',
  logo_margin: 2,
  layer_height: 0.2,
  threshold: null,
  invert: false,
  trace_smooth: 0.7,
  case_color: '#C92A28',
  logo_color: '#FFFFFF',
};

export const DEFAULTS: Params = { ...DEFAULT_CASE, ...DEFAULT_LOGO };

export interface Derived {
  card_gap: number;
  key_gap: number;
  T_card: number;
  T_key: number;
  ridge_lead: number;
  ridge_catch: number;
  entry: number;
  body_w: number;
  key_ph: number;
  key_sec: number;
  card_ph: number;
  body_h: number;
  key_pl: number;
  ring_x: number;
  key_cy: number;
  card_cy: number;
  /** default logo centre (centre of the card section's flat bottom) */
  logo_cx: number;
  logo_cy: number;
}

const T30 = Math.tan(Math.PI / 6);

export function derive(p: CaseParams): Derived {
  const card_gap = p.card_t + p.card_tclr;
  const key_gap = p.key_t + p.key_tclr;
  const T_card = 2 * p.skin + card_gap;
  const T_key = 2 * p.skin + key_gap;
  const ridge_lead = p.ridge_h / T30;
  const ridge_catch = p.ridge_h * T30;
  const entry = ridge_lead + ridge_catch + 0.6;
  const body_w = entry + p.card_w + p.card_clr + p.side;
  const key_ph = p.key_w + p.key_clr;
  const key_sec = 2 * p.side + key_ph;
  const card_ph = p.card_h + p.card_clr;
  const body_h = key_sec + card_ph + p.top_band;
  const key_pl = p.key_l + p.key_clr;
  const ring_x = body_w - p.key_clr - p.ring_off;
  const key_cy = p.side + key_ph / 2;
  const card_cy = key_sec + card_ph / 2;
  // Default logo centre = Fusion placement (30.6, 69.3). 30.6 = body_w/2;
  // 69.3 = midpoint between the key section and the lanyard slot band.
  const logo_cx = body_w / 2;
  const logo_cy = (key_sec + (body_h - p.top_band / 2 - p.slot_h / 2)) / 2;
  return {
    card_gap, key_gap, T_card, T_key, ridge_lead, ridge_catch, entry, body_w,
    key_ph, key_sec, card_ph, body_h, key_pl, ring_x, key_cy, card_cy, logo_cx, logo_cy,
  };
}

/** UI metadata: which params are shown up-front (★) vs under Advanced. */
export interface FieldMeta {
  key: keyof Params;
  label: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  star?: boolean;
  group: 'case' | 'logo';
  help?: string;
}

export const FIELDS: FieldMeta[] = [
  { key: 'card_t', label: 'Card stack thickness', unit: 'mm', step: 0.01, min: 0.5, max: 6, star: true, group: 'case', help: '1 ID-1 card ≈ 0.76' },
  { key: 'key_t', label: 'Key thickness', unit: 'mm', step: 0.05, min: 1, max: 8, star: true, group: 'case' },
  { key: 'bump_h', label: 'Detent bump height', unit: 'mm', step: 0.05, min: 0, max: 3, star: true, group: 'case' },
  { key: 'ridge_h', label: 'Card ridge height', unit: 'mm', step: 0.05, min: 0.2, max: 3, star: true, group: 'case' },
  { key: 'key_win', label: 'Key-end window', unit: 'mm', step: 0.5, min: 0, max: 40, star: true, group: 'case' },
  { key: 'grip_l', label: 'Pinch window length', unit: 'mm', step: 0.5, min: 0, max: 30, star: true, group: 'case' },
  { key: 'card_w', label: 'Card width', unit: 'mm', step: 0.01, group: 'case' },
  { key: 'card_h', label: 'Card height', unit: 'mm', step: 0.01, group: 'case' },
  { key: 'card_clr', label: 'Card planar clearance', unit: 'mm', step: 0.05, group: 'case' },
  { key: 'card_tclr', label: 'Card thickness clearance', unit: 'mm', step: 0.05, group: 'case' },
  { key: 'key_w', label: 'Key width', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'key_l', label: 'Key length', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'key_clr', label: 'Key planar clearance', unit: 'mm', step: 0.05, group: 'case' },
  { key: 'key_tclr', label: 'Key thickness clearance', unit: 'mm', step: 0.05, group: 'case' },
  { key: 'ring_off', label: 'Ring hole from key end', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'skin', label: 'Skin thickness', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'side', label: 'Frame wall width', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'top_band', label: 'Top band', unit: 'mm', step: 0.5, group: 'case' },
  { key: 'slot_w', label: 'Lanyard slot length', unit: 'mm', step: 0.5, group: 'case' },
  { key: 'slot_h', label: 'Lanyard slot height', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'flex_len', label: 'Flexure arm length', unit: 'mm', step: 0.5, group: 'case' },
  { key: 'flex_w', label: 'Flexure arm width', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'flex_gap', label: 'Flexure slot gap', unit: 'mm', step: 0.05, group: 'case' },
  { key: 'bump_d', label: 'Detent bump diameter', unit: 'mm', step: 0.1, group: 'case' },
  { key: 'ridge_len', label: 'Card ridge length', unit: 'mm', step: 0.5, group: 'case' },
  { key: 'notch_r', label: 'Thumb notch radius', unit: 'mm', step: 0.5, group: 'case' },
  { key: 'grip_off', label: 'Pinch window offset', unit: 'mm', step: 0.5, group: 'case' },
  { key: 'corner_r', label: 'Corner radius', unit: 'mm', step: 0.1, group: 'case' },

  { key: 'logo_length', label: 'Logo length (long axis)', unit: 'mm', step: 0.5, min: 1, max: 120, star: true, group: 'logo' },
  { key: 'logo_rotation', label: 'Logo rotation', unit: '°', step: 90, min: -360, max: 360, star: true, group: 'logo', help: '90 = text runs up the long axis' },
  { key: 'logo_offset_x', label: 'Logo offset X', unit: 'mm', step: 0.1, star: true, group: 'logo', help: 'part X (width)' },
  { key: 'logo_offset_y', label: 'Logo offset Y', unit: 'mm', step: 0.1, star: true, group: 'logo', help: 'part Y (length)' },
  { key: 'inlay_depth', label: 'Inlay depth', unit: 'mm', step: 0.1, min: 0.1, max: 1.1, star: true, group: 'logo' },
  { key: 'min_feature', label: 'Min feature width', unit: 'mm', step: 0.05, min: 0, max: 2, star: true, group: 'logo' },
  { key: 'min_island_area', label: 'Min island area', unit: 'mm²', step: 0.1, min: 0, max: 50, star: true, group: 'logo' },
  { key: 'logo_margin', label: 'Keep-out margin', unit: 'mm', step: 0.1, min: 0, max: 10, group: 'logo' },
  { key: 'trace_smooth', label: 'Trace smoothing (PNG)', unit: 'px', step: 0.1, min: 0, max: 5, group: 'logo' },
  { key: 'layer_height', label: 'Layer height', unit: 'mm', step: 0.04, min: 0.04, max: 0.4, group: 'logo' },
];
