"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AvoidList } from "@shared/lib/avoidList";
import { EMPTY_HUB_AVOID, hubAvoidKey, hubAvoidOf, type HubAvoid } from "@shared/lib/hubAvoid";
import { fetchHubCards, fetchHubTags, type HubSort } from "@shared/lib/supabase/cookingHub";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import type { HubPlatform, RecipeCard } from "@shared/types/recipeCard";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import type { HubFilters } from "@/lib/hub/hubAddress";

/** The same pages as the mobile app (src/hooks/useCookingHub.ts). */
const PAGE_SIZE = 40;
const REFRESH_PAGE_CAP = PAGE_SIZE * 3;
const SEARCH_DEBOUNCE_MS = 250;

type LoadMode = "replace" | "append" | "refresh";

/** `language`: the app's, for card titles in it (PIN-77). */
type Query = HubFilters & { diets: string[]; avoid: HubAvoid; language: string };

/**
 * The last list shown, kept while the tab is open. Opening a Hub recipe and coming Back shows the same cards at
 * once (so the page doesn't jump to the top), then checks them again quietly.
 */
type Snapshot = { key: string; dietKey: string; avoidKey: string; cards: RecipeCard[]; hasMore: boolean; total: number };
let lastView: Snapshot | null = null;

/** For tests: forget the kept list. */
export function resetHubSnapshot() {
  lastView = null;
}

const viewKey = (userId: string | undefined, filters: HubFilters, language: string) =>
  JSON.stringify([userId ?? "", language, filters.search.trim(), filters.tags, filters.sort, filters.platform]);

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

const NO_AVOID: AvoidList = { allergies: [], otherAllergies: [], dislikes: [] };

/**
 * The Cooking Hub list: search, source, tags and sort, sorted for the cook (their diets first, their allergies last,
 * foods they don't like lower; PIN-83, PIN-180), a page of 40
 * at a time. The same queries as the mobile app's useCookingHub, through the same shared calls, so the same
 * filters give the same recipes.
 */
export function useHub(initial: HubFilters) {
  const { user } = useAuth();
  const userId = user?.id;
  const { language } = useLanguage();

  const [restored] = useState(() => {
    const snapshot = lastView;
    return snapshot && snapshot.key === viewKey(userId, initial, language) ? snapshot : null;
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

  // The kitchen profile's diets and avoid list: the Hub is sorted with them (PIN-83, PIN-180). The list waits for
  // them, so the first page is already in the cook's order. If the profile can't be read, the list is in plain order.
  const [kitchen, setKitchen] = useState<{ userId: string; diets: string[]; avoidList: AvoidList } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchCloudKitchenProfile(userId)
      .then((profile) => ({
        diets: profile.diets as string[],
        avoidList: {
          allergies: profile.allergies ?? [],
          otherAllergies: profile.otherAllergies ?? [],
          dislikes: profile.dislikes ?? [],
        },
      }))
      .catch(() => ({ diets: [] as string[], avoidList: NO_AVOID }))
      .then((read) => {
        if (!cancelled) setKitchen({ userId, ...read });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const kitchenReady = kitchen != null && kitchen.userId === userId;
  const diets = useMemo(() => (kitchenReady ? [...kitchen.diets].sort() : []), [kitchenReady, kitchen]);
  const dietKey = diets.join(",");
  const avoidList = kitchenReady ? kitchen.avoidList : NO_AVOID;
  const avoid = useMemo(() => (kitchenReady ? hubAvoidOf(kitchen.avoidList) : EMPTY_HUB_AVOID), [kitchenReady, kitchen]);
  const avoidKey = hubAvoidKey(avoid);

  const requestRef = useRef(0);
  const appendLock = useRef(false);
  const hasMoreRef = useRef(restored?.hasMore ?? false);
  const cardsRef = useRef<RecipeCard[]>(restored?.cards ?? []);
  const hasLoadedRef = useRef(restored != null);
  const restoredRef = useRef(restored);
  const failedModeRef = useRef<LoadMode | null>(null);
  const queryRef = useRef<Query>({ ...initial, diets: [], avoid: EMPTY_HUB_AVOID, language });
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
        avoid: query.avoid,
        language: query.language,
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
        key: viewKey(userIdRef.current, query, query.language),
        dietKey: query.diets.join(","),
        avoidKey: hubAvoidKey(query.avoid),
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
      avoid,
      language,
    };
    // Back from a Hub recipe: the kept list is already showing, so only check it again.
    const kept = restoredRef.current;
    restoredRef.current = null;
    const sameAsKept =
      kept != null && kept.dietKey === dietKey && kept.avoidKey === avoidKey && kept.key === viewKey(userIdRef.current, queryRef.current, language);
    void run(sameAsKept ? "refresh" : "replace");
  }, [debouncedSearch, tagKey, sort, platform, dietKey, avoid, avoidKey, language, kitchenReady, run]);

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
    /** The cook's avoid list, for the flags on the cards. */
    avoidList,
    /** What the order does with it: allergies last, dislikes lower. */
    avoidsAllergies: avoid.allergens.length > 0 || avoid.allergyWords.length > 0,
    avoidsDislikes: avoid.dislikes.length > 0 || avoid.dislikeWords.length > 0,
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
