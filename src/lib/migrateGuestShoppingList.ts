import { clearGuestShoppingList, getGuestShoppingList } from '@/lib/guestShoppingList';
import { appendToShoppingList } from '@/lib/shoppingListMerge';
import {
  clearShoppingList,
  fetchShoppingList,
  insertShoppingListItem,
} from '@/lib/supabase/shoppingList';

/**
 * After sign-in, append the guest shopping list onto the user's cloud list
 * (duplicates kept as separate lines), then clear local storage.
 * Best-effort: if cloud writes fail, guest data is kept.
 */
export async function migrateGuestShoppingListToSupabase(userId: string): Promise<number> {
  const guestItems = await getGuestShoppingList();
  if (guestItems.length === 0) return 0;

  const cloudItems = await fetchShoppingList();
  const { items: merged } = appendToShoppingList(
    cloudItems,
    guestItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      sourceRecipeId: item.sourceRecipeIds?.[0],
    })),
  );

  // Re-apply guest checked state onto the newly appended lines (same order).
  const appended = merged.slice(cloudItems.length);
  for (let i = 0; i < guestItems.length && i < appended.length; i += 1) {
    if (guestItems[i].checked) {
      appended[i].checked = true;
      appended[i].sourceRecipeIds = guestItems[i].sourceRecipeIds;
    } else if (guestItems[i].sourceRecipeIds?.length) {
      appended[i].sourceRecipeIds = guestItems[i].sourceRecipeIds;
    }
  }

  await clearShoppingList();

  for (const item of merged) {
    await insertShoppingListItem(userId, {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      sourceRecipeIds: item.sourceRecipeIds,
      created_at: item.created_at,
      updated_at: item.updated_at,
    });
  }

  await clearGuestShoppingList();
  return guestItems.length;
}
