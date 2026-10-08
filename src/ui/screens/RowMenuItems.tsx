import { useStore } from '../../state';
import { MenuItem, MenuSeparator } from '../components/Menu';
import type { MoveTarget } from '../dnd/useEntryMover';
import { strings } from '../i18n/es';
import { useIsFavorite } from './useIsFavorite';

export interface RowMenuItemsProps {
  entryId: string;
  trackId: string;
  /** False when the row cannot go further up (first place, or right after the current song). */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (entryId: string, target: MoveTarget) => void;
  onRemove: (entryId: string) => void;
}

/** Non-modal alternative to dragging: move one step, to the ends, like, or remove. */
export function RowMenuItems({
  entryId,
  trackId,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
}: RowMenuItemsProps) {
  const store = useStore();
  const liked = useIsFavorite(trackId);
  return (
    <>
      <MenuItem disabled={!canMoveUp} onSelect={() => onMove(entryId, 'up')}>
        {strings.playlist.moveUpItem}
      </MenuItem>
      <MenuItem disabled={!canMoveDown} onSelect={() => onMove(entryId, 'down')}>
        {strings.playlist.moveDownItem}
      </MenuItem>
      <MenuItem disabled={!canMoveUp} onSelect={() => onMove(entryId, 'first')}>
        {strings.playlist.moveFirstItem}
      </MenuItem>
      <MenuItem disabled={!canMoveDown} onSelect={() => onMove(entryId, 'last')}>
        {strings.playlist.moveLastItem}
      </MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => store.toggleFavoriteEntry(entryId)}>
        {liked ? strings.favorites.unlikeShort : strings.favorites.likeShort}
      </MenuItem>
      <MenuItem onSelect={() => onRemove(entryId)}>{strings.playlist.removeSong}</MenuItem>
    </>
  );
}
