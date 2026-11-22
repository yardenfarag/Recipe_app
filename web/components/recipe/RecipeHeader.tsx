"use client";

import { ArrowLeft, CalendarCheck, ChefHat, ChevronLeft, ExternalLink, Folder, Gauge, Heart, Plus, Share } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { COST_I18N_KEYS, COST_TIER_COUNT, costFilledCount } from "@shared/lib/formatCostEstimate";
import { formatCookedDate } from "@shared/lib/formatCookedDate";
import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { getCalorieDisplay } from "@shared/lib/recipeCalories";
import { getNutritionDisplay, recipeNutritionOf } from "@shared/lib/recipeNutrition";
import { recipeOriginChip } from "@shared/lib/recipeOrigin";
import { recipeSource } from "@shared/lib/recipeSource";
import { normalizeRecipeTags, translateRecipeTag } from "@shared/lib/recipeTags";
import type { RecipeCollection } from "@shared/types/collection";

import { CookAlongButton, StartCookingButton } from "@/components/cook/CookBar";
import { useLanguage } from "@/components/LanguageProvider";
import { isUpdating, useRecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { RecipeMoreMenu } from "@/components/recipe/actions/RecipeMoreMenu";
import { DotSeparated } from "@/components/recipe/DotSeparated";
import type { RecipeDisplay } from "@/components/recipe/types";
import { Button } from "@/components/ui/Button";
import { IconButton, iconButtonClasses, type IconButtonVariant } from "@/components/ui/IconButton";
import { PhotoTile, Tile, TileBadge } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import type { CookAlongVideo } from "@/lib/cook/cookAlongVideo";
import { useCollections } from "@/lib/library/useCollections";

const factBox = "flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-element px-2.5 py-2.5 md:rounded-2xl md:px-3.5 md:py-3";
const factValue = "font-display text-[17px] leading-tight font-bold text-balance text-text md:text-[22px]";
const factLabel = "text-[11px] leading-snug font-semibold text-muted md:text-xs";

/**
 * One fact as a small tile: the value big, what it is small under it. `spoken` is what a screen reader hears
 * instead of the two pieces ("~200 cal/serving").
 */
function Fact({ value, label, spoken }: { value: ReactNode; label: string; spoken?: string }) {
  return (
    <li className={factBox}>
      {spoken ? <span className="sr-only">{spoken}</span> : null}
      <span aria-hidden={spoken ? true : undefined} className={factValue}>
        {value}
      </span>
      <span aria-hidden={spoken ? true : undefined} className={factLabel}>
        {label}
      </span>
    </li>
  );
}

/** A fact Pinch is recalculating after a hand edit (ADR 018): "Updating…", read out with the field's name. */
function UpdatingFact({ field, label }: { field: string; label: string }) {
  const { t } = useTranslation();
  return (
    <li className={cn(factBox, "bg-transparent outline-1 -outline-offset-1 outline-border outline-dashed")}>
      <span data-testid="updating-fact" className="text-sm leading-tight font-semibold text-muted motion-safe:animate-pulse md:text-base">
        <span className="sr-only">{field}: </span>
        {t("recipeEditor.updating")}
      </span>
      <span aria-hidden className={factLabel}>
        {label}
      </span>
    </li>
  );
}

/** ●●○ for the cost tier. Drawn, so it never flips in right-to-left text. */
function CostMeter({ filled }: { filled: number }) {
  return (
    <span aria-hidden className="flex h-[21px] items-center gap-1 md:h-[27px]" dir="ltr">
      {Array.from({ length: COST_TIER_COUNT }, (_, index) => (
        <span key={index} className={cn("h-2.5 w-2.5 rounded-full md:h-3 md:w-3", index < filled ? "bg-primary" : "bg-selected")} />
      ))}
    </span>
  );
}

/** What the header needs to offer cooking: the video (if any) and how to open cook mode. */
export type HeaderCook = {
  video: CookAlongVideo | null;
  playerOpen: boolean;
  playerId: string;
  onTogglePlayer: () => void;
  /** Null when there are no steps to cook from. */
  onCookMode: (() => void) | null;
  /** Whether the steps carry times in the video, so cook along can jump between them. */
  hasStepTimes: boolean;
};

/**
 * The top of a recipe (PIN-162): a bar with the way back, the heart, Share and "more"; the photo, with "Cook along
 * with the video" on it; and a tile with where it was saved from, the title, four facts (time, servings, calories
 * and cost as a tier, never an amount), its tags and collections, when it was last cooked, and the buttons that
 * start cooking.
 *
 * On a phone, on the saved recipe's own page (`immersive`), the photo fills the width from the top of the screen
 * with the back, heart and "more" buttons on it, and the details slide up over it (PIN-163).
 */
export function RecipeHeader({
  display,
  servings,
  onToggleFavorite,
  back,
  cook,
  extraActions,
  onDelete,
  immersive = false,
}: {
  display: RecipeDisplay;
  servings: number;
  /** The heart. Leave out for a recipe that isn't saved (a Snap preview, a Hub recipe). */
  onToggleFavorite?: () => void;
  /** Where the back link goes. Defaults to the Library; null hides it. */
  back?: { href: string; label: string } | null;
  cook?: HeaderCook;
  /** Buttons for this kind of recipe (Save, Add to library…), beside "Start cooking". */
  extraActions?: ReactNode;
  /** "Delete" in the more menu. Only on a saved recipe's page. */
  onDelete?: () => void;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const actions = useRecipeActions();
  const { recipe, title } = display;
  const [pictureFailed, setPictureFailed] = useState(false);
  const isFavorite = recipe.is_favorite === true;

  const calories = getCalorieDisplay(recipe.calories, recipe.servings, servings);
  // PIN-80: none next to calories set by hand, and none while the calories are being recalculated.
  const caloriesUpdating = isUpdating(actions, "calories");
  const nutrition = caloriesUpdating ? null : getNutritionDisplay(recipeNutritionOf(recipe), recipe.servings, servings);
  const cost = recipe.cost_estimate;
  const tags = normalizeRecipeTags(recipe.tags);
  const cookedDate = recipe.last_cooked_at ? formatCookedDate(recipe.last_cooked_at, language) : "";
  const cookNote = recipe.cook_note?.trim();
  const cooked = Boolean(recipe.last_cooked_at);

  // Without a photo the details take the full width: a large empty frame would only push the recipe down.
  const hasPicture = Boolean(recipe.image_url) && !pictureFailed;
  // The phone layout with the photo at the very top and the buttons on it.
  const overPhoto = immersive && hasPicture;

  const source = recipeSource(recipe);
  const origin = recipeOriginChip(recipe);
  const badge = source
    ? source.platform === "photo"
      ? t("web.recipe.savedFromPhoto")
      : t("web.recipe.savedFrom", { source: [source.name ?? t("web.library.sourceWebsite"), source.handle].filter(Boolean).join(" · ") })
    : origin === "invented"
      ? t("recipe.inventedChip")
      : origin === "written"
        ? t("recipeEditor.originChip")
        : null;

  const backHref = back?.href ?? "/";
  const backLabel = back?.label ?? t("cookbook.backToLibrary");
  const favoriteLabel = isFavorite ? t("a11y.removeRecipeFromFavorites", { name: title }) : t("a11y.addRecipeToFavorites", { name: title });

  const favoriteButton = (variant: IconButtonVariant) =>
    onToggleFavorite ? (
      <IconButton
        variant={variant}
        label={favoriteLabel}
        aria-pressed={isFavorite}
        trackId="recipe.favorite"
        onClick={onToggleFavorite}
        icon={
          <Heart
            aria-hidden
            className={cn(
              "h-5 w-5 transition-colors",
              isFavorite ? (variant === "photo" ? "fill-scrim-primary text-scrim-primary" : "fill-primary text-primary") : variant === "photo" ? "text-on-scrim" : "text-muted",
            )}
          />
        }
      />
    ) : null;

  // The longer the name, the smaller it is set, so it stays a headline and not a paragraph.
  const titleSize =
    title.length <= 16 ? "text-[40px] md:text-6xl xl:text-[72px]" : title.length <= 34 ? "text-[32px] md:text-5xl xl:text-[56px]" : "text-[28px] md:text-4xl xl:text-[44px]";

  return (
    <header className="flex flex-col gap-4 md:gap-6">
      <div className={cn("flex flex-wrap items-center gap-2.5", overPhoto && "max-md:hidden")}>
        {back === null ? null : (
          <Link
            href={backHref}
            data-track="recipe.back"
            className="inline-flex h-11 items-center gap-2 rounded-btn border border-border bg-surface ps-2.5 pe-4 text-[15px] font-semibold text-text transition-colors hover:bg-element"
          >
            <ChevronLeft aria-hidden className="h-[18px] w-[18px] rtl:rotate-180" />
            {backLabel}
          </Link>
        )}
        <span className="flex-1" />
        {favoriteButton("tile")}
        {actions ? (
          <>
            <Button variant="outline" size="sm" className="h-11 rounded-btn text-[15px]" trackId="recipe.share" busy={actions.busy.share} onClick={actions.share}>
              {actions.busy.share ? null : <Share aria-hidden className="h-[18px] w-[18px]" />}
              {t("recipe.share")}
            </Button>
            <RecipeMoreMenu actions={actions} onDelete={onDelete} />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap">
        {hasPicture ? (
          <PhotoTile
            src={recipe.image_url}
            fade="none"
            onPhotoError={() => setPictureFailed(true)}
            className={cn(
              "min-h-[260px] md:min-h-[460px] md:flex-[7_1_520px]",
              overPhoto && "max-md:-mx-4 max-md:-mt-5 max-md:h-[360px] max-md:rounded-none sm:max-md:-mx-6",
            )}
          >
            {overPhoto ? (
              <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2 md:hidden">
                {back === null ? null : (
                  <Link href={backHref} data-track="recipe.back" aria-label={backLabel} className={iconButtonClasses("photo")}>
                    <ArrowLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
                  </Link>
                )}
                <span className="flex-1" />
                {favoriteButton("photo")}
                {actions ? <RecipeMoreMenu actions={actions} onDelete={onDelete} variant="photo" /> : null}
              </div>
            ) : null}
            {cook?.video ? (
              <div className={cn("absolute inset-x-4 bottom-4 flex md:inset-x-5 md:bottom-5", overPhoto && "max-md:bottom-[60px]")}>
                <CookAlongButton
                  video={cook.video}
                  playerOpen={cook.playerOpen}
                  playerId={cook.playerId}
                  onTogglePlayer={cook.onTogglePlayer}
                  variant="photo"
                  hint={cook.hasStepTimes ? t("web.recipe.cookAlongHint", { platform: cook.video.label }) : cook.video.label}
                />
              </div>
            ) : null}
          </PhotoTile>
        ) : null}

        <Tile
          className={cn(
            "flex min-w-0 flex-col gap-3.5 p-5 md:flex-[5_1_380px] md:gap-[18px] md:p-8",
            // On the phone the details are a sheet that slides up over the photo, on the page's own colour.
            overPhoto && "max-md:relative max-md:-mx-4 max-md:-mt-12 max-md:rounded-b-none max-md:border-0 max-md:bg-bg max-md:px-4 max-md:pt-[22px] max-md:pb-0 sm:max-md:-mx-6 sm:max-md:px-6",
          )}
        >
          {badge ? <TileBadge className="text-[11px] md:text-xs">{badge}</TileBadge> : null}

          <h1
            dir={display.direction}
            lang={display.contentLanguage ?? undefined}
            className={cn("min-w-0 text-start leading-[0.95] font-bold tracking-[-0.035em] text-balance text-text rtl:leading-[1.15] rtl:tracking-normal", titleSize)}
          >
            {title}
          </h1>

          <ul className="grid grid-cols-4 gap-2 md:gap-2.5">
            {isUpdating(actions, "estimated_time_minutes") ? (
              <UpdatingFact field={t("recipeEditor.fields.time")} label={t("web.recipe.factTime")} />
            ) : recipe.estimated_time_minutes != null ? (
              <Fact
                value={formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })}
                label={t("web.recipe.factTime")}
              />
            ) : null}
            <Fact value={servings} label={t("recipe.servings")} />
            {caloriesUpdating ? (
              <UpdatingFact field={t("recipeEditor.fields.calories")} label={t("web.recipe.factCalories")} />
            ) : calories ? (
              <Fact value={calories.perServing.toLocaleString()} label={t("web.recipe.factCalories")} spoken={t("recipe.calPerServing", { count: calories.perServing })} />
            ) : null}
            {isUpdating(actions, "cost_estimate") ? (
              <UpdatingFact field={t("recipeEditor.fields.cost")} label={t("web.recipe.factCost")} />
            ) : cost ? (
              <Fact
                value={<CostMeter filled={costFilledCount(cost)} />}
                label={t(COST_I18N_KEYS[cost])}
                spoken={t("recipe.cost.a11y", { label: t(COST_I18N_KEYS[cost]), count: costFilledCount(cost) })}
              />
            ) : null}
          </ul>

          {calories && nutrition ? (
            <p data-testid="recipe-nutrition" className="-mt-1 text-sm font-medium text-muted tabular-nums">
              <DotSeparated
                text={t("recipe.nutritionPerServing", {
                  protein: nutrition.perServing.protein_g,
                  carbs: nutrition.perServing.carbs_g,
                  fat: nutrition.perServing.fat_g,
                })}
              />
            </p>
          ) : null}

          {tags.length > 0 || actions || recipe.effort_level || isUpdating(actions, "effort_level") ? (
            <ul aria-label={t("library.tags")} className="flex flex-wrap items-center gap-1.5">
              {isUpdating(actions, "effort_level") ? (
                <li data-testid="updating-fact" className="px-1 text-xs font-medium text-muted motion-safe:animate-pulse">
                  <span className="sr-only">{t("recipeEditor.fields.effort")}: </span>
                  {t("recipeEditor.updating")}
                </li>
              ) : recipe.effort_level ? (
                <li className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-text">
                  <Gauge aria-hidden className="h-3.5 w-3.5" />
                  {t(`recipe.effort.${recipe.effort_level.toLowerCase()}`)}
                </li>
              ) : null}
              {tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/?tag=${encodeURIComponent(tag)}`}
                    data-track="recipe.tag.open"
                    className="inline-flex items-center rounded-full bg-element px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-selected hover:text-text pointer-coarse:min-h-11 pointer-coarse:px-3.5"
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
                    data-track="recipe.tags.edit"
                    onClick={() => actions.open({ kind: "tags" })}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-text transition-[filter] hover:brightness-95 pointer-coarse:min-h-11 pointer-coarse:px-3.5"
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
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {cookedDate ? (
                <p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
                  <CalendarCheck aria-hidden className="h-4 w-4 shrink-0" />
                  {cookNote ? t("recipe.cookedOnWithNote", { date: cookedDate, note: cookNote }) : t("recipe.cookedOn", { date: cookedDate })}
                  {actions ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      data-track="recipe.cooked.note"
                      onClick={() => actions.open({ kind: "note" })}
                      className="ms-1 inline-flex items-center rounded font-semibold text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11"
                    >
                      {cookNote ? t("web.recipeActions.editNote") : t("web.recipeActions.addNote")}
                    </button>
                  ) : null}
                </p>
              ) : null}
              {recipe.original_url ? (
                <a
                  href={recipe.original_url}
                  data-track="recipe.view_original"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11"
                >
                  {t("web.recipe.viewOriginal")}
                  <span className="sr-only"> ({t("web.recipe.opensInNewTab")})</span>
                  <ExternalLink aria-hidden className="h-4 w-4 rtl:-scale-x-100" />
                </a>
              ) : null}
            </div>
          ) : null}

          {cook?.onCookMode || extraActions || actions || (cook?.video && !hasPicture) ? (
            <div data-testid="cook-bar" className="mt-auto flex flex-wrap gap-2.5 pt-1 empty:hidden">
              {extraActions}
              {cook?.onCookMode ? (
                <StartCookingButton
                  onCookMode={cook.onCookMode}
                  emphasis={extraActions ? "quiet" : "primary"}
                  // On the phone's own recipe page "Start cooking" is fixed to the bottom of the screen instead.
                  className={cn("flex-[1_1_12rem]", immersive && "max-md:hidden")}
                />
              ) : null}
              {cook?.video && !hasPicture ? (
                <CookAlongButton video={cook.video} playerOpen={cook.playerOpen} playerId={cook.playerId} onTogglePlayer={cook.onTogglePlayer} variant="inline" />
              ) : null}
              {actions ? (
                <Button variant="outline" size="lg" trackId="recipe.cooked.toggle" onClick={actions.markCooked} className="text-[15px] max-md:flex-1">
                  <ChefHat aria-hidden className="h-[18px] w-[18px] text-primary-text" />
                  {cooked ? t("recipe.cookedAgain") : t("recipe.cookedAction")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Tile>
      </div>
    </header>
  );
}

/** The collections a recipe is in, each a link to it in the Library. */
function CollectionChips({ recipeId, collections }: { recipeId: string; collections: RecipeCollection[] }) {
  const { t } = useTranslation();
  const inCollections = collections.filter((collection) => collection.recipeIds.includes(recipeId));
  if (inCollections.length === 0) return null;
  return (
    <ul aria-label={t("library.collections")} className="-mt-1.5 flex flex-wrap gap-1.5">
      {inCollections.map((collection) => (
        <li key={collection.id}>
          <Link
            href={`/?collection=${encodeURIComponent(collection.id)}`}
            data-track="recipe.collection.open"
            aria-label={t("a11y.openCollection", { name: collection.name })}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-text transition-[filter] hover:brightness-95 pointer-coarse:min-h-11 pointer-coarse:px-3.5"
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
