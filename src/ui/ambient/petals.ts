import type { PrintTheme } from '../palette/palette';
import { fromHex, mix, toHex } from '../palette/color';

export const MIN_PETALS = 60;
export const MAX_PETALS = 150;
/** One petal per this many square pixels of viewport. */
const AREA_PER_PETAL = 16_000;
/** Drift multiplier while playing and while paused. */
export const SPEED_PLAYING = 1;
export const SPEED_PAUSED = 0.3;

export interface Bounds {
  readonly width: number;
  readonly height: number;
}

/** One falling petal. Mutable on purpose: the render loop updates ~100 of them per frame. */
export interface Petal {
  x: number;
  /** Distance fallen from the top edge, in px (grows downward). */
  y: number;
  /** Size in px. */
  size: number;
  /** Fall speed in px/s at speed 1. */
  fall: number;
  /** Horizontal sway amplitude (px/s) and angular frequency (rad/s). */
  swayAmp: number;
  swayFreq: number;
  phase: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  /** Index into the petal colours. */
  tone: number;
}

export function petalCount({ width, height }: Bounds): number {
  const count = Math.round((width * height) / AREA_PER_PETAL);
  return Math.min(MAX_PETALS, Math.max(MIN_PETALS, count));
}

/** Creates `count` petals spread over the viewport. `random` returns values in [0, 1). */
export function createPetals(count: number, bounds: Bounds, random: () => number): Petal[] {
  return Array.from({ length: count }, () => {
    const size = 14 + random() * 18;
    return {
      x: random() * bounds.width,
      y: random() * bounds.height,
      size,
      // Smaller petals are further away, so they fall slower.
      fall: 18 + (size / 32) * 22 + random() * 10,
      swayAmp: 14 + random() * 22,
      swayFreq: 0.4 + random() * 0.7,
      phase: random() * Math.PI * 2,
      rotX: random() * Math.PI * 2,
      rotY: random() * Math.PI * 2,
      rotZ: random() * Math.PI * 2,
      spinX: (random() - 0.5) * 1.6,
      spinY: (random() - 0.5) * 1.6,
      spinZ: (random() - 0.5) * 0.8,
      tone: Math.floor(random() * 3),
    };
  });
}

/**
 * Advances one petal by `dt` seconds. `time` is the scene clock, used for the wind sway;
 * `speed` scales the whole drift (slow while paused). A petal that leaves the bottom re-enters
 * above the top at a new x; one that drifts off a side wraps around.
 */
export function stepPetal(
  petal: Petal,
  dt: number,
  time: number,
  bounds: Bounds,
  speed: number,
  random: () => number,
): void {
  const wind = Math.sin(time * petal.swayFreq + petal.phase) * petal.swayAmp;
  petal.x += (wind + 6) * dt * speed;
  petal.y += petal.fall * dt * speed;
  petal.rotX += petal.spinX * dt * speed;
  petal.rotY += petal.spinY * dt * speed;
  petal.rotZ += petal.spinZ * dt * speed;
  const margin = petal.size;
  if (petal.y > bounds.height + margin) {
    petal.y = -margin;
    petal.x = random() * bounds.width;
  }
  if (petal.x > bounds.width + margin) petal.x = -margin;
  else if (petal.x < -margin) petal.x = bounds.width + margin;
}

/** Target speed multiplier for the playback state. */
export function targetSpeed(playing: boolean): number {
  return playing ? SPEED_PLAYING : SPEED_PAUSED;
}

/** Three petal tints taken from the page theme: the sun, the wave and a softened text colour. */
export function petalColors(theme: PrintTheme): [string, string, string] {
  const field = fromHex(theme.field);
  return [theme.sun, theme.accent, toHex(mix(fromHex(theme.text), field, 0.35))];
}
