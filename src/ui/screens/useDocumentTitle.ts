import { useEffect } from 'react';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { strings } from '../i18n/es';

const selectTitle = (s: PlayerSnapshot): string => {
  const current = s.songs[s.currentIndex];
  if (s.player.status !== 'playing' || current === undefined) return strings.app.name;
  const artists = current.artistLabel;
  return artists === '' ? `▶ ${current.title}` : `▶ ${current.title} · ${artists}`;
};

/** Keeps the tab title in sync: "▶ Title · Artist" while playing, the app name otherwise. */
export function useDocumentTitle(): void {
  const title = usePlayerSnapshot(selectTitle);
  useEffect(() => {
    document.title = title;
  }, [title]);
}
