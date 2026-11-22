"use client";

import { BookOpenCheck, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { showToast } from "@shared/lib/toast";
import { translateAppError } from "@shared/lib/translateAppError";

import { useAuth } from "@/components/AuthProvider";
import { RecipeView } from "@/components/recipe/RecipeView";
import { useSignInHere } from "@/components/shell/OpenShell";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { lastHubHref } from "@/lib/hub/hubAddress";
import { useHubRecipe } from "@/lib/hub/useHubRecipe";
import { useSaveAfterSignIn } from "@/lib/useSaveAfterSignIn";

/**
 * A Hub recipe, read-only: the same recipe page as a saved one, without the heart, and with "Add to library" (free,
 * no credit) or "Open in library" when the cook already has it. The address is /hub/<id>, as in the mobile app, so
 * the public page at pinch-app.io/r/<slug> links straight here; the slug works too.
 *
 * Open to guests: they can read the recipe, and "Add to library" sends them to sign in, then back here with
 * `?save=1`, where it is added on its own.
 */
export default function HubRecipePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const signInHere = useSignInHere();
  const { id } = useParams<{ id: string }>();
  const state = useHubRecipe(id ?? "");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Back to the list as it was left, filters and all. Signed-in pages render only in the browser.
  const [backHref] = useState(lastHubHref);

  usePageTitle(state.status === "ready" ? state.display.title : t("hub.recipeTitle"));

  const ready = state.status === "ready";
  const addToLibrary = ready ? state.addToLibrary : null;
  const add = useCallback(async () => {
    if (!addToLibrary) return;
    setAdding(true);
    setAddError(null);
    try {
      const recipeId = await addToLibrary();
      showToast(t("web.hub.added"));
      router.push(`/recipe/${recipeId}`);
    } catch (caught) {
      setAddError(`${t("hub.addFailedTitle")}: ${translateAppError(caught, t)}`);
      setAdding(false);
    }
  }, [addToLibrary, router, t]);

  // A guest who pressed "Add to library" signed in and came back: add it now.
  const { pending: savingAfterSignIn } = useSaveAfterSignIn({ ready, save: () => void add() });

  if (state.status === "loading") return <LoadingState label={t("a11y.loading")} />;
  if (state.status === "missing") {
    return (
      <EmptyState
        icon={null}
        title={t("hub.notFound")}
        action={
          <Link href="/hub" data-track="hub_recipe.back_to_hub" className={buttonClasses({ variant: "secondary" })}>
            {t("hub.backToHub")}
          </Link>
        }
      />
    );
  }
  if (state.status === "error") return <ErrorState title={t("recipe.loadFailedTitle")} trackId="hub_recipe.load_error" onRetry={state.reload} />;

  const actions = (
    <>
      {state.libraryRecipeId ? (
        <Link href={`/recipe/${state.libraryRecipeId}`} data-track="hub_recipe.open_in_library" className={buttonClasses({ size: "lg" })}>
          <BookOpenCheck aria-hidden className="h-5 w-5" />
          {t("hub.openInLibrary")}
        </Link>
      ) : (
        <Button
          size="lg"
          trackId="hub_recipe.add_to_library"
          busy={adding || savingAfterSignIn}
          onClick={() => (user ? void add() : router.push(signInHere("signin", "save=1")))}
        >
          {adding ? null : <Plus aria-hidden className="h-5 w-5" />}
          {t("hub.addToLibrary")}
        </Button>
      )}
      <div className="basis-full">
        {addError ? (
          <div className="mb-2">
            <ErrorAlert>{addError}</ErrorAlert>
          </div>
        ) : null}
        <p className="max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          {state.libraryRecipeId ? null : <span className="font-semibold text-text">{t("web.hub.addIsFree")} </span>}
          {user ? null : <span className="font-semibold text-text">{t("web.guest.saveNeedsAccount")} </span>}
          {t("hub.attribution")}
        </p>
      </div>
    </>
  );

  return <RecipeView display={state.display} back={user ? { href: backHref, label: t("hub.backToHub") } : null} actions={actions} readOnly />;
}
