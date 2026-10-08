import type { ReactNode } from 'react';
import type { AlbumSummary, ArtistSummary } from '../../providers/MusicProvider';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, SearchFilter, UseSearchResult } from '../../state';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { FilterChips } from '../components/FilterChips';
import { RevealList } from '../components/Reveal';
import { ShojiPanel } from '../components/ShojiPanel';
import { Spinner } from '../components/Spinner';
import { strings } from '../i18n/es';
import { AlbumGrid, ArtistRow } from './CatalogLists';
import { TrackResultRow } from './TrackRows';
import styles from './SearchPanel.module.css';

const FILTER_ITEMS: ReadonlyArray<{ value: SearchFilter; label: string }> = [
  { value: 'all', label: strings.search.filters.all },
  { value: 'songs', label: strings.search.filters.songs },
  { value: 'artists', label: strings.search.filters.artists },
  { value: 'albums', label: strings.search.filters.albums },
];

const selectLoggedIn = (snapshot: PlayerSnapshot): boolean => snapshot.spotify.auth === 'logged-in';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

interface ResultsProps {
  search: UseSearchResult;
  onOpenAlbum: (album: AlbumSummary) => void;
  onOpenArtist: (artist: ArtistSummary) => void;
}

function SearchResults({ search, onOpenAlbum, onOpenArtist }: ResultsProps) {
  const { status, filter, tracks, artists, albums, hasMore, loadingMore, loadMore, retry, text } =
    search;
  const showTracks = filter === 'all' || filter === 'songs';
  const showArtists = filter === 'all' || filter === 'artists';
  const showAlbums = filter === 'all' || filter === 'albums';

  switch (status) {
    case 'idle':
      return <EmptyState title={strings.search.emptyTitle} body={strings.search.emptyBody} />;
    case 'loading':
      return (
        <div className={styles.center}>
          <Spinner size={32} label={strings.search.loading} />
        </div>
      );
    case 'empty':
      return (
        <EmptyState
          title={strings.search.noResults(text.trim())}
          body={strings.search.noResultsHint}
        />
      );
    case 'error':
      return (
        <EmptyState
          title={strings.search.errorTitle}
          body={strings.search.errorBody}
          action={
            <Button variant="primary" onClick={retry}>
              {strings.search.retry}
            </Button>
          }
        />
      );
    case 'success':
      return (
        <div className={styles.results}>
          {showArtists && artists.length > 0 ? (
            <Section title={strings.search.sectionArtists}>
              <ArtistRow artists={artists} onOpenArtist={onOpenArtist} />
            </Section>
          ) : null}
          {showAlbums && albums.length > 0 ? (
            <Section title={strings.search.sectionAlbums}>
              <AlbumGrid albums={albums} onOpenAlbum={onOpenAlbum} />
            </Section>
          ) : null}
          {showTracks && tracks.length > 0 ? (
            <Section title={strings.search.sectionTracks}>
              <RevealList className={styles.tracks}>
                {tracks.map((track, i) => (
                  <TrackResultRow key={`${track.trackId}-${i}`} track={track} />
                ))}
              </RevealList>
            </Section>
          ) : null}
          {hasMore ? (
            <div className={styles.more}>
              {loadingMore ? (
                <Spinner label={strings.search.loadingMore} />
              ) : (
                <Button onClick={loadMore}>{strings.search.loadMore}</Button>
              )}
            </div>
          ) : null}
        </div>
      );
  }
}

export interface SearchPanelProps {
  /** Search state, owned by the shell so the top bar input and the results share it. */
  search: UseSearchResult;
  onOpenAlbum: (album: AlbumSummary) => void;
  onOpenArtist: (artist: ArtistSummary) => void;
}

/** The search view: filters and grouped results for the query typed in the top bar. */
export function SearchPanel({ search, onOpenAlbum, onOpenArtist }: SearchPanelProps) {
  const store = useStore();
  const loggedIn = usePlayerSnapshot(selectLoggedIn);

  let content: ReactNode;
  if (!loggedIn) {
    content = (
      <div className={styles.loggedOut}>
        <EmptyState
          title={strings.search.loggedOutTitle}
          body={strings.search.loggedOutBody}
          action={
            <Button variant="primary" onClick={() => void store.login()}>
              {strings.spotify.connect}
            </Button>
          }
        />
        <p className={styles.note}>{strings.search.localNote}</p>
      </div>
    );
  } else {
    content = (
      <>
        <div className={styles.controls}>
          <FilterChips
            label={strings.search.filtersLabel}
            items={FILTER_ITEMS}
            value={search.filter}
            onValueChange={search.setFilter}
          />
        </div>
        <div className={styles.body} aria-live="polite" aria-label={strings.search.resultsLabel}>
          <SearchResults search={search} onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} />
        </div>
      </>
    );
  }

  return (
    <ShojiPanel as="section" className={styles.panel} aria-labelledby="search-heading">
      <h2 id="search-heading" className={styles.heading}>
        {strings.search.label}
      </h2>
      <div className={styles.scroll}>{content}</div>
    </ShojiPanel>
  );
}
