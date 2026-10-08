import { CounterIds, FakeClock, makeTrack } from '../core/test-utils/fakes';
import { PlaylistLibrary } from '../core/PlaylistLibrary';
import {
  DEFAULT_PREFERENCES,
  PERSIST_DEBOUNCE_MS,
  STORAGE_KEY,
  StatePersistence,
  UnavailableRegistry,
  isPersistedState,
  parsePersistedState,
  restoreState,
  serializeState,
} from './persistence';
import { MemoryStorage } from './test-utils/harness';

const deps = { ids: new CounterIds('p'), clock: new FakeClock() };

function sampleLibrary(): PlaylistLibrary {
  const library = new PlaylistLibrary(deps);
  library.active.addLast({ ...makeTrack('s'), source: 'spotify', uri: 'spotify:track:s' });
  library.active.addLast({ ...makeTrack('l'), artwork: { small: 'blob:art' } });
  library.create('Otra');
  return library;
}

describe('serializeState', () => {
  it('drops blob URLs and artwork of local files and flags them unavailable', () => {
    const state = serializeState(sampleLibrary(), DEFAULT_PREFERENCES);
    const entries = state.playlists[0]?.entries ?? [];
    expect(entries.map((e) => e.unavailable)).toEqual([false, true]);
    expect(entries[1]?.track.uri).toBe('');
    expect(entries[1]?.track.artwork).toEqual({});
    expect(entries[0]?.track.uri).toBe('spotify:track:s');
    expect(isPersistedState(JSON.parse(JSON.stringify(state)))).toBe(true);
  });
});

describe('isPersistedState', () => {
  const valid = () =>
    JSON.parse(JSON.stringify(serializeState(sampleLibrary(), DEFAULT_PREFERENCES))) as Record<
      string,
      unknown
    >;

  it('rejects structural problems', () => {
    expect(isPersistedState(null)).toBe(false);
    expect(isPersistedState([])).toBe(false);
    expect(isPersistedState({ ...valid(), playlists: [] })).toBe(false);
    expect(isPersistedState({ ...valid(), activePlaylistId: 'nope' })).toBe(false);
    expect(isPersistedState({ ...valid(), volume: 'loud' })).toBe(false);
    expect(isPersistedState({ ...valid(), repeat: 'sometimes' })).toBe(false);
    expect(isPersistedState({ ...valid(), muted: 1 })).toBe(false);
    expect(isPersistedState({ ...valid(), shuffle: null })).toBe(false);
  });

  it('rejects malformed playlists, entries and tracks', () => {
    const base = valid();
    const playlists = base['playlists'] as Record<string, unknown>[];
    const first = playlists[0] ?? {};
    const entries = (first['entries'] as Record<string, unknown>[]) ?? [];
    const entry = entries[0] ?? {};
    const track = (entry['track'] as Record<string, unknown>) ?? {};
    const withPlaylist = (patch: Record<string, unknown>) => ({
      ...base,
      playlists: [{ ...first, ...patch }],
    });
    const withTrack = (patch: Record<string, unknown>) =>
      withPlaylist({ entries: [{ ...entry, track: { ...track, ...patch } }] });

    expect(isPersistedState(withPlaylist({ name: '  ' }))).toBe(false);
    expect(isPersistedState(withPlaylist({ kind: 'smart' }))).toBe(false);
    expect(
      isPersistedState({
        ...base,
        playlists: [
          { ...first, kind: 'favorites' },
          { ...first, id: 'other', kind: 'favorites' },
        ],
      }),
    ).toBe(false);
    expect(isPersistedState(withPlaylist({ entries: 'x' }))).toBe(false);
    expect(isPersistedState(withPlaylist({ currentEntryId: 4 }))).toBe(false);
    expect(isPersistedState(withPlaylist({ entries: [{ ...entry, unavailable: 'no' }] }))).toBe(
      false,
    );
    expect(isPersistedState(withTrack({ source: 'tidal' }))).toBe(false);
    expect(isPersistedState(withTrack({ artists: [1] }))).toBe(false);
    expect(isPersistedState(withTrack({ album: { id: 3, name: 'x' } }))).toBe(false);
    expect(isPersistedState(withTrack({ durationMs: Number.NaN }))).toBe(false);
    expect(isPersistedState(withTrack({ artwork: { small: 4 } }))).toBe(false);
    expect(isPersistedState(withTrack({ artwork: 'x' }))).toBe(false);
    expect(isPersistedState(withTrack({ explicit: 'no' }))).toBe(false);
    expect(isPersistedState(withTrack({ externalUrl: 4 }))).toBe(false);
  });
});

