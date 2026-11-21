/**
 * Reads and records "finished onboarding" on the signed-in account (`user_metadata.onboarded_at`, see
 * `../onboardingAccount.ts`). Both apps call these.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { accountOnboardedAt, onboardedMetadata } from '../onboardingAccount';
import { supabase } from './client';

type AuthClient = { auth: Pick<SupabaseClient['auth'], 'getUser' | 'updateUser'> };

/** The account as the server has it now (the stored session's copy may predate a change on another device). */
export async function fetchOnboardingAccount(
  client: AuthClient = supabase,
): Promise<Pick<User, 'id' | 'created_at' | 'user_metadata'> | null> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

/** Records onboarding as done on the account. Only `onboarded_at` is sent, so nothing else in the metadata changes. */
export async function markAccountOnboarded(client: AuthClient = supabase, now: Date = new Date()): Promise<void> {
  const { error } = await client.auth.updateUser({ data: onboardedMetadata(now) });
  if (error) throw error;
}

const backfilled = new Set<string>();

/**
 * For a device that finished onboarding before the account kept it: saves it on the account once per session, so the
 * other app doesn't ask again. Does nothing when the account already has it. Failures are left for the next start.
 */
export function backfillAccountOnboarded(
  user: Pick<User, 'id' | 'user_metadata'>,
  client: AuthClient = supabase,
): void {
  if (accountOnboardedAt(user.user_metadata) || backfilled.has(user.id)) return;
  backfilled.add(user.id);
  void markAccountOnboarded(client).catch((error: unknown) => {
    backfilled.delete(user.id);
    console.warn('[onboarding] could not save on the account', error instanceof Error ? error.message : error);
  });
}
