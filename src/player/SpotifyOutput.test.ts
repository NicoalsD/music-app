import { describe, expect, it, vi } from 'vitest';
import { PlaybackError } from '../core/errors';
import { Song } from '../core/Song';
import { FakeClock, makeTrack } from '../core/test-utils/fakes';
import { FakeFetch, jsonResponse } from '../test/httpFakes';
import type { Responder } from '../test/httpFakes';
import type { AudioOutputEvent } from './AudioOutput';
import { SpotifyOutput } from './SpotifyOutput';
import type {
  AccessTokenSource,
  SpotifyDeviceListener,
  SpotifyErrorEvent,
  SpotifyErrorListener,
  SpotifyEventName,
  SpotifyPlayerInit,
  SpotifyPlayerLike,
  SpotifySdkLike,
  SpotifyStateLike,
  SpotifyStateListener,
  SpotifyStatus,
  SpotifyTimers,
} from './SpotifyOutput';
import { settle } from './test-utils/FakeAudioOutput';

type AnyListener = SpotifyDeviceListener | SpotifyStateListener | SpotifyErrorListener;

class FakePlayer implements SpotifyPlayerLike {
  readonly calls: string[] = [];
  readonly listeners = new Map<SpotifyEventName, Set<AnyListener>>();
  autoReady = true;
  connectResult = true;
  state: SpotifyStateLike | null = null;
  stateError: Error | null = null;
  readonly deviceId = 'dev-1';

  constructor(readonly options: SpotifyPlayerInit) {}

  connect(): Promise<boolean> {
    this.calls.push('connect');
    if (this.autoReady && this.connectResult) this.emitReady();
    return Promise.resolve(this.connectResult);
  }
  disconnect(): void {
    this.calls.push('disconnect');
  }
  addListener(event: 'ready' | 'not_ready', cb: SpotifyDeviceListener): void;
  addListener(event: 'player_state_changed', cb: SpotifyStateListener): void;
  addListener(event: SpotifyErrorEvent, cb: SpotifyErrorListener): void;
  addListener(event: SpotifyEventName, cb: AnyListener): void {
    const set = this.listeners.get(event) ?? new Set<AnyListener>();
    set.add(cb);
    this.listeners.set(event, set);
  }
  removeListener(event: SpotifyEventName, cb?: AnyListener): void {
    if (cb === undefined) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(cb);
  }
  getCurrentState(): Promise<SpotifyStateLike | null> {
    this.calls.push('getCurrentState');
    return this.stateError === null ? Promise.resolve(this.state) : Promise.reject(this.stateError);
  }
  pause(): Promise<void> {
    this.calls.push('pause');
    return Promise.resolve();
  }
  resume(): Promise<void> {
    this.calls.push('resume');
    return Promise.resolve();
  }
  seek(positionMs: number): Promise<void> {
    this.calls.push(`seek:${positionMs}`);
    return Promise.resolve();
  }
  setVolume(volume: number): Promise<void> {
    this.calls.push(`volume:${volume}`);
    return Promise.resolve();
  }
  activateElement(): Promise<void> {
    this.calls.push('activate');
    return Promise.resolve();
  }

  listenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
  #fire(event: SpotifyEventName, payload: unknown): void {
    for (const listener of [...(this.listeners.get(event) ?? [])])
      (listener as (p: unknown) => void)(payload);
  }
  emitReady(): void {
    this.#fire('ready', { device_id: this.deviceId });
  }
  emitNotReady(): void {
    this.#fire('not_ready', { device_id: this.deviceId });
  }
  emitState(state: SpotifyStateLike | null): void {
    this.#fire('player_state_changed', state);
  }
  emitError(event: SpotifyErrorEvent): void {
    this.#fire(event, { message: event });
  }
}

class FakeTimers implements SpotifyTimers {
  readonly intervals = new Map<number, () => void>();
  readonly sleeps: { ms: number; resolve: () => void }[] = [];
  readonly sleepLog: number[] = [];
  autoSleep = false;
  #next = 1;

