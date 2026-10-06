import { useCallback, useEffect, useState } from 'react';
import type { AlbumDetail, ArtistDetail, MusicProvider } from '../../providers/MusicProvider';

export type EntityStatus = 'loading' | 'success' | 'error';

export interface EntityState<T> {
  status: EntityStatus;
  data: T | null;
  retry: () => void;
}

interface Loaded<T> {
  readonly key: string;
  readonly data: T | null;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function useEntity<T>(
  id: string,
  attempt: number,
  fetchEntity: (signal: AbortSignal) => Promise<T>,
  retry: () => void,
): EntityState<T> {
  const key = `${id}:${attempt}`;
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEntity(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setLoaded({ key, data });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setLoaded({ key, data: null });
      },
    );
    return () => controller.abort();
  }, [key, fetchEntity]);

  if (loaded === null || loaded.key !== key) return { status: 'loading', data: null, retry };
  return loaded.data === null
    ? { status: 'error', data: null, retry }
    : { status: 'success', data: loaded.data, retry };
}

/** Loads one album with its tracks. */
export function useAlbum(provider: MusicProvider, albumId: string): EntityState<AlbumDetail> {
  const [attempt, setAttempt] = useState(0);
  const fetchAlbum = useCallback(
    (signal: AbortSignal) => provider.getAlbum(albumId, signal),
    [provider, albumId],
  );
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return useEntity(albumId, attempt, fetchAlbum, retry);
}

/** Loads one artist with their albums. */
export function useArtist(provider: MusicProvider, artistId: string): EntityState<ArtistDetail> {
  const [attempt, setAttempt] = useState(0);
  const fetchArtist = useCallback(
    (signal: AbortSignal) => provider.getArtist(artistId, signal),
    [provider, artistId],
  );
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return useEntity(artistId, attempt, fetchArtist, retry);
}
