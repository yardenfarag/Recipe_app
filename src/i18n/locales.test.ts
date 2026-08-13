import { describe, expect, it } from 'vitest';

import ar from '@/i18n/locales/ar';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';
import he from '@/i18n/locales/he';
import ru from '@/i18n/locales/ru';

function flatten(
  value: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      result[path] = child;
    } else if (child && typeof child === 'object') {
      Object.assign(result, flatten(child as Record<string, unknown>, path));
    }
  }
  return result;
}

function interpolationKeys(value: string): string[] {
  return [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort();
}

describe('locale contracts', () => {
  const english = flatten(en);
  const locales = { es: flatten(es), he: flatten(he), ru: flatten(ru), ar: flatten(ar) };

  it.each(Object.entries(locales))('%s has the same translation keys', (_name, locale) => {
    expect(Object.keys(locale).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(Object.entries(locales))('%s keeps interpolation variables aligned', (_name, locale) => {
    const mismatches: string[] = [];
    for (const [key, englishValue] of Object.entries(english)) {
      if (
        JSON.stringify(interpolationKeys(locale[key])) !==
        JSON.stringify(interpolationKeys(englishValue))
      ) {
        mismatches.push(key);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
