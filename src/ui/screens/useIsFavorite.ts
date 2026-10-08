import { usePlayerSnapshot } from '../../state';

/** True while the track is in Favoritos. Re-renders only when that answer changes. */
export function useIsFavorite(trackId: string): boolean {
  return usePlayerSnapshot((s) => s.favoriteTrackIds.has(trackId));
}
