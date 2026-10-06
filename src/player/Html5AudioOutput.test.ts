import { describe, expect, it, vi } from 'vitest';
import { Song } from '../core/Song';
import { makeTrack } from '../core/test-utils/fakes';
import type { AudioOutputEvent } from './AudioOutput';
import { Html5AudioOutput } from './Html5AudioOutput';
import type { AudioElementLike } from './Html5AudioOutput';

class FakeAudioElement implements AudioElementLike {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  paused = true;
  playResult: Promise<void> = Promise.resolve();
  readonly calls: string[] = [];
  readonly handlers = new Map<string, Set<() => void>>();

  play(): Promise<void> {
    this.calls.push('play');
    return this.playResult;
  }
  pause(): void {
    this.calls.push('pause');
  }
  load(): void {
    this.calls.push('load');
  }
  addEventListener(type: string, listener: () => void): void {
    const set = this.handlers.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.handlers.get(type)?.delete(listener);
  }
  fire(type: string): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler();
  }
  listenerCount(): number {
    let total = 0;
    for (const set of this.handlers.values()) total += set.size;
    return total;
  }
}

function setup(): {
  element: FakeAudioElement;
  output: Html5AudioOutput;
  events: AudioOutputEvent[];
  song: Song;
} {
  const element = new FakeAudioElement();
  const output = new Html5AudioOutput(element);
  const events: AudioOutputEvent[] = [];
  output.subscribe((event) => events.push(event));
  return { element, output, events, song: new Song(makeTrack('a', 5_000), 'e1') };
}

describe('Html5AudioOutput', () => {
  it('has the local source', () => {
    expect(setup().output.source).toBe('local');
  });

  it('loads a song by setting src and calling load', async () => {
    const { element, output, song } = setup();
    await output.load(song);
    expect(element.src).toBe('blob:a');
    expect(element.calls).toEqual(['load']);
    expect(element.currentTime).toBe(0);
  });

  it('starts from the requested position', async () => {
    const { element, output, song } = setup();
    await output.load(song, 2_500);
    expect(element.currentTime).toBe(2.5);
  });

  it('delegates play, pause, seek and volume to the element', async () => {
    const { element, output } = setup();
    await output.play();
    await output.pause();
    await output.seek(1_500);
    await output.setVolume(0.25);
    expect(element.calls).toEqual(['play', 'pause']);
    expect(element.currentTime).toBe(1.5);
    expect(element.volume).toBe(0.25);
    await output.setVolume(3);
    expect(element.volume).toBe(1);
    await output.setVolume(-1);
    expect(element.volume).toBe(0);
  });

  it('rejects play when the element rejects', async () => {
    const { element, output } = setup();
    element.playResult = Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    await expect(output.play()).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('maps the element events to output events', () => {
    const { element, events } = setup();
    element.fire('playing');
    element.fire('pause');
    element.fire('waiting');
    element.fire('stalled');
    element.fire('ended');
    element.fire('error');
    expect(events.map((event) => event.type)).toEqual([
      'playing',
      'paused',
      'loading',
      'loading',
      'ended',
      'error',
    ]);
    const last = events.at(-1);
    expect(last?.type === 'error' ? last.error.name : null).toBe('PlaybackError');
  });

  it('maps timeupdate to progress using the element duration', () => {
    const { element, events } = setup();
    element.currentTime = 1.25;
    element.duration = 4;
    element.fire('timeupdate');
    expect(events).toEqual([{ type: 'progress', positionMs: 1_250, durationMs: 4_000 }]);
  });

  it('falls back to the song duration while the element duration is unknown', async () => {
    const { element, output, events, song } = setup();
    await output.load(song);
    element.currentTime = 2;
    element.fire('timeupdate');
    expect(events).toEqual([{ type: 'progress', positionMs: 2_000, durationMs: 5_000 }]);
  });

  it('stops notifying after unsubscribe', () => {
    const { element, output } = setup();
    const listener = vi.fn();
    const unsubscribe = output.subscribe(listener);
    element.fire('ended');
    unsubscribe();
    element.fire('ended');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('removes listeners and clears src on dispose, and does so only once', () => {
    const { element, output, events } = setup();
    element.src = 'blob:a';
    expect(element.listenerCount()).toBe(7);
    output.dispose();
    output.dispose();
    expect(element.listenerCount()).toBe(0);
    expect(element.src).toBe('');
    expect(element.calls).toEqual(['pause']);
    element.fire('ended');
    expect(events).toEqual([]);
  });
});
