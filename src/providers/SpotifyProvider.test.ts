import { InvalidOperationError } from '../core/errors';
import { FakeFetch, jsonResponse } from '../test/httpFakes';
import { SpotifyApiClient, SpotifyResponseError } from './SpotifyApiClient';
import { SpotifyProvider } from './SpotifyProvider';

const images = [
  { url: 'https://img/640', width: 640, height: 640 },
  { url: 'https://img/300', width: 300, height: 300 },
  { url: 'https://img/64', width: 64, height: 64 },
];

const rawTrack = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  uri: 'spotify:track:t1',
  name: 'Song One',
  duration_ms: 215000,
  explicit: true,
  artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
  album: { id: 'al1', name: 'Album One', images },
  external_urls: { spotify: 'https://open.spotify.com/track/t1' },
  ...over,
});

const rawArtist = { id: 'ar1', name: 'Artist A', images, genres: ['rock'] };
const rawAlbum = (over: Record<string, unknown> = {}) => ({
  id: 'al1',
  name: 'Album One',
  artists: [{ name: 'Artist A' }],
  images,
  release_date: '2019-05-17',
  total_tracks: 12,
  ...over,
});

function setup(...responders: ConstructorParameters<typeof FakeFetch>) {
  const http = new FakeFetch(...responders);
  const client = new SpotifyApiClient({
    auth: { getAccessToken: () => Promise.resolve('tok'), forceRefresh: () => Promise.resolve('tok'), logout: () => undefined },
    fetch: http.fetch,
    sleep: () => Promise.resolve(),
  });
  return { http, provider: new SpotifyProvider(client) };
}

const urlOf = (http: FakeFetch, index = 0): URL => new URL(http.calls[index]?.url ?? '');

