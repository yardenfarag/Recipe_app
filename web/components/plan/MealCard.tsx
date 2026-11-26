"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, Lock, LockOpen, MoreHorizontal, Plus, Shuffle } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import type { PlanReason } from "@shared/lib/mealPlan/fillWeek";
import type { MealPlanEntry, PlanMeal } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";

import { CookieMark } from "@/components/CookieMark";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

const menuItemClass =
  "relative flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[15px] text-text outline-none pointer-coarse:h-11 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-element";

export type MealCardProps = {
  meal: PlanMeal;
  entry: MealPlanEntry | null;
  recipe: Recipe | null;
  /** "Leftovers from Thu" or the reason it was picked. */
  note: string | null;
  /** "You have 5 of 7", when known. */
  have: string | null;
  tonight?: boolean;
  /** Earlier days of this week and past weeks: look, don't change. */
  readOnly?: boolean;
  busy?: boolean;
  /** "week": a tile with the photo on top; "row": photo at the start, for the day-by-day list. */
  layout: "week" | "row";
  onLock: () => void;
  onShuffle: () => void;
  onCooked: () => void;
  onRemove: () => void;
  onFill: () => void;
};

/** One meal of the plan: the recipe with its photo, time and why it was picked, or an empty meal to fill. */
export function MealCard(props: MealCardProps) {
  const { t } = useTranslation();
  const { entry, recipe, meal, layout } = props;
  const mealName = t(`plan.meals.${meal}`);

  if (!entry && props.readOnly) {
    // A day that has passed with nothing planned: a quiet gap, not a call to action.
    return (
      <span className="block h-full min-h-24 rounded-card bg-element/40">
        <span className="sr-only">{`${mealName}: ${t("plan.empty")}`}</span>
      </span>
    );
  }

  if (!entry) {
    return (
      <button
        type="button"
        data-track="plan.meal.fill_one"
        disabled={props.readOnly || props.busy}
        onClick={props.onFill}
        aria-label={`${mealName}: ${t("plan.addMeal")}`}
        className={cn(
          "grid min-h-24 w-full place-items-center gap-1 rounded-card border-[1.5px] border-dashed border-border p-3 text-center text-sm font-semibold text-primary-text transition-colors hover:bg-element disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent",
          layout === "week" ? "h-full" : "",
        )}
      >
        <span className="flex flex-col items-center gap-1">
          {props.readOnly ? null : <Plus aria-hidden className="h-5 w-5" />}
          {props.readOnly ? t("plan.empty") : t("plan.addMeal")}
        </span>
      </button>
    );
  }

  const leftover = entry.leftoverOf != null;
  const cooked = entry.cookedAt != null;
  const title = recipe ? recipe.display_title?.trim() || recipe.title : "…";
  const minutes = recipe?.estimated_time_minutes;
  const editable = !props.readOnly && !cooked;

  const photo = (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden bg-element",
        layout === "week" ? "aspect-[16/10] w-full" : "h-20 w-20 rounded-2xl",
        (cooked || leftover) && "opacity-55",
      )}
    >
      {recipe?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={recipe.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-primary-text">
          <CookieMark size={22} />
        </span>
      )}
    </span>
  );

  return (
    <article
      aria-label={`${mealName}: ${title}`}
      className={cn(
        "relative flex min-w-0 overflow-hidden rounded-card bg-surface",
        layout === "week" ? "h-full flex-col" : "items-center gap-3 p-2.5",
        props.tonight ? "border-2 border-primary" : leftover ? "border-[1.5px] border-dashed border-border bg-element/40" : "border border-border",
      )}
    >
      {layout === "week" ? photo : <Link href={`/recipe/${entry.recipeId}`} data-track="plan.meal.open_photo" tabIndex={-1} aria-hidden>{photo}</Link>}

      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", layout === "week" ? "p-2.5 pt-2" : "pe-24")}>
        {layout === "row" ? <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{mealName}</span> : null}
        {props.tonight ? <span className="text-[11px] font-semibold tracking-wide text-primary-text uppercase">{t("plan.tonight")}</span> : null}
        <Link
          href={`/recipe/${entry.recipeId}`}
          data-track="plan.meal.open"
          className={cn("line-clamp-2 text-[13.5px] leading-snug font-semibold text-text hover:underline", cooked && "text-muted")}
        >
          {title}
        </Link>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {cooked ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
              {t("plan.cooked")}
            </span>
          ) : leftover ? (
            <span className="font-semibold text-success">{t("plan.nothingToBuy")}</span>
          ) : (
            <>
              {minutes ? <span>{`${minutes} ${t("recipe.durationMin")}`}</span> : null}
              {props.have ? <span>{props.have}</span> : null}
            </>
          )}
        </span>
        {props.note && !cooked ? (
          <span className="mt-auto self-start rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">{props.note}</span>
        ) : null}
      </div>

      {props.readOnly ? null : (
        <div className={cn("absolute flex gap-0.5", layout === "week" ? "end-1 top-1" : "end-1.5 top-1/2 -translate-y-1/2")}>
          {editable && !leftover ? (
            <>
              <IconButton
                variant={layout === "week" ? "photo" : "ghost"}
                className={cn("h-9 w-9", entry.locked && "bg-primary text-on-primary hover:bg-primary")}
                label={entry.locked ? t("plan.actions.unlock", { title }) : t("plan.actions.lock", { title })}
                aria-pressed={entry.locked}
                trackId={entry.locked ? "plan.meal.unlock" : "plan.meal.lock"}
                icon={entry.locked ? <Lock aria-hidden className="h-4 w-4" /> : <LockOpen aria-hidden className="h-4 w-4" />}
                onClick={props.onLock}
              />
              <IconButton
                variant={layout === "week" ? "photo" : "ghost"}
                className="h-9 w-9"
                label={t("plan.actions.shuffle", { title })}
                trackId="plan.meal.shuffle"
                disabled={entry.locked || props.busy}
                icon={<Shuffle aria-hidden className="h-4 w-4 rtl:-scale-x-100" />}
                onClick={props.onShuffle}
              />
            </>
          ) : null}
          <Menu.Root>
            <Menu.Trigger asChild>
              <IconButton
                variant={layout === "week" ? "photo" : "ghost"}
                className="h-9 w-9"
                label={t("plan.actions.more", { title })}
                trackId="plan.meal.more"
                icon={<MoreHorizontal aria-hidden className="h-4 w-4" />}
              />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-2xl border border-border bg-surface p-1.5 shadow-lift">
                <Menu.Item asChild className={menuItemClass}>
                  <Link href={`/recipe/${entry.recipeId}`} data-track="plan.meal.menu_open">
                    {t("plan.actions.open")}
                  </Link>
                </Menu.Item>
                {leftover ? null : (
                  <Menu.Item className={menuItemClass} data-track={cooked ? "plan.meal.not_cooked" : "plan.meal.cooked"} onSelect={props.onCooked}>
                    {cooked ? t("plan.actions.markNotCooked") : t("plan.actions.markCooked")}
                  </Menu.Item>
                )}
                <Menu.Item className={cn(menuItemClass, "text-danger")} data-track="plan.meal.remove" onSelect={props.onRemove}>
                  {t("plan.actions.remove")}
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}
    </article>
  );
}

/** The text for a reason the planner gave, or null when it has nothing worth saying. */
export function reasonText(reason: PlanReason | undefined, t: (key: string, options?: Record<string, unknown>) => string, dayName: (date: string) => string): string | null {
  if (!reason) return null;
  switch (reason.key) {
    case "usesPantry":
      return t("plan.reason.usesPantry", { item: reason.item });
    case "sharesWith":
      return t("plan.reason.sharesWith", { item: reason.item, day: dayName(reason.date) });
    case "quick":
      return t("plan.reason.quick", { minutes: reason.minutes });
    case "fitsDiet":
      return t("plan.reason.fitsDiet", { diet: t(`recipe.variants.${reason.diet}.label`) });
    case "leftovers":
      return t("plan.reason.leftovers", { day: dayName(reason.date) });
    case "batch":
      return t("plan.reason.batch", { day: dayName(reason.date) });
    case "notCookedFor":
      return t("plan.reason.notCookedFor");
    default:
      return t(`plan.reason.${reason.key}`);
  }
}
