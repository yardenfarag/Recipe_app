import { clearGuestShoppingList, getGuestShoppingList } from '@/lib/guestShoppingList';
import { supabase } from '@/lib/supabase/client';

/**
 * Append all guest lines in one database transaction, then clear local storage.
 * Existing cloud lines are never replaced. If the transaction fails, no guest
 * lines are committed and the local copy remains available for retry.
 */
export async function migrateGuestShoppingListToSupabase(
  userId: string,
  recipeIdMap: Record<string, string> = {},
): Promise<number> {
  const guestItems = await getGuestShoppingList();
  if (guestItems.length === 0) return 0;

  const { data, error } = await supabase.rpc('migrate_guest_shopping_list', {
    p_user_id: userId,
    p_items: guestItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      source_recipe_ids:
        item.sourceRecipeIds
          ?.map((id) => recipeIdMap[id] ?? (id.startsWith('guest-') ? null : id))
          .filter((id): id is string => Boolean(id)) ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
  });
  if (error) throw error;

  const migrated = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(migrated) || migrated !== guestItems.length) {
    throw new Error('Guest shopping list sync was incomplete.');
  }

  await clearGuestShoppingList();
  return migrated;
}
