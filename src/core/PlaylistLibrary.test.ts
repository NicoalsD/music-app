import { describe, expect, it } from 'vitest';
import { InvalidOperationError, PlaylistNotFoundError } from './errors';
import { DEFAULT_PLAYLIST_NAME, PlaylistLibrary } from './PlaylistLibrary';
import { CounterIds, FakeClock, makeTrack } from './test-utils/fakes';

function make(createDefault?: boolean): PlaylistLibrary {
  const deps = { ids: new CounterIds('p'), clock: new FakeClock(777) };
  return new PlaylistLibrary(createDefault === undefined ? deps : { ...deps, createDefault });
}

describe('PlaylistLibrary', () => {
  it('creates a default playlist and makes it active', () => {
    const lib = make();
    expect(lib.size).toBe(1);
    expect(lib.active.name).toBe(DEFAULT_PLAYLIST_NAME);
    expect(lib.active.createdAt).toBe(777);
  });

  it('can start empty, and active then throws', () => {
    const lib = make(false);
    expect(lib.size).toBe(0);
    expect(() => lib.active).toThrow(InvalidOperationError);
    const created = lib.create('First');
    expect(lib.active).toBe(created);
  });

  it('create appends without changing the active playlist', () => {
    const lib = make();
    const first = lib.active;
    const second = lib.create('Two');
    expect(lib.all()).toEqual([first, second]);
    expect(lib.active).toBe(first);
    expect(second.id).not.toBe(first.id);
  });

  it('get returns playlists or throws PlaylistNotFoundError', () => {
    const lib = make();
    expect(lib.get(lib.active.id)).toBe(lib.active);
    expect(() => lib.get('nope')).toThrow(PlaylistNotFoundError);
  });

  it('rename updates the playlist and validates the name', () => {
    const lib = make();
    lib.rename(lib.active.id, ' Rock ');
    expect(lib.active.name).toBe('Rock');
    expect(() => lib.rename(lib.active.id, ' ')).toThrow(InvalidOperationError);
    expect(() => lib.rename('nope', 'x')).toThrow(PlaylistNotFoundError);
  });

  it('refuses to remove the only playlist', () => {
    const lib = make();
    expect(() => lib.remove(lib.active.id)).toThrow(InvalidOperationError);
    expect(() => lib.remove('nope')).toThrow(PlaylistNotFoundError);
    expect(lib.size).toBe(1);
  });

  it('removing a non-active playlist keeps the active one', () => {
    const lib = make();
    const first = lib.active;
    const second = lib.create('Two');
    lib.remove(second.id);
    expect(lib.active).toBe(first);
    expect(lib.all()).toEqual([first]);
  });

  it('removing the active playlist moves active to next, else prev', () => {
    const lib = make();
    const a = lib.active;
    const b = lib.create('B');
    const c = lib.create('C');
    lib.setActive(b.id);
    lib.remove(b.id);
    expect(lib.active).toBe(c);
    lib.remove(c.id);
    expect(lib.active).toBe(a);
  });

  it('setActive switches and rejects unknown ids', () => {
    const lib = make();
    const b = lib.create('B');
    lib.setActive(b.id);
    expect(lib.active).toBe(b);
    expect(() => lib.setActive('nope')).toThrow(PlaylistNotFoundError);
  });

  it('move reorders playlists', () => {
    const lib = make();
    const a = lib.active;
    const b = lib.create('B');
    const c = lib.create('C');
    lib.move(0, 2);
    expect(lib.all()).toEqual([b, c, a]);
    expect(lib.active).toBe(a);
  });

  it('version changes on mutations only', () => {
    const lib = make();
    const b = lib.create('B');
    let v = lib.version;
    const bumps = (fn: () => void): void => {
      fn();
      expect(lib.version).toBeGreaterThan(v);
      v = lib.version;
    };
    bumps(() => lib.create('C'));
    bumps(() => lib.rename(b.id, 'BB'));
    bumps(() => lib.setActive(b.id));
    bumps(() => lib.move(0, 1));
    bumps(() => lib.remove(b.id));
    lib.all();
    void lib.active;
    lib.setActive(lib.active.id);
    expect(lib.version).toBe(v);
  });

  describe('favorites', () => {
    it('has no favorites playlist until the first like', () => {
      const lib = make();
      expect(lib.favorites).toBeNull();
      expect(lib.isFavorite('a')).toBe(false);
      expect(lib.favoriteTrackIds()).toEqual(new Set());
    });

    it('like creates the favorites playlist pinned first, without changing the active one', () => {
      const lib = make();
      const mine = lib.active;
      expect(lib.like(makeTrack('a'), 'Favs')).toBe(true);
      const favorites = lib.favorites;
      expect(favorites?.name).toBe('Favs');
      expect(favorites?.kind).toBe('favorites');
      expect(lib.all()[0]).toBe(favorites);
      expect(lib.active).toBe(mine);
      expect(mine.kind).toBe('regular');
      expect(lib.isFavorite('a')).toBe(true);
    });

    it('appends later likes in order and ignores a song that is already liked', () => {
      const lib = make();
      lib.like(makeTrack('a'), 'Favs');
      lib.like(makeTrack('b'), 'Favs');
      expect(lib.like(makeTrack('a'), 'Favs')).toBe(false);
      expect(lib.favorites?.songs().map((s) => s.trackId)).toEqual(['a', 'b']);
      expect(lib.size).toBe(2);
      expect(lib.favoriteTrackIds()).toEqual(new Set(['a', 'b']));
    });

    it('unlike removes every entry of the track and reports whether it was liked', () => {
      const lib = make();
      lib.like(makeTrack('a'), 'Favs');
      lib.like(makeTrack('b'), 'Favs');
      // A duplicate added by hand (e.g. dragged into the favorites list) goes too.
      lib.favorites?.addLast(makeTrack('a'));
      expect(lib.unlike('a')).toBe(true);
      expect(lib.favorites?.songs().map((s) => s.trackId)).toEqual(['b']);
      expect(lib.isFavorite('a')).toBe(false);
      expect(lib.unlike('a')).toBe(false);
      expect(make().unlike('a')).toBe(false);
    });

    it('a song removed from the favorites list is no longer a favorite', () => {
      const lib = make();
      lib.like(makeTrack('a'), 'Favs');
      const entry = lib.favorites?.songs()[0];
      lib.favorites?.remove(entry?.entryId ?? '');
      expect(lib.isFavorite('a')).toBe(false);
    });

    it('cannot rename or remove the favorites playlist', () => {
      const lib = make();
      lib.like(makeTrack('a'), 'Favs');
      const id = lib.favorites?.id ?? '';
      expect(() => lib.rename(id, 'Other')).toThrow(InvalidOperationError);
      expect(() => lib.remove(id)).toThrow(InvalidOperationError);
    });

    it('can become the active playlist, and the last regular playlist can then be removed', () => {
      const lib = make();
      const mine = lib.active;
      lib.like(makeTrack('a'), 'Favs');
      const favorites = lib.favorites;
      if (favorites === null) throw new Error('favorites missing');
      lib.setActive(favorites.id);
      lib.remove(mine.id);
      expect(lib.all()).toEqual([favorites]);
      expect(lib.active).toBe(favorites);
    });

    it('restores a favorites playlist through create with its kind', () => {
      const lib = make(false);
      const restored = lib.create('Favs', 'favorites');
      lib.create('Mine');
      expect(lib.favorites).toBe(restored);
      expect(() => lib.create('Again', 'favorites')).toThrow(InvalidOperationError);
    });

    it('bumps the version when a like or unlike changes the favorites', () => {
      const lib = make();
      const v0 = lib.version;
      lib.like(makeTrack('a'), 'Favs');
      const v1 = lib.version;
      expect(v1).toBeGreaterThan(v0);
      lib.like(makeTrack('a'), 'Favs');
      expect(lib.version).toBe(v1);
      lib.unlike('a');
      expect(lib.version).toBeGreaterThan(v1);
    });
  });
});
