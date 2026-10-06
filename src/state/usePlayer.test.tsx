import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StoreProvider, useProgress, usePlayerSnapshot, useStore } from './usePlayer';
import type { PlayerSnapshot } from './PlayerStore';
import { createHarness, makeTrack } from './test-utils/harness';
import { settle } from '../player/test-utils/FakeAudioOutput';

function wrapperFor(h: ReturnType<typeof createHarness>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <StoreProvider store={h.store}>{children}</StoreProvider>;
  };
}

const songCount = (s: PlayerSnapshot) => s.songs.length;
const summaryOf = (s: PlayerSnapshot) => ({ count: s.songs.length });
const sameCount = (a: { count: number }, b: { count: number }) => a.count === b.count;

describe('usePlayer hooks', () => {
  it('useStore throws outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useStore())).toThrow('StoreProvider');
    spy.mockRestore();
  });

  it('re-renders on changes of the selected value only', () => {
    const h = createHarness();
    let renders = 0;
    function Count() {
      renders++;
      const n = usePlayerSnapshot(songCount);
      return <p>count {n}</p>;
    }
    render(
      <StoreProvider store={h.store}>
        <Count />
      </StoreProvider>,
    );
    expect(screen.getByText('count 0')).toBeInTheDocument();
    const before = renders;
    act(() => h.store.setVolume(0.5));
    expect(renders).toBe(before);
    act(() => h.store.addLast(makeTrack('a')));
    expect(screen.getByText('count 1')).toBeInTheDocument();
  });

  it('returns the whole snapshot without a selector', () => {
    const h = createHarness();
    const { result } = renderHook(() => usePlayerSnapshot(), { wrapper: wrapperFor(h) });
    expect(result.current).toBe(h.store.getSnapshot());
  });

  it('does not loop with a selector that builds a new object when isEqual is given', () => {
    const h = createHarness();
    const { result } = renderHook(() => usePlayerSnapshot(summaryOf, sameCount), {
      wrapper: wrapperFor(h),
    });
    const first = result.current;
    act(() => h.store.setVolume(0.2));
    expect(result.current).toBe(first);
    act(() => h.store.addLast(makeTrack('a')));
    expect(result.current).toEqual({ count: 1 });
  });

  it('useProgress follows the engine progress', async () => {
    const h = createHarness();
    h.store.addLast(makeTrack('a'));
    h.store.togglePlay();
    await settle();
    const { result } = renderHook(() => useProgress(), { wrapper: wrapperFor(h) });
    expect(result.current.positionMs).toBe(0);
    act(() => h.localOutput.emit({ type: 'progress', positionMs: 700, durationMs: 1000 }));
    expect(result.current.positionMs).toBe(700);
  });
});
