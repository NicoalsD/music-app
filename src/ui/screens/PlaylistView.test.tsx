import { act, createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { serializeState } from '../../state/persistence';
import { createHarness, spotifyTrack } from '../../state/test-utils/harness';
import type { Harness } from '../../state/test-utils/harness';
import { PlaylistLibrary } from '../../core/PlaylistLibrary';
import { CounterIds, FakeClock } from '../../core/test-utils/fakes';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import { AppDndProvider } from '../dnd/AppDndProvider';
import { strings } from '../i18n/es';
import { PlaylistView } from './PlaylistView';
import { renderWithStore } from './test-utils/render';

function seed(h: Harness, ...ids: string[]) {
  for (const id of ids) h.store.addLast(makeTrack(id));
}

const titles = (h: Harness) => h.store.getSnapshot().songs.map((s) => s.title);

function renderList(ids: string[] = ['a', 'b', 'c'], options: { realToasts?: boolean } = {}) {
  const onGoToSearch = vi.fn();
  const view = renderWithStore(
    <AppDndProvider>
      <PlaylistView onGoToSearch={onGoToSearch} />
    </AppDndProvider>,
    options,
  );
  act(() => seed(view.h, ...ids));
  return { ...view, onGoToSearch, user: userEvent.setup() };
}

const rowButton = (title: string) =>
  screen.getByRole('button', { name: strings.playlist.playSongNamed(title) });

describe('PlaylistView', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const li = this.closest('li');
      const siblings = li?.parentElement ? Array.from(li.parentElement.children) : [];
      const i = li === null ? 0 : Math.max(siblings.indexOf(li), 0);
      return {
        x: 0,
        y: i * 60,
        top: i * 60,
        bottom: i * 60 + 60,
        left: 0,
        right: 300,
        width: 300,
        height: 60,
        toJSON: () => ({}),
      };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the empty state with search and import actions', async () => {
    const { onGoToSearch, user } = renderList([]);
    expect(
      screen.getByRole('heading', { name: strings.playlist.emptyWaveTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.library.importFiles })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.playlist.emptyAction }));
    expect(onGoToSearch).toHaveBeenCalledTimes(1);
  });

  it('renders an ordered list of songs with title, artist, album and duration', () => {
    renderList();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0] as HTMLElement).getByText('Title a')).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText('Artist · Album')).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText('0:01')).toBeInTheDocument();
  });

  it('marks the current row: aria-current, one lit lantern and the hanko seal', async () => {
    const { container, h } = renderList();
    expect(rowButton('Title a')).toHaveAttribute('aria-current', 'true');
    expect(rowButton('Title b')).not.toHaveAttribute('aria-current');
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-lit="false"]')).toHaveLength(2);
    expect(screen.getAllByText('再')).toHaveLength(1);
    act(() => h.store.playEntry(h.store.getSnapshot().songs[2]?.entryId ?? ''));
    await act(settle);
    expect(rowButton('Title c')).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByText('再')).toHaveLength(1);
  });

  it('plays a row on click and with Enter', async () => {
    const { h, user } = renderList();
    await user.click(rowButton('Title b'));
    expect(h.store.getSnapshot().currentEntryId).toBe(h.store.getSnapshot().songs[1]?.entryId);
    expect(h.store.getSnapshot().player.status).toBe('playing');
    rowButton('Title c').focus();
    await user.keyboard('{Enter}');
    expect(h.store.getSnapshot().songs[2]?.isCurrent).toBe(true);
  });

  it('removes a row and offers Deshacer in a toast that restores it in place', async () => {
    const { h, user } = renderList(['a', 'b', 'c'], { realToasts: true });
    await user.click(
      screen.getByRole('button', { name: strings.playlist.removeSongNamed('Title b') }),
    );
    expect(titles(h)).toEqual(['Title a', 'Title c']);
    expect(screen.queryByText('Title b')).not.toBeInTheDocument();
    const undo = await screen.findByRole('button', { name: strings.undo.action });
    expect(screen.getByText(strings.add.removed('Title b'))).toBeInTheDocument();
    await user.click(undo);
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c']);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: strings.playlist.playSongNamed('Title b') }),
      ).toBeInTheDocument(),
    );
  });

  it('removes a row from its menu, the path left on narrow screens', async () => {
    const { h, user } = renderList();
    await user.click(
      screen.getByRole('button', { name: strings.playlist.rowMenuNamed('Title b') }),
    );
    await user.click(await screen.findByRole('menuitem', { name: strings.playlist.removeSong }));
    expect(titles(h)).toEqual(['Title a', 'Title c']);
  });

  it('removes the focused row with the Delete key', async () => {
    const { h, user } = renderList();
    rowButton('Title b').focus();
    await user.keyboard('{Delete}');
    expect(titles(h)).toEqual(['Title a', 'Title c']);
  });

  it('ignores Delete when the key was already handled', async () => {
    const { h } = renderList();
    const row = rowButton('Title b');
    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    row.addEventListener('keydown', (e) => e.preventDefault());
    act(() => void row.dispatchEvent(event));
    expect(titles(h)).toHaveLength(3);
  });

  it('shows restored local files as disabled with the re-import hint and skips them', async () => {
    const library = new PlaylistLibrary({ ids: new CounterIds('x'), clock: new FakeClock() });
    library.active.addLast(makeTrack('l1'));
    library.active.addLast(spotifyTrack('s1'));
    const saved = serializeState(library, {
      volume: 1,
      muted: false,
      repeat: 'off',
      shuffle: false,
    });
    const h = createHarness({ saved });
    renderWithStore(
      <AppDndProvider>
        <PlaylistView onGoToSearch={() => undefined} />
      </AppDndProvider>,
      { harness: h },
    );
    const user = userEvent.setup();
    const local = rowButton('Title l1');
    expect(local).toBeDisabled();
    expect(within(local).getByText(strings.library.unavailableHint)).toBeInTheDocument();
    expect(rowButton('Title s1')).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: strings.playlist.removeSongNamed('Title l1') }),
    );
    expect(h.store.getSnapshot().songs).toHaveLength(1);
  });

  it('announces keyboard reordering in Spanish', async () => {
    const { user } = renderList();
    const handle = screen.getByRole('button', {
      name: strings.playlist.dragHandleNamed('Title a'),
    });
    expect(handle).toHaveAttribute('aria-roledescription');
    handle.focus();
    await user.keyboard(' ');
    expect(await screen.findByText(strings.dnd.moved('Title a', 1, 3))).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByText(strings.dnd.cancelled('Title a'))).toBeInTheDocument();
  });

  it('moves a song with the keyboard sensor and calls store.move', async () => {
    const { h, user } = renderList();
    const handle = screen.getByRole('button', {
      name: strings.playlist.dragHandleNamed('Title a'),
    });
    handle.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    await waitFor(() => expect(titles(h)).toEqual(['Title b', 'Title a', 'Title c']));
    expect(await screen.findByText(strings.dnd.dropped('Title a', 2, 3))).toBeInTheDocument();
  });

  describe('moving without dragging', () => {
    const openRowMenu = (user: ReturnType<typeof userEvent.setup>, title: string) =>
      user.click(screen.getByRole('button', { name: strings.playlist.rowMenuNamed(title) }));

    it('moves the last song to the start from the row menu, with no dialog', async () => {
      const { h, user } = renderList();
      await openRowMenu(user, 'Title c');
      await user.click(
        await screen.findByRole('menuitem', { name: strings.playlist.moveFirstItem }),
      );
      expect(titles(h)).toEqual(['Title c', 'Title a', 'Title b']);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        await screen.findByText(strings.playlist.movedTo('Title c', 1, 3)),
      ).toBeInTheDocument();
    });

    it.each([
      ['moveUpItem', 'Title b', ['Title b', 'Title a', 'Title c']],
      ['moveDownItem', 'Title b', ['Title a', 'Title c', 'Title b']],
      ['moveLastItem', 'Title a', ['Title b', 'Title c', 'Title a']],
    ] as const)('"%s" moves %s', async (item, title, expected) => {
      const { h, user } = renderList();
      await openRowMenu(user, title);
      await user.click(await screen.findByRole('menuitem', { name: strings.playlist[item] }));
      expect(titles(h)).toEqual(expected);
    });

    it('disables the moves that cannot happen at the ends and with one song', async () => {
      const { user } = renderList();
      await openRowMenu(user, 'Title a');
      expect(
        await screen.findByRole('menuitem', { name: strings.playlist.moveUpItem }),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('menuitem', { name: strings.playlist.moveFirstItem }),
      ).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByRole('menuitem', { name: strings.playlist.moveDownItem }),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('disables every move for a single song', async () => {
      const { user } = renderList(['a']);
      await openRowMenu(user, 'Title a');
      for (const name of [
        strings.playlist.moveUpItem,
        strings.playlist.moveDownItem,
        strings.playlist.moveFirstItem,
        strings.playlist.moveLastItem,
      ]) {
        expect(await screen.findByRole('menuitem', { name })).toHaveAttribute(
          'aria-disabled',
          'true',
        );
      }
    });
  });

  describe('Alt+Arrow keyboard moves', () => {
    it('Alt+ArrowUp moves the focused row up, announces it and keeps focus on it', async () => {
      const { h, user } = renderList();
      rowButton('Title b').focus();
      await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
      expect(titles(h)).toEqual(['Title b', 'Title a', 'Title c']);
      expect(
        await screen.findByText(strings.playlist.movedTo('Title b', 1, 3)),
      ).toBeInTheDocument();
      await waitFor(() => expect(rowButton('Title b')).toHaveFocus());
    });

    it('Alt+ArrowDown moves one step down', async () => {
      const { h, user } = renderList();
      rowButton('Title a').focus();
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
      expect(titles(h)).toEqual(['Title b', 'Title a', 'Title c']);
      await waitFor(() => expect(rowButton('Title a')).toHaveFocus());
    });

    it('Alt+End and Alt+Home jump to the last and first place', async () => {
      const { h, user } = renderList();
      rowButton('Title a').focus();
      await user.keyboard('{Alt>}{End}{/Alt}');
      expect(titles(h)).toEqual(['Title b', 'Title c', 'Title a']);
      expect(
        await screen.findByText(strings.playlist.movedTo('Title a', 3, 3)),
      ).toBeInTheDocument();
      await waitFor(() => expect(rowButton('Title a')).toHaveFocus());
      await user.keyboard('{Alt>}{Home}{/Alt}');
      expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c']);
    });

    it('does nothing at the ends and without Alt', async () => {
      const { h, user } = renderList();
      rowButton('Title a').focus();
      await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
      await user.keyboard('{ArrowDown}');
      expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c']);
    });
  });

  describe('dropping audio files from the system', () => {
    const files = [new File(['x'], 'x.mp3', { type: 'audio/mpeg' })];
    const dataTransfer = { types: ['Files'], files, dropEffect: 'none' };

    function dragAt(target: Element, type: 'dragOver' | 'drop', clientY: number) {
      const event = createEvent[type](target, { dataTransfer });
      Object.defineProperty(event, 'clientY', { value: clientY });
      fireEvent(target, event);
    }

    it('shows the insertion line where the files will land and imports there', async () => {
      const { h, container } = renderList();
      h.local.nextResult = { tracks: [makeTrack('x')], rejected: [] };
      const zone = container.querySelector('[data-file-over]');
      expect(zone).not.toBeNull();
      // Rows are 60px tall, so y=70 is in the upper half of row 2: it lands at position 2.
      dragAt(zone as Element, 'dragOver', 70);
      const line = screen.getByTestId('insertion-line');
      expect(line.closest('li')).toBe(screen.getAllByRole('listitem')[1]);
      dragAt(zone as Element, 'drop', 70);
      await waitFor(() => expect(titles(h)).toEqual(['Title a', 'Title x', 'Title b', 'Title c']));
      expect(screen.queryByTestId('insertion-line')).not.toBeInTheDocument();
    });

    it('lands at the end when the pointer is below the last row', async () => {
      const { h, container } = renderList();
      h.local.nextResult = { tracks: [makeTrack('x')], rejected: [] };
      const zone = container.querySelector('[data-file-over]') as Element;
      dragAt(zone, 'dragOver', 500);
      expect(screen.getByTestId('insertion-line')).toHaveAttribute('data-edge', 'after');
      dragAt(zone, 'drop', 500);
      await waitFor(() => expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c', 'Title x']));
    });

    it('ignores drags that carry no files', () => {
      const { container } = renderList();
      const zone = container.querySelector('[data-file-over]') as Element;
      const event = createEvent.dragOver(zone, { dataTransfer: { types: ['text/plain'] } });
      fireEvent(zone, event);
      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByTestId('insertion-line')).not.toBeInTheDocument();
    });
  });
});
