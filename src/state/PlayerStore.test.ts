import { settle } from '../player/test-utils/FakeAudioOutput';
import { strings } from '../ui/i18n/es';
import { PERSIST_DEBOUNCE_MS, STORAGE_KEY, parsePersistedState } from './persistence';
import { UNDO_WINDOW_MS } from './PlayerStore';
import type { PlayerSnapshot } from './PlayerStore';
import { SpotifyForbiddenError } from '../providers/SpotifyApiClient';
import { createHarness, makeTrack, spotifyTrack, MemoryStorage } from './test-utils/harness';
import type { Harness } from './test-utils/harness';

function titles(h: Harness): string[] {
  return h.store.getSnapshot().songs.map((s) => s.title);
}

function entryIdAt(h: Harness, index: number): string {
  const song = h.store.getSnapshot().songs[index];
  if (song === undefined) throw new Error(`no song at ${index}`);
  return song.entryId;
}

function seed(h: Harness, ...ids: string[]): void {
  for (const id of ids) h.store.addLast(makeTrack(id));
}

describe('PlayerStore snapshot', () => {
  it('starts with the default playlist and an empty list', () => {
    const h = createHarness();
    const s = h.store.getSnapshot();
    expect(s.playlists).toHaveLength(1);
    expect(s.playlists[0]?.isActive).toBe(true);
    expect(s.songs).toEqual([]);
    expect(s.currentEntryId).toBeNull();
    expect(s.spotify).toEqual({ auth: 'logged-out', status: 'disconnected' });
  });

  it('returns the same reference until something changes', () => {
    const h = createHarness();
    const first = h.store.getSnapshot();
    expect(h.store.getSnapshot()).toBe(first);
    h.store.addLast(makeTrack('a'));
    const second = h.store.getSnapshot();
    expect(second).not.toBe(first);
    expect(h.store.getSnapshot()).toBe(second);
  });

  it('notifies subscribers once per change and stops after unsubscribe', () => {
    const h = createHarness();
    const listener = vi.fn();
    const off = h.store.subscribe(listener);
    h.store.addLast(makeTrack('a'));
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    off();
    h.store.addLast(makeTrack('b'));
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('memoizes the songs array across unrelated changes (same playlist version)', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    await settle();
    const before = h.store.getSnapshot().songs;
    h.store.setVolume(0.5);
    await settle();
    expect(h.store.getSnapshot().songs).toBe(before);
    expect(h.store.getSnapshot().player.volume).toBe(0.5);
  });

  it('describes songs with head, tail, index and current flags', () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    const songs = h.store.getSnapshot().songs;
    expect(songs.map((s) => [s.index, s.isHead, s.isTail, s.isCurrent])).toEqual([
      [0, true, false, true],
      [1, false, false, false],
      [2, false, true, false],
    ]);
    expect(h.store.getSnapshot().totalDurationMs).toBe(3_000);
    expect(h.store.getSnapshot().currentIndex).toBe(0);
  });

  it('exposes progress through the engine', async () => {
    const h = createHarness();
    seed(h, 'a');
    h.store.togglePlay();
    await settle();
    const seen: number[] = [];
    h.store.subscribeProgress((p) => seen.push(p.positionMs));
    h.localOutput.emit({ type: 'progress', positionMs: 400, durationMs: 1_000 });
    expect(seen).toEqual([400]);
    expect(h.store.getProgress().positionMs).toBe(400);
  });
});

