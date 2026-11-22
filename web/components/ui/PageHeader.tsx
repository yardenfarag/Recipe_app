"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Sets the browser tab's title: "Library · Pinch". Next.js writes the root layout's default title ("Pinch") into the
 * page head on its own schedule, which can land after this effect on a slow load, so the title is put back whenever
 * something else changes it while this page is showing.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const wanted = title ? `${title} · Pinch` : "Pinch";
    document.title = wanted;
    const observer = new MutationObserver(() => {
      if (document.title !== wanted) document.title = wanted;
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}

/**
 * The top of every screen: its title (also the browser tab's), an optional line under it, and the screen's
 * own actions at the end. One h1 per page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  tabTitle,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** When the tab should say something shorter than the heading. */
  tabTitle?: string;
}) {
  usePageTitle(tabTitle ?? title);
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-[1.05] font-bold text-balance text-text md:text-[40px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
