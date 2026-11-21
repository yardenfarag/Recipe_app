"use client";

import { GripVertical } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";
import { dragShift, dropTargetIndex, keyboardMoveTarget, type RowBox } from "@/lib/editor/reorder";

type Drag = { from: number; to: number; offset: number; startY: number; boxes: RowBox[] };

/** How close to the window's top or bottom a drag scrolls the page. The bottom leaves room for the save bar. */
const EDGE_TOP = 72;
const EDGE_BOTTOM = 140;

/**
 * A list the cook can reorder three ways: drag the grip (mouse, pen or finger), use ↑ ↓ Home End on the focused grip,
 * or Alt+↑ / Alt+↓ from any field in the row. Each move is read out ("flour moved to position 2 of 5"), and focus
 * stays where it was.
 */
export function ReorderableList<T extends { id: string }>({
  items,
  label,
  itemLabel,
  onMove,
  renderItem,
  ordered = false,
  className,
}: {
  items: T[];
  /** The list's name for screen readers ("Ingredients"). */
  label: string;
  /** What to call an item when moving it: its text, or "Step 3" when it has none. */
  itemLabel: (item: T, index: number) => string;
  onMove: (from: number, to: number) => void;
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  ordered?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** The element that had focus when a move started, to give it back once the rows have moved. */
  const restoreFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = restoreFocus.current;
    if (!element) return;
    restoreFocus.current = null;
    if (element.isConnected && document.activeElement !== element) element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest" });
  }, [items]);

  function move(from: number, to: number) {
    if (from === to) return;
    const item = items[from];
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onMove(from, to);
    // A new string each time, so moving the same item twice to the same place is still read out.
    const text = t("web.editor.moved", { item: itemLabel(item, from), position: to + 1, total: items.length });
    setAnnouncement((previous) => (previous === text ? `${text} ` : text));
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number) {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const target = keyboardMoveTarget(event.key, index, items.length);
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (target !== null) move(index, target);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = keyboardMoveTarget(event.key, index, items.length);
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (target !== null) move(index, target);
  }

  function boxes(): RowBox[] {
    return items.map((item) => {
      const rect = rows.current.get(item.id)?.getBoundingClientRect();
      return { top: (rect?.top ?? 0) + window.scrollY, height: rect?.height ?? 0 };
    });
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 || items.length < 2) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ from: index, to: index, offset: 0, startY: event.pageY, boxes: boxes() });
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    if (event.clientY < EDGE_TOP) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - EDGE_BOTTOM) window.scrollBy(0, 12);
    const offset = event.pageY - drag.startY;
    setDrag({ ...drag, offset, to: dropTargetIndex(drag.boxes, drag.from, offset) });
  }

  function onPointerEnd() {
    if (!drag) return;
    setDrag(null);
    move(drag.from, drag.to);
  }

  const List = ordered ? "ol" : "ul";
  return (
    <>
      <p id={hintId} className="sr-only">
        {t("web.editor.reorderHint")}
      </p>
      <List aria-label={label} className={cn("flex flex-col gap-2", className)}>
        {items.map((item, index) => {
          const dragging = drag?.from === index;
          const shift = drag ? dragShift(index, drag.from, drag.to, drag.offset, drag.boxes) : 0;
          const handle = (
            <button
              type="button"
              aria-label={t("web.editor.moveItem", { item: itemLabel(item, index) })}
              aria-describedby={hintId}
              disabled={items.length < 2}
              onKeyDown={(event) => onHandleKeyDown(event, index)}
              onPointerDown={(event) => onPointerDown(event, index)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={() => setDrag(null)}
              className={cn(
                "grid h-11 w-8 shrink-0 touch-none place-items-center rounded-lg text-muted transition-colors",
                "hover:bg-element hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30",
                items.length > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"),
              )}
            >
              <GripVertical aria-hidden className="h-5 w-5" />
            </button>
          );
          return (
            <li
              key={item.id}
              ref={(node) => {
                if (node) rows.current.set(item.id, node);
                else rows.current.delete(item.id);
              }}
              onKeyDown={(event) => onRowKeyDown(event, index)}
              style={shift ? { transform: `translateY(${shift}px)` } : undefined}
              data-dragging={dragging || undefined}
              className={cn(
                "relative rounded-2xl",
                drag && !dragging && "transition-transform duration-150 ease-out",
                dragging && "z-10 bg-surface shadow-lift ring-2 ring-primary/40",
              )}
            >
              {renderItem(item, index, handle)}
            </li>
          );
        })}
      </List>
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
