import { clearGuestRecipes, getGuestRecipes } from '@/lib/guestRecipes';
import { supabase } from '@/lib/supabase/client';

/**
 * ADR 002 — after sign-up, move the user's local guest recipes into their
 * Supabase library, then clear the local store. Best-effort: if the insert
 * fails we keep the local copies so nothing is lost.
 *
 * Returns the number of recipes migrated.
 */
export async function migrateGuestRecipesToSupabase(userId: string): Promise<number> {
  const guestRecipes = await getGuestRecipes();
  if (guestRecipes.length === 0) return 0;

  const rows = guestRecipes.map(({ id, created_at, user_id, ...recipe }) => ({
    ...recipe,
    user_id: userId,
    migrated_from_guest: true,
  }));

  let migrated = 0;

  for (const row of rows) {
    const { error } = await supabase.from('recipes').insert(row);
    if (error) {
      // Unique URL constraint — already in library from a prior partial migration.
      if (error.code === '23505') continue;
      throw error;
    }
    migrated += 1;
  }

  await clearGuestRecipes();
  return migrated;
}
