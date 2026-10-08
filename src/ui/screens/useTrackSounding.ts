import type { Track } from '../../core/Song';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot } from '../../state';

interface NowSounding {
  readonly trackId: string | null;
  readonly playing: boolean;
}

const selectSounding = (s: PlayerSnapshot): NowSounding => ({
  trackId: s.songs[s.currentIndex]?.trackId ?? null,
  playing: s.player.status === 'playing',
});

const sameSounding = (a: NowSounding, b: NowSounding): boolean =>
  a.trackId === b.trackId && a.playing === b.playing;

/** Is this catalog track the current song, and is it sounding right now. */
export function useTrackSounding(track: Track): { isCurrent: boolean; playing: boolean } {
  const sounding = usePlayerSnapshot(selectSounding, sameSounding);
  const isCurrent = sounding.trackId === track.trackId;
  return { isCurrent, playing: isCurrent && sounding.playing };
}
