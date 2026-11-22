"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PinchLogo } from "@/components/CookieMark";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { NAV_ITEMS, activeSection } from "@/components/shell/nav";
import { cn } from "@/lib/cn";

/** Phones: a slim bar on top with the logo and the account menu. */
export function MobileTopBar() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
      <div className="flex h-14 w-full items-center justify-between">
        <Link href="/" data-track="nav.top_bar.logo" className="rounded-btn" aria-label={`Pinch — ${t("tabs.library")}`}>
          <PinchLogo />
        </Link>
        <AccountMenu variant="compact" />
      </div>
    </header>
  );
}

/**
 * Phones: the five sections at the bottom, within thumb reach. Snap, the main action, is a raised button in the
 * middle. The bar clears the phone's home indicator (safe area).
 */
export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const active = activeSection(pathname);

  return (
    <nav
      aria-label={t("web.mainNavigation")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-tab-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-start">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          const label = t(item.labelKey);
          if (item.id === "snap") {
            return (
              <li key={item.id} className="flex justify-center">
                <Link
                  href={item.href}
                  data-track={`nav.tab.${item.id}`}
                  aria-label={t("snap.title")}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "-mt-6 grid h-15 w-15 place-items-center rounded-[22px] bg-primary text-on-primary shadow-lift ring-4 ring-bg transition-transform active:scale-95",
                    isActive && "ring-primary-soft",
                  )}
                >
                  <item.icon aria-hidden className="h-7 w-7" strokeWidth={2.4} />
                </Link>
              </li>
            );
          }
          return (
            <li key={item.id} className="h-full">
              <Link
                href={item.href}
                data-track={`nav.tab.${item.id}`}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  isActive ? "text-text" : "text-muted",
                )}
              >
                <item.icon aria-hidden className={cn("h-[22px] w-[22px]", item.flip && "rtl:-scale-x-100")} strokeWidth={isActive ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
