import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { strings } from '../i18n/es';
import { FavoriteButton } from './FavoriteButton';
import { renderWithStore } from './test-utils/render';

describe('FavoriteButton', () => {
  it('likes a catalog track and then offers to remove it', async () => {
    const user = userEvent.setup();
    const track = makeTrack('a');
    const { h } = renderWithStore(<FavoriteButton track={track} />);
    const like = screen.getByRole('button', { name: strings.favorites.like('Title a') });
    expect(like).toHaveAttribute('data-liked', 'false');
    await user.click(like);
    expect(h.store.getSnapshot().favoriteTrackIds.has('a')).toBe(true);
    const unlike = screen.getByRole('button', { name: strings.favorites.unlike('Title a') });
    expect(unlike).toHaveAttribute('data-liked', 'true');
    await user.click(unlike);
    expect(h.store.getSnapshot().favoriteTrackIds.has('a')).toBe(false);
  });

  it('follows likes made elsewhere', () => {
    const track = makeTrack('a');
    const { h } = renderWithStore(<FavoriteButton track={track} />);
    act(() => h.store.toggleFavorite(track));
    expect(
      screen.getByRole('button', { name: strings.favorites.unlike('Title a') }),
    ).toBeInTheDocument();
  });

  it('likes an entry of the active playlist by its entry id', async () => {
    const user = userEvent.setup();
    const { h } = renderWithStore(<></>);
    act(() => h.store.addLast(makeTrack('a')));
    const song = h.store.getSnapshot().songs[0];
    if (song === undefined) throw new Error('missing song');
    renderWithStore(<FavoriteButton entry={song} />, { harness: h });
    await user.click(screen.getByRole('button', { name: strings.favorites.like('Title a') }));
    expect(h.store.getSnapshot().favoriteTrackIds.has('a')).toBe(true);
  });

  it('can hide itself until hover unless the track is liked', () => {
    const track = makeTrack('a');
    const { h } = renderWithStore(<FavoriteButton track={track} reveal="hover" />);
    const button = screen.getByRole('button', { name: strings.favorites.like('Title a') });
    expect(button).toHaveAttribute('data-reveal', 'hover');
    act(() => h.store.toggleFavorite(track));
    expect(
      screen.getByRole('button', { name: strings.favorites.unlike('Title a') }),
    ).toHaveAttribute('data-liked', 'true');
  });
});
