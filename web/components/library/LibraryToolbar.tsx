"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Flame, Heart, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Printer, Refrigerator, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { RECIPE_QUICK_FILTERS, RECIPE_SORT_OPTIONS, type RecipeQuickFilter, type RecipeSortKey } from "@shared/lib/recipeListQuery";
import { translateRecipeTag } from "@shared/lib/recipeTags";

import { Button } from "@/components/ui/Button";
import { Chip, chipClasses } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import type { LibraryLayout } from "@/lib/library/useLibraryLayout";

const menuItem =
  "relative flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[15px] text-text outline-none data-[highlighted]:bg-element";

// A row of chips: it scrolls sideways on a phone, reaching the screen's edges, and wraps on wider screens.
const chipRow = "-mx-4 flex items-center gap-2 px-4 scroll-row sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0";

export type LibraryToolbarProps = {
  quick: RecipeQuickFilter[];
  onToggleQuick: (filter: RecipeQuickFilter) => void;
  /** "All": turns the one-tap filters off. */
  onShowAll: () => void;
  sort: RecipeSortKey;
  onSortChange: (sort: RecipeSortKey) => void;
  favoritesOnly: boolean;
  onToggleFavorites: () => void;
  cookTonight: boolean;
  onToggleCookTonight: () => void;
  onFridgeMatch: () => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  collections: { id: string; name: string }[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onCreateCollection: () => void;
  onRenameCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
};

/** Photo cards or rows. */
export function LayoutToggle({ layout, onChange }: { layout: LibraryLayout; onChange: (layout: LibraryLayout) => void }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={`${t("library.showGrid")} / ${t("library.showList")}`}
      value={layout}
      onChange={onChange}
      size="sm"
      options={[
        { value: "grid", label: t("library.showGrid"), icon: <LayoutGrid aria-hidden className="h-5 w-5" />, iconOnly: true, trackId: "library.layout.grid" },
        { value: "list", label: t("library.showList"), icon: <List aria-hidden className="h-5 w-5" />, iconOnly: true, trackId: "library.layout.list" },
      ]}
    />
  );
}

/**
 * Everything for narrowing the list, under the "Your recipes" heading: the one-tap filter chips (All, Under 30 min,
 * Veggie, From TikTok, Never cooked, Favorites, Cook tonight), the fridge match and the cookbook, a panel for
 * sorting and tags, then the collections. Each filter is a toggle button that says whether it is on. Searching is
 * the Snap bar's job, at the top of the page.
 */
