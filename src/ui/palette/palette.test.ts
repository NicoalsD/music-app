import { describe, expect, it } from 'vitest';
import { rankColors } from '../dominantColor';
import { CONTRAST_BODY, CONTRAST_LARGE, contrastRatio, fromHex, toHsl, hueDistance } from './color';
import type { Rgb } from './color';
import {
  FALLBACK_PALETTE,
  FIELD_CONTRAST,
  FIELD_MAX_SATURATION,
  HUE_SEPARATION,
  buildTheme,
  extractPalette,
  isDistinct,
  selectPalette,
  themeVars,
} from './palette';

function pixels(count: number, r: number, g: number, b: number): number[] {
  return Array.from({ length: count }, () => [r, g, b, 255]).flat();
}

function ranked(...entries: Array<[Rgb, number]>) {
  return entries.map(([rgb, share]) => ({ rgb, share, weight: share }));
}

const RED: Rgb = { r: 200, g: 40, b: 40 };
const REDDER: Rgb = { r: 210, g: 50, b: 30 };
const GREEN: Rgb = { r: 40, g: 180, b: 70 };
const BLUE: Rgb = { r: 40, g: 70, b: 200 };

describe('selectPalette', () => {
  it('returns null without colours', () => {
    expect(selectPalette([])).toBeNull();
    expect(extractPalette([])).toBeNull();
  });

  it('keeps the dominant colour first and skips same-hue neighbours for the secondary', () => {
    const palette = selectPalette(ranked([RED, 0.5], [REDDER, 0.3], [GREEN, 0.15], [BLUE, 0.05]));
    expect(palette?.dominant).toBe(RED);
    expect(palette?.secondary).toBe(GREEN);
    expect(palette?.accent).toBe(BLUE);
  });

  it('separates hues by at least the minimum gap', () => {
    const palette = selectPalette(ranked([RED, 0.5], [GREEN, 0.3], [BLUE, 0.2]));
    if (palette === null) throw new Error('expected a palette');
    const hues = [palette.dominant, palette.secondary, palette.accent].map((c) => toHsl(c).h);
    expect(hueDistance(hues[0] ?? 0, hues[1] ?? 0)).toBeGreaterThanOrEqual(HUE_SEPARATION);
    expect(hueDistance(hues[0] ?? 0, hues[2] ?? 0)).toBeGreaterThanOrEqual(HUE_SEPARATION);
    expect(hueDistance(hues[1] ?? 0, hues[2] ?? 0)).toBeGreaterThanOrEqual(HUE_SEPARATION);
  });

  it('accepts a closer hue for the accent when nothing is 40 degrees away', () => {
    const orange: Rgb = { r: 217, g: 83, b: 30 };
    const gold: Rgb = { r: 244, g: 196, b: 48 };
    const teal: Rgb = { r: 42, g: 157, b: 143 };
    const palette = selectPalette(ranked([orange, 0.6], [teal, 0.3], [gold, 0.1]));
    expect(palette?.accent).toBe(gold);
    const onlyGold = selectPalette(ranked([orange, 0.7], [gold, 0.3]));
    expect(onlyGold?.secondary).toBe(gold);
  });

  it('ignores colours that cover almost no pixels', () => {
    const palette = selectPalette(ranked([RED, 0.99], [GREEN, 0.005], [BLUE, 0.005]));
    expect(palette?.secondary).not.toBe(GREEN);
    expect(palette?.accent).not.toBe(BLUE);
  });

  it('derives the other inks by rotating a single-colour cover', () => {
    const palette = selectPalette(ranked([RED, 1]));
    if (palette === null) throw new Error('expected a palette');
    expect(isDistinct(palette.dominant, palette.secondary)).toBe(true);
    expect(isDistinct(palette.dominant, palette.accent)).toBe(true);
  });

  it('uses the token colours for the other inks of a greyscale cover', () => {
    const palette = selectPalette(ranked([{ r: 120, g: 120, b: 120 }, 1]));
    expect(palette?.secondary).toBe(FALLBACK_PALETTE.secondary);
    expect(palette?.accent).toBe(FALLBACK_PALETTE.accent);
  });

  it('extracts from pixel data end to end', () => {
    const data = [
      ...pixels(60, 200, 40, 40),
      ...pixels(30, 40, 180, 70),
      ...pixels(10, 40, 70, 200),
    ];
    expect(rankColors(data)).toHaveLength(3);
    const palette = extractPalette(data);
    expect(palette?.dominant.r).toBeGreaterThan(150);
    expect(palette?.secondary.g).toBeGreaterThan(120);
    expect(palette?.accent.b).toBeGreaterThan(120);
  });
});

