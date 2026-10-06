import { PlaybackError } from '../core/errors';
import type { PlaylistLibrary } from '../core/PlaylistLibrary';
import type { RepeatMode } from '../core/Playlist';
import type { Clock, Random } from '../core/ports';
import { ShuffleOrder } from '../core/ShuffleOrder';
import type { Song, SongSource } from '../core/Song';
import type { AudioOutput, AudioOutputEvent } from './AudioOutput';
import type { MediaSessionAdapter } from './MediaSessionAdapter';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/** Immutable snapshot. positionMs here is only refreshed on discrete events, never on ticks. */
export interface PlayerState {
  readonly status: PlayerStatus;
  readonly currentEntryId: string | null;
  readonly positionMs: number;
  readonly durationMs: number;
  /** 0..1. While muted this is the level that unmuting restores. */
  readonly volume: number;
  readonly muted: boolean;
  readonly repeat: RepeatMode;
  readonly shuffle: boolean;
  /** An English key the UI translates, or null. */
  readonly error: string | null;
}

/** Live position, published separately from the main snapshot. */
export interface PlayerProgress {
  readonly positionMs: number;
  readonly durationMs: number;
}

export type PlayerListener = (state: PlayerState) => void;
export type ProgressListener = (progress: PlayerProgress) => void;

export interface PlayerEngineDeps {
  readonly library: PlaylistLibrary;
  readonly outputs: Partial<Record<SongSource, AudioOutput>>;
  readonly random: Random;
  readonly clock: Clock;
  readonly mediaSession?: MediaSessionAdapter;
  /** Restored user preferences. */
  readonly initial?: Partial<Pick<PlayerState, 'volume' | 'muted' | 'repeat' | 'shuffle'>>;
}

export const PREVIOUS_RESTART_THRESHOLD_MS = 3000;
const MEDIA_POSITION_INTERVAL_MS = 1000;

/** Failures that retrying with another song cannot fix; playback stops with this key. */
const FATAL_ERROR_KEYS: ReadonlySet<string> = new Set(['spotify-not-ready']);

type PlayKind = 'fresh' | 'resume' | 'restart';

function isAutoplayBlocked(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'NotAllowedError' || message === 'autoplay-blocked';
}

/** Orchestrates the active playlist and the AudioOutputs that produce sound. */
export class PlayerEngine {
  readonly #library: PlaylistLibrary;
  readonly #outputs: Partial<Record<SongSource, AudioOutput>>;
  readonly #random: Random;
  readonly #clock: Clock;
  readonly #media: MediaSessionAdapter | null;
  readonly #listeners = new Set<PlayerListener>();
  readonly #progressListeners = new Set<ProgressListener>();
  readonly #unsubscribeOutputs: (() => void)[] = [];

  #state: PlayerState;
  #progress: PlayerProgress = { positionMs: 0, durationMs: 0 };
  #shuffleOrder: ShuffleOrder | null = null;
  #active: AudioOutput | null = null;
  #loadedEntryId: string | null = null;
  #lastAudibleVolume: number;
  #token = 0;
  #pending = false;
  #failures = 0;
  #pausedByOutput = false;
  #lastMediaPositionAt = Number.NEGATIVE_INFINITY;
  #disposed = false;

