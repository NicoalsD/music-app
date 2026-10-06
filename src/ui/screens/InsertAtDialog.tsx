import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Track } from '../../core/Song';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Button } from '../components/Button';
import { Dialog, DialogClose } from '../components/Dialog';
import { IconButton } from '../components/IconButton';
import { LanternCord } from '../components/LanternCord';
import { ShojiPanel } from '../components/ShojiPanel';
import { strings } from '../i18n/es';
import { parsePosition } from './insertPosition';
import type { ParsedPosition } from './insertPosition';
import styles from './InsertAtDialog.module.css';

export interface InsertAtDialogProps {
  track: Track;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const selectTitles = (snapshot: PlayerSnapshot): readonly string[] =>
  snapshot.songs.map((s) => s.title);
const sameTitles = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((title, i) => title === b[i]);

function problemText(parsed: ParsedPosition, size: number): string | null {
  if (parsed.ok) return null;
  switch (parsed.problem) {
    case 'empty':
      return strings.insert.errorEmpty;
    case 'not-integer':
      return strings.insert.errorNotInteger;
    case 'out-of-range':
      return strings.insert.errorRange(size + 1);
  }
}

interface PreviewRow {
  readonly key: string;
  readonly label: string;
  readonly isNew: boolean;
}

/** The new song between its future neighbours (index is 0-based). */
function previewRows(titles: readonly string[], index: number, newTitle: string): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const before = titles[index - 1];
  const after = titles[index];
  if (before !== undefined) rows.push({ key: 'before', label: before, isNew: false });
  rows.push({ key: 'new', label: newTitle, isNew: true });
  if (after !== undefined) rows.push({ key: 'after', label: after, isNew: false });
  return rows;
}

/** Insert a track at a 1-based position, with a live preview of where it lands. */
export function InsertAtDialog({ track, open, onOpenChange }: InsertAtDialogProps) {
  const store = useStore();
  const titles = usePlayerSnapshot(selectTitles, sameTitles);
  const size = titles.length;
  const [raw, setRaw] = useState(String(size + 1));
  const inputId = useId();
  const errorId = useId();
  const parsed = parsePosition(raw, size);
  const error = problemText(parsed, size);
  const rows = parsed.ok ? previewRows(titles, parsed.index, track.title) : [];

  function step(delta: number) {
    const base = parsed.ok ? parsed.position : delta > 0 ? 0 : size + 2;
    setRaw(String(Math.min(Math.max(base + delta, 1), size + 1)));
  }

  function submit() {
    if (!parsed.ok) return;
    store.addAt(parsed.index, track);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={strings.insert.title}
      description={strings.insert.description(track.title)}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className={styles.label} htmlFor={inputId}>
          {strings.add.positionLabel}
        </label>
        <div className={styles.stepper}>
          <IconButton
            label={strings.insert.decrease}
            icon={<Minus size={18} strokeWidth={1.5} />}
            onClick={() => step(-1)}
          />
          <input
            id={inputId}
            className={styles.input}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={raw}
            aria-invalid={!parsed.ok}
            aria-describedby={errorId}
            onChange={(event) => setRaw(event.target.value)}
          />
          <IconButton
            label={strings.insert.increase}
            icon={<Plus size={18} strokeWidth={1.5} />}
            onClick={() => step(1)}
          />
        </div>
        <div className={styles.shortcuts}>
          <Button variant="ghost" onClick={() => setRaw('1')}>
            {strings.insert.start}
          </Button>
          <Button variant="ghost" onClick={() => setRaw(String(size + 1))}>
            {strings.insert.end}
          </Button>
        </div>
        <p id={errorId} className={styles.error} role="status" data-invalid={!parsed.ok}>
          {error ?? strings.insert.positionHint(size + 1)}
        </p>

        <ShojiPanel flat className={styles.preview}>
          <p className={styles.previewTitle}>{strings.insert.previewLabel}</p>
          {size === 0 ? (
            <p className={styles.previewEmpty}>{strings.insert.previewEmpty}</p>
          ) : rows.length === 0 ? null : (
            <ol className={styles.previewList} aria-label={strings.insert.previewLabel}>
              {rows.map((row, i) => (
                <li
                  key={row.key}
                  className={styles.previewRow}
                  data-new={row.isNew ? 'true' : 'false'}
                >
                  <LanternCord isHead={i === 0} isTail={i === rows.length - 1} lit={row.isNew} />
                  <span className={styles.previewText}>
                    {row.label}
                    {row.isNew ? (
                      <span className={styles.newTag}>{strings.insert.previewNew}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ShojiPanel>

        <div className={styles.actions}>
          <DialogClose asChild>
            <Button variant="ghost">{strings.dialog.cancel}</Button>
          </DialogClose>
          <Button variant="primary" type="submit" disabled={!parsed.ok}>
            {strings.add.confirm}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
