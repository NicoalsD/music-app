import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { cx } from '../cx';
import { FileDropContext, useDndUi } from './dndContext';
import type { DragScope } from './dragData';
import { hasFiles, indexFromPointer, readRowRects } from './fileDrop';
import styles from './ListDropZone.module.css';

export interface ListDropZoneProps {
  scope: DragScope;
  children: ReactNode;
  className?: string | undefined;
}

const selectSize = (s: PlayerSnapshot): number => s.songs.length;

/**
 * Wraps a list as one drop target: catalog tracks dragged over empty space land at the end, and
 * audio files dragged from the OS land at the position under the pointer.
 */
export function ListDropZone({ scope, children, className }: ListDropZoneProps) {
  const store = useStore();
  const size = usePlayerSnapshot(selectSize);
  const ui = useDndUi();
  const { setNodeRef, isOver } = useDroppable({
    id: `zone:${scope}`,
    data: { type: 'zone', scope },
  });
  const [fileIndex, setFileIndex] = useState<number | null>(null);

  function indexAt(event: DragEvent<HTMLElement>): number {
    return indexFromPointer(readRowRects(event.currentTarget), event.clientY, size);
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const index = indexAt(event);
    setFileIndex((previous) => (previous === index ? previous : index));
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFileIndex(null);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    // The panel around the list also accepts drops (at the end); this one is more precise.
    event.stopPropagation();
    const index = indexAt(event);
    setFileIndex(null);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void store.importLocalFiles(files, { kind: 'at', index });
  }

  const trackOver = isOver && ui.activeKind === 'track';

  return (
    <FileDropContext value={fileIndex}>
      <div
        ref={setNodeRef}
        className={cx(styles.zone, className)}
        data-track-over={trackOver ? 'true' : 'false'}
        data-file-over={fileIndex === null ? 'false' : 'true'}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {children}
      </div>
    </FileDropContext>
  );
}
