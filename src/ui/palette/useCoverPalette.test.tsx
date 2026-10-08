import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoverPalette } from './palette';

const sample = vi.hoisted(() => vi.fn<(url: string) => Promise<CoverPalette | null>>());
vi.mock('./samplePalette', () => ({ samplePalette: sample }));

import { clearCoverPaletteCache, useCoverPalette } from './useCoverPalette';

const red: CoverPalette = {
  dominant: { r: 200, g: 40, b: 40 },
  secondary: { r: 40, g: 180, b: 70 },
  accent: { r: 40, g: 70, b: 200 },
};

describe('useCoverPalette', () => {
  beforeEach(() => {
    clearCoverPaletteCache();
    sample.mockReset();
  });

  it('is null without artwork and never samples', () => {
    const { result } = renderHook(() => useCoverPalette(undefined));
    expect(result.current).toBeNull();
    expect(sample).not.toHaveBeenCalled();
  });

  it('does not sample while disabled', () => {
    renderHook(() => useCoverPalette('off.jpg', false));
    expect(sample).not.toHaveBeenCalled();
  });

  it('returns the sampled palette once and reuses it from the cache', async () => {
    sample.mockResolvedValue(red);
    const first = renderHook(() => useCoverPalette('a.jpg'));
    expect(first.result.current).toBeNull();
    await waitFor(() => expect(first.result.current).toBe(red));
    const second = renderHook(() => useCoverPalette('a.jpg'));
    expect(second.result.current).toBe(red);
    expect(sample).toHaveBeenCalledTimes(1);
  });

  it('keeps the fallback when sampling fails', async () => {
    sample.mockResolvedValue(null);
    const { result } = renderHook(() => useCoverPalette('broken.jpg'));
    await waitFor(() => expect(sample).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('keeps the previous palette while the next cover loads, and drops it without artwork', async () => {
    sample.mockResolvedValueOnce(red).mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(({ url }) => useCoverPalette(url), {
      initialProps: { url: 'one.jpg' as string | undefined },
    });
    await waitFor(() => expect(result.current).toBe(red));
    rerender({ url: 'two.jpg' });
    expect(result.current).toBe(red);
    rerender({ url: undefined });
    expect(result.current).toBeNull();
  });
});
