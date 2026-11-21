import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeCard } from "@shared/types/recipeCard";

import { DEFAULT_HUB_FILTERS } from "@/lib/hub/hubAddress";
import { resetHubSnapshot, useHub } from "@/lib/hub/useHub";

const fetchHubCards = vi.fn();
const fetchHubTags = vi.fn();
const fetchCloudKitchenProfile = vi.fn();

vi.mock("@shared/lib/supabase/cookingHub", () => ({
  fetchHubCards: (...args: unknown[]) => fetchHubCards(...args),
  fetchHubTags: (...args: unknown[]) => fetchHubTags(...args),
}));
vi.mock("@shared/lib/supabase/kitchen", () => ({
  fetchCloudKitchenProfile: (...args: unknown[]) => fetchCloudKitchenProfile(...args),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));

const card = (id: string): RecipeCard => ({ id, title: `Card ${id}` }) as RecipeCard;
const page = (from: number, count: number) => Array.from({ length: count }, (_, index) => card(String(from + index)));

beforeEach(() => {
  resetHubSnapshot();
  fetchHubCards.mockReset();
  fetchHubTags.mockReset().mockResolvedValue(["vegan", "quick"]);
  fetchCloudKitchenProfile.mockReset().mockResolvedValue({ diets: ["vegan", "gluten_free"] });
});

describe("useHub", () => {
  it("asks for the first page with the same query as the mobile app, diets first", async () => {
    fetchHubCards.mockResolvedValue({ cards: page(0, 2), hasMore: false, total: 2 });
    const { result } = renderHook(() => useHub({ search: "soup", tags: ["vegan"], sort: "newest", platform: "youtube" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchHubCards).toHaveBeenCalledTimes(1);
    expect(fetchHubCards).toHaveBeenCalledWith({
      search: "soup",
      tags: ["vegan"],
      sort: "newest",
      platform: "youtube",
      diets: ["gluten_free", "vegan"],
      offset: 0,
      limit: 40,
      includeCount: true,
    });
    expect(result.current.cards).toHaveLength(2);
    expect(result.current.total).toBe(2);
    expect(result.current.diets).toEqual(["gluten_free", "vegan"]);
    expect(fetchHubTags).toHaveBeenCalledWith("youtube");
  });

  it("still loads, in plain order, when the kitchen profile can't be read", async () => {
    fetchCloudKitchenProfile.mockRejectedValue(new Error("offline"));
    fetchHubCards.mockResolvedValue({ cards: page(0, 1), hasMore: false, total: 1 });
    const { result } = renderHook(() => useHub(DEFAULT_HUB_FILTERS));
    await waitFor(() => expect(result.current.cards).toHaveLength(1));
    expect(fetchHubCards.mock.calls[0][0].diets).toEqual([]);
  });

  it("loads the next page after the cards already shown, without counting again", async () => {
    fetchHubCards.mockResolvedValueOnce({ cards: page(0, 40), hasMore: true, total: 50 });
    const { result } = renderHook(() => useHub(DEFAULT_HUB_FILTERS));
    await waitFor(() => expect(result.current.cards).toHaveLength(40));

    fetchHubCards.mockResolvedValueOnce({ cards: [card("39"), ...page(40, 10)], hasMore: false, total: null });
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.cards).toHaveLength(50));
    expect(fetchHubCards.mock.calls[1][0]).toMatchObject({ offset: 40, limit: 40, includeCount: false });
    expect(result.current.hasMore).toBe(false);
    expect(result.current.total).toBe(50);
  });

  it("waits for typing to pause before searching", async () => {
    fetchHubCards.mockResolvedValue({ cards: [], hasMore: false, total: 0 });
    const { result } = renderHook(() => useHub(DEFAULT_HUB_FILTERS));
    await waitFor(() => expect(fetchHubCards).toHaveBeenCalledTimes(1));

    act(() => result.current.setSearch("p"));
    act(() => result.current.setSearch("pasta"));
    await waitFor(() => expect(fetchHubCards).toHaveBeenCalledTimes(2));
    expect(fetchHubCards.mock.calls[1][0].search).toBe("pasta");
  });

  it("says when loading failed, and tries again", async () => {
    fetchHubCards.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useHub(DEFAULT_HUB_FILTERS));
    await waitFor(() => expect(result.current.error).toBe("offline"));
    expect(result.current.cards).toEqual([]);

    fetchHubCards.mockResolvedValueOnce({ cards: page(0, 3), hasMore: false, total: 3 });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.cards).toHaveLength(3));
    expect(result.current.error).toBeNull();
  });

  it("coming back to the same list shows it at once, then checks it again", async () => {
    fetchHubCards.mockResolvedValue({ cards: page(0, 40), hasMore: true, total: 90 });
    const first = renderHook(() => useHub(DEFAULT_HUB_FILTERS));
    await waitFor(() => expect(first.result.current.cards).toHaveLength(40));
    first.unmount();

    fetchHubCards.mockClear();
    const again = renderHook(() => useHub(DEFAULT_HUB_FILTERS));
    expect(again.result.current.loading).toBe(false);
    expect(again.result.current.cards).toHaveLength(40);
    await waitFor(() => expect(fetchHubCards).toHaveBeenCalledTimes(1));
    expect(fetchHubCards.mock.calls[0][0]).toMatchObject({ offset: 0, limit: 40, includeCount: true });
  });

  it("toggles tags, keeps chosen ones in the choices, and clears every filter", async () => {
    fetchHubCards.mockResolvedValue({ cards: [], hasMore: false, total: 0 });
    const { result } = renderHook(() => useHub({ ...DEFAULT_HUB_FILTERS, tags: ["dessert"] }));
    await waitFor(() => expect(result.current.availableTags).toEqual(["dessert", "vegan", "quick"]));

    act(() => result.current.toggleTag("vegan"));
    expect(result.current.selectedTags).toEqual(["dessert", "vegan"]);
    act(() => result.current.toggleTag("dessert"));
    expect(result.current.selectedTags).toEqual(["vegan"]);

    act(() => {
      result.current.setSort("newest");
      result.current.setPlatform("web");
      result.current.setSearch("x");
    });
    act(() => result.current.clearFilters());
    expect(result.current.selectedTags).toEqual([]);
    expect(result.current.sort).toBe("popular");
    expect(result.current.platform).toBe("all");
    expect(result.current.search).toBe("");
  });
});
