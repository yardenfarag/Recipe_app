"use client";

import { createContext, useContext } from "react";

import type { RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import type { RecipeVariantKey } from "@shared/lib/recipeVariants";
import type { RecipeCollection } from "@shared/types/collection";
import type { RecalcField } from "@shared/types/recipe";

import type { RecipeDisplay } from "@/components/recipe/types";
import type { SwapTarget } from "@/lib/recipe/actions/swap";

/** The dialogs the recipe page opens. Only one is open at a time. */
export type RecipeDialog =
  | { kind: "swap"; target: SwapTarget }
  | { kind: "remix" }
  /** "Make it without these": the remix sheet, starting at once with the reader's allergies and dislikes. */
  | { kind: "fix" }
  | { kind: "translate" }
  | { kind: "tags" }
  | { kind: "collection" }
  /** Add to the shopping list, at the servings on screen. */
  | { kind: "list"; servings: number }
  | { kind: "note" }
  | { kind: "repair" };

/** What "Revert to original" would undo: a remix made on this visit, or a saved kitchen adaptation. */
export type Adaptation = { kind: "remix"; variant: RecipeVariantKey; summary: string } | { kind: "kitchen"; summary: string | null };

export type RecipeActions = {
  display: RecipeDisplay;
  /** Fields Pinch is recalculating after a hand edit, shown as "Updating…" (ADR 018). */
  updatingFields: readonly RecalcField[];
  collections: RecipeCollection[];
  adaptation: Adaptation | null;
  canRevert: boolean;
  /** A partial import with a source to look at again (ADR 019). */
  canRepair: boolean;
  /** The recipe has something from the reader's allergies or dislikes, so "Make it without these" applies. */
  canFix: boolean;
  /** The app's language, when the recipe is in another one and no translation is showing. */
  translateOffer: RecipeLanguageCode | null;
  /** Actions that are running without a dialog. */
  busy: { share: boolean; revert: boolean; translate: boolean; repair: boolean };
  open: (dialog: RecipeDialog) => void;
  share: () => void;
  /** `from`: the button on the recipe (default) or the one at the end of cook mode, for the `recipe_cooked` event. */
  markCooked: (from?: "recipe" | "cook_mode") => void;
  revert: () => void;
  showOriginalLanguage: () => void;
  /** Translates into the app's language straight from the notice. */
  translateToAppLanguage: () => void;
};

export const RecipeActionsContext = createContext<RecipeActions | null>(null);

/**
 * The saved recipe's actions, or null where the recipe can't be changed (a Hub recipe, a Snap preview, a shared
 * recipe). Components show their actions only when this is set. Provided by `RecipeActionsProvider`.
 */
export function useRecipeActions(): RecipeActions | null {
  return useContext(RecipeActionsContext);
}

/** True while Pinch recalculates this field after a hand edit. */
export function isUpdating(actions: RecipeActions | null, field: RecalcField): boolean {
  return actions?.updatingFields.includes(field) ?? false;
}
