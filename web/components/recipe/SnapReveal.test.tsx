import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SNAP_REVEAL } from "@shared/lib/snapReveal";

import { SavedFlight, SnapRevealProvider, useIngredientReveal, useSnapRevealPhase } from "@/components/recipe/SnapReveal";

function reducedMotion(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: on && query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe("useSnapRevealPhase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("plays, then sends the card to the Library when the reveal ends, then lands", () => {
    const { result } = renderHook(() => useSnapRevealPhase(true));
    expect(result.current.phase).toBe("playing");
    act(() => {
      vi.advanceTimersByTime(SNAP_REVEAL.total);
    });
    expect(result.current.phase).toBe("flight");
    act(() => result.current.land());
    expect(result.current.phase).toBe("landed");
  });

  it("skips to the card at once when the cook clicks", () => {
    const { result } = renderHook(() => useSnapRevealPhase(true));
    act(() => result.current.skip());
    expect(result.current.phase).toBe("flight");
  });

  it("shows everything at once with reduced motion, and on any later visit", () => {
    reducedMotion(true);
    expect(renderHook(() => useSnapRevealPhase(true)).result.current.phase).toBe("landed");
    reducedMotion(false);
    expect(renderHook(() => useSnapRevealPhase(false)).result.current.phase).toBe("landed");
  });
});

describe("useIngredientReveal", () => {
  function Rows({ count }: { count: number }) {
    const reveal = useIngredientReveal();
    return (
      <ul>
        {Array.from({ length: count }, (_, index) => (
          <li key={index} {...reveal(index, count)}>
            {`row ${index}`}
          </li>
        ))}
      </ul>
    );
  }

  it("times each row one after another while the reveal plays", () => {
    render(
      <SnapRevealProvider value>
        <Rows count={3} />
      </SnapRevealProvider>,
    );
    const delays = screen.getAllByRole("listitem").map((row) => row.style.getPropertyValue("--reveal-at"));
    expect(delays).toEqual(["450ms", "540ms", "630ms"]);
    expect(screen.getByText("row 0").hasAttribute("data-reveal")).toBe(true);
  });

  it("adds nothing outside the reveal", () => {
    render(<Rows count={2} />);
    for (const row of screen.getAllByRole("listitem")) {
      expect(row.hasAttribute("data-reveal")).toBe(false);
      expect(row.getAttribute("style")).toBeNull();
    }
  });
});

describe("SavedFlight", () => {
  it("lands at once where the browser can't animate", () => {
    const onLanded = vi.fn();
    // jsdom has no Web Animations API.
    render(<SavedFlight from={() => null} imageUrl={null} title="Shakshuka" onLanded={onLanded} />);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});
