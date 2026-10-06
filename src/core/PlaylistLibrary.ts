import { DoublyLinkedList } from './DoublyLinkedList';
import { InvalidOperationError, PlaylistNotFoundError } from './errors';
import type { Node } from './Node';
import { Playlist } from './Playlist';
import type { Clock, IdGenerator } from './ports';

/** Default UI copy for the first playlist. */
export const DEFAULT_PLAYLIST_NAME = 'Mi lista';

export interface PlaylistLibraryDeps {
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Creates the default playlist on construction. Defaults to true. */
  readonly createDefault?: boolean;
}

/** The user's playlists, stored as a DoublyLinkedList<Playlist>. */
export class PlaylistLibrary {
  readonly #lists = new DoublyLinkedList<Playlist>();
  readonly #ids: IdGenerator;
  readonly #clock: Clock;
  #active: Node<Playlist> | null = null;
  #version = 0;

  constructor(deps: PlaylistLibraryDeps) {
    this.#ids = deps.ids;
    this.#clock = deps.clock;
    if (deps.createDefault ?? true) this.create(DEFAULT_PLAYLIST_NAME);
  }

  get size(): number {
    return this.#lists.size;
  }

  get version(): number {
    return this.#lists.version + this.#version;
  }

  get active(): Playlist {
    if (this.#active === null) throw new InvalidOperationError('Library has no playlists');
    return this.#active.value;
  }

  create(name: string): Playlist {
    const playlist = new Playlist({
      id: this.#ids.next(),
      name,
      createdAt: this.#clock.now(),
      ids: this.#ids,
    });
    const node = this.#lists.insertLast(playlist);
    if (this.#active === null) this.#active = node;
    return playlist;
  }

  rename(id: string, name: string): void {
    this.get(id).rename(name);
    this.#version++;
  }

  remove(id: string): void {
    const node = this.#findNode(id);
    if (this.#lists.size === 1) {
      throw new InvalidOperationError('Cannot remove the only playlist');
    }
    if (node === this.#active) {
      this.#active = node.next ?? node.prev;
      this.#version++;
    }
    this.#lists.removeNode(node);
  }

  get(id: string): Playlist {
    return this.#findNode(id).value;
  }

  all(): readonly Playlist[] {
    return this.#lists.toArray();
  }

  setActive(id: string): void {
    const node = this.#findNode(id);
    if (node === this.#active) return;
    this.#active = node;
    this.#version++;
  }

  move(from: number, to: number): void {
    this.#lists.move(from, to);
  }

  #findNode(id: string): Node<Playlist> {
    const node = this.#lists.find((p) => p.id === id);
    if (node === null) throw new PlaylistNotFoundError(id);
    return node;
  }
}
