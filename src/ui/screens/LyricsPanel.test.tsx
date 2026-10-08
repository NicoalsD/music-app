import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { makeTrack } from '../../core/test-utils/fakes';
import type { Lyrics } from '../../core/Lyrics';
import { settle } from '../../player/test-utils/FakeAudioOutput';
import { LyricsProviderScope } from '../../state';
import { FakeLyricsProvider } from '../../state/test-utils/FakeLyricsProvider';
import { strings } from '../i18n/es';
import { LyricsPanel, MANUAL_SCROLL_PAUSE_MS } from './LyricsPanel';
import { ACTIVE_LINE_POSITION, MAX_LINE_DISTANCE, lineDistance, lineState } from './lyricsLines';
import { renderWithStore } from './test-utils/render';

const synced: Lyrics = {
  kind: 'synced',
  lines: [
    { timeMs: 0, text: 'First line' },
    { timeMs: 1_000, text: 'Second line' },
    { timeMs: 2_000, text: '' },
    { timeMs: 3_000, text: 'Third line' },
  ],
};

async function setup(
  result: ConstructorParameters<typeof FakeLyricsProvider>[0],
  withSong = true,
  variant: 'full' | 'side' = 'full',
) {
  const provider = new FakeLyricsProvider(result);
  const wrap = (ui: ReactNode) => (
    <LyricsProviderScope provider={provider}>{ui}</LyricsProviderScope>
  );
  const view = renderWithStore(wrap(<LyricsPanel variant={variant} />));
  if (withSong) {
    act(() => view.h.store.addLast({ ...makeTrack('a', 10_000), artists: ['Main', 'Guest'] }));
  }
  await act(async () => settle());
  return { ...view, provider, user: userEvent.setup() };
}

/** Starts playback so the engine accepts progress events from the output. */
async function startPlaying(view: Awaited<ReturnType<typeof setup>>) {
  await act(async () => {
    view.h.store.togglePlay();
    await settle();
  });
}

