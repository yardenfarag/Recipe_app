import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Platform, type TextInput } from 'react-native';

/**
 * Website only: runs `handler` when `key` is pressed while this screen is the
 * one showing. Ignored while typing in a field, with Ctrl/Cmd/Alt held, or
 * while a dialog is open. Does nothing in the mobile apps.
 */
export function useWebShortcut(key: string, handler: () => void): void {
  const screenFocused = useIsFocused();

  useEffect(() => {
    if (Platform.OS !== 'web' || !screenFocused || typeof document === 'undefined') return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== key || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      handler();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handler, key, screenFocused]);
}

/** Ref for a search field that the "/" key focuses on the website. */
export function useSlashToSearch() {
  const inputRef = useRef<TextInput>(null);
  useWebShortcut('/', () => inputRef.current?.focus());
  return inputRef;
}