describe('restoreState', () => {
  it('creates a default library when there is nothing saved', () => {
    const restored = restoreState(null, deps);
    expect(restored.library.all().map((p) => p.name)).toEqual(['Mi lista']);
    expect(restored.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps entry ids, current entry, active playlist and clamps volume', () => {
    const library = sampleLibrary();
    const second = library.all()[1];
    if (second === undefined) throw new Error('expected a second playlist');
    library.setActive(second.id);
    const first = library.all()[0];
    const entryId = first?.songs()[1]?.entryId ?? '';
    first?.select(entryId);
    const state = parsePersistedState(
      JSON.stringify({
        ...serializeState(library, { ...DEFAULT_PREFERENCES, volume: 0.5 }),
        volume: 7,
      }),
    );
    const restored = restoreState(state, deps);
    expect(restored.library.active.name).toBe('Otra');
    expect(restored.preferences.volume).toBe(1);
    const restoredFirst = restored.library.all()[0];
    expect(restoredFirst?.current?.entryId).toBe(entryId);
    expect(restored.unavailable.has('l')).toBe(true);
    expect(restored.unavailable.has('s')).toBe(false);
  });
});

describe('favorites persistence', () => {
  it('keeps the favorites playlist, its kind and its place through a reload', () => {
    const library = sampleLibrary();
    library.like({ ...makeTrack('f'), source: 'spotify', uri: 'spotify:track:f' }, 'Favoritos');
    const state = parsePersistedState(JSON.stringify(serializeState(library, DEFAULT_PREFERENCES)));
    expect(state?.playlists[0]?.kind).toBe('favorites');
    expect(state?.playlists[1]?.kind).toBe('regular');
    const restored = restoreState(state, deps).library;
    expect(restored.favorites?.name).toBe('Favoritos');
    expect(restored.all()[0]).toBe(restored.favorites);
    expect(restored.isFavorite('f')).toBe(true);
  });

  it('reads data saved before favorites existed (no kind) as regular playlists', () => {
    const saved = JSON.parse(
      JSON.stringify(serializeState(sampleLibrary(), DEFAULT_PREFERENCES)),
    ) as { playlists: Record<string, unknown>[] };
    for (const playlist of saved.playlists) delete playlist['kind'];
    const state = parsePersistedState(JSON.stringify(saved));
    expect(state).not.toBeNull();
    const restored = restoreState(state, deps).library;
    expect(restored.favorites).toBeNull();
    expect(restored.all().map((p) => p.kind)).toEqual(['regular', 'regular']);
  });
});

describe('UnavailableRegistry', () => {
  it('bumps its version only on real changes', () => {
    const registry = new UnavailableRegistry();
    registry.add('a');
    registry.add('a');
    expect(registry.version).toBe(1);
    registry.delete('missing');
    expect(registry.version).toBe(1);
    registry.delete('a');
    expect(registry.version).toBe(2);
  });
});

describe('StatePersistence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const produce = () => serializeState(sampleLibrary(), DEFAULT_PREFERENCES);

  it('debounces and keeps only the latest producer', () => {
    const storage = new MemoryStorage();
    const persistence = new StatePersistence(storage);
    const first = vi.fn(produce);
    const second = vi.fn(produce);
    persistence.schedule(first);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1);
    persistence.schedule(second);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(persistence.load()).not.toBeNull();
  });

  it('flush writes immediately and is a no-op with nothing pending', () => {
    const storage = new MemoryStorage();
    const persistence = new StatePersistence(storage);
    persistence.flush();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    persistence.schedule(produce);
    persistence.flush();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('survives a throwing storage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    };
    const persistence = new StatePersistence(broken);
    expect(persistence.load()).toBeNull();
    persistence.schedule(produce);
    persistence.flush();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('does nothing without storage', () => {
    const persistence = new StatePersistence(null);
    expect(persistence.load()).toBeNull();
    persistence.schedule(produce);
    persistence.flush();
  });

  it('returns null for an empty key', () => {
    expect(new StatePersistence(new MemoryStorage()).load()).toBeNull();
  });
});
