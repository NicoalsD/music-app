import { memo } from 'react';
import type { KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot, SongView } from '../../state';
import { Artwork } from '../components/Artwork';
import { Equalizer } from '../components/Equalizer';
import { IconButton } from '../components/IconButton';
import { Menu, MenuContent, MenuTrigger } from '../components/Menu';
import { entrySortId } from '../dnd/dragData';
import { InsertionLine } from '../dnd/InsertionLine';
import type { MoveTarget } from '../dnd/useEntryMover';
import { strings } from '../i18n/es';
import { FavoriteButton } from './FavoriteButton';
import { RowMenuItems } from './RowMenuItems';
import styles from './QueueRow.module.css';

export interface QueueRowProps {
  song: SongView;
  /** The "now playing" row is shown first and cannot be dragged. */
  isNowPlaying: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPlay: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  onMove: (entryId: string, target: MoveTarget) => void;
  onRowKeyDown: (entryId: string, event: KeyboardEvent) => boolean;
  insertion: 'before' | 'after' | null;
}

const selectPlaying = (s: PlayerSnapshot): boolean => s.player.status === 'playing';

/** A compact row of the queue: 40px cover, title, artist, a row menu and a drag handle. */
function QueueRowBase({
  song,
  isNowPlaying,
  canMoveUp,
  canMoveDown,
  onPlay,
  onRemove,
  onMove,
  onRowKeyDown,
  insertion,
}: QueueRowProps) {
  const playing = usePlayerSnapshot(selectPlaying);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entrySortId('queue', song.entryId),
    data: { type: 'entry', entryId: song.entryId, scope: 'queue' },
    disabled: isNowPlaying,
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isNowPlaying && onRowKeyDown(song.entryId, event)) return;
    if (event.key !== 'Delete' || event.defaultPrevented) return;
    event.preventDefault();
    onRemove(song.entryId);
  }

  return (
    <div
      {...(isNowPlaying ? {} : listeners)}
      ref={setNodeRef}
      className={styles.row}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-entry-key={entrySortId('queue', song.entryId)}
      // The now playing row is not a drop position: files dropped near it land after it.
      data-song-index={isNowPlaying ? undefined : song.index}
      data-current={isNowPlaying ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : 'false'}
      data-row-hover-scope
      onKeyDown={onKeyDown}
    >
      {insertion === null ? null : <InsertionLine edge={insertion} />}
      <button
        type="button"
        className={styles.main}
        aria-label={strings.queue.playSong(song.title)}
        aria-current={isNowPlaying ? 'true' : undefined}
        data-row-main
        disabled={song.unavailable}
        onClick={() => onPlay(song.entryId)}
      >
        <span className={styles.cover}>
          <Artwork
            artwork={song.artwork}
            title={song.title}
            album={song.albumName}
            size="xs"
            fluid
          />
          {isNowPlaying ? (
            <span className={styles.badge}>
              <Equalizer animated={playing} />
            </span>
          ) : null}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{song.title}</span>
          <span className={styles.meta}>{song.artistLabel || strings.library.unknownArtist}</span>
        </span>
      </button>
      {isNowPlaying ? <span className="visually-hidden">{strings.add.nowPlayingTag}</span> : null}
      <FavoriteButton entry={song} reveal="hover" size={16} />
      <span className={styles.actions}>
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              label={strings.queue.rowMenuNamed(song.title)}
              icon={<MoreHorizontal size={18} strokeWidth={1.5} />}
            />
          </MenuTrigger>
          <MenuContent align="end">
            <RowMenuItems
              entryId={song.entryId}
              trackId={song.trackId}
              canMoveUp={!isNowPlaying && canMoveUp}
              canMoveDown={!isNowPlaying && canMoveDown}
              onMove={onMove}
              onRemove={onRemove}
            />
          </MenuContent>
        </Menu>
        {isNowPlaying ? null : (
          <button
            type="button"
            {...attributes}
            {...listeners}
            ref={setActivatorNodeRef}
            className={styles.handle}
            aria-label={strings.queue.dragHandleNamed(song.title)}
          >
            <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
}

export const QueueRow = memo(QueueRowBase);
