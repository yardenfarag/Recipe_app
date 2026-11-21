"use client";

import { LayoutGrid, List, Search, Tags, X } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { HUB_PLATFORMS, platformLabelKey } from "@shared/lib/hubCards";
import { translateRecipeTag } from "@shared/lib/recipeTags";
import type { HubSort } from "@shared/lib/supabase/cookingHub";
import type { HubPlatform } from "@shared/types/recipeCard";

import { cn } from "@/lib/cn";
import type { LibraryLayout } from "@/lib/library/useLibraryLayout";

// The Library's chips (components/library/LibraryToolbar.tsx), so both screens look alike.
const chip =
  "inline-flex h-10 shrink-0 select-none items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors";
const chipOff = "border-border bg-surface text-text hover:bg-element";
const chipOn = "border-primary bg-primary-soft text-primary";

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
          <button
            key={option.value}
            type="button"
            role="radio"
            data-track={`${trackPrefix}.${option.value}`}
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(chip, on ? chipOn : chipOff)}
          >
            {option.label}
          </button>
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
            className="h-12 w-full rounded-full border border-border bg-surface ps-12 pe-14 text-base text-text shadow-soft transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              data-track="hub.search.clear"
              aria-label={t("library.clearSearch")}
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

        <LayoutToggle layout={props.layout} onLayoutChange={props.onLayoutChange} />
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
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
              className={cn(chip, selectedTags.length > 0 || props.tagsOpen ? chipOn : chipOff)}
            >
              <Tags aria-hidden className="h-4 w-4" />
              {t("library.tags")}
              {selectedTags.length > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary">
                  <span className="sr-only">{t("a11y.filtersApplied")}: </span>
                  {selectedTags.length}
                </span>
              ) : null}
            </button>
          </>
        ) : null}
      </div>

      <div
        id={panelId}
        hidden={!props.tagsOpen}
        className="rounded-3xl border border-frosted-border bg-surface/70 p-5 shadow-soft backdrop-blur-sm"
      >
        <fieldset>
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-bold text-text">{t("library.tags")}</legend>
            {selectedTags.length > 0 ? (
              <button
                type="button"
                data-track="hub.filter.tags.clear"
                onClick={props.onClearTags}
                aria-label={t("a11y.clearTags")}
                className="rounded-full px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-soft"
              >
                {t("common.clear")}
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.availableTags.map((tag) => {
              const on = selectedTags.includes(tag);
              return (
                <button key={tag} type="button" data-track="hub.filter.tag.toggle" aria-pressed={on} onClick={() => props.onToggleTag(tag)} className={cn(chip, "h-9", on ? chipOn : chipOff)}>
                  {translateRecipeTag(tag, t)}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/** Grid or list, as in the Library: the same choice, remembered for both. */
function LayoutToggle({ layout, onLayoutChange }: { layout: LibraryLayout; onLayoutChange: (layout: LibraryLayout) => void }) {
  const { t } = useTranslation();
  return (
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
          data-track={`hub.layout.${value}`}
          aria-checked={layout === value}
          aria-label={label}
          title={label}
          onClick={() => onLayoutChange(value)}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-full transition-colors",
            layout === value ? "bg-primary-soft text-primary" : "text-muted hover:bg-element hover:text-text",
          )}
        >
          <Icon aria-hidden className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
