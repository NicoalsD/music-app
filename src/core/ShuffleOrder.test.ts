import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ShuffleOrder } from './ShuffleOrder';
import { SeededRandom } from './test-utils/fakes';

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe('ShuffleOrder', () => {
  it('is deterministic for a seed', () => {
    const one = new ShuffleOrder(ids, 'c', new SeededRandom(42)).ids();
    const two = new ShuffleOrder(ids, 'c', new SeededRandom(42)).ids();
    expect(one).toEqual(two);
  });

  it('puts the current entry first and keeps every id exactly once', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const order = new ShuffleOrder(ids, 'd', new SeededRandom(seed)).ids();
      expect(order[0]).toBe('d');
      expect(sorted(order)).toEqual(sorted(ids));
    }
  });

  it('actually permutes (some seed differs from the input order)', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      results.add(new ShuffleOrder(ids, null, new SeededRandom(seed)).ids().join());
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('shuffles everything when current is null or unknown', () => {
    expect(sorted(new ShuffleOrder(ids, null, new SeededRandom(3)).ids())).toEqual(sorted(ids));
    expect(sorted(new ShuffleOrder(ids, 'zzz', new SeededRandom(3)).ids())).toEqual(sorted(ids));
  });

  it('collapses duplicate input ids', () => {
    expect(sorted(new ShuffleOrder(['a', 'a', 'b'], null, new SeededRandom(1)).ids())).toEqual(['a', 'b']);
  });

  it('handles 0 and 1 elements', () => {
    const empty = new ShuffleOrder([], null, new SeededRandom(1));
    expect(empty.ids()).toEqual([]);
    expect(empty.next('a', true)).toBeNull();
    expect(empty.previous('a', true)).toBeNull();

    const one = new ShuffleOrder(['a'], 'a', new SeededRandom(1));
    expect(one.ids()).toEqual(['a']);
    expect(one.next('a', false)).toBeNull();
    expect(one.next('a', true)).toBe('a');
    expect(one.previous('a', false)).toBeNull();
    expect(one.previous('a', true)).toBe('a');
  });

  it('walks next and previous along the order', () => {
    const s = new ShuffleOrder(ids, 'a', new SeededRandom(7));
    const order = s.ids();
    expect(s.next(order[0] ?? '', false)).toBe(order[1]);
    expect(s.previous(order[1] ?? '', false)).toBe(order[0]);
    expect(s.previous(order[0] ?? '', false)).toBeNull();
    expect(s.previous(order[0] ?? '', true)).toBe(order[order.length - 1]);
    expect(s.next(order[order.length - 1] ?? '', false)).toBeNull();
    expect(s.next(order[order.length - 1] ?? '', true)).toBe(order[0]);
  });

  it('returns null for an unknown fromId', () => {
    const s = new ShuffleOrder(ids, 'a', new SeededRandom(7));
    expect(s.next('nope', true)).toBeNull();
    expect(s.previous('nope', true)).toBeNull();
  });

  it('add inserts after the current pointer, never duplicating', () => {
    const s = new ShuffleOrder(ids, 'a', new SeededRandom(5));
    const order = s.ids();
    s.next(order[2] ?? '', false); // pointer now at index 3
    s.add('new');
    const after = s.ids();
    expect(after).toHaveLength(ids.length + 1);
    expect(after.indexOf('new')).toBeGreaterThan(3);
    expect(after.slice(0, 4)).toEqual(order.slice(0, 4));
    s.add('new');
    expect(s.ids()).toEqual(after);
  });

  it('add works on an empty order', () => {
    const s = new ShuffleOrder([], null, new SeededRandom(1));
    s.add('x');
    expect(s.ids()).toEqual(['x']);
  });

  it('remove drops the id and keeps the pointer consistent', () => {
    const s = new ShuffleOrder(ids, 'a', new SeededRandom(9));
    const order = s.ids();
    s.next(order[1] ?? '', false); // pointer at index 2
    s.remove(order[0] ?? '');
    s.remove('missing');
    expect(s.ids()).toEqual(order.slice(1));
    s.add('x');
    // Pointer was at order[2], now index 1; insertion must be after it.
    expect(s.ids().indexOf('x')).toBeGreaterThan(1);
  });

  it('property: add/remove keep a valid permutation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(fc.tuple(fc.constantFrom('add', 'remove', 'next'), fc.integer({ min: 0, max: 9 })), { maxLength: 40 }),
        (seed, ops) => {
          const s = new ShuffleOrder(['0', '1', '2', '3', '4'], '2', new SeededRandom(seed));
          const model = new Set(s.ids());
          for (const [op, n] of ops) {
            const id = String(n);
            if (op === 'add') {
              s.add(id);
              model.add(id);
            } else if (op === 'remove') {
              s.remove(id);
              model.delete(id);
            } else {
              s.next(id, true);
            }
            const now = s.ids();
            expect(new Set(now).size).toBe(now.length);
            expect(sorted(now)).toEqual(sorted([...model]));
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
