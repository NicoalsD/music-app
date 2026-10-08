import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Ellipsis, Heart, House, Plus, Search } from 'lucide-react';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot, PlaylistSummary } from '../../state';
import { Button } from '../components/Button';
import { Hanko } from '../components/Hanko';
import { IconButton } from '../components/IconButton';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../components/Menu';
import { RevealList } from '../components/Reveal';
import { ShojiPanel } from '../components/ShojiPanel';
import { cx } from '../cx';
import { useDndUi } from '../dnd/dndContext';
import { strings } from '../i18n/es';
import { ImportFilesButton } from './ImportFilesButton';
import { PlaylistDialogs } from './PlaylistDialogs';
import type { PlaylistDialogState } from './PlaylistDialogs';
import styles from './LibrarySidebar.module.css';

export type SidebarSection = 'home' | 'search' | 'other';

export interface LibrarySidebarProps {
  /** Which compact nav item is current. */
  section: SidebarSection;
  onGoHome: () => void;
  onGoSearch: () => void;
  /** Opens the playlist view for this playlist (the shell also makes it active). */
  onOpenPlaylist: (id: string) => void;
  className?: string | undefined;
}

const selectPlaylists = (s: PlayerSnapshot): readonly PlaylistSummary[] => s.playlists;

/** Left panel: compact nav, the "Biblioteca" list of playlists (R9) and the import footer. */
export function LibrarySidebar({
  section,
  onGoHome,
  onGoSearch,
  onOpenPlaylist,
  className,
}: LibrarySidebarProps) {
  const playlists = usePlayerSnapshot(selectPlaylists);
  const [dialog, setDialog] = useState<PlaylistDialogState | null>(null);
  const onlyOne = playlists.length <= 1;

  return (
    <ShojiPanel
      as="aside"
      className={cx(styles.sidebar, className)}
      aria-label={strings.nav.library}
    >
      <nav className={styles.nav} aria-label={strings.nav.primaryLabel}>
        <button
          type="button"
          className={styles.navItem}
          aria-current={section === 'home' ? 'page' : undefined}
          onClick={onGoHome}
        >
          <House size={20} strokeWidth={1.5} aria-hidden="true" />
          {strings.nav.home}
        </button>
        <button
          type="button"
          className={styles.navItem}
          aria-current={section === 'search' ? 'page' : undefined}
          onClick={onGoSearch}
        >
          <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          {strings.nav.search}
        </button>
      </nav>

      <div className={styles.header}>
        <h2 className={styles.title}>{strings.nav.library}</h2>
        <Button
          className={styles.create}
          aria-label={strings.sidebar.createLabel}
          onClick={() => setDialog({ kind: 'create' })}
        >
          <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
          {strings.sidebar.create}
        </Button>
      </div>

      <div className={styles.scroll}>
        <RevealList className={styles.list} itemClassName={styles.row}>
          {playlists.map((playlist) => (
            <PlaylistEntry
              key={playlist.id}
              playlist={playlist}
              canDelete={!onlyOne}
              onOpen={() => onOpenPlaylist(playlist.id)}
              onRename={() => setDialog({ kind: 'rename', id: playlist.id, name: playlist.name })}
              onDelete={() => setDialog({ kind: 'delete', id: playlist.id, name: playlist.name })}
            />
          ))}
        </RevealList>
      </div>

      <div className={styles.footer}>
        <ImportFilesButton className={styles.import} />
        <p className={styles.attribution}>{strings.spotify.attribution}</p>
      </div>

      <PlaylistDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onCreated={(id) => onOpenPlaylist(id)}
      />
    </ShojiPanel>
  );
}

interface PlaylistEntryProps {
  playlist: PlaylistSummary;
  canDelete: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function PlaylistEntry({ playlist, canDelete, onOpen, onRename, onDelete }: PlaylistEntryProps) {
  const count = strings.playlist.songCount(playlist.size);
  const ui = useDndUi();
  const dragging = ui.activeKind === 'track';
  const { setNodeRef, isOver } = useDroppable({
    id: `playlist:${playlist.id}`,
    data: { type: 'playlist', playlistId: playlist.id, name: playlist.name },
    disabled: !dragging,
  });
  const over = dragging && isOver;
  const isFavorites = playlist.kind === 'favorites';
  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        className={styles.item}
        aria-label={strings.sidebar.openPlaylist(playlist.name, count)}
        aria-current={playlist.isActive ? 'true' : undefined}
        data-active={playlist.isActive ? 'true' : 'false'}
        data-drop={over ? 'over' : dragging ? 'ready' : 'idle'}
        onClick={onOpen}
      >
        <span className={styles.seal}>
          {over ? (
            <Plus size={20} strokeWidth={2} aria-hidden="true" />
          ) : isFavorites ? (
            <Heart
              size={20}
              strokeWidth={1.5}
              fill="currentColor"
              className={styles.heart}
              aria-hidden="true"
            />
          ) : playlist.isActive ? (
            <Hanko kanji={strings.sidebar.activeKanji} size={24} />
          ) : null}
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{playlist.name}</span>
          <span className={styles.count}>{over ? strings.dnd.dropOnPlaylist : count}</span>
        </span>
      </button>
      {isFavorites ? (
        // Favoritos builds itself from the hearts: nothing to rename or delete.
        <span className={styles.moreSpacer} title={strings.favorites.fixedHint} />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              label={strings.sidebar.options(playlist.name)}
              icon={<Ellipsis size={20} strokeWidth={1.5} />}
              className={styles.more}
            />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={onRename}>{strings.playlist.rename}</MenuItem>
            <MenuItem
              disabled={!canDelete}
              title={canDelete ? undefined : strings.playlist.onlyOne}
              onSelect={onDelete}
            >
              {strings.playlist.delete}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </>
  );
}
