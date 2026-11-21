"use client";

import type { RecipeDisplay } from "@/components/recipe/types";
import { RecipeActionBar } from "@/components/recipe/actions/RecipeActionBar";
import { useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";

/**
 * Where the recipe's actions go, under the notices: Remix, Translate, I cooked this, and the rest in a menu
 * (PIN-135). Shows nothing where the recipe can't be changed: the actions come from `RecipeActionsProvider`, which
 * only the saved recipe's page provides.
 */
export function RecipeActionsSlot({ display }: { display: RecipeDisplay }) {
  const actions = useRecipeActions();
  if (!actions || actions.display.recipe.id !== display.recipe.id) return null;
  return <RecipeActionBar actions={actions} />;
}
