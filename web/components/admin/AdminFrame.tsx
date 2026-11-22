"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { ADMIN_PAGES, adminPageFor } from "@/lib/admin/nav";

/**
 * Every admin page sits in this: the row of admin pages on top, then the page. Admin pages are in English only (as
 * on mobile), so they read left to right whatever the app's language is. The page lays itself out by its own width
 * (a container), which on a laptop is the window minus the side navigation.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const current = adminPageFor(usePathname());
  return (
    <div dir="ltr" lang="en" className="@container flex min-w-0 flex-1 flex-col">
      <nav aria-label="Admin pages" className="mb-6 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {ADMIN_PAGES.map((page) => (
          <Link
            key={page.id}
            href={page.href}
            data-track={`admin.nav.${page.id}`}
            aria-current={current === page.id ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
              current === page.id ? "bg-primary-soft text-primary" : "text-muted hover:bg-element hover:text-text",
            )}
          >
            {page.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
