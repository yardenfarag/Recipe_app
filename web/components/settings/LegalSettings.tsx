"use client";

import { ExternalLink, FileText, Globe, Lock, Trash2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { Tile } from "@/components/ui/Tile";
import { LEGAL_URLS } from "@/lib/legal";

/** The legal pages on pinch-app.io (the static files in legal/). They open in a new tab, so Settings stays put. */
export function LegalSettings() {
  const { t } = useTranslation();
  const links: { href: string; label: string; Icon: LucideIcon; trackId: string }[] = [
    { href: LEGAL_URLS.privacy, label: t("settings.privacyPolicy"), Icon: Lock, trackId: "support.privacy_policy" },
    { href: LEGAL_URLS.terms, label: t("settings.termsOfUse"), Icon: FileText, trackId: "support.terms_of_use" },
    { href: LEGAL_URLS.deleteAccount, label: t("settings.deleteAccountGuide"), Icon: Trash2, trackId: "support.delete_account_guide" },
    { href: LEGAL_URLS.deleteData, label: t("settings.deleteDataGuide"), Icon: Globe, trackId: "support.delete_data_guide" },
  ];
  return (
    <>
      <SettingsPageHeader id="legal" />
      <Tile as="ul" className="p-2">
        {links.map(({ href, label, Icon, trackId }) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noreferrer" data-track={trackId} className="flex min-h-14 items-center gap-3 rounded-2xl p-2 pe-3 transition-colors hover:bg-element active:bg-selected">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-text">{label}</span>
              <span className="sr-only">({t("web.recipe.opensInNewTab")})</span>
              <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-muted rtl:-scale-x-100" />
            </a>
          </li>
        ))}
      </Tile>
    </>
  );
}
