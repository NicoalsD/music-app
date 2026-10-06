/**
 * A node of a doubly linked list.
 *
 * `prev` and `next` are public only so the owning DoublyLinkedList can relink
 * nodes; consumers must treat them as read-only and never assign to them.
 */
export class Node<T> {
  readonly value: T;
  prev: Node<T> | null = null;
  next: Node<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}