describe('PlayerStore adding songs', () => {
  it('adds first, last and at a zero-based index', () => {
    const h = createHarness();
    h.store.addLast(makeTrack('b'));
    h.store.addFirst(makeTrack('a'));
    h.store.addAt(1, makeTrack('x'));
    h.store.addAt(3, makeTrack('z'));
    expect(titles(h)).toEqual(['Title a', 'Title x', 'Title b', 'Title z']);
    expect(h.notifier.notices.at(-1)).toBe(strings.add.addedAt('Title z', 4));
  });

  it('adds right after the current song with addNext', () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.addNext(makeTrack('n'));
    expect(titles(h)).toEqual(['Title a', 'Title n', 'Title b']);
  });

  it('playNow inserts after current and plays it', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.playNow(makeTrack('n'));
    await settle();
    expect(titles(h)).toEqual(['Title a', 'Title n', 'Title b']);
    const s = h.store.getSnapshot();
    expect(s.player.status).toBe('playing');
    expect(s.songs[1]?.isCurrent).toBe(true);
    expect(h.localOutput.calls).toContain('load:blob:n@0');
  });

  it('playNow on the track that is already current resumes it without a duplicate entry', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.playEntry(h.store.getSnapshot().songs[0]?.entryId ?? '');
    await settle();
    h.store.togglePlay();
    await settle();
    expect(h.store.getSnapshot().player.status).toBe('paused');
    h.store.playNow(makeTrack('a'));
    await settle();
    expect(titles(h)).toEqual(['Title a', 'Title b']);
    expect(h.store.getSnapshot().player.status).toBe('playing');
    h.store.playNow(makeTrack('a'));
    await settle();
    expect(titles(h)).toEqual(['Title a', 'Title b']);
    expect(h.store.getSnapshot().player.status).toBe('playing');
  });

  it('adds whole albums at the end and at the start keeping order', () => {
    const h = createHarness();
    seed(h, 'm');
    h.store.addManyLast([makeTrack('a1'), makeTrack('a2')], 'Album');
    h.store.addManyFirst([makeTrack('b1'), makeTrack('b2')], 'Other');
    expect(titles(h)).toEqual(['Title b1', 'Title b2', 'Title m', 'Title a1', 'Title a2']);
    expect(h.notifier.notices.at(-1)).toBe(strings.detail.albumAddedToStart('Other', 2));
    h.store.addManyLast([]);
    h.store.addManyFirst([]);
    expect(titles(h)).toHaveLength(5);
  });

  it('uses the album name as the default label', () => {
    const h = createHarness();
    h.store.addManyLast([makeTrack('a1')]);
    expect(h.notifier.notices.at(-1)).toBe(strings.detail.albumAddedToEnd('Album', 1));
    h.store.addManyFirst([makeTrack('a2')]);
    expect(h.notifier.notices.at(-1)).toBe(strings.detail.albumAddedToStart('Album', 1));
  });

  it('calls onPlaylistChanged after mutations so the engine follows an emptied list', async () => {
    const h = createHarness();
    seed(h, 'a');
    h.store.togglePlay();
    await settle();
    h.store.remove(entryIdAt(h, 0));
    await settle();
    expect(h.store.getSnapshot().player.status).toBe('idle');
    expect(h.store.getSnapshot().currentEntryId).toBeNull();
  });
});

