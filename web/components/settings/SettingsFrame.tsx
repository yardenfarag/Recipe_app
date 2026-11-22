"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { SettingsList, SettingsRail } from "@/components/settings/SettingsMenu";
import { SettingsProfileProvider } from "@/components/settings/SettingsProfile";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { settingsSectionFor } from "@/lib/settings/sections";
import { useWideLayout } from "@/lib/settings/useWideLayout";

/**
 * Every settings page sits in this. On a desktop the menu is on the start side and the open page beside it;
 * `/settings` opens Account there. On a phone or tablet `/settings` is the menu, and each page is a screen of its
 * own with a way back. Changing the language flips the sides but keeps you on the same page.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  return (
    <SettingsProfileProvider>
      <Frame>{children}</Frame>
    </SettingsProfileProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const wide = useWideLayout();
  const section = settingsSectionFor(usePathname());

  if (wide) {
    return (
      <div className="grid grid-cols-[16rem_minmax(0,1fr)] gap-8 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-12">
        {/* The small padding keeps a row's focus outline from being cut off by the scrolling box. */}
        <aside className="sticky top-7 -mx-1 max-h-[calc(100dvh-3.5rem)] self-start overflow-y-auto px-1 pb-4">
          <SettingsRail current={section?.id ?? "account"} />
        </aside>
        {/* A container, so the page lays itself out by its own width, not the window's. */}
        <div className="@container min-w-0">{children}</div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
        <SettingsList />
      </div>
    );
  }

  return (
    <div className="@container mx-auto w-full max-w-2xl">
      <Link
        href="/settings"
        data-track="settings.back"
        className={buttonClasses({ variant: "ghost", size: "sm", className: "-ms-2 mb-3 gap-1 ps-1.5 pe-3 text-primary-text pointer-coarse:h-11" })}
      >
        <ChevronLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
        {t("settings.title")}
      </Link>
      {children}
    </div>
  );
}
