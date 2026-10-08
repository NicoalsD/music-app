import type { ReactNode } from 'react';
import { ShojiPanel } from '../components/ShojiPanel';
import styles from './DetailPanel.module.css';

export interface DetailPanelProps {
  children: ReactNode;
}

/** Shoji panel that holds an album or artist detail in the main area. */
export function DetailPanel({ children }: DetailPanelProps) {
  return (
    <ShojiPanel as="section" className={styles.panel}>
      <div className={styles.scroll}>{children}</div>
    </ShojiPanel>
  );
}
