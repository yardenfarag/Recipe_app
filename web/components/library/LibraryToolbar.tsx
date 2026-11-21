"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Flame, Heart, LayoutGrid, List, MoreHorizontal, Pencil, Plus, Printer, Refrigerator, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useId, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { RECIPE_SORT_OPTIONS, type RecipeSortKey } from "@shared/lib/recipeListQuery";
import { translateRecipeTag } from "@shared/lib/recipeTags";

import { cn } from "@/lib/cn";
import type { LibraryLayout } from "@/lib/library/useLibraryLayout";

const chip =
  "inline-flex h-10 shrink-0 select-none items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors";
const chipOff = "border-border bg-surface text-text hover:bg-element";
const chipOn = "border-primary bg-primary-soft text-primary";

const menuItem =
  "relative flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[15px] text-text outline-none data-[highlighted]:bg-element";

export type LibraryToolbarProps = {
  searchInput: Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
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
  collections: { id: string; name: string }[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onCreateCollection: () => void;
  onRenameCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  layout: LibraryLayout;
  onLayoutChange: (layout: LibraryLayout) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
};

/**
 * Everything for finding a recipe, in the order people reach for it: search (press "/" from anywhere), the two
 * one-tap filters, the collections, then a panel for sorting and tags. Each filter is a toggle button that says
 * whether it is on.
 */
export function LibraryToolbar({ searchInput, ...props }: LibraryToolbarProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const { search, sort, selectedTags, selectedCollectionId } = props;
  const filtersActive = sort !== "newest" || selectedTags.length > 0;
  const activeCount = (sort !== "newest" ? 1 : 0) + selectedTags.length;
  const selectedCollection = props.collections.find((c) => c.id === selectedCollectionId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-40">
          <Search aria-hidden className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            ref={searchInput}
            type="search"
            value={search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && search) {
                event.preventDefault();
                props.onSearchChange("");
              }
            }}
            placeholder={t("library.searchPlaceholder")}
            aria-label={t("a11y.searchRecipes")}
            aria-keyshortcuts="/"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-full border border-border bg-surface ps-12 pe-14 text-base text-text shadow-soft transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              aria-label={t("library.clearSearch")}
              data-track="library.search.clear"
              onClick={() => props.onSearchChange("")}
              className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-element hover:text-text"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute end-4 top-1/2 hidden h-6 min-w-6 -translate-y-1/2 place-items-center rounded-md border border-border bg-bg px-1.5 font-sans text-xs font-semibold text-muted [@media(hover:hover)]:grid"
            >
              /
            </kbd>
          )}
        </div>

        <div role="radiogroup" aria-label={`${t("library.showGrid")} / ${t("library.showList")}`} className="flex rounded-full border border-border bg-surface p-1 shadow-soft">
          {(
            [
              ["grid", LayoutGrid, t("library.showGrid")],
              ["list", List, t("library.showList")],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={props.layout === value}
              data-track={`library.layout.${value}`}
              aria-label={label}
              title={label}
              onClick={() => props.onLayoutChange(value)}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full transition-colors",
                props.layout === value ? "bg-primary-soft text-primary" : "text-muted hover:bg-element hover:text-text",
              )}
            >
              <Icon aria-hidden className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        <button type="button" aria-pressed={props.favoritesOnly} data-track="library.favorites.toggle" onClick={props.onToggleFavorites} className={cn(chip, props.favoritesOnly ? chipOn : chipOff)}>
          <Heart aria-hidden className={cn("h-4 w-4", props.favoritesOnly && "fill-current")} />
          {t("library.favorites")}
        </button>
        <button
          type="button"
          aria-pressed={props.cookTonight}
          data-track="library.cook_tonight.toggle"
          onClick={props.onToggleCookTonight}
          title={t("library.cookTonightRule")}
          className={cn(chip, props.cookTonight ? chipOn : chipOff)}
        >
          <Flame aria-hidden className="h-4 w-4" />
          {t("library.cookTonight")}
        </button>
        <button type="button" data-track="library.fridge_match" onClick={props.onFridgeMatch} className={cn(chip, chipOff)}>
          <Refrigerator aria-hidden className="h-4 w-4" />
          {t("library.fridgeMatch")}
        </button>
        <Link href="/cookbook" data-track="library.cookbook.open" title={t("settings.cookbookHint")} className={cn(chip, chipOff)}>
          <Printer aria-hidden className="h-4 w-4" />
          {t("cookbook.title")}
        </Link>
        <button
          type="button"
          aria-expanded={props.filtersOpen}
          aria-controls={panelId}
          data-track="library.filter.open"
          onClick={() => props.onFiltersOpenChange(!props.filtersOpen)}
          className={cn(chip, filtersActive ? chipOn : chipOff)}
        >
          <SlidersHorizontal aria-hidden className="h-4 w-4" />
          {t("library.filter")}
          {activeCount > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary">
              <span className="sr-only">{t("a11y.filtersApplied")}: </span>
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {props.cookTonight ? <p className="-mt-1 text-sm text-muted">{t("library.cookTonightRule")}</p> : null}

      <div
        id={panelId}
        hidden={!props.filtersOpen}
        className="rounded-3xl border border-frosted-border bg-surface/70 p-5 shadow-soft backdrop-blur-sm"
      >
        <fieldset>
          <legend className="text-sm font-bold text-text">{t("web.library.sortBy")}</legend>
          <div role="radiogroup" aria-label={t("web.library.sortBy")} className="mt-3 flex flex-wrap gap-2">
            {RECIPE_SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={sort === option.key}
                data-track={`library.sort.${option.key}`}
                onClick={() => props.onSortChange(option.key)}
                className={cn(chip, sort === option.key ? chipOn : chipOff)}
              >
                {t(`library.sort.${option.key}`)}
              </button>
            ))}
          </div>
        </fieldset>
        {props.availableTags.length > 0 ? (
          <fieldset className="mt-5">
            <legend className="text-sm font-bold text-text">{t("library.tags")}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {props.availableTags.map((tag) => {
                const on = selectedTags.includes(tag);
                return (
                  <button key={tag} type="button" aria-pressed={on} data-track="library.tag.toggle" onClick={() => props.onToggleTag(tag)} className={cn(chip, "h-9", on ? chipOn : chipOff)}>
                    {translateRecipeTag(tag, t)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>

      <div role="group" aria-label={t("library.collections")} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        <span className="me-1 shrink-0 text-sm font-bold text-muted">{t("library.collections")}</span>
        <button type="button" aria-pressed={selectedCollectionId == null} data-track="library.collection.all" onClick={() => props.onSelectCollection(null)} className={cn(chip, "h-9", selectedCollectionId == null ? chipOn : chipOff)}>
          {t("library.allCollections")}
        </button>
        {props.collections.map((collection) => {
          const on = collection.id === selectedCollectionId;
          return (
            <button
              key={collection.id}
              type="button"
              aria-pressed={on}
              data-track="library.collection.select"
              onClick={() => props.onSelectCollection(on ? null : collection.id)}
              className={cn(chip, "h-9 max-w-56", on ? chipOn : chipOff)}
            >
              <span className="truncate">{collection.name}</span>
            </button>
          );
        })}
        {selectedCollection ? (
          <Menu.Root>
            <Menu.Trigger asChild>
              <button
                type="button"
                aria-label={t("library.manageCollection", { name: selectedCollection.name })}
                data-track="library.collection.manage"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-element hover:text-text data-[state=open]:bg-element"
              >
                <MoreHorizontal aria-hidden className="h-4 w-4" />
              </button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="start" sideOffset={6} collisionPadding={12} className="z-50 min-w-52 animate-pop-in rounded-2xl border border-frosted-border bg-surface p-1.5 shadow-lift">
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
        <button type="button" data-track="library.collection.create" onClick={props.onCreateCollection} className={cn(chip, "h-9 border-dashed", chipOff)}>
          <Plus aria-hidden className="h-4 w-4" />
          {t("library.newCollection")}
        </button>
      </div>
    </div>
  );
}
