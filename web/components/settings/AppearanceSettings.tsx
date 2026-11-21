"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { THEME_PACK_ORDER, ThemePacks, type ThemePackId } from "@shared/constants/themes";

import { ChoiceGroup, SettingsCard } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

/**
 * Light, dark or automatic, and the theme pack. They apply at once, as in the account menu, and are saved on the
 * account, so the mobile app picks them up too (PIN-154).
 */
export function AppearanceSettings() {
  const { t } = useTranslation();
  const { preference, setPreference, pack, setPack } = useTheme();

  const modes: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: "system", label: t("theme.auto"), Icon: Monitor },
    { value: "light", label: t("theme.light"), Icon: Sun },
    { value: "dark", label: t("theme.dark"), Icon: Moon },
  ];

  return (
    <>
      <SettingsPageHeader id="appearance" />
      <div className="flex flex-col gap-5">
        <SettingsCard title={t("settings.lightDark")}>
          <ChoiceGroup
            label={t("settings.lightDark")}
            value={preference}
            onChange={setPreference}
            className="grid grid-cols-3 gap-2 rounded-2xl bg-primary-soft p-1"
            optionClassName="flex h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted transition-colors hover:text-text data-[checked]:bg-surface data-[checked]:text-primary data-[checked]:shadow-soft"
            options={modes.map(({ value, label, Icon }) => ({
              value,
              label,
              content: (
                <>
                  <Icon aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </>
              ),
            }))}
          />
        </SettingsCard>

        <SettingsCard title={t("settings.driftTheme")}>
          <ChoiceGroup<ThemePackId>
            label={t("settings.driftTheme")}
            value={pack}
            onChange={setPack}
            className="grid gap-3 @lg:grid-cols-2"
            optionClassName="group relative flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-soft data-[checked]:border-primary data-[checked]:bg-primary-soft"
            options={THEME_PACK_ORDER.map((id) => ({
              value: id,
              label: t(`themes.${id}.name`),
              content: (
                <>
                  <span aria-hidden className="flex shrink-0 -space-x-2 rtl:space-x-reverse">
                    {ThemePacks[id].swatches.map((color) => (
                      // The pack's own colours, so you can see each one before choosing it.
                      <span key={color} className="h-7 w-7 rounded-full ring-2 ring-surface" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-text">{t(`themes.${id}.name`)}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted">{t(`themes.${id}.blurb`)}</span>
                  </span>
                  <Check aria-hidden className="h-5 w-5 shrink-0 text-primary opacity-0 group-data-[checked]:opacity-100" />
                </>
              ),
            }))}
          />
        </SettingsCard>
      </div>
    </>
  );
}
