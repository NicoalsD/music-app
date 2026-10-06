import { fireEvent, render, screen } from '@testing-library/react';
import { Artwork } from './Artwork';

const art = { small: 's.jpg', medium: 'm.jpg', large: 'l.jpg' };

describe('Artwork', () => {
  it('picks the URL that matches the size', () => {
    const { rerender } = render(<Artwork artwork={art} title="T" album="A" size="md" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 's.jpg');
    rerender(<Artwork artwork={art} title="T" album="A" size="lg" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'm.jpg');
    rerender(<Artwork artwork={art} title="T" album="A" size="xl" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'l.jpg');
  });

  it('falls back to another available URL', () => {
    render(<Artwork artwork={{ large: 'l.jpg' }} title="T" album="A" size="xs" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'l.jpg');
  });

  it('uses lazy async attributes and Spanish alt text', () => {
    render(<Artwork artwork={art} title="T" album="Kind of Blue" size="sm" />);
    const img = screen.getByRole('img', { name: 'Portada de Kind of Blue' });
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('renders the fallback when no URL exists', () => {
    const { container } = render(<Artwork artwork={{}} title="nocturne" album="A" size="md" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-artwork="fallback"]')).not.toBeNull();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portada de A' })).toBeInTheDocument();
  });

  it('renders the fallback after a load error', () => {
    const { container } = render(<Artwork artwork={art} title="Sakura" album="A" size="md" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('is deterministic across renders', () => {
    const first = render(<Artwork artwork={{}} title="Sakura" album="A" size="md" />);
    const html = first.container.innerHTML;
    first.unmount();
    const second = render(<Artwork artwork={{}} title="Sakura" album="A" size="md" />);
    expect(second.container.innerHTML).toBe(html);
  });
});
