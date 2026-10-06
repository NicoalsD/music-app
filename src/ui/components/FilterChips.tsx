import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cx } from '../cx';
import styles from './FilterChips.module.css';

export interface FilterChipItem<V extends string> {
  value: V;
  label: string;
}

export interface FilterChipsProps<V extends string> {
  items: ReadonlyArray<FilterChipItem<V>>;
  value: V;
  onValueChange: (value: V) => void;
  /** Accessible name of the group (from i18n). */
  label: string;
  className?: string | undefined;
}

/** Single-select matchbox-label chips. Selected = ink fill with paper text. */
export function FilterChips<V extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
}: FilterChipsProps<V>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      className={cx(styles.group, className)}
      onValueChange={(next) => {
        // Radix emits '' when the active item is pressed again; one chip must stay selected.
        const match = items.find((item) => item.value === next);
        if (match) onValueChange(match.value);
      }}
    >
      {items.map((item) => (
        <ToggleGroup.Item key={item.value} value={item.value} className={styles.chip}>
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
