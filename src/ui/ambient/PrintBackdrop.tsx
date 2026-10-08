import styles from './PrintBackdrop.module.css';

const PATTERN_ID = 'np-seigaiha';

/**
 * The woodblock-print composition behind Now Playing: a flat field of the cover colour, a large
 * sun disc, a seigaiha wave band along the bottom and a washi grain. Flat shapes only; the
 * colours come from the `--np-*` custom properties set on the dialog root.
 */
export function PrintBackdrop() {
  return (
    <div className={styles.print} aria-hidden="true" data-testid="print-backdrop">
      <div className={styles.sun} />
      <svg className={styles.waves} width="100%" height="100%" focusable="false">
        <defs>
          <pattern id={PATTERN_ID} width="48" height="24" patternUnits="userSpaceOnUse">
            <g className={styles.scale}>
              <circle cx="0" cy="12" r="22" />
              <circle cx="0" cy="12" r="15" />
              <circle cx="0" cy="12" r="8" />
              <circle cx="48" cy="12" r="22" />
              <circle cx="48" cy="12" r="15" />
              <circle cx="48" cy="12" r="8" />
              <circle cx="24" cy="24" r="22" />
              <circle cx="24" cy="24" r="15" />
              <circle cx="24" cy="24" r="8" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${PATTERN_ID})`} />
      </svg>
      <div className={styles.grain} />
    </div>
  );
}
