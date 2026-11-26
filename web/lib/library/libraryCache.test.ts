import { beforeEach, describe, expect, it } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import {
  forgetLibrary,
  libraryKey,
  patchLibrary,
  readCollections,
  readLibrary,
  removeFromLibrary,
  writeCollections,
  writeLibrary,
} from "./libraryCache";

const recipe = (id: string, extra: Partial<Recipe> = {}) => ({ id, title: id, is_favorite: false, ...extra }) as Recipe;
const KEY = libraryKey("u1", "en", 40);

describe("the Library's memory", () => {
  beforeEach(() => forgetLibrary());

  it("gives back what was kept for the same account, language and page size only", () => {
    writeLibrary({ key: KEY, recipes: [recipe("a")], total: 1, loaded: 1 });
    expect(readLibrary(KEY)?.recipes.map((r) => r.id)).toEqual(["a"]);
    expect(readLibrary(libraryKey("u2", "en", 40))).toBeNull();
    expect(readLibrary(libraryKey("u1", "he", 40))).toBeNull();
  });

  it("drops a recipe deleted elsewhere, and counts it gone", () => {
    writeLibrary({ key: KEY, recipes: [recipe("a"), recipe("b")], total: 5, loaded: 2 });
    removeFromLibrary("a");
    expect(readLibrary(KEY)).toMatchObject({ recipes: [{ id: "b" }], total: 4, loaded: 1 });
    // One it never had changes nothing.
    removeFromLibrary("zzz");
    expect(readLibrary(KEY)?.total).toBe(4);
  });

  it("takes a heart changed elsewhere", () => {
    writeLibrary({ key: KEY, recipes: [recipe("a"), recipe("b")], total: 2, loaded: 2 });
    patchLibrary("b", { is_favorite: true });
    expect(readLibrary(KEY)?.recipes.map((r) => r.is_favorite)).toEqual([false, true]);
  });

  it("keeps the collections per account", () => {
    writeCollections("u1", [{ id: "c1", name: "Weeknight", recipeIds: [] }] as never);
    expect(readCollections("u1")).toHaveLength(1);
    expect(readCollections("u2")).toBeNull();
  });

  it("forgets everything on sign-out", () => {
    writeLibrary({ key: KEY, recipes: [recipe("a")], total: 1, loaded: 1 });
    writeCollections("u1", []);
    forgetLibrary();
    expect(readLibrary(KEY)).toBeNull();
    expect(readCollections("u1")).toBeNull();
  });
});
