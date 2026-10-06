import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { Swallow } from './Swallow';
import styles from './BackdropScene.module.css';

export interface BackdropSceneProps {
  /** CSS color for the sun, e.g. tinted from the current artwork. Defaults to --shu. */
  sunColor?: string;
}

/** Blossom positions along the branch: x, y, rotation, scale. */
const BLOSSOMS: ReadonlyArray<readonly [number, number, number, number]> = [
  [118, 152, 10, 1],
  [186, 118, -14, 0.85],
  [252, 96, 22, 1.1],
  [322, 74, 0, 0.9],
  [388, 52, -20, 1],
  [92, 214, 30, 0.8],
  [214, 168, 8, 0.75],
  [296, 134, -8, 0.8],
];

const FOAM: ReadonlyArray<readonly [number, number, number]> = [
  [338, 52, 5],
  [358, 70, 4],
  [372, 94, 5],
  [376, 120, 3.5],
  [322, 40, 3.5],
  [300, 30, 3],
  [390, 74, 2.5],
  [270, 22, 2.5],
  [420, 150, 3],
  [450, 230, 3.5],
  [480, 262, 2.5],
  [150, 300, 3],
  [90, 280, 2.5],
  [410, 330, 2.5],
];

function Blossom({ x, y, rot, s }: { x: number; y: number; rot: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          className={styles.petal}
          transform={`rotate(${a})`}
          d="M0 -2 C-5 -8 -4 -15 0 -15 C4 -15 5 -8 0 -2 Z"
        />
      ))}
      <circle className={styles.stamen} r="2.2" />
    </g>
  );
}

/**
 * Fixed full-viewport scene behind everything: washi paper, vermilion sun,
 * indigo and jade great wave, sakura branch and swallows on wires.
 * Flat fills only, no gradients. Parallax: sun +24px, wave -16px over the full
 * scroll; static with prefers-reduced-motion.
 */
export function BackdropScene({ sunColor }: BackdropSceneProps) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const sunY = useTransform(scrollYProgress, [0, 1], [0, 24]);
  const waveY = useTransform(scrollYProgress, [0, 1], [0, -16]);

  return (
    <div className={styles.scene} aria-hidden="true" data-testid="backdrop-scene">
      <motion.div className={styles.sun} style={reduce ? {} : { y: sunY }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%" focusable="false">
          <circle
            className={styles.sunDisc}
            cx="50"
            cy="50"
            r="49"
            style={sunColor ? { fill: sunColor } : undefined}
          />
        </svg>
      </motion.div>

      <svg className={styles.wires} viewBox="0 0 400 140" focusable="false">
        <path className={styles.wire} d="M0 30 C120 52 260 52 400 24" />
        <path className={styles.wire} d="M0 62 C140 86 270 84 400 56" />
        <path className={styles.wire} d="M0 96 C130 118 280 116 400 90" />
      </svg>
      <div className={styles.swallowA}>
        <Swallow width={26} />
      </div>
      <div className={styles.swallowB}>
        <Swallow width={22} />
      </div>
      <div className={styles.swallowC}>
        <Swallow width={24} />
      </div>

      <svg className={styles.branch} viewBox="0 0 440 260" focusable="false">
        <path
          className={styles.bough}
          d="M440 8 C380 24 330 40 280 78 C230 114 170 130 110 168 C80 188 50 206 20 244"
        />
        <path className={styles.twig} d="M330 44 C352 56 372 62 400 60" />
        <path className={styles.twig} d="M222 108 C238 138 262 150 292 150" />
        <path className={styles.twig} d="M150 142 C140 172 120 196 96 214" />
        {BLOSSOMS.map(([x, y, rot, s]) => (
          <Blossom key={`${x}-${y}`} x={x} y={y} rot={rot} s={s} />
        ))}
      </svg>

      <motion.div className={styles.wave} style={reduce ? {} : { y: waveY }}>
        <svg viewBox="0 0 560 420" width="100%" height="100%" focusable="false">
          <path
            className={styles.sea}
            d="M0 420 V214 C40 196 92 154 132 104 C164 64 214 30 272 34 C334 38 376 80 362 130 C354 162 322 170 302 150 C320 122 302 94 270 92 C228 90 190 122 172 172 C152 232 192 304 262 334 C334 364 430 384 560 420 Z"
          />
          <path
            className={styles.trough}
            d="M0 420 V318 C84 316 154 340 262 380 C340 408 450 412 560 420 Z"
          />
          <path
            className={styles.crestLine}
            d="M132 104 C164 64 214 30 272 34 C334 38 376 80 362 130"
          />
          <path
            className={styles.claw}
            d="M362 130 C372 150 366 172 346 184 C352 164 350 146 340 136 Z"
          />
          {FOAM.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} className={styles.foam} cx={x} cy={y} r={r} />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
