"use client";

import { Check, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { resolveCulinaryLanguage } from "@shared/lib/culinaryUnits";
import { filterAndSortRecipes } from "@shared/lib/recipeListQuery";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import { showToast } from "@shared/lib/toast";
import { translateAppError } from "@shared/lib/translateAppError";
import type { RecipeCollection } from "@shared/types/collection";
import type { Recipe } from "@shared/types/recipe";
import type { ShoppingListIncomingItem } from "@shared/types/shoppingList";

import { useLanguage } from "@/components/LanguageProvider";
import { IngredientPicker, type IngredientSection } from "@/components/list/IngredientPicker";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { useCollections } from "@/lib/library/useCollections";
import { useRecipes } from "@/lib/library/useRecipes";
import { ingredientChoices, initialSelection } from "@/lib/list/ingredientChoices";
import type { AddToListResult } from "@/lib/list/shoppingListSync";
import { usePantryStaples } from "@/lib/list/usePantryStaples";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";

const recipeTitle = (recipe: Recipe) => recipe.display_title?.trim() || recipe.title;

/**
 * "From recipes": pick saved recipes (search and collections help find them), then tick which of their ingredients
 * to buy, with what is kept at home unticked. Matching name and unit stack into one line, as on mobile.
 */
export function AddFromRecipesDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (items: ShoppingListIncomingItem[]) => Promise<AddToListResult>;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <Body onAdd={onAdd} onDone={() => onOpenChange(false)} /> : null}</Dialog>;
}

function Body({ onAdd, onDone }: { onAdd: (items: ShoppingListIncomingItem[]) => Promise<AddToListResult>; onDone: () => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { system } = useMeasurementSystem();
  const { units } = useUnitSystem();
  const { recipes, loading, error, hasMore, refresh, ensureAllLoaded } = useRecipes(40);
  const { collections } = useCollections();
  const { staples, isStaple, keepStaple } = usePantryStaples();
  const [step, setStep] = useState<"recipes" | "ingredients">("recipes");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Picking from the whole library, not only the first page.
  useEffect(() => {
    if (hasMore) void ensureAllLoaded();
  }, [ensureAllLoaded, hasMore]);

  const sections: IngredientSection[] = useMemo(
    () =>
      selectedIds
        .map((id) => recipes.find((recipe) => recipe.id === id))
        .filter((recipe): recipe is Recipe => Boolean(recipe))
        .map((recipe) => ({
          id: recipe.id,
          title: recipeTitle(recipe),
          choices: ingredientChoices(recipe.ingredients ?? [], {
            system,
            unitLanguage: resolveCulinaryLanguage(resolveRecipeSourceLanguage(recipe), language),
            recipeId: recipe.id,
            units,
          }),
        }))
        .filter((section) => section.choices.length > 0),
    [language, recipes, selectedIds, system, units],
  );
  const allChoices = sections.flatMap((section) => section.choices);
  const pickedCount = allChoices.filter((choice) => selection.has(choice.key)).length;

  function goToIngredients() {
    setSelection(initialSelection(allChoices, staples ?? []));
    setSaveError(null);
    setStep("ingredients");
  }

  async function add() {
    const picked = allChoices.filter((choice) => selection.has(choice.key)).map((choice) => choice.item);
    if (picked.length === 0) {
      setSaveError(t("addToList.pickOne"));
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const result = await onAdd(picked);
      showToast(
        t("list.fromRecipesSuccessBody", { recipes: sections.length, added: result.addedCount, merged: result.mergedCount }),
      );
      onDone();
    } catch (caught) {
      setSaveError(translateAppError(caught, t, "list.fromRecipesFailed"));
    } finally {
      setBusy(false);
    }
  }

  const footer =
    step === "recipes" ? (
      <>
        <DialogClose asChild>
          <Button variant="ghost" trackId="shopping_list_from_recipes.cancel">{t("common.cancel")}</Button>
        </DialogClose>
        <Button trackId="shopping_list_from_recipes.choose_ingredients" disabled={selectedIds.length === 0 || staples == null} onClick={goToIngredients}>
          {t("web.list.chooseIngredients")}
          {selectedIds.length > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-on-primary/20 px-1.5 text-xs tabular-nums">{selectedIds.length}</span>
          ) : null}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" trackId="shopping_list_from_recipes.back" disabled={busy} onClick={() => setStep("recipes")}>
          {t("common.back")}
        </Button>
        <Button trackId="shopping_list_from_recipes.confirm" busy={busy} disabled={pickedCount === 0} onClick={() => void add()}>
          {t(pickedCount === 1 ? "addToList.addOne" : "addToList.addOther", { count: pickedCount })}
        </Button>
      </>
    );

  return (
    <DialogContent
      title={step === "recipes" ? t("list.fromRecipesTitle") : t("web.list.chooseIngredients")}
      description={step === "recipes" ? t("list.fromRecipesHint") : undefined}
      className="max-w-2xl"
      footer={footer}
    >
      {step === "recipes" ? (
        loading ? (
          <LoadingState className="min-h-64" label={t("a11y.loadingRecipes")} />
        ) : error && recipes.length === 0 ? (
          <ErrorState className="py-8" title={t("library.loadFailedTitle")} trackId="select_recipes.load_error" onRetry={() => void refresh()} />
        ) : (
          <RecipeChooser recipes={recipes} collections={collections} selectedIds={selectedIds} onChange={setSelectedIds} />
        )
      ) : (
        <>
          <div className="-mx-2 max-h-[min(60dvh,32rem)] overflow-y-auto px-2">
            <IngredientPicker
              sections={sections}
              selected={selection}
              onChange={setSelection}
              isStaple={isStaple}
              onKeepStaple={(choice) => {
                const next = new Set(selection);
                // The same ingredient in another chosen recipe is kept at home too.
                for (const other of allChoices) if (other.name.trim().toLowerCase() === choice.name.trim().toLowerCase()) next.delete(other.key);
                setSelection(next);
                keepStaple(choice.name).catch(() => showToast(t("settings.kitchenSaveFailed"), "info"));
              }}
            />
          </div>
          {saveError ? (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {saveError}
            </p>
          ) : null}
        </>
      )}
    </DialogContent>
  );
}

