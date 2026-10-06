import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Button } from '../components/Button';
import { strings } from '../i18n/es';
import type { SpotifyStatusKey } from '../i18n/es';
import { shallowEqual } from './shallowEqual';
import styles from './PlayerNotice.module.css';

type ErrorKey = keyof typeof strings.errors;

const SPOTIFY_PROBLEMS: ReadonlySet<string> = new Set([
  'no-premium',
  'unsupported',
  'error',
  'forbidden',
]);

function isErrorKey(key: string): key is ErrorKey {
  return key in strings.errors;
}

const select = (s: PlayerSnapshot) => {
  const current = s.songs[s.currentIndex];
  return {
    error: s.player.error,
    spotifyStatus: s.spotify.status,
    currentSource: current === undefined ? null : current.source,
    unavailable: current === undefined ? false : current.unavailable,
  };
};

/** Inline notice inside the player bar: playback errors and Spotify problems, with a retry when it helps. */
export function PlayerNotice() {
  const store = useStore();
  const { error, spotifyStatus, currentSource, unavailable } = usePlayerSnapshot(
    select,
    shallowEqual,
  );

  let message: string | null = null;
  let retry: (() => void) | null = null;
  if (error !== null) {
    message = isErrorKey(error) ? strings.errors[error] : strings.errors.generic;
    retry =
      error === 'spotify-not-ready' ? () => store.reconnectSpotify() : () => store.togglePlay();
  } else if (currentSource === 'spotify' && SPOTIFY_PROBLEMS.has(spotifyStatus)) {
    message = strings.spotify.status[spotifyStatus as SpotifyStatusKey];
    retry = spotifyStatus === 'error' ? () => store.reconnectSpotify() : null;
  } else if (unavailable) {
    message = strings.library.unavailableHint;
  }

  return (
    <div className={styles.notice} role="status">
      {message === null ? null : (
        <>
          <span className={styles.text}>{message}</span>
          {retry === null ? null : (
            <Button variant="ghost" className={styles.retry} onClick={retry}>
              {strings.player.retry}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
