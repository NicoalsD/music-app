import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwallowProgress } from './SwallowProgress';

describe('SwallowProgress', () => {
  it('exposes an accessible slider with aria-valuetext', () => {
    render(
      <SwallowProgress valueMs={83_000} durationMs={225_000} onSeekCommit={() => undefined} />,
    );
    const slider = screen.getByRole('slider', { name: 'Progreso de la canción' });
    expect(slider).toHaveAttribute('aria-valuetext', '1:23 de 3:45');
  });

  it('seeks 5 seconds with the arrow keys', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    render(<SwallowProgress valueMs={30_000} durationMs={225_000} onSeekCommit={onSeek} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    expect(onSeek).toHaveBeenLastCalledWith(35_000);
    await user.keyboard('{ArrowLeft}');
    expect(onSeek).toHaveBeenLastCalledWith(25_000);
  });

  it('clamps keyboard seeks to the track bounds', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    render(<SwallowProgress valueMs={2_000} durationMs={225_000} onSeekCommit={onSeek} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowLeft}');
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it('does not seek on Shift+arrow (reserved for next/previous)', async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    render(<SwallowProgress valueMs={30_000} durationMs={225_000} onSeekCommit={onSeek} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('ignores external value updates while scrubbing and commits on release', () => {
    const onSeek = vi.fn();
    const onScrub = vi.fn();
    const { container, rerender } = render(
      <SwallowProgress
        valueMs={10_000}
        durationMs={100_000}
        onSeekCommit={onSeek}
        onScrub={onScrub}
      />,
    );
    const root = container.querySelector('[data-orientation="horizontal"]') as HTMLElement;
    root.getBoundingClientRect = () =>
      ({ left: 0, right: 100, width: 100, top: 0, bottom: 10, height: 10, x: 0, y: 0 }) as DOMRect;

    // Radix only commits on pointer up while it holds pointer capture.
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockReturnValue(true);
    fireEvent.pointerDown(root, { clientX: 50, pointerId: 1, button: 0 });
    expect(onScrub).toHaveBeenCalledWith(50_000);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '0:50 de 1:40');

    rerender(
      <SwallowProgress
        valueMs={11_000}
        durationMs={100_000}
        onSeekCommit={onSeek}
        onScrub={onScrub}
      />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '0:50 de 1:40');
    expect(onSeek).not.toHaveBeenCalled();

    fireEvent.pointerUp(root, { clientX: 50, pointerId: 1 });
    expect(onSeek).toHaveBeenCalledWith(50_000);
  });
});
