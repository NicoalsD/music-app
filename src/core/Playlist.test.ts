import { describe, expect, it } from 'vitest';
import { InvalidOperationError, SongNotFoundError, IndexOutOfRangeError } from './errors';
import { Playlist } from './Playlist';
import { Song } from './Song';
import { CounterIds, makeTrack } from './test-utils/fakes';

function makePlaylist(): Playlist {
  return new Playlist({ id: 'p1', name: 'Test', createdAt: 5, ids: new CounterIds('e') });
}

function titles(p: Playlist): string[] {
  return p.songs().map((s) => s.trackId);
}

function filled(...trackIds: string[]): Playlist {
  const p = makePlaylist();
  for (const t of trackIds) p.addLast(makeTrack(t));
  return p;
}

/** Playlist hides its list, so check the links through the public view (order and indexes). */
function expectLinked(p: Playlist): void {
  const songs = p.songs();
  expect(songs).toHaveLength(p.size);
  songs.forEach((song, i) => expect(p.indexOf(song.entryId)).toBe(i));
  if (p.current !== null) expect(songs[p.currentIndex]).toBe(p.current);
}

describe('Playlist', () => {
  describe('basics', () => {
    it('exposes id, name and createdAt', () => {
      const p = makePlaylist();
      expect(p.id).toBe('p1');
      expect(p.name).toBe('Test');
      expect(p.createdAt).toBe(5);
      expect(p.size).toBe(0);
      expect(p.current).toBeNull();
      expect(p.currentIndex).toBe(-1);
    });

    it('trims names and rejects empty ones', () => {
      const p = makePlaylist();
      p.rename('  New  ');
      expect(p.name).toBe('New');
      expect(() => p.rename('   ')).toThrow(InvalidOperationError);
      expect(
        () => new Playlist({ id: 'x', name: '', createdAt: 0, ids: new CounterIds() }),
      ).toThrow(InvalidOperationError);
    });

    it('sums total duration', () => {
      const p = makePlaylist();
      p.addLast(makeTrack('a', 100));
      p.addLast(makeTrack('b', 250));
      expect(p.totalDurationMs).toBe(350);
    });

    it('finds entry indexes', () => {
      const p = filled('a', 'b');
      const second = p.songs()[1];
      expect(p.indexOf(second?.entryId ?? '')).toBe(1);
      expect(p.indexOf('nope')).toBe(-1);
    });
  });

  describe('adding', () => {
    it.each(['addFirst', 'addLast'] as const)(
      '%s on an empty playlist makes the song current',
      (method) => {
        const p = makePlaylist();
        const song = p[method](makeTrack('a'));
        expect(p.current).toBe(song);
        expect(p.currentIndex).toBe(0);
      },
    );

    it('addAt on an empty playlist makes the song current', () => {
      const p = makePlaylist();
      const song = p.addAt(0, makeTrack('a'));
      expect(p.current).toBe(song);
    });

    it('addAt rejects invalid indexes', () => {
      const p = filled('a');
      expect(() => p.addAt(5, makeTrack('b'))).toThrow(IndexOutOfRangeError);
    });

    it('inserting before current keeps current and shifts its index', () => {
      const p = filled('a', 'b');
      p.select(p.songs()[1]?.entryId ?? '');
      const current = p.current;
      expect(p.currentIndex).toBe(1);
      p.addFirst(makeTrack('x'));
      p.addAt(1, makeTrack('y'));
      expect(p.current).toBe(current);
      expect(p.currentIndex).toBe(3);
    });

    it('addNext inserts right after current', () => {
      const p = filled('a', 'b', 'c');
      p.addNext(makeTrack('n'));
      expect(titles(p)).toEqual(['a', 'n', 'b', 'c']);
    });

    it('addNext without current inserts at the start', () => {
      const p = makePlaylist();
      p.addNext(makeTrack('n'));
      expect(titles(p)).toEqual(['n']);
      expect(p.current?.trackId).toBe('n');
    });

    it('addManyLast appends in order', () => {
      const p = filled('a');
      const added = p.addManyLast([makeTrack('b'), makeTrack('c')]);
      expect(added).toHaveLength(2);
      expect(titles(p)).toEqual(['a', 'b', 'c']);
    });

    it('addManyFirst keeps album order', () => {
      const p = filled('a');
      p.addManyFirst([makeTrack('1'), makeTrack('2'), makeTrack('3')]);
      expect(titles(p)).toEqual(['1', '2', '3', 'a']);
      expect(p.current?.trackId).toBe('a');
    });

    it('addManyFirst on an empty playlist makes the first track current', () => {
      const p = makePlaylist();
      p.addManyFirst([makeTrack('1'), makeTrack('2')]);
      expect(titles(p)).toEqual(['1', '2']);
      expect(p.current?.trackId).toBe('1');
    });

    it('addManyAt inserts a block in order and keeps current when inserting before it', () => {
      const p = filled('a', 'b', 'c');
      p.select(p.songs()[1]?.entryId ?? '');
      p.addManyAt(1, [makeTrack('x'), makeTrack('y')]);
      expect(titles(p)).toEqual(['a', 'x', 'y', 'b', 'c']);
      expect(p.current?.trackId).toBe('b');
      expect(p.currentIndex).toBe(3);
      expectLinked(p);
    });

    it('addManyAt accepts both extremes and an empty list', () => {
      const p = filled('a', 'b');
      p.addManyAt(0, [makeTrack('1'), makeTrack('2')]);
      p.addManyAt(4, [makeTrack('3'), makeTrack('4')]);
      p.addManyAt(2, []);
      expect(titles(p)).toEqual(['1', '2', 'a', 'b', '3', '4']);
      expect(p.current?.trackId).toBe('a');
      expectLinked(p);
    });

    it('addManyAt on an empty playlist makes the first track current', () => {
      const p = makePlaylist();
      p.addManyAt(0, [makeTrack('1'), makeTrack('2')]);
      expect(titles(p)).toEqual(['1', '2']);
      expect(p.current?.trackId).toBe('1');
    });

    it('addManyAt rejects indexes outside 0..size without changing the list', () => {
      const p = filled('a');
      expect(() => p.addManyAt(2, [makeTrack('x')])).toThrow(IndexOutOfRangeError);
      expect(() => p.addManyAt(-1, [makeTrack('x')])).toThrow(IndexOutOfRangeError);
      expect(() => p.addManyAt(0.5, [makeTrack('x')])).toThrow(IndexOutOfRangeError);
      expect(titles(p)).toEqual(['a']);
    });

    it('addManyNext inserts the block right after current in order', () => {
      const p = filled('a', 'b', 'c');
      p.select(p.songs()[1]?.entryId ?? '');
      p.addManyNext([makeTrack('x'), makeTrack('y')]);
      expect(titles(p)).toEqual(['a', 'b', 'x', 'y', 'c']);
      expect(p.current?.trackId).toBe('b');
      expectLinked(p);
    });

    it('addManyNext at the tail appends and without current prepends', () => {
      const p = filled('a', 'b');
      p.select(p.songs()[1]?.entryId ?? '');
      p.addManyNext([makeTrack('x')]);
      expect(titles(p)).toEqual(['a', 'b', 'x']);
      const empty = makePlaylist();
      empty.addManyNext([makeTrack('1'), makeTrack('2')]);
      expect(titles(empty)).toEqual(['1', '2']);
      expect(empty.current?.trackId).toBe('1');
    });
  });

  describe('duplicates', () => {
    it('keeps independent entries for the same track', () => {
      const p = makePlaylist();
      const a = p.addLast(makeTrack('same'));
      const b = p.addLast(makeTrack('same'));
      expect(a.trackId).toBe(b.trackId);
      expect(a.entryId).not.toBe(b.entryId);
      p.remove(a.entryId);
      expect(p.songs()).toEqual([b]);
      expect(p.current).toBe(b);
    });
  });

  describe('remove', () => {
    it('removing the current in the middle moves current to next', () => {
      const p = filled('a', 'b', 'c');
      const b = p.select(p.songs()[1]?.entryId ?? '');
      const result = p.remove(b.entryId);
      expect(result.removed).toBe(b);
      expect(result.index).toBe(1);
      expect(result.currentChanged).toBe(true);
      expect(result.newCurrent?.trackId).toBe('c');
      expect(p.current?.trackId).toBe('c');
    });

    it('removing the current head moves current to next', () => {
      const p = filled('a', 'b');
      const result = p.remove(p.current?.entryId ?? '');
      expect(result.newCurrent?.trackId).toBe('b');
    });

    it('removing the current tail moves current to prev', () => {
      const p = filled('a', 'b');
      const b = p.select(p.songs()[1]?.entryId ?? '');
      const result = p.remove(b.entryId);
      expect(result.newCurrent?.trackId).toBe('a');
      expect(p.currentIndex).toBe(0);
    });

    it('removing the only song clears current', () => {
      const p = filled('a');
      const result = p.remove(p.current?.entryId ?? '');
      expect(result.currentChanged).toBe(true);
      expect(result.newCurrent).toBeNull();
      expect(p.current).toBeNull();
      expect(p.size).toBe(0);
    });

    it('removing another song keeps current', () => {
      const p = filled('a', 'b', 'c');
      const current = p.current;
      const result = p.remove(p.songs()[2]?.entryId ?? '');
      expect(result.currentChanged).toBe(false);
      expect(result.newCurrent).toBe(current);
      expect(p.current).toBe(current);
    });

    it('throws SongNotFoundError for unknown entries', () => {
      expect(() => filled('a').remove('nope')).toThrow(SongNotFoundError);
    });
  });

  describe('restore (undo)', () => {
    it('reinserts the exact Song object at its index', () => {
      const p = filled('a', 'b', 'c');
      const b = p.songs()[1] as Song;
      const { index, removed } = p.remove(b.entryId);
      const back = p.restore(removed, index);
      expect(back).toBe(b);
      expect(p.songs()[1]).toBe(b);
    });

    it('clamps the index to 0..size', () => {
      const p = filled('a', 'b');
      const extra = new Song(makeTrack('z'), 'z-entry');
      p.restore(extra, 99);
      expect(titles(p)).toEqual(['a', 'b', 'z']);
      const first = new Song(makeTrack('y'), 'y-entry');
      p.restore(first, -5);
      expect(titles(p)).toEqual(['y', 'a', 'b', 'z']);
    });

    it('restores into an empty playlist and makes it current', () => {
      const p = filled('a');
      const { removed, index } = p.remove(p.current?.entryId ?? '');
      p.restore(removed, index);
      expect(p.current).toBe(removed);
    });
  });

  describe('move and select', () => {
    it('move keeps current pointing at the same song', () => {
      const p = filled('a', 'b', 'c');
      const current = p.current;
      p.move(0, 2);
      expect(titles(p)).toEqual(['b', 'c', 'a']);
      expect(p.current).toBe(current);
      expect(p.currentIndex).toBe(2);
    });

    it('select sets current', () => {
      const p = filled('a', 'b');
      const b = p.songs()[1] as Song;
      expect(p.select(b.entryId)).toBe(b);
      expect(p.current).toBe(b);
    });

    it('select throws SongNotFoundError for unknown entries', () => {
      expect(() => filled('a').select('nope')).toThrow(SongNotFoundError);
    });
  });

  describe('next / previous', () => {
    it('return null on an empty playlist', () => {
      const p = makePlaylist();
      for (const mode of ['off', 'all', 'one'] as const) {
        expect(p.next(mode)).toBeNull();
        expect(p.previous(mode)).toBeNull();
        expect(p.peekNext(mode)).toBeNull();
        expect(p.peekPrevious(mode)).toBeNull();
      }
    });

    it('moves forward and backward through the list', () => {
      const p = filled('a', 'b', 'c');
      expect(p.next('off')?.trackId).toBe('b');
      expect(p.next('off')?.trackId).toBe('c');
      expect(p.previous('off')?.trackId).toBe('b');
      expect(p.currentIndex).toBe(1);
    });

    it('next at the tail with off returns null and keeps current', () => {
      const p = filled('a', 'b');
      p.next('off');
      expect(p.next('off')).toBeNull();
      expect(p.current?.trackId).toBe('b');
    });

    it.each(['all', 'one'] as const)('next at the tail with %s wraps to head', (mode) => {
      const p = filled('a', 'b');
      p.next(mode);
      expect(p.next(mode)?.trackId).toBe('a');
      expect(p.current?.trackId).toBe('a');
    });

    it('previous at the head with off stays at head', () => {
      const p = filled('a', 'b');
      expect(p.previous('off')?.trackId).toBe('a');
      expect(p.current?.trackId).toBe('a');
    });

    it.each(['all', 'one'] as const)('previous at the head with %s wraps to tail', (mode) => {
      const p = filled('a', 'b');
      expect(p.previous(mode)?.trackId).toBe('b');
      expect(p.current?.trackId).toBe('b');
    });

    it('peek methods do not move current or bump version', () => {
      const p = filled('a', 'b');
      const version = p.version;
      expect(p.peekNext('off')?.trackId).toBe('b');
      expect(p.peekPrevious('off')?.trackId).toBe('a');
      expect(p.peekNext('all')?.trackId).toBe('b');
      expect(p.peekPrevious('all')?.trackId).toBe('b');
      expect(p.current?.trackId).toBe('a');
      expect(p.version).toBe(version);
    });

    it('peekNext wraps or ends at the tail', () => {
      const p = filled('a');
      expect(p.peekNext('off')).toBeNull();
      expect(p.peekNext('all')?.trackId).toBe('a');
    });

    it('a single-song list with off: previous stays, next ends', () => {
      const p = filled('a');
      expect(p.previous('off')?.trackId).toBe('a');
      expect(p.next('off')).toBeNull();
    });
  });

  describe('version', () => {
    it('increments on mutations only', () => {
      const p = makePlaylist();
      let v = p.version;
      const bumps = (fn: () => void): void => {
        fn();
        expect(p.version).toBeGreaterThan(v);
        v = p.version;
      };
      bumps(() => p.addLast(makeTrack('a')));
      bumps(() => p.addLast(makeTrack('b')));
      bumps(() => p.addFirst(makeTrack('c')));
      bumps(() => p.move(0, 1));
      bumps(() => p.select(p.songs()[2]?.entryId ?? ''));
      bumps(() => p.previous('off'));
      bumps(() => p.next('off'));
      bumps(() => p.rename('Other'));
      bumps(() => p.remove(p.songs()[0]?.entryId ?? ''));

      v = p.version;
      p.songs();
      void p.current;
      void p.currentIndex;
      void p.totalDurationMs;
      p.peekNext('all');
      p.indexOf('x');
      expect(p.version).toBe(v);
      // Selecting the already-current song is not a mutation.
      p.select(p.current?.entryId ?? '');
      expect(p.version).toBe(v);
    });

    it('does not change when a failing operation throws', () => {
      const p = filled('a');
      const v = p.version;
      expect(() => p.remove('nope')).toThrow(SongNotFoundError);
      expect(() => p.select('nope')).toThrow(SongNotFoundError);
      expect(p.version).toBe(v);
    });
  });
});
