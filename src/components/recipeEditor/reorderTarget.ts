export type RowLayout = { y: number; height: number };

/**
 * Where a dragged row lands: the number of other rows whose centre is above the dragged row's
 * centre. That is the index to insert at after removing the row (Array.splice semantics).
 */
export function reorderTargetIndex(layouts: RowLayout[], from: number, dy: number): number {
  const active = layouts[from];
  if (!active) return from;
  const center = active.y + active.height / 2 + dy;
  let target = 0;
  layouts.forEach((layout, index) => {
    if (index !== from && layout.y + layout.height / 2 < center) target += 1;
  });
  return target;
}

/** How far a resting row slides to make room while another row is dragged from `from` to `to`. */
export function reorderShift(index: number, from: number, to: number, distance: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -distance;
  if (to < from && index >= to && index < from) return distance;
  return 0;
}
