export const STAGGER_S = 0.03;
export const MAX_STAGGERED = 8;

/** Delay for the nth item of a staggered group, in seconds (30ms steps, 8 items max). */
export function staggerDelay(index: number): number {
  return index < MAX_STAGGERED ? index * STAGGER_S : 0;
}
