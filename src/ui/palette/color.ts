import { rgbToHsl } from '../dominantColor';
import type { Rgb } from '../dominantColor';

export type { Rgb };

export interface Hsl {
  /** Degrees, 0..360. */
  readonly h: number;
  /** 0..1 */
  readonly s: number;
  /** 0..1 */
  readonly l: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function toHsl(rgb: Rgb): Hsl {
  return rgbToHsl(rgb);
}

export function fromHsl({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const light = clamp01(l);
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;
  const sector = Math.floor(hue / 60);
  const [r, g, b] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Parses `#rrggbb`; throws on anything else (inputs are our own constants). */
export function fromHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Invalid hex colour: ${hex}`);
  return {
    r: Number.parseInt(match[1] ?? '0', 16),
    g: Number.parseInt(match[2] ?? '0', 16),
    b: Number.parseInt(match[3] ?? '0', 16),
  };
}

/** Linear interpolation in sRGB: `t = 0` is `a`, `t = 1` is `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1..21, symmetric in its arguments. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Worst (lowest) contrast of `foreground` over every background. */
export function worstContrast(foreground: Rgb, backgrounds: readonly Rgb[]): number {
  return backgrounds.reduce((min, bg) => Math.min(min, contrastRatio(foreground, bg)), Infinity);
}

/** WCAG thresholds: body text and large text (>= 24px, or >= 18.66px bold). */
export const CONTRAST_BODY = 4.5;
export const CONTRAST_LARGE = 3;

/**
 * Picks the candidate with the best worst-case contrast over all `backgrounds` (the first
 * candidate wins ties). Returns the candidate and whether it reaches `minRatio`.
 */
export function pickTextColor(
  backgrounds: readonly Rgb[],
  candidates: readonly [Rgb, ...Rgb[]],
  minRatio: number = CONTRAST_BODY,
): { color: Rgb; ratio: number; ok: boolean } {
  let best = candidates[0];
  let bestRatio = worstContrast(best, backgrounds);
  for (const candidate of candidates) {
    const ratio = worstContrast(candidate, backgrounds);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return { color: best, ratio: bestRatio, ok: bestRatio >= minRatio };
}

/**
 * Moves the lightness of `color` away from `text` (darker when the text is light, lighter when
 * it is dark) in 1% steps, keeping hue and saturation, until the contrast reaches `minRatio`.
 * Returns the colour unchanged when it already passes, or the extreme reached.
 */
export function ensureContrast(color: Rgb, text: Rgb, minRatio: number): Rgb {
  if (contrastRatio(color, text) >= minRatio) return color;
  const hsl = toHsl(color);
  const darken = relativeLuminance(text) > relativeLuminance(color);
  let candidate = color;
  for (let step = 1; step <= 100; step += 1) {
    const l = darken ? hsl.l - step / 100 : hsl.l + step / 100;
    candidate = fromHsl({ ...hsl, l });
    if (contrastRatio(candidate, text) >= minRatio || l <= 0 || l >= 1) break;
  }
  return candidate;
}

/** Shortest angular distance between two hues, 0..180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
