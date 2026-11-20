"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PinchLogo } from "@/components/CookieMark";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { NAV_ITEMS, activeSection, navItem, type NavItem } from "@/components/shell/nav";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

/**
 * Side navigation for tablets and up. On a desktop (lg) it shows labels; on a tablet (md) it folds into a rail
 * of icons with tooltips, so the page keeps its width. Snap is the main action, so it is a button of its own,
 * above the sections.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const active = activeSection(pathname);
  const snap = navItem("snap");
  const sections = NAV_ITEMS.filter((item) => item.id !== "snap" && item.id !== "settings");
  const settings = navItem("settings");

  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-frosted-border bg-tab-bar/70 backdrop-blur-xl md:flex md:w-[76px] lg:w-[248px]">
      <div className="flex h-20 items-center justify-center px-4 lg:justify-start lg:px-5">
        <Link href="/" className="rounded-xl" aria-label={`Pinch — ${t("tabs.library")}`}>
          <span className="lg:hidden">
            <PinchLogo compact />
          </span>
          <span className="hidden lg:inline">
            <PinchLogo />
          </span>
        </Link>
      </div>

      <nav aria-label={t("web.mainNavigation")} className="flex min-h-0 flex-1 flex-col gap-1 px-3 lg:px-4">
        <Tooltip label={t(snap.labelKey)} side="end" className="lg:hidden">
          <Link
            href={snap.href}
            aria-current={pathname === snap.href ? "page" : undefined}
            className={cn(
              "mx-auto mb-5 flex h-12 w-12 items-center justify-center gap-2.5 rounded-2xl bg-primary lg:mx-0 lg:w-auto font-semibold text-on-primary shadow-soft transition-[filter,box-shadow] hover:shadow-lift hover:brightness-105 lg:justify-start lg:px-4",
              active === "snap" && "ring-2 ring-primary/40 ring-offset-2 ring-offset-tab-bar",
            )}
          >
            <snap.icon aria-hidden className="h-5 w-5 shrink-0" />
            <span className="sr-only lg:not-sr-only">{t("snap.title")}</span>
          </Link>
        </Tooltip>

        {sections.map((item) => (
          <SideLink key={item.id} item={item} active={active === item.id} current={pathname === item.href} />
        ))}

        <div className="mt-auto pt-4">
          <SideLink item={settings} active={active === "settings"} current={pathname === settings.href} />
        </div>
      </nav>

      <div className="border-t border-frosted-border p-3 lg:p-4">
        <span className="hidden lg:block">
          <AccountMenu variant="full" />
        </span>
        <span className="flex justify-center lg:hidden">
          <AccountMenu variant="compact" />
        </span>
      </div>
    </aside>
  );
}

function SideLink({ item, active, current }: { item: NavItem; active: boolean; current: boolean }) {
  const { t } = useTranslation();
  const label = t(item.labelKey);
  return (
    // Tooltips only matter on the icon rail; on desktop the label is right there.
    <Tooltip label={label} side="end" className="lg:hidden">
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "group flex h-11 items-center justify-center gap-3 rounded-xl text-[15px] font-semibold transition-colors lg:justify-start lg:px-3",
          active ? "bg-primary-soft text-primary" : "text-muted hover:bg-element hover:text-text",
        )}
      >
        <item.icon aria-hidden className="h-5 w-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
        <span className="sr-only lg:not-sr-only">{label}</span>
      </Link>
    </Tooltip>
  );
}
