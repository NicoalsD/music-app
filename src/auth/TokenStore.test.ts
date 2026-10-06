import { BrowserTokenStore, TOKEN_STORAGE_KEY } from './TokenStore';
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

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const tokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 1000 };

describe('BrowserTokenStore', () => {
  it('persists only refresh token and expiry', () => {
    const storage = new MemoryStorage();
    new BrowserTokenStore(storage).save(tokens);
    const raw = storage.data.get(TOKEN_STORAGE_KEY) ?? '';
    expect(JSON.parse(raw)).toEqual({ refreshToken: 'r', expiresAt: 1000 });
  });

  it('restores a session without access token after a reload', () => {
    const storage = new MemoryStorage();
    new BrowserTokenStore(storage).save(tokens);
    expect(new BrowserTokenStore(storage).read()).toEqual({ accessToken: null, refreshToken: 'r', expiresAt: 1000 });
  });

  it('returns null when nothing is stored', () => {
    expect(new BrowserTokenStore(new MemoryStorage()).read()).toBeNull();
    expect(new BrowserTokenStore(null).read()).toBeNull();
  });

  it.each(['not json', '{"refreshToken":1}', '{"refreshToken":"","expiresAt":1}', 'null'])(
    'ignores corrupt persisted data %s',
    (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(TOKEN_STORAGE_KEY, raw);
      expect(new BrowserTokenStore(storage).read()).toBeNull();
    },
  );

  it('clears memory and storage', () => {
    const storage = new MemoryStorage();
    const store = new BrowserTokenStore(storage);
    store.save(tokens);
    store.clear();
    expect(store.read()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it('keeps working in memory when storage throws', () => {
    const store = new BrowserTokenStore(throwingStorage);
    expect(store.read()).toBeNull();
    store.save(tokens);
    expect(store.read()).toEqual(tokens);
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('works without any storage', () => {
    const store = new BrowserTokenStore(null);
    store.save(tokens);
    expect(store.read()).toEqual(tokens);
    store.clear();
    expect(store.read()).toBeNull();
  });
});
