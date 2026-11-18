import { describe, expect, it, vi } from 'vitest';

import { recipeShareLandingUrl } from './recipeShare';

// vi.mock is hoisted above the imports.
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }));
// A dev .env can still point the legal pages at an old host; share links must not follow it.
vi.mock('@/lib/legal', () => ({ LEGAL_BASE_URL: 'https://yardenfarag.github.io/Recipe_app' }));

describe('recipeShareLandingUrl', () => {
  it('always uses the domain the apps claim for universal links', () => {
    expect(recipeShareLandingUrl('AbC_-123')).toBe('https://pinch-app.io/s/AbC_-123');
  });
});
