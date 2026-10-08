import { useRef } from 'react';
import { ChevronDown, FileUp } from 'lucide-react';
import { useStore } from '../../state';
import type { ImportPlacement } from '../../state';
import { Button } from '../components/Button';
import type { ButtonVariant } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../components/Menu';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import styles from './ImportFilesButton.module.css';

export interface ImportFilesButtonProps {
  variant?: ButtonVariant;
  className?: string | undefined;
}

/**
 * Split action. The main button imports at the end; the menu imports at the start, after the
 * current song, or at the end. Dropping files on the list picks any other position.
 */
export function ImportFilesButton({ variant = 'secondary', className }: ImportFilesButtonProps) {
  const store = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const placementRef = useRef<ImportPlacement>({ kind: 'last' });

  function pick(placement: ImportPlacement) {
    placementRef.current = placement;
    inputRef.current?.click();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        aria-label={strings.library.importInputLabel}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          const placement = placementRef.current;
          placementRef.current = { kind: 'last' };
          if (files.length > 0) void store.importLocalFiles(files, placement);
        }}
      />
      <div className={cx(styles.group, className)}>
        <Button variant={variant} className={styles.main} onClick={() => pick({ kind: 'last' })}>
          <FileUp size={18} strokeWidth={1.5} aria-hidden="true" />
          {strings.library.importFiles}
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              label={strings.library.importMoreOptions}
              icon={<ChevronDown size={18} strokeWidth={1.5} />}
              className={styles.trigger}
            />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => pick({ kind: 'first' })}>
              {strings.library.importAtStart}
            </MenuItem>
            <MenuItem onSelect={() => pick({ kind: 'next' })}>
              {strings.library.importNext}
            </MenuItem>
            <MenuItem onSelect={() => pick({ kind: 'last' })}>
              {strings.library.importAtEnd}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </>
  );
}
