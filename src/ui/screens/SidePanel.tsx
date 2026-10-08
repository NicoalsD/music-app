import * as Tabs from '@radix-ui/react-tabs';
import { X } from 'lucide-react';
import { IconButton } from '../components/IconButton';
import { ShojiPanel } from '../components/ShojiPanel';
import { cx } from '../cx';
import { strings } from '../i18n/es';
import { LyricsPanel } from './LyricsPanel';
import { QueuePanel } from './QueuePanel';
import styles from './SidePanel.module.css';

export type SidePanelTab = 'lyrics' | 'queue';

export interface SidePanelProps {
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
  className?: string | undefined;
}

function isTab(value: string): value is SidePanelTab {
  return value === 'lyrics' || value === 'queue';
}

/** Right-hand panel of the shell: synced lyrics or the queue, switched with tabs. */
export function SidePanel({ tab, onTabChange, onClose, className }: SidePanelProps) {
  return (
    <ShojiPanel
      as="aside"
      className={cx(styles.panel, className)}
      aria-label={strings.sidePanel.label}
    >
      <Tabs.Root
        className={styles.root}
        value={tab}
        onValueChange={(value) => {
          if (isTab(value)) onTabChange(value);
        }}
      >
        <div className={styles.header}>
          <Tabs.List className={styles.list} aria-label={strings.sidePanel.label}>
            <Tabs.Trigger className={styles.tab} value="lyrics">
              {strings.sidePanel.lyrics}
            </Tabs.Trigger>
            <Tabs.Trigger className={styles.tab} value="queue">
              {strings.sidePanel.queue}
            </Tabs.Trigger>
          </Tabs.List>
          <IconButton
            label={strings.sidePanel.close}
            icon={<X size={20} strokeWidth={1.5} />}
            tooltipSide="left"
            onClick={onClose}
          />
        </div>
        <Tabs.Content className={styles.content} value="lyrics">
          <LyricsPanel variant="side" />
        </Tabs.Content>
        <Tabs.Content className={styles.content} value="queue">
          <QueuePanel />
        </Tabs.Content>
      </Tabs.Root>
    </ShojiPanel>
  );
}
