import { PlaybackError } from '../core/errors';
import type { Clock } from '../core/ports';
import type { Song, SongSource } from '../core/Song';
import type { AudioOutput, AudioOutputEvent, AudioOutputListener } from './AudioOutput';

/** Supplies a valid Spotify access token (refreshing it when needed). */
export interface AccessTokenSource {
  getAccessToken(): Promise<string | null>;
}

export type SpotifyStatus =
  'disconnected' | 'connecting' | 'ready' | 'no-premium' | 'unsupported' | 'error';
export type SpotifyStatusListener = (status: SpotifyStatus) => void;

/** Structural subset of Spotify.Track used for end detection. */
export interface SpotifyTrackLike {
  readonly uri: string;
  readonly linked_from?: { readonly uri: string | null } | null;
}

/** Structural subset of Spotify.PlaybackState (the real one is assignable). */
export interface SpotifyStateLike {
  readonly paused: boolean;
  readonly position: number;
  readonly duration: number;
  readonly track_window: {
    readonly current_track: SpotifyTrackLike;
    readonly previous_tracks: readonly SpotifyTrackLike[];
  };
}

export interface SpotifyPlayerInit {
  name: string;
  getOAuthToken(cb: (token: string) => void): void;
  volume?: number;
}

export type SpotifyErrorEvent =
  'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error';
export type SpotifyEventName = 'ready' | 'not_ready' | 'player_state_changed' | SpotifyErrorEvent;
export type SpotifyDeviceListener = (instance: { device_id: string }) => void;
export type SpotifyStateListener = (state: SpotifyStateLike | null) => void;
export type SpotifyErrorListener = (error: { message: string }) => void;

/** Structural subset of Spotify.Player. */
export interface SpotifyPlayerLike {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: 'ready' | 'not_ready', cb: SpotifyDeviceListener): void;
  addListener(event: 'player_state_changed', cb: SpotifyStateListener): void;
  addListener(event: SpotifyErrorEvent, cb: SpotifyErrorListener): void;
  removeListener(
    event: SpotifyEventName,
    cb?: SpotifyDeviceListener | SpotifyStateListener | SpotifyErrorListener,
  ): void;
  getCurrentState(): Promise<SpotifyStateLike | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  activateElement(): Promise<void>;
}

export interface SpotifySdkLike {
  Player: new (options: SpotifyPlayerInit) => SpotifyPlayerLike;
}

export interface SpotifyTimers {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(handle: number): void;
}

export interface SpotifyOutputDeps {
  readonly tokens: AccessTokenSource;
  readonly fetch: typeof fetch;
  readonly loadSdk: () => Promise<SpotifySdkLike>;
  readonly clock: Clock;
  readonly timers: SpotifyTimers;
  readonly sleep: (ms: number) => Promise<void>;
  readonly playerName?: string;
  readonly initialVolume?: number;
  readonly readyTimeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly retryBackoffMs?: readonly number[];
}

interface Waiter {
  resolve(deviceId: string): void;
  reject(error: Error): void;
}

interface TrackedState {
  readonly paused: boolean;
  readonly position: number;
  readonly duration: number;
  readonly receivedAt: number;
}

const PLAY_URL = 'https://api.spotify.com/v1/me/player/play';
const NEAR_END_MS = 1500;
const POLL_END_MARGIN_MS = 300;
/** A seek this close to the end is treated as reaching the end (Spotify goes silent otherwise). */
const SEEK_END_MARGIN_MS = 1500;
/** After a seek, states this far from the expected position are stale and ignored... */
const SEEK_STALE_TOLERANCE_MS = 2500;
/** ...but only for this long, so a seek that Spotify ignored cannot freeze the progress. */
const SEEK_GUARD_WINDOW_MS = 2500;
/** Play requests closer than this to the previous one are coalesced (rapid "next"). */
const RAPID_PLAY_WINDOW_MS = 700;
const RAPID_PLAY_SETTLE_MS = 250;

/**
 * AudioOutput over the Spotify Web Playback SDK. The SDK has no "ended"
 * event, so end-of-track detection lives here (see .agents/music-api-research.md).
 */
