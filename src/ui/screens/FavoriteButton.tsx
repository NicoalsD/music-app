import { Heart } from 'lucide-react';
import type { Track } from '../../core/Song';
import { useStore } from '../../state';
import { IconButton } from '../components/IconButton';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import styles from './FavoriteButton.module.css';
import { useIsFavorite } from './useIsFavorite';

/** An entry of the active playlist (player bar, playlist and queue rows). */
export interface FavoriteEntry {
  readonly entryId: string;
  readonly trackId: string;
  readonly title: string;
}

type FavoriteTarget =
  | { readonly track: Track; readonly entry?: never }
  | { readonly entry: FavoriteEntry; readonly track?: never };

export type FavoriteButtonProps = FavoriteTarget & {
  /**
   * 'always' shows the heart all the time (player, now playing); 'hover' shows it on row hover
   * or focus, like Spotify, but a liked track keeps its filled heart visible.
   */
  reveal?: 'always' | 'hover';
  size?: number;
  className?: string | undefined;
};

/**
 * The heart toggle. The label says what a press will do ("Agregar ... a Favoritos" or "Quitar
 * ... de Favoritos") instead of using aria-pressed, and the liked state also changes the shape
 * (filled heart), not only the colour.
 */
export function FavoriteButton({
  track,
  entry,
  reveal = 'always',
  size = 20,
  className,
}: FavoriteButtonProps) {
  const store = useStore();
  const target = track ?? entry;
  const liked = useIsFavorite(target.trackId);
  return (
    <IconButton
      label={liked ? strings.favorites.unlike(target.title) : strings.favorites.like(target.title)}
      className={cx(styles.heart, className)}
      data-liked={liked ? 'true' : 'false'}
      data-reveal={reveal}
      icon={
        <Heart
          size={size}
          strokeWidth={1.5}
          fill={liked ? 'currentColor' : 'none'}
          className={styles.icon}
        />
      }
      onClick={(event) => {
        // Rows play on double-click; a quick double press on the heart must not start playback.
        event.stopPropagation();
        if (track !== undefined) store.toggleFavorite(track);
        else store.toggleFavoriteEntry(entry.entryId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
