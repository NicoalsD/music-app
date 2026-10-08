export interface RowRect {
  readonly index: number;
  readonly top: number;
  readonly height: number;
}

/**
 * The playlist index at which something dropped at `clientY` lands: before the first row whose
 * middle is below the pointer, or `fallback` (the end) when the pointer is below every row.
 */
export function indexFromPointer(
  rows: readonly RowRect[],
  clientY: number,
  fallback: number,
): number {
  for (const row of rows) {
    if (clientY < row.top + row.height / 2) return row.index;
  }
  return fallback;
}

/** Reads the `[data-song-index]` rows inside a list container. */
export function readRowRects(container: HTMLElement): RowRect[] {
  const rows: RowRect[] = [];
  for (const el of container.querySelectorAll<HTMLElement>('[data-song-index]')) {
    const index = Number(el.dataset['songIndex']);
    if (!Number.isInteger(index)) continue;
    const rect = el.getBoundingClientRect();
    rows.push({ index, top: rect.top, height: rect.height });
  }
  return rows;
}

export function hasFiles(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer !== null && Array.from(dataTransfer.types).includes('Files');
}
