import { useEffect, useState } from 'react';
import { samplePalette } from './samplePalette';
import type { CoverPalette } from './palette';

const cache = new Map<string, CoverPalette | null>();

interface Sampled {
  readonly url: string;
  readonly palette: CoverPalette | null;
}

/**
 * The palette of an artwork URL, or `null` (use the fallback palette) when there is no artwork or
 * sampling fails. While a new URL loads, the previous palette is kept so colours cross-fade
 * instead of flashing the fallback. Nothing is fetched while `enabled` is false. Results are
 * cached per URL.
 */
export function useCoverPalette(url: string | undefined, enabled = true): CoverPalette | null {
  const [sampled, setSampled] = useState<Sampled | null>(null);

  useEffect(() => {
    if (!enabled || url === undefined || cache.has(url)) return;
    let cancelled = false;
    void samplePalette(url).then((palette) => {
      cache.set(url, palette);
      if (!cancelled) setSampled({ url, palette });
    });
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  if (url === undefined) return null;
  if (cache.has(url)) return cache.get(url) ?? null;
  return sampled?.palette ?? null;
}

/** Forgets every cached palette. Only tests need this. */
export function clearCoverPaletteCache(): void {
  cache.clear();
}
