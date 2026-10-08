import type { Track } from '../../core/Song';

/** Which list a sortable row belongs to. Both show the active playlist. */
export type DragScope = 'list' | 'queue';

/** A playlist entry that can be reordered. */
export interface EntryDragData {
  readonly type: 'entry';
  readonly entryId: string;
  readonly scope: DragScope;
}

/** A catalog track (search result, album track) dragged into a playlist. */
export interface TrackDragData {
  readonly type: 'track';
  readonly track: Track;
}

/** A sidebar playlist that accepts catalog tracks. */
export interface PlaylistDropData {
  readonly type: 'playlist';
  readonly playlistId: string;
  readonly name: string;
}

/** The empty space of a list (below the last row, or the whole list when it is empty). */
export interface ZoneDropData {
  readonly type: 'zone';
  readonly scope: DragScope;
}

/** The "now playing" slot of the queue: dropping there means "right after the current song". */
export interface ZoneCurrentDropData {
  readonly type: 'zone-current';
  readonly scope: DragScope;
}

export type DragData =
  EntryDragData | TrackDragData | PlaylistDropData | ZoneDropData | ZoneCurrentDropData;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScope(value: unknown): value is DragScope {
  return value === 'list' || value === 'queue';
}

/** Validates the untyped `data.current` that dnd-kit hands back. */
export function readDragData(value: unknown): DragData | null {
  if (!isRecord(value)) return null;
  switch (value['type']) {
    case 'entry': {
      const entryId = value['entryId'];
      const scope = value['scope'];
      return typeof entryId === 'string' && isScope(scope)
        ? { type: 'entry', entryId, scope }
        : null;
    }
    case 'track': {
      const track = value['track'];
      // The track was put there by TrackRows; only its shape is checked here.
      return isRecord(track) && typeof track['trackId'] === 'string'
        ? { type: 'track', track: track as unknown as Track }
        : null;
    }
    case 'playlist': {
      const playlistId = value['playlistId'];
      const name = value['name'];
      return typeof playlistId === 'string' && typeof name === 'string'
        ? { type: 'playlist', playlistId, name }
        : null;
    }
    case 'zone':
    case 'zone-current': {
      const scope = value['scope'];
      return isScope(scope) ? { type: value['type'], scope } : null;
    }
    default:
      return null;
  }
}

/** The dnd-kit id of a sortable row. Scoped because list and queue show the same entries. */
export function entrySortId(scope: DragScope, entryId: string): string {
  return `${scope}:${entryId}`;
}
