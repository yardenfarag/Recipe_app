"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchHubCards, fetchHubTags, type HubSort } from "@shared/lib/supabase/cookingHub";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import type { HubPlatform, RecipeCard } from "@shared/types/recipeCard";

import { useAuth } from "@/components/AuthProvider";
import type { HubFilters } from "@/lib/hub/hubAddress";

/** The same pages as the mobile app (src/hooks/useCookingHub.ts). */
const PAGE_SIZE = 40;
const REFRESH_PAGE_CAP = PAGE_SIZE * 3;
const SEARCH_DEBOUNCE_MS = 250;

type LoadMode = "replace" | "append" | "refresh";

type Query = HubFilters & { diets: string[] };

/**
 * The last list shown, kept while the tab is open. Opening a Hub recipe and coming Back shows the same cards at
 * once (so the page doesn't jump to the top), then checks them again quietly.
 */
type Snapshot = { key: string; dietKey: string; cards: RecipeCard[]; hasMore: boolean; total: number };
let lastView: Snapshot | null = null;

/** For tests: forget the kept list. */
export function resetHubSnapshot() {
  lastView = null;
}

const viewKey = (userId: string | undefined, filters: HubFilters) =>
  JSON.stringify([userId ?? "", filters.search.trim(), filters.tags, filters.sort, filters.platform]);

function dedupeAppend(current: RecipeCard[], page: RecipeCard[]): RecipeCard[] {
  const seen = new Set(current.map((card) => card.id));
  const next = [...current];
  for (const card of page) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    next.push(card);
  }
  return next;
}

/**
 * The Cooking Hub list: search, source, tags and sort, with recipes that fit the cook's diets first, a page of 40
 * at a time. The same queries as the mobile app's useCookingHub, through the same shared calls, so the same
 * filters give the same recipes.
 */
