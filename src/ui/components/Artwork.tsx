import { useState } from 'react';
import type { Artwork as ArtworkUrls } from '../../core/Song';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import { Hanko } from './Hanko';
import { ARTWORK_PX, MAT_PX, pickArtworkUrl, type ArtworkSize } from './artworkSizing';
import styles from './Artwork.module.css';

export interface ArtworkProps {
  artwork: ArtworkUrls;
  title: string;
  album: string;
  size: ArtworkSize;
  className?: string | undefined;
}

/** Artwork framed like a mounted woodblock print, with a themed fallback. */
export function Artwork({ artwork, title, album, size, className }: ArtworkProps) {
  const url = pickArtworkUrl(artwork, size);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const px = ARTWORK_PX[size];
  const mat = MAT_PX[size];
  const showImage = url !== undefined && failedUrl !== url;
  const initial = Array.from(title.trim())[0]?.toUpperCase() ?? strings.artwork.sealKanji;
  const frameStyle = { width: px, height: px, padding: mat };

  if (showImage) {
    return (
      <span className={cx(styles.frame, className)} style={frameStyle} data-artwork="image">
        <img
          className={styles.image}
          src={url}
          alt={strings.artwork.alt(album)}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(url)}
        />
      </span>
    );
  }

  return (
    <span className={cx(styles.frame, className)} style={frameStyle} data-artwork="fallback">
      <span
        className={styles.fallback}
        role="img"
        aria-label={strings.artwork.alt(album || title)}
        style={{ fontSize: px * 0.42 }}
      >
        <span aria-hidden="true">{initial}</span>
        <Hanko
          kanji={strings.artwork.sealKanji}
          size={Math.max(10, Math.round(px * 0.22))}
          className={styles.seal}
        />
      </span>
    </span>
  );
}
