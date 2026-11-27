/**
 * The web build has no haptics (PIN-191): browser vibration works only on Android Chrome and feels cheap. Same
 * exports as haptics.ts, all doing nothing, and Settings hides the Vibration switch.
 */

export const HAPTICS_STORAGE_KEY = 'pinch:haptics';

export const hapticsSupported = false;

const none = () => undefined;

export function setHapticsEnabled(_on: boolean) {}

export const haptics = {
  saved: none,
  step: none,
  timerDone: none,
  cooked: none,
  tick: none,
  refresh: none,
  error: none,
};

export function useHapticsPreference(): [boolean, (on: boolean) => void] {
  return [false, setHapticsEnabled];
}
