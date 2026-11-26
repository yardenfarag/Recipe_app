"use client";

import { Flame, Heart, SearchX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { rankCookTonight } from "@shared/lib/cookTonight";
import { LIBRARY_ONLY_MIN } from "@shared/lib/mealPlan/fillWeek";
import { normalizeSocialUrl } from "@shared/lib/platformUrls";
import {
  applyQuickFilters,
  filterAndSortRecipes,
  isRecipeLibraryFiltered,
  parseQuickFilters,
  RECIPE_SORT_OPTIONS,
  type RecipeQuickFilter,
  type RecipeSortKey,
} from "@shared/lib/recipeListQuery";
import { collectLibraryTags } from "@shared/lib/recipeTags";
import { showToast } from "@shared/lib/toast";
import { upsertRecipeTranslation } from "@shared/lib/supabase/recipeTranslations";
import { deleteRecipe, renameRecipe } from "@shared/lib/supabase/recipes";
import { COOK_TONIGHT_LIMITS } from "@shared/lib/tonightsPick";
import { joinErrorSentences, translateAppError } from "@shared/lib/translateAppError";
import { isCollectionNameTaken, isRecipeNameTaken } from "@shared/lib/uniqueNames";
import type { Recipe } from "@shared/types/recipe";

import { AddToCollectionDialog } from "@/components/library/AddToCollectionDialog";
import { WhatCanICookDialog } from "@/components/library/WhatCanICookDialog";
import { KitchenTiles, KitchenTilesSkeleton } from "@/components/library/KitchenTiles";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { LayoutToggle, LibraryToolbar } from "@/components/library/LibraryToolbar";
import { NameDialog } from "@/components/library/NameDialog";
import { FirstRecipeGuide } from "@/components/onboarding/FirstRecipeGuide";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { SnapBarField } from "@/components/snapbar/SnapBarField";
import { useSnapBar } from "@/components/snapbar/SnapBarProvider";
import { Notice } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useCreditBalance } from "@/lib/credits/balance";
import { formatCount } from "@/lib/credits/format";
import { rememberedLibraryScroll, rememberLibraryScroll } from "@/lib/library/libraryCache";
import { useCollections } from "@/lib/library/useCollections";
import { useCookedThisWeek } from "@/lib/library/useCookedThisWeek";
import { useLibraryLayout } from "@/lib/library/useLibraryLayout";
import { useRecipes } from "@/lib/library/useRecipes";
import { useTonightsPick } from "@/lib/library/useTonightsPick";
import { useTonightPlanned } from "@/lib/plan/useTonightPlanned";
import { usePhoneLayout } from "@/lib/usePhoneLayout";

const SORT_KEYS = RECIPE_SORT_OPTIONS.map((option) => option.key);

/** What the address says the Library should show: so a filtered view can be linked, reloaded and come Back to. */
function filtersFromAddress(params: URLSearchParams) {
  const sort = params.get("sort");
  return {
    search: params.get("q") ?? "",
    sort: (SORT_KEYS as string[]).includes(sort ?? "") ? (sort as RecipeSortKey) : ("newest" as RecipeSortKey),
    tags: params.getAll("tag").flatMap((tag) => tag.split(",")).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    collectionId: params.get("collection"),
    favoritesOnly: params.get("favorites") === "1" || params.get("favorites") === "true",
    cookTonight: params.get("tonight") === "1",
    quick: parseQuickFilters(params.get("quick")),
    saved: params.get("saved") === "1" || params.get("saved") === "true",
  };
}

type CollectionDialog = { mode: "create" } | { mode: "rename"; id: string; name: string } | null;

// The photo cards and the rows of the list.
const GRID = "grid-cols-2 gap-x-3 gap-y-5 md:gap-x-[18px] md:gap-y-6 md:[grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]";
const ROWS = "gap-3 xl:grid-cols-2";

/**
 * Library (PIN-161): it answers "what am I cooking tonight?" first, then lists every recipe. On top, the Snap bar
 * (a link or a photo starts an import, anything else searches the list) with the credit balance beside it; then
 * the tiles (tonight's pick, Snap, the shopping list, what was cooked this week); then "Your recipes" with its
 * filters. Search, the one-tap filters, favorites, "cook tonight", sort, tags and collections all narrow the list
 * with the same shared logic the mobile app uses, and the chosen filters live in the address.
 */
