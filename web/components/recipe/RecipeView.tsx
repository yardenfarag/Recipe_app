"use client";

import { useMemo, type ReactNode } from "react";

import { findAvoidMatches } from "@shared/lib/avoidList";

import { IngredientsPanel } from "@/components/recipe/IngredientsPanel";
import { RecipeActionsSlot } from "@/components/recipe/RecipeActionsSlot";
import { RecipeAppliancesSection } from "@/components/recipe/RecipeAppliancesSection";
import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { RecipeNotices } from "@/components/recipe/RecipeNotices";
import { StepsPanel } from "@/components/recipe/StepsPanel";
import type { RecipeDisplay } from "@/components/recipe/types";
import { useKitchenProfile } from "@/lib/recipe/useKitchenProfile";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useServings } from "@/lib/recipe/useServings";

/**
 * A whole recipe to read and cook from: header and facts, notices, what it needs, then the ingredients beside the
 * steps on wide screens and above them on phones. Used for a saved recipe, and for one that isn't saved yet (a Snap
 * preview, a Hub recipe): build its `display` with `buildRecipeDisplay` (web/lib/recipe/recipeDisplay.ts).
 */
export function RecipeView({
  display,
  onToggleFavorite,
  back,
  actions,
  readOnly = false,
}: {
  display: RecipeDisplay;
  /** The heart; leave out for a recipe that isn't saved. */
  onToggleFavorite?: () => void;
  /** Where the back link goes. Defaults to the Library; null hides it. */
  back?: { href: string; label: string } | null;
  /** Buttons for this kind of recipe (Save, Add to library…), shown under the header. */
  actions?: ReactNode;
  /** Hides the recipe actions (swap, remix, translate…): they only stick on a saved recipe, as on mobile. */
  readOnly?: boolean;
}) {
  // Remembered per recipe; an unsaved recipe has its own id or key, so this works for it too.
  const { servings, setServings } = useServings(display.recipe.id, display.recipe.servings);
  const { system, setSystem } = useMeasurementSystem();
  const { profile } = useKitchenProfile();
  const avoid = useMemo(
    () => (profile ? findAvoidMatches(display.ingredients.map((ingredient) => ingredient.name), profile) : null),
    [display, profile],
  );
  const choices = { servings: servings ?? display.recipe.servings, onServingsChange: setServings, system, onSystemChange: setSystem };

  return (
    <article className="mx-auto max-w-6xl">
      <RecipeHeader display={display} servings={choices.servings} onToggleFavorite={onToggleFavorite} back={back} />
      {actions ? <div className="-mt-2 mb-6 flex flex-wrap gap-2">{actions}</div> : null}
      <RecipeNotices display={display} avoid={avoid} />
      {readOnly ? null : <RecipeActionsSlot display={display} />}
      <RecipeAppliancesSection display={display} system={system} />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <IngredientsPanel display={display} choices={choices} avoid={avoid} />
        <StepsPanel display={display} system={system} />
      </div>
    </article>
  );
}
