import { LogOut } from 'lucide-react';
import { usePlayerSnapshot, useStore } from '../../state';
import type { PlayerSnapshot } from '../../state';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { strings } from '../i18n/es';
import type { SpotifyStatusKey } from '../i18n/es';
import { shallowEqual } from './shallowEqual';
import styles from './SpotifyStatus.module.css';

const select = (s: PlayerSnapshot) => ({ auth: s.spotify.auth, status: s.spotify.status });

/** Header control: "Conectar con Spotify" when logged out, otherwise the connection status and a logout. */
export function SpotifyStatus() {
  const store = useStore();
  const { auth, status } = usePlayerSnapshot(select, shallowEqual);

  if (auth === 'logged-out') {
    return (
      <Button variant="primary" onClick={() => void store.login()}>
        {strings.spotify.connect}
      </Button>
    );
  }

  const label =
    status === 'disconnected'
      ? strings.spotify.connected
      : strings.spotify.status[status as SpotifyStatusKey];
  const isProblem =
    status === 'no-premium' ||
    status === 'unsupported' ||
    status === 'error' ||
    status === 'forbidden';

  return (
    <div className={styles.root} aria-label={strings.spotify.statusLabel} role="group">
      <Chip tone={isProblem ? 'sakura' : 'paper'} className={styles.chip}>
        {label}
      </Chip>
      <Button variant="ghost" onClick={() => store.logout()}>
        <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
        {strings.spotify.disconnect}
      </Button>
    </div>
  );
}
