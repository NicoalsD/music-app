import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../core/test-utils/fakes';
import { createHarness, spotifyTrack } from '../state/test-utils/harness';
import { strings } from '../ui/i18n/es';
import { FakeLyricsProvider } from '../state/test-utils/FakeLyricsProvider';
import { App } from './App';

function appHeader(): HTMLElement {
  const header = screen.getByRole('heading', { level: 1 }).closest('header');
  if (header === null) throw new Error('missing header');
  return header;
}

function setup() {
  const h = createHarness();
  const view = render(<App store={h.store} lyricsProvider={new FakeLyricsProvider()} />);
  return { ...view, h, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

/** Opens the playlist view through the library sidebar. */
async function openPlaylistView(user: User, name = 'Mi lista') {
  await user.click(
    screen.getByRole('button', {
      name: new RegExp(`^${strings.sidebar.openPlaylist(name, '').replace(/, $/, '')}`),
    }),
  );
}

describe('App', () => {
  it('composes the top bar, library sidebar, home view and player bar', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: strings.app.name })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: strings.search.label })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: strings.player.barLabel })).toBeInTheDocument();
    const header = within(appHeader());
    expect(header.getByRole('button', { name: strings.spotify.connect })).toBeInTheDocument();
    expect(header.getByRole('button', { name: strings.nav.homeButton })).toBeInTheDocument();
    const sidebar = within(screen.getByRole('complementary', { name: strings.nav.library }));
    expect(sidebar.getByRole('button', { name: strings.library.importFiles })).toBeInTheDocument();
    expect(sidebar.getByRole('heading', { name: strings.nav.library })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText(strings.home.emptyTitle)).toBeInTheDocument();
  });

  it('the player bar cover opens the now playing state', async () => {
    const { h, user } = setup();
    act(() => h.store.addLast(makeTrack('a')));
    const shell = screen.getByRole('main').parentElement;
    expect(shell).toHaveAttribute('data-now-playing', 'false');
    await user.click(screen.getByRole('button', { name: strings.nowPlaying.open }));
    expect(shell).toHaveAttribute('data-now-playing', 'true');
  });

  it('bottom nav switches between home, search and the library', async () => {
    const { user } = setup();
    const nav = within(screen.getByRole('navigation', { name: strings.nav.mobileLabel }));
    const home = nav.getByRole('button', { name: strings.nav.home });
    const searchItem = nav.getByRole('button', { name: strings.nav.search });
    const library = nav.getByRole('button', { name: strings.nav.library });
    expect(home).toHaveAttribute('aria-current', 'page');
    await user.click(library);
    expect(library).toHaveAttribute('aria-current', 'page');
    expect(home).not.toHaveAttribute('aria-current');
    await openPlaylistView(user);
    expect(screen.getByRole('region', { name: strings.playlist.title })).toBeInTheDocument();
    expect(library).toHaveAttribute('aria-current', 'page');
    await user.click(searchItem);
    expect(searchItem).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    await user.click(home);
    expect(home).toHaveAttribute('aria-current', 'page');
  });

  it('clicking the read-only search field while logged out shows how to connect', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('searchbox'));
    expect(screen.getByRole('region', { name: strings.search.label })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: strings.search.loggedOutTitle }),
    ).toBeInTheDocument();
  });

  it('sets the document title while playing and restores it', async () => {
    const { h } = setup();
    expect(document.title).toBe(strings.app.name);
    act(() => h.store.addLast(makeTrack('a')));
    await act(async () => h.store.togglePlay());
    await waitFor(() => expect(document.title).toBe('▶ Title a · Artist'));
    await act(async () => h.store.togglePlay());
    await waitFor(() => expect(document.title).toBe(strings.app.name));
  });

  it('omits the artist from the title when there is none', async () => {
    const { h } = setup();
    act(() => h.store.addLast({ ...makeTrack('a'), artists: [] }));
    await act(async () => h.store.togglePlay());
    await waitFor(() => expect(document.title).toBe('▶ Title a'));
  });

  it('opens the shortcuts dialog with ? and from the header button', async () => {
    const { user } = setup();
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: strings.shortcuts.title });
    expect(within(dialog).getAllByRole('term')).toHaveLength(strings.shortcuts.items.length);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: strings.shortcuts.open }));
    expect(
      await screen.findByRole('dialog', { name: strings.shortcuts.title }),
    ).toBeInTheDocument();
  });

  it('slash focuses the search input and switches to the search view', async () => {
    const { h, user } = setup();
    act(() => {
      h.auth.loggedIn = true;
      h.auth.emit('logged-in');
    });
    await openPlaylistView(user);
    await user.keyboard('/');
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    const sidebar = within(screen.getByRole('complementary', { name: strings.nav.library }));
    expect(sidebar.getByRole('button', { name: strings.nav.search })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('region', { name: strings.search.label })).toBeInTheDocument();
  });

  it('shortcuts are ignored while typing in the search input', async () => {
    const { h, user } = setup();
    act(() => {
      h.auth.loggedIn = true;
      h.auth.emit('logged-in');
      h.store.addLast(makeTrack('a'));
    });
    await user.click(screen.getByRole('searchbox'));
    await user.keyboard(' msr/?');
    expect(screen.getByRole('searchbox')).toHaveValue(' msr/?');
    expect(h.store.getSnapshot().player.status).toBe('idle');
    expect(h.store.getSnapshot().player.muted).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the empty playlist search action focuses the search', async () => {
    const { h, user } = setup();
    act(() => {
      h.auth.loggedIn = true;
      h.auth.emit('logged-in');
    });
    await openPlaylistView(user);
    await user.click(screen.getByRole('button', { name: strings.playlist.emptyAction }));
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('shows Spotify status and a disconnect action when logged in', async () => {
    const { h, user } = setup();
    act(() => {
      h.auth.loggedIn = true;
      h.auth.emit('logged-in');
      h.spotify.setStatus('ready');
    });
    const group = screen.getByRole('group', { name: strings.spotify.statusLabel });
    expect(within(group).getByText(strings.spotify.status.ready)).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: strings.spotify.disconnect }));
    expect(
      within(appHeader()).getByRole('button', { name: strings.spotify.connect }),
    ).toBeInTheDocument();
  });

  it('labels a connected session before the player reports ready, and flags problems', () => {
    const { h } = setup();
    act(() => {
      h.auth.loggedIn = true;
      h.auth.emit('logged-in');
    });
    expect(screen.getByText(strings.spotify.connected)).toBeInTheDocument();
    act(() => h.spotify.setStatus('no-premium'));
    expect(screen.getByText(strings.spotify.status['no-premium'])).toBeInTheDocument();
  });

  it('imports dropped audio files at the end of the list', async () => {
    const { h, user } = setup();
    await openPlaylistView(user);
    h.local.nextResult = { tracks: [makeTrack('d1')], rejected: [] };
    const panel = screen.getByRole('region', { name: strings.playlist.title });
    const file = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });
    const data = { types: ['Files'], files: [file] };
    fireEvent.dragEnter(panel, { dataTransfer: data });
    expect(screen.getByText(strings.playlist.dropTitle)).toBeInTheDocument();
    fireEvent.dragOver(panel, { dataTransfer: data });
    fireEvent.dragLeave(panel, { dataTransfer: data });
    expect(screen.queryByText(strings.playlist.dropTitle)).not.toBeInTheDocument();
    fireEvent.dragEnter(panel, { dataTransfer: data });
    await act(async () => {
      fireEvent.drop(panel, { dataTransfer: data });
    });
    expect(screen.queryByText(strings.playlist.dropTitle)).not.toBeInTheDocument();
    expect(h.store.getSnapshot().songs.map((s) => s.title)).toEqual(['Title d1']);
  });

  it('ignores drags that are not files and drops without files', async () => {
    const { h, user } = setup();
    await openPlaylistView(user);
    const panel = screen.getByRole('region', { name: strings.playlist.title });
    fireEvent.dragEnter(panel, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.queryByText(strings.playlist.dropTitle)).not.toBeInTheDocument();
    fireEvent.dragLeave(panel, { dataTransfer: { types: ['text/plain'], files: [] } });
    fireEvent.drop(panel, { dataTransfer: { types: ['text/plain'], files: [] } });
    fireEvent.drop(panel, { dataTransfer: { types: ['Files'], files: [] } });
    expect(h.store.getSnapshot().songs).toHaveLength(0);
  });

  it('imports files chosen with the picker', async () => {
    const { h, user } = setup();
    h.local.nextResult = { tracks: [makeTrack('p1'), spotifyTrack('p2')], rejected: [] };
    const input = screen.getAllByLabelText(strings.library.importInputLabel)[0] as HTMLInputElement;
    await user.upload(input, new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
    await waitFor(() => expect(h.store.getSnapshot().songs).toHaveLength(2));
  });

  it('does nothing when the picker is cancelled', () => {
    const { h } = setup();
    const input = screen.getAllByLabelText(strings.library.importInputLabel)[0] as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(h.store.getSnapshot().songs).toHaveLength(0);
  });

  it('the import button opens the file picker', async () => {
    const { user } = setup();
    const input = screen.getAllByLabelText(strings.library.importInputLabel)[0] as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await user.click(
      screen.getAllByRole('button', { name: strings.library.importFiles })[0] as HTMLElement,
    );
    expect(click).toHaveBeenCalled();
  });
});
