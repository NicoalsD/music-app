import { rankColors } from '../dominantColor';
import type { RankedColor } from '../dominantColor';
import {
  CONTRAST_BODY,
  ensureContrast,
  fromHex,
  fromHsl,
  hueDistance,
  mix,
  pickTextColor,
  toHex,
  toHsl,
  worstContrast,
} from './color';
import type { Rgb } from './color';

/** The three colours taken from a cover. */
export interface CoverPalette {
  readonly dominant: Rgb;
  readonly secondary: Rgb;
  readonly accent: Rgb;
}

/** Minimum hue gap for two colours to count as different inks. */
export const HUE_SEPARATION = 40;
/** Smaller gap accepted when the cover has no colour at `HUE_SEPARATION` (e.g. orange and gold). */
export const RELAXED_HUE_SEPARATION = 22;
/** Colours below this saturation have no useful hue. */
const CHROMATIC_SATURATION = 0.15;
/** A bucket must cover at least this share of the pixels to be considered. */
const MIN_SHARE = 0.02;
/** Contrast of the field against the text colour (headroom for the dimmed lyric lines). */
export const FIELD_CONTRAST = 7;

/** Theme tokens (`--ai`, `--shu`, `--jade`) used when a cover has no art or cannot be read. */
export const FALLBACK_PALETTE: CoverPalette = {
  dominant: fromHex('#22306a'),
  secondary: fromHex('#b4432e'),
  accent: fromHex('#6fa58c'),
};

const PAPER = fromHex('#f1eadb');
const PAPER_RAISED = fromHex('#f8f4ea');
const INK = fromHex('#1e1c22');

/** Whether two colours are different enough to be told apart as separate inks. */
export function isDistinct(a: Rgb, b: Rgb, gap: number = HUE_SEPARATION): boolean {
  const ha = toHsl(a);
  const hb = toHsl(b);
  const chromaticA = ha.s >= CHROMATIC_SATURATION;
  const chromaticB = hb.s >= CHROMATIC_SATURATION;
  if (chromaticA && chromaticB) return hueDistance(ha.h, hb.h) >= gap;
  if (chromaticA !== chromaticB) return true;
  return Math.abs(ha.l - hb.l) >= 0.25;
}

function rotated(rgb: Rgb, degrees: number): Rgb {
  const hsl = toHsl(rgb);
  return fromHsl({ h: hsl.h + degrees, s: Math.max(hsl.s, 0.4), l: hsl.l });
}

/**
 * Chooses dominant, secondary and accent from colours ranked best first. The secondary and the
 * accent are the best-ranked colours at least `HUE_SEPARATION` degrees (else
 * `RELAXED_HUE_SEPARATION`) away from the ones already chosen; when the cover has none, they are derived by rotating the dominant hue (or
 * taken from the fallback palette for greyscale covers). Returns `null` for no colours.
 */
export function selectPalette(ranked: readonly RankedColor[]): CoverPalette | null {
  const first = ranked[0];
  if (first === undefined) return null;
  const dominant = first.rgb;
  const pool = ranked.slice(1).filter((candidate) => candidate.share >= MIN_SHARE);
  const greyscale = toHsl(dominant).s < CHROMATIC_SATURATION;

  const pick = (chosen: readonly Rgb[]): Rgb | undefined => {
    for (const gap of [HUE_SEPARATION, RELAXED_HUE_SEPARATION]) {
      const found = pool.find((candidate) =>
        chosen.every((other) => isDistinct(candidate.rgb, other, gap)),
      );
      if (found !== undefined) return found.rgb;
    }
    return undefined;
  };
  const secondary =
    pick([dominant]) ?? (greyscale ? FALLBACK_PALETTE.secondary : rotated(dominant, 50));
  const accent =
    pick([dominant, secondary]) ?? (greyscale ? FALLBACK_PALETTE.accent : rotated(dominant, -50));
  return { dominant, secondary, accent };
}

/** Palette of RGBA pixel data (as from `getImageData`), or `null` when it has no usable colour. */
export function extractPalette(data: ArrayLike<number>): CoverPalette | null {
  return selectPalette(rankColors(data));
}

/** Flat colours for the Now Playing surface. Every colour is a `#rrggbb` string. */
export interface PrintTheme {
  /** `dark` when the text is paper-coloured. */
  readonly scheme: 'light' | 'dark';
  readonly field: string;
  readonly sun: string;
  readonly accent: string;
  readonly text: string;
  readonly textSoft: string;
  /** Tint of the translucent shoji panels. */
  readonly panel: string;
}

/**
 * Turns a cover palette into the colours of the page. The dominant colour is muted toward paper
 * (20%) so it reads as printed ink, then its lightness is moved until the text colour (ink or
 * paper, whichever contrasts more) reaches `FIELD_CONTRAST` against it. The sun and the wave are
 * moved until they keep 4.5:1 against the text, so text stays legible wherever it overlaps them.
 */
export function buildTheme(palette: CoverPalette | null): PrintTheme {
  const source = palette ?? FALLBACK_PALETTE;
  const muted = mix(source.dominant, PAPER, 0.2);
  const choice = pickTextColor([muted], [INK, PAPER_RAISED]);
  const text = choice.color;
  const field = ensureContrast(muted, text, FIELD_CONTRAST);
  const panel = mix(field, text, 0.1);

  // Secondary text: as soft as possible while still passing 4.5:1 over field and panel.
  let textSoft = text;
  for (let t = 0.3; t >= 0; t -= 0.05) {
    const candidate = mix(text, field, t);
    if (worstContrast(candidate, [field, panel]) >= CONTRAST_BODY) {
      textSoft = candidate;
      break;
    }
  }

  const saturate = (rgb: Rgb): Rgb => {
    const hsl = toHsl(rgb);
    return fromHsl({ ...hsl, s: Math.max(hsl.s, 0.35) });
  };
  const sun = ensureContrast(saturate(source.secondary), text, CONTRAST_BODY);
  const accent = ensureContrast(saturate(source.accent), text, CONTRAST_BODY);

  return {
    scheme: text === INK ? 'light' : 'dark',
    field: toHex(field),
    sun: toHex(sun),
    accent: toHex(accent),
    text: toHex(text),
    textSoft: toHex(textSoft),
    panel: toHex(panel),
  };
}

/** The custom properties set on the Now Playing root (registered in tokens.css). */
export function themeVars(theme: PrintTheme): Record<string, string> {
  return {
    '--np-field': theme.field,
    '--np-sun': theme.sun,
    '--np-accent': theme.accent,
    '--np-text': theme.text,
    '--np-text-soft': theme.textSoft,
    '--np-panel': theme.panel,
  };
}
