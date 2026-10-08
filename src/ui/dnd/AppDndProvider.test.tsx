import type { Active, ClientRect, DroppableContainer } from '@dnd-kit/core';
import { screen } from '@testing-library/react';
import { makeTrack } from '../../core/test-utils/fakes';
import { strings } from '../i18n/es';
import { renderWithStore } from '../screens/test-utils/render';
import { AppDndProvider } from './AppDndProvider';
import { collisionDetection } from './collision';
import { entrySortId, readDragData } from './dragData';

type Args = Parameters<typeof collisionDetection>[0];

function rect(top: number, height = 50, left = 0, width = 200): ClientRect {
  return { top, left, width, height, bottom: top + height, right: left + width };
}

function container(id: string, data: unknown): DroppableContainer {
  return { id, data: { current: data } } as unknown as DroppableContainer;
}

function args(activeData: unknown, entries: [DroppableContainer, ClientRect][], y: number): Args {
  return {
    active: { id: 'drag', data: { current: activeData } } as unknown as Active,
    collisionRect: rect(y, 20),
    droppableRects: new Map(entries.map(([c, r]) => [c.id, r])),
    droppableContainers: entries.map(([c]) => c),
    pointerCoordinates: { x: 10, y },
  };
}

const row = (id: string, top: number): [DroppableContainer, ClientRect] => [
  container(`list:${id}`, { type: 'entry', entryId: id, scope: 'list' }),
  rect(top),
];
const zone: [DroppableContainer, ClientRect] = [
  container('zone:list', { type: 'zone', scope: 'list' }),
  rect(0, 400),
];
const sidebar: [DroppableContainer, ClientRect] = [
  container('playlist:p', { type: 'playlist', playlistId: 'p', name: 'Rock' }),
  rect(500, 40),
];
const track = { type: 'track', track: makeTrack('t') };

describe('collisionDetection', () => {
  it('prefers the row under the pointer over the zone that contains it', () => {
    const hits = collisionDetection(args(track, [zone, row('a', 0), row('b', 50)], 60));
    expect(hits[0]?.id).toBe('list:b');
    expect(hits.map((hit) => hit.id)).toContain('zone:list');
  });

  it('falls back to the zone in the gap below the last row', () => {
    const hits = collisionDetection(args(track, [zone, row('a', 0)], 300));
    expect(hits[0]?.id).toBe('zone:list');
  });

  it('puts a sidebar playlist first when the pointer is over it', () => {
    const hits = collisionDetection(args(track, [zone, row('a', 0), sidebar], 510));
    expect(hits.map((hit) => hit.id)).toEqual(['playlist:p']);
  });

  it('finds nothing when the pointer is over no target', () => {
    expect(collisionDetection(args(track, [row('a', 0)], 900))).toEqual([]);
  });

  it('compares dragged entries with other entries only', () => {
    const entry = { type: 'entry', entryId: 'a', scope: 'list' };
    const hits = collisionDetection(args(entry, [zone, row('a', 0), row('b', 50), sidebar], 55));
    expect(hits[0]?.id).toBe('list:b');
    expect(hits.map((hit) => hit.id)).not.toContain('playlist:p');
    expect(hits.map((hit) => hit.id)).not.toContain('zone:list');
  });
});

describe('readDragData', () => {
  it('accepts every well formed shape', () => {
    expect(readDragData({ type: 'entry', entryId: 'a', scope: 'queue' })).toEqual({
      type: 'entry',
      entryId: 'a',
      scope: 'queue',
    });
    expect(readDragData({ type: 'zone-current', scope: 'queue' })).toEqual({
      type: 'zone-current',
      scope: 'queue',
    });
    expect(readDragData({ type: 'zone', scope: 'list' })?.type).toBe('zone');
    expect(readDragData(track)?.type).toBe('track');
    expect(readDragData({ type: 'playlist', playlistId: 'p', name: 'Rock' })?.type).toBe(
      'playlist',
    );
  });

  it('rejects malformed data', () => {
    for (const bad of [
      null,
      'entry',
      { type: 'entry', entryId: 1, scope: 'list' },
      { type: 'entry', entryId: 'a', scope: 'sideways' },
      { type: 'track', track: 3 },
      { type: 'track', track: {} },
      { type: 'playlist', playlistId: 'p' },
      { type: 'zone', scope: 'x' },
      { type: 'other' },
    ]) {
      expect(readDragData(bad)).toBeNull();
    }
  });

  it('scopes sortable ids so list and queue rows never collide', () => {
    expect(entrySortId('list', 'a')).not.toBe(entrySortId('queue', 'a'));
  });
});

describe('AppDndProvider', () => {
  it('renders its children and a polite live region for announcements', () => {
    renderWithStore(
      <AppDndProvider>
        <p>child</p>
      </AppDndProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(document.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it('documents the keyboard model in the screen reader instructions', () => {
    expect(strings.dnd.instructions).toMatch(/Alt/);
    expect(strings.dnd.instructions).toMatch(/Espacio/);
    expect(strings.dnd.instructions).toMatch(/Insertar después de/);
  });
});
