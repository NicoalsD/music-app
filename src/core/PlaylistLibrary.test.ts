import { describe, expect, it } from 'vitest';
import { InvalidOperationError, PlaylistNotFoundError } from './errors';
import { DEFAULT_PLAYLIST_NAME, PlaylistLibrary } from './PlaylistLibrary';
import { CounterIds, FakeClock } from './test-utils/fakes';

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
});
