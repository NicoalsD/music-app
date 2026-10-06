import { AuthError } from '../core/errors';
import type { Clock } from '../core/ports';
import {
  codeChallengeS256,
  cryptoRandomBytes,
  generateCodeVerifier,
  generateRandomString,
} from './pkce';
import type { RandomBytes } from './pkce';
import type { StorageLike, TokenStore } from './TokenStore';

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');
export const VERIFIER_STORAGE_KEY = 'music-app:v1:spotify-pkce-verifier';
export const STATE_STORAGE_KEY = 'music-app:v1:spotify-pkce-state';
/** Refresh when the access token has less than this much time left. */
export const REFRESH_MARGIN_MS = 60_000;

export type AuthState = 'logged-in' | 'logged-out';
export type AuthListener = (state: AuthState) => void;

export interface SpotifyAuthDeps {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly fetch: typeof fetch;
  readonly tokenStore: TokenStore;
  readonly sessionStorage: StorageLike;
  readonly clock: Clock;
  /** Full-page navigation (window.location.assign). */
  readonly navigate: (url: string) => void;
  readonly currentUrl: () => URL;
  /** Replaces the address bar without reloading (history.replaceState). */
  readonly replaceUrl: (url: string) => void;
  readonly randomBytes?: RandomBytes;
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const refresh = record['refresh_token'];
  return (
    typeof record['access_token'] === 'string' &&
    record['access_token'] !== '' &&
    typeof record['expires_in'] === 'number' &&
    Number.isFinite(record['expires_in']) &&
    (refresh === undefined || typeof refresh === 'string')
  );
}

/** `new URL(baseUrl, origin).href`: the redirect URI for the current deployment. */
export function defaultRedirectUri(baseUrl: string, origin: string): string {
  return new URL(baseUrl, origin).href;
}

/** OAuth 2.0 Authorization Code + PKCE, no backend and no client secret. */
export class SpotifyAuth {
  readonly #deps: SpotifyAuthDeps;
  readonly #listeners = new Set<AuthListener>();
  #refreshing: Promise<string | null> | null = null;
  /** Bumped by logout so an in-flight refresh cannot resurrect a dead session. */
  #epoch = 0;

  constructor(deps: SpotifyAuthDeps) {
    this.#deps = deps;
  }

  get isLoggedIn(): boolean {
    return this.#deps.tokenStore.read() !== null;
  }

  subscribe(listener: AuthListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Starts the authorization redirect. */
  async login(): Promise<void> {
    const { clientId, redirectUri, sessionStorage, navigate } = this.#deps;
    if (clientId === '') throw new AuthError('Missing Spotify client id (VITE_SPOTIFY_CLIENT_ID)');
    const random = this.#deps.randomBytes ?? cryptoRandomBytes;
    const verifier = generateCodeVerifier(random);
    const state = generateRandomString(random, 32);
    const challenge = await codeChallengeS256(verifier);
    try {
      sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
      sessionStorage.setItem(STATE_STORAGE_KEY, state);
    } catch {
      throw new AuthError('Session storage is unavailable, cannot start the login');
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SPOTIFY_SCOPES,
    });
    navigate(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
  }

  /**
   * Completes the login if the current URL is an authorization callback.
   * Returns true when a login was completed, false when there was nothing to do.
   */
  async handleRedirect(): Promise<boolean> {
    const url = this.#deps.currentUrl();
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (code === null && error === null) return false;
    const returnedState = url.searchParams.get('state');

    const expectedState = this.#sessionGet(STATE_STORAGE_KEY);
    const verifier = this.#sessionGet(VERIFIER_STORAGE_KEY);
    this.#sessionRemove(STATE_STORAGE_KEY);
    this.#sessionRemove(VERIFIER_STORAGE_KEY);
    this.#cleanUrl(url);

    if (expectedState === null || returnedState === null || returnedState !== expectedState) {
      throw new AuthError('OAuth state mismatch, the login response was rejected');
    }
    if (error !== null) throw new AuthError(`Spotify authorization failed: ${error}`);
    if (code === null || verifier === null)
      throw new AuthError('Missing authorization code or code verifier');

    const response = await this.#postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.#deps.redirectUri,
      client_id: this.#deps.clientId,
      code_verifier: verifier,
    });
    if (!response.ok) throw new AuthError(`Token exchange failed with status ${response.status}`);
    const tokens = await this.#parseTokens(response);
    this.#deps.tokenStore.save({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiresAt: this.#deps.clock.now() + tokens.expires_in * 1000,
    });
    this.#emit('logged-in');
    return true;
  }

  /** Returns a valid access token (refreshing if needed), or null when logged out. */
  async getAccessToken(): Promise<string | null> {
    const tokens = this.#deps.tokenStore.read();
    if (tokens === null) return null;
    if (
      tokens.accessToken !== null &&
      tokens.expiresAt - this.#deps.clock.now() > REFRESH_MARGIN_MS
    ) {
      return tokens.accessToken;
    }
    return this.#refresh();
  }

  /** Refreshes regardless of expiry (used after a 401). */
  async forceRefresh(): Promise<string | null> {
    if (this.#deps.tokenStore.read() === null) return null;
    return this.#refresh();
  }

  logout(): void {
    this.#epoch += 1;
    this.#refreshing = null;
    const wasLoggedIn = this.isLoggedIn;
    this.#deps.tokenStore.clear();
    if (wasLoggedIn) this.#emit('logged-out');
  }

  #refresh(): Promise<string | null> {
    if (this.#refreshing === null) {
      const promise = this.#doRefresh().finally(() => {
        if (this.#refreshing === promise) this.#refreshing = null;
      });
      this.#refreshing = promise;
    }
    return this.#refreshing;
  }

  async #doRefresh(): Promise<string | null> {
    const current = this.#deps.tokenStore.read();
    if (current === null || current.refreshToken === '') {
      this.logout();
      return null;
    }
    const epoch = this.#epoch;
    let response: Response;
    try {
      response = await this.#postToken({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
        client_id: this.#deps.clientId,
      });
    } catch {
      return null; // Network failure: keep the session, the caller may retry later.
    }
    if (epoch !== this.#epoch) return null;
    if (!response.ok) {
      // A rejected refresh token is permanent; a 5xx is transient.
      if (response.status >= 400 && response.status < 500) this.logout();
      return null;
    }
    let tokens: TokenResponse;
    try {
      tokens = await this.#parseTokens(response);
    } catch {
      this.logout();
      return null;
    }
    if (epoch !== this.#epoch) return null;
    this.#deps.tokenStore.save({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? current.refreshToken,
      expiresAt: this.#deps.clock.now() + tokens.expires_in * 1000,
    });
    return tokens.access_token;
  }

  #postToken(form: Record<string, string>): Promise<Response> {
    return this.#deps.fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
  }

  async #parseTokens(response: Response): Promise<TokenResponse> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AuthError('Token endpoint returned invalid JSON');
    }
    if (!isTokenResponse(body))
      throw new AuthError('Token endpoint returned an unexpected payload');
    return body;
  }

  #cleanUrl(url: URL): void {
    const cleaned = new URL(url.href);
    for (const key of ['code', 'state', 'error', 'error_description'])
      cleaned.searchParams.delete(key);
    this.#deps.replaceUrl(cleaned.href);
  }

  #sessionGet(key: string): string | null {
    try {
      return this.#deps.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  #sessionRemove(key: string): void {
    try {
      this.#deps.sessionStorage.removeItem(key);
    } catch {
      // Ignore: nothing else to clean.
    }
  }

  #emit(state: AuthState): void {
    for (const listener of [...this.#listeners]) listener(state);
  }
}
