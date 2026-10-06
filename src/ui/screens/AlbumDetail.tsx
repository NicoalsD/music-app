import { useStore } from '../../state';
import { useAlbum } from '../../state';
import { Artwork } from '../components/Artwork';
import { Button } from '../components/Button';
import { RevealList } from '../components/Reveal';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import { BackButton, DetailState } from './DetailParts';
import { AlbumTrackRow } from './TrackRows';
import styles from './Detail.module.css';

export interface AlbumDetailProps {
  albumId: string;
  onBack: () => void;
}

/** Full album: cover, facts, "add album" actions and its track list. Replaces the search content. */
export function AlbumDetail({ albumId, onBack }: AlbumDetailProps) {
  const store = useStore();
  const { status, data, retry } = useAlbum(store.provider, albumId);

  return (
    <div className={styles.detail}>
      <BackButton onBack={onBack} />
      <DetailState status={status} onRetry={retry}>
        {data === null ? null : (
          <>
            <header className={styles.hero}>
              <Artwork artwork={data.artwork} title={data.name} album={data.name} size="xl" />
              <div className={styles.heroText}>
                <h2 className={styles.heading}>{data.name}</h2>
                <p className={styles.sub}>
                  {data.artists.join(', ') || strings.library.unknownArtist}
                </p>
                <p className={styles.facts}>
                  {[
                    data.releaseYear === null ? '' : strings.detail.year(data.releaseYear),
                    strings.detail.trackCount(data.tracks.length),
                    formatTime(data.tracks.reduce((sum, t) => sum + t.durationMs, 0)),
                  ]
                    .filter((part) => part !== '')
                    .join(' · ')}
                </p>
                <div className={styles.heroActions}>
                  <Button
                    variant="primary"
                    onClick={() => store.addManyLast(data.tracks, data.name)}
                  >
                    {strings.detail.addAlbumToEnd}
                  </Button>
                  <Button onClick={() => store.addManyFirst(data.tracks, data.name)}>
                    {strings.detail.addAlbumToStart}
                  </Button>
                </div>
              </div>
            </header>
            <h3 className={styles.sectionTitle}>{strings.detail.tracks}</h3>
            <RevealList className={styles.list}>
              {data.tracks.map((track, i) => (
                <AlbumTrackRow key={`${track.trackId}-${i}`} track={track} number={i + 1} />
              ))}
            </RevealList>
          </>
        )}
      </DetailState>
    </div>
  );
}
