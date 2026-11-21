"use client";

import { useTranslation } from "react-i18next";

import { ComingSoon } from "@/components/shell/ComingSoon";

/** Settings. The real one arrives with PIN-139. */
export default function SettingsPage() {
  const { t } = useTranslation();
  return <ComingSoon section="settings" title={t("settings.title")} subtitle={t("settings.subtitle")} />;
}
