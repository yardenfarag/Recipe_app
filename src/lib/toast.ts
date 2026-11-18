/**
 * A brief, non-blocking confirmation ("Link copied") shown by <ToastHost /> in the root layout.
 * For things that need no decision: use ConfirmDialog / showNotice when the user must respond.
 */
export interface ToastMessage {
  id: number;
  text: string;
  icon: 'success' | 'info';
}

type Listener = (toast: ToastMessage | null) => void;

/** Long enough to read a short line; a new toast replaces the current one. */
export const TOAST_DURATION_MS = 2200;

let current: ToastMessage | null = null;
let nextId = 1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(current);
}

export function showToast(text: string, icon: ToastMessage['icon'] = 'success'): void {
  if (hideTimer) clearTimeout(hideTimer);
  current = { id: nextId++, text, icon };
  emit();
  hideTimer = setTimeout(hideToast, TOAST_DURATION_MS);
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
