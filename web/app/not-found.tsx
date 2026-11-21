"use client";

import { MapPinOff } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PinchLogo } from "@/components/CookieMark";
import { buttonClasses } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";

/** A page that doesn't exist: say so kindly and offer the way home. */
export default function NotFound() {
  const { t } = useTranslation();
  usePageTitle(t("web.notFoundTitle"));
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <Link href="/" data-track="not_found.logo" className="mb-6 rounded-xl" aria-label="Pinch">
        <PinchLogo />
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-frosted-border bg-surface shadow-soft">
        <EmptyState
          icon={<MapPinOff aria-hidden />}
          title={t("web.notFoundTitle")}
          body={t("web.notFoundBody")}
          action={
            <Link href="/" data-track="not_found.go_home" className={buttonClasses({ variant: "primary" })}>
              {t("recipe.goToLibrary")}
            </Link>
          }
        />
      </div>
    </main>
  );
}
