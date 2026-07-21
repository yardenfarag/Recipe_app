import { supabase } from '@/lib/supabase/client';
import type { ShoppingListItem } from '@/types/shoppingList';

type ShoppingListRow = {
  id: string;
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

export async function clearShoppingList(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('user_id', user.id);
  if (error) throw error;
}

/**
 * Persist a merged list after local merge: update existing UUID rows, insert
 * client-generated (`list-…`) rows, delete removed rows.
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
    if (!isClientId && prevById.has(item.id)) {
      saved.push(await updateShoppingListItem(item));
    } else {
      saved.push(await insertShoppingListItem(userId, item));
    }
  }
  return saved;
}
