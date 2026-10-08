import type { ComponentProps } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
import { cx } from '../cx';
import { shojiClass } from '../theme/shojiClass';
import menu from './Menu.module.css';
import styles from './MenuKit.module.css';

/**
 * The same menu content rendered by a "more actions" dropdown or by a right-click context menu.
 * Radix ships the two as parallel families; this thin layer lets one component feed both.
 */
export type MenuKind = 'dropdown' | 'context';

interface KindProp {
  kind: MenuKind;
}

export function KitItem({
  kind,
  className,
  ...rest
}: KindProp & ComponentProps<typeof DropdownMenu.Item>) {
  const Item = kind === 'dropdown' ? DropdownMenu.Item : ContextMenu.Item;
  return <Item {...rest} className={cx(menu.item, className)} />;
}

export function KitSeparator({
  kind,
  className,
  ...rest
}: KindProp & ComponentProps<typeof DropdownMenu.Separator>) {
  const Separator = kind === 'dropdown' ? DropdownMenu.Separator : ContextMenu.Separator;
  return <Separator {...rest} className={cx(menu.separator, className)} />;
}

export function KitSub({ kind, ...rest }: KindProp & ComponentProps<typeof DropdownMenu.Sub>) {
  const Sub = kind === 'dropdown' ? DropdownMenu.Sub : ContextMenu.Sub;
  return <Sub {...rest} />;
}

export function KitSubTrigger({
  kind,
  className,
  children,
  ...rest
}: KindProp & ComponentProps<typeof DropdownMenu.SubTrigger>) {
  const SubTrigger = kind === 'dropdown' ? DropdownMenu.SubTrigger : ContextMenu.SubTrigger;
  return (
    <SubTrigger {...rest} className={cx(menu.item, styles.subTrigger, className)}>
      <span className={styles.subLabel}>{children}</span>
      <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
    </SubTrigger>
  );
}

export function KitSubContent({
  kind,
  className,
  ...rest
}: KindProp & ComponentProps<typeof DropdownMenu.SubContent>) {
  const Portal = kind === 'dropdown' ? DropdownMenu.Portal : ContextMenu.Portal;
  const SubContent = kind === 'dropdown' ? DropdownMenu.SubContent : ContextMenu.SubContent;
  return (
    <Portal>
      <SubContent
        sideOffset={4}
        alignOffset={-4}
        collisionPadding={12}
        {...rest}
        className={cx(
          shojiClass({ depth: 'raised', inFlow: true }),
          menu.content,
          styles.subContent,
          className,
        )}
      />
    </Portal>
  );
}

/** Right-click menu: the root and trigger are plain Radix; the content gets the shoji look. */
export const ContextMenuRoot = ContextMenu.Root;
export const ContextMenuTrigger = ContextMenu.Trigger;

export function ContextMenuContent({
  className,
  ...rest
}: ComponentProps<typeof ContextMenu.Content>) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        collisionPadding={12}
        {...rest}
        className={cx(shojiClass({ depth: 'raised', inFlow: true }), menu.content, className)}
      />
    </ContextMenu.Portal>
  );
}
