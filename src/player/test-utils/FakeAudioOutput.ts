import type { Song, SongSource } from '../../core/Song';
import type { AudioOutput, AudioOutputEvent, AudioOutputListener } from '../AudioOutput';

export interface Deferred {
  readonly song: Song;
  resolve(): void;
  reject(error: Error): void;
}

/** Records every call in a (possibly shared) log and lets tests emit events. */
export class FakeAudioOutput implements AudioOutput {
  readonly calls: string[] = [];
  readonly listeners = new Set<AudioOutputListener>();
  /** When true, load() waits until the test settles it through `pendingLoads`. */
  manualLoads = false;
  readonly pendingLoads: Deferred[] = [];
  playError: Error | null = null;
  /** URIs whose load() rejects. */
  readonly failingUris = new Set<string>();
  disposed = false;

  constructor(
    readonly source: SongSource,
    readonly log: string[] = [],
  ) {}

  #record(entry: string): void {
    const line = `${this.source}.${entry}`;
    this.calls.push(entry);
    this.log.push(line);
  }

  count(prefix: string): number {
    return this.calls.filter((call) => call.startsWith(prefix)).length;
  }

  load(song: Song, positionMs = 0): Promise<void> {
    this.#record(`load:${song.uri}@${positionMs}`);
    if (this.failingUris.has(song.uri)) return Promise.reject(new Error(`cannot load ${song.uri}`));
    if (!this.manualLoads) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.pendingLoads.push({ song, resolve, reject });
    });
  }

  play(): Promise<void> {
    this.#record('play');
    return this.playError === null ? Promise.resolve() : Promise.reject(this.playError);
  }

  pause(): Promise<void> {
    this.#record('pause');
    return Promise.resolve();
  }

  seek(positionMs: number): Promise<void> {
    this.#record(`seek:${positionMs}`);
    return Promise.resolve();
  }

  setVolume(volume: number): Promise<void> {
    this.#record(`volume:${volume}`);
    return Promise.resolve();
  }

  subscribe(listener: AudioOutputListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  emit(event: AudioOutputEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** Lets pending promise continuations run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
