/**
 * Which press a click was, for the activity log (ADR 020). Buttons, links and menu items carry their id in
 * `data-track` (Button and IconButton write it from `trackId`; put `data-track="…"` on a Link or a plain element).
 * One click listener on the document reads it, so every screen is logged without extra code, and a press is never
 * held up: reading an attribute is all the click path does.
 */
export const TRACK_ATTRIBUTE = "data-track";

/** What counts as something pressed. A click elsewhere (text, a card's padding) is not logged. */
const PRESSABLE = [
  `[${TRACK_ATTRIBUTE}]`,
  "button",
  "a[href]",
  "summary",
  'input[type="checkbox"]',
  'input[type="radio"]',
  ...["button", "link", "menuitem", "menuitemradio", "menuitemcheckbox", "tab", "switch", "checkbox", "radio", "option"].map(
    (role) => `[role="${role}"]`,
  ),
].join(",");

/**
 * The log name for a click on `target`: the nearest pressable element's `data-track`, "unnamed" when it has none,
 * or null when nothing pressable was clicked (or it is disabled).
 */
export function tapNameFor(target: EventTarget | null): string | null {
  const element = target instanceof Element ? target.closest(PRESSABLE) : null;
  if (!element) return null;
  if (element.getAttribute("aria-disabled") === "true" || (element as HTMLButtonElement).disabled === true) return null;
  return element.getAttribute(TRACK_ATTRIBUTE) || "unnamed";
}
