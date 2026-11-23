"use client";

import { Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatRecipeDuration } from "@shared/lib/formatRecipeDuration";
import { filterAndSortRecipes } from "@shared/lib/recipeListQuery";
import type { RecipeCollection } from "@shared/types/collection";
import type { Recipe } from "@shared/types/recipe";

import { RecipeThumb } from "@/components/cookbook/RecipeThumb";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { TileLabel } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { addAllToBook, removeFromBook, toggleInBook } from "@/lib/cookbook/bookSelection";

export const recipeTitle = (recipe: Recipe) => recipe.display_title?.trim() || recipe.title;

/**
 * Every saved recipe, A to Z, to pick for the book: search, or narrow to a collection and add all of it at once.
 * A picked recipe shows its place in the book where its tick would be, so the order is visible while picking.
 */
export function RecipePicker({
  recipes,
  collections,
  selectedIds,
  onChange,
  loadingMore = false,
  initialCollectionId = null,
}: {
  recipes: Recipe[];
  collections: RecipeCollection[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** The rest of the library is still on its way. */
  loadingMore?: boolean;
  initialCollectionId?: string | null;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [collectionId, setCollectionId] = useState<string | null>(initialCollectionId);
  const activeCollection = collections.find((collection) => collection.id === collectionId) ?? null;

  const allowlist = useMemo(() => (activeCollection ? new Set(activeCollection.recipeIds) : null), [activeCollection]);
  const shown = useMemo(
    () => filterAndSortRecipes(recipes, { searchQuery: deferredSearch, sort: "title_asc", recipeIdAllowlist: allowlist }),
    [allowlist, deferredSearch, recipes],
  );
  const position = useMemo(() => new Map(selectedIds.map((id, index) => [id, index + 1])), [selectedIds]);
  const shownIds = shown.map((recipe) => recipe.id);
  const allShownIn = shownIds.length > 0 && shownIds.every((id) => position.has(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && search) {
              event.preventDefault();
              setSearch("");
            }
          }}
          aria-label={t("a11y.searchRecipes")}
          placeholder={t("list.searchRecipes")}
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-btn border border-border bg-surface ps-12 pe-12 text-base text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {search ? (
          <IconButton
            trackId="select_recipes.search.clear"
            onClick={() => setSearch("")}
            label={t("a11y.clearSearch")}
            tooltip={false}
            icon={<X aria-hidden className="h-[18px] w-[18px]" />}
            className="absolute end-0.5 top-0.5"
          />
        ) : null}
      </div>

      {collections.length > 0 ? (
        // On a phone the chips scroll sideways, out to the tile's edges. The padding leaves room for a focus outline.
        <div
          role="group"
          aria-label={t("library.collections")}
          className="scroll-row -mx-5 -my-1 flex items-center gap-2 px-5 py-1 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        >
          <TileLabel as="span" className="me-1 shrink-0">
            {t("library.collections")}
          </TileLabel>
          <Chip trackId="select_recipes.collection.all" selected={collectionId == null} aria-label={t("a11y.allCollections")} onClick={() => setCollectionId(null)}>
            {t("library.allCollections")}
          </Chip>
          {collections.map((collection) => {
            const on = collection.id === collectionId;
            return (
              <Chip
                key={collection.id}
                trackId="select_recipes.collection.select"
                selected={on}
                onClick={() => setCollectionId(on ? null : collection.id)}
                className="max-w-56"
              >
                <span className="truncate">{collection.name}</span>
              </Chip>
            );
          })}
        </div>
      ) : null}

      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p aria-live="polite" className="text-sm font-semibold text-muted">
          {selectedIds.length > 0
            ? t("addToList.selected", { selected: selectedIds.length, total: recipes.length })
            : t("list.recipesVisible", { count: shown.length })}
        </p>
        <div className="flex items-center gap-1">
          {loadingMore ? <Spinner className="me-2" /> : null}
          {shownIds.length > 0 ? (
            allShownIn ? (
              <Button variant="ghost" size="sm" trackId="cookbook.picker.remove_shown" onClick={() => onChange(removeFromBook(selectedIds, shownIds))}>
                {t("list.clearSelection")}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" trackId="cookbook.picker.add_shown" onClick={() => onChange(addAllToBook(selectedIds, shownIds))}>
                {t("list.selectAll")}
                <span className="tabular-nums opacity-80">({shownIds.length})</span>
              </Button>
            )
          ) : null}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-element px-6 py-12 text-center text-[15px] text-muted">
          {recipes.length === 0 ? t("list.noRecipesYet") : t("list.noRecipesMatch")}
        </p>
      ) : (
        <ul className="-mx-2 grid gap-1 xl:grid-cols-2 xl:gap-x-3" aria-label={t("cookbook.pickStepTitle")}>
          {shown.map((recipe) => (
            <PickerRow
              key={recipe.id}
              recipe={recipe}
              position={position.get(recipe.id) ?? null}
              onToggle={() => onChange(toggleInBook(selectedIds, recipe.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PickerRow({ recipe, position, onToggle }: { recipe: Recipe; position: number | null; onToggle: () => void }) {
  const { t } = useTranslation();
  const on = position != null;
  const title = recipeTitle(recipe);
  const count = recipe.ingredients?.length ?? 0;
  const time =
    recipe.estimated_time_minutes != null && recipe.estimated_time_minutes > 0
      ? formatRecipeDuration(recipe.estimated_time_minutes, { minutes: t("recipe.durationMin"), hours: t("recipe.durationHr") })
      : null;
  const ingredients = t("list.ingredientCount", { count });
  const meta = [time, ingredients].filter(Boolean).join(" · ");
  return (
    // Off-screen rows are not painted, so a library of hundreds scrolls smoothly.
    <li className="[contain-intrinsic-size:auto_68px] [content-visibility:auto]">
      <button
        type="button"
        role="checkbox"
        data-track="select_recipes.recipe.toggle"
        aria-checked={on}
        aria-label={`${title}, ${meta}`}
        onClick={onToggle}
        className={cn(
          // The row is painted only inside its own box (content-visibility), so the focus outline is drawn inside it.
          "flex min-h-[68px] w-full items-center gap-3 rounded-2xl p-2 text-start transition-colors focus-visible:-outline-offset-2",
          on ? "bg-element hover:bg-selected" : "hover:bg-element active:bg-selected",
        )}
      >
        {/* A tick box that shows the recipe's place in the book once picked; it widens for "100". */}
        <span
          aria-hidden
          className={cn(
            "grid h-5 min-w-5 shrink-0 place-items-center rounded-md border-2 px-px text-[11px] leading-none font-bold tabular-nums transition-colors",
            on ? "border-primary bg-primary text-on-primary" : "border-muted/60 bg-surface",
          )}
        >
          {on ? position : null}
        </span>
        <RecipeThumb src={recipe.image_url} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold text-text">{title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">{meta}</span>
        </span>
      </button>
    </li>
  );
}
