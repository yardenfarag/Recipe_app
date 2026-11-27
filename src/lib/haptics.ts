import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Haptics on phones (PIN-191): a small buzz at a few moments only, never on ordinary taps or navigation. Call these
 * named moments, not expo-haptics directly. The web build gets haptics.web.ts, which does nothing.
 *
 * Two things can turn them off: the phone's own setting (iOS also skips them in Low Power Mode), and the Vibration
 * switch in Settings → Appearance, which is on until turned off and remembered on this device.
 */

export const HAPTICS_STORAGE_KEY = 'pinch:haptics';

/** Phones have haptics; the web build does not (see haptics.web.ts), so Settings hides the switch there. */
export const hapticsSupported = true;

let enabled = true;
let userSet = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Reads the saved switch once. Until it arrives haptics stay on, which is the default anyway. */
function loadPreference(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(HAPTICS_STORAGE_KEY)
      .then((saved) => {
        if (userSet || saved == null) return;
        enabled = saved !== 'off';
        emit();
      })
      .catch(() => undefined);
  }
  return loading;
}
void loadPreference();

export function setHapticsEnabled(on: boolean) {
  userSet = true;
  enabled = on;
  emit();
  AsyncStorage.setItem(HAPTICS_STORAGE_KEY, on ? 'on' : 'off').catch(() => undefined);
}

function play(run: () => Promise<void>) {
  if (!enabled) return;
  // No haptics hardware, Low Power Mode or the system setting off: the phone just does nothing.
  run().catch(() => undefined);
}

export const haptics = {
  /** A Snap (or the preview's Save) saved the recipe. */
  saved: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Cook mode moved to another step: Next, Back or a swipe. */
  step: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A cook-mode timer reached zero. */
  timerDone: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** The recipe was marked cooked. */
  cooked: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** An ingredient or a shopping-list item was ticked or unticked. */
  tick: () => play(() => Haptics.selectionAsync()),
  /** Pull to refresh started. */
  refresh: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** An error toast appeared. */
  error: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const current = () => enabled;

/** The Vibration switch in Settings. */
export function useHapticsPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, current, current);
  useEffect(() => {
    void loadPreference();
  }, []);
  const setOn = useCallback((next: boolean) => setHapticsEnabled(next), []);
  return [on, setOn];
}
