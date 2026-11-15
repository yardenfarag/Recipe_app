import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** How long to wait for a modal to report it is on screen before trying again (iOS). */
export const MODAL_RETRY_MS = 1500;

/**
 * Wires a modal presenter to "the message is really on screen".
 *
 * Pass `onShow` to the `Modal` and `key={modalKey}` too. `onShow` reports to the
 * controller, which only then records the message as seen.
 *
 * On iOS a modal is not presented while another modal is still presented from
 * the same view controller (the sign-in screen closing, one of the app's own
 * sheets), and React Native does not try again. So if `onShow` has not fired
 * after `MODAL_RETRY_MS`, `modalKey` changes, which remounts the `Modal` and
 * presents it again, and so on at that calm interval until it shows or the
 * presenter goes away (the message is no longer the active one). Remounting
 * never closes anything: a required message stays inescapable.
 *
 * Android and web stack modals, so they need no retry.
 */
export function useModalShow(onShown: () => void, retryMs: number = MODAL_RETRY_MS) {
  const [modalKey, setModalKey] = useState(0);
  const shown = useRef(false);
  const latest = useRef(onShown);
  latest.current = onShown;

  const onShow = useCallback(() => {
    shown.current = true;
    latest.current();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const timer = setInterval(() => {
      if (shown.current) {
        clearInterval(timer);
        return;
      }
      setModalKey((key) => key + 1);
    }, retryMs);
    return () => clearInterval(timer);
  }, [retryMs]);

  return { modalKey, onShow };
}
