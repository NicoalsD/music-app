import type { AlbumSummary, ArtistSummary } from '../../providers/MusicProvider';
import { Artwork } from '../components/Artwork';
import { RevealList } from '../components/Reveal';
import { strings } from '../i18n/es';
import styles from './CatalogLists.module.css';

export interface AlbumGridProps {
  albums: readonly AlbumSummary[];
  onOpenAlbum: (album: AlbumSummary) => void;
}

/** Albums as a grid of framed covers; each one opens the album detail. */
export function AlbumGrid({ albums, onOpenAlbum }: AlbumGridProps) {
  return (
    <RevealList className={styles.grid} itemClassName={styles.gridItem}>
      {albums.map((album) => (
        <button
          key={album.id}
          type="button"
          className={styles.card}
          aria-label={strings.search.openAlbum(album.name)}
          onClick={() => onOpenAlbum(album)}
        >
          <Artwork artwork={album.artwork} title={album.name} album={album.name} size="lg" />
          <span className={styles.cardTitle}>{album.name}</span>
          <span className={styles.cardMeta}>
            {[album.artists.join(', '), album.releaseYear === null ? '' : String(album.releaseYear)]
              .filter((part) => part !== '')
              .join(' · ')}
          </span>
        </button>
      ))}
    </RevealList>
  );
}

export interface ArtistRowProps {
  artists: readonly ArtistSummary[];
  onOpenArtist: (artist: ArtistSummary) => void;
}

/** Artists as a horizontally scrolling row of covers. */
export function ArtistRow({ artists, onOpenArtist }: ArtistRowProps) {
  return (
    <RevealList className={styles.row} itemClassName={styles.rowItem}>
      {artists.map((artist) => (
        <button
          key={artist.id}
          type="button"
          className={styles.card}
          aria-label={strings.search.openArtist(artist.name)}
          onClick={() => onOpenArtist(artist)}
        >
          <Artwork artwork={artist.artwork} title={artist.name} album={artist.name} size="md" />
          <span className={styles.cardTitle}>{artist.name}</span>
        </button>
      ))}
    </RevealList>
  );
}
