"use client";

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { APP_LANGUAGES, type AppLanguageCode } from "@shared/lib/appLanguages";

import { ChoiceGroup, SettingsCard, optionRowClass } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { useLanguage } from "@/components/LanguageProvider";

/** A language's name in the language the app is showing ("Spanish", "ספרדית"), from the browser. */
function nameIn(display: AppLanguageCode, code: AppLanguageCode): string | null {
  try {
    return new Intl.DisplayNames([display], { type: "language" }).of(code) ?? null;
  } catch {
    return null;
  }
}

/**
 * The app's language. It applies at once: Hebrew and Arabic flip the layout right to left without a reload, and you
 * stay on this page with the choice still focused. The account remembers it, so emails come in the same language.
 */
export function LanguageSettings() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <>
      <SettingsPageHeader id="language" />
      <SettingsCard title={t("settings.language")}>
        <ChoiceGroup<AppLanguageCode>
          label={t("settings.language")}
          trackId="settings.language"
          value={language}
          onChange={setLanguage}
          className="grid gap-2 @lg:grid-cols-2"
          optionClassName={optionRowClass}
          options={APP_LANGUAGES.map((lang) => ({
            value: lang.code,
            label: lang.nativeLabel,
            lang: lang.code,
            content: (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-text">
                    {lang.nativeLabel}
                  </span>
                  {lang.code !== language ? (
                    <span lang={language} className="block text-sm text-muted">
                      {nameIn(language, lang.code) ?? lang.label}
                    </span>
                  ) : null}
                </span>
                <Check aria-hidden className="h-5 w-5 shrink-0 text-primary-text opacity-0 group-data-[checked]:opacity-100" />
              </>
            ),
          }))}
        />
      </SettingsCard>
    </>
  );
}
