import { DomainError } from '../core/errors';
import type { Lyrics } from '../core/Lyrics';

export interface LyricsQuery {
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly durationMs: number;
}

/** Strategy for looking up lyrics of a song. */
export interface LyricsProvider {
  /** Resolves to `null` when no lyrics exist; rejects with `LyricsRequestError` on failures. */
  find(query: LyricsQuery, signal?: AbortSignal): Promise<Lyrics | null>;
}

/** The lyrics service could not be reached or answered with an unexpected status or body. */
export class LyricsRequestError extends DomainError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
