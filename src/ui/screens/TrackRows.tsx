import { Plus } from 'lucide-react';
import type { Track } from '../../core/Song';
import { useStore } from '../../state';
import { Artwork } from '../components/Artwork';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { IconButton } from '../components/IconButton';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import { TrackActionsMenu } from './TrackActionsMenu';
import styles from './TrackRows.module.css';

export interface TrackRowProps {
  track: Track;
}

function trackMeta(track: Track): string {
  const artists = track.artists.join(', ') || strings.library.unknownArtist;
  return track.album.name === '' ? artists : `${artists} · ${track.album.name}`;
}

/** A search result: artwork, title, artists and album, primary "Al final" and the actions menu. */
export function TrackResultRow({ track }: TrackRowProps) {
  const store = useStore();
  return (
    <div className={styles.row}>
      <Artwork artwork={track.artwork} title={track.title} album={track.album.name} size="sm" />
      <div className={styles.text}>
        <p className={styles.title}>
          {track.title}
          {track.explicit ? (
            <Chip className={styles.explicit} role="img" aria-label={strings.search.explicit}>
              E
            </Chip>
          ) : null}
        </p>
        <p className={styles.meta}>{trackMeta(track)}</p>
      </div>
      <span className={`${styles.duration} tabular`}>{formatTime(track.durationMs)}</span>
      <div className={styles.actions}>
        <Button className={styles.primaryAction} onClick={() => store.addLast(track)}>
          {strings.add.addToEnd}
        </Button>
        <TrackActionsMenu track={track} />
      </div>
    </div>
  );
}

export interface AlbumTrackRowProps extends TrackRowProps {
  number: number;
}

/** A track inside an album detail: its number, title, duration and a "+" to add it at the end. */
export function AlbumTrackRow({ track, number }: AlbumTrackRowProps) {
  const store = useStore();
  return (
    <div className={styles.row}>
      <span className={`${styles.number} tabular`} aria-hidden="true">
        {number}
      </span>
      <div className={styles.text}>
        <p className={styles.title}>
          {track.title}
          {track.explicit ? (
            <Chip className={styles.explicit} role="img" aria-label={strings.search.explicit}>
              E
            </Chip>
          ) : null}
        </p>
        <p className={styles.meta}>{track.artists.join(', ') || strings.library.unknownArtist}</p>
      </div>
      <span className={`${styles.duration} tabular`}>{formatTime(track.durationMs)}</span>
      <div className={styles.actions}>
        <IconButton
          label={strings.search.addTrackToEnd(track.title)}
          icon={<Plus size={20} strokeWidth={1.5} />}
          onClick={() => store.addLast(track)}
        />
        <TrackActionsMenu track={track} />
      </div>
    </div>
  );
}
