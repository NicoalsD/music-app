import { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cx } from '../cx';
import styles from './Hanko.module.css';

const FILTER_ID = 'hanko-rough-edge';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Defines the irregular-edge filter exactly once per document. */
function ensureRoughFilter(): void {
  if (document.getElementById(FILTER_ID)) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML =
    `<filter id="${FILTER_ID}" x="-5%" y="-5%" width="110%" height="110%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>` +
    `</filter>`;
  document.body.appendChild(svg);
}

export interface HankoProps {
  /** The kanji carved into the seal. Default 再 (play). */
  kanji?: string;
  /** Side length in px. */
  size?: number;
  /** Change this value to replay the stamp entrance (scale 1.15 to 1, rotate -6 to -3 degrees). */
  stampKey?: string | number;
  className?: string | undefined;
}

/** Vermilion seal. Purely decorative (aria-hidden). */
export function Hanko({ kanji = '再', size = 28, stampKey, className }: HankoProps) {
  const reduce = useReducedMotion();
  useEffect(ensureRoughFilter, []);

  const animated = stampKey !== undefined;
  const initial = !animated
    ? false
    : reduce
      ? { opacity: 0, rotate: -3 }
      : { opacity: 0, scale: 1.15, rotate: -6 };

  return (
    <motion.span
      key={stampKey}
      aria-hidden="true"
      className={cx(styles.hanko, className)}
      style={{ width: size, height: size, fontSize: size * 0.68 }}
      initial={initial}
      animate={{ opacity: 1, scale: 1, rotate: -3 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      {kanji}
    </motion.span>
  );
}
