import type { TFunction } from 'i18next';

/**
 * An error whose message is already written for the person reading it, in their language
 * (`throw new UserFacingError(t('library.recipeNameTaken'))`). `translateAppError` shows it as is.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** Stable English messages thrown from libs — mapped to i18n keys for display. */
const ERROR_MESSAGE_KEYS: Record<string, string> = {
  'You already have a collection with that name.': 'library.collectionNameTaken',
  'Collection name is required.': 'library.collectionNameRequiredShort',
  'You already have a recipe with that name.': 'library.recipeNameTaken',
  'Recipe name is required.': 'library.recipeNameRequired',
  'Name is required.': 'library.nameRequired',
  'Recipe not found.': 'library.recipeNotFound',
};

function isUserFacing(err: unknown): err is Error {
  return err instanceof UserFacingError || (err instanceof Error && err.name === 'UserFacingError');
}

/**
 * Turns a caught error into text for the reader: a `UserFacingError` as is, a known lib message
 * translated, and anything else (network failures, database errors, "Failed to fetch") as the
 * friendly `fallbackKey`. Raw messages never reach the screen: they are English and mean nothing
 * to the cook.
 */
export function translateAppError(
  err: unknown,
  t: TFunction,
  fallbackKey = 'common.tryAgain',
): string {
  if (isUserFacing(err) && err.message) return err.message;
  const message = err instanceof Error ? err.message : '';
  const key = message ? ERROR_MESSAGE_KEYS[message] : undefined;
  if (key) return t(key);
  return t(fallbackKey);
}

/**
 * Joins a short failure title and its reason into two sentences:
 * "Couldn't delete" + "Try again." → "Couldn't delete. Try again.".
 * No extra full stop when the title already ends with one (or with ! ? … ؟ 。).
 */
export function joinErrorSentences(title: string, reason: string): string {
  const head = title.trim();
  const tail = reason.trim();
  if (!tail) return head;
  if (!head) return tail;
  return /[.!?…؟。]$/u.test(head) ? `${head} ${tail}` : `${head}. ${tail}`;
}
