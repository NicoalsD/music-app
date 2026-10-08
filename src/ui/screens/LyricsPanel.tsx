import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';
import { activeLineIndex } from '../../core/Lyrics';
import type { LyricLine } from '../../core/Lyrics';
import { useLyrics, usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { cx } from '../cx';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import { ACTIVE_LINE_POSITION, lineDistance, lineState } from './lyricsLines';
import type { LineState } from './lyricsLines';
import { shallowEqualOrNull } from './shallowEqual';
import styles from './LyricsPanel.module.css';

/** How long auto-scroll stays paused after the user scrolls the lyrics by hand. */
export const MANUAL_SCROLL_PAUSE_MS = 4000;

const selectQuery = (s: PlayerSnapshot) => {
  const current = s.songs[s.currentIndex];
  if (current === undefined) return null;
  return {
    title: current.title,
    artist: current.artists[0] ?? current.artistLabel,
    album: current.albumName,
    durationMs: current.durationMs,
  };
};

interface SyncedLineProps {
  index: number;
  line: LyricLine;
  state: LineState;
  /** Capped distance to the active line; drives the fade and shrink of neighbours. */
  distance: number;
  onSeek: (timeMs: number) => void;
}

/**
 * One synced line. Memoised, and it takes the derived `state` and capped `distance` rather than
 * the active index, so a line change only re-renders the few lines around the active one.
 */
const SyncedLine = memo(function SyncedLine({
  index,
  line,
  state,
  distance,
  onSeek,
}: SyncedLineProps) {
  if (line.text === '') {
    // Instrumental gap: three dots that breathe while it is the current section.
    return (
      <li
        className={styles.gap}
        data-line-index={index}
        data-state={state}
        data-distance={distance}
        aria-hidden="true"
      >
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </li>
    );
  }
  return (
    <li data-line-index={index} data-state={state}>
      <button
        type="button"
        className={styles.line}
        data-state={state}
        data-distance={distance}
        aria-current={state === 'active' ? 'true' : undefined}
        title={strings.lyrics.seekTo(formatTime(line.timeMs))}
        onClick={() => onSeek(line.timeMs)}
      >
        {line.text}
      </button>
    </li>
  );
});

/** Index of the line being sung. Re-renders its host only when the index changes. */
function useActiveLine(lines: readonly LyricLine[]): number {
  const store = useStore();
  const getSnapshot = useCallback(
    () => activeLineIndex(lines, store.getProgress().positionMs),
    [lines, store],
  );
  return useSyncExternalStore(store.subscribeProgress, getSnapshot, getSnapshot);
}

function SyncedLyrics({ lines }: { lines: readonly LyricLine[] }) {
  const store = useStore();
  const reduceMotion = useReducedMotion() === true;
  const active = useActiveLine(lines);
  const scroller = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const activeRef = useRef(active);
  const [following, setFollowing] = useState(true);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimer.current !== null) clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
  }, []);

  const scrollToActive = useCallback(
    (smooth: boolean) => {
      const container = scroller.current;
      if (container === null || activeRef.current < 0) return;
      const target = container.querySelector<HTMLElement>(
        `[data-line-index="${activeRef.current}"]`,
      );
      if (target === null || typeof container.scrollTo !== 'function') return;
      const top =
        target.offsetTop - container.clientHeight * ACTIVE_LINE_POSITION + target.offsetHeight / 2;
      container.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    },
    [reduceMotion],
  );

  useEffect(() => {
    activeRef.current = active;
    if (paused.current) return;
    scrollToActive(!first.current);
    first.current = false;
  }, [active, scrollToActive]);

  useEffect(() => clearPauseTimer, [clearPauseTimer]);

  /** Follows the lyrics again: clears the pause and re-centres the active line. */
  const resume = useCallback(() => {
    paused.current = false;
    clearPauseTimer();
    setFollowing(true);
    scrollToActive(true);
  }, [clearPauseTimer, scrollToActive]);

  const onSeek = useCallback(
    (timeMs: number) => {
      // Seeking by clicking a line means the user wants to follow the lyrics again.
      paused.current = false;
      clearPauseTimer();
      setFollowing(true);
      store.seek(timeMs);
    },
    [store, clearPauseTimer],
  );

  const pauseAutoScroll = useCallback(() => {
    paused.current = true;
    setFollowing(false);
    clearPauseTimer();
    pauseTimer.current = setTimeout(() => {
      pauseTimer.current = null;
      resume();
    }, MANUAL_SCROLL_PAUSE_MS);
  }, [clearPauseTimer, resume]);

  return (
    <div className={styles.synced}>
      <div
        ref={scroller}
        className={styles.scroller}
        data-testid="lyrics-scroller"
        onWheel={pauseAutoScroll}
        onTouchMove={pauseAutoScroll}
      >
        <ol className={styles.lines}>
          {lines.map((line, index) => (
            <SyncedLine
              // Lines are static for a song, so the index is a stable identity.
              key={index}
              index={index}
              line={line}
              state={lineState(index, active)}
              distance={lineDistance(index, active)}
              onSeek={onSeek}
            />
          ))}
        </ol>
      </div>
      {following ? null : (
        <button type="button" className={styles.follow} onClick={resume}>
          {strings.lyrics.follow}
        </button>
      )}
    </div>
  );
}

function Message({ children }: { children: string }) {
  return <p className={styles.message}>{children}</p>;
}

/** Lyrics of the current song with loading, synced, plain, instrumental, empty and error states. */
export interface LyricsPanelProps {
  /** 'full' is the Now Playing column; 'side' is the compact shell side panel. */
  variant?: 'full' | 'side';
}

export function LyricsPanel({ variant = 'full' }: LyricsPanelProps = {}) {
  const query = usePlayerSnapshot(selectQuery, shallowEqualOrNull);
  const { status, lyrics, retry } = useLyrics(query);

  let body;
  if (status === 'idle') {
    body = <Message>{strings.player.nothingPlaying}</Message>;
  } else if (status === 'loading') {
    body = (
      <div className={styles.loading}>
        <Spinner size={20} />
        <p className={styles.message}>{strings.lyrics.loading}</p>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className={styles.loading}>
        <p className={styles.message}>{strings.lyrics.error}</p>
        <Button variant="secondary" onClick={retry}>
          {strings.lyrics.retry}
        </Button>
      </div>
    );
  } else if (lyrics === null) {
    body = <Message>{strings.lyrics.empty}</Message>;
  } else if (lyrics.kind === 'instrumental') {
    body = <Message>{strings.lyrics.instrumental}</Message>;
  } else if (lyrics.kind === 'plain') {
    body = (
      <div className={cx(styles.scroller, styles.scrollerPlain)}>
        <div className={styles.plain}>
          {lyrics.lines.map((line, index) => (
            <p key={index} className={line === '' ? styles.plainGap : styles.plainLine}>
              {line}
            </p>
          ))}
        </div>
      </div>
    );
  } else {
    body = <SyncedLyrics lines={lyrics.lines} />;
  }

  return (
    <div className={styles.panel} data-variant={variant}>
      {body}
      {status === 'idle' ? null : <p className={styles.source}>{strings.lyrics.source}</p>}
    </div>
  );
}
