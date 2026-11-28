"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteRecipe } from "@shared/lib/supabase/recipes";
import { showToast } from "@shared/lib/toast";
import { joinErrorSentences, translateAppError } from "@shared/lib/translateAppError";

import { useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { RecipeActionsProvider } from "@/components/recipe/actions/RecipeActionsProvider";
import { AutoSavedNotice } from "@/components/recipe/AutoSavedNotice";
import { RecipeView } from "@/components/recipe/RecipeView";
import { SavedFlight, SnapRevealProvider, useSnapRevealPhase } from "@/components/recipe/SnapReveal";
import type { RecipeDisplay } from "@/components/recipe/types";
import { buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { removeFromLibrary } from "@/lib/library/libraryCache";
import { useRecipe } from "@/lib/recipe/useRecipe";

/**
 * A saved recipe, to read, cook from and change: swap, remix, translate, share and the rest (PIN-135), through
 * `RecipeActionsProvider`. Cook mode (PIN-136) offers "I cooked this" on its last screen. On a phone this page has
 * no app bars (the photo runs to the top, PIN-163), so every state here carries its own way back to the Library.
 */
export default function RecipePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const state = useRecipe(id);
  const display = state.status === "ready" ? state.display : null;

  usePageTitle(display?.title ?? (state.status === "missing" ? t("library.recipeNotFound") : t("tabs.library")));

  const backToLibrary = (
    <Link href="/" data-track="recipe.back" className={buttonClasses({ variant: "secondary" })}>
      {t("cookbook.backToLibrary")}
    </Link>
  );

  if (state.status === "loading") return <LoadingState label={t("a11y.loading")} />;
  if (state.status === "missing") return <EmptyState icon={null} title={t("library.recipeNotFound")} action={backToLibrary} />;
  if (state.status === "error" || !display) {
    return (
      <div className="flex flex-col items-center">
        <ErrorState title={t("recipe.loadFailedTitle")} trackId="recipe.load_error" onRetry={state.reload} className="pb-4" />
        {backToLibrary}
      </div>
    );
  }

  return (
    <RecipeActionsProvider state={state}>
      {/* It reads ?justSaved=1, for the Snap reveal. */}
      <Suspense fallback={null}>
        <SavedRecipeView display={display} onToggleFavorite={state.toggleFavorite} />
      </Suspense>
    </RecipeActionsProvider>
  );
}

/**
 * Inside the actions, so cook mode's last screen can offer "I cooked this". A Snap that just saved the recipe
 * (`?justSaved=1`) plays the reveal first (PIN-192): the recipe builds itself, a click shows it all, a small card
 * drops toward the Library, then "Saved to your Library · Remove" comes in.
 */
function SavedRecipeView({ display, onToggleFavorite }: { display: RecipeDisplay; onToggleFavorite: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const actions = useRecipeActions();
  const [deleting, setDeleting] = useState(false);
  const justSaved = useSearchParams().get("justSaved") === "1";
  const { phase, skip, land } = useSnapRevealPhase(justSaved);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  // The cover, or the title tile when there is no picture: where the card takes off from.
  const flightSource = useCallback(
    () => root?.querySelector<HTMLElement>("[data-recipe-cover], header h1") ?? null,
    [root],
  );

  async function remove() {
    try {
      await deleteRecipe(display.recipe.id);
      // Gone from the Library at once, not after its refresh (PIN-174).
      removeFromLibrary(display.recipe.id);
      router.replace("/");
    } catch (caught) {
      showToast(joinErrorSentences(t("library.couldNotDelete"), translateAppError(caught, t)), "error");
    }
  }

  return (
    <>
      {/* A Snap saved for the cook (`?justSaved=1`): "Saved to your Library", with Remove. */}
      <Suspense fallback={null}>
        <AutoSavedNotice ready={phase === "landed"} arriving={justSaved} />
      </Suspense>
      <div
        ref={setRoot}
        data-snap-reveal={justSaved ? (phase === "playing" ? "playing" : "done") : undefined}
        onClickCapture={phase === "playing" ? skip : undefined}
      >
        <SnapRevealProvider value={phase === "playing"}>
          <RecipeView
            display={display}
            onToggleFavorite={onToggleFavorite}
            onCooked={actions ? () => actions.markCooked("cook_mode") : undefined}
            onDelete={() => setDeleting(true)}
            immersive
          />
        </SnapRevealProvider>
      </div>
      {phase === "flight" ? (
        <SavedFlight from={flightSource} imageUrl={display.recipe.image_url ?? null} title={display.title} onLanded={land} />
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("library.deleteRecipeTitle")}
        description={t("library.deleteRecipeBody", { name: display.title })}
        confirmLabel={t("common.delete")}
        trackId="recipe.delete_dialog"
        onConfirm={remove}
      />
    </>
  );
}
