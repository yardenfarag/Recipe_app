"use client";

import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { RecipeActionsProvider } from "@/components/recipe/actions/RecipeActionsProvider";
import { RecipeView } from "@/components/recipe/RecipeView";
import type { RecipeDisplay } from "@/components/recipe/types";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useRecipe } from "@/lib/recipe/useRecipe";

/**
 * A saved recipe, to read, cook from and change: swap, remix, translate, share and the rest (PIN-135), through
 * `RecipeActionsProvider`. Cook mode (PIN-136) offers "I cooked this" on its last screen.
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

  return (
    <RecipeActionsProvider state={state}>
      <SavedRecipeView display={display} onToggleFavorite={state.toggleFavorite} />
    </RecipeActionsProvider>
  );
}

/** Inside the actions, so cook mode's last screen can offer "I cooked this". */
function SavedRecipeView({ display, onToggleFavorite }: { display: RecipeDisplay; onToggleFavorite: () => void }) {
  const actions = useRecipeActions();
  return <RecipeView display={display} onToggleFavorite={onToggleFavorite} onCooked={actions?.markCooked} />;
}
