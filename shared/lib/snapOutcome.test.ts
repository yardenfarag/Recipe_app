import { describe, expect, it } from 'vitest';

import type { ExtractResult } from './supabase/extractRecipe';
import { requestSettledWithoutRecipe, snapOutcome } from './snapOutcome';

const recipe = {
  title: 'Soup',
  servings: 2,
  ingredients: [{ name: 'water', quantity: 1, unit: 'l' }],
  instructions: [{ step: 1, text: 'Boil.' }],
  extraction_status: 'full' as const,
};

const result = (fields: Partial<ExtractResult>): ExtractResult => ({ status: 'failed', platform: 'web', ...fields });

describe('snapOutcome', () => {
  it('sends every out-of-credits code to the credits prompt', () => {
    for (const code of ['insufficient_credits', 'subscription_required', 'insufficient_tokens']) {
      expect(snapOutcome(result({ code }), true)).toEqual({ kind: 'credits' });
    }
  });

  it('keeps the server text for a long video, and has a fallback', () => {
    expect(snapOutcome(result({ code: 'video_too_long', message: 'Too long: 40 min' }), true)).toMatchObject({
      messageKey: 'snap.videoTooLong',
      serverMessage: 'Too long: 40 min',
    });
  });

  it('tells a photo from a link when it is not food', () => {
    expect(snapOutcome(result({ code: 'not_food', platform: 'photo' }), true)).toMatchObject({ messageKey: 'snap.notFood' });
    expect(snapOutcome(result({ code: 'not_food' }), true)).toMatchObject({ messageKey: 'snap.notFoodLink' });
  });

  it('the daily limit is information, not an error', () => {
    expect(snapOutcome(result({ code: 'daily_limit' }), true)).toMatchObject({ tone: 'info', messageKey: 'snap.gateDailyLimit' });
  });

  it('offers Guess the recipe for a dish, with Extract anyway only when it may be a recipe', () => {
    expect(snapOutcome(result({ code: 'looks_like_dish', dish_guess: 'Ramen' }), true)).toEqual({
      kind: 'offer_invent',
      dishGuess: 'Ramen',
      allowExtract: true,
    });
    expect(snapOutcome(result({ code: 'no_recipe' }), true)).toMatchObject({ kind: 'offer_invent', allowExtract: false });
    // A Guess run has nothing to hand off to.
    expect(snapOutcome(result({ code: 'no_recipe' }), false)).toMatchObject({ kind: 'message', messageKey: 'snap.notFound' });
  });

  it('a written text with no recipe says so, with no Guess the recipe (it needs a link or a photo)', () => {
    const noRecipe = result({ code: 'no_recipe', platform: 'text', dish_guess: 'Shakshuka', message: 'No recipe in this message.' });
    expect(snapOutcome(noRecipe, true)).toEqual({
      kind: 'message',
      tone: 'error',
      messageKey: 'snap.notFound',
      serverMessage: 'No recipe in this message.',
    });
    expect(snapOutcome(result({ code: 'text_too_short', platform: 'text' }), true)).toMatchObject({
      kind: 'message',
      messageKey: 'snap.notFound',
    });
  });

  it('opens a recipe already in the library', () => {
    const saved = { ...recipe, id: 'r1' };
    expect(snapOutcome(result({ status: 'full', cached: true, recipe: saved }), true)).toEqual({ kind: 'saved', recipe: saved });
  });

  it('a partial import is not previewed', () => {
    const partial = { ...recipe, ingredients: [], extraction_status: 'partial' as const };
    expect(snapOutcome(result({ status: 'partial', recipe: partial }), true)).toEqual({
      kind: 'partial',
      recipe: partial,
      missingIngredients: true,
    });
  });

  it('a partial guess is still previewed', () => {
    const guessed = { ...recipe, extraction_source: 'invented' as const };
    expect(snapOutcome(result({ status: 'partial', recipe: guessed }), false)).toEqual({ kind: 'preview', recipe: guessed });
  });

  it('a whole recipe is previewed', () => {
    expect(snapOutcome(result({ status: 'full', recipe }), true)).toEqual({ kind: 'preview', recipe });
  });

  it('no answer asks to try again; a refunded timeout says the credit was not used', () => {
    const noAnswer = result({ code: 'no_response', message: 'Could not reach the extraction service. Please try again.' });
    expect(snapOutcome(noAnswer, true)).toEqual({ kind: 'message', tone: 'error', messageKey: 'snap.genericError' });
    expect(snapOutcome(result({ code: 'extraction_timeout', message: 'timeout' }), true)).toEqual({
      kind: 'message',
      tone: 'error',
      messageKey: 'snap.timedOut',
    });
  });

  it('a failure without a recipe says none was found', () => {
    expect(snapOutcome(result({}), true)).toMatchObject({ kind: 'message', tone: 'error', messageKey: 'snap.notFound' });
    expect(snapOutcome(result({ status: 'coming_soon' }), true)).toMatchObject({ tone: 'info', messageKey: 'snap.comingSoon' });
  });
});

describe('requestSettledWithoutRecipe', () => {
  it('forgets the id when no recipe came back and the charge is settled', () => {
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', code: 'not_food' }))).toBe(true);
    // Refunded by the server: a retry is a new import.
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', code: 'extraction_timeout' }))).toBe(true);
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', status: 'full', cached: true, recipe: { ...recipe, id: 'r1' } }))).toBe(true);
  });

  it('keeps the id while the charge is uncertain, or a recipe still has to be stored', () => {
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', code: 'metering_error' }))).toBe(false);
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', code: 'compensation_pending' }))).toBe(false);
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', code: 'no_response' }))).toBe(false);
    expect(requestSettledWithoutRecipe(result({ request_id: 'req-1', status: 'full', recipe }))).toBe(false);
    expect(requestSettledWithoutRecipe(result({}))).toBe(false);
  });
});
