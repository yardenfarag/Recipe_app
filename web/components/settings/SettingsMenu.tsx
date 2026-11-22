"use client";

import { ChevronRight, Share2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { APP_LANGUAGES } from "@shared/lib/appLanguages";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { ProfileAvatar } from "@/components/settings/ProfileAvatar";
import { useSettingsProfile } from "@/components/settings/SettingsProfile";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";
import { ADMIN_LINKS, SETTINGS_GROUPS, type SettingsSection, type SettingsSectionId } from "@/lib/settings/sections";
import { shareApp } from "@/lib/settings/shareApp";

const MODE_LABEL = { system: "theme.auto", light: "theme.light", dark: "theme.dark" } as const;

/** Activity-log ids for the section links: the mobile settings rows' ids where there is one. */
const SECTION_TRACK_ID: Record<SettingsSectionId, string> = {
  account: "settings.account",
  credits: "settings.plan",
  recipe: "settings.recipe_preferences",
  appearance: "settings.appearance",
  language: "settings.language",
  support: "settings.help_support",
  legal: "settings.legal_support",
};

/** "/admin/dashboard" → "settings.admin.dashboard". */
const adminTrackId = (href: string) => `settings.admin.${href.slice(href.lastIndexOf("/") + 1)}`;

/** What a row shows after its name in the phone menu: the current choice where there is one, else what it's for. */
function useRowValues(): Partial<Record<SettingsSectionId, string>> {
  const { t } = useTranslation();
  const { totalCredits } = useSettingsProfile();
  const { preference, pack } = useTheme();
  const { language } = useLanguage();
  return {
    credits: totalCredits == null ? undefined : t("settings.creditsTotal", { count: totalCredits }),
    appearance: `${t(MODE_LABEL[preference])} · ${t(`themes.${pack}.name`)}`,
    language: APP_LANGUAGES.find((lang) => lang.code === language)?.nativeLabel,
  };
}

/**
 * The settings menu beside the open page, on a wide screen. Real links, so each page has an address and opens in a
 * new tab; the open one is marked for screen readers too.
 */
export function SettingsRail({ current }: { current: SettingsSectionId }) {
  const { t } = useTranslation();
  const { isAdmin } = useSettingsProfile();
  return (
    <nav aria-label={t("settings.title")} className="flex flex-col gap-6">
      <p aria-hidden className="px-3 pt-1 text-xl font-bold tracking-tight text-text">
        {t("settings.title")}
      </p>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.titleKey}>
          <p className="mb-1.5 px-3 text-xs font-bold tracking-wide text-muted uppercase">{t(group.titleKey)}</p>
          <ul className="flex flex-col gap-0.5">
            {group.sections.map((section) => (
              <li key={section.id}>
                <RailLink href={section.href} trackId={SECTION_TRACK_ID[section.id]} icon={<section.icon aria-hidden className="h-[18px] w-[18px] shrink-0" />} current={section.id === current}>
                  {t(section.labelKey)}
                </RailLink>
              </li>
            ))}
            {group.titleKey === "web.settings.helpGroup" ? (
              <li>
                <button
                  type="button"
                  data-track="settings.share_app"
                  onClick={() => void shareApp(t)}
                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-start text-[15px] font-semibold text-muted transition-colors hover:bg-element hover:text-text"
                >
                  <Share2 aria-hidden className="h-[18px] w-[18px] shrink-0" />
                  {t("settings.shareApp")}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ))}
      {isAdmin ? (
        <div>
          <p className="mb-1.5 px-3 text-xs font-bold tracking-wide text-muted uppercase">{t("settings.adminTitle")}</p>
          <ul className="flex flex-col gap-0.5">
            {ADMIN_LINKS.map((link) => (
              <li key={link.href}>
                <RailLink href={link.href} trackId={adminTrackId(link.href)} icon={<ShieldCheck aria-hidden className="h-[18px] w-[18px] shrink-0" />} current={false}>
                  {t(link.labelKey)}
                </RailLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

function RailLink({ href, icon, current, children, trackId }: { href: string; icon: ReactNode; current: boolean; children: ReactNode; trackId: string }) {
  return (
    <Link
      href={href}
      data-track={trackId}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
        current ? "bg-primary-soft text-primary" : "text-muted hover:bg-element hover:text-text",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}

/** The settings home on a phone or tablet: who is signed in, then every page as a row with its current value. */
export function SettingsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { avatarUrl, totalCredits, isAdmin } = useSettingsProfile();
  const values = useRowValues();

  return (
    <nav aria-label={t("settings.title")} className="flex flex-col gap-6">
      <Link
        href="/settings/account"
        data-track="settings.account"
        className="flex items-center gap-4 rounded-3xl border border-frosted-border bg-surface/80 p-4 shadow-soft backdrop-blur-sm transition-colors hover:bg-surface"
      >
        <ProfileAvatar url={avatarUrl} className="h-14 w-14" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-text" dir="ltr">
            {user?.email}
          </span>
          <span className="mt-0.5 block text-sm text-muted">
            {t("settings.signedIn", {
              plan: totalCredits == null ? t("settings.recipeCredits") : t("settings.creditsTotal", { count: totalCredits }),
            })}
          </span>
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" />
      </Link>

      {SETTINGS_GROUPS.map((group) => (
        <div key={group.titleKey}>
          <p className="mb-2 px-1 text-xs font-bold tracking-wide text-muted uppercase">{t(group.titleKey)}</p>
          <ul className="overflow-hidden rounded-3xl border border-frosted-border bg-surface/80 shadow-soft backdrop-blur-sm">
            {/* The card above is the way into Account. */}
            {group.sections.filter((section) => section.id !== "account").map((section) => (
              <li key={section.id} className="border-b border-border last:border-b-0">
                <ListRow section={section} value={values[section.id] ?? (section.hintKey ? t(section.hintKey) : undefined)} />
              </li>
            ))}
            {group.titleKey === "web.settings.helpGroup" ? (
              <li>
                <button type="button" data-track="settings.share_app" onClick={() => void shareApp(t)} className={cn(rowClass, "w-full text-start")}>
                  <RowIcon>
                    <Share2 aria-hidden className="h-[18px] w-[18px]" />
                  </RowIcon>
                  <RowText label={t("settings.shareApp")} value={t("settings.shareAppHint")} />
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ))}

      {isAdmin ? (
        <div>
          <p className="mb-2 px-1 text-xs font-bold tracking-wide text-muted uppercase">{t("settings.adminTitle")}</p>
          <ul className="overflow-hidden rounded-3xl border border-frosted-border bg-surface/80 shadow-soft backdrop-blur-sm">
            {ADMIN_LINKS.map((link) => (
              <li key={link.href} className="border-b border-border last:border-b-0">
                <Link href={link.href} data-track={adminTrackId(link.href)} className={rowClass}>
                  <RowIcon>
                    <ShieldCheck aria-hidden className="h-[18px] w-[18px]" />
                  </RowIcon>
                  <RowText label={t(link.labelKey)} />
                  <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

const rowClass = "flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-element";

function RowIcon({ children }: { children: ReactNode }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] bg-primary-soft text-primary">{children}</span>;
}

function RowText({ label, value }: { label: string; value?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold text-text">{label}</span>
      {value ? <span className="mt-0.5 block truncate text-sm text-muted">{value}</span> : null}
    </span>
  );
}

function ListRow({ section, value }: { section: SettingsSection; value?: string }) {
  const { t } = useTranslation();
  return (
    <Link href={section.href} data-track={SECTION_TRACK_ID[section.id]} className={rowClass}>
      <RowIcon>
        <section.icon aria-hidden className="h-[18px] w-[18px]" />
      </RowIcon>
      <RowText label={t(section.labelKey)} value={value} />
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" />
    </Link>
  );
}
