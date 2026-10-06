import { describe, expect, it, vi } from 'vitest';
import { Song } from '../core/Song';
import { makeTrack } from '../core/test-utils/fakes';
import { BrowserMediaSession } from './MediaSessionAdapter';
import type { MediaMetadataInit, MediaSessionLike } from './MediaSessionAdapter';

type Handler = ((details: { seekTime?: number | null }) => void) | null;

class FakeSession implements MediaSessionLike {
  metadata: unknown = null;
  playbackState: 'playing' | 'paused' | 'none' = 'none';
  readonly handlers = new Map<string, Handler>();
  position: unknown = null;
  setActionHandler(action: string, handler: Handler): void {
    this.handlers.set(action, handler);
  }
  setPositionState(state?: { duration: number; position: number; playbackRate: number }): void {
    this.position = state;
  }
}

function setup(): { session: FakeSession; adapter: BrowserMediaSession; made: MediaMetadataInit[] } {
  const session = new FakeSession();
  const made: MediaMetadataInit[] = [];
  const adapter = new BrowserMediaSession(session, (init) => {
    made.push(init);
    return { ...init };
  });
  return { session, adapter, made };
}

describe('BrowserMediaSession', () => {
  it('sets metadata with joined artists, album and every available artwork size', () => {
    const { session, adapter, made } = setup();
    const track = {
      ...makeTrack('a'),
      artists: ['One', 'Two'],
      album: { id: null, name: 'Record' },
      artwork: { small: 's.jpg', medium: 'm.jpg', large: 'l.jpg' },
    };
    adapter.setMetadata(new Song(track, 'e1'));
    expect(made).toEqual([
      {
        title: 'Title a',
        artist: 'One, Two',
        album: 'Record',
        artwork: [
          { src: 's.jpg', sizes: '64x64' },
          { src: 'm.jpg', sizes: '300x300' },
          { src: 'l.jpg', sizes: '640x640' },
        ],
      },
    ]);
    expect(session.metadata).toEqual(made[0]);
  });

  it('omits missing artwork and clears metadata with null', () => {
    const { session, adapter, made } = setup();
    adapter.setMetadata(new Song(makeTrack('a'), 'e1'));
    expect(made[0]?.artwork).toEqual([]);
    adapter.setMetadata(null);
    expect(session.metadata).toBeNull();
  });

  it('sets the playback state', () => {
    const { session, adapter } = setup();
    adapter.setPlaybackState('playing');
    expect(session.playbackState).toBe('playing');
  });

  it('sets the position state in seconds and clamps it', () => {
    const { session, adapter } = setup();
    adapter.setPositionState(1_500, 10_000);
    expect(session.position).toEqual({ duration: 10, position: 1.5, playbackRate: 1 });
    adapter.setPositionState(99_000, 10_000);
    expect(session.position).toEqual({ duration: 10, position: 10, playbackRate: 1 });
    adapter.setPositionState(-5, 10_000);
    expect(session.position).toEqual({ duration: 10, position: 0, playbackRate: 1 });
  });

  it('ignores an unknown duration', () => {
    const { session, adapter } = setup();
    adapter.setPositionState(100, 0);
    adapter.setPositionState(100, Number.NaN);
    expect(session.position).toBeNull();
  });

  it('registers action handlers and converts seekto to milliseconds', () => {
    const { session, adapter } = setup();
    const handlers = { play: vi.fn(), pause: vi.fn(), previoustrack: vi.fn(), nexttrack: vi.fn(), seekto: vi.fn() };
    adapter.setActionHandlers(handlers);
    session.handlers.get('play')?.({});
    session.handlers.get('pause')?.({});
    session.handlers.get('previoustrack')?.({});
    session.handlers.get('nexttrack')?.({});
    session.handlers.get('seekto')?.({ seekTime: 12.5 });
    session.handlers.get('seekto')?.({});
    for (const handler of [handlers.play, handlers.pause, handlers.previoustrack, handlers.nexttrack]) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
    expect(handlers.seekto).toHaveBeenCalledTimes(1);
    expect(handlers.seekto).toHaveBeenCalledWith(12_500);
  });

  it('clears handlers that are omitted', () => {
    const { session, adapter } = setup();
    adapter.setActionHandlers({});
    expect([...session.handlers.values()]).toEqual([null, null, null, null, null]);
  });

  it('is a no-op without navigator.mediaSession', () => {
    expect('mediaSession' in navigator).toBe(false);
    const adapter = new BrowserMediaSession();
    adapter.setMetadata(new Song(makeTrack('a'), 'e1'));
    adapter.setMetadata(null);
    adapter.setPlaybackState('paused');
    adapter.setPositionState(1, 2);
    adapter.setActionHandlers({ play: () => undefined });
    expect(adapter).toBeInstanceOf(BrowserMediaSession);
  });

  it('uses navigator.mediaSession and MediaMetadata when the browser provides them', () => {
    const session = new FakeSession();
    class FakeMediaMetadata {
      constructor(readonly init: MediaMetadataInit) {}
    }
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
    try {
      const adapter = new BrowserMediaSession();
      adapter.setMetadata(new Song(makeTrack('a'), 'e1'));
      expect(session.metadata).toBeInstanceOf(FakeMediaMetadata);
    } finally {
      Reflect.deleteProperty(navigator, 'mediaSession');
      vi.unstubAllGlobals();
    }
  });
});