  constructor(deps: PlayerEngineDeps) {
    this.#library = deps.library;
    this.#outputs = deps.outputs;
    this.#random = deps.random;
    this.#clock = deps.clock;
    this.#media = deps.mediaSession ?? null;
    const volume = Math.min(Math.max(deps.initial?.volume ?? 1, 0), 1);
    this.#lastAudibleVolume = volume > 0 ? volume : 1;
    const current = this.#library.active.current;
    this.#state = {
      status: 'idle',
      currentEntryId: current === null ? null : current.entryId,
      positionMs: 0,
      durationMs: current === null ? 0 : current.durationMs,
      volume,
      muted: deps.initial?.muted ?? false,
      repeat: deps.initial?.repeat ?? 'off',
      shuffle: deps.initial?.shuffle ?? false,
      error: null,
    };
    this.#progress = { positionMs: 0, durationMs: this.#state.durationMs };
    if (this.#state.shuffle) this.#rebuildShuffle();
    for (const output of Object.values(this.#outputs)) {
      this.#unsubscribeOutputs.push(output.subscribe((event) => this.#onOutputEvent(output, event)));
    }
    this.#media?.setActionHandlers({
      play: () => void this.play(),
      pause: () => void this.pause(),
      previoustrack: () => void this.previous(),
      nexttrack: () => void this.next(),
      seekto: (positionMs) => void this.seek(positionMs),
    });
  }

  getState(): PlayerState {
    return this.#state;
  }

  getProgress(): PlayerProgress {
    return this.#progress;
  }

  subscribe(listener: PlayerListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  subscribeProgress(listener: ProgressListener): () => void {
    this.#progressListeners.add(listener);
    return () => {
      this.#progressListeners.delete(listener);
    };
  }

  // ---- transport commands -------------------------------------------------

  async play(): Promise<void> {
    if (this.#disposed) return;
    const playlist = this.#library.active;
    const first = playlist.current ?? playlist.songs()[0];
    if (first === undefined) return;
    const { status } = this.#state;
    if (status === 'playing' || status === 'loading') return;
    const song = playlist.select(first.entryId);
    this.#failures = 0;
    const resumable = status === 'paused' && this.#loadedEntryId === song.entryId;
    await this.#start(song, resumable ? 'resume' : 'fresh');
  }

  async pause(): Promise<void> {
    if (this.#disposed) return;
    const { status } = this.#state;
    if (status !== 'playing' && status !== 'loading') return;
    this.#token++;
    this.#pending = false;
    this.#pausedByOutput = false;
    this.#setState({ status: 'paused', positionMs: this.#progress.positionMs });
    await this.#pauseOutput(this.#active);
  }

  async togglePlay(): Promise<void> {
    const { status } = this.#state;
    if (status === 'playing' || status === 'loading') await this.pause();
    else await this.play();
  }

  async next(): Promise<void> {
    if (this.#disposed || this.#library.active.size === 0) return;
    this.#failures = 0;
    const target = this.#pickNext(this.#state.repeat);
    if (target === null) await this.#stopAtEnd();
    else await this.#start(target, 'fresh');
  }

  async previous(): Promise<void> {
    if (this.#disposed) return;
    const playlist = this.#library.active;
    const current = playlist.current;
    if (current === null) return;
    if (this.#progress.positionMs > PREVIOUS_RESTART_THRESHOLD_MS) {
      await this.seek(0);
      return;
    }
    this.#failures = 0;
    const target = this.#pickPrevious(this.#state.repeat);
    if (target === null || target.entryId === current.entryId) {
      if (this.#loadedEntryId === current.entryId) await this.seek(0);
      else await this.#start(current, 'fresh');
      return;
    }
    await this.#start(target, 'fresh');
  }

  /** Starts the given entry from the beginning. Throws SongNotFoundError for unknown ids. */
  async playEntry(entryId: string): Promise<void> {
    if (this.#disposed) return;
    const song = this.#library.active.select(entryId);
    this.#failures = 0;
    await this.#start(song, 'fresh');
  }

  /** Seeks the loaded song, clamping to [0, duration]. */
  async seek(positionMs: number): Promise<void> {
    const output = this.#active;
    if (this.#disposed || output === null || this.#loadedEntryId === null) return;
    if (!Number.isFinite(positionMs)) return;
    const duration = this.#progress.durationMs;
    const clamped = Math.min(Math.max(positionMs, 0), duration > 0 ? duration : Number.POSITIVE_INFINITY);
    await output.seek(clamped);
    this.#publishProgress(clamped, duration);
    this.#setState({ positionMs: clamped });
    this.#updateMediaPosition(true);
  }

  // ---- volume, repeat, shuffle -------------------------------------------

  async setVolume(volume: number): Promise<void> {
    if (this.#disposed || !Number.isFinite(volume)) return;
    const clamped = Math.min(Math.max(volume, 0), 1);
    if (clamped > 0) this.#lastAudibleVolume = clamped;
    this.#setState({ volume: clamped, muted: clamped > 0 ? false : this.#state.muted });
    await this.#applyVolume();
  }

  async toggleMute(): Promise<void> {
    if (this.#disposed) return;
    if (this.#state.muted) {
      const volume = this.#state.volume > 0 ? this.#state.volume : this.#lastAudibleVolume;
      this.#setState({ muted: false, volume });
    } else {
      this.#setState({ muted: true });
    }
    await this.#applyVolume();
  }

  setRepeat(mode: RepeatMode): void {
    this.#setState({ repeat: mode });
  }

  cycleRepeat(): void {
    const order: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
    this.#setState({ repeat: order[this.#state.repeat] });
  }

  toggleShuffle(): void {
    if (this.#state.shuffle) {
      this.#shuffleOrder = null;
      this.#setState({ shuffle: false });
    } else {
      this.#setState({ shuffle: true });
      this.#rebuildShuffle();
    }
  }

  // ---- playlist integration ----------------------------------------------

  /** Call after songs were added to or removed from the active playlist. */
  async onPlaylistChanged(): Promise<void> {
    if (this.#disposed) return;
    const playlist = this.#library.active;
    this.#syncShuffle();
    const current = playlist.current;
    if (current === null) {
      await this.#release();
      return;
    }
    const tracked = this.#state.currentEntryId;
    if (tracked === current.entryId) return;
    const wasRemoved = tracked !== null && playlist.indexOf(tracked) === -1;
    const { status } = this.#state;
    if (wasRemoved && (status === 'playing' || status === 'loading')) {
      this.#failures = 0;
      await this.#start(current, 'fresh');
      return;
    }
    this.#loadedEntryId = null;
    this.#publishProgress(0, current.durationMs);
    this.#setState({ currentEntryId: current.entryId, positionMs: 0, durationMs: current.durationMs });
    this.#media?.setMetadata(current);
  }

  /** Pauses playback, activates another playlist and resets the playback state. */
  async switchPlaylist(id: string): Promise<void> {
    if (this.#disposed) return;
    this.#library.get(id);
    this.#token++;
    this.#pending = false;
    await this.#pauseOutput(this.#active);
    this.#library.setActive(id);
    this.#loadedEntryId = null;
    this.#failures = 0;
    const current = this.#library.active.current;
    const durationMs = current === null ? 0 : current.durationMs;
    this.#publishProgress(0, durationMs);
    this.#setState({
      status: 'idle',
      currentEntryId: current === null ? null : current.entryId,
      positionMs: 0,
      durationMs,
      error: null,
    });
    if (this.#state.shuffle) this.#rebuildShuffle();
    this.#media?.setMetadata(current);
    this.#media?.setPlaybackState('none');
  }

  /** Stops listening and silences the active output. Outputs themselves are owned by the caller. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#token++;
    this.#pending = false;
    for (const unsubscribe of this.#unsubscribeOutputs.splice(0)) unsubscribe();
    void this.#pauseOutput(this.#active);
    this.#media?.setActionHandlers({});
    this.#media?.setPlaybackState('none');
    this.#listeners.clear();
    this.#progressListeners.clear();
  }

  // ---- internals ----------------------------------------------------------

  #isStale(token: number): boolean {
    return token !== this.#token || this.#disposed;
  }

  /** Loads (fresh), resumes or restarts a song; the latest request always wins. */
  async #start(song: Song, kind: PlayKind): Promise<void> {
    const token = ++this.#token;
    this.#pending = true;
    this.#pausedByOutput = false;
    if (kind === 'fresh') {
      this.#loadedEntryId = null;
      this.#publishProgress(0, song.durationMs);
      this.#setState({
        status: 'loading',
        currentEntryId: song.entryId,
        positionMs: 0,
        durationMs: song.durationMs,
        error: null,
      });
      this.#media?.setMetadata(song);
    } else {
      this.#setState({ status: 'loading', error: null });
    }
    try {
      const output = this.#outputs[song.source];
      if (output === undefined) throw new PlaybackError(`No audio output for source "${song.source}"`);
      const previous = this.#active;
      if (previous !== null && previous !== output) {
        await this.#pauseOutput(previous);
        if (this.#isStale(token)) return;
      }
      this.#active = output;
      if (kind === 'fresh') {
        await output.load(song);
        if (this.#isStale(token)) return;
        this.#loadedEntryId = song.entryId;
      } else if (kind === 'restart') {
        await output.seek(0);
        if (this.#isStale(token)) return;
        this.#publishProgress(0, this.#progress.durationMs);
      }
      await output.setVolume(this.#effectiveVolume());
      if (this.#isStale(token)) return;
      await output.play();
      if (this.#isStale(token)) return;
      this.#pending = false;
      this.#failures = 0;
      this.#setState({ status: 'playing', error: null });
      this.#updateMediaPosition(true);
    } catch (error) {
      if (this.#isStale(token)) return;
      await this.#onFailure(error, token);
    }
  }

  async #onFailure(error: unknown, token: number): Promise<void> {
    if (this.#isStale(token)) return;
    this.#pending = false;
    if (isAutoplayBlocked(error)) {
      this.#token++;
      this.#setState({ status: 'paused', error: 'autoplay-blocked' });
      return;
    }
    if (error instanceof PlaybackError && FATAL_ERROR_KEYS.has(error.message)) {
      await this.#halt(error.message);
      return;
    }
    this.#failures++;
    if (this.#failures >= this.#library.active.size) {
      await this.#halt('all-failed');
      return;
    }
    const target = this.#pickNext(this.#state.repeat);
    if (target === null) {
      await this.#halt('playback-failed');
      return;
    }
    await this.#start(target, 'fresh');
  }

  /** Stops everything with an error status and releases the output. */
  async #halt(errorKey: string): Promise<void> {
    this.#token++;
    this.#pending = false;
    this.#loadedEntryId = null;
    this.#publishProgress(0, this.#progress.durationMs);
    this.#setState({ status: 'error', positionMs: 0, error: errorKey });
    this.#media?.setPlaybackState('none');
    await this.#pauseOutput(this.#active);
  }

  /** Playlist emptied: nothing left to play, so go idle and silence the output. */
  async #release(): Promise<void> {
    this.#token++;
    this.#pending = false;
    this.#loadedEntryId = null;
    this.#publishProgress(0, 0);
    this.#setState({ status: 'idle', currentEntryId: null, positionMs: 0, durationMs: 0, error: null });
    this.#media?.setMetadata(null);
    this.#media?.setPlaybackState('none');
    await this.#pauseOutput(this.#active);
  }

  /** Reached the end of the list with repeat off: rewind and wait paused on the last song. */
  async #stopAtEnd(): Promise<void> {
    const token = ++this.#token;
    this.#pending = false;
    this.#publishProgress(0, this.#progress.durationMs);
    this.#setState({ status: 'paused', positionMs: 0 });
    const output = this.#active;
    await this.#pauseOutput(output);
    if (output === null || this.#isStale(token)) return;
    await output.seek(0).catch(() => undefined);
  }

  async #pauseOutput(output: AudioOutput | null): Promise<void> {
    if (output === null) return;
    await output.pause().catch(() => undefined);
  }

  #pickNext(repeat: RepeatMode): Song | null {
    const playlist = this.#library.active;
    const current = playlist.current;
    if (this.#shuffleOrder === null || current === null) return playlist.next(repeat);
    const id = this.#shuffleOrder.next(current.entryId, repeat !== 'off');
    return id === null ? null : playlist.select(id);
  }

  #pickPrevious(repeat: RepeatMode): Song | null {
    const playlist = this.#library.active;
    const current = playlist.current;
    if (this.#shuffleOrder === null || current === null) return playlist.previous(repeat);
    const id = this.#shuffleOrder.previous(current.entryId, repeat !== 'off');
    return id === null ? null : playlist.select(id);
  }

  #rebuildShuffle(): void {
    const playlist = this.#library.active;
    const ids = playlist.songs().map((song) => song.entryId);
    const current = playlist.current;
    this.#shuffleOrder = new ShuffleOrder(ids, current === null ? null : current.entryId, this.#random);
  }

  /** Keeps the shuffle permutation aligned with songs added or removed. */
  #syncShuffle(): void {
    const order = this.#shuffleOrder;
    if (order === null) return;
    const ids = this.#library.active.songs().map((song) => song.entryId);
    const present = new Set(ids);
    const ordered = new Set(order.ids());
    for (const id of ordered) if (!present.has(id)) order.remove(id);
    for (const id of ids) if (!ordered.has(id)) order.add(id);
  }

  #effectiveVolume(): number {
    return this.#state.muted ? 0 : this.#state.volume;
  }

  async #applyVolume(): Promise<void> {
    if (this.#active !== null) await this.#active.setVolume(this.#effectiveVolume());
  }

  #onOutputEvent(output: AudioOutput, event: AudioOutputEvent): void {
    if (output !== this.#active || this.#disposed) return;
    const { status } = this.#state;
    switch (event.type) {
      case 'progress':
        if (this.#pending) return;
        this.#publishProgress(event.positionMs, event.durationMs > 0 ? event.durationMs : this.#progress.durationMs);
        this.#updateMediaPosition(false);
        return;
      case 'playing':
        if (!this.#pending && status === 'loading') this.#setState({ status: 'playing' });
        return;
      case 'loading':
        if (!this.#pending && status === 'playing') this.#setState({ status: 'loading' });
        return;
      case 'paused':
        if (this.#pending || status !== 'playing') return;
        this.#pausedByOutput = true;
        this.#setState({ status: 'paused', positionMs: this.#progress.positionMs });
        return;
      case 'error':
        if (status === 'playing' || status === 'loading') void this.#onFailure(event.error, this.#token);
        return;
      case 'ended':
        if (this.#pending) return;
        if (status === 'playing' || status === 'loading' || (status === 'paused' && this.#pausedByOutput)) {
          void this.#onEnded();
        }
        return;
    }
  }

  async #onEnded(): Promise<void> {
    const current = this.#library.active.current;
    if (current === null) return;
    this.#failures = 0;
    if (this.#state.repeat === 'one') {
      await this.#start(current, 'restart');
      return;
    }
    const target = this.#pickNext(this.#state.repeat);
    if (target === null) await this.#stopAtEnd();
    else await this.#start(target, 'fresh');
  }

  #publishProgress(positionMs: number, durationMs: number): void {
    if (positionMs === this.#progress.positionMs && durationMs === this.#progress.durationMs) return;
    this.#progress = { positionMs, durationMs };
    for (const listener of [...this.#progressListeners]) listener(this.#progress);
  }

  #updateMediaPosition(force: boolean): void {
    if (this.#media === null) return;
    const now = this.#clock.now();
    if (!force && now - this.#lastMediaPositionAt < MEDIA_POSITION_INTERVAL_MS) return;
    this.#lastMediaPositionAt = now;
    this.#media.setPositionState(this.#progress.positionMs, this.#progress.durationMs);
  }

  #setState(patch: Partial<PlayerState>): void {
    const next: PlayerState = { ...this.#state, ...patch };
    const changed = (Object.keys(next) as (keyof PlayerState)[]).some((key) => next[key] !== this.#state[key]);
    if (!changed) return;
    const previousStatus = this.#state.status;
    this.#state = next;
    if (next.status !== previousStatus) this.#media?.setPlaybackState(this.#mediaState(next.status));
    for (const listener of [...this.#listeners]) listener(next);
  }

  #mediaState(status: PlayerStatus): 'playing' | 'paused' | 'none' {
    if (status === 'playing' || status === 'loading') return 'playing';
    return status === 'paused' ? 'paused' : 'none';
  }
}
