import { describe, expect, it, vi } from 'vitest';
import { LrcLibLyricsProvider } from './LrcLibLyricsProvider';
import { LyricsRequestError, type LyricsQuery } from './LyricsProvider';

const query: LyricsQuery = {
  title: 'Song A',
  artist: 'Artist',
  album: 'Album',
  durationMs: 200400,
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const notFound = (): Response => json({ message: 'not found' }, 404);

function setup(...responses: Array<Response | Error>) {
  const queue = [...responses];
  const fetchMock = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
    void args;
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected fetch');
    if (!(next instanceof Response)) throw next;
    return next;
  });
  const provider = new LrcLibLyricsProvider({ fetch: fetchMock as unknown as typeof fetch });
  const urls = (): URL[] => fetchMock.mock.calls.map((call) => new URL(String(call[0])));
  return { provider, fetchMock, urls };
}

describe('LrcLibLyricsProvider', () => {
  it('requests /api/get with rounded duration in seconds', async () => {
    const { provider, urls } = setup(json({ syncedLyrics: '[00:01.00]hi' }));
    await provider.find(query);
    const url = urls()[0] as URL;
    expect(url.origin).toBe('https://lrclib.net');
    expect(url.pathname).toBe('/api/get');
    expect(url.searchParams.get('track_name')).toBe('Song A');
    expect(url.searchParams.get('artist_name')).toBe('Artist');
    expect(url.searchParams.get('album_name')).toBe('Album');
    expect(url.searchParams.get('duration')).toBe('200');
  });

  it('prefers synced over plain lyrics', async () => {
    const { provider } = setup(json({ syncedLyrics: '[00:01.00]hi', plainLyrics: 'hi' }));
    expect(await provider.find(query)).toEqual({
      kind: 'synced',
      lines: [{ timeMs: 1000, text: 'hi' }],
    });
  });

  it('falls back to plain lyrics when synced is empty or unparsable', async () => {
    const { provider } = setup(json({ syncedLyrics: 'junk', plainLyrics: 'one\r\ntwo  ' }));
    expect(await provider.find(query)).toEqual({ kind: 'plain', lines: ['one', 'two'] });
  });

  it('returns instrumental when flagged and nothing else exists', async () => {
    const { provider } = setup(json({ instrumental: true, plainLyrics: null, syncedLyrics: null }));
    expect(await provider.find(query)).toEqual({ kind: 'instrumental' });
  });

  it('returns null for a record without lyrics or a non-object body', async () => {
    const one = setup(json({ id: 1 }));
    expect(await one.provider.find(query)).toBeNull();
    const two = setup(json('weird'));
    expect(await two.provider.find(query)).toBeNull();
  });

  it('searches on 404 and picks the closest duration within 3 s', async () => {
    const { provider, urls } = setup(
      notFound(),
      json([
        { duration: 190, plainLyrics: 'far' },
        { duration: 203, plainLyrics: 'near' },
        { duration: 199, plainLyrics: 'nearest' },
        { duration: 201 },
      ]),
    );
    expect(await provider.find(query)).toEqual({ kind: 'plain', lines: ['nearest'] });
    const url = urls()[1] as URL;
    expect(url.pathname).toBe('/api/search');
    expect(url.searchParams.get('track_name')).toBe('Song A');
    expect(url.searchParams.get('artist_name')).toBe('Artist');
    expect(url.searchParams.has('album_name')).toBe(false);
  });

  it('uses the first usable result when none is within tolerance or durations are missing', async () => {
    const far = setup(
      notFound(),
      json([
        { duration: 100, plainLyrics: 'first' },
        { duration: 150, plainLyrics: 'b' },
      ]),
    );
    expect(await far.provider.find(query)).toEqual({ kind: 'plain', lines: ['first'] });
    const missing = setup(notFound(), json([null, { plainLyrics: 'x' }]));
    expect(await missing.provider.find(query)).toEqual({ kind: 'plain', lines: ['x'] });
  });

  it('returns null when search is empty, 404 or not an array', async () => {
    expect(await setup(notFound(), json([])).provider.find(query)).toBeNull();
    expect(await setup(notFound(), notFound()).provider.find(query)).toBeNull();
    expect(await setup(notFound(), json({})).provider.find(query)).toBeNull();
  });

  it('throws a typed error on server failures', async () => {
    const { provider } = setup(json({}, 500));
    await expect(provider.find(query)).rejects.toMatchObject({
      name: 'LyricsRequestError',
      status: 500,
    });
  });

  it('throws a typed error on network failures and invalid JSON', async () => {
    const net = setup(new TypeError('failed to fetch'));
    await expect(net.provider.find(query)).rejects.toBeInstanceOf(LyricsRequestError);
    const bad = setup(new Response('not json', { status: 200 }));
    await expect(bad.provider.find(query)).rejects.toBeInstanceOf(LyricsRequestError);
  });

  it('propagates aborts as AbortError and forwards the signal', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const { provider, fetchMock } = setup(abort);
    const controller = new AbortController();
    await expect(provider.find(query, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it('rethrows the original error when the signal is already aborted', async () => {
    const original = new Error('boom');
    const { provider } = setup(original);
    const controller = new AbortController();
    controller.abort();
    await expect(provider.find(query, controller.signal)).rejects.toBe(original);
  });

  it('caches results, including not-found, but not failures', async () => {
    const hit = setup(json({ plainLyrics: 'a' }));
    await hit.provider.find(query);
    await hit.provider.find(query);
    expect(hit.fetchMock).toHaveBeenCalledTimes(1);

    const miss = setup(notFound(), json([]));
    expect(await miss.provider.find(query)).toBeNull();
    expect(await miss.provider.find(query)).toBeNull();
    expect(miss.fetchMock).toHaveBeenCalledTimes(2);

    const failing = setup(json({}, 503), json({ plainLyrics: 'ok' }));
    await expect(failing.provider.find(query)).rejects.toBeInstanceOf(LyricsRequestError);
    expect(await failing.provider.find(query)).toEqual({ kind: 'plain', lines: ['ok'] });
  });

  it('keys the cache by every query field', async () => {
    const { provider, fetchMock } = setup(json({ plainLyrics: 'a' }), json({ plainLyrics: 'b' }));
    await provider.find(query);
    await provider.find({ ...query, album: 'Other' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('defaults to the global fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ plainLyrics: 'g' }));
    try {
      expect(await new LrcLibLyricsProvider().find(query)).toEqual({ kind: 'plain', lines: ['g'] });
    } finally {
      spy.mockRestore();
    }
  });
});
