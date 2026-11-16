// Minimal, DOM-free SVG → filled shapes parser (runs in a Web Worker and in Node tests).
// Each filled shape becomes a set of absolute, transformed path segments that are
// later flattened to polygons at a tolerance chosen for the final print scale.
import svgpath from 'svgpath';

export type FillRule = 'NonZero' | 'EvenOdd';

export interface SvgShape {
  /** transformed absolute path data, y-down SVG coordinates */
  d: string;
  fillRule: FillRule;
  /** fill luminance 0..1 (0 = black) */
  luminance: number;
  tag: string;
  id?: string;
}

export interface SvgParseResult {
  shapes: SvgShape[];
  warnings: string[];
}

interface Style {
  fill: string;
  fillRule: string;
  display: string;
  visibility: string;
  opacity: number;
  fillOpacity: number;
}

const SKIP_TAGS = new Set([
  'defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'linearGradient', 'radialGradient',
  'title', 'desc', 'metadata', 'filter', 'style', 'script', 'font', 'foreignObject',
]);

type Attrs = Record<string, string>;

function parseAttrs(s: string): Attrs {
  const out: Attrs = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = m[3] ?? m[4] ?? '';
  }
  return out;
}

function parseStyleDecl(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Very small CSS support: `.class{...}`, `#id{...}`, `tag{...}`, comma lists. */
function parseCss(css: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decl = parseStyleDecl(m[2]);
    for (const sel of m[1].split(',')) {
      const k = sel.trim();
      if (!k) continue;
      rules.set(k, { ...(rules.get(k) ?? {}), ...decl });
    }
  }
  return rules;
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192],
  orange: [255, 165, 0], navy: [0, 0, 128], maroon: [128, 0, 0], purple: [128, 0, 128],
};

