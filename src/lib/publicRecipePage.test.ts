import { describe, expect, it } from 'vitest';

import {
  PUBLIC_RECIPE_COLUMNS,
  buildPublicRecipePage,
  buildRecipeRobots,
  buildRecipeSitemap,
  formatPublicAmount,
  parsePublicRecipePath,
} from '../../supabase/functions/_shared/publicRecipePage';

const card = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'garlic-butter-pasta-100000000000',
  title: 'Garlic <Butter> Pasta',
  originalUrl: 'https://www.tiktok.com/@chef/video/1',
  platform: 'tiktok',
  servings: 2,
  calories: 520,
  estimatedTimeMinutes: 20,
  tags: ['pasta'],
  sourceLanguage: 'en',
  ingredients: [
    {
      name: 'butter',
      quantity: 3,
      unit: 'tbsp',
      metric: { quantity: 42, unit: 'g' },
      spoons: { quantity: 3, unit: 'tbsp' },
    },
    {
      name: 'parmesan',
      quantity: 0.25,
      unit: 'cup',
      spoons: { quantity: 0.25, unit: 'cup' },
      metric: { quantity: 25, unit: 'g' },
    },
  ],
  instructions: [{ step: 1, text: 'Melt the butter.', timestamp_seconds: 12 }],
};

describe('public recipe pages', () => {
  it('reads recipe text and leaves media columns out', () => {
    expect(PUBLIC_RECIPE_COLUMNS).not.toContain('image_url');
    expect(PUBLIC_RECIPE_COLUMNS).not.toContain('source_video_url');
  });

  it('routes slugs, robots, and the sitemap', () => {
    expect(parsePublicRecipePath('/functions/v1/public-recipe/garlic-butter-pasta-abc')).toEqual({
      kind: 'recipe',
      slug: 'garlic-butter-pasta-abc',
    });
    expect(parsePublicRecipePath('/public-recipe/robots.txt').kind).toBe('robots');
    expect(parsePublicRecipePath('/public-recipe/sitemap.xml').kind).toBe('sitemap');
    expect(parsePublicRecipePath('/public-recipe').kind).toBe('home');
    expect(parsePublicRecipePath('/public-recipe/../admin').kind).toBe('unknown');
  });

  it('formats cooking amounts', () => {
    expect(formatPublicAmount(0.25, 'cup')).toBe('¼ cup');
    expect(formatPublicAmount(1.5, 'cups')).toBe('1½ cups');
    expect(formatPublicAmount(200, 'g')).toBe('200 g');
  });

  it('publishes the recipe without the creator photo or video', () => {
    const page = buildPublicRecipePage({
      ...card,
      indexable: false,
    });
    expect(page.status).toBe(200);
    expect(page.indexable).toBe(false);
    expect(page.body).toContain('Garlic &lt;Butter&gt; Pasta');
    expect(page.body).toContain('¼ cup');
    expect(page.body).toContain('42 g');
    expect(page.body).toContain('https://www.tiktok.com/@chef/video/1');
    expect(page.body).toContain('noindex, nofollow');
    expect(page.body).toContain('dir="ltr"');
    expect(page.body).toContain(`/hub/${card.id}`);
    expect(page.body).not.toContain('<img');
    expect(page.body).not.toContain('<video');
    expect(page.body).not.toContain('<iframe');
    expect(page.body).not.toContain('og:image');
    expect(page.body).not.toContain('timestamp_seconds');
    expect(page.body).toContain('Melt the butter.');
    const ld = page.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(ld).toBeTruthy();
    const recipe = JSON.parse(ld?.[1] ?? '{}') as { image?: string; video?: string };
    expect(recipe.image).toBeUndefined();
    expect(recipe.video).toBeUndefined();
  });

  it('keeps a javascript url off the page and flips layout for Hebrew', () => {
    const page = buildPublicRecipePage({
      ...card,
      title: 'שקשוקה',
      originalUrl: 'javascript:alert(1)',
      sourceLanguage: 'he',
      indexable: true,
    });
    expect(page.body).toContain('dir="rtl"');
    expect(page.body).toContain('lang="he"');
    expect(page.indexable).toBe(true);
    expect(page.body).toContain('index, follow');
    expect(page.body).not.toContain('javascript:');
    expect(page.body).toContain('The original post is not available');
  });

  it('embeds a servings formatter the page can run', () => {
    const page = buildPublicRecipePage(card);
    const start = page.body.indexOf('function formatPublicAmount');
    const end = page.body.indexOf('(function ()', start);
    const formatter = new Function(`return (${page.body.slice(start, end).trim()});`)() as (
      quantity: number,
      unit: string,
    ) => string;
    expect(formatter(0.25, 'cup')).toBe('¼ cup');
    expect(page.body).toContain('Melt the butter.');
  });

  it('hides the sitemap until indexing is turned on', () => {
    expect(buildRecipeRobots('https://r.pinch-app.io', false).body).toContain('Disallow: /');
    const sitemap = buildRecipeSitemap('https://r.pinch-app.io', [
      { public_slug: 'pasta-abc', updated_at: '2026-09-28T00:00:00Z' },
      { public_slug: '<script>', updated_at: null },
    ]);
    expect(sitemap.body).toContain('https://r.pinch-app.io/pasta-abc');
    expect(sitemap.body).not.toContain('<script>');
  });
});
