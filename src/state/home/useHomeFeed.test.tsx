import { act, renderHook, waitFor } from '@testing-library/react';
import { FakeClock, makeTrack } from '../../core/test-utils/fakes';
import type { Track } from '../../core/Song';
import type { ArtistSummary } from '../../providers/MusicProvider';
import type { FeedResult, PersonalFeedProvider } from '../../providers/PersonalFeedProvider';
import { FEED_CACHE_TTL_MS, useHomeFeed } from './useHomeFeed';

const ready = <T,>(...items: T[]): FeedResult<T> => ({ status: 'ready', items });

class FakeFeed implements PersonalFeedProvider {
  recent: (signal?: AbortSignal) => Promise<FeedResult<Track>> = () =>
    Promise.resolve(ready(makeTrack('r')));
  top: (signal?: AbortSignal) => Promise<FeedResult<Track>> = () =>
    Promise.resolve(ready(makeTrack('t')));
  artists: (signal?: AbortSignal) => Promise<FeedResult<ArtistSummary>> = () =>
    Promise.resolve(ready({ id: 'ar', name: 'Ar', artwork: {}, genres: [] }));
  saved: (signal?: AbortSignal) => Promise<FeedResult<Track>> = () =>
    Promise.resolve(ready(makeTrack('s')));
  calls = 0;
  topTracks(_range: string, signal?: AbortSignal) {
    this.calls += 1;
    return this.top(signal);
  }
  topArtists(_range: string, signal?: AbortSignal) {
    return this.artists(signal);
  }
  recentlyPlayed(signal?: AbortSignal) {
    return this.recent(signal);
  }
  savedTracks(signal?: AbortSignal) {
    return this.saved(signal);
  }
}

describe('useHomeFeed', () => {
  it('requests nothing while logged out', () => {
    const feed = new FakeFeed();
    const { result } = renderHook(() => useHomeFeed(feed, false, new FakeClock()));
    expect(result.current.recent.status).toBe('idle');
    expect(feed.calls).toBe(0);
  });

  it('requests nothing without a provider', () => {
    const { result } = renderHook(() => useHomeFeed(null, true, new FakeClock()));
    expect(result.current.saved.status).toBe('idle');
  });

  it('loads the four sections and reports loading first', async () => {
    const feed = new FakeFeed();
    const { result } = renderHook(() => useHomeFeed(feed, true, new FakeClock()));
    expect(result.current.recent.status).toBe('loading');
    await waitFor(() => expect(result.current.saved.status).toBe('ready'));
    expect(result.current.recent.items[0]?.trackId).toBe('r');
    expect(result.current.topTracks.items[0]?.trackId).toBe('t');
    expect(result.current.topArtists.items[0]?.id).toBe('ar');
  });

  it('maps empty, unavailable and needsReconnect results per section', async () => {
    const feed = new FakeFeed();
    feed.recent = () => Promise.resolve(ready<Track>());
    feed.top = () => Promise.resolve({ status: 'unavailable' });
    feed.saved = () => Promise.resolve({ status: 'needsReconnect' });
    const { result } = renderHook(() => useHomeFeed(feed, true, new FakeClock()));
    await waitFor(() => expect(result.current.saved.status).toBe('needsReconnect'));
    expect(result.current.recent.status).toBe('empty');
    expect(result.current.topTracks.status).toBe('unavailable');
    expect(result.current.topArtists.status).toBe('ready');
  });

  it('isolates a failing section and retries it', async () => {
    const feed = new FakeFeed();
    let fail = true;
    feed.saved = () =>
      fail ? Promise.reject(new Error('boom')) : Promise.resolve(ready(makeTrack('s')));
    const { result } = renderHook(() => useHomeFeed(feed, true, new FakeClock()));
    await waitFor(() => expect(result.current.saved.status).toBe('error'));
    expect(result.current.recent.status).toBe('ready');
    fail = false;
    act(() => result.current.saved.retry());
    expect(result.current.saved.status).toBe('loading');
    await waitFor(() => expect(result.current.saved.status).toBe('ready'));
  });

  it('aborts in-flight requests on unmount and ignores their outcome', async () => {
    const feed = new FakeFeed();
    let signal: AbortSignal | undefined;
    feed.recent = (s) => {
      signal = s;
      return new Promise(() => undefined);
    };
    const { unmount } = renderHook(() => useHomeFeed(feed, true, new FakeClock()));
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('ignores a late rejection after an abort', async () => {
    const feed = new FakeFeed();
    let rejectLate: (reason: unknown) => void = () => undefined;
    feed.recent = () =>
      new Promise((_resolve, reject) => {
        rejectLate = reject;
      });
    const { unmount } = renderHook(() => useHomeFeed(feed, true, new FakeClock()));
    unmount();
    rejectLate(new DOMException('Aborted', 'AbortError'));
    await Promise.resolve();
  });

  it('reuses the cache within the TTL and refetches after it', async () => {
    const feed = new FakeFeed();
    const clock = new FakeClock();
    const first = renderHook(() => useHomeFeed(feed, true, clock));
    await waitFor(() => expect(first.result.current.topTracks.status).toBe('ready'));
    first.unmount();
    expect(feed.calls).toBe(1);

    const second = renderHook(() => useHomeFeed(feed, true, clock));
    expect(second.result.current.topTracks.status).toBe('ready');
    second.unmount();
    expect(feed.calls).toBe(1);

    clock.time += FEED_CACHE_TTL_MS;
    const third = renderHook(() => useHomeFeed(feed, true, clock));
    expect(third.result.current.topTracks.status).toBe('loading');
    await waitFor(() => expect(third.result.current.topTracks.status).toBe('ready'));
    expect(feed.calls).toBe(2);
  });

  it('does not cache a reconnect request', async () => {
    const feed = new FakeFeed();
    feed.top = () => Promise.resolve({ status: 'needsReconnect' });
    const clock = new FakeClock();
    const first = renderHook(() => useHomeFeed(feed, true, clock));
    await waitFor(() => expect(first.result.current.topTracks.status).toBe('needsReconnect'));
    first.unmount();
    const second = renderHook(() => useHomeFeed(feed, true, clock));
    expect(second.result.current.topTracks.status).toBe('loading');
    await waitFor(() => expect(second.result.current.topTracks.status).toBe('needsReconnect'));
    expect(feed.calls).toBe(2);
  });

  it('forgets cached data on logout', async () => {
    const feed = new FakeFeed();
    const clock = new FakeClock();
    const { result, rerender } = renderHook(({ loggedIn }) => useHomeFeed(feed, loggedIn, clock), {
      initialProps: { loggedIn: true },
    });
    await waitFor(() => expect(result.current.topTracks.status).toBe('ready'));
    rerender({ loggedIn: false });
    expect(result.current.topTracks.status).toBe('idle');
    rerender({ loggedIn: true });
    expect(result.current.topTracks.status).toBe('loading');
    await waitFor(() => expect(result.current.topTracks.status).toBe('ready'));
    expect(feed.calls).toBe(2);
  });
});
