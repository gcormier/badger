// Parameters for the gen1 badge holder. Values mirror the Fusion 360 model.

export interface CaseParams {
  /** 'mm': card_t is the stack thickness; 'count': card_count × card_unit */
  card_mode: 'mm' | 'count';
  card_t: number;
  card_count: number;
  /** average thickness of one card (count mode, and ridge sizing) */
  card_unit: number;
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
  /** auto: ridge height follows the stack so it catches the front card */
  ridge_auto: boolean;
  /** manual ridge height (when ridge_auto is off) */
  ridge_h: number;
  /** how far the ridge stands above the front card's bottom face (auto mode) */
  ridge_engage: number;
  /** lead-in ramp angle from horizontal, degrees */
  ridge_ramp: number;
  /** catch (retention) face angle from horizontal, degrees */
  ridge_catch_deg: number;
  /** gap from the catch-face foot to the seated card edge (negative = preload) */
  ridge_gap: number;
  /** height of the 45° dovetail lip, measured down from the top face */
  dove_h: number;
  /** length past the seated card edge where the lips are removed so a stack can bow up over the ridge (0 = off) */
  relief_len: number;
  ridge_len: number;
  notch_r: number;
  key_win: number;
  grip_l: number;
  grip_off: number;
  corner_r: number;
  /** fillet radius on top-face edges (outline, openings, lips, section step) */
  fillet_r: number;
  /** rounded lead-in at the card and key pocket mouths */
  mouth_r: number;
  /** 45° chamfer on bed-face edges (also hides elephant's foot) */
  bed_chamfer: number;
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
  card_mode: 'mm',
  card_t: 2.76,
  card_count: 3,
  card_unit: 0.8,
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
  ridge_auto: true,
  ridge_h: 1.4,
  ridge_engage: 0.4,
  ridge_ramp: 45,
  ridge_catch_deg: 90,
  ridge_gap: 0.1,
  dove_h: 1.5,
  relief_len: 15,
  ridge_len: 13,
  notch_r: 7,
  key_win: 12,
  grip_l: 10,
  grip_off: 28,
  corner_r: 2,
  fillet_r: 0.6,
  mouth_r: 0.6,
  bed_chamfer: 0.4,
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

/** No edge treatment — the Fusion model's sharp edges. */
export const SHARP_EDGES: Partial<CaseParams> = { fillet_r: 0, mouth_r: 0, bed_chamfer: 0 };

/** The original Fusion gen1 card retention (full-height dovetail, fixed 1.4 mm ridges). */
export const LEGACY_RETENTION: Partial<CaseParams> = {
  card_mode: 'mm', ridge_auto: false, ridge_h: 1.4, ridge_ramp: 30, ridge_catch_deg: 60, ridge_gap: -0.1, dove_h: 99, relief_len: 0,
};

export interface Derived {
  /** effective card stack thickness */
  card_t: number;
  /** effective ridge height */
  ridge_h: number;
  /** z of the front (top) card's top face */
  z_front: number;
  /** z where the dovetail slope starts */
  dove_z: number;
  /** how far the vertical pocket wall sits outside the card edge (0 = tight) */
  dove_o: number;
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

const tand = (deg: number) => Math.tan((deg * Math.PI) / 180);

export function cardStack(p: CaseParams): number {
  return p.card_mode === 'count' ? p.card_count * p.card_unit : p.card_t;
}

export function derive(p: CaseParams): Derived {
  const card_t = cardStack(p);
  const card_gap = card_t + p.card_tclr;
  const key_gap = p.key_t + p.key_tclr;
  const T_card = 2 * p.skin + card_gap;
  const T_key = 2 * p.skin + key_gap;
  // Ridge: catch the front card by ridge_engage (it sits card_t − one card above the floor).
  const ridge_h = p.ridge_auto ? Math.max(0.2, card_t - p.card_unit + p.ridge_engage) : p.ridge_h;
  const ridge_lead = ridge_h / tand(p.ridge_ramp);
  const ridge_catch = p.ridge_catch_deg >= 89.999 ? 0 : ridge_h / tand(p.ridge_catch_deg);
  // Pocket: vertical walls, then a 45° lip over the top dove_h. The lip's narrowest
  // allowed point is the front card's top face, so the vertical wall is pushed out
  // only if the slope must start below it.
  const z_front = p.skin + card_t;
  const lipRoom = T_card - z_front; // = card_tclr + skin
  const dh = Math.min(Math.max(p.dove_h, 0), T_card - p.skin);
  const dove_z = T_card - dh;
  const dove_o = Math.max(0, dh - lipRoom);
  const entry = Math.max(ridge_lead + ridge_catch + 0.6, ridge_lead + ridge_catch + p.ridge_gap + 0.5);
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
    card_t, ridge_h, z_front, dove_z, dove_o,
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
  /** only shown in this card mode */
  mode?: 'mm' | 'count';
  help?: string;
}

export const FIELDS: FieldMeta[] = [
  { key: 'card_t', label: 'Card stack thickness', unit: 'mm', step: 0.01, min: 0.5, max: 8, star: true, group: 'case', mode: 'mm' },
  { key: 'card_count', label: 'Number of cards', step: 1, min: 1, max: 10, star: true, group: 'case', mode: 'count' },
  { key: 'card_unit', label: 'Avg card thickness', unit: 'mm', step: 0.01, min: 0.3, max: 1.5, star: true, group: 'case', help: 'ISO 0.76; real cards ≈ 0.78–0.84' },
  { key: 'key_t', label: 'Key thickness', unit: 'mm', step: 0.05, min: 1, max: 8, star: true, group: 'case' },
  { key: 'bump_h', label: 'Detent bump height', unit: 'mm', step: 0.05, min: 0, max: 3, star: true, group: 'case' },
  { key: 'ridge_engage', label: 'Ridge catch on front card', unit: 'mm', step: 0.05, min: 0, max: 1.5, star: true, group: 'case', help: 'ridge height = stack − 1 card + this' },
  { key: 'ridge_h', label: 'Manual ridge height', unit: 'mm', step: 0.05, min: 0.2, max: 6, group: 'case', help: 'used when auto ridge is off' },
  { key: 'ridge_ramp', label: 'Ridge lead-in angle', unit: '°', step: 5, min: 15, max: 70, group: 'case' },
  { key: 'ridge_catch_deg', label: 'Ridge catch-face angle', unit: '°', step: 5, min: 30, max: 90, group: 'case', help: '90 = vertical' },
  { key: 'ridge_gap', label: 'Ridge gap to card', unit: 'mm', step: 0.05, min: -0.5, max: 1, group: 'case', help: 'negative = preload' },
  { key: 'dove_h', label: 'Dovetail lip height', unit: 'mm', step: 0.1, min: 0, max: 10, star: true, group: 'case', help: 'top part only; walls below are vertical' },
  { key: 'relief_len', label: 'Lip relief at entry', unit: 'mm', step: 1, min: 0, max: 40, star: true, group: 'case', help: 'lets a stack bow up over the ridge; 0 = off' },
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
  { key: 'fillet_r', label: 'Top edge fillet', unit: 'mm', step: 0.1, min: 0, max: 1.2, group: 'case', help: '0 = sharp' },
  { key: 'mouth_r', label: 'Pocket mouth rounding', unit: 'mm', step: 0.1, min: 0, max: 1.5, group: 'case' },
  { key: 'bed_chamfer', label: 'Bed edge chamfer', unit: 'mm', step: 0.1, min: 0, max: 1, group: 'case', help: '45°, no overhang' },

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
