"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { CookieMark } from "@/components/CookieMark";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { NAV_ITEMS, activeSection, navItem, type NavItem } from "@/components/shell/nav";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

/**
 * Navigation for tablets and up: a slim rail of icons, each with a tooltip, so the page keeps the width for its
 * tiles (PIN-160). The logo leads home, the five sections follow in the same order as the phone's bottom bar, and
 * the account menu sits at the foot.
 */
export function NavRail() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const active = activeSection(pathname);
  const sections = NAV_ITEMS.filter((item) => item.id !== "settings");
  const settings = navItem("settings");

  return (
    <aside className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-center gap-2.5 py-7 md:flex">
      <Link
        href="/"
        data-track="nav.sidebar.logo"
        aria-label={`Pinch — ${t("tabs.library")}`}
        className="mb-[18px] grid h-11 w-11 place-items-center rounded-btn bg-primary text-on-primary transition-[filter] hover:brightness-105"
      >
        <CookieMark size={24} />
      </Link>

      <nav aria-label={t("web.mainNavigation")} className="flex min-h-0 flex-1 flex-col items-center gap-2.5">
        {sections.map((item) => (
          <RailLink key={item.id} item={item} active={active === item.id} current={pathname === item.href} />
        ))}
        <div className="mt-auto">
          <RailLink item={settings} active={active === "settings"} current={pathname === settings.href} />
        </div>
      </nav>

      <AccountMenu variant="rail" />
    </aside>
  );
}

function RailLink({ item, active, current }: { item: NavItem; active: boolean; current: boolean }) {
  const { t } = useTranslation();
  // The tab is "Snap"; the rail's tooltip says what it does.
  const label = item.id === "snap" ? t("snap.title") : t(item.labelKey);
  return (
    <Tooltip label={label} side="end">
      <Link
        href={item.href}
        data-track={`nav.sidebar.${item.id}`}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={cn(
          "grid h-13 w-13 place-items-center rounded-2xl transition-colors",
          active ? "bg-element text-text" : "text-muted hover:bg-element hover:text-text",
          // Snap is the main action: it keeps a ring, so it reads as a button among the sections.
          item.id === "snap" && "border border-border text-primary-text",
        )}
      >
        <item.icon aria-hidden className={cn("h-[22px] w-[22px]", item.flip && "rtl:-scale-x-100")} strokeWidth={active ? 2.2 : 1.8} />
      </Link>
    </Tooltip>
  );
}
