import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { serializeState } from '../../state/persistence';
import { createHarness, spotifyTrack } from '../../state/test-utils/harness';
import type { Harness } from '../../state/test-utils/harness';
import { PlaylistLibrary } from '../../core/PlaylistLibrary';
import { CounterIds, FakeClock } from '../../core/test-utils/fakes';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import { strings } from '../i18n/es';
import { PlaylistView } from './PlaylistView';
import { renderWithStore } from './test-utils/render';

function seed(h: Harness, ...ids: string[]) {
  for (const id of ids) h.store.addLast(makeTrack(id));
}

const titles = (h: Harness) => h.store.getSnapshot().songs.map((s) => s.title);

function renderList(ids: string[] = ['a', 'b', 'c'], options: { realToasts?: boolean } = {}) {
  const onGoToSearch = vi.fn();
  const view = renderWithStore(<PlaylistView onGoToSearch={onGoToSearch} />, options);
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
    renderWithStore(<PlaylistView onGoToSearch={() => undefined} />, { harness: h });
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
    expect(await screen.findByText(strings.playlist.dndMoved('Title a', 1, 3))).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByText(strings.playlist.dndCancelled('Title a'))).toBeInTheDocument();
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
    expect(
      await screen.findByText(strings.playlist.dndDropped('Title a', 2, 3)),
    ).toBeInTheDocument();
  });

  describe('move to position', () => {
    const openMove = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
      await user.click(screen.getByRole('button', { name: strings.playlist.rowMenuNamed(title) }));
      await user.click(await screen.findByRole('menuitem', { name: strings.playlist.moveTo }));
      return screen.findByRole('dialog', { name: strings.playlist.moveTitle });
    };

    it('moves the last song to position 1 and previews its new neighbours', async () => {
      const { h, user } = renderList();
      const dialog = await openMove(user, 'Title c');
      const input = within(dialog).getByRole('textbox', { name: strings.add.positionLabel });
      expect(input).toHaveValue('3');
      await user.clear(input);
      await user.type(input, '1');
      const preview = within(dialog).getByRole('list', { name: strings.insert.previewLabel });
      expect(
        within(preview)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([`Title c${strings.insert.previewNew}`, 'Title a']);
      await user.click(within(dialog).getByRole('button', { name: strings.playlist.moveConfirm }));
      expect(titles(h)).toEqual(['Title c', 'Title a', 'Title b']);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('only accepts positions 1..size', async () => {
      const { h, user } = renderList();
      const dialog = await openMove(user, 'Title a');
      const input = within(dialog).getByRole('textbox', { name: strings.add.positionLabel });
      await user.clear(input);
      await user.type(input, '4');
      expect(
        within(dialog).getByRole('button', { name: strings.playlist.moveConfirm }),
      ).toBeDisabled();
      expect(within(dialog).getByText(strings.insert.errorRange(3))).toBeInTheDocument();
      await user.clear(input);
      await user.type(input, '3{Enter}');
      expect(titles(h)).toEqual(['Title b', 'Title c', 'Title a']);
    });

    it('is disabled with a single song', async () => {
      const { user } = renderList(['a']);
      await user.click(
        screen.getByRole('button', { name: strings.playlist.rowMenuNamed('Title a') }),
      );
      expect(
        await screen.findByRole('menuitem', { name: strings.playlist.moveTo }),
      ).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
