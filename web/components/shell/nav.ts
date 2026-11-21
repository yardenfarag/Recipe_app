import { BookOpen, Compass, Settings, ShoppingBasket, Sparkles, type LucideIcon } from "lucide-react";

export type NavItem = {
  id: "library" | "hub" | "snap" | "list" | "settings";
  href: string;
  /** Translation key for the label. */
  labelKey: "tabs.library" | "tabs.hub" | "tabs.snap" | "tabs.list" | "tabs.settings";
  icon: LucideIcon;
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
    icon: BookOpen,
    owns: (path) =>
      path === "/" || path.startsWith("/favorites") || path.startsWith("/cookbook") || (path.startsWith("/recipe") && !isSnapPreview(path)),
  },
  { id: "hub", href: "/hub", labelKey: "tabs.hub", icon: Compass, owns: (path) => path === "/hub" || path.startsWith("/hub/") },
  { id: "snap", href: "/add", labelKey: "tabs.snap", icon: Sparkles, owns: (path) => path.startsWith("/add") || isSnapPreview(path) },
  { id: "list", href: "/list", labelKey: "tabs.list", icon: ShoppingBasket, owns: (path) => path.startsWith("/list") },
  { id: "settings", href: "/settings", labelKey: "tabs.settings", icon: Settings, owns: (path) => path.startsWith("/settings") },
];

export const navItem = (id: NavItem["id"]) => NAV_ITEMS.find((item) => item.id === id)!;

/** The section a page belongs to, for highlighting. */
export function activeSection(path: string): NavItem["id"] | null {
  return NAV_ITEMS.find((item) => item.owns(path))?.id ?? null;
}
