import type { Song } from '../core/Song';

export type MediaPlaybackState = 'playing' | 'paused' | 'none';

export interface MediaSessionHandlers {
  play(): void;
  pause(): void;
  previoustrack(): void;
  nexttrack(): void;
  seekto(positionMs: number): void;
}

/** Bridges the engine to OS-level media controls (lock screen, media keys). */
export interface MediaSessionAdapter {
  setMetadata(song: Song | null): void;
  setPlaybackState(state: MediaPlaybackState): void;
  setPositionState(positionMs: number, durationMs: number): void;
  /** Handlers that are omitted are cleared. */
  setActionHandlers(handlers: Partial<MediaSessionHandlers>): void;
}

/** The subset of the browser MediaSession that the adapter uses. */
export interface MediaSessionLike {
  metadata: unknown;
  playbackState: MediaPlaybackState;
  setActionHandler(
    action: 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto',
    handler: ((details: { seekTime?: number | null }) => void) | null,
  ): void;
  setPositionState(state?: { duration: number; position: number; playbackRate: number }): void;
}

export interface MediaMetadataInit {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string; sizes: string }[];
}

type MetadataFactory = (init: MediaMetadataInit) => unknown;

function browserSession(): MediaSessionLike | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}

function browserMetadataFactory(init: MediaMetadataInit): unknown {
  return new MediaMetadata(init);
}

/** MediaSessionAdapter over navigator.mediaSession; a no-op when it is missing. */
export class BrowserMediaSession implements MediaSessionAdapter {
  readonly #session: MediaSessionLike | null;
  readonly #createMetadata: MetadataFactory;

  constructor(
    session: MediaSessionLike | null = browserSession(),
    createMetadata: MetadataFactory = browserMetadataFactory,
  ) {
    this.#session = session;
    this.#createMetadata = createMetadata;
  }

  setMetadata(song: Song | null): void {
    if (this.#session === null) return;
    if (song === null) {
      this.#session.metadata = null;
      return;
    }
    const artwork: MediaMetadataInit['artwork'] = [];
    if (song.artwork.small !== undefined) artwork.push({ src: song.artwork.small, sizes: '64x64' });
    if (song.artwork.medium !== undefined) artwork.push({ src: song.artwork.medium, sizes: '300x300' });
    if (song.artwork.large !== undefined) artwork.push({ src: song.artwork.large, sizes: '640x640' });
    this.#session.metadata = this.#createMetadata({
      title: song.title,
      artist: song.artists.join(', '),
      album: song.album.name,
      artwork,
    });
  }

  setPlaybackState(state: MediaPlaybackState): void {
    if (this.#session === null) return;
    this.#session.playbackState = state;
  }

  setPositionState(positionMs: number, durationMs: number): void {
    if (this.#session === null) return;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const position = Math.min(Math.max(positionMs, 0), durationMs);
    this.#session.setPositionState({ duration: durationMs / 1000, position: position / 1000, playbackRate: 1 });
  }

  setActionHandlers(handlers: Partial<MediaSessionHandlers>): void {
    const session = this.#session;
    if (session === null) return;
    const { play, pause, previoustrack, nexttrack, seekto } = handlers;
    session.setActionHandler('play', play === undefined ? null : () => play());
    session.setActionHandler('pause', pause === undefined ? null : () => pause());
    session.setActionHandler('previoustrack', previoustrack === undefined ? null : () => previoustrack());
    session.setActionHandler('nexttrack', nexttrack === undefined ? null : () => nexttrack());
    session.setActionHandler(
      'seekto',
      seekto === undefined
        ? null
        : (details) => {
            if (typeof details.seekTime === 'number') seekto(details.seekTime * 1000);
          },
    );
  }
}
