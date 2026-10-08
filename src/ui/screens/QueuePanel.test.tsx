import { act, createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import type { Harness } from '../../state/test-utils/harness';
import { AppDndProvider } from '../dnd/AppDndProvider';
import { strings } from '../i18n/es';
import { QueuePanel } from './QueuePanel';
import { renderWithStore } from './test-utils/render';

const titles = (h: Harness) => h.store.getSnapshot().songs.map((s) => s.title);

function renderQueue(ids: string[] = ['a', 'b', 'c', 'd']) {
  const view = renderWithStore(
    <AppDndProvider>
      <QueuePanel />
    </AppDndProvider>,
  );
  act(() => {
    for (const id of ids) view.h.store.addLast(makeTrack(id));
  });
  return { ...view, user: userEvent.setup() };
}

const playButton = (title: string) =>
  screen.getByRole('button', { name: strings.queue.playSong(title) });

describe('QueuePanel', () => {
  beforeEach(() => {
    // jsdom has no layout: give every list item a 60px slot by its position so drag math works.
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

  it('shows a hint to drag songs in when the list is empty', () => {
    renderQueue([]);
    expect(screen.getByRole('heading', { name: strings.queue.title })).toBeInTheDocument();
    expect(screen.getByText(strings.queue.emptyTitle)).toBeInTheDocument();
  });

  it('shows the current song first, then the rest in list order', () => {
    renderQueue();
    const now = screen.getByRole('region', { name: strings.queue.nowPlaying });
    expect(within(now).getByText('Title a')).toBeInTheDocument();
    expect(playButton('Title a')).toHaveAttribute('aria-current', 'true');
    const next = screen.getByRole('region', { name: strings.queue.upNext });
    expect(
      within(next)
        .getAllByRole('listitem')
        .map((li) => within(li).getByText(/^Title/).textContent),
    ).toEqual(['Title b', 'Title c', 'Title d']);
  });

  it('shows only what follows the current song', async () => {
    const { h } = renderQueue();
    act(() => h.store.playEntry(h.store.getSnapshot().songs[2]?.entryId ?? ''));
    await act(settle);
    const next = screen.getByRole('region', { name: strings.queue.upNext });
    expect(within(next).getAllByRole('listitem')).toHaveLength(1);
    expect(within(next).getByText('Title d')).toBeInTheDocument();
    expect(playButton('Title c')).toHaveAttribute('aria-current', 'true');
  });

  it('shows an empty hint when nothing follows the current song', () => {
    renderQueue(['a']);
    expect(screen.getByText(strings.queue.upNextEmpty)).toBeInTheDocument();
  });

  it('plays a song on click', async () => {
    const { h, user } = renderQueue();
    await user.click(playButton('Title c'));
    expect(h.store.getSnapshot().songs[2]?.isCurrent).toBe(true);
  });

  it('moves a queued song with Alt+Arrow and keeps focus, but never above the current song', async () => {
    const { h, user } = renderQueue();
    playButton('Title b').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c', 'Title d']);
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(titles(h)).toEqual(['Title a', 'Title c', 'Title b', 'Title d']);
    expect(await screen.findByText(strings.playlist.movedTo('Title b', 3, 4))).toBeInTheDocument();
    await waitFor(() => expect(playButton('Title b')).toHaveFocus());
    await user.keyboard('{Alt>}{Home}{/Alt}');
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c', 'Title d']);
  });

  it('offers move items in the row menu and disables the ones that cannot apply', async () => {
    const { h, user } = renderQueue();
    await user.click(screen.getByRole('button', { name: strings.queue.rowMenuNamed('Title b') }));
    expect(
      await screen.findByRole('menuitem', { name: strings.playlist.moveUpItem }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: strings.playlist.moveLastItem }));
    expect(titles(h)).toEqual(['Title a', 'Title c', 'Title d', 'Title b']);
  });

  it('removes the current song from its menu', async () => {
    const { h, user } = renderQueue();
    await user.click(screen.getByRole('button', { name: strings.queue.rowMenuNamed('Title a') }));
    expect(screen.queryByRole('menuitem', { name: strings.playlist.moveDownItem })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('menuitem', { name: strings.playlist.removeSong }));
    expect(titles(h)).toEqual(['Title b', 'Title c', 'Title d']);
  });

  it('removes a queued song with Delete', async () => {
    const { h, user } = renderQueue();
    playButton('Title c').focus();
    await user.keyboard('{Delete}');
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title d']);
  });

  it('reorders with the keyboard drag handle', async () => {
    const { h, user } = renderQueue();
    const handle = screen.getByRole('button', {
      name: strings.queue.dragHandleNamed('Title b'),
    });
    handle.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    await waitFor(() => expect(titles(h)).toEqual(['Title a', 'Title c', 'Title b', 'Title d']));
  });

  it('imports dropped files after the current song when dropped above the first queued row', async () => {
    const { h, container } = renderQueue();
    h.local.nextResult = { tracks: [makeTrack('x')], rejected: [] };
    const zone = container.querySelector('[data-file-over]') as Element;
    const files = [new File(['x'], 'x.mp3', { type: 'audio/mpeg' })];
    const event = createEvent.drop(zone, { dataTransfer: { types: ['Files'], files } });
    Object.defineProperty(event, 'clientY', { value: -10 });
    fireEvent(zone, event);
    await waitFor(() =>
      expect(titles(h)).toEqual(['Title a', 'Title x', 'Title b', 'Title c', 'Title d']),
    );
  });
});
