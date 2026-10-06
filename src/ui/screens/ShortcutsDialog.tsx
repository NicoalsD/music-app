import { Dialog } from '../components/Dialog';
import { strings } from '../i18n/es';
import styles from './ShortcutsDialog.module.css';

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Lists the keyboard shortcuts; opened with "?". */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={strings.shortcuts.title}
      description={strings.shortcuts.description}
    >
      <dl className={styles.list}>
        {strings.shortcuts.items.map((item) => (
          <div key={item.keys} className={styles.item}>
            <dt className={styles.keys}>
              <kbd className={styles.kbd}>{item.keys}</kbd>
            </dt>
            <dd className={styles.action}>{item.action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