describe('PlayerStore remove and undo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows an undo toast and restores at the original index', () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    const removedId = entryIdAt(h, 1);
    const handle = h.store.remove(removedId);
    expect(titles(h)).toEqual(['Title a', 'Title c']);
    expect(h.notifier.undos).toHaveLength(1);
    expect(h.notifier.undos[0]?.durationMs).toBe(UNDO_WINDOW_MS);
    expect(h.notifier.undos[0]?.message).toBe(strings.add.removed('Title b'));
    handle.undo();
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c']);
    expect(entryIdAt(h, 1)).toBe(removedId);
  });

  it('undo through the toast action works too and is idempotent', () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.remove(entryIdAt(h, 0));
    h.notifier.undos[0]?.onUndo();
    h.notifier.undos[0]?.onUndo();
    expect(titles(h)).toEqual(['Title a', 'Title b']);
  });

  it('releases local object URLs only after the undo window expires', () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.remove(entryIdAt(h, 0));
    expect(h.local.released).toEqual([]);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(h.local.released).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.local.released).toEqual(['a']);
  });

  it('does not release when the song was restored', () => {
    const h = createHarness();
    seed(h, 'a');
    const handle = h.store.remove(entryIdAt(h, 0));
    handle.undo();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(h.local.released).toEqual([]);
  });

  it('keeps the URLs while a duplicate entry of the same track remains', () => {
    const h = createHarness();
    h.store.addLast(makeTrack('a'));
    h.store.addLast(makeTrack('a'));
    h.store.remove(entryIdAt(h, 0));
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(h.local.released).toEqual([]);
    h.store.remove(entryIdAt(h, 0));
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(h.local.released).toEqual(['a']);
  });

  it('never releases Spotify tracks', () => {
    const h = createHarness();
    h.store.addLast(spotifyTrack('s'));
    h.store.remove(entryIdAt(h, 0));
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(h.local.released).toEqual([]);
  });

  it('undoes into the playlist the song came from, even after switching', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    const first = h.store.getSnapshot().activePlaylistId;
    const handle = h.store.remove(entryIdAt(h, 0));
    await h.store.createPlaylist('Otra');
    await settle();
    handle.undo();
    expect(titles(h)).toEqual([]);
    h.store.switchPlaylist(first);
    await settle();
    expect(titles(h)).toEqual(['Title a', 'Title b']);
  });

  it('releases pending removals right away when their playlist is deleted', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    const first = h.store.getSnapshot().activePlaylistId;
    const handle = h.store.remove(entryIdAt(h, 0));
    await h.store.createPlaylist('Otra');
    await h.store.deletePlaylist(first);
    expect(h.local.released.sort()).toEqual(['a', 'b']);
    handle.undo();
    expect(h.local.released.sort()).toEqual(['a', 'b']);
  });

  it('flushes timers on dispose', () => {
    const h = createHarness();
    seed(h, 'a');
    h.store.remove(entryIdAt(h, 0));
    h.store.dispose();
    expect(h.local.released).toEqual(['a']);
  });
});

describe('PlayerStore move', () => {
  it('reorders keeping the current song', () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    h.store.move(0, 2);
    expect(titles(h)).toEqual(['Title b', 'Title c', 'Title a']);
    expect(h.store.getSnapshot().songs[2]?.isCurrent).toBe(true);
    const before = h.store.getSnapshot();
    h.store.move(1, 1);
    expect(h.store.getSnapshot()).toBe(before);
  });
});

describe('PlayerStore transport', () => {
  it('delegates play, next, previous, seek, volume, mute, repeat and shuffle', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.togglePlay();
    await settle();
    expect(h.store.getSnapshot().player.status).toBe('playing');
    h.store.next();
    await settle();
    expect(h.store.getSnapshot().songs[1]?.isCurrent).toBe(true);
    h.store.previous();
    await settle();
    expect(h.store.getSnapshot().songs[0]?.isCurrent).toBe(true);
    h.store.seek(500);
    await settle();
    expect(h.localOutput.calls).toContain('seek:500');
    h.store.setVolume(0.4);
    await settle();
    expect(h.store.getSnapshot().player.volume).toBe(0.4);
    h.store.toggleMute();
    await settle();
    expect(h.store.getSnapshot().player.muted).toBe(true);
    h.store.cycleRepeat();
    expect(h.store.getSnapshot().player.repeat).toBe('all');
    h.store.toggleShuffle();
    expect(h.store.getSnapshot().player.shuffle).toBe(true);
    h.store.togglePlay();
    await settle();
    expect(h.store.getSnapshot().player.status).toBe('paused');
  });

  it('playEntry and select start the chosen entry', async () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    h.store.playEntry(entryIdAt(h, 2));
    await settle();
    expect(h.store.getSnapshot().songs[2]?.isCurrent).toBe(true);
    h.store.select(entryIdAt(h, 1));
    await settle();
    expect(h.store.getSnapshot().songs[1]?.isCurrent).toBe(true);
  });

  it('reports a generic error when the engine rejects', async () => {
    const h = createHarness();
    h.store.playEntry('missing');
    await settle();
    expect(h.notifier.errors).toEqual([strings.errors.generic]);
  });

  it('surfaces engine error keys in the snapshot', async () => {
    const h = createHarness();
    seed(h, 'a');
    h.localOutput.failingUris.add('blob:a');
    h.store.togglePlay();
    await settle();
    expect(h.store.getSnapshot().player.status).toBe('error');
    expect(h.store.getSnapshot().player.error).toBe('all-failed');
  });
});

