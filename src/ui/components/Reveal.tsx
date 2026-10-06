import { Children, isValidElement, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { MAX_STAGGERED, STAGGER_S, staggerDelay } from './stagger';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export interface RevealProps {
  children?: ReactNode;
  /** Seconds. Capped to the stagger ceiling so late items never feel slow. */
  delay?: number;
  as?: 'div' | 'li' | 'section';
  className?: string | undefined;
}

const MAX_DELAY_S = (MAX_STAGGERED - 1) * STAGGER_S;

/** Fades in (opacity 0 to 1) and rises 8px to 0 once, in 400ms, when scrolled into view. */
export function Reveal({ children, delay = 0, as = 'div', className }: RevealProps) {
  const reduce = useReducedMotion();
  const Tag = as === 'li' ? motion.li : as === 'section' ? motion.section : motion.div;
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        duration: 0.4,
        ease: EASE_OUT,
        delay: Math.min(Math.max(delay, 0), MAX_DELAY_S),
      }}
    >
      {children}
    </Tag>
  );
}

export interface RevealListProps {
  children?: ReactNode;
  as?: 'ul' | 'ol';
  className?: string | undefined;
  itemClassName?: string | undefined;
}

/** List whose items reveal with a 30ms stagger (only the first 8 are staggered). */
export function RevealList({ children, as = 'ul', className, itemClassName }: RevealListProps) {
  const Wrapper = as;
  return (
    <Wrapper className={className}>
      {Children.toArray(children).map((child, index) => (
        <Reveal
          key={isValidElement(child) && child.key !== null ? child.key : index}
          as="li"
          delay={staggerDelay(index)}
          {...(itemClassName ? { className: itemClassName } : {})}
        >
          {child}
        </Reveal>
      ))}
    </Wrapper>
  );
}
