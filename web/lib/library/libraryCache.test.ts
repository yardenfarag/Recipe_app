import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import {
  forgetLibrary,
  libraryKey,
  patchLibrary,
  readCollections,
  readLibrary,
  rememberedLibraryScroll,
  rememberLibraryScroll,
  removeFromLibrary,
  writeCollections,
  writeLibrary,
} from "./libraryCache";

const recipe = (id: string, extra: Partial<Recipe> = {}) => ({ id, title: id, is_favorite: false, ...extra }) as Recipe;
const KEY = libraryKey("u1", "en", 40);

/** Pretends the browser is on a history entry (the Navigation API's `currentEntry`). */
function onHistoryEntry(key: string | null) {
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: key ? { currentEntry: { key } } : undefined,
  });
}

describe("the Library's memory", () => {
  beforeEach(() => forgetLibrary());
  afterEach(() => onHistoryEntry(null));

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
    onHistoryEntry("entry-1");
    writeLibrary({ key: KEY, recipes: [recipe("a")], total: 1, loaded: 1 });
    writeCollections("u1", []);
    rememberLibraryScroll(500);
    forgetLibrary();
    expect(readLibrary(KEY)).toBeNull();
    expect(readCollections("u1")).toBeNull();
    expect(rememberedLibraryScroll()).toBeNull();
  });

  it("remembers the scroll position per history entry, so only Back and Forward return to it", () => {
    onHistoryEntry("entry-1");
    rememberLibraryScroll(1200);
    expect(rememberedLibraryScroll()).toBe(1200);
    // A link to the Library is a new entry: it opens at the top.
    onHistoryEntry("entry-2");
    expect(rememberedLibraryScroll()).toBeNull();
    onHistoryEntry("entry-1");
    expect(rememberedLibraryScroll()).toBe(1200);
  });

  it("restores nothing in a browser without the Navigation API", () => {
    onHistoryEntry(null);
    rememberLibraryScroll(800);
    expect(rememberedLibraryScroll()).toBeNull();
  });
});
