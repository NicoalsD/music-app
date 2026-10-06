import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DoublyLinkedList } from './DoublyLinkedList';
import { IndexOutOfRangeError, InvalidOperationError } from './errors';
import { assertInvariants } from './test-utils/invariants';

function build(n: number): DoublyLinkedList<number> {
  const list = new DoublyLinkedList<number>();
  for (let i = 0; i < n; i++) {
    list.insertLast(i);
    assertInvariants(list);
  }
  return list;
}

describe('DoublyLinkedList', () => {
  describe('empty list', () => {
    it('starts empty', () => {
      const list = new DoublyLinkedList<number>();
      expect(list.size).toBe(0);
      expect(list.isEmpty()).toBe(true);
      expect(list.head).toBeNull();
      expect(list.tail).toBeNull();
      expect(list.toArray()).toEqual([]);
      assertInvariants(list);
    });

    it('throws InvalidOperationError on removeFirst/removeLast', () => {
      const list = new DoublyLinkedList<number>();
      expect(() => list.removeFirst()).toThrow(InvalidOperationError);
      expect(() => list.removeLast()).toThrow(InvalidOperationError);
    });

    it('throws IndexOutOfRangeError on removeAt and nodeAt', () => {
      const list = new DoublyLinkedList<number>();
      expect(() => list.removeAt(0)).toThrow(IndexOutOfRangeError);
      expect(() => list.nodeAt(0)).toThrow(IndexOutOfRangeError);
    });
  });

  describe('insertFirst', () => {
    it('inserts into an empty list', () => {
      const list = new DoublyLinkedList<number>();
      const node = list.insertFirst(1);
      assertInvariants(list);
      expect(list.head).toBe(node);
      expect(list.tail).toBe(node);
    });

    it('inserts before one and many elements', () => {
      const list = build(1);
      list.insertFirst(9);
      assertInvariants(list);
      list.insertFirst(8);
      assertInvariants(list);
      expect(list.toArray()).toEqual([8, 9, 0]);
    });
  });

  describe('insertLast', () => {
    it('inserts into empty, one and many', () => {
      const list = new DoublyLinkedList<number>();
      list.insertLast(1);
      assertInvariants(list);
      list.insertLast(2);
      assertInvariants(list);
      list.insertLast(3);
      assertInvariants(list);
      expect(list.toArray()).toEqual([1, 2, 3]);
      expect(list.tail?.value).toBe(3);
    });
  });

  describe('insertAt', () => {
    it('inserts at 0, size and the middle', () => {
      const list = build(4);
      list.insertAt(0, 100);
      assertInvariants(list);
      list.insertAt(list.size, 200);
      assertInvariants(list);
      list.insertAt(3, 300);
      assertInvariants(list);
      expect(list.toArray()).toEqual([100, 0, 1, 300, 2, 3, 200]);
    });

    it('inserts around the midpoint where traversal direction changes', () => {
      for (const size of [4, 5, 6, 7]) {
        for (const i of [
          Math.floor(size / 2) - 1,
          Math.floor(size / 2),
          Math.floor(size / 2) + 1,
        ]) {
          const list = build(size);
          list.insertAt(i, -1);
          assertInvariants(list);
          const expected = Array.from({ length: size }, (_, k) => k);
          expected.splice(i, 0, -1);
          expect(list.toArray()).toEqual(expected);
        }
      }
    });

    it('inserts into an empty list at 0', () => {
      const list = new DoublyLinkedList<number>();
      list.insertAt(0, 1);
      assertInvariants(list);
      expect(list.toArray()).toEqual([1]);
    });

    it('rejects -1, size+1 and non-integers', () => {
      const list = build(3);
      expect(() => list.insertAt(-1, 0)).toThrow(IndexOutOfRangeError);
      expect(() => list.insertAt(4, 0)).toThrow(IndexOutOfRangeError);
      expect(() => list.insertAt(1.5, 0)).toThrow(IndexOutOfRangeError);
      expect(() => list.insertAt(Number.NaN, 0)).toThrow(IndexOutOfRangeError);
      assertInvariants(list);
      expect(list.size).toBe(3);
    });
  });

  describe('insertAfter / insertBefore', () => {
    it('inserts relative to a node', () => {
      const list = build(3);
      list.insertAfter(list.tail ?? list.nodeAt(2), 10);
      assertInvariants(list);
      list.insertAfter(list.head ?? list.nodeAt(0), 11);
      assertInvariants(list);
      list.insertBefore(list.head ?? list.nodeAt(0), 12);
      assertInvariants(list);
      list.insertBefore(list.nodeAt(2), 13);
      assertInvariants(list);
      expect(list.toArray()).toEqual([12, 0, 13, 11, 1, 2, 10]);
    });

    it('rejects nodes of another list', () => {
      const a = build(2);
      const b = build(2);
      expect(() => a.insertAfter(b.nodeAt(0), 1)).toThrow(InvalidOperationError);
      expect(() => a.insertBefore(b.nodeAt(0), 1)).toThrow(InvalidOperationError);
    });
  });

  describe('removals', () => {
    it('removeFirst and removeLast return values and keep invariants', () => {
      const list = build(3);
      expect(list.removeFirst()).toBe(0);
      assertInvariants(list);
      expect(list.removeLast()).toBe(2);
      assertInvariants(list);
      expect(list.removeFirst()).toBe(1);
      assertInvariants(list);
      expect(list.isEmpty()).toBe(true);
    });

    it('removeLast can empty a single-element list', () => {
      const list = build(1);
      expect(list.removeLast()).toBe(0);
      assertInvariants(list);
    });

    it('removeAt handles only, head, tail and middle', () => {
      const single = build(1);
      expect(single.removeAt(0)).toBe(0);
      assertInvariants(single);

      const list = build(6);
      expect(list.removeAt(0)).toBe(0);
      assertInvariants(list);
      expect(list.removeAt(list.size - 1)).toBe(5);
      assertInvariants(list);
      expect(list.removeAt(1)).toBe(2);
      assertInvariants(list);
      expect(list.toArray()).toEqual([1, 3, 4]);
    });

    it('removeAt rejects out of range indexes', () => {
      const list = build(3);
      expect(() => list.removeAt(3)).toThrow(IndexOutOfRangeError);
      expect(() => list.removeAt(-1)).toThrow(IndexOutOfRangeError);
      expect(() => list.removeAt(0.5)).toThrow(IndexOutOfRangeError);
      assertInvariants(list);
    });

    it('removeNode removes an owned node and rejects foreign or stale ones', () => {
      const list = build(3);
      const other = build(3);
      const node = list.nodeAt(1);
      expect(() => list.removeNode(other.nodeAt(1))).toThrow(InvalidOperationError);
      expect(list.removeNode(node)).toBe(1);
      assertInvariants(list);
      expect(() => list.removeNode(node)).toThrow(InvalidOperationError);
      expect(list.indexOf(node)).toBe(-1);
    });
  });

  describe('move', () => {
    it('moves forward and backward', () => {
      const list = build(5);
      list.move(1, 3);
      assertInvariants(list);
      expect(list.toArray()).toEqual([0, 2, 3, 1, 4]);
      list.move(3, 1);
      assertInvariants(list);
      expect(list.toArray()).toEqual([0, 1, 2, 3, 4]);
    });

    it('moves to 0 and to size-1', () => {
      const list = build(5);
      list.move(4, 0);
      assertInvariants(list);
      expect(list.toArray()).toEqual([4, 0, 1, 2, 3]);
      list.move(0, 4);
      assertInvariants(list);
      expect(list.toArray()).toEqual([0, 1, 2, 3, 4]);
    });

    it('is a no-op when from equals to (version unchanged)', () => {
      const list = build(3);
      const version = list.version;
      list.move(1, 1);
      expect(list.version).toBe(version);
      expect(list.toArray()).toEqual([0, 1, 2]);
    });

    it('preserves node identity', () => {
      const list = build(4);
      const node = list.nodeAt(0);
      list.move(0, 3);
      assertInvariants(list);
      expect(list.nodeAt(3)).toBe(node);
      expect(list.indexOf(node)).toBe(3);
      expect(list.removeNode(node)).toBe(0);
    });

    it('rejects out of range indexes', () => {
      const list = build(3);
      expect(() => list.move(-1, 1)).toThrow(IndexOutOfRangeError);
      expect(() => list.move(0, 3)).toThrow(IndexOutOfRangeError);
      expect(() => list.move(3, 0)).toThrow(IndexOutOfRangeError);
      expect(() => new DoublyLinkedList<number>().move(0, 0)).toThrow(IndexOutOfRangeError);
    });
  });

  describe('nodeAt / indexOf / find', () => {
    it('returns the right node from either end', () => {
      const list = build(9);
      for (let i = 0; i < 9; i++) expect(list.nodeAt(i).value).toBe(i);
      expect(() => list.nodeAt(9)).toThrow(IndexOutOfRangeError);
      expect(() => list.nodeAt(-1)).toThrow(IndexOutOfRangeError);
    });

    it('indexOf returns -1 for absent nodes', () => {
      const list = build(3);
      const other = build(3);
      expect(list.indexOf(other.nodeAt(0))).toBe(-1);
      expect(list.indexOf(list.nodeAt(2))).toBe(2);
    });

    it('find and findIndex use the predicate', () => {
      const list = build(5);
      expect(list.find((v) => v === 3)?.value).toBe(3);
      expect(list.find((v) => v === 99)).toBeNull();
      expect(list.findIndex((v) => v === 4)).toBe(4);
      expect(list.findIndex((v) => v === 99)).toBe(-1);
    });
  });

  describe('iteration', () => {
    it('iterates values and nodes head to tail', () => {
      const list = build(4);
      expect([...list]).toEqual([0, 1, 2, 3]);
      expect(Array.from(list.nodes()).map((n) => n.value)).toEqual([0, 1, 2, 3]);
      expect(list.toArray()).toEqual([0, 1, 2, 3]);
    });

    it('toArray returns a copy that does not affect the list', () => {
      const list = build(2);
      list.toArray().push(5);
      expect(list.size).toBe(2);
    });
  });

  describe('clear and version', () => {
    it('clear empties the list and invalidates old nodes', () => {
      const list = build(3);
      const node = list.nodeAt(1);
      list.clear();
      assertInvariants(list);
      expect(list.isEmpty()).toBe(true);
      expect(() => list.removeNode(node)).toThrow(InvalidOperationError);
    });

    it('clear on an empty list does not bump the version', () => {
      const list = new DoublyLinkedList<number>();
      list.clear();
      expect(list.version).toBe(0);
    });

    it('increments version on every mutation and not on reads', () => {
      const list = new DoublyLinkedList<number>();
      let v = list.version;
      const expectBump = (fn: () => void): void => {
        fn();
        expect(list.version).toBeGreaterThan(v);
        v = list.version;
      };
      expectBump(() => list.insertFirst(1));
      expectBump(() => list.insertLast(2));
      expectBump(() => list.insertAt(1, 3));
      expectBump(() => list.insertAfter(list.nodeAt(0), 4));
      expectBump(() => list.insertBefore(list.nodeAt(0), 5));
      expectBump(() => list.move(0, 2));
      expectBump(() => list.removeAt(0));
      expectBump(() => list.removeFirst());
      expectBump(() => list.removeLast());
      expectBump(() => list.removeNode(list.nodeAt(0)));
      list.insertLast(1);
      v = list.version;
      list.toArray();
      list.find(() => true);
      list.nodeAt(0);
      expect(list.version).toBe(v);
      expectBump(() => list.clear());
    });
  });

  describe('property: matches an array reference model', () => {
    type Op =
      | { kind: 'first'; v: number }
      | { kind: 'last'; v: number }
      | { kind: 'insertAt'; i: number; v: number }
      | { kind: 'removeAt'; i: number }
      | { kind: 'move'; a: number; b: number };

    const opArb: fc.Arbitrary<Op> = fc.oneof(
      fc.record({ kind: fc.constant('first' as const), v: fc.integer() }),
      fc.record({ kind: fc.constant('last' as const), v: fc.integer() }),
      fc.record({
        kind: fc.constant('insertAt' as const),
        i: fc.integer({ min: -2, max: 40 }),
        v: fc.integer(),
      }),
      fc.record({ kind: fc.constant('removeAt' as const), i: fc.integer({ min: -2, max: 40 }) }),
      fc.record({
        kind: fc.constant('move' as const),
        a: fc.integer({ min: -2, max: 40 }),
        b: fc.integer({ min: -2, max: 40 }),
      }),
    );

    it('keeps the list equal to the model and invariants valid', () => {
      fc.assert(
        fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
          const list = new DoublyLinkedList<number>();
          const model: number[] = [];
          for (const op of ops) {
            switch (op.kind) {
              case 'first':
                list.insertFirst(op.v);
                model.unshift(op.v);
                break;
              case 'last':
                list.insertLast(op.v);
                model.push(op.v);
                break;
              case 'insertAt':
                if (op.i >= 0 && op.i <= model.length) {
                  list.insertAt(op.i, op.v);
                  model.splice(op.i, 0, op.v);
                } else {
                  expect(() => list.insertAt(op.i, op.v)).toThrow(IndexOutOfRangeError);
                }
                break;
              case 'removeAt':
                if (op.i >= 0 && op.i < model.length) {
                  expect(list.removeAt(op.i)).toBe(model.splice(op.i, 1)[0]);
                } else {
                  expect(() => list.removeAt(op.i)).toThrow(IndexOutOfRangeError);
                }
                break;
              case 'move':
                if (op.a >= 0 && op.a < model.length && op.b >= 0 && op.b < model.length) {
                  list.move(op.a, op.b);
                  const [item] = model.splice(op.a, 1);
                  model.splice(op.b, 0, item as number);
                } else {
                  expect(() => list.move(op.a, op.b)).toThrow(IndexOutOfRangeError);
                }
                break;
            }
            expect(list.toArray()).toEqual(model);
            expect(list.size).toBe(model.length);
            assertInvariants(list);
          }
        }),
        { numRuns: 1000 },
      );
    });
  });
});
