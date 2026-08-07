import { describe, expect, it } from 'vitest';

import {
  mergeRewrittenInstructions,
  patchInstructionsForSubstitution,
} from '@/lib/patchInstructionsForSubstitution';

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

  it('returns originals when rewrite is empty', () => {
    const original = [{ step: 1, text: 'Bake.' }];
    expect(mergeRewrittenInstructions(original, [])).toBe(original);
  });
});
