import { PlaybackError } from '../core/errors';
import type { Song, SongSource } from '../core/Song';
import type { AudioOutput, AudioOutputEvent, AudioOutputListener } from './AudioOutput';

/** The subset of HTMLAudioElement that Html5AudioOutput relies on. */
export interface AudioElementLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  volume: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** AudioOutput for local files, backed by an <audio> element. */
export class Html5AudioOutput implements AudioOutput {
  readonly source: SongSource = 'local';
  readonly #element: AudioElementLike;
  readonly #listeners = new Set<AudioOutputListener>();
  readonly #domHandlers = new Map<string, () => void>();
  #fallbackDurationMs = 0;
  #disposed = false;

  constructor(element: AudioElementLike) {
    this.#element = element;
    this.#bind('ended', () => this.#emit({ type: 'ended' }));
    this.#bind('timeupdate', () => this.#emitProgress());
    this.#bind('playing', () => this.#emit({ type: 'playing' }));
    this.#bind('pause', () => this.#emit({ type: 'paused' }));
    this.#bind('waiting', () => this.#emit({ type: 'loading' }));
    this.#bind('stalled', () => this.#emit({ type: 'loading' }));
    this.#bind('error', () =>
      this.#emit({ type: 'error', error: new PlaybackError('Audio element reported an error') }),
    );
  }

  async load(song: Song, positionMs = 0): Promise<void> {
    this.#fallbackDurationMs = song.durationMs;
    this.#element.src = song.uri;
    this.#element.load();
    if (positionMs > 0) this.#element.currentTime = positionMs / 1000;
  }

  async play(): Promise<void> {
    await this.#element.play();
  }

  async pause(): Promise<void> {
    this.#element.pause();
  }

  async seek(positionMs: number): Promise<void> {
    this.#element.currentTime = positionMs / 1000;
  }

  async setVolume(volume: number): Promise<void> {
    this.#element.volume = Math.min(Math.max(volume, 0), 1);
  }

  subscribe(listener: AudioOutputListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const [type, handler] of this.#domHandlers) {
      this.#element.removeEventListener(type, handler);
    }
    this.#domHandlers.clear();
    this.#listeners.clear();
    this.#element.pause();
    this.#element.src = '';
  }

  #bind(type: string, handler: () => void): void {
    this.#domHandlers.set(type, handler);
    this.#element.addEventListener(type, handler);
  }

  #emitProgress(): void {
    const duration = this.#element.duration;
    const durationMs = Number.isFinite(duration) ? duration * 1000 : this.#fallbackDurationMs;
    this.#emit({ type: 'progress', positionMs: this.#element.currentTime * 1000, durationMs });
  }

  #emit(event: AudioOutputEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}
