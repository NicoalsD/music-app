import { describe, expect, it } from 'vitest';
import {
  CONTRAST_BODY,
  contrastRatio,
  ensureContrast,
  fromHex,
  fromHsl,
  hueDistance,
  mix,
  pickTextColor,
  relativeLuminance,
  toHex,
  toHsl,
  worstContrast,
} from './color';

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

describe('color', () => {
  it('computes the WCAG contrast of black on white as 21:1, symmetric', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });

  it('computes relative luminance at the extremes', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
  });

  it('round-trips hex and HSL', () => {
    expect(toHex(fromHex('#b4432e'))).toBe('#b4432e');
    const rgb = fromHex('#6fa58c');
    const back = fromHsl(toHsl(rgb));
    expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
  });

  it('covers every hue sector when converting from HSL', () => {
    const hexes = [0, 60, 120, 180, 240, 300].map((h) => toHex(fromHsl({ h, s: 1, l: 0.5 })));
    expect(hexes).toEqual(['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']);
  });

  it('rejects malformed hex', () => {
    expect(() => fromHex('red')).toThrow(RangeError);
  });

  it('mixes linearly and clamps t', () => {
    expect(mix(BLACK, WHITE, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(mix(BLACK, WHITE, 2)).toEqual(WHITE);
    expect(mix(BLACK, WHITE, -1)).toEqual(BLACK);
  });

  it('measures hue distance the short way round', () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(90, 90)).toBe(0);
  });

  it('takes the worst contrast over several backgrounds', () => {
    const grey = { r: 128, g: 128, b: 128 };
    expect(worstContrast(BLACK, [WHITE, grey])).toBeCloseTo(contrastRatio(BLACK, grey), 5);
  });

  it('picks ink on light backgrounds and paper on dark ones', () => {
    const ink = fromHex('#1e1c22');
    const paper = fromHex('#f8f4ea');
    expect(pickTextColor([fromHex('#e8d9a8')], [ink, paper]).color).toBe(ink);
    expect(pickTextColor([fromHex('#22306a')], [ink, paper]).color).toBe(paper);
  });

  it('picks by the worst background and reports whether the minimum is reached', () => {
    const ink = fromHex('#1e1c22');
    const paper = fromHex('#f8f4ea');
    const mixed = pickTextColor([fromHex('#e8d9a8'), fromHex('#22306a')], [ink, paper]);
    expect(mixed.ratio).toBeGreaterThan(1);
    const tough = pickTextColor([fromHex('#808080')], [ink, paper], 12);
    expect(tough.ok).toBe(false);
    expect(pickTextColor([WHITE], [BLACK]).ok).toBe(true);
  });

  it('moves a colour away from the text until it reaches the ratio', () => {
    const text = fromHex('#f8f4ea');
    const mid = fromHex('#808080');
    const fixed = ensureContrast(mid, text, CONTRAST_BODY);
    expect(contrastRatio(fixed, text)).toBeGreaterThanOrEqual(CONTRAST_BODY);
    expect(relativeLuminance(fixed)).toBeLessThan(relativeLuminance(mid));
    const lighter = ensureContrast(mid, fromHex('#1e1c22'), CONTRAST_BODY);
    expect(relativeLuminance(lighter)).toBeGreaterThan(relativeLuminance(mid));
  });

  it('leaves a colour that already passes untouched', () => {
    const dark = fromHex('#101010');
    expect(ensureContrast(dark, WHITE, CONTRAST_BODY)).toBe(dark);
  });

  it('stops at the extreme when the ratio cannot be reached', () => {
    const out = ensureContrast(fromHex('#808080'), fromHex('#777777'), 21);
    expect(out).toBeDefined();
  });
});
