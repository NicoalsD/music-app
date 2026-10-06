import { cx } from '../cx';
import styles from './Lantern.module.css';

export interface LanternProps {
  /** Lit (vermilion) when this node is the current song; paper otherwise. */
  lit?: boolean;
  className?: string | undefined;
}

/** Chochin lantern: the glyph of a doubly linked list node. Decorative. */
export function Lantern({ lit = false, className }: LanternProps) {
  return (
    <svg
      className={cx(styles.lantern, lit && styles.lit, className)}
      width="16"
      height="22"
      viewBox="0 0 16 22"
      aria-hidden="true"
      focusable="false"
      data-lit={lit ? 'true' : 'false'}
    >
      <rect className={styles.cap} x="4" y="1" width="8" height="2.5" rx="0.5" />
      <path
        className={styles.body}
        d="M4 3.5 C0.5 6 0.5 15 4 17.5 L12 17.5 C15.5 15 15.5 6 12 3.5 Z"
      />
      <path className={styles.rib} d="M2.1 7.5 H13.9 M1.6 10.5 H14.4 M2.1 13.5 H13.9" />
      <rect className={styles.cap} x="4" y="17.5" width="8" height="2.5" rx="0.5" />
      <path className={styles.tassel} d="M8 20 V21.8" />
    </svg>
  );
}
