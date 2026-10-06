import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import type { Harness } from '../../state/test-utils/harness';
import { strings } from '../i18n/es';
import { ImportFilesButton } from './ImportFilesButton';
import { renderWithStore } from './test-utils/render';

const titles = (h: Harness) => h.store.getSnapshot().songs.map((s) => s.title);

function setup(seed: string[] = ['a', 'b', 'c']) {
  const view = renderWithStore(<ImportFilesButton />);
  act(() => {
    for (const id of seed) view.h.store.addLast(makeTrack(id));
  });
  view.h.local.nextResult = { tracks: [makeTrack('x'), makeTrack('y')], rejected: [] };
  return { ...view, user: userEvent.setup() };
}

const file = () => new File(['x'], 'x.mp3', { type: 'audio/mpeg' });
const input = () => screen.getByLabelText(strings.library.importInputLabel);
const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: strings.library.importMoreOptions }));

describe('ImportFilesButton', () => {
  it('imports at the end through the main button', async () => {
    const { h, user } = setup();
    const click = vi.spyOn(input() as HTMLInputElement, 'click');
    await user.click(screen.getByRole('button', { name: strings.library.importFiles }));
    expect(click).toHaveBeenCalledTimes(1);
    await user.upload(input(), file());
    await waitFor(() =>
      expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c', 'Title x', 'Title y']),
    );
  });

  it('offers the three placements in the menu', async () => {
    const { user } = setup();
    await openMenu(user);
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items).toEqual([
      strings.library.importAtStart,
      strings.library.importNext,
      strings.library.importAtPosition,
    ]);
  });

  it('imports at the start from the menu', async () => {
    const { h, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: strings.library.importAtStart }));
    await user.upload(input(), file());
    await waitFor(() =>
      expect(titles(h)).toEqual(['Title x', 'Title y', 'Title a', 'Title b', 'Title c']),
    );
    expect(h.notifier.notices).toContain(strings.library.importedAtStart(2));
  });

  it('imports after the current song from the menu', async () => {
    const { h, user } = setup();
    act(() => h.store.playEntry(h.store.getSnapshot().songs[0]?.entryId ?? ''));
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: strings.library.importNext }));
    await user.upload(input(), file());
    await waitFor(() =>
      expect(titles(h)).toEqual(['Title a', 'Title x', 'Title y', 'Title b', 'Title c']),
    );
  });

  it('asks for a position first, then opens the picker and imports there', async () => {
    const { h, user } = setup();
    await openMenu(user);
    await user.click(
      await screen.findByRole('menuitem', { name: strings.library.importAtPosition }),
    );
    const dialog = await screen.findByRole('dialog', { name: strings.library.importAtTitle });
    expect(within(dialog).getByText(strings.library.importPlaceholder)).toBeInTheDocument();
    const click = vi.spyOn(input() as HTMLInputElement, 'click');
    const position = within(dialog).getByRole('textbox', { name: strings.add.positionLabel });
    await user.clear(position);
    await user.type(position, '2');
    await user.click(within(dialog).getByRole('button', { name: strings.library.importConfirm }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.upload(input(), file());
    await waitFor(() =>
      expect(titles(h)).toEqual(['Title a', 'Title x', 'Title y', 'Title b', 'Title c']),
    );
    expect(h.notifier.notices).toContain(strings.library.importedAt(2, 2));
  });

  it('cancelling the position dialog never opens the picker', async () => {
    const { h, user } = setup();
    await openMenu(user);
    await user.click(
      await screen.findByRole('menuitem', { name: strings.library.importAtPosition }),
    );
    const click = vi.spyOn(input() as HTMLInputElement, 'click');
    await user.click(await screen.findByRole('button', { name: strings.dialog.cancel }));
    expect(click).not.toHaveBeenCalled();
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title c']);
  });

  it('the placement resets to the end after each use', async () => {
    const { h, user } = setup(['a']);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: strings.library.importAtStart }));
    await user.upload(input(), file());
    await waitFor(() => expect(titles(h)).toHaveLength(3));
    h.local.nextResult = { tracks: [makeTrack('z')], rejected: [] };
    await user.upload(input(), file());
    await waitFor(() => expect(titles(h).at(-1)).toBe('Title z'));
  });
});
