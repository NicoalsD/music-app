import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, SongView } from '../../state';
import { strings } from '../i18n/es';
import { useAnnounce } from './dndContext';
import type { DragScope } from './dragData';

export type MoveTarget = 'up' | 'down' | 'first' | 'last';

/**
 * The index a row ends up at for a move, or null when it would not move.
 * `min` is the lowest index the row may take (the queue cannot move above the current song).
 */
export function resolveMove(
  index: number,
  size: number,
  target: MoveTarget,
  min = 0,
): number | null {
  const last = size - 1;
  let to: number;
  switch (target) {
    case 'up':
      to = Math.max(index - 1, min);
      break;
    case 'down':
      to = Math.min(index + 1, last);
      break;
    case 'first':
      to = min;
      break;
    case 'last':
      to = last;
      break;
  }
  return to === index || index < min ? null : to;
}

interface KeyLike {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** Alt+ArrowUp/ArrowDown move one step; Alt+Home/End go to the first or last place. */
export function moveTargetForKey(event: KeyLike): MoveTarget | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  switch (event.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;

export interface EntryMover {
  /** Moves an entry, announces it and (for keyboard moves) keeps focus on the row. */
  moveEntry(entryId: string, target: MoveTarget, options?: { keepFocus?: boolean }): void;
  /** Row key handler: returns true when it handled an Alt+Arrow/Home/End move. */
  onRowKeyDown(entryId: string, event: KeyboardEvent): boolean;
}

/** Row focus target: the element carrying `data-row-main` inside the row for this entry. */
export function focusRow(scope: DragScope, entryId: string): void {
  const key = `${scope}:${entryId}`;
  for (const row of document.querySelectorAll<HTMLElement>('[data-entry-key]')) {
    if (row.dataset['entryKey'] !== key) continue;
    row.querySelector<HTMLElement>('[data-row-main]')?.focus();
    return;
  }
}

export function useEntryMover(scope: DragScope): EntryMover {
  const store = useStore();
  const announce = useAnnounce();
  const songs = usePlayerSnapshot(selectSongs);
  const pendingFocus = useRef<string | null>(null);

  // Re-focus after the list re-rendered in its new order (React may have moved the DOM node).
  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    focusRow(scope, id);
  }, [songs, scope]);

  const moveEntry = useCallback(
    (entryId: string, target: MoveTarget, options: { keepFocus?: boolean } = {}) => {
      const snapshot = store.getSnapshot();
      const index = snapshot.songs.findIndex((song) => song.entryId === entryId);
      const song = snapshot.songs[index];
      if (song === undefined) return;
      const min = scope === 'queue' ? snapshot.currentIndex + 1 : 0;
      const to = resolveMove(index, snapshot.songs.length, target, min);
      if (to === null) return;
      if (options.keepFocus === true) pendingFocus.current = entryId;
      store.move(index, to);
      announce(strings.playlist.movedTo(song.title, to + 1, snapshot.songs.length));
    },
    [store, announce, scope],
  );

  const onRowKeyDown = useCallback(
    (entryId: string, event: KeyboardEvent): boolean => {
      const target = moveTargetForKey(event.nativeEvent);
      if (target === null || event.defaultPrevented) return false;
      event.preventDefault();
      event.stopPropagation();
      moveEntry(entryId, target, { keepFocus: true });
      return true;
    },
    [moveEntry],
  );

  return { moveEntry, onRowKeyDown };
}
