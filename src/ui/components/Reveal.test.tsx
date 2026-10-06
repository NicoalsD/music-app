import { render, screen } from '@testing-library/react';
import { Reveal, RevealList } from './Reveal';
import { staggerDelay } from './stagger';

function mockReducedMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
      }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reveal', () => {
  it('renders children with reduced motion', () => {
    mockReducedMotion(true);
    render(<Reveal>Hola</Reveal>);
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });

  it('renders children with motion enabled', () => {
    mockReducedMotion(false);
    render(<Reveal delay={5}>Hola</Reveal>);
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });
});

describe('RevealList', () => {
  it('wraps every child in a list item', () => {
    render(
      <RevealList>
        <span>uno</span>
        <span>dos</span>
      </RevealList>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('staggers 30ms per item and stops after 8 items', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBeCloseTo(0.09);
    expect(staggerDelay(7)).toBeCloseTo(0.21);
    expect(staggerDelay(8)).toBe(0);
    expect(staggerDelay(20)).toBe(0);
  });
});