export function useHub(initial: HubFilters) {
  const { user } = useAuth();
  const userId = user?.id;

  const [restored] = useState(() => {
    const snapshot = lastView;
    return snapshot && snapshot.key === viewKey(userId, initial) ? snapshot : null;
  });

  const [cards, setCards] = useState<RecipeCard[]>(restored?.cards ?? []);
  const [loading, setLoading] = useState(!restored);
  const [querying, setQuerying] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when the failed load was the next page, so the screen can say so at the end of the list. */
  const [errorLoadingMore, setErrorLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(restored?.hasMore ?? false);
  const [total, setTotal] = useState(restored?.total ?? 0);
  /** Goes up when a new search or filter replaces the list, so the screen can bring its top into view. */
  const [listEpoch, setListEpoch] = useState(0);

  const [search, setSearch] = useState(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial.tags);
  const [sort, setSort] = useState<HubSort>(initial.sort);
  const [platform, setPlatform] = useState<HubPlatform | "all">(initial.platform);
  const [tagChoices, setTagChoices] = useState<string[]>([]);

  // The kitchen profile's diets: matching recipes come first (PIN-83). The list waits for them, so the first page
  // is already in diet order. If the profile can't be read, the list is in plain order.
  const [kitchen, setKitchen] = useState<{ userId: string; diets: string[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchCloudKitchenProfile(userId)
      .then((profile) => profile.diets as string[])
      .catch(() => [] as string[])
      .then((diets) => {
        if (!cancelled) setKitchen({ userId, diets });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const kitchenReady = kitchen != null && kitchen.userId === userId;
  const diets = useMemo(() => (kitchenReady ? [...kitchen.diets].sort() : []), [kitchenReady, kitchen]);
  const dietKey = diets.join(",");

  const requestRef = useRef(0);
  const appendLock = useRef(false);
  const hasMoreRef = useRef(restored?.hasMore ?? false);
  const cardsRef = useRef<RecipeCard[]>(restored?.cards ?? []);
  const hasLoadedRef = useRef(restored != null);
  const restoredRef = useRef(restored);
  const failedModeRef = useRef<LoadMode | null>(null);
  const queryRef = useRef<Query>({ ...initial, diets: [] });
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const run = useCallback(async (mode: LoadMode) => {
    if (mode === "append") {
      if (appendLock.current || !hasMoreRef.current) return;
      appendLock.current = true;
      setLoadingMore(true);
    }

    const requestId = ++requestRef.current;
    const query = queryRef.current;
    const offset = mode === "append" ? cardsRef.current.length : 0;
    const previousHasMore = hasMoreRef.current;
    if (mode !== "append") hasMoreRef.current = false;
    const limit = mode === "refresh" ? Math.min(Math.max(cardsRef.current.length, PAGE_SIZE), REFRESH_PAGE_CAP) : PAGE_SIZE;
    const hadLoaded = hasLoadedRef.current;

    if (mode === "replace" && hadLoaded) setQuerying(true);
    setError(null);
    setErrorLoadingMore(false);
    failedModeRef.current = null;

    try {
      const result = await fetchHubCards({
        search: query.search,
        tags: query.tags,
        sort: query.sort,
        platform: query.platform,
        diets: query.diets,
        offset,
        limit,
        includeCount: mode !== "append",
      });
      if (requestRef.current !== requestId) return;

      const next = mode === "append" ? dedupeAppend(cardsRef.current, result.cards) : result.cards;
      cardsRef.current = next;
      setCards(next);
      hasMoreRef.current = result.hasMore;
      setHasMore(result.hasMore);
      const nextTotal = typeof result.total === "number" ? result.total : null;
      if (nextTotal != null) setTotal(nextTotal);
      if (mode === "replace" && hadLoaded) setListEpoch((epoch) => epoch + 1);
      hasLoadedRef.current = true;
      lastView = {
        key: viewKey(userIdRef.current, query),
        dietKey: query.diets.join(","),
        cards: next,
        hasMore: result.hasMore,
        total: nextTotal ?? lastView?.total ?? next.length,
      };
    } catch (caught) {
      if (requestRef.current !== requestId) return;
      setError(caught instanceof Error ? caught.message : "load failed");
      setErrorLoadingMore(mode === "append");
      failedModeRef.current = mode;
      if (mode !== "append" && cardsRef.current.length === 0) {
        setTotal(0);
        setHasMore(false);
        hasMoreRef.current = false;
      } else if (mode !== "append") {
        hasMoreRef.current = previousHasMore;
      }
      hasLoadedRef.current = true;
    } finally {
      if (mode === "append") appendLock.current = false;
      if (requestRef.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
        setQuerying(false);
      }
    }
  }, []);

  const tagKey = selectedTags.join("\u0001");

  useEffect(() => {
    if (!kitchenReady) return;
    queryRef.current = {
      search: debouncedSearch,
      tags: tagKey ? tagKey.split("\u0001") : [],
      sort,
      platform,
      diets: dietKey ? dietKey.split(",") : [],
    };
    // Back from a Hub recipe: the kept list is already showing, so only check it again.
    const kept = restoredRef.current;
    restoredRef.current = null;
    const sameAsKept = kept != null && kept.dietKey === dietKey && kept.key === viewKey(userIdRef.current, queryRef.current);
    void run(sameAsKept ? "refresh" : "replace");
  }, [debouncedSearch, tagKey, sort, platform, dietKey, kitchenReady, run]);

  useEffect(() => {
    let cancelled = false;
    fetchHubTags(platform)
      .then((tags) => {
        if (!cancelled) setTagChoices(tags);
      })
      .catch(() => {
        // Keep the tags already on screen if the tag query fails.
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const loadMore = useCallback(() => void run("append"), [run]);

  /** Tries the load that failed again: the next page when that was it, else the whole list. */
  const retry = useCallback(() => void run(failedModeRef.current === "append" ? "append" : "replace"), [run]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((previous) => (previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag]));
  }, []);

  const clearTags = useCallback(() => setSelectedTags([]), []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedTags([]);
    setSort("popular");
    setPlatform("all");
  }, []);

  const availableTags = useMemo(() => {
    const extra = selectedTags.filter((tag) => !tagChoices.includes(tag));
    return [...extra, ...tagChoices];
  }, [selectedTags, tagChoices]);

  return {
    cards,
    loading,
    querying,
    loadingMore,
    error,
    errorLoadingMore,
    hasMore,
    total,
    listEpoch,
    diets,
    search,
    setSearch,
    selectedTags,
    toggleTag,
    clearTags,
    sort,
    setSort,
    platform,
    setPlatform,
    clearFilters,
    availableTags,
    loadMore,
    retry,
  };
}
