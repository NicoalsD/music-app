import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { Lyrics } from '../core/Lyrics';
import {
  LyricsRequestError,
  type LyricsProvider,
  type LyricsQuery,
} from '../providers/LyricsProvider';
import { LyricsProviderScope, useLyrics, useLyricsFrom, useLyricsProvider } from './useLyrics';

interface Pending {
  readonly query: LyricsQuery;
  readonly signal: AbortSignal | undefined;
  resolve(value: Lyrics | null): void;
  reject(error: unknown): void;
}

class FakeLyricsProvider implements LyricsProvider {
  readonly pending: Pending[] = [];

  find(query: LyricsQuery, signal?: AbortSignal): Promise<Lyrics | null> {
    return new Promise((resolve, reject) => {
      this.pending.push({ query, signal, resolve, reject });
    });
  }
}

const q = (title: string): LyricsQuery => ({ title, artist: 'A', album: 'B', durationMs: 1000 });
const plain: Lyrics = { kind: 'plain', lines: ['x'] };

describe('useLyricsFrom', () => {
  it('is idle without a query and never calls the provider', () => {
    const provider = new FakeLyricsProvider();
    const { result } = renderHook(() => useLyricsFrom(provider, null));
    expect(result.current.status).toBe('idle');
    expect(result.current.lyrics).toBeNull();
    expect(provider.pending).toHaveLength(0);
  });

  it('loads then becomes ready', async () => {
    const provider = new FakeLyricsProvider();
    const { result } = renderHook(() => useLyricsFrom(provider, q('one')));
    expect(result.current.status).toBe('loading');
    await act(async () => provider.pending[0]?.resolve(plain));
    expect(result.current.status).toBe('ready');
    expect(result.current.lyrics).toBe(plain);
  });

  it('reports empty when nothing is found', async () => {
    const provider = new FakeLyricsProvider();
    const { result } = renderHook(() => useLyricsFrom(provider, q('one')));
    await act(async () => provider.pending[0]?.resolve(null));
    expect(result.current.status).toBe('empty');
  });

  it('reports error and retry issues a new request', async () => {
    const provider = new FakeLyricsProvider();
    const { result } = renderHook(() => useLyricsFrom(provider, q('one')));
    await act(async () => provider.pending[0]?.reject(new LyricsRequestError(500, 'down')));
    expect(result.current.status).toBe('error');
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    expect(provider.pending).toHaveLength(2);
    await act(async () => provider.pending[1]?.resolve(plain));
    expect(result.current.status).toBe('ready');
  });

  it('aborts the previous request on query change and ignores its late answer', async () => {
    const provider = new FakeLyricsProvider();
    const { result, rerender } = renderHook(({ query }) => useLyricsFrom(provider, query), {
      initialProps: { query: q('one') as LyricsQuery | null },
    });
    rerender({ query: q('two') });
    expect(provider.pending[0]?.signal?.aborted).toBe(true);
    await act(async () => provider.pending[0]?.resolve({ kind: 'instrumental' }));
    expect(result.current.status).toBe('loading');
    await act(async () => provider.pending[1]?.resolve(plain));
    expect(result.current.lyrics).toBe(plain);
  });

  it('ignores aborted rejections and late errors from superseded requests', async () => {
    const provider = new FakeLyricsProvider();
    const { result, rerender } = renderHook(({ query }) => useLyricsFrom(provider, query), {
      initialProps: { query: q('one') as LyricsQuery | null },
    });
    rerender({ query: q('two') });
    await act(async () => provider.pending[0]?.reject(new DOMException('x', 'AbortError')));
    expect(result.current.status).toBe('loading');
    await act(async () => provider.pending[1]?.reject(new DOMException('x', 'AbortError')));
    expect(result.current.status).toBe('loading');
  });

  it('returns to idle when the query becomes null and does not refetch for equal queries', async () => {
    const provider = new FakeLyricsProvider();
    const { result, rerender } = renderHook(({ query }) => useLyricsFrom(provider, query), {
      initialProps: { query: q('one') as LyricsQuery | null },
    });
    rerender({ query: q('one') });
    expect(provider.pending).toHaveLength(1);
    await act(async () => provider.pending[0]?.resolve(plain));
    rerender({ query: null });
    expect(result.current.status).toBe('idle');
    expect(result.current.lyrics).toBeNull();
  });

  it('aborts on unmount', () => {
    const provider = new FakeLyricsProvider();
    const { unmount } = renderHook(() => useLyricsFrom(provider, q('one')));
    unmount();
    expect(provider.pending[0]?.signal?.aborted).toBe(true);
  });
});

describe('useLyrics context', () => {
  it('uses the provider from the scope', async () => {
    const provider = new FakeLyricsProvider();
    const wrapper = ({ children }: { children?: ReactNode }) =>
      createElement(LyricsProviderScope, { provider }, children);
    const { result } = renderHook(() => useLyrics(q('one')), { wrapper });
    await act(async () => provider.pending[0]?.resolve(plain));
    expect(result.current.status).toBe('ready');
  });

  it('throws outside the scope', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useLyricsProvider())).toThrow(/LyricsProviderScope/);
    } finally {
      silence.mockRestore();
    }
  });
});
