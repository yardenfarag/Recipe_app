"use client";

import { MapPinOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { buttonClasses } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { Tile } from "@/components/ui/Tile";
import { useIsAdmin } from "@/lib/admin/useIsAdmin";

/**
 * Admin pages open only for accounts with `profiles.is_admin`. Everyone else sees the app's "not found" page, so the
 * pages don't even say they exist. This only decides what to draw: the data behind every admin page comes from
 * admin-only database functions and row rules, which refuse a non-admin whatever the browser does.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <LoadingState />;
  if (!isAdmin) return <AdminNotFound />;
  return <>{children}</>;
}

/** The same words and way home as app/not-found.tsx, inside the app shell. In the person's own language. */
export function AdminNotFound() {
  const { t } = useTranslation();
  usePageTitle(t("web.notFoundTitle"));
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <Tile className="w-full max-w-md">
        <EmptyState
          icon={<MapPinOff aria-hidden />}
          title={t("web.notFoundTitle")}
          body={t("web.notFoundBody")}
          action={
            <Link href="/" data-track="admin_only.go_back" className={buttonClasses({ variant: "primary" })}>
              {t("recipe.goToLibrary")}
            </Link>
          }
        />
      </Tile>
    </div>
  );
}
