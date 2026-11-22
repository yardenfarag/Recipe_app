"use client";

import { Play, Plus, Shuffle } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { recipeSource } from "@shared/lib/recipeSource";
import type { CookedRecipe } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import { CookieMark } from "@/components/CookieMark";
import { PhotoTile, Tile, TileBadge, TileLabel, tileClasses } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { cookAlongVideoFor } from "@/lib/cook/cookAlongVideo";
import { servingsText } from "@/lib/recipe/servingsText";
import { useShoppingList } from "@/lib/list/useShoppingList";

const onPhotoButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-btn bg-on-scrim/15 text-[15px] font-semibold text-on-scrim backdrop-blur-sm transition-colors hover:bg-on-scrim/25 active:bg-on-scrim/30";

/**
 * The top of the Library (PIN-161): what to cook tonight, the way into Snap, the shopping list and what was cooked
 * this week, as a bento of tiles. Four columns on a desktop, three on a tablet (Snap becomes a strip underneath),
 * and on a phone the pick at full width with the list and the cooked count side by side under it.
 */
export function KitchenTiles({ pick, onAnother, cooked }: { pick: Recipe | null; onAnother: (() => void) | null; cooked: CookedRecipe[] }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("web.library.kitchenTiles")}
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:grid-rows-[190px_190px_auto] md:gap-4 lg:grid-cols-4 lg:grid-rows-[190px_190px]"
    >
      {pick ? (
        <TonightTile recipe={pick} onAnother={onAnother} className="col-span-2 h-[300px] md:col-start-1 md:row-span-2 md:row-start-1 md:h-auto" />
      ) : (
        <Tile tone="element" className="col-span-2 h-[300px] md:col-start-1 md:row-span-2 md:row-start-1 md:h-auto" />
      )}
      <SnapTile className="hidden md:col-span-3 md:row-start-3 md:flex lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1" />
      <ListTile className="md:col-start-3 md:row-start-2 lg:col-start-4" />
      <CookedTile cooked={cooked} className="md:col-start-3 md:row-start-1 lg:col-start-4" />
    </section>
  );
}

/** Grey outlines of the tiles while the library loads, so the page doesn't jump when they arrive. */
export function KitchenTilesSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-2 gap-3 motion-safe:animate-pulse md:grid-cols-3 md:grid-rows-[190px_190px_auto] md:gap-4 lg:grid-cols-4 lg:grid-rows-[190px_190px]"
    >
      <div className="col-span-2 h-[300px] rounded-tile bg-element md:row-span-2 md:h-auto" />
      <div className="hidden rounded-tile bg-element md:col-span-3 md:row-start-3 md:block md:h-24 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:h-auto" />
      <div className="h-24 rounded-tile bg-element md:col-start-3 md:row-start-2 md:h-auto lg:col-start-4" />
      <div className="h-24 rounded-tile bg-element md:col-start-3 md:row-start-1 md:h-auto lg:col-start-4" />
    </div>
  );
}

