import { createSpotifyAuth } from '../auth';
import { mathRandom, systemClock, uuidGenerator } from '../core';
import {
  BrowserMediaSession,
  Html5AudioOutput,
  PlayerEngine,
  SpotifyOutput,
  browserSleep,
  browserSpotifyTimers,
  loadSpotifySdk,
} from '../player';
import {
  LocalFileProvider,
  LrcLibLyricsProvider,
  SpotifyApiClient,
  SpotifyPersonalFeed,
  SpotifyProvider,
  parseMetadata,
} from '../providers';
import type { LyricsProvider, PersonalFeedProvider } from '../providers';
import { PlayerStore } from '../state/PlayerStore';
import type { Notifier } from '../state/PlayerStore';
import { StatePersistence, restoreState } from '../state/persistence';
import { UnavailableGuardOutput } from '../state/UnavailableGuardOutput';
import type { StorageLike } from '../auth/TokenStore';
import { strings } from '../ui/i18n/es';
import { sonnerNotifier } from './sonnerNotifier';

export interface AppRuntime {
  readonly store: PlayerStore;
  readonly lyricsProvider: LyricsProvider;
  readonly feedProvider: PersonalFeedProvider;
  /** Completes a pending Spotify redirect and connects the player when logged in. */
  start(): Promise<void>;
  dispose(): void;
}

function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Composition root: builds every collaborator once and hands the store to React. */
export function createApp(notifier: Notifier = sonnerNotifier): AppRuntime {
  const ids = uuidGenerator;
  const clock = systemClock;
  const persistence = new StatePersistence(safeLocalStorage());
  const restored = restoreState(persistence.load(), { ids, clock });

  const auth = createSpotifyAuth();
  const fetcher: typeof fetch = (input, init) => window.fetch(input, init);
  const apiClient = new SpotifyApiClient({ auth, fetch: fetcher });
  const provider = new SpotifyProvider(apiClient);
  const feedProvider = new SpotifyPersonalFeed(apiClient);

  const probe = new Audio();
  const local = new LocalFileProvider({
    parseMetadata,
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    canPlayType: (mimeType) => probe.canPlayType(mimeType),
    ids,
  });

  const spotifyOutput = new SpotifyOutput({
    tokens: auth,
    fetch: fetcher,
    loadSdk: loadSpotifySdk,
    clock,
    timers: browserSpotifyTimers,
    sleep: browserSleep,
    initialVolume: restored.preferences.muted ? 0 : restored.preferences.volume,
  });
  const localOutput = new UnavailableGuardOutput(
    new Html5AudioOutput(new Audio()),
    restored.unavailable,
  );

  const engine = new PlayerEngine({
    library: restored.library,
    outputs: { spotify: spotifyOutput, local: localOutput },
    random: mathRandom,
    clock,
    mediaSession: new BrowserMediaSession(),
    initial: restored.preferences,
  });

  const store = new PlayerStore({
    library: restored.library,
    engine,
    provider,
    local,
    auth,
    spotify: spotifyOutput,
    notifier,
    unavailable: restored.unavailable,
    persistence,
  });

  const flush = (): void => persistence.flush();
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);

  const lyricsProvider = new LrcLibLyricsProvider({ fetch: fetcher });

  return {
    store,
    lyricsProvider,
    feedProvider,
    async start() {
      try {
        await auth.handleRedirect();
      } catch {
        notifier.error(strings.errors.authFailed);
      }
      store.start();
    },
    dispose() {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      store.dispose();
      engine.dispose();
      spotifyOutput.dispose();
      localOutput.dispose();
    },
  };
}
