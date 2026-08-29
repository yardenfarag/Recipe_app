import { describe, expect, it } from 'vitest';

import { dummyRecipe } from '@/data/dummyRecipe';
import {
  buildCookbookHtml,
  cookbookFileName,
  cookbookPageSizeForLocale,
  cookbookSourceLabel,
  escapeHtml,
  toCookbookHtmlRecipe,
} from '@/lib/cookbook/buildCookbookHtml';

const copy = {
  brand: 'Made with Pinch',
  recipeCount: '1 recipe',
  ingredientsHeading: 'Ingredients',
  stepsHeading: 'Steps',
};

describe('cookbookFileName', () => {
  it('slugifies the title', () => {
    expect(cookbookFileName('  My Summer Pasta!  ')).toBe('My-Summer-Pasta.pdf');
  });

  it('falls back when the title is empty', () => {
    expect(cookbookFileName('   ')).toBe('cookbook.pdf');
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });
});

describe('cookbookPageSizeForLocale', () => {
  it('uses US Letter for en-US', () => {
    expect(cookbookPageSizeForLocale('en-US')).toBe('letter');
    expect(cookbookPageSizeForLocale('en_US')).toBe('letter');
  });

  it('uses A4 otherwise', () => {
    expect(cookbookPageSizeForLocale('en-GB')).toBe('a4');
    expect(cookbookPageSizeForLocale('he-IL')).toBe('a4');
    expect(cookbookPageSizeForLocale(undefined)).toBe('a4');
  });
});

describe('cookbookSourceLabel', () => {
  it('uses the hostname without www', () => {
    expect(cookbookSourceLabel('https://www.tiktok.com/@chef/video/1', 'tiktok', {})).toBe(
      'tiktok.com',
    );
  });

  it('falls back to a platform label when there is no URL', () => {
    expect(
      cookbookSourceLabel(undefined, 'youtube', { youtube: 'YouTube' }),
    ).toBe('YouTube');
  });

  it('returns empty when there is nothing to show', () => {
    expect(cookbookSourceLabel(undefined, 'unknown', {})).toBe('');
    expect(cookbookSourceLabel('   ', undefined, {})).toBe('');
  });
});

describe('buildCookbookHtml', () => {
  const mapped = toCookbookHtmlRecipe(dummyRecipe, {
    language: 'en',
    measurementSystem: 'original',
    imageDataUri: 'data:image/jpeg;base64,abc',
    servingsLabel: '2 servings',
    durationMin: 'min',
    durationHr: 'hr',
    platformLabels: { tiktok: 'TikTok' },
  });

  it('escapes the cover title and recipe text', () => {
    const html = buildCookbookHtml({
      title: '<b>Unsafe</b>',
      recipes: [{ ...mapped, title: 'Pasta & "garlic"', instructions: [{ step: 1, text: '<boil>' }] }],
      language: 'en',
      rtl: false,
      pageSize: 'a4',
      copy,
    });

    expect(html).toContain('&lt;b&gt;Unsafe&lt;/b&gt;');
    expect(html).toContain('Pasta &amp; &quot;garlic&quot;');
    expect(html).toContain('&lt;boil&gt;');
    expect(html).not.toContain('<b>Unsafe</b>');
  });

  it('starts each recipe on a new page and uses A4', () => {
    const html = buildCookbookHtml({
      title: 'My cookbook',
      recipes: [mapped],
      language: 'en',
      rtl: false,
      pageSize: 'a4',
      copy,
    });

    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('page-break-after: always');
    expect(html).toContain('page-break-before: always');
    expect(html).toContain('data-cookbook-page="cover"');
    expect(html).toContain('data-cookbook-page="recipe"');
    expect(html).toContain('tiktok.com');
    expect(html).toContain('data:image/jpeg;base64,abc');
    expect(html).toContain('family=Roboto');
    expect(html).toContain('font-family: "Roboto"');
  });

  it('sets RTL dir and uses a placeholder when the image is missing', () => {
    const html = buildCookbookHtml({
      title: 'ספר',
      recipes: [{ ...mapped, imageDataUri: null, source: '' }],
      language: 'he',
      rtl: true,
      pageSize: 'letter',
      copy,
    });

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="he"');
    expect(html).toContain('@page { size: letter;');
    expect(html).toContain('data-cookbook-fallback="image"');
    expect(html).not.toContain('data:image/jpeg;base64,abc');
  });
});
