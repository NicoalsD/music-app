import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cx } from '../cx';
import { EnsureTooltipProvider } from './Tooltips';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** Required Spanish label from i18n: becomes aria-label and the tooltip text. */
  label: string;
  icon: ReactNode;
  /** ghost = bare icon, primary = ai disc (the play button). */
  variant?: 'ghost' | 'primary';
  /** For toggles (shuffle, repeat, mute). */
  pressed?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  pressed,
  tooltipSide = 'top',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <EnsureTooltipProvider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            {...rest}
            type={type}
            aria-label={label}
            aria-pressed={pressed}
            className={cx(styles.button, styles[variant], pressed && styles.pressed, className)}
          >
            <span aria-hidden="true" className={styles.icon}>
              {icon}
            </span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={styles.tooltip} side={tooltipSide} sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </EnsureTooltipProvider>
  );
}