  setInterval(handler: () => void): number {
    const id = this.#next++;
    this.intervals.set(id, handler);
    return id;
  }
  clearInterval(handle: number): void {
    this.intervals.delete(handle);
  }
  readonly sleep = (ms: number): Promise<void> => {
    this.sleepLog.push(ms);
    if (this.autoSleep) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.sleeps.push({ ms, resolve });
    });
  };
  async tick(): Promise<void> {
    for (const handler of [...this.intervals.values()]) handler();
    await settle();
  }
  expire(ms: number): void {
    for (const sleeper of this.sleeps.filter((s) => s.ms === ms)) sleeper.resolve();
  }
}

class FakeTokens implements AccessTokenSource {
  queue: (string | null | Error)[] = [];
  calls = 0;
  getAccessToken(): Promise<string | null> {
    this.calls++;
    const next = this.queue.shift();
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next === undefined ? 'token-1' : next);
  }
}

const URI = 'spotify:track:a';
const noContent = (): Response => new Response(null, { status: 204 });

function track(
  uri: string,
  linkedFrom: string | null = null,
): SpotifyStateLike['track_window']['current_track'] {
  return linkedFrom === null ? { uri } : { uri, linked_from: { uri: linkedFrom } };
}

interface StateOptions {
  paused?: boolean;
  position?: number;
  duration?: number;
  current?: SpotifyStateLike['track_window']['current_track'];
  previous?: SpotifyStateLike['track_window']['previous_tracks'];
}

function state(options: StateOptions = {}): SpotifyStateLike {
  return {
    paused: options.paused ?? false,
    position: options.position ?? 0,
    duration: options.duration ?? 180_000,
    track_window: {
      current_track: options.current ?? track(URI),
      previous_tracks: options.previous ?? [],
    },
  };
}

interface Env {
  output: SpotifyOutput;
  players: FakePlayer[];
  fetch: FakeFetch;
  timers: FakeTimers;
  clock: FakeClock;
  tokens: FakeTokens;
  events: AudioOutputEvent[];
  statuses: SpotifyStatus[];
  loadSdk: ReturnType<typeof vi.fn<() => Promise<SpotifySdkLike>>>;
  player(): FakePlayer;
}

function setup(
  responders: Responder[] = [noContent()],
  configure?: (player: FakePlayer) => void,
): Env {
  const players: FakePlayer[] = [];
  class TestPlayer extends FakePlayer {
    constructor(options: SpotifyPlayerInit) {
      super(options);
      configure?.(this);
      players.push(this);
    }
  }
  const loadSdk = vi.fn<() => Promise<SpotifySdkLike>>(() =>
    Promise.resolve({ Player: TestPlayer }),
  );
  const fetcher = new FakeFetch(...responders);
  const timers = new FakeTimers();
  const clock = new FakeClock(0);
  const tokens = new FakeTokens();
  const output = new SpotifyOutput({
    tokens,
    fetch: fetcher.fetch,
    loadSdk,
    clock,
    timers,
    sleep: timers.sleep,
  });
  const events: AudioOutputEvent[] = [];
  output.subscribe((event) => events.push(event));
  const statuses: SpotifyStatus[] = [];
  output.onStatusChange((status) => statuses.push(status));
  return {
    output,
    players,
    fetch: fetcher,
    timers,
    clock,
    tokens,
    events,
    statuses,
    loadSdk,
    player: () => {
      const [first] = players;
      if (first === undefined) throw new Error('no player was created');
      return first;
    },
  };
}

function song(uri = URI): Song {
  return new Song({ ...makeTrack('a', 180_000), source: 'spotify', uri }, `entry-${uri}`);
}

async function startPlaying(env: Env, uri = URI): Promise<void> {
  await env.output.load(song(uri));
  await env.output.play();
  env.events.length = 0;
}

function types(env: Env): string[] {
  return env.events.map((event) => event.type);
}

