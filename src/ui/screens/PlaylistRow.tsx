import { memo } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { SongView } from '../../state';
import { Artwork } from '../components/Artwork';
import { Hanko } from '../components/Hanko';
import { IconButton } from '../components/IconButton';
import { LanternCord } from '../components/LanternCord';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import styles from './PlaylistRow.module.css';

export interface PlaylistRowProps {
  song: SongView;
  onPlay: (entryId: string) => void;
  onRemove: (entryId: string) => void;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DURATION_S = 0.22;

/** One lantern on the cord: a sortable, animated row of the playlist. */
function PlaylistRowBase({ song, onPlay, onRemove }: PlaylistRowProps) {
  const reduce = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: song.entryId,
  });
  const meta = [song.artistLabel || strings.library.unknownArtist, song.albumName]
    .filter((p) => p !== '')
    .join(' · ');

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Delete' || event.defaultPrevented) return;
    event.preventDefault();
    onRemove(song.entryId);
  }

  const collapsed = reduce ? { opacity: 0 } : { opacity: 0, height: 0, overflow: 'hidden' };
  const expanded = reduce
    ? { opacity: 1 }
    : { opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } };

  return (
    <motion.li
      className={styles.item}
      initial={collapsed}
      animate={expanded}
      exit={collapsed}
      transition={{ duration: reduce ? 0.1 : DURATION_S, ease: EASE_OUT }}
    >
      <div
        ref={setNodeRef}
        className={styles.row}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        data-current={song.isCurrent ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        onKeyDown={onKeyDown}
      >
        <span className={`${styles.index} tabular`} aria-hidden="true">
          {song.index + 1}
        </span>
        <LanternCord isHead={song.isHead} isTail={song.isTail} lit={song.isCurrent} />
        <button
          type="button"
          className={styles.main}
          aria-current={song.isCurrent ? 'true' : undefined}
          aria-label={strings.playlist.playSongNamed(song.title)}
          disabled={song.unavailable}
          onClick={() => onPlay(song.entryId)}
        >
          <Artwork artwork={song.artwork} title={song.title} album={song.albumName} size="sm" />
          <span className={styles.text}>
            <span className={styles.title}>{song.title}</span>
            <span className={styles.meta}>{meta}</span>
            {song.unavailable ? (
              <span className={styles.hint}>{strings.library.unavailableHint}</span>
            ) : null}
          </span>
          <span className={`${styles.duration} tabular`}>{formatTime(song.durationMs)}</span>
        </button>
        <span className={styles.seal}>
          {song.isCurrent ? <Hanko size={24} stampKey={song.entryId} /> : null}
        </span>
        <span className={styles.actions}>
          <IconButton
            label={strings.playlist.removeSongNamed(song.title)}
            icon={<Trash2 size={18} strokeWidth={1.5} />}
            onClick={() => onRemove(song.entryId)}
          />
          <button
            type="button"
            {...attributes}
            {...listeners}
            ref={setActivatorNodeRef}
            className={styles.handle}
            aria-label={strings.playlist.dragHandleNamed(song.title)}
          >
            <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </span>
      </div>
    </motion.li>
  );
}

export const PlaylistRow = memo(PlaylistRowBase);

/** Presence wrapper so removed rows can play their exit animation. */
export function PlaylistRows({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}
