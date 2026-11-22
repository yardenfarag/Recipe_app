"use client";

import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { RecipeEditor } from "@/components/editor/RecipeEditor";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useEditorRecipe } from "@/lib/editor/useEditorRecipe";

/**
 * Write a recipe (`/recipe/edit`), Edit recipe (`/recipe/edit?id=<id>`) and Finish a partial import
 * (`/recipe/edit?from=import`), the same paths as the mobile app so its links work here (PIN-137, ADR 018/019).
 * `/recipe/<id>/edit` sends here too.
 */
export default function RecipeEditPage() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const id = params.get("id");
  const fromImport = !id && params.get("from") === "import";
  const load = useEditorRecipe(id, fromImport);
  const tab = <TabTitle title={id ? t("recipeEditor.titleEdit") : fromImport ? t("recipeEditor.titleImport") : t("recipeEditor.titleWrite")} />;

  if (load.status === "loading") {
    return (
      <>
        {tab}
        <LoadingState label={t("a11y.loadingRecipe")} />
      </>
    );
  }
  if (load.status === "missing") {
    return (
      <>
        {tab}
        {/* A partial import whose draft is gone (finished, or another browser): nothing to finish. */}
        <EmptyState icon={null} title={fromImport ? t("recipe.noPreview") : t("library.recipeNotFound")} />
      </>
    );
  }
  if (load.status === "error") {
    return (
      <>
        {tab}
        <ErrorState title={t("recipe.loadFailedTitle")} trackId="recipe_editor.load_error" onRetry={load.retry} />
      </>
    );
  }
  // A new editor for each recipe, so nothing typed for one carries over to another.
  return <RecipeEditor key={id ?? (fromImport ? "import" : "new")} initial={load.initial} />;
}

/** The tab's title while the form isn't showing (its PageHeader sets it once it is). */
function TabTitle({ title }: { title: string }) {
  usePageTitle(title);
  return null;
}
