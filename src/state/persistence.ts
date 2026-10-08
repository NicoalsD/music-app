import type { StorageLike } from '../auth/TokenStore';
import type { Clock, IdGenerator } from '../core/ports';
import { PlaylistLibrary } from '../core/PlaylistLibrary';
import type { PlaylistKind, RepeatMode } from '../core/Playlist';
import { Song } from '../core/Song';
import type { Artwork, SongSource, Track } from '../core/Song';

export const STORAGE_KEY = 'music-app:v1';
export const PERSIST_DEBOUNCE_MS = 300;
const SCHEMA_VERSION = 1;

export interface PersistedPreferences {
  readonly volume: number;
  readonly muted: boolean;
  readonly repeat: RepeatMode;
  readonly shuffle: boolean;
}

export interface PersistedEntry {
  readonly entryId: string;
  readonly track: Track;
  /** Local files cannot survive a reload (their blob URLs die), so they restore as unavailable. */
  readonly unavailable: boolean;
}

export interface PersistedPlaylist {
  readonly id: string;
  readonly name: string;
  /** Missing in data saved before favorites existed; read as 'regular'. */
  readonly kind?: PlaylistKind;
  readonly entries: readonly PersistedEntry[];
  readonly currentEntryId: string | null;
}

export interface PersistedState extends PersistedPreferences {
  readonly version: typeof SCHEMA_VERSION;
  readonly playlists: readonly PersistedPlaylist[];
  readonly activePlaylistId: string;
}

export const DEFAULT_PREFERENCES: PersistedPreferences = {
  volume: 1,
  muted: false,
  repeat: 'off',
  shuffle: false,
};

// ---- type guards ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRepeatMode(value: unknown): value is RepeatMode {
  return value === 'off' || value === 'all' || value === 'one';
}

function isSource(value: unknown): value is SongSource {
  return value === 'spotify' || value === 'local';
}

function isArtwork(value: unknown): value is Artwork {
  if (!isRecord(value)) return false;
  return (['small', 'medium', 'large'] as const).every(
    (key) => value[key] === undefined || isString(value[key]),
  );
}

function isTrack(value: unknown): value is Track {
  if (!isRecord(value)) return false;
  const album = value['album'];
  const artists = value['artists'];
  return (
    isString(value['trackId']) &&
    isSource(value['source']) &&
    isString(value['uri']) &&
    isString(value['title']) &&
    Array.isArray(artists) &&
    artists.every(isString) &&
    isRecord(album) &&
    isStringOrNull(album['id']) &&
    isString(album['name']) &&
    isFiniteNumber(value['durationMs']) &&
    isArtwork(value['artwork']) &&
    typeof value['explicit'] === 'boolean' &&
    isStringOrNull(value['externalUrl'])
  );
}

function isEntry(value: unknown): value is PersistedEntry {
  return (
    isRecord(value) &&
    isString(value['entryId']) &&
    typeof value['unavailable'] === 'boolean' &&
    isTrack(value['track'])
  );
}

function isPlaylistKind(value: unknown): value is PlaylistKind | undefined {
  return value === undefined || value === 'regular' || value === 'favorites';
}

function isPlaylist(value: unknown): value is PersistedPlaylist {
  if (!isRecord(value)) return false;
  const name = value['name'];
  const entries = value['entries'];
  return (
    isString(value['id']) &&
    isPlaylistKind(value['kind']) &&
    isString(name) &&
    name.trim() !== '' &&
    Array.isArray(entries) &&
    entries.every(isEntry) &&
    isStringOrNull(value['currentEntryId'])
  );
}

/** True when `value` is a valid persisted state (schema version 1). */
export function isPersistedState(value: unknown): value is PersistedState {
  if (!isRecord(value) || value['version'] !== SCHEMA_VERSION) return false;
  const playlists = value['playlists'];
  if (!Array.isArray(playlists) || playlists.length === 0 || !playlists.every(isPlaylist))
    return false;
  if (playlists.filter((p) => p.kind === 'favorites').length > 1) return false;
  const activeId = value['activePlaylistId'];
  return (
    isString(activeId) &&
    playlists.some((p) => p.id === activeId) &&
    isFiniteNumber(value['volume']) &&
    typeof value['muted'] === 'boolean' &&
    isRepeatMode(value['repeat']) &&
    typeof value['shuffle'] === 'boolean'
  );
}

// ---- serialization ------------------------------------------------------------

/** Drops everything that dies with the page: blob URLs of local files and their artwork. */
function toPersistedTrack(track: Track): Track {
  if (track.source !== 'local') return track;
  return { ...track, uri: '', artwork: {} };
}

