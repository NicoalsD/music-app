import { useId, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { PLAYLIST_NAME_MAX, usePlayerSnapshot, useStore, validatePlaylistName } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Button } from '../components/Button';
import { Dialog, DialogClose } from '../components/Dialog';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '../components/Menu';
import { strings } from '../i18n/es';
import styles from './PlaylistSwitcher.module.css';

type DialogKind = 'create' | 'rename' | 'delete';

const selectPlaylists = (s: PlayerSnapshot) => s.playlists;
const selectActiveId = (s: PlayerSnapshot) => s.activePlaylistId;
const selectActiveName = (s: PlayerSnapshot) => s.activePlaylistName;

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

/** Playlist switcher (R9): the active name is a menu to switch, create, rename and delete. */
export function PlaylistSwitcher() {
  const store = useStore();
  const playlists = usePlayerSnapshot(selectPlaylists);
  const activeId = usePlayerSnapshot(selectActiveId);
  const activeName = usePlayerSnapshot(selectActiveName);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const onlyOne = playlists.length <= 1;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button
            className={styles.trigger}
            aria-label={`${strings.playlist.switcherLabel}: ${activeName}`}
          >
            <span className={styles.triggerName}>{activeName}</span>
            <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuRadioGroup value={activeId} onValueChange={(id) => store.switchPlaylist(id)}>
            {playlists.map((playlist) => (
              <MenuRadioItem key={playlist.id} value={playlist.id}>
                <span className={styles.check}>
                  <MenuItemIndicator>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                  </MenuItemIndicator>
                </span>
                <span className={styles.itemName}>{playlist.name}</span>
                <span className={styles.itemCount}>
                  {strings.playlist.songCount(playlist.size)}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuItem onSelect={() => setDialog('create')}>{strings.playlist.create}</MenuItem>
          <MenuItem onSelect={() => setDialog('rename')}>{strings.playlist.rename}</MenuItem>
          <MenuItem
            disabled={onlyOne}
            title={onlyOne ? strings.playlist.onlyOne : undefined}
            onSelect={() => setDialog('delete')}
          >
            {strings.playlist.delete}
          </MenuItem>
        </MenuContent>
      </Menu>

      {dialog === 'create' ? (
        <Dialog open onOpenChange={close} title={strings.playlist.create}>
          <NameForm
            label={strings.playlist.nameLabelNew}
            submitLabel={strings.playlist.createConfirm}
            initialName=""
            onSubmit={(name) => {
              setDialog(null);
              void store.createPlaylist(name);
            }}
          />
        </Dialog>
      ) : null}
      {dialog === 'rename' ? (
        <Dialog open onOpenChange={close} title={strings.playlist.rename}>
          <NameForm
            label={strings.playlist.nameLabelRename}
            submitLabel={strings.playlist.save}
            initialName={activeName}
            onSubmit={(name) => {
              setDialog(null);
              store.renamePlaylist(activeId, name);
            }}
          />
        </Dialog>
      ) : null}
      {dialog === 'delete' ? (
        <Dialog
          open
          onOpenChange={close}
          title={strings.playlist.deleteConfirmTitle}
          description={strings.playlist.deleteConfirmBody(activeName)}
        >
          <div className={styles.actions}>
            <DialogClose asChild>
              <Button variant="ghost">{strings.dialog.cancel}</Button>
            </DialogClose>
            <Button
              variant="primary"
              onClick={() => {
                setDialog(null);
                void store.deletePlaylist(activeId);
              }}
            >
              {strings.playlist.deleteConfirmAction}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
