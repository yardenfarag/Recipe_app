import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShareSaveError, useSharedRecipe } from "@/lib/share/useSharedRecipe";

const getRecipeShare = vi.fn();
const claimRecipeShare = vi.fn();
const fetchRecipeByUrl = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@shared/lib/supabase/recipeShare", () => ({
  getRecipeShare: (...args: unknown[]) => getRecipeShare(...args),
  claimRecipeShare: (...args: unknown[]) => claimRecipeShare(...args),
}));
vi.mock("@shared/lib/supabase/recipes", () => ({
  fetchRecipeByUrl: (...args: unknown[]) => fetchRecipeByUrl(...args),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user, session: null, loading: false }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en" }) }));

const snapshot = (fields: Record<string, unknown> = {}) => ({
  title: "Shared Soup",
  original_url: "https://www.youtube.com/watch?v=abc123def45",
  ingredients: [{ name: "salt", quantity: 1, unit: "pinch" }],
  instructions: [{ step: 1, text: "Cook it." }],
  servings: 2,
  extraction_status: "full",
  source_language: "en",
  ...fields,
});

beforeEach(() => {
  user = { id: "u1" };
  getRecipeShare.mockReset().mockResolvedValue({ status: "ok", token: "tok-1", recipe: snapshot() });
  claimRecipeShare.mockReset().mockResolvedValue({ status: "ok", recipeId: "recipe-9", alreadyClaimed: false });
  fetchRecipeByUrl.mockReset().mockResolvedValue(null);
});

describe("useSharedRecipe", () => {
  it("loads the shared recipe by its token and builds it for the page", async () => {
    const { result } = renderHook(() => useSharedRecipe(" tok-1 "));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getRecipeShare).toHaveBeenCalledWith("tok-1");
    const ready = result.current as Extract<typeof result.current, { status: "ready" }>;
    expect(ready.display.title).toBe("Shared Soup");
    expect(ready.display.recipe.id).toBe("share-tok-1");
    expect(ready.libraryRecipeId).toBeNull();
  });

  it("finds the copy already in the library by its source link, matched the way saving matches it", async () => {
    fetchRecipeByUrl.mockResolvedValue({ id: "recipe-3" });
    getRecipeShare.mockResolvedValue({ status: "ok", token: "tok-1", recipe: snapshot({ extraction_source: "invented" }) });
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchRecipeByUrl).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc123def45", "invented");
    const ready = result.current as Extract<typeof result.current, { status: "ready" }>;
    expect(ready.libraryRecipeId).toBe("recipe-3");

    // Saving opens that copy, without claiming the link again.
    await expect(ready.save()).resolves.toEqual({ recipeId: "recipe-3", alreadySaved: true });
    expect(claimRecipeShare).not.toHaveBeenCalled();
  });

  it("doesn't look in the library for a guest", async () => {
    user = null;
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchRecipeByUrl).not.toHaveBeenCalled();
  });

  it("still offers Save when the library check fails", async () => {
    fetchRecipeByUrl.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect((result.current as { libraryRecipeId: string | null }).libraryRecipeId).toBeNull();
  });

  it("saves by claiming the link, then knows the copy is in the library", async () => {
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let saved: unknown;
    await act(async () => {
      saved = await (result.current as Extract<typeof result.current, { status: "ready" }>).save();
    });
    expect(claimRecipeShare).toHaveBeenCalledWith("tok-1");
    expect(saved).toEqual({ recipeId: "recipe-9", alreadySaved: false });
    expect((result.current as { libraryRecipeId: string | null }).libraryRecipeId).toBe("recipe-9");
  });

  it("passes on that the server already had it saved", async () => {
    claimRecipeShare.mockResolvedValue({ status: "ok", recipeId: "recipe-4", alreadyClaimed: true });
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await expect((result.current as Extract<typeof result.current, { status: "ready" }>).save()).resolves.toEqual({
      recipeId: "recipe-4",
      alreadySaved: true,
    });
  });

  it("throws the server's code when saving fails", async () => {
    claimRecipeShare.mockResolvedValue({ status: "failed", message: "Share not found", code: "share_not_found" });
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const error = await (result.current as Extract<typeof result.current, { status: "ready" }>).save().catch((caught) => caught);
    expect(error).toBeInstanceOf(ShareSaveError);
    expect(error.code).toBe("share_not_found");
  });

  it("a revoked or unknown link is missing", async () => {
    getRecipeShare.mockResolvedValue({ status: "failed", message: "Share not found", code: "share_not_found" });
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("missing"));
  });

  it("an empty token is missing, without asking the server", async () => {
    const { result } = renderHook(() => useSharedRecipe("  "));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(getRecipeShare).not.toHaveBeenCalled();
  });

  it("any other failure can be retried", async () => {
    getRecipeShare.mockResolvedValueOnce({ status: "failed", message: "Failed to send a request to the Edge Function" });
    const { result } = renderHook(() => useSharedRecipe("tok-1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => (result.current as Extract<typeof result.current, { status: "error" }>).reload());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getRecipeShare).toHaveBeenCalledTimes(2);
  });
});
