import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LyricsProviderScope,
  StoreProvider,
  usePlayerSnapshot,
  useSearch,
  useStore,
} from '../state';
import type { PlayerSnapshot } from '../state';
import type { LyricsProvider } from '../providers';
import type { PlayerStore } from '../state';
import { BackdropScene } from '../ui/components/BackdropScene';
import { Toaster } from '../ui/components/Toaster';
import { TooltipProvider } from '../ui/components/Tooltips';
import { strings } from '../ui/i18n/es';
import { AlbumDetail } from '../ui/screens/AlbumDetail';
import { ArtistDetail } from '../ui/screens/ArtistDetail';
import { DetailPanel } from '../ui/screens/DetailPanel';
import { HomeView } from '../ui/screens/HomeView';
import { LibrarySidebar } from '../ui/screens/LibrarySidebar';
import type { SidebarSection } from '../ui/screens/LibrarySidebar';
import { MobileNav } from '../ui/screens/MobileNav';
import type { MobileSection } from '../ui/screens/MobileNav';
import { NowPlayingView } from '../ui/screens/NowPlayingView';
import { PlayerBar } from '../ui/screens/PlayerBar';
import { PlaylistPanel } from '../ui/screens/PlaylistPanel';
import { SEARCH_INPUT_ID } from '../ui/screens/SearchField';
import { SearchPanel } from '../ui/screens/SearchPanel';
import { ShortcutsDialog } from '../ui/screens/ShortcutsDialog';
import { TopBar } from '../ui/screens/TopBar';
import { pickArtworkUrl } from '../ui/components/artworkSizing';
import { useSunColor } from '../ui/useSunColor';
import { useDocumentTitle } from '../ui/screens/useDocumentTitle';
import { useGlobalShortcuts } from '../ui/screens/useGlobalShortcuts';
import { useMainNavigation } from '../ui/screens/mainView';
import type { MainView } from '../ui/screens/mainView';
import styles from './App.module.css';

const TOAST_OFFSET_PX = 168;

function sidebarSection(view: MainView): SidebarSection {
  if (view.kind === 'home') return 'home';
  if (view.kind === 'playlist') return 'other';
  return 'search';
}

const selectArtworkUrl = (s: PlayerSnapshot): string | undefined => {
  const current = s.songs[s.currentIndex];
  return current === undefined ? undefined : pickArtworkUrl(current.artwork, 'md');
};

