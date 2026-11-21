/**
 * "Finished onboarding" on the account, so someone who answered the first-run questions on one device isn't asked
 * again on another (PIN-140).
 *
 * It lives in `auth.users.user_metadata.onboarded_at` (an ISO date), a top-level key of its own: GoTrue merges
 * `updateUser({ data })` one key deep, and the theme and language sync (`prefs`, `locale`) only ever writes its own
 * keys, so older builds never wipe it.
 *
 * Accounts made before the key existed don't have it, yet they were offered onboarding where they signed up (the
 * mobile and Expo web apps ask before the account exists). So an account is only offered onboarding while it is new.
 */

export const ONBOARDED_AT_METADATA_KEY = 'onboarded_at';

/** How long after sign-up an account that hasn't onboarded is still offered it. Covers a slow email confirmation. */
export const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** When the account finished onboarding, from its `user_metadata`; null when it hasn't (or the value is bad). */
export function accountOnboardedAt(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[ONBOARDED_AT_METADATA_KEY];
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** The `data` for `auth.updateUser` that records onboarding as done now. Touches no other key. */
export function onboardedMetadata(now: Date = new Date()): Record<string, string> {
  return { [ONBOARDED_AT_METADATA_KEY]: now.toISOString() };
}

/** True while the account is younger than `NEW_ACCOUNT_WINDOW_MS`. An unknown or bad date counts as old. */
export function isNewAccount(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created < NEW_ACCOUNT_WINDOW_MS;
}

/** Whether to show the first-run questions to this account: it's new and hasn't answered them anywhere. */
export function shouldOfferOnboarding(
  account: { metadata: unknown; createdAt: string | null | undefined },
  now: number = Date.now(),
): boolean {
  return accountOnboardedAt(account.metadata) === null && isNewAccount(account.createdAt, now);
}