/** Returns luminance 0..1, or null for none/transparent. Gradients/urls count as black. */
export function colorLuminance(c: string): number | null {
  c = c.trim().toLowerCase();
  if (c === 'none' || c === 'transparent') return null;
  let rgb: [number, number, number] | null = null;
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(x => x + x).join('');
    if (h.length >= 6) rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  } else if (c.startsWith('rgb')) {
    const n = c.match(/[\d.]+%?/g) ?? [];
    rgb = n.slice(0, 3).map(v => (v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v))) as [number, number, number];
  } else if (NAMED[c]) {
    rgb = NAMED[c];
  }
  if (!rgb) return 0; // url(#grad), currentColor, unknown → treat as dark
  const [r, g, b] = rgb.map(v => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function num(a: string | undefined, def = 0): number {
  if (a === undefined) return def;
  const v = parseFloat(a);
  return Number.isFinite(v) ? v : def;
}

function shapeToPath(tag: string, a: Attrs): string | null {
  switch (tag) {
    case 'path':
      return a.d ?? null;
    case 'rect': {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (w <= 0 || h <= 0) return null;
      let rx = a.rx !== undefined ? num(a.rx) : NaN, ry = a.ry !== undefined ? num(a.ry) : NaN;
      if (isNaN(rx) && isNaN(ry)) rx = ry = 0;
      else if (isNaN(rx)) rx = ry; else if (isNaN(ry)) ry = rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(a.cx), cy = num(a.cy);
      const rx = tag === 'circle' ? num(a.r) : num(a.rx), ry = tag === 'circle' ? num(a.r) : num(a.ry);
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const n = (a.points ?? '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
      if (n.length < 6) return null;
      let d = `M${n[0]} ${n[1]}`;
      for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
      return d + 'Z';
    }
    default:
      return null;
  }
}

export function parseSvg(text: string): SvgParseResult {
  const warnings = new Set<string>();
  const shapes: SvgShape[] = [];

  // Strip comments, CDATA wrappers, doctype, processing instructions.
  const css = new Map<string, Record<string, string>>();
  for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const [k, v] of parseCss(m[1].replace(/<!\[CDATA\[|\]\]>/g, ''))) css.set(k, { ...(css.get(k) ?? {}), ...v });
  }
  const src = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

  interface Frame { tag: string; transform: string; style: Style; skip: boolean }
  const root: Style = { fill: '#000', fillRule: 'nonzero', display: 'inline', visibility: 'visible', opacity: 1, fillOpacity: 1 };
  const stack: Frame[] = [{ tag: '#root', transform: '', style: root, skip: false }];
  let rootTransform = '';
  let sawSvg = false;

  const tagRe = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (const m of src.matchAll(tagRe)) {
    const closing = m[1] === '/';
    const tag = m[2].replace(/^svg:/, '');
    const selfClose = m[4] === '/';
    if (closing) {
      // pop to matching tag
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const a = parseAttrs(m[3]);
    const parent = stack[stack.length - 1];

    // Resolve style: inherited ← css (tag, class, id) ← presentation attrs ← style attr.
    const decl: Record<string, string> = {};
    const pres = ['fill', 'fill-rule', 'display', 'visibility', 'opacity', 'fill-opacity'];
    for (const k of pres) if (a[k] !== undefined) decl[k] = a[k];
    Object.assign(decl, css.get(tag) ?? {});
    for (const c of (a.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(decl, css.get('.' + c) ?? {});
    if (a.id) Object.assign(decl, css.get('#' + a.id) ?? {});
    if (a.style) Object.assign(decl, parseStyleDecl(a.style));
    const st: Style = {
      fill: decl['fill'] ?? parent.style.fill,
      fillRule: decl['fill-rule'] ?? parent.style.fillRule,
      display: decl['display'] ?? 'inline',
      visibility: decl['visibility'] ?? parent.style.visibility,
      opacity: parent.style.opacity * (decl['opacity'] !== undefined ? num(decl['opacity'], 1) : 1),
      fillOpacity: decl['fill-opacity'] !== undefined ? num(decl['fill-opacity'], 1) : parent.style.fillOpacity,
    };
    if (st.fill === 'inherit') st.fill = parent.style.fill;

    let transform = parent.transform;
    if (tag === 'svg' && !sawSvg) {
      sawSvg = true;
      // viewBox only offsets/scales uniformly; for logo extraction it can be ignored
      // except for its translation, which does not matter either (we re-centre).
      rootTransform = '';
    }
    if (a.transform) transform = (transform ? transform + ' ' : '') + a.transform;
    if (tag === 'svg' && (a.x || a.y)) transform = (transform ? transform + ' ' : '') + `translate(${num(a.x)} ${num(a.y)})`;

    const skip = parent.skip || SKIP_TAGS.has(tag) || st.display === 'none';
    const frame: Frame = { tag, transform, style: st, skip };

    if (!skip) {
      if (tag === 'use') warnings.add('<use> elements are not supported and were ignored');
      if (tag === 'text' || tag === 'tspan') warnings.add('<text> is not supported — convert text to paths/outlines first');
      if (tag === 'image') warnings.add('Embedded <image> was ignored — upload the raster directly instead');
      const d = shapeToPath(tag, a);
      if (d !== null) {
        const lum = colorLuminance(st.fill);
        if (lum === null || st.opacity * st.fillOpacity <= 0.01 || st.visibility === 'hidden') {
          if (lum === null && tag !== 'line') warnings.add('Stroke-only / unfilled elements were ignored');
        } else {
          let p = svgpath(d);
          const t = (rootTransform ? rootTransform + ' ' : '') + transform;
          if (t.trim()) p = p.transform(t);
          shapes.push({
            d: p.abs().unarc().unshort().toString(),
            fillRule: st.fillRule.trim() === 'evenodd' ? 'EvenOdd' : 'NonZero',
            luminance: lum,
            tag,
            id: a.id,
          });
        }
      }
    }
    if (!selfClose) stack.push(frame);
  }
  if (!sawSvg) warnings.add('File does not look like an SVG');
  if (shapes.length === 0) warnings.add('No filled shapes found in the SVG');
  return { shapes, warnings: [...warnings] };
}

// ---------- flattening ----------

export type Pt = [number, number];

function flattenCubic(out: Pt[], p0: Pt, p1: Pt, p2: Pt, p3: Pt, tol2: number, depth: number): void {
  // flatness: max squared distance of control points to chord (conservative)
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
  const L2 = dx * dx + dy * dy;
  const dist2 = (p: Pt) => {
    if (L2 < 1e-24) return (p[0] - p0[0]) ** 2 + (p[1] - p0[1]) ** 2;
    const c = (p[0] - p0[0]) * dy - (p[1] - p0[1]) * dx;
    return (c * c) / L2;
  };
  if (depth > 16 || Math.max(dist2(p1), dist2(p2)) <= tol2) {
    out.push(p3);
    return;
  }
  const m = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = m(p0, p1), p12 = m(p1, p2), p23 = m(p2, p3);
  const p012 = m(p01, p12), p123 = m(p12, p23), mid = m(p012, p123);
  flattenCubic(out, p0, p01, p012, mid, tol2, depth + 1);
  flattenCubic(out, mid, p123, p23, p3, tol2, depth + 1);
}

/** Flattens absolute path data (M L H V C Q Z only) into closed polylines. */
export function flattenPath(d: string, tol: number): Pt[][] {
  const polys: Pt[][] = [];
  let cur: Pt[] = [];
  let pt: Pt = [0, 0];
  let start: Pt = [0, 0];
  const tol2 = tol * tol;
  const close = () => {
    if (cur.length >= 3) polys.push(cur);
    cur = [];
  };
  svgpath(d).iterate((seg) => {
    const c = seg[0] as string;
    const n = seg.slice(1) as number[];
    switch (c) {
      case 'M':
        close();
        pt = [n[0], n[1]]; start = pt; cur = [pt];
        break;
      case 'L': pt = [n[0], n[1]]; cur.push(pt); break;
      case 'H': pt = [n[0], pt[1]]; cur.push(pt); break;
      case 'V': pt = [pt[0], n[0]]; cur.push(pt); break;
      case 'C': {
        const p3: Pt = [n[4], n[5]];
        flattenCubic(cur, pt, [n[0], n[1]], [n[2], n[3]], p3, tol2, 0);
        pt = p3;
        break;
      }
      case 'Q': {
        const q: Pt = [n[0], n[1]], p3: Pt = [n[2], n[3]];
        const c1: Pt = [pt[0] + (2 / 3) * (q[0] - pt[0]), pt[1] + (2 / 3) * (q[1] - pt[1])];
        const c2: Pt = [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])];
        flattenCubic(cur, pt, c1, c2, p3, tol2, 0);
        pt = p3;
        break;
      }
      case 'Z': case 'z':
        close();
        pt = start; cur = [];
        break;
    }
  });
  close();
  // drop duplicate closing point
  for (const p of polys) {
    const a = p[0], b = p[p.length - 1];
    if (p.length > 1 && Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12) p.pop();
  }
  return polys.filter(p => p.length >= 3);
}

/** Bounding box of path control points (cheap upper bound of the geometry bbox). */
export function controlBounds(shapes: SvgShape[]): { min: Pt; max: Pt } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) {
    svgpath(s.d).iterate((seg) => {
      const n = seg.slice(1) as number[];
      const c = seg[0] as string;
      if (c === 'H') { x0 = Math.min(x0, n[0]); x1 = Math.max(x1, n[0]); return; }
      if (c === 'V') { y0 = Math.min(y0, n[0]); y1 = Math.max(y1, n[0]); return; }
      for (let i = 0; i + 1 < n.length; i += 2) {
        x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]);
        y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
      }
    });
  }
  return Number.isFinite(x0) ? { min: [x0, y0], max: [x1, y1] } : null;
}
