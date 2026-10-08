import { makeTrack } from '../../core/test-utils/fakes';
import { applyDrop, dispatchDragEnd, resolveDrop } from './resolveDrop';
import type { DropActions, DropContext, DropInput } from './resolveDrop';

const songs = [{ entryId: 'a' }, { entryId: 'b' }, { entryId: 'c' }, { entryId: 'd' }];
const context: DropContext = { songs, currentIndex: 1 };
const track = makeTrack('new');

const entry = (entryId: string, scope: 'list' | 'queue' = 'list') => ({
  type: 'entry',
  entryId,
  scope,
});
const dragged = { type: 'track', track };

function input(partial: Partial<DropInput> & Pick<DropInput, 'activeData'>): DropInput {
  return { overData: undefined, overRect: null, pointerY: null, ...partial };
}

function makeActions() {
  const calls: string[] = [];
  const actions: DropActions = {
    move: (from, to) => calls.push(`move ${from} ${to}`),
    addAt: (index, t) => calls.push(`addAt ${index} ${t.trackId}`),
    addToPlaylist: (id, t) => calls.push(`addToPlaylist ${id} ${t.trackId}`),
  };
  return { calls, actions };
}

describe('resolveDrop for a playlist entry', () => {
  it('reorders onto another entry', () => {
    expect(resolveDrop(input({ activeData: entry('a'), overData: entry('c') }), context)).toEqual({
      kind: 'reorder',
      from: 0,
      to: 2,
    });
  });

  it('does nothing when dropped on itself or on nothing', () => {
    expect(resolveDrop(input({ activeData: entry('a'), overData: entry('a') }), context)).toEqual({
      kind: 'none',
    });
    expect(resolveDrop(input({ activeData: entry('a') }), context)).toEqual({ kind: 'none' });
  });

  it('goes to the end when dropped on empty space', () => {
    expect(
      resolveDrop(
        input({ activeData: entry('b'), overData: { type: 'zone', scope: 'list' } }),
        context,
      ),
    ).toEqual({ kind: 'reorder', from: 1, to: 3 });
  });

  it('lands right after the current song when dropped on the now playing slot', () => {
    const slot = { type: 'zone-current', scope: 'queue' };
    expect(resolveDrop(input({ activeData: entry('d'), overData: slot }), context)).toEqual({
      kind: 'reorder',
      from: 3,
      to: 2,
    });
    expect(resolveDrop(input({ activeData: entry('a'), overData: slot }), context)).toEqual({
      kind: 'reorder',
      from: 0,
      to: 1,
    });
    expect(resolveDrop(input({ activeData: entry('b'), overData: slot }), context)).toEqual({
      kind: 'none',
    });
  });

  it('ignores a sidebar playlist and unknown entries', () => {
    const playlist = { type: 'playlist', playlistId: 'p', name: 'Rock' };
    expect(resolveDrop(input({ activeData: entry('a'), overData: playlist }), context).kind).toBe(
      'none',
    );
    expect(
      resolveDrop(input({ activeData: entry('zz'), overData: entry('a') }), context).kind,
    ).toBe('none');
    expect(
      resolveDrop(input({ activeData: entry('a'), overData: entry('zz') }), context).kind,
    ).toBe('none');
  });
});

describe('resolveDrop for a catalog track', () => {
  const rect = { top: 100, height: 60 };

  it('inserts before a row when the pointer is in its upper half', () => {
    expect(
      resolveDrop(
        input({ activeData: dragged, overData: entry('c'), overRect: rect, pointerY: 120 }),
        context,
      ),
    ).toEqual({ kind: 'insert', index: 2, scope: 'list', track });
  });

  it('inserts after a row when the pointer is in its lower half', () => {
    expect(
      resolveDrop(
        input({
          activeData: dragged,
          overData: entry('c', 'queue'),
          overRect: rect,
          pointerY: 150,
        }),
        context,
      ),
    ).toEqual({ kind: 'insert', index: 3, scope: 'queue', track });
  });

  it('inserts before the row without a pointer (keyboard or unknown)', () => {
    expect(
      resolveDrop(input({ activeData: dragged, overData: entry('a') }), context),
    ).toMatchObject({ kind: 'insert', index: 0 });
  });

  it('appends on empty space', () => {
    expect(
      resolveDrop(
        input({ activeData: dragged, overData: { type: 'zone', scope: 'list' } }),
        context,
      ),
    ).toMatchObject({ kind: 'insert', index: 4, scope: 'list' });
  });

  it('inserts after the current song on the now playing slot, or at 0 for an empty list', () => {
    const slot = { type: 'zone-current', scope: 'queue' };
    expect(resolveDrop(input({ activeData: dragged, overData: slot }), context)).toMatchObject({
      index: 2,
      scope: 'queue',
    });
    expect(
      resolveDrop(input({ activeData: dragged, overData: slot }), { songs: [], currentIndex: -1 }),
    ).toMatchObject({ index: 0 });
  });

  it('adds to the end of a sidebar playlist', () => {
    expect(
      resolveDrop(
        input({
          activeData: dragged,
          overData: { type: 'playlist', playlistId: 'p', name: 'Rock' },
        }),
        context,
      ),
    ).toEqual({ kind: 'add-to-playlist', playlistId: 'p', name: 'Rock', track });
  });

  it('ignores unknown rows, nothing and malformed data', () => {
    expect(resolveDrop(input({ activeData: dragged, overData: entry('zz') }), context).kind).toBe(
      'none',
    );
    expect(resolveDrop(input({ activeData: dragged }), context).kind).toBe('none');
    expect(
      resolveDrop(input({ activeData: { type: 'nope' }, overData: entry('a') }), context),
    ).toEqual({ kind: 'none' });
    expect(resolveDrop(input({ activeData: dragged, overData: dragged }), context).kind).toBe(
      'none',
    );
    expect(
      resolveDrop(
        input({
          activeData: { type: 'playlist', playlistId: 'p', name: 'x' },
          overData: entry('a'),
        }),
        context,
      ).kind,
    ).toBe('none');
  });
});

describe('dispatchDragEnd', () => {
  it('calls move for a dropped entry', () => {
    const { calls, actions } = makeActions();
    dispatchDragEnd(input({ activeData: entry('a'), overData: entry('c') }), context, actions);
    expect(calls).toEqual(['move 0 2']);
  });

  it('calls addAt for a track dropped on the list', () => {
    const { calls, actions } = makeActions();
    dispatchDragEnd(
      input({
        activeData: dragged,
        overData: entry('b'),
        overRect: { top: 0, height: 10 },
        pointerY: 9,
      }),
      context,
      actions,
    );
    expect(calls).toEqual(['addAt 2 new']);
  });

  it('calls addToPlaylist for a track dropped on a sidebar playlist, without move or addAt', () => {
    const { calls, actions } = makeActions();
    dispatchDragEnd(
      input({ activeData: dragged, overData: { type: 'playlist', playlistId: 'p', name: 'Rock' } }),
      context,
      actions,
    );
    expect(calls).toEqual(['addToPlaylist p new']);
  });

  it('does nothing for a cancelled drop', () => {
    const { calls, actions } = makeActions();
    applyDrop(dispatchDragEnd(input({ activeData: dragged }), context, actions), actions);
    expect(calls).toEqual([]);
  });
});
