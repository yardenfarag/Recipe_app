import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cook/chime", () => ({ primeChime: vi.fn(), playChime: vi.fn() }));

import { playChime } from "@/lib/cook/chime";
import { secondsLeft, useCookTimers } from "@/lib/cook/useCookTimers";

describe("secondsLeft", () => {
  it("rounds up and never goes below zero", () => {
    expect(secondsLeft({ endsAt: 10_000 }, 0)).toBe(10);
    expect(secondsLeft({ endsAt: 10_000 }, 9_001)).toBe(1);
    expect(secondsLeft({ endsAt: 10_000 }, 12_000)).toBe(0);
  });
});

describe("useCookTimers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(playChime).mockClear();
  });

  it("counts down, chimes once and reports when done", () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useCookTimers({ onDone }));
    act(() => result.current.start("2 sec", 2, 3));
    expect(result.current.timers).toHaveLength(1);
    expect(secondsLeft(result.current.timers[0], result.current.now)).toBe(2);

    act(() => vi.advanceTimersByTime(1000));
    expect(secondsLeft(result.current.timers[0], result.current.now)).toBe(1);

    act(() => vi.advanceTimersByTime(1500));
    expect(secondsLeft(result.current.timers[0], result.current.now)).toBe(0);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ label: "2 sec", step: 3 });
    expect(playChime).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("restarts the same timer instead of adding a second, and keeps others", () => {
    const { result } = renderHook(() => useCookTimers());
    act(() => result.current.start("10 min", 600, 1));
    act(() => result.current.start("5 min", 300, 2));
    act(() => vi.advanceTimersByTime(60_000));
    act(() => result.current.start("10 min", 600, 1));
    expect(result.current.timers.map((timer) => timer.label)).toEqual(["5 min", "10 min"]);
    expect(secondsLeft(result.current.timers[1], result.current.now)).toBe(600);
  });

  it("stops a timer", () => {
    const { result } = renderHook(() => useCookTimers());
    act(() => result.current.start("10 min", 600, 1));
    act(() => result.current.stop(result.current.timers[0].id));
    expect(result.current.timers).toEqual([]);
  });
});
