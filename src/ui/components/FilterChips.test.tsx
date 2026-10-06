import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { FilterChips } from './FilterChips';

const items = [
  { value: 'all', label: 'Todo' },
  { value: 'songs', label: 'Canciones' },
] as const;

function Harness({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState<'all' | 'songs'>('all');
  return (
    <FilterChips
      label="Filtrar resultados"
      items={items}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

describe('FilterChips', () => {
  it('exposes a labelled group with one checked item', () => {
    render(<Harness onChange={() => undefined} />);
    expect(screen.getByRole('radiogroup', { name: 'Filtrar resultados' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Todo' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Canciones' })).not.toBeChecked();
  });

  it('selects a single chip at a time', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Canciones' }));
    expect(onChange).toHaveBeenCalledWith('songs');
    expect(screen.getByRole('radio', { name: 'Canciones' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Todo' })).not.toBeChecked();
  });

  it('never deselects the active chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Todo' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Todo' })).toBeChecked();
  });
});
