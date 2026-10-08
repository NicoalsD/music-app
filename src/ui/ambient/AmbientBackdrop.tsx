import { Suspense, lazy, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { petalColors } from './petals';
import { canUseWebGl } from './webgl';
import type { PrintTheme } from '../palette/palette';
import styles from './AmbientBackdrop.module.css';

// three.js lives in its own chunk, fetched only when this scene is first rendered.
const AmbientScene = lazy(() => import('./AmbientScene'));

export interface AmbientBackdropProps {
  theme: PrintTheme;
  playing: boolean;
}

/**
 * Decorative petals drifting behind the Now Playing panels. Renders nothing (and never loads
 * three.js) under prefers-reduced-motion or when WebGL is unavailable.
 */
export function AmbientBackdrop({ theme, playing }: AmbientBackdropProps) {
  const reduceMotion = useReducedMotion() === true;
  const [supported] = useState(canUseWebGl);
  if (reduceMotion || !supported) return null;
  return (
    <div className={styles.layer} aria-hidden="true" data-testid="ambient-backdrop">
      <Suspense fallback={null}>
        <AmbientScene colors={petalColors(theme)} playing={playing} />
      </Suspense>
    </div>
  );
}
