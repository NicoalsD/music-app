import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import { shojiClass } from '../theme/shojiClass';
import styles from './Dialog.module.css';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the dialog (rendered with asChild). */
  trigger?: ReactNode;
  title: string;
  description?: string;
  /** Dialog body: form fields, actions. */
  children?: ReactNode;
  className?: string | undefined;
}

/** Radix Dialog on a raised shoji panel, centered, with title, description and close. */
export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={cx(shojiClass({ depth: 'raised' }), styles.content, className)}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className={styles.description}>
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className={styles.body}>{children}</div>
          <RadixDialog.Close className={styles.close} aria-label={strings.dialog.close}>
            <X aria-hidden="true" size={20} strokeWidth={1.5} />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Re-export so callers can build a "Cancel" button that closes the dialog. */
export const DialogClose = RadixDialog.Close;
