import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { strings } from '../i18n/es';
import { PlaylistSwitcher } from './PlaylistSwitcher';
import { renderWithStore } from './test-utils/render';

function setup() {
  const view = renderWithStore(<PlaylistSwitcher />);
  return { ...view, user: userEvent.setup() };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: new RegExp(strings.playlist.switcherLabel) }),
  );
  return screen.findByRole('menu');
}

const names = (h: ReturnType<typeof setup>['h']) =>
  h.store.getSnapshot().playlists.map((p) => p.name);

describe('PlaylistSwitcher', () => {
  it('shows the active playlist name on the trigger and lists all playlists with a checkmark on the active one', async () => {
    const { h, user } = setup();
    await act(() => h.store.createPlaylist('Rock'));
    await act(async () => h.store.switchPlaylist(h.store.getSnapshot().playlists[0]?.id ?? ''));
    expect(screen.getByRole('button', { name: /Mi lista/ })).toBeInTheDocument();
    const menu = await openMenu(user);
    const radios = within(menu).getAllByRole('menuitemradio');
    expect(radios.map((r) => r.textContent)).toEqual([
      `Mi lista${strings.playlist.songCount(0)}`,
      `Rock${strings.playlist.songCount(0)}`,
    ]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('switches playlist from the menu', async () => {
    const { h, user } = setup();
    await act(async () => {
      h.store.addLast(makeTrack('a'));
      await h.store.createPlaylist('Rock');
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitemradio', { name: /Mi lista/ }));
    expect(h.store.getSnapshot().activePlaylistName).toBe('Mi lista');
    expect(h.store.getSnapshot().songs).toHaveLength(1);
  });

  it('creates a playlist through the dialog and makes it active', async () => {
    const { h, user } = setup();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: strings.playlist.create }));
    const dialog = await screen.findByRole('dialog', { name: strings.playlist.create });
    await user.type(
      within(dialog).getByRole('textbox', { name: strings.playlist.nameLabelNew }),
      '  Jazz  ',
    );
    await user.click(within(dialog).getByRole('button', { name: strings.playlist.createConfirm }));
    expect(names(h)).toEqual(['Mi lista', 'Jazz']);
    expect(h.store.getSnapshot().activePlaylistName).toBe('Jazz');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates the name: empty is rejected and more than 60 characters is flagged', async () => {
    const { h, user } = setup();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: strings.playlist.create }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('textbox');
    await user.type(input, '{Enter}');
    expect(within(dialog).getByText(strings.playlist.nameEmpty)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(names(h)).toEqual(['Mi lista']);
    await user.type(input, 'x'.repeat(61));
    expect(within(dialog).getByText(strings.playlist.nameTooLong(60))).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: strings.playlist.createConfirm }),
    ).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'x'.repeat(60));
    expect(
      within(dialog).getByRole('button', { name: strings.playlist.createConfirm }),
    ).toBeEnabled();
  });

  it('cancels the dialog without creating anything', async () => {
    const { h, user } = setup();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: strings.playlist.create }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: strings.dialog.cancel }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(names(h)).toEqual(['Mi lista']);
  });

  it('renames the active playlist, prefilled with its current name', async () => {
    const { h, user } = setup();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: strings.playlist.rename }));
    const dialog = await screen.findByRole('dialog', { name: strings.playlist.rename });
    const input = within(dialog).getByRole('textbox', { name: strings.playlist.nameLabelRename });
    expect(input).toHaveValue('Mi lista');
    await user.clear(input);
    await user.type(input, 'Favoritas');
    await user.click(within(dialog).getByRole('button', { name: strings.playlist.save }));
    expect(names(h)).toEqual(['Favoritas']);
    expect(screen.getByRole('button', { name: /Favoritas/ })).toBeInTheDocument();
  });

  it('disables delete while only one playlist exists', async () => {
    const { user } = setup();
    const menu = await openMenu(user);
    const del = within(menu).getByRole('menuitem', { name: strings.playlist.delete });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await user.click(del);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting and then removes the playlist', async () => {
    const { h, user } = setup();
    await act(() => h.store.createPlaylist('Rock'));
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: strings.playlist.delete }));
    const dialog = await screen.findByRole('dialog', { name: strings.playlist.deleteConfirmTitle });
    expect(
      within(dialog).getByText(strings.playlist.deleteConfirmBody('Rock')),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: strings.dialog.cancel }));
    expect(names(h)).toEqual(['Mi lista', 'Rock']);

    const menu2 = await openMenu(user);
    await user.click(within(menu2).getByRole('menuitem', { name: strings.playlist.delete }));
    const dialog2 = await screen.findByRole('dialog');
    await user.click(
      within(dialog2).getByRole('button', { name: strings.playlist.deleteConfirmAction }),
    );
    await act(async () => undefined);
    expect(names(h)).toEqual(['Mi lista']);
    expect(h.store.getSnapshot().activePlaylistName).toBe('Mi lista');
  });
});
