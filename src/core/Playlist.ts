import { DoublyLinkedList } from './DoublyLinkedList';
import { IndexOutOfRangeError, InvalidOperationError, SongNotFoundError } from './errors';
import type { Node } from './Node';
import type { IdGenerator } from './ports';
import { Song } from './Song';
import type { Track } from './Song';

export type RepeatMode = 'off' | 'all' | 'one';

/** 'favorites' is the automatic playlist of liked songs; every other playlist is 'regular'. */
export type PlaylistKind = 'regular' | 'favorites';

export interface RemoveResult {
  readonly removed: Song;
  readonly index: number;
  readonly currentChanged: boolean;
  readonly newCurrent: Song | null;
}

export interface PlaylistParams {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly ids: IdGenerator;
  /** Defaults to 'regular'. */
  readonly kind?: PlaylistKind;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new InvalidOperationError('Playlist name cannot be empty');
  return trimmed;
}

/** A named list of songs with a `current` pointer. */
export class Playlist {
  readonly id: string;
  readonly createdAt: number;
  readonly kind: PlaylistKind;
  #name: string;
  readonly #ids: IdGenerator;
  readonly #songs = new DoublyLinkedList<Song>();
  #current: Node<Song> | null = null;
  #selectionVersion = 0;
  #metaVersion = 0;

  constructor(params: PlaylistParams) {
    this.id = params.id;
    this.createdAt = params.createdAt;
    this.kind = params.kind ?? 'regular';
    this.#name = normalizeName(params.name);
    this.#ids = params.ids;
  }

  get name(): string {
    return this.#name;
  }

  get size(): number {
    return this.#songs.size;
  }

  /** Incremented on every mutation, including current changes and renames. */
  get version(): number {
    return this.#songs.version + this.#selectionVersion + this.#metaVersion;
  }

  get current(): Song | null {
    return this.#current === null ? null : this.#current.value;
  }

  get currentIndex(): number {
    return this.#current === null ? -1 : this.#songs.indexOf(this.#current);
  }

  get totalDurationMs(): number {
    let total = 0;
    for (const song of this.#songs) total += song.durationMs;
    return total;
  }

  songs(): readonly Song[] {
    return this.#songs.toArray();
  }

  /** True when any entry of the playlist is the given track. */
  hasTrack(trackId: string): boolean {
    return this.#songs.find((song) => song.trackId === trackId) !== null;
  }

  rename(name: string): void {
    this.#name = normalizeName(name);
    this.#metaVersion++;
  }

  indexOf(entryId: string): number {
    return this.#songs.findIndex((s) => s.entryId === entryId);
  }

  addFirst(track: Track): Song {
    return this.#adopt(this.#songs.insertFirst(this.#toSong(track)));
  }

  addLast(track: Track): Song {
    return this.#adopt(this.#songs.insertLast(this.#toSong(track)));
  }

  addAt(index: number, track: Track): Song {
    return this.#adopt(this.#songs.insertAt(index, this.#toSong(track)));
  }

  /** Inserts right after current; at the start when there is no current. */
  addNext(track: Track): Song {
    if (this.#current === null) return this.addFirst(track);
    return this.#adopt(this.#songs.insertAfter(this.#current, this.#toSong(track)));
  }

  addManyLast(tracks: readonly Track[]): Song[] {
    return tracks.map((t) => this.addLast(t));
  }

  /** Prepends all tracks keeping their relative (album) order. */
  addManyFirst(tracks: readonly Track[]): Song[] {
    const added: Song[] = [];
    tracks.forEach((t, i) => added.push(this.addAt(i, t)));
    return added;
  }

  /** Inserts all tracks starting at `index` (0..size), keeping their given order. */
  addManyAt(index: number, tracks: readonly Track[]): Song[] {
    if (!Number.isInteger(index) || index < 0 || index > this.size) {
      throw new IndexOutOfRangeError(index, 0, this.size);
    }
    return tracks.map((t, i) => this.addAt(index + i, t));
  }

  /** Inserts all tracks right after current (at the start when there is none), in order. */
  addManyNext(tracks: readonly Track[]): Song[] {
    return this.addManyAt(this.#current === null ? 0 : this.currentIndex + 1, tracks);
  }

  remove(entryId: string): RemoveResult {
    const node = this.#songs.find((s) => s.entryId === entryId);
    if (node === null) throw new SongNotFoundError(entryId);
    const index = this.#songs.indexOf(node);
    const wasCurrent = node === this.#current;
    const replacement = wasCurrent ? (node.next ?? node.prev) : this.#current;
    const removed = this.#songs.removeNode(node);
    if (wasCurrent) {
      this.#current = replacement;
      this.#selectionVersion++;
    }
    return {
      removed,
      index,
      currentChanged: wasCurrent,
      newCurrent: this.current,
    };
  }

  /** Reinserts the exact Song object (undo). Index is clamped to 0..size. */
  restore(song: Song, index: number): Song {
    const at = Math.min(Math.max(Math.trunc(index), 0), this.#songs.size);
    return this.#adopt(this.#songs.insertAt(at, song));
  }

  move(from: number, to: number): void {
    this.#songs.move(from, to);
  }

  select(entryId: string): Song {
    const node = this.#songs.find((s) => s.entryId === entryId);
    if (node === null) throw new SongNotFoundError(entryId);
    this.#setCurrent(node);
    return node.value;
  }

  next(repeat: RepeatMode): Song | null {
    const target = this.#nextNode(repeat);
    if (target === null) return null;
    this.#setCurrent(target);
    return target.value;
  }

  previous(repeat: RepeatMode): Song | null {
    const target = this.#previousNode(repeat);
    if (target === null) return null;
    this.#setCurrent(target);
    return target.value;
  }

  peekNext(repeat: RepeatMode): Song | null {
    const target = this.#nextNode(repeat);
    return target === null ? null : target.value;
  }

  peekPrevious(repeat: RepeatMode): Song | null {
    const target = this.#previousNode(repeat);
    return target === null ? null : target.value;
  }

  #nextNode(repeat: RepeatMode): Node<Song> | null {
    if (this.#current === null) return this.#songs.head;
    if (this.#current.next !== null) return this.#current.next;
    return repeat === 'off' ? null : this.#songs.head;
  }

  #previousNode(repeat: RepeatMode): Node<Song> | null {
    if (this.#current === null) return this.#songs.head;
    if (this.#current.prev !== null) return this.#current.prev;
    return repeat === 'off' ? this.#current : this.#songs.tail;
  }

  #setCurrent(node: Node<Song>): void {
    if (node === this.#current) return;
    this.#current = node;
    this.#selectionVersion++;
  }

  #toSong(track: Track): Song {
    return Song.fromTrack(track, this.#ids);
  }

  /** Makes the inserted node current when nothing is current yet. */
  #adopt(node: Node<Song>): Song {
    if (this.#current === null) {
      this.#current = node;
      this.#selectionVersion++;
    }
    return node.value;
  }
}
