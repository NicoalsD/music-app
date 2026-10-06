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

/** Default lifetime of an undo slip, in ms. */
export const UNDO_TOAST_MS = 8000;

/** Slip with an "Undo" action. */
export function notifyUndo(
  message: string,
  onUndo: () => void,
  durationMs: number = UNDO_TOAST_MS,
): string | number {
  return toast.success(message, {
    duration: durationMs,
    action: { label: strings.undo.action, onClick: onUndo },
  });
}
