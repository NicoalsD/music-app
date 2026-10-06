import type { ReactNode } from 'react';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Call to action slot (usually a Button). */
  action?: ReactNode;
  headingLevel?: 'h2' | 'h3' | 'h4';
  className?: string | undefined;
}

/** Small flat Hokusai wave, drawn with ink outline, jade, indigo and foam dots. */
function WaveIllustration() {
  return (
    <svg
      className={styles.art}
      width="120"
      height="72"
      viewBox="0 0 120 72"
      role="img"
      aria-label={strings.emptyState.illustrationTitle}
      focusable="false"
    >
      <path
        className={styles.sea}
        d="M2 70 V44 C12 40 22 30 30 20 C37 12 48 6 60 8 C72 10 80 20 76 30 C74 36 67 38 63 34 C67 28 63 22 56 22 C47 22 40 29 37 40 C34 52 42 62 58 66 C72 69 90 68 118 70 Z"
      />
      <path className={styles.trough} d="M2 70 V54 C20 54 36 60 58 66 C76 70 100 69 118 70 Z" />
      <circle className={styles.foam} cx="72" cy="12" r="2" />
      <circle className={styles.foam} cx="80" cy="18" r="1.6" />
      <circle className={styles.foam} cx="82" cy="28" r="1.4" />
      <circle className={styles.foam} cx="94" cy="50" r="1.4" />
      <circle className={styles.sun} cx="102" cy="16" r="9" />
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  action,
  headingLevel = 'h3',
  className,
}: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div className={cx(styles.root, className)}>
      <WaveIllustration />
      <Heading className={styles.title}>{title}</Heading>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
