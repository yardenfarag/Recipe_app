"use client";

import { ExternalLink, FileText, Globe, Lock, Trash2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { LEGAL_URLS } from "@/lib/legal";

/** The legal pages on pinch-app.io (the static files in legal/). They open in a new tab, so Settings stays put. */
export function LegalSettings() {
  const { t } = useTranslation();
  const links: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: LEGAL_URLS.privacy, label: t("settings.privacyPolicy"), Icon: Lock },
    { href: LEGAL_URLS.terms, label: t("settings.termsOfUse"), Icon: FileText },
    { href: LEGAL_URLS.deleteAccount, label: t("settings.deleteAccountGuide"), Icon: Trash2 },
    { href: LEGAL_URLS.deleteData, label: t("settings.deleteDataGuide"), Icon: Globe },
  ];
  return (
    <>
      <SettingsPageHeader id="legal" />
      <ul className="overflow-hidden rounded-3xl border border-frosted-border bg-surface/80 shadow-soft backdrop-blur-sm">
        {links.map(({ href, label, Icon }) => (
          <li key={href} className="border-b border-border last:border-b-0">
            <a href={href} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-element">
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-primary-soft text-primary">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-text">{label}</span>
              <span className="sr-only">({t("web.recipe.opensInNewTab")})</span>
              <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-muted" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
