import { describe, expect, it } from "vitest";

import { cookModeMove, swipeMove } from "@/lib/cook/cookModeKeys";

const ltr = { direction: "ltr" as const, onControl: false };
const rtl = { direction: "rtl" as const, onControl: false };

describe("cookModeMove", () => {
  it("in a left-to-right app, the right arrow goes forward", () => {
    expect(cookModeMove({ key: "ArrowRight" }, ltr)).toBe("next");
    expect(cookModeMove({ key: "ArrowLeft" }, ltr)).toBe("back");
  });

  it("in a right-to-left app, the left arrow goes forward, where Next sits", () => {
    expect(cookModeMove({ key: "ArrowLeft" }, rtl)).toBe("next");
    expect(cookModeMove({ key: "ArrowRight" }, rtl)).toBe("back");
  });

  it("Space goes forward and Shift+Space back, except on a button, which Space presses", () => {
    expect(cookModeMove({ key: " " }, ltr)).toBe("next");
    expect(cookModeMove({ key: " ", shiftKey: true }, ltr)).toBe("back");
    expect(cookModeMove({ key: " " }, { ...ltr, onControl: true })).toBeNull();
    // Arrows still move from a focused button.
    expect(cookModeMove({ key: "ArrowRight" }, { ...ltr, onControl: true })).toBe("next");
  });

  it("follows a presentation clicker, and Home and End", () => {
    expect(cookModeMove({ key: "PageDown" }, rtl)).toBe("next");
    expect(cookModeMove({ key: "PageUp" }, rtl)).toBe("back");
    expect(cookModeMove({ key: "Home" }, ltr)).toBe("first");
    expect(cookModeMove({ key: "End" }, ltr)).toBe("last");
  });

  it("leaves shortcuts with modifiers and other keys alone", () => {
    expect(cookModeMove({ key: "ArrowLeft", altKey: true }, ltr)).toBeNull();
    expect(cookModeMove({ key: "ArrowRight", metaKey: true }, ltr)).toBeNull();
    expect(cookModeMove({ key: "a" }, ltr)).toBeNull();
    expect(cookModeMove({ key: "ArrowDown" }, ltr)).toBeNull();
  });
});

describe("swipeMove", () => {
  it("a swipe towards the start goes forward, like turning a page", () => {
    expect(swipeMove(-120, 10, "ltr")).toBe("next");
    expect(swipeMove(120, 10, "ltr")).toBe("back");
    expect(swipeMove(120, 10, "rtl")).toBe("next");
    expect(swipeMove(-120, 10, "rtl")).toBe("back");
  });

  it("ignores short or mostly vertical moves (scrolling)", () => {
    expect(swipeMove(-30, 0, "ltr")).toBeNull();
    expect(swipeMove(-100, 90, "ltr")).toBeNull();
  });
});