describe('isDistinct', () => {
  it('compares greys by lightness and greys against hues as distinct', () => {
    expect(isDistinct({ r: 30, g: 30, b: 30 }, { r: 200, g: 200, b: 200 })).toBe(true);
    expect(isDistinct({ r: 100, g: 100, b: 100 }, { r: 110, g: 110, b: 110 })).toBe(false);
    expect(isDistinct({ r: 100, g: 100, b: 100 }, RED)).toBe(true);
    expect(isDistinct(RED, REDDER)).toBe(false);
  });
});

describe('buildTheme', () => {
  const covers: Record<string, ReturnType<typeof selectPalette>> = {
    red: selectPalette(ranked([RED, 0.5], [GREEN, 0.3], [BLUE, 0.2])),
    pastel: selectPalette(
      ranked(
        [{ r: 240, g: 220, b: 190 }, 0.6],
        [{ r: 150, g: 200, b: 230 }, 0.3],
        [{ r: 230, g: 160, b: 170 }, 0.1],
      ),
    ),
    midtone: selectPalette(ranked([{ r: 128, g: 110, b: 60 }, 0.7], [BLUE, 0.2], [GREEN, 0.1])),
    navy: selectPalette(ranked([{ r: 20, g: 30, b: 70 }, 0.8], [RED, 0.1], [GREEN, 0.1])),
    fallback: null,
  };

  for (const [name, palette] of Object.entries(covers)) {
    it(`keeps the text readable on the ${name} cover`, () => {
      const theme = buildTheme(palette);
      const field = fromHex(theme.field);
      const text = fromHex(theme.text);
      expect(contrastRatio(text, field)).toBeGreaterThanOrEqual(FIELD_CONTRAST);
      expect(contrastRatio(fromHex(theme.textSoft), field)).toBeGreaterThanOrEqual(CONTRAST_BODY);
      expect(contrastRatio(fromHex(theme.textSoft), fromHex(theme.panel))).toBeGreaterThanOrEqual(
        CONTRAST_BODY,
      );
      expect(contrastRatio(text, fromHex(theme.panel))).toBeGreaterThanOrEqual(CONTRAST_BODY);
      // Large lyric text stays above 3:1 over the shapes it may overlap.
      expect(contrastRatio(text, fromHex(theme.sun))).toBeGreaterThanOrEqual(CONTRAST_LARGE);
      expect(contrastRatio(text, fromHex(theme.sun))).toBeGreaterThanOrEqual(CONTRAST_BODY);
      expect(contrastRatio(text, fromHex(theme.accent))).toBeGreaterThanOrEqual(CONTRAST_BODY);
    });
  }

  it('uses paper text on dark fields and ink on light ones', () => {
    expect(buildTheme(covers['navy'] ?? null).scheme).toBe('dark');
    expect(buildTheme(covers['pastel'] ?? null).scheme).toBe('light');
  });

  it('mutes the dominant colour toward paper instead of using it raw', () => {
    const theme = buildTheme(covers['pastel'] ?? null);
    expect(theme.field).not.toBe('#f0dcbe');
  });

  it('keeps the field calm: a vivid cover only tints it', () => {
    for (const palette of Object.values(covers)) {
      const field = toHsl(fromHex(buildTheme(palette).field));
      expect(field.s).toBeLessThanOrEqual(FIELD_MAX_SATURATION + 0.02);
    }
    // The tint still follows the cover: a red cover gives a reddish field.
    const red = toHsl(fromHex(buildTheme(covers['red'] ?? null).field));
    expect(hueDistance(red.h, 0)).toBeLessThan(30);
  });

  it('builds the fallback theme from the token palette', () => {
    expect(buildTheme(null)).toEqual(buildTheme(FALLBACK_PALETTE));
  });

  it('exposes the theme as the registered custom properties', () => {
    const theme = buildTheme(null);
    expect(themeVars(theme)).toEqual({
      '--np-field': theme.field,
      '--np-sun': theme.sun,
      '--np-accent': theme.accent,
      '--np-text': theme.text,
      '--np-text-soft': theme.textSoft,
      '--np-panel': theme.panel,
    });
  });
});
