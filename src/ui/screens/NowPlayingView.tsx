import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MicVocal, X } from 'lucide-react';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Artwork } from '../components/Artwork';
import { pickArtworkUrl } from '../components/artworkSizing';
import { AmbientBackdrop } from '../ambient/AmbientBackdrop';
import { PrintBackdrop } from '../ambient/PrintBackdrop';
import { buildTheme, themeVars } from '../palette/palette';
import { useCoverPalette } from '../palette/useCoverPalette';
import { IconButton } from '../components/IconButton';
import { ShojiPanel } from '../components/ShojiPanel';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import { LyricsPanel } from './LyricsPanel';
import { PlayerProgress } from './PlayerProgress';
import { TransportControls } from './TransportControls';
import { VolumeControl } from './VolumeControl';
import { shallowEqualOrNull } from './shallowEqual';
import styles from './NowPlayingView.module.css';

const ARTWORK_FADE_S = 0.3;

const selectCurrent = (s: PlayerSnapshot) => {
  const current = s.songs[s.currentIndex];
  if (current === undefined) return null;
  return {
    entryId: current.entryId,
    title: current.title,
    artists: current.artistLabel,
    album: current.albumName,
    artwork: current.artwork,
    // The palette is sampled from the same small cover the player bar loads, so it is cached.
    paletteUrl: pickArtworkUrl(current.artwork, 'md'),
  };
};

const selectPlaying = (s: PlayerSnapshot) => s.player.status === 'playing';

export interface NowPlayingViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the lyrics column is visible. */
  lyricsOpen: boolean;
  onToggleLyrics: () => void;
}

/**
 * Full-screen "Reproduciendo ahora": the whole window is a woodblock print tinted by the cover
 * (flat field, sun and wave from its palette, drifting petals), with cover, metadata, progress,
 * transport and volume on one tinted shoji panel and the synced lyrics set directly on the field.
 */
export function NowPlayingView({
  open,
  onOpenChange,
  lyricsOpen,
  onToggleLyrics,
}: NowPlayingViewProps) {
  const current = usePlayerSnapshot(selectCurrent, shallowEqualOrNull);
  const playing = usePlayerSnapshot(selectPlaying);
  const reduceMotion = useReducedMotion() === true;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Sampled only while open; the last palette is kept so the closing fade keeps its colours.
  const palette = useCoverPalette(current?.paletteUrl, open);
  const theme = useMemo(() => buildTheme(palette), [palette]);
  const rootStyle = useMemo(() => themeVars(theme) as CSSProperties, [theme]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          className={styles.root}
          style={rootStyle}
          data-scheme={theme.scheme}
          // Lets the global shortcuts (space, arrows) keep working inside this dialog.
          data-now-playing-view=""
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // The dialog has no Trigger element, so remember who opened it and focus the title.
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected === true) returnFocus.current.focus();
            returnFocus.current = null;
          }}
        >
          <PrintBackdrop />
          <AmbientBackdrop theme={theme} playing={playing} />

          <RadixDialog.Title className="visually-hidden">
            {strings.nowPlaying.title}
          </RadixDialog.Title>

          <ShojiPanel
            as="header"
            kumiko
            className={cx(styles.panel, styles.toolbar)}
            aria-label={strings.nowPlaying.toolbar}
          >
            <IconButton
              label={strings.nowPlaying.close}
              tooltipSide="bottom"
              icon={<X size={22} strokeWidth={1.5} />}
              onClick={() => onOpenChange(false)}
            />
            <IconButton
              label={lyricsOpen ? strings.nowPlaying.hideLyrics : strings.nowPlaying.showLyrics}
              tooltipSide="bottom"
              pressed={lyricsOpen}
              icon={<MicVocal size={20} strokeWidth={1.5} />}
              onClick={onToggleLyrics}
            />
          </ShojiPanel>

          <div className={styles.layout} data-lyrics={lyricsOpen ? 'true' : 'false'}>
            <ShojiPanel
              as="section"
              aria-label={strings.nowPlaying.title}
              className={cx(styles.panel, styles.player)}
            >
              <div className={styles.stage}>
                <span className={styles.ring} aria-hidden="true" />
                <div className={styles.cover}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {current === null ? null : (
                      <motion.div
                        key={current.entryId}
                        className={styles.coverFrame}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: reduceMotion ? 0 : ARTWORK_FADE_S,
                          ease: 'easeOut',
                        }}
                      >
                        <Artwork
                          artwork={current.artwork}
                          title={current.title}
                          album={current.album}
                          size="xl"
                          fluid
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className={styles.meta}>
                <h2
                  ref={titleRef}
                  tabIndex={-1}
                  className={styles.title}
                  aria-live="polite"
                  data-testid="now-playing-title"
                >
                  {current === null ? strings.player.nothingPlaying : current.title}
                </h2>
                {current === null ? (
                  <p className={styles.artists}>{strings.player.nothingPlayingHint}</p>
                ) : (
                  <>
                    <p className={styles.artists}>{current.artists}</p>
                    <p className={styles.album}>{current.album}</p>
                  </>
                )}
              </div>

              <PlayerProgress className={styles.progress} />
              <TransportControls size="large" />
              <VolumeControl className={styles.volume} />
            </ShojiPanel>

            {lyricsOpen ? (
              <section aria-label={strings.lyrics.title} className={styles.lyrics}>
                <LyricsPanel />
              </section>
            ) : null}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
