import { render } from '@testing-library/react';
import { Hanko } from './Hanko';
import { Lantern } from './Lantern';
import { LanternCord } from './LanternCord';

describe('Hanko', () => {
  it('renders the default kanji and is decorative', () => {
    const { container } = render(<Hanko />);
    const seal = container.firstElementChild as HTMLElement;
    expect(seal).toHaveTextContent('再');
    expect(seal).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts a custom kanji and defines the edge filter once', () => {
    render(<Hanko kanji="音" stampKey="a" />);
    render(<Hanko stampKey="b" />);
    expect(document.querySelectorAll('#hanko-rough-edge')).toHaveLength(1);
  });
});

describe('Lantern', () => {
  it('reflects the lit state', () => {
    const { container, rerender } = render(<Lantern />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg).toHaveAttribute('data-lit', 'false');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    rerender(<Lantern lit />);
    expect(container.querySelector('svg')).toHaveAttribute('data-lit', 'true');
  });
});

describe('LanternCord', () => {
  function cords(container: HTMLElement) {
    const top = container.querySelector('[data-cord="top"]') as HTMLElement;
    const bottom = container.querySelector('[data-cord="bottom"]') as HTMLElement;
    return { top, bottom };
  }

  it('hides the top cord for the head and the bottom cord for the tail', () => {
    const head = cords(render(<LanternCord isHead />).container);
    expect(head.top.className).toMatch(/hidden/);
    expect(head.bottom.className).not.toMatch(/hidden/);
    const tail = cords(render(<LanternCord isTail />).container);
    expect(tail.top.className).not.toMatch(/hidden/);
    expect(tail.bottom.className).toMatch(/hidden/);
  });

  it('is decorative', () => {
    const { container } = render(<LanternCord lit />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
