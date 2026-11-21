import { isHubPlatform } from "@shared/lib/recipeCardKey";
import type { HubSort } from "@shared/lib/supabase/cookingHub";
import type { HubPlatform } from "@shared/types/recipeCard";

export type HubFilters = {
  search: string;
  tags: string[];
  sort: HubSort;
  platform: HubPlatform | "all";
};

export const DEFAULT_HUB_FILTERS: HubFilters = { search: "", tags: [], sort: "popular", platform: "all" };

/** What the address says the Hub should show, so a filtered Hub can be linked, reloaded and come Back to. */
export function hubFiltersFromAddress(params: URLSearchParams): HubFilters {
  const source = params.get("source");
  return {
    search: params.get("q") ?? "",
    sort: params.get("sort") === "newest" ? "newest" : "popular",
    platform: isHubPlatform(source) ? source : "all",
    // Hub tags are stored as written, so they are kept as they come (unlike the Library's).
    tags: [...new Set(params.getAll("tag").flatMap((tag) => tag.split(",")).map((tag) => tag.trim()).filter(Boolean))],
  };
}

/** The query string for these filters, without the defaults: "" for the plain Hub. */
export function hubAddressQuery(filters: HubFilters): string {
  const next = new URLSearchParams();
  if (filters.search.trim()) next.set("q", filters.search.trim());
  if (filters.platform !== "all") next.set("source", filters.platform);
  if (filters.sort !== "popular") next.set("sort", filters.sort);
  if (filters.tags.length > 0) next.set("tag", filters.tags.join(","));
  const query = next.toString();
  return query ? `?${query}` : "";
}

export function hubFiltersActive(filters: Pick<HubFilters, "tags" | "sort" | "platform">): boolean {
  return filters.tags.length > 0 || filters.sort !== "popular" || filters.platform !== "all";
}

const LAST_LIST_KEY = "pinch:hubListQuery";

/** Remembers the Hub's filters for this tab, so "Back to Hub" on a Hub recipe returns to the same list. */
export function rememberHubQuery(query: string) {
  try {
    window.sessionStorage.setItem(LAST_LIST_KEY, query);
  } catch {
    // Storage blocked: Back to Hub opens the plain Hub.
  }
}

export function lastHubHref(): string {
  try {
    const query = window.sessionStorage.getItem(LAST_LIST_KEY) ?? "";
    return query.startsWith("?") ? `/hub${query}` : "/hub";
  } catch {
    return "/hub";
  }
}
