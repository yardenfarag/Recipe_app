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
import { Tile, TileBadge, TileLabel, tileClasses } from "@/components/ui/Tile";
import { APP_VERSION } from "@/lib/activity/appInfo";
import { cn } from "@/lib/cn";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { HOUSEHOLD_SEEN_KEY, useLocalFlag } from "@/lib/household/localFlags";
import { ADMIN_LINK, SETTINGS_GROUPS, type SettingsSection, type SettingsSectionId } from "@/lib/settings/sections";
import { shareApp } from "@/lib/settings/shareApp";

const MODE_LABEL = { system: "theme.auto", light: "theme.light", dark: "theme.dark" } as const;

/** Activity-log ids for the section links: the mobile settings rows' ids where there is one. */
const SECTION_TRACK_ID: Record<SettingsSectionId, string> = {
  account: "settings.account",
  credits: "settings.plan",
  recipe: "settings.recipe_preferences",
  household: "settings.household",
  pantry: "settings.pantry",
  recipes: "settings.your_recipes",
  appearance: "settings.appearance",
  language: "settings.language",
  emails: "settings.emails",
  support: "settings.help_support",
  legal: "settings.legal_support",
};


/** What a row shows after its name in the phone menu: the current choice where there is one, else what it's for. */
function useRowValues(): Partial<Record<SettingsSectionId, string>> {
  const { t } = useTranslation();
  const { totalCredits } = useSettingsProfile();
  const { preference, pack } = useTheme();
  const { language } = useLanguage();
  const { household } = useHousehold();
  return {
    household: household?.isSetUp
      ? household.members.length > 1
        ? t("household.settingsHintShared", { name: household.name ?? "", count: household.members.length })
        : (household.name ?? undefined)
      : undefined,
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
    <nav aria-label={t("settings.title")} className="flex flex-col gap-5">
      <p aria-hidden className="px-1 font-display text-[26px] leading-tight font-bold text-text">
        {t("settings.title")}
      </p>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.titleKey}>
          <TileLabel className="mb-1.5 px-1">{t(group.titleKey)}</TileLabel>
          <ul className="flex flex-col gap-0.5">
            {group.sections.map((section) => (
              <li key={section.id}>
                <RailLink
                  href={section.href}
                  trackId={SECTION_TRACK_ID[section.id]}
                  icon={<section.icon aria-hidden className="h-5 w-5" />}
                  current={section.id === current}
                  badge={section.id === "household" ? <NewBadge /> : null}
                >
                  {t(section.labelKey)}
                </RailLink>
              </li>
            ))}
            {group.titleKey === "web.settings.helpGroup" ? (
              <li>
                <button type="button" data-track="settings.share_app" onClick={() => void shareApp(t)} className={cn(railRowClass, "w-full text-start")}>
                  <RowIcon small>
                    <Share2 aria-hidden className="h-5 w-5" />
                  </RowIcon>
                  <span className="min-w-0 flex-1 leading-snug">{t("settings.shareApp")}</span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ))}
      {isAdmin ? (
        <RailLink href={ADMIN_LINK.href} trackId="settings.admin.dashboard" icon={<ShieldCheck aria-hidden className="h-5 w-5" />} current={false}>
          {t(ADMIN_LINK.labelKey)}
        </RailLink>
      ) : null}
      <AppVersion />
    </nav>
  );
}

/** A row of the menu beside the page: 44 px, straight on the page; the open page's row sits on the element colour. */
const railRowClass =
  "flex min-h-11 items-center gap-3 rounded-[14px] p-1 pe-3 text-[15px] font-semibold text-text transition-colors hover:bg-element active:bg-selected";

function RailLink({
  href,
  icon,
  current,
  children,
  trackId,
  badge,
}: {
  href: string;
  icon: ReactNode;
  current: boolean;
  children: ReactNode;
  trackId: string;
  badge?: ReactNode;
}) {
  return (
    <Link href={href} data-track={trackId} aria-current={current ? "page" : undefined} className={cn(railRowClass, current && "bg-element")}>
      <RowIcon small>{icon}</RowIcon>
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      {badge}
      <RowChevron />
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
        className={tileClasses({ className: "flex items-center gap-4 p-4 transition-colors hover:bg-element active:bg-selected" })}
      >
        <ProfileAvatar url={avatarUrl} className="h-14 w-14" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg font-bold text-text" dir="ltr">
            {user?.email}
          </span>
          <span className="mt-0.5 block text-sm text-muted">
            {t("settings.signedIn", {
              plan: totalCredits == null ? t("settings.recipeCredits") : t("settings.creditsTotal", { count: totalCredits }),
            })}
          </span>
        </span>
        <RowChevron />
      </Link>

      {SETTINGS_GROUPS.map((group) => (
        <div key={group.titleKey}>
          <TileLabel className="mb-2 px-1">{t(group.titleKey)}</TileLabel>
          <Tile as="ul" className="p-2">
            {/* The card above is the way into Account. */}
            {group.sections.filter((section) => section.id !== "account").map((section) => (
              <li key={section.id}>
                <ListRow section={section} value={values[section.id] ?? (section.hintKey ? t(section.hintKey) : undefined)} />
              </li>
            ))}
            {group.titleKey === "web.settings.helpGroup" ? (
              <li>
                <button type="button" data-track="settings.share_app" onClick={() => void shareApp(t)} className={cn(rowClass, "w-full text-start")}>
                  <RowIcon>
                    <Share2 aria-hidden className="h-5 w-5" />
                  </RowIcon>
                  <RowText label={t("settings.shareApp")} value={t("settings.shareAppHint")} />
                </button>
              </li>
            ) : null}
          </Tile>
        </div>
      ))}

      {isAdmin ? (
        <Tile className="p-2">
          <Link href={ADMIN_LINK.href} data-track="settings.admin.dashboard" className={rowClass}>
            <RowIcon>
              <ShieldCheck aria-hidden className="h-5 w-5" />
            </RowIcon>
            <RowText label={t(ADMIN_LINK.labelKey)} value={t(ADMIN_LINK.hintKey)} />
            <RowChevron />
          </Link>
        </Tile>
      ) : null}
      <AppVersion />
    </nav>
  );
}

/** The version at the foot of Settings, as on mobile: what support asks for. "-next" marks this web app. */
function AppVersion() {
  return (
    <p data-testid="app-version" dir="ltr" className="px-1 text-center text-xs text-muted">
      v{APP_VERSION}
    </p>
  );
}

/** A row inside a menu tile on a phone: 56 px or more, with its current value under the name. */
const rowClass = "flex min-h-14 items-center gap-3 rounded-2xl p-2 pe-3 transition-colors hover:bg-element active:bg-selected";

function RowIcon({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center bg-accent-soft text-accent-text", small ? "h-9 w-9 rounded-[10px]" : "h-10 w-10 rounded-xl")}>
      {children}
    </span>
  );
}

function RowChevron() {
  return <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted rtl:rotate-180" />;
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
        <section.icon aria-hidden className="h-5 w-5" />
      </RowIcon>
      <RowText label={t(section.labelKey)} value={value} />
      {section.id === "household" ? <NewBadge /> : null}
      <RowChevron />
    </Link>
  );
}

/**
 * "New" on the Household row until its page has been opened in this browser (ADR 034), so people find sharing.
 * Read out after the row's name.
 */
function NewBadge() {
  const { t } = useTranslation();
  const [seen] = useLocalFlag(HOUSEHOLD_SEEN_KEY);
  if (seen) return null;
  return <TileBadge className="shrink-0">{t("household.new")}</TileBadge>;
}
