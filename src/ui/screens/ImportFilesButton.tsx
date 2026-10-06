import { useRef } from 'react';
import { FileUp } from 'lucide-react';
import { useStore } from '../../state';
import { Button } from '../components/Button';
import type { ButtonVariant } from '../components/Button';
import { strings } from '../i18n/es';

export interface ImportFilesButtonProps {
  variant?: ButtonVariant;
  className?: string | undefined;
}

/** Button that opens the file picker and imports the chosen audio files into the active playlist. */
export function ImportFilesButton({ variant = 'secondary', className }: ImportFilesButtonProps) {
  const store = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

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
          if (files.length > 0) void store.importLocalFiles(files);
        }}
      />
      <Button variant={variant} className={className} onClick={() => inputRef.current?.click()}>
        <FileUp size={18} strokeWidth={1.5} aria-hidden="true" />
        {strings.library.importFiles}
      </Button>
    </>
  );
}