/** Tonight's pick: the photo, the name, how long and where it came from, and the ways to start. */
function TonightTile({ recipe, onAnother, className }: { recipe: Recipe; onAnother: (() => void) | null; className?: string }) {
  const { t } = useTranslation();
  const headingId = useId();
  const title = recipe.display_title ?? recipe.title;
  const video = cookAlongVideoFor({ original_url: recipe.original_url, platform: recipe.platform, source_video_url: recipe.source_video_url });

  const source = recipeSource(recipe);
  const sourceText = source
    ? source.platform === "photo"
      ? t("web.library.savedFromPhoto")
      : t("web.library.savedFrom", { source: [source.name ?? t("web.library.sourceWebsite"), source.handle].filter(Boolean).join(" ") })
    : null;
  const meta = [
    recipe.estimated_time_minutes != null
      ? formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })
      : null,
    servingsText(t, recipe.servings),
    sourceText,
  ].filter(Boolean) as string[];

  const recipeHref = `/recipe/${recipe.id}`;
  // A long name gets smaller type, so three lines of it still leave room for the buttons.
  const long = title.length > 26;

  return (
    <PhotoTile
      as="section"
      aria-labelledby={headingId}
      src={recipe.image_url}
      fallback={<CookieMark size={88} />}
      fade="strong"
      className={className}
      contentClassName="gap-2 p-[18px] md:gap-3 md:p-7"
      data-testid="tonights-pick"
    >
      {/* The whole photo opens the recipe. The link is named by the heading under it, not by repeating the name. */}
      <Link
        href={recipeHref}
        data-track="library.tonight.open"
        aria-label={t("web.library.openRecipe")}
        aria-describedby={headingId}
        className="absolute inset-0 rounded-tile outline-offset-[-3px]"
      />
      <TileBadge tone="photo" className="text-[11px] md:text-xs">
        {t("web.library.tonightsPick")}
      </TileBadge>
      <h2
        id={headingId}
        className={cn(
          "line-clamp-3 font-bold text-balance text-on-scrim",
          "leading-[0.98] tracking-[-0.03em] rtl:leading-[1.15] rtl:tracking-normal",
          long ? "text-[28px] md:text-4xl xl:text-5xl" : "text-[40px] md:text-5xl xl:text-[64px]",
        )}
      >
        {/* Isolated, so an English name in the Hebrew app keeps its own reading order but lines up with the rest. */}
        <bdi>{title}</bdi>
      </h2>
      <p className="text-[13px] text-on-scrim-muted md:text-[15px]">{meta.join(" · ")}</p>
      <div className="relative z-10 mt-1 flex gap-2 md:flex-wrap md:gap-2.5">
        <Link
          href={`${recipeHref}?cook=1`}
          data-track="library.tonight.start_cooking"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-btn bg-on-scrim px-[22px] font-display text-[15px] font-bold text-scrim transition-[filter] hover:brightness-95 active:brightness-90 md:flex-none"
        >
          {t("web.library.startCooking")}
        </Link>
        {video?.embedUrl ? (
          <Link
            href={`${recipeHref}?video=1`}
            data-track="library.tonight.cook_along"
            aria-label={t("web.library.cookAlongVideo")}
            title={t("web.library.cookAlongVideo")}
            className={cn(onPhotoButton, "w-12 md:w-auto md:px-5")}
          >
            <Play aria-hidden className="h-4 w-4 fill-current" />
            <span className="max-md:hidden">{t("web.library.cookAlongVideo")}</span>
          </Link>
        ) : null}
        {onAnother ? (
          <button
            type="button"
            data-track="library.tonight.another"
            aria-label={t("web.library.showAnother")}
            title={t("web.library.showAnother")}
            onClick={onAnother}
            className={cn(onPhotoButton, "w-12 xl:w-auto xl:px-5")}
          >
            <Shuffle aria-hidden className="h-[18px] w-[18px]" />
            <span className="max-xl:hidden">{t("web.library.showAnother")}</span>
          </button>
        ) : null}
      </div>
    </PhotoTile>
  );
}

/** The one tile in the brand colour: the way into Snap. */
function SnapTile({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href="/add"
      data-track="library.snap_tile"
      className={tileClasses({
        tone: "primary",
        className: cn("items-center gap-5 p-6 transition-[filter] hover:brightness-105 active:brightness-95 lg:flex-col lg:items-start lg:justify-between lg:p-[26px]", className),
      })}
    >
      <Plus aria-hidden className="h-10 w-10 shrink-0 lg:h-14 lg:w-14" strokeWidth={2} />
      <span className="min-w-0">
        <span className="block font-display text-[26px] leading-none font-bold tracking-[-0.02em] rtl:leading-tight rtl:tracking-normal xl:text-[34px]">
          {t("web.library.snapNewTitle")}
        </span>
        <span className="mt-2 block text-[15px] leading-snug lg:mt-2.5">{t("web.library.snapNewBody")}</span>
      </span>
    </Link>
  );
}

