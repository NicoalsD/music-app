import { useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  Announcements,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  Modifier,
  PointerSensorOptions,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useReducedMotion } from 'motion/react';
import type { Artwork } from '../../core/Song';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, SongView } from '../../state';
import { strings } from '../i18n/es';
import { DndApiContext, DndUiContext, IDLE_DND_STATE } from './dndContext';
import type { DndApi, DndUiState } from './dndContext';
import { collisionDetection } from './collision';
import { readDragData } from './dragData';
import type { DragData } from './dragData';
import { DragTicket } from './DragTicket';
import { applyDrop, resolveDrop } from './resolveDrop';
import type { DropContext, DropInput } from './resolveDrop';

export interface AppDndProviderProps {
  children: ReactNode;
}

const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;
const selectCurrentIndex = (s: PlayerSnapshot): number => s.currentIndex;

/** Pointer sensor that leaves touch to TouchSensor, so a finger can still scroll the lists. */
class MousePointerSensor extends PointerSensor {
  static override activators = PointerSensor.activators.map((activator) => ({
    eventName: activator.eventName,
    handler: (event: ReactPointerEvent, options: PointerSensorOptions): boolean =>
      event.nativeEvent.pointerType === 'touch' ? false : activator.handler(event, options),
  }));
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function pointOf(event: Event | null): Point | null {
  if (event === null) return null;
  if ('touches' in event) {
    const touch = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0];
    return touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
  }
  if ('clientX' in event && 'clientY' in event) {
    const pointer = event as PointerEvent;
    return { x: pointer.clientX, y: pointer.clientY };
  }
  return null;
}

/** Puts the ticket's top-left corner next to the pointer instead of where the row was grabbed. */
const anchorTicketToPointer: Modifier = ({ activatorEvent, activeNodeRect, transform }) => {
  const start = pointOf(activatorEvent);
  if (start === null || activeNodeRect === null) return transform;
  return {
    ...transform,
    x: transform.x + (start.x - activeNodeRect.left) - 24,
    y: transform.y + (start.y - activeNodeRect.top) - 16,
  };
};

interface ActiveItem {
  readonly title: string;
  readonly albumName: string;
  readonly artwork: Artwork;
}

function describe(data: DragData | null, songs: readonly SongView[]): ActiveItem | null {
  if (data === null) return null;
  if (data.type === 'track') {
    return {
      title: data.track.title,
      albumName: data.track.album.name,
      artwork: data.track.artwork,
    };
  }
  if (data.type === 'entry') {
    const song = songs.find((s) => s.entryId === data.entryId);
    return song === undefined
      ? null
      : { title: song.title, albumName: song.albumName, artwork: song.artwork };
  }
  return null;
}

function sameState(a: DndUiState, b: DndUiState): boolean {
  return (
    a.activeKind === b.activeKind &&
    a.overPlaylistId === b.overPlaylistId &&
    a.insertion?.scope === b.insertion?.scope &&
    a.insertion?.index === b.insertion?.index
  );
}

/**
 * The single app-wide drag-and-drop context. Search results, playlist rows, the queue panel and
 * the sidebar playlists share it, so a song can be dragged between all of them.
 */
