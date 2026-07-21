/** A single grocery line on the user's shopping list. */
export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  /** Recipe ids that contributed to this line (provenance only; not used for merge). */
  sourceRecipeIds?: string[];
  created_at: string;
  updated_at: string;
}

/** Payload when adding ingredients from a recipe or the manual composer. */
export interface ShoppingListIncomingItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  sourceRecipeId?: string;
}
