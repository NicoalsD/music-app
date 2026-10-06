import { useProgress, useStore } from '../../state';
import { SwallowProgress } from '../components/SwallowProgress';

/** The only component that subscribes to live progress, so the rest never re-renders on ticks. */
export function PlayerProgress({ className }: { className?: string | undefined }) {
  const store = useStore();
  const { positionMs, durationMs } = useProgress();
  return (
    <SwallowProgress
      className={className}
      valueMs={positionMs}
      durationMs={durationMs}
      onSeekCommit={(ms) => store.seek(ms)}
    />
  );
}
