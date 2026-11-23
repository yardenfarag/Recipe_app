import { describe, expect, it } from 'vitest';

import { fontFor, scriptForLanguage, tracking, usesCapitals, variantStyle } from './typography';

describe('fontFor', () => {
  it('gives one family per weight in Latin script', () => {
    expect(fontFor('body', 'regular', 'en')).toEqual({ fontFamily: 'Inter_400Regular' });
    expect(fontFor('body', 'semibold', 'es')).toEqual({ fontFamily: 'Inter_600SemiBold' });
    expect(fontFor('display', 'bold', 'en')).toEqual({ fontFamily: 'SpaceGrotesk_700Bold' });
    expect(fontFor('display', 'semibold', 'en')).toEqual({ fontFamily: 'SpaceGrotesk_600SemiBold' });
  });

  it('uses Space Grotesk medium for regular display text (400 is not loaded)', () => {
    expect(fontFor('display', 'regular', 'en')).toEqual({ fontFamily: 'SpaceGrotesk_500Medium' });
  });

  it('sets Russian display text in Inter (Space Grotesk has no Cyrillic)', () => {
    expect(fontFor('display', 'bold', 'ru')).toEqual({ fontFamily: 'Inter_700Bold' });
    expect(fontFor('body', 'medium', 'ru')).toEqual({ fontFamily: 'Inter_500Medium' });
  });

  it('uses the system font with a weight in Hebrew and Arabic', () => {
    expect(fontFor('display', 'bold', 'he')).toEqual({ fontWeight: '700' });
    expect(fontFor('body', 'regular', 'ar')).toEqual({ fontWeight: '400' });
    expect(fontFor('body', 'semibold', 'he')).toEqual({ fontWeight: '600' });
  });

  it('treats a missing language as English', () => {
    expect(scriptForLanguage(undefined)).toBe('latin');
    expect(fontFor('display', 'bold', null)).toEqual({ fontFamily: 'SpaceGrotesk_700Bold' });
  });
});

describe('tracking and capitals', () => {
  it('turns em into px', () => {
    expect(tracking(-0.015, 30, 'en')).toBe(-0.45);
    expect(tracking(0.06, 12, 'ru')).toBe(0.72);
  });

  it('drops tracking and capitals in Hebrew and Arabic', () => {
    expect(tracking(-0.015, 30, 'he')).toBe(0);
    expect(tracking(0.06, 12, 'ar')).toBe(0);
    expect(usesCapitals('he')).toBe(false);
    expect(usesCapitals('ar')).toBe(false);
    expect(usesCapitals('ru')).toBe(true);
    expect(usesCapitals('en')).toBe(true);
  });
});

describe('variantStyle', () => {
  it('styles a heading', () => {
    expect(variantStyle('h1', 'en')).toEqual({
      fontFamily: 'SpaceGrotesk_700Bold',
      fontSize: 30,
      lineHeight: 34,
      letterSpacing: -0.45,
    });
  });

  it('puts labels in capitals only where the script has them', () => {
    expect(variantStyle('label', 'en').textTransform).toBe('uppercase');
    expect(variantStyle('label', 'he').textTransform).toBeUndefined();
  });

  it('gives Hebrew and Arabic lines more height', () => {
    expect(variantStyle('body', 'he').lineHeight).toBeGreaterThan(variantStyle('body', 'en').lineHeight);
  });

  it('takes a weight override', () => {
    expect(variantStyle('body', 'en', 'semibold').fontFamily).toBe('Inter_600SemiBold');
  });
});
