import type { Random } from './ports';

/**
 * A shuffled ordering of entry ids (Fisher-Yates with an injected Random).
 * It never mutates the playlist; it only keeps its own permutation.
 */
export class ShuffleOrder {
  #order: string[];
  #cursor: number;
  readonly #random: Random;

  constructor(entryIds: readonly string[], currentId: string | null, random: Random) {
    this.#random = random;
    const unique = Array.from(new Set(entryIds));
    const first = currentId !== null && unique.includes(currentId) ? currentId : null;
    const rest = first === null ? unique : unique.filter((id) => id !== first);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(random.next() * (i + 1));
      const tmp = rest[i] as string;
      rest[i] = rest[j] as string;
      rest[j] = tmp;
    }
    this.#order = first === null ? rest : [first, ...rest];
    this.#cursor = first === null ? -1 : 0;
  }

  ids(): readonly string[] {
    return [...this.#order];
  }

  next(fromId: string, wrap: boolean): string | null {
    return this.#step(fromId, 1, wrap);
  }

  previous(fromId: string, wrap: boolean): string | null {
    return this.#step(fromId, -1, wrap);
  }

  /** Inserts at a random position after the current pointer. */
  add(entryId: string): void {
    if (this.#order.includes(entryId)) return;
    const slots = this.#order.length - this.#cursor;
    const at = this.#cursor + 1 + Math.floor(this.#random.next() * slots);
    this.#order.splice(at, 0, entryId);
  }

  remove(entryId: string): void {
    const index = this.#order.indexOf(entryId);
    if (index === -1) return;
    this.#order.splice(index, 1);
    if (index <= this.#cursor) this.#cursor--;
  }

  #step(fromId: string, delta: 1 | -1, wrap: boolean): string | null {
    const length = this.#order.length;
    if (length === 0) return null;
    const from = this.#order.indexOf(fromId);
    if (from === -1) return null;
    this.#cursor = from;
    let target = from + delta;
    if (target < 0 || target >= length) {
      if (!wrap) return null;
      target = (target + length) % length;
    }
    this.#cursor = target;
    return this.#order[target] ?? null;
  }
}
