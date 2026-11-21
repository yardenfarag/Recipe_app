import {
  DEFAULT_THEME_PACK,
  THEME_PACK_ORDER,
  ThemePacks,
  type ThemePackColors,
  type ThemePackId,
} from "@shared/constants/themes";

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

/** The same keys the Expo web app stores them under, so choices carry over when /app switches (PIN-147). */
export const THEME_STORAGE = { preference: "pinch.themePreference", pack: "pinch.themePack" } as const;
export const LANGUAGE_STORAGE_KEY = "pinch:appLanguage";
/** Spoons or grams: the same key and values as the mobile app (src/hooks/useMeasurementPreference.tsx). */
export const MEASUREMENT_STORAGE_KEY = "pinch:measurementSystem";

/** Theme pack colour → CSS variable. Tailwind reads these through @theme in globals.css. */
const VARIABLES: Partial<Record<keyof ThemePackColors, string>> = {
  text: "--c-text",
  textSecondary: "--c-text-secondary",
  background: "--c-background",
  surface: "--c-surface",
  surfaceSoft: "--c-surface-soft",
  backgroundElement: "--c-element",
  backgroundSelected: "--c-selected",
  primary: "--c-primary",
  primarySoft: "--c-primary-soft",
  onPrimary: "--c-on-primary",
  accent: "--c-accent",
  accentSoft: "--c-accent-soft",
  border: "--c-border",
  danger: "--c-danger",
  dangerSoft: "--c-danger-soft",
  warning: "--c-warning",
  warningSoft: "--c-warning-soft",
  success: "--c-success",
  successSoft: "--c-success-soft",
  tabBar: "--c-tab-bar",
  overlay: "--c-overlay",
  frosted: "--c-frosted",
  frostedBorder: "--c-frosted-border",
  mistOrbA: "--c-orb-a",
  mistOrbB: "--c-orb-b",
  mistOrbC: "--c-orb-c",
};

function declarations(colors: ThemePackColors): string {
  return Object.entries(VARIABLES)
    .map(([key, variable]) => `${variable}:${colors[key as keyof ThemePackColors] as string};`)
    .join("");
}

/**
 * Every pack in light and dark, as CSS. `<html data-pack data-scheme>` picks one. Without them (no script yet),
 * Mist follows the system's light or dark setting.
 */
export function themeCss(): string {
  const fallback = ThemePacks[DEFAULT_THEME_PACK];
  const rules = [
    `:root{color-scheme:light;${declarations(fallback.light)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-scheme]){color-scheme:dark;${declarations(fallback.dark)}}}`,
  ];
  for (const id of THEME_PACK_ORDER) {
    for (const scheme of ["light", "dark"] as const) {
      rules.push(
        `:root[data-pack="${id}"][data-scheme="${scheme}"]{color-scheme:${scheme};${declarations(ThemePacks[id][scheme])}}`,
      );
    }
  }
  return rules.join("\n");
}

/**
 * Runs in <head> before the page paints: applies the saved theme and language, so nothing flashes.
 * Kept small and dependency-free; it is inlined as a string. It reads this browser's copy; when signed in, the
 * account's choice replaces it once loaded and is copied back here, so the next visit paints it straight away.
 */
export function bootScript(): string {
  const packs = JSON.stringify(THEME_PACK_ORDER);
  return `(function(){try{
var d=document.documentElement,s=localStorage;
var p=s.getItem(${JSON.stringify(THEME_STORAGE.preference)});
var k=s.getItem(${JSON.stringify(THEME_STORAGE.pack)});
if(k==="potter")k="wizard";
if(${packs}.indexOf(k)<0)k=${JSON.stringify(DEFAULT_THEME_PACK)};
var dark=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
d.setAttribute("data-pack",k);d.setAttribute("data-scheme",dark?"dark":"light");
var l=s.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)});
if(l==="en"||l==="es"||l==="he"||l==="ru"||l==="ar"){d.lang=l;d.dir=(l==="he"||l==="ar")?"rtl":"ltr";}
}catch(e){}})();`;
}

export function resolveScheme(preference: ThemePreference): Scheme {
  if (preference === "light" || preference === "dark") return preference;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function parsePack(value: string | null): ThemePackId {
  if (value === "potter") return "wizard";
  return THEME_PACK_ORDER.includes(value as ThemePackId) ? (value as ThemePackId) : DEFAULT_THEME_PACK;
}
