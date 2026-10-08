import { Search, X } from 'lucide-react';
import { usePlayerSnapshot } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { IconButton } from '../components/IconButton';
import { strings } from '../i18n/es';
import styles from './SearchField.module.css';

export const SEARCH_INPUT_ID = 'search-input';

export interface SearchFieldProps {
  text: string;
  onTextChange: (text: string) => void;
  /** Called when the user types in the field (or clicks it while logged out): the shell shows the search view. */
  onActivate: () => void;
}

const selectLoggedIn = (snapshot: PlayerSnapshot): boolean => snapshot.spotify.auth === 'logged-in';

/**
 * The search box shown in the top bar. Without a Spotify session it is read-only: clicking it
 * or pressing Enter opens the search view, which explains how to connect, and no catalog request is made.
 */
export function SearchField({ text, onTextChange, onActivate }: SearchFieldProps) {
  const loggedIn = usePlayerSnapshot(selectLoggedIn);

  return (
    <div className={styles.field}>
      <Search className={styles.icon} size={18} strokeWidth={1.5} aria-hidden="true" />
      <input
        id={SEARCH_INPUT_ID}
        className={styles.input}
        type="search"
        role="searchbox"
        aria-label={strings.search.label}
        placeholder={strings.search.placeholder}
        autoComplete="off"
        spellCheck={false}
        readOnly={!loggedIn}
        value={text}
        onClick={() => {
          if (!loggedIn) onActivate();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !loggedIn) onActivate();
        }}
        onChange={(event) => {
          onTextChange(event.target.value);
          onActivate();
        }}
      />
      {text === '' ? null : (
        <IconButton
          label={strings.search.clear}
          icon={<X size={18} strokeWidth={1.5} />}
          className={styles.clear}
          onClick={() => onTextChange('')}
        />
      )}
    </div>
  );
}
