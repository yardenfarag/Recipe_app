/**
 * A brief, non-blocking message ("Link copied") shown by <ToastHost /> in the root layout.
 * For things that need no decision: use ConfirmDialog / showNotice when the user must respond.
 * Use the "error" icon when something failed, so it doesn't look like plain information.
 */
export type ToastIcon = 'success' | 'info' | 'error';

export interface ToastMessage {
  id: number;
  text: string;
  icon: ToastIcon;
  /** How long it stays up, from `toastDurationMs`. */
  durationMs: number;
}

type Listener = (toast: ToastMessage | null) => void;

/** Shortest time a toast stays up, even for "Copied". */
export const TOAST_MIN_DURATION_MS = 3000;
/** Shortest time a failure stays up: it usually says what to do next. */
export const TOAST_ERROR_MIN_DURATION_MS = 5000;
/** Roughly reading speed, with room for a glance away. */
export const TOAST_MS_PER_CHARACTER = 60;
/** Longest time a toast stays up; anything that needs longer belongs in a dialog. */
export const TOAST_MAX_DURATION_MS = 8000;

/** Long enough to read the text: grows with its length, more for failures, capped. */
export function toastDurationMs(text: string, icon: ToastIcon = 'success'): number {
  const minimum = icon === 'error' ? TOAST_ERROR_MIN_DURATION_MS : TOAST_MIN_DURATION_MS;
  const reading = Array.from(text).length * TOAST_MS_PER_CHARACTER;
  return Math.min(TOAST_MAX_DURATION_MS, Math.max(minimum, reading));
}

let current: ToastMessage | null = null;
let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(current);
}

/** Shows `text` and hides it once it has had time to be read. A new toast replaces the current one. */
export function showToast(text: string, icon: ToastIcon = 'success'): void {
  if (hideTimer) clearTimeout(hideTimer);
  const durationMs = toastDurationMs(text, icon);
  current = { id: nextId++, text, icon, durationMs };
  emit();
  hideTimer = setTimeout(hideToast, durationMs);
}

export function hideToast(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (!current) return;
  current = null;
  emit();
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
