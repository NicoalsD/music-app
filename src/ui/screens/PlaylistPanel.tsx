import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useStore, usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { ShojiPanel } from '../components/ShojiPanel';
import { formatTime } from '../format';
import { strings } from '../i18n/es';
import { PlaylistSwitcher } from './PlaylistSwitcher';
import { PlaylistView } from './PlaylistView';
import styles from './PlaylistPanel.module.css';

export interface PlaylistPanelProps {
  onGoToSearch: () => void;
}

const selectCount = (s: PlayerSnapshot): number => s.songs.length;
const selectTotal = (s: PlayerSnapshot): number => s.totalDurationMs;

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/** The playlist column: switcher, count and total time, the lantern list and a file drop zone. */
export function PlaylistPanel({ onGoToSearch }: PlaylistPanelProps) {
  const store = useStore();
  const count = usePlayerSnapshot(selectCount);
  const total = usePlayerSnapshot(selectTotal);
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);

  function onDragEnter(event: DragEvent) {
    if (!hasFiles(event)) return;
    depth.current += 1;
    setDropping(true);
  }

  function onDragOver(event: DragEvent) {
    if (hasFiles(event)) event.preventDefault();
  }

  function onDragLeave(event: DragEvent) {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDropping(false);
  }

  function onDrop(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDropping(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void store.importLocalFiles(files);
  }

  return (
    <ShojiPanel
      as="section"
      className={styles.panel}
      aria-labelledby="playlist-heading"
      data-dropping={dropping ? 'true' : 'false'}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className={styles.header}>
        <h2 id="playlist-heading" className="visually-hidden">
          {strings.playlist.title}
        </h2>
        <span className={styles.kanji} aria-hidden="true" title={strings.playlist.titleKanjiTitle}>
          {strings.playlist.titleKanji}
        </span>
        <PlaylistSwitcher />
        <p className={`${styles.summary} tabular`}>
          {strings.playlist.songCount(count)}
          {count > 0 ? ` · ${strings.playlist.totalDuration(formatTime(total))}` : ''}
        </p>
      </header>
      <div className={styles.scroll}>
        <PlaylistView onGoToSearch={onGoToSearch} />
      </div>
      {dropping ? (
        <div className={styles.drop} role="presentation">
          <p className={styles.dropTitle}>{strings.playlist.dropTitle}</p>
          <p className={styles.dropBody}>{strings.playlist.dropBody}</p>
        </div>
      ) : null}
    </ShojiPanel>
  );
}
