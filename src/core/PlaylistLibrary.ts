import { DoublyLinkedList } from './DoublyLinkedList';
import { InvalidOperationError, PlaylistNotFoundError } from './errors';
import type { Node } from './Node';
import { Playlist } from './Playlist';
import type { PlaylistKind } from './Playlist';
import type { Clock, IdGenerator } from './ports';
import type { Track } from './Song';

/** Default UI copy for the first playlist. */
export const DEFAULT_PLAYLIST_NAME = 'Mi lista';

export interface PlaylistLibraryDeps {
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Creates the default playlist on construction. Defaults to true. */
  readonly createDefault?: boolean;
}

/**
 * The user's playlists, stored as a DoublyLinkedList<Playlist>. At most one of them is the
 * automatic 'favorites' playlist: a track is liked exactly when it is in that playlist.
 */
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

  /** Appends a playlist. Kind 'favorites' is for restoring saved data; likes use `like`. */
  create(name: string, kind: PlaylistKind = 'regular'): Playlist {
    if (kind === 'favorites' && this.favorites !== null) {
      throw new InvalidOperationError('There is already a favorites playlist');
    }
    const playlist = this.#build(name, kind);
    const node = this.#lists.insertLast(playlist);
    if (this.#active === null) this.#active = node;
    return playlist;
  }

  rename(id: string, name: string): void {
    const playlist = this.get(id);
    if (playlist.kind === 'favorites') {
      throw new InvalidOperationError('The favorites playlist cannot be renamed');
    }
    playlist.rename(name);
    this.#version++;
  }

  remove(id: string): void {
    const node = this.#findNode(id);
    if (node.value.kind === 'favorites') {
      throw new InvalidOperationError('The favorites playlist cannot be removed');
    }
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

  /** The automatic playlist of liked songs, or null before the first like. */
  get favorites(): Playlist | null {
    const node = this.#lists.find((p) => p.kind === 'favorites');
    return node === null ? null : node.value;
  }

  isFavorite(trackId: string): boolean {
    return this.favorites?.hasTrack(trackId) ?? false;
  }

  favoriteTrackIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    const favorites = this.favorites;
    if (favorites !== null) for (const song of favorites.songs()) ids.add(song.trackId);
    return ids;
  }

  /**
   * Likes a track: appends it to the favorites playlist, creating that playlist (pinned first,
   * named `favoritesName`) on the first like. Returns false when the track was already liked.
   */
  like(track: Track, favoritesName: string): boolean {
    let favorites = this.favorites;
    if (favorites === null) {
      favorites = this.#build(favoritesName, 'favorites');
      const node = this.#lists.insertFirst(favorites);
      if (this.#active === null) this.#active = node;
    } else if (favorites.hasTrack(track.trackId)) {
      return false;
    }
    favorites.addLast(track);
    this.#version++;
    return true;
  }

  /** Removes every favorites entry of the track. Returns whether it was liked. */
  unlike(trackId: string): boolean {
    const favorites = this.favorites;
    if (favorites === null) return false;
    let removed = false;
    for (const song of favorites.songs()) {
      if (song.trackId !== trackId) continue;
      favorites.remove(song.entryId);
      removed = true;
    }
    if (removed) this.#version++;
    return removed;
  }

  #build(name: string, kind: PlaylistKind): Playlist {
    return new Playlist({
      id: this.#ids.next(),
      name,
      createdAt: this.#clock.now(),
      ids: this.#ids,
      kind,
    });
  }

  #findNode(id: string): Node<Playlist> {
    const node = this.#lists.find((p) => p.id === id);
    if (node === null) throw new PlaylistNotFoundError(id);
    return node;
  }
}
