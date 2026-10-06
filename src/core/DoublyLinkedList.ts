import { IndexOutOfRangeError, InvalidOperationError } from './errors';
import { Node } from './Node';

/**
 * Hand-written generic doubly linked list. Nodes are linked through
 * prev/next pointers; no array is used for storage.
 */
export class DoublyLinkedList<T> implements Iterable<T> {
  #head: Node<T> | null = null;
  #tail: Node<T> | null = null;
  #size = 0;
  #version = 0;
  #owned = new WeakSet<Node<T>>();

  get size(): number {
    return this.#size;
  }

  /** Incremented on every structural mutation (for UI memoization). */
  get version(): number {
    return this.#version;
  }

  get head(): Node<T> | null {
    return this.#head;
  }

  get tail(): Node<T> | null {
    return this.#tail;
  }

  isEmpty(): boolean {
    return this.#size === 0;
  }

  insertFirst(value: T): Node<T> {
    return this.#linkBefore(this.#head, new Node(value));
  }

  insertLast(value: T): Node<T> {
    return this.#linkBefore(null, new Node(value));
  }

  insertAt(index: number, value: T): Node<T> {
    this.#assertIndex(index, this.#size);
    if (index === this.#size) return this.insertLast(value);
    return this.#linkBefore(this.nodeAt(index), new Node(value));
  }

  insertAfter(node: Node<T>, value: T): Node<T> {
    this.#assertOwned(node);
    return this.#linkBefore(node.next, new Node(value));
  }

  insertBefore(node: Node<T>, value: T): Node<T> {
    this.#assertOwned(node);
    return this.#linkBefore(node, new Node(value));
  }

  removeFirst(): T {
    if (this.#head === null) throw new InvalidOperationError('List is empty');
    return this.#unlink(this.#head);
  }

  removeLast(): T {
    if (this.#tail === null) throw new InvalidOperationError('List is empty');
    return this.#unlink(this.#tail);
  }

  removeAt(index: number): T {
    this.#assertIndex(index, this.#size - 1);
    return this.#unlink(this.nodeAt(index));
  }

  removeNode(node: Node<T>): T {
    this.#assertOwned(node);
    return this.#unlink(node);
  }

  /** Relinks the same node object so that it ends at index `to`. */
  move(from: number, to: number): void {
    this.#assertIndex(from, this.#size - 1);
    this.#assertIndex(to, this.#size - 1);
    if (from === to) return;
    const node = this.nodeAt(from);
    this.#detach(node);
    // After detaching, the list has size - 1 nodes; `to` may equal that size.
    const reference = to === this.#size ? null : this.nodeAt(to);
    this.#attachBefore(reference, node);
    this.#version++;
  }

  /** Walks from the nearer end. */
  nodeAt(index: number): Node<T> {
    this.#assertIndex(index, this.#size - 1);
    let current: Node<T>;
    if (index < this.#size / 2) {
      current = this.#requireNode(this.#head);
      for (let i = 0; i < index; i++) current = this.#requireNode(current.next);
    } else {
      current = this.#requireNode(this.#tail);
      for (let i = this.#size - 1; i > index; i--) current = this.#requireNode(current.prev);
    }
    return current;
  }

  indexOf(node: Node<T>): number {
    if (!this.#owned.has(node)) return -1;
    let index = 0;
    for (let n = this.#head; n !== null; n = n.next) {
      if (n === node) return index;
      index++;
    }
    return -1;
  }

  find(predicate: (value: T) => boolean): Node<T> | null {
    for (const node of this.nodes()) {
      if (predicate(node.value)) return node;
    }
    return null;
  }

  findIndex(predicate: (value: T) => boolean): number {
    let index = 0;
    for (const node of this.nodes()) {
      if (predicate(node.value)) return index;
      index++;
    }
    return -1;
  }

  clear(): void {
    if (this.#size === 0) return;
    this.#head = null;
    this.#tail = null;
    this.#size = 0;
    this.#owned = new WeakSet<Node<T>>();
    this.#version++;
  }

  *[Symbol.iterator](): Generator<T, void, undefined> {
    for (const node of this.nodes()) yield node.value;
  }

  *nodes(): Generator<Node<T>, void, undefined> {
    for (let n = this.#head; n !== null; n = n.next) yield n;
  }

  toArray(): T[] {
    return Array.from(this);
  }

  #assertIndex(index: number, max: number): void {
    if (!Number.isInteger(index) || index < 0 || index > max) {
      throw new IndexOutOfRangeError(index, 0, max);
    }
  }

  #assertOwned(node: Node<T>): void {
    if (!this.#owned.has(node)) {
      throw new InvalidOperationError('Node does not belong to this list');
    }
  }

  /** Narrowing helper that avoids non-null assertions inside walks. */
  #requireNode(node: Node<T> | null): Node<T> {
    if (node === null) throw new InvalidOperationError('Corrupted list');
    return node;
  }

  #linkBefore(reference: Node<T> | null, node: Node<T>): Node<T> {
    this.#owned.add(node);
    this.#attachBefore(reference, node);
    this.#version++;
    return node;
  }

  /** Links `node` before `reference` (or at the tail when null). */
  #attachBefore(reference: Node<T> | null, node: Node<T>): void {
    const before = reference === null ? this.#tail : reference.prev;
    node.prev = before;
    node.next = reference;
    if (before === null) this.#head = node;
    else before.next = node;
    if (reference === null) this.#tail = node;
    else reference.prev = node;
    this.#size++;
  }

  /** Unlinks `node` without touching ownership or version. */
  #detach(node: Node<T>): void {
    const { prev, next } = node;
    if (prev === null) this.#head = next;
    else prev.next = next;
    if (next === null) this.#tail = prev;
    else next.prev = prev;
    node.prev = null;
    node.next = null;
    this.#size--;
  }

  #unlink(node: Node<T>): T {
    this.#detach(node);
    this.#owned.delete(node);
    this.#version++;
    return node.value;
  }
}
