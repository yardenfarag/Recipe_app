"use client";

import { ArrowLeft, CalendarCheck, Clock, ExternalLink, Flame, Folder, Gauge, Heart } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { COST_I18N_KEYS, COST_TIER_COUNT, costFilledCount } from "@shared/lib/formatCostEstimate";
import { formatCookedDate } from "@shared/lib/formatCookedDate";
import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { getCalorieDisplay } from "@shared/lib/recipeCalories";
import { normalizeRecipeTags, translateRecipeTag } from "@shared/lib/recipeTags";

import { useLanguage } from "@/components/LanguageProvider";
import type { RecipeDisplay } from "@/components/recipe/types";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { useCollections } from "@/lib/library/useCollections";

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text">
      <span aria-hidden className="text-primary [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      {children}
    </li>
  );
}

/** ●●○ for the cost tier. Drawn, so it never flips in right-to-left text. */
function CostMeter({ filled }: { filled: number }) {
  return (
    <span aria-hidden className="flex items-center gap-0.5" dir="ltr">
      {Array.from({ length: COST_TIER_COUNT }, (_, index) => (
        <span key={index} className={cn("h-1.5 w-1.5 rounded-full", index < filled ? "bg-primary" : "bg-border")} />
      ))}
    </span>
  );
}

/**
 * The top of a recipe: back to the Library, the picture beside the title on wide screens (above it on phones), the
 * facts (calories, time, cost, effort), its tags and collections, when it was last cooked, the heart and a link to
 * where it came from.
 */
export function RecipeHeader({ display, servings, onToggleFavorite }: { display: RecipeDisplay; servings: number; onToggleFavorite: () => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { collections } = useCollections();
  const { recipe, title } = display;
  const [pictureFailed, setPictureFailed] = useState(false);
  const isFavorite = recipe.is_favorite === true;

  const calories = getCalorieDisplay(recipe.calories, recipe.servings, servings);
  const cost = recipe.cost_estimate;
  const tags = normalizeRecipeTags(recipe.tags);
  const inCollections = collections.filter((collection) => collection.recipeIds.includes(recipe.id));
  const cookedDate = recipe.last_cooked_at ? formatCookedDate(recipe.last_cooked_at, language) : "";
  const cookNote = recipe.cook_note?.trim();

  // Without a photo the title takes the full width: a large empty frame would only push the recipe down.
  const hasPicture = Boolean(recipe.image_url) && !pictureFailed;

  return (
    <header className="pb-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full py-1 pe-2 text-sm font-semibold text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
        {t("cookbook.backToLibrary")}
      </Link>

      <div className={cn("mt-4 grid gap-5", hasPicture && "md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-8")}>
        {hasPicture ? (
          <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl bg-primary-soft shadow-soft md:aspect-square lg:aspect-[4/3]">
            {/* Pictures come from other sites, already sized, so there is nothing for next/image to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.image_url} alt="" decoding="async" onError={() => setPictureFailed(true)} className="h-full w-full object-cover" />
          </div>
        ) : null}

        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <h1
              dir={display.direction}
              lang={display.contentLanguage ?? undefined}
              className="min-w-0 flex-1 text-start text-[28px] leading-tight font-bold tracking-tight text-balance text-text md:text-[34px]"
            >
              {title}
            </h1>
            <IconButton
              label={isFavorite ? t("a11y.removeRecipeFromFavorites", { name: title }) : t("a11y.addRecipeToFavorites", { name: title })}
              aria-pressed={isFavorite}
              onClick={onToggleFavorite}
              className="-mt-0.5 h-11 w-11"
              icon={<Heart aria-hidden className={cn("h-6 w-6 transition-colors", isFavorite ? "fill-primary text-primary" : "text-muted")} />}
            />
          </div>

          <ul className="mt-4 flex flex-wrap gap-2">
            {calories ? <Fact icon={<Flame />}>{t("recipe.calPerServing", { count: calories.perServing })}</Fact> : null}
            {recipe.estimated_time_minutes != null ? (
              <Fact icon={<Clock />}>
                {formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })}
              </Fact>
            ) : null}
            {cost ? (
              <Fact icon={<CostMeter filled={costFilledCount(cost)} />}>
                <span aria-hidden>{t(COST_I18N_KEYS[cost])}</span>
                <span className="sr-only">{t("recipe.cost.a11y", { label: t(COST_I18N_KEYS[cost]), count: costFilledCount(cost) })}</span>
              </Fact>
            ) : null}
            {recipe.effort_level ? <Fact icon={<Gauge />}>{t(`recipe.effort.${recipe.effort_level.toLowerCase()}`)}</Fact> : null}
          </ul>

          {tags.length > 0 ? (
            <ul aria-label={t("library.tags")} className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/?tag=${encodeURIComponent(tag)}`}
                    className="inline-flex rounded-full bg-element px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-selected hover:text-text"
                  >
                    {translateRecipeTag(tag, t)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {inCollections.length > 0 ? (
            <ul aria-label={t("library.collections")} className="mt-2.5 flex flex-wrap gap-1.5">
              {inCollections.map((collection) => (
                <li key={collection.id}>
                  <Link
                    href={`/?collection=${encodeURIComponent(collection.id)}`}
                    aria-label={t("a11y.openCollection", { name: collection.name })}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Folder aria-hidden className="h-3.5 w-3.5" />
                    {collection.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {cookedDate || recipe.original_url ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {cookedDate ? (
                <p className="inline-flex items-center gap-1.5 text-muted">
                  <CalendarCheck aria-hidden className="h-4 w-4 shrink-0" />
                  {cookNote ? t("recipe.cookedOnWithNote", { date: cookedDate, note: cookNote }) : t("recipe.cookedOn", { date: cookedDate })}
                </p>
              ) : null}
              {recipe.original_url ? (
                <a
                  href={recipe.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {t("web.recipe.viewOriginal")}
                  <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
                  <ExternalLink aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