/** How many recipes were cooked in the last seven days, with the photos of the latest three. */
function CookedTile({ cooked, className }: { cooked: CookedRecipe[]; className?: string }) {
  const { t } = useTranslation();
  const headingId = useId();
  const faces = cooked.slice(0, 3);
  return (
    <Tile as="section" aria-labelledby={headingId} data-testid="cooked-this-week" className={cn("flex min-w-0 items-center justify-between gap-3 p-3.5 md:flex-col md:items-stretch md:p-[22px]", className)}>
      <TileLabel as="h2" id={headingId} className="text-[11px] md:text-[13px]">
        {t("web.library.cookedThisWeek")}
      </TileLabel>
      <div className="flex items-end justify-between gap-3">
        <span className="font-display text-4xl leading-none font-bold text-accent-text tabular-nums md:text-6xl">
          <span aria-hidden>{cooked.length}</span>
          <span className="sr-only">{t("web.library.cookedThisWeekCount", { count: cooked.length })}</span>
        </span>
        {faces.length > 0 ? (
          <ul aria-hidden className="flex max-md:hidden">
            {faces.map((recipe, index) => (
              <li key={recipe.id} className={cn("h-11 w-11 overflow-hidden rounded-full border-[3px] border-surface bg-element", index > 0 && "-ms-3.5")}>
                {recipe.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={recipe.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-primary-text">
                    <CookieMark size={18} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Tile>
  );
}

/**
 * The shopping list in a tile: how many items are left and the first three, which can be ticked off right here.
 * A ticked item stays, struck through, until the page is opened again, so the rows don't jump under the finger.
 * On a phone it is a one-line summary that opens the list.
 */
function ListTile({ className }: { className?: string }) {
  const { t } = useTranslation();
  const headingId = useId();
  const { items, loading, toggleChecked } = useShoppingList();
  const [pinned, setPinned] = useState<string[] | null>(null);
  // The first three waiting items, fixed when the list arrives (the React pattern for state from loaded data).
  if (!loading && pinned === null) setPinned(items.filter((item) => !item.checked).slice(0, 3).map((item) => item.id));

  const left = items.filter((item) => !item.checked);
  const shown = (pinned ?? []).map((id) => items.find((item) => item.id === id)).filter((item) => item != null);
  const shownIds = new Set(shown.map((item) => item.id));
  const more = left.filter((item) => !shownIds.has(item.id)).length;
  const label = left.length > 0 ? t("web.library.listLeft", { count: left.length }) : t("tabs.list");
  const summary =
    left.length > 0
      ? [...left.slice(0, 2).map((item) => item.name), left.length > 2 ? t("web.library.listMore", { count: left.length - 2 }) : null].filter(Boolean).join(", ")
      : items.length > 0
        ? t("web.library.listDone")
        : t("web.library.listEmpty");

  return (
    <Tile as="section" aria-labelledby={headingId} data-testid="list-tile" className={cn("relative flex min-w-0 flex-col gap-1.5 p-3.5 md:gap-2.5 md:p-[22px]", className)}>
      <TileLabel as="h2" id={headingId} className="text-[11px] md:text-[13px]">
        {/* On a phone the whole tile opens the list. */}
        <Link href="/list" data-track="library.list_tile.open" aria-label={`${label}. ${t("web.library.listOpen")}`} className="rounded-sm hover:text-text max-md:after:absolute max-md:after:inset-0 max-md:after:rounded-tile">
          {label}
        </Link>
      </TileLabel>

      <p className="line-clamp-2 text-sm leading-snug font-semibold text-text md:hidden">{loading ? " " : summary}</p>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden max-md:hidden">
        {loading ? null : shown.length > 0 ? (
          <ul className="flex flex-col">
            {shown.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-[15px] leading-tight">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    data-track="library.list_tile.toggle"
                    onChange={() => void toggleChecked(item.id)}
                    className="h-[18px] w-[18px] shrink-0"
                  />
                  <span dir="auto" className={cn("truncate", item.checked ? "text-muted line-through" : "text-text")}>
                    {item.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-snug text-muted">{items.length > 0 ? t("web.library.listDone") : t("web.library.listEmpty")}</p>
        )}
        {more > 0 ? (
          <Link href="/list" data-track="library.list_tile.more" className="mt-auto w-fit rounded-sm text-[13px] font-semibold text-primary-text underline-offset-4 hover:underline">
            {t("web.library.listMore", { count: more })}
          </Link>
        ) : null}
      </div>
    </Tile>
  );
}
