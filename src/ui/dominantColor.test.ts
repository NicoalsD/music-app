import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SUN_MAX_LIGHTNESS,
  SUN_MIN_LIGHTNESS,
  dominantColor,
  sampleSunColor,
  toSunColor,
} from './dominantColor';

/** RGBA data for `count` pixels of one colour. */
function pixels(count: number, r: number, g: number, b: number, a = 255): number[] {
  return Array.from({ length: count }, () => [r, g, b, a]).flat();
}

function lightnessOf(css: string): number {
  const match = /hsl\(\d+ \d+% (\d+)%\)/.exec(css);
  return Number(match?.[1]) / 100;
}

describe('dominantColor', () => {
  it('returns null for empty data and for fully transparent pixels', () => {
    expect(dominantColor([])).toBeNull();
    expect(dominantColor(pixels(10, 200, 30, 30, 0))).toBeNull();
  });

  it('ignores pure black and pure white pixels', () => {
    expect(dominantColor([...pixels(20, 0, 0, 0), ...pixels(20, 255, 255, 255)])).toBeNull();
  });

  it('averages the pixels of the winning bucket', () => {
    const data = [...pixels(5, 200, 40, 40), ...pixels(5, 204, 44, 44)];
    expect(dominantColor(data)).toEqual({ r: 202, g: 42, b: 42 });
  });

  it('prefers a vivid minority over a grey majority', () => {
    const data = [...pixels(30, 120, 120, 120), ...pixels(12, 30, 90, 200)];
    expect(dominantColor(data)).toEqual({ r: 30, g: 90, b: 200 });
  });

  it('picks the most frequent colour among equally vivid ones', () => {
    const data = [...pixels(3, 200, 30, 30), ...pixels(9, 30, 200, 30)];
    expect(dominantColor(data)).toEqual({ r: 30, g: 200, b: 30 });
  });

  it('falls back to a grey when nothing else is left', () => {
    expect(dominantColor(pixels(4, 120, 120, 120))).toEqual({ r: 120, g: 120, b: 120 });
  });

  it('ignores a trailing partial pixel', () => {
    expect(dominantColor([200, 40, 40])).toBeNull();
  });
});

describe('toSunColor', () => {
  it('keeps the hue and a mid-range lightness', () => {
    expect(toSunColor({ r: 180, g: 67, b: 46 })).toBe('hsl(9 59% 44%)');
  });

  it('lifts colours that are too dark and darkens ones that are too light', () => {
    expect(lightnessOf(toSunColor({ r: 10, g: 10, b: 40 }))).toBeCloseTo(SUN_MIN_LIGHTNESS, 2);
    expect(lightnessOf(toSunColor({ r: 250, g: 240, b: 200 }))).toBeCloseTo(SUN_MAX_LIGHTNESS, 2);
  });

  it('handles greys without a hue', () => {
    expect(toSunColor({ r: 128, g: 128, b: 128 })).toBe('hsl(0 0% 50%)');
  });

  it('covers every hue sector', () => {
    expect(toSunColor({ r: 50, g: 200, b: 60 })).toMatch(/^hsl\(12\d /);
    expect(toSunColor({ r: 40, g: 60, b: 200 })).toMatch(/^hsl\(23\d /);
  });
});

describe('sampleSunColor', () => {
  type Outcome = 'load' | 'error';

  /** Replaces `Image` so the test decides when and how an image settles. */
  function stubImage(outcome: Outcome) {
    const created: { crossOrigin: string; src: string }[] = [];
    class FakeImage {
      crossOrigin = '';
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      #src = '';
      get src(): string {
        return this.#src;
      }
      set src(value: string) {
        this.#src = value;
        created.push(this);
        queueMicrotask(() => (outcome === 'load' ? this.onload?.() : this.onerror?.()));
      }
    }
    vi.stubGlobal('Image', FakeImage);
    return created;
  }

  function stubCanvas(getImageData: () => { data: number[] }, nullContext = false) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
      nullContext ? null : { drawImage: vi.fn(), getImageData }) as never);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests the image with CORS and resolves the sun colour', async () => {
    const created = stubImage('load');
    stubCanvas(() => ({ data: pixels(8, 180, 67, 46) }));
    await expect(sampleSunColor('https://i.scdn.co/cover.jpg')).resolves.toBe('hsl(9 59% 44%)');
    expect(created[0]?.crossOrigin).toBe('anonymous');
  });

  it('resolves null when the image fails to load', async () => {
    stubImage('error');
    await expect(sampleSunColor('broken.jpg')).resolves.toBeNull();
  });

  it('resolves null when the canvas is tainted', async () => {
    stubImage('load');
    stubCanvas(() => {
      throw new DOMException('tainted', 'SecurityError');
    });
    await expect(sampleSunColor('tainted.jpg')).resolves.toBeNull();
  });

  it('resolves null without a 2d context or without usable pixels', async () => {
    stubImage('load');
    stubCanvas(() => ({ data: [] }), true);
    await expect(sampleSunColor('a.jpg')).resolves.toBeNull();
    vi.restoreAllMocks();
    stubCanvas(() => ({ data: pixels(4, 0, 0, 0) }));
    await expect(sampleSunColor('b.jpg')).resolves.toBeNull();
  });
});
