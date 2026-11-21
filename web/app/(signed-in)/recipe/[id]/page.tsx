"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { findAvoidMatches } from "@shared/lib/avoidList";

import { IngredientsPanel } from "@/components/recipe/IngredientsPanel";
import { RecipeActionsSlot } from "@/components/recipe/RecipeActionsSlot";
import { RecipeAppliancesSection } from "@/components/recipe/RecipeAppliancesSection";
import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { RecipeNotices } from "@/components/recipe/RecipeNotices";
import { StepsPanel } from "@/components/recipe/StepsPanel";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useKitchenProfile } from "@/lib/recipe/useKitchenProfile";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useRecipe } from "@/lib/recipe/useRecipe";
import { useServings } from "@/lib/recipe/useServings";

/**
 * A saved recipe, to read and cook from: the header and facts, any notices, what it needs, then the ingredients
 * beside the steps on wide screens and above them on phones. The actions (swap, remix, translate, share, cook
 * mode, video) arrive in PIN-133 and PIN-134, in `RecipeActionsSlot`.
 */
export default function RecipePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const state = useRecipe(id);
  const display = state.status === "ready" ? state.display : null;
  const { servings, setServings } = useServings(id, display?.recipe.servings ?? null);
  const { system, setSystem } = useMeasurementSystem();
  const { profile } = useKitchenProfile();
  const avoid = useMemo(
    () => (display && profile ? findAvoidMatches(display.ingredients.map((ingredient) => ingredient.name), profile) : null),
    [display, profile],
  );

  usePageTitle(display?.title ?? (state.status === "missing" ? t("library.recipeNotFound") : t("tabs.library")));

  if (state.status === "loading") return <LoadingState label={t("a11y.loading")} />;
  if (state.status === "missing") return <EmptyState icon={null} title={t("library.recipeNotFound")} />;
  if (state.status === "error" || !display) return <ErrorState title={t("recipe.loadFailedTitle")} onRetry={state.reload} />;

  const choices = { servings: servings ?? display.recipe.servings, onServingsChange: setServings, system, onSystemChange: setSystem };

  return (
    <article className="mx-auto max-w-6xl">
      <RecipeHeader display={display} servings={choices.servings} onToggleFavorite={state.toggleFavorite} />
      <RecipeNotices display={display} avoid={avoid} />
      <RecipeActionsSlot display={display} />
      <RecipeAppliancesSection display={display} system={system} />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <IngredientsPanel display={display} choices={choices} avoid={avoid} />
        <StepsPanel display={display} system={system} />
      </div>
    </article>
  );
}
