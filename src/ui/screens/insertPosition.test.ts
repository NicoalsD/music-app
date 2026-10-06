import { parsePosition } from './insertPosition';

describe('parsePosition', () => {
  it('converts 1-based positions to 0-based indexes at the extremes', () => {
    expect(parsePosition('1', 5)).toEqual({ ok: true, position: 1, index: 0 });
    expect(parsePosition('6', 5)).toEqual({ ok: true, position: 6, index: 5 });
    expect(parsePosition(' 3 ', 5)).toEqual({ ok: true, position: 3, index: 2 });
  });

  it('accepts only position 1 for an empty list', () => {
    expect(parsePosition('1', 0)).toEqual({ ok: true, position: 1, index: 0 });
    expect(parsePosition('2', 0)).toEqual({ ok: false, problem: 'out-of-range' });
  });

  it('rejects zero and size + 2', () => {
    expect(parsePosition('0', 5)).toEqual({ ok: false, problem: 'out-of-range' });
    expect(parsePosition('7', 5)).toEqual({ ok: false, problem: 'out-of-range' });
  });

  it('rejects empty, decimal, negative and text input', () => {
    expect(parsePosition('', 5)).toEqual({ ok: false, problem: 'empty' });
    expect(parsePosition('   ', 5)).toEqual({ ok: false, problem: 'empty' });
    expect(parsePosition('2.5', 5)).toEqual({ ok: false, problem: 'not-integer' });
    expect(parsePosition('-1', 5)).toEqual({ ok: false, problem: 'not-integer' });
    expect(parsePosition('abc', 5)).toEqual({ ok: false, problem: 'not-integer' });
  });
});