describe('PlayerStore playlists', () => {
  it('creates, renames, switches and deletes playlists', async () => {
    const h = createHarness();
    seed(h, 'a');
    const firstId = h.store.getSnapshot().activePlaylistId;
    const secondId = await h.store.createPlaylist('  Rock  ');
    let s = h.store.getSnapshot();
    expect(s.activePlaylistId).toBe(secondId);
    expect(s.activePlaylistName).toBe('Rock');
    expect(s.songs).toEqual([]);
    expect(s.playlists.map((p) => [p.name, p.size, p.isActive])).toEqual([
      ['Mi lista', 1, false],
      ['Rock', 0, true],
    ]);

    h.store.renamePlaylist(secondId, 'Jazz');
    expect(h.store.getSnapshot().activePlaylistName).toBe('Jazz');

    h.store.switchPlaylist(firstId);
    await settle();
    s = h.store.getSnapshot();
    expect(s.activePlaylistId).toBe(firstId);
    expect(s.songs).toHaveLength(1);

    expect(await h.store.deletePlaylist(secondId)).toBe(true);
    expect(h.store.getSnapshot().playlists).toHaveLength(1);
    expect(h.notifier.notices.at(-1)).toBe(strings.playlist.deletedToast('Jazz'));
  });

  it('blocks deleting the last playlist', async () => {
    const h = createHarness();
    const id = h.store.getSnapshot().activePlaylistId;
    expect(await h.store.deletePlaylist(id)).toBe(false);
    expect(h.store.getSnapshot().playlists).toHaveLength(1);
  });

  it('deleting the active playlist stops playback and activates a neighbour', async () => {
    const h = createHarness();
    seed(h, 'a');
    const firstId = h.store.getSnapshot().activePlaylistId;
    const secondId = await h.store.createPlaylist('Otra');
    h.store.switchPlaylist(firstId);
    await settle();
    h.store.togglePlay();
    await settle();
    expect(h.store.getSnapshot().player.status).toBe('playing');
    await h.store.deletePlaylist(firstId);
    await settle();
    const s = h.store.getSnapshot();
    expect(s.activePlaylistId).toBe(secondId);
    expect(s.player.status).toBe('idle');
    expect(h.localOutput.calls).toContain('pause');
  });

  it('rejects invalid names', async () => {
    const h = createHarness();
    await expect(h.store.createPlaylist('   ')).rejects.toThrow('empty');
    expect(() =>
      h.store.renamePlaylist(h.store.getSnapshot().activePlaylistId, 'x'.repeat(61)),
    ).toThrow('too-long');
  });
});

