import { useId } from 'react';
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Artwork } from '../components/Artwork';
import { IconButton } from '../components/IconButton';
import { ShojiPanel } from '../components/ShojiPanel';
import { Spinner } from '../components/Spinner';
import { strings } from '../i18n/es';
import { PlayerNotice } from './PlayerNotice';
import { PlayerProgress } from './PlayerProgress';
import { VolumeControl } from './VolumeControl';
import { shallowEqual } from './shallowEqual';
import styles from './PlayerBar.module.css';

const selectBar = (s: PlayerSnapshot) => {
  const current = s.songs[s.currentIndex];
  const previous = s.songs[s.currentIndex - 1];
  const next = s.songs[s.currentIndex + 1];
  return {
    status: s.player.status,
    repeat: s.player.repeat,
    shuffle: s.player.shuffle,
    isEmpty: s.songs.length === 0,
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

/** Fixed player bar: now playing, transport, progress, volume and notices. */
export function PlayerBar() {
  const store = useStore();
  const bar = usePlayerSnapshot(selectBar, shallowEqual);
  const hintsId = useId();
  const busy = bar.status === 'loading';
  const playing = bar.status === 'playing' || busy;
  const meta = [bar.artists, bar.album].filter((part) => part !== '').join(' · ');

  return (
    <ShojiPanel as="footer" kumiko className={styles.bar} aria-label={strings.player.barLabel}>
      <div className={styles.now}>
        {bar.artwork !== null && bar.title !== null ? (
          <Artwork
            artwork={bar.artwork}
            title={bar.title}
            album={bar.album}
            size="md"
            className={styles.art}
          />
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
        <div className={styles.controls}>
          <IconButton
            label={strings.player.shuffle}
            pressed={bar.shuffle}
            className={styles.optional}
            icon={<Shuffle size={20} strokeWidth={1.5} />}
            onClick={() => store.toggleShuffle()}
          />
          <IconButton
            label={strings.player.previous}
            aria-describedby={bar.previousTitle === null ? undefined : `${hintsId}-prev`}
            icon={<SkipBack size={22} strokeWidth={1.5} />}
            onClick={() => store.previous()}
            disabled={bar.isEmpty}
          />
          <IconButton
            label={playing ? strings.player.pause : strings.player.play}
            variant="primary"
            className={styles.play}
            aria-busy={busy}
            disabled={bar.isEmpty}
            icon={
              busy ? (
                <Spinner size={22} label={strings.player.loadingTrack} className={styles.spinner} />
              ) : playing ? (
                <Pause size={22} strokeWidth={1.5} />
              ) : (
                <Play size={22} strokeWidth={1.5} />
              )
            }
            onClick={() => store.togglePlay()}
          />
          <IconButton
            label={strings.player.next}
            aria-describedby={bar.nextTitle === null ? undefined : `${hintsId}-next`}
            icon={<SkipForward size={22} strokeWidth={1.5} />}
            onClick={() => store.next()}
            disabled={bar.isEmpty}
          />
          <span className={`${styles.optional} ${styles.repeat}`}>
            <IconButton
              label={strings.player.repeat[bar.repeat]}
              pressed={bar.repeat !== 'off'}
              icon={<Repeat size={20} strokeWidth={1.5} />}
              onClick={() => store.cycleRepeat()}
            />
            {bar.repeat === 'one' ? (
              <span className={styles.badge} aria-hidden="true">
                {strings.player.repeatOneBadge}
              </span>
            ) : null}
          </span>
        </div>
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

      <VolumeControl className={styles.volume} />

      <p className="visually-hidden" aria-live="polite">
        {bar.status === 'playing' && bar.title !== null
          ? strings.player.announceTrack(bar.title, bar.artists)
          : ''}
      </p>
    </ShojiPanel>
  );
}
