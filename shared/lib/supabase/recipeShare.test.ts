import { describe, expect, it, vi } from 'vitest';

import { recipeShareLandingUrl } from './recipeShare';

// vi.mock is hoisted above the imports.
vi.mock('./client', () => ({ supabase: {} }));

describe('recipeShareLandingUrl', () => {
  it('always uses the domain the apps claim for universal links', () => {
    expect(recipeShareLandingUrl('AbC_-123')).toBe('https://pinch-app.io/s/AbC_-123');
  });
});
