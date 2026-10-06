export interface TokenSet {
  /** Null after a page reload: the access token only lives in memory. */
  readonly accessToken: string | null;
  readonly refreshToken: string;
  /** Epoch milliseconds at which the access token expires. */
  readonly expiresAt: number;
}

export interface TokenStore {
  read(): TokenSet | null;
  save(tokens: TokenSet): void;
  clear(): void;
}

/** Minimal subset of the Web Storage API. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const TOKEN_STORAGE_KEY = 'music-app:v1:spotify-auth';

function isPersisted(value: unknown): value is { refreshToken: string; expiresAt: number } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['refreshToken'] === 'string' &&
    record['refreshToken'] !== '' &&
    typeof record['expiresAt'] === 'number' &&
    Number.isFinite(record['expiresAt'])
  );
}

/**
 * Keeps the access token in memory and persists only the refresh token and
 * expiry. Every storage access is guarded, so private mode or blocked storage
 * degrades to "session only" instead of failing.
 */
export class BrowserTokenStore implements TokenStore {
  readonly #storage: StorageLike | null;
  #memory: TokenSet | null = null;

  constructor(storage: StorageLike | null) {
    this.#storage = storage;
  }

  read(): TokenSet | null {
    if (this.#memory !== null) return this.#memory;
    const persisted = this.#readPersisted();
    if (persisted === null) return null;
    this.#memory = { accessToken: null, ...persisted };
    return this.#memory;
  }

  save(tokens: TokenSet): void {
    this.#memory = tokens;
    try {
      this.#storage?.setItem(
        TOKEN_STORAGE_KEY,
        JSON.stringify({ refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt }),
      );
    } catch {
      // Storage unavailable (private mode, quota): keep working in memory only.
    }
  }

  clear(): void {
    this.#memory = null;
    try {
      this.#storage?.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Nothing to do: the in-memory copy is already gone.
    }
  }

  #readPersisted(): { refreshToken: string; expiresAt: number } | null {
    try {
      const raw = this.#storage?.getItem(TOKEN_STORAGE_KEY) ?? null;
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return isPersisted(parsed) ? { refreshToken: parsed.refreshToken, expiresAt: parsed.expiresAt } : null;
    } catch {
      return null;
    }
  }
}
