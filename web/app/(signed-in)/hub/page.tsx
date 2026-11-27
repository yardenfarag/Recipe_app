"use client";

import { Compass, SearchX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { hubCardFlag, hubCardFlagLabel, hubCardFlagText } from "@shared/lib/hubAvoid";
import { hubCardDetail } from "@shared/lib/hubCards";
import { recipeCardToListRecipe } from "@shared/lib/recipeCardMap";

import { useLanguage } from "@/components/LanguageProvider";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { HubToolbar } from "@/components/hub/HubToolbar";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { navItem } from "@/components/shell/nav";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Spinner } from "@/components/ui/Spinner";
import { tileClasses } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import { hubAddressQuery, hubFiltersActive, hubFiltersFromAddress, rememberHubQuery } from "@/lib/hub/hubAddress";
import { useHub } from "@/lib/hub/useHub";
import { useLibraryLayout } from "@/lib/library/useLibraryLayout";

const GRID = "gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]";
const LIST = "gap-4 xl:grid-cols-2";

/**
 * Cooking Hub: recipes other people already snapped from public links, free to add to your library. Search, source,
 * tags and sort narrow it with the same shared query as the mobile app. It is sorted for you: recipes that fit your diets
 * come first, ones with foods you don't like lower, ones with your allergies last, and those carry a flag (PIN-180).
 * The chosen filters live in the address, and the list loads more as you scroll.
 */
function HubScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const params = useSearchParams();
  const initial = useMemo(() => hubFiltersFromAddress(new URLSearchParams(params.toString())), []); // eslint-disable-line react-hooks/exhaustive-deps
  const hub = useHub(initial);
  const { layout, setLayout } = useLibraryLayout();
  const [tagsOpen, setTagsOpen] = useState(initial.tags.length > 0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { search, selectedTags, sort, platform, cards, hasMore, loadMore, loading, loadingMore, error, querying } = hub;
  const filters = useMemo(() => ({ search, tags: selectedTags, sort, platform }), [search, selectedTags, sort, platform]);
  const filtered = hubFiltersActive(filters) || Boolean(search.trim());

  // Keep the address in step with the filters, without a history entry for every keystroke.
  useEffect(() => {
    const query = hubAddressQuery(filters);
    // Parameters that aren't the Hub's filters (e.g. a campaign tag on a link) stay in the address.
    const others = new URLSearchParams(window.location.search);
    for (const key of ["q", "source", "sort", "tag"]) others.delete(key);
    const merged = new URLSearchParams(query.slice(1));
    for (const [key, value] of others) merged.append(key, value);
    const full = merged.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${full ? `?${full}` : ""}`);
    rememberHubQuery(query);
  }, [filters]);

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

  // A new search or filter starts the list again: bring its top into view if you had scrolled past it.
  useEffect(() => {
    if (hub.listEpoch === 0) return;
    const top = listRef.current?.getBoundingClientRect().top;
    if (top != null && top < 0) listRef.current?.scrollIntoView({ block: "start" });
  }, [hub.listEpoch]);

  // Load the next page when the end of the list comes near.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || error) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: "800px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, error, cards.length]);

  const dietNames = useMemo(() => {
    if (hub.diets.length === 0) return null;
    const names = hub.diets.map((diet) => t(`recipe.variants.${diet}.label`));
    try {
      return new Intl.ListFormat(language, { type: "conjunction" }).format(names);
    } catch {
      return names.join(", ");
    }
  }, [hub.diets, language, t]);

  const { avoidList } = hub;
  const flags = useMemo(() => {
    const byCard = new Map<string, { kind: "allergy" | "dislike"; text: string; label: string }>();
    for (const card of cards) {
      const flag = hubCardFlag(card, avoidList);
      if (flag) byCard.set(card.id, { kind: flag.kind, text: hubCardFlagText(flag, t), label: hubCardFlagLabel(flag, t) });
    }
    return byCard;
  }, [cards, avoidList, t]);

  const count = hub.total || cards.length;
  const countText = querying ? t("hub.searching") : t("library.recipeCount", { count });

  // Cards are showing but the last load failed: say so where it happened, with a way to try again.
  const retryAlert = (
    <ErrorAlert>
      {t("hub.loadFailedTitle")}{" "}
      <button type="button" data-track="hub.error_retry_inline" onClick={hub.retry} className="font-semibold underline underline-offset-2">
        {t("common.retry")}
      </button>
    </ErrorAlert>
  );

  return (
    <>
      <LibraryTabs current="hub" />
      <PageHeader title={t("hub.title")} subtitle={t("hub.subtitle")} tabTitle={t("tabs.hub")} />

      <HubToolbar
        searchInput={searchRef}
        search={search}
        onSearchChange={hub.setSearch}
        platform={platform}
        onPlatformChange={hub.setPlatform}
        sort={sort}
        onSortChange={hub.setSort}
        availableTags={hub.availableTags}
        selectedTags={selectedTags}
        onToggleTag={hub.toggleTag}
        onClearTags={hub.clearTags}
        layout={layout}
        onLayoutChange={setLayout}
        tagsOpen={tagsOpen}
        onTagsOpenChange={setTagsOpen}
      />

      <div ref={listRef} className="mt-6 scroll-mt-6">
        {loading ? (
          <Skeleton layout={layout} label={t("hub.searching")} />
        ) : error && cards.length === 0 ? (
          <ErrorState title={t("hub.loadFailedTitle")} trackId="hub.load_error" onRetry={hub.retry} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <p aria-live="polite" className="font-semibold text-muted">
                {countText}
              </p>
              {dietNames && cards.length > 0 ? <p className="text-muted">{t("web.hub.dietFirst", { diets: dietNames })}</p> : null}
              {hub.avoidsAllergies && cards.length > 0 ? <p className="text-muted">{t("web.hub.avoidLastAllergies")}</p> : null}
              {hub.avoidsDislikes && cards.length > 0 ? <p className="text-muted">{t("web.hub.avoidLastDislikes")}</p> : null}
            </div>

            {error && !hub.errorLoadingMore ? <div className="mb-4">{retryAlert}</div> : null}

            {cards.length === 0 ? (
              filtered ? (
                <EmptyState
                  icon={<SearchX aria-hidden />}
                  title={t("hub.noMatches")}
                  body={t("hub.noMatchesHint")}
                  action={
                    <Button variant="secondary" trackId="hub.filters.clear" onClick={hub.clearFilters}>
                      {t("library.clearFilters")}
                    </Button>
                  }
                />
              ) : (
                <EmptyState icon={<Compass aria-hidden />} title={t("hub.emptyTitle")} body={t("hub.emptyBody")} action={<SnapFirstLink />} />
              )
            ) : (
              <ul aria-busy={querying || undefined} className={cn("grid list-none transition-opacity", layout === "grid" ? GRID : LIST, querying && "opacity-60")}>
                {cards.map((card) => (
                  <li key={card.id} className="min-w-0">
                    <RecipeCard
                      recipe={recipeCardToListRecipe(card)}
                      href={`/hub/${card.id}`}
                      trackId="hub.recipe"
                      variant={layout}
                      detail={hubCardDetail(card, t)}
                      flag={flags.get(card.id)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {error && hub.errorLoadingMore ? <div className="mt-4">{retryAlert}</div> : null}

            <div ref={sentinelRef} aria-hidden className="h-px" />
            {loadingMore ? (
              <div className="flex justify-center py-8">
                <Spinner label={t("a11y.loadingMoreRecipes")} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** The empty Hub fills up from Snap: "Snap a recipe". */
function SnapFirstLink() {
  const { t } = useTranslation();
  const snap = navItem("snap");
  return (
    <Link href={snap.href} data-track="hub.empty.snap_first" className={buttonClasses({ variant: "primary" })}>
      <snap.icon aria-hidden className="h-4 w-4" />
      {t("hub.snapFirst")}
    </Link>
  );
}

/** Grey outlines of the cards while the first page loads, so the page doesn't jump when they arrive. */
function Skeleton({ layout, label }: { layout: "grid" | "list"; label: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden className={cn("grid motion-safe:animate-pulse", layout === "grid" ? GRID : LIST)}>
        {Array.from({ length: layout === "grid" ? 8 : 6 }, (_, index) => (
          <div key={index} className={layout === "grid" ? "aspect-square rounded-[18px] bg-element md:aspect-[4/3] md:rounded-[22px]" : tileClasses({ size: "md", className: "h-24" })} />
        ))}
      </div>
    </div>
  );
}

export default function HubPage() {
  return (
    // useSearchParams needs a boundary; the page itself loads after sign-in, in the browser.
    <Suspense>
      <HubScreen />
    </Suspense>
  );
}
