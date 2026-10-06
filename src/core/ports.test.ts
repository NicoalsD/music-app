import { describe, expect, it } from 'vitest';
import { mathRandom, systemClock, uuidGenerator } from './ports';

describe('system ports', () => {
  it('provide real clock, random and ids', () => {
    expect(typeof systemClock.now()).toBe('number');
    const r = mathRandom.next();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    expect(uuidGenerator.next()).not.toBe(uuidGenerator.next());
  });
});
