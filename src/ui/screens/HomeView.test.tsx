import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { strings } from '../i18n/es';
import { HomeView } from './HomeView';
import { RECENT_COUNT, greetingFor } from './homeData';
import { renderWithStore } from './test-utils/render';

function setup(hour = 9) {
  const onOpenPlaylist = vi.fn();
  const onGoToSearch = vi.fn();
  const view = renderWithStore(
    <HomeView onOpenPlaylist={onOpenPlaylist} onGoToSearch={onGoToSearch} hour={hour} />,
  );
  return { ...view, onOpenPlaylist, onGoToSearch, user: userEvent.setup() };
}

describe('greetingFor', () => {
  it.each([
    [6, strings.home.greetingMorning],
    [12, strings.home.greetingMorning],
    [13, strings.home.greetingAfternoon],
    [19, strings.home.greetingAfternoon],
    [20, strings.home.greetingEvening],
    [3, strings.home.greetingEvening],
  ])('at %i o clock says %s', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });
});

describe('HomeView', () => {
  it('shows the greeting and an empty state with search and import actions', async () => {
    const { onGoToSearch, user } = setup(21);
    expect(
      screen.getByRole('heading', { level: 2, name: strings.home.greetingEvening }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings.home.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.library.importFiles })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: strings.home.continueTitle }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: strings.home.emptySearch }));
    expect(onGoToSearch).toHaveBeenCalledTimes(1);
  });

  it('continues with the current song and toggles playback', async () => {
    const { h, user } = setup();
    act(() => {
      h.store.addLast(makeTrack('a'));
      h.store.addLast(makeTrack('b'));
    });
    const section = within(screen.getByRole('region', { name: strings.home.continueTitle }));
    expect(section.getByText('Title a')).toBeInTheDocument();
    await user.click(section.getByRole('button', { name: strings.player.play }));
    expect(h.store.getSnapshot().player.status).not.toBe('idle');
    expect(await section.findByRole('button', { name: strings.player.pause })).toBeInTheDocument();
  });

  it('opens the active playlist from "Ver en la lista"', async () => {
    const { h, onOpenPlaylist, user } = setup();
    act(() => h.store.addLast(makeTrack('a')));
    await user.click(screen.getByRole('button', { name: strings.home.openInList }));
    expect(onOpenPlaylist).toHaveBeenCalledWith(h.store.getSnapshot().activePlaylistId);
  });

  it('shows one tile per playlist, marks the active one and opens it', async () => {
    const { h, onOpenPlaylist, user } = setup();
    await act(async () => {
      h.store.addLast(makeTrack('a'));
      await h.store.createPlaylist('Rock');
    });
    const tiles = within(screen.getByRole('region', { name: strings.home.playlistsTitle }));
    const rock = tiles.getByRole('button', {
      name: strings.home.openPlaylistTile('Rock', strings.playlist.songCount(0)),
    });
    expect(rock).toHaveAttribute('aria-current', 'true');
    expect(within(rock).getByText(strings.home.activeBadge)).toBeInTheDocument();
    const first = tiles.getByRole('button', {
      name: strings.home.openPlaylistTile('Mi lista', strings.playlist.songCount(1)),
    });
    expect(first).not.toHaveAttribute('aria-current');
    await user.click(first);
    expect(onOpenPlaylist).toHaveBeenCalledWith(h.store.getSnapshot().playlists[0]?.id);
  });

  it('lists the latest additions first, capped, and plays one on click', async () => {
    const { h, user } = setup();
    act(() => {
      for (let i = 0; i < RECENT_COUNT + 2; i += 1) h.store.addLast(makeTrack(`s${i}`));
    });
    const recent = within(screen.getByRole('region', { name: strings.home.recentTitle }));
    const rows = recent.getAllByRole('button');
    expect(rows).toHaveLength(RECENT_COUNT);
    expect(rows[0]).toHaveAccessibleName(
      strings.playlist.playSongNamed(`Title s${RECENT_COUNT + 1}`),
    );
    await user.click(rows[1] as HTMLElement);
    expect(h.store.getSnapshot().currentIndex).toBe(RECENT_COUNT);
  });
});
