import { useEffect } from 'react';
import { useStore } from '../../state';

export const SEEK_STEP_MS = 5000;

export interface ShortcutActions {
  onFocusSearch: () => void;
  onShowHelp: () => void;
}

const INTERACTIVE =
  'button, a[href], summary, select, [role="button"], [role="slider"], [role="tab"], [role="menuitem"]';
// The Now Playing view is a dialog too, but it is the player itself, so shortcuts stay active in it.
const OVERLAYS =
  '[role="dialog"]:not([data-now-playing-view]), [role="alertdialog"], [role="menu"]';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null
  );
}

/**
 * Global keyboard shortcuts (music-player-guide section 12). Ignored while typing,
 * inside dialogs and menus, with modifier keys, and when a widget already handled the key.
 * Registered in the bubble phase so widgets (slider, tabs) can claim their arrow keys first.
 */
export function useGlobalShortcuts({ onFocusSearch, onShowHelp }: ShortcutActions): void {
  const store = useStore();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const { target } = event;
      if (isEditable(target)) return;
      if (target instanceof HTMLElement && target.closest(OVERLAYS) !== null) return;

      switch (event.key) {
        case ' ':
          // Space on a focused control activates that control instead.
          if (target instanceof HTMLElement && target.closest(INTERACTIVE) !== null) return;
          event.preventDefault();
          store.togglePlay();
          return;
        case 'ArrowRight':
        case 'ArrowLeft': {
          const forward = event.key === 'ArrowRight';
          event.preventDefault();
          if (event.shiftKey) {
            if (forward) store.next();
            else store.previous();
          } else {
            store.seek(store.getProgress().positionMs + (forward ? SEEK_STEP_MS : -SEEK_STEP_MS));
          }
          return;
        }
        case 'm':
        case 'M':
          store.toggleMute();
          return;
        case 's':
        case 'S':
          store.toggleShuffle();
          return;
        case 'r':
        case 'R':
          store.cycleRepeat();
          return;
        case '/':
          event.preventDefault();
          onFocusSearch();
          return;
        case '?':
          event.preventDefault();
          onShowHelp();
          return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store, onFocusSearch, onShowHelp]);
}
