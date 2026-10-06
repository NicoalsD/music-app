import { useState, type KeyboardEvent } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { cx } from '../cx';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import { Swallow } from './Swallow';
import styles from './SwallowProgress.module.css';

/** Keyboard seek step (left and right arrows). */
export const KEY_STEP_MS = 5000;

export interface SwallowProgressProps {
  valueMs: number;
  durationMs: number;
  /** Called once when the user releases the thumb or uses the keyboard. */
  onSeekCommit: (ms: number) => void;
  /** Called continuously while dragging. */
  onScrub?: (ms: number) => void;
  className?: string | undefined;
}

/**
 * Progress "wire with a swallow", drawn over a real Radix Slider (role=slider).
 * While the user drags, external `valueMs` updates are ignored; the seek is
 * applied on commit.
 */
export function SwallowProgress({
  valueMs,
  durationMs,
  onSeekCommit,
  onScrub,
  className,
}: SwallowProgressProps) {
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const max = Math.max(durationMs, 1);
  const shown = Math.min(Math.max(scrubMs ?? valueMs, 0), max);

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    const dir =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (dir === 0) return;
    // Take over arrows: Radix would step by 1s (10s with Shift). Shift+arrows
    // belong to the global next/previous shortcuts, so they must not seek.
    event.preventDefault();
    if (event.shiftKey) return;
    const next = Math.min(Math.max(shown + dir * KEY_STEP_MS, 0), durationMs);
    onSeekCommit(next);
  }

  return (
    <div className={cx(styles.root, className)}>
      <span className={cx(styles.time, 'tabular')} aria-hidden="true">
        {formatTime(shown)}
      </span>
      <Slider.Root
        className={styles.slider}
        min={0}
        max={max}
        step={1000}
        value={[shown]}
        disabled={durationMs <= 0}
        onKeyDown={onKeyDown}
        onValueChange={([next]) => {
          if (next === undefined) return;
          setScrubMs(next);
          onScrub?.(next);
        }}
        onValueCommit={([next]) => {
          setScrubMs(null);
          if (next !== undefined) onSeekCommit(next);
        }}
      >
        <Slider.Track className={styles.track}>
          <Slider.Range className={styles.range} />
        </Slider.Track>
        <Slider.Thumb
          className={styles.thumb}
          aria-label={strings.player.progress}
          aria-valuetext={strings.player.timeOf(formatTime(shown), formatTime(durationMs))}
        >
          <Swallow width={26} />
        </Slider.Thumb>
      </Slider.Root>
      <span className={cx(styles.time, 'tabular')} aria-hidden="true">
        {formatTime(durationMs)}
      </span>
    </div>
  );
}
