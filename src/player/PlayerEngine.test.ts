import { describe, expect, it, vi } from 'vitest';
import { PlaybackError, SongNotFoundError } from '../core/errors';
import { PlaylistLibrary } from '../core/PlaylistLibrary';
import { ShuffleOrder } from '../core/ShuffleOrder';
import type { Track } from '../core/Song';
import { CounterIds, FakeClock, makeTrack, SeededRandom } from '../core/test-utils/fakes';
import type { MediaSessionAdapter, MediaSessionHandlers } from './MediaSessionAdapter';
import { PlayerEngine } from './PlayerEngine';
import type { PlayerEngineDeps, PlayerState } from './PlayerEngine';
import { FakeAudioOutput, settle } from './test-utils/FakeAudioOutput';

function spotifyTrack(id: string, durationMs = 1_000): Track {
  return { ...makeTrack(id, durationMs), source: 'spotify', uri: `spotify:track:${id}` };
}

class FakeMediaSession implements MediaSessionAdapter {
  readonly calls: string[] = [];
  handlers: Partial<MediaSessionHandlers> = {};
  setMetadata(song: { title: string } | null): void {
    this.calls.push(`metadata:${song === null ? 'null' : song.title}`);
  }
  setPlaybackState(state: string): void {
    this.calls.push(`state:${state}`);
  }
  setPositionState(positionMs: number, durationMs: number): void {
    this.calls.push(`position:${positionMs}/${durationMs}`);
  }
  setActionHandlers(handlers: Partial<MediaSessionHandlers>): void {
    this.handlers = handlers;
  }
}

interface Env {
  engine: PlayerEngine;
  library: PlaylistLibrary;
  local: FakeAudioOutput;
  spotify: FakeAudioOutput;
  log: string[];
  clock: FakeClock;
  media: FakeMediaSession;
  ids: () => string[];
}

function setup(
  tracks: readonly string[] = ['a', 'b', 'c'],
  overrides: Partial<PlayerEngineDeps> = {},
  seed = 7,
): Env {
  const log: string[] = [];
  const local = new FakeAudioOutput('local', log);
  const spotify = new FakeAudioOutput('spotify', log);
  const library = new PlaylistLibrary({ ids: new CounterIds('p'), clock: new FakeClock() });
  for (const id of tracks) {
    library.active.addLast(id.startsWith('s') ? spotifyTrack(id) : makeTrack(id));
  }
  const clock = new FakeClock(0);
  const media = new FakeMediaSession();
  const engine = new PlayerEngine({
    library,
    outputs: { local, spotify },
    random: new SeededRandom(seed),
    clock,
    mediaSession: media,
    ...overrides,
  });
  return {
    engine,
    library,
    local,
    spotify,
    log,
    clock,
    media,
    ids: () => library.active.songs().map((song) => song.entryId),
  };
}

function currentTrackId(env: Env): string | undefined {
  return env.library.active.current?.trackId;
}

