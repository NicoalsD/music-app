import type { Notifier } from '../state/PlayerStore';
import { notify, notifyError, notifyUndo } from '../ui/components/toast';

/** Notifier backed by the themed sonner toasts. */
export const sonnerNotifier: Notifier = {
  notify: (message) => void notify(message),
  error: (message) => void notifyError(message),
  undo: (message, onUndo, durationMs) => void notifyUndo(message, onUndo, durationMs),
};