describe('SpotifyProvider.search', () => {
  it('maps tracks, artists and albums', async () => {
    const { provider, http } = setup(
      jsonResponse({
        tracks: { items: [rawTrack()], next: null },
        artists: { items: [rawArtist], next: null },
        albums: { items: [rawAlbum()], next: null },
      }),
    );
    const results = await provider.search({ text: 'abc', types: ['track', 'artist', 'album'], page: 0 });
    expect(results.tracks).toEqual([
      {
        trackId: 't1',
        source: 'spotify',
        uri: 'spotify:track:t1',
        title: 'Song One',
        artists: ['Artist A', 'Artist B'],
        album: { id: 'al1', name: 'Album One' },
        durationMs: 215000,
        artwork: { small: 'https://img/64', medium: 'https://img/300', large: 'https://img/640' },
        explicit: true,
        externalUrl: 'https://open.spotify.com/track/t1',
      },
    ]);
    expect(results.artists).toEqual([
      {
        id: 'ar1',
        name: 'Artist A',
        genres: ['rock'],
        artwork: { small: 'https://img/64', medium: 'https://img/300', large: 'https://img/640' },
      },
    ]);
    expect(results.albums[0]).toMatchObject({ id: 'al1', artists: ['Artist A'], releaseYear: 2019, totalTracks: 12 });
    expect(results.hasMore).toBe(false);
    expect(urlOf(http).pathname).toBe('/v1/search');
  });

  it('picks the closest image per slot when sizes are unusual', async () => {
    const odd = [
      { url: 'https://img/500', width: 500 },
      { url: 'https://img/200', width: 200 },
    ];
    const { provider } = setup(
      jsonResponse({ tracks: { items: [rawTrack({ album: { id: 'a', name: 'A', images: odd } })], next: null } }),
    );
    const { tracks } = await provider.search({ text: 'x', types: ['track'], page: 0 });
    expect(tracks[0]?.artwork).toEqual({ small: 'https://img/200', medium: 'https://img/200', large: 'https://img/500' });
  });

  it('uses the first image when widths are unknown and an empty artwork when there are none', async () => {
    const { provider } = setup(
      jsonResponse({
        tracks: {
          items: [
            rawTrack({ album: { id: 'a', name: 'A', images: [{ url: 'https://img/x', width: null }] } }),
            rawTrack({ id: 't2', album: { id: 'a', name: 'A' }, external_urls: undefined, explicit: undefined }),
          ],
          next: null,
        },
      }),
    );
    const { tracks } = await provider.search({ text: 'x', types: ['track'], page: 0 });
    expect(tracks[0]?.artwork).toEqual({ small: 'https://img/x', medium: 'https://img/x', large: 'https://img/x' });
    expect(tracks[1]).toMatchObject({ artwork: {}, explicit: false, externalUrl: null });
  });

  it('requests only the asked types, limit 10 and offset page*10', async () => {
    const { provider, http } = setup(
      jsonResponse({ albums: { items: [], next: null } }),
      jsonResponse({ tracks: { items: [], next: null }, artists: { items: [], next: null } }),
    );
    await provider.search({ text: 'blue  ', types: ['album'], page: 3 });
    const first = urlOf(http, 0).searchParams;
    expect(first.get('q')).toBe('blue');
    expect(first.get('type')).toBe('album');
    expect(first.get('limit')).toBe('10');
    expect(first.get('offset')).toBe('30');

    await provider.search({ text: 'blue', types: ['artist', 'track'], page: 0 });
    const second = urlOf(http, 1).searchParams;
    expect(second.get('type')).toBe('track,artist');
    expect(second.get('offset')).toBe('0');
  });

  it('never asks for more than 10 results', async () => {
    const { provider, http } = setup(
      ...Array.from({ length: 5 }, () => jsonResponse({ tracks: { items: [], next: null } })),
    );
    for (let page = 0; page < 5; page += 1) await provider.search({ text: 'q', types: ['track'], page });
    for (const call of http.calls) expect(Number(new URL(call.url).searchParams.get('limit'))).toBeLessThanOrEqual(10);
  });

  it('reports hasMore when any requested section has a next page', async () => {
    const { provider } = setup(
      jsonResponse({
        tracks: { items: [], next: null },
        albums: { items: [], next: 'https://api.spotify.com/v1/search?offset=10' },
      }),
    );
    const results = await provider.search({ text: 'q', types: ['track', 'album'], page: 0 });
    expect(results.hasMore).toBe(true);
  });

  it('ignores null items and unrequested sections', async () => {
    const { provider } = setup(
      jsonResponse({ tracks: { items: [null, rawTrack()], next: null }, artists: { items: [rawArtist], next: 'n' } }),
    );
    const results = await provider.search({ text: 'q', types: ['track'], page: 0 });
    expect(results.tracks).toHaveLength(1);
    expect(results.artists).toEqual([]);
    expect(results.hasMore).toBe(false);
  });

  it('returns empty results without calling the API for an empty query or no types', async () => {
    const { provider, http } = setup();
    const empty = { tracks: [], artists: [], albums: [], hasMore: false };
    await expect(provider.search({ text: '   ', types: ['track'], page: 0 })).resolves.toEqual(empty);
    await expect(provider.search({ text: 'x', types: [], page: 0 })).resolves.toEqual(empty);
    expect(http.calls).toHaveLength(0);
  });

  it('rejects an invalid page', async () => {
    const { provider } = setup();
    await expect(provider.search({ text: 'x', types: ['track'], page: -1 })).rejects.toBeInstanceOf(
      InvalidOperationError,
    );
    await expect(provider.search({ text: 'x', types: ['track'], page: 1.5 })).rejects.toBeInstanceOf(
      InvalidOperationError,
    );
  });

  it('passes the abort signal to fetch', async () => {
    const { provider, http } = setup(jsonResponse({ tracks: { items: [], next: null } }));
    const controller = new AbortController();
    await provider.search({ text: 'x', types: ['track'], page: 0 }, controller.signal);
    expect(http.calls[0]?.init.signal).toBe(controller.signal);
  });

  it('fails with a typed error when a requested section is missing', async () => {
    const { provider } = setup(jsonResponse({ tracks: { items: [], next: null } }));
    await expect(provider.search({ text: 'x', types: ['track', 'album'], page: 0 })).rejects.toBeInstanceOf(
      SpotifyResponseError,
    );
  });

  it('fails with a typed error when a track has no album in a search result', async () => {
    const { provider } = setup(jsonResponse({ tracks: { items: [rawTrack({ album: undefined })], next: null } }));
    await expect(provider.search({ text: 'x', types: ['track'], page: 0 })).rejects.toBeInstanceOf(
      SpotifyResponseError,
    );
  });

  it.each([
    ['invalid JSON', new Response('{oops', { status: 200 })],
    ['a non-object body', jsonResponse([])],
    ['a section that is not a page', jsonResponse({ tracks: 5 })],
    ['a page with a non-array items', jsonResponse({ tracks: { items: {}, next: null } })],
    ['a page with a bad next', jsonResponse({ tracks: { items: [], next: 3 } })],
    ['a malformed track', jsonResponse({ tracks: { items: [{ id: 1 }], next: null } })],
    ['a track with bad duration', jsonResponse({ tracks: { items: [rawTrack({ duration_ms: 'x' })], next: null } })],
    ['a track with bad artists', jsonResponse({ tracks: { items: [rawTrack({ artists: [1] })], next: null } })],
    ['a track with bad explicit', jsonResponse({ tracks: { items: [rawTrack({ explicit: 'y' })], next: null } })],
    ['a track with a bad album', jsonResponse({ tracks: { items: [rawTrack({ album: { id: 1 } })], next: null } })],
    [
      'a track with bad images',
      jsonResponse({ tracks: { items: [rawTrack({ album: { id: 'a', name: 'A', images: [{ url: 3 }] } })], next: null } }),
    ],
    ['an artist with bad genres', jsonResponse({ artists: { items: [{ ...rawArtist, genres: [1] }], next: null } })],
    ['an artist with a bad id', jsonResponse({ artists: { items: [{ name: 'x' }], next: null } })],
    ['an artist with bad images', jsonResponse({ artists: { items: [{ ...rawArtist, images: 1 }], next: null } })],
    ['an album without artists', jsonResponse({ albums: { items: [rawAlbum({ artists: 1 })], next: null } })],
    ['an album with a bad id', jsonResponse({ albums: { items: [{ name: 'x' }], next: null } })],
  ])('fails with a typed error on %s', async (_name, response) => {
    const { provider } = setup(response);
    await expect(
      provider.search({ text: 'x', types: ['track', 'artist', 'album'], page: 0 }),
    ).rejects.toBeInstanceOf(SpotifyResponseError);
  });

  it('handles albums with missing optional fields', async () => {
    const { provider } = setup(
      jsonResponse({
        albums: { items: [rawAlbum({ release_date: 'unknown', total_tracks: undefined, images: undefined })], next: null },
        artists: { items: [{ id: 'a', name: 'A' }], next: null },
      }),
    );
    const results = await provider.search({ text: 'x', types: ['artist', 'album'], page: 0 });
    expect(results.albums[0]).toMatchObject({ releaseYear: null, totalTracks: 0, artwork: {} });
    expect(results.artists[0]).toMatchObject({ genres: [], artwork: {} });
  });
});

