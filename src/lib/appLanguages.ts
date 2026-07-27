/**
 * App UI + automatic recipe display languages (Phase A/B).
 * German/French remain recipe-modal-only via RECIPE_LANGUAGES.
 */

export const APP_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'he', label: 'Hebrew', nativeLabel: 'עברית' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
] as const;

export type AppLanguageCode = (typeof APP_LANGUAGES)[number]['code'];

export function isAppLanguageCode(value: string): value is AppLanguageCode {
  return APP_LANGUAGES.some((lang) => lang.code === value);
}

export function getAppLanguageLabel(code: AppLanguageCode): string {
  return APP_LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}

export function getAppLanguageNativeLabel(code: AppLanguageCode): string {
  return APP_LANGUAGES.find((lang) => lang.code === code)?.nativeLabel ?? code;
}

export function isRtlAppLanguage(code: AppLanguageCode | null | undefined): boolean {
  return code === 'he' || code === 'ar';
}

/** Map a device language code onto a supported app language; else English. */
export function resolveAppLanguageFromDevice(languageCode: string | null | undefined): AppLanguageCode {
  if (!languageCode) return 'en';
  const normalized = languageCode.toLowerCase().split('-')[0];
  return isAppLanguageCode(normalized) ? normalized : 'en';
}

/** Canonical recipe language when extract did not set one (Gemini extracts in English). */
export const DEFAULT_SOURCE_LANGUAGE = 'en' as const;

export function effectiveSourceLanguage(
  sourceLanguage: string | null | undefined,
): string {
  return sourceLanguage?.trim() || DEFAULT_SOURCE_LANGUAGE;
}
