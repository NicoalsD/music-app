import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Button } from '../components/Button';
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
import { PlaylistDialogs } from './PlaylistDialogs';
import type { PlaylistDialogState } from './PlaylistDialogs';
import styles from './PlaylistSwitcher.module.css';

const selectPlaylists = (s: PlayerSnapshot) => s.playlists;
const selectActiveId = (s: PlayerSnapshot) => s.activePlaylistId;
const selectActiveName = (s: PlayerSnapshot) => s.activePlaylistName;

/** Playlist switcher (R9): the active name is a menu to switch, create, rename and delete. */
export function PlaylistSwitcher() {
  const store = useStore();
  const playlists = usePlayerSnapshot(selectPlaylists);
  const activeId = usePlayerSnapshot(selectActiveId);
  const activeName = usePlayerSnapshot(selectActiveName);
  const [dialog, setDialog] = useState<PlaylistDialogState | null>(null);
  const onlyOne = playlists.length <= 1;
  const activeIsFavorites = playlists.some((p) => p.id === activeId && p.kind === 'favorites');

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
          <MenuItem onSelect={() => setDialog({ kind: 'create' })}>
            {strings.playlist.create}
          </MenuItem>
          {/* Favoritos builds itself from the hearts, so it has no name or lifetime to manage. */}
          <MenuItem
            disabled={activeIsFavorites}
            title={activeIsFavorites ? strings.favorites.fixedHint : undefined}
            onSelect={() => setDialog({ kind: 'rename', id: activeId, name: activeName })}
          >
            {strings.playlist.rename}
          </MenuItem>
          <MenuItem
            disabled={onlyOne || activeIsFavorites}
            title={
              activeIsFavorites
                ? strings.favorites.fixedHint
                : onlyOne
                  ? strings.playlist.onlyOne
                  : undefined
            }
            onSelect={() => setDialog({ kind: 'delete', id: activeId, name: activeName })}
          >
            {strings.playlist.delete}
          </MenuItem>
        </MenuContent>
      </Menu>
      <PlaylistDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
