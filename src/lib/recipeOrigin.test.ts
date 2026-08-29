import { describe, expect, it } from 'vitest';

import { recipeIsInvented, recipeMatchesUrlOrigin, recipeUrlOrigin } from './recipeOrigin';

describe('recipeIsInvented', () => {
  it('is true only for invented extraction_source', () => {
    expect(recipeIsInvented({ extraction_source: 'invented' })).toBe(true);
    expect(recipeIsInvented({ extraction_source: 'photo' })).toBe(false);
    expect(recipeIsInvented({ extraction_source: 'video' })).toBe(false);
    expect(recipeIsInvented({})).toBe(false);
  });

  it('treats null and photo sources as extracted origin', () => {
    expect(recipeUrlOrigin('invented')).toBe('invented');
    expect(recipeUrlOrigin('photo')).toBe('extracted');
    expect(recipeUrlOrigin(undefined)).toBe('extracted');
    expect(recipeMatchesUrlOrigin({ extraction_source: 'invented' }, 'invented')).toBe(true);
    expect(recipeMatchesUrlOrigin({ extraction_source: 'web' }, 'extracted')).toBe(true);
  });
});
