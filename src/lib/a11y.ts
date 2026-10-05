import { AccessibilityInfo, Platform } from 'react-native';

type AnnounceOptions = {
  /**
   * The message is also rendered inside an `accessibilityLiveRegion` view.
   * TalkBack already reads live regions, so skip Android to avoid saying it twice.
   */
  liveRegion?: boolean;
};

/**
 * Speak a short status update through VoiceOver / TalkBack (e.g. "Recipe saved").
 * Use for results that appear without moving focus; no-op on web.
 */
export function announce(message: string, { liveRegion = false }: AnnounceOptions = {}) {
  if (Platform.OS === 'web' || !message) return;
  if (liveRegion && Platform.OS === 'android') return;
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Upper bound for Dynamic Type / font scale on compact chrome (chips, badges,
 * pill buttons) whose layout can't grow. Body copy should scale freely.
 */
export const CHROME_MAX_FONT_SCALE = 1.4;
