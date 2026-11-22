import { describe, expect, it } from 'vitest';

import { hubCardDetail, HUB_PLATFORMS, platformLabelKey } from './hubCards';
import type { RecipeCard } from '../types/recipeCard';

const t = ((key: string, options?: { count?: number }) =>
  options?.count != null ? `${key}:${options.count}` : key) as never;

describe('platformLabelKey', () => {
  it('has a label for every source filter', () => {
    expect(HUB_PLATFORMS.map(platformLabelKey)).toEqual([
      'hub.platformAll',
      'hub.platformYoutube',
      'hub.platformInstagram',
      'hub.platformTiktok',
      'hub.platformFacebook',
      'hub.platformWeb',
    ]);
  });
});

describe('hubCardDetail', () => {
  it('names the source and how many people saved it', () => {
    const card = { platform: 'youtube', save_count: 3 } as RecipeCard;
    expect(hubCardDetail(card, t)).toBe('hub.platformYoutube · hub.saveCountOther:3');
  });

  it('uses the singular for one save', () => {
    const card = { platform: 'web', save_count: 1 } as RecipeCard;
    expect(hubCardDetail(card, t)).toBe('hub.platformWeb · hub.saveCountOne:1');
  });
});
