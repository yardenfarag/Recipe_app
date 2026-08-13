import { describe, expect, it } from 'vitest';

import { assertTranslationIdentity } from '../../supabase/functions/_shared/translationIntegrity';

const ingredients = [{ quantity: 2 }, { quantity: 500 }];
const instructions = [{ step: 1 }, { step: 2 }];

describe('assertTranslationIdentity', () => {
  it('accepts exact source identity and order', () => {
    expect(() =>
      assertTranslationIdentity(
        ingredients,
        instructions,
        [
          { source_index: 0, quantity: 2 },
          { source_index: 1, quantity: 500 },
        ],
        [
          { source_index: 0, step: 1 },
          { source_index: 1, step: 2 },
        ],
      ),
    ).not.toThrow();
  });

  it('rejects same-length reordered ingredients', () => {
    expect(() =>
      assertTranslationIdentity(
        ingredients,
        instructions,
        [
          { source_index: 1, quantity: 500 },
          { source_index: 0, quantity: 2 },
        ],
        [
          { source_index: 0, step: 1 },
          { source_index: 1, step: 2 },
        ],
      ),
    ).toThrow(/ingredient identity/);
  });

  it('rejects reordered or renumbered instructions', () => {
    expect(() =>
      assertTranslationIdentity(
        ingredients,
        instructions,
        [
          { source_index: 0, quantity: 2 },
          { source_index: 1, quantity: 500 },
        ],
        [
          { source_index: 1, step: 2 },
          { source_index: 0, step: 1 },
        ],
      ),
    ).toThrow(/instruction identity/);
  });

  it('rejects an ingredient quantity mutation', () => {
    expect(() =>
      assertTranslationIdentity(
        ingredients,
        instructions,
        [
          { source_index: 0, quantity: 3 },
          { source_index: 1, quantity: 500 },
        ],
        [
          { source_index: 0, step: 1 },
          { source_index: 1, step: 2 },
        ],
      ),
    ).toThrow(/ingredient identity/);
  });
});
