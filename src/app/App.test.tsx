import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../core/test-utils/fakes';
import { createHarness, spotifyTrack } from '../state/test-utils/harness';
import { strings } from '../ui/i18n/es';
import { App } from './App';

function appHeader(): HTMLElement {
  const header = screen.getByRole('heading', { level: 1 }).closest('header');
  if (header === null) throw new Error('missing header');
  return header;
}

function setup() {
  const h = createHarness();
  const view = render(<App store={h.store} />);
  return { ...view, h, user: userEvent.setup() };
}

describe('App', () => {
  it('composes header, search, playlist and player bar', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: strings.app.name })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: strings.search.label })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: strings.playlist.title })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: strings.player.barLabel })).toBeInTheDocument();
    const header = within(appHeader());
    expect(header.getByRole('button', { name: strings.library.importFiles })).toBeInTheDocument();
    expect(header.getByRole('button', { name: strings.spotify.connect })).toBeInTheDocument();
  });

  it('offers the mobile tabs and switches between panels', async () => {
    const { user } = setup();
    const tabs = screen.getByRole('tablist', { name: strings.layout.tabsLabel });
    const search = within(tabs).getByRole('tab', { name: strings.layout.tabSearch });
    const list = within(tabs).getByRole('tab', { name: strings.layout.tabPlaylist });
    expect(search).toHaveAttribute('aria-selected', 'true');
    await user.click(list);
    expect(list).toHaveAttribute('aria-selected', 'true');
    expect(search).toHaveAttribute('aria-selected', 'false');
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

  it('slash focuses the search input and switches to the search tab', async () => {
    const { h, user } = setup();
    act(() => {
      h.auth.loggedIn = true;
      h.auth.emit('logged-in');
    });
    await user.click(screen.getByRole('tab', { name: strings.layout.tabPlaylist }));
    await user.keyboard('/');
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    expect(screen.getByRole('tab', { name: strings.layout.tabSearch })).toHaveAttribute(
      'aria-selected',
      'true',
    );
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
    const { h } = setup();
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
    const { h } = setup();
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
