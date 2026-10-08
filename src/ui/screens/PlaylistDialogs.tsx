import { useId, useState } from 'react';
import { PLAYLIST_NAME_MAX, useStore, validatePlaylistName } from '../../state';
import { Button } from '../components/Button';
import { Dialog, DialogClose } from '../components/Dialog';
import { strings } from '../i18n/es';
import styles from './PlaylistDialogs.module.css';

/** Which dialog is open and, for rename and delete, which playlist it targets. */
export type PlaylistDialogState =
  | { readonly kind: 'create' }
  | { readonly kind: 'rename'; readonly id: string; readonly name: string }
  | { readonly kind: 'delete'; readonly id: string; readonly name: string };

export interface PlaylistDialogsProps {
  dialog: PlaylistDialogState | null;
  onClose: () => void;
  /** Called with the new playlist id once it has been created (and made active). */
  onCreated?: ((id: string) => void) | undefined;
}

interface NameFormProps {
  label: string;
  submitLabel: string;
  initialName: string;
  onSubmit: (name: string) => void;
}

/** Name input with validation (non-empty, at most 60 characters). Mounted per open dialog. */
function NameForm({ label, submitLabel, initialName, onSubmit }: NameFormProps) {
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const problem = validatePlaylistName(name);
  const message =
    problem === 'empty'
      ? strings.playlist.nameEmpty
      : problem === 'too-long'
        ? strings.playlist.nameTooLong(PLAYLIST_NAME_MAX)
        : null;
  const showError = message !== null && (touched || problem === 'too-long');

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (problem === null) onSubmit(name.trim());
      }}
    >
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        autoComplete="off"
        autoFocus
        value={name}
        aria-invalid={showError}
        aria-describedby={errorId}
        onChange={(event) => setName(event.target.value)}
      />
      <p id={errorId} className={styles.error} role="status">
        {showError ? message : ''}
      </p>
      <div className={styles.actions}>
        <DialogClose asChild>
          <Button variant="ghost">{strings.dialog.cancel}</Button>
        </DialogClose>
        <Button variant="primary" type="submit" disabled={problem !== null && touched}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Create, rename and delete dialogs for a playlist (R9), shared by the switcher and the sidebar. */
export function PlaylistDialogs({ dialog, onClose, onCreated }: PlaylistDialogsProps) {
  const store = useStore();
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (dialog === null) return null;

  if (dialog.kind === 'create') {
    return (
      <Dialog open onOpenChange={onOpenChange} title={strings.playlist.create}>
        <NameForm
          label={strings.playlist.nameLabelNew}
          submitLabel={strings.playlist.createConfirm}
          initialName=""
          onSubmit={(name) => {
            onClose();
            void store.createPlaylist(name).then((id) => onCreated?.(id));
          }}
        />
      </Dialog>
    );
  }

  if (dialog.kind === 'rename') {
    return (
      <Dialog open onOpenChange={onOpenChange} title={strings.playlist.rename}>
        <NameForm
          label={strings.playlist.nameLabelRename}
          submitLabel={strings.playlist.save}
          initialName={dialog.name}
          onSubmit={(name) => {
            onClose();
            store.renamePlaylist(dialog.id, name);
          }}
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={strings.playlist.deleteConfirmTitle}
      description={strings.playlist.deleteConfirmBody(dialog.name)}
    >
      <div className={styles.actions}>
        <DialogClose asChild>
          <Button variant="ghost">{strings.dialog.cancel}</Button>
        </DialogClose>
        <Button
          variant="primary"
          onClick={() => {
            onClose();
            void store.deletePlaylist(dialog.id);
          }}
        >
          {strings.playlist.deleteConfirmAction}
        </Button>
      </div>
    </Dialog>
  );
}
