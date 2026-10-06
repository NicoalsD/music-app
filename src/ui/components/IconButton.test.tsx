import { render, screen } from '@testing-library/react';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('uses the required label as aria-label and hides the icon', () => {
    render(<IconButton label="Reproducir" icon={<svg data-testid="icon" />} />);
    const button = screen.getByRole('button', { name: 'Reproducir' });
    expect(button).toHaveAttribute('aria-label', 'Reproducir');
    expect(button).toHaveAttribute('type', 'button');
    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('reflects toggle state with aria-pressed', () => {
    render(<IconButton label="Aleatorio" icon={<svg />} pressed />);
    expect(screen.getByRole('button', { name: 'Aleatorio' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
