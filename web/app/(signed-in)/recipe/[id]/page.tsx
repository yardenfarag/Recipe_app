"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchRecipeById } from "@shared/lib/supabase/recipes";

import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, LoadingState } from "@/components/ui/States";

/**
 * A saved recipe. The real page (ingredients, steps, cooking) arrives with its own ticket; until then this
 * names the recipe, so opening one from the Library leads somewhere that makes sense, and links back.
 */
export default function RecipePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetchRecipeById(id)
      .then((recipe) => active && setTitle(recipe?.title ?? null))
      .catch(() => active && setTitle(null));
    return () => {
      active = false;
    };
  }, [id]);

  if (title === undefined) return <LoadingState label={t("a11y.loading")} />;
  return (
    <>
      <PageHeader title={title ?? t("library.recipeNotFound")} />
      <section className="rounded-3xl border border-frosted-border bg-surface/70 shadow-soft backdrop-blur-sm md:py-6">
        <EmptyState
          icon={<BookOpen aria-hidden />}
          title={t("web.soon.recipe.title")}
          body={t("web.soon.recipe.body")}
          action={
            <Link href="/" className={buttonClasses({ variant: "primary" })}>
              {t("recipe.goToLibrary")}
            </Link>
          }
        />
      </section>
    </>
  );
}
