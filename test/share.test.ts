import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeShare, decodeShare, paramDiff, minifySvg } from '../src/share';
import { DEFAULTS } from '../src/params';
import { parseSvg } from '../src/geometry/svg';

it('round-trips params and logo', () => {
  const svg = readFileSync('fixtures/Milwaukee_Logo.svg', 'utf8');
  const p = { ...DEFAULTS, card_mode: 'count' as const, card_count: 4, logo_color: '#000000', threshold: 120 };
  const enc = encodeShare({ params: paramDiff(p), logo: { name: 'm.svg', svg } });
  console.log('share length', enc.length);
  expect(enc.length).toBeLessThan(4000);
  const dec = decodeShare(enc)!;
  expect({ ...DEFAULTS, ...dec.params }).toEqual(p);
  expect(dec.logo!.name).toBe('m.svg');
  // minified SVG parses to the same shapes
  expect(parseSvg(dec.logo!.svg).shapes.map(s => s.d)).toEqual(parseSvg(svg).shapes.map(s => s.d));
});
it('rejects junk and bad types', () => {
  expect(decodeShare('!!!')).toBeNull();
  const enc = encodeShare({ params: { card_t: 'x' as unknown as number, evil: 1 } as never });
  expect(decodeShare(enc)!.params).toEqual({});
});
it('minify keeps geometry', () => {
  expect(minifySvg('<!-- c --><svg>\n  <path d="M0 0L1 1Z"/>\n</svg>')).toBe('<svg><path d="M0 0L1 1Z"/></svg>');
});
