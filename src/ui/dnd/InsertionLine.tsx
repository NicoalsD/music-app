import { strings } from '../i18n/es';
import styles from './InsertionLine.module.css';

export interface InsertionLineProps {
  /** Draw it above the row (before) or below it (after, for the end of the list). */
  edge: 'before' | 'after';
}

/** A 2px ink line with a small knot at its start: where the dragged song will land. */
export function InsertionLine({ edge }: InsertionLineProps) {
  return (
    <span
      className={styles.line}
      data-edge={edge}
      data-testid="insertion-line"
      title={strings.dnd.insertionLine}
      aria-hidden="true"
    />
  );
}
