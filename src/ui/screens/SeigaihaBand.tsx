import styles from './SeigaihaBand.module.css';

const PATTERN_ID = 'seigaiha-pattern';

/** Decorative strip of seigaiha (fan-shaped waves) under the header. Flat colors, low opacity. */
export function SeigaihaBand() {
  return (
    <svg className={styles.band} aria-hidden="true" focusable="false" width="100%" height="28">
      <defs>
        <pattern id={PATTERN_ID} width="40" height="20" patternUnits="userSpaceOnUse">
          <g className={styles.wave}>
            <circle cx="20" cy="20" r="19" className={styles.jade} />
            <circle cx="20" cy="20" r="13" className={styles.paper} />
            <circle cx="20" cy="20" r="7" className={styles.ai} />
            <circle cx="0" cy="10" r="19" className={styles.jade} />
            <circle cx="0" cy="10" r="13" className={styles.paper} />
            <circle cx="0" cy="10" r="7" className={styles.ai} />
            <circle cx="40" cy="10" r="19" className={styles.jade} />
            <circle cx="40" cy="10" r="13" className={styles.paper} />
            <circle cx="40" cy="10" r="7" className={styles.ai} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${PATTERN_ID})`} />
    </svg>
  );
}
