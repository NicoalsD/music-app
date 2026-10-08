/** One timed line of synced lyrics. An empty `text` marks an instrumental gap. */
export interface LyricLine {
  readonly timeMs: number;
  readonly text: string;
}

export type Lyrics =
  | { readonly kind: 'synced'; readonly lines: readonly LyricLine[] }
  | { readonly kind: 'plain'; readonly lines: readonly string[] }
  | { readonly kind: 'instrumental' };

const TAG_PREFIX = /^\s*((?:\[[^\]]*\]\s*)+)/;
const TAG = /\[([^\]]*)\]/g;
const TIME_TAG = /^(\d+):(\d{1,2})(?:[.:](\d{1,3}))?$/;
const OFFSET_TAG = /^offset\s*:\s*([+-]?\d+)$/i;

function toMs(minutes: string, seconds: string, fraction: string | undefined): number {
  const ms = fraction === undefined ? 0 : Number.parseInt(fraction.padEnd(3, '0'), 10);
  return (Number.parseInt(minutes, 10) * 60 + Number.parseInt(seconds, 10)) * 1000 + ms;
}

/**
 * Parses LRC text into time-sorted lines. Supports `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss.xxx]`,
 * several timestamps per line and metadata tags. Per the LRC convention, a positive
 * `[offset:ms]` makes lyrics appear earlier (it is subtracted from every time).
 * Malformed input yields fewer or no lines; it never throws. Equal times keep source order.
 */
export function parseLrc(lrc: string): LyricLine[] {
  let offsetMs = 0;
  const raw: LyricLine[] = [];
  for (const line of lrc.split(/\r\n|\r|\n/)) {
    const prefix = TAG_PREFIX.exec(line);
    if (prefix === null) continue;
    const text = line.slice(prefix[0].length).trim();
    const times: number[] = [];
    for (const match of (prefix[1] ?? '').matchAll(TAG)) {
      const body = (match[1] ?? '').trim();
      const time = TIME_TAG.exec(body);
      if (time !== null) {
        times.push(toMs(time[1] ?? '0', time[2] ?? '0', time[3]));
        continue;
      }
      const offset = OFFSET_TAG.exec(body);
      if (offset !== null) offsetMs = Number.parseInt(offset[1] ?? '0', 10);
    }
    for (const timeMs of times) raw.push({ timeMs, text });
  }
  const shifted = raw.map((line) => ({ ...line, timeMs: Math.max(0, line.timeMs - offsetMs) }));
  // Array.prototype.sort is stable, so equal times keep source order.
  return shifted.sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the last line whose time is <= positionMs, or -1 before the first line. */
export function activeLineIndex(lines: readonly LyricLine[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    // mid is within bounds by the loop condition
    if ((lines[mid] as LyricLine).timeMs <= positionMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
