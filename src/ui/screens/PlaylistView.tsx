import { useCallback } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, SongView } from '../../state';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { useInsertionIndex } from '../dnd/dndContext';
import { entrySortId } from '../dnd/dragData';
import { ListDropZone } from '../dnd/ListDropZone';
import { useEntryMover } from '../dnd/useEntryMover';
import { strings } from '../i18n/es';
import { ImportFilesButton } from './ImportFilesButton';
import { PlaylistRow, PlaylistRows } from './PlaylistRow';
import styles from './PlaylistView.module.css';

export interface PlaylistViewProps {
  /** Called by the empty state's "search" action. */
  onGoToSearch: () => void;
}

const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;

function insertionFor(
  song: SongView,
  index: number | null,
  size: number,
): 'before' | 'after' | null {
  if (index === null) return null;
  if (index === song.index) return 'before';
  return index === size && song.isTail ? 'after' : null;
}

/**
 * The ordered list of lanterns: play on click, remove with undo, drag to reorder (also with
 * Alt+Arrow), and a drop target for catalog tracks and audio files. It needs an `AppDndProvider`
 * above it for the drag interactions.
 */
export function PlaylistView({ onGoToSearch }: PlaylistViewProps) {
  return (
    <ListDropZone scope="list">
      <PlaylistBody onGoToSearch={onGoToSearch} />
    </ListDropZone>
  );
}

/** Inside the drop zone, so it can read where a dragged song or file would land. */
function PlaylistBody({ onGoToSearch }: PlaylistViewProps) {
  const store = useStore();
  const songs = usePlayerSnapshot(selectSongs);
  const { moveEntry, onRowKeyDown } = useEntryMover('list');
  const dropIndex = useInsertionIndex('list');

  const onPlay = useCallback((entryId: string) => store.playEntry(entryId), [store]);
  const onRemove = useCallback((entryId: string) => void store.remove(entryId), [store]);

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
    <SortableContext
      items={songs.map((song) => entrySortId('list', song.entryId))}
      strategy={verticalListSortingStrategy}
    >
      <ol className={styles.list}>
        <PlaylistRows>
          {songs.map((song) => (
            <PlaylistRow
              key={song.entryId}
              song={song}
              onPlay={onPlay}
              onRemove={onRemove}
              onMove={moveEntry}
              onRowKeyDown={onRowKeyDown}
              insertion={insertionFor(song, dropIndex, songs.length)}
            />
          ))}
        </PlaylistRows>
      </ol>
    </SortableContext>
  );
}