function AppShell() {
  const store = useStore();
  const search = useSearch(store.provider);
  const nav = useMainNavigation();
  const { view } = nav;
  const [helpOpen, setHelpOpen] = useState(false);
  // Narrow screens only: the sidebar fills the main area while "Biblioteca" is selected.
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Hooks for the Now Playing view: it opens from the player bar's cover and expand button.
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(true);
  // The sun takes the cover's dominant colour only while the Now Playing view is open.
  const artworkUrl = usePlayerSnapshot(selectArtworkUrl);
  const artworkSun = useSunColor(nowPlayingOpen ? artworkUrl : undefined);

  const { goTo, push } = nav;

  const goHome = useCallback(() => {
    setLibraryOpen(false);
    goTo({ kind: 'home' });
  }, [goTo]);
  const showSearch = useCallback(() => {
    setLibraryOpen(false);
    goTo({ kind: 'search' });
  }, [goTo]);
  const goToSearch = useCallback(() => {
    showSearch();
    requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
  }, [showSearch]);
  const openPlaylist = useCallback(
    (id: string) => {
      if (id !== store.getSnapshot().activePlaylistId) store.switchPlaylist(id);
      setLibraryOpen(false);
      goTo({ kind: 'playlist' });
    },
    [store, goTo],
  );
  const selectMobileSection = useCallback(
    (section: MobileSection) => {
      if (section === 'home') goHome();
      else if (section === 'search') goToSearch();
      else setLibraryOpen(true);
    },
    [goHome, goToSearch],
  );
  const showHelp = useCallback(() => setHelpOpen(true), []);
  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), []);
  // The bar's "Letra" button: Now Playing is modal, so it is only reachable while the view is
  // closed, and it opens the view with the lyrics column visible.
  const openWithLyrics = useCallback(() => {
    setLyricsOpen(true);
    setNowPlayingOpen(true);
  }, []);
  const toggleLyricsColumn = useCallback(() => setLyricsOpen((open) => !open), []);

  useGlobalShortcuts({ onFocusSearch: goToSearch, onShowHelp: showHelp });
  useDocumentTitle();

  const mobileSection: MobileSection = libraryOpen
    ? 'library'
    : view.kind === 'home'
      ? 'home'
      : view.kind === 'playlist'
        ? 'library'
        : 'search';

  let main: ReactNode;
  switch (view.kind) {
    case 'home':
      main = <HomeView onOpenPlaylist={openPlaylist} onGoToSearch={goToSearch} />;
      break;
    case 'search':
      main = (
        <SearchPanel
          search={search}
          onOpenAlbum={(album) => push({ kind: 'album', id: album.id })}
          onOpenArtist={(artist) => push({ kind: 'artist', id: artist.id })}
        />
      );
      break;
    case 'playlist':
      main = <PlaylistPanel onGoToSearch={goToSearch} />;
      break;
    case 'album':
      main = (
        <DetailPanel>
          <AlbumDetail key={view.id} albumId={view.id} onBack={nav.back} />
        </DetailPanel>
      );
      break;
    case 'artist':
      main = (
        <DetailPanel>
          <ArtistDetail
            key={view.id}
            artistId={view.id}
            onBack={nav.back}
            onOpenAlbum={(album) => push({ kind: 'album', id: album.id })}
          />
        </DetailPanel>
      );
      break;
  }

  return (
    <>
      <BackdropScene {...(artworkSun === null ? {} : { sunColor: artworkSun })} />
      <a className={styles.skip} href="#main">
        {strings.app.skipToContent}
      </a>
      <div
        className={styles.shell}
        data-library-open={libraryOpen ? 'true' : 'false'}
        data-now-playing={nowPlayingOpen ? 'true' : 'false'}
      >
        <TopBar
          searchText={search.text}
          onSearchTextChange={search.setText}
          onActivateSearch={showSearch}
          onGoHome={goHome}
          homeActive={view.kind === 'home'}
          onShowShortcuts={showHelp}
        />
        <LibrarySidebar
          className={styles.sidebar}
          section={sidebarSection(view)}
          onGoHome={goHome}
          onGoSearch={goToSearch}
          onOpenPlaylist={openPlaylist}
        />
        <main id="main" className={styles.main}>
          {main}
        </main>
        <MobileNav current={mobileSection} onSelect={selectMobileSection} />
      </div>
      <div className={styles.barSlot} data-now-playing={nowPlayingOpen ? 'true' : 'false'}>
        <PlayerBar
          onOpenNowPlaying={openNowPlaying}
          onToggleLyrics={openWithLyrics}
          lyricsOpen={nowPlayingOpen && lyricsOpen}
        />
      </div>
      <NowPlayingView
        open={nowPlayingOpen}
        onOpenChange={setNowPlayingOpen}
        lyricsOpen={lyricsOpen}
        onToggleLyrics={toggleLyricsColumn}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Toaster offset={TOAST_OFFSET_PX} />
    </>
  );
}

export interface AppProps {
  /** Created once outside React (see main.tsx) so StrictMode cannot build it twice. */
  store: PlayerStore;
  /** Created once outside React too; tests inject a fake so they never touch the network. */
  lyricsProvider: LyricsProvider;
}

/** Application root: store context, tooltips and the screen shell. */
export function App({ store, lyricsProvider }: AppProps) {
  return (
    <StoreProvider store={store}>
      <LyricsProviderScope provider={lyricsProvider}>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </LyricsProviderScope>
    </StoreProvider>
  );
}
