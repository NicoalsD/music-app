import { MenuItem, MenuSeparator } from '../components/Menu';
import type { MoveTarget } from '../dnd/useEntryMover';
import { strings } from '../i18n/es';

export interface RowMenuItemsProps {
  entryId: string;
  /** False when the row cannot go further up (first place, or right after the current song). */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (entryId: string, target: MoveTarget) => void;
  onRemove: (entryId: string) => void;
}

/** Non-modal alternative to dragging: move one step, to the ends, or remove. */
export function RowMenuItems({
  entryId,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
}: RowMenuItemsProps) {
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
      <MenuItem onSelect={() => onRemove(entryId)}>{strings.playlist.removeSong}</MenuItem>
    </>
  );
}
