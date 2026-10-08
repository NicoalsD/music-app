import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { activeLineIndex, parseLrc, type LyricLine } from './Lyrics';

describe('parseLrc', () => {
  it('parses mm:ss.xx, mm:ss.xxx and mm:ss timestamps', () => {
    expect(parseLrc('[00:01.50]a\n[00:02.250]b\n[01:03]c')).toEqual([
      { timeMs: 1500, text: 'a' },
      { timeMs: 2250, text: 'b' },
      { timeMs: 63000, text: 'c' },
    ]);
  });

  it('treats a one-digit fraction as tenths and two digits as hundredths', () => {
    expect(parseLrc('[00:01.5]a\n[00:01.05]b')).toEqual([
      { timeMs: 1050, text: 'b' },
      { timeMs: 1500, text: 'a' },
    ]);
  });

  it('expands multiple timestamps on one line', () => {
    expect(parseLrc('[00:10.00][00:20.00] chorus')).toEqual([
      { timeMs: 10000, text: 'chorus' },
      { timeMs: 20000, text: 'chorus' },
    ]);
  });

  it('skips metadata tags and blank or untimed lines', () => {
    const lrc = '[ar:Artist]\n[ti:Title]\n\n   \nplain text\n[00:05.00]hi';
    expect(parseLrc(lrc)).toEqual([{ timeMs: 5000, text: 'hi' }]);
  });

  it('keeps timed lines with empty text as gaps', () => {
    expect(parseLrc('[00:05.00]')).toEqual([{ timeMs: 5000, text: '' }]);
  });

  it('applies a positive offset by moving lyrics earlier and clamps at zero', () => {
    expect(parseLrc('[offset:+200]\n[00:01.00]a\n[00:00.10]b')).toEqual([
      { timeMs: 0, text: 'b' },
      { timeMs: 800, text: 'a' },
    ]);
  });

  it('applies a negative offset and an offset declared after the lines', () => {
    expect(parseLrc('[00:01.00]a\n[offset:-500]')).toEqual([{ timeMs: 1500, text: 'a' }]);
  });

  it('handles CRLF and sorts out-of-order lines stably', () => {
    const result = parseLrc('[00:02.00]b\r\n[00:01.00]first\r\n[00:01.00]second');
    expect(result.map((l) => l.text)).toEqual(['first', 'second', 'b']);
  });

  it('returns an empty array for empty or malformed input', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('[xx:yy]nope\n[00:aa]no')).toEqual([]);
  });

  it('produces time-sorted output for arbitrary input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ m: fc.nat(99), s: fc.nat(59), c: fc.nat(99), t: fc.string() }), {
          maxLength: 30,
        }),
        (rows) => {
          const lrc = rows
            .map(
              (r) =>
                `[${r.m}:${String(r.s).padStart(2, '0')}.${String(r.c).padStart(2, '0')}]${r.t}`,
            )
            .join('\n');
          const lines = parseLrc(lrc);
          for (let i = 1; i < lines.length; i++) {
            expect((lines[i] as LyricLine).timeMs).toBeGreaterThanOrEqual(
              (lines[i - 1] as LyricLine).timeMs,
            );
          }
        },
      ),
    );
  });
});

describe('activeLineIndex', () => {
  const lines: LyricLine[] = [
    { timeMs: 1000, text: 'a' },
    { timeMs: 2000, text: 'b' },
    { timeMs: 3000, text: 'c' },
  ];

  it('returns -1 before the first line and for no lines', () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 999)).toBe(-1);
    expect(activeLineIndex([], 5000)).toBe(-1);
  });

  it('returns the last line at or before the position', () => {
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 2500)).toBe(1);
    expect(activeLineIndex(lines, 3000)).toBe(2);
    expect(activeLineIndex(lines, 99999)).toBe(2);
  });

  it('is monotonic in position and matches a linear scan', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(100000), { maxLength: 40 }),
        fc.nat(120000),
        fc.nat(120000),
        (times, p1, p2) => {
          const sorted = [...times].sort((a, b) => a - b).map((timeMs) => ({ timeMs, text: '' }));
          const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
          expect(activeLineIndex(sorted, lo)).toBeLessThanOrEqual(activeLineIndex(sorted, hi));
          let expected = -1;
          sorted.forEach((l, i) => {
            if (l.timeMs <= hi) expected = i;
          });
          expect(activeLineIndex(sorted, hi)).toBe(expected);
        },
      ),
    );
  });
});
