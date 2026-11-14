import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '@/i18n/locales/en';
import { RECIPE_VARIANTS } from '@/lib/recipeVariants';

function serverVariantKeys(): string[] {
  const src = readFileSync(
    join(__dirname, '../../supabase/functions/_shared/recipeVariant.ts'),
    'utf8',
  );
  const block = src.match(/const VARIANT_INSTRUCTIONS[^{]*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('VARIANT_INSTRUCTIONS not found');
  return [...block[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

describe('recipe variants', () => {
  it('offers the same variants the Edge Function has instructions for', () => {
    expect(RECIPE_VARIANTS.map((v) => v.key).sort()).toEqual(serverVariantKeys().sort());
  });

  it('includes keto, mediterranean, paleo and pescatarian', () => {
    const keys = RECIPE_VARIANTS.map((v) => v.key);
    expect(keys).toEqual(expect.arrayContaining(['keto', 'mediterranean', 'paleo', 'pescatarian']));
  });

  it('has an English label and description for every variant', () => {
    const variants = en.recipe.variants as Record<string, { label: string; description: string }>;
    for (const { key } of RECIPE_VARIANTS) {
      expect(variants[key]?.label, key).toBeTruthy();
      expect(variants[key]?.description, key).toBeTruthy();
    }
  });
});
