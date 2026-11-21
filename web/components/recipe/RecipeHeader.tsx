"use client";

import { ArrowLeft, CalendarCheck, Clock, ExternalLink, Flame, Folder, Gauge, Heart, PencilLine, Plus, Share2, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { COST_I18N_KEYS, COST_TIER_COUNT, costFilledCount } from "@shared/lib/formatCostEstimate";
import { formatCookedDate } from "@shared/lib/formatCookedDate";
import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { getCalorieDisplay } from "@shared/lib/recipeCalories";
import { normalizeRecipeTags, translateRecipeTag } from "@shared/lib/recipeTags";
import type { RecipeCollection } from "@shared/types/collection";

import { useLanguage } from "@/components/LanguageProvider";
import { isUpdating, useRecipeActions, type RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import type { RecipeDisplay } from "@/components/recipe/types";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
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

/** A fact Pinch is recalculating after a hand edit (ADR 018): "Updating…", read out with the field's name. */
function UpdatingFact({ icon, field }: { icon: ReactNode; field: string }) {
  const { t } = useTranslation();
  return (
    <li
      data-testid="updating-fact"
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted"
    >
      <span aria-hidden className="motion-safe:animate-pulse [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <span className="sr-only">{field}: </span>
      {t("recipeEditor.updating")}
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
export function RecipeHeader({
  display,
  servings,
  onToggleFavorite,
  back,
}: {
  display: RecipeDisplay;
  servings: number;
  /** The heart. Leave out for a recipe that isn't saved (a Snap preview, a Hub recipe). */
  onToggleFavorite?: () => void;
  /** Where the back link goes. Defaults to the Library; null hides it. */
  back?: { href: string; label: string } | null;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const actions = useRecipeActions();
  const { recipe, title } = display;
  const [pictureFailed, setPictureFailed] = useState(false);
  const isFavorite = recipe.is_favorite === true;

  const calories = getCalorieDisplay(recipe.calories, recipe.servings, servings);
  const cost = recipe.cost_estimate;
  const tags = normalizeRecipeTags(recipe.tags);
  const cookedDate = recipe.last_cooked_at ? formatCookedDate(recipe.last_cooked_at, language) : "";
  const cookNote = recipe.cook_note?.trim();

  // Without a photo the title takes the full width: a large empty frame would only push the recipe down.
  const hasPicture = Boolean(recipe.image_url) && !pictureFailed;

  return (
    <header className="pb-6">
      {back === null ? null : (
        <Link
          href={back?.href ?? "/"}
          className="inline-flex items-center gap-1.5 rounded-full py-1 pe-2 text-sm font-semibold text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
          {back?.label ?? t("cookbook.backToLibrary")}
        </Link>
      )}

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
            {actions ? <TitleActions actions={actions} recipeId={recipe.id} /> : null}
            {onToggleFavorite ? (
            <IconButton
              label={isFavorite ? t("a11y.removeRecipeFromFavorites", { name: title }) : t("a11y.addRecipeToFavorites", { name: title })}
              aria-pressed={isFavorite}
              onClick={onToggleFavorite}
              className="-mt-0.5 h-11 w-11"
              icon={<Heart aria-hidden className={cn("h-6 w-6 transition-colors", isFavorite ? "fill-primary text-primary" : "text-muted")} />}
            />
            ) : null}
          </div>

          <ul className="mt-4 flex flex-wrap gap-2">
            {isUpdating(actions, "calories") ? (
              <UpdatingFact icon={<Flame />} field={t("recipeEditor.fields.calories")} />
            ) : calories ? (
              <Fact icon={<Flame />}>{t("recipe.calPerServing", { count: calories.perServing })}</Fact>
            ) : null}
            {isUpdating(actions, "estimated_time_minutes") ? (
              <UpdatingFact icon={<Clock />} field={t("recipeEditor.fields.time")} />
            ) : recipe.estimated_time_minutes != null ? (
              <Fact icon={<Clock />}>
                {formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })}
              </Fact>
            ) : null}
            {isUpdating(actions, "cost_estimate") ? (
              <UpdatingFact icon={<Wallet />} field={t("recipeEditor.fields.cost")} />
            ) : cost ? (
              <Fact icon={<CostMeter filled={costFilledCount(cost)} />}>
                <span aria-hidden>{t(COST_I18N_KEYS[cost])}</span>
                <span className="sr-only">{t("recipe.cost.a11y", { label: t(COST_I18N_KEYS[cost]), count: costFilledCount(cost) })}</span>
              </Fact>
            ) : null}
            {isUpdating(actions, "effort_level") ? (
              <UpdatingFact icon={<Gauge />} field={t("recipeEditor.fields.effort")} />
            ) : recipe.effort_level ? (
              <Fact icon={<Gauge />}>{t(`recipe.effort.${recipe.effort_level.toLowerCase()}`)}</Fact>
            ) : null}
          </ul>

          {tags.length > 0 || actions ? (
            <ul aria-label={t("library.tags")} className="mt-4 flex flex-wrap items-center gap-1.5">
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
              {isUpdating(actions, "tags") ? (
                <li className="px-1 text-xs font-medium text-muted motion-safe:animate-pulse">
                  <span className="sr-only">{t("recipeEditor.fields.tags")}: </span>
                  {t("recipeEditor.updating")}
                </li>
              ) : null}
              {actions ? (
                <li>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => actions.open({ kind: "tags" })}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {tags.length > 0 ? null : <Plus aria-hidden className="h-3.5 w-3.5" />}
                    {tags.length > 0 ? t("tags.editTitle") : t("tags.addTags")}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}

          {actions ? <CollectionChips recipeId={recipe.id} collections={actions.collections} /> : <SavedCollectionChips recipeId={recipe.id} />}

          {cookedDate || recipe.original_url ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {cookedDate ? (
                <p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
                  <CalendarCheck aria-hidden className="h-4 w-4 shrink-0" />
                  {cookNote ? t("recipe.cookedOnWithNote", { date: cookedDate, note: cookNote }) : t("recipe.cookedOn", { date: cookedDate })}
                  {actions ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => actions.open({ kind: "note" })}
                      className="ms-1 rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {cookNote ? t("web.recipeActions.editNote") : t("web.recipeActions.addNote")}
                    </button>
                  ) : null}
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

/** Edit (the editor, ADR 018) and Share, beside the heart. Only on a saved recipe. */
function TitleActions({ actions, recipeId }: { actions: RecipeActions; recipeId: string }) {
  const { t } = useTranslation();
  return (
    <div className="-mt-0.5 flex shrink-0 items-center">
      <Tooltip label={t("recipeEditor.titleEdit")}>
        <Link
          href={`/recipe/edit?id=${encodeURIComponent(recipeId)}`}
          aria-label={t("recipeEditor.titleEdit")}
          className="grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-element hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
        >
          <PencilLine aria-hidden className="h-[22px] w-[22px] rtl:-scale-x-100" />
        </Link>
      </Tooltip>
      <IconButton
        label={t("recipe.share")}
        aria-busy={actions.busy.share || undefined}
        disabled={actions.busy.share}
        onClick={actions.share}
        className="h-11 w-11"
        icon={
          actions.busy.share ? (
            <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-primary-soft border-t-primary" />
          ) : (
            <Share2 aria-hidden className="h-[22px] w-[22px]" />
          )
        }
      />
    </div>
  );
}

/** The collections a recipe is in, each a link to it in the Library. */
function CollectionChips({ recipeId, collections }: { recipeId: string; collections: RecipeCollection[] }) {
  const { t } = useTranslation();
  const inCollections = collections.filter((collection) => collection.recipeIds.includes(recipeId));
  if (inCollections.length === 0) return null;
  return (
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
  );
}

/** Where there are no recipe actions (a Hub recipe, a Snap preview), the header loads the collections itself. */
function SavedCollectionChips({ recipeId }: { recipeId: string }) {
  const { collections } = useCollections();
  return <CollectionChips recipeId={recipeId} collections={collections} />;
}
