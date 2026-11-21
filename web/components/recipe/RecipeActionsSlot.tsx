"use client";

import type { RecipeDisplay } from "@/components/recipe/types";

/**
 * Where the recipe's actions go: swap, remix, translate, share, cook mode, video. PIN-135 and PIN-136 fill it in.
 * Until then it renders nothing, so the page reads cleanly.
 */
export function RecipeActionsSlot({ display }: { display: RecipeDisplay }) {
  void display;
  return null;
}
