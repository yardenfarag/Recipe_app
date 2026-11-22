"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ADMIN_PAGES, adminPageFor } from "@/lib/admin/nav";

/**
 * Leaves the admin pages: back to wherever the admin opened them from (the admin links replace the history entry,
 * so one "back" always leaves), or to Settings, where the admin links live, when this tab has no history.
 */
function useLeaveAdmin() {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace("/settings");
  }, [router]);
}

/**
 * Every admin page sits in this: a way back to the app and the row of admin pages on top, then the page. Admin pages
 * are in English only (as on mobile), so they read left to right whatever the app's language is. The page lays itself
 * out by its own width (a container), which on a laptop is the window minus the side navigation.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const current = adminPageFor(usePathname());
  const leave = useLeaveAdmin();
  return (
    <div dir="ltr" lang="en" className="@container flex min-w-0 flex-1 flex-col">
      <nav aria-label="Admin pages" className="mb-6 flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        <Button variant="outline" size="sm" trackId="admin.nav.back" onClick={leave} className="me-2">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Back
        </Button>
        {ADMIN_PAGES.map((page) => (
          <Link
            key={page.id}
            href={page.href}
            replace
            data-track={`admin.nav.${page.id}`}
            aria-current={current === page.id ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-btn px-3.5 text-sm font-semibold transition-colors pointer-coarse:h-11",
              current === page.id ? "bg-element text-text" : "text-muted hover:bg-element hover:text-text active:bg-selected",
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
