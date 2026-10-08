import { House, Keyboard } from 'lucide-react';
import { Hanko } from '../components/Hanko';
import { IconButton } from '../components/IconButton';
import { ShojiPanel } from '../components/ShojiPanel';
import { strings } from '../i18n/es';
import { SearchField } from './SearchField';
import { SeigaihaBand } from './SeigaihaBand';
import { SpotifyStatus } from './SpotifyStatus';
import styles from './TopBar.module.css';

export interface TopBarProps {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** The search field was focused or typed in: show the search view. */
  onActivateSearch: () => void;
  onGoHome: () => void;
  homeActive: boolean;
  onShowShortcuts: () => void;
}

/** Top strip: logo, round home button, centered search, Spotify status and shortcuts help. */
export function TopBar({
  searchText,
  onSearchTextChange,
  onActivateSearch,
  onGoHome,
  homeActive,
  onShowShortcuts,
}: TopBarProps) {
  return (
    <ShojiPanel as="header" kumiko className={styles.bar}>
      <div className={styles.band} aria-hidden="true">
        <SeigaihaBand />
      </div>
      <div className={styles.brand}>
        <Hanko kanji={strings.artwork.sealKanji} size={36} />
        <h1 className={styles.name}>{strings.app.name}</h1>
        <span className={styles.kanji} aria-hidden="true" title={strings.header.kanjiTitle}>
          {strings.header.kanji}
        </span>
      </div>
      <div className={styles.center}>
        <IconButton
          label={strings.nav.homeButton}
          icon={<House size={20} strokeWidth={1.5} />}
          className={styles.home}
          aria-current={homeActive ? 'page' : undefined}
          onClick={onGoHome}
        />
        <SearchField
          text={searchText}
          onTextChange={onSearchTextChange}
          onActivate={onActivateSearch}
        />
      </div>
      <div className={styles.actions}>
        <SpotifyStatus />
        <IconButton
          label={strings.shortcuts.open}
          icon={<Keyboard size={20} strokeWidth={1.5} />}
          className={styles.help}
          onClick={onShowShortcuts}
        />
      </div>
    </ShojiPanel>
  );
}