describe('PlayerStore addToPlaylist', () => {
  it('appends to another playlist without switching or interrupting playback', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    const firstId = h.store.getSnapshot().activePlaylistId;
    const secondId = await h.store.createPlaylist('Rock');
    h.store.switchPlaylist(firstId);
    await settle();
    h.store.togglePlay();
    await settle();
    const before = h.store.getSnapshot();
    expect(before.player.status).toBe('playing');

    h.store.addToPlaylist(secondId, makeTrack('z'));
    await settle();

    const after = h.store.getSnapshot();
    expect(after.activePlaylistId).toBe(firstId);
    expect(titles(h)).toEqual(['Title a', 'Title b']);
    expect(after.currentEntryId).toBe(before.currentEntryId);
    expect(after.player.status).toBe('playing');
    expect(after.playlists.map((p) => [p.name, p.size])).toEqual([
      ['Mi lista', 2],
      ['Rock', 1],
    ]);
    expect(h.notifier.notices.at(-1)).toBe(strings.dnd.addedToPlaylist('Rock'));
  });

  it('appends at the end of the active playlist when it is the target', () => {
    const h = createHarness();
    seed(h, 'a');
    const id = h.store.getSnapshot().activePlaylistId;
    h.store.addToPlaylist(id, makeTrack('b'));
    expect(titles(h)).toEqual(['Title a', 'Title b']);
    expect(h.notifier.notices.at(-1)).toBe(strings.dnd.addedToPlaylist('Mi lista'));
  });

  it('keeps the track when the target playlist is later opened', async () => {
    const h = createHarness();
    const firstId = h.store.getSnapshot().activePlaylistId;
    const secondId = await h.store.createPlaylist('Rock');
    h.store.switchPlaylist(firstId);
    await settle();
    h.store.addToPlaylist(secondId, makeTrack('z'));
    h.store.switchPlaylist(secondId);
    await settle();
    expect(titles(h)).toEqual(['Title z']);
  });

  it('throws for an unknown playlist and does not notify', () => {
    const h = createHarness();
    expect(() => h.store.addToPlaylist('missing', makeTrack('z'))).toThrow();
    expect(h.notifier.notices).toEqual([]);
  });
});

describe('PlayerStore local files', () => {
  it('imports accepted files at the end and reports the rejected ones', async () => {
    const h = createHarness();
    h.local.nextResult = {
      tracks: [makeTrack('l1'), makeTrack('l2')],
      rejected: [{ fileName: 'a.txt', reason: 'unsupported' }],
    };
    expect(await h.store.importLocalFiles([])).toBe(2);
    expect(titles(h)).toEqual(['Title l1', 'Title l2']);
    expect(h.notifier.notices).toContain(strings.library.importedCount(2));
    expect(h.notifier.errors).toEqual([strings.library.rejectedFiles('a.txt')]);
  });

  it('says so when nothing could be imported', async () => {
    const h = createHarness();
    expect(await h.store.importLocalFiles([])).toBe(0);
    expect(h.notifier.errors).toEqual([strings.library.importNothing]);
  });
});

