"use client";

import { Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_SOURCE_LANGUAGE } from "@shared/lib/appLanguages";
import { recipeIsInvented } from "@shared/lib/recipeOrigin";
import { saveRecipeDraft } from "@shared/lib/supabase/saveRecipeDraft";
import { showToast } from "@shared/lib/toast";
import { translateAppError } from "@shared/lib/translateAppError";
import type { ExtractedRecipe, Recipe } from "@shared/types/recipe";

import { useLanguage } from "@/components/LanguageProvider";
import { RecipeView } from "@/components/recipe/RecipeView";
import { navItem } from "@/components/shell/nav";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { captureRecipeSaved } from "@/lib/analytics";
import { buildRecipeDisplay } from "@/lib/recipe/recipeDisplay";
import { useAutoTranslation } from "@/lib/recipe/useAutoTranslation";
import { clearSnapDraft, getSnapDraft, PREVIEW_RECIPE_ID, type SnapDraft } from "@/lib/snap/draft";

/** The draft as the recipe page reads it: not saved, so it has the preview's id and no favorite. */
function asPreviewRecipe(recipe: ExtractedRecipe): Recipe {
  return { ...recipe, id: PREVIEW_RECIPE_ID, source_language: recipe.source_language ?? DEFAULT_SOURCE_LANGUAGE };
}

/**
 * The recipe a Snap just made, before it is saved: the whole recipe page, with Save and Discard instead of the
 * heart, and Back to Snap. It reads the draft from this browser, so a reload keeps it. Saving opens the Library with
 * the "saved" banner, or the recipe already there if the save had gone through before.
 */
export function SnapPreview() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language } = useLanguage();
  const [draft, setDraft] = useState<SnapDraft | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    // The draft lives in this browser's storage, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(getSnapDraft());
  }, []);

  const recipe = useMemo(() => (draft ? asPreviewRecipe(draft.recipe) : null), [draft]);
  // In another language than the app's: shown translated, as on mobile.
  const { translation } = useAutoTranslation(recipe, language);
  const display = useMemo(() => (recipe ? buildRecipeDisplay(recipe, language, translation) : null), [recipe, language, translation]);
  usePageTitle(display?.title || t("recipe.preview"));

  if (draft === undefined) return <LoadingState label={t("a11y.loading")} />;
  if (!draft || !display) {
    const snap = navItem("snap");
    return (
      <EmptyState
        icon={<Sparkles aria-hidden />}
        title={t("recipe.noPreview")}
        action={
          <Link href={snap.href} className={buttonClasses({ variant: "primary" })}>
            <snap.icon aria-hidden className="h-4 w-4" />
            {t("snap.title")}
          </Link>
        }
      />
    );
  }

  async function save() {
    if (!draft || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    try {
      const { recipe: saved, recoveredDuplicate } = await saveRecipeDraft({
        ...draft.recipe,
        source_language: draft.recipe.source_language ?? DEFAULT_SOURCE_LANGUAGE,
      });
      clearSnapDraft();
      if (!recoveredDuplicate) captureRecipeSaved({ from: recipeIsInvented(draft.recipe) ? "invent" : "extract" });
      if (recoveredDuplicate) {
        showToast(t("recipe.alreadySaved"), "info");
        router.replace(`/recipe/${saved.id}`);
      } else {
        router.replace("/?saved=1");
      }
    } catch (caught) {
      showToast(`${t("recipe.saveFailedTitle")}: ${translateAppError(caught, t)}`, "info");
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <RecipeView
        display={display}
        back={{ href: "/add", label: t("web.snap.backToSnap") }}
        actions={
          <>
            {draft.kitchenFailed ? (
              <div role="status" className="flex basis-full items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm leading-relaxed">
                <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  <span className="font-semibold text-warning">{t("recipe.kitchenAutoApplyFailedTitle")}. </span>
                  <span className="text-text">{t("recipe.kitchenAutoApplyFailed")}</span>
                </p>
              </div>
            ) : null}
            <Button size="lg" busy={saving} trackId="recipe_preview.save" onClick={() => void save()}>
              {t("recipe.save")}
            </Button>
            <Button size="lg" variant="ghost" disabled={saving} trackId="recipe_preview.discard" onClick={() => setDiscardOpen(true)}>
              {t("web.snap.discard")}
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("web.snap.discardTitle")}
        description={t("web.snap.discardBody")}
        confirmLabel={t("web.snap.discard")}
        trackId="recipe_preview.discard_dialog"
        onConfirm={() => {
          clearSnapDraft();
          router.replace("/add");
        }}
      />
    </>
  );
}
