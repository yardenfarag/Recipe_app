/**
 * The heading of the page on screen. The Library stays in the document while another section shows (hidden, kept
 * alive, PIN-175), so the first `#main h1` may be its heading rather than this page's.
 */
export function shownPageHeading(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("#main h1")).find((heading) => heading.getClientRects().length > 0) ?? null;
}
