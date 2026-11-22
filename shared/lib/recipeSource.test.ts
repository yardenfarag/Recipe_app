import { describe, expect, it } from 'vitest';

import { recipeSource } from './recipeSource';

describe('recipeSource', () => {
  it('names the platform and the account from a TikTok link', () => {
    expect(recipeSource({ platform: 'tiktok', original_url: 'https://www.tiktok.com/@lazy.chef/video/7312345678901234567' })).toEqual({
      platform: 'tiktok',
      name: 'TikTok',
      handle: '@lazy.chef',
    });
  });

  it('works out the platform from the link when the recipe has none stored', () => {
    expect(recipeSource({ original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toEqual({
      platform: 'youtube',
      name: 'YouTube',
      handle: null,
    });
  });

  it('shows a website by its address, without www', () => {
    expect(recipeSource({ platform: 'web', original_url: 'https://www.smittenkitchen.com/2020/01/soup/' })).toEqual({
      platform: 'web',
      name: 'smittenkitchen.com',
      handle: null,
    });
  });

  it('knows a photo has no name of its own', () => {
    expect(recipeSource({ platform: 'photo' })).toEqual({ platform: 'photo', name: null, handle: null });
  });

  it('has nothing for a written or guessed recipe, or one with no link', () => {
    expect(recipeSource({ extraction_source: 'manual' })).toBeNull();
    expect(recipeSource({ extraction_source: 'invented', original_url: 'https://www.tiktok.com/@a/video/1' })).toBeNull();
    expect(recipeSource({})).toBeNull();
  });

  it('survives a link that is not an address', () => {
    expect(recipeSource({ platform: 'instagram', original_url: 'not a url' })).toEqual({ platform: 'instagram', name: 'Instagram', handle: null });
  });
});
