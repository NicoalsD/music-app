import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import type { AlbumDetail, ArtistDetail, SearchResults } from '../../providers/MusicProvider';
import { spotifyTrack } from '../../state/test-utils/harness';
import { strings } from '../i18n/es';
import { useSearch, useStore } from '../../state';
import { SearchField } from './SearchField';
import { SearchPanel } from './SearchPanel';
import type { SearchPanelProps } from './SearchPanel';
import { renderWithStore } from './test-utils/render';

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

/** What the shell does: the top bar field drives the search state shown by the panel. */
function Harness({
  onOpenAlbum,
  onOpenArtist,
}: Pick<SearchPanelProps, 'onOpenAlbum' | 'onOpenArtist'>) {
  const store = useStore();
  const search = useSearch(store.provider);
  return (
    <>
      <SearchField text={search.text} onTextChange={search.setText} onActivate={() => undefined} />
      <SearchPanel search={search} onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} />
    </>
  );
}

function setup(options: { loggedIn?: boolean } = {}) {
  const onOpenAlbum = vi.fn();
  const onOpenArtist = vi.fn();
  const view = renderWithStore(<Harness onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} />);
  view.h.provider.searchImpl = () => Promise.resolve(results);
  view.h.provider.albumImpl = () => Promise.resolve(album);
  view.h.provider.artistImpl = () => Promise.resolve(artist);
  if (options.loggedIn !== false) {
    act(() => {
      view.h.auth.loggedIn = true;
      view.h.auth.emit('logged-in');
    });
  }
  return { ...view, onOpenAlbum, onOpenArtist, user: userEvent.setup() };
}

const searchbox = () => screen.getByRole('searchbox', { name: strings.search.label });

async function search(user: ReturnType<typeof userEvent.setup>, text = 'mer') {
  await user.type(searchbox(), text);
  return screen.findByRole('button', { name: strings.search.openAlbum('La Mer') });
}

const titles = (h: ReturnType<typeof setup>['h']) =>
  h.store.getSnapshot().songs.map((s) => s.title);

