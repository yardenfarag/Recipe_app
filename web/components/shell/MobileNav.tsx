"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PinchLogo } from "@/components/CookieMark";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { NAV_ITEMS, activeSection } from "@/components/shell/nav";
import { cn } from "@/lib/cn";

/** Phones: a slim bar on top with the account menu. */
export function MobileTopBar() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-frosted-border bg-tab-bar/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
      <Link href="/" className="rounded-xl" aria-label={`Pinch — ${t("tabs.library")}`}>
        <PinchLogo />
      </Link>
      <AccountMenu variant="compact" />
    </header>
  );
}

/** Phones: the five sections at the bottom, within thumb reach. Snap, the main action, sits raised in the middle. */
export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const active = activeSection(pathname);

  return (
    <nav
      aria-label={t("web.mainNavigation")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-frosted-border bg-tab-bar/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          const label = t(item.labelKey);
          if (item.id === "snap") {
            return (
              <li key={item.id} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="-mt-5 flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      "grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-lift ring-4 ring-bg transition-transform active:scale-95",
                      isActive && "ring-primary-soft",
                    )}
                  >
                    <item.icon aria-hidden className="h-6 w-6" />
                  </span>
                  <span className={cn("text-[11px] font-semibold", isActive ? "text-primary" : "text-muted")}>{label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  isActive ? "text-primary" : "text-muted",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", isActive && "bg-primary-soft")}>
                  <item.icon aria-hidden className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
