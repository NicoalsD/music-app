import { describe, expect, it } from 'vitest';
import { buildTheme } from '../palette/palette';
import { fromHex } from '../palette/color';
import {
  MAX_PETALS,
  MIN_PETALS,
  SPEED_PAUSED,
  SPEED_PLAYING,
  createPetals,
  petalColors,
  petalCount,
  stepPetal,
  targetSpeed,
} from './petals';

/** Deterministic pseudo-random sequence in [0, 1). */
function sequence(): () => number {
  let seed = 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const bounds = { width: 800, height: 600 };

describe('petals', () => {
  it('scales the count with the viewport inside the allowed range', () => {
    expect(petalCount({ width: 360, height: 640 })).toBe(MIN_PETALS);
    expect(petalCount({ width: 1920, height: 1080 })).toBe(130);
    expect(petalCount({ width: 5000, height: 3000 })).toBe(MAX_PETALS);
  });

  it('creates petals inside the viewport with a valid tone', () => {
    const petals = createPetals(100, bounds, sequence());
    expect(petals).toHaveLength(100);
    for (const petal of petals) {
      expect(petal.x).toBeGreaterThanOrEqual(0);
      expect(petal.x).toBeLessThanOrEqual(bounds.width);
      expect(petal.y).toBeGreaterThanOrEqual(0);
      expect(petal.y).toBeLessThanOrEqual(bounds.height);
      expect([0, 1, 2]).toContain(petal.tone);
    }
  });

  it('is deterministic for the same random source', () => {
    expect(createPetals(10, bounds, sequence())).toEqual(createPetals(10, bounds, sequence()));
  });

  it('falls and rotates at full speed, and more slowly when the speed drops', () => {
    const fast = createPetals(1, bounds, sequence());
    const slow = createPetals(1, bounds, sequence());
    const [a] = fast;
    const [b] = slow;
    if (a === undefined || b === undefined) throw new Error('expected petals');
    a.y = 100;
    b.y = 100;
    stepPetal(a, 1, 0, bounds, SPEED_PLAYING, sequence());
    stepPetal(b, 1, 0, bounds, SPEED_PAUSED, sequence());
    expect(a.y).toBeGreaterThan(100);
    expect(b.y).toBeGreaterThan(100);
    expect(a.y - 100).toBeGreaterThan(b.y - 100);
  });

  it('does not move at speed zero', () => {
    const [petal] = createPetals(1, bounds, sequence());
    if (petal === undefined) throw new Error('expected a petal');
    const before = { ...petal };
    stepPetal(petal, 1, 3, bounds, 0, sequence());
    expect(petal).toEqual(before);
  });

  it('respawns above the top when a petal leaves the bottom', () => {
    const [petal] = createPetals(1, bounds, sequence());
    if (petal === undefined) throw new Error('expected a petal');
    petal.y = bounds.height + petal.size + 1;
    stepPetal(petal, 0.01, 0, bounds, 1, () => 0.5);
    expect(petal.y).toBeLessThan(0);
    expect(petal.x).toBe(bounds.width * 0.5);
  });

  it('wraps petals that drift off either side', () => {
    const [petal] = createPetals(1, bounds, sequence());
    if (petal === undefined) throw new Error('expected a petal');
    petal.y = 10;
    petal.x = bounds.width + petal.size + 5;
    stepPetal(petal, 0.001, 0, bounds, 1, sequence());
    expect(petal.x).toBeLessThan(0);
    petal.x = -petal.size - 5;
    petal.swayAmp = 0;
    stepPetal(petal, 0.001, 0, bounds, 1, sequence());
    expect(petal.x).toBeGreaterThan(bounds.width);
  });

  it('maps playback state to a target speed', () => {
    expect(targetSpeed(true)).toBe(SPEED_PLAYING);
    expect(targetSpeed(false)).toBe(SPEED_PAUSED);
  });

  it('derives three petal tints from the theme', () => {
    const theme = buildTheme(null);
    const [sun, accent, soft] = petalColors(theme);
    expect(sun).toBe(theme.sun);
    expect(accent).toBe(theme.accent);
    expect(fromHex(soft)).toBeDefined();
  });
});
