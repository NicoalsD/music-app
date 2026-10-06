import { useState, type ReactNode } from 'react';
import { Play, Shuffle } from 'lucide-react';
import { BackdropScene } from '../components/BackdropScene';
import { Artwork } from '../components/Artwork';
import type { ArtworkSize } from '../components/artworkSizing';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Dialog, DialogClose } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { FilterChips } from '../components/FilterChips';
import { Hanko } from '../components/Hanko';
import { IconButton } from '../components/IconButton';
import { LanternCord } from '../components/LanternCord';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/Menu';
import { RevealList } from '../components/Reveal';
import { ShojiPanel } from '../components/ShojiPanel';
import { Spinner } from '../components/Spinner';
import { SwallowProgress } from '../components/SwallowProgress';
import { Toaster } from '../components/Toaster';
import { TooltipProvider } from '../components/Tooltips';
import { notifyUndo } from '../components/toast';
import { strings } from '../i18n/es';
import styles from './KitPreview.module.css';

const SIZES: readonly ArtworkSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const FILTERS = ['all', 'songs', 'artists', 'albums'] as const;
type Filter = (typeof FILTERS)[number];

/** Inline artwork sample (data URI) so the kit needs no network. */
const SAMPLE_ART =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10' fill='%2322306a'/><circle cx='7' cy='3' r='2' fill='%23b4432e'/><path d='M0 10V7Q3 5 6 8T10 7V10Z' fill='%236fa58c'/></svg>";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ShojiPanel as="section" className={styles.panel}>
      <h2 className={styles.heading}>{title}</h2>
      {children}
    </ShojiPanel>
  );
}

/** Dev-only showcase of every UI kit component. */
export function KitPreview() {
  const [filter, setFilter] = useState<Filter>('all');
  const [ms, setMs] = useState(83_000);
  const [dialogOpen, setDialogOpen] = useState(false);
  const k = strings.kit;
  const filterItems = FILTERS.map((value) => ({ value, label: strings.search.filters[value] }));

  return (
    <TooltipProvider>
      <BackdropScene />
      <main className={styles.page}>
        <ShojiPanel as="header" kumiko className={styles.header}>
          <Hanko kanji="音" size={40} />
          <h1 className={styles.title}>{k.title}</h1>
        </ShojiPanel>

        <Section title={k.sections.buttons}>
          <div className={styles.row}>
            <Button variant="primary">{k.primary}</Button>
            <Button variant="secondary">{k.secondary}</Button>
            <Button variant="ghost">{k.ghost}</Button>
            <Button variant="primary" disabled>
              {k.primary}
            </Button>
            <IconButton
              label={strings.player.play}
              icon={<Play size={20} strokeWidth={1.5} />}
              variant="primary"
            />
            <IconButton
              label={strings.player.shuffle}
              icon={<Shuffle size={20} strokeWidth={1.5} />}
              pressed
            />
            <IconButton
              label={strings.player.shuffle}
              icon={<Shuffle size={20} strokeWidth={1.5} />}
            />
            <Spinner />
          </div>
        </Section>

        <Section title={k.sections.chips}>
          <FilterChips
            label={strings.search.filtersLabel}
            items={filterItems}
            value={filter}
            onValueChange={setFilter}
          />
          <div className={styles.row} style={{ marginTop: 'var(--space-4)' }}>
            <Chip tone="plum">{strings.library.localFile}</Chip>
            <Chip tone="sakura">{strings.search.filters.artists}</Chip>
            <Chip>{strings.search.filters.albums}</Chip>
          </div>
        </Section>

        <Section title={k.sections.artwork}>
          <div className={styles.row}>
            {SIZES.map((size) => (
              <div key={size} className={styles.cell}>
                <Artwork
                  artwork={{ small: SAMPLE_ART, medium: SAMPLE_ART, large: SAMPLE_ART }}
                  title={k.sampleSong}
                  album={k.sampleAlbum}
                  size={size}
                />
                <span className={styles.caption}>{size}</span>
              </div>
            ))}
          </div>
          <div className={styles.row} style={{ marginTop: 'var(--space-4)' }}>
            {SIZES.map((size) => (
              <Artwork
                key={size}
                artwork={{}}
                title={k.sampleSong}
                album={k.sampleAlbum}
                size={size}
              />
            ))}
          </div>
        </Section>

        <Section title={k.sections.lanterns}>
          <div className={styles.rail}>
            {[
              { name: k.head, isHead: true, isTail: false, lit: true },
              { name: k.middle, isHead: false, isTail: false, lit: false },
              { name: k.middle, isHead: false, isTail: false, lit: true },
              { name: k.tail, isHead: false, isTail: true, lit: false },
              { name: k.tail, isHead: false, isTail: true, lit: true },
            ].map((node, i) => (
              <div key={i} className={styles.cell}>
                <div className={styles.railCol}>
                  <LanternCord isHead={node.isHead} isTail={node.isTail} lit={node.lit} />
                </div>
                <span className={styles.caption}>{node.name}</span>
                <span className={styles.caption}>{node.lit ? k.lit : k.unlit}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={k.sections.hanko}>
          <div className={styles.row}>
            <Hanko size={20} />
            <Hanko size={32} />
            <Hanko kanji="音" size={48} />
            <Hanko kanji="印" size={64} stampKey={ms} />
          </div>
        </Section>

        <Section title={k.sections.progress}>
          <ShojiPanel flat className={styles.nested}>
            <SwallowProgress valueMs={ms} durationMs={225_000} onSeekCommit={setMs} />
          </ShojiPanel>
        </Section>

        <Section title={k.sections.overlays}>
          <div className={styles.row}>
            <Dialog
              open={dialogOpen}
              onOpenChange={setDialogOpen}
              trigger={<Button variant="secondary">{k.openDialog}</Button>}
              title={k.dialogTitle}
              description={k.dialogBody}
            >
              <label className={styles.field}>
                <span>{strings.add.positionLabel}</span>
                <input className={styles.input} type="number" min={1} defaultValue={1} />
              </label>
              <div className={styles.actions}>
                <DialogClose asChild>
                  <Button variant="ghost">{strings.dialog.cancel}</Button>
                </DialogClose>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  {strings.add.confirm}
                </Button>
              </div>
            </Dialog>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary">{k.openMenu}</Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem>{strings.add.playNow}</MenuItem>
                <MenuItem>{strings.add.playNext}</MenuItem>
                <MenuSeparator />
                <MenuItem>{strings.add.addToStart}</MenuItem>
                <MenuItem>{strings.add.addToEnd}</MenuItem>
                <MenuItem>{strings.add.insertAt}</MenuItem>
              </MenuContent>
            </Menu>
            <Button variant="secondary" onClick={() => notifyUndo(k.toastText, () => undefined)}>
              {k.showToast}
            </Button>
          </div>
        </Section>

        <Section title={k.sections.empty}>
          <EmptyState
            title={strings.playlist.emptyTitle}
            body={strings.playlist.emptyBody}
            action={<Button variant="primary">{strings.playlist.emptyAction}</Button>}
          />
        </Section>

        <Section title={k.sections.reveal}>
          <RevealList className={styles.list}>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={styles.listRow}>
                {k.row(i + 1)}
              </span>
            ))}
          </RevealList>
        </Section>
      </main>
      <Toaster />
    </TooltipProvider>
  );
}
