/** Injectable sources of non-determinism, so core logic stays testable. */
export interface Clock {
  now(): number;
}

export interface Random {
  /** Returns a float in [0, 1). */
  next(): number;
}

export interface IdGenerator {
  next(): string;
}

export const systemClock: Clock = { now: () => Date.now() };
export const mathRandom: Random = { next: () => Math.random() };
export const uuidGenerator: IdGenerator = { next: () => crypto.randomUUID() };
