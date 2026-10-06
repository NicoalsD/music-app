import type { AuthState } from '../auth/SpotifyAuth';
import { InvalidOperationError } from '../core/errors';
import type { Playlist } from '../core/Playlist';
import type { PlaylistLibrary } from '../core/PlaylistLibrary';
import type { Artwork, Song, SongSource, Track } from '../core/Song';
import type { PlayerEngine, PlayerProgress, PlayerState } from '../player/PlayerEngine';
import type { SpotifyStatus } from '../player/SpotifyOutput';
import type { ImportResult } from '../providers/LocalFileProvider';
import type { MusicProvider } from '../providers/MusicProvider';
import { strings } from '../ui/i18n/es';
import { ForbiddenAwareProvider } from './ForbiddenAwareProvider';
import { serializeState } from './persistence';
import type { StatePersistence, UnavailableRegistry } from './persistence';

/** How long a removed song can be restored. Also when local object URLs are released. */
export const UNDO_WINDOW_MS = 5000;
export const PLAYLIST_NAME_MAX = 60;

/** Where imported local files go. `at.index` is zero-based. */
export type ImportPlacement =
  | { readonly kind: 'last' }
  | { readonly kind: 'first' }
  | { readonly kind: 'next' }
  | { readonly kind: 'at'; readonly index: number };

export type PlaylistNameProblem = 'empty' | 'too-long';

/** Returns what is wrong with a playlist name, or null when it is valid. */
export function validatePlaylistName(name: string): PlaylistNameProblem | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  return trimmed.length > PLAYLIST_NAME_MAX ? 'too-long' : null;
}

// ---- ports ------------------------------------------------------------------------

/** Feedback channel (toasts). The store never imports the toast library. */
export interface Notifier {
  notify(message: string): void;
  error(message: string): void;
  undo(message: string, onUndo: () => void, durationMs: number): void;
}

export interface AuthPort {
  readonly isLoggedIn: boolean;
  subscribe(listener: (state: AuthState) => void): () => void;
  login(): Promise<void>;
  logout(): void;
}

export interface SpotifyPort {
  getStatus(): SpotifyStatus;
  onStatusChange(listener: (status: SpotifyStatus) => void): () => void;
  init(): Promise<void>;
}

export interface LocalImporter {
  importFiles(files: readonly File[]): Promise<ImportResult>;
  release(track: Track): void;
}

export interface PlayerStoreDeps {
  readonly library: PlaylistLibrary;
  readonly engine: PlayerEngine;
  readonly provider: MusicProvider;
  readonly local: LocalImporter;
  readonly auth: AuthPort;
  readonly spotify: SpotifyPort;
  readonly notifier: Notifier;
  readonly unavailable: UnavailableRegistry;
  readonly persistence?: StatePersistence | null;
}

// ---- snapshot ---------------------------------------------------------------------

export interface PlaylistSummary {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly isActive: boolean;
}

export interface SongView {
  readonly entryId: string;
  readonly trackId: string;
  readonly title: string;
  readonly artistLabel: string;
  readonly albumName: string;
  readonly durationMs: number;
  readonly artwork: Artwork;
  readonly source: SongSource;
  readonly externalUrl: string | null;
  readonly explicit: boolean;
  readonly isCurrent: boolean;
  readonly isHead: boolean;
  readonly isTail: boolean;
  readonly index: number;
  /** A restored local file whose audio is gone: rendered disabled and skipped. */
  readonly unavailable: boolean;
}

export type SpotifyStatusView = SpotifyStatus | 'forbidden';

export interface PlayerSnapshot {
  readonly playlists: readonly PlaylistSummary[];
  readonly activePlaylistId: string;
  readonly activePlaylistName: string;
  readonly songs: readonly SongView[];
  readonly currentEntryId: string | null;
  /** Index of the current song in `songs`, or -1. */
  readonly currentIndex: number;
  readonly player: PlayerState;
  readonly spotify: { readonly auth: AuthState; readonly status: SpotifyStatusView };
  readonly totalDurationMs: number;
}

