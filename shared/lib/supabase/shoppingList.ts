/**
 * The shopping list's data. The list belongs to the household (ADR 034): every member reads and changes the same
 * rows under RLS, and `user_id` on a row is who added it ("Added by"). The database fills in the household on
 * insert, so callers still only pass their own user id.
 */
import { supabase } from './client';
import type { ShoppingListItem } from '../../types/shoppingList';

type ShoppingListRow = {
  id: string;
  /** Who added the line; null once their account is gone. */
  user_id?: string | null;
  name: string;
  quantity: number | string | null;
  unit: string | null;
  checked: boolean;
  source_recipe_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

function rowToItem(row: ShoppingListRow): ShoppingListItem {
  const quantity =
    row.quantity === null || row.quantity === undefined
      ? null
      : typeof row.quantity === 'number'
        ? row.quantity
        : Number(row.quantity);

  return {
    id: row.id,
    name: row.name,
    quantity: quantity !== null && Number.isFinite(quantity) ? quantity : null,
    unit: row.unit,
    checked: row.checked === true,
    sourceRecipeIds:
      row.source_recipe_ids && row.source_recipe_ids.length > 0
        ? row.source_recipe_ids
        : undefined,
    ...(row.user_id ? { addedBy: row.user_id } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function itemToRow(item: ShoppingListItem, userId: string) {
  return {
    user_id: userId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    source_recipe_ids: item.sourceRecipeIds ?? null,
    updated_at: item.updated_at,
  };
}

export async function fetchShoppingList(): Promise<ShoppingListItem[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data as ShoppingListRow[] | null) ?? []).map(rowToItem);
}

/** Adds a line as `userId` (always the signed-in user: RLS refuses anyone else). */
export async function insertShoppingListItem(
  userId: string,
  item: Omit<ShoppingListItem, 'id'> & { id?: string },
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert({
      ...itemToRow(
        {
          id: item.id ?? '',
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
          sourceRecipeIds: item.sourceRecipeIds,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
        userId,
      ),
      created_at: item.created_at,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToItem(data as ShoppingListRow);
}

/** Saves an edit. Never sends user_id: who added the line stays as it was. */
export async function updateShoppingListItem(
  item: ShoppingListItem,
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .update({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      source_recipe_ids: item.sourceRecipeIds ?? null,
      updated_at: item.updated_at,
    })
    .eq('id', item.id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToItem(data as ShoppingListRow);
}

export async function deleteShoppingListItem(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteCheckedShoppingListItems(): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('checked', true);
  if (error) throw error;
}

/** Empties the household's list (every member's lines: RLS keeps it to my household). */
export async function clearShoppingList(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not signed in.');

  // A delete needs a filter; this one matches every row RLS lets me see.
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .not('id', 'is', null);
  if (error) throw error;
}

/** True when the merge changed what a line says (not just carried it over). */
function lineChanged(before: ShoppingListItem, after: ShoppingListItem): boolean {
  return (
    before.name !== after.name ||
    before.quantity !== after.quantity ||
    before.unit !== after.unit ||
    before.checked !== after.checked ||
    (before.sourceRecipeIds ?? []).join('\u0000') !== (after.sourceRecipeIds ?? []).join('\u0000')
  );
}

/** PostgREST's answer to `.single()` when the row isn't there (another member deleted it). */
function isGone(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'PGRST116';
}

/**
 * Persist a merged list after local merge: update the UUID rows the merge changed, insert client-generated
 * (`list-…`) rows, delete removed rows. Lines the merge only carried over are not written, so a tick another member
 * made meanwhile stays. A changed line someone deleted meanwhile is added again (it holds what was just added);
 * nothing aborts halfway.
 */
export async function syncMergedShoppingList(
  userId: string,
  previous: ShoppingListItem[],
  next: ShoppingListItem[],
): Promise<ShoppingListItem[]> {
  const prevById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));

  for (const prev of previous) {
    if (!nextIds.has(prev.id)) {
      await deleteShoppingListItem(prev.id);
    }
  }

  const saved: ShoppingListItem[] = [];
  for (const item of next) {
    const isClientId = item.id.startsWith('list-');
    const before = isClientId ? undefined : prevById.get(item.id);
    if (!before) {
      saved.push(await insertShoppingListItem(userId, item));
    } else if (!lineChanged(before, item)) {
      saved.push(before);
    } else {
      try {
        saved.push(await updateShoppingListItem(item));
      } catch (error) {
        if (!isGone(error)) throw error;
        saved.push(await insertShoppingListItem(userId, item));
      }
    }
  }
  return saved;
}
