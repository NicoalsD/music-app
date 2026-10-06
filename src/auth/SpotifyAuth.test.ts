import { AuthError } from '../core/errors';
import { FakeFetch, jsonResponse } from '../test/httpFakes';
import {
  SPOTIFY_SCOPES,
  STATE_STORAGE_KEY,
  SpotifyAuth,
  VERIFIER_STORAGE_KEY,
  defaultRedirectUri,
} from './SpotifyAuth';
import type { AuthState, SpotifyAuthDeps } from './SpotifyAuth';
import { BrowserTokenStore } from './TokenStore';
import type { StorageLike } from './TokenStore';

class MemoryStorage implements StorageLike {
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

const REDIRECT = 'http://127.0.0.1:5173/';
const tokenBody = (extra: Record<string, unknown> = {}) => ({
  access_token: 'access-1',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'refresh-1',
  ...extra,
});

interface Harness {
  auth: SpotifyAuth;
  http: FakeFetch;
  session: MemoryStorage;
  local: MemoryStorage;
  navigated: string[];
  replaced: string[];
  time: { now: number };
  states: AuthState[];
}

function setup(
  options: { url?: string; responders?: ConstructorParameters<typeof FakeFetch> } = {},
): Harness {
  const http = new FakeFetch(...(options.responders ?? []));
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const navigated: string[] = [];
  const replaced: string[] = [];
  const time = { now: 1_000_000 };
  const deps: SpotifyAuthDeps = {
    clientId: 'client-123',
    redirectUri: REDIRECT,
    fetch: http.fetch,
    tokenStore: new BrowserTokenStore(local),
    sessionStorage: session,
    clock: { now: () => time.now },
    navigate: (url) => navigated.push(url),
    currentUrl: () => new URL(options.url ?? REDIRECT),
    replaceUrl: (url) => replaced.push(url),
  };
  const auth = new SpotifyAuth(deps);
  const states: AuthState[] = [];
  auth.subscribe((state) => states.push(state));
  return { auth, http, session, local, navigated, replaced, time, states };
}

function formOf(call: { init: RequestInit }): URLSearchParams {
  return new URLSearchParams(String(call.init.body));
}

async function loggedIn(extra: Partial<Parameters<typeof setup>[0]> = {}): Promise<Harness> {
  const h = setup({ url: `${REDIRECT}?code=abc&state=s1`, ...extra });
  h.session.setItem(STATE_STORAGE_KEY, 's1');
  h.session.setItem(VERIFIER_STORAGE_KEY, 'verifier');
  await h.auth.handleRedirect();
  return h;
}

describe('defaultRedirectUri', () => {
  it('resolves the base url against the origin', () => {
    expect(defaultRedirectUri('/', 'http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/');
    expect(defaultRedirectUri('/music-app/', 'https://nicoalsd.github.io')).toBe(
      'https://nicoalsd.github.io/music-app/',
    );
  });
});

describe('SpotifyAuth.login', () => {
  it('navigates to the authorize url with PKCE parameters and stores verifier and state', async () => {
    const h = setup();
    await h.auth.login();
    const url = new URL(h.navigated[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.spotify.com/authorize');
    const p = url.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe('client-123');
    expect(p.get('redirect_uri')).toBe(REDIRECT);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('scope')).toBe(SPOTIFY_SCOPES);
    expect(p.get('state')).toBe(h.session.getItem(STATE_STORAGE_KEY));
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(h.session.getItem(VERIFIER_STORAGE_KEY)).toHaveLength(64);
  });

  it('refuses to start without a client id', async () => {
    const h = setup();
    const auth = new SpotifyAuth({
      clientId: '',
      redirectUri: REDIRECT,
      fetch: h.http.fetch,
      tokenStore: new BrowserTokenStore(null),
      sessionStorage: h.session,
      clock: { now: () => 0 },
      navigate: () => undefined,
      currentUrl: () => new URL(REDIRECT),
      replaceUrl: () => undefined,
    });
    await expect(auth.login()).rejects.toBeInstanceOf(AuthError);
  });

  it('fails with AuthError when session storage throws', async () => {
    const h = setup();
    const broken = new SpotifyAuth({
      clientId: 'c',
      redirectUri: REDIRECT,
      fetch: h.http.fetch,
      tokenStore: new BrowserTokenStore(null),
      sessionStorage: {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => {
          throw new Error('blocked');
        },
      },
      clock: { now: () => 0 },
      navigate: (url) => h.navigated.push(url),
      currentUrl: () => new URL(REDIRECT),
      replaceUrl: () => undefined,
    });
    await expect(broken.login()).rejects.toBeInstanceOf(AuthError);
    expect(h.navigated).toHaveLength(0);
  });
});

describe('SpotifyAuth.handleRedirect', () => {
  it('returns false when the url is not a callback', async () => {
    const h = setup();
    await expect(h.auth.handleRedirect()).resolves.toBe(false);
    expect(h.replaced).toHaveLength(0);
  });

  it('exchanges the code with the exact form body and cleans the url', async () => {
    const h = setup({
      url: `${REDIRECT}?code=the-code&state=s1&keep=1`,
      responders: [jsonResponse(tokenBody())],
    });
    h.session.setItem(STATE_STORAGE_KEY, 's1');
    h.session.setItem(VERIFIER_STORAGE_KEY, 'the-verifier');

    await expect(h.auth.handleRedirect()).resolves.toBe(true);

    const call = h.http.calls[0];
    expect(call?.url).toBe('https://accounts.spotify.com/api/token');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(Object.fromEntries(formOf(call ?? { init: {} }))).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: REDIRECT,
      client_id: 'client-123',
      code_verifier: 'the-verifier',
    });
    expect(h.replaced).toEqual([`${REDIRECT}?keep=1`]);
    expect(h.session.data.size).toBe(0);
    expect(h.auth.isLoggedIn).toBe(true);
    expect(h.states).toEqual(['logged-in']);
    await expect(h.auth.getAccessToken()).resolves.toBe('access-1');
  });

  it('rejects a state mismatch without exchanging the code', async () => {
    const h = setup({ url: `${REDIRECT}?code=c&state=evil` });
    h.session.setItem(STATE_STORAGE_KEY, 'good');
    h.session.setItem(VERIFIER_STORAGE_KEY, 'v');
    await expect(h.auth.handleRedirect()).rejects.toBeInstanceOf(AuthError);
    expect(h.http.calls).toHaveLength(0);
    expect(h.replaced).toHaveLength(1);
    expect(h.auth.isLoggedIn).toBe(false);
  });

  it('rejects a callback without state or without a stored state', async () => {
    const noState = setup({ url: `${REDIRECT}?code=c` });
    noState.session.setItem(STATE_STORAGE_KEY, 'good');
    await expect(noState.auth.handleRedirect()).rejects.toBeInstanceOf(AuthError);
    const noStored = setup({ url: `${REDIRECT}?code=c&state=s` });
    await expect(noStored.auth.handleRedirect()).rejects.toBeInstanceOf(AuthError);
  });

  it('reports an authorization error returned by Spotify', async () => {
    const h = setup({ url: `${REDIRECT}?error=access_denied&state=s1` });
    h.session.setItem(STATE_STORAGE_KEY, 's1');
    await expect(h.auth.handleRedirect()).rejects.toThrow('access_denied');
    expect(h.replaced).toEqual([REDIRECT]);
  });

  it('fails when the verifier is missing', async () => {
    const h = setup({ url: `${REDIRECT}?code=c&state=s1` });
    h.session.setItem(STATE_STORAGE_KEY, 's1');
    await expect(h.auth.handleRedirect()).rejects.toBeInstanceOf(AuthError);
    expect(h.http.calls).toHaveLength(0);
  });

  it('fails when the token endpoint answers with an error status', async () => {
    const h = setup({ url: `${REDIRECT}?code=c&state=s1`, responders: [jsonResponse({}, 400)] });
    h.session.setItem(STATE_STORAGE_KEY, 's1');
    h.session.setItem(VERIFIER_STORAGE_KEY, 'v');
    await expect(h.auth.handleRedirect()).rejects.toBeInstanceOf(AuthError);
    expect(h.auth.isLoggedIn).toBe(false);
  });

  it.each([
    ['invalid JSON', new Response('nope', { status: 200 })],
    ['a malformed payload', jsonResponse({ access_token: 5 })],
    ['a non-object payload', jsonResponse(null)],
  ])('fails on %s from the token endpoint', async (_name, response) => {
    const h = setup({ url: `${REDIRECT}?code=c&state=s1`, responders: [response] });
    h.session.setItem(STATE_STORAGE_KEY, 's1');
    h.session.setItem(VERIFIER_STORAGE_KEY, 'v');
    await expect(h.auth.handleRedirect()).rejects.toBeInstanceOf(AuthError);
  });

  it('survives session storage that throws on read and remove', async () => {
    const h = setup({ url: `${REDIRECT}?code=c&state=s1` });
    const broken = new SpotifyAuth({
      clientId: 'c',
      redirectUri: REDIRECT,
      fetch: h.http.fetch,
      tokenStore: new BrowserTokenStore(null),
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
        removeItem: () => {
          throw new Error('blocked');
        },
      },
      clock: { now: () => 0 },
      navigate: () => undefined,
      currentUrl: () => new URL(`${REDIRECT}?code=c&state=s1`),
      replaceUrl: () => undefined,
    });
    await expect(broken.handleRedirect()).rejects.toBeInstanceOf(AuthError);
  });
});

