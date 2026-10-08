import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { DndUiContext } from '../dnd/dndContext';
import { strings } from '../i18n/es';
import { LibrarySidebar } from './LibrarySidebar';
import type { SidebarSection } from './LibrarySidebar';
import { renderWithStore } from './test-utils/render';

function setup(section: SidebarSection = 'home') {
  const onGoHome = vi.fn();
  const onGoSearch = vi.fn();
  const onOpenPlaylist = vi.fn();
  const view = renderWithStore(
    <LibrarySidebar
      section={section}
      onGoHome={onGoHome}
      onGoSearch={onGoSearch}
      onOpenPlaylist={onOpenPlaylist}
    />,
  );
  return { ...view, onGoHome, onGoSearch, onOpenPlaylist, user: userEvent.setup() };
}

const entry = (name: string, count = strings.playlist.songCount(0)) =>
  screen.getByRole('button', { name: strings.sidebar.openPlaylist(name, count) });

const names = (h: ReturnType<typeof setup>['h']) =>
  h.store.getSnapshot().playlists.map((p) => p.name);

describe('LibrarySidebar', () => {
  it('lists the playlists with their song count and marks the active one', async () => {
    const { h } = setup();
    await act(async () => {
      h.store.addLast(makeTrack('a'));
      await h.store.createPlaylist('Rock');
    });
    expect(entry('Mi lista', strings.playlist.songCount(1))).not.toHaveAttribute('aria-current');
    expect(entry('Rock')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(strings.sidebar.activeKanji)).toBeInTheDocument();
  });

  it('marks the current compact nav item', () => {
    setup('search');
    const nav = within(screen.getByRole('navigation', { name: strings.nav.primaryLabel }));
    expect(nav.getByRole('button', { name: strings.nav.search })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.getByRole('button', { name: strings.nav.home })).not.toHaveAttribute('aria-current');
  });

  it('calls the nav callbacks', async () => {
    const { onGoHome, onGoSearch, user } = setup();
    await user.click(screen.getByRole('button', { name: strings.nav.home }));
    await user.click(screen.getByRole('button', { name: strings.nav.search }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(onGoSearch).toHaveBeenCalledTimes(1);
  });

  it('opens a playlist when its entry is clicked', async () => {
    const { h, onOpenPlaylist, user } = setup();
    await act(() => h.store.createPlaylist('Rock'));
    onOpenPlaylist.mockClear();
    const first = h.store.getSnapshot().playlists[0];
    await user.click(entry('Mi lista'));
    expect(onOpenPlaylist).toHaveBeenCalledWith(first?.id);
  });

  it('creates a playlist from the Crear button, validating the name, and opens it', async () => {
    const { h, onOpenPlaylist, user } = setup();
    await user.click(screen.getByRole('button', { name: strings.sidebar.createLabel }));
    const dialog = await screen.findByRole('dialog', { name: strings.playlist.create });
    const input = within(dialog).getByRole('textbox', { name: strings.playlist.nameLabelNew });
    await user.type(input, '{Enter}');
    expect(within(dialog).getByText(strings.playlist.nameEmpty)).toBeInTheDocument();
    expect(names(h)).toEqual(['Mi lista']);
    await user.type(input, '  Jazz  ');
    await user.click(within(dialog).getByRole('button', { name: strings.playlist.createConfirm }));
    await act(async () => undefined);
    expect(names(h)).toEqual(['Mi lista', 'Jazz']);
    expect(h.store.getSnapshot().activePlaylistName).toBe('Jazz');
    expect(onOpenPlaylist).toHaveBeenCalledWith(h.store.getSnapshot().activePlaylistId);
    expect(entry('Jazz')).toBeInTheDocument();
  });

  it('renames the playlist whose menu was opened, not the active one', async () => {
    const { h, user } = setup();
    await act(() => h.store.createPlaylist('Rock'));
    await user.click(screen.getByRole('button', { name: strings.sidebar.options('Mi lista') }));
    await user.click(await screen.findByRole('menuitem', { name: strings.playlist.rename }));
    const dialog = await screen.findByRole('dialog', { name: strings.playlist.rename });
    const input = within(dialog).getByRole('textbox', { name: strings.playlist.nameLabelRename });
    expect(input).toHaveValue('Mi lista');
    await user.clear(input);
    await user.type(input, 'Favoritas');
    await user.click(within(dialog).getByRole('button', { name: strings.playlist.save }));
    expect(names(h)).toEqual(['Favoritas', 'Rock']);
    expect(h.store.getSnapshot().activePlaylistName).toBe('Rock');
  });

  it('confirms before deleting a non-active playlist, and keeps the active one', async () => {
    const { h, user } = setup();
    await act(() => h.store.createPlaylist('Rock'));
    await user.click(screen.getByRole('button', { name: strings.sidebar.options('Mi lista') }));
    await user.click(await screen.findByRole('menuitem', { name: strings.playlist.delete }));
    const dialog = await screen.findByRole('dialog', { name: strings.playlist.deleteConfirmTitle });
    expect(
      within(dialog).getByText(strings.playlist.deleteConfirmBody('Mi lista')),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: strings.dialog.cancel }));
    expect(names(h)).toEqual(['Mi lista', 'Rock']);

    await user.click(screen.getByRole('button', { name: strings.sidebar.options('Mi lista') }));
    await user.click(await screen.findByRole('menuitem', { name: strings.playlist.delete }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: strings.playlist.deleteConfirmAction,
      }),
    );
    await act(async () => undefined);
    expect(names(h)).toEqual(['Rock']);
    expect(h.store.getSnapshot().activePlaylistName).toBe('Rock');
  });

  it('disables delete while only one playlist exists', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: strings.sidebar.options('Mi lista') }));
    const del = await screen.findByRole('menuitem', { name: strings.playlist.delete });
    expect(del).toHaveAttribute('aria-disabled', 'true');
  });

  it('offers the file import in the footer', () => {
    setup();
    expect(screen.getByRole('button', { name: strings.library.importFiles })).toBeInTheDocument();
  });

  describe('as a drop target for dragged songs', () => {
    function renderDragging(activeKind: 'track' | 'entry' | null) {
      return renderWithStore(
        <DndUiContext value={{ activeKind, insertion: null, overPlaylistId: null }}>
          <LibrarySidebar
            section="home"
            onGoHome={vi.fn()}
            onGoSearch={vi.fn()}
            onOpenPlaylist={vi.fn()}
          />
        </DndUiContext>,
      );
    }

    it('marks every playlist as ready (dashed outline) while a search song is dragged', () => {
      renderDragging('track');
      expect(entry('Mi lista')).toHaveAttribute('data-drop', 'ready');
    });

    it('stays idle when nothing, or a playlist row, is dragged', () => {
      const { unmount } = renderDragging(null);
      expect(entry('Mi lista')).toHaveAttribute('data-drop', 'idle');
      unmount();
      renderDragging('entry');
      expect(entry('Mi lista')).toHaveAttribute('data-drop', 'idle');
    });
  });
});
