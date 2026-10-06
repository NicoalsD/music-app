import { Toaster as Sonner } from 'sonner';
import { strings } from '../i18n/es';
import { Hanko } from './Hanko';
import { cx } from '../cx';
import { shojiClass } from '../theme/shojiClass';
import styles from './Toaster.module.css';

export interface ToasterProps {
  /** Distance from the bottom edge (px), e.g. to clear the player bar. */
  offset?: number;
}

/** sonner Toaster themed as a small shoji slip with a hanko mark. */
export function Toaster({ offset = 24 }: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      offset={offset}
      visibleToasts={3}
      duration={5000}
      closeButton={false}
      icons={{
        success: <Hanko kanji={strings.toast.sealKanji} size={22} />,
        info: <Hanko kanji={strings.toast.sealKanji} size={22} />,
        warning: <Hanko kanji={strings.toast.sealKanji} size={22} />,
        error: <Hanko kanji={strings.toast.sealKanji} size={22} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Glass visuals come from the shoji module; sonner positions the slip itself.
          toast: cx(shojiClass({ depth: 'raised' }), styles.toast),
          icon: cx(styles.icon),
          content: cx(styles.content),
          title: cx(styles.title),
          description: cx(styles.description),
          actionButton: cx(styles.action),
          cancelButton: cx(styles.action),
        },
      }}
    />
  );
}
