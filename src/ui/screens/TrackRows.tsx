import { useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Play, Plus } from 'lucide-react';
import type { Track } from '../../core/Song';
import { useStore } from '../../state';
import { Artwork } from '../components/Artwork';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Equalizer } from '../components/Equalizer';
import { IconButton } from '../components/IconButton';
import { ContextMenuContent, ContextMenuRoot, ContextMenuTrigger } from '../components/MenuKit';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import { TrackActionsMenu, TrackMenuItems } from './TrackActionsMenu';
import { useTrackSounding } from './useTrackSounding';
import styles from './TrackRows.module.css';

export interface TrackRowProps {
  track: Track;
}

function trackMeta(track: Track): string {
  const artists = track.artists.join(', ') || strings.library.unknownArtist;
  return track.album.name === '' ? artists : `${artists} · ${track.album.name}`;
}

const INTERACTIVE = 'button, a, input, [role="menuitem"], [role="menu"]';

interface CatalogRowProps {
  track: Track;
  /** The cover (search results) or the track number (album). */
  leading: { readonly kind: 'artwork' } | { readonly kind: 'number'; readonly value: number };
  meta: string;
  actions: ReactNode;
}

/**
 * One catalog track. The cover, title and meta are a single "Reproducir {title}" button; a double
 * click anywhere else on the row plays too; right-click opens the same actions as the "more" menu;
 * the whole row can be dragged into the playlist, the queue or a sidebar playlist.
 */
function CatalogRow({ track, leading, meta, actions }: CatalogRowProps) {
  const store = useStore();
  const { isCurrent, playing } = useTrackSounding(track);
  const dragId = `track:${useId()}`;
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging } = useDraggable({
    id: dragId,
    data: { type: 'track', track },
  });

  function onPlayClick(event: MouseEvent<HTMLButtonElement>) {
    // The second click of a double click must not queue the song twice.
    if (event.detail > 1) return;
    store.playNow(track);
  }

  function onRowDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE) !== null) return;
    store.playNow(track);
  }

  const glyph = isCurrent ? (
    <Equalizer animated={playing} className={styles.equalizer} />
  ) : (
    <Play size={18} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
  );

  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild>
        <div
          {...listeners}
          ref={(node) => {
            setNodeRef(node);
            setActivatorNodeRef(node);
          }}
          className={styles.row}
          data-playing={isCurrent ? 'true' : 'false'}
          data-dragging={isDragging ? 'true' : 'false'}
          onDoubleClick={onRowDoubleClick}
        >
          <button
            type="button"
            className={styles.main}
            aria-label={strings.add.playTrack(track.title)}
            aria-current={isCurrent ? 'true' : undefined}
            data-row-main
            onClick={onPlayClick}
          >
            {leading.kind === 'artwork' ? (
              <span className={styles.lead}>
                <Artwork
                  artwork={track.artwork}
                  title={track.title}
                  album={track.album.name}
                  size="sm"
                />
                <span className={styles.overlay} data-sounding={isCurrent ? 'true' : 'false'}>
                  {glyph}
                </span>
              </span>
            ) : (
              <span
                className={`${styles.numberCell} tabular`}
                data-sounding={isCurrent ? 'true' : 'false'}
              >
                <span className={styles.numberText} aria-hidden="true">
                  {leading.value}
                </span>
                <span className={styles.numberGlyph}>{glyph}</span>
              </span>
            )}
            <span className={styles.text}>
              <span className={styles.title}>
                <span className={styles.titleText}>{track.title}</span>
                {track.explicit ? (
                  <Chip className={styles.explicit} role="img" aria-label={strings.search.explicit}>
                    E
                  </Chip>
                ) : null}
              </span>
              <span className={styles.meta}>{meta}</span>
            </span>
          </button>
          {isCurrent ? <span className="visually-hidden">{strings.add.nowPlayingTag}</span> : null}
          <span className={`${styles.duration} tabular`}>{formatTime(track.durationMs)}</span>
          <div className={styles.actions}>{actions}</div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <TrackMenuItems kind="context" track={track} />
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}

/** A search result: artwork, title, artists and album, primary "Al final" and the actions menu. */
export function TrackResultRow({ track }: TrackRowProps) {
  const store = useStore();
  return (
    <CatalogRow
      track={track}
      leading={{ kind: 'artwork' }}
      meta={trackMeta(track)}
      actions={
        <>
          <Button className={styles.primaryAction} onClick={() => store.addLast(track)}>
            {strings.add.addToEnd}
          </Button>
          <TrackActionsMenu track={track} />
        </>
      }
    />
  );
}

export interface AlbumTrackRowProps extends TrackRowProps {
  number: number;
}

/** A track inside an album detail: its number, title, duration and a "+" to add it at the end. */
export function AlbumTrackRow({ track, number }: AlbumTrackRowProps) {
  const store = useStore();
  return (
    <CatalogRow
      track={track}
      leading={{ kind: 'number', value: number }}
      meta={track.artists.join(', ') || strings.library.unknownArtist}
      actions={
        <>
          <IconButton
            label={strings.search.addTrackToEnd(track.title)}
            icon={<Plus size={20} strokeWidth={1.5} />}
            onClick={() => store.addLast(track)}
          />
          <TrackActionsMenu track={track} />
        </>
      }
    />
  );
}
