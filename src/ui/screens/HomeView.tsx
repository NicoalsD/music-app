import { Pause, Play } from 'lucide-react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot, PlaylistSummary, SongView } from '../../state';
import { Artwork } from '../components/Artwork';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Hanko } from '../components/Hanko';
import { Reveal, RevealList } from '../components/Reveal';
import { ShojiPanel } from '../components/ShojiPanel';
import { strings } from '../i18n/es';
import { RECENT_COUNT, greetingFor } from './homeData';
import { ImportFilesButton } from './ImportFilesButton';
import styles from './HomeView.module.css';

export interface HomeViewProps {
  /** Opens the playlist view for this playlist (the shell also makes it active). */
  onOpenPlaylist: (id: string) => void;
  onGoToSearch: () => void;
  /** Injected for tests; defaults to the current hour. */
  hour?: number;
}

const selectPlaylists = (s: PlayerSnapshot): readonly PlaylistSummary[] => s.playlists;
const selectSongs = (s: PlayerSnapshot): readonly SongView[] => s.songs;
const selectCurrentIndex = (s: PlayerSnapshot): number => s.currentIndex;
const selectActiveId = (s: PlayerSnapshot): string => s.activePlaylistId;
const selectPlaying = (s: PlayerSnapshot): boolean =>
  s.player.status === 'playing' || s.player.status === 'loading';

/**
 * Home: a greeting, the song to continue with, the user's playlists as tiles and the latest
 * additions. Built only from local store state (Spotify has no browse endpoints for this app).
 */
export function HomeView({ onOpenPlaylist, onGoToSearch, hour }: HomeViewProps) {
  const store = useStore();
  const playlists = usePlayerSnapshot(selectPlaylists);
  const songs = usePlayerSnapshot(selectSongs);
  const currentIndex = usePlayerSnapshot(selectCurrentIndex);
  const activeId = usePlayerSnapshot(selectActiveId);
  const playing = usePlayerSnapshot(selectPlaying);

  const current = songs[currentIndex];
  const firstSong = songs[0];
  const recent = songs.slice(-RECENT_COUNT).reverse();
  const totalSongs = playlists.reduce((sum, playlist) => sum + playlist.size, 0);

  return (
    <ShojiPanel as="section" className={styles.panel} aria-labelledby="home-heading">
      <div className={styles.scroll}>
        <h2 id="home-heading" className={styles.greeting}>
          {greetingFor(hour ?? new Date().getHours())}
        </h2>

        {totalSongs === 0 ? (
          <EmptyState
            title={strings.home.emptyTitle}
            body={strings.home.emptyBody}
            action={
              <div className={styles.actions}>
                <Button variant="primary" onClick={onGoToSearch}>
                  {strings.home.emptySearch}
                </Button>
                <ImportFilesButton />
              </div>
            }
          />
        ) : null}

        {current === undefined ? null : (
          <Reveal>
            <section className={styles.section} aria-labelledby="home-continue">
              <h3 id="home-continue" className={styles.sectionTitle}>
                {strings.home.continueTitle}
              </h3>
              <div className={styles.continue}>
                <Artwork
                  artwork={current.artwork}
                  title={current.title}
                  album={current.albumName}
                  size="xl"
                  className={styles.cover}
                />
                <div className={styles.continueText}>
                  <p className={styles.songTitle}>{current.title}</p>
                  <p className={styles.songMeta}>
                    {[current.artistLabel, current.albumName].filter((p) => p !== '').join(' · ')}
                  </p>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      disabled={current.unavailable}
                      onClick={() => store.togglePlay()}
                    >
                      {playing ? (
                        <Pause size={18} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <Play size={18} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {playing ? strings.player.pause : strings.player.play}
                    </Button>
                    <Button onClick={() => onOpenPlaylist(activeId)}>
                      {strings.home.openInList}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </Reveal>
        )}

        <Reveal>
          <section className={styles.section} aria-labelledby="home-playlists">
            <h3 id="home-playlists" className={styles.sectionTitle}>
              {strings.home.playlistsTitle}
            </h3>
            <RevealList className={styles.grid}>
              {playlists.map((playlist) => {
                const count = strings.playlist.songCount(playlist.size);
                const cover = playlist.isActive && firstSong !== undefined ? firstSong : null;
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    className={styles.tile}
                    aria-label={strings.home.openPlaylistTile(playlist.name, count)}
                    aria-current={playlist.isActive ? 'true' : undefined}
                    onClick={() => onOpenPlaylist(playlist.id)}
                  >
                    <Artwork
                      artwork={cover === null ? {} : cover.artwork}
                      title={playlist.name}
                      album={playlist.name}
                      size="lg"
                    />
                    <span className={styles.tileName}>{playlist.name}</span>
                    <span className={styles.tileMeta}>
                      {count}
                      {playlist.isActive ? (
                        <Chip className={styles.badge}>
                          <Hanko kanji={strings.sidebar.activeKanji} size={16} />
                          {strings.home.activeBadge}
                        </Chip>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </RevealList>
          </section>
        </Reveal>

        {recent.length === 0 ? null : (
          <Reveal>
            <section className={styles.section} aria-labelledby="home-recent">
              <h3 id="home-recent" className={styles.sectionTitle}>
                {strings.home.recentTitle}
              </h3>
              <RevealList className={styles.recent}>
                {recent.map((song) => (
                  <button
                    key={song.entryId}
                    type="button"
                    className={styles.recentRow}
                    disabled={song.unavailable}
                    aria-label={strings.playlist.playSongNamed(song.title)}
                    onClick={() => store.playEntry(song.entryId)}
                  >
                    <Artwork
                      artwork={song.artwork}
                      title={song.title}
                      album={song.albumName}
                      size="sm"
                    />
                    <span className={styles.recentText}>
                      <span className={styles.recentTitle}>{song.title}</span>
                      <span className={styles.recentMeta}>{song.artistLabel}</span>
                    </span>
                  </button>
                ))}
              </RevealList>
            </section>
          </Reveal>
        )}
      </div>
    </ShojiPanel>
  );
}