describe('PlayerStore local file placement', () => {
  function incoming(h: Harness, ...ids: string[]): void {
    h.local.nextResult = { tracks: ids.map((id) => makeTrack(id)), rejected: [] };
  }

  it('defaults to the end and keeps the selection order', async () => {
    const h = createHarness();
    seed(h, 'a');
    incoming(h, 'x', 'y', 'z');
    await h.store.importLocalFiles([]);
    expect(titles(h)).toEqual(['Title a', 'Title x', 'Title y', 'Title z']);
  });

  it('first puts the files at positions 1..n in selection order', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    incoming(h, 'x', 'y');
    expect(await h.store.importLocalFiles([], { kind: 'first' })).toBe(2);
    expect(titles(h)).toEqual(['Title x', 'Title y', 'Title a', 'Title b']);
    expect(h.notifier.notices).toContain(strings.library.importedAtStart(2));
  });

  it('first keeps the current pointer on the same song', async () => {
    const h = createHarness();
    seed(h, 'a', 'b');
    h.store.playEntry(entryIdAt(h, 1));
    const before = h.store.getSnapshot().currentEntryId;
    incoming(h, 'x', 'y');
    await h.store.importLocalFiles([], { kind: 'first' });
    expect(h.store.getSnapshot().currentEntryId).toBe(before);
    expect(titles(h)[3]).toBe('Title b');
  });

  it('next inserts the block after the current song', async () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    h.store.playEntry(entryIdAt(h, 1));
    incoming(h, 'x', 'y');
    await h.store.importLocalFiles([], { kind: 'next' });
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title x', 'Title y', 'Title c']);
    expect(h.notifier.notices).toContain(strings.library.importedNext(2));
  });

  it('at i places the files at i..i+n-1 and keeps current when inserting before it', async () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    h.store.playEntry(entryIdAt(h, 2));
    const before = h.store.getSnapshot().currentEntryId;
    incoming(h, 'x', 'y');
    await h.store.importLocalFiles([], { kind: 'at', index: 1 });
    expect(titles(h)).toEqual(['Title a', 'Title x', 'Title y', 'Title b', 'Title c']);
    expect(h.store.getSnapshot().currentEntryId).toBe(before);
    expect(h.notifier.notices).toContain(strings.library.importedAt(2, 2));
  });

  it('at clamps an index beyond the end and below zero', async () => {
    const h = createHarness();
    seed(h, 'a');
    incoming(h, 'x');
    await h.store.importLocalFiles([], { kind: 'at', index: 99 });
    incoming(h, 'y');
    await h.store.importLocalFiles([], { kind: 'at', index: -4 });
    expect(titles(h)).toEqual(['Title y', 'Title a', 'Title x']);
  });

  it.each([
    ['first', { kind: 'first' }],
    ['next', { kind: 'next' }],
    ['at', { kind: 'at', index: 0 }],
  ] as const)('%s on an empty playlist adds the files and selects the first', async (_n, where) => {
    const h = createHarness();
    incoming(h, 'x', 'y');
    await h.store.importLocalFiles([], where);
    expect(titles(h)).toEqual(['Title x', 'Title y']);
    expect(h.store.getSnapshot().currentEntryId).toBe(entryIdAt(h, 0));
  });

  it('does not touch the list when nothing was imported', async () => {
    const h = createHarness();
    seed(h, 'a');
    await h.store.importLocalFiles([], { kind: 'first' });
    expect(titles(h)).toEqual(['Title a']);
    expect(h.notifier.errors).toEqual([strings.library.importNothing]);
  });

  it('move relinks a song to a new position', () => {
    const h = createHarness();
    seed(h, 'a', 'b', 'c');
    h.store.move(2, 0);
    expect(titles(h)).toEqual(['Title c', 'Title a', 'Title b']);
  });
});

describe('PlayerStore Spotify session', () => {
  it('reflects auth and Spotify status, and initializes the player on login', async () => {
    const h = createHarness();
    h.auth.loggedIn = true;
    h.auth.emit('logged-in');
    await settle();
    expect(h.spotify.initCalls).toBe(1);
    expect(h.store.getSnapshot().spotify.auth).toBe('logged-in');
    h.spotify.setStatus('ready');
    expect(h.store.getSnapshot().spotify.status).toBe('ready');
    h.store.logout();
    expect(h.store.getSnapshot().spotify.auth).toBe('logged-out');
  });

  it('start initializes only with a session; reconnect retries', async () => {
    const h = createHarness();
    h.store.start();
    expect(h.spotify.initCalls).toBe(0);
    h.auth.loggedIn = true;
    h.spotify.initError = new Error('boom');
    h.store.start();
    h.store.reconnectSpotify();
    await settle();
    expect(h.spotify.initCalls).toBe(2);
  });

  it('login failures become a toast', async () => {
    const h = createHarness();
    await h.store.login();
    expect(h.auth.loginCalls).toBe(1);
    h.auth.loginError = new Error('no client id');
    await h.store.login();
    expect(h.notifier.errors).toEqual([strings.spotify.loginFailed]);
  });

  it('logout pauses Spotify playback', async () => {
    const h = createHarness();
    h.store.addLast(spotifyTrack('s'));
    h.auth.loggedIn = true;
    h.store.togglePlay();
    await settle();
    h.store.logout();
    await settle();
    expect(h.spotifyOutput.calls).toContain('pause');
  });

  it('shows forbidden after a 403 from the catalog and clears it on success', async () => {
    const h = createHarness();
    h.provider.searchImpl = () => Promise.reject(new SpotifyForbiddenError());
    await expect(
      h.store.provider.search({ text: 'x', types: ['track'], page: 0 }),
    ).rejects.toBeInstanceOf(SpotifyForbiddenError);
    expect(h.store.getSnapshot().spotify.status).toBe('forbidden');
    h.provider.searchImpl = () =>
      Promise.resolve({ tracks: [], artists: [], albums: [], hasMore: false });
    await h.store.provider.search({ text: 'x', types: ['track'], page: 0 });
    expect(h.store.getSnapshot().spotify.status).toBe('disconnected');
  });

  it('forwards album and artist requests', async () => {
    const h = createHarness();
    h.provider.albumImpl = () => Promise.reject(new Error('x'));
    await expect(h.store.provider.getAlbum('a')).rejects.toThrow('x');
    await expect(h.store.provider.getArtist('a')).rejects.toThrow('no artist');
  });
});

