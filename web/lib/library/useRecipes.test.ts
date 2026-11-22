import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import { forgetLibrary, removeFromLibrary } from "./libraryCache";

const server = vi.hoisted(() => ({ recipes: [] as Partial<Recipe>[] }));
const fetchRecipesPage = vi.hoisted(() =>
  vi.fn(async (offset: number, limit: number) => ({ recipes: server.recipes.slice(offset, offset + limit), total: server.recipes.length })),
);
const fetchRecipes = vi.hoisted(() => vi.fn(async () => server.recipes));
vi.mock("@shared/lib/supabase/recipes", () => ({ fetchRecipesPage, fetchRecipes, setRecipeFavorite: vi.fn() }));
vi.mock("@shared/lib/supabase/recipeTranslations", () => ({ fetchRecipeTranslationsForLanguage: vi.fn(async () => ({})) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false, session: null }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), ready: true }) }));

import { useRecipes } from "./useRecipes";

const seed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `r${index + 1}`, title: `Recipe ${index + 1}`, source_language: "en", ingredients: [], instructions: [] }));
const titles = (recipes: Recipe[]) => recipes.map((recipe) => recipe.title);

describe("useRecipes", () => {
  beforeEach(() => {
    forgetLibrary();
    vi.clearAllMocks();
    server.recipes = seed(5);
  });

  it("loads the first time, then comes back with the same recipes at once and refreshes them quietly (PIN-174)", async () => {
    const first = renderHook(() => useRecipes(2));
    expect(first.result.current.loading).toBe(true);
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.error).toBeNull();
    expect(titles(first.result.current.recipes)).toEqual(["Recipe 1", "Recipe 2"]);
    await act(() => first.result.current.loadMore());
    expect(first.result.current.recipes).toHaveLength(4);
    first.unmount();

    // Renamed somewhere else meanwhile.
    server.recipes[0] = { ...server.recipes[0], title: "Renamed" };
    const again = renderHook(() => useRecipes(2));
    // On screen straight away, all four, with no loading state.
    expect(again.result.current.loading).toBe(false);
    expect(titles(again.result.current.recipes)).toEqual(["Recipe 1", "Recipe 2", "Recipe 3", "Recipe 4"]);
    // The refresh asks for as many as were showing, so the list doesn't shrink under the reader.
    await waitFor(() => expect(titles(again.result.current.recipes)[0]).toBe("Renamed"));
    expect(fetchRecipesPage).toHaveBeenLastCalledWith(0, 4);
    expect(again.result.current.recipes).toHaveLength(4);
  });

  it("refreshes the whole library when a filter had loaded it all", async () => {
    const first = renderHook(() => useRecipes(2));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(() => first.result.current.ensureAllLoaded());
    expect(first.result.current.recipes).toHaveLength(5);
    first.unmount();

    server.recipes = [{ id: "new", title: "Brand new", source_language: "en", ingredients: [], instructions: [] }, ...server.recipes];
    fetchRecipes.mockClear();
    const again = renderHook(() => useRecipes(2));
    expect(again.result.current.recipes).toHaveLength(5);
    await waitFor(() => expect(again.result.current.recipes).toHaveLength(6));
    expect(fetchRecipes).toHaveBeenCalledTimes(1);
    expect(again.result.current.hasMore).toBe(false);
  });

  it("doesn't show a recipe deleted elsewhere, even before the refresh", async () => {
    const first = renderHook(() => useRecipes(2));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    // Deleted on its own page.
    server.recipes = server.recipes.slice(1);
    removeFromLibrary("r1");
    const again = renderHook(() => useRecipes(2));
    expect(again.result.current.recipes.map((recipe) => recipe.id)).toEqual(["r2"]);
    await waitFor(() => expect(again.result.current.recipes.map((recipe) => recipe.id)).toEqual(["r2", "r3"]));
  });
});
