// Share links: non-default params + the logo (as SVG text), deflated and base64url'd
// into the URL fragment. The fragment never leaves the browser, so nothing is uploaded.
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { DEFAULTS, Params } from './params';

export interface SharePayload {
  params: Partial<Params>;
  logo?: { name: string; svg: string };
}

interface Wire { v: 1; p: Partial<Params>; n?: string; s?: string }

const b64url = (u8: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

/** Only the params that differ from the defaults. */
export function paramDiff(p: Params): Partial<Params> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULTS) as (keyof Params)[]) {
    if (p[k] !== DEFAULTS[k]) out[k] = p[k];
  }
  return out as Partial<Params>;
}

/** Strips editor cruft that doesn't affect the geometry. */
export function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<(sodipodi|inkscape):[\w-]+[^>]*\/>/g, '')
    .replace(/<(sodipodi|inkscape):([\w-]+)[^>]*>[\s\S]*?<\/\1:\2>/g, '')
    .replace(/\s(sodipodi|inkscape):[\w-]+\s*=\s*("[^"]*"|'[^']*')/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

export function encodeShare(x: SharePayload): string {
  const wire: Wire = { v: 1, p: x.params };
  if (x.logo) { wire.n = x.logo.name; wire.s = minifySvg(x.logo.svg); }
  return b64url(deflateSync(strToU8(JSON.stringify(wire)), { level: 9 }));
}

/** Decodes and validates; unknown keys and wrong types are dropped. */
export function decodeShare(s: string): SharePayload | null {
  try {
    const wire = JSON.parse(strFromU8(inflateSync(unb64url(s)))) as Wire;
    if (!wire || wire.v !== 1) return null;
    const params: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(wire.p ?? {})) {
      if (!(k in DEFAULTS)) continue;
      const def = (DEFAULTS as unknown as Record<string, unknown>)[k];
      const ok = def === null ? (v === null || typeof v === 'number') : typeof v === typeof def || (k === 'threshold' && (v === null || typeof v === 'number'));
      if (ok && (typeof v !== 'number' || Number.isFinite(v))) params[k] = v;
    }
    const out: SharePayload = { params: params as Partial<Params> };
    if (typeof wire.s === 'string' && wire.s.length) out.logo = { name: typeof wire.n === 'string' ? wire.n : 'shared.svg', svg: wire.s };
    return out;
  } catch {
    return null;
  }
}