describe('SpotifyProvider.getAlbum', () => {
  const albumTrack = (n: number) => ({
    id: `t${n}`,
    uri: `spotify:track:t${n}`,
    name: `Track ${n}`,
    duration_ms: 1000 * n,
    explicit: false,
    artists: [{ name: 'Artist A' }],
  });

  it('reuses album images for tracks and returns a single page', async () => {
    const { provider, http } = setup(
      jsonResponse({ ...rawAlbum(), tracks: { items: [albumTrack(1), albumTrack(2)], next: null } }),
    );
    const album = await provider.getAlbum('al1');
    expect(urlOf(http).pathname).toBe('/v1/albums/al1');
    expect(album.name).toBe('Album One');
    expect(album.tracks.map((t) => t.trackId)).toEqual(['t1', 't2']);
    for (const track of album.tracks) {
      expect(track.album).toEqual({ id: 'al1', name: 'Album One' });
      expect(track.artwork.medium).toBe('https://img/300');
    }
    expect(http.calls).toHaveLength(1);
  });

  it('paginates through the remaining album tracks', async () => {
    const { provider, http } = setup(
      jsonResponse({ ...rawAlbum(), tracks: { items: [albumTrack(1), albumTrack(2)], next: 'more' } }),
      jsonResponse({ items: [albumTrack(3), albumTrack(4)], next: 'more' }),
      jsonResponse({ items: [albumTrack(5)], next: null }),
    );
    const album = await provider.getAlbum('al1');
    expect(album.tracks.map((t) => t.trackId)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    const second = urlOf(http, 1);
    expect(second.pathname).toBe('/v1/albums/al1/tracks');
    expect(second.searchParams.get('limit')).toBe('50');
    expect(second.searchParams.get('offset')).toBe('2');
    expect(urlOf(http, 2).searchParams.get('offset')).toBe('4');
    expect(album.tracks[4]?.artwork.large).toBe('https://img/640');
  });

  it('stops paginating when a page comes back empty', async () => {
    const { provider, http } = setup(
      jsonResponse({ ...rawAlbum(), tracks: { items: [albumTrack(1)], next: 'more' } }),
      jsonResponse({ items: [], next: 'more' }),
    );
    const album = await provider.getAlbum('al1');
    expect(album.tracks).toHaveLength(1);
    expect(http.calls).toHaveLength(2);
  });

  it('encodes the album id', async () => {
    const { provider, http } = setup(jsonResponse({ ...rawAlbum(), tracks: { items: [], next: null } }));
    await provider.getAlbum('a/b');
    expect(urlOf(http).pathname).toBe('/v1/albums/a%2Fb');
  });

  it.each([
    ['missing tracks', jsonResponse(rawAlbum())],
    ['a malformed album', jsonResponse({ tracks: { items: [], next: null } })],
    ['a malformed track page', jsonResponse({ ...rawAlbum(), tracks: { items: [{}], next: null } })],
  ])('fails with a typed error on %s', async (_name, response) => {
    const { provider } = setup(response);
    await expect(provider.getAlbum('al1')).rejects.toBeInstanceOf(SpotifyResponseError);
  });

  it('fails with a typed error when a later track page is malformed', async () => {
    const { provider } = setup(
      jsonResponse({ ...rawAlbum(), tracks: { items: [albumTrack(1)], next: 'more' } }),
      jsonResponse({ items: 'nope', next: null }),
    );
    await expect(provider.getAlbum('al1')).rejects.toBeInstanceOf(SpotifyResponseError);
  });
});

describe('SpotifyProvider.getArtist', () => {
  it('combines the artist and their albums', async () => {
    const { provider, http } = setup(
      jsonResponse(rawArtist),
      jsonResponse({ items: [rawAlbum(), rawAlbum({ id: 'al2', name: 'Single' })], next: null }),
    );
    const artist = await provider.getArtist('ar1');
    expect(artist).toMatchObject({ id: 'ar1', name: 'Artist A', genres: ['rock'] });
    expect(artist.albums.map((a) => a.id)).toEqual(['al1', 'al2']);
    const paths = http.calls.map((call) => new URL(call.url));
    const albumsUrl = paths.find((u) => u.pathname === '/v1/artists/ar1/albums');
    expect(albumsUrl?.searchParams.get('include_groups')).toBe('album,single');
    expect(albumsUrl?.searchParams.get('limit')).toBe('10');
    expect(paths.some((u) => u.pathname === '/v1/artists/ar1')).toBe(true);
    expect(paths.some((u) => u.pathname.includes('top-tracks'))).toBe(false);
  });

  it('fails with a typed error on malformed payloads', async () => {
    const bad = setup(jsonResponse({ nope: 1 }), jsonResponse({ items: [], next: null }));
    await expect(bad.provider.getArtist('ar1')).rejects.toBeInstanceOf(SpotifyResponseError);
  });
});
