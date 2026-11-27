"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";

/**
 * "My Library | Hub" (PIN-77): the Hub sits inside the Library instead of having its own place in the navigation.
 * Real links, so each tab keeps its address (/ and /hub) and old Hub links still work.
 */
export function LibraryTabs({ current }: { current: "library" | "hub" }) {
  const { t } = useTranslation();
  const tab = (on: boolean) =>
    cn(
      "inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition-colors pointer-coarse:h-11",
      on ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
    );
  return (
    <div className="mb-4 md:mb-5">
      <nav aria-label={t("plan.libraryTabs.label")} className="inline-flex rounded-btn bg-element p-1">
        <Link href="/" data-track="library.tab.mine" aria-current={current === "library" ? "page" : undefined} className={tab(current === "library")}>
          {t("plan.libraryTabs.mine")}
        </Link>
        <Link href="/hub" data-track="library.tab.hub" aria-current={current === "hub" ? "page" : undefined} className={tab(current === "hub")}>
          {t("tabs.hub")}
        </Link>
      </nav>
    </div>
  );
}