describe('SpotifyAuth.getAccessToken', () => {
  it('returns null when logged out', async () => {
    const h = setup();
    await expect(h.auth.getAccessToken()).resolves.toBeNull();
    await expect(h.auth.forceRefresh()).resolves.toBeNull();
  });

  it('returns the cached token while more than 60s remain', async () => {
    const h = await loggedIn({ responders: [jsonResponse(tokenBody())] });
    h.time.now += 3600_000 - 61_000;
    await expect(h.auth.getAccessToken()).resolves.toBe('access-1');
    expect(h.http.calls).toHaveLength(1);
  });

  it('refreshes proactively when less than 60s remain', async () => {
    const h = await loggedIn({
      responders: [
        jsonResponse(tokenBody()),
        jsonResponse({ access_token: 'access-2', expires_in: 3600 }),
      ],
    });
    h.time.now += 3600_000 - 59_000;
    await expect(h.auth.getAccessToken()).resolves.toBe('access-2');
    expect(Object.fromEntries(formOf(h.http.calls[1] ?? { init: {} }))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
      client_id: 'client-123',
    });
    h.time.now += 1000;
    await expect(h.auth.getAccessToken()).resolves.toBe('access-2');
    expect(h.http.calls).toHaveLength(2);
  });

  it('replaces the refresh token when a new one is rotated in', async () => {
    const h = await loggedIn({
      responders: [
        jsonResponse(tokenBody()),
        jsonResponse({ access_token: 'access-2', expires_in: 3600, refresh_token: 'refresh-2' }),
        jsonResponse({ access_token: 'access-3', expires_in: 3600 }),
      ],
    });
    await h.auth.forceRefresh();
    expect(h.local.data.get('music-app:v1:spotify-auth')).toContain('refresh-2');
    await h.auth.forceRefresh();
    expect(formOf(h.http.calls[2] ?? { init: {} }).get('refresh_token')).toBe('refresh-2');
  });

  it('shares a single in-flight refresh between concurrent callers', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await loggedIn({
      responders: [
        jsonResponse(tokenBody()),
        async () => {
          await gate;
          return jsonResponse({ access_token: 'access-2', expires_in: 3600 });
        },
      ],
    });
    h.time.now += 3600_000;
    const all = Promise.all([
      h.auth.getAccessToken(),
      h.auth.getAccessToken(),
      h.auth.forceRefresh(),
    ]);
    release();
    await expect(all).resolves.toEqual(['access-2', 'access-2', 'access-2']);
    expect(h.http.calls).toHaveLength(2);
  });

  it('logs out when the refresh token is rejected', async () => {
    const h = await loggedIn({
      responders: [jsonResponse(tokenBody()), jsonResponse({ error: 'invalid_grant' }, 400)],
    });
    await expect(h.auth.forceRefresh()).resolves.toBeNull();
    expect(h.auth.isLoggedIn).toBe(false);
    expect(h.local.data.size).toBe(0);
    expect(h.states).toEqual(['logged-in', 'logged-out']);
  });

  it('logs out when the refresh payload is malformed', async () => {
    const h = await loggedIn({
      responders: [jsonResponse(tokenBody()), jsonResponse({ nope: true })],
    });
    await expect(h.auth.forceRefresh()).resolves.toBeNull();
    expect(h.auth.isLoggedIn).toBe(false);
  });

  it('keeps the session on a transient refresh failure (network error or 5xx)', async () => {
    const h = await loggedIn({
      responders: [jsonResponse(tokenBody()), new TypeError('offline'), jsonResponse({}, 503)],
    });
    await expect(h.auth.forceRefresh()).resolves.toBeNull();
    await expect(h.auth.forceRefresh()).resolves.toBeNull();
    expect(h.auth.isLoggedIn).toBe(true);
  });

  it('logs out when the stored session has no refresh token', async () => {
    const h = await loggedIn({
      responders: [jsonResponse(tokenBody({ refresh_token: undefined }))],
    });
    await expect(h.auth.forceRefresh()).resolves.toBeNull();
    expect(h.auth.isLoggedIn).toBe(false);
  });

  it('does not resurrect the session if logout happens during a refresh', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await loggedIn({
      responders: [
        jsonResponse(tokenBody()),
        async () => {
          await gate;
          return jsonResponse({ access_token: 'late', expires_in: 3600 });
        },
        async () => {
          await gate;
          return jsonResponse({ nope: 1 });
        },
      ],
    });
    const pending = h.auth.forceRefresh();
    h.auth.logout();
    release();
    await expect(pending).resolves.toBeNull();
    expect(h.auth.isLoggedIn).toBe(false);
  });

  it('restores a persisted session and refreshes because the access token is gone', async () => {
    const first = await loggedIn({ responders: [jsonResponse(tokenBody())] });
    const http = new FakeFetch(jsonResponse({ access_token: 'access-9', expires_in: 3600 }));
    const reloaded = new SpotifyAuth({
      clientId: 'client-123',
      redirectUri: REDIRECT,
      fetch: http.fetch,
      tokenStore: new BrowserTokenStore(first.local),
      sessionStorage: new MemoryStorage(),
      clock: { now: () => first.time.now },
      navigate: () => undefined,
      currentUrl: () => new URL(REDIRECT),
      replaceUrl: () => undefined,
    });
    expect(reloaded.isLoggedIn).toBe(true);
    await expect(reloaded.getAccessToken()).resolves.toBe('access-9');
  });
});

describe('SpotifyAuth.logout and subscribe', () => {
  it('notifies once, clears storage and stops notifying after unsubscribe', async () => {
    const h = await loggedIn({ responders: [jsonResponse(tokenBody())] });
    const extra: AuthState[] = [];
    const unsubscribe = h.auth.subscribe((state) => extra.push(state));
    h.auth.logout();
    h.auth.logout();
    expect(h.states).toEqual(['logged-in', 'logged-out']);
    expect(extra).toEqual(['logged-out']);
    expect(h.local.data.size).toBe(0);
    unsubscribe();
    expect(h.auth.isLoggedIn).toBe(false);
  });
});
