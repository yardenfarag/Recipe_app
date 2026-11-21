"use client";

import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { RecipeView } from "@/components/recipe/RecipeView";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useRecipe } from "@/lib/recipe/useRecipe";

/**
 * A saved recipe, to read and cook from. The actions (swap, remix, translate, share, cook mode, video) arrive in
 * PIN-135 and PIN-136, in `RecipeActionsSlot`.
 */
export default function RecipePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const state = useRecipe(id);
  const display = state.status === "ready" ? state.display : null;

  usePageTitle(display?.title ?? (state.status === "missing" ? t("library.recipeNotFound") : t("tabs.library")));

  if (state.status === "loading") return <LoadingState label={t("a11y.loading")} />;
  if (state.status === "missing") return <EmptyState icon={null} title={t("library.recipeNotFound")} />;
  if (state.status === "error" || !display) return <ErrorState title={t("recipe.loadFailedTitle")} onRetry={state.reload} />;

  return <RecipeView display={display} onToggleFavorite={state.toggleFavorite} />;
}
