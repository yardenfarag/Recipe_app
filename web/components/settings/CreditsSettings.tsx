"use client";

import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";

import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { useSettingsProfile } from "@/components/settings/SettingsProfile";

/**
 * The balance, until the credits page arrives (PIN-141 replaces this file: packs, buying on the web, history).
 * Settings links here so old `/settings/credits` links keep working.
 */
export function CreditsSettings() {
  const { t } = useTranslation();
  const { totalCredits } = useSettingsProfile();
  return (
    <>
      <SettingsPageHeader id="credits" />
      <section className="flex items-start gap-4 rounded-3xl border border-frosted-border bg-surface/80 p-5 shadow-soft backdrop-blur-sm sm:p-6">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Coins className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-text">
            {totalCredits == null ? t("settings.recipeCredits") : t("settings.creditsTotal", { count: totalCredits })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("settings.creditsMonthlyNote", { limit: FREE_MONTHLY_EXTRACT_LIMIT })}</p>
        </div>
      </section>
      {/* PIN-141: buying credit packs on the web goes here. */}
    </>
  );
}
