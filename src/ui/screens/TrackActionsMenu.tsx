import { MoreHorizontal } from 'lucide-react';
import type { Track } from '../../core/Song';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, PlaylistSummary, SongView } from '../../state';
import { IconButton } from '../components/IconButton';
import { Menu, MenuContent, MenuTrigger } from '../components/Menu';
import { KitItem, KitSeparator, KitSub, KitSubContent, KitSubTrigger } from '../components/MenuKit';
import type { MenuKind } from '../components/MenuKit';
import { strings } from '../i18n/es';
import { useIsFavorite } from './useIsFavorite';

const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;
const selectPlaylists = (s: PlayerSnapshot): readonly PlaylistSummary[] => s.playlists;

interface TrackMenuProps {
  kind: MenuKind;
  track: Track;
}

/** Submenu body: the start of the list plus each song of the active playlist (non-modal). */
function InsertAfterItems({ kind, track }: TrackMenuProps) {
  const store = useStore();
  const songs = usePlayerSnapshot(selectSongs);
  return (
    <>
      <KitItem kind={kind} onSelect={() => store.addAt(0, track)}>
        {strings.add.insertAtStart}
      </KitItem>
      {songs.map((song) => (
        <KitItem
          key={song.entryId}
          kind={kind}
          textValue={song.title}
          onSelect={() => store.addAt(song.index + 1, track)}
        >
          {strings.add.insertAfterItem(song.index + 1, song.title)}
        </KitItem>
      ))}
    </>
  );
}

/** Submenu body: every playlist; the track goes to its end without switching to it. */
function PlaylistTargetItems({ kind, track }: TrackMenuProps) {
  const store = useStore();
  const playlists = usePlayerSnapshot(selectPlaylists);
  return (
    <>
      {playlists.map((playlist) => {
        const count = strings.playlist.songCount(playlist.size);
        return (
          <KitItem
            key={playlist.id}
            kind={kind}
            textValue={playlist.name}
            onSelect={() => store.addToPlaylist(playlist.id, track)}
          >
            {playlist.isActive
              ? strings.add.playlistItemActive(playlist.name, count)
              : strings.add.playlistItem(playlist.name, count)}
          </KitItem>
        );
      })}
    </>
  );
}

/** The actions of a catalog track, shared by the "more" dropdown and the right-click menu. */
export function TrackMenuItems({ kind, track }: TrackMenuProps) {
  const store = useStore();
  const liked = useIsFavorite(track.trackId);
  return (
    <>
      <KitItem kind={kind} onSelect={() => store.playNow(track)}>
        {strings.add.playNow}
      </KitItem>
      <KitItem kind={kind} onSelect={() => store.addNext(track)}>
        {strings.add.playNext}
      </KitItem>
      <KitItem kind={kind} onSelect={() => store.toggleFavorite(track)}>
        {liked ? strings.favorites.unlikeShort : strings.favorites.likeShort}
      </KitItem>
      <KitSeparator kind={kind} />
      <KitItem kind={kind} onSelect={() => store.addFirst(track)}>
        {strings.add.addToStart}
      </KitItem>
      <KitItem kind={kind} onSelect={() => store.addLast(track)}>
        {strings.add.addToEnd}
      </KitItem>
      <KitSub kind={kind}>
        <KitSubTrigger kind={kind}>{strings.add.insertAt}</KitSubTrigger>
        <KitSubContent kind={kind} aria-label={strings.add.insertListLabel}>
          <InsertAfterItems kind={kind} track={track} />
        </KitSubContent>
      </KitSub>
      <KitSub kind={kind}>
        <KitSubTrigger kind={kind}>{strings.add.addToPlaylist}</KitSubTrigger>
        <KitSubContent kind={kind}>
          <PlaylistTargetItems kind={kind} track={track} />
        </KitSubContent>
      </KitSub>
    </>
  );
}

export interface TrackActionsMenuProps {
  track: Track;
}

/** The "more actions" menu for a catalog track. */
export function TrackActionsMenu({ track }: TrackActionsMenuProps) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          label={strings.add.moreActions(track.title)}
          icon={<MoreHorizontal size={20} strokeWidth={1.5} />}
        />
      </MenuTrigger>
      <MenuContent align="end">
        <TrackMenuItems kind="dropdown" track={track} />
      </MenuContent>
    </Menu>
  );
}
