"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";

/**
 * "My Library | Hub" (PIN-77): the Hub sits inside the Library instead of having its own place in the navigation.
 * Real links, so each tab keeps its address (/ and /hub) and old Hub links still work. A small Library gets a nudge
 * towards the Hub, where the recipes that fit the cook are.
 */
export function LibraryTabs({ current, small = false }: { current: "library" | "hub"; small?: boolean }) {
  const { t } = useTranslation();
  const tab = (on: boolean) =>
    cn(
      "inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition-colors pointer-coarse:h-11",
      on ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
    );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 md:mb-5">
      <nav aria-label={t("plan.libraryTabs.label")} className="inline-flex rounded-btn bg-element p-1">
        <Link href="/" data-track="library.tab.mine" aria-current={current === "library" ? "page" : undefined} className={tab(current === "library")}>
          {t("plan.libraryTabs.mine")}
        </Link>
        <Link href="/hub" data-track="library.tab.hub" aria-current={current === "hub" ? "page" : undefined} className={tab(current === "hub")}>
          {t("tabs.hub")}
        </Link>
      </nav>
      {small && current === "library" ? (
        <Link href="/hub" data-track="library.tab.small_hint" className="text-sm font-semibold text-primary-text hover:underline">
          {t("plan.libraryTabs.small")}
        </Link>
      ) : null}
    </div>
  );
}