export interface UndoHandle {
  readonly entryId: string;
  /** Restores the song at its original position; a no-op once the window has expired. */
  undo(): void;
}

interface PendingRemoval {
  readonly playlistId: string;
  readonly song: Song;
  readonly index: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

function samePlaylists(a: readonly PlaylistSummary[], b: readonly PlaylistSummary[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i];
      return (
        q !== undefined &&
        p.id === q.id &&
        p.name === q.name &&
        p.size === q.size &&
        p.isActive === q.isActive
      );
    })
  );
}

/** Class-based observable store: the only way the UI reads or changes the app state. */
export class PlayerStore {
  readonly provider: MusicProvider;
  readonly #library: PlaylistLibrary;
  readonly #engine: PlayerEngine;
  readonly #local: LocalImporter;
  readonly #auth: AuthPort;
  readonly #spotify: SpotifyPort;
  readonly #notifier: Notifier;
  readonly #unavailable: UnavailableRegistry;
  readonly #persistence: StatePersistence | null;
  readonly #listeners = new Set<() => void>();
  readonly #removals = new Map<string, PendingRemoval>();
  readonly #disposers: (() => void)[] = [];
  #forbidden = false;
  #snapshot: PlayerSnapshot;
  #songsKey = '';

  constructor(deps: PlayerStoreDeps) {
    this.#library = deps.library;
    this.#engine = deps.engine;
    this.#local = deps.local;
    this.#auth = deps.auth;
    this.#spotify = deps.spotify;
    this.#notifier = deps.notifier;
    this.#unavailable = deps.unavailable;
    this.#persistence = deps.persistence ?? null;
    this.provider = new ForbiddenAwareProvider(
      deps.provider,
      () => this.#setForbidden(true),
      () => this.#setForbidden(false),
    );
    this.#snapshot = this.#build(null);
    this.#disposers.push(
      this.#engine.subscribe(() => this.#refresh()),
      this.#auth.subscribe((state) => {
        if (state === 'logged-in') this.#initSpotify();
        this.#refresh();
      }),
      this.#spotify.onStatusChange(() => this.#refresh()),
    );
  }

  // ---- observable surface -------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Same reference until something observable changes. */
  readonly getSnapshot = (): PlayerSnapshot => this.#snapshot;

  readonly subscribeProgress = (listener: (progress: PlayerProgress) => void): (() => void) =>
    this.#engine.subscribeProgress(listener);

  readonly getProgress = (): PlayerProgress => this.#engine.getProgress();

  /** Connects the Spotify player when there is a session. Safe to call more than once. */
  start(): void {
    if (this.#auth.isLoggedIn) this.#initSpotify();
    this.#refresh();
  }

  /** Detaches from the engine and flushes pending timers. */
  dispose(): void {
    for (const dispose of this.#disposers.splice(0)) dispose();
    for (const key of [...this.#removals.keys()]) this.#settleRemoval(key);
    this.#persistence?.flush();
    this.#listeners.clear();
  }

  // ---- adding songs -------------------------------------------------------------

  addFirst(track: Track): void {
    this.#active().addFirst(track);
    this.#mutated();
    this.#notifier.notify(strings.add.addedToStart(track.title));
  }

  addLast(track: Track): void {
    this.#active().addLast(track);
    this.#mutated();
    this.#notifier.notify(strings.add.addedToEnd(track.title));
  }

  /** `index` is zero-based (0..size). */
  addAt(index: number, track: Track): void {
    const song = this.#active().addAt(index, track);
    this.#mutated();
    this.#notifier.notify(
      strings.add.addedAt(track.title, this.#active().indexOf(song.entryId) + 1),
    );
  }

  /** Inserts right after the current song ("play next"). */
  addNext(track: Track): void {
    const playlist = this.#active();
    const song = playlist.addNext(track);
    this.#mutated();
    this.#notifier.notify(strings.add.addedAt(track.title, playlist.indexOf(song.entryId) + 1));
  }

  /** Inserts right after the current song and starts playing it. */
  playNow(track: Track): void {
    const song = this.#active().addNext(track);
    this.#guard(this.#engine.onPlaylistChanged().then(() => this.#engine.playEntry(song.entryId)));
    this.#refresh();
  }

  addManyLast(tracks: readonly Track[], label?: string): void {
    if (tracks.length === 0) return;
    this.#active().addManyLast(tracks);
    this.#mutated();
    this.#notifier.notify(
      strings.detail.albumAddedToEnd(label ?? tracks[0]?.album.name ?? '', tracks.length),
    );
  }

  addManyFirst(tracks: readonly Track[], label?: string): void {
    if (tracks.length === 0) return;
    this.#active().addManyFirst(tracks);
    this.#mutated();
    this.#notifier.notify(
      strings.detail.albumAddedToStart(label ?? tracks[0]?.album.name ?? '', tracks.length),
    );
  }

  // ---- removing, moving ---------------------------------------------------------

  /** Removes a song and offers a 5 s undo. Local object URLs are released only after the window. */
  remove(entryId: string): UndoHandle {
    const playlist = this.#active();
    const result = playlist.remove(entryId);
    const timer = setTimeout(() => this.#settleRemoval(entryId), UNDO_WINDOW_MS);
    this.#removals.set(entryId, {
      playlistId: playlist.id,
      song: result.removed,
      index: result.index,
      timer,
    });
    this.#mutated();
    const handle: UndoHandle = { entryId, undo: () => this.#undoRemoval(entryId) };
    this.#notifier.undo(strings.add.removed(result.removed.title), handle.undo, UNDO_WINDOW_MS);
    return handle;
  }

  /** Moves a song between zero-based positions (reorder). */
  move(from: number, to: number): void {
    if (from === to) return;
    this.#active().move(from, to);
    this.#mutated();
  }

  // ---- playback -----------------------------------------------------------------

  /** Starts playing the given entry. Restored local files that lost their audio are refused. */
  playEntry(entryId: string): void {
    const playlist = this.#active();
    const index = playlist.indexOf(entryId);
    const song = playlist.songs()[index];
    if (song !== undefined && this.#unavailable.has(song.trackId)) {
      this.#notifier.error(strings.errors.unavailableTrack);
      return;
    }
    this.#guard(this.#engine.playEntry(entryId));
  }

  select(entryId: string): void {
    this.playEntry(entryId);
  }

  togglePlay(): void {
    this.#guard(this.#engine.togglePlay());
  }

  next(): void {
    this.#guard(this.#engine.next());
  }

  previous(): void {
    this.#guard(this.#engine.previous());
  }

  seek(positionMs: number): void {
    this.#guard(this.#engine.seek(positionMs));
  }

  setVolume(volume: number): void {
    this.#guard(this.#engine.setVolume(volume));
  }

  toggleMute(): void {
    this.#guard(this.#engine.toggleMute());
  }

  cycleRepeat(): void {
    this.#engine.cycleRepeat();
  }

  toggleShuffle(): void {
    this.#engine.toggleShuffle();
  }

  // ---- playlists ----------------------------------------------------------------

  /** Creates a playlist and makes it the active one. Returns its id. */
  async createPlaylist(name: string): Promise<string> {
    this.#assertValidName(name);
    const playlist = this.#library.create(name);
    await this.#engine.switchPlaylist(playlist.id);
    this.#refresh();
    this.#notifier.notify(strings.playlist.createdToast(playlist.name));
    return playlist.id;
  }

  renamePlaylist(id: string, name: string): void {
    this.#assertValidName(name);
    this.#library.rename(id, name);
    this.#refresh();
    this.#notifier.notify(strings.playlist.renamedToast(name.trim()));
  }

  /** Returns false (and does nothing) when it is the last playlist. */
  async deletePlaylist(id: string): Promise<boolean> {
    if (this.#library.size <= 1) return false;
    const target = this.#library.get(id);
    if (target.id === this.#library.active.id) {
      const fallback = this.#library.all().find((p) => p.id !== id);
      if (fallback === undefined) return false;
      await this.#engine.switchPlaylist(fallback.id);
    }
    const doomed = target.songs();
    for (const [key, pending] of [...this.#removals]) {
      if (pending.playlistId === id) this.#settleRemoval(key);
    }
    const name = target.name;
    this.#library.remove(id);
    for (const song of doomed) this.#releaseIfUnreferenced(song);
    this.#refresh();
    this.#notifier.notify(strings.playlist.deletedToast(name));
    return true;
  }

  switchPlaylist(id: string): void {
    this.#guard(this.#engine.switchPlaylist(id));
  }

  // ---- local files ----------------------------------------------------------------

  /**
   * Imports audio files into the active playlist. Several files keep their selection order.
   * `placement` defaults to the end; `at.index` is zero-based and clamped to 0..size because the
   * list can change while the file picker is open.
   */
  async importLocalFiles(
    files: readonly File[],
    placement: ImportPlacement = { kind: 'last' },
  ): Promise<number> {
    const { tracks, rejected } = await this.#local.importFiles(files);
    if (tracks.length > 0) {
      this.#insertImported(tracks, placement);
      this.#mutated();
    }
    if (rejected.length > 0) {
      this.#notifier.error(
        strings.library.rejectedFiles(rejected.map((r) => r.fileName).join(', ')),
      );
    } else if (tracks.length === 0) {
      this.#notifier.error(strings.library.importNothing);
    }
    return tracks.length;
  }

  #insertImported(tracks: readonly Track[], placement: ImportPlacement): void {
    const playlist = this.#active();
    const count = tracks.length;
    switch (placement.kind) {
      case 'last':
        playlist.addManyLast(tracks);
        this.#notifier.notify(strings.library.importedCount(count));
        return;
      case 'first':
        playlist.addManyFirst(tracks);
        this.#notifier.notify(strings.library.importedAtStart(count));
        return;
      case 'next':
        playlist.addManyNext(tracks);
        this.#notifier.notify(strings.library.importedNext(count));
        return;
      case 'at': {
        const index = Math.min(Math.max(Math.trunc(placement.index), 0), playlist.size);
        playlist.addManyAt(index, tracks);
        this.#notifier.notify(strings.library.importedAt(count, index + 1));
        return;
      }
    }
  }

  // ---- Spotify session ----------------------------------------------------------------

  async login(): Promise<void> {
    try {
      await this.#auth.login();
    } catch {
      this.#notifier.error(strings.spotify.loginFailed);
    }
  }

  logout(): void {
    const current = this.#active().current;
    if (current !== null && current.source === 'spotify') this.#guard(this.#engine.pause());
    this.#auth.logout();
    this.#refresh();
  }

  /** Retries the Spotify player connection. */
  reconnectSpotify(): void {
    this.#initSpotify();
  }

  // ---- internals ------------------------------------------------------------------------

  #active(): Playlist {
    return this.#library.active;
  }

  #assertValidName(name: string): void {
    const problem = validatePlaylistName(name);
    if (problem !== null) throw new InvalidOperationError(`Invalid playlist name: ${problem}`);
  }

  #initSpotify(): void {
    this.#spotify.init().then(
      () => this.#refresh(),
      () => this.#refresh(),
    );
  }

  #setForbidden(value: boolean): void {
    if (this.#forbidden === value) return;
    this.#forbidden = value;
    this.#refresh();
  }

  /** After any change to the active playlist's songs. */
  #mutated(): void {
    this.#guard(this.#engine.onPlaylistChanged());
    this.#refresh();
  }

  #guard(promise: Promise<unknown>): void {
    promise.then(
      () => this.#refresh(),
      () => {
        this.#notifier.error(strings.errors.generic);
        this.#refresh();
      },
    );
  }

  #undoRemoval(entryId: string): void {
    const pending = this.#removals.get(entryId);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.#removals.delete(entryId);
    const playlist = this.#library.all().find((p) => p.id === pending.playlistId);
    if (playlist === undefined) {
      this.#releaseIfUnreferenced(pending.song);
      return;
    }
    playlist.restore(pending.song, pending.index);
    if (playlist.id === this.#active().id) this.#mutated();
    else this.#refresh();
  }

  /** Ends an undo window: the song is gone for good, so its object URLs can be freed. */
  #settleRemoval(entryId: string): void {
    const pending = this.#removals.get(entryId);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.#removals.delete(entryId);
    this.#releaseIfUnreferenced(pending.song);
  }

  /** Frees a local track's URLs once no entry or pending undo uses it any more. */
  #releaseIfUnreferenced(song: Song): void {
    if (this.#isReferenced(song.trackId)) return;
    this.#unavailable.delete(song.trackId);
    if (song.source === 'local') this.#local.release(song);
  }

  #isReferenced(trackId: string): boolean {
    for (const playlist of this.#library.all()) {
      if (playlist.songs().some((s) => s.trackId === trackId)) return true;
    }
    for (const pending of this.#removals.values()) {
      if (pending.song.trackId === trackId) return true;
    }
    return false;
  }

  #refresh(): void {
    const next = this.#build(this.#snapshot);
    if (next === this.#snapshot) return;
    this.#snapshot = next;
    this.#persistence?.schedule(() =>
      serializeState(this.#library, {
        volume: next.player.volume,
        muted: next.player.muted,
        repeat: next.player.repeat,
        shuffle: next.player.shuffle,
      }),
    );
    for (const listener of [...this.#listeners]) listener();
  }

  /** Builds a snapshot, reusing the previous one (and its arrays) when nothing changed. */
  #build(previous: PlayerSnapshot | null): PlayerSnapshot {
    const playlist = this.#active();
    const player = this.#engine.getState();
    const playlists = this.#summaries(previous?.playlists ?? null);
    const songs = this.#songViews(playlist, previous?.songs ?? null);
    const current = playlist.current;
    const currentEntryId = current === null ? null : current.entryId;
    const spotify = {
      auth: this.#auth.isLoggedIn ? ('logged-in' as const) : ('logged-out' as const),
      status: this.#forbidden ? ('forbidden' as const) : this.#spotify.getStatus(),
    };
    const totalDurationMs = playlist.totalDurationMs;
    const currentIndex = currentEntryId === null ? -1 : playlist.currentIndex;
    if (
      previous !== null &&
      previous.playlists === playlists &&
      previous.songs === songs &&
      previous.activePlaylistId === playlist.id &&
      previous.activePlaylistName === playlist.name &&
      previous.currentEntryId === currentEntryId &&
      previous.currentIndex === currentIndex &&
      previous.player === player &&
      previous.spotify.auth === spotify.auth &&
      previous.spotify.status === spotify.status &&
      previous.totalDurationMs === totalDurationMs
    ) {
      return previous;
    }
    return {
      playlists,
      activePlaylistId: playlist.id,
      activePlaylistName: playlist.name,
      songs,
      currentEntryId,
      currentIndex,
      player,
      spotify,
      totalDurationMs,
    };
  }

  #summaries(previous: readonly PlaylistSummary[] | null): readonly PlaylistSummary[] {
    const activeId = this.#active().id;
    const next = this.#library
      .all()
      .map((p) => ({ id: p.id, name: p.name, size: p.size, isActive: p.id === activeId }));
    return previous !== null && samePlaylists(previous, next) ? previous : next;
  }

  #songViews(playlist: Playlist, previous: readonly SongView[] | null): readonly SongView[] {
    const key = `${playlist.id}:${playlist.version}:${this.#unavailable.version}`;
    if (previous !== null && key === this.#songsKey) return previous;
    this.#songsKey = key;
    const list = playlist.songs();
    const current = playlist.current;
    return list.map((song, index) => ({
      entryId: song.entryId,
      trackId: song.trackId,
      title: song.title,
      artistLabel: song.artistLabel,
      albumName: song.album.name,
      durationMs: song.durationMs,
      artwork: song.artwork,
      source: song.source,
      externalUrl: song.externalUrl,
      explicit: song.explicit,
      isCurrent: current !== null && song.entryId === current.entryId,
      isHead: index === 0,
      isTail: index === list.length - 1,
      index,
      unavailable: this.#unavailable.has(song.trackId),
    }));
  }
}
