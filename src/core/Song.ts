import type { IdGenerator } from './ports';

export type SongSource = 'spotify' | 'local';

export interface Artwork {
  /** ~64px, for list rows. */
  readonly small?: string;
  /** ~300px, for search results. */
  readonly medium?: string;
  /** ~640px, for the now-playing view. */
  readonly large?: string;
}

/** Track metadata as returned by a provider, before it enters a playlist. */
export interface Track {
  readonly trackId: string;
  readonly source: SongSource;
  /** spotify:track:… for Spotify, blob: URL for local files. */
  readonly uri: string;
  readonly title: string;
  readonly artists: readonly string[];
  readonly album: { readonly id: string | null; readonly name: string };
  readonly durationMs: number;
  readonly artwork: Artwork;
  readonly explicit: boolean;
  readonly externalUrl: string | null;
}

/**
 * A playlist entry. The same Track can be added many times; each entry
 * gets its own entryId so duplicates are independent.
 */
export class Song implements Track {
  readonly entryId: string;
  readonly trackId: string;
  readonly source: SongSource;
  readonly uri: string;
  readonly title: string;
  readonly artists: readonly string[];
  readonly album: { readonly id: string | null; readonly name: string };
  readonly durationMs: number;
  readonly artwork: Artwork;
  readonly explicit: boolean;
  readonly externalUrl: string | null;

  constructor(track: Track, entryId: string) {
    this.entryId = entryId;
    this.trackId = track.trackId;
    this.source = track.source;
    this.uri = track.uri;
    this.title = track.title;
    this.artists = [...track.artists];
    this.album = { ...track.album };
    this.durationMs = track.durationMs;
    this.artwork = { ...track.artwork };
    this.explicit = track.explicit;
    this.externalUrl = track.externalUrl;
  }

  static fromTrack(track: Track, ids: IdGenerator): Song {
    return new Song(track, ids.next());
  }

  get artistLabel(): string {
    return this.artists.join(', ');
  }
}
