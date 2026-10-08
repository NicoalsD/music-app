import { createContext, createElement, use, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { systemClock } from '../../core/ports';
import type { Clock } from '../../core/ports';
import type { Track } from '../../core/Song';
import type { ArtistSummary } from '../../providers/MusicProvider';
import type { FeedResult, PersonalFeedProvider } from '../../providers/PersonalFeedProvider';

/** Cached sections are reused for this long before a remount fetches them again. */
export const FEED_CACHE_TTL_MS = 5 * 60_000;

export type FeedSectionStatus =
  'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'needsReconnect' | 'error';

export interface FeedSection<T> {
  readonly status: FeedSectionStatus;
  /** Only filled while `status === 'ready'`. */
  readonly items: readonly T[];
  readonly retry: () => void;
}

export interface HomeFeed {
  readonly recent: FeedSection<Track>;
  readonly topTracks: FeedSection<Track>;
  readonly topArtists: FeedSection<ArtistSummary>;
  readonly saved: FeedSection<Track>;
}

const FeedProviderContext = createContext<PersonalFeedProvider | null>(null);

export interface FeedProviderScopeProps {
  provider: PersonalFeedProvider | null;
  children?: ReactNode;
}

/** Makes the personal feed provider available to the tree. */
export function FeedProviderScope({ provider, children }: FeedProviderScopeProps) {
  return createElement(FeedProviderContext, { value: provider }, children);
}

/** The provider from the nearest scope, or null when the app has none. */
export function useFeedProvider(): PersonalFeedProvider | null {
  return use(FeedProviderContext);
}

type Outcome<T> = FeedResult<T> | { readonly status: 'error' };

interface CacheEntry {
  readonly at: number;
  readonly result: FeedResult<unknown>;
}

/** Session cache per provider and section. Weakly keyed so tests and hot reloads never leak. */
const caches = new WeakMap<PersonalFeedProvider, Map<string, CacheEntry>>();

function cacheFor(provider: PersonalFeedProvider): Map<string, CacheEntry> {
  let cache = caches.get(provider);
  if (cache === undefined) {
    cache = new Map();
    caches.set(provider, cache);
  }
  return cache;
}

function readFresh<T>(
  provider: PersonalFeedProvider,
  name: string,
  clock: Clock,
): FeedResult<T> | null {
  const entry = cacheFor(provider).get(name);
  if (entry === undefined || clock.now() - entry.at >= FEED_CACHE_TTL_MS) return null;
  return entry.result as FeedResult<T>;
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

interface Settled<T> {
  readonly provider: PersonalFeedProvider;
  readonly attempt: number;
  readonly outcome: Outcome<T>;
}

function useFeedSection<T>(
  provider: PersonalFeedProvider | null,
  enabled: boolean,
  clock: Clock,
  name: string,
  load: (provider: PersonalFeedProvider, signal: AbortSignal) => Promise<FeedResult<T>>,
): FeedSection<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  const retry = useCallback(() => {
    if (provider !== null) cacheFor(provider).delete(name);
    setAttempt((n) => n + 1);
  }, [provider, name]);

  const active = enabled && provider !== null;

  useEffect(() => {
    if (provider === null) return;
    if (!enabled) {
      // Logging out forgets the previous account's data.
      cacheFor(provider).delete(name);
      return;
    }
    if (readFresh(provider, name, clock) !== null) return;
    const controller = new AbortController();
    load(provider, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        // A reconnect request is not data worth keeping: the next visit should ask again.
        if (result.status === 'ready') cacheFor(provider).set(name, { at: clock.now(), result });
        setSettled({ provider, attempt, outcome: result });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setSettled({ provider, attempt, outcome: { status: 'error' } });
      },
    );
    return () => controller.abort();
  }, [provider, enabled, clock, name, load, attempt]);

  if (!active) {
    // Drop the previous session's outcome so a later login never flashes stale data.
    if (settled !== null) setSettled(null);
    return { status: 'idle', items: [], retry };
  }
  const outcome: Outcome<T> | null =
    settled !== null && settled.provider === provider && settled.attempt === attempt
      ? settled.outcome
      : readFresh<T>(provider, name, clock);
  if (outcome === null) return { status: 'loading', items: [], retry };
  if (outcome.status !== 'ready') return { status: outcome.status, items: [], retry };
  return outcome.items.length === 0
    ? { status: 'empty', items: [], retry }
    : { status: 'ready', items: outcome.items, retry };
}

const loadRecent = (p: PersonalFeedProvider, signal: AbortSignal) => p.recentlyPlayed(signal);
const loadTopTracks = (p: PersonalFeedProvider, signal: AbortSignal) =>
  p.topTracks('medium_term', signal);
const loadTopArtists = (p: PersonalFeedProvider, signal: AbortSignal) =>
  p.topArtists('medium_term', signal);
const loadSaved = (p: PersonalFeedProvider, signal: AbortSignal) => p.savedTracks(signal);

/**
 * Loads the four personal sections in parallel. Logged out (or without a provider) nothing is
 * requested. Each section settles on its own, so one failure never hides the others.
 */
export function useHomeFeed(
  provider: PersonalFeedProvider | null,
  loggedIn: boolean,
  clock: Clock = systemClock,
): HomeFeed {
  return {
    recent: useFeedSection(provider, loggedIn, clock, 'recent', loadRecent),
    topTracks: useFeedSection(provider, loggedIn, clock, 'topTracks', loadTopTracks),
    topArtists: useFeedSection(provider, loggedIn, clock, 'topArtists', loadTopArtists),
    saved: useFeedSection(provider, loggedIn, clock, 'saved', loadSaved),
  };
}
