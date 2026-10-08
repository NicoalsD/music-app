import { STORAGE_KEY } from '../state/persistence';
import { createApp } from './createApp';
import type { Notifier } from '../state/PlayerStore';
import { makeTrack } from '../core/test-utils/fakes';

function fakeNotifier(): Notifier & { errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    notify: () => undefined,
    error: (m) => void errors.push(m),
    undo: () => undefined,
  };
}

describe('createApp', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    // jsdom does not implement media playback.
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('wires a working store with the default playlist and starts without a session', async () => {
    const app = createApp(fakeNotifier());
    await app.start();
    const snapshot = app.store.getSnapshot();
    expect(snapshot.playlists.map((p) => p.name)).toEqual(['Mi lista']);
    expect(snapshot.spotify.auth).toBe('logged-out');
    expect(typeof app.lyricsProvider.find).toBe('function');
    app.dispose();
  });

  it('persists changes and restores them in the next app instance', () => {
    vi.useFakeTimers();
    const first = createApp(fakeNotifier());
    first.store.addLast({ ...makeTrack('s'), source: 'spotify', uri: 'spotify:track:s' });
    first.dispose();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    const second = createApp(fakeNotifier());
    expect(second.store.getSnapshot().songs.map((s) => s.title)).toEqual(['Title s']);
    second.dispose();
    vi.useRealTimers();
  });

  it('reports a failed Spotify redirect instead of throwing', async () => {
    const notifier = fakeNotifier();
    window.history.replaceState(null, '', '/?code=abc&state=bad');
    const app = createApp(notifier);
    await app.start();
    expect(notifier.errors).toHaveLength(1);
    app.dispose();
  });

  it('flushes the pending save when the page is hidden', () => {
    vi.useFakeTimers();
    const app = createApp(fakeNotifier());
    app.store.addLast(makeTrack('a'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    window.localStorage.clear();
    app.store.addLast(makeTrack('b'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    app.dispose();
    vi.useRealTimers();
  });
});
