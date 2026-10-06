import type { Artwork as ArtworkUrls } from '../../core/Song';

export type ArtworkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Outer square size in px for each size token. */
export const ARTWORK_PX: Readonly<Record<ArtworkSize, number>> = {
  xs: 32,
  sm: 48,
  md: 64,
  lg: 128,
  xl: 240,
};

/** Paper mat (paspartu) thickness in px, scaled with the print. */
export const MAT_PX: Readonly<Record<ArtworkSize, number>> = { xs: 2, sm: 3, md: 4, lg: 6, xl: 8 };

/** Picks the URL that best matches the rendered size, falling back to any available one. */
export function pickArtworkUrl(artwork: ArtworkUrls, size: ArtworkSize): string | undefined {
  const order: ReadonlyArray<keyof ArtworkUrls> =
    size === 'xs' || size === 'sm' || size === 'md'
      ? ['small', 'medium', 'large']
      : size === 'lg'
        ? ['medium', 'large', 'small']
        : ['large', 'medium', 'small'];
  for (const key of order) {
    const url = artwork[key];
    if (url) return url;
  }
  return undefined;
}
