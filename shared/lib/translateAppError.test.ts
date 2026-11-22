import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { joinErrorSentences, translateAppError, UserFacingError } from './translateAppError';

const t = ((key: string) => `t:${key}`) as unknown as TFunction;

describe('translateAppError', () => {
  it('translates a known lib message', () => {
    expect(translateAppError(new Error('You already have a collection with that name.'), t)).toBe(
      't:library.collectionNameTaken',
    );
    expect(translateAppError(new Error('Recipe name is required.'), t)).toBe('t:library.recipeNameRequired');
  });

  it('shows a UserFacingError as is', () => {
    expect(translateAppError(new UserFacingError('כבר יש מתכון בשם הזה.'), t)).toBe('כבר יש מתכון בשם הזה.');
  });

  it('never shows a raw message: falls back to the friendly key', () => {
    expect(translateAppError(new TypeError('Failed to fetch'), t)).toBe('t:common.tryAgain');
    expect(translateAppError(new Error('duplicate key value violates unique constraint'), t, 'library.couldNotSave')).toBe(
      't:library.couldNotSave',
    );
  });

  it('falls back for things that are not errors', () => {
    expect(translateAppError({ message: 'JWT expired', code: 'PGRST301' }, t)).toBe('t:common.tryAgain');
    expect(translateAppError('Failed to fetch', t)).toBe('t:common.tryAgain');
    expect(translateAppError(undefined, t, 'cookbook.generateFailed')).toBe('t:cookbook.generateFailed');
  });

  it('falls back when a UserFacingError has no text', () => {
    expect(translateAppError(new UserFacingError(''), t)).toBe('t:common.tryAgain');
  });
});

describe('joinErrorSentences', () => {
  it('joins a title and a reason as two sentences', () => {
    expect(joinErrorSentences("Couldn't delete", 'Try again.')).toBe("Couldn't delete. Try again.");
  });

  it('does not double the full stop', () => {
    expect(joinErrorSentences("Couldn't delete.", 'Try again.')).toBe("Couldn't delete. Try again.");
    expect(joinErrorSentences('לא הצלחנו?', 'נסו שוב.')).toBe('לא הצלחנו? נסו שוב.');
    expect(joinErrorSentences('تعذّر الحذف؟', 'حاول مرة أخرى.')).toBe('تعذّر الحذف؟ حاول مرة أخرى.');
  });

  it('copes with an empty part', () => {
    expect(joinErrorSentences("Couldn't delete", '')).toBe("Couldn't delete");
    expect(joinErrorSentences('', 'Try again.')).toBe('Try again.');
  });
});
