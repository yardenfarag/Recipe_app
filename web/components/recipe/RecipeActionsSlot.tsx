"use client";

import type { RecipeDisplay } from "@/components/recipe/types";
import { MakeItYours } from "@/components/recipe/actions/MakeItYours";
import { useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";

/**
 * Where "Make it yours" goes, under the photo: Remix, the kitchen fix, Swap and Translate (PIN-162). Shows nothing
 * where the recipe can't be changed: the actions come from `RecipeActionsProvider`, which only the saved recipe's
 * page provides.
 */
export function RecipeActionsSlot({ display, servings }: { display: RecipeDisplay; servings: number }) {
  const actions = useRecipeActions();
  if (!actions || actions.display.recipe.id !== display.recipe.id) return null;
  return <MakeItYours actions={actions} servings={servings} />;
}
