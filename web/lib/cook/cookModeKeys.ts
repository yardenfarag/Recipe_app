export type CookModeMove = "next" | "back" | "first" | "last";

/**
 * Which way a key moves cook mode. The arrows follow the screen, not the words: Back and Next sit at the start and
 * end of the row, so in a right-to-left app Next is on the left and the left arrow goes forward, as page turns
 * do in a Hebrew book. Space goes forward like a slide deck, Shift+Space back, except on a button, where Space
 * presses the button. Page Up/Down are what presentation clickers send.
 */
export function cookModeMove(
  event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  { direction, onControl }: { direction: "ltr" | "rtl"; onControl: boolean },
): CookModeMove | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const forwardArrow = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backArrow = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
  switch (event.key) {
    case forwardArrow:
    case "PageDown":
      return "next";
    case backArrow:
    case "PageUp":
      return "back";
    case " ":
      if (onControl) return null;
      return event.shiftKey ? "back" : "next";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

/** A finger swipe across the step: towards the start edge goes forward (like turning a page), towards the end, back. */
export function swipeMove(dx: number, dy: number, direction: "ltr" | "rtl"): "next" | "back" | null {
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return null;
  const towardsStart = direction === "rtl" ? dx > 0 : dx < 0;
  return towardsStart ? "next" : "back";
}
