import { useCallback } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, SongView } from '../../state';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { strings } from '../i18n/es';
import { ImportFilesButton } from './ImportFilesButton';
import { PlaylistRow, PlaylistRows } from './PlaylistRow';
import styles from './PlaylistView.module.css';

export interface PlaylistViewProps {
  /** Called by the empty state's "search" action. */
  onGoToSearch: () => void;
}

const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;

function titleOf(
  songs: readonly SongView[],
  id: unknown,
): { title: string; position: number } | null {
  const index = songs.findIndex((song) => song.entryId === id);
  const song = songs[index];
  return song === undefined ? null : { title: song.title, position: index + 1 };
}

function buildAnnouncements(songs: readonly SongView[]): Announcements {
  const total = songs.length;
  return {
    onDragStart: ({ active }) => {
      const info = titleOf(songs, active.id);
      return info === null
        ? undefined
        : strings.playlist.dndPickedUp(info.title, info.position, total);
    },
    onDragOver: ({ active, over }) => {
      const info = titleOf(songs, active.id);
      const target = over === null ? null : titleOf(songs, over.id);
      return info === null || target === null
        ? undefined
        : strings.playlist.dndMoved(info.title, target.position, total);
    },
    onDragEnd: ({ active, over }) => {
      const info = titleOf(songs, active.id);
      const target = over === null ? info : titleOf(songs, over.id);
      return info === null || target === null
        ? undefined
        : strings.playlist.dndDropped(info.title, target.position, total);
    },
    onDragCancel: ({ active }) => {
      const info = titleOf(songs, active.id);
      return info === null ? undefined : strings.playlist.dndCancelled(info.title);
    },
  };
}

/** The ordered list of lanterns: play on click, remove with undo, drag to reorder. */
export function PlaylistView({ onGoToSearch }: PlaylistViewProps) {
  const store = useStore();
  const songs = usePlayerSnapshot(selectSongs);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onPlay = useCallback((entryId: string) => store.playEntry(entryId), [store]);
  const onRemove = useCallback((entryId: string) => void store.remove(entryId), [store]);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id) return;
    const from = songs.findIndex((song) => song.entryId === active.id);
    const to = songs.findIndex((song) => song.entryId === over.id);
    if (from !== -1 && to !== -1) store.move(from, to);
  }

  if (songs.length === 0) {
    return (
      <EmptyState
        title={strings.playlist.emptyWaveTitle}
        body={strings.playlist.emptyWaveBody}
        action={
          <div className={styles.emptyActions}>
            <Button variant="primary" onClick={onGoToSearch}>
              {strings.playlist.emptyAction}
            </Button>
            <ImportFilesButton />
          </div>
        }
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: buildAnnouncements(songs),
        screenReaderInstructions: { draggable: strings.playlist.dndInstructions },
      }}
    >
      <SortableContext
        items={songs.map((song) => song.entryId)}
        strategy={verticalListSortingStrategy}
      >
        <ol className={styles.list}>
          <PlaylistRows>
            {songs.map((song) => (
              <PlaylistRow key={song.entryId} song={song} onPlay={onPlay} onRemove={onRemove} />
            ))}
          </PlaylistRows>
        </ol>
      </SortableContext>
    </DndContext>
  );
}
