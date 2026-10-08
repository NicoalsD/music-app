import { House, Library, Search } from 'lucide-react';
import { strings } from '../i18n/es';
import styles from './MobileNav.module.css';

export type MobileSection = 'home' | 'search' | 'library';

export interface MobileNavProps {
  current: MobileSection;
  onSelect: (section: MobileSection) => void;
}

const ITEMS = [
  { section: 'home', label: strings.nav.home, Icon: House },
  { section: 'search', label: strings.nav.search, Icon: Search },
  { section: 'library', label: strings.nav.library, Icon: Library },
] as const;

/** Bottom navigation for narrow screens, shown above the mini player. */
export function MobileNav({ current, onSelect }: MobileNavProps) {
  return (
    <nav className={styles.nav} aria-label={strings.nav.mobileLabel}>
      {ITEMS.map(({ section, label, Icon }) => (
        <button
          key={section}
          type="button"
          className={styles.item}
          aria-current={current === section ? 'page' : undefined}
          onClick={() => onSelect(section)}
        >
          <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