describe('LyricsPanel', () => {
  it('asks the provider with the first artist, album and duration of the current song', async () => {
    const { provider } = await setup(synced);
    expect(provider.queries).toEqual([
      { title: 'Title a', artist: 'Main', album: 'Album', durationMs: 10_000 },
    ]);
  });

  it('shows the idle message when nothing is playing', async () => {
    const { provider } = await setup(synced, false);
    expect(screen.getByText(strings.player.nothingPlaying)).toBeInTheDocument();
    expect(provider.queries).toHaveLength(0);
    expect(screen.queryByText(strings.lyrics.source)).toBeNull();
  });

  it('shows a loading state with the spinner', async () => {
    await setup('pending');
    expect(screen.getByText(strings.lyrics.loading)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: strings.spinner.label })).toBeInTheDocument();
  });

  it('lists synced lines as buttons and skips the empty gap lines', async () => {
    await setup(synced);
    const buttons = screen.getAllByRole('button', { name: /line$/ });
    expect(buttons.map((b) => b.textContent)).toEqual(['First line', 'Second line', 'Third line']);
    expect(screen.getByText(strings.lyrics.source)).toBeInTheDocument();
  });

  it('marks the line at the playback position as current', async () => {
    const view = await setup(synced);
    await startPlaying(view);
    act(() => view.h.localOutput.emit({ type: 'progress', positionMs: 1_500, durationMs: 10_000 }));
    expect(screen.getByRole('button', { name: 'Second line' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'First line' })).not.toHaveAttribute('aria-current');
    act(() => view.h.localOutput.emit({ type: 'progress', positionMs: 3_200, durationMs: 10_000 }));
    expect(screen.getByRole('button', { name: 'Third line' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Second line' })).not.toHaveAttribute('aria-current');
  });

  it('seeks to the time of the clicked line', async () => {
    const view = await setup(synced);
    const seek = vi.spyOn(view.h.store, 'seek');
    await view.user.click(screen.getByRole('button', { name: 'Third line' }));
    expect(seek).toHaveBeenCalledWith(3_000);
  });

  it('keeps following the active line by scrolling it to the centre', async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    try {
      const view = await setup(synced);
      await startPlaying(view);
      scrollTo.mockClear();
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 1_200, durationMs: 10_000 }),
      );
      expect(scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: expect.any(String) }),
      );
    } finally {
      // jsdom does not implement Element.scrollTo, so remove the stub.
      Reflect.deleteProperty(Element.prototype, 'scrollTo');
    }
  });

  it('pauses auto-scroll after a manual scroll and resumes later', async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const view = await setup(synced);
      await startPlaying(view);
      fireEvent.wheel(screen.getByTestId('lyrics-scroller'));
      scrollTo.mockClear();
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 1_200, durationMs: 10_000 }),
      );
      expect(scrollTo).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(MANUAL_SCROLL_PAUSE_MS + 10);
      });
      expect(scrollTo).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(Element.prototype, 'scrollTo');
    }
  });

  it('renders plain lyrics as static text without seek buttons', async () => {
    await setup({ kind: 'plain', lines: ['Plain one', '', 'Plain two'] });
    expect(screen.getByText('Plain one')).toBeInTheDocument();
    expect(screen.getByText('Plain two')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the instrumental message', async () => {
    await setup({ kind: 'instrumental' });
    expect(screen.getByText(strings.lyrics.instrumental)).toBeInTheDocument();
  });

  it('shows the unavailable message when no lyrics exist', async () => {
    await setup(null);
    expect(screen.getByText(strings.lyrics.empty)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the error with a retry that asks again', async () => {
    const view = await setup(FakeLyricsProvider.failure());
    expect(screen.getByText(strings.lyrics.error)).toBeInTheDocument();
    view.provider.result = { kind: 'plain', lines: ['Back'] };
    await view.user.click(screen.getByRole('button', { name: strings.lyrics.retry }));
    await act(async () => settle());
    expect(view.provider.queries).toHaveLength(2);
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  describe('line states', () => {
    it('derives past, active and upcoming from the active index', () => {
      expect(lineState(0, 2)).toBe('past');
      expect(lineState(2, 2)).toBe('active');
      expect(lineState(3, 2)).toBe('upcoming');
      expect(lineState(0, -1)).toBe('upcoming');
    });

    it('measures the distance to the active line, capped so far lines stay stable', () => {
      expect(lineDistance(2, 2)).toBe(0);
      expect(lineDistance(1, 2)).toBe(1);
      expect(lineDistance(4, 2)).toBe(2);
      expect(lineDistance(0, 9)).toBe(MAX_LINE_DISTANCE);
      expect(lineDistance(40, 2)).toBe(MAX_LINE_DISTANCE);
      // Before the first line every line counts from just above the first one.
      expect(lineDistance(0, -1)).toBe(1);
    });

    it('centres the active line', () => {
      expect(ACTIVE_LINE_POSITION).toBe(0.5);
    });

    it('fades and shrinks neighbours by distance on both sides of the active line', async () => {
      const view = await setup(synced);
      await startPlaying(view);
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 1_500, durationMs: 10_000 }),
      );
      const distance = (name: string) =>
        screen.getByRole('button', { name }).getAttribute('data-distance');
      expect(distance('Second line')).toBe('0');
      expect(distance('First line')).toBe('1');
      expect(distance('Third line')).toBe('2');
    });

    it('marks every line upcoming before the first one is sung', async () => {
      await setup({ kind: 'synced', lines: [{ timeMs: 5_000, text: 'Late start' }] });
      expect(screen.getByRole('button', { name: 'Late start' })).toHaveAttribute(
        'data-state',
        'upcoming',
      );
    });

    it('dims past lines, highlights the active one and keeps the rest upcoming', async () => {
      const view = await setup(synced);
      await startPlaying(view);
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 1_500, durationMs: 10_000 }),
      );
      expect(screen.getByRole('button', { name: 'First line' })).toHaveAttribute(
        'data-state',
        'past',
      );
      expect(screen.getByRole('button', { name: 'Second line' })).toHaveAttribute(
        'data-state',
        'active',
      );
      expect(screen.getByRole('button', { name: 'Third line' })).toHaveAttribute(
        'data-state',
        'upcoming',
      );
    });

    it('renders an instrumental gap as three dots that become active in its time slot', async () => {
      const view = await setup(synced);
      await startPlaying(view);
      const gap = () => document.querySelector<HTMLElement>('[data-line-index="2"]');
      expect(gap()?.querySelectorAll('span')).toHaveLength(3);
      expect(gap()).toHaveAttribute('aria-hidden', 'true');
      expect(gap()).toHaveAttribute('data-state', 'upcoming');
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 2_200, durationMs: 10_000 }),
      );
      expect(gap()).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Seguir la letra', () => {
    beforeEach(() => {
      Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
    });
    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollTo');
    });

    it('is hidden while following', async () => {
      await setup(synced);
      expect(screen.queryByRole('button', { name: strings.lyrics.follow })).toBeNull();
    });

    it('appears after a manual scroll and re-centres the active line on click', async () => {
      const view = await setup(synced);
      await startPlaying(view);
      fireEvent.wheel(screen.getByTestId('lyrics-scroller'));
      const follow = screen.getByRole('button', { name: strings.lyrics.follow });
      const scrollTo = Element.prototype.scrollTo as unknown as ReturnType<typeof vi.fn>;
      scrollTo.mockClear();
      await view.user.click(follow);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: strings.lyrics.follow })).toBeNull();
      // Auto-follow works again.
      scrollTo.mockClear();
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 1_200, durationMs: 10_000 }),
      );
      expect(scrollTo).toHaveBeenCalled();
    });

    it('disappears by itself when the pause expires', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const view = await setup(synced);
        fireEvent.touchMove(screen.getByTestId('lyrics-scroller'));
        expect(screen.getByRole('button', { name: strings.lyrics.follow })).toBeInTheDocument();
        act(() => {
          vi.advanceTimersByTime(MANUAL_SCROLL_PAUSE_MS + 10);
        });
        expect(screen.queryByRole('button', { name: strings.lyrics.follow })).toBeNull();
        expect(view.provider.queries).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('disappears when a line is clicked to seek', async () => {
      const view = await setup(synced);
      fireEvent.wheel(screen.getByTestId('lyrics-scroller'));
      await view.user.click(screen.getByRole('button', { name: 'Third line' }));
      expect(screen.queryByRole('button', { name: strings.lyrics.follow })).toBeNull();
    });
  });

  describe('variants', () => {
    it('uses the full display type by default', async () => {
      const { container } = await setup(synced);
      expect(container.querySelector('[data-variant="full"]')).not.toBeNull();
    });

    it('renders the compact side variant with the same states and click to seek', async () => {
      const view = await setup(synced, true, 'side');
      expect(view.container.querySelector('[data-variant="side"]')).not.toBeNull();
      await startPlaying(view);
      act(() =>
        view.h.localOutput.emit({ type: 'progress', positionMs: 1_500, durationMs: 10_000 }),
      );
      expect(screen.getByRole('button', { name: 'Second line' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      const seek = vi.spyOn(view.h.store, 'seek');
      await view.user.click(screen.getByRole('button', { name: 'Third line' }));
      expect(seek).toHaveBeenCalledWith(3_000);
      expect(screen.getByText(strings.lyrics.source)).toBeInTheDocument();
    });

    it('keeps plain lyrics static in both variants', async () => {
      await setup({ kind: 'plain', lines: ['Plain one', '', 'Plain two'] }, true, 'side');
      expect(screen.getByText('Plain one')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});
