import { act, renderHook } from '@testing-library/react';
import { makeTrack } from '../../core/test-utils/fakes';
import type { AlbumDetail, ArtistDetail, SearchResults } from '../../providers/MusicProvider';
import { FakeProvider } from '../test-utils/harness';
import { SEARCH_DEBOUNCE_MS, useSearch } from './useSearch';
import { useAlbum, useArtist } from './useCatalogEntity';

const results = (ids: string[], hasMore = false): SearchResults => ({
  tracks: ids.map((id) => makeTrack(id)),
  artists: [],
  albums: [],
  hasMore,
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays idle without text and never calls the provider', async () => {
    const provider = new FakeProvider();
    const { result } = renderHook(() => useSearch(provider));
    await advance(1000);
    expect(result.current.status).toBe('idle');
    expect(provider.searches).toHaveLength(0);
    act(() => result.current.setText('   '));
    await advance(1000);
    expect(provider.searches).toHaveLength(0);
  });

  it('debounces typing into a single request', async () => {
    const provider = new FakeProvider();
    provider.searchImpl = () => Promise.resolve(results(['a']));
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('b'));
    await advance(100);
    act(() => result.current.setText('be'));
    await advance(100);
    act(() => result.current.setText('bea'));
    expect(result.current.status).toBe('loading');
    await advance(SEARCH_DEBOUNCE_MS - 1);
    expect(provider.searches).toHaveLength(0);
    await advance(1);
    expect(provider.searches).toEqual([
      { text: 'bea', types: ['track', 'artist', 'album'], page: 0 },
    ]);
    expect(result.current.status).toBe('success');
    expect(result.current.tracks.map((t) => t.trackId)).toEqual(['a']);
  });

  it('aborts the superseded request and ignores its late answer', async () => {
    const provider = new FakeProvider();
    const signals: AbortSignal[] = [];
    const resolvers: ((r: SearchResults) => void)[] = [];
    provider.searchImpl = (_q, signal) => {
      if (signal) signals.push(signal);
      return new Promise<SearchResults>((resolve) => resolvers.push(resolve));
    };
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('one'));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.setText('two'));
    expect(signals[0]?.aborted).toBe(true);
    await advance(SEARCH_DEBOUNCE_MS);
    await act(async () => {
      resolvers[0]?.(results(['old']));
      resolvers[1]?.(results(['new']));
      await Promise.resolve();
    });
    expect(result.current.tracks.map((t) => t.trackId)).toEqual(['new']);
  });

  it('maps filters to provider types and re-runs the search', async () => {
    const provider = new FakeProvider();
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('x'));
    await advance(SEARCH_DEBOUNCE_MS);
    for (const [filter, types] of [
      ['songs', ['track']],
      ['artists', ['artist']],
      ['albums', ['album']],
    ] as const) {
      act(() => result.current.setFilter(filter));
      await advance(SEARCH_DEBOUNCE_MS);
      expect(provider.searches.at(-1)?.types).toEqual(types);
    }
  });

  it('reports empty, error and retries', async () => {
    const provider = new FakeProvider();
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('zzz'));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.status).toBe('empty');

    provider.searchImpl = () => Promise.reject(new Error('net'));
    act(() => result.current.setText('zzzz'));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.status).toBe('error');

    provider.searchImpl = () => Promise.resolve(results(['ok']));
    act(() => result.current.retry());
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.status).toBe('success');
  });

  it('ignores AbortError rejections', async () => {
    const provider = new FakeProvider();
    provider.searchImpl = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    };
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('q'));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.status).toBe('loading');
  });

  it('pages with load more, appending and de-duplicating', async () => {
    const provider = new FakeProvider();
    provider.searchImpl = (query) =>
      Promise.resolve(
        query.page === 0
          ? {
              tracks: [makeTrack('a')],
              artists: [{ id: 'r1', name: 'R1', artwork: {}, genres: [] }],
              albums: [],
              hasMore: true,
            }
          : {
              tracks: [makeTrack('b')],
              artists: [{ id: 'r1', name: 'R1', artwork: {}, genres: [] }],
              albums: [
                {
                  id: 'l1',
                  name: 'L1',
                  artists: [],
                  artwork: {},
                  releaseYear: 2000,
                  totalTracks: 3,
                },
              ],
              hasMore: false,
            },
      );
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('x'));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await advance(0);
    expect(provider.searches.at(-1)?.page).toBe(1);
    expect(result.current.tracks.map((t) => t.trackId)).toEqual(['a', 'b']);
    expect(result.current.artists).toHaveLength(1);
    expect(result.current.albums).toHaveLength(1);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    act(() => result.current.loadMore());
    await advance(0);
    expect(provider.searches).toHaveLength(2);
  });

  it('keeps results when loading more fails', async () => {
    const provider = new FakeProvider();
    provider.searchImpl = (query) =>
      query.page === 0 ? Promise.resolve(results(['a'], true)) : Promise.reject(new Error('net'));
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('x'));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.loadMore());
    await advance(0);
    expect(result.current.status).toBe('success');
    expect(result.current.loadingMore).toBe(false);
  });

  it('aborts an in-flight load more when the query changes', async () => {
    const provider = new FakeProvider();
    let moreSignal: AbortSignal | undefined;
    provider.searchImpl = (query, signal) => {
      if (query.page === 0) return Promise.resolve(results(['a'], true));
      moreSignal = signal;
      return new Promise<SearchResults>(() => undefined);
    };
    const { result } = renderHook(() => useSearch(provider));
    act(() => result.current.setText('x'));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.loadMore());
    act(() => result.current.setText('xy'));
    expect(moreSignal?.aborted).toBe(true);
  });
});

describe('useAlbum and useArtist', () => {
  const album: AlbumDetail = {
    id: 'al',
    name: 'Album',
    artists: ['A'],
    artwork: {},
    releaseYear: 1999,
    totalTracks: 1,
    tracks: [makeTrack('t')],
  };
  const artist: ArtistDetail = {
    id: 'ar',
    name: 'Artist',
    artwork: {},
    genres: ['jazz'],
    albums: [],
  };

  it('loads an album and reloads when the id changes', async () => {
    const provider = new FakeProvider();
    provider.albumImpl = (id) => Promise.resolve({ ...album, id });
    const { result, rerender } = renderHook(({ id }) => useAlbum(provider, id), {
      initialProps: { id: 'a1' },
    });
    expect(result.current.status).toBe('loading');
    await act(async () => undefined);
    expect(result.current.status).toBe('success');
    expect(result.current.data?.id).toBe('a1');
    rerender({ id: 'a2' });
    expect(result.current.status).toBe('loading');
    await act(async () => undefined);
    expect(result.current.data?.id).toBe('a2');
  });

  it('reports errors and retries', async () => {
    const provider = new FakeProvider();
    provider.artistImpl = () => Promise.reject(new Error('net'));
    const { result } = renderHook(() => useArtist(provider, 'ar'));
    await act(async () => undefined);
    expect(result.current.status).toBe('error');
    provider.artistImpl = () => Promise.resolve(artist);
    act(() => result.current.retry());
    await act(async () => undefined);
    expect(result.current.status).toBe('success');
    expect(result.current.data?.name).toBe('Artist');
  });

  it('ignores aborted requests', async () => {
    const provider = new FakeProvider();
    provider.albumImpl = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    };
    const { result } = renderHook(() => useAlbum(provider, 'x'));
    await act(async () => undefined);
    expect(result.current.status).toBe('loading');
  });
});
