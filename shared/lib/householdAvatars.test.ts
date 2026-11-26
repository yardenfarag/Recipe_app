import { describe, expect, it } from 'vitest';

import en from '../i18n/locales/en';
import { FOOD_AVATAR_IDS } from './foodAvatars';
import {
  HOUSEHOLD_AVATAR_IDS,
  householdAvatarBackground,
  householdAvatarDataUri,
  householdAvatarIdFrom,
  householdAvatarSvg,
  householdAvatarValue,
  isHouseholdAvatarValue,
  suggestHouseholdAvatar,
} from './householdAvatars';

describe('household avatars', () => {
  it('has the twelve pictures the apps know', () => {
    expect([...HOUSEHOLD_AVATAR_IDS]).toEqual([
      'soup',
      'picnic',
      'challah',
      'teapot',
      'pie',
      'cheese',
      'honey',
      'bread',
      'tagine',
      'cake',
      'salad',
      'pancakes',
    ]);
  });

  it('round-trips every picture through the stored value', () => {
    for (const id of HOUSEHOLD_AVATAR_IDS) {
      expect(householdAvatarValue(id)).toBe(`house:${id}`);
      expect(householdAvatarIdFrom(householdAvatarValue(id))).toBe(id);
    }
  });

  it('leaves nothing, unknown ids and personal avatars alone', () => {
    expect(householdAvatarIdFrom(null)).toBeNull();
    expect(householdAvatarIdFrom(undefined)).toBeNull();
    expect(householdAvatarIdFrom('house:castle')).toBeNull();
    expect(householdAvatarIdFrom('house:')).toBeNull();
    expect(householdAvatarIdFrom('food:pizza')).toBeNull();
    expect(isHouseholdAvatarValue('house:castle')).toBe(true);
    expect(isHouseholdAvatarValue('food:pizza')).toBe(false);
  });

  it('never shares an id with a personal avatar', () => {
    for (const id of HOUSEHOLD_AVATAR_IDS) expect(FOOD_AVATAR_IDS as readonly string[]).not.toContain(id);
  });

  it('draws each picture as a rounded-square SVG with a house behind the dish', () => {
    for (const id of HOUSEHOLD_AVATAR_IDS) {
      const svg = householdAvatarSvg(id);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">')).toBe(true);
      expect(svg).toContain(`<rect width="100" height="100" rx="26" fill="${householdAvatarBackground(id)}"/>`);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(householdAvatarDataUri(id).startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    }
  });

  it('gives each picture its own background', () => {
    const backgrounds = HOUSEHOLD_AVATAR_IDS.map(householdAvatarBackground);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });

  it('suggests the same picture for the same seed', () => {
    expect(suggestHouseholdAvatar('abc')).toBe(suggestHouseholdAvatar('abc'));
    expect(HOUSEHOLD_AVATAR_IDS).toContain(suggestHouseholdAvatar(''));
  });

  it('has a name for every picture', () => {
    expect(Object.keys(en.household.avatars).sort()).toEqual([...HOUSEHOLD_AVATAR_IDS].sort());
  });
});
