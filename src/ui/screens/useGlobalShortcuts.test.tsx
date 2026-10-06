import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTrack } from '../../core/test-utils/fakes';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import { PlayerBar } from './PlayerBar';
import { renderWithStore } from './test-utils/render';
import { useGlobalShortcuts } from './useGlobalShortcuts';

function Host({
  onFocusSearch,
  onShowHelp,
}: {
  onFocusSearch: () => void;
  onShowHelp: () => void;
}) {
  useGlobalShortcuts({ onFocusSearch, onShowHelp });
  return (
    <div>
      <input aria-label="Buscar" />
      <textarea aria-label="Notas" />
      <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editable" />
      <button type="button">Otro botón</button>
      <PlayerBar />
    </div>
  );
}

function setup() {
  const onFocusSearch = vi.fn();
  const onShowHelp = vi.fn();
  const view = renderWithStore(<Host onFocusSearch={onFocusSearch} onShowHelp={onShowHelp} />);
  act(() => {
    view.h.store.addLast(makeTrack('a', 60_000));
    view.h.store.addLast(makeTrack('b', 60_000));
  });
  return { ...view, onFocusSearch, onShowHelp, user: userEvent.setup() };
}

describe('global keyboard shortcuts', () => {
  it('Space toggles play and pause', async () => {
    const { h, user } = setup();
    await user.keyboard(' ');
    expect(h.store.getSnapshot().player.status).toBe('playing');
    await user.keyboard(' ');
    expect(h.store.getSnapshot().player.status).toBe('paused');
  });

  it('Space on a focused button activates only that button', async () => {
    const { h, user } = setup();
    screen.getByRole('button', { name: 'Otro botón' }).focus();
    await user.keyboard(' ');
    expect(h.store.getSnapshot().player.status).toBe('idle');
  });

  it('Shift+arrows go to the next and previous song', async () => {
    const { h, user } = setup();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(h.store.getSnapshot().songs[1]?.isCurrent).toBe(true);
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(h.store.getSnapshot().songs[0]?.isCurrent).toBe(true);
  });

  it('arrows seek by 5 seconds', async () => {
    const { h, user } = setup();
    await user.keyboard(' ');
    await act(async () => {
      h.localOutput.emit({ type: 'progress', positionMs: 10_000, durationMs: 60_000 });
    });
    await user.keyboard('{ArrowRight}');
    expect(h.localOutput.calls).toContain('seek:15000');
    await user.keyboard('{ArrowLeft}');
    await act(settle);
    expect(h.localOutput.calls).toContain('seek:10000');
  });

  it('M, S and R mute, shuffle and cycle repeat', async () => {
    const { h, user } = setup();
    await user.keyboard('m');
    expect(h.store.getSnapshot().player.muted).toBe(true);
    await user.keyboard('S');
    expect(h.store.getSnapshot().player.shuffle).toBe(true);
    await user.keyboard('r');
    expect(h.store.getSnapshot().player.repeat).toBe('all');
  });

  it('slash focuses the search and question mark opens the help', async () => {
    const { onFocusSearch, onShowHelp, user } = setup();
    await user.keyboard('/');
    expect(onFocusSearch).toHaveBeenCalledTimes(1);
    await user.keyboard('?');
    expect(onShowHelp).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['input', () => screen.getByRole('textbox', { name: 'Buscar' })],
    ['textarea', () => screen.getByRole('textbox', { name: 'Notas' })],
    ['contenteditable', () => screen.getByRole('textbox', { name: 'Editable' })],
  ])('is ignored while typing in a %s', async (_name, getTarget) => {
    const { h, onFocusSearch, onShowHelp, user } = setup();
    const target = getTarget();
    target.focus();
    await user.keyboard(' msr/?');
    await user.keyboard('{ArrowRight}{Shift>}{ArrowRight}{/Shift}');
    const s = h.store.getSnapshot();
    expect(s.player.status).toBe('idle');
    expect(s.player.muted).toBe(false);
    expect(s.player.shuffle).toBe(false);
    expect(s.player.repeat).toBe('off');
    expect(s.songs[0]?.isCurrent).toBe(true);
    expect(onFocusSearch).not.toHaveBeenCalled();
    expect(onShowHelp).not.toHaveBeenCalled();
  });

  it('is ignored when another handler already prevented the event', () => {
    const { h } = setup();
    const button = screen.getByRole('button', { name: 'Otro botón' });
    button.addEventListener('keydown', (e) => e.preventDefault());
    fireEvent.keyDown(button, { key: 'm' });
    expect(h.store.getSnapshot().player.muted).toBe(false);
  });

  it('is ignored with modifier keys and inside dialogs', () => {
    const { h } = setup();
    fireEvent.keyDown(document.body, { key: 'm', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'm', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'm', altKey: true });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inner = document.createElement('button');
    dialog.appendChild(inner);
    document.body.appendChild(dialog);
    fireEvent.keyDown(inner, { key: 'm' });
    dialog.remove();
    expect(h.store.getSnapshot().player.muted).toBe(false);
  });

  it('ignores unknown keys and handles keydowns that do not come from an element', () => {
    const { h } = setup();
    fireEvent.keyDown(document.body, { key: 'x' });
    fireEvent.keyDown(window, { key: 'm' });
    expect(h.store.getSnapshot().player.muted).toBe(true);
    expect(h.store.getSnapshot().player.status).toBe('idle');
  });

  it('stops listening after unmount', () => {
    const { h, unmount } = setup();
    unmount();
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(h.store.getSnapshot().player.muted).toBe(false);
  });
});
