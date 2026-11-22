"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { THEME_PACK_ORDER, ThemePacks, type ThemePackId } from "@shared/constants/themes";

import { ChoiceGroup, SettingsCard, segmentedGroupClass, segmentedOptionClass } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";
import type { Scheme, ThemePreference } from "@/lib/theme";

/**
 * Light, dark or automatic, and the theme pack. They apply at once, as in the account menu, and are saved on the
 * account, so the mobile app picks them up too (PIN-154).
 */
export function AppearanceSettings() {
  const { t } = useTranslation();
  const { preference, setPreference, pack, setPack, scheme } = useTheme();
  const packsHeadingId = useId();

  const modes: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: "system", label: t("theme.auto"), Icon: Monitor },
    { value: "light", label: t("theme.light"), Icon: Sun },
    { value: "dark", label: t("theme.dark"), Icon: Moon },
  ];

  return (
    <>
      <SettingsPageHeader id="appearance" />
      <div className="flex flex-col gap-7">
        <SettingsCard title={t("settings.lightDark")}>
          {/* Not the kit's SegmentedControl: three names with icons don't fit a phone in Spanish or Russian. */}
          <ChoiceGroup
            label={t("settings.lightDark")}
            trackId="settings.theme"
            value={preference}
            onChange={setPreference}
            className={cn(segmentedGroupClass, "max-w-md grid-cols-3")}
            optionClassName={cn(segmentedOptionClass, "px-2")}
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

        {/* Each pack is a tile of its own, straight on the page, painted in that pack's colours. */}
        <section aria-labelledby={packsHeadingId}>
          <h2 id={packsHeadingId} className="mb-4 text-[26px] leading-tight font-bold text-text">
            {t("settings.driftTheme")}
          </h2>
          <ChoiceGroup<ThemePackId>
            label={t("settings.driftTheme")}
            trackId="settings.theme_pack"
            value={pack}
            onChange={setPack}
            className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4 @4xl:grid-cols-4"
            // The focus outline sits outside the chosen pack's ring, so the keyboard's place still shows.
            optionClassName="group flex rounded-3xl text-start transition-shadow focus-visible:outline-offset-4 data-[checked]:ring-2 data-[checked]:ring-primary data-[checked]:ring-offset-2 data-[checked]:ring-offset-bg"
            options={THEME_PACK_ORDER.map((id) => ({
              value: id,
              label: t(`themes.${id}.name`),
              content: <PackPreview id={id} scheme={scheme} name={t(`themes.${id}.name`)} blurb={t(`themes.${id}.blurb`)} />,
            }))}
          />
        </section>
      </div>
    </>
  );
}

/**
 * One theme pack as a small picture of itself, in light or dark as the app is now: its background with a card on
 * it, a button in its brand colour, a dot in its accent, and its name in its own text colour. The colours are the
 * pack's own values (not this page's tokens), so every pack shows its look before it is chosen.
 */
function PackPreview({ id, scheme, name, blurb }: { id: ThemePackId; scheme: Scheme; name: string; blurb: string }) {
  const colors = ThemePacks[id][scheme];
  return (
    <span
      className="flex min-w-0 flex-1 flex-col gap-3 rounded-[inherit] border p-3 sm:p-4"
      style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.text }}
    >
      <span
        aria-hidden
        className="flex flex-col gap-2.5 rounded-2xl border p-3"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors.accent }} />
          <span className="h-2 w-3/5 rounded-full" style={{ backgroundColor: colors.text }} />
        </span>
        <span className="h-2 w-4/5 rounded-full" style={{ backgroundColor: colors.backgroundElement }} />
        <span className="flex items-center justify-between gap-2">
          <span className="h-6 w-16 max-w-[60%] rounded-full" style={{ backgroundColor: colors.primary }} />
          <span className="h-6 w-6 shrink-0 rounded-lg" style={{ backgroundColor: colors.accentSoft }} />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 font-display text-base leading-snug font-bold">{name}</span>
          <span
            aria-hidden
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full opacity-0 transition-opacity group-data-[checked]:opacity-100"
            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        </span>
        <span className="text-[13px] leading-snug" style={{ color: colors.textSecondary }}>
          {blurb}
        </span>
      </span>
    </span>
  );
}
