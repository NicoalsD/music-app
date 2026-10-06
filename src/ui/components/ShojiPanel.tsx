import { createElement, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from '../cx';
import { shojiClass } from '../theme/shojiClass';

export interface ShojiPanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside' | 'footer' | 'header' | 'nav';
  /** `raised` = menus and dialogs (24px blur, 74% opacity). Default `base` (18px, 62%). */
  depth?: 'base' | 'raised';
  /**
   * No blur and no grain. Use for a panel INSIDE another ShojiPanel:
   * nested backdrop-filter is expensive and muddy, so never nest blurred panels.
   */
  flat?: boolean;
  /** Draws the kumiko lattice lines (player bar, header). */
  kumiko?: boolean;
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}

/** Translucent rice-paper panel. See theme/shoji.module.css for the rules. */
export function ShojiPanel({
  as = 'div',
  depth = 'base',
  flat = false,
  kumiko = false,
  className,
  children,
  ...rest
}: ShojiPanelProps) {
  return createElement(
    as,
    { ...rest, className: cx(shojiClass({ depth, flat, kumiko, inFlow: true }), className) },
    children,
  );
}
