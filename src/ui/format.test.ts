import { formatTime } from './format';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(83_000)).toBe('1:23');
    expect(formatTime(225_000)).toBe('3:45');
  });

  it('pads seconds and floors partial seconds', () => {
    expect(formatTime(5_999)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });

  it('adds hours from one hour up', () => {
    expect(formatTime(3_600_000)).toBe('1:00:00');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });

  it('clamps negative and non-finite values to zero', () => {
    expect(formatTime(-500)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});
