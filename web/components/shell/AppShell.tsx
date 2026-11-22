"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { InAppMessageBanner } from "@/components/inAppMessages/InAppMessageBanner";
import { BottomNav, MobileTopBar } from "@/components/shell/MobileNav";
import { NavRail } from "@/components/shell/NavRail";
import { SnapBarProvider } from "@/components/snapbar/SnapBarProvider";

/**
 * The frame every signed-in screen sits in: navigation (an icon rail on tablets and up, a bar at the bottom on
 * phones), the account menu, the Snap bar on ⌘K, and the content column. A screen only renders its own content
 * inside it. In-app message banners (ADR 023) sit at the top or the bottom of the content column.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <SnapBarProvider>
      <div className="flex min-h-dvh flex-1">
        {/* First thing a keyboard reaches: jump past the navigation. */}
        <a
          href="#main"
          data-track="nav.skip_to_content"
          className="fixed start-3 top-3 z-50 -translate-y-20 rounded-btn bg-primary px-4 py-2.5 font-display font-bold text-on-primary shadow-lift transition-transform focus:translate-y-0"
        >
          {t("web.skipToContent")}
        </a>
        <NavRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <InAppMessageBanner position="top" />
          <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
            {/* Beside the rail the page starts close to it (8 px), as the rail has its own breathing room. */}
            <div className="mx-auto flex w-full max-w-[84rem] flex-1 flex-col px-4 pt-5 pb-28 sm:px-6 md:ps-2 md:pe-8 md:pt-7 md:pb-14 lg:pe-10">
              {children}
            </div>
          </main>
          <InAppMessageBanner position="bottom" />
        </div>
        <BottomNav />
      </div>
    </SnapBarProvider>
  );
}