describe('SearchPanel', () => {
  it('prompts to connect Spotify when logged out and mentions local files', async () => {
    const { h, user } = setup({ loggedIn: false });
    expect(
      screen.getByRole('heading', { name: strings.search.loggedOutTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(strings.search.localNote)).toBeInTheDocument();
    expect(searchbox()).toHaveAttribute('readonly');
    expect(h.provider.searches).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: strings.spotify.connect }));
    expect(h.auth.loginCalls).toBe(1);
  });

  it('shows the initial prompt, the filters and a clear button', async () => {
    const { user } = setup();
    expect(screen.getByRole('heading', { name: strings.search.emptyTitle })).toBeInTheDocument();
    expect(searchbox()).toHaveAttribute('placeholder', strings.search.placeholder);
    expect(
      screen.getByRole('radiogroup', { name: strings.search.filtersLabel }),
    ).toBeInTheDocument();
    await user.type(searchbox(), 'abc');
    await user.click(screen.getByRole('button', { name: strings.search.clear }));
    expect(searchbox()).toHaveValue('');
  });

  it('groups results into artists, albums and tracks with title, artists and album', async () => {
    const { user } = setup();
    await search(user);
    expect(
      screen.getByRole('heading', { name: strings.search.sectionArtists }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.search.sectionAlbums })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.search.sectionTracks })).toBeInTheDocument();
    expect(screen.getByText('Title t1')).toBeInTheDocument();
    expect(screen.getAllByText('Artist · Album')).toHaveLength(2);
    expect(screen.getByText('1:01')).toBeInTheDocument();
  });

  it('adds a track at the end with the primary button', async () => {
    const { h, user } = setup();
    await search(user);
    await user.click(
      screen.getAllByRole('button', { name: strings.add.addToEnd })[0] as HTMLElement,
    );
    expect(titles(h)).toEqual(['Title t1']);
  });

  it('offers play now, play next, start, end and insert at in the actions menu', async () => {
    const { h, user } = setup();
    await search(user);
    const open = () =>
      user.click(screen.getByRole('button', { name: strings.add.moreActions('Title t1') }));

    await open();
    await user.click(await screen.findByRole('menuitem', { name: strings.add.addToEnd }));
    await open();
    await user.click(await screen.findByRole('menuitem', { name: strings.add.addToStart }));
    expect(titles(h)).toEqual(['Title t1', 'Title t1']);

    await open();
    await user.click(await screen.findByRole('menuitem', { name: strings.add.playNext }));
    expect(titles(h)).toHaveLength(3);

    await open();
    await user.click(await screen.findByRole('menuitem', { name: strings.add.playNow }));
    expect(titles(h)).toHaveLength(4);
    expect(h.store.getSnapshot().player.status).toBe('playing');
  });

  it('inserts at a chosen position through the dialog', async () => {
    const { h, user } = setup();
    act(() => {
      h.store.addLast(makeTrack('a'));
      h.store.addLast(makeTrack('b'));
    });
    await search(user);
    await user.click(screen.getByRole('button', { name: strings.add.moreActions('Title t2') }));
    await user.click(await screen.findByRole('menuitem', { name: strings.add.insertAt }));
    const dialog = await screen.findByRole('dialog', { name: strings.insert.title });
    const input = within(dialog).getByRole('textbox', { name: strings.add.positionLabel });
    await user.clear(input);
    await user.type(input, '2');
    await user.click(within(dialog).getByRole('button', { name: strings.add.confirm }));
    expect(titles(h)).toEqual(['Title a', 'Title t2', 'Title b']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('applies the filter and asks the provider for that type only', async () => {
    const { h, user } = setup();
    await search(user);
    await user.click(screen.getByRole('radio', { name: strings.search.filters.songs }));
    await screen.findByText('Title t1');
    expect(h.provider.searches.at(-1)?.types).toEqual(['track']);
    expect(
      screen.queryByRole('heading', { name: strings.search.sectionAlbums }),
    ).not.toBeInTheDocument();
  });

  it('shows artists and albums filters as their own sections', async () => {
    const { user } = setup();
    await search(user);
    await user.click(screen.getByRole('radio', { name: strings.search.filters.artists }));
    expect(
      await screen.findByRole('button', { name: strings.search.openArtist('Debussy') }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: strings.search.filters.albums }));
    expect(
      await screen.findByRole('button', { name: strings.search.openAlbum('La Mer') }),
    ).toBeInTheDocument();
  });

  it('shows loading, then the no-results state', async () => {
    const { h, user } = setup();
    h.provider.searchImpl = () =>
      Promise.resolve({ tracks: [], artists: [], albums: [], hasMore: false });
    await user.type(searchbox(), 'zzz');
    expect(screen.getByRole('status', { name: strings.search.loading })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: strings.search.noResults('zzz') }),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    const { h, user } = setup();
    h.provider.searchImpl = () => Promise.reject(new Error('net'));
    await user.type(searchbox(), 'abc');
    expect(
      await screen.findByRole('heading', { name: strings.search.errorTitle }),
    ).toBeInTheDocument();
    h.provider.searchImpl = () => Promise.resolve(results);
    await user.click(screen.getByRole('button', { name: strings.search.retry }));
    expect(await screen.findByText('Title t1')).toBeInTheDocument();
  });

  it('loads more results with the "Cargar más" button', async () => {
    const { h, user } = setup();
    h.provider.searchImpl = (query) =>
      Promise.resolve(
        query.page === 0
          ? { tracks: [spotifyTrack('p0')], artists: [], albums: [], hasMore: true }
          : { tracks: [spotifyTrack('p1')], artists: [], albums: [], hasMore: false },
      );
    await user.type(searchbox(), 'abc');
    await user.click(await screen.findByRole('button', { name: strings.search.loadMore }));
    expect(await screen.findByText('Title p1')).toBeInTheDocument();
    expect(screen.getByText('Title p0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.search.loadMore })).not.toBeInTheDocument();
  });

  it('reports the album or artist the user opens', async () => {
    const { onOpenAlbum, onOpenArtist, user } = setup();
    await search(user);
    await user.click(screen.getByRole('button', { name: strings.search.openArtist('Debussy') }));
    expect(onOpenArtist).toHaveBeenCalledWith(artistSummary);
    await user.click(screen.getByRole('button', { name: strings.search.openAlbum('La Mer') }));
    expect(onOpenAlbum).toHaveBeenCalledWith(albumSummary);
  });

  it('marks explicit tracks', async () => {
    const { h, user } = setup();
    h.provider.searchImpl = () =>
      Promise.resolve({
        ...results,
        tracks: [{ ...spotifyTrack('e'), explicit: true, album: { id: null, name: '' } }],
      });
    await search(user);
    expect(screen.getByRole('img', { name: strings.search.explicit })).toBeInTheDocument();
  });
});
