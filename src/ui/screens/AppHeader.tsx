import { Keyboard } from 'lucide-react';
import { Hanko } from '../components/Hanko';
import { IconButton } from '../components/IconButton';
import { ShojiPanel } from '../components/ShojiPanel';
import { strings } from '../i18n/es';
import { ImportFilesButton } from './ImportFilesButton';
import { SeigaihaBand } from './SeigaihaBand';
import { SpotifyStatus } from './SpotifyStatus';
import styles from './AppHeader.module.css';

export interface AppHeaderProps {
  onShowShortcuts: () => void;
}

/** Top strip: hanko logo and wordmark, Spotify status and "import files", over a seigaiha band. */
export function AppHeader({ onShowShortcuts }: AppHeaderProps) {
  return (
    <>
      <ShojiPanel as="header" kumiko className={styles.header}>
        <div className={styles.brand}>
          <Hanko kanji={strings.artwork.sealKanji} size={40} />
          <h1 className={styles.name}>{strings.app.name}</h1>
          <span className={styles.kanji} aria-hidden="true" title={strings.header.kanjiTitle}>
            {strings.header.kanji}
          </span>
        </div>
        <div className={styles.actions}>
          <SpotifyStatus />
          <ImportFilesButton />
          <IconButton
            label={strings.shortcuts.open}
            icon={<Keyboard size={20} strokeWidth={1.5} />}
            className={styles.help}
            onClick={onShowShortcuts}
          />
        </div>
      </ShojiPanel>
      <SeigaihaBand />
    </>
  );
}
