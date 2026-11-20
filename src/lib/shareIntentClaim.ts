/**
 * App-wide record of the OS share being handled (ADR 010).
 *
 * Every mounted Snap screen reads the same share from `useShareIntentContext`.
 * If navigation ever leaves two Snap screens mounted (a second `(tabs)` stacked
 * on the first), a per-screen ref lets each one start its own extraction for a
 * single share. Keeping the claim at module level means only the first screen
 * to see a share takes it.
 */
let claimedShareKey: string | null = null;

/** True when this caller takes the share. False when the share was already taken. */
export function claimShare(shareKey: string): boolean {
  if (claimedShareKey === shareKey) return false;
  claimedShareKey = shareKey;
  return true;
}

/** Call once the share intent is cleared, so sharing the same link again starts a new import. */
export function releaseShareClaim(): void {
  claimedShareKey = null;
}
