import type { Artwork, Track } from '../core/Song';

export interface ArtistSummary {
  readonly id: string;
  readonly name: string;
  readonly artwork: Artwork;
  readonly genres: readonly string[];
}

export interface AlbumSummary {
  readonly id: string;
  readonly name: string;
  readonly artists: readonly string[];
  readonly artwork: Artwork;
  readonly releaseYear: number | null;
  readonly totalTracks: number;
}

export interface AlbumDetail extends AlbumSummary {
  readonly tracks: readonly Track[];
}

export interface ArtistDetail extends ArtistSummary {
  readonly albums: readonly AlbumSummary[];
}

export type SearchType = 'track' | 'artist' | 'album';

export interface SearchQuery {
  readonly text: string;
  readonly types: readonly SearchType[];
  /** 0-based page; page size is fixed by the provider (10 for Spotify). */
  readonly page: number;
}

export interface SearchResults {
  readonly tracks: readonly Track[];
  readonly artists: readonly ArtistSummary[];
  readonly albums: readonly AlbumSummary[];
  readonly hasMore: boolean;
}

/** Strategy for a catalog source (Spotify). */
export interface MusicProvider {
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResults>;
  getAlbum(albumId: string, signal?: AbortSignal): Promise<AlbumDetail>;
  getArtist(artistId: string, signal?: AbortSignal): Promise<ArtistDetail>;
}
