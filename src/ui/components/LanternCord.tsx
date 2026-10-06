import { cx } from '../cx';
import { Lantern } from './Lantern';
import styles from './LanternCord.module.css';

export interface LanternCordProps {
  /** Head node: the top cord is hidden. */
  isHead?: boolean;
  /** Tail node: the bottom cord is hidden. */
  isTail?: boolean;
  /** The current song's lantern is lit. */
  lit?: boolean;
  className?: string | undefined;
}

/**
 * Rail segment for one list row: top cord, lantern, bottom cord.
 * Stretch it to the row height; the cords fill the remaining space.
 */
export function LanternCord({
  isHead = false,
  isTail = false,
  lit = false,
  className,
}: LanternCordProps) {
  return (
    <span className={cx(styles.rail, className)} aria-hidden="true">
      <span className={cx(styles.cord, isHead && styles.hidden)} data-cord="top" />
      <Lantern lit={lit} />
      <span className={cx(styles.cord, isTail && styles.hidden)} data-cord="bottom" />
    </span>
  );
}
