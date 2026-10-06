import type { Track } from '../../core/Song';
import { usePlayerSnapshot, useStore } from '../../state';
import { strings } from '../i18n/es';
import { PositionDialog } from './PositionDialog';
import { sameTitles, selectTitles } from './selectTitles';

export interface InsertAtDialogProps {
  track: Track;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Insert a catalog track at a 1-based position, with a live preview of where it lands. */
export function InsertAtDialog({ track, open, onOpenChange }: InsertAtDialogProps) {
  const store = useStore();
  const titles = usePlayerSnapshot(selectTitles, sameTitles);
  return (
    <PositionDialog
      titles={titles}
      newLabel={track.title}
      title={strings.insert.title}
      description={strings.insert.description(track.title)}
      confirmLabel={strings.add.confirm}
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={(index) => store.addAt(index, track)}
    />
  );
}
