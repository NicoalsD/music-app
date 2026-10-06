import { PlaybackError } from '../core/errors';
import type { Song, SongSource } from '../core/Song';
import type { AudioOutput, AudioOutputListener } from '../player/AudioOutput';
import type { UnavailableRegistry } from './persistence';

/**
 * Decorator that refuses to load restored local entries (their audio is gone),
 * so the engine's regular failure path skips them.
 */
export class UnavailableGuardOutput implements AudioOutput {
  readonly #inner: AudioOutput;
  readonly #unavailable: UnavailableRegistry;

  constructor(inner: AudioOutput, unavailable: UnavailableRegistry) {
    this.#inner = inner;
    this.#unavailable = unavailable;
  }

  get source(): SongSource {
    return this.#inner.source;
  }

  load(song: Song, positionMs?: number): Promise<void> {
    if (this.#unavailable.has(song.trackId)) {
      return Promise.reject(new PlaybackError(`Local file is unavailable: ${song.title}`));
    }
    return this.#inner.load(song, positionMs);
  }

  play(): Promise<void> {
    return this.#inner.play();
  }

  pause(): Promise<void> {
    return this.#inner.pause();
  }

  seek(positionMs: number): Promise<void> {
    return this.#inner.seek(positionMs);
  }

  setVolume(volume: number): Promise<void> {
    return this.#inner.setVolume(volume);
  }

  subscribe(listener: AudioOutputListener): () => void {
    return this.#inner.subscribe(listener);
  }

  dispose(): void {
    this.#inner.dispose();
  }
}
