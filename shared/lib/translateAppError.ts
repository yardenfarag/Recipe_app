import type { TFunction } from 'i18next';

/** Stable English messages thrown from libs — mapped to i18n keys for display. */
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  'You already have a collection with that name.': 'library.collectionNameTaken',
  'Collection name is required.': 'library.collectionNameRequiredShort',
  'You already have a recipe with that name.': 'library.recipeNameTaken',
  'Recipe name is required.': 'library.recipeNameRequired',
  'Name is required.': 'library.nameRequired',
  'Recipe not found.': 'library.recipeNotFound',
};

/** Translates known app/lib errors; falls back to the raw message or a generic string. */
export function translateAppError(
  err: unknown,
  t: TFunction,
  fallbackKey = 'common.tryAgain',
): string {
  const message = err instanceof Error ? err.message : '';
  const key = message ? ERROR_MESSAGE_KEYS[message] : undefined;
  if (key) return t(key);
  if (message) return message;
  return t(fallbackKey);
}
