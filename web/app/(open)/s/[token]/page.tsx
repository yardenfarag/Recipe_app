"use client";

import { BookmarkPlus, BookOpenCheck, Link2Off } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { showToast } from "@shared/lib/toast";

import { useAuth } from "@/components/AuthProvider";
import { RecipeView } from "@/components/recipe/RecipeView";
import { useSignInHere } from "@/components/shell/OpenShell";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { ShareSaveError, useSharedRecipe } from "@/lib/share/useSharedRecipe";
import { useSaveAfterSignIn } from "@/lib/useSaveAfterSignIn";

/**
 * A recipe someone shared with a link, read-only, with "Save to my kitchen". The address is /s/<token>, as in the
 * mobile app, so the public page at pinch-app.io/s/<token> ("Save it on the web") and links already sent land here.
 *
 * Open to guests: they can read the recipe, and Save sends them to create an account (or sign in), then back here
 * with `?save=1`, where it is saved on its own. A recipe already in the library opens the saved copy instead.
 */
export default function SharedRecipePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const signInHere = useSignInHere();
  const { token } = useParams<{ token: string }>();
  const state = useSharedRecipe(token ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  usePageTitle(state.status === "ready" ? state.display.title : t("nav.sharedRecipe"));

  const ready = state.status === "ready";
  const saveShared = ready ? state.save : null;
  const save = useCallback(async () => {
    if (!saveShared) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { recipeId, alreadySaved } = await saveShared();
      showToast(alreadySaved ? t("web.share.alreadySaved") : t("web.share.saved"));
      // As on mobile, the saved copy replaces this page: Back doesn't return to the link.
      router.replace(`/recipe/${recipeId}`);
    } catch (caught) {
      const reason =
        caught instanceof ShareSaveError && caught.code === "share_not_found" ? t("recipe.shareNotFound") : t("common.tryAgain");
      setSaveError(`${t("recipe.shareClaimFailedTitle")}: ${reason}`);
      setSaving(false);
    }
  }, [saveShared, router, t]);

  // A guest who pressed Save signed up (or in) and came back: save it now.
  const { pending: savingAfterSignIn } = useSaveAfterSignIn({ ready, save: () => void save() });

  if (state.status === "loading") return <LoadingState label={t("recipe.shareLoading")} />;
  if (state.status === "missing") {
    return (
      <EmptyState
        icon={<Link2Off aria-hidden />}
        title={t("recipe.shareNotFound")}
        body={t("web.share.notFoundBody")}
        action={
          user ? (
            <Link href="/" data-track="shared_recipe.go_home" className={buttonClasses({ variant: "secondary" })}>
              {t("recipe.goToLibrary")}
            </Link>
          ) : null
        }
      />
    );
  }
  if (state.status === "error") return <ErrorState title={t("recipe.loadFailedTitle")} trackId="shared_recipe.load_error" onRetry={state.reload} />;

  const actions = (
    <>
      {state.libraryRecipeId ? (
        <Link href={`/recipe/${state.libraryRecipeId}`} data-track="shared_recipe.open_in_library" className={buttonClasses({ size: "lg" })}>
          <BookOpenCheck aria-hidden className="h-5 w-5" />
          {t("hub.openInLibrary")}
        </Link>
      ) : (
        <Button
          size="lg"
          trackId="shared_recipe.save"
          busy={saving || savingAfterSignIn}
          onClick={() => (user ? void save() : router.push(`${signInHere("signup", "save=1")}&reason=shared_recipe`))}
        >
          {saving ? null : <BookmarkPlus aria-hidden className="h-5 w-5" />}
          {t("recipe.shareSave")}
        </Button>
      )}
      <div className="basis-full">
        {saveError ? (
          <div className="mb-2">
            <ErrorAlert>{saveError}</ErrorAlert>
          </div>
        ) : null}
        <p className="max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          {user ? null : <span className="font-semibold text-text">{t("web.guest.saveNeedsAccount")} </span>}
          {state.libraryRecipeId ? t("web.share.inLibrary") : t("recipe.shareSaveHint")}
        </p>
      </div>
    </>
  );

  return <RecipeView display={state.display} back={user ? undefined : null} actions={actions} readOnly />;
}
