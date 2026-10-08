import { moveTargetForKey, resolveMove } from './useEntryMover';

const key = (k: string, extra: Partial<Parameters<typeof moveTargetForKey>[0]> = {}) => ({
  key: k,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...extra,
});

describe('resolveMove', () => {
  it.each([
    [1, 'up', 0],
    [1, 'down', 2],
    [2, 'first', 0],
    [0, 'last', 3],
  ] as const)('moves index %s with %s to %s', (index, target, expected) => {
    expect(resolveMove(index, 4, target)).toBe(expected);
  });

  it('returns null when nothing would change', () => {
    expect(resolveMove(0, 4, 'up')).toBeNull();
    expect(resolveMove(0, 4, 'first')).toBeNull();
    expect(resolveMove(3, 4, 'down')).toBeNull();
    expect(resolveMove(3, 4, 'last')).toBeNull();
    expect(resolveMove(0, 1, 'down')).toBeNull();
  });

  it('never goes above the minimum index (the queue stays below the current song)', () => {
    expect(resolveMove(3, 5, 'up', 3)).toBeNull();
    expect(resolveMove(4, 5, 'first', 3)).toBe(3);
    expect(resolveMove(4, 5, 'up', 3)).toBe(3);
    expect(resolveMove(1, 5, 'first', 3)).toBeNull();
  });
});

describe('moveTargetForKey', () => {
  it('maps Alt+Arrow/Home/End', () => {
    expect(moveTargetForKey(key('ArrowUp'))).toBe('up');
    expect(moveTargetForKey(key('ArrowDown'))).toBe('down');
    expect(moveTargetForKey(key('Home'))).toBe('first');
    expect(moveTargetForKey(key('End'))).toBe('last');
  });

  it('ignores keys without Alt, with other modifiers, or unrelated keys', () => {
    expect(moveTargetForKey(key('ArrowUp', { altKey: false }))).toBeNull();
    expect(moveTargetForKey(key('ArrowUp', { shiftKey: true }))).toBeNull();
    expect(moveTargetForKey(key('ArrowUp', { ctrlKey: true }))).toBeNull();
    expect(moveTargetForKey(key('ArrowUp', { metaKey: true }))).toBeNull();
    expect(moveTargetForKey(key('ArrowLeft'))).toBeNull();
  });
});
