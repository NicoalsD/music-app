import { cx } from '../cx';
import styles from './Equalizer.module.css';

export interface EqualizerProps {
  /** Bars move only while the song is actually playing. Reduced motion keeps them still. */
  animated: boolean;
  className?: string | undefined;
}

/** Three bars that mark the song that is sounding. Decorative: the row also has hidden text. */
export function Equalizer({ animated, className }: EqualizerProps) {
  return (
    <span
      className={cx(styles.equalizer, className)}
      data-animated={animated ? 'true' : 'false'}
      data-testid="equalizer"
      aria-hidden="true"
    >
      <span className={styles.bar} />
      <span className={styles.bar} />
      <span className={styles.bar} />
    </span>
  );
}
