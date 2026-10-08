import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
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
  active: boolean;
  onSeek: (timeMs: number) => void;
}

/** One synced line. Memoised so a progress tick only re-renders the two lines that change. */
const SyncedLine = memo(function SyncedLine({ index, line, active, onSeek }: SyncedLineProps) {
  if (line.text === '') {
    return <li className={styles.gap} data-line-index={index} aria-hidden="true" />;
  }
  return (
    <li data-line-index={index}>
      <button
        type="button"
        className={styles.line}
        aria-current={active ? 'true' : undefined}
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

  const onSeek = useCallback(
    (timeMs: number) => {
      // Seeking by clicking a line means the user wants to follow the lyrics again.
      paused.current = false;
      store.seek(timeMs);
    },
    [store],
  );

  const scrollToActive = useCallback(
    (smooth: boolean) => {
      const container = scroller.current;
      if (container === null || activeRef.current < 0) return;
      const target = container.querySelector<HTMLElement>(
        `[data-line-index="${activeRef.current}"]`,
      );
      if (target === null || typeof container.scrollTo !== 'function') return;
      const top = target.offsetTop - container.clientHeight / 2 + target.offsetHeight / 2;
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

  useEffect(
    () => () => {
      if (pauseTimer.current !== null) clearTimeout(pauseTimer.current);
    },
    [],
  );

  const pauseAutoScroll = useCallback(() => {
    paused.current = true;
    if (pauseTimer.current !== null) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      paused.current = false;
      pauseTimer.current = null;
      scrollToActive(true);
    }, MANUAL_SCROLL_PAUSE_MS);
  }, [scrollToActive]);

  return (
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
            active={index === active}
            onSeek={onSeek}
          />
        ))}
      </ol>
    </div>
  );
}

function Message({ children }: { children: string }) {
  return <p className={styles.message}>{children}</p>;
}

/** Lyrics of the current song with loading, synced, plain, instrumental, empty and error states. */
export function LyricsPanel() {
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
            <p key={index} className={line === '' ? styles.gap : styles.plainLine}>
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
    <div className={styles.panel}>
      {body}
      {status === 'idle' ? null : <p className={styles.source}>{strings.lyrics.source}</p>}
    </div>
  );
}
