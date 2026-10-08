import { hasFiles, indexFromPointer, readRowRects } from './fileDrop';

const rows = [
  { index: 0, top: 0, height: 60 },
  { index: 1, top: 60, height: 60 },
  { index: 2, top: 120, height: 60 },
];

describe('indexFromPointer', () => {
  it('lands before the first row whose middle is below the pointer', () => {
    expect(indexFromPointer(rows, 10, 3)).toBe(0);
    expect(indexFromPointer(rows, 70, 3)).toBe(1);
    expect(indexFromPointer(rows, 100, 3)).toBe(2);
  });

  it('falls back to the end below every row or with no rows', () => {
    expect(indexFromPointer(rows, 170, 3)).toBe(3);
    expect(indexFromPointer([], 10, 0)).toBe(0);
  });
});

describe('readRowRects', () => {
  it('reads indexed rows and skips invalid ones', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<div data-song-index="2"></div><div data-song-index="x"></div><div></div>';
    expect(readRowRects(container)).toEqual([{ index: 2, top: 0, height: 0 }]);
  });
});

describe('hasFiles', () => {
  it('is true only when the drag carries files', () => {
    expect(hasFiles(null)).toBe(false);
    expect(hasFiles({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
    expect(hasFiles({ types: ['Files'] } as unknown as DataTransfer)).toBe(true);
  });
});
