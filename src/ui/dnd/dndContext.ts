import { createContext, use } from 'react';
import type { DragScope } from './dragData';

export interface Insertion {
  readonly scope: DragScope;
  readonly index: number;
}

/** What is being dragged right now. Changes while dragging, so only drop targets read it. */
export interface DndUiState {
  readonly activeKind: 'entry' | 'track' | null;
  /** Where a dragged catalog track would land (a preview for the insertion line). */
  readonly insertion: Insertion | null;
  /** The sidebar playlist under the pointer while dragging a track. */
  readonly overPlaylistId: string | null;
}

export const IDLE_DND_STATE: DndUiState = {
  activeKind: null,
  insertion: null,
  overPlaylistId: null,
};

export const DndUiContext = createContext<DndUiState>(IDLE_DND_STATE);

export interface DndApi {
  /** Speaks a message through the polite live region. */
  announce(message: string): void;
}

export const DndApiContext = createContext<DndApi>({ announce: () => undefined });

/** Where a file dragged from the OS would land in the nearest list zone. */
export const FileDropContext = createContext<number | null>(null);

export function useDndUi(): DndUiState {
  return use(DndUiContext);
}

export function useAnnounce(): (message: string) => void {
  return use(DndApiContext).announce;
}

/** The index at which the insertion line shows in `scope`, for a dragged track or a dropped file. */
export function useInsertionIndex(scope: DragScope): number | null {
  const ui = use(DndUiContext);
  const file = use(FileDropContext);
  if (file !== null) return file;
  return ui.insertion !== null && ui.insertion.scope === scope ? ui.insertion.index : null;
}
