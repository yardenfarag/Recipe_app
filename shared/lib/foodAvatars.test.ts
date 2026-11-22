import { describe, expect, it } from 'vitest';

import en from '../i18n/locales/en';
import {
  FOOD_AVATAR_IDS,
  foodAvatarDataUri,
  foodAvatarIdFrom,
  foodAvatarSvg,
  foodAvatarValue,
  isFoodAvatarValue,
} from './foodAvatars';

describe('food avatars', () => {
  it('round-trips every avatar through the stored value', () => {
    for (const id of FOOD_AVATAR_IDS) {
      expect(foodAvatarIdFrom(foodAvatarValue(id))).toBe(id);
    }
  });

  it('leaves photos, nothing and unknown ids alone', () => {
    expect(foodAvatarIdFrom('https://example.supabase.co/storage/v1/object/public/avatars/a.jpg')).toBeNull();
    expect(foodAvatarIdFrom(null)).toBeNull();
    expect(foodAvatarIdFrom(undefined)).toBeNull();
    expect(foodAvatarIdFrom('food:lasagna')).toBeNull();
    expect(foodAvatarIdFrom('food:')).toBeNull();
  });

  it('knows a food value from a newer version is still not a URL', () => {
    expect(isFoodAvatarValue('food:lasagna')).toBe(true);
    expect(isFoodAvatarValue('https://example.com/food:pizza.png')).toBe(false);
    expect(isFoodAvatarValue(null)).toBe(false);
  });

  it('draws each avatar as a square SVG', () => {
    for (const id of FOOD_AVATAR_IDS) {
      const svg = foodAvatarSvg(id);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(foodAvatarDataUri(id).startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    }
  });

  it('has a name for every avatar', () => {
    expect(Object.keys(en.settings.foodAvatarNames).sort()).toEqual([...FOOD_AVATAR_IDS].sort());
  });
});
