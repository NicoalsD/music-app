import { cx } from '../cx';
import styles from './Swallow.module.css';

export interface SwallowProps {
  width?: number;
  className?: string | undefined;
}

/** Swallow silhouette (shin-hanga nod). Decorative. */
export function Swallow({ width = 24, className }: SwallowProps) {
  return (
    <svg
      className={cx(styles.swallow, className)}
      width={width}
      height={(width * 14) / 24}
      viewBox="0 0 24 14"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0.8 2.6 C6 1.6 9.4 4.6 12 7 C14.6 4.6 18 1.6 23.2 2.6 C19.6 5.8 16.6 7.6 14.4 8.6 L15.4 13.2 L12.4 10.2 L11.6 10.2 L8.6 13.2 L9.6 8.6 C7.4 7.6 4.4 5.8 0.8 2.6 Z" />
    </svg>
  );
}
