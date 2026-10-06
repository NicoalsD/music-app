import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '../cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = ai fill, secondary = paper with ink outline, ghost = text only. */
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button {...rest} type={type} className={cx(styles.button, styles[variant], className)} />;
}
