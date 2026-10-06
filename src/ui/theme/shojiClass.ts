import { cx } from '../cx';
import styles from './shoji.module.css';

export interface ShojiClassOptions {
  /** `raised` is for menus and dialogs: more blur and opacity. */
  depth?: 'base' | 'raised';
  /** Use inside another shoji (no blur, no grain). Never nest blurred panels. */
  flat?: boolean;
  /** Draw the kumiko lattice lines. */
  kumiko?: boolean;
  /** Add `position: relative` (skip it when the host sets its own position). */
  inFlow?: boolean;
}

/** Class names for the shoji glass; reused by Radix content and toasts. */
export function shojiClass({
  depth = 'base',
  flat = false,
  kumiko = false,
  inFlow = false,
}: ShojiClassOptions = {}): string {
  return cx(
    styles.glass,
    inFlow && styles.shoji,
    depth === 'raised' && styles.raised,
    flat && styles.flat,
    kumiko && styles.kumiko,
  );
}
