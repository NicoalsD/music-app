import { expect } from 'vitest';
import type { DoublyLinkedList } from '../DoublyLinkedList';
import type { Node } from '../Node';

/** Verifies the 6 list invariants from AGENTS.md section 6. */
export function assertInvariants<T>(list: DoublyLinkedList<T>): void {
  const { head, tail, size } = list;

  // 1. Emptiness agreement.
  expect(size === 0).toBe(head === null);
  expect(head === null).toBe(tail === null);
  expect(list.isEmpty()).toBe(size === 0);
  if (head === null || tail === null) return;

  // 2. Boundary pointers.
  expect(head.prev).toBeNull();
  expect(tail.next).toBeNull();

  // 4 + 5. Forward walk visits exactly `size` nodes (bounded: no cycles).
  const forward: Node<T>[] = [];
  for (let n: Node<T> | null = head; n !== null; n = n.next) {
    forward.push(n);
    if (forward.length > size) throw new Error('Forward walk exceeds size (cycle or bad size)');
  }
  expect(forward.length).toBe(size);
  expect(forward[forward.length - 1]).toBe(tail);

  // 4. Backward walk is the exact reverse.
  const backward: Node<T>[] = [];
  for (let n: Node<T> | null = tail; n !== null; n = n.prev) {
    backward.push(n);
    if (backward.length > size) throw new Error('Backward walk exceeds size (cycle or bad size)');
  }
  expect(backward.length).toBe(size);
  forward.forEach((n, i) => expect(backward[size - 1 - i]).toBe(n));

  // 3. Mutual links.
  for (const n of forward) {
    if (n.next !== null) expect(n.next.prev).toBe(n);
    if (n.prev !== null) expect(n.prev.next).toBe(n);
  }
}
