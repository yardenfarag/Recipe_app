/** The admin pages, in the order the admin menu lists them. Paths are the Expo web app's, so bookmarks keep working. */
export const ADMIN_PAGES = [
  { id: "dashboard", href: "/admin/dashboard", label: "Dashboard" },
  { id: "insights", href: "/admin/insights", label: "Insights" },
  { id: "users", href: "/admin/users", label: "People" },
  { id: "usage", href: "/admin/usage", label: "Cost & support" },
  { id: "activity", href: "/admin/activity", label: "Activity log" },
  { id: "messages", href: "/admin/messages", label: "Messages" },
  { id: "kit", href: "/admin/kit", label: "Kit" },
] as const;

export type AdminPageId = (typeof ADMIN_PAGES)[number]["id"];

/** Which admin page an address is on, or null when it isn't one. */
export function adminPageFor(pathname: string | null): AdminPageId | null {
  if (!pathname) return null;
  const path = pathname.replace(/^\/app(?=\/|$)/, "").replace(/\/+$/, "");
  return ADMIN_PAGES.find((page) => path === page.href || path.startsWith(`${page.href}/`))?.id ?? null;
}
