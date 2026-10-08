import { createContext, createElement, use, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Lyrics } from '../core/Lyrics';
import type { LyricsProvider, LyricsQuery } from '../providers/LyricsProvider';

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface UseLyricsResult {
  readonly status: LyricsStatus;
  /** Only set while `status === 'ready'`. */
  readonly lyrics: Lyrics | null;
  readonly retry: () => void;
}

const LyricsProviderContext = createContext<LyricsProvider | null>(null);

export interface LyricsProviderProps {
  provider: LyricsProvider;
  children?: ReactNode;
}

/** Makes the lyrics provider available to the tree. */
export function LyricsProviderScope({ provider, children }: LyricsProviderProps) {
  return createElement(LyricsProviderContext, { value: provider }, children);
}

export { LyricsProviderContext };

export function useLyricsProvider(): LyricsProvider {
  const provider = use(LyricsProviderContext);
  if (provider === null) {
    throw new Error('useLyricsProvider must be used inside <LyricsProviderScope>');
  }
  return provider;
}

interface Loaded {
  /** Request key the outcome belongs to; a mismatch with the live query means "loading". */
  readonly key: string;
  readonly lyrics: Lyrics | null;
  readonly failed: boolean;
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

/** Loads lyrics for `query` (null = nothing playing). A newer query cancels the older request. */
export function useLyricsFrom(
  provider: LyricsProvider,
  query: LyricsQuery | null,
): UseLyricsResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  const title = query?.title;
  const artist = query?.artist;
  const album = query?.album;
  const durationMs = query?.durationMs;
  const active = query !== null;
  const key = JSON.stringify([title, artist, album, durationMs, attempt]);

  useEffect(() => {
    if (title === undefined || artist === undefined || album === undefined) return;
    if (durationMs === undefined) return;
    const controller = new AbortController();
    provider.find({ title, artist, album, durationMs }, controller.signal).then(
      (lyrics) => {
        if (!controller.signal.aborted) setLoaded({ key, lyrics, failed: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setLoaded({ key, lyrics: null, failed: true });
      },
    );
    return () => controller.abort();
  }, [provider, title, artist, album, durationMs, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const current = active && loaded !== null && loaded.key === key ? loaded : null;
  let status: LyricsStatus;
  if (!active) status = 'idle';
  else if (current === null) status = 'loading';
  else if (current.failed) status = 'error';
  else if (current.lyrics === null) status = 'empty';
  else status = 'ready';

  return { status, lyrics: status === 'ready' ? (current?.lyrics ?? null) : null, retry };
}

/** Same as `useLyricsFrom`, using the provider from `LyricsProviderScope`. */
export function useLyrics(query: LyricsQuery | null): UseLyricsResult {
  return useLyricsFrom(useLyricsProvider(), query);
}
