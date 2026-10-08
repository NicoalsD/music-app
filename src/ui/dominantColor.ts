export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Pixels more transparent than this are ignored. */
const MIN_ALPHA = 125;
/** Colours this close to black or white carry no hue, so they never win. */
const MIN_CHANNEL_SPREAD = 24;
const BITS = 4;
const SHIFT = 8 - BITS;

/** Sun lightness range: keeps the translucent panel in front of it readable (>= 4.5:1). */
export const SUN_MIN_LIGHTNESS = 0.42;
export const SUN_MAX_LIGHTNESS = 0.68;

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
  weight: number;
}

/**
 * Picks the dominant colour of RGBA pixel data (as from `getImageData`).
 * Pixels are quantised to 4 bits per channel; each bucket scores by its pixel count times
 * the saturation of its colour, so a vivid minority beats a grey majority. Returns the average
 * of the winning bucket, or `null` when there is no coloured, opaque pixel.
 */
export function dominantColor(data: ArrayLike<number>): Rgb | null {
  const buckets = new Map<number, Bucket>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    if (a < MIN_ALPHA) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < MIN_CHANNEL_SPREAD && (max < 40 || min > 215)) continue;
    const key = ((r >> SHIFT) << (2 * BITS)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { count: 0, r: 0, g: 0, b: 0, weight: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    // Saturation in 0..1 (HSV), with a floor so greys can still win when nothing is vivid.
    bucket.weight += 0.15 + (max === 0 ? 0 : (max - min) / max);
  }
  let best: Bucket | null = null;
  for (const bucket of buckets.values()) {
    if (best === null || bucket.weight > best.weight) best = bucket;
  }
  if (best === null) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** A flat CSS colour for the sun: the hue of `rgb` with its lightness clamped to a safe range. */
export function toSunColor(rgb: Rgb): string {
  const { h, s, l } = rgbToHsl(rgb);
  const lightness = Math.min(SUN_MAX_LIGHTNESS, Math.max(SUN_MIN_LIGHTNESS, l));
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(lightness * 100)}%)`;
}

const SAMPLE_PX = 24;

/**
 * Loads `url` (CORS-enabled) into a tiny canvas and resolves the sun colour, or `null` when the
 * image fails to load, taints the canvas or has no usable colour.
 */
export function sampleSunColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_PX;
        canvas.height = SAMPLE_PX;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0, SAMPLE_PX, SAMPLE_PX);
        const rgb = dominantColor(context.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data);
        resolve(rgb === null ? null : toSunColor(rgb));
      } catch {
        // A tainted canvas throws a SecurityError: keep the fallback colour.
        resolve(null);
      }
    };
    image.src = url;
  });
}
