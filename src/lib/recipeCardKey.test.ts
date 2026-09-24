import { describe, expect, it } from 'vitest';

import { canPublishHubRecipe, recipeCardCanonicalKey } from '@/lib/recipeCardKey';

describe('recipeCardCanonicalKey', () => {
  it('keys YouTube by video id across URL shapes', () => {
    expect(
      recipeCardCanonicalKey('youtube', 'https://youtu.be/dQw4w9WgXcQ?si=abc'),
    ).toBe('youtube:dQw4w9WgXcQ');
    expect(
      recipeCardCanonicalKey('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('youtube:dQw4w9WgXcQ');
  });

  it('keys Instagram by shortcode', () => {
    expect(
      recipeCardCanonicalKey('instagram', 'https://www.instagram.com/reel/CigMSGeD4Hd/'),
    ).toBe('instagram:CigMSGeD4Hd');
  });

  it('keys TikTok by numeric id and ignores short links without an id', () => {
    expect(
      recipeCardCanonicalKey(
        'tiktok',
        'https://www.tiktok.com/@chef/video/1234567890123456789',
      ),
    ).toBe('tiktok:1234567890123456789');
    expect(recipeCardCanonicalKey('tiktok', 'https://vm.tiktok.com/ZMabcde/')).toBeNull();
    expect(
      recipeCardCanonicalKey('tiktok', 'https://vm.tiktok.com/ZMabcde/', '1234567890123456789'),
    ).toBe('tiktok:1234567890123456789');
  });

  it('strips tracking params from web URLs', () => {
    expect(
      recipeCardCanonicalKey(
        'web',
        'https://www.example.com/soup/?utm_source=ig&fbclid=1',
      ),
    ).toBe('web:https://example.com/soup');
  });
});

describe('canPublishHubRecipe', () => {
  const full = {
    title: 'Pasta',
    original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'youtube',
    extraction_status: 'full',
    extraction_source: 'description',
    ingredients: [{ name: 'pasta' }, { name: 'salt' }],
    instructions: [{ step: 1, text: 'Boil' }, { step: 2, text: 'Salt' }],
  };

  it('accepts a full public-link extract', () => {
    expect(canPublishHubRecipe(full)).toBe(true);
  });

  it('rejects invented, photo, partial, and thin cards', () => {
    expect(canPublishHubRecipe({ ...full, extraction_source: 'invented' })).toBe(false);
    expect(canPublishHubRecipe({ ...full, extraction_source: 'photo', platform: 'photo' })).toBe(
      false,
    );
    expect(canPublishHubRecipe({ ...full, extraction_status: 'partial' })).toBe(false);
    expect(canPublishHubRecipe({ ...full, ingredients: [{ name: 'pasta' }] })).toBe(false);
    expect(canPublishHubRecipe({ ...full, title: '  ' })).toBe(false);
  });
});
