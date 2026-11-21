/**
 * The arithmetic behind reordering a list by keyboard and by dragging (web/components/editor/ReorderableList.tsx).
 * Indexes follow shared/lib/recipeEditor.ts `moveIngredient` / `moveStep`: `to` is the item's index after the move.
 */

/** Where a key press moves the item at `index`, or null when the key doesn't move it (or it can't go further). */
export function keyboardMoveTarget(key: string, index: number, length: number): number | null {
  const target =
    key === "ArrowUp" ? index - 1 : key === "ArrowDown" ? index + 1 : key === "Home" ? 0 : key === "End" ? length - 1 : null;
  if (target === null || target < 0 || target >= length || target === index) return null;
  return target;
}

/** A row's place on screen when the drag started. */
export type RowBox = { top: number; height: number };

/**
 * The index the dragged row would land at: the number of other rows whose middle is above the dragged row's middle.
 * `offset` is how far the pointer has moved since the drag started.
 */
export function dropTargetIndex(boxes: RowBox[], from: number, offset: number): number {
  const dragged = boxes[from];
  if (!dragged) return from;
  const middle = dragged.top + offset + dragged.height / 2;
  let target = 0;
  boxes.forEach((box, index) => {
    if (index !== from && box.top + box.height / 2 < middle) target += 1;
  });
  return target;
}

/**
 * How far to slide each row while one is dragged, so a gap opens where it would land. The dragged row itself
 * follows the pointer (`offset`).
 */
export function dragShift(index: number, from: number, to: number, offset: number, boxes: RowBox[]): number {
  if (index === from) return offset;
  const dragged = boxes[from];
  if (!dragged) return 0;
  // The space the dragged row takes: its height plus the list's gap between rows.
  const gap = boxes.length > 1 ? Math.max(0, boxes[1].top - (boxes[0].top + boxes[0].height)) : 0;
  const step = dragged.height + gap;
  if (from < to && index > from && index <= to) return -step;
  if (to < from && index >= to && index < from) return step;
  return 0;
}
