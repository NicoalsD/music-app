import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../core/test-utils/fakes';
import type { AlbumDetail, ArtistDetail, SearchResults } from '../providers/MusicProvider';
import { createHarness, spotifyTrack } from '../state/test-utils/harness';
import { strings } from '../ui/i18n/es';
import { FakeLyricsProvider } from '../state/test-utils/FakeLyricsProvider';
import { App } from './App';

const albumSummary = {
  id: 'al1',
  name: 'La Mer',
  artists: ['Debussy'],
  artwork: {},
  releaseYear: 1905,
  totalTracks: 2,
};
const artistSummary = { id: 'ar1', name: 'Debussy', artwork: {}, genres: ['classical'] };

const results: SearchResults = {
  tracks: [spotifyTrack('t1', 61_000), spotifyTrack('t2', 90_000)],
  artists: [artistSummary],
  albums: [albumSummary],
  hasMore: false,
};

const album: AlbumDetail = {
  ...albumSummary,
  tracks: [spotifyTrack('x1', 60_000), spotifyTrack('x2', 120_000)],
};

const artist: ArtistDetail = { ...artistSummary, albums: [albumSummary] };

function setup() {
  const h = createHarness();
  h.provider.searchImpl = () => Promise.resolve(results);
  h.provider.albumImpl = () => Promise.resolve(album);
  h.provider.artistImpl = () => Promise.resolve(artist);
  const view = render(<App store={h.store} lyricsProvider={new FakeLyricsProvider()} />);
  act(() => {
    h.auth.loggedIn = true;
    h.auth.emit('logged-in');
  });
  return { ...view, h, user: userEvent.setup() };
}

const searchbox = () => screen.getByRole('searchbox', { name: strings.search.label });

async function search(user: ReturnType<typeof userEvent.setup>, text = 'mer') {
  await user.type(searchbox(), text);
  return screen.findByRole('button', { name: strings.search.openAlbum('La Mer') });
}

const titles = (h: ReturnType<typeof setup>['h']) =>
  h.store.getSnapshot().songs.map((s) => s.title);

describe('App navigation', () => {
  it('starts on home and typing in the top bar switches to the search view', async () => {
    const { user } = setup();
    expect(screen.queryByRole('region', { name: strings.search.label })).not.toBeInTheDocument();
    await search(user);
    expect(screen.getByRole('region', { name: strings.search.label })).toBeInTheDocument();
  });

  it('the home button returns from search and keeps the typed query', async () => {
    const { user } = setup();
    await search(user);
    await user.click(screen.getByRole('button', { name: strings.nav.homeButton }));
    expect(screen.queryByRole('region', { name: strings.search.label })).not.toBeInTheDocument();
    const sidebar = within(screen.getByRole('complementary', { name: strings.nav.library }));
    await user.click(sidebar.getByRole('button', { name: strings.nav.search }));
    expect(searchbox()).toHaveValue('mer');
    expect(await screen.findByText('Title t1')).toBeInTheDocument();
  });

  it('typing while an album is open goes back to the results of the new query', async () => {
    const { user } = setup();
    await user.click(await search(user));
    expect(await screen.findByRole('heading', { name: 'La Mer', level: 2 })).toBeInTheDocument();
    await user.type(searchbox(), 'x');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'La Mer', level: 2 })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('region', { name: strings.search.label })).toBeInTheDocument();
  });

  it('opens an album detail that replaces the results, and goes back keeping the query', async () => {
    const { user } = setup();
    const albumButton = await search(user);
    await user.click(albumButton);
    expect(await screen.findByRole('heading', { name: 'La Mer', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Debussy')).toBeInTheDocument();
    expect(screen.getByText(`1905 · ${strings.detail.trackCount(2)} · 3:00`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.search.backToResults }));
    expect(searchbox()).toHaveValue('mer');
    expect(screen.getByText('Title t1')).toBeInTheDocument();
  });

  it('adds the whole album at the end or at the start, in order', async () => {
    const { h, user } = setup();
    act(() => h.store.addLast(makeTrack('m')));
    await user.click(await search(user));
    await user.click(await screen.findByRole('button', { name: strings.detail.addAlbumToEnd }));
    expect(titles(h)).toEqual(['Title m', 'Title x1', 'Title x2']);
    await user.click(screen.getByRole('button', { name: strings.detail.addAlbumToStart }));
    expect(titles(h)).toEqual(['Title x1', 'Title x2', 'Title m', 'Title x1', 'Title x2']);
  });

  it('adds one album track with its plus button', async () => {
    const { h, user } = setup();
    await user.click(await search(user));
    await user.click(
      await screen.findByRole('button', { name: strings.search.addTrackToEnd('Title x2') }),
    );
    expect(titles(h)).toEqual(['Title x2']);
  });

  it('shows an error state with retry when the album fails to load', async () => {
    const { h, user } = setup();
    h.provider.albumImpl = () => Promise.reject(new Error('net'));
    await user.click(await search(user));
    expect(
      await screen.findByRole('heading', { name: strings.detail.loadErrorTitle }),
    ).toBeInTheDocument();
    h.provider.albumImpl = () => Promise.resolve(album);
    await user.click(screen.getByRole('button', { name: strings.search.retry }));
    expect(await screen.findByRole('heading', { name: 'La Mer', level: 2 })).toBeInTheDocument();
  });

  it('opens an artist, then one of their albums, and walks back through both', async () => {
    const { user } = setup();
    await search(user);
    await user.click(screen.getByRole('button', { name: strings.search.openArtist('Debussy') }));
    expect(await screen.findByRole('heading', { name: 'Debussy', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('classical')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.search.openAlbum('La Mer') }));
    expect(await screen.findByRole('heading', { name: 'La Mer', level: 2 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.search.backToResults }));
    expect(await screen.findByRole('heading', { name: 'Debussy', level: 2 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.search.backToResults }));
    expect(screen.getByRole('region', { name: strings.search.label })).toBeInTheDocument();
  });

  it('shows artists without genres or albums gracefully', async () => {
    const { h, user } = setup();
    h.provider.artistImpl = () => Promise.resolve({ ...artistSummary, genres: [], albums: [] });
    await search(user);
    await user.click(screen.getByRole('button', { name: strings.search.openArtist('Debussy') }));
    expect(await screen.findByText(strings.detail.noGenres)).toBeInTheDocument();
    expect(screen.getByText(strings.detail.noAlbums)).toBeInTheDocument();
  });
});
