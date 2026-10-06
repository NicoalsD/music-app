import type { Clock, IdGenerator, Random } from '../ports';
import type { Track } from '../Song';

export class CounterIds implements IdGenerator {
  #n = 0;
  constructor(readonly prefix = 'id') {}
  next(): string {
    this.#n++;
    return `${this.prefix}-${this.#n}`;
  }
}

/** Seeded LCG (Numerical Recipes constants); returns floats in [0, 1). */
export class SeededRandom implements Random {
  #state: number;
  constructor(seed = 1) {
    this.#state = seed >>> 0;
  }
  next(): number {
    this.#state = (Math.imul(this.#state, 1664525) + 1013904223) >>> 0;
    return this.#state / 4294967296;
  }
}

export class FakeClock implements Clock {
  constructor(public time = 1_000) {}
  now(): number {
    return this.time;
  }
}

export function makeTrack(trackId: string, durationMs = 1_000): Track {
  return {
    trackId,
    source: 'local',
    uri: `blob:${trackId}`,
    title: `Title ${trackId}`,
    artists: ['Artist'],
    album: { id: null, name: 'Album' },
    durationMs,
    artwork: {},
    explicit: false,
    externalUrl: null,
  };
}
