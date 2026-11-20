"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BottomNav, MobileTopBar } from "@/components/shell/MobileNav";
import { Sidebar } from "@/components/shell/Sidebar";

/**
 * The frame every signed-in screen sits in: navigation (side on tablets and up, bottom on phones), the account
 * menu, and a centred content column. A screen only renders its own content inside it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-1">
      {/* First thing a keyboard reaches: jump past the navigation. */}
      <a
        href="#main"
        className="fixed start-3 top-3 z-50 -translate-y-20 rounded-full bg-primary px-4 py-2.5 font-semibold text-on-primary shadow-lift transition-transform focus:translate-y-0"
      >
        {t("web.skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pt-6 pb-28 sm:px-8 md:pt-10 md:pb-12">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
