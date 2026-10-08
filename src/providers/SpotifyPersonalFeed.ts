import type { Track } from '../core/Song';
import type { ArtistSummary } from './MusicProvider';
import type { FeedResult, PersonalFeedProvider, TimeRange } from './PersonalFeedProvider';
import { SpotifyApiError, SpotifyForbiddenError, SpotifyResponseError } from './SpotifyApiClient';
import type { SpotifyRequester } from './SpotifyProvider';
import {
  isRecord,
  mapArtistSummary,
  mapTrack,
  parseArtist,
  parsePage,
  parseTrack,
} from './spotifyMapping';
import type { RawTrack } from './spotifyMapping';

/** Development Mode caps the page size; 10 is safe for every endpoint used here. */
export const FEED_PAGE_SIZE = 10;

type Body = Record<string, unknown>;

function pageGuard<T>(parseItem: (item: unknown) => T | null): (value: unknown) => value is Body {
  return (value): value is Body => isRecord(value) && parsePage(value, parseItem) !== null;
}

/** Parses `{ track: {...} }` wrappers (recently played and saved tracks). */
function parseWrappedTrack(item: unknown): RawTrack | null {
  return isRecord(item) ? parseTrack(item['track']) : null;
}

/** PersonalFeedProvider backed by the Spotify Web API (`/me/top`, recently played, `/me/tracks`). */
export class SpotifyPersonalFeed implements PersonalFeedProvider {
  readonly #client: SpotifyRequester;

  constructor(client: SpotifyRequester) {
    this.#client = client;
  }

  topTracks(range: TimeRange, signal?: AbortSignal): Promise<FeedResult<Track>> {
    return this.#load(
      `/v1/me/top/tracks?time_range=${range}&limit=${FEED_PAGE_SIZE}`,
      parseTrack,
      (raws) => raws.map((raw) => mapTrack(raw, null)),
      signal,
    );
  }

  topArtists(range: TimeRange, signal?: AbortSignal): Promise<FeedResult<ArtistSummary>> {
    return this.#load(
      `/v1/me/top/artists?time_range=${range}&limit=${FEED_PAGE_SIZE}`,
      parseArtist,
      (raws) => raws.map(mapArtistSummary),
      signal,
    );
  }

  recentlyPlayed(signal?: AbortSignal): Promise<FeedResult<Track>> {
    return this.#load(
      `/v1/me/player/recently-played?limit=${FEED_PAGE_SIZE}`,
      parseWrappedTrack,
      (raws) => dedupeById(raws).map((raw) => mapTrack(raw, null)),
      signal,
    );
  }

  savedTracks(signal?: AbortSignal): Promise<FeedResult<Track>> {
    return this.#load(
      `/v1/me/tracks?limit=${FEED_PAGE_SIZE}`,
      parseWrappedTrack,
      (raws) => raws.map((raw) => mapTrack(raw, null)),
      signal,
    );
  }

  async #load<R, T>(
    path: string,
    parseItem: (item: unknown) => R | null,
    map: (raws: readonly R[]) => readonly T[],
    signal: AbortSignal | undefined,
  ): Promise<FeedResult<T>> {
    try {
      const body = await this.#client.request(path, { guard: pageGuard(parseItem), signal });
      const page = parsePage(body, parseItem);
      if (page === null) throw new SpotifyResponseError('Unexpected feed payload');
      return { status: 'ready', items: map(page.items) };
    } catch (error) {
      if (error instanceof SpotifyForbiddenError) return { status: 'needsReconnect' };
      if (error instanceof SpotifyApiError && error.status === 404)
        return { status: 'unavailable' };
      throw error;
    }
  }
}

function dedupeById(raws: readonly RawTrack[]): RawTrack[] {
  const seen = new Set<string>();
  const unique: RawTrack[] = [];
  for (const raw of raws) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    unique.push(raw);
  }
  return unique;
}
