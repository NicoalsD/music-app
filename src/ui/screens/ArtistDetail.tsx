import type { AlbumSummary } from '../../providers/MusicProvider';
import { useArtist, useStore } from '../../state';
import { Artwork } from '../components/Artwork';
import { Chip } from '../components/Chip';
import { strings } from '../i18n/es';
import { AlbumGrid } from './CatalogLists';
import { BackButton, DetailState } from './DetailParts';
import styles from './Detail.module.css';

export interface ArtistDetailProps {
  artistId: string;
  onBack: () => void;
  onOpenAlbum: (album: AlbumSummary) => void;
}

/** An artist: cover, name, genres and their albums. */
export function ArtistDetail({ artistId, onBack, onOpenAlbum }: ArtistDetailProps) {
  const store = useStore();
  const { status, data, retry } = useArtist(store.provider, artistId);

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
                <h3 className={styles.sectionTitle}>{strings.detail.genres}</h3>
                {data.genres.length === 0 ? (
                  <p className={styles.sub}>{strings.detail.noGenres}</p>
                ) : (
                  <ul className={styles.chips}>
                    {data.genres.map((genre) => (
                      <li key={genre}>
                        <Chip tone="sakura">{genre}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </header>
            <h3 className={styles.sectionTitle}>{strings.detail.albums}</h3>
            {data.albums.length === 0 ? (
              <p className={styles.sub}>{strings.detail.noAlbums}</p>
            ) : (
              <AlbumGrid albums={data.albums} onOpenAlbum={onOpenAlbum} />
            )}
          </>
        )}
      </DetailState>
    </div>
  );
}
