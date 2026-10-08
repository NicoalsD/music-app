import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { IconButton } from '../components/IconButton';
import { Spinner } from '../components/Spinner';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import { shallowEqual } from './shallowEqual';
import styles from './TransportControls.module.css';

const selectTransport = (s: PlayerSnapshot) => ({
  status: s.player.status,
  repeat: s.player.repeat,
  shuffle: s.player.shuffle,
  isEmpty: s.songs.length === 0,
});

export interface TransportControlsProps {
  /** `bar` is the compact player bar; `large` is the Now Playing view. */
  size?: 'bar' | 'large';
  className?: string | undefined;
  /** Extra class for shuffle and repeat, so a host can hide them on narrow screens. */
  secondaryClassName?: string | undefined;
  /** Ids of elements that describe the previous and next buttons (hint text). */
  previousHintId?: string | undefined;
  nextHintId?: string | undefined;
}

/** Shuffle, previous, play or pause, next and repeat. Shared by the player bar and Now Playing. */
export function TransportControls({
  size = 'bar',
  className,
  secondaryClassName,
  previousHintId,
  nextHintId,
}: TransportControlsProps) {
  const store = useStore();
  const state = usePlayerSnapshot(selectTransport, shallowEqual);
  const busy = state.status === 'loading';
  const playing = state.status === 'playing' || busy;
  const iconSize = size === 'large' ? 24 : 22;
  const sideIconSize = size === 'large' ? 22 : 20;

  return (
    <div className={cx(styles.controls, className)} data-size={size}>
      <IconButton
        label={strings.player.shuffle}
        pressed={state.shuffle}
        className={secondaryClassName}
        icon={<Shuffle size={sideIconSize} strokeWidth={1.5} />}
        onClick={() => store.toggleShuffle()}
      />
      <IconButton
        label={strings.player.previous}
        aria-describedby={previousHintId}
        icon={<SkipBack size={iconSize} strokeWidth={1.5} />}
        onClick={() => store.previous()}
        disabled={state.isEmpty}
      />
      <IconButton
        label={playing ? strings.player.pause : strings.player.play}
        variant="primary"
        className={styles.play}
        aria-busy={busy}
        disabled={state.isEmpty}
        icon={
          busy ? (
            <Spinner
              size={iconSize}
              label={strings.player.loadingTrack}
              className={styles.spinner}
            />
          ) : playing ? (
            <Pause size={iconSize} strokeWidth={1.5} />
          ) : (
            <Play size={iconSize} strokeWidth={1.5} />
          )
        }
        onClick={() => store.togglePlay()}
      />
      <IconButton
        label={strings.player.next}
        aria-describedby={nextHintId}
        icon={<SkipForward size={iconSize} strokeWidth={1.5} />}
        onClick={() => store.next()}
        disabled={state.isEmpty}
      />
      <span className={cx(styles.repeat, secondaryClassName)}>
        <IconButton
          label={strings.player.repeat[state.repeat]}
          pressed={state.repeat !== 'off'}
          icon={<Repeat size={sideIconSize} strokeWidth={1.5} />}
          onClick={() => store.cycleRepeat()}
        />
        {state.repeat === 'one' ? (
          <span className={styles.badge} aria-hidden="true">
            {strings.player.repeatOneBadge}
          </span>
        ) : null}
      </span>
    </div>
  );
}
