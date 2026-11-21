import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useServings } from "@/lib/recipe/useServings";

afterEach(() => window.localStorage.clear());

describe("useServings", () => {
  it("starts at the recipe's count, remembers a choice per recipe, and never goes below one or above 99", () => {
    const { result } = renderHook(() => useServings("r1", 4));
    expect(result.current.servings).toBe(4);
    act(() => result.current.setServings(6));
    expect(result.current.servings).toBe(6);
    expect(window.localStorage.getItem("pinch:servings:r1")).toBe("6");
    act(() => result.current.setServings(0));
    expect(result.current.servings).toBe(1);
    act(() => result.current.setServings(500));
    expect(result.current.servings).toBe(99);

    expect(renderHook(() => useServings("r2", 3)).result.current.servings).toBe(3);
    expect(renderHook(() => useServings("r1", 4)).result.current.servings).toBe(99);
  });

  it("forgets the choice when it is back at the recipe's own count", () => {
    const { result } = renderHook(() => useServings("r1", 4));
    act(() => result.current.setServings(5));
    act(() => result.current.setServings(4));
    expect(window.localStorage.getItem("pinch:servings:r1")).toBeNull();
  });

  it("is null until the recipe's count is known", () => {
    window.localStorage.setItem("pinch:servings:r1", "6");
    expect(renderHook(() => useServings("r1", null)).result.current.servings).toBeNull();
  });
});

describe("useMeasurementSystem", () => {
  it("uses the mobile app's key and keeps every reader in step", () => {
    const a = renderHook(() => useMeasurementSystem());
    const b = renderHook(() => useMeasurementSystem());
    expect(a.result.current.system).toBe("original");
    act(() => a.result.current.setSystem("metric"));
    expect(window.localStorage.getItem("pinch:measurementSystem")).toBe("metric");
    expect(b.result.current.system).toBe("metric");
  });
});