describe('SpotifyOutput', () => {
  describe('initialization', () => {
    it('is lazy: nothing is loaded until init or play', async () => {
      const env = setup();
      expect(env.output.source).toBe('spotify');
      expect(env.output.getStatus()).toBe('disconnected');
      await env.output.load(song());
      expect(env.loadSdk).not.toHaveBeenCalled();
    });

    it('creates one connected player and reports connecting then ready', async () => {
      const env = setup();
      await env.output.init();
      expect(env.players).toHaveLength(1);
      expect(env.player().options.name).toBe('Doubly Linked Player');
      expect(env.player().options.volume).toBe(1);
      expect(env.player().calls).toEqual(['connect']);
      expect(env.statuses).toEqual(['connecting', 'ready']);
      expect(env.output.getStatus()).toBe('ready');
    });

    it('creates only one Player when init runs twice (StrictMode)', async () => {
      const env = setup();
      await Promise.all([env.output.init(), env.output.init()]);
      await env.output.init();
      await env.output.load(song());
      await env.output.play();
      expect(env.loadSdk).toHaveBeenCalledTimes(1);
      expect(env.players).toHaveLength(1);
      expect(env.player().calls.filter((call) => call === 'connect')).toHaveLength(1);
    });

    it('supplies tokens to the SDK and falls back to an empty token', async () => {
      const env = setup();
      await env.output.init();
      const results: string[] = [];
      env.player().options.getOAuthToken((token) => results.push(token));
      env.tokens.queue = [null];
      env.player().options.getOAuthToken((token) => results.push(token));
      env.tokens.queue = [new Error('offline')];
      env.player().options.getOAuthToken((token) => results.push(token));
      await settle();
      expect(results).toEqual(['token-1', '', '']);
    });

    it('uses the configured name and volume', async () => {
      const env = setup();
      await env.output.setVolume(0.3);
      await env.output.init();
      expect(env.player().options.volume).toBe(0.3);
      const named = new SpotifyOutput({
        tokens: env.tokens,
        fetch: env.fetch.fetch,
        loadSdk: env.loadSdk,
        clock: env.clock,
        timers: env.timers,
        sleep: env.timers.sleep,
        playerName: 'Custom',
        initialVolume: 0.2,
      });
      await named.init();
      expect(env.players[1]?.options).toMatchObject({ name: 'Custom', volume: 0.2 });
    });

    it('waits for ready before playing', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
      });
      await env.output.load(song());
      const playing = env.output.play();
      await settle();
      expect(env.fetch.calls).toHaveLength(0);
      expect(env.output.getStatus()).toBe('connecting');
      env.player().emitReady();
      await playing;
      expect(env.fetch.calls).toHaveLength(1);
      expect(env.fetch.calls[0]?.url).toContain('device_id=dev-1');
    });

    it('fails with spotify-not-ready when ready never arrives', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
      });
      await env.output.load(song());
      const playing = env.output.play();
      await settle();
      env.timers.expire(10_000);
      await expect(playing).rejects.toMatchObject({
        name: 'PlaybackError',
        message: 'spotify-not-ready',
      });
      expect(env.output.getStatus()).toBe('error');
      expect(env.player().calls).toContain('disconnect');
    });

    it('can initialize again after a failed attempt', async () => {
      const env = setup([noContent()], (player) => {
        player.connectResult = env.players.length === 0 ? false : true;
      });
      await expect(env.output.init()).rejects.toBeInstanceOf(PlaybackError);
      expect(env.output.getStatus()).toBe('error');
      await env.output.init();
      expect(env.players).toHaveLength(2);
      expect(env.output.getStatus()).toBe('ready');
    });

    it('reports an error when the SDK cannot be loaded', async () => {
      const env = setup();
      env.loadSdk.mockRejectedValueOnce(new PlaybackError('spotify-sdk-load-failed'));
      await expect(env.output.init()).rejects.toThrow('spotify-sdk-load-failed');
      expect(env.output.getStatus()).toBe('error');
      expect(env.players).toHaveLength(0);
    });

    it('stops when disposed while the SDK is loading', async () => {
      const env = setup();
      let resolveSdk: (sdk: SpotifySdkLike) => void = () => undefined;
      env.loadSdk.mockReturnValueOnce(
        new Promise<SpotifySdkLike>((resolve) => {
          resolveSdk = resolve;
        }),
      );
      const init = env.output.init();
      env.output.dispose();
      resolveSdk({ Player: FakePlayer });
      await expect(init).rejects.toThrow('spotify-not-ready');
      expect(env.players).toHaveLength(0);
    });

    it('notifies status listeners until unsubscribed', async () => {
      const env = setup();
      const listener = vi.fn();
      const unsubscribe = env.output.onStatusChange(listener);
      unsubscribe();
      await env.output.init();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('status errors', () => {
    it('maps account_error to no-premium and fails fast', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
        player.connectResult = true;
      });
      await env.output.load(song());
      const playing = env.output.play();
      await settle();
      env.player().emitError('account_error');
      await expect(playing).rejects.toThrow('spotify-not-ready');
      expect(env.output.getStatus()).toBe('no-premium');
    });

    it('maps initialization_error to unsupported', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
      });
      const init = env.output.init();
      await settle();
      env.player().emitError('initialization_error');
      await expect(init).rejects.toThrow('spotify-not-ready');
      expect(env.output.getStatus()).toBe('unsupported');
    });

    it('rejects immediately when a failure status was set before ready is awaited', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
        const connect = player.connect.bind(player);
        player.connect = () => {
          player.emitError('account_error');
          return connect();
        };
      });
      await expect(env.output.init()).rejects.toThrow('spotify-not-ready');
      expect(env.output.getStatus()).toBe('no-premium');
    });

    it('asks for a token again on authentication_error and reconnects', async () => {
      const env = setup();
      await env.output.init();
      env.player().emitError('authentication_error');
      await settle();
      expect(env.tokens.calls).toBe(1);
      expect(env.player().calls.filter((call) => call === 'connect')).toHaveLength(2);
      expect(env.output.getStatus()).toBe('ready');
    });

    it('goes to error when authentication_error cannot be recovered', async () => {
      const env = setup();
      await env.output.init();
      env.tokens.queue = [null];
      env.player().emitError('authentication_error');
      await settle();
      expect(env.output.getStatus()).toBe('error');
    });

    it('goes to error when the token request itself fails', async () => {
      const env = setup();
      await env.output.init();
      env.tokens.queue = [new Error('offline')];
      env.player().emitError('authentication_error');
      await settle();
      expect(env.output.getStatus()).toBe('error');
    });

    it('goes to error when the reconnect fails and when the error repeats', async () => {
      const env = setup();
      await env.output.init();
      env.player().connect = () => Promise.resolve(false);
      env.player().emitError('authentication_error');
      await settle();
      expect(env.output.getStatus()).toBe('error');

      const again = setup();
      await again.output.init();
      again.player().autoReady = false;
      again.player().emitError('authentication_error');
      await settle();
      again.player().emitError('authentication_error');
      await settle();
      expect(again.output.getStatus()).toBe('error');
      expect(again.tokens.calls).toBe(1);
    });

    it('goes to error when the reconnect rejects', async () => {
      const env = setup();
      await env.output.init();
      env.player().connect = () => Promise.reject(new Error('network'));
      env.player().emitError('authentication_error');
      await settle();
      expect(env.output.getStatus()).toBe('error');
    });

    it('emits an error event on playback_error', async () => {
      const env = setup();
      await env.output.init();
      env.player().emitError('playback_error');
      expect(types(env)).toEqual(['error']);
    });

    it('goes disconnected on not_ready and waits for ready again', async () => {
      const env = setup();
      await env.output.load(song());
      await env.output.play();
      env.player().emitNotReady();
      expect(env.output.getStatus()).toBe('disconnected');
      const playing = env.output.play();
      await settle();
      env.player().emitReady();
      await playing;
      expect(env.output.getStatus()).toBe('ready');
    });

    it('keeps an error status when not_ready arrives', async () => {
      const env = setup();
      await env.output.init();
      env.player().emitError('account_error');
      env.player().emitNotReady();
      expect(env.output.getStatus()).toBe('no-premium');
    });
  });

  describe('play', () => {
    it('rejects when no song is loaded', async () => {
      const env = setup();
      await expect(env.output.play()).rejects.toThrow('No song loaded');
    });

    it('activates the element once and sends a PUT with a single uri', async () => {
      const env = setup([noContent(), noContent()]);
      await env.output.load(song(), 12_000);
      await env.output.play();
      const call = env.fetch.calls[0];
      expect(call?.url).toBe('https://api.spotify.com/v1/me/player/play?device_id=dev-1');
      expect(call?.init.method).toBe('PUT');
      expect(call?.init.headers).toEqual({
        Authorization: 'Bearer token-1',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(String(call?.init.body))).toEqual({ uris: [URI], position_ms: 12_000 });
      await env.output.load(song('spotify:track:b'));
      await env.output.play();
      expect(JSON.parse(String(env.fetch.calls[1]?.init.body))).toEqual({
        uris: ['spotify:track:b'],
        position_ms: 0,
      });
      expect(env.player().calls.filter((c) => c === 'activate')).toHaveLength(1);
      expect(env.player().calls.indexOf('activate')).toBeLessThan(env.player().calls.length);
    });

    it('resumes instead of sending a new PUT when the same song was merely paused', async () => {
      const env = setup([noContent()]);
      await startPlaying(env);
      await env.output.pause();
      await env.output.play();
      expect(env.fetch.calls).toHaveLength(1);
      expect(env.player().calls).toContain('resume');
    });

    it('sends a new PUT after loading a different or the same song again', async () => {
      const env = setup([noContent(), noContent(), noContent()]);
      await startPlaying(env);
      await env.output.pause();
      await env.output.load(song('spotify:track:b'));
      await env.output.play();
      await env.output.load(song('spotify:track:b'));
      await env.output.play();
      expect(env.fetch.calls).toHaveLength(3);
      expect(env.player().calls).not.toContain('resume');
    });

    it('retries a 404 device-not-found with 300, 600 and 1200 ms backoff', async () => {
      const env = setup([
        jsonResponse({}, 404),
        jsonResponse({}, 404),
        jsonResponse({}, 404),
        noContent(),
      ]);
      env.timers.autoSleep = true;
      await startPlaying(env);
      expect(env.fetch.calls).toHaveLength(4);
      expect(env.timers.sleepLog).toEqual([300, 600, 1200]);
    });

    it('fails after the last 404 retry and forgets the session', async () => {
      const env = setup([404, 404, 404, 404].map(() => jsonResponse({}, 404)));
      env.timers.autoSleep = true;
      await env.output.load(song());
      await expect(env.output.play()).rejects.toMatchObject({
        name: 'PlaybackError',
        message: 'playback-failed',
      });
      expect(env.fetch.calls).toHaveLength(4);
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual([]);
    });

    it('does not retry other HTTP errors', async () => {
      const env = setup([jsonResponse({}, 500)]);
      await env.output.load(song());
      await expect(env.output.play()).rejects.toThrow('playback-failed');
      expect(env.fetch.calls).toHaveLength(1);
    });

    it('fails when no access token is available', async () => {
      const env = setup([noContent()]);
      await env.output.init();
      env.tokens.queue = [null];
      await env.output.load(song());
      await expect(env.output.play()).rejects.toThrow('spotify-not-ready');
    });

    it('fails with spotify-not-ready when disposed right after ready', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
      });
      await env.output.load(song());
      const playing = env.output.play();
      await settle();
      env.player().emitReady();
      env.output.dispose();
      await expect(playing).rejects.toBeInstanceOf(PlaybackError);
    });
  });

  describe('pause, seek and volume', () => {
    it('pause before init is a no-op', async () => {
      const env = setup();
      await env.output.pause();
      expect(env.players).toHaveLength(0);
    });

    it('pauses the player and stops polling', async () => {
      const env = setup();
      await startPlaying(env);
      expect(env.timers.intervals.size).toBe(1);
      await env.output.pause();
      expect(env.player().calls).toContain('pause');
      expect(env.timers.intervals.size).toBe(0);
    });

    it('seeks the SDK during a session and remembers the position otherwise', async () => {
      const env = setup([noContent(), noContent()]);
      await env.output.load(song());
      await env.output.seek(5_000);
      await env.output.play();
      expect(JSON.parse(String(env.fetch.calls[0]?.init.body)).position_ms).toBe(5_000);
      await env.output.seek(7_000);
      expect(env.player().calls).toContain('seek:7000');
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      await env.output.seek(0);
      await env.output.play();
      expect(env.fetch.calls).toHaveLength(2);
      expect(JSON.parse(String(env.fetch.calls[1]?.init.body)).position_ms).toBe(0);
    });

    it('forwards volume to the player once it exists', async () => {
      const env = setup();
      await env.output.setVolume(0.5);
      expect(env.players).toHaveLength(0);
      await env.output.init();
      await env.output.setVolume(0.8);
      expect(env.player().calls).toContain('volume:0.8');
    });
  });

  describe('end detection', () => {
    it('emits ended once for paused, position 0 and the uri in previous_tracks', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual(['ended']);
    });

    it('ignores the same end state repeated three times', async () => {
      const env = setup();
      await startPlaying(env);
      for (let i = 0; i < 3; i++) {
        env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      }
      expect(types(env)).toEqual(['ended']);
      expect(env.timers.intervals.size).toBe(0);
    });

    it('detects the end when the previous state was within 1500 ms of the end and playing', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ position: 179_000 }));
      env.events.length = 0;
      env.player().emitState(state({ paused: true, position: 0 }));
      expect(types(env)).toEqual(['ended']);
    });

    it('extrapolates the last known position with the clock', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ position: 100_000 }));
      env.clock.time += 79_000;
      env.events.length = 0;
      env.player().emitState(state({ paused: true, position: 0 }));
      expect(types(env)).toEqual(['ended']);
    });

    it('is not an end when the previous state was far from the end', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ position: 10_000 }));
      env.events.length = 0;
      env.player().emitState(state({ paused: true, position: 0 }));
      expect(types(env)).toEqual(['progress', 'paused']);
    });

    it('is not an end when the previous state was already paused', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ paused: true, position: 179_500 }));
      env.events.length = 0;
      env.player().emitState(state({ paused: true, position: 0 }));
      expect(types(env)).toEqual(['progress']);
    });

    it('is not an end for the initial paused state at position 0', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ paused: true, position: 0 }));
      expect(types(env)).toEqual(['progress', 'paused']);
    });

    it('does not treat a pause we requested as an end', async () => {
      const env = setup();
      await startPlaying(env);
      await env.output.pause();
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual(['progress', 'paused']);
    });

    it('treats a pause by someone else after userPaused was cleared as an end', async () => {
      const env = setup();
      await startPlaying(env);
      await env.output.pause();
      await env.output.play();
      env.events.length = 0;
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual(['ended']);
    });

    it('recognizes a relinked track through linked_from.uri', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(
        state({
          paused: true,
          position: 0,
          current: track('spotify:track:relinked'),
          previous: [track('spotify:track:relinked', URI)],
        }),
      );
      expect(types(env)).toEqual(['ended']);
    });

    it('ignores other tracks in previous_tracks', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(
        state({
          paused: true,
          position: 0,
          previous: [track('spotify:track:other', 'spotify:track:else')],
        }),
      );
      expect(types(env)).toEqual(['progress', 'paused']);
    });

    it('emits ended again for a new play session of the same song', async () => {
      const env = setup([noContent(), noContent()]);
      await startPlaying(env);
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      await env.output.seek(0);
      await env.output.play();
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual(['ended', 'ended']);
      expect(env.fetch.calls).toHaveLength(2);
    });

    it('ignores states before a session starts and after load', async () => {
      const env = setup();
      await env.output.init();
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      await startPlaying(env);
      await env.output.load(song('spotify:track:b'));
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual([]);
    });
  });

  describe('state events', () => {
    it('emits progress and only reports play and pause transitions', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(state({ position: 1_000 }));
      env.player().emitState(state({ position: 2_000 }));
      env.player().emitState(state({ paused: true, position: 2_500 }));
      env.player().emitState(state({ paused: true, position: 2_500 }));
      env.player().emitState(state({ position: 2_500 }));
      expect(types(env)).toEqual([
        'progress',
        'playing',
        'progress',
        'progress',
        'paused',
        'progress',
        'progress',
        'playing',
      ]);
      expect(env.events[0]).toEqual({ type: 'progress', positionMs: 1_000, durationMs: 180_000 });
    });

    it('reports a pause when the state becomes null (playback moved elsewhere)', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().emitState(null);
      expect(types(env)).toEqual(['paused']);
      expect(env.timers.intervals.size).toBe(0);
    });

    it('ignores a null state when there is no session', async () => {
      const env = setup();
      await env.output.init();
      env.player().emitState(null);
      expect(types(env)).toEqual([]);
    });
  });

  describe('polling fallback', () => {
    it('emits ended once when the position reaches duration minus 300 ms', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().state = state({ position: 179_700 });
      await env.timers.tick();
      await env.timers.tick();
      expect(types(env)).toEqual(['ended']);
      expect(env.timers.intervals.size).toBe(0);
    });

    it('does not emit a second ended when the end state also arrives', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().state = state({ position: 179_800 });
      await env.timers.tick();
      env.player().emitState(state({ paused: true, position: 0, previous: [track(URI)] }));
      expect(types(env)).toEqual(['ended']);
    });

    it('emits progress while the song is far from the end', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().state = state({ position: 5_000 });
      await env.timers.tick();
      expect(env.events).toEqual([{ type: 'progress', positionMs: 5_000, durationMs: 180_000 }]);
      expect(env.timers.sleepLog).toEqual([]);
    });

    it('ignores null, paused, failed or unknown-duration polls', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().state = null;
      await env.timers.tick();
      env.player().state = state({ paused: true, position: 179_900 });
      await env.timers.tick();
      env.player().stateError = new Error('network');
      await env.timers.tick();
      env.player().stateError = null;
      env.player().state = state({ position: 5, duration: 0 });
      await env.timers.tick();
      expect(types(env)).toEqual(['progress']);
    });

    it('ignores a poll that resolves after the user paused', async () => {
      const env = setup();
      await startPlaying(env);
      env.player().state = state({ position: 179_900 });
      const polled = env.timers.tick();
      await env.output.pause();
      await polled;
      expect(types(env)).toEqual([]);
    });

    it('does nothing when the player is gone', async () => {
      const env = setup();
      await startPlaying(env);
      const [handler] = [...env.timers.intervals.values()];
      env.output.dispose();
      handler?.();
      await settle();
      expect(types(env)).toEqual([]);
    });

    it('uses the configured poll interval', async () => {
      const env = setup();
      const spy = vi.spyOn(env.timers, 'setInterval');
      const custom = new SpotifyOutput({
        tokens: env.tokens,
        fetch: new FakeFetch(noContent()).fetch,
        loadSdk: env.loadSdk,
        clock: env.clock,
        timers: env.timers,
        sleep: env.timers.sleep,
        pollIntervalMs: 250,
        readyTimeoutMs: 50,
        retryBackoffMs: [1],
      });
      await custom.load(song());
      await custom.play();
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 250);
    });
  });

  describe('dispose', () => {
    it('disconnects, removes listeners and clears the polling timer', async () => {
      const env = setup();
      await startPlaying(env);
      const statusListener = vi.fn();
      env.output.onStatusChange(statusListener);
      const player = env.player();
      expect(player.listenerCount()).toBe(7);
      env.output.dispose();
      expect(player.calls).toContain('disconnect');
      expect(player.listenerCount()).toBe(0);
      expect(env.timers.intervals.size).toBe(0);
      expect(env.output.getStatus()).toBe('disconnected');
      env.output.dispose();
      expect(player.calls.filter((call) => call === 'disconnect')).toHaveLength(1);
      expect(statusListener).not.toHaveBeenCalled();
    });

    it('stops notifying subscribers and rejects pending ready waiters', async () => {
      const env = setup([noContent()], (player) => {
        player.autoReady = false;
      });
      const init = env.output.init();
      await settle();
      const listener = vi.fn();
      const unsubscribe = env.output.subscribe(listener);
      env.output.dispose();
      await expect(init).rejects.toThrow('spotify-not-ready');
      unsubscribe();
      expect(listener).not.toHaveBeenCalled();
    });

    it('does not fail when disposed before anything was created', () => {
      const env = setup();
      env.output.dispose();
      expect(env.output.getStatus()).toBe('disconnected');
    });
  });
});