describe('PlayerStore persistence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves debounced and restores the same state', async () => {
    const storage = new MemoryStorage();
    const h = createHarness({ storage });
    h.store.addLast(spotifyTrack('s1'));
    h.store.addLast(spotifyTrack('s2'));
    h.store.addLast(makeTrack('l1'));
    h.store.playEntry(entryIdAt(h, 1));
    await vi.advanceTimersByTimeAsync(0);
    h.store.setVolume(0.3);
    h.store.cycleRepeat();
    h.store.toggleShuffle();
    await h.store.createPlaylist('Segunda');
    h.store.addLast(spotifyTrack('s3'));
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const saved = parsePersistedState(raw);
    expect(saved).not.toBeNull();

    const restored = createHarness({ saved });
    const s = restored.store.getSnapshot();
    expect(s.playlists.map((p) => p.name)).toEqual(['Mi lista', 'Segunda']);
    expect(s.activePlaylistName).toBe('Segunda');
    expect(s.songs.map((x) => x.title)).toEqual(['Title s3']);
    expect(s.player.volume).toBe(0.3);
    expect(s.player.repeat).toBe('all');
    expect(s.player.shuffle).toBe(true);

    restored.store.switchPlaylist(restored.store.getSnapshot().playlists[0]?.id ?? '');
    await vi.advanceTimersByTimeAsync(0);
    const first = restored.store.getSnapshot();
    expect(first.songs.map((x) => x.title)).toEqual(['Title s1', 'Title s2', 'Title l1']);
    expect(first.songs[1]?.isCurrent).toBe(true);
  });

  it('restores local files as unavailable and skips them in playback', async () => {
    const storage = new MemoryStorage();
    const h = createHarness({ storage });
    h.store.addLast(makeTrack('l1'));
    h.store.addLast(spotifyTrack('s1'));
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    const saved = parsePersistedState(storage.getItem(STORAGE_KEY));
    const raw = storage.getItem(STORAGE_KEY) ?? '';
    expect(raw).not.toContain('blob:l1');

    const r = createHarness({ saved });
    const songs = r.store.getSnapshot().songs;
    expect(songs.map((s) => s.unavailable)).toEqual([true, false]);

    r.store.playEntry(songs[0]?.entryId ?? '');
    await vi.advanceTimersByTimeAsync(0);
    expect(r.notifier.errors).toEqual([strings.errors.unavailableTrack]);
    expect(r.localOutput.calls).toEqual([]);

    // The engine skips the unavailable entry when it advances through the list.
    r.store.togglePlay();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.store.getSnapshot().songs[1]?.isCurrent).toBe(true);
    expect(r.store.getSnapshot().player.status).toBe('playing');
    expect(r.spotifyOutput.calls).toContain('load:spotify:track:s1@0');
    expect(r.localOutput.calls.some((c) => c.startsWith('load'))).toBe(false);
  });

  it('ignores corrupt storage with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parsePersistedState('{not json')).toBeNull();
    expect(parsePersistedState('{"version":1}')).toBeNull();
    expect(parsePersistedState('{"version":2,"playlists":[]}')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe('PlayerStore selectors helper types', () => {
  it('snapshot is a plain readonly object', () => {
    const h = createHarness();
    const s: PlayerSnapshot = h.store.getSnapshot();
    expect(Object.keys(s)).toContain('totalDurationMs');
  });
});
