import { closestCenter, pointerWithin } from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';
import { readDragData } from './dragData';
import type { DragData } from './dragData';

const TARGET_PRIORITY: Readonly<Record<DragData['type'], number>> = {
  playlist: 0,
  entry: 1,
  'zone-current': 2,
  zone: 3,
  track: 4,
};

/**
 * Entries only compare against other entries. Catalog tracks use the pointer position, and the
 * most specific target under it wins: sidebar playlist, then a row, then the empty space.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const kind = readDragData(args.active.data.current)?.type;
  if (kind === 'track') {
    return pointerWithin(args)
      .map((collision, order) => ({
        collision,
        order,
        priority:
          TARGET_PRIORITY[
            readDragData(collision.data?.droppableContainer.data.current)?.type ?? 'track'
          ],
      }))
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((entry) => entry.collision);
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) => readDragData(container.data.current)?.type === 'entry',
    ),
  });
};
