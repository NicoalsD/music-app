import { describe, expect, it } from 'vitest';
import { Song } from './Song';
import { CounterIds, makeTrack } from './test-utils/fakes';

describe('Song', () => {
  it('copies track data and joins artists', () => {
    const track = { ...makeTrack('t'), artists: ['A', 'B'] };
    const song = Song.fromTrack(track, new CounterIds('e'));
    expect(song.entryId).toBe('e-1');
    expect(song.trackId).toBe('t');
    expect(song.artistLabel).toBe('A, B');
  });
});
