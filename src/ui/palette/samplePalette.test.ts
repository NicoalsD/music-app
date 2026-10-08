import { describe, expect, it, vi } from 'vitest';

const pixels = vi.hoisted(() => vi.fn<(url: string, size?: number) => Promise<unknown>>());
vi.mock('../dominantColor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dominantColor')>()),
  samplePixels: pixels,
}));

import { samplePalette } from './samplePalette';

describe('samplePalette', () => {
  it('is null when the image cannot be read', async () => {
    pixels.mockResolvedValue(null);
    expect(await samplePalette('x.jpg')).toBeNull();
  });

  it('is null when there is no usable colour', async () => {
    pixels.mockResolvedValue([0, 0, 0, 255]);
    expect(await samplePalette('x.jpg')).toBeNull();
  });

  it('extracts a palette from the sampled pixels', async () => {
    pixels.mockResolvedValue([200, 40, 40, 255, 200, 40, 40, 255]);
    const palette = await samplePalette('x.jpg');
    expect(palette?.dominant).toEqual({ r: 200, g: 40, b: 40 });
  });
});
