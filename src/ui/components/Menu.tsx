import type { ComponentProps } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cx } from '../cx';
import { shojiClass } from '../theme/shojiClass';
import styles from './Menu.module.css';

/** Styled raised-shoji DropdownMenu. Compose: Menu > MenuTrigger + MenuContent > MenuItem. */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  className,
  children,
  ...rest
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={6}
        collisionPadding={12}
        {...rest}
        className={cx(shojiClass({ depth: 'raised', inFlow: true }), styles.content, className)}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...rest }: ComponentProps<typeof DropdownMenu.Item>) {
  return <DropdownMenu.Item {...rest} className={cx(styles.item, className)} />;
}

export function MenuSeparator({
  className,
  ...rest
}: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator {...rest} className={cx(styles.separator, className)} />;
}
