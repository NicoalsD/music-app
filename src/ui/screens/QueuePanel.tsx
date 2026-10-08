import { useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, SongView } from '../../state';
import { useInsertionIndex } from '../dnd/dndContext';
import { entrySortId } from '../dnd/dragData';
import { ListDropZone } from '../dnd/ListDropZone';
import { useEntryMover } from '../dnd/useEntryMover';
import { strings } from '../i18n/es';
import { QueueRow } from './QueueRow';
import styles from './QueuePanel.module.css';

const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;
const selectCurrentIndex = (s: PlayerSnapshot): number => s.currentIndex;

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
 * Compact view of the active playlist for the side panel: the current song, then what follows it
 * in the doubly linked list (this is not a separate queue). Rows are sortable and the panel is a
 * drop target for tracks dragged from search and files dragged from the system.
 */
export function QueuePanel() {
  return (
    <ListDropZone scope="queue" className={styles.panel}>
      <QueueBody />
    </ListDropZone>
  );
}

function QueueBody() {
  const store = useStore();
  const songs = usePlayerSnapshot(selectSongs);
  const currentIndex = usePlayerSnapshot(selectCurrentIndex);
  const { moveEntry, onRowKeyDown } = useEntryMover('queue');
  const dropIndex = useInsertionIndex('queue');
  const { setNodeRef: setNowRef } = useDroppable({
    id: 'zone-current:queue',
    data: { type: 'zone-current', scope: 'queue' },
  });

  const onPlay = useCallback((entryId: string) => store.playEntry(entryId), [store]);
  const onRemove = useCallback((entryId: string) => void store.remove(entryId), [store]);

  const current = currentIndex === -1 ? null : (songs[currentIndex] ?? null);
  const upcoming = songs.filter((song) => song.index > currentIndex);

  return (
    <div className={styles.body}>
      <h2 className={styles.heading}>{strings.queue.title}</h2>
      {songs.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{strings.queue.emptyTitle}</p>
          <p className={styles.emptyBody}>{strings.queue.emptyBody}</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="queue-now-heading">
            <h3 id="queue-now-heading" className={styles.section}>
              {strings.queue.nowPlaying}
            </h3>
            <div ref={setNowRef} className={styles.now}>
              {current === null ? null : (
                <QueueRow
                  song={current}
                  isNowPlaying
                  canMoveUp={false}
                  canMoveDown={false}
                  onPlay={onPlay}
                  onRemove={onRemove}
                  onMove={moveEntry}
                  onRowKeyDown={onRowKeyDown}
                  insertion={null}
                />
              )}
            </div>
          </section>
          <section aria-labelledby="queue-next-heading">
            <h3 id="queue-next-heading" className={styles.section}>
              {strings.queue.upNext}
            </h3>
            {upcoming.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{strings.queue.upNextEmpty}</p>
                <p className={styles.emptyBody}>{strings.queue.upNextEmptyBody}</p>
              </div>
            ) : (
              <SortableContext
                items={upcoming.map((song) => entrySortId('queue', song.entryId))}
                strategy={verticalListSortingStrategy}
              >
                <ol className={styles.list} aria-label={strings.queue.listLabel}>
                  {upcoming.map((song) => (
                    <li key={song.entryId} className={styles.item}>
                      <QueueRow
                        song={song}
                        isNowPlaying={false}
                        canMoveUp={song.index > currentIndex + 1}
                        canMoveDown={!song.isTail}
                        onPlay={onPlay}
                        onRemove={onRemove}
                        onMove={moveEntry}
                        onRowKeyDown={onRowKeyDown}
                        insertion={insertionFor(song, dropIndex, songs.length)}
                      />
                    </li>
                  ))}
                </ol>
              </SortableContext>
            )}
          </section>
        </>
      )}
    </div>
  );
}
