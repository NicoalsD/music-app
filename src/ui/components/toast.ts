import { toast } from 'sonner';
import { strings } from '../i18n/es';

/** Plain notification slip. */
export function notify(message: string): string | number {
  return toast.success(message);
}

/** Error slip (same look; the message must say what went wrong and what to do). */
export function notifyError(message: string): string | number {
  return toast.error(message);
}

/** Slip with an "Undo" action. */
export function notifyUndo(message: string, onUndo: () => void): string | number {
  return toast.success(message, {
    duration: 8000,
    action: { label: strings.undo.action, onClick: onUndo },
  });
}
