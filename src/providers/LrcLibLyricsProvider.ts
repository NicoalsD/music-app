import { type Lyrics, parseLrc } from '../core/Lyrics';
import { LyricsRequestError, type LyricsProvider, type LyricsQuery } from './LyricsProvider';

export const LRCLIB_BASE_URL = 'https://lrclib.net';
/** Maximum duration gap (seconds) for a search result to count as the same recording. */
export const LRCLIB_DURATION_TOLERANCE_S = 3;

interface Candidate {
  readonly lyrics: Lyrics;
  readonly durationS: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

function toLyrics(record: Record<string, unknown>): Lyrics | null {
  const synced = record['syncedLyrics'];
  if (typeof synced === 'string') {
    const lines = parseLrc(synced);
    if (lines.length > 0) return { kind: 'synced', lines };
  }
  const plain = record['plainLyrics'];
  if (typeof plain === 'string' && plain.trim() !== '') {
    return { kind: 'plain', lines: plain.split(/\r\n|\r|\n/).map((line) => line.trimEnd()) };
  }
  if (record['instrumental'] === true) return { kind: 'instrumental' };
  return null;
}

function toCandidate(value: unknown): Candidate | null {
  if (!isRecord(value)) return null;
  const lyrics = toLyrics(value);
  if (lyrics === null) return null;
  const duration = value['duration'];
  return { lyrics, durationS: typeof duration === 'number' ? duration : null };
}

/** Closest duration within tolerance wins; otherwise the first candidate. */
function pickBest(candidates: readonly Candidate[], targetS: number): Lyrics | null {
  let best: Candidate | null = null;
  let bestGap = Infinity;
  for (const candidate of candidates) {
    if (candidate.durationS === null) continue;
    const gap = Math.abs(candidate.durationS - targetS);
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  if (best !== null && bestGap <= LRCLIB_DURATION_TOLERANCE_S) return best.lyrics;
  return candidates[0]?.lyrics ?? null;
}

export interface LrcLibLyricsProviderDeps {
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
}

/** LRCLIB (https://lrclib.net) lyrics lookup with an in-memory cache per query. */
export class LrcLibLyricsProvider implements LyricsProvider {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #cache = new Map<string, Lyrics | null>();

  constructor(deps: LrcLibLyricsProviderDeps = {}) {
    this.#fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.#baseUrl = deps.baseUrl ?? LRCLIB_BASE_URL;
  }

  async find(query: LyricsQuery, signal?: AbortSignal): Promise<Lyrics | null> {
    const key = JSON.stringify([query.title, query.artist, query.album, query.durationMs]);
    if (this.#cache.has(key)) return this.#cache.get(key) ?? null;
    const durationS = Math.round(query.durationMs / 1000);

    const exact = new URLSearchParams({
      track_name: query.title,
      artist_name: query.artist,
      album_name: query.album,
      duration: String(durationS),
    });
    const hit = await this.#getJson(`/api/get?${exact}`, signal);
    let lyrics: Lyrics | null;
    if (hit !== undefined) {
      lyrics = toCandidate(hit)?.lyrics ?? null;
    } else {
      const search = new URLSearchParams({ track_name: query.title, artist_name: query.artist });
      const found = await this.#getJson(`/api/search?${search}`, signal);
      const candidates: Candidate[] = [];
      if (Array.isArray(found)) {
        for (const item of found) {
          const candidate = toCandidate(item);
          if (candidate !== null) candidates.push(candidate);
        }
      }
      lyrics = pickBest(candidates, durationS);
    }
    this.#cache.set(key, lyrics);
    return lyrics;
  }

  /** Parsed JSON body, or `undefined` on 404. Other failures throw a typed error. */
  async #getJson(path: string, signal: AbortSignal | undefined): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#baseUrl}${path}`,
        signal === undefined ? {} : { signal },
      );
    } catch (error) {
      if (isAbort(error) || signal?.aborted === true) throw error;
      throw new LyricsRequestError(0, 'Network error while fetching lyrics');
    }
    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new LyricsRequestError(response.status, `Lyrics request failed (${response.status})`);
    }
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new LyricsRequestError(response.status, 'Lyrics response was not valid JSON');
    }
  }
}