export function AppDndProvider({ children }: AppDndProviderProps) {
  const store = useStore();
  const songs = usePlayerSnapshot(selectSongs);
  const currentIndex = usePlayerSnapshot(selectCurrentIndex);
  const reduceMotion = useReducedMotion();

  const sensors = useSensors(
    useSensor(MousePointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [ui, setUi] = useState<DndUiState>(IDLE_DND_STATE);
  const [active, setActive] = useState<ActiveItem | null>(null);
  const [message, setMessage] = useState({ text: '', n: 0 });
  const start = useRef<Point | null>(null);

  const api = useMemo<DndApi>(
    () => ({ announce: (text) => setMessage((previous) => ({ text, n: previous.n + 1 })) }),
    [],
  );

  const context = useMemo<DropContext>(() => ({ songs, currentIndex }), [songs, currentIndex]);

  const inputOf = useCallback(
    (event: DragMoveEvent | DragEndEvent): DropInput => ({
      activeData: event.active.data.current,
      overData: event.over?.data.current,
      overRect: event.over === null ? null : event.over.rect,
      pointerY: start.current === null ? null : start.current.y + event.delta.y,
    }),
    [],
  );

  function onDragStart(event: DragStartEvent) {
    start.current = pointOf(event.activatorEvent instanceof Event ? event.activatorEvent : null);
    const data = readDragData(event.active.data.current);
    setActive(describe(data, songs));
    setUi({
      activeKind: data === null ? null : data.type === 'entry' ? 'entry' : 'track',
      insertion: null,
      overPlaylistId: null,
    });
  }

  function onDragMove(event: DragMoveEvent) {
    const result = resolveDrop(inputOf(event), context);
    const activeKind =
      readDragData(event.active.data.current)?.type === 'entry' ? 'entry' : 'track';
    const next: DndUiState = {
      activeKind,
      insertion: result.kind === 'insert' ? { scope: result.scope, index: result.index } : null,
      overPlaylistId: result.kind === 'add-to-playlist' ? result.playlistId : null,
    };
    setUi((previous) => (sameState(previous, next) ? previous : next));
  }

  function finish() {
    start.current = null;
    setActive(null);
    setUi(IDLE_DND_STATE);
  }

  function onDragEnd(event: DragEndEvent) {
    const result = resolveDrop(inputOf(event), context);
    finish();
    applyDrop(result, {
      move: (from, to) => store.move(from, to),
      addAt: (index, track) => store.addAt(index, track),
      addToPlaylist: (playlistId, track) => store.addToPlaylist(playlistId, track),
    });
  }

  const announcements = useMemo<Announcements>(() => {
    const total = songs.length;
    const entryInfo = (data: DragData | null) => {
      if (data === null || data.type !== 'entry') return null;
      const index = songs.findIndex((song) => song.entryId === data.entryId);
      const song = songs[index];
      return song === undefined ? null : { title: song.title, position: index + 1 };
    };
    const targetEntry = (over: { data: { current?: unknown } } | null) => {
      const data = over === null ? null : readDragData(over.data.current);
      if (data === null) return null;
      if (data.type === 'entry') return entryInfo(data);
      return null;
    };
    const dropContext: DropContext = { songs, currentIndex };
    const preview = (
      active: { data: { current?: unknown } },
      over: { data: { current?: unknown }; rect: { top: number; height: number } } | null,
    ) =>
      resolveDrop(
        {
          activeData: active.data.current,
          overData: over?.data.current,
          overRect: over === null ? null : over.rect,
          pointerY: null,
        },
        dropContext,
      );
    return {
      onDragStart: ({ active }) => {
        const data = readDragData(active.data.current);
        if (data?.type === 'track') return strings.dnd.trackPickedUp(data.track.title);
        const info = entryInfo(data);
        return info === null ? undefined : strings.dnd.pickedUp(info.title, info.position, total);
      },
      onDragOver: ({ active, over }) => {
        const data = readDragData(active.data.current);
        if (data?.type === 'track') {
          const result = preview(active, over);
          if (result.kind === 'insert') {
            return strings.dnd.trackOverList(data.track.title, result.index + 1, total);
          }
          if (result.kind === 'add-to-playlist') {
            return strings.dnd.trackOverPlaylist(data.track.title, result.name);
          }
          return undefined;
        }
        const info = entryInfo(data);
        const target = targetEntry(over);
        return info === null || target === null
          ? undefined
          : strings.dnd.moved(info.title, target.position, total);
      },
      onDragEnd: ({ active, over }) => {
        const data = readDragData(active.data.current);
        if (data?.type === 'track') {
          const result = preview(active, over);
          if (result.kind === 'insert') {
            return strings.dnd.trackDroppedList(data.track.title, result.index + 1);
          }
          if (result.kind === 'add-to-playlist') {
            return strings.dnd.trackDroppedPlaylist(data.track.title, result.name);
          }
          return strings.dnd.trackCancelled(data.track.title);
        }
        const info = entryInfo(data);
        const target = over === null ? info : targetEntry(over);
        return info === null || target === null
          ? undefined
          : strings.dnd.dropped(info.title, target.position, total);
      },
      onDragCancel: ({ active }) => {
        const data = readDragData(active.data.current);
        if (data?.type === 'track') return strings.dnd.trackCancelled(data.track.title);
        const info = entryInfo(data);
        return info === null ? undefined : strings.dnd.cancelled(info.title);
      },
    };
  }, [songs, currentIndex]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: strings.dnd.instructions },
      }}
    >
      <DndApiContext value={api}>
        <DndUiContext value={ui}>{children}</DndUiContext>
      </DndApiContext>
      <DragOverlay
        modifiers={[anchorTicketToPointer]}
        dropAnimation={reduceMotion === true ? null : undefined}
        style={{ width: 260, height: 'auto' }}
      >
        {active === null ? null : <DragTicket {...active} />}
      </DragOverlay>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        <span key={message.n}>{message.text}</span>
      </div>
    </DndContext>
  );
}
