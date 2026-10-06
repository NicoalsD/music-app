import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { strings } from '../i18n/es';
import { InsertAtDialog } from './InsertAtDialog';
import { renderWithStore } from './test-utils/render';
import type { Harness } from '../../state/test-utils/harness';

const incoming = makeTrack('new');

function seed(h: Harness, ...ids: string[]) {
  for (const id of ids) h.store.addLast(makeTrack(id));
}

function titles(h: Harness): string[] {
  return h.store.getSnapshot().songs.map((s) => s.title);
}

async function openWith(ids: string[]) {
  const onOpenChange = vi.fn();
  const view = renderWithStore(
    <InsertAtDialog track={incoming} open onOpenChange={onOpenChange} />,
    {},
  );
  seed(view.h, ...ids);
  // Re-render with the seeded list so the initial position is the end.
  view.unmount();
  const again = renderWithStore(
    <InsertAtDialog track={incoming} open onOpenChange={onOpenChange} />,
    {
      harness: view.h,
    },
  );
  return { ...again, onOpenChange, user: userEvent.setup() };
}

const input = () => screen.getByRole('textbox', { name: strings.add.positionLabel });
const confirm = () => screen.getByRole('button', { name: strings.add.confirm });

describe('InsertAtDialog', () => {
  it('starts at the end position and previews the neighbours', async () => {
    await openWith(['a', 'b']);
    expect(input()).toHaveValue('3');
    const preview = screen.getByRole('list', { name: strings.insert.previewLabel });
    expect(
      within(preview)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Title b', `Title new${strings.insert.previewNew}`]);
  });

  it('inserts at the typed 1-based position as a 0-based index', async () => {
    const { h, user, onOpenChange } = await openWith(['a', 'b', 'c']);
    await user.clear(input());
    await user.type(input(), '2');
    const preview = screen.getByRole('list', { name: strings.insert.previewLabel });
    expect(
      within(preview)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Title a', `Title new${strings.insert.previewNew}`, 'Title b']);
    await user.click(confirm());
    expect(titles(h)).toEqual(['Title a', 'Title new', 'Title b', 'Title c']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Inicio and Final shortcuts reach both extremes', async () => {
    const { h, user } = await openWith(['a', 'b']);
    await user.click(screen.getByRole('button', { name: strings.insert.start }));
    expect(input()).toHaveValue('1');
    await user.click(confirm());
    expect(titles(h)).toEqual(['Title new', 'Title a', 'Title b']);
  });

  it('Final inserts after the last song', async () => {
    const { h, user } = await openWith(['a', 'b']);
    await user.click(screen.getByRole('button', { name: strings.insert.start }));
    await user.click(screen.getByRole('button', { name: strings.insert.end }));
    expect(input()).toHaveValue('3');
    await user.click(confirm());
    expect(titles(h)).toEqual(['Title a', 'Title b', 'Title new']);
  });

  it('steps with the minus and plus buttons and clamps at the bounds', async () => {
    const { user } = await openWith(['a', 'b']);
    await user.click(screen.getByRole('button', { name: strings.insert.increase }));
    expect(input()).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: strings.insert.decrease }));
    await user.click(screen.getByRole('button', { name: strings.insert.decrease }));
    await user.click(screen.getByRole('button', { name: strings.insert.decrease }));
    expect(input()).toHaveValue('1');
  });

  it('recovers stepping from an invalid text value', async () => {
    const { user } = await openWith(['a', 'b']);
    await user.clear(input());
    await user.click(screen.getByRole('button', { name: strings.insert.increase }));
    expect(input()).toHaveValue('1');
    await user.clear(input());
    await user.click(screen.getByRole('button', { name: strings.insert.decrease }));
    expect(input()).toHaveValue('3');
  });

  it.each([
    ['0', strings.insert.errorRange(3)],
    ['4', strings.insert.errorRange(3)],
    ['1.5', strings.insert.errorNotInteger],
    ['abc', strings.insert.errorNotInteger],
  ])('disables confirm and explains an invalid position (%s)', async (typed, message) => {
    const { user } = await openWith(['a', 'b']);
    await user.clear(input());
    await user.type(input(), typed);
    expect(confirm()).toBeDisabled();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: strings.insert.previewLabel }),
    ).not.toBeInTheDocument();
  });

  it('asks for a value when the field is empty', async () => {
    const { user } = await openWith(['a']);
    await user.clear(input());
    expect(confirm()).toBeDisabled();
    expect(screen.getByText(strings.insert.errorEmpty)).toBeInTheDocument();
  });

  it('into an empty list only position 1 is valid and the preview says so', async () => {
    const { h, user } = await openWith([]);
    expect(input()).toHaveValue('1');
    expect(screen.getByText(strings.insert.previewEmpty)).toBeInTheDocument();
    await user.click(confirm());
    expect(titles(h)).toEqual(['Title new']);
  });

  it('submits with Enter and closes with cancel', async () => {
    const { h, user, onOpenChange } = await openWith(['a']);
    await user.type(input(), '{Enter}');
    expect(titles(h)).toEqual(['Title a', 'Title new']);
    onOpenChange.mockClear();
    await user.click(screen.getByRole('button', { name: strings.dialog.cancel }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Enter with an invalid value does nothing', async () => {
    const { h, user } = await openWith(['a']);
    await user.clear(input());
    await user.type(input(), '9{Enter}');
    expect(titles(h)).toEqual(['Title a']);
  });
});
