import { CalendarDays, Compass, LayoutGrid, Plus, Settings, ShoppingCart, type LucideIcon } from "lucide-react";

export type NavItem = {
  id: "library" | "plan" | "hub" | "snap" | "list" | "settings";
  href: string;
  /** Translation key for the label. */
  labelKey: "tabs.library" | "tabs.plan" | "tabs.hub" | "tabs.snap" | "tabs.list" | "tabs.settings";
  icon: LucideIcon;
  /** The icon points a direction (the cart), so it is mirrored in Hebrew and Arabic. */
  flip?: boolean;
  /** Shown in the side rail only, not in the phone's bottom bar (which holds five). */
  railOnly?: boolean;
  /** Whether this section owns the page at `path` (a recipe belongs to the Library, a settings page to Settings). */
  owns: (path: string) => boolean;
};

/** A recipe a Snap just produced, before it is saved, is still part of Snap. */
const isSnapPreview = (path: string) => path.startsWith("/recipe/preview");

/** The same paths as the Expo web app, so old links and bookmarks keep working (ADR 026). */
export const NAV_ITEMS: NavItem[] = [
  {
    id: "library",
    href: "/",
    labelKey: "tabs.library",
    icon: LayoutGrid,
    owns: (path) =>
      path === "/" || path.startsWith("/favorites") || path.startsWith("/cookbook") || (path.startsWith("/recipe") && !isSnapPreview(path)),
  },
  // The meal plan (PIN-77). In the rail for now; the phone bar gets it when the Hub moves into the Library.
  { id: "plan", href: "/plan", labelKey: "tabs.plan", icon: CalendarDays, railOnly: true, owns: (path) => path === "/plan" || path.startsWith("/plan/") },
  { id: "hub", href: "/hub", labelKey: "tabs.hub", icon: Compass, owns: (path) => path === "/hub" || path.startsWith("/hub/") },
  { id: "snap", href: "/add", labelKey: "tabs.snap", icon: Plus, owns: (path) => path.startsWith("/add") || isSnapPreview(path) },
  { id: "list", href: "/list", labelKey: "tabs.list", icon: ShoppingCart, flip: true, owns: (path) => path.startsWith("/list") },
  { id: "settings", href: "/settings", labelKey: "tabs.settings", icon: Settings, owns: (path) => path.startsWith("/settings") },
];

export const navItem = (id: NavItem["id"]) => NAV_ITEMS.find((item) => item.id === id)!;

/**
 * A saved recipe's own page. On a phone it has no app bars: the photo runs to the top of the screen with its own
 * back button on it, and "Start cooking" is fixed at the bottom (PIN-163).
 */
export function isImmersivePath(path: string): boolean {
  return /^\/recipe\/(?!preview$|edit$)[^/]+\/?$/.test(path);
}

/** The section a page belongs to, for highlighting. */
export function activeSection(path: string): NavItem["id"] | null {
  return NAV_ITEMS.find((item) => item.owns(path))?.id ?? null;
}
