import { InvalidOperationError } from '../core/errors';
import type { Track } from '../core/Song';
import type {
  AlbumDetail,
  ArtistDetail,
  MusicProvider,
  SearchQuery,
  SearchResults,
  SearchType,
} from './MusicProvider';
import { SpotifyResponseError } from './SpotifyApiClient';
import type { RequestOptions } from './SpotifyApiClient';
import {
  isRecord,
  mapAlbumSummary,
  mapArtistSummary,
  mapTrack,
  parseAlbum,
  parseArtist,
  parsePage,
  parseTrack,
} from './spotifyMapping';
import type { RawAlbum, RawArtist, RawPage, RawTrack } from './spotifyMapping';

export const SEARCH_PAGE_SIZE = 10;
export const ALBUM_TRACKS_PAGE_SIZE = 50;
const TYPE_ORDER: readonly SearchType[] = ['track', 'artist', 'album'];

/** What the provider needs from the API client. */
export interface SpotifyRequester {
  request<T>(path: string, options: RequestOptions<T>): Promise<T>;
}

interface SearchPayload {
  readonly tracks: RawPage<RawTrack> | null;
  readonly artists: RawPage<RawArtist> | null;
  readonly albums: RawPage<RawAlbum> | null;
}

interface AlbumPayload {
  readonly album: RawAlbum;
  readonly tracks: RawPage<RawTrack>;
}

function section<T>(
  record: Record<string, unknown>,
  key: string,
  parseItem: (item: unknown) => T | null,
): { ok: boolean; page: RawPage<T> | null } {
  if (record[key] === undefined) return { ok: true, page: null };
  const page = parsePage(record[key], parseItem);
  return { ok: page !== null, page };
}

type Body = Record<string, unknown>;

function parseSearch(value: Body): SearchPayload | null {
  const tracks = section(value, 'tracks', parseTrack);
  const artists = section(value, 'artists', parseArtist);
  const albums = section(value, 'albums', parseAlbum);
  if (!tracks.ok || !artists.ok || !albums.ok) return null;
  return { tracks: tracks.page, artists: artists.page, albums: albums.page };
}

function parseAlbumPayload(value: Body): AlbumPayload | null {
  const album = parseAlbum(value);
  const tracks = parsePage(value['tracks'], parseTrack);
  return album === null || tracks === null ? null : { album, tracks };
}

// Guards validate the raw body; the provider then parses it again into typed values.
const isSearchBody = (value: unknown): value is Body => isRecord(value) && parseSearch(value) !== null;
const isAlbumBody = (value: unknown): value is Body => isRecord(value) && parseAlbumPayload(value) !== null;
const isArtistBody = (value: unknown): value is Body => parseArtist(value) !== null;
function pageGuard<T>(parseItem: (item: unknown) => T | null): (value: unknown) => value is Body {
  return (value): value is Body => isRecord(value) && parsePage(value, parseItem) !== null;
}

/** MusicProvider backed by the Spotify Web API. */
export class SpotifyProvider implements MusicProvider {
  readonly #client: SpotifyRequester;

  constructor(client: SpotifyRequester) {
    this.#client = client;
  }

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResults> {
    const text = query.text.trim();
    const types = TYPE_ORDER.filter((type) => query.types.includes(type));
    if (text === '' || types.length === 0) return { tracks: [], artists: [], albums: [], hasMore: false };
    if (!Number.isInteger(query.page) || query.page < 0) {
      throw new InvalidOperationError(`Invalid search page ${query.page}`);
    }
    const params = new URLSearchParams({
      q: text,
      type: types.join(','),
      limit: String(SEARCH_PAGE_SIZE),
      offset: String(query.page * SEARCH_PAGE_SIZE),
    });
    const body = await this.#get(`/v1/search?${params.toString()}`, isSearchBody, signal);
    const payload = parseSearch(body);
    if (payload === null) throw new SpotifyResponseError('Unexpected search payload');

    const tracks = this.#require(types.includes('track'), payload.tracks, 'tracks');
    const artists = this.#require(types.includes('artist'), payload.artists, 'artists');
    const albums = this.#require(types.includes('album'), payload.albums, 'albums');
    return {
      tracks: (tracks?.items ?? []).map((raw) => mapTrack(raw, null)),
      artists: (artists?.items ?? []).map(mapArtistSummary),
      albums: (albums?.items ?? []).map(mapAlbumSummary),
      hasMore: [tracks, artists, albums].some((page) => page !== null && page.next !== null),
    };
  }

  async getAlbum(albumId: string, signal?: AbortSignal): Promise<AlbumDetail> {
    const id = encodeURIComponent(albumId);
    const body = await this.#get(`/v1/albums/${id}`, isAlbumBody, signal);
    const payload = parseAlbumPayload(body);
    if (payload === null) throw new SpotifyResponseError('Unexpected album payload');
    const raws: RawTrack[] = [...payload.tracks.items];
    let next = payload.tracks.next;
    while (next !== null) {
      const path = `/v1/albums/${id}/tracks?limit=${ALBUM_TRACKS_PAGE_SIZE}&offset=${raws.length}`;
      const page = await this.#get(path, pageGuard(parseTrack), signal);
      const parsed = parsePage(page, parseTrack);
      if (parsed === null) throw new SpotifyResponseError('Unexpected album tracks payload');
      raws.push(...parsed.items);
      next = parsed.items.length === 0 ? null : parsed.next;
    }
    const tracks: Track[] = raws.map((raw) => mapTrack(raw, payload.album));
    return { ...mapAlbumSummary(payload.album), tracks };
  }

  async getArtist(artistId: string, signal?: AbortSignal): Promise<ArtistDetail> {
    const id = encodeURIComponent(artistId);
    const [artistBody, albumsBody] = await Promise.all([
      this.#get(`/v1/artists/${id}`, isArtistBody, signal),
      this.#get(
        `/v1/artists/${id}/albums?include_groups=album,single&limit=${SEARCH_PAGE_SIZE}`,
        pageGuard(parseAlbum),
        signal,
      ),
    ]);
    const artist = parseArtist(artistBody);
    const albums = parsePage(albumsBody, parseAlbum);
    if (artist === null || albums === null) throw new SpotifyResponseError('Unexpected artist payload');
    return { ...mapArtistSummary(artist), albums: albums.items.map(mapAlbumSummary) };
  }

  #require<T>(requested: boolean, page: RawPage<T> | null, name: string): RawPage<T> | null {
    if (!requested) return null;
    if (page === null) throw new SpotifyResponseError(`Search response is missing "${name}"`);
    return page;
  }

  #get<T>(path: string, guard: (value: unknown) => value is T, signal: AbortSignal | undefined): Promise<T> {
    return this.#client.request(path, { guard, signal });
  }
}
