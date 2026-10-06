import { AuthError, DomainError } from '../core/errors';

export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com';
export const MAX_RATE_LIMIT_RETRIES = 2;
export const MAX_SERVER_RETRIES = 2;
const SERVER_BACKOFF_BASE_MS = 500;
const DEFAULT_RETRY_AFTER_SECONDS = 1;

/** Non-success HTTP answer (or a network failure, status 0) that could not be recovered. */
export class SpotifyApiError extends DomainError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 403: the user is not on the app allowlist, or the account is not Premium. */
export class SpotifyForbiddenError extends SpotifyApiError {
  constructor(message = 'Spotify refused the request (403): user not on the allowlist or not Premium') {
    super(403, message);
  }
}

/** The response body did not have the expected shape. */
export class SpotifyResponseError extends DomainError {}

/** The part of SpotifyAuth the client needs (kept narrow for testing). */
export interface SpotifyAuthPort {
  getAccessToken(): Promise<string | null>;
  forceRefresh(): Promise<string | null>;
  logout(): void;
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface SpotifyApiClientDeps {
  readonly auth: SpotifyAuthPort;
  readonly fetch: typeof fetch;
  readonly sleep?: Sleep;
  readonly baseUrl?: string;
}

export interface RequestOptions<T> {
  readonly signal?: AbortSignal | undefined;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly guard: (value: unknown) => value is T;
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal ? abortError(signal) : new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get('Retry-After');
  const seconds = header === null ? NaN : Number(header);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS) * 1000;
}

/** Thin authorized client for the Spotify Web API. */
export class SpotifyApiClient {
  readonly #auth: SpotifyAuthPort;
  readonly #fetch: typeof fetch;
  readonly #sleep: Sleep;
  readonly #baseUrl: string;

  constructor(deps: SpotifyApiClientDeps) {
    this.#auth = deps.auth;
    this.#fetch = deps.fetch;
    this.#sleep = deps.sleep ?? abortableSleep;
    this.#baseUrl = deps.baseUrl ?? SPOTIFY_API_BASE_URL;
  }

  async request<T>(path: string, options: RequestOptions<T>): Promise<T> {
    const { signal } = options;
    let token = await this.#auth.getAccessToken();
    let authRetried = false;
    let rateRetries = 0;
    let serverRetries = 0;

    for (;;) {
      if (token === null) throw new AuthError('Not logged in to Spotify');
      if (signal?.aborted === true) throw abortError(signal);
      const response = await this.#send(path, token, options);

      if (response.ok) return this.#parse(response, options.guard);
      const { status } = response;

      if (status === 401) {
        if (authRetried) {
          this.#auth.logout();
          throw new AuthError('Spotify rejected the refreshed token (401)');
        }
        authRetried = true;
        token = await this.#auth.forceRefresh();
        continue;
      }
      if (status === 403) throw new SpotifyForbiddenError();
      if (status === 429 && rateRetries < MAX_RATE_LIMIT_RETRIES) {
        rateRetries += 1;
        await this.#sleep(retryAfterMs(response), signal);
        continue;
      }
      if (status >= 500 && serverRetries < MAX_SERVER_RETRIES) {
        await this.#sleep(SERVER_BACKOFF_BASE_MS * 2 ** serverRetries, signal);
        serverRetries += 1;
        continue;
      }
      throw new SpotifyApiError(status, `Spotify request to ${path} failed with status ${status}`);
    }
  }

  async #send<T>(path: string, token: string, options: RequestOptions<T>): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const init: RequestInit = { method: options.method ?? 'GET', headers };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    if (options.signal !== undefined) init.signal = options.signal;
    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, init);
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new SpotifyApiError(0, `Network error while calling ${path}`);
    }
  }

  async #parse<T>(response: Response, guard: (value: unknown) => value is T): Promise<T> {
    let body: unknown;
    try {
      const text = await response.text();
      body = text === '' ? undefined : JSON.parse(text);
    } catch {
      throw new SpotifyResponseError('Spotify returned invalid JSON');
    }
    if (!guard(body)) throw new SpotifyResponseError('Spotify returned an unexpected payload');
    return body;
  }
}
