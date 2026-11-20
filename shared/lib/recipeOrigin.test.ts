import { describe, expect, it } from 'vitest';

import {
  recipeHasSource,
  recipeIsInvented,
  recipeIsWritten,
  recipeMatchesUrlOrigin,
  recipeOriginChip,
  recipeUrlOrigin,
} from './recipeOrigin';

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

describe('written recipes', () => {
  it('shows the Written chip only for manual recipes and Guessed only for invented ones', () => {
    expect(recipeOriginChip({ extraction_source: 'manual' })).toBe('written');
    expect(recipeOriginChip({ extraction_source: 'invented' })).toBe('invented');
    expect(recipeOriginChip({ extraction_source: 'video' })).toBeNull();
    expect(recipeOriginChip({ extraction_source: 'photo' })).toBeNull();
    expect(recipeOriginChip({})).toBeNull();
    expect(recipeOriginChip(null)).toBeNull();
  });

  it('has no source, like a guessed recipe', () => {
    expect(recipeIsWritten({ extraction_source: 'manual' })).toBe(true);
    expect(recipeIsWritten({ extraction_source: 'invented' })).toBe(false);
    expect(recipeHasSource({ extraction_source: 'manual' })).toBe(false);
    expect(recipeHasSource({ extraction_source: 'invented' })).toBe(false);
    expect(recipeHasSource({ extraction_source: 'web' })).toBe(true);
    expect(recipeHasSource({ extraction_source: 'photo' })).toBe(true);
  });

  it('never matches an invented recipe by URL origin', () => {
    expect(recipeMatchesUrlOrigin({ extraction_source: 'manual' }, 'invented')).toBe(false);
  });
});
