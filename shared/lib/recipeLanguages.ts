/** Supported recipe content languages for on-demand translation. */
export const RECIPE_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'he', label: 'Hebrew', nativeLabel: 'עברית' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
] as const;

export type RecipeLanguageCode = (typeof RECIPE_LANGUAGES)[number]['code'];

export function isRecipeLanguageCode(value: string): value is RecipeLanguageCode {
  return RECIPE_LANGUAGES.some((lang) => lang.code === value);
}

export function getRecipeLanguageLabel(code: RecipeLanguageCode): string {
  return RECIPE_LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}

export function isRtlRecipeLanguage(code: RecipeLanguageCode | null | undefined): boolean {
  return code === 'he' || code === 'ar';
}
