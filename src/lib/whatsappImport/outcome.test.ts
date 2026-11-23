import { describe, expect, it } from 'vitest';

import { classifyExtractResult } from '@/lib/whatsappImport/outcome';
import type { ExtractResult } from '@shared/lib/supabase/extractRecipe';

const recipe = {
  title: 'Shakshuka',
  servings: 2,
  ingredients: [{ name: 'eggs', quantity: 4, unit: '' }],
  instructions: [{ step: 1, text: 'Cook.' }],
  extraction_status: 'full' as const,
};

function result(overrides: Partial<ExtractResult>): ExtractResult {
  return { status: 'full', platform: 'web', request_id: 'req-1', ...overrides } as ExtractResult;
}

describe('classifyExtractResult', () => {
  it('saves a full recipe', () => {
    expect(classifyExtractResult(result({ recipe: recipe as ExtractResult['recipe'] }))).toEqual({
      action: 'save',
      recipe,
    });
  });

  it.each(['insufficient_credits', 'monthly_limit', 'subscription_required', 'insufficient_tokens'])(
    'stops for credits on %s',
    (code) => {
      expect(classifyExtractResult(result({ status: 'failed', code }))).toEqual({
        action: 'done',
        result: { status: 'out_of_credits' },
        acknowledge: true,
      });
    },
  );

  it('stops the batch at the daily limit and says why', () => {
    expect(classifyExtractResult(result({ status: 'failed', code: 'daily_limit' }))).toEqual({
      action: 'done',
      result: { status: 'out_of_credits' },
      acknowledge: true,
      dailyLimit: true,
    });
  });

  it('marks a link already in the Library as already saved, with its id', () => {
    expect(
      classifyExtractResult(result({ cached: true, recipe: { ...recipe, id: 'r-9' } as ExtractResult['recipe'] })),
    ).toEqual({ action: 'done', result: { status: 'already_saved', recipeId: 'r-9' }, acknowledge: true });
  });

  it('counts a failed find as failed, with its code', () => {
    expect(classifyExtractResult(result({ status: 'failed', code: 'not_food' }))).toEqual({
      action: 'done',
      result: { status: 'failed', code: 'not_food' },
      acknowledge: true,
    });
  });

  it('keeps the request id when the charge is uncertain', () => {
    expect(classifyExtractResult(result({ status: 'failed', code: 'no_response' }))).toEqual({
      action: 'done',
      result: { status: 'failed', code: 'no_response' },
      acknowledge: false,
    });
  });

  it('does not save a partial recipe (ADR 019)', () => {
    expect(
      classifyExtractResult(
        result({
          status: 'partial',
          recipe: { ...recipe, extraction_status: 'partial', instructions: [] } as ExtractResult['recipe'],
        }),
      ),
    ).toEqual({ action: 'done', result: { status: 'failed', code: 'partial' }, acknowledge: true });
  });

  it('counts an answer without a recipe as failed', () => {
    expect(classifyExtractResult(result({ status: 'full', request_id: undefined }))).toEqual({
      action: 'done',
      result: { status: 'failed', code: 'not_found' },
      acknowledge: false,
    });
  });
});
