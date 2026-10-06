import type { AuthState } from '../../auth/SpotifyAuth';
import { CounterIds, FakeClock, SeededRandom, makeTrack } from '../../core/test-utils/fakes';
import type { Track } from '../../core/Song';
import { PlayerEngine } from '../../player/PlayerEngine';
import type { SpotifyStatus } from '../../player/SpotifyOutput';
import { FakeAudioOutput } from '../../player/test-utils/FakeAudioOutput';
import type { ImportResult } from '../../providers/LocalFileProvider';
import type {
  AlbumDetail,
  ArtistDetail,
  MusicProvider,
  SearchQuery,
  SearchResults,
} from '../../providers/MusicProvider';
import type { StorageLike } from '../../auth/TokenStore';
import { PlayerStore } from '../PlayerStore';
import type { AuthPort, LocalImporter, Notifier, SpotifyPort } from '../PlayerStore';
import { StatePersistence, restoreState } from '../persistence';
import type { PersistedState } from '../persistence';
import { UnavailableGuardOutput } from '../UnavailableGuardOutput';

export { makeTrack };

export function spotifyTrack(id: string, durationMs = 1_000): Track {
  return {
    ...makeTrack(id, durationMs),
    source: 'spotify',
    uri: `spotify:track:${id}`,
    externalUrl: `https://open.spotify.com/track/${id}`,
  };
}

export class FakeNotifier implements Notifier {
  readonly notices: string[] = [];
  readonly errors: string[] = [];
  readonly undos: { message: string; onUndo: () => void; durationMs: number }[] = [];
  notify(message: string): void {
    this.notices.push(message);
  }
  error(message: string): void {
    this.errors.push(message);
  }
  undo(message: string, onUndo: () => void, durationMs: number): void {
    this.undos.push({ message, onUndo, durationMs });
  }
}

export class FakeAuth implements AuthPort {
  loggedIn = false;
  loginCalls = 0;
  loginError: Error | null = null;
  readonly listeners = new Set<(state: AuthState) => void>();
  get isLoggedIn(): boolean {
    return this.loggedIn;
  }
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  login(): Promise<void> {
    this.loginCalls++;
    return this.loginError === null ? Promise.resolve() : Promise.reject(this.loginError);
  }
  logout(): void {
    this.loggedIn = false;
    this.emit('logged-out');
  }
  emit(state: AuthState): void {
    for (const l of [...this.listeners]) l(state);
  }
}

export class FakeSpotify implements SpotifyPort {
  status: SpotifyStatus = 'disconnected';
  initCalls = 0;
  initError: Error | null = null;
  readonly listeners = new Set<(status: SpotifyStatus) => void>();
  getStatus(): SpotifyStatus {
    return this.status;
  }
  onStatusChange(listener: (status: SpotifyStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  init(): Promise<void> {
    this.initCalls++;
    return this.initError === null ? Promise.resolve() : Promise.reject(this.initError);
  }
  setStatus(status: SpotifyStatus): void {
    this.status = status;
    for (const l of [...this.listeners]) l(status);
  }
}

export class FakeLocalImporter implements LocalImporter {
  nextResult: ImportResult = { tracks: [], rejected: [] };
  readonly released: string[] = [];
  importFiles(): Promise<ImportResult> {
    return Promise.resolve(this.nextResult);
  }
  release(track: Track): void {
    this.released.push(track.trackId);
  }
}

export class FakeProvider implements MusicProvider {
  readonly searches: SearchQuery[] = [];
  searchImpl: (query: SearchQuery, signal?: AbortSignal) => Promise<SearchResults> = () =>
    Promise.resolve({ tracks: [], artists: [], albums: [], hasMore: false });
  albumImpl: (id: string, signal?: AbortSignal) => Promise<AlbumDetail> = () =>
    Promise.reject(new Error('no album'));
  artistImpl: (id: string, signal?: AbortSignal) => Promise<ArtistDetail> = () =>
    Promise.reject(new Error('no artist'));
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResults> {
    this.searches.push(query);
    return this.searchImpl(query, signal);
  }
  getAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetail> {
    return this.albumImpl(id, signal);
  }
  getArtist(id: string, signal?: AbortSignal): Promise<ArtistDetail> {
    return this.artistImpl(id, signal);
  }
}

export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export interface Harness {
  readonly store: PlayerStore;
  readonly engine: PlayerEngine;
  readonly spotifyOutput: FakeAudioOutput;
  readonly localOutput: FakeAudioOutput;
  readonly notifier: FakeNotifier;
  readonly auth: FakeAuth;
  readonly spotify: FakeSpotify;
  readonly local: FakeLocalImporter;
  readonly provider: FakeProvider;
  readonly storage: MemoryStorage;
  readonly persistence: StatePersistence;
}

/** A fully wired store over fakes: no network, no audio. */
export function createHarness(
  options: { saved?: PersistedState | null; storage?: MemoryStorage; notifier?: Notifier } = {},
): Harness {
  const storage = options.storage ?? new MemoryStorage();
  const persistence = new StatePersistence(storage);
  const ids = new CounterIds('e');
  const clock = new FakeClock();
  const restored = restoreState(options.saved ?? null, { ids, clock });
  const spotifyOutput = new FakeAudioOutput('spotify');
  const localOutput = new FakeAudioOutput('local');
  const engine = new PlayerEngine({
    library: restored.library,
    outputs: {
      spotify: spotifyOutput,
      local: new UnavailableGuardOutput(localOutput, restored.unavailable),
    },
    random: new SeededRandom(7),
    clock,
    initial: restored.preferences,
  });
  const fakeNotifier = new FakeNotifier();
  const auth = new FakeAuth();
  const spotify = new FakeSpotify();
  const local = new FakeLocalImporter();
  const provider = new FakeProvider();
  const store = new PlayerStore({
    library: restored.library,
    engine,
    provider,
    local,
    auth,
    spotify,
    notifier: options.notifier ?? fakeNotifier,
    unavailable: restored.unavailable,
    persistence,
  });
  return {
    store,
    engine,
    spotifyOutput,
    localOutput,
    notifier: fakeNotifier,
    auth,
    spotify,
    local,
    provider,
    storage,
    persistence,
  };
}
