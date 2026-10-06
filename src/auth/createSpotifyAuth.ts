import { systemClock } from '../core/ports';
import { SpotifyAuth, defaultRedirectUri } from './SpotifyAuth';
import { BrowserTokenStore } from './TokenStore';
import type { StorageLike } from './TokenStore';

function safeStorage(read: () => Storage): StorageLike | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/** Wires browser globals and Vite env variables into a SpotifyAuth. */
export function createSpotifyAuth(): SpotifyAuth {
  const env = import.meta.env;
  const redirectUri =
    typeof env.VITE_SPOTIFY_REDIRECT_URI === 'string' && env.VITE_SPOTIFY_REDIRECT_URI !== ''
      ? env.VITE_SPOTIFY_REDIRECT_URI
      : defaultRedirectUri(env.BASE_URL, window.location.origin);
  const memoryFallback = new Map<string, string>();
  const session: StorageLike = safeStorage(() => window.sessionStorage) ?? {
    getItem: (key) => memoryFallback.get(key) ?? null,
    setItem: (key, value) => void memoryFallback.set(key, value),
    removeItem: (key) => void memoryFallback.delete(key),
  };
  return new SpotifyAuth({
    clientId: typeof env.VITE_SPOTIFY_CLIENT_ID === 'string' ? env.VITE_SPOTIFY_CLIENT_ID : '',
    redirectUri,
    fetch: (input, init) => window.fetch(input, init),
    tokenStore: new BrowserTokenStore(safeStorage(() => window.localStorage)),
    sessionStorage: session,
    clock: systemClock,
    navigate: (url) => window.location.assign(url),
    currentUrl: () => new URL(window.location.href),
    replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
  });
}
