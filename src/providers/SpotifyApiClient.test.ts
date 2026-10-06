import { AuthError } from '../core/errors';
import { FakeFetch, jsonResponse } from '../test/httpFakes';
import {
  SpotifyApiClient,
  SpotifyApiError,
  SpotifyForbiddenError,
  SpotifyResponseError,
  abortableSleep,
} from './SpotifyApiClient';
import type { SpotifyAuthPort } from './SpotifyApiClient';

const isOk = (v: unknown): v is { ok: boolean } =>
  typeof v === 'object' && v !== null && 'ok' in v && typeof v.ok === 'boolean';

class FakeAuth implements SpotifyAuthPort {
  token: string | null = 'tok-1';
  refreshed = 'tok-2';
  refreshCalls = 0;
  logouts = 0;
  getAccessToken(): Promise<string | null> {
    return Promise.resolve(this.token);
  }
  forceRefresh(): Promise<string | null> {
    this.refreshCalls += 1;
    this.token = this.refreshed;
    return Promise.resolve(this.token);
  }
  logout(): void {
    this.logouts += 1;
  }
}

function setup(...responders: ConstructorParameters<typeof FakeFetch>) {
  const http = new FakeFetch(...responders);
  const auth = new FakeAuth();
  const sleeps: number[] = [];
  const client = new SpotifyApiClient({
    auth,
    fetch: http.fetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
  return { http, auth, sleeps, client };
}

const ok = () => jsonResponse({ ok: true });
const headersOf = (init: RequestInit): Record<string, string> => {
  const headers = init.headers;
  return typeof headers === 'object' && headers !== null && !Array.isArray(headers) && !(headers instanceof Headers)
    ? headers
    : {};
};

describe('SpotifyApiClient', () => {
  it('sends the bearer token and returns the guarded body', async () => {
    const { client, http } = setup(ok());
    await expect(client.request('/v1/x', { guard: isOk })).resolves.toEqual({ ok: true });
    expect(http.calls[0]?.url).toBe('https://api.spotify.com/v1/x');
    expect(headersOf(http.calls[0]?.init ?? {})['Authorization']).toBe('Bearer tok-1');
    expect(http.calls[0]?.init.method).toBe('GET');
  });

  it('sends a JSON body with the given method', async () => {
    const { client, http } = setup(ok());
    await client.request('/v1/x', { method: 'PUT', body: { a: 1 }, guard: isOk });
    expect(http.calls[0]?.init.method).toBe('PUT');
    expect(http.calls[0]?.init.body).toBe('{"a":1}');
    expect(headersOf(http.calls[0]?.init ?? {})['Content-Type']).toBe('application/json');
  });

  it('throws AuthError when there is no token', async () => {
    const { client, auth, http } = setup();
    auth.token = null;
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toBeInstanceOf(AuthError);
    expect(http.calls).toHaveLength(0);
  });

  it('refreshes and retries once on 401', async () => {
    const { client, auth, http } = setup(jsonResponse({}, 401), ok());
    await expect(client.request('/v1/x', { guard: isOk })).resolves.toEqual({ ok: true });
    expect(auth.refreshCalls).toBe(1);
    expect(headersOf(http.calls[1]?.init ?? {})['Authorization']).toBe('Bearer tok-2');
  });

  it('logs out and throws AuthError after a second 401', async () => {
    const { client, auth, http } = setup(jsonResponse({}, 401), jsonResponse({}, 401));
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toBeInstanceOf(AuthError);
    expect(http.calls).toHaveLength(2);
    expect(auth.logouts).toBe(1);
  });

  it('throws AuthError when the refresh after a 401 yields no token', async () => {
    const { client, auth } = setup(jsonResponse({}, 401));
    auth.forceRefresh = () => Promise.resolve(null);
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toBeInstanceOf(AuthError);
  });

  it('waits Retry-After seconds on 429 then retries', async () => {
    const { client, sleeps } = setup(jsonResponse({}, 429, { 'Retry-After': '3' }), ok());
    await client.request('/v1/x', { guard: isOk });
    expect(sleeps).toEqual([3000]);
  });

  it('defaults the wait to one second when Retry-After is missing or invalid', async () => {
    const { client, sleeps } = setup(jsonResponse({}, 429), jsonResponse({}, 429, { 'Retry-After': 'soon' }), ok());
    await client.request('/v1/x', { guard: isOk });
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('gives up after 2 rate-limit retries', async () => {
    const r = () => jsonResponse({}, 429, { 'Retry-After': '1' });
    const { client, http } = setup(r(), r(), r());
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toMatchObject({ status: 429 });
    expect(http.calls).toHaveLength(3);
  });

  it('retries 5xx with exponential backoff, at most twice', async () => {
    const { client, sleeps, http } = setup(jsonResponse({}, 503), jsonResponse({}, 500), ok());
    await client.request('/v1/x', { guard: isOk });
    expect(sleeps).toEqual([500, 1000]);
    expect(http.calls).toHaveLength(3);

    const failing = setup(jsonResponse({}, 502), jsonResponse({}, 502), jsonResponse({}, 502));
    await expect(failing.client.request('/v1/x', { guard: isOk })).rejects.toBeInstanceOf(SpotifyApiError);
    expect(failing.http.calls).toHaveLength(3);
  });

  it('throws a typed forbidden error on 403 without retrying', async () => {
    const { client, http } = setup(jsonResponse({}, 403));
    const error = await client.request('/v1/x', { guard: isOk }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyForbiddenError);
    expect(error).toBeInstanceOf(SpotifyApiError);
    expect(http.calls).toHaveLength(1);
  });

  it('throws SpotifyApiError for other 4xx', async () => {
    const { client } = setup(jsonResponse({}, 404));
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toMatchObject({ status: 404 });
  });

  it('wraps network failures with status 0', async () => {
    const { client } = setup(new TypeError('offline'));
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with AbortError and does not retry when fetch is aborted', async () => {
    const { client, http, sleeps } = setup(new DOMException('aborted', 'AbortError'), ok());
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toMatchObject({ name: 'AbortError' });
    expect(http.calls).toHaveLength(1);
    expect(sleeps).toHaveLength(0);
  });

  it('does not call fetch when the signal is already aborted', async () => {
    const { client, http } = setup(ok());
    const controller = new AbortController();
    controller.abort();
    await expect(client.request('/v1/x', { guard: isOk, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(http.calls).toHaveLength(0);
  });

  it('falls back to a generic AbortError when aborted without a reason', async () => {
    const { client } = setup(ok());
    const signal = { aborted: true, reason: undefined } as AbortSignal;
    await expect(client.request('/v1/x', { guard: isOk, signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes the signal to fetch', async () => {
    const { client, http } = setup(ok());
    const controller = new AbortController();
    await client.request('/v1/x', { guard: isOk, signal: controller.signal });
    expect(http.calls[0]?.init.signal).toBe(controller.signal);
  });

  it.each([
    ['invalid JSON', new Response('<html>', { status: 200 })],
    ['an empty body', new Response('', { status: 200 })],
    ['a body failing the guard', jsonResponse({ ok: 'yes' })],
  ])('throws SpotifyResponseError for %s', async (_name, response) => {
    const { client } = setup(response);
    await expect(client.request('/v1/x', { guard: isOk })).rejects.toBeInstanceOf(SpotifyResponseError);
  });
});

describe('abortableSleep', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves after the delay', async () => {
    const done = vi.fn();
    const promise = abortableSleep(100).then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(done).toHaveBeenCalled();
  });

  it('rejects when aborted during the wait', async () => {
    const controller = new AbortController();
    const promise = abortableSleep(1000, controller.signal);
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
  });

  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableSleep(10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
