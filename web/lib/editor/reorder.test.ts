import { describe, expect, it } from "vitest";

import { dragShift, dropTargetIndex, keyboardMoveTarget, type RowBox } from "@/lib/editor/reorder";

describe("keyboardMoveTarget", () => {
  it("moves one up or down, or to either end", () => {
    expect(keyboardMoveTarget("ArrowUp", 2, 4)).toBe(1);
    expect(keyboardMoveTarget("ArrowDown", 2, 4)).toBe(3);
    expect(keyboardMoveTarget("Home", 2, 4)).toBe(0);
    expect(keyboardMoveTarget("End", 1, 4)).toBe(3);
  });

  it("does nothing past the ends or for other keys", () => {
    expect(keyboardMoveTarget("ArrowUp", 0, 4)).toBeNull();
    expect(keyboardMoveTarget("ArrowDown", 3, 4)).toBeNull();
    expect(keyboardMoveTarget("Home", 0, 4)).toBeNull();
    expect(keyboardMoveTarget("ArrowLeft", 1, 4)).toBeNull();
  });
});

// Four rows 40 px tall with an 8 px gap.
const boxes: RowBox[] = [0, 48, 96, 144].map((top) => ({ top, height: 40 }));

describe("dropTargetIndex", () => {
  it("stays put for a small nudge", () => {
    expect(dropTargetIndex(boxes, 1, 10)).toBe(1);
    expect(dropTargetIndex(boxes, 1, -10)).toBe(1);
  });

  it("passes a row once its middle is crossed", () => {
    expect(dropTargetIndex(boxes, 0, 40)).toBe(0);
    expect(dropTargetIndex(boxes, 0, 50)).toBe(1);
    expect(dropTargetIndex(boxes, 0, 200)).toBe(3);
    expect(dropTargetIndex(boxes, 3, -200)).toBe(0);
    expect(dropTargetIndex(boxes, 3, -60)).toBe(2);
  });
});

describe("dragShift", () => {
  it("opens a gap where the dragged row will land", () => {
    // Row 0 dragged to index 2: rows 1 and 2 slide up one row (40 + 8 gap).
    expect([0, 1, 2, 3].map((i) => dragShift(i, 0, 2, 100, boxes))).toEqual([100, -48, -48, 0]);
    // Row 3 dragged to index 1: rows 1 and 2 slide down.
    expect([0, 1, 2, 3].map((i) => dragShift(i, 3, 1, -100, boxes))).toEqual([0, 48, 48, -100]);
  });
});
