import { useEffect, useState } from 'react';
import { sampleSunColor } from './dominantColor';

const cache = new Map<string, string | null>();

interface Sampled {
  readonly url: string;
  readonly color: string | null;
}

/**
 * The sun colour for an artwork URL, or `null` (use the --shu fallback) while it loads, when
 * there is no artwork, or when sampling fails. Results are cached per URL.
 */
export function useSunColor(url: string | undefined): string | null {
  const [sampled, setSampled] = useState<Sampled | null>(null);

  useEffect(() => {
    if (url === undefined || cache.has(url)) return;
    let cancelled = false;
    void sampleSunColor(url).then((color) => {
      cache.set(url, color);
      if (!cancelled) setSampled({ url, color });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (url === undefined) return null;
  if (cache.has(url)) return cache.get(url) ?? null;
  return sampled !== null && sampled.url === url ? sampled.color : null;
}
