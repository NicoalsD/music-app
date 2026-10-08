import { SPOTIFY_SCOPES } from '../auth/SpotifyAuth';
import { FakeFetch, jsonResponse } from '../test/httpFakes';
import { SpotifyApiClient, SpotifyApiError, SpotifyResponseError } from './SpotifyApiClient';
import { SpotifyPersonalFeed } from './SpotifyPersonalFeed';

const images = [
  { url: 'https://img/640', width: 640, height: 640 },
  { url: 'https://img/300', width: 300, height: 300 },
  { url: 'https://img/64', width: 64, height: 64 },
];

const rawTrack = (id: string) => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  duration_ms: 1000,
  explicit: false,
  artists: [{ name: 'Artist A' }],
  album: { id: 'al1', name: 'Album One', images },
});

function setup(...responders: ConstructorParameters<typeof FakeFetch>) {
  const http = new FakeFetch(...responders);
  const client = new SpotifyApiClient({
    auth: {
      getAccessToken: () => Promise.resolve('tok'),
      forceRefresh: () => Promise.resolve('tok'),
      logout: () => undefined,
    },
    fetch: http.fetch,
    sleep: () => Promise.resolve(),
  });
  return { http, feed: new SpotifyPersonalFeed(client) };
}

const urlOf = (http: FakeFetch): URL => new URL(http.calls[0]?.url ?? '');

describe('feed scopes', () => {
  it('requests the scopes the personal endpoints need', () => {
    const scopes = SPOTIFY_SCOPES.split(' ');
    expect(scopes).toEqual(
      expect.arrayContaining(['user-top-read', 'user-read-recently-played', 'user-library-read']),
    );
  });
});

describe('SpotifyPersonalFeed', () => {
  it('maps top tracks with metadata and artwork', async () => {
    const { feed, http } = setup(jsonResponse({ items: [rawTrack('a')], next: null }));
    const result = await feed.topTracks('short_term');
    expect(urlOf(http).pathname).toBe('/v1/me/top/tracks');
    expect(urlOf(http).searchParams.get('time_range')).toBe('short_term');
    expect(urlOf(http).searchParams.get('limit')).toBe('10');
    expect(result).toEqual({
      status: 'ready',
      items: [
        expect.objectContaining({
          trackId: 'a',
          title: 'Song a',
          artists: ['Artist A'],
          album: { id: 'al1', name: 'Album One' },
          artwork: { small: 'https://img/64', medium: 'https://img/300', large: 'https://img/640' },
        }),
      ],
    });
  });

  it('maps top artists with their portraits', async () => {
    const { feed, http } = setup(
      jsonResponse({
        items: [{ id: 'ar1', name: 'Artist A', images, genres: ['rock'] }],
        next: null,
      }),
    );
    const result = await feed.topArtists('long_term');
    expect(urlOf(http).pathname).toBe('/v1/me/top/artists');
    expect(urlOf(http).searchParams.get('time_range')).toBe('long_term');
    expect(result).toEqual({
      status: 'ready',
      items: [expect.objectContaining({ id: 'ar1', name: 'Artist A', genres: ['rock'] })],
    });
  });

  it('keeps the order of recently played and drops repeated tracks', async () => {
    const wrap = (id: string, at: string) => ({ played_at: at, track: rawTrack(id) });
    const { feed, http } = setup(
      jsonResponse({ items: [wrap('a', '3'), wrap('b', '2'), wrap('a', '1')], next: null }),
    );
    const result = await feed.recentlyPlayed();
    expect(urlOf(http).pathname).toBe('/v1/me/player/recently-played');
    expect(result.status === 'ready' && result.items.map((t) => t.trackId)).toEqual(['a', 'b']);
  });

  it('maps saved tracks', async () => {
    const { feed, http } = setup(
      jsonResponse({ items: [{ added_at: 'x', track: rawTrack('s') }], next: null }),
    );
    const result = await feed.savedTracks();
    expect(urlOf(http).pathname).toBe('/v1/me/tracks');
    expect(result.status === 'ready' && result.items[0]?.trackId).toBe('s');
  });

  it('returns an empty ready result for an empty page', async () => {
    const { feed } = setup(jsonResponse({ items: [], next: null }));
    expect(await feed.savedTracks()).toEqual({ status: 'ready', items: [] });
  });

  it('reports needsReconnect on 403 instead of throwing', async () => {
    const { feed } = setup(jsonResponse({ error: {} }, 403));
    expect(await feed.topTracks('medium_term')).toEqual({ status: 'needsReconnect' });
  });

  it('reports unavailable on 404', async () => {
    const { feed } = setup(jsonResponse({ error: {} }, 404));
    expect(await feed.recentlyPlayed()).toEqual({ status: 'unavailable' });
  });

  it('rethrows other failures', async () => {
    const { feed } = setup(jsonResponse({ error: {} }, 400));
    await expect(feed.savedTracks()).rejects.toBeInstanceOf(SpotifyApiError);
  });

  it('rejects malformed payloads', async () => {
    const { feed } = setup(jsonResponse({ items: [{ track: { id: 1 } }], next: null }));
    await expect(feed.savedTracks()).rejects.toBeInstanceOf(SpotifyResponseError);
  });

  it('propagates aborts', async () => {
    const { feed } = setup(new DOMException('Aborted', 'AbortError'));
    await expect(feed.topArtists('short_term')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