describe('PlayerEngine', () => {
  describe('state and subscriptions', () => {
    it('starts idle with the first song selected', () => {
      const env = setup();
      expect(env.engine.getState()).toEqual<PlayerState>({
        status: 'idle',
        currentEntryId: env.ids()[0] ?? null,
        positionMs: 0,
        durationMs: 1_000,
        volume: 1,
        muted: false,
        repeat: 'off',
        shuffle: false,
        error: null,
      });
    });

    it('starts idle with no current song for an empty playlist', () => {
      const env = setup([]);
      expect(env.engine.getState().currentEntryId).toBeNull();
      expect(env.engine.getState().durationMs).toBe(0);
    });

    it('returns the same snapshot reference until something changes', async () => {
      const env = setup();
      const before = env.engine.getState();
      expect(env.engine.getState()).toBe(before);
      env.engine.setRepeat('off');
      expect(env.engine.getState()).toBe(before);
      await env.engine.play();
      expect(env.engine.getState()).not.toBe(before);
    });

    it('notifies subscribers and stops after unsubscribe', async () => {
      const env = setup();
      const listener = vi.fn();
      const unsubscribe = env.engine.subscribe(listener);
      env.engine.setRepeat('all');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(env.engine.getState());
      unsubscribe();
      env.engine.setRepeat('one');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('publishes progress separately without replacing the main snapshot', async () => {
      const env = setup();
      await env.engine.play();
      const snapshot = env.engine.getState();
      const listener = vi.fn();
      const stateListener = vi.fn();
      env.engine.subscribe(stateListener);
      const unsubscribe = env.engine.subscribeProgress(listener);
      env.local.emit({ type: 'progress', positionMs: 400, durationMs: 1_000 });
      env.local.emit({ type: 'progress', positionMs: 500, durationMs: 1_000 });
      expect(env.engine.getState()).toBe(snapshot);
      expect(stateListener).not.toHaveBeenCalled();
      expect(listener).toHaveBeenLastCalledWith({ positionMs: 500, durationMs: 1_000 });
      expect(env.engine.getProgress()).toEqual({ positionMs: 500, durationMs: 1_000 });
      unsubscribe();
      env.local.emit({ type: 'progress', positionMs: 600, durationMs: 1_000 });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('ignores identical progress values and keeps the known duration when the output reports none', async () => {
      const env = setup();
      await env.engine.play();
      const listener = vi.fn();
      env.engine.subscribeProgress(listener);
      env.local.emit({ type: 'progress', positionMs: 100, durationMs: 0 });
      env.local.emit({ type: 'progress', positionMs: 100, durationMs: 0 });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(env.engine.getProgress()).toEqual({ positionMs: 100, durationMs: 1_000 });
    });
  });

  describe('play, pause and toggle', () => {
    it('does nothing when the playlist is empty', async () => {
      const env = setup([]);
      await env.engine.play();
      expect(env.engine.getState().status).toBe('idle');
      expect(env.local.calls).toEqual([]);
    });

    it('starts at the head when nothing is playing', async () => {
      const env = setup();
      await env.engine.play();
      expect(env.engine.getState().status).toBe('playing');
      expect(env.engine.getState().currentEntryId).toBe(env.ids()[0]);
      expect(env.local.calls).toEqual(['load:blob:a@0', 'volume:1', 'play']);
    });

    it('is a no-op while already playing', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.play();
      expect(env.local.count('play')).toBe(1);
    });

    it('pauses and resumes the same loaded song without reloading', async () => {
      const env = setup();
      await env.engine.play();
      env.local.emit({ type: 'progress', positionMs: 450, durationMs: 1_000 });
      await env.engine.pause();
      expect(env.engine.getState().status).toBe('paused');
      expect(env.engine.getState().positionMs).toBe(450);
      expect(env.local.count('pause')).toBe(1);
      await env.engine.play();
      expect(env.engine.getState().status).toBe('playing');
      expect(env.local.count('load')).toBe(1);
      expect(env.local.count('play')).toBe(2);
    });

    it('ignores pause when nothing is playing', async () => {
      const env = setup();
      await env.engine.pause();
      expect(env.local.calls).toEqual([]);
    });

    it('toggles between play and pause', async () => {
      const env = setup();
      await env.engine.togglePlay();
      expect(env.engine.getState().status).toBe('playing');
      await env.engine.togglePlay();
      expect(env.engine.getState().status).toBe('paused');
    });

    it('pauses a load that is still in flight and never plays it afterwards', async () => {
      const env = setup();
      env.local.manualLoads = true;
      const playing = env.engine.play();
      await settle();
      expect(env.engine.getState().status).toBe('loading');
      await env.engine.pause();
      env.local.pendingLoads[0]?.resolve();
      await playing;
      expect(env.engine.getState().status).toBe('paused');
      expect(env.local.count('play')).toBe(0);
      env.local.manualLoads = false;
      await env.engine.play();
      expect(env.local.count('load')).toBe(2);
    });

    it('reloads from the start after the output was released', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.pause();
      await env.engine.switchPlaylist(env.library.create('Other').id);
      expect(env.engine.getState().status).toBe('idle');
    });

    it('restarts a failed load when play is pressed again', async () => {
      const env = setup(['a']);
      env.local.failingUris.add('blob:a');
      await env.engine.play();
      expect(env.engine.getState().status).toBe('error');
      env.local.failingUris.clear();
      await env.engine.play();
      expect(env.engine.getState().status).toBe('playing');
      expect(env.engine.getState().error).toBeNull();
    });
  });

  describe('next and previous', () => {
    it('moves forward and backward through the list', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.next();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().currentEntryId).toBe(env.ids()[1]);
      await env.engine.next();
      expect(currentTrackId(env)).toBe('c');
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('does nothing for next on an empty playlist', async () => {
      const env = setup([]);
      await env.engine.next();
      await env.engine.previous();
      expect(env.local.calls).toEqual([]);
    });

    it('stops paused at position 0 when next is pressed on the tail with repeat off', async () => {
      const env = setup();
      await env.engine.playEntry(env.ids()[2] ?? '');
      env.local.emit({ type: 'progress', positionMs: 800, durationMs: 1_000 });
      await env.engine.next();
      expect(env.engine.getState().status).toBe('paused');
      expect(env.engine.getState().positionMs).toBe(0);
      expect(currentTrackId(env)).toBe('c');
      expect(env.local.calls.slice(-2)).toEqual(['pause', 'seek:0']);
      await env.engine.play();
      expect(env.engine.getState().status).toBe('playing');
      expect(env.local.count('load')).toBe(1);
    });

    it('wraps to the head on next with repeat all', async () => {
      const env = setup();
      env.engine.setRepeat('all');
      await env.engine.playEntry(env.ids()[2] ?? '');
      await env.engine.next();
      expect(currentTrackId(env)).toBe('a');
    });

    it('restarts the current song when previous is pressed after 3 seconds', async () => {
      const env = setup();
      await env.engine.playEntry(env.ids()[1] ?? '');
      env.local.emit({ type: 'progress', positionMs: 3_001, durationMs: 10_000 });
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('b');
      expect(env.local.calls.at(-1)).toBe('seek:0');
      expect(env.local.count('load')).toBe(1);
      expect(env.engine.getProgress().positionMs).toBe(0);
    });

    it('goes to the previous song when the position is exactly 3 seconds', async () => {
      const env = setup();
      await env.engine.playEntry(env.ids()[1] ?? '');
      env.local.emit({ type: 'progress', positionMs: 3_000, durationMs: 10_000 });
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('a');
    });

    it('restarts on previous at the head with repeat off', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('a');
      expect(env.local.calls.at(-1)).toBe('seek:0');
    });

    it('loads the head again on previous when nothing is loaded yet', async () => {
      const env = setup();
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('a');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('goes to the tail on previous at the head with repeat all', async () => {
      const env = setup();
      env.engine.setRepeat('all');
      await env.engine.play();
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('c');
    });

    it('lands on the third next after three rapid nexts and only plays that one', async () => {
      const env = setup(['a', 'b', 'c', 'd', 'e']);
      await env.engine.play();
      env.local.manualLoads = true;
      env.local.calls.length = 0;
      const requests = [env.engine.next(), env.engine.next(), env.engine.next()];
      expect(currentTrackId(env)).toBe('d');
      expect(env.engine.getState().currentEntryId).toBe(env.ids()[3]);
      const [first, second, third] = env.local.pendingLoads;
      second?.resolve();
      third?.resolve();
      first?.resolve();
      await Promise.all(requests);
      expect(env.local.count('play')).toBe(1);
      expect(env.local.calls.filter((call) => call.startsWith('load'))).toEqual([
        'load:blob:b@0',
        'load:blob:c@0',
        'load:blob:d@0',
      ]);
      expect(env.engine.getState().status).toBe('playing');
      expect(env.engine.getState().currentEntryId).toBe(env.ids()[3]);
    });
  });

  describe('playEntry', () => {
    it('plays the chosen entry from the start', async () => {
      const env = setup();
      await env.engine.playEntry(env.ids()[2] ?? '');
      expect(currentTrackId(env)).toBe('c');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('throws SongNotFoundError for an unknown entry and keeps the state', async () => {
      const env = setup();
      await expect(env.engine.playEntry('nope')).rejects.toBeInstanceOf(SongNotFoundError);
      expect(env.engine.getState().status).toBe('idle');
    });
  });

  describe('automatic advance', () => {
    it('repeats the same song from 0 on ended with repeat one', async () => {
      const env = setup();
      env.engine.setRepeat('one');
      await env.engine.play();
      env.local.calls.length = 0;
      env.local.emit({ type: 'ended' });
      await settle();
      expect(currentTrackId(env)).toBe('a');
      expect(env.local.calls).toEqual(['seek:0', 'volume:1', 'play']);
      expect(env.engine.getState().status).toBe('playing');
    });

    it('moves to the next song on a manual next even with repeat one', async () => {
      const env = setup();
      env.engine.setRepeat('one');
      await env.engine.play();
      await env.engine.next();
      expect(currentTrackId(env)).toBe('b');
    });

    it('advances on ended with repeat off', async () => {
      const env = setup();
      await env.engine.play();
      env.local.emit({ type: 'ended' });
      await settle();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('goes back to the head on ended at the tail with repeat all', async () => {
      const env = setup();
      env.engine.setRepeat('all');
      await env.engine.playEntry(env.ids()[2] ?? '');
      env.local.emit({ type: 'ended' });
      await settle();
      expect(currentTrackId(env)).toBe('a');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('pauses at position 0 on ended at the tail with repeat off', async () => {
      const env = setup();
      await env.engine.playEntry(env.ids()[2] ?? '');
      env.local.emit({ type: 'ended' });
      await settle();
      expect(env.engine.getState().status).toBe('paused');
      expect(env.engine.getState().positionMs).toBe(0);
      expect(currentTrackId(env)).toBe('c');
    });

    it('survives a seek rejection while stopping at the end', async () => {
      const env = setup(['a']);
      await env.engine.play();
      vi.spyOn(env.local, 'seek').mockRejectedValue(new Error('seek failed'));
      env.local.emit({ type: 'ended' });
      await settle();
      expect(env.engine.getState().status).toBe('paused');
    });

    it('does not advance when the stop is superseded by a new request', async () => {
      const env = setup();
      await env.engine.playEntry(env.ids()[2] ?? '');
      const stopping = env.engine.next();
      const restarting = env.engine.playEntry(env.ids()[0] ?? '');
      await Promise.all([stopping, restarting]);
      expect(env.engine.getState().status).toBe('playing');
      expect(currentTrackId(env)).toBe('a');
    });

    it('still advances when the output paused itself right before ended', async () => {
      const env = setup();
      await env.engine.play();
      env.local.emit({ type: 'paused' });
      env.local.emit({ type: 'ended' });
      await settle();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('ignores ended while paused by the user or idle or while a load is pending', async () => {
      const env = setup();
      env.local.emit({ type: 'ended' });
      await env.engine.play();
      await env.engine.pause();
      env.local.emit({ type: 'ended' });
      await settle();
      expect(currentTrackId(env)).toBe('a');
      env.local.manualLoads = true;
      const next = env.engine.next();
      env.local.emit({ type: 'ended' });
      await settle();
      env.local.pendingLoads[0]?.resolve();
      await next;
      expect(currentTrackId(env)).toBe('b');
      expect(env.local.count('load')).toBe(2);
    });
  });

  describe('switching outputs', () => {
    it('pauses spotify before html5 plays', async () => {
      const env = setup(['s1', 'b']);
      await env.engine.play();
      expect(env.spotify.count('play')).toBe(1);
      env.log.length = 0;
      await env.engine.next();
      expect(env.log.indexOf('spotify.pause')).toBeGreaterThanOrEqual(0);
      expect(env.log.indexOf('spotify.pause')).toBeLessThan(env.log.indexOf('local.play'));
      expect(env.log.indexOf('spotify.pause')).toBeLessThan(env.log.indexOf('local.load:blob:b@0'));
    });

    it('does not pause the output when staying on the same source', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.next();
      expect(env.local.count('pause')).toBe(0);
    });

    it('ignores a pause rejection from the previous output', async () => {
      const env = setup(['s1', 'b']);
      await env.engine.play();
      vi.spyOn(env.spotify, 'pause').mockRejectedValue(new Error('boom'));
      await env.engine.next();
      expect(env.engine.getState().status).toBe('playing');
      expect(currentTrackId(env)).toBe('b');
    });

    it('drops a request superseded while the previous output is pausing', async () => {
      const env = setup(['s1', 'b', 'c']);
      await env.engine.play();
      const first = env.engine.next();
      const second = env.engine.next();
      await Promise.all([first, second]);
      expect(currentTrackId(env)).toBe('c');
      expect(env.local.count('play')).toBe(1);
      expect(env.local.count('load')).toBe(1);
    });

    it('ignores events from an output that is not active', async () => {
      const env = setup(['s1', 'b']);
      await env.engine.play();
      await env.engine.next();
      env.spotify.emit({ type: 'ended' });
      env.spotify.emit({ type: 'paused' });
      await settle();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().status).toBe('playing');
    });
  });

  describe('errors', () => {
    it('reverts to paused with an autoplay-blocked key when play rejects with NotAllowedError', async () => {
      const env = setup();
      env.local.playError = new DOMException('blocked', 'NotAllowedError');
      await env.engine.play();
      expect(env.engine.getState().status).toBe('paused');
      expect(env.engine.getState().error).toBe('autoplay-blocked');
      env.local.playError = null;
      await env.engine.play();
      expect(env.engine.getState().status).toBe('playing');
      expect(env.engine.getState().error).toBeNull();
      expect(env.local.count('load')).toBe(1);
    });

    it('treats a PlaybackError autoplay-blocked message as blocked autoplay', async () => {
      const env = setup();
      env.local.playError = new PlaybackError('autoplay-blocked');
      await env.engine.play();
      expect(env.engine.getState().error).toBe('autoplay-blocked');
    });

    it('skips a song that fails to load', async () => {
      const env = setup();
      env.local.failingUris.add('blob:a');
      await env.engine.play();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().status).toBe('playing');
      expect(env.engine.getState().error).toBeNull();
    });

    it('stops with all-failed after as many consecutive failures as songs', async () => {
      const env = setup();
      for (const id of ['a', 'b', 'c']) env.local.failingUris.add(`blob:${id}`);
      await env.engine.play();
      expect(env.engine.getState().status).toBe('error');
      expect(env.engine.getState().error).toBe('all-failed');
      expect(env.local.count('load')).toBe(3);
      expect(env.local.calls.at(-1)).toBe('pause');
    });

    it('stops with all-failed for a single failing song', async () => {
      const env = setup(['a']);
      env.local.failingUris.add('blob:a');
      await env.engine.play();
      expect(env.engine.getState().error).toBe('all-failed');
      expect(env.local.count('load')).toBe(1);
    });

    it('stops with playback-failed when the tail fails and repeat is off', async () => {
      const env = setup();
      env.local.failingUris.add('blob:c');
      await env.engine.playEntry(env.ids()[2] ?? '');
      expect(env.engine.getState().status).toBe('error');
      expect(env.engine.getState().error).toBe('playback-failed');
    });

    it('resets the failure counter on a new user command', async () => {
      const env = setup();
      env.local.failingUris.add('blob:b');
      await env.engine.playEntry(env.ids()[1] ?? '');
      expect(currentTrackId(env)).toBe('c');
      expect(env.engine.getState().status).toBe('playing');
      await env.engine.playEntry(env.ids()[1] ?? '');
      expect(currentTrackId(env)).toBe('c');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('stops immediately on a fatal spotify-not-ready error', async () => {
      const env = setup(['s1', 's2']);
      vi.spyOn(env.spotify, 'play').mockRejectedValue(new PlaybackError('spotify-not-ready'));
      await env.engine.play();
      expect(env.engine.getState().status).toBe('error');
      expect(env.engine.getState().error).toBe('spotify-not-ready');
      expect(env.spotify.count('load')).toBe(1);
    });

    it('treats a missing output as a failed song', async () => {
      const env = setup(['s1'], { outputs: {} });
      await env.engine.play();
      expect(env.engine.getState().error).toBe('all-failed');
    });

    it('skips to the next song when the output reports an error while playing', async () => {
      const env = setup();
      await env.engine.play();
      env.local.emit({ type: 'error', error: new Error('decode failed') });
      await settle();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().status).toBe('playing');
    });

    it('ignores output errors when nothing is playing', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.pause();
      env.local.emit({ type: 'error', error: new Error('late') });
      await settle();
      expect(env.engine.getState().status).toBe('paused');
    });
  });

  describe('output events', () => {
    it('reflects buffering and recovery', async () => {
      const env = setup();
      await env.engine.play();
      env.local.emit({ type: 'loading' });
      expect(env.engine.getState().status).toBe('loading');
      env.local.emit({ type: 'playing' });
      expect(env.engine.getState().status).toBe('playing');
    });

    it('ignores buffering events while a load is pending or when not playing', async () => {
      const env = setup();
      env.local.manualLoads = true;
      const playing = env.engine.play();
      await settle();
      env.local.emit({ type: 'playing' });
      env.local.emit({ type: 'paused' });
      env.local.emit({ type: 'progress', positionMs: 5, durationMs: 9 });
      expect(env.engine.getState().status).toBe('loading');
      expect(env.engine.getProgress().positionMs).toBe(0);
      env.local.pendingLoads[0]?.resolve();
      await playing;
      await env.engine.pause();
      env.local.emit({ type: 'loading' });
      expect(env.engine.getState().status).toBe('paused');
    });

    it('follows an external pause', async () => {
      const env = setup();
      await env.engine.play();
      env.local.emit({ type: 'progress', positionMs: 300, durationMs: 1_000 });
      env.local.emit({ type: 'paused' });
      expect(env.engine.getState().status).toBe('paused');
      expect(env.engine.getState().positionMs).toBe(300);
    });
  });

  describe('playlist changes', () => {
    it('loads the new current song when the playing one is removed', async () => {
      const env = setup();
      await env.engine.play();
      env.library.active.remove(env.ids()[0] ?? '');
      await env.engine.onPlaylistChanged();
      expect(currentTrackId(env)).toBe('b');
      expect(env.engine.getState().currentEntryId).toBe(env.ids()[0]);
      expect(env.engine.getState().status).toBe('playing');
      expect(env.local.calls.at(-3)).toBe('load:blob:b@0');
    });

    it('only updates the selection when the paused current song is removed', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.pause();
      env.library.active.remove(env.ids()[0] ?? '');
      await env.engine.onPlaylistChanged();
      expect(env.engine.getState().status).toBe('paused');
      expect(env.engine.getState().currentEntryId).toBe(env.ids()[0]);
      expect(env.local.count('load')).toBe(1);
      await env.engine.play();
      expect(env.local.count('load')).toBe(2);
    });

    it('stops and releases the output when the playlist becomes empty', async () => {
      const env = setup(['a']);
      await env.engine.play();
      env.library.active.remove(env.ids()[0] ?? '');
      await env.engine.onPlaylistChanged();
      expect(env.engine.getState()).toMatchObject({
        status: 'idle',
        currentEntryId: null,
        positionMs: 0,
        durationMs: 0,
      });
      expect(env.local.calls.at(-1)).toBe('pause');
      expect(env.media.calls).toContain('metadata:null');
    });

    it('keeps playing when another song is removed or added', async () => {
      const env = setup();
      await env.engine.play();
      env.library.active.remove(env.ids()[2] ?? '');
      env.library.active.addLast(makeTrack('d'));
      await env.engine.onPlaylistChanged();
      expect(env.engine.getState().status).toBe('playing');
      expect(env.local.count('load')).toBe(1);
    });

    it('adopts a song added to an empty idle playlist', async () => {
      const env = setup([]);
      const song = env.library.active.addLast(makeTrack('x'));
      await env.engine.onPlaylistChanged();
      expect(env.engine.getState().currentEntryId).toBe(song.entryId);
      expect(env.engine.getState().durationMs).toBe(1_000);
      expect(env.engine.getState().status).toBe('idle');
    });

    it('does nothing after dispose', async () => {
      const env = setup();
      env.engine.dispose();
      env.library.active.remove(env.ids()[0] ?? '');
      await env.engine.onPlaylistChanged();
      expect(env.engine.getState().status).toBe('idle');
    });
  });

  describe('shuffle', () => {
    async function playOrder(env: Env, count: number): Promise<string[]> {
      const seen: string[] = [currentTrackId(env) ?? ''];
      for (let i = 1; i < count; i++) {
        await env.engine.next();
        seen.push(currentTrackId(env) ?? '');
      }
      return seen;
    }

    it('plays a deterministic order with the current song first', async () => {
      const env = setup(['a', 'b', 'c', 'd', 'e']);
      await env.engine.playEntry(env.ids()[1] ?? '');
      env.engine.toggleShuffle();
      expect(env.engine.getState().shuffle).toBe(true);
      const expected = new ShuffleOrder(env.ids(), env.ids()[1] ?? null, new SeededRandom(7)).ids();
      const expectedTracks = expected.map((id) => env.library.active.songs().find((s) => s.entryId === id)?.trackId);
      const seen = await playOrder(env, 5);
      expect(seen).toEqual(expectedTracks);
      expect(seen[0]).toBe('b');
      expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('goes back along the shuffled order', async () => {
      const env = setup(['a', 'b', 'c', 'd']);
      await env.engine.play();
      env.engine.toggleShuffle();
      await env.engine.next();
      const second = currentTrackId(env);
      await env.engine.next();
      await env.engine.previous();
      expect(currentTrackId(env)).toBe(second);
    });

    it('restarts on previous at the start of the shuffled order with repeat off', async () => {
      const env = setup(['a', 'b', 'c']);
      await env.engine.play();
      env.engine.toggleShuffle();
      await env.engine.previous();
      expect(currentTrackId(env)).toBe('a');
      expect(env.local.calls.at(-1)).toBe('seek:0');
    });

    it('wraps the shuffled order with repeat all and stops at its end with repeat off', async () => {
      const env = setup(['a', 'b']);
      await env.engine.play();
      env.engine.toggleShuffle();
      await env.engine.next();
      await env.engine.next();
      expect(env.engine.getState().status).toBe('paused');
      env.engine.setRepeat('all');
      await env.engine.play();
      await env.engine.next();
      expect(env.engine.getState().status).toBe('playing');
    });

    it('returns to the original order after turning shuffle off', async () => {
      const env = setup(['a', 'b', 'c', 'd', 'e']);
      await env.engine.playEntry(env.ids()[2] ?? '');
      env.engine.toggleShuffle();
      env.engine.toggleShuffle();
      expect(env.engine.getState().shuffle).toBe(false);
      await env.engine.next();
      expect(currentTrackId(env)).toBe('d');
      await env.engine.next();
      expect(currentTrackId(env)).toBe('e');
    });

    it('plays every song exactly once after inserting and removing with shuffle on', async () => {
      const env = setup(['a', 'b', 'c', 'd']);
      await env.engine.play();
      env.engine.toggleShuffle();
      env.library.active.addFirst(makeTrack('x'));
      env.library.active.addLast(makeTrack('y'));
      env.library.active.remove(env.ids()[2] ?? '');
      await env.engine.onPlaylistChanged();
      const remaining = env.library.active.songs().map((s) => s.trackId).sort();
      const seen = await playOrder(env, remaining.length);
      expect([...seen].sort()).toEqual(remaining);
      expect(new Set(seen).size).toBe(remaining.length);
    });

    it('does not fail with zero or one songs', async () => {
      const empty = setup([]);
      empty.engine.toggleShuffle();
      await empty.engine.next();
      const single = setup(['a']);
      single.engine.toggleShuffle();
      await single.engine.play();
      await single.engine.next();
      expect(single.engine.getState().status).toBe('paused');
    });

    it('starts with shuffle enabled from the initial preferences', async () => {
      const env = setup(['a', 'b', 'c'], { initial: { shuffle: true, repeat: 'all', volume: 0.4, muted: true } });
      expect(env.engine.getState()).toMatchObject({ shuffle: true, repeat: 'all', volume: 0.4, muted: true });
      await env.engine.play();
      await env.engine.next();
      expect(env.engine.getState().status).toBe('playing');
    });

    it('rebuilds the order for the new playlist on switch', async () => {
      const env = setup(['a', 'b']);
      env.engine.toggleShuffle();
      const other = env.library.create('Other');
      other.addLast(makeTrack('p'));
      other.addLast(makeTrack('q'));
      await env.engine.switchPlaylist(other.id);
      await env.engine.play();
      await env.engine.next();
      expect(['p', 'q']).toContain(currentTrackId(env));
      expect(env.engine.getState().status).toBe('playing');
    });
  });

  describe('volume and mute', () => {
    it('clamps and applies the volume to the active output', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.setVolume(0.4);
      expect(env.engine.getState().volume).toBe(0.4);
      expect(env.local.calls.at(-1)).toBe('volume:0.4');
      await env.engine.setVolume(7);
      expect(env.engine.getState().volume).toBe(1);
      await env.engine.setVolume(-3);
      expect(env.engine.getState().volume).toBe(0);
      await env.engine.setVolume(Number.NaN);
      expect(env.engine.getState().volume).toBe(0);
    });

    it('stores the volume without an output and applies it on load', async () => {
      const env = setup();
      await env.engine.setVolume(0.3);
      await env.engine.play();
      expect(env.local.calls).toContain('volume:0.3');
    });

    it('restores the previous volume after mute and unmute', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.setVolume(0.6);
      await env.engine.toggleMute();
      expect(env.engine.getState()).toMatchObject({ muted: true, volume: 0.6 });
      expect(env.local.calls.at(-1)).toBe('volume:0');
      await env.engine.toggleMute();
      expect(env.engine.getState()).toMatchObject({ muted: false, volume: 0.6 });
      expect(env.local.calls.at(-1)).toBe('volume:0.6');
    });

    it('unmutes when the volume is raised while muted', async () => {
      const env = setup();
      await env.engine.toggleMute();
      await env.engine.setVolume(0.5);
      expect(env.engine.getState().muted).toBe(false);
    });

    it('keeps muted when the volume is set to zero while muted', async () => {
      const env = setup();
      await env.engine.toggleMute();
      await env.engine.setVolume(0);
      expect(env.engine.getState().muted).toBe(true);
    });

    it('restores an audible volume when unmuting from zero', async () => {
      const env = setup();
      await env.engine.setVolume(0.7);
      await env.engine.setVolume(0);
      await env.engine.toggleMute();
      await env.engine.toggleMute();
      expect(env.engine.getState()).toMatchObject({ muted: false, volume: 0.7 });
    });

    it('loads muted songs silently', async () => {
      const env = setup();
      await env.engine.toggleMute();
      await env.engine.play();
      expect(env.local.calls).toContain('volume:0');
    });

    it('falls back to full volume when the initial volume is zero', async () => {
      const env = setup(['a'], { initial: { volume: 0 } });
      await env.engine.toggleMute();
      await env.engine.toggleMute();
      expect(env.engine.getState().volume).toBe(1);
    });
  });

  describe('seek', () => {
    it('clamps to the song duration and to zero', async () => {
      const env = setup();
      await env.engine.play();
      await env.engine.seek(5_000);
      expect(env.local.calls.at(-1)).toBe('seek:1000');
      expect(env.engine.getState().positionMs).toBe(1_000);
      await env.engine.seek(-10);
      expect(env.local.calls.at(-1)).toBe('seek:0');
      await env.engine.seek(400);
      expect(env.local.calls.at(-1)).toBe('seek:400');
      expect(env.engine.getProgress().positionMs).toBe(400);
    });

    it('does not clamp the upper bound when the duration is unknown', async () => {
      const env = setup(['a']);
      env.library.active.addLast(makeTrack('z', 0));
      await env.engine.next();
      await env.engine.seek(9_999);
      expect(env.local.calls.at(-1)).toBe('seek:9999');
    });

    it('ignores seek without a loaded song and non-finite values', async () => {
      const env = setup();
      await env.engine.seek(100);
      await env.engine.play();
      await env.engine.seek(Number.NaN);
      expect(env.local.count('seek')).toBe(0);
    });
  });

  describe('repeat', () => {
    it('cycles off, all, one, off', () => {
      const env = setup();
      const seen = [];
      for (let i = 0; i < 4; i++) {
        env.engine.cycleRepeat();
        seen.push(env.engine.getState().repeat);
      }
      expect(seen).toEqual(['all', 'one', 'off', 'all']);
    });

    it('sets an explicit mode', () => {
      const env = setup();
      env.engine.setRepeat('one');
      expect(env.engine.getState().repeat).toBe('one');
    });
  });

  describe('switchPlaylist', () => {
    it('pauses playback and resets the state for the new playlist', async () => {
      const env = setup();
      await env.engine.play();
      const other = env.library.create('Other');
      const song = other.addLast(makeTrack('p', 2_000));
      env.log.length = 0;
      await env.engine.switchPlaylist(other.id);
      expect(env.log).toEqual(['local.pause']);
      expect(env.library.active.id).toBe(other.id);
      expect(env.engine.getState()).toMatchObject({
        status: 'idle',
        currentEntryId: song.entryId,
        positionMs: 0,
        durationMs: 2_000,
        error: null,
      });
      await env.engine.play();
      expect(env.local.calls.at(-3)).toBe('load:blob:p@0');
    });

    it('switches to an empty playlist', async () => {
      const env = setup();
      const empty = env.library.create('Empty');
      await env.engine.switchPlaylist(empty.id);
      expect(env.engine.getState()).toMatchObject({ currentEntryId: null, durationMs: 0 });
    });

    it('rejects an unknown playlist without pausing anything', async () => {
      const env = setup();
      await env.engine.play();
      env.local.calls.length = 0;
      await expect(env.engine.switchPlaylist('missing')).rejects.toThrow();
      expect(env.local.calls).toEqual([]);
      expect(env.engine.getState().status).toBe('playing');
    });

    it('ignores a pending load of the old playlist', async () => {
      const env = setup();
      env.local.manualLoads = true;
      const playing = env.engine.play();
      await settle();
      const other = env.library.create('Other');
      await env.engine.switchPlaylist(other.id);
      env.local.pendingLoads[0]?.resolve();
      await playing;
      expect(env.engine.getState().status).toBe('idle');
      expect(env.local.count('play')).toBe(0);
    });
  });

  describe('media session', () => {
    it('publishes metadata, state and throttled position', async () => {
      const env = setup();
      await env.engine.play();
      expect(env.media.calls).toContain('metadata:Title a');
      expect(env.media.calls).toContain('state:playing');
      env.media.calls.length = 0;
      env.local.emit({ type: 'progress', positionMs: 100, durationMs: 1_000 });
      env.local.emit({ type: 'progress', positionMs: 200, durationMs: 1_000 });
      expect(env.media.calls).toEqual([]);
      env.clock.time += 1_500;
      env.local.emit({ type: 'progress', positionMs: 300, durationMs: 1_000 });
      expect(env.media.calls).toEqual(['position:300/1000']);
      await env.engine.pause();
      expect(env.media.calls).toContain('state:paused');
    });

    it('wires the action handlers to engine commands', async () => {
      const env = setup();
      env.media.handlers.play?.();
      await settle();
      expect(env.engine.getState().status).toBe('playing');
      env.media.handlers.nexttrack?.();
      await settle();
      expect(currentTrackId(env)).toBe('b');
      env.media.handlers.previoustrack?.();
      await settle();
      expect(currentTrackId(env)).toBe('a');
      env.media.handlers.seekto?.(250);
      await settle();
      expect(env.local.calls.at(-1)).toBe('seek:250');
      env.media.handlers.pause?.();
      await settle();
      expect(env.engine.getState().status).toBe('paused');
    });

    it('clears the handlers and state on dispose', async () => {
      const env = setup();
      await env.engine.play();
      env.engine.dispose();
      expect(env.media.handlers).toEqual({});
      expect(env.media.calls.at(-1)).toBe('state:none');
    });

    it('reports none when the player halts or switches playlist', async () => {
      const env = setup(['a']);
      env.local.failingUris.add('blob:a');
      await env.engine.play();
      expect(env.media.calls).toContain('state:none');
    });

    it('works without a media session adapter', async () => {
      const env = setup(['a', 'b'], { mediaSession: undefined as never });
      await env.engine.play();
      await env.engine.switchPlaylist(env.library.create('X').id);
      env.engine.dispose();
      expect(env.engine.getState().status).toBe('idle');
    });
  });

  describe('dispose', () => {
    it('stops listening to outputs, silences them and ignores later commands', async () => {
      const env = setup();
      await env.engine.play();
      const listener = vi.fn();
      env.engine.subscribe(listener);
      env.engine.dispose();
      env.engine.dispose();
      expect(env.local.listeners.size).toBe(0);
      expect(env.local.calls.at(-1)).toBe('pause');
      const before = env.local.calls.length;
      await env.engine.play();
      await env.engine.pause();
      await env.engine.next();
      await env.engine.previous();
      await env.engine.playEntry(env.ids()[1] ?? '');
      await env.engine.seek(10);
      await env.engine.setVolume(0.2);
      await env.engine.toggleMute();
      await env.engine.switchPlaylist('whatever');
      expect(env.local.calls.length).toBe(before);
      expect(listener).not.toHaveBeenCalled();
    });

    it('drops an in-flight load that finishes after dispose', async () => {
      const env = setup();
      env.local.manualLoads = true;
      const playing = env.engine.play();
      await settle();
      env.engine.dispose();
      env.local.pendingLoads[0]?.resolve();
      await playing;
      expect(env.local.count('play')).toBe(0);
    });
  });
});
