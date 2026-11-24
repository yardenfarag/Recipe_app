import { describe, expect, it } from 'vitest';

import {
  mergeRewrittenInstructions,
  patchInstructionsForSubstitution,
} from './patchInstructionsForSubstitution';

describe('patchInstructionsForSubstitution', () => {
  it('replaces Latin ingredient names in step text', () => {
    const result = patchInstructionsForSubstitution(
      [
        { step: 1, text: 'Melt the butter in a pan.' },
        { step: 2, text: 'Add flour and stir.' },
      ],
      'butter',
      'coconut oil',
    );
    expect(result[0].text).toBe('Melt the coconut oil in a pan.');
    expect(result[1].text).toBe('Add flour and stir.');
  });

  it('preserves timestamp_seconds', () => {
    const result = patchInstructionsForSubstitution(
      [{ step: 1, text: 'Cream the Butter until fluffy.', timestamp_seconds: 42 }],
      'butter',
      'olive oil',
    );
    expect(result[0]).toEqual({
      step: 1,
      text: 'Cream the olive oil until fluffy.',
      timestamp_seconds: 42,
    });
  });

  it('replaces Hebrew ingredient names without word boundaries', () => {
    const result = patchInstructionsForSubstitution(
      [{ step: 1, text: 'ממיסים את החמאה במחבת.' }],
      'חמאה',
      'שמן זית',
    );
    expect(result[0].text).toBe('ממיסים את השמן זית במחבת.');
  });

  it('returns originals when names match', () => {
    const steps = [{ step: 1, text: 'Add salt.' }];
    expect(patchInstructionsForSubstitution(steps, 'salt', 'salt')).toBe(steps);
  });
});

describe('mergeRewrittenInstructions', () => {
  it('keeps timestamps from matching original steps', () => {
    const merged = mergeRewrittenInstructions(
      [
        { step: 1, text: 'Melt butter.', timestamp_seconds: 10 },
        { step: 2, text: 'Stir.', timestamp_seconds: 25 },
      ],
      [
        { step: 1, text: 'Melt coconut oil.' },
        { step: 2, text: 'Stir well.' },
      ],
    );
    expect(merged).toEqual([
      { step: 1, text: 'Melt coconut oil.', timestamp_seconds: 10 },
      { step: 2, text: 'Stir well.', timestamp_seconds: 25 },
    ]);
  });

  const recipe = [
    { step: 1, text: 'Preheat the oven.', timestamp_seconds: 5 },
    { step: 2, text: 'Melt butter.', timestamp_seconds: 10 },
    { step: 3, text: 'Bake for 20 minutes.' },
  ];

  it('refuses an empty rewrite', () => {
    expect(mergeRewrittenInstructions(recipe, [])).toBeNull();
  });

  // PIN-186: the shorter rewrite was saved as it came, and step 1 was gone from the recipe.
  it('refuses a rewrite that dropped a step', () => {
    const rewritten = [
      { step: 2, text: 'Melt coconut oil.' },
      { step: 3, text: 'Bake for 20 minutes.' },
    ];
    expect(mergeRewrittenInstructions(recipe, rewritten)).toBeNull();
  });

  it('refuses a rewrite that added a step', () => {
    const rewritten = [...recipe.map(({ step, text }) => ({ step, text })), { step: 4, text: 'Serve warm.' }];
    expect(mergeRewrittenInstructions(recipe, rewritten)).toBeNull();
  });

  it("keeps the recipe's step numbers when the rewrite renumbers them", () => {
    const steps = [
      { step: 2, text: 'Melt butter.' },
      { step: 3, text: 'Bake.' },
    ];
    const merged = mergeRewrittenInstructions(steps, [
      { step: 1, text: 'Melt coconut oil.' },
      { step: 2, text: 'Bake.' },
    ]);
    expect(merged).toEqual([
      { step: 2, text: 'Melt coconut oil.' },
      { step: 3, text: 'Bake.' },
    ]);
  });

  it("keeps a step's text when its rewrite is empty", () => {
    const merged = mergeRewrittenInstructions(recipe, [
      { step: 1, text: '  ' },
      { step: 2, text: 'Melt coconut oil.' },
      { step: 3, text: 'Bake for 20 minutes.' },
    ]);
    expect(merged).toEqual([
      { step: 1, text: 'Preheat the oven.', timestamp_seconds: 5 },
      { step: 2, text: 'Melt coconut oil.', timestamp_seconds: 10 },
      { step: 3, text: 'Bake for 20 minutes.' },
    ]);
  });
});
