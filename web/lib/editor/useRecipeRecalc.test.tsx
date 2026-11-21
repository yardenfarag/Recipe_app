import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import { useRecipeRecalc } from "@/lib/editor/useRecipeRecalc";

const mocks = vi.hoisted(() => ({ fetchRecipeById: vi.fn(), saveRecipeEdit: vi.fn() }));

vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@shared/lib/supabase/recipes", () => ({ fetchRecipeById: mocks.fetchRecipeById }));
vi.mock("@shared/lib/supabase/saveRecipeEdit", () => ({ saveRecipeEdit: mocks.saveRecipeEdit }));

const NOW = Date.parse("2026-11-21T12:00:00Z");
const recipe = (fields: Partial<Recipe>) => ({ id: "r1", title: "Soup", ...fields }) as Recipe;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useRecipeRecalc", () => {
  it("shows the fields updating and reads the recipe again until they're done", async () => {
    const running = recipe({ recalc_pending: ["calories"], recalc_started_at: new Date(NOW - 5000).toISOString() });
    const done = recipe({ recalc_pending: [], calories: 420 });
    mocks.fetchRecipeById.mockResolvedValue(done);
    const onRefreshed = vi.fn();
    const { result } = renderHook(() => useRecipeRecalc(running, onRefreshed));
    expect(result.current).toEqual(["calories"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(mocks.fetchRecipeById).toHaveBeenCalledWith("r1");
    expect(onRefreshed).toHaveBeenCalledWith(done);
  });

  it("retries once a run that failed before the recipe opened", async () => {
    const stale = recipe({ recalc_pending: ["calories"], recalc_started_at: new Date(NOW - 10 * 60_000).toISOString() });
    const fixed = recipe({ recalc_pending: [] });
    mocks.saveRecipeEdit.mockResolvedValue({ status: "saved", recipe: fixed, recalculating: [], recalculation: "started" });
    const onRefreshed = vi.fn();
    const { result, rerender } = renderHook(() => useRecipeRecalc(stale, onRefreshed));
    expect(result.current).toEqual([]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.saveRecipeEdit).toHaveBeenCalledWith({ mode: "retry", recipe_id: "r1", app_language: "en" });
    expect(onRefreshed).toHaveBeenCalledWith(fixed);
    rerender();
    expect(mocks.saveRecipeEdit).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a recipe with nothing pending", () => {
    const { result } = renderHook(() => useRecipeRecalc(recipe({ recalc_pending: [] }), vi.fn()));
    expect(result.current).toEqual([]);
    expect(mocks.saveRecipeEdit).not.toHaveBeenCalled();
  });
});
