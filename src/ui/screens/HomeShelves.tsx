import { ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Track } from '../../core/Song';
import type { FeedSection } from '../../state';
import type { ArtistSummary } from '../../providers/MusicProvider';
import { Artwork } from '../components/Artwork';
import { Button } from '../components/Button';
import { Hanko } from '../components/Hanko';
import { IconButton } from '../components/IconButton';
import { pickArtworkUrl } from '../components/artworkSizing';
import { strings } from '../i18n/es';
import styles from './HomeShelves.module.css';

const SKELETON_TILES = 6;
const SCROLL_FRACTION = 0.85;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export interface ShelfProps {
  title: string;
  children?: ReactNode;
}

/** A titled horizontal row with snap scrolling and previous/next buttons. */
export function Shelf({ title, children }: ShelfProps) {
  const headingId = useId();
  const trackRef = useRef<HTMLUListElement>(null);

  const scroll = (direction: -1 | 1): void => {
    const track = trackRef.current;
    if (track === null || typeof track.scrollBy !== 'function') return;
    track.scrollBy({
      left: direction * track.clientWidth * SCROLL_FRACTION,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 id={headingId} className={styles.title}>
          {title}
        </h3>
        <div className={styles.arrows}>
          <IconButton
            label={strings.home.shelfPrevious(title)}
            icon={<ChevronLeft size={20} strokeWidth={1.5} />}
            onClick={() => scroll(-1)}
          />
          <IconButton
            label={strings.home.shelfNext(title)}
            icon={<ChevronRight size={20} strokeWidth={1.5} />}
            onClick={() => scroll(1)}
          />
        </div>
      </div>
      <ul ref={trackRef} className={styles.track}>
        {children}
      </ul>
    </section>
  );
}

export interface TrackTileProps {
  track: Track;
  onPlay: (track: Track) => void;
  onAddToEnd: (track: Track) => void;
}

/** A large cover; click or Enter plays it now, the corner button queues it at the end. */
export function TrackTile({ track, onPlay, onAddToEnd }: TrackTileProps) {
  const artists = track.artists.join(', ') || strings.library.unknownArtist;
  return (
    <li className={styles.item}>
      <div className={styles.tile}>
        <button
          type="button"
          className={styles.play}
          aria-label={strings.home.playTile(track.title, artists)}
          onClick={() => onPlay(track)}
        >
          <Artwork
            artwork={track.artwork}
            title={track.title}
            album={track.album.name}
            size="lg"
            className={styles.cover}
          />
          <span className={styles.disc} aria-hidden="true">
            <Play size={20} strokeWidth={1.5} />
          </span>
          <span className={styles.name}>{track.title}</span>
          <span className={styles.meta}>{artists}</span>
        </button>
        <IconButton
          className={styles.add}
          label={strings.home.addTileToEnd(track.title)}
          icon={<Plus size={18} strokeWidth={1.5} />}
          onClick={() => onAddToEnd(track)}
        />
      </div>
    </li>
  );
}

export interface ArtistTileProps {
  artist: ArtistSummary;
  onOpen?: ((id: string) => void) | undefined;
}

/** A round artist portrait; it is a link only when the shell can open artists. */
export function ArtistTile({ artist, onOpen }: ArtistTileProps) {
  const url = pickArtworkUrl(artist.artwork, 'lg');
  const portrait =
    url === undefined ? (
      <span className={styles.portrait} data-artwork="fallback">
        <Hanko kanji={Array.from(artist.name.trim())[0] ?? strings.artwork.sealKanji} size={48} />
      </span>
    ) : (
      <img className={styles.portrait} src={url} alt="" loading="lazy" draggable={false} />
    );
  return (
    <li className={styles.item}>
      {onOpen === undefined ? (
        <div className={styles.artist}>
          {portrait}
          <span className={styles.name}>{artist.name}</span>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.artist} ${styles.artistButton}`}
          aria-label={strings.home.openArtist(artist.name)}
          onClick={() => onOpen(artist.id)}
        >
          {portrait}
          <span className={styles.name}>{artist.name}</span>
        </button>
      )}
    </li>
  );
}

/** Flat paper blocks that pulse softly (the pulse is off with reduced motion). */
export function ShelfSkeleton({ title }: { title: string }) {
  const headingId = useId();
  return (
    <section className={styles.section} aria-labelledby={headingId} aria-busy="true">
      <h3 id={headingId} className={styles.title}>
        {title}
      </h3>
      <div role="status" className="visually-hidden">
        {strings.home.feedLoading}
      </div>
      <ul className={styles.track} aria-hidden="true">
        {Array.from({ length: SKELETON_TILES }, (_, index) => (
          <li key={index} className={styles.item}>
            <div className={styles.skeleton}>
              <span className={styles.skeletonCover} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLineShort} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface SectionNoticeProps {
  title: string;
  message: string;
  onRetry?: (() => void) | undefined;
}

/** One quiet line for an empty, unavailable or failed section. */
export function SectionNotice({ title, message, onRetry }: SectionNoticeProps) {
  const headingId = useId();
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.title}>
        {title}
      </h3>
      <p className={styles.notice}>{message}</p>
      {onRetry === undefined ? null : (
        <div>
          <Button onClick={onRetry}>{strings.home.feedRetry}</Button>
        </div>
      )}
    </section>
  );
}

export interface SectionGateProps<T> {
  title: string;
  section: FeedSection<T>;
  children: (items: readonly T[]) => ReactNode;
}

/** Picks skeleton, notice or content for a section; reconnect is handled by the view. */
export function SectionGate<T>({ title, section, children }: SectionGateProps<T>) {
  switch (section.status) {
    case 'idle':
    case 'needsReconnect':
      return null;
    case 'loading':
      return <ShelfSkeleton title={title} />;
    case 'empty':
      return <SectionNotice title={title} message={strings.home.feedEmpty} />;
    case 'unavailable':
      return <SectionNotice title={title} message={strings.home.feedUnavailable} />;
    case 'error':
      return (
        <SectionNotice title={title} message={strings.home.feedError} onRetry={section.retry} />
      );
    case 'ready':
      return <>{children(section.items)}</>;
  }
}
