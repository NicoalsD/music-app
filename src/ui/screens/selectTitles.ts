import type { PlayerSnapshot } from '../../state';

export const selectTitles = (snapshot: PlayerSnapshot): readonly string[] =>
  snapshot.songs.map((s) => s.title);

export const sameTitles = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((title, i) => title === b[i]);
