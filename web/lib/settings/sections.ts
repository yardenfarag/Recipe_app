import {
  CircleHelp,
  Coins,
  Languages,
  Palette,
  Scale,
  UserRound,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export type SettingsSectionId = "account" | "credits" | "recipe" | "appearance" | "language" | "support" | "legal";

export type SettingsSection = {
  id: SettingsSectionId;
  href: string;
  /** Translation key for its name, in the menu and as the page's heading. */
  labelKey: string;
  /** A line under the heading, and under the name in the phone menu. */
  hintKey?: string;
  icon: LucideIcon;
};

/**
 * The settings pages, in menu order. The paths are the mobile app's (`/settings/recipe`, `/settings/appearance`…), so
 * old links keep working. Account is new on the web: on a wide screen it is also what `/settings` shows.
 *
 * Not here yet, each its own ticket: the PDF cookbook (PIN-142, `/cookbook`, `settings.cookbook`) and downloading or
 * restoring a recipe backup (mobile Settings → Your recipes).
 */
export const SETTINGS_GROUPS: { titleKey: string; sections: SettingsSection[] }[] = [
  {
    titleKey: "web.account",
    sections: [
      { id: "account", href: "/settings/account", labelKey: "web.account", hintKey: "web.settings.accountHint", icon: UserRound },
      // The credits page itself is PIN-141.
      { id: "credits", href: "/settings/credits", labelKey: "settings.plan", icon: Coins },
    ],
  },
  {
    titleKey: "settings.yourSettings",
    sections: [
      { id: "recipe", href: "/settings/recipe", labelKey: "settings.recipePreferences", hintKey: "settings.recipePreferencesHint", icon: UtensilsCrossed },
      { id: "appearance", href: "/settings/appearance", labelKey: "settings.appearance", hintKey: "settings.appearanceHint", icon: Palette },
      { id: "language", href: "/settings/language", labelKey: "settings.languageAndRegion", hintKey: "web.settings.languageHint", icon: Languages },
    ],
  },
  {
    titleKey: "web.settings.helpGroup",
    sections: [
      { id: "support", href: "/settings/support", labelKey: "settings.helpSupport", hintKey: "settings.helpSupportHint", icon: CircleHelp },
      { id: "legal", href: "/settings/legal", labelKey: "settings.legal", hintKey: "settings.legalHint", icon: Scale },
    ],
  },
];

export const SETTINGS_SECTIONS = SETTINGS_GROUPS.flatMap((group) => group.sections);

/**
 * The way into the admin pages (PIN-144), shown to admins only. One row: the admin pages list each other along
 * their top, so Settings doesn't repeat them.
 */
export const ADMIN_LINK = { href: "/admin/dashboard", labelKey: "settings.adminTitle", hintKey: "settings.adminBody" } as const;

/** The settings page at `path` (without the /app base), or null for the settings home (`/settings`). */
export function settingsSectionFor(path: string): SettingsSection | null {
  const clean = path.replace(/\/+$/, "");
  return SETTINGS_SECTIONS.find((section) => clean === section.href || clean.startsWith(`${section.href}/`)) ?? null;
}
