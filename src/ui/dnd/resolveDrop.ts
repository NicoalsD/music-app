import type { Track } from '../../core/Song';
import { readDragData } from './dragData';
import type { DragScope } from './dragData';

export interface DropContext {
  /** Entries of the active playlist, in order. */
  readonly songs: readonly { readonly entryId: string }[];
  /** Index of the current song, or -1. */
  readonly currentIndex: number;
}

export interface DropInput {
  /** `active.data.current` from dnd-kit. */
  readonly activeData: unknown;
  /** `over.data.current` from dnd-kit, or undefined when nothing is under the pointer. */
  readonly overData: unknown;
  /** Rect of the hovered droppable, to decide before or after its middle. */
  readonly overRect: { readonly top: number; readonly height: number } | null;
  /** Client Y of the pointer, when the drag was started with a pointer. */
  readonly pointerY: number | null;
}

export type DropResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'reorder'; readonly from: number; readonly to: number }
  | {
      readonly kind: 'insert';
      readonly index: number;
      readonly scope: DragScope;
      readonly track: Track;
    }
  | {
      readonly kind: 'add-to-playlist';
      readonly playlistId: string;
      readonly name: string;
      readonly track: Track;
    };

const NONE: DropResult = { kind: 'none' };

/** Pure decision of what dropping `active` over `over` means. Used for the preview and the drop. */
export function resolveDrop(input: DropInput, context: DropContext): DropResult {
  const active = readDragData(input.activeData);
  const over = readDragData(input.overData);
  if (active === null || over === null) return NONE;
  const size = context.songs.length;

  if (active.type === 'entry') {
    const from = context.songs.findIndex((song) => song.entryId === active.entryId);
    if (from === -1) return NONE;
    let to = -1;
    if (over.type === 'entry') {
      to = context.songs.findIndex((song) => song.entryId === over.entryId);
    } else if (over.type === 'zone') {
      to = size - 1;
    } else if (over.type === 'zone-current') {
      if (from < context.currentIndex) to = context.currentIndex;
      else if (from > context.currentIndex) to = context.currentIndex + 1;
    }
    return to === -1 || to === from ? NONE : { kind: 'reorder', from, to };
  }

  if (active.type !== 'track') return NONE;

  if (over.type === 'playlist') {
    return {
      kind: 'add-to-playlist',
      playlistId: over.playlistId,
      name: over.name,
      track: active.track,
    };
  }
  if (over.type === 'entry') {
    const overIndex = context.songs.findIndex((song) => song.entryId === over.entryId);
    if (overIndex === -1) return NONE;
    const after =
      input.pointerY !== null &&
      input.overRect !== null &&
      input.pointerY > input.overRect.top + input.overRect.height / 2;
    return {
      kind: 'insert',
      index: overIndex + (after ? 1 : 0),
      scope: over.scope,
      track: active.track,
    };
  }
  if (over.type === 'zone-current') {
    const index = context.currentIndex === -1 ? size : context.currentIndex + 1;
    return { kind: 'insert', index, scope: over.scope, track: active.track };
  }
  if (over.type === 'zone') {
    return { kind: 'insert', index: size, scope: over.scope, track: active.track };
  }
  return NONE;
}

/** The store actions a drop can trigger. */
export interface DropActions {
  move(from: number, to: number): void;
  addAt(index: number, track: Track): void;
  addToPlaylist(playlistId: string, track: Track): void;
}

/** Applies a drop result. Exported so the provider and the tests share the same dispatch. */
export function applyDrop(result: DropResult, actions: DropActions): void {
  switch (result.kind) {
    case 'reorder':
      actions.move(result.from, result.to);
      return;
    case 'insert':
      actions.addAt(result.index, result.track);
      return;
    case 'add-to-playlist':
      actions.addToPlaylist(result.playlistId, result.track);
      return;
    case 'none':
      return;
  }
}

/** The pure `onDragEnd` dispatch: dropped 'entry' reorders, dropped 'track' inserts or adds. */
export function dispatchDragEnd(
  input: DropInput,
  context: DropContext,
  actions: DropActions,
): DropResult {
  const result = resolveDrop(input, context);
  applyDrop(result, actions);
  return result;
}
