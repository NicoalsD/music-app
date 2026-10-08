import type { Track } from '../core/Song';
import type { ArtistSummary } from './MusicProvider';

export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

/**
 * Outcome of one feed request. A section that Spotify refuses does not throw, so the
 * other sections of the Home feed keep working.
 * - `needsReconnect`: 403, the token lacks the scope (sessions created before it was requested).
 * - `unavailable`: 404, the endpoint does not exist for this app or account.
 */
export type FeedResult<T> =
  | { readonly status: 'ready'; readonly items: readonly T[] }
  | { readonly status: 'needsReconnect' }
  | { readonly status: 'unavailable' };

/** Personalised listening data for the Home screen (kept apart from the catalog provider). */
export interface PersonalFeedProvider {
  topTracks(range: TimeRange, signal?: AbortSignal): Promise<FeedResult<Track>>;
  topArtists(range: TimeRange, signal?: AbortSignal): Promise<FeedResult<ArtistSummary>>;
  /** Most recent first, one entry per track id. */
  recentlyPlayed(signal?: AbortSignal): Promise<FeedResult<Track>>;
  savedTracks(signal?: AbortSignal): Promise<FeedResult<Track>>;
}
