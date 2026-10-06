import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { EntityStatus } from '../../state';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { strings } from '../i18n/es';
import styles from './Detail.module.css';

export interface BackButtonProps {
  onBack: () => void;
}

export function BackButton({ onBack }: BackButtonProps) {
  return (
    <Button variant="ghost" className={styles.back} onClick={onBack}>
      <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
      {strings.search.backToResults}
    </Button>
  );
}

export interface DetailStateProps {
  status: EntityStatus;
  onRetry: () => void;
  children: ReactNode;
}

/** Shows the spinner or the error state, or the children once the data is ready. */
export function DetailState({ status, onRetry, children }: DetailStateProps) {
  if (status === 'loading') {
    return (
      <div className={styles.center}>
        <Spinner size={32} />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <EmptyState
        title={strings.detail.loadErrorTitle}
        body={strings.search.errorBody}
        action={
          <Button variant="primary" onClick={onRetry}>
            {strings.search.retry}
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
