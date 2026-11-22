"use client";

import { ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { APP_LANGUAGES, type AppLanguageCode } from "@shared/lib/appLanguages";

import { useLanguage } from "@/components/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Every language by its own name, one press away: on the welcome page someone who doesn't read English still finds
 * theirs. It applies at once (Hebrew and Arabic flip the page), and the account keeps it after sign-up.
 */
export function LanguagePills({ trackPrefix, className }: { trackPrefix: string; className?: string }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <div role="group" aria-label={t("settings.language")} className={cn("flex flex-wrap items-center gap-1", className)}>
      <Languages aria-hidden className="me-1.5 h-4 w-4 shrink-0 text-muted" />
      {APP_LANGUAGES.map((lang) => {
        const active = lang.code === language;
        return (
          <Button
            key={lang.code}
            size="sm"
            variant={active ? "secondary" : "ghost"}
            aria-pressed={active}
            lang={lang.code}
            trackId={`${trackPrefix}.${lang.code}`}
            onClick={() => setLanguage(lang.code)}
            className={cn("h-8 px-3", !active && "text-muted hover:text-text")}
          >
            {lang.nativeLabel}
          </Button>
        );
      })}
    </div>
  );
}

/** The same choice in a small space (the onboarding top bar): the browser's own menu, which works with every input. */
export function LanguageSelect({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("settings.language")}</span>
      <Languages aria-hidden className="pointer-events-none absolute start-3 h-4 w-4 text-muted" />
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLanguageCode)}
        className="h-9 cursor-pointer appearance-none rounded-full border border-border bg-surface ps-9 pe-8 text-sm font-semibold text-text transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {APP_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} lang={lang.code}>
            {lang.nativeLabel}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-3 h-4 w-4 text-muted" />
    </label>
  );
}
