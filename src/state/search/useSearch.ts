import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '../../core/Song';
import type {
  AlbumSummary,
  ArtistSummary,
  MusicProvider,
  SearchResults,
  SearchType,
} from '../../providers/MusicProvider';

export const SEARCH_DEBOUNCE_MS = 300;

export type SearchFilter = 'all' | 'songs' | 'artists' | 'albums';
export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

const TYPES_BY_FILTER: Readonly<Record<SearchFilter, readonly SearchType[]>> = {
  all: ['track', 'artist', 'album'],
  songs: ['track'],
  artists: ['artist'],
  albums: ['album'],
};

interface Loaded {
  /** `${filter}:${text}` the data belongs to; a mismatch with the live query means "loading". */
  readonly key: string;
  readonly failed: boolean;
  readonly tracks: readonly Track[];
  readonly artists: readonly ArtistSummary[];
  readonly albums: readonly AlbumSummary[];
  readonly hasMore: boolean;
  readonly page: number;
}

export interface UseSearchResult {
  text: string;
  setText: (text: string) => void;
  filter: SearchFilter;
  setFilter: (filter: SearchFilter) => void;
  status: SearchStatus;
  tracks: readonly Track[];
  artists: readonly ArtistSummary[];
  albums: readonly AlbumSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function mergeById<T extends { readonly id: string }>(
  current: readonly T[],
  extra: readonly T[],
): readonly T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...extra.filter((item) => !seen.has(item.id))];
}

function toLoaded(key: string, results: SearchResults, page: number): Loaded {
  return { key, failed: false, ...results, page };
}

/** Debounced search with cancellation of superseded requests, filters and "load more". */
export function useSearch(
  provider: MusicProvider,
  debounceMs: number = SEARCH_DEBOUNCE_MS,
): UseSearchResult {
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null);
  const moreController = useRef<AbortController | null>(null);

  const trimmed = text.trim();
  const key = `${filter}:${trimmed}`;

  useEffect(() => {
    if (trimmed === '') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      provider
        .search({ text: trimmed, types: TYPES_BY_FILTER[filter], page: 0 }, controller.signal)
        .then(
          (results) => {
            if (!controller.signal.aborted) setLoaded(toLoaded(key, results, 0));
          },
          (error: unknown) => {
            if (controller.signal.aborted || isAbort(error)) return;
            setLoaded({
              key,
              failed: true,
              tracks: [],
              artists: [],
              albums: [],
              hasMore: false,
              page: 0,
            });
          },
        );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
      moreController.current?.abort();
    };
  }, [provider, trimmed, filter, key, debounceMs, attempt]);

  const current = loaded !== null && loaded.key === key ? loaded : null;

  const loadMore = useCallback(() => {
    if (current === null || current.failed || !current.hasMore) return;
    moreController.current?.abort();
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMoreKey(key);
    const page = current.page + 1;
    provider
      .search({ text: trimmed, types: TYPES_BY_FILTER[filter], page }, controller.signal)
      .then(
        (results) => {
          if (controller.signal.aborted) return;
          setLoadingMoreKey(null);
          setLoaded({
            key,
            failed: false,
            tracks: [...current.tracks, ...results.tracks],
            artists: mergeById(current.artists, results.artists),
            albums: mergeById(current.albums, results.albums),
            hasMore: results.hasMore,
            page,
          });
        },
        (error: unknown) => {
          if (controller.signal.aborted || isAbort(error)) return;
          setLoadingMoreKey(null);
        },
      );
  }, [current, key, provider, trimmed, filter]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let status: SearchStatus;
  if (trimmed === '') status = 'idle';
  else if (current === null) status = 'loading';
  else if (current.failed) status = 'error';
  else if (current.tracks.length + current.artists.length + current.albums.length === 0)
    status = 'empty';
  else status = 'success';

  return {
    text,
    setText,
    filter,
    setFilter,
    status,
    tracks: current?.tracks ?? [],
    artists: current?.artists ?? [],
    albums: current?.albums ?? [],
    hasMore: current?.hasMore ?? false,
    loadingMore: loadingMoreKey === key,
    loadMore,
    retry,
  };
}
