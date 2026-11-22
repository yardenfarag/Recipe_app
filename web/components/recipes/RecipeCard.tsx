"use client";

import { Heart, MoreVertical } from "lucide-react";
import Link from "next/link";
import { memo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { applianceNameKey, cardApplianceKeys } from "@shared/lib/applianceDisplay";
import { recipeAppliancesOf } from "@shared/lib/appliances";
import { COST_I18N_KEYS } from "@shared/lib/formatCostEstimate";
import { formatCookedDate } from "@shared/lib/formatCookedDate";
import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { recipeOriginChip } from "@shared/lib/recipeOrigin";
import { recipeSource } from "@shared/lib/recipeSource";
import type { Recipe } from "@shared/types/recipe";

import { CookieMark } from "@/components/CookieMark";
import { useLanguage } from "@/components/LanguageProvider";
import { RecipeActionsMenu, type RecipeActions } from "@/components/recipes/RecipeActionsMenu";
import { cn } from "@/lib/cn";

export type RecipeCardProps = {
  recipe: Recipe;
  /** `grid`: a photo card. `list`: a compact row with a thumbnail. */
  variant?: "grid" | "list";
  /** The heart, when the card may be favorited. */
  onToggleFavorite?: (recipe: Recipe) => void;
  /** The "…" menu, when there is anything to do with the recipe. Leave out where it only opens (the Hub). */
  actions?: RecipeActions;
  /** An extra line under the title, e.g. who saved it. */
  detail?: ReactNode;
  /** Where the card leads. Defaults to the saved recipe's page; the Hub passes its own. */
  href?: string;
  /** Activity-log prefix, as on mobile: the card logs `<trackId>.open`, `.favorite` and `.more`. */
  trackId?: string;
};

/**
 * One recipe, as a photo card or a row (PIN-161). The card is the photo with a chip saying where the recipe came
 * from, and the name and facts under it, with no box around them. The whole card is one link to the recipe, so it
 * opens in a new tab with a middle-click and is one stop for a screen reader; the heart and the menu sit above
 * that link as their own buttons. Shared by the Library and the Hub.
 */
// A button on the photo. On a phone each has its own dark backing; from tablet up the pill around them has it.
const onPhotoButton = "pointer-events-auto max-md:bg-scrim/60 max-md:backdrop-blur-md";

function RecipeCardBase({ recipe, variant = "grid", onToggleFavorite, actions, detail, href, trackId = "library.recipe" }: RecipeCardProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [pictureFailed, setPictureFailed] = useState(false);
  const title = recipe.display_title ?? recipe.title;
  const isFavorite = recipe.is_favorite === true;
  const list = variant === "list";

  const time =
    recipe.estimated_time_minutes != null
      ? formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })
      : null;
  const effort = recipe.effort_level ? t(`recipe.effort.${recipe.effort_level.toLowerCase()}`) : null;
  const cost = recipe.cost_estimate ? t(COST_I18N_KEYS[recipe.cost_estimate]) : null;
  const cooked = recipe.last_cooked_at ? t("recipe.cookedShort", { date: formatCookedDate(recipe.last_cooked_at, language) }) : null;
  const meta = [time, effort, cost, cooked].filter(Boolean) as string[];

  // Only special, required appliances ("Needs a stand mixer"), never basics (ADR 017).
  const needed = cardApplianceKeys(recipeAppliancesOf(recipe));
  const needs = needed.length > 0 ? t("appliances.needs", { names: needed.map((key) => t(applianceNameKey(key))).join(", ") }) : null;

  const origin = recipeOriginChip(recipe);
  const originLabel = origin === "invented" ? t("recipe.inventedChip") : origin === "written" ? t("recipeEditor.originChip") : null;

  // "TikTok", "Instagram"… or, for a website or a photo, the plain word.
  const source = recipeSource(recipe);
  const sourceLabel = source
    ? source.platform === "photo"
      ? t("web.library.sourcePhoto")
      : source.platform === "web"
        ? t("web.library.sourceWebsite")
        : source.name
    : null;

  const picture =
    recipe.image_url && !pictureFailed ? (
      // The pictures are already small thumbnails from other sites, so there is nothing for next/image to optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={recipe.image_url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setPictureFailed(true)}
        className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
      />
    ) : (
      <span className="grid h-full w-full place-items-center bg-element text-primary-text">
        <CookieMark size={list ? 28 : 44} />
      </span>
    );

  const buttons =
    onToggleFavorite || actions ? (
      <div
        className={cn(
          "z-10 flex items-center gap-0.5",
          list
            ? "relative shrink-0"
            : // One pill at the top corner; on a phone's narrow card, the heart at the top and the menu at the bottom.
              "pointer-events-none absolute inset-y-1.5 end-1.5 flex-col justify-between md:inset-y-auto md:end-2.5 md:top-2.5 md:flex-row md:rounded-btn md:bg-scrim/60 md:p-0.5 md:backdrop-blur-md",
        )}
      >
        {onToggleFavorite ? (
          <button
            type="button"
            data-track={`${trackId}.favorite`}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? t("a11y.removeRecipeFromFavorites", { name: title }) : t("a11y.addRecipeToFavorites", { name: title })}
            onClick={() => onToggleFavorite(recipe)}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl transition-colors active:scale-95 pointer-coarse:h-11 pointer-coarse:w-11",
              list ? "hover:bg-element" : cn(onPhotoButton, "hover:bg-on-scrim/15"),
            )}
          >
            <Heart
              aria-hidden
              className={cn(
                "h-5 w-5 transition-colors",
                list ? (isFavorite ? "fill-primary text-primary" : "text-muted") : isFavorite ? "fill-scrim-primary text-scrim-primary" : "text-on-scrim",
              )}
            />
          </button>
        ) : null}
        {actions ? (
          <RecipeActionsMenu
            recipe={recipe}
            title={title}
            actions={actions}
            trigger={
              <button
                type="button"
                data-track={`${trackId}.more`}
                aria-label={t("a11y.recipeActionsFor", { name: title })}
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-xl transition-colors active:scale-95 pointer-coarse:h-11 pointer-coarse:w-11",
                  list
                    ? "text-muted hover:bg-element hover:text-text data-[state=open]:bg-element"
                    : cn(onPhotoButton, "text-on-scrim hover:bg-on-scrim/15 data-[state=open]:bg-on-scrim/15"),
                )}
              >
                <MoreVertical aria-hidden className="h-5 w-5" />
              </button>
            }
          />
        ) : null}
      </div>
    ) : null;

  const link = (
    <Link
      href={href ?? `/recipe/${recipe.id}`}
      data-track={`${trackId}.open`}
      className="rounded-md outline-none after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:after:rounded-[22px] focus-visible:after:ring-2 focus-visible:after:ring-primary"
    >
      {title}
    </Link>
  );

  const facts = (
    <>
      {detail ? <p className="truncate text-xs text-muted">{detail}</p> : null}
      {originLabel ? (
        <span
          className={cn(
            "w-fit rounded-md px-2 py-0.5 text-[11px] font-bold",
            origin === "written" ? "bg-primary-soft text-primary-text" : "bg-accent-soft text-accent-text",
          )}
        >
          {originLabel}
        </span>
      ) : null}
      {meta.length > 0 ? <p className={cn("text-muted", list ? "text-[13px]" : "text-[13px] max-md:line-clamp-1 md:text-sm")}>{meta.join(" · ")}</p> : null}
      {needs ? <p className="truncate text-[13px] text-muted">{needs}</p> : null}
    </>
  );

  if (list) {
    return (
      <article
        className={cn(
          "group relative isolate flex h-full items-center gap-4 rounded-[22px] border border-border bg-surface p-2.5 pe-2 transition-colors hover:bg-element/60",
          // The browser skips painting rows that are off screen, which keeps a library of hundreds smooth.
          "[content-visibility:auto] [contain-intrinsic-size:auto_92px]",
        )}
      >
        <div className="h-18 w-18 shrink-0 overflow-hidden rounded-2xl bg-element">{picture}</div>
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="line-clamp-2 text-base leading-snug font-bold text-pretty text-text">{link}</h3>
          {facts}
        </div>
        {buttons}
      </article>
    );
  }

  return (
    <article className="group relative isolate flex h-full flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_300px]">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[18px] bg-element md:aspect-[4/3] md:rounded-[22px]">
        {picture}
        {sourceLabel ? (
          <span className="absolute start-2 top-2 max-w-[55%] truncate rounded-full bg-scrim/70 px-2.5 py-1.5 text-xs leading-none font-semibold text-on-scrim backdrop-blur-sm md:start-3 md:top-3 md:max-w-[60%]">
            {sourceLabel}
          </span>
        ) : null}
        {buttons}
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-1">
        <h3 className="line-clamp-2 text-[15px] leading-tight font-bold text-pretty text-text md:text-lg md:leading-snug">{link}</h3>
        {facts}
      </div>
    </article>
  );
}

export const RecipeCard = memo(RecipeCardBase);
