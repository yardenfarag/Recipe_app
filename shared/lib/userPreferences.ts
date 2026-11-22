/**
 * Theme, language, spoons-or-grams and Metric-or-US, kept on the account so they follow the cook between the phone and the web
 * (PIN-154).
 *
 * Where they live in `auth.users.user_metadata`:
 * - `locale`: the app language. It was already there for emails (welcome, codes, receipts), so it stays top level.
 * - `prefs`: `{ scheme, pack, measurement, units }` (`units` since PIN-53).
 *
 * GoTrue merges `updateUser({ data })` one top-level key deep, so a write replaces the whole `prefs` object. Build it
 * with `preferencesUpdate`, which starts from the account's current `prefs` and keeps keys it doesn't know (a newer
 * build may have added some). Values read back are checked one by one: anything unexpected is ignored, never thrown.
 */
import { THEME_PACK_ORDER, type ThemePackId } from '../constants/themes';
import { isAppLanguageCode, type AppLanguageCode } from './appLanguages';
import type { MeasurementSystem } from './convertMeasurement';
import { parseUnitSystem, type UnitSystem } from './unitSystem';

/** Light, dark, or follow the device ("auto" in the UI). */
export type SchemePreference = 'system' | 'light' | 'dark';

export interface UserPreferences {
  scheme?: SchemePreference;
  pack?: ThemePackId;
  language?: AppLanguageCode;
  measurement?: MeasurementSystem;
  /** Metric (°C, g, cm) or US (°F, oz, in). Unset means the app language's default (`defaultUnitSystem`). */
  units?: UnitSystem;
}

export const PREFERENCE_KEYS = ['scheme', 'pack', 'language', 'measurement', 'units'] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

/** The metadata keys. `locale` predates this and is shared with the auth emails. */
export const PREFS_METADATA_KEY = 'prefs';
export const LOCALE_METADATA_KEY = 'locale';

export function parseSchemePreference(value: unknown): SchemePreference | undefined {
  return value === 'system' || value === 'light' || value === 'dark' ? value : undefined;
}

export function parseThemePack(value: unknown): ThemePackId | undefined {
  // "potter" was renamed; old devices may still hold it.
  if (value === 'potter') return 'wizard';
  return typeof value === 'string' && THEME_PACK_ORDER.includes(value as ThemePackId)
    ? (value as ThemePackId)
    : undefined;
}

export function parseAppLanguage(value: unknown): AppLanguageCode | undefined {
  return typeof value === 'string' && isAppLanguageCode(value) ? value : undefined;
}

export function parseMeasurementSystem(value: unknown): MeasurementSystem | undefined {
  return value === 'original' || value === 'metric' ? value : undefined;
}

const PARSERS: { [K in PreferenceKey]: (value: unknown) => UserPreferences[K] } = {
  scheme: parseSchemePreference,
  pack: parseThemePack,
  language: parseAppLanguage,
  measurement: parseMeasurementSystem,
  units: parseUnitSystem,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only the valid fields of `value`; anything else is dropped. */
export function cleanPreferences(value: unknown): UserPreferences {
  const out: UserPreferences = {};
  if (!isRecord(value)) return out;
  for (const key of PREFERENCE_KEYS) {
    const parsed = PARSERS[key](value[key]);
    if (parsed !== undefined) (out as Record<string, unknown>)[key] = parsed;
  }
  return out;
}

/** The preferences an account holds, from its `user_metadata`. Missing or bad values are left out. */
export function readAccountPreferences(metadata: unknown): UserPreferences {
  if (!isRecord(metadata)) return {};
  const prefs = isRecord(metadata[PREFS_METADATA_KEY]) ? (metadata[PREFS_METADATA_KEY] as Record<string, unknown>) : {};
  return cleanPreferences({
    scheme: prefs.scheme,
    pack: prefs.pack,
    measurement: prefs.measurement,
    units: prefs.units,
    language: metadata[LOCALE_METADATA_KEY],
  });
}

/**
 * The `data` for `auth.updateUser` that saves `changes` on an account whose metadata is `metadata`, or null when the
 * account already holds them. `prefs` is written whole (the account's current one plus the changes, unknown keys
 * kept); `locale` only when the language changes.
 */
export function preferencesUpdate(metadata: unknown, changes: UserPreferences): Record<string, unknown> | null {
  const clean = cleanPreferences(changes);
  const current = readAccountPreferences(metadata);
  const data: Record<string, unknown> = {};

  if (clean.language !== undefined && clean.language !== current.language) {
    data[LOCALE_METADATA_KEY] = clean.language;
  }

  const prefChanges: Record<string, unknown> = {};
  for (const key of ['scheme', 'pack', 'measurement', 'units'] as const) {
    if (clean[key] !== undefined && clean[key] !== current[key]) prefChanges[key] = clean[key];
  }
  if (Object.keys(prefChanges).length > 0) {
    const existing = isRecord(metadata) && isRecord(metadata[PREFS_METADATA_KEY]) ? metadata[PREFS_METADATA_KEY] : {};
    data[PREFS_METADATA_KEY] = { ...(existing as Record<string, unknown>), ...prefChanges };
  }

  return Object.keys(data).length > 0 ? data : null;
}

/** `metadata` as it will be once `data` (from `preferencesUpdate`) is saved: GoTrue's one-level merge. */
export function applyMetadataUpdate(
  metadata: unknown,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(isRecord(metadata) ? metadata : {}), ...data };
}

/**
 * First sync: what this device chose that the account doesn't hold yet. Saving it means nobody loses their setup
 * when they first use a build that syncs.
 */
export function missingFromAccount(account: UserPreferences, device: UserPreferences): UserPreferences {
  const out: UserPreferences = {};
  const deviceClean = cleanPreferences(device);
  for (const key of PREFERENCE_KEYS) {
    if (account[key] === undefined && deviceClean[key] !== undefined) {
      (out as Record<string, unknown>)[key] = deviceClean[key];
    }
  }
  return out;
}

export function samePreferences(a: UserPreferences, b: UserPreferences): boolean {
  return PREFERENCE_KEYS.every((key) => a[key] === b[key]);
}

export function hasPreferences(value: UserPreferences): boolean {
  return PREFERENCE_KEYS.some((key) => value[key] !== undefined);
}