function LibraryScreen() {
  const { t, i18n } = useTranslation();
  usePageTitle(t("tabs.library"));
  const params = useSearchParams();
  const initial = useMemo(() => filtersFromAddress(new URLSearchParams(params.toString())), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { recipes, loading, loadingMore, hasMore, total, error, refresh, loadMore, ensureAllLoaded, patchRecipe, toggleFavorite } = useRecipes(40);
  const { collections, createCollection, renameCollection, deleteCollection, setMembershipsForRecipe } = useCollections();
  const { layout, setLayout } = useLibraryLayout();

  // What is typed in the Snap bar. A link there is about to be imported, so it isn't a search.
  const [barText, setBarText] = useState(initial.search);
  const search = normalizeSocialUrl(barText) ? "" : barText;
  const setSearch = setBarText;
  const [quick, setQuick] = useState<RecipeQuickFilter[]>(initial.quick);
  const [sort, setSort] = useState<RecipeSortKey>(initial.sort);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial.tags);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(initial.collectionId);
  const [favoritesOnly, setFavoritesOnly] = useState(initial.favoritesOnly);
  const [cookTonight, setCookTonight] = useState(initial.cookTonight);
  const [filtersOpen, setFiltersOpen] = useState(initial.sort !== "newest" || initial.tags.length > 0);
  const [savedBanner, setSavedBanner] = useState(initial.saved);
  const [fridgeOpen, setFridgeOpen] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState<CollectionDialog>(null);
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [collectionRecipe, setCollectionRecipe] = useState<Recipe | null>(null);
  const [renameTarget, setRenameTarget] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search);

  // Keep the address in step with the filters, without adding a history entry for every keystroke.
  useEffect(() => {
    // Parameters that aren't the Library's filters stay in the address; `saved` is shown once, then dropped.
    const next = new URLSearchParams(window.location.search);
    for (const key of ["q", "sort", "tag", "collection", "favorites", "tonight", "quick", "saved"]) next.delete(key);
    if (search.trim()) next.set("q", search.trim());
    if (sort !== "newest") next.set("sort", sort);
    if (selectedTags.length > 0) next.set("tag", selectedTags.join(","));
    if (selectedCollectionId) next.set("collection", selectedCollectionId);
    if (favoritesOnly) next.set("favorites", "1");
    if (cookTonight) next.set("tonight", "1");
    if (quick.length > 0) next.set("quick", quick.join(","));
    const query = next.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [search, sort, selectedTags, selectedCollectionId, favoritesOnly, cookTonight, quick]);

  // Back to the Library returns to where you were (PIN-174). The recipes from last time are already on screen, so
  // that place exists before the first paint. A link to the Library opens a new history entry, at the top.
  const openedWithRecipes = useRef(!loading);
  useLayoutEffect(() => {
    const y = rememberedLibraryScroll();
    if (!openedWithRecipes.current || y == null) return;
    window.scrollTo(0, y);
    // In Chrome the page still moves once more a moment later, to a place a couple of hundred pixels short (seen
    // in the browser tests, from no script call: the browser's own restoring). Hold the place for a second, or
    // until the reader scrolls themselves.
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const release = () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", hold);
      for (const input of inputs) window.removeEventListener(input, release);
    };
    const hold = () => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    };
    const timer = setTimeout(release, 1_000);
    window.addEventListener("scroll", hold);
    for (const input of inputs) window.addEventListener(input, release, { passive: true });
    return release;
  }, []);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => rememberLibraryScroll(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Cmd+K / Ctrl+K lands in the Snap bar on this page, where it is always at the top.
  const snapBar = useSnapBar();
  useEffect(
    () =>
      snapBar?.registerInline(() => {
        searchRef.current?.scrollIntoView({ block: "center" });
        searchRef.current?.focus();
      }),
    [snapBar],
  );

  // "/" jumps to the search field from anywhere on the page, unless you are already typing somewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const availableTags = useMemo(() => collectLibraryTags(recipes), [recipes]);

  const collectionAllowlist = useMemo(() => {
    if (!selectedCollectionId) return null;
    return new Set(collections.find((c) => c.id === selectedCollectionId)?.recipeIds ?? []);
  }, [collections, selectedCollectionId]);

  const displayed = useMemo(() => {
    const filtered = applyQuickFilters(
      filterAndSortRecipes(recipes, { searchQuery: deferredSearch, sort, selectedTags, recipeIdAllowlist: collectionAllowlist }),
      quick,
    );
    if (cookTonight) return rankCookTonight(filtered, { ...COOK_TONIGHT_LIMITS, favoritesOnly });
    return favoritesOnly ? filtered.filter((recipe) => recipe.is_favorite === true) : filtered;
  }, [recipes, deferredSearch, sort, selectedTags, collectionAllowlist, favoritesOnly, cookTonight, quick]);

  const filtered =
    isRecipeLibraryFiltered(deferredSearch, sort, selectedTags, selectedCollectionId) || favoritesOnly || cookTonight || quick.length > 0;

  // A search or filter must look at the whole library to be right, so load the rest.
  useEffect(() => {
    if (filtered) void ensureAllLoaded();
  }, [ensureAllLoaded, filtered]);

  // Without a filter, load the next page when the end of the list comes near.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || filtered || !hasMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "800px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered, hasMore, loadMore, recipes.length]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setSort("newest");
    setSelectedTags([]);
    setSelectedCollectionId(null);
    setFavoritesOnly(false);
    setCookTonight(false);
    setQuick([]);
  }, [setSearch]);

  const { pick: suggested, another } = useTonightsPick(recipes);
  // A dinner planned for today wins over the suggestion (PIN-77).
  const plannedId = useTonightPlanned();
  const planned = plannedId ? recipes.find((recipe) => recipe.id === plannedId) ?? null : null;
  const pick = planned ?? suggested;
  const cooked = useCookedThisWeek(recipes, total);
  const { quota } = useCreditBalance();
  const phone = usePhoneLayout();

  const handleFavorite = useCallback(
    async (recipe: Recipe) => {
      try {
        await toggleFavorite(recipe);
      } catch {
        showToast(t("recipe.favoriteFailedTitle"), "error");
      }
    },
    [t, toggleFavorite],
  );

  const recipeActions = useMemo(() => ({ onAddToCollection: setCollectionRecipe, onRename: setRenameTarget, onDelete: setDeleteTarget }), []);

  async function renameSelected(name: string) {
    if (!renameTarget) return;
    await renameRecipe(renameTarget.id, name);
    // A translated copy keeps the old title unless it is renamed too.
    const translations = renameTarget.translations
      ? Object.fromEntries(Object.entries(renameTarget.translations).map(([code, content]) => [code, { ...content, title: name }]))
      : undefined;
    if (translations) {
      await Promise.all(Object.entries(translations).map(([code, content]) => upsertRecipeTranslation(renameTarget.id, code, content)));
    }
    patchRecipe(renameTarget.id, { title: name, display_title: name, translations });
  }

  async function deleteSelected() {
    if (!deleteTarget) return;
    try {
      await deleteRecipe(deleteTarget.id);
      void refresh();
    } catch (caught) {
      showToast(joinErrorSentences(t("library.couldNotDelete"), translateAppError(caught, t)), "error");
    }
  }

  async function deleteSelectedCollection() {
    if (!deleteCollectionId) return;
    try {
      await deleteCollection(deleteCollectionId);
      if (selectedCollectionId === deleteCollectionId) setSelectedCollectionId(null);
    } catch (caught) {
      showToast(joinErrorSentences(t("library.couldNotDelete"), translateAppError(caught, t)), "error");
    }
  }

  const collectionToDelete = collections.find((c) => c.id === deleteCollectionId);
  const count = filtered ? displayed.length : total || displayed.length;
  const countText = t("library.recipeCount", { count });
  const libraryEmpty = !loading && !error && recipes.length === 0 && total === 0;

  const searching = search.trim().length > 0;
  const credits = quota?.totalCredits;

  return (
    <>
      <LibraryTabs current="library" small={!loading && !error && total > 0 && total < LIBRARY_ONLY_MIN} />
      <div className="flex items-stretch gap-2.5 md:flex-wrap md:gap-3.5">
        <SnapBarField value={barText} onChange={setBarText} liveSearch inputRef={searchRef} size={phone ? "md" : "lg"} className="min-w-0 flex-1 md:flex-[1_1_20rem]" />
        {credits != null ? (
          <Link
            href="/settings/credits"
            data-track="library.credits"
            aria-label={t("settings.creditsTotal", { count: credits })}
            className="flex min-h-13 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 font-semibold whitespace-nowrap text-text transition-colors hover:bg-element md:min-h-15 md:rounded-[20px] md:px-[18px]"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent md:h-2.5 md:w-2.5" />
            {/* Just the number on a phone, where the bar needs the width. */}
            <span className="md:hidden">{formatCount(credits, i18n.language)}</span>
            <span className="max-md:hidden">
              {t("web.library.credits", { count: credits })}
            </span>
          </Link>
        ) : null}
      </div>

      {savedBanner ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 text-sm font-medium text-success" role="status">
          <span className="flex-1">{t("library.saved")}</span>
          <button type="button" data-track="library.saved_banner.dismiss" onClick={() => setSavedBanner(false)} className="rounded-lg px-2 py-1 font-semibold hover:bg-success/10">
            {t("common.dismiss")}
          </button>
        </div>
      ) : null}

      {/* The tiles step aside while searching, so what was typed and what it found sit together. */}
      {libraryEmpty || error || searching ? null : (
        <div className="mt-5 md:mt-7">{loading ? <KitchenTilesSkeleton /> : <KitchenTiles pick={pick} planned={planned != null} onAnother={planned ? null : another} cooked={cooked} />}</div>
      )}

      <section aria-labelledby="library-heading" className="mt-6 flex flex-col gap-4 md:mt-7 md:gap-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-2.5">
            <h1 id="library-heading" className="text-[22px] leading-tight font-bold text-text md:text-[30px]">
              {t("library.title")}
            </h1>
            {loading || libraryEmpty || error ? null : (
              <span aria-hidden className="font-display text-[22px] leading-tight font-bold text-muted tabular-nums md:text-[30px]">
                {count}
              </span>
            )}
          </div>
          {libraryEmpty ? null : <LayoutToggle layout={layout} onChange={setLayout} />}
        </div>

        {libraryEmpty ? null : (
          <LibraryToolbar
            quick={quick}
            onToggleQuick={(filter) => setQuick((previous) => (previous.includes(filter) ? previous.filter((item) => item !== filter) : [...previous, filter]))}
            onShowAll={() => {
              setQuick([]);
              setFavoritesOnly(false);
              setCookTonight(false);
            }}
            sort={sort}
            onSortChange={setSort}
            favoritesOnly={favoritesOnly}
            onToggleFavorites={() => setFavoritesOnly((value) => !value)}
            cookTonight={cookTonight}
            onToggleCookTonight={() => setCookTonight((value) => !value)}
            onFridgeMatch={() => void ensureAllLoaded().then(() => setFridgeOpen(true))}
            availableTags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={(tag) => setSelectedTags((previous) => (previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag]))}
            onClearTags={() => setSelectedTags([])}
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
            onCreateCollection={() => setCollectionDialog({ mode: "create" })}
            onRenameCollection={(id) => {
              const collection = collections.find((c) => c.id === id);
              if (collection) setCollectionDialog({ mode: "rename", id, name: collection.name });
            }}
            onDeleteCollection={setDeleteCollectionId}
            filtersOpen={filtersOpen}
            onFiltersOpenChange={setFiltersOpen}
          />
        )}

        <div>
          {error && recipes.length > 0 ? (
            <div className="mb-4">
              <Notice>
                {t("library.refreshFailed")}{" "}
                <button type="button" data-track="library.load_error.retry" onClick={() => void refresh()} className="font-semibold underline underline-offset-2">
                  {t("common.retry")}
                </button>
              </Notice>
            </div>
          ) : null}

          {loading ? (
            <Skeleton layout={layout} label={t("library.title")} />
          ) : error && recipes.length === 0 ? (
            <ErrorState title={t("library.loadFailedTitle")} trackId="library.load_error" onRetry={() => void refresh()} />
          ) : libraryEmpty ? (
            // The first thing a new account sees after onboarding: the way to a first recipe (PIN-140).
            <FirstRecipeGuide />
          ) : (
            <>
              {/* The number sits beside the heading; this says it in words, and again whenever a filter changes it. */}
              <p aria-live="polite" className="sr-only">
                {countText}
              </p>
              {displayed.length === 0 ? (
                <NoResults
                  kind={
                    cookTonight
                      ? "tonight"
                      : favoritesOnly && !search.trim() && selectedTags.length === 0 && !selectedCollectionId && quick.length === 0
                        ? "favorites"
                        : "matches"
                  }
                  onClear={clearFilters}
                />
              ) : (
                <ul className={cn("grid list-none", layout === "grid" ? GRID : ROWS)}>
                  {displayed.map((recipe) => (
                    <li key={recipe.id} className="min-w-0">
                      <RecipeCard recipe={recipe} variant={layout} onToggleFavorite={handleFavorite} actions={recipeActions} />
                    </li>
                  ))}
                </ul>
              )}
              <div ref={sentinelRef} aria-hidden className="h-px" />
              {loadingMore ? (
                <div className="flex justify-center py-8">
                  <Spinner label={t("a11y.loadingMoreRecipes")} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <WhatCanICookDialog open={fridgeOpen} onOpenChange={setFridgeOpen} recipes={recipes} />

      <AddToCollectionDialog
        recipe={collectionRecipe}
        collections={collections}
        onClose={() => setCollectionRecipe(null)}
        onCreate={createCollection}
        onSave={setMembershipsForRecipe}
      />

      <NameDialog
        open={collectionDialog != null}
        onOpenChange={(open) => !open && setCollectionDialog(null)}
        title={collectionDialog?.mode === "rename" ? t("library.renameCollection") : t("library.newCollection")}
        label={t("library.collectionNamePlaceholder")}
        initialValue={collectionDialog?.mode === "rename" ? collectionDialog.name : ""}
        submitLabel={collectionDialog?.mode === "rename" ? t("common.save") : t("library.new")}
        validate={(name) => {
          if (!name.trim()) return t("library.collectionNameRequired");
          const excludeId = collectionDialog?.mode === "rename" ? collectionDialog.id : undefined;
          return isCollectionNameTaken(collections, name, excludeId) ? t("library.collectionNameTaken") : null;
        }}
        trackId="library.collection_name"
        onSubmit={async (name) => {
          if (collectionDialog?.mode === "rename") await renameCollection(collectionDialog.id, name);
          else setSelectedCollectionId((await createCollection(name)).id);
        }}
      />

      <NameDialog
        open={renameTarget != null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        title={t("library.renameRecipe")}
        label={t("library.recipeNamePlaceholder")}
        initialValue={renameTarget ? (renameTarget.display_title ?? renameTarget.title) : ""}
        submitLabel={t("common.save")}
        validate={(name) => {
          if (!name.trim()) return t("library.recipeNameRequired");
          return renameTarget && isRecipeNameTaken(recipes, name, renameTarget.id) ? t("library.recipeNameTaken") : null;
        }}
        trackId="library.rename_recipe"
        onSubmit={renameSelected}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("library.deleteRecipeTitle")}
        description={t("library.deleteRecipeBody", { name: deleteTarget ? (deleteTarget.display_title ?? deleteTarget.title) : "" })}
        confirmLabel={t("common.delete")}
        trackId="library.delete_recipe_dialog"
        onConfirm={deleteSelected}
      />

      <ConfirmDialog
        open={deleteCollectionId != null}
        onOpenChange={(open) => !open && setDeleteCollectionId(null)}
        title={t("library.deleteCollectionTitle")}
        description={collectionToDelete ? t("library.deleteCollectionBody", { name: collectionToDelete.name }) : t("library.deleteCollectionBodyGeneric")}
        confirmLabel={t("library.deleteCollection")}
        trackId="library.delete_collection_dialog"
        onConfirm={deleteSelectedCollection}
      />
    </>
  );
}

function NoResults({ kind, onClear }: { kind: "tonight" | "favorites" | "matches"; onClear: () => void }) {
  const { t } = useTranslation();
  const copy = {
    tonight: { icon: <Flame aria-hidden />, title: t("library.noCookTonight"), body: t("library.noCookTonightHint") },
    favorites: { icon: <Heart aria-hidden />, title: t("library.noFavorites"), body: t("library.noFavoritesHint") },
    matches: { icon: <SearchX aria-hidden />, title: t("library.noMatches"), body: t("library.noMatchesHint") },
  }[kind];
  return (
    <EmptyState
      icon={copy.icon}
      title={copy.title}
      body={copy.body}
      action={
        <Button variant="secondary" trackId="library.filters.clear" onClick={onClear}>
          {t("library.clearFilters")}
        </Button>
      }
    />
  );
}

/** Grey outlines of the cards while the first page loads, so the page doesn't jump when they arrive. */
function Skeleton({ layout, label }: { layout: "grid" | "list"; label: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden
        className={cn("grid motion-safe:animate-pulse", layout === "grid" ? GRID : ROWS)}
      >
        {Array.from({ length: layout === "grid" ? 8 : 6 }, (_, index) => (
          <div key={index} className={cn("rounded-[22px] bg-element", layout === "grid" ? "aspect-[4/3]" : "h-24")} />
        ))}
      </div>
    </div>
  );
}

export default function LibraryPage() {
  return (
    // useSearchParams needs a boundary; the page itself loads after sign-in, in the browser.
    <Suspense>
      <LibraryScreen />
    </Suspense>
  );
}
