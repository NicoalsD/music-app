import type { Song, SongSource } from '../core/Song';

export type AudioOutputEvent =
  | { type: 'ended' }
  | { type: 'progress'; positionMs: number; durationMs: number }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'loading' }
  | { type: 'error'; error: Error };

export type AudioOutputListener = (event: AudioOutputEvent) => void;

/**
 * Strategy for actually producing sound. PlayerEngine picks one per song
 * based on `song.source`. Implementations: SpotifyOutput, Html5AudioOutput.
 */
export interface AudioOutput {
  readonly source: SongSource;
  /** Prepares the song and starts from positionMs (default 0). Does not play. */
  load(song: Song, positionMs?: number): Promise<void>;
  /** Rejects (e.g. NotAllowedError) if the browser blocks playback. */
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** 0..1 */
  setVolume(volume: number): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(listener: AudioOutputListener): () => void;
  dispose(): void;
}
