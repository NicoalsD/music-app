import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import { spotifyTrack } from '../../state/test-utils/harness';
import type { Harness } from '../../state/test-utils/harness';
import { strings } from '../i18n/es';
import { AlbumTrackRow, TrackResultRow } from './TrackRows';
import { renderWithStore } from './test-utils/render';

const titles = (h: Harness) => h.store.getSnapshot().songs.map((s) => s.title);
const track = spotifyTrack('t1', 61_000);
const playButton = () => screen.getByRole('button', { name: strings.add.playTrack('Title t1') });

function renderRow() {
  const view = renderWithStore(<TrackResultRow track={track} />);
  return { ...view, user: userEvent.setup() };
}

describe('TrackResultRow', () => {
  it('names the cover, title and meta area "Reproducir {title}" and shows the title text', () => {
    renderRow();
    const button = playButton();
    expect(within(button).getByText('Title t1')).toBeInTheDocument();
    expect(within(button).getByText(/Artist/)).toBeInTheDocument();
  });

  it('plays the song right now when its title is clicked', async () => {
    const { h, user } = renderRow();
    await user.click(screen.getByText('Title t1'));
    await act(settle);
    expect(titles(h)).toEqual(['Title t1']);
    expect(h.store.getSnapshot().player.status).toBe('playing');
  });

  it('plays with Enter and Space on the focused button', async () => {
    const { h, user } = renderRow();
    playButton().focus();
    await user.keyboard('{Enter}');
    await act(settle);
    expect(h.store.getSnapshot().player.status).toBe('playing');
    await user.keyboard(' ');
    await act(settle);
    expect(titles(h)).toEqual(['Title t1']);
  });

  it('adds the song once when the title is double clicked', async () => {
    const { h, user } = renderRow();
    act(() => h.store.addLast(makeTrack('other')));
    await user.dblClick(screen.getByText('Title t1'));
    await act(settle);
    expect(titles(h).filter((t) => t === 'Title t1')).toHaveLength(1);
    expect(h.store.getSnapshot().player.status).toBe('playing');
  });

  it('plays when a quiet part of the row is double clicked, once', async () => {
    const { h, user, container } = renderRow();
    act(() => h.store.addLast(makeTrack('other')));
    const duration = container.querySelector('[class*="duration"]');
    expect(duration).not.toBeNull();
    await user.dblClick(duration as Element);
    await act(settle);
    expect(titles(h).filter((t) => t === 'Title t1')).toHaveLength(1);
  });

  it('does not play when a button inside the row is double clicked', async () => {
    const { h, user } = renderRow();
    await user.dblClick(screen.getByRole('button', { name: strings.add.addToEnd }));
    expect(titles(h)).toEqual(['Title t1', 'Title t1']);
    expect(h.store.getSnapshot().player.status).not.toBe('playing');
  });

  it('marks the current song with an equalizer, hidden text and aria-current', async () => {
    const { h } = renderRow();
    expect(screen.queryByTestId('equalizer')).not.toBeInTheDocument();
    act(() => h.store.addLast(track));
    expect(playButton()).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(strings.add.nowPlayingTag)).toBeInTheDocument();
    expect(screen.getByTestId('equalizer')).toHaveAttribute('data-animated', 'false');
    act(() => h.store.togglePlay());
    await act(settle);
    expect(screen.getByTestId('equalizer')).toHaveAttribute('data-animated', 'true');
  });

  it('opens the same actions in a context menu on right click', async () => {
    const { user } = renderRow();
    await user.pointer({ keys: '[MouseRight]', target: playButton() });
    const menu = await screen.findByRole('menu');
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(names).toEqual([
      strings.add.playNow,
      strings.add.playNext,
      strings.favorites.likeShort,
      strings.add.addToStart,
      strings.add.addToEnd,
      strings.add.insertAt,
      strings.add.addToPlaylist,
    ]);
  });

  it('likes from the context menu and shows the filled heart on the row', async () => {
    const { h, user } = renderRow();
    await user.pointer({ keys: '[MouseRight]', target: playButton() });
    await user.click(await screen.findByRole('menuitem', { name: strings.favorites.likeShort }));
    expect(h.store.getSnapshot().favoriteTrackIds.size).toBe(1);
    const [likedId] = [...h.store.getSnapshot().favoriteTrackIds];
    expect(likedId).toBeDefined();
    expect(screen.getByRole('button', { name: /de Favoritos$/ })).toHaveAttribute(
      'data-liked',
      'true',
    );
  });

  it('plays from the context menu', async () => {
    const { h, user } = renderRow();
    await user.pointer({ keys: '[MouseRight]', target: playButton() });
    await user.click(await screen.findByRole('menuitem', { name: strings.add.playNow }));
    await act(settle);
    expect(titles(h)).toEqual(['Title t1']);
    expect(h.store.getSnapshot().player.status).toBe('playing');
  });

  it('still offers the visible "Al final" button and the more-actions menu', async () => {
    const { h, user } = renderRow();
    await user.click(screen.getByRole('button', { name: strings.add.addToEnd }));
    expect(titles(h)).toEqual(['Title t1']);
    expect(
      screen.getByRole('button', { name: strings.add.moreActions('Title t1') }),
    ).toBeInTheDocument();
  });
});

describe('AlbumTrackRow', () => {
  it('shows the number and plays when the title is clicked', async () => {
    const { h } = renderWithStore(<AlbumTrackRow track={track} number={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText('Title t1'));
    await act(settle);
    expect(titles(h)).toEqual(['Title t1']);
    expect(h.store.getSnapshot().player.status).toBe('playing');
  });

  it('keeps double click from queuing the track twice', () => {
    const { h } = renderWithStore(<AlbumTrackRow track={track} number={1} />);
    const row = playButton().parentElement as HTMLElement;
    fireEvent.doubleClick(row.querySelector('[class*="duration"]') as Element);
    expect(titles(h)).toEqual(['Title t1']);
  });
});
