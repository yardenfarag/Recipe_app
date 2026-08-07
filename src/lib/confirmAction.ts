import { Alert, Platform } from 'react-native';

/**
 * Confirm dialog that works on web (RN Web's Alert.alert ignores button callbacks).
 * Returns true when the user confirms.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok =
      typeof globalThis.confirm === 'function'
        ? globalThis.confirm(`${title}\n\n${message}`)
        : true;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ]);
  });
}

/** OK-only notice that works on web and native. */
export function showNotice(title: string, message: string, okLabel = 'OK'): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof globalThis.alert === 'function') {
      globalThis.alert(`${title}\n\n${message}`);
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: okLabel, onPress: () => resolve() }]);
  });
}

/** Destructive-style confirm (native uses destructive button). */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel = 'Delete',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok =
      typeof globalThis.confirm === 'function'
        ? globalThis.confirm(`${title}\n\n${message}`)
        : true;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
