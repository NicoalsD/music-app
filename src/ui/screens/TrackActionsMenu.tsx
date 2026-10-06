import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Track } from '../../core/Song';
import { useStore } from '../../state';
import { IconButton } from '../components/IconButton';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/Menu';
import { strings } from '../i18n/es';
import { InsertAtDialog } from './InsertAtDialog';

export interface TrackActionsMenuProps {
  track: Track;
}

/** The "more actions" menu for a catalog track: play now, next, start, end, insert at. */
export function TrackActionsMenu({ track }: TrackActionsMenuProps) {
  const store = useStore();
  const [insertOpen, setInsertOpen] = useState(false);

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            label={strings.add.moreActions(track.title)}
            icon={<MoreHorizontal size={20} strokeWidth={1.5} />}
          />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => store.playNow(track)}>{strings.add.playNow}</MenuItem>
          <MenuItem onSelect={() => store.addNext(track)}>{strings.add.playNext}</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => store.addFirst(track)}>{strings.add.addToStart}</MenuItem>
          <MenuItem onSelect={() => store.addLast(track)}>{strings.add.addToEnd}</MenuItem>
          <MenuItem onSelect={() => setInsertOpen(true)}>{strings.add.insertAt}</MenuItem>
        </MenuContent>
      </Menu>
      {insertOpen ? <InsertAtDialog track={track} open onOpenChange={setInsertOpen} /> : null}
    </>
  );
}
