import { useId } from 'react';
import { Maximize2, MicVocal } from 'lucide-react';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Artwork } from '../components/Artwork';
import { IconButton } from '../components/IconButton';
import { ShojiPanel } from '../components/ShojiPanel';
import { strings } from '../i18n/es';
import { PlayerNotice } from './PlayerNotice';
import { PlayerProgress } from './PlayerProgress';
import { TransportControls } from './TransportControls';
import { VolumeControl } from './VolumeControl';
import { shallowEqual } from './shallowEqual';
import styles from './PlayerBar.module.css';

const selectBar = (s: PlayerSnapshot) => {
  const current = s.songs[s.currentIndex];
  const previous = s.songs[s.currentIndex - 1];
  const next = s.songs[s.currentIndex + 1];
  return {
    status: s.player.status,
    title: current === undefined ? null : current.title,
    artists: current === undefined ? '' : current.artistLabel,
    album: current === undefined ? '' : current.albumName,
    artwork: current === undefined ? null : current.artwork,
    source: current === undefined ? null : current.source,
    externalUrl: current === undefined ? null : current.externalUrl,
    previousTitle: previous === undefined ? null : previous.title,
    nextTitle: next === undefined ? null : next.title,
  };
};

export interface PlayerBarProps {
  /** Opens the Now Playing view (the cover and the expand button both call it). */
  onOpenNowPlaying: () => void;
  /** Shows or hides the lyrics. */
  onToggleLyrics: () => void;
  /** Whether the lyrics are showing, for the toggle's pressed state. */
  lyricsOpen?: boolean | undefined;
}

/** Fixed player bar: now playing, transport, progress, volume and notices. */
export function PlayerBar({ onOpenNowPlaying, onToggleLyrics, lyricsOpen }: PlayerBarProps) {
  const bar = usePlayerSnapshot(selectBar, shallowEqual);
  const hintsId = useId();
  const meta = [bar.artists, bar.album].filter((part) => part !== '').join(' · ');

  return (
    <ShojiPanel as="footer" kumiko className={styles.bar} aria-label={strings.player.barLabel}>
      <div className={styles.now}>
        {bar.artwork !== null && bar.title !== null ? (
          <button
            type="button"
            className={styles.cover}
            aria-label={strings.nowPlaying.open}
            onClick={onOpenNowPlaying}
          >
            <Artwork artwork={bar.artwork} title={bar.title} album={bar.album} size="md" />
          </button>
        ) : null}
        <div className={styles.info}>
          <p className={styles.title}>{bar.title ?? strings.player.nothingPlaying}</p>
          <p className={styles.meta}>
            {bar.title === null ? strings.player.nothingPlayingHint : meta}
          </p>
          {bar.source === 'spotify' && bar.externalUrl !== null ? (
            <a
              className={styles.link}
              href={bar.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {strings.player.openInSpotify}
            </a>
          ) : null}
        </div>
      </div>

      <div className={styles.center}>
        <TransportControls
          className={styles.controls}
          secondaryClassName={styles.optional}
          previousHintId={bar.previousTitle === null ? undefined : `${hintsId}-prev`}
          nextHintId={bar.nextTitle === null ? undefined : `${hintsId}-next`}
        />
        <PlayerProgress className={styles.progress} />
        <div className={styles.hints}>
          {bar.previousTitle === null ? null : (
            <span id={`${hintsId}-prev`} className={styles.hint}>
              {strings.player.previousHint(bar.previousTitle)}
            </span>
          )}
          {bar.nextTitle === null ? null : (
            <span id={`${hintsId}-next`} className={styles.hint}>
              {strings.player.nextHint(bar.nextTitle)}
            </span>
          )}
        </div>
        <div className={styles.noticeSlot}>
          <PlayerNotice />
        </div>
      </div>

      <div className={styles.side}>
        <IconButton
          label={strings.lyrics.title}
          pressed={lyricsOpen === true}
          className={styles.extra}
          icon={<MicVocal size={20} strokeWidth={1.5} />}
          onClick={onToggleLyrics}
        />
        <IconButton
          label={strings.nowPlaying.title}
          className={styles.extra}
          icon={<Maximize2 size={20} strokeWidth={1.5} />}
          onClick={onOpenNowPlaying}
        />
        <VolumeControl />
      </div>

      <p className="visually-hidden" aria-live="polite">
        {bar.status === 'playing' && bar.title !== null
          ? strings.player.announceTrack(bar.title, bar.artists)
          : ''}
      </p>
    </ShojiPanel>
  );
}
