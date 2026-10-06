import { cx } from '../cx';
import { strings } from '../i18n/es';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Diameter in px. */
  size?: number;
  /** Accessible label; defaults to the i18n "Cargando". */
  label?: string;
  className?: string | undefined;
}

/** Ink brush circle (ensō). Rotates; with reduced motion it only pulses opacity. */
export function Spinner({ size = 24, label = strings.spinner.label, className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cx(styles.spinner, className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className={styles.stroke} cx="12" cy="12" r="9" />
        <circle className={styles.thin} cx="12" cy="12" r="9" />
      </svg>
    </span>
  );
}
