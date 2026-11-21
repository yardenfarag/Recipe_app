"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/ui/PageHeader";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/lib/settings/sections";

/** A settings page's heading and tab title, from the same names the menu uses. */
export function SettingsPageHeader({ id, actions }: { id: SettingsSectionId; actions?: ReactNode }) {
  const { t } = useTranslation();
  const section = SETTINGS_SECTIONS.find((item) => item.id === id)!;
  return <PageHeader title={t(section.labelKey)} subtitle={section.hintKey ? t(section.hintKey) : undefined} actions={actions} />;
}