function toggleOrderedId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/** Search, collection chips and a ticked list of recipes. The order they are ticked is the order they are added. */
function RecipeChooser({
  recipes,
  collections,
  selectedIds,
  onChange,
}: {
  recipes: Recipe[];
  collections: RecipeCollection[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const allowlist = useMemo(() => {
    if (!collectionId) return null;
    return new Set(collections.find((collection) => collection.id === collectionId)?.recipeIds ?? []);
  }, [collectionId, collections]);

  const shown = useMemo(
    () => filterAndSortRecipes(recipes, { searchQuery: deferredSearch, sort: "title_asc", recipeIdAllowlist: allowlist }),
    [allowlist, deferredSearch, recipes],
  );
  const shownIds = shown.map((recipe) => recipe.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selectedIds.includes(id));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t("a11y.searchRecipes")}
          placeholder={t("list.searchRecipes")}
          autoComplete="off"
          autoFocus
          className="h-11 w-full rounded-2xl border border-border bg-surface ps-10 pe-10 text-[15px] text-text placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {search ? (
          <button
            type="button"
            data-track="select_recipes.search.clear"
            onClick={() => setSearch("")}
            aria-label={t("a11y.clearSearch")}
            className="absolute end-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-element hover:text-text"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {collections.length > 0 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[{ id: null, name: t("list.allCollections") }, ...collections].map((collection) => {
            const on = collectionId === collection.id;
            return (
              <button
                key={collection.id ?? "all"}
                type="button"
                data-track={collection.id ? "select_recipes.collection.select" : "select_recipes.collection.all"}
                aria-pressed={on}
                aria-label={collection.id ? undefined : t("a11y.allCollections")}
                onClick={() => setCollectionId(on && collection.id ? null : collection.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors",
                  on ? "bg-primary text-on-primary" : "bg-element text-text hover:bg-selected",
                )}
              >
                {collection.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-sm">
        <p aria-live="polite" className="font-semibold text-muted">
          {selectedIds.length > 0
            ? t("addToList.selected", { selected: selectedIds.length, total: recipes.length })
            : t("list.recipesVisible", { count: shown.length })}
        </p>
        <div className="flex items-center gap-1">
          {selectedIds.length > 0 ? (
            <button
              type="button"
              data-track="select_recipes.selection.clear"
              onClick={() => onChange([])}
              aria-label={t("a11y.clearSelectedRecipes")}
              className="rounded-full px-2 py-1 font-semibold text-muted hover:bg-element hover:text-text"
            >
              {t("list.clearSelection")}
            </button>
          ) : null}
          {!allShownSelected && shownIds.length > 0 ? (
            <button
              type="button"
              data-track="select_recipes.select_all_visible"
              onClick={() => onChange([...selectedIds, ...shownIds.filter((id) => !selectedIds.includes(id))])}
              className="rounded-full px-2 py-1 font-semibold text-primary hover:bg-primary-soft"
            >
              {t("list.selectAll")}
            </button>
          ) : null}
        </div>
      </div>

      <ul className="-mx-2 flex max-h-[min(45dvh,22rem)] flex-col overflow-y-auto px-2">
        {shown.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted">{recipes.length === 0 ? t("list.noRecipesYet") : t("list.noRecipesMatch")}</li>
        ) : (
          shown.map((recipe) => {
            const on = selectedIds.includes(recipe.id);
            const count = recipe.ingredients?.length ?? 0;
            const countText = t(count === 1 ? "list.ingredientCountOne" : "list.ingredientCountOther", { count });
            return (
              <li key={recipe.id}>
                <button
                  type="button"
                  role="checkbox"
                  data-track="select_recipes.recipe.toggle"
                  aria-checked={on}
                  aria-label={`${recipeTitle(recipe)}, ${countText}`}
                  onClick={() => onChange(toggleOrderedId(selectedIds, recipe.id))}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-start transition-colors hover:bg-element"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
                      on ? "border-primary bg-primary text-on-primary" : "border-border",
                    )}
                  >
                    {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-semibold text-text">{recipeTitle(recipe)}</span>
                    <span className="block text-[13px] text-muted">{countText}</span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
