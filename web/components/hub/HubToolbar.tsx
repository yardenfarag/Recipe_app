"use client";

import { LayoutGrid, List, Search, Tags, X } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { HUB_PLATFORMS, platformLabelKey } from "@shared/lib/hubCards";
import { translateRecipeTag } from "@shared/lib/recipeTags";
import type { HubSort } from "@shared/lib/supabase/cookingHub";
import type { HubPlatform } from "@shared/types/recipeCard";

import { Button } from "@/components/ui/Button";
import { Chip, chipClasses } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tile, TileLabel } from "@/components/ui/Tile";
import type { LibraryLayout } from "@/lib/library/useLibraryLayout";

const SORTS: { value: HubSort; labelKey: string }[] = [
  { value: "popular", labelKey: "hub.sortPopular" },
  { value: "newest", labelKey: "hub.sortNewest" },
];

export type HubToolbarProps = {
  searchInput: Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  platform: HubPlatform | "all";
  onPlatformChange: (platform: HubPlatform | "all") => void;
  sort: HubSort;
  onSortChange: (sort: HubSort) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  layout: LibraryLayout;
  onLayoutChange: (layout: LibraryLayout) => void;
  tagsOpen: boolean;
  onTagsOpenChange: (open: boolean) => void;
};

/**
 * A row of chips where exactly one is on (the source, the sort). One Tab stop for the group; the arrow keys move
 * the choice, the way they do in a native radio group, and follow the reading direction in Hebrew and Arabic.
 */
function ChipRadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  trackPrefix,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Each chip logs `<trackPrefix>.<value>` in the activity log; values are fixed keys. */
  trackPrefix: string;
}) {
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rtl = group.current ? getComputedStyle(group.current).direction === "rtl" : false;
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    const index = options.findIndex((option) => option.value === value);
    let next = index;
    if (event.key === forward || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === backward || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  return (
    <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex shrink-0 items-center gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Chip
            key={option.value}
            kind="radio"
            selected={on}
            trackId={`${trackPrefix}.${option.value}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Chip>
        );
      })}
    </div>
  );
}

/**
 * Finding a Hub recipe: search (press "/" from anywhere), grid or list, then the source and the sort as one-tap
 * chips, and the popular tags in a panel.
 */
export function HubToolbar({ searchInput, ...props }: HubToolbarProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const { search, selectedTags } = props;

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
            placeholder={t("hub.searchPlaceholder")}
            aria-label={t("hub.searchPlaceholder")}
            aria-keyshortcuts="/"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-btn border border-border bg-surface ps-12 pe-14 text-base text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              data-track="hub.search.clear"
              aria-label={t("library.clearSearch")}
              onClick={() => props.onSearchChange("")}
              className="absolute end-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-muted hover:bg-element hover:text-text pointer-coarse:end-0.5 pointer-coarse:h-11 pointer-coarse:w-11"
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

        <LayoutToggle layout={props.layout} onLayoutChange={props.onLayoutChange} />
      </div>

      <div className="-mx-4 flex items-center gap-2 scroll-row px-4 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:p-0">
        <ChipRadioGroup
          label={t("web.hub.source")}
          trackPrefix="hub.filter.source"
          value={props.platform}
          onChange={props.onPlatformChange}
          options={HUB_PLATFORMS.map((value) => ({ value, label: t(platformLabelKey(value)) }))}
        />
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
        <ChipRadioGroup
          label={t("web.library.sortBy")}
          trackPrefix="hub.sort"
          value={props.sort}
          onChange={props.onSortChange}
          options={SORTS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
        />
        {props.availableTags.length > 0 || selectedTags.length > 0 ? (
          <>
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
            <button
              type="button"
              data-track="hub.filter.toggle"
              aria-expanded={props.tagsOpen}
              aria-controls={panelId}
              onClick={() => props.onTagsOpenChange(!props.tagsOpen)}
              className={chipClasses({ selected: selectedTags.length > 0 || props.tagsOpen })}
            >
              <Tags aria-hidden className="h-4 w-4" />
              {t("library.tags")}
              {selectedTags.length > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-bg px-1 text-xs font-bold text-text tabular-nums">
                  <span className="sr-only">{t("a11y.filtersApplied")}: </span>
                  {selectedTags.length}
                </span>
              ) : null}
            </button>
          </>
        ) : null}
      </div>

      <Tile id={panelId} hidden={!props.tagsOpen} className="p-5">
        <fieldset>
          <div className="flex min-h-7 items-center justify-between gap-3">
            <TileLabel as="legend">{t("library.tags")}</TileLabel>
            {selectedTags.length > 0 ? (
              <Button variant="link" trackId="hub.filter.tags.clear" onClick={props.onClearTags} aria-label={t("a11y.clearTags")}>
                {t("common.clear")}
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.availableTags.map((tag) => {
              const on = selectedTags.includes(tag);
              return (
                <Chip key={tag} size="sm" selected={on} trackId="hub.filter.tag.toggle" onClick={() => props.onToggleTag(tag)}>
                  {translateRecipeTag(tag, t)}
                </Chip>
              );
            })}
          </div>
        </fieldset>
      </Tile>
    </div>
  );
}

/** Grid or list, as in the Library: the same choice, remembered for both. */
function LayoutToggle({ layout, onLayoutChange }: { layout: LibraryLayout; onLayoutChange: (layout: LibraryLayout) => void }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={`${t("library.showGrid")} / ${t("library.showList")}`}
      value={layout}
      onChange={onLayoutChange}
      options={[
        { value: "grid", label: t("library.showGrid"), icon: <LayoutGrid aria-hidden className="h-5 w-5" />, iconOnly: true, trackId: "hub.layout.grid" },
        { value: "list", label: t("library.showList"), icon: <List aria-hidden className="h-5 w-5" />, iconOnly: true, trackId: "hub.layout.list" },
      ]}
    />
  );
}
