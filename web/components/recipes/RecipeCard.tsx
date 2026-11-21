"use client";

import { Heart, MoreVertical } from "lucide-react";
import Link from "next/link";
import { memo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { applianceNameKey, cardApplianceKeys } from "@shared/lib/applianceDisplay";
import { recipeAppliancesOf } from "@shared/lib/appliances";
import { COST_I18N_KEYS } from "@shared/lib/formatCostEstimate";
import { formatCookedDate } from "@shared/lib/formatCookedDate";
import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { recipeOriginChip } from "@shared/lib/recipeOrigin";
import type { Recipe } from "@shared/types/recipe";

import { CookieMark } from "@/components/CookieMark";
import { useLanguage } from "@/components/LanguageProvider";
import { RecipeActionsMenu, type RecipeActions } from "@/components/recipes/RecipeActionsMenu";
import { cn } from "@/lib/cn";

export type RecipeCardProps = {
  recipe: Recipe;
  /** `grid`: a card with a large picture. `list`: a compact row with a thumbnail. */
  variant?: "grid" | "list";
  /** The heart, when the card may be favorited. */
  onToggleFavorite?: (recipe: Recipe) => void;
  /** The "…" menu, when there is anything to do with the recipe. Leave out where it only opens (the Hub). */
  actions?: RecipeActions;
  /** An extra line under the title, e.g. who saved it. */
  detail?: ReactNode;
  /** Where the card leads. Defaults to the saved recipe's page; the Hub passes its own. */
  href?: string;
};

/**
 * One recipe, as a card or a row. The whole card is one link to the recipe, so it opens in a new tab with a
 * middle-click and is one stop for a screen reader; the heart and the menu sit above that link as their own
 * buttons. Shared by the Library and the Hub.
 */
function RecipeCardBase({ recipe, variant = "grid", onToggleFavorite, actions, detail, href }: RecipeCardProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
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

  const picture = recipe.image_url ? (
    // The pictures are already small thumbnails from other sites, so there is nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={recipe.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
  ) : (
    <span className="grid h-full w-full place-items-center bg-primary-soft text-primary">
      <CookieMark size={list ? 28 : 44} />
    </span>
  );

  return (
    <article
      className={cn(
        "group relative isolate h-full overflow-hidden border border-frosted-border bg-surface shadow-soft transition-[box-shadow,transform] duration-200",
        "hover:shadow-lift focus-within:shadow-lift motion-safe:hover:-translate-y-0.5",
        // The browser skips painting cards that are off screen, which keeps a library of hundreds smooth.
        "[content-visibility:auto]",
        list ? "flex items-center gap-4 rounded-2xl p-2.5 pe-2 [contain-intrinsic-size:auto_92px]" : "flex flex-col rounded-3xl [contain-intrinsic-size:auto_300px]",
      )}
    >
      <div className={cn("shrink-0 overflow-hidden bg-primary-soft", list ? "h-18 w-18 rounded-2xl" : "aspect-[16/10] w-full")}>{picture}</div>

      <div className={cn("min-w-0 flex-1", list ? "py-0.5" : "flex flex-col gap-1.5 p-4")}>
        <h3 className={cn("font-bold text-text text-pretty", list ? "line-clamp-2 text-base leading-snug" : "line-clamp-3 text-[17px] leading-snug")}>
          <Link
            href={href ?? `/recipe/${recipe.id}`}
            className="rounded-md outline-none after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-primary"
          >
            {title}
          </Link>
        </h3>
        {detail ? <p className="truncate text-xs text-muted">{detail}</p> : null}
        {originLabel ? (
          <span
            className={cn(
              "w-fit rounded-full px-2 py-0.5 text-[11px] font-bold",
              origin === "written" ? "bg-primary-soft text-primary" : "bg-accent-soft text-accent",
            )}
          >
            {originLabel}
          </span>
        ) : null}
        {meta.length > 0 ? <p className="text-[13px] text-muted">{meta.join(" · ")}</p> : null}
        {needs ? <p className="truncate text-[13px] text-muted">{needs}</p> : null}
      </div>

      {onToggleFavorite || actions ? (
        <div
          className={cn(
            "relative z-10 flex items-center gap-0.5",
            list ? "shrink-0" : "absolute end-2.5 top-2.5 rounded-full bg-frosted p-0.5 backdrop-blur-md",
          )}
        >
          {onToggleFavorite ? (
            <button
              type="button"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? t("a11y.removeRecipeFromFavorites", { name: title }) : t("a11y.addRecipeToFavorites", { name: title })}
              onClick={() => onToggleFavorite(recipe)}
              className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-element active:scale-95"
            >
              <Heart aria-hidden className={cn("h-5 w-5 transition-colors", isFavorite ? "fill-primary text-primary" : "text-muted")} />
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
                  aria-label={t("a11y.recipeActionsFor", { name: title })}
                  className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-element hover:text-text active:scale-95 data-[state=open]:bg-element"
                >
                  <MoreVertical aria-hidden className="h-5 w-5" />
                </button>
              }
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export const RecipeCard = memo(RecipeCardBase);
