"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { SettingsList, SettingsRail } from "@/components/settings/SettingsMenu";
import { SettingsProfileProvider } from "@/components/settings/SettingsProfile";
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
      <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-10 xl:grid-cols-[16rem_minmax(0,1fr)] xl:gap-14">
        <aside className="sticky top-10 max-h-[calc(100dvh-5rem)] self-start overflow-y-auto pb-4">
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
        className="-ms-2 mb-3 inline-flex h-9 items-center gap-1 rounded-full pe-3 ps-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
      >
        <ChevronLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
        {t("settings.title")}
      </Link>
      {children}
    </div>
  );
}