export function LibraryToolbar(props: LibraryToolbarProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const { quick, sort, selectedTags, selectedCollectionId } = props;
  const filtersActive = sort !== "newest" || selectedTags.length > 0;
  const activeCount = (sort !== "newest" ? 1 : 0) + selectedTags.length;
  const selectedCollection = props.collections.find((c) => c.id === selectedCollectionId);
  const showingAll = quick.length === 0 && !props.favoritesOnly && !props.cookTonight;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("web.library.quickFilters")} className={chipRow}>
        <Chip selected={showingAll} trackId="library.filter.all" onClick={props.onShowAll}>
          {t("web.library.filterAll")}
        </Chip>
        {RECIPE_QUICK_FILTERS.map((filter) => (
          <Chip key={filter} selected={quick.includes(filter)} trackId={`library.quick.${filter}`} onClick={() => props.onToggleQuick(filter)}>
            {t(`web.library.quick.${filter}`)}
          </Chip>
        ))}
        <Chip selected={props.favoritesOnly} trackId="library.favorites.toggle" onClick={props.onToggleFavorites}>
          <Heart aria-hidden className={cn("h-4 w-4", props.favoritesOnly && "fill-current")} />
          {t("library.favorites")}
        </Chip>
        <Chip selected={props.cookTonight} trackId="library.cook_tonight.toggle" title={t("library.cookTonightRule")} onClick={props.onToggleCookTonight}>
          <Flame aria-hidden className="h-4 w-4" />
          {t("library.cookTonight")}
        </Chip>
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
        {/* "What can I cook?" from the saved pantry (PIN-181); it replaced the one-photo fridge match. */}
        <Chip trackId="library.what_can_i_cook" onClick={props.onFridgeMatch}>
          <Refrigerator aria-hidden className="h-4 w-4" />
          {t("pantry.cook.button")}
        </Chip>
        <Link href="/cookbook" data-track="library.cookbook.open" title={t("settings.cookbookHint")} className={chipClasses()}>
          <Printer aria-hidden className="h-4 w-4" />
          {t("cookbook.title")}
        </Link>
        <button
          type="button"
          aria-expanded={props.filtersOpen}
          aria-controls={panelId}
          data-track="library.filter.open"
          onClick={() => props.onFiltersOpenChange(!props.filtersOpen)}
          className={chipClasses({ selected: filtersActive })}
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          {t("library.filter")}
          {activeCount > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-bg px-1 text-xs font-bold text-text">
              <span className="sr-only">{t("a11y.filtersApplied")}: </span>
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {props.cookTonight ? <p className="-mt-1 text-sm text-muted">{t("library.cookTonightRule")}</p> : null}

      <Tile id={panelId} hidden={!props.filtersOpen} className="p-5 sm:p-6">
        <fieldset>
          <legend className="text-sm font-bold text-text">{t("web.library.sortBy")}</legend>
          <div role="radiogroup" aria-label={t("web.library.sortBy")} className="mt-3 flex flex-wrap gap-2">
            {RECIPE_SORT_OPTIONS.map((option) => (
              <Chip key={option.key} kind="radio" selected={sort === option.key} trackId={`library.sort.${option.key}`} onClick={() => props.onSortChange(option.key)}>
                {t(`library.sort.${option.key}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        {props.availableTags.length > 0 ? (
          <fieldset className="relative mt-5">
            <legend className="text-sm font-bold text-text">{t("library.tags")}</legend>
            {selectedTags.length > 0 ? (
              <Button variant="link" trackId="library.tags.clear" aria-label={t("a11y.clearTags")} className="absolute -top-0.5 end-0" onClick={props.onClearTags}>
                {t("common.clear")}
              </Button>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {props.availableTags.map((tag) => (
                <Chip key={tag} size="sm" selected={selectedTags.includes(tag)} trackId="library.tag.toggle" onClick={() => props.onToggleTag(tag)}>
                  {translateRecipeTag(tag, t)}
                </Chip>
              ))}
            </div>
          </fieldset>
        ) : null}
      </Tile>

      <div role="group" aria-label={t("library.collections")} className={chipRow}>
        <span className="me-1 shrink-0 text-[13px] font-semibold tracking-[0.06em] text-muted uppercase rtl:tracking-normal">{t("library.collections")}</span>
        <Chip size="sm" selected={selectedCollectionId == null} trackId="library.collection.all" onClick={() => props.onSelectCollection(null)}>
          {t("library.allCollections")}
        </Chip>
        {props.collections.map((collection) => {
          const on = collection.id === selectedCollectionId;
          return (
            <Chip key={collection.id} size="sm" selected={on} trackId="library.collection.select" className="max-w-56" onClick={() => props.onSelectCollection(on ? null : collection.id)}>
              <span className="truncate">{collection.name}</span>
            </Chip>
          );
        })}
        {selectedCollection ? (
          <Menu.Root>
            <Menu.Trigger asChild>
              <button
                type="button"
                aria-label={t("library.manageCollection", { name: selectedCollection.name })}
                data-track="library.collection.manage"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted transition-colors hover:bg-element hover:text-text data-[state=open]:bg-element pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <MoreHorizontal aria-hidden className="h-4 w-4" />
              </button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="start" sideOffset={6} collisionPadding={12} className="z-50 min-w-52 animate-pop-in rounded-2xl border border-border bg-surface p-1.5 shadow-lift">
                <Menu.Item className={menuItem} asChild>
                  <Link href={`/cookbook?collection=${encodeURIComponent(selectedCollection.id)}`} data-track="library.collection.cookbook">
                    <Printer aria-hidden className="h-[18px] w-[18px] text-muted" />
                    {t("library.makeCookbook")}
                  </Link>
                </Menu.Item>
                <Menu.Item className={menuItem} data-track="library.collection.rename" onSelect={() => props.onRenameCollection(selectedCollection.id)}>
                  <Pencil aria-hidden className="h-[18px] w-[18px] text-muted" />
                  {t("library.renameCollection")}
                </Menu.Item>
                <Menu.Item className={cn(menuItem, "text-danger")} data-track="library.collection.delete" onSelect={() => props.onDeleteCollection(selectedCollection.id)}>
                  <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                  {t("library.deleteCollection")}
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        ) : null}
        <Chip size="sm" trackId="library.collection.create" className="border-dashed" onClick={props.onCreateCollection}>
          <Plus aria-hidden className="h-4 w-4" />
          {t("library.newCollection")}
        </Chip>
      </div>
    </div>
  );
}
