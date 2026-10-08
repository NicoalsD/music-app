import type { Lyrics } from '../../core/Lyrics';
import { LyricsRequestError } from '../../providers/LyricsProvider';
import type { LyricsProvider, LyricsQuery } from '../../providers/LyricsProvider';

/** Scripted lyrics provider for UI tests: it never touches the network. */
export class FakeLyricsProvider implements LyricsProvider {
  readonly queries: LyricsQuery[] = [];
  /** What `find` resolves to; an `Error` makes it reject, and `'pending'` never settles. */
  result: Lyrics | null | Error | 'pending';

  constructor(result: Lyrics | null | Error | 'pending' = null) {
    this.result = result;
  }

  find(query: LyricsQuery): Promise<Lyrics | null> {
    this.queries.push(query);
    const { result } = this;
    if (result === 'pending') return new Promise(() => undefined);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  }

  static failure(): LyricsRequestError {
    return new LyricsRequestError(500, 'Lyrics request failed (500)');
  }
}
