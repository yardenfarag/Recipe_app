/**
 * Decides what Snap should do with a pending OS share (ADR 010).
 *
 * On a cold start the share arrives before auth has finished hydrating, so
 * `user` is still null. If Snap consumed the share at that point, the
 * account check would fail and the share would be lost. So Snap waits for
 * auth. A guest's share is held through sign-up, then resumed.
 */
export type ShareIntentAction = 'wait' | 'require_account' | 'consume';

export function resolveShareIntentAction({
  authLoading,
  signedIn,
  hasPayload,
}: {
  authLoading: boolean;
  signedIn: boolean;
  /** False while Android still hydrates webUrl/text after hasShareIntent flips. */
  hasPayload: boolean;
}): ShareIntentAction {
  if (authLoading || !hasPayload) return 'wait';
  return signedIn ? 'consume' : 'require_account';
}

