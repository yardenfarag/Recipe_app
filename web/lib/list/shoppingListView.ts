import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import { ingredientAmountIsUnknown } from "@shared/lib/displayIngredientAmount";
import { formatQuantity } from "@shared/lib/formatQuantity";
import { pickIngredientAmount } from "@shared/lib/ingredientAmounts";
import { SHOPPING_AISLE_ORDER, shoppingAisleForName, type ShoppingAisle } from "@shared/lib/shoppingAisles";
import type { ShoppingListIncomingItem, ShoppingListItem } from "@shared/types/shoppingList";
import type { Ingredient } from "@shared/types/recipe";

export type AisleGroup = { aisle: ShoppingAisle; items: ShoppingListItem[] };

/**
 * The list as the shop is laid out, the way the mobile list screen (src/app/(tabs)/list.tsx) builds it: items still
 * to buy in aisle order (empty aisles left out), then everything checked in one group at the end. Within a group
 * the list's own order is kept (sortShoppingListItems: same names together, oldest first).
 */
export function groupShoppingList(items: ShoppingListItem[]): { groups: AisleGroup[]; checked: ShoppingListItem[] } {
  const unchecked = items.filter((item) => !item.checked);
  const groups = SHOPPING_AISLE_ORDER.map((aisle) => ({
    aisle,
    items: unchecked.filter((item) => shoppingAisleForName(item.name) === aisle),
  })).filter((group) => group.items.length > 0);
  return { groups, checked: items.filter((item) => item.checked) };
}

/** Every item in the order it is shown: the aisle groups, then the checked ones. Keyboard moves follow this. */
export function displayOrder(items: ShoppingListItem[]): ShoppingListItem[] {
  const { groups, checked } = groupShoppingList(items);
  return [...groups.flatMap((group) => group.items), ...checked];
}

/** Where focus goes when an item leaves its place: the one after it, else the one before, else nowhere. */
export function neighbourId(order: ShoppingListItem[], id: string): string | null {
  const index = order.findIndex((item) => item.id === id);
  if (index === -1) return null;
  return order[index + 1]?.id ?? order[index - 1]?.id ?? null;
}

/** "2 cups", "200 g", or just the unit when there is no number, as the mobile list shows it. Null for neither. */
export function shoppingAmount(item: Pick<ShoppingListItem, "quantity" | "unit">, language: CulinaryUnitLanguage): string | null {
  if (item.quantity != null) return formatQuantity(item.quantity, item.unit ?? "", language) || null;
  return item.unit?.trim() ? item.unit.trim() : null;
}

/**
 * Reads the amount typed in the quantity field. Empty means no amount; anything that is not a positive number is
 * refused, as on mobile. A comma works as the decimal point too ("1,5"), since half the languages write it so.
 */
export function parseQuantity(text: string): { ok: true; quantity: number | null } | { ok: false } {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return { ok: true, quantity: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return { ok: false };
  return { ok: true, quantity: parsed };
}

/**
 * One ingredient as a list line, in the measuring system the person reads recipes in. An amount the source never
 * gave goes on the list without a number, as on mobile (src/components/RecipeView.tsx and useShoppingList).
 */
export function ingredientToListItem(ingredient: Ingredient, system: MeasurementSystem, recipeId?: string): ShoppingListIncomingItem {
  const amount = pickIngredientAmount(ingredient, system);
  const known = !ingredientAmountIsUnknown(ingredient, system) && Number.isFinite(amount.quantity) && amount.quantity > 0;
  return {
    name: ingredient.name,
    quantity: known ? amount.quantity : null,
    unit: amount.unit?.trim() ? amount.unit.trim() : null,
    ...(recipeId ? { sourceRecipeId: recipeId } : {}),
  };
}
