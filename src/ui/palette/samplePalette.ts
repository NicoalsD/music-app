import { samplePixels } from '../dominantColor';
import { extractPalette } from './palette';
import type { CoverPalette } from './palette';

const PALETTE_SAMPLE_PX = 32;

/**
 * Resolves the three-colour palette of the image at `url`, or `null` when it fails to load,
 * taints the canvas (CORS) or has no usable colour.
 */
export async function samplePalette(url: string): Promise<CoverPalette | null> {
  const data = await samplePixels(url, PALETTE_SAMPLE_PX);
  return data === null ? null : extractPalette(data);
}
