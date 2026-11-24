import { t } from 'i18next';
import { Alert, Platform } from 'react-native';

/**
 * Questions and notices, asked from anywhere (a screen, a hook, plain library code):
 *
 *   if (await askConfirm({ title, message, destructive: true })) remove();
 *   await showNotice({ title, message });
 *
 * On a phone they are the system alert, as they always were. On the web, where React Native's `Alert.alert` does
 * nothing, `DialogHost` (mounted once in the root layout) draws them with the app's own `ConfirmDialog`, in place of
 * the browser's `confirm()` and `alert()` boxes (PIN-184). There, one shows at a time; a second one asked meanwhile
 * waits its turn.
 */

export type ConfirmOptions = {
  title: string;
  message: string;
  /** Defaults to "Continue". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** The confirm button in the danger colour, for deleting. */
  destructive?: boolean;
  /** Web only. Tap-log id prefix; logs `<trackId>.confirm` and `<trackId>.cancel`. */
  trackId?: string;
};

export type NoticeOptions = {
  title: string;
  message: string;
  /** Defaults to "OK" in the system alert and to the app's "Got it" label on the web. */
  okLabel?: string;
  /** Web only. Tap-log id prefix; logs `<trackId>.confirm`. */
  trackId?: string;
};

export type DialogRequest =
  | ({ id: number; kind: 'confirm' } & ConfirmOptions)
  | ({ id: number; kind: 'notice' } & NoticeOptions);

type Entry = { request: DialogRequest; settle: (confirmed: boolean) => void };

const queue: Entry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function notify() {
  for (const listener of listeners) listener();
}

/** Asks a yes-or-no question. Resolves true on the confirm button, false on Cancel (on the web: back or Escape too). */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return new Promise((resolve) => {
      Alert.alert(options.title, options.message, [
        { text: options.cancelLabel ?? t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel ?? t('common.continue'),
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ]);
    });
  }
  return new Promise((resolve) => {
    queue.push({ request: { ...options, id: nextId++, kind: 'confirm' }, settle: resolve });
    notify();
  });
}

/** Tells the person something with one button. Resolves when they close it. */
export function showNotice(options: NoticeOptions): Promise<void> {
  if (Platform.OS !== 'web') {
    return new Promise((resolve) => {
      Alert.alert(options.title, options.message, [{ text: options.okLabel ?? 'OK', onPress: () => resolve() }]);
    });
  }
  return new Promise((resolve) => {
    queue.push({ request: { ...options, id: nextId++, kind: 'notice' }, settle: () => resolve() });
    notify();
  });
}

/** The dialog to show now, or null. For `DialogHost`. */
export function currentDialog(): DialogRequest | null {
  return queue[0]?.request ?? null;
}

/** For `DialogHost`: called whenever `currentDialog()` changes. Returns the unsubscribe. */
export function subscribeDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For `DialogHost`: the person answered the dialog with this id. An id that is not showing is ignored. */
export function settleDialog(id: number, confirmed: boolean): void {
  if (queue[0]?.request.id !== id) return;
  const [entry] = queue.splice(0, 1);
  entry.settle(confirmed);
  notify();
}
