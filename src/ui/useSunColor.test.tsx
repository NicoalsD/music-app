import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sample = vi.hoisted(() => vi.fn<(url: string) => Promise<string | null>>());
vi.mock('./dominantColor', () => ({ sampleSunColor: sample }));

import { useSunColor } from './useSunColor';

describe('useSunColor', () => {
  beforeEach(() => sample.mockReset());

  it('is null without artwork and never samples', () => {
    const { result } = renderHook(() => useSunColor(undefined));
    expect(result.current).toBeNull();
    expect(sample).not.toHaveBeenCalled();
  });

  it('returns the sampled colour once and reuses it from the cache', async () => {
    sample.mockResolvedValue('hsl(10 50% 50%)');
    const first = renderHook(() => useSunColor('a.jpg'));
    expect(first.result.current).toBeNull();
    await waitFor(() => expect(first.result.current).toBe('hsl(10 50% 50%)'));
    const second = renderHook(() => useSunColor('a.jpg'));
    expect(second.result.current).toBe('hsl(10 50% 50%)');
    expect(sample).toHaveBeenCalledTimes(1);
  });

  it('keeps the fallback when sampling fails', async () => {
    sample.mockResolvedValue(null);
    const { result } = renderHook(() => useSunColor('broken.jpg'));
    await waitFor(() => expect(sample).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('drops the colour of a previous URL while the next one loads', async () => {
    sample
      .mockResolvedValueOnce('hsl(1 50% 50%)')
      .mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(({ url }) => useSunColor(url), {
      initialProps: { url: 'one.jpg' },
    });
    await waitFor(() => expect(result.current).toBe('hsl(1 50% 50%)'));
    rerender({ url: 'two.jpg' });
    expect(result.current).toBeNull();
  });
});
