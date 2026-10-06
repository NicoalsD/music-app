import type { HTMLAttributes } from 'react';
import { cx } from '../cx';
import styles from './Chip.module.css';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Flat matchbox-label color block. */
  tone?: 'paper' | 'plum' | 'sakura';
}

/** Static matchbox-label chip (non interactive). */
export function Chip({ tone = 'paper', className, ...rest }: ChipProps) {
  return <span {...rest} className={cx(styles.chip, styles[tone], className)} />;
}
