export type PositionProblem = 'empty' | 'not-integer' | 'out-of-range';

export type ParsedPosition =
  | { readonly ok: true; readonly position: number; readonly index: number }
  | { readonly ok: false; readonly problem: PositionProblem };

const DIGITS = /^\d+$/;

/**
 * Validates a 1-based position typed by the user for a list of `size` songs
 * (valid: 1..size+1) and converts it to the 0-based index the store expects.
 */
export function parsePosition(raw: string, size: number): ParsedPosition {
  const text = raw.trim();
  if (text === '') return { ok: false, problem: 'empty' };
  if (!DIGITS.test(text)) return { ok: false, problem: 'not-integer' };
  const position = Number(text);
  if (position < 1 || position > size + 1) return { ok: false, problem: 'out-of-range' };
  return { ok: true, position, index: position - 1 };
}