export class SpotifyOutput implements AudioOutput {
  readonly source: SongSource = 'spotify';
  readonly #deps: SpotifyOutputDeps;
  readonly #listeners = new Set<AudioOutputListener>();
  readonly #statusListeners = new Set<SpotifyStatusListener>();
  readonly #waiters: Waiter[] = [];
  readonly #registered: [
    SpotifyEventName,
    SpotifyDeviceListener | SpotifyStateListener | SpotifyErrorListener,
  ][] = [];
  #status: SpotifyStatus = 'disconnected';
  #player: SpotifyPlayerLike | null = null;
  #initPromise: Promise<void> | null = null;
  #deviceId: string | null = null;
  #volume: number;
  #activated = false;
  #authRetried = false;
  #disposed = false;

  #uri: string | null = null;
  #startPositionMs = 0;
  #sessionActive = false;
  #sessionUri: string | null = null;
  #sessionEnded = false;
  #userPaused = false;
  #lastState: TrackedState | null = null;
  #lastPaused: boolean | null = null;
  #pollHandle: number | null = null;
  #durationMs = 0;
  /** Bumped on every load so in-flight play requests for older songs can bail out. */
  #generation = 0;
  #lastPlayRequestAt = Number.NEGATIVE_INFINITY;
  #seekGuard: { readonly targetMs: number; readonly at: number } | null = null;

  constructor(deps: SpotifyOutputDeps) {
    this.#deps = deps;
    this.#volume = deps.initialVolume ?? 1;
  }

  getStatus(): SpotifyStatus {
    return this.#status;
  }

  onStatusChange(listener: SpotifyStatusListener): () => void {
    this.#statusListeners.add(listener);
    return () => {
      this.#statusListeners.delete(listener);
    };
  }

  subscribe(listener: AudioOutputListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Loads the SDK and connects the single Player. Idempotent: concurrent or
   * repeated calls (React StrictMode) share one initialization.
   */
  init(): Promise<void> {
    if (this.#initPromise === null) {
      this.#initPromise = this.#initialize().catch((error: unknown) => {
        this.#initPromise = null;
        this.#teardownPlayer();
        if (this.#status === 'connecting') this.#setStatus('error');
        throw error;
      });
    }
    return this.#initPromise;
  }

  async load(song: Song, positionMs = 0): Promise<void> {
    this.#generation++;
    // Silence the previous song right away instead of waiting for the next PUT to land.
    const interrupt = this.#sessionActive && !this.#sessionEnded && !this.#userPaused;
    this.#uri = song.uri;
    this.#durationMs = song.durationMs;
    this.#seekGuard = null;
    this.#startPositionMs = positionMs;
    this.#sessionActive = false;
    this.#sessionEnded = false;
    this.#lastState = null;
    this.#stopPolling();
    if (interrupt && this.#player !== null) await this.#player.pause().catch(() => undefined);
  }

  async play(): Promise<void> {
    const uri = this.#uri;
    if (uri === null) throw new PlaybackError('No song loaded');
    const generation = this.#generation;
    const { player, deviceId } = await this.#ensureDevice();
    if (generation !== this.#generation) return;
    if (!this.#activated) {
      this.#activated = true;
      await player.activateElement();
    }
    this.#userPaused = false;
    if (this.#sessionActive && this.#sessionUri === uri && !this.#sessionEnded) {
      await player.resume();
    } else {
      const now = this.#deps.clock.now();
      const rapid = now - this.#lastPlayRequestAt < RAPID_PLAY_WINDOW_MS;
      this.#lastPlayRequestAt = now;
      if (rapid) {
        // Let a burst of "next" clicks settle so Spotify only receives the last song.
        await this.#deps.sleep(RAPID_PLAY_SETTLE_MS);
        if (generation !== this.#generation) return;
      }
      this.#beginSession(uri);
      try {
        await this.#requestPlay(deviceId, uri, this.#startPositionMs, generation);
      } catch (error) {
        this.#sessionActive = false;
        throw error;
      }
      this.#startPositionMs = 0;
    }
    this.#startPolling();
  }

  async pause(): Promise<void> {
    this.#userPaused = true;
    this.#stopPolling();
    if (this.#player !== null) await this.#player.pause();
  }

  async seek(positionMs: number): Promise<void> {
    if (this.#sessionActive && !this.#sessionEnded && this.#player !== null) {
      const duration = this.#lastState?.duration ?? this.#durationMs;
      if (duration > 0 && positionMs >= duration - SEEK_END_MARGIN_MS) {
        // Seeking into the tail leaves the SDK silent with a stale position: end the song instead.
        this.#finish();
        return;
      }
      const now = this.#deps.clock.now();
      this.#seekGuard = { targetMs: positionMs, at: now };
      // Track the target so end detection extrapolates from where we jumped to.
      this.#lastState = {
        paused: this.#lastState?.paused ?? false,
        position: positionMs,
        duration,
        receivedAt: now,
      };
      await this.#player.seek(positionMs);
    } else {
      this.#startPositionMs = positionMs;
    }
  }

  async setVolume(volume: number): Promise<void> {
    this.#volume = volume;
    if (this.#player !== null) await this.#player.setVolume(volume);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopPolling();
    this.#sessionActive = false;
    this.#failWaiters(new PlaybackError('spotify-not-ready'));
    this.#teardownPlayer();
    this.#status = 'disconnected';
    this.#listeners.clear();
    this.#statusListeners.clear();
  }

  async #initialize(): Promise<void> {
    this.#setStatus('connecting');
    const sdk = await this.#deps.loadSdk();
    if (this.#disposed) throw new PlaybackError('spotify-not-ready');
    const player = new sdk.Player({
      name: this.#deps.playerName ?? 'Doubly Linked Player',
      getOAuthToken: (cb) => this.#provideToken(cb),
      volume: this.#volume,
    });
    this.#player = player;
    this.#register(player);
    const connected = await player.connect();
    if (!connected) throw new PlaybackError('spotify-not-ready');
    await this.#awaitReady();
  }

  #register(player: SpotifyPlayerLike): void {
    const onReady: SpotifyDeviceListener = ({ device_id }) => {
      this.#deviceId = device_id;
      this.#authRetried = false;
      this.#setStatus('ready');
      for (const waiter of this.#waiters.splice(0)) waiter.resolve(device_id);
    };
    const onNotReady: SpotifyDeviceListener = () => {
      this.#deviceId = null;
      if (this.#status === 'ready') this.#setStatus('disconnected');
    };
    const onState: SpotifyStateListener = (state) => this.#onState(state);
    const onInit: SpotifyErrorListener = () => this.#fail('unsupported');
    const onAccount: SpotifyErrorListener = () => this.#fail('no-premium');
    const onAuth: SpotifyErrorListener = () => {
      void this.#onAuthenticationError();
    };
    const onPlayback: SpotifyErrorListener = () =>
      this.#emit({ type: 'error', error: new PlaybackError('playback-failed') });

    player.addListener('ready', onReady);
    player.addListener('not_ready', onNotReady);
    player.addListener('player_state_changed', onState);
    player.addListener('initialization_error', onInit);
    player.addListener('account_error', onAccount);
    player.addListener('authentication_error', onAuth);
    player.addListener('playback_error', onPlayback);
    this.#registered.push(
      ['ready', onReady],
      ['not_ready', onNotReady],
      ['player_state_changed', onState],
      ['initialization_error', onInit],
      ['account_error', onAccount],
      ['authentication_error', onAuth],
      ['playback_error', onPlayback],
    );
  }

  #teardownPlayer(): void {
    const player = this.#player;
    if (player === null) return;
    for (const [event, listener] of this.#registered.splice(0))
      player.removeListener(event, listener);
    player.disconnect();
    this.#player = null;
    this.#deviceId = null;
  }

  #provideToken(cb: (token: string) => void): void {
    this.#deps.tokens.getAccessToken().then(
      (token) => cb(token ?? ''),
      () => cb(''),
    );
  }

  async #onAuthenticationError(): Promise<void> {
    const player = this.#player;
    let recovered = false;
    if (player !== null && !this.#authRetried) {
      this.#authRetried = true;
      const token = await this.#deps.tokens.getAccessToken().catch(() => null);
      recovered = token !== null && (await player.connect().catch(() => false));
    }
    if (!recovered) this.#fail('error');
  }

  #fail(status: 'unsupported' | 'no-premium' | 'error'): void {
    this.#setStatus(status);
    this.#failWaiters(new PlaybackError('spotify-not-ready'));
  }

  #failWaiters(error: Error): void {
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }

  #awaitReady(): Promise<string> {
    if (this.#deviceId !== null) return Promise.resolve(this.#deviceId);
    if (
      this.#status === 'unsupported' ||
      this.#status === 'no-premium' ||
      this.#status === 'error'
    ) {
      return Promise.reject(new PlaybackError('spotify-not-ready'));
    }
    return new Promise<string>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };
      this.#waiters.push(waiter);
      void this.#deps.sleep(this.#deps.readyTimeoutMs ?? 10_000).then(() => {
        const index = this.#waiters.indexOf(waiter);
        if (index !== -1) this.#waiters.splice(index, 1);
        reject(new PlaybackError('spotify-not-ready'));
      });
    });
  }

  async #ensureDevice(): Promise<{ player: SpotifyPlayerLike; deviceId: string }> {
    await this.init();
    const player = this.#player;
    if (player === null) throw new PlaybackError('spotify-not-ready');
    return { player, deviceId: await this.#awaitReady() };
  }

  #beginSession(uri: string): void {
    this.#sessionActive = true;
    this.#sessionUri = uri;
    this.#sessionEnded = false;
    this.#lastState = null;
    this.#lastPaused = null;
  }

  async #requestPlay(
    deviceId: string,
    uri: string,
    positionMs: number,
    generation: number,
  ): Promise<void> {
    const backoff = this.#deps.retryBackoffMs ?? [300, 600, 1200];
    for (let attempt = 0; ; attempt++) {
      const token = await this.#deps.tokens.getAccessToken();
      if (token === null) throw new PlaybackError('spotify-not-ready');
      if (generation !== this.#generation) return;
      const response = await this.#deps.fetch(
        `${PLAY_URL}?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
        },
      );
      if (response.ok) return;
      const delay = backoff[attempt];
      if (response.status === 404 && delay !== undefined) {
        await this.#deps.sleep(delay);
        if (generation !== this.#generation) return;
        continue;
      }
      throw new PlaybackError('playback-failed');
    }
  }

  #isOurs(track: SpotifyTrackLike): boolean {
    const uri = this.#sessionUri;
    return track.uri === uri || track.linked_from?.uri === uri;
  }

  #onState(state: SpotifyStateLike | null): void {
    if (state === null) {
      this.#stopPolling();
      if (this.#sessionActive) this.#emit({ type: 'paused' });
      return;
    }
    if (!this.#sessionActive || this.#sessionEnded) return;
    const now = this.#deps.clock.now();
    const ours = this.#isOurs(state.track_window.current_track);
    // End detection runs first: the end state legitimately differs from any seek target.
    if (state.paused && state.position === 0 && !this.#userPaused) {
      const playedBefore = state.track_window.previous_tracks.some((track) => this.#isOurs(track));
      if (playedBefore || this.#wasNearEnd(this.#lastState, now)) {
        this.#finish();
        return;
      }
    }
    // States of another song (e.g. the previous one, still settling) or from before our
    // latest seek would make the progress jump back, so they are dropped.
    if (!ours || this.#isStaleAfterSeek(state, now)) return;
    this.#lastState = {
      paused: state.paused,
      position: state.position,
      duration: state.duration,
      receivedAt: now,
    };
    this.#emit({ type: 'progress', positionMs: state.position, durationMs: state.duration });
    if (this.#lastPaused !== state.paused) {
      this.#lastPaused = state.paused;
      this.#emit({ type: state.paused ? 'paused' : 'playing' });
    }
  }

  /** True for a state that still shows the position from before our latest seek. */
  #isStaleAfterSeek(state: SpotifyStateLike, now: number): boolean {
    const guard = this.#seekGuard;
    if (guard === null) return false;
    const elapsed = now - guard.at;
    if (elapsed > SEEK_GUARD_WINDOW_MS) {
      this.#seekGuard = null;
      return false;
    }
    const expected = guard.targetMs + (state.paused ? 0 : elapsed);
    if (Math.abs(state.position - expected) <= SEEK_STALE_TOLERANCE_MS) {
      this.#seekGuard = null;
      return false;
    }
    return true;
  }

  #wasNearEnd(previous: TrackedState | null, now: number): boolean {
    if (previous === null || previous.paused) return false;
    const estimated = previous.position + (now - previous.receivedAt);
    return previous.duration - estimated < NEAR_END_MS;
  }

  #finish(): void {
    if (this.#sessionEnded) return;
    this.#sessionEnded = true;
    this.#stopPolling();
    this.#emit({ type: 'ended' });
  }

  #startPolling(): void {
    this.#stopPolling();
    this.#pollHandle = this.#deps.timers.setInterval(() => {
      void this.#poll();
    }, this.#deps.pollIntervalMs ?? 1000);
  }

  #stopPolling(): void {
    if (this.#pollHandle === null) return;
    this.#deps.timers.clearInterval(this.#pollHandle);
    this.#pollHandle = null;
  }

  async #poll(): Promise<void> {
    const player = this.#player;
    if (player === null) return;
    const state = await player.getCurrentState().catch(() => null);
    if (
      state === null ||
      !this.#sessionActive ||
      this.#sessionEnded ||
      this.#userPaused ||
      state.paused ||
      !this.#isOurs(state.track_window.current_track) ||
      this.#isStaleAfterSeek(state, this.#deps.clock.now())
    )
      return;
    if (state.duration > 0 && state.position >= state.duration - POLL_END_MARGIN_MS) {
      this.#finish();
      return;
    }
    this.#emit({ type: 'progress', positionMs: state.position, durationMs: state.duration });
  }

  #setStatus(status: SpotifyStatus): void {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of [...this.#statusListeners]) listener(status);
  }

  #emit(event: AudioOutputEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}