/** Plain-data snapshot of the library and the preferences, ready for JSON. */
export function serializeState(
  library: PlaylistLibrary,
  preferences: PersistedPreferences,
): PersistedState {
  const playlists = library.all().map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    kind: playlist.kind,
    entries: playlist.songs().map((song) => ({
      entryId: song.entryId,
      track: toPersistedTrack(song),
      unavailable: song.source === 'local',
    })),
    currentEntryId: playlist.current === null ? null : playlist.current.entryId,
  }));
  return {
    version: SCHEMA_VERSION,
    playlists,
    activePlaylistId: library.active.id,
    ...preferences,
  };
}

/** Parses raw storage text. Corrupt or foreign data is ignored with a console warning. */
export function parsePersistedState(raw: string | null): PersistedState | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`${STORAGE_KEY}: stored state is not valid JSON, ignoring it`);
    return null;
  }
  if (!isPersistedState(parsed)) {
    console.warn(`${STORAGE_KEY}: stored state does not match the schema, ignoring it`);
    return null;
  }
  return parsed;
}

// ---- unavailable local entries ---------------------------------------------------

/** Track ids of local files that were restored without audio; playback skips them. */
export class UnavailableRegistry {
  readonly #ids = new Set<string>();
  #version = 0;

  get version(): number {
    return this.#version;
  }

  has(trackId: string): boolean {
    return this.#ids.has(trackId);
  }

  add(trackId: string): void {
    if (this.#ids.has(trackId)) return;
    this.#ids.add(trackId);
    this.#version++;
  }

  delete(trackId: string): void {
    if (this.#ids.delete(trackId)) this.#version++;
  }
}

// ---- restore ------------------------------------------------------------------------

export interface RestoredState {
  readonly library: PlaylistLibrary;
  readonly preferences: PersistedPreferences;
  readonly unavailable: UnavailableRegistry;
}

export interface RestoreDeps {
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Rebuilds a library from persisted data (or a fresh default one when there is none). */
export function restoreState(state: PersistedState | null, deps: RestoreDeps): RestoredState {
  const unavailable = new UnavailableRegistry();
  if (state === null) {
    return { library: new PlaylistLibrary(deps), preferences: DEFAULT_PREFERENCES, unavailable };
  }
  const library = new PlaylistLibrary({ ...deps, createDefault: false });
  let activeId: string | null = null;
  for (const saved of state.playlists) {
    const playlist = library.create(saved.name, saved.kind ?? 'regular');
    if (saved.id === state.activePlaylistId) activeId = playlist.id;
    for (const entry of saved.entries) {
      playlist.restore(new Song(entry.track, entry.entryId), playlist.size);
      if (entry.unavailable || entry.track.source === 'local') unavailable.add(entry.track.trackId);
    }
    if (saved.currentEntryId !== null && playlist.indexOf(saved.currentEntryId) !== -1) {
      playlist.select(saved.currentEntryId);
    }
  }
  if (activeId !== null) library.setActive(activeId);
  const { volume, muted, repeat, shuffle } = state;
  return {
    library,
    preferences: { volume: Math.min(Math.max(volume, 0), 1), muted, repeat, shuffle },
    unavailable,
  };
}

// ---- storage ----------------------------------------------------------------------------

/** Debounced, failure-tolerant localStorage persistence. */
export class StatePersistence {
  readonly #storage: StorageLike | null;
  readonly #debounceMs: number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pending: (() => PersistedState) | null = null;

  constructor(storage: StorageLike | null, debounceMs: number = PERSIST_DEBOUNCE_MS) {
    this.#storage = storage;
    this.#debounceMs = debounceMs;
  }

  load(): PersistedState | null {
    if (this.#storage === null) return null;
    try {
      return parsePersistedState(this.#storage.getItem(STORAGE_KEY));
    } catch {
      console.warn(`${STORAGE_KEY}: storage is not readable`);
      return null;
    }
  }

  /** Schedules a save; the latest producer wins and runs once the debounce elapses. */
  schedule(produce: () => PersistedState): void {
    this.#pending = produce;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), this.#debounceMs);
  }

  /** Writes any pending state right now (used when the page is hidden). */
  flush(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const produce = this.#pending;
    this.#pending = null;
    if (produce === null || this.#storage === null) return;
    try {
      this.#storage.setItem(STORAGE_KEY, JSON.stringify(produce()));
    } catch {
      console.warn(`${STORAGE_KEY}: could not save the state (storage full or blocked)`);
    }
  }
}
