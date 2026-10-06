import { useCallback, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { StoreProvider } from '../state';
import type { PlayerStore } from '../state';
import { BackdropScene } from '../ui/components/BackdropScene';
import { Toaster } from '../ui/components/Toaster';
import { TooltipProvider } from '../ui/components/Tooltips';
import { strings } from '../ui/i18n/es';
import { AppHeader } from '../ui/screens/AppHeader';
import { PlayerBar } from '../ui/screens/PlayerBar';
import { PlaylistPanel } from '../ui/screens/PlaylistPanel';
import { SEARCH_INPUT_ID, SearchPanel } from '../ui/screens/SearchPanel';
import { ShortcutsDialog } from '../ui/screens/ShortcutsDialog';
import { useDocumentTitle } from '../ui/screens/useDocumentTitle';
import { useGlobalShortcuts } from '../ui/screens/useGlobalShortcuts';
import styles from './App.module.css';

type TabValue = 'search' | 'playlist';

const TOAST_OFFSET_PX = 168;

function AppShell() {
  const [tab, setTab] = useState<TabValue>('search');
  const [helpOpen, setHelpOpen] = useState(false);

  const goToSearch = useCallback(() => {
    setTab('search');
    requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
  }, []);
  const showHelp = useCallback(() => setHelpOpen(true), []);

  useGlobalShortcuts({ onFocusSearch: goToSearch, onShowHelp: showHelp });
  useDocumentTitle();

  return (
    <>
      <BackdropScene />
      <a className={styles.skip} href="#main">
        {strings.app.skipToContent}
      </a>
      <div className={styles.shell}>
        <AppHeader onShowShortcuts={showHelp} />
        <Tabs.Root
          className={styles.tabs}
          value={tab}
          onValueChange={(next) => setTab(next === 'playlist' ? 'playlist' : 'search')}
        >
          <Tabs.List className={styles.tabList} aria-label={strings.layout.tabsLabel}>
            <Tabs.Trigger className={styles.tab} value="search">
              {strings.layout.tabSearch}
            </Tabs.Trigger>
            <Tabs.Trigger className={styles.tab} value="playlist">
              {strings.layout.tabPlaylist}
            </Tabs.Trigger>
          </Tabs.List>
          <main id="main" className={styles.main}>
            <Tabs.Content className={styles.pane} value="search" forceMount>
              <SearchPanel />
            </Tabs.Content>
            <Tabs.Content className={styles.pane} value="playlist" forceMount>
              <PlaylistPanel onGoToSearch={goToSearch} />
            </Tabs.Content>
          </main>
        </Tabs.Root>
      </div>
      <PlayerBar />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Toaster offset={TOAST_OFFSET_PX} />
    </>
  );
}

export interface AppProps {
  /** Created once outside React (see main.tsx) so StrictMode cannot build it twice. */
  store: PlayerStore;
}

/** Application root: store context, tooltips and the screen shell. */
export function App({ store }: AppProps) {
  return (
    <StoreProvider store={store}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </StoreProvider>
  );
}
