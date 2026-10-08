/** Where the active line rests, as a fraction of the visible height: centred, like the QML client. */
export const ACTIVE_LINE_POSITION = 0.5;

/** Lines further than this from the active one all look the same, so they never re-render. */
export const MAX_LINE_DISTANCE = 3;

export type LineState = 'past' | 'active' | 'upcoming';

/** State of line `index` when the line at `active` is being sung (-1 before the first line). */
export function lineState(index: number, active: number): LineState {
  if (index === active) return 'active';
  return index < active ? 'past' : 'upcoming';
}

/** How many lines away from the active one `index` is, capped at MAX_LINE_DISTANCE. */
export function lineDistance(index: number, active: number): number {
  return Math.min(Math.abs(index - active), MAX_LINE_DISTANCE);
}
